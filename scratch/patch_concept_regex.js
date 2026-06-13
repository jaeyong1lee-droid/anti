const fs = require('fs');

const filePath = 'C:/Users/airfo/OneDrive/바탕 화면/안티/server/index.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. 신규 문제 생성 프롬프트의 concept 가이드 치환
const regex1 = /-\s*"concept"\s*:\s*질문에\s+정확히\s+부합하며,\s*최소\s*4줄에서\s*최대\s*6줄\s*[\s\S]*?학술적\s*설명의\s*깊이를\s*확보할\s*것\)\./g;
if (regex1.test(content)) {
  content = content.replace(regex1, '- "concept": 질문에 정확히 부합하며, 3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명을 작성하십시오. 지나치게 1~2줄로 축약하거나 불필요하게 장황하지 않도록 적절한 학술적 깊이를 확보해야 합니다.');
  console.log("Replaced regex1");
} else {
  console.log("regex1 not matched");
}

// 2. 신규 문제 생성 프롬프트의 concept 예시 치환
const regex2 = /"concept"\s*:\s*"토픽의\s+공학적\s+메커니즘과\s+학술적\s+원리를\s+상세히\s+기술한\s+4~6줄\s+분량의\s+직관적인\s+개요\s+설명"/g;
if (regex2.test(content)) {
  content = content.replace(regex2, '"concept": "토픽의 공학적 메커니즘과 학술적 원리를 상세히 기술한 3~5줄 내외의 직관적인 개요 설명"');
  console.log("Replaced regex2");
} else {
  console.log("regex2 not matched");
}

// 3. 재생성 프롬프트들의 concept 가이드 치환
const regex3 = /-\s*"concept"\s*:\s*질문에\s+정확히\s+부합하는\s+1~2줄\s+이내의\s+매우\s+명료하고\s+컴팩트한\s+핵심\s+정의\s+및\s+요약\s+답변\s*\(절대\s+길거나\s+장황하게\s+쓰지\s+말\s+것\)\./g;
if (regex3.test(content)) {
  content = content.replace(regex3, '- "concept": 질문에 정확히 부합하며, 3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명을 작성하십시오. 지나치게 1~2줄로 축약하거나 불필요하게 장황하지 않도록 적절한 학술적 깊이를 확보해야 합니다.');
  console.log("Replaced regex3");
} else {
  console.log("regex3 not matched");
}

// 4. 재생성 프롬프트들의 예시 포맷 치환 (1~2줄 컴팩트 요약 답변, 1~2줄 요약 답변 등)
const regex4 = /"concept"\s*:\s*"1~2줄\s*(?:컴팩트\s*)?요약\s*답변"/g;
if (regex4.test(content)) {
  content = content.replace(regex4, '"concept": "3~5줄 내외의 깊이 있고 전문적인 서술형 개요 설명"');
  console.log("Replaced regex4");
} else {
  console.log("regex4 not matched");
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("Save completed!");
