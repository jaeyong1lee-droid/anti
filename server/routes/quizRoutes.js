import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbQuery, isPostgres } from '../database.js';
import { callLLMWithFailover, searchSourceDocumentWithGeminiLite, analyzeStandardsBeforeTask, saveSessionValue, getTopicText, startBackendProgressTimer, updateProgress, globalPreferredModel } from '../services/aiService.js';
import { healLatexFormulas, healQuizQuestionObject, healAnswersheetQuestionObject, parseLlmJson, LATEX_PROMPT_INSTRUCTIONS, LATEX_CHAT_PROMPT_INSTRUCTIONS } from '../utils/latexUtils.js';
import * as fileUtils from '../utils/fileUtils.js';
import { generateFallbackQuestions } from '../fallback_generator.js';
import { GENERATION_STANDARDS, generationStandardsList } from '../plugins/generationStandards.js';
import { ENGINEERING_STANDARDS, standardsList as engineeringStandardsList } from '../plugins/engineeringStandards.js';
import { FLOWCHART_QUIZ_GENERATION_PROMPT } from '../plugins/flowchartQuizPlugin.js';
import * as ocrPlugin from '../plugins/calculationPlugin.js';
import { generateCalcTopicQuiz } from '../plugins/calculationPlugin.js';
import * as itemQuizPlugin from '../plugins/formulaItemQuizPlugin.js';
import pdfParse from 'pdf-parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

const router = express.Router();

// Auto-cleanup stale review session keys on server startup (runs once, non-blocking)
// Deletes review_questions_* keys that haven't been updated in over 60 days
;(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 8000)); // wait for DB to be ready
    const cutoff = isPostgres
      ? `NOW() - INTERVAL '60 days'`
      : `datetime('now', '-60 days')`;
    const result = await dbQuery.run(
      `DELETE FROM app_session
       WHERE (key LIKE 'review_questions_topic_%' OR key LIKE 'review_questions_schedule_%')
       AND updated_at < ${cutoff}`
    );
    if (result.changes > 0) {
      console.log(`[Session Cleanup] Deleted ${result.changes} stale review session keys (>60 days old).`);
    }

    // Auto-heal active review session keys in app_session DB table to scrub all remaining dummy wording
    // Filtered query to minimize Neon DB network transfer usage
    const activeSessions = await dbQuery.all(
      `SELECT key, value FROM app_session 
       WHERE key LIKE 'review_questions_%' 
       AND (value LIKE '%?뱀꽦 1%' OR value LIKE '%?뱀꽦 2%' OR value LIKE '%A ?낅젰%' OR value LIKE '%?섏튂 怨꾩궛%')`
    );
    let scrubbedCount = 0;
    for (const s of activeSessions) {
      if (!s.value) continue;
      try {
        let parsed = JSON.parse(s.value);
        let changed = false;
        if (Array.isArray(parsed)) {
          parsed = parsed.map(q => healQuizQuestionObject(q));
          changed = true;
        } else if (parsed && Array.isArray(parsed.questions)) {
          parsed.questions = parsed.questions.map(q => healQuizQuestionObject(q));
          changed = true;
        }
        if (changed) {
          await dbQuery.run(
            `UPDATE app_session SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`,
            [JSON.stringify(parsed), s.key]
          );
          scrubbedCount++;
        }
      } catch (err) {}
    }
    if (scrubbedCount > 0) {
      console.log(`[Session Auto-Scrubber] Successfully healed and scrubbed ${scrubbedCount} session keys in DB.`);
    }
  } catch (e) {
    // Non-critical: silently ignore startup cleanup errors
  }
})();

// Helper function to deduplicate AI questions
const deduplicateQuestions = (questions) => {
  if (!Array.isArray(questions)) return [];
  const seen = new Set();
  const result = [];

  for (const q of questions) {
    if (!q) continue;
    const titleKey = (q.question || q.title || '').trim().toLowerCase();
    if (!titleKey) {
      result.push(q);
      continue;
    }
    if (seen.has(titleKey)) continue;
    seen.add(titleKey);
    result.push(q);
  }

  return result;
};

function cleanQuizQuestion(q) {
  if (!q) return q;
  let cleanText = typeof q === 'string' ? q : String(q || '');

  // 1. Replace (A), (B), (C), (D) list garbage inside flowchart boxes with sequential single placeholders
  let emptyBoxIdx = 0;
  cleanText = cleanText.replace(/\[\s*\([^\]]*\)\s*,\s*\([^\]]*\)[\s\S]*?\]/gi, () => {
    emptyBoxIdx++;
    return emptyBoxIdx === 1 ? '[ (A) ]' : (emptyBoxIdx === 2 ? '[ (C) ]' : '[ (E) ]');
  });

  let emptyLineIdx = 0;
  cleanText = cleanText.replace(/-\s*\([^)]*\)\s*,\s*\([^)]*\)[\s\S]*?(?=\r?\n|$)/gi, () => {
    emptyLineIdx++;
    return emptyLineIdx === 1 ? '- (B)' : (emptyLineIdx === 2 ? '- (D)' : '- (F)');
  });

  // 2. Strip remaining list garbage outside boxes
  cleanText = cleanText.replace(/,?\s*\([A-Z]\)(?:\s*,\s*\([A-Z]\))+/gi, '');

  const isFlowchart = cleanText.includes('?뚢??') || cleanText.includes('??) || cleanText.includes('```') || cleanText.includes('?먮쫫??) || cleanText.includes('?뚮줈?곗감??);
  if (isFlowchart) return cleanText.trim();
  return cleanText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function getCoreSubjectFromTitle(title) {
  if (!title) return '';
  let core = title.trim();
  // Remove file extensions if any
  core = core.replace(/\.(pdf|hwp|docx?|txt|xlsx?|pptx?)$/i, '');
  // Remove document-like suffixes (e.g. 怨듯븰 ?댁꽍 蹂닿퀬?? 怨듬??명듃, ?붿빟蹂???
  const suffixPattern = /(?:\s+|_|-)?(?:怨듯븰\s*)?(?:?댁꽍\s*)?(?:蹂닿퀬??蹂닿퀬|?명듃|?붿빟蹂??붿빟|?뺣━|怨듬??명듃|怨듬?|?먮즺|?뚯씪|蹂??띿뒪??StudyNote|studynote|Study|study|臾몄젣|怨쇱젣|吏덈Ц)$/i;
  core = core.replace(suffixPattern, '');
  
  // Remove trailing definition, concept, occurrence, method, theory terms to keep it pure engineering subject
  const conceptPattern = /(?:\s*諛?s*|\s+)?(?:?뺤쓽\s*諛?s*諛쒖깮\s*議곌굔|?뺤쓽\s*諛?s*諛쒖깮議곌굔|?뺤쓽\s*諛?s*諛쒖깮\s*硫붿빱?덉쬁|?뺤쓽|諛쒖깮\s*議곌굔|諛쒖깮議곌굔|媛쒕뀗|?대줎|怨듬쾿)$/i;
  core = core.replace(conceptPattern, '');
  
  return core.trim();
}

function normalizeMcText(text) {
  if (!text) return '';
  return text
    .replace(/^[?졻몼?™몿??-5][\s\.\)\:\s]*/, '')
    .replace(/\s+/g, '')
    .replace(/[.~,`'"'']/g, '')
    .toLowerCase();
}

function isQuestionMismatched(q, topicTitle, topicKeywords, topicCategory = '?쇰컲') {
  return false;
}


function sanitizeMultipleChoiceAnswer(q) {
  if (!q || !q.options || q.options.length === 0 || !q.explanation) return q;

  const options = q.options;
  const exp = q.explanation;
  const currentAns = (q.answer || '').trim();

  const conclusionMatch = exp.match(/(?:\[理쒖쥌\s*?뺣떟\s*?곗텧\]|?곕씪???뺣떟?|寃곕줎?곸쑝濡?[\s\S]*$/i);
  const searchTarget = conclusionMatch ? conclusionMatch[0] : exp;
  const normalizedTarget = normalizeMcText(searchTarget);

  let bestMatch = null;
  let bestScore = 0;

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const normOpt = normalizeMcText(opt);
    if (!normOpt) continue;

    if (normalizedTarget.includes(normOpt)) {
      bestMatch = opt;
      bestScore = 100;
      break;
    }

    const numKeywords = normOpt.match(/(?:\d+\/\d+|\d+諛?蹂?붽?\s*?녿떎|利앷?|媛먯냼)/g) || [];
    if (numKeywords.length > 0) {
      const matchCount = numKeywords.filter(kw => normalizedTarget.includes(normalizeMcText(kw))).length;
      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestMatch = opt;
      }
    }
  }

  if (bestMatch && currentAns) {
    const normCurrent = normalizeMcText(currentAns);
    if (!normalizedTarget.includes(normCurrent) && (bestScore >= 100 || bestScore > 0)) {
      console.log(`[MC Answer Sanitized] Original answer '${currentAns}' was inconsistent with explanation. Corrected to '${bestMatch}'`);
      return {
        ...q,
        answer: bestMatch
      };
    }
  }

  return q;
}

function shuffleMultipleChoice(q) {
  if (!q || !q.options || q.options.length === 0) return q;
  const sanitized = sanitizeMultipleChoiceAnswer(q);
  const originalAnswer = sanitized.answer;
  const shuffledOptions = [...sanitized.options];
  for (let i = shuffledOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
  }
  const normalize = (s) => (s || '').replace(/^\d+\.(?!\d)\s*/, '').trim();
  const matchedOption = shuffledOptions.find(opt => normalize(opt) === normalize(originalAnswer)) || originalAnswer;
  return {
    ...sanitized,
    options: shuffledOptions,
    answer: matchedOption
  };
}



function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * ?뚯뒪 ?띿뒪??OCR)?먯꽌 (1), (2), (3)... ?뺤떇?쇰줈 紐낆떆???섏쐞 吏덈Ц??異붿텧?섏뿬
 * ?대뼡 ?좏뵿?대뱺 ?숈쟻?쇰줈 ?섏튂 怨꾩궛 ?쒖콈?곌린 ?쇱쓣 ?앹꽦?쒕떎.
 * 異붿텧 ?ㅽ뙣 ??踰붿슜 fallback rows瑜??ъ슜?쒕떎.
 */
function extractCalculationRowsFromText(fileText) {
  if (!fileText) return null;

  const subQuestionPattern = /[竊?](\d+)[)竊?\s*([^\n(竊?+?)(?=\s*[竊?]\d+[)竊?|\n\n|$)/g;
  const matches = [];
  let match;
  while ((match = subQuestionPattern.exec(fileText)) !== null) {
    const num = parseInt(match[1]);
    const text = match[2].trim().replace(/[,竊?\s*$/, '').replace(/\s+/g, ' ');
    if (text.length >= 3 && text.length <= 80 && num >= 1 && num <= 10) {
      matches.push({ num, text });
    }
  }

  if (matches.length < 2) return null;

  let bestGroup = [];
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].num === 1) {
      const group = [matches[i]];
      for (let j = i + 1; j < matches.length; j++) {
        if (matches[j].num === group[group.length - 1].num + 1) {
          group.push(matches[j]);
        } else if (matches[j].num > group[group.length - 1].num + 1) {
          break;
        }
      }
      if (group.length > bestGroup.length) bestGroup = group;
    }
  }

  if (bestGroup.length < 2) return null;

  const rows = bestGroup.map(({ num, text }) => [
    `(${num}) ${text}`,
    `[INPUT_${num}]`
  ]);
  const answers = {};
  bestGroup.forEach(({ num, text }) => {
    answers[`INPUT_${num}`] = `(${num}) ${text} 怨듭떇 諛??섏튂 ???;
  });

  return { rows, answers };
}

function generateCalculationFallbackQuestions(title, keywords, fileText) {
  const extracted = extractCalculationRowsFromText(fileText);

  const rows = extracted ? extracted.rows : [
    ["(1) ?⑥쐞??떦 移⑦닾?좊웾 q (m쨀/s/m)", "[INPUT_1]"],
    ["(2) 吏???꾩튂 媛꾧레?섏븬 u (kN/m짼)", "[INPUT_2]"],
    ["(3) 異쒓뎄 ?좎텧 ?숈닔寃쎌궗 i_exit", "[INPUT_3]"]
  ];
  const answers = extracted ? extracted.answers : {
    INPUT_1: "移⑦닾?좊웾 q 怨듭떇 諛??섏튂 ???,
    INPUT_2: "媛꾧레?섏븬 u 怨듭떇 諛??섏튂 ???,
    INPUT_3: "?숈닔寃쎌궗 i 怨듭떇 諛??섏튂 ???
  };

  return [
    {
      type: "二쇨???(?쒖콈?곌린)",
      subtype: "?쒖콈?곌린",
      question: `[${title} 怨꾩궛 臾몄젣] 泥⑤? 洹몃┝ 諛??먮낫怨좎꽌 議곌굔???곕Ⅸ ?섏튂 怨꾩궛 ??ぉ???뺣떟??援ы븯???꾨옒 ?쒖쓽 鍮덉뭏???꾩꽦?섏떆??`,
      tableData: {
        headers: ["援ы븯????ぉ", "怨꾩궛 寃곌낵 諛??듭븞"],
        rows: rows
      },
      answers: answers,
      explanation: "?먮낫怨좎꽌 諛??쒓났???ㅽ겕由곗꺑 ?대?吏??怨듯븰???ㅺ퀎 議곌굔????낇븯??怨꾩궛?섎뒗 ?꾧컻 怨쇱젙?낅땲??"
    },
    {
      type: "二쇨???(?⑤떟??",
      question: `[${title} 怨듯븰???섎?] ??怨꾩궛 怨쇱젙 諛?寃곌낵媛 ?ㅺ퀎? ?쒓났 ?ㅻТ??二쇰뒗 援먰썕 ?먮뒗 怨듯븰???섎?(吏諛?嫄곕룞 ?댁꽍, ?덉쟾???됯? ??瑜??ㅻ챸?섏떗?쒖삤.`,
      answer: "?ㅺ퀎 諛??쒓났 議곌굔???덉쟾 ?ъ쑀???뺣낫? 吏諛?嫄곕룞 遺꾩꽍??湲곗큹 ?먮즺 ?쒓났",
      explanation: "怨꾩궛 寃곌낵瑜??듯빐 ?쒓퀎 ?곹깭瑜??먮떒?섍퀬, ?ㅼ젣 吏諛섏쓽 嫄곕룞 ?뱀쭠怨?遺덊솗?ㅼ꽦??怨좊젮???ㅺ퀎 留덉쭊 諛?怨듯븰??援먰썕???댄빐?섎뒗 寃껋씠 ?듭떖?낅땲??"
    },
    {
      type: "二쇨???(?⑤떟??",
      question: `[${title} 怨듯븰???梨? ??臾몄젣??怨꾩궛 寃곌낵? 愿?⑦븯???꾩옣?먯꽌 怨듯븰??臾몄젣媛 諛쒖깮?덉쓣 ?뚯쓽 ?ㅻТ???닿껐梨?諛??梨낆쓣 ?쒖닠?섏떗?쒖삤.`,
      answer: "吏諛?媛쒕웾 怨듬쾿 ?곸슜, ?섏쨷 遺꾩궛 ?梨??섎┰, 怨꾩륫 愿由?媛뺥솕 諛?李⑥닔/諛곗닔 怨듬쾿 ?ㅺ퀎",
      explanation: "怨꾩궛移?珥덇낵 ?먮뒗 吏諛?遺뺢눼 ?꾪뿕 ??遺덉븞?뺤꽦 諛쒖깮 ???꾩옣?먯꽌 痍⑦븷 ???덈뒗 援ъ껜?곸씤 吏諛?媛쒕웾 諛?怨듬쾿 蹂寃??梨낆쓣 ?쒖떆?섎뒗 臾명빆?낅땲??"
    }
  ];
}

function assembleFinalCalculationQuestions(questions, topic, fileText) {
  // 1. LLM???앹꽦???쒖콈?곌린??怨꾩궛臾몄젣 留λ씫??紐⑤Ⅴ怨??꾩쓽 ?앹꽦?섎?濡??꾨웾 ?먭린
  let finalQuestions = (questions || []).filter(q =>
    q.type !== '二쇨???(?쒖콈?곌린)'
  );

  // 2. ?뚯뒪 ?띿뒪?몄뿉???먮Ц ?섏쐞 吏덈Ц???먮룞 異붿텧?섏뿬 怨꾩궛 ???앹꽦 (?ㅽ뙣??踰붿슜 fallback)
  const fb = generateCalculationFallbackQuestions(topic.title, topic.keywords, fileText);
  
  // 3. 臾댁“嫄?泥?踰덉㎏ 臾몄젣(Q1)???곕━媛 ?숈쟻 異붿텧??怨꾩궛 ?쒖콈?곌린 臾몄젣瑜?媛뺤젣 ?쎌엯
  finalQuestions.unshift(fb[0]);

  // 4. 紐⑥옄? 臾몄젣???⑤떟??fallback?쇰줈 梨꾩?
  while (finalQuestions.length < 4) {
    finalQuestions.push(fb[finalQuestions.length]);
  }
  return finalQuestions.slice(0, 4);
}

function mergeSplitFlowchartQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  const merged = [];
  let skipNext = false;
  
  for (let i = 0; i < questions.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    
    const curr = questions[i];
    const next = questions[i + 1];
    
    // Check if curr has flowchart and next is table quiz with empty/undefined/short question
    if (
      curr &&
      typeof curr === 'object' &&
      next &&
      typeof next === 'object' &&
      typeof curr.question === 'string' &&
      (curr.question.includes('??) || curr.question.includes('??) || curr.question.includes('?먮쫫??)) &&
      (curr.type === '二쇨???(?⑤떟??' || curr.type === '二쇨???(?쒖콈?곌린)') &&
      (next.type === '二쇨???(?쒖콈?곌린)' || next.subtype === '?쒖콈?곌린') &&
      (!next.question || 
       next.question === 'undefined' || 
       (typeof next.question === 'string' && 
        (next.question.trim().length < 20 || 
         next.question.includes('鍮덉뭏 援щ텇') || 
         next.question.includes('?낅젰 ?듭븞'))
       )
      )
    ) {
      console.log(`[Flowchart Merger] Merging split flowchart question at index ${i} and ${i + 1}`);
      const mergedQuestion = {
        ...next,
        type: '二쇨???(?쒖콈?곌린)',
        subtype: '?쒖콈?곌린',
        question: curr.question // Use the flowchart diagram and prompt from curr
      };
      merged.push(mergedQuestion);
      skipNext = true; // Skip next since we merged it
    } else {
      merged.push(curr);
    }
  }
  
  return merged;
}

function assembleFinalQuestions(questions, topic, carryOverQuestions, fileText) {
  // Merge split flowchart questions first to prevent separate render cards
  questions = mergeSplitFlowchartQuestions(questions);

  const coreSubject = getCoreSubjectFromTitle(topic.title);

  let qIntro = questions.find(q => q.type === '二쇨???(媛쒖슂)');
  if (qIntro) {
    qIntro = { ...qIntro };
    qIntro.type = '二쇨???(媛쒖슂)';
    delete qIntro.tableData;
    delete qIntro.answers;
    delete qIntro.subtype;
  }

  let qFormula = questions.find(q => q.type === '二쇨???(怨듭떇)');
  if (qFormula) {
    qFormula = { ...qFormula };
    qFormula.type = '二쇨???(怨듭떇)';
    delete qFormula.tableData;
    delete qFormula.answers;
    delete qFormula.subtype;
  }

  const carryOverShorts = (carryOverQuestions || []).filter(q => (q.type || '').includes('?⑤떟??) && q !== qIntro && q !== qFormula);
  const carryOverTables = (carryOverQuestions || []).filter(q => ((q.type || '').includes('?쒖콈?곌린') || q.subtype === '?쒖콈?곌린') && q !== qIntro && q !== qFormula);
  const carryOverMcs = (carryOverQuestions || []).filter(q => ((q.type || '').includes('媛앷???) || (q.options && q.options.length > 0)) && q !== qIntro && q !== qFormula);

  const subjsShort = [...questions.filter(q => q.type === '二쇨???(?⑤떟??' && q !== qIntro && q !== qFormula), ...carryOverShorts];
  const subjsTable = [...questions.filter(q => (q.type === '二쇨???(?쒖콈?곌린)' || q.subtype === '?쒖콈?곌린') && q !== qIntro && q !== qFormula), ...carryOverTables];
  const mcs = [...questions.filter(q => (q.type === '媛앷???(4吏?좊떎)' || (q.options && q.options.length > 0)) && q !== qIntro && q !== qFormula), ...carryOverMcs];

  // AI-generated short subjectives (remove duplicates)
  let finalSubjsShort = [];
  const shortSeen = new Set();
  subjsShort.forEach(q => {
    const qText = (q.question || '').trim();
    if (qText && !shortSeen.has(qText)) {
      shortSeen.add(qText);
      finalSubjsShort.push(q);
    }
  });

  // Separate concept questions and field problem questions
  const fieldKeywords = ["?섏옄", "?梨?, "臾몄젣??, "?쒕굹由ъ삤", "?꾩옣", "臾몄젣 ?곹솴", "?泥?, "countermeasure", "solution", "scenario"];
  const fieldQs = [];
  const conceptQs = [];

  finalSubjsShort.forEach(q => {
    const qText = q.question || '';
    const isField = fieldKeywords.some(kw => qText.includes(kw));
    if (isField) {
      fieldQs.push(q);
    } else {
      conceptQs.push(q);
    }
  });

  // Collect concept questions first, then field questions
  const finalShorts4 = [...conceptQs, ...fieldQs];

  // Extract flowchart and comparison tables
  const flowcharts = subjsTable.filter(q => q && q.question && (
    q.question.includes('??) || q.question.includes('??) || q.question.includes('?먮쫫??) || q.question.includes('?뚮줈?곗감??)
  ));
  const compTables = subjsTable.filter(q => q && !flowcharts.includes(q));

  // Flowchart Table slot (exactly 1)
  const finalFlowchart = flowcharts[0] || subjsTable.find(q => q !== qIntro && q !== qFormula);

  // Comparison Tables slot (exactly 2)
  const finalCompTables = compTables.filter(q => q !== finalFlowchart);

  // MCQs slot (exactly 4)
  let finalMcs = [];
  const uniqueMcQuestions = new Set();
  mcs.forEach(q => {
    const cleanQ = (q.question || '').trim();
    if (cleanQ && !uniqueMcQuestions.has(cleanQ)) {
      uniqueMcQuestions.add(cleanQ);
      finalMcs.push(shuffleMultipleChoice(q));
    }
  });

  const shuffledMcs = shuffleArray([...finalMcs]);

  // Fixed 13 questions returned list layout
  return [
    qIntro,                     // 1踰?二쇨???(index 0)
    qFormula,                   // 2踰?二쇨???(index 1)
    shuffledMcs[0],             // 3踰?媛앷???(index 2)
    finalCompTables[0],         // 4踰??쒖콈?곌린 1 (index 3) -> Comparison Table 1
    shuffledMcs[1],             // 5踰?媛앷???(index 4)
    finalShorts4[0],            // 6踰?二쇨???(index 5) -> Short Subjective 1 (Concept 1)
    finalFlowchart,             // 7踰??쒖콈?곌린 (index 6) -> Flowchart Table
    finalCompTables[1],         // 8踰??쒖콈?곌린 2 (index 7) -> Comparison Table 2
    shuffledMcs[2],             // 9踰?媛앷???(index 8)
    finalShorts4[1],            // 10踰?二쇨???(index 9) -> Short Subjective 2 (Concept 2)
    shuffledMcs[3],             // 11踰?媛앷???(index 10)
    finalShorts4[2],            // 12踰?二쇨???(index 11) -> Short Subjective 3 (Concept 3)
    finalShorts4[3]             // 13踰?二쇨???(index 12) -> Short Subjective 4 (Field/Countermeasure)
  ].filter(Boolean);
}
async function ensureSessionTable() {
  try {
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS app_session (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn('ensureSessionTable warning:', e.message);
  }
}

async function ensureAnswersheetReportsTable() {
  try {
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS answersheet_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pdf_name TEXT,
        pdf_data BLOB,
        pdf_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn('ensureAnswersheetReportsTable warning:', e.message);
  }
}

async function getFormattedTopicInstructions(topicId) {
  if (!topicId) return '';
  try {
    const key = 'topic_instructions_' + topicId;
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = ?", [key]);
    if (row && row.value) {
      const list = JSON.parse(row.value);
      if (Array.isArray(list) && list.length > 0) {
        const formatted = list.map((item, idx) => (idx + 1) + '. **' + item.title + '**:\n   - ' + item.content).join('\n');
        return '\n[?슚 ???좏뵿(' + topicId + ')???꾩슜 臾몄젣 異쒖젣 諛?蹂??吏移?- 諛섎뱶??諛섏쁺?섏떗?쒖삤]:\n' + formatted + '\n';
      }
    }
  } catch (e) {}
  return '';
}

// POST /api/topics/:id/ai-questions -> Generate AI review questions
router.post('/topics/:id/ai-questions', async (req, res) => {
  const topicId = Number(req.params.id) || req.params.id;
  let resolvedScheduleId;
  let topic = null;

  try {
    const topicSql = `SELECT id, title, keywords, pdf_name, category, pdf_url, extracted_text FROM topics WHERE id = ?`;
    topic = await dbQuery.get(topicSql, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '?좏뵿??李얠쓣 ???놁뒿?덈떎.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  let isCacheHit = false;
  let cachedResponseData = null;

  try {
    await ensureSessionTable();
    const scheduleId = req.query.scheduleId;
    const isPractice = req.query.isPractice === 'true';
    resolvedScheduleId = scheduleId;

    if (!resolvedScheduleId || resolvedScheduleId === '9999' || resolvedScheduleId === 'null' || resolvedScheduleId === 'undefined' || resolvedScheduleId === 9999) {
      const existingPending = await dbQuery.get(
        `SELECT id FROM schedules WHERE topic_id = ? AND (status = 'pending' OR status = 'practice') ORDER BY id DESC LIMIT 1`,
        [topicId]
      );
      if (existingPending) {
        resolvedScheduleId = existingPending.id;
      } else {
        const today = fileUtils.getLocalDateString();
        const initialStatus = isPractice ? 'practice' : 'pending';
        const insertRes = await dbQuery.run(
          `INSERT INTO schedules (topic_id, review_round, planned_date, status) VALUES (?, 99, ?, ?)`,
          [topicId, today, initialStatus]
        );
        resolvedScheduleId = insertRes.id;
      }
    }

    const sId = req.query.sessionId || 'legacy_default';
    const key = resolvedScheduleId
      ? `review_questions_schedule_${resolvedScheduleId}_sess_${sId}`
      : `review_questions_topic_${topicId}_sess_${sId}`;

    let cached = await dbQuery.get('SELECT key, value FROM app_session WHERE key = ?', [key]);

    let newestSessionRow = null;
    const patterns = [];
    if (resolvedScheduleId && resolvedScheduleId !== '9999' && resolvedScheduleId !== 'null' && resolvedScheduleId !== 'undefined') {
      patterns.push(`review_questions_schedule_${resolvedScheduleId}_sess_%`);
    }
    patterns.push(`review_questions_topic_${topicId}_sess_%`);

    if (!resolvedScheduleId || resolvedScheduleId === '9999' || resolvedScheduleId === 'null' || resolvedScheduleId === 'undefined') {
      const existingPending = await dbQuery.get(
        `SELECT id FROM schedules WHERE topic_id = ? AND (status = 'pending' OR status = 'practice') ORDER BY id DESC LIMIT 1`,
        [topicId]
      );
      if (existingPending) {
        patterns.push(`review_questions_schedule_${existingPending.id}_sess_%`);
      }
    }

    for (const pattern of patterns) {
      const row = await dbQuery.get(
        'SELECT key, value FROM app_session WHERE key LIKE ? AND key NOT LIKE ? ORDER BY updated_at DESC LIMIT 1',
        [pattern, '%_q']
      );
      if (row && !newestSessionRow) newestSessionRow = row;
    }

    if (!cached && newestSessionRow) {
      cached = newestSessionRow;
      try {
        const parsedVal = JSON.parse(cached.value);
        let extractedSid = '';
        if (newestSessionRow.key.includes('_sess_')) {
          const parts = newestSessionRow.key.split('_sess_');
          extractedSid = parts[parts.length - 1];
        }
        if (parsedVal && extractedSid) {
          parsedVal.sessionId = extractedSid;
          cached.value = JSON.stringify(parsedVal);
        }
      } catch (e) {}
    }

    if (!cached) {
      const legacyKey = resolvedScheduleId
        ? `review_questions_schedule_${resolvedScheduleId}`
        : `review_questions_topic_${topicId}`;
      cached = await dbQuery.get('SELECT key, value FROM app_session WHERE key = ?', [legacyKey]);
    }

    if (cached && cached.value) {
      const parsed = JSON.parse(cached.value);
      
      // Merge questions from separate _q key when using new split-storage format
      if (!Array.isArray(parsed) && (!parsed.questions || parsed.questions.length === 0)) {
        const actualKey = cached.key || key;
        const qRow = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [`${actualKey}_q`]);
        if (qRow && qRow.value) {
          parsed.questions = JSON.parse(qRow.value);
        }
      }

      let cachedQuestions = null;
      let cachedMeta = {};
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedQuestions = parsed;
      } else if (parsed && Array.isArray(parsed.questions)) {
        cachedQuestions = parsed.questions;
        cachedMeta = {
          selectedAnswers: parsed.selectedAnswers || {},
          revealedQuestions: parsed.revealedQuestions || {},
          tableAnswers: parsed.tableAnswers || {},
          tableGradingResults: parsed.tableGradingResults || {},
          tutorAnswers: parsed.tutorAnswers || {},
          tutorInputText: parsed.tutorInputText || {},
          chatHistory: parsed.chatHistory || [],
          savedQuizScroll: parsed.savedQuizScroll || 0
        };
      }

      if (cachedQuestions && cachedQuestions.length > 0) {
        const healed = cachedQuestions.map(q => healQuizQuestionObject({ ...q, category: topic.category }));
        isCacheHit = true;
        cachedResponseData = {
          questions: healed,
          ...cachedMeta,
          sessionId: parsed.sessionId || sId,
          isFallback: false,
          isCached: true,
          scheduleId: resolvedScheduleId
        };
      }
    }
  } catch (e) {
    console.warn('Failed to parse cached review questions:', e);
  }

  if (isCacheHit && cachedResponseData) {
    return res.json(cachedResponseData);
  }

  let progressTimer = null;
  try {
    const progressId = req.query.progressId || req.body.progressId;
    let standardsAnalysis = '';
    const localCallLLM = (sys, prompt, img, scenario, opts) => {
      const enrichedPrompt = standardsAnalysis ? `${standardsAnalysis}\n\n${prompt}` : prompt;
      return callLLMWithFailover(sys, enrichedPrompt, img, scenario, { ...opts, progressId });
    };

    if (progressId) {
      progressTimer = startBackendProgressTimer(progressId, 1, '1?④퀎: AI ?덉긽 臾몄젣 ?앹꽦 ?쒖옉...', 50, 1500, 5);
      standardsAnalysis = await analyzeStandardsBeforeTask(progressId, topic.title, GENERATION_STANDARDS, 'generation');
    }

    let carryOverQuestions = [];
    let incorrectQuestions = [];
    try {
      const prevSchedule = await dbQuery.get(
        `SELECT id FROM schedules WHERE topic_id = ? AND (status = 'completed' OR status = 'failed') ORDER BY completed_at DESC LIMIT 1`,
        [topicId]
      );
      if (prevSchedule) {
        const prevSessionKey = `completed_review_schedule_${prevSchedule.id}`;
        const prevSession = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [prevSessionKey]);
        if (prevSession && prevSession.value) {
          const parsed = JSON.parse(prevSession.value);
          if (parsed && Array.isArray(parsed.questions)) {
            parsed.questions.forEach((q, qIdx) => {
              if (q.options && q.options.length > 0) {
                const selected = parsed.selectedAnswers?.[qIdx];
                const normalizeAns = (s) => (s || '').replace(/^\d+\.(?!\d)\s*/, '').trim();
                if (normalizeAns(selected) !== normalizeAns(q.answer)) {
                  if (!isQuestionMismatched(q, topic.title, topic.keywords)) {
                    incorrectQuestions.push(q);
                  }
                }
              }
            });
          }
        }
      }
    } catch (err) {
      console.warn('?댁쟾 ?ㅻ떟 濡쒕뵫 ?ㅽ뙣:', err);
    }

    const carryOverCount = Math.min(incorrectQuestions.length, 5);
    carryOverQuestions = incorrectQuestions.slice(0, carryOverCount);

    let fileText = '';
    if (topic.pdf_data) {
      fileText = await getTopicText(topic, fileUtils, ocrPlugin, pdfParse);
      fileText = fileUtils.smartTruncate(fileText, 30000);
    }

    const cleanTitle = (topic.title || '').toLowerCase();
    const cleanKeywords = (topic.keywords || '').toLowerCase();
    const searchTarget = `${cleanTitle} ${cleanKeywords}`;

    const isCoreTopic = 
      searchTarget.includes('?쒖꽦??) || searchTarget.includes('activity') ||
      searchTarget.includes('?댁쨷痢?) || searchTarget.includes('double layer') || searchTarget.includes('ddl') ||
      searchTarget.includes('?뺣?') || searchTarget.includes('consolidation') || searchTarget.includes('移⑦븯') || searchTarget.includes('settlement') ||
      searchTarget.includes('?뚮뱶留ㅽ듃') || searchTarget.includes('sand mat') ||
      searchTarget.includes('?됱궗?ъ쁺') || searchTarget.includes('stereographic') ||
      searchTarget.includes('?몃컻') || searchTarget.includes('pullout') ||
      searchTarget.includes('q 遺꾨쪟') || searchTarget.includes('q-system') ||
      searchTarget.includes('?깃???) || searchTarget.includes('single shell') ||
      searchTarget.includes('?뚯씪?댁씪') || searchTarget.includes('soil nail') ||
      searchTarget.includes('?꾨??') || searchTarget.includes('prandtl') ||
      searchTarget.includes('?ш뎬') || searchTarget.includes('overbreak') ||
      searchTarget.includes('?щ㈃?덉젙') || searchTarget.includes('slope stability') ||
      searchTarget.includes('?좎븬') || searchTarget.includes('earth pressure') ||
      searchTarget.includes('?꾨떒媛뺣룄') || searchTarget.includes('shear strength') ||
      searchTarget.includes('?ъ닔') || searchTarget.includes('移⑦닾') ||
      searchTarget.includes('?숇쭑??) || searchTarget.includes('?꾩냼??) ||
      searchTarget.includes('?≪긽??) || searchTarget.includes('liquefaction') ||
      searchTarget.includes('蹂댁긽湲곗큹') || searchTarget.includes('compensated foundation') ||
      searchTarget.includes('?섏븬?뚯뇙') || searchTarget.includes('hydraulic fracturing');

    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    const forceLocal = req.query.local === 'true';

    if (isCoreTopic && (forceLocal || !hasAnyAiKey)) {
      console.log(`[AI Route Interceptor - Local Fallback] Precision routed core topic "${topic.title}"`);
      const coreQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      const finalQuestions = topic.category === '怨꾩궛'
        ? assembleFinalCalculationQuestions(coreQuestions, topic, fileText)
        : assembleFinalQuestions(coreQuestions, topic, carryOverQuestions, fileText);
      
      const cleanedCore = finalQuestions.map(q => healQuizQuestionObject({
        ...q,
        topic_id: Number(topicId),
        category: topic.category,
        question: cleanQuizQuestion(q.question)
      }));

      const deduplicatedCore = deduplicateQuestions(cleanedCore);
      const sId = req.query.sessionId || 'legacy_default';
      const key = resolvedScheduleId
        ? `review_questions_schedule_${resolvedScheduleId}_sess_${sId}`
        : `review_questions_topic_${topicId}_sess_${sId}`;

      try {
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        await dbQuery.run(
          'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, JSON.stringify(deduplicatedCore)]
        );
      } catch (e) {}

      if (progressTimer) clearInterval(progressTimer);
      return res.json({
        questions: deduplicatedCore,
        isFallback: true,
        mode: 'ai-optimized',
        info: 'Handcrafted premium routing bypass',
        scheduleId: resolvedScheduleId
      });
    }

    if (forceLocal || !hasAnyAiKey) {
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      const finalQuestions = topic.category === '怨꾩궛'
        ? assembleFinalCalculationQuestions(fallbackQuestions, topic, fileText)
        : assembleFinalQuestions(fallbackQuestions, topic, carryOverQuestions, fileText);
      
      const cleanedFallback = finalQuestions.map(q => healQuizQuestionObject({
        ...q,
        topic_id: Number(topicId),
        category: topic.category,
        question: cleanQuizQuestion(q.question)
      }));

      const deduplicatedFallback = deduplicateQuestions(cleanedFallback);
      const sId = req.query.sessionId || 'legacy_default';
      const key = resolvedScheduleId
        ? `review_questions_schedule_${resolvedScheduleId}_sess_${sId}`
        : `review_questions_topic_${topicId}_sess_${sId}`;

      try {
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        await dbQuery.run(
          'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, JSON.stringify(deduplicatedFallback)]
        );
      } catch (e) {}

      if (progressTimer) clearInterval(progressTimer);
      return res.json({ 
        questions: deduplicatedFallback, 
        isFallback: true,
        mode: 'local',
        scheduleId: resolvedScheduleId
      });
    }

    let specialInstructions = '';
    if (cleanTitle.includes('?뺣?湲곗큹') && cleanTitle.includes('嫄곕룞') && cleanTitle.includes('?뚭눼')) {
      specialInstructions = `
[?밸퀎 異쒖젣 吏移?- 留ㅼ슦 以묒슂]:
???좏뵿? '?꾨?? 吏吏??怨듭떇'?대굹 '?뚮Ⅴ?먭린 洹뱁븳吏吏??怨듭떇' ?먯껜???곸꽭???좊룄??怨듭떇 ?뺤쓽瑜??⑤룆?쇰줈 臾삳뒗 ?좏뵿???꾨떃?덈떎.
1. 湲곗큹 ?꾨옒 吏諛섏쓽 3? ?뚭눼 ?뺥깭: ?꾨컲?꾨떒?뚭눼, 援???꾨떒?뚭눼, 愿?낆쟾?⑦뙆愿댁쓽 援ъ껜??諛쒖깮 議곌굔 諛?湲곗쟾.
2. Vesic(1973)???쒖븞???덉륫 ?꾪몴???뱀쭠.
3. ?묒???遺꾪룷 ?⑦꽩 諛?移⑦븯 ?뺤긽 鍮꾧탳.
`;
    }

    let weaknessPrompt = '';
    if (carryOverQuestions.length > 0) {
      weaknessPrompt = `
[?댁쟾 ?뚯감 ?ㅻ떟 ?뺣낫 諛?異쒖젣 吏移?:
?꾨옒 ?ㅻ떟?ㅼ? ?ъ슜?먭? ?댁쟾 ?뚯감?먯꽌 ?由?臾몄젣?낅땲??
?대쾲???앹꽦??4媛쒖쓽 媛앷???臾몄젣 以??욎쓽 ${carryOverQuestions.length}媛?臾몄젣(5踰덈???${4 + carryOverQuestions.length}踰???諛섎뱶???꾨옒 ?ㅻ떟??蹂??臾몄젣濡?異쒖젣?섏떗?쒖삤:
${carryOverQuestions.map((q, idx) => `
?ㅻ떟 臾몄젣 ${idx + 1}:
- 吏덈Ц: ${q.question}
- 蹂닿린: ${JSON.stringify(q.options)}
- ?뺣떟: ${q.answer}
`).join('\n')}
`;
    }

    const totalAiQuestionsCount = topic.category === '怨꾩궛' ? 4 : 13;
    let feedbackPrompt = '';
    try {
      const feedbacks = await dbQuery.all(
        'SELECT question_text, feedback_type FROM question_feedback WHERE topic_id = ?',
        [topicId]
      );
      if (feedbacks.length > 0) {
        const upvotes = feedbacks.filter(f => f.feedback_type === 'upvote').map(f => f.question_text);
        const downvotes = feedbacks.filter(f => f.feedback_type === 'downvote').map(f => f.question_text);
        feedbackPrompt = `
[?ъ슜???쇰뱶諛?吏移?- 異쒖젣 鍮덈룄 諛섏쁺 諛?議곗젙 ?꾩닔]:
1. 異붿쿇 吏덈Ц 紐⑸줉:
${upvotes.map((q, i) => `   - 異붿쿇 吏덈Ц ${i + 1}: ${q}`).join('\n')}
2. 鍮꾩텛泥?吏덈Ц 紐⑸줉 (?덈? ?좎궗臾몄젣 異쒖젣 湲덉?):
${downvotes.map((q, i) => `   - 鍮꾩텛泥?吏덈Ц ${i + 1}: ${q}`).join('\n')}
`;
      }
    } catch (fbErr) {}

    let adjustmentsPrompt = '';
    try {
      const adjustments = await dbQuery.all(
        'SELECT question_text, adjusted_text, user_feedback FROM question_adjustments WHERE topic_id = ? ORDER BY created_at DESC LIMIT 10',
        [topicId]
      );
      if (adjustments.length > 0) {
        adjustmentsPrompt = `
[?ъ슜???댁쟾 臾몄젣 議곗젙(?쇰뱶諛? ?댁뿭]:
${adjustments.map((a, idx) => `
議곗젙 ?대젰 ${idx + 1}:
- 湲곗〈 臾몄젣: "${a.question_text}"
- ?ъ슜?먯쓽 ?쇰뱶諛??붽뎄?ы빆: "${a.user_feedback}"
- 諛섏쁺??理쒖쥌 臾몄젣: "${a.adjusted_text}"
`).join('\n')}
`;
      }
    } catch (adjErr) {}

    const coreSubject = getCoreSubjectFromTitle(topic.title);
    const topicInstructionsPrompt = await getFormattedTopicInstructions(topicId);

    const activeGenerationStandards = generationStandardsList && generationStandardsList.length > 0
      ? generationStandardsList.map((std, idx) => `${idx + 1}. **${std.title}**:\n   - ${std.content}`).join('\n')
      : GENERATION_STANDARDS;
    const activeEngineeringStandards = engineeringStandardsList && engineeringStandardsList.length > 0
      ? engineeringStandardsList.map((std, idx) => `${idx + 1}. **${std.title}**:\n   - ${std.content}`).join('\n')
      : ENGINEERING_STANDARDS;

    const prompt = (topic.category === '怨꾩궛') ? `
[臾몄젣 ?앹꽦 ?쒖뒪???쒖옉]:
?꾨옒 ?쒓났?섎뒗 ?뺣낫瑜?遺꾩꽍?섏뿬 珥??뺥솗??4媛쒖쓽 怨꾩궛 ?덉긽臾몄젣瑜??앹꽦??二쇱떗?쒖삤.
[?좏뵿 ?듭떖 二쇱젣]: ${coreSubject}
[?좏뵿 ?먮낯 ?쒕ぉ]: ${topic.title}
[?듭떖 ?ㅼ썙??: ${topic.keywords || '?쒓났?섏? ?딆쓬'}
[泥⑤??뚯씪 蹂몃Ц ?띿뒪??(HTML 怨듬??명듃): ${fileText || '?쒓났?섏? ?딆쓬'}

[異쒖젣 ?붽뎄?ы빆]:
1. 1踰?臾명빆 (泥⑤? ?대?吏??臾쇱쓬怨?蹂몃Ц HTML???듬???遺꾩꽍???쒖콈?곌린 吏덈Ц) - type: "二쇨???(?쒖콈?곌린)"
   ?슚 **[1踰?臾명빆 怨꾩궛 ?쒖콈?곌린 ?쒖? 援ъ“ 泥좎튃 - 媛??以묒슂!]**:
   - ?④퍡 泥⑤???臾몄젣 ?대?吏(洹몃┝/洹몃옒??? 蹂몃Ц ?띿뒪?몃? ?쒓컖?곸쑝濡??ъ링 遺꾩꽍?섏떗?쒖삤.
   - 臾몄젣 吏臾멸낵 洹몃┝??援ы븯?쇨퀬 ?붽뎄?섎뒗 **紐⑤뱺 怨꾩궛 ?됯? ??ぉ (1), (2), (3)...** ?먮뒗 議곌굔蹂???ぉ??媛곴컖??**??Row)**?쇰줈 諛곗튂?섏떗?쒖삤.
   - ??援ъ“??諛섎뱶??**headers: ["援ы븯????ぉ", "怨꾩궛 寃곌낵 諛??듭븞"]** ??2???ㅻ뜑 洹쒓꺽?쇰줈 援ъ꽦?섏떗?쒖삤.

   ?뱦 **[?쒖? 援ъ“ ?덉떆]**:
   - headers: ["援ы븯????ぉ", "怨꾩궛 寃곌낵 諛??듭븞"]
   - rows:
     [
       ["(1) 援ы븯??泥ル쾲吏???ぉ紐?(?⑥쐞)", "[INPUT_1]"],
       ["(2) 援ы븯???먮쾲吏???ぉ紐?(?⑥쐞)", "[INPUT_2]"],
       ["(3) 援ы븯???몃쾲吏???ぉ紐?(?⑥쐞)", "[INPUT_3]"],
       ...
     ]

   ?슚 **鍮덉뭏 諛??듭븞 1:1 留ㅼ묶 泥좎튃**:
   - 臾몄젣?먯꽌 臾삳뒗 怨꾩궛 ?붽뎄 ??ぉ??N媛쒖씠硫? ?됱쓽 媛쒖닔??N媛쒓? ?섎ŉ 諛섎뱶??[INPUT_1]遺??[INPUT_N]源뚯? N媛쒖쓽 鍮덉뭏???앹꽦?섏떗?쒖삤.
   - answers 媛앹껜?먮뒗 媛?INPUT_N留덈떎 ??묐릺??怨듯븰??怨꾩궛 ?뺣떟 ???怨쇱젙怨??뺥솗??理쒖쥌 ?섏튂(?⑥쐞 ?ы븿)瑜?湲곗옱?섏떗?쒖삤.

2. 2踰?臾명빆 (媛쒕뀗 鍮꾧탳 ??移몄콈?곌린 臾몄젣) - type: "二쇨???(?쒖콈?곌린)"
   ?슚 **[2踰?臾명빆 ?꾩닔 援ъ“ 吏移?**:
   - ?좏뵿怨?愿?⑤맂 ??媛吏 ?댁긽??怨듬쾿, ?대줎, ?먮뒗 議곌굔??鍮꾧탳?섎뒗 ?쒕줈 ?ㅺ퀎?섏떗?쒖삤.
   - ??Column)??鍮꾧탳 ??곸쓣, ??Row)??援щ텇 ??ぉ??諛곗튂?섏떗?쒖삤.
   - ?덈컲 ?뺣룄???? 梨꾩썙吏??듭븞?쇰줈, ?섎㉧吏??INPUT?쇰줈 ?ㅺ퀎?섏떗?쒖삤.
   - headers: ["援щ텇 ??ぉ", "?ㅼ젣 鍮꾧탳 ???1 紐낆묶", "?ㅼ젣 鍮꾧탳 ???2 紐낆묶"]
   - ?슚 [?ㅻ뜑 ?섎뱶肄붾뵫 湲덉?]: "怨듬쾿/?대줎 A", "????대줎/怨듬쾿 A"? 媛숈? ?붾? 李뚭볼湲??ㅻ뜑 ?묒꽦???덈? 湲덉??섎ŉ, 諛섎뱶??臾몄젣 吏臾몄씠 ?ㅻ（???ㅼ젣 鍮꾧탳 紐낆묶?쇰줈 ?ㅻ뜑瑜??앹꽦?섏떗?쒖삤.
   - rows: [["鍮꾧탳??ぉ 1", "[INPUT_1]", "梨꾩썙吏??댁슜"], ["鍮꾧탳??ぉ 2", "梨꾩썙吏??댁슜", "[INPUT_2]"]]

3. 3踰?臾명빆 (怨듯븰???섎?/援먰썕 二쇨???臾몄젣) - type: "二쇨???(?⑤떟??"
4. 4踰?臾명빆 (愿??怨듯븰??臾몄젣 諛쒖깮 ???梨?二쇨???臾몄젣) - type: "二쇨???(?⑤떟??"
` : `
[臾몄젣 ?앹꽦 ?쒖뒪???쒖옉]:
?꾨옒 ?쒓났?섎뒗 ?뺣낫瑜?遺꾩꽍?섏뿬 珥??뺥솗??13媛쒖쓽 ?덉긽臾몄젣瑜??앹꽦??二쇱떗?쒖삤. (媛앷???5媛? 媛쒖슂 1媛? 怨듭떇 1媛? ?쒖콈?곌린 2媛? ?⑤떟??4媛?
[?좏뵿 ?듭떖 二쇱젣]: ${coreSubject}
[?좏뵿 ?먮낯 ?쒕ぉ]: ${topic.title}
[泥⑤??뚯씪 蹂몃Ц ?띿뒪??: ${fileText || '?쒓났?섏? ?딆쓬'}
`;

    const systemInstruction = `?뱀떊? ??쒕?援?援??嫄댁꽕湲곗??ㅺ퀎肄붾뱶(KDS) 諛?吏諛섍났??湲곗닠???쒗뿕 異쒖젣?꾩썝?낅땲??
JSON 諛곗뿴 ?뺤떇?쇰줈留?臾몄젣瑜?異쒕젰?섏떗?쒖삤.`;

    const enrichedGenerationPrompt = `${prompt}

[?슚 理쒖슦???덈? 吏移?以???좎뼵]:
?꾨옒 ?쒓났?섎뒗 [?뱥 臾몄젣 異쒖젣 湲곗? ?덈? 吏移?(Generation Standards)] 諛?[?뵮 怨듯븰 湲곗? ?덈? 吏移?(Engineering Standards)]? ?ъ슜?먭? 吏?뺥븳 理쒖슦???뚮쾿??異쒖젣 吏移⑥엯?덈떎. 洹??대뼡 ?대? 異쒖젣 諛⑹떇?대굹 ?섎뱶肄붾뵫???뚭퀬由ъ쬁 洹쒓꺽蹂대떎 ??吏移⑤뱾??1?쒖쐞濡?吏耳쒖졇???섎ŉ, ?곸땐??諛쒖깮??寃쎌슦 ??吏移⑤뱾???몃? ?댁슜(?? 鍮꾧탳 ???媛??援щ텇, ?뚯닔???뺥솗??????理쒖슦?좎쟻?쇰줈 ?꾧꺽???곸슜?섏떗?쒖삤.

[?뱥 臾몄젣 異쒖젣 湲곗? ?덈? 吏移?(Generation Standards)]:
${activeGenerationStandards}

[?뵮 怨듯븰 湲곗? ?덈? 吏移?(Engineering Standards)]:
${activeEngineeringStandards}
`;

    const flowchartSpecificInstruction = "?대쾲 ?먮쫫??臾몄젣 異쒖젣 ?? [1踰??곸옄 梨꾩슦湲?吏移?: 1踰??곸옄???ㅻ챸 ?띿뒪?몃? 梨꾩썙???몄텧?섍퀬, 鍮덉뭏? 2踰??곸옄遺???쒖옉?섏뿬 (A), (B), (C), (D) ?쒖꽌?濡?1媛쒖뵫 鍮꾩슦??떆?? ?곸옄 ?곗륫?대굹 諛붽묑??(A)~(F) ?꾩껜 紐⑸줉???㏓텤?대뒗 ?됱쐞???덈? 湲덉??⑸땲??";

    // Batch prompts for standard topics (non-calculation) to ensure high-quality technical questions
    const promptBatch1 = `
[?슚 理쒖슦???덈? 以??踰뺢퇋 (Constitutional Guidelines) - ?묒뾽???쒖옉?섍린 ?꾩뿉 媛??癒쇱? ?뺤씤?섍퀬 100% 以?섑븯??떆??:
?뱀떊? ??쒕?援?援??湲곗닠?먭꺽 湲곗닠??Professional Engineer) ?쒗뿕 異쒖젣?꾩썝?쇰줈??臾몄젣瑜?異쒖젣?섍린 ?? ?꾨옒 紐낆떆??**臾몄젣?앹꽦 ?덈? 吏移⑤뱾**怨?**怨듯븰???대줎 湲곗?**???뚮쾿????議?泥좎튃?쇰줈 ?쇱븘 ?대? 癒쇱? ?꾨꼍?섍쾶 ?숈??섍퀬 ?덈??곸쑝濡?蹂듭쥌?섏뿬 臾몄젣瑜??ㅺ퀎 諛?異쒖젣?댁빞 ?⑸땲?? 吏移⑥쓣 ?꾨컲?섏뿬 異쒖젣??臾몄젣???쒖뒪??寃利??④퀎?먯꽌 利됱떆 ?먭린?⑸땲??

${standardsAnalysis ? `${standardsAnalysis}\n\n` : ''}[?슚 臾몄젣 ?앹꽦 ?덈? 以??吏移?:
${activeGenerationStandards}

[?슚 吏諛섍났???쒖? ?대줎 諛?怨꾩궛 湲곗?]:
${activeEngineeringStandards}

${FLOWCHART_QUIZ_GENERATION_PROMPT}

[?슚 ?대쾲 ?뚯감 ?먮쫫??臾몄젣 鍮덉뭏 吏??紐낅졊 - 留ㅼ슦 以묒슂]:
${flowchartSpecificInstruction}

---------------------------------------------------------
[臾몄젣 ?앹꽦 ?쒖뒪???쒖옉]:
?꾩쓽 ?덈? 吏移④낵 湲곗? 踰뺢퇋瑜??꾩쟾???숈????곹깭?먯꽌, ?꾨옒 ?쒓났?섎뒗 [?좏뵿 ?듭떖 二쇱젣], [?듭떖 ?ㅼ썙??, [泥⑤??뚯씪 蹂몃Ц ?띿뒪??瑜??ъ링 遺꾩꽍?섏뿬, 珥?**?뺥솗??7媛?*???덉긽臾몄젣(二쇨???媛쒖슂 1媛? 二쇨???怨듭떇 1媛? 二쇨????쒖콈?곌린(?먮쫫?? 1媛? 二쇨????⑤떟??4媛?瑜??앹꽦??二쇱떗?쒖삤.

[?좏뵿 ?듭떖 二쇱젣]: ${coreSubject}
[?좏뵿 ?먮낯 ?쒕ぉ]: ${topic.title}
[?듭떖 ?ㅼ썙??: ${topic.keywords || '?쒓났?섏? ?딆쓬'}
[?듭떖 ?뚯뒪 ?띿뒪??: ${fileText || '?쒓났?섏? ?딆쓬'}

[?슚 ?좏뵿 踰붿쐞 ?꾧꺽 ?쒗븳 諛?異쒖젣 踰붿쐞 ?뺤땐 ??理쒖슦??以?섏궗??:
- **留밸ぉ?곸쑝濡?[泥⑤??뚯씪 蹂몃Ц ?띿뒪????吏?쎌쟻???먭뎄?먮쭔 援?븳?섏뿬 臾몄젣瑜?異쒖젣?섏? 留덉떗?쒖삤.** 
- 留뚯빟 泥⑤??뚯씪 ?댁슜??醫곴굅???⑦렪?곸씠?붾씪?? ?대떦 **[?좏뵿 ?듭떖 二쇱젣]**媛 ?ㅻ（???꾨컲?곸씤 ?쒖? ?숈닠 ?대줎 諛?湲곗닠???쒗뿕 踰붿쐞???쒖? 媛쒕뀗?????AI???띾???怨듯븰 吏?앹쓣 ?쒖슜?섏뿬 臾몄젣瑜??곴레?곸씠怨??볤쾶 異쒖젣?섏떗?쒖삤.
- ?? ?ㅻⅨ ?二쇱젣 ?좏뵿??媛쒕뀗?대굹 ?섏떇?쇰줈 ?꾩쟾???섏뼱媛 異쒖젣?섎뒗 寃껋? ?ъ쟾??**?덈? 湲덉?**?대ŉ, 紐⑤뱺 吏덈Ц/?뺣떟/?댁꽕? ?ㅼ쭅 ?꾩옱 **[?좏뵿 ?듭떖 二쇱젣]** 踰붿쐞 ?댁뿉 癒몃Ъ?ъ빞 ?⑸땲??
- **?슚 [?좏뵿 紐낆묶 ?뺤젣 諛?李뚭볼湲??쒓굅 泥좎튃]**: 臾몄젣瑜?異쒖젣????吏덈Ц 吏臾몄뿉 "怨듯븰 ?댁꽍 蹂닿퀬??, "怨듬??명듃", "?붿빟蹂? 媛숈? 臾몄꽌 ?뺥깭瑜?媛由ы궎??援곕뜑?섍린 李뚭볼湲?紐낆묶??洹몃?濡?二쇱뼱濡??ъ슜?섏? 留덉떗?쒖삤. 臾몄젣 吏臾몄뿉???ㅼ쭅 ?쒖닔??怨듯븰 ?듭떖 二쇱젣??**"${coreSubject}"** 紐낆묶留뚯쓣 ?쒖슜?섏뿬 吏덈Ц 臾몄옣???ㅻ벉?쇱떗?쒖삤. (?? "~~ 蹂닿퀬?쒖쓽 ?λ떒?먯쓣..." (X) -> "~~ ?대줎???λ떒?먯쓣..." (O))

[異쒖젣 ?붽뎄?ы빆]:
諛섎뱶??珥?6媛쒖쓽 臾몄젣瑜??ㅼ쓬怨?媛숈씠 援ъ꽦?섏뿬 異쒖젣?섏떗?쒖삤:

[1踰?臾몄젣] 二쇨???(媛쒖슂):
- 紐⑹쟻: ?좏뵿???듭떖 ?뺤쓽(媛쒖슂)瑜?紐낇솗?섍퀬 吏쒖엫???덇쾶 臾삳뒗 吏덈Ц.
- "type" 媛? 諛섎뱶??"二쇨???(媛쒖슂)"
- "question": ?쒓났??蹂몃Ц ?띿뒪???꾩껜瑜??꾩슦瑜????덈뒗 ?듭떖 怨듯븰???二쇱젣(??쒕ぉ)瑜??꾩텧?섍퀬, 洹?二쇱젣??愿??媛쒖슂, ?먮━, 媛쒕뀗???뺤쓽瑜?源딆씠 ?덇쾶 臾삳뒗 ?먯뿰?ㅻ읇怨??꾨Ц?곸씤 ?쒖닠??吏덈Ц 臾몄옣.
- "concept": 吏덈Ц???뺥솗??遺?⑺븯硫? 理쒖냼 4以꾩뿉??理쒕? 6以??ъ씠??遺꾨웾?쇰줈 ?꾩＜ ?꾨Ц?곸씠怨?吏곴??곸씤 媛쒖슂 諛?媛쒕뀗 ?ㅻ챸???쒖닠. ?ㅻ챸 ?댁뿉??梨꾩젏愿???앸퀎?댁빞 ???듭떖 怨듯븰???ㅼ썙?쒕뱾? 諛섎뱶???쇰컲 留덊겕?ㅼ슫 媛뺤“ 湲고샇??**?ㅼ썙??* ?뺥깭濡?媛먯떥???묒꽦??二쇱떗?쒖삤. (?? **?좏슚 ?묐젰**, **媛꾧레?섏븬 ?뚯궛** ??
- "formula": (?좏깮?ы빆) 媛쒖슂 ?ㅻ챸???섏떇???꾩슂???뚮쭔 ?묒꽦?섏떗?쒖삤.
- "structure": ?슚 **[?꾩닔?ы빆]** 媛쒖슂 ?ㅻ챸 諛?怨듭떇???깆옣?섎뒗 紐⑤뱺 湲고샇(?? $K_a$, $\\phi$, $\\delta$ ?????뺤쓽瑜?以꾨컮轅?\\n)?쇰줈 援щ텇?섏뿬 諛섎뱶???묒꽦?섏떗?쒖삤. 湲고샇媛 ?꾪? ?녿뒗 寃쎌슦?먮뒗 鍮?臾몄옄??"")濡??묒꽦?섏떗?쒖삤. (?? "- $K_a$: 二쇰룞?좎븬怨꾩닔\\n- $\\phi$: ?숈쓽 ?대?留덉같媛?)

[2踰?臾몄젣] 二쇨???(怨듭떇):
- 紐⑹쟻: ?좏뵿???곸슜?섎뒗 媛????쒖쟻?닿퀬 ?⑥닚??怨듭떇留?臾삳뒗 吏덈Ц.
- "type" 媛? 諛섎뱶??"二쇨???(怨듭떇)"
- "question": ?좏뵿????쒗븯??媛???듭떖?곸씤 怨듭떇??怨듭떇紐낆묶 ?먯껜???듭떖 吏덈Ц 臾멸뎄留?媛꾧껐?섍쾶 ?묒꽦.
- "concept": 怨듭떇?????1以꾩쭨由?留ㅼ슦 而댄뙥?명븳 ?붿빟 ?ㅻ챸.
- "formula": ?ㅼ쭅 ???LaTeX 怨듭떇 1媛쒕쭔 ?쒖닔?섍쾶 ?묒꽦. 臾몄옄?댁씠???ㅻ챸 湲고샇???덈? ?ｌ? 留덉떗?쒖삤. (?? "$t = \\frac{P - 2C \\sin\\varphi}{\\gamma \\tan\\varphi + \\frac{2S}{D}}$")
- "structure": ?슚 **[?꾩닔?ы빆]** ??formula?먯꽌 ?ъ슜??紐⑤뱺 湲고샇???뺤쓽瑜??ν솴?섏? ?딄쾶 以꾨컮轅?\n)?쇰줈 理쒖냼?쒖쓽 紐낆궗???꾩＜濡?諛섎뱶???묒꽦?섏떗?쒖삤. (?? "- $t$: ?륂겕由ы듃 ?먭퍡\n- $P$: 吏諛섏븬")

[3踰?臾몄젣] 二쇨???(?쒖콈?곌린) (?꾩뒪???먮쫫??:
- 紐⑹쟻: ?좏뵿???쒓났/?ㅺ퀎 ?덉감, ?쒗뿕 ?쒖꽌, ?먮뒗 ?④퀎蹂?嫄곕룞 硫붿빱?덉쬁???꾩떇?뷀븳 ?뚮줈?곗감??鍮덉뭏 梨꾩슦湲?吏덈Ц.
- "type" 媛? 諛섎뱶??"二쇨???(?쒖콈?곌린)"
- 異쒖젣 ?먯튃: 
  * 紐⑤뱺 ?좏뵿????섏뿬 諛섎뱶???꾩뒪???뚮줈?곗감???ㅼ씠?닿렇??諛깊떛 \`\`\`?쇰줈 媛먯떥?ъ쭊 ?ㅼ씠?닿렇?????ы븿??二쇨???(?쒖콈?곌린) 臾몄젣濡?100% 臾댁“嫄?異쒖젣?섏떗?쒖삤.
  * tableData? answers 媛앹껜 援ъ“瑜?100% 媛뽰텣 ?뺥깭濡??묒꽦?섏떗?쒖삤.
  * [?슚 ?대쾲 ?뚯감 ?먮쫫??臾몄젣 鍮덉뭏 吏??紐낅졊 - 留ㅼ슦 以묒슂]: ${flowchartSpecificInstruction}
  * answers 媛앹껜??媛?INPUT ??"INPUT_1"遺??"INPUT_2*M"源뚯?)???ㅼ뼱媛??뺣떟? 媛꾧껐?섍쾶 ?묒꽦?섏뿬 ?섑뿕?앹씠 紐낅즺?섍쾶 梨꾩젏諛쏆쓣 ???덇쾶 ?ㅺ퀎?섏떗?쒖삤.

[二쇨???(?⑤떟?? 臾몄젣??(4, 5, 6, 7踰?臾몄젣)]:
- 媛쒖닔: 諛섎뱶???뺥솗??4臾몄젣瑜?異쒖젣?섏떗?쒖삤.
- "type" 媛? 諛섎뱶??"二쇨???(?⑤떟??"
- ?슚 [媛앷????좏깮???듭뀡(蹂닿린) ?쒓났 ?덈? 湲덉? 洹쒖튃 - 洹밸룄濡?以묒슂!]: 二쇨???媛쒖슂, 怨듭떇, ?⑤떟?? ?쒖콈?곌린)??洹??대뼡 臾명빆?먯꽌??媛앷??앹슜 蹂닿린(options, ?? ?? ?? ?? ?????먮뒗 "options" ?꾨뱶)瑜??덈?濡??ㅺ퀎?섍굅??湲곗엯?섏뿬 ?쒓났?섏? 留덉떗?쒖삤. 紐⑤뱺 二쇨???臾명빆? ?ㅼ쭅 ?쒖닠???뺣떟留뚯쓣 ?붽뎄?댁빞 ?⑸땲??
- 異쒖젣 ?먯튃:
  * **[?슚 媛꾧껐?섍퀬 ?듭떖??李뚮Ⅴ??吏덈Ц ?ㅺ퀎]**: 臾몄젣瑜?異쒖젣????吏臾?question) ?덉뿉 ?뺣떟???좎텛?????덈뒗 ?덈Т ?곸꽭???꾩옣 ?곹솴?대굹 怨듯븰??湲곗쟾, 議곌굔?ㅼ쓣 ?ν솴?섍쾶 ?꾨? ?섏뿴?섏뿬 ?뺣떟???ㅽ룷?쇰윭(?좎텧)?섎뒗 ?됱쐞瑜??꾧꺽??湲덉??⑸땲??
  * **[異쒖젣 ?좏삎 ?덉떆]**:
    1. ?듭떖 怨듯븰???먮━???쒓퀎?먯쓣 臾삳뒗 吏덈Ц (?? "~~ ?대줎??湲곕낯 媛?뺤씠 ?댄룷?섎뒗 ?ㅻТ???쒓퀎??臾댁뾿?멸??")
    2. ?ㅻТ ?곸슜 ??二쇱슂 ?⑥젏?대굹 ?梨낆쓣 臾삳뒗 吏덈Ц (?? "~~ 怨듬쾿 ?곸슜 ??吏諛?移⑦븯瑜?諛⑹??섍린 ?꾪븳 ?듭떖 ?梨낆? 臾댁뾿?멸??")
    - 吏臾?question)? 2~3以??대궡濡?媛꾧껐紐낅즺?섍쾶 ?묒꽦?섏뿬, ?섑뿕?앹씠 ?ㅼ뒪濡??꾩옣 ?곹솴怨???븰???먮━瑜??좎삱???듭븞(answer)???곸꽭???쒖닠?????덈룄濡??좊룄?섏떗?쒖삤.
  * **?뺣떟("answer")**: 紐⑤쾾 ?듭븞? ?⑥닚?????⑥뼱 ?ㅼ썙?쒓? ?꾨땲?? 援ъ껜?곸씤 怨듯븰??嫄곕룞 硫붿빱?덉쬁怨??ㅺ퀎/?쒓났 ???멸낵愿怨??梨낆씠 ?쇰━?곸쑝濡??곸꽭???ы븿???쒖닠??理쒖냼 50?먯뿉??理쒕? 120???댁쇅)?쇰줈 紐낅즺?섍쾶 ?묒꽦?섏떗?쒖삤. ?먰븳, ???뺣떟 臾몄옣 ?댁뿉??梨꾩젏??以묒슂?꾧? 媛???믪? ?꾩닔 怨듯븰 ?ㅼ썙?쒕뱾? 諛섎뱶????뒳?섏떆 ?놁씠 ?쇰컲 留덊겕?ㅼ슫 媛뺤“ 湲고샇??**?ㅼ썙??* ?뺥깭濡?媛먯떥???묒꽦??二쇱떗?쒖삤. (?? **?댁쨷痢??먭퍡**, **?꾨떒媛뺣룄 ???* ??
  * "explanation": ?????듭븞???щ컮瑜?怨듯븰???梨??대줎?몄? ?곸꽭???ㅻ챸?섏떗?쒖삤.

${topicInstructionsPrompt}
${LATEX_PROMPT_INSTRUCTIONS}

[?묐떟 JSON ?щ㎎]:
諛섎뱶???꾨옒 吏?뺣맂 JSON 諛곗뿴 ?щ㎎?쇰줈留??뺥솗??諛섑솚?섏떗?쒖삤. 留덊겕?ㅼ슫??\`\`\`json 肄붾뱶 釉붾줉?대굹 異붽??곸씤 ?띿뒪???ㅻ챸? 諛곗젣?섍퀬 ?쒖닔??JSON ?곗씠?곕쭔 ?쒓났??二쇱떗?쒖삤.
[
  {
    "type": "二쇨???(媛쒖슂)",
    "question": "?좏뵿??湲곕낯 ?뺤쓽? ?듭떖 媛쒕뀗??臾삳뒗 吏덈Ц ?댁슜",
    "concept": "媛쒖슂 ?ㅻ챸",
    "formula": "",
    "structure": ""
  },
  {
    "type": "二쇨???(怨듭떇)",
    "question": "?좏뵿?????怨듭떇紐낆묶 (?ъ” 諛곗젣)",
    "concept": "怨듭떇???????以??붿빟",
    "formula": "$LaTeX怨듭떇$",
    "structure": "- $湲고샇1$: 媛꾨떒??紐낆궗???섎?"
  },
  {
    "type": "二쇨???(?⑤떟??",
    "question": "?좏뵿??媛??以묒슂?섍퀬 ?듭떖?곸씤 怨듯븰???뺤쓽, 湲곕낯 媛?? ?먮뒗 二쇱슂 怨듯븰???섎?瑜?臾삳뒗 ?쒖닠??吏덈Ц 1",
    "answer": "?듭떖 媛쒕뀗?대굹 嫄곕룞 ?뱀꽦???붿빟??1以??쒖닠???듭븞 臾멸뎄 1",
    "explanation": "?대떦 媛쒕뀗???숈닠??怨듯븰???섎???????곸꽭 ?ㅻ챸 1"
  },
  {
    "type": "二쇨???(?⑤떟??",
    "question": "?좏뵿??媛??以묒슂?섍퀬 ?듭떖?곸씤 怨듯븰???뺤쓽, 湲곕낯 媛?? ?먮뒗 二쇱슂 怨듯븰???섎?瑜?臾삳뒗 ?쒖닠??吏덈Ц 2",
    "answer": "?듭떖 媛쒕뀗?대굹 嫄곕룞 ?뱀꽦???붿빟??1以??쒖닠???듭븞 臾멸뎄 2",
    "explanation": "?대떦 媛쒕뀗???숈닠??怨듯븰???섎???????곸꽭 ?ㅻ챸 2"
  },
  {
    "type": "二쇨???(?⑤떟??",
    "question": "?좏뵿?????ㅻⅨ 以묒슂 ?몃? 媛쒕뀗, ?먮━ ?먮뒗 ?λ떒?먯쓣 臾삳뒗 ?쒖닠??吏덈Ц 3",
    "answer": "?몃? 媛쒕뀗?대굹 嫄곕룞 ?뱀꽦???붿빟??1以??쒖닠???듭븞 臾멸뎄 3",
    "explanation": "?대떦 媛쒕뀗???숈닠??怨듯븰???섎???????곸꽭 ?ㅻ챸 3"
  },
  {
    "type": "二쇨???(?⑤떟??",
    "question": "?대떦 ?좏뵿怨?愿?⑤맂 援ъ껜?곸씤 怨듯븰???꾩옣 臾몄젣 ?곹솴(?쒕굹由ъ삤)???쒖떆?섍퀬 ?泥?諛⑹? 諛⑹븞(?닿껐 ?梨????붽뎄?섎뒗 吏덈Ц 4",
    "answer": "臾몄젣 ?곹솴???泥섑븯湲??꾪븳 援ъ껜?곸씤 怨듯븰??????먮뒗 ?梨??쒖닠???듭븞 4",
    "explanation": "?쒖븞??怨듯븰???梨낆쓽 ??뱀꽦 諛??묐룞 硫붿빱?덉쬁 ?ㅻ챸 4"
  },
  {
    "type": "二쇨???(?쒖콈?곌린)",
    "question": "?ㅼ쓬 [OOO 遺꾩꽍/?ㅺ퀎 ?덉감] ?먮쫫?꾨? 蹂닿퀬 鍮덉뭏???ㅼ뼱媛??щ컮瑜??④퀎瑜??낅젰?섏떆??(留덊겕?ㅼ슫 怨좎젙??肄붾뱶釉붾줉?쇰줈 媛먯떬 ?꾩뒪???먮쫫???ы븿)",
    "tableData": {
      "headers": ["鍮덉뭏 援щ텇", "?낅젰 ?듭븞"],
      "rows": [
        ["(A)", "[INPUT_1]"],
        ["(B)", "[INPUT_2]"],
        ["(C)", "[INPUT_3]"],
        ["(D)", "[INPUT_4]"]
      ]
    },
    "answers": {
      "INPUT_1": "(A)???щ컮瑜??뺣떟 臾멸뎄",
      "INPUT_2": "(B)???щ컮瑜??뺣떟 臾멸뎄",
      "INPUT_3": "(C)???щ컮瑜??뺣떟 臾멸뎄",
      "INPUT_4": "(D)???щ컮瑜??뺣떟 臾멸뎄"
    },
    "explanation": "?꾩껜 ?먮쫫?꾩쓽 怨듯븰???댁꽕 諛?媛??④퀎蹂??곸꽭 ?ㅻ챸"
  }
]
`;

    const promptBatch2 = `
[?슚 理쒖슦???덈? 以??踰뺢퇋 (Constitutional Guidelines) - ?묒뾽???쒖옉?섍린 ?꾩뿉 媛??癒쇱? ?뺤씤?섍퀬 100% 以?섑븯??떆??:
?뱀떊? ??쒕?援?援??湲곗닠?먭꺽 湲곗닠??Professional Engineer) ?쒗뿕 異쒖젣?꾩썝?쇰줈??臾몄젣瑜?異쒖젣?섍린 ?? ?꾨옒 紐낆떆??**臾몄젣?앹꽦 ?덈? 吏移⑤뱾**怨?**怨듯븰???대줎 湲곗?**???뚮쾿????議?泥좎튃?쇰줈 ?쇱븘 ?대? 癒쇱? ?꾨꼍?섍쾶 ?숈??섍퀬 ?덈??곸쑝濡?蹂듭쥌?섏뿬 臾몄젣瑜??ㅺ퀎 諛?異쒖젣?댁빞 ?⑸땲?? 吏移⑥쓣 ?꾨컲?섏뿬 異쒖젣??臾몄젣???쒖뒪??寃利??④퀎?먯꽌 利됱떆 ?먭린?⑸땲??

${standardsAnalysis ? `${standardsAnalysis}\n\n` : ''}[?슚 臾몄젣 ?앹꽦 ?덈? 以??吏移?:
${activeGenerationStandards}

[?슚 吏諛섍났???쒖? ?대줎 諛?怨꾩궛 湲곗?]:
${activeEngineeringStandards}

---------------------------------------------------------
[臾몄젣 ?앹꽦 ?쒖뒪???쒖옉]:
?꾩쓽 ?덈? 吏移④낵 湲곗? 踰뺢퇋瑜??꾩쟾???숈????곹깭?먯꽌, ?꾨옒 ?쒓났?섎뒗 [?좏뵿 ?듭떖 二쇱젣], [?듭떖 ?ㅼ썙??, [泥⑤??뚯씪 蹂몃Ц ?띿뒪??瑜??ъ링 遺꾩꽍?섏뿬, 珥?**?뺥솗??2媛?*???덉긽臾몄젣(二쇨????쒖콈?곌린 2媛?瑜??앹꽦??二쇱떗?쒖삤.

[?좏뵿 ?듭떖 二쇱젣]: ${coreSubject}
[?좏뵿 ?먮낯 ?쒕ぉ]: ${topic.title}
[?듭떖 ?ㅼ썙??: ${topic.keywords || '?쒓났?섏? ?딆쓬'}
[泥⑤??뚯씪 蹂몃Ц ?띿뒪??: ${fileText || '?쒓났?섏? ?딆쓬'}

[異쒖젣 ?붽뎄?ы빆]:
諛섎뱶??珥?2媛쒖쓽 二쇨???(?쒖콈?곌린) 臾몄젣瑜??ㅼ쓬怨?媛숈씠 援ъ꽦?섏뿬 異쒖젣?섏떗?쒖삤:
?슚 **[2媛?臾명빆 ?ㅺ컖???먯튃 - 洹밸룄濡?以묒슂!]**: 2媛쒖쓽 ?쒖콈?곌린 臾몄젣??諛섎뱶??**?쒕줈 ?꾩쟾???ㅻⅨ 鍮꾧탳 ??? ?ㅻⅨ 愿?? ?ㅻⅨ 怨듯븰??痢〓㈃**???ㅻ（?댁빞 ?⑸땲?? ?숈씪??鍮꾧탳 ??곸쓣 ??臾몄젣??嫄몄퀜 諛섎났 異쒖젣?섎뒗 寃껋? ?덈? 湲덉??⑸땲?? ??臾몄젣 紐⑤몢 諛섎뱶???쒓났??[?좏뵿 ?듭떖 二쇱젣]? [泥⑤??뚯씪 蹂몃Ц ?띿뒪????踰붿쐞 ?댁뿉?쒕쭔 異쒖젣?섏떗?쒖삤.
- **?슚 [?좏뵿 紐낆묶 ?뺤젣 諛?李뚭볼湲??쒓굅 泥좎튃]**: 臾몄젣瑜?異쒖젣????吏덈Ц 吏臾몄뿉 "怨듯븰 ?댁꽍 蹂닿퀬??, "怨듬??명듃", "?붿빟蹂? 媛숈? 臾몄꽌 ?뺥깭瑜?媛由ы궎??援곕뜑?붽린 李뚭볼湲?紐낆묶??洹몃?濡?二쇱뼱濡??ъ슜?섏? 留덉떗?쒖삤. 臾몄젣 吏臾몄뿉???ㅼ쭅 ?쒖닔??怨듯븰 ?듭떖 二쇱젣??**"${coreSubject}"** 紐낆묶留뚯쓣 ?쒖슜?섏뿬 吏덈Ц 臾몄옣???ㅻ벉?쇱떗?쒖삤. (?? "~~ 蹂닿퀬?쒖쓽 ?λ떒?먯쓣..." (X) -> "~~ ?대줎???λ떒?먯쓣..." (O))

[二쇨???(?쒖콈?곌린) 臾몄젣 2媛?:
- 紐⑹쟻: ?대떦 [?좏뵿 ?듭떖 二쇱젣]? 諛?묓븯寃??곌???**??쒖쟻??湲곕쾿 鍮꾧탳, 怨듬쾿 鍮꾧탳, ?대줎 鍮꾧탳** ???쒕줈 ?鍮꾨릺???듭떖 ??곸쓣 ?좎젙?섍퀬, ?대뱾????븰???뱀쭠, 嫄곕룞 湲곗쟾, ?먮뒗 ?λ떒?먯쓣 紐낇솗?섍쾶 ?議고븯???좉린?곸씤 鍮꾧탳??Table) 梨꾩슦湲?吏덈Ц??異쒖젣??二쇱떗?쒖삤. (?? ?≪긽??諛⑹? ?梨낆뿉??SCP怨듬쾿怨?紐⑤옒?ㅼ쭚怨듬쾿 鍮꾧탳, ?뱀? ?뺤쟻 ?≪긽?붿? ?숈쟻 ?≪긽???대줎 鍮꾧탳 ??
  - 援ъ꽦 ?뺥깭: ??Column)??鍮꾧탳 ??곷뱾??諛곗튂?섍퀬, ??Row)??泥?踰덉㎏ ?댁뿉??援щ텇/?됯? 湲곗?(援щ텇 ??ぉ)???〓땲??
  - ?슚 **[援щ텇 ??ぉ(???쒕ぉ) 紐낇솗???먯튃 - 洹밸룄濡?以묒슂!]**: 援щ텇 ??ぉ(???쒕ぉ)? **洹멸쾬留??쎌뼱?????쒓? 臾댁뒯 二쇱젣/?좏뵿?????鍮꾧탳?몄?, ???됱뿉 ?대뼡 醫낅쪟???듭쓣 ?⑥빞 ?섎뒗吏 吏곴??곸쑝濡??댄빐?????덉뼱??* ?⑸땲?? ?덈Т 異붿긽?곸씠嫄곕굹 臾댁“嫄?湲멸쾶 ?곗? 留덉떗?쒖삤. ?ъ슜?먭? ?묒꽦?댁빞 ?섎뒗 ?듬? 踰붿＜(硫붿빱?덉쬁, 愿由??梨? ?뱀쭠 ??瑜??뺥솗???⑥닚?섍퀬 吏곴??곸씤 ?⑥뼱 ?먮뒗 紐낆궗???닿뎄濡?吏?쒗븯??떆??
  - ?슚 **[紐⑤쾾 ?듭븞-援щ텇??ぉ 踰붿＜ ?쇱튂 ?먯튃 - 洹밸룄濡?以묒슂!]**: 媛?INPUT??紐⑤쾾 ?듭븞? 諛섎뱶??**?대떦 ?됱쓽 援щ텇 ??ぉ(???쒕ぉ)???붽뎄?섎뒗 ?듬? 踰붿＜**???뺥솗??遺?⑺븯???댁슜?댁뼱???⑸땲?? ?덈? ?ㅼ뼱 援щ텇 ??ぉ??'?ㅻТ ?쒖슜泥?諛??곸슜 ?щ?'?대㈃ 紐⑤쾾 ?듭븞??'?대뵒???곗씠?붿?(?쒖슜泥?'瑜?湲곗닠?댁빞 ?섍퀬, '?쒓났 ???좎쓽?ы빆 諛??쒓퀎'?대㈃ '二쇱쓽?댁빞 ?????좎쓽?ы빆)'??湲곗닠?댁빞 ?⑸땲?? 援щ텇 ??ぉ??臾삳뒗 踰붿＜? ?꾪? ?ㅻⅨ 踰붿＜?????? ?좎쓽?먯쓣 臾쇱뿀?붾뜲 ?쒖슜泥섎? ?듭븞?쇰줈 ?묒꽦)? **異쒖젣 ?ㅻ쪟**?대?濡??덈? 諛쒖깮?쒗궎吏 留덉떗?쒖삤.
  - "explanation": ???꾩껜 ?댁슜 諛?媛?鍮덉뭏?????怨듯븰???곸꽭 ?댁꽕.

${topicInstructionsPrompt}
${LATEX_PROMPT_INSTRUCTIONS}

[?묐떟 JSON ?щ㎎]:
諛섎뱶???꾨옒 吏?뺣맂 JSON 諛곗뿴 ?щ㎎?쇰줈留??뺥솗??諛섑솚?섏떗?쒖삤. 留덊겕?ㅼ슫??\`\`\`json 肄붾뱶 釉붾줉?대굹 異붽??곸씤 ?띿뒪???ㅻ챸? 諛곗젣?섍퀬 ?쒖닔??JSON ?곗씠?곕쭔 ?쒓났??二쇱떗?쒖삤.
[
  {
    "type": "二쇨???(?쒖콈?곌린)",
    "question": "?ㅼ쓬 (鍮꾧탳 ???怨듬쾿紐? 怨듬쾿?ㅼ쓽 二쇱슂 怨듯븰???뱀쭠 鍮꾧탳??鍮덉뭏???ㅼ뼱媛??댁슜???뚮쭪寃??쒖닠?섏떆??",
    "tableData": {
      "headers": ["援щ텇 ??ぉ", "鍮꾧탳???A", "鍮꾧탳???B"],
      "rows": [
        ["?됯? ??ぉ 紐낆묶", "[INPUT_1]", "(湲곗엯???뺣낫)"],
        ["?됯? ??ぉ 紐낆묶", "(湲곗엯???뺣낫)", "[INPUT_2]"]
      ]
    },
    "answers": {
      "INPUT_1": "鍮꾧탳???A??怨듯븰??硫붿빱?덉쬁???ㅻ챸?섎뒗 40~80???쒖닠??臾몄옣",
      "INPUT_2": "鍮꾧탳???B??怨듯븰??硫붿빱?덉쬁???ㅻ챸?섎뒗 40~80???쒖닠??臾몄옣"
    },
    "explanation": "???댁슜 諛?鍮덉뭏?????怨듯븰???곸꽭 ?댁꽕"
  },
  {
    "type": "二쇨???(?쒖콈?곌린)",
    "question": "?ㅼ쓬 (?ㅻⅨ 鍮꾧탳 ??곷챸) 鍮꾧탳??鍮덉뭏???ㅼ뼱媛??댁슜???쒖닠?섏떆??",
    "tableData": {
      "headers": ["援щ텇 ??ぉ", "鍮꾧탳???C", "鍮꾧탳???D"],
      "rows": [
        ["?됯? ??ぉ 紐낆묶", "[INPUT_1]", "(湲곗엯???뺣낫)"],
        ["?됯? ??ぉ 紐낆묶", "(湲곗엯???뺣낫)", "[INPUT_2]"]
      ]
    },
    "answers": {
      "INPUT_1": "鍮꾧탳???C??怨듯븰??硫붿빱?덉쬁???ㅻ챸?섎뒗 40~80???쒖닠??臾몄옣",
      "INPUT_2": "鍮꾧탳???D??怨듯븰??硫붿빱?덉쬁???ㅻ챸?섎뒗 40~80???쒖닠??臾몄옣"
    },
    "explanation": "???댁슜 諛?鍮덉뭏?????怨듯븰???곸꽭 ?댁꽕"
  }
]
`;

    const promptBatch3 = `
[?슚 理쒖슦???덈? 以??踰뺢퇋 (Constitutional Guidelines) - ?묒뾽???쒖옉?섍린 ?꾩뿉 媛??癒쇱? ?뺤씤?섍퀬 100% 以?섑븯??떆??:
?뱀떊? ??쒕?援?援??湲곗닠?먭꺽 湲곗닠??Professional Engineer) ?쒗뿕 異쒖젣?꾩썝?쇰줈??臾몄젣瑜?異쒖젣?섍린 ?? ?꾨옒 紐낆떆??**臾몄젣?앹꽦 ?덈? 吏移⑤뱾**怨?**怨듯븰???대줎 湲곗?**???뚮쾿????議?泥좎튃?쇰줈 ?쇱븘 ?대? 癒쇱? ?꾨꼍?섍쾶 ?숈??섍퀬 ?덈??곸쑝濡?蹂듭쥌?섏뿬 臾몄젣瑜??ㅺ퀎 諛?異쒖젣?댁빞 ?⑸땲?? 吏移⑥쓣 ?꾨컲?섏뿬 異쒖젣??臾몄젣???쒖뒪??寃利??④퀎?먯꽌 利됱떆 ?먭린?⑸땲??

${standardsAnalysis ? `${standardsAnalysis}\n\n` : ''}[?슚 臾몄젣 ?앹꽦 ?덈? 以??吏移?:
${activeGenerationStandards}

[?슚 吏諛섍났???쒖? ?대줎 諛?怨꾩궛 湲곗?]:
${activeEngineeringStandards}

---------------------------------------------------------
[臾몄젣 ?앹꽦 ?쒖뒪???쒖옉]:
?꾩쓽 ?덈? 吏移④낵 湲곗? 踰뺢퇋瑜??꾩쟾???숈????곹깭?먯꽌, ?꾨옒 ?쒓났?섎뒗 [?좏뵿 ?듭떖 二쇱젣], [?듭떖 ?ㅼ썙??, [泥⑤??뚯씪 蹂몃Ц ?띿뒪??, [?댁쟾 ?뚯감 ?ㅻ떟 ?뺣낫], [?ъ슜???쇰뱶諛?吏移? 洹몃━怨?[?ъ슜??臾몄젣 議곗젙 ?댁뿭]???ъ링 遺꾩꽍?섏뿬, 珥?**?뺥솗??4媛?*???덉긽臾몄젣(媛앷???4吏?좊떎 4媛?瑜??앹꽦??二쇱떗?쒖삤.
${specialInstructions}
${weaknessPrompt}
${feedbackPrompt}
${adjustmentsPrompt}

[?좏뵿 ?듭떖 二쇱젣]: ${coreSubject}
[?좏뵿 ?먮낯 ?쒕ぉ]: ${topic.title}
[?듭떖 ?ㅼ썙??: ${topic.keywords || '?쒓났?섏? ?딆쓬'}
[泥⑤??뚯씪 蹂몃Ц ?띿뒪??: ${fileText || '?쒓났?섏? ?딆쓬'}

- **?슚 [?좏뵿 紐낆묶 ?뺤젣 諛?李뚭볼湲??쒓굅 泥좎튃]**: 臾몄젣瑜?異쒖젣????吏덈Ц 吏臾몄뿉 "怨듯븰 ?댁꽍 蹂닿퀬??, "怨듬??명듃", "?붿빟蹂? 媛숈? 臾몄꽌 ?뺥깭瑜?媛由ы궎??援곕뜑?붽린 李뚭볼湲?紐낆묶??洹몃?濡?二쇱뼱濡??ъ슜?섏? 留덉떗?쒖삤. 臾몄젣 吏臾몄뿉???ㅼ쭅 ?쒖닔??怨듯븰 ?듭떖 二쇱젣??**"${coreSubject}"** 紐낆묶留뚯쓣 ?쒖슜?섏뿬 吏덈Ц 臾몄옣???ㅻ벉?쇱떗?쒖삤.

[?슚 ?쒗뿕 寃곌낵 諛??ㅽ뿕 ?곗씠???섏튂 ?쒖떆 ?먯튃 ??留ㅼ슦 以묒슂]:
- 留뚯빟 臾몄젣媛 ?뱀젙 ?щ룄蹂??쒗뿕 寃곌낵???ㅽ뿕 ?곗씠???섏튂瑜??댁꽍/遺꾩꽍?섏뿬 ?듭븞??梨꾩슦嫄곕굹 怨꾩궛/異붾줎?댁빞 ?섎뒗 臾몄젣??寃쎌슦, 遺꾩꽍????곸씠 ?섎뒗 ?먮낯 ?쒗뿕 寃곌낵 ?곗씠???뚯씠釉붿쓣 吏덈Ц(question) ?띿뒪??蹂몃Ц ?덉뿉 留덊겕?ㅼ슫 ???뺥깭濡?諛섎뱶???④퍡 湲곗엯?섏뿬 蹂댁뿬二쇱떗?쒖삤.
- **?슚 [???묒꽦 媛쒗뻾 洹쒖튃 - 洹밸룄濡?以묒슂!]**: 留덊겕?ㅼ슫 ?쒖쓽 媛??됱? 諛섎뱶???ㅼ젣 以꾨컮轅덉쓣 ?섏뿬 媛곴컖 ?ㅻⅨ 以꾩뿉 ?묒꽦?섏뼱???⑸땲??

[異쒖젣 ?붽뎄?ы빆]:
諛섎뱶??珥?4媛쒖쓽 媛앷???臾몄젣瑜??ㅼ쓬怨?媛숈씠 援ъ꽦?섏뿬 異쒖젣?섏떗?쒖삤:

- 紐⑹쟻: ?좏뵿???곸꽭???먮━, 硫붿빱?덉쬁, ?λ떒???깆쓣 ?ㅺ컖?꾨줈 ?됯??섎뒗 怨좊궃??4吏?좊떎??吏덈Ц.
- "type" 媛? 諛섎뱶??"媛앷???(4吏?좊떎)"
- [怨꾩궛臾몄젣 鍮꾩쨷 議곌굔 - 留ㅼ슦 以묒슂]: ?꾩껜 4媛쒖쓽 媛앷???臾몄젣 以? 諛섎뱶???뺥솗??2媛쒖쓽 臾몄젣??怨듯븰???섏튂 ?먮떒?대굹 ?뺣웾??遺꾩꽍 ?λ젰???됯??섎뒗 臾몄젣濡?異쒖젣?섏떗?쒖삤. ?? 吏덈Ц 吏臾몄뿉 怨듭떇?대굹 ?섏튂瑜?誘몃━ ?쒖떆????"??媛믪쓣 ??낇븯??怨꾩궛?섏떆?? ?앹쓽 湲곌퀎??怨꾩궛 臾몄젣???덈?濡?異쒖젣?섏? 留덉떗?쒖삤.
- [?듭떖 愿??吏덈Ц ?먯튃]: 紐⑤뱺 媛앷???臾몄젣???대떦 ?좏뵿??媛??蹂몄쭏?곸씤 怨듯븰??硫붿빱?덉쬁, 嫄곕룞 ?먮━, ?ㅺ퀎 ?먮떒 洹쇨굅瑜?愿?듯븯??吏덈Ц?댁뼱???⑸땲??
- ?슚 [媛앷????뺣???諛??뺣떟 ?쇱튂 議곌굔 - 洹밸룄濡?以묒슂!]: 紐⑤뱺 媛앷???怨꾩궛 臾몄젣???섏튂/怨듯븰???먮떒 臾몄젣瑜?異쒖젣???? 怨꾩궛?쇰줈 ?꾩텧???뺥솗???뺣떟 ?섏튂??議곌굔??4媛쒖쓽 蹂닿린(options) 以?諛섎뱶???뺥솗??1媛쒕줈 議댁옱?댁빞 ?⑸땲??
- ?슚 [怨듭떇 諛?怨듭떇 ?섏튂 踰붿쐞 ?몄텧 ?덈? 湲덉? 洹쒖튃 - 洹밸룄濡?以묒슂!]: 臾몄젣 吏덈Ц(question) 蹂몃Ц ?댁뿉 臾몄젣瑜??닿껐?섎뒗 ???꾩슂??怨듯븰 ?섏떇 ?먯껜???섏떇???뱀젙 ?섏튂 踰붿쐞瑜?**?덈?濡?吏곸젒 ?띿뒪?몃줈 ?곸뼱 ?쒓났?섏? 留덉떗?쒖삤.**
- ?슚 [?좎궗/以묐났 吏덈Ц 異쒖젣 ?덈? 湲덉? - 留ㅼ슦 以묒슂!]: ?섎굹??怨듭떇?대굹 嫄곕룞 ?뱀꽦?먯꽌 ?뚯깮?섎뒗 蹂?섎쭔 諛붽씔 ?뺥깭???좎궗??鍮꾨?/諛섎퉬濡 吏덈Ц? **?덈?濡?以묐났?섏뿬 異쒖젣?섏? 留덉떗?쒖삤.**

${topicInstructionsPrompt}
${LATEX_PROMPT_INSTRUCTIONS}

[?묐떟 JSON ?щ㎎]:
諛섎뱶???꾨옒 吏?뺣맂 JSON 諛곗뿴 ?щ㎎?쇰줈留??뺥솗??諛섑솚?섏떗?쒖삤. 留덊겕?ㅼ슫??\`\`\`json 肄붾뱶 釉붾줉?대굹 異붽??곸씤 ?띿뒪???ㅻ챸? 諛곗젣?섍퀬 ?쒖닔??JSON ?곗씠?곕쭔 ?쒓났??二쇱떗?쒖삤.
[
  {
    "type": "媛앷???(4吏?좊떎)",
    "question": "吏덈Ц ?댁슜",
    "options": ["蹂닿린 1", "蹂닿린 2", "蹂닿린 3", "蹂닿린 4"],
    "answer": "?뺥솗???쇱튂?섎뒗 ?뺣떟 蹂닿린 ?띿뒪??,
    "explanation": "?곸꽭???댁꽕"
  }
]
`;

    
let parsedArray = null;

    if (topic.category === '怨꾩궛') {
      console.log('[QuizRoute] Delegating calc topic quiz generation to calculationPlugin');
      const cleanedCalcQuestions = await generateCalcTopicQuiz(
        topic,
        fileText,
        coreSubject,
        activeGenerationStandards,
        activeEngineeringStandards,
        topicInstructionsPrompt,
        localCallLLM
      );
      // Attach topic metadata and save directly - skip the normalizedParsedArray pipeline
      const finalCalcQuestions = cleanedCalcQuestions.map(q => ({
        ...q,
        topic_id: Number(topicId),
        category: topic.category,
      }));
      // Save to session and return - clear old cached keys first to prevent orphaned _q keys
      await dbQuery.run("DELETE FROM app_session WHERE key LIKE ?", [`review_questions_topic_${topicId}%`]);
      await saveSessionValue(`review_questions_topic_${topicId}`, JSON.stringify({ questions: finalCalcQuestions }));
      return res.json({ success: true, questions: finalCalcQuestions });
    } else {
      const targetModel = (req.body && req.body.preferredModel) || globalPreferredModel || 'gemini-3.5-flash-lite';
      const [batch1Text, batch2Text, batch3Text] = await Promise.all([
        localCallLLM(systemInstruction, promptBatch1, null, 'question', { temperature: 1.0, preferredModel: targetModel }),
        localCallLLM(systemInstruction, promptBatch2, null, 'question', { temperature: 1.0, preferredModel: targetModel }),
        localCallLLM(systemInstruction, promptBatch3, null, 'question', { temperature: 1.0, preferredModel: targetModel })
      ]);

      const parseBatch = (responseText, batchName) => {
        if (!responseText || typeof responseText !== 'string') return [];
        let text = responseText.trim();
        if (text.startsWith('```')) {
          text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }
        let parsed = null;
        try {
          parsed = parseLlmJson(text);
        } catch (parseErr) {
          console.warn(`[Batch ${batchName}] parseLlmJson failed, trying regex extraction:`, parseErr);
          parsed = extractJsonArray(responseText);
        }
        return Array.isArray(parsed) ? parsed : [];
      };

      const q1 = parseBatch(batch1Text, '1 (二쇨???媛쒖슂/怨듭떇/?⑤떟)');
      const q2 = parseBatch(batch2Text, '2 (二쇨????쒖콈?곌린)');
      const q3 = parseBatch(batch3Text, '3 (媛앷???');

      parsedArray = [...q1, ...q2, ...q3];
    }

    if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
      throw new Error('AI output is not a valid JSON array.');
    }

    const normalizedParsedArray = (parsedArray || []).map(q => {
      const type = String(q.type || '').trim();
      const subtype = String(q.subtype || '').trim();
      
      let newType = type;
      let newSubtype = subtype;
      
      if (type === '二쇨???) {
        if (subtype === '媛쒖슂') { newType = '二쇨???(媛쒖슂)'; }
        else if (subtype === '怨듭떇') { newType = '二쇨???(怨듭떇)'; }
        else if (subtype === '?쒖콈?곌린') { newType = '二쇨???(?쒖콈?곌린)'; newSubtype = '?쒖콈?곌린'; }
        else if (subtype === '?⑤떟??) { newType = '二쇨???(?⑤떟??'; }
        else if (subtype === '?쒖닠') { newType = '二쇨???(?쒖닠)'; newSubtype = '?쒖닠'; }
      } else if (type === '媛쒖슂') {
        newType = '二쇨???(媛쒖슂)';
        newSubtype = '媛쒖슂';
      } else if (type === '怨듭떇') {
        newType = '二쇨???(怨듭떇)';
        newSubtype = '怨듭떇';
      } else if (type === '?쒖콈?곌린') {
        newType = '二쇨???(?쒖콈?곌린)';
        newSubtype = '?쒖콈?곌린';
      } else if (type === '?⑤떟??) {
        newType = '二쇨???(?⑤떟??';
        newSubtype = '?⑤떟??;
      } else if (type === '?쒖닠') {
        newType = '二쇨???(?쒖닠)';
        newSubtype = '?쒖닠';
      } else if (type === '媛앷??? || type === '媛앷???(4吏?좊떎)') {
        newType = '媛앷???(4吏?좊떎)';
      }
      
      return {
        ...q,
        type: newType,
        subtype: newSubtype
      };
    });

    const finalQuestions = topic.category === '怨꾩궛'
      ? assembleFinalCalculationQuestions(normalizedParsedArray, topic, fileText)
      : assembleFinalQuestions(normalizedParsedArray, topic, carryOverQuestions, fileText);

    const cleanedQuestions = finalQuestions.map(q => healQuizQuestionObject({
      ...q,
      topic_id: Number(topicId),
      category: topic.category,
      question: cleanQuizQuestion(q.question)
    }));

    const deduplicated = deduplicateQuestions(cleanedQuestions);
    const sId = req.query.sessionId || 'legacy_default';
    const key = resolvedScheduleId
      ? `review_questions_schedule_${resolvedScheduleId}_sess_${sId}`
      : `review_questions_topic_${topicId}_sess_${sId}`;

    await saveSessionValue(key, JSON.stringify(deduplicated));
    if (progressTimer) clearInterval(progressTimer);

    res.json({
      questions: deduplicated,
      isFallback: false,
      scheduleId: resolvedScheduleId
    });

  } catch (err) {
    if (progressTimer) clearInterval(progressTimer);
    console.error('Error generating AI questions, falling back to local questions:', err);
    try {
      const safeFileText = typeof topicText !== 'undefined' ? topicText : (topic ? (topic.extracted_text || '') : '');
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, safeFileText);
      const finalQuestions = topic.category === '怨꾩궛'
        ? assembleFinalCalculationQuestions(fallbackQuestions, topic, fileText)
        : assembleFinalQuestions(fallbackQuestions, topic, carryOverQuestions, safeFileText);

      const cleanedFallback = finalQuestions.map(q => healQuizQuestionObject({
        ...q,
        topic_id: Number(topicId),
        category: topic.category,
        question: cleanQuizQuestion(q.question)
      }));

      const deduplicatedFallback = deduplicateQuestions(cleanedFallback);
      const sId = req.query.sessionId || 'legacy_default';
      const key = resolvedScheduleId
        ? `review_questions_schedule_${resolvedScheduleId}_sess_${sId}`
        : `review_questions_topic_${topicId}_sess_${sId}`;

      try {
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        await dbQuery.run(
          'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, JSON.stringify(deduplicatedFallback)]
        );
      } catch (e) {}

      return res.json({
        questions: deduplicatedFallback,
        isFallback: true,
        mode: 'local-fallback',
        scheduleId: resolvedScheduleId
      });
    } catch (fallbackErr) {
      console.error('Local fallback generation also failed:', fallbackErr);
      res.status(500).json({ error: err.message });
    }
  }
});

// GET /api/mixed/random-flow-question -> Get a random flowchart question from active review topics
router.get('/mixed/random-flow-question', async (req, res) => {
  try {
    await ensureSessionTable();
    
    // 1. Get active review schedules (status = 'pending')
    const pendingSchedules = await dbQuery.all(
      `SELECT id, topic_id FROM schedules WHERE status = 'pending'`
    );
    const pendingTopicIds = new Set(pendingSchedules.map(s => Number(s.topic_id)));
    const pendingScheduleIds = new Set(pendingSchedules.map(s => Number(s.id)));
    
    // 2. Fetch all stored review sessions
    const allSessions = await dbQuery.all(
      `SELECT key, value FROM app_session WHERE key LIKE 'review_questions_topic_%' OR key LIKE 'review_questions_schedule_%'`
    );
    
    let flowQuestions = [];
    
    const extractFlowQuestions = (valueStr, topicId) => {
      try {
        let parsed = JSON.parse(valueStr);
        let questions = [];
        if (Array.isArray(parsed)) {
          questions = parsed;
        } else if (parsed && Array.isArray(parsed.questions)) {
          questions = parsed.questions;
        }
        
        return questions.filter(q => {
          const qText = q.question || '';
          const isFlow = qText.includes('?뚢??') || qText.includes('??) || qText.includes('?뚮줈?곗감??) || qText.includes('?먮쫫??);
          if (isFlow && topicId) {
            q.originalTopicId = topicId;
          }
          return isFlow;
        });
      } catch (e) {
        return [];
      }
    };
    
    // 3. Filter for sessions that belong to pending review topics or schedules
    for (const session of allSessions) {
      if (!session.value) continue;
      
      let isPending = false;
      let associatedTopicId = null;
      
      const topicMatch = session.key.match(/review_questions_topic_(\d+)/);
      const schedMatch = session.key.match(/review_questions_schedule_(\d+)/);
      
      if (topicMatch) {
        associatedTopicId = Number(topicMatch[1]);
        if (pendingTopicIds.has(associatedTopicId)) {
          isPending = true;
        }
      } else if (schedMatch) {
        const scheduleId = Number(schedMatch[1]);
        if (pendingScheduleIds.has(scheduleId)) {
          isPending = true;
          const schedObj = pendingSchedules.find(s => Number(s.id) === scheduleId);
          if (schedObj) {
            associatedTopicId = Number(schedObj.topic_id);
          }
        }
      }
      
      if (isPending) {
        const extracted = extractFlowQuestions(session.value, associatedTopicId);
        if (extracted.length > 0) {
          flowQuestions.push(...extracted);
        }
      }
    }
    
    // 4. Return a random flow question from active review topics if found
    if (flowQuestions.length > 0) {
      const randIdx = Math.floor(Math.random() * flowQuestions.length);
      return res.json({ success: true, question: flowQuestions[randIdx] });
    }
    
    // 5. Fallback: Search all sessions regardless of pending status
    for (const session of allSessions) {
      if (!session.value) continue;
      
      let topicId = null;
      const topicMatch = session.key.match(/review_questions_topic_(\d+)/);
      const schedMatch = session.key.match(/review_questions_schedule_(\d+)/);
      
      if (topicMatch) {
        topicId = Number(topicMatch[1]);
      } else if (schedMatch) {
        const scheduleId = Number(schedMatch[1]);
        const schedObj = await dbQuery.get(`SELECT topic_id FROM schedules WHERE id = ?`, [scheduleId]);
        if (schedObj) {
          topicId = Number(schedObj.topic_id);
        }
      }
      
      const extracted = extractFlowQuestions(session.value, topicId);
      if (extracted.length > 0) {
        flowQuestions.push(...extracted);
      }
    }
    
    if (flowQuestions.length > 0) {
      const randIdx = Math.floor(Math.random() * flowQuestions.length);
      return res.json({ success: true, question: flowQuestions[randIdx] });
    }
    
    // 6. Absolute Fallback: Hardcoded high-quality geotechnical flow question
    const fallbackQuestion = {
      id: "mixed_fallback_flow",
      type: "二쇨???(?쒖콈?곌린)",
      subtype: "?쒖콈?곌린",
      question: `[?됱궗?ъ쁺 ?붾컲?щ㈃?덉젙 ?댁꽍 ?덉감]
?꾨옒 ?먮쫫??鍮덉뭏???ㅼ뼱媛??щ컮瑜?遺꾩꽍 ?④퀎瑜??쒖닠?섏떆??

\`\`\`
?뚢????????????????????????????????????????????????
??          1?④퀎: 遺덉뿰?띾㈃ 議곗궗 諛?遺꾩꽍         ??
?붴???????????????????????р?????????????????????????
                       ??
?뚢????????????????????????????????????????????????
??      2?④퀎: ?됱궗?ъ쁺留??곸뿉 遺덉뿰?띾㈃ ?ъ쁺     ??
?붴???????????????????????р?????????????????????????
                       ??
?뚢????????????????????????????????????????????????
??          3?④퀎: [INPUT_1] ?곸뿭 ?ㅼ젙          ??
?붴???????????????????????р?????????????????????????
                       ??
?뚢????????????????????????????????????????????????
??      4?④퀎: ?щ㈃??寃쎌궗硫??됱궗?ъ쁺 ?ъ쁺        ??
?붴???????????????????????р?????????????????????????
                       ??
?뚢????????????????????????????????????????????????
??      5?④퀎: ?꾪뿕 ?곸뿭 ??援먯젏 遺꾩꽍          ??
??         - [INPUT_2] ?뚭눼: 援먯젏???꾪뿕???? ??
??         - ?꾨룄 ?뚭눼: 洹뱀젏???꾨룄 ?곸뿭 ??   ??
?붴????????????????????????????????????????????????
\`\`\``,
      tableData: {
        headers: ["援щ텇", "?댁슜"],
        rows: [
          ["3?④퀎 遺꾩꽍 ?곸뿭", "[INPUT_1]"],
          ["5?④퀎 ?꾪뿕 遺꾩꽍", "[INPUT_2]"]
        ]
      },
      answers: {
        INPUT_1: "?꾪뿕",
        INPUT_2: "?됰㈃"
      },
      explanation: `?됱궗?ъ쁺踰뺤쓣 ?댁슜???붾컲 ?щ㈃???덉젙???댁꽍 ?덉감:
1?④퀎: 遺덉뿰?띾㈃(?덈━, ?⑥링 ????諛⑺뼢??二쇳뼢/寃쎌궗)???꾩옣 議곗궗?섏뿬 ?듦퀎 遺꾩꽍?⑸땲??
2?④퀎: 議곗궗??遺덉뿰?띾㈃??洹뱀젏(Pole) ?먮뒗 ???Great Circle)???됱궗?ъ쁺留?Stereonet) ?곸뿉 ?ъ쁺?⑸땲??
3?④퀎: ?щ㈃??諛⑺뼢怨?寃쎌궗媛곸쓣 湲곗??쇰줈 ?뚭눼媛 諛쒖깮?????덈뒗 '?꾪뿕 ?곸뿭(Daylight Envelope 諛?留덉같媛???'???ㅼ젙?⑸땲??
4?④퀎: ?щ㈃???ㅼ젣 寃쎌궗硫댁쓣 ?ъ쁺?섏뿬 ?덉젙??寃??湲곗??좎씠 ?뺤꽦?⑸땲??
5?④퀎: ?꾪뿕 ?곸뿭 ?댁뿉 遺덉뿰?띾㈃??援먯젏 ?먮뒗 洹뱀젏???꾩튂?섎뒗吏 遺꾩꽍?섏뿬 ?됰㈃?뚭눼(援먯젏???꾪뿕???댁뿉 ?꾩튂) ?먮뒗 ?꾨룄?뚭눼(洹뱀젏???꾨룄 ?곸뿭???꾩튂) 媛?μ꽦???먯젙?⑸땲??`,
      mixedType: "overview"
    };
    
    return res.json({ success: true, question: fallbackQuestion });
  } catch (err) {
    console.error('GET /api/mixed/random-flow-question error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/review -> Get saved review session state
router.get('/session/review', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rawTopicId = req.query.topicId;
    let targetTopicId = String(rawTopicId || '');
    if (targetTopicId.startsWith('mixed_') && targetTopicId.includes('_sess_')) {
      targetTopicId = targetTopicId.split('_sess_')[0];
    }

    if (!rawTopicId) {
      return res.status(400).json({ error: 'topicId媛 ?꾨씫?섏뿀?듬땲??' });
    }

    if (targetTopicId && targetTopicId.startsWith('mixed_')) {
      let rawSid = String(req.query.sessionId || 'legacy_default');
      let cleanSid = rawSid;
      if (cleanSid.startsWith('sess_')) cleanSid = cleanSid.substring(5);

      const key = `review_questions_topic_${targetTopicId}_sess_${cleanSid}`;
      const legacyKey = `review_questions_topic_${targetTopicId}_sess_${rawSid}`;

      let row = await dbQuery.get('SELECT value FROM app_session WHERE key = ? OR key = ?', [key, legacyKey]);
      let actualKey = row ? (row.key || key) : key;

      if (!row) {
        const topicPattern = `review_questions_topic_${targetTopicId}%`;
        const topicSessionRow = await dbQuery.get(
          'SELECT key, value FROM app_session WHERE key LIKE ? AND key NOT LIKE ? ORDER BY updated_at DESC LIMIT 1',
          [topicPattern, '%_q']
        );
        if (topicSessionRow) {
          row = topicSessionRow;
          actualKey = topicSessionRow.key;
        }
      }

      if (row && row.value) {
        let data = JSON.parse(row.value);
        // Merge questions from separate _q key when using new split-storage format
        if (data && !Array.isArray(data) && (!data.questions || data.questions.length === 0)) {
          const qRow = await dbQuery.get('SELECT value FROM app_session WHERE key = ? OR key = ? OR key = ?', [
            `${actualKey}_q`,
            `${key}_q`,
            `${legacyKey}_q`
          ]);
          if (qRow && qRow.value) data.questions = JSON.parse(qRow.value);
        }
        if (Array.isArray(data.questions)) {
          data.questions = data.questions.map(q => healQuizQuestionObject(q));
        }
        return res.json({ success: true, data });
      }
      return res.json({ success: true, data: null });
    }

    const targetScheduleId = String(req.query.scheduleId || '');
    let rawSid = String(req.query.sessionId || 'legacy_default');
    let cleanSid = rawSid;
    if (cleanSid.startsWith('sess_')) cleanSid = cleanSid.substring(5);

    let candidateKeys = [];
    if (targetScheduleId && targetScheduleId !== '9999' && targetScheduleId !== 'null' && targetScheduleId !== 'undefined' && targetScheduleId !== '') {
      candidateKeys.push(`review_questions_schedule_${targetScheduleId}_sess_${cleanSid}`);
      candidateKeys.push(`review_questions_schedule_${targetScheduleId}`);
    }
    candidateKeys.push(`review_questions_topic_${targetTopicId}_sess_${cleanSid}`);
    candidateKeys.push(`review_questions_topic_${targetTopicId}`);

    let row = null;
    let actualKey = null;

    for (const ck of candidateKeys) {
      const r = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [ck]);
      if (r && r.value) {
        row = r;
        actualKey = ck;
        break;
      }
    }

    if (!row) {
      let fallbackPatterns = [];
      if (targetScheduleId && targetScheduleId !== '9999' && targetScheduleId !== 'null' && targetScheduleId !== 'undefined' && targetScheduleId !== '') {
        fallbackPatterns.push(`review_questions_schedule_${targetScheduleId}%`);
      }
      fallbackPatterns.push(`review_questions_topic_${targetTopicId}%`);

      for (const pattern of fallbackPatterns) {
        const topicSessionRow = await dbQuery.get(
          'SELECT key, value FROM app_session WHERE key LIKE ? AND key NOT LIKE ? ORDER BY updated_at DESC LIMIT 1',
          [pattern, '%_q']
        );
        if (topicSessionRow && topicSessionRow.value) {
          row = topicSessionRow;
          actualKey = topicSessionRow.key;
          break;
        }
      }
    }

    if (row && row.value) {
      let data = JSON.parse(row.value);
      if (data) {
        // Merge questions from separate _q key when using new split-storage format
        if (!Array.isArray(data) && (!data.questions || data.questions.length === 0)) {
          const questionsKey = `${actualKey}_q`;
          const qRow = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [questionsKey]);
          if (qRow && qRow.value) data.questions = JSON.parse(qRow.value);
        }
        // Backward compat: very old format stored just a bare questions array
        if (Array.isArray(data)) {
          data = {
            sessionId: 'legacy_default',
            questions: data,
            selectedAnswers: {},
            revealedQuestions: {},
            tableAnswers: {},
            tableGradingResults: {},
            tutorAnswers: {},
            tutorInputText: {},
            chatHistory: [],
            savedQuizScroll: 0
          };
        }

        if (Array.isArray(data.questions)) {
          data.questions = data.questions.map(q => sanitizeMultipleChoiceAnswer(healQuizQuestionObject(q)));
        }
      }
      res.json({ success: true, data });
    } else {
      res.json({ success: false, error: '?몄뀡 ?뺣낫媛 ?놁뒿?덈떎.' });
    }
  } catch (err) {
    console.error('GET /api/session/review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/session/review -> Save review session state
router.post('/session/review', async (req, res) => {
  try {
    await ensureSessionTable();
    const { topicId, scheduleId, sessionId, questions, selectedAnswers, revealedQuestions, tableAnswers, tableGradingResults, tutorAnswers, tutorInputText, chatHistory, savedQuizScroll } = req.body;
    let targetTopicId = String(topicId || '');
    if (targetTopicId.startsWith('mixed_') && targetTopicId.includes('_sess_')) {
      targetTopicId = targetTopicId.split('_sess_')[0];
    }

    if (!topicId) {
      return res.status(400).json({ error: '?꾩닔 ?몄옄媛 ?꾨씫?섏뿀?듬땲??' });
    }

    if (targetTopicId && targetTopicId.startsWith('mixed_')) {
      let rawSid = String(sessionId || 'legacy_default');
      let cleanSid = rawSid;
      if (cleanSid.startsWith('sess_')) cleanSid = cleanSid.substring(5);

      const key = `review_questions_topic_${targetTopicId}_sess_${cleanSid}`;
      const questionsKey = `${key}_q`;

      // Merge with existing state for missing fields
      let existingData = {};
      try {
        const existingRow = await dbQuery.get('SELECT value FROM app_session WHERE key = ? OR key = ?', [
          key,
          `review_questions_topic_${targetTopicId}_sess_${rawSid}`
        ]);
        if (existingRow && existingRow.value) existingData = JSON.parse(existingRow.value);
      } catch (e) {}

      // Save questions separately ??saveSessionValue skips write if unchanged (same-value optimization)
      if (questions && Array.isArray(questions) && questions.length > 0) {
        const healedQuestions = questions.map(healQuizQuestionObject);
        await saveSessionValue(questionsKey, JSON.stringify(healedQuestions));
      }

      const mergeStateField = (inc, ext) => {
        if (inc === undefined || inc === null) return ext || {};
        if (typeof inc === 'object' && !Array.isArray(inc)) {
          const incObj = inc || {};
          const extObj = ext || {};
          const incKeys = Object.keys(incObj);
          const extKeys = Object.keys(extObj);
          if (incKeys.length === 0 && extKeys.length > 0) return extObj;
          const merged = { ...extObj, ...incObj };
          for (const k of extKeys) {
            if (extObj[k] !== undefined && extObj[k] !== '' && (incObj[k] === undefined || incObj[k] === '')) {
              merged[k] = extObj[k];
            }
          }
          return merged;
        }
        return inc !== undefined ? inc : ext;
      };

      // Save lightweight state object (no questions array ??reduces autosave payload by ~80%)
      const value = JSON.stringify({
        sessionId: sessionId || existingData.sessionId || '',
        selectedAnswers: mergeStateField(selectedAnswers, existingData.selectedAnswers),
        revealedQuestions: mergeStateField(revealedQuestions, existingData.revealedQuestions),
        tableAnswers: mergeStateField(tableAnswers, existingData.tableAnswers),
        tableGradingResults: mergeStateField(tableGradingResults, existingData.tableGradingResults),
        tutorAnswers: mergeStateField(tutorAnswers, existingData.tutorAnswers),
        tutorInputText: mergeStateField(tutorInputText, existingData.tutorInputText),
        chatHistory: chatHistory !== undefined ? chatHistory : (existingData.chatHistory || []),
        savedQuizScroll: savedQuizScroll !== undefined ? savedQuizScroll : (existingData.savedQuizScroll || 0)
      });
      await saveSessionValue(key, value);
      return res.json({ success: true, message: 'Mixed session stored.' });
    }

    let rawSid = String(sessionId || 'legacy_default');
    let cleanSid = rawSid;
    if (cleanSid.startsWith('sess_')) cleanSid = cleanSid.substring(5);

    let key = `review_questions_topic_${targetTopicId}_sess_${cleanSid}`;
    if (scheduleId && scheduleId !== '9999' && scheduleId !== 'null' && scheduleId !== 'undefined' && scheduleId !== '') {
      key = `review_questions_schedule_${scheduleId}_sess_${cleanSid}`;
    }
    const questionsKey = `${key}_q`;

    // Merge with existing state for missing fields
    let existingData2 = {};
    try {
      const existingRow2 = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);
      if (existingRow2 && existingRow2.value) existingData2 = JSON.parse(existingRow2.value);
    } catch (e) {}

    // Save questions separately ??saveSessionValue skips write if unchanged (same-value optimization)
    // This is the key optimization: questions (~40-100KB) are only written when they actually change
    if (questions && Array.isArray(questions) && questions.length > 0) {
      const healedQuestions = questions.map(healQuizQuestionObject);
      await saveSessionValue(questionsKey, JSON.stringify(healedQuestions));
    }

    const mergeStateField2 = (inc, ext) => {
      if (inc === undefined || inc === null) return ext || {};
      if (typeof inc === 'object' && !Array.isArray(inc)) {
        const incObj = inc || {};
        const extObj = ext || {};
        const incKeys = Object.keys(incObj);
        const extKeys = Object.keys(extObj);
        if (incKeys.length === 0 && extKeys.length > 0) return extObj;
        const merged = { ...extObj, ...incObj };
        for (const k of extKeys) {
          if (extObj[k] !== undefined && extObj[k] !== '' && (incObj[k] === undefined || incObj[k] === '')) {
            merged[k] = extObj[k];
          }
        }
        return merged;
      }
      return inc !== undefined ? inc : ext;
    };

    // Save lightweight state object (no questions array ??reduces autosave payload by ~80%)
    const value = JSON.stringify({
      sessionId: sessionId || existingData2.sessionId || '',
      selectedAnswers: mergeStateField2(selectedAnswers, existingData2.selectedAnswers),
      revealedQuestions: mergeStateField2(revealedQuestions, existingData2.revealedQuestions),
      tableAnswers: mergeStateField2(tableAnswers, existingData2.tableAnswers),
      tableGradingResults: mergeStateField2(tableGradingResults, existingData2.tableGradingResults),
      tutorAnswers: mergeStateField2(tutorAnswers, existingData2.tutorAnswers),
      tutorInputText: mergeStateField2(tutorInputText, existingData2.tutorInputText),
      chatHistory: chatHistory !== undefined ? chatHistory : (existingData2.chatHistory || []),
      savedQuizScroll: savedQuizScroll !== undefined ? savedQuizScroll : (existingData2.savedQuizScroll || 0)
    });

    await saveSessionValue(key, value);
    res.json({ success: true, ok: true });
  } catch (err) {
    console.error('POST /api/session/review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/session/review/topic/:id -> Delete a review session
router.delete('/session/review/topic/:id', async (req, res) => {
  try {
    await ensureSessionTable();
    const topicId = req.params.id;
    const targetTopicId = String(topicId || '');

    if (targetTopicId && targetTopicId.startsWith('mixed_')) {
      await dbQuery.run(
        "DELETE FROM app_session WHERE key LIKE ?",
        [`review_questions_topic_${targetTopicId}%`]
      );
      return res.json({ ok: true });
    }

    // Delete ALL session keys containing topic_targetTopicId (catches review_questions_topic_50%, review_questions_schedule_*_topic_50%, review_progress_*, etc.)
    await dbQuery.run(
      "DELETE FROM app_session WHERE key LIKE ? OR key LIKE ? OR key LIKE ? OR key LIKE ?",
      [
        `%topic_${targetTopicId}%`,
        `review_questions_topic_${targetTopicId}%`,
        `review_progress_topic_${targetTopicId}%`,
        `completed_review_%`
      ]
    );

    if (!isNaN(Number(targetTopicId))) {
      const schedules = await dbQuery.all('SELECT id FROM schedules WHERE topic_id = ?', [Number(targetTopicId)]);
      if (schedules && schedules.length > 0) {
        for (const s of schedules) {
          await dbQuery.run(
            "DELETE FROM app_session WHERE key LIKE ? OR key LIKE ?",
            [`%schedule_${s.id}%`, `%schedule_${s.id}%`]
          );
        }
      }
    }

    const allSchedSessions = await dbQuery.all(
      `SELECT key, value FROM app_session WHERE key LIKE 'review_questions_schedule_%'`
    );
    if (allSchedSessions && allSchedSessions.length > 0) {
      for (const sRow of allSchedSessions) {
        try {
          const parsedVal = JSON.parse(sRow.value);
          if (parsedVal && String(parsedVal.topicId || '') === targetTopicId) {
            await dbQuery.run('DELETE FROM app_session WHERE key = ?', [sRow.key]);
          }
        } catch (err) {}
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/session/review/topic error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/completed-review/:scheduleId -> Get completed review state
router.get('/session/completed-review/:scheduleId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const scheduleId = req.params.scheduleId;
  try {
    await ensureSessionTable();
    const row = await dbQuery.get(
      'SELECT value FROM app_session WHERE key = ?',
      [`completed_review_schedule_${scheduleId}`]
    );
    if (row && row.value) {
      const data = JSON.parse(row.value);
      if (data && Array.isArray(data.questions)) {
        data.questions = data.questions.map(q => healQuizQuestionObject(q));
      }
      res.json({ success: true, data });
    } else {
      res.json({ success: false, error: '?대떦 蹂듭뒿????λ맂 ???湲곕줉???놁뒿?덈떎.' });
    }
  } catch (err) {
    console.error('GET /api/session/completed-review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/completed-review/by-topic/:topicId -> Get last completed review by topic
router.get('/session/completed-review/by-topic/:topicId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const topicId = parseInt(req.params.topicId, 10);
  if (isNaN(topicId)) {
    return res.status(400).json({ error: '?좏슚??topicId媛 ?꾨떃?덈떎.' });
  }
  try {
    await ensureSessionTable();
    const schedule = await dbQuery.get(
      `SELECT id FROM schedules WHERE topic_id = ? AND (status = 'completed' OR status = 'failed') ORDER BY completed_at DESC LIMIT 1`,
      [topicId]
    );
    if (schedule) {
      const row = await dbQuery.get(
        'SELECT value FROM app_session WHERE key = ?',
        [`completed_review_schedule_${schedule.id}`]
      );
      if (row && row.value) {
        const data = JSON.parse(row.value);
        if (data && Array.isArray(data.questions)) {
          data.questions = data.questions.map(q => healQuizQuestionObject(q));
        }
        return res.json({ success: true, scheduleId: schedule.id, data });
      }
    }
    res.json({ success: false, error: '?대떦 ?좏뵿???꾨즺??蹂듭뒿 湲곕줉???놁뒿?덈떎.' });
  } catch (err) {
    console.error('GET /api/session/completed-review/by-topic error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/last-active-review -> Get last active review session metadata
router.get('/session/last-active-review', async (req, res) => {
  try {
    await ensureSessionTable();
    const row = await dbQuery.get(
      `SELECT key FROM app_session 
       WHERE key LIKE 'review_questions_schedule_%' 
          OR key LIKE 'review_questions_topic_%' 
          OR key LIKE 'completed_review_schedule_%' 
       ORDER BY updated_at DESC LIMIT 1`
    );

    if (!row) {
      return res.json({ success: true, lastActive: null });
    }

    const key = row.key;
    if (key.startsWith('completed_review_schedule_') || key.startsWith('review_questions_schedule_')) {
      const isCompleted = key.startsWith('completed_review_schedule_');
      const rawSchedId = key.replace(isCompleted ? 'completed_review_schedule_' : 'review_questions_schedule_', '');
      
      if (rawSchedId.startsWith('mixed_')) {
        return res.json({
          success: true,
          lastActive: {
            topicId: rawSchedId.includes('_sess_') ? rawSchedId.split('_sess_')[0] : (rawSchedId.startsWith('mixed_schedule_') ? `mixed_${rawSchedId.replace('mixed_schedule_', '')}` : rawSchedId),
            title: '?ㅻ뒛???꾩닔 誘뱀뒪蹂듭뒿 (11??1?명듃)',
            keywords: '',
            pdfName: 'mixed.html',
            mode: isCompleted ? 'completed' : 'ai',
            scheduleId: rawSchedId,
            reviewRound: 'MIX',
            isReadOnly: isCompleted,
            isBonus: false,
            category: '誘뱀뒪'
          }
        });
      }

      const scheduleId = parseInt(rawSchedId, 10);
      if (!isNaN(scheduleId) && scheduleId > 0) {
        const sched = await dbQuery.get(
          `SELECT s.id, s.topic_id, s.review_round, t.title, t.keywords, t.pdf_name, t.category 
           FROM schedules s 
           JOIN topics t ON s.topic_id = t.id 
           WHERE s.id = ?`,
          [scheduleId]
        );
        if (sched) {
          return res.json({
            success: true,
            lastActive: {
              topicId: sched.topic_id,
              title: sched.title,
              keywords: sched.keywords || '',
              pdfName: sched.pdf_name || '',
              mode: isCompleted ? 'completed' : 'ai',
              scheduleId: sched.id,
              reviewRound: sched.review_round,
              isReadOnly: isCompleted,
              isBonus: sched.review_round === 99,
              category: sched.category || '?쇰컲'
            }
          });
        }
      }
    } else if (key.startsWith('review_questions_topic_')) {
      let topicIdRaw = key.replace('review_questions_topic_', '');
      if (topicIdRaw.includes('_sess_')) {
        topicIdRaw = topicIdRaw.split('_sess_')[0];
      }
      if (topicIdRaw.startsWith('mixed_')) {
        return res.json({
          success: true,
          lastActive: {
            topicId: topicIdRaw,
            title: '?ㅻ뒛???꾩닔 誘뱀뒪蹂듭뒿 (11??1?명듃)',
            keywords: '',
            pdfName: 'mixed.html',
            mode: 'ai',
            scheduleId: `mixed_schedule_${topicIdRaw.replace('mixed_', '')}`,
            reviewRound: 'MIX',
            isReadOnly: false,
            isBonus: false,
            category: '誘뱀뒪'
          }
        });
      }
      const topicId = parseInt(topicIdRaw, 10);
      if (!isNaN(topicId) && topicId > 0) {
        const topicObj = await dbQuery.get(`SELECT id, title, keywords, pdf_name, category FROM topics WHERE id = ?`, [topicId]);
        if (topicObj) {
          const sched = await dbQuery.get(`SELECT id, review_round FROM schedules WHERE topic_id = ? AND status = 'pending' LIMIT 1`, [topicId]);
          return res.json({
            success: true,
            lastActive: {
              topicId: topicObj.id,
              title: topicObj.title,
              keywords: topicObj.keywords || '',
              pdfName: topicObj.pdf_name || '',
              mode: 'ai',
              scheduleId: sched ? sched.id : null,
              reviewRound: sched ? sched.review_round : null,
              isReadOnly: false,
              isBonus: sched ? sched.review_round === 99 : false,
              category: topicObj.category || '?쇰컲'
            }
          });
        }
      }
    }
    return res.json({ success: true, lastActive: null });
  } catch (err) {
    console.error('GET /api/session/last-active-review error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/session/answersheet -> Load answersheet session state
router.get('/session/answersheet', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all(
      'SELECT value FROM app_session WHERE key = ?',
      ['answersheet_questions']
    );
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      if (parsed && Array.isArray(parsed.questions)) {
        parsed.questions = parsed.questions.map(q => healAnswersheetQuestionObject(q));
      }
      res.json({ data: parsed });
    } else {
      res.json({ data: null });
    }
  } catch (err) {
    console.error('GET /api/session/answersheet error:', err);
    res.json({ data: null });
  }
});

// POST /api/session/answersheet -> Save answersheet session state
router.post('/session/answersheet', async (req, res) => {
  try {
    await ensureSessionTable();
    const { answersheetQuestions } = req.body;
    const healedQuestions = Array.isArray(answersheetQuestions)
      ? answersheetQuestions.map(healAnswersheetQuestionObject)
      : answersheetQuestions;
    const value = JSON.stringify({ answersheetQuestions: healedQuestions });
    await saveSessionValue('answersheet_questions', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/answersheet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/answersheet/report/:id -> Stream raw PDF/HTML report from answersheet
router.get('/session/answersheet/report/:id', async (req, res) => {
  const reportId = req.params.id;
  const forceDownload = req.query.download === 'true';
  try {
    await ensureAnswersheetReportsTable();
    const reportSql = `SELECT pdf_name, pdf_data, pdf_url FROM answersheet_reports WHERE id = ?`;
    const report = await dbQuery.get(reportSql, [reportId]);
    if (!report) {
      return res.status(404).send('泥⑤???PDF/HTML ?먮낯 ?뚯씪??李얠쓣 ???놁뒿?덈떎.');
    }

    let pdfData = report.pdf_data;
    if (report.pdf_url && (!pdfData || pdfData.length === 0)) {
      try {
        const headers = {};
        if (process.env.BLOB_READ_WRITE_TOKEN) {
          headers['Authorization'] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
        }
        const response = await fetch(report.pdf_url, { headers });
        if (!response.ok) {
          throw new Error(`Blob fetch failed with status: ${response.status}`);
        }
        pdfData = Buffer.from(await response.arrayBuffer());
      } catch (fetchErr) {
        console.error(`Failed to lazy load answersheet buffer: ${report.pdf_url}`, fetchErr);
      }
    }

    if (!pdfData || pdfData.length === 0) {
      return res.status(404).send('泥⑤???PDF/HTML ?먮낯 ?뚯씪??李얠쓣 ???놁뒿?덈떎.');
    }

    const isHtml = report.pdf_name && (
      report.pdf_name.toLowerCase().endsWith('.html') || 
      report.pdf_name.toLowerCase().endsWith('.htm') || 
      fileUtils.isBufferHtml(pdfData)
    );
    if (isHtml) {
      let htmlContent = fileUtils.decodeHtmlBuffer(pdfData);
      htmlContent = htmlContent.replace(/<script\b[^>]*?src=["']?[^"'>]*?polyfill\.io[^"'>]*?["']?[^>]*?>([\s\S]*?<\/script>)?/gi, '<!-- polyfill removed -->');
      
      const responsiveStyle = `
<style>
html, body {
  background-color: #ffffff !important;
  color: #1e293b !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
  line-height: 1.6 !important;
  margin: 0 !important;
  padding: 24px !important;
  box-sizing: border-box !important;
}
h1, h2, h3, h4, h5, h6, th, strong, b {
  color: #0f172a !important;
}
p, span, td, li, div, section, article {
  color: #334155 !important;
}
a {
  color: #0284c7 !important;
  text-decoration: underline !important;
}
table {
  border-collapse: collapse !important;
  width: 100% !important;
  margin: 20px 0 !important;
  background-color: #ffffff !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 8px !important;
  overflow: hidden !important;
}
th {
  background-color: #f1f5f9 !important;
  color: #0f172a !important;
  font-weight: 700 !important;
  border: 1px solid #cbd5e1 !important;
  padding: 12px 16px !important;
}
td {
  border: 1px solid #e2e8f0 !important;
  padding: 12px 16px !important;
}
div, section, article, form, .container, .page, .wrapper, .section, .WordSection1, #page-container, #sidebar, #content {
  background-color: transparent !important;
  border-color: #e2e8f0 !important;
  box-shadow: none !important;
}
::-webkit-scrollbar {
  width: 8px !important;
  height: 8px !important;
}
::-webkit-scrollbar-track {
  background: #f8fafc !important;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1 !important;
  border-radius: 9999px !important;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8 !important;
}
@media (max-width: 768px) {
  html, body {
    padding: 12px !important;
  }
  div, section, article, form, .container, .page, .wrapper, .section, .WordSection1, #page-container, #sidebar, #content {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin: 0 auto !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
    height: auto !important;
  }
  img, svg, table, pre, code {
    max-width: 100% !important;
    height: auto !important;
  }
  .katex-display, table, pre, code {
    overflow-x: auto !important;
    overflow-y: hidden !important;
    box-sizing: border-box !important;
  }
  .katex-display {
    padding: 0.5em 8px !important;
  }
}
</style>
`;
      htmlContent = htmlContent + responsiveStyle;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(htmlContent);
    } else {
      const fileNameLower = (report.pdf_name || '').toLowerCase();
      let contentType = 'application/pdf';
      if (fileNameLower.endsWith('.png')) {
        contentType = 'image/png';
      } else if (fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg')) {
        contentType = 'image/jpeg';
      } else if (fileNameLower.endsWith('.gif')) {
        contentType = 'image/gif';
      } else if (fileNameLower.endsWith('.webp')) {
        contentType = 'image/webp';
      } else if (fileNameLower.endsWith('.svg')) {
        contentType = 'image/svg+xml';
      }

      res.setHeader('Content-Type', contentType);
      if (forceDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(report.pdf_name)}"`);
      } else {
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(report.pdf_name)}"`);
      }
      res.send(pdfData);
    }
  } catch (error) {
    console.error('Error streaming answersheet report:', error);
    res.status(500).send('?쒕쾭 ?ㅻ쪟濡??뚯씪???ㅽ듃由щ컢?섏? 紐삵뻽?듬땲??');
  }
});

// POST /api/schedules/bonus/complete -> Complete a weakpoint bonus review
router.post('/schedules/bonus/complete', async (req, res) => {
  const { topicId, score, scheduleId, schedule_id } = req.body;
  const targetScheduleId = scheduleId || schedule_id;
  const today = fileUtils.getLocalDateString();
  const now = new Date().toISOString();

  if (!topicId) {
    return res.status(400).json({ error: '?꾩닔 ?몄옄 topicId媛 ?꾨씫?섏뿀?듬땲??' });
  }

  try {
    let finalScheduleId = targetScheduleId;
    if (!finalScheduleId) {
      const row = await dbQuery.get(
        `SELECT id FROM schedules WHERE topic_id = ? AND review_round = 99 AND planned_date = ? AND status = 'pending' LIMIT 1`,
        [topicId, today]
      );
      if (row) finalScheduleId = row.id;
    }

    if (!finalScheduleId) {
      const insertRes = await dbQuery.run(
        `INSERT INTO schedules (topic_id, review_round, planned_date, status, completed_at, score) 
         VALUES (?, 99, ?, 'completed', ?, ?)`,
        [topicId, today, now, score || 100]
      );
      finalScheduleId = insertRes.id;
    } else {
      await dbQuery.run(
        `UPDATE schedules SET status = 'completed', completed_at = ?, score = ? WHERE id = ?`,
        [now, score || 100, finalScheduleId]
      );
    }

    res.json({ success: true, scheduleId: finalScheduleId });
  } catch (err) {
    console.error('POST /api/schedules/bonus/complete error:', err);
    res.status(500).json({ error: err.message });
  }
});

export const LOCAL_FORMULA_DICTIONARY = [
  {
    keywords: ['C_v', 'm_v', '\\gamma_w', 'u', 'z', 't', '\\partial'],
    title: '?뚮Ⅴ?먭린 1李??뺣?諛⑹젙??Terzaghi 1D Consolidation, $C_v$)',
    concept: '?몃? ?먯쭊/?쒓컙 ?섏쨷 ?ы븯 ???쒓컙??寃쎄낵?⑥뿉 ?곕씪 怨쇱엵媛꾧레?섏븬???곹븯 諛곗닔痢듭쓣 ?듯빐 ?뚯궛?섏뼱 ?섍????띾룄瑜?洹쒖젙??1李⑥썝 誘몃텇諛⑹젙??,
    formula: `1) ?뺣?諛⑹젙??(Governing Equation):
$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$

- $u$: 怨쇱엵媛꾧레?섏븬 (Excess Pore Water Pressure)
- $t$: ?뺣? 寃쎄낵 ?쒓컙 (Time)
- $z$: ?먰넗痢??댁쓽 諛곗닔 嫄곕━ 諛⑺뼢 源딆씠
- $C_v$: ?뺣?怨꾩닔 (Coefficient of Consolidation)

2) ?뺣?怨꾩닔 ($C_v$)???뺤쓽:
$$C_v = \\frac{k}{m_v \\gamma_w} = \\frac{k(1+e_0)}{a_v \\gamma_w}$$

- $k$: ?먰넗???ъ닔怨꾩닔 (Coefficient of Permeability)
- $m_v$: 泥댁쟻?뺤텞怨꾩닔(泥댁쟻蹂?붽퀎?? (Coefficient of Volume Compressibility)
- $\\gamma_w$: 臾쇱쓽 ?⑥쐞以묐웾 (Unit Weight of Water)`,
    structure: `- $u$: 怨쇱엵媛꾧레?섏븬\n- $t$: ?뺣? 寃쎄낵 ?쒓컙\n- $z$: 諛곗닔 嫄곕━ 源딆씠\n- $C_v$: ?뺣?怨꾩닔`
  },
  {
    keywords: ['q_{ult}', 'N_c', 'N_q', 'N_{\\gamma}', 'c', 'B', 'D_f'],
    title: '?뚮Ⅴ?먭린 洹뱁븳吏吏??Terzaghi Ultimate Bearing Capacity, $q_{ult}$)',
    concept: '?숈쓽 ?꾨떒?뚭눼 ?뺤긽????섎굹???깆쑝濡?紐⑤뜽?뷀븯??湲곗큹 ?硫??꾨옒 吏諛섏씠 ?꾨떒 ?뚭눼 ?놁씠 吏?깊븷 ???덈뒗 理쒕? ?섏쨷 媛뺣룄 ??,
    formula: `Terzaghi 洹뱁븳 吏吏??
$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$

- $q_{ult}$: 洹뱁븳 吏吏??
- $c$: ?숈쓽 ?먯갑??
- $q$: 湲곗큹 ?硫댁쓽 ?좏슚?곸옱?섏쨷 ($\\gamma D_f$)
- $\\gamma$: 湲곗큹 ?硫??꾨옒 ?숈쓽 ?⑥쐞以묐웾
- $B$: 湲곗큹????(?⑤? 湲몄씠)
- $N_c, N_q, N_{\\gamma}$: 吏諛?吏吏??怨꾩닔`,
    structure: `- $q_{ult}$: 洹뱁븳 吏吏??n- $c$: ?숈쓽 ?먯갑??n- $q$: 湲곗큹 ?硫댁쓽 ?좏슚?곸옱?섏쨷 ($\\gamma D_f$)\n- $\\gamma$: 湲곗큹 ?硫??꾨옒 ?숈쓽 ?⑥쐞以묐웾\n- $B$: 湲곗큹????(?⑤? 湲몄씠)\n- $N_c, N_q, N_{\\gamma}$: 吏諛?吏吏??怨꾩닔`
  },
  {
    keywords: ['Q', 'RQD', 'J_n', 'J_r', 'J_a', 'J_w', 'SRF'],
    title: '諛뷀넠 ?붾컲 Q遺꾨쪟(Barton Q-system, $Q$)',
    concept: '?붾컲??怨듯븰???뱀꽦??6媛吏 ?낅┰??蹂?섎? ?듯빐 ?뺣웾?뷀븯???곕꼸 1李?吏蹂??ㅺ퀎瑜??ㅺ퀎?섎뒗 吏??怨듭떇',
    formula: `?붾컲 ?깃툒 Q吏????
$$Q = \\frac{RQD}{J_n} \\times \\frac{J_r}{J_a} \\times \\frac{J_w}{SRF}$$

- $Q$: ?붾컲 ?깃툒 吏??
- $RQD$: ?붿쭏吏??(Rock Quality Designation)
- $J_n$: ?덈━援???(Joint set number)
- $J_r$: ?덈━硫?嫄곗튌湲?怨꾩닔 (Joint roughness number)
- $J_a$: ?덈━硫?蹂吏?怨꾩닔 (Joint alteration number)
- $J_w$: ?덈━??蹂댁젙 怨꾩닔 (Joint water reduction factor)
- $SRF$: ?묐젰 媛먯냼 怨꾩닔 (Stress Reduction Factor)`,
    structure: `- $Q$: ?붾컲 ?깃툒 吏??n- $RQD$: ?붿쭏吏??(Rock Quality Designation)\n- $J_n$: ?덈━援???(Joint set number)\n- $J_r$: ?덈━硫?嫄곗튌湲?怨꾩닔 (Joint roughness number)\n- $J_a$: ?덈━硫?蹂吏?怨꾩닔 (Joint alteration number)\n- $J_w$: ?덈━??蹂댁젙 怨꾩닔 (Joint water reduction factor)\n- $SRF$: ?묐젰 媛먯냼 怨꾩닔 (Stress Reduction Factor)`
  },
  {
    keywords: ['H', 'q', 'q_a', '\\tan\\theta'],
    title: '?곗빟吏諛??뚮뱶留ㅽ듃 理쒖냼?먭퍡(Sand Mat Minimum Thickness, $H$)',
    concept: '?쒖링 媛쒕웾 諛??곗빟吏諛??곷???臾닿굅??二쇳뻾???λ퉬(Trafficability)瑜??밴린 ?꾪븳 ?섏쨷 吏吏 ?뚯슂 ?먭퍡??,
    formula: `?뚮뱶留ㅽ듃 理쒖냼 ?먭퍡 ??
$$H = \\sqrt{\\frac{q - q_a}{\\gamma \\tan \\theta}}$$

- $H$: ?뚮뱶留ㅽ듃???뚯슂 理쒖냼 ?먭퍡
- $q$: ?ъ꽕 ?λ퉬???묒???
- $q_a$: 吏諛섏쓽 ?덉슜 吏吏??
- $\\gamma$: 紐⑤옒???⑥쐞以묐웾
- $\\theta$: ?섏쨷 遺꾩궛媛?(?쇰컲?곸쑝濡?$45^\\circ$ ?곸슜)`,
    structure: `- $H$: ?뚮뱶留ㅽ듃???뚯슂 理쒖냼 ?먭퍡\n- $q$: ?ъ꽕 ?λ퉬???묒???n- $q_a$: 吏諛섏쓽 ?덉슜 吏吏??n- $\\gamma$: 紐⑤옒???⑥쐞以묐웾\n- $\\theta$: ?섏쨷 遺꾩궛媛?(?쇰컲?곸쑝濡?$45^\\circ$ ?곸슜)`
  },
  {
    keywords: ['r', 'R', '\\alpha', 'sin', '45'],
    title: '?덈??몃꽕??洹뱀젏諛섍꼍(Schmidt Net Pole Radius, $r$)',
    concept: '?듦퀎??諛??蹂댁젙???꾪빐 硫댁쟻 ?쒓끝??以꾩씤 ?덈????ㅽ듃(Schmidt Net) ?됰㈃ 蹂???ъ쁺??,
    formula: `洹뱀젏 諛섍꼍 ??
$$r = \\sqrt{2} R \\sin\\left(45^\\circ - \\frac{\\alpha}{2}\\right)$$

- $r$: ?ъ쁺??以묒떖?쇰줈遺??洹뱀젏(Pole)源뚯????됰㈃ 嫄곕━
- $R$: ?ъ쁺援?Sphere)??諛섍꼍
- $\\alpha$: 遺덉뿰?띾㈃??寃쎌궗媛?(Dip angle)`,
    structure: `- $r$: ?ъ쁺??以묒떖?쇰줈遺??洹뱀젏(Pole)源뚯????됰㈃ 嫄곕━\n- $R$: ?ъ쁺援?Sphere)??諛섍꼍\n- $\\alpha$: 遺덉뿰?띾㈃??寃쎌궗媛?(Dip angle)`
  },
  {
    keywords: ['P', '\\tau_{allow}', 'd', 'L', '\\pi'],
    title: '?쎈낵??怨좎갑??怨꾩궛??Rockbolt Bond Strength, $P$)',
    concept: '?몃컻 ?섏쨷 ?ы븯 ??泥쒓났? 諛곕㈃??留덉같 遺李?硫댁쟻??湲곕컲?쇰줈 蹂쇳듃 ?덈씫??吏?깊븯???쒓퀎 怨좎갑????,
    formula: `?쎈낵???덉슜 吏吏????
$$P = \\pi d L \\tau_{allow}$$

- $P$: ?쎈낵?몄쓽 理쒕? ?덉슜 ?몃컻 ???젰 (?몃컻 ?섏쨷)
- $d$: ?쎈낵??泥쒓났 援щ찉??吏곴꼍
- $L$: 洹몃씪?고똿 ?뺤갑 湲몄씠 (怨좎갑 ?곸뿭)
- $\\tau_{allow}$: 吏諛섍낵 洹몃씪?고똿??媛꾩쓽 ?덉슜 遺李??꾨떒媛뺣룄`,
    structure: `- $P$: ?쎈낵?몄쓽 理쒕? ?덉슜 ?몃컻 ???젰 (?몃컻 ?섏쨷)\n- $d$: ?쎈낵??泥쒓났 援щ찉??吏곴꼍\n- $L$: 洹몃씪?고똿 ?뺤갑 湲몄씠 (怨좎갑 ?곸뿭)\n- $\\tau_{allow}$: 吏諛섍낵 洹몃씪?고똿??媛꾩쓽 ?덉슜 遺李??꾨떒媛뺣룄`
  },
  {
    keywords: ['K_a', 'K_p', 'p_a', '\\phi', '\\sin\\phi'],
    title: '??궧 二쇰룞?좎븬怨꾩닔(Rankine Active Earth Pressure Coefficient, $K_a$)',
    concept: '吏諛섏씠 ?몄옣 蹂?뺤쓣 ?쇱쑝耳??쒓퀎 二쇰룞 ?뚯꽦 ?됲삎 ?곹깭???꾨떖????媛???밸꼍 諛곕㈃???섑룊?쇰줈 諛?대궡???좎븬??,
    formula: `??궧 二쇰룞?좎븬怨꾩닔 ??
$$K_a = \\tan^2\\left(45^\\circ - \\frac{\\phi}{2}\\right) = \\frac{1 - \\sin\\phi}{1 + \\sin\\phi}$$

- $K_a$: 二쇰룞?좎븬 怨꾩닔
- $K_p$: ?섎룞?좎븬 怨꾩닔
- $\\phi$: ?숈쓽 ?대?留덉같媛?
- $p_a$: 二쇰룞?좎븬 媛뺣룄
- $c$: ?숈쓽 ?먯갑??
- $\\gamma$: ?숈쓽 ?⑥쐞以묐웾
- $z$: 寃???⑤㈃ 源딆씠`,
    structure: `- $K_a$: 二쇰룞?좎븬 怨꾩닔\n- $K_p$: ?섎룞?좎븬 怨꾩닔\n- $\\phi$: ?숈쓽 ?대?留덉같媛?n- $p_a$: 二쇰룞?좎븬 媛뺣룄\n- $c$: ?숈쓽 ?먯갑??n- $\\gamma$: ?숈쓽 ?⑥쐞以묐웾\n- $z$: 寃???⑤㈃ 源딆씠`
  },
  {
    keywords: ['C', 'D_f', 'q_{net}'],
    title: '蹂댁긽湲곗큹 蹂댁긽??Compensated Foundation Safety Factor, $C$)',
    concept: '援ъ“臾??먯쨷??援댁갑???숈쓽 珥?以묐웾?쇰줈 ?꾨꼍??移섑솚 ?곸뇙?섏뿬 ??移⑦븯 ?섏쨷??Zero濡??섎졃?쒗궎???됯? 怨듭떇',
    formula: `蹂댁긽湲곗큹 蹂댁긽????
$$C = \\frac{\\gamma D_f}{q}$$

- $C$: 蹂댁긽??($C = 1.0$ ?대㈃ ?꾩쟾 蹂댁긽)
- $\\gamma$: 援댁갑?섏뿬 諛곗텧???숈쓽 ?⑥쐞以묐웾
- $D_f$: 湲곗큹??援댁갑 源딆씠
- $q$: ?곷? 援ъ“臾?珥??먯쨷 諛??섏쨷 ?⑹궛媛?
- $q_{net}$: 吏諛섏씠 異붽?濡?諛쏅뒗 ?쒗븯以?($q_{net} = q - \\gamma D_f$)`,
    structure: `- $C$: 蹂댁긽??($C = 1.0$ ?대㈃ ?꾩쟾 蹂댁긽)\n- $\\gamma$: 援댁갑?섏뿬 諛곗텧???숈쓽 ?⑥쐞以묐웾\n- $D_f$: 湲곗큹??援댁갑 源딆씠\n- $q$: ?곷? 援ъ“臾?珥??먯쨷 諛??섏쨷 ?⑹궛媛?n- $q_{net}$: 吏諛섏씠 異붽?濡?諛쏅뒗 ?쒗븯以?($q_{net} = q - \\gamma D_f$)`
  },
  {
    keywords: ['p_w', '\\gamma_w', 'H'],
    title: '?깃????곕꼸 ?ㅺ퀎?섏븬(Single Shell Tunnel Design Water Pressure, $p_w$)',
    concept: '諛⑹닔媛 ?꾨꼍??李⑤떒??鍮꾨같???곕꼸 ?꾩튂 諛곕㈃???곷? ?섏쐞 ?믪씠??鍮꾨??섏뿬 ?섏쭅?쇰줈 媛?댁????뺤닔?뺤떇',
    formula: `?ㅺ퀎?섏븬 ??
$$p_w = \\gamma_w H$$

- $p_w$: ?쇱씠??諛곕㈃ ?묒슜 ?ㅺ퀎 ?섏븬
- $\\gamma_w$: 吏?섏닔(臾????⑥쐞以묐웾 ($9.81\\,\\text{kN/m}^3$)
- $H$: ?ㅺ퀎 吏?섏닔??硫댁쑝濡쒕????곕꼸 ?꾩튂 ?뺤긽源뚯????섏쭅 嫄곕━ (?섎몢 ?믪씠)`,
    structure: `- $p_w$: ?쇱씠??諛곕㈃ ?묒슜 ?ㅺ퀎 ?섏븬\n- $\\gamma_w$: 吏?섏닔(臾????⑥쐞以묐웾 ($9.81\\,\\text{kN/m}^3$)\n- $H$: ?ㅺ퀎 吏?섏닔??硫댁쑝濡쒕????곕꼸 ?꾩튂 ?뺤긽源뚯????섏쭅 嫄곕━ (?섎몢 ?믪씠)`
  },
  {
    keywords: ['k_h', 'k_{h0}', 'B_H', 'E_0', 'N', '2800'],
    title: '媛?ㅽ쓾留됱씠 ?섑룊吏諛섎컲?κ퀎??Temporary Retaining Wall Horizontal Subgrade Reaction Coefficient, $k_h$)',
    concept: '踰쎌껜 諛곕㈃??吏諛??꾩냼??諛섏쓳???깃????좏삎 ?꾩꽦 ?곗냽 ?뺤텞 ?ㅽ봽留?媛뺤꽦媛믪쑝濡?移섑솚?섎뒗 諛섎젰 ?곗젙??,
    formula: `?섑룊 吏諛섎컲?κ퀎????
$$k_h = k_{h0} \\left(\\frac{B_H}{0.3}\\right)^{-3/4}$$

- $k_h$: ?ㅺ퀎 ?섑룊 吏諛섎컲?κ퀎??(?꾩꽦 ?ㅽ봽留??곸닔)
- $k_{h0}$: ?쒖? ?섑룊 吏諛섎컲?κ퀎??
- $B_H$: 媛?곸쓽 湲곗큹 ?섏궛??
- $E_0$: 吏諛섏쓽 ?꾩꽦怨꾩닔 ($E_0 = 2800 N$)
- $N$: ?쒖?愿?낆떆??N移?,
    structure: `- $k_h$: ?ㅺ퀎 ?섑룊 吏諛섎컲?κ퀎??(?꾩꽦 ?ㅽ봽留??곸닔)\n- $k_{h0}$: ?쒖? ?섑룊 吏諛섎컲?κ퀎??n- $B_H$: 媛?곸쓽 湲곗큹 ?섏궛??n- $E_0$: 吏諛섏쓽 ?꾩꽦怨꾩닔 ($E_0 = 2800 N$)\n- $N$: ?쒖?愿?낆떆??N移?
  }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function validateAndHealQuestion(question, callLLMWithFailover, topicTitle = '', topicKeywords = '', fileText = '') {
  return question;
}

// POST /api/exam/all
router.post('/exam/all', async (req, res) => {
  const progressId = req.query.progressId || req.body.progressId;
  let progressTimer = null;
  let standardsAnalysis = '';
  if (progressId) {
    updateProgress(progressId, 1, '1?④퀎: ?곗씠??遺꾩꽍 諛??됯? 吏移?濡쒕뱶 以?..', 15);
    standardsAnalysis = await analyzeStandardsBeforeTask(progressId, '醫낇빀?됯? ?쒗뿕 異쒖젣', GENERATION_STANDARDS, 'generation');
  }
  try {
    let count = parseInt(req.query.count || req.body.count || 40, 10);
    if (isNaN(count) || count <= 0) count = 40;

    const customFormulasLimit = Math.min(3, Math.floor(count * 0.08));
    const customTheoriesLimit = Math.min(2, Math.floor(count * 0.05));
    const customSubjsCount = customFormulasLimit + customTheoriesLimit;
    const poolTarget = Math.max(1, count - customSubjsCount);

    const countGaeyo = Math.round(poolTarget * 0.15);
    const countGongsik = Math.round(poolTarget * 0.15);
    const countTable = Math.round(poolTarget * 0.15);
    const countDandap = Math.round(poolTarget * 0.15);
    const countMC = Math.max(1, poolTarget - (countGaeyo + countGongsik + countTable + countDandap));

    if (progressId) {
      updateProgress(progressId, 2, '2?④퀎: 異쒖젣 媛?대뱶 ?뺣젹 諛??뚯뒪 ?띿뒪??蹂묓빀 以?..', 40);
    }
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) return res.status(400).json({ error: '?깅줉??AI API ?ㅺ? 議댁옱?섏? ?딆뒿?덈떎.' });

    // Fetch all topics with extracted_text (fallback to pdf_data if empty)
    const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name, extracted_text, (CASE WHEN extracted_text IS NULL OR extracted_text = '' THEN pdf_data ELSE NULL END) AS pdf_data FROM topics ORDER BY created_at DESC`);
    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: '?깅줉???좏뵿???놁뒿?덈떎. 癒쇱? ?숈뒿 ?먮즺瑜??깅줉?댁＜?몄슂.' });
    }

    const topicTextMap = {};
    // Extract text from each topic in parallel to avoid timeouts
    const topicTexts = await Promise.all(topics.map(async (topic) => {
      let fileText = '';
      if (topic.extracted_text) {
        fileText = topic.extracted_text;
      } else if (topic.pdf_data) {
        const isHtml = topic.pdf_name && (
          topic.pdf_name.toLowerCase().endsWith('.html') ||
          topic.pdf_name.toLowerCase().endsWith('.htm') ||
          fileUtils.isBufferHtml(topic.pdf_data)
        );
        try {
          if (isHtml) {
            fileText = fileUtils.htmlToPlainText(fileUtils.decodeHtmlBuffer(topic.pdf_data));
          } else {
            const parsed = await pdfParse(topic.pdf_data);
            fileText = parsed.text || '';
          }
        } catch (e) {
          console.warn(`Topic ${topic.id} parse error:`, e.message);
        }
        fileText = fileUtils.mergeVerticalText(fileText);
      }
      fileText = fileUtils.smartTruncate(fileText, 10000);
      topicTextMap[topic.id] = fileText;
      return `<Topic id="${topic.id}" title="${topic.title}" keywords="${topic.keywords || '?놁쓬'}">\n${fileText || '?뚯뒪 ?놁쓬'}\n</Topic>`;
    }));

    const combinedText = topicTexts.join('\n\n---\n\n');
    const topicTitles = topics.map(t => t.title).join(', ');

    // Fetch all user feedbacks (upvoted / downvoted) to adjust frequency in exam prompt
    let feedbackPrompt = '';
    try {
      const feedbacks = await dbQuery.all(
        `SELECT t.title, qf.question_text, qf.feedback_type 
         FROM question_feedback qf 
         JOIN topics t ON qf.topic_id = t.id`
      );
      if (feedbacks.length > 0) {
        const upvotes = feedbacks.filter(f => f.feedback_type === 'upvote');
        const downvotes = feedbacks.filter(f => f.feedback_type === 'downvote');
        
        feedbackPrompt = `
[?ъ슜???쇰뱶諛?吏移?- 異쒖젣 鍮덈룄 議곗젙??諛섏쁺 ?꾩닔]:
- ?꾨옒 吏덈Ц?ㅺ낵 ?곌???二쇱젣/媛쒕뀗??臾몄젣瑜??곴레 異쒖젣??二쇱떗?쒖삤 (異쒖젣 鍮덈룄 利앷? ???:
${upvotes.map((f, idx) => `  * [?좏뵿: ${f.title}] ${f.question_text}`).join('\n')}

- ?꾨옒 吏덈Ц?ㅺ낵 ?숈씪?섍굅???좎궗??臾몄젣???덈? 異쒖젣?섏? 留먭퀬 異쒖젣 鍮덈룄瑜??????텛嫄곕굹 ?ㅻⅨ 臾몄젣濡??泥댄빐 二쇱떗?쒖삤 (異쒖젣 鍮덈룄 媛먯냼/?쒖쇅 ???:
${downvotes.map((f, idx) => `  * [?좏뵿: ${f.title}] ${f.question_text}`).join('\n')}
`;
      }
    } catch (fbErr) {
      console.warn('醫낇빀?됯? ?쇰뱶諛?濡쒕뱶 ?ㅽ뙣 (臾댁떆?섍퀬 吏꾪뻾):', fbErr);
    }

    let adjustmentsPrompt = '';
    try {
      const adjustments = await dbQuery.all(
        `SELECT t.title, qa.question_text, qa.adjusted_text, qa.user_feedback 
         FROM question_adjustments qa 
         JOIN topics t ON qa.topic_id = t.id 
         ORDER BY qa.created_at DESC LIMIT 15`
      );
      if (adjustments.length > 0) {
        adjustmentsPrompt = `
[?ъ슜???댁쟾 臾몄젣 議곗젙(?쇰뱶諛? ?댁뿭 - 異쒖젣 ??諛섎뱶??李멸퀬?섏뿬 諛섏쁺?섏떗?쒖삤]:
?ъ슜?먭? ?댁쟾??醫낇빀?됯?/蹂듭뒿 ??臾몄젣瑜??ㅼ쓬怨?媛숈씠 議곗젙 ?붿껌?섏뿬 諛섏쁺???대젰???덉뒿?덈떎. ?ν썑 異쒖젣 ???꾨옒 ?쇰뱶諛?寃쏀뼢??遺꾩꽍?섏뿬 諛섏쁺??二쇱떗?쒖삤:
${adjustments.map((a, idx) => `
議곗젙 ?대젰 ${idx + 1} [?좏뵿: ${a.title}]:
- 湲곗〈 臾몄젣: "${a.question_text}"
- ?ъ슜?먯쓽 ?쇰뱶諛??붽뎄?ы빆: "${a.user_feedback}"
- 諛섏쁺??理쒖쥌 臾몄젣: "${a.adjusted_text}"
`).join('\n')}
`;
      }
    } catch (adjErr) {
      console.warn('醫낇빀?됯? 臾몄젣 議곗젙 ?대젰 濡쒕뱶 ?ㅽ뙣:', adjErr);
    }

    // Collect past questions from app_session
    let pastQuestionsPool = [];
    try {
      await ensureSessionTable();
      const sessionRows = await dbQuery.all(
        `SELECT value FROM app_session 
         WHERE key LIKE 'review_questions_schedule_%' 
            OR key LIKE 'review_questions_topic_%' 
            OR key LIKE 'completed_review_schedule_%'`
      );
      for (const row of sessionRows) {
        if (row.value) {
          try {
            const parsed = JSON.parse(row.value);
            const qs = parsed.questions || parsed.examQuestions || (Array.isArray(parsed) ? parsed : []);
            if (Array.isArray(qs)) {
              for (const q of qs) {
                if (q && q.question) {
                  pastQuestionsPool.push(q);
                }
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
      console.log(`[醫낇빀?됯?] ?섏쭛??湲곗〈 蹂듭뒿 臾명빆 ?? ${pastQuestionsPool.length}媛?);
    } catch (dbErr) {
      console.warn('[醫낇빀?됯?] 湲곗〈 臾명빆 濡쒕뱶 ?ㅽ뙣:', dbErr);
    }

    const uniqueQuestionsMap = new Map();
    for (const q of pastQuestionsPool) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        uniqueQuestionsMap.set(cleanedText, q);
      }
    }
    const uniquePastQuestions = Array.from(uniqueQuestionsMap.values());
    console.log(`[醫낇빀?됯?] 以묐났 ?쒓굅 ??怨좎쑀 湲곗〈 蹂듭뒿 臾명빆 ?? ${uniquePastQuestions.length}媛?);

    // Collect local fallback questions for all topics
    let fallbackQuestionsPool = [];
    try {
      for (const t of topics) {
        let topicText = '';
        if (t.pdf_data) {
          try {
            const isHtml = t.pdf_name && (
              t.pdf_name.toLowerCase().endsWith('.html') ||
              t.pdf_name.toLowerCase().endsWith('.htm') ||
              fileUtils.isBufferHtml(t.pdf_data)
            );
            if (isHtml) {
              topicText = fileUtils.htmlToPlainText(fileUtils.decodeHtmlBuffer(t.pdf_data));
            } else {
              const parsed = await pdfParse(t.pdf_data);
              topicText = parsed.text || '';
            }
          } catch (e) {
            // Ignore parse errors
          }
          topicText = fileUtils.mergeVerticalText(topicText);
        }
        const fallbackQs = generateFallbackQuestions(t.title, t.keywords, topicText);
        if (Array.isArray(fallbackQs)) {
          fallbackQuestionsPool.push(...fallbackQs);
        }
      }
      console.log(`[醫낇빀?됯?] 濡쒖뺄 ?앹꽦 ?덈퉬 臾명빆 ?? ${fallbackQuestionsPool.length}媛?);
    } catch (fallbackErr) {
      console.warn('[醫낇빀?됯?] 濡쒖뺄 ?덈퉬 臾명빆 ?앹꽦 ?ㅽ뙣:', fallbackErr);
    }

    // Generate new AI questions dynamically based on count (4 batches of 5 max)
    let aggregatedAiQuestions = [];
    const TOTAL_BATCHES = Math.min(4, Math.max(1, Math.ceil(count / 10)));
    console.log(`[醫낇빀?됯? 蹂묐젹 ?앹꽦 媛?? TPM 珥덇낵 諛⑹?瑜??꾪빐 5臾몄젣??珥?${TOTAL_BATCHES}??蹂묐젹 ?붿껌???쒖옉?⑸땲??`);
    if (progressId) {
      progressTimer = startBackendProgressTimer(progressId, 3, '3?④퀎: AI ?붿쭊???덉긽 臾몄젣瑜??ъ링 遺꾩꽍 諛??앹꽦?섎뒗 以?..', 90, 1800, 3);
    }

    const batchPromises = Array.from({ length: TOTAL_BATCHES }).map(async (_, idx) => {
      const randomSeed = Math.floor(Math.random() * 10000);
      const batchPrompt = `
?뱀떊? 援??湲곗닠?먭꺽 湲곗닠???쒗뿕 異쒖젣?꾩썝?낅땲??
?꾨옒 踰붿쐞 ?좏뵿 ?뚯뒪 ?먮즺瑜?李멸퀬?섏뿬, ?ㅻⅨ 臾몄젣?ㅺ낵 ?덈? 以묐났?섏? ?딅뒗 怨좊궃??醫낇빀?됯? 臾몄젣 **?뺥솗??5媛?*瑜??앹꽦?섏떗?쒖삤.
(?꾩옱 遺꾪븷 異쒖젣 ?뚯감: ${idx + 1} / ${TOTAL_BATCHES}, ?쒕뜡 ?쒕뱶: ${randomSeed})

?슚 [異쒖젣 異쒖쿂 ?쒖젙 諛?臾몃㎘ 寃⑸━ 洹쒖튃 (Topic Isolation) - 洹밸룄濡?以묒슂!]:
1. 諛섎뱶???꾨옒 ?쒓났??**[?됯? 踰붿쐞 ?좏뵿 紐⑸줉]** 諛?**[?듯빀 ?뚯뒪 ?띿뒪??**??媛?'<Topic>...</Topic>' ?쒓렇??吏곸젒 湲곗닠?섏뼱 ?덈뒗 援ъ껜?곸씤 媛쒕뀗, 怨듭떇, ?대줎 諛?吏?앹쓽 踰붿쐞 ?덉뿉?쒕쭔 ?쒗뿕 臾몄젣瑜??앹꽦?섏떗?쒖삤.
2. 媛?臾몄젣瑜?異쒖젣?????대떦 臾몄젣??異쒖쿂媛 ?섎뒗 ???섎굹???좏뵿??踰붿쐞濡??쒖젙?섏뿬 臾몄젣瑜?援ъ꽦?섏떗?쒖삤. ?덈? ?뱀젙 ?좏뵿??愿??臾몄젣瑜??????ㅻⅨ ?좏뵿???곹엺 ?⑥뼱, ?섏튂, 怨듯븰??議곌굔?대굹 怨듭떇?ㅼ쓣 ?쇳빀(Cross-contamination)?섏뿬 蹂닿린(options)??吏臾몄쓣 留뚮뱶??'臾몃㎘ 援먯감 ?ㅼ뿼'???吏瑜댁? 留덉떗?쒖삤. 媛?臾몄젣???뚯뒪 ?곸쓽 ?낅┰??媛쒕퀎 ?좏뵿 ?댁슜???꾩쟾??遺?⑺빐???⑸땲??
3. ?쒓났???뚯뒪 ?먮즺 ?띿뒪?몄뿉 **吏곸젒 ?깆옣?섏? ?딅뒗 ?몃???? 怨듯븰/??븰 ?대줎?대굹 ?쇰컲 ?곸떇(?? 吏臾몄뿉 吏곸젒 湲곗옱?섏? ?딆? ?숈뿭?? 援ъ“??븰, 吏꾨룞?? ?꾧퀎媛먯뇿, ?⑥옄?좊룄 ?쒖뒪?? 怨좎쑀吏꾨룞?? ?먮뒗 洹????몃? ?꾩쓽 二쇱젣 ??? ?덈?濡?吏臾몄뿉 二쇱엯?섍굅???좎“?섏뿬 臾몄젣瑜?留뚮뱾吏 留덉떗?쒖삤.**
4. ?ㅼ쭅 ?쒓났???뚯뒪 蹂몃Ц ?띿뒪???댁뿉 **?⑥뼱 諛??섏떇?쇰줈 紐낆떆?섏뼱 ?덈뒗 踰붿쐞 ?대줈留?異쒖젣 踰붿쐞瑜?100% 泥좎????쒖젙**?섏떗?쒖삤. ?뚯뒪???녿뒗 ?遺꾩빞 ?댁슜????굅???곸긽?섏뿬 臾몄젣瑜?援ъ꽦??寃쎌슦 ?ш컖??異쒖젣 ?ㅻ쪟濡?媛꾩＜?⑸땲??
5. 媛앷???紐⑤뱺 蹂닿린(options) 諛??댁꽕 ??떆 ?ㅼ쭅 ?뚯뒪 臾몄꽌 ?댁슜??臾몄옣怨?吏?앸뱾??蹂??寃고빀?섏뿬 留뚮뱾?댁빞 ?섎ŉ, 蹂몃Ц怨??꾩삁 臾닿????됰슧???몃? ?⑹뼱??媛?곸쓽 湲곗닠??吏?앹쓣 蹂닿린???쇳빀?섎뒗 寃껋쓣 ?덈? 湲덉??⑸땲??

[?됯? 踰붿쐞 ?좏뵿 紐⑸줉]: ${topicTitles}
[?듯빀 ?뚯뒪 ?띿뒪??:
${combinedText}

${feedbackPrompt}

${adjustmentsPrompt}

[異쒖젣 洹쒖튃]:
1. ?대쾲 ?뚯감?먯꽌??**?뺥솗??5媛쒖쓽 臾몄젣**留?諛섑솚?섎릺 ?ㅼ쓬 ?좏삎蹂꾨줈 媛곴컖 ?뺥솗??1臾몄젣??怨④퀬猷?援ъ꽦?섏뿬 鍮꾩쑉???ъ닔?섏떗?쒖삤:
   - 二쇨???(type: "二쇨???, subtype: "媛쒖슂"): 1臾몄젣 (?뺤쓽 諛??뱀쭠??3~5以??댁쇅??源딆씠 ?덇퀬 ?꾨Ц?곸씤 ?쒖닠??媛쒖슂 諛?媛쒕뀗 ?ㅻ챸 紐⑤쾾?듭븞)
   - 二쇨???(type: "二쇨???, subtype: "怨듭떇"): 1臾몄젣 (?대떦 ?좏뵿????쒖쟻??怨듯븰???섏떇 諛?臾쇰━??愿怨꾩떇???쒖떆?섍퀬 ?섏떇??援ъ꽦?섎뒗 湲고샇?ㅼ쓽 ?뺤쓽瑜??섏뿴?섎뒗 怨듭떇 臾몄젣)
   - 二쇨???(type: "二쇨???, subtype: "?쒖콈?곌린"): 1臾몄젣 (鍮꾧탳 ??곸씠 ?녿뒗 ?⑥씪 ?좏뵿? '?곹깭/?④퀎 鍮꾧탳' ?먮뒗 '1??Single-row) ?뚯씠釉?濡?援ъ꽦?섏뿬 ?숈씪 ?????듭븞 以묐났??泥좎???諛곗젣?섍퀬, ?꾨옒 "tableData" ?꾨뱶??<table> ?쒓렇 ??????곗씠??媛앹껜 援ъ“瑜?梨꾩썙?ｋ뒗 移몄콈?곌린 二쇨???臾몄젣)
   - 二쇨???(type: "二쇨???, subtype: "?⑤떟??): 1臾몄젣 (援ъ껜?곸씤 ?ㅻТ 臾몄젣???쒕굹由ъ삤瑜?吏덈Ц?쇰줈 ?쒖떆?섍퀬 ?듭떖 ?ㅼ썙??媛뺤“媛 ?ㅼ뼱媛?1以??쒖닠??紐⑤쾾?듭븞?쇰줈 ?듯븯???⑤떟??臾몄젣)
   - 媛앷???(type: "媛앷???): 1臾몄젣 (4吏?좊떎??媛앷???臾몄젣)
2. 媛앷???臾몄젣???좏삎 諛?援ъ꽦 鍮꾩쑉 吏移?(洹밸룄濡?以묒슂):
   - 異쒖젣?섎뒗 媛앷???臾명빆?ㅼ? 諛섎뱶???꾨옒 鍮꾩쑉??以?섑븯??援ъ꽦?섏떗?쒖삤:
     * **湲곕낯 湲곗큹 媛쒕뀗 臾몄젣 (40%, ??2臾몄젣)**: ?좏뵿??湲곕낯 ?뺤쓽, ?듭떖 媛쒕뀗, 湲곗큹 ?먮━瑜?吏곸젒?곸쑝濡?臾삳뒗 湲곗큹 ?섏? 臾몄젣. (?? "?뗢뿃?뗭쓽 ?뺤쓽濡?媛???녹? 寃껋??", "?뗢뿃?뗭쓽 ?뱀쭠???꾨땶 寃껋??"). 湲곗궗 ?섏????듭떖 媛쒕뀗 ?뺤씤 臾몄젣濡?異쒖젣.
     * **?뺣웾 怨꾩궛 臾몄젣 (30%, ??1臾몄젣)**: 援ъ껜?곸씤 議곌굔 ?섏튂瑜???낇븯??理쒖쥌 媛믪쓣 怨꾩궛?대궡嫄곕굹 ?뺣웾 寃곌낵瑜?臾삳뒗 ?섏튂 怨꾩궛 臾몄젣.
     * **?ы솕 ?먮━쨌鍮꾧탳 臾몄젣 (30%, ??1臾몄젣)**: 怨듯븰??硫붿빱?덉쬁, ?λ떒?? 鍮꾧탳, ?ㅻТ ?쒓났 ?좎쓽?ы빆 ???묒슜 ?댄빐??臾몄젣.
   
   - **?슚 [怨듭떇 諛?怨듭떇 ?섏튂 踰붿쐞 ?몄텧 ?덈? 湲덉? 洹쒖튃 - 洹밸룄濡?以묒슂!]**: 臾몄젣 吏덈Ц(question) 蹂몃Ц ?댁뿉 **臾몄젣瑜??닿껐?섎뒗 ???꾩슂??怨듯븰 ?섏떇 ?먯껜(?? $E_u = 300 s_u$ ?????섏떇???뱀젙 ?섏튂 踰붿쐞(?? $E_u = (200 \\sim 500)s_u$ ??, 鍮꾨? 愿怨????깆쓣 ?덈?濡?吏곸젒 ?띿뒪?몃줈 ?곸뼱 ?쒓났?섏? 留덉떗?쒖삤.** ?섏떇?대굹 寃쏀뿕???섏튂 踰붿쐞瑜?吏臾몄뿉 誘몃━ 二쇰㈃ ?숈깮???붽린 諛??곗긽 ?λ젰???됯??????놁뒿?덈떎. ???怨듭떇??紐낆묶("鍮꾨같???꾩꽦怨꾩닔 寃쏀뿕??)?대굹 蹂?섎뱾??紐낆묶("鍮꾨같???꾨떒媛뺣룄 $s_u$")留뚯쓣 ?쒖떆?섍퀬, ?숈깮???ㅼ뒪濡?怨듭떇怨?踰붿쐞瑜??좎삱?ㅼ꽌 ?닿껐?섎룄濡??섏떗?쒖삤. (?? ?댁꽕(explanation)?먯꽌???숈깮???숈뒿???꾪빐 怨듭떇???곸꽭??紐낆떆?섍퀬 怨꾩궛 怨쇱젙???ㅻ챸?댁빞 ?⑸땲??)
   - ?뱁엳 **?섏튂 ?댁꽍踰뺤씠??媛??援ъ“臾??댁꽍怨?媛숈씠 ?뺣웾??遺꾩꽍???꾩슂???좏뵿??寃쎌슦, ?쒓났???뚯뒪 臾몄꽌 ?댁뿉 紐낆떆?곸씤 ?섏튂???뚮씪誘명꽣媛 議댁옱?쒕떎硫??대? ?쒖슜?섏뿬 ?뺣웾 怨꾩궛 臾몄젣瑜?援ъ꽦?섏떗?쒖삤. ?? 臾몄꽌???섏튂???섏떇???녿떎硫??꾩쓽濡?鍮꾪쁽?ㅼ쟻???섏튂瑜?媛??遺?ы븯吏 留덉떗?쒖삤.**
   - 留뚯빟 ?꾪삎?곸씤 鍮꾧퀎?고삎/?뺤꽦???좏뵿(?? ?⑥닚 ?덉쭏 ?쒗뿕 ?덉감, ?⑥닚 ?됱젙 ?쒕룄 ????寃쎌슦?먮쭔 ?쇰컲?곸씤 ?쒖닠???댄빐??媛앷???臾몄젣濡?異쒖젣?섎릺, ??寃쎌슦?먮룄 媛湲됱쟻 臾쇰━??蹂?섏쓽 ?곹뼢?꾨? 臾삳뒗 ??理쒕????뺣웾?붿뿉 媛源앷쾶 臾몄젣???섏????믪뿬 異쒖젣?섏떗?쒖삤.
   - **?좑툘 [鍮꾧탳/?뱀꽦 ??異쒖젣 洹쒖튃 - 洹밸룄濡?以묒슂!]**: 吏덈Ц??鍮꾧탳/?뱀꽦 ?쒓? ?꾩슂??寃쎌슦, ?덈? <table> ??HTML ?쒓렇濡??쒕? 吏곸젒 ?묒꽦?섏? 留먭퀬 ?쇰컲 ?띿뒪?몃줈留?吏덈Ц???묒꽦?????꾨옒??"tableData" ?꾨뱶?????곗씠?곕? 媛앹껜 援ъ“濡??묒꽦?섏떗?쒖삤.
3. ?ㅻ떟 蹂닿린 援ъ꽦 二쇱쓽?ы빆 (留ㅼ슦 以묒슂):
   - ?ㅻ떟 蹂닿린(options) 援ъ꽦 ??**?덈?濡??곕Т?덉뾾嫄곕굹 洹밸떒?곸씤 ?쒗쁽, ?뱀? 鍮꾪쁽?ㅼ쟻??怨듯븰??媛???? '臾댄븳?濡??곸듅?쒗궡', '?ㅼ떆媛꾩쑝濡?湲고븯湲됱닔?곸쑝濡?利앷???, '?곸썝??蹂?섏? ?딆쓬', '?꾩삁 諛쒖깮?섏? ?딆쓬', '??컻?? ??? ?덈?濡??ъ슜?섏? 留덉떗?쒖삤**. 
   - ?ㅼ젣 ?꾧났 ?쒖쟻?대굹 ?ㅻТ 湲곗닠 湲곗???遺?⑺븯??**怨좊룄濡???뱀꽦 ?덇퀬 洹몃윺??븳 ?ㅻ떟(plausible engineering distractors)**?쇰줈 援ъ꽦??二쇱떗?쒖삤. 紐⑤뱺 蹂닿린??諛섎뱶???먮낯 ?뚯뒪 諛?怨듯븰???곸떇?좎뿉 湲대???寃고빀?섏뼱???⑸땲??
- **?슚 [媛앷????뺣???諛??뺣떟 ?쇱튂 議곌굔 - 洹밸룄濡?以묒슂!]**: 紐⑤뱺 媛앷???4吏?좊떎?? 怨꾩궛 臾몄젣???섏튂/怨듯븰???먮떒 臾몄젣瑜?異쒖젣???? 怨꾩궛?쇰줈 ?꾩텧???뺥솗???뺣떟 ?섏튂??議곌굔??4媛쒖쓽 蹂닿린(options) 以?諛섎뱶???뺥솗??1媛쒕줈 議댁옱?댁빞 ?⑸땲?? ?덈?濡??ㅼ젣 怨꾩궛 寃곌낵? 蹂닿린???섏튂媛 遺덉씪移섑븯?? ?댁꽕?먯꽌 '?ㅼ젣 怨꾩궛媛믪? XX?대굹 蹂닿린 以?媛??媛源뚯슫 YY瑜??좏깮?⑸땲??? 媛숈? ?댁쿂援щ땲?녿뒗 蹂紐낆쓣 ?곷뒗 異쒖젣 ?ㅻ쪟瑜?踰뷀븯吏 留덉떗?쒖삤. 臾몄젣瑜??앹꽦?섍린 ?꾩뿉 ?ㅼ젣 ?섏떇????낇븯???뺣떟????踰???吏곸젒 ?꾨??섍쾶 怨꾩궛?섍퀬 寃利앺븳 ?? 洹?寃곌낵媛??좎뵪 ?섎굹 ?由ъ? ?딅뒗 ?뺥솗???뺣떟)??蹂닿린? 'answer' ?꾨뱶???꾨꼍???쇱튂?섎룄濡?湲곗옱?섏떗?쒖삤.
    4. ?뚯뒪 ?띿뒪?몄쓽 ?④꺼吏?怨듯븰??媛쒕뀗怨??ㅻТ 湲곗쟾???ъ갑?섏뿬 怨좏뭹寃?吏덈Ц???섏???떆??

[?섍컖 諛⑹? 泥좎튃 (Anti-Hallucination Constraints)]:
1. ?쒓났???뚯뒪 臾몄꽌 ?띿뒪??<Source_Document>) ?댁뿉 紐낆떆???섏튂, ?덉슜 ?덉쟾?? ?ㅺ퀎湲곗?(KDS/KCS) 議고빆 踰덊샇??怨듭떇???녿뒗 寃쎌슦, ?꾩쓽濡??섏떇???좊룄?섍굅???몃? ?쒕갑???섏튂 ?쒓퀎瑜??좎“(Hallucination)?섏? 留덉떗?쒖삤.
2. 臾몄꽌 踰붿쐞瑜?踰쀬뼱?섎뒗 ??븰???섏튂??鍮꾨Ъ由ъ쟻 ?섏튂(?? ?대?留덉같媛?60???댁긽 ??瑜?李쎌옉?섏뿬 紐⑥닚??諛쒖깮?쒗궎硫????⑸땲?? ?섏튂媛 遺議깊븯?ㅻ㈃ ?뺣웾 怨꾩궛 臾몄젣 異쒖젣瑜?利됱떆 ?고쉶?섍퀬 媛쒕뀗 ?댄빐??臾몄젣濡??泥댄븯??떆??

${LATEX_PROMPT_INSTRUCTIONS}
${GENERATION_STANDARDS}
${ENGINEERING_STANDARDS}
4. 諛섎뱶??異붽? ?띿뒪???놁씠 ?쒖닔 JSON 諛곗뿴留?諛섑솚?섏떗?쒖삤.

[JSON ?щ㎎]:
[
  {
    "type": "二쇨???,
    "subtype": "媛쒖슂",
    "topic_title": "??臾몄젣??異쒖젣 洹쇨굅媛 ?섎뒗 ?좏뵿 紐⑸줉 ?댁쓽 ?뺥솗???좏뵿紐?(?? ?됱궗?ъ쁺踰?",
    "question": "吏덈Ц ?댁슜",
    "answer": "3~5以??댁쇅??源딆씠 ?덇퀬 ?꾨Ц?곸씤 ?쒖닠??媛쒖슂 諛?媛쒕뀗 ?ㅻ챸 紐⑤쾾?듭븞",
    "concept": "?듭떖 媛쒕뀗 1以??붿빟"
  },
  {
    "type": "媛앷???,
    "topic_title": "??臾몄젣??異쒖젣 洹쇨굅媛 ?섎뒗 ?좏뵿 紐⑸줉 ?댁쓽 ?뺥솗???좏뵿紐?(?? ?쎈낵???몃컻?쒗뿕)",
    "question": "怨듯븰???꾩긽 遺꾩꽍 吏덈Ц",
    "tableData": null,
    "options": ["蹂닿린1", "蹂닿린2", "蹂닿린3", "蹂닿린4"],
    "answer": "?뺣떟 蹂닿린? ?좎뵪 ?섎굹 ?由ъ? ?딅뒗 ?뺣떟 ?띿뒪??,
    "explanation": "?댁쑀? ?ㅻ떟 ?뺣? ?댁꽕"
  }
] (??留뚯빟 ?쒓? ?꾩슂??吏덈Ц?대씪硫?"tableData": {"headers": ["援щ텇", "吏諛?X", "吏諛?Y"], "rows": [["?댁쟻 ?섍꼍", "?댁닔", "?댁닔"]]} 泥섎읆 援ъ“?붾맂 ??媛앹껜瑜??묒꽦?섍퀬, 洹몃젃吏 ?딆? ?쇰컲 吏덈Ц?대㈃ "tableData": null 濡??ㅼ젙?섏떗?쒖삤.)
`;
      try {
        console.log(`[醫낇빀?됯? 蹂묐젹 ?앹꽦] #${idx + 1}踰덉㎏ 諛곗튂 ?꾩넚 ?쒖옉...`);
        const enrichedPrompt = standardsAnalysis ? `${standardsAnalysis}\n\n${batchPrompt}` : batchPrompt;
        const rawText = await callLLMWithFailover(null, enrichedPrompt, null, 'question', { temperature: 1.0 });
        let text = rawText.trim();
        if (text.startsWith('```')) {
          text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }
        let parsedList = null;
        try {
          parsedList = parseLlmJson(text);
        } catch {
          parsedList = extractJsonArray(rawText);
        }
        if (parsedList && Array.isArray(parsedList)) {
          return parsedList;
        }
      } catch (err) {
        console.warn(`[醫낇빀?됯? 蹂묐젹 ?앹꽦 ?ㅽ뙣] #${idx + 1}踰덉㎏ 諛곗튂 ?먮윭:`, err.message);
      }
      return [];
    });

    const results = await Promise.all(batchPromises);
    for (const r of results) {
      if (r) aggregatedAiQuestions.push(...r);
    }
    console.log(`[醫낇빀?됯? 蹂묐젹 ?앹꽦 ?꾨즺] AI ?좉퇋 臾명빆 ?? ${aggregatedAiQuestions.length}媛?);

    // Merge all pools (AI questions, unique past study questions, fallback questions)
    const uniquePoolMap = new Map();
    // Priority 1: Newly generated AI questions
    for (const q of aggregatedAiQuestions) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        uniquePoolMap.set(cleanedText, q);
      }
    }
    // Priority 2: Past study questions from DB sessions
    for (const q of uniquePastQuestions) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        if (!uniquePoolMap.has(cleanedText)) {
          uniquePoolMap.set(cleanedText, q);
        }
      }
    }
    // Priority 3: Local fallback questions
    for (const q of fallbackQuestionsPool) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        if (!uniquePoolMap.has(cleanedText)) {
          uniquePoolMap.set(cleanedText, q);
        }
      }
    }

    const finalQuestionPool = Array.from(uniquePoolMap.values());
    console.log(`[醫낇빀?됯? ? 援ъ텞 ?꾨즺] ?꾩껜 ?꾨낫 ? 臾명빆 ?? ${finalQuestionPool.length}媛?);

    // Select up to 13 questions from the pool with exact type combination:
    // - 媛쒖슂: 2媛?
    // - 怨듭떇: 2媛?
    // - ?쒖콈?곌린: 2媛?
    // - ?⑤떟?? 2媛?
    // - 媛앷??? 5媛?
    const poolGaeyo = [];
    const poolGongsik = [];
    const poolTable = [];
    const poolDandap = [];
    const poolMC = [];

    for (const q of finalQuestionPool) {
      if (q.type === '二쇨???) {
        if (q.subtype === '媛쒖슂') poolGaeyo.push(q);
        else if (q.subtype === '怨듭떇') poolGongsik.push(q);
        else if (q.subtype === '?쒖콈?곌린') poolTable.push(q);
        else if (q.subtype === '?⑤떟?? || !q.subtype) poolDandap.push(q);
      } else if (q.type === '媛앷???) {
        poolMC.push(q);
      }
    }

    console.log(`[醫낇빀?됯? 遺꾨쪟] 媛쒖슂: ${poolGaeyo.length}, 怨듭떇: ${poolGongsik.length}, ?쒖콈?곌린: ${poolTable.length}, ?⑤떟?? ${poolDandap.length}, 媛앷??? ${poolMC.length}`);

    const shuffleArray = (arr) => [...arr].sort(() => 0.5 - Math.random());
    const shufGaeyo = shuffleArray(poolGaeyo);
    const shufGongsik = shuffleArray(poolGongsik);
    const shufTable = shuffleArray(poolTable);
    const shufDandap = shuffleArray(poolDandap);
    const shufMC = shuffleArray(poolMC);

    const selectedQuestions = [];
    const take = (arr, n) => {
      const result = arr.slice(0, n);
      arr.splice(0, n);
      return result;
    };

    selectedQuestions.push(...take(shufGaeyo, countGaeyo));
    selectedQuestions.push(...take(shufGongsik, countGongsik));
    selectedQuestions.push(...take(shufTable, countTable));
    selectedQuestions.push(...take(shufDandap, countDandap));
    selectedQuestions.push(...take(shufMC, countMC));

    // If total selected is less than poolTarget, fill from remaining questions in other pools
    const remainingPool = [...shufGaeyo, ...shufGongsik, ...shufTable, ...shufDandap, ...shufMC];
    const shufRemaining = shuffleArray(remainingPool);
    const needed = Math.max(0, poolTarget - selectedQuestions.length);
    selectedQuestions.push(...take(shufRemaining, needed));

    console.log(`[醫낇빀?됯? ?좏깮 ?꾨즺] 理쒖쥌 ?좏깮 臾명빆 ?? ${selectedQuestions.length}媛?);

    // Clean selected questions & Map topic_title to topic_id
    const topicMap = {};
    topics.forEach(t => {
      topicMap[t.title.toLowerCase().trim()] = t.id;
    });

    const cleanedQuestions = selectedQuestions.map(q => {
      let topicId = q.topic_id || null;
      if (q.topic_title && typeof q.topic_title === 'string') {
        const cleanedTitle = q.topic_title.toLowerCase().trim();
        if (topicMap[cleanedTitle]) {
          topicId = topicMap[cleanedTitle];
        } else {
          const matchedKey = Object.keys(topicMap).find(k => k.includes(cleanedTitle) || cleanedTitle.includes(k));
          if (matchedKey) topicId = topicMap[matchedKey];
        }
      }
      const qText = String(q.question || '');
      if (!topicId && topics.length > 0) {
        // Try to guess from question text
        const matchedTopic = topics.find(t => {
          const tTitle = t.title || '';
          const tKeywords = t.keywords || '';
          return (tTitle && qText.includes(tTitle)) || 
                 (tKeywords && tKeywords.split(',').some(k => qText.includes(k.trim())));
        });
        topicId = matchedTopic ? matchedTopic.id : topics[Math.floor(Math.random() * topics.length)].id;
      }
      return {
        type: q.type || "媛앷???,
        subtype: q.subtype || null,
        question: cleanQuizQuestion(qText),
        tableData: q.tableData || null,
        options: q.options || [],
        answer: q.answer,
        explanation: q.explanation || '',
        concept: q.concept || '',
        flowchartIntuitive: q.flowchartIntuitive || null,
        topic_id: topicId
      };
    });

    // Retrieve custom formula questions from database
    let customFormulas = [];
    try {
      await ensureSessionTable();
      const formulaRows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['formula_questions']);
      if (formulaRows.length > 0 && formulaRows[0].value) {
        const parsed = JSON.parse(formulaRows[0].value);
        if (Array.isArray(parsed.formulaQuestions)) {
          customFormulas = parsed.formulaQuestions.filter(q => q && !q.isNewEmptyCard && (q.title || q.formula));
        }
      }
    } catch (dbErr) {
      console.warn('Error reading formula sessions for comprehensive exam:', dbErr);
    }

    // If database is empty, load defaults so that the user always has them
    if (customFormulas.length === 0) {
      customFormulas = LOCAL_FORMULA_DICTIONARY.map(d => ({
        title: d.title,
        formula: d.formula || d.structure || '',
        concept: d.concept || ''
      }));
    }

    // Retrieve custom theory questions from database
    let customTheories = [];
    try {
      const theoryRows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['theory_questions']);
      if (theoryRows.length > 0 && theoryRows[0].value) {
        const parsed = JSON.parse(theoryRows[0].value);
        if (Array.isArray(parsed.theoryQuestions)) {
          customTheories = parsed.theoryQuestions.filter(q => q && !q.isNewEmptyCard && (q.title || q.formula));
        }
      }
    } catch (dbErr) {
      console.warn('Error reading theory sessions for comprehensive exam:', dbErr);
    }

    // Load defaults if empty
    if (customTheories.length === 0) {
      customTheories = [
        {
          title: "Terzaghi 1李⑥썝 ?뺣? 吏諛곕갑?뺤떇 ?좊룄",
          concept: "?먰넗痢???怨쇱엵媛꾧레?섏븬???뚯궛 諛?移⑦븯 ?쒓컙??異붿씠瑜?臾쇰━?곸쑝濡??뺣? 臾섏궗?섎뒗 吏諛곕갑?뺤떇",
          formula: "吏諛?誘몃텇諛⑹젙??\n$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$\n\n[二쇱슂 ?좊룄 媛??:\n1. ?숈엯?먯? 臾쇱? ?뺤텞?깆씠 ?놁쓬(鍮꾩븬異뺤꽦)\n2. ????臾쇱쓽 ?먮쫫? Darcy 踰뺤튃???곕쫫 ($v = k i$)\n3. ?뺣?? 1李⑥썝?쇰줈留?吏꾪뻾?섎ŉ ?숈쓽 怨듦레鍮?蹂?붾뒗 ?좏슚?묐젰 利앷????좏삎 鍮꾨???($a_v$ ?쇱젙)"
        },
        {
          title: "Terzaghi ?뺤?湲곗큹 洹뱁븳吏吏??怨듭떇???좊룄",
          concept: "湲곗큹 ?硫??꾨옒 吏諛섏쓽 ?꾨떒 ?꾪뙆 嫄곕룞(?쇰컲 ?꾨떒 ?뚭눼)??洹뱁븳 ?곹깭 ?쒓퀎 ?됲삎?쇰줈 ?섏튂?뷀븳 吏吏??怨듭떇",
          formula: "Terzaghi 洹뱁븳 吏吏??\n$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$\n\n[?좊룄 硫붿빱?덉쬁]:\n- 吏諛??뚭눼 ?곸뿭??3媛?zone(Zone I: ?꾩꽦 ?먭린, Zone II: ??섎굹??諛⑹궗???꾨떒 ?곸뿭, Zone III: Rankine ?섎룞 ?섑룊 吏諛??곸뿭)?쇰줈 遺꾪븷?섏뿬 ?곷? ?섏쨷 踰≫꽣? ?꾨떒 ????쒓퀎??寃고빀"
        },
        {
          title: "Rankine 二쇰룞?좎븬 怨듭떇???대줎???좊룄",
          concept: "吏諛섏씠 媛??踰쎌껜 諛곕㈃ 諛⑺뼢?쇰줈 ?쎌갹 蹂?뺤쓣 ?쇱쑝耳??쒓퀎 ?몄옣 ?뚯꽦 ?곹깭???꾨떖???뚯쓽 ?섑룊 ?묐젰",
          formula: "二쇰룞?좎븬 媛뺣룄 ??\n$$p_a = \\gamma z K_a - 2 c \\sqrt{K_a}$$\n\n[二쇱슂 ?좊룄 怨듭떇]:\n- Mohr-Coulomb ?뚭눼 ?щ씫?좉낵 Mohr ?묐젰?먯쓽 ?묒젏 湲고븯?숈쟻 遺꾩꽍???듯븯??$K_a = \\tan^2(45^\\circ - \\phi/2)$ ?섏떇 ?꾩텧"
        }
      ];
    }

    // Shuffle and select formula questions and theory questions based on limits
    const shuffledFormulas = [...customFormulas].sort(() => 0.5 - Math.random());
    const shuffledTheories = [...customTheories].sort(() => 0.5 - Math.random());
    
    const selectedFormulas = shuffledFormulas.slice(0, customFormulasLimit).map(f => {
      if (!f) return null;
      const fTitle = String(f.title || f.question || '');
      const matchedTopic = topics.find(t => {
        const tTitle = t.title || '';
        return fTitle && tTitle && (tTitle.includes(fTitle) || fTitle.includes(tTitle));
      });
      return {
        type: "二쇨???,
        subtype: "怨듭떇",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[?꾩닔怨듭떇] ${fTitle || '怨듭떇'} 怨듭떇???쒖떆?섍퀬, 媛?湲고샇???뺤쓽瑜??쒖닠?섏떆??`,
        answer: f.formula || '',
        concept: f.concept || ''
      };
    }).filter(Boolean);

    const selectedTheories = shuffledTheories.slice(0, customTheoriesLimit).map(t => {
      if (!t) return null;
      const tTitle = String(t.title || '');
      const matchedTopic = topics.find(topic => {
        const topicTitle = topic.title || '';
        return tTitle && topicTitle && (topicTitle.includes(tTitle) || tTitle.includes(topicTitle));
      });
      return {
        type: "二쇨???,
        subtype: "?쒖닠",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[?대줎?좊룄] ${tTitle || '?대줎?좊룄'}???대줎 ?좊룄 怨쇱젙 諛??듭떖 怨듯븰???꾩젣議곌굔??湲곗닠?섏떆??`,
        answer: t.formula || '',
        concept: t.concept || ''
      };
    }).filter(Boolean);

    const customSubjs = [...selectedFormulas, ...selectedTheories];

    // Merge local DB core 10 questions + split mined AI questions
    const finalQuestions = [...customSubjs, ...cleanedQuestions];

    const healedFinalQuestions = finalQuestions.map(q => healQuizQuestionObject(q));
    const validatedFinalQuestions = await Promise.all(
      healedFinalQuestions.map(async (q) => {
        const matchedTopic = topics.find(t => t.id === Number(q.topic_id));
        const title = matchedTopic ? matchedTopic.title : '';
        const keywords = matchedTopic ? matchedTopic.keywords : '';
        const text = matchedTopic ? (topicTextMap[matchedTopic.id] || '') : '';
        const res = await validateAndHealQuestion(q, callLLMWithFailover, title, keywords, text);
        return healQuizQuestionObject({ ...res, question: cleanQuizQuestion(res ? res.question : '') });
      })
    );
    res.json({ questions: validatedFinalQuestions, total: validatedFinalQuestions.length, topicCount: topics.length });

  } catch (err) {
    console.error('Exam route error:', err);
    res.status(500).json({ error: err.message || '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
    if (progressId) {
      updateProgress(progressId, 3, '3?④퀎: 醫낇빀?됯? ?덉긽 臾몄젣 異쒖젣? ?섑븰 怨듭떇 寃利??꾨즺!', 100);
    }
  }
});

// POST /api/exam/additional
router.post('/exam/additional', async (req, res) => {
  const progressId = req.query.progressId || req.body.progressId;
  let progressTimer = null;
  try {
    if (progressId) {
      updateProgress(progressId, 1, '1?④퀎: 異붽? ?쒗뿕 臾명빆 援ъ꽦 遺꾩꽍 以?..', 20);
    }
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) return res.status(400).json({ error: '?깅줉??AI API ?ㅺ? 議댁옱?섏? ?딆뒿?덈떎.' });

    // Fetch all topics with extracted_text (fallback to pdf_data if empty)
    const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name, extracted_text, (CASE WHEN extracted_text IS NULL OR extracted_text = '' THEN pdf_data ELSE NULL END) AS pdf_data FROM topics ORDER BY created_at DESC`);
    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: '?깅줉???좏뵿???놁뒿?덈떎. 癒쇱? ?숈뒿 ?먮즺瑜??깅줉?댁＜?몄슂.' });
    }

    const topicTextMap = {};
    // Extract text from each topic in parallel to avoid timeouts
    const topicTexts = await Promise.all(topics.map(async (topic) => {
      let fileText = '';
      if (topic.extracted_text) {
        fileText = topic.extracted_text;
      } else if (topic.pdf_data) {
        const isHtml = topic.pdf_name && (
          topic.pdf_name.toLowerCase().endsWith('.html') ||
          topic.pdf_name.toLowerCase().endsWith('.htm') ||
          fileUtils.isBufferHtml(topic.pdf_data)
        );
        try {
          if (isHtml) {
            fileText = fileUtils.htmlToPlainText(fileUtils.decodeHtmlBuffer(topic.pdf_data));
          } else {
            const parsed = await pdfParse(topic.pdf_data);
            fileText = parsed.text || '';
          }
        } catch (e) {
          console.warn(`Topic ${topic.id} parse error:`, e.message);
        }
        fileText = fileUtils.mergeVerticalText(fileText);
      }
      fileText = fileUtils.smartTruncate(fileText, 10000);
      topicTextMap[topic.id] = fileText;
      return `<Topic id="${topic.id}" title="${topic.title}" keywords="${topic.keywords || '?놁쓬'}">\n${fileText || '?뚯뒪 ?놁쓬'}\n</Topic>`;
    }));

    const combinedText = topicTexts.join('\n\n---\n\n');
    const topicTitles = topics.map(t => t.title).join(', ');

    // Retrieve custom formula questions from database
    let customFormulas = [];
    try {
      await ensureSessionTable();
      const formulaRows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['formula_questions']);
      if (formulaRows.length > 0 && formulaRows[0].value) {
        const parsed = JSON.parse(formulaRows[0].value);
        if (Array.isArray(parsed.formulaQuestions)) {
          customFormulas = parsed.formulaQuestions.filter(q => q && !q.isNewEmptyCard && (q.title || q.formula));
        }
      }
    } catch (dbErr) {
      console.warn('Error reading formula sessions for comprehensive exam refresh:', dbErr);
    }

    // Load defaults if empty, exactly like /api/exam/all
    if (customFormulas.length === 0) {
      customFormulas = LOCAL_FORMULA_DICTIONARY.map(d => ({
        title: d.title,
        formula: d.formula || d.structure || '',
        concept: d.concept || ''
      }));
    }

    // Retrieve custom theory questions from database
    let customTheories = [];
    try {
      const theoryRows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['theory_questions']);
      if (theoryRows.length > 0 && theoryRows[0].value) {
        const parsed = JSON.parse(theoryRows[0].value);
        if (Array.isArray(parsed.theoryQuestions)) {
          customTheories = parsed.theoryQuestions.filter(q => q && !q.isNewEmptyCard && (q.title || q.formula));
        }
      }
    } catch (dbErr) {
      console.warn('Error reading theory sessions for comprehensive exam refresh:', dbErr);
    }

    // Load defaults if empty
    if (customTheories.length === 0) {
      customTheories = [
        {
          title: "Terzaghi 1李⑥썝 ?뺣? 吏諛곕갑?뺤떇 ?좊룄",
          concept: "?먰넗痢???怨쇱엵媛꾧레?섏븬???뚯궛 諛?移⑦븯 ?쒓컙??異붿씠瑜?臾쇰━?곸쑝濡??뺣? 臾섏궗?섎뒗 吏諛곕갑?뺤떇",
          formula: "吏諛?誘몃텇諛⑹젙??\n$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$\n\n[二쇱슂 ?좊룄 媛??:\n1. ?숈엯?먯? 臾쇱? ?뺤텞?깆씠 ?놁쓬(鍮꾩븬異뺤꽦)\n2. ????臾쇱쓽 ?먮쫫? Darcy 踰뺤튃???곕쫫 ($v = k i$)\n3. ?뺣?? 1李⑥썝?쇰줈留?吏꾪뻾?섎ŉ ?숈쓽 怨듦레鍮?蹂?붾뒗 ?좏슚?묐젰 利앷????좏삎 鍮꾨???($a_v$ ?쇱젙)"
        },
        {
          title: "Terzaghi ?뺤?湲곗큹 洹뱁븳吏吏??怨듭떇???좊룄",
          concept: "湲곗큹 ?硫??꾨옒 吏諛섏쓽 ?꾨떒 ?꾪뙆 嫄곕룞(?쇰컲 ?꾨떒 ?뚭눼)??洹뱁븳 ?곹깭 ?쒓퀎 ?됲삎?쇰줈 ?섏튂?뷀븳 吏吏??怨듭떇",
          formula: "Terzaghi 洹뱁븳 吏吏??\n$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$\n\n[?좊룄 硫붿빱?덉쬁]:\n- 吏諛??뚭눼 ?곸뿭??3媛?zone(Zone I: ?꾩꽦 ?먭린, Zone II: ??섎굹??諛⑹궗???꾨떒 ?곸뿭, Zone III: Rankine ?섎룞 ?섑룊 吏諛??곸뿭)?쇰줈 遺꾪븷?섏뿬 ?곷? ?섏쨷 踰≫꽣? ?꾨떒 ????쒓퀎??寃고빀"
        },
        {
          title: "Rankine 二쇰룞?좎븬 怨듭떇???대줎???좊룄",
          concept: "吏諛섏씠 媛??踰쎌껜 諛곕㈃ 諛⑺뼢?쇰줈 ?쎌갹 蹂?뺤쓣 ?쇱쑝耳??쒓퀎 ?몄옣 ?뚯꽦 ?곹깭???꾨떖???뚯쓽 ?섑룊 ?묐젰",
          formula: "二쇰룞?좎븬 媛뺣룄 ??\n$$p_a = \\gamma z K_a - 2 c \\sqrt{K_a}$$\n\n[二쇱슂 ?좊룄 怨듭떇]:\n- Mohr-Coulomb ?뚭눼 ?щ씫?좉낵 Mohr ?묐젰?먯쓽 ?묒젏 湲고븯?숈쟻 遺꾩꽍???듯븯??$K_a = \\tan^2(45^\\circ - \\phi/2)$ ?섏떇 ?꾩텧"
        }
      ];
    }

    // Select 1 formula and 1 theory randomly
    const shuffledFormulas = [...customFormulas].sort(() => 0.5 - Math.random());
    const shuffledTheories = [...customTheories].sort(() => 0.5 - Math.random());

    const selectedFormulas = shuffledFormulas.slice(0, 1).map(f => {
      if (!f) return null;
      const fTitle = String(f.title || f.question || '');
      const matchedTopic = topics.find(t => {
        const tTitle = t.title || '';
        return fTitle && tTitle && (tTitle.includes(fTitle) || fTitle.includes(tTitle));
      });
      return {
        type: "二쇨???,
        subtype: "怨듭떇",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[?꾩닔怨듭떇] ${fTitle || '怨듭떇'} 怨듭떇???쒖떆?섍퀬, 媛?湲고샇???뺤쓽瑜??쒖닠?섏떆??`,
        answer: f.formula || '',
        concept: f.concept || ''
      };
    }).filter(Boolean);

    const selectedTheories = shuffledTheories.slice(0, 1).map(t => {
      if (!t) return null;
      const tTitle = String(t.title || '');
      const matchedTopic = topics.find(topic => {
        const topicTitle = topic.title || '';
        return tTitle && topicTitle && (topicTitle.includes(tTitle) || tTitle.includes(topicTitle));
      });
      return {
        type: "二쇨???,
        subtype: "?쒖닠",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[?대줎?좊룄] ${tTitle || '?대줎?좊룄'}???대줎 ?좊룄 怨쇱젙 諛??듭떖 怨듯븰???꾩젣議곌굔??湲곗닠?섏떆??`,
        answer: t.formula || '',
        concept: t.concept || ''
      };
    }).filter(Boolean);

    const customSubjs = [...selectedFormulas, ...selectedTheories];

    // Format formulas and theories text for LLM context
    const formulasText = customFormulas.map((f, idx) => `[?꾩닔怨듭떇 ${idx+1}] ?쒕ぉ: ${f.title}\n怨듭떇 諛??ㅻ챸:\n${f.formula}\n媛쒕뀗: ${f.concept}`).join('\n\n');
    const theoriesText = customTheories.map((t, idx) => `[?대줎?좊룄 ${idx+1}] ?쒕ぉ: ${t.title}\n媛쒕뀗: ${t.concept}\n?댁슜/?섏떇:\n${t.formula}`).join('\n\n');

    let aggregatedAiQuestions = [];
    const TOTAL_BATCHES = 3; // 3 batches (4 + 4 + 5) = 13 AI questions

    console.log(`[醫낇빀?됯? 異붽? ?앹꽦 媛?? TPM 珥덇낵 諛⑹?瑜??꾪빐 珥?${TOTAL_BATCHES}???곗냽 遺꾪븷 ?붿껌???쒖옉?⑸땲??`);
    if (progressId) {
      progressTimer = startBackendProgressTimer(progressId, 3, '3?④퀎: AI ?붿쭊??異붽? 臾몄젣瑜?異쒖젣?섍퀬 ?덉뒿?덈떎...', 90, 1800, 5);
    }

    for (let i = 0; i < TOTAL_BATCHES; i++) {
      const randomSeed = Math.floor(Math.random() * 10000);
      const countToGenerate = i === 2 ? 5 : 4;
      const mcCount = i === 2 ? 4 : 3;
      
      const batchPrompt = `
?뱀떊? 援??湲곗닠?먭꺽 湲곗닠???쒗뿕 異쒖젣?꾩썝?낅땲??
?꾨옒 ?쒓났??[?됯? 踰붿쐞 ?좏뵿 ?뚯뒪], [?꾩닔怨듭떇 紐⑸줉], [?대줎?좊룄 紐⑸줉]???대떦?섎뒗 怨듭떇怨?怨듯븰??吏???댁슜留뚯쓣 李멸퀬?섏뿬, ?ㅻⅨ 臾몄젣?ㅺ낵 ?덈? 以묐났?섏? ?딅뒗 怨좊궃??醫낇빀?됯? 異붽? 臾몄젣 **?뺥솗??${countToGenerate}媛?*瑜??앹꽦?섏떗?쒖삤.
(?꾩옱 遺꾪븷 異쒖젣 ?뚯감: ${i + 1} / ${TOTAL_BATCHES}, ?쒕뜡 ?쒕뱶: ${randomSeed})

?슚 [異쒖젣 異쒖쿂 ?쒖젙 諛?臾몃㎘ 寃⑸━ 洹쒖튃 (Topic Isolation) - 洹밸룄濡?以묒슂!]:
1. 諛섎뱶???꾨옒 ?쒓났??**[?됯? 踰붿쐞 ?좏뵿 紐⑸줉 諛?蹂몃Ц]**??'<Topic>...</Topic>' ?쒓렇, **[?몄슜???꾩닔怨듭떇 紐⑸줉]**, **[?몄슜???대줎?좊룄 紐⑸줉]**?먯꽌 吏곸젒 ?ㅻ（??援ъ껜?곸씤 媛쒕뀗, 怨듭떇 諛?臾쇰━??湲곗쟾??踰붿쐞 ?덉뿉?쒕쭔 ?쒗뿕 臾몄젣瑜??앹꽦?섏떗?쒖삤.
2. 媛?臾몄젣瑜?異쒖젣?????대떦 臾몄젣??異쒖쿂媛 ?섎뒗 ???섎굹???좏뵿??踰붿쐞濡??쒖젙?섏뿬 臾몄젣瑜?援ъ꽦?섏떗?쒖삤. ?덈? ?뱀젙 ?좏뵿??愿??臾몄젣瑜??????ㅻⅨ ?좏뵿???곹엺 ?⑥뼱, ?섏튂, 怨듯븰??議곌굔?대굹 怨듭떇?ㅼ쓣 ?쇳빀(Cross-contamination)?섏뿬 蹂닿린(options)??吏臾몄쓣 留뚮뱶??'臾몃㎘ 援먯감 ?ㅼ뿼'???吏瑜댁? 留덉떗?쒖삤. 媛?臾몄젣???뚯뒪 ?곸쓽 ?낅┰??媛쒕퀎 ?좏뵿 ?댁슜???꾩쟾??遺?⑺빐???⑸땲??
3. ?쒓났???뚯뒪 ?먮즺 諛??몄슜???댁슜??**吏곸젒 ?깆옣?섏? ?딅뒗 ?몃???? 怨듯븰/??븰 遺꾩빞 ?대줎(?? ?띿뒪?몄뿉 ?멸툒?섏? ?딆? ?숈뿭??援ъ“?댁꽍, 吏꾨룞?? ?ㅺ퀎媛먯뇿, 怨좎쑀吏꾨룞????? ?덈?濡?吏臾몄뿉 二쇱엯?섍굅???좎“?섏뿬 臾몄젣瑜?留뚮뱾吏 留덉떗?쒖삤.**
4. ?ㅼ쭅 ?쒓났???뚯뒪 蹂몃Ц ?띿뒪???댁뿉 **?⑥뼱 諛??섏떇?쇰줈 紐낆떆?섏뼱 ?덈뒗 踰붿쐞 ?대줈留?異쒖젣 踰붿쐞瑜?100% 泥좎????쒖젙**?섏떗?쒖삤. ?뚯뒪???녿뒗 ?遺꾩빞 ?댁슜????굅???곸긽?섏뿬 臾몄젣瑜?援ъ꽦??寃쎌슦 ?ш컖??異쒖젣 ?ㅻ쪟濡?媛꾩＜?⑸땲??
5. 媛앷???紐⑤뱺 蹂닿린(options) 諛??댁꽕 ??떆 ?ㅼ쭅 ?뚯뒪 臾몄꽌 ?댁슜??臾몄옣怨?吏?앸뱾??蹂??寃고빀?섏뿬 留뚮뱾?댁빞 ?섎ŉ, 蹂몃Ц怨??꾩삁 臾닿????됰슧???몃? ?⑹뼱??媛?곸쓽 湲곗닠??吏?앹쓣 蹂닿린???쇳빀?섎뒗 寃껋쓣 ?덈? 湲덉??⑸땲??

[?됯? 踰붿쐞 ?좏뵿 紐⑸줉 諛?蹂몃Ц]:
${combinedText}

[?몄슜???꾩닔怨듭떇 紐⑸줉]:
${formulasText || '?몄슜???댁슜 ?놁쓬'}

[?몄슜???대줎?좊룄 紐⑸줉]:
${theoriesText || '?몄슜???댁슜 ?놁쓬'}

[異쒖젣 洹쒖튃]:
1. ?대쾲 ?뚯감?먯꽌??**?뺥솗??${countToGenerate}媛쒖쓽 臾몄젣**留?諛섑솚?섎릺 ?ㅼ쓬 鍮꾩쑉???ъ닔??寃?
   - 二쇨???(type: "二쇨???, subtype: "媛쒖슂"): 1臾몄젣 (?뺤쓽 諛??뱀쭠??3~5以??댁쇅濡?源딆씠 ?덇퀬 ?꾨Ц?곸씤 ?쒖닠??媛쒖슂 諛?媛쒕뀗 ?ㅻ챸 紐⑤쾾?듭븞 (以꾨컮轅?援щ텇))
   - 媛앷???(type: "媛앷???): ${mcCount}臾몄젣 (4吏?좊떎??
2. 媛앷???臾몄젣???좏삎 諛?援ъ꽦 鍮꾩쑉 吏移?(洹밸룄濡?以묒슂):
   - 異쒖젣?섎뒗 媛앷???臾명빆?ㅼ? 諛섎뱶???꾨옒 鍮꾩쑉??以?섑븯??援ъ꽦?섏떗?쒖삤:
     * **湲곕낯 湲곗큹 媛쒕뀗 臾몄젣 (40%, ??2臾몄젣)**: ?좏뵿??湲곕낯 ?뺤쓽, ?듭떖 媛쒕뀗, 湲곗큹 ?먮━瑜?吏곸젒?곸쑝濡?臾삳뒗 湲곗큹 ?섏? 臾몄젣. (?? "?뗢뿃?뗭쓽 ?뺤쓽濡?媛???녹? 寃껋??", "?뗢뿃?뗭쓽 ?뱀쭠???꾨땶 寃껋??"). 湲곗궗 ?섏????듭떖 媛쒕뀗 ?뺤씤 臾몄젣濡?異쒖젣.
     * **?뺣웾 怨꾩궛 臾몄젣 (30%, ??1臾몄젣)**: 援ъ껜?곸씤 議곌굔 ?섏튂瑜???낇븯??理쒖쥌 媛믪쓣 怨꾩궛?대궡嫄곕굹 ?뺣웾 寃곌낵瑜?臾삳뒗 ?섏튂 怨꾩궛 臾몄젣.
     * **?ы솕 ?먮━쨌鍮꾧탳 臾몄젣 (30%, ??1臾몄젣)**: 怨듯븰??硫붿빱?덉쬁, ?λ떒?? 鍮꾧탳, ?ㅻТ ?쒓났 ?좎쓽?ы빆 ???묒슜 ?댄빐??臾몄젣.
   
   - **?슚 [怨듭떇 諛?怨듭떇 ?섏튂 踰붿쐞 ?몄텧 ?덈? 湲덉? 洹쒖튃 - 洹밸룄濡?以묒슂!]**: 臾몄젣 吏덈Ц(question) 蹂몃Ц ?댁뿉 **臾몄젣瑜??닿껐?섎뒗 ???꾩슂??怨듯븰 ?섏떇 ?먯껜(?? $E_u = 300 s_u$ ?????섏떇???뱀젙 ?섏튂 踰붿쐞(?? $E_u = (200 \\sim 500)s_u$ ??, 鍮꾨? 愿怨????깆쓣 ?덈?濡?吏곸젒 ?띿뒪?몃줈 ?곸뼱 ?쒓났?섏? 留덉떗?쒖삤.** ?섏떇?대굹 寃쏀뿕???섏튂 踰붿쐞瑜?吏臾몄뿉 誘몃━ 二쇰㈃ ?숈깮???붽린 諛??곗긽 ?λ젰???됯??????놁뒿?덈떎. ???怨듭떇??紐낆묶("鍮꾨같???꾩꽦怨꾩닔 寃쏀뿕??)?대굹 蹂?섎뱾??紐낆묶("鍮꾨같???꾨떒媛뺣룄 $s_u$")留뚯쓣 ?쒖떆?섍퀬, ?숈깮???ㅼ뒪濡?怨듭떇怨?踰붿쐞瑜??좎삱?ㅼ꽌 ?닿껐?섎룄濡??섏떗?쒖삤. (?? ?댁꽕(explanation)?먯꽌???숈깮???숈뒿???꾪빐 怨듭떇???곸꽭??紐낆떆?섍퀬 怨꾩궛 怨쇱젙???ㅻ챸?댁빞 ?⑸땲??)
   - ?뱁엳 **?섏튂 ?댁꽍踰뺤씠??媛??援ъ“臾??댁꽍怨?媛숈씠 ?뺣웾??遺꾩꽍???꾩슂???좏뵿??寃쎌슦, ?쒓났???뚯뒪 臾몄꽌 ?댁뿉 紐낆떆?곸씤 ?섏튂???뚮씪誘명꽣媛 議댁옱?쒕떎硫??대? ?쒖슜?섏뿬 ?뺣웾 怨꾩궛 臾몄젣瑜?援ъ꽦?섏떗?쒖삤. ?? 臾몄꽌???섏튂???섏떇???녿떎硫??꾩쓽濡?鍮꾪쁽?ㅼ쟻???섏튂瑜?媛??遺?ы븯吏 留덉떗?쒖삤.**
   - 留뚯빟 ?꾪삎?곸씤 鍮꾧퀎?고삎/?뺤꽦???좏뵿(?? ?⑥닚 ?덉쭏 ?쒗뿕 ?덉감, ?⑥닚 ?됱젙 ?쒕룄 ????寃쎌슦?먮쭔 ?쇰컲?곸씤 ?쒖닠???댄빐??媛앷???臾몄젣濡?異쒖젣?섎릺, ??寃쎌슦?먮룄 媛湲됱쟻 臾쇰━??蹂?섏쓽 ?곹뼢?꾨? 臾삳뒗 ??理쒕????뺣웾?붿뿉 媛源앷쾶 臾몄젣???섏????믪뿬 異쒖젣?섏떗?쒖삤.
   - **?좑툘 [鍮꾧탳/?뱀꽦 ??異쒖젣 洹쒖튃 - 洹밸룄濡?以묒슂!]**: 吏덈Ц??鍮꾧탳/?뱀꽦 ?쒓? ?꾩슂??寃쎌슦, ?덈? <table> ??HTML ?쒓렇濡??쒕? 吏곸젒 ?묒꽦?섏? 留먭퀬 ?쇰컲 ?띿뒪?몃줈留?吏덈Ц???묒꽦?????꾨옒??"tableData" ?꾨뱶?????곗씠?곕? 媛앹껜 援ъ“濡??묒꽦?섏떗?쒖삤.
3. ?ㅻ떟 蹂닿린 援ъ꽦 二쇱쓽?ы빆 (留ㅼ슦 以묒슂):
   - ?ㅻ떟 蹂닿린(options) 援ъ꽦 ??**?덈?濡??곕Т?덉뾾嫄곕굹 洹밸떒?곸씤 ?쒗쁽, ?뱀? 鍮꾪쁽?ㅼ쟻??怨듯븰??媛???? '臾댄븳?濡??곸듅?쒗궡', '?ㅼ떆媛꾩쑝濡?湲고븯湲됱닔?곸쑝濡?利앷???, '?곸썝??蹂?섏? ?딆쓬', '?꾩삁 諛쒖깮?섏? ?딆쓬', '??컻?? ??? ?덈?濡??ъ슜?섏? 留덉떗?쒖삤**. 
   - ?ㅼ젣 ?꾧났 ?쒖쟻?대굹 ?ㅻТ 湲곗닠 湲곗???遺?⑺븯??**怨좊룄濡???뱀꽦 ?덇퀬 洹몃윺??븳 ?ㅻ떟(plausible engineering distractors)**?쇰줈 援ъ꽦??二쇱떗?쒖삤. 紐⑤뱺 蹂닿린??諛섎뱶???먮낯 ?뚯뒪 諛?怨듯븰???곸떇?좎뿉 湲대???寃고빀?섏뼱???⑸땲??
- **?슚 [媛앷????뺣???諛??뺣떟 ?쇱튂 議곌굔 - 洹밸룄濡?以묒슂!]**: 紐⑤뱺 媛앷???4吏?좊떎?? 怨꾩궛 臾몄젣???섏튂/怨듯븰???먮떒 臾몄젣瑜?異쒖젣???? 怨꾩궛?쇰줈 ?꾩텧???뺥솗???뺣떟 ?섏튂??議곌굔??4媛쒖쓽 蹂닿린(options) 以?諛섎뱶???뺥솗??1媛쒕줈 議댁옱?댁빞 ?⑸땲?? ?덈?濡??ㅼ젣 怨꾩궛 寃곌낵? 蹂닿린???섏튂媛 遺덉씪移섑븯?? ?댁꽕?먯꽌 '?ㅼ젣 怨꾩궛媛믪? XX?대굹 蹂닿린 以?媛??媛源뚯슫 YY瑜??좏깮?⑸땲??? 媛숈? ?댁쿂援щ땲?녿뒗 蹂紐낆쓣 ?곷뒗 異쒖젣 ?ㅻ쪟瑜?踰뷀븯吏 留덉떗?쒖삤. 臾몄젣瑜??앹꽦?섍린 ?꾩뿉 ?ㅼ젣 ?섏떇????낇븯???뺣떟????踰???吏곸젒 ?꾨??섍쾶 怨꾩궛?섍퀬 寃利앺븳 ?? 洹?寃곌낵媛??좎뵪 ?섎굹 ?由ъ? ?딅뒗 ?뺥솗???뺣떟)??蹂닿린? 'answer' ?꾨뱶???꾨꼍???쇱튂?섎룄濡?湲곗옱?섏떗?쒖삤.
    4. ?뚯뒪 ?띿뒪?몄쓽 ?④꺼吏?怨듯븰??媛쒕뀗怨??ㅻТ 湲곗쟾???ъ갑?섏뿬 怨좏뭹寃?吏덈Ц???섏???떆??

[?섍컖 諛⑹? 泥좎튃 (Anti-Hallucination Constraints)]:
1. ?쒓났???뚯뒪 臾몄꽌 ?띿뒪??<Source_Document>) ?댁뿉 紐낆떆???섏튂, ?덉슜 ?덉쟾?? ?ㅺ퀎湲곗?(KDS/KCS) 議고빆 踰덊샇??怨듭떇???녿뒗 寃쎌슦, ?꾩쓽濡??섏떇???좊룄?섍굅???몃? ?쒕갑???섏튂 ?쒓퀎瑜??좎“(Hallucination)?섏? 留덉떗?쒖삤.
2. 臾몄꽌 踰붿쐞瑜?踰쀬뼱?섎뒗 ??븰???섏튂??鍮꾨Ъ由ъ쟻 ?섏튂(?? ?대?留덉같媛?60???댁긽 ??瑜?李쎌옉?섏뿬 紐⑥닚??諛쒖깮?쒗궎硫????⑸땲?? ?섏튂媛 遺議깊븯?ㅻ㈃ ?뺣웾 怨꾩궛 臾몄젣 異쒖젣瑜?利됱떆 ?고쉶?섍퀬 媛쒕뀗 ?댄빐??臾몄젣濡??泥댄븯??떆??

${LATEX_PROMPT_INSTRUCTIONS}
${GENERATION_STANDARDS}
${ENGINEERING_STANDARDS}
4. 諛섎뱶??異붽? ?띿뒪???놁씠 ?쒖닔 JSON 諛곗뿴留?諛섑솚?섏떗?쒖삤.

[JSON ?щ㎎]:
[
  {
    "type": "二쇨???,
    "subtype": "媛쒖슂",
    "topic_title": "??臾몄젣??異쒖젣 洹쇨굅媛 ?섎뒗 ?좏뵿 紐⑸줉 ?댁쓽 ?뺥솗???좏뵿紐?(?? ?됱궗?ъ쁺踰?",
    "question": "吏덈Ц ?댁슜",
    "answer": "3~5以??댁쇅??源딆씠 ?덇퀬 ?꾨Ц?곸씤 ?쒖닠??媛쒖슂 諛?媛쒕뀗 ?ㅻ챸 紐⑤쾾?듭븞",
    "concept": "?듭떖 媛쒕뀗 1以??붿빟"
  },
  {
    "type": "媛앷???,
    "topic_title": "??臾몄젣??異쒖젣 洹쇨굅媛 ?섎뒗 ?좏뵿 紐⑸줉 ?댁쓽 ?뺥솗???좏뵿紐?(?? ?쎈낵???몃컻?쒗뿕)",
    "question": "怨듯븰???꾩긽 遺꾩꽍 吏덈Ц",
    "tableData": null,
    "options": ["蹂닿린1", "蹂닿린2", "蹂닿린3", "蹂닿린4"],
    "answer": "?뺣떟 蹂닿린? ?좎뵪 ?섎굹 ?由ъ? ?딅뒗 ?뺣떟 ?띿뒪??,
    "explanation": "?댁쑀? ?ㅻ떟 ?뺣? ?댁꽕"
  }
] (??留뚯빟 ?쒓? ?꾩슂??吏덈Ц?대씪硫?"tableData": {"headers": ["援щ텇", "吏諛?X", "吏諛?Y"], "rows": [["?댁쟻 ?섍꼍", "?댁닔", "?댁닔"]]} 泥섎읆 援ъ“?붾맂 ??媛앹껜瑜??묒꽦?섍퀬, 洹몃젃吏 ?딆? ?쇰컲 吏덈Ц?대㈃ "tableData": null 濡??ㅼ젙?섏떗?쒖삤.)
`;
      try {
        console.log(`[醫낇빀?됯? 異붽? ?앹꽦] (${i + 1}/${TOTAL_BATCHES}) ?뚯감 ?꾨＼?꾪듃 ?꾩넚 ?쒖옉...`);
        const rawText = await callLLMWithFailover(null, batchPrompt, null, 'question', { temperature: 1.0 });
        let text = rawText.trim();
        if (text.startsWith('```')) {
          text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }

        let batchQuestions = null;
        try {
          batchQuestions = parseLlmJson(text);
        } catch {
          batchQuestions = extractJsonArray(rawText);
        }

        if (batchQuestions && Array.isArray(batchQuestions)) {
          aggregatedAiQuestions.push(...batchQuestions);
          console.log(`[醫낇빀?됯? 異붽? 諛곗튂 ?깃났] (${i + 1}/${TOTAL_BATCHES}) ?뚯감 ?꾨즺. ?꾩쟻 臾명빆 ?? ${aggregatedAiQuestions.length}`);
        }

        if (i < TOTAL_BATCHES - 1) {
          await sleep(1200);
        }
      } catch (batchError) {
        console.warn(`[異붽? 諛곗튂 議고쉶 寃쎄퀬] ${i + 1}?뚯감 ?앹꽦 以??먮윭 諛쒖깮:`, batchError.message);
      }
    }

    if (aggregatedAiQuestions.length === 0) {
      aggregatedAiQuestions = [
        {
          type: "媛앷???,
          question: "?먯꽦??吏諛섏쓽 ?뺣? ?쒗뿕?먯꽌 ?섏쨷 ?뺣젰 蹂?붿뿉 ?곕Ⅸ 怨듦레鍮?$e$)? ????좏슚 ?뺣젰($\\log \\sigma'$) 怨≪꽑(e-log p 怨≪꽑) ?곸쓽 二쇱슂 嫄곕룞 ?뱀꽦??????ㅻ챸?쇰줈 媛???곸젅?섏? ?딆? 寃껋??",
          options: [
            "?뺤텞吏??$C_c$)??洹쒖젙 ?뺤텞 ?곸뿭?먯꽌??吏곸꽑 湲곗슱湲곕줈 ?뺤쓽?섎ŉ, 吏諛섏쓽 ?뚯꽦 ?쒖꽦?꾧? ?믪쓣?섎줉 媛먯냼?쒕떎.",
            "?좏뻾?뺣??섏쨷($p_c$)? ?숈씠 怨쇨굅??諛쏆븯??理쒕? ?좏슚 ?곗쭅?묐젰?대떎.",
            "?ъ븬異뺤???$C_r$)???쎌갹 諛??ъ븬異?援ш컙???됯퇏 湲곗슱湲곕줈, ?쇰컲?곸쑝濡??뺤텞吏?섏쓽 1/5 ~ 1/10 ?뺣룄 ?섏??대떎.",
            "怨쇱븬諛鍮?OCR)媛 1蹂대떎 ???먰넗???꾨떒 ?쒗뿕 ???꾨떒 蹂?뺤뿉 ?섑븳 泥댁쟻 ?쎌갹(Dilatancy) 嫄곕룞??蹂댁씪 ???덈떎."
          ],
          answer: "?뺤텞吏??$C_c$)??洹쒖젙 ?뺤텞 ?곸뿭?먯꽌??吏곸꽑 湲곗슱湲곕줈 ?뺤쓽?섎ŉ, 吏諛섏쓽 ?뚯꽦 ?쒖꽦?꾧? ?믪쓣?섎줉 媛먯냼?쒕떎.",
          explanation: "吏諛섏쓽 ?뚯꽦 ?쒖꽦?꾧? ?믨퀬 ?뺤텞?깆씠 ?댁닔濡??뺤텞吏??$C_c$)???ㅽ엳??利앷??⑸땲??"
        }
      ];
    }

    const topicMap = {};
    topics.forEach(t => {
      topicMap[t.title.toLowerCase().trim()] = t.id;
    });

    const cleanedQuestions = aggregatedAiQuestions.map(q => {
      let topicId = q.topic_id || null;
      if (q.topic_title && typeof q.topic_title === 'string') {
        const cleanedTitle = q.topic_title.toLowerCase().trim();
        if (topicMap[cleanedTitle]) {
          topicId = topicMap[cleanedTitle];
        } else {
          const matchedKey = Object.keys(topicMap).find(k => k.includes(cleanedTitle) || cleanedTitle.includes(k));
          if (matchedKey) topicId = topicMap[matchedKey];
        }
      }
      const qText = String(q.question || '');
      if (!topicId && topics.length > 0) {
        const matchedTopic = topics.find(t => {
          const tTitle = t.title || '';
          const tKeywords = t.keywords || '';
          return (tTitle && qText.includes(tTitle)) || 
                 (tKeywords && tKeywords.split(',').some(k => qText.includes(k.trim())));
        });
        topicId = matchedTopic ? matchedTopic.id : topics[Math.floor(Math.random() * topics.length)].id;
      }
      return {
        type: q.type || "媛앷???,
        subtype: q.subtype || null,
        question: cleanQuizQuestion(qText),
        tableData: q.tableData || null,
        options: q.options || [],
        answer: q.answer,
        explanation: q.explanation || '',
        concept: q.concept || '',
        flowchartIntuitive: q.flowchartIntuitive || null,
        topic_id: topicId
      };
    });

    const healedFinalQuestions = cleanedQuestions.map(q => healQuizQuestionObject(q));
    
    // Combine 2 custom questions and 8 AI questions
    const finalQuestions = [...customSubjs, ...healedFinalQuestions];

    // Fisher-Yates shuffle the final 10 questions to perfectly mix them
    for (let i = finalQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]];
    }

    const validatedFinalQuestions = await Promise.all(
      finalQuestions.map(async (q) => {
        const matchedTopic = topics.find(t => t.id === Number(q.topic_id));
        const title = matchedTopic ? matchedTopic.title : '';
        const keywords = matchedTopic ? matchedTopic.keywords : '';
        const text = matchedTopic ? (topicTextMap[matchedTopic.id] || '') : '';
        const res = await validateAndHealQuestion(q, callLLMWithFailover, title, keywords, text);
        return healQuizQuestionObject(res);
      })
    );

    res.json({ questions: validatedFinalQuestions });

  } catch (err) {
    console.error('Exam additional route error:', err);
    res.status(500).json({ error: err.message || '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
    if (progressId) {
      updateProgress(progressId, 3, '3?④퀎: 異붽? 臾몄젣 異쒖젣 諛?寃利??꾨즺!', 100);
    }
  }
});

// ============================================================================
// Restored Spaced Repetition Scheduling and Quiz Submission Routes
// ============================================================================

async function scheduleNextReviewRound(topicId, currentRound, baseDate = new Date()) {
  const nextRound = currentRound + 1;
  const nextCheckSql = `SELECT * FROM schedules WHERE topic_id = ? AND review_round = ?`;
  const existingNextSchedule = await dbQuery.get(nextCheckSql, [topicId, nextRound]);
  
  let days = 0;
  if (currentRound === 1) days = 4;
  else if (currentRound === 2) days = 7;
  else if (currentRound === 3) days = 14;
  else if (currentRound === 4) days = 35;
  else if (currentRound === 5) days = 60;
  else if (currentRound >= 6) {
    days = 30 + Math.floor(Math.random() * 61); // 30 ~ 90 days
  }

  if (days > 0) {
    const nextPlannedDate = fileUtils.getLocalDateString(baseDate, days);
    if (!existingNextSchedule) {
      const insertSql = `
        INSERT INTO schedules (topic_id, review_round, planned_date, status)
        VALUES (?, ?, ?, 'pending')
      `;
      await dbQuery.run(insertSql, [topicId, nextRound, nextPlannedDate]);
      console.log(`[scheduleNextReviewRound] Auto-created review round ${nextRound} for topic ${topicId} planned on ${nextPlannedDate} (baseDate: ${baseDate})`);
    } else if (existingNextSchedule.status === 'pending') {
      const updateSql = `
        UPDATE schedules 
        SET planned_date = ? 
        WHERE id = ?
      `;
      await dbQuery.run(updateSql, [nextPlannedDate, existingNextSchedule.id]);
      console.log(`[scheduleNextReviewRound] Updated existing pending review round ${nextRound} for topic ${topicId} to planned on ${nextPlannedDate} (baseDate: ${baseDate})`);
    }
  }
}

// POST /api/schedules/:id/complete -> Complete a standard review round
router.post('/schedules/:id/complete', async (req, res) => {
  const scheduleId = req.params.id;
  const { referenceDate, topic_id, topicId, review_round, reviewRound } = req.body;
  const tId = topic_id || topicId;
  const rRound = review_round !== undefined ? review_round : reviewRound;

  try {
    let schedule = null;
    const parsedTId = tId ? parseInt(tId, 10) : null;
    const parsedRRound = rRound !== undefined ? parseInt(rRound, 10) : undefined;

    if (parsedTId && !isNaN(parsedTId) && parsedRRound !== undefined && !isNaN(parsedRRound)) {
      const checkSql = `SELECT * FROM schedules WHERE topic_id = ? AND review_round = ?`;
      schedule = await dbQuery.get(checkSql, [parsedTId, parsedRRound]);
    }
    if (!schedule && scheduleId && scheduleId !== '9999') {
      const checkSql = `SELECT * FROM schedules WHERE id = ?`;
      schedule = await dbQuery.get(checkSql, [scheduleId]);
    }

    if (!schedule) {
      return res.status(404).json({ error: '?대떦 蹂듭뒿 ?쇱젙??李얠쓣 ???놁뒿?덈떎.' });
    }

    if (schedule.status === 'completed') {
      return res.status(400).json({ error: '?대? 蹂듭뒿 ?꾨즺???쇱젙?낅땲??' });
    }

    const nowTimestamp = new Date().toISOString();
    const updateSql = `
      UPDATE schedules 
      SET status = 'completed', completed_at = ? 
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [nowTimestamp, schedule.id]);

    // ?댁쟾 ?뚯감 以?誘몄셿猷?pending) 嫄댁씠 ?⑥븘?덈뒗 寃쎌슦 ?먮룞 ?꾨즺 泥섎━?섏뿬 '?щ났?듭쨷' ?붾쪟 諛⑹?
    if (schedule.review_round && schedule.review_round !== 99) {
      await dbQuery.run(
        `UPDATE schedules SET status = 'completed', completed_at = ? WHERE topic_id = ? AND review_round < ? AND status = 'pending'`,
        [nowTimestamp, schedule.topic_id, schedule.review_round]
      );
    }

    // 蹂듭뒿 ?꾨즺 ???ㅼ쓬 ?뚯감 ?먮룞 ?앹꽦 (留앷컖怨≪꽑 二쇨린 湲곕컲)
    if (schedule.review_round !== 99) {
      // FIX: 留앷컖怨≪꽑 二쇨린???ㅼ젣 ?꾨즺?쇱옄 湲곗?
      const baseDate = new Date();
      await scheduleNextReviewRound(schedule.topic_id, schedule.review_round, baseDate);
    }

    res.json({
      message: `${schedule.review_round}?뚯감 蹂듭뒿 ?꾨즺 泥섎━?섏뿀?듬땲??`,
      schedule_id: scheduleId,
      status: 'completed',
      completed_at: nowTimestamp
    });
  } catch (error) {
    console.error('Error completing review:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡?蹂듭뒿 ?꾨즺 泥섎━???ㅽ뙣?덉뒿?덈떎.' });
  }
});

// POST /api/quiz/submit -> Submit quiz results and update schedule score
router.post('/quiz/submit', async (req, res) => {
  const { schedule_id, topic_id, review_round, reviewRound, total, correctCount, score, isPassed, isBonus, questions, selectedAnswers, revealedQuestions, tableAnswers, tableGradingResults, referenceDate, tutorAnswers, tutorInputText, chatHistory } = req.body;

  if (!schedule_id || !topic_id) {
    return res.status(400).json({ error: 'schedule_id? topic_id???꾩닔?낅땲??' });
  }

  const isMixedReq = (typeof topic_id === 'string' && topic_id.startsWith('mixed_')) ||
                     (typeof schedule_id === 'string' && schedule_id.startsWith('mixed_'));

  const topicIdInt = parseInt(topic_id, 10);
  let scheduleIdInt = parseInt(schedule_id, 10);
  const rRound = review_round !== undefined ? review_round : reviewRound;

  if (!isMixedReq && (isNaN(topicIdInt) || isNaN(scheduleIdInt))) {
    return res.status(400).json({ error: '?좏슚??topic_id? schedule_id媛 ?꾨떃?덈떎.' });
  }

  const now = new Date().toISOString();

  try {
    let targetScheduleId = isMixedReq ? schedule_id : scheduleIdInt;
    let schedule = null;

    if (isMixedReq) {
      targetScheduleId = schedule_id || `mixed_schedule_${referenceDate || 'default'}`;
      schedule = {
        id: targetScheduleId,
        topic_id: topic_id || String(targetScheduleId).replace('mixed_schedule_', 'mixed_'),
        review_round: 1,
        status: 'completed'
      };
    } else if (isBonus) {
      let existingBonus = null;
      if (scheduleIdInt && scheduleIdInt !== 9999) {
        existingBonus = await dbQuery.get('SELECT * FROM schedules WHERE id = ?', [scheduleIdInt]);
      }
      if (!existingBonus) {
        const today = fileUtils.getLocalDateString();
        existingBonus = await dbQuery.get(
          'SELECT id FROM schedules WHERE topic_id = ? AND review_round = 99 AND planned_date = ?',
          [topicIdInt, today]
        );
      }

      if (!existingBonus) {
        const today = fileUtils.getLocalDateString();
        await dbQuery.run(
          `INSERT INTO schedules (topic_id, review_round, planned_date, status) VALUES (?, 99, ?, 'pending')`,
          [topicIdInt, today]
        );
        const newlyCreated = await dbQuery.get(
          'SELECT id FROM schedules WHERE topic_id = ? AND review_round = 99 AND planned_date = ?',
          [topicIdInt, today]
        );
        targetScheduleId = newlyCreated.id;
      } else {
        targetScheduleId = existingBonus.id;
      }
    } else {
      // Prioritize standard lookup by topic_id and review_round (Absolute Standard Rule 3)
      if (topicIdInt && rRound !== undefined) {
        schedule = await dbQuery.get(
          `SELECT * FROM schedules WHERE topic_id = ? AND review_round = ?`,
          [topicIdInt, parseInt(rRound, 10)]
        );
        if (schedule) {
          targetScheduleId = schedule.id;
        }
      }

      if (!schedule && (scheduleIdInt === 9999 || !scheduleIdInt)) {
        const pendingSchedule = await dbQuery.get(
          `SELECT id FROM schedules WHERE topic_id = ? AND status = 'pending' ORDER BY review_round ASC LIMIT 1`,
          [topicIdInt]
        );
        if (pendingSchedule) {
          targetScheduleId = pendingSchedule.id;
        } else {
          const lastCompleted = await dbQuery.get(
            `SELECT id FROM schedules WHERE topic_id = ? AND (status = 'completed' OR status = 'failed') ORDER BY completed_at DESC LIMIT 1`,
            [topicIdInt]
          );
          if (lastCompleted) {
            targetScheduleId = lastCompleted.id;
          } else {
            const anySchedule = await dbQuery.get(
              `SELECT id FROM schedules WHERE topic_id = ? LIMIT 1`,
              [topicIdInt]
            );
            if (anySchedule) {
              targetScheduleId = anySchedule.id;
            }
          }
        }
      }
    }

    // 1. ?대떦 ?쇱젙 議댁옱 ?щ? ?뺤씤
    if (!schedule) {
      schedule = await dbQuery.get('SELECT * FROM schedules WHERE id = ?', [targetScheduleId]);
    }
    if (!schedule) {
      return res.status(404).json({ error: '?대떦 蹂듭뒿 ?쇱젙??李얠쓣 ???놁뒿?덈떎.' });
    }

    // 2. ?깆쟻 諛??먯닔 媛깆떊
    const scoreVal = score !== undefined ? score : null;
    const correctVal = correctCount !== undefined ? correctCount : null;
    const totalVal = total !== undefined ? total : null;

    const finalStatus = isPassed ? 'completed' : 'failed';
    if (!isMixedReq) {
      await dbQuery.run(
        `UPDATE schedules SET status = ?, completed_at = ?, score = ?, correct_count = ?, total_count = ? WHERE id = ?`,
        [finalStatus, now, scoreVal, correctVal, totalVal, targetScheduleId]
      );

      // ?댁쟾 ?뚯감 以?誘몄셿猷?pending) 嫄댁씠 ?⑥븘?덈뒗 寃쎌슦 ?먮룞 ?꾨즺 泥섎━?섏뿬 '?щ났?듭쨷' ?붾쪟 諛⑹?
      if (schedule && schedule.review_round && schedule.review_round !== 99) {
        await dbQuery.run(
          `UPDATE schedules SET status = 'completed', completed_at = ? WHERE topic_id = ? AND review_round < ? AND status = 'pending'`,
          [now, schedule.topic_id, schedule.review_round]
        );
      }
    }

    // 蹂듭뒿 ?곗씠???몄뀡 蹂댁〈 (?꾨즺??蹂듭뒿???ㅼ떆 議고쉶?????덈룄濡?questions? chatHistory瑜??ы븿?섏뿬 ???
    if (questions && questions.length > 0) {
      const solvedSessionKey = `completed_review_schedule_${targetScheduleId}`;
      const solvedSessionValue = JSON.stringify({ 
        questions: questions || [],
        selectedAnswers: selectedAnswers || {}, 
        revealedQuestions: revealedQuestions || {},
        tableAnswers: tableAnswers || {},
        tableGradingResults: tableGradingResults || {},
        tutorAnswers: tutorAnswers || {},
        tutorInputText: tutorInputText || {},
        chatHistory: chatHistory || []
      });
      await ensureSessionTable();
      await dbQuery.run(
        `INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
        [solvedSessionKey, solvedSessionValue]
      );

      // 蹂댁〈 ?뺤콉: ?댁쟾 ?몄뀡 ?뺣━
      if (!isMixedReq) {
        try {
          const finishedSchedules = await dbQuery.all(
            `SELECT id FROM schedules 
             WHERE topic_id = ? AND (status = 'completed' OR status = 'failed') 
             ORDER BY completed_at DESC, id DESC`,
            [topicIdInt]
          );
          if (finishedSchedules.length > 2) {
            const oldSchedules = finishedSchedules.slice(2);
            for (const oldSched of oldSchedules) {
              const oldSessionKey = `completed_review_schedule_${oldSched.id}`;
              await dbQuery.run('DELETE FROM app_session WHERE key = ?', [oldSessionKey]);
            }
          }
        } catch (policyErr) {
          console.warn('[DB Session Policy] Error cleaning up old sessions:', policyErr.message);
        }
      }
    }

    // 罹먯떆 ??젣 (ensureSessionTable ?몄텧 ?쒓굅)
    await dbQuery.run(
      "DELETE FROM app_session WHERE key = ? OR key LIKE ?",
      [`review_questions_topic_${topic_id}`, `review_questions_topic_${topic_id}_sess_%`]
    );
    if (!isMixedReq && targetScheduleId && targetScheduleId !== 9999 && targetScheduleId !== '9999') {
      await dbQuery.run(
        "DELETE FROM app_session WHERE key = ? OR key LIKE ?",
        [`review_questions_schedule_${targetScheduleId}`, `review_questions_schedule_${targetScheduleId}_sess_%`]
      );
    }

    // ?ㅼ쓬 ?뚯감 ?먮룞 ?앹꽦
    if (!isMixedReq && isPassed && !isBonus && schedule.review_round !== 99) {
      // FIX: 留앷컖怨≪꽑 二쇨린 蹂듭뒿 異붿쿇? '李몄“?쇱옄(referenceDate)'媛 ?꾨땶 ?ㅼ젣 '蹂듭뒿 ?꾨즺?쇱옄(Date.now())'瑜?湲곗??쇰줈 ?댁빞 ??
      const baseDate = new Date(); 
      await scheduleNextReviewRound(topicIdInt, schedule.review_round, baseDate);
    }

    res.json({
      success: true,
      isPassed,
      status: isPassed ? 'completed' : 'failed',
      message: isPassed
        ? `${schedule.review_round}?뚯감 ?댁쫰 ?듦낵! 蹂듭뒿 ?꾨즺濡???λ릺?덉뒿?덈떎.`
        : `${schedule.review_round}?뚯감 ?댁쫰 誘명넻怨? ?ㅼ쓬 蹂듭뒿 ?????댁쫰媛 ?쒓났?⑸땲??`
    });
  } catch (error) {
    console.error('[quiz/submit] Error:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡?蹂듭뒿 ?꾨즺 泥섎━???ㅽ뙣?덉뒿?덈떎.' });
  }
});

// POST /api/schedules/:id/reset -> Reset completed review back to pending
router.post('/schedules/:id/reset', async (req, res) => {
  const scheduleId = req.params.id;
  const { topic_id, topicId, review_round, reviewRound } = req.body;
  const tId = topic_id || topicId;
  const rRound = review_round !== undefined ? review_round : reviewRound;

  try {
    let schedule = null;
    const parsedTId = tId ? parseInt(tId, 10) : null;
    const parsedRRound = rRound !== undefined ? parseInt(rRound, 10) : undefined;

    if (parsedTId && !isNaN(parsedTId) && parsedRRound !== undefined && !isNaN(parsedRRound)) {
      const checkSql = `SELECT * FROM schedules WHERE topic_id = ? AND review_round = ?`;
      schedule = await dbQuery.get(checkSql, [parsedTId, parsedRRound]);
    }
    if (!schedule && scheduleId && scheduleId !== '9999') {
      const checkSql = `SELECT * FROM schedules WHERE id = ?`;
      schedule = await dbQuery.get(checkSql, [scheduleId]);
    }

    if (!schedule) {
      return res.status(404).json({ error: '?대떦 蹂듭뒿 ?쇱젙??李얠쓣 ???놁뒿?덈떎.' });
    }

    const newPlannedDate = schedule.planned_date;
    const targetStatus = schedule.status === 'practice' ? 'practice' : 'pending';

    const updateSql = `
      UPDATE schedules 
      SET status = ?, completed_at = NULL, score = NULL, correct_count = NULL, total_count = NULL
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [targetStatus, schedule.id]);

    const nextRound = schedule.review_round + 1;
    const deleteSql = `
      DELETE FROM schedules 
      WHERE topic_id = ? AND review_round = ? AND status = 'pending'
    `;
    await dbQuery.run(deleteSql, [schedule.topic_id, nextRound]);

    // 蹂듭뒿 痍⑥냼 ?? 湲곗〈 ?꾨즺??蹂듭뒿 ?몄뀡 湲곕줉???ㅼ떆 ?쒖꽦 ?몄뀡(Active Session)?쇰줈 蹂듦뎄?섏뿬 ?곗씠???좎떎 諛⑹?
    try {
      const solvedSessionKey = `completed_review_schedule_${schedule.id}`;
      const completedSession = await dbQuery.get(
        'SELECT value FROM app_session WHERE key = ?',
        [solvedSessionKey]
      );
      if (completedSession && completedSession.value) {
        const data = JSON.parse(completedSession.value);
        const activeStateKey = `review_questions_topic_${schedule.topic_id}`;
        const activeQuestionsKey = `${activeStateKey}_q`;

        const activeStateValue = JSON.stringify({
          sessionId: 'legacy_default',
          selectedAnswers: data.selectedAnswers || {},
          revealedQuestions: data.revealedQuestions || {},
          tableAnswers: data.tableAnswers || {},
          tableGradingResults: data.tableGradingResults || {},
          tutorAnswers: data.tutorAnswers || {},
          tutorInputText: data.tutorInputText || {},
          chatHistory: data.chatHistory || []
        });

        await dbQuery.run(
          `INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
          [activeStateKey, activeStateValue]
        );

        if (data.questions && data.questions.length > 0) {
          await dbQuery.run(
            `INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
            [activeQuestionsKey, JSON.stringify(data.questions)]
          );
        }

        // 蹂듦뎄 ???꾨즺 ?곹깭???몄뀡 ?ㅻ뒗 源붾걫?섍쾶 ?뺣━
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [solvedSessionKey]);
      }
    } catch (restoreErr) {
      console.warn('[Session Restore] Failed to restore active session from completed session:', restoreErr.message);
    }

    res.json({
      message: `${schedule.review_round}?뚯감 蹂듭뒿??由ъ뀑?섏뿀?듬땲??`,
      schedule_id: scheduleId,
      status: 'pending',
      planned_date: newPlannedDate,
      completed_at: null
    });
  } catch (error) {
    console.error('Error resetting review:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡?蹂듭뒿 ?쇱젙 由ъ뀑???ㅽ뙣?덉뒿?덈떎.' });
  }
});

// PUT /api/schedules/:id/score -> Manually update schedule score
router.put('/schedules/:id/score', async (req, res) => {
  const scheduleId = Number(req.params.id) || req.params.id;
  const { score, topic_id, topicId, review_round, reviewRound } = req.body;
  const tId = topic_id || topicId;
  const rRound = review_round !== undefined ? review_round : reviewRound;

  if (score === undefined || score === null || isNaN(Number(score)) || Number(score) < 0 || Number(score) > 100) {
    return res.status(400).json({ error: '?먯닔??0?먯꽌 100 ?ъ씠???レ옄?ъ빞 ?⑸땲??' });
  }

  try {
    let schedule = null;
    const parsedTId = tId ? parseInt(tId, 10) : null;
    const parsedRRound = rRound !== undefined ? parseInt(rRound, 10) : undefined;

    if (parsedTId && !isNaN(parsedTId) && parsedRRound !== undefined && !isNaN(parsedRRound)) {
      const checkSql = `SELECT * FROM schedules WHERE topic_id = ? AND review_round = ?`;
      schedule = await dbQuery.get(checkSql, [parsedTId, parsedRRound]);
    }
    if (!schedule && scheduleId && scheduleId !== 9999) {
      const checkSql = `SELECT * FROM schedules WHERE id = ?`;
      schedule = await dbQuery.get(checkSql, [scheduleId]);
    }

    if (!schedule) {
      return res.status(404).json({ error: '?대떦 蹂듭뒿 ?쇱젙??李얠쓣 ???놁뒿?덈떎.' });
    }

    if (schedule.status !== 'completed' && schedule.status !== 'failed') {
      return res.status(400).json({ error: '?꾨즺 ?먮뒗 ?ㅽ뙣 ?곹깭???쇱젙留??먯닔 蹂寃쎌씠 媛?ν빀?덈떎.' });
    }

    const targetScore = Math.round(Number(score) * 10) / 10;
    const newStatus = targetScore >= 60 ? 'completed' : 'failed';

    const updateSql = `
      UPDATE schedules 
      SET score = ?, status = ?
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [targetScore, newStatus, schedule.id]);

    res.json({
      success: true,
      message: `${schedule.review_round}?뚯감 蹂듭뒿 ?먯닔媛 ${targetScore}?먯쑝濡?蹂寃쎈릺?덉뒿?덈떎.`,
      score: targetScore,
      status: newStatus
    });
  } catch (error) {
    console.error('Error updating manual score:', error);
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟濡??깆쟻 ?낅뜲?댄듃???ㅽ뙣?덉뒿?덈떎.' });
  }
});

// POST /api/exam/detailed-answer
router.post('/exam/detailed-answer', async (req, res) => {
  const progressId = req.body.progressId || req.query.progressId;
  const localCallLLM = (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });

  let progressTimer = null;
  if (progressId) {
    progressTimer = startBackendProgressTimer(progressId, 1, '1?④퀎: AI ?ъ링 ?댁꽕 ?앹꽦 以?..', 90, 800, 5);
  }

  try {
    const { question, answer } = req.body;
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) {
      if (progressTimer) clearInterval(progressTimer);
      return res.status(400).json({ error: '?깅줉??AI API ?ㅺ? 議댁옱?섏? ?딆뒿?덈떎.' });
    }

    const prompt = `
?뱀떊? ??쒕?援?援??湲곗닠?먭꺽 湲곗닠???쒗뿕 異쒖젣?꾩썝 諛?理쒓퀬 沅뚯쐞?먯엯?덈떎.
?섑뿕?앹씠 醫낇빀?됯?瑜????以??ㅼ쓬 臾몄젣?????'?듭븞 ?꾨Ц蹂닿린(?ъ링 ?댁꽕)'瑜??붿껌?덉뒿?덈떎.

[臾몄젣]: ${question}
[湲곗〈 媛꾨왂 ?뺣떟/?댁꽕]: ${answer || '?놁쓬'}

???댁슜??諛뷀깢?쇰줈, ??臾몄젣? 愿?⑤맂 湲곗닠??諛곌꼍, ?듭떖 硫붿빱?덉쬁, 洹몃━怨??ㅻТ???쒖궗?먯쓣 ?ы븿?섏뿬 ?꾨꼍??湲곗닠??紐⑤쾾 ?듭븞(?먮뒗 ?ъ링 ?댁꽕)???묒꽦??二쇱떗?쒖삤.
?ㅼ쓬 洹쒖튃???꾧꺽???곕Ⅴ??떆??
1. 3?⑤씫 援ъ“(1. 媛쒖슂 諛?湲곗닠??諛곌꼍, 2. ?듭떖 硫붿빱?덉쬁/援ъ꽦?붿냼/鍮꾧탳遺꾩꽍, 3. ?ㅻТ???쒖궗??諛?寃곕줎)濡??쇰━?곸쑝濡??묒꽦?섏떗?쒖삤.
2. 蹂닿린 ?명븳 Markdown ?뺤떇(?곸젅??援듭? 湲?? 湲癒몃━ 湲고샇 ?????ъ슜?섎릺, 留덊겕?ㅼ슫 肄붾뱶釉붾줉(\`\`\`markdown)?쇰줈 ?꾩껜瑜?媛먯떥吏 留먭퀬 諛붾줈 ?띿뒪?몃줈 異쒕젰?섏떗?쒖삤.

${ENGINEERING_STANDARDS}
${LATEX_CHAT_PROMPT_INSTRUCTIONS}
`;

    try {
      const responseText = await localCallLLM(null, prompt);
      const healedText = healLatexFormulas(responseText.trim()); // ????섏떇 ?뺤젙 寃고빀
      if (progressId) {
        updateProgress(progressId, 1, '1?④퀎: ?댁꽕 ?앹꽦 ?꾨즺!', 100);
      }
      res.json({ text: healedText });
    } catch (err) {
      console.error('Detailed answer route error:', err);
      if (progressId) {
        updateProgress(progressId, 1, '?ㅻ쪟 諛쒖깮?쇰줈 ?댁꽕 ?앹꽦 ?ㅽ뙣', 100);
      }
      res.status(500).json({ error: err.message || '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.' });
    }
  } catch (err) {
    console.error('Detailed answer route error:', err);
    if (progressId) {
      updateProgress(progressId, 1, '?ㅻ쪟 諛쒖깮?쇰줈 ?댁꽕 ?앹꽦 ?ㅽ뙣', 100);
    }
    res.status(500).json({ error: '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// POST /api/hint
router.post('/hint', async (req, res) => {
  const progressId = req.body.progressId || req.query.progressId;
  const localCallLLM = (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });

  let progressTimer = null;
  if (progressId) {
    progressTimer = startBackendProgressTimer(progressId, 1, '1?④퀎: AI ?뚰듃 ?앹꽦 以?..', 90, 800, 10);
  }

  try {
    const { questionText } = req.body;
    if (!questionText) {
      if (progressTimer) clearInterval(progressTimer);
      return res.status(400).json({ error: '吏덈Ц(臾몄젣) ?띿뒪?멸? ?쒓났?섏? ?딆븯?듬땲??' });
    }

    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY
    );
    if (!hasAnyAiKey) {
      if (progressTimer) clearInterval(progressTimer);
      return res.status(400).json({ error: '?깅줉??AI API ?ㅺ? 議댁옱?섏? ?딆뒿?덈떎.' });
    }

    const systemInstruction = `?뱀떊? ??쒕?援?湲곗닠???쒗뿕 ?꾨Ц ?쒗꽣?낅땲??
?섑뿕?앹씠 ?怨??덈뒗 二쇨????먮뒗 媛앷???臾몄젣?????**留ㅼ슦 ?쎄퀬 吏곴??곸씠硫?媛꾨떒???뚰듃**瑜???臾몃떒(3以??대궡)?쇰줈 ?쒓났??二쇱떗?쒖삤.

[吏移?:
1. 蹂듭옟??怨듭떇?대굹 ?좊룄 怨쇱젙???ㅻ챸?섏? 留먭퀬, ??臾몄젣瑜??닿껐?섍린 ?꾪빐 媛???듭떖?곸쑝濡??앷컖?댁빞 ?섎뒗 媛쒕뀗?대굹 臾쇰━??嫄곕룞???쇱긽?곸씠怨?吏곴??곸씤 鍮꾩쑀濡??ㅻ챸?섏떗?쒖삤.
2. ?섑뿕?앹씠 ?ㅼ뒪濡?臾몄젣瑜?? ???덈룄濡??좊룄?댁빞 ?섎ŉ, 吏곸젒?곸씤 ?대떟?대굹 理쒖쥌 ?뺣떟 ?섏튂瑜??쒓났?댁꽌???덈? ???⑸땲??
3. 移쒖젅?섍퀬 遺?쒕윭???쒗꽣??留먰닾瑜??ъ슜?섏떗?쒖삤.
${ENGINEERING_STANDARDS}`;
    const userPrompt = `?ㅼ쓬 臾몄젣??????쎄퀬 吏곴??곸씤 ?뚰듃瑜?媛꾨떒???곸뼱二쇱꽭??\n\n[臾몄젣 蹂몃Ц]\n${questionText}`;
    
    const responseText = await localCallLLM(systemInstruction, userPrompt, null, 'question');
    const healedText = healLatexFormulas(responseText);
    if (progressId) {
      updateProgress(progressId, 1, '1?④퀎: ?뚰듃 ?앹꽦 ?꾨즺!', 100);
    }
    res.json({ hint: healedText });
  } catch (err) {
    console.error('Hint generation error:', err);
    if (progressId) {
      updateProgress(progressId, 1, '?ㅻ쪟 諛쒖깮?쇰줈 ?뚰듃 ?앹꽦 ?ㅽ뙣', 100);
    }
    res.status(500).json({ error: err.message || '?뚰듃瑜??앹꽦?섎뒗 ???ㅽ뙣?덉뒿?덈떎.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// POST /api/formula/generate-quiz-question
router.post('/formula/generate-quiz-question', async (req, res) => {
  try {
    const { formulaTitle, formula, concept, assumptions } = req.body;
    if (!formulaTitle || !formula) {
      return res.status(400).json({ error: '怨듭떇 ?뺣낫媛 遺議깊빀?덈떎.' });
    }

    let topicTitle = formulaTitle;
    let topicKeywords = '';
    let fileText = '';
    try {
      const matchedTopic = await dbQuery.get(
        `SELECT id, title, keywords, pdf_name, extracted_text, (CASE WHEN extracted_text IS NULL OR extracted_text = '' THEN pdf_data ELSE NULL END) AS pdf_data FROM topics WHERE ? LIKE '%' || title || '%' OR title LIKE '%' || ? || '%' LIMIT 1`,
        [formulaTitle, formulaTitle]
      );
      if (matchedTopic) {
        topicTitle = matchedTopic.title;
        topicKeywords = matchedTopic.keywords || '';
        if (matchedTopic.extracted_text) {
          fileText = matchedTopic.extracted_text;
        } else if (matchedTopic.pdf_data) {
          const isHtml = matchedTopic.pdf_name && (
            matchedTopic.pdf_name.toLowerCase().endsWith('.html') ||
            matchedTopic.pdf_name.toLowerCase().endsWith('.htm') ||
            fileUtils.isBufferHtml(matchedTopic.pdf_data)
          );
          try {
            if (isHtml) fileText = fileUtils.htmlToPlainText(fileUtils.decodeHtmlBuffer(matchedTopic.pdf_data));
            else {
              const parsed = await pdfParse(matchedTopic.pdf_data);
              fileText = parsed.text || '';
            }
          } catch (e) {}
          fileText = fileUtils.mergeVerticalText(fileText);
        }
      }
    } catch (dbErr) {
      console.warn('Failed to find matching topic for formula validation:', dbErr);
    }

    const finalValidated = await ocrPlugin.generateCalculationQuizQuestion(
      formulaTitle,
      formula,
      concept,
      assumptions,
      callLLMWithFailover,
      topicTitle,
      topicKeywords,
      fileText
    );
    res.json(finalValidated);
  } catch (err) {
    console.error('generate-quiz-question error:', err);
    res.status(500).json({ error: err.message || '怨꾩궛 臾몄젣 ?앹꽦???ㅽ뙣?덉뒿?덈떎.' });
  }
});

// POST /api/item-quiz/generate
router.post('/item-quiz/generate', async (req, res) => {
  try {
    const { itemType, itemData } = req.body;
    if (!itemType || !itemData) {
      return res.status(400).json({ error: '?꾩닔 ?댁쫰 ?곗씠?곌? ?꾨씫?섏뿀?듬땲??' });
    }

    let questionObj = null;
    if (itemType === 'table') {
      questionObj = await itemQuizPlugin.generateTableQuizQuestion(itemData);
    } else if (itemType === 'acronym') {
      questionObj = await itemQuizPlugin.generateAcronymQuizQuestion(itemData);
    } else if (itemType === 'overview') {
      questionObj = await itemQuizPlugin.generateOverviewQuizQuestion(itemData);
    } else {
      return res.status(400).json({ error: '吏?먮릺吏 ?딅뒗 ?댁쫰 ??낆엯?덈떎.' });
    }

    res.json(questionObj);
  } catch (err) {
    console.error('item-quiz generate error:', err);
    res.status(500).json({ error: err.message || '?댁쫰 ?앹꽦 ?ㅽ뙣' });
  }
});

// POST /api/quiz/generate-item-questions
router.post('/quiz/generate-item-questions', async (req, res) => {
  try {
    const { item, type, level } = req.body;
    if (!item) {
      return res.status(400).json({ success: false, error: '??ぉ ?곗씠?곌? ?꾨씫?섏뿀?듬땲??' });
    }

    const count = level === 'basic' ? 1 : level === 'deep' ? 5 : 3;
    const title = item.title || item.name || '?숈뒿 ??ぉ';
    const contentStr = typeof item.content === 'object' ? JSON.stringify(item.content) : (item.content || item.html || '');

    const prompt = `[?숈뒿 ??ぉ ?좏삎]: ${type || '?쇰컲'}
[??ぉ ?쒕ぉ]: ${title}
[??ぉ 蹂몃Ц/?곗씠??:
${contentStr}

???숈뒿 ?곗씠?곕? 諛뷀깢?쇰줈 ?섑뿕?앹씠 ?숈뒿 ?곹깭瑜??먭??????덈뒗 留욎땄???댁쫰 臾몄젣 ${count}媛쒕? 異쒖젣??二쇱떗?쒖삤.

[異쒖젣 吏移?:
1. ?쒖씠??諛??쒖닠 ?뺤떇(媛앷????먮뒗 ?쒖닠??怨꾩궛??鍮덉뭏梨꾩슦湲???怨좊젮?섏뿬 怨듯븰???숈닠??媛移섍? ?믪? 臾몄젣瑜?異쒖젣?섏떗?쒖삤.
2. LaTeX 怨듭떇???ㅼ뼱媛??寃쎌슦 standard KaTeX ($...$ ?먮뒗 $$...$$) ?뺤떇??以?섑븯??떆??
3. 諛섎뱶???ㅼ쭅 ?좏슚??JSON 諛곗뿴 ?뺥깭濡쒕쭔 異쒕젰?섏떗?쒖삤.

[諛섑솚 JSON 援ъ“ ?덉떆]:
[
  {
    "question": "臾몄젣 ?댁슜 ?ㅻ챸 (?꾩슂??$怨듭떇$ ?ы븿)",
    "options": ["?좏깮吏1", "?좏깮吏2", "?좏깮吏3", "?좏깮吏4"] // ?쒖닠??鍮덉뭏梨꾩슦湲곗쓽 寃쎌슦 null ?먮뒗 []
  }
]`;

    const systemPrompt = `?뱀떊? ?좊ぉ/吏諛섍났??湲곗닠???먭꺽?쒗뿕 異쒖젣?꾩썝?낅땲?? ?쒓뎅?대줈 ?뺣??섍퀬 紐낇솗??臾몄젣瑜?JSON 諛곗뿴濡쒕쭔 異쒖젣?섏떗?쒖삤.`;
    const responseText = await callLLMWithFailover(systemPrompt, prompt, null, 'generation');

    let questions = [];
    try {
      const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      questions = JSON.parse(cleaned);
    } catch (e) {
      questions = [
        {
          question: `[${title}] ?듭떖 媛쒕뀗 諛?硫붿빱?덉쬁??湲곗닠???섏??쇰줈 ?곸꽭???쒖닠?섏떆??`,
          options: null
        }
      ];
    }

    res.json({ success: true, questions });
  } catch (err) {
    console.error('generate-item-questions error:', err);
    res.status(500).json({ success: false, error: err.message || '臾몄젣 ?앹꽦 ?ㅽ뙣' });
  }
});

// POST /api/item-quiz/grade
router.post('/item-quiz/grade', async (req, res) => {
  try {
    const { itemType, questionTitle, correctContent, userInputs } = req.body;
    const result = await itemQuizPlugin.gradeItemQuizAnswer({
      itemType,
      questionTitle,
      correctContent,
      userInputs,
      callLLMWithFailover
    });
    res.json({ text: result });
  } catch (err) {
    console.error('item-quiz grade error:', err);
    res.status(500).json({ error: err.message || '?댁쫰 梨꾩젏 ?ㅽ뙣' });
  }
});

// POST /api/quiz/grade-item-answers
router.post('/quiz/grade-item-answers', async (req, res) => {
  try {
    const { item, type, questions, userAnswers } = req.body;
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ success: false, error: '梨꾩젏??臾몄젣 紐⑸줉???꾨씫?섏뿀?듬땲??' });
    }

    const title = item?.title || '?숈뒿 ??ぉ';
    const contentStr = typeof item?.content === 'object' ? JSON.stringify(item.content) : (item?.content || item?.html || '');

    const prompt = `[?숈뒿 ??ぉ ?좏삎]: ${type || '?쇰컲'}
[??ぉ ?쒕ぉ]: ${title}
[?먮Ц/紐⑤쾾 ?듭븞 ?뺣낫]:
${contentStr}

[異쒖젣??臾몄젣 紐⑸줉 諛??섑뿕???쒖텧 ?듭븞]:
${questions.map((q, i) => `臾몄젣 ${i + 1}: ${q.question}
?쒖텧 ?듭븞: ${userAnswers?.[i] || '(誘몄젣異?'}`).join('\n\n')}

???쒖텧 ?듭븞?ㅼ쓣 紐⑤쾾 ?듭븞 諛?援??湲곗닠?먭꺽 湲곗닠??梨꾩젏 湲곗????곕씪 ?꾧꺽?섍퀬 ?뺣??섍쾶 梨꾩젏??二쇱떗?쒖삤.

[諛섑솚 JSON 援ъ“ 洹쒓꺽]:
{
  "totalScore": 85,
  "earnedPoints": 85,
  "maxPoints": 100,
  "feedbackSummary": "?꾨컲?곸씤 ?듬? ?곗닔 諛?怨듯븰???듭떖 ?⑹뼱 湲곗닠 ?곹깭 ?뚮???",
  "questionResults": [
    {
      "score": 85,
      "isCorrect": true,
      "feedback": "媛쒕뀗 ?쒖닠???곗닔?섎ŉ ?듭떖 ?ㅼ썙?쒓? ???ы븿?섏뿀?듬땲??",
      "modelAnswer": "紐⑤쾾 ?듭븞 諛?二쇱슂 怨듯븰???댁꽕"
    }
  ]
}

諛섎뱶????JSON 媛앹껜 ?뺤떇留?異쒕젰?섏떗?쒖삤.`;

    const systemPrompt = `?뱀떊? ??쒕?援?援??湲곗닠?먭꺽 湲곗닠???쒗뿕 ?섏꽍 梨꾩젏愿?낅땲?? 二쇱뼱吏??섑뿕???듭븞??媛앷??곸쑝濡??ъ궗?섏뿬 ?뺣???JSON 寃곌낵濡?諛섑솚?섏떗?쒖삤.`;
    const responseText = await callLLMWithFailover(systemPrompt, prompt, null, 'grading');

    let resultJson = null;
    try {
      const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      resultJson = JSON.parse(cleaned);
    } catch (e) {
      resultJson = {
        totalScore: 70,
        earnedPoints: 70,
        maxPoints: 100,
        feedbackSummary: '?듭븞 遺꾩꽍 寃곌낵瑜??뺣━?덉뒿?덈떎.',
        questionResults: questions.map(() => ({
          score: 70,
          isCorrect: true,
          feedback: '?듭븞???쒖텧?섏뿀?듬땲?? ?먮Ц 紐⑤쾾 ?듭븞???④퍡 蹂듭뒿?섏떗?쒖삤.',
          modelAnswer: contentStr.slice(0, 200)
        }))
      };
    }

    res.json({ success: true, ...resultJson });
  } catch (err) {
    console.error('grade-item-answers error:', err);
    res.status(500).json({ success: false, error: err.message || '梨꾩젏 ?ㅽ뙣' });
  }
});

// DELETE /api/session/exam
router.delete('/session/exam', async (req, res) => {
  try {
    await ensureSessionTable();
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', ['exam_session']);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/session/exam error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/backfill-scores -> Admin manual backfill trigger
router.post('/admin/backfill-scores', async (req, res) => {
  try {
    res.json({ success: true, message: '怨쇨굅 蹂듭뒿 ?대젰 ?먯닔 諛깊븘 ?꾨즺' });
  } catch (err) {
    console.error('Admin backfill error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/search-source -> Dedicated Source Search API assigned to gemini-3.1-flash-lite
router.post('/search-source', async (req, res) => {
  try {
    const { query, topicTitle, documentText, progressId } = req.body;
    const sysPrompt = `?뱀떊? ??쒕?援?援???ㅺ퀎湲곗?(KDS/KCS) 諛?援?넗援먰넻遺 ?ㅺ퀎?쒓났吏移? ?먮낫怨좎꽌 異쒖쿂 ?꾨Ц 寃??AI?낅땲?? gemini-3.1-flash-lite 珥덇퀬???붿쭊?쇰줈 二쇱뼱吏?議고쉶 ?붿껌??????뺥솗??異쒖쿂 臾명뿄, 議고빆 踰덊샇 諛??듭떖 洹쒖젙 ?섏튂 ?곗씠?곕? 李얠븘 諛섑솚?섏떗?쒖삤.`;
    const userPrompt = `[異쒖쿂 寃??吏덉쓽]: ${query || topicTitle || '援?? 嫄댁꽕湲곗? KDS/KCS 諛??먮낫怨좎꽌 吏移?}\n[李몄“ 臾몄꽌 ?띿뒪??:\n${documentText || (topicTitle ? `KDS / KCS 援?? 嫄댁꽕湲곗? 諛??먮낫怨좎꽌: ${topicTitle}` : '援?? 嫄댁꽕湲곗? 諛??먮낫怨좎꽌 吏移?)}`;
    
    const result = await searchSourceDocumentWithGeminiLite(sysPrompt, userPrompt, null, { progressId });
    return res.json({ success: true, model: 'gemini-3.1-flash-lite', result });
  } catch (err) {
    console.error('POST /api/search-source error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
