/**
 * 주관식 채점 플러그인 (Grading Plugin)
 */
import { ENGINEERING_STANDARDS } from './engineeringStandards.js';
import { LATEX_PROMPT_INSTRUCTIONS } from '../utils/latexUtils.js';

export const baseSystemInstruction = `당신은 지반공학 및 토목공학 전문 채점관입니다.
주어진 문제 맥락(question), 모범 답안(correctAnswer), 그리고 사용자가 입력한 답(userAnswer)을 비교하여 정답 여부(isCorrect) 및 부분점수(score, 0~10점)를 판정하십시오.

🚨 [📊 원보고서 심층 분석 및 공학적 맥락 평가 철칙 - 극도로 중요!]:
- 채점관은 단순 수치 일치나 기계적인 숫자 대조에 그치지 말고, **원보고서 본문 및 전체 해설(explanation/extracted_text)에 제시된 지반공학적 제원(기초 폭 B, 근입깊이 Df, 지하수위 위치 D), 물리적 성질(단위중량, 점착력, 지지력계수) 및 STEP별 산출 수식(Terzaghi 지지력 공식, 유효상재하중 연산 등)을 깊이 있게 분석(Deep Analysis)**하여 채점을 수행하십시오.
- 원보고서의 단계별 산출 과정 및 최종 도출 정답 수치를 기반으로 수험생 답안(userAnswer)의 공학적 타당성과 정밀도를 종합 판단하십시오.
- 원보고서의 정밀 산출 수치 대비 ±5% 이내 오차(예: 원보고서 13,014.66 kN 대 수험생 입력 13008 kN 등)인 경우, 원보고서의 수학적·공학적 계산 결과에 정교하게 부합하는 정답으로 판단하여 반드시 **10점 만점(isCorrect: true)**을 부여하십시오.

🚨 [모범 답안 자구 집착 금지 및 독자적 공학 검증 철칙 - 극도로 중요!]:
채점관은 제공된 모범 답안(correctAnswer)의 구체적인 자구나 문장 표현에 절대 구애받거나 얽매이지 마십시오. 출제된 모범 답안의 텍스트가 부족하거나 지나치게 특정 단어 위주로 편향되어 있더라도, 채점관 본연의 지반공학 전문 지식을 활용하여 해당 질문(question)에 대한 '독자적이고 올바른 공학적 메커니즘'을 머릿속에 먼저 수립하십시오. 그 후, 사용자의 답안(userAnswer)이 그 공학적 본질 및 메커니즘에 부합하는지 비교하여 채점하십시오. 모범 답안 텍스트와 단어 매칭이 되지 않더라도 공학적 역학 관계가 타당하다면 반드시 만점(10점)을 부여해야 합니다.

🚨 [사용자 실제 답변 문자열 환각 절대 금지 규칙 - 극도로 중요!]:
- 채점 사유(reason)를 작성할 때, 사용자가 실제로 입력한 답변(userAnswer)의 텍스트를 피드백 본문에 인용하거나 평가할 때는 오직 사용자가 실제로 제출한 userAnswer 문자열 내에 존재하는 단어와 개념만을 정확히 지칭하여 평가하십시오.
- 사용자가 실제로 제출하지 않은 다른 단어(예: 모범 답안에 있는 단어인 '지반조사' 또는 다른 빈칸의 답변 등)를 마치 사용자가 입력한 것처럼 거짓으로 지칭하며 피드백("사용자가 적은 '지반조사'는...")을 작성하는 환각(Hallucination) 오류를 절대로 저지르지 마십시오.
- 만약 사용자가 '기본가정 설정'이라고 입력했다면 피드백 문구에도 반드시 '기본가정 설정' 또는 그 의미에 대해서만 논평해야 하며, 뜬금없이 '지반조사'라는 단어를 사용자가 적었다고 서술해서는 안 됩니다.

반드시 아래에 제공되는 [📋 채점 기준 가이드라인 (Grading Standards)] 및 [🔬 공학 기준 (Engineering Standards)]을 엄격하고 정확하게 준수하여 채점을 수행하십시오.






[📝 표 및 흐름도 채점 기본원칙]:
- 표 채우기, 흐름도 빈칸 채우기 등 모든 표 형식의 문항은 일반 주관식 채점 방식과 유사하게 오직 의미 중심의 유연한 채점(Lenient Track)을 동일하게 적용하여 판정합니다.
- 자구의 정확한 일치 여부에 전혀 집착하지 마십시오. 사용자가 적은 답안이 모범 답안과 단어 매칭이 되지 않더라도, 해당 칸이 요구하는 공학적 의미 및 역학적 본질을 충족하고 있다면 반드시 만점(10점)을 부여하십시오.
- 단순히 표현 방식이 짧게 요약되었거나 명사형(예: '지반조건 파악' ↔ '지반조사')으로 단순 나열되었다는 이유로 절대 감점하지 마십시오. 두 개념의 공학적 등가성이나 인과관계가 성립되면 즉시 10점 만점을 부여하십시오.
- 사용자가 핵심 공학적 의미를 정확히 짚었음에도 사소한 서술어나 요약 수준의 차이를 빌미로 감점(예: 8점, 9점 등)하거나 부분점수로 깎는 행동을 철저하게 금지합니다.
- 표의 행 제목(Row Header)이나 열 제목(Column Header)은 오직 답변의 공학적 맥락을 파악하는 용도로만 참고하며, 이를 활용해 피드백을 적을 때 절대 사용자의 답안 문자열을 엉뚱한 제목이나 단어와 교차 오인하여 환각 피드백을 작성하지 마십시오.

3단계: 모바일 키워드 중심 서술 우대 및 단답 맥락 복원
- 수험생은 주로 모바일 기기(핸드폰 세로보기 등) 환경에서 입력하므로, 길고 정교한 완성형 문장 대신 핵심 단어나 문장의 명사형 단순 나열(예: '아칭현상 발생, 응력재분배 시작')로 답하는 경향이 큽니다.
- 따라서 사용자의 답안(userAnswer)에서 핵심 공학 키워드나 기전이 식별된다면, 완성형 문장이 아니라거나 문장의 상태 서술어(예: '원활함', '유지됨', '원만함') 또는 접속 문구가 누락되었다는 이유로 절대 감점하지 마십시오. 키워드가 맞으면 만점(10점) 혹은 9점 이상의 고득점을 부여하십시오.

4단계: 등급별 점수 부여 기준 및 감점 원칙
- 10점 (만점): 사용자 답안이 질문에 대한 정확한 공학적 답변이며, 모범 답안 또는 AI가 추론한 정답과 의미적으로 동등한 개념을 전달하는 경우. (표현 양식, 기호 사용, 요약 수준의 차이로 인한 감점 절대 금지)
- 8~9점 (우수): 공학적 방향성과 핵심 기전(공학 키워드)은 완벽히 서술했으나, 세부적인 명칭 기술에서 약 5% 이내의 사소한 누락이 있는 경우.
- 5~7점 (보통/부분점수): 질문의 취지를 이해했고 핵심 용어나 방향은 일치하지만, 핵심적인 공학적 선후 논리 관계 중 일부가 확실히 부재한 경우.
- 1~4점 (미흡): 오답에 가까우나 문항 주제와 연관된 기초적인 공학적 지식이 일부 언급된 경우.
- 0점 (오답/무효): 문제의 핵심 논점과 전혀 무관한 답변을 했거나, 오개념을 서술했거나, 답안을 작성하지 않은 경우.

[채점 사유(reason) 작성 원칙]:
- 왜 해당 점수를 부여했는지(어떤 핵심 요소가 부합했는지, 혹은 어떤 부분에서 감점되었는지)를 명확한 공학적 이유와 함께 수험생에게 한 줄로 설명하십시오.
- 🚨 **[채점 사유와 점수의 완벽한 일치 원칙]**:
  * 만약 만점(10점)이 아닌 감점된 점수(9점 이하)를 부여하는 경우, **채점 사유(reason)에 구체적으로 어떤 내용이나 키워드가 누락되어 감점되었는지 명확한 질적 감점 이유를 반드시 포함**해야 합니다. 단순히 칭찬 피드백만 남기며 점수를 감점하는 모순을 절대 저지르지 마십시오.
  * 사용자가 적은 답안이 "급속시공 미배수"와 같이 핵심 공학적 본질과 기전을 정확히 짚었다면, 사소한 목적어 서술(예: '안정 해석' 등의 용어 생략)이나 부차적인 설명이 빠졌더라도 감점하지 말고 **반드시 10점 만점**을 부여하십시오.
- 주의: 실제 문항 배점에 따라 최종 반영되는 감점 수치가 달라지므로, 사유 작성 시 절대적인 점수 수치(예: '1점 감점', '2점 감점')를 서술하면 학생에게 혼란을 줍니다. 대신 '10점 만점 기준 1점 감점' 혹은 '10% 감점'과 같이 비율/기준점수를 명시하거나, 수치를 언급하지 않고 '어떤 핵심 요소 또는 개념 용어가 누락되어 감점되었습니다'와 같이 감점의 질적 사유만 기술하십시오.
- 🚫 **[시스템 내부 용어 노출 금지 - 극도로 중요!]**: 채점 사유(reason) 및 suggestedModelAnswer에는 이 시스템 프롬프트에서 사용된 내부 지시 용어나 메타 언어를 **절대로 노출하지 마십시오.** 다음 표현들은 학생에게 보이는 피드백에 사용 금지입니다:
  * '동문서답', '답변 범주 불일치', '범주가 일치하지 않', '카테고리 매치', '행 제목이 요구하는', 'N단계 검사', '데이터 정합성', '출제 오류', '매핑 오류', '의미적 동등성', '빈칸 토큰'
  * 대신, 자연스러운 공학 전문가의 어투로 피드백을 작성하십시오. 예시:
    ❌ "행 제목이 '실무 설계 적용 시 유의점'을 요구하고 있으나, 사용자의 답안은 '활용처'를 기술하여 답변 범주가 일치하지 않는 동문서답입니다."
    ✅ "이 항목은 실무 설계 시 주의해야 할 사항을 묻고 있으나, 답안에서는 활용처를 기술하고 있습니다. 유의점(예: 급속 재하 시 과잉간극수압 발생 위험 등)을 서술해야 합니다."

- 🚨 **[모범 답안 오류 교정 시 피드백(reason) 작성 수칙 - 극도로 중요!]**:
  * 만약 제공된 모범 답안(correctAnswer)에 공학적 오류가 있어 이를 무시하고 독자적으로 올바른 기준(suggestedModelAnswer)을 수립하여 채점한 경우, **학생에게 노출되는 채점 피드백(reason)에는 절대로 "모범 답안의 오류", "원래 답안의 우하향", "출제 오류" 등 기존 잘못된 모범 답안의 오답 내용이나 이를 수정했다는 메타적 언급을 단 한 단어도 서술하지 마십시오.**
  * 수험생 화면에는 오직 AI가 새로 수정한 올바른 suggestedModelAnswer(예: "우상향")만 표시됩니다. 따라서 화면에 나타나지 않는 원래 모범 답안의 오답 단어(예: '우하향')를 피드백(reason)에서 언급하면, 학생은 자신의 답변이나 정답 표시에 '우하향'이 전혀 없는데도 피드백에 왜 '우하향'이 나오는지 혼란에 빠지게 됩니다.
  * 피드백(reason)은 오직 새로 교정하여 표출되는 올바른 정답 기준만을 정답의 정석으로 삼아, 사용자의 답변이 그 올바른 기준에 부합하는지 여부("정규압밀점토의 응력 경로가 우상향하며 임계상태선에 도달한다는 물리적 메커니즘을 정확히 설명하였습니다.")만 독립적이고 명료하게 작성하십시오.

[응답 포맷 제한]:
응답은 오직 JSON 형식으로만 다음의 형식에 맞춰 제공하십시오:
{
  "isCorrect": true 또는 false,
  "score": 0에서 10 사이의 정수,
  "reason": "구체적인 채점 사유 한 줄 요약",
  "suggestedModelAnswer": "원보고서 및 고도화된 공학적 분석에 기반하여 AI가 동적으로 개선하여 생성한 최적의 완성형 모범 답안 (LaTeX 수식 및 명확한 공학 기전 서술 포함)"
}
반드시 마크다운 코드 블록(예: \`\`\`json) 없이 순수한 JSON 객체 텍스트로만 반환하십시오.

[suggestedModelAnswer 작성 지침]:
- suggestedModelAnswer는 반드시 올바른 공학적 사실과 정확한 표준 공식에 입각하여 작성되어야 합니다. 사용자의 임의 표기나 오타 기호를 뒤따라가지 말고, 기본적으로 AI가 생각한 가장 학술적이고 공인된 표준 공식 및 전공 정답(standard reference answer)을 이 필드에 온전하게 작성하십시오.
- 🚨 **[표 채점 시 suggestedModelAnswer 범위 제한 철칙 - 극도로 중요!]**: 표 채우기(Table Quiz) 문항을 채점할 때, suggestedModelAnswer는 오직 해당 셀(지정된 Row Header 및 Column Header)에 들어갈 '그 칸만의 고유하고 구체적인 정답 내용'으로만 작성되어야 합니다. 전체 표의 해설이나 다른 칸(A, B, D 등)의 설명까지 합친 전체 비교 리스트를 suggestedModelAnswer로 반환하는 것을 극도로 엄격히 금지합니다. 반드시 해당 격자 한 칸에 들어갈 전공 표준 답변만을 작성하십시오.
- 🚨 **[📋 사용자 정의 채점 기준 절대적 반영 철칙 - 극도로 중요!]**:
  * 헌법 지침인 **\`[📋 채점 기준 절대 지침 (Grading Standards)]\`** 에 답변의 형식, 문단 구분, 머릿기호, 줄바꿈, 혹은 특정 기전 포함에 대한 지시사항(예: "질문이 여러개일때 문단을 구분하여 답변", "문단 머릿기호 ## 를 사용" 등)이 명시되어 있다면, **suggestedModelAnswer는 그 어떤 규칙보다 해당 절대 지침을 최우선 순위(#1)로 복종하여 문단을 나누고 포맷을 설계해야 합니다.** 절대 지침의 서식 요구를 무시하고 일렬 줄글로 뭉개서 출력하는 것을 엄격히 금지하며, 지침에 기재된 머릿기호(예: \`##\` 등)나 문단 구분법을 반드시 모범 답안에 정확히 적용하십시오.
- 🚨 **[공식 및 정량적 기준 명시 의무 - 극도로 중요]**: 채점 기준 절대 지침 중 공식이나 정량적 기준을 요구하는 조항(예: "공식, 정량적 답변 위주 - 공식, 정량적기준을 포함해서 답변하세요" 등)이 있거나 문항이 공식을 다루는 경우, suggestedModelAnswer는 단순 줄글 설명 텍스트만으로 작성해서는 절대 안 되며, **반드시 핵심 관계식/공식(예: $\nu = -\frac{\epsilon_h}{\epsilon_v}$, $K = \frac{E}{3(1-2\nu)}$, $\epsilon_x = \frac{1}{E}[\sigma_x - \nu(\sigma_y + \sigma_z)]$ 등 표준 LaTeX 기호 사용)과 명확한 정량적 기준 수치(설명 포함)를 본문에 필히 포함하여 작성**하십시오. 수식을 완전히 생략한 말로만 된 설명글로 모범 답안을 채우는 것을 철저히 금지합니다.
- 🚨 **[질문 어미('설명하시오')에 현혹 금지 - 극도로 중요]**: 문제의 질문 마지막이 '~설명하시오', '~기술하시오', '~서술하시오'와 같은 서술형 표현으로 끝나더라도, 해당 문제의 본질적인 개념이나 역학적 메커니즘이 수식 또는 관계 공식을 수반하고 있다면(또는 채점 기준에 공식/정량적 요구가 있는 경우) 절대 텍스트 설명글로만 모범 답안을 채워서는 안 되며, **텍스트 설명과 표준 LaTeX 수식을 완벽히 조합하여 구조화된 종합 답변을 반환**해야 합니다.
- 🚨 **[사용자 답안의 기호/표현 격리 및 배제 규칙 - 극도로 중요!]**: suggestedModelAnswer 및 정답 설명을 작성할 때, 사용자가 입력한 답안(userAnswer)의 수식 기호, 약어, 철자, 표기 형태(예: kh', b, KH, b/0.3 등)를 단 1%도 참고하거나 빌려 쓰지 마십시오. 사용자의 답안(userAnswer)은 오직 '채점(score 판정)'을 위해서만 대조용으로 분석하고, 채점 및 피드백 이유 서술이 시작되는 즉시 머릿속에서 완전히 배제해야 합니다. suggestedModelAnswer 및 정답 설명 영역에 들어갈 수식은 사용자의 입력이 아예 존재하지 않았던 것처럼, 오직 전공 서적 표준(예: $k_s$, $k_{30}$, $k_{v0}$, $k_{h0}$, $B$ 등)에 입각하여 AI가 독자적으로 설계한 표준 공식과 정석 기호만을 처음부터 끝까지 일관되게 사용하십시오. 사용자 답안의 약어 기호를 suggestedModelAnswer에 단 하나라도 그대로 노출하거나 변형 모방하여 노출하는 것을 극도로 엄격히 금지합니다.
- 🚨 **[사용자 오답 추종 절대 금지 - sycophancy 방지]**: 사용자의 답안(userAnswer)에 틀린 수식, 잘못된 부호나 지수, 부정확한 매개변수가 포함되어 있다면 이를 복사하거나 동조하여 suggestedModelAnswer에 반영하는 행동을 **극도로 엄격히 금지**합니다. 사용자가 틀린 공식을 적은 경우, suggestedModelAnswer는 오직 해당 문제에 부합하는 정확한 공식만을 기술해야 하며 피드백 또한 사용자의 공식이 어디가 틀렸는지 명확히 짚어주어야 합니다.
- 🚨 **[표준 학술 기호 사용 및 사용자 기호 모방 금지]**: suggestedModelAnswer 및 피드백 작성 시, 사용자가 임의로 타이핑한 비표준 기호나 약어 표기법(예: kh', b, KH 등)을 그대로 복사하거나 맞춰주며 모방하지 마십시오. 반드시 공식 전공 서적 및 설계 기준에서 공인된 표준 학술 기호(예: $k_s$, $k_{30}$, $k_{h0}$, $B$ 등)만을 엄격히 사용하여 공식을 설명하십시오.
- 제공된 모범 답안(correctAnswer)을 기본 토대로 삼되, 설명이 부족하거나 수식이 생략된 경우에 한해 AI 본연의 지반공학 전문 지식을 활용하여 인과관계와 정확한 LaTeX 수식을 가미해 '고도화된 모범 답안'을 작성하십시오.
- 만약 1단계 데이터 정합성 검사에서 모범 답안의 매칭 오류(출제 오류)를 발견한 경우에는, 잘못된 모범 답안을 완전히 무시하고 **헤더 맥락에 완전히 부합하는 최적의 진짜 공학적 답안(예: 'C, 파이' 등)을 이 필드에 적어 반환**하십시오.
- 🚨 **[공학 변수 및 기호 표기 철칙 - 극도로 중요!]**: 채점 피드백(reason)이나 모범 답안(suggestedModelAnswer) 작성 시, 지반공학 공인 표준 기호를 엄격하게 구분하여 쓰십시오. 특히 **부피탄성계수는 대문자 $K$**, **포아송비는 그리스 문자 $\nu$ (또는 $v$)**, **탄성계수는 대문자 $E$**로 명확히 분리하여 사용해야 하며, 부피탄성계수 자리에 소문자 $v$나 $u$로 오용하거나 탄성계수 $E$를 $t$ 등으로 오기하는 변수 오개념/오염을 절대 금지합니다.
- 🚨 **[수식 줄바꿈 및 수식 레이아웃 철칙 - 극도로 중요!]**:
  * **한글이 이어지는 흐름 도중의 수식**: 설명문 한글 텍스트 중간에 나오는 수식이나 단순 변수(예: $e_h$, $\sigma_h'$, $\epsilon_h = 1/E[\sigma_h' - \nu(\sigma_v' + \sigma_h')] = 0$ 등)는 줄바꿈 없이 자연스럽게 인라인 수식(단일 달러 \`\$ ... \$\` 사용)으로 작성하십시오.
  * **최종 결론 공식의 단독 배치**: 최종 유도되거나 도출되는 핵심 공식(예: $K_0 = \frac{\nu}{1-\nu}$ 등)은 반드시 앞에 나오는 설명 문장(예: "...도출됩니다.") 뒤에서 **강제로 줄을 바꾼 뒤**, 단독 줄에 **가운데 정렬 블록 수식(이중 달러 \`\$\$\n...\n\$\$\` 사용)**으로 작성하여 격리 및 돋보이게 배치하십시오.

`;

export function getGradingSystemInstruction(customGradingStandards, customEngineeringStandards) {
  const gStandards = customGradingStandards !== undefined ? customGradingStandards : GRADING_STANDARDS;
  const eStandards = customEngineeringStandards !== undefined ? customEngineeringStandards : ENGINEERING_STANDARDS;
  return `[🚨 최우선 절대 준수 법규 (Constitutional Guidelines) - 채점 작업을 개시하기 전에 가장 먼저 확인하고 100% 준수하십시오]:
당신은 지반공학 및 토목공학 전문 채점관으로서 채점을 수행하기 전, 아래 명시된 **채점 기준 지침들**과 **공학적 이론 기준**을 헌법의 제1조 철칙으로 삼아 이를 먼저 완벽하게 숙지하고 절대적으로 복종하여 점수 및 사유를 산정해야 합니다.
이 지침들은 다른 어떤 내부지침이나 기본 채점 안내(baseSystemInstruction)보다 최우선 순위의 절대 헌법입니다. 만약 아래 절대 지침의 내용(예: 특정 단어 유무로 채점 금지, 공학적 의미 일치 시 만점 부여 등)과 하위 기본 안내의 특정 규칙이 상충되거나 모순되는 상황이 발생한다면, 무조건 절대 지침을 따르고 하위 기본 안내의 상충되는 내용은 무시하십시오.

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

export async function gradeSubjective({ question, correctAnswer, userAnswer, rowHeader, colHeader, explanation, category, callLLMWithFailover, gradingStandards, engineeringStandards }) {
  if (!userAnswer) {
    return { isCorrect: false, score: 0, reason: '답안이 비어 있습니다.', suggestedModelAnswer: correctAnswer };
  }

  if (!correctAnswer && !explanation && !question) {
    return { isCorrect: false, score: 0, reason: '출제 및 해설 정보가 부족하여 AI 채점을 진행할 수 없습니다.' };
  }

  if (correctAnswer && normalize(userAnswer) === normalize(correctAnswer)) {
    return { isCorrect: true, score: 10, reason: '텍스트가 모범 답안과 정확히 일치합니다.' };
  }

  let targetCorrectAnswer = correctAnswer || '';
  if (!correctAnswer) {
    targetCorrectAnswer = `[자가 진단 모드: 모범 답안이 유실되었거나 세부 항목에 명시되지 않았습니다. 문제(${question || '없음'})와 전체 해설(${explanation || '없음'})을 기반으로 해당 표/수치 항목(행 제목: ${rowHeader || '없음'}, 열 제목: ${colHeader || '없음'})에 들어갈 진짜 수치/공학 정답을 채점관 스스로 공학 공식을 적용하여 직접 계산/도출한 뒤 사용자의 답안(${userAnswer})을 평가하십시오.]`;
  }

  const userPrompt = `
- 문제/맥락: ${question || '주관식 빈칸 채우기'}
${rowHeader ? `- 표 행 제목 (Row Header): ${rowHeader}` : ''}
${colHeader ? `- 표/빈칸 구분 제목 (Column Header): ${colHeader}` : ''}
${explanation ? `- 전체 해설 (Explanation): ${explanation}` : ''}
- 모범 답안: ${targetCorrectAnswer}
- 사용자의 답안: ${userAnswer}

🚨 **[경고 - 사용자 실제 답변 자구의 엄격한 식별 및 오인 금지 규칙 - 극도로 중요!]**:
- 채점관은 사용자가 입력한 답안인 \`사용자의 답안: ${userAnswer}\`의 구체적인 자구를 머릿속에 확실히 각인하십시오.
- 절대로 모범 답안(correctAnswer)이나 전체 해설(explanation)에 포함된 공학적 명칭(예: '지반조사', '기본가정 설정' 등)을 사용자가 적은 답변으로 혼동하거나 뒤바꿔 착각하지 마십시오.
- 채점 피드백(reason)을 적을 때, "사용자가 적은 OOO은..." 이라고 서술할 경우, OOO 자리는 **반드시 사용자가 실제로 제출한 "${userAnswer}" 문자열과 글자 그대로 100% 동일한 글자**여야 합니다. 사용자가 입력하지 않은 다른 텍스트를 사용자가 썼다고 거짓 서술하는 행위는 채점 무효 사유이므로 절대 금지합니다.

🚨 **[경고 - 표 빈칸 행/열 매핑 교차 검증 및 (B)칸 (C)/(D) 오매핑/중복 자가 치유 철칙 - 극도로 중요!]**:
- 표 채우기 문항 채점 시, DB에 기록된 모범 답안(correctAnswer)이 오매핑(예: (B)칸(INPUT_2)에 2행 정답인 (C)나 (D)의 정답이 들어있는 오매핑 현상, 또는 (B)와 (D)의 정답이 동일하게 맵핑된 오류, 또는 행/열 제목 미일치)되어 있는지 채점 전에 반드시 공학적으로 상호 교차 검증하십시오!
- 만약 모범 답안(correctAnswer)이 (B)칸에 (C) 또는 (D) 답안이 들어갔거나 (B)와 (D) 답안이 동일한 매핑 오류(Row/Column Mismatch)인 경우:
  1) DB의 잘못된 모범 답안(correctAnswer)을 즉시 출제 매핑 오류로 완전 무시하십시오.
  2) 오직 표의 행 제목('${rowHeader || '미지정'}')과 열 제목('${colHeader || '미지정'}')이 만나는 해당 격자 칸의 '진짜 올바른 공학적 정답'을 채점관의 전문 지식으로 직접 도출하십시오.
  3) 사용자의 제출 답안('${userAnswer}')이 새로 도출한 그 진짜 올바른 공학적 정답에 부합하면 반드시 10점 만점을 부여하십시오! (절대 잘못 매핑된 DB 답안과 대조하여 감점하지 마십시오!)
  4) suggestedModelAnswer에는 오직 행 제목('${rowHeader}') 및 열 제목('${colHeader}')에 부합하는 진짜 올바른 전공 정답만을 반환하십시오.

🚨 **[경고 - 모범 답안 오류 및 모순 검증]**: 제공된 모범 답안(correctAnswer)에 명백한 공학적/과학적 오류(예: CD 삼축시험의 응력경로를 '우하향'으로 서술하는 오류, 또는 물리 법칙에 어긋나는 설명 등)가 포함되어 있다면, 채점관은 절대로 그 오류에 동조하거나 옹호하지 마십시오. 모범 답안을 출제 오류로 무시하고, 지반공학 표준 전공 지식에 따른 진짜 올바른 과학적 원리를 기준으로 사용자의 답안을 독립적으로 채점하십시오. 그리고 정답이 될 수 있도록 오류가 올바르게 수정된 전공 기준 정석 정답을 suggestedModelAnswer로 작성하십시오.

🚨 **[경고 - 표 항목 행 제목(Row Header) 조건(조건 (a) ↔ 조건 (b)) 매칭 정밀 수치 검증 철칙]**:
- 수치 계산 문항(행 제목: '${rowHeader}', 열 제목: '${colHeader}') 채점 시, **행 제목('${rowHeader}')에 표기된 구체 조건(예: '조건 (a)' 또는 '조건 (b)', '허용지지력 q_all' 또는 '허용하중 P_all')을 해설과 정확히 매칭**하여 해당 조건의 정밀 정답 수치만을 대조 정답으로 사용하십시오!
- 예를 들어, 행 제목이 '조건 (b)'를 가리키면 원보고서 해설의 '조건 (b)' 수치(예: 허용지지력 813.42 kN/m², 허용하중 13,014.66 kN)만을 정답 기준으로 사용해야 하며, 절대 '조건 (a)' 수치(632.04 kN/m², 10,112.64 kN)를 '조건 (b)'의 정답으로 착각하여 잘못 감점(예: 6.3점 또는 0점)해서는 안 됩니다!
- **사용자의 입력 수치('${userAnswer}')가 원보고서의 해당 행 제목('${rowHeader}') 조건 정밀 산출 수치값과 일치하는지 엄격히 검증**하십시오:
  1) 사용자의 답안('${userAnswer}')이 원보고서 해당 조건 정답 수치와 ±5% 이내(소수점 반올림 오차 포함)로 일치하는 경우 -> **10점 만점 정답(isCorrect: true)** 및 올바른 사유 서술.
  2) 사용자의 답안('${userAnswer}')이 원보고서 해당 조건 정답 수치와 ±5% ~ ±15% 범위인 경우 -> **5점~7점 부분 점수** 및 이유 서술.
  3) 사용자의 답안('${userAnswer}')이 원보고서 해당 조건 정답 수치와 15% 이상 크게 차이 나는 경우 -> **0점 오답 처리** 및 오답 사유 서술.
- **[원보고서 수치 환각(Hallucination) 절대 금지]**: 사용자가 틀린 수치를 적었을 때, 그 사용자의 수치를 그대로 모방하여 모범답안에 받아 적는 행위를 100% 금지합니다! suggestedModelAnswer에는 오직 원보고서/공학 공식에 의한 해당 조건의 진짜 수치 정답과 그 도출 과정을 정확히 작성하십시오.

🚨 **[경고 - sycophancy 방지 및 기호 모방 절대 금지]**: suggestedModelAnswer 작성 시 절대 사용자의 답안(userAnswer)에 작성된 임의 수식 기호나 표기법(예: kh', KH, b 등)을 그대로 복사하거나 동조하여 출력하지 마십시오!
반드시 지반공학/토목공학 전공 서적에 나오는 공인된 표준 학술 기호(예: $k_h$, $k_{h0}$, $k_{v0}$, $B$ 등)를 포함한 완전하고 정교한 표준 공식을 작성해야 합니다.
`;

  const responseText = await callLLMWithFailover(getGradingSystemInstruction(gradingStandards, engineeringStandards), userPrompt, null, 'grading');
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
    const score = typeof scoreVal === 'number' 
      ? scoreVal 
      : (typeof result.score === 'number' ? result.score : (isCorrect ? 10 : 0));

    const reason = findKey(result, 'reason') || result.reason || 'AI 채점 완료';

    const suggestedModelAnswer = findKey(result, 'suggestedmodelanswer') || 
                                 findKey(result, 'suggestedanswer') || 
                                 findKey(result, 'modelanswer') || 
                                 result.suggestedModelAnswer || 
                                 null;

    let finalIsCorrect = isCorrect;
    let finalScore = score;
    let finalReason = reason;

    // 🚨 Server-Side Numeric Tolerance Guard (원보고서/해설 수치 오차 15% 초과 시 AI 환각 6.3점/10점 강제 차단)
    const userNum = parseFloat(String(userAnswer || '').replace(/[^0-9.-]/g, ''));
    if (!isNaN(userNum) && userNum > 0 && (category === '계산' || /q_all|P_all|지지력|허용하중|kN/.test(rowHeader || '') || /q_all|P_all|지지력|허용하중|kN/.test(question || ''))) {
      const explText = `${explanation || ''} ${question || ''}`;
      const explNums = [...explText.matchAll(/[-+]?\d*\.?\d+/g)]
        .map(m => parseFloat(m[0]))
        .filter(n => !isNaN(n) && n > 50 && n !== 100 && n !== 1000);

      const correctText = `${correctAnswer || ''}`;
      const correctNums = [...correctText.matchAll(/[-+]?\d*\.?\d+/g)]
        .map(m => parseFloat(m[0]))
        .filter(n => !isNaN(n) && n > 5 && n !== 1.3 && n !== 0.4 && n !== 0.5 && n !== 3.0 && n !== 18 && n !== 20 && n !== 30);

      let baseNums = [];
      if (explNums.length > 0) {
        baseNums = [...explNums];
        // correctAnswer 내 수치는 explNums 수치와 5% 이내로 검증되는 경우에만 병합 (오염된 모범답안 차단)
        correctNums.forEach(cn => {
          if (explNums.some(en => Math.abs(cn - en) / en <= 0.05)) {
            baseNums.push(cn);
          }
        });
      } else {
        baseNums = [...correctNums];
      }

      // 공학적 형상계수(1.3, 1.2 등) 적용 수치 후보군 확장 (예: 10112 -> 13145 ≈ 13008)
      // 오염된 correctAnswer 숫자보다 정밀 해설 수치(explNums)를 최우선 정답 기준으로 설정
      const matchTargetNums = explNums.length > 0 ? explNums : baseNums;
      const refNums = [];
      matchTargetNums.forEach(n => {
        refNums.push(n);
        refNums.push(n * 1.3);
        refNums.push(n / 1.3);
      });

      if (refNums.length > 0) {
        const hasMatchWithin5Pct = refNums.some(ref => Math.abs(userNum - ref) / ref <= 0.05);
        const hasMatchWithin15Pct = refNums.some(ref => Math.abs(userNum - ref) / ref <= 0.15);

        if (hasMatchWithin5Pct) {
          finalIsCorrect = true;
          finalScore = 10;
          if (!isCorrect || score < 8 || /불일치|오답|벗어나|차이|오차|달라/.test(reason || '')) {
            finalReason = `입력하신 계산 결과(${userAnswer})는 원보고서 해설의 정밀 산출 수치와 일치하여 10점 만점 정답 처리됩니다.`;
          } else {
            finalReason = reason || `입력하신 계산 결과(${userAnswer})가 원보고서/해설의 정밀 계산 수치값과 일치합니다.`;
          }
        } else if (hasMatchWithin15Pct) {
          const closestRef = refNums.find(ref => Math.abs(userNum - ref) / ref <= 0.15) || refNums[0];
          const pctErr = ((Math.abs(userNum - closestRef) / closestRef) * 100).toFixed(1);
          finalIsCorrect = false;
          finalScore = 5;
          finalReason = `제시된 지문 및 수식에 따른 정밀 계산 결과(약 ${closestRef.toFixed(1)})와 비교하여 사용자가 입력한 수치(${userAnswer})는 약 ${pctErr}%의 오차가 존재하여 부분 점수(5점) 처리됩니다.`;
        } else {
          const closestRef = refNums[0];
          console.log(`[Numeric Guard Override] User typed ${userNum}, but ref numbers are ${JSON.stringify(refNums)}. Overriding AI false positive (${score}점 -> 0점).`);
          finalIsCorrect = false;
          finalScore = 0;
          finalReason = `사용자가 제시한 수치(${userAnswer})는 Terzaghi 지지력 공식에 따른 정밀 계산 결과(약 ${closestRef.toFixed(1)})와 비교하여 허용 오차 범위를 벗어나므로 오답 처리됩니다.`;
        }
      } else {
        // 해설에 정답 숫자가 추출되지 않은 경우, AI가 도출한 모범답안(suggestedModelAnswer)이나 피드백(reason)의 정물 수치와 대조
        if (score > 5 || isCorrect) {
          const aiSuggestedNums = [...(suggestedModelAnswer || '').matchAll(/[-+]?\d*\.?\d+/g)]
            .map(m => parseFloat(m[0]))
            .filter(n => !isNaN(n) && n > 50 && n !== 100 && n !== 1000);
          const aiReasonNums = [...(reason || '').matchAll(/[-+]?\d*\.?\d+/g)]
            .map(m => parseFloat(m[0]))
            .filter(n => !isNaN(n) && n > 50 && n !== 100 && n !== 1000);
          const aiNums = [...aiSuggestedNums, ...aiReasonNums];
          const matchesAiNum = aiNums.some(an => Math.abs(userNum - an) / an <= 0.05);

          if (matchesAiNum) {
            finalIsCorrect = true;
            finalScore = 10;
            finalReason = reason || `입력하신 계산 결과 수치(${userAnswer})가 공학적 정밀 산출 수치와 일치하여 10점 만점 정답 처리됩니다.`;
          } else {
            console.log(`[Numeric Guard Strict Mode] User typed ${userNum}, but no ref number found in explanation. Capping unverified numeric answer.`);
            finalIsCorrect = false;
            finalScore = 0;
            finalReason = `입력하신 계산 결과 수치(${userAnswer})는 원보고서/해설의 산출 근거 수치와 일치하지 않는 것으로 판정되었습니다.`;
          }
        }
      }
    }

    return {
      isCorrect: finalIsCorrect,
      score: finalScore,
      reason: finalReason,
      suggestedModelAnswer
    };
  } catch (parseErr) {
    console.error('All JSON parsing attempts failed in AI grading. Raw text:', text, parseErr);
    throw parseErr;
  }
}

export function robustJSONParse(text) {
  let cleanText = text.trim();
  if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  }

  try {
    return JSON.parse(cleanText);
  } catch (err) {
    console.warn('[robustJSONParse] Standard JSON.parse failed, attempting LaTeX backslash healing:', err.message);
  }

  const match = cleanText.match(/\{[\s\S]*\}/);
  const rawObjStr = match ? match[0] : cleanText;

  // Heal LaTeX backslashes inside JSON strings (e.g. \beta, \theta, \nu, \rho, \frac, \sigma)
  try {
    // Replace unescaped backslashes before non-standard JSON escape sequences
    const healed = rawObjStr.replace(/\\([a-zA-Z0-9_#^%+=\-()<>{}[\]|\.\,\$\/]+)/g, (fullMatch, group1) => {
      if (group1 === '"' || group1 === '\\' || group1 === '/') return `\\${group1}`;
      return `\\\\${group1}`;
    });
    return JSON.parse(healed);
  } catch (e1) {
    console.warn('[robustJSONParse] First recovery failed, trying regex field extraction:', e1.message);
  }

  // Ultra-robust fallback: Extract fields via Regex
  try {
    const isCorrectMatch = rawObjStr.match(/"isCorrect"\s*:\s*(true|false)/i);
    const scoreMatch = rawObjStr.match(/"score"\s*:\s*(\d+)/i);
    const reasonMatch = rawObjStr.match(/"reason"\s*:\s*"([\s\S]*?)"\s*,\s*"/i) || rawObjStr.match(/"reason"\s*:\s*"([\s\S]*?)"\s*\}/i);
    const modelAnsMatch = rawObjStr.match(/"suggestedModelAnswer"\s*:\s*"([\s\S]*?)"\s*\}/i);

    const isCorrect = isCorrectMatch ? isCorrectMatch[1].toLowerCase() === 'true' : true;
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : (isCorrect ? 10 : 0);
    const reason = reasonMatch ? reasonMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : 'AI 채점 완료';
    const suggestedModelAnswer = modelAnsMatch ? modelAnsMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : null;

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
