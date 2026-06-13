import fs from 'fs';
import path from 'path';

const filePath = 'c:/Users/airfo/OneDrive/바탕 화면/안티/server/index.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `    - 모든 수식이나 변수 기호는 LaTeX 문법($수식$)으로 표기하며, JSON 파싱 에러를 유발하지 않도록 모든 LaTeX 명령어의 역슬래시(\\\\ 기호)는 반드시 이중 역슬래시(\\\\\\\\ 기호)로 이중 이스케이프해야 합니다.
    - 중요: LaTeX 수식 기호( $ 또는 $$ ) 바로 안쪽에는 절대 공백이 들어가지 않아야 합니다 (예: '$수식$'은 올바르고, '$ 수식 $'과 같이 안쪽에 공백이 있으면 절대 안 됩니다). 또한, LaTeX 수식 바깥쪽 앞뒤로 한글이 올 때는 그 사이에 반드시 공백(띄어쓰기)을 주어 한글과 수식이 달라붙지 않게 처리하십시오. (예: "공식 $T = P \\\\\\\\times r$ 은" 이와 같이 수식 바깥쪽 앞뒤 양옆에 한글과의 공백을 확실히 두어 가독성을 확보하십시오.)
    - 🚨 [수식 절대 엄금 경고]: 문장 중간이나 수식 명령어 내부(예: \\\\\\\\frac 뒤쪽 등)에 마크다운 기호 '$'를 파편화하여 쪼개 넣는 행위를 절대 금지합니다. 수식은 무조건 문장과 분리하여 완벽한 '단일 덩어리'로만 감싸십시오. 아래첨자('_')나 괄호 앞뒤에 불필요한 역슬래시('\\\\\\\\')를 임의로 우회 주입하여 구문 오류를 만들지 마십시오.`;

const replacement = `    - 모든 수식이나 변수 기호는 LaTeX 문법($수식$)으로 표기하며, JSON 파싱 에러를 유발하지 않도록 모든 LaTeX 명령어의 역슬래시(\\\\ 기호)는 반드시 이중 역슬래시(\\\\\\\\ 기호)로 이중 이스케이프해야 합니다 (예: \\\\\\\\frac{a}{b}, \\\\\\\\sigma, \\\\\\\\cdot 등).
    - LaTeX 명령어의 중괄호 {} 기호는 절대로 누락하지 말고 완전하게 기재하십시오 (예: \\\\\\\\frac{A}{B}, \\\\\\\\text{m} 등).
    - 중요: 수식 기호( $ 또는 $$ ) 바로 안쪽에는 공백이 없어야 하며, 수식은 마크다운과 섞이지 않도록 완벽한 '단일 덩어리'로 감싸서 작성하십시오. 아래첨자('_')나 괄호 앞뒤에 불필요한 역슬래시('\\\\\\\\')를 임의로 주입하여 구문 오류를 만들지 마십시오.`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully replaced LaTeX warnings in topics questions prompt.');
} else {
  console.error('Target warning string not found in index.js!');
}
