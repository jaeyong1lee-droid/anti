import { GoogleGenerativeAI } from '@google/generative-ai';
import { dbQuery } from '../database.js';
import { parseLlmJson } from '../utils/latexUtils.js';
import { SVG_DIAGRAM_PROMPT } from '../plugins/svgDiagramPlugin.js';

// Global AI progress tracker map
global.progressTracker = global.progressTracker || new Map();

export let globalPreferredModel = 'gemini-3.5-flash-lite';
export const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash'
      setTimeout(() => global.standardsAnalysisCache.delete(progressId), 300000);
    }
    return text;
  } catch (err) {
    console.warn('[analyzeStandardsBeforeTask] Warning: standards analysis failed:', err.message);
    updateProgress(progressId, 0, '0단계: 사전 지침 분석 스킵 (오류로 우회)', 10);
    return '';
  }
}

// Helper: Stream detection flags
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

export async function getTopicText(topic, fileUtils, ocrPlugin, pdfParse) {
  if (topic && topic.extracted_text) {
    return topic.extracted_text;
  }

  const topicId = topic ? (topic.id || topic.topic_id) : null;
  const cacheKey = `topic_extracted_text_${topicId}`;

  if (topicId) {
    try {
      const cached = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [cacheKey]);
      if (cached && cached.value) {
        console.log(`[Cache Hit] Serving cached extracted text for topicId=${topicId}`);
        return cached.value;
      }
    } catch (cacheErr) {
      console.warn(`[Cache Read Error] Failed to read text cache for topicId=${topicId}:`, cacheErr);
    }
  }

  let pdfData = topic ? topic.pdf_data : null;
  let rawPdfName = topic ? topic.pdf_name : null;
  if (!pdfData && topicId) {
    try {
      const dbRow = await dbQuery.get('SELECT pdf_name, pdf_data, pdf_url FROM topics WHERE id = ?', [topicId]);
      if (dbRow) {
        pdfData = dbRow.pdf_data;
        rawPdfName = dbRow.pdf_name;
        if (dbRow.pdf_url && (!pdfData || pdfData.length === 0)) {
          console.log(`Lazy loading PDF/HTML buffer from Vercel Blob URL: ${dbRow.pdf_url}`);
          const headers = {};
          if (process.env.BLOB_READ_WRITE_TOKEN) {
            headers['Authorization'] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
          }
          const response = await fetch(dbRow.pdf_url, { headers });
          if (!response.ok) throw new Error(`Blob fetch failed with status: ${response.status}`);
          pdfData = Buffer.from(await response.arrayBuffer());
        }
        if (topic) {
          topic.pdf_data = pdfData;
          topic.pdf_name = rawPdfName;
        }
      }
    } catch (dbErr) {
      console.warn(`[DB Fetch Error] Failed to lazy load pdf_data for topicId=${topicId}:`, dbErr);
    }
  }

  if (!pdfData) {
    return '수기로 등록한 토픽이며 첨부된 보고서 파일이 없습니다.';
  }

  const pdfName = (rawPdfName || '').toLowerCase();
  const isImage = pdfName.endsWith('.png') || pdfName.endsWith('.jpg') || pdfName.endsWith('.jpeg') || pdfName.endsWith('.gif') || pdfName.endsWith('.webp');

  let fileText = '';
  if (isImage) {
    try {
      const mimeType = pdfName.endsWith('.png') ? 'image/png' :
                       (pdfName.endsWith('.gif') ? 'image/gif' :
                        (pdfName.endsWith('.webp') ? 'image/webp' : 'image/jpeg'));
      const base64Data = topic.pdf_data.toString('base64');
      fileText = await ocrPlugin.extractTextFromCalculationImage(base64Data, mimeType, callLLMWithFailover);
    } catch (err) {
      console.error(`[OCR Image Extraction] Failed for topicId=${topicId}:`, err);
      fileText = `[이미지 OCR 추출 실패: ${err.message}]`;
    }
  } else {
    const isHtml = topic.pdf_name && (
      topic.pdf_name.toLowerCase().endsWith('.html') || 
      topic.pdf_name.toLowerCase().endsWith('.htm') || 
      fileUtils.isBufferHtml(topic.pdf_data)
    );
    if (isHtml) {
      try {
        const rawHtml = fileUtils.decodeHtmlBuffer(topic.pdf_data);
        fileText = fileUtils.htmlToPlainText(rawHtml);

        const imgRegex = /<img[^>]+src=["']data:(image\/[^;]+);base64,([^"']+)["']/gi;
        let match;
        let ocrTexts = [];
        while ((match = imgRegex.exec(rawHtml)) !== null) {
          const mimeType = match[1];
          const base64Data = match[2];
          console.log(`[OCR Embedded Image] Found embedded base64 image in HTML. Running OCR...`);
          try {
            const ocrText = await ocrPlugin.extractTextFromCalculationImage(base64Data, mimeType, callLLMWithFailover);
            if (ocrText) {
              ocrTexts.push(ocrText);
            }
          } catch (ocrErr) {
            console.error('[OCR Embedded Image] Failed to run OCR on embedded image:', ocrErr);
          }
        }
        if (ocrTexts.length > 0) {
          fileText = `[이미지 OCR 추출 텍스트]:\n${ocrTexts.join('\n\n')}\n\n[HTML 본문 텍스트]:\n${fileText}`;
        }
      } catch (htmlErr) {
        console.warn('Failed to parse HTML string:', htmlErr);
      }
    } else {
      try {
        const parsedPdf = await pdfParse(topic.pdf_data);
        fileText = parsedPdf.text || '';
      } catch (pdfErr) {
        console.warn('Failed to parse PDF binary:', pdfErr);
      }
    }
    fileText = fileUtils.mergeVerticalText(fileText);
  }

  if (topicId && fileText && fileText.length > 0) {
    try {
      await saveSessionValue(cacheKey, fileText);
    } catch (saveErr) {
      console.warn(`[Cache Write Error] Failed to cache extracted text for topicId=${topicId}:`, saveErr.message);
    }
  }

  return fileText;
}

export async function searchSourceDocumentWithGeminiLite(systemInstruction, userPrompt, image = null, options = {}) {
  return await callLLMWithFailover(systemInstruction, userPrompt, image, 'source-search', {
    ...options,
    preferredModel: 'gemini-3.1-flash-lite',
    isSourceSearch: true
  });
}
