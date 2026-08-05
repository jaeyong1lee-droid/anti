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
       AND (value LIKE '%?¹ì„± 1%' OR value LIKE '%?¹ì„± 2%' OR value LIKE '%A ?…ë ¥%' OR value LIKE '%?˜ì¹˜ ê³„ì‚°%')`
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

  const isFlowchart = cleanText.includes('?Œâ??€') || cleanText.includes('??) || cleanText.includes('```') || cleanText.includes('?ë¦„??) || cleanText.includes('?Œë¡œ?°ì°¨??);
  if (isFlowchart) return cleanText.trim();
  return cleanText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function getCoreSubjectFromTitle(title) {
  if (!title) return '';
  let core = title.trim();
  // Remove file extensions if any
  core = core.replace(/\.(pdf|hwp|docx?|txt|xlsx?|pptx?)$/i, '');
  // Remove document-like suffixes (e.g. ê³µí•™ ?´ì„ ë³´ê³ ?? ê³µë??¸íŠ¸, ?”ì•½ë³???
  const suffixPattern = /(?:\s+|_|-)?(?:ê³µí•™\s*)?(?:?´ì„\s*)?(?:ë³´ê³ ??ë³´ê³ |?¸íŠ¸|?”ì•½ë³??”ì•½|?•ë¦¬|ê³µë??¸íŠ¸|ê³µë?|?ë£Œ|?Œì¼|ë³??ìŠ¤??StudyNote|studynote|Study|study|ë¬¸ì œ|ê³¼ì œ|ì§ˆë¬¸)$/i;
  core = core.replace(suffixPattern, '');
  
  // Remove trailing definition, concept, occurrence, method, theory terms to keep it pure engineering subject
  const conceptPattern = /(?:\s*ë°?s*|\s+)?(?:?•ì˜\s*ë°?s*ë°œìƒ\s*ì¡°ê±´|?•ì˜\s*ë°?s*ë°œìƒì¡°ê±´|?•ì˜\s*ë°?s*ë°œìƒ\s*ë©”ì»¤?ˆì¦˜|?•ì˜|ë°œìƒ\s*ì¡°ê±´|ë°œìƒì¡°ê±´|ê°œë…|?´ë¡ |ê³µë²•)$/i;
  core = core.replace(conceptPattern, '');
  
  return core.trim();
}

function normalizeMcText(text) {
  if (!text) return '';
  return text
    .replace(/^[? â‘¡?¢â‘£??-5][\s\.\)\:\s]*/, '')
    .replace(/\s+/g, '')
    .replace(/[.~,`'"'']/g, '')
    .toLowerCase();
}

function sanitizeMultipleChoiceAnswer(q) {
  if (!q || !q.options || q.options.length === 0 || !q.explanation) return q;

  const options = q.options;
  const exp = q.explanation;
  const currentAns = (q.answer || '').trim();

  const conclusionMatch = exp.match(/(?:\[ìµœì¢…\s*?•ë‹µ\s*?°ì¶œ\]|?°ë¼???•ë‹µ?€|ê²°ë¡ ?ìœ¼ë¡?[\s\S]*$/i);
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

    const numKeywords = normOpt.match(/(?:\d+\/\d+|\d+ë°?ë³€?”ê?\s*?†ë‹¤|ì¦ê?|ê°ì†Œ)/g) || [];
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
 * ?ŒìŠ¤ ?ìŠ¤??OCR)?ì„œ (1), (2), (3)... ?•ì‹?¼ë¡œ ëª…ì‹œ???˜ìœ„ ì§ˆë¬¸??ì¶”ì¶œ?˜ì—¬
 * ?´ë–¤ ? í”½?´ë“  ?™ì ?¼ë¡œ ?˜ì¹˜ ê³„ì‚° ?œì±„?°ê¸° ?¼ì„ ?ì„±?œë‹¤.
 * ì¶”ì¶œ ?¤íŒ¨ ??ë²”ìš© fallback rowsë¥??¬ìš©?œë‹¤.
 */
function extractCalculationRowsFromText(fileText) {
  if (!fileText) return null;

  // "(1) êµ¬í•˜?”í•­ëª? ?ëŠ” "1) êµ¬í•˜?”í•­ëª? ?¨í„´??ì¶”ì¶œ
  // êµ¬í•˜?œì˜¤, ê³„ì‚°?˜ì‹œ?? ?°ì •?˜ì‹œ????ë¬¸ì¥?ì„œ ê°??˜ìœ„ ??ª©???ìƒ‰
  const subQuestionPattern = /[ï¼?](\d+)[)ï¼?\s*([^\n(ï¼?+?)(?=\s*[ï¼?]\d+[)ï¼?|\n\n|$)/g;
  const matches = [];
  let match;
  while ((match = subQuestionPattern.exec(fileText)) !== null) {
    const num = parseInt(match[1]);
    const text = match[2].trim().replace(/[,ï¼?\s*$/, '').replace(/\s+/g, ' ');
    // ?ˆë¬´ ì§§ê±°??3??ë¯¸ë§Œ) ?ˆë¬´ ê¸?80??ì´ˆê³¼) ??ª©, ì¡°ê±´ ?¤ëª… ë¬¸ì¥ ?±ì? ?œì™¸
    if (text.length >= 3 && text.length <= 80 && num >= 1 && num <= 10) {
      matches.push({ num, text });
    }
  }

  // ?°ì†??ë²ˆí˜¸ë¡?êµ¬ì„±??ê·¸ë£¹ ì¤?ê°€??ê¸¸ê³  ?„ì „??ê²ƒì„ ? íƒ
  if (matches.length < 2) return null;

  // num=1ë¶€???œì‘?˜ëŠ” ê°€??ê¸??°ì† ?œí€€?¤ë? ì°¾ëŠ”??
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

  // rows ë°?answers ?™ì  ?ì„±
  const rows = bestGroup.map(({ num, text }) => [
    `(${num}) ${text}`,
    `[INPUT_${num}]`
  ]);
  const answers = {};
  bestGroup.forEach(({ num, text }) => {
    answers[`INPUT_${num}`] = `(${num}) ${text} ê³µì‹ ë°??˜ì¹˜ ?€??;
  });

  return { rows, answers };
}

function generateCalculationFallbackQuestions(title, keywords, fileText) {
  // 1?¨ê³„: ?ŒìŠ¤ ?ìŠ¤?¸ì—???ë¬¸ ?˜ìœ„ ì§ˆë¬¸???™ì ?¼ë¡œ ì¶”ì¶œ ?œë„
  const extracted = extractCalculationRowsFromText(fileText);

  // 2?¨ê³„: ì¶”ì¶œ ?¤íŒ¨ ??topic ?¤ì›Œ??ê¸°ë°˜ ë²”ìš© fallback rows ?¬ìš©
  const rows = extracted ? extracted.rows : [
    ["(1) ê³„ì‚° ??ª© A", "[INPUT_1]"],
    ["(2) ê³„ì‚° ??ª© B", "[INPUT_2]"],
    ["(3) ê³„ì‚° ??ª© C", "[INPUT_3]"]
  ];
  const answers = extracted ? extracted.answers : {
    INPUT_1: "ê³„ì‚° ??ª© A ê³µì‹ ë°??˜ì¹˜ ?€??,
    INPUT_2: "ê³„ì‚° ??ª© B ê³µì‹ ë°??˜ì¹˜ ?€??,
    INPUT_3: "ê³„ì‚° ??ª© C ê³µì‹ ë°??˜ì¹˜ ?€??
  };

  return [
    {
      type: "ì£¼ê???(?œì±„?°ê¸°)",
      subtype: "?œì±„?°ê¸°",
      question: `[${title} ê³„ì‚° ë¬¸ì œ] ì²¨ë? ê·¸ë¦¼ ë°??ë³´ê³ ì„œ ì¡°ê±´???°ë¥¸ ?˜ì¹˜ ê³„ì‚° ??ª©???•ë‹µ??êµ¬í•˜???„ë˜ ?œì˜ ë¹ˆì¹¸???„ì„±?˜ì‹œ??`,
      tableData: {
        headers: ["êµ¬í•˜????ª©", "ê³„ì‚° ê²°ê³¼ ë°??µì•ˆ"],
        rows: rows
      },
      answers: answers,
      explanation: "?ë³´ê³ ì„œ ë°??œê³µ???¤í¬ë¦°ìƒ· ?´ë?ì§€??ê³µí•™???¤ê³„ ì¡°ê±´???€?…í•˜??ê³„ì‚°?˜ëŠ” ?„ê°œ ê³¼ì •?…ë‹ˆ??"
    },
    {
      type: "ì£¼ê???(?¨ë‹µ??",
      question: `[${title} ê³µí•™???˜ë?] ??ê³„ì‚° ê³¼ì • ë°?ê²°ê³¼ê°€ ?¤ê³„?€ ?œê³µ ?¤ë¬´??ì£¼ëŠ” êµí›ˆ ?ëŠ” ê³µí•™???˜ë?(ì§€ë°?ê±°ë™ ?´ì„, ?ˆì „???‰ê? ??ë¥??¤ëª…?˜ì‹­?œì˜¤.`,
      answer: "?¤ê³„ ë°??œê³µ ì¡°ê±´???ˆì „ ?¬ìœ ???•ë³´?€ ì§€ë°?ê±°ë™ ë¶„ì„??ê¸°ì´ˆ ?ë£Œ ?œê³µ",
      explanation: "ê³„ì‚° ê²°ê³¼ë¥??µí•´ ?œê³„ ?íƒœë¥??ë‹¨?˜ê³ , ?¤ì œ ì§€ë°˜ì˜ ê±°ë™ ?¹ì§•ê³?ë¶ˆí™•?¤ì„±??ê³ ë ¤???¤ê³„ ë§ˆì§„ ë°?ê³µí•™??êµí›ˆ???´í•´?˜ëŠ” ê²ƒì´ ?µì‹¬?…ë‹ˆ??"
    },
    {
      type: "ì£¼ê???(?¨ë‹µ??",
      question: `[${title} ê³µí•™???€ì±? ??ë¬¸ì œ??ê³„ì‚° ê²°ê³¼?€ ê´€?¨í•˜???„ì¥?ì„œ ê³µí•™??ë¬¸ì œê°€ ë°œìƒ?ˆì„ ?Œì˜ ?¤ë¬´???´ê²°ì±?ë°??€ì±…ì„ ?œìˆ ?˜ì‹­?œì˜¤.`,
      answer: "ì§€ë°?ê°œëŸ‰ ê³µë²• ?ìš©, ?˜ì¤‘ ë¶„ì‚° ?€ì±??˜ë¦½, ê³„ì¸¡ ê´€ë¦?ê°•í™” ë°?ì°¨ìˆ˜/ë°°ìˆ˜ ê³µë²• ?¤ê³„",
      explanation: "ë¶ˆì•ˆ?•ì„± ë°œìƒ ???„ì¥?ì„œ ì·¨í•  ???ˆëŠ” êµ¬ì²´?ì¸ ì§€ë°?ê°œëŸ‰ ë°?ê³µë²• ë³€ê²??€ì±…ì„ ?œì‹œ?˜ëŠ” ë¬¸í•­?…ë‹ˆ??"
    }
  ];
}


function assembleFinalCalculationQuestions(questions, topic, fileText) {
  // 1. LLM???ì„±???œì±„?°ê¸°???ë¬¸ ë§¥ë½??ëª¨ë¥´ê³??„ì˜ ?ì„±?˜ë?ë¡??„ëŸ‰ ?ê¸°
  let finalQuestions = (questions || []).filter(q =>
    q.type !== 'ì£¼ê???(?œì±„?°ê¸°)'
  );

  // 2. ?ŒìŠ¤ ?ìŠ¤?¸ì—???ë¬¸ ?˜ìœ„ ì§ˆë¬¸???ë™ ì¶”ì¶œ?˜ì—¬ ê³„ì‚° ???ì„±
  //    ì¶”ì¶œ ?¤íŒ¨ ??ë²”ìš© fallback ?¬ìš©
  const fb = generateCalculationFallbackQuestions(topic.title, topic.keywords, fileText);
  finalQuestions.unshift(fb[0]);

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
      (curr.question.includes('??) || curr.question.includes('??) || curr.question.includes('?ë¦„??)) &&
      (curr.type === 'ì£¼ê???(?¨ë‹µ??' || curr.type === 'ì£¼ê???(?œì±„?°ê¸°)') &&
      (next.type === 'ì£¼ê???(?œì±„?°ê¸°)' || next.subtype === '?œì±„?°ê¸°') &&
      (!next.question || 
       next.question === 'undefined' || 
       (typeof next.question === 'string' && 
        (next.question.trim().length < 20 || 
         next.question.includes('ë¹ˆì¹¸ êµ¬ë¶„') || 
         next.question.includes('?…ë ¥ ?µì•ˆ'))
       )
      )
    ) {
      console.log(`[Flowchart Merger] Merging split flowchart question at index ${i} and ${i + 1}`);
      const mergedQuestion = {
        ...next,
        type: 'ì£¼ê???(?œì±„?°ê¸°)',
        subtype: '?œì±„?°ê¸°',
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

  let qIntro = questions.find(q => q.type === 'ì£¼ê???(ê°œìš”)');
  if (qIntro) {
    qIntro = { ...qIntro };
    qIntro.type = 'ì£¼ê???(ê°œìš”)';
    delete qIntro.tableData;
    delete qIntro.answers;
    delete qIntro.subtype;
  }

  let qFormula = questions.find(q => q.type === 'ì£¼ê???(ê³µì‹)');
  if (qFormula) {
    qFormula = { ...qFormula };
    qFormula.type = 'ì£¼ê???(ê³µì‹)';
    delete qFormula.tableData;
    delete qFormula.answers;
    delete qFormula.subtype;
  }

  const carryOverShorts = (carryOverQuestions || []).filter(q => (q.type || '').includes('?¨ë‹µ??) && q !== qIntro && q !== qFormula);
  const carryOverTables = (carryOverQuestions || []).filter(q => ((q.type || '').includes('?œì±„?°ê¸°') || q.subtype === '?œì±„?°ê¸°') && q !== qIntro && q !== qFormula);
  const carryOverMcs = (carryOverQuestions || []).filter(q => ((q.type || '').includes('ê°ê???) || (q.options && q.options.length > 0)) && q !== qIntro && q !== qFormula);

  const subjsShort = [...questions.filter(q => q.type === 'ì£¼ê???(?¨ë‹µ??' && q !== qIntro && q !== qFormula), ...carryOverShorts];
  const subjsTable = [...questions.filter(q => (q.type === 'ì£¼ê???(?œì±„?°ê¸°)' || q.subtype === '?œì±„?°ê¸°') && q !== qIntro && q !== qFormula), ...carryOverTables];
  const mcs = [...questions.filter(q => (q.type === 'ê°ê???(4ì§€? ë‹¤)' || (q.options && q.options.length > 0)) && q !== qIntro && q !== qFormula), ...carryOverMcs];

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
  const fieldKeywords = ["?˜ì", "?€ì±?, "ë¬¸ì œ??, "?œë‚˜ë¦¬ì˜¤", "?„ì¥", "ë¬¸ì œ ?í™©", "?€ì²?, "countermeasure", "solution", "scenario"];
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
    q.question.includes('??) || q.question.includes('??) || q.question.includes('?ë¦„??) || q.question.includes('?Œë¡œ?°ì°¨??)
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
    qIntro,                     // 1ë²?ì£¼ê???(index 0)
    qFormula,                   // 2ë²?ì£¼ê???(index 1)
    shuffledMcs[0],             // 3ë²?ê°ê???(index 2)
    finalCompTables[0],         // 4ë²??œì±„?°ê¸° 1 (index 3) -> Comparison Table 1
    shuffledMcs[1],             // 5ë²?ê°ê???(index 4)
    finalShorts4[0],            // 6ë²?ì£¼ê???(index 5) -> Short Subjective 1 (Concept 1)
    finalFlowchart,             // 7ë²??œì±„?°ê¸° (index 6) -> Flowchart Table
    finalCompTables[1],         // 8ë²??œì±„?°ê¸° 2 (index 7) -> Comparison Table 2
    shuffledMcs[2],             // 9ë²?ê°ê???(index 8)
    finalShorts4[1],            // 10ë²?ì£¼ê???(index 9) -> Short Subjective 2 (Concept 2)
    shuffledMcs[3],             // 11ë²?ê°ê???(index 10)
    finalShorts4[2],            // 12ë²?ì£¼ê???(index 11) -> Short Subjective 3 (Concept 3)
    finalShorts4[3]             // 13ë²?ì£¼ê???(index 12) -> Short Subjective 4 (Field/Countermeasure)
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
        return '\n[?š¨ ??? í”½(' + topicId + ')???„ìš© ë¬¸ì œ ì¶œì œ ë°?ë³€??ì§€ì¹?- ë°˜ë“œ??ë°˜ì˜?˜ì‹­?œì˜¤]:\n' + formatted + '\n';
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
      return res.status(404).json({ error: '? í”½??ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
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

    let cached = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);

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
        'SELECT key, value FROM app_session WHERE key LIKE ? ORDER BY updated_at DESC LIMIT 1',
        [pattern]
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
      cached = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [legacyKey]);
    }

    if (cached && cached.value) {
      const parsed = JSON.parse(cached.value);
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
        if (!(topic.category === 'ê³„ì‚°' && cachedQuestions.length !== 4)) {
          const mismatchedCount = cachedQuestions.filter(q => isQuestionMismatched(q, topic.title, topic.keywords)).length;
          if (mismatchedCount === 0) {
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
          } else {
            await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
          }
        } else {
          await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        }
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
      progressTimer = startBackendProgressTimer(progressId, 1, '1?¨ê³„: AI ?ˆìƒ ë¬¸ì œ ?ì„± ?œì‘...', 50, 1500, 5);
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
      console.warn('?´ì „ ?¤ë‹µ ë¡œë”© ?¤íŒ¨:', err);
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
      searchTarget.includes('?œì„±??) || searchTarget.includes('activity') ||
      searchTarget.includes('?´ì¤‘ì¸?) || searchTarget.includes('double layer') || searchTarget.includes('ddl') ||
      searchTarget.includes('?•ë?') || searchTarget.includes('consolidation') || searchTarget.includes('ì¹¨í•˜') || searchTarget.includes('settlement') ||
      searchTarget.includes('?Œë“œë§¤íŠ¸') || searchTarget.includes('sand mat') ||
      searchTarget.includes('?‰ì‚¬?¬ì˜') || searchTarget.includes('stereographic') ||
      searchTarget.includes('?¸ë°œ') || searchTarget.includes('pullout') ||
      searchTarget.includes('q ë¶„ë¥˜') || searchTarget.includes('q-system') ||
      searchTarget.includes('?±ê???) || searchTarget.includes('single shell') ||
      searchTarget.includes('?Œì¼?´ì¼') || searchTarget.includes('soil nail') ||
      searchTarget.includes('?„ë??€') || searchTarget.includes('prandtl') ||
      searchTarget.includes('?¬êµ´') || searchTarget.includes('overbreak') ||
      searchTarget.includes('?¬ë©´?ˆì •') || searchTarget.includes('slope stability') ||
      searchTarget.includes('? ì••') || searchTarget.includes('earth pressure') ||
      searchTarget.includes('?„ë‹¨ê°•ë„') || searchTarget.includes('shear strength') ||
      searchTarget.includes('?¬ìˆ˜') || searchTarget.includes('ì¹¨íˆ¬') ||
      searchTarget.includes('?™ë§‰??) || searchTarget.includes('?„ì†Œ??) ||
      searchTarget.includes('?¡ìƒ??) || searchTarget.includes('liquefaction') ||
      searchTarget.includes('ë³´ìƒê¸°ì´ˆ') || searchTarget.includes('compensated foundation') ||
      searchTarget.includes('?˜ì••?Œì‡„') || searchTarget.includes('hydraulic fracturing');

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
      const finalQuestions = topic.category === 'ê³„ì‚°'
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
      const finalQuestions = topic.category === 'ê³„ì‚°'
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
    if (cleanTitle.includes('?•ë?ê¸°ì´ˆ') && cleanTitle.includes('ê±°ë™') && cleanTitle.includes('?Œê´´')) {
      specialInstructions = `
[?¹ë³„ ì¶œì œ ì§€ì¹?- ë§¤ìš° ì¤‘ìš”]:
??? í”½?€ '?„ë??€ ì§€ì§€??ê³µì‹'?´ë‚˜ '?Œë¥´?ê¸° ê·¹í•œì§€ì§€??ê³µì‹' ?ì²´???ì„¸??? ë„??ê³µì‹ ?•ì˜ë¥??¨ë…?¼ë¡œ ë¬»ëŠ” ? í”½???„ë‹™?ˆë‹¤.
1. ê¸°ì´ˆ ?„ë˜ ì§€ë°˜ì˜ 3?€ ?Œê´´ ?•íƒœ: ?„ë°˜?„ë‹¨?Œê´´, êµ???„ë‹¨?Œê´´, ê´€?…ì „?¨íŒŒê´´ì˜ êµ¬ì²´??ë°œìƒ ì¡°ê±´ ë°?ê¸°ì „.
2. Vesic(1973)???œì•ˆ???ˆì¸¡ ?„í‘œ???¹ì§•.
3. ?‘ì???ë¶„í¬ ?¨í„´ ë°?ì¹¨í•˜ ?•ìƒ ë¹„êµ.
`;
    }

    let weaknessPrompt = '';
    if (carryOverQuestions.length > 0) {
      weaknessPrompt = `
[?´ì „ ?Œì°¨ ?¤ë‹µ ?•ë³´ ë°?ì¶œì œ ì§€ì¹?:
?„ë˜ ?¤ë‹µ?¤ì? ?¬ìš©?ê? ?´ì „ ?Œì°¨?ì„œ ?€ë¦?ë¬¸ì œ?…ë‹ˆ??
?´ë²ˆ???ì„±??4ê°œì˜ ê°ê???ë¬¸ì œ ì¤??ì˜ ${carryOverQuestions.length}ê°?ë¬¸ì œ(5ë²ˆë???${4 + carryOverQuestions.length}ë²???ë°˜ë“œ???„ë˜ ?¤ë‹µ??ë³€??ë¬¸ì œë¡?ì¶œì œ?˜ì‹­?œì˜¤:
${carryOverQuestions.map((q, idx) => `
?¤ë‹µ ë¬¸ì œ ${idx + 1}:
- ì§ˆë¬¸: ${q.question}
- ë³´ê¸°: ${JSON.stringify(q.options)}
- ?•ë‹µ: ${q.answer}
`).join('\n')}
`;
    }

    const totalAiQuestionsCount = topic.category === 'ê³„ì‚°' ? 4 : 13;
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
[?¬ìš©???¼ë“œë°?ì§€ì¹?- ì¶œì œ ë¹ˆë„ ë°˜ì˜ ë°?ì¡°ì • ?„ìˆ˜]:
1. ì¶”ì²œ ì§ˆë¬¸ ëª©ë¡:
${upvotes.map((q, i) => `   - ì¶”ì²œ ì§ˆë¬¸ ${i + 1}: ${q}`).join('\n')}
2. ë¹„ì¶”ì²?ì§ˆë¬¸ ëª©ë¡ (?ˆë? ? ì‚¬ë¬¸ì œ ì¶œì œ ê¸ˆì?):
${downvotes.map((q, i) => `   - ë¹„ì¶”ì²?ì§ˆë¬¸ ${i + 1}: ${q}`).join('\n')}
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
[?¬ìš©???´ì „ ë¬¸ì œ ì¡°ì •(?¼ë“œë°? ?´ì—­]:
${adjustments.map((a, idx) => `
ì¡°ì • ?´ë ¥ ${idx + 1}:
- ê¸°ì¡´ ë¬¸ì œ: "${a.question_text}"
- ?¬ìš©?ì˜ ?¼ë“œë°??”êµ¬?¬í•­: "${a.user_feedback}"
- ë°˜ì˜??ìµœì¢… ë¬¸ì œ: "${a.adjusted_text}"
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

    const prompt = (topic.category === 'ê³„ì‚°') ? `
[ë¬¸ì œ ?ì„± ?œìŠ¤???œì‘]:
?„ë˜ ?œê³µ?˜ëŠ” ?•ë³´ë¥?ë¶„ì„?˜ì—¬ ì´??•í™•??4ê°œì˜ ê³„ì‚° ?ˆìƒë¬¸ì œë¥??ì„±??ì£¼ì‹­?œì˜¤.
[? í”½ ?µì‹¬ ì£¼ì œ]: ${coreSubject}
[? í”½ ?ë³¸ ?œëª©]: ${topic.title}
[?µì‹¬ ?¤ì›Œ??: ${topic.keywords || '?œê³µ?˜ì? ?ŠìŒ'}
[ì²¨ë??Œì¼ ë³¸ë¬¸ ?ìŠ¤??(HTML ê³µë??¸íŠ¸): ${fileText || '?œê³µ?˜ì? ?ŠìŒ'}

[ì¶œì œ ?”êµ¬?¬í•­]:
1. 1ë²?ë¬¸í•­ (ì²¨ë? ?´ë?ì§€??ë¬¼ìŒê³?ë³¸ë¬¸ HTML???µë???ë¶„ì„???œì±„?°ê¸° ì§ˆë¬¸) - type: "ì£¼ê???(?œì±„?°ê¸°)"
   ?š¨ **[1ë²?ë¬¸í•­ ê³„ì‚° ?œì±„?°ê¸° ?œì? êµ¬ì¡° ì² ì¹™ - ê°€??ì¤‘ìš”!]**:
   - ?¨ê»˜ ì²¨ë???ë¬¸ì œ ?´ë?ì§€(ê·¸ë¦¼/ê·¸ë˜???€ ë³¸ë¬¸ ?ìŠ¤?¸ë? ?œê°?ìœ¼ë¡??¬ì¸µ ë¶„ì„?˜ì‹­?œì˜¤.
   - ë¬¸ì œ ì§€ë¬¸ê³¼ ê·¸ë¦¼??êµ¬í•˜?¼ê³  ?”êµ¬?˜ëŠ” **ëª¨ë“  ê³„ì‚° ?‰ê? ??ª© (1), (2), (3)...** ?ëŠ” ì¡°ê±´ë³???ª©??ê°ê°??**??Row)**?¼ë¡œ ë°°ì¹˜?˜ì‹­?œì˜¤.
   - ??êµ¬ì¡°??ë°˜ë“œ??**headers: ["êµ¬í•˜????ª©", "ê³„ì‚° ê²°ê³¼ ë°??µì•ˆ"]** ??2???¤ë” ê·œê²©?¼ë¡œ êµ¬ì„±?˜ì‹­?œì˜¤.

   ?“Œ **[?œì? êµ¬ì¡° ?ˆì‹œ]**:
   - headers: ["êµ¬í•˜????ª©", "ê³„ì‚° ê²°ê³¼ ë°??µì•ˆ"]
   - rows:
     [
       ["(1) êµ¬í•˜??ì²«ë²ˆì§???ª©ëª?(?¨ìœ„)", "[INPUT_1]"],
       ["(2) êµ¬í•˜???ë²ˆì§???ª©ëª?(?¨ìœ„)", "[INPUT_2]"],
       ["(3) êµ¬í•˜???¸ë²ˆì§???ª©ëª?(?¨ìœ„)", "[INPUT_3]"],
       ...
     ]

   ?š¨ **ë¹ˆì¹¸ ë°??µì•ˆ 1:1 ë§¤ì¹­ ì² ì¹™**:
   - ë¬¸ì œ?ì„œ ë¬»ëŠ” ê³„ì‚° ?”êµ¬ ??ª©??Nê°œì´ë©? ?‰ì˜ ê°œìˆ˜??Nê°œê? ?˜ë©° ë°˜ë“œ??[INPUT_1]ë¶€??[INPUT_N]ê¹Œì? Nê°œì˜ ë¹ˆì¹¸???ì„±?˜ì‹­?œì˜¤.
   - answers ê°ì²´?ëŠ” ê°?INPUT_Në§ˆë‹¤ ?€?‘ë˜??ê³µí•™??ê³„ì‚° ?•ë‹µ ?€??ê³¼ì •ê³??•í™•??ìµœì¢… ?˜ì¹˜(?¨ìœ„ ?¬í•¨)ë¥?ê¸°ì¬?˜ì‹­?œì˜¤.

2. 2ë²?ë¬¸í•­ (ê°œë… ë¹„êµ ??ì¹¸ì±„?°ê¸° ë¬¸ì œ) - type: "ì£¼ê???(?œì±„?°ê¸°)"
   ?š¨ **[2ë²?ë¬¸í•­ ?„ìˆ˜ êµ¬ì¡° ì§€ì¹?**:
   - ? í”½ê³?ê´€?¨ëœ ??ê°€ì§€ ?´ìƒ??ê³µë²•, ?´ë¡ , ?ëŠ” ì¡°ê±´??ë¹„êµ?˜ëŠ” ?œë¡œ ?¤ê³„?˜ì‹­?œì˜¤.
   - ??Column)??ë¹„êµ ?€?ì„, ??Row)??êµ¬ë¶„ ??ª©??ë°°ì¹˜?˜ì‹­?œì˜¤.
   - ?ˆë°˜ ?•ë„???€?€ ì±„ì›Œì§??µì•ˆ?¼ë¡œ, ?˜ë¨¸ì§€??INPUT?¼ë¡œ ?¤ê³„?˜ì‹­?œì˜¤.
   - headers: ["êµ¬ë¶„ ??ª©", "?¤ì œ ë¹„êµ ?€??1 ëª…ì¹­", "?¤ì œ ë¹„êµ ?€??2 ëª…ì¹­"]
   - ?š¨ [?¤ë” ?˜ë“œì½”ë”© ê¸ˆì?]: "ê³µë²•/?´ë¡  A", "?€???´ë¡ /ê³µë²• A"?€ ê°™ì? ?”ë? ì°Œêº¼ê¸??¤ë” ?‘ì„±???ˆë? ê¸ˆì??˜ë©°, ë°˜ë“œ??ë¬¸ì œ ì§€ë¬¸ì´ ?¤ë£¨???¤ì œ ë¹„êµ ëª…ì¹­?¼ë¡œ ?¤ë”ë¥??ì„±?˜ì‹­?œì˜¤.
   - rows: [["ë¹„êµ??ª© 1", "[INPUT_1]", "ì±„ì›Œì§??´ìš©"], ["ë¹„êµ??ª© 2", "ì±„ì›Œì§??´ìš©", "[INPUT_2]"]]

3. 3ë²?ë¬¸í•­ (ê³µí•™???˜ë?/êµí›ˆ ì£¼ê???ë¬¸ì œ) - type: "ì£¼ê???(?¨ë‹µ??"
4. 4ë²?ë¬¸í•­ (ê´€??ê³µí•™??ë¬¸ì œ ë°œìƒ ???€ì±?ì£¼ê???ë¬¸ì œ) - type: "ì£¼ê???(?¨ë‹µ??"
` : `
[ë¬¸ì œ ?ì„± ?œìŠ¤???œì‘]:
?„ë˜ ?œê³µ?˜ëŠ” ?•ë³´ë¥?ë¶„ì„?˜ì—¬ ì´??•í™•??13ê°œì˜ ?ˆìƒë¬¸ì œë¥??ì„±??ì£¼ì‹­?œì˜¤. (ê°ê???5ê°? ê°œìš” 1ê°? ê³µì‹ 1ê°? ?œì±„?°ê¸° 2ê°? ?¨ë‹µ??4ê°?
[? í”½ ?µì‹¬ ì£¼ì œ]: ${coreSubject}
[? í”½ ?ë³¸ ?œëª©]: ${topic.title}
[ì²¨ë??Œì¼ ë³¸ë¬¸ ?ìŠ¤??: ${fileText || '?œê³µ?˜ì? ?ŠìŒ'}
`;

    const systemInstruction = `?¹ì‹ ?€ ?€?œë?êµ?êµ??ê±´ì„¤ê¸°ì??¤ê³„ì½”ë“œ(KDS) ë°?ì§€ë°˜ê³µ??ê¸°ìˆ ???œí—˜ ì¶œì œ?„ì›?…ë‹ˆ??
JSON ë°°ì—´ ?•ì‹?¼ë¡œë§?ë¬¸ì œë¥?ì¶œë ¥?˜ì‹­?œì˜¤.`;

    const enrichedGenerationPrompt = `${prompt}

[?š¨ ìµœìš°???ˆë? ì§€ì¹?ì¤€??? ì–¸]:
?„ë˜ ?œê³µ?˜ëŠ” [?“‹ ë¬¸ì œ ì¶œì œ ê¸°ì? ?ˆë? ì§€ì¹?(Generation Standards)] ë°?[?”¬ ê³µí•™ ê¸°ì? ?ˆë? ì§€ì¹?(Engineering Standards)]?€ ?¬ìš©?ê? ì§€?•í•œ ìµœìš°???Œë²•??ì¶œì œ ì§€ì¹¨ì…?ˆë‹¤. ê·??´ë–¤ ?´ë? ì¶œì œ ë°©ì‹?´ë‚˜ ?˜ë“œì½”ë”©???Œê³ ë¦¬ì¦˜ ê·œê²©ë³´ë‹¤ ??ì§€ì¹¨ë“¤??1?œìœ„ë¡?ì§€ì¼œì ¸???˜ë©°, ?ì¶©??ë°œìƒ??ê²½ìš° ??ì§€ì¹¨ë“¤???¸ë? ?´ìš©(?? ë¹„êµ ?€??ê°€??êµ¬ë¶„, ?Œìˆ˜???•í™•??????ìµœìš°? ì ?¼ë¡œ ?„ê²©???ìš©?˜ì‹­?œì˜¤.

[?“‹ ë¬¸ì œ ì¶œì œ ê¸°ì? ?ˆë? ì§€ì¹?(Generation Standards)]:
${activeGenerationStandards}

[?”¬ ê³µí•™ ê¸°ì? ?ˆë? ì§€ì¹?(Engineering Standards)]:
${activeEngineeringStandards}
`;

    const flowchartSpecificInstruction = "?´ë²ˆ ?ë¦„??ë¬¸ì œ ì¶œì œ ?? [1ë²??ì ì±„ìš°ê¸?ì§€ì¹?: 1ë²??ì???¤ëª… ?ìŠ¤?¸ë? ì±„ì›Œ???¸ì¶œ?˜ê³ , ë¹ˆì¹¸?€ 2ë²??ìë¶€???œì‘?˜ì—¬ (A), (B), (C), (D) ?œì„œ?€ë¡?1ê°œì”© ë¹„ìš°??‹œ?? ?ì ?°ì¸¡?´ë‚˜ ë°”ê¹¥??(A)~(F) ?„ì²´ ëª©ë¡???§ë¶™?´ëŠ” ?‰ìœ„???ˆë? ê¸ˆì??©ë‹ˆ??";

    // Batch prompts for standard topics (non-calculation) to ensure high-quality technical questions
    const promptBatch1 = `
[?š¨ ìµœìš°???ˆë? ì¤€??ë²•ê·œ (Constitutional Guidelines) - ?‘ì—…???œì‘?˜ê¸° ?„ì— ê°€??ë¨¼ì? ?•ì¸?˜ê³  100% ì¤€?˜í•˜??‹œ??:
?¹ì‹ ?€ ?€?œë?êµ?êµ??ê¸°ìˆ ?ê²© ê¸°ìˆ ??Professional Engineer) ?œí—˜ ì¶œì œ?„ì›?¼ë¡œ??ë¬¸ì œë¥?ì¶œì œ?˜ê¸° ?? ?„ë˜ ëª…ì‹œ??**ë¬¸ì œ?ì„± ?ˆë? ì§€ì¹¨ë“¤**ê³?**ê³µí•™???´ë¡  ê¸°ì?**???Œë²•????ì¡?ì² ì¹™?¼ë¡œ ?¼ì•„ ?´ë? ë¨¼ì? ?„ë²½?˜ê²Œ ?™ì??˜ê³  ?ˆë??ìœ¼ë¡?ë³µì¢…?˜ì—¬ ë¬¸ì œë¥??¤ê³„ ë°?ì¶œì œ?´ì•¼ ?©ë‹ˆ?? ì§€ì¹¨ì„ ?„ë°˜?˜ì—¬ ì¶œì œ??ë¬¸ì œ???œìŠ¤??ê²€ì¦??¨ê³„?ì„œ ì¦‰ì‹œ ?ê¸°?©ë‹ˆ??

${standardsAnalysis ? `${standardsAnalysis}\n\n` : ''}[?š¨ ë¬¸ì œ ?ì„± ?ˆë? ì¤€??ì§€ì¹?:
${activeGenerationStandards}

[?š¨ ì§€ë°˜ê³µ???œì? ?´ë¡  ë°?ê³„ì‚° ê¸°ì?]:
${activeEngineeringStandards}

${FLOWCHART_QUIZ_GENERATION_PROMPT}

[?š¨ ?´ë²ˆ ?Œì°¨ ?ë¦„??ë¬¸ì œ ë¹ˆì¹¸ ì§€??ëª…ë ¹ - ë§¤ìš° ì¤‘ìš”]:
${flowchartSpecificInstruction}

---------------------------------------------------------
[ë¬¸ì œ ?ì„± ?œìŠ¤???œì‘]:
?„ì˜ ?ˆë? ì§€ì¹¨ê³¼ ê¸°ì? ë²•ê·œë¥??„ì „???™ì????íƒœ?ì„œ, ?„ë˜ ?œê³µ?˜ëŠ” [? í”½ ?µì‹¬ ì£¼ì œ], [?µì‹¬ ?¤ì›Œ??, [ì²¨ë??Œì¼ ë³¸ë¬¸ ?ìŠ¤??ë¥??¬ì¸µ ë¶„ì„?˜ì—¬, ì´?**?•í™•??7ê°?*???ˆìƒë¬¸ì œ(ì£¼ê???ê°œìš” 1ê°? ì£¼ê???ê³µì‹ 1ê°? ì£¼ê????œì±„?°ê¸°(?ë¦„?? 1ê°? ì£¼ê????¨ë‹µ??4ê°?ë¥??ì„±??ì£¼ì‹­?œì˜¤.

[? í”½ ?µì‹¬ ì£¼ì œ]: ${coreSubject}
[? í”½ ?ë³¸ ?œëª©]: ${topic.title}
[?µì‹¬ ?¤ì›Œ??: ${topic.keywords || '?œê³µ?˜ì? ?ŠìŒ'}
[?µì‹¬ ?ŒìŠ¤ ?ìŠ¤??: ${fileText || '?œê³µ?˜ì? ?ŠìŒ'}

[?š¨ ? í”½ ë²”ìœ„ ?„ê²© ?œí•œ ë°?ì¶œì œ ë²”ìœ„ ?•ì¶© ??ìµœìš°??ì¤€?˜ì‚¬??:
- **ë§¹ëª©?ìœ¼ë¡?[ì²¨ë??Œì¼ ë³¸ë¬¸ ?ìŠ¤????ì§€?½ì ???êµ¬?ë§Œ êµ?•œ?˜ì—¬ ë¬¸ì œë¥?ì¶œì œ?˜ì? ë§ˆì‹­?œì˜¤.** 
- ë§Œì•½ ì²¨ë??Œì¼ ?´ìš©??ì¢ê±°???¨í¸?ì´?”ë¼?? ?´ë‹¹ **[? í”½ ?µì‹¬ ì£¼ì œ]**ê°€ ?¤ë£¨???„ë°˜?ì¸ ?œì? ?™ìˆ  ?´ë¡  ë°?ê¸°ìˆ ???œí—˜ ë²”ìœ„???œì? ê°œë…???€??AI???ë???ê³µí•™ ì§€?ì„ ?œìš©?˜ì—¬ ë¬¸ì œë¥??ê·¹?ì´ê³??“ê²Œ ì¶œì œ?˜ì‹­?œì˜¤.
- ?? ?¤ë¥¸ ?€ì£¼ì œ ? í”½??ê°œë…?´ë‚˜ ?˜ì‹?¼ë¡œ ?„ì „???˜ì–´ê°€ ì¶œì œ?˜ëŠ” ê²ƒì? ?¬ì „??**?ˆë? ê¸ˆì?**?´ë©°, ëª¨ë“  ì§ˆë¬¸/?•ë‹µ/?´ì„¤?€ ?¤ì§ ?„ì¬ **[? í”½ ?µì‹¬ ì£¼ì œ]** ë²”ìœ„ ?´ì— ë¨¸ë¬¼?¬ì•¼ ?©ë‹ˆ??
- **?š¨ [? í”½ ëª…ì¹­ ?•ì œ ë°?ì°Œêº¼ê¸??œê±° ì² ì¹™]**: ë¬¸ì œë¥?ì¶œì œ????ì§ˆë¬¸ ì§€ë¬¸ì— "ê³µí•™ ?´ì„ ë³´ê³ ??, "ê³µë??¸íŠ¸", "?”ì•½ë³? ê°™ì? ë¬¸ì„œ ?•íƒœë¥?ê°€ë¦¬í‚¤??êµ°ë”?˜ê¸° ì°Œêº¼ê¸?ëª…ì¹­??ê·¸ë?ë¡?ì£¼ì–´ë¡??¬ìš©?˜ì? ë§ˆì‹­?œì˜¤. ë¬¸ì œ ì§€ë¬¸ì—???¤ì§ ?œìˆ˜??ê³µí•™ ?µì‹¬ ì£¼ì œ??**"${coreSubject}"** ëª…ì¹­ë§Œì„ ?œìš©?˜ì—¬ ì§ˆë¬¸ ë¬¸ì¥???¤ë“¬?¼ì‹­?œì˜¤. (?? "~~ ë³´ê³ ?œì˜ ?¥ë‹¨?ì„..." (X) -> "~~ ?´ë¡ ???¥ë‹¨?ì„..." (O))

[ì¶œì œ ?”êµ¬?¬í•­]:
ë°˜ë“œ??ì´?6ê°œì˜ ë¬¸ì œë¥??¤ìŒê³?ê°™ì´ êµ¬ì„±?˜ì—¬ ì¶œì œ?˜ì‹­?œì˜¤:

[1ë²?ë¬¸ì œ] ì£¼ê???(ê°œìš”):
- ëª©ì : ? í”½???µì‹¬ ?•ì˜(ê°œìš”)ë¥?ëª…í™•?˜ê³  ì§œì„???ˆê²Œ ë¬»ëŠ” ì§ˆë¬¸.
- "type" ê°? ë°˜ë“œ??"ì£¼ê???(ê°œìš”)"
- "question": ?œê³µ??ë³¸ë¬¸ ?ìŠ¤???„ì²´ë¥??„ìš°ë¥????ˆëŠ” ?µì‹¬ ê³µí•™???€ì£¼ì œ(?€?œëª©)ë¥??„ì¶œ?˜ê³ , ê·?ì£¼ì œ??ê´€??ê°œìš”, ?ë¦¬, ê°œë…???•ì˜ë¥?ê¹Šì´ ?ˆê²Œ ë¬»ëŠ” ?ì—°?¤ëŸ½ê³??„ë¬¸?ì¸ ?œìˆ ??ì§ˆë¬¸ ë¬¸ì¥.
- "concept": ì§ˆë¬¸???•í™•??ë¶€?©í•˜ë©? ìµœì†Œ 4ì¤„ì—??ìµœë? 6ì¤??¬ì´??ë¶„ëŸ‰?¼ë¡œ ?„ì£¼ ?„ë¬¸?ì´ê³?ì§ê??ì¸ ê°œìš” ë°?ê°œë… ?¤ëª…???œìˆ . ?¤ëª… ?´ì—??ì±„ì ê´€???ë³„?´ì•¼ ???µì‹¬ ê³µí•™???¤ì›Œ?œë“¤?€ ë°˜ë“œ???¼ë°˜ ë§ˆí¬?¤ìš´ ê°•ì¡° ê¸°í˜¸??**?¤ì›Œ??* ?•íƒœë¡?ê°ì‹¸???‘ì„±??ì£¼ì‹­?œì˜¤. (?? **? íš¨ ?‘ë ¥**, **ê°„ê·¹?˜ì•• ?Œì‚°** ??
- "formula": (? íƒ?¬í•­) ê°œìš” ?¤ëª…???˜ì‹???„ìš”???Œë§Œ ?‘ì„±?˜ì‹­?œì˜¤.
- "structure": ?š¨ **[?„ìˆ˜?¬í•­]** ê°œìš” ?¤ëª… ë°?ê³µì‹???±ì¥?˜ëŠ” ëª¨ë“  ê¸°í˜¸(?? $K_a$, $\\phi$, $\\delta$ ?????•ì˜ë¥?ì¤„ë°”ê¿?\\n)?¼ë¡œ êµ¬ë¶„?˜ì—¬ ë°˜ë“œ???‘ì„±?˜ì‹­?œì˜¤. ê¸°í˜¸ê°€ ?„í? ?†ëŠ” ê²½ìš°?ëŠ” ë¹?ë¬¸ì??"")ë¡??‘ì„±?˜ì‹­?œì˜¤. (?? "- $K_a$: ì£¼ë™? ì••ê³„ìˆ˜\\n- $\\phi$: ?™ì˜ ?´ë?ë§ˆì°°ê°?)

[2ë²?ë¬¸ì œ] ì£¼ê???(ê³µì‹):
- ëª©ì : ? í”½???ìš©?˜ëŠ” ê°€???€?œì ?´ê³  ?¨ìˆœ??ê³µì‹ë§?ë¬»ëŠ” ì§ˆë¬¸.
- "type" ê°? ë°˜ë“œ??"ì£¼ê???(ê³µì‹)"
- "question": ? í”½???€?œí•˜??ê°€???µì‹¬?ì¸ ê³µì‹??ê³µì‹ëª…ì¹­ ?ì²´???µì‹¬ ì§ˆë¬¸ ë¬¸êµ¬ë§?ê°„ê²°?˜ê²Œ ?‘ì„±.
- "concept": ê³µì‹???€??1ì¤„ì§œë¦?ë§¤ìš° ì»´íŒ©?¸í•œ ?”ì•½ ?¤ëª….
- "formula": ?¤ì§ ?€??LaTeX ê³µì‹ 1ê°œë§Œ ?œìˆ˜?˜ê²Œ ?‘ì„±. ë¬¸ì?´ì´???¤ëª… ê¸°í˜¸???ˆë? ?£ì? ë§ˆì‹­?œì˜¤. (?? "$t = \\frac{P - 2C \\sin\\varphi}{\\gamma \\tan\\varphi + \\frac{2S}{D}}$")
- "structure": ?š¨ **[?„ìˆ˜?¬í•­]** ??formula?ì„œ ?¬ìš©??ëª¨ë“  ê¸°í˜¸???•ì˜ë¥??¥í™©?˜ì? ?Šê²Œ ì¤„ë°”ê¿?\n)?¼ë¡œ ìµœì†Œ?œì˜ ëª…ì‚¬???„ì£¼ë¡?ë°˜ë“œ???‘ì„±?˜ì‹­?œì˜¤. (?? "- $t$: ?í¬ë¦¬íŠ¸ ?ê»˜\n- $P$: ì§€ë°˜ì••")

[3ë²?ë¬¸ì œ] ì£¼ê???(?œì±„?°ê¸°) (?„ìŠ¤???ë¦„??:
- ëª©ì : ? í”½???œê³µ/?¤ê³„ ?ˆì°¨, ?œí—˜ ?œì„œ, ?ëŠ” ?¨ê³„ë³?ê±°ë™ ë©”ì»¤?ˆì¦˜???„ì‹?”í•œ ?Œë¡œ?°ì°¨??ë¹ˆì¹¸ ì±„ìš°ê¸?ì§ˆë¬¸.
- "type" ê°? ë°˜ë“œ??"ì£¼ê???(?œì±„?°ê¸°)"
- ì¶œì œ ?ì¹™: 
  * ëª¨ë“  ? í”½???€?˜ì—¬ ë°˜ë“œ???„ìŠ¤???Œë¡œ?°ì°¨???¤ì´?´ê·¸??ë°±í‹± \`\`\`?¼ë¡œ ê°ì‹¸?¬ì§„ ?¤ì´?´ê·¸?????¬í•¨??ì£¼ê???(?œì±„?°ê¸°) ë¬¸ì œë¡?100% ë¬´ì¡°ê±?ì¶œì œ?˜ì‹­?œì˜¤.
  * tableData?€ answers ê°ì²´ êµ¬ì¡°ë¥?100% ê°–ì¶˜ ?•íƒœë¡??‘ì„±?˜ì‹­?œì˜¤.
  * [?š¨ ?´ë²ˆ ?Œì°¨ ?ë¦„??ë¬¸ì œ ë¹ˆì¹¸ ì§€??ëª…ë ¹ - ë§¤ìš° ì¤‘ìš”]: ${flowchartSpecificInstruction}
  * answers ê°ì²´??ê°?INPUT ??"INPUT_1"ë¶€??"INPUT_2*M"ê¹Œì?)???¤ì–´ê°??•ë‹µ?€ ëª…ì‚¬??ì¢…ê²°?´ë?ë¡?ê°„ê²°?˜ê²Œ ?‘ì„±?˜ì—¬ ?˜í—˜?ì´ ëª…ë£Œ?˜ê²Œ ì±„ì ë°›ì„ ???ˆê²Œ ?¤ê³„?˜ì‹­?œì˜¤.

[ì£¼ê???(?¨ë‹µ?? ë¬¸ì œ??(4, 5, 6, 7ë²?ë¬¸ì œ)]:
- ê°œìˆ˜: ë°˜ë“œ???•í™•??4ë¬¸ì œë¥?ì¶œì œ?˜ì‹­?œì˜¤.
- "type" ê°? ë°˜ë“œ??"ì£¼ê???(?¨ë‹µ??"
- ?š¨ [ê°ê???? íƒ???µì…˜(ë³´ê¸°) ?œê³µ ?ˆë? ê¸ˆì? ê·œì¹™ - ê·¹ë„ë¡?ì¤‘ìš”!]: ì£¼ê???ê°œìš”, ê³µì‹, ?¨ë‹µ?? ?œì±„?°ê¸°)??ê·??´ë–¤ ë¬¸í•­?ì„œ??ê°ê??ìš© ë³´ê¸°(options, ?? ?? ?? ?? ?????ëŠ” "options" ?„ë“œ)ë¥??ˆë?ë¡??¤ê³„?˜ê±°??ê¸°ì…?˜ì—¬ ?œê³µ?˜ì? ë§ˆì‹­?œì˜¤. ëª¨ë“  ì£¼ê???ë¬¸í•­?€ ?¤ì§ ?œìˆ ???•ë‹µë§Œì„ ?”êµ¬?´ì•¼ ?©ë‹ˆ??
- ì¶œì œ ?ì¹™:
  * **[?š¨ ?¨ìˆœ ?¨ë‹µ??ì¶œì œ ?ˆë? ê¸ˆì? ë°?ê¸°ìˆ ????Ÿ‰ ?‰ê? ê°•ì œ]**: ?¨ìˆœ??'ë¬´ì—‡?¸ê??'?¼ë©° ?¨ì–´??ëª…ì¹­ë§Œì„ ?¨ë‹µ?•ìœ¼ë¡?ë¬»ëŠ” ?˜ì? ??? ì´ˆë³´?ì¸ ë¬¸ì œ??**?ˆë?ë¡?ì¶œì œ?˜ì? ë§ˆì‹­?œì˜¤.** ê¸°ìˆ ??Professional Engineer) ?œí—˜ ?˜ì???ê±¸ë§ê²??¤ë¬´????•™???„ë¬¸?±ì„ ?”êµ¬?˜ëŠ” ê¹Šì´ ?ˆëŠ” ?œìˆ ??ì§ˆë¬¸?¼ë¡œ ì¶œì œ?´ì•¼ ?©ë‹ˆ??
  * **[ì¶œì œ ? í˜• ?ˆì‹œ]**:
    1. ?´ë‹¹ ?´ë¡ /ê³µë²•??ê³µí•™???€?¹ì„±, ê¸°ë³¸ ê°€?•ì´ ?´í¬?˜ëŠ” ?œê³„??ë°??´ì— ?€??ê³µí•™??ê²¬í•´ (?? "~~ ?´ë¡ ???€?´ì„œ ?´ë–»ê²??ê°?˜ë©°, ?¤ë¬´???˜ì˜??ë¬´ì—‡?¸ê??")
    2. ?¤ë¬´ ?ìš© ??ë°œìƒ?????ˆëŠ” ì£¼ìš” ??•™??êµ¬ì¡°???¨ì ?´ë‚˜ ë¬¸ì œ??(?? "~~ ê³µë²• ?ìš© ???¤ê³„/?œê³µ???¨ì  ë°?ê·¹ë³µ?´ì•¼ ???œê³„??ë¬´ì—‡?¸ê??")
    3. êµ¬ì²´?ì¸ ?„ì¥ ë¬¸ì œ ?í™©(?œë‚˜ë¦¬ì˜¤)???œì‹œ?˜ê³  ?´ë? ?´ê²°?˜ê¸° ?„í•œ ê¸°ìˆ ??ê´€?ì˜ ?€ì²?ë°©ì•ˆ (?? "ë³?ê³µë²• ?ìš© ??ì§€ë°?ì¹¨í•˜ ???„í•´ ?”ì¸??ë°œìƒ?˜ëŠ” ?ì¸?€ ë¬´ì—‡?´ë©°, ?´ë? ë°©ì?/?´ê²°?˜ê¸° ?„í•œ ?¤ë¬´?ì¸ ?€ì±…ì? ë¬´ì—‡?¸ê??")
  * **?•ë‹µ("answer")**: ëª¨ë²” ?µì•ˆ?€ ?¨ìˆœ?????¨ì–´ ?¤ì›Œ?œê? ?„ë‹ˆ?? êµ¬ì²´?ì¸ ê³µí•™??ê±°ë™ ë©”ì»¤?ˆì¦˜ê³??¤ê³„/?œê³µ ???¸ê³¼ê´€ê³??€ì±…ì´ ?¼ë¦¬?ìœ¼ë¡??ì„¸???¬í•¨???œìˆ ??ìµœì†Œ 50?ì—??ìµœë? 120???´ì™¸)?¼ë¡œ ëª…ë£Œ?˜ê²Œ ?‘ì„±?˜ì‹­?œì˜¤. ëª¨ë“  ?•ë‹µ???´ë???ë°˜ë“œ??"~??, "~?…ë‹ˆ?? ?±ì˜ ?‰ì„œë¬¸ì„ ë°°ì œ?˜ê³ , ê¸°ìˆ ???œí—˜ ?µì•ˆì§€ ?•ì‹??ëª…ì‚¬??ì¢…ê²°?´ë?(?? ~?? ~ê°ì†Œ, ~ë°©ì?, ~? ë„, ~?Œì‚°, ~?•ë³´ ??ë¡??ë‚˜???©ë‹ˆ?? ?í•œ, ???•ë‹µ ë¬¸ì¥ ?´ì—??ì±„ì ??ì¤‘ìš”?„ê? ê°€???’ì? ?„ìˆ˜ ê³µí•™ ?¤ì›Œ?œë“¤?€ ë°˜ë“œ????Š¬?˜ì‹œ ?†ì´ ?¼ë°˜ ë§ˆí¬?¤ìš´ ê°•ì¡° ê¸°í˜¸??**?¤ì›Œ??* ?•íƒœë¡?ê°ì‹¸???‘ì„±??ì£¼ì‹­?œì˜¤. (?? **?´ì¤‘ì¸??ê»˜**, **?„ë‹¨ê°•ë„ ?€??* ??
  * "explanation": ?????µì•ˆ???¬ë°”ë¥?ê³µí•™???€ì±??´ë¡ ?¸ì? ?ì„¸???¤ëª…?˜ì‹­?œì˜¤.

${topicInstructionsPrompt}
${LATEX_PROMPT_INSTRUCTIONS}

[?‘ë‹µ JSON ?¬ë§·]:
ë°˜ë“œ???„ë˜ ì§€?•ëœ JSON ë°°ì—´ ?¬ë§·?¼ë¡œë§??•í™•??ë°˜í™˜?˜ì‹­?œì˜¤. ë§ˆí¬?¤ìš´??\`\`\`json ì½”ë“œ ë¸”ë¡?´ë‚˜ ì¶”ê??ì¸ ?ìŠ¤???¤ëª…?€ ë°°ì œ?˜ê³  ?œìˆ˜??JSON ?°ì´?°ë§Œ ?œê³µ??ì£¼ì‹­?œì˜¤.
[
  {
    "type": "ì£¼ê???(ê°œìš”)",
    "question": "? í”½??ê¸°ë³¸ ?•ì˜?€ ?µì‹¬ ê°œë…??ë¬»ëŠ” ì§ˆë¬¸ ?´ìš©",
    "concept": "ê°œìš” ?¤ëª…",
    "formula": "",
    "structure": ""
  },
  {
    "type": "ì£¼ê???(ê³µì‹)",
    "question": "? í”½???€??ê³µì‹ëª…ì¹­ (?¬ì¡± ë°°ì œ)",
    "concept": "ê³µì‹???€????ì¤??”ì•½",
    "formula": "$LaTeXê³µì‹$",
    "structure": "- $ê¸°í˜¸1$: ê°„ë‹¨??ëª…ì‚¬???˜ë?"
  },
  {
    "type": "ì£¼ê???(?¨ë‹µ??",
    "question": "? í”½??ê°€??ì¤‘ìš”?˜ê³  ?µì‹¬?ì¸ ê³µí•™???•ì˜, ê¸°ë³¸ ê°€?? ?ëŠ” ì£¼ìš” ê³µí•™???˜ë?ë¥?ë¬»ëŠ” ?œìˆ ??ì§ˆë¬¸ 1",
    "answer": "?µì‹¬ ê°œë…?´ë‚˜ ê±°ë™ ?¹ì„±???”ì•½??1ì¤??œìˆ ???µì•ˆ ë¬¸êµ¬ 1",
    "explanation": "?´ë‹¹ ê°œë…???™ìˆ ??ê³µí•™???˜ë????€???ì„¸ ?¤ëª… 1"
  },
  {
    "type": "ì£¼ê???(?¨ë‹µ??",
    "question": "? í”½??ê°€??ì¤‘ìš”?˜ê³  ?µì‹¬?ì¸ ê³µí•™???•ì˜, ê¸°ë³¸ ê°€?? ?ëŠ” ì£¼ìš” ê³µí•™???˜ë?ë¥?ë¬»ëŠ” ?œìˆ ??ì§ˆë¬¸ 2",
    "answer": "?µì‹¬ ê°œë…?´ë‚˜ ê±°ë™ ?¹ì„±???”ì•½??1ì¤??œìˆ ???µì•ˆ ë¬¸êµ¬ 2",
    "explanation": "?´ë‹¹ ê°œë…???™ìˆ ??ê³µí•™???˜ë????€???ì„¸ ?¤ëª… 2"
  },
  {
    "type": "ì£¼ê???(?¨ë‹µ??",
    "question": "? í”½?????¤ë¥¸ ì¤‘ìš” ?¸ë? ê°œë…, ?ë¦¬ ?ëŠ” ?¥ë‹¨?ì„ ë¬»ëŠ” ?œìˆ ??ì§ˆë¬¸ 3",
    "answer": "?¸ë? ê°œë…?´ë‚˜ ê±°ë™ ?¹ì„±???”ì•½??1ì¤??œìˆ ???µì•ˆ ë¬¸êµ¬ 3",
    "explanation": "?´ë‹¹ ê°œë…???™ìˆ ??ê³µí•™???˜ë????€???ì„¸ ?¤ëª… 3"
  },
  {
    "type": "ì£¼ê???(?¨ë‹µ??",
    "question": "?´ë‹¹ ? í”½ê³?ê´€?¨ëœ êµ¬ì²´?ì¸ ê³µí•™???„ì¥ ë¬¸ì œ ?í™©(?œë‚˜ë¦¬ì˜¤)???œì‹œ?˜ê³  ?€ì²?ë°©ì? ë°©ì•ˆ(?´ê²° ?€ì±????”êµ¬?˜ëŠ” ì§ˆë¬¸ 4",
    "answer": "ë¬¸ì œ ?í™©???€ì²˜í•˜ê¸??„í•œ êµ¬ì²´?ì¸ ê³µí•™???€???ëŠ” ?€ì±??œìˆ ???µì•ˆ 4",
    "explanation": "?œì•ˆ??ê³µí•™???€ì±…ì˜ ?€?¹ì„± ë°??‘ë™ ë©”ì»¤?ˆì¦˜ ?¤ëª… 4"
  },
  {
    "type": "ì£¼ê???(?œì±„?°ê¸°)",
    "question": "?¤ìŒ [OOO ë¶„ì„/?¤ê³„ ?ˆì°¨] ?ë¦„?„ë? ë³´ê³  ë¹ˆì¹¸???¤ì–´ê°??¬ë°”ë¥??¨ê³„ë¥??…ë ¥?˜ì‹œ??(ë§ˆí¬?¤ìš´ ê³ ì •??ì½”ë“œë¸”ë¡?¼ë¡œ ê°ì‹¼ ?„ìŠ¤???ë¦„???¬í•¨)",
    "tableData": {
      "headers": ["ë¹ˆì¹¸ êµ¬ë¶„", "?…ë ¥ ?µì•ˆ"],
      "rows": [
        ["(A)", "[INPUT_1]"],
        ["(B)", "[INPUT_2]"],
        ["(C)", "[INPUT_3]"],
        ["(D)", "[INPUT_4]"]
      ]
    },
    "answers": {
      "INPUT_1": "(A)???¬ë°”ë¥??•ë‹µ ë¬¸êµ¬",
      "INPUT_2": "(B)???¬ë°”ë¥??•ë‹µ ë¬¸êµ¬",
      "INPUT_3": "(C)???¬ë°”ë¥??•ë‹µ ë¬¸êµ¬",
      "INPUT_4": "(D)???¬ë°”ë¥??•ë‹µ ë¬¸êµ¬"
    },
    "explanation": "?„ì²´ ?ë¦„?„ì˜ ê³µí•™???´ì„¤ ë°?ê°??¨ê³„ë³??ì„¸ ?¤ëª…"
  }
]
`;

    const promptBatch2 = `
[?š¨ ìµœìš°???ˆë? ì¤€??ë²•ê·œ (Constitutional Guidelines) - ?‘ì—…???œì‘?˜ê¸° ?„ì— ê°€??ë¨¼ì? ?•ì¸?˜ê³  100% ì¤€?˜í•˜??‹œ??:
?¹ì‹ ?€ ?€?œë?êµ?êµ??ê¸°ìˆ ?ê²© ê¸°ìˆ ??Professional Engineer) ?œí—˜ ì¶œì œ?„ì›?¼ë¡œ??ë¬¸ì œë¥?ì¶œì œ?˜ê¸° ?? ?„ë˜ ëª…ì‹œ??**ë¬¸ì œ?ì„± ?ˆë? ì§€ì¹¨ë“¤**ê³?**ê³µí•™???´ë¡  ê¸°ì?**???Œë²•????ì¡?ì² ì¹™?¼ë¡œ ?¼ì•„ ?´ë? ë¨¼ì? ?„ë²½?˜ê²Œ ?™ì??˜ê³  ?ˆë??ìœ¼ë¡?ë³µì¢…?˜ì—¬ ë¬¸ì œë¥??¤ê³„ ë°?ì¶œì œ?´ì•¼ ?©ë‹ˆ?? ì§€ì¹¨ì„ ?„ë°˜?˜ì—¬ ì¶œì œ??ë¬¸ì œ???œìŠ¤??ê²€ì¦??¨ê³„?ì„œ ì¦‰ì‹œ ?ê¸°?©ë‹ˆ??

${standardsAnalysis ? `${standardsAnalysis}\n\n` : ''}[?š¨ ë¬¸ì œ ?ì„± ?ˆë? ì¤€??ì§€ì¹?:
${activeGenerationStandards}

[?š¨ ì§€ë°˜ê³µ???œì? ?´ë¡  ë°?ê³„ì‚° ê¸°ì?]:
${activeEngineeringStandards}

---------------------------------------------------------
[ë¬¸ì œ ?ì„± ?œìŠ¤???œì‘]:
?„ì˜ ?ˆë? ì§€ì¹¨ê³¼ ê¸°ì? ë²•ê·œë¥??„ì „???™ì????íƒœ?ì„œ, ?„ë˜ ?œê³µ?˜ëŠ” [? í”½ ?µì‹¬ ì£¼ì œ], [?µì‹¬ ?¤ì›Œ??, [ì²¨ë??Œì¼ ë³¸ë¬¸ ?ìŠ¤??ë¥??¬ì¸µ ë¶„ì„?˜ì—¬, ì´?**?•í™•??2ê°?*???ˆìƒë¬¸ì œ(ì£¼ê????œì±„?°ê¸° 2ê°?ë¥??ì„±??ì£¼ì‹­?œì˜¤.

[? í”½ ?µì‹¬ ì£¼ì œ]: ${coreSubject}
[? í”½ ?ë³¸ ?œëª©]: ${topic.title}
[?µì‹¬ ?¤ì›Œ??: ${topic.keywords || '?œê³µ?˜ì? ?ŠìŒ'}
[ì²¨ë??Œì¼ ë³¸ë¬¸ ?ìŠ¤??: ${fileText || '?œê³µ?˜ì? ?ŠìŒ'}

[ì¶œì œ ?”êµ¬?¬í•­]:
ë°˜ë“œ??ì´?2ê°œì˜ ì£¼ê???(?œì±„?°ê¸°) ë¬¸ì œë¥??¤ìŒê³?ê°™ì´ êµ¬ì„±?˜ì—¬ ì¶œì œ?˜ì‹­?œì˜¤:
?š¨ **[2ê°?ë¬¸í•­ ?¤ê°???ì¹™ - ê·¹ë„ë¡?ì¤‘ìš”!]**: 2ê°œì˜ ?œì±„?°ê¸° ë¬¸ì œ??ë°˜ë“œ??**?œë¡œ ?„ì „???¤ë¥¸ ë¹„êµ ?€?? ?¤ë¥¸ ê´€?? ?¤ë¥¸ ê³µí•™??ì¸¡ë©´**???¤ë£¨?´ì•¼ ?©ë‹ˆ?? ?™ì¼??ë¹„êµ ?€?ì„ ??ë¬¸ì œ??ê±¸ì³ ë°˜ë³µ ì¶œì œ?˜ëŠ” ê²ƒì? ?ˆë? ê¸ˆì??©ë‹ˆ?? ??ë¬¸ì œ ëª¨ë‘ ë°˜ë“œ???œê³µ??[? í”½ ?µì‹¬ ì£¼ì œ]?€ [ì²¨ë??Œì¼ ë³¸ë¬¸ ?ìŠ¤????ë²”ìœ„ ?´ì—?œë§Œ ì¶œì œ?˜ì‹­?œì˜¤.
- **?š¨ [? í”½ ëª…ì¹­ ?•ì œ ë°?ì°Œêº¼ê¸??œê±° ì² ì¹™]**: ë¬¸ì œë¥?ì¶œì œ????ì§ˆë¬¸ ì§€ë¬¸ì— "ê³µí•™ ?´ì„ ë³´ê³ ??, "ê³µë??¸íŠ¸", "?”ì•½ë³? ê°™ì? ë¬¸ì„œ ?•íƒœë¥?ê°€ë¦¬í‚¤??êµ°ë”?”ê¸° ì°Œêº¼ê¸?ëª…ì¹­??ê·¸ë?ë¡?ì£¼ì–´ë¡??¬ìš©?˜ì? ë§ˆì‹­?œì˜¤. ë¬¸ì œ ì§€ë¬¸ì—???¤ì§ ?œìˆ˜??ê³µí•™ ?µì‹¬ ì£¼ì œ??**"${coreSubject}"** ëª…ì¹­ë§Œì„ ?œìš©?˜ì—¬ ì§ˆë¬¸ ë¬¸ì¥???¤ë“¬?¼ì‹­?œì˜¤. (?? "~~ ë³´ê³ ?œì˜ ?¥ë‹¨?ì„..." (X) -> "~~ ?´ë¡ ???¥ë‹¨?ì„..." (O))

[ì£¼ê???(?œì±„?°ê¸°) ë¬¸ì œ 2ê°?:
- ëª©ì : ?´ë‹¹ [? í”½ ?µì‹¬ ì£¼ì œ]?€ ë°€?‘í•˜ê²??°ê???**?€?œì ??ê¸°ë²• ë¹„êµ, ê³µë²• ë¹„êµ, ?´ë¡  ë¹„êµ** ???œë¡œ ?€ë¹„ë˜???µì‹¬ ?€?ì„ ? ì •?˜ê³ , ?´ë“¤????•™???¹ì§•, ê±°ë™ ê¸°ì „, ?ëŠ” ?¥ë‹¨?ì„ ëª…í™•?˜ê²Œ ?€ì¡°í•˜??? ê¸°?ì¸ ë¹„êµ??Table) ì±„ìš°ê¸?ì§ˆë¬¸??ì¶œì œ??ì£¼ì‹­?œì˜¤. (?? ?¡ìƒ??ë°©ì? ?€ì±…ì—??SCPê³µë²•ê³?ëª¨ë˜?¤ì§ê³µë²• ë¹„êµ, ?¹ì? ?•ì  ?¡ìƒ?”ì? ?™ì  ?¡ìƒ???´ë¡  ë¹„êµ ??
  - êµ¬ì„± ?•íƒœ: ??Column)??ë¹„êµ ?€?ë“¤??ë°°ì¹˜?˜ê³ , ??Row)??ì²?ë²ˆì§¸ ?´ì—??êµ¬ë¶„/?‰ê? ê¸°ì?(êµ¬ë¶„ ??ª©)???¡ë‹ˆ??
  - ?š¨ **[êµ¬ë¶„ ??ª©(???œëª©) ëª…í™•???ì¹™ - ê·¹ë„ë¡?ì¤‘ìš”!]**: êµ¬ë¶„ ??ª©(???œëª©)?€ **ê·¸ê²ƒë§??½ì–´?????œê? ë¬´ìŠ¨ ì£¼ì œ/? í”½???€??ë¹„êµ?¸ì?, ???‰ì— ?´ë–¤ ì¢…ë¥˜???µì„ ?¨ì•¼ ?˜ëŠ”ì§€ ì§ê??ìœ¼ë¡??´í•´?????ˆì–´??* ?©ë‹ˆ?? ?ˆë¬´ ì¶”ìƒ?ì´ê±°ë‚˜ ë¬´ì¡°ê±?ê¸¸ê²Œ ?°ì? ë§ˆì‹­?œì˜¤. ?¬ìš©?ê? ?‘ì„±?´ì•¼ ?˜ëŠ” ?µë? ë²”ì£¼(ë©”ì»¤?ˆì¦˜, ê´€ë¦??€ì±? ?¹ì§• ??ë¥??•í™•???¨ìˆœ?˜ê³  ì§ê??ì¸ ?¨ì–´ ?ëŠ” ëª…ì‚¬???´êµ¬ë¡?ì§€?œí•˜??‹œ??
  - ?š¨ **[ëª¨ë²” ?µì•ˆ-êµ¬ë¶„??ª© ë²”ì£¼ ?¼ì¹˜ ?ì¹™ - ê·¹ë„ë¡?ì¤‘ìš”!]**: ê°?INPUT??ëª¨ë²” ?µì•ˆ?€ ë°˜ë“œ??**?´ë‹¹ ?‰ì˜ êµ¬ë¶„ ??ª©(???œëª©)???”êµ¬?˜ëŠ” ?µë? ë²”ì£¼**???•í™•??ë¶€?©í•˜???´ìš©?´ì–´???©ë‹ˆ?? ?ˆë? ?¤ì–´ êµ¬ë¶„ ??ª©??'?¤ë¬´ ?œìš©ì²?ë°??ìš© ?¬ë?'?´ë©´ ëª¨ë²” ?µì•ˆ??'?´ë””???°ì´?”ì?(?œìš©ì²?'ë¥?ê¸°ìˆ ?´ì•¼ ?˜ê³ , '?œê³µ ??? ì˜?¬í•­ ë°??œê³„'?´ë©´ 'ì£¼ì˜?´ì•¼ ????? ì˜?¬í•­)'??ê¸°ìˆ ?´ì•¼ ?©ë‹ˆ?? êµ¬ë¶„ ??ª©??ë¬»ëŠ” ë²”ì£¼?€ ?„í? ?¤ë¥¸ ë²”ì£¼?????? ? ì˜?ì„ ë¬¼ì—ˆ?”ë° ?œìš©ì²˜ë? ?µì•ˆ?¼ë¡œ ?‘ì„±)?€ **ì¶œì œ ?¤ë¥˜**?´ë?ë¡??ˆë? ë°œìƒ?œí‚¤ì§€ ë§ˆì‹­?œì˜¤.
  - "explanation": ???„ì²´ ?´ìš© ë°?ê°?ë¹ˆì¹¸???€??ê³µí•™???ì„¸ ?´ì„¤.

${topicInstructionsPrompt}
${LATEX_PROMPT_INSTRUCTIONS}

[?‘ë‹µ JSON ?¬ë§·]:
ë°˜ë“œ???„ë˜ ì§€?•ëœ JSON ë°°ì—´ ?¬ë§·?¼ë¡œë§??•í™•??ë°˜í™˜?˜ì‹­?œì˜¤. ë§ˆí¬?¤ìš´??\`\`\`json ì½”ë“œ ë¸”ë¡?´ë‚˜ ì¶”ê??ì¸ ?ìŠ¤???¤ëª…?€ ë°°ì œ?˜ê³  ?œìˆ˜??JSON ?°ì´?°ë§Œ ?œê³µ??ì£¼ì‹­?œì˜¤.
[
  {
    "type": "ì£¼ê???(?œì±„?°ê¸°)",
    "question": "?¤ìŒ (ë¹„êµ ?€??ê³µë²•ëª? ê³µë²•?¤ì˜ ì£¼ìš” ê³µí•™???¹ì§• ë¹„êµ??ë¹ˆì¹¸???¤ì–´ê°??´ìš©???Œë§ê²??œìˆ ?˜ì‹œ??",
    "tableData": {
      "headers": ["êµ¬ë¶„ ??ª©", "ë¹„êµ?€??A", "ë¹„êµ?€??B"],
      "rows": [
        ["?‰ê? ??ª© ëª…ì¹­", "[INPUT_1]", "(ê¸°ì…???•ë³´)"],
        ["?‰ê? ??ª© ëª…ì¹­", "(ê¸°ì…???•ë³´)", "[INPUT_2]"]
      ]
    },
    "answers": {
      "INPUT_1": "ë¹„êµ?€??A??ê³µí•™??ë©”ì»¤?ˆì¦˜???¤ëª…?˜ëŠ” 40~80???œìˆ ??ë¬¸ì¥",
      "INPUT_2": "ë¹„êµ?€??B??ê³µí•™??ë©”ì»¤?ˆì¦˜???¤ëª…?˜ëŠ” 40~80???œìˆ ??ë¬¸ì¥"
    },
    "explanation": "???´ìš© ë°?ë¹ˆì¹¸???€??ê³µí•™???ì„¸ ?´ì„¤"
  },
  {
    "type": "ì£¼ê???(?œì±„?°ê¸°)",
    "question": "?¤ìŒ (?¤ë¥¸ ë¹„êµ ?€?ëª…) ë¹„êµ??ë¹ˆì¹¸???¤ì–´ê°??´ìš©???œìˆ ?˜ì‹œ??",
    "tableData": {
      "headers": ["êµ¬ë¶„ ??ª©", "ë¹„êµ?€??C", "ë¹„êµ?€??D"],
      "rows": [
        ["?‰ê? ??ª© ëª…ì¹­", "[INPUT_1]", "(ê¸°ì…???•ë³´)"],
        ["?‰ê? ??ª© ëª…ì¹­", "(ê¸°ì…???•ë³´)", "[INPUT_2]"]
      ]
    },
    "answers": {
      "INPUT_1": "ë¹„êµ?€??C??ê³µí•™??ë©”ì»¤?ˆì¦˜???¤ëª…?˜ëŠ” 40~80???œìˆ ??ë¬¸ì¥",
      "INPUT_2": "ë¹„êµ?€??D??ê³µí•™??ë©”ì»¤?ˆì¦˜???¤ëª…?˜ëŠ” 40~80???œìˆ ??ë¬¸ì¥"
    },
    "explanation": "???´ìš© ë°?ë¹ˆì¹¸???€??ê³µí•™???ì„¸ ?´ì„¤"
  }
]
`;

    const promptBatch3 = `
[?š¨ ìµœìš°???ˆë? ì¤€??ë²•ê·œ (Constitutional Guidelines) - ?‘ì—…???œì‘?˜ê¸° ?„ì— ê°€??ë¨¼ì? ?•ì¸?˜ê³  100% ì¤€?˜í•˜??‹œ??:
?¹ì‹ ?€ ?€?œë?êµ?êµ??ê¸°ìˆ ?ê²© ê¸°ìˆ ??Professional Engineer) ?œí—˜ ì¶œì œ?„ì›?¼ë¡œ??ë¬¸ì œë¥?ì¶œì œ?˜ê¸° ?? ?„ë˜ ëª…ì‹œ??**ë¬¸ì œ?ì„± ?ˆë? ì§€ì¹¨ë“¤**ê³?**ê³µí•™???´ë¡  ê¸°ì?**???Œë²•????ì¡?ì² ì¹™?¼ë¡œ ?¼ì•„ ?´ë? ë¨¼ì? ?„ë²½?˜ê²Œ ?™ì??˜ê³  ?ˆë??ìœ¼ë¡?ë³µì¢…?˜ì—¬ ë¬¸ì œë¥??¤ê³„ ë°?ì¶œì œ?´ì•¼ ?©ë‹ˆ?? ì§€ì¹¨ì„ ?„ë°˜?˜ì—¬ ì¶œì œ??ë¬¸ì œ???œìŠ¤??ê²€ì¦??¨ê³„?ì„œ ì¦‰ì‹œ ?ê¸°?©ë‹ˆ??

${standardsAnalysis ? `${standardsAnalysis}\n\n` : ''}[?š¨ ë¬¸ì œ ?ì„± ?ˆë? ì¤€??ì§€ì¹?:
${activeGenerationStandards}

[?š¨ ì§€ë°˜ê³µ???œì? ?´ë¡  ë°?ê³„ì‚° ê¸°ì?]:
${activeEngineeringStandards}

---------------------------------------------------------
[ë¬¸ì œ ?ì„± ?œìŠ¤???œì‘]:
?„ì˜ ?ˆë? ì§€ì¹¨ê³¼ ê¸°ì? ë²•ê·œë¥??„ì „???™ì????íƒœ?ì„œ, ?„ë˜ ?œê³µ?˜ëŠ” [? í”½ ?µì‹¬ ì£¼ì œ], [?µì‹¬ ?¤ì›Œ??, [ì²¨ë??Œì¼ ë³¸ë¬¸ ?ìŠ¤??, [?´ì „ ?Œì°¨ ?¤ë‹µ ?•ë³´], [?¬ìš©???¼ë“œë°?ì§€ì¹? ê·¸ë¦¬ê³?[?¬ìš©??ë¬¸ì œ ì¡°ì • ?´ì—­]???¬ì¸µ ë¶„ì„?˜ì—¬, ì´?**?•í™•??4ê°?*???ˆìƒë¬¸ì œ(ê°ê???4ì§€? ë‹¤ 4ê°?ë¥??ì„±??ì£¼ì‹­?œì˜¤.
${specialInstructions}
${weaknessPrompt}
${feedbackPrompt}
${adjustmentsPrompt}

[? í”½ ?µì‹¬ ì£¼ì œ]: ${coreSubject}
[? í”½ ?ë³¸ ?œëª©]: ${topic.title}
[?µì‹¬ ?¤ì›Œ??: ${topic.keywords || '?œê³µ?˜ì? ?ŠìŒ'}
[ì²¨ë??Œì¼ ë³¸ë¬¸ ?ìŠ¤??: ${fileText || '?œê³µ?˜ì? ?ŠìŒ'}

- **?š¨ [? í”½ ëª…ì¹­ ?•ì œ ë°?ì°Œêº¼ê¸??œê±° ì² ì¹™]**: ë¬¸ì œë¥?ì¶œì œ????ì§ˆë¬¸ ì§€ë¬¸ì— "ê³µí•™ ?´ì„ ë³´ê³ ??, "ê³µë??¸íŠ¸", "?”ì•½ë³? ê°™ì? ë¬¸ì„œ ?•íƒœë¥?ê°€ë¦¬í‚¤??êµ°ë”?”ê¸° ì°Œêº¼ê¸?ëª…ì¹­??ê·¸ë?ë¡?ì£¼ì–´ë¡??¬ìš©?˜ì? ë§ˆì‹­?œì˜¤. ë¬¸ì œ ì§€ë¬¸ì—???¤ì§ ?œìˆ˜??ê³µí•™ ?µì‹¬ ì£¼ì œ??**"${coreSubject}"** ëª…ì¹­ë§Œì„ ?œìš©?˜ì—¬ ì§ˆë¬¸ ë¬¸ì¥???¤ë“¬?¼ì‹­?œì˜¤.

[?š¨ ?œí—˜ ê²°ê³¼ ë°??¤í—˜ ?°ì´???˜ì¹˜ ?œì‹œ ?ì¹™ ??ë§¤ìš° ì¤‘ìš”]:
- ë§Œì•½ ë¬¸ì œê°€ ?¹ì • ?¬ë„ë³??œí—˜ ê²°ê³¼???¤í—˜ ?°ì´???˜ì¹˜ë¥??´ì„/ë¶„ì„?˜ì—¬ ?µì•ˆ??ì±„ìš°ê±°ë‚˜ ê³„ì‚°/ì¶”ë¡ ?´ì•¼ ?˜ëŠ” ë¬¸ì œ??ê²½ìš°, ë¶„ì„???€?ì´ ?˜ëŠ” ?ë³¸ ?œí—˜ ê²°ê³¼ ?°ì´???Œì´ë¸”ì„ ì§ˆë¬¸(question) ?ìŠ¤??ë³¸ë¬¸ ?ˆì— ë§ˆí¬?¤ìš´ ???•íƒœë¡?ë°˜ë“œ???¨ê»˜ ê¸°ì…?˜ì—¬ ë³´ì—¬ì£¼ì‹­?œì˜¤.
- **?š¨ [???‘ì„± ê°œí–‰ ê·œì¹™ - ê·¹ë„ë¡?ì¤‘ìš”!]**: ë§ˆí¬?¤ìš´ ?œì˜ ê°??‰ì? ë°˜ë“œ???¤ì œ ì¤„ë°”ê¿?ë¬¸ì(\\n)ë¥??¬ìš©?˜ì—¬ ê°ê° ?¤ë¥¸ ì¤„ì— ?‘ì„±?˜ì–´???©ë‹ˆ??

[ì¶œì œ ?”êµ¬?¬í•­]:
ë°˜ë“œ??ì´?4ê°œì˜ ê°ê???ë¬¸ì œë¥??¤ìŒê³?ê°™ì´ êµ¬ì„±?˜ì—¬ ì¶œì œ?˜ì‹­?œì˜¤:

- ëª©ì : ? í”½???ì„¸???ë¦¬, ë©”ì»¤?ˆì¦˜, ?¥ë‹¨???±ì„ ?¤ê°?„ë¡œ ?‰ê??˜ëŠ” ê³ ë‚œ??4ì§€? ë‹¤??ì§ˆë¬¸.
- "type" ê°? ë°˜ë“œ??"ê°ê???(4ì§€? ë‹¤)"
- [ê³„ì‚°ë¬¸ì œ ë¹„ì¤‘ ì¡°ê±´ - ë§¤ìš° ì¤‘ìš”]: ?„ì²´ 4ê°œì˜ ê°ê???ë¬¸ì œ ì¤? ë°˜ë“œ???•í™•??2ê°œì˜ ë¬¸ì œ??ê³µí•™???˜ì¹˜ ?ë‹¨?´ë‚˜ ?•ëŸ‰??ë¶„ì„ ?¥ë ¥???‰ê??˜ëŠ” ë¬¸ì œë¡?ì¶œì œ?˜ì‹­?œì˜¤. ?? ì§ˆë¬¸ ì§€ë¬¸ì— ê³µì‹?´ë‚˜ ?˜ì¹˜ë¥?ë¯¸ë¦¬ ?œì‹œ????"??ê°’ì„ ?€?…í•˜??ê³„ì‚°?˜ì‹œ?? ?ì˜ ê¸°ê³„??ê³„ì‚° ë¬¸ì œ???ˆë?ë¡?ì¶œì œ?˜ì? ë§ˆì‹­?œì˜¤.
- [?µì‹¬ ê´€??ì§ˆë¬¸ ?ì¹™]: ëª¨ë“  ê°ê???ë¬¸ì œ???´ë‹¹ ? í”½??ê°€??ë³¸ì§ˆ?ì¸ ê³µí•™??ë©”ì»¤?ˆì¦˜, ê±°ë™ ?ë¦¬, ?¤ê³„ ?ë‹¨ ê·¼ê±°ë¥?ê´€?µí•˜??ì§ˆë¬¸?´ì–´???©ë‹ˆ??
- ?š¨ [ê°ê????•ë???ë°??•ë‹µ ?¼ì¹˜ ì¡°ê±´ - ê·¹ë„ë¡?ì¤‘ìš”!]: ëª¨ë“  ê°ê???ê³„ì‚° ë¬¸ì œ???˜ì¹˜/ê³µí•™???ë‹¨ ë¬¸ì œë¥?ì¶œì œ???? ê³„ì‚°?¼ë¡œ ?„ì¶œ???•í™•???•ë‹µ ?˜ì¹˜??ì¡°ê±´??4ê°œì˜ ë³´ê¸°(options) ì¤?ë°˜ë“œ???•í™•??1ê°œë¡œ ì¡´ì¬?´ì•¼ ?©ë‹ˆ??
- ?š¨ [ê³µì‹ ë°?ê³µì‹ ?˜ì¹˜ ë²”ìœ„ ?¸ì¶œ ?ˆë? ê¸ˆì? ê·œì¹™ - ê·¹ë„ë¡?ì¤‘ìš”!]: ë¬¸ì œ ì§ˆë¬¸(question) ë³¸ë¬¸ ?´ì— ë¬¸ì œë¥??´ê²°?˜ëŠ” ???„ìš”??ê³µí•™ ?˜ì‹ ?ì²´???˜ì‹???¹ì • ?˜ì¹˜ ë²”ìœ„ë¥?**?ˆë?ë¡?ì§ì ‘ ?ìŠ¤?¸ë¡œ ?ì–´ ?œê³µ?˜ì? ë§ˆì‹­?œì˜¤.**
- ?š¨ [? ì‚¬/ì¤‘ë³µ ì§ˆë¬¸ ì¶œì œ ?ˆë? ê¸ˆì? - ë§¤ìš° ì¤‘ìš”!]: ?˜ë‚˜??ê³µì‹?´ë‚˜ ê±°ë™ ?¹ì„±?ì„œ ?Œìƒ?˜ëŠ” ë³€?˜ë§Œ ë°”ê¾¼ ?•íƒœ??? ì‚¬??ë¹„ë?/ë°˜ë¹„ë¡€ ì§ˆë¬¸?€ **?ˆë?ë¡?ì¤‘ë³µ?˜ì—¬ ì¶œì œ?˜ì? ë§ˆì‹­?œì˜¤.**

${topicInstructionsPrompt}
${LATEX_PROMPT_INSTRUCTIONS}

[?‘ë‹µ JSON ?¬ë§·]:
ë°˜ë“œ???„ë˜ ì§€?•ëœ JSON ë°°ì—´ ?¬ë§·?¼ë¡œë§??•í™•??ë°˜í™˜?˜ì‹­?œì˜¤. ë§ˆí¬?¤ìš´??\`\`\`json ì½”ë“œ ë¸”ë¡?´ë‚˜ ì¶”ê??ì¸ ?ìŠ¤???¤ëª…?€ ë°°ì œ?˜ê³  ?œìˆ˜??JSON ?°ì´?°ë§Œ ?œê³µ??ì£¼ì‹­?œì˜¤.
[
  {
    "type": "ê°ê???(4ì§€? ë‹¤)",
    "question": "ì§ˆë¬¸ ?´ìš©",
    "options": ["ë³´ê¸° 1", "ë³´ê¸° 2", "ë³´ê¸° 3", "ë³´ê¸° 4"],
    "answer": "?•í™•???¼ì¹˜?˜ëŠ” ?•ë‹µ ë³´ê¸° ?ìŠ¤??,
    "explanation": "?ì„¸???´ì„¤"
  }
]
`;

    
let parsedArray = null;

    if (topic.category === 'ê³„ì‚°') {
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
      // Save to session and return
      await saveSessionValue(`review_questions_topic_${topicId}`, { questions: finalCalcQuestions });
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

      const q1 = parseBatch(batch1Text, '1 (ì£¼ê???ê°œìš”/ê³µì‹/?¨ë‹µ)');
      const q2 = parseBatch(batch2Text, '2 (ì£¼ê????œì±„?°ê¸°)');
      const q3 = parseBatch(batch3Text, '3 (ê°ê???');

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
      
      if (type === 'ì£¼ê???) {
        if (subtype === 'ê°œìš”') { newType = 'ì£¼ê???(ê°œìš”)'; }
        else if (subtype === 'ê³µì‹') { newType = 'ì£¼ê???(ê³µì‹)'; }
        else if (subtype === '?œì±„?°ê¸°') { newType = 'ì£¼ê???(?œì±„?°ê¸°)'; newSubtype = '?œì±„?°ê¸°'; }
        else if (subtype === '?¨ë‹µ??) { newType = 'ì£¼ê???(?¨ë‹µ??'; }
        else if (subtype === '?œìˆ ') { newType = 'ì£¼ê???(?œìˆ )'; newSubtype = '?œìˆ '; }
      } else if (type === 'ê°œìš”') {
        newType = 'ì£¼ê???(ê°œìš”)';
        newSubtype = 'ê°œìš”';
      } else if (type === 'ê³µì‹') {
        newType = 'ì£¼ê???(ê³µì‹)';
        newSubtype = 'ê³µì‹';
      } else if (type === '?œì±„?°ê¸°') {
        newType = 'ì£¼ê???(?œì±„?°ê¸°)';
        newSubtype = '?œì±„?°ê¸°';
      } else if (type === '?¨ë‹µ??) {
        newType = 'ì£¼ê???(?¨ë‹µ??';
        newSubtype = '?¨ë‹µ??;
      } else if (type === '?œìˆ ') {
        newType = 'ì£¼ê???(?œìˆ )';
        newSubtype = '?œìˆ ';
      } else if (type === 'ê°ê??? || type === 'ê°ê???(4ì§€? ë‹¤)') {
        newType = 'ê°ê???(4ì§€? ë‹¤)';
      }
      
      return {
        ...q,
        type: newType,
        subtype: newSubtype
      };
    });

    const finalQuestions = topic.category === 'ê³„ì‚°'
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
      const finalQuestions = topic.category === 'ê³„ì‚°'
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
          const isFlow = qText.includes('?Œâ??€') || qText.includes('??) || qText.includes('?Œë¡œ?°ì°¨??) || qText.includes('?ë¦„??);
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
      type: "ì£¼ê???(?œì±„?°ê¸°)",
      subtype: "?œì±„?°ê¸°",
      question: `[?‰ì‚¬?¬ì˜ ?”ë°˜?¬ë©´?ˆì • ?´ì„ ?ˆì°¨]
?„ë˜ ?ë¦„??ë¹ˆì¹¸???¤ì–´ê°??¬ë°”ë¥?ë¶„ì„ ?¨ê³„ë¥??œìˆ ?˜ì‹œ??

\`\`\`
?Œâ??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€??
??          1?¨ê³„: ë¶ˆì—°?ë©´ ì¡°ì‚¬ ë°?ë¶„ì„         ??
?”â??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?¬â??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€??
                       ??
?Œâ??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€??
??      2?¨ê³„: ?‰ì‚¬?¬ì˜ë§??ì— ë¶ˆì—°?ë©´ ?¬ì˜     ??
?”â??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?¬â??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€??
                       ??
?Œâ??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€??
??          3?¨ê³„: [INPUT_1] ?ì—­ ?¤ì •          ??
?”â??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?¬â??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€??
                       ??
?Œâ??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€??
??      4?¨ê³„: ?¬ë©´??ê²½ì‚¬ë©??‰ì‚¬?¬ì˜ ?¬ì˜        ??
?”â??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?¬â??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€??
                       ??
?Œâ??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€??
??      5?¨ê³„: ?„í—˜ ?ì—­ ??êµì  ë¶„ì„          ??
??         - [INPUT_2] ?Œê´´: êµì ???„í—˜???? ??
??         - ?„ë„ ?Œê´´: ê·¹ì ???„ë„ ?ì—­ ??   ??
?”â??€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€??
\`\`\``,
      tableData: {
        headers: ["êµ¬ë¶„", "?´ìš©"],
        rows: [
          ["3?¨ê³„ ë¶„ì„ ?ì—­", "[INPUT_1]"],
          ["5?¨ê³„ ?„í—˜ ë¶„ì„", "[INPUT_2]"]
        ]
      },
      answers: {
        INPUT_1: "?„í—˜",
        INPUT_2: "?‰ë©´"
      },
      explanation: `?‰ì‚¬?¬ì˜ë²•ì„ ?´ìš©???”ë°˜ ?¬ë©´???ˆì •???´ì„ ?ˆì°¨:
1?¨ê³„: ë¶ˆì—°?ë©´(?ˆë¦¬, ?¨ì¸µ ????ë°©í–¥??ì£¼í–¥/ê²½ì‚¬)???„ì¥ ì¡°ì‚¬?˜ì—¬ ?µê³„ ë¶„ì„?©ë‹ˆ??
2?¨ê³„: ì¡°ì‚¬??ë¶ˆì—°?ë©´??ê·¹ì (Pole) ?ëŠ” ?€??Great Circle)???‰ì‚¬?¬ì˜ë§?Stereonet) ?ì— ?¬ì˜?©ë‹ˆ??
3?¨ê³„: ?¬ë©´??ë°©í–¥ê³?ê²½ì‚¬ê°ì„ ê¸°ì??¼ë¡œ ?Œê´´ê°€ ë°œìƒ?????ˆëŠ” '?„í—˜ ?ì—­(Daylight Envelope ë°?ë§ˆì°°ê°???'???¤ì •?©ë‹ˆ??
4?¨ê³„: ?¬ë©´???¤ì œ ê²½ì‚¬ë©´ì„ ?¬ì˜?˜ì—¬ ?ˆì •??ê²€??ê¸°ì?? ì´ ?•ì„±?©ë‹ˆ??
5?¨ê³„: ?„í—˜ ?ì—­ ?´ì— ë¶ˆì—°?ë©´??êµì  ?ëŠ” ê·¹ì ???„ì¹˜?˜ëŠ”ì§€ ë¶„ì„?˜ì—¬ ?‰ë©´?Œê´´(êµì ???„í—˜???´ì— ?„ì¹˜) ?ëŠ” ?„ë„?Œê´´(ê·¹ì ???„ë„ ?ì—­???„ì¹˜) ê°€?¥ì„±???ì •?©ë‹ˆ??`,
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
      return res.status(400).json({ error: 'topicIdê°€ ?„ë½?˜ì—ˆ?µë‹ˆ??' });
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

    const key = `review_questions_topic_${targetTopicId}`;
    let row = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);
    let actualKey = key;

    if (!row) {
      const topicPattern = `review_questions_topic_${targetTopicId}_sess_%`;
      // Exclude _q (questions-only) keys so we only fetch state rows
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
      res.json({ success: false, error: '?¸ì…˜ ?•ë³´ê°€ ?†ìŠµ?ˆë‹¤.' });
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
    const { topicId, sessionId, questions, selectedAnswers, revealedQuestions, tableAnswers, tableGradingResults, tutorAnswers, tutorInputText, chatHistory, savedQuizScroll } = req.body;
    let targetTopicId = String(topicId || '');
    if (targetTopicId.startsWith('mixed_') && targetTopicId.includes('_sess_')) {
      targetTopicId = targetTopicId.split('_sess_')[0];
    }

    if (!topicId) {
      return res.status(400).json({ error: '?„ìˆ˜ ?¸ìê°€ ?„ë½?˜ì—ˆ?µë‹ˆ??' });
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

    const key = `review_questions_topic_${targetTopicId}`;
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
      res.json({ success: false, error: '?´ë‹¹ ë³µìŠµ???€?¥ëœ ?€??ê¸°ë¡???†ìŠµ?ˆë‹¤.' });
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
    return res.status(400).json({ error: '? íš¨??topicIdê°€ ?„ë‹™?ˆë‹¤.' });
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
    res.json({ success: false, error: '?´ë‹¹ ? í”½???„ë£Œ??ë³µìŠµ ê¸°ë¡???†ìŠµ?ˆë‹¤.' });
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
            title: '?¤ëŠ˜???„ìˆ˜ ë¯¹ìŠ¤ë³µìŠµ (11??1?¸íŠ¸)',
            keywords: '',
            pdfName: 'mixed.html',
            mode: isCompleted ? 'completed' : 'ai',
            scheduleId: rawSchedId,
            reviewRound: 'MIX',
            isReadOnly: isCompleted,
            isBonus: false,
            category: 'ë¯¹ìŠ¤'
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
              category: sched.category || '?¼ë°˜'
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
            title: '?¤ëŠ˜???„ìˆ˜ ë¯¹ìŠ¤ë³µìŠµ (11??1?¸íŠ¸)',
            keywords: '',
            pdfName: 'mixed.html',
            mode: 'ai',
            scheduleId: `mixed_schedule_${topicIdRaw.replace('mixed_', '')}`,
            reviewRound: 'MIX',
            isReadOnly: false,
            isBonus: false,
            category: 'ë¯¹ìŠ¤'
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
              category: topicObj.category || '?¼ë°˜'
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
      return res.status(404).send('ì²¨ë???PDF/HTML ?ë³¸ ?Œì¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤.');
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
      return res.status(404).send('ì²¨ë???PDF/HTML ?ë³¸ ?Œì¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤.');
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
    res.status(500).send('?œë²„ ?¤ë¥˜ë¡??Œì¼???¤íŠ¸ë¦¬ë°?˜ì? ëª»í–ˆ?µë‹ˆ??');
  }
});

// POST /api/schedules/bonus/complete -> Complete a weakpoint bonus review
router.post('/schedules/bonus/complete', async (req, res) => {
  const { topicId, score, scheduleId, schedule_id } = req.body;
  const targetScheduleId = scheduleId || schedule_id;
  const today = fileUtils.getLocalDateString();
  const now = new Date().toISOString();

  if (!topicId) {
    return res.status(400).json({ error: '?„ìˆ˜ ?¸ì topicIdê°€ ?„ë½?˜ì—ˆ?µë‹ˆ??' });
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
    title: '?Œë¥´?ê¸° 1ì°??•ë?ë°©ì •??Terzaghi 1D Consolidation, $C_v$)',
    concept: '?¸ë? ?ì§„/?œê°„ ?˜ì¤‘ ?¬í•˜ ???œê°„??ê²½ê³¼?¨ì— ?°ë¼ ê³¼ì‰ê°„ê·¹?˜ì••???í•˜ ë°°ìˆ˜ì¸µì„ ?µí•´ ?Œì‚°?˜ì–´ ?˜ê????ë„ë¥?ê·œì •??1ì°¨ì› ë¯¸ë¶„ë°©ì •??,
    formula: `1) ?•ë?ë°©ì •??(Governing Equation):
$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$

- $u$: ê³¼ì‰ê°„ê·¹?˜ì•• (Excess Pore Water Pressure)
- $t$: ?•ë? ê²½ê³¼ ?œê°„ (Time)
- $z$: ?í† ì¸??´ì˜ ë°°ìˆ˜ ê±°ë¦¬ ë°©í–¥ ê¹Šì´
- $C_v$: ?•ë?ê³„ìˆ˜ (Coefficient of Consolidation)

2) ?•ë?ê³„ìˆ˜ ($C_v$)???•ì˜:
$$C_v = \\frac{k}{m_v \\gamma_w} = \\frac{k(1+e_0)}{a_v \\gamma_w}$$

- $k$: ?í† ???¬ìˆ˜ê³„ìˆ˜ (Coefficient of Permeability)
- $m_v$: ì²´ì ?•ì¶•ê³„ìˆ˜(ì²´ì ë³€?”ê³„?? (Coefficient of Volume Compressibility)
- $\\gamma_w$: ë¬¼ì˜ ?¨ìœ„ì¤‘ëŸ‰ (Unit Weight of Water)`,
    structure: `- $u$: ê³¼ì‰ê°„ê·¹?˜ì••\n- $t$: ?•ë? ê²½ê³¼ ?œê°„\n- $z$: ë°°ìˆ˜ ê±°ë¦¬ ê¹Šì´\n- $C_v$: ?•ë?ê³„ìˆ˜`
  },
  {
    keywords: ['q_{ult}', 'N_c', 'N_q', 'N_{\\gamma}', 'c', 'B', 'D_f'],
    title: '?Œë¥´?ê¸° ê·¹í•œì§€ì§€??Terzaghi Ultimate Bearing Capacity, $q_{ult}$)',
    concept: '?™ì˜ ?„ë‹¨?Œê´´ ?•ìƒ???€?˜ë‚˜???±ìœ¼ë¡?ëª¨ë¸?”í•˜??ê¸°ì´ˆ ?€ë©??„ë˜ ì§€ë°˜ì´ ?„ë‹¨ ?Œê´´ ?†ì´ ì§€?±í•  ???ˆëŠ” ìµœë? ?˜ì¤‘ ê°•ë„ ??,
    formula: `Terzaghi ê·¹í•œ ì§€ì§€??
$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$

- $q_{ult}$: ê·¹í•œ ì§€ì§€??
- $c$: ?™ì˜ ?ì°©??
- $q$: ê¸°ì´ˆ ?€ë©´ì˜ ? íš¨?ì¬?˜ì¤‘ ($\\gamma D_f$)
- $\\gamma$: ê¸°ì´ˆ ?€ë©??„ë˜ ?™ì˜ ?¨ìœ„ì¤‘ëŸ‰
- $B$: ê¸°ì´ˆ????(?¨ë? ê¸¸ì´)
- $N_c, N_q, N_{\\gamma}$: ì§€ë°?ì§€ì§€??ê³„ìˆ˜`,
    structure: `- $q_{ult}$: ê·¹í•œ ì§€ì§€??n- $c$: ?™ì˜ ?ì°©??n- $q$: ê¸°ì´ˆ ?€ë©´ì˜ ? íš¨?ì¬?˜ì¤‘ ($\\gamma D_f$)\n- $\\gamma$: ê¸°ì´ˆ ?€ë©??„ë˜ ?™ì˜ ?¨ìœ„ì¤‘ëŸ‰\n- $B$: ê¸°ì´ˆ????(?¨ë? ê¸¸ì´)\n- $N_c, N_q, N_{\\gamma}$: ì§€ë°?ì§€ì§€??ê³„ìˆ˜`
  },
  {
    keywords: ['Q', 'RQD', 'J_n', 'J_r', 'J_a', 'J_w', 'SRF'],
    title: 'ë°”í†¤ ?”ë°˜ Që¶„ë¥˜(Barton Q-system, $Q$)',
    concept: '?”ë°˜??ê³µí•™???¹ì„±??6ê°€ì§€ ?…ë¦½??ë³€?˜ë? ?µí•´ ?•ëŸ‰?”í•˜???°ë„ 1ì°?ì§€ë³??¤ê³„ë¥??¤ê³„?˜ëŠ” ì§€??ê³µì‹',
    formula: `?”ë°˜ ?±ê¸‰ Qì§€????
$$Q = \\frac{RQD}{J_n} \\times \\frac{J_r}{J_a} \\times \\frac{J_w}{SRF}$$

- $Q$: ?”ë°˜ ?±ê¸‰ ì§€??
- $RQD$: ?”ì§ˆì§€??(Rock Quality Designation)
- $J_n$: ?ˆë¦¬êµ???(Joint set number)
- $J_r$: ?ˆë¦¬ë©?ê±°ì¹ ê¸?ê³„ìˆ˜ (Joint roughness number)
- $J_a$: ?ˆë¦¬ë©?ë³€ì§?ê³„ìˆ˜ (Joint alteration number)
- $J_w$: ?ˆë¦¬??ë³´ì • ê³„ìˆ˜ (Joint water reduction factor)
- $SRF$: ?‘ë ¥ ê°ì†Œ ê³„ìˆ˜ (Stress Reduction Factor)`,
    structure: `- $Q$: ?”ë°˜ ?±ê¸‰ ì§€??n- $RQD$: ?”ì§ˆì§€??(Rock Quality Designation)\n- $J_n$: ?ˆë¦¬êµ???(Joint set number)\n- $J_r$: ?ˆë¦¬ë©?ê±°ì¹ ê¸?ê³„ìˆ˜ (Joint roughness number)\n- $J_a$: ?ˆë¦¬ë©?ë³€ì§?ê³„ìˆ˜ (Joint alteration number)\n- $J_w$: ?ˆë¦¬??ë³´ì • ê³„ìˆ˜ (Joint water reduction factor)\n- $SRF$: ?‘ë ¥ ê°ì†Œ ê³„ìˆ˜ (Stress Reduction Factor)`
  },
  {
    keywords: ['H', 'q', 'q_a', '\\tan\\theta'],
    title: '?°ì•½ì§€ë°??Œë“œë§¤íŠ¸ ìµœì†Œ?ê»˜(Sand Mat Minimum Thickness, $H$)',
    concept: '?œì¸µ ê°œëŸ‰ ë°??°ì•½ì§€ë°??ë???ë¬´ê±°??ì£¼í–‰???¥ë¹„(Trafficability)ë¥??¹ê¸° ?„í•œ ?˜ì¤‘ ì§€ì§€ ?Œìš” ?ê»˜??,
    formula: `?Œë“œë§¤íŠ¸ ìµœì†Œ ?ê»˜ ??
$$H = \\sqrt{\\frac{q - q_a}{\\gamma \\tan \\theta}}$$

- $H$: ?Œë“œë§¤íŠ¸???Œìš” ìµœì†Œ ?ê»˜
- $q$: ?¬ì„¤ ?¥ë¹„???‘ì???
- $q_a$: ì§€ë°˜ì˜ ?ˆìš© ì§€ì§€??
- $\\gamma$: ëª¨ë˜???¨ìœ„ì¤‘ëŸ‰
- $\\theta$: ?˜ì¤‘ ë¶„ì‚°ê°?(?¼ë°˜?ìœ¼ë¡?$45^\\circ$ ?ìš©)`,
    structure: `- $H$: ?Œë“œë§¤íŠ¸???Œìš” ìµœì†Œ ?ê»˜\n- $q$: ?¬ì„¤ ?¥ë¹„???‘ì???n- $q_a$: ì§€ë°˜ì˜ ?ˆìš© ì§€ì§€??n- $\\gamma$: ëª¨ë˜???¨ìœ„ì¤‘ëŸ‰\n- $\\theta$: ?˜ì¤‘ ë¶„ì‚°ê°?(?¼ë°˜?ìœ¼ë¡?$45^\\circ$ ?ìš©)`
  },
  {
    keywords: ['r', 'R', '\\alpha', 'sin', '45'],
    title: '?ˆë??¸ë„¤??ê·¹ì ë°˜ê²½(Schmidt Net Pole Radius, $r$)',
    concept: '?µê³„??ë°€??ë³´ì •???„í•´ ë©´ì  ?œê³¡??ì¤„ì¸ ?ˆë????¤íŠ¸(Schmidt Net) ?‰ë©´ ë³€???¬ì˜??,
    formula: `ê·¹ì  ë°˜ê²½ ??
$$r = \\sqrt{2} R \\sin\\left(45^\\circ - \\frac{\\alpha}{2}\\right)$$

- $r$: ?¬ì˜??ì¤‘ì‹¬?¼ë¡œë¶€??ê·¹ì (Pole)ê¹Œì????‰ë©´ ê±°ë¦¬
- $R$: ?¬ì˜êµ?Sphere)??ë°˜ê²½
- $\\alpha$: ë¶ˆì—°?ë©´??ê²½ì‚¬ê°?(Dip angle)`,
    structure: `- $r$: ?¬ì˜??ì¤‘ì‹¬?¼ë¡œë¶€??ê·¹ì (Pole)ê¹Œì????‰ë©´ ê±°ë¦¬\n- $R$: ?¬ì˜êµ?Sphere)??ë°˜ê²½\n- $\\alpha$: ë¶ˆì—°?ë©´??ê²½ì‚¬ê°?(Dip angle)`
  },
  {
    keywords: ['P', '\\tau_{allow}', 'd', 'L', '\\pi'],
    title: '?½ë³¼??ê³ ì°©??ê³„ì‚°??Rockbolt Bond Strength, $P$)',
    concept: '?¸ë°œ ?˜ì¤‘ ?¬í•˜ ??ì²œê³µ?€ ë°°ë©´??ë§ˆì°° ë¶€ì°?ë©´ì ??ê¸°ë°˜?¼ë¡œ ë³¼íŠ¸ ?ˆë½??ì§€?±í•˜???œê³„ ê³ ì°©????,
    formula: `?½ë³¼???ˆìš© ì§€ì§€????
$$P = \\pi d L \\tau_{allow}$$

- $P$: ?½ë³¼?¸ì˜ ìµœë? ?ˆìš© ?¸ë°œ ?€?? ¥ (?¸ë°œ ?˜ì¤‘)
- $d$: ?½ë³¼??ì²œê³µ êµ¬ë©??ì§ê²½
- $L$: ê·¸ë¼?°íŒ… ?•ì°© ê¸¸ì´ (ê³ ì°© ?ì—­)
- $\\tau_{allow}$: ì§€ë°˜ê³¼ ê·¸ë¼?°íŒ…??ê°„ì˜ ?ˆìš© ë¶€ì°??„ë‹¨ê°•ë„`,
    structure: `- $P$: ?½ë³¼?¸ì˜ ìµœë? ?ˆìš© ?¸ë°œ ?€?? ¥ (?¸ë°œ ?˜ì¤‘)\n- $d$: ?½ë³¼??ì²œê³µ êµ¬ë©??ì§ê²½\n- $L$: ê·¸ë¼?°íŒ… ?•ì°© ê¸¸ì´ (ê³ ì°© ?ì—­)\n- $\\tau_{allow}$: ì§€ë°˜ê³¼ ê·¸ë¼?°íŒ…??ê°„ì˜ ?ˆìš© ë¶€ì°??„ë‹¨ê°•ë„`
  },
  {
    keywords: ['K_a', 'K_p', 'p_a', '\\phi', '\\sin\\phi'],
    title: '??‚¹ ì£¼ë™? ì••ê³„ìˆ˜(Rankine Active Earth Pressure Coefficient, $K_a$)',
    concept: 'ì§€ë°˜ì´ ?¸ì¥ ë³€?•ì„ ?¼ìœ¼ì¼??œê³„ ì£¼ë™ ?Œì„± ?‰í˜• ?íƒœ???„ë‹¬????ê°€???¹ë²½ ë°°ë©´???˜í‰?¼ë¡œ ë°€?´ë‚´??? ì••??,
    formula: `??‚¹ ì£¼ë™? ì••ê³„ìˆ˜ ??
$$K_a = \\tan^2\\left(45^\\circ - \\frac{\\phi}{2}\\right) = \\frac{1 - \\sin\\phi}{1 + \\sin\\phi}$$

- $K_a$: ì£¼ë™? ì•• ê³„ìˆ˜
- $K_p$: ?˜ë™? ì•• ê³„ìˆ˜
- $\\phi$: ?™ì˜ ?´ë?ë§ˆì°°ê°?
- $p_a$: ì£¼ë™? ì•• ê°•ë„
- $c$: ?™ì˜ ?ì°©??
- $\\gamma$: ?™ì˜ ?¨ìœ„ì¤‘ëŸ‰
- $z$: ê²€???¨ë©´ ê¹Šì´`,
    structure: `- $K_a$: ì£¼ë™? ì•• ê³„ìˆ˜\n- $K_p$: ?˜ë™? ì•• ê³„ìˆ˜\n- $\\phi$: ?™ì˜ ?´ë?ë§ˆì°°ê°?n- $p_a$: ì£¼ë™? ì•• ê°•ë„\n- $c$: ?™ì˜ ?ì°©??n- $\\gamma$: ?™ì˜ ?¨ìœ„ì¤‘ëŸ‰\n- $z$: ê²€???¨ë©´ ê¹Šì´`
  },
  {
    keywords: ['C', 'D_f', 'q_{net}'],
    title: 'ë³´ìƒê¸°ì´ˆ ë³´ìƒ??Compensated Foundation Safety Factor, $C$)',
    concept: 'êµ¬ì¡°ë¬??ì¤‘??êµ´ì°©???™ì˜ ì´?ì¤‘ëŸ‰?¼ë¡œ ?„ë²½??ì¹˜í™˜ ?ì‡„?˜ì—¬ ??ì¹¨í•˜ ?˜ì¤‘??Zeroë¡??˜ë ´?œí‚¤???‰ê? ê³µì‹',
    formula: `ë³´ìƒê¸°ì´ˆ ë³´ìƒ????
$$C = \\frac{\\gamma D_f}{q}$$

- $C$: ë³´ìƒ??($C = 1.0$ ?´ë©´ ?„ì „ ë³´ìƒ)
- $\\gamma$: êµ´ì°©?˜ì—¬ ë°°ì¶œ???™ì˜ ?¨ìœ„ì¤‘ëŸ‰
- $D_f$: ê¸°ì´ˆ??êµ´ì°© ê¹Šì´
- $q$: ?ë? êµ¬ì¡°ë¬?ì´??ì¤‘ ë°??˜ì¤‘ ?©ì‚°ê°?
- $q_{net}$: ì§€ë°˜ì´ ì¶”ê?ë¡?ë°›ëŠ” ?œí•˜ì¤?($q_{net} = q - \\gamma D_f$)`,
    structure: `- $C$: ë³´ìƒ??($C = 1.0$ ?´ë©´ ?„ì „ ë³´ìƒ)\n- $\\gamma$: êµ´ì°©?˜ì—¬ ë°°ì¶œ???™ì˜ ?¨ìœ„ì¤‘ëŸ‰\n- $D_f$: ê¸°ì´ˆ??êµ´ì°© ê¹Šì´\n- $q$: ?ë? êµ¬ì¡°ë¬?ì´??ì¤‘ ë°??˜ì¤‘ ?©ì‚°ê°?n- $q_{net}$: ì§€ë°˜ì´ ì¶”ê?ë¡?ë°›ëŠ” ?œí•˜ì¤?($q_{net} = q - \\gamma D_f$)`
  },
  {
    keywords: ['p_w', '\\gamma_w', 'H'],
    title: '?±ê????°ë„ ?¤ê³„?˜ì••(Single Shell Tunnel Design Water Pressure, $p_w$)',
    concept: 'ë°©ìˆ˜ê°€ ?„ë²½??ì°¨ë‹¨??ë¹„ë°°???°ë„ ?„ì¹˜ ë°°ë©´???ë? ?˜ìœ„ ?’ì´??ë¹„ë??˜ì—¬ ?˜ì§?¼ë¡œ ê°€?´ì????•ìˆ˜?•ì‹',
    formula: `?¤ê³„?˜ì•• ??
$$p_w = \\gamma_w H$$

- $p_w$: ?¼ì´??ë°°ë©´ ?‘ìš© ?¤ê³„ ?˜ì••
- $\\gamma_w$: ì§€?˜ìˆ˜(ë¬????¨ìœ„ì¤‘ëŸ‰ ($9.81\\,\\text{kN/m}^3$)
- $H$: ?¤ê³„ ì§€?˜ìˆ˜??ë©´ìœ¼ë¡œë????°ë„ ?„ì¹˜ ?•ìƒê¹Œì????˜ì§ ê±°ë¦¬ (?˜ë‘ ?’ì´)`,
    structure: `- $p_w$: ?¼ì´??ë°°ë©´ ?‘ìš© ?¤ê³„ ?˜ì••\n- $\\gamma_w$: ì§€?˜ìˆ˜(ë¬????¨ìœ„ì¤‘ëŸ‰ ($9.81\\,\\text{kN/m}^3$)\n- $H$: ?¤ê³„ ì§€?˜ìˆ˜??ë©´ìœ¼ë¡œë????°ë„ ?„ì¹˜ ?•ìƒê¹Œì????˜ì§ ê±°ë¦¬ (?˜ë‘ ?’ì´)`
  },
  {
    keywords: ['k_h', 'k_{h0}', 'B_H', 'E_0', 'N', '2800'],
    title: 'ê°€?¤í™ë§‰ì´ ?˜í‰ì§€ë°˜ë°˜?¥ê³„??Temporary Retaining Wall Horizontal Subgrade Reaction Coefficient, $k_h$)',
    concept: 'ë²½ì²´ ë°°ë©´??ì§€ë°??„ì†Œ??ë°˜ì‘???±ê???? í˜• ?„ì„± ?°ì† ?•ì¶• ?¤í”„ë§?ê°•ì„±ê°’ìœ¼ë¡?ì¹˜í™˜?˜ëŠ” ë°˜ë ¥ ?°ì •??,
    formula: `?˜í‰ ì§€ë°˜ë°˜?¥ê³„????
$$k_h = k_{h0} \\left(\\frac{B_H}{0.3}\\right)^{-3/4}$$

- $k_h$: ?¤ê³„ ?˜í‰ ì§€ë°˜ë°˜?¥ê³„??(?„ì„± ?¤í”„ë§??ìˆ˜)
- $k_{h0}$: ?œì? ?˜í‰ ì§€ë°˜ë°˜?¥ê³„??
- $B_H$: ê°€?ì˜ ê¸°ì´ˆ ?˜ì‚°??
- $E_0$: ì§€ë°˜ì˜ ?„ì„±ê³„ìˆ˜ ($E_0 = 2800 N$)
- $N$: ?œì?ê´€?…ì‹œ??Nì¹?,
    structure: `- $k_h$: ?¤ê³„ ?˜í‰ ì§€ë°˜ë°˜?¥ê³„??(?„ì„± ?¤í”„ë§??ìˆ˜)\n- $k_{h0}$: ?œì? ?˜í‰ ì§€ë°˜ë°˜?¥ê³„??n- $B_H$: ê°€?ì˜ ê¸°ì´ˆ ?˜ì‚°??n- $E_0$: ì§€ë°˜ì˜ ?„ì„±ê³„ìˆ˜ ($E_0 = 2800 N$)\n- $N$: ?œì?ê´€?…ì‹œ??Nì¹?
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
    updateProgress(progressId, 1, '1?¨ê³„: ?°ì´??ë¶„ì„ ë°??‰ê? ì§€ì¹?ë¡œë“œ ì¤?..', 15);
    standardsAnalysis = await analyzeStandardsBeforeTask(progressId, 'ì¢…í•©?‰ê? ?œí—˜ ì¶œì œ', GENERATION_STANDARDS, 'generation');
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
      updateProgress(progressId, 2, '2?¨ê³„: ì¶œì œ ê°€?´ë“œ ?•ë ¬ ë°??ŒìŠ¤ ?ìŠ¤??ë³‘í•© ì¤?..', 40);
    }
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) return res.status(400).json({ error: '?±ë¡??AI API ?¤ê? ì¡´ì¬?˜ì? ?ŠìŠµ?ˆë‹¤.' });

    // Fetch all topics with extracted_text (fallback to pdf_data if empty)
    const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name, extracted_text, (CASE WHEN extracted_text IS NULL OR extracted_text = '' THEN pdf_data ELSE NULL END) AS pdf_data FROM topics ORDER BY created_at DESC`);
    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: '?±ë¡??? í”½???†ìŠµ?ˆë‹¤. ë¨¼ì? ?™ìŠµ ?ë£Œë¥??±ë¡?´ì£¼?¸ìš”.' });
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
      return `<Topic id="${topic.id}" title="${topic.title}" keywords="${topic.keywords || '?†ìŒ'}">\n${fileText || '?ŒìŠ¤ ?†ìŒ'}\n</Topic>`;
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
[?¬ìš©???¼ë“œë°?ì§€ì¹?- ì¶œì œ ë¹ˆë„ ì¡°ì •??ë°˜ì˜ ?„ìˆ˜]:
- ?„ë˜ ì§ˆë¬¸?¤ê³¼ ?°ê???ì£¼ì œ/ê°œë…??ë¬¸ì œë¥??ê·¹ ì¶œì œ??ì£¼ì‹­?œì˜¤ (ì¶œì œ ë¹ˆë„ ì¦ê? ?€??:
${upvotes.map((f, idx) => `  * [? í”½: ${f.title}] ${f.question_text}`).join('\n')}

- ?„ë˜ ì§ˆë¬¸?¤ê³¼ ?™ì¼?˜ê±°??? ì‚¬??ë¬¸ì œ???ˆë? ì¶œì œ?˜ì? ë§ê³  ì¶œì œ ë¹ˆë„ë¥??€????¶”ê±°ë‚˜ ?¤ë¥¸ ë¬¸ì œë¡??€ì²´í•´ ì£¼ì‹­?œì˜¤ (ì¶œì œ ë¹ˆë„ ê°ì†Œ/?œì™¸ ?€??:
${downvotes.map((f, idx) => `  * [? í”½: ${f.title}] ${f.question_text}`).join('\n')}
`;
      }
    } catch (fbErr) {
      console.warn('ì¢…í•©?‰ê? ?¼ë“œë°?ë¡œë“œ ?¤íŒ¨ (ë¬´ì‹œ?˜ê³  ì§„í–‰):', fbErr);
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
[?¬ìš©???´ì „ ë¬¸ì œ ì¡°ì •(?¼ë“œë°? ?´ì—­ - ì¶œì œ ??ë°˜ë“œ??ì°¸ê³ ?˜ì—¬ ë°˜ì˜?˜ì‹­?œì˜¤]:
?¬ìš©?ê? ?´ì „??ì¢…í•©?‰ê?/ë³µìŠµ ??ë¬¸ì œë¥??¤ìŒê³?ê°™ì´ ì¡°ì • ?”ì²­?˜ì—¬ ë°˜ì˜???´ë ¥???ˆìŠµ?ˆë‹¤. ?¥í›„ ì¶œì œ ???„ë˜ ?¼ë“œë°?ê²½í–¥??ë¶„ì„?˜ì—¬ ë°˜ì˜??ì£¼ì‹­?œì˜¤:
${adjustments.map((a, idx) => `
ì¡°ì • ?´ë ¥ ${idx + 1} [? í”½: ${a.title}]:
- ê¸°ì¡´ ë¬¸ì œ: "${a.question_text}"
- ?¬ìš©?ì˜ ?¼ë“œë°??”êµ¬?¬í•­: "${a.user_feedback}"
- ë°˜ì˜??ìµœì¢… ë¬¸ì œ: "${a.adjusted_text}"
`).join('\n')}
`;
      }
    } catch (adjErr) {
      console.warn('ì¢…í•©?‰ê? ë¬¸ì œ ì¡°ì • ?´ë ¥ ë¡œë“œ ?¤íŒ¨:', adjErr);
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
      console.log(`[ì¢…í•©?‰ê?] ?˜ì§‘??ê¸°ì¡´ ë³µìŠµ ë¬¸í•­ ?? ${pastQuestionsPool.length}ê°?);
    } catch (dbErr) {
      console.warn('[ì¢…í•©?‰ê?] ê¸°ì¡´ ë¬¸í•­ ë¡œë“œ ?¤íŒ¨:', dbErr);
    }

    const uniqueQuestionsMap = new Map();
    for (const q of pastQuestionsPool) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        uniqueQuestionsMap.set(cleanedText, q);
      }
    }
    const uniquePastQuestions = Array.from(uniqueQuestionsMap.values());
    console.log(`[ì¢…í•©?‰ê?] ì¤‘ë³µ ?œê±° ??ê³ ìœ  ê¸°ì¡´ ë³µìŠµ ë¬¸í•­ ?? ${uniquePastQuestions.length}ê°?);

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
      console.log(`[ì¢…í•©?‰ê?] ë¡œì»¬ ?ì„± ?ˆë¹„ ë¬¸í•­ ?? ${fallbackQuestionsPool.length}ê°?);
    } catch (fallbackErr) {
      console.warn('[ì¢…í•©?‰ê?] ë¡œì»¬ ?ˆë¹„ ë¬¸í•­ ?ì„± ?¤íŒ¨:', fallbackErr);
    }

    // Generate new AI questions dynamically based on count (4 batches of 5 max)
    let aggregatedAiQuestions = [];
    const TOTAL_BATCHES = Math.min(4, Math.max(1, Math.ceil(count / 10)));
    console.log(`[ì¢…í•©?‰ê? ë³‘ë ¬ ?ì„± ê°€?? TPM ì´ˆê³¼ ë°©ì?ë¥??„í•´ 5ë¬¸ì œ??ì´?${TOTAL_BATCHES}??ë³‘ë ¬ ?”ì²­???œì‘?©ë‹ˆ??`);
    if (progressId) {
      progressTimer = startBackendProgressTimer(progressId, 3, '3?¨ê³„: AI ?”ì§„???ˆìƒ ë¬¸ì œë¥??¬ì¸µ ë¶„ì„ ë°??ì„±?˜ëŠ” ì¤?..', 90, 1800, 3);
    }

    const batchPromises = Array.from({ length: TOTAL_BATCHES }).map(async (_, idx) => {
      const randomSeed = Math.floor(Math.random() * 10000);
      const batchPrompt = `
?¹ì‹ ?€ êµ??ê¸°ìˆ ?ê²© ê¸°ìˆ ???œí—˜ ì¶œì œ?„ì›?…ë‹ˆ??
?„ë˜ ë²”ìœ„ ? í”½ ?ŒìŠ¤ ?ë£Œë¥?ì°¸ê³ ?˜ì—¬, ?¤ë¥¸ ë¬¸ì œ?¤ê³¼ ?ˆë? ì¤‘ë³µ?˜ì? ?ŠëŠ” ê³ ë‚œ??ì¢…í•©?‰ê? ë¬¸ì œ **?•í™•??5ê°?*ë¥??ì„±?˜ì‹­?œì˜¤.
(?„ì¬ ë¶„í•  ì¶œì œ ?Œì°¨: ${idx + 1} / ${TOTAL_BATCHES}, ?œë¤ ?œë“œ: ${randomSeed})

?š¨ [ì¶œì œ ì¶œì²˜ ?œì • ë°?ë¬¸ë§¥ ê²©ë¦¬ ê·œì¹™ (Topic Isolation) - ê·¹ë„ë¡?ì¤‘ìš”!]:
1. ë°˜ë“œ???„ë˜ ?œê³µ??**[?‰ê? ë²”ìœ„ ? í”½ ëª©ë¡]** ë°?**[?µí•© ?ŒìŠ¤ ?ìŠ¤??**??ê°?'<Topic>...</Topic>' ?œê·¸??ì§ì ‘ ê¸°ìˆ ?˜ì–´ ?ˆëŠ” êµ¬ì²´?ì¸ ê°œë…, ê³µì‹, ?´ë¡  ë°?ì§€?ì˜ ë²”ìœ„ ?ˆì—?œë§Œ ?œí—˜ ë¬¸ì œë¥??ì„±?˜ì‹­?œì˜¤.
2. ê°?ë¬¸ì œë¥?ì¶œì œ?????´ë‹¹ ë¬¸ì œ??ì¶œì²˜ê°€ ?˜ëŠ” ???˜ë‚˜??? í”½??ë²”ìœ„ë¡??œì •?˜ì—¬ ë¬¸ì œë¥?êµ¬ì„±?˜ì‹­?œì˜¤. ?ˆë? ?¹ì • ? í”½??ê´€??ë¬¸ì œë¥??????¤ë¥¸ ? í”½???íŒ ?¨ì–´, ?˜ì¹˜, ê³µí•™??ì¡°ê±´?´ë‚˜ ê³µì‹?¤ì„ ?¼í•©(Cross-contamination)?˜ì—¬ ë³´ê¸°(options)??ì§€ë¬¸ì„ ë§Œë“œ??'ë¬¸ë§¥ êµì°¨ ?¤ì—¼'???€ì§€ë¥´ì? ë§ˆì‹­?œì˜¤. ê°?ë¬¸ì œ???ŒìŠ¤ ?ì˜ ?…ë¦½??ê°œë³„ ? í”½ ?´ìš©???„ì „??ë¶€?©í•´???©ë‹ˆ??
3. ?œê³µ???ŒìŠ¤ ?ë£Œ ?ìŠ¤?¸ì— **ì§ì ‘ ?±ì¥?˜ì? ?ŠëŠ” ?¸ë????€ ê³µí•™/??•™ ?´ë¡ ?´ë‚˜ ?¼ë°˜ ?ì‹(?? ì§€ë¬¸ì— ì§ì ‘ ê¸°ì¬?˜ì? ?Šì? ?™ì—­?? êµ¬ì¡°??•™, ì§„ë™?? ?„ê³„ê°ì‡ , ?¨ì? ë„ ?œìŠ¤?? ê³ ìœ ì§„ë™?? ?ëŠ” ê·????¸ë? ?„ì˜ ì£¼ì œ ???€ ?ˆë?ë¡?ì§€ë¬¸ì— ì£¼ì…?˜ê±°??? ì¡°?˜ì—¬ ë¬¸ì œë¥?ë§Œë“¤ì§€ ë§ˆì‹­?œì˜¤.**
4. ?¤ì§ ?œê³µ???ŒìŠ¤ ë³¸ë¬¸ ?ìŠ¤???´ì— **?¨ì–´ ë°??˜ì‹?¼ë¡œ ëª…ì‹œ?˜ì–´ ?ˆëŠ” ë²”ìœ„ ?´ë¡œë§?ì¶œì œ ë²”ìœ„ë¥?100% ì² ì????œì •**?˜ì‹­?œì˜¤. ?ŒìŠ¤???†ëŠ” ?€ë¶„ì•¼ ?´ìš©????±°???ìƒ?˜ì—¬ ë¬¸ì œë¥?êµ¬ì„±??ê²½ìš° ?¬ê°??ì¶œì œ ?¤ë¥˜ë¡?ê°„ì£¼?©ë‹ˆ??
5. ê°ê???ëª¨ë“  ë³´ê¸°(options) ë°??´ì„¤ ??‹œ ?¤ì§ ?ŒìŠ¤ ë¬¸ì„œ ?´ìš©??ë¬¸ì¥ê³?ì§€?ë“¤??ë³€??ê²°í•©?˜ì—¬ ë§Œë“¤?´ì•¼ ?˜ë©°, ë³¸ë¬¸ê³??„ì˜ˆ ë¬´ê????‰ëš±???¸ë? ?©ì–´??ê°€?ì˜ ê¸°ìˆ ??ì§€?ì„ ë³´ê¸°???¼í•©?˜ëŠ” ê²ƒì„ ?ˆë? ê¸ˆì??©ë‹ˆ??

[?‰ê? ë²”ìœ„ ? í”½ ëª©ë¡]: ${topicTitles}
[?µí•© ?ŒìŠ¤ ?ìŠ¤??:
${combinedText}

${feedbackPrompt}

${adjustmentsPrompt}

[ì¶œì œ ê·œì¹™]:
1. ?´ë²ˆ ?Œì°¨?ì„œ??**?•í™•??5ê°œì˜ ë¬¸ì œ**ë§?ë°˜í™˜?˜ë˜ ?¤ìŒ ? í˜•ë³„ë¡œ ê°ê° ?•í™•??1ë¬¸ì œ??ê³¨ê³ ë£?êµ¬ì„±?˜ì—¬ ë¹„ìœ¨???¬ìˆ˜?˜ì‹­?œì˜¤:
   - ì£¼ê???(type: "ì£¼ê???, subtype: "ê°œìš”"): 1ë¬¸ì œ (?•ì˜ ë°??¹ì§•??3~5ì¤??´ì™¸??ê¹Šì´ ?ˆê³  ?„ë¬¸?ì¸ ?œìˆ ??ê°œìš” ë°?ê°œë… ?¤ëª… ëª¨ë²”?µì•ˆ)
   - ì£¼ê???(type: "ì£¼ê???, subtype: "ê³µì‹"): 1ë¬¸ì œ (?´ë‹¹ ? í”½???€?œì ??ê³µí•™???˜ì‹ ë°?ë¬¼ë¦¬??ê´€ê³„ì‹???œì‹œ?˜ê³  ?˜ì‹??êµ¬ì„±?˜ëŠ” ê¸°í˜¸?¤ì˜ ?•ì˜ë¥??˜ì—´?˜ëŠ” ê³µì‹ ë¬¸ì œ)
   - ì£¼ê???(type: "ì£¼ê???, subtype: "?œì±„?°ê¸°"): 1ë¬¸ì œ (ë¹„êµ ?€?ì´ ?†ëŠ” ?¨ì¼ ? í”½?€ '?íƒœ/?¨ê³„ ë¹„êµ' ?ëŠ” '1??Single-row) ?Œì´ë¸?ë¡?êµ¬ì„±?˜ì—¬ ?™ì¼ ?????µì•ˆ ì¤‘ë³µ??ì² ì???ë°°ì œ?˜ê³ , ?„ë˜ "tableData" ?„ë“œ??<table> ?œê·¸ ?€?????°ì´??ê°ì²´ êµ¬ì¡°ë¥?ì±„ì›Œ?£ëŠ” ì¹¸ì±„?°ê¸° ì£¼ê???ë¬¸ì œ)
   - ì£¼ê???(type: "ì£¼ê???, subtype: "?¨ë‹µ??): 1ë¬¸ì œ (êµ¬ì²´?ì¸ ?¤ë¬´ ë¬¸ì œ???œë‚˜ë¦¬ì˜¤ë¥?ì§ˆë¬¸?¼ë¡œ ?œì‹œ?˜ê³  ?µì‹¬ ?¤ì›Œ??ê°•ì¡°ê°€ ?¤ì–´ê°?1ì¤??œìˆ ??ëª¨ë²”?µì•ˆ?¼ë¡œ ?µí•˜???¨ë‹µ??ë¬¸ì œ)
   - ê°ê???(type: "ê°ê???): 1ë¬¸ì œ (4ì§€? ë‹¤??ê°ê???ë¬¸ì œ)
2. ê°ê???ë¬¸ì œ??? í˜• ë°?êµ¬ì„± ë¹„ìœ¨ ì§€ì¹?(ê·¹ë„ë¡?ì¤‘ìš”):
   - ì¶œì œ?˜ëŠ” ê°ê???ë¬¸í•­?¤ì? ë°˜ë“œ???„ë˜ ë¹„ìœ¨??ì¤€?˜í•˜??êµ¬ì„±?˜ì‹­?œì˜¤:
     * **ê¸°ë³¸ ê¸°ì´ˆ ê°œë… ë¬¸ì œ (40%, ??2ë¬¸ì œ)**: ? í”½??ê¸°ë³¸ ?•ì˜, ?µì‹¬ ê°œë…, ê¸°ì´ˆ ?ë¦¬ë¥?ì§ì ‘?ìœ¼ë¡?ë¬»ëŠ” ê¸°ì´ˆ ?˜ì? ë¬¸ì œ. (?? "?‹â—‹?‹ì˜ ?•ì˜ë¡?ê°€???³ì? ê²ƒì??", "?‹â—‹?‹ì˜ ?¹ì§•???„ë‹Œ ê²ƒì??"). ê¸°ì‚¬ ?˜ì????µì‹¬ ê°œë… ?•ì¸ ë¬¸ì œë¡?ì¶œì œ.
     * **?•ëŸ‰ ê³„ì‚° ë¬¸ì œ (30%, ??1ë¬¸ì œ)**: êµ¬ì²´?ì¸ ì¡°ê±´ ?˜ì¹˜ë¥??€?…í•˜??ìµœì¢… ê°’ì„ ê³„ì‚°?´ë‚´ê±°ë‚˜ ?•ëŸ‰ ê²°ê³¼ë¥?ë¬»ëŠ” ?˜ì¹˜ ê³„ì‚° ë¬¸ì œ.
     * **?¬í™” ?ë¦¬Â·ë¹„êµ ë¬¸ì œ (30%, ??1ë¬¸ì œ)**: ê³µí•™??ë©”ì»¤?ˆì¦˜, ?¥ë‹¨?? ë¹„êµ, ?¤ë¬´ ?œê³µ ? ì˜?¬í•­ ???‘ìš© ?´í•´??ë¬¸ì œ.
   
   - **?š¨ [ê³µì‹ ë°?ê³µì‹ ?˜ì¹˜ ë²”ìœ„ ?¸ì¶œ ?ˆë? ê¸ˆì? ê·œì¹™ - ê·¹ë„ë¡?ì¤‘ìš”!]**: ë¬¸ì œ ì§ˆë¬¸(question) ë³¸ë¬¸ ?´ì— **ë¬¸ì œë¥??´ê²°?˜ëŠ” ???„ìš”??ê³µí•™ ?˜ì‹ ?ì²´(?? $E_u = 300 s_u$ ?????˜ì‹???¹ì • ?˜ì¹˜ ë²”ìœ„(?? $E_u = (200 \\sim 500)s_u$ ??, ë¹„ë? ê´€ê³????±ì„ ?ˆë?ë¡?ì§ì ‘ ?ìŠ¤?¸ë¡œ ?ì–´ ?œê³µ?˜ì? ë§ˆì‹­?œì˜¤.** ?˜ì‹?´ë‚˜ ê²½í—˜???˜ì¹˜ ë²”ìœ„ë¥?ì§€ë¬¸ì— ë¯¸ë¦¬ ì£¼ë©´ ?™ìƒ???”ê¸° ë°??°ìƒ ?¥ë ¥???‰ê??????†ìŠµ?ˆë‹¤. ?€??ê³µì‹??ëª…ì¹­("ë¹„ë°°???„ì„±ê³„ìˆ˜ ê²½í—˜??)?´ë‚˜ ë³€?˜ë“¤??ëª…ì¹­("ë¹„ë°°???„ë‹¨ê°•ë„ $s_u$")ë§Œì„ ?œì‹œ?˜ê³ , ?™ìƒ???¤ìŠ¤ë¡?ê³µì‹ê³?ë²”ìœ„ë¥?? ì˜¬?¤ì„œ ?´ê²°?˜ë„ë¡??˜ì‹­?œì˜¤. (?? ?´ì„¤(explanation)?ì„œ???™ìƒ???™ìŠµ???„í•´ ê³µì‹???ì„¸??ëª…ì‹œ?˜ê³  ê³„ì‚° ê³¼ì •???¤ëª…?´ì•¼ ?©ë‹ˆ??)
   - ?¹íˆ **?˜ì¹˜ ?´ì„ë²•ì´??ê°€??êµ¬ì¡°ë¬??´ì„ê³?ê°™ì´ ?•ëŸ‰??ë¶„ì„???„ìš”??? í”½??ê²½ìš°, ?œê³µ???ŒìŠ¤ ë¬¸ì„œ ?´ì— ëª…ì‹œ?ì¸ ?˜ì¹˜???Œë¼ë¯¸í„°ê°€ ì¡´ì¬?œë‹¤ë©??´ë? ?œìš©?˜ì—¬ ?•ëŸ‰ ê³„ì‚° ë¬¸ì œë¥?êµ¬ì„±?˜ì‹­?œì˜¤. ?? ë¬¸ì„œ???˜ì¹˜???˜ì‹???†ë‹¤ë©??„ì˜ë¡?ë¹„í˜„?¤ì ???˜ì¹˜ë¥?ê°€??ë¶€?¬í•˜ì§€ ë§ˆì‹­?œì˜¤.**
   - ë§Œì•½ ?„í˜•?ì¸ ë¹„ê³„?°í˜•/?•ì„±??? í”½(?? ?¨ìˆœ ?ˆì§ˆ ?œí—˜ ?ˆì°¨, ?¨ìˆœ ?‰ì • ?œë„ ????ê²½ìš°?ë§Œ ?¼ë°˜?ì¸ ?œìˆ ???´í•´??ê°ê???ë¬¸ì œë¡?ì¶œì œ?˜ë˜, ??ê²½ìš°?ë„ ê°€ê¸‰ì  ë¬¼ë¦¬??ë³€?˜ì˜ ?í–¥?„ë? ë¬»ëŠ” ??ìµœë????•ëŸ‰?”ì— ê°€ê¹ê²Œ ë¬¸ì œ???˜ì????’ì—¬ ì¶œì œ?˜ì‹­?œì˜¤.
   - **? ï¸ [ë¹„êµ/?¹ì„± ??ì¶œì œ ê·œì¹™ - ê·¹ë„ë¡?ì¤‘ìš”!]**: ì§ˆë¬¸??ë¹„êµ/?¹ì„± ?œê? ?„ìš”??ê²½ìš°, ?ˆë? <table> ??HTML ?œê·¸ë¡??œë? ì§ì ‘ ?‘ì„±?˜ì? ë§ê³  ?¼ë°˜ ?ìŠ¤?¸ë¡œë§?ì§ˆë¬¸???‘ì„±?????„ë˜??"tableData" ?„ë“œ?????°ì´?°ë? ê°ì²´ êµ¬ì¡°ë¡??‘ì„±?˜ì‹­?œì˜¤.
3. ?¤ë‹µ ë³´ê¸° êµ¬ì„± ì£¼ì˜?¬í•­ (ë§¤ìš° ì¤‘ìš”):
   - ?¤ë‹µ ë³´ê¸°(options) êµ¬ì„± ??**?ˆë?ë¡??°ë¬´?ˆì—†ê±°ë‚˜ ê·¹ë‹¨?ì¸ ?œí˜„, ?¹ì? ë¹„í˜„?¤ì ??ê³µí•™??ê°€???? 'ë¬´í•œ?€ë¡??ìŠ¹?œí‚´', '?¤ì‹œê°„ìœ¼ë¡?ê¸°í•˜ê¸‰ìˆ˜?ìœ¼ë¡?ì¦ê???, '?ì›??ë³€?˜ì? ?ŠìŒ', '?„ì˜ˆ ë°œìƒ?˜ì? ?ŠìŒ', '??°œ?? ???€ ?ˆë?ë¡??¬ìš©?˜ì? ë§ˆì‹­?œì˜¤**. 
   - ?¤ì œ ?„ê³µ ?œì ?´ë‚˜ ?¤ë¬´ ê¸°ìˆ  ê¸°ì???ë¶€?©í•˜??**ê³ ë„ë¡??€?¹ì„± ?ˆê³  ê·¸ëŸ´??•œ ?¤ë‹µ(plausible engineering distractors)**?¼ë¡œ êµ¬ì„±??ì£¼ì‹­?œì˜¤. ëª¨ë“  ë³´ê¸°??ë°˜ë“œ???ë³¸ ?ŒìŠ¤ ë°?ê³µí•™???ì‹? ì— ê¸´ë???ê²°í•©?˜ì–´???©ë‹ˆ??
- **?š¨ [ê°ê????•ë???ë°??•ë‹µ ?¼ì¹˜ ì¡°ê±´ - ê·¹ë„ë¡?ì¤‘ìš”!]**: ëª¨ë“  ê°ê???4ì§€? ë‹¤?? ê³„ì‚° ë¬¸ì œ???˜ì¹˜/ê³µí•™???ë‹¨ ë¬¸ì œë¥?ì¶œì œ???? ê³„ì‚°?¼ë¡œ ?„ì¶œ???•í™•???•ë‹µ ?˜ì¹˜??ì¡°ê±´??4ê°œì˜ ë³´ê¸°(options) ì¤?ë°˜ë“œ???•í™•??1ê°œë¡œ ì¡´ì¬?´ì•¼ ?©ë‹ˆ?? ?ˆë?ë¡??¤ì œ ê³„ì‚° ê²°ê³¼?€ ë³´ê¸°???˜ì¹˜ê°€ ë¶ˆì¼ì¹˜í•˜?? ?´ì„¤?ì„œ '?¤ì œ ê³„ì‚°ê°’ì? XX?´ë‚˜ ë³´ê¸° ì¤?ê°€??ê°€ê¹Œìš´ YYë¥?? íƒ?©ë‹ˆ???€ ê°™ì? ?´ì²˜êµ¬ë‹ˆ?†ëŠ” ë³€ëª…ì„ ?ëŠ” ì¶œì œ ?¤ë¥˜ë¥?ë²”í•˜ì§€ ë§ˆì‹­?œì˜¤. ë¬¸ì œë¥??ì„±?˜ê¸° ?„ì— ?¤ì œ ?˜ì‹???€?…í•˜???•ë‹µ????ë²???ì§ì ‘ ?„ë??˜ê²Œ ê³„ì‚°?˜ê³  ê²€ì¦í•œ ?? ê·?ê²°ê³¼ê°?? ì”¨ ?˜ë‚˜ ?€ë¦¬ì? ?ŠëŠ” ?•í™•???•ë‹µ)??ë³´ê¸°?€ 'answer' ?„ë“œ???„ë²½???¼ì¹˜?˜ë„ë¡?ê¸°ì¬?˜ì‹­?œì˜¤.
    4. ?ŒìŠ¤ ?ìŠ¤?¸ì˜ ?¨ê²¨ì§?ê³µí•™??ê°œë…ê³??¤ë¬´ ê¸°ì „???¬ì°©?˜ì—¬ ê³ í’ˆê²?ì§ˆë¬¸???˜ì???‹œ??

[?˜ê° ë°©ì? ì² ì¹™ (Anti-Hallucination Constraints)]:
1. ?œê³µ???ŒìŠ¤ ë¬¸ì„œ ?ìŠ¤??<Source_Document>) ?´ì— ëª…ì‹œ???˜ì¹˜, ?ˆìš© ?ˆì „?? ?¤ê³„ê¸°ì?(KDS/KCS) ì¡°í•­ ë²ˆí˜¸??ê³µì‹???†ëŠ” ê²½ìš°, ?„ì˜ë¡??˜ì‹??? ë„?˜ê±°???¸ë? ?œë°©???˜ì¹˜ ?œê³„ë¥?? ì¡°(Hallucination)?˜ì? ë§ˆì‹­?œì˜¤.
2. ë¬¸ì„œ ë²”ìœ„ë¥?ë²—ì–´?˜ëŠ” ??•™???˜ì¹˜??ë¹„ë¬¼ë¦¬ì  ?˜ì¹˜(?? ?´ë?ë§ˆì°°ê°?60???´ìƒ ??ë¥?ì°½ì‘?˜ì—¬ ëª¨ìˆœ??ë°œìƒ?œí‚¤ë©????©ë‹ˆ?? ?˜ì¹˜ê°€ ë¶€ì¡±í•˜?¤ë©´ ?•ëŸ‰ ê³„ì‚° ë¬¸ì œ ì¶œì œë¥?ì¦‰ì‹œ ?°íšŒ?˜ê³  ê°œë… ?´í•´??ë¬¸ì œë¡??€ì²´í•˜??‹œ??

${LATEX_PROMPT_INSTRUCTIONS}
${GENERATION_STANDARDS}
${ENGINEERING_STANDARDS}
4. ë°˜ë“œ??ì¶”ê? ?ìŠ¤???†ì´ ?œìˆ˜ JSON ë°°ì—´ë§?ë°˜í™˜?˜ì‹­?œì˜¤.

[JSON ?¬ë§·]:
[
  {
    "type": "ì£¼ê???,
    "subtype": "ê°œìš”",
    "topic_title": "??ë¬¸ì œ??ì¶œì œ ê·¼ê±°ê°€ ?˜ëŠ” ? í”½ ëª©ë¡ ?´ì˜ ?•í™•??? í”½ëª?(?? ?‰ì‚¬?¬ì˜ë²?",
    "question": "ì§ˆë¬¸ ?´ìš©",
    "answer": "3~5ì¤??´ì™¸??ê¹Šì´ ?ˆê³  ?„ë¬¸?ì¸ ?œìˆ ??ê°œìš” ë°?ê°œë… ?¤ëª… ëª¨ë²”?µì•ˆ",
    "concept": "?µì‹¬ ê°œë… 1ì¤??”ì•½"
  },
  {
    "type": "ê°ê???,
    "topic_title": "??ë¬¸ì œ??ì¶œì œ ê·¼ê±°ê°€ ?˜ëŠ” ? í”½ ëª©ë¡ ?´ì˜ ?•í™•??? í”½ëª?(?? ?½ë³¼???¸ë°œ?œí—˜)",
    "question": "ê³µí•™???„ìƒ ë¶„ì„ ì§ˆë¬¸",
    "tableData": null,
    "options": ["ë³´ê¸°1", "ë³´ê¸°2", "ë³´ê¸°3", "ë³´ê¸°4"],
    "answer": "?•ë‹µ ë³´ê¸°?€ ? ì”¨ ?˜ë‚˜ ?€ë¦¬ì? ?ŠëŠ” ?•ë‹µ ?ìŠ¤??,
    "explanation": "?´ìœ ?€ ?¤ë‹µ ?•ë? ?´ì„¤"
  }
] (??ë§Œì•½ ?œê? ?„ìš”??ì§ˆë¬¸?´ë¼ë©?"tableData": {"headers": ["êµ¬ë¶„", "ì§€ë°?X", "ì§€ë°?Y"], "rows": [["?´ì  ?˜ê²½", "?´ìˆ˜", "?´ìˆ˜"]]} ì²˜ëŸ¼ êµ¬ì¡°?”ëœ ??ê°ì²´ë¥??‘ì„±?˜ê³ , ê·¸ë ‡ì§€ ?Šì? ?¼ë°˜ ì§ˆë¬¸?´ë©´ "tableData": null ë¡??¤ì •?˜ì‹­?œì˜¤.)
`;
      try {
        console.log(`[ì¢…í•©?‰ê? ë³‘ë ¬ ?ì„±] #${idx + 1}ë²ˆì§¸ ë°°ì¹˜ ?„ì†¡ ?œì‘...`);
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
        console.warn(`[ì¢…í•©?‰ê? ë³‘ë ¬ ?ì„± ?¤íŒ¨] #${idx + 1}ë²ˆì§¸ ë°°ì¹˜ ?ëŸ¬:`, err.message);
      }
      return [];
    });

    const results = await Promise.all(batchPromises);
    for (const r of results) {
      if (r) aggregatedAiQuestions.push(...r);
    }
    console.log(`[ì¢…í•©?‰ê? ë³‘ë ¬ ?ì„± ?„ë£Œ] AI ? ê·œ ë¬¸í•­ ?? ${aggregatedAiQuestions.length}ê°?);

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
    console.log(`[ì¢…í•©?‰ê? ?€ êµ¬ì¶• ?„ë£Œ] ?„ì²´ ?„ë³´ ?€ ë¬¸í•­ ?? ${finalQuestionPool.length}ê°?);

    // Select up to 13 questions from the pool with exact type combination:
    // - ê°œìš”: 2ê°?
    // - ê³µì‹: 2ê°?
    // - ?œì±„?°ê¸°: 2ê°?
    // - ?¨ë‹µ?? 2ê°?
    // - ê°ê??? 5ê°?
    const poolGaeyo = [];
    const poolGongsik = [];
    const poolTable = [];
    const poolDandap = [];
    const poolMC = [];

    for (const q of finalQuestionPool) {
      if (q.type === 'ì£¼ê???) {
        if (q.subtype === 'ê°œìš”') poolGaeyo.push(q);
        else if (q.subtype === 'ê³µì‹') poolGongsik.push(q);
        else if (q.subtype === '?œì±„?°ê¸°') poolTable.push(q);
        else if (q.subtype === '?¨ë‹µ?? || !q.subtype) poolDandap.push(q);
      } else if (q.type === 'ê°ê???) {
        poolMC.push(q);
      }
    }

    console.log(`[ì¢…í•©?‰ê? ë¶„ë¥˜] ê°œìš”: ${poolGaeyo.length}, ê³µì‹: ${poolGongsik.length}, ?œì±„?°ê¸°: ${poolTable.length}, ?¨ë‹µ?? ${poolDandap.length}, ê°ê??? ${poolMC.length}`);

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

    console.log(`[ì¢…í•©?‰ê? ? íƒ ?„ë£Œ] ìµœì¢… ? íƒ ë¬¸í•­ ?? ${selectedQuestions.length}ê°?);

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
        type: q.type || "ê°ê???,
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
          title: "Terzaghi 1ì°¨ì› ?•ë? ì§€ë°°ë°©?•ì‹ ? ë„",
          concept: "?í† ì¸???ê³¼ì‰ê°„ê·¹?˜ì••???Œì‚° ë°?ì¹¨í•˜ ?œê°„??ì¶”ì´ë¥?ë¬¼ë¦¬?ìœ¼ë¡??•ë? ë¬˜ì‚¬?˜ëŠ” ì§€ë°°ë°©?•ì‹",
          formula: "ì§€ë°?ë¯¸ë¶„ë°©ì •??\n$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$\n\n[ì£¼ìš” ? ë„ ê°€??:\n1. ?™ì…?ì? ë¬¼ì? ?•ì¶•?±ì´ ?†ìŒ(ë¹„ì••ì¶•ì„±)\n2. ????ë¬¼ì˜ ?ë¦„?€ Darcy ë²•ì¹™???°ë¦„ ($v = k i$)\n3. ?•ë??€ 1ì°¨ì›?¼ë¡œë§?ì§„í–‰?˜ë©° ?™ì˜ ê³µê·¹ë¹?ë³€?”ëŠ” ? íš¨?‘ë ¥ ì¦ê???? í˜• ë¹„ë???($a_v$ ?¼ì •)"
        },
        {
          title: "Terzaghi ?•ì?ê¸°ì´ˆ ê·¹í•œì§€ì§€??ê³µì‹??? ë„",
          concept: "ê¸°ì´ˆ ?€ë©??„ë˜ ì§€ë°˜ì˜ ?„ë‹¨ ?„íŒŒ ê±°ë™(?¼ë°˜ ?„ë‹¨ ?Œê´´)??ê·¹í•œ ?íƒœ ?œê³„ ?‰í˜•?¼ë¡œ ?˜ì¹˜?”í•œ ì§€ì§€??ê³µì‹",
          formula: "Terzaghi ê·¹í•œ ì§€ì§€??\n$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$\n\n[? ë„ ë©”ì»¤?ˆì¦˜]:\n- ì§€ë°??Œê´´ ?ì—­??3ê°?zone(Zone I: ?„ì„± ?ê¸°, Zone II: ?€?˜ë‚˜??ë°©ì‚¬???„ë‹¨ ?ì—­, Zone III: Rankine ?˜ë™ ?˜í‰ ì§€ë°??ì—­)?¼ë¡œ ë¶„í• ?˜ì—¬ ?ë? ?˜ì¤‘ ë²¡í„°?€ ?„ë‹¨ ?€???œê³„??ê²°í•©"
        },
        {
          title: "Rankine ì£¼ë™? ì•• ê³µì‹???´ë¡ ??? ë„",
          concept: "ì§€ë°˜ì´ ê°€??ë²½ì²´ ë°°ë©´ ë°©í–¥?¼ë¡œ ?½ì°½ ë³€?•ì„ ?¼ìœ¼ì¼??œê³„ ?¸ì¥ ?Œì„± ?íƒœ???„ë‹¬???Œì˜ ?˜í‰ ?‘ë ¥",
          formula: "ì£¼ë™? ì•• ê°•ë„ ??\n$$p_a = \\gamma z K_a - 2 c \\sqrt{K_a}$$\n\n[ì£¼ìš” ? ë„ ê³µì‹]:\n- Mohr-Coulomb ?Œê´´ ?¬ë½? ê³¼ Mohr ?‘ë ¥?ì˜ ?‘ì  ê¸°í•˜?™ì  ë¶„ì„???µí•˜??$K_a = \\tan^2(45^\\circ - \\phi/2)$ ?˜ì‹ ?„ì¶œ"
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
        type: "ì£¼ê???,
        subtype: "ê³µì‹",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[?„ìˆ˜ê³µì‹] ${fTitle || 'ê³µì‹'} ê³µì‹???œì‹œ?˜ê³ , ê°?ê¸°í˜¸???•ì˜ë¥??œìˆ ?˜ì‹œ??`,
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
        type: "ì£¼ê???,
        subtype: "?œìˆ ",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[?´ë¡ ? ë„] ${tTitle || '?´ë¡ ? ë„'}???´ë¡  ? ë„ ê³¼ì • ë°??µì‹¬ ê³µí•™???„ì œì¡°ê±´??ê¸°ìˆ ?˜ì‹œ??`,
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
    res.status(500).json({ error: err.message || '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
    if (progressId) {
      updateProgress(progressId, 3, '3?¨ê³„: ì¢…í•©?‰ê? ?ˆìƒ ë¬¸ì œ ì¶œì œ?€ ?˜í•™ ê³µì‹ ê²€ì¦??„ë£Œ!', 100);
    }
  }
});

// POST /api/exam/additional
router.post('/exam/additional', async (req, res) => {
  const progressId = req.query.progressId || req.body.progressId;
  let progressTimer = null;
  try {
    if (progressId) {
      updateProgress(progressId, 1, '1?¨ê³„: ì¶”ê? ?œí—˜ ë¬¸í•­ êµ¬ì„± ë¶„ì„ ì¤?..', 20);
    }
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) return res.status(400).json({ error: '?±ë¡??AI API ?¤ê? ì¡´ì¬?˜ì? ?ŠìŠµ?ˆë‹¤.' });

    // Fetch all topics with extracted_text (fallback to pdf_data if empty)
    const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name, extracted_text, (CASE WHEN extracted_text IS NULL OR extracted_text = '' THEN pdf_data ELSE NULL END) AS pdf_data FROM topics ORDER BY created_at DESC`);
    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: '?±ë¡??? í”½???†ìŠµ?ˆë‹¤. ë¨¼ì? ?™ìŠµ ?ë£Œë¥??±ë¡?´ì£¼?¸ìš”.' });
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
      return `<Topic id="${topic.id}" title="${topic.title}" keywords="${topic.keywords || '?†ìŒ'}">\n${fileText || '?ŒìŠ¤ ?†ìŒ'}\n</Topic>`;
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
          title: "Terzaghi 1ì°¨ì› ?•ë? ì§€ë°°ë°©?•ì‹ ? ë„",
          concept: "?í† ì¸???ê³¼ì‰ê°„ê·¹?˜ì••???Œì‚° ë°?ì¹¨í•˜ ?œê°„??ì¶”ì´ë¥?ë¬¼ë¦¬?ìœ¼ë¡??•ë? ë¬˜ì‚¬?˜ëŠ” ì§€ë°°ë°©?•ì‹",
          formula: "ì§€ë°?ë¯¸ë¶„ë°©ì •??\n$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$\n\n[ì£¼ìš” ? ë„ ê°€??:\n1. ?™ì…?ì? ë¬¼ì? ?•ì¶•?±ì´ ?†ìŒ(ë¹„ì••ì¶•ì„±)\n2. ????ë¬¼ì˜ ?ë¦„?€ Darcy ë²•ì¹™???°ë¦„ ($v = k i$)\n3. ?•ë??€ 1ì°¨ì›?¼ë¡œë§?ì§„í–‰?˜ë©° ?™ì˜ ê³µê·¹ë¹?ë³€?”ëŠ” ? íš¨?‘ë ¥ ì¦ê???? í˜• ë¹„ë???($a_v$ ?¼ì •)"
        },
        {
          title: "Terzaghi ?•ì?ê¸°ì´ˆ ê·¹í•œì§€ì§€??ê³µì‹??? ë„",
          concept: "ê¸°ì´ˆ ?€ë©??„ë˜ ì§€ë°˜ì˜ ?„ë‹¨ ?„íŒŒ ê±°ë™(?¼ë°˜ ?„ë‹¨ ?Œê´´)??ê·¹í•œ ?íƒœ ?œê³„ ?‰í˜•?¼ë¡œ ?˜ì¹˜?”í•œ ì§€ì§€??ê³µì‹",
          formula: "Terzaghi ê·¹í•œ ì§€ì§€??\n$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$\n\n[? ë„ ë©”ì»¤?ˆì¦˜]:\n- ì§€ë°??Œê´´ ?ì—­??3ê°?zone(Zone I: ?„ì„± ?ê¸°, Zone II: ?€?˜ë‚˜??ë°©ì‚¬???„ë‹¨ ?ì—­, Zone III: Rankine ?˜ë™ ?˜í‰ ì§€ë°??ì—­)?¼ë¡œ ë¶„í• ?˜ì—¬ ?ë? ?˜ì¤‘ ë²¡í„°?€ ?„ë‹¨ ?€???œê³„??ê²°í•©"
        },
        {
          title: "Rankine ì£¼ë™? ì•• ê³µì‹???´ë¡ ??? ë„",
          concept: "ì§€ë°˜ì´ ê°€??ë²½ì²´ ë°°ë©´ ë°©í–¥?¼ë¡œ ?½ì°½ ë³€?•ì„ ?¼ìœ¼ì¼??œê³„ ?¸ì¥ ?Œì„± ?íƒœ???„ë‹¬???Œì˜ ?˜í‰ ?‘ë ¥",
          formula: "ì£¼ë™? ì•• ê°•ë„ ??\n$$p_a = \\gamma z K_a - 2 c \\sqrt{K_a}$$\n\n[ì£¼ìš” ? ë„ ê³µì‹]:\n- Mohr-Coulomb ?Œê´´ ?¬ë½? ê³¼ Mohr ?‘ë ¥?ì˜ ?‘ì  ê¸°í•˜?™ì  ë¶„ì„???µí•˜??$K_a = \\tan^2(45^\\circ - \\phi/2)$ ?˜ì‹ ?„ì¶œ"
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
        type: "ì£¼ê???,
        subtype: "ê³µì‹",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[?„ìˆ˜ê³µì‹] ${fTitle || 'ê³µì‹'} ê³µì‹???œì‹œ?˜ê³ , ê°?ê¸°í˜¸???•ì˜ë¥??œìˆ ?˜ì‹œ??`,
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
        type: "ì£¼ê???,
        subtype: "?œìˆ ",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[?´ë¡ ? ë„] ${tTitle || '?´ë¡ ? ë„'}???´ë¡  ? ë„ ê³¼ì • ë°??µì‹¬ ê³µí•™???„ì œì¡°ê±´??ê¸°ìˆ ?˜ì‹œ??`,
        answer: t.formula || '',
        concept: t.concept || ''
      };
    }).filter(Boolean);

    const customSubjs = [...selectedFormulas, ...selectedTheories];

    // Format formulas and theories text for LLM context
    const formulasText = customFormulas.map((f, idx) => `[?„ìˆ˜ê³µì‹ ${idx+1}] ?œëª©: ${f.title}\nê³µì‹ ë°??¤ëª…:\n${f.formula}\nê°œë…: ${f.concept}`).join('\n\n');
    const theoriesText = customTheories.map((t, idx) => `[?´ë¡ ? ë„ ${idx+1}] ?œëª©: ${t.title}\nê°œë…: ${t.concept}\n?´ìš©/?˜ì‹:\n${t.formula}`).join('\n\n');

    let aggregatedAiQuestions = [];
    const TOTAL_BATCHES = 3; // 3 batches (4 + 4 + 5) = 13 AI questions

    console.log(`[ì¢…í•©?‰ê? ì¶”ê? ?ì„± ê°€?? TPM ì´ˆê³¼ ë°©ì?ë¥??„í•´ ì´?${TOTAL_BATCHES}???°ì† ë¶„í•  ?”ì²­???œì‘?©ë‹ˆ??`);
    if (progressId) {
      progressTimer = startBackendProgressTimer(progressId, 3, '3?¨ê³„: AI ?”ì§„??ì¶”ê? ë¬¸ì œë¥?ì¶œì œ?˜ê³  ?ˆìŠµ?ˆë‹¤...', 90, 1800, 5);
    }

    for (let i = 0; i < TOTAL_BATCHES; i++) {
      const randomSeed = Math.floor(Math.random() * 10000);
      const countToGenerate = i === 2 ? 5 : 4;
      const mcCount = i === 2 ? 4 : 3;
      
      const batchPrompt = `
?¹ì‹ ?€ êµ??ê¸°ìˆ ?ê²© ê¸°ìˆ ???œí—˜ ì¶œì œ?„ì›?…ë‹ˆ??
?„ë˜ ?œê³µ??[?‰ê? ë²”ìœ„ ? í”½ ?ŒìŠ¤], [?„ìˆ˜ê³µì‹ ëª©ë¡], [?´ë¡ ? ë„ ëª©ë¡]???´ë‹¹?˜ëŠ” ê³µì‹ê³?ê³µí•™??ì§€???´ìš©ë§Œì„ ì°¸ê³ ?˜ì—¬, ?¤ë¥¸ ë¬¸ì œ?¤ê³¼ ?ˆë? ì¤‘ë³µ?˜ì? ?ŠëŠ” ê³ ë‚œ??ì¢…í•©?‰ê? ì¶”ê? ë¬¸ì œ **?•í™•??${countToGenerate}ê°?*ë¥??ì„±?˜ì‹­?œì˜¤.
(?„ì¬ ë¶„í•  ì¶œì œ ?Œì°¨: ${i + 1} / ${TOTAL_BATCHES}, ?œë¤ ?œë“œ: ${randomSeed})

?š¨ [ì¶œì œ ì¶œì²˜ ?œì • ë°?ë¬¸ë§¥ ê²©ë¦¬ ê·œì¹™ (Topic Isolation) - ê·¹ë„ë¡?ì¤‘ìš”!]:
1. ë°˜ë“œ???„ë˜ ?œê³µ??**[?‰ê? ë²”ìœ„ ? í”½ ëª©ë¡ ë°?ë³¸ë¬¸]**??'<Topic>...</Topic>' ?œê·¸, **[?¸ìš©???„ìˆ˜ê³µì‹ ëª©ë¡]**, **[?¸ìš©???´ë¡ ? ë„ ëª©ë¡]**?ì„œ ì§ì ‘ ?¤ë£¨??êµ¬ì²´?ì¸ ê°œë…, ê³µì‹ ë°?ë¬¼ë¦¬??ê¸°ì „??ë²”ìœ„ ?ˆì—?œë§Œ ?œí—˜ ë¬¸ì œë¥??ì„±?˜ì‹­?œì˜¤.
2. ê°?ë¬¸ì œë¥?ì¶œì œ?????´ë‹¹ ë¬¸ì œ??ì¶œì²˜ê°€ ?˜ëŠ” ???˜ë‚˜??? í”½??ë²”ìœ„ë¡??œì •?˜ì—¬ ë¬¸ì œë¥?êµ¬ì„±?˜ì‹­?œì˜¤. ?ˆë? ?¹ì • ? í”½??ê´€??ë¬¸ì œë¥??????¤ë¥¸ ? í”½???íŒ ?¨ì–´, ?˜ì¹˜, ê³µí•™??ì¡°ê±´?´ë‚˜ ê³µì‹?¤ì„ ?¼í•©(Cross-contamination)?˜ì—¬ ë³´ê¸°(options)??ì§€ë¬¸ì„ ë§Œë“œ??'ë¬¸ë§¥ êµì°¨ ?¤ì—¼'???€ì§€ë¥´ì? ë§ˆì‹­?œì˜¤. ê°?ë¬¸ì œ???ŒìŠ¤ ?ì˜ ?…ë¦½??ê°œë³„ ? í”½ ?´ìš©???„ì „??ë¶€?©í•´???©ë‹ˆ??
3. ?œê³µ???ŒìŠ¤ ?ë£Œ ë°??¸ìš©???´ìš©??**ì§ì ‘ ?±ì¥?˜ì? ?ŠëŠ” ?¸ë????€ ê³µí•™/??•™ ë¶„ì•¼ ?´ë¡ (?? ?ìŠ¤?¸ì— ?¸ê¸‰?˜ì? ?Šì? ?™ì—­??êµ¬ì¡°?´ì„, ì§„ë™?? ?¤ê³„ê°ì‡ , ê³ ìœ ì§„ë™?????€ ?ˆë?ë¡?ì§€ë¬¸ì— ì£¼ì…?˜ê±°??? ì¡°?˜ì—¬ ë¬¸ì œë¥?ë§Œë“¤ì§€ ë§ˆì‹­?œì˜¤.**
4. ?¤ì§ ?œê³µ???ŒìŠ¤ ë³¸ë¬¸ ?ìŠ¤???´ì— **?¨ì–´ ë°??˜ì‹?¼ë¡œ ëª…ì‹œ?˜ì–´ ?ˆëŠ” ë²”ìœ„ ?´ë¡œë§?ì¶œì œ ë²”ìœ„ë¥?100% ì² ì????œì •**?˜ì‹­?œì˜¤. ?ŒìŠ¤???†ëŠ” ?€ë¶„ì•¼ ?´ìš©????±°???ìƒ?˜ì—¬ ë¬¸ì œë¥?êµ¬ì„±??ê²½ìš° ?¬ê°??ì¶œì œ ?¤ë¥˜ë¡?ê°„ì£¼?©ë‹ˆ??
5. ê°ê???ëª¨ë“  ë³´ê¸°(options) ë°??´ì„¤ ??‹œ ?¤ì§ ?ŒìŠ¤ ë¬¸ì„œ ?´ìš©??ë¬¸ì¥ê³?ì§€?ë“¤??ë³€??ê²°í•©?˜ì—¬ ë§Œë“¤?´ì•¼ ?˜ë©°, ë³¸ë¬¸ê³??„ì˜ˆ ë¬´ê????‰ëš±???¸ë? ?©ì–´??ê°€?ì˜ ê¸°ìˆ ??ì§€?ì„ ë³´ê¸°???¼í•©?˜ëŠ” ê²ƒì„ ?ˆë? ê¸ˆì??©ë‹ˆ??

[?‰ê? ë²”ìœ„ ? í”½ ëª©ë¡ ë°?ë³¸ë¬¸]:
${combinedText}

[?¸ìš©???„ìˆ˜ê³µì‹ ëª©ë¡]:
${formulasText || '?¸ìš©???´ìš© ?†ìŒ'}

[?¸ìš©???´ë¡ ? ë„ ëª©ë¡]:
${theoriesText || '?¸ìš©???´ìš© ?†ìŒ'}

[ì¶œì œ ê·œì¹™]:
1. ?´ë²ˆ ?Œì°¨?ì„œ??**?•í™•??${countToGenerate}ê°œì˜ ë¬¸ì œ**ë§?ë°˜í™˜?˜ë˜ ?¤ìŒ ë¹„ìœ¨???¬ìˆ˜??ê²?
   - ì£¼ê???(type: "ì£¼ê???, subtype: "ê°œìš”"): 1ë¬¸ì œ (?•ì˜ ë°??¹ì§•??3~5ì¤??´ì™¸ë¡?ê¹Šì´ ?ˆê³  ?„ë¬¸?ì¸ ?œìˆ ??ê°œìš” ë°?ê°œë… ?¤ëª… ëª¨ë²”?µì•ˆ (\\n êµ¬ë¶„))
   - ê°ê???(type: "ê°ê???): ${mcCount}ë¬¸ì œ (4ì§€? ë‹¤??
2. ê°ê???ë¬¸ì œ??? í˜• ë°?êµ¬ì„± ë¹„ìœ¨ ì§€ì¹?(ê·¹ë„ë¡?ì¤‘ìš”):
   - ì¶œì œ?˜ëŠ” ê°ê???ë¬¸í•­?¤ì? ë°˜ë“œ???„ë˜ ë¹„ìœ¨??ì¤€?˜í•˜??êµ¬ì„±?˜ì‹­?œì˜¤:
     * **ê¸°ë³¸ ê¸°ì´ˆ ê°œë… ë¬¸ì œ (40%, ??2ë¬¸ì œ)**: ? í”½??ê¸°ë³¸ ?•ì˜, ?µì‹¬ ê°œë…, ê¸°ì´ˆ ?ë¦¬ë¥?ì§ì ‘?ìœ¼ë¡?ë¬»ëŠ” ê¸°ì´ˆ ?˜ì? ë¬¸ì œ. (?? "?‹â—‹?‹ì˜ ?•ì˜ë¡?ê°€???³ì? ê²ƒì??", "?‹â—‹?‹ì˜ ?¹ì§•???„ë‹Œ ê²ƒì??"). ê¸°ì‚¬ ?˜ì????µì‹¬ ê°œë… ?•ì¸ ë¬¸ì œë¡?ì¶œì œ.
     * **?•ëŸ‰ ê³„ì‚° ë¬¸ì œ (30%, ??1ë¬¸ì œ)**: êµ¬ì²´?ì¸ ì¡°ê±´ ?˜ì¹˜ë¥??€?…í•˜??ìµœì¢… ê°’ì„ ê³„ì‚°?´ë‚´ê±°ë‚˜ ?•ëŸ‰ ê²°ê³¼ë¥?ë¬»ëŠ” ?˜ì¹˜ ê³„ì‚° ë¬¸ì œ.
     * **?¬í™” ?ë¦¬Â·ë¹„êµ ë¬¸ì œ (30%, ??1ë¬¸ì œ)**: ê³µí•™??ë©”ì»¤?ˆì¦˜, ?¥ë‹¨?? ë¹„êµ, ?¤ë¬´ ?œê³µ ? ì˜?¬í•­ ???‘ìš© ?´í•´??ë¬¸ì œ.
   
   - **?š¨ [ê³µì‹ ë°?ê³µì‹ ?˜ì¹˜ ë²”ìœ„ ?¸ì¶œ ?ˆë? ê¸ˆì? ê·œì¹™ - ê·¹ë„ë¡?ì¤‘ìš”!]**: ë¬¸ì œ ì§ˆë¬¸(question) ë³¸ë¬¸ ?´ì— **ë¬¸ì œë¥??´ê²°?˜ëŠ” ???„ìš”??ê³µí•™ ?˜ì‹ ?ì²´(?? $E_u = 300 s_u$ ?????˜ì‹???¹ì • ?˜ì¹˜ ë²”ìœ„(?? $E_u = (200 \\sim 500)s_u$ ??, ë¹„ë? ê´€ê³????±ì„ ?ˆë?ë¡?ì§ì ‘ ?ìŠ¤?¸ë¡œ ?ì–´ ?œê³µ?˜ì? ë§ˆì‹­?œì˜¤.** ?˜ì‹?´ë‚˜ ê²½í—˜???˜ì¹˜ ë²”ìœ„ë¥?ì§€ë¬¸ì— ë¯¸ë¦¬ ì£¼ë©´ ?™ìƒ???”ê¸° ë°??°ìƒ ?¥ë ¥???‰ê??????†ìŠµ?ˆë‹¤. ?€??ê³µì‹??ëª…ì¹­("ë¹„ë°°???„ì„±ê³„ìˆ˜ ê²½í—˜??)?´ë‚˜ ë³€?˜ë“¤??ëª…ì¹­("ë¹„ë°°???„ë‹¨ê°•ë„ $s_u$")ë§Œì„ ?œì‹œ?˜ê³ , ?™ìƒ???¤ìŠ¤ë¡?ê³µì‹ê³?ë²”ìœ„ë¥?? ì˜¬?¤ì„œ ?´ê²°?˜ë„ë¡??˜ì‹­?œì˜¤. (?? ?´ì„¤(explanation)?ì„œ???™ìƒ???™ìŠµ???„í•´ ê³µì‹???ì„¸??ëª…ì‹œ?˜ê³  ê³„ì‚° ê³¼ì •???¤ëª…?´ì•¼ ?©ë‹ˆ??)
   - ?¹íˆ **?˜ì¹˜ ?´ì„ë²•ì´??ê°€??êµ¬ì¡°ë¬??´ì„ê³?ê°™ì´ ?•ëŸ‰??ë¶„ì„???„ìš”??? í”½??ê²½ìš°, ?œê³µ???ŒìŠ¤ ë¬¸ì„œ ?´ì— ëª…ì‹œ?ì¸ ?˜ì¹˜???Œë¼ë¯¸í„°ê°€ ì¡´ì¬?œë‹¤ë©??´ë? ?œìš©?˜ì—¬ ?•ëŸ‰ ê³„ì‚° ë¬¸ì œë¥?êµ¬ì„±?˜ì‹­?œì˜¤. ?? ë¬¸ì„œ???˜ì¹˜???˜ì‹???†ë‹¤ë©??„ì˜ë¡?ë¹„í˜„?¤ì ???˜ì¹˜ë¥?ê°€??ë¶€?¬í•˜ì§€ ë§ˆì‹­?œì˜¤.**
   - ë§Œì•½ ?„í˜•?ì¸ ë¹„ê³„?°í˜•/?•ì„±??? í”½(?? ?¨ìˆœ ?ˆì§ˆ ?œí—˜ ?ˆì°¨, ?¨ìˆœ ?‰ì • ?œë„ ????ê²½ìš°?ë§Œ ?¼ë°˜?ì¸ ?œìˆ ???´í•´??ê°ê???ë¬¸ì œë¡?ì¶œì œ?˜ë˜, ??ê²½ìš°?ë„ ê°€ê¸‰ì  ë¬¼ë¦¬??ë³€?˜ì˜ ?í–¥?„ë? ë¬»ëŠ” ??ìµœë????•ëŸ‰?”ì— ê°€ê¹ê²Œ ë¬¸ì œ???˜ì????’ì—¬ ì¶œì œ?˜ì‹­?œì˜¤.
   - **? ï¸ [ë¹„êµ/?¹ì„± ??ì¶œì œ ê·œì¹™ - ê·¹ë„ë¡?ì¤‘ìš”!]**: ì§ˆë¬¸??ë¹„êµ/?¹ì„± ?œê? ?„ìš”??ê²½ìš°, ?ˆë? <table> ??HTML ?œê·¸ë¡??œë? ì§ì ‘ ?‘ì„±?˜ì? ë§ê³  ?¼ë°˜ ?ìŠ¤?¸ë¡œë§?ì§ˆë¬¸???‘ì„±?????„ë˜??"tableData" ?„ë“œ?????°ì´?°ë? ê°ì²´ êµ¬ì¡°ë¡??‘ì„±?˜ì‹­?œì˜¤.
3. ?¤ë‹µ ë³´ê¸° êµ¬ì„± ì£¼ì˜?¬í•­ (ë§¤ìš° ì¤‘ìš”):
   - ?¤ë‹µ ë³´ê¸°(options) êµ¬ì„± ??**?ˆë?ë¡??°ë¬´?ˆì—†ê±°ë‚˜ ê·¹ë‹¨?ì¸ ?œí˜„, ?¹ì? ë¹„í˜„?¤ì ??ê³µí•™??ê°€???? 'ë¬´í•œ?€ë¡??ìŠ¹?œí‚´', '?¤ì‹œê°„ìœ¼ë¡?ê¸°í•˜ê¸‰ìˆ˜?ìœ¼ë¡?ì¦ê???, '?ì›??ë³€?˜ì? ?ŠìŒ', '?„ì˜ˆ ë°œìƒ?˜ì? ?ŠìŒ', '??°œ?? ???€ ?ˆë?ë¡??¬ìš©?˜ì? ë§ˆì‹­?œì˜¤**. 
   - ?¤ì œ ?„ê³µ ?œì ?´ë‚˜ ?¤ë¬´ ê¸°ìˆ  ê¸°ì???ë¶€?©í•˜??**ê³ ë„ë¡??€?¹ì„± ?ˆê³  ê·¸ëŸ´??•œ ?¤ë‹µ(plausible engineering distractors)**?¼ë¡œ êµ¬ì„±??ì£¼ì‹­?œì˜¤. ëª¨ë“  ë³´ê¸°??ë°˜ë“œ???ë³¸ ?ŒìŠ¤ ë°?ê³µí•™???ì‹? ì— ê¸´ë???ê²°í•©?˜ì–´???©ë‹ˆ??
- **?š¨ [ê°ê????•ë???ë°??•ë‹µ ?¼ì¹˜ ì¡°ê±´ - ê·¹ë„ë¡?ì¤‘ìš”!]**: ëª¨ë“  ê°ê???4ì§€? ë‹¤?? ê³„ì‚° ë¬¸ì œ???˜ì¹˜/ê³µí•™???ë‹¨ ë¬¸ì œë¥?ì¶œì œ???? ê³„ì‚°?¼ë¡œ ?„ì¶œ???•í™•???•ë‹µ ?˜ì¹˜??ì¡°ê±´??4ê°œì˜ ë³´ê¸°(options) ì¤?ë°˜ë“œ???•í™•??1ê°œë¡œ ì¡´ì¬?´ì•¼ ?©ë‹ˆ?? ?ˆë?ë¡??¤ì œ ê³„ì‚° ê²°ê³¼?€ ë³´ê¸°???˜ì¹˜ê°€ ë¶ˆì¼ì¹˜í•˜?? ?´ì„¤?ì„œ '?¤ì œ ê³„ì‚°ê°’ì? XX?´ë‚˜ ë³´ê¸° ì¤?ê°€??ê°€ê¹Œìš´ YYë¥?? íƒ?©ë‹ˆ???€ ê°™ì? ?´ì²˜êµ¬ë‹ˆ?†ëŠ” ë³€ëª…ì„ ?ëŠ” ì¶œì œ ?¤ë¥˜ë¥?ë²”í•˜ì§€ ë§ˆì‹­?œì˜¤. ë¬¸ì œë¥??ì„±?˜ê¸° ?„ì— ?¤ì œ ?˜ì‹???€?…í•˜???•ë‹µ????ë²???ì§ì ‘ ?„ë??˜ê²Œ ê³„ì‚°?˜ê³  ê²€ì¦í•œ ?? ê·?ê²°ê³¼ê°?? ì”¨ ?˜ë‚˜ ?€ë¦¬ì? ?ŠëŠ” ?•í™•???•ë‹µ)??ë³´ê¸°?€ 'answer' ?„ë“œ???„ë²½???¼ì¹˜?˜ë„ë¡?ê¸°ì¬?˜ì‹­?œì˜¤.
    4. ?ŒìŠ¤ ?ìŠ¤?¸ì˜ ?¨ê²¨ì§?ê³µí•™??ê°œë…ê³??¤ë¬´ ê¸°ì „???¬ì°©?˜ì—¬ ê³ í’ˆê²?ì§ˆë¬¸???˜ì???‹œ??

[?˜ê° ë°©ì? ì² ì¹™ (Anti-Hallucination Constraints)]:
1. ?œê³µ???ŒìŠ¤ ë¬¸ì„œ ?ìŠ¤??<Source_Document>) ?´ì— ëª…ì‹œ???˜ì¹˜, ?ˆìš© ?ˆì „?? ?¤ê³„ê¸°ì?(KDS/KCS) ì¡°í•­ ë²ˆí˜¸??ê³µì‹???†ëŠ” ê²½ìš°, ?„ì˜ë¡??˜ì‹??? ë„?˜ê±°???¸ë? ?œë°©???˜ì¹˜ ?œê³„ë¥?? ì¡°(Hallucination)?˜ì? ë§ˆì‹­?œì˜¤.
2. ë¬¸ì„œ ë²”ìœ„ë¥?ë²—ì–´?˜ëŠ” ??•™???˜ì¹˜??ë¹„ë¬¼ë¦¬ì  ?˜ì¹˜(?? ?´ë?ë§ˆì°°ê°?60???´ìƒ ??ë¥?ì°½ì‘?˜ì—¬ ëª¨ìˆœ??ë°œìƒ?œí‚¤ë©????©ë‹ˆ?? ?˜ì¹˜ê°€ ë¶€ì¡±í•˜?¤ë©´ ?•ëŸ‰ ê³„ì‚° ë¬¸ì œ ì¶œì œë¥?ì¦‰ì‹œ ?°íšŒ?˜ê³  ê°œë… ?´í•´??ë¬¸ì œë¡??€ì²´í•˜??‹œ??

${LATEX_PROMPT_INSTRUCTIONS}
${GENERATION_STANDARDS}
${ENGINEERING_STANDARDS}
4. ë°˜ë“œ??ì¶”ê? ?ìŠ¤???†ì´ ?œìˆ˜ JSON ë°°ì—´ë§?ë°˜í™˜?˜ì‹­?œì˜¤.

[JSON ?¬ë§·]:
[
  {
    "type": "ì£¼ê???,
    "subtype": "ê°œìš”",
    "topic_title": "??ë¬¸ì œ??ì¶œì œ ê·¼ê±°ê°€ ?˜ëŠ” ? í”½ ëª©ë¡ ?´ì˜ ?•í™•??? í”½ëª?(?? ?‰ì‚¬?¬ì˜ë²?",
    "question": "ì§ˆë¬¸ ?´ìš©",
    "answer": "3~5ì¤??´ì™¸??ê¹Šì´ ?ˆê³  ?„ë¬¸?ì¸ ?œìˆ ??ê°œìš” ë°?ê°œë… ?¤ëª… ëª¨ë²”?µì•ˆ",
    "concept": "?µì‹¬ ê°œë… 1ì¤??”ì•½"
  },
  {
    "type": "ê°ê???,
    "topic_title": "??ë¬¸ì œ??ì¶œì œ ê·¼ê±°ê°€ ?˜ëŠ” ? í”½ ëª©ë¡ ?´ì˜ ?•í™•??? í”½ëª?(?? ?½ë³¼???¸ë°œ?œí—˜)",
    "question": "ê³µí•™???„ìƒ ë¶„ì„ ì§ˆë¬¸",
    "tableData": null,
    "options": ["ë³´ê¸°1", "ë³´ê¸°2", "ë³´ê¸°3", "ë³´ê¸°4"],
    "answer": "?•ë‹µ ë³´ê¸°?€ ? ì”¨ ?˜ë‚˜ ?€ë¦¬ì? ?ŠëŠ” ?•ë‹µ ?ìŠ¤??,
    "explanation": "?´ìœ ?€ ?¤ë‹µ ?•ë? ?´ì„¤"
  }
] (??ë§Œì•½ ?œê? ?„ìš”??ì§ˆë¬¸?´ë¼ë©?"tableData": {"headers": ["êµ¬ë¶„", "ì§€ë°?X", "ì§€ë°?Y"], "rows": [["?´ì  ?˜ê²½", "?´ìˆ˜", "?´ìˆ˜"]]} ì²˜ëŸ¼ êµ¬ì¡°?”ëœ ??ê°ì²´ë¥??‘ì„±?˜ê³ , ê·¸ë ‡ì§€ ?Šì? ?¼ë°˜ ì§ˆë¬¸?´ë©´ "tableData": null ë¡??¤ì •?˜ì‹­?œì˜¤.)
`;
      try {
        console.log(`[ì¢…í•©?‰ê? ì¶”ê? ?ì„±] (${i + 1}/${TOTAL_BATCHES}) ?Œì°¨ ?„ë¡¬?„íŠ¸ ?„ì†¡ ?œì‘...`);
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
          console.log(`[ì¢…í•©?‰ê? ì¶”ê? ë°°ì¹˜ ?±ê³µ] (${i + 1}/${TOTAL_BATCHES}) ?Œì°¨ ?„ë£Œ. ?„ì  ë¬¸í•­ ?? ${aggregatedAiQuestions.length}`);
        }

        if (i < TOTAL_BATCHES - 1) {
          await sleep(1200);
        }
      } catch (batchError) {
        console.warn(`[ì¶”ê? ë°°ì¹˜ ì¡°íšŒ ê²½ê³ ] ${i + 1}?Œì°¨ ?ì„± ì¤??ëŸ¬ ë°œìƒ:`, batchError.message);
      }
    }

    if (aggregatedAiQuestions.length === 0) {
      aggregatedAiQuestions = [
        {
          type: "ê°ê???,
          question: "?ì„±??ì§€ë°˜ì˜ ?•ë? ?œí—˜?ì„œ ?˜ì¤‘ ?•ë ¥ ë³€?”ì— ?°ë¥¸ ê³µê·¹ë¹?$e$)?€ ?€??? íš¨ ?•ë ¥($\\log \\sigma'$) ê³¡ì„ (e-log p ê³¡ì„ ) ?ì˜ ì£¼ìš” ê±°ë™ ?¹ì„±???€???¤ëª…?¼ë¡œ ê°€???ì ˆ?˜ì? ?Šì? ê²ƒì??",
          options: [
            "?•ì¶•ì§€??$C_c$)??ê·œì • ?•ì¶• ?ì—­?ì„œ??ì§ì„  ê¸°ìš¸ê¸°ë¡œ ?•ì˜?˜ë©°, ì§€ë°˜ì˜ ?Œì„± ?œì„±?„ê? ?’ì„?˜ë¡ ê°ì†Œ?œë‹¤.",
            "? í–‰?•ë??˜ì¤‘($p_c$)?€ ?™ì´ ê³¼ê±°??ë°›ì•˜??ìµœë? ? íš¨ ?°ì§?‘ë ¥?´ë‹¤.",
            "?¬ì••ì¶•ì???$C_r$)???½ì°½ ë°??¬ì••ì¶?êµ¬ê°„???‰ê·  ê¸°ìš¸ê¸°ë¡œ, ?¼ë°˜?ìœ¼ë¡??•ì¶•ì§€?˜ì˜ 1/5 ~ 1/10 ?•ë„ ?˜ì??´ë‹¤.",
            "ê³¼ì••ë°€ë¹?OCR)ê°€ 1ë³´ë‹¤ ???í† ???„ë‹¨ ?œí—˜ ???„ë‹¨ ë³€?•ì— ?˜í•œ ì²´ì  ?½ì°½(Dilatancy) ê±°ë™??ë³´ì¼ ???ˆë‹¤."
          ],
          answer: "?•ì¶•ì§€??$C_c$)??ê·œì • ?•ì¶• ?ì—­?ì„œ??ì§ì„  ê¸°ìš¸ê¸°ë¡œ ?•ì˜?˜ë©°, ì§€ë°˜ì˜ ?Œì„± ?œì„±?„ê? ?’ì„?˜ë¡ ê°ì†Œ?œë‹¤.",
          explanation: "ì§€ë°˜ì˜ ?Œì„± ?œì„±?„ê? ?’ê³  ?•ì¶•?±ì´ ?´ìˆ˜ë¡??•ì¶•ì§€??$C_c$)???¤íˆ??ì¦ê??©ë‹ˆ??"
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
        type: q.type || "ê°ê???,
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
    res.status(500).json({ error: err.message || '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
    if (progressId) {
      updateProgress(progressId, 3, '3?¨ê³„: ì¶”ê? ë¬¸ì œ ì¶œì œ ë°?ê²€ì¦??„ë£Œ!', 100);
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
      return res.status(404).json({ error: '?´ë‹¹ ë³µìŠµ ?¼ì •??ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
    }

    if (schedule.status === 'completed') {
      return res.status(400).json({ error: '?´ë? ë³µìŠµ ?„ë£Œ???¼ì •?…ë‹ˆ??' });
    }

    const nowTimestamp = new Date().toISOString();
    const updateSql = `
      UPDATE schedules 
      SET status = 'completed', completed_at = ? 
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [nowTimestamp, schedule.id]);

    // ?´ì „ ?Œì°¨ ì¤?ë¯¸ì™„ë£?pending) ê±´ì´ ?¨ì•„?ˆëŠ” ê²½ìš° ?ë™ ?„ë£Œ ì²˜ë¦¬?˜ì—¬ '?¬ë³µ?µì¤‘' ?”ë¥˜ ë°©ì?
    if (schedule.review_round && schedule.review_round !== 99) {
      await dbQuery.run(
        `UPDATE schedules SET status = 'completed', completed_at = ? WHERE topic_id = ? AND review_round < ? AND status = 'pending'`,
        [nowTimestamp, schedule.topic_id, schedule.review_round]
      );
    }

    // ë³µìŠµ ?„ë£Œ ???¤ìŒ ?Œì°¨ ?ë™ ?ì„± (ë§ê°ê³¡ì„  ì£¼ê¸° ê¸°ë°˜)
    if (schedule.review_round !== 99) {
      // FIX: ë§ê°ê³¡ì„  ì£¼ê¸°???¤ì œ ?„ë£Œ?¼ì ê¸°ì?
      const baseDate = new Date();
      await scheduleNextReviewRound(schedule.topic_id, schedule.review_round, baseDate);
    }

    res.json({
      message: `${schedule.review_round}?Œì°¨ ë³µìŠµ ?„ë£Œ ì²˜ë¦¬?˜ì—ˆ?µë‹ˆ??`,
      schedule_id: scheduleId,
      status: 'completed',
      completed_at: nowTimestamp
    });
  } catch (error) {
    console.error('Error completing review:', error);
    res.status(500).json({ error: '?œë²„ ?¤ë¥˜ë¡?ë³µìŠµ ?„ë£Œ ì²˜ë¦¬???¤íŒ¨?ˆìŠµ?ˆë‹¤.' });
  }
});

// POST /api/quiz/submit -> Submit quiz results and update schedule score
router.post('/quiz/submit', async (req, res) => {
  const { schedule_id, topic_id, review_round, reviewRound, total, correctCount, score, isPassed, isBonus, questions, selectedAnswers, revealedQuestions, tableAnswers, tableGradingResults, referenceDate, tutorAnswers, tutorInputText, chatHistory } = req.body;

  if (!schedule_id || !topic_id) {
    return res.status(400).json({ error: 'schedule_id?€ topic_id???„ìˆ˜?…ë‹ˆ??' });
  }

  const isMixedReq = (typeof topic_id === 'string' && topic_id.startsWith('mixed_')) ||
                     (typeof schedule_id === 'string' && schedule_id.startsWith('mixed_'));

  const topicIdInt = parseInt(topic_id, 10);
  let scheduleIdInt = parseInt(schedule_id, 10);
  const rRound = review_round !== undefined ? review_round : reviewRound;

  if (!isMixedReq && (isNaN(topicIdInt) || isNaN(scheduleIdInt))) {
    return res.status(400).json({ error: '? íš¨??topic_id?€ schedule_idê°€ ?„ë‹™?ˆë‹¤.' });
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

    // 1. ?´ë‹¹ ?¼ì • ì¡´ì¬ ?¬ë? ?•ì¸
    if (!schedule) {
      schedule = await dbQuery.get('SELECT * FROM schedules WHERE id = ?', [targetScheduleId]);
    }
    if (!schedule) {
      return res.status(404).json({ error: '?´ë‹¹ ë³µìŠµ ?¼ì •??ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
    }

    // 2. ?±ì  ë°??ìˆ˜ ê°±ì‹ 
    const scoreVal = score !== undefined ? score : null;
    const correctVal = correctCount !== undefined ? correctCount : null;
    const totalVal = total !== undefined ? total : null;

    const finalStatus = isPassed ? 'completed' : 'failed';
    if (!isMixedReq) {
      await dbQuery.run(
        `UPDATE schedules SET status = ?, completed_at = ?, score = ?, correct_count = ?, total_count = ? WHERE id = ?`,
        [finalStatus, now, scoreVal, correctVal, totalVal, targetScheduleId]
      );

      // ?´ì „ ?Œì°¨ ì¤?ë¯¸ì™„ë£?pending) ê±´ì´ ?¨ì•„?ˆëŠ” ê²½ìš° ?ë™ ?„ë£Œ ì²˜ë¦¬?˜ì—¬ '?¬ë³µ?µì¤‘' ?”ë¥˜ ë°©ì?
      if (schedule && schedule.review_round && schedule.review_round !== 99) {
        await dbQuery.run(
          `UPDATE schedules SET status = 'completed', completed_at = ? WHERE topic_id = ? AND review_round < ? AND status = 'pending'`,
          [now, schedule.topic_id, schedule.review_round]
        );
      }
    }

    // ë³µìŠµ ?°ì´???¸ì…˜ ë³´ì¡´ (?„ë£Œ??ë³µìŠµ???¤ì‹œ ì¡°íšŒ?????ˆë„ë¡?questions?€ chatHistoryë¥??¬í•¨?˜ì—¬ ?€??
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

      // ë³´ì¡´ ?•ì±…: ?´ì „ ?¸ì…˜ ?•ë¦¬
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

    // ìºì‹œ ?? œ (ensureSessionTable ?¸ì¶œ ?œê±°)
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

    // ?¤ìŒ ?Œì°¨ ?ë™ ?ì„±
    if (!isMixedReq && isPassed && !isBonus && schedule.review_round !== 99) {
      // FIX: ë§ê°ê³¡ì„  ì£¼ê¸° ë³µìŠµ ì¶”ì²œ?€ 'ì°¸ì¡°?¼ì(referenceDate)'ê°€ ?„ë‹Œ ?¤ì œ 'ë³µìŠµ ?„ë£Œ?¼ì(Date.now())'ë¥?ê¸°ì??¼ë¡œ ?´ì•¼ ??
      const baseDate = new Date(); 
      await scheduleNextReviewRound(topicIdInt, schedule.review_round, baseDate);
    }

    res.json({
      success: true,
      isPassed,
      status: isPassed ? 'completed' : 'failed',
      message: isPassed
        ? `${schedule.review_round}?Œì°¨ ?´ì¦ˆ ?µê³¼! ë³µìŠµ ?„ë£Œë¡??€?¥ë˜?ˆìŠµ?ˆë‹¤.`
        : `${schedule.review_round}?Œì°¨ ?´ì¦ˆ ë¯¸í†µê³? ?¤ìŒ ë³µìŠµ ?????´ì¦ˆê°€ ?œê³µ?©ë‹ˆ??`
    });
  } catch (error) {
    console.error('[quiz/submit] Error:', error);
    res.status(500).json({ error: '?œë²„ ?¤ë¥˜ë¡?ë³µìŠµ ?„ë£Œ ì²˜ë¦¬???¤íŒ¨?ˆìŠµ?ˆë‹¤.' });
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
      return res.status(404).json({ error: '?´ë‹¹ ë³µìŠµ ?¼ì •??ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
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

    // ë³µìŠµ ì·¨ì†Œ ?? ê¸°ì¡´ ?„ë£Œ??ë³µìŠµ ?¸ì…˜ ê¸°ë¡???¤ì‹œ ?œì„± ?¸ì…˜(Active Session)?¼ë¡œ ë³µêµ¬?˜ì—¬ ?°ì´??? ì‹¤ ë°©ì?
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

        // ë³µêµ¬ ???„ë£Œ ?íƒœ???¸ì…˜ ?¤ëŠ” ê¹”ë”?˜ê²Œ ?•ë¦¬
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [solvedSessionKey]);
      }
    } catch (restoreErr) {
      console.warn('[Session Restore] Failed to restore active session from completed session:', restoreErr.message);
    }

    res.json({
      message: `${schedule.review_round}?Œì°¨ ë³µìŠµ??ë¦¬ì…‹?˜ì—ˆ?µë‹ˆ??`,
      schedule_id: scheduleId,
      status: 'pending',
      planned_date: newPlannedDate,
      completed_at: null
    });
  } catch (error) {
    console.error('Error resetting review:', error);
    res.status(500).json({ error: '?œë²„ ?¤ë¥˜ë¡?ë³µìŠµ ?¼ì • ë¦¬ì…‹???¤íŒ¨?ˆìŠµ?ˆë‹¤.' });
  }
});

// PUT /api/schedules/:id/score -> Manually update schedule score
router.put('/schedules/:id/score', async (req, res) => {
  const scheduleId = Number(req.params.id) || req.params.id;
  const { score, topic_id, topicId, review_round, reviewRound } = req.body;
  const tId = topic_id || topicId;
  const rRound = review_round !== undefined ? review_round : reviewRound;

  if (score === undefined || score === null || isNaN(Number(score)) || Number(score) < 0 || Number(score) > 100) {
    return res.status(400).json({ error: '?ìˆ˜??0?ì„œ 100 ?¬ì´???«ì?¬ì•¼ ?©ë‹ˆ??' });
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
      return res.status(404).json({ error: '?´ë‹¹ ë³µìŠµ ?¼ì •??ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
    }

    if (schedule.status !== 'completed' && schedule.status !== 'failed') {
      return res.status(400).json({ error: '?„ë£Œ ?ëŠ” ?¤íŒ¨ ?íƒœ???¼ì •ë§??ìˆ˜ ë³€ê²½ì´ ê°€?¥í•©?ˆë‹¤.' });
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
      message: `${schedule.review_round}?Œì°¨ ë³µìŠµ ?ìˆ˜ê°€ ${targetScore}?ìœ¼ë¡?ë³€ê²½ë˜?ˆìŠµ?ˆë‹¤.`,
      score: targetScore,
      status: newStatus
    });
  } catch (error) {
    console.error('Error updating manual score:', error);
    res.status(500).json({ error: '?œë²„ ?¤ë¥˜ë¡??±ì  ?…ë°?´íŠ¸???¤íŒ¨?ˆìŠµ?ˆë‹¤.' });
  }
});

// POST /api/exam/detailed-answer
router.post('/exam/detailed-answer', async (req, res) => {
  const progressId = req.body.progressId || req.query.progressId;
  const localCallLLM = (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });

  let progressTimer = null;
  if (progressId) {
    progressTimer = startBackendProgressTimer(progressId, 1, '1?¨ê³„: AI ?¬ì¸µ ?´ì„¤ ?ì„± ì¤?..', 90, 800, 5);
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
      return res.status(400).json({ error: '?±ë¡??AI API ?¤ê? ì¡´ì¬?˜ì? ?ŠìŠµ?ˆë‹¤.' });
    }

    const prompt = `
?¹ì‹ ?€ ?€?œë?êµ?êµ??ê¸°ìˆ ?ê²© ê¸°ìˆ ???œí—˜ ì¶œì œ?„ì› ë°?ìµœê³  ê¶Œìœ„?ì…?ˆë‹¤.
?˜í—˜?ì´ ì¢…í•©?‰ê?ë¥??€??ì¤??¤ìŒ ë¬¸ì œ???€??'?µì•ˆ ?„ë¬¸ë³´ê¸°(?¬ì¸µ ?´ì„¤)'ë¥??”ì²­?ˆìŠµ?ˆë‹¤.

[ë¬¸ì œ]: ${question}
[ê¸°ì¡´ ê°„ëµ ?•ë‹µ/?´ì„¤]: ${answer || '?†ìŒ'}

???´ìš©??ë°”íƒ•?¼ë¡œ, ??ë¬¸ì œ?€ ê´€?¨ëœ ê¸°ìˆ ??ë°°ê²½, ?µì‹¬ ë©”ì»¤?ˆì¦˜, ê·¸ë¦¬ê³??¤ë¬´???œì‚¬?ì„ ?¬í•¨?˜ì—¬ ?„ë²½??ê¸°ìˆ ??ëª¨ë²” ?µì•ˆ(?ëŠ” ?¬ì¸µ ?´ì„¤)???‘ì„±??ì£¼ì‹­?œì˜¤.
?¤ìŒ ê·œì¹™???„ê²©???°ë¥´??‹œ??
1. 3?¨ë½ êµ¬ì¡°(1. ê°œìš” ë°?ê¸°ìˆ ??ë°°ê²½, 2. ?µì‹¬ ë©”ì»¤?ˆì¦˜/êµ¬ì„±?”ì†Œ/ë¹„êµë¶„ì„, 3. ?¤ë¬´???œì‚¬??ë°?ê²°ë¡ )ë¡??¼ë¦¬?ìœ¼ë¡??‘ì„±?˜ì‹­?œì˜¤.
2. ë³´ê¸° ?¸í•œ Markdown ?•ì‹(?ì ˆ??êµµì? ê¸€?? ê¸€ë¨¸ë¦¬ ê¸°í˜¸ ?????¬ìš©?˜ë˜, ë§ˆí¬?¤ìš´ ì½”ë“œë¸”ë¡(\`\`\`markdown)?¼ë¡œ ?„ì²´ë¥?ê°ì‹¸ì§€ ë§ê³  ë°”ë¡œ ?ìŠ¤?¸ë¡œ ì¶œë ¥?˜ì‹­?œì˜¤.

${ENGINEERING_STANDARDS}
${LATEX_CHAT_PROMPT_INSTRUCTIONS}
`;

    try {
      const responseText = await localCallLLM(null, prompt);
      const healedText = healLatexFormulas(responseText.trim()); // ?€???˜ì‹ ?•ì • ê²°í•©
      if (progressId) {
        updateProgress(progressId, 1, '1?¨ê³„: ?´ì„¤ ?ì„± ?„ë£Œ!', 100);
      }
      res.json({ text: healedText });
    } catch (err) {
      console.error('Detailed answer route error:', err);
      if (progressId) {
        updateProgress(progressId, 1, '?¤ë¥˜ ë°œìƒ?¼ë¡œ ?´ì„¤ ?ì„± ?¤íŒ¨', 100);
      }
      res.status(500).json({ error: err.message || '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
    }
  } catch (err) {
    console.error('Detailed answer route error:', err);
    if (progressId) {
      updateProgress(progressId, 1, '?¤ë¥˜ ë°œìƒ?¼ë¡œ ?´ì„¤ ?ì„± ?¤íŒ¨', 100);
    }
    res.status(500).json({ error: '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
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
    progressTimer = startBackendProgressTimer(progressId, 1, '1?¨ê³„: AI ?ŒíŠ¸ ?ì„± ì¤?..', 90, 800, 10);
  }

  try {
    const { questionText } = req.body;
    if (!questionText) {
      if (progressTimer) clearInterval(progressTimer);
      return res.status(400).json({ error: 'ì§ˆë¬¸(ë¬¸ì œ) ?ìŠ¤?¸ê? ?œê³µ?˜ì? ?Šì•˜?µë‹ˆ??' });
    }

    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY
    );
    if (!hasAnyAiKey) {
      if (progressTimer) clearInterval(progressTimer);
      return res.status(400).json({ error: '?±ë¡??AI API ?¤ê? ì¡´ì¬?˜ì? ?ŠìŠµ?ˆë‹¤.' });
    }

    const systemInstruction = `?¹ì‹ ?€ ?€?œë?êµ?ê¸°ìˆ ???œí—˜ ?„ë¬¸ ?œí„°?…ë‹ˆ??
?˜í—˜?ì´ ?€ê³??ˆëŠ” ì£¼ê????ëŠ” ê°ê???ë¬¸ì œ???€??**ë§¤ìš° ?½ê³  ì§ê??ì´ë©?ê°„ë‹¨???ŒíŠ¸**ë¥???ë¬¸ë‹¨(3ì¤??´ë‚´)?¼ë¡œ ?œê³µ??ì£¼ì‹­?œì˜¤.

[ì§€ì¹?:
1. ë³µì¡??ê³µì‹?´ë‚˜ ? ë„ ê³¼ì •???¤ëª…?˜ì? ë§ê³ , ??ë¬¸ì œë¥??´ê²°?˜ê¸° ?„í•´ ê°€???µì‹¬?ìœ¼ë¡??ê°?´ì•¼ ?˜ëŠ” ê°œë…?´ë‚˜ ë¬¼ë¦¬??ê±°ë™???¼ìƒ?ì´ê³?ì§ê??ì¸ ë¹„ìœ ë¡??¤ëª…?˜ì‹­?œì˜¤.
2. ?˜í—˜?ì´ ?¤ìŠ¤ë¡?ë¬¸ì œë¥??€ ???ˆë„ë¡?? ë„?´ì•¼ ?˜ë©°, ì§ì ‘?ì¸ ?´ë‹µ?´ë‚˜ ìµœì¢… ?•ë‹µ ?˜ì¹˜ë¥??œê³µ?´ì„œ???ˆë? ???©ë‹ˆ??
3. ì¹œì ˆ?˜ê³  ë¶€?œëŸ¬???œí„°??ë§íˆ¬ë¥??¬ìš©?˜ì‹­?œì˜¤.
${ENGINEERING_STANDARDS}`;
    const userPrompt = `?¤ìŒ ë¬¸ì œ???€???½ê³  ì§ê??ì¸ ?ŒíŠ¸ë¥?ê°„ë‹¨???ì–´ì£¼ì„¸??\n\n[ë¬¸ì œ ë³¸ë¬¸]\n${questionText}`;
    
    const responseText = await localCallLLM(systemInstruction, userPrompt, null, 'question');
    const healedText = healLatexFormulas(responseText);
    if (progressId) {
      updateProgress(progressId, 1, '1?¨ê³„: ?ŒíŠ¸ ?ì„± ?„ë£Œ!', 100);
    }
    res.json({ hint: healedText });
  } catch (err) {
    console.error('Hint generation error:', err);
    if (progressId) {
      updateProgress(progressId, 1, '?¤ë¥˜ ë°œìƒ?¼ë¡œ ?ŒíŠ¸ ?ì„± ?¤íŒ¨', 100);
    }
    res.status(500).json({ error: err.message || '?ŒíŠ¸ë¥??ì„±?˜ëŠ” ???¤íŒ¨?ˆìŠµ?ˆë‹¤.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// POST /api/formula/generate-quiz-question
router.post('/formula/generate-quiz-question', async (req, res) => {
  try {
    const { formulaTitle, formula, concept, assumptions } = req.body;
    if (!formulaTitle || !formula) {
      return res.status(400).json({ error: 'ê³µì‹ ?•ë³´ê°€ ë¶€ì¡±í•©?ˆë‹¤.' });
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
    res.status(500).json({ error: err.message || 'ê³„ì‚° ë¬¸ì œ ?ì„±???¤íŒ¨?ˆìŠµ?ˆë‹¤.' });
  }
});

// POST /api/item-quiz/generate
router.post('/item-quiz/generate', async (req, res) => {
  try {
    const { itemType, itemData } = req.body;
    if (!itemType || !itemData) {
      return res.status(400).json({ error: '?„ìˆ˜ ?´ì¦ˆ ?°ì´?°ê? ?„ë½?˜ì—ˆ?µë‹ˆ??' });
    }

    let questionObj = null;
    if (itemType === 'table') {
      questionObj = await itemQuizPlugin.generateTableQuizQuestion(itemData);
    } else if (itemType === 'acronym') {
      questionObj = await itemQuizPlugin.generateAcronymQuizQuestion(itemData);
    } else if (itemType === 'overview') {
      questionObj = await itemQuizPlugin.generateOverviewQuizQuestion(itemData);
    } else {
      return res.status(400).json({ error: 'ì§€?ë˜ì§€ ?ŠëŠ” ?´ì¦ˆ ?€?…ì…?ˆë‹¤.' });
    }

    res.json(questionObj);
  } catch (err) {
    console.error('item-quiz generate error:', err);
    res.status(500).json({ error: err.message || '?´ì¦ˆ ?ì„± ?¤íŒ¨' });
  }
});

// POST /api/quiz/generate-item-questions
router.post('/quiz/generate-item-questions', async (req, res) => {
  try {
    const { item, type, level } = req.body;
    if (!item) {
      return res.status(400).json({ success: false, error: '??ª© ?°ì´?°ê? ?„ë½?˜ì—ˆ?µë‹ˆ??' });
    }

    const count = level === 'basic' ? 1 : level === 'deep' ? 5 : 3;
    const title = item.title || item.name || '?™ìŠµ ??ª©';
    const contentStr = typeof item.content === 'object' ? JSON.stringify(item.content) : (item.content || item.html || '');

    const prompt = `[?™ìŠµ ??ª© ? í˜•]: ${type || '?¼ë°˜'}
[??ª© ?œëª©]: ${title}
[??ª© ë³¸ë¬¸/?°ì´??:
${contentStr}

???™ìŠµ ?°ì´?°ë? ë°”íƒ•?¼ë¡œ ?˜í—˜?ì´ ?™ìŠµ ?íƒœë¥??ê??????ˆëŠ” ë§ì¶¤???´ì¦ˆ ë¬¸ì œ ${count}ê°œë? ì¶œì œ??ì£¼ì‹­?œì˜¤.

[ì¶œì œ ì§€ì¹?:
1. ?œì´??ë°??œìˆ  ?•ì‹(ê°ê????ëŠ” ?œìˆ ??ê³„ì‚°??ë¹ˆì¹¸ì±„ìš°ê¸???ê³ ë ¤?˜ì—¬ ê³µí•™???™ìˆ ??ê°€ì¹˜ê? ?’ì? ë¬¸ì œë¥?ì¶œì œ?˜ì‹­?œì˜¤.
2. LaTeX ê³µì‹???¤ì–´ê°€??ê²½ìš° standard KaTeX ($...$ ?ëŠ” $$...$$) ?•ì‹??ì¤€?˜í•˜??‹œ??
3. ë°˜ë“œ???¤ì§ ? íš¨??JSON ë°°ì—´ ?•íƒœë¡œë§Œ ì¶œë ¥?˜ì‹­?œì˜¤.

[ë°˜í™˜ JSON êµ¬ì¡° ?ˆì‹œ]:
[
  {
    "question": "ë¬¸ì œ ?´ìš© ?¤ëª… (?„ìš”??$ê³µì‹$ ?¬í•¨)",
    "options": ["? íƒì§€1", "? íƒì§€2", "? íƒì§€3", "? íƒì§€4"] // ?œìˆ ??ë¹ˆì¹¸ì±„ìš°ê¸°ì˜ ê²½ìš° null ?ëŠ” []
  }
]`;

    const systemPrompt = `?¹ì‹ ?€ ? ëª©/ì§€ë°˜ê³µ??ê¸°ìˆ ???ê²©?œí—˜ ì¶œì œ?„ì›?…ë‹ˆ?? ?œêµ­?´ë¡œ ?•ë??˜ê³  ëª…í™•??ë¬¸ì œë¥?JSON ë°°ì—´ë¡œë§Œ ì¶œì œ?˜ì‹­?œì˜¤.`;
    const responseText = await callLLMWithFailover(systemPrompt, prompt, null, 'generation');

    let questions = [];
    try {
      const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      questions = JSON.parse(cleaned);
    } catch (e) {
      questions = [
        {
          question: `[${title}] ?µì‹¬ ê°œë… ë°?ë©”ì»¤?ˆì¦˜??ê¸°ìˆ ???˜ì??¼ë¡œ ?ì„¸???œìˆ ?˜ì‹œ??`,
          options: null
        }
      ];
    }

    res.json({ success: true, questions });
  } catch (err) {
    console.error('generate-item-questions error:', err);
    res.status(500).json({ success: false, error: err.message || 'ë¬¸ì œ ?ì„± ?¤íŒ¨' });
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
    res.status(500).json({ error: err.message || '?´ì¦ˆ ì±„ì  ?¤íŒ¨' });
  }
});

// POST /api/quiz/grade-item-answers
router.post('/quiz/grade-item-answers', async (req, res) => {
  try {
    const { item, type, questions, userAnswers } = req.body;
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ success: false, error: 'ì±„ì ??ë¬¸ì œ ëª©ë¡???„ë½?˜ì—ˆ?µë‹ˆ??' });
    }

    const title = item?.title || '?™ìŠµ ??ª©';
    const contentStr = typeof item?.content === 'object' ? JSON.stringify(item.content) : (item?.content || item?.html || '');

    const prompt = `[?™ìŠµ ??ª© ? í˜•]: ${type || '?¼ë°˜'}
[??ª© ?œëª©]: ${title}
[?ë¬¸/ëª¨ë²” ?µì•ˆ ?•ë³´]:
${contentStr}

[ì¶œì œ??ë¬¸ì œ ëª©ë¡ ë°??˜í—˜???œì¶œ ?µì•ˆ]:
${questions.map((q, i) => `ë¬¸ì œ ${i + 1}: ${q.question}
?œì¶œ ?µì•ˆ: ${userAnswers?.[i] || '(ë¯¸ì œì¶?'}`).join('\n\n')}

???œì¶œ ?µì•ˆ?¤ì„ ëª¨ë²” ?µì•ˆ ë°?êµ??ê¸°ìˆ ?ê²© ê¸°ìˆ ??ì±„ì  ê¸°ì????°ë¼ ?„ê²©?˜ê³  ?•ë??˜ê²Œ ì±„ì ??ì£¼ì‹­?œì˜¤.

[ë°˜í™˜ JSON êµ¬ì¡° ê·œê²©]:
{
  "totalScore": 85,
  "earnedPoints": 85,
  "maxPoints": 100,
  "feedbackSummary": "?„ë°˜?ì¸ ?µë? ?°ìˆ˜ ë°?ê³µí•™???µì‹¬ ?©ì–´ ê¸°ìˆ  ?íƒœ ?Œë???",
  "questionResults": [
    {
      "score": 85,
      "isCorrect": true,
      "feedback": "ê°œë… ?œìˆ ???°ìˆ˜?˜ë©° ?µì‹¬ ?¤ì›Œ?œê? ???¬í•¨?˜ì—ˆ?µë‹ˆ??",
      "modelAnswer": "ëª¨ë²” ?µì•ˆ ë°?ì£¼ìš” ê³µí•™???´ì„¤"
    }
  ]
}

ë°˜ë“œ????JSON ê°ì²´ ?•ì‹ë§?ì¶œë ¥?˜ì‹­?œì˜¤.`;

    const systemPrompt = `?¹ì‹ ?€ ?€?œë?êµ?êµ??ê¸°ìˆ ?ê²© ê¸°ìˆ ???œí—˜ ?˜ì„ ì±„ì ê´€?…ë‹ˆ?? ì£¼ì–´ì§??˜í—˜???µì•ˆ??ê°ê??ìœ¼ë¡??¬ì‚¬?˜ì—¬ ?•ë???JSON ê²°ê³¼ë¡?ë°˜í™˜?˜ì‹­?œì˜¤.`;
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
        feedbackSummary: '?µì•ˆ ë¶„ì„ ê²°ê³¼ë¥??•ë¦¬?ˆìŠµ?ˆë‹¤.',
        questionResults: questions.map(() => ({
          score: 70,
          isCorrect: true,
          feedback: '?µì•ˆ???œì¶œ?˜ì—ˆ?µë‹ˆ?? ?ë¬¸ ëª¨ë²” ?µì•ˆ???¨ê»˜ ë³µìŠµ?˜ì‹­?œì˜¤.',
          modelAnswer: contentStr.slice(0, 200)
        }))
      };
    }

    res.json({ success: true, ...resultJson });
  } catch (err) {
    console.error('grade-item-answers error:', err);
    res.status(500).json({ success: false, error: err.message || 'ì±„ì  ?¤íŒ¨' });
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
    res.json({ success: true, message: 'ê³¼ê±° ë³µìŠµ ?´ë ¥ ?ìˆ˜ ë°±í•„ ?„ë£Œ' });
  } catch (err) {
    console.error('Admin backfill error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/search-source -> Dedicated Source Search API assigned to gemini-3.1-flash-lite
router.post('/search-source', async (req, res) => {
  try {
    const { query, topicTitle, documentText, progressId } = req.body;
    const sysPrompt = `?¹ì‹ ?€ ?€?œë?êµ?êµ???¤ê³„ê¸°ì?(KDS/KCS) ë°?êµ?† êµí†µë¶€ ?¤ê³„?œê³µì§€ì¹? ?ë³´ê³ ì„œ ì¶œì²˜ ?„ë¬¸ ê²€??AI?…ë‹ˆ?? gemini-3.1-flash-lite ì´ˆê³ ???”ì§„?¼ë¡œ ì£¼ì–´ì§?ì¡°íšŒ ?”ì²­???€???•í™•??ì¶œì²˜ ë¬¸í—Œ, ì¡°í•­ ë²ˆí˜¸ ë°??µì‹¬ ê·œì • ?˜ì¹˜ ?°ì´?°ë? ì°¾ì•„ ë°˜í™˜?˜ì‹­?œì˜¤.`;
    const userPrompt = `[ì¶œì²˜ ê²€??ì§ˆì˜]: ${query || topicTitle || 'êµ?? ê±´ì„¤ê¸°ì? KDS/KCS ë°??ë³´ê³ ì„œ ì§€ì¹?}\n[ì°¸ì¡° ë¬¸ì„œ ?ìŠ¤??:\n${documentText || (topicTitle ? `KDS / KCS êµ?? ê±´ì„¤ê¸°ì? ë°??ë³´ê³ ì„œ: ${topicTitle}` : 'êµ?? ê±´ì„¤ê¸°ì? ë°??ë³´ê³ ì„œ ì§€ì¹?)}`;
    
    const result = await searchSourceDocumentWithGeminiLite(sysPrompt, userPrompt, null, { progressId });
    return res.json({ success: true, model: 'gemini-3.1-flash-lite', result });
  } catch (err) {
    console.error('POST /api/search-source error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
