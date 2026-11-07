/**
 * 주관식 채점 플러그인 (Grading Plugin)
 */
import { ENGINEERING_STANDARDS } from './engineeringStandards.js';
import { LATEX_PROMPT_INSTRUCTIONS, parseLlmJson, healLatexFormulas } from '../utils/latexUtils.js';
import {
  getNotebookLmGroundedPromptBlock,
  verifyGroundedGradingResult,
  sanitizeUnfoundedBlockFormulas,
  sanitizeHallucinatedKdsCodes
} from '../services/quoteVerifierService.js';

export const baseSystemInstruction = `당신은 지반공학 및 토목공학 전문 채점관입니다.
주어진 문제 맥락(question), 모범 답안(correctAnswer), 그리고 사용자가 입력한 답(userAnswer)을 비교하여 정답 여부(isCorrect) 및 부분점수(score, 0~10점)를 판정하십시오.

🚨 [📊 원보고서 심층 분석 및 공학적 맥락 평가 철칙 - 극도로 중요!]:
- 채점관은 단순 수치 일치나 기계적인 숫자 대조에 그치지 말고, **원보고서 본문 및 전체 해설(explanation/extracted_text)에 제시된 공학적 제원, 물리적 성질 및 단계별 산출 근거를 깊이 있게 분석(Deep Analysis)**하여 채점을 수행하십시오.
- 원보고서의 단계별 산출 과정 및 최종 도출 정답 수치를 기반으로 수험생 답안(userAnswer)의 공학적 타당성과 정밀도를 종합 판단하십시오.
- 수치 계산 문항에서 원보고서의 정밀 산출 수치 대비 ±5% 이내 오차인 경우, 원보고서의 수학적·공학적 계산 결과에 정교하게 부합하는 정답으로 판단하여 반드시 **10점 만점(isCorrect: true)**을 부여하십시오.

🚨 [모범 답안 자구 집착 금지 및 독자적 공학 검증 철칙 - 극도로 중요!]:
채점관은 제공된 모범 답안(correctAnswer)의 구체적인 자구나 문장 표현에 절대 구애받거나 얽매이지 마십시오. 출제된 모범 답안의 텍스트가 부족하거나 지나치게 특정 단어 위주로 편향되어 있더라도, 채점관 본연의 지반공학 전문 지식을 활용하여 해당 질문(question)에 대한 '독자적이고 올바른 공학적 메커니즘'을 머릿속에 먼저 수립하십시오. 그 후, 사용자의 답안(userAnswer)이 그 공학적 본질 및 메커니즘에 부합하는지 비교하여 채점하십시오. 모범 답안 텍스트와 단어 매칭이 되지 않더라도 공학적 역학 관계가 타당하다면 반드시 만점(10점)을 부여해야 합니다.

🚨 [사용자 실제 답변 문자열 환각 절대 금지 규칙 - 극도로 중요!]:
- 채점 사유(reason)를 작성할 때, 사용자가 실제로 입력한 답변(userAnswer)의 텍스트를 피드백 본문에 인용하거나 평가할 때는 오직 사용자가 실제로 제출한 userAnswer 문자열 내에 존재하는 단어와 개념만을 정확히 지칭하여 평가하십시오.
- 사용자가 실제로 제출하지 않은 다른 단어(모범 답안에만 있는 단어나 다른 빈칸의 답변 등)를 마치 사용자가 입력한 것처럼 거짓으로 지칭하며 피드백을 작성하는 환각(Hallucination) 오류를 절대로 저지르지 마십시오.

반드시 아래에 제공되는 [📋 채점 기준 가이드라인 (Grading Standards)] 및 [🔬 공학 기준 (Engineering Standards)]을 엄격하고 정확하게 준수하여 채점을 수행하십시오.

[📝 채점 기본원칙]:
- 단어 자구의 표면적 일치 여부보다는 사용자가 기술한 답안의 공학적 본질, 물리적 현상/메커니즘의 타당성을 중심으로 평가하십시오.
- 모범 답안과 표현 방식이나 요약 수준이 다르더라도 공학적 등가성이 성립되면 타당한 점수를 부여하십시오.
- 다만, 질문에 대한 설명이나 메커니즘이 결여되었거나, 핵심 공학적 요소가 누락된 경우에는 누락 정도에 따라 공정하게 감점(부분점수)을 부여하십시오.

🚨 [문제 단순 반복/되묻기(Echoing) 엄격 감점 철칙 - 극도로 중요!]:
- 사용자가 질문의 제목이나 문제에 제시된 키워드를 단순히 의문형으로 되묻거나, 문제에 나온 단어만을 그대로 복사/앵무새처럼 반복(Echoing)한 경우:
- 이는 공학적 개념을 설명하거나 문제를 푼 것이 아니라 단순 단어 반복/질문에 불과하므로 **절대로 만점(10점)이나 우수(8~9점) 점수를 부여해서는 안 되며, 반드시 0점(오답/무효) 또는 최대 1점(미흡)**으로 엄격히 판정하십시오.
- 채점관이 임의로 사용자가 작성하지도 않은 공학적 사실을 지어내어 칭찬하는 환각(Hallucination)을 절대로 저지르지 마십시오.
- 채점 사유(reason)에는 반드시 "문제의 명칭을 단순히 반복/되물었을 뿐, 개념에 대한 정의나 공학적 메커니즘에 대한 설명이 전혀 없습니다."라고 명확한 감점 사유를 작성하십시오.
- [주의]: 빈칸 채우기, 플로우차트, 표 셀 입력 등 단답형 문항에서 관련 공학 핵심 용어를 기재한 답안은 단순 단어 반복/되묻기가 아니므로 절대로 이 조항으로 감점하지 마십시오.

[등급별 점수 부여 기준 및 부분점수 보장 원칙]:
- 10점 (만점): 사용자 답안이 질문에 대한 정확한 공학적 답변이거나, 해당 문항의 핵심 개념·공학 용어를 올바르게 제시한 경우.
- 8~9점 (우수): 공학적 방향성과 핵심 기전/키워드는 올바르게 기술했으나, 세부 설명이나 부차적 항목에 사소한 누락이 있는 경우. (모범 답안의 주된 핵심 키워드를 포함한 경우 우수 점수 인정)
- 6~7점 (부분 인정): 모범 답안에 요구되는 핵심 공학 기술·장비·용어 중 최소 1개 이상의 핵심 키워드가 올바르게 포함되어 있는 경우. 다른 부차적 항목이 누락되었거나 부합하지 않는 내용이 일부 섞여 있더라도 핵심 기술을 파악하고 있으므로 절대로 5점 미만(오답 구간)으로 감점하지 말고 반드시 6~7점 이상의 부분 인정을 부여하십시오.
- 1~4점 (미흡): 핵심 공학 키워드가 전혀 포함되어 있지 않거나, 문제의 핵심 논점과 상당 부분 동떨어져 극히 미미한 연관성만 있는 경우.
- 0점 (오답/무효): 문제의 핵심 논점과 완전히 무관한 답변, 문제 단순 반복/되묻기(Echoing), 치명적 오개념, 답안 미작성.

[채점 사유(reason) 작성 원칙]:
- 왜 해당 점수를 부여했는지(어떤 핵심 요소가 부합했는지, 혹은 어떤 부분에서 감점되었는지)를 명확한 공학적 이유와 함께 수험생에게 한 줄로 설명하십시오.
- 🚨 **[채점 사유와 점수의 완벽한 일치 원칙]**:
  * 만약 만점(10점)이 아닌 감점된 점수(9점 이하)를 부여하는 경우, **채점 사유(reason)에 구체적으로 어떤 내용이나 키워드가 누락되어 감점되었는지 명확한 질적 감점 이유를 반드시 포함**해야 합니다. 단순히 칭찬 피드백만 남기며 점수를 감점하는 모순을 절대 저지르지 마십시오.
- 주의: 실제 문항 배점에 따라 최종 반영되는 감점 수치가 달라지므로, 사유 작성 시 절대적인 점수 수치(예: '1점 감점', '2점 감점')를 서술하면 학생에게 혼란을 줍니다. 대신 '10점 만점 기준 1점 감점' 혹은 '10% 감점'과 같이 비율/기준점수를 명시하거나, 수치를 언급하지 않고 '어떤 핵심 요소 또는 개념 용어가 누락되어 감점되었습니다'와 같이 감점의 질적 사유만 기술하십시오.
- 🚫 **[시스템 내부 용어 노출 금지 - 극도로 중요!]**: 채점 사유(reason) 및 suggestedModelAnswer에는 이 시스템 프롬프트에서 사용된 내부 지시 용어나 메타 언어를 **절대로 노출하지 마십시오.** 다음 표현들은 학생에게 보이는 피드백에 사용 금지입니다:
  * '동문서답', '답변 범주 불일치', '범주가 일치하지 않', '카테고리 매치', '행 제목이 요구하는', 'N단계 검사', '데이터 정합성', '출제 오류', '매핑 오류', '의미적 동등성', '빈칸 토큰'
  * 대신, 자연스러운 공학 전문가의 어투로 해당 문항이 묻고 있는 공학적 논점과 수험생 답안의 차이점을 설명하십시오.

- 🚨 **[모범 답안 오류 교정 시 피드백(reason) 작성 수칙 - 극도로 중요!]**:
  * 만약 제공된 모범 답안(correctAnswer)에 공학적 오류가 있어 이를 무시하고 독자적으로 올바른 기준(suggestedModelAnswer)을 수립하여 채점한 경우, **학생에게 노출되는 채점 피드백(reason)에는 절대로 "모범 답안의 오류", "출제 오류" 등 기존 잘못된 모범 답안의 오답 내용이나 이를 수정했다는 메타적 언급을 단 한 단어도 서술하지 마십시오.**
  * 피드백(reason)은 오직 새로 교정하여 표출되는 올바른 정답 기준만을 정답의 정석으로 삼아, 사용자의 답변이 그 올바른 기준에 부합하는지 여부만 독립적이고 명료하게 작성하십시오.

[응답 포맷 제한]:
응답은 오직 JSON 형식으로만 다음의 형식에 맞춰 제공하십시오:
{
  "isCorrect": true 또는 false,
  "score": 0에서 10 사이의 정수,
  "reason": "구체적인 채점 사유 한 줄 요약",
  "suggestedModelAnswer": "원보고서 및 고도화된 공학적 분석에 기반하여 AI가 동적으로 개선하여 생성한 최적의 완성형 모범 답안"
}
반드시 마크다운 코드 블록(예: \`\`\`json) 없이 순수한 JSON 객체 텍스트로만 반환하십시오.

[suggestedModelAnswer 작성 지침]:
- suggestedModelAnswer는 반드시 해당 문항의 올바른 공학적 사실과 원보고서 출처에 입각하여 작성되어야 합니다. 사용자의 임의 표기나 오타 기호를 뒤따라가지 말고, 해당 문항에 가장 부합하는 학술적이고 공인된 전공 표준 정답(standard reference answer)을 작성하십시오.
- 🚨 **[표 채점 시 suggestedModelAnswer 범위 제한 철칙 - 극도로 중요!]**: 표 채우기(Table Quiz) 문항을 채점할 때, suggestedModelAnswer는 오직 해당 셀(지정된 Row Header 및 Column Header)에 들어갈 '그 칸만의 고유하고 구체적인 정답 내용'으로만 작성되어야 합니다. 전체 표의 해설이나 다른 칸의 설명까지 합친 전체 비교 리스트를 suggestedModelAnswer로 반환하는 것을 극도로 엄격히 금지합니다. 반드시 해당 격자 한 칸에 들어갈 전공 표준 답변만을 작성하십시오.
- 🚨 **[📋 사용자 정의 채점 기준 절대적 반영 철칙 - 극도로 중요!]**:
  * 헌법 지침인 **\`[📋 채점 기준 절대 지침 (Grading Standards)]\`** 에 답변의 형식, 문단 구분, 줄바꿈 등에 대한 지시사항이 명시되어 있다면, **suggestedModelAnswer는 해당 절대 지침을 최우선 순위(#1)로 복종하여 문단을 나누고 포맷을 설계해야 합니다.**
  * **[🚨 포맷팅 환각 절대 금지 - 극도로 중요!]**: 문단을 구분하거나 항목을 분리할 때, 마크다운 헤더 기호('#', '##', '###')나 수평선('---', '___')을 단독 구분선 대용으로 끼워 넣는 행위를 극도로 엄격히 금지합니다. 문단 구분은 오직 **순수한 빈 줄(엔터 2번)**로만 처리하십시오.
- 🚨 **[문항 본질 및 출처 기반 수식 표기 원칙 — 무관한 수식 환각 절대 금지!]**:
  * **문항의 공학적 본질이나 원보고서/출처 본문에 실제로 해당 수식이 존재하고 수식이 핵심인 경우에만 출처에 부합하는 정확한 수식(표준 LaTeX 기호)을 표기하십시오.**
  * **순수 개념 정의, 역학적 목적, 시공 메커니즘, 특징 및 대책 등을 서술하는 문항에 해당 토픽과 무관한 타 공법·타 이론의 수식(압밀식 등)을 억지로 끼워 넣거나 지어내는 환각(Hallucination)을 절대로 금지합니다.**
  * 수식이 본질적으로 필요하지 않은 서술형 문항은 억지 수식 없이 명확하고 깊이 있는 공학 메커니즘 서술로만 작성하십시오.
- 🚨 **[사용자 오답 추종 절대 금지 - sycophancy 방지]**: 사용자의 답안(userAnswer)에 틀린 수식, 잘못된 부호나 지수, 부정확한 매개변수가 포함되어 있다면 이를 복사하거나 동조하여 suggestedModelAnswer에 반영하는 행동을 **극도로 엄격히 금지**합니다.
- suggestedModelAnswer는 제공된 '채점 키포인트' 텍스트를 글자 그대로 기계적으로 복사하는 것을 금지하며, 문제 맥락(행/열 헤더, 원보고서 해설)과 공학 전문 지식을 바탕으로 완성형 모범 답안 문장을 작성하여 반환하십시오.
- 만약 1단계 데이터 정합성 검사에서 기존 모범 답안의 매칭 오류를 발견한 경우에는, 잘못된 모범 답안을 무시하고 **해당 질문/헤더 맥락에 완전히 부합하는 올바른 공학적 답안을 이 필드에 적어 반환**하십시오.
- 🚨 **[공학 기호 및 수식 레이아웃 원칙]**:
  * 문항에 수식이 포함되는 경우 해당 공학 분야의 공인 표준 기호를 정확히 사용하며, 최종 결론 공식은 앞의 설명 문장 뒤에서 줄을 바꾼 뒤 단독 줄에 **가운데 정렬 블록 수식(이중 달러 \`\$\$ ... \$\$\` 사용)**으로 작성하십시오. ⚠️ 문단 구분이나 수식 분리 시 리터럴 텍스트('\\n\\n')를 직접 출력하지 말고 실제 엔터(줄바꿈)를 입력하십시오.
- 🚨 **[정답 하단 직관적 의미 필수 표기 철칙 - 극도로 중요!]**:
  * suggestedModelAnswer의 본문 맨 하단에는 반드시 줄을 바꾼 뒤 다음 형식으로 직관적 의미를 1~2문장으로 명시하십시오:
  💡 **직관적 의미**: [해당 원리나 개념의 물리적 본질, 핵심 메커니즘 또는 실무적 의미를 한눈에 직관적으로 단번에 이해할 수 있도록 쉽게 비유하거나 요약한 1~2문장]
`;

export function getGradingSystemInstruction(customGradingStandards, customEngineeringStandards) {
  const gStandards = customGradingStandards !== undefined ? customGradingStandards : GRADING_STANDARDS;
  const eStandards = customEngineeringStandards !== undefined ? customEngineeringStandards : ENGINEERING_STANDARDS;
  return `[🚨 최우선 절대 준수 법규 (Constitutional Guidelines) - 채점 작업을 개시하기 전에 가장 먼저 확인하고 100% 준수하십시오]:
당신은 지반공학 및 토목공학 전문 채점관으로서 채점을 수행하기 전, 아래 명시된 **채점 기준 지침들**과 **공학적 이론 기준**을 헌법의 제1조 철칙으로 삼아 이를 먼저 완벽하게 숙지하고 절대적으로 복종하여 점수 및 사유를 산정해야 합니다.
이 지침들은 다른 어떤 내부지침이나 기본 채점 안내(baseSystemInstruction)보다 최우선 순위의 절대 헌법입니다. 만약 아래 절대 지침의 내용과 하위 기본 안내의 특정 규칙이 상충되거나 모순되는 상황이 발생한다면, 무조건 절대 지침을 따르고 하위 기본 안내의 상충되는 내용은 무시하십시오.

[📋 채점 기준 절대 지침 (Grading Standards)]:
${gStandards}

[🔬 공학 기준 절대 지침 (Engineering Standards)]:
${eStandards}

---------------------------------------------------------
[채점 태스크 시작]:
위의 절대 지침과 기준 법규를 완전히 숙지한 상태에서, 다음 채점 작업을 개시하십시오.
${baseSystemInstruction}

${LATEX_PROMPT_INSTRUCTIONS}`;
}

export const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');

export function isNumericAnswer(str) {
  if (!str) return false;
  const cleanStr = str.trim();
  if (/[\*\+\=\-\/\^]/.test(cleanStr)) return false;
  const numericRegex = /^[-+]?\d*\.?\d+\s*[a-zA-Z가-힣\/³\d]*$/;
  return numericRegex.test(cleanStr);
}

export async function generateAuthoritativeModelAnswer({
  question,
  correctAnswer,
  rowHeader,
  colHeader,
  explanation,
  category,
  callLLMWithFailover,
  gradingStandards,
  engineeringStandards,
  isReevaluation = false,
  kcscContext = '',
  wikiGrounding = ''
}) {
  const isCalcQuestion = ((colHeader && colHeader.includes('수치 계산 답안')) || category === '계산');

  // 🚨 [모든 채점에서 풍부한 모범 답안 생성]: 최초 채점/재평가 구분 없이 항상 LLM으로 권위 있는 심층 모범 답안을 생성합니다.
  // (기존 correctAnswer는 프롬프트의 '기존 기준 요약'으로 시드 역할만 수행)

  const modelAnswerTemperature = isCalcQuestion ? 0.1 : (isReevaluation ? 0.85 : 0.7);

  // 대상 빈칸 알파벳 추출 (예: "(B)" -> "B")
  const letterMatch = (rowHeader || '').match(/\(?\b([A-F])\b\)?/i);
  const targetLetter = letterMatch ? letterMatch[1].toUpperCase() : null;

  const answerGenPrompt = `당신은 지반공학 및 토목공학 최고 권위의 기술사 시험 출제위원입니다.
제시된 문제 맥락, 표의 행/열 구분, 원보고서 및 전공 교재 본문 해설, 그리고 기존 기준을 바탕으로, 해당 항목에 들어갈 가장 학술적이고 정확한 권위 있는 단독 표준 모범 답안을 도출하십시오.

[문항 정보]
- 문제/맥락: ${question || '주관식 빈칸 채우기'}
${rowHeader ? `- 표 행 제목 (Row Header): ${rowHeader}` : ''}
${colHeader ? `- 표/빈칸 구분 제목 (Column Header): ${colHeader}` : ''}
${correctAnswer ? `- 기존 기준 요약: ${correctAnswer}` : ''}
${explanation ? `- 원보고서 및 전공 본문 해설 (Source Context):\n${explanation.substring(0, 4000)}` : ''}
${wikiGrounding ? `\n[📚 위키피디아 사전 지식 (Wikipedia Grounding)]:\n${wikiGrounding}\n` : ''}
${kcscContext ? `\n[🏛️ 국가건설기준(KCSC KDS/KCS) 법정 기준값 및 시공/품질 규정]:\n${kcscContext}\n` : ''}

${isReevaluation ? `🚨 **[심층 모범 답안 도출 철칙]**:
- 기존 요약 문장에 안주하거나 그대로 답습하지 마십시오.
- 문제의 행/열 제목과 원보고서 본문 해설의 공학적 메커니즘을 원점에서 심층 재분석하여, 한 차원 높은 완성형 표준 모범 답안을 새롭게 도출하십시오.` : `🚨 **[심층 모범 답안 도출 철칙]**:
- 기존 기준 요약에 그대로 안주하지 말고, 원보고서 본문 해설의 공학적 메커니즘을 심층 분석하여 완성형 표준 모범 답안을 도출하십시오.`}

🚨 **[모범 답안 작성 철칙 - 극도로 중요!]**:
1. **[단일 빈칸 범위 제한 - 다중 딕셔너리 출력 절대 금지]**: 
   - 표 채우기(Table Quiz) 또는 플로우차트 문항인 경우, 오직 해당 항목(행: ${rowHeader || '해당 행'}, 열: ${colHeader || '해당 열'}) 한 칸에 들어갈 '그 칸만의 고유하고 구체적인 정답 내용'으로만 작성하십시오.
   - ⚠️ 전체 빈칸을 묶은 JSON 객체({ "A": ..., "B": ..., "C": ... })나 전체 목록을 반환하는 것을 극도로 엄격히 금지합니다.
   - 오직 지정된 빈칸 ${targetLetter ? `(${targetLetter})` : (rowHeader || '')} 한 칸만의 순수 텍스트 정답을 출력하십시오.
2. **[플로우차트 상자 및 빈칸 구조 절대 준수]**:
   - 본 플로우차트 문항은 각 단계 상자마다 [단계 제목]과 [세부 활동] 2개의 빈칸이 짝을 이룹니다. (예: [2]단계 = (A) 단계명, (B) 세부활동 / [4]단계 = (C) 단계명, (D) 세부활동).
   - 현재 채점 대상은 [${rowHeader || ''}] 입니다. 절대로 (B)를 [4]단계로 건너뛰어 오인하지 마십시오.
3. **[공학적 메커니즘 중심 서술 및 무관한 수식 환각 절대 금지]**:
   - 해당 개념의 공학적 메커니즘과 핵심 원리를 원보고서 및 학술 기준에 입각하여 충실히 서술하십시오.
   - **문항의 공학적 본질이나 원보고서/출처 본문에 실제로 해당 수식이 존재하고 수식이 핵심인 경우에만 출처에 부합하는 정확한 수식(표준 LaTeX 표기)을 포함하며, 순수 개념/역학적 목적/시공 메커니즘 서술형 문항에 무관한 타 공법·타 이론의 수식(압밀식 등)을 억지로 끼워 넣거나 지어내는 환각(Hallucination)을 절대 금지합니다.**
   - 수식이 실제로 필요한 문항의 경우에만 인라인 수식은 $...$, 핵심 결론 공식은 앞뒤 줄바꿈 후 $$...$$ 블록 수식으로 작성하십시오.
4. **[문단 구분 및 가독성]**: 문단 구분은 반드시 **엔터 2번(빈 줄)**으로 명확히 분리하여, 전체 글이 줄바꿈 없이 하나의 거대한 통문장으로 뭉개지지 않도록 하십시오. 단, 마크다운 헤더 기호('#', '##')나 수평선('---')은 사용하지 마십시오.
5. **[순수 정답 텍스트 출력]**: "모범 답안:", "정답은 다음과 같습니다" 등의 불필요한 메타 서론, 따옴표, 또는 JSON 래핑 없이, 학생에게 보여줄 순수 모범 답안 내용만을 직접 출력하십시오.
6. 💡 **[정답 하단 직관적 의미 필수 추가 철칙 - 극도로 중요!]**: 모범 답안 맨 마지막 줄(공학적 설명 하단)에 **반드시 빈 줄(엔터 2번)을 띄운 뒤** 다음 형식으로 직관적 의미를 1~2문장으로 명시하십시오:

💡 **직관적 의미**: [해당 원리나 개념의 물리적 본질, 핵심 메커니즘 또는 실무적 의미를 한눈에 직관적으로 단번에 이해할 수 있는 명쾌하고 쉬운 비유나 설명 1~2문장]
${getNotebookLmGroundedPromptBlock('grading')}`;

  try {
    const gStandards = gradingStandards || GRADING_STANDARDS;
    const eStandards = engineeringStandards || ENGINEERING_STANDARDS;
    const sysInst = `당신은 지반공학 및 토목공학 최고 권위의 기술사 시험 출제위원입니다. 주어진 공학적 사실과 원보고서에 근거하여 가장 완벽하고 신뢰할 수 있는 단독 표준 모범 답안 텍스트만을 출력하십시오.

[📋 채점 및 모범 답안 작성 지침]:
${gStandards}

[🔬 공학 기준 절대 지침]:
${eStandards}

${LATEX_PROMPT_INSTRUCTIONS}`;
    const rawRes = await callLLMWithFailover(sysInst, answerGenPrompt, null, 'general', { temperature: modelAnswerTemperature, hybridRole: 'fast' });
    let cleanAnswer = (rawRes || '').trim();
    cleanAnswer = cleanAnswer.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    if ((cleanAnswer.startsWith('"') && cleanAnswer.endsWith('"')) || (cleanAnswer.startsWith("'") && cleanAnswer.endsWith("'"))) {
      cleanAnswer = cleanAnswer.substring(1, cleanAnswer.length - 1).trim();
    }
    if (cleanAnswer.startsWith('{') || cleanAnswer.includes('suggestedModelAnswer') || cleanAnswer.includes('suggestgedModelAnswer') || cleanAnswer.includes('"answer"') || (targetLetter && cleanAnswer.includes(`"${targetLetter}"`))) {
      let unwrapped = null;
      try {
        const parsed = parseLlmJson(cleanAnswer);
        if (parsed && typeof parsed === 'object') {
          // 0) First: If target letter exists (e.g. 'A', 'B'), check if the parsed object has a direct key for it!
          if (targetLetter) {
            for (const [k, v] of Object.entries(parsed)) {
              const cleanK = k.replace(/[\(\)\[\]_'"\s]/g, '').toUpperCase();
              if (cleanK === targetLetter && typeof v === 'string' && v.trim().length > 0) {
                unwrapped = v.trim();
                break;
              }
            }
          }

          // 1) Search keys case-insensitively for answer/model/suggest/content/response
          if (!unwrapped) {
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === 'string' && v.trim().length > 0) {
                const lowerK = k.toLowerCase().replace(/_/g, '');
                if (lowerK.includes('answer') || lowerK.includes('suggest') || lowerK.includes('model') || lowerK.includes('content') || lowerK.includes('response')) {
                  unwrapped = v.trim();
                  break;
                }
              }
            }
          }

          // 2) If no key matched, take the longest string value in the object
          if (!unwrapped) {
            const stringVals = Object.values(parsed).filter(v => typeof v === 'string' && v.trim().length > 10);
            if (stringVals.length > 0) {
              stringVals.sort((a, b) => b.length - a.length);
              unwrapped = stringVals[0].trim();
            }
          }
        }
      } catch (e) {
        // Standard parseLlmJson handles all JSON parsing with control character and LaTeX protection
      }

      if (unwrapped && unwrapped.length > 0 && !/^(success|ok|true|false)$/i.test(unwrapped)) {
        cleanAnswer = unwrapped;
      }
    }
    cleanAnswer = cleanAnswer.replace(/^(모범\s*답안|정답|표준\s*답안)\s*[:：]\s*/i, '').trim();

    // 1) 3중 이상 연속 달러 기호($$$, $$$$) 찌꺼기를 표준 $$로 정제
    cleanAnswer = cleanAnswer.replace(/\${3,}/g, () => '$$');

    // 2) 💡 직관적 의미 앞에 빈 줄이 없으면 반드시 \n\n 으로 분리 (앞 글자 캡처 부작용 제거)
    cleanAnswer = cleanAnswer.replace(/\n*\s*(💡\s*(?:\*\*)?직관적\s*의미(?:\*\*)?\s*[:：])/g, '\n\n$1').trim();

    // 3) 표준 수식 치유 함수 적용
    if (typeof healLatexFormulas === 'function') {
      cleanAnswer = healLatexFormulas(cleanAnswer);
    }

    // 4) 🛡️ NotebookLM 방식 사료 번들(Fact Dossier) 대조: 무관한 블록 수식 환각 즉시 정제
    const dossierCombined = [explanation, kcscContext, wikiGrounding].filter(Boolean).join('\n\n');
    const formulaSanitized = sanitizeUnfoundedBlockFormulas(cleanAnswer, {
      dossierText: dossierCombined,
      question,
      correctAnswer
    });
    cleanAnswer = sanitizeHallucinatedKdsCodes(formulaSanitized.sanitizedText, dossierCombined).sanitizedText;

    if (cleanAnswer.length > 0 && !/^(success|ok|true|false)$/i.test(cleanAnswer)) {
      return cleanAnswer;
    }
  } catch (err) {
    console.warn('[generateAuthoritativeModelAnswer] Phase 1 model answer derivation failed, falling back to correctAnswer:', err.message);
  }

  return correctAnswer || '공학적 기준에 부합하는 표준 답안';
}

export async function gradeSubjective({ question, correctAnswer, userAnswer, rowHeader, colHeader, explanation, category, callLLMWithFailover, gradingStandards, engineeringStandards, isReevaluation = false, kcscContext = '', wikiGrounding = '' }) {
  if (!userAnswer) {
    return { isCorrect: false, score: 0, reason: '답안이 비어 있습니다.', suggestedModelAnswer: correctAnswer };
  }

  if (!correctAnswer && !explanation && !question) {
    return { isCorrect: false, score: 0, reason: '출제 및 해설 정보가 부족하여 AI 채점을 진행할 수 없습니다.' };
  }

  if (correctAnswer && normalize(userAnswer) === normalize(correctAnswer)) {
    // 정확 일치 시에도 풍부한 모범 답안을 생성하여 학습 효과 극대화 (채점 LLM은 스킵하여 속도 최적화)
    const richModelAnswer = await generateAuthoritativeModelAnswer({
      question, correctAnswer, rowHeader, colHeader, explanation, category,
      callLLMWithFailover, gradingStandards, engineeringStandards, isReevaluation,
      kcscContext,
      wikiGrounding
    });
    const groundedCheck = verifyGroundedGradingResult({
      question,
      correctAnswer,
      authoritativeModelAnswer: richModelAnswer,
      reason: '텍스트가 모범 답안과 정확히 일치합니다.',
      explanation,
      kcscContext,
      wikiGrounding
    });
    return {
      isCorrect: true,
      score: 10,
      reason: '텍스트가 모범 답안과 정확히 일치합니다.',
      suggestedModelAnswer: groundedCheck.sanitizedModelAnswer,
      groundingVerification: groundedCheck.groundingVerification
    };
  }

  // 1. Generate Authoritative Model Answer (userAnswer is COMPLETELY ISOLATED from prompt)
  const rawAuthoritativeModelAnswer = await generateAuthoritativeModelAnswer({
    question,
    correctAnswer,
    rowHeader,
    colHeader,
    explanation,
    category,
    callLLMWithFailover,
    gradingStandards,
    engineeringStandards,
    isReevaluation,
    kcscContext,
    wikiGrounding
  });

  // 🛡️ 1-B. NotebookLM 방식 1:1 원문 인용 및 수식 환각 검증 (QuoteVerifier & GroundingVerifier)
  const groundedVerificationResult = verifyGroundedGradingResult({
    question,
    correctAnswer,
    authoritativeModelAnswer: rawAuthoritativeModelAnswer,
    explanation,
    kcscContext,
    wikiGrounding
  });
  const authoritativeModelAnswer = groundedVerificationResult.sanitizedModelAnswer;

  // 2. Grade User Answer against the Authoritative Model Answer
  const userPrompt = `
- 문제/맥락: ${question || '주관식 빈칸 채우기'}
${rowHeader ? `- 표 행 제목 (Row Header): ${rowHeader}` : ''}
${colHeader ? `- 표/빈칸 구분 제목 (Column Header): ${colHeader}` : ''}
${(rowHeader && (rowHeader.includes('(') || rowHeader.includes('상자') || rowHeader.includes('INPUT'))) ? `
🚨 **[플로우차트 빈칸 채점 주의사항]**:
- 채점 대상 빈칸: ${rowHeader} (${colHeader || '입력 답안'})
- 본 플로우차트 문항은 각 상자마다 [단계 제목]과 [세부 활동] 2개의 빈칸이 짝을 이룹니다. (예: 2단계=(A)제목, (B)세부활동 / 4단계=(C)제목, (D)세부활동).
- 절대로 (B)를 4단계로 건너뛰어 착각하지 마시고, 지정된 상자 위치의 공학적 본질 및 기준 모범 답안에 맞춰 공정하게 채점하십시오.` : ''}
${explanation ? `- 전체 해설 (Explanation): ${explanation}` : ''}
${wikiGrounding ? `
🚨 [📚 위키피디아 공학 사전 지식 (Wikipedia Grounding)]:
- 아래 공인 위키피디아 사전의 개념 정의 및 원리 메커니즘을 먼저 학습 및 대조하여, 수험생 답안의 학술적 타당성을 판정하십시오.
${wikiGrounding}
` : ''}
${kcscContext ? `
🚨 [🏛️ 국가건설기준(KCSC KDS/KCS) 공식 기준값 및 시공·품질 검증 지침]:
- 아래 국가건설기준 공식 기준값(허용오차, 안전율, 양생일령, 대기시간, 강도 등)과 시공/품질 필수 검사 항목을 최우선 검증 잣대로 삼으십시오.
- 사용자의 답안(userAnswer)이 공인 기준값이나 시공 규정과 부합하면 만점/가점을 부여하고, 공식 기준값에 반하거나 왜곡된 수치/공법을 기재한 경우 감점하고 KCSC 기준을 명시하십시오.
${kcscContext}
` : ''}
- 기준 모범 답안 (Canonical Model Answer): ${authoritativeModelAnswer}
- 사용자의 답안 (Student Answer): ${userAnswer}

🚨 **[경고 - 사용자 실제 답변 자구의 엄격한 식별 및 오인 금지 규칙 - 극도로 중요!]**:
- 채점관은 사용자가 입력한 답안인 \`사용자의 답안: ${userAnswer}\`의 구체적인 자구를 머릿속에 확실히 각인하십시오.
- 절대로 기준 모범 답안이나 전체 해설에 포함된 공학적 명칭을 사용자가 적은 답변으로 혼동하거나 뒤바꿔 착각하지 마십시오.
- 채점 피드백(reason)을 적을 때, "사용자가 적은 OOO은..." 이라고 서술할 경우, OOO 자리는 **반드시 사용자가 실제로 제출한 "${userAnswer}" 문자열과 글자 그대로 100% 동일한 글자**여야 합니다. 사용자가 입력하지 않은 다른 텍스트를 사용자가 썼다고 거짓 서술하는 행위는 채점 무효 사유이므로 절대 금지합니다.
${((colHeader && colHeader.includes('수치 계산 답안')) || category === '계산') ? `
🚨 **[계산문제 1번 채점 특례 지침 - 극도로 중요!]**:
- 본 문항은 수치 계산 문항입니다. 채점 시 **계산 과정(풀이식)의 유무는 채점 기준에서 완전히 배제**하십시오.
- 오직 **최종 답안(숫자 수치)과 단위(해당되는 경우)**가 모범 답안의 최종 수치와 일치(±5% 이내 공학적 오차 허용)하는지만을 엄격히 평가하며, 숫자 답이 맞다면 만점(10점)을 부여하십시오.
- 사용자가 계산식 없이 숫자만 덩그러니 적었더라도 절대 감점하지 마십시오.` : ''}

🚨 **[채점 및 응답 포맷]**:
- 사용자의 답안(userAnswer)이 기준 모범 답안(Canonical Model Answer)의 공학적 본질 및 메커니즘에 부합하는지 비교 평가하여 판정하십시오.
- 응답은 마크다운 코드블록 없이 순수 JSON 객체로 반환하십시오:
{
  "isCorrect": true 또는 false,
  "score": 0에서 10 사이의 정수,
  "reason": "구체적인 채점 사유 한 줄 요약"
}
`;

  const isCalcQuestion = ((colHeader && colHeader.includes('수치 계산 답안')) || category === '계산');
  const gradingTemperature = isCalcQuestion ? 0.1 : 0.7;
  const sysInst = getGradingSystemInstruction(gradingStandards, engineeringStandards);
  const responseText = await callLLMWithFailover(sysInst, userPrompt, null, 'grading', { temperature: gradingTemperature, hybridRole: 'deep' });
  let text = responseText.trim();
  
  try {
    const result = robustJSONParse(text);

    // Helper to search keys case-insensitively and ignore underscores
    const findKey = (obj, targetStr) => {
      const normalizedTarget = targetStr.toLowerCase().replace(/_/g, '');
      const keys = Object.keys(obj);
      for (const k of keys) {
        const normalizedK = k.toLowerCase().replace(/_/g, '');
        if (normalizedK === normalizedTarget || normalizedK.includes(normalizedTarget)) {
          return obj[k];
        }
      }
      return null;
    };

    const isCorrectVal = findKey(result, 'iscorrect');
    const isCorrect = isCorrectVal !== null ? !!isCorrectVal : !!result.isCorrect;

    const scoreVal = findKey(result, 'score');
    let parsedScore = NaN;
    if (typeof scoreVal === 'number') {
      parsedScore = scoreVal;
    } else if (typeof scoreVal === 'string' || typeof scoreVal === 'boolean') {
      const extracted = String(scoreVal).match(/\d+/);
      parsedScore = extracted ? parseInt(extracted[0], 10) : NaN;
    }
    
    const score = (!isNaN(parsedScore)) 
      ? parsedScore 
      : (typeof result.score === 'number' ? result.score : (isCorrect ? 10 : 0));

    const reason = findKey(result, 'reason') || result.reason || 'AI 채점 완료';

    let finalIsCorrect = isCorrect;
    let finalScore = score;
    let finalReason = reason;

    return {
      isCorrect: finalIsCorrect,
      score: finalScore,
      reason: finalReason,
      suggestedModelAnswer: authoritativeModelAnswer,
      groundingVerification: groundedVerificationResult.groundingVerification
    };
  } catch (parseErr) {
    console.error('All JSON parsing attempts failed in AI grading. Raw text:', text, parseErr);
    throw parseErr;
  }
}

export function robustJSONParse(text) {
  try {
    return parseLlmJson(text);
  } catch (err) {
    console.warn('[robustJSONParse] Standard parseLlmJson failed, trying regex field extraction:', err.message);
  }

  let cleanText = text.trim();
  const match = cleanText.match(/\{[\s\S]*\}/);
  const rawObjStr = match ? match[0] : cleanText;

  // Ultra-robust fallback: Extract fields via Regex
  try {
    const isCorrectMatch = rawObjStr.match(/"isCorrect"\s*:\s*(true|false)/i);
    const scoreMatch = rawObjStr.match(/"score"\s*:\s*(\d+)/i);
    const reasonMatch = rawObjStr.match(/"reason"\s*:\s*"([\s\S]*?)"\s*,\s*"/i) || rawObjStr.match(/"reason"\s*:\s*"([\s\S]*?)"\s*\}/i);
    const modelAnsMatch = rawObjStr.match(/"suggestedModelAnswer"\s*:\s*"([\s\S]*?)"\s*\}/i);

    const decodeJsonEscapes = (str) => {
      if (!str) return str;
      return str
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/(?:\\r\\n|\\n(?!u\b|abla|eq\b|eg\b|otin|geq|leq|sim|cong|parallel|oindent|ot\b|ewline))/g, '\n');
    };

    const isCorrect = isCorrectMatch ? isCorrectMatch[1].toLowerCase() === 'true' : true;
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : (isCorrect ? 10 : 0);
    const reason = reasonMatch ? decodeJsonEscapes(reasonMatch[1]) : 'AI 채점 완료';
    const suggestedModelAnswer = modelAnsMatch ? decodeJsonEscapes(modelAnsMatch[1]) : null;

    return {
      isCorrect,
      score,
      reason,
      suggestedModelAnswer
    };
  } catch (e2) {
    console.error('[robustJSONParse] Fallback regex extraction failed:', e2);
    throw new Error('AI 채점 JSON 파싱 오류가 발생했습니다.');
  }
}

import { gradingStandardsList as importedList } from './gradingStandardsList.js';
export let gradingStandardsList = [...importedList];

export let GRADING_STANDARDS = gradingStandardsList.map(s => s.content).join('\n\n');

export function updateLiveGradingStandards(newList) {
  if (Array.isArray(newList)) {
    gradingStandardsList = newList;
    GRADING_STANDARDS = newList.map(s => s.content).join('\n\n');
  }
}
