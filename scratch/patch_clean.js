const fs = require('fs');
const path = require('path');

const indexFile = path.resolve(__dirname, '..', 'server', 'index.js');
let content = fs.readFileSync(indexFile, 'utf8');

console.log('Original content length:', content.length);

// 1. Replace the systemInstruction in suggest-title
const searchInstructionStart = '    const systemInstruction = `당신은 지반공학 및 토질역학/토목 전공 학술 공식을 완벽히 분석해주는 기술사 전문 튜터입니다.';
const searchInstructionEnd = '반드시 다른 잡설 없이 오직 JSON 객체만 반환하시오. 마크다운 코드 블록(\\`\\`\\`json) 등은 감싸지 말고 순수 JSON만 반환하시오.`;';

const startIdx = content.indexOf(searchInstructionStart);
if (startIdx === -1) {
  console.error('Error: Could not find suggest-title systemInstruction start in server/index.js');
  process.exit(1);
}

const endIdx = content.indexOf(searchInstructionEnd, startIdx);
if (endIdx === -1) {
  console.error('Error: Could not find suggest-title systemInstruction end in server/index.js');
  process.exit(1);
}

// Extract exact string to be replaced
const oldInstructionBlock = content.substring(startIdx, endIdx + searchInstructionEnd.length);

const newInstructionBlock = `    const systemInstruction = \`당신은 지반공학 및 토질역학/토목 전공 학술 공식을 완벽히 분석해주는 기술사 전문 튜터입니다. 입력받은 LaTeX 수식과 전체적인 튜터 대화 맥락을 기반으로 공식의 세부 정보를 분석하여 반드시 아래 지정된 JSON 형식으로만 응답해 주세요. 다른 설명 텍스트나 코드블록 기호는 절대 출력하지 마십시오.
 
JSON 포맷 규격:
{
  "title": "해당 수식이 상징하는 가장 적절하고 간결한 전공 공식 명칭입니다. 반드시 한글(영어 전공명) 표준 포맷으로 한 줄 작명해야 합니다. 조사, 서술어 등 미사여구는 일체 배제하십시오. 공식에 학자명이 연관된 경우 반드시 사람이름을 전방 한글명에 무조건 추가하십시오. 예시: 테르자기 1차 압밀방정식(Terzaghi 1D Consolidation), 바톤 암반 Q분류(Barton Q-system)",
  "concept": "이 공식이 상징하는 공학적 의미를 수험생이 쉽게 이해할 수 있도록 친절하게 설명하는 1~2문장의 공학 개념 설명입니다. 수식의 본질적 존재 이유와 실무 공학적 의의를 명확히 작성하십시오.",
  "structure": "이 공식에 포함된 각각의 기호, 변수, 상수가 무엇을 의미하는지 공학적으로 분석한 설명 리스트입니다. 반드시 제공된 공식에 실제 표기된 기호에 한해서만 정의 목록을 작성하십시오. 사족 문장 없이 마크다운 불릿 리스트 형태로만 반환하십시오."
}\`;`;

content = content.replace(oldInstructionBlock, newInstructionBlock);
console.log('Successfully replaced suggest-title systemInstruction.');

// 2. Replace the fallback dataset mapping in /api/exam/all
const oldFallbackPattern = `        ...topics.map(t => ({
          type: "객관식",
          question: \`지반공학 핵심 학습 토픽인 [\${t.title}]의 기초 개념에 대한 설명 중 올바른 기술사적 거동 특성은?\`,
          options: [
            \`해당 토픽은 극한 지지 한계 평형 및 전단 응력 전파 특성을 명확히 고려하여 설계해야 한다.\`,
            "간극수의 무한 압축성을 고려하여 간극압 증가를 무시한 단순 거동이다.",
            "벽체의 변형이 수평방향으로 영원히 발생하지 않는 정지상태 조건에 국한된다.",
            "지반의 하중 분포가 오직 탄성 1차원 거동만 보인다고 극단적으로 단정한다."
          ],
          answer: \`해당 토픽은 극한 지지 한계 평형 및 전단 응력 전파 특성을 명확히 고려하여 설계해야 한다.\`,
          explanation: \`[\${t.title}] 설계 및 분석 시에는 지반의 극한 지지능력과 한계 평형상태의 역학적 조건을 엄밀하게 규명하여 현장 실무에 안전하게 결합해야 합니다.\`
        }))`;

const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedFallbackPattern = oldFallbackPattern.replace(/\r\n/g, '\n');

const fallbackIdx = normalizedContent.indexOf(normalizedFallbackPattern);
if (fallbackIdx === -1) {
  console.error('Error: Could not find fallback mapping in server/index.js');
  process.exit(1);
}

const newFallbackPattern = `        ...topics.map(t => ({
          type: "객관식",
          question: \`국가건설기준 및 지반 거동 분석 실무에서 [\${t.title}] 설계 가이드라인을 수립할 때, 한계 소성 평형 및 전단 변형 제어 특성을 고려한 엔지니어링적 대책으로 가장 올바른 진술은?\`,
          options: [
            \`해당 대상 지반이나 구조 부재의 전단 파괴선 메커니즘을 명확히 규명하고 실무적인 안전율($F.S.$) 설계 기준을 확보하여 적용해야 한다.\`,
            "배후 지반의 지하수위 거동이나 수압 벡터 변화를 무시하고 오직 정역학적 자중 효과만으로 영구 지보력을 완전히 확보할 수 있다.",
            "임의의 시공 단계별 이완 하중 전이를 차단하기 위해 가설 벽체의 변형 변위 발생을 완전 무한대로 허용하여 설계하는 것이 경제적이다.",
            "흙과 암반의 점착력 강도 정수 변동성을 배제하고 현장 수치 해석적 다짐 에너지 배합비만을 고정하여 장기 크리프 변형을 원천 봉쇄한다."
          ],
          answer: \`해당 대상 지반이나 구조 부재의 전단 파괴선 메커니즘을 명확히 규명하고 실무적인 안전율($F.S.$) 설계 기준을 확보하여 적용해야 한다.\`,
          explanation: \`[\${t.title}] 실무 분석 및 구조 검토 시에는 대상 지반 물성의 불균질성과 파괴 규준선의 역학적 메커니즘을 정밀 검증하고, 최신 설계기준에 명시된 안전율 한계치를 엄격히 적용해야 안정성을 확보할 수 있습니다.\`
        }))`;

// Apply the replacement in normalized content, then write back with CRLF if original content had CRLF
const isCrlf = content.includes('\r\n');
let newNormalizedContent = normalizedContent.replace(normalizedFallbackPattern, newFallbackPattern.replace(/\r\n/g, '\n'));

if (isCrlf) {
  content = newNormalizedContent.replace(/\n/g, '\r\n');
} else {
  content = newNormalizedContent;
}

fs.writeFileSync(indexFile, content, 'utf8');
console.log('Successfully replaced fallback dataset in POST /api/exam/all.');
console.log('New content length:', content.length);
