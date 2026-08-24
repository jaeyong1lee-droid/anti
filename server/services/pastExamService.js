import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { dbQuery } from '../database.js';
import { saveSessionValue } from './aiService.js';

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
 */
export async function loadAllPastExamQuestions(forceReload = false) {
  const now = Date.now();
  if (!forceReload && cachedExamQuestions && cachedExamQuestions.length > 0 && (now - lastScanTime < 60 * 60 * 1000)) {
    return cachedExamQuestions;
  }

  const examsDir = process.env.PAST_EXAMS_DIR || DEFAULT_EXAMS_DIR;
  if (!fs.existsSync(examsDir)) {
    console.warn(`[pastExamService] Exams directory not found: ${examsDir}`);
    return cachedExamQuestions || [];
  }

  const files = fs.readdirSync(examsDir).filter(f => f.toLowerCase().endsWith('.pdf'));
  const allQuestions = [];

  for (const filename of files) {
    const fullPath = path.join(examsDir, filename);
    try {
      const dataBuffer = fs.readFileSync(fullPath);
      const pdfData = await pdf(dataBuffer, { max: 1 });
      const text = pdfData.text || '';

      // Skip DRM protected files
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
              allQuestions.push(currentQ);
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
        allQuestions.push(currentQ);
      }
    } catch (err) {
      console.warn(`[pastExamService] Failed to parse ${filename}:`, err.message);
    }
  }

  cachedExamQuestions = allQuestions;
  lastScanTime = now;
  console.log(`[pastExamService] Loaded ${allQuestions.length} past exam questions from ${files.length} PDFs.`);
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
    // Pick randomly from eligible candidates
    const randomIndex = Math.floor(Math.random() * availableCandidates.length);
    selectedQuestion = availableCandidates[randomIndex];
  } else {
    // If all questions were served within 7 days, pick the one served longest ago
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
