import { getKcscVerificationContext, ensureKcscDbLoaded } from '../services/kcscService.js';
import { getWikipediaKnowledge, ensureWikiDbLoaded } from '../services/wikipediaService.js';

async function testPerformance() {
  console.log('--- 1. 인메모리 캐시 웜업 중... ---');
  await ensureKcscDbLoaded();
  await ensureWikiDbLoaded();
  console.log('--- 1. 웜업 완료! ---');

  const queries = [
    '연약지반 PVD 연직배수재',
    '소일네일링 보강공법 안전율',
    'TBM 터널 굴진 세그먼트',
    '얕은기초 테르자기 지지력',
    '지하연속벽 슬러리월 벤토나이트'
  ];

  console.log('\n=== Warm Cache 5연속 쿼리 성능 측정 ===');
  for (const q of queries) {
    const t0 = performance.now();
    const kRes = await getKcscVerificationContext(q);
    const wRes = await getWikipediaKnowledge(q);
    const dt = (performance.now() - t0).toFixed(2);
    const kHead = kRes.split('\n').find(l => l.startsWith('### 🏛️')) || 'KCSC 미적중';
    const wHead = wRes.split('\n').find(l => l.includes('표제어')) || 'Wiki 미적중';
    console.log(`Query: [${q}] → ${dt}ms`);
    console.log(`  └ ${kHead}`);
    console.log(`  └ ${wHead.trim()}`);
  }

  process.exit(0);
}

testPerformance().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
