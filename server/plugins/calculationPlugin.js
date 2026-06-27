import { LATEX_PROMPT_INSTRUCTIONS, healQuizQuestionObject } from '../utils/latexUtils.js';
import { ENGINEERING_STANDARDS } from './engineeringStandards.js';
import { GENERATION_STANDARDS } from './generationStandards.js';
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


