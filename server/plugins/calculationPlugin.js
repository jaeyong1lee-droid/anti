import { LATEX_PROMPT_INSTRUCTIONS, healQuizQuestionObject, validateAndHealQuestion } from '../utils/latexUtils.js';
import { ENGINEERING_STANDARDS } from './engineeringStandards.js';
import { GENERATION_STANDARDS } from './generationStandards.js';


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

[🚨 절대적 외부 지침 준수체계 (Strict External Standards Enforcement Clause) - 극도로 중요!]:
당신은 이 시스템 지시어 내부의 그 어떤 설명이나 규칙보다, 아래 제공되는 [문제생성 지침 기준 (Generation Standards)]에 명시된 지침들을 **최우선 순위(우선순위 #1)의 철칙**으로 삼아 100% 완벽하게 준수해야 합니다.
[문제생성 지침 기준 (Generation Standards)]에 적혀 있는 금지 조항이나 규칙은 하드코딩된 강력한 법률과 같으며, 이를 위반하여 생성된 문제는 즉시 불합격 처리됩니다. 한 치의 오차도 없이 무조건 따르십시오.`;

  const userPrompt = `
[대상 공식]:
- 공식명: ${formulaTitle}
- 수식: ${formula}
- 개념 및 설명: ${concept || ''}
- 기본 가정: ${assumptions || ''}

[문제생성 지침 기준 (Generation Standards)]:
${GENERATION_STANDARDS}

[출제 요구사항]:
1. **실제 공학적 수치 대입 계산 문제**: 공식에 포함된 변수들에 합리적이고 타당성 있는 토목/지반공학적 설계 조건 수치(예: 수평 저항력, 부착 강도, 압밀계수, 또는 토압 조건 등)를 제시하고, 최종 계산 결과를 묻는 정량 계산 문제를 출제하십시오.
2. **보기(options) 구성**: 4개의 보기를 제공하며, 그 중 정확히 1개만 정답이어야 합니다. 나머지 3개의 오답 보기는 단순 임의 날조 숫자가 아닌, 계산 과정에서 흔히 범할 수 있는 전형적인 오차/착오(예: 단위 변환 누락, 특정 분모/분자 위치 오류 등)를 반영한 그럴듯한 오답 수치(distractors)로 설계하십시오.
3. **가독성 높은 LaTeX 적용**: 문제 질문(question), 보기(options), 해설(explanation)에 포함되는 모든 물리량 기호와 수식은 반드시 LaTeX 기호($)로 감싸십시오.
4. **한글 출력**: 문제, 보기, 해설은 모두 한국어로 친절하게 작성하십시오.

${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}

[JSON 반환 규격]:
{
  "formulaTitle": "${formulaTitle}",
  "question": "문제 질문 내용 (구체적인 설계 조건 수치 포함)",
  "options": ["보기 1", "보기 2", "보기 3", "보기 4"],
  "correctIndex": 0,
  "explanation": "해설 내용 (공식 유도 및 각 조건 대입을 통한 구체적인 계산 전개 과정 포함)"
}
`;

  const responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'formula', { temperature: 0.85 });
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
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '[') {
        depth++;
      } else if (char === ']') {
        depth--;
        if (depth === 0) {
          const jsonSub = str.substring(startIdx, i + 1);
          try {
            return parseLlmJson(jsonSub);
          } catch (e) {
            console.warn('Failed parsing extracted JSON substring via bracket matching:', e.message);
            throw e;
          }
        }
      }
    }
  }

  // Fallback to original lastIndexOf method if bracket matching didn't close properly
  const endIdx = str.lastIndexOf(']');
  if (endIdx > startIdx) {
    const jsonSub = str.substring(startIdx, endIdx + 1);
    try {
      return parseLlmJson(jsonSub);
    } catch (e) {
      console.warn('Failed parsing extracted JSON substring via extractJsonArray fallback.');
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

/**
 * Generates all 4 questions for a calculation-category topic.
 * Returns an array of healed question objects: [tableQ, compQ, shortQ1, shortQ2]
 * This is the ONLY entry point for calculation topic quiz generation.
 *
 * @param {object} topic - topic object { title, keywords, category, pdf_url }
 * @param {string} fileText - HTML study note text
 * @param {string} coreSubject - cleaned topic subject title
 * @param {string} activeGenerationStandards - formatted generation standards string
 * @param {string} activeEngineeringStandards - formatted engineering standards string
 * @param {string} topicInstructionsPrompt - topic-specific instructions
 * @param {Function} callLLM - async (systemInstruction, prompt, imageB64, tag, opts) => string
 */
export async function generateCalcTopicQuiz(
  topic,
  fileText,
  coreSubject,
  activeGenerationStandards,
  activeEngineeringStandards,
  topicInstructionsPrompt,
  callLLM
) {
  // --- 1. Load image if pdf_url exists ---
  let calcImageBase64 = null;
  let calcImageMime = 'image/jpeg';
  if (topic.pdf_url) {
    try {
      const imgRes = await fetch(topic.pdf_url);
      if (imgRes.ok) {
        const ct = imgRes.headers.get('content-type');
        if (ct && ct.startsWith('image/')) calcImageMime = ct;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        calcImageBase64 = buf.toString('base64');
        console.log(`[CalcPlugin] Loaded ${buf.length} bytes image (${calcImageMime}) from ${topic.pdf_url}`);
      }
    } catch (e) {
      console.warn('[CalcPlugin] Could not fetch pdf_url image:', e.message);
    }
  } else if (topic.pdf_data) {
    let pdfDataStr = Buffer.isBuffer(topic.pdf_data) ? topic.pdf_data.toString('utf8') : topic.pdf_data;
    const imgMatch = pdfDataStr.match(/<img[^>]+src="data:(image\/[^;]+);base64,([^"]+)"/);
    if (imgMatch && imgMatch[2]) {
      calcImageMime = imgMatch[1];
      calcImageBase64 = imgMatch[2];
      console.log(`[CalcPlugin] Extracted image (${calcImageMime}) from pdf_data HTML (length: ${calcImageBase64.length})`);
    }
  }

  // --- 2. Build the generation prompt ---
  const systemInstruction = `당신은 대한민국 국가건설기준설계코드(KDS) 및 지반공학 기술사 시험 출제위원입니다.
JSON 배열 형식으로만 문제를 출력하십시오.`;

  const commonInfoPrompt = `
[토픽 핵심 주제]: ${coreSubject}
[토픽 원본 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}

<solution_reference>
[정답 추출용 HTML 해설 본문 (문제 지문 추출용 아님!)]:
${fileText || '제공되지 않음'}
</solution_reference>

[출제 기준 절대 지침]:
${activeGenerationStandards}

[공학 기준 절대 지침]:
${activeEngineeringStandards}

${topicInstructionsPrompt}

${LATEX_PROMPT_INSTRUCTIONS}
`;

  const generationPromptQ1 = `
[태스크]: AI는 공학적 분석이나 추론을 절대 하지 마십시오. 오직 첨부된 이미지에 적힌 문제 지문을 글자 그대로 읽고, 지문에서 "구하시오" 또는 "나타내시오"로 요구한 항목들만 각각의 입력폼 [INPUT_N]으로 기계적으로 분리하십시오. 당신은 텍스트 파서(Parser)이지 출제자가 아닙니다.

[절대 지침]:
1. "question" 필드: 이미지에 적힌 문제 지문 전체를 글자 하나 바꾸지 말고 그대로 복사하십시오.
2. 구하는 항목 명칭(rows[i][0]): 이미지 지문에서 "구하시오", "나타내시오", "구하라" 등으로 명시적으로 요구한 단어만 그대로 기재하십시오. 예를 들어 지문에 "점착력값과 내부마찰각값을 나타내시오"라고 적혀있으면, rows는 반드시 ["(1) 점착력(Si)", "[INPUT_1]"], ["(2) 내부마찰각(∅)", "[INPUT_2]"] 이어야 합니다.
3. 이미지 지문에 없는 용어(간극비, 포화도, 유효응력, 침투수량, 압밀계수, 동수경사 등)를 단 하나라도 지어내면 시스템이 붕괴됩니다.
4. 지문에서 2개를 묻고 있으면 rows도 정확히 2행, 3개를 묻고 있으면 정확히 3행이어야 합니다.
5. answers 객체에는 각 INPUT_N에 대한 풀이 과정과 수치를 기재하십시오.

<solution_reference>
[정답 및 해설 참조용 본문]:
${fileText || '제공되지 않음'}
</solution_reference>

[응답 JSON 포맷]:
[
  {
    "type": "주관식 (표채우기)",
    "question": "이미지의 문제 지문 전체를 그대로 복사",
    "tableData": {
      "headers": ["구하는 항목", "계산 결과 및 답안"],
      "rows": [
        ["(1) 지문에서 구하라고 한 첫번째 항목명 그대로", "[INPUT_1]"],
        ["(2) 지문에서 구하라고 한 두번째 항목명 그대로", "[INPUT_2]"]
      ]
    },
    "answers": {
      "INPUT_1": "정답 풀이 1",
      "INPUT_2": "정답 풀이 2"
    }
  }
]
`;

  const generationPromptQ234 = `
[문제 생성 태스크 시작]:
아래 제공되는 정보를 분석하여 정확히 3개의 예상문제(2, 3, 4번 문항)를 생성해 주십시오.
${commonInfoPrompt}

[출제 요구사항]:
2. 2번 문항 (이론/공법/기법 비교 표채우기 문제 - AI 동적 출제 철칙) - type: "주관식 (표채우기)"
   - [AI 동적 문제 생성 철칙]: 고정된 템플릿 텍스트를 금지하며, AI가 해당 토픽의 주 핵심 공법/이론(예: 유선망 수리해석 토픽인 경우 '유선망 도해법(Flow Net)')과 관련된 타 공법/이론(예: '수치해석법 (FEM/FDM)', 'Darcy 1차원 해석법' 등)을 원보고서/공학기준에 기초하여 직접 동적으로 대조 분석하는 질문과 표를 설계하십시오.
   - headers 예시: ["구분 항목", "주 핵심 공법/이론 (예: 유선망 도해법)", "비교 공법/이론 1 (예: 수치해석법 FEM/FDM)", "비교 공법/이론 2 (예: Darcy 1차원 해석법)"]
   - rows: 핵심 메커니즘, 적용성/한계성, 산출 물리량 등의 행(Row)을 설계하고, 절반 이상은 풍부한 전문 지식으로 미리 채운 후 총 2~3개의 핵심 빈칸만 [INPUT_1], [INPUT_2]로 설정하십시오.

3. 3번 문항 (공학적 의미/교훈 주관식 문제) - type: "주관식 (단답형)"
4. 4번 문항 (관련 공학적 문제 발생 시 대책 주관식 문제) - type: "주관식 (다답형)"

[응답 JSON 포맷]:
[
  {
    "type": "주관식 (표채우기)",
    "question": "비교 문제 질문",
    "tableData": { "headers": ["구분 항목", "공법/이론 A", "공법/이론 B"], "rows": [["항목", "[INPUT_1]", "내용"]] },
    "answers": { "INPUT_1": "정답" }
  },
  {
    "type": "주관식 (단답형)",
    "question": "주관식 질문 3",
    "answer": "정답 3"
  },
  {
    "type": "주관식 (단답형)",
    "question": "주관식 질문 4",
    "answer": "정답 4"
  }
]
`;

  // --- 3. Call LLM Concurrently ---
  const imagePayload = calcImageBase64 ? { data: calcImageBase64, mimeType: calcImageMime } : null;
  const p1 = callLLM(systemInstruction, generationPromptQ1, imagePayload, 'calc_question_q1', { temperature: 0.1 });
  const p2 = callLLM(systemInstruction, generationPromptQ234, imagePayload, 'calc_question_q234', { temperature: 1.0 });
  
  const [rawTextQ1, rawTextQ234] = await Promise.all([p1, p2]);

  const parseChunk = (rawText) => {
    let text = (rawText || '').trim().replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    let parsed = [];
    try {
      const p = parseLlmJson(text);
      if (Array.isArray(p)) parsed = parsed.concat(p);
      else if (p) parsed.push(p);
    } catch {
      try {
        const p = JSON.parse(text);
        if (Array.isArray(p)) parsed = parsed.concat(p);
        else if (p) parsed.push(p);
      } catch {
        console.error('[CalcPlugin] Failed to parse LLM response chunk');
      }
    }
    return parsed;
  };

  const parsedQ1 = parseChunk(rawTextQ1);
  const parsedQ234 = parseChunk(rawTextQ234);

  // --- 4. Heal and assemble 4 questions ---
  const tableQ = parsedQ1.find(q => q.type === '주관식 (표채우기)' || q.type === '주관식 (계산)') || parsedQ1[0];
  
  // Q234: Look for comparison table and short answers in the response from Q234 LLM
  const compQ  = parsedQ234.find(q => q.type === '주관식 (표채우기)' &&
    Array.isArray(q.tableData?.headers) && q.tableData.headers.length >= 3);
  const shorts = parsedQ234.filter(q => q.type === '주관식 (다답형)' || q.type === '주관식 (단답형)');

  // AI가 파싱한 결과를 그대로 사용 (하드코딩 fallback 없음)
  const final = [tableQ, compQ, shorts[0], shorts[1]].filter(Boolean);

  // 최소 1개라도 있으면 그대로 반환, 없으면 빈 배열
  return final.map(q => healQuizQuestionObject({ ...q, category: '계산' }));
}

