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
  return ocrText || '?대?吏?먯꽌 異붿텧???띿뒪?멸? ?놁뒿?덈떎.';
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
    const userPrompt = "Analyze this engineering calculation problem image and suggest a concise, professional study topic title in Korean (under 25 characters, e.g. '?뚮Ⅴ?먭린 洹뱁븳吏吏???좊룄' or '?섏븬?뚯뇙?쒗뿕 ?대줎'). Output ONLY the title text itself without any prefix, quotation marks, or explanations.";
    
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
  const systemInstruction = `?뱀떊? ??쒕?援??좊ぉ怨듯븰 諛?吏諛섍났??湲곗닠???쒗뿕 異쒖젣?꾩썝?낅땲??
?쒖떆???꾩닔怨듭떇???쒖슜?섏뿬, ?섑뿕?앹쓽 ?뺣웾??怨꾩궛 ?λ젰???됯??????덈뒗 怨좊궃??4吏?좊떎??媛앷???怨꾩궛 臾몄젣瑜?留뚮뱶??떆??
諛섎뱶???꾨옒 吏?뺣맂 JSON 洹쒓꺽?쇰줈留??묐떟?댁빞 ?섎ŉ, ?ㅻⅨ 遺媛 ?ㅻ챸?대굹 諛깆뒳?섏떆 ?먮윭媛 ?덉뼱?쒕뒗 ???⑸땲??

[?슚 ?덈????몃? 吏移?以?섏껜怨?(Strict External Standards Enforcement Clause) - 洹밸룄濡?以묒슂!]:
?뱀떊? ???쒖뒪??吏?쒖뼱 ?대???洹??대뼡 ?ㅻ챸?대굹 洹쒖튃蹂대떎, ?꾨옒 ?쒓났?섎뒗 [臾몄젣?앹꽦 吏移?湲곗? (Generation Standards)]??紐낆떆??吏移⑤뱾??**理쒖슦???쒖쐞(?곗꽑?쒖쐞 #1)??泥좎튃**?쇰줈 ?쇱븘 100% ?꾨꼍?섍쾶 以?섑빐???⑸땲??
[臾몄젣?앹꽦 吏移?湲곗? (Generation Standards)]???곹? ?덈뒗 湲덉? 議고빆?대굹 洹쒖튃? ?섎뱶肄붾뵫??媛뺣젰??踰뺣쪧怨?媛숈쑝硫? ?대? ?꾨컲?섏뿬 ?앹꽦??臾몄젣??利됱떆 遺덊빀寃?泥섎━?⑸땲?? ??移섏쓽 ?ㅼ감???놁씠 臾댁“嫄??곕Ⅴ??떆??`;

  const userPrompt = `
[???怨듭떇]:
- 怨듭떇紐? ${formulaTitle}
- ?섏떇: ${formula}
- 媛쒕뀗 諛??ㅻ챸: ${concept || ''}
- 湲곕낯 媛?? ${assumptions || ''}

[臾몄젣?앹꽦 吏移?湲곗? (Generation Standards)]:
${GENERATION_STANDARDS}

[異쒖젣 ?붽뎄?ы빆]:
1. **?ㅼ젣 怨듯븰???섏튂 ???怨꾩궛 臾몄젣**: 怨듭떇???ы븿??蹂?섎뱾???⑸━?곸씠怨???뱀꽦 ?덈뒗 ?좊ぉ/吏諛섍났?숈쟻 ?ㅺ퀎 議곌굔 ?섏튂(?? ?섑룊 ???젰, 遺李?媛뺣룄, ?뺣?怨꾩닔, ?먮뒗 ?좎븬 議곌굔 ??瑜??쒖떆?섍퀬, 理쒖쥌 怨꾩궛 寃곌낵瑜?臾삳뒗 ?뺣웾 怨꾩궛 臾몄젣瑜?異쒖젣?섏떗?쒖삤.
2. **蹂닿린(options) 援ъ꽦**: 4媛쒖쓽 蹂닿린瑜??쒓났?섎ŉ, 洹?以??뺥솗??1媛쒕쭔 ?뺣떟?댁뼱???⑸땲?? ?섎㉧吏 3媛쒖쓽 ?ㅻ떟 蹂닿린???⑥닚 ?꾩쓽 ?좎“ ?レ옄媛 ?꾨땶, 怨꾩궛 怨쇱젙?먯꽌 ?뷀엳 踰뷀븷 ???덈뒗 ?꾪삎?곸씤 ?ㅼ감/李⑹삤(?? ?⑥쐞 蹂???꾨씫, ?뱀젙 遺꾨え/遺꾩옄 ?꾩튂 ?ㅻ쪟 ??瑜?諛섏쁺??洹몃윺??븳 ?ㅻ떟 ?섏튂(distractors)濡??ㅺ퀎?섏떗?쒖삤.
3. **媛?낆꽦 ?믪? LaTeX ?곸슜**: 臾몄젣 吏덈Ц(question), 蹂닿린(options), ?댁꽕(explanation)???ы븿?섎뒗 紐⑤뱺 臾쇰━??湲고샇? ?섏떇? 諛섎뱶??LaTeX 湲고샇($)濡?媛먯떥??떆??
4. **?쒓? 異쒕젰**: 臾몄젣, 蹂닿린, ?댁꽕? 紐⑤몢 ?쒓뎅?대줈 移쒖젅?섍쾶 ?묒꽦?섏떗?쒖삤.

${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}

[JSON 諛섑솚 洹쒓꺽]:
{
  "formulaTitle": "${formulaTitle}",
  "question": "臾몄젣 吏덈Ц ?댁슜 (援ъ껜?곸씤 ?ㅺ퀎 議곌굔 ?섏튂 ?ы븿)",
  "options": ["蹂닿린 1", "蹂닿린 2", "蹂닿린 3", "蹂닿린 4"],
  "correctIndex": 0,
  "explanation": "?댁꽕 ?댁슜 (怨듭떇 ?좊룄 諛?媛?議곌굔 ??낆쓣 ?듯븳 援ъ껜?곸씤 怨꾩궛 ?꾧컻 怨쇱젙 ?ы븿)"
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
  const systemInstruction = `?뱀떊? ??쒕?援?援??嫄댁꽕湲곗??ㅺ퀎肄붾뱶(KDS) 諛?吏諛섍났??湲곗닠???쒗뿕 異쒖젣?꾩썝?낅땲??
JSON 諛곗뿴 ?뺤떇?쇰줈留?臾몄젣瑜?異쒕젰?섏떗?쒖삤.`;

  const commonInfoPrompt = `
[?좏뵿 ?듭떖 二쇱젣]: ${coreSubject}
[?좏뵿 ?먮낯 ?쒕ぉ]: ${topic.title}
[?듭떖 ?ㅼ썙??: ${topic.keywords || '?쒓났?섏? ?딆쓬'}

<solution_reference>
[?뺣떟 異붿텧??HTML ?댁꽕 蹂몃Ц (臾몄젣 吏臾?異붿텧???꾨떂!)]:
${fileText || '?쒓났?섏? ?딆쓬'}
</solution_reference>

[異쒖젣 湲곗? ?덈? 吏移?:
${activeGenerationStandards}

[怨듯븰 湲곗? ?덈? 吏移?:
${activeEngineeringStandards}

${topicInstructionsPrompt}

${LATEX_PROMPT_INSTRUCTIONS}
`;

  const generationPromptQ1 = `
[태스크]: AI는 어떠한 공학적 분석이나 추론을 하지 마십시오. 오직 첨부된 이미지에 적힌 문제 지문을 글자 그대로(기계적으로) 읽고, 질문에서 구하라고 명시한 요구사항들을 각각의 입력폼 [INPUT_N]으로 분리하는 "파서(Parser)" 역할만 수행하십시오.

[절대 지침 - 원문 1:1 기계적 복사]:
0. [경고] 당신은 문제를 창작하거나 공학적 지식을 동원해 기본 용어(간극비, 포화도, 유효응력, 침투수량 등)를 지어내면 절대 안 됩니다. 오직 이미지 원문에 적힌 단어만 추출하십시오.
1. "question" 필드에는 이미지에 적힌 문제 지문 전체를 글자 하나 바꾸지 말고 그대로 복사해서 넣으십시오.
2. 구하는 항목 명칭(tableData.rows[i][0])에는 오직 이미지 지문에서 "구하시오", "나타내시오" 라고 명시적으로 적힌 단어(예: 점착력, 내부마찰각 등)만 있는 그대로 기재하십시오.
3. 지문에서 여러 개를 구하라고 한 경우(예: 점착력값과 내부마찰각값을 나타내시오), 반드시 각각을 독립된 행으로 분리하여 입력칸([INPUT_N])을 배정하십시오.
4. 이미지에 없는 내용을 단 하나라도 추가하면 시스템이 붕괴됩니다. 
5. answers 객체에는 각 INPUT_N에 대한 풀이 과정을 넣되, 모르면 "풀이 과정"이라고만 적으십시오.

<solution_reference>
[정답 및 해설 참조용 본문]:
${fileText || '제공되지 않음'}
</solution_reference>

[응답 JSON 포맷]:
[
  {
    "type": "주관식 (표채우기)",
    "question": "첨부된 이미지의 실제 문제 지문 전체 텍스트 그대로 복사",
    "tableData": {
      "headers": ["구하는 항목", "계산 결과 및 답안"],
      "rows": [
        ["(1) 실제 지문에서 요구한 첫번째 항목 명칭", "[INPUT_1]"],
        ["(2) 실제 지문에서 요구한 두번째 항목 명칭", "[INPUT_2]"],
        ["(3) 실제 지문에서 요구한 세번째 항목 명칭", "[INPUT_3]"]
      ]
    },
    "answers": {
      "INPUT_1": "정답 및 풀이 1",
      "INPUT_2": "정답 및 풀이 2",
      "INPUT_3": "정답 및 풀이 3"
    }
  }
]
`;

  const generationPromptQ234 = `
[臾몄젣 ?앹꽦 ?쒖뒪???쒖옉]:
?꾨옒 ?쒓났?섎뒗 ?뺣낫瑜?遺꾩꽍?섏뿬 ?뺥솗??3媛쒖쓽 ?덉긽臾몄젣(2, 3, 4踰?臾명빆)瑜??앹꽦??二쇱떗?쒖삤.
${commonInfoPrompt}

[異쒖젣 ?붽뎄?ы빆]:
2. 2踰?臾명빆 (?대줎/怨듬쾿/湲곕쾿 鍮꾧탳 ?쒖콈?곌린 臾몄젣 - AI ?숈쟻 異쒖젣 泥좎튃) - type: "二쇨???(?쒖콈?곌린)"
   - [AI ?숈쟻 臾몄젣 ?앹꽦 泥좎튃]: 怨좎젙???쒗뵆由??띿뒪?몃? 湲덉??섎ŉ, AI媛 ?대떦 ?좏뵿??二??듭떖 怨듬쾿/?대줎(?? ?좎꽑留??섎━?댁꽍 ?좏뵿??寃쎌슦 '?좎꽑留??꾪빐踰?Flow Net)')怨?愿?⑤맂 ? 怨듬쾿/?대줎(?? '?섏튂?댁꽍踰?(FEM/FDM)', 'Darcy 1李⑥썝 ?댁꽍踰? ?????먮낫怨좎꽌/怨듯븰湲곗???湲곗큹?섏뿬 吏곸젒 ?숈쟻?쇰줈 ?議?遺꾩꽍?섎뒗 吏덈Ц怨??쒕? ?ㅺ퀎?섏떗?쒖삤.
   - headers ?덉떆: ["援щ텇 ??ぉ", "二??듭떖 怨듬쾿/?대줎 (?? ?좎꽑留??꾪빐踰?", "鍮꾧탳 怨듬쾿/?대줎 1 (?? ?섏튂?댁꽍踰?FEM/FDM)", "鍮꾧탳 怨듬쾿/?대줎 2 (?? Darcy 1李⑥썝 ?댁꽍踰?"]
   - rows: ?듭떖 硫붿빱?덉쬁, ?곸슜???쒓퀎?? ?곗텧 臾쇰━???깆쓽 ??Row)???ㅺ퀎?섍퀬, ?덈컲 ?댁긽? ?띾????꾨Ц 吏?앹쑝濡?誘몃━ 梨꾩슫 ??珥?2~3媛쒖쓽 ?듭떖 鍮덉뭏留?[INPUT_1], [INPUT_2]濡??ㅼ젙?섏떗?쒖삤.

3. 3踰?臾명빆 (怨듯븰???섎?/援먰썕 二쇨???臾몄젣) - type: "二쇨???(?⑤떟??"
4. 4踰?臾명빆 (愿??怨듯븰??臾몄젣 諛쒖깮 ???梨?二쇨???臾몄젣) - type: "二쇨???(?ㅻ떟??"

[?묐떟 JSON ?щ㎎]:
[
  {
    "type": "二쇨???(?쒖콈?곌린)",
    "question": "鍮꾧탳 臾몄젣 吏덈Ц",
    "tableData": { "headers": ["援щ텇 ??ぉ", "怨듬쾿/?대줎 A", "怨듬쾿/?대줎 B"], "rows": [["??ぉ", "[INPUT_1]", "?댁슜"]] },
    "answers": { "INPUT_1": "?뺣떟" }
  },
  {
    "type": "二쇨???(?⑤떟??",
    "question": "二쇨???吏덈Ц 3",
    "answer": "?뺣떟 3"
  },
  {
    "type": "二쇨???(?⑤떟??",
    "question": "二쇨???吏덈Ц 4",
    "answer": "?뺣떟 4"
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
  const tableQ = parsedQ1.find(q => q.type === '二쇨???(?쒖콈?곌린)' || q.type === '二쇨???(怨꾩궛)') || parsedQ1[0];
  
  // Q234: Look for comparison table and short answers in the response from Q234 LLM
  const compQ  = parsedQ234.find(q => q.type === '二쇨???(?쒖콈?곌린)' &&
    Array.isArray(q.tableData?.headers) && q.tableData.headers.length >= 3);
  const shorts = parsedQ234.filter(q => q.type === '二쇨???(?ㅻ떟??' || q.type === '二쇨???(?⑤떟??');

  const fb = calcFallbackQuestions(topic.title, topic.keywords);

  const final = [
    tableQ || fb[0],
    compQ  || fb[1],
    shorts[0] || fb[2],
    shorts[1] || fb[3],
  ];

  return final.map(q => healQuizQuestionObject({ ...q, category: '怨꾩궛' }));
}

function calcFallbackQuestions(title, keywords) {
  const cleanTitle = title || '怨듯븰 ?좏뵿';
  return [
    {
      type: '二쇨???(怨꾩궛)',
      question: cleanTitle + ' 怨꾩궛 臾몄젣???붽뎄 ??ぉ??????듭븞???묒꽦?섏떆??',
      calcItems: [
        { id: 'INPUT_1', label: '(1) ?섏튂 怨꾩궛 ??ぉ 1' },
        { id: 'INPUT_2', label: '(2) ?섏튂 怨꾩궛 ??ぉ 2' }
      ],
      answers: { INPUT_1: "??ぉ 1 ?섏튂 ???諛??뺣떟", INPUT_2: "??ぉ 2 ?섏튂 ???諛??뺣떟" }
    },
    {
      type: '二쇨???(?쒖콈?곌린)',
      question: cleanTitle + ' 愿??怨듬쾿/?대줎 硫붿빱?덉쬁 諛??뱀꽦 鍮꾧탳?쒕? ?꾩꽦?섏떆??',
      tableData: {
        headers: ["援щ텇 ??ぉ", cleanTitle + ' (二?怨듬쾿)', "?議?怨듬쾿/?대줎 A", "?議?怨듬쾿/?대줎 B"],
        rows: [
          ["?듭떖 硫붿빱?덉쬁", "[INPUT_1]", "?議?怨듬쾿 A ?뱀꽦 ?쒖닠", "?議?怨듬쾿 B ?뱀꽦 ?쒖닠"],
          ["?곸슜 吏諛??쒓퀎", "湲곗큹 吏諛??곹빀???됯?", "[INPUT_2]", "?議??쒓퀎 議곌굔 ?쒖닠"]
        ]
      },
      answers: { INPUT_1: "二?怨듬쾿 硫붿빱?덉쬁 ?쒖닠", INPUT_2: "?議?怨듬쾿 A ?곹빀 吏諛??쒖닠" }
    },
    { type: '二쇨???(?⑤떟??', question: cleanTitle + '??怨듯븰???섎???', answer: '怨듯븰???섎? ?쒖닠' },
    { type: '二쇨???(?ㅻ떟??', question: cleanTitle + ' ?쒓났 ??二쇱쓽?ы빆??', answer: '二쇱쓽?ы빆 ?쒖닠' }
  ];
}


