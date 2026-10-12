/**
 * 📚 위키피디아(Wikipedia) 공식 Open API 연동 및 영문 지반공학 사전 지식 그라운딩 서비스 (wikipediaService.js)
 * 
 * [AGENTS.md 절대 철칙 준수]:
 * - 영문 위키피디아(English Wikipedia) 공식 REST API (https://en.wikipedia.org/api/rest_v1) 기반 지반·토목공학 표준 사전 지식 연동
 * - 지반공학(DMM, SPT, CPT, RMR, 압밀, 전단강도 등) 한-영 전공 표제어 정밀 매핑(GEO_CIVIL_EN_WIKI_MAP) 탑재
 * - [정유공장], [미세 플라스틱] 등 엉뚱한 비전공 문서의 오염 및 환각 원천 차단 (엄격한 표제어 매칭 필터)
 * - 불일치 시 억지 주입 없이 안전하게 빈값("")을 반환하여 AI 프롬프트 오염 방지
 * - 로컬/서버리스 캐시(server/data/wiki_cache/ 및 os.tmpdir()) 지원으로 초고속 응답 보장
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
 * 🌐 토목·지반·구조공학 한-영 위키피디아 표준 표제어 매핑 딕셔너리
 */
export const GEO_CIVIL_EN_WIKI_MAP = {
  // 1. 연약지반 개량 및 차수 (Ground Improvement & Grouting)
  'dmm': 'Deep cement mixing',
  'dcm': 'Deep cement mixing',
  '심층혼합': 'Deep cement mixing',
  '심층혼합처리': 'Deep cement mixing',
  '심층혼합공법': 'Deep cement mixing',
  '심층혼합처리공법': 'Deep cement mixing',
  '지반개량': 'Ground improvement',
  '지반개량공법': 'Ground improvement',
  '제트그라우팅': 'Jet grouting',
  '고압분사': 'Jet grouting',
  'jsp': 'Jet grouting',
  'rjm': 'Jet grouting',
  'cjp': 'Jet grouting',
  '그라우팅': 'Grouting',
  '약액주입': 'Grouting',
  'pvd': 'Prefabricated vertical drain',
  '플라스틱드레인': 'Prefabricated vertical drain',
  '연약지반': 'Ground improvement',
  '동다짐': 'Dynamic compaction',
  '동압밀': 'Dynamic compaction',
  '샌드컴팩션': 'Vibroflotation',
  'scp': 'Vibroflotation',
  '바이브로플로테이션': 'Vibroflotation',
  '치환공법': 'Ground improvement',
  '모래다짐말뚝': 'Vibroflotation',
  '웰포인트': 'Wellpoint',
  '진공압밀': 'Vacuum consolidation',

  // 2. 토질역학 및 전단강도 (Soil Mechanics & Shear Strength)
  '삼축압축': 'Triaxial shear test',
  '삼축압축시험': 'Triaxial shear test',
  'cu': 'Triaxial shear test',
  'cd': 'Triaxial shear test',
  'uu': 'Triaxial shear test',
  '전단강도': 'Shear strength (soil)',
  '직접전단': 'Direct shear test',
  '일축압축': 'Unconfined compressive strength',
  '모어원': 'Mohr–Coulomb theory',
  '쿨롱': 'Mohr–Coulomb theory',
  '모어쿨롱': 'Mohr–Coulomb theory',
  '간극수압': 'Pore water pressure',
  '과잉간극수압': 'Pore water pressure',
  '유효응력': 'Effective stress',
  '응력경로': 'Stress path',
  '액상화': 'Soil liquefaction',
  '지진액상화': 'Soil liquefaction',
  '사면안정': 'Slope stability',
  '비탈면': 'Slope stability',
  '한계평형': 'Limit equilibrium',
  '토질역학': 'Soil mechanics',

  // 3. 압밀 및 침하 (Consolidation & Settlement)
  '압밀': 'Consolidation (soil)',
  '압밀시험': 'Consolidation (soil)',
  '1차원압밀': 'Consolidation (soil)',
  '테르자기': "Terzaghi's principle",
  '압밀침하': 'Settlement (structural)',
  '침하량': 'Settlement (structural)',
  '즉시침하': 'Settlement (structural)',
  '탄성침하': 'Settlement (structural)',
  '2차압밀': 'Secondary compression',
  '과압밀비': 'Overconsolidation ratio',
  'ocr': 'Overconsolidation ratio',
  '정규압밀': 'Overconsolidation ratio',
  '과압밀': 'Overconsolidation ratio',

  // 4. 지반조사 및 원위치 시험 (Site Investigation & In-situ Testing)
  '표준관입': 'Standard penetration test',
  '표준관입시험': 'Standard penetration test',
  'spt': 'Standard penetration test',
  '콘관입': 'Cone penetration test',
  '콘관입시험': 'Cone penetration test',
  'cpt': 'Cone penetration test',
  'cptu': 'Cone penetration test',
  '평판재하': 'Plate bearing test',
  '평판재하시험': 'Plate bearing test',
  'pbt': 'Plate bearing test',
  '베인전단': 'Vane shear test',
  '프레셔미터': 'Pressuremeter test',
  'pmt': 'Pressuremeter test',
  '지하수위': 'Groundwater',
  '투수시험': 'Hydraulic conductivity',
  '투수계수': 'Hydraulic conductivity',
  '유선망': 'Flow net',
  '침투': 'Seepage (hydrology)',
  '파이핑': 'Piping (geology)',
  '보일링': 'Quick sand',
  '히빙': 'Heave (soil)',

  // 5. 흙막이, 옹벽, 지중구조물 (Retaining Structures & Earth Pressure)
  '흙막이': 'Retaining wall',
  '가시설': 'Retaining wall',
  '옹벽': 'Retaining wall',
  '보강토': 'Mechanically stabilized earth',
  '보강토옹벽': 'Mechanically stabilized earth',
  'mse': 'Mechanically stabilized earth',
  '지중연속벽': 'Slurry wall',
  '슬러리월': 'Slurry wall',
  '지하연속벽': 'Slurry wall',
  '그라운드앵커': 'Tieback (geotechnical)',
  '어스앵커': 'Tieback (geotechnical)',
  '토압': 'Lateral earth pressure',
  '주동토압': 'Lateral earth pressure',
  '수동토압': 'Lateral earth pressure',
  '정지토압': 'Lateral earth pressure',
  '소일네일링': 'Soil nailing',
  '소일네일': 'Soil nailing',

  // 6. 기초공학 (Foundations)
  '지지력': 'Bearing capacity',
  '극한지지력': 'Bearing capacity',
  '기초': 'Foundation (engineering)',
  '직접기초': 'Shallow foundation',
  '얕은기초': 'Shallow foundation',
  '말뚝': 'Deep foundation',
  '말뚝기초': 'Deep foundation',
  '현장타설말뚝': 'Deep foundation',
  '케이슨': 'Caisson (engineering)',
  '부력': 'Buoyancy',
  '양압력': 'Uplift (geology)',

  // 7. 터널 및 암반공학 (Tunnels & Rock Mechanics)
  '터널': 'Tunnel',
  'natm': 'New Austrian tunneling method',
  'tbm': 'Tunnel boring machine',
  '침매터널': 'Immersed tube',
  '숏크리트': 'Shotcrete',
  '록볼트': 'Rock bolt',
  '강지보': 'Tunnel support',
  '암반분류': 'Rock mass classification',
  'rmr': 'Rock mass rating',
  'q시스템': 'Q-system',
  'qsystem': 'Q-system',
  '불연속면': 'Discontinuity (geology)',
  'rqd': 'Rock mass classification',
  '절리': 'Joint (geology)',
  '단층': 'Fault (geology)',

  // 8. 흙의 기본 성질 (Soil Properties & Classification)
  '통일분류법': 'Unified Soil Classification System',
  'uscs': 'Unified Soil Classification System',
  '아터버그': 'Atterberg limits',
  '액성한계': 'Atterberg limits',
  '소성한계': 'Atterberg limits',
  '소성지수': 'Atterberg limits',
  '다짐': 'Soil compaction',
  '상대밀도': 'Relative density',
  '간극비': 'Void ratio',
  '포화도': 'Water content',
  '함수비': 'Water content',

  // 9. 구조 및 지진공학 (Structural & Earthquake Engineering)
  '면진': 'Base isolation',
  '제진': 'Tuned mass damper',
  '내진': 'Earthquake engineering',
  '지진': 'Earthquake',
  '응답스펙트럼': 'Response spectrum'
};

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
 * 텍스트에서 괄호 속 영문 약어(DMM, SPT, CU/CD 등) 및 국문 키워드를 분석하여 영문 위키 표제어 도출
 */
export function resolveEnglishWikiTitle(query) {
  if (!query) return null;
  const lower = query.toLowerCase();

  // 1. 괄호 속 핵심 영문 약어 우선 매칭 (예: (DMM), (SPT), (CU/CD), [RMR] 등)
  const acrMatches = query.matchAll(/[\(\[]([A-Za-z0-9_\/-]+)[\)\]]/g);
  for (const m of acrMatches) {
    const rawAcr = m[1].toLowerCase();
    const parts = rawAcr.split(/[\/,_-]/);
    for (const p of parts) {
      if (GEO_CIVIL_EN_WIKI_MAP[p]) {
        return GEO_CIVIL_EN_WIKI_MAP[p];
      }
    }
    if (GEO_CIVIL_EN_WIKI_MAP[rawAcr]) {
      return GEO_CIVIL_EN_WIKI_MAP[rawAcr];
    }
  }

  // 2. 본문 내 독립 영문 약어 검출 (예: DMM, SPT, CPT, RMR 등)
  const englishWords = query.match(/\b[A-Za-z]{2,8}\b/g) || [];
  for (const w of englishWords) {
    const wLower = w.toLowerCase();
    if (GEO_CIVIL_EN_WIKI_MAP[wLower]) {
      return GEO_CIVIL_EN_WIKI_MAP[wLower];
    }
  }

  // 3. 한국어 지반공학 용어 매핑 (긴 키워드 우선 매칭)
  const sortedKeys = Object.keys(GEO_CIVIL_EN_WIKI_MAP).sort((a, b) => b.length - a.length);
  for (const koKey of sortedKeys) {
    if (lower.includes(koKey)) {
      return GEO_CIVIL_EN_WIKI_MAP[koKey];
    }
  }

  return null;
}

/**
 * 특정 표제어의 위키백과 Summary 조회
 * @param {string} title 표제어
 * @param {string} lang 'en' | 'ko'
 */
export async function getWikiSummary(title, lang = 'en') {
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

  if (data && data.extract && data.type !== 'disambiguation' && !data.extract.includes('동음이의') && !data.extract.includes('may refer to')) {
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
 * @param {string} lang 'en' | 'ko'
 */
export async function searchWiki(query, lang = 'en', limit = 5) {
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

  memoryWikiCache.set(cacheKey, results);
  return results;
}

/**
 * 📚 [핵심 함수]: 질문이나 토픽에 대해 영문 위키피디아 사전 지식을 정밀 조회하여 Grounding 블록 반환
 * - 1순위: 지반공학 한-영 매핑 딕셔너리 기반 정확한 영문 위키 문서(Deep cement mixing 등) 즉각 추출
 * - 2순위: 질문 내 영문 전문 키워드(Terzaghi 등) 기반 영문 위키 공학 문서 검색
 * - [철칙]: 검색어와 무관한 일반 문서([정유공장], [미세 플라스틱] 등) 100% 기각 및 차단
 * @param {string} queryOrMessage 질문 텍스트 또는 토픽명
 */
export async function getWikipediaKnowledge(queryOrMessage) {
  if (!queryOrMessage || String(queryOrMessage).trim().length < 2) return '';

  const queryStr = String(queryOrMessage).trim();

  // 1. 영문 지반공학 표준 표제어 매핑 확인
  const matchedEnTitle = resolveEnglishWikiTitle(queryStr);
  let summary = null;

  if (matchedEnTitle) {
    summary = await getWikiSummary(matchedEnTitle, 'en');
  }

  // 2. 매핑 미적중 시: 영문 전문 용어(학자명, 기술명 등)가 질문에 포함되어 있는 경우에 한해 영문 위키 공학 검색
  if (!summary) {
    const enTerms = queryStr.match(/\b[A-Za-z]{3,15}\b/g) || [];
    for (const term of enTerms) {
      const hits = await searchWiki(`${term} geotechnical`, 'en', 3);
      for (const hit of hits) {
        // 공학 연관 검증 (title 또는 snippet에 지반/토목 관련어가 있어야만 채택)
        const hitText = (hit.title + ' ' + hit.snippet).toLowerCase();
        const isGeoRelated = /soil|rock|geotechnical|foundation|ground|civil|slope|retaining|tunnel|shear|mechanics/.test(hitText);
        if (isGeoRelated) {
          const s = await getWikiSummary(hit.title, 'en');
          if (s) {
            summary = s;
            break;
          }
        }
      }
      if (summary) break;
    }
  }

  // 3. 지반공학적 연관성이 전혀 없는 경우 엉뚱한 문서([정유공장] 등)를 강제 주입하지 않고 빈값 반환
  if (!summary) return '';

  const block = `- **표제어**: [${summary.title}] (English Wikipedia)
  - **공학적 정의 및 핵심 내용**:
    ${summary.extract}
  - **출처**: ${summary.pageUrl}`;

  return `
[📚 위키피디아 공학 사전 지식 (English Wikipedia Grounding)]:
답변 또는 문제 출제 전, 아래 영문 위키피디아 사전의 공학적 개념 정의 및 거동 원리를 최우선 참조하여 전공 이론의 환각(Hallucination)을 철저히 방지하십시오:
${block}
`;
}
