import express from 'express';
import { dbQuery } from '../database.js';
import { put, get } from '@vercel/blob';
import { saveSessionValue } from '../services/aiService.js';

const router = express.Router();

// Helper to get formatted filename for Vercel Blob
const getFormulaBlobFileName = (item, idx, extension) => {
  const cleanTitle = (item.title || '')
    .trim()
    .replace(/[^a-zA-Z0-9가-힣]/g, '_') // Replace spaces/special chars with underscores
    .replace(/_+/g, '_') // Replace multiple underscores
    .substring(0, 30); // Limit to 30 chars

  const idPart = item.id || Date.now();
  return `formulas/${idPart}_${cleanTitle || 'image'}_${idx}.${extension}`;
};

// GET /api/session/images
router.get('/session/images', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const rows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['formula_images']);
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      const formulaImages = Array.isArray(parsed) ? parsed : (parsed.formulaImages || []);

      // Check if migration is needed (has raw base64 data)
      const needsMigration = formulaImages.some(item =>
        (item.base64Images || []).some(imgStr => imgStr && imgStr.startsWith('data:image/'))
      );

      // Helper to map Vercel Blob URLs to our proxy URLs
      const mapToProxy = (items) => {
        return items.map(item => {
          const base64List = item.base64Images || (item.base64Image ? [item.base64Image] : []);
          const mappedUrls = base64List.map(url => {
            if (url && url.includes('blob.vercel-storage.com') && !url.includes('/images/proxy')) {
              return `/api/session/images/proxy?url=${encodeURIComponent(url)}`;
            }
            return url;
          });
          return {
            ...item,
            base64Images: mappedUrls,
            base64Image: mappedUrls[0] || null
          };
        });
      };

      if (needsMigration && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)) {
        console.log('[Self-Healing] Migrating formula base64 images to Vercel Blob URLs...');
        const processedImages = await Promise.all(formulaImages.map(async (item) => {
          const base64List = item.base64Images || (item.base64Image ? [item.base64Image] : []);
          const uploadedUrls = await Promise.all(base64List.map(async (imgStr, idx) => {
            if (imgStr && imgStr.startsWith('/api/session/images/proxy')) {
              const queryStr = imgStr.split('proxy?')[1];
              const urlParams = new URLSearchParams(queryStr);
              return urlParams.get('url') || imgStr;
            }

            if (imgStr && imgStr.startsWith('data:image/')) {
              const match = imgStr.match(/^data:(image\/[^;]+);base64,(.+)$/);
              if (match) {
                const mimeType = match[1];
                const base64Data = match[2];
                const buffer = Buffer.from(base64Data, 'base64');
                const extension = mimeType.split('/')[1] || 'png';
                const fileName = getFormulaBlobFileName(item, idx, extension);
                try {
                  const blob = await put(fileName, buffer, { access: 'public' });
                  return blob.url;
                } catch (uploadErr) {
                  console.error(`[Self-Healing] Upload failed: ${uploadErr.message}`);
                  return imgStr;
                }
              }
            }
            return imgStr;
          }));

          return {
            ...item,
            base64Images: uploadedUrls,
            base64Image: uploadedUrls[0] || null
          };
        }));

        const migratedValue = JSON.stringify({ formulaImages: processedImages });
        await saveSessionValue('formula_images', migratedValue);
        console.log('[Self-Healing] Formula images successfully migrated and database updated!');
        res.json({ data: { formulaImages: mapToProxy(processedImages) } });
      } else {
        res.json({ data: { formulaImages: mapToProxy(formulaImages) } });
      }
    } else {
      res.json({ data: { formulaImages: [] } });
    }
  } catch (err) {
    console.error('GET /api/session/images error:', err);
    res.json({ data: { formulaImages: [] } });
  }
});

// GET /api/session/images/proxy
router.get('/session/images/proxy', async (req, res) => {
  try {
    let imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).send('Missing url parameter');
    }
    // Clean spaces and dollar signs in case of client-side LaTeX pollution in query params
    imageUrl = imageUrl.replace(/\s+/g, '').replace(/\$/g, '').trim();

    // 1. Try standard direct fetch first (works for public blobs or if accessible)
    try {
      const resp = await fetch(imageUrl);
      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || 'image/png';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        const arrayBuffer = await resp.arrayBuffer();
        return res.send(Buffer.from(arrayBuffer));
      }
    } catch (fetchErr) {
      console.warn('[Proxy Warning] Direct fetch failed, trying token:', fetchErr.message);
    }

    // 2. Try fetch with BLOB_READ_WRITE_TOKEN
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const resp = await fetch(imageUrl, {
          headers: {
            'Authorization': `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`
          }
        });
        if (resp.ok) {
          const contentType = resp.headers.get('content-type') || 'image/png';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          const arrayBuffer = await resp.arrayBuffer();
          return res.send(Buffer.from(arrayBuffer));
        }
      } catch (tokenErr) {
        console.warn('[Proxy Warning] Fetch with BLOB_READ_WRITE_TOKEN failed:', tokenErr.message);
      }
    }

    // 3. Try fetch with VERCEL_OIDC_TOKEN
    if (process.env.VERCEL_OIDC_TOKEN) {
      try {
        const resp = await fetch(imageUrl, {
          headers: {
            'Authorization': `Bearer ${process.env.VERCEL_OIDC_TOKEN}`
          }
        });
        if (resp.ok) {
          const contentType = resp.headers.get('content-type') || 'image/png';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          const arrayBuffer = await resp.arrayBuffer();
          return res.send(Buffer.from(arrayBuffer));
        }
      } catch (oidcErr) {
        console.warn('[Proxy Warning] Fetch with VERCEL_OIDC_TOKEN failed:', oidcErr.message);
      }
    }

    // 4. Fallback to @vercel/blob SDK get method as a last resort
    console.log('[Proxy] Falling back to @vercel/blob SDK get method');
    const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN;
    if (!token) {
      console.warn('[Proxy Error] No token available for @vercel/blob SDK get. Redirecting to direct URL as fallback.');
      return res.redirect(imageUrl);
    }

    try {
      const blob = await get(imageUrl, { token, access: 'private' });
      if (blob) {
        const contentType = (blob.headers && typeof blob.headers.get === 'function' ? blob.headers.get('content-type') : null) || 'image/png';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');

        const stream = blob.stream || blob.body;
        if (stream && typeof stream.pipe === 'function') {
          return stream.pipe(res);
        } else if (stream) {
          const arrayBuffer = await new Response(stream).arrayBuffer();
          return res.send(Buffer.from(arrayBuffer));
        }
      }
    } catch (sdkErr) {
      console.error('[Proxy Error] SDK get failed:', sdkErr.message);
    }

    // Ultimate fallback: redirect directly to the Vercel Blob URL
    console.log('[Proxy] Ultimate fallback: redirecting directly to imageUrl');
    return res.redirect(imageUrl);
  } catch (err) {
    console.error('Proxy image error:', err);
    res.status(500).send('Internal server error');
  }
});

// POST /api/session/images
router.post('/session/images', async (req, res) => {
  try {
    const { formulaImages } = req.body;

    const processedImages = await Promise.all((formulaImages || []).map(async (item) => {
      const base64List = item.base64Images || (item.base64Image ? [item.base64Image] : []);
      const uploadedUrls = await Promise.all(base64List.map(async (imgStr, idx) => {
        // Decode proxy URL to canonical Vercel Blob URL if it exists
        if (imgStr && imgStr.startsWith('/api/session/images/proxy')) {
          const queryStr = imgStr.split('proxy?')[1];
          const urlParams = new URLSearchParams(queryStr);
          return urlParams.get('url') || imgStr;
        }

        if (imgStr && imgStr.startsWith('data:image/')) {
          if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
            console.warn('[Upload Warning] No Vercel Blob token configured locally. Storing image as raw base64 data.');
            return imgStr;
          }
          const match = imgStr.match(/^data:(image\/[^;]+);base64,(.+)$/);
          if (match) {
            const mimeType = match[1];
            const base64Data = match[2];
            const buffer = Buffer.from(base64Data, 'base64');
            const extension = mimeType.split('/')[1] || 'png';
            const fileName = getFormulaBlobFileName(item, idx, extension);
            console.log(`Uploading formula image to Vercel Blob: ${fileName}`);
            try {
              const blob = await put(fileName, buffer, { access: 'public' });
              return blob.url;
            } catch (uploadErr) {
              console.error(`[Upload Error] Local Vercel Blob upload failed: ${uploadErr.message}. Falling back to base64.`);
              return imgStr;
            }
          }
        }
        return imgStr;
      }));

      return {
        ...item,
        base64Images: uploadedUrls,
        base64Image: uploadedUrls[0] || null
      };
    }));

    const value = JSON.stringify({ formulaImages: processedImages });
    await saveSessionValue('formula_images', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/images error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
