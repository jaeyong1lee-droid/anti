import { dbQuery } from '../database.js';
import { saveSessionValue } from './sessionStore.js';

export async function extractTopicText(topic, fileUtils, ocrPlugin, pdfParse, callLlmFn) {
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
      fileText = await ocrPlugin.extractTextFromCalculationImage(base64Data, mimeType, callLlmFn);
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
            const ocrText = await ocrPlugin.extractTextFromCalculationImage(base64Data, mimeType, callLlmFn);
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

let topicGroundingCache = {
  rows: null,
  loadedAt: 0
};

async function getCachedTopicsForGrounding() {
  const now = Date.now();
  if (topicGroundingCache.rows && (now - topicGroundingCache.loadedAt < 60000)) {
    return topicGroundingCache.rows;
  }
  try {
    const rows = await dbQuery.all(
      `SELECT id, title, keywords, category, extracted_text 
       FROM topics 
       WHERE extracted_text IS NOT NULL AND extracted_text != ''`
    );
    topicGroundingCache.rows = Array.isArray(rows) ? rows : [];
    topicGroundingCache.loadedAt = now;
    return topicGroundingCache.rows;
  } catch (err) {
    console.warn('[TopicGrounding] Failed to load topics cache:', err.message);
    return topicGroundingCache.rows || [];
  }
}

/**
 * 질문 텍스트 또는 topicId를 기반으로 DB에 등록된 토픽 본문(extracted_text)을 검색하여
 * 프롬프트 주입용 컨텍스트 문자열로 반환합니다.
 */
export async function getMatchingTopicContent(queryText = '', topicId = null, maxChars = 5000) {
  try {
    const rows = await getCachedTopicsForGrounding();
    const numericId = Number(topicId);

    // 1. 명시적 topicId가 주어진 경우 최우선 매칭
    if (!isNaN(numericId) && numericId > 0) {
      let target = rows.find(r => Number(r.id) === numericId);
      if (!target) {
        target = await dbQuery.get(
          `SELECT id, title, keywords, category, extracted_text FROM topics WHERE id = ?`,
          [numericId]
        );
      }
      if (target && target.extracted_text && !target.extracted_text.includes('수기로 등록한 토픽')) {
        const text = selectRelevantExcerpt(target.extracted_text, queryText, maxChars);
        return `[📚 관련 등록 토픽 본문 (${target.title})]:\n${text}`;
      }
    }

    // 2. queryText 기반 키워드/제목 스마트 매칭
    const qClean = String(queryText || '').trim().toLowerCase();
    if (!qClean || qClean.length < 2 || rows.length === 0) return '';

    const GENERIC_WORDS = new Set([
      '및', '의', '에', '와', '과', '대한', '위한', '방법', '특성', '검토', '해석',
      '비교', '종류', '원인', '대책', '정의', '개념', '이론', '공법', '시험', '측정',
      '기준', '설계', '시공', '관리', '영향', '요소', '현상', '방지', '산정', '공식',
      '문제', '설명', '특징', '장단점', '차이점', '유도', '계산', '적용', '원리', '거동',
      '단순', '테스트', '질문', '결과', '이용한', '분석', '추정', '결정', '산출', '조사',
      '평가', '계획', '검증', '일반', '구조', '지반', '토질', '기초', '토목', '현장',
      '흙', '흙의', '지반의', '토질역학', '토질역학적', '지반공학', '지반공학적', '공학적', '역학적',
      '물리적', '보고서', '기술', '기술사', '토질및기초기술사', '서술형', '답안', '검토사항', '유의사항',
      '방안', '활용', '활용방안', '확보', '확보방안', '문제점', '대책시설', '상관관계', '아래', '파괴'
    ]);

    const isGenericToken = (tok) => {
      if (!tok || tok.length < 2) return true;
      if (GENERIC_WORDS.has(tok)) return true;
      const stripped = tok.replace(/(에서|으로|은|는|이|가|을|를|의|에|로|과|와|별|적)$/, '');
      if (!stripped || stripped.length < 2 || GENERIC_WORDS.has(stripped)) return true;
      return false;
    };

    const scored = [];
    for (const row of rows) {
      if (!row.extracted_text || row.extracted_text.includes('수기로 등록한 토픽')) continue;
      let score = 0;
      let matchedSpecificTerm = false;
      const titleLower = String(row.title || '').trim().toLowerCase();
      const titleCore = titleLower.replace(/\([^)]*\)/g, '').trim();

      if (titleLower && titleLower.length >= 2 && qClean.includes(titleLower)) {
        score += 25;
        matchedSpecificTerm = true;
      } else if (titleCore && titleCore.length >= 2 && qClean.includes(titleCore)) {
        score += 20;
        matchedSpecificTerm = true;
      }

      // 제목 단어 매칭
      const titleTokens = titleLower
        .split(/[\s,·/()[\]\-_]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2);

      for (const token of titleTokens) {
        if (qClean.includes(token)) {
          if (isGenericToken(token)) {
            score += 1;
          } else {
            score += 8;
            matchedSpecificTerm = true;
          }
        }
      }

      // 키워드 매칭
      const kwTokens = String(row.keywords || '')
        .toLowerCase()
        .split(/[\s,·/()[\]]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2);

      for (const kw of kwTokens) {
        if (qClean.includes(kw)) {
          if (isGenericToken(kw)) {
            score += 1;
          } else {
            score += 6;
            matchedSpecificTerm = true;
          }
        }
      }

      if (matchedSpecificTerm && score >= 8) {
        scored.push({ row, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.slice(0, 2);
    if (topMatches.length === 0) return '';

    const perTopicLimit = Math.floor(maxChars / topMatches.length);
    const blocks = topMatches.map(
      ({ row }) => `[📚 관련 등록 토픽 본문 (${row.title})]:\n${selectRelevantExcerpt(row.extracted_text, queryText, perTopicLimit)}`
    );
    return blocks.join('\n\n');
  } catch (err) {
    console.warn('[getMatchingTopicContent] Error:', err.message);
    return '';
  }
}

/**
 * 긴 본문에서 질문과 관련된 단락을 발췌하여 maxChars 이내로 반환합니다.
 * - 본문이 maxChars 이하이면 원문을 그대로 반환합니다.
 * - 첫 단락(정의/개요)은 항상 포함하고, 질문 토큰과 겹치는 단락을 가중치 순으로 채웁니다.
 * - 토큰 가중치는 문서 자체의 분포(IDF)로 계산하므로 별도 불용어 목록이 필요 없습니다.
 * - 점수가 있는 단락을 모두 채우고도 예산이 남으면 앞쪽 단락부터 채워 기존(앞부분 절단) 동작과 호환됩니다.
 * - 비연속 구간 사이에는 중략 표시를 넣어 발췌본임을 AI가 알 수 있게 합니다.
 */
const EXCERPT_GAP_MARK = '\n[…중략…]\n';
const EXCERPT_MAX_CHUNK = 1200;

export function selectRelevantExcerpt(text, queryText = '', maxChars = 5000) {
  const full = String(text || '').trim();
  if (full.length <= maxChars) return full;

  const chunkLimit = Math.min(EXCERPT_MAX_CHUNK, Math.max(250, Math.floor(maxChars * 0.45)));

  // 1. 단락 분할 (빈 줄 → 줄바꿈 → 고정 길이 순으로 세분화)
  const chunks = [];
  for (const block of full.split(/\n{2,}/)) {
    const b = block.trim();
    if (!b) continue;
    if (b.length <= chunkLimit) { chunks.push(b); continue; }
    let buf = '';
    for (const line of b.split('\n')) {
      if (buf && (buf.length + line.length + 1) > chunkLimit) { chunks.push(buf); buf = ''; }
      if (line.length > chunkLimit) {
        for (let i = 0; i < line.length; i += chunkLimit) chunks.push(line.slice(i, i + chunkLimit));
      } else {
        buf = buf ? `${buf}\n${line}` : line;
      }
    }
    if (buf) chunks.push(buf);
  }
  if (chunks.length === 0) return full.substring(0, maxChars);

  // 2. 질문 토큰 추출 (조사 제거)
  const tokens = [...new Set(
    String(queryText || '').toLowerCase()
      .split(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3]+/)
      .map(t => t.replace(/(에서|으로|은|는|이|가|을|를|의|에|로|과|와|별|적)$/, ''))
      .filter(t => t.length >= 2)
  )];

  // 3. 단락별 점수 (토큰 IDF 가중 합)
  const lowered = chunks.map(c => c.toLowerCase());
  const weights = tokens.map(tok => {
    const df = lowered.reduce((n, c) => n + (c.includes(tok) ? 1 : 0), 0);
    return df === 0 ? 0 : Math.log(1 + chunks.length / df);
  });
  const scores = lowered.map(c => tokens.reduce((s, tok, i) => s + (weights[i] && c.includes(tok) ? weights[i] : 0), 0));

  // 4. 선택: 첫 단락 필수 → 점수 높은 순 → 남는 예산은 앞쪽 단락 순
  const selected = new Set();
  let used = 0;
  const tryAdd = (idx) => {
    if (selected.has(idx)) return;
    const cost = chunks[idx].length + 2 + EXCERPT_GAP_MARK.length;
    if (used + cost > maxChars) return;
    selected.add(idx);
    used += cost;
  };
  tryAdd(0);
  chunks.map((_, i) => i).filter(i => scores[i] > 0).sort((a, b) => scores[b] - scores[a]).forEach(tryAdd);
  chunks.forEach((_, i) => tryAdd(i));
  if (selected.size === 0) return full.substring(0, maxChars);

  // 5. 원문 순서 복원 + 비연속 구간 중략 표시
  const order = [...selected].sort((a, b) => a - b);
  let out = '';
  order.forEach((idx, n) => {
    if (n > 0) out += (idx === order[n - 1] + 1) ? '\n\n' : EXCERPT_GAP_MARK;
    out += chunks[idx];
  });
  return out.length > maxChars ? out.substring(0, maxChars) : out;
}
