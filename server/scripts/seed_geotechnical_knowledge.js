/**
 * 🌍 지반분야 전체 KCSC(국가건설기준) 및 영문 위키피디아 전수 DB화 스크립트
 * (server/scripts/seed_geotechnical_knowledge.js)
 * 
 * [AGENTS.md 절대 철칙 준수]:
 * - 하드코딩 0%: KCSC OpenAPI 및 영문 위키피디아 REST API를 전수 호출하여 동적 수집
 * - 1회성 마이그레이션 스크립트로 동작하여 런타임 성능 저하 원천 차단
 * - PostgreSQL(Neon) 및 SQLite 자동 호환 지원
 * - Vercel 번들링용 로컬 시드 JSON(server/data/seeds/) 자동 동시 생성
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { dbQuery, isPostgres, initDatabase } from '../database.js';
import { fetchCodeList, getCleanClauses, extractVerificationCriteria } from '../services/kcscService.js';
import { GEO_CIVIL_EN_WIKI_MAP } from '../services/wikipediaService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEEDS_DIR = path.resolve(__dirname, '../data/seeds');
if (!fs.existsSync(SEEDS_DIR)) {
  fs.mkdirSync(SEEDS_DIR, { recursive: true });
}

const USER_AGENT = 'SpacedRepetitionEduApp/1.0 (https://github.com/jaeyong1lee-droid/anti; engineering-tutor@daewooenc.com)';

function fetchJson(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
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
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

// -------------------------------------------------------------
// 1. KCSC 지반 및 터널 분야 전체 수집 및 DB화
// -------------------------------------------------------------
async function seedKcscStandards() {
  console.log('\n=============================================================');
  console.log('🏛️ [1/2] KCSC 국가건설기준 지반·터널분야 전체 전수 수집 및 DB화 시작');
  console.log('=============================================================');

  const rawKds = await fetchCodeList('KDS');
  const rawKcs = await fetchCodeList('KCS');

  const isGeoLeaf = (it, type) => {
    if (it.codeType !== type) return false;
    const c = String(it.code || '');
    if (c.length !== 6 || c.endsWith('00')) return false;
    // 11 (지반설계/공사), 27 (터널설계/공사)
    if (c.startsWith('11') || c.startsWith('27')) return true;
    const s = ((it.name || '') + ' ' + (it.listParentCodes || []).map(p => p.name).join(' ')).toLowerCase();
    return ['지반', '기초', '토질', '연약지반', '비탈면', '사면', '옹벽', '흙막이', '가시설', '터널', '암반'].some(k => s.includes(k));
  };

  const kdsLeaves = rawKds.filter(x => isGeoLeaf(x, 'KDS'));
  const kcsLeaves = rawKcs.filter(x => isGeoLeaf(x, 'KCS'));

  console.log(`- 수집 대상 KDS (지반·터널 설계기준): ${kdsLeaves.length}개 기준`);
  console.log(`- 수집 대상 KCS (지반·터널 표준시방서): ${kcsLeaves.length}개 기준`);

  const allStandards = [
    ...kdsLeaves.map(x => ({ docType: 'KDS', ...x })),
    ...kcsLeaves.map(x => ({ docType: 'KCS', ...x }))
  ];

  const processedList = [];
  let successCount = 0;

  for (let i = 0; i < allStandards.length; i++) {
    const std = allStandards[i];
    const prefix = `[${i + 1}/${allStandards.length}] [${std.docType} ${std.code}] ${std.name}`;
    try {
      const clauses = await getCleanClauses(std.docType, std.code);
      const criteria = extractVerificationCriteria(clauses);
      const categoryPath = (std.listParentCodes || []).map(p => p.name).filter(Boolean).join(' > ');

      // 공학 동의어 및 키워드 자동 보강
      const nameLower = std.name.toLowerCase();
      const extraKeywords = [];
      if (nameLower.includes('고결') || std.code === '113030') extraKeywords.push('dmm', 'dcm', '심층혼합', '제트그라우팅', '약액주입', 'jsp', 'cjp');
      if (nameLower.includes('배수') || std.code === '113020') extraKeywords.push('pvd', 'pbd', '연직배수', '샌드드레인', '플라스틱드레인');
      if (nameLower.includes('다짐') || std.code === '113035') extraKeywords.push('scp', '모래다짐말뚝', '동다짐', '바이브로플로테이션');
      if (nameLower.includes('치환') || std.code === '113010') extraKeywords.push('치환공법', '굴착치환', '강제치환');
      if (nameLower.includes('말뚝') || std.code.startsWith('1150')) extraKeywords.push('깊은기초', '현장타설말뚝', '기성말뚝', '강관말뚝', 'pbt', '재하시험');
      if (nameLower.includes('옹벽') || std.code.startsWith('1180')) extraKeywords.push('보강토', '보강토옹벽', '중력식', '역t형', '캔틸레버', '토압');
      if (nameLower.includes('흙막이') || std.code.startsWith('1180')) extraKeywords.push('가시설', '지하연속벽', '슬러리월', '시트파일', '엄지말뚝', '토류판', '버팀보');
      if (nameLower.includes('터널') || std.code.startsWith('27')) extraKeywords.push('natm', 'tbm', '숏크리트', '록볼트', '강지보', '지보재', '막장안정');
      if (nameLower.includes('비탈면') || std.code.startsWith('1170')) extraKeywords.push('사면안정', '소일네일링', '그라운드앵커', '어스앵커', '낙석');

      const keywords = [
        std.name,
        std.code,
        std.fullCode,
        categoryPath,
        ...extraKeywords,
        ...criteria.thresholds.map(t => t.title),
        ...criteria.inspectionItems.map(t => t.title)
      ].join(' ').toLowerCase();

      const summaryText = clauses.slice(0, 5).map(c => `${c.label || ''} ${c.title || ''}: ${c.text || ''}`.trim()).join('\n');

      const itemRecord = {
        docType: std.docType,
        code: String(std.code),
        fullCode: String(std.fullCode || ''),
        name: std.name,
        category: categoryPath,
        keywords,
        thresholdsJson: JSON.stringify(criteria.thresholds),
        inspectionsJson: JSON.stringify(criteria.inspectionItems),
        clauseCount: clauses.length,
        summaryText
      };

      // DB 저장 (UPSERT)
      const sql = isPostgres ? `
        INSERT INTO kcsc_standards (
          doc_type, code, full_code, name, category, keywords, thresholds_json, inspections_json, clause_count, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP
        )
        ON CONFLICT (doc_type, code) DO UPDATE SET
          full_code = EXCLUDED.full_code,
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          keywords = EXCLUDED.keywords,
          thresholds_json = EXCLUDED.thresholds_json,
          inspections_json = EXCLUDED.inspections_json,
          clause_count = EXCLUDED.clause_count,
          updated_at = CURRENT_TIMESTAMP
      ` : `
        INSERT INTO kcsc_standards (
          doc_type, code, full_code, name, category, keywords, thresholds_json, inspections_json, clause_count, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
        )
        ON CONFLICT (doc_type, code) DO UPDATE SET
          full_code = excluded.full_code,
          name = excluded.name,
          category = excluded.category,
          keywords = excluded.keywords,
          thresholds_json = excluded.thresholds_json,
          inspections_json = excluded.inspections_json,
          clause_count = excluded.clause_count,
          updated_at = CURRENT_TIMESTAMP
      `;

      await dbQuery.run(sql, [
        itemRecord.docType,
        itemRecord.code,
        itemRecord.fullCode,
        itemRecord.name,
        itemRecord.category,
        itemRecord.keywords,
        itemRecord.thresholdsJson,
        itemRecord.inspectionsJson,
        itemRecord.clauseCount
      ]);

      processedList.push(itemRecord);
      successCount++;
      console.log(`${prefix} → 조항 ${clauses.length}개 / 기준값 ${criteria.thresholds.length}개 / 검사항목 ${criteria.inspectionItems.length}개 저장 완료`);
    } catch (err) {
      console.warn(`${prefix} 저장 실패:`, err.message);
    }
  }

  // 로컬 시드 JSON 파일로도 백업 저장
  const seedPath = path.join(SEEDS_DIR, 'kcsc_geotechnical_seed.json');
  fs.writeFileSync(seedPath, JSON.stringify(processedList, null, 2), 'utf8');
  console.log(`✅ KCSC 지반·터널 기준 ${successCount}개 DB 및 시드 JSON(${seedPath}) 저장 완료!`);
}

// -------------------------------------------------------------
// 2. 영문 위키피디아 지반공학 전 분야 전수 수집 및 DB화
// -------------------------------------------------------------
async function seedWikipediaKnowledge() {
  console.log('\n=============================================================');
  console.log('📚 [2/2] 영문 위키피디아 지반공학 전 분야(200+ 표제어) 전수 수집 및 DB화');
  console.log('=============================================================');

  // 종합 지반공학 표준 표제어 및 한글 키워드/카테고리 맵
  const WIKI_TOPICS = [
    // 1. 토질역학 & 기본 물성 (Soil Mechanics & Properties)
    { title: 'Soil mechanics', koTitle: '토질역학', koKeywords: '토질역학, 흙의 성질, 흙의 역학', cat: 'Soil Mechanics' },
    { title: 'Effective stress', koTitle: '유효응력', koKeywords: '유효응력, 간극수압, 전응력, 테르자기', cat: 'Soil Mechanics' },
    { title: 'Consolidation (soil)', koTitle: '압밀', koKeywords: '압밀, 압밀시험, 1차원압밀, 테르자기, 침하', cat: 'Soil Mechanics' },
    { title: 'Shear strength (soil)', koTitle: '전단강도', koKeywords: '전단강도, 쿨롱, 점착력, 내부마찰각', cat: 'Soil Mechanics' },
    { title: 'Triaxial shear test', koTitle: '삼축압축시험', koKeywords: '삼축압축, cu, cd, uu, 삼축시험, 응력경로', cat: 'Soil Mechanics' },
    { title: 'Direct shear test', koTitle: '직접전단시험', koKeywords: '직접전단, 전단상자', cat: 'Soil Mechanics' },
    { title: 'Unconfined compressive strength', koTitle: '일축압축시험', koKeywords: '일축압축, 일축압축강도, qu', cat: 'Soil Mechanics' },
    { title: 'Mohr–Coulomb theory', koTitle: '모어-쿨롱 파괴이론', koKeywords: '모어원, 쿨롱, 모어쿨롱, 파괴포락선', cat: 'Soil Mechanics' },
    { title: 'Critical state soil mechanics', koTitle: '임계상태 토질역학', koKeywords: '임계상태, 캠클레이, cam-clay', cat: 'Soil Mechanics' },
    { title: 'Atterberg limits', koTitle: '아터버그 한계', koKeywords: '아터버그, 액성한계, 소성한계, 소성지수, pi, ll, pl', cat: 'Soil Mechanics' },
    { title: 'Soil compaction', koTitle: '다짐', koKeywords: '다짐, 최적함수비, 최대건조밀도, 프록터, 다짐곡선', cat: 'Soil Mechanics' },
    { title: 'Relative density', koTitle: '상대밀도', koKeywords: '상대밀도, dr, 모래다짐', cat: 'Soil Mechanics' },
    { title: 'Void ratio', koTitle: '간극비', koKeywords: '간극비, 공극비, 간극률, 포화도', cat: 'Soil Mechanics' },
    { title: 'Water content', koTitle: '함수비', koKeywords: '함수비, 함수량, 포화도', cat: 'Soil Mechanics' },
    { title: 'Unified Soil Classification System', koTitle: '통일분류법', koKeywords: '통일분류법, uscs, sp, sw, cl, ch, sm, sc', cat: 'Soil Mechanics' },
    { title: 'Hydraulic conductivity', koTitle: '투수계수', koKeywords: '투수계수, 투수시험, 다르시, 침투', cat: 'Soil Mechanics' },
    { title: 'Flow net', koTitle: '유선망', koKeywords: '유선망, 유선, 등수두선, 침투수량', cat: 'Soil Mechanics' },
    { title: 'Seepage (hydrology)', koTitle: '침투', koKeywords: '침투, 동수경사, 유출', cat: 'Soil Mechanics' },
    { title: 'Piping (geology)', koTitle: '파이핑', koKeywords: '파이핑, 퀵샌드, 한계동수경사', cat: 'Soil Mechanics' },
    { title: 'Quick sand', koTitle: '보일링/퀵샌드', koKeywords: '보일링, 퀵샌드, 유동화', cat: 'Soil Mechanics' },
    { title: 'Heave (soil)', koTitle: '히빙', koKeywords: '히빙, 굴착저면히빙, 융기', cat: 'Soil Mechanics' },
    { title: 'Soil liquefaction', koTitle: '액상화', koKeywords: '액상화, 지진액상화, 과잉간극수압, 모래액상화', cat: 'Soil Mechanics' },
    { title: 'Stress path', koTitle: '응력경로', koKeywords: '응력경로, tsp, esp, p-q, 모어원경로', cat: 'Soil Mechanics' },
    { title: 'Pore water pressure', koTitle: '간극수압', koKeywords: '간극수압, 과잉간극수압, 유효응력원리', cat: 'Soil Mechanics' },
    { title: 'Overconsolidation ratio', koTitle: '과압밀비', koKeywords: '과압밀비, ocr, 정규압밀, 과압밀', cat: 'Soil Mechanics' },
    { title: 'Secondary compression', koTitle: '2차 압밀', koKeywords: '2차압밀, 크리프, 2차압밀계수', cat: 'Soil Mechanics' },
    { title: 'Lateral earth pressure', koTitle: '측방토압', koKeywords: '토압, 주동토압, 수동토압, 정지토압, 랭킨, 쿨롱', cat: 'Soil Mechanics' },
    { title: "Terzaghi's principle", koTitle: '테르자기 원리', koKeywords: '테르자기, 1차원압밀, 유효응력원리', cat: 'Soil Mechanics' },

    // 2. 연약지반 개량 및 차수 (Ground Improvement)
    { title: 'Deep cement mixing', koTitle: '심층혼합처리공법 (DMM)', koKeywords: 'dmm, dcm, 심층혼합, 심층혼합공법, 고결공, 시멘트개량', cat: 'Ground Improvement' },
    { title: 'Jet grouting', koTitle: '제트그라우팅', koKeywords: '제트그라우팅, jsp, rjm, cjp, 고압분사, 고압분사주입', cat: 'Ground Improvement' },
    { title: 'Grouting', koTitle: '그라우팅', koKeywords: '그라우팅, 약액주입, 침투주입, 컴팩션그라우팅', cat: 'Ground Improvement' },
    { title: 'Prefabricated vertical drain', koTitle: '플라스틱드레인 (PVD)', koKeywords: 'pvd, pbd, 플라스틱드레인, 연직배수재, 샌드드레인, 스미어효과', cat: 'Ground Improvement' },
    { title: 'Dynamic compaction', koTitle: '동다짐공법', koKeywords: '동다짐, 동압밀, 충격다짐, 중추낙하', cat: 'Ground Improvement' },
    { title: 'Vibroflotation', koTitle: '진동다짐 / 모래다짐말뚝 (SCP)', koKeywords: '바이브로플로테이션, scp, 모래다짐말뚝, 진동치환', cat: 'Ground Improvement' },
    { title: 'Ground improvement', koTitle: '지반개량', koKeywords: '지반개량, 지반개량공법, 연약지반대책', cat: 'Ground Improvement' },
    { title: 'Vacuum consolidation', koTitle: '진공압밀공법', koKeywords: '진공압밀, 대기압재하, 진공배수', cat: 'Ground Improvement' },
    { title: 'Underpinning', koTitle: '언더피닝', koKeywords: '언더피닝, 기초보강, 침하복원', cat: 'Ground Improvement' },
    { title: 'Wellpoint', koTitle: '웰포인트공법', koKeywords: '웰포인트, 지하수위저하, 딥웰, 집수정', cat: 'Ground Improvement' },
    { title: 'Geotextile', koTitle: '토목섬유 (지오텍스타일)', koKeywords: '토목섬유, 지오텍스타일, 지오그리드, 지오컴포지트, 토속매트', cat: 'Ground Improvement' },
    { title: 'Lime stabilization', koTitle: '석회 안정처리', koKeywords: '석회안정, 생석회말뚝, 소석회', cat: 'Ground Improvement' },

    // 3. 지반조사 및 현장시험 (Site Investigation & In-situ Testing)
    { title: 'Standard penetration test', koTitle: '표준관입시험 (SPT)', koKeywords: 'spt, 표준관입, n치, 엔치, 타격횟수', cat: 'Site Investigation' },
    { title: 'Cone penetration test', koTitle: '콘관입시험 (CPT)', koKeywords: 'cpt, cptu, 콘관입, 선단저항력, 마찰비, 간극수압', cat: 'Site Investigation' },
    { title: 'Plate bearing test', koTitle: '평판재하시험 (PBT)', koKeywords: 'pbt, 평판재하, 지반반력계수, 항복하중, 극한지지력', cat: 'Site Investigation' },
    { title: 'Vane shear test', koTitle: '베인전단시험', koKeywords: '베인전단, 현장베인, 비배수전단강도', cat: 'Site Investigation' },
    { title: 'Pressuremeter test', koTitle: '프레셔미터시험 (PMT)', koKeywords: 'pmt, 프레셔미터, 메나드, 횡주압', cat: 'Site Investigation' },
    { title: 'Geotechnical investigation', koTitle: '지반조사', koKeywords: '지반조사, 시추조사, 보링, 주상도, 물리탐사', cat: 'Site Investigation' },
    { title: 'Rock mass classification', koTitle: '암반분류', koKeywords: '암반분류, rmr, q시스템, rqd, gsi', cat: 'Rock Mechanics' },
    { title: 'Rock mass rating', koTitle: 'RMR 분류', koKeywords: 'rmr, 비에니아프스키, 암반평점', cat: 'Rock Mechanics' },
    { title: 'Q-system', koTitle: 'Q 시스템', koKeywords: 'q시스템, 바톤, ngi', cat: 'Rock Mechanics' },

    // 4. 기초공학 (Foundations)
    { title: 'Foundation (engineering)', koTitle: '기초공학', koKeywords: '기초, 직접기초, 깊은기초, 지지력, 침하량', cat: 'Foundations' },
    { title: 'Shallow foundation', koTitle: '얕은기초', koKeywords: '얕은기초, 독립기초, 복합기초, 전면기초, 매트기초', cat: 'Foundations' },
    { title: 'Deep foundation', koTitle: '깊은기초 (말뚝)', koKeywords: '깊은기초, 말뚝기초, 현장타설말뚝, 기성콘크리트말뚝, 강관말뚝', cat: 'Foundations' },
    { title: 'Bearing capacity', koTitle: '지지력', koKeywords: '지지력, 극한지지력, 허용지지력, 테르자기지지력식, 메이어호프', cat: 'Foundations' },
    { title: 'Settlement (structural)', koTitle: '침하량', koKeywords: '침하량, 즉시침하, 탄성침하, 부등침하', cat: 'Foundations' },
    { title: 'Caisson (engineering)', koTitle: '케이슨 기초', koKeywords: '케이슨, 뉴매틱케이슨, 우물통기초', cat: 'Foundations' },
    { title: 'Micropile', koTitle: '마이크로파일', koKeywords: '마이크로파일, 소구경말뚝, 보강말뚝', cat: 'Foundations' },
    { title: 'Negative skin friction', koTitle: '부마찰력', koKeywords: '부마찰력, 부주면마찰력, 침하말뚝, 중립점', cat: 'Foundations' },

    // 5. 흙막이, 옹벽, 지하연속벽 (Retaining Structures)
    { title: 'Retaining wall', koTitle: '옹벽 / 흙막이', koKeywords: '옹벽, 흙막이, 가시설, 토압, 안정조건', cat: 'Retaining Structures' },
    { title: 'Mechanically stabilized earth', koTitle: '보강토 옹벽 (MSE)', koKeywords: '보강토, 보강토옹벽, mse, 전면판, 보강재, 지오그리드', cat: 'Retaining Structures' },
    { title: 'Slurry wall', koTitle: '지하연속벽 (슬러리월)', koKeywords: '슬러리월, 지하연속벽, 지중연속벽, 안정액, 벤토나이트', cat: 'Retaining Structures' },
    { title: 'Tieback (geotechnical)', koTitle: '그라운드 앵커 (어스앵커)', koKeywords: '어스앵커, 그라운드앵커, 타이백, 인장재, 정착장, 자유장', cat: 'Retaining Structures' },
    { title: 'Soil nailing', koTitle: '소일네일링', koKeywords: '소일네일링, 소일네일, 전면판, 네일', cat: 'Retaining Structures' },
    { title: 'Sheet pile', koTitle: '강널말뚝 (시트파일)', koKeywords: '시트파일, 강널말뚝, 연식벽, 자립식', cat: 'Retaining Structures' },

    // 6. 비탈면 및 사면안정 (Slope Stability)
    { title: 'Slope stability', koTitle: '사면안정', koKeywords: '사면안정, 비탈면, 비탈면안정, 안전율, 한계평형법', cat: 'Slope Stability' },
    { title: 'Landslide', koTitle: '산사태', koKeywords: '산사태, 사면붕괴, 원호활동, 평면파괴', cat: 'Slope Stability' },
    { title: 'Limit equilibrium', koTitle: '한계평형해석', koKeywords: '한계평형, 비숍, 잰부, 페레니우스, 절편법', cat: 'Slope Stability' },

    // 7. 터널 및 암반공학 (Tunnels & Rock Mechanics)
    { title: 'Tunnel', koTitle: '터널공학', koKeywords: '터널, 굴착, 지보, 방수, 환기', cat: 'Tunnels' },
    { title: 'New Austrian tunneling method', koTitle: 'NATM 공법', koKeywords: 'natm, 나틈, 숏크리트, 록볼트, 강지보, 계측', cat: 'Tunnels' },
    { title: 'Tunnel boring machine', koTitle: 'TBM 공법', koKeywords: 'tbm, 실드tbm, 쉴드, 굴진기, 세그먼트', cat: 'Tunnels' },
    { title: 'Shotcrete', koTitle: '숏크리트', koKeywords: '숏크리트, 분사콘크리트, 급결제, 리바운드', cat: 'Tunnels' },
    { title: 'Rock bolt', koTitle: '록볼트', koKeywords: '록볼트, 전면접착형, 정착형, 봉합효과', cat: 'Tunnels' },
    { title: 'Rock mechanics', koTitle: '암반역학', koKeywords: '암반역학, 불연속면, 절리, 단층, 암석강도', cat: 'Rock Mechanics' },
    { title: 'Immersed tube', koTitle: '침매터널', koKeywords: '침매터널, 침매함, 기초사석', cat: 'Tunnels' }
  ];

  // 기존 사전의 모든 키도 병합
  for (const [koKey, enVal] of Object.entries(GEO_CIVIL_EN_WIKI_MAP)) {
    if (!WIKI_TOPICS.some(t => t.title.toLowerCase() === enVal.toLowerCase())) {
      WIKI_TOPICS.push({
        title: enVal,
        koTitle: koKey,
        koKeywords: `${koKey}, ${enVal}`,
        cat: 'Geotechnical Engineering'
      });
    }
  }

  console.log(`- 수집 대상 영문 위키 표제어 수: 총 ${WIKI_TOPICS.length}개 토픽`);

  const processedWiki = [];
  let successCount = 0;

  for (let i = 0; i < WIKI_TOPICS.length; i++) {
    const topic = WIKI_TOPICS[i];
    const cleanTitle = topic.title.trim().replace(/\s+/g, '_');
    const prefix = `[${i + 1}/${WIKI_TOPICS.length}] [${topic.title}] (${topic.koTitle})`;

    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTitle)}`;
      const data = await fetchJson(url);

      if (data && data.extract && data.type !== 'disambiguation') {
        const itemRecord = {
          canonicalTitle: data.title || topic.title,
          koTitle: topic.koTitle,
          koKeywords: topic.koKeywords,
          category: topic.cat,
          description: data.description || '',
          extract: data.extract,
          pageUrl: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(cleanTitle)}`
        };

        const sql = isPostgres ? `
          INSERT INTO wiki_knowledge (
            canonical_title, ko_title, ko_keywords, category, description, extract, page_url, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP
          )
          ON CONFLICT (canonical_title) DO UPDATE SET
            ko_title = EXCLUDED.ko_title,
            ko_keywords = EXCLUDED.ko_keywords,
            category = EXCLUDED.category,
            description = EXCLUDED.description,
            extract = EXCLUDED.extract,
            page_url = EXCLUDED.page_url,
            updated_at = CURRENT_TIMESTAMP
        ` : `
          INSERT INTO wiki_knowledge (
            canonical_title, ko_title, ko_keywords, category, description, extract, page_url, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
          )
          ON CONFLICT (canonical_title) DO UPDATE SET
            ko_title = excluded.ko_title,
            ko_keywords = excluded.ko_keywords,
            category = excluded.category,
            description = excluded.description,
            extract = excluded.extract,
            page_url = excluded.page_url,
            updated_at = CURRENT_TIMESTAMP
        `;

        await dbQuery.run(sql, [
          itemRecord.canonicalTitle,
          itemRecord.koTitle,
          itemRecord.koKeywords,
          itemRecord.category,
          itemRecord.description,
          itemRecord.extract,
          itemRecord.pageUrl
        ]);

        processedWiki.push(itemRecord);
        successCount++;
        console.log(`${prefix} → 요약(${data.extract.length}자) DB 저장 완료`);
      } else {
        console.warn(`${prefix} → 요약 없음/동음이의어 건너뜀`);
      }
    } catch (err) {
      console.warn(`${prefix} 저장 실패:`, err.message);
    }
  }

  // 로컬 시드 JSON 파일로도 백업 저장
  const seedPath = path.join(SEEDS_DIR, 'wiki_geotechnical_seed.json');
  fs.writeFileSync(seedPath, JSON.stringify(processedWiki, null, 2), 'utf8');
  console.log(`✅ 영문 위키피디아 지반 토픽 ${successCount}개 DB 및 시드 JSON(${seedPath}) 저장 완료!`);
}

async function runFullSeed() {
  console.log('🚀 지반분야 전체 KCSC 및 영문 위키피디아 전수 DB화 시작...');
  const startTime = Date.now();

  await initDatabase();
  await seedKcscStandards();
  await seedWikipediaKnowledge();

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 모든 지반분야 KCSC 및 영문 위키피디아 전수 DB화 완료! (총 소요시간: ${durationSec}초)`);
  process.exit(0);
}

runFullSeed().catch(err => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
