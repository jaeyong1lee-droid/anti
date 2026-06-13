import fs from 'fs';

const filePath = 'c:/Users/airfo/OneDrive/바탕 화면/안티/server/index.js';
let content = fs.readFileSync(filePath, 'utf-8');

// Target 1: Line 3309 (with 3 spaces and correct backslash escape)
const target1 = '   - ⚠️ [정답 구성 원칙]: 수식이나 공식 자체를 묻고 싶다면 반드시 \'객관식\'으로 질문을 구성하시고, 주관식 표채우기 빈칸(\\\`[INPUT_1]\\\`)에는 오직 **한글(한자) 용어 또는 공학적 의미/개념/서술형 문구(10자~15자 내외)**만 정답으로 들어가도록 출제하십시오.';

const replacement1 = '   - ⚠️ [정답 구성 원칙]: 수식이나 공식 자체를 묻고 싶다면 반드시 \'객관식\'으로 질문을 구성하십시오. 주관식 표채우기 빈칸(\\\`[INPUT_1]\\\`)에는 단순히 \'면모 구조 형성\'이나 \'이온 교환\' 같은 5~6자 내외의 단순 용어 명칭은 **절대로 출제하지 마십시오.** 대신 **핵심 원리/개념을 관통하여 15자~20자 내외로 서술해야 하는 서술형 문구**이거나, 혹은 **특정 공학적 상황을 가정했을 때 대처 방안 및 어떻게 해야 하는가에 대해 15자~20자 내외로 명확히 답하는 구체적인 서술형 문구**를 정답으로 구성하십시오.';

// Target 2: Line 3315 (with 3 spaces)
const target2 = '   - "answers": 각 빈칸 토큰에 해당하는 정확한 모범 답안 객체 (예: {"INPUT_1": "수동적 전단 및 인장 저항", "INPUT_2": "선단 지지력 및 주면 마찰력"}). 각 모범 답안은 너무 짧은 단어보다는 **10자~15자 내외의 정말 중요한 핵심 개념/구절**이 되도록 구성하십시오.';

const replacement2 = '   - "answers": 각 빈칸 토큰에 해당하는 정확한 모범 답안 객체 (예: {"INPUT_1": "인장 및 전단력에 대한 수동적 저항", "INPUT_2": "정착지반 마찰저항 및 인장력 선도입"}). 각 모범 답안은 핵심 메커니즘을 상세히 기술하는 **15자~20자 내외의 서술형 문구**여야 합니다. 단순 용어 명칭은 제외하십시오.';

// Normalize line endings to LF for a stable check
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget1 = target1.replace(/\r\n/g, '\n');
const normalizedReplacement1 = replacement1.replace(/\r\n/g, '\n');
const normalizedTarget2 = target2.replace(/\r\n/g, '\n');
const normalizedReplacement2 = replacement2.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedTarget1) && normalizedContent.includes(normalizedTarget2)) {
  let newContent = normalizedContent.replace(normalizedTarget1, normalizedReplacement1);
  newContent = newContent.replace(normalizedTarget2, normalizedReplacement2);
  fs.writeFileSync(filePath, newContent, 'utf-8');
  console.log('Successfully patched server/index.js');
} else {
  console.error('Target strings not found in server/index.js!');
}
