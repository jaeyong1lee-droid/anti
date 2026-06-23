import { LATEX_PROMPT_INSTRUCTIONS, healQuizQuestionObject } from '../utils/latexUtils.js';
import { validateAndHealQuestion } from './validationPlugin.js';

/**
 * Extracts readable text/formulas from calculation problem screenshots/images using Gemini multimodal OCR.
 * @param {string} base64Data Base64 representation of the image
 * @param {string} mimeType Mime-type of the image (e.g. 'image/png')
 * @param {Function} callLLMWithFailover Failover LLM call utility
 */
export async function extractTextFromCalculationImage(base64Data, mimeType, callLLMWithFailover) {
  const systemInstruction = "You are a professional Optical Character Recognition (OCR) agent. Your job is to extract all readable text, formulas, equations, diagrams, description, parameters, and symbols of the engineering calculation problem from this image exactly as it is, without missing anything. Do not summarize, do not solve, just extract the text and formulas. Output the extracted text directly.";
  const userPrompt = "Please extract the text and formulas from the provided image.";
  
  console.log(`[Plugin OCR Image Extraction] Running Gemini OCR`);
  const ocrText = await callLLMWithFailover(systemInstruction, userPrompt, { data: base64Data, mimeType }, 'ocr');
  console.log(`[Plugin OCR Image Extraction] Success! Length = ${ocrText ? ocrText.length : 0}`);
  return ocrText || '이미지에서 추출된 텍스트가 없습니다.';
}

/**
 * Suggests a concise study topic title from a calculation screenshot image or direct HTML code notes.
 * @param {string} image Base64 representation of the screenshot image (optional)
 * @param {string} mimeType Mime-type of the image (optional)
 * @param {string} htmlText Raw HTML study notes (optional)
 * @param {Function} callLLMWithFailover Failover LLM call utility
 */
export async function suggestTitleFromCalculation(image, mimeType, htmlText, callLLMWithFailover) {
  if (image) {
    const systemInstruction = "You are an expert civil and geotechnical engineering assistant that suggests extremely concise study topic titles for technical exam preparation based on calculation problems or formulas.";
    const userPrompt = "Analyze this engineering calculation problem image and suggest a concise, professional study topic title in Korean (under 25 characters, e.g. '테르자기 극한지지력 유도' or '수압파쇄시험 이론'). Output ONLY the title text itself without any prefix, quotation marks, or explanations.";
    
    console.log(`[Plugin Suggest Title Image] Running Gemini multimodal for image suggestion`);
    const suggested = await callLLMWithFailover(systemInstruction, userPrompt, { data: image, mimeType: mimeType || 'image/png' }, 'ocr');
    const cleanTitle = (suggested || '').trim().replace(/^["'`\s\[]+|["'`\s\]]+$/g, '');
    console.log(`[Plugin Suggest Title Image] Result: "${cleanTitle}"`);
    return cleanTitle;
  } else if (htmlText) {
    const systemInstruction = "You are an expert civil and geotechnical engineering assistant that suggests extremely concise study topic titles for technical exam preparation based on the provided notes.";
    const userPrompt = `Analyze the following study notes text/HTML and suggest a concise, professional study topic title in Korean (under 25 characters). Output ONLY the title text itself without any prefix, quotation marks, or explanations.\n\n[Content]:\n${htmlText}`;
    
    console.log(`[Plugin Suggest Title HTML] Running Gemini for HTML suggestion`);
    const suggested = await callLLMWithFailover(systemInstruction, userPrompt, null, 'ocr');
    const cleanTitle = (suggested || '').trim().replace(/^["'`\s\[]+|["'`\s\]]+$/g, '');
    console.log(`[Plugin Suggest Title HTML] Result: "${cleanTitle}"`);
    return cleanTitle;
  }
  throw new Error('Image or HTML text is required to suggest title');
}

/**
 * Generates an engineering multiple-choice calculation question utilizing the formula variables.
 * @param {string} formulaTitle Formula name
 * @param {string} formula Formula equation
 * @param {string} concept Description / Concept of formula
 * @param {string} assumptions Primary assumptions
 * @param {Function} callLLMWithFailover Failover LLM call utility
 * @param {string} topicTitle Active topic title
 * @param {string} topicKeywords Active topic keywords
 * @param {string} fileText Context document text
 */
export async function generateCalculationQuizQuestion(formulaTitle, formula, concept, assumptions, callLLMWithFailover, topicTitle = '', topicKeywords = '', fileText = '') {
  const systemInstruction = `당신은 대한민국 토목공학 및 지반공학 기술사 시험 출제위원입니다.
제시된 필수공식을 활용하여, 수험생의 정량적 계산 능력을 평가할 수 있는 고난도 4지선다형 객관식 계산 문제를 만드십시오.
반드시 아래 지정된 JSON 규격으로만 응답해야 하며, 다른 부가 설명이나 백슬래시 에러가 있어서는 안 됩니다.
[지반공학 용어 준수 철칙]: 'Flow Net'은 절대 '유망망'이라는 존재하지 않는 단어로 표기하지 말고, 반드시 표준 전공 용어인 '유선망'(流線網)으로 표기하십시오.`;

  const userPrompt = `
[대상 공식]:
- 공식명: ${formulaTitle}
- 수식: ${formula}
- 개념 및 설명: ${concept || ''}
- 기본 가정: ${assumptions || ''}

[출제 요구사항]:
1. **실제 공학적 수치 대입 계산 문제**: 공식에 포함된 변수들에 합리적이고 타당성 있는 토목/지반공학적 설계 조건 수치(예: 수평 저항력, 부착 강도, 압밀계수, 또는 토압 조건 등)를 제시하고, 최종 계산 결과를 묻는 정량 계산 문제를 출제하십시오.
2. **보기(options) 구성**: 4개의 보기를 제공하며, 그 중 정확히 1개만 정답이어야 합니다. 나머지 3개의 오답 보기는 단순 임의 날조 숫자가 아닌, 계산 과정에서 흔히 범할 수 있는 전형적인 오차/착오(예: 단위 변환 누락, 특정 분모/분자 위치 오류 등)를 반영한 그럴듯한 오답 수치(distractors)로 설계하십시오.
- **🚨 [객관식 정밀성 및 정답 일치 조건 - 극도로 중요!]**: 모든 객관식(4지선다형) 계산 문제나 수치/공학적 판단 문제를 출제할 때, 계산으로 도출된 정확한 정답 수치나 조건이 4개의 보기(options) 중 반드시 정확히 1개로 존재해야 합니다. 절대로 실제 계산 결과와 보기의 수치가 불일치하여, 해설에서 '실제 계산값은 XX이나 보기 중 가장 가까운 YY를 선택합니다'와 같은 어처구니없는 변명을 적는 출제 오류를 범하지 마십시오. 문제를 생성하기 전에 실제 수식을 대입하여 정답을 한 번 더 직접 엄밀하게 계산하고 검증한 후, 그 결과값(토씨 하나 틀리지 않는 정확한 정답)을 보기와 'answer' 필드에 완벽히 일치하도록 기재하십시오.
    3. **🚨 [공식 자체 노출 금지 규칙 - 극도로 중요!]**: 문제 질문(question) 본문 내에 공식을 직접 적어주거나 공식에 포함되는 기호들의 대수적 식 자체를 텍스트로 노출하지 마십시오. 학생이 변수값들만 보고 머릿속에서 공식 자체를 떠올려서 직접 수치 계산을 하도록 설계하십시오. (단, 해설(explanation)에서는 공식을 명시하고 자세한 계산 전개 과정을 기술하십시오.)
3. **가독성 높은 LaTeX 적용**: 문제 질문(question), 보기(options), 해설(explanation)에 포함되는 모든 물리량 기호와 수식은 반드시 LaTeX 기호($)로 감싸십시오.
4. **한글 출력**: 문제, 보기, 해설은 모두 한국어로 친절하게 작성하십시오.

${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}

[JSON 반환 규격]:
{
  "formulaTitle": "${formulaTitle}",
  "question": "문제 질문 내용 (구체적인 설계 조건 수치 포함)",
  "options": ["보기 1", "보기 2", "보기 3", "보기 4"],
  "answer": "정답 보기의 텍스트와 토씨 하나 틀리지 않는 정답 텍스트",
  "explanation": "해설 내용 (공식 유도 및 각 조건 대입을 통한 구체적인 계산 전개 과정 포함)"
}
`;

  const responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'formula');
  let text = responseText.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  }
  
  let parsed = null;
  try {
    parsed = parseLlmJson(text);
  } catch (parseErr) {
    parsed = extractJsonArray(responseText);
    if (Array.isArray(parsed) && parsed.length > 0) {
      parsed = parsed[0];
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Failed to parse LLM response to JSON object');
  }

  const healed = healQuizQuestionObject(parsed);
  const validated = await validateAndHealQuestion(healed, callLLMWithFailover, topicTitle, topicKeywords, fileText);
  return healQuizQuestionObject(validated);
}

/**
 * JSON Parsing and Backslash-escaping Helpers
 */
function parseLlmJson(text) {
  if (!text) return null;
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  }
  const escaped = escapeJsonBackslashes(cleaned);
  return JSON.parse(escaped);
}

function extractJsonArray(str) {
  if (!str) return null;
  const startIdx = str.indexOf('[');
  const endIdx = str.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonSub = str.substring(startIdx, endIdx + 1);
    try {
      return parseLlmJson(jsonSub);
    } catch (e) {
      console.warn('Failed parsing extracted JSON substring via extractJsonArray.');
      throw e;
    }
  }
  return null;
}

function escapeJsonBackslashes(str) {
  if (!str) return str;
  let result = '';
  let inString = false;
  let i = 0;
  
  const latexCommands = [
    'newline', 'nabla', 'nu', 'neq', 'neg', 'ni', 'notin', 'ngeq', 'nleq', 'nsim', 'ncong', 'nparallel', 'noindent',
    'theta', 'tau', 'tan', 'times', 'tilde', 'text', 'tfrac', 'triangle', 'top', 'to', 'tiny', 'today',
    'rho', 'right', 'rule', 'rangle', 'rightarrow', 'rightleftharpoons', 'rightharpoonup', 'rightharpoondown', 'real', 'ref', 'raise',
    'beta', 'bar', 'begin', 'bmod', 'boldsymbol', 'bullet', 'box', 'bigcap', 'bigcup', 'backslash',
    'frac', 'forall', 'flat', 'frown', 'footnotesize', 'fbox',
    'phi', 'varphi', 'mathrm'
  ];

  while (i < str.length) {
    const char = str[i];
    if (char === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      i++;
    } else if (inString && char === '\\') {
      const next = str[i + 1];
      
      if (next === '"' || next === '/' || next === '\\') {
        result += char + next;
        i += 2;
      } else if (next === 'n' || next === 't' || next === 'r' || next === 'b' || next === 'f') {
        let tempIndex = i + 1;
        let commandWord = '';
        while (tempIndex < str.length && /[a-zA-Z]/.test(str[tempIndex])) {
          commandWord += str[tempIndex];
          tempIndex++;
        }
        
        const isLatex = latexCommands.some(cmd => commandWord.startsWith(cmd));
        if (isLatex) {
          result += '\\\\';
          i++;
        } else {
          result += char + next;
          i += 2;
        }
      } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(str.substring(i + 2, i + 6))) {
        result += char + next + str.substring(i + 2, i + 6);
        i += 6;
      } else {
        result += '\\\\';
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  return result;
}

export let standardsList = [
  {
    "id": "stress",
    "title": "MIT 응력 표현 기준",
    "content": "\n[🔬 응력 표현 기준 — MIT(Lambe) 방식 엄격 준수 및 명칭 표기 금지]:\n- 모든 문제 출제, 해설, 채점, 튜터 답변 시 응력 경로 및 축차응력(편차응력)의 정의는 반드시 **MIT(Lambe) 방식**을 기준으로 작성하십시오.\n- **🚨 [중요 규칙 — 명칭 노출 절대 금지]**: 문제 지문(question), 객관식 보기(options), 모범 답안(answer), 개요(concept) 등 **사용자에게 직접 노출되는 지문과 답안 텍스트 본문 어디에서도 \"MIT 방식\", \"MIT(Lambe) 방식\", \"Lambe 방식\" 등의 명칭을 직접 언급하거나 명시하지 마십시오.** 이 방식은 지반역학의 기본 규칙인 것처럼 암묵적으로 당연하게 계산 및 개념 적용이 이루어져야 합니다. (단, 문제의 해설(explanation)에서는 학술적 이해를 위해 언급할 수 있습니다.)\n- MIT 기준 정의:\n  * 평균 응력: $p = \\\\frac{\\\\sigma_1 + \\\\sigma_3}{2}$ (또는 유효응력: $p' = \\\\frac{\\\\sigma'_1 + \\\\sigma'_3}{2}$)\n  * 축차응력(편차응력): $q = \\\\frac{\\\\sigma_1 - \\\\sigma_3}{2}$\n  * $K_0$ 압밀 응력경로의 기울기: $\\\\alpha = \\\\arctan\\\\left(\\\\frac{1 - K_0}{1 + K_0}\\\\right)$\n  * 파괴포락선 기울기: $\\\\sin\\\\phi' = \\\\tan\\\\alpha_f$ (Mohr-Coulomb 포락선과의 관계)\n- **Cambridge(Critical State) 방식**($p' = \\\\frac{\\\\sigma'_1 + 2\\\\sigma'_3}{3}$, $q = \\\\sigma_1 - \\\\sigma_3$)은 사용하지 마십시오.\n- 응력 경로도(stress path diagram)를 설명하거나 관련 문제를 출제할 때, $p$-$q$ 좌표축의 정의가 MIT 방식에 부합하는지 반드시 확인하십시오.\n"
  },
  {
    "id": "subgrade",
    "title": "지반반력계수 및 흙막이 해석",
    "content": "\n[📐 지반반력계수($k_h$) 산정 및 가설 흙막이 해석 비교 기준]:\n- Terzaghi 경험식과 Chang 공식의 비교표 또는 문답 채점 시 아래의 명확한 공학적 기준을 엄격히 준수하십시오.\n- **1. 지반반력계수 산정 시 벽체 환산폭($B$) 영향 반영 여부**:\n  * **Terzaghi 경험식**: 반영함 (평판재하시험 $k_{v0}$를 실제 기초폭 $B$로 보정하는 식(예: $0.3/B$ 계열)이 엄밀히 존재함). 단, 실무 일부 약산식에서는 보정 없이 상수를 사용하기도 하므로, 사용자가 '미반영', '보정 없음', '반영' 중 어느 것을 답하더라도 의미상 타당하면 만점으로 인정하십시오.\n  * **Chang 공식**: 반영함 (환산폭 지수법 보정식을 통해 $k_h = k_{h0} \\cdot (B/0.3)^{-3/4}$ 와 같이 명시적으로 반영함).\n- **2. 지중 근입부 벽체 거동 특성 반영 및 보정 방식 (핵심 차이점)**:\n  * 이 항목은 **벽체 자체의 휨강성($EI$)과 지반의 상대적 강성 관계**를 해석 모델에 반영하는지 여부를 묻는 항목입니다.\n  * **Terzaghi 경험식**: **보정 없음 / 벽체 강성 미고려**. 테르자기 모델은 벽체의 변형 강성($EI$)을 전혀 고려하지 못하고 정적 스프링으로 다룹니다. 따라서 사용자가 **'보정 없음'**, **'벽체 강성 미고려'**, **'강성 고려 안 함'** 등을 답하면 **반드시 만점(10점)**을 부여해야 합니다. (기초폭 $B$에 따른 크기효과 수식을 언급하며 '보정 있음'으로 오도하는 것은 감점 대상입니다.)\n  * **Chang 공식**: **상대강성(휨강성 $EI$ 및 특성치 $\\beta$) 반영**. Chang 해석의 본질은 탄성 지반 위의 보 이론을 바탕으로, 벽체의 휨강성($EI$)과 지반 강성의 비를 나타내는 특성치 $\\beta = \\\\sqrt[4]{\\\\frac{k_h B}{4EI}}$를 통해 벽체의 탄성 휨 변형 거동을 보정하는 것입니다. 따라서 사용자가 단순히 **'폭 감안 보정'** 또는 **'폭 보정'**으로만 답한 경우, 이는 벽체 휨강성($EI$)과 특성치 $\\beta$라는 거동 특성의 본질을 누락한 것이므로 **반드시 7점 이하로 감점 처리(부분 점수만 부여)** 하십시오.\n- **3. 가설 흙막이 벽체 수평 환산폭($B$) 변화에 따른 가상 변형 특성 길이($1/\\beta$)의 변화 산정**:\n  * **질문 의도**: 수평 환산폭 $B$가 4배로 증가할 때 가상 변형 특성 길이 $1/\\beta$의 변화비율을 평가합니다.\n  * **공학적 기준 및 모순 방지 철칙**:\n    1) **보/말뚝(폭 B) 기준 모델링 시 (유일한 논리적 정답)**: 구조물의 실제 폭 $B$를 대입하는 수평 특성 길이 식은 $1/\\beta = sqrt[4]{\\frac{4EI}{k_h B}}$ 입니다. 사질토 지반에서 Terzaghi 경험식에 의하면 수평지반반력계수 $k_h$는 폭 $B$에 반비례하므로 ($k_h propto 1/B$ 즉, $k_h = C/B$), 분모의 곱 $k_h B = C$ (상수)가 됩니다. 따라서 $1/\\beta$는 폭 $B$가 증가해도 변화가 없으므로 **\'변동 없음(변화 없음)\'이 수학적으로 완전히 정확한 유일한 정답**입니다.\n    2) **벽체 단위폭(1m) 기준 및 도로교설계기준(Chang 공식) 적용 시 (1.414배는 오답)**:\n       - 만약 벽체를 단위폭 1m 보로 모델링하여 분모에서 $B$가 제외된 식 $1/\\beta = sqrt[4]{\\frac{4EI}{k_h}}$를 쓰더라도, **도로교설계기준(KDS) 및 Chang 공식**에서 사질토 지반의 수평지반반력계수는 $k_h = k_{h0} (B_H / 0.3)^{-3/4}$로 보정(지수 $-3/4$)합니다.\n       - 이에 따라 $1/\\beta propto k_h^{-1/4} propto (B_H^{-3/4})^{-1/4} = B_H^{3/16}$ 이 되며, 환산폭 $B$가 4배 증가하면 $1/\\beta$는 $4^{3/16} approx 1.297$배 증가하게 됩니다.\n       - 따라서 Terzaghi의 반비례 관계(지수 $-1$)와 단위폭 식을 무리하게 혼용하여 유도한 **\'1.414배 증가(루트 2배 증가)\'는 실제 공학 설계 기준(KDS/Chang)과도 맞지 않고 일관성도 없는 명백한 오답**입니다.\n  * **🚨 [극도로 중요 - 채점 및 설명 일치 철칙]**: 이 문제를 출제하거나 채점/설명할 때, 반드시 **\'변동 없음(변화 없음)\'만을 유일한 정답으로 설정**하십시오. 1.414배 증가(또는 루트 2배 증가)는 출제 오류이므로 오답 처리해야 합니다. 해설(explanation)에서는 보/말뚝 공식에서 $k_h propto 1/B$ 관계에 의해 분모 $k_h B$가 일정하게 유지되므로 특성 길이 $1/\\beta$가 변하지 않는다는 점을 수식으로 완벽히 서술하십시오. (절대로 $k_h B$가 일정함에도 1.414배 증가한다고 결론짓는 모순적 서술을 하지 마십시오.)\n"
  },
  {
    "id": "graphs",
    "title": "그래프 및 표 제시 기준",
    "content": "\n[📊 복습문제 출제 시 그래프/그림 및 데이터 표 묘사 철칙 — 극도로 중요]:\n1. **텍스트 묘사가 불가능한 복잡한 그래프/그림/도면**:\n   - 토픽 본문(또는 첨부된 이미지) 내의 특정 그래프나 그림, 구조 도면 등을 분석하고 읽어야만 문제를 풀 수 있고, 이를 컴퓨터 텍스트나 아스키 아트로 정밀하게 묘사하는 것이 사실상 불가능한 고난도 계산/공학적 판단 문제의 경우:\n   - 억지로 텍스트나 이상한 아스키 문자로 그림을 그리려 하지 마십시오.\n   - 대신, 문제 질문(question) 본문에 반드시 **\"첨부된 [그래프/그림](또는 왼쪽 화면의 원보고서 이미지)을 참고하여...\"** 또는 **\"원본 [도면/그래프]에서 제시된...\"** 이라는 지시 문구를 구체적으로 삽입하십시오. \n   - 이렇게 하면 시스템이 사용자가 등록한 스크린샷 이미지나 원보고서를 문제와 함께 시각적으로 매칭하여 화면에 보여줍니다.\n2. **텍스트/표로 묘사가 가능한 정량 데이터 및 표**:\n   - 만약 그래프나 실험 데이터의 내용이 특정 수치들의 집합, 비교 데이터, 심도별 물리량 등 텍스트나 표로 충분히 정량화하여 묘사할 수 있는 수준인 경우:\n   - 사용자가 원본 그림을 직접 찾아서 대조해야 하는 번거로움을 줄일 수 있도록, 반드시 질문(question) 본문 안에 **마크다운 표(Markdown Table)** 형식(예: | 심도(m) | 수압(MPa) | ... | )으로 구조화하여 완벽하게 기재하십시오. \n   - 마크다운 표를 작성할 때는 행 사이에 명확한 줄바꿈(\\\\n)을 기입하여 표 구조가 일그러지지 않도록 정밀하게 설계하십시오.\n"
  },
  {
    "id": "feasibility",
    "title": "상황적/시간적 적합성 구분 기준",
    "content": "\n[🚨 공학적 대책의 상황적/시간적 적합성 판정 수칙 — 극도로 중요]:\n1. **시간적·물리적 제약 조건 검증**:\n   - 질문에서 **\'즉각적으로 시행 가능한 대책\'**, **\'응급 대책\'**, **\'현장 조치 사항\'** 등을 요구하는 경우, 대규모 장비 반입, 설계 변경, 혹은 장시간의 경화/양생이 필요하여 물리적·시간적으로 즉시 실행이 불가능한 장기적/근본적 대책(예: 구조물 근입 깊이 연장, 흙막이 단면 변경, 대규모 영구 차수벽 시공 등)을 모범 답안으로 요구하거나, 이를 쓰지 않았다고 감점하지 마십시오.\n   - 반대로, 질문에서 **\'근본적인 대책\'**, **\'장기 안정성 확보 대책\'**, **\'설계 단계 대책\'** 등을 요구하는 경우, 임시적이고 일시적인 효과만 있는 단순 응급 대책만을 기술한 답변은 감점 요인이 됩니다.\n2. **거시적 맥락 판정**:\n   - 세부 공법의 명칭을 하나하나 특정하여 채점 기준으로 삼기보다, 사용자가 제시한 해결책이 질문이 규정한 시간적/상황적 맥락(즉각적 대처 가능 여부 vs 영구적 안정성 확보 여부 등)에 부합하는 거시적 범주에 속해 있는지 여부를 핵심 기준으로 삼아 채점하고 피드백을 작성하십시오.\n"
  },
  {
    "id": "seepage",
    "title": "수리학적 침투 및 파이핑/보일링 대책 기준",
    "content": "\n[🌊 수리학적 침투 및 파이핑/보일링 대책 채점 기준]:\n- 댐이나 제방의 파이핑(Piping) 및 보일링(Boiling) 대책에 대한 채점 시 아래의 수리학적 물리 법칙을 정확하게 고수하여 평가하십시오:\n  1. **수두차($\\\\Delta h$) 감소 = 침투압 감소**: 상하류 간의 수두차($\\\\Delta h = h_1 - h_2$)가 줄어들면 동수경사($i = \\\\Delta h / L$)와 침투압 및 침투수력(seepage force)이 감소하여 지반이 안정화됩니다.\n  2. **하류 수위 상승(수두 $h_2$ 상승) 또는 링 다이크(Ring Dike)**: 하류 측 용출구 주변 수위를 상승시키거나 물을 가두는 조치(예: 물고임 링 다이크 축조)는 상하류 수두차를 줄여 파이핑을 제어하는 역학적으로 매우 타당한 응급 대책입니다. 이를 \"침투압을 증가시켜 파이핑을 가속화한다\"고 평가하는 오류를 절대 범하지 마십시오.\n  3. **상류 수위 저하 또는 댐 문 개방(방류)**: 상류 저수지 수위($h_1$)를 낮추는 조치는 상하류 수두차를 줄여 파이핑을 제어하는 적합한 대책입니다.\n"
  }
];

export let ENGINEERING_STANDARDS = standardsList.map(s => s.content).join('\n\n');

export function updateLiveEngineeringStandards(newList) {
  if (Array.isArray(newList)) {
    standardsList = newList;
    ENGINEERING_STANDARDS = newList.map(s => s.content).join('\n\n');
  }
}

// Backwards compatibility exports
export const STRESS_CONVENTION = "";
export const SUBGRADE_REACTION_CONVENTION = "";
export const GRAPH_AND_TABLE_CONVENTION = "";
export const SITUATIONAL_FEASIBILITY_CONVENTION = "";
export const SEEPAGE_PRESSURE_CONVENTION = "";
export const USER_CONVENTIONS = "";
