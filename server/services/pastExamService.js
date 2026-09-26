import fs from 'fs';
import path from 'path';
import { dbQuery } from '../database.js';
import { saveSessionValue } from './aiService.js';
import { defaultPastExamQuestions } from '../data/pastExamQuestions.js';

const DEFAULT_EXAMS_DIR = 'D:/OneDrive - 대우건설/05.기술사/기출문제';

let cachedExamQuestions = null;
let lastScanTime = 0;

/**
 * Extracts session name from file name (e.g. "★제130회 토질및기초기술사 문제지.pdf" -> "제130회")
 */
function extractExamSession(filename) {
  const match = filename.match(/(?:제\s*)?(\d{2,3})\s*회/);
  if (match) {
    return `제${match[1]}회`;
  }
  return filename.replace(/\.pdf$/i, '').trim();
}

/**
 * Parses all 1st period (제1교시) questions from PDF files in the past exams folder.
 * Uses default pre-extracted dataset as fallback and baseline for cloud/Vercel environments.
 */
export async function loadAllPastExamQuestions(forceReload = false) {
  const now = Date.now();
  if (!forceReload && cachedExamQuestions && cachedExamQuestions.length > 0 && (now - lastScanTime < 60 * 60 * 1000)) {
    return cachedExamQuestions;
  }

  // Base list from pre-extracted dataset (works in both local and Vercel cloud environments)
  let allQuestions = Array.isArray(defaultPastExamQuestions) ? [...defaultPastExamQuestions] : [];

  const examsDir = process.env.PAST_EXAMS_DIR || DEFAULT_EXAMS_DIR;
  
  // If running locally where the exams folder exists, scan for any newly added PDFs dynamically
  if (fs.existsSync(examsDir)) {
    try {
      const pdfModule = await import('pdf-parse');
      const pdf = pdfModule.default || pdfModule;
      const files = fs.readdirSync(examsDir).filter(f => f.toLowerCase().endsWith('.pdf'));
      const localScannedQuestions = [];

      for (const filename of files) {
        const fullPath = path.join(examsDir, filename);
        try {
          const dataBuffer = fs.readFileSync(fullPath);
          const pdfData = await pdf(dataBuffer, { max: 1 });
          const text = pdfData.text || '';

          if (text.includes('Azure Information Protection') || text.includes('protected document')) {
            continue;
          }

          const sessionName = extractExamSession(filename);
          const sessionNumMatch = sessionName.match(/\d+/);
          const sessionNumStr = sessionNumMatch ? sessionNumMatch[0].padStart(3, '0') : '000';

          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          let currentQ = null;
          let currentNum = 0;

          for (const line of lines) {
            const match = line.match(/^([0-9]{1,2})\s*[\.\,\)]\s*(.*)/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num === currentNum + 1 && num <= 13) {
                if (currentQ) {
                  localScannedQuestions.push(currentQ);
                }
                currentNum = num;
                currentQ = {
                  id: `exam_${sessionNumStr}_${num}`,
                  sessionName,
                  period: '제1교시',
                  number: num,
                  question: match[2].trim(),
                  fullTitle: `[${sessionName} 제1교시 ${num}번] ${match[2].trim()}`,
                  file: filename
                };
                continue;
              }
            }
            if (currentQ && currentNum <= 13) {
              if (!line.includes('1-1') && !line.includes('청렴') && !line.includes('선택하여') && !line.includes('시험시간') && !line.includes('기술사제') && !line.includes('채점기준') && !line.includes('공공기관')) {
                currentQ.question += ' ' + line;
                currentQ.fullTitle = `[${currentQ.sessionName} 제1교시 ${currentQ.number}번] ${currentQ.question}`;
              }
            }
          }
          if (currentQ && currentNum <= 13) {
            localScannedQuestions.push(currentQ);
          }
        } catch (fileErr) {
          console.warn(`[pastExamService] Failed to dynamically parse ${filename}:`, fileErr.message);
        }
      }

      if (localScannedQuestions.length > 0) {
        const cleanMap = new Map((defaultPastExamQuestions || []).map(q => [q.id, q]));
        allQuestions = localScannedQuestions.map(q => cleanMap.get(q.id) || q);
      }
    } catch (importErr) {
      console.warn('[pastExamService] Dynamic pdf-parse load skipped, using pre-extracted dataset:', importErr.message);
    }
  }

  cachedExamQuestions = allQuestions;
  lastScanTime = now;
  return allQuestions;
}

/**
 * Selects a random question that has not been served in the past 7 days.
 */
export async function getRandomLockscreenExamQuestion() {
  const allQuestions = await loadAllPastExamQuestions();
  if (!allQuestions || allQuestions.length === 0) {
    throw new Error('기출문제 데이터를 불러올 수 없습니다.');
  }

  // Load 7-day usage history from DB
  let history = {};
  try {
    const historyRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_past_exam_history'");
    if (historyRow && historyRow.value) {
      history = JSON.parse(historyRow.value) || {};
    }
  } catch (e) {
    console.warn('[pastExamService] Failed to read exam history from app_session:', e.message);
  }

  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // Filter candidates: questions never served or served >= 7 days ago
  const availableCandidates = allQuestions.filter(q => {
    const lastServed = history[q.id];
    if (!lastServed) return true;
    return (now - lastServed) >= SEVEN_DAYS_MS;
  });

  let selectedQuestion = null;

  if (availableCandidates.length > 0) {
    const randomIndex = Math.floor(Math.random() * availableCandidates.length);
    selectedQuestion = availableCandidates[randomIndex];
  } else {
    const sortedByOldest = [...allQuestions].sort((a, b) => {
      const timeA = history[a.id] || 0;
      const timeB = history[b.id] || 0;
      return timeA - timeB;
    });
    selectedQuestion = sortedByOldest[0];
  }

  // Record question selection timestamp
  if (selectedQuestion) {
    history[selectedQuestion.id] = now;
    try {
      await saveSessionValue('lockscreen_past_exam_history', JSON.stringify(history));
    } catch (saveErr) {
      console.warn('[pastExamService] Failed to save exam history to app_session:', saveErr.message);
    }
  }

  return selectedQuestion;
}

/**
 * Returns current Korea Standard Time (KST, UTC+9) date strings.
 */
export function getKSTDateInfo() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST UTC+9
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const yy = String(year).slice(-2);
  return {
    dateStr: `${year}-${month}-${day}`,
    yymmdd: `${yy}${month}${day}` // e.g. "260923"
  };
}

/**
 * Gets or creates the currently active lockscreen assignment with format LOCK{YYMMDD}_{seq}.
 * Synchronized across PC, Mobile, and all devices via Cloud DB.
 */
export async function getActiveLockscreenAssignment(forceNew = false) {
  const { dateStr, yymmdd } = getKSTDateInfo();

  if (!forceNew) {
    try {
      const activeRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'current_lockscreen_assignment'");
      if (activeRow && activeRow.value) {
        const assignment = JSON.parse(activeRow.value);
        if (assignment && assignment.lockscreen_id && assignment.question) {
          // If assignment matches today's date, return it directly
          if (assignment.yymmdd === yymmdd) {
            return assignment;
          }
        }
      }
    } catch (e) {
      console.warn('[pastExamService] Failed to read active assignment:', e.message);
    }
  }

  // Need new assignment: calculate sequence number for today
  let nextSeq = 1;
  try {
    const activeRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'current_lockscreen_assignment'");
    if (activeRow && activeRow.value) {
      const prev = JSON.parse(activeRow.value);
      if (prev && prev.yymmdd === yymmdd) {
        nextSeq = (prev.seq || 0) + 1;
      }
    }
  } catch (e) {}

  const lockscreenId = `LOCK${yymmdd}_${nextSeq}`;
  const newQuestion = await getRandomLockscreenExamQuestion();

  const newAssignment = {
    lockscreen_id: lockscreenId,
    date: dateStr,
    yymmdd,
    seq: nextSeq,
    question: {
      ...newQuestion,
      lockscreen_id: lockscreenId
    },
    userAnswer: '',
    gradingResult: null,
    hint: '',
    updatedAt: Date.now()
  };

  try {
    await saveSessionValue('current_lockscreen_assignment', JSON.stringify(newAssignment));
    console.log(`[pastExamService] Synchronized lockscreen assignment active: ${lockscreenId} - [${newQuestion.sessionName} 제1교시 ${newQuestion.number}번]`);
  } catch (saveErr) {
    console.warn('[pastExamService] Failed to save active assignment:', saveErr.message);
  }

  return newAssignment;
}

/**
 * Updates the user's answer, grading result, or hint for the currently active lockscreen assignment.
 */
export async function updateActiveLockscreenAnswer(userAnswer, gradingResult, hint) {
  try {
    const activeRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'current_lockscreen_assignment'");
    if (activeRow && activeRow.value) {
      const assignment = JSON.parse(activeRow.value);
      if (assignment) {
        if (typeof userAnswer === 'string') assignment.userAnswer = userAnswer;
        if (gradingResult !== undefined) assignment.gradingResult = gradingResult;
        if (hint !== undefined) assignment.hint = hint;
        assignment.updatedAt = Date.now();
        await saveSessionValue('current_lockscreen_assignment', JSON.stringify(assignment));

        if (assignment.question) {
          saveRecentLockscreenSubmission({
            question: assignment.question,
            userAnswer: assignment.userAnswer,
            gradingResult: assignment.gradingResult,
            hint: assignment.hint
          }).catch(() => {});
        }

        return assignment;
      }
    }
  } catch (e) {
    console.warn('[pastExamService] Failed to update active assignment answer:', e.message);
  }
  return null;
}

/**
 * Saves or updates a question in the recent 10 lockscreen questions list.
 */
export async function saveRecentLockscreenSubmission({ question, userAnswer, gradingResult, hint }) {
  if (!question) return [];
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_recent_questions'");
    let list = [];
    if (row && row.value) {
      try {
        list = JSON.parse(row.value);
        if (!Array.isArray(list)) list = [];
      } catch (e) {
        list = [];
      }
    }

    const qId = question.id || `${question.sessionName}_${question.number}` || question.question;
    const existingIndex = list.findIndex(item => {
      const itemQId = item.question?.id || `${item.question?.sessionName}_${item.question?.number}` || item.question?.question;
      return itemQId === qId;
    });

    const entry = {
      id: qId,
      question: { ...question },
      userAnswer: typeof userAnswer === 'string' ? userAnswer : '',
      gradingResult: gradingResult || null,
      hint: hint || '',
      updatedAt: Date.now()
    };

    if (existingIndex >= 0) {
      list[existingIndex] = {
        ...list[existingIndex],
        ...entry,
        userAnswer: entry.userAnswer || list[existingIndex].userAnswer || '',
        gradingResult: entry.gradingResult || list[existingIndex].gradingResult || null,
        hint: entry.hint || list[existingIndex].hint || ''
      };
      // Move to front as most recently active
      const updatedItem = list.splice(existingIndex, 1)[0];
      list.unshift(updatedItem);
    } else {
      list.unshift(entry);
    }

    // Retain only the 10 most recent questions
    if (list.length > 10) {
      list = list.slice(0, 10);
    }

    await saveSessionValue('lockscreen_recent_questions', JSON.stringify(list));
    return list;
  } catch (err) {
    console.warn('[pastExamService] Failed to save recent lockscreen submission:', err.message);
    return [];
  }
}

/**
 * Retrieves the recent 10 lockscreen questions with their user answers and grading results.
 */
export async function getRecentLockscreenSubmissions() {
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_recent_questions'");
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) return parsed.slice(0, 10);
    }
  } catch (e) {
    console.warn('[pastExamService] Failed to read recent lockscreen submissions:', e.message);
  }
  return [];
}

