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

  // Also cross-check recent questions list to ensure no recently served question is missed
  const recentIds = new Set();
  try {
    const recentList = await getRecentLockscreenSubmissions();
    for (const item of recentList) {
      const qId = item?.question?.id || item?.id;
      if (qId) recentIds.add(qId);
    }
  } catch (e) {}

  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // 1순위: 한 번도 출제된 적 없는 미출제 문제를 최우선 배정
  const unservedCandidates = allQuestions.filter(q => !history[q.id] && !recentIds.has(q.id));

  let selectedQuestion = null;

  if (unservedCandidates.length > 0) {
    const randomIndex = Math.floor(Math.random() * unservedCandidates.length);
    selectedQuestion = unservedCandidates[randomIndex];
  } else {
    // 2순위: 전 문항(299개)을 모두 1회 이상 학습한 경우에만 7일 경과 문항 순환
    const availableCandidates = allQuestions.filter(q => {
      const lastServed = history[q.id];
      if (!lastServed) return true;
      return (now - lastServed) >= SEVEN_DAYS_MS;
    });

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
 * Checks whether a lockscreen assignment has been solved/graded.
 */
export function isLockscreenAssignmentSolved(assignment) {
  if (!assignment) return false;
  if (assignment.isSolved) return true;
  if (assignment.gradingResult && typeof assignment.gradingResult.score === 'number') {
    // If score is 0 due to empty submission ("답안이 입력되지 않았습니다."), not considered solved
    if (assignment.gradingResult.score === 0 && assignment.gradingResult.reason?.includes('입력되지 않았습니다')) {
      return false;
    }
    return true;
  }
  return false;
}

let inFlightAssignmentPromise = null;

/**
 * Gets or creates the currently active lockscreen assignment with format LOCK{YYMMDD}_{seq}.
 * Synchronized across PC, Mobile, and all devices via Cloud DB.
 * [🚨 절대 원칙: "다음부터는 다 풀면 문제를 만들어"]
 * 현재 배정된 문제를 다 풀어서 채점이 완료(isSolved === true)되기 전까지는 어떠한 경우에도 새 문제를 생성하지 않는다.
 */
export async function getActiveLockscreenAssignment(forceNew = false) {
  if (inFlightAssignmentPromise) {
    return await inFlightAssignmentPromise;
  }
  inFlightAssignmentPromise = _getActiveLockscreenAssignmentCore(forceNew).finally(() => {
    inFlightAssignmentPromise = null;
  });
  return await inFlightAssignmentPromise;
}

async function _getActiveLockscreenAssignmentCore(forceNew = false) {
  const { dateStr, yymmdd } = getKSTDateInfo();

  let activeAssignment = null;
  try {
    const activeRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'current_lockscreen_assignment'");
    if (activeRow && activeRow.value) {
      activeAssignment = JSON.parse(activeRow.value);
    }
  } catch (e) {
    console.warn('[pastExamService] Failed to read active assignment:', e.message);
  }

  // 1. 현재 배정된 문제가 존재할 때의 처리
  if (activeAssignment && activeAssignment.lockscreen_id && activeAssignment.question) {
    const isToday = activeAssignment.yymmdd === yymmdd;
    const isSolved = isLockscreenAssignmentSolved(activeAssignment);

    // Case 1: 오늘 날짜(yymmdd)에 배정된 문제인 경우
    if (isToday) {
      // 사용자가 명시적으로 '다른 문제 보기'(forceNew === true)를 요청하지 않은 경우:
      // - 아직 안 풀었으면(!isSolved): 풀던 중 새로고침/포커스/탭전환에도 현재 문제를 안전하게 유지
      // - 이미 풀었으면(isSolved): 채점 결과 확인을 위해 유지
      if (!forceNew) {
        return activeAssignment;
      }
      // 사용자가 명시적으로 '다른 문제 보기'(forceNew === true)를 클릭한 경우:
      // 아래 2번으로 내려가서 현재 문제를 아카이빙하고 오늘의 다음 문제(LOCK{yymmdd}_{nextSeq})를 생성!
      console.log(`[pastExamService] '다른 문제 보기' (forceNew=true) requested for today's assignment. Archiving and generating next question.`);
    } else {
      // Case 2: 과거 날짜의 문제인 경우 (날짜 변경!)
      // 오늘 접속했으면 무조건 오늘 날짜의 첫 문제(LOCK{yymmdd}_1)를 배정해야 함!
      // 과거 문제는 lockscreen_recent_questions에 보존/아카이빙하고 아래 2번으로 통과하여 오늘 문제 생성.
      console.log(`[pastExamService] Date transitioned from ${activeAssignment.yymmdd} to ${yymmdd}. Archiving old assignment ${activeAssignment.lockscreen_id} and generating today's question.`);
    }
  }

  // 2. 신규 문제 생성 (오늘 날짜의 첫 문제이거나, 사용자가 '다른 문제 보기'를 클릭한 경우)
  let nextSeq = 1;
  try {
    const recentList = await getRecentLockscreenSubmissions();
    for (const item of recentList) {
      const lid = item.question?.lockscreen_id || item.lockscreen_id || '';
      if (lid.startsWith(`LOCK${yymmdd}_`)) {
        const parsed = parseInt(lid.split('_')[1], 10);
        if (!isNaN(parsed) && parsed >= nextSeq) {
          nextSeq = parsed + 1;
        }
      }
    }
    if (activeAssignment && activeAssignment.yymmdd === yymmdd && typeof activeAssignment.seq === 'number' && activeAssignment.seq >= nextSeq) {
      nextSeq = activeAssignment.seq + 1;
    }
  } catch (seqErr) {
    console.warn('[pastExamService] Failed to determine nextSeq from recent list:', seqErr.message);
  }

  // Archive previous assignment into lockscreen_recent_questions so it is never lost
  let prevAssignment = activeAssignment;
  if (prevAssignment && prevAssignment.question) {
    try {
      await saveRecentLockscreenSubmission({
        question: prevAssignment.question,
        userAnswer: prevAssignment.userAnswer || '',
        gradingResult: prevAssignment.gradingResult || null,
        hint: prevAssignment.hint || ''
      });
    } catch (archiveErr) {
      console.warn('[pastExamService] Failed to archive previous assignment:', archiveErr.message);
    }
  }

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
    // Immediately register new assignment to recent questions with overwrite: true so old answers never leak
    await saveRecentLockscreenSubmission({
      question: newAssignment.question,
      userAnswer: '',
      gradingResult: null,
      hint: '',
      overwrite: true
    });
    console.log(`[pastExamService] Synchronized lockscreen assignment active (solved-first gate passed): ${lockscreenId} - [${newQuestion.sessionName} 제1교시 ${newQuestion.number}번]`);
  } catch (saveErr) {
    console.warn('[pastExamService] Failed to save active assignment:', saveErr.message);
  }

  return newAssignment;
}

/**
 * Sets an existing / recent assignment as the currently active lockscreen assignment.
 * When the user selects an older question from history or recent dropdown,
 * this synchronizes the server so the selected question remains active.
 */
export async function selectActiveLockscreenAssignment(targetQuestion, userAnswer = '', gradingResult = null, hint = '') {
  if (!targetQuestion) return null;
  const lockscreenId = targetQuestion.lockscreen_id || null;
  const { dateStr, yymmdd } = getKSTDateInfo();

  let seq = 1;
  let qYymmdd = yymmdd;
  if (lockscreenId && lockscreenId.startsWith('LOCK') && lockscreenId.includes('_')) {
    const raw = lockscreenId.slice(4);
    const parts = raw.split('_');
    if (parts[0] && parts[0].length === 6) qYymmdd = parts[0];
    const parsed = parseInt(parts[1], 10);
    if (!isNaN(parsed)) seq = parsed;
  }

  const assignment = {
    lockscreen_id: lockscreenId || `LOCK${yymmdd}_${seq}`,
    date: targetQuestion.date || (qYymmdd === yymmdd ? dateStr : `20${qYymmdd.slice(0, 2)}-${qYymmdd.slice(2, 4)}-${qYymmdd.slice(4, 6)}`),
    yymmdd: qYymmdd,
    seq,
    question: {
      ...targetQuestion,
      lockscreen_id: lockscreenId || `LOCK${yymmdd}_${seq}`
    },
    userAnswer: userAnswer || '',
    gradingResult: gradingResult || null,
    hint: hint || '',
    updatedAt: Date.now()
  };

  try {
    await saveSessionValue('current_lockscreen_assignment', JSON.stringify(assignment));
    await saveRecentLockscreenSubmission({
      question: assignment.question,
      userAnswer: assignment.userAnswer,
      gradingResult: assignment.gradingResult,
      hint: assignment.hint
    });
    console.log(`[pastExamService] Selected lockscreen assignment now active: ${assignment.lockscreen_id} - [${assignment.question.sessionName} 제1교시 ${assignment.question.number}번]`);
  } catch (err) {
    console.warn('[pastExamService] Failed to save selected assignment:', err.message);
  }

  return assignment;
}

/**
 * Updates the user's answer, grading result, or hint for the currently active lockscreen assignment.
 * CRITICAL: Only updates if targetQuestion matches the currently active assignment!
 * If targetQuestion is provided and does not match, rejects the update to prevent cross-question contamination.
 */
export async function updateActiveLockscreenAnswer(userAnswer, gradingResult, hint, targetQuestion = null) {
  try {
    const activeRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'current_lockscreen_assignment'");
    if (activeRow && activeRow.value) {
      const assignment = JSON.parse(activeRow.value);
      if (assignment && assignment.question) {
        // Validation: Ensure the answer being updated belongs to the active assignment
        if (targetQuestion) {
          const targetLockscreenId = targetQuestion.lockscreen_id;
          const targetQId = targetQuestion.id || `${targetQuestion.sessionName}_${targetQuestion.number}` || targetQuestion.question;
          const currentLockscreenId = assignment.lockscreen_id;
          const currentQId = assignment.question?.id || `${assignment.question?.sessionName}_${assignment.question?.number}` || assignment.question?.question;

          const isLockscreenMismatch = targetLockscreenId && currentLockscreenId && targetLockscreenId !== currentLockscreenId;
          const isQIdMismatch = targetQId && currentQId && targetQId !== currentQId;

          if (isLockscreenMismatch || isQIdMismatch) {
            console.log(`[pastExamService] Target question does not match active assignment (${targetQId} vs ${currentQId}). Saving to recent list only.`);
            saveRecentLockscreenSubmission({
              question: targetQuestion,
              userAnswer,
              gradingResult,
              hint
            }).catch(() => {});
            return null;
          }
        }

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
export async function saveRecentLockscreenSubmission({ question, userAnswer, gradingResult, hint, overwrite = false }) {
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
      const existingItem = list[existingIndex];
      const entryLockId = entry.question?.lockscreen_id;
      const existingLockId = existingItem.question?.lockscreen_id;
      const isDifferentLockAssignment = Boolean(entryLockId && existingLockId && entryLockId !== existingLockId);
      const shouldReplaceCleanly = overwrite || isDifferentLockAssignment;

      list[existingIndex] = {
        ...existingItem,
        ...entry,
        question: {
          ...existingItem.question,
          ...entry.question,
          lockscreen_id: entryLockId || existingLockId
        },
        userAnswer: shouldReplaceCleanly
          ? entry.userAnswer
          : (entry.userAnswer || existingItem.userAnswer || ''),
        gradingResult: shouldReplaceCleanly
          ? entry.gradingResult
          : (entry.gradingResult || existingItem.gradingResult || null),
        hint: shouldReplaceCleanly
          ? entry.hint
          : (entry.hint || existingItem.hint || '')
      };
      // Keep position fixed! Do NOT splice & unshift to prevent reordering
    } else {
      list.unshift(entry);
    }

    // Retain up to 20 most recent questions
    if (list.length > 20) {
      list = list.slice(0, 20);
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

