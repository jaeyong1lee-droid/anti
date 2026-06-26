import { LATEX_PROMPT_INSTRUCTIONS } from '../utils/latexUtils.js';

/**
 * Generates 5 formula-based multiple-choice questions for the daily lockscreen quiz.
 * @param {Array} formulaQuestions List of all formulas stored in DB
 * @param {Function} callLLMWithFailover LLM call utility
 * @returns {Promise<Array>} List of generated multiple-choice questions
 */
export async function generateDailyLockscreenQuestions(formulaQuestions, callLLMWithFailover) {
  if (!Array.isArray(formulaQuestions) || formulaQuestions.length === 0) {
    throw new Error('No formula questions available to generate quiz');
  }

  // Pick up to 10 formulas randomly as candidates for this LLM call
  const candidates = [...formulaQuestions]
    .sort(() => 0.5 - Math.random())
    .slice(0, 10);

  const candidateInfo = candidates.map((f, i) => {
    return `[Formula Candidate #${i + 1}]:
- 공식명 (Title): ${f.title}
- 수식 (Formula): ${f.formula}
- 개념 (Concept): ${f.concept || ''}
- 기호정의 (Structure): ${f.structure || ''}`;
  }).join('\n\n');

  const systemInstruction = `당신은 대한민국 토목공학 및 지반공학 기술사 시험 출제위원입니다.
제시된 공식 후보들을 기반으로, 수험생이 화면 잠금을 해제할 때 풀 수 있는 하루치 객관식(4지선다형) 퀴즈 5문제를 출제하십시오.
반드시 아래 지정된 JSON 배열 포맷으로만 응답해야 하며, 다른 부가 설명이나 백슬래시 에러가 있어서는 안 됩니다.`;

  const userPrompt = `
[대상 공식 후보군]:
${candidateInfo}

[출제 요구사항]:
1. **문제 개수**: 반드시 정확히 **5개의 객관식 문제**를 출제해 배열 형태로 반환하십시오.
2. **출제 주제**: 오직 제공된 공식 후보들과 관련된 객관식(4지선다형) 문제만 출제하십시오.
3. **🚨 [정답 유형 제한 - 극도로 중요!]**:
   - 질문은 무조건 **"맞는 것(올바른 것)"**을 고르도록 요구해야 합니다.
   - **절대로 "틀린 것", "올바르지 않은 것", "잘못된 것"을 고르는 문제는 출제하지 마십시오.** (예: "다음 중 ~에 대해 틀린 설명은?" 같은 질문 금지)
4. **질문 구성 방식 (아래 3가지 예시 유형 위주로 골고루 안배하여 출제)**:
   - **[유형 1 (공식 명칭 매칭)]**: 수식(LaTeX)을 질문 본문에 먼저 제시하고, 이 공식이 누구의 공식(공식명)인지 맞추는 문제.
     * 예시) 질문: "다음 공식은 지반공학에서 누구의 공식(또는 어떤 공식명칭)입니까? $$q = c N_c + q N_q + 0.5 \\gamma B N_\\gamma$$" -> 보기 중 올바른 공식명칭 선택.
   - **[유형 2 (개념/공식 식 매칭)]**: 특정 공학적 개념이나 명칭(예: 피압대수층 투수계수)을 질문 본문으로 제시하고, 보기에 4개의 다른 LaTeX 공식을 두어 올바른 수식 형태를 고르게 하는 문제.
     * 예시) 질문: "다음 중 피압대수층의 투수계수를 구하는 올바른 공식은 무엇입니까?" -> 보기 1)~4)에 서로 다른 수식($$)을 제공.
   - **[유형 3 (상수 및 비례 관계)]**: 공식 구성 요소 중 특정 상수값의 의미, 배수 조건에 따른 변화, 또는 변수 간의 비례/반비례 관계를 정확히 이해하고 있는지 묻는 문제.
     * 예시) 질문: "테르자기 1차 압밀 이론에서 양면배수 조건일 때 최대 배수거리 $d$는 점토층 두께 $H$와 어떤 관계입니까?" 또는 "테르자기 지지력 공식에서 형상계수 중 원형기초의 점착력 항에 곱해지는 형상계수 상수는 무엇입니까?"
5. **보기(options) 구성**: 4개의 보기 중 **정확히 1개만 정답**이어야 합니다. 오답 보기들은 그럴듯하고 헷갈리기 쉬운 공학적 조건이나 유사 수식 기호로 설계하십시오.
6. **가독성 높은 LaTeX 적용**: 질문(question) 및 보기(options)에 포함되는 수식과 기호는 반드시 LaTeX 기호($ 또는 $$)로 감싸십시오.

${LATEX_PROMPT_INSTRUCTIONS}

[JSON 반환 규격]:
[
  {
    "id": "ls_1",
    "question": "문제 질문 내용 (맞는 것을 고르도록 구성)",
    "options": ["보기 1", "보기 2", "보기 3", "보기 4"],
    "answer": "정답 보기의 텍스트와 토씨 하나 틀리지 않는 정답 텍스트",
    "explanation": "이 공식 및 개념에 대한 핵심 메커니즘 위주의 해설"
  },
  ... (총 5개 생성)
]
`;

  const responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'formula');
  let text = responseText.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((q, idx) => ({
        ...q,
        id: `ls_${idx + 1}`
      }));
    }
  } catch (err) {
    console.error('[lockscreenQuizPlugin] Failed to parse JSON from Gemini:', err);
    throw err;
  }
}
