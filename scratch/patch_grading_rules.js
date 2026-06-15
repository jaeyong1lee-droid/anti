const fs = require('fs');

const filePath = 'C:/Users/airfo/OneDrive/바탕 화면/안티/server/index.js';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /(\s*-\s*특히, 공학적 의미 및 상태 방향성이 거의 유사한 형용사적 어미[\s\S]*?isCorrect: true로 처리하십시오\.)\s*3\.\s*\[주관식 개요 키워드 채점 규칙\]:/g;

if (regex.test(content)) {
  content = content.replace(regex, `$1
    - 또한, 모범 답안의 단어를 직접 언급하지 않았더라도 질문 맥락상 등방성 지반과 이방성 지반의 해석 기법 비교에서 등방성 지반에 대해 '별도 보정 없이 활용/해석', '변환 없이 그대로 적용' 등과 같이 공학적으로 올바른 사실을 지칭하는 경우, 이는 모범 답안의 취지와 완벽히 부합하므로 **만점(10점)** 또는 **우수한 점수(8점 이상)**를 부여하십시오.

3. [주관식 개요 키워드 채점 규칙]:`);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated server subjective grading rules.');
} else {
  console.error('Target pattern not found in server/index.js!');
}
