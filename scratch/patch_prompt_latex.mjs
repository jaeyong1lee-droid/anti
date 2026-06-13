import fs from 'fs';
import path from 'path';

const filePath = path.resolve('server/index.js');
let content = fs.readFileSync(filePath, 'utf8');

const regex = /-\s*"question":\s*표의\s*빈칸에\s*알맞은\s*핵심\s*답안을\s*서술하라는\s*질문\s*\(예:\s*"다음\s*소일네일링과\s*어스앵커\s*공법의\s*주요\s*공학적\s*특징\s*비교표\s*빈칸\s*\(A\),\s*\(B\)에\s*들어갈\s*내용을\s*기술하십시오\."\)/i;

const match = content.match(regex);
if (match) {
  console.log("Matched text:", match[0]);
  content = content.replace(regex, `- "question": 표의 빈칸에 알맞은 핵심 답안을 서술하라는 질문 (예: "다음 소일네일링과 어스앵커 공법의 주요 공학적 특징 비교표 빈칸 (A), (B)에 들어갈 내용을 기술하십시오."). (⚠️ [지문 작성 수칙 - 매우 중요!]): "question" 본문에는 절대로 "INPUT_1", "INPUT_2" 또는 "[INPUT_1]" 같은 시스템 토큰명 자체를 노출하여 적지 마십시오. 대신 사용자가 직관적으로 알아볼 수 있도록 순서대로 "(A)", "(B)", "(C)", "(D)" 등으로 지칭하여 지문을 구성하십시오.`);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log("Successfully patched prompt in server/index.js");
} else {
  console.error("Target regex not found in server/index.js!");
}
