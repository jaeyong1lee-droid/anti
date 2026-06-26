import { LATEX_PROMPT_INSTRUCTIONS } from '../utils/latexUtils.js';

/**
 * Generates 5 formula/criteria-based multiple-choice questions for the daily lockscreen quiz.
 * @param {Array} formulaCandidates List of formula candidates
 * @param {Array} topicCandidates List of topic candidates with extracted text contents
 * @param {Function} callLLMWithFailover LLM call utility
 * @returns {Promise<Array>} List of generated multiple-choice questions
 */
export async function generateDailyLockscreenQuestions(formulaCandidates, topicCandidates, callLLMWithFailover) {
  if ((!Array.isArray(formulaCandidates) || formulaCandidates.length === 0) && (!Array.isArray(topicCandidates) || topicCandidates.length === 0)) {
    throw new Error('No candidate data available to generate quiz');
  }

  let candidateText = '';
  if (Array.isArray(formulaCandidates) && formulaCandidates.length > 0) {
    candidateText += '=== [1. 공식 후보군 (Formula Candidates)] ===\n';
    candidateText += formulaCandidates.map((f, i) => {
      return `[Formula Candidate #${i + 1}]:
- 공식명 (Title): ${f.title}
- 수식 (Formula): ${f.formula}
- 개념 (Concept): ${f.concept || ''}
- 기호정의 (Structure): ${f.structure || ''}`;
    }).join('\n\n') + '\n\n';
  }

  if (Array.isArray(topicCandidates) && topicCandidates.length > 0) {
    candidateText += '=== [2. 토픽/수치 기준 후보군 (Topic Candidates with Criteria/Quantitative Values)] ===\n';
    candidateText += topicCandidates.map((t, i) => {
      return `[Topic Candidate #${i + 1}]:
- 토픽명 (Title): ${t.title}
- 키워드 (Keywords): ${t.keywords}
- 본문 텍스트 요약 (Text Content):
${t.textContent}`;
    }).join('\n\n') + '\n\n';
  }

  const systemInstruction = `당신은 대한민국 토목공학, 지반공학, 구조공학 등 기술사 시험 출제위원입니다.
제시된 공식 후보군 및 토픽 본문 텍스트 데이터를 기반으로, 수험생이 화면 잠금을 해제할 때 풀 수 있는 하루치 객관식(3지선다형) 퀴즈 5문제를 출제하십시오.
질문의 유형, 보기의 형태, 수치 질문 대상을 매번 다양하게 변형하여 출제해 주십시오.
반드시 아래 지정된 JSON 배열 포맷으로만 응답해야 하며, 다른 부가 설명이나 백슬래시 에러가 있어서는 안 됩니다.`;

  const userPrompt = `
[대상 후보군]:
${candidateText}

[출제 요구사항]:
1. **문제 개수**: 반드시 정확히 **5개의 객관식 문제**를 출제해 배열 형태로 반환하십시오.
2. **출제 구성 및 비율**:
   - 제공된 **공식 후보군**에 관한 문제와 **토픽 기준수치/정량적 수치 후보군**에 관한 문제를 적절히 혼합하여 총 5문제를 출제하십시오.
3. **🚨 [정답 유형 제한 - 극도로 중요!]**:
   - 질문은 무조건 **"맞는 것(올바른 것)"** 또는 **"올바른 기준수치/값"**을 고르도록 요구해야 합니다.
   - **절대로 "틀린 것", "올바르지 않은 것", "잘못된 것"을 고르는 문제는 출제하지 마십시오.** (예: "다음 중 ~에 대해 틀린 설명은?" 같은 질문 금지)
4. **질문 구성 방식 (아래 유형들을 골고루 안배하여 매우 다양하고 폭넓게 출제)**:
   - **[공식 관련 유형]**:
     * **[공식 명칭 매칭]**: 수식(LaTeX)을 질문 본문에 먼저 제시하고, 이 공식이 누구의 공식(공식명)인지 맞추는 문제.
     * **[개념/공식 식 매칭]**: 특정 공학적 개념이나 명칭(예: 피압대수층 투수계수)을 질문 본문으로 제시하고, 보기에 3개의 다른 LaTeX 공식을 두어 올바른 수식 형태를 고르게 하는 문제.
     * **[상수 및 비례 관계]**: 공식 구성 요소 중 특정 상수값의 의미, 배수 조건에 따른 변화, 또는 변수 간의 비례/반비례 관계를 정확히 이해하고 있는지 묻는 문제.
   - **[정량적 기준수치 관련 유형]**:
     * 제공된 토픽 본문 텍스트 내에 기재된 **설계 기준값, 정량적 수치, 허용 기준 범위, 법적/공학적 상하한 값, 또는 실험적 상수를 묻는 문제**를 출제하십시오.
     * 예시) "도로교설계기준에서 보도교의 설계활하중 기본 설계 수치는 얼마인가?" 또는 "콘크리트 표준시방서상 한중 콘크리트 적용 대상이 되는 일평균 기온 기준은 몇 ℃ 이하인가?" 또는 "모래치환법에서 최대 입경이 ~mm일 때 시험구멍의 최소 소요 체적은 얼마인가?" 등 정량적인 수치를 직접 맞추는 질문.
5. **보기(options) 구성**: 3개의 보기 중 **정확히 1개만 정답**이어야 합니다. 오답 보기들은 그럴듯하고 헷갈리기 쉬운 공학적 조건이나 유사 수식 기호, 인접한 수치값들로 설계하십시오.
6. **가독성 높은 LaTeX 적용**: 질문(question) 및 보기(options)에 포함되는 수식, 기호, 물리 단위는 반드시 LaTeX 기호($ 또는 $$)로 감싸십시오.

${LATEX_PROMPT_INSTRUCTIONS}

[JSON 반환 규격]:
[
  {
    "id": "ls_1",
    "question": "문제 질문 내용 (맞는 것을 고르거나 특정 정량적 수치를 묻도록 구성)",
    "options": ["보기 1", "보기 2", "보기 3"],
    "answer": "정답 보기의 텍스트와 토씨 하나 틀리지 않는 정답 텍스트",
    "explanation": "이 공식, 개념 또는 기준 수치에 대한 핵심 메커니즘 및 근거 위주의 해설"
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
      return parsed.map((q, idx) => {
        let options = Array.isArray(q.options) ? [...q.options] : [];
        
        // Shuffle the options to ensure the correct answer is randomly positioned
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [options[i], options[j]] = [options[j], options[i]];
        }

        return {
          ...q,
          options,
          id: `ls_${idx + 1}`
        };
      });
    }
  } catch (err) {
    console.error('[lockscreenQuizPlugin] Failed to parse JSON from Gemini:', err);
    throw err;
  }
}
