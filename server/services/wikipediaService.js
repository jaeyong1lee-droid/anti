/**
 * 📚 위키피디아(Wikipedia) 공식 Open API 연동 및 사전 지식 그라운딩 서비스 (wikipediaService.js)
 * 
 * [AGENTS.md 절대 철칙 준수]:
 * - 위키미디어 재단 공식 REST API (https://ko.wikipedia.org/api/rest_v1 및 en.wikipedia.org) 무인증 100% 무료 연동
 * - 지반공학 및 토목공학 전문 용어, 학술 정의, 원리 메커니즘을 사전 조회하여 AI 튜터 답변 및 문제 출제 시 환각 차단
 * - 로컬/서버리스 캐시(server/data/wiki_cache/ 및 os.tmpdir()) 지원으로 초고속 응답 보장
 * - 100% 동적 파싱 알고리즘 및 위키미디어 공식 User-Agent 정책 준수
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 위키미디어 정책 준수 User-Agent
const USER_AGENT = 'SpacedRepetitionEduApp/1.0 (https://github.com/jaeyong1lee-droid/anti; engineering-tutor@daewooenc.com)';

// 캐시 디렉토리 설정
let WIKI_CACHE_DIR = path.resolve(__dirname, '../data/wiki_cache');
try {
  if (process.env.VERCEL) {
    WIKI_CACHE_DIR = path.join(os.tmpdir(), 'wiki_cache');
  }
  if (!fs.existsSync(WIKI_CACHE_DIR)) {
    fs.mkdirSync(WIKI_CACHE_DIR, { recursive: true });
  }
} catch (e) {
  WIKI_CACHE_DIR = path.join(os.tmpdir(), 'wiki_cache');
  try {
    if (!fs.existsSync(WIKI_CACHE_DIR)) fs.mkdirSync(WIKI_CACHE_DIR, { recursive: true });
  } catch (err) {}
}

const memoryWikiCache = new Map();

/**
 * HTTPS 요청 유틸리티
 */
function fetchWikiJson(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      },
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * 텍스트에서 불필요한 조사/어미를 제거하여 핵심 검색 키워드 추출
 */
export function extractCleanKeywords(text) {
  if (!text) return [];
  const clean = String(text)
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/[?,!~`@#$%^&*=+_\-;:|\\/]/g, ' ')
    .replace(/(에\s*대해|에\s*대하여|설명해줘|알려줘|무엇인가요|무엇인가|어떤가요|정의|원리|메커니즘|기술하시오|서술하시오|출제하시오)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 문장을 접속사('및', '와', '과', 쉼표 등) 단위로 분할하여 복합 개념 분리
  const segments = clean.split(/\s*(?:및|와|과|,|\/)\s*/).map(s => s.trim()).filter(s => s.length >= 2);
  const candidates = [...segments];

  // 각 세그먼트의 세부 단어 추가 (중복 배제)
  segments.forEach(s => {
    const words = s.split(' ').filter(w => w.length >= 2);
    words.forEach(w => {
      if (!candidates.includes(w)) candidates.push(w);
    });
  });

  return candidates.slice(0, 4);
}

/**
 * 특정 표제어의 위키백과 Summary 조회
 * @param {string} title 표제어
 * @param {string} lang 'ko' | 'en'
 */
export async function getWikiSummary(title, lang = 'ko') {
  if (!title) return null;
  const cleanTitle = title.trim().replace(/\s+/g, '_');
  const cacheKey = `${lang}_summary_${cleanTitle.toLowerCase()}`;

  if (memoryWikiCache.has(cacheKey)) {
    return memoryWikiCache.get(cacheKey);
  }

  const cachePath = path.join(WIKI_CACHE_DIR, `${encodeURIComponent(cacheKey)}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      memoryWikiCache.set(cacheKey, data);
      return data;
    } catch (e) {}
  }

  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTitle)}`;
  const data = await fetchWikiJson(url);

  if (data && data.extract && data.type !== 'disambiguation' && !data.extract.includes('동음이의')) {
    const result = {
      title: data.title,
      description: data.description || '',
      extract: data.extract,
      pageUrl: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(cleanTitle)}`,
      lang
    };
    memoryWikiCache.set(cacheKey, result);
    try {
      fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf8');
    } catch (e) {}
    return result;
  }

  return null;
}

/**
 * 위키백과 본문/제목 지능형 검색 (Full-Text Search)
 * @param {string} query 검색어
 * @param {string} lang 'ko' | 'en'
 */
export async function searchWiki(query, lang = 'ko', limit = 5) {
  if (!query) return [];
  const cleanQ = query.trim();
  const cacheKey = `${lang}_search_${cleanQ.toLowerCase()}_${limit}`;

  if (memoryWikiCache.has(cacheKey)) {
    return memoryWikiCache.get(cacheKey);
  }

  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&utf8=&format=json`;
  const raw = await fetchWikiJson(url);
  const hits = raw?.query?.search || [];

  const results = hits.slice(0, limit).map(h => ({
    title: h.title,
    snippet: (h.snippet || '').replace(/<[^>]+>/g, '').trim(),
    lang
  }));

  // 공학적 연관어(토질, 지반, 공학, 흙, 역학, 구조 등)가 제목이나 스니펫에 포함된 항목 우선 정렬
  const engineeringKeywords = ['토질', '지반', '공학', '역학', '토목', '구조', '기초', '흙', '암반', '시공'];
  results.sort((a, b) => {
    const aScore = engineeringKeywords.filter(k => a.title.includes(k) || a.snippet.includes(k)).length;
    const bScore = engineeringKeywords.filter(k => b.title.includes(k) || b.snippet.includes(k)).length;
    return bScore - aScore;
  });

  memoryWikiCache.set(cacheKey, results);
  return results;
}

/**
 * 📚 [핵심 함수]: 질문이나 토픽에 대해 위키백과 사전 지식을 먼저 조회하고, 정제된 Grounding 블록 반환
 * - 한국어 위키백과 우선 조회
 * - 한국어 결과가 미흡한 경우 영문 위키백과 검색 연계
 * @param {string} queryOrMessage 질문 텍스트 또는 토픽명
 */
export async function getWikipediaKnowledge(queryOrMessage) {
  if (!queryOrMessage || String(queryOrMessage).trim().length < 2) return '';

  const candidates = extractCleanKeywords(queryOrMessage);
  if (candidates.length === 0) return '';

  const foundSummaries = [];
  const seenTitles = new Set();

  for (const keyword of candidates) {
    if (foundSummaries.length >= 2) break;

    // 1. 한국어 위키 다이렉트 Summary 시도
    let summary = await getWikiSummary(keyword, 'ko');

    // 2. 다이렉트 미적중 시 한국어 위키 검색 후 첫 번째 유효 항목 Summary 시도
    if (!summary) {
      const searchHits = await searchWiki(keyword, 'ko', 4);
      for (const hit of searchHits) {
        if (!seenTitles.has(hit.title)) {
          const hitSummary = await getWikiSummary(hit.title, 'ko');
          if (hitSummary && !hitSummary.extract.includes('동음이의') && hitSummary.extract.length > 30) {
            summary = hitSummary;
            break;
          }
        }
      }
    }

    // 3. 한국어 결과가 없을 경우 영문 위키 지반공학 검색 시도
    if (!summary) {
      const enHits = await searchWiki(`${keyword} geotechnical`, 'en', 3);
      if (enHits.length > 0) {
        const enSummary = await getWikiSummary(enHits[0].title, 'en');
        if (enSummary) {
          summary = enSummary;
        }
      }
    }

    if (summary && !seenTitles.has(summary.title)) {
      seenTitles.add(summary.title);
      foundSummaries.push(summary);
    }
  }

  if (foundSummaries.length === 0) return '';

  const blocks = foundSummaries.map(s => {
    return `- **표제어**: [${s.title}] (${s.lang === 'ko' ? '한국어 위키백과' : 'English Wikipedia'})
  - **공학적 정의 및 핵심 내용**:
    ${s.extract}
  - **출처**: ${s.pageUrl}`;
  });

  return `
[📚 위키피디아 공학 사전 지식 (Wikipedia Grounding)]:
답변 또는 문제 출제 전, 아래 위키피디아 사전의 공학적 개념 정의 및 거동 원리를 최우선 참조하여 전공 이론의 환각(Hallucination)을 철저히 방지하십시오:
${blocks.join('\n\n')}
`;
}
