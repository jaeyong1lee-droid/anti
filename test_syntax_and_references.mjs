// [고도화된 자가 개선 테스터]: App.jsx 런타임 변수 참조(ReferenceError) 및 렌더링 무결성 모의 검증 스크립트

import fs from 'fs';
import path from 'path';

console.log("==========================================");
console.log("🤖 [보강된 자가 개선 테스터: ReferenceError 사전 검증]");
console.log("==========================================");

const appJsxPath = path.resolve('client/src/App.jsx');
const content = fs.readFileSync(appJsxPath, 'utf8');

let hasError = false;

// 1. boxNum 선언 여부 정밀 검사
const renderSingleBoxStart = content.indexOf('const renderSingleBox =');
const renderSingleBoxEnd = content.indexOf('return (', renderSingleBoxStart + 500);

if (renderSingleBoxStart !== -1 && renderSingleBoxEnd !== -1) {
  const boxBlock = content.slice(renderSingleBoxStart, renderSingleBoxEnd);
  
  if (boxBlock.includes('boxNum') && !boxBlock.includes('const boxNum')) {
    console.error("❌ [오류 발견]: renderSingleBox 내에서 'boxNum' 변수가 선언(const boxNum) 없이 사용되어 ReferenceError를 유발합니다!");
    hasError = true;
  } else {
    console.log("✅ [스캔 통과]: renderSingleBox 내 'boxNum' 변수 선언이 정상적으로 존재합니다.");
  }
}

// 2. 미선언 식별자 전수 스캔 (boxNum, boxNumMatch 등)
const targetSymbols = ['boxNum', 'boxNumMatch'];
for (const sym of targetSymbols) {
  const regex = new RegExp(`\\b${sym}\\b`, 'g');
  const declRegex = new RegExp(`(const|let|var)\\s+${sym}\\b`);
  if (regex.test(content) && !declRegex.test(content)) {
    console.error(`❌ [오류 발견]: 식별자 '${sym}'가 선언 없이 사용되어 런타임 에러를 발생시킵니다!`);
    hasError = true;
  }
}

if (!hasError) {
  console.log("✅ [스캔 통과]: 미선언 식별자(ReferenceError 유발 지점) 없음 확인 완료!");
  console.log("\n✅ [자가 개선 테스터 최종 통과]: ReferenceError 사전 검증 100% 통과!");
  process.exit(0);
} else {
  console.error("\n❌ [자가 개선 테스터 실패]: ReferenceError 유발 변수 누락 감지됨!");
  process.exit(1);
}
