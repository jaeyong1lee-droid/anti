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
    process.env.XAI_API_KEY ||
    process.env.GROK_API_KEY ||
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
      category: topic.category || '일반'
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

    const topicsWithSchedules = [];
    for (const topic of topics) {
      const scheduleSql = `
        SELECT s.id, s.review_round, s.planned_date, s.completed_at, s.status, s.score, s.correct_count, s.total_count,
               CASE WHEN (SELECT 1 FROM app_session WHERE key = 'completed_review_schedule_' || s.id) IS NOT NULL THEN 1 ELSE 0 END AS has_session
        FROM schedules s
        WHERE s.topic_id = ?
        ORDER BY s.review_round ASC
      `;
      const schedules = await dbQuery.all(scheduleSql, [topic.id]);
      topicsWithSchedules.push({
        ...topic,
        schedules: schedules
      });
    }
    res.json(topicsWithSchedules);
  } catch (error) {
    console.error('Error fetching all topics:', error);
    res.status(500).json({ error: '서버 오류로 토픽 목록을 조회하지 못했습니다.' });
  }
});

// POST /api/topics -> Create a new topic with file upload
router.post('/topics', upload.single('pdf'), async (req, res) => {
  const { title, keywords, baseDate, category } = req.body;
  if (!title) {
    return res.status(400).json({ error: '토픽 제목은 필수 입력 항목입니다.' });
  }

  try {
    let pdfName = req.body.fileNameUtf8 || (req.file ? req.file.originalname : null);
    let pdfData = req.file ? req.file.buffer : null;

    if (!req.body.fileNameUtf8 && req.file) {
      const name = req.file.originalname;
      if (/[가-힣]/.test(name)) {
        pdfName = name;
      } else {
        try {
          const decoded = Buffer.from(name, 'latin1').toString('utf-8');
          pdfName = /[가-힣]/.test(decoded) ? decoded : name;
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
      category || '일반'
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
      message: '토픽 등록 및 복습 스케줄 생성이 완료되었습니다.',
      topicId: topicId,
      title: title,
      keywords: keywords,
      schedulesCreated: 1
    });
  } catch (error) {
    console.error('Error registering topic:', error);
    res.status(500).json({ error: '서버 오류로 토픽 등록에 실패했습니다.' });
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
      if (/[가-힣]/.test(name)) {
        pdfName = name;
      } else {
        try {
          const decoded = Buffer.from(name, 'latin1').toString('utf-8');
          pdfName = /[가-힣]/.test(decoded) ? decoded : name;
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
    res.json({ success: true, message: '소스 자료가 성공적으로 교체되었습니다.' });
  } catch (error) {
    console.error('Error replacing topic source:', error);
    res.status(500).json({ error: '서버 오류로 소스 자료 교체에 실패했습니다.' });
  }
});

// DELETE /api/topics/:id -> Delete a topic
router.delete('/topics/:id', async (req, res) => {
  const topicId = Number(req.params.id) || req.params.id;
  try {
    const checkSql = `SELECT id, title, pdf_url FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(checkSql, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '해당 토픽을 찾을 수 없습니다.' });
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
      message: `토픽 [${topic.title}] 및 관련 복습 일정이 안전하게 삭제되었습니다.`,
      topicId: topicId
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({ error: '서버 오류로 토픽 삭제에 실패했습니다.' });
  }
});

// PUT /api/topics/:id/title -> Update title
router.put('/topics/:id/title', async (req, res) => {
  const topicId = Number(req.params.id) || req.params.id;
  const { title } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: '제목은 필수입니다.' });
  }

  try {
    const checkSql = `SELECT id, title FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(checkSql, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '해당 토픽을 찾을 수 없습니다.' });
    }

    const updateSql = `UPDATE topics SET title = ? WHERE id = ?`;
    await dbQuery.run(updateSql, [title.trim(), topicId]);
    console.log(`[PUT /api/topics/:id/title] Successfully updated title to "${title.trim()}" for topicId=${topicId}`);

    res.json({
      success: true,
      message: '토픽 제목이 성공적으로 수정되었습니다.'
    });
  } catch (error) {
    console.error('Error updating topic title:', error);
    res.status(500).json({ error: '서버 오류로 토픽 제목 수정에 실패했습니다.' });
  }
});

// GET /api/topics/:id/text -> Retrieve text
router.get('/topics/:id/text', async (req, res) => {
  const topicId = req.params.id;
  try {
    const topicSql = `SELECT id, title, keywords, pdf_name, category, pdf_url, extracted_text FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(topicSql, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '토픽을 찾을 수 없습니다.' });
    }

    const fileText = await getTopicText(topic, fileUtils, ocrPlugin, pdfParse);
    res.json({
      id: topic.id,
      title: topic.title,
      pdf_name: topic.pdf_name,
      text: fileText || '보고서 내용이 비어 있거나 추출된 텍스트가 없습니다.'
    });
  } catch (error) {
    console.error('Error fetching topic text:', error);
    res.status(500).json({ error: '서버 오류로 보고서 전문을 불러오지 못했습니다.' });
  }
});

// GET /api/topics/:id/html-raw -> Retrieve raw HTML code
router.get('/topics/:id/html-raw', async (req, res) => {
  const topicId = req.params.id;
  try {
    const topic = await dbQuery.get(`SELECT pdf_name, pdf_data, pdf_url FROM topics WHERE id = ?`, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '첨부된 HTML 원본 파일을 찾을 수 없습니다.' });
    }
    let pdfData = topic.pdf_data;
    if (topic.pdf_url && (!pdfData || pdfData.length === 0)) {
      try {
        const response = await fetch(topic.pdf_url);
        pdfData = Buffer.from(await response.arrayBuffer());
      } catch (fetchErr) {
        console.error(`Failed to lazy load html-raw from URL: ${topic.pdf_url}`, fetchErr);
      }
    }
    if (!pdfData || pdfData.length === 0) {
      return res.status(404).json({ error: '첨부된 HTML 원본 파일을 찾을 수 없습니다.' });
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
    return res.status(400).json({ error: 'html 코드는 필수 문자열입니다.' });
  }
  try {
    const topic = await dbQuery.get(`SELECT pdf_name, pdf_url FROM topics WHERE id = ?`, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '토픽을 찾을 수 없습니다.' });
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
      return res.status(404).send('첨부된 PDF/HTML 원본 파일을 찾을 수 없습니다.');
    }

    let pdfData = topic.pdf_data;
    if (topic.pdf_url && (!pdfData || pdfData.length === 0)) {
      try {
        const response = await fetch(topic.pdf_url);
        if (!response.ok) throw new Error('Blob fetch failed');
        pdfData = Buffer.from(await response.arrayBuffer());
      } catch (fetchErr) {
        console.error(`Failed to lazy load topic buffer: ${topic.pdf_url}`, fetchErr);
      }
    }

    if (!pdfData || pdfData.length === 0) {
      return res.status(404).send('첨부된 PDF/HTML 원본 파일을 찾을 수 없습니다.');
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
      htmlContent = htmlContent + responsiveStyle;
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
    res.status(500).send('서버 오류로 파일을 스트리밍하지 못했습니다.');
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
    res.status(500).json({ error: '서버 오류로 복습 대시보드를 불러올 수 없습니다.' });
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
      return res.json({ weakPoints: [], message: '오늘의 복습 토픽이 10개를 초과하여 약점 추천이 보류되었습니다.' });
    }

    const activeWeaknessCount = await dbQuery.get(
      `SELECT COUNT(*) as count FROM schedules 
       WHERE review_round = 99 AND planned_date <= ? AND status = 'pending'`,
      [queryDate]
    );
    if (activeWeaknessCount.count >= 3) {
      return res.json({ weakPoints: [], message: '오늘의 복습에 등록된 약점복습토픽이 3개를 초과할 수 없습니다.' });
    }

    const recommended = await generateWeakPointRecommendation(queryDate);
    const weakPoints = recommended ? [recommended] : [];
    res.json({ weakPoints });
  } catch (error) {
    console.error('Error fetching weak points:', error);
    res.status(500).json({ error: '서버 오류로 약점 토픽을 조회하지 못했습니다.' });
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
      return res.status(400).json({ error: '이미지 데이터 또는 HTML 텍스트가 필요합니다.' });
    }
    const cleanTitle = await ocrPlugin.suggestTitleFromCalculation(image, mimeType, htmlText, callLLMWithFailover);
    return res.json({ title: cleanTitle });
  } catch (err) {
    console.error('Suggest title error:', err);
    res.status(500).json({ error: '토픽 제목 자동 추천에 실패했습니다.' });
  }
});

// POST /api/recommend-topics
router.post('/recommend-topics', async (req, res) => {
  try {
    const { existingTitles, isAcronym } = req.body;
    const systemInstruction = `당신은 대한민국 국가기술자격 기술사(특히 토질및기초기술사, 토목시공기술사 등 토목공학/지반공학 관련) 시험의 최고 전문 교육 튜터입니다.
공부하고 있는 수험생이 새로운 공부 주제(토픽)를 추천해달라고 요청했습니다.
제공되는 [기존 암기 리스트]에 존재하는 주제들과 **절대 겹치지 않으면서**, 기술사 시험 준비에 반드시 필요한 핵심적이고 학술적인 전공 주제 3개를 선별하여 한글로 추천해 주십시오.

[추천 기준]:
1. 분야: 토질및기초기술사 자격시험(지반공학, 토질역학, 기초공학, 사면안정, 터널공학, 흙막이, 지반개량 등)에서 매우 높은 빈출 비중을 차지하는 중요한 공식, 개념, 이론, 현상, 공법, 시험명 등이어야 합니다.
2. 제외 항목: 제공되는 [기존 암기 리스트]에 이미 포함된 주제는 절대 중복하여 추천하지 마십시오.
3. 다양성: 매번 비슷한 주제만 반복하지 말고, 토질역학/기초공학/사면공학/터널 및 지하공간/토류벽/연약지반 개량 등 다양한 세부 분야에서 완전히 새롭고 다양한 주제를 고르게 무작위 추천해 주십시오.
4. 형식: 오직 추천할 단어 3개만을 줄바꿈(\\n)으로 구분하여 깔끔하게 한글로 출력하십시오. 서론, 부연 설명, 숫자 번호(예: 1., 2.), 특수문자, 따옴표 등은 절대 포함하지 마십시오.
5. 예시 출력 형태:
과잉간극수압 소산 메커니즘
사면 쐐기파괴 안정해석
테르자기 극한지지력`;

    const userPrompt = `[기존 암기 리스트]:
${Array.isArray(existingTitles) ? existingTitles.join('\n') : '없음'}

위 기존 리스트에 포함되지 않은 새로운 토질및기초기술사 필수 암기 ${isAcronym ? '두문자(앞글자) 암기법' : '개요'} 주제 단어 3개를 매우 다양하고 창의적으로 무작위 선정하여 추천해 주십시오. (무작위 시드: ${Math.random()}, 타임스탬프: ${Date.now()})`;

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
      return res.status(400).json({ error: '표 내용이 존재하지 않습니다.' });
    }

    const systemInstruction = `당신은 대한민국 국가기술자격 기술사 시험(토질및기초기술사, 토목시공기술사, 토목구조기술사 등 토목공학 및 지반공학 분야) 전문 튜터입니다.
사용자가 공부하던 중 실시간 튜터 창에서 내보내고자 하는 마크다운 표가 입력됩니다.
해당 표의 원본 HTML 내용과 실시간 튜터 대화 맥락을 분석하여:
1. 해당 표에 가장 걸맞은 전문적이고 깔끔한 핵심 제목(Title)을 한글로 한 줄(공백 포함 25자 이내)로 도출하십시오. (학자명/공법명 등을 적절히 반영하여 '~~ 비교표' 또는 '~~ 분석표' 등 형식으로 작성)
2. 표의 전체 내용을 지반공학/토질역학 표준 용어 및 기술사 시험 서술 양식에 맞게 다듬은 정제된 HTML table 마크업을 반환하십시오. 원본 표의 행과 열 구조를 그대로 유지하되, 오탈자가 있거나 부자연스러운 서술이 있다면 깔끔하게 다듬으십시오. (별도의 css 스타일이나 wrapper div는 포함하지 말고 오직 <table>...</table> 형태만 출력해야 합니다.)

반드시 다음 JSON 형식 규격으로만 정확하게 응답하십시오. (설명이나 마크다운 코드 블록 기호는 절대 출력하지 마십시오):
{
  "title": "여기에 최적화된 표 제목 기입",
  "html": "여기에 정제된 <table>...</table> HTML 마크업 기입"
}`;

    const chatContext = Array.isArray(chatHistory)
      ? chatHistory.map(h => `${h.role === 'user' ? '사용자' : 'AI 튜터'}: ${h.text}`).join('\n')
      : '(대화 없음)';

    const userPrompt = `[원본 표 HTML]:\n${tableHtml}\n\n[실시간 튜터 대화 맥락]:\n${chatContext}`;

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
        title: (result.title || '새 비교표').replace(/^[📊\s\t\n]+/, '').trim(),
        html: result.html || tableHtml
      });
    } catch (parseErr) {
      console.warn('Refined table JSON parsing failed, using fallback regex:', parseErr);
      let fallbackTitle = '새 비교표';
      const titleMatch = responseText.match(/"title"\s*:\s*"([^"]+)"/);
      if (titleMatch && titleMatch[1]) {
        fallbackTitle = titleMatch[1].replace(/^[📊\s\t\n]+/, '').trim();
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
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/table/regenerate
router.post('/table/regenerate', async (req, res) => {
  try {
    const { title, headers, rowHeaders } = req.body;
    if (!title || !headers || !rowHeaders) {
      return res.status(400).json({ error: '필수 매개변수(title, headers, rowHeaders)가 누락되었습니다.' });
    }

    const systemInstruction = `당신은 지반공학 및 토목공학 전공을 지도하는 대학교수이자 전문 AI 튜터입니다.
사용자가 제공한 표의 제목(주제), 열 헤더(첫 번째 행), 행 헤더(첫 번째 열)를 기준으로 표의 나머지 본문 셀 내용을 전공 지식에 맞게 전문적으로 채워주세요.

반드시 다음 형식의 JSON 객체만 반환해야 합니다 (설명이나 마크다운 코드 블록 기호는 절대 출력하지 마십시오):
{
  "rows": [
    ["행헤더1", "본문셀1-1", "본문셀1-2", ...],
    ["행헤더2", "본문셀2-1", "본문셀2-2", ...]
  ]
}

주의사항:
1. 각 행의 첫 번째 원소는 반드시 사용자가 제공한 행 헤더와 동일해야 합니다.
2. 행 헤더와 열 헤더를 연계 분석하여 지반공학 전공 수준의 구체적이고 전문적인 지식을 한글로 작성해 주세요.
3. 마크다운 기호나 추가적인 텍스트 설명은 배제하고 오직 위 형식의 JSON 데이터만 출력해 주세요. JSON 형식이 깨지면 안 됩니다.`;

    const userPrompt = `
- 표 제목(주제): ${title}
- 열 헤더: ${JSON.stringify(headers)}
- 행 헤더(첫 번째 열의 목록): ${JSON.stringify(rowHeaders)}
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
        throw new Error('응답 형식이 올바르지 않습니다.');
      }
    } catch (parseErr) {
      console.error('Regenerate table JSON parsing failed:', parseErr, 'Raw:', responseText);
      res.status(500).json({ error: 'AI 응답 분석 실패. 다시 시도해 주세요.' });
    }
  } catch (err) {
    console.error('Regenerate table error:', err);
    res.status(500).json({ error: err.message || '표 내용 재작성에 실패했습니다.' });
  }
});

// POST /api/session/answersheet/upload
router.post('/session/answersheet/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '업로드된 파일이 없습니다.' });
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
        concept: '업로드한 본문 보고서가 연동되었습니다.',
        assumptions: '',
        formula: '',
        answer: '',
        answersheet_report_id: reportId,
        pdf_name: pdfName
      }]
    });
  } catch (err) {
    console.error('POST /api/session/answersheet/upload error:', err);
    res.status(500).json({ error: err.message || 'PDF/HTML 업로드에 실패했습니다.' });
  }
});

// POST /api/session/answersheet/add-from-topic
router.post('/session/answersheet/add-from-topic', async (req, res) => {
  const { topicId } = req.body;
  try {
    // 1. Fetch topic from DB
    const topic = await dbQuery.get('SELECT title, category, pdf_name, pdf_data, pdf_url FROM topics WHERE id = ?', [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '해당 토픽을 찾을 수 없습니다.' });
    }
    if (!topic.pdf_data && !topic.pdf_url) {
      return res.status(400).json({ error: '해당 토픽에 첨부된 원본 보고서 파일이 없습니다.' });
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
        concept: '연동된 토픽의 본문 보고서입니다.',
        assumptions: '',
        formula: '',
        answer: '',
        answersheet_report_id: reportId,
        pdf_name: pdfName,
        category: topic.category || '일반'
      }]
    });
  } catch (err) {
    console.error('POST /api/session/answersheet/add-from-topic error:', err);
    res.status(500).json({ error: err.message || '보고서 연동에 실패했습니다.' });
  }
});

export default router;
