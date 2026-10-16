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
import { callLLMWithFailover } from './aiService.js';

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

import crypto from 'crypto';
import { dbQuery } from '../database.js';

let dbWikiKnowledgeCache = null;
let dbWikiMap = new Map(); // canonical_title.toLowerCase() -> item

/**
 * 📚 DB(PostgreSQL/SQLite) 또는 시드 파일(seeds/wiki_geotechnical_seed.json)로부터
 * 영문 위키피디아 지반공학 지식 DB(70+개)를 인메모리에 0ms 즉각 적재
 */
export async function ensureWikiDbLoaded() {
  if (dbWikiKnowledgeCache && dbWikiKnowledgeCache.length > 0) {
    return dbWikiKnowledgeCache;
  }

  // 1. Try DB
  try {
    const rows = await dbQuery.all('SELECT canonical_title, ko_title, ko_keywords, category, description, extract, page_url FROM wiki_knowledge');
    if (Array.isArray(rows) && rows.length > 0) {
      dbWikiKnowledgeCache = rows.map(r => ({
        canonicalTitle: r.canonical_title,
        koTitle: r.ko_title,
        koKeywords: r.ko_keywords || '',
        category: r.category,
        description: r.description || '',
        extract: r.extract,
        pageUrl: r.page_url
      }));
      dbWikiMap.clear();
      for (const item of dbWikiKnowledgeCache) {
        dbWikiMap.set(item.canonicalTitle.toLowerCase(), item);
      }
      return dbWikiKnowledgeCache;
    }
  } catch (err) {
    console.warn('[wikipediaService] Load from DB failed, checking seed file:', err.message);
  }

  // 2. Fallback seed JSON
  const seedPath = path.resolve(__dirname, '../data/seeds/wiki_geotechnical_seed.json');
  if (fs.existsSync(seedPath)) {
    try {
      const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      if (Array.isArray(seedData) && seedData.length > 0) {
        dbWikiKnowledgeCache = seedData;
        dbWikiMap.clear();
        for (const item of dbWikiKnowledgeCache) {
          dbWikiMap.set(item.canonicalTitle.toLowerCase(), item);
        }
        return dbWikiKnowledgeCache;
      }
    } catch (e) {
      console.warn('[wikipediaService] Read seed file failed:', e.message);
    }
  }

  dbWikiKnowledgeCache = [];
  return dbWikiKnowledgeCache;
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
  '지반개량': 'Soil stabilization',
  '지반개량공법': 'Soil stabilization',
  '연약지반': 'Soil stabilization',
  '연약지반개량': 'Soil stabilization',
  '토질개량': 'Soil stabilization',
  '토질안정': 'Soil stabilization',
  'soil stabilization': 'Soil stabilization',
  'ground improvement': 'Soil stabilization',
  '제트그라우팅': 'Jet grouting',
  '고압분사': 'Jet grouting',
  'jsp': 'Jet grouting',
  'rjm': 'Jet grouting',
  'cjp': 'Jet grouting',
  '그라우팅': 'Grouting',
  '약액주입': 'Grouting',
  'pvd': 'Prefabricated vertical drain',
  '플라스틱드레인': 'Prefabricated vertical drain',
  '동다짐': 'Dynamic compaction',
  '동압밀': 'Dynamic compaction',
  '샌드컴팩션': 'Vibroflotation',
  'scp': 'Vibroflotation',
  '바이브로플로테이션': 'Vibroflotation',
  '웰포인트': 'Dewatering',
  '웰포인트공법': 'Dewatering',
  '지하수위저하': 'Dewatering',
  '딥웰': 'Dewatering',
  '진공압밀': 'Vacuum consolidation',
  '언더피닝': 'Underpinning',
  '지반조사': 'Geotechnical investigation',
  '시추조사': 'Geotechnical investigation',

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
  '한계상태토질역학': 'Critical state soil mechanics',
  '한계상태': 'Critical state soil mechanics',
  'cam-clay': 'Critical state soil mechanics',
  '캠클레이': 'Critical state soil mechanics',
  '토질역학': 'Soil mechanics',

  // 3. 압밀 및 침하 (Consolidation & Settlement)
  '압밀': 'Consolidation (soil)',
  '압밀시험': 'Consolidation (soil)',
  '1차원압밀': 'Consolidation (soil)',
  '아사오카': 'Consolidation (soil)',
  '아사오카법': 'Consolidation (soil)',
  'asaoka': 'Consolidation (soil)',
  '쌍곡선법': 'Consolidation (soil)',
  '호시노법': 'Consolidation (soil)',
  '몬덴법': 'Consolidation (soil)',
  '장래침하': 'Consolidation (soil)',
  '침하예측': 'Consolidation (soil)',
  '선행재하': 'Consolidation (soil)',
  '선행재하공법': 'Consolidation (soil)',
  '프리로딩': 'Consolidation (soil)',
  '과재성토': 'Consolidation (soil)',
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
  '격자지보': 'Tunnel support',
  '지반반응곡선': 'Ground reaction curve',
  'grc': 'Ground reaction curve',
  '강관다단': 'Pipe roofing method',
  '파이프루프': 'Pipe roofing method',
  '포어폴링': 'Pipe roofing method',
  '암반분류': 'Rock mass classification',
  'rmr': 'Rock mass rating',
  'q시스템': 'Q-system',
  'qsystem': 'Q-system',
  'gsi': 'Geological Strength Index',
  '훅브라운': 'Hoek–Brown failure criterion',
  '불연속면': 'Discontinuity (geology)',
  'rqd': 'Rock mass classification',
  '절리': 'Joint (geology)',
  '단층': 'Fault (geology)',

  // 8. 흙의 기본 성질 및 광물 (Soil Properties & Mineralogy)
  '통일분류법': 'Unified Soil Classification System',
  'uscs': 'Unified Soil Classification System',
  'aashto': 'AASHTO Soil Classification System',
  '아스토': 'AASHTO Soil Classification System',
  '아터버그': 'Atterberg limits',
  '액성한계': 'Atterberg limits',
  '소성한계': 'Atterberg limits',
  '소성지수': 'Atterberg limits',
  '수축한계': 'Atterberg limits',
  '액성지수': 'Atterberg limits',
  '최적함수비': 'Soil compaction',
  'omc': 'Soil compaction',
  '다짐곡선': 'Soil compaction',
  '다짐': 'Soil compaction',
  '상대밀도': 'Relative density',
  '간극비': 'Void ratio',
  '공극비': 'Void ratio',
  '간극률': 'Porosity',
  '공극률': 'Porosity',
  '포화도': 'Water content',
  '함수비': 'Water content',
  '입도분포': 'Particle-size distribution',
  '체분석': 'Sieve analysis',
  '비중계': 'Hydrometer',
  '점토광물': 'Clay minerals',
  '카올리나이트': 'Kaolinite',
  '일라이트': 'Illite',
  '스멕타이트': 'Smectite',
  '몬모릴로나이트': 'Smectite',
  '동상': 'Frost heaving',
  '동결심도': 'Frost heaving',

  // 9. 사면안정 및 기초공학 확장 (Slope Stability & Foundations)
  '사면안정해석': 'Slope stability analysis',
  '절편법': 'Slope stability analysis',
  '낙석': 'Rockfall',
  '토석류': 'Debris flow',
  '안식각': 'Angle of repose',
  '전면기초': 'Mat foundation',
  '매트기초': 'Mat foundation',
  '현장타설말뚝': 'Drilled shaft',
  'rcd': 'Drilled shaft',
  '마이크로파일': 'Micropile',
  '부마찰력': 'Negative skin friction',
  '말뚝재하': 'Pile load test',
  '파동방정식': 'Wave equation analysis',
  'weap': 'Wave equation analysis',
  'capwap': 'Pile load test',
  '스톤칼럼': 'Stone column',
  '쇄석다짐말뚝': 'Stone column',
  '컴팩션그라우팅': 'Compaction grouting',
  'cgs': 'Compaction grouting',
  '지오텍스타일': 'Geotextile',
  '지오그리드': 'Geogrid',

  // 10. 지반조사 및 현장계측 (Site Investigation & Instrumentation)
  '공내재하': 'Pressuremeter test',
  '딜라토미터': 'Flat dilatometer test',
  'dmt': 'Flat dilatometer test',
  '탄성파굴절법': 'Seismic refraction',
  '전기비저항': 'Electrical resistivity tomography',
  '지중경사계': 'Inclinometer',
  '간극수압계': 'Piezometer',

  // 11. 지반 동역학 및 내진 (Geotechnical Earthquake Engineering)
  '면진': 'Seismic base isolation',
  '지진격리': 'Seismic base isolation',
  '제진': 'Tuned mass damper',
  '동흡진기': 'Tuned mass damper',
  '내진': 'Earthquake engineering',
  '내진설계': 'Earthquake engineering',
  '지진': 'Earthquake',
  '응답스펙트럼': 'Response spectrum',
  '전단탄성계수': 'Shear modulus',
  '반복유동': 'Cyclic mobility'
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
 * 텍스트에서 괄호 속 영문 약어(DMM, SPT, CU/CD 등) 및 국문 키워드를 분석하여 복수의 영문 위키 표제어 도출
 */
export function resolveEnglishWikiTitles(query, maxTitles = 2) {
  if (!query) return [];
  const lower = query.toLowerCase();
  const matched = [];
  const seen = new Set();
  const addTitle = (t) => {
    if (!t) return;
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      matched.push(t);
    }
  };

  // 1. 괄호 속 핵심 영문 약어 우선 매칭 (예: (DMM), (SPT), (CU/CD), [RMR] 등)
  const acrMatches = query.matchAll(/[\(\[]([A-Za-z0-9_\/-]+)[\)\]]/g);
  for (const m of acrMatches) {
    const rawAcr = m[1].toLowerCase();
    const parts = rawAcr.split(/[\/,_-]/);
    for (const p of parts) {
      if (GEO_CIVIL_EN_WIKI_MAP[p]) {
        addTitle(GEO_CIVIL_EN_WIKI_MAP[p]);
        if (matched.length >= maxTitles) return matched;
      }
    }
    if (GEO_CIVIL_EN_WIKI_MAP[rawAcr]) {
      addTitle(GEO_CIVIL_EN_WIKI_MAP[rawAcr]);
      if (matched.length >= maxTitles) return matched;
    }
  }

  // 2. 본문 내 독립 영문 약어 검출 (예: DMM, SPT, CPT, RMR 등)
  const englishWords = query.match(/\b[A-Za-z]{2,8}\b/g) || [];
  for (const w of englishWords) {
    const wLower = w.toLowerCase();
    if (GEO_CIVIL_EN_WIKI_MAP[wLower]) {
      addTitle(GEO_CIVIL_EN_WIKI_MAP[wLower]);
      if (matched.length >= maxTitles) return matched;
    }
  }

  // 3. 한국어 지반공학 용어 매핑 (긴 키워드 우선 매칭, 부분문자열 중복 방지)
  const sortedKeys = Object.keys(GEO_CIVIL_EN_WIKI_MAP).sort((a, b) => b.length - a.length);
  const matchedKoKeys = [];
  for (const koKey of sortedKeys) {
    if (lower.includes(koKey)) {
      if (matchedKoKeys.some(prev => prev.includes(koKey))) continue;
      matchedKoKeys.push(koKey);
      addTitle(GEO_CIVIL_EN_WIKI_MAP[koKey]);
      if (matched.length >= maxTitles) return matched;
    }
  }

  return matched;
}

/**
 * 텍스트에서 괄호 속 영문 약어(DMM, SPT, CU/CD 등) 및 국문 키워드를 분석하여 단일 영문 위키 표제어 도출
 */
export function resolveEnglishWikiTitle(query) {
  const titles = resolveEnglishWikiTitles(query, 1);
  return titles.length > 0 ? titles[0] : null;
}

/**
 * 위키백과 본문에서 각주/참고문헌/외부링크 제거 및 분량 최적화 (Clean & Rich Sections)
 */
export function cleanWikiArticle(raw) {
  if (!raw) return '';
  const cutoffRegex = /\n==\s*(References|See also|External links|Notes|Bibliography|Further reading)\s*==/i;
  let text = raw.split(cutoffRegex)[0].trim();
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

  if (text.length > 8500) {
    const sections = text.split(/\n(?=== )/);
    let accumulated = '';
    for (const sec of sections) {
      const secHeader = sec.split('\n')[0].toLowerCase();
      if (accumulated.length > 5000 && (secHeader.includes('history') || secHeader.includes('etymology') || secHeader.includes('early'))) {
        continue;
      }
      if (accumulated.length + sec.length <= 8500) {
        accumulated += (accumulated ? '\n\n' : '') + sec;
      } else {
        const remaining = 8500 - accumulated.length;
        if (remaining > 500) {
          const trimmedSec = sec.slice(0, remaining).replace(/\n[^\n]*$/, '');
          accumulated += (accumulated ? '\n\n' : '') + trimmedSec;
        }
        break;
      }
    }
    return accumulated.trim();
  }

  return text;
}

/**
 * 특정 표제어의 위키백과 본문(Rich Engineering Text) 조회
 * (Action API 풀텍스트 우선 수집 -> 요약 API Fallback)
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

  // 1. Action API를 통한 풍부한 공학 본문(Rich Full Extract) 우선 수집
  try {
    const fullUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=true&redirects=1&titles=${encodeURIComponent(cleanTitle)}&format=json`;
    const fullData = await fetchWikiJson(fullUrl);
    const pages = fullData?.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    const rawExtract = pages[pageId]?.extract || '';
    const cleanExtract = cleanWikiArticle(rawExtract);

    if (cleanExtract && cleanExtract.length > 200) {
      const result = {
        title: pages[pageId]?.title || title,
        description: '',
        extract: cleanExtract,
        pageUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(cleanTitle)}`,
        lang
      };
      memoryWikiCache.set(cacheKey, result);
      try {
        fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf8');
      } catch (e) {}
      return result;
    }
  } catch (err) {}

  // 2. 풀텍스트 실패 시 기본 요약(REST summary) API로 안전한 Fallback
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
 * 🤖 AI 기반 영문 지반·토목공학 표준 표제어 정제 시스템 프롬프트
 */
export const WIKI_AI_REFINE_SYSTEM_PROMPT = `You are a Civil & Geotechnical Engineering Terminology Expert.
Given a Korean engineering query, question, or topic, extract and translate it into the single most canonical English Wikipedia article title for civil/geotechnical engineering.
Use standard, established English Wikipedia titles (e.g. 'Slope stability', 'Tunnel boring machine', 'Retaining wall', 'Deep cement mixing', 'Deep foundation', 'Rock mass classification', 'Bearing capacity', 'Soil mechanics', 'Grouting', 'Underpinning', 'Slurry wall').
Prefer general, canonical Wikipedia article titles over overly narrow composite phrases.

Rules:
1. Output ONLY the exact English Wikipedia article title.
2. If the input is not related to civil, geotechnical, geological, or structural engineering, output 'NONE'.
3. Do not output explanations, markdown, quotes, or trailing punctuation.`;

/**
 * 🤖 국문 질문/토픽을 AI(Gemini)로 분석하여 영문 위키백과 표준 표제어로 동적 정제
 * - 1순위: 내장 딕셔너리(GEO_CIVIL_EN_WIKI_MAP) 0ms 즉각 매칭
 * - 2순위: 캐시(Memory & File) 적중 시 즉각 반환
 * - 3순위: Gemini LLM으로 영문 표준 전공 표제어 추출 (비전공 질문은 'NONE' 반환)
 * @param {string} queryText 
 * @returns {Promise<string|null>} 정제된 영문 표제어 또는 null
 */
export async function refineQueryToEnglishWikiTitle(queryText) {
  if (!queryText || typeof queryText !== 'string' || queryText.trim().length < 2) return null;
  
  // 1. 사전 매핑 즉각 확인 (0ms)
  const directMatch = resolveEnglishWikiTitle(queryText);
  if (directMatch) return directMatch;

  const cleanInput = queryText.trim().substring(0, 300);
  const hash = crypto.createHash('md5').update(cleanInput).digest('hex');
  const cacheKey = `ai_refine_${hash}`;

  // 2. 인메모리 캐시 확인
  if (memoryWikiCache.has(cacheKey)) {
    return memoryWikiCache.get(cacheKey);
  }

  // 3. 디스크 캐시 확인
  const cachePath = path.join(WIKI_CACHE_DIR, `${encodeURIComponent(cacheKey)}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (data && data.refinedTitle) {
        memoryWikiCache.set(cacheKey, data.refinedTitle);
        return data.refinedTitle;
      }
    } catch (e) {}
  }

  // 4. AI(Gemini) 동적 번역 및 표제어 정제
  try {
    const rawEnTitle = await callLLMWithFailover(
      WIKI_AI_REFINE_SYSTEM_PROMPT,
      `Input text: "${cleanInput}"\nCanonical English Wikipedia title:`,
      null,
      'general',
      { temperature: 0.1, preferredModel: 'gemini-3.5-flash-lite' }
    );
    const cleanTitle = (rawEnTitle || '')
      .trim()
      .replace(/^['"`]+|['"`]+$/g, '')
      .replace(/^Wikipedia:\s*/i, '')
      .replace(/[.\n\r]+$/, '')
      .trim();

    if (cleanTitle) {
      memoryWikiCache.set(cacheKey, cleanTitle);
      try {
        fs.writeFileSync(cachePath, JSON.stringify({ original: cleanInput, refinedTitle: cleanTitle }, null, 2), 'utf8');
      } catch (err) {}
      return cleanTitle;
    }
  } catch (err) {
    console.warn('[wikipediaService] AI refinement error:', err.message);
  }

  return null;
}

/**
 * DB 키워드 1개가 질의 문자열(lowerQ, 소문자)에 대한 '단독 근거'가 될 수 있는지 판정
 * - 한글 키워드: 조사 결합(예: '압밀을')을 고려해 부분 문자열 일치
 * - 영문·숫자 키워드: 단어 경계 일치 ('nc'가 'async' 안에서 일치하는 오탐 방지)
 * - 3자 이하 영문 약어('vs', 'cu' 등)는 일반 영어와 겹치므로 단독 근거로 인정하지 않음
 */
const WIKI_SHORT_ASCII_KEYWORD_MAX = 3;
export function isWikiKeywordStrongHit(lowerQ, keyword) {
  const k = String(keyword || '').trim().toLowerCase();
  if (k.length < 2) return false;
  if (/^[a-z0-9]+$/.test(k)) {
    if (k.length <= WIKI_SHORT_ASCII_KEYWORD_MAX) return false;
    return new RegExp(`(?<![a-z0-9])${k}(?![a-z0-9])`).test(lowerQ);
  }
  return lowerQ.includes(k);
}

/**
 * 📚 [핵심 함수]: 질문이나 토픽에 대해 영문 위키피디아 사전 지식을 정밀 조회하여 Grounding 블록 반환 (DB 우선 0ms 초고속)
 * - 1순위: 지반공학 한-영 매핑 딕셔너리 및 DB 표제어 캐시 즉각 추출 (최대 2개 개념 비교 대응, 0ms)
 * - 2순위: 지반 전수 DB(wiki_knowledge) 국문 키워드/제목 직통 매칭 (0ms)
 * - 3순위: AI(Gemini) 동적 영문 표제어 정제 레이어 가동 -> 영문 위키 요약/검색 연동
 * - [철칙]: 검색어와 무관한 일반 문서([정유공장], [미세 플라스틱] 등) 100% 기각 및 차단
 * @param {string} queryOrMessage 질문 텍스트 또는 토픽명
 * @param {number} maxTotalChars 반환할 최대 본문 길이 (기본 8500자)
 */
export async function getWikipediaKnowledge(queryOrMessage, maxTotalChars = 8500) {
  if (!queryOrMessage || String(queryOrMessage).trim().length < 2) return '';

  const queryStr = String(queryOrMessage).trim();
  const lowerQ = queryStr.toLowerCase();

  // 0. 영문 위키피디아 지반 전수 DB(wiki_knowledge) 인메모리 캐시 로드 (0ms)
  await ensureWikiDbLoaded();

  const summaries = [];
  const seenTitles = new Set();
  const addSummary = (s) => {
    if (!s || !s.extract) return;
    const tKey = (s.canonicalTitle || s.title || '').toLowerCase();
    if (tKey && !seenTitles.has(tKey)) {
      seenTitles.add(tKey);
      summaries.push(s);
    }
  };

  // 1. 영문 지반공학 표준 표제어 사전 매핑 확인 (복수 비교 개념 최대 2개까지 0ms 초고속 추출)
  const matchedEnTitles = resolveEnglishWikiTitles(queryStr, 2);
  for (const matchedEnTitle of matchedEnTitles) {
    const key = matchedEnTitle.toLowerCase();
    const altKey = key === 'consolidation (soil)' ? 'soil consolidation' : (key === 'soil consolidation' ? 'consolidation (soil)' : key);
    if (dbWikiMap.has(key)) {
      addSummary(dbWikiMap.get(key));
    } else if (dbWikiMap.has(altKey)) {
      addSummary(dbWikiMap.get(altKey));
    } else {
      const s = await getWikiSummary(matchedEnTitle, 'en');
      if (s) addSummary(s);
    }
  }

  // 2. DB 내 국문 키워드(ko_keywords) 및 국문 표제어(ko_title) 직통 매칭 (0ms)
  //    - 한글 키워드: 조사 결합을 고려해 부분 문자열 일치
  //    - 영문·숫자 키워드: 단어 경계 일치 (예: 'nc'가 'async' 안에서 오탐되는 것 방지)
  //    - 3자 이하 영문 약어는 일반 영어와 겹치므로 단독 근거로 쓰지 않고 3단계 AI 정제에 위임
  if (summaries.length === 0 && dbWikiKnowledgeCache && dbWikiKnowledgeCache.length > 0) {
    for (const item of dbWikiKnowledgeCache) {
      const koTitle = (item.koTitle || '').toLowerCase();
      const koKeywords = (item.koKeywords || '').toLowerCase();
      if ((koTitle && lowerQ.includes(koTitle)) || (koKeywords && koKeywords.split(/[\s,]+/).some(k => isWikiKeywordStrongHit(lowerQ, k)))) {
        addSummary(item);
        if (summaries.length >= 2) break;
      }
    }
  }

  // 3. 사전/DB 미적중 시: AI 기반 영문 지반공학 표준 표제어 동적 정제 레이어 가동
  if (summaries.length === 0) {
    const aiRefinedTitle = await refineQueryToEnglishWikiTitle(queryStr);
    if (aiRefinedTitle && aiRefinedTitle.toUpperCase() === 'NONE') {
      // 🛑 AI가 비전공/무관 주제로 판정(NONE)한 경우, 억지 검색을 중단하고 즉시 빈값 반환 (오염 차단)
      return '';
    }
    if (aiRefinedTitle) {
      const key = aiRefinedTitle.toLowerCase();
      if (dbWikiMap.has(key)) {
        addSummary(dbWikiMap.get(key));
      } else {
        let s = await getWikiSummary(aiRefinedTitle, 'en');
        // 위키 표제어 직통 매칭 실패 시 키워드 연관 검색으로 2차 확인
        if (!s) {
          const hits = await searchWiki(`${aiRefinedTitle} geotechnical`, 'en', 3);
          for (const hit of hits) {
            const hitText = (hit.title + ' ' + hit.snippet).toLowerCase();
            const isGeoRelated = /soil|rock|geotechnical|foundation|ground|civil|slope|retaining|tunnel|shear|mechanics|earth|dam|concrete|grout|drilling|excavation|consolidation|settlement/.test(hitText);
            if (isGeoRelated) {
              s = await getWikiSummary(hit.title, 'en');
              if (s) break;
            }
          }
        }
        if (s) addSummary(s);
      }
    }
  }

  // 4. 본문 내 영문 전문 용어(학자명, 기술명 등) 검출 시 공학 연관 검색
  if (summaries.length === 0) {
    const enTerms = queryStr.match(/\b[A-Za-z]{3,15}\b/g) || [];
    for (const term of enTerms) {
      if (['the', 'and', 'for', 'with', 'from', 'this', 'that', 'none'].includes(term.toLowerCase())) continue;
      const key = term.toLowerCase();
      if (dbWikiMap.has(key)) {
        addSummary(dbWikiMap.get(key));
        break;
      }
      const hits = await searchWiki(`${term} geotechnical`, 'en', 3);
      for (const hit of hits) {
        const hitText = (hit.title + ' ' + hit.snippet).toLowerCase();
        const isGeoRelated = /soil|rock|geotechnical|foundation|ground|civil|slope|retaining|tunnel|shear|mechanics|earth|dam|concrete|grout/.test(hitText);
        if (isGeoRelated) {
          const s = await getWikiSummary(hit.title, 'en');
          if (s) {
            addSummary(s);
            break;
          }
        }
      }
      if (summaries.length > 0) break;
    }
  }

  // 5. 지반공학적 연관성이 전혀 없는 경우 엉뚱한 문서([정유공장] 등)를 강제 주입하지 않고 빈값 반환 (철칙 준수)
  if (summaries.length === 0) return '';

  const perArticleLimit = Math.floor(maxTotalChars / summaries.length);
  const blocks = summaries.map(summary => {
    const title = summary.canonicalTitle || summary.title;
    const pageUrl = summary.pageUrl || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
    const extractText = summary.extract.length > perArticleLimit
      ? summary.extract.slice(0, perArticleLimit).replace(/\n[^\n]*$/, '')
      : summary.extract;
    return `- **표제어**: [${title}] (English Wikipedia)
- **공학적 정의, 거동 메커니즘 및 시험·산정 기준**:
${extractText}
- **출처**: ${pageUrl}`;
  });

  return `
[📚 위키피디아 공학 사전 지식 (English Wikipedia Grounding)]:
답변 또는 문제 출제 전, 아래 영문 위키피디아 사전의 공학적 개념 정의 및 거동 원리를 최우선 참조하여 전공 이론의 환각(Hallucination)을 철저히 방지하십시오:
${blocks.join('\n\n')}
`;
}
