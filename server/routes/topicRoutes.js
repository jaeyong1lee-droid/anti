import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { put, del } from '@vercel/blob';
import { dbQuery } from '../database.js';
import { getTopicText, saveSessionValue, callLLMWithFailover } from '../services/aiService.js';
import * as fileUtils from '../utils/fileUtils.js';
import * as ocrPlugin from '../plugins/calculationPlugin.js';
import { parseLlmJson } from '../utils/latexUtils.js';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

function isBufferPng(buf) {
  if (!buf || buf.length < 8) return false;
  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
         buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;
}
function isBufferJpeg(buf) {
  if (!buf || buf.length < 3) return false;
  return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
function isBufferGif(buf) {
  if (!buf || buf.length < 4) return false;
  return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
}
function isBufferWebp(buf) {
  if (!buf || buf.length < 12) return false;
  return buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
}

async function generateWeakPointRecommendation(queryDate, isManual = false) {
  const hasAnyAiKey = !!(
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY_SECONDARY ||
    process.env.GEMINI_API_KEY_TERTIARY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY
  );
  if (!hasAnyAiKey) return null;

  if (!isManual) {
    const totalPendingTopics = await dbQuery.get(
      `SELECT COUNT(DISTINCT topic_id) as count FROM schedules 
       WHERE planned_date <= ? AND status = 'pending'`,
      [queryDate]
    );
    if (totalPendingTopics.count > 10) return null;

    const activeWeaknessCount = await dbQuery.get(
      `SELECT COUNT(*) as count FROM schedules 
       WHERE review_round = 99 AND planned_date <= ? AND status = 'pending'`,
      [queryDate]
    );
    if (activeWeaknessCount.count >= 3) return null;
  }

  const excludedRows = await dbQuery.all(
    `SELECT DISTINCT topic_id FROM schedules 
     WHERE (status = 'pending' AND planned_date <= ?) 
        OR (review_round = 99 AND planned_date = ? AND (status = 'completed' OR status = 'failed'))`,
    [queryDate, queryDate]
  );
  const excludedTopicIds = excludedRows.map(r => r.topic_id);

  const scoreHistory = await dbQuery.all(
    `SELECT topic_id, AVG(score) as avg_score
     FROM schedules
     WHERE (status = 'completed' OR status = 'failed') AND score IS NOT NULL
     GROUP BY topic_id
     HAVING AVG(score) <= 90
     ORDER BY avg_score ASC`
  );

  let candidates = scoreHistory.filter(h => !excludedTopicIds.includes(h.topic_id));
  if (candidates.length === 0) return null;

  const selectedCandidate = candidates[Math.floor(Math.random() * candidates.length)];
  const topic = await dbQuery.get('SELECT id, title, keywords, pdf_name, category FROM topics WHERE id = ?', [selectedCandidate.topic_id]);
  if (topic) {
    const existingBonus = await dbQuery.get(
      `SELECT id FROM schedules WHERE topic_id = ? AND review_round = 99 AND planned_date = ?`,
      [topic.id, queryDate]
    );

    let scheduleId;
    const scoreVal = Math.round(selectedCandidate.avg_score * 10) / 10;
    if (existingBonus) {
      scheduleId = existingBonus.id;
      await dbQuery.run(
        `UPDATE schedules SET status = 'pending', completed_at = NULL, score = ? WHERE id = ?`,
        [scoreVal, scheduleId]
      );
    } else {
      const insertRes = await dbQuery.run(
        `INSERT INTO schedules (topic_id, review_round, planned_date, status, score)
         VALUES (?, 99, ?, 'pending', ?)`,
        [topic.id, queryDate, scoreVal]
      );
      scheduleId = insertRes.id;
    }

    return {
      schedule_id: scheduleId,
      topic_id: topic.id,
      title: topic.title,
      keywords: topic.keywords,
      pdf_name: topic.pdf_name,
      review_round: 99,
      planned_date: queryDate,
      status: 'pending',
      completed_at: null,
      score: scoreVal,
      isBonus: true,
      category: topic.category || '?쇰컲'
    };
  }
  return null;
}

// GET /api/topics -> List all topics with schedule statuses
router.get('/topics', async (req, res) => {
  try {
    const sql = `
      SELECT t.id, t.title, t.keywords, t.pdf_name, t.created_at, t.category,
             COALESCE((SELECT MAX(completed_at) FROM schedules WHERE topic_id = t.id AND completed_at IS NOT NULL), t.created_at) AS last_active
      FROM topics t
      ORDER BY t.id ASC
    `;
    const topics = await dbQuery.all(sql);

    if (!topics || topics.length === 0) {
      return res.json([]);
    }

    const topicIds = topics.map(t => t.id);

    // Batch query all schedules for all topics in one shot (replaces N+1 query)
    const placeholders = topicIds.map(() => '?').join(',');
    const allSchedules = await dbQuery.all(
      `SELECT s.id, s.topic_id, s.review_round, s.planned_date, s.completed_at, s.status, s.score, s.correct_count, s.total_count,
              CASE WHEN a.key IS NOT NULL THEN 1 ELSE 0 END AS has_session
       FROM schedules s
       LEFT JOIN app_session a ON a.key = 'completed_review_schedule_' || s.id
       WHERE s.topic_id IN (${placeholders})
       ORDER BY s.topic_id ASC, s.review_round ASC`,
      topicIds
    );

    // Group schedules by topic_id
    const schedulesByTopic = {};
    for (const s of allSchedules) {
      if (!schedulesByTopic[s.topic_id]) {
        schedulesByTopic[s.topic_id] = [];
      }
      schedulesByTopic[s.topic_id].push(s);
    }

    const topicsWithSchedules = topics.map(topic => ({
      ...topic,
      schedules: schedulesByTopic[topic.id] || []
    }));

    res.json(topicsWithSchedules);
  } catch (error) {
    console.error('Error fetching all topics:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡??좏뵿 紐⑸줉??議고쉶?섏? 紐삵뻽?듬땲??', details: error.message, stack: error.stack });
  }
});

// POST /api/topics -> Create a new topic with file upload
router.post('/topics', upload.single('pdf'), async (req, res) => {
  const { title, keywords, baseDate, category } = req.body;
  if (!title) {
    return res.status(400).json({ error: '?좏뵿 ?쒕ぉ? ?꾩닔 ?낅젰 ??ぉ?낅땲??' });
  }

  try {
    let pdfName = req.body.fileNameUtf8 || (req.file ? req.file.originalname : null);
    let pdfData = req.file ? req.file.buffer : null;

    if (!req.body.fileNameUtf8 && req.file) {
      const name = req.file.originalname;
      if (/[媛-??/.test(name)) {
        pdfName = name;
      } else {
        try {
          const decoded = Buffer.from(name, 'latin1').toString('utf-8');
          pdfName = /[媛-??/.test(decoded) ? decoded : name;
        } catch (e) {
          pdfName = name;
        }
      }
    }

    if (req.file) {
      const fileOrigNameLower = req.file.originalname.toLowerCase();
      const pdfNameLower = pdfName ? pdfName.toLowerCase() : '';
      const isHtml = fileOrigNameLower.endsWith('.html') || 
                     fileOrigNameLower.endsWith('.htm') || 
                     req.file.mimetype === 'text/html' || 
                     pdfNameLower.endsWith('.html') || 
                     pdfNameLower.endsWith('.htm') ||
                     fileUtils.isBufferHtml(req.file.buffer);
      if (isHtml) {
        console.log(`HTML file upload detected: ${pdfName}. Keeping raw HTML content.`);
        pdfData = req.file.buffer;
      }
    }

    let createdDate = new Date();
    if (baseDate) {
      const parts = baseDate.split('-');
      if (parts.length === 3) {
        createdDate = new Date(
          parseInt(parts[0], 10), 
          parseInt(parts[1], 10) - 1, 
          parseInt(parts[2], 10)
        );
      }
    }
    const dbDateStr = createdDate.toISOString().slice(0, 19).replace('T', ' ');

    let extractedText = '';
    if (pdfData) {
      const isHtml = pdfName.toLowerCase().endsWith('.html') || 
                     pdfName.toLowerCase().endsWith('.htm') ||
                     fileUtils.isBufferHtml(pdfData);
      try {
        if (isHtml) {
          extractedText = fileUtils.htmlToPlainText(fileUtils.decodeHtmlBuffer(pdfData));
        } else {
          const parsed = await pdfParse(pdfData);
          extractedText = parsed.text || '';
        }
        extractedText = fileUtils.mergeVerticalText(extractedText);
        console.log(`Successfully pre-extracted ${extractedText.length} chars of text for uploaded topic: ${title}`);
      } catch (parseErr) {
        console.warn(`Failed to pre-extract text from PDF/HTML on upload for topic: ${title}`, parseErr.message);
      }
    }

    let pdfUrl = null;
    let dbPdfData = pdfData;

    if (pdfData && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)) {
      try {
        const mimeType = req.file ? req.file.mimetype : (pdfName.toLowerCase().endsWith('.html') ? 'text/html' : 'application/pdf');
        const blob = await put(`topics/${Date.now()}_${pdfName}`, pdfData, {
          access: 'private',
          contentType: mimeType,
        });
        pdfUrl = blob.url;
        dbPdfData = null;
        console.log(`Successfully uploaded binary file to Vercel Blob: ${pdfUrl}`);
      } catch (blobErr) {
        console.error('Failed to upload topic binary to Vercel Blob, falling back to database storage:', blobErr);
      }
    }

    const insertTopicSql = `
      INSERT INTO topics (title, keywords, pdf_name, pdf_data, pdf_url, extracted_text, created_at, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const topicResult = await dbQuery.run(insertTopicSql, [
      title,
      keywords || '',
      pdfName,
      dbPdfData,
      pdfUrl,
      extractedText,
      dbDateStr,
      category || '?쇰컲'
    ]);

    const topicId = topicResult.id;
    const firstInterval = 1;
    const insertScheduleSql = `
      INSERT INTO schedules (topic_id, review_round, planned_date, status)
      VALUES (?, 1, ?, 'pending')
    `;
    const plannedDate = fileUtils.getLocalDateString(createdDate, firstInterval);
    await dbQuery.run(insertScheduleSql, [topicId, plannedDate]);

    res.status(201).json({
      message: '?좏뵿 ?깅줉 諛?蹂듭뒿 ?ㅼ?以??앹꽦???꾨즺?섏뿀?듬땲??',
      topicId: topicId,
      title: title,
      keywords: keywords,
      schedulesCreated: 1
    });
  } catch (error) {
    console.error('Error registering topic:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡??좏뵿 ?깅줉???ㅽ뙣?덉뒿?덈떎.' });
  }
});

// POST /api/topics/:id/replace-source -> Replace file source
router.post('/topics/:id/replace-source', upload.single('pdf'), async (req, res) => {
  const topicId = req.params.id;
  try {
    let pdfName = req.body.fileNameUtf8 || (req.file ? req.file.originalname : null);
    let pdfData = req.file ? req.file.buffer : null;

    if (!req.body.fileNameUtf8 && req.file) {
      const name = req.file.originalname;
      if (/[媛-??/.test(name)) {
        pdfName = name;
      } else {
        try {
          const decoded = Buffer.from(name, 'latin1').toString('utf-8');
          pdfName = /[媛-??/.test(decoded) ? decoded : name;
        } catch (e) {
          pdfName = name;
        }
      }
    }

    if (req.file) {
      const fileOrigNameLower = req.file.originalname.toLowerCase();
      const pdfNameLower = pdfName ? pdfName.toLowerCase() : '';
      const isHtml = fileOrigNameLower.endsWith('.html') || 
                     fileOrigNameLower.endsWith('.htm') || 
                     req.file.mimetype === 'text/html' || 
                     pdfNameLower.endsWith('.html') || 
                     pdfNameLower.endsWith('.htm') ||
                     fileUtils.isBufferHtml(req.file.buffer);
      if (isHtml) {
        pdfData = req.file.buffer;
      }
    }

    let oldPdfUrl = null;
    try {
      const row = await dbQuery.get('SELECT pdf_url FROM topics WHERE id = ?', [topicId]);
      if (row && row.pdf_url) oldPdfUrl = row.pdf_url;
    } catch (e) {
      console.warn('Failed to query old pdf_url during replace-source:', e);
    }

    let pdfUrl = null;
    let dbPdfData = pdfData;

    if (pdfData && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)) {
      try {
        const mimeType = req.file ? req.file.mimetype : (pdfName.toLowerCase().endsWith('.html') ? 'text/html' : 'application/pdf');
        const blob = await put(`topics/${Date.now()}_${pdfName}`, pdfData, {
          access: 'private',
          contentType: mimeType,
        });
        pdfUrl = blob.url;
        dbPdfData = null;
        console.log(`Successfully uploaded binary file to Vercel Blob for replace-source: ${pdfUrl}`);

        if (oldPdfUrl) {
          try {
            await del(oldPdfUrl);
            console.log(`Successfully deleted old Vercel Blob file: ${oldPdfUrl}`);
          } catch (delErr) {
            console.warn(`Failed to delete old Vercel Blob file: ${oldPdfUrl}`, delErr);
          }
        }
      } catch (blobErr) {
        console.error('Failed to upload topic binary to Vercel Blob during replace-source, falling back to database:', blobErr);
      }
    }

    const updateSql = `
      UPDATE topics 
      SET pdf_name = ?, pdf_data = ?, pdf_url = ?
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [pdfName, dbPdfData, pdfUrl, topicId]);

    // Clear extracted text cache
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', [`topic_extracted_text_${topicId}`]);
    res.json({ success: true, message: '?뚯뒪 ?먮즺媛 ?깃났?곸쑝濡?援먯껜?섏뿀?듬땲??' });
  } catch (error) {
    console.error('Error replacing topic source:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡??뚯뒪 ?먮즺 援먯껜???ㅽ뙣?덉뒿?덈떎.' });
  }
});

// DELETE /api/topics/:id -> Delete a topic
router.delete('/topics/:id', async (req, res) => {
  const topicId = Number(req.params.id) || req.params.id;
  try {
    const checkSql = `SELECT id, title, pdf_url FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(checkSql, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '?대떦 ?좏뵿??李얠쓣 ???놁뒿?덈떎.' });
    }

    if (topic.pdf_url && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)) {
      try {
        await del(topic.pdf_url);
        console.log(`Successfully deleted Vercel Blob file for deleted topic: ${topic.pdf_url}`);
      } catch (delErr) {
        console.warn(`Failed to delete Vercel Blob file for topic ID ${topicId}:`, delErr);
      }
    }

    const deleteSql = `DELETE FROM topics WHERE id = ?`;
    await dbQuery.run(deleteSql, [topicId]);

    res.json({
      message: `?좏뵿 [${topic.title}] 諛?愿??蹂듭뒿 ?쇱젙???덉쟾?섍쾶 ??젣?섏뿀?듬땲??`,
      topicId: topicId
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡??좏뵿 ??젣???ㅽ뙣?덉뒿?덈떎.' });
  }
});

// PUT /api/topics/:id/title -> Update title
router.put('/topics/:id/title', async (req, res) => {
  const topicId = Number(req.params.id) || req.params.id;
  const { title } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: '?쒕ぉ? ?꾩닔?낅땲??' });
  }

  try {
    const checkSql = `SELECT id, title FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(checkSql, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '?대떦 ?좏뵿??李얠쓣 ???놁뒿?덈떎.' });
    }

    const updateSql = `UPDATE topics SET title = ? WHERE id = ?`;
    await dbQuery.run(updateSql, [title.trim(), topicId]);
    console.log(`[PUT /api/topics/:id/title] Successfully updated title to "${title.trim()}" for topicId=${topicId}`);

    res.json({
      success: true,
      message: '?좏뵿 ?쒕ぉ???깃났?곸쑝濡??섏젙?섏뿀?듬땲??'
    });
  } catch (error) {
    console.error('Error updating topic title:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡??좏뵿 ?쒕ぉ ?섏젙???ㅽ뙣?덉뒿?덈떎.' });
  }
});

// GET /api/topics/:id/text -> Retrieve text
router.get('/topics/:id/text', async (req, res) => {
  const topicId = req.params.id;
  try {
    const topicSql = `SELECT id, title, keywords, pdf_name, category, pdf_url, extracted_text FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(topicSql, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '?좏뵿??李얠쓣 ???놁뒿?덈떎.' });
    }

    const fileText = await getTopicText(topic, fileUtils, ocrPlugin, pdfParse);
    res.json({
      id: topic.id,
      title: topic.title,
      pdf_name: topic.pdf_name,
      text: fileText || '蹂닿퀬???댁슜??鍮꾩뼱 ?덇굅??異붿텧???띿뒪?멸? ?놁뒿?덈떎.'
    });
  } catch (error) {
    console.error('Error fetching topic text:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡?蹂닿퀬???꾨Ц??遺덈윭?ㅼ? 紐삵뻽?듬땲??' });
  }
});

// GET /api/topics/:id/html-raw -> Retrieve raw HTML code
router.get('/topics/:id/html-raw', async (req, res) => {
  const topicId = req.params.id;
  try {
    const topic = await dbQuery.get(`SELECT pdf_name, pdf_data, pdf_url FROM topics WHERE id = ?`, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '泥⑤???HTML ?먮낯 ?뚯씪??李얠쓣 ???놁뒿?덈떎.' });
    }
    let pdfData = topic.pdf_data;
    if (topic.pdf_url && (!pdfData || pdfData.length === 0)) {
      try {
        const headers = {};
        if (process.env.BLOB_READ_WRITE_TOKEN) {
          headers['Authorization'] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
        }
        const response = await fetch(topic.pdf_url, { headers });
        if (!response.ok) {
          throw new Error(`Blob fetch failed with status: ${response.status}`);
        }
        pdfData = Buffer.from(await response.arrayBuffer());
      } catch (fetchErr) {
        console.error(`Failed to lazy load html-raw from URL: ${topic.pdf_url}`, fetchErr);
      }
    }
    if (!pdfData || pdfData.length === 0) {
      return res.status(404).json({ error: '泥⑤???HTML ?먮낯 ?뚯씪??李얠쓣 ???놁뒿?덈떎.' });
    }
    const html = fileUtils.decodeHtmlBuffer(pdfData);
    res.json({ success: true, html });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/topics/:id/html-raw -> Edit raw HTML
router.put('/topics/:id/html-raw', async (req, res) => {
  const topicId = req.params.id;
  const { html } = req.body;
  if (typeof html !== 'string') {
    return res.status(400).json({ error: 'html 肄붾뱶???꾩닔 臾몄옄?댁엯?덈떎.' });
  }
  try {
    const topic = await dbQuery.get(`SELECT pdf_name, pdf_url FROM topics WHERE id = ?`, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '?좏뵿??李얠쓣 ???놁뒿?덈떎.' });
    }
    const buffer = Buffer.from(html, 'utf-8');
    let pdfUrl = null;
    let dbPdfData = buffer;

    if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
      try {
        const blob = await put(`topics/${Date.now()}_${topic.pdf_name || 'edit.html'}`, buffer, {
          access: 'private',
          contentType: 'text/html',
        });
        pdfUrl = blob.url;
        dbPdfData = null;
        if (topic.pdf_url) {
          try {
            await del(topic.pdf_url);
          } catch (delErr) {
            console.warn(`Failed to delete old Vercel Blob: ${topic.pdf_url}`, delErr);
          }
        }
      } catch (blobErr) {
        console.error('Failed to upload edited HTML to Vercel Blob:', blobErr);
      }
    }

    await dbQuery.run(`UPDATE topics SET pdf_data = ?, pdf_url = ? WHERE id = ?`, [dbPdfData, pdfUrl, topicId]);
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', [`topic_extracted_text_${topicId}`]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/topics/:id/pdf -> Stream PDF or HTML natively
router.get('/topics/:id/pdf', async (req, res) => {
  const topicId = req.params.id;
  try {
    const topicSql = `SELECT pdf_name, pdf_data, pdf_url FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(topicSql, [topicId]);
    if (!topic) {
      return res.status(404).send('泥⑤???PDF/HTML ?먮낯 ?뚯씪??李얠쓣 ???놁뒿?덈떎.');
    }

    let pdfData = topic.pdf_data;
    if (topic.pdf_url && (!pdfData || pdfData.length === 0)) {
      try {
        const headers = {};
        if (process.env.BLOB_READ_WRITE_TOKEN) {
          headers['Authorization'] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
        }
        const response = await fetch(topic.pdf_url, { headers });
        if (!response.ok) throw new Error(`Blob fetch failed with status: ${response.status}`);
        pdfData = Buffer.from(await response.arrayBuffer());
      } catch (fetchErr) {
        console.error(`Failed to lazy load topic buffer: ${topic.pdf_url}`, fetchErr);
      }
    }

    if (!pdfData || pdfData.length === 0) {
      return res.status(404).send('泥⑤???PDF/HTML ?먮낯 ?뚯씪??李얠쓣 ???놁뒿?덈떎.');
    }

    const isImage = isBufferPng(pdfData) || isBufferJpeg(pdfData) || isBufferGif(pdfData) || isBufferWebp(pdfData);
    const isHtml = !isImage && topic.pdf_name && (
      topic.pdf_name.toLowerCase().endsWith('.html') || 
      topic.pdf_name.toLowerCase().endsWith('.htm') || 
      fileUtils.isBufferHtml(pdfData)
    );

    if (isHtml) {
      let htmlContent = fileUtils.decodeHtmlBuffer(pdfData);
      htmlContent = htmlContent.replace(/<script\b[^>]*?src=["']?[^"'>]*?polyfill\.io[^"'>]*?["']?[^>]*?>([\s\S]*?<\/script>)?/gi, '<!-- polyfill removed -->');

      const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">';
      if (htmlContent.includes('<head>')) {
        htmlContent = htmlContent.replace(/<meta\b[^>]*?name=["']viewport["'][^>]*?>/gi, '');
        htmlContent = htmlContent.replace('<head>', `<head>\n${viewportMeta}`);
      } else {
        htmlContent = `${viewportMeta}\n${htmlContent}`;
      }

      if (htmlContent.includes('<body')) {
        const bodyTagMatch = htmlContent.match(/<body\b[^>]*>/i);
        if (bodyTagMatch) {
          const bodyTag = bodyTagMatch[0];
          htmlContent = htmlContent.replace(bodyTag, `${bodyTag}\n<div class="antigravity-scroll-wrapper">`);
          htmlContent = htmlContent.replace('</body>', '</div>\n</body>');
        }
      } else {
        htmlContent = `<div class="antigravity-scroll-wrapper">\n${htmlContent}\n</div>`;
      }
      
      if (req.query.part === 'screenshot') {
        const separator = '<!-- ANTIGRAVITY_SCREENSHOT_END -->';
        if (htmlContent.includes(separator)) {
          htmlContent = htmlContent.split(separator)[0].trim();
        } else {
          const imgRegex = /<img\b[^>]*>/gi;
          const imgs = htmlContent.match(imgRegex) || [];
          if (imgs.length > 0) {
            htmlContent = imgs.map(item => `<div style="text-align: center; margin-bottom: 20px;">${item}</div>`).join('\n');
          }
        }
      }

      const responsiveStyle = `
<style>
html, body {
  background-color: #ffffff !important;
  color: #1e293b !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
  line-height: 1.6 !important;
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  max-width: 100vw !important;
  height: 100% !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
.antigravity-scroll-wrapper {
  width: 100vw !important;
  height: 100vh !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch !important;
  padding: 24px !important;
  box-sizing: border-box !important;
}
h1, h2, h3, h4, h5, h6, th, strong, b {
  color: #0f172a !important;
}
p, span, td, li, div, section, article {
  color: #334155 !important;
}
a {
  color: #0284c7 !important;
  text-decoration: underline !important;
}
table {
  border-collapse: collapse !important;
  width: 100% !important;
  margin: 20px 0 !important;
  background-color: #ffffff !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 8px !important;
  overflow: hidden !important;
}
th {
  background-color: #f1f5f9 !important;
  color: #0f172a !important;
  font-weight: 700 !important;
  border: 1px solid #cbd5e1 !important;
  padding: 12px 16px !important;
}
td {
  border: 1px solid #e2e8f0 !important;
  padding: 12px 16px !important;
}
div, section, article, form, .container, .page, .wrapper, .section, .WordSection1, #page-container, #sidebar, #content {
  background-color: transparent !important;
  border-color: #e2e8f0 !important;
  box-shadow: none !important;
}
::-webkit-scrollbar {
  width: 8px !important;
  height: 8px !important;
}
::-webkit-scrollbar-track {
  background: #f8fafc !important;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1 !important;
  border-radius: 9999px !important;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8 !important;
}
@media (max-width: 768px) {
  html, body {
    padding: 0 !important;
    margin: 0 !important;
    overflow: hidden !important;
    width: 100vw !important;
    height: 100vh !important;
  }
  .antigravity-scroll-wrapper {
    width: 100vw !important;
    height: 100vh !important;
    padding: 0px 4px !important;
    overflow-x: auto !important;
    overflow-y: auto !important;
  }
  *, *:before, *:after {
    box-sizing: border-box !important;
  }
  p, span, td, li, div, section, article, h1, h2, h3, h4, h5, h6 {
    word-break: break-all !important;
    word-wrap: break-word !important;
    white-space: normal !important;
  }
  div, section, article, form, .container, .page, .wrapper, .section, .WordSection1, #page-container, #sidebar, #content {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin: 0 auto !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
    height: auto !important;
  }
  img, svg {
    max-width: 100% !important;
    height: auto !important;
  }
  .katex-display {
    padding: 0.5em 8px !important;
  }
}
</style>
`;
      const trackingScript = `
<script>
(function() {
  function sendActiveId(id) {
    if (!id) return;
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'anti-select-id', id: id }, '*');
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'anti-select-id', id: id }, '*');
      }
    } catch (e) {
      console.warn('[Tracking Script] Failed to send active ID:', e);
    }
  }

  // Track clicks
  document.addEventListener('click', function(e) {
    const elWithId = e.target.closest('[id]');
    if (elWithId) {
      sendActiveId(elWithId.id);
    }
  });

  // Track cursor / selection changes
  let selectionTimeout = null;
  document.addEventListener('selectionchange', function() {
    if (selectionTimeout) clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(function() {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (!range.collapsed) {
          let node = range.commonAncestorContainer;
          if (node.nodeType === Node.TEXT_NODE) {
            node = node.parentNode;
          }
          const elWithId = node.closest('[id]');
          if (elWithId) {
            sendActiveId(elWithId.id);
          }
        }
      }
    }, 200);
  });
})();
</script>
`;
      htmlContent = htmlContent + responsiveStyle + trackingScript;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(htmlContent);
    } else {
      const fileNameLower = (topic.pdf_name || '').toLowerCase();
      let contentType = 'application/pdf';
      if (fileNameLower.endsWith('.png') || isBufferPng(pdfData)) {
        contentType = 'image/png';
      } else if (fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg') || isBufferJpeg(pdfData)) {
        contentType = 'image/jpeg';
      } else if (fileNameLower.endsWith('.gif') || isBufferGif(pdfData)) {
        contentType = 'image/gif';
      } else if (fileNameLower.endsWith('.webp') || isBufferWebp(pdfData)) {
        contentType = 'image/webp';
      } else if (fileNameLower.endsWith('.svg')) {
        contentType = 'image/svg+xml';
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(topic.pdf_name)}"`);
      res.send(pdfData);
    }
  } catch (error) {
    console.error('Error streaming PDF/HTML:', error);
    res.status(500).send('?쒕쾭 ?ㅻ쪟濡??뚯씪???ㅽ듃由щ컢?섏? 紐삵뻽?듬땲??');
  }
});

// GET /api/topics/:id/instructions -> Retrieve instructions
router.get('/topics/:id/instructions', async (req, res) => {
  try {
    const topicId = req.params.id;
    const key = 'topic_instructions_' + topicId;
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = ?", [key]);
    if (row && row.value) {
      const list = JSON.parse(row.value);
      return res.json({ instructions: list });
    }
    res.json({ instructions: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/topics/:id/instructions -> Update instructions
router.post('/topics/:id/instructions', async (req, res) => {
  try {
    const topicId = req.params.id;
    const { instructions } = req.body;
    if (!Array.isArray(instructions)) {
      return res.status(400).json({ error: 'instructions must be an array' });
    }
    const key = 'topic_instructions_' + topicId;
    await saveSessionValue(key, JSON.stringify(instructions));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/heal-schedules -> ?쇨큵 ?쇱젙 ?뺤젙 (留앷컖怨≪꽑 踰꾧렇 ?섏젙??諛??쒖꽌 瑗ъ엫 蹂듦뎄)
router.get('/admin/heal-schedules', async (req, res) => {
  try {
    const healedDetails = [];
    let healedCount = 0;

    // 1. ?쒖꽌 瑗ъ엫(Chronological out-of-order) 蹂듦뎄
    // 紐⑤뱺 ?좏뵿??completed ?쇱젙?ㅼ쓣 媛?몄샂
    const allCompleted = await dbQuery.all(`SELECT * FROM schedules WHERE status = 'completed' AND review_round < 99 ORDER BY topic_id ASC, completed_at ASC`);
    
    // topic_id 湲곗??쇰줈 洹몃９??
    const byTopic = {};
    for (const s of allCompleted) {
      if (!byTopic[s.topic_id]) byTopic[s.topic_id] = [];
      byTopic[s.topic_id].push(s);
    }

    // 媛??좏뵿蹂꾨줈 ?ㅼ젣 ?쒓컙??completed_at)??留욊쾶 review_round ?щ???
    for (const [topicId, schedules] of Object.entries(byTopic)) {
      for (let i = 0; i < schedules.length; i++) {
        const correctRound = i + 1;
        if (schedules[i].review_round !== correctRound) {
          await dbQuery.run(`UPDATE schedules SET review_round = ? WHERE id = ?`, [correctRound, schedules[i].id]);
          healedDetails.push(`Topic ${topicId} Order Fix: id ${schedules[i].id} round ${schedules[i].review_round} -> ${correctRound}`);
          healedCount++;
        }
      }
    }

    // 2. ?湲곗쨷(pending) ?쇱젙??planned_date ?ш퀎??
    const pending = await dbQuery.all(`SELECT * FROM schedules WHERE status = 'pending' AND review_round > 1 AND review_round < 99`);
    
    for (const p of pending) {
      const prev = await dbQuery.get(`SELECT * FROM schedules WHERE topic_id = ? AND review_round = ? AND status = 'completed'`, [p.topic_id, p.review_round - 1]);
      if (prev && prev.completed_at) {
        let days = 0;
        if (prev.review_round === 1) days = 4;
        else if (prev.review_round === 2) days = 7;
        else if (prev.review_round === 3) days = 14;
        else if (prev.review_round === 4) days = 35;
        else if (prev.review_round === 5) days = 60;
        else days = 30;
        
        const expectedDate = fileUtils.getLocalDateString(new Date(prev.completed_at), days);
        if (p.planned_date !== expectedDate) {
          await dbQuery.run(`UPDATE schedules SET planned_date = ? WHERE id = ?`, [expectedDate, p.id]);
          healedDetails.push(`Topic ${p.topic_id} Date Fix: Round ${p.review_round} ${p.planned_date} -> ${expectedDate}`);
          healedCount++;
        }
      }
    }
    res.json({ message: `?깃났?곸쑝濡?${healedCount}嫄댁쓽 ?쇱젙???뺤젙?덉뒿?덈떎.`, details: healedDetails });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// GET /api/dashboard -> Fetch dashboard statistics
router.get('/dashboard', async (req, res) => {
  const queryDate = req.query.date || fileUtils.getLocalDateString();
  try {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const kstHour = kstDate.getUTCHours();
    const todayKstStr = kstDate.toISOString().split('T')[0];

    if (queryDate === todayKstStr && kstHour >= 8) {
      const activeWeaknessCount = await dbQuery.get(
        `SELECT COUNT(*) as count FROM schedules 
         WHERE review_round = 99 AND planned_date <= ? AND status = 'pending'`,
        [todayKstStr]
      );
      if (activeWeaknessCount.count < 3) {
        const existingTodayBonus = await dbQuery.get(
          `SELECT id FROM schedules WHERE review_round = 99 AND planned_date = ?`,
          [todayKstStr]
        );
        if (!existingTodayBonus) {
          console.log(`[Auto-WeakPoint] Automatically generating 8 AM KST weak-point recommendation for ${todayKstStr}`);
          await generateWeakPointRecommendation(todayKstStr);
        }
      }
    }

    const sql = `
      SELECT 
        s.id AS schedule_id,
        s.review_round,
        s.planned_date,
        s.status,
        s.completed_at,
        s.score,
        t.id AS topic_id,
        t.title,
        t.keywords,
        t.pdf_name,
        t.created_at,
        t.category
      FROM schedules s
      JOIN topics t ON s.topic_id = t.id
      WHERE s.planned_date <= ? AND s.status = 'pending'
      ORDER BY CASE WHEN s.review_round = 99 THEN 0 ELSE 1 END ASC, s.review_round ASC, s.planned_date ASC, t.id ASC
    `;
    const pendingReviews = await dbQuery.all(sql, [queryDate]);

    const uniqueReviewsMap = new Map();
    for (const r of pendingReviews) {
      const mapKey = r.review_round === 99 ? `${r.topic_id}_bonus` : String(r.topic_id);
      if (!uniqueReviewsMap.has(mapKey)) {
        uniqueReviewsMap.set(mapKey, r);
      }
    }
    
    const uniqueReviews = Array.from(uniqueReviewsMap.values()).map(r => ({
      ...r,
      isBonus: r.review_round === 99,
      score: r.score
    }));

    const startDate = fileUtils.getLocalDateString(new Date(queryDate), -2);
    const endDate = fileUtils.getLocalDateString(new Date(queryDate), 2);
    const completedSchedules = await dbQuery.all(
      `SELECT topic_id, completed_at FROM schedules 
       WHERE (status = 'completed' OR status = 'failed') AND completed_at IS NOT NULL 
         AND completed_at >= ? AND completed_at <= ?`,
      [startDate + 'T00:00:00.000Z', endDate + 'T23:59:59.999Z']
    );

    const completedTopicIds = [];
    for (const s of completedSchedules) {
      try {
        const localDateStr = fileUtils.getLocalDateString(new Date(s.completed_at));
        if (localDateStr === queryDate) {
          completedTopicIds.push(s.topic_id);
        }
      } catch (err) {
        console.warn('Completed_at date parse warning:', err);
      }
    }

    res.json({
      date: queryDate,
      count: uniqueReviews.length,
      reviews: uniqueReviews,
      completedTopicIds: completedTopicIds
    });
  } catch (error) {
    console.error('Error fetching dashboard reviews:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡?蹂듭뒿 ??쒕낫?쒕? 遺덈윭?????놁뒿?덈떎.' });
  }
});

// GET /api/dashboard/weak-points -> Manual weakpoint trigger
router.get('/dashboard/weak-points', async (req, res) => {
  const queryDate = req.query.date || fileUtils.getLocalDateString();
  try {
    const totalPendingTopics = await dbQuery.get(
      `SELECT COUNT(DISTINCT topic_id) as count FROM schedules 
       WHERE planned_date <= ? AND status = 'pending'`,
      [queryDate]
    );
    if (totalPendingTopics.count > 10) {
      return res.json({ weakPoints: [], message: '?ㅻ뒛??蹂듭뒿 ?좏뵿??10媛쒕? 珥덇낵?섏뿬 ?쎌젏 異붿쿇??蹂대쪟?섏뿀?듬땲??' });
    }

    const activeWeaknessCount = await dbQuery.get(
      `SELECT COUNT(*) as count FROM schedules 
       WHERE review_round = 99 AND planned_date <= ? AND status = 'pending'`,
      [queryDate]
    );
    if (activeWeaknessCount.count >= 3) {
      return res.json({ weakPoints: [], message: '?ㅻ뒛??蹂듭뒿???깅줉???쎌젏蹂듭뒿?좏뵿??3媛쒕? 珥덇낵?????놁뒿?덈떎.' });
    }

    const recommended = await generateWeakPointRecommendation(queryDate);
    const weakPoints = recommended ? [recommended] : [];
    res.json({ weakPoints });
  } catch (error) {
    console.error('Error fetching weak points:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡??쎌젏 ?좏뵿??議고쉶?섏? 紐삵뻽?듬땲??' });
  }
});

// Helper database schema check functions
async function ensureSessionTable() {
  try {
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS app_session (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn('ensureSessionTable warning:', e.message);
  }
}

async function ensureAnswersheetReportsTable() {
  try {
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS answersheet_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pdf_name TEXT,
        pdf_data BLOB,
        pdf_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn('ensureAnswersheetReportsTable warning:', e.message);
  }
}

// POST /api/topics/suggest-title
router.post('/topics/suggest-title', async (req, res) => {
  try {
    const { image, mimeType, htmlText } = req.body;
    if (!image && !htmlText) {
      return res.status(400).json({ error: '?대?吏 ?곗씠???먮뒗 HTML ?띿뒪?멸? ?꾩슂?⑸땲??' });
    }
    const cleanTitle = await ocrPlugin.suggestTitleFromCalculation(image, mimeType, htmlText, callLLMWithFailover);
    return res.json({ title: cleanTitle });
  } catch (err) {
    console.error('Suggest title error:', err);
    res.status(500).json({ error: '?좏뵿 ?쒕ぉ ?먮룞 異붿쿇???ㅽ뙣?덉뒿?덈떎.' });
  }
});

// POST /api/recommend-topics
router.post('/recommend-topics', async (req, res) => {
  try {
    const { existingTitles, isAcronym } = req.body;
    const systemInstruction = `?뱀떊? ??쒕?援?援??湲곗닠?먭꺽 湲곗닠???뱁엳 ?좎쭏諛뤾린珥덇린?좎궗, ?좊ぉ?쒓났湲곗닠?????좊ぉ怨듯븰/吏諛섍났??愿?? ?쒗뿕??理쒓퀬 ?꾨Ц 援먯쑁 ?쒗꽣?낅땲??
怨듬??섍퀬 ?덈뒗 ?섑뿕?앹씠 ?덈줈??怨듬? 二쇱젣(?좏뵿)瑜?異붿쿇?대떖?쇨퀬 ?붿껌?덉뒿?덈떎.
?쒓났?섎뒗 [湲곗〈 ?붽린 由ъ뒪????議댁옱?섎뒗 二쇱젣?ㅺ낵 **?덈? 寃뱀튂吏 ?딆쑝硫댁꽌**, 湲곗닠???쒗뿕 以鍮꾩뿉 諛섎뱶???꾩슂???듭떖?곸씠怨??숈닠?곸씤 ?꾧났 二쇱젣 3媛쒕? ?좊퀎?섏뿬 ?쒓?濡?異붿쿇??二쇱떗?쒖삤.

[異붿쿇 湲곗?]:
1. 遺꾩빞: ?좎쭏諛뤾린珥덇린?좎궗 ?먭꺽?쒗뿕(吏諛섍났?? ?좎쭏??븰, 湲곗큹怨듯븰, ?щ㈃?덉젙, ?곕꼸怨듯븰, ?숇쭑?? 吏諛섍컻?????먯꽌 留ㅼ슦 ?믪? 鍮덉텧 鍮꾩쨷??李⑥??섎뒗 以묒슂??怨듭떇, 媛쒕뀗, ?대줎, ?꾩긽, 怨듬쾿, ?쒗뿕紐??깆씠?댁빞 ?⑸땲??
2. ?쒖쇅 ??ぉ: ?쒓났?섎뒗 [湲곗〈 ?붽린 由ъ뒪?????대? ?ы븿??二쇱젣???덈? 以묐났?섏뿬 異붿쿇?섏? 留덉떗?쒖삤.
3. ?ㅼ뼇?? 留ㅻ쾲 鍮꾩듂??二쇱젣留?諛섎났?섏? 留먭퀬, ?좎쭏??븰/湲곗큹怨듯븰/?щ㈃怨듯븰/?곕꼸 諛?吏?섍났媛??좊쪟踰??곗빟吏諛?媛쒕웾 ???ㅼ뼇???몃? 遺꾩빞?먯꽌 ?꾩쟾???덈∼怨??ㅼ뼇??二쇱젣瑜?怨좊Ⅴ寃?臾댁옉??異붿쿇??二쇱떗?쒖삤.
4. ?뺤떇: ?ㅼ쭅 異붿쿇???⑥뼱 3媛쒕쭔??以꾨컮轅?\\n)?쇰줈 援щ텇?섏뿬 源붾걫?섍쾶 ?쒓?濡?異쒕젰?섏떗?쒖삤. ?쒕줎, 遺???ㅻ챸, ?レ옄 踰덊샇(?? 1., 2.), ?뱀닔臾몄옄, ?곗샂???깆? ?덈? ?ы븿?섏? 留덉떗?쒖삤.
5. ?덉떆 異쒕젰 ?뺥깭:
怨쇱엵媛꾧레?섏븬 ?뚯궛 硫붿빱?덉쬁
?щ㈃ ?먭린?뚭눼 ?덉젙?댁꽍
?뚮Ⅴ?먭린 洹뱁븳吏吏??;

    const userPrompt = `[湲곗〈 ?붽린 由ъ뒪??:
${Array.isArray(existingTitles) ? existingTitles.join('\n') : '?놁쓬'}

??湲곗〈 由ъ뒪?몄뿉 ?ы븿?섏? ?딆? ?덈줈???좎쭏諛뤾린珥덇린?좎궗 ?꾩닔 ?붽린 ${isAcronym ? '?먮Ц???욊??? ?붽린踰? : '媛쒖슂'} 二쇱젣 ?⑥뼱 3媛쒕? 留ㅼ슦 ?ㅼ뼇?섍퀬 李쎌쓽?곸쑝濡?臾댁옉???좎젙?섏뿬 異붿쿇??二쇱떗?쒖삤. (臾댁옉???쒕뱶: ${Math.random()}, ??꾩뒪?ы봽: ${Date.now()})`;

    const responseText = await callLLMWithFailover(
      systemInstruction,
      userPrompt,
      null,
      'formula',
      { temperature: 1.0 }
    );
    
    const recommendations = responseText
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, '').replace(/[\*\"\'`]/g, '').trim())
      .filter(line => line.length > 0 && line.length < 50)
      .slice(0, 3);
      
    res.json({ success: true, recommendations });
  } catch (err) {
    console.error('POST /api/recommend-topics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/table/suggest-title-and-refine
router.post('/table/suggest-title-and-refine', async (req, res) => {
  try {
    const { tableHtml, chatHistory } = req.body;
    if (!tableHtml) {
      return res.status(400).json({ error: '???댁슜??議댁옱?섏? ?딆뒿?덈떎.' });
    }

    const systemInstruction = `?뱀떊? ??쒕?援?援??湲곗닠?먭꺽 湲곗닠???쒗뿕(?좎쭏諛뤾린珥덇린?좎궗, ?좊ぉ?쒓났湲곗닠?? ?좊ぉ援ъ“湲곗닠?????좊ぉ怨듯븰 諛?吏諛섍났??遺꾩빞) ?꾨Ц ?쒗꽣?낅땲??
?ъ슜?먭? 怨듬??섎뜕 以??ㅼ떆媛??쒗꽣 李쎌뿉???대낫?닿퀬???섎뒗 留덊겕?ㅼ슫 ?쒓? ?낅젰?⑸땲??
?대떦 ?쒖쓽 ?먮낯 HTML ?댁슜怨??ㅼ떆媛??쒗꽣 ???留λ씫??遺꾩꽍?섏뿬:
1. ?대떦 ?쒖뿉 媛??嫄몃쭪? ?꾨Ц?곸씠怨?源붾걫???듭떖 ?쒕ぉ(Title)???쒓?濡???以?怨듬갚 ?ы븿 25???대궡)濡??꾩텧?섏떗?쒖삤. (?숈옄紐?怨듬쾿紐??깆쓣 ?곸젅??諛섏쁺?섏뿬 '~~ 鍮꾧탳?? ?먮뒗 '~~ 遺꾩꽍?? ???뺤떇?쇰줈 ?묒꽦)
2. ?쒖쓽 ?꾩껜 ?댁슜??吏諛섍났???좎쭏??븰 ?쒖? ?⑹뼱 諛?湲곗닠???쒗뿕 ?쒖닠 ?묒떇??留욊쾶 ?ㅻ벉? ?뺤젣??HTML table 留덊겕?낆쓣 諛섑솚?섏떗?쒖삤. ?먮낯 ?쒖쓽 ?됯낵 ??援ъ“瑜?洹몃?濡??좎??섎릺, ?ㅽ깉?먭? ?덇굅??遺?먯뿰?ㅻ윭???쒖닠???덈떎硫?源붾걫?섍쾶 ?ㅻ벉?쇱떗?쒖삤. (蹂꾨룄??css ?ㅽ??쇱씠??wrapper div???ы븿?섏? 留먭퀬 ?ㅼ쭅 <table>...</table> ?뺥깭留?異쒕젰?댁빞 ?⑸땲??)

諛섎뱶???ㅼ쓬 JSON ?뺤떇 洹쒓꺽?쇰줈留??뺥솗?섍쾶 ?묐떟?섏떗?쒖삤. (?ㅻ챸?대굹 留덊겕?ㅼ슫 肄붾뱶 釉붾줉 湲고샇???덈? 異쒕젰?섏? 留덉떗?쒖삤):
{
  "title": "?ш린??理쒖쟻?붾맂 ???쒕ぉ 湲곗엯",
  "html": "?ш린???뺤젣??<table>...</table> HTML 留덊겕??湲곗엯"
}`;

    const chatContext = Array.isArray(chatHistory)
      ? chatHistory.map(h => `${h.role === 'user' ? '?ъ슜?? : 'AI ?쒗꽣'}: ${h.text}`).join('\n')
      : '(????놁쓬)';

    const userPrompt = `[?먮낯 ??HTML]:\n${tableHtml}\n\n[?ㅼ떆媛??쒗꽣 ???留λ씫]:\n${chatContext}`;

    const responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'tutor');
    
    let cleanJsonText = responseText.trim();
    const startIdx = cleanJsonText.indexOf('{');
    const endIdx = cleanJsonText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
    } else if (cleanJsonText.startsWith('```')) {
      cleanJsonText = cleanJsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    try {
      const result = parseLlmJson(cleanJsonText);
      res.json({
        title: (result.title || '??鍮꾧탳??).replace(/^[?뱤\s\t\n]+/, '').trim(),
        html: result.html || tableHtml
      });
    } catch (parseErr) {
      console.warn('Refined table JSON parsing failed, using fallback regex:', parseErr);
      let fallbackTitle = '??鍮꾧탳??;
      const titleMatch = responseText.match(/"title"\s*:\s*"([^"]+)"/);
      if (titleMatch && titleMatch[1]) {
        fallbackTitle = titleMatch[1].replace(/^[?뱤\s\t\n]+/, '').trim();
      }
      let fallbackHtml = tableHtml;
      const htmlMatch = responseText.match(/"html"\s*:\s*"([\s\S]+?)"\s*}/);
      if (htmlMatch && htmlMatch[1]) {
        fallbackHtml = htmlMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
      }
      res.json({
        title: fallbackTitle,
        html: fallbackHtml
      });
    }
  } catch (err) {
    console.error('Refine table route error:', err);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.' });
  }
});

// POST /api/table/regenerate
router.post('/table/regenerate', async (req, res) => {
  try {
    const { title, headers, rowHeaders } = req.body;
    if (!title || !headers || !rowHeaders) {
      return res.status(400).json({ error: '?꾩닔 留ㅺ컻蹂??title, headers, rowHeaders)媛 ?꾨씫?섏뿀?듬땲??' });
    }

    const systemInstruction = `?뱀떊? 吏諛섍났??諛??좊ぉ怨듯븰 ?꾧났??吏?꾪븯????숆탳?섏씠???꾨Ц AI ?쒗꽣?낅땲??
?ъ슜?먭? ?쒓났???쒖쓽 ?쒕ぉ(二쇱젣), ???ㅻ뜑(泥?踰덉㎏ ??, ???ㅻ뜑(泥?踰덉㎏ ??瑜?湲곗??쇰줈 ?쒖쓽 ?섎㉧吏 蹂몃Ц ? ?댁슜???꾧났 吏?앹뿉 留욊쾶 ?꾨Ц?곸쑝濡?梨꾩썙二쇱꽭??

諛섎뱶???ㅼ쓬 ?뺤떇??JSON 媛앹껜留?諛섑솚?댁빞 ?⑸땲??(?ㅻ챸?대굹 留덊겕?ㅼ슫 肄붾뱶 釉붾줉 湲고샇???덈? 異쒕젰?섏? 留덉떗?쒖삤):
{
  "rows": [
    ["?됲뿤??", "蹂몃Ц?1-1", "蹂몃Ц?1-2", ...],
    ["?됲뿤??", "蹂몃Ц?2-1", "蹂몃Ц?2-2", ...]
  ]
}

二쇱쓽?ы빆:
1. 媛??됱쓽 泥?踰덉㎏ ?먯냼??諛섎뱶???ъ슜?먭? ?쒓났?????ㅻ뜑? ?숈씪?댁빞 ?⑸땲??
2. ???ㅻ뜑? ???ㅻ뜑瑜??곌퀎 遺꾩꽍?섏뿬 吏諛섍났???꾧났 ?섏???援ъ껜?곸씠怨??꾨Ц?곸씤 吏?앹쓣 ?쒓?濡??묒꽦??二쇱꽭??
3. 留덊겕?ㅼ슫 湲고샇??異붽??곸씤 ?띿뒪???ㅻ챸? 諛곗젣?섍퀬 ?ㅼ쭅 ???뺤떇??JSON ?곗씠?곕쭔 異쒕젰??二쇱꽭?? JSON ?뺤떇??源⑥?硫????⑸땲??`;

    const userPrompt = `
- ???쒕ぉ(二쇱젣): ${title}
- ???ㅻ뜑: ${JSON.stringify(headers)}
- ???ㅻ뜑(泥?踰덉㎏ ?댁쓽 紐⑸줉): ${JSON.stringify(rowHeaders)}
`;

    const responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'tutor', { temperature: 0.2 });
    
    let cleanJsonText = responseText.trim();
    const startIdx = cleanJsonText.indexOf('{');
    const endIdx = cleanJsonText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
    } else if (cleanJsonText.startsWith('```')) {
      cleanJsonText = cleanJsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    try {
      const result = parseLlmJson(cleanJsonText);
      if (result && Array.isArray(result.rows)) {
        res.json({ success: true, rows: result.rows });
      } else {
        throw new Error('?묐떟 ?뺤떇???щ컮瑜댁? ?딆뒿?덈떎.');
      }
    } catch (parseErr) {
      console.error('Regenerate table JSON parsing failed:', parseErr, 'Raw:', responseText);
      res.status(500).json({ error: 'AI ?묐떟 遺꾩꽍 ?ㅽ뙣. ?ㅼ떆 ?쒕룄??二쇱꽭??' });
    }
  } catch (err) {
    console.error('Regenerate table error:', err);
    res.status(500).json({ error: err.message || '???댁슜 ?ъ옉?깆뿉 ?ㅽ뙣?덉뒿?덈떎.' });
  }
});

// POST /api/session/answersheet/upload
router.post('/session/answersheet/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '?낅줈?쒕맂 ?뚯씪???놁뒿?덈떎.' });
    }
    const pdfName = req.body.fileNameUtf8 || req.file.originalname || '';

    let pdfUrl = null;
    let dbPdfData = req.file.buffer;

    if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
      try {
        const blob = await put(`answersheets/${Date.now()}_${pdfName}`, req.file.buffer, {
          access: 'private',
          contentType: req.file.mimetype || 'application/pdf',
        });
        pdfUrl = blob.url;
        dbPdfData = null; // Clear binary from database
        console.log(`Successfully uploaded answersheet report binary to Vercel Blob: ${pdfUrl}`);
      } catch (blobErr) {
        console.error('Failed to upload answersheet report to Vercel Blob, falling back to database storage:', blobErr);
      }
    }

    // Save the original file to SQLite/Postgres db
    await ensureAnswersheetReportsTable();
    const insertReportSql = `
      INSERT INTO answersheet_reports (pdf_name, pdf_data, pdf_url)
      VALUES (?, ?, ?)
    `;
    const reportResult = await dbQuery.run(insertReportSql, [
      pdfName,
      dbPdfData,
      pdfUrl
    ]);
    const reportId = reportResult.id;

    res.json({
      theories: [{
        title: pdfName.replace(/\.[^/.]+$/, ""), // Remove file extension
        concept: '?낅줈?쒗븳 蹂몃Ц 蹂닿퀬?쒓? ?곕룞?섏뿀?듬땲??',
        assumptions: '',
        formula: '',
        answer: '',
        answersheet_report_id: reportId,
        pdf_name: pdfName
      }]
    });
  } catch (err) {
    console.error('POST /api/session/answersheet/upload error:', err);
    res.status(500).json({ error: err.message || 'PDF/HTML ?낅줈?쒖뿉 ?ㅽ뙣?덉뒿?덈떎.' });
  }
});

// POST /api/session/answersheet/add-from-topic
router.post('/session/answersheet/add-from-topic', async (req, res) => {
  const { topicId } = req.body;
  try {
    // 1. Fetch topic from DB
    const topic = await dbQuery.get('SELECT title, category, pdf_name, pdf_data, pdf_url FROM topics WHERE id = ?', [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '?대떦 ?좏뵿??李얠쓣 ???놁뒿?덈떎.' });
    }
    if (!topic.pdf_data && !topic.pdf_url) {
      return res.status(400).json({ error: '?대떦 ?좏뵿??泥⑤????먮낯 蹂닿퀬???뚯씪???놁뒿?덈떎.' });
    }

    const pdfName = topic.pdf_name || '';

    // 2. Save to answersheet_reports
    await ensureAnswersheetReportsTable();
    const insertReportSql = `
      INSERT INTO answersheet_reports (pdf_name, pdf_data, pdf_url)
      VALUES (?, ?, ?)
    `;
    const reportResult = await dbQuery.run(insertReportSql, [
      pdfName,
      topic.pdf_data,
      topic.pdf_url
    ]);
    const reportId = reportResult.id;

    res.json({
      theories: [{
        title: topic.title,
        concept: '?곕룞???좏뵿??蹂몃Ц 蹂닿퀬?쒖엯?덈떎.',
        assumptions: '',
        formula: '',
        answer: '',
        answersheet_report_id: reportId,
        pdf_name: pdfName,
        category: topic.category || '?쇰컲'
      }]
    });
  } catch (err) {
    console.error('POST /api/session/answersheet/add-from-topic error:', err);
    res.status(500).json({ error: err.message || '蹂닿퀬???곕룞???ㅽ뙣?덉뒿?덈떎.' });
  }
});

export default router;
