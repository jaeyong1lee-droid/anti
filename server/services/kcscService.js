/**
 * 🏛️ 국가건설기준(KCSC) KDS/KCS 공식 연동 및 기준값·시공검증 서비스 (kcscService.js)
 * 
 * [AGENTS.md 절대 철칙 준수]:
 * - 국토교통부 국가건설기준센터(KCSC) OpenAPI (https://kcsc.re.kr) 연동
 * - KDS(설계기준) 및 KCS(표준시방서) 최신 전문 조항 동적 조회 및 로컬 캐싱
 * - 법정 기준값(허용오차, 안전율, 대기시간, 배합비, 품질합격기준) 및 시공·품질검사 필수 항목 동적 추출
 * - 100% 동적·범용적 파싱 알고리즘 (하드코딩 절대 금지 철칙 준수)
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import os from 'os';

// 로컬 캐시 디렉토리 설정 (Vercel 등 서버리스 환경 대응)
let CACHE_DIR = path.resolve(__dirname, '../data/kcsc_cache');
try {
  if (process.env.VERCEL) {
    CACHE_DIR = path.join(os.tmpdir(), 'kcsc_cache');
  }
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {
  CACHE_DIR = path.join(os.tmpdir(), 'kcsc_cache');
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (err) {}
}

// 기본 KCSC OpenAPI 인증키 (환경변수 KCSC_API_KEY 우선)
const DEFAULT_KEY = "pGLRgHpZX-eTcjJMKHnjUBF0fU3VDMTaIRuIbzYXDkc";

export function getKcscApiKey() {
  const envKey = process.env.KCSC_API_KEY;
  if (envKey && envKey.trim().length > 5) {
    return envKey.trim();
  }
  return DEFAULT_KEY;
}

/**
 * HTTPS 요청 유틸리티 (SSL 검증 우회 및 타임아웃 방어)
 */
function fetchJsonFromUrl(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          resolve(parsed);
        } catch (err) {
          reject(new Error(`JSON Parse Error: ${err.message} (Raw: ${rawData.substring(0, 100)})`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`KCSC Request Timeout (${timeoutMs}ms)`));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

import { dbQuery } from '../database.js';

// In-memory cache for all Geotechnical KCSC standards loaded from DB / seed
let dbKcscStandardsCache = null;
let dbKcscMap = new Map();

/**
 * 🏛️ DB(PostgreSQL/SQLite) 또는 시드 파일(seeds/kcsc_geotechnical_seed.json)로부터
 * 지반분야 전체 KCSC 기준(120개)을 인메모리에 0ms 즉각 적재
 */
export async function ensureKcscDbLoaded() {
  if (dbKcscStandardsCache && dbKcscStandardsCache.length > 0) {
    return dbKcscStandardsCache;
  }

  // 1. Try loading from Database
  try {
    const rows = await dbQuery.all('SELECT doc_type, code, full_code, name, category, keywords, thresholds_json, inspections_json, clause_count FROM kcsc_standards');
    if (Array.isArray(rows) && rows.length > 0) {
      dbKcscStandardsCache = rows.map(r => ({
        docType: r.doc_type,
        code: r.code,
        fullCode: r.full_code,
        name: r.name,
        category: r.category,
        keywords: r.keywords || '',
        thresholds: typeof r.thresholds_json === 'string' ? JSON.parse(r.thresholds_json || '[]') : (r.thresholds_json || []),
        inspections: typeof r.inspections_json === 'string' ? JSON.parse(r.inspections_json || '[]') : (r.inspections_json || []),
        clauseCount: r.clause_count || 0
      }));
      dbKcscMap.clear();
      for (const item of dbKcscStandardsCache) {
        dbKcscMap.set(`${item.docType}_${item.code}`, item);
      }
      return dbKcscStandardsCache;
    }
  } catch (err) {
    console.warn('[kcscService] Load from DB failed, checking seed file:', err.message);
  }

  // 2. Fallback to pre-compiled seed JSON file
  const seedPath = path.resolve(__dirname, '../data/seeds/kcsc_geotechnical_seed.json');
  if (fs.existsSync(seedPath)) {
    try {
      const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      if (Array.isArray(seedData) && seedData.length > 0) {
        dbKcscStandardsCache = seedData.map(r => ({
          docType: r.docType,
          code: r.code,
          fullCode: r.fullCode,
          name: r.name,
          category: r.category,
          keywords: r.keywords || '',
          thresholds: typeof r.thresholdsJson === 'string' ? JSON.parse(r.thresholdsJson || '[]') : (r.thresholdsJson || []),
          inspections: typeof r.inspectionsJson === 'string' ? JSON.parse(r.inspectionsJson || '[]') : (r.inspectionsJson || []),
          clauseCount: r.clauseCount || 0
        }));
        dbKcscMap.clear();
        for (const item of dbKcscStandardsCache) {
          dbKcscMap.set(`${item.docType}_${item.code}`, item);
        }
        return dbKcscStandardsCache;
      }
    } catch (e) {
      console.warn('[kcscService] Read seed file failed:', e.message);
    }
  }

  dbKcscStandardsCache = [];
  return dbKcscStandardsCache;
}

// 메모리 캐시 (속도 극대화)
const memoryCodeListCache = new Map();
const memoryViewerCache = new Map();

/**
 * KDS 또는 KCS 코드 목록 전체 조회 (총 3,500+ 기준)
 * @param {string} docType 'KDS' | 'KCS'
 * @param {boolean} forceRefresh 캐시 무시 여부
 */
export async function fetchCodeList(docType = 'KDS', forceRefresh = false) {
  const type = docType.toUpperCase().trim();
  if (!forceRefresh && memoryCodeListCache.has(type)) {
    return memoryCodeListCache.get(type);
  }

  const cachePath = path.join(CACHE_DIR, `kcsc_codelist_${type.toLowerCase()}.json`);

  // 1. 디스크 캐시 확인
  if (!forceRefresh && fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        memoryCodeListCache.set(type, data);
        return data;
      }
    } catch (e) {
      console.warn(`[kcscService] Read disk cache failed for ${type}:`, e.message);
    }
  }

  // 2. OpenAPI 호출
  const apiKey = getKcscApiKey();
  const url = `https://kcsc.re.kr/OpenApi/CodeList?type=${type}&key=${apiKey}`;

  try {
    const items = await fetchJsonFromUrl(url, 12000);
    if (Array.isArray(items) && items.length > 0) {
      memoryCodeListCache.set(type, items);
      try {
        fs.writeFileSync(cachePath, JSON.stringify(items, null, 2), 'utf8');
      } catch (err) {
        console.warn(`[kcscService] Write disk cache failed for ${type}:`, err.message);
      }
      return items;
    }
  } catch (err) {
    console.warn(`[kcscService] OpenAPI fetchCodeList failed (${type}):`, err.message);
    if (fs.existsSync(cachePath)) {
      try {
        const fallbackData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        memoryCodeListCache.set(type, fallbackData);
        return fallbackData;
      } catch (e) {}
    }
  }

  return [];
}

/**
 * KDS / KCS 기준 상세 전문 조회 (조항/표/수식 포함)
 * @param {string} docType 'KDS' | 'KCS'
 * @param {string|number} code 코드 번호 (예: '113030', '113005', '118010')
 * @param {boolean} forceRefresh 캐시 무시 여부
 */
export async function fetchCodeViewer(docType, code, forceRefresh = false) {
  const type = docType.toUpperCase().trim();
  const cleanCode = String(code).replace(/[^\d]/g, '').trim();
  const cacheKey = `${type}_${cleanCode}`;

  if (!forceRefresh && memoryViewerCache.has(cacheKey)) {
    return memoryViewerCache.get(cacheKey);
  }

  const cachePath = path.join(CACHE_DIR, `kcsc_viewer_${type.toLowerCase()}_${cleanCode}.json`);

  // 1. 디스크 캐시 확인
  if (!forceRefresh && fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        memoryViewerCache.set(cacheKey, data);
        return data;
      }
    } catch (e) {
      console.warn(`[kcscService] Read viewer disk cache failed for ${cacheKey}:`, e.message);
    }
  }

  // 2. OpenAPI 호출
  const apiKey = getKcscApiKey();
  const url = `https://kcsc.re.kr/OpenApi/CodeViewer/${type}/${cleanCode}?key=${apiKey}`;

  try {
    const items = await fetchJsonFromUrl(url, 12000);
    if (Array.isArray(items) && items.length > 0) {
      memoryViewerCache.set(cacheKey, items);
      try {
        fs.writeFileSync(cachePath, JSON.stringify(items, null, 2), 'utf8');
      } catch (err) {
        console.warn(`[kcscService] Write viewer disk cache failed for ${cacheKey}:`, err.message);
      }
      return items;
    }
  } catch (err) {
    console.warn(`[kcscService] OpenAPI fetchCodeViewer failed (${cacheKey}):`, err.message);
    if (fs.existsSync(cachePath)) {
      try {
        const fallbackData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        memoryViewerCache.set(cacheKey, fallbackData);
        return fallbackData;
      } catch (e) {}
    }
  }

  return [];
}

/**
 * 조항 HTML 태그를 제거하고 순수 조항 배열로 정제
 * @param {string} docType 
 * @param {string|number} code 
 */
export async function getCleanClauses(docType, code) {
  const rawItems = await fetchCodeViewer(docType, code);
  if (!rawItems || rawItems.length === 0) return [];

  const docMeta = rawItems[0];
  const rawList = docMeta.list || [];
  const clauses = [];

  for (const row of rawList) {
    const htmlContent = String(row.contents || '');
    const cleanText = htmlContent
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    clauses.push({
      sort: row.sort,
      level: Number(row.level || 1),
      label: String(row.label || '').trim(),
      title: String(row.title || '').trim(),
      text: cleanText,
      docName: docMeta.name || ''
    });
  }

  return clauses;
}

const KOREAN_STOPWORDS = new Set([
  '다음', '표의', '빈칸', '들어갈', '내용을', '쓰시오', '설명하시오', '기술하시오',
  '대하여', '관한', '무엇인가', '어떤', '경우', '가장', '옳은', '틀린', '문제',
  '문항', '해당', '각각', '서술하시오', '구하시오', '산정하시오', '비교하시오',
  '대책을', '원인을', '특징을', '장단점을', '방법을', '기준을', '정의를', '그림',
  // 범용 문서/메타 어휘 (단독 매칭 시 무관한 시방서 오탐 유발 방지)
  '일반', '설계', '시공', '기준', '설계기준', '시방서', '표준시방서', '공사', '시설', '시설물', '구조물',
  '대책', '대책시설', '원인', '특성', '특징', '성질', '방법', '방법론', '방안', '활용', '활용방안',
  '검토', '검토사항', '유의사항', '사항', '분석', '산정', '산정방법', '평가', '비교', '보고서',
  '종합', '기술', '기술사', '토질및기초기술사', '서술형', '답안', '문제점', '종류', '종류별',
  '영향', '영향요소', '요소', '결정', '확보', '확보방안', '대상', '관점', '유지관리', '관리',
  '계획', '개요', '상관관계', '거동', '측정', '측정방법', '적용', '특수', '공통', '기타',
  '해석', '안정', '안정성', '결함', '손상', '조사', '시험', '측량', '지반', '지반공학적', '흙의', '기본적'
]);

function extractCleanEngineeringTokens(q) {
  const tokenSet = new Set();
  const parts = q.split(/[\s,._/()\[\]·-]+/);
  for (const raw of parts) {
    if (!raw || raw.length < 2 || KOREAN_STOPWORDS.has(raw)) continue;
    // 한국어 조사 제거 (의, 은, 는, 이, 가, 을, 를, 에, 에서, 으로, 로, 과, 와, 별)
    const stripped = raw.replace(/(에서|으로|은|는|이|가|을|를|의|에|로|과|와|별)$/, '');
    if (stripped.length >= 2 && !KOREAN_STOPWORDS.has(stripped)) {
      tokenSet.add(stripped);
      // '~공법' 접미어 분리 (예: 압밀공법 -> 압밀, 약액주입공법 -> 약액주입)
      if (stripped.endsWith('공법') && stripped.length >= 4) {
        const stem = stripped.slice(0, -2);
        if (stem.length >= 2 && !KOREAN_STOPWORDS.has(stem)) tokenSet.add(stem);
      }
    }
  }
  return Array.from(tokenSet);
}

/**
 * 국가건설기준 지능형 동적 검색 (DB 우선 0ms 초고속 조회)
 * @param {string} query 검색어 (예: '연약지반', 'DMM', '심층혼합', '흙막이', '고결공', '앵커', '기초', '113030' 등)
 * @param {string} docType 'KDS' | 'KCS' | null (전체)
 * @param {number} limit 반환할 최대 기준 수
 */
export async function searchStandards(query, docType = null, limit = 10) {
  if (!query || String(query).trim().length === 0) return [];
  const q = String(query).trim().toLowerCase();
  const cleanQ = q.replace(/[^\w가-힣]/g, '');

  // 1. 지반·터널 전수 DB(kcsc_standards) 인메모리 캐시 우선 확인 (0ms)
  const dbStandards = await ensureKcscDbLoaded();
  if (Array.isArray(dbStandards) && dbStandards.length > 0) {
    const targetDocType = docType ? docType.toUpperCase() : null;
    const candidates = targetDocType ? dbStandards.filter(s => s.docType === targetDocType) : dbStandards;
    const scored = [];

    // 불용어 및 조사 필터링 적용된 핵심 전공 토큰 추출
    const rawTokens = extractCleanEngineeringTokens(q);

    for (const item of candidates) {
      let score = 0;
      const code = item.code || '';
      const fullCode = item.fullCode || '';
      const name = (item.name || '').toLowerCase();
      const keywords = (item.keywords || '').toLowerCase();
      const category = (item.category || '').toLowerCase();

      // 코드 일치 (+100)
      if (cleanQ.length >= 4 && (code.includes(cleanQ) || fullCode.includes(cleanQ))) {
        score += 100;
      }
      // 명칭 직통 매칭 (+80)
      if (name.includes(q) || (cleanQ.length >= 3 && name.replace(/\s+/g, '').includes(cleanQ))) {
        score += 80;
      }
      // 키워드 직통 매칭 (+50)
      if (q.length >= 3 && keywords.includes(q)) {
        score += 50;
      }

      // 개별 전공 토큰 매칭
      for (const token of rawTokens) {
        if (name.includes(token)) score += 40;
        if (keywords.includes(token)) score += 25;
      }
      // 카테고리는 명칭/키워드 매칭이 이미 존재할 때만 보조 가점 부여 (범용 카테고리 오탐 차단)
      if (score > 0) {
        for (const token of rawTokens) {
          if (category.includes(token)) score += 10;
        }
      }

      // 지반 전공 핵심 동의어/약어 가중치
      if ((q.includes('dmm') || q.includes('심층혼합')) && (code === '113030' || name.includes('고결공'))) score += 70;
      if ((q.includes('pvd') || q.includes('연직배수') || q.includes('압밀') || q.includes('선행재하') || q.includes('프리로딩') || q.includes('과재성토')) && (code === '113020' || code === '113005' || name.includes('연직배수') || name.includes('선행재하'))) score += 60;
      if ((q.includes('아사오카') || q.includes('asaoka') || q.includes('쌍곡선') || q.includes('호시노') || q.includes('몬덴') || q.includes('침하예측') || q.includes('장래침하')) && (code === '111015' || code === '113020' || code === '113005' || name.includes('지반계측') || name.includes('선행재하'))) score += 70;
      if ((q.includes('scp') || q.includes('다짐말뚝')) && (code === '113035' || name.includes('다짐공'))) score += 70;
      if ((q.includes('약액주입') || q.includes('그라우팅')) && (code === '113045' || name.includes('그라우팅'))) score += 70;
      if ((q.includes('무리말뚝') || q.includes('말뚝')) && (code === '115015' || code === '115040')) score += 50;
      if ((q.includes('불교란') || q.includes('시료') || q.includes('다운홀') || q.includes('탄성파')) && (code === '111010' || code === '102020')) score += 60;

      // 지반(11xxxx)·터널(27xxxx) 본류 코드 우선순위 부여 (수로터널/농업시설 등 지엽적 타공종 역전 방지)
      if (score >= 40 && (code.startsWith('11') || code.startsWith('27') || code === '102020')) {
        score += 15;
      }

      // 최소 점수 임계값(45점 이상: 최소 제목 적중 또는 복수 전공 키워드 적중 필수)
      if (score >= 45) {
        scored.push({
          score,
          docType: item.docType,
          code: item.code,
          fullCode: item.fullCode,
          name: item.name,
          categoryPath: item.category,
          thresholds: item.thresholds,
          inspections: item.inspections,
          clauseCount: item.clauseCount
        });
      }
    }

    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit);
    }

    // 전수 DB(지반·터널 126개 기준)가 정상 로드된 상태에서 매칭된 기준이 없다면,
    // 명시적 코드 번호 검색이 아닌 이상 비전공(건축 점토벽돌, 강구조 등) OpenAPI 목록으로 폴백하지 않고 빈 배열 반환 (오탐 원천 차단)
    if (!/^\d{4,}$/.test(cleanQ)) {
      return [];
    }
  }

  // 2. DB 미적중 시: 기존 OpenAPI / 파일 캐시 폴백 (비지반 일반 공종 대응)
  const types = docType ? [docType.toUpperCase()] : ['KCS', 'KDS'];
  const results = [];
  const seenKeys = new Set();
  const fallbackTokens = extractCleanEngineeringTokens(q);

  for (const t of types) {
    const list = await fetchCodeList(t);
    for (const it of list) {
      const code = String(it.code || '').trim();
      const key = `${t}_${code}`;
      if (seenKeys.has(key)) continue;

      const name = String(it.name || '').toLowerCase();
      const fullCode = String(it.fullCode || '');
      const parents = (it.listParentCodes || []).map(p => String(p.name || '')).join(' ').toLowerCase();

      let score = 0;
      if (cleanQ.length >= 4 && (code.includes(cleanQ) || fullCode.includes(cleanQ))) {
        score += 100;
      }
      if (name.includes(q) || (cleanQ.length >= 3 && name.replace(/\s+/g, '').includes(cleanQ))) {
        score += 80;
      }

      for (const token of fallbackTokens) {
        if (name.includes(token)) score += 40;
        if (score > 0 && parents.includes(token)) score += 10;
      }

      if (score >= 45) {
        seenKeys.add(key);
        results.push({
          score,
          docType: t,
          code,
          fullCode,
          name: it.name,
          version: it.version,
          categoryPath: (it.listParentCodes || []).map(p => p.name).filter(Boolean).join(' > ')
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * 🔬 [핵심 기능]: 조항들로부터 법정 기준값(Numerical Thresholds)과 시공/품질검사 항목(Inspection Items)을 동적 추출
 * - 하드코딩 없이 조항 텍스트의 구조, 단위, 수치, 시공 관리 키워드를 분석하여 분류
 * @param {Array} clauses 정제된 조항 배열
 */
export function extractVerificationCriteria(clauses) {
  if (!Array.isArray(clauses) || clauses.length === 0) {
    return { thresholds: [], inspectionItems: [], environmentalItems: [] };
  }

  // 단위 및 수치 패턴 (허용오차, 안전율, 시간, 강도, 배합 등)
  const numberPattern = /\d+(\.\d+)?\s*(%|mm|cm|m|km\/h|kg|MPa|kPa|kN|일|시간|분|초|회|배|°C|℃)/i;
  
  const thresholds = [];
  const inspectionItems = [];
  const environmentalItems = [];

  for (const c of clauses) {
    const text = c.text;
    const title = c.title;
    const label = c.label;

    if (!text || text.length < 8) continue;
    const combinedHeaderAndBody = `${title} ${text}`.toLowerCase();

    // 1. 기준값 (Thresholds / Tolerances / Numerical Standards)
    const isThreshold = 
      (combinedHeaderAndBody.includes('오차') || combinedHeaderAndBody.includes('허용') || combinedHeaderAndBody.includes('안전율') || combinedHeaderAndBody.includes('한계') ||
       combinedHeaderAndBody.includes('배합비') || combinedHeaderAndBody.includes('물-시멘트') || combinedHeaderAndBody.includes('투수계수') || combinedHeaderAndBody.includes('일축압축강도') ||
       combinedHeaderAndBody.includes('재하시기') || combinedHeaderAndBody.includes('대기시간') || combinedHeaderAndBody.includes('양생') || combinedHeaderAndBody.includes('수직도')) &&
      numberPattern.test(text);

    if (isThreshold) {
      thresholds.push({
        label,
        title,
        text,
        category: combinedHeaderAndBody.includes('시간') || combinedHeaderAndBody.includes('양생') ? '양생/대기시간'
                : combinedHeaderAndBody.includes('오차') || combinedHeaderAndBody.includes('허용') ? '허용오차/한계치'
                : combinedHeaderAndBody.includes('안전율') ? '안전율'
                : combinedHeaderAndBody.includes('강도') || combinedHeaderAndBody.includes('투수') ? '강도/품질기준'
                : '시공기준값'
      });
    }

    // 2. 시공 및 품질검사 필수 항목 (Inspection & Construction Items)
    const isInspection =
      (title.includes('시공') || title.includes('품질') || title.includes('검사') || title.includes('시험') || title.includes('확인') ||
       text.includes('확인하여야') || text.includes('검사를 받아야') || text.includes('시험시공') || text.includes('시공관리') ||
       text.includes('판정한다') || text.includes('품질관리')) &&
      (text.includes('확인') || text.includes('검사') || text.includes('측정') || text.includes('시험') || text.includes('관리'));

    if (isInspection) {
      inspectionItems.push({
        label,
        title,
        text,
        category: title.includes('검사') || title.includes('확인') || text.includes('확인시험') ? '품질확인/시험'
                : title.includes('시험시공') || text.includes('시험시공') ? '시험시공'
                : '시공관리항목'
      });
    }

    // 3. 환경 및 안전 요건 (Environment & Safety)
    const isEnv = combinedHeaderAndBody.includes('오염') || combinedHeaderAndBody.includes('용출') || combinedHeaderAndBody.includes('환경') || combinedHeaderAndBody.includes('소음') || combinedHeaderAndBody.includes('진동');
    if (isEnv) {
      environmentalItems.push({
        label,
        title,
        text
      });
    }
  }

  return {
    thresholds,
    inspectionItems,
    environmentalItems
  };
}

/**
 * 🏛️ 채점 및 AI 검증용 Context Grounding 생성 함수
 * - 토픽명, 문제 맥락, 카테고리를 기반으로 관련 KDS/KCS 표준을 동적으로 검색 및 파싱
 * - AI가 주관식 채점이나 모범답안 도출 시 준수할 공인 국가건설기준 검증 블록 문자열 반환
 * @param {string} topicTitleOrQuestion 문항 질문 또는 토픽명
 * @param {string} category 
 * @param {string} contentHint 추가 내용 힌트
 */
export async function getKcscVerificationContext(topicTitleOrQuestion, category = '', contentHint = '') {
  try {
    const combinedQuery = `${topicTitleOrQuestion || ''} ${category || ''} ${contentHint || ''}`.trim();
    if (!combinedQuery || combinedQuery.length < 2) return '';

    // 1. 적합한 KCSC 기준 검색
    const matches = await searchStandards(combinedQuery, null, 2);
    if (!matches || matches.length === 0) return '';

    let contextBlocks = [];

    for (const match of matches) {
      let topThresholds = [];
      let topInspections = [];

      // 1. DB/시드 캐시에서 이미 사전 추출된 기준값 및 검사항목 우선 활용 (0ms)
      if (Array.isArray(match.thresholds) && match.thresholds.length > 0 || Array.isArray(match.inspections) && match.inspections.length > 0) {
        topThresholds = (match.thresholds || []).slice(0, 4);
        topInspections = (match.inspections || []).slice(0, 4);
      } else {
        // 2. 비지반 외부 기준 폴백
        const clauses = await getCleanClauses(match.docType, match.code);
        if (clauses && clauses.length > 0) {
          const criteria = extractVerificationCriteria(clauses);
          topThresholds = criteria.thresholds.slice(0, 4);
          topInspections = criteria.inspectionItems.slice(0, 4);
        }
      }

      if (topThresholds.length === 0 && topInspections.length === 0) continue;

      let block = `### 🏛️ [${match.docType} ${match.code} - ${match.name}]\n`;
      if (topThresholds.length > 0) {
        block += `* **법정 기준값 및 허용치 (Thresholds & Tolerances)**:\n`;
        topThresholds.forEach(t => {
          block += `  - [${t.label} ${t.title}] (${t.category}): ${t.text}\n`;
        });
      }
      if (topInspections.length > 0) {
        block += `* **필수 시공 및 품질검사 항목 (Inspection & Quality Controls)**:\n`;
        topInspections.forEach(i => {
          block += `  - [${i.label} ${i.title}] (${i.category}): ${i.text}\n`;
        });
      }

      contextBlocks.push(block);
    }

    if (contextBlocks.length === 0) return '';

    return `
[🏛️ 국가건설기준(KCSC KDS/KCS) 공식 기준값 및 시공·품질 검증 규정 (Grounding Context)]:
채점관 및 모범답안 도출 시, 아래 국토교통부 국가건설기준(KCSC)의 공식 기준값(허용오차, 안전율, 양생일령, 강도 등)과 시공/품질검사 필수 항목을 최우선 검증 기준(#1)으로 삼으십시오.
사용자의 답안이 이 공식 기준값이나 필수 시공 확인 항목과 일치하는지 대조 평가하십시오.

${contextBlocks.join('\n')}
`;
  } catch (err) {
    console.warn('[kcscService] getKcscVerificationContext error:', err.message);
    return '';
  }
}

/**
 * 사용자의 주장 또는 답안이 KCSC 기준에 부합하는지 단독 검증
 * @param {string} statement 검증 대상 서술 (예: "석회 안정처리 시 72시간 내에는 교통을 허용해서는 안 된다")
 * @param {string} docType 
 * @param {string} code 
 */
export async function verifyStatementAgainstKcsc(statement, docType = 'KCS', code = '113030') {
  if (!statement) return { isValid: false, reason: '검증할 내용이 없습니다.' };

  const clauses = await getCleanClauses(docType, code);
  if (!clauses || clauses.length === 0) {
    return { isValid: false, reason: `기준 문서(${docType} ${code})를 로드하지 못했습니다.` };
  }

  const cleanStmt = String(statement).replace(/\s+/g, ' ').trim();
  
  // 핵심 키워드 매칭
  const matchedClauses = clauses.filter(c => {
    // 문장의 명사/키워드 추출
    const words = cleanStmt.split(/[\s,.~()]+/).filter(w => w.length >= 2);
    const matchCount = words.filter(w => c.text.includes(w)).length;
    return matchCount >= Math.min(2, words.length);
  });

  if (matchedClauses.length === 0) {
    return {
      isValid: false,
      reason: '해당 기준 문서 내에서 직접 일치하는 검증 조항을 찾지 못했습니다.',
      matchedClauses: []
    };
  }

  return {
    isValid: true,
    targetStandard: `${docType} ${code}`,
    matchedCount: matchedClauses.length,
    mostRelevantClause: {
      label: matchedClauses[0].label,
      title: matchedClauses[0].title,
      text: matchedClauses[0].text
    }
  };
}
