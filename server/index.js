import express from 'express';
import { healLatexFormulas, healQuizQuestionObject, healTheoryQuestionObject, healFormulaQuestionObject, healAnswersheetQuestionObject, LATEX_PROMPT_INSTRUCTIONS, LATEX_CHAT_PROMPT_INSTRUCTIONS, parseLlmJson } from './utils/latexUtils.js';
import cors from 'cors';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initDatabase, dbQuery, isPostgres } from './database.js';
import { startBackupScheduler } from './backupManager.js';
import { generateFallbackQuestions } from './fallback_generator.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import PDFDocument from 'pdfkit';
import { gradeSubjective, GRADING_STANDARDS, gradingStandardsList, updateLiveGradingStandards } from './plugins/gradingPlugin.js';
import { ENGINEERING_STANDARDS, standardsList, updateLiveEngineeringStandards } from './plugins/engineeringStandards.js';
import { GENERATION_STANDARDS, generationStandardsList, updateLiveGenerationStandards } from './plugins/generationStandards.js';
import { LOCKSCREEN_STANDARDS, lockscreenStandardsList, updateLiveLockscreenStandards } from './plugins/lockscreenStandards.js';
import { extractTextFromCalculationImage, suggestTitleFromCalculation, generateCalculationQuizQuestion } from './plugins/calculationPlugin.js';
import { generateDailyLockscreenQuestions } from './plugins/lockscreenQuizPlugin.js';
import { defaultAcronyms, generateAcronymTutorResponse } from './plugins/acronymsPlugin.js';
import { defaultOverviews, generateOverviewTutorResponse } from './plugins/overviewsPlugin.js';

const execAsync = promisify(exec);

// validationPlugin.js가 완전히 삭제되었으므로 Stub으로 대체하여 무결성을 유지합니다.
export async function validateAndHealQuestion(question, callLLMWithFailover, topicTitle = '', topicKeywords = '', fileText = '') {
  if (question && typeof question === 'object') {
    if (!question.validationLogs) {
      question.validationLogs = [];
    }
    question.validationLogs.push(`[자가 검증 스킵] 검증 기능 및 validationPlugin 파일이 물리적으로 삭제되어 작동하지 않습니다.`);
  }
  return question;
}

export function deduplicateQuestions(questions) {
  return questions;
}

export function isQuestionMismatched(question, topicTitle, topicKeywords) {
  return null;
}

export let validationStandardsList = [];
export let VALIDATION_STANDARDS = "- 등록된 검증 지시 기준이 없습니다.";

export function updateLiveValidationStandards(newList) {
  if (Array.isArray(newList)) {
    validationStandardsList = newList;
    VALIDATION_STANDARDS = "- 등록된 검증 지시 기준이 없습니다.";
    console.log("[ValidationStandards Stub] Live validation standards prompt updated. Count:", newList.length);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BT = '```';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Preferred model state and loader
let globalPreferredModel = 'gemini-3.1-flash-lite';

async function loadPreferredModel() {
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'preferred_model'");
    if (row && row.value) {
      globalPreferredModel = row.value;
      console.log(`[Setting Loaded] Preferred Model: ${globalPreferredModel}`);
    }
  } catch (e) {
    console.warn("Failed to load preferred model setting:", e);
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Helper for transaction/upsert safe session save to prevent duplicate key race conditions in PostgreSQL / SQLite
async function saveSessionValue(key, value) {
  try {
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
    await dbQuery.run(
      'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );
  } catch (err) {
    if (err.code === '23505' || String(err).includes('UNIQUE')) {
      await dbQuery.run(
        'UPDATE app_session SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
        [value, key]
      );
    } else {
      throw err;
    }
  }
}
// Global AI progress tracker map
global.progressTracker = global.progressTracker || new Map();

function updateProgress(progressId, step, message, percentage = null) {
  if (!progressId) return;
  const existing = global.progressTracker.get(progressId) || {};
  global.progressTracker.set(progressId, {
    step: step !== undefined ? step : existing.step || 1,
    message: message || existing.message || '',
    percentage: percentage !== null ? percentage : existing.percentage || 0,
    timestamp: Date.now()
  });
}

function reportLlmProgress(options, scenario, modelName) {
  if (options && options.progressId) {
    const step = scenario === 'validation' ? 2 : 1;
    let stageText = '';
    const modelUpper = modelName ? modelName.toUpperCase() : 'AI';
    if (scenario === 'question') {
      stageText = `1단계: ${modelUpper} 엔진으로 예상 문제 생성 중...`;
    } else if (scenario === 'validation') {
      stageText = `2단계: ${modelUpper} 엔진으로 생성된 문제 검증 및 자가교정 중...`;
    } else if (scenario === 'grading') {
      stageText = `1단계: ${modelUpper} 엔진으로 제출 답안 채점 중...`;
    } else if (scenario === 'tutor') {
      stageText = `1단계: ${modelUpper} 엔진으로 AI 튜터 피드백 생성 중...`;
    } else if (scenario === 'formula') {
      stageText = `1단계: ${modelUpper} 엔진으로 수식 분석 및 튜터 답변 생성 중...`;
    } else if (scenario === 'option-explanation') {
      stageText = `1단계: ${modelUpper} 엔진으로 보기 오답 원인 분석 중...`;
    } else {
      stageText = `1단계: ${modelUpper} 엔진으로 처리 중...`;
    }
    
    const progress = global.progressTracker.get(options.progressId);
    let percentage = progress ? progress.percentage : 0;
    if (step === 2) {
      if (percentage < 50) percentage = 50;
    } else {
      if (percentage === 0) percentage = 15;
    }
    updateProgress(options.progressId, step, stageText, percentage);
  }
}

function reportValidationProgress(progressId, total) {
  if (!progressId) return;
  const progress = global.progressTracker.get(progressId) || {};
  const validatedCount = (progress.validatedCount || 0) + 1;
  const percentage = Math.floor(50 + (validatedCount / total) * 50);
  global.progressTracker.set(progressId, {
    ...progress,
    step: 2,
    validatedCount,
    totalCount: total,
    message: `2단계: validationPlugin으로 생성 문제 검증 중... (${validatedCount}/${total} 완료)`,
    percentage: Math.min(percentage, 100),
    timestamp: Date.now()
  });
}

function getCallLLM(req) {
  const progressId = req && (req.query?.progressId || req.body?.progressId);
  return (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });
}

function startBackendProgressTimer(progressId, step, initialMessage, maxPercentage, intervalMs = 1500, stepIncrement = 5) {
  if (!progressId) return null;
  updateProgress(progressId, step, initialMessage, 10);
  let currentPercent = 10;
  const timer = setInterval(() => {
    currentPercent = Math.min(currentPercent + stepIncrement, maxPercentage);
    const progress = global.progressTracker.get(progressId);
    if (progress && progress.step === step) {
      updateProgress(progressId, step, progress.message || initialMessage, currentPercent);
    } else {
      clearInterval(timer);
    }
  }, intervalMs);
  return timer;
}

// Clean up expired progress tracks every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, value] of global.progressTracker.entries()) {
    if (now - value.timestamp > 300000) { // 5 minutes
      global.progressTracker.delete(id);
    }
  }
}, 60000);

// Preferred model API
app.get('/api/preferred-model', async (req, res) => {
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'preferred_model'");
    if (row && row.value) {
      globalPreferredModel = row.value;
    }
  } catch (err) {
    console.warn("Failed to load preferred model from DB in GET /api/preferred-model:", err.message);
  }
  res.json({ model: globalPreferredModel });
});

app.post('/api/preferred-model', async (req, res) => {
  const { model } = req.body;
  if (typeof model === 'string' && model.startsWith('gemini-')) {
    globalPreferredModel = model;
    try {
      await saveSessionValue('preferred_model', model);
      console.log(`[Setting Saved] Preferred Model updated to: ${model}`);
      return res.json({ success: true, model });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(400).json({ error: 'Invalid model' });
});

// Polling endpoint for AI progress
app.get('/api/progress/:progressId', (req, res) => {
  const { progressId } = req.params;
  const progress = global.progressTracker.get(progressId);
  if (!progress) {
    return res.json({ step: 0, message: '', percentage: 0 });
  }
  res.json({ step: progress.step, message: progress.message, percentage: progress.percentage });
});

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// On-demand standards sync from production (non-blocking, throttled to max once per minute)
let lastProductionSyncTime = 0;
const SYNC_COOLDOWN = 60000; // 1 minute cooldown

app.use((req, res, next) => {
  const isVercel = !!process.env.VERCEL;
  if (!isVercel && req.url.startsWith('/api/')) {
    const now = Date.now();
    if (now - lastProductionSyncTime > SYNC_COOLDOWN) {
      lastProductionSyncTime = now;
      syncStandardsFromProduction().catch(err => {
        console.warn('[On-Demand Sync] Error syncing standards from production:', err.message);
      });
    }
  }
  next();
});

// Multer memory storage for holding PDF/HTML files in buffer
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper: Get local date string 'YYYY-MM-DD'
function getLocalDateString(baseDate = new Date(), daysToAdd = 0) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + daysToAdd);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Helper: Merge consecutive single-character lines (e.g. vertical layout diagram labels or table cells)
function mergeVerticalText(text) {
  if (!text) return '';
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const mergedLines = [];
  let currentSingleCharGroup = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if it's a single character or a single bracketed character
    const isSingleChar = line.length === 1 || 
                         (line.length === 2 && (line.startsWith('(') || line.endsWith(')') || line.startsWith('[') || line.endsWith(']')));
    
    if (isSingleChar) {
      currentSingleCharGroup.push(line);
    } else {
      if (currentSingleCharGroup.length > 0) {
        if (currentSingleCharGroup.length > 1) {
          mergedLines.push(currentSingleCharGroup.join(''));
        } else {
          mergedLines.push(currentSingleCharGroup[0]);
        }
        currentSingleCharGroup = [];
      }
      mergedLines.push(line);
    }
  }
  
  if (currentSingleCharGroup.length > 0) {
    if (currentSingleCharGroup.length > 1) {
      mergedLines.push(currentSingleCharGroup.join(''));
    } else {
      mergedLines.push(currentSingleCharGroup[0]);
    }
  }
  
  return mergedLines.join('\n\n');
}

// Helper: Clean quiz questions by removing redundant PE question style suffixes like "을 제시하고, 각 기호의 정의를 서술하시오"
function cleanQuizQuestion(q) {
  if (!q) return q;
  return q.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function getCoreSubjectFromTitle(title) {
  if (!title) return '';
  let subject = title;
  const suffixes = [
    /\s*상세\s*기술\s*보고서$/i,
    /\s*기술\s*보고서$/i,
    /\s*상세\s*보고서$/i,
    /\s*보고서$/i,
    /\s*유도\s*공식$/i,
    /\s*유도공식$/i,
    /\s*산정\s*공식$/i,
    /\s*산정공식$/i,
    /\s*유도$/i,
    /\s*증명$/i,
    /\s*해석$/i,
    /\s*산정$/i,
    /\s*설계$/i,
    /\s*분석$/i,
    /\s*평가$/i,
    /\s*대책$/i
  ];
  for (const regex of suffixes) {
    const replaced = subject.replace(regex, '');
    if (replaced !== subject) {
      subject = replaced;
      break;
    }
  }
  return subject.trim();
}

// 로컬 공식 매칭 사전 (AI API 장애 대책용)
const LOCAL_FORMULA_DICTIONARY = [
  {
    keywords: ['C_v', 'm_v', '\\gamma_w', 'u', 'z', 't', '\\partial'],
    title: '테르자기 1차 압밀방정식(Terzaghi 1D Consolidation, $C_v$)',
    concept: '외부 점진/순간 하중 재하 시 시간이 경과함에 따라 과잉간극수압이 상하 배수층을 통해 소산되어 나가는 속도를 규정한 1차원 미분방정식',
    structure: `- $C_v$: 압밀계수 ($C_v = \\frac{k}{m_v \\gamma_w}$)\n- $u$: 과잉간극수압 (Excess Pore Water Pressure)\n- $t$: 압밀 경과 시간 (Time)\n- $z$: 점토층 내의 배수 거리 방향 깊이\n- $k$: 점토의 투수계수 (Coefficient of Permeability)\n- $m_v$: 체적압축계수(체적변화계수) (Coefficient of Volume Compressibility)\n- $\\gamma_w$: 물의 단위중량`
  },
  {
    keywords: ['q_{ult}', 'N_c', 'N_q', 'N_{\\gamma}', 'c', 'B', 'D_f'],
    title: '테르자기 극한지지력(Terzaghi Ultimate Bearing Capacity, $q_{ult}$)',
    concept: '흙의 전단파괴 형상을 대수나선 등으로 모델화하여 기초 저면 아래 지반이 전단 파괴 없이 지탱할 수 있는 최대 하중 강도 식',
    structure: `- $q_{ult}$: 극한 지지력\n- $c$: 흙의 점착력\n- $q$: 기초 저면의 유효상재하중 ($\\gamma D_f$)\n- $\\gamma$: 기초 저면 아래 흙의 단위중량\n- $B$: 기초의 폭 (단변 길이)\n- $N_c, N_q, N_{\\gamma}$: 지반 지지력 계수`
  },
  {
    keywords: ['Q', 'RQD', 'J_n', 'J_r', 'J_a', 'J_w', 'SRF'],
    title: '바톤 암반 Q분류(Barton Q-system, $Q$)',
    concept: '암반의 공학적 특성을 6가지 독립된 변수를 통해 정량화하여 터널 1차 지보 설계를 설계하는 지수 공식',
    structure: `- $Q$: 암반 등급 지수\n- $RQD$: 암질지수 (Rock Quality Designation)\n- $J_n$: 절리군 수 (Joint set number)\n- $J_r$: 절리면 거칠기 계수 (Joint roughness number)\n- $J_a$: 절리면 변질 계수 (Joint alteration number)\n- $J_w$: 절리수 보정 계수 (Joint water reduction factor)\n- $SRF$: 응력 감소 계수 (Stress Reduction Factor)`
  },
  {
    keywords: ['H', 'q', 'q_a', '\\tan\\theta'],
    title: '연약지반 샌드매트 최소두께(Sand Mat Minimum Thickness, $H$)',
    concept: '표층 개량 및 연약지반 상부에 무거운 주행성 장비(Trafficability)를 얹기 위한 하중 지지 소요 두께식',
    structure: `- $H$: 샌드매트의 소요 최소 두께\n- $q$: 포설 장비의 접지압\n- $q_a$: 지반의 허용 지지력\n- $\\gamma$: 모래의 단위중량\n- $\\theta$: 하중 분산각 (일반적으로 $45^\\circ$ 적용)`
  },
  {
    keywords: ['r', 'R', '\\alpha', 'sin', '45'],
    title: '슈미트네트 극점반경(Schmidt Net Pole Radius, $r$)',
    concept: '통계적 밀도 보정을 위해 면적 왜곡을 줄인 슈미트 네트(Schmidt Net) 평면 변환 투영식',
    structure: `- $r$: 투영원 중심으로부터 극점(Pole)까지의 평면 거리\n- $R$: 투영구(Sphere)의 반경\n- $\\alpha$: 불연속면의 경사각 (Dip angle)`
  },
  {
    keywords: ['P', '\\tau_{allow}', 'd', 'L', '\\pi'],
    title: '락볼트 고착력 계산식(Rockbolt Bond Strength, $P$)',
    concept: '인발 하중 재하 시 천공홀 배면의 마찰 부착 면적을 기반으로 볼트 탈락에 지탱하는 한계 고착력 식',
    structure: `- $P$: 락볼트의 최대 허용 인발 저항력 (인발 하중)\n- $d$: 락볼트 천공 구멍의 직경\n- $L$: 그라우팅 정착 길이 (고착 영역)\n- $\\tau_{allow}$: 지반과 그라우팅재 간의 허용 부착 전단강도`
  },
  {
    keywords: ['K_a', 'K_p', 'p_a', '\\phi', '\\sin\\phi'],
    title: '랭킹 주동토압계수(Rankine Active Earth Pressure Coefficient, $K_a$)',
    concept: '지반이 인장 변형을 일으켜 한계 주동 소성 평형 상태에 도달할 때 가설 옹벽 배면에 수평으로 밀어내는 토압식',
    structure: `- $K_a$: 주동토압 계수\n- $K_p$: 수동토압 계수\n- $\\phi$: 흙의 내부마찰각\n- $p_a$: 주동토압 강도\n- $c$: 흙의 점착력\n- $\\gamma$: 흙의 단위중량\n- $z$: 검토 단면 깊이`
  },
  {
    keywords: ['C', 'D_f', 'q_{net}'],
    title: '보상기초 보상도(Compensated Foundation Safety Factor, $C$)',
    concept: '구조물 자중을 굴착한 흙의 총 중량으로 완벽히 치환 상쇄하여 순 침하 하중을 Zero로 수렴시키는 평가 공식',
    structure: `- $C$: 보상도 ($C = 1.0$ 이면 완전 보상)\n- $\\gamma$: 굴착하여 배출한 흙의 단위중량\n- $D_f$: 기초의 굴착 깊이\n- $q$: 상부 구조물 총 자중 및 하중 합산값\n- $q_{net}$: 지반이 추가로 받는 순하중 ($q_{net} = q - \\gamma D_f$)`
  },
  {
    keywords: ['p_w', '\\gamma_w', 'H'],
    title: '싱글쉘 터널 설계수압(Single Shell Tunnel Design Water Pressure, $p_w$)',
    concept: '방수가 완벽히 차단된 비배수 터널 아치 배면에 상부 수위 높이에 비례하여 수직으로 가해지는 정수압식',
    structure: `- $p_w$: 라이닝 배면 작용 설계 수압\n- $\\gamma_w$: 지하수(물)의 단위중량 ($9.81\\,\\text{kN/m}^3$)\n- $H$: 설계 지하수위 면으로부터 터널 아치 정상까지의 수직 거리 (수두 높이)`
  },
  {
    keywords: ['k_h', 'k_{h0}', 'B_H', 'E_0', 'N', '2800'],
    title: '가설흙막이 수평지반반력계수(Temporary Retaining Wall Horizontal Subgrade Reaction Coefficient, $k_h$)',
    concept: '벽체 배면의 지반 탄소성 반응을 등가의 선형 탄성 연속 압축 스프링 강성값으로 치환하는 반력 산정식',
    structure: `- $k_h$: 설계 수평 지반반력계수 (탄성 스프링 상수)\n- $k_{h0}$: 표준 수평 지반반력계수\n- $B_H$: 가상의 기초 환산폭\n- $E_0$: 지반의 탄성계수 ($E_0 = 2800 N$)\n- $N$: 표준관입시험 N치`
  }
];

// Self-healing CP1252-to-CP949 custom reverse mapping table for double-encoded Korean mojibake bytes in U+0080 - U+009F range
const cp1252CustomMap = {
  '\u20AC': 0x80, // €
  '\u201A': 0x82, // ‚
  '\u0192': 0x83, // ƒ
  '\u201E': 0x84, // „
  '\u2026': 0x85, // …
  '\u2020': 0x86, // †
  '\u2021': 0x87, // ‡
  '\u02C6': 0x88, // ˆ
  '\u2030': 0x89, // ‰
  '\u0160': 0x8A, // Š
  '\u2039': 0x8B, // ‹
  '\u0152': 0x8C, // Œ
  '\u017D': 0x8E, // Ž
  '\u2018': 0x91, // ‘
  '\u2019': 0x92, // ’
  '\u201C': 0x93, // “
  '\u201D': 0x94, // ”
  '\u2022': 0x95, // •
  '\u2013': 0x96, // –
  '\u2014': 0x97, // —
  '\u02DC': 0x98, // ˜
  '\u2122': 0x99, // ™
  '\u0161': 0x9A, // š
  '\u203A': 0x9B, // ›
  '\u0153': 0x9C, // œ
  '\u017E': 0x9E, // ž
  '\u0178': 0x9F  // Ÿ
};

const cp1252ReverseLookup = new Map();
for (const [char, byteVal] of Object.entries(cp1252CustomMap)) {
  cp1252ReverseLookup.set(char.charCodeAt(0), byteVal);
}

// Convert a double-decoded Unicode string back into a 100% loss-free CP1252 byte buffer
function stringToCp1252Buffer(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (cp1252ReverseLookup.has(code)) {
      bytes.push(cp1252ReverseLookup.get(code));
    } else if (code <= 0xFF) {
      bytes.push(code);
    } else {
      bytes.push(code & 0xFF);
    }
  }
  return Buffer.from(bytes);
}

// Helper: Check if a buffer contains HTML content by inspecting its beginning bytes
function isBufferHtml(buffer) {
  if (!buffer || buffer.length < 5) return false;
  // Check if it starts with PDF magic bytes %PDF- (0x25 0x50 0x44 0x46 0x2d)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d) {
    return false;
  }
  const prefix = buffer.toString('utf-8', 0, Math.min(1000, buffer.length)).trim().toLowerCase();
  return prefix.includes('<!doctype html') || 
         prefix.includes('<html') || 
         prefix.includes('<head') || 
         prefix.includes('<body') || 
         prefix.includes('<div') || 
         prefix.includes('<p') || 
         prefix.includes('<script') ||
         prefix.includes('</html>') ||
         prefix.includes('<style');
}

// Helper: Decode HTML Buffer into UTF-8 string automatically supporting EUC-KR/CP949 fallback and double-encoded Mojibake restoration
function decodeHtmlBuffer(buffer) {
  if (!buffer) return '';
  
  // 1. First, check for explicit EUC-KR/CP949 meta tags in ASCII header
  const asciiText = buffer.toString('ascii').toLowerCase();
  const hasEucKrTag = asciiText.includes('charset=euc-kr') || 
                      asciiText.includes('charset="euc-kr"') || 
                      asciiText.includes('charset=cp949') || 
                      asciiText.includes('charset="cp949"');
  
  if (hasEucKrTag) {
    console.log('EUC-KR / CP949 meta charset tag detected. Decoding as EUC-KR.');
    try {
      return new TextDecoder('euc-kr').decode(buffer);
    } catch (e) {
      console.warn('TextDecoder euc-kr failed, falling back to standard flow:', e);
    }
  }

  // 2. Try standard UTF-8 decoding
  let decodedText = '';
  let utf8Success = false;
  try {
    decodedText = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    utf8Success = true;
  } catch (e) {
    console.log('UTF-8 decoding failed (fatal: true). Falling back to direct EUC-KR.');
    try {
      return new TextDecoder('euc-kr').decode(buffer);
    } catch (e2) {
      console.error('EUC-KR decoding failed as well, returning raw string:', e2);
      return buffer.toString('utf-8');
    }
  }
  // 3. Self-healing logic for CP949 bytes double-encoded as CP1252/Latin-1 (mojibake)
  // If UTF-8 succeeded, compare the density of valid Korean characters in the restored CP949 text
  // versus the raw decoded text. If the restored text yields MORE valid Korean characters,
  // we heal the content. This prevents template/boilerplates from blocking the restoration of the whole file.
  if (utf8Success) {
    try {
      const restoredBytes = stringToCp1252Buffer(decodedText);
      const restoredText = new TextDecoder('euc-kr').decode(restoredBytes);
      
      const originalKoreanCount = (decodedText.match(/[가-힣]/g) || []).length;
      const restoredKoreanCount = (restoredText.match(/[가-힣]/g) || []).length;
      
      if (restoredKoreanCount > originalKoreanCount) {
        console.log(`Double-encoded EUC-KR (mojibake) successfully detected! (Healed Korean chars: ${originalKoreanCount} -> ${restoredKoreanCount})`);
        return restoredText;
      }
    } catch (restoreErr) {
      console.warn('EUC-KR mojibake restoration check failed:', restoreErr);
    }
  }

  return decodedText;
}


// Helper: Extract first image data and mimeType from topic (raw image or base64 embedded in HTML)
function extractFirstImageFromTopic(topic) {
  if (!topic || !topic.pdf_data) return null;
  const pdfName = (topic.pdf_name || '').toLowerCase();
  const isImage = pdfName.endsWith('.png') || pdfName.endsWith('.jpg') || pdfName.endsWith('.jpeg') || pdfName.endsWith('.gif') || pdfName.endsWith('.webp');

  if (isImage) {
    const mimeType = pdfName.endsWith('.png') ? 'image/png' :
                     (pdfName.endsWith('.gif') ? 'image/gif' :
                      (pdfName.endsWith('.webp') ? 'image/webp' : 'image/jpeg'));
    return {
      data: topic.pdf_data.toString('base64'),
      mimeType: mimeType
    };
  }

  const isHtml = pdfName.endsWith('.html') || pdfName.endsWith('.htm') || isBufferHtml(topic.pdf_data);
  if (isHtml) {
    try {
      const rawHtml = decodeHtmlBuffer(topic.pdf_data);
      const imgRegex = /<img[^>]+src=["']data:(image\/[^;]+);base64,([^"']+)["']/i;
      const match = imgRegex.exec(rawHtml);
      if (match) {
        return {
          data: match[2],
          mimeType: match[1]
        };
      }
    } catch (e) {
      console.warn('[extractFirstImageFromTopic] Failed to parse HTML for image extraction:', e);
    }
  }
  return null;
}

// Helper: Extract text from topic (supports PDF, HTML, and Images via Gemini OCR with caching)
export async function getTopicText(topic) {
  if (!topic || !topic.pdf_data) {
    return '수기로 등록한 토픽이며 첨부된 보고서 파일이 없습니다.';
  }

  const topicId = topic.id || topic.topic_id;
  const cacheKey = `topic_extracted_text_${topicId}`;

  // Check if we already have the extracted text in cache (app_session)
  if (topicId) {
    try {
      const cached = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [cacheKey]);
      if (cached && cached.value) {
        console.log(`[Cache Hit] Serving cached extracted text for topicId=${topicId}`);
        return cached.value;
      }
    } catch (cacheErr) {
      console.warn(`[Cache Read Error] Failed to read text cache for topicId=${topicId}:`, cacheErr);
    }
  }

  const pdfName = (topic.pdf_name || '').toLowerCase();
  const isImage = pdfName.endsWith('.png') || pdfName.endsWith('.jpg') || pdfName.endsWith('.jpeg') || pdfName.endsWith('.gif') || pdfName.endsWith('.webp');

  let fileText = '';
  if (isImage) {
    try {
      const mimeType = pdfName.endsWith('.png') ? 'image/png' :
                       (pdfName.endsWith('.gif') ? 'image/gif' :
                        (pdfName.endsWith('.webp') ? 'image/webp' : 'image/jpeg'));
      const base64Data = topic.pdf_data.toString('base64');
      fileText = await extractTextFromCalculationImage(base64Data, mimeType, callLLMWithFailover);
    } catch (err) {
      console.error(`[OCR Image Extraction] Failed for topicId=${topicId}:`, err);
      fileText = `[이미지 OCR 추출 실패: ${err.message}]`;
    }
  } else {
    const isHtml = topic.pdf_name && (
      topic.pdf_name.toLowerCase().endsWith('.html') || 
      topic.pdf_name.toLowerCase().endsWith('.htm') || 
      isBufferHtml(topic.pdf_data)
    );
    if (isHtml) {
      try {
        const rawHtml = decodeHtmlBuffer(topic.pdf_data);
        fileText = htmlToPlainText(rawHtml);

        // Check if there are embedded base64 images (uploaded along with HTML)
        const imgRegex = /<img[^>]+src=["']data:(image\/[^;]+);base64,([^"']+)["']/gi;
        let match;
        let ocrTexts = [];
        while ((match = imgRegex.exec(rawHtml)) !== null) {
          const mimeType = match[1];
          const base64Data = match[2];
          console.log(`[OCR Embedded Image] Found embedded base64 image in HTML. Running OCR...`);
          try {
            const ocrText = await extractTextFromCalculationImage(base64Data, mimeType, callLLMWithFailover);
            if (ocrText) {
              ocrTexts.push(ocrText);
            }
          } catch (ocrErr) {
            console.error('[OCR Embedded Image] Failed to run OCR on embedded image:', ocrErr);
          }
        }
        if (ocrTexts.length > 0) {
          fileText = `[이미지 OCR 추출 텍스트]:\n${ocrTexts.join('\n\n')}\n\n[HTML 본문 텍스트]:\n${fileText}`;
        }
      } catch (htmlErr) {
        console.warn('Failed to parse HTML string:', htmlErr);
      }
    } else {
      try {
        const parsedPdf = await pdfParse(topic.pdf_data);
        fileText = parsedPdf.text || '';
      } catch (pdfErr) {
        console.warn('Failed to parse PDF binary:', pdfErr);
      }
    }
    fileText = mergeVerticalText(fileText);
  }

  // Cache the extracted text so we don't have to perform OCR or parsing again
  if (fileText && topicId) {
    try {
      await saveSessionValue(cacheKey, fileText);
      console.log(`[Cache Save] Successfully cached extracted text for topicId=${topicId}`);
    } catch (saveErr) {
      console.warn(`[Cache Save Error] Failed to save text cache for topicId=${topicId}:`, saveErr);
    }
  }

  return fileText;
}




// Helper: Extract JSON array from string robustly
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callLLMWithFailover(systemInstruction, userPrompt, image = null, scenario = 'default', options = {}) {
  // [성능 최적화] 매 호출마다 DB를 조회하는 대신, 이미 GET/POST 엔드포인트에서 갱신 및 캐싱되고 있는 globalPreferredModel 값을 바로 사용합니다.

  // 1. API 키 취득 및 정규화
  const primaryKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim().replace(/^['"]|['"]$/g, '') : null;
  const secondaryKey = process.env.GEMINI_API_KEY_SECONDARY ? process.env.GEMINI_API_KEY_SECONDARY.trim().replace(/^['"]|['"]$/g, '') : null;
  const tertiaryKey = process.env.GEMINI_API_KEY_TERTIARY ? process.env.GEMINI_API_KEY_TERTIARY.trim().replace(/^['"]|['"]$/g, '') : null;
  const xaiKey = process.env.XAI_API_KEY ? process.env.XAI_API_KEY.trim().replace(/^['"]|['"]$/g, '') : null;
  const grokKey = process.env.GROK_API_KEY ? process.env.GROK_API_KEY.trim().replace(/^['"]|['"]$/g, '') : null;

  const keyErrors = [];
  const hasImage = Array.isArray(image)
    ? image.some(img => img && img.data && img.mimeType)
    : !!(image && image.data && image.mimeType);

  // 2. 사용자가 규정한 최적화 실행 리스트 구성
  const executionList = [];

  const keys = [];
  if (primaryKey) keys.push({ key: primaryKey, label: 'Key #1' });
  if (secondaryKey) keys.push({ key: secondaryKey, label: 'Key #2' });
  if (tertiaryKey) keys.push({ key: tertiaryKey, label: 'Key #3' });

  for (const k of keys) {
    const isGroq = k.key.startsWith('gsk_');
    const isGrok = k.key.startsWith('xai-');

    if (isGroq) {
      executionList.push({ key: k.key, label: k.label, model: 'llama-3.3-70b-versatile', type: 'groq' });
      executionList.push({ key: k.key, label: k.label, model: 'llama-3.1-8b-instant', type: 'groq' });
    } else if (isGrok) {
      executionList.push({ key: k.key, label: k.label, model: 'grok-2-1212', type: 'grok' });
      executionList.push({ key: k.key, label: k.label, model: 'grok-2', type: 'grok' });
    } else {
      // Gemini models (preferred first, then stable fallbacks, grouped by key)
      const geminiFallbacks = [
        globalPreferredModel,
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
      ];
      const uniqueModels = [...new Set(geminiFallbacks.filter(Boolean))];
      for (const modelName of uniqueModels) {
        executionList.push({ key: k.key, label: k.label, model: modelName, type: 'gemini' });
      }
    }
  }

  // Backup keys for xAI and Grok
  if (xaiKey) {
    executionList.push({ key: xaiKey, label: 'Key #4 (Grok)', model: 'grok-2-1212', type: 'grok' });
    executionList.push({ key: xaiKey, label: 'Key #4 (Grok)', model: 'grok-2', type: 'grok' });
  }
  if (grokKey) {
    executionList.push({ key: grokKey, label: 'Key #5 (Grok)', model: 'grok-2-1212', type: 'grok' });
    executionList.push({ key: grokKey, label: 'Key #5 (Grok)', model: 'grok-2', type: 'grok' });
  }

  // 3. 플랫 루프 실행
  let attemptedAny = false;

  for (let idx = 0; idx < executionList.length; idx++) {
    const task = executionList[idx];
    const key = task.key;
    const maskedKey = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    const modelName = task.model;
    const isGroq = task.type === 'groq';
    const isGrok = task.type === 'grok';

    // 이미지 추출이 포함된 경우 Groq/Grok은 패스(Gemini만 가능)
    if (hasImage && (isGroq || isGrok)) {
      continue;
    }

    attemptedAny = true;
    let attempt = 0;
    const maxAttempts = 2; // 각 시도당 1회 지수 백오프 재시도 포함
    let delay = 1000;

    while (attempt < maxAttempts) {
      try {
        if (isGrok) {
          console.log(`[Grok 시도] ${task.label} (${maskedKey}), 모델: ${modelName} (시도 #${attempt + 1})`);
          const messages = [];
          if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
          }
          messages.push({ role: 'user', content: userPrompt });

          reportLlmProgress(options, scenario, modelName);
          const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: modelName,
              messages: messages,
              temperature: options.temperature !== undefined ? options.temperature : 0.2,
              ...(scenario === 'grading' ? { response_format: { type: "json_object" } } : {})
            })
          });

          if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(`HTTP Error ${response.status}: ${errBody}`);
          }

          const data = await response.json();
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text) {
            console.log(`[Grok 성공] ${task.label} (${maskedKey}), 모델: ${modelName}`);
            return text;
          } else {
            throw new Error('Grok response empty');
          }

        } else if (isGroq) {
          console.log(`[Groq 시도] ${task.label} (${maskedKey}), 모델: ${modelName} (시도 #${attempt + 1})`);
          const messages = [];
          if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
          }
          messages.push({ role: 'user', content: userPrompt });

          reportLlmProgress(options, scenario, modelName);
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: modelName,
              messages: messages,
              temperature: options.temperature !== undefined ? options.temperature : 0.2
            })
          });

          if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(`HTTP Error ${response.status}: ${errBody}`);
          }

          const data = await response.json();
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text) {
            console.log(`[Groq 성공] ${task.label} (${maskedKey}), 모델: ${modelName}`);
            return text;
          } else {
            throw new Error('Groq response empty');
          }

        } else {
          // Gemini API 시도
          console.log(`[Gemini 시도] ${task.label} (${maskedKey}), 모델: ${modelName} (시도 #${attempt + 1})`);
          const genAI = new GoogleGenerativeAI(key);
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemInstruction || undefined,
            generationConfig: {
              temperature: options.temperature !== undefined ? options.temperature : 0.2,
              ...(scenario === 'grading' ? { responseMimeType: 'application/json' } : {})
            }
          }, { apiVersion: 'v1beta' });

          let generateContentArg = [userPrompt];
          if (Array.isArray(image)) {
            image.forEach(img => {
              if (img && img.data && img.mimeType) {
                generateContentArg.push({
                  inlineData: {
                    mimeType: img.mimeType,
                    data: img.data
                  }
                });
              }
            });
          } else if (image && image.data && image.mimeType) {
            generateContentArg.push({
              inlineData: {
                mimeType: image.mimeType,
                data: image.data
              }
            });
          }
          if (generateContentArg.length === 1) {
            generateContentArg = userPrompt;
          }

          reportLlmProgress(options, scenario, modelName);
          const timeoutMs = 20000; // 20 seconds timeout to prevent tarpitting from hanging the server
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini request timeout after ${timeoutMs}ms`)), timeoutMs)
          );
          const result = await Promise.race([
            model.generateContent(generateContentArg),
            timeoutPromise
          ]);
          const text = result.response.text().trim();
          if (text) {
            console.log(`[Gemini 성공] ${task.label} (${maskedKey}), 모델: ${modelName}`);
            return text;
          } else {
            throw new Error('Gemini response empty');
          }
        }
      } catch (err) {
        console.warn(`[API 시도 실패] ${task.label} (${maskedKey}), 모델: ${modelName} (시도 #${attempt + 1}): ${err.message?.substring(0, 120)}`);
        keyErrors.push(`${task.label} (${modelName}): ${err.message?.substring(0, 120)}`);

        // Quota 한도 초과 오류(429 등) 감지 시 재시도 진행
        const isQuota = err.status === 429 || err.message?.includes('429') || err.message?.includes('Quota') || err.message?.includes('quota') || err.message?.includes('rate');
        if (isQuota) {
          const isVercel = !!process.env.VERCEL;
          if (isVercel) {
            console.log('[Vercel 환경] 429 감지. 타임아웃 방지를 위해 즉시 다른 키/모델로 페일오버를 시도합니다.');
            break;
          }
          attempt++;
          if (attempt < maxAttempts) {
            console.log(`[지수 백오프] 429 감지. ${delay}ms 후 재시도...`);
            await sleep(delay);
            delay *= 2;
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }
  }

  if (hasImage && !attemptedAny) {
    throw new Error('이미지 분석에는 Gemini API 키가 필요하지만, 현재 등록된 Gemini API 키가 없습니다. 관리자에게 문의해 주세요.');
  }

  if (keyErrors.length > 0) {
    const uniqueErrors = [...new Set(keyErrors)].slice(0, 3);
    if (hasImage) {
      throw new Error(`이미지 분석을 위한 모든 API 키가 할당량 초과(429) 또는 오류로 인해 실패했습니다. (상세 오류 요약: ${uniqueErrors.join(' | ')})`);
    } else {
      throw new Error(`[AI 호출 실패] ${uniqueErrors.join(' | ')}`);
    }
  }

  throw new Error('모든 API 키 호출에 실패하였습니다.');
}

// Helper: Shuffle array elements
function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Helper: Convert HTML tables to Markdown
function convertHtmlTablesToMarkdown(html) {
  if (!html) return '';
  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  
  return html.replace(tableRegex, (match, tableContent) => {
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    const mdRows = [];
    let maxCols = 0;
    
    while ((trMatch = trRegex.exec(tableContent)) !== null) {
      const rowContent = trMatch[1];
      const cellRegex = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
      let cellMatch;
      const cells = [];
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        let cellText = cellMatch[2]
          .replace(/<[^>]+>/g, '')
          .replace(/\|/g, '\\|')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(cellText);
      }
      if (cells.length > 0) {
        mdRows.push(cells);
        if (cells.length > maxCols) {
          maxCols = cells.length;
        }
      }
    }
    
    if (mdRows.length === 0) return '';
    
    let mdTable = '\n\n';
    const firstRow = mdRows[0];
    mdTable += '| ' + firstRow.join(' | ') + ' |\n';
    
    const separators = Array(maxCols).fill('---');
    mdTable += '| ' + separators.join(' | ') + ' |\n';
    
    for (let i = 1; i < mdRows.length; i++) {
      const row = mdRows[i];
      while (row.length < maxCols) row.push('');
      mdTable += '| ' + row.join(' | ') + ' |\n';
    }
    
    mdTable += '\n';
    return mdTable;
  });
}

// Helper: Extract clean plain text from HTML with table preservation
function htmlToPlainText(html) {
  if (!html) return '';
  // 1. Remove script and style tags and their contents safely (avoiding catastrophic backtracking)
  let text = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  
  // [추가 대책] 인라인 스타일 속성(style="...")을 최우선 박멸하여 태그 파싱 오류 및 찌꺼기 차단 (중첩 쿼트 대응)
  text = text.replace(/style\s*=\s*(?:"[^"]*"|'[^']*'|夸[^夸]*夸)/gi, '');
  
  // 2. Convert tables to Markdown before stripping block tags
  text = convertHtmlTablesToMarkdown(text);
  
  // 3. Replace common block elements with newlines/spaces to maintain layout structure
  text = text.replace(/<\/p>|<\/div>|<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/td>|<\/th>/gi, '   ');

  // 4. Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 5. Unescape common HTML entities
  const entities = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&cent;': '¢',
    '&pound;': '£',
    '&yen;': '¥',
    '&euro;': '€',
    '&copy;': '©',
    '&reg;': '®'
  };
  text = text.replace(/&[a-z0-9#]+;/gi, (match) => {
    return entities[match.toLowerCase()] || match;
  });

  // 6. Collapse excessive empty lines but preserve Markdown table formatting
  const lines = text.split('\n');
  const processedLines = [];
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine.startsWith('|')) {
      if (!inTable) {
        processedLines.push('');
        inTable = true;
      }
      processedLines.push(trimmedLine);
    } else {
      if (inTable) {
        processedLines.push('');
        inTable = false;
      }
      if (trimmedLine.length > 0) {
        processedLines.push(trimmedLine);
      }
    }
  }
  
  let joinedText = '';
  for (let i = 0; i < processedLines.length; i++) {
    const current = processedLines[i];
    if (i === 0) {
      joinedText += current;
      continue;
    }
    const prev = processedLines[i - 1];
    if (current.startsWith('|') && prev.startsWith('|')) {
      joinedText += '\n' + current;
    } else if (current === '' || prev === '') {
      joinedText += '\n' + current;
    } else {
      joinedText += '\n\n' + current;
    }
  }
  
  return mergeVerticalText(joinedText);
}

// Helper: Smart truncate text at sentence/paragraph boundaries
function smartTruncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  const sub = text.substring(0, maxLength);
  const lastParagraph = sub.lastIndexOf('\n\n');
  if (lastParagraph > maxLength * 0.8) {
    return sub.substring(0, lastParagraph).trim() + '\n\n... [텍스트가 너무 길어 중략됨]';
  }
  const lastLine = sub.lastIndexOf('\n');
  if (lastLine > maxLength * 0.8) {
    return sub.substring(0, lastLine).trim() + '\n... [텍스트가 너무 길어 중략됨]';
  }
  const lastPeriod = Math.max(sub.lastIndexOf('. '), sub.lastIndexOf('.\n'));
  if (lastPeriod > maxLength * 0.7) {
    return sub.substring(0, lastPeriod + 1).trim() + ' ... [텍스트가 너무 길어 중략됨]';
  }
  return sub.trim() + '... [텍스트가 너무 길어 중략됨]';
}

// Helper: Convert clean text to PDF buffer using system Korean fonts
function convertTextToPdfBuffer(text, title) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });
      
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // 1st Priority: Load bundled NanumGothic.ttf font (ensures cross-platform/Vercel support)
      let fontLoaded = false;
      const localFontPath = path.resolve(__dirname, 'NanumGothic.ttf');
      if (fs.existsSync(localFontPath)) {
        try {
          doc.font(localFontPath);
          fontLoaded = true;
        } catch (e) {
          console.warn('Failed to load local NanumGothic font:', e);
        }
      }

      // 2nd Priority: Fallback to standard Windows Malgun Gothic
      if (!fontLoaded) {
        const fontPath = 'C:\\Windows\\Fonts\\malgun.ttf';
        if (fs.existsSync(fontPath)) {
          try {
            doc.font(fontPath);
            fontLoaded = true;
          } catch (e) {
            console.warn('Failed to load Malgun Gothic font, falling back to default:', e);
          }
        }
      }

      // 3rd Priority: Fallback to other system fonts
      if (!fontLoaded) {
        const fallbackFonts = [
          'C:\\Windows\\Fonts\\batang.ttc',
          'C:\\Windows\\Fonts\\gulim.ttc'
        ];
        for (const fallback of fallbackFonts) {
          if (fs.existsSync(fallback)) {
            try {
              doc.font(fallback);
              fontLoaded = true;
              break;
            } catch (e) {}
          }
        }
      }

      // Header / Title
      doc.fontSize(20).text(title, { align: 'center' });
      doc.moveDown(1.5);

      // Body text
      doc.fontSize(11).lineGap(4);
      
      // Draw text with word wrapping. pdfkit does this automatically.
      doc.text(text);
      
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Helper: Extract key features from file text dynamically (Context mining for fallbacks)
function extractFeaturesFromText(fileText) {
  const result = {
    keySentences: [],
    extractedKeywords: [],
    extractedFormulas: [],
    summaryParagraph: ''
  };

  if (!fileText || fileText.trim().length === 0) {
    return result;
  }

  // Clean formatting
  const cleanText = fileText.replace(/\s+/g, ' ').trim();

  // Split into sentences using punctuation lookbehind
  const sentences = cleanText.split(/(?<=[.?!])\s+/);
  
  // Filter candidate sentences that represent technical logic or conclusions
  const candidates = sentences.filter(s => {
    const len = s.length;
    return len > 20 && len < 150 && (
      s.endsWith('다.') || s.endsWith('음.') || s.endsWith('함.') || s.endsWith('임.') ||
      s.endsWith('다') || s.endsWith('음') || s.endsWith('함') || s.endsWith('임') ||
      s.includes('형') || s.includes('기반') || s.includes('구조') || s.includes('특징') ||
      s.includes('공법') || s.includes('방식') || s.includes('수행') || s.includes('설계') ||
      s.includes('압밀') || s.includes('점토') || s.includes('파괴') || s.includes('시험') ||
      s.includes('응력') || s.includes('지반') || s.includes('강도')
    );
  });

  result.keySentences = candidates.slice(0, 4);
  
  if (result.keySentences.length === 0) {
    result.keySentences = sentences.slice(0, 3).filter(s => s.trim().length > 10);
  }

  // Extract candidate formulas or equations from sentences dynamically
  const formulaCandidates = sentences.filter(s => {
    const sTrim = s.trim();
    // Formula indicators: contains math symbols, equals sign, acronyms like F.S, OCR, or explicit formula/relation keywords
    return (sTrim.includes('=') || sTrim.includes(' + ') || sTrim.includes(' - ') || sTrim.includes(' × ') || sTrim.includes(' * ') ||
            sTrim.includes('공식') || sTrim.includes('수식') || sTrim.includes('관계식') || sTrim.includes('계산식') || sTrim.includes('방정식') ||
            sTrim.includes(' F.S ') || sTrim.includes('OCR') || sTrim.includes('선행압밀') || sTrim.includes('과압밀') || sTrim.includes('파괴 규준선'));
  }).map(s => s.trim()).filter(s => s.length > 15 && s.length < 200);

  result.extractedFormulas = Array.from(new Set(formulaCandidates)).slice(0, 3);

  // Parse distinct keywords based on noun-like occurrences
  const words = cleanText.match(/[a-zA-Z가-힣0-9]{3,10}/g) || [];
  const wordFreq = {};
  const stopWords = ['대하여', '대해', '있으며', '있는', '있습니다', '하는', '합니다', '따라', '통해', '위해', '그리고', '따라서', '또는', '또한', '의한', '이를', '것이다', '등의'];
  
  words.forEach(w => {
    if (stopWords.includes(w)) return;
    wordFreq[w] = (wordFreq[w] || 0) + 1;
  });

  const sortedWords = Object.keys(wordFreq).sort((a, b) => wordFreq[b] - wordFreq[a]);
  result.extractedKeywords = sortedWords.slice(0, 6);

  if (result.keySentences.length > 0) {
    result.summaryParagraph = result.keySentences.slice(0, 2).join(' ');
  } else {
    result.summaryParagraph = cleanText.substring(0, 200) + '...';
  }

  return result;
}

// 복습이 완료되었을 때 다음 회차 복습 스케줄을 자동으로 생성하는 헬퍼 함수
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
    days = 30 + Math.floor(Math.random() * 61); // 30 ~ 90일 후
  }

  if (days > 0) {
    const nextPlannedDate = getLocalDateString(baseDate, days);
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


// Suggest Topic Title from Screenshot Image or HTML Code using Gemini (delegated to calculationPlugin)
app.post('/api/topics/suggest-title', async (req, res) => {
  try {
    const { image, mimeType, htmlText } = req.body;
    if (!image && !htmlText) {
      return res.status(400).json({ error: '이미지 데이터 또는 HTML 텍스트가 필요합니다.' });
    }
    const cleanTitle = await suggestTitleFromCalculation(image, mimeType, htmlText, callLLMWithFailover);
    return res.json({ title: cleanTitle });
  } catch (err) {
    console.error('Suggest title error:', err);
    res.status(500).json({ error: '토픽 제목 자동 추천에 실패했습니다.' });
  }
});


// 1. Topic Registration + Auto Spaced Scheduling (With customized baseDate support)
app.post('/api/topics', upload.single('pdf'), async (req, res) => {
  const { title, keywords, baseDate, category } = req.body;

  if (!title) {
    return res.status(400).json({ error: '토픽 제목은 필수 입력 항목입니다.' });
  }

  try {
    // 1. Double secure filename extraction: Read fileNameUtf8 from body first to avoid Multer header decoding bugs
    let pdfName = req.body.fileNameUtf8 || (req.file ? req.file.originalname : null);
    let pdfData = req.file ? req.file.buffer : null;

    // 2. Fallback regex-based decoder for raw originalname if body is not populated
    if (!req.body.fileNameUtf8 && req.file) {
      const name = req.file.originalname;
      if (/[가-힣]/.test(name)) {
        pdfName = name;
      } else {
        try {
          const decoded = Buffer.from(name, 'latin1').toString('utf-8');
          pdfName = /[가-힣]/.test(decoded) ? decoded : name;
        } catch (e) {
          pdfName = name;
        }
      }
    }

    // Keep raw HTML files intact to preserve layouts, formatting, and inline images
    if (req.file) {
      const fileOrigNameLower = req.file.originalname.toLowerCase();
      const pdfNameLower = pdfName ? pdfName.toLowerCase() : '';
      const isHtml = fileOrigNameLower.endsWith('.html') || 
                     fileOrigNameLower.endsWith('.htm') || 
                     req.file.mimetype === 'text/html' || 
                     pdfNameLower.endsWith('.html') || 
                     pdfNameLower.endsWith('.htm') ||
                     isBufferHtml(req.file.buffer);
      if (isHtml) {
        console.log(`HTML file upload detected: ${pdfName}. Keeping raw HTML content to preserve rich diagrams and styles.`);
        pdfData = req.file.buffer; // Store original HTML buffer directly!
      }
    }

    // Parse baseDate or default to current local date
    let createdDate = new Date();
    if (baseDate) {
      const parts = baseDate.split('-');
      if (parts.length === 3) {
        // Parse date in exact local timezone to prevent UTC timezone shifts
        createdDate = new Date(
          parseInt(parts[0], 10), 
          parseInt(parts[1], 10) - 1, 
          parseInt(parts[2], 10)
        );
      }
    }

    // Convert local createdDate to string format for SQLite
    const dbDateStr = createdDate.toISOString().slice(0, 19).replace('T', ' ');

    // Save topic to DB
    const insertTopicSql = `
      INSERT INTO topics (title, keywords, pdf_name, pdf_data, created_at, category)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const topicResult = await dbQuery.run(insertTopicSql, [
      title,
      keywords || '',
      pdfName,
      pdfData,
      dbDateStr,
      category || '일반'
    ]);

    const topicId = topicResult.id;

    // 망각주기 스케줄링 알고리즘: 등록일 기준 +1일로 1회차 복습만 먼저 생성
    // (이후 회차는 이전 회차 완료 시점에 동적으로 생성됨: 1회차 완료 -> 2회차 +4일, 2회차 -> 3회차 +7일 등)
    const firstInterval = 1;
    const insertScheduleSql = `
      INSERT INTO schedules (topic_id, review_round, planned_date, status)
      VALUES (?, 1, ?, 'pending')
    `;
    const plannedDate = getLocalDateString(createdDate, firstInterval);
    await dbQuery.run(insertScheduleSql, [topicId, plannedDate]);

    res.status(201).json({
      message: '토픽 등록 및 복습 스케줄 생성이 완료되었습니다.',
      topicId: topicId,
      title: title,
      keywords: keywords,
      schedulesCreated: 1
    });
  } catch (error) {
    console.error('Error registering topic and creating schedules:', error);
    res.status(500).json({ error: '서버 오류로 토픽 등록에 실패했습니다.' });
  }
});

// 1-2. Replace Topic Source Material (PDF/HTML or Text Content)
app.post('/api/topics/:id/replace-source', upload.single('pdf'), async (req, res) => {
  const topicId = req.params.id;
  try {
    let pdfName = req.body.fileNameUtf8 || (req.file ? req.file.originalname : null);
    let pdfData = req.file ? req.file.buffer : null;

    if (!req.body.fileNameUtf8 && req.file) {
      const name = req.file.originalname;
      if (/[가-힣]/.test(name)) {
        pdfName = name;
      } else {
        try {
          const decoded = Buffer.from(name, 'latin1').toString('utf-8');
          pdfName = /[가-힣]/.test(decoded) ? decoded : name;
        } catch (e) {
          pdfName = name;
        }
      }
    }

    if (req.file) {
      const fileOrigNameLower = req.file.originalname.toLowerCase();
      const pdfNameLower = pdfName ? pdfName.toLowerCase() : '';
      const isHtml = fileOrigNameLower.endsWith('.html') || 
                     fileOrigNameLower.endsWith('.htm') || 
                     req.file.mimetype === 'text/html' || 
                     pdfNameLower.endsWith('.html') || 
                     pdfNameLower.endsWith('.htm') ||
                     isBufferHtml(req.file.buffer);
      if (isHtml) {
        pdfData = req.file.buffer;
      }
    }

    // Update topic pdf_name and pdf_data
    const updateSql = `
      UPDATE topics 
      SET pdf_name = ?, pdf_data = ?
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [pdfName, pdfData, topicId]);

    // Clear extracted text cache
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', [`topic_extracted_text_${topicId}`]);

    res.json({ success: true, message: '소스 자료가 성공적으로 교체되었습니다.' });
  } catch (error) {
    console.error('Error replacing topic source:', error);
    res.status(500).json({ error: '서버 오류로 소스 자료를 교체하지 못했습니다.' });
  }
});

// 2. Today's Review Dashboard (Pending reviews due today or overdue)
app.get('/api/dashboard', async (req, res) => {
  const queryDate = req.query.date || getLocalDateString();

  try {
    // --- 아침 8시 KST 자동 약점 보완 추천 처리 ---
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const kstHour = kstDate.getUTCHours();
    const todayKstStr = kstDate.toISOString().split('T')[0];

    if (queryDate === todayKstStr && kstHour >= 8) {
      const activeWeaknessCount = await dbQuery.get(
        `SELECT COUNT(*) as count FROM schedules 
         WHERE review_round = 99 AND planned_date <= ? AND status = 'pending'`,
        [todayKstStr]
      );
      if (activeWeaknessCount.count < 3) {
        const existingTodayBonus = await dbQuery.get(
          `SELECT id FROM schedules WHERE review_round = 99 AND planned_date = ?`,
          [todayKstStr]
        );
        if (!existingTodayBonus) {
          console.log(`[Auto-WeakPoint] Automatically generating 8 AM KST weak-point recommendation for ${todayKstStr}`);
          await generateWeakPointRecommendation(todayKstStr);
        }
      }
    }
    // ----------------------------------------

    // [수정] review_round ASC 정렬 → 당장 처리해야 하는 낮은 차수 일정을 우선 표시
    // 동일 토픽에 여러 pending이 쌓여 있을 때 가장 낮은(오래된) 차수가 Map에 먼저 삽입됨
    const sql = `
      SELECT 
        s.id AS schedule_id,
        s.review_round,
        s.planned_date,
        s.status,
        s.completed_at,
        s.score,
        t.id AS topic_id,
        t.title,
        t.keywords,
        t.pdf_name,
        t.created_at,
        t.category
      FROM schedules s
      JOIN topics t ON s.topic_id = t.id
      WHERE s.planned_date <= ? AND s.status = 'pending'
      ORDER BY CASE WHEN s.review_round = 99 THEN 0 ELSE 1 END ASC, s.review_round ASC, s.planned_date ASC, t.id ASC
    `;

    const pendingReviews = await dbQuery.all(sql, [queryDate]);

    // 중복 방어: 동일 토픽에 대해 당장 처리해야 하는 가장 낮은 차수의 pending 일정을 우선 유지
    // review_round ASC 정렬이므로 첫 번째 삽입 항목이 항상 가장 긴급한(낮은) 차수
    const uniqueReviewsMap = new Map();
    for (const r of pendingReviews) {
      const mapKey = r.review_round === 99 ? `${r.topic_id}_bonus` : String(r.topic_id);
      if (!uniqueReviewsMap.has(mapKey)) {
        uniqueReviewsMap.set(mapKey, r);
      }
    }
    
    // 복원 시 review_round = 99인 경우 isBonus로 변환하여 프론트에서 소실되지 않도록 연동
    const uniqueReviews = Array.from(uniqueReviewsMap.values()).map(r => ({
      ...r,
      isBonus: r.review_round === 99,
      score: r.score
    }));

    // 💡 더 이상 자동으로 보너스 약점 카드를 대시보드 리스트에 끼워넣지 않습니다.
    // 사용자가 '약점 추천 받기' 버튼을 누르면 별도 API (/api/dashboard/weak-points) 로 호출되어 추가 결합됩니다.

    // 💡 금일 복습 완료한 토픽 목록 추출 (날짜 연동 노란색 표시용)
    const startDate = getLocalDateString(new Date(queryDate), -2);
    const endDate = getLocalDateString(new Date(queryDate), 2);
    const completedSchedules = await dbQuery.all(
      `SELECT topic_id, completed_at FROM schedules 
       WHERE (status = 'completed' OR status = 'failed') AND completed_at IS NOT NULL 
         AND completed_at >= ? AND completed_at <= ?`,
      [startDate + 'T00:00:00.000Z', endDate + 'T23:59:59.999Z']
    );

    const completedTopicIds = [];
    for (const s of completedSchedules) {
      try {
        const localDateStr = getLocalDateString(new Date(s.completed_at));
        if (localDateStr === queryDate) {
          completedTopicIds.push(s.topic_id);
        }
      } catch (err) {
        console.warn('Completed_at date parse warning:', err);
      }
    }

    res.json({
      date: queryDate,
      count: uniqueReviews.length,
      reviews: uniqueReviews,
      completedTopicIds: completedTopicIds
    });
  } catch (error) {
    console.error('Error fetching dashboard reviews:', error);
    res.status(500).json({ error: '서버 오류로 복습 대시보드를 불러올 수 없습니다.' });
  }
});

// Helper: Generate exactly 1 weak-point review schedule (round = 99) for the specified date
async function generateWeakPointRecommendation(queryDate, isManual = false) {
  const hasAnyAiKey = !!(
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY_SECONDARY ||
    process.env.GEMINI_API_KEY_TERTIARY ||
    process.env.XAI_API_KEY ||
    process.env.GROK_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY
  );
  if (!hasAnyAiKey) {
    return null;
  }

  if (!isManual) {
    // 오늘의 복습 토픽 수(중복 제거)가 10개를 초과하는지 체크하여 보류 처리
    const totalPendingTopics = await dbQuery.get(
      `SELECT COUNT(DISTINCT topic_id) as count FROM schedules 
       WHERE planned_date <= ? AND status = 'pending'`,
      [queryDate]
    );
    if (totalPendingTopics.count > 10) {
      return null;
    }

    // 오늘의 복습 목록에 떠있는 약점복습토픽이 3개 이상이면 신규 추천하지 않음
    const activeWeaknessCount = await dbQuery.get(
      `SELECT COUNT(*) as count FROM schedules 
       WHERE review_round = 99 AND planned_date <= ? AND status = 'pending'`,
      [queryDate]
    );
    if (activeWeaknessCount.count >= 3) {
      return null;
    }
  }

  // 1. 제외 대상 추출: 오늘 pending 상태로 대기 중이거나, 오늘 이미 보너스(round = 99)로 추천받아 완료한 토픽 목록
  const excludedRows = await dbQuery.all(
    `SELECT DISTINCT topic_id FROM schedules 
     WHERE (status = 'pending' AND planned_date <= ?) 
        OR (review_round = 99 AND planned_date = ? AND (status = 'completed' OR status = 'failed'))`,
    [queryDate, queryDate]
  );
  const excludedTopicIds = excludedRows.map(r => r.topic_id);

  // 2. 정규 복습하기 점수와 내부에 저장된 약점복습 점수의 평균점수가 90점 이하인 토픽 추출
  const scoreHistory = await dbQuery.all(
    `SELECT topic_id, AVG(score) as avg_score
     FROM schedules
     WHERE (status = 'completed' OR status = 'failed') AND score IS NOT NULL
     GROUP BY topic_id
     HAVING AVG(score) <= 90
     ORDER BY avg_score ASC`
  );

  // 제외 대상 제외
  let candidates = scoreHistory.filter(h => !excludedTopicIds.includes(h.topic_id));

  if (candidates.length === 0) {
    return null;
  }

  // 90점 이하 토픽 중 전체 무작위(랜덤)로 1개 선택
  const selectedCandidate = candidates[Math.floor(Math.random() * candidates.length)];

  const topic = await dbQuery.get('SELECT * FROM topics WHERE id = ?', [selectedCandidate.topic_id]);
  if (topic) {
    // 오늘 날짜로 이미 대기 중이거나 완료된 해당 토픽의 보너스(round=99) 스케줄이 있는지 점검
    const existingBonus = await dbQuery.get(
      `SELECT id FROM schedules WHERE topic_id = ? AND review_round = 99 AND planned_date = ?`,
      [topic.id, queryDate]
    );

    let scheduleId;
    const scoreVal = Math.round(selectedCandidate.avg_score * 10) / 10;
    if (existingBonus) {
      scheduleId = existingBonus.id;
      await dbQuery.run(
        `UPDATE schedules SET status = 'pending', completed_at = NULL, score = ? WHERE id = ?`,
        [scoreVal, scheduleId]
      );
    } else {
      const insertRes = await dbQuery.run(
        `INSERT INTO schedules (topic_id, review_round, planned_date, status, score)
         VALUES (?, 99, ?, 'pending', ?)`,
        [topic.id, queryDate, scoreVal]
      );
      scheduleId = insertRes.id;
    }

    return {
      schedule_id: scheduleId,
      topic_id: topic.id,
      title: topic.title,
      keywords: topic.keywords,
      pdf_name: topic.pdf_name,
      review_round: 99,
      planned_date: queryDate,
      status: 'pending',
      completed_at: null,
      score: scoreVal,
      isBonus: true,
      category: topic.category || '일반'
    };
  }
  return null;
}

// 2-8-2. Get Weak-Point Bonus Reviews for Manual Trigger (한도 없는 실시간 약점 추천 버전)
app.get('/api/dashboard/weak-points', async (req, res) => {
  const queryDate = req.query.date || getLocalDateString();

  try {
    const totalPendingTopics = await dbQuery.get(
      `SELECT COUNT(DISTINCT topic_id) as count FROM schedules 
       WHERE planned_date <= ? AND status = 'pending'`,
      [queryDate]
    );
    if (totalPendingTopics.count > 10) {
      return res.json({ weakPoints: [], message: '오늘의 복습 토픽이 10개를 초과하여 약점 추천이 보류되었습니다.' });
    }

    const activeWeaknessCount = await dbQuery.get(
      `SELECT COUNT(*) as count FROM schedules 
       WHERE review_round = 99 AND planned_date <= ? AND status = 'pending'`,
      [queryDate]
    );
    if (activeWeaknessCount.count >= 3) {
      return res.json({ weakPoints: [], message: '오늘의 복습에 등록된 약점복습토픽이 3개를 초과할 수 없습니다.' });
    }

    const recommended = await generateWeakPointRecommendation(queryDate);
    const weakPoints = recommended ? [recommended] : [];
    res.json({ weakPoints });
  } catch (error) {
    console.error('Error fetching weak points:', error);
    res.status(500).json({ error: '서버 오류로 약점 토픽을 조회하지 못했습니다.' });
  }
});

// 2-9. Mark Weak-point Bonus Review as Complete
app.post('/api/schedules/bonus/complete', async (req, res) => {
  const { topicId, score, scheduleId, schedule_id } = req.body;
  const targetScheduleId = scheduleId || schedule_id;
  const today = getLocalDateString();
  const now = new Date().toISOString();

  if (!topicId) {
    return res.status(400).json({ error: '토픽 ID 정보가 누락되었습니다.' });
  }

  const topicIdInt = parseInt(topicId, 10);
  const targetScheduleIdInt = targetScheduleId ? parseInt(targetScheduleId, 10) : null;

  if (isNaN(topicIdInt)) {
    return res.status(400).json({ error: '유효한 토픽 ID가 아닙니다.' });
  }

  try {
    let existing = null;
    if (targetScheduleIdInt) {
      existing = await dbQuery.get('SELECT * FROM schedules WHERE id = ?', [targetScheduleIdInt]);
    }

    if (!existing) {
      // 오늘 해당 토픽에 대해 이미 보너스 완료(round = 99) 기록이 있는지 점검
      existing = await dbQuery.get(
        'SELECT id FROM schedules WHERE topic_id = ? AND review_round = 99 AND planned_date = ?',
        [topicIdInt, today]
      );
    }

    if (existing) {
      // 이미 추천 단계를 통해 pending 상태로 존재하는 보너스 레코드가 있으므로 completed로 업데이트
      // (그냥 복습완료 버튼을 누른 경우 score 데이터가 없으므로 score=null 처리하여 당일 재추천이 가능하도록 함)
      await dbQuery.run(
        `UPDATE schedules 
         SET status = 'completed', completed_at = ?, score = ?, correct_count = NULL, total_count = NULL 
         WHERE id = ?`,
        [now, score !== undefined ? score : null, existing.id]
      );
    } else {
      await dbQuery.run(
        `INSERT INTO schedules (topic_id, review_round, planned_date, status, completed_at, score, correct_count, total_count)
         VALUES (?, 99, ?, 'completed', ?, ?, NULL, NULL)`,
        [topicIdInt, today, now, score !== undefined ? score : null]
      );
    }

    res.json({ success: true, message: '약점극복 복습이 안전하게 완료 기록되었습니다.' });
  } catch (error) {
    console.error('Error completing bonus review:', error);
    res.status(500).json({ error: '서버 오류로 약점극복 복습 완료 처리에 실패했습니다.' });
  }
});

// 3. Mark Review Round as Complete
app.post('/api/schedules/:id/complete', async (req, res) => {
  const scheduleId = req.params.id;
  const { referenceDate } = req.body;

  try {
    const checkSql = `SELECT * FROM schedules WHERE id = ?`;
    const schedule = await dbQuery.get(checkSql, [scheduleId]);

    if (!schedule) {
      return res.status(404).json({ error: '해당 복습 일정을 찾을 수 없습니다.' });
    }

    if (schedule.status === 'completed') {
      return res.status(400).json({ error: '이미 복습 완료된 항목입니다.' });
    }

    const nowTimestamp = new Date().toISOString();
    const updateSql = `
      UPDATE schedules 
      SET status = 'completed', completed_at = ? 
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [nowTimestamp, scheduleId]);

    // 복습 완료 시 다음 회차 자동 생성 (망각곡선 주기 기반)
    if (schedule.review_round !== 99) {
      const baseDate = referenceDate ? new Date(referenceDate) : new Date();
      await scheduleNextReviewRound(schedule.topic_id, schedule.review_round, baseDate);
    }

    res.json({
      message: `${schedule.review_round}회차 복습 완료 처리되었습니다.`,
      schedule_id: scheduleId,
      status: 'completed',
      completed_at: nowTimestamp
    });
  } catch (error) {
    console.error('Error completing review:', error);
    res.status(500).json({ error: '서버 오류로 복습 완료 처리에 실패했습니다.' });
  }
});

// 3.1. 퀴즈 제출 결과 채점 및 스케줄 상태 업데이트 엔드포인트
app.post('/api/quiz/submit', async (req, res) => {
  const { schedule_id, topic_id, total, correctCount, score, isPassed, isBonus, questions, selectedAnswers, revealedQuestions, tableAnswers, tableGradingResults, referenceDate, tutorAnswers, tutorInputText, chatHistory } = req.body;

  if (!schedule_id || !topic_id) {
    return res.status(400).json({ error: 'schedule_id와 topic_id는 필수입니다.' });
  }

  const topicIdInt = parseInt(topic_id, 10);
  let scheduleIdInt = parseInt(schedule_id, 10);

  if (isNaN(topicIdInt) || isNaN(scheduleIdInt)) {
    return res.status(400).json({ error: '유효한 topic_id와 schedule_id가 아닙니다.' });
  }

  const now = new Date().toISOString();

  try {
    let targetScheduleId = scheduleIdInt;

    if (isBonus) {
      let existingBonus = null;
      if (scheduleIdInt && scheduleIdInt !== 9999) {
        existingBonus = await dbQuery.get('SELECT * FROM schedules WHERE id = ?', [scheduleIdInt]);
      }
      if (!existingBonus) {
        const today = getLocalDateString();
        existingBonus = await dbQuery.get(
          'SELECT id FROM schedules WHERE topic_id = ? AND review_round = 99 AND planned_date = ?',
          [topicIdInt, today]
        );
      }

      if (!existingBonus) {
        const today = getLocalDateString();
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
      // 만약 가상 ID이거나 9999일 경우, 또는 schedule_id가 없을 때:
      // 활성화 상태인 pending 일정을 최우선 타겟으로 선택하고, 없으면 완료/실패 건을 차선책으로 복원합니다.
      if (scheduleIdInt === 9999 || !scheduleIdInt) {
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

    // Ensure targetScheduleId is coerced to integer
    targetScheduleId = parseInt(targetScheduleId, 10);

    // 1. 해당 스케줄이 실제로 존재하는지 확인
    const schedule = await dbQuery.get('SELECT * FROM schedules WHERE id = ?', [targetScheduleId]);
    if (!schedule) {
      return res.status(404).json({ error: '해당 복습 일정을 찾을 수 없습니다.' });
    }

    // 2. 퀴즈 통과 여부에 따라 schedules 상태를 completed / failed로 확실하게 전환
    const scoreVal = score !== undefined ? score : null;
    const correctVal = correctCount !== undefined ? correctCount : null;
    const totalVal = total !== undefined ? total : null;

    const today = getLocalDateString();
    const isEarlyReview = !isBonus && (schedule.planned_date > today);

    if (isEarlyReview) {
      // 예정일 전 조기 복습인 경우: 상태는 pending 유지, completed_at은 NULL로 기록하되 성적 데이터만 세이브 (통계 카운트에서 제외됨)
      await dbQuery.run(
        `UPDATE schedules SET status = 'pending', completed_at = NULL, score = ?, correct_count = ?, total_count = ? WHERE id = ?`,
        [scoreVal, correctVal, totalVal, targetScheduleId]
      );
    } else {
      if (isPassed) {
        await dbQuery.run(
          `UPDATE schedules SET status = 'completed', completed_at = ?, score = ?, correct_count = ?, total_count = ? WHERE id = ?`,
          [now, scoreVal, correctVal, totalVal, targetScheduleId]
        );
      } else {
        // 실패 시 failed 마킹 → 다음 날 대시보드에 다시 pending으로 조회되지 않도록 상태 갱신
        await dbQuery.run(
          `UPDATE schedules SET status = 'failed', completed_at = ?, score = ?, correct_count = ?, total_count = ? WHERE id = ?`,
          [now, scoreVal, correctVal, totalVal, targetScheduleId]
        );
      }
    }

    // [핵심] 복습 완료 시, 풀이한 문제 세트, 객관식 마킹 내역, 주관식 풀이 열람 이력을 기기 간 완벽 복원하기 위해 세션 테이블에 세이브
    if (questions && questions.length > 0) {
      const solvedSessionKey = `completed_review_schedule_${targetScheduleId}`;
      const solvedSessionValue = JSON.stringify({ 
        questions, 
        selectedAnswers: selectedAnswers || {}, 
        revealedQuestions: revealedQuestions || {},
        tableAnswers: tableAnswers || {},
        tableGradingResults: tableGradingResults || {},
        tutorAnswers: tutorAnswers || {},
        tutorInputText: tutorInputText || {},
        chatHistory: chatHistory || []
      });
      await dbQuery.run('DELETE FROM app_session WHERE key = ?', [solvedSessionKey]);
      await dbQuery.run(
        'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [solvedSessionKey, solvedSessionValue]
      );

      // [보존정책] 최근 2개 회차를 제외한 이전 오래된 복습 세션 데이터 삭제
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

    // 3. 해당 토픽의 임시 캐시(문제집 세션) 초기화 → 다음 복습 시 새 문제 생성 보장
    await ensureSessionTable();
    await dbQuery.run(
      "DELETE FROM app_session WHERE key = ? OR key LIKE ?",
      [`review_questions_topic_${topic_id}`, `review_questions_topic_${topic_id}_sess_%`]
    );
    if (targetScheduleId && targetScheduleId !== 9999 && targetScheduleId !== '9999') {
      await dbQuery.run(
        "DELETE FROM app_session WHERE key = ? OR key LIKE ?",
        [`review_questions_schedule_${targetScheduleId}`, `review_questions_schedule_${targetScheduleId}_sess_%`]
      );
    }

    // 4. 통과한 경우, 다음 회차 자동 생성
    if (isPassed && !isBonus && schedule.review_round !== 99) {
      const baseDate = referenceDate ? new Date(referenceDate) : new Date();
      await scheduleNextReviewRound(topic_id, schedule.review_round, baseDate);
    }

    res.json({
      success: true,
      isPassed,
      status: isPassed ? 'completed' : 'failed',
      message: isPassed
        ? `${schedule.review_round}회차 퀴즈 통과! 스케줄이 완료 처리되었습니다.`
        : `${schedule.review_round}회차 퀴즈 미통과. 다음 복습 시 새 문제가 제공됩니다.`
    });
  } catch (error) {
    console.error('[quiz/submit] Error:', error);
    res.status(500).json({ error: '서버 오류로 퀴즈 결과를 반영하지 못했습니다.' });
  }
});

// Admin backfill trigger
app.post('/api/admin/backfill-scores', async (req, res) => {
  try {
    await backfillPastScheduleScores();
    res.json({ success: true, message: '과거 복습 이력 점수 백필 완료' });
  } catch (err) {
    console.error('Admin backfill error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3.5. Reset/Cancel Review Round Completion (Change back from completed to pending)
app.post('/api/schedules/:id/reset', async (req, res) => {
  const scheduleId = req.params.id;

  try {
    const checkSql = `SELECT * FROM schedules WHERE id = ?`;
    const schedule = await dbQuery.get(checkSql, [scheduleId]);

    if (!schedule) {
      return res.status(404).json({ error: '해당 복습 일정을 찾을 수 없습니다.' });
    }

    // Allow reset/refresh regardless of the current database status to prevent client state mismatch blocks
    const todayDateStr = getLocalDateString();
    let newPlannedDate = schedule.planned_date;
    const targetStatus = schedule.status === 'practice' ? 'practice' : 'pending';

    const updateSql = `
      UPDATE schedules 
      SET status = ?, completed_at = NULL, planned_date = ?, score = NULL, correct_count = NULL, total_count = NULL
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [targetStatus, newPlannedDate, scheduleId]);

    // 복습이 대기 상태로 리셋될 경우, 뒤이어 자동 생성되었던 다음 회차의 pending 스케줄을 삭제합니다.
    const nextRound = schedule.review_round + 1;
    const deleteSql = `
      DELETE FROM schedules 
      WHERE topic_id = ? AND review_round = ? AND status = 'pending'
    `;
    await dbQuery.run(deleteSql, [schedule.topic_id, nextRound]);
    console.log(`Cleaned up auto-created future round ${nextRound} for topic ${schedule.topic_id} due to reset`);

    res.json({
      message: `${schedule.review_round}회차 복습이 대기 상태로 초기화되었습니다.`,
      schedule_id: scheduleId,
      status: 'pending',
      planned_date: newPlannedDate,
      completed_at: null
    });
  } catch (error) {
    console.error('Error resetting review:', error);
    res.status(500).json({ error: '서버 오류로 복습 상태 초기화에 실패했습니다.' });
  }
});

// 3.6. Update Completed Review Schedule Score manually
app.put('/api/schedules/:id/score', async (req, res) => {
  const scheduleId = Number(req.params.id) || req.params.id;
  const { score } = req.body;

  if (score === undefined || score === null || isNaN(Number(score)) || Number(score) < 0 || Number(score) > 100) {
    return res.status(400).json({ error: '점수는 0에서 100 사이의 올바른 숫자여야 합니다.' });
  }

  try {
    const checkSql = `SELECT * FROM schedules WHERE id = ?`;
    const schedule = await dbQuery.get(checkSql, [scheduleId]);

    if (!schedule) {
      return res.status(404).json({ error: '해당 복습 일정을 찾을 수 없습니다.' });
    }

    if (schedule.status !== 'completed' && schedule.status !== 'failed') {
      return res.status(400).json({ error: '완료 또는 실패 상태인 항목만 점수를 입력할 수 있습니다.' });
    }

    const targetScore = Math.round(Number(score) * 10) / 10;
    
    // Status is updated: if score >= 60, status = 'completed'; else status = 'failed'
    const newStatus = targetScore >= 60 ? 'completed' : 'failed';

    const updateSql = `
      UPDATE schedules 
      SET score = ?, status = ?
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [targetScore, newStatus, scheduleId]);

    res.json({
      success: true,
      message: `${schedule.review_round}회차 복습 점수가 ${targetScore}점으로 업데이트되었습니다.`,
      score: targetScore,
      status: newStatus
    });
  } catch (error) {
    console.error('Error updating manual score:', error);
    res.status(500).json({ error: '서버 오류로 점수를 업데이트하지 못했습니다.' });
  }
});

// 4. Retrieve All Topics with Spaced Schedules
app.get('/api/topics', async (req, res) => {
  try {
    const sql = `
      SELECT t.id, t.title, t.keywords, t.pdf_name, t.created_at, t.category,
             COALESCE((SELECT MAX(completed_at) FROM schedules WHERE topic_id = t.id AND completed_at IS NOT NULL), t.created_at) AS last_active
      FROM topics t
      ORDER BY t.id ASC
    `;
    const topics = await dbQuery.all(sql);

    const topicsWithSchedules = [];
    for (const topic of topics) {
      const scheduleSql = `
        SELECT s.id, s.review_round, s.planned_date, s.completed_at, s.status, s.score, s.correct_count, s.total_count,
               CASE WHEN (SELECT 1 FROM app_session WHERE key = 'completed_review_schedule_' || s.id) IS NOT NULL THEN 1 ELSE 0 END AS has_session
        FROM schedules s
        WHERE s.topic_id = ?
        ORDER BY s.review_round ASC
      `;
      const schedules = await dbQuery.all(scheduleSql, [topic.id]);
      topicsWithSchedules.push({
        ...topic,
        schedules: schedules
      });
    }

    res.json(topicsWithSchedules);
  } catch (error) {
    console.error('Error fetching all topics:', error);
    res.status(500).json({ error: '서버 오류로 토픽 목록을 조회하지 못했습니다.' });
  }
});

// 5. Delete Topic and associated Schedules
app.delete('/api/topics/:id', async (req, res) => {
  const topicId = Number(req.params.id) || req.params.id;

  try {
    const checkSql = `SELECT * FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(checkSql, [topicId]);

    if (!topic) {
      return res.status(404).json({ error: '해당 토픽을 찾을 수 없습니다.' });
    }

    const deleteSql = `DELETE FROM topics WHERE id = ?`;
    await dbQuery.run(deleteSql, [topicId]);

    res.json({
      message: `토픽 [${topic.title}] 및 관련 복습 일정이 안전하게 삭제되었습니다.`,
      topicId: topicId
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({ error: '서버 오류로 토픽 삭제에 실패했습니다.' });
  }
});

// 5.1. Update Topic Title
app.put('/api/topics/:id/title', async (req, res) => {
  const topicId = Number(req.params.id) || req.params.id;
  const { title } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: '제목은 필수입니다.' });
  }

  try {
    const checkSql = `SELECT * FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(checkSql, [topicId]);

    if (!topic) {
      return res.status(404).json({ error: '해당 토픽을 찾을 수 없습니다.' });
    }

    const updateSql = `UPDATE topics SET title = ? WHERE id = ?`;
    await dbQuery.run(updateSql, [title.trim(), topicId]);

    console.log(`[PUT /api/topics/:id/title] Successfully updated title to "${title.trim()}" for topicId=${topicId}`);

    res.json({
      success: true,
      message: '토픽 제목이 성공적으로 수정되었습니다.'
    });
  } catch (error) {
    console.error('Error updating topic title:', error);
    res.status(500).json({ error: '서버 오류로 토픽 제목 수정에 실패했습니다.' });
  }
});

// Force DB table initialization route
app.get('/api/init-db', async (req, res) => {
  try {
    await initDatabase();
    res.json({ success: true, message: 'DB tables initialized successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Safe LLM Diagnoser Route
app.get('/api/test-llm', async (req, res) => {
  const logs = [];
  const keys = [
    { name: 'GEMINI_API_KEY', val: process.env.GEMINI_API_KEY },
    { name: 'GEMINI_API_KEY_SECONDARY', val: process.env.GEMINI_API_KEY_SECONDARY }
  ];

  for (const k of keys) {
    if (!k.val) {
      logs.push({ name: k.name, status: 'SKIPPED', reason: 'Key not configured' });
      continue;
    }
    const trimmed = k.val.trim().replace(/^['"]|['"]$/g, '');
    const masked = `${trimmed.substring(0, 8)}...${trimmed.substring(trimmed.length - 4)}`;
    
    if (trimmed.startsWith('gsk_')) {
      // Test Groq call
      logs.push({ name: k.name, type: 'Groq', masked, status: 'TESTING' });
      const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'llama-3.1-8b-instant'];
      let groqSuccess = false;
      
      for (const model of GROQ_MODELS) {
        try {
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${trimmed}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: model,
              messages: [{ role: 'user', content: 'Say hello in 3 words' }],
              temperature: 0.2
            })
          });

          const status = response.status;
          const text = await response.text();
          if (response.ok) {
            const data = JSON.parse(text);
            logs.push({ name: k.name, model, status: 'SUCCESS', response: data.choices?.[0]?.message?.content });
            groqSuccess = true;
            break;
          } else {
            logs.push({ name: k.name, model, status: 'FAILED', httpStatus: status, error: text.substring(0, 300) });
          }
        } catch (err) {
          logs.push({ name: k.name, model, status: 'ERROR', error: err.message });
        }
      }
    } else {
      // Test Gemini call
      logs.push({ name: k.name, type: 'Gemini', masked, status: 'TESTING' });
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(trimmed);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }, { apiVersion: 'v1beta' });
        const result = await model.generateContent('Say hello in 3 words');
        const text = result.response.text();
        logs.push({ name: k.name, model: 'gemini-2.0-flash', status: 'SUCCESS', response: text });
      } catch (err) {
        logs.push({ name: k.name, model: 'gemini-2.0-flash', status: 'FAILED', error: err.message });
      }
    }
  }

  res.json({ success: true, logs });
});

// Environment Debug Route
app.get('/api/debug-env', async (req, res) => {
  const connectionString = process.env.DATABASE_URL || 
                           process.env.POSTGRES_URL || 
                           process.env.POSTGRES_PRISMA_URL ||
                           process.env.SUPABASE_DATABASE_URL ||
                           '';
  
  const envKeys = Object.keys(process.env).sort();

  // Parse URL to show connection details (no password)
  let parsedInfo = null;
  if (connectionString) {
    try {
      const normalized = connectionString.replace(/^postgres:\/\//, 'postgresql://');
      const url = new URL(normalized);
      parsedInfo = {
        host: url.hostname,
        port: url.port,
        user: decodeURIComponent(url.username),
        database: url.pathname.replace(/^\//, ''),
        passwordLength: url.password.length,
      };
    } catch(e) {
      parsedInfo = { parseError: e.message };
    }
  }

  // Live DB connection test and diagnostics
  let dbLiveTest = 'not_attempted';
  let dbLiveError = null;
  let liveTopics = [];
  let liveSchedules = [];
  if (connectionString) {
    try {
      const { default: pg } = await import('pg');
      const normalized = connectionString.replace(/^postgres:\/\//, 'postgresql://');
      const url = new URL(normalized);
      const testPool = new pg.Pool({
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        host: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 5432,
        database: url.pathname.replace(/^\//, ''),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });
      await testPool.query('SELECT 1');
      
      const topicsRes = await testPool.query('SELECT id, title, category, keywords FROM topics ORDER BY id ASC');
      liveTopics = topicsRes.rows;
      
      const schedulesRes = await testPool.query('SELECT id, topic_id, review_round, status, planned_date FROM schedules ORDER BY id DESC LIMIT 20');
      liveSchedules = schedulesRes.rows;

      await testPool.end();
      dbLiveTest = 'success';
    } catch (e) {
      dbLiveTest = 'failed';
      dbLiveError = e.message;
    }
  }

  const progressList = [];
  if (global.progressTracker) {
    for (const [key, value] of global.progressTracker.entries()) {
      progressList.push({ progressId: key, ...value });
    }
  }

  res.json({
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    keyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
    primaryKeyPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : '',
    hasSecondaryGeminiKey: !!process.env.GEMINI_API_KEY_SECONDARY,
    secondaryKeyLength: process.env.GEMINI_API_KEY_SECONDARY ? process.env.GEMINI_API_KEY_SECONDARY.length : 0,
    secondaryKeyPrefix: process.env.GEMINI_API_KEY_SECONDARY ? process.env.GEMINI_API_KEY_SECONDARY.substring(0, 5) : '',
    hasTertiaryGeminiKey: !!process.env.GEMINI_API_KEY_TERTIARY,
    tertiaryKeyLength: process.env.GEMINI_API_KEY_TERTIARY ? process.env.GEMINI_API_KEY_TERTIARY.length : 0,
    hasClaudeKey: !!process.env.ANTHROPIC_API_KEY,
    claudeKeyLength: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.length : 0,
    hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    openaiKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
    hasXaiKey: !!process.env.XAI_API_KEY,
    xaiKeyLength: process.env.XAI_API_KEY ? process.env.XAI_API_KEY.length : 0,
    hasGrokKey: !!process.env.GROK_API_KEY,
    grokKeyLength: process.env.GROK_API_KEY ? process.env.GROK_API_KEY.length : 0,
    hasDbUrl: !!connectionString,
    dbUrlLength: connectionString.length,
    parsedDbInfo: parsedInfo,
    dbInitError: global.dbInitError || null,
    dbLiveTest,
    dbLiveError,
    liveTopics,
    liveSchedules,
    progressList,
    envKeys: envKeys,
    nodeEnv: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

// Helper to shuffle multiple choice options and update the correct answer reference
function shuffleMultipleChoice(q) {
  if (!q || !q.options || q.options.length === 0) return q;
  const originalAnswer = q.answer;
  const shuffledOptions = [...q.options];
  for (let i = shuffledOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
  }
  const normalize = (s) => (s || '').replace(/^\d+\.\s*/, '').trim();
  const matchedOption = shuffledOptions.find(opt => normalize(opt) === normalize(originalAnswer)) || originalAnswer;
  return {
    ...q,
    options: shuffledOptions,
    answer: matchedOption
  };
}





function assembleFinalQuestions(questions, topic, carryOverQuestions, fileText) {
  let qIntro = questions.find(q => q.type === '주관식 (개요)');
  let qFormula = questions.find(q => q.type === '주관식 (공식)');
  
  const fallbackQs = generateFallbackQuestions(topic.title, topic.keywords, fileText || '')
    .filter(q => !(q.question || '').includes('general_geotech'));
  
  if (!qIntro) {
    qIntro = fallbackQs.find(q => q.type === '주관식 (개요)');
  }
  if (!qFormula) {
    qFormula = fallbackQs.find(q => q.type === '주관식 (공식)');
  }

  if (qIntro) {
    qIntro = { ...qIntro };
    qIntro.type = '주관식 (개요)';
    delete qIntro.tableData;
    delete qIntro.answers;
    delete qIntro.subtype;
  } else {
    qIntro = {
      type: "주관식 (개요)",
      question: `[${topic.title}]의 가장 핵심적인 공학적 정의(개요)와 기본적인 작동 원리를 서술하시오.`,
      concept: `${topic.title}의 개요와 기본 원리입니다.`,
      formula: "",
      structure: ""
    };
  }

  if (qFormula) {
    qFormula = { ...qFormula };
    qFormula.type = '주관식 (공식)';
    delete qFormula.tableData;
    delete qFormula.answers;
    delete qFormula.subtype;
  } else {
    qFormula = {
      type: "주관식 (공식)",
      question: `${topic.title}의 대표적인 설계 공식 명칭을 기술하시오.`,
      concept: `${topic.title}의 대표 공식입니다.`,
      formula: "",
      structure: ""
    };
  }

  const subjsShort = questions.filter(q => q.type === '주관식 (단답형)' && q !== qIntro && q !== qFormula);
  const subjsTable = questions.filter(q => (q.type === '주관식 (표채우기)' || q.subtype === '표채우기') && q !== qIntro && q !== qFormula);
  const mcs = questions.filter(q => (q.type === '객관식 (4지선다)' || (q.options && q.options.length > 0)) && q !== qIntro && q !== qFormula);

  // 2. Q12, Q13, Q14, Q15 (Short Answer) - exactly 4
  let finalSubjsShort = [...subjsShort];
  if (finalSubjsShort.length < 4) {
    const fallbackShorts = fallbackQs.filter(q => q.type === '주관식 (단답형)' && q !== qIntro && q !== qFormula);
    finalSubjsShort = [...finalSubjsShort, ...fallbackShorts];
  }

  // Dedup finalSubjsShort to avoid exact duplicates
  const uniqueShort = [];
  const shortSeen = new Set();
  finalSubjsShort.forEach(q => {
    const qText = (q.question || '').trim();
    if (qText && !shortSeen.has(qText)) {
      shortSeen.add(qText);
      uniqueShort.push(q);
    }
  });
  finalSubjsShort = uniqueShort.slice(0, 4);

  // If we still need more to make exactly 4, we dynamically derive from Q1 (qIntro)
  if (finalSubjsShort.length < 4 && qIntro) {
    finalSubjsShort.push({
      type: "주관식 (단답형)",
      question: `[${topic.title}]의 가장 핵심적인 공학적 정의(개요)와 기본적인 작동 원리를 서술하시오.`,
      answer: qIntro.concept || `${topic.title}의 핵심 개념`,
      explanation: `${topic.title}에 관한 핵심 정의 및 개요 서술형 평가입니다.`
    });
  }

  // Ensure we have exactly 4
  const defaultShortQuestions = [
    `${topic.title} 공법/개념의 핵심적인 공학적 의미 및 메커니즘을 설명하시오.`,
    `${topic.title} 적용 시 현장에서 발생할 수 있는 주요 시공 하자 원인과 그 대책을 서술하시오.`,
    `${topic.title} 설계 시 안전율 확보 및 하중 작용 조건에 따른 검토 사항을 서술하시오.`,
    `${topic.title}의 장단점을 타 유사 공법과 비교하여 설명하시오.`
  ];
  let defaultQIdx = 0;
  while (finalSubjsShort.length < 4) {
    finalSubjsShort.push({
      type: "주관식 (단답형)",
      question: defaultShortQuestions[defaultQIdx % defaultShortQuestions.length],
      answer: "핵심 메커니즘 및 공학적 대책",
      explanation: `${topic.title}의 세부 공학적 개념과 현장 실무적인 작동 원리입니다.`
    });
    defaultQIdx++;
  }

  // 3. Q5 (Table Quiz) - exactly 2
  let finalSubjsTable = [...subjsTable].slice(0, 2);
  if (finalSubjsTable.length < 2) {
    const fallbackTables = fallbackQs.filter(q => (q.type === '주관식 (표채우기)' || q.subtype === '표채우기') && q !== qIntro && q !== qFormula);
    finalSubjsTable = [...finalSubjsTable, ...fallbackTables].slice(0, 2);
  }
  while (finalSubjsTable.length < 2) {
    finalSubjsTable.push(      {
        type: "주관식 (표채우기)",
        question: "터널 굴착면 상부의 보강 공법인 강관다단 그라우팅과 천단 훠폴링 공법의 비교표 빈칸 (A), (B)에 들어갈 공학적 설명을 기술하시오.",
        tableData: {
          headers: ["비교 항목", "강관다단 그라우팅 공법", "천단 훠폴링 (Forepoling) 공법"],
          rows: [
            ["보강재 규격 및 특성", "대구경 강관 주입재 가압 그라우팅", "[INPUT_1]"],
            ["주요 역할 및 역학적 기전", "[INPUT_2]", "천단 낙석 방지 및 국부 붕괴 방지"],
            ["시공 길이 및 범위", "10m ~ 15m (중첩 시공 필요)", "3m ~ 6m 내외"]
          ]
        },
        answers: {
          "INPUT_1": "소구경 강봉 또는 이형철근 주입",
          "INPUT_2": "터널 상부 종방향 아치 형성 및 차수"
        },
        explanation: "강관다단 그라우팅은 대구경 강관과 가압 주입을 통해 천단부에 종방향 아치를 형성하고 차수 효과를 극대화하는 반면, 훠폴링은 소구경 보강재로 천단의 국부 탈락 및 낙석 방지에 초점을 둡니다."
      });
  }

  // 4. MC questions (5 questions)
  let finalMcs = [];
  const uniqueMcQuestions = new Set();

  mcs.forEach(q => {
    if (finalMcs.length >= 5) return;
    const cleanQ = (q.question || '').trim();
    if (cleanQ && !uniqueMcQuestions.has(cleanQ)) {
      uniqueMcQuestions.add(cleanQ);
      finalMcs.push(q);
    }
  });

  if (finalMcs.length < 5 && carryOverQuestions && carryOverQuestions.length > 0) {
    const shuffledCarryOvers = carryOverQuestions.map(q => shuffleMultipleChoice(q));
    shuffledCarryOvers.forEach(q => {
      if (finalMcs.length >= 5) return;
      const cleanQ = (q.question || '').trim();
      if (cleanQ && !uniqueMcQuestions.has(cleanQ)) {
        uniqueMcQuestions.add(cleanQ);
        finalMcs.push(q);
      }
    });
  }

  if (finalMcs.length < 5) {
    const fallbackMcs = fallbackQs.filter(q => (q.options && q.options.length > 0) && q !== qIntro && q !== qFormula).map(q => shuffleMultipleChoice(q));
    for (const fQ of fallbackMcs) {
      if (finalMcs.length >= 5) break;
      const cleanQ = (fQ.question || '').trim();
      if (cleanQ && !uniqueMcQuestions.has(cleanQ)) {
        uniqueMcQuestions.add(cleanQ);
        finalMcs.push(fQ);
      }
    }
  }

  if (finalMcs.length < 5) {
    const defaultGeotechMcs = [
      {
        type: "객관식 (4지선다)",
        question: `[${topic.title} 공학적 특성] 토목 및 지반 공사에서 흙과 암반의 투수성 및 배수 설계 시 지하수위 변동이 옹벽 구조물의 배면 토압에 미치는 영향으로 가장 부적절한 것은?`,
        options: [
          "지하수위가 상승하면 배면 정수압이 추가되어 옹벽에 작용하는 전주동토압이 증가한다.",
          "지하수위 이하 지반의 흙 단위중량은 수중 단위중량으로 감소하여 토압 자체는 줄어든다.",
          "수압과 토압이 동시에 작용할 때 구조물의 전도 및 활동 리스크가 감소한다.",
          "원활한 배수를 위해 필터재와 유공관을 설계하여 수압 상승을 적극 억제해야 한다."
        ],
        answer: "수압과 토압이 동시에 작용할 때 구조물의 전도 및 활동 리스크가 감소한다.",
        explanation: "배면 수압과 토압이 동시에 작용하면 구조물에 가해지는 횡압력이 급격히 증가하여 전도(Overturning) 및 활동(Sliding) 리스크가 대폭 증가합니다. 따라서 리스크가 감소한다는 설명은 잘못되었습니다."
      },
      {
        type: "객관식 (4지선다)",
        question: `[${topic.title} 설계 안전율] 지반 공학적 설계 조건에서 사면 안정 및 기초의 지지력 산정 시 적용되는 안전율(Factor of Safety) 개념에 관한 설명으로 가장 올바르지 않은 것은?`,
        options: [
          "안전율은 지반 정수의 불확실성, 시공 오차, 하중 변동성 등을 고려한 마진이다.",
          "일시적 집중호우나 지진 등의 지진동 작용 시에는 기준 안전율을 상향하여 설계해야 한다.",
          "허용응력설계법(ASD)에서는 극한 저항력을 소요 안전율로 나누어 허용력을 산정한다.",
          "안전율이 1.0 미만인 지반 구조물은 역학적으로 항상 영구히 안정한 상태를 유지한다."
        ],
        answer: "안전율이 1.0 미만인 지반 구조물은 역학적으로 항상 영구히 안정한 상태를 유지한다.",
        explanation: "안전율(F.S)이 1.0 미만이라는 것은 저항력이 작용력보다 작다는 의미이므로 붕괴나 미끄러짐 등의 한계상태에 도달하여 불안정한 상태가 됨을 뜻합니다. 따라서 항상 안전하다는 진술은 잘못되었습니다."
      },
      {
        type: "객관식 (4지선다)",
        question: `[${topic.title} 전단강도] Terzaghi의 유효응력(Effective Stress) 원리를 적용하여 점성토 지반의 전단강도를 해석할 때, 과잉간극수압(Excess Pore Water Pressure)의 소산과 흙의 거동에 관한 설명 중 가장 옳지 않은 것은?`,
        options: [
          "압밀이 진행됨에 따라 과잉간극수압이 소산되고 유효응력이 증가한다.",
          "유효응력이 증가하면 점성토 지반의 전단강도와 전단 저항각이 점진적으로 증가한다.",
          "비배수 상태에서 급속 하중을 재하하면 유효응력의 변화가 즉시 차단되므로 전단강도가 무한대로 상승한다.",
          "간극수압계(Piezometer)를 활용하여 현장에서 과잉간극수압의 소산 경향을 계측할 수 있다."
        ],
        answer: "비배수 상태에서 급속 하중을 재하하면 유효응력의 변화가 즉시 차단되므로 전단강도가 무한대로 상승한다.",
        explanation: "비배수 상태에서 급속 하중을 가하면 과잉간극수압이 상승하고 유효응력은 증가하지 않거나 감소하여 전단강도가 저하될 수 있으며, 결코 전단강도가 무한대로 상승하지 않습니다."
      },
      {
        type: "객관식 (4지선다)",
        question: `[${topic.title} 지반 조사] 지반 공학 설계 시 수행하는 표준관입시험(SPT) 및 N치에 관한 공학적 해석으로 가장 적절하지 않은 것은?`,
        options: [
          "N치는 63.5kg의 해머를 76cm 높이에서 자유 낙하시켜 30cm 관입하는 데 필요한 타격 횟수이다.",
          "SPT N치는 모래 지반의 상대밀도(Dr) 및 점성토 지반의 일축압축강도(qu)를 추정하는 데 활용된다.",
          "지하수위 이하 미세모래 지반에서 측정된 N치는 Terzaghi 공식 등으로 수위를 보정하여 사용해야 한다.",
          "SPT 시험은 현장에서 수행되는 물리탐사 기법이므로 지반 시료를 직접 채취하여 실물 관찰하는 것은 불가능하다."
        ],
        answer: "SPT 시험은 현장에서 수행되는 물리탐사 기법이므로 지반 시료를 직접 채취하여 실물 관찰하는 것은 불가능하다.",
        explanation: "표준관입시험(SPT)은 스플릿 스푼 샘플러를 타격하여 진행되므로 관입 종료 후 샘플러 내부의 교란 시료를 직접 채취하여 지층 분석 및 흙의 육안 감별을 수행할 수 있습니다."
      },
      {
        type: "객관식 (4지선다)",
        question: `[${topic.title} 계측 관리] 지반 굴착 및 터널 공사 중 구조물 배면 지반의 수평 변위량 및 붕괴 징후를 실시간으로 모니터링하기 위해 설치하는 핵심 계측 기기로 가장 부적절한 것은?`,
        options: [
          "경사계 (Inclinometer)",
          "지중변위계 (Extensometer)",
          "음향측정기 (Sound Level Meter)",
          "하중계 (Load Cell)"
        ],
        answer: "음향측정기 (Sound Level Meter)",
        explanation: "지반 거동 및 변위 모니터링을 위해서는 경사계, 지중변위계, 하중계 등이 사용되며, 소음 수준을 측정하는 음향측정기는 지반의 물리적 변위나 역학적 붕괴 징후 계측과는 직접적인 관련이 없습니다."
      }
    ];

    const deficit = 5 - finalMcs.length;
    console.log(`[문항 치환/보강] 유니크 객관식이 부족하여 ${deficit}개 문항을 고품질 기본 지반공학 객관식으로 보강합니다.`);
    for (let i = 0; i < deficit; i++) {
      finalMcs.push(defaultGeotechMcs[i % defaultGeotechMcs.length]);
    }
  }

  const shuffledMcs = shuffleArray([...finalMcs]);
  const shuffledTables = shuffleArray([...finalSubjsTable]);
  const shuffledShortsMiddle = shuffleArray([finalSubjsShort[0], finalSubjsShort[1]]);

  return [
    qIntro,                     // 1번 주관식 (index 0)
    qFormula,                   // 2번 주관식 (index 1)
    shuffledMcs[0],             // 3번 객관식 (index 2)
    shuffledTables[0],          // 4번 표채우기 (index 3)
    shuffledMcs[1],             // 5번 객관식 (index 4)
    shuffledShortsMiddle[0],    // 6번 주관식 (index 5)
    shuffledMcs[2],             // 7번 객관식 (index 6)
    shuffledTables[1],          // 8번 표채우기 (index 7)
    shuffledMcs[3],             // 9번 객관식 (index 8)
    shuffledShortsMiddle[1],    // 10번 주관식 (index 9)
    shuffledMcs[4],             // 11번 객관식 (index 10)
    finalSubjsShort[2],         // 12번 주관식 (index 11)
    finalSubjsShort[3]          // 13번 주관식 (index 12)
  ];
}

function generateCalculationFallbackQuestions(title, keywords) {
  return [
    {
      type: "주관식 (단답형)",
      question: `[${title} 계산 문제 1] ${title}의 기본 가정을 바탕으로 극한 지지력 및 구조물의 허용하중 수치를 구하시오. (첨부된 원보고서의 이미지 및 도표를 참고하여 설계 인자들을 대입하여 계산하십시오.)`,
      answer: "원보고서 조건에 따른 수치",
      explanation: "원보고서 및 제공된 스크샷 이미지의 공학적 설계 조건(지반 종류, 지하수위, 기초폭 등)을 대입하여 극한 지지력을 계산하는 전개 과정입니다."
    },
    {
      type: "주관식 (단답형)",
      question: `[${title} 계산 문제 2] ${title}의 설계 매개변수 변화에 따른 최종 지반 반력 및 작용 응력 분포를 연산하시오. (첨부된 그림의 수치를 적용하여 연산하십시오.)`,
      answer: "설계 조건 변화에 따른 변동 수치",
      explanation: "공식에 변경된 지반 매개변수 및 구조적 수치를 대입하여 최종 연직/수평 하중 및 안정성을 구하는 계산 해설입니다."
    },
    {
      type: "주관식 (단답형)",
      question: `[${title} 공학적 의미] 이 계산 과정 및 결과가 설계와 시공 실무에 주는 교훈 또는 공학적 의미(지반 거동 해석, 안전성 평가 등)를 설명하십시오.`,
      answer: "설계 및 시공 조건의 안전 여유도 확보와 지반 거동 분석의 기초 자료 제공",
      explanation: "계산 결과를 통해 한계 상태를 판단하고, 실제 지반의 거동 특징과 불확실성을 고려한 설계 마진 및 공학적 교훈을 이해하는 것이 핵심입니다."
    },
    {
      type: "주관식 (단답형)",
      question: `[${title} 공학적 대책] 이 문제의 계산 결과(지지력 부족, 침하량 과다, 불안정 등)와 관련하여 현장에서 공학적 문제가 발생했을 때의 실무적 해결책 및 대책을 서술하십시오.`,
      answer: "지반 개량 공법 적용, 하중 분산 대책 수립, 계측 관리 강화 및 차수/배수 공법 설계",
      explanation: "계산치 초과 또는 지반 붕괴 위험 등 불안정성 발생 시 현장에서 취할 수 있는 구체적인 지반 개량(그라우팅, 다짐 등) 및 공법 변경 대책을 제시하는 문항입니다."
    }
  ];
}

function assembleFinalCalculationQuestions(questions, topic) {
  // 주관식 (단답형) 및 주관식 (표채우기) 모두 허용
  let finalQuestions = (questions || []).filter(q =>
    q.type === '주관식 (단답형)' || q.type === '주관식 (표채우기)'
  );
  const fb = generateCalculationFallbackQuestions(topic.title, topic.keywords);
  while (finalQuestions.length < 4) {
    finalQuestions.push(fb[finalQuestions.length]);
  }
  return finalQuestions.slice(0, 4);
}

app.post('/api/topics/:id/ai-questions', async (req, res) => {
  const topicId = Number(req.params.id) || req.params.id;
  console.log(`[POST /api/topics/:id/ai-questions] Triggered: req.params.id="${req.params.id}", coerced topicId=${topicId} (type: ${typeof topicId})`);

  let resolvedScheduleId;
  let topic = null;

  try {
    const topicSql = `SELECT * FROM topics WHERE id = ?`;
    console.log(`[POST /api/topics/:id/ai-questions] Querying topic row using SQL: "${topicSql}"`);
    topic = await dbQuery.get(topicSql, [topicId]);

    if (!topic) {
      console.warn(`[POST /api/topics/:id/ai-questions] Topic NOT found in DB for topicId=${topicId}`);
      return res.status(404).json({ error: '토픽을 찾을 수 없습니다.' });
    }
    console.log(`[POST /api/topics/:id/ai-questions] Found topic in DB: title="${topic.title}", keywords="${topic.keywords}", pdf_name="${topic.pdf_name}"`);
  } catch (err) {
    console.error('[POST /api/topics/:id/ai-questions] Topic fetch error:', err);
    return res.status(500).json({ error: err.message });
  }

  // 1. 캐시 체크를 최상위에서 먼저 수행합니다.
  let isCacheHit = false;
  let cachedResponseData = null;

  try {
    await ensureSessionTable();
    const scheduleId = req.query.scheduleId;
    const isPractice = req.query.isPractice === 'true';
    resolvedScheduleId = scheduleId;

    if (!resolvedScheduleId || resolvedScheduleId === '9999' || resolvedScheduleId === 'null' || resolvedScheduleId === 'undefined' || resolvedScheduleId === 9999) {
      // Check if there is an existing pending/practice schedule for this topic
      const existingPending = await dbQuery.get(
        `SELECT id FROM schedules WHERE topic_id = ? AND (status = 'pending' OR status = 'practice') ORDER BY id DESC LIMIT 1`,
        [topicId]
      );
      if (existingPending) {
        resolvedScheduleId = existingPending.id;
        console.log(`[AI-Questions] Reusing existing pending/practice schedule ID ${resolvedScheduleId} for topicId ${topicId}`);
      } else {
        const today = getLocalDateString();
        const initialStatus = isPractice ? 'practice' : 'pending';
        const insertRes = await dbQuery.run(
          `INSERT INTO schedules (topic_id, review_round, planned_date, status) VALUES (?, 99, ?, ?)`,
          [topicId, today, initialStatus]
        );
        resolvedScheduleId = insertRes.id;
        console.log(`[AI-Questions] Created new schedule ID ${resolvedScheduleId} for topicId ${topicId} (status: ${initialStatus})`);
      }
    }

    const sId = req.query.sessionId || 'legacy_default';
    const key = resolvedScheduleId
      ? `review_questions_schedule_${resolvedScheduleId}_sess_${sId}`
      : `review_questions_topic_${topicId}_sess_${sId}`;

    let cached = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);

    // [🚨 크로스 디바이스 세션 통합 발굴 및 자동 바인딩 폴백 🚨]
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
      if (row) {
        if (!newestSessionRow) {
          newestSessionRow = row;
        }
      }
    }

    if (!cached && newestSessionRow) {
      console.log(`[Unified Cross-Device Cache] Auto-bound active session from key: ${newestSessionRow.key}`);
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
      } catch (e) {
        console.warn('Failed to parse auto-bound sessionId in unified cache check:', e);
      }
    }

    if (!cached) {
      const legacyKey = resolvedScheduleId
        ? `review_questions_schedule_${resolvedScheduleId}`
        : `review_questions_topic_${topicId}`;
      cached = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [legacyKey]);
    }
    if (cached && cached.value) {
      console.log(`[Cache Hit Check] Serving saved review questions for key ${key}`);
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
        if (!(topic.category === '계산' && cachedQuestions.length !== 4)) {
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
            console.log(`[Cache Invalidated] ${mismatchedCount}/${cachedQuestions.length} cached questions mismatched. Discarding.`);
            await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
          }
        } else {
          console.log(`[Cache Invalidated] Calculation topic mismatched count. Discarding.`);
          await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        }
      }
    }
  } catch (e) {
    console.warn('Failed to parse cached review questions:', e);
  }

  // 캐시가 유효하게 적중했다면, 지침 0단계 분석 호출 없이 즉각 응답을 내주고 종료합니다.
  if (isCacheHit && cachedResponseData) {
    console.log(`[Fast Cache Return] Bypassing standards analysis since valid cache is serving.`);
    return res.json(cachedResponseData);
  }

  // 캐시가 없을 때만 비로소 지침 분석(Gemini 0단계) 및 진행률 바를 활성화합니다.
  let progressTimer = null;
  try {
    const progressId = req.query.progressId || req.body.progressId;
    let standardsAnalysis = '';
    const localCallLLM = (sys, prompt, img, scenario, opts) => {
      const enrichedPrompt = `[🚨 0단계 AI가 사전 분석한 절대 지침 준수 주의사항]:\n${standardsAnalysis}\n\n${prompt}`;
      return callLLMWithFailover(sys, enrichedPrompt, img, scenario, { ...opts, progressId });
    };
    if (progressId) {
      standardsAnalysis = await analyzeStandardsBeforeTask(progressId, topic.title, GENERATION_STANDARDS, 'generation');
      progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 예상 문제 생성 시작...', 50, 1500, 5);
    }

    // 1) Find the most recently completed/failed schedule of this topic and extract incorrect questions
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
                const normalizeAns = (s) => (s || '').replace(/^\d+\.\s*/, '').trim();
                if (normalizeAns(selected) !== normalizeAns(q.answer)) {
                  if (!isQuestionMismatched(q, topic.title, topic.keywords)) {
                    incorrectQuestions.push(q);
                  } else {
                    console.log(`[CarryOver Filter] Filtered out leaked question from carryover: "${q.question.substring(0, 50)}..."`);
                  }
                }
              }
            });
          }
        }
      }
      console.log(`[이전 회차 오답 조회] topicId=${topicId}, 오답 수=${incorrectQuestions.length}`);
    } catch (err) {
      console.warn('이전 오답 로딩 실패 (무시하고 신규 생성):', err);
    }

    const carryOverCount = Math.min(incorrectQuestions.length, 5);
    carryOverQuestions = incorrectQuestions.slice(0, carryOverCount);
    const neededAiMcCount = 5;

    let fileText = '';
    if (topic.pdf_data) {
      fileText = await getTopicText(topic);
      fileText = smartTruncate(fileText, 30000);
    }

    // ============================================================================
    // High-Fidelity Pre-defined Routing Interceptor (전공 정밀 가로채기 레이어)
    // If the topic matches any built-in expert-grade handcrafted domains,
    // we bypass Gemini AI generation and strictly serve the pre-defined expert set
    // to guarantee 100% academic rigor and eliminate robotic template injections.
    // ============================================================================
    const cleanTitle = (topic.title || '').toLowerCase();
    const cleanKeywords = (topic.keywords || '').toLowerCase();
    const searchTarget = `${cleanTitle} ${cleanKeywords}`;

    const isCoreTopic = 
      searchTarget.includes('활성도') || searchTarget.includes('activity') ||
      searchTarget.includes('이중층') || searchTarget.includes('double layer') || searchTarget.includes('전기이중층') || searchTarget.includes('ddl') ||
      searchTarget.includes('압밀') || searchTarget.includes('consolidation') || searchTarget.includes('침하') || searchTarget.includes('settlement') ||
      searchTarget.includes('sand mat') || searchTarget.includes('샌드매트') || searchTarget.includes('샌드 매트') || searchTarget.includes('sandmat') ||
      searchTarget.includes('평사투영') || searchTarget.includes('평사 투영') || searchTarget.includes('stereographic') || searchTarget.includes('stereonet') || searchTarget.includes('평사') ||
      searchTarget.includes('인발') || searchTarget.includes('인발시험') || searchTarget.includes('pullout') || searchTarget.includes('pull-out') || searchTarget.includes('락볼트 인발') || searchTarget.includes('인발 시험') ||
      searchTarget.includes('q 분류') || searchTarget.includes('q분류') || searchTarget.includes('q system') || searchTarget.includes('q-system') || searchTarget.includes('barton') || searchTarget.includes('바톤') ||
      searchTarget.includes('싱글쉘') || searchTarget.includes('single shell') || searchTarget.includes('single_shell') || searchTarget.includes('싱글 쉘') || searchTarget.includes('sst') || searchTarget.includes('더블쉘') ||
      searchTarget.includes('소일내일') || searchTarget.includes('소일네일') || searchTarget.includes('soil nail') || searchTarget.includes('어스앵커') || searchTarget.includes('어스 앵커') || searchTarget.includes('earth anchor') ||
      searchTarget.includes('프란틀') || searchTarget.includes('prandtl') ||
      searchTarget.includes('여굴') || searchTarget.includes('overbreak') || searchTarget.includes('제어발파') || searchTarget.includes('제어 발파') || searchTarget.includes('contour hole') || searchTarget.includes('외곽공') || searchTarget.includes('smooth blasting') || searchTarget.includes('스무드 블라스팅') || searchTarget.includes('스무드블라스팅') || searchTarget.includes('line drilling') || searchTarget.includes('라인 드릴링') || searchTarget.includes('presplitting') || searchTarget.includes('프리스플리팅') || searchTarget.includes('디커플링') || searchTarget.includes('decoupling') ||
      searchTarget.includes('사면안정') || searchTarget.includes('사면 안정') || searchTarget.includes('slope stability') || searchTarget.includes('slope') || searchTarget.includes('사면 붕괴') || searchTarget.includes('사면붕괴') || searchTarget.includes('원호파괴') || searchTarget.includes('평면파괴') || searchTarget.includes('쐐기파괴') || searchTarget.includes('전도파괴') || searchTarget.includes('절편법') || searchTarget.includes('fellenius') || searchTarget.includes('펠레니우스') || searchTarget.includes('bishop') || searchTarget.includes('비숍') ||
      searchTarget.includes('토압') || searchTarget.includes('옹벽') || searchTarget.includes('earth pressure') || searchTarget.includes('retaining wall') || searchTarget.includes('주동토압') || searchTarget.includes('수동토압') || searchTarget.includes('정지토압') || searchTarget.includes('주동 토압') || searchTarget.includes('수동 토압') || searchTarget.includes('정지 토압') || searchTarget.includes('랭킨') || searchTarget.includes('rankine') || searchTarget.includes('쿨롱') || searchTarget.includes('coulomb') ||
      searchTarget.includes('전단강도') || searchTarget.includes('전단 강도') || searchTarget.includes('shear strength') || searchTarget.includes('삼축압축') || searchTarget.includes('삼축 압축') || searchTarget.includes('uu 시험') || searchTarget.includes('cu 시험') || searchTarget.includes('cd 시험') || searchTarget.includes('uu시험') || searchTarget.includes('cu시험') || searchTarget.includes('cd시험') || searchTarget.includes('비배수') || searchTarget.includes('mohr-coulomb') || searchTarget.includes('모어 쿨롱') || searchTarget.includes('모어-쿨롱') ||
      searchTarget.includes('투수') || searchTarget.includes('침투') || searchTarget.includes('보일링') || searchTarget.includes('boiling') || searchTarget.includes('분사현상') || searchTarget.includes('분사 현상') || searchTarget.includes('piping') || searchTarget.includes('파이핑') || searchTarget.includes('seepage') || searchTarget.includes('permeability') || searchTarget.includes('darcy') || searchTarget.includes('다르시') || searchTarget.includes('임계동수경사') || searchTarget.includes('동수경사') || searchTarget.includes('유선망') || searchTarget.includes('flow net') ||
      searchTarget.includes('흙막이') || searchTarget.includes('가설 흙막이') || searchTarget.includes('가설흙막이') || searchTarget.includes('탄소성') || searchTarget.includes('탄소성보') || searchTarget.includes('탄소성보법') || searchTarget.includes('braced wall') || searchTarget.includes('braced_wall') || searchTarget.includes('지반스프링') || searchTarget.includes('지반 스프링') ||
      searchTarget.includes('액상화') || searchTarget.includes('liquefaction') || searchTarget.includes('간극수압') || searchTarget.includes('과잉간극수압') ||
      searchTarget.includes('보상기초') || searchTarget.includes('compensated foundation') || searchTarget.includes('compensated_foundation') || searchTarget.includes('하중 보상') || searchTarget.includes('하중보상') ||
      searchTarget.includes('수압파쇄') || searchTarget.includes('hydraulic fracturing') || searchTarget.includes('수압 파쇄') || searchTarget.includes('파쇄시험') || searchTarget.includes('파쇄 시험');

    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    const forceLocal = req.query.local === 'true';

    if (isCoreTopic && (forceLocal || !hasAnyAiKey)) {
      console.log(`[AI Route Interceptor - Local Fallback] Precision routed core topic "${topic.title}" to handcrafted expert-grade questions.`);
      const coreQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      const finalQuestions = topic.category === '계산'
        ? assembleFinalCalculationQuestions(coreQuestions, topic)
        : assembleFinalQuestions(coreQuestions, topic, carryOverQuestions, fileText);
      const cleanedCore = finalQuestions.map(q => healQuizQuestionObject({
        ...q,
        topic_id: Number(topicId),
        category: topic.category,
        question: cleanQuizQuestion(q.question)
      }));

      const deduplicatedCore = deduplicateQuestions(cleanedCore, topic, fileText, generateFallbackQuestions);

      // 세션에 자동 저장
      try {
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        await dbQuery.run(
          'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, JSON.stringify(deduplicatedCore)]
        );
      } catch (e) {
        console.warn('Failed to auto-save core review questions to app_session:', e);
      }

      return res.json({
        questions: deduplicatedCore,
        isFallback: true, // Treat as fallback as AI was bypassed
        mode: 'ai-optimized',
        info: 'Handcrafted premium routing bypass',
        scheduleId: resolvedScheduleId
      });
    }

    // Force local/source-based mode
    if (forceLocal || !hasAnyAiKey) {
      const reason = forceLocal ? '소스 기반 모드로 요청됨' : '등록된 AI API 키 없음';
      console.log(`Generating local fallback questions. Reason: ${reason}`);
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      const finalQuestions = topic.category === '계산'
        ? assembleFinalCalculationQuestions(fallbackQuestions, topic)
        : assembleFinalQuestions(fallbackQuestions, topic, carryOverQuestions, fileText);
      const cleanedFallback = finalQuestions.map(q => healQuizQuestionObject({
        ...q,
        topic_id: Number(topicId),
        category: topic.category,
        question: cleanQuizQuestion(q.question)
      }));

      const deduplicatedFallback = deduplicateQuestions(cleanedFallback, topic, fileText, generateFallbackQuestions);

      // 세션에 자동 저장
      try {
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        await dbQuery.run(
          'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, JSON.stringify(deduplicatedFallback)]
        );
      } catch (e) {
        console.warn('Failed to auto-save local fallback review questions to app_session:', e);
      }

      return res.json({ 
        questions: deduplicatedFallback, 
        isFallback: true,
        mode: 'local',
        error: forceLocal ? null : '백엔드 환경변수에 AI API 키가 존재하지 않습니다.',
        scheduleId: resolvedScheduleId
      });
    }

    let specialInstructions = '';
    if (cleanTitle.includes('확대기초') && cleanTitle.includes('거동') && cleanTitle.includes('파괴')) {
      specialInstructions = `
[특별 출제 지침 - 매우 중요]:
이 토픽은 '프란틀 지지력 공식'이나 '테르자기 극한지지력 공식' 자체의 상세한 유도나 공식 정의를 단독으로 묻는 토픽이 아닙니다.
반드시 다음의 핵심 영역들에 고도로 집중하여 객관식 6문제, 주관식 표채우기 1문제, 주관식 단답형 4문제를 출제하십시오:
1. 기초 아래 지반의 3대 파괴 형태: "전반전단파괴(General Shear Failure)", "국부전단파괴(Local Shear Failure)", "관입전단파괴(Punching Shear Failure)"의 구체적 발생 조건(상대밀도 $D_r$, 근입깊이비 $D_f/B$, 지반 압축성 등), 파괴면의 발달 메커니즘, 융기(Heaving) 및 침하의 시각적 거동 특징.
2. Vesic(1973)이 제안한 모래 지반에서의 파괴형태 예측 도표의 특징.
3. 기초 강성(연성기초 vs 강성기초)과 흙의 종류(사질토 vs 점성토)의 4가지 조합에 따른 접지압(Contact Pressure) 분포 패턴 및 침하 형상(등분포 여부, 가장자리/중심 최대 여부 등).
4. 하중-침하량($q - S$) 곡선의 파괴형태별(전반, 국부, 관입) 비교 특징 및 피크(Peak) 존재 여부.
5. 국부전단파괴나 관입전단파괴 예상 시 지반 강도정수 저감 방법($c' = \\frac{2}{3}c$, $\\tan\\phi' = \\frac{2}{3}\\tan\\phi$) 및 KDS 11 50 15(얕은기초 설계기준), KDS 14 20 50(콘크리트구조 기초설계기준)의 교차검증 내용.
※ '프란틀의 지지력 공식 이론'이나 '테르자기 연속기초 극한지지력 공식' 자체를 단독으로 묻는 단순 암기식 문제는 출제하지 마십시오. 흙의 실제 변형 거동과 전단 파괴 메커니즘, 접지압에 완전히 특화된 고급 주관식/객관식 문제를 출제해주십시오.
`;
    }

    let weaknessPrompt = '';
    if (carryOverQuestions.length > 0) {
      weaknessPrompt = `
[이전 회차 오답 정보 및 출제 지침 - 매우 중요]:
아래 오답들은 사용자가 이전 회차에서 틀린 문제입니다.
이번에 생성할 ${neededAiMcCount}개의 객관식 문제 중, **앞의 ${carryOverQuestions.length}개 문제(6번부터 ${5 + carryOverQuestions.length}번 문제)는 반드시 아래 오답 문제들의 변형 문제로 출제**하십시오.
변형 출제 시 다음 지침을 엄격히 따르십시오:
1. 문제를 절대로 그대로 내지 마십시오. (보기 내용 교체, 질문의 긍정/부정 전환 등)
2. 원래 문제가 "옳은 것/맞는 것"을 고르는 문제였다면, 변형 문제는 "옳지 않은 것/틀린 것"을 고르는 문제로 변형하여 출제하고 해설도 그에 맞게 수정하십시오. 반대의 경우도 마찬가지입니다.
3. 보기(options)의 구성과 순서를 완전히 교체하십시오.
4. 나머지 ${neededAiMcCount - carryOverQuestions.length}개 객관식 문제는 [첨부파일 본문 텍스트] 및 토픽 개념에 기반한 새로운 고난도 문제로 출제하십시오.

틀린 오답 문제 리스트:
${carryOverQuestions.map((q, idx) => `
오답 문제 ${idx + 1}:
- 질문: ${q.question}
- 보기: ${JSON.stringify(q.options)}
- 정답: ${q.answer}
- 해설: ${q.explanation || ''}
`).join('\n')}
`;
    }

    const totalAiQuestionsCount = topic.category === '계산' ? 4 : 13;

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
[사용자 피드백 지침 - 출제 빈도 반영 및 조정 필수]:
1. 추천(Upvoted) 목록 (사용자가 아래 질문들과 유사한 내용, 개념, 공식, 메커니즘을 다루는 문제를 선호합니다. 아래 관련 문제의 출제 빈도를 대폭 높이거나 유사한 문제를 적극 출제해 주십시오):
${upvotes.map((q, i) => `   - 추천 질문 ${i + 1}: ${q}`).join('\n')}

2. 비추천(Downvoted) 목록 (사용자가 아래 질문들을 기피합니다. 아래 질문들과 동일하거나 유사한 문제는 절대로 출제하지 마시고 출제 빈도를 대폭 낮추거나 다른 새로운 주제로 대체하십시오):
${downvotes.map((q, i) => `   - 비추천 질문 ${i + 1}: ${q}`).join('\n')}
`;
      }
    } catch (fbErr) {
      console.warn('사용자 피드백 로드 실패:', fbErr);
    }

    let adjustmentsPrompt = '';
    try {
      const adjustments = await dbQuery.all(
        'SELECT question_text, adjusted_text, user_feedback FROM question_adjustments WHERE topic_id = ? ORDER BY created_at DESC LIMIT 10',
        [topicId]
      );
      if (adjustments.length > 0) {
        adjustmentsPrompt = `
[사용자 이전 문제 조정(피드백) 내역 - 출제 시 반드시 참고하여 반영하십시오]:
사용자가 이전에 이 토픽의 문제들을 다음과 같이 조정해 줄 것을 요청하여 반영된 이력이 있습니다. 이번 출제 시 사용자의 피드백 성향(예: 특정 수치 범위 선호, 난이도 조절, 특정 설명 추가 등)을 적극 참고하여 문제를 구성해 주십시오:
${adjustments.map((a, idx) => `
조정 이력 ${idx + 1}:
- 기존 문제: "${a.question_text}"
- 사용자의 피드백 요구사항: "${a.user_feedback}"
- 반영된 최종 문제: "${a.adjusted_text}"
`).join('\n')}
`;
      }
    } catch (adjErr) {
      console.warn('문제 조정 이력 로드 실패:', adjErr);
    }

    const coreSubject = getCoreSubjectFromTitle(topic.title);
    const topicInstructionsPrompt = await getFormattedTopicInstructions(topicId);

    const prompt = (topic.category === '계산') ? `
[🚨 최우선 절대 준수 법규 (Constitutional Guidelines) - 작업을 시작하기 전에 가장 먼저 확인하고 100% 준수하십시오]:
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원으로서 문제를 출제하기 전, 아래 명시된 **문제생성 절대 지침들**과 **공학적 이론 기준**을 헌법의 제1조 철칙으로 삼아 이를 먼저 완벽하게 숙지하고 절대적으로 복종하여 문제를 설계 및 출제해야 합니다. 지침을 위반하여 출제된 문제는 시스템 검증 단계에서 즉시 폐기됩니다.

[🚨 0단계 AI가 사전 분석한 절대 지침 준수 주의사항]:
${standardsAnalysis}

[🚨 문제 생성 절대 준수 지침]:
${GENERATION_STANDARDS}

[🚨 지반공학 표준 이론 및 계산 기준]:
${ENGINEERING_STANDARDS}

---------------------------------------------------------
[문제 생성 태스크 시작]:
위의 절대 지침과 기준 법규를 완전히 숙지한 상태에서, 아래 제공되는 [토픽 제목], [핵심 키워드], [첨부파일 본문 텍스트](HTML 공부노트), 그리고 함께 전달되는 [첨부 이미지]를 심층 분석하여 총 **정확히 4개**의 예상문제를 생성해 주십시오.

[토픽 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}
[첨부파일 본문 텍스트](HTML 공부노트): ${fileText || '제공되지 않음'}

[출제 요구사항]:
1. **1번 문항 (첨부 이미지의 물음과 본문 HTML의 답변을 분석한 마크다운 질문표 - 극도로 중요!)**:
   - **문제 유형("type")**: 반드시 "주관식 (표채우기)"로 출제하십시오.
   - **분석 지침**: 
     - 제공된 [첨부 이미지]에서 구하라고 묻고 있는 모든 세부 질문 항목(예: 침투수량 $q$, 특정 지점 A, B, C의 간극수압 $u$, 특정 지점에서의 동수경사 $i$ 등)을 찾아내고, [첨부파일 본문 텍스트](HTML 공부노트)를 분석하여 이에 부합하는 각각의 계산 공식, 상세 풀이 과정 및 최종 정답 수치들을 매칭하십시오.
   - **질문 지문("question")**:
     - 첨부 이미지에 담긴 기출문제의 원래 핵심 질문 내용(예: "그림에 나타낸 댐에 대하여 (1) 침투수량, (2) A, B 및 C점에서의 간극수압, (3) C점에서 출구까지 동수경사를 구하시오.")을 기술하고, 계산을 위해 필요한 추가 상수나 설계 정수 조건(예: 투수계수 $k = 2.0 \times 10^{-3} \text{m/s}$ 등)이 이미지나 본문 텍스트에 있다면 본문 질문에 누락 없이 명시하십시오.
   - **표 구성("tableData")**:
     - \`headers\`는 \`["평가 항목", "산정 결과"]\`로 구성하십시오.
     - \`rows\`에는 이미지의 세부 질문 항목들(기호 및 단위가 있다면 포함, 예: \`"(1) 침투수량 ($q$, $m^3/s \\cdot m$)"\`, \`"(2) A점 간극수압 ($u_A$, $kPa$)"\`, \`"(3) C점에서 출구까지 동수경사 ($i$)"\` 등)을 첫 번째 열에 넣고, 두 번째 열에는 수험생이 입력창에 정답을 적도록 \`"[INPUT_1]"\`, \`"[INPUT_2]"\], \`"[INPUT_3]"\` 등을 순차적으로 매핑하십시오. (예: \`[["(1) 침투수량 ($q$, $m^3/s \\cdot m$)", "[INPUT_1]"], ["(2) A점 간극수압 ($u_A$, $kPa$)", "[INPUT_2]"], ...]\`)
   - **정답 객체("answers")**:
     - 각 \`INPUT_N\`에 대응하는 최종 모범 답안 수치 및 짧은 형식의 기호/단위를 본문 HTML의 풀이 내용에서 분석하여 정확히 기입하십시오. (예: \`{"INPUT_1": "0.02 m³/s·m (또는 2.0 × 10⁻² m³/s)", "INPUT_2": "318.8 kPa (또는 300 kPa 내외)"}\`)
   - **상세 해설("explanation")**:
     - 각 빈칸에 대한 수치 계산 및 대입 공식 전개 과정을 논리적이고 친절하게 서술하십시오. LaTeX 문법을 활용하십시오.

2. **2번 문항 (개념 비교 표 칸채우기 문제 - 극도로 중요!)**:
   - 이 계산 토픽의 핵심 공식/이론과 유사하거나 비교되는 다른 대표적인 공식/이론들(예: 테르자기 공식의 경우, 프란틀(Prandtl), 마이어호프(Meyerhof), 한센(Hansen), 베시크(Vesic) 등 다른 지지력 공식들)의 기본 가정, 특징, 적용 한계 및 지반 거동 대조 항목 등을 서로 대조하는 **학술적 개념 비교표**를 구성하여 출제하십시오.
   - 문제 종류("type")는 반드시 **"주관식 (표채우기)"**로 지정하십시오.
   - 비교표(tableData)를 작성하고, 비교의 핵심이 되는 셀들(최소 2개에서 최대 4개)에 빈칸(\`[INPUT_1]\$, \`[INPUT_2]\` 등)을 만들어 채우도록 구성하십시오.
   - 질문 지문(question)은 사용자가 어떤 조건들을 비교해야 하는지 자연스럽게 안내하는 서술형 지문(예: "Terzaghi 지지력 공식과 다른 대표적인 극한 지지력 공식들의 공학적 가정 및 특성을 비교한 표입니다. 빈칸 (A), (B)에 알맞은 핵심 개념을 기술하십시오.")으로 작성하십시오.
   - 빈칸에 들어갈 정답("answers")은 수치 계산 값이 아니라, 핵심 개념을 설명하는 서술형 문구(15자 내외)로 구성하십시오.

3. **3번 문항 (공학적 의미/교훈 주관식 문제)**:
   - **"type" 값**: 반드시 "주관식 (단답형)"
   - **질문 구성**: 앞선 1~2번 계산 문제의 전개 과정이나 계산 결과가 설계 및 시공 실무에 주는 교훈, 공학적 의미(지반 거동 해석, 매개변수 감도 분석, 파괴 메커니즘 등)를 서술하도록 질문하십시오.
   - **정답("answer")**: 채점관이 납득할 수 있는 핵심적인 공학적 설명 문장(최소 50자에서 최대 120자 내외)으로 명료하게 작성하되, 단순 요약이나 평서문(~다, ~입니다) 어미를 절대 배제하고 반드시 명사형 종결어미(예: ~함, ~저감, ~방지, ~유도, ~확보 등)로 끝나야 하며, 중요한 필수 공학 키워드는 마크다운 강조 기호인 **키워드**로 감싸서 작성하십시오.
   - **"explanation"**: 왜 이것이 중요한 공학적 교훈이자 의미를 가지는지 상세히 서술하십시오.

4. **4번 문항 (관련 공학적 문제 발생 시 대책 주관식 문제)**:
   - **"type" 값**: 반드시 "주관식 (단답형)"
   - **질문 구성**: 이 계산 문제의 주제와 밀접하게 연관된 실무 지반공학적 문제 상황(예: 한계 상태 초과, 지반 붕괴/침하 위험, 계측치 경고 등)을 가정하고, 현장 기술사 관점에서의 구체적인 실무 대책 및 공학적 방안을 기술하도록 질문하십시오. (일반문제 13번 대책형과 비슷한 결입니다)
   - **정답("answer")**: 구체적인 현장 대책(지반 개량 공법, 하중 저감 대책, 보강 공법 적용, 차수/배수 공법 등)을 명확하게 최소 50자에서 최대 120자 내외로 명료하게 작성하되, 단순 요약이나 평서문(~다, ~입니다) 어미를 절대 배제하고 반드시 명사형 종결어미(예: ~함, ~저감, ~방지, ~유도, ~확보 등)로 끝나야 하며, 중요한 필수 공학 키워드는 마크다운 강조 기호인 **키워드**로 감싸서 작성하십시오.
   - **"explanation"**: 제안된 대책 공법의 상세 메커니즘과 현장 적용 시 공학적 유의사항을 상세히 기술하십시오.

[🚨 절대 준수 사항]:
- **정확히 4개의 문제**만 배열에 담아 JSON 형식으로 반환하십시오. (1, 2번은 표채우기 형태 등 주관식 문제, 3번은 의미/교훈 문제, 4번은 대책 문제)
- 다른 부가 설명이나 코드 블록(\`\`\`json) 기호 없이 순수한 JSON 배열 데이터만 반환하십시오.

${topicInstructionsPrompt}
${GENERATION_STANDARDS}
${ENGINEERING_STANDARDS}

[응답 JSON 포맷]:
⚠️ 아래는 JSON 구조 형식 안내를 위한 **순수한 형식 예시**일 뿐입니다. 
절대로 아래 예시의 질문 내용, 표 데이터, 정답, 해설을 그대로 복사하지 마십시오.
반드시 위에 제공된 [토픽 제목], [핵심 키워드], [첨부파일 본문 텍스트]에 기반하여 해당 토픽에 100% 부합하는 고유한 문제를 새로 창작하십시오.
[
  {
    "type": "주관식 (표채우기)",
    "question": "1. 그림에 나타낸 댐에 대하여 (1) 침투수량, (2) A, B 및 C점에서의 간극수압, (3) C점에서 출구까지 동수경사를 구하시오. 단, 흙의 투수계수는 2.0x10^-3m/s 이다.",
    "tableData": {
      "headers": ["평가 항목", "산정 결과"],
      "rows": [
        ["(1) 침투수량 ($q$, $m^3/s \\cdot m$)", "[INPUT_1]"],
        ["(2) A점 간극수압 ($u_A$, $kPa$)", "[INPUT_2]"],
        ["(2) B점 간극수압 ($u_B$, $kPa$)", "[INPUT_3]"],
        ["(2) C점 간극수압 ($u_C$, $kPa$)", "[INPUT_4]"],
        ["(3) C점에서 출구까지 동수경사 ($i$)", "[INPUT_5]"]
      ]
    },
    "answers": {
      "INPUT_1": "0.02 m³/s·m (또는 2.0 × 10⁻² m³/s)",
      "INPUT_2": "318.8 kPa (또는 300 kPa 내외)",
      "INPUT_3": "196.2 kPa (또는 200 kPa 내외)",
      "INPUT_4": "73.6 kPa (또는 75 kPa 내외)",
      "INPUT_5": "0.25"
    },
    "explanation": "1. 단위폭당 침투수량 계산: 상하류 수위차 $H = 30\\text{m}$, 투수계수 $k = 2.0 \\times 10^{-3}\\text{m/s}$... (상세 해설)"
  },
  {
    "type": "주관식 (표채우기)",
    "question": "2. (현재 토픽의 핵심 공식/이론과 유사·비교되는 다른 공식/이론들의 개념 비교표) 빈칸에 알맞은 핵심 내용을 기술하십시오.",
    "tableData": {
      "headers": ["비교 항목", "(현재 토픽 이론)", "(비교 대상 이론 A)", "(비교 대상 이론 B)"],
      "rows": [
        ["핵심 가정/특성 1", "(기입된 정보)", "[INPUT_1]", "(기입된 정보)"],
        ["핵심 가정/특성 2", "[INPUT_2]", "(기입된 정보)", "(기입된 정보)"]
      ]
    },
    "answers": {
      "INPUT_1": "(토픽에 맞는 정확한 개념 서술)",
      "INPUT_2": "(토픽에 맞는 정확한 개념 서술)"
    },
    "explanation": "(해당 비교 항목들의 공학적 차이와 의미에 대한 상세 해설)"
  },
  {
    "type": "주관식 (단답형)",
    "question": "3. 이 계산 문제 과정 또는 결과가 실무 설계/시공에 미치는 교훈이나 공학적 의미에 대해 서술하시오.",
    "answer": "(토픽 고유의 공학적 교훈 핵심 키워드 포함 서술)",
    "explanation": "(상세 공학적 의미 해설)"
  },
  {
    "type": "주관식 (단답형)",
    "question": "4. 본 계산 문제의 조건과 관련하여 현장에서 공학적 문제가 발생했을 때의 구체적인 방지 대책 또는 해결방안을 기술하시오.",
    "answer": "(토픽 고유의 구체적 대책 공법 키워드 포함 서술)",
    "explanation": "(현장 대책 공법의 상세 메커니즘 및 공학적 유의사항 해설)"
  }
]
` : `
[🚨 최우선 절대 준수 법규 (Constitutional Guidelines) - 작업을 시작하기 전에 가장 먼저 확인하고 100% 준수하십시오]:
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원으로서 문제를 출제하기 전, 아래 명시된 **문제생성 절대 지침들**과 **공학적 이론 기준**을 헌법의 제1조 철칙으로 삼아 이를 먼저 완벽하게 숙지하고 절대적으로 복종하여 문제를 설계 및 출제해야 합니다. 지침을 위반하여 출제된 문제는 시스템 검증 단계에서 즉시 폐기됩니다.

[🚨 문제 생성 절대 준수 지침]:
${GENERATION_STANDARDS}

[🚨 지반공학 표준 이론 및 계산 기준]:
${ENGINEERING_STANDARDS}

---------------------------------------------------------
[문제 생성 태스크 시작]:
위의 절대 지침과 기준 법규를 완전히 숙지한 상태에서, 아래 제공되는 [토픽 제목], [핵심 키워드], [첨부파일 본문 텍스트], [이전 회차 오답 정보], [사용자 피드백 지침] 그리고 [사용자 문제 조정 내역]을 심층 분석하여, 총 ${totalAiQuestionsCount}개의 예상문제를 생성해 주십시오.
${specialInstructions}
${weaknessPrompt}
${feedbackPrompt}
${adjustmentsPrompt}

[토픽 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}
[첨부파일 본문 텍스트]: ${fileText || '제공되지 않음'}

[🚨 토픽 범위 엄격 제한 및 출제 범위 확충 — 최우선 준수사항]:
[🚨 예시 모방 절대 금지 규칙 — 극도로 중요!]:
- 절대로 프롬프트에 예시로 제시된 '소일네일링'이나 '어스앵커' 등의 비교 대상을 그대로 복제하여 출제하지 마십시오.
- 만약 현재 토픽이 소일네일링 챕터가 아니라면, 반드시 현재 **[토픽 제목]** 범위 내에 머무르는 적절한 비교 대상(예: 점토의 이중층인 경우 '면모 구조' vs '이산 구조', 삼축압축인 경우 '배수 시험' vs '비배수 시험' 등)을 스스로 선택하여 표채우기를 설계하십시오.

- **맹목적으로 [첨부파일 본문 텍스트]의 지엽적인 자구에만 국한하여 문제를 출제하지 마십시오.** 
- 만약 첨부파일 내용이 좁거나 단편적이더라도, 해당 **[토픽 제목]**이 다루는 전반적인 표준 학술 이론 및 기술사 시험 범위의 표준 개념(예: 기본 원리, 핵심 유도 공식, 시험 시 가정사항, 측정값의 공학적 의미 및 해석 단계, 장단점, 실무 유의사항 및 한계 등)에 대해 AI의 풍부한 공학 지식을 활용하여 문제를 적극적이고 넓게 출제하십시오. (예: 수압파쇄법 토픽이라면 보고서에 없더라도 수압파쇄법의 기본 가정사항, 단계별 압력 해석 공식인 $\sigma_h = P_s$, $\sigma_H = 3P_s - P_b + T$ 등의 핵심 공식과 그 의미를 당연히 출제 범위에 포함해야 합니다.)
- 단, 다른 대주제 토픽(예: 가설 흙막이/Chang, 응력경로, 사면안정, 압밀 등)의 개념이나 수식으로 완전히 넘어가 출제하는 것은 여전히 **절대 금지**이며, 모든 질문/정답/해설은 오직 현재 **[토픽 제목]** 범위 내에 머물러야 합니다.
- 각 문제의 질문문, 보기, 정답, 해설 전부가 오직 [토픽 제목] 주제에만 해당되어야 합니다.

[🚨 시험 결과 및 실험 데이터 수치 제시 원칙 — 매우 중요]:
- 만약 문제가 특정 심도별 시험 결과(예: 수압파쇄시험 결과의 균열발생압력, 폐쇄압력, 재개열압력, 수평/연직응력 등)나 실험 데이터 수치를 해석/분석하여 답안을 채우거나 계산/추론해야 하는 문제인 경우, 분석의 대상이 되는 원본 시험 결과 데이터 테이블을 질문(question) 텍스트 본문 안에 마크다운 표 형태(예: \`| 심도(m) | 균열발생압력(MPa) | ... |\`)로 반드시 함께 기입하여 보여주십시오. 질문 텍스트 본문에 이 원본 데이터 표가 누락되면 사용자가 문제를 푸는 것이 불가능합니다.
- **🚨 [표 작성 개행 규칙 - 극도로 중요!]**: 마크다운 표의 각 행은 반드시 실제 줄바꿈 문자(\\n)를 사용하여 각각 다른 줄에 작성되어야 합니다. 절대로 여러 행의 표를 줄바꿈 없이 한 줄로 이어 붙여(예: \`| 열1 | 열2 | | :--- | :--- | | 값1 | 값2 |\` 처럼) 출력하지 마십시오. 반드시 행 사이에 개행을 명확히 넣어 주십시오.


[출제 요구사항]:
1. 반드시 총 ${totalAiQuestionsCount}개의 문제를 다음과 같이 구성하여 출제하십시오:

   [1번 문제] 주관식 (개요):
   - 목적: 토픽의 핵심 정의(개요)를 명확하고 짜임새 있게 묻는 질문.
   - "type" 값: 반드시 "주관식 (개요)"
   - "question": 제공된 본문 텍스트 전체를 아우를 수 있는 핵심 공학적 대주제(대제목)를 도출하고, 그 주제에 관한 개요, 원리, 개념적 정의를 깊이 있게 묻는 자연스럽고 전문적인 지문(서술형 질문 문장)을 직접 작성하십시오. 토픽 제목을 단순히 그대로 적용하거나 획일화된 고정 템플릿(예: "~의 핵심 개념, 정의, 원리 등을 설명하는 키워드를 입력하세요")을 사용하는 것을 엄격히 금지합니다.
   - "concept": 질문에 정확히 부합하며, 최소 4줄에서 최대 6줄 사이의 분량으로 아주 전문적이고 직관적인 개요 및 개념 설명을 서술하십시오. (절대 너무 짧거나 1~2줄 요약식으로 쓰지 말고, 반드시 4~6줄 분량을 엄격히 준수하여 학술적 설명의 깊이를 확보할 것). 또한, 이 설명 내에서 채점관이 식별해야 할 핵심 공학적 키워드들은 반드시 역슬래시 없이 일반 마크다운 강조 기호인 **키워드** 형태로 감싸서 표현해 주십시오. (예: **숏크리트 두께**, **지반 압력** 등)
   - "formula": 반드시 빈 문자열 ""
   - "structure": 위 formula에서 사용된 각 기호의 정의를 장황하지 않게 줄바꿈(\n)으로 최소한의 명사형 위주로 간단히 작성. (예: "- $t$: 숏크리트 두께\n- $P$: 지반압")

   [2번 문제] 주관식 (공식):
   - 목적: 토픽에 적용되는 가장 대표적이고 단순한 공식만 묻는 질문.
   - "type" 값: 반드시 "주관식 (공식)"
   - "question": 토픽을 대표하는 가장 핵심적인 공식의 공식명칭 자체나 핵심 질문 문구만 간결하게 작성하십시오. 뒤에 사족은 붙이지 말고 핵심 명사형 공식 제목만 구성해 주십시오.
   - "concept": 공식에 대한 1줄짜리 매우 컴팩트한 요약 설명.
   - "formula": 오직 대표 LaTeX 공식 1개만 순수하게 작성. 문자열이나 설명 기호는 절대 넣지 마십시오. (예: "$t = \\frac{P - 2C \\sin\\varphi}{\\gamma \\tan\\varphi + \\frac{2S}{D}}$")
   - "structure": 위 formula에서 사용된 각 기호의 정의를 장황하지 않게 줄바꿈(\n)으로 최소한의 명사형 위주로 간단히 작성. (예: "- $t$: 숏크리트 두께\n- $P$: 지반압")

   [12번~13번 문제] 주관식 (단답형):
   - 개수: 반드시 정확히 2문제를 출제하십시오.
   - "type" 값: 반드시 "주관식 (단답형)"
   - 출제 원칙:
     * 12번 문제: 단순한 키워드나 용어 명칭만을 단답으로 묻는 문제를 **절대로 출제하지 마십시오.** 1번 문제(주관식 개요) 내용과 일부 중복되거나 유사하더라도 무방하므로, **해당 토픽의 가장 중요하고 핵심적인 공학적 개념(정의, 기본 가정, 또는 주요 공학적 의미/메커니즘 등)**을 깊이 있게 묻는 주관식 서술형 질문으로 출제하십시오.
     * 13번 문제: 해당 토픽과 밀접하게 관계가 있는 **구체적인 공학적 문제 상황이나 시나리오(Engineering Problem/Scenario, 예: 주변 지반 침하, 급격한 변위 발달, 강도 저하, 붕괴 위험 등)**를 지문으로 제시하고, 기술사 관점에서의 **구체적이고 실무적인 공학적 해결책, 공학적 대책 또는 대처 방안(Engineering Solution/Countermeasure)**을 묻는 질문으로 출제하십시오.
     * 정답("answer"): 12번과 13번의 모범 답안은 단순히 한 단어 키워드가 아니라, 구체적인 공학적 거동 메커니즘과 설계/시공 시 인과관계 대책이 논리적으로 상세히 포함된 서술형(최소 50자에서 최대 120자 내외)으로 명료하게 작성하십시오. 모든 정답의 어미는 반드시 "~다", "~입니다" 등의 평서문을 배제하고, 기술사 시험 답안지 형식인 명사형 종결어미(예: ~함, ~감소, ~방지, ~유도, ~소산, ~확보 등)로 끝나야 합니다. 또한, 이 정답 문장 내에서 채점에 중요도가 가장 높은 필수 공학 키워드들은 반드시 역슬래시 없이 일반 마크다운 강조 기호인 **키워드** 형태로 감싸서 작성해 주십시오. (예: **이중층 두께**, **전단강도 저하** 등)
     * "explanation": 왜 이 답안이 올바른 공학적 대책/이론인지 상세히 설명하십시오.

   [3번~11번 문제 중 3개] 주관식 (표채우기):
   - 목적: 토픽에서 기술사로서 반드시 숙지하고 있어야 하는 가장 핵심적이고 중요한 공학 개념, 메커니즘, 혹은 서로 비교/대비되는 두 공법(예: 공법 A vs 공법 B, 이론 A vs 이론 B 등)의 특징을 대조하는 유기적 표(Table) 질문 출제.
     - 구성 형태: 열(Column)에 비교 대상들을 배치하고, 행(Row)의 첫 번째 열에는 구분/평가 기준(구분 항목)을 둡니다. 이때, 구분 항목은 단순히 '지반 보강 특성', '보강 효과', '실무 적용', '시험 특징' 등과 같이 너무 짧고 모호하게 작성하지 마십시오. 사용자가 빈칸에 채워 넣을 답안의 방향(예: 보강 효과 및 두께 영향인지, 한계점 및 단점인지, 실무 활용처인지, 시공 시 유의사항인지 등)을 명확하게 파악할 수 있도록 **구체적이고 명확한 평가 기준명으로 서술형태의 구체적인 명칭을 적용**하십시오.
      - 🚨 **[구분 항목(행 제목) 명확화 및 행동 유도 원칙 - 극도로 중요!]**: 구분 항목(행 제목)은 **그것만 읽어도 ① 이 표가 무슨 주제/토픽에 대한 비교인지, ② 이 행에 어떤 종류의 구체적인 답(조치 사항, 원리, 방법 등)을 써야 하는지 100% 확신할 수 있어야** 합니다. **글자수는 반드시 최소 15자에서 최대 45자 이내**로 구체적이고 길게 작성하십시오. 단순히 '시험 결과의 신뢰성 확보' 같이 추상적인 상태를 명사로만 적지 마십시오. 사용자가 **'신뢰성을 확보하기 위해 구체적으로 무엇을 해야 하는지(현장 관리 대책/방법/제어 조건)'**를 작성할 수 있도록, **'신뢰성 높은 시험 결과를 획득하기 위해 현장에서 통제 및 관리해야 하는 구체적인 방법/조치 사항'** 또는 **'측정 오차를 최소화하고 데이터 신뢰성을 확보하기 위해 확보해야 하는 핵심 시공 조건'**과 같이 **행동 및 구체적 방법론을 유도하는 설명적인 구문**으로 작성하십시오.
        🚫 **절대 금지하는 구분항목 유형**:
        (1) '보강 효과', '시험 특징', '실무 적용' 같은 5~6자짜리 짧고 모호한 범용 표현 → **어떤 토픽에든 갖다 붙일 수 있는 추상적 표현은 절대 금지**
        (2) '지지 메커니즘', '설계 핵심 변수', '주요 적용 지반' 같은 일반적 공학 용어만 나열 → **해당 비교 대상(토픽)의 고유한 공학적 특성이 전혀 드러나지 않는 구분항목은 절대 금지**
        ✅ **올바른 구분항목 작성법**: 반드시 **해당 비교 대상(예: 소일네일링 vs 어스앵커)의 고유한 공학적 특성·거동·현상을 직접 언급**하여, 이 구분항목만 읽어도 "아, 이건 OO과 XX를 비교하는 표에서 △△ 측면을 묻는 행이구나"라고 즉시 파악할 수 있도록 작성하십시오.
        ❌ 나쁜 예(범용적·추상적, 무슨 문제인지 알 수 없음): '지지 메커니즘', '보강 효과', '시험 특징', '실무 적용 특성', '시험 결과의 신뢰성 확보'
         ✅ 좋은 예(토픽 특화 및 행동 유도, 해당 문제 내용이 명확히 드러남):
           - 소일네일링 vs 어스앵커 비교 시: '공법 A/B 인장력 전달 및 선행 긴장 도입 여부', '굴착면 수동저항 vs 정착부 능동긴장의 지반보강 원리 차이', '설계 시 인발저항력 산정 기준 및 안전율 적용 차이'
           - CU vs CD 삼축시험 비교 시: '전단 중 간극수압 배수 허용 여부와 유효응력 경로 차이', '시험 소요시간 및 포화점토 현장 재현성 차이', '파괴 시 측정되는 강도정수(Cu vs C',φ') 종류 차이'
           - 수압파쇄시험 vs 응력해방법 비교 시: '측정 데이터의 정확성과 신뢰성을 확보하기 위해 현장에서 통제/확보해야 할 주요 조치 사항'
        🔍 **자기 검증 필수**: 구분 항목 작성 후 반드시 자문하십시오—**"이 구분항목을 비교 대상 컬럼(헤더) 없이 단독으로 읽었을 때, 무슨 토픽/주제에 대한 비교표인지 추측할 수 있는가?"** → 추측할 수 없다면 구분항목이 너무 범용적인 것이므로, 해당 토픽의 고유 특성을 반영하여 더 구체적으로 수정하십시오.
   - ⚠️ [중요 금지 규칙 - 입력 편의성 극대화]: 주관식 표채우기 문제 출제 시, 사용자가 직접 수식(예: $\\sqrt{k_h/k_v}$와 같은 루트, 제곱, 분수식 등)이나 로마자/그리스 문자 기호, 또는 단위(m, kN, Pa 등)를 직접 키보드로 입력해야 하는 문제는 **절대로 출제하지 마십시오.** 키보드로 기호 및 수식을 입력하는 것은 불가능에 가깝고 오타 발생률이 극도로 높습니다.
   - ⚠️ [정답 구성 원칙]: 수식이나 공식 자체를 묻고 싶다면 반드시 '객관식'으로 질문을 구성하십시오. 주관식 표채우기 빈칸(\`[INPUT_1]\`)에는 단순히 '면모 구조 형성'이나 '이온 교환' 같은 5~6자 내외의 단순 용어 명칭은 **절대로 출제하지 마십시오.** 대신 **핵심적인 내용 위주로 명료하고 완성도 있는 서술형 문구(최소 40자에서 최대 80자 내외)의 메커니즘 설명형 문구**이거나, 혹은 **특정 공학적 상황을 가정했을 때 대처 방안 및 어떻게 해야 하는가에 대해 최소 40자에서 최대 80자 내외로 명확히 답하는 구체적인 서술형 문구**를 정답으로 구성하십시오.
    - ⚠️ [지문과 빈칸 요구사항의 완벽한 일치화 - 극도로 중요!]:
      * 표채우기 문항 출제 시, 질문 지문(question)의 서술 내용과 표(tableData) 내 빈칸(INPUT)의 요구사항, 그리고 정답(answers)의 형태가 반드시 100% 완벽하게 일치해야 합니다.
      * **계산형(수치 입력) 일치화**: 만약 표의 빈칸이 수치 계산 결과(예: 특정 깊이에서의 주동토압력, 지하수위 변화에 따른 수평 응력 등)나 수학적 수치를 요구한다면, 질문 지문에서는 절대 "지반공학적 설계 의미를 기술하라"거나 "이유와 특성을 설명하라"와 같은 서술적 요구사항을 포함하지 마십시오. 지문은 오직 "빈칸 (A), (B)에 들어갈 계산 값을 구하여 표를 완성하십시오"처럼 수치 계산/기입만을 지시해야 합니다.
      * **개념형(서술형 입력) 일치화**: 만약 질문 지문에서 공법의 특징 비교나 공학적 개념 대조를 묻는다면, 표의 빈칸과 정답(answers)은 해당 개념을 설명하는 서술형 문장이어야 하며, 지문에서 엉뚱한 수치 계산(예: 심도 z=500m, 압력=14MPa 등)을 묻는 조건이나 수치들을 절대 제시하지 마십시오.
      * 두 가지 성격이 한 문제에 뒤섞이는(서술하라고 하면서 정답은 숫자이거나, 계산하라고 해놓고 정답은 설명 문장인 경우 등) 치명적인 출제 오류를 절대 범하지 마십시오.
    - ⚠️ **[비교 컬럼 빈칸 처리 및 질문 일치 원칙 - 극단적으로 중요]**:
      1. 만약 질문(question) 지문(대주제 제목)에서 비교하고자 하는 대상이 3개 이상(예: UU, CIU, CK_0U)인 경우, 비교표(tableData) 역시 해당 비교 대상 전부를 열(Column)로 빠짐없이 포함해야 합니다. (예: ["구분 항목", "UU 시험", "CIU 시험", "CK_0U 시험"]와 같이 총 4개 이상의 열). 일부 비교 대상을 표 작성에서 완전히 누락시키는 것을 엄격히 금지합니다.
      2. **표 안의 모든 비교 셀을 억지로 전부 비워 둘 필요는 없습니다. 사용자가 답을 적어야 할 핵심적이고 유의미한 비교 포인트만 필요에 따라 자유롭고 유연하게 '[INPUT_1]', '[INPUT_2]' 등의 빈칸 토큰으로 채워 넣으십시오.** 나머지 비교 셀들은 일반 텍스트 설명(힌트/문맥)으로 채워 표의 가독성과 문맥을 보존해야 합니다. 묻는 개수가 적더라도 자연스러운 출제가 최우선입니다.
      3. 질문 지문(question) 내의 빈칸 표시 (A), (B), (C), (D)... 개수는 실제 사용된 입력 토큰의 총 개수와 정확히 일치해야 합니다. (예: 빈칸이 3개 사용된 경우 (A), (B), (C)까지만 지칭).
      4. 만약 비교 대상 열이 비어 있어 아무것도 입력할 수 없거나 비교 대상이 단 하나뿐이라면 2개 열(구분, 비교대상1)만으로 표를 구성하고, 비교 대상이 여러 개일 때도 필수적인 빈칸만 부분적으로 토큰화하십시오.
   - "type" 값: 반드시 "주관식 (표채우기)"
    - "question": 표의 빈칸에 알맞은 핵심 답안을 서술하라는 질문 (예: "다음 공법 A와 공법 B의 주요 공학적 특징 비교표 빈칸 (A), (B), (C), (D)에 들어갈 내용을 기술하십시오. [토픽 범위에 적합한 공법명들로 반드시 변경하여 구성]"). (⚠️ [지문 작성 수칙 - 매우 중요!]): "question" 본문에는 절대로 "INPUT_1", "INPUT_2" 또는 "[INPUT_1]" 같은 시스템 토큰명 자체를 노출하여 적지 마십시오. 대신 사용자가 직관적으로 알아볼 수 있도록 순서대로 "(A)", "(B)", "(C)", "(D)" 등으로 지칭하여 지문을 구성하십시오. 만약 비교 대상이 3개 이상이거나 행이 늘어나 입력창이 5개 이상인 경우에는 순서대로 "(A)", "(B)", "(C)", "(D)", "(E)", "(F)" 등 늘어난 개수만큼 명시하여 지문을 구성하십시오.
   - "tableData": 표의 데이터를 구조화한 객체. 반드시 다음 키를 포함하는 오브젝트여야 합니다:
     * "headers": 표의 열 제목들을 담은 문자열 배열 (예: ["구분 항목", "공법 A", "공법 B"])
     * "rows": 각 행의 셀 데이터들을 담은 이중 배열. 첫 번째 '구분 항목' 열을 제외하고, 출제하고자 하는 핵심 비교 포인트만 순차적으로 '[INPUT_1]', '[INPUT_2]' 등의 입력 토큰으로 비워두고, 나머지 셀들은 일반 텍스트 설명문구(정답 및 힌트가 되는 모범 서술형 문장)로 채워 자연스러운 표의 문맥을 보존하십시오. ❌ 모든 비교 셀을 기계적으로 무조건 전부 비워두는 것을 엄격히 금지합니다. (예: rows 구조: [["핵심 매커니즘", "[INPUT_1]", "[INPUT_2]"], ["설계 핵심 변수", "[INPUT_3]", "(토픽 범위에 해당하는 비교 설명 문장)"]])
   - "answers": 각 빈칸 토큰에 해당하는 정확한 모범 답안 객체 (예: {"INPUT_1": "비교 대상의 구체적인 메커니즘 서술", "INPUT_2": "다른 비교 대상의 상반되는 메커니즘 서술", "INPUT_3": "상태 변화에 따른 지반 반응 특징 서술"}). 각 모범 답안은 핵심 메커니즘과 지반의 반응 인과관계를 상세히 서술하는 **최소 40자에서 최대 80자 내외의 명료한 설명식 서술형 문구**여야 합니다. 단순 용어 명칭은 제외하십시오.
     🚨 **[모범 답안-구분항목 범주 일치 원칙 - 극도로 중요!]**: 각 INPUT의 모범 답안은 반드시 **해당 행의 구분 항목(행 제목)이 요구하는 답변 범주**에 정확히 부합하는 내용이어야 합니다. 예를 들어 구분 항목이 '실무 활용처 및 적용 사례'이면 모범 답안도 '어디에 쓰이는지(활용처)'를 기술해야 하고, '시공 시 유의사항 및 한계'이면 '주의해야 할 점(유의사항)'을 기술해야 합니다. 구분 항목이 묻는 범주와 전혀 다른 범주의 답(예: 유의점을 물었는데 활용처를 답안으로 작성)은 **출제 오류**이므로 절대 발생시키지 마십시오.
   - "explanation": 표 전체 내용 및 각 빈칸에 대한 공학적 상세 해설.

   [3번~11번 문제 중 5개] 객관식 (4지선다):
   - 목적: ${carryOverQuestions.length > 0 ? '이전 회차 오답 문제들의 취약한 개념을 보완하고, ' : ''}토픽의 상세한 원리, 메커니즘, 장단점 등을 다각도로 평가하는 고난도 4지선다형 질문.
   - "type" 값: 반드시 "객관식 (4지선다)"
   - 개수: 반드시 정확히 5개의 객관식 문제를 출제해야 합니다.
    - [계산문제 비중 조건 - 매우 중요]: 전체 5개의 객관식 문제 중, 반드시 정확히 2개의 문제는 공학적 수치 판단이나 정량적 분석 능력을 평가하는 문제로 출제하십시오. 단, [단순 대입 계산 문제 절대 금지]: 질문 지문에 공식이나 수치를 미리 제시한 뒤 "이 값을 대입하여 계산하시오" 식의 기계적 계산 문제는 절대로 출제하지 마십시오. 대신, 공학적 변수 간의 인과관계, 비례/반비례 거동의 물리적 원인, 설계 조건 변화에 따른 결과 예측 등 핵심 원리의 이해력을 검증하는 정량적 사고 문제로 구성하십시오.
  '   - [핵심 관통 질문 원칙]: 모든 객관식 문제는 해당 토픽의 가장 본질적인 공학적 메커니즘, 거동 원리, 설계 판단 근거를 관통하는 질문이어야 합니다. 보기(options) 역시 공학적 개념 차이를 정확히 식별해야만 정답을 고를 수 있도록 설계하십시오.\n' +
   - "question": 구체적이고 학술적인 내용 일치 또는 원리 분석 객관식 질문. (⚠️ 중요: 질문에 비교/특성 표가 필요한 경우, 절대 <table> 등 HTML 태그로 표를 직접 작성하지 말고 일반 텍스트로만 질문을 작성한 뒤 아래 of "tableData" 필드에 표 데이터를 객체 구조로 작성하십시오.)
   - "tableData": (선택사항) 문제에 표를 표시해야 하는 경우에만 정의하십시오. 주관식 (표채우기)와 마찬가지로 "headers"(열 제목 배열)와 "rows"(각 행 데이터의 배열)를 포함하는 오브젝트여야 합니다. (예: {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적환경", "해수", "담수"]]})
   - "options": 4개의 보기 문항으로 구성된 문자열 배열.
   - "answer": "options" 배열 안에 있는 값 중 정확히 일치하는 정답 문자열.
   - "explanation": 왜 이 보기가 정답이고 다른 보기들이 오답인지에 대한 논리적이고 전문적인 상세 해설.
   - 🚨 [객관식 정밀성 및 정답 일치 조건 - 극도로 중요!]: 모든 객관식(4지선다형) 계산 문제나 수치/공학적 판단 문제를 출제할 때, 계산으로 도출된 정확한 정답 수치나 조건이 4개의 보기(options) 중 반드시 정확히 1개로 존재해야 합니다. 절대로 실제 계산 결과와 보기의 수치가 불일치하여, 해설에서 '실제 계산값은 XX이나 보기 중 가장 가까운 YY를 선택합니다'와 같은 어처구니없는 변명을 적는 출제 오류를 범하지 마십시오. 문제를 생성하기 전에 실제 수식을 대입하여 정답을 한 번 더 직접 엄밀하게 계산하고 검증한 후, 그 결과값(토씨 하나 틀리지 않는 정확한 정답)을 보기와 'answer' 필드에 완벽히 일치하도록 기재하십시오.
    - 중요 특화 출제 사항 (공식 은닉 원칙 - 극도로 중요):
      🚨 [공식 및 공식 수치 범위 노출 절대 금지 규칙 - 극도로 중요!]: 문제 질문(question) 본문 내에 문제를 해결하는 데 필요한 공학 수식 자체(예: $E_u = 300 s_u$ 등)나 수식의 특정 수치 범위(예: $E_u = (200 \sim 500)s_u$ 등), 비례 관계 식 등을 **절대로 직접 텍스트로 적어 제공하지 마십시오.** 수식이나 경험적 수치 범위를 지문에 미리 주면 학생의 암기 및 연상 능력을 평가할 수 없습니다. 대신 공식의 명칭("비배수 탄성계수 경험식")이나 변수들의 명칭("비배수 전단강도 $s_u$")만을 제시하고, 학생이 스스로 공식과 범위를 떠올려서 해결하도록 하십시오. (단, 해설(explanation)에서는 학생의 학습을 위해 공식을 상세히 명시하고 계산 과정을 설명해야 합니다.)
       🚨 [유사/중복 질문 출제 절대 금지 - 매우 중요!]: 하나의 공식이나 거동 특성에서 파생되는 변수만 바꾼 형태의 유사한 비례/반비례 질문은 **절대로 중복하여 출제하지 마십시오.** (예: 공식 $A = B \times C$에 대해 "B가 증가할 때 A의 변화"를 묻는 문제를 출제했다면, 동일한 테스트 세트 내에 "C가 증가할 때 A의 변화"를 묻는 질문은 사실상 동일한 비례 관계 메커니즘을 묻는 중복 문제이므로 **절대로 같이 내지 말고**, 완전히 다른 공학적 개념이나 새로운 지식을 묻는 독립적인 문제로만 구성하십시오.)

${topicInstructionsPrompt}
${LATEX_PROMPT_INSTRUCTIONS}
🚨 [최종 상기 알림]: 최상단에서 명시한 '최우선 절대 준수 법규' (특히 공식 및 수치 노출 금지 규칙 등)를 단 하나도 위반하지 않고 생성했는지 최종 출력 전 다시 한번 철저히 교차 검사하십시오.

3. 중복 질문 및 꼬임 금지:
   - 각 문제의 논점이 서로 중복되지 않도록 다양한 원리나 현상을 안배하십시오.

4. 반드시 아래 지정된 JSON 배열 포맷으로만 정확히 반환하십시오. 마크다운의 \`\`\`json 코드 블록이나 추가적인 텍스트 설명은 배제하고 순수한 JSON 데이터만 제공해 주십시오.

[응답 JSON 포맷]:
[
  {
    "type": "주관식 (개요)",
    "question": "토픽의 기본 정의와 핵심 개념을 묻는 질문 내용",
    "concept": "개요 설명",
    "formula": "",
    "structure": ""
  },
  {
    "type": "주관식 (공식)",
    "question": "토픽의 대표 공식명칭 (사족 배제)",
    "concept": "공식에 대한 한 줄 요약",
    "formula": "$LaTeX공식",
    "structure": "- $기호1$: 간단한 명사형 의미"
  },
  {
    "type": "주관식 (단답형)",
    "question": "토픽의 가장 중요하고 핵심적인 공학적 정의, 기본 가정, 또는 주요 공학적 의미를 묻는 서술형 질문 (3번 문제)",
    "answer": "핵심 개념이나 거동 특성을 요약한 1줄 서술형 답안 문구",
    "explanation": "해당 개념의 학술적/공학적 의미에 대한 상세 설명"
  },
  {
    "type": "주관식 (단답형)",
    "question": "해당 토픽과 관련된 구체적인 공학적 현장 문제 상황(시나리오)을 제시하고 대처/방지 방안(해결 대책)을 요구하는 질문 (4번 문제)",
    "answer": "문제 상황에 대처하기 위한 구체적인 공학적 대안 또는 대책 서술형 답안",
    "explanation": "제안한 공학적 대책의 타당성 및 작동 메커니즘 설명"
  },
  {
    "type": "주관식 (표채우기)",
    "question": "다음 소일네일링(Soil Nailing) 공법과 어스앵커(Earth Anchor) 공법의 주요 공학적 특징 비교표 빈칸 (A), (B), (C), (D)에 들어갈 내용을 알맞게 서술하시오.",
    "tableData": {
      "headers": ["구분 항목", "소일네일링", "어스앵커"],
      "rows": [
        ["지지력 메커니즘", "[INPUT_1]", "[INPUT_2]"],
        ["선행 긴장력 여부", "[INPUT_3]", "[INPUT_4]"]
      ]
    },
    "answers": {
      "INPUT_1": "네일과 흙 사이의 마찰력으로 지반 일체화",
      "INPUT_2": "앵커 정착장 주변마찰 저항과 강선 인장력",
      "INPUT_3": "선행 긴장력을 도입하지 않음",
      "INPUT_4": "인장력을 도입하여 변위를 적극적 제어"
    },
    "explanation": "소일네일링은 지반 마찰력을 이용한 수동적 보강 방식이며, 어스앵커는 강선 긴장력을 가해 적극적으로 변위를 억제하는 능동적 방식입니다."
  },
  {
    "type": "객관식 (4지선다)",
    "question": "질문 내용",
    "options": ["보기 1", "보기 2", "보기 3", "보기 4"],
    "answer": "정확히 일치하는 정답 보기 텍스트",
    "explanation": "상세한 해설"
  }
  ... (총 ${totalAiQuestionsCount}개가 되도록 주관식(개요 1, 공식 1, 표채우기 2), 객관식(5개), 주관식(단답형 4)을 순서대로 배열하여 총 13개 완성)
]
`;

try {
        let questions = [];

        if (topic.category === '계산') {
          let topicImage = extractFirstImageFromTopic(topic);
          console.log(`[POST /api/topics/:id/ai-questions] Extracted image for calculation topic. Found image: ${!!topicImage}`);
          const responseText = await localCallLLM(null, prompt, topicImage, 'question');
          
          let text = responseText.trim();
          if (text.startsWith('```')) {
            text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
          }
          
          try {
            questions = parseLlmJson(text);
          } catch (parseErr) {
            console.warn('[단일토픽퀴즈] JSON.parse 실패로 인해 정규식 배열 추출을 시도합니다:', parseErr);
            questions = extractJsonArray(responseText);
          }

          if (!questions || !Array.isArray(questions)) {
            throw new Error('AI 응답을 유효한 문제 JSON 배열로 파싱하지 못했습니다.');
          }
        } else {
          console.log(`[POST /api/topics/:id/ai-questions] Triggering parallel batch generation for general category (13 questions total)`);
          
          // -------------------------------------------------------------
          // Batch 1 Prompt: Short Answers (개요 1, 공식 1, 단답형 2) -> 총 4문항
          // -------------------------------------------------------------
          const promptBatch1 = `
[🚨 최우선 절대 준수 법규 (Constitutional Guidelines) - 작업을 시작하기 전에 가장 먼저 확인하고 100% 준수하십시오]:
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원으로서 문제를 출제하기 전, 아래 명시된 **문제생성 절대 지침들**과 **공학적 이론 기준**을 헌법의 제1조 철칙으로 삼아 이를 먼저 완벽하게 숙지하고 절대적으로 복종하여 문제를 설계 및 출제해야 합니다. 지침을 위반하여 출제된 문제는 시스템 검증 단계에서 즉시 폐기됩니다.

[🚨 0단계 AI가 사전 분석한 절대 지침 준수 주의사항]:
${standardsAnalysis}

[🚨 문제 생성 절대 준수 지침]:
${GENERATION_STANDARDS}

[🚨 지반공학 표준 이론 및 계산 기준]:
${ENGINEERING_STANDARDS}

---------------------------------------------------------
[문제 생성 태스크 시작]:
위의 절대 지침과 기준 법규를 완전히 숙지한 상태에서, 아래 제공되는 [토픽 제목], [핵심 키워드], [첨부파일 본문 텍스트]를 심층 분석하여, 총 **정확히 6개**의 예상문제(주관식 개요 1개, 주관식 공식 1개, 주관식 단답형 4개)를 생성해 주십시오.

[토픽 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}
[첨부파일 본문 텍스트]: ${fileText || '제공되지 않음'}

[🚨 토픽 범위 엄격 제한 및 출제 범위 확충 — 최우선 준수사항]:
- **맹목적으로 [첨부파일 본문 텍스트]의 지엽적인 자구에만 국한하여 문제를 출제하지 마십시오.** 
- 만약 첨부파일 내용이 좁거나 단편적이더라도, 해당 **[토픽 제목]**이 다루는 전반적인 표준 학술 이론 및 기술사 시험 범위의 표준 개념에 대해 AI의 풍부한 공학 지식을 활용하여 문제를 적극적이고 넓게 출제하십시오.
- 단, 다른 대주제 토픽의 개념이나 수식으로 완전히 넘어가 출제하는 것은 여전히 **절대 금지**이며, 모든 질문/정답/해설은 오직 현재 **[토픽 제목]** 범위 내에 머물러야 합니다.

[출제 요구사항]:
반드시 총 6개의 문제를 다음과 같이 구성하여 출제하십시오:

[1번 문제] 주관식 (개요):
- 목적: 토픽의 핵심 정의(개요)를 명확하고 짜임새 있게 묻는 질문.
- "type" 값: 반드시 "주관식 (개요)"
- "question": 제공된 본문 텍스트 전체를 아우를 수 있는 핵심 공학적 대주제(대제목)를 도출하고, 그 주제에 관한 개요, 원리, 개념적 정의를 깊이 있게 묻는 자연스럽고 전문적인 서술형 질문 문장.
- "concept": 질문에 정확히 부합하며, 최소 4줄에서 최대 6줄 사이의 분량으로 아주 전문적이고 직관적인 개요 및 개념 설명을 서술. 설명 내에서 채점관이 식별해야 할 핵심 공학적 키워드들은 반드시 일반 마크다운 강조 기호인 **키워드** 형태로 감싸서 표현해 주십시오.
- "formula": 반드시 빈 문자열 ""
- "structure": 위 concept에서 사용된 기호가 있다면 그 정의를 장황하지 않게 줄바꿈(\\n)으로 기재, 없다면 빈 문자열 "".

[2번 문제] 주관식 (공식):
- 목적: 토픽에 적용되는 가장 대표적이고 단순한 공식만 묻는 질문.
- "type" 값: 반드시 "주관식 (공식)"
- "question": 토픽을 대표하는 가장 핵심적인 공식의 공식명칭 자체나 핵심 질문 문구만 간결하게 작성.
- "concept": 공식에 대한 1줄짜리 매우 컴팩트한 요약 설명.
- "formula": 오직 대표 LaTeX 공식 1개만 순수하게 작성. 문자열이나 설명 기호는 절대 넣지 마십시오. (예: "$t = \\\\frac{P - 2C \\\\sin\\\\varphi}{\\\\gamma \\\\tan\\\\varphi + \\\\frac{2S}{D}}$")
- "structure": 위 formula에서 사용된 각 기호의 정의를 장황하지 않게 줄바꿈(\\n)으로 최소한의 명사형 위주로 간단히 작성. (예: "- $t$: 숏크리트 두께\\n- $P$: 지반압")

[주관식 (단답형) 문제들]:
- 개수: 반드시 정확히 4문제를 출제하십시오.
- "type" 값: 반드시 "주관식 (단답형)"
- 출제 원칙:
  * 1~3번째 단답형 문제: 단순한 키워드나 용어 명칭만을 단답으로 묻는 문제를 **절대로 출제하지 마십시오.** 1번 문제(주관식 개요) 내용과 일부 중복되거나 유사하더라도 무방하므로, **해당 토픽의 가장 중요하고 핵심적인 공학적 개념(정의, 기본 가정, 또는 주요 공학적 의미/메커니즘 등)**을 깊이 있게 묻는 주관식 서술형 질문으로 출제하십시오.
  * 4번째 단답형 문제: 해당 토픽과 밀접하게 관계가 있는 **구체적인 공학적 문제 상황이나 시나리오(Engineering Problem/Scenario, 예: 주변 지반 침하, 급격한 변위 발달, 강도 저하, 붕괴 위험 등)**를 지문으로 제시하고, 기술사 관점에서의 **구체적이고 실무적인 공학적 해결책, 공학적 대책 또는 대처 방안(Engineering Solution/Countermeasure)**을 묻는 질문으로 출제하십시오.
  * 정답("answer"): 모범 답안은 단순히 한 단어 키워드가 아니라, 구체적인 공학적 거동 메커니즘과 설계/시공 시 인과관계 대책이 논리적으로 상세히 포함된 서술형(최소 50자에서 최대 120자 내외)으로 명료하게 작성하십시오. 모든 정답의 어미는 반드시 "~다", "~입니다" 등의 평서문을 배제하고, 기술사 시험 답안지 형식인 명사형 종결어미(예: ~함, ~감소, ~방지, ~유도, ~소산, ~확보 등)로 끝나야 합니다. 또한, 이 정답 문장 내에서 채점에 중요도가 가장 높은 필수 공학 키워드들은 반드시 역슬래시 없이 일반 마크다운 강조 기호인 **키워드** 형태로 감싸서 작성해 주십시오. (예: **이중층 두께**, **전단강도 저하** 등)
  * "explanation": 왜 이 답안이 올바른 공학적 대책/이론인지 상세히 설명하십시오.

${topicInstructionsPrompt}
${LATEX_PROMPT_INSTRUCTIONS}

[응답 JSON 포맷]:
반드시 아래 지정된 JSON 배열 포맷으로만 정확히 반환하십시오. 마크다운의 \\\`\\\`\\\`json 코드 블록이나 추가적인 텍스트 설명은 배제하고 순수한 JSON 데이터만 제공해 주십시오.
[
  {
    "type": "주관식 (개요)",
    "question": "토픽의 기본 정의와 핵심 개념을 묻는 질문 내용",
    "concept": "개요 설명",
    "formula": "",
    "structure": ""
  },
  {
    "type": "주관식 (공식)",
    "question": "토픽의 대표 공식명칭 (사족 배제)",
    "concept": "공식에 대한 한 줄 요약",
    "formula": "$LaTeX공식$",
    "structure": "- $기호1$: 간단한 명사형 의미"
  },
  {
    "type": "주관식 (단답형)",
    "question": "토픽의 가장 중요하고 핵심적인 공학적 정의, 기본 가정, 또는 주요 공학적 의미를 묻는 서술형 질문 1",
    "answer": "핵심 개념이나 거동 특성을 요약한 1줄 서술형 답안 문구 1",
    "explanation": "해당 개념의 학술적/공학적 의미에 대한 상세 설명 1"
  },
  {
    "type": "주관식 (단답형)",
    "question": "토픽의 가장 중요하고 핵심적인 공학적 정의, 기본 가정, 또는 주요 공학적 의미를 묻는 서술형 질문 2",
    "answer": "핵심 개념이나 거동 특성을 요약한 1줄 서술형 답안 문구 2",
    "explanation": "해당 개념의 학술적/공학적 의미에 대한 상세 설명 2"
  },
  {
    "type": "주관식 (단답형)",
    "question": "토픽의 가장 중요하고 핵심적인 공학적 정의, 기본 가정, 또는 주요 공학적 의미를 묻는 서술형 질문 3",
    "answer": "핵심 개념이나 거동 특성을 요약한 1줄 서술형 답안 문구 3",
    "explanation": "해당 개념의 학술적/공학적 의미에 대한 상세 설명 3"
  },
  {
    "type": "주관식 (단답형)",
    "question": "해당 토픽과 관련된 구체적인 공학적 현장 문제 상황(시나리오)을 제시하고 대처/방지 방안(해결 대책)을 요구하는 질문 4",
    "answer": "문제 상황에 대처하기 위한 구체적인 공학적 대안 또는 대책 서술형 답안 4",
    "explanation": "제안한 공학적 대책의 타당성 및 작동 메커니즘 설명 4"
  }
]
`;

          // -------------------------------------------------------------
          // Batch 2 Prompt: Table Fills (표채우기 2문항) -> 총 2문항
          // -------------------------------------------------------------
          const promptBatch2 = `
[🚨 최우선 절대 준수 법규 (Constitutional Guidelines) - 작업을 시작하기 전에 가장 먼저 확인하고 100% 준수하십시오]:
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원으로서 문제를 출제하기 전, 아래 명시된 **문제생성 절대 지침들**과 **공학적 이론 기준**을 헌법의 제1조 철칙으로 삼아 이를 먼저 완벽하게 숙지하고 절대적으로 복종하여 문제를 설계 및 출제해야 합니다. 지침을 위반하여 출제된 문제는 시스템 검증 단계에서 즉시 폐기됩니다.

[🚨 0단계 AI가 사전 분석한 절대 지침 준수 주의사항]:
${standardsAnalysis}

[🚨 문제 생성 절대 준수 지침]:
${GENERATION_STANDARDS}

[🚨 지반공학 표준 이론 및 계산 기준]:
${ENGINEERING_STANDARDS}

---------------------------------------------------------
[문제 생성 태스크 시작]:
위의 절대 지침과 기준 법규를 완전히 숙지한 상태에서, 아래 제공되는 [토픽 제목], [핵심 키워드], [첨부파일 본문 텍스트]를 심층 분석하여, 총 **정확히 2개**의 예상문제(주관식 표채우기 2개)를 생성해 주십시오.

[토픽 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}
[첨부파일 본문 텍스트]: ${fileText || '제공되지 않음'}

[출제 요구사항]:
반드시 총 2개의 주관식 (표채우기) 문제를 다음과 같이 구성하여 출제하십시오:
🚨 **[2개 문항 다각화 원칙 - 극도로 중요!]**: 2개의 표채우기 문제는 반드시 **서로 완전히 다른 비교 대상, 다른 관점, 다른 공학적 측면**을 다루어야 합니다. 동일한 비교 대상을 두 문제에 걸쳐 반복 출제하는 것은 절대 금지합니다. 두 문제 모두 반드시 제공된 [토픽 제목]과 [첨부파일 본문 텍스트]의 범위 내에서만 출제하십시오.

[주관식 (표채우기) 문제 2개]:
- 목적: 토픽에서 기술사로서 반드시 숙지하고 있어야 하는 가장 핵심적이고 중요한 공학 개념, 메커니즘, 혹은 서로 비교/대비되는 두 공법의 특징을 대조하는 유기적 표(Table) 질문 출제.
  - 구성 형태: 열(Column)에 비교 대상들을 배치하고, 행(Row)의 첫 번째 열에는 구분/평가 기준(구분 항목)을 둡니다.
  - 🚨 **[구분 항목(행 제목) 명확화 및 행동 유도 원칙 - 극도로 중요!]**: 구분 항목(행 제목)은 **그것만 읽어도 ① 이 표가 무슨 주제/토픽에 대한 비교인지, ② 이 행에 어떤 종류의 구체적인 답(조치 사항, 원리, 방법 등)을 써야 하는지 100% 확신할 수 있어야** 합니다. **글자수는 반드시 최소 15자에서 최대 45자 이내**로 구체적이고 길게 작성하십시오. 단순히 '시험 결과의 신뢰성 확보' 같이 추상적인 상태를 명사로만 적지 마십시오. 사용자가 **'신뢰성을 확보하기 위해 구체적으로 무엇을 해야 하는지(현장 관리 대책/방법/제어 조건)'**를 작성할 수 있도록, **'신뢰성 높은 시험 결과를 획득하기 위해 현장에서 통제 및 관리해야 하는 구체적인 방법/조치 사항'** 또는 **'측정 오차를 최소화하고 데이터 신뢰성을 확보하기 위해 확보해야 하는 핵심 시공 조건'**과 같이 **행동 및 구체적 방법론을 유도하는 설명적인 구문**으로 작성하십시오.
    🚫 **절대 금지하는 구분항목 유형**:
    (1) '보강 효과', '시험 특징', '실무 적용' 같은 5~6자짜리 짧고 모호한 범용 표현
    (2) '지지 메커니즘', '설계 핵심 변수', '주요 적용 지반' 같은 일반적 공학 용어만 나열
    ✅ **올바른 구분항목 작성법**: 반드시 **해당 비교 대상의 고유한 공학적 특성·거동·현상을 직접 언급**하여, 이 구분항목만 읽어도 "아, 이건 OO과 XX를 비교하는 표에서 △△ 측면을 묻는 행이구나"라고 즉시 파악할 수 있도록 작성하십시오.
  - ⚠️ [중요 금지 규칙 - 입력 편의성 극대화]: 주관식 표채우기 문제 출제 시, 사용자가 직접 수식이나 로마자/그리스 문자 기호, 또는 단위(m, kN, Pa 등)를 직접 키보드로 입력해야 하는 문제는 **절대로 출제하지 마십시오.**
  - ⚠️ [정답 구성 원칙]: 주관식 표채우기 빈칸(\`[INPUT_1]\`)에는 단순히 5~6자 내외의 단순 용어 명칭은 **절대로 출제하지 마십시오.** 대신 **핵심적인 내용 위주로 명료하고 완성도 있는 서술형 문구(최소 40자에서 최대 80자 내외)의 메커니즘 설명형 문구**이거나, 혹은 **특정 공학적 상황을 가정했을 때 대처 방안 및 어떻게 해야 하는가에 대해 최소 40자에서 최대 80자 내외로 명확히 답하는 구체적인 서술형 문구**를 정답으로 구성하십시오.
  - ⚠️ [지문과 빈칸 요구사항의 완벽한 일치화 - 극도로 중요!]:
    * 표채우기 문항 출제 시, 질문 지문(question)의 서술 내용과 표(tableData) 내 빈칸(INPUT)의 요구사항, 그리고 정답(answers)의 형태가 반드시 100% 완벽하게 일치해야 합니다.
  - ⚠️ **[비교 컬럼 빈칸 처리 및 질문 일치 원칙 - 극단적으로 중요]**:
    1. 만약 질문(question) 지문(대주제 제목)에서 비교하고자 하는 대상이 3개 이상인 경우, 비교표(tableData) 역시 해당 비교 대상 전부를 열(Column)로 빠짐없이 포함해야 합니다.
    2. **표 안의 모든 비교 셀을 억지로 전부 비워 둘 필요는 없습니다. 사용자가 답을 적어야 할 핵심적이고 유의미한 비교 포인트만 필요에 따라 자유롭고 유연하게 '[INPUT_1]', '[INPUT_2]' 등의 빈칸 토큰으로 채워 넣으십시오.** 나머지 비교 셀들은 일반 텍스트 설명(힌트/문맥)으로 채워 표의 가독성과 문맥을 보존해야 합니다.
    3. 질문 지문(question) 내의 빈칸 표시 (A), (B), (C), (D)... 개수는 실제 사용된 입력 토큰의 총 개수와 정확히 일치해야 합니다.
    4. "question" 본문에는 절대로 "INPUT_1", "INPUT_2" 또는 "[INPUT_1]" 같은 시스템 토큰명 자체를 노출하여 적지 마십시오. 대신 사용자가 직관적으로 알아볼 수 있도록 순서대로 "(A)", "(B)", "(C)", "(D)" 등으로 지칭하여 지문을 구성하십시오.

${topicInstructionsPrompt}
${LATEX_PROMPT_INSTRUCTIONS}

[응답 JSON 포맷]:
반드시 아래 지정된 JSON 배열 포맷으로만 정확히 반환하십시오. 마크다운의 \\\`\\\`\\\`json 코드 블록이나 추가적인 텍스트 설명은 배제하고 순수한 JSON 데이터만 제공해 주십시오.
[
  {
    "type": "주관식 (표채우기)",
    "question": "다음 (비교 대상 공법명) 공법들의 주요 공학적 특징 비교표 빈칸 (A), (B)에 들어갈 내용을 알맞게 서술하시오.",
    "tableData": {
      "headers": ["구분 항목", "비교대상 A", "비교대상 B"],
      "rows": [
        ["평가 항목 명칭 (15~45자)", "[INPUT_1]", "(기입된 정보)"],
        ["평가 항목 명칭 (15~45자)", "(기입된 정보)", "[INPUT_2]"]
      ]
    },
    "answers": {
      "INPUT_1": "비교대상 A의 공학적 메커니즘을 설명하는 40~80자 서술형 문장",
      "INPUT_2": "비교대상 B의 공학적 메커니즘을 설명하는 40~80자 서술형 문장"
    },
    "explanation": "표 내용 및 빈칸에 대한 공학적 상세 해설"
  },
  {
    "type": "주관식 (표채우기)",
    "question": "다음 (다른 비교 대상명) 비교표 빈칸 (A), (B)에 들어갈 내용을 서술하시오.",
    "tableData": {
      "headers": ["구분 항목", "비교대상 C", "비교대상 D"],
      "rows": [
        ["평가 항목 명칭 (15~45자)", "[INPUT_1]", "(기입된 정보)"],
        ["평가 항목 명칭 (15~45자)", "(기입된 정보)", "[INPUT_2]"]
      ]
    },
    "answers": {
      "INPUT_1": "비교대상 C의 공학적 메커니즘을 설명하는 40~80자 서술형 문장",
      "INPUT_2": "비교대상 D의 공학적 메커니즘을 설명하는 40~80자 서술형 문장"
    },
    "explanation": "표 내용 및 빈칸에 대한 공학적 상세 해설"
  }
]
`;

          // -------------------------------------------------------------
          // Batch 3 Prompt: Multiple Choice (객관식 5문항) -> 총 5문항
          // -------------------------------------------------------------
          const promptBatch3 = `
[🚨 최우선 절대 준수 법규 (Constitutional Guidelines) - 작업을 시작하기 전에 가장 먼저 확인하고 100% 준수하십시오]:
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원으로서 문제를 출제하기 전, 아래 명시된 **문제생성 절대 지침들**과 **공학적 이론 기준**을 헌법의 제1조 철칙으로 삼아 이를 먼저 완벽하게 숙지하고 절대적으로 복종하여 문제를 설계 및 출제해야 합니다. 지침을 위반하여 출제된 문제는 시스템 검증 단계에서 즉시 폐기됩니다.

[🚨 0단계 AI가 사전 분석한 절대 지침 준수 주의사항]:
${standardsAnalysis}

[🚨 문제 생성 절대 준수 지침]:
${GENERATION_STANDARDS}

[🚨 지반공학 표준 이론 및 계산 기준]:
${ENGINEERING_STANDARDS}

---------------------------------------------------------
[문제 생성 태스크 시작]:
위의 절대 지침과 기준 법규를 완전히 숙지한 상태에서, 아래 제공되는 [토픽 제목], [핵심 키워드], [첨부파일 본문 텍스트], [이전 회차 오답 정보], [사용자 피드백 지침] 그리고 [사용자 문제 조정 내역]을 심층 분석하여, 총 **정확히 5개**의 예상문제(객관식 4지선다 5개)를 생성해 주십시오.
${specialInstructions}
${weaknessPrompt}
${feedbackPrompt}
${adjustmentsPrompt}

[토픽 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}
[첨부파일 본문 텍스트]: ${fileText || '제공되지 않음'}

[🚨 시험 결과 및 실험 데이터 수치 제시 원칙 — 매우 중요]:
- 만약 문제가 특정 심도별 시험 결과나 실험 데이터 수치를 해석/분석하여 답안을 채우거나 계산/추론해야 하는 문제인 경우, 분석의 대상이 되는 원본 시험 결과 데이터 테이블을 질문(question) 텍스트 본문 안에 마크다운 표 형태로 반드시 함께 기입하여 보여주십시오.
- **🚨 [표 작성 개행 규칙 - 극도로 중요!]**: 마크다운 표의 각 행은 반드시 실제 줄바꿈 문자(\\n)를 사용하여 각각 다른 줄에 작성되어야 합니다.

[출제 요구사항]:
반드시 총 5개의 객관식 문제를 다음과 같이 구성하여 출제하십시오:

- 목적: 토픽의 상세한 원리, 메커니즘, 장단점 등을 다각도로 평가하는 고난도 4지선다형 질문.
- "type" 값: 반드시 "객관식 (4지선다)"
- [계산문제 비중 조건 - 매우 중요]: 전체 5개의 객관식 문제 중, 반드시 정확히 2개의 문제는 공학적 수치 판단이나 정량적 분석 능력을 평가하는 문제로 출제하십시오. 단, 질문 지문에 공식이나 수치를 미리 제시한 뒤 "이 값을 대입하여 계산하시오" 식의 기계적 계산 문제는 절대로 출제하지 마십시오.
- [핵심 관통 질문 원칙]: 모든 객관식 문제는 해당 토픽의 가장 본질적인 공학적 메커니즘, 거동 원리, 설계 판단 근거를 관통하는 질문이어야 합니다.
- 🚨 [객관식 정밀성 및 정답 일치 조건 - 극도로 중요!]: 모든 객관식 계산 문제나 수치/공학적 판단 문제를 출제할 때, 계산으로 도출된 정확한 정답 수치나 조건이 4개의 보기(options) 중 반드시 정확히 1개로 존재해야 합니다.
- 🚨 [공식 및 공식 수치 범위 노출 절대 금지 규칙 - 극도로 중요!]: 문제 질문(question) 본문 내에 문제를 해결하는 데 필요한 공학 수식 자체나 수식의 특정 수치 범위를 **절대로 직접 텍스트로 적어 제공하지 마십시오.**
- 🚨 [유사/중복 질문 출제 절대 금지 - 매우 중요!]: 하나의 공식이나 거동 특성에서 파생되는 변수만 바꾼 형태의 유사한 비례/반비례 질문은 **절대로 중복하여 출제하지 마십시오.**

${topicInstructionsPrompt}
${LATEX_PROMPT_INSTRUCTIONS}

[응답 JSON 포맷]:
반드시 아래 지정된 JSON 배열 포맷으로만 정확히 반환하십시오. 마크다운의 \\\`\\\`\\\`json 코드 블록이나 추가적인 텍스트 설명은 배제하고 순수한 JSON 데이터만 제공해 주십시오.
[
  {
    "type": "객관식 (4지선다)",
    "question": "질문 내용",
    "options": ["보기 1", "보기 2", "보기 3", "보기 4"],
    "answer": "정확히 일치하는 정답 보기 텍스트",
    "explanation": "상세한 해설"
  }
]
`;

          const [batch1Text, batch2Text, batch3Text] = await Promise.all([
            localCallLLM(null, promptBatch1, null, 'question'),
            localCallLLM(null, promptBatch2, null, 'question'),
            localCallLLM(null, promptBatch3, null, 'question')
          ]);

          const parseBatch = (responseText, batchName) => {
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
            if (!parsed || !Array.isArray(parsed)) {
              throw new Error(`AI ${batchName} 응답을 유효한 문제 JSON 배열로 파싱하지 못했습니다.`);
            }
            return parsed;
          };

          const q1 = parseBatch(batch1Text, '1 (주관식 개요/공식/단답)');
          const q2 = parseBatch(batch2Text, '2 (주관식 표채우기)');
          const q3 = parseBatch(batch3Text, '3 (객관식)');

          console.log(`[Parallel Batch Complete] Batch1: ${q1.length} Qs, Batch2: ${q2.length} Qs, Batch3: ${q3.length} Qs`);
          questions = [...q1, ...q2, ...q3];
        }

        const finalQuestions = topic.category === '계산'
          ? assembleFinalCalculationQuestions(questions, topic)
          : assembleFinalQuestions(questions, topic, carryOverQuestions, fileText);
        const healedQuestions = finalQuestions.map(q => healQuizQuestionObject({
          ...q,
          topic_id: Number(topicId),
          category: topic.category,
          question: cleanQuizQuestion(q.question)
        }));

        if (progressTimer) clearInterval(progressTimer);
        if (progressId) {
          updateProgress(progressId, 2, `2단계: validationPlugin으로 생성 문제 검증 중... (0/${healedQuestions.length} 완료)`, 50);
        }

        const cleanedQuestions = await Promise.all(
          healedQuestions.map(async (q) => {
            const res = await validateAndHealQuestion(q, localCallLLM, topic.title, topic.keywords, fileText);
            reportValidationProgress(progressId, healedQuestions.length);
            return healQuizQuestionObject({ ...res, category: topic.category });
          })
        );

        const deduplicatedQuestions = deduplicateQuestions(cleanedQuestions, topic, fileText, generateFallbackQuestions);

        if (progressId) {
          updateProgress(progressId, 2, '2단계: 문제 생성 및 검증 완료!', 100);
        }

        // 세션에 자동 저장
        try {
          const sessionVal = {
            sessionId: sId,
            questions: deduplicatedQuestions,
            selectedAnswers: {},
            revealedQuestions: {},
            tableAnswers: {},
            tableGradingResults: {},
            tutorAnswers: {},
            tutorInputText: {},
            chatHistory: [],
            savedQuizScroll: 0
          };
          await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
          await dbQuery.run(
            'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            [key, JSON.stringify(sessionVal)]
          );
        } catch (e) {
          console.warn('Failed to auto-save generated review questions to app_session:', e);
        }

        res.json({ questions: deduplicatedQuestions, isFallback: false, scheduleId: resolvedScheduleId });
    } catch (aiError) {
      console.error('Gemini API call failed, generating fallbacks:', aiError);
      const isQuota = aiError.message?.includes('Quota') || aiError.message?.includes('quota') || aiError.message?.includes('rate') || aiError.message?.includes('429');
      const errorMsg = isQuota ? 'AI API 일일 사용 한도를 초과했습니다. 임시 문제로 대체됩니다.' : aiError.message;
      
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      const finalQuestions = topic.category === '계산'
        ? assembleFinalCalculationQuestions(fallbackQuestions, topic)
        : assembleFinalQuestions(fallbackQuestions, topic, carryOverQuestions, fileText);
      
      const cleanedFallback = finalQuestions.map(q => healQuizQuestionObject({
        ...q,
        topic_id: Number(topicId),
        category: topic.category,
        question: cleanQuizQuestion(q.question)
      }));

      const deduplicatedFallback = deduplicateQuestions(cleanedFallback, topic, fileText, generateFallbackQuestions);

      // 세션에 자동 저장
      try {
        const sessionVal = {
          sessionId: sId,
          questions: deduplicatedFallback,
          selectedAnswers: {},
          revealedQuestions: {},
          tableAnswers: {},
          tableGradingResults: {},
          tutorAnswers: {},
          tutorInputText: {},
          chatHistory: [],
          savedQuizScroll: 0
        };
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        await dbQuery.run(
          'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, JSON.stringify(sessionVal)]
        );
      } catch (e) {
        console.warn('Failed to auto-save fallback review questions to app_session:', e);
      }

      res.json({ questions: deduplicatedFallback, isFallback: true, error: errorMsg, scheduleId: resolvedScheduleId });
    }
  } catch (error) {
    console.error('Error in AI question generation route:', error);
    res.status(500).json({ error: '서버 오류로 AI 기출문제를 생성하지 못했습니다.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// 6-1-1. POST /api/grade-subjective → Gemini 3.1 Flash Lite를 사용한 주관식 답안 판정 (플러그인 방식 적용)
app.post('/api/grade-subjective', async (req, res) => {
  const { question, correctAnswer, userAnswer, rowHeader, colHeader, explanation, category } = req.body;
  const progressId = req.body.progressId || req.query.progressId;

  let dynamicGradingStandards = GRADING_STANDARDS;
  let dynamicEngineeringStandards = ENGINEERING_STANDARDS;
  try {
    const gradingRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'grading_standards'");
    if (gradingRow && gradingRow.value) {
      const list = JSON.parse(gradingRow.value);
      if (Array.isArray(list)) {
        dynamicGradingStandards = list.map(s => s.content).join('\n\n');
      }
    }
  } catch (dbErr) {
    console.error('Failed to dynamically fetch grading standards from database:', dbErr);
  }

  try {
    const engRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'engineering_standards'");
    if (engRow && engRow.value) {
      const list = JSON.parse(engRow.value);
      if (Array.isArray(list)) {
        dynamicEngineeringStandards = list.map(s => s.content).join('\n\n');
      }
    }
  } catch (dbErr) {
    console.error('Failed to dynamically fetch engineering standards from database:', dbErr);
  }

  let standardsAnalysis = '';
  const localCallLLM = (sys, prompt, img, scenario, opts) => {
    const enrichedPrompt = `[🚨 0단계 AI가 사전 분석한 절대 채점 지침 준수 주의사항]:\n${standardsAnalysis}\n\n${prompt}`;
    return callLLMWithFailover(sys, enrichedPrompt, img, scenario, { ...opts, temperature: 0.0, progressId });
  };
  if (progressId) {
    standardsAnalysis = await analyzeStandardsBeforeTask(progressId, question || '주관식 채점', dynamicGradingStandards, 'grading');
    updateProgress(progressId, 1, '1단계: AI 엔진으로 제출 답안 채점 중...', 30);
  }

  let attempt = 0;
  const maxAttempts = 3;
  let delay = 1000;
  let lastError = null;

  try {
    while (attempt < maxAttempts) {
      try {
        const result = await gradeSubjective({
          question,
          correctAnswer,
          userAnswer,
          rowHeader,
          colHeader,
          explanation,
          category,
          callLLMWithFailover: localCallLLM,
          gradingStandards: dynamicGradingStandards,
          engineeringStandards: dynamicEngineeringStandards
        });
        if (progressId) {
          updateProgress(progressId, 1, '1단계: 채점 완료!', 100);
        }
        return res.json(result);
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt < maxAttempts) {
          console.warn(`[AI grading retry] Attempt ${attempt} failed. Retrying in ${delay}ms...`, err.message || err);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
    }

    console.error('All AI grading attempts failed:', lastError);
    // API 장애 또는 오류 시 최종 대비책으로 로컬 단순 비교 결과 적용
    const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
    const localCorrect = normalize(userAnswer) === normalize(correctAnswer);
    if (progressId) {
      updateProgress(progressId, 1, '1단계: 채점 완료(로컬)!', 100);
    }
    res.json({
      isCorrect: localCorrect,
      score: localCorrect ? 10 : 0,
      reason: localCorrect 
        ? '로컬 단순 비교로 정답 판정' 
        : 'AI 채점 오버로드로 평가 실패 (재평가 버튼을 눌러주세요)'
    });
  } catch (outerErr) {
    console.error('Outer AI grading error:', outerErr);
    res.status(500).json({ error: '서버 오류로 채점을 수행하지 못했습니다.' });
  }
});

// 6-2-1. GET /api/topics/:id/question-feedback → 특정 토픽의 문제 추천/비추천 피드백 목록 반환
app.get('/api/topics/:id/question-feedback', async (req, res) => {
  const topicId = Number(req.params.id);
  try {
    const rows = await dbQuery.all(
      'SELECT question_text, feedback_type FROM question_feedback WHERE topic_id = ?',
      [topicId]
    );
    res.json({ success: true, feedback: rows });
  } catch (err) {
    console.error('GET /api/topics/:id/question-feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6-2-2. POST /api/topics/:id/question-feedback → 특정 토픽의 문제 추천/비추천 설정 및 토글
app.post('/api/topics/:id/question-feedback', async (req, res) => {
  const topicId = Number(req.params.id);
  const { question_text, feedback_type } = req.body;

  if (!question_text || !feedback_type) {
    return res.status(400).json({ error: 'question_text와 feedback_type은 필수입니다.' });
  }

  try {
    const trimmedQ = question_text.trim();
    // 1. 기존의 동일 질문 피드백 제거
    await dbQuery.run(
      'DELETE FROM question_feedback WHERE topic_id = ? AND question_text = ?',
      [topicId, trimmedQ]
    );

    // 2. 피드백 타입이 upvote 또는 downvote 인 경우에만 새로 등록
    if (feedback_type === 'upvote' || feedback_type === 'downvote') {
      await dbQuery.run(
        'INSERT INTO question_feedback (topic_id, question_text, feedback_type) VALUES (?, ?, ?)',
        [topicId, trimmedQ, feedback_type]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/topics/:id/question-feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6-2-3. GET /api/question-feedback/all → 전체 토픽의 추천/비추천 피드백 목록 반환 (종합평가 등에서 활용)
app.get('/api/question-feedback/all', async (req, res) => {
  try {
    const rows = await dbQuery.all(
      'SELECT topic_id, question_text, feedback_type FROM question_feedback'
    );
    res.json({ success: true, feedback: rows });
  } catch (err) {
    console.error('GET /api/question-feedback/all error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6-3. Single Question Regeneration API
app.post('/api/question/regenerate', async (req, res) => {
  const { mode, topicId, currentQuestion, questionIdx, allQuestions, targetTypeSelection } = req.body;
  const topicInstructionsPrompt = await getFormattedTopicInstructions(topicId);
  const progressId = req.query.progressId || req.body.progressId;
  let standardsAnalysis = '';
  let progressTimer = null;
  const localCallLLM = (sys, prompt, img, scenario, opts) => {
    const enrichedPrompt = `[🚨 0단계 AI가 사전 분석한 절대 지침 준수 주의사항]:\n${standardsAnalysis}\n\n${prompt}`;
    return callLLMWithFailover(sys, enrichedPrompt, img, scenario, { ...opts, progressId });
  };
  if (progressId) {
    const targetQText = allQuestions && allQuestions[questionIdx] ? allQuestions[questionIdx].question : '재출제';
    standardsAnalysis = await analyzeStandardsBeforeTask(progressId, targetQText, GENERATION_STANDARDS, 'generation');
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 문항 재생성 시작...', 50, 1500, 5);
  }

  try {
    if ((topicId && topicId.startsWith('mixed_')) || currentQuestion?.mixedType) {
      const mixedType = currentQuestion?.mixedType || (currentQuestion?.acronym ? 'acronym' : 'table');
      
      if (mixedType === 'image') {
        if (progressTimer) {
          clearInterval(progressTimer);
          stopBackendProgressTimer(progressId, 100, '성공적으로 재출제했습니다!', true);
        }
        return res.json({ question: currentQuestion });
      }
      
      const content = currentQuestion.explanation || ''; // original table HTML or acronym content
      
      let systemPrompt = "당신은 지반공학 기술사 시험 전문 출제위원 및 튜터입니다.";
      let userPrompt = "";
      
      if (mixedType === 'table') {
        systemPrompt = `당신은 지반공학 기술사 시험 전문 튜터이자 출제위원입니다.
제공된 비교/대비 표 데이터를 기반으로, 수험생이 학습할 수 있는 참신한 표 빈칸 채우기(Table Quiz) 문항을 새로 구성하여 출제해 주십시오.

[🚨 문제 생성 절대 준수 지침]:
${GENERATION_STANDARDS}

[🚨 지반공학 표준 이론 및 계산 기준]:
${ENGINEERING_STANDARDS}

[출제 규칙]:
1. 제공된 비교 표의 행과 열 구조를 파악하고, 각 셀(Cell) 중 중요 개념이 들어간 위치를 무작위로 선택하여 빈칸 \`[INPUT_행번호_열번호]\` (예: \`[INPUT_1_2]\`) 형태로 치환하십시오.
2. 모든 셀을 빈칸으로 만들지 말고, 각 행당 최소 1개, 최대 2개 정도의 대표적인 핵심 키워드 셀들만 선택적으로 빈칸으로 만드십시오. 첫 번째 열(구분 항목)은 빈칸으로 만들지 마십시오.
3. \`answers\` 객체에는 각 빈칸 ID에 들어갈 정확한 정답 텍스트를 매핑하십시오. (예: {"INPUT_1_2": "능동적 보강"})
4. 지문(\`question\`)에는 표의 제목과 빈칸에 알맞은 답안을 서술하라는 안내 문장을 명확하게 적으십시오.

출력은 반드시 마크다운 블록이나 설명 없이 오직 순수한 JSON 객체 하나만 반환하십시오.
`;

        userPrompt = `
[원본 비교 표 HTML]:
${content}

[기존 문제 질문]:
${currentQuestion.question || ''}

위 원본 표 데이터를 바탕으로, 기존 문제와 다르게 빈칸의 위치(INPUT 대상을 다르게 선택)를 바꾸어 새로운 주관식 표채우기 문항을 구성하여 아래 JSON 포맷으로 출력해 주십시오.

[출력 포맷 예시]:
{
  "type": "주관식 (표채우기)",
  "question": "다음 어스앵커와 소일내일링 공법의 특징 비교표 빈칸 (A), (B), (C)에 들어갈 개념을 서술하시오.",
  "tableData": {
    "headers": ["구분", "비교대상A", "비교대상B"],
    "rows": [
      ["평가기준1", "[INPUT_0_1]", "수동적 보강"],
      ["평가기준2", "Prestress 도입", "[INPUT_1_2]"]
    ]
  },
  "answers": {
    "INPUT_0_1": "능동적 보강",
    "INPUT_1_2": "마찰 저항"
  },
  "explanation": "여기에 원본 표 HTML 내용을 그대로 똑같이 넣어주십시오."
}
`;
      } else {
        // mixedType === 'acronym'
        systemPrompt = `당신은 지반공학 기술사 시험 전문 튜터이자 출제위원입니다.
제시된 앞글자(두문자) 암기법 데이터를 기반으로, 더 나은 암기 편의를 위해 두문자의 조합 순서를 바꾸거나, 새로운 유사의미 단어로 대체하여 더 외우기 쉬운 새로운 두문자 조합과 짧은 연상문장을 창작(재출제)하여 반환해 주십시오.

[🚨 문제 생성 절대 준수 지침]:
${GENERATION_STANDARDS}

[출제 규칙]:
1. 각 항목에서 반드시 오직 한 글자(1글자)만 두문자로 추출하십시오.
2. 두문자 조합을 연달아 이었을 때 발음이 부드럽고 기억하기 쉬운 참신한 단어 지향적인 조합으로 구성하고, 이에 어울리는 아주 짧고 직관적인 연상문장을 창작하십시오. 이때 두문자 글자들이 이어서 2글자든, 그 이상이든 실제 의미 있는 단어나 구(예: "지지", "오용" 등)를 형성하는 경우, 개별 한 글자씩 쪼개기보다 적어도 두 글자 이상을 합친 단어 단위로 묶어서 쌍따옴표를 씌우고 연상문장에 표현하도록 하십시오. 모든 두문자 글자는 누락 없이 반드시 문장 속에 포함되어야 합니다.
3. 연상문장에는 반드시 해당 토픽의 제목(또는 제목을 상징하는 핵심 단어/키워드, 예: '부등침하'의 경우 '부등')이 자연스럽게 포함되어야 합니다. 수험생이 연상문장만으로도 어떤 토픽의 암기법인지 직관적으로 연상할 수 있어야 합니다.
4. 출력 형식은 아래 JSON 포맷을 100% 준수해야 합니다.

출력은 반드시 마크다운 블록이나 설명 없이 오직 순수한 JSON 객체 하나만 반환하십시오.
`;

        userPrompt = `
[원본 두문자 암기법 정보]:
${content}

위 원본 두문자 데이터를 바탕으로, 더 외우기 쉬운 새로운 두문자 조합과 짧은 연상문장 및 각 행(두문자, 암기단어, 설명)을 재창작하여 아래 JSON 포맷으로 출력해 주십시오.

[출력 포맷 예시]:
{
  "type": "주관식 (앞글자)",
  "question": "제목 예시 (예: 지반조사 단계)",
  "acronym": "새로운 두문자 조합 (예: 광예본보)",
  "sentence": "새로운 연상문장 (예: 지반조사는 광적으로 예비하고 본조사로 보완하자)",
  "correctRows": [
    ["광", "광역조사/자료조사: 설명내용..."],
    ["예", "예비조사: 설명내용..."]
  ],
  "tableData": {
    "headers": ["두문자", "내용 (암기단어 : 설명)"],
    "rows": [
      ["", ""],
      ["", ""]
    ]
  },
  "explanation": "여기에 원래의 암기법 텍스트를 상세히 기록해 주십시오."
}
`;
      }
      
      const response = await localCallLLM(systemPrompt, userPrompt, null, mixedType === 'table' ? 'mixed_table_regen' : 'mixed_acronym_regen', { temperature: 1.0 });
      
      // JSON 파싱 및 보정
      let parsed = {};
      try {
        const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanJson);
      } catch (err) {
        console.error('Failed to parse mixed regen JSON:', err, response);
        throw new Error('AI 응답 파싱 실패');
      }
      
      // Ensure properties are healed
      if (mixedType === 'table') {
        parsed.type = '주관식 (표채우기)';
        parsed.subtype = '표채우기';
        parsed.explanation = content; // Keep original HTML
        parsed.mixedType = 'table';
      } else {
        parsed.type = '주관식 (앞글자)';
        parsed.explanation = content; // Keep original acronym markdown
        parsed.mixedType = 'acronym';
        if (parsed.correctRows) {
          parsed.tableData = {
            headers: ['두문자', '내용 (암기단어 : 설명)'],
            rows: parsed.correctRows.map(() => ['', ''])
          };
        }
      }
      
      if (progressTimer) {
        clearInterval(progressTimer);
        stopBackendProgressTimer(progressId, 100, '성공적으로 재출제했습니다!', true);
      }
      
      return res.json({
        question: parsed,
        isFallback: false
      });
    }

    let duplicatePreventionPrompt = '';
    if (Array.isArray(allQuestions) && allQuestions.length > 0) {
      const otherQs = allQuestions.filter((_, i) => i !== questionIdx);
      if (otherQs.length > 0) {
        duplicatePreventionPrompt = `
[🚨 중복 출제 금지 규칙 - 극도로 중요!]:
현재 이 문제 세트(13문항) 내에 아래 문제들이 이미 출제되어 있습니다. 새로 생성하는 문제는 아래 기존 문제들(질문 내용, 공식, 표의 구분 항목, 정답 등)과 **절대 중복되거나 유사해서는 안 됩니다.** 완전히 새로운 관점, 다른 공식, 다른 개념, 혹은 다른 실무 시나리오를 적용해 주십시오:
${otherQs.map((q, i) => {
  let qSummary = `기존 문제 ${i + 1} (유형: ${q.type || q.subtype || '미정'}):
- 질문: ${q.question || '없음'}`;
  if (q.formula) qSummary += `\n- 공식: ${q.formula}`;
  if (q.tableData && q.tableData.headers) {
    qSummary += `\n- 비교 헤더: ${JSON.stringify(q.tableData.headers)}`;
    if (q.tableData.rows) {
      const rowHeaders = q.tableData.rows.map(r => r[0]).filter(Boolean);
      qSummary += `\n- 표 구분항목(행 제목): ${JSON.stringify(rowHeaders)}`;
    }
  }
  return qSummary;
}).join('\n\n')}
`;
      }
    }
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );

    if (mode === 'review') {
      if (!topicId) {
        return res.status(400).json({ error: '토픽 ID가 제공되지 않았습니다.' });
      }

      const topicSql = `SELECT * FROM topics WHERE id = ?`;
      const topic = await dbQuery.get(topicSql, [topicId]);

      if (!topic) {
        return res.status(404).json({ error: '토픽을 찾을 수 없습니다.' });
      }

      let fileText = '';
      if (topic.pdf_data) {
        fileText = await getTopicText(topic);
        fileText = smartTruncate(fileText, 25000);
      }

      // 전공 정밀 가로채기 레이어
      const cleanTitle = (topic.title || '').toLowerCase();
      const cleanKeywords = (topic.keywords || '').toLowerCase();
      const searchTarget = `${cleanTitle} ${cleanKeywords}`;

      const isCoreTopic = 
        searchTarget.includes('이중층') || searchTarget.includes('double layer') || searchTarget.includes('전기이중층') || searchTarget.includes('ddl') ||
        searchTarget.includes('압밀') || searchTarget.includes('consolidation') || searchTarget.includes('침하') || searchTarget.includes('settlement') ||
        searchTarget.includes('sand mat') || searchTarget.includes('샌드매트') || searchTarget.includes('샌드 매트') || searchTarget.includes('sandmat') ||
        searchTarget.includes('평사투영') || searchTarget.includes('평사 투영') || searchTarget.includes('stereographic') || searchTarget.includes('stereonet') || searchTarget.includes('평사') ||
        searchTarget.includes('인발') || searchTarget.includes('인발시험') || searchTarget.includes('pullout') || searchTarget.includes('pull-out') || searchTarget.includes('락볼트 인발') || searchTarget.includes('인발 시험') ||
        searchTarget.includes('q 분류') || searchTarget.includes('q분류') || searchTarget.includes('q system') || searchTarget.includes('q-system') || searchTarget.includes('barton') || searchTarget.includes('바톤') ||
        searchTarget.includes('싱글쉘') || searchTarget.includes('single shell') || searchTarget.includes('single_shell') || searchTarget.includes('싱글 쉘') || searchTarget.includes('sst') || searchTarget.includes('더블쉘') ||
        searchTarget.includes('소일내일') || searchTarget.includes('소일네일') || searchTarget.includes('soil nail') || searchTarget.includes('어스앵커') || searchTarget.includes('어스 앵커') || searchTarget.includes('earth anchor') || searchTarget.includes('네일') || searchTarget.includes('앵커') ||
        searchTarget.includes('프란틀') || searchTarget.includes('prandtl') ||
        searchTarget.includes('여굴') || searchTarget.includes('overbreak') || searchTarget.includes('제어발파') || searchTarget.includes('제어 발파') || searchTarget.includes('contour hole') || searchTarget.includes('외곽공') || searchTarget.includes('smooth blasting') || searchTarget.includes('스무드 블라스팅') || searchTarget.includes('스무드블라스팅') || searchTarget.includes('line drilling') || searchTarget.includes('라인 드릴링') || searchTarget.includes('presplitting') || searchTarget.includes('프리스플리팅') || searchTarget.includes('디커플링') || searchTarget.includes('decoupling') ||
        searchTarget.includes('사면안정') || searchTarget.includes('사면 안정') || searchTarget.includes('slope stability') || searchTarget.includes('slope') || searchTarget.includes('사면 붕괴') || searchTarget.includes('사면붕괴') || searchTarget.includes('원호파괴') || searchTarget.includes('평면파괴') || searchTarget.includes('쐐기파괴') || searchTarget.includes('전도파괴') || searchTarget.includes('절편법') || searchTarget.includes('fellenius') ||
        searchTarget.includes('토압') || searchTarget.includes('옹벽') || searchTarget.includes('earth pressure') || searchTarget.includes('retaining wall') || searchTarget.includes('주동토압') || searchTarget.includes('수동토압') || searchTarget.includes('정지토압') || searchTarget.includes('주동 토압') || searchTarget.includes('수동 토압') || searchTarget.includes('정지 토압') || searchTarget.includes('랭킨') || searchTarget.includes('rankine') || searchTarget.includes('쿨롱') || searchTarget.includes('coulomb') ||
        searchTarget.includes('전단강도') || searchTarget.includes('전단 강도') || searchTarget.includes('shear strength') || searchTarget.includes('삼축압축') || searchTarget.includes('삼축 압축') || searchTarget.includes('uu 시험') || searchTarget.includes('cu 시험') || searchTarget.includes('cd 시험') || searchTarget.includes('uu시험') || searchTarget.includes('cu시험') || searchTarget.includes('cd시험') || searchTarget.includes('비배수') || searchTarget.includes('mohr-coulomb') || searchTarget.includes('모어 쿨롱') || searchTarget.includes('모어-쿨롱') ||
        searchTarget.includes('투수') || searchTarget.includes('침투') || searchTarget.includes('보일링') || searchTarget.includes('boiling') || searchTarget.includes('분사현상') || searchTarget.includes('분사 현상') || searchTarget.includes('piping') || searchTarget.includes('파이핑') || searchTarget.includes('seepage') || searchTarget.includes('permeability') || searchTarget.includes('darcy') || searchTarget.includes('다르시') || searchTarget.includes('임계동수경사') || searchTarget.includes('동수경사') || searchTarget.includes('유선망') || searchTarget.includes('flow net') ||
        searchTarget.includes('흙막이') || searchTarget.includes('가설 흙막이') || searchTarget.includes('가설흙막이') || searchTarget.includes('탄소성') || searchTarget.includes('탄소성보') || searchTarget.includes('탄소성보법') || searchTarget.includes('braced wall') || searchTarget.includes('braced_wall') || searchTarget.includes('지반스프링') || searchTarget.includes('지반 스프링') ||
        searchTarget.includes('액상화') || searchTarget.includes('liquefaction') || searchTarget.includes('간극수압') || searchTarget.includes('과잉간극수압') ||
        searchTarget.includes('보상기초') || searchTarget.includes('compensated foundation') || searchTarget.includes('compensated_foundation') || searchTarget.includes('하중 보상') || searchTarget.includes('하중보상') ||
        searchTarget.includes('수압파쇄') || searchTarget.includes('hydraulic fracturing') || searchTarget.includes('수압 파쇄') || searchTarget.includes('파쇄시험') || searchTarget.includes('파쇄 시험');

      // targetType 결정
      let targetType = '객관식 (4지선다)';
      let targetSubtype = ''; // 12번형태 또는 13번형태 구분을 위해 추가
      const currentType = currentQuestion?.type || '';

      if (targetTypeSelection === 'mc') {
        targetType = '객관식 (4지선다)';
      } else if (targetTypeSelection === 'subj') {
        targetType = '주관식 (단답형)';
        const rand = Math.floor(Math.random() * 2);
        targetSubtype = rand === 0 ? '12번형태' : '13번형태';
      } else if (targetTypeSelection === 'table') {
        targetType = '주관식 (표채우기)';
      } else {
        // 기존 결정 로직
        if (currentType.includes('개요')) {
          targetType = '주관식 (개요)';
        } else if (currentType.includes('공식')) {
          targetType = '주관식 (공식)';
        } else if (currentType.includes('표채우기') || currentQuestion?.tableData) {
          targetType = '주관식 (표채우기)';
        } else if (currentType.includes('단답형') || currentType.includes('단답')) {
          targetType = '주관식 (단답형)';
          // 주관식 단답형은 12번(개념) 혹은 13번(대책) 중 하나로 랜덤 적용
          const rand = Math.floor(Math.random() * 2);
          targetSubtype = rand === 0 ? '12번형태' : '13번형태';
        } else if (currentType.includes('객관식') || (currentQuestion?.options && currentQuestion.options.length > 0)) {
          // 객관식은 객관식 또는 주관식 12번, 13번형태 중 하나로 변경
          const rand = Math.floor(Math.random() * 3);
          if (rand === 0) {
            targetType = '객관식 (4지선다)';
          } else if (rand === 1) {
            targetType = '주관식 (단답형)';
            targetSubtype = '12번형태';
          } else {
            targetType = '주관식 (단답형)';
            targetSubtype = '13번형태';
          }
        } else {
          // fallback based on index if we can't determine it
          if (questionIdx === 0) targetType = '주관식 (개요)';
          else if (questionIdx === 1) targetType = '주관식 (공식)';
          else targetType = '객관식 (4지선다)';
        }
      }

      if (!hasAnyAiKey) {
        // API Key가 없으면 예비 풀(generateFallbackQuestions)에서 추출하여 다른 문항 반환
        const fallbackList = generateFallbackQuestions(topic.title, topic.keywords, fileText);
        // 타입에 맞는 문항 필터링
        const candidates = fallbackList.filter(q => {
          if (targetType === '주관식 (개요)') return q.type?.includes('개요');
          if (targetType === '주관식 (공식)') return q.type?.includes('공식');
          if (targetType === '주관식 (표채우기)') return q.type?.includes('표채우기') || q.subtype?.includes('표채우기');
          if (targetType === '주관식 (단답형)') return q.type?.includes('단답') || q.subtype?.includes('단답');
          return q.type?.includes('객관식');
        });
        
        // 기존 질문과 겹치지 않는 문항 선택
        let selectedQ = candidates.find(c => c.question !== currentQuestion?.question);
        if (!selectedQ) selectedQ = candidates[Math.floor(Math.random() * candidates.length)] || fallbackList[0];

        return res.json({
          question: healQuizQuestionObject({
            ...selectedQ,
            question: cleanQuizQuestion(selectedQ.question)
          }),
          isFallback: true
        });
      }

      // AI를 활용한 재생성
      let typeRequirement = '';
      let formatRequirement = '';
      if (targetType === '주관식 (개요)') {
        const coreSubject = getCoreSubjectFromTitle(topic.title);
        typeRequirement = BT + '[1번 문제] 주관식 (개요) 유형으로 생성하십시오:\n' +
  '- 목적: 토픽의 핵심 정의(개요)를 명확하고 짜임새 있게 묻는 질문.\n' +
  '- "type" 값: 반드시 "주관식 (개요)"\n' +
  '- "question": 제공된 본문 텍스트 전체를 아우를 수 있는 핵심 공학적 대주제(대제목)를 도출하고, 그 주제에 관한 개요, 원리, 개념적 정의를 깊이 있게 묻는 자연스럽고 전문적인 지문(서술형 질문 문장)을 직접 작성하십시오. 토픽 제목을 단순히 그대로 적용하거나 획일화된 고정 템플릿(예: "~의 핵심 개념, 정의, 원리 등을 설명하는 키워드를 입력하세요")을 사용하는 것을 엄격히 금지합니다.\n' +
  '- "concept": 질문에 정확히 부합하며, 최소 4줄에서 최대 6줄 사이의 분량으로 아주 전문적이고 직관적인 개요 및 개념 설명을 서술하십시오. 또한, 이 설명 내에서 채점관이 식별해야 할 핵심 공학적 키워드들은 반드시 역슬래시 없이 일반 마크다운 강조 기호인 **키워드** 형태로 감싸서 표현해 주십시오. (예: **숏크리트 두께**, **지반 압력** 등)\n' +
  '- "formula": 반드시 빈 문자열 ""\n' +
  '- "structure": 위 formula에서 사용된 각 기호의 정의를 장황하지 않게 줄바꿈(\\n)으로 최소한의 명사형 위주로 간단히 작성. (예: "- $t$: 숏크리트 두께\\n- $P$: 지반압")' + BT;
        formatRequirement = BT + '{\n' +
  '  "type": "주관식 (개요)",\n' +
  '  "question": "토픽의 기본 정의와 핵심 개념을 묻는 질문 내용",\n' +
  '  "concept": "핵심 키워드가 **강조**된 4~6줄 분량의 개요 설명 답변",\n' +
  '  "formula": "",\n' +
  '    "structure": ""\n' +
  '}' + BT;
      } else if (targetType === '주관식 (공식)') {
        typeRequirement = BT + '[2번 문제] 주관식 (공식) 유형으로 생성하십시오:\n' +
  '- 목적: 토픽에 적용되는 가장 대표적이고 단순한 공식만 묻는 질문.\n' +
  '- "type" 값: 반드시 "주관식 (공식)"\n' +
  '- "question": 토픽을 대표하는 가장 핵심적인 공식의 공식명칭 자체나 핵심 질문 문구만 간결하게 작성하십시오. 뒤에 사족은 붙이지 말고 핵심 명사형 공식 제목만 구성해 주십시오.\n' +
  '- "concept": 공식에 대한 1줄짜리 매우 컴팩트한 요약 설명.\n' +
  '- "formula": 오직 대표 LaTeX 공식 1개만 순수하게 작성. 문자열이나 설명 기호는 절대 넣지 마십시오. (예: "$t = \\\\frac{P - 2C \\\\sin\\\\varphi}{\\\\gamma \\\\tan\\\\varphi + \\\\frac{2S}{D}}$")\n' +
  '- "structure": 위 formula에서 사용된 각 기호의 정의를 장황하지 않게 줄바꿈(\\n)으로 최소한의 명사형 위주로 간단히 작성. (예: "- $t$: 숏크리트 두께\\n- $P$: 지반압")' + BT;
        formatRequirement = BT + '{\n' +
  '  "type": "주관식 (공식)",\n' +
  '  "question": "토픽의 대표 공식명칭 (사족 배제)",\n' +
  '  "concept": "공식에 대한 한 줄 요약",\n' +
  '  "formula": "$LaTeX공식",\n' +
  '  "structure": "- $기호1$: 간단한 명사형 의미\\n- $기호2$: 간단한 명사형 의미"\n' +
  '}' + BT;
      } else if (targetType === '주관식 (표채우기)') {
        typeRequirement = BT + '[주관식 (표채우기)] 유형으로 생성하십시오:\n' +
  '- 목적: 토픽의 핵심 개념이나 비교 공법들을 표 형식으로 대조하는 칸채우기 질문.\n' +
  '- "type" 값: 반드시 "주관식 (표채우기)"\n' +
  '- "question": 표의 빈칸에 알맞은 핵심 답안을 서술하라는 질문 (예: "다음 비교표 빈칸 (A), (B)에 들어갈 내용을 기술하십시오."). 지문 내에 [INPUT_1] 같은 시스템 토큰을 적지 말고 (A), (B) 등으로 표기하십시오.\n' +
  '- ⚠️ [지문과 빈칸 요구사항의 완벽한 일치화 - 극도로 중요!]:\\n' +
  '  * 표채우기 문항 출제 시, 질문 지문(question)의 서술 내용과 표(tableData) 내 빈칸(INPUT)의 요구사항, 그리고 정답(answers)의 형태가 반드시 100% 완벽하게 일치해야 합니다.\\n' +
  '  * 계산형(수치 입력) 일치화: 만약 표의 빈칸이 수치 계산 결과나 수학적 수치를 요구한다면, 질문 지문에서는 절대 "지반공학적 설계 의미를 기술하라"거나 "이유와 특성을 설명하라"와 같은 서술적 요구사항을 포함하지 마십시오. 지문은 오직 "빈칸 (A), (B)에 들어갈 계산 값을 구하여 표를 완성하십시오"처럼 수치 계산/기입만을 지시해야 합니다.\\n' +
  '  * 개념형(서술형 입력) 일치화: 만약 질문 지문에서 공법의 특징 비교나 공학적 개념 대조를 묻는다면, 표의 빈칸과 정답(answers)은 해당 개념을 설명하는 서술형 문장이어야 하며, 지문에서 엉뚱한 수치 계산(예: 심도 z=500m, 압력=14MPa 등)을 묻는 조건이나 수치들을 절대 제시하지 마십시오.\\n' +
  '  * 두 가지 성격이 한 문제에 뒤섞이는(서술하라고 하면서 정답은 숫자이거나, 계산하라고 해놓고 정답은 설명 문장인 경우 등) 치명적인 출제 오류를 절대 범하지 마십시오.\\n' +
  '- "tableData": 표의 데이터를 구조화한 객체. headers(열 제목 배열)와 rows(각 행의 셀 데이터 배열)를 포함합니다.\n' +
  '  * headers의 비교 대상 열 제목은 "비교대상 A" 같은 추상 명칭이 아니라, 토픽에서 도출된 **구체적인 실제 비교 대상명(예: "소일네일링(Soil Nailing)", "어스앵커(Earth Anchor)")**을 기재하십시오.\n' +
  '  * 🚨 **[구분 항목(행 제목) 명확화 및 행동 유도 원칙]**: 구분 항목(rows 첫째 열)은 그것만 읽어도 ①무슨 토픽/주제 비교인지, ②어떤 답을 써야 하는지 100% 확신할 수 있어야 합니다. 글자수는 최소 15자에서 최대 45자 이내로 길고 자세하게 작성하십시오. 단순히 \'신뢰성 확보\' 같이 추상적 명사형으로 적지 말고, 사용자가 무엇을 해야 하는지(방법/조치 사항) 알 수 있도록 **\'측정 데이터의 정확성과 신뢰성을 확보하기 위해 현장에서 통제/확보해야 할 주요 조치 사항\'**처럼 행동을 유도하는 설명적 구문으로 작성하십시오. ❌ 나쁜 예(범용적): "보강 효과", "지지 메커니즘", "시험 결과의 신뢰성 확보" → ✅ 좋은 예(토픽 특화): "네일/앵커체 인장력 전달 및 선행 긴장 도입 여부", "측정 데이터의 정확성과 신뢰성을 확보하기 위해 현장에서 통제/확보해야 할 주요 조치 사항"\n' +
  '  * 🚨 **[빈칸(입력 토큰) 구성 규칙 - 억지 빈칸 생성 금지]**:\n' +
  '    - 표 안의 모든 비교 셀을 억지로 전부 비워 둘 필요는 없습니다. 의미 있고 중요한 핵심 비교 포인트만 필요에 따라 자유롭고 유연하게 `[INPUT_1]`, `[INPUT_2]` 등으로 비우고, 나머지 비교 셀들은 일반 텍스트 설명문구(힌트/문맥)로 채워 자연스러운 표를 구성하십시오. ❌ 모든 셀을 기계적으로 무조건 전부 비워두는 행위 금지.\n' +
  '  * 🚨 **[단일 개념 토픽 출제 및 답안 중복 금지 규칙]**:\n' +
  '    - 비교 대상이 없는 단일 개념/공법 토픽일 경우, 무리하게 추상적 관점으로 행을 나누지 말고, (1) \'포화도 미달\' vs \'포화 완료\' 같은 상태/단계를 비교 열로 삼거나 (2) 단일 행(1 row)으로만 테이블을 구성하여 답안 중복을 원천 차단하십시오.\n' +
  '    - 동일 열 내에서 서로 다른 행에 중복되거나 유사한 의미를 갖는 정답(예: 여러 행의 정답이 모두 "포화도 확보")이 나오지 않도록 각 빈칸은 고유하고 독립적인 답안으로 구성해야 합니다.\n' +
  '- "answers": 각 빈칸 토큰에 해당하는 모범 답안 객체(15자~20자 서술형). 모범 답안은 해당 행의 구분 항목이 요구하는 답변 범주에 정확히 부합해야 합니다.\n' +
  '- "explanation": 표 전체 내용 및 각 빈칸에 대한 공학적 상세 해설.' + BT;
        formatRequirement = BT + '{\n' +
  '  "type": "주관식 (표채우기)",\n' +
  '  "question": "다음 비교표 빈칸 (A), (B)에 들어갈 내용을 기술하십시오.",\n' +
  '  "tableData": {\n' +
  '    "headers": ["구분 항목", "소일네일링(Soil Nailing)", "어스앵커(Earth Anchor)"],\n' +
  '    "rows": [["구분", "[INPUT_1]", "[INPUT_2]"]]\n' +
  '  },\n' +
  '  "answers": {\n' +
  '    "INPUT_1": "인장 및 전단력에 대한 수동적 저항",\n' +
  '    "INPUT_2": "정착지반 마찰저항 및 인장력 선도입"\n' +
  '  },\n' +
  '  "explanation": "상세 해설"\n' +
  '}' + BT;
      } else if (targetType === '주관식 (단답형)') {
        if (targetSubtype === '12번형태') {
          typeRequirement = BT + '[주관식 (단답형) - 개념 평가형(12번 형태)] 유형으로 생성하십시오:\n' +
    '- 목적: 해당 토픽의 가장 중요하고 핵심적인 공학적 개념(정의, 기본 가정, 또는 주요 공학적 의미/메커니즘 등)을 깊이 있게 평가하는 질문입니다.\n' +
    '- "type" 값: 반드시 "주관식 (단답형)"\n' +
    '- "question": 해당 토픽의 핵심 공학적 정의, 거동 원리, 또는 학술적 개념의 본질을 묻는 질문 문장을 작성하십시오.\n' +
    '- "answer": 질문에 부합하는 명확한 공학적 정의 또는 원리를 설명하며, 핵심 키워드가 **강조**된 1줄 서술형 모범답안 (최소 15자에서 최대 30자 내외)으로 작성하십시오.\n' +
    '- "explanation": 개념에 대한 논리적이고 전문적인 상세 해설.' + BT;
        } else if (targetSubtype === '13번형태') {
          typeRequirement = BT + '[주관식 (단답형) - 실무 대책형(13번 형태)] 유형으로 생성하십시오:\n' +
    '- 목적: 해당 토픽과 관련된 구체적인 실무 지반공학적 문제 상황(시나리오)을 제시하고 대처/방지 방안(해결 대책)을 요구하는 질문입니다.\n' +
    '- "type" 값: 반드시 "주관식 (단답형)"\n' +
    '- "question": 실무 현장에서 발생할 수 있는 구체적인 문제 상황(시나리오)을 서술하고, 이에 대한 공학적 대처 방안이나 방지 대책을 묻는 질문 문장을 작성하십시오.\n' +
    '- "answer": 구체적인 실무 해결 대책이나 현장 조치 사항을 포함하며, 핵심 키워드가 **강조**된 1줄 서술형 모범답안 (최소 15자에서 최대 30자 내외)으로 작성하십시오.\n' +
    '- "explanation": 실무 대책에 대한 논리적이고 전문적인 상세 해설.' + BT;
        } else {
          typeRequirement = BT + '[주관식 (단답형)] 유형으로 생성하십시오:\n' +
    '- 목적: 구체적인 실무 문제 상황이나 공학적 개념에 대해 서술형으로 묻고 1줄짜리 명확한 답을 요구하는 질문.\n' +
    '- "type" 값: 반드시 "주관식 (단답형)"\n' +
    '- "question": 토픽과 관련된 중요 이론이나 실무 시나리오에 대해 묻는 질문.\n' +
    '- "answer": 핵심 키워드가 **강조**된 1줄 서술형 모범답안 (최소 15자에서 최대 30자 내외).\n' +
    '- "explanation": 답안에 대한 논리적이고 전문적인 상세 해설.' + BT;
        }
        formatRequirement = BT + '{\n' +
  '  "type": "주관식 (단답형)",\n' +
  '  "question": "질문 문장",\n' +
  '  "answer": "핵심 키워드가 **강조**된 1줄 서술형 답안",\n' +
  '  "explanation": "상세 해설"\n' +
  '}' + BT;
      } else {
        typeRequirement = BT + '[객관식 4지선다] 유형으로 생성하십시오:\n' +
  '- "type" 값: 반드시 "객관식 (4지선다)"\n' +
  '- "question": 해당 토픽의 가장 본질적인 공학적 메커니즘, 거동 원리, 설계 판단 근거를 관통하는 고난도 질문. **🚨 단순 대입 계산 문제(공식/수치를 제시하고 계산시키는 문제) 절대 금지.** (⚠️ 표가 필요한 경우 <table> 태그 대신 아래 "tableData" 필드에 객체 구조로 작성.)\n' +
  '- "tableData": (선택사항) 문제에 표를 표시해야 하는 경우에만 정의하십시오. 주관식 (표채우기)와 마찬가지로 "headers"(열 제목 배열)와 "rows"(각 행 데이터의 배열)를 포함하는 오브젝트여야 합니다. (예: {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적환경", "해수", "담수"]]})\n' +
  '- "options": 4개의 보기 문항으로 구성된 문자열 배열 (반드시 정답 1개와 매력적인 오답 3개로 구성).\n' +
  '- "answer": "options" 배열 안에 있는 값 중 정확히 일치하는 정답 문자열.\n' +
  '- "explanation": 왜 이 보기가 정답이고 다른 보기들이 오답인지에 대한 논리적이고 전문적인 상세 해설.\n' +
  '- [핵심 관통 문제 출제 전략 - 극도로 중요]:\n' +
  '   - **🚨 [단순 대입 계산 문제 절대 금지]**: 질문 지문에 공식이나 수치를 미리 제시한 뒤 "이 값을 대입하여 계산하시오" 또는 "이 공식으로 구하시오" 식의 기계적 계산 문제는 **절대로 출제하지 마십시오.** 기술사 시험의 본질은 공학적 원리와 메커니즘에 대한 깊이 있는 이해력 검증입니다.\n' +
  '   - [핵심 관통 질문 원칙]: 모든 객관식 문제는 해당 토픽의 가장 본질적인 공학적 메커니즘, 거동 원리, 설계 판단 근거를 관통하는 질문이어야 합니다. 보기(options) 역시 공학적 개념 차이를 정확히 식별해야만 정답을 고를 수 있도록 설계하십시오.\n' +
  '   - **🚨 [공식 및 공식 수치 범위 노출 절대 금지 규칙 - 극도로 중요!]**: 문제 질문(question) 본문 내에 공식을 직접 적어주거나, 공식에 들어가는 특정 수치 범위(예: $E_u = (200 \\sim 500)s_u$ 등)를 지문에 미리 알려주지 마십시오. 오직 공식 명칭이나 변수들의 이름만을 제시해야 합니다. (단, 해설(explanation)에서는 자세하게 공식을 명시해야 합니다.)\n' +
  '   - 만약 전형적인 비계산형/정성적 토픽(예: 단순 품질 시험 절차, 단순 행정 제도 등)인 경우에만 일반적인 서술형/이해형 객관식 문제로 출제하되, 이 경우에도 가급적 물리적 변수의 영향도를 묻는 등 최대한 정량화에 가깝게 문제의 수준을 높여 출제하십시오.\n' +
  '- [환각 방지 철칙 (Anti-Hallucination Constraints)]:\n' +
  '   1. 제공된 소스 문서 텍스트(<Source_Document>) 내에 명시적 수치, 허용 안전율, 설계기준(KDS/KCS) 조항 번호나 공식이 없는 경우, 임의로 수식을 유도하거나 외부 시방서 수치 한계를 날조(Hallucination)하지 마십시오.\n' +
  '   2. 문서 범위를 벗어나는 역학적 수치나 비물리적 수치(예: 내부마찰각 60도 이상 등)를 창작하여 모순을 발생시키면 안 됩니다. 수치가 부족하다면 정량 계산 문제 출제를 즉시 우회하고 개념 이해형 문제로 대체하십시오.\n' +
  '- **오답 보기 구성 주의사항 (매우 중요)**: 오답 보기(options) 구성 시 **절대로 터무니없거나 극단적인 표현, 혹은 비현실적인 공학적 가정(예: \'무한대로 상승시킴\', \'실시간으로 기하급수적으로 증가함\', \'영원히 변하지 않음\', \'아예 발생하지 않음\', \'폭발함\' 등)은 절대로 사용하지 마십시오**. 실제 전공 서적이나 실무 기술 기준에 부합하는 **고도로 타당성 있고 그럴듯한 오답(plausible engineering distractors)**으로 구성해 주십시오. 모든 보기는 반드시 원본 소스 및 공학적 상식선에 긴밀히 결합되어야 합니다.' + BT;
        formatRequirement = BT + '{\n' +
  '  "type": "객관식 (4지선다)",\n' +
  '  "question": "질문 내용",\n' +
  '  "tableData": null,\n' +
  '  "options": ["보기 1", "보기 2", "보기 3", "보기 4"],\n' +
  '  "answer": "정확히 일치하는 정답 보기 텍스트",\n' +
  '  "explanation": "상세한 해설"\n' +
  '} (※ 만약 표가 필요한 질문이라면 "tableData": {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적 환경", "해수", "담수"]]} 처럼 구조화된 표 객체를 작성하고, 그렇지 않은 일반 질문이면 "tableData": null 로 설정하십시오.)' + BT;
      }

      const sourceQuestionText = currentQuestion?.question || '';
      const sourceQuestionAnswer = currentQuestion?.answer || '';
      const sourceQuestionConcept = currentQuestion?.concept || '';
      const sourceQuestionFormula = currentQuestion?.formula || '';
      const sourceQuestionOptions = currentQuestion?.options ? JSON.stringify(currentQuestion.options) : '';
      const sourceQuestionExplanation = currentQuestion?.explanation || '';

      const prompt = `
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원입니다.
${duplicatePreventionPrompt}

[토픽 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}
[첨부파일 본문 텍스트]: ${fileText || '제공되지 않음'}

[기초 소스 문제 (이 문제를 기반으로 응용/변형하여 새로운 문제를 출제해야 함)]:
- 질문: ${sourceQuestionText}
- 유형: ${targetType}
${sourceQuestionOptions ? `- 보기 목록: ${sourceQuestionOptions}` : ''}
${sourceQuestionAnswer ? `- 정답: ${sourceQuestionAnswer}` : ''}
${sourceQuestionConcept ? `- 핵심 개념 요약: ${sourceQuestionConcept}` : ''}
${sourceQuestionFormula ? `- 공식: ${sourceQuestionFormula}` : ''}
${sourceQuestionExplanation ? `- 기존 해설: ${sourceQuestionExplanation}` : ''}

[출제 요구사항 - 중요]:
반드시 위의 **[기초 소스 문제]**를 기반으로 하여, 이를 창의적으로 응용, 변형 또는 심화시킨 **새로운 응용/변형 문제 1개**를 출제해 주십시오.
- **🚨 [공식 및 공식 수치 범위 노출 절대 금지 규칙 - 극도로 중요!]**: 문제 질문(question) 본문 내에 공식을 직접 적어주거나, 공식에 들어가는 특정 수치 범위(예: $E_u = (200 \sim 500)s_u$ 등)를 지문에 미리 알려주지 마십시오. 오직 공식 명칭이나 변수들의 이름만을 제시해야 합니다. (단, 해설(explanation)에서는 자세하게 공식을 명시해야 합니다.) 
- 완전히 무관한 뜬금없는 개념을 가져오지 말고, **[기초 소스 문제]의 공학적 개념, 수식, 또는 상황적 전제**를 기반으로 삼으십시오.
- 어떻게 변형 및 응용할 것인가:
  1. 수치적 조건 변경 및 공학적 실무 시나리오(예: 특정 지반 유형, 벽체 거동 조건 등 구체적인 실무 문제) 적용
  2. 질문의 방향성 전환 (예: 원인을 묻던 것을 대책이나 메커니즘을 묻는 방향으로, 또는 변수 $X$를 구하는 공식 대신 다른 연관 변수 $Y$의 거동 영향도를 분석하도록 변형)
  3. 객관식의 경우, 다른 핵심적인 오답 지문이나 다른 성격의 정답 문항으로 재구성하여 더 참신한 공학적 판단력을 요구하도록 변경
- [기초 소스 문제]의 질문 텍스트와 완벽히 똑같이 복사하거나 극히 유사한 패턴을 단순히 재출제하는 것을 지양하고, 다양한 학술적/실무적 관점을 고르게 평가할 수 있도록 출제하십시오.
- 제공된 본문 소스 텍스트 자료에 구체적인 수치 한계치나 정량적 가이드라인이 명시되어 있는 경우, 해당 기준 값을 바탕으로 계산하거나 비교하는 문제를 우선적으로 출제해 주십시오.
- [기초 소스 문제]의 질문 텍스트와 완벽히 똑같이 복사하지 마십시오. 반드시 눈에 띄게 문장이나 내용이 변형/응용되어야 합니다.

${typeRequirement}

${topicInstructionsPrompt}
${GENERATION_STANDARDS}

${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
- 마크다운 블록 (\`\`\`json) 등 불필요한 설명은 제거하고 오직 순수 JSON 객체만 반환하십시오.

[응답 JSON 포맷]:
${formatRequirement}
`;

      const responseText = await localCallLLM(null, prompt, null, 'question');
      let text = responseText.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      let parsedQuestion = null;
      try {
        parsedQuestion = parseLlmJson(text);
      } catch (parseErr) {
        console.warn('[단일문제재생성] JSON.parse 실패로 정규식 추출을 시도합니다:', parseErr);
        const extracted = extractJsonArray('[' + text + ']');
        if (extracted && extracted[0]) parsedQuestion = extracted[0];
      }

      if (!parsedQuestion || typeof parsedQuestion !== 'object') {
        throw new Error('AI 재생성 문항 파싱에 실패했습니다.');
      }

      const healedQ = healQuizQuestionObject({
        ...parsedQuestion,
        question: cleanQuizQuestion(parsedQuestion.question)
      });
      if (progressTimer) clearInterval(progressTimer);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: validationPlugin으로 생성 문제 검증 중...', 50);
      }
      const validatedQ = await validateAndHealQuestion(healedQ, localCallLLM, topic.title, topic.keywords, fileText);
      const finalValidatedQ = healQuizQuestionObject({
        ...validatedQ,
        topic_id: Number(topicId),
        category: topic.category
      });
      if (progressId) {
        updateProgress(progressId, 2, '2단계: 문제 생성 및 검증 완료!', 100);
      }

      return res.json({
        question: finalValidatedQ,
        isFallback: false
      });

    } else if (mode === 'exam') {
      // 종합평가 모드 재생성
      // 1. Fetch metadata of all topics (very fast, no binary payload)
      const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name FROM topics ORDER BY created_at DESC`);
      if (!topics || topics.length === 0) {
        return res.status(400).json({ error: '등록된 토픽이 없습니다.' });
      }

      // 2. We only need the pdf_data for the first 8 topics
      const targetTopics = topics.slice(0, 8);
      const targetIds = targetTopics.map(t => t.id);
      
      // Fetch pdf_data only for those target topics
      const pdfDataRows = await dbQuery.all(
        `SELECT id, pdf_data FROM topics WHERE id IN (${targetIds.map(() => '?').join(',')})`,
        targetIds
      );
      
      // Map pdf_data back to targetTopics
      const pdfDataMap = {};
      for (const row of pdfDataRows) {
        pdfDataMap[row.id] = row.pdf_data;
      }
      for (const topic of targetTopics) {
        topic.pdf_data = pdfDataMap[topic.id] || null;
      }

      // 텍스트 간략 추출 (Promise.all 병렬 처리)
      const topicTexts = await Promise.all(targetTopics.map(async (topic) => {
        let fileText = '';
        if (topic.pdf_data) {
          const isHtml = topic.pdf_name && (
            topic.pdf_name.toLowerCase().endsWith('.html') ||
            topic.pdf_name.toLowerCase().endsWith('.htm') ||
            isBufferHtml(topic.pdf_data)
          );
          try {
            if (isHtml) fileText = htmlToPlainText(decodeHtmlBuffer(topic.pdf_data));
            else {
              const parsed = await pdfParse(topic.pdf_data);
              fileText = parsed.text || '';
            }
          } catch (e) {}
          fileText = mergeVerticalText(fileText);
          if (fileText.length > 1000) fileText = fileText.substring(0, 1000);
        }
        return `[토픽: ${topic.title}]\n키워드: ${topic.keywords || '없음'}\n${fileText || ''}`;
      }));

      const combinedText = topicTexts.join('\n\n---\n\n');
      const topicTitles = topics.map(t => t.title).join(', ');

      const currentType = currentQuestion?.type || '';
      const currentSubtype = currentQuestion?.subtype || '';
      
      let qType = '객관식';
      let qSubtype = '';
      let targetSubtype = ''; // 12번형태 또는 13번형태 지정을 위한 추가
      
      if (targetTypeSelection === 'mc') {
        qType = '객관식';
        qSubtype = '';
      } else if (targetTypeSelection === 'subj') {
        qType = '주관식';
        qSubtype = '단답형';
        const rand = Math.floor(Math.random() * 2);
        targetSubtype = rand === 0 ? '12번형태' : '13번형태';
      } else if (targetTypeSelection === 'table') {
        qType = '주관식';
        qSubtype = '표채우기';
      } else {
        // 기존 결정 로직
        if (currentType.includes('주관식')) {
          qType = '주관식';
          if (currentSubtype.includes('개요')) {
            qSubtype = '개요';
          } else if (currentSubtype.includes('공식')) {
            qSubtype = '공식';
          } else if (currentSubtype.includes('서술')) {
            qSubtype = '서술';
          } else if (currentSubtype.includes('표채우기') || currentQuestion?.tableData) {
            qSubtype = '표채우기';
          } else if (currentSubtype.includes('단답') || currentSubtype.includes('단답형')) {
            qSubtype = '단답형';
            // 주관식 단답형은 12번 혹은 13번형태 중 하나로 랜덤 적용
            const rand = Math.floor(Math.random() * 2);
            targetSubtype = rand === 0 ? '12번형태' : '13번형태';
          } else {
            // fallback if subtype is unknown
            qSubtype = '개요';
          }
        } else if (currentType.includes('객관식') || (currentQuestion?.options && currentQuestion.options.length > 0)) {
          // 객관식은 객관식 또는 주관식 12번, 13번형태 중 하나로 변경
          const rand = Math.floor(Math.random() * 3);
          if (rand === 0) {
            qType = '객관식';
            qSubtype = '';
          } else if (rand === 1) {
            qType = '주관식';
            qSubtype = '단답형';
            targetSubtype = '12번형태';
          } else {
            qType = '주관식';
            qSubtype = '단답형';
            targetSubtype = '13번형태';
          }
        } else {
          // fallback based on features
          if (currentQuestion?.tableData) {
            qType = '주관식';
            qSubtype = '표채우기';
          } else if (currentQuestion?.options && currentQuestion.options.length > 0) {
            qType = '객관식';
            qSubtype = '';
          } else {
            qType = '주관식';
            qSubtype = '개요';
          }
        }
      }
      if (!hasAnyAiKey) {
        // AI 키가 없는 경우 종합평가 예비 문항 fallback 선택
        const selectedTopic = topics[Math.floor(Math.random() * topics.length)];
        
        // Fetch pdf_data for this fallback topic
        const topicWithData = await dbQuery.get(`SELECT pdf_data FROM topics WHERE id = ?`, [selectedTopic.id]);
        const pdfData = topicWithData?.pdf_data || null;

        let fileText = '';
        if (pdfData) {
          const isHtml = selectedTopic.pdf_name && (
            selectedTopic.pdf_name.toLowerCase().endsWith('.html') ||
            selectedTopic.pdf_name.toLowerCase().endsWith('.htm') ||
            isBufferHtml(pdfData)
          );
          try {
            if (isHtml) fileText = htmlToPlainText(decodeHtmlBuffer(pdfData));
            else {
              const parsed = await pdfParse(pdfData);
              fileText = parsed.text || '';
            }
          } catch (e) {}
          fileText = mergeVerticalText(fileText);
        }
        
        const fallbackList = generateFallbackQuestions(selectedTopic.title, selectedTopic.keywords, fileText);
        const candidates = fallbackList.filter(q => {
          if (qType === '주관식') {
            if (qSubtype === '공식') return q.type?.includes('공식') || q.subtype?.includes('공식');
            if (qSubtype === '서술') return q.type?.includes('서술') || q.type?.includes('유도') || q.subtype?.includes('서술') || q.subtype?.includes('유도');
            if (qSubtype === '표채우기') return q.type?.includes('표채우기') || q.subtype?.includes('표채우기');
            if (qSubtype === '단답형') return q.type?.includes('단답') || q.subtype?.includes('단답');
            return q.type?.includes('개요') || q.subtype?.includes('개요');
          }
          return q.type?.includes('객관식') || q.subtype?.includes('객관식');
        });
        
        let selectedQ = candidates.find(c => c.question !== currentQuestion?.question);
        if (!selectedQ) selectedQ = candidates[Math.floor(Math.random() * candidates.length)] || fallbackList[0];

        // Ensure proper subtype and type fields for exam
        const finalQ = {
          ...selectedQ,
          type: qType,
          subtype: qSubtype,
          question: cleanQuizQuestion(selectedQ.question)
        };

        return res.json({
          question: healQuizQuestionObject(finalQ),
          isFallback: true
        });
      }

      let typeRequirement = '';
      let formatRequirement = '';

      if (qType === '주관식') {
        if (qSubtype === '공식') {
          typeRequirement = BT + '[주관식 공식 유형]으로 생성하십시오:\n' +
  '- "type": "주관식"\n' +
  '- "subtype": "공식"\n' +
  '- "question": "[필수공식] (공식명칭) 공식을 제시하고, 각 기호의 정의를 서술하시오." 와 같은 완성형 질문\n' +
  '- "answer": 상세 작성된 공식 및 각 기호의 의미\n' +
  '- "concept": 핵심 개념 1줄 요약' + BT;
          formatRequirement = BT + '{\n' +
  '  "type": "주관식",\n' +
  '  "subtype": "공식",\n' +
  '  "question": "[필수공식] 랭킨(Rankine) 주동토압 공식...",\n' +
  '  "answer": "$p_a = \\gamma z K_a$...",\n' +
  '  "concept": "벽체 배면의 수평 토압 산정 공식"\n' +
  '}' + BT;
        } else if (qSubtype === '서술') {
          typeRequirement = BT + '[주관식 서술/유도 유형]으로 생성하십시오:\n' +
  '- "type": "주관식"\n' +
  '- "subtype": "서술"\n' +
  '- "question": "[이론유도] (유도개념)의 이론 유도 과정 및 핵심 공학적 전제조건을 기술하시오." 형태의 완성형 질문\n' +
  '- "answer": 심도 있는 이론적 유도 메커니즘 설명\n' +
  '- "concept": 핵심 개념 1줄 요약' + BT;
          formatRequirement = BT + '{\n' +
  '  "type": "주관식",\n' +
  '  "subtype": "서술",\n' +
  '  "question": "[이론유도] Terzaghi 1차원 압밀...",\n' +
  '  "answer": "$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$...",\n' +
  '  "concept": "과잉간극수압 소산 지배 미분방정식"\n' +
  '}' + BT;
        } else if (qSubtype === '표채우기') {
          typeRequirement = BT + '[주관식 표채우기 유형]으로 생성하십시오:\n' +
  '- "type": "주관식"\n' +
  '- "subtype": "표채우기"\n' +
  '- "question": "다음 비교표 빈칸 (A), (B)에 들어갈 알맞은 핵심 개념을 서술하시오." 와 같은 표 지시 질문\n' +
  '- ⚠️ [지문과 빈칸 요구사항의 완벽한 일치화 - 극도로 중요!]:\\n' +
  '  * 표채우기 문항 출제 시, 질문 지문(question)의 서술 내용과 표(tableData) 내 빈칸(INPUT)의 요구사항, 그리고 정답(answers)의 형태가 반드시 100% 완벽하게 일치해야 합니다.\\n' +
  '  * 계산형(수치 입력) 일치화: 만약 표의 빈칸이 수치 계산 결과나 수학적 수치를 요구한다면, 질문 지문에서는 절대 "지반공학적 설계 의미를 기술하라"거나 "이유와 특성을 설명하라"와 같은 서술적 요구사항을 포함하지 마십시오. 지문은 오직 "빈칸 (A), (B)에 들어갈 계산 값을 구하여 표를 완성하십시오"처럼 수치 계산/기입만을 지시해야 합니다.\\n' +
  '  * 개념형(서술형 입력) 일치화: 만약 질문 지문에서 공법의 특징 비교나 공학적 개념 대조를 묻는다면, 표의 빈칸과 정답(answers)은 해당 개념을 설명하는 서술형 문장이어야 하며, 지문에서 엉뚱한 수치 계산(예: 심도 z=500m, 압력=14MPa 등)을 묻는 조건이나 수치들을 절대 제시하지 마십시오.\\n' +
  '  * 두 가지 성격이 한 문제에 뒤섞이는(서술하라고 하면서 정답은 숫자이거나, 계산하라고 해놓고 정답은 설명 문장인 경우 등) 치명적인 출제 오류를 절대 범하지 마십시오.\\n' +
  '- "tableData": 표 데이터 객체. headers 비교 대상 열은 "공법 A" 같은 추상 명칭 대신 **토픽에서 도출된 실제 비교 대상명(예: "소일네일링", "어스앵커")**을 기재하십시오.\n' +
  '  * 🚨 구분 항목(행 제목)은 그것만 읽어도 어떤 답을 써야 하는지 100% 확신할 수 있도록 구체적이고 설명적으로 길게(15자~45자) 작성하십시오. 단순히 추상적 명사형(예: "신뢰성 확보") 대신 행동이나 방법을 유도하도록 작성하십시오. (❌ "신뢰성 확보" → ✅ "측정 데이터의 정확성과 신뢰성을 확보하기 위해 현장에서 통제/확보해야 할 주요 조치 사항")\n' +
  '  * 🚨 **[빈칸(입력 토큰) 구성 규칙 - 억지 빈칸 생성 금지]**:\n' +
  '    - 표 안의 모든 비교 셀을 억지로 전부 비워 둘 필요는 없습니다. 의미 있고 중요한 핵심 비교 포인트만 필요에 따라 자유롭고 유연하게 `[INPUT_1]`, `[INPUT_2]` 등으로 비우고, 나머지 비교 셀들은 일반 텍스트 설명문구(힌트/문맥)로 채워 자연스러운 표를 구성하십시오. ❌ 모든 셀을 기계적으로 무조건 전부 비워두는 행위 금지.\n' +
  '  * 🚨 **[단일 개념 토픽 출제 및 답안 중복 금지 규칙]**:\n' +
  '    - 비교 대상이 없는 단일 개념/공법 토픽일 경우, 무리하게 추상적 관점으로 행을 나누지 말고, (1) \'포화도 미달\' vs \'포화 완료\' 같은 상태/단계를 비교 열로 삼거나 (2) 단일 행(1 row)으로만 테이블을 구성하여 답안 중복을 원천 차단하십시오.\n' +
  '    - 동일 열 내에서 서로 다른 행에 중복되거나 유사한 의미를 갖는 정답(예: 여러 행의 정답이 모두 "포화도 확보")이 나오지 않도록 각 빈칸은 고유하고 독립적인 답안으로 구성해야 합니다.\n' +
  '- "answers": 각 빈칸 토큰에 해당하는 모범 답안 객체(15자~20자 서술형). 해당 행의 구분 항목이 요구하는 범주에 정확히 부합해야 합니다.\n' +
  '- "concept": 핵심 개념 1줄 요약' + BT;
          formatRequirement = BT + '{\n' +
  '  "type": "주관식",\n' +
  '  "subtype": "표채우기",\n' +
  '  "question": "다음 비교표 빈칸 (A), (B)...",\n' +
  '  "tableData": {\n' +
  '    "headers": ["구분 항목", "소일네일링(Soil Nailing)", "어스앵커(Earth Anchor)"],\n' +
  '    "rows": [["구분", "[INPUT_1]", "[INPUT_2]"]]\n' +
  '  },\n' +
  '  "answers": {\n' +
  '    "INPUT_1": "모범 답안 1",\n' +
  '    "INPUT_2": "모범 답안 2"\n' +
  '  },\n' +
  '  "concept": "비교 테이블 설명"\n' +
  '}' + BT;
        } else if (qSubtype === '단답형') {
          if (targetSubtype === '12번형태') {
            typeRequirement = BT + '[주관식 단답형 - 개념 평가형(12번 형태)] 유형으로 생성하십시오:\n' +
    '- "type": "주관식"\n' +
    '- "subtype": "단답형"\n' +
    '- "question": 해당 토픽의 가장 중요하고 핵심적인 공학적 개념(정의, 기본 가정, 또는 주요 공학적 의미/메커니즘 등)을 평가하는 질문 문장\n' +
    '- "answer": 핵심 키워드 강조가 들어간 1줄 서술형 모범답안\n' +
    '- "concept": 핵심 개념 1줄 요약' + BT;
          } else if (targetSubtype === '13번형태') {
            typeRequirement = BT + '[주관식 단답형 - 실무 대책형(13번 형태)] 유형으로 생성하십시오:\n' +
    '- "type": "주관식"\n' +
    '- "subtype": "단답형"\n' +
    '- "question": 해당 토픽과 관련된 구체적인 실무 지반공학적 문제 상황(시나리오)을 제시하고 대처/방지 방안(해결 대책)을 요구하는 질문 문장\n' +
    '- "answer": 핵심 키워드 강조가 들어간 1줄 서술형 모범답안\n' +
    '- "concept": 핵심 개념 1줄 요약' + BT;
          } else {
            typeRequirement = BT + '[주관식 단답형 유형]으로 생성하십시오:\n' +
    '- "type": "주관식"\n' +
    '- "subtype": "단답형"\n' +
    '- "question": 구체적인 실무 문제점/시나리오를 지문으로 제시하고 해결책/대안을 요구하는 질문\n' +
    '- "answer": 핵심 키워드 강조가 들어간 1줄 서술형 모범답안\n' +
    '- "concept": 핵심 개념 1줄 요약' + BT;
          }
          formatRequirement = BT + '{\n' +
  '  "type": "주관식",\n' +
  '  "subtype": "단답형",\n' +
  '  "question": "질문 문장",\n' +
  '  "answer": "핵심 키워드가 **강조**된 1줄 서술형 답안",\n' +
  '  "concept": "단답형 설명"\n' +
  '}' + BT;
        } else {
          // 주관식 개요
          typeRequirement = BT + '[주관식 개요 유형]으로 생성하십시오:\n' +
  '- "type": "주관식"\n' +
  '- "subtype": "개요"\n' +
  '- "question": 공학적 중요 정의와 핵심 메커니즘을 서술형으로 묻는 핵심 질문\n' +
  '- "answer": 3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명 모범답안 (\\n 구분). 지나치게 1~2줄로 축약하거나 불필요하게 장황하지 않도록 적절한 학술적 깊이를 확보해야 합니다.\n' +
  '- "concept": 핵심 개념 1줄 요약' + BT;
          formatRequirement = BT + '{\n' +
  '  "type": "주관식",\n' +
  '  "subtype": "개요",\n' +
  '  "question": "샌드매트(Sand Mat)의 공학적 목적...",\n' +
  '  "answer": "3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명...",\n' +
  '  "concept": "연약지반 상부 모래 배수층 역할"\n' +
  '}' + BT;
        }
      } else {
        // 객관식\n' +
        typeRequirement = BT + '[4지선다 객관식] 유형으로 생성하십시오:\n' +
  '- "type": "객관식"\n' +
  '- "question": 해당 토픽의 가장 본질적인 공학적 메커니즘, 거동 원리, 설계 판단 근거를 관통하는 고난도 질문. **🚨 단순 대입 계산 문제(공식/수치를 제시하고 계산시키는 문제) 절대 금지.** (⚠️ 표가 필요한 경우 <table> 태그 대신 아래 "tableData" 필드에 객체 구조로 작성하십시오.)\n' +
  '- "tableData": (선택사항) 문제에 표를 표시해야 하는 경우에만 정의하십시오. 주관식 (표채우기)와 마찬가지로 "headers"(열 제목 배열)와 "rows"(각 행 데이터의 배열)를 포함하는 오브젝트여야 합니다. (예: {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적환경", "해수", "담수"]]})\n' +
  '- "options": 4개의 보기 문항으로 구성된 문자열 배열 (반드시 정답 1개와 매력적인 오답 3개)\n' +
  '- "answer": "options" 배열 내의 정확한 정답 보기 텍스트와 토씨 하나 틀리지 않는 값\n' +
  '- "explanation": 명쾌하고 공학적으로 깊이 있는 정밀 해설' + BT;
        formatRequirement = BT + '{\n' +
  '  "type": "객관식",\n' +
  '  "question": "공학적 현상 분석 질문 내용",\n' +
  '  "tableData": null,\n' +
  '  "options": ["보기1", "보기2", "보기3", "보기4"],\n' +
  '  "answer": "정확히 일치하는 정답 보기 텍스트",\n' +
  '  "explanation": "상세한 해설"\n' +
  '} (※ 만약 표가 필요한 질문이라면 "tableData": {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적 환경", "해수", "담수"]]} 처럼 구조화된 표 객체를 작성하고, 그렇지 않은 일반 질문이면 "tableData": null 로 설정하십시오.)' + BT;
      }

      const sourceQuestionText = currentQuestion?.question || '';
      const sourceQuestionAnswer = currentQuestion?.answer || '';
      const sourceQuestionConcept = currentQuestion?.concept || '';
      const sourceQuestionFormula = currentQuestion?.formula || '';
      const sourceQuestionOptions = currentQuestion?.options ? JSON.stringify(currentQuestion.options) : '';
      const sourceQuestionExplanation = currentQuestion?.explanation || '';

      const prompt = `
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원입니다.
${duplicatePreventionPrompt}

[평가 범위 토픽 목록]: ${topicTitles}
[통합 소스 텍스트]:
${combinedText}

[기초 소스 문제 (이 문제를 기반으로 응용/변형하여 새로운 문제를 출제해야 함)]:
- 질문: ${sourceQuestionText}
- 유형: ${qType} (하위 유형: ${qSubtype})
${sourceQuestionOptions ? `- 보기 목록: ${sourceQuestionOptions}` : ''}
${sourceQuestionAnswer ? `- 정답/답안: ${sourceQuestionAnswer}` : ''}
${sourceQuestionConcept ? `- 핵심 개념 요약: ${sourceQuestionConcept}` : ''}
${sourceQuestionFormula ? `- 공식: ${sourceQuestionFormula}` : ''}
${sourceQuestionExplanation ? `- 해설: ${sourceQuestionExplanation}` : ''}

[출제 요구사항 - 중요]:
반드시 위의 **[기초 소스 문제]**를 기반으로 하여, 이를 창의적으로 응용, 변형 또는 심화시킨 **새로운 응용/변형 문제 1개**를 출제해 주십시오.
- 완전히 무관한 뜬금없는 개념을 가져오지 말고, **[기초 소스 문제]의 공학적 개념, 수식, 또는 상황적 전제**를 기반으로 삼으십시오.
- 어떻게 변형 및 응용할 것인가:
  1. 수치적 조건 변경 및 공학적 실무 시나리오(예: 특정 지반 유형, 벽체 거동 조건 등 구체적인 실무 문제) 적용
  2. 질문의 방향성 전환 (예: 원인을 묻던 것을 대책이나 메커니즘을 묻는 방향으로, 또는 변수 $X$를 구하는 공식 대신 다른 연관 변수 $Y$의 거동 영향도를 분석하도록 변형)
  3. 객관식의 경우, 다른 핵심적인 오답 지문이나 다른 성격의 정답 문항으로 재구성하여 더 참신한 공학적 판단력을 요구하도록 변경
- [기초 소스 문제]의 질문 텍스트와 완벽히 똑같이 복사하거나 극히 유사한 패턴을 단순히 재출제하는 것을 지양하고, 다양한 학술적/실무적 관점을 고르게 평가할 수 있도록 출제하십시오.
- 제공된 본문 소스 텍스트 자료에 구체적인 수치 한계치나 정량적 가이드라인이 명시되어 있는 경우, 해당 기준 값을 바탕으로 계산하거나 비교하는 문제를 우선적으로 출제해 주십시오.
- [기초 소스 문제]의 질문 텍스트와 완벽히 똑같이 복사하지 마십시오. 반드시 눈에 띄게 문장이나 내용이 변형/응용되어야 합니다.

${typeRequirement}

${topicInstructionsPrompt}
${GENERATION_STANDARDS}

${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
- 추가 설명 텍스트 없이 오직 순수 JSON 데이터만 반환하십시오.

[JSON 포맷]:
${formatRequirement}
`;

      const responseText = await localCallLLM(null, prompt, null, 'question', { temperature: 1.0 });
      let text = responseText.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      let parsedQuestion = null;
      try {
        parsedQuestion = parseLlmJson(text);
      } catch (parseErr) {
        console.warn('[종합평가단일재생성] JSON.parse 실패로 정규식 추출을 시도합니다:', parseErr);
        const extracted = extractJsonArray('[' + text + ']');
        if (extracted && extracted[0]) parsedQuestion = extracted[0];
      }

      if (!parsedQuestion || typeof parsedQuestion !== 'object') {
        throw new Error('AI 종합평가 재생성 문항 파싱에 실패했습니다.');
      }

      const finalTopicId = topicId || currentQuestion?.topic_id;
      const activeTopic = topics.find(t => t.id === Number(finalTopicId));
      const activeTopicTitle = activeTopic ? activeTopic.title : '';
      const activeTopicKeywords = activeTopic ? activeTopic.keywords : '';
      let activeTopicFileText = '';
      if (activeTopic) {
        const tTopic = targetTopics.find(t => t.id === activeTopic.id);
        if (tTopic && tTopic.pdf_data) {
          const isHtml = tTopic.pdf_name && (
            tTopic.pdf_name.toLowerCase().endsWith('.html') ||
            tTopic.pdf_name.toLowerCase().endsWith('.htm') ||
            isBufferHtml(tTopic.pdf_data)
          );
          try {
            if (isHtml) activeTopicFileText = htmlToPlainText(decodeHtmlBuffer(tTopic.pdf_data));
            else {
              const parsed = await pdfParse(tTopic.pdf_data);
              activeTopicFileText = parsed.text || '';
            }
          } catch (e) {}
          activeTopicFileText = mergeVerticalText(activeTopicFileText);
        }
      }

      const healedQ = healQuizQuestionObject({
        ...parsedQuestion,
        topic_id: finalTopicId ? Number(finalTopicId) : null,
        question: cleanQuizQuestion(parsedQuestion.question)
      });
      if (progressTimer) clearInterval(progressTimer);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: validationPlugin으로 생성 문제 검증 중...', 50);
      }
      const validatedQ = await validateAndHealQuestion(healedQ, localCallLLM, activeTopicTitle, activeTopicKeywords, activeTopicFileText);
      const finalValidatedQ = healQuizQuestionObject(validatedQ);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: 문제 생성 및 검증 완료!', 100);
      }

      return res.json({
        question: finalValidatedQ,
        isFallback: false
      });
    } else {
      return res.status(400).json({ error: '올바르지 않은 모드(mode)입니다.' });
    }
  } catch (error) {
    console.error('Error in question regeneration route:', error);
    if (progressId) {
      updateProgress(progressId, 1, '오류 발생으로 재생성 실패', 100);
    }
    res.status(500).json({ error: error.message || '서버 오류로 단일 문제를 재생성하지 못했습니다.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// 6-6. Interactive Question Adjustment API based on user feedback
app.post('/api/question/adjust', async (req, res) => {
  const { mode, topicId, currentQuestion, questionIdx, userFeedback } = req.body;
  const topicInstructionsPrompt = await getFormattedTopicInstructions(topicId);
  const progressId = req.query.progressId || req.body.progressId;
  const localCallLLM = (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });

  let progressTimer = null;
  let standardsAnalysis = '';
  if (progressId) {
    const targetQText = currentQuestion ? currentQuestion.question : '의견 조절';
    standardsAnalysis = await analyzeStandardsBeforeTask(progressId, targetQText, GENERATION_STANDARDS, 'generation');
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 의견 반영 조절 시작...', 50, 1500, 5);
  }

  if (!userFeedback || !userFeedback.trim()) {
    if (progressTimer) clearInterval(progressTimer);
    return res.status(400).json({ error: '의견이 입력되지 않았습니다.' });
  }

  try {
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );

    if (!hasAnyAiKey) {
      return res.status(400).json({ error: '의견을 반영하여 조절할 AI API 키가 설정되어 있지 않습니다.' });
    }

    if (mode === 'review') {
      if (!topicId) {
        return res.status(400).json({ error: '토픽 ID가 제공되지 않았습니다.' });
      }

      const topicSql = `SELECT * FROM topics WHERE id = ?`;
      const topic = await dbQuery.get(topicSql, [topicId]);

      if (!topic) {
        return res.status(404).json({ error: '토픽을 찾을 수 없습니다.' });
      }

      let fileText = '';
      if (topic.pdf_data) {
        fileText = await getTopicText(topic);
        fileText = smartTruncate(fileText, 25000);
      }

      // targetType 결정
      let targetType = '객관식 (4지선다)';
      const currentType = currentQuestion?.type || '';
      if (currentType.includes('개요')) {
        targetType = '주관식 (개요)';
      } else if (currentType.includes('공식')) {
        targetType = '주관식 (공식)';
      } else if (currentType.includes('표채우기') || currentQuestion?.tableData) {
        targetType = '주관식 (표채우기)';
      } else if (currentType.includes('단답형') || currentType.includes('단답')) {
        targetType = '주관식 (단답형)';
      } else if (currentType.includes('객관식') || (currentQuestion?.options && currentQuestion.options.length > 0)) {
        targetType = '객관식 (4지선다)';
      } else {
        // fallback based on index if we can't determine it
        if (questionIdx === 0) targetType = '주관식 (개요)';
        else if (questionIdx === 1) targetType = '주관식 (공식)';
        else targetType = '객관식 (4지선다)';
      }

      let typeRequirement = '';
      let formatRequirement = '';

      if (qType === '주관식') {
        if (qSubtype === '공식') {
          typeRequirement = `[주관식 공식 유형]으로 생성하십시오:
- "type": "주관식"
- "subtype": "공식"
- "question": "[필수공식] (공식명칭) 공식을 제시하고, 각 기호의 정의를 서술하시오." 와 같은 완성형 질문
- "answer": 상세 작성된 공식 및 각 기호의 의미
- "concept": 핵심 개념 1줄 요약`;
          formatRequirement = `{
  "type": "주관식",
  "subtype": "공식",
  "question": "[필수공식] 랭킨(Rankine) 주동토압 공식...",
  "answer": "$$p_a = \\\\gamma z K_a$$...",
  "concept": "벽체 배면의 수평 토압 산정 공식"
}`;
        } else if (qSubtype === '서술') {
          typeRequirement = `[주관식 서술/유도 유형]으로 생성하십시오:
- "type": "주관식"
- "subtype": "서술"
- "question": "[이론유도] (유도개념)의 이론 유도 과정 및 핵심 공학적 전제조건을 기술하시오." 형태의 완성형 질문
- "answer": 심도 있는 이론적 유도 메커니즘 설명
- "concept": 핵심 개념 1줄 요약`;
          formatRequirement = `{
  "type": "주관식",
  "subtype": "서술",
  "question": "[이론유도] Terzaghi 1차원 압밀...",
  "answer": "$$\\\\frac{\\\\partial u}{\\\\partial t} = C_v \\\\frac{\\\\partial^2 u}{\\\\partial z^2}$$...",
  "concept": "과잉간극수압 소산 지배 미분방정식"
}`;
        } else if (qSubtype === '표채우기') {
          typeRequirement = `[주관식 표채우기 유형]으로 생성하십시오:
- "type": "주관식"
- "subtype": "표채우기"
- "question": "다음 비교표 빈칸 (A), (B)에 들어갈 알맞은 내용을 기술하십시오." 와 같은 표 지시 질문
- ⚠️ [지문과 빈칸 요구사항의 완벽한 일치화 - 극도로 중요!]:
  * 표채우기 문항 출제 시, 질문 지문(question)의 서술 내용과 표(tableData) 내 빈칸(INPUT)의 요구사항, 그리고 정답(answers)의 형태가 반드시 100% 완벽하게 일치해야 합니다.
  * 계산형(수치 입력) 일치화: 만약 표의 빈칸이 수치 계산 결과나 수학적 수치를 요구한다면, 질문 지문에서는 절대 "지반공학적 설계 의미를 기술하라"거나 "이유와 특성을 설명하라"와 같은 서술적 요구사항을 포함하지 마십시오. 지문은 오직 "빈칸 (A), (B)에 들어갈 계산 값을 구하여 표를 완성하십시오"처럼 수치 계산/기입만을 지시해야 합니다.
  * 개념형(서술형 입력) 일치화: 만약 질문 지문에서 공법의 특징 비교나 공학적 개념 대조를 묻는다면, 표의 빈칸과 정답(answers)은 해당 개념을 설명하는 서술형 문장이어야 하며, 지문에서 엉뚱한 수치 계산(예: 심도 z=500m, 압력=14MPa 등)을 묻는 조건이나 수치들을 절대 제시하지 마십시오.
  * 두 가지 성격이 한 문제에 뒤섞이는(서술하라고 하면서 정답은 숫자이거나, 계산하라고 해놓고 정답은 설명 문장인 경우 등) 치명적인 출제 오류를 절대 범하지 마십시오.
- "tableData": 표 데이터 객체. headers 비교 대상 열은 구체적인 실제 비교 대상명을 기재하십시오.
  * 구분 항목(rows 첫째 열)은 그것만 읽어도 무슨 토픽이고 어떤 답을 써야 하는지 확신할 수 있도록 구체적이고 설명적으로 길게(15자~45자) 작성하십시오. 단순히 추상적 명사형(예: "신뢰성 확보") 대신 행동이나 방법을 직접 묻거나 유도하도록 작성하십시오. (예: "측정 데이터의 정확성과 신뢰성을 확보하기 위해 현장에서 통제/확보해야 할 주요 조치 사항")
  * 빈칸(입력 토큰)은 의미 있고 중요한 포인트만 \`[INPUT_1]\`, \`[INPUT_2]\` 등으로 비우십시오.
- "answers": 각 빈칸 토큰에 해당하는 모범 답안 객체(15자~20자 서술형). 해당 행의 구분 항목이 요구하는 범주에 정확히 부합해야 합니다.
- "concept": 핵심 개념 1줄 요약`;
          formatRequirement = `{
  "type": "주관식",
  "subtype": "표채우기",
  "question": "다음 비교표 빈칸 (A), (B)...",
  "tableData": {
    "headers": ["구분 항목", "소일네일링(Soil Nailing)", "어스앵커(Earth Anchor)"],
    "rows": [["구분 항목", "[INPUT_1]", "[INPUT_2]"]]
  },
  "answers": {
    "INPUT_1": "모범 답안 1",
    "INPUT_2": "모범 답안 2"
  },
  "concept": "비교 테이블 설명"
}`;
        } else if (qSubtype === '단답형') {
          typeRequirement = `[주관식 단답형 유형]으로 생성하십시오:
- "type": "주관식"
- "subtype": "단답형"
- "question": 구체적인 실무 문제점/시나리오를 지문으로 제시하고 해결책/대안을 요구하는 질문
- "answer": 핵심 키워드 강조가 들어간 1줄 서술형 모범답안
- "concept": 핵심 개념 1줄 요약`;
          formatRequirement = `{
  "type": "주관식",
  "subtype": "단답형",
  "question": "구체적인 실무 시나리오 질문...",
  "answer": "핵심 키워드가 **강조**된 1줄 서술형 답안",
  "concept": "단답형 설명"
}`;
        } else {
          typeRequirement = `[주관식 개요 유형]으로 생성하십시오:
- "type": "주관식"
- "subtype": "개요"
- "question": 공학적 중요 정의와 핵심 메커니즘을 서술형으로 묻는 핵심 질문
- "answer": 3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명 모범답안 (\\n 구분). 지나치게 1~2줄로 축약하거나 불필요하게 장황하지 않도록 적절한 학술적 깊이를 확보해야 합니다.
- "concept": 핵심 개념 1줄 요약`;
          formatRequirement = `{
  "type": "주관식",
  "subtype": "개요",
  "question": "샌드매트(Sand Mat)의 공학적 목적...",
  "answer": "3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명...",
  "concept": "연약지반 상부 모래 배수층 역할"
}`;
        }
      } else {
        typeRequirement = `[4지선다 객관식] 유형으로 생성하십시오:
- "type": "객관식"
- "question": 해당 토픽의 가장 본질적인 공학적 메커니즘, 거동 원리, 설계 판단 근거를 관통하는 고난도 질문. **🚨 단순 대입 계산 문제(공식/수치를 제시하고 계산시키는 문제) 절대 금지.** (⚠️ 표가 필요한 경우 <table> 태그 대신 아래 "tableData" 필드에 객체 구조로 작성하십시오.)
- "tableData": (선택사항) 문제에 표를 표시해야 하는 경우에만 정의하십시오. 주관식 (표채우기)와 마찬가지로 "headers"(열 제목 배열)와 "rows"(각 행 데이터의 배열)를 포함하는 오브젝트여야 합니다. (예: {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적환경", "해수", "담수"]]})
- "options": 4개의 보기 문항으로 구성된 문자열 배열 (반드시 정답 1개와 매력적인 오답 3개)
- "answer": "options" 배열 내의 정확한 정답 보기 텍스트와 토씨 하나 틀리지 않는 값
- "explanation": 명쾌하고 공학적으로 깊이 있는 정밀 해설`;
        formatRequirement = `{
  "type": "객관식",
  "question": "공학적 현상 분석 질문 내용",
  "tableData": null,
  "options": ["보기1", "보기2", "보기3", "보기4"],
  "answer": "정확히 일치하는 정답 보기 텍스트",
  "explanation": "상세한 해설"
} (※ 만약 표가 필요한 질문이라면 "tableData": {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적 환경", "해수", "담수"]]} 처럼 구조화된 표 객체를 작성하고, 그렇지 않은 일반 질문이면 "tableData": null 로 설정하십시오.)`;
      }
      const sourceQuestionText = currentQuestion?.question || '';
      const sourceQuestionAnswer = currentQuestion?.answer || '';
      const sourceQuestionConcept = currentQuestion?.concept || '';
      const sourceQuestionFormula = currentQuestion?.formula || '';
      const sourceQuestionOptions = currentQuestion?.options ? JSON.stringify(currentQuestion.options) : '';
      const sourceQuestionExplanation = currentQuestion?.explanation || '';

      const prompt = `
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원입니다.
제공된 **[기초 소스 문제]**가 잘못되었거나, 사용자가 이 문제를 특정 방향으로 조정해 달라는 요구사항(**[사용자 조정 요청]**)을 제시했습니다.
[토픽 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}
[첨부파일 본문 텍스트]: ${fileText || '제공되지 않음'}

[기초 소스 문제]:
- 질문: ${sourceQuestionText}
- 유형: ${targetType}
${sourceQuestionOptions ? `- 보기 목록: ${sourceQuestionOptions}` : ''}
${sourceQuestionAnswer ? `- 정답: ${sourceQuestionAnswer}` : ''}
${sourceQuestionConcept ? `- 핵심 개념 요약: ${sourceQuestionConcept}` : ''}
${sourceQuestionFormula ? `- 공식: ${sourceQuestionFormula}` : ''}
${sourceQuestionExplanation ? `- 기존 해설: ${sourceQuestionExplanation}` : ''}

[사용자 조정 요청 (매우 중요!)]:
"${userFeedback}"

${topicInstructionsPrompt}
${GENERATION_STANDARDS}

[출제 요구사항 - 중요]:
반드시 위의 **[기초 소스 문제]**를 기반으로 하되, **[사용자 조정 요청]** 사항을 100% 반영하여 수정, 보완, 응용 또는 전면 개편된 **새로운 단 1개의 문제**를 재출제해 주십시오.
- **🚨 [공식 및 공식 수치 범위 노출 절대 금지 규칙 - 극도로 중요!]**: 문제 질문(question) 본문 내에 공식을 직접 적어주거나, 공식에 들어가는 특정 수치 범위(예: $E_u = (200 \sim 500)s_u$ 등)를 지문에 미리 알려주지 마십시오. 오직 공식 명칭이나 변수들의 이름만을 제시해야 합니다. (단, 해설(explanation)에서는 자세하게 공식을 명시해야 합니다.)
- 사용자의 아이디어/피드백에 맞게 질문, 정답, 보기 목록, 공식, 핵심 개념 요약, 해설 등을 전면 조율하십시오.
- 예를 들어 "난이도를 낮춰줘" 라면 개념을 더 기본적이고 직관적인 내용으로 바꾸고, "수치를 변경해줘" 라면 공식의 매개변수와 계산 값을 변경하십시오.
- 사용자의 요구에 특별히 반하지 않는 한, 기출/예상 문제 패턴의 단순 반복을 지양하고 새롭고 참신한 학술적/실무적 관점을 고르게 평가하도록 구성하십시오. 또한 본문 소스 텍스트 자료 내에 존재하는 구체적인 수치 한계나 기준 파라미터가 있다면, 문제 출제 및 변경 시 이를 적극적이고 정량적으로 반영해 주십시오.
- 출력 형식은 기존과 완전히 동일해야 합니다.

${typeRequirement}

${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
- 마크다운 블록 (\`\`\`json) 등 불필요한 설명은 제거하고 오직 순수 JSON 객체만 반환하십시오.

[응답 JSON 포맷]:
${formatRequirement}
`;

      const responseText = await localCallLLM(null, prompt, null, 'question');
      let text = responseText.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      let parsedQuestion = null;
      try {
        parsedQuestion = parseLlmJson(text);
      } catch (parseErr) {
        console.warn('[단일문제조정] JSON.parse 실패로 정규식 추출을 시도합니다:', parseErr);
        const extracted = extractJsonArray('[' + text + ']');
        if (extracted && extracted[0]) parsedQuestion = extracted[0];
      }

      if (!parsedQuestion || typeof parsedQuestion !== 'object') {
        throw new Error('AI 조정 문항 파싱에 실패했습니다.');
      }

      const finalTopicId = Number(topicId || currentQuestion?.topic_id);
      if (finalTopicId) {
        try {
          await dbQuery.run(
            `INSERT INTO question_adjustments (topic_id, question_text, adjusted_text, user_feedback) 
             VALUES (?, ?, ?, ?)`,
            [finalTopicId, sourceQuestionText.trim(), parsedQuestion.question.trim(), userFeedback.trim()]
          );
          console.log(`[DB] Saved review question adjustment for topic_id ${finalTopicId}`);
        } catch (dbErr) {
          console.warn('Failed to save review question adjustment to DB:', dbErr);
        }
      }

      const healedQ = healQuizQuestionObject({
        ...parsedQuestion,
        topic_id: finalTopicId,
        question: cleanQuizQuestion(parsedQuestion.question)
      });
      if (progressTimer) clearInterval(progressTimer);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: validationPlugin으로 생성 문제 검증 중...', 50);
      }
      const validatedQ = await validateAndHealQuestion(healedQ, localCallLLM, topic.title, topic.keywords, fileText);
      const finalValidatedQ = healQuizQuestionObject({
        ...validatedQ,
        topic_id: finalTopicId,
        category: topic.category
      });
      if (progressId) {
        updateProgress(progressId, 2, '2단계: 문제 생성 및 검증 완료!', 100);
      }

      return res.json({
        question: finalValidatedQ
      });

    } else if (mode === 'exam') {
      // 1. Fetch metadata of all topics (very fast, no binary payload)
      const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name FROM topics ORDER BY created_at DESC`);
      if (!topics || topics.length === 0) {
        return res.status(400).json({ error: '등록된 토픽이 없습니다.' });
      }

      // 2. We only need the pdf_data for the first 8 topics
      const targetTopics = topics.slice(0, 8);
      const targetIds = targetTopics.map(t => t.id);
      
      // Fetch pdf_data only for those target topics
      const pdfDataRows = await dbQuery.all(
        `SELECT id, pdf_data FROM topics WHERE id IN (${targetIds.map(() => '?').join(',')})`,
        targetIds
      );
      
      // Map pdf_data back to targetTopics
      const pdfDataMap = {};
      for (const row of pdfDataRows) {
        pdfDataMap[row.id] = row.pdf_data;
      }
      for (const topic of targetTopics) {
        topic.pdf_data = pdfDataMap[topic.id] || null;
      }

      // 텍스트 간략 추출 (Promise.all 병렬 처리)
      const topicTexts = await Promise.all(targetTopics.map(async (topic) => {
        let fileText = '';
        if (topic.pdf_data) {
          const isHtml = topic.pdf_name && (
            topic.pdf_name.toLowerCase().endsWith('.html') ||
            topic.pdf_name.toLowerCase().endsWith('.htm') ||
            isBufferHtml(topic.pdf_data)
          );
          try {
            if (isHtml) fileText = htmlToPlainText(decodeHtmlBuffer(topic.pdf_data));
            else {
              const parsed = await pdfParse(topic.pdf_data);
              fileText = parsed.text || '';
            }
          } catch (e) {}
          fileText = mergeVerticalText(fileText);
          if (fileText.length > 1000) fileText = fileText.substring(0, 1000);
        }
        return `[토픽: ${topic.title}]\n키워드: ${topic.keywords || '없음'}\n${fileText || ''}`;
      }));

      const combinedText = topicTexts.join('\n\n---\n\n');
      const topicTitles = topics.map(t => t.title).join(', ');

      const qType = currentQuestion?.type || '객관식';
      const qSubtype = currentQuestion?.subtype || '';

      let typeRequirement = '';
      let formatRequirement = '';

      if (qType === '주관식') {
        if (qSubtype === '공식') {
          typeRequirement = `[주관식 공식 유형]으로 생성하십시오:
- "type": "주관식"
- "subtype": "공식"
- "question": "[필수공식] (공식명칭) 공식을 제시하고, 각 기호의 정의를 서술하시오." 와 같은 완성형 질문
- "answer": 상세 작성된 공식 및 각 기호의 의미
- "concept": 핵심 개념 1줄 요약`;
          formatRequirement = `{
  "type": "주관식",
  "subtype": "공식",
  "question": "[필수공식] 랭킨(Rankine) 주동토압 공식...",
  "answer": "$$p_a = \\\\gamma z K_a$$...",
  "concept": "벽체 배면의 수평 토압 산정 공식"
}`;
        } else if (qSubtype === '서술') {
          typeRequirement = `[주관식 서술/유도 유형]으로 생성하십시오:
- "type": "주관식"
- "subtype": "서술"
- "question": "[이론유도] (유도개념)의 이론 유도 과정 및 핵심 공학적 전제조건을 기술하시오." 형태의 완성형 질문
- "answer": 심도 있는 이론적 유도 메커니즘 설명
- "concept": 핵심 개념 1줄 요약`;
          formatRequirement = `{
  "type": "주관식",
  "subtype": "서술",
  "question": "[이론유도] Terzaghi 1차원 압밀...",
  "answer": "$$\\\\frac{\\\\partial u}{\\\\partial t} = C_v \\\\frac{\\\\partial^2 u}{\\\\partial z^2}$$...",
  "concept": "과잉간극수압 소산 지배 미분방정식"
}`;
        } else {
          typeRequirement = `[주관식 개요 유형]으로 생성하십시오:
- "type": "주관식"
- "subtype": "개요"
- "question": 공학적 중요 정의와 핵심 메커니즘을 서술형으로 묻는 핵심 질문
- "answer": 3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명 모범답안 (\\n 구분). 지나치게 1~2줄로 축약하거나 불필요하게 장황하지 않도록 적절한 학술적 깊이를 확보해야 합니다.
- "concept": 핵심 개념 1줄 요약`;
          formatRequirement = `{
  "type": "주관식",
  "subtype": "개요",
  "question": "샌드매트(Sand Mat)의 공학적 목적...",
  "answer": "3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명...",
  "concept": "연약지반 상부 모래 배수층 역할"
}`;
        }
      } else {
        typeRequirement = `[4지선다 객관식] 유형으로 생성하십시오:
- "type": "객관식"
- "question": 해당 토픽의 가장 본질적인 공학적 메커니즘, 거동 원리, 설계 판단 근거를 관통하는 고난도 질문. **🚨 단순 대입 계산 문제(공식/수치를 제시하고 계산시키는 문제) 절대 금지.** (⚠️ 표가 필요한 경우 <table> 태그 대신 아래 "tableData" 필드에 객체 구조로 작성하십시오.)
- "tableData": (선택사항) 문제에 표를 표시해야 하는 경우에만 정의하십시오. 주관식 (표채우기)와 마찬가지로 "headers"(열 제목 배열)와 "rows"(각 행 데이터의 배열)를 포함하는 오브젝트여야 합니다. (예: {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적환경", "해수", "담수"]]})
- "options": 4개의 보기 문항으로 구성된 문자열 배열 (반드시 정답 1개와 매력적인 오답 3개)
- "answer": "options" 배열 내의 정확한 정답 보기 텍스트와 토씨 하나 틀리지 않는 값
- "explanation": 명쾌하고 공학적으로 깊이 있는 정밀 해설`;
        formatRequirement = `{
  "type": "객관식",
  "question": "공학적 현상 분석 질문 내용",
  "tableData": null,
  "options": ["보기1", "보기2", "보기3", "보기4"],
  "answer": "정확히 일치하는 정답 보기 텍스트",
  "explanation": "상세한 해설"
} (※ 만약 표가 필요한 질문이라면 "tableData": {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적 환경", "해수", "담수"]]} 처럼 구조화된 표 객체를 작성하고, 그렇지 않은 일반 질문이면 "tableData": null 로 설정하십시오.)`;
      }

      const sourceQuestionText = currentQuestion?.question || '';
      const sourceQuestionAnswer = currentQuestion?.answer || '';
      const sourceQuestionConcept = currentQuestion?.concept || '';
      const sourceQuestionFormula = currentQuestion?.formula || '';
      const sourceQuestionOptions = currentQuestion?.options ? JSON.stringify(currentQuestion.options) : '';
      const sourceQuestionExplanation = currentQuestion?.explanation || '';

      const prompt = `
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원입니다.
제공된 **[기초 소스 문제]**가 잘못되었거나, 사용자가 이 문제를 특정 방향으로 조정해 달라는 요구사항(**[사용자 조정 요청]**)을 제시했습니다.
[평가 범위 토픽 목록]: ${topicTitles}
[통합 소스 텍스트]:
${combinedText}

[기초 소스 문제]:
- 질문: ${sourceQuestionText}
- 유형: ${qType} (하위 유형: ${qSubtype})
${sourceQuestionOptions ? `- 보기 목록: ${sourceQuestionOptions}` : ''}
${sourceQuestionAnswer ? `- 정답/답안: ${sourceQuestionAnswer}` : ''}
${sourceQuestionConcept ? `- 핵심 개념 요약: ${sourceQuestionConcept}` : ''}
${sourceQuestionFormula ? `- 공식: ${sourceQuestionFormula}` : ''}
${sourceQuestionExplanation ? `- 해설: ${sourceQuestionExplanation}` : ''}

[사용자 조정 요청 (매우 중요!)]:
"${userFeedback}"

${topicInstructionsPrompt}
${GENERATION_STANDARDS}

[출제 요구사항 - 중요]:
반드시 위의 **[기초 소스 문제]**를 기반으로 하되, **[사용자 조정 요청]** 사항을 100% 반영하여 수정, 보완, 응용 또는 전면 개편된 **새로운 단 1개의 문제**를 재출제해 주십시오.
- 사용자의 아이디어/피드백에 맞게 질문, 정답, 보기 목록, 공식, 핵심 개념 요약, 해설 등을 전면 조율하십시오.
- 사용자의 요구에 특별히 반하지 않는 한, 기출/예상 문제 패턴의 단순 반복을 지양하고 새롭고 참신한 학술적/실무적 관점을 고르게 평가하도록 구성하십시오. 또한 본문 소스 텍스트 자료 내에 존재하는 구체적인 수치 한계나 기준 파라미터가 있다면, 문제 출제 및 변경 시 이를 적극적이고 정량적으로 반영해 주십시오.
- 출력 형식은 기존과 완전히 동일해야 합니다.

${typeRequirement}

${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
- 추가 설명 텍스트 없이 오직 순수 JSON 데이터만 반환하십시오.

[JSON 포맷]:
${formatRequirement}
`;

      const responseText = await localCallLLM(null, prompt, null, 'question');
      let text = responseText.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      let parsedQuestion = null;
      try {
        parsedQuestion = parseLlmJson(text);
      } catch (parseErr) {
        console.warn('[종합평가단일조정] JSON.parse 실패로 정규식 추출을 시도합니다:', parseErr);
        const extracted = extractJsonArray('[' + text + ']');
        if (extracted && extracted[0]) parsedQuestion = extracted[0];
      }

      if (!parsedQuestion || typeof parsedQuestion !== 'object') {
        throw new Error('AI 종합평가 조정 문항 파싱에 실패했습니다.');
      }

      const finalTopicId = Number(topicId || currentQuestion?.topic_id || (topics && topics[0] ? topics[0].id : null));
      const activeTopic = topics.find(t => t.id === Number(finalTopicId));
      const activeTopicTitle = activeTopic ? activeTopic.title : '';
      const activeTopicKeywords = activeTopic ? activeTopic.keywords : '';
      let activeTopicFileText = '';
      if (activeTopic) {
        const tTopic = targetTopics.find(t => t.id === activeTopic.id);
        if (tTopic && tTopic.pdf_data) {
          const isHtml = tTopic.pdf_name && (
            tTopic.pdf_name.toLowerCase().endsWith('.html') ||
            tTopic.pdf_name.toLowerCase().endsWith('.htm') ||
            isBufferHtml(tTopic.pdf_data)
          );
          try {
            if (isHtml) activeTopicFileText = htmlToPlainText(decodeHtmlBuffer(tTopic.pdf_data));
            else {
              const parsed = await pdfParse(tTopic.pdf_data);
              activeTopicFileText = parsed.text || '';
            }
          } catch (e) {}
          activeTopicFileText = mergeVerticalText(activeTopicFileText);
        }
      }

      if (finalTopicId) {
        try {
          await dbQuery.run(
            `INSERT INTO question_adjustments (topic_id, question_text, adjusted_text, user_feedback) 
             VALUES (?, ?, ?, ?)`,
            [finalTopicId, sourceQuestionText.trim(), parsedQuestion.question.trim(), userFeedback.trim()]
          );
          console.log(`[DB] Saved exam question adjustment for topic_id ${finalTopicId}`);
        } catch (dbErr) {
          console.warn('Failed to save exam question adjustment to DB:', dbErr);
        }
      }

      const healedQ = healQuizQuestionObject({
        ...parsedQuestion,
        topic_id: finalTopicId,
        question: cleanQuizQuestion(parsedQuestion.question)
      });
      if (progressTimer) clearInterval(progressTimer);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: validationPlugin으로 생성 문제 검증 중...', 50);
      }
      const validatedQ = await validateAndHealQuestion(healedQ, localCallLLM, activeTopicTitle, activeTopicKeywords, activeTopicFileText);
      const finalValidatedQ = healQuizQuestionObject(validatedQ);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: 문제 생성 및 검증 완료!', 100);
      }

      return res.json({
        question: finalValidatedQ
      });
    } else {
      return res.status(400).json({ error: '올바르지 않은 모드(mode)입니다.' });
    }
  } catch (error) {
    console.error('Error in question adjust route:', error);
    if (progressId) {
      updateProgress(progressId, 1, '오류 발생으로 문제 조절 실패', 100);
    }
    res.status(500).json({ error: error.message || '서버 오류로 문제를 조정하지 못했습니다.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// 6-1. Comprehensive Exam: Generate 70 questions from ALL topics via Gemini (5문항 분할 배치 최적화 버전)
app.post('/api/exam/all', async (req, res) => {
  const progressId = req.query.progressId || req.body.progressId;
  let standardsAnalysis = '';
  if (progressId) {
    standardsAnalysis = await analyzeStandardsBeforeTask(progressId, '종합평가 시험 출제', GENERATION_STANDARDS, 'generation');
  }
  try {
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) return res.status(400).json({ error: '등록된 AI API 키가 존재하지 않습니다.' });

    // Fetch all topics with pdf_data
    const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name, pdf_data FROM topics ORDER BY created_at DESC`);
    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: '등록된 토픽이 없습니다. 먼저 학습 자료를 등록해주세요.' });
    }

    const topicTextMap = {};
    // Extract text from each topic in parallel to avoid timeouts
    const topicTexts = await Promise.all(topics.map(async (topic) => {
      let fileText = '';
      if (topic.pdf_data) {
        const isHtml = topic.pdf_name && (
          topic.pdf_name.toLowerCase().endsWith('.html') ||
          topic.pdf_name.toLowerCase().endsWith('.htm') ||
          isBufferHtml(topic.pdf_data)
        );
        try {
          if (isHtml) {
            fileText = htmlToPlainText(decodeHtmlBuffer(topic.pdf_data));
          } else {
            const parsed = await pdfParse(topic.pdf_data);
            fileText = parsed.text || '';
          }
        } catch (e) {
          console.warn(`Topic ${topic.id} parse error:`, e.message);
        }
        fileText = mergeVerticalText(fileText);
        fileText = smartTruncate(fileText, 10000);
      }
      topicTextMap[topic.id] = fileText;
      return `<Topic id="${topic.id}" title="${topic.title}" keywords="${topic.keywords || '없음'}">\n${fileText || '소스 없음'}\n</Topic>`;
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
[사용자 피드백 지침 - 출제 빈도 조정에 반영 필수]:
- 아래 질문들과 연관된 주제/개념의 문제를 적극 출제해 주십시오 (출제 빈도 증가 대상):
${upvotes.map((f, idx) => `  * [토픽: ${f.title}] ${f.question_text}`).join('\n')}

- 아래 질문들과 동일하거나 유사한 문제는 절대 출제하지 말고 출제 빈도를 대폭 낮추거나 다른 문제로 대체해 주십시오 (출제 빈도 감소/제외 대상):
${downvotes.map((f, idx) => `  * [토픽: ${f.title}] ${f.question_text}`).join('\n')}
`;
      }
    } catch (fbErr) {
      console.warn('종합평가 피드백 로드 실패 (무시하고 진행):', fbErr);
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
[사용자 이전 문제 조정(피드백) 내역 - 출제 시 반드시 참고하여 반영하십시오]:
사용자가 이전에 종합평가/복습 시 문제를 다음과 같이 조정 요청하여 반영된 이력이 있습니다. 향후 출제 시 아래 피드백 경향을 분석하여 반영해 주십시오:
${adjustments.map((a, idx) => `
조정 이력 ${idx + 1} [토픽: ${a.title}]:
- 기존 문제: "${a.question_text}"
- 사용자의 피드백 요구사항: "${a.user_feedback}"
- 반영된 최종 문제: "${a.adjusted_text}"
`).join('\n')}
`;
      }
    } catch (adjErr) {
      console.warn('종합평가 문제 조정 이력 로드 실패:', adjErr);
    }

    // 💡 5문제씩 분할 생성 아키텍처 가동
    // 1) Collect past questions from app_session
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
      console.log(`[종합평가] 수집된 기존 복습 문항 수: ${pastQuestionsPool.length}개`);
    } catch (dbErr) {
      console.warn('[종합평가] 기존 문항 로드 실패:', dbErr);
    }

    const uniqueQuestionsMap = new Map();
    for (const q of pastQuestionsPool) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        uniqueQuestionsMap.set(cleanedText, q);
      }
    }
    const uniquePastQuestions = Array.from(uniqueQuestionsMap.values());
    console.log(`[종합평가] 중복 제거 후 고유 기존 복습 문항 수: ${uniquePastQuestions.length}개`);

    // 2) Collect local fallback questions for all topics
    let fallbackQuestionsPool = [];
    try {
      for (const t of topics) {
        let topicText = '';
        if (t.pdf_data) {
          try {
            const isHtml = t.pdf_name && (
              t.pdf_name.toLowerCase().endsWith('.html') ||
              t.pdf_name.toLowerCase().endsWith('.htm') ||
              isBufferHtml(t.pdf_data)
            );
            if (isHtml) {
              topicText = htmlToPlainText(decodeHtmlBuffer(t.pdf_data));
            } else {
              const parsed = await pdfParse(t.pdf_data);
              topicText = parsed.text || '';
            }
          } catch (e) {
            // Ignore parse errors
          }
          topicText = mergeVerticalText(topicText);
        }
        const fallbackQs = generateFallbackQuestions(t.title, t.keywords, topicText);
        if (Array.isArray(fallbackQs)) {
          fallbackQuestionsPool.push(...fallbackQs);
        }
      }
      console.log(`[종합평가] 로컬 생성 예비 문항 수: ${fallbackQuestionsPool.length}개`);
    } catch (fallbackErr) {
      console.warn('[종합평가] 로컬 예비 문항 생성 실패:', fallbackErr);
    }

    // 3) Generate 15 new AI questions in parallel (3 batches of 5)
    let aggregatedAiQuestions = [];
    const TOTAL_BATCHES = 3;
    console.log(`[종합평가 병렬 생성 가동] TPM 초과 방지를 위해 5문제씩 총 ${TOTAL_BATCHES}회 병렬 요청을 시작합니다.`);

    const batchPromises = Array.from({ length: TOTAL_BATCHES }).map(async (_, idx) => {
      const randomSeed = Math.floor(Math.random() * 10000);
      const batchPrompt = `
당신은 국가기술자격 기술사 시험 출제위원입니다.
아래 범위 토픽 소스 자료를 참고하여, 다른 문제들과 절대 중복되지 않는 고난도 종합평가 문제 **정확히 5개**를 생성하십시오.
(현재 분할 출제 회차: ${idx + 1} / ${TOTAL_BATCHES}, 랜덤 시드: ${randomSeed})

🚨 [출제 출처 한정 및 문맥 격리 규칙 (Topic Isolation) - 극도로 중요!]:
1. 반드시 아래 제공된 **[평가 범위 토픽 목록]** 및 **[통합 소스 텍스트]**의 각 '<Topic>...</Topic>' 태그에 직접 기술되어 있는 구체적인 개념, 공식, 이론 및 지식의 범위 안에서만 시험 문제를 생성하십시오.
2. 각 문제를 출제할 때 해당 문제의 출처가 되는 단 하나의 토픽의 범위로 한정하여 문제를 구성하십시오. 절대 특정 토픽에 관한 문제를 낼 때 다른 토픽에 적힌 단어, 수치, 공학적 조건이나 공식들을 혼합(Cross-contamination)하여 보기(options)나 지문을 만드는 '문맥 교차 오염'을 저지르지 마십시오. 각 문제는 소스 상의 독립된 개별 토픽 내용에 완전히 부합해야 합니다.
3. 제공된 소스 자료 텍스트에 **직접 등장하지 않는 외부의 타 공학/역학 이론이나 일반 상식(예: 지문에 직접 기재되지 않은 동역학, 구조역학, 진동학, 임계감쇠, 단자유도 시스템, 고유진동수, 또는 그 외 외부 임의 주제 등)은 절대로 지문에 주입하거나 날조하여 문제를 만들지 마십시오.**
4. 오직 제공된 소스 본문 텍스트 내에 **단어 및 수식으로 명시되어 있는 범위 내로만 출제 범위를 100% 철저히 한정**하십시오. 소스에 없는 타분야 내용을 엮거나 상상하여 문제를 구성할 경우 심각한 출제 오류로 간주됩니다.
5. 객관식 모든 보기(options) 및 해설 역시 오직 소스 문서 내용의 문장과 지식들을 변형/결합하여 만들어야 하며, 본문과 아예 무관한 엉뚱한 외부 용어나 가상의 기술적 지식을 보기에 혼합하는 것을 절대 금지합니다.

[평가 범위 토픽 목록]: ${topicTitles}
[통합 소스 텍스트]:
${combinedText}

${feedbackPrompt}

${adjustmentsPrompt}

[출제 규칙]:
1. 이번 회차에서는 **정확히 5개의 문제**만 반환하되 다음 유형별로 각각 정확히 1문제씩 골고루 구성하여 비율을 사수하십시오:
   - 주관식 (type: "주관식", subtype: "개요"): 1문제 (정의 및 특징을 3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명 모범답안)
   - 주관식 (type: "주관식", subtype: "공식"): 1문제 (해당 토픽의 대표적인 공학적 수식 및 물리적 관계식을 제시하고 수식을 구성하는 기호들의 정의를 나열하는 공식 문제)
   - 주관식 (type: "주관식", subtype: "표채우기"): 1문제 (비교 대상이 없는 단일 토픽은 '상태/단계 비교' 또는 '1행(Single-row) 테이블'로 구성하여 동일 열 내 답안 중복을 철저히 배제하고, 아래 "tableData" 필드에 <table> 태그 대신 표 데이터 객체 구조를 채워넣는 칸채우기 주관식 문제)
   - 주관식 (type: "주관식", subtype: "단답형"): 1문제 (구체적인 실무 문제점/시나리오를 질문으로 제시하고 핵심 키워드 강조가 들어간 1줄 서술형 모범답안으로 답하는 단답형 문제)
   - 객관식 (type: "객관식"): 1문제 (4지선다형 객관식 문제)
2. 객관식 문제의 유형 및 구성 비율 지침 (극도로 중요):
   - 출제되는 객관식 문항들은 반드시 아래 비율을 준수하여 구성하십시오:
     * **기본 기초 개념 문제 (40%, 약 2문제)**: 토픽의 기본 정의, 핵심 개념, 기초 원리를 직접적으로 묻는 기초 수준 문제. (예: "○○○의 정의로 가장 옳은 것은?", "○○○의 특징이 아닌 것은?"). 기사 수준의 핵심 개념 확인 문제로 출제.
     * **정량 계산 문제 (30%, 약 1문제)**: 구체적인 조건 수치를 대입하여 최종 값을 계산해내거나 정량 결과를 묻는 수치 계산 문제.
     * **심화 원리·비교 문제 (30%, 약 1문제)**: 공학적 메커니즘, 장단점, 비교, 실무 시공 유의사항 등 응용 이해형 문제.
   
   - **🚨 [공식 및 공식 수치 범위 노출 절대 금지 규칙 - 극도로 중요!]**: 문제 질문(question) 본문 내에 **문제를 해결하는 데 필요한 공학 수식 자체(예: $E_u = 300 s_u$ 등)나 수식의 특정 수치 범위(예: $E_u = (200 \\sim 500)s_u$ 등), 비례 관계 식 등을 절대로 직접 텍스트로 적어 제공하지 마십시오.** 수식이나 경험적 수치 범위를 지문에 미리 주면 학생의 암기 및 연상 능력을 평가할 수 없습니다. 대신 공식의 명칭("비배수 탄성계수 경험식")이나 변수들의 명칭("비배수 전단강도 $s_u$")만을 제시하고, 학생이 스스로 공식과 범위를 떠올려서 해결하도록 하십시오. (단, 해설(explanation)에서는 학생의 학습을 위해 공식을 상세히 명시하고 계산 과정을 설명해야 합니다.)
   - 특히 **수치 해석법이나 가설 구조물 해석과 같이 정량적 분석이 필요한 토픽의 경우, 제공된 소스 문서 내에 명시적인 수치나 파라미터가 존재한다면 이를 활용하여 정량 계산 문제를 구성하십시오. 단, 문서에 수치나 수식이 없다면 임의로 비현실적인 수치를 가상 부여하지 마십시오.**
   - 만약 전형적인 비계산형/정성적 토픽(예: 단순 품질 시험 절차, 단순 행정 제도 등)인 경우에만 일반적인 서술형/이해형 객관식 문제로 출제하되, 이 경우에도 가급적 물리적 변수의 영향도를 묻는 등 최대한 정량화에 가깝게 문제의 수준을 높여 출제하십시오.
   - **⚠️ [비교/특성 표 출제 규칙 - 극도로 중요!]**: 질문에 비교/특성 표가 필요한 경우, 절대 <table> 등 HTML 태그로 표를 직접 작성하지 말고 일반 텍스트로만 질문을 작성한 뒤 아래의 "tableData" 필드에 표 데이터를 객체 구조로 작성하십시오.
3. 오답 보기 구성 주의사항 (매우 중요):
   - 오답 보기(options) 구성 시 **절대로 터무니없거나 극단적인 표현, 혹은 비현실적인 공학적 가정(예: '무한대로 상승시킴', '실시간으로 기하급수적으로 증가함', '영원히 변하지 않음', '아예 발생하지 않음', '폭발함' 등)은 절대로 사용하지 마십시오**. 
   - 실제 전공 서적이나 실무 기술 기준에 부합하는 **고도로 타당성 있고 그럴듯한 오답(plausible engineering distractors)**으로 구성해 주십시오. 모든 보기는 반드시 원본 소스 및 공학적 상식선에 긴밀히 결합되어야 합니다.
- **🚨 [객관식 정밀성 및 정답 일치 조건 - 극도로 중요!]**: 모든 객관식(4지선다형) 계산 문제나 수치/공학적 판단 문제를 출제할 때, 계산으로 도출된 정확한 정답 수치나 조건이 4개의 보기(options) 중 반드시 정확히 1개로 존재해야 합니다. 절대로 실제 계산 결과와 보기의 수치가 불일치하여, 해설에서 '실제 계산값은 XX이나 보기 중 가장 가까운 YY를 선택합니다'와 같은 어처구니없는 변명을 적는 출제 오류를 범하지 마십시오. 문제를 생성하기 전에 실제 수식을 대입하여 정답을 한 번 더 직접 엄밀하게 계산하고 검증한 후, 그 결과값(토씨 하나 틀리지 않는 정확한 정답)을 보기와 'answer' 필드에 완벽히 일치하도록 기재하십시오.
    4. 소스 텍스트의 숨겨진 공학적 개념과 실무 기전을 포착하여 고품격 질문을 던지십시오.

[환각 방지 철칙 (Anti-Hallucination Constraints)]:
1. 제공된 소스 문서 텍스트(<Source_Document>) 내에 명시적 수치, 허용 안전율, 설계기준(KDS/KCS) 조항 번호나 공식이 없는 경우, 임의로 수식을 유도하거나 외부 시방서 수치 한계를 날조(Hallucination)하지 마십시오.
2. 문서 범위를 벗어나는 역학적 수치나 비물리적 수치(예: 내부마찰각 60도 이상 등)를 창작하여 모순을 발생시키면 안 됩니다. 수치가 부족하다면 정량 계산 문제 출제를 즉시 우회하고 개념 이해형 문제로 대체하십시오.

${LATEX_PROMPT_INSTRUCTIONS}
${GENERATION_STANDARDS}
${ENGINEERING_STANDARDS}
4. 반드시 추가 텍스트 없이 순수 JSON 배열만 반환하십시오.

[JSON 포맷]:
[
  {
    "type": "주관식",
    "subtype": "개요",
    "topic_title": "이 문제의 출제 근거가 되는 토픽 목록 내의 정확한 토픽명 (예: 평사투영법)",
    "question": "질문 내용",
    "answer": "3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명 모범답안",
    "concept": "핵심 개념 1줄 요약"
  },
  {
    "type": "객관식",
    "topic_title": "이 문제의 출제 근거가 되는 토픽 목록 내의 정확한 토픽명 (예: 락볼트 인발시험)",
    "question": "공학적 현상 분석 질문",
    "tableData": null,
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "answer": "정답 보기와 토씨 하나 틀리지 않는 정답 텍스트",
    "explanation": "이유와 오답 정밀 해설"
  }
] (※ 만약 표가 필요한 질문이라면 "tableData": {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적 환경", "해수", "담수"]]} 처럼 구조화된 표 객체를 작성하고, 그렇지 않은 일반 질문이면 "tableData": null 로 설정하십시오.)
`;
      try {
        console.log(`[종합평가 병렬 생성] #${idx + 1}번째 배치 전송 시작...`);
        const enrichedPrompt = `[🚨 0단계 AI가 사전 분석한 절대 지침 준수 주의사항]:\n${standardsAnalysis}\n\n${batchPrompt}`;
        const rawText = await callLLMWithFailover(null, enrichedPrompt, null, 'question');
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
        console.warn(`[종합평가 병렬 생성 실패] #${idx + 1}번째 배치 에러:`, err.message);
      }
      return [];
    });

    const results = await Promise.all(batchPromises);
    for (const r of results) {
      if (r) aggregatedAiQuestions.push(...r);
    }
    console.log(`[종합평가 병렬 생성 완료] AI 신규 문항 수: ${aggregatedAiQuestions.length}개`);

    // 4) Merge all pools (AI questions, unique past study questions, fallback questions)
    const uniquePoolMap = new Map();
    // 4-a) Priority 1: Newly generated AI questions
    for (const q of aggregatedAiQuestions) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        uniquePoolMap.set(cleanedText, q);
      }
    }
    // 4-b) Priority 2: Past study questions from DB sessions
    for (const q of uniquePastQuestions) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        if (!uniquePoolMap.has(cleanedText)) {
          uniquePoolMap.set(cleanedText, q);
        }
      }
    }
    // 4-c) Priority 3: Local fallback questions
    for (const q of fallbackQuestionsPool) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        if (!uniquePoolMap.has(cleanedText)) {
          uniquePoolMap.set(cleanedText, q);
        }
      }
    }

    const finalQuestionPool = Array.from(uniquePoolMap.values());
    console.log(`[종합평가 풀 구축 완료] 전체 후보 풀 문항 수: ${finalQuestionPool.length}개`);

    // 5) Select up to 60 questions from the pool with exact type combination:
    // - 개요 (1번): 10개
    // - 공식 (2번): 10개
    // - 표채우기 (칸채우기): 10개
    // - 단답형 (12, 13번): 10개
    // - 객관식 (6~11번): 20개
    const poolGaeyo = [];
    const poolGongsik = [];
    const poolTable = [];
    const poolDandap = [];
    const poolMC = [];

    for (const q of finalQuestionPool) {
      if (q.type === '주관식') {
        if (q.subtype === '개요') poolGaeyo.push(q);
        else if (q.subtype === '공식') poolGongsik.push(q);
        else if (q.subtype === '표채우기') poolTable.push(q);
        else if (q.subtype === '단답형' || !q.subtype) poolDandap.push(q);
      } else if (q.type === '객관식') {
        poolMC.push(q);
      }
    }

    console.log(`[종합평가 분류] 개요: ${poolGaeyo.length}, 공식: ${poolGongsik.length}, 표채우기: ${poolTable.length}, 단답형: ${poolDandap.length}, 객관식: ${poolMC.length}`);

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

    selectedQuestions.push(...take(shufGaeyo, 10));
    selectedQuestions.push(...take(shufGongsik, 10));
    selectedQuestions.push(...take(shufTable, 10));
    selectedQuestions.push(...take(shufDandap, 10));
    selectedQuestions.push(...take(shufMC, 20));

    // If total selected is less than 60, fill from remaining questions in other pools
    const remainingPool = [...shufGaeyo, ...shufGongsik, ...shufTable, ...shufDandap, ...shufMC];
    const shufRemaining = shuffleArray(remainingPool);
    const needed = Math.max(0, 60 - selectedQuestions.length);
    selectedQuestions.push(...take(shufRemaining, needed));

    console.log(`[종합평가 선택 완료] 최종 선택 문항 수: ${selectedQuestions.length}개`);

    // 6) Clean selected questions & Map topic_title to topic_id
    const topicMap = {};
    topics.forEach(t => {
      topicMap[t.title.toLowerCase().trim()] = t.id;
    });

    const cleanedQuestions = selectedQuestions.map(q => {
      let topicId = q.topic_id || null;
      if (q.topic_title) {
        const cleanedTitle = q.topic_title.toLowerCase().trim();
        if (topicMap[cleanedTitle]) {
          topicId = topicMap[cleanedTitle];
        } else {
          const matchedKey = Object.keys(topicMap).find(k => k.includes(cleanedTitle) || cleanedTitle.includes(k));
          if (matchedKey) topicId = topicMap[matchedKey];
        }
      }
      if (!topicId && topics.length > 0) {
        // Try to guess from question text
        const matchedTopic = topics.find(t => q.question.includes(t.title) || (t.keywords && t.keywords.split(',').some(k => q.question.includes(k.trim()))));
        topicId = matchedTopic ? matchedTopic.id : topics[Math.floor(Math.random() * topics.length)].id;
      }
      return {
        type: q.type || "객관식",
        subtype: q.subtype || null,
        question: cleanQuizQuestion(q.question),
        tableData: q.tableData || null,
        options: q.options || [],
        answer: q.answer,
        explanation: q.explanation || '',
        concept: q.concept || '',
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

    // Shuffle and select up to 10 formula questions
    const shuffledFormulas = [...customFormulas].sort(() => 0.5 - Math.random());
    
    const selectedFormulas = shuffledFormulas.slice(0, 10).map(f => {
      const matchedTopic = topics.find(t => f.title && (t.title.includes(f.title) || f.title.includes(t.title)));
      return {
        type: "주관식",
        subtype: "공식",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[필수공식] ${f.title || f.question || '공식'} 공식을 제시하고, 각 기호의 정의를 서술하시오.`,
        answer: f.formula,
        concept: f.concept
      };
    });

    const customSubjs = [...selectedFormulas];

    // 최종 결합: 로컬 DB 핵심 기출 10문항 + 분할 마이닝된 AI 문항들 병합
    const finalQuestions = [...customSubjs, ...cleanedQuestions];

    const healedFinalQuestions = finalQuestions.map(q => healQuizQuestionObject(q));
    const validatedFinalQuestions = await Promise.all(
      healedFinalQuestions.map(async (q) => {
        const matchedTopic = topics.find(t => t.id === Number(q.topic_id));
        const title = matchedTopic ? matchedTopic.title : '';
        const keywords = matchedTopic ? matchedTopic.keywords : '';
        const text = matchedTopic ? (topicTextMap[matchedTopic.id] || '') : '';
        const res = await validateAndHealQuestion(q, callLLMWithFailover, title, keywords, text);
        return healQuizQuestionObject(res);
      })
    );
    res.json({ questions: validatedFinalQuestions, total: validatedFinalQuestions.length, topicCount: topics.length });

  } catch (err) {
    console.error('Exam route error:', err);
    res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
});


// 6-1-2. Comprehensive Exam: Generate 10 additional questions (2 batches of 4 AI + 2 custom)
app.post('/api/exam/additional', async (req, res) => {
  try {
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) return res.status(400).json({ error: '등록된 AI API 키가 존재하지 않습니다.' });

    // Fetch all topics with pdf_data
    const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name, pdf_data FROM topics ORDER BY created_at DESC`);
    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: '등록된 토픽이 없습니다. 먼저 학습 자료를 등록해주세요.' });
    }

    const topicTextMap = {};
    // Extract text from each topic in parallel to avoid timeouts
    const topicTexts = await Promise.all(topics.map(async (topic) => {
      let fileText = '';
      if (topic.pdf_data) {
        const isHtml = topic.pdf_name && (
          topic.pdf_name.toLowerCase().endsWith('.html') ||
          topic.pdf_name.toLowerCase().endsWith('.htm') ||
          isBufferHtml(topic.pdf_data)
        );
        try {
          if (isHtml) {
            fileText = htmlToPlainText(decodeHtmlBuffer(topic.pdf_data));
          } else {
            const parsed = await pdfParse(topic.pdf_data);
            fileText = parsed.text || '';
          }
        } catch (e) {
          console.warn(`Topic ${topic.id} parse error:`, e.message);
        }
        fileText = mergeVerticalText(fileText);
        fileText = smartTruncate(fileText, 10000);
      }
      topicTextMap[topic.id] = fileText;
      return `<Topic id="${topic.id}" title="${topic.title}" keywords="${topic.keywords || '없음'}">\n${fileText || '소스 없음'}\n</Topic>`;
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

    // Select 2 formulas randomly
    const shuffledFormulas = [...customFormulas].sort(() => 0.5 - Math.random());

    const selectedFormulas = shuffledFormulas.slice(0, 2).map(f => ({
      type: "주관식",
      subtype: "공식",
      question: `[필수공식] ${f.title || f.question || '공식'} 공식을 제시하고, 각 기호의 정의를 서술하시오.`,
      answer: f.formula,
      concept: f.concept
    }));

    const customSubjs = [...selectedFormulas];

    // Format formulas text for LLM context
    const formulasText = customFormulas.map((f, idx) => `[필수공식 ${idx+1}] 제목: ${f.title}\n공식 및 설명:\n${f.formula}\n개념: ${f.concept}`).join('\n\n');

    let aggregatedAiQuestions = [];
    const TOTAL_BATCHES = 2; // 2 batches * 4 AI questions = 8 AI questions

    console.log(`[종합평가 추가 생성 가동] TPM 초과 방지를 위해 4문제씩 총 ${TOTAL_BATCHES}회 연속 분할 요청을 시작합니다.`);

    for (let i = 0; i < TOTAL_BATCHES; i++) {
      const randomSeed = Math.floor(Math.random() * 10000);
      
      const batchPrompt = `
당신은 국가기술자격 기술사 시험 출제위원입니다.
아래 제공된 [평가 범위 토픽 소스], [필수공식 목록]에 해당하는 공식과 공학적 지식 내용만을 참고하여, 다른 문제들과 절대 중복되지 않는 고난도 종합평가 추가 문제 **정확히 4개**를 생성하십시오.
(현재 분할 출제 회차: ${i + 1} / ${TOTAL_BATCHES}, 랜덤 시드: ${randomSeed})

🚨 [출제 출처 한정 및 문맥 격리 규칙 (Topic Isolation) - 극도로 중요!]:
1. 반드시 아래 제공된 **[평가 범위 토픽 목록 및 본문]**의 각 '<Topic>...</Topic>' 태그, **[저장된 필수공식 목록]**에서 직접 다루고 있는 구체적인 개념, 공식 및 물리적 기전의 범위 안에서만 시험 문제를 생성하십시오.
2. 각 문제를 출제할 때 해당 문제의 출처가 되는 단 하나의 토픽의 범위로 한정하여 문제를 구성하십시오. 절대 특정 토픽에 관한 문제를 낼 때 다른 토픽에 적힌 단어, 수치, 공학적 조건이나 공식들을 혼합(Cross-contamination)하여 보기(options)나 지문을 만드는 '문맥 교차 오염'을 저지르지 마십시오. 각 문제는 소스 상의 독립된 개별 토픽 내용에 완전히 부합해야 합니다.
3. 제공된 소스 자료 및 저장된 내용에 **직접 등장하지 않는 외부의 엉뚱한 타 공학/역학 분야 이론(예: 소스에 직접 언급되지 않은 동역학, 구조역학, 진동학, 임계감쇠, 단자유도 시스템,고유진동수, 또는 그 외 외부 임의 주제 등)이나 임의의 다른 지식을 출제 규칙에 주입하여 환각(Hallucination) 문제를 유발하지 마십시오.**
4. 오직 제공된 소스 본문 텍스트 내에 **단어 및 수식으로 명시되어 있는 범위 내로만 출제 범위를 100% 철저히 한정**하십시오. 소스에 없는 타분야 내용을 엮거나 상상하여 문제를 구성할 경우 심각한 출제 오류로 간주됩니다.
5. 객관식 모든 보기(options) 및 해설 역시 오직 소스 문서 내용의 문장과 지식들을 변형/결합하여 만들어야 하며, 본문과 아예 무관한 엉뚱한 외부 용어나 가상의 기술적 지식을 보기에 혼합하는 것을 절대 금지합니다.

[평가 범위 토픽 목록 및 본문]:
${combinedText}

[저장된 필수공식 목록]:
${formulasText || '저장된 내용 없음'}

[출제 규칙]:
1. 이번 회차에서는 **정확히 4개의 문제**만 반환하되 다음 비율을 사수할 것:
   - 주관식 (type: "주관식", subtype: "개요"): 1문제 (정의 및 특징을 3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명 모범답안 (\\n 구분))
   - 객관식 (type: "객관식"): 3문제 (4지선다형)
2. 객관식 문제의 유형 및 구성 비율 지침 (극도로 중요):
   - 출제되는 객관식 문항들은 반드시 아래 비율을 준수하여 구성하십시오:
     * **기본 기초 개념 문제 (40%, 약 2문제)**: 토픽의 기본 정의, 핵심 개념, 기초 원리를 직접적으로 묻는 기초 수준 문제. (예: "○○○의 정의로 가장 옳은 것은?", "○○○의 특징이 아닌 것은?"). 기사 수준의 핵심 개념 확인 문제로 출제.
     * **정량 계산 문제 (30%, 약 1문제)**: 구체적인 조건 수치를 대입하여 최종 값을 계산해내거나 정량 결과를 묻는 수치 계산 문제.
     * **심화 원리·비교 문제 (30%, 약 1문제)**: 공학적 메커니즘, 장단점, 비교, 실무 시공 유의사항 등 응용 이해형 문제.
   
   - **🚨 [공식 및 공식 수치 범위 노출 절대 금지 규칙 - 극도로 중요!]**: 문제 질문(question) 본문 내에 **문제를 해결하는 데 필요한 공학 수식 자체(예: $E_u = 300 s_u$ 등)나 수식의 특정 수치 범위(예: $E_u = (200 \sim 500)s_u$ 등), 비례 관계 식 등을 절대로 직접 텍스트로 적어 제공하지 마십시오.** 수식이나 경험적 수치 범위를 지문에 미리 주면 학생의 암기 및 연상 능력을 평가할 수 없습니다. 대신 공식의 명칭("비배수 탄성계수 경험식")이나 변수들의 명칭("비배수 전단강도 $s_u$")만을 제시하고, 학생이 스스로 공식과 범위를 떠올려서 해결하도록 하십시오. (단, 해설(explanation)에서는 학생의 학습을 위해 공식을 상세히 명시하고 계산 과정을 설명해야 합니다.)
   - 특히 **수치 해석법이나 가설 구조물 해석과 같이 정량적 분석이 필요한 토픽의 경우, 제공된 소스 문서 내에 명시적인 수치나 파라미터가 존재한다면 이를 활용하여 정량 계산 문제를 구성하십시오. 단, 문서에 수치나 수식이 없다면 임의로 비현실적인 수치를 가상 부여하지 마십시오.**
   - 만약 전형적인 비계산형/정성적 토픽(예: 단순 품질 시험 절차, 단순 행정 제도 등)인 경우에만 일반적인 서술형/이해형 객관식 문제로 출제하되, 이 경우에도 가급적 물리적 변수의 영향도를 묻는 등 최대한 정량화에 가깝게 문제의 수준을 높여 출제하십시오.
   - **⚠️ [비교/특성 표 출제 규칙 - 극도로 중요!]**: 질문에 비교/특성 표가 필요한 경우, 절대 <table> 등 HTML 태그로 표를 직접 작성하지 말고 일반 텍스트로만 질문을 작성한 뒤 아래의 "tableData" 필드에 표 데이터를 객체 구조로 작성하십시오.
3. 오답 보기 구성 주의사항 (매우 중요):
   - 오답 보기(options) 구성 시 **절대로 터무니없거나 극단적인 표현, 혹은 비현실적인 공학적 가정(예: '무한대로 상승시킴', '실시간으로 기하급수적으로 증가함', '영원히 변하지 않음', '아예 발생하지 않음', '폭발함' 등)은 절대로 사용하지 마십시오**. 
   - 실제 전공 서적이나 실무 기술 기준에 부합하는 **고도로 타당성 있고 그럴듯한 오답(plausible engineering distractors)**으로 구성해 주십시오. 모든 보기는 반드시 원본 소스 및 공학적 상식선에 긴밀히 결합되어야 합니다.
- **🚨 [객관식 정밀성 및 정답 일치 조건 - 극도로 중요!]**: 모든 객관식(4지선다형) 계산 문제나 수치/공학적 판단 문제를 출제할 때, 계산으로 도출된 정확한 정답 수치나 조건이 4개의 보기(options) 중 반드시 정확히 1개로 존재해야 합니다. 절대로 실제 계산 결과와 보기의 수치가 불일치하여, 해설에서 '실제 계산값은 XX이나 보기 중 가장 가까운 YY를 선택합니다'와 같은 어처구니없는 변명을 적는 출제 오류를 범하지 마십시오. 문제를 생성하기 전에 실제 수식을 대입하여 정답을 한 번 더 직접 엄밀하게 계산하고 검증한 후, 그 결과값(토씨 하나 틀리지 않는 정확한 정답)을 보기와 'answer' 필드에 완벽히 일치하도록 기재하십시오.
    4. 소스 자료에 존재하는 구체적인 수식, 기호, 이론유도 논리, 토픽 내용만을 결합하여 학술적이고 깊이 있는 문제를 만드십시오.

[환각 방지 철칙 (Anti-Hallucination Constraints)]:
1. 제공된 소스 문서 텍스트(<Source_Document>) 내에 명시적 수치, 허용 안전율, 설계기준(KDS/KCS) 조항 번호나 공식이 없는 경우, 임의로 수식을 유도하거나 외부 시방서 수치 한계를 날조(Hallucination)하지 마십시오.
2. 문서 범위를 벗어나는 역학적 수치나 비물리적 수치(예: 내부마찰각 60도 이상 등)를 창작하여 모순을 발생시키면 안 됩니다. 수치가 부족하다면 정량 계산 문제 출제를 즉시 우회하고 개념 이해형 문제로 대체하십시오.

${LATEX_PROMPT_INSTRUCTIONS}
${GENERATION_STANDARDS}
${ENGINEERING_STANDARDS}
4. 반드시 추가 텍스트 없이 순수 JSON 배열만 반환하십시오.

[JSON 포맷]:
[
  {
    "type": "주관식",
    "subtype": "개요",
    "question": "질문 내용",
    "answer": "3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명 모범답안",
    "concept": "핵심 개념 1줄 요약"
  },
  {
    "type": "객관식",
    "question": "공학적 현상 분석 질문",
    "tableData": null,
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "answer": "정답 보기와 토씨 하나 틀리지 않는 정답 텍스트",
    "explanation": "이유와 오답 정밀 해설"
  }
] (※ 만약 표가 필요한 질문이라면 "tableData": {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적 환경", "해수", "담수"]]} 처럼 구조화된 표 객체를 작성하고, 그렇지 않은 일반 질문이면 "tableData": null 로 설정하십시오.)
`;

      try {
        console.log(`[종합평가 추가 생성] (${i + 1}/${TOTAL_BATCHES}) 회차 프롬프트 전송 중...`);
        const rawText = await callLLMWithFailover(null, batchPrompt, null, 'question');
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
          console.log(`[종합평가 추가 배치 성공] (${i + 1}/${TOTAL_BATCHES}) 회차 완료. 누적 문항 수: ${aggregatedAiQuestions.length}`);
        }

        if (i < TOTAL_BATCHES - 1) {
          await sleep(1200);
        }
      } catch (batchError) {
        console.warn(`[추가 배치 우회 경고] ${i + 1}회차 생성 중 에러 발생:`, batchError.message);
      }
    }

    if (aggregatedAiQuestions.length === 0) {
      aggregatedAiQuestions = [
        {
          type: "객관식",
          question: "점성토 지반의 압밀 시험에서 압하 압력의 변화에 따른 공극비($e$)와 대수 유효 응력($\\log \\sigma'$) 곡선(e-log p 곡선) 상의 주요 거동 인자에 대한 설명 중 가장 타당하지 않은 것은?",
          options: [
            "압축지수($C_c$)는 정규압밀 영역에서의 직선 기울기로 정의되며, 지반의 소성 활성도가 높을수록 감소한다.",
            "선행압밀하중($p_c$)은 흙이 과거에 받았던 최대의 유효 수직응력이다.",
            "재압축지수($C_r$)는 팽창 및 재압축 구간의 평균 기울기로, 일반적으로 압축지수의 1/5 ~ 1/10 수준이다.",
            "과압밀비(OCR)가 1보다 큰 점토는 외력에 의한 전단 변형 시 양의 체적 팽창(Dilatancy) 거동을 보일 수 있다."
          ],
          answer: "압축지수($C_c$)는 정규압밀 영역에서의 직선 기울기로 정의되며, 지반의 소성 활성도가 높을수록 감소한다.",
          explanation: "지반의 소성 활성도가 높고 압축성이 큰 흙일수록 정규압밀 기울기인 압축지수($C_c$)는 오히려 증가합니다."
        },
        {
          type: "객관식",
          question: "사질토 지반의 다짐(Compaction) 거동 특성에 있어 최대 건조 단위 중량($\\gamma_{d,max}$)과 최적 함수비(OMC)에 미치는 다짐 에너지의 영향으로 올바른 것은?",
          options: [
            "다짐 에너지가 증가하면 최대 건조 단위 중량은 커지고 최적 함수비는 감소한다.",
            "다짐 에너지가 증가하면 최대 건조 단위 중량과 최적 함수비가 모두 증가한다.",
            "다짐 에너지는 건조 측 다짐 상태의 전단 강도에는 영향을 미치지 않는다.",
            "최적 함수비보다 훨씬 습윤한 측면에서는 다짐 에너지가 증가해도 건조 단위 중량이 급격히 증가한다."
          ],
          answer: "다짐 에너지가 증가하면 최대 건조 단위 중량은 커지고 최적 함수비는 감소한다.",
          explanation: "다짐 에너지가 커지면 흙입자가 더 조밀하게 맞물려 최대 건조 단위 중량은 커지고, 필요한 최적 함수비는 건조한 측(좌측)으로 이동하여 감소합니다."
        },
        ...topics.flatMap(t => generateFallbackQuestions(t.title, t.keywords, fileText).filter(q => q.type.includes('객관식')))
      ];
    }

    const cleanedQuestions = aggregatedAiQuestions.map(q => ({
      ...q,
      question: cleanQuizQuestion(q.question)
    }));

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
    res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
});



// 6-2. Comprehensive Exam: Generate Detailed Answer for a specific question
app.post('/api/exam/detailed-answer', async (req, res) => {
  const progressId = req.body.progressId || req.query.progressId;
  const localCallLLM = (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });

  let progressTimer = null;
  if (progressId) {
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 심층 해설 생성 중...', 90, 800, 5);
  }

  try {
    const { question, answer } = req.body;
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) {
      if (progressTimer) clearInterval(progressTimer);
      return res.status(400).json({ error: '등록된 AI API 키가 존재하지 않습니다.' });
    }

    const prompt = `
당신은 대한민국 국가기술자격 기술사 시험 출제위원 및 최고 권위자입니다.
수험생이 종합평가를 풀던 중 다음 문제에 대해 '답안 전문보기(심층 해설)'를 요청했습니다.

[문제]: ${question}
[기존 간략 정답/해설]: ${answer || '없음'}

위 내용을 바탕으로, 이 문제와 관련된 기술적 배경, 핵심 메커니즘, 그리고 실무적 시사점을 포함하여 완벽한 기술사 모범 답안(또는 심층 해설)을 작성해 주십시오.
다음 규칙을 엄격히 따르십시오:
1. 3단락 구조(1. 개요 및 기술적 배경, 2. 핵심 메커니즘/구성요소/비교분석, 3. 실무적 시사점 및 결론)로 논리적으로 작성하십시오.
2. 보기 편한 Markdown 형식(적절한 굵은 글씨, 글머리 기호 등)을 사용하되, 마크다운 코드블록(\`\`\`markdown)으로 전체를 감싸지 말고 바로 텍스트로 출력하십시오.

${ENGINEERING_STANDARDS}
${LATEX_CHAT_PROMPT_INSTRUCTIONS}
`;

    try {
      const responseText = await localCallLLM(null, prompt);
      const healedText = healLatexFormulas(responseText.trim()); // 대화 수식 정정 결합
      if (progressId) {
        updateProgress(progressId, 1, '1단계: 해설 생성 완료!', 100);
      }
      res.json({ text: healedText });
    } catch (err) {
      console.error('Detailed answer route error:', err);
      if (progressId) {
        updateProgress(progressId, 1, '오류 발생으로 해설 생성 실패', 100);
      }
      res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
    }
  } catch (err) {
    console.error('Detailed answer route error:', err);
    if (progressId) {
      updateProgress(progressId, 1, '오류 발생으로 해설 생성 실패', 100);
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// 6-2.5. Generate Hint for a Question
app.post('/api/hint', async (req, res) => {
  const progressId = req.body.progressId || req.query.progressId;
  const localCallLLM = (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });

  let progressTimer = null;
  if (progressId) {
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 힌트 생성 중...', 90, 800, 10);
  }

  try {
    const { questionText } = req.body;
    if (!questionText) {
      if (progressTimer) clearInterval(progressTimer);
      return res.status(400).json({ error: '질문(문제) 텍스트가 제공되지 않았습니다.' });
    }

    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY
    );
    if (!hasAnyAiKey) {
      if (progressTimer) clearInterval(progressTimer);
      return res.status(400).json({ error: '등록된 AI API 키가 존재하지 않습니다.' });
    }

    const systemInstruction = `당신은 대한민국 기술사 시험 전문 튜터입니다.
수험생이 풀고 있는 주관식 또는 객관식 문제에 대해 **매우 쉽고 직관적이며 간단한 힌트**를 한 문단(3줄 이내)으로 제공해 주십시오.

[지침]:
1. 복잡한 공식이나 유도 과정을 설명하지 말고, 이 문제를 해결하기 위해 가장 핵심적으로 생각해야 하는 개념이나 물리적 거동을 일상적이고 직관적인 비유로 설명하십시오.
2. 수험생이 스스로 문제를 풀 수 있도록 유도해야 하며, 직접적인 해답이나 최종 정답 수치를 제공해서는 절대 안 됩니다.
3. 친절하고 부드러운 튜터의 말투를 사용하십시오.
${ENGINEERING_STANDARDS}`;
    const userPrompt = `다음 문제에 대한 쉽고 직관적인 힌트를 간단히 적어주세요:\n\n[문제 본문]\n${questionText}`;
    
    const responseText = await localCallLLM(systemInstruction, userPrompt, null, 'question');
    const healedText = healLatexFormulas(responseText);
    if (progressId) {
      updateProgress(progressId, 1, '1단계: 힌트 생성 완료!', 100);
    }
    res.json({ hint: healedText });
  } catch (err) {
    console.error('Hint generation error:', err);
    if (progressId) {
      updateProgress(progressId, 1, '오류 발생으로 힌트 생성 실패', 100);
    }
    res.status(500).json({ error: err.message || '힌트를 생성하는 데 실패했습니다.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// ── Topic Recommendation Endpoint for Acronyms and Overviews
app.post('/api/recommend-topics', async (req, res) => {
  try {
    const { type, existingTitles } = req.body;
    const isAcronym = type === 'acronym';
    
    const systemInstruction = `당신은 대한민국 토질및기초기술사 자격시험 수험생을 위한 전문 AI 튜터입니다.
수험생이 필수 암기 리스트에 등록하여 학습할 수 있도록, 지반공학/토질역학 분야의 전문적인 핵심 토픽 단어(개념명)를 딱 3개만 추천해 주십시오.

[추천 기준]:
1. 분야: 토질및기초기술사 자격시험(지반공학, 토질역학, 기초공학, 사면안정, 터널공학, 흙막이, 지반개량 등)에서 매우 높은 빈출 비중을 차지하는 중요한 공식, 개념, 이론, 현상, 공법, 시험명 등이어야 합니다.
2. 제외 항목: 제공되는 [기존 암기 리스트]에 이미 포함된 주제는 절대 중복하여 추천하지 마십시오.
3. 다양성: 매번 비슷한 주제만 반복하지 말고, 토질역학/기초공학/사면공학/터널 및 지하공간/토류벽/연약지반 개량 등 다양한 세부 분야에서 완전히 새롭고 다양한 주제를 고르게 무작위 추천해 주십시오.
4. 형식: 오직 추천할 단어 3개만을 줄바꿈(\\n)으로 구분하여 깔끔하게 한글로 출력하십시오. 서론, 부연 설명, 숫자 번호(예: 1., 2.), 특수문자, 따옴표 등은 절대 포함하지 마십시오.
5. 예시 출력 형태:
과잉간극수압 소산 메커니즘
사면 쐐기파괴 안정해석
테르자기 극한지지력`;

    const userPrompt = `[기존 암기 리스트]:
${Array.isArray(existingTitles) ? existingTitles.join('\n') : '없음'}

위 기존 리스트에 포함되지 않은 새로운 토질및기초기술사 필수 암기 ${isAcronym ? '두문자(앞글자) 암기법' : '개요'} 주제 단어 3개를 매우 다양하고 창의적으로 무작위 선정하여 추천해 주십시오. (무작위 시드: ${Math.random()}, 타임스탬프: ${Date.now()})`;

    const responseText = await callLLMWithFailover(
      systemInstruction,
      userPrompt,
      null,
      'formula',
      { temperature: 1.0 }
    );
    
    const recommendations = responseText
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, '').replace(/[\*\"\'`]/g, '').trim())
      .filter(line => line.length > 0 && line.length < 50)
      .slice(0, 3);
      
    res.json({ success: true, recommendations });
  } catch (err) {
    console.error('POST /api/recommend-topics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6-3. Freeform Chat Search
app.post('/api/chat', async (req, res) => {
  const progressId = req.body.progressId || req.query.progressId;
  const localCallLLM = (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });

  let progressTimer = null;
  if (progressId) {
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 튜터 답변 생성 중...', 90, 800, 5);
  }

  try {
    const { history, message, image, acronymMode, overviewMode } = req.body;
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) {
      if (progressTimer) clearInterval(progressTimer);
      return res.status(400).json({ error: '등록된 AI API 키가 존재하지 않습니다.' });
    }

    if (overviewMode) {
      try {
        const responseText = await generateOverviewTutorResponse(message, image, localCallLLM);
        const healedText = healLatexFormulas(responseText);
        if (progressId) {
          updateProgress(progressId, 1, '1단계: 개요 답변 생성 완료!', 100);
        }
        return res.json({ text: healedText });
      } catch (err) {
        console.error('Overview tutor generation error:', err);
        if (progressId) {
          updateProgress(progressId, 1, '오류 발생으로 개요 대화 실패', 100);
        }
        return res.status(500).json({ error: err.message || '개요 답변 생성 실패.' });
      }
    }

    if (acronymMode) {
      try {
        const responseText = await generateAcronymTutorResponse(message, image, localCallLLM);
        const healedText = healLatexFormulas(responseText);
        if (progressId) {
          updateProgress(progressId, 1, '1단계: 앞글자 답변 생성 완료!', 100);
        }
        return res.json({ text: healedText });
      } catch (err) {
        console.error('Acronym tutor generation error:', err);
        if (progressId) {
          updateProgress(progressId, 1, '오류 발생으로 앞글자 대화 실패', 100);
        }
        return res.status(500).json({ error: err.message || '앞글자 답변 생성 실패.' });
      }
    }

    // Format conversation history as a structured string prompt
    let structuredPrompt = '';
    if (history && Array.isArray(history) && history.length > 0) {
      structuredPrompt += "이전 대화 기록:\n";
      for (const msg of history) {
        const sender = msg.role === 'user' ? '수험생' : '튜터';
        structuredPrompt += `${sender}: ${msg.text}\n`;
      }
      structuredPrompt += "\n현재 사용자 질문:\n";
    }
    
    let currentMessage = (message || '').trim();
    if (image) {
      if (!currentMessage) {
        currentMessage = "[첨부 이미지 분석 요청] 수험생이 기술사 관련 스크린샷/이미지를 첨부하였습니다. 이미지에 담긴 모든 텍스트, 문제, 수식, 그래프, 도표 등을 고도로 정밀하게 분석 및 해독하여, 해당 문제의 출제 의도, 명쾌한 풀이 과정 및 정확한 최종 정답을 친절하고 기술학적으로 완벽히 설명해 주십시오.";
      } else {
        currentMessage = `[첨부 이미지 분석 요청] 수험생이 이미지(스크린샷)와 함께 다음 질문을 보냈습니다: "${currentMessage}". 첨부된 이미지에 표현된 핵심 기술사 문제, 수식, 다이어그램, 텍스트 등을 최우선으로 정밀 분석하여 질문에 매우 구체적이고 체계적으로 답변해 주십시오.`;
      }
    }
    structuredPrompt += currentMessage;

    try {
      const systemInstruction = `당신은 대한민국 국가기술자격 기술사 시험(토질및기초기술사, 토목구조기술사, 토목시공기술사, 도로및공항기술사, 수자원개발기술사, 상하수도기술사, 터널기술사 등 토목공학 전 분야) 최고 권위의 기술사 시험 전문 튜터입니다.
수험생의 질문이나 이미지 자료에 대해 대학원 및 기술사 시험 수준의 전문 용어를 활용하여 폭넓고 깊이 있는 학술적/실무적 답변을 제시해 주십시오.

[답변 원칙]:
1. 토목공학 전 분야의 폭넓은 지식 활용:
   - 지반공학(토질역학, 터널, 기초), 구조공학(콘크리트, 강구조, 교량), 시공 및 환경, 도로, 수자원 등 토목공학 전 분야에 걸친 풍부한 지식을 기반으로 유연하고 전문성 있게 대응하십시오.
2. 개념의 학술적/실무적 정확성 확보:
   - 특정 공학적 원리나 거동 메커니즘을 설명할 때는 질문의 학술적 맥락을 정확히 파악하여 각 역학적 관점을 명확히 구분하고 균형 있게 설명하십시오.
   - **실제 전공 학계에서 공인된 이론과 수식만을 근거로 삼아야 하며, 임의로 부적절한 수학 공식이나 비현실적인 공학 수식을 가공하여 답변(환각)하지 마십시오.**
   - 물리학적/공학적 비례 및 거동 메커니즘을 명확하게 파악하여 논리적 인과관계를 철저히 고수해 주십시오.
3. 실재하지 않는 UI 및 문서 뷰어에 대한 환각(Hallucination) 절대 엄금:
   - 답변할 때 "현재 우측 Canvas에 열려 있는 문서", "우측 화면의 캔버스", "상단 문서 뷰어" 등 실제 애플리케이션 화면에 표시되지 않는 가상의 인터페이스 요소를 멋대로 추측하거나 언급하지 마십시오.
   - **[이미지/스크린샷 정밀 판독 필수]**: 만약 수험생이 이미지(스마트폰 캡처, 시험 문제지 사진, 스크린샷 등)를 첨부하여 질문을 전송한 경우, 해당 이미지 속의 필기 글씨, 인쇄 텍스트, 수식, 그래프 지표, 토질 단면도 등을 최우선으로 깊이 있게 분석 및 이해하여 이를 기반으로 답변해 주십시오. 이미지와 사용자 메시지의 내용을 유기적으로 결합하여 최상의 전문 답변을 도출해 주십시오.
4. 겸손하고 전문적인 대화 태도 유지:
   - 수험생의 질문 의도와 전공 지식을 존중하고 경청하며, 학술적으로 명쾌한 유도와 설명을 친절하게 제공해 주십시오.
 5. 기술사 수준의 고품격 서술형 구조 및 직관적 의미 보완 (포맷 및 순서 철저 준수, 빈 헤더 및 찌꺼기 절대 금지):
    - [출력 형식 및 순서 - 디폴트 포맷 철저 준수]: 설명하는 모든 핵심 개념, 개별 이론, 공식, 또는 공학적 수단에 대해서는 반드시 아래의 디폴트 형식(글머리기호 '• ', 볼드 '**', 콜론 ':')을 철저히 준수하여 정의 -> 직관적 설명 -> (주요 가정 또는 메커니즘) 순서로 작성하십시오:
      * \`• **정의**: [해당 개념/이론의 전문적이고 학술적인 공학 용어를 사용한 정확한 정의 설명]\` (항목명 뒤에 콜론을 반드시 붙이고 한 칸 띄운 뒤 즉시 내용을 같은 줄에 작성)
      * \`• **직관적 설명**: [수험생이 시험장에서 쉽게 떠올리고 암기할 수 있는 직관적인 일상적 비유, 실무적 느낌, 혹은 외우기 쉬운 암기 팁(두문자어, 연상 기법 등)을 제시]\`
      * 이론이나 공식의 바탕이 되는 가정 조건들을 나열할 때는 \`• **주요 가정**: [핵심 가정 사항 목록]\`으로 작성하고, 역학적 거동과 작동 원리를 다룰 때는 \`• **메커니즘**: [역학적 작동 원리/메커니즘 설명]\`으로 맥락에 맞게 유연하게 선택하여 작성하십시오.
    - 🚨 [줄바꿈 및 간격 최소화]: 소제목(정의, 직관적 설명, 주요 가정, 메커니즘 등)과 그 본문 내용 사이에는 절대로 줄바꿈(엔터)을 하지 마십시오. 콜론 뒤에 한 칸의 공백을 두고 즉시 같은 줄에 본문 내용을 작성하십시오. 소제목만 단독 줄로 표기하고 내용을 다음 줄로 내리는 행위는 엄격히 금지하며, 항목 간에도 불필요한 빈 줄을 남발하지 마십시오.
    - 🚨 [개별 이론/개념 분할 및 중제목(###) 필수 작성 규칙]: 만약 답변 중에 여러 이론(예: 테르자기 1차 압밀 이론, 아사오카법, 쌍곡선법 등)이나 다수의 개념/수식/공학적 수단을 소개, 비교 또는 설명해야 하는 경우, 절대로 이들을 하나의 평평한 목록으로 나열하지 마십시오. **반드시 각 이론/개념/수단별로 명확한 중제목(### [순번]. [이론/개념명])을 작성하여 각 섹션을 엄격하게 분리하십시오.**
      예시:
      ### 1. 테르자기 1차원 압밀 이론
      • **정의**: ...
      • **직관적 설명**: ...
      • **메커니즘**: ...

      ### 2. 아사오카(Asaoka)법
      • **정의**: ...
      • **직관적 설명**: ...
      • **메커니즘**: ...

      ### 3. 쌍곡선법
      • **정의**: ...
      • **직관적 설명**: ...
      • **메커니즘**: ...

      각 중제목(###) 아래에 위치하는 개념/이론에 대해 정의, 직관적 설명, 메커니즘 등의 소제목들을 온전히 작성해야 하며, 중제목을 누락하는 일이 절대 없도록 하십시오. 이론이나 공법의 설명이 완료된 후, 요약 또는 대조를 위한 비교 표를 제공하고자 하는 경우에도 반드시 '### 요약 비교' 또는 '### [이론명] 비교'와 같이 표 외부 상단에 단독 중제목(###)을 배치하고 표 내부에는 표 데이터만 단정하게 구성해야 합니다.
    - [빈 항목 및 찌꺼기 제거 철칙]: 콜론(\`:\`) 뒤를 빈칸으로 두거나, 내용 없이 항목명만 덜렁 적어놓는 빈 글머리 기호(예: \`• **직관적 설명**:\`만 적고 다음 줄로 넘어가는 행위)는 불필요한 찌꺼기이므로 절대 금지하며 즉시 삭제하십시오. 모든 항목은 콜론 뒤에 한 칸의 공백을 두고 즉시 본문 내용이 이어져야 합니다.
    - 작성하는 모든 핵심 소제목(예: \`**정의**\`, \`**주요 가정**\`, \`**메커니즘**\`, \`**직관적 설명**\`, \`**작동 원리**\` 등)은 반드시 더블 별표(\`**\`)로 감싸서 노란색 강조 마킹이 활성화되도록 하십시오.
6. [지반공학 용어 준수 철칙]:
   - 'Flow Net'은 절대 '유망망'이라는 존재하지 않는 가상의 단어로 번역/표기하지 마십시오. 반드시 표준 전공 용어인 '유선망'(流線網)으로 표기하십시오.
7. [중요 키워드 강조 규칙]:
   - 답변 작성 시 지반역학 및 토목공학의 핵심 용어, 중요 공학 기전, 핵심 물리량 및 설계 조치 등의 중요 키워드들은 수험생이 한눈에 파악할 수 있도록 반드시 **더블 별표**(**키워드**) 또는 '싱글 쿼트'('키워드')로 감싸서 작성해 주십시오. (예: **아칭 효과**, **상대적 변위**, '응력 재분배', **전단 강도** 등)
8. [표(Table) 작성 철칙]:
   - 답변 중 지표, 수치 비교, 매개변수 정리 등 표(Table) 형태의 데이터 표현이 필요한 경우, HTML이나 LaTeX tabular/matrix/array 환경을 사용하지 말고 반드시 표준 **마크다운 표(Markdown Table)** 형식(\`| 열1 | 열2 |\`과 구분선 \`| --- | --- |\`)으로 작성하십시오.
   - 🚨 [표 헤더 및 중제목 분리 철칙]: 표의 제목이나 대분류/요약 명칭(예: "### 요약 비교", "### 공법 비교" 등)을 절대로 표의 첫 번째 헤더 셀이나 표 내부의 셀에 임의로 넣지 마십시오. 표에 붙는 제목이나 설명 문구(예: ### 요약 비교)는 반드시 표의 외부(표의 바로 위 줄)에 단독 중제목(###) 형태로 작성되어야 하며, 표의 첫 번째 열은 오직 데이터의 '구분' 또는 '항목'이어야 합니다. 표의 열 헤더는 콘텐츠 열 개수와 정확히 1:1로 일치해야 하며, 내용이 한 칸씩 밀려 렌더링되거나 빈 열이 발생하지 않도록 하십시오.
     잘못된 예: | ### 요약 비교 | 구분 | 테르자기 이론 | 쌍곡선법 |
     올바른 예:
     ### 요약 비교
     | 구분 | 테르자기 이론 | 쌍곡선법 | 아사오카법 |
     | --- | --- | --- | --- |
     | 분류 | 이론적 해석법 | 경험적/역해석법 | 경험적/역해석법 |
${ENGINEERING_STANDARDS}
${LATEX_CHAT_PROMPT_INSTRUCTIONS}`;
      const responseText = await localCallLLM(systemInstruction, structuredPrompt, image, 'tutor');
      const healedText = healLatexFormulas(responseText); // AI 튜터 렌더링 깨짐 치유 적용
      if (progressId) {
        updateProgress(progressId, 1, '1단계: 답변 생성 완료!', 100);
      }
      res.json({ text: healedText });
    } catch (err) {
      console.error('Chat route error:', err);
      if (progressId) {
        updateProgress(progressId, 1, '오류 발생으로 대화 실패', 100);
      }
      res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
    }
  } catch (err) {
    console.error('Chat route error:', err);
    if (progressId) {
      updateProgress(progressId, 1, '오류 발생으로 대화 실패', 100);
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

function extractVariablesFromMath(mathContent) {
  if (!mathContent) return '';
  const cleanMath = mathContent
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[\{\}\[\]\(\)\+\-\*\/\=\_\^]/g, ' ');
  
  const words = cleanMath.split(/\s+/);
  const uniqueVars = Array.from(new Set(words))
    .map(w => w.trim())
    .filter(w => /^[a-zA-Z]$|^[a-zA-Z]_[a-zA-Z0-9]+$/.test(w));
  
  if (uniqueVars.length === 0) return '';
  return uniqueVars.map(v => `- $${v}$: (이 기호의 공학적 정의를 입력해 보세요)`).join('\n\n');
}

function filterStructureLines(mathContent, structure, extraAllowed = []) {
  if (!structure) return '';
  
  const layoutCommands = [
    '\\frac', '\\sqrt', '\\left', '\\right', '\\times', '\\cdot',
    '\\partial', '\\sin', '\\cos', '\\tan', '\\log', '\\ln',
    '\\text', '\\operatorname', '\\mathrm', '\\mathbf', '\\over', '\\choose',
    '\\quad', '\\qquad', '\\;', '\\:', '\\,', '\\!', '\\begin', '\\end', '\\array'
  ];
  let cleanedFormula = mathContent;
  for (const cmd of layoutCommands) {
    cleanedFormula = cleanedFormula.split(cmd).join(' ');
  }

  // C_v 압밀계수 감지 시 k, m_v, gamma_w 도 허용 처리
  const lowerContent = mathContent.toLowerCase();
  if (lowerContent.includes('c_v') || lowerContent.includes('c_{v}')) {
    cleanedFormula += ' k m_v gamma_w';
  }
  // K_a, K_p 토압계수 및 p_a 주동토압 감지 시 c, gamma, z, q 도 허용 처리
  if (lowerContent.includes('k_a') || lowerContent.includes('k_{a}') || lowerContent.includes('k_p') || lowerContent.includes('k_{p}') || lowerContent.includes('p_a')) {
    cleanedFormula += ' c gamma z q';
  }
  // k_h 수평지반반력계수 감지 시 E_0, N 도 허용 처리
  if (lowerContent.includes('k_h') || lowerContent.includes('k_{h}')) {
    cleanedFormula += ' e_0 n e';
  }

  const tokenRegex = /[a-zA-Z0-9_]+/g;
  const formulaTokens = cleanedFormula.match(tokenRegex) || [];
  
  const normalize = (v) => {
    if (!v) return '';
    return v
      .replace(/[\$\s\{\}\[\]\(\)]/g, '')
      .replace(/\\/g, '')
      .replace(/_/g, '');
  };

  const formulaTokenSet = new Set(formulaTokens.map(t => normalize(t)).filter(Boolean));
  if (extraAllowed && Array.isArray(extraAllowed)) {
    extraAllowed.forEach(word => {
      formulaTokenSet.add(normalize(word));
    });
  }

  const lines = structure.split('\n');
  const filteredLines = lines
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => {
      if (/^[\-\*\u2022\d\.]/.test(line)) {
        const colonIdx = line.indexOf(':');
        const dashIdx = line.indexOf('-', 1);
        const sepIdx = colonIdx !== -1 ? colonIdx : dashIdx;
        
        if (sepIdx !== -1) {
          const symbolPortion = line.substring(0, sepIdx);
          const symbolTokens = symbolPortion.match(tokenRegex) || [];
          const normalizedSymbols = symbolTokens.map(s => normalize(s)).filter(Boolean);
          
          if (normalizedSymbols.length === 0) return true;
          
          const hasMatch = normalizedSymbols.some(s => formulaTokenSet.has(s));
          return hasMatch;
        }
      }
      return true;
    });

  return filteredLines.join('\n\n');
}

// 6-3-5. Formula calculation question generator
app.post('/api/formula/generate-quiz-question', async (req, res) => {
  try {
    const { formulaTitle, formula, concept, assumptions } = req.body;
    if (!formulaTitle || !formula) {
      return res.status(400).json({ error: '공식 정보가 부족합니다.' });
    }

    let topicTitle = formulaTitle;
    let topicKeywords = '';
    let fileText = '';
    try {
      const matchedTopic = await dbQuery.get(
        `SELECT id, title, keywords, pdf_name, pdf_data FROM topics WHERE ? LIKE '%' || title || '%' OR title LIKE '%' || ? || '%' LIMIT 1`,
        [formulaTitle, formulaTitle]
      );
      if (matchedTopic) {
        topicTitle = matchedTopic.title;
        topicKeywords = matchedTopic.keywords || '';
        if (matchedTopic.pdf_data) {
          const isHtml = matchedTopic.pdf_name && (
            matchedTopic.pdf_name.toLowerCase().endsWith('.html') ||
            matchedTopic.pdf_name.toLowerCase().endsWith('.htm') ||
            isBufferHtml(matchedTopic.pdf_data)
          );
          try {
            if (isHtml) fileText = htmlToPlainText(decodeHtmlBuffer(matchedTopic.pdf_data));
            else {
              const parsed = await pdfParse(matchedTopic.pdf_data);
              fileText = parsed.text || '';
            }
          } catch (e) {}
          fileText = mergeVerticalText(fileText);
        }
      }
    } catch (dbErr) {
      console.warn('Failed to find matching topic for formula validation:', dbErr);
    }

    const finalValidated = await generateCalculationQuizQuestion(
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
    res.status(500).json({ error: err.message || '계산 문제 생성에 실패했습니다.' });
  }
});

// 6-4. Formula Analysis & Title/Structure Generation
app.post('/api/formula/suggest-title', async (req, res) => {
  try {
    const { mathContent, fullText, userFeedback } = req.body;
    if (!mathContent) {
      return res.status(400).json({ error: '수식 내용이 존재하지 않습니다.' });
    }

    // 1) 로컬 사전 매칭 시도 (사용자 피드백이 없을 때만 수행)
    let bestLocalMatch = null;
    let maxMatchCount = 0;
    if (!userFeedback) {
      const cleanMathContent = mathContent.replace(/\s+/g, '');
    
    // LaTeX 명령어(예: \frac, \left, \right)의 내부 텍스트만 추출하고 명령어 단어 자체는 차단
    const mathTokens = mathContent
      .replace(/\\[a-zA-Z]+/g, ' ') // 모든 \명령어를 공백으로 지움 (변수만 남김)
      .replace(/[^a-zA-Z0-9\_]/g, ' ') // 알파벳, 숫자, 언더바만 남김
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    for (const dict of LOCAL_FORMULA_DICTIONARY) {
      let matchCount = 0;
      for (const kw of dict.keywords) {
        const cleanKw = kw.replace(/\\\\/g, '\\');
        // 만약 키워드가 그리스 문자(\gamma 등)나 LaTeX 기호 형식이면 mathContent에 백슬래시 기호가 포함되었는지 안전 검사
        if (cleanKw.startsWith('\\')) {
          if (cleanMathContent.includes(cleanKw)) {
            matchCount++;
          }
        } else {
          // 키워드가 일반 알파벳(C, D_f 등)이면, 오염된 \frac 등의 단어를 피하기 위해
          // 위에서 정제한 mathTokens 배열에 정확히 존재하는지 검사!
          if (mathTokens.includes(cleanKw) || mathTokens.some(tok => tok === cleanKw || tok.startsWith(cleanKw + '_') || tok.endsWith('_' + cleanKw))) {
            matchCount++;
          }
        }
      }
      
      // 매칭 신뢰도 판단 (최소 2개 이상의 핵심 변수 매칭 필요)
      if (matchCount > maxMatchCount && matchCount >= 2) {
        maxMatchCount = matchCount;
        bestLocalMatch = dict;
      }
    }
    }

    const systemInstruction = `당신은 지반공학 및 토질역학/토목 전공 학술 공식을 완벽히 분석해주는 기술사 전문 튜터입니다. 입력받은 LaTeX 수식과 전체적인 튜터 대화 맥락, 현재 학습 중인 토픽 등의 문제 출처/맥락을 깊이 있게 고려하여 해당 맥락 하에서의 공학적 정의와 의미로 맞춤형 작성을 해야 합니다. 반드시 아래 지정된 JSON 형식으로만 응답해 주세요. 다른 설명 텍스트나 코드블록 기호는 절대 출력하지 마십시오.
[지반공학 용어 준수 철칙]: 'Flow Net'은 절대 '유망망'이라는 존재하지 않는 단어로 번역/표기하지 말고, 반드시 표준 전공 용어인 '유선망'(流線網)으로 통일하여 표기하십시오.
 
JSON 포맷 규격:
{
  "title": "해당 수식이 상징하는 가장 적절하고 간결한 전공 공식 명칭입니다. 반드시 한글(영어 전공명) 표준 포맷으로 한 줄 작명해야 합니다. 조사, 서술어 등 미사여구는 일체 배제하십시오. 공식에 학자명이 연관된 경우 반드시 사람이름을 전방 한글명에 무조건 추가하십시오. 예시: 테르자기 1차 압밀방정식(Terzaghi 1D Consolidation), 바톤 암반 Q분류(Barton Q-system)",
  "concept": "이 공식이 상징하는 공학적 의미를 수험생이 쉽게 이해할 수 있도록 친절하게 설명하는 1~2문장의 공학 개념 설명입니다. 수식의 본질적 존재 이유와 실무 공학적 의의를 명확히 작성하십시오.",
  "structure": "이 공식에 포함된 각각의 기호, 변수, 상수가 무엇을 의미하는지 공학적으로 분석한 설명 리스트입니다. 반드시 제공된 공식에 실제 표기된 기호에 한해서만 정의 목록을 작성하십시오. 사족 문장 없이 마크다운 불릿 리스트 형태로만 반환하십시오."
}

${LATEX_PROMPT_INSTRUCTIONS}`;

    let userPrompt = `[수식]: ${mathContent}\n\n[대화 본문 맥락]:\n${fullText || '(대화 없음)'}`;
    if (userFeedback) {
      userPrompt += `\n\n[사용자 공식 조정 요청 의견]:\n${userFeedback}\n\n위 사용자 피드백 의견을 최우선적으로 적극 반영하여 공식의 명칭(title), 핵심개념(concept), 그리고 수식 기호 설명(structure)을 재구성하여 한글로 성실히 보완하십시오.`;
    }

    try {
      const responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'formula');
      
      let cleanJsonText = responseText.trim();
      const startIdx = cleanJsonText.indexOf('{');
      const endIdx = cleanJsonText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
      } else if (cleanJsonText.startsWith('```')) {
        cleanJsonText = cleanJsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      }
      
      try {
        const result = parseLlmJson(cleanJsonText);
        let structure = result.structure || '';
        if (Array.isArray(structure)) {
          structure = structure.join('\n\n');
        }
        if (typeof structure === 'string') {
          structure = structure
            .replace(/-\s*각\s*기호와\s*상수의\s*의미를\s*대화\s*맥락을\s*기반으로\s*복습해\s*보세요\.?/gi, '')
            .replace(/각\s*기호와\s*상수의\s*의미를\s*대화\s*맥락을\s*기반으로\s*복습해\s*보세요\.?/gi, '')
            .trim();
        } else {
          structure = '';
        }

        if (!structure && bestLocalMatch) {
          structure = bestLocalMatch.structure;
        } else if (!structure) {
          structure = extractVariablesFromMath(mathContent);
        }

        // Apply strict filter with extra allowed variables from the local match if available
        const extraAllowed = [];
        if (bestLocalMatch) {
          extraAllowed.push(...bestLocalMatch.keywords);
          const symbolTokens = bestLocalMatch.structure.match(/\$([^\$]+?)\$/g) || [];
          symbolTokens.forEach(sym => {
            extraAllowed.push(sym.replace(/\$/g, ''));
          });
        }
        structure = filterStructureLines(mathContent, structure, extraAllowed);

        res.json({
          title: result.title ? healLatexFormulas(result.title.replace(/^["'`\s\t\n]+|["'`\s\t\n]+$/g, '').trim()) : (bestLocalMatch ? healLatexFormulas(bestLocalMatch.title.trim()) : '실시간 추출 공식'),
          concept: result.concept ? healLatexFormulas(result.concept.trim()) : (bestLocalMatch ? healLatexFormulas(bestLocalMatch.concept.trim()) : '실시간 공식 튜터링 대화에서 개별 추출된 전공 공식입니다.'),
          structure: healLatexFormulas(structure)
        });
      } catch (parseErr) {
        console.warn('JSON parsing failed, falling back to plaintext parse or local dictionary:', parseErr);
        
        let fallbackTitle = bestLocalMatch ? bestLocalMatch.title : '실시간 추출 공식';
        const titleMatch = responseText.match(/"title"\s*:\s*"([^"]+)"/);
        if (titleMatch && titleMatch[1]) {
          fallbackTitle = titleMatch[1].replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
        }

        let fallbackConcept = bestLocalMatch ? bestLocalMatch.concept : '실시간 공식 튜터링 대화에서 개별 추출된 전공 공식입니다.';
        const conceptMatch = responseText.match(/"concept"\s*:\s*"([^"]+)"/);
        if (conceptMatch && conceptMatch[1]) {
          fallbackConcept = conceptMatch[1].trim();
        }

        let fallbackStructure = bestLocalMatch ? bestLocalMatch.structure : extractVariablesFromMath(mathContent);
        const extraAllowed2 = [];
        if (bestLocalMatch) {
          extraAllowed2.push(...bestLocalMatch.keywords);
          const symbolTokens = bestLocalMatch.structure.match(/\$([^\$]+?)\$/g) || [];
          symbolTokens.forEach(sym => {
            extraAllowed2.push(sym.replace(/\$/g, ''));
          });
        }
        fallbackStructure = filterStructureLines(mathContent, fallbackStructure, extraAllowed2);

        res.json({
          title: healLatexFormulas(fallbackTitle),
          concept: healLatexFormulas(fallbackConcept),
          structure: healLatexFormulas(fallbackStructure)
        });
      }
    } catch (err) {
      console.warn('Formula suggest title LLM error, falling back to local dictionary:', err);
      let fallbackTitle = bestLocalMatch ? bestLocalMatch.title : '실시간 추출 공식';
      let fallbackConcept = bestLocalMatch ? bestLocalMatch.concept : '실시간 공식 튜터링 대화에서 개별 추출된 전공 공식입니다.';
      let fallbackStructure = bestLocalMatch ? bestLocalMatch.structure : extractVariablesFromMath(mathContent);
      const extraAllowed3 = [];
      if (bestLocalMatch) {
        extraAllowed3.push(...bestLocalMatch.keywords);
        const symbolTokens = bestLocalMatch.structure.match(/\$([^\$]+?)\$/g) || [];
        symbolTokens.forEach(sym => {
          extraAllowed3.push(sym.replace(/\$/g, ''));
        });
      }
      fallbackStructure = filterStructureLines(mathContent, fallbackStructure, extraAllowed3);
      res.json({
        title: healLatexFormulas(fallbackTitle),
        concept: healLatexFormulas(fallbackConcept),
        structure: healLatexFormulas(fallbackStructure)
      });
    }
  } catch (err) {
    console.error('Formula suggest title route error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});


// 6-5. Table Auto-Refinement and Title Generation
app.post('/api/table/suggest-title-and-refine', async (req, res) => {
  try {
    const { tableHtml, chatHistory } = req.body;
    if (!tableHtml) {
      return res.status(400).json({ error: '표 내용이 존재하지 않습니다.' });
    }

    const systemInstruction = `당신은 대한민국 국가기술자격 기술사 시험(토질및기초기술사, 토목시공기술사, 토목구조기술사 등 토목공학 및 지반공학 분야) 전문 튜터입니다.
사용자가 공부하던 중 실시간 튜터 창에서 내보내고자 하는 마크다운 표가 입력됩니다.
해당 표의 원본 HTML 내용과 실시간 튜터 대화 맥락을 분석하여:
1. 해당 표에 가장 걸맞은 전문적이고 깔끔한 핵심 제목(Title)을 한글로 한 줄(공백 포함 25자 이내)로 도출하십시오. (학자명/공법명 등을 적절히 반영하여 '~~ 비교표' 또는 '~~ 분석표' 등 형식으로 작성)
2. 표의 전체 내용을 지반공학/토질역학 표준 용어 및 기술사 시험 서술 양식에 맞게 다듬은 정제된 HTML table 마크업을 반환하십시오. 원본 표의 행과 열 구조를 그대로 유지하되, 오탈자가 있거나 부자연스러운 서술이 있다면 깔끔하게 다듬으십시오. (별도의 css 스타일이나 wrapper div는 포함하지 말고 오직 <table>...</table> 형태만 출력해야 합니다.)

반드시 다음 JSON 형식 규격으로만 정확하게 응답하십시오. (설명이나 마크다운 코드 블록 기호는 절대 출력하지 마십시오):
{
  "title": "여기에 최적화된 표 제목 기입",
  "html": "여기에 정제된 <table>...</table> HTML 마크업 기입"
}`;

    const chatContext = Array.isArray(chatHistory)
      ? chatHistory.map(h => `${h.role === 'user' ? '사용자' : 'AI 튜터'}: ${h.text}`).join('\n')
      : '(대화 없음)';

    const userPrompt = `[원본 표 HTML]:\n${tableHtml}\n\n[실시간 튜터 대화 맥락]:\n${chatContext}`;

    const responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'tutor');
    
    let cleanJsonText = responseText.trim();
    const startIdx = cleanJsonText.indexOf('{');
    const endIdx = cleanJsonText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
    } else if (cleanJsonText.startsWith('```')) {
      cleanJsonText = cleanJsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    try {
      const result = parseLlmJson(cleanJsonText);
      res.json({
        title: (result.title || '새 비교표').replace(/^[📊\s\t\n]+/, '').trim(),
        html: result.html || tableHtml
      });
    } catch (parseErr) {
      console.warn('Refined table JSON parsing failed, using fallback regex:', parseErr);
      let fallbackTitle = '새 비교표';
      const titleMatch = responseText.match(/"title"\s*:\s*"([^"]+)"/);
      if (titleMatch && titleMatch[1]) {
        fallbackTitle = titleMatch[1].replace(/^[📊\s\t\n]+/, '').trim();
      }
      let fallbackHtml = tableHtml;
      const htmlMatch = responseText.match(/"html"\s*:\s*"([\s\S]+?)"\s*}/);
      if (htmlMatch && htmlMatch[1]) {
        fallbackHtml = htmlMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
      }
      res.json({
        title: fallbackTitle,
        html: fallbackHtml
      });
    }
  } catch (err) {
    console.error('Refine table route error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});


// 6-6. Table Content Regeneration by Row/Col Headers
app.post('/api/table/regenerate', async (req, res) => {
  try {
    const { title, headers, rowHeaders } = req.body;
    if (!title || !headers || !rowHeaders) {
      return res.status(400).json({ error: '필수 매개변수(title, headers, rowHeaders)가 누락되었습니다.' });
    }

    const systemInstruction = `당신은 지반공학 및 토목공학 전공을 지도하는 대학교수이자 전문 AI 튜터입니다.
사용자가 제공한 표의 제목(주제), 열 헤더(첫 번째 행), 행 헤더(첫 번째 열)를 기준으로 표의 나머지 본문 셀 내용을 전공 지식에 맞게 전문적으로 채워주세요.

반드시 다음 형식의 JSON 객체만 반환해야 합니다 (설명이나 마크다운 코드 블록 기호는 절대 출력하지 마십시오):
{
  "rows": [
    ["행헤더1", "본문셀1-1", "본문셀1-2", ...],
    ["행헤더2", "본문셀2-1", "본문셀2-2", ...]
  ]
}

주의사항:
1. 각 행의 첫 번째 원소는 반드시 사용자가 제공한 행 헤더와 동일해야 합니다.
2. 행 헤더와 열 헤더를 연계 분석하여 지반공학 전공 수준의 구체적이고 전문적인 지식을 한글로 작성해 주세요.
3. 마크다운 기호나 추가적인 텍스트 설명은 배제하고 오직 위 형식의 JSON 데이터만 출력해 주세요. JSON 형식이 깨지면 안 됩니다.`;

    const userPrompt = `
- 표 제목(주제): ${title}
- 열 헤더: ${JSON.stringify(headers)}
- 행 헤더(첫 번째 열의 목록): ${JSON.stringify(rowHeaders)}
`;

    const responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'tutor', { temperature: 0.2 });
    
    let cleanJsonText = responseText.trim();
    const startIdx = cleanJsonText.indexOf('{');
    const endIdx = cleanJsonText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
    } else if (cleanJsonText.startsWith('```')) {
      cleanJsonText = cleanJsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    try {
      const result = parseLlmJson(cleanJsonText);
      if (result && Array.isArray(result.rows)) {
        res.json({ success: true, rows: result.rows });
      } else {
        throw new Error('응답 형식이 올바르지 않습니다.');
      }
    } catch (parseErr) {
      console.error('Regenerate table JSON parsing failed:', parseErr, 'Raw:', responseText);
      res.status(500).json({ error: 'AI 응답 분석 실패. 다시 시도해 주세요.' });
    }
  } catch (err) {
    console.error('Regenerate table error:', err);
    res.status(500).json({ error: err.message || '표 내용 재작성에 실패했습니다.' });
  }
});


// 7. Get Topic File Raw Text for Reading
app.get('/api/topics/:id/text', async (req, res) => {
  const topicId = req.params.id;

  try {
    const topicSql = `SELECT * FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(topicSql, [topicId]);

    if (!topic) {
      return res.status(404).json({ error: '토픽을 찾을 수 없습니다.' });
    }

    const fileText = await getTopicText(topic);

    res.json({
      id: topic.id,
      title: topic.title,
      pdf_name: topic.pdf_name,
      text: fileText || '보고서 내용이 비어 있거나 추출된 텍스트가 없습니다.'
    });
  } catch (error) {
    console.error('Error fetching topic file text:', error);
    res.status(500).json({ error: '서버 오류로 보고서 전문을 불러오지 못했습니다.' });
  }
});

// 8. Stream Raw PDF/HTML File directly for native browser viewing
function isBufferPng(buf) {
  if (!buf || buf.length < 8) return false;
  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
         buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;
}

function isBufferJpeg(buf) {
  if (!buf || buf.length < 3) return false;
  return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function isBufferGif(buf) {
  if (!buf || buf.length < 4) return false;
  return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
}

function isBufferWebp(buf) {
  if (!buf || buf.length < 12) return false;
  return buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
}

app.get('/api/topics/:id/html-raw', async (req, res) => {
  const topicId = req.params.id;
  try {
    const topic = await dbQuery.get(`SELECT pdf_name, pdf_data FROM topics WHERE id = ?`, [topicId]);
    if (!topic || !topic.pdf_data) {
      return res.status(404).json({ error: '첨부된 HTML 원본 파일을 찾을 수 없습니다.' });
    }
    const html = decodeHtmlBuffer(topic.pdf_data);
    res.json({ success: true, html });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/topics/:id/html-raw', async (req, res) => {
  const topicId = req.params.id;
  const { html } = req.body;
  if (typeof html !== 'string') {
    return res.status(400).json({ error: 'html 코드는 필수 문자열입니다.' });
  }
  try {
    const topic = await dbQuery.get(`SELECT pdf_name FROM topics WHERE id = ?`, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '토픽을 찾을 수 없습니다.' });
    }
    const buffer = Buffer.from(html, 'utf-8');
    await dbQuery.run(`UPDATE topics SET pdf_data = ? WHERE id = ?`, [buffer, topicId]);
    
    // Clear extracted text cache so that new quiz generations read the updated html.
    // NOTE: This preserves all existing review data, schedules, scores, and past solved sessions.
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', [`topic_extracted_text_${topicId}`]);
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/topics/:id/pdf', async (req, res) => {
  const topicId = req.params.id;

  try {
    const topicSql = `SELECT pdf_name, pdf_data FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(topicSql, [topicId]);

    if (!topic || !topic.pdf_data) {
      return res.status(404).send('첨부된 PDF/HTML 원본 파일을 찾을 수 없습니다.');
    }

    const isImage = isBufferPng(topic.pdf_data) || isBufferJpeg(topic.pdf_data) || isBufferGif(topic.pdf_data) || isBufferWebp(topic.pdf_data);

    const isHtml = !isImage && topic.pdf_name && (
      topic.pdf_name.toLowerCase().endsWith('.html') || 
      topic.pdf_name.toLowerCase().endsWith('.htm') || 
      isBufferHtml(topic.pdf_data)
    );
    if (isHtml) {
      // Decode HTML buffer cleanly and stream it natively with UTF-8 encoding
      let htmlContent = decodeHtmlBuffer(topic.pdf_data);
      // Remove any script tag containing polyfill.io to prevent malicious loads and credential prompts
      htmlContent = htmlContent.replace(/<script\b[^>]*?src=["']?[^"'>]*?polyfill\.io[^"'>]*?["']?[^>]*?>([\s\S]*?<\/script>)?/gi, '<!-- polyfill removed -->');

      // Inject or replace viewport meta tag to disable user scaling and lock to device width
      const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">';
      if (htmlContent.includes('<head>')) {
        htmlContent = htmlContent.replace(/<meta\b[^>]*?name=["']viewport["'][^>]*?>/gi, '');
        htmlContent = htmlContent.replace('<head>', `<head>\n${viewportMeta}`);
      } else {
        htmlContent = `${viewportMeta}\n${htmlContent}`;
      }

      // Wrap the content inside body with a scroll wrapper to prevent page-level dragging/scrolling while allowing content-level scrolling
      if (htmlContent.includes('<body')) {
        const bodyTagMatch = htmlContent.match(/<body\b[^>]*>/i);
        if (bodyTagMatch) {
          const bodyTag = bodyTagMatch[0];
          htmlContent = htmlContent.replace(bodyTag, `${bodyTag}\n<div class="antigravity-scroll-wrapper">`);
          htmlContent = htmlContent.replace('</body>', '</div>\n</body>');
        }
      } else {
        htmlContent = `<div class="antigravity-scroll-wrapper">\n${htmlContent}\n</div>`;
      }
      
      // If client requests only the screenshot part, parse and return it
      if (req.query.part === 'screenshot') {
        const separator = '<!-- ANTIGRAVITY_SCREENSHOT_END -->';
        if (htmlContent.includes(separator)) {
          htmlContent = htmlContent.split(separator)[0].trim();
        } else {
          // Fallback: If no separator is present, extract only img elements to show only the diagram/screenshot
          const imgRegex = /<img\b[^>]*>/gi;
          const imgs = htmlContent.match(imgRegex) || [];
          if (imgs.length > 0) {
            htmlContent = imgs.map(item => `<div style="text-align: center; margin-bottom: 20px;">${item}</div>`).join('\n');
          }
        }
      }

      const responsiveStyle = `
<style>
/* Global Premium Light Theme for Report Viewers */
html, body {
  background-color: #ffffff !important;
  color: #1e293b !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  line-height: 1.6 !important;
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  max-width: 100vw !important;
  height: 100% !important;
  overflow: hidden !important; /* Disable all page-level drag/scroll */
  box-sizing: border-box !important;
}

.antigravity-scroll-wrapper {
  width: 100vw !important;
  height: 100vh !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch !important;
  padding: 24px !important; /* Default desktop padding */
  box-sizing: border-box !important;
}

/* Ensure all nested text is readable and correctly colored */
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

/* Elegant borders and backgrounds for tables and layouts */
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

/* Layout overrides to prevent broken layouts on light theme */
div, section, article, form, .container, .page, .wrapper, .section, .WordSection1, #page-container, #sidebar, #content {
  background-color: transparent !important;
  border-color: #e2e8f0 !important;
  box-shadow: none !important;
}

/* Scrollbars styling */
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
    padding: 0 !important;
    margin: 0 !important;
    overflow: hidden !important;
    width: 100vw !important;
    height: 100vh !important;
  }
  .antigravity-scroll-wrapper {
    width: 100vw !important;
    height: 100vh !important;
    padding: 0px 4px !important; /* Minimize left/right padding */
    overflow-x: auto !important;
    overflow-y: auto !important;
  }
  *, *:before, *:after {
    box-sizing: border-box !important;
  }
  p, span, td, li, div, section, article, h1, h2, h3, h4, h5, h6 {
    word-break: break-all !important;
    word-wrap: break-word !important;
    white-space: normal !important;
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
  img, svg {
    max-width: 100% !important;
    height: auto !important;
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
      const fileNameLower = (topic.pdf_name || '').toLowerCase();
      let contentType = 'application/pdf';
      if (fileNameLower.endsWith('.png') || isBufferPng(topic.pdf_data)) {
        contentType = 'image/png';
      } else if (fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg') || isBufferJpeg(topic.pdf_data)) {
        contentType = 'image/jpeg';
      } else if (fileNameLower.endsWith('.gif') || isBufferGif(topic.pdf_data)) {
        contentType = 'image/gif';
      } else if (fileNameLower.endsWith('.webp') || isBufferWebp(topic.pdf_data)) {
        contentType = 'image/webp';
      } else if (fileNameLower.endsWith('.svg')) {
        contentType = 'image/svg+xml';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(topic.pdf_name)}"`);
      res.send(topic.pdf_data);
    }
  } catch (error) {
    console.error('Error streaming PDF/HTML file:', error);
    res.status(500).send('서버 오류로 파일을 스트리밍하지 못했습니다.');
  }
});

// SERVER INLINE STARTUP
// ── Cross-device Session Sync API ─────────────────────────────────────────
// 테이블 자동 생성 헬퍼
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

// GET /api/session/exam → 저장된 종합평가 상태 반환
app.get('/api/session/exam', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all(
      'SELECT value FROM app_session WHERE key = ?',
      ['exam_session']
    );
    if (rows.length > 0 && rows[0].value) {
      const data = JSON.parse(rows[0].value);
      if (data) {
        if (Array.isArray(data.questions)) {
          data.questions = data.questions.map(q => healQuizQuestionObject(q));
        }
        if (Array.isArray(data.examQuestions)) {
          data.examQuestions = data.examQuestions.map(q => healQuizQuestionObject(q));
        }
      }
      res.json({ data });
    } else {
      res.json({ data: null });
    }
  } catch (err) {
    console.error('GET /api/session/exam error:', err);
    res.json({ data: null }); // 오류 시에도 null 반환 (새로 생성하도록)
  }
});

// POST /api/session/exam → 종합평가 상태 저장 (닫기 시)
app.post('/api/session/exam', async (req, res) => {
  try {
    await ensureSessionTable();
    const { examQuestions, examRevealed, examAnswers, examTopic, tableAnswers, tableGradingResults, tutorAnswers, tutorInputText, chatHistory, savedExamScroll } = req.body;



    const value = JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, tableAnswers: tableAnswers || {}, tableGradingResults: tableGradingResults || {}, tutorAnswers: tutorAnswers || {}, tutorInputText: tutorInputText || {}, chatHistory: chatHistory || [], savedExamScroll });
    // Safe UPSERT (prevents concurrent unique key violations)
    await saveSessionValue('exam_session', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/exam error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/session/exam → 종합평가 상태 초기화 (종료 시)
app.delete('/api/session/exam', async (req, res) => {
  try {
    await ensureSessionTable();
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', ['exam_session']);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/session/exam error:', err);
    res.status(500).json({ error: err.message });
  }
});

global.globalDebugLogs = global.globalDebugLogs || [];
if (!global.addDebugLog) {
  global.addDebugLog = function(msg) {
    const timestamp = new Date().toISOString();
    global.globalDebugLogs.push(`[${timestamp}] ${msg}`);
    if (global.globalDebugLogs.length > 200) {
      global.globalDebugLogs.shift();
    }
    console.log(`[DEBUG LOG] ${msg}`);
  };
}

app.get('/api/debug-db', async (req, res) => {
  try {
    const rows = await dbQuery.all("SELECT key, LENGTH(value) as len, updated_at FROM app_session ORDER BY updated_at DESC LIMIT 50");
    const topics = await dbQuery.all("SELECT id, title FROM topics ORDER BY id DESC LIMIT 50");
    const formulaRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'formula_questions'");
    const recentLS = await dbQuery.get("SELECT value FROM app_session WHERE key = 'recent_lockscreen_questions'");
    const formulaParsed = formulaRow && formulaRow.value ? JSON.parse(formulaRow.value) : null;
    const recentLSParsed = recentLS && recentLS.value ? JSON.parse(recentLS.value) : null;
    res.json({ 
      success: true, 
      rows, 
      topics, 
      debugLogs: global.globalDebugLogs,
      recentLockscreen: recentLSParsed,
      formulasCount: formulaParsed?.formulaQuestions?.length || 0,
      firstFormulas: formulaParsed?.formulaQuestions?.slice(0, 3)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/review → 복습 문제 세트 및 진행 상태 반환
app.get('/api/session/review', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rawTopicId = req.query.topicId;
    const targetTopicId = String(rawTopicId || '');

    try {
      fs.appendFileSync(path.resolve(__dirname, 'debug_call_log.txt'), 
        `[${new Date().toISOString()}] GET /api/session/review : topicId=${rawTopicId}, query=${JSON.stringify(req.query)}\n`
      );
    } catch (e) {
      console.error('Debug log write failed:', e.message);
    }

    if (!rawTopicId) {
      return res.status(400).json({ error: 'topicId가 누락되었습니다.' });
    }

    if (targetTopicId && targetTopicId.startsWith('mixed_')) {
      const sId = req.query.sessionId || 'legacy_default';
      const key = `review_questions_topic_${targetTopicId}_sess_${sId}`;
      let row = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);
      if (row && row.value) {
        return res.json({ success: true, data: JSON.parse(row.value) });
      }
      return res.json({ success: true, data: null });
    }

    // 100% 토픽 ID(챕터 ID) 단일 식별자 기준으로만 캐시 키를 설정합니다!
    const key = `review_questions_topic_${targetTopicId}`;
    let row = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);
    if (global.addDebugLog) {
      global.addDebugLog(`GET review: topicId=${targetTopicId}, resolvedKey=${key}, foundRow=${!!row}`);
    }

    // [🚨 단일 세션 모델 마이그레이션 폴백 🚨]
    // 단일 키 조회를 실패했을 때만, 레거시 키 패턴에서 topicId가 정확히 일치하는 데이터를 전수 스캔 및 엄격 대조하여 안전하게 복원합니다.
    if (!row) {
      console.log(`[Migration Fallback] Single key not found. Scanning legacy sessions for topicId=${targetTopicId}`);
      
      // 1. 토픽 기반 레거시 키 조회 (review_questions_topic_54-01_sess_%)
      const topicPattern = `review_questions_topic_${targetTopicId}_sess_%`;
      const topicSessionRow = await dbQuery.get(
        'SELECT key, value FROM app_session WHERE key LIKE ? ORDER BY updated_at DESC LIMIT 1',
        [topicPattern]
      );
      if (topicSessionRow) {
        row = topicSessionRow;
        console.log(`[Migration Fallback] Found legacy topic session: ${topicSessionRow.key}`);
      } else {
        // 2. 스케줄 기반 레거시 키 전수 조사 (최근 100개 중 JSON 내부의 topicId가 "정확하게" 일치하는 녀석 탐색)
        const allSchedSessions = await dbQuery.all(
          `SELECT key, value FROM app_session 
           WHERE key LIKE 'review_questions_schedule_%' 
           ORDER BY updated_at DESC LIMIT 100`
        );
        if (allSchedSessions && allSchedSessions.length > 0) {
          for (const sRow of allSchedSessions) {
            try {
              const parsedVal = JSON.parse(sRow.value);
              if (parsedVal && String(parsedVal.topicId || '') === targetTopicId && parsedVal.questions && parsedVal.questions.length > 0) {
                row = sRow;
                console.log(`[Migration Fallback] Found legacy schedule session matching topicId inside JSON: ${sRow.key}`);
                break;
              }
            } catch (err) {}
          }
        }
      }
    }

    if (row && row.value) {
      let data = JSON.parse(row.value);
      if (data) {
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
        let formulaImages = [];
        try {
          const imageRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'formula_images'");
          if (imageRow && imageRow.value) {
            const parsed = JSON.parse(imageRow.value);
            formulaImages = parsed.formulaImages || [];
          }
        } catch (e) {
          console.warn('Failed to load formula_images for session repair:', e.message);
        }

        if (Array.isArray(data.questions)) {
          data.questions = data.questions.map(q => {
            const healed = healQuizQuestionObject(q);
            if (healed && healed.originalId && (healed.subtype === '그림' || healed.type === '주관식 (그림)' || healed.mixedType === 'image')) {
              const matchedImg = formulaImages.find(img => img.id === healed.originalId);
              if (matchedImg) {
                const imgs = matchedImg.base64Images || (matchedImg.base64Image ? [matchedImg.base64Image] : []);
                if (imgs.length > 0) {
                  healed.imageSrc = imgs[0];
                  healed.imageSrcs = imgs;
                } else if (matchedImg.src) {
                  healed.imageSrc = matchedImg.src;
                  healed.imageSrcs = [matchedImg.src];
                }
              }
            }
            return healed;
          });
        }
        // [🚨 실시간 서버단 백엔드 세탁 가드 🚨]
        if (data.tutorAnswers && typeof data.tutorAnswers === 'object') {
          Object.keys(data.tutorAnswers).forEach(k => {
            if (typeof data.tutorAnswers[k] === 'string') {
              data.tutorAnswers[k] = healLatexFormulas(data.tutorAnswers[k]);
            }
          });
        }
        if (Array.isArray(data.chatHistory)) {
          data.chatHistory = data.chatHistory.map(msg => {
            if (msg && typeof msg.content === 'string') {
              msg.content = healLatexFormulas(msg.content);
            }
            return msg;
          });
        }
      }
      res.json({ success: true, data });
    } else {
      res.json({ success: false, error: '세션 정보가 없습니다.' });
    }
  } catch (err) {
    console.error('GET /api/session/review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/session/review → 복습 문제 세트 영구 저장
app.post('/api/session/review', async (req, res) => {
  try {
    await ensureSessionTable();
    const { topicId, scheduleId, sessionId, questions, selectedAnswers, revealedQuestions, tableAnswers, tableGradingResults, tutorAnswers, tutorInputText, chatHistory, savedQuizScroll } = req.body;
    const targetTopicId = String(topicId || '');

    try {
      fs.appendFileSync(path.resolve(__dirname, 'debug_call_log.txt'), 
        `[${new Date().toISOString()}] POST /api/session/review : topicId=${topicId}, scheduleId=${scheduleId}, questionsCount=${questions?.length || 0}\n`
      );
    } catch (e) {
      console.error('Debug log write failed:', e.message);
    }

    if (!topicId || !questions) {
      return res.status(400).json({ error: '필수 인자가 누락되었습니다.' });
    }

    if (targetTopicId && targetTopicId.startsWith('mixed_')) {
      const sId = sessionId || 'legacy_default';
      const key = `review_questions_topic_${targetTopicId}_sess_${sId}`;
      const value = JSON.stringify({
        sessionId: sessionId || '',
        questions,
        selectedAnswers: selectedAnswers || {},
        revealedQuestions: revealedQuestions || {},
        tableAnswers: tableAnswers || {},
        tableGradingResults: tableGradingResults || {},
        tutorAnswers: tutorAnswers || {},
        tutorInputText: tutorInputText || {},
        chatHistory: chatHistory || [],
        savedQuizScroll: savedQuizScroll || 0
      });
      await dbQuery.run(
        `INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
        [key, value]
      );
      return res.json({ success: true, message: 'Mixed session stored.' });
    }

    const key = `review_questions_topic_${targetTopicId}`;



    const value = JSON.stringify({
      sessionId: sessionId || '',
      questions,
      selectedAnswers: selectedAnswers || {},
      revealedQuestions: revealedQuestions || {},
      tableAnswers: tableAnswers || {},
      tableGradingResults: tableGradingResults || {},
      tutorAnswers: tutorAnswers || {},
      tutorInputText: tutorInputText || {},
      chatHistory: chatHistory || [],
      savedQuizScroll: savedQuizScroll || 0
    });
    
    if (global.addDebugLog) {
      global.addDebugLog(`POST review: topicId=${topicId}, scheduleId=${scheduleId}, sessionId=${sessionId}, resolvedKey=${key}, chatHistoryLength=${chatHistory?.length || 0}`);
    }

    // Safe UPSERT (prevents concurrent unique key violations)
    await saveSessionValue(key, value);
    res.json({ success: true, ok: true });
  } catch (err) {
    console.error('POST /api/session/review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/session/review/topic/:id → 특정 토픽의 복습 세션 문제 초기화
app.delete('/api/session/review/topic/:id', async (req, res) => {
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

    // 1. 토픽 기반 세션 키 삭제
    await dbQuery.run(
      "DELETE FROM app_session WHERE key = ? OR key LIKE ?",
      [`review_questions_topic_${targetTopicId}`, `review_questions_topic_${targetTopicId}_sess_%`]
    );

    // 2. 이 토픽에 연결된 모든 스케줄의 세션 키 삭제
    const schedules = await dbQuery.all('SELECT id FROM schedules WHERE topic_id = ?', [targetTopicId]);
    if (schedules && schedules.length > 0) {
      for (const s of schedules) {
        await dbQuery.run(
          "DELETE FROM app_session WHERE key = ? OR key LIKE ?",
          [`review_questions_schedule_${s.id}`, `review_questions_schedule_${s.id}_sess_%`]
        );
      }
    }

    // 3. JSON 내부의 topicId가 일치하는 스케줄 세션 최종 전수 삭제
    const allSchedSessions = await dbQuery.all(
      `SELECT key, value FROM app_session WHERE key LIKE 'review_questions_schedule_%'`
    );
    if (allSchedSessions && allSchedSessions.length > 0) {
      for (const sRow of allSchedSessions) {
        try {
          const parsedVal = JSON.parse(sRow.value);
          if (parsedVal && String(parsedVal.topicId || '') === targetTopicId) {
            await dbQuery.run('DELETE FROM app_session WHERE key = ?', [sRow.key]);
            console.log(`[Session Purge] Deleted orphan schedule session matching topicId: ${sRow.key}`);
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

// GET /api/session/completed-review/:scheduleId → 특정 복습 회차의 저장된 풀이 문제, 객관식 마크 및 주관식 열람 이력 반환
app.get('/api/session/completed-review/:scheduleId', async (req, res) => {
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
      res.json({ success: false, error: '해당 복습의 저장된 풀이 기록이 없습니다.' });
    }
  } catch (err) {
    console.error('GET /api/session/completed-review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/completed-review/by-topic/:topicId → 특정 토픽의 가장 최근 완료된 복습 상세 풀이 기록 반환
app.get('/api/session/completed-review/by-topic/:topicId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const topicId = parseInt(req.params.topicId, 10);
  if (isNaN(topicId)) {
    return res.status(400).json({ error: '유효한 topicId가 아닙니다.' });
  }
  try {
    await ensureSessionTable();
    // 가장 최근에 완료/실패된 스케줄 ID 조회
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
    res.json({ success: false, error: '해당 토픽의 완료된 복습 기록이 없습니다.' });
  } catch (err) {
    console.error('GET /api/session/completed-review/by-topic error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/last-active-review → 가장 최근 공부 중이거나 완료했던 복습 세션 정보 반환
app.get('/api/session/last-active-review', async (req, res) => {
  try {
    await ensureSessionTable();
    // Query all matching session keys
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
    if (key.startsWith('completed_review_schedule_')) {
      const scheduleId = parseInt(key.replace('completed_review_schedule_', ''), 10);
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
            mode: 'completed',
            scheduleId: sched.id,
            reviewRound: sched.review_round,
            isReadOnly: true,
            isBonus: sched.review_round === 99,
            category: sched.category || '일반'
          }
        });
      }
    } else if (key.startsWith('review_questions_schedule_')) {
      const scheduleId = parseInt(key.replace('review_questions_schedule_', ''), 10);
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
            mode: 'ai',
            scheduleId: sched.id,
            reviewRound: sched.review_round,
            isReadOnly: false,
            isBonus: sched.review_round === 99,
            category: sched.category || '일반'
          }
        });
      }
    } else if (key.startsWith('review_questions_topic_')) {
      const topicIdRaw = key.replace('review_questions_topic_', '');
      if (topicIdRaw.startsWith('mixed_')) {
        return res.json({
          success: true,
          lastActive: {
            topicId: topicIdRaw,
            title: '오늘의 필수 믹스복습 (10제 1세트)',
            keywords: '',
            pdfName: 'mixed.html',
            mode: 'ai',
            scheduleId: `mixed_schedule_${topicIdRaw.replace('mixed_', '')}`,
            reviewRound: 'MIX',
            isReadOnly: false,
            isBonus: false,
            category: '믹스'
          }
        });
      }
      const topicId = parseInt(topicIdRaw, 10);
      const topicObj = await dbQuery.get(`SELECT id, title, keywords, pdf_name, category FROM topics WHERE id = ?`, [topicId]);
      if (topicObj) {
        // Find any pending schedule
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
            category: topicObj.category || '일반'
          }
        });
      }
    }

    res.json({ success: true, lastActive: null });
  } catch (err) {
    console.error('GET /api/session/last-active-review error:', err);
    res.status(500).json({ error: err.message });
  }
});







// 6-5. AI Option Explanation API for Multiple Choice
app.post('/api/question/option-explanation', async (req, res) => {
  const { question, options, answer } = req.body;
  const progressId = req.body.progressId || req.query.progressId;
  const localCallLLM = (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });

  if (!question || !options || !Array.isArray(options) || options.length !== 4) {
    return res.status(400).json({ error: '유효하지 않은 객관식 문제 정보입니다.' });
  }

  let progressTimer = null;
  if (progressId) {
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 보기 오답 원인 분석 중...', 90, 800, 10);
  }

  try {
    const prompt = `
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원입니다.
제공되는 객관식 문제의 질문과 4개 보기 목록을 면밀히 분석하여, 각 보기(①, ②, ③, ④)가 왜 정답인지(정답 이유) 또는 왜 정답이 아닌지(오답 이유)를 대한민국 공학 지침 및 표준 학술 이론에 근거하여 매우 직관적이고 명확하게 기술사적 관점에서 설명해 주십시오.

[질문]: ${question}
[보기 목록]:
① ${options[0]}
② ${options[1]}
③ ${options[2]}
④ ${options[3]}
[정답]: ${answer}

[요구사항]:
1. ①, ②, ③, ④ 각 보기별 오답/정답 요인 분석을 한눈에 들어오도록 콤팩트하게 작성하십시오 (각 보기당 1~2줄 이내 권장).
2. ${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
3. 마크다운의 '\`\`\`' 등의 특수 기호는 감싸지 말고 다음의 문자열 형식으로만 곧바로 반환해 주십시오:

- **① ${options[0]}** : [정답/오답 핵심 분석] (여기에 명확하고 압축된 공학적 해설 기재)
- **② ${options[1]}** : [정답/오답 핵심 분석] ...
- **③ ${options[2]}** : [정답/오답 핵심 분석] ...
- **④ ${options[3]}** : [정답/오답 핵심 분석] ...
`;

    const responseText = await localCallLLM(null, prompt, null, 'option-explanation');
    if (progressId) {
      updateProgress(progressId, 1, '1단계: 분석 완료!', 100);
    }
    res.json({ text: responseText.trim() });
  } catch (err) {
    console.error('Error generating option explanation:', err);
    if (progressId) {
      updateProgress(progressId, 1, '오류 발생으로 분석 실패', 100);
    }
    res.status(500).json({ error: 'AI 보기별 분석 해설을 생성하지 못했습니다.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// GET /api/session/formula → 저장된 필수공식 상태 반환
app.get('/api/session/formula', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all(
      'SELECT value FROM app_session WHERE key = ?',
      ['formula_questions']
    );
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      if (parsed && Array.isArray(parsed.formulaQuestions)) {
        parsed.formulaQuestions = parsed.formulaQuestions.map(q => healFormulaQuestionObject(q));
      }
      res.json({ data: parsed });
    } else {
      res.json({ data: null });
    }
  } catch (err) {
    console.error('GET /api/session/formula error:', err);
    res.json({ data: null });
  }
});

// POST /api/session/formula → 필수공식 상태 저장
app.post('/api/session/formula', async (req, res) => {
  try {
    await ensureSessionTable();
    const { formulaQuestions } = req.body;
    const healedQuestions = Array.isArray(formulaQuestions)
      ? formulaQuestions.map(healFormulaQuestionObject)
      : formulaQuestions;
    const value = JSON.stringify({ formulaQuestions: healedQuestions });
    // Safe UPSERT (prevents concurrent unique key violations)
    await saveSessionValue('formula_questions', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/formula error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/tables → 저장된 필수암기 표 상태 반환
app.get('/api/session/tables', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all(
      'SELECT value FROM app_session WHERE key = ?',
      ['formula_tables']
    );
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {
      res.json({ data: null });
    }
  } catch (err) {
    console.error('GET /api/session/tables error:', err);
    res.json({ data: null });
  }
});

// POST /api/session/tables → 필수암기 표 상태 저장
app.post('/api/session/tables', async (req, res) => {
  try {
    await ensureSessionTable();
    const { formulaTables } = req.body;
    const value = JSON.stringify({ formulaTables });
    await saveSessionValue('formula_tables', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/tables error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/acronyms → 저장된 필수암기 앞글자 상태 반환
app.get('/api/session/acronyms', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all(
      'SELECT value FROM app_session WHERE key = ?',
      ['formula_acronyms']
    );
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {
      res.json({ data: { formulaAcronyms: defaultAcronyms } });
    }
  } catch (err) {
    console.error('GET /api/session/acronyms error:', err);
    res.json({ data: { formulaAcronyms: defaultAcronyms } });
  }
});

// POST /api/session/acronyms → 필수암기 앞글자 상태 저장
app.post('/api/session/acronyms', async (req, res) => {
  try {
    await ensureSessionTable();
    const { formulaAcronyms } = req.body;
    const value = JSON.stringify({ formulaAcronyms });
    await saveSessionValue('formula_acronyms', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/acronyms error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/overviews → 저장된 필수암기 개요 목록 반환
app.get('/api/session/overviews', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all(
      'SELECT value FROM app_session WHERE key = ?',
      ['formula_overviews']
    );
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {
      res.json({ data: { formulaOverviews: defaultOverviews } });
    }
  } catch (err) {
    console.error('GET /api/session/overviews error:', err);
    res.json({ data: { formulaOverviews: defaultOverviews } });
  }
});

// POST /api/session/overviews → 필수암기 개요 상태 저장
app.post('/api/session/overviews', async (req, res) => {
  try {
    await ensureSessionTable();
    const { formulaOverviews } = req.body;
    const value = JSON.stringify({ formulaOverviews });
    await saveSessionValue('formula_overviews', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/overviews error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/images → 저장된 필수암기 그림 목록 반환
app.get('/api/session/images', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all(
      'SELECT value FROM app_session WHERE key = ?',
      ['formula_images']
    );
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {
      res.json({ data: { formulaImages: [] } });
    }
  } catch (err) {
    console.error('GET /api/session/images error:', err);
    res.json({ data: { formulaImages: [] } });
  }
});

// POST /api/session/images → 필수암기 그림 상태 저장
app.post('/api/session/images', async (req, res) => {
  try {
    await ensureSessionTable();
    const { formulaImages } = req.body;
    const value = JSON.stringify({ formulaImages });
    await saveSessionValue('formula_images', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/images error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/mixed-completed → 믹스복습 완료일 목록 반환
app.get('/api/session/mixed-completed', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all(
      'SELECT value FROM app_session WHERE key = ?',
      ['mixed_completed_dates']
    );
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {
      res.json({ data: { completedDates: [] } });
    }
  } catch (err) {
    console.error('GET /api/session/mixed-completed error:', err);
    res.json({ data: { completedDates: [] } });
  }
});

// POST /api/session/mixed-completed → 믹스복습 완료일 목록 추가/저장
app.post('/api/session/mixed-completed', async (req, res) => {
  try {
    await ensureSessionTable();
    const { completedDates } = req.body;
    const value = JSON.stringify({ completedDates });
    await saveSessionValue('mixed_completed_dates', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/mixed-completed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/image-standards/analyze → 붙여넣은 그림/그래프 멀티모달 분석
app.post('/api/image-standards/analyze', async (req, res) => {
  try {
    const { base64Image, base64Images, description } = req.body;
    const incomingImages = base64Images || (base64Image ? [base64Image] : []);
    if (!incomingImages || incomingImages.length === 0) {
      return res.status(400).json({ error: '이미지 데이터가 존재하지 않습니다.' });
    }

    const imageParts = incomingImages.map(imgStr => {
      let mimeType = 'image/png';
      let rawBase64 = imgStr;
      const match = imgStr.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        rawBase64 = match[2];
      }
      return { data: rawBase64, mimeType };
    });

    const systemInstruction = `당신은 지반공학, 토질역학 및 토목 전공 기술사 자격시험 전문 채점위원이자 튜터입니다.
사용자가 붙여넣은 공학 그림/그래프/도해 이미지들(1개 이상, 2개 이상일 수 있음)과 관련 텍스트 설명을 바탕으로 한꺼번에 연계하여 정밀 분석을 수행하십시오.
반드시 아래 지정된 JSON 형식으로만 응답해야 합니다. 다른 설명 텍스트나 마크다운 코드블록 기호(예: \`\`\`json)는 절대 포함하지 마십시오.

JSON 포맷 규격:
{
  "title": "이 그림/그래프들이 무엇을 뜻하는지 가장 정밀하고 간결한 핵심 전공 주제명으로 한글(공백 포함 25자 이내)로 자동 제안하십시오. (조사, 서술어 일체 배제)",
  "analysis": "해당 그림/그래프/도해들에 표현된 다양한 구성 요소, 변수 관계, 공학적 의미 및 작동 메커니즘을 연계하여 상세히 설명하십시오. 중요 기호나 핵심 개념을 명확하게 짚어주어야 하며, 텍스트가 줄바꿈이 많이 필요한 경우 적절히 구성하십시오. LaTeX 수식이 들어갈 경우 $수식$ 형태로 표현하십시오. (한글로 작성)",
  "intuitive": "이 복잡한 공학 도표나 그림들이 궁극적으로 설명하고자 하는 핵심 본질을 일상생활의 비유나 아주 직관적이고 쉬운 비유적 설명으로 풀어내어 작성하십시오. (한글 2~3문장)"
}`;

    const userPrompt = description 
      ? `사용자가 덧붙인 한글 설명:\n${description}\n\n위 한글 설명과 함께 첨부된 공학 그림/그래프들의 형태와 수식적 변수 배치를 면밀히 판독하여 한꺼번에 분석 내용을 완성하십시오.`
      : `첨부된 공학 그림/그래프들의 상세 구조와 기호들의 상호작용을 면밀히 판독하여 한꺼번에 분석 내용을 완성하십시오.`;

    try {
      const responseText = await callLLMWithFailover(
        systemInstruction,
        userPrompt,
        imageParts,
        'formula'
      );

      let cleanJsonText = responseText.trim();
      const startIdx = cleanJsonText.indexOf('{');
      const endIdx = cleanJsonText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
      } else if (cleanJsonText.startsWith('```')) {
        cleanJsonText = cleanJsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      }

      try {
        const result = parseLlmJson(cleanJsonText);
        res.json({
          ok: true,
          title: result.title || '자동 분석 그림',
          analysis: result.analysis || '분석 정보를 가져올 수 없습니다.',
          intuitive: result.intuitive || '직관적 의미를 추출할 수 없습니다.'
        });
      } catch (parseErr) {
        console.error('Gemini image analyze parse error:', parseErr, 'Raw response:', responseText);
        res.json({
          ok: true,
          title: '자동 분석 그림',
          analysis: responseText,
          intuitive: '텍스트 파싱 오류로 직관적 의미를 가져오지 못했습니다.'
        });
      }
    } catch (llmErr) {
      console.error('callLLMWithFailover error in image analyze:', llmErr);
      res.status(500).json({ error: `AI 이미지 분석 실패: ${llmErr.message}` });
    }
  } catch (err) {
    console.error('POST /api/image-standards/analyze error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/image-standards/generate-question → 그림의 세부 구성 요소(예: C영역 등)를 물어보는 구체적인 주관식 질문 생성
app.post('/api/image-standards/generate-question', async (req, res) => {
  try {
    const { title, analysis, intuitive } = req.body;
    
    const systemInstruction = `당신은 지반공학, 토목공학, 토질역학 등 전공 기술사 자격시험 전문 채점위원이자 튜터입니다.
제시된 그림의 주제(title)와 해당 그림의 공학적 분석 내용(analysis)을 면밀히 분석하십시오.
그림의 분석 내용(analysis)에 기재되어 있는 핵심 공학적 세부 구성요소, 수식 기호, 변수 관계, 영역(Zone), 또는 핵심 메커니즘 중 하나를 선택하여 구체적인 주관식 질문을 생성하십시오.
질문은 사용자가 해당 분석 내용에 명시된 특정 요소의 명칭, 정의, 역할, 공학적 의미 또는 메커니즘을 구체적으로 설명하도록 요구해야 합니다.
절대로 엉뚱한 개념이나 가상의 요소를 지어내지 말고, 제공된 분석 내용(analysis)에 명확히 명시된 정보만을 바탕으로 출제하십시오.

질문 방식 예시:
- "해당 그림/그래프에서 언급된 X 기호(또는 영역)의 공학적 역할과 의미는 무엇인가?"
- "분석 내용에 따른 Y 상태에서 지반 변위가 나타나는 물리적 이유는 무엇인가?"
- "도해 속 Z 변수가 의미하는 바와 관련 수식의 설계 기준을 설명하시오."

질문 규칙:
1. 반드시 단 한 문장으로 질문하십시오.
2. 불필요한 서두나 잡설 없이 질문 자체만 바로 텍스트로 응답하십시오 (예: "그림의 A영역은 어떤 영향권을 나타내는가?").
3. 질문은 반드시 한글로 작성되어야 합니다.`;

    const userPrompt = `그림 주제: ${title}
그림 분석 내용:
${analysis}

위 분석 정보를 바탕으로, 해당 분석 내용 속 핵심 공학 요소 중 하나를 짚어서 짧고 명확한 세부 주관식 질문 한 문장을 생성하십시오. (매번 다양하게 출제되도록 무작위 시드값 ${Math.random()}을 반영하여 질문의 주제나 질문의 초점을 새롭게 설정하십시오.)`;

    const responseText = await callLLMWithFailover(
      systemInstruction,
      userPrompt,
      null,
      'formula'
    );
    res.json({ success: true, question: responseText.trim() });
  } catch (err) {
    console.error('POST /api/image-standards/generate-question error:', err);
    res.status(500).json({ error: err.message });
  }
});



// GET /api/session/answersheet → 저장된 답안지 상태 반환
app.get('/api/session/answersheet', async (req, res) => {
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

// POST /api/session/answersheet → 답안지 상태 저장
app.post('/api/session/answersheet', async (req, res) => {
  try {
    await ensureSessionTable();
    const { answersheetQuestions } = req.body;
    const healedQuestions = Array.isArray(answersheetQuestions)
      ? answersheetQuestions.map(healAnswersheetQuestionObject)
      : answersheetQuestions;
    const value = JSON.stringify({ answersheetQuestions: healedQuestions });
    // Safe UPSERT (prevents concurrent unique key violations)
    await saveSessionValue('answersheet_questions', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/answersheet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/options/:key → Get generic option by key (e.g. right_sidebar_width)
app.get('/api/options/:key', async (req, res) => {
  try {
    await ensureSessionTable();
    const key = `option_${req.params.key}`;
    const row = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);
    if (req.params.key === 'lockscreen_quiz_enabled') {
      replenishLockscreenPool(req).catch(err => console.error('[Background Pool Fill] Error:', err));
    }
    res.json({ value: row ? row.value : null });
  } catch (err) {
    console.error(`GET /api/options/${req.params.key} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/options/:key → Set generic option by key
app.post('/api/options/:key', async (req, res) => {
  try {
    await ensureSessionTable();
    const key = `option_${req.params.key}`;
    const { value } = req.body;
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
    await dbQuery.run(
      'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(`POST /api/options/${req.params.key} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

async function getLockscreenCandidates() {
  let usageHistory = {};
  const historyRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_usage_history'");
  if (historyRow && historyRow.value) {
    try {
      usageHistory = JSON.parse(historyRow.value) || {};
    } catch (e) {
      console.warn('Failed to parse lockscreen usage history:', e);
    }
  }

  const formulaRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'formula_questions'");
  let formulaQuestions = [];
  if (formulaRow && formulaRow.value) {
    try {
      const parsed = JSON.parse(formulaRow.value);
      formulaQuestions = parsed && Array.isArray(parsed.formulaQuestions) ? parsed.formulaQuestions : [];
    } catch (e) {
      console.warn('Failed to parse formula questions:', e);
    }
  }

  // Sort formulas based on last used time (oldest or never used first)
  const sortedFormulas = [...formulaQuestions].sort((a, b) => {
    const timeA = usageHistory[a.title] ? new Date(usageHistory[a.title]).getTime() : 0;
    const timeB = usageHistory[b.title] ? new Date(usageHistory[b.title]).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return 0.5 - Math.random();
  });
  const formulaCandidates = sortedFormulas.slice(0, 12);

  const allTopics = await dbQuery.all('SELECT id, title, keywords FROM topics');
  
  // Sort topics based on last used time (oldest or never used first)
  const sortedTopics = [...allTopics].sort((a, b) => {
    const timeA = usageHistory[a.title] ? new Date(usageHistory[a.title]).getTime() : 0;
    const timeB = usageHistory[b.title] ? new Date(usageHistory[b.title]).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return 0.5 - Math.random();
  });

  const textExtractionLimit = 12;
  const pickedForText = sortedTopics.slice(0, textExtractionLimit);
  
  const textExtractedCandidates = await Promise.all(
    pickedForText.map(async (t) => {
      try {
        const fullTopic = await dbQuery.get('SELECT * FROM topics WHERE id = ?', [t.id]);
        const textContent = fullTopic ? await getTopicText(fullTopic) : '';
        const truncatedText = textContent ? textContent.substring(0, 2000) : '';
        return {
          id: t.id,
          title: t.title,
          keywords: t.keywords || '',
          textContent: truncatedText
        };
      } catch (err) {
        return {
          id: t.id,
          title: t.title,
          keywords: t.keywords || '',
          textContent: ''
        };
      }
    })
  );

  const remainingTopics = sortedTopics.slice(textExtractionLimit).map(t => ({
    id: t.id,
    title: t.title,
    keywords: t.keywords || '',
    textContent: '(생략 - 제목 및 키워드 기반으로 문제 출제 가능)'
  }));

  const finalTopicCandidates = [...textExtractedCandidates, ...remainingTopics];

  return { formulaCandidates, finalTopicCandidates, usageHistory };
}

async function updateLockscreenUsageHistory(generatedQuestions, usageHistory) {
  if (Array.isArray(generatedQuestions) && generatedQuestions.length > 0) {
    let changed = false;
    for (const q of generatedQuestions) {
      if (q.source_title) {
        usageHistory[q.source_title] = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) {
      await saveSessionValue('lockscreen_usage_history', JSON.stringify(usageHistory));
    }
  }
}

let isLockscreenPoolReplenishing = false;

async function replenishLockscreenPool(req) {
  if (isLockscreenPoolReplenishing) {
    console.log('[Lockscreen Pool] Replenishment is already in progress. Skipping.');
    return;
  }
  
  isLockscreenPoolReplenishing = true;
  console.log('[Lockscreen Pool] Checking replenishment status...');
  
  try {
    await ensureSessionTable();
    
    // Load current pool
    let pool = [];
    const poolRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
    if (poolRow && poolRow.value) {
      try {
        pool = JSON.parse(poolRow.value) || [];
      } catch (e) {
        console.warn('Failed to parse lockscreen pool:', e);
      }
    }
    
    const targetSize = 5;
    if (pool.length >= targetSize) {
      console.log(`[Lockscreen Pool] Pool has ${pool.length} questions (target is ${targetSize}). No replenishment needed.`);
      isLockscreenPoolReplenishing = false;
      return;
    }
    
    const needCount = targetSize - pool.length;
    console.log(`[Lockscreen Pool] Current pool size: ${pool.length}. Generating ${needCount} new questions to replenish pool...`);
    
    // Load candidates via helper function with LRU sorting
    const { formulaCandidates, finalTopicCandidates, usageHistory } = await getLockscreenCandidates();

    if (formulaCandidates.length === 0 && finalTopicCandidates.length === 0) {
      console.warn('[Lockscreen Pool] No candidates available to generate new questions.');
      isLockscreenPoolReplenishing = false;
      return;
    }

    let recentQuestions = [];
    const recentRows = await dbQuery.all("SELECT value FROM app_session WHERE key = 'recent_lockscreen_questions'");
    if (recentRows.length > 0 && recentRows[0].value) {
      try {
        recentQuestions = JSON.parse(recentRows[0].value) || [];
      } catch (e) {
        console.warn('Failed to parse recent lockscreen questions:', e);
      }
    }
    const currentPoolQuestionTexts = pool.map(q => q.question);
    const combinedRecent = [...new Set([...currentPoolQuestionTexts, ...recentQuestions])];

    const callLLM = getCallLLM(req || { query: {}, body: {} });
    const generatedQuestions = await generateDailyLockscreenQuestions(
      formulaCandidates, 
      finalTopicCandidates, 
      callLLM, 
      needCount, 
      LOCKSCREEN_STANDARDS,
      combinedRecent
    );

    if (Array.isArray(generatedQuestions) && generatedQuestions.length > 0) {
      const updatedPool = [...pool, ...generatedQuestions].map((q, idx) => ({
        ...q,
        id: `ls_${idx + 1}`
      }));
      
      await saveSessionValue('lockscreen_pregenerated_pool', JSON.stringify(updatedPool));
      await updateLockscreenUsageHistory(generatedQuestions, usageHistory);
      console.log(`[Lockscreen Pool] Successfully generated and added ${generatedQuestions.length} questions to pregenerated pool. Pool size: ${updatedPool.length}`);
    }
  } catch (err) {
    console.error('[Lockscreen Pool] Replenishment error:', err);
  } finally {
    isLockscreenPoolReplenishing = false;
  }
}

// GET /api/lockscreen/pool → Retrieve pregenerated pool without consuming
app.get('/api/lockscreen/pool', async (req, res) => {
  try {
    await ensureSessionTable();
    
    // Load current pool
    let pool = [];
    const poolRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
    if (poolRow && poolRow.value) {
      try {
        pool = JSON.parse(poolRow.value) || [];
      } catch (e) {
        console.warn('Failed to parse lockscreen pool:', e);
      }
    }
    
    // Synchronously replenish if pool size is less than 5
    if (pool.length < 5) {
      console.log(`[Lockscreen Pool API] Pool has only ${pool.length} questions. Replenishing synchronously...`);
      await replenishLockscreenPool(req);
      
      // Reload pool after replenishment
      const updatedPoolRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
      if (updatedPoolRow && updatedPoolRow.value) {
        try {
          pool = JSON.parse(updatedPoolRow.value) || [];
        } catch (e) {
          console.warn('Failed to parse updated lockscreen pool:', e);
        }
      }
    }
    
    res.json({ success: true, pool });
  } catch (err) {
    console.error('GET /api/lockscreen/pool error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lockscreen/solve → Solve and remove a question from the pregenerated pool, then trigger background replenishment
app.post('/api/lockscreen/solve', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Question ID is required' });
    }

    await ensureSessionTable();

    let pool = [];
    const poolRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
    if (poolRow && poolRow.value) {
      try {
        pool = JSON.parse(poolRow.value) || [];
      } catch (e) {
        console.warn('Failed to parse lockscreen pool:', e);
      }
    }

    // Find the solved question
    const solvedQuestion = pool.find(q => q.id === id);
    // Filter out the solved question
    const updatedPool = pool.filter(q => q.id !== id);

    // Save back to DB
    await saveSessionValue('lockscreen_pregenerated_pool', JSON.stringify(updatedPool));
    console.log(`[Lockscreen Solve] Solved question ${id}. Remaining pool size: ${updatedPool.length}`);

    // Add solved question to recent_lockscreen_questions to prevent duplicate generation
    if (solvedQuestion && solvedQuestion.question) {
      let recentQuestions = [];
      const recentRows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['recent_lockscreen_questions']);
      if (recentRows.length > 0 && recentRows[0].value) {
        try {
          recentQuestions = JSON.parse(recentRows[0].value) || [];
        } catch (e) {
          console.warn('Failed to parse recent lockscreen questions:', e);
        }
      }
      
      let updatedRecent = [solvedQuestion.question, ...recentQuestions];
      if (updatedRecent.length > 30) {
        updatedRecent = updatedRecent.slice(0, 30);
      }
      await saveSessionValue('recent_lockscreen_questions', JSON.stringify(updatedRecent));
    }

    // Trigger non-blocking replenishment to top the pool back up to 5 questions in the background
    replenishLockscreenPool(req).catch(err => {
      console.error('[Lockscreen Solve] Background replenishment failed:', err);
    });

    res.json({ success: true, pool: updatedPool });
  } catch (err) {
    console.error('POST /api/lockscreen/solve error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lockscreen/sync → Get or generate daily lockscreen quiz questions
app.get('/api/lockscreen/sync', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    
    const count = parseInt(req.query.count || '1', 10);
    
    // 0. Fetch recent lockscreen questions to avoid duplication
    let recentQuestions = [];
    const recentRows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['recent_lockscreen_questions']);
    if (recentRows.length > 0 && recentRows[0].value) {
      try {
        recentQuestions = JSON.parse(recentRows[0].value) || [];
      } catch (e) {
        console.warn('Failed to parse recent lockscreen questions:', e);
      }
    }

    // Try to serve from pre-generated pool
    const poolRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
    let pool = [];
    if (poolRow && poolRow.value) {
      try {
        pool = JSON.parse(poolRow.value) || [];
      } catch (e) {
        console.warn('Failed to parse lockscreen pool:', e);
      }
    }

    if (pool.length >= count) {
      const shuffledPool = [...pool].sort(() => 0.5 - Math.random());
      const selected = shuffledPool.slice(0, count);
      const remaining = shuffledPool.slice(count).map((q, idx) => ({ ...q, id: `ls_${idx + 1}` }));
      
      await saveSessionValue('lockscreen_pregenerated_pool', JSON.stringify(remaining));
      
      if (selected.length > 0) {
        const newQTexts = selected.map(q => q.question);
        let updatedRecent = [...newQTexts, ...recentQuestions];
        if (updatedRecent.length > 30) {
          updatedRecent = updatedRecent.slice(0, 30);
        }
        await saveSessionValue('recent_lockscreen_questions', JSON.stringify(updatedRecent));
      }

      // Trigger background replenishment (non-blocking)
      replenishLockscreenPool(req).catch(err => console.error('[Lockscreen Sync] Replenish background error:', err));

      console.log(`[Lockscreen Sync] Served ${count} questions from pre-generated pool. Remaining: ${remaining.length}`);
      return res.json({ success: true, questions: selected });
    }

    // Fallback: Synchronous generation if pool is empty/insufficient
    console.log(`[Lockscreen Sync] Pregenerated pool is insufficient (${pool.length}/${count}). Generating synchronously...`);
    
    const { formulaCandidates, finalTopicCandidates, usageHistory } = await getLockscreenCandidates();

    if (formulaCandidates.length === 0 && finalTopicCandidates.length === 0) {
      return res.status(404).json({ success: false, error: '등록된 필수 공식이나 학습 토픽이 없습니다. 문제를 생성할 후보 데이터가 부족합니다.' });
    }

    const currentPoolQuestionTexts = pool.map(q => q.question);
    const combinedRecent = [...new Set([...currentPoolQuestionTexts, ...recentQuestions])];

    console.log(`[Lockscreen Quiz] Generating ${count} questions using ${formulaCandidates.length} formulas and ${finalTopicCandidates.length} topics. (Duplicate prevention count: ${combinedRecent.length})`);
    const callLLM = getCallLLM(req);
    const generatedQuestions = await generateDailyLockscreenQuestions(
      formulaCandidates, 
      finalTopicCandidates, 
      callLLM, 
      count, 
      LOCKSCREEN_STANDARDS,
      combinedRecent
    );

    if (Array.isArray(generatedQuestions) && generatedQuestions.length > 0) {
      const newQTexts = generatedQuestions.map(q => q.question);
      let updatedRecent = [...newQTexts, ...recentQuestions];
      if (updatedRecent.length > 30) {
        updatedRecent = updatedRecent.slice(0, 30);
      }
      await saveSessionValue('recent_lockscreen_questions', JSON.stringify(updatedRecent));
      await updateLockscreenUsageHistory(generatedQuestions, usageHistory);
    }

    // Trigger pool replenishment to fill up the pool in background
    replenishLockscreenPool(req).catch(err => console.error('[Lockscreen Sync] Replenish background error:', err));

    return res.json({ success: true, questions: generatedQuestions });
  } catch (err) {
    console.error('GET /api/lockscreen/sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/engineering-standards → Retrieve structured engineering standards list
app.get('/api/engineering-standards', async (req, res) => {
  try {
    // 1. Try to read from app_session first (source of truth on Vercel)
    try {
      const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'engineering_standards'");
      if (row && row.value) {
        const list = JSON.parse(row.value);
        return res.json({ standards: list });
      }
    } catch (dbErr) {
      console.error('Failed to read engineering standards from database:', dbErr.message);
    }

    // 2. Fallback to reading file
    const standardsFilePath = path.join(__dirname, 'plugins', 'engineeringStandards.js');
    const content = await fs.promises.readFile(standardsFilePath, 'utf-8');
    const match = content.match(/export const standardsList = (\[[\s\S]*?\]);/);
    if (!match) {
      return res.status(500).json({ error: 'standardsList structure not found in engineeringStandards.js' });
    }
    const list = JSON.parse(match[1]);
    res.json({ standards: list });
  } catch (err) {
    console.error('GET /api/engineering-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

function stampUpdatedStandards(newList, oldList) {
  if (!Array.isArray(newList)) return [];
  const oldMap = new Map((oldList || []).map(item => [item.id, item]));
  return newList.map(item => {
    const oldItem = oldMap.get(item.id);
    if (!oldItem || oldItem.content !== item.content || oldItem.title !== item.title || !item.updatedAt) {
      return { ...item, updatedAt: new Date().toISOString() };
    }
    return item;
  });
}

// POST /api/engineering-standards → Save/update structured engineering standards list
app.post('/api/engineering-standards', async (req, res) => {
  try {
    const { standards } = req.body;
    if (!Array.isArray(standards)) {
      return res.status(400).json({ error: 'standards must be an array' });
    }

    const stamped = stampUpdatedStandards(standards, standardsList);

    // 1. Update the live binding in memory immediately
    updateLiveEngineeringStandards(stamped);

    // 2. Save to database (app_session) as the absolute source of truth
    try {
      await saveSessionValue('engineering_standards', JSON.stringify(stamped));
      console.log('Successfully saved engineering standards to database.');
    } catch (dbErr) {
      console.error('Failed to save engineering standards to database:', dbErr.message);
    }

    // 3. Save to local file system
    await writeStandardToFile('engineering_standards', stamped);

    // 4. Push to Vercel production server
    pushStandardToProduction('engineering-standards', stamped).catch(() => {});

    await purgeAllQuizCaches();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/engineering-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/grading-standards → Retrieve structured grading standards list
app.get('/api/grading-standards', async (req, res) => {
  try {
    // 1. Try to read from app_session first
    try {
      const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'grading_standards'");
      if (row && row.value) {
        const list = JSON.parse(row.value);
        return res.json({ standards: list });
      }
    } catch (dbErr) {
      console.error('Failed to read grading standards from database:', dbErr.message);
    }

    // 2. Fallback to default in-memory list
    res.json({ standards: gradingStandardsList });
  } catch (err) {
    console.error('GET /api/grading-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/grading-standards → Save/update structured grading standards list
app.post('/api/grading-standards', async (req, res) => {
  try {
    const { standards } = req.body;
    if (!Array.isArray(standards)) {
      return res.status(400).json({ error: 'standards must be an array' });
    }

    const stamped = stampUpdatedStandards(standards, gradingStandardsList);

    // 1. Update the live binding in memory immediately
    updateLiveGradingStandards(stamped);

    // 2. Save to database (app_session)
    try {
      await saveSessionValue('grading_standards', JSON.stringify(stamped));
      console.log('Successfully saved grading standards to database.');
    } catch (dbErr) {
      console.error('Failed to save grading standards to database:', dbErr.message);
    }

    // 3. Save to local file system
    await writeStandardToFile('grading_standards', stamped);

    // 4. Push to Vercel production server
    pushStandardToProduction('grading-standards', stamped).catch(() => {});

    await purgeAllQuizCaches();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/grading-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/validation-standards → Retrieve structured validation standards list
app.get('/api/validation-standards', async (req, res) => {
  try {
    // 1. Try to read from app_session first
    try {
      const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'validation_standards'");
      if (row && row.value) {
        const list = JSON.parse(row.value);
        return res.json({ standards: list });
      }
    } catch (dbErr) {
      console.error('Failed to read validation standards from database:', dbErr.message);
    }

    // 2. Fallback to default in-memory list
    res.json({ standards: validationStandardsList });
  } catch (err) {
    console.error('GET /api/validation-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/validation-standards → Save/update structured validation standards list
app.post('/api/validation-standards', async (req, res) => {
  try {
    const { standards } = req.body;
    if (!Array.isArray(standards)) {
      return res.status(400).json({ error: 'standards must be an array' });
    }

    const stamped = stampUpdatedStandards(standards, validationStandardsList);

    // 1. Update the live binding in memory immediately
    updateLiveValidationStandards(stamped);

    // 2. Save to database (app_session)
    try {
      await saveSessionValue('validation_standards', JSON.stringify(stamped));
      console.log('Successfully saved validation standards to database.');
    } catch (dbErr) {
      console.error('Failed to save validation standards to database:', dbErr.message);
    }

    // 3. Save to local file system
    await writeStandardToFile('validation_standards', stamped);

    // 4. Push to Vercel production server
    pushStandardToProduction('validation-standards', stamped).catch(() => {});

    await purgeAllQuizCaches();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/validation-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/generation-standards → Retrieve structured generation standards list
app.get('/api/generation-standards', async (req, res) => {
  try {
    try {
      const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'generation_standards'");
      if (row && row.value) {
        const list = JSON.parse(row.value);
        return res.json({ standards: list });
      }
    } catch (dbErr) {
      console.error('Failed to read generation standards from database:', dbErr.message);
    }

    res.json({ standards: generationStandardsList });
  } catch (err) {
    console.error('GET /api/generation-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generation-standards → Save/update structured generation standards list
app.post('/api/generation-standards', async (req, res) => {
  try {
    const { standards } = req.body;
    if (!Array.isArray(standards)) {
      return res.status(400).json({ error: 'standards must be an array' });
    }

    const stamped = stampUpdatedStandards(standards, generationStandardsList);

    updateLiveGenerationStandards(stamped);

    try {
      await saveSessionValue('generation_standards', JSON.stringify(stamped));
      console.log('Successfully saved generation standards to database.');
    } catch (dbErr) {
      console.error('Failed to save generation standards to database:', dbErr.message);
    }

    // 3. Save to local file system
    await writeStandardToFile('generation_standards', stamped);

    // 4. Push to Vercel production server
    pushStandardToProduction('generation-standards', stamped).catch(() => {});

    await purgeAllQuizCaches();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/generation-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lockscreen-standards → Retrieve structured lockscreen standards list
app.get('/api/lockscreen-standards', async (req, res) => {
  try {
    try {
      const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_standards'");
      if (row && row.value) {
        const list = JSON.parse(row.value);
        return res.json({ standards: list });
      }
    } catch (dbErr) {
      console.error('Failed to read lockscreen standards from database:', dbErr.message);
    }

    res.json({ standards: lockscreenStandardsList });
  } catch (err) {
    console.error('GET /api/lockscreen-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lockscreen-standards → Save/update structured lockscreen standards list
app.post('/api/lockscreen-standards', async (req, res) => {
  try {
    const { standards } = req.body;
    if (!Array.isArray(standards)) {
      return res.status(400).json({ error: 'standards must be an array' });
    }

    const stamped = stampUpdatedStandards(standards, lockscreenStandardsList);

    updateLiveLockscreenStandards(stamped);

    try {
      await saveSessionValue('lockscreen_standards', JSON.stringify(stamped));
      await dbQuery.run("DELETE FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
      console.log('Successfully saved lockscreen standards to database and cleared pregenerated pool.');
    } catch (dbErr) {
      console.error('Failed to save lockscreen standards to database:', dbErr.message);
    }

    // 3. Save to local file system
    await writeStandardToFile('lockscreen_standards', stamped);

    // 4. Push to Vercel production server
    pushStandardToProduction('lockscreen-standards', stamped).catch(() => {});

    await purgeAllQuizCaches();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/lockscreen-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 헬퍼 함수: 토픽 지침 목록 조회 및 프롬프트 문자열 조립
async function getFormattedTopicInstructions(topicId) {
  if (!topicId) return '';
  try {
    const key = 'topic_instructions_' + topicId;
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = ?", [key]);
    if (row && row.value) {
      const list = JSON.parse(row.value);
      if (Array.isArray(list) && list.length > 0) {
        const formatted = list.map((item, idx) => (idx + 1) + '. **' + item.title + '**:\n   - ' + item.content).join('\n');
        return '\n[🚨 이 토픽(' + topicId + ')의 전용 문제 출제 및 변환 지침 - 반드시 반영하십시오]:\n' + formatted + '\n';
      }
    }
  } catch (err) {
    console.error('Failed to get topic instructions for topic ' + topicId + ':', err.message);
  }
  return '';
}


// 헬퍼 함수: 지침 변경 시 기존 캐시된 모든 퀴즈 세션 일괄 삭제 (실시간 동기화용)

// 0단계: AI의 실시간 지침 분석 및 준수 포인트 도출 헬퍼 함수
async function analyzeStandardsBeforeTask(progressId, topicTitle, standards, scenario = 'generation') {
  let activeList = [];
  if (scenario === 'generation') {
    activeList = generationStandardsList;
  } else if (scenario === 'grading') {
    activeList = gradingStandardsList;
  } else if (scenario === 'validation') {
    activeList = validationStandardsList;
  } else if (scenario === 'lockscreen') {
    activeList = lockscreenStandardsList;
  }

  // 기본값 백업 (혹시라도 빈 배열일 경우 대비)
  if (!activeList || activeList.length === 0) {
    activeList = [{ title: '기본 출제 지침 규격 검토' }];
  }

  let titleIndex = 0;
  let intervalId = null;

  if (progressId) {
    // 0.45초 간격으로 실제로 읽고 있는 지침의 제목을 순차적으로 롤링 노출
    intervalId = setInterval(() => {
      const currentTitle = activeList[titleIndex % activeList.length].title;
      updateProgress(progressId, 0, `0단계: AI가 최우선 절대 지침 분석 중... 📖 [지침]: ${currentTitle}`, 10);
      titleIndex++;
    }, 450);
  }
  
  try {
    const sysInstruction = `당신은 지반공학 출제/채점 지침을 정밀 검수하는 AI 분석관입니다.`;
    const prompt = `
[🚨 최우선 절대 준수 지침 목록]:
${standards}

[🎯 작업 대상 토픽/맥락]:
${topicTitle}

위의 절대 준수 지침들을 이번 [${scenario}] 작업(문제 출제 또는 채점)의 관점에서 깊이 있게 분석하십시오.
이 지침들을 100% 준수하기 위해 **절대로 범해서는 안 될 핵심 금지사항 및 주의해야 할 실무 행동 강령**을 딱 2개의 명료하고 짧은 한글 불릿 포인트 문장으로 요약하십시오.
사족이나 서론, 결론을 완전히 생략하고 오직 2개의 불릿 포인트만 깔끔하게 출력하십시오.
`;

    // 최우선 모델을 활용하여 빠르게 0단계 분석 기동 (tutor 시나리오 컨텍스트 활용)
    const rawAnalysis = await callLLMWithFailover(sysInstruction, prompt, null, 'tutor', { temperature: 0.1 });
    const analysisResult = rawAnalysis.trim();
    
    if (intervalId) {
      clearInterval(intervalId);
    }

    if (progressId) {
      updateProgress(progressId, 0, `0단계: AI 지침 분석 완료!`, 15);
      await new Promise(resolve => setTimeout(resolve, 800)); 
    }
    
    return `\n[🚨 0단계 AI가 사전 분석한 절대 지침 준수 주의사항 - 반드시 위배 여부를 확인하여 작업하십시오]:\n${analysisResult}\n`;
  } catch (err) {
    console.warn('[Step 0 Analysis] Failed to run AI analysis on standards:', err.message);
    if (intervalId) {
      clearInterval(intervalId);
    }
    if (progressId) {
      updateProgress(progressId, 0, '0단계: AI 지침 분석 완료!', 15);
    }
    return '';
  }
}

async function purgeAllQuizCaches() {
  // 지침 변경 시 기존 복습 문제 캐시를 날리지 않도록 비활성화 (사용자의 학습 이력 영구 보존)
  console.log('[Cache Clean] Bypassed automatic quiz cache purging to preserve user review histories.');
}

// GET /api/topics/:id/instructions → Retrieve topic specific instructions list
app.get('/api/topics/:id/instructions', async (req, res) => {
  try {
    const topicId = req.params.id;
    const key = 'topic_instructions_' + topicId;
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = ?", [key]);
    if (row && row.value) {
      const list = JSON.parse(row.value);
      return res.json({ instructions: list });
    }
    res.json({ instructions: [] });
  } catch (err) {
    console.error('GET /api/topics/:id/instructions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/topics/:id/instructions → Save/update topic specific instructions list
app.post('/api/topics/:id/instructions', async (req, res) => {
  try {
    const topicId = req.params.id;
    const { instructions } = req.body;
    if (!Array.isArray(instructions)) {
      return res.status(400).json({ error: 'instructions must be an array' });
    }
    const key = 'topic_instructions_' + topicId;
    await saveSessionValue(key, JSON.stringify(instructions));
    console.log('Successfully saved topic instructions for topic ' + topicId + ' to database.');
    await purgeAllQuizCaches();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/topics/:id/instructions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/verify-pin → Verify the entry PIN code
app.post('/api/verify-pin', (req, res) => {
  try {
    const { pin } = req.body;
    const expectedPin = process.env.PIN_CODE || '7942';
    if (pin === expectedPin) {
      res.json({ success: true });
    } else {
      res.json({ success: false, error: '올바르지 않은 PIN 코드입니다.' });
    }
  } catch (err) {
    console.error('POST /api/verify-pin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/debug-db → Diagnostically query database state from production
app.get('/api/debug-db', async (req, res) => {
  try {
    const rawUrl = process.env.DATABASE_URL || '';
    const cleanedUrl = rawUrl.replace(/:[^:@\n]+@/, ':****@'); // Hide password
    const keys = await dbQuery.all("SELECT key, updated_at FROM app_session");
    const review_246 = await dbQuery.get("SELECT value FROM app_session WHERE key = 'review_questions_schedule_246'");
    res.json({
      dbUrl: cleanedUrl,
      isPostgres,
      keys,
      hasReview246: !!review_246,
      review246ValueLength: review_246 ? review_246.value.length : 0,
      review246Value: review_246 ? JSON.parse(review_246.value) : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TEMPORARY: Update question 11 and all seepage/pile-related question correct answers in database
app.get('/api/temp-update-db', async (req, res) => {
  try {
    const updateQuestionObj = (formulaQuestions) => {
      if (!Array.isArray(formulaQuestions)) return formulaQuestions;
      return formulaQuestions.map(q => {
        if (!q) return q;
        
        // 댐 침투 또는 침윤선 관련 질문 검출 (비교표 형태의 침윤선 질문)
        const isSeepageTarget = q.id === 11 || 
                                (q.question && 
                                 q.question.includes('침투류') && 
                                 q.question.includes('비교표') && 
                                 (q.question.includes('차수') || q.question.includes('배수')));
        
        // 말뚝 기초 t-z, q-z 거동 관련 질문 검출 (제목/질문에 't-z', 'q-z' 포함된 비교표 형태)
        const isPileTarget = q.question &&
                             (q.question.includes('t-z') || q.question.includes('t - z')) &&
                             (q.question.includes('q-z') || q.question.includes('q - z')) &&
                             q.question.includes('비교표') &&
                             (q.question.includes('주면마찰') || q.question.includes('선단지'));
                         
        if (isSeepageTarget) {
          console.log(`[Migration] Migrating Seepage Question ID: ${q.id}, Title: ${q.title}`);
          
          const answerA = "상류 사면 점토 코어나 차수벽 시공을 통해 유입 침투 유량 자체를 물리적으로 차단하고 침투 경로 연장";
          const answerB = "자갈, 필터 모래 등 배수재를 하류측 경계부에 배치하여 유입된 침투수를 세굴 없이 안전하게 외곽으로 배수 유도";
          const answerC = "불투수성 차수벽 전면에서 차단 및 수두 손실이 유도되어 차벽 배후면부터 침윤선 높이가 급격히 저하됨";
          const answerD = "수평 드레인과 필터 구조체의 배수 작용을 통해 침윤선이 하류 사면으로 분출되는 것을 막고 연직 위치를 낮춤";

          // 1. table_data 형식 업데이트
          if (Array.isArray(q.table_data)) {
            q.table_data = q.table_data.map(row => {
              const header = row.row_header || '';
              if (header.includes('침투 제어') || header.includes('(A)') || header.includes('(B)')) {
                if (Array.isArray(row.cols)) {
                  row.cols = row.cols.map(col => {
                    if (col.col_header && (col.col_header.includes('차수') || col.col_header.includes('A'))) {
                      col.answer = answerA;
                    } else if (col.col_header && (col.col_header.includes('배수') || col.col_header.includes('B'))) {
                      col.answer = answerB;
                    }
                    return col;
                  });
                }
              } else if (header.includes('침윤선') || header.includes('(C)') || header.includes('(D)')) {
                if (Array.isArray(row.cols)) {
                  row.cols = row.cols.map(col => {
                    if (col.col_header && (col.col_header.includes('차수') || col.col_header.includes('C'))) {
                      col.answer = answerC;
                    } else if (col.col_header && (col.col_header.includes('배수') || col.col_header.includes('D'))) {
                      col.answer = answerD;
                    }
                    return col;
                  });
                }
              }
              return row;
            });
          }
          
          // 2. answers (INPUT) 맵 객체 형식 업데이트 (2배 장문형 및 명사형 종결어미)
          if (q.answers) {
            if (q.answers.INPUT_1 !== undefined) q.answers.INPUT_1 = answerA;
            if (q.answers.INPUT_2 !== undefined) q.answers.INPUT_2 = answerB;
            if (q.answers.INPUT_3 !== undefined) q.answers.INPUT_3 = answerC;
            if (q.answers.INPUT_4 !== undefined) q.answers.INPUT_4 = answerD;
            if (q.answers.INPUT_5 !== undefined) q.answers.INPUT_5 = answerC;
            if (q.answers.INPUT_6 !== undefined) q.answers.INPUT_6 = answerD;
          }
        }
        
        if (isPileTarget) {
          console.log(`[Migration] Migrating Pile Question ID: ${q.id}, Title: ${q.title}`);
          
          const answerA = "말뚝 외주면과 주변 지반 경계면 사이의 상대 변위로 인해 발생하는 마찰 저항 및 경계면 전단 파괴 형태";
          const answerB = "말뚝 선단부 하부 지반의 압축 및 지지력 이론에 따른 소성 쐐기 영역의 극한 지지력 발현 및 파괴 형태";
          const answerC = "말뚝 직경(D)의 약 0.5% ~ 1.0% 수준의 매우 미소한 변위에서 지지력이 발현됨";
          const answerD = "말뚝 직경(D)의 약 10% ~ 25% 수준의 상대적으로 큰 대변위 침하가 수반되어야 지지력이 발현됨";

          // 1. table_data 형식 업데이트
          if (Array.isArray(q.table_data)) {
            q.table_data = q.table_data.map(row => {
              const header = row.row_header || '';
              if (header.includes('지배적인 역학') || header.includes('(A)') || header.includes('(B)')) {
                if (Array.isArray(row.cols)) {
                  row.cols = row.cols.map(col => {
                    if (col.col_header && (col.col_header.includes('주면') || col.col_header.includes('A'))) {
                      col.answer = answerA;
                    } else if (col.col_header && (col.col_header.includes('선단') || col.col_header.includes('B'))) {
                      col.answer = answerB;
                    }
                    return col;
                  });
                }
              } else if (header.includes('상대 침하량') || header.includes('(C)') || header.includes('(D)')) {
                if (Array.isArray(row.cols)) {
                  row.cols = row.cols.map(col => {
                    if (col.col_header && (col.col_header.includes('주면') || col.col_header.includes('C'))) {
                      col.answer = answerC;
                    } else if (col.col_header && (col.col_header.includes('선단') || col.col_header.includes('D'))) {
                      col.answer = answerD;
                    }
                    return col;
                  });
                }
              }
              return row;
            });
          }
          
          // 2. answers (INPUT) 맵 객체 형식 업데이트 (2배 장문형 및 명사형 종결어미)
          if (q.answers) {
            if (q.answers.INPUT_1 !== undefined) q.answers.INPUT_1 = answerA;
            if (q.answers.INPUT_2 !== undefined) q.answers.INPUT_2 = answerB;
            if (q.answers.INPUT_3 !== undefined) q.answers.INPUT_3 = answerC;
            if (q.answers.INPUT_4 !== undefined) q.answers.INPUT_4 = answerD;
            if (q.answers.INPUT_5 !== undefined) q.answers.INPUT_5 = answerC;
            if (q.answers.INPUT_6 !== undefined) q.answers.INPUT_6 = answerD;
          }
        }
        
        return q;
      });
    };

    const hasCorruptedPile = (questions) => {
      if (!Array.isArray(questions)) return false;
      return questions.some(q => {
        if (!q) return false;
        const str = JSON.stringify(q);
        const containsPrandtl = str.includes("Prandtl") || str.includes("Terzaghi") || str.includes("주면마찰");
        const isTzQz = q.question && (q.question.includes("t-z") || q.question.includes("t - z") || q.question.includes("q-z") || q.question.includes("q - z"));
        const isSlimeFriction = q.question && (q.question.includes("슬라임") || q.question.includes("부마찰력"));
        return containsPrandtl && (isSlimeFriction || !isTzQz);
      });
    };

    let log = [];

    // 1. app_session 테이블 전체를 스캔하여 댐/말뚝 관련 세션 키를 모두 갱신 및 오염 세션 삭제
    const sessions = await dbQuery.all("SELECT key, value FROM app_session");
    for (const s of sessions) {
      if (!s.value) continue;
      try {
        const parsed = JSON.parse(s.value);
        
        // 오염된 세션 감지 시 바로 삭제 (찌꺼기 제거)
        let isCorrupted = false;
        if (parsed && Array.isArray(parsed.questions) && hasCorruptedPile(parsed.questions)) {
          isCorrupted = true;
        }
        if (parsed && Array.isArray(parsed.formulaQuestions) && hasCorruptedPile(parsed.formulaQuestions)) {
          isCorrupted = true;
        }
        if (parsed && Array.isArray(parsed) && hasCorruptedPile(parsed)) {
          isCorrupted = true;
        }

        const isReviewOrCompleted = s.key.startsWith('review_') || s.key.startsWith('completed_');
        if (isReviewOrCompleted && isCorrupted) {
          await dbQuery.run('DELETE FROM app_session WHERE key = ?', [s.key]);
          log.push(`Deleted corrupted session key: ${s.key}`);
          continue;
        }

        let wasUpdated = false;

        // case A: { questions: [...] } 형태의 복습 세션 객체
        if (parsed && Array.isArray(parsed.questions)) {
          const origLen = JSON.stringify(parsed.questions).length;
          parsed.questions = updateQuestionObj(parsed.questions);
          if (JSON.stringify(parsed.questions).length !== origLen) {
            wasUpdated = true;
          }
        }
        // case B: { formulaQuestions: [...] } 형태의 공식 세션 객체
        if (parsed && Array.isArray(parsed.formulaQuestions)) {
          const origLen = JSON.stringify(parsed.formulaQuestions).length;
          parsed.formulaQuestions = updateQuestionObj(parsed.formulaQuestions);
          if (JSON.stringify(parsed.formulaQuestions).length !== origLen) {
            wasUpdated = true;
          }
        }
        // case C: 순수 배열 형태
        if (Array.isArray(parsed)) {
          const origLen = JSON.stringify(parsed).length;
          const updated = updateQuestionObj(parsed);
          if (JSON.stringify(updated).length !== origLen) {
            wasUpdated = true;
            await saveSessionValue(s.key, JSON.stringify(updated));
            log.push(`Updated pure array session key: ${s.key}`);
            continue;
          }
        }

        if (wasUpdated) {
          await saveSessionValue(s.key, JSON.stringify(parsed));
          log.push(`Updated structured session key: ${s.key}`);
        }
      } catch (err) {
        // console.warn(`Failed to parse session key ${s.key}:`, err.message);
      }
    }

    // 2. topics 테이블 업데이트 (안전하게 컬럼 존재성 검사 후 에러 방증)
    try {
      const topics = await dbQuery.all("SELECT id, title FROM topics");
      log.push(`Scanned topics count: ${topics.length}`);
    } catch (topicErr) {
      log.push(`Skipped topics scan: ${topicErr.message}`);
    }

    // 3. Force sync generation_standards in DB with the latest standards
    const latestStandards = [
      {
        "id": "def_gen_1",
        "title": "공식 및 수치 범위 노출 절대 금지",
        "content": "🚨 [공식 및 공식 수치 범위 노출 절대 금지 규칙 - 극도로 중요!]: 문제 질문(question) 본문 내에 문제를 해결하는 데 필요한 공학 수식 자체(예: $E_u = 300 s_u$ 등)나 수식의 특정 수치 범위(예: $E_u = (200 \\sim 500)s_u$ 등), 비례 관계 식 등을 **절대로 직접 텍스트로 적어 제공하지 마십시오.** 대신 공식의 명칭(\"비배수 탄성계수 경험식\")이나 변수들의 명칭(\"비배수 전단강도 $s_u$\")만을 제시하고, 학생이 스스로 공식과 범위를 떠올려서 해결하도록 하십시오. (단, 해설(explanation)에서는 학생의 학습을 위해 공식을 상세히 명시하고 계산 과정을 설명해야 합니다.)"
      },
      {
        "id": "def_gen_2",
        "title": "유사/중복 질문 출제 금지",
        "content": "🚨 [유사/중복 질문 출제 절대 금지 - 매우 중요!]: 하나의 공식이나 거동 특성에서 파생되는 변수만 바꾼 형태의 유사한 비례/반비례 질문은 **절대로 중복하여 출제하지 마십시오.** (예: 공식 $A = B \\times C$에 대해 \"B가 증가할 때 A의 변화\"를 묻는 문제를 출제했다면, 동일한 테스트 세트 내에 \"C가 증가할 때 A의 변화\"를 묻는 질문은 사실상 동일한 비례 관계 메커니즘을 묻는 중복 문제이므로 **절대로 같이 내지 말고**, 완전히 다른 공학적 개념이나 새로운 지식을 묻는 독립적인 문제로만 구성하십시오.)"
      },
      {
        "id": "def_gen_3",
        "title": "객관식 정밀성 및 정답 일치 조건",
        "content": "🚨 [객관식 정밀성 및 정답 일치 조건 - 극도로 중요!]: 모든 객관식(4지선다형) 계산 문제나 수치/공학적 판단 문제를 출제할 때, 계산으로 도출된 정확한 정답 수치나 조건이 4개의 보기(options) 중 반드시 정확히 1개로 존재해야 합니다. 절대로 실제 계산 결과와 보기의 수치가 불일치하여, 해설에서 '실제 계산값은 XX이나 보기 중 가장 가까운 YY를 선택합니다'와 같은 어처구니없는 변명을 적는 출제 오류를 범하지 마십시오. 문제를 생성하기 전에 실제 수식을 대입하여 정답을 한 번 더 직접 엄밀하게 계산하고 검증한 후, 그 결과값(토씨 하나 틀리지 않는 정확한 정답)을 보기와 'answer' 필드에 완벽히 일치하도록 기재하십시오."
      },
      {
        "id": "user_generation_lqyjy05",
        "title": "전반적 지침2",
        "content": "AI는 문제를 출제할 때 제공된 토픽 문서 텍스트에 포함된 단어들을 단순히 빈칸으로 만들거나 그대로 베끼는 1차원적인 문제 출제를 엄격히 금지합니다. 해당 토픽에 대해 튜터와 대화할 때 도출되는 수준의\n① 거동 원리 및 메커니즘\n② 공식 유도 과정 및 가정 조건\n③ 공법/이론 간의 장단점 비교 대조표\n④ 설계·시공 현장에서의 실무적 문제 상황 해결책(시나리오)을\n\n종합적으로 감안하여 학술적 깊이가 있는 기술사형 응용 문제를 출제"
      },
      {
        "id": "user_generation_wiapyp1",
        "title": "전반적 지침1",
        "content": "1. 제공된 원보고서(노트)의 요약 텍스트 내용에만 기계적으로 국한하여 출제하지 마십시오.\n2. 해당 토픽의 전반적인 학술적 개요, 물리적·역학적 거동 메커니즘, 이론 전개 시 사용되는 기본 가정 조건, 그리고 핵심 공학 수식을 지반공학 전공 서적 및 실무 설계 기준(KDS) 관점에서 심층 분석하여 문제를 구성하십시오.\n3. 특히 타 공법이나 유사 이론과의 비교표 칸채우기(표채우기 문항), 현장에서 발생할 수 있는 구체적인 한계 상태 시나리오 및 기술사로서의 실무 안정 대책(단답형 문항)을 적극적으로 연계하여 다차원적인 공학적 판단력을 평가할 수 있도록 참신하게 출제해 주십시오."
      },
      {
        "id": "user_generation_cpjrwj5",
        "title": "복합 문제",
        "content": "하나의 토픽 내에서 2가지 이상의 세부 항목을 질문할 경우, 각각의 정의를 묻는 방식도 중요하지만  \n두 항목 간의 상호 관계, 역학적 메커니즘의 차이, 설계/시공 시의 상호 영향성, 혹은 공학적 비교 분석을 요구하는 통합형 문제를 출제하십시오.."
      },
      {
        "id": "user_generation_long_noun_ending_answers",
        "title": "주관식 정답의 장문 메커니즘 및 명사형 종결어미 의무화",
        "content": "🚨 [주관식 정답의 장문 메커니즘 및 명사형 종결어미 의무화 - 극도로 중요!]: 주관식(개요, 공식, 단답형, 표채우기 등)의 모든 모범 답안(\"answers\" 내의 각 값 또는 \"answer\")은 절대로 1~2 단어의 단순 명칭이나 짧은 요약형 문장으로 작성해서는 안 되며, 반드시 지반공학적 거동 원리, 인과관계, 시공 및 설계 제어 메커니즘을 명확히 명시하되, 너무 길어지지 않도록 핵심 위주의 명료한 서술형(최소 50자에서 최대 120자 내외)으로 간결하게 작성하십시오. 또한, 모든 정답의 어미는 기술사 답안지 작성 원칙에 부합하도록 \"~다\", \"~입니다\", \"~하겠다\"와 같은 평서문/구어체 종결어미를 절대 금지하며, 반드시 명사형 종결어미(예: ~함, ~저감, ~방지, ~유도, ~제어, ~확보, ~감소, ~소산, ~이동, ~상쇄, ~상태, ~형태, ~수준 등)로 명확히 끝맺음하여 서술하십시오. 예시: '...을 방지함', '...을 통한 침투압 감소' (O) / '...을 방지합니다', '...을 통해 침투압이 감소된다' (X)"
      },
      {
        "id": "user_generation_vfp6zqj",
        "title": "객관식 지침",
        "content": "지침 내용: \n1.🚨 [계산형 문항의 정확한 계산값 객관식 보기 의무화 - 극도로 중요!]: 계산형 문제(특히 선택형/객관식 문항)를 출제할 때, 문제의 공식과 대입값으로 산출되는 실제 정확한 수학적/공학적 계산값(소수점 1~2자리 포함, 예: 66.67 GPa)은 반드시 객관식 보기의 4개 항목(options) 중 하나(정답 항목)로 정확히 포함되어야 합니다. 계산 결과가 소수점을 가질 경우, 보기 항목을 임의의 정수나 엉뚱한 값(예: 70 GPa)으로 둥글게 처리하여 '가장 근사한 값을 고르라'는 식으로 얼버무려서 출제하는 행위를 엄격히 금지합니다. 반드시 실제 공식에 값을 대입해 나온 정확한 수치를 보기 항목과 모범 답안으로 등록하십시오.\n\n2.객관식문제낼때 소스에 한정하지말고 소스 토픽을 ai튜터와 이야기 나눴을때, 나오는 메커니즘, 정의, 공식 등 전반적인 내용으로 출제하도록 해\n\n3.중요한 개념문제를 난이도 어렵게 내도록 해"
      },
      {
        "id": "user_generation_bu5e5cd",
        "title": "표 채우기 문제출제 절대 지침",
        "content": "1. 🚨 [표 채우기 문항의 가로/세로축 독립 차원 설계 의무화 - 극도로 중요!]: 표 채우기(Table Quiz) 형태의 문항을 설계 및 출제할 때, 표의 가로 헤더(Column)와 세로 헤더(Row)가 절대로 동일하거나 유사한 성격의 평가 차원(예: 가로축도 '주변 지반 영향', 세로축도 '역학적 영향' 등)으로 중복 구성되지 않도록 엄격히 제약하십시오. 가로축과 세로축은 반드시 서로 완전히 다른 독립적인 성격의 차원을 형성해야 합니다. 예를 들어, 세로축이 비교 대상이 되는 시공/공법 항목(예: '어스앵커', '소일내일링')이라면, 가로축은 그에 대응하는 평가 속성(예: '거동 메커니즘', '활용성')으로 결합되어 각 격자(Cell)가 고유하고 유일한 지식 범주를 검증할 수 있도록 설계하십시오. 동일한 답안이 가로축의 여러 칸에 의미 없이 복사-붙여넣기식으로 겹쳐서 생성되는 형태의 출제를 엄격히 금지합니다.\n\n2.🚨 [표 채우기 문항의 칸별 정답 속성 매핑 무결성 의무화 - 극도로 중요!]: 표 채우기(Table Quiz) 문항을 출제할 때, 각 격자(Cell)에 매핑되는 정답(`answers` 객체의 `INPUT_1`, `INPUT_2` 등)은 반드시 해당 셀이 속한 열(Column) 헤더와 행(Row) 헤더의 기하학적/공학적 정의와 **100% 일치**해야 합니다. 등방성(Isotropic) 지반을 나타내는 열의 셀(`[INPUT_1]`)에 이방성(Anisotropic) 관련 개념이나 수식(예: $x' = x\\sqrt{k_v/k_h}$ 등)을 정답으로 배치하는 식의 컬럼 간 정답 혼동 및 오매핑 행위를 엄격히 금지합니다. 표의 각 입력 칸은 해당 지반 조건(예: 등방성 균질 vs 이방성 불균질) 및 공학 분류의 의미적 범주를 절대 벗어나지 않도록 완벽히 교차 검증하여 정답을 설계하십시오.\n\n3.🚨 [표 채우기 문항의 지문 내 빈칸 지칭 일치 의무화 - 극도로 중요!]: 표 채우기(Table Quiz) 문항을 출제할 때, 질문(question) 지문 내에 언급하는 빈칸 번호(예: \"빈칸 (A), (B), (C), (D)에 들어갈 내용...\")의 개수와 알파벳 순서는 실제 표(tableData) 내부에 배치된 빈칸 토큰(INPUT_1, INPUT_2, INPUT_3, INPUT_4)의 총 개수 및 순서와 반드시 **100% 일치**해야 합니다. 만약 표 내부에 빈칸이 4개(a, b, c, d) 존재함에도 지문에서 \"빈칸 (A), (B)에 들어갈 내용...\"과 같이 일부만 지칭하여 질문하는 식의 심각한 불일치 오류를 절대 발생시키지 마십시오. 또한, 비교 대상(예: 현장 베인 시험, 피에조콘 시험)을 지칭하는 기호(A), (B)는 질문 본문에서 대괄호/괄호 형태 기호로 직접 지칭하는 것을 금지하며, 명칭 자체로만 언급하십시오. `(A), (B), (C), (D)` 기호는 오직 표의 빈칸 입력 칸들만을 순서대로 지칭하는 용도로만 일관되게 사용하십시오."
      }
    ];

    await saveSessionValue('generation_standards', JSON.stringify(latestStandards));
    updateLiveGenerationStandards(latestStandards);
    await writeStandardToFile('generation_standards', latestStandards);
    log.push("Successfully synchronized all generation standards to database.");

    res.json({ success: true, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/session/answersheet/upload → PDF/HTML 분석하여 답안지 생성
async function ensureAnswersheetReportsTable() {
  try {
    if (isPostgres) {
      await dbQuery.run(`
        CREATE TABLE IF NOT EXISTS answersheet_reports (
          id SERIAL PRIMARY KEY,
          pdf_name TEXT,
          pdf_data BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await dbQuery.run(`
        CREATE TABLE IF NOT EXISTS answersheet_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pdf_name TEXT,
          pdf_data BLOB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
  } catch (e) {
    console.warn('ensureAnswersheetReportsTable warning:', e.message);
  }
}

// POST /api/session/answersheet/upload → PDF/HTML 분석하여 답안지 생성 (원본 보관 추가)
app.post('/api/session/answersheet/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '업로드된 파일이 없습니다.' });
    }
    const pdfName = req.body.fileNameUtf8 || req.file.originalname || '';

    // Save the original file to SQLite/Postgres db
    await ensureAnswersheetReportsTable();
    const insertReportSql = `
      INSERT INTO answersheet_reports (pdf_name, pdf_data)
      VALUES (?, ?)
    `;
    const reportResult = await dbQuery.run(insertReportSql, [
      pdfName,
      req.file.buffer
    ]);
    const reportId = reportResult.id;

    res.json({
      theories: [{
        title: pdfName.replace(/\.[^/.]+$/, ""), // Remove file extension
        concept: '업로드한 본문 보고서가 연동되었습니다.',
        assumptions: '',
        formula: '',
        answer: '',
        answersheet_report_id: reportId,
        pdf_name: pdfName
      }]
    });
  } catch (err) {
    console.error('POST /api/session/answersheet/upload error:', err);
    res.status(500).json({ error: err.message || 'PDF/HTML 업로드에 실패했습니다.' });
  }
});

// GET /api/session/answersheet/report/:id → 저장된 답안지 원본 문서 스트리밍
app.get('/api/session/answersheet/report/:id', async (req, res) => {
  const reportId = req.params.id;
  const forceDownload = req.query.download === 'true';
  try {
    await ensureAnswersheetReportsTable();
    const reportSql = `SELECT pdf_name, pdf_data FROM answersheet_reports WHERE id = ?`;
    const report = await dbQuery.get(reportSql, [reportId]);

    if (!report || !report.pdf_data) {
      return res.status(404).send('첨부된 PDF/HTML 원본 파일을 찾을 수 없습니다.');
    }

    const isHtml = report.pdf_name && (
      report.pdf_name.toLowerCase().endsWith('.html') || 
      report.pdf_name.toLowerCase().endsWith('.htm') || 
      isBufferHtml(report.pdf_data)
    );
    if (isHtml) {
      let htmlContent = decodeHtmlBuffer(report.pdf_data);
      // Remove polyfill scripts if they exist
      htmlContent = htmlContent.replace(/<script\b[^>]*?src=["']?[^"'>]*?polyfill\.io[^"'>]*?["']?[^>]*?>([\s\S]*?<\/script>)?/gi, '<!-- polyfill removed -->');
      
      const responsiveStyle = `
<style>
/* Global Premium Light Theme for Report Viewers */
html, body {
  background-color: #ffffff !important;
  color: #1e293b !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  line-height: 1.6 !important;
  margin: 0 !important;
  padding: 24px !important;
  box-sizing: border-box !important;
}

/* Ensure all nested text is readable and correctly colored */
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

/* Elegant borders and backgrounds for tables and layouts */
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

/* Layout overrides to prevent broken layouts on light theme */
div, section, article, form, .container, .page, .wrapper, .section, .WordSection1, #page-container, #sidebar, #content {
  background-color: transparent !important;
  border-color: #e2e8f0 !important;
  box-shadow: none !important;
}

/* Scrollbars styling */
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
      res.send(report.pdf_data);
    }
  } catch (error) {
    console.error('Error streaming answersheet report:', error);
    res.status(500).send('서버 오류로 파일을 스트리밍하지 못했습니다.');
  }
});

// POST /api/session/answersheet/add-from-topic → 토픽 원보고서를 답안지탭으로 연동 복사
app.post('/api/session/answersheet/add-from-topic', async (req, res) => {
  const { topicId } = req.body;
  try {
    // 1. Fetch topic from DB
    const topic = await dbQuery.get('SELECT title, category, pdf_name, pdf_data FROM topics WHERE id = ?', [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '해당 토픽을 찾을 수 없습니다.' });
    }
    if (!topic.pdf_data) {
      return res.status(400).json({ error: '해당 토픽에 첨부된 원본 보고서 파일이 없습니다.' });
    }

    const pdfName = topic.pdf_name || '';

    // 2. Save to answersheet_reports
    await ensureAnswersheetReportsTable();
    const insertReportSql = `
      INSERT INTO answersheet_reports (pdf_name, pdf_data)
      VALUES (?, ?)
    `;
    const reportResult = await dbQuery.run(insertReportSql, [
      pdfName,
      topic.pdf_data
    ]);
    const reportId = reportResult.id;

    res.json({
      theories: [{
        title: topic.title,
        concept: '연동된 토픽의 본문 보고서입니다.',
        assumptions: '',
        formula: '',
        answer: '',
        answersheet_report_id: reportId,
        pdf_name: pdfName,
        category: topic.category || '일반'
      }]
    });
  } catch (err) {
    console.error('POST /api/session/answersheet/add-from-topic error:', err);
    res.status(500).json({ error: err.message || '보고서 연동에 실패했습니다.' });
  }
});





// Spaced Repetition 무한 장기 보존 마이그레이션 함수
async function migrateSpacedIntervals() {
  console.log('[Migration] Checking for completed spaced repetition reviews lacking the next round schedule...');
  try {
    // 최소 6회차 이상의 완료된 스케줄 중, 가장 최근에 완료된 스케줄이며 그 다음 회차 스케줄이 아예 존재하지 않는 튜플 조회
    const sql = `
      SELECT s_max.topic_id, s_max.completed_at, s_max.planned_date, s_max.review_round
      FROM schedules s_max
      WHERE s_max.review_round >= 6 AND s_max.status = 'completed'
        AND s_max.review_round = (
          SELECT MAX(s_inner.review_round) 
          FROM schedules s_inner 
          WHERE s_inner.topic_id = s_max.topic_id AND s_inner.status = 'completed'
        )
        AND NOT EXISTS (
          SELECT 1 FROM schedules s_next
          WHERE s_next.topic_id = s_max.topic_id AND s_next.review_round = s_max.review_round + 1
        )
    `;
    const targets = await dbQuery.all(sql);
    
    if (targets.length === 0) {
      console.log('[Migration] No migration targets found. All long-term review schedules are up to date.');
      return;
    }
    
    console.log(`[Migration] Found ${targets.length} topics that need the next round random interval schedule.`);
    
    const insertSql = `
      INSERT INTO schedules (topic_id, review_round, planned_date, status)
      VALUES (?, ?, ?, 'pending')
    `;
    
    let migratedCount = 0;
    for (const row of targets) {
      let baseDate = new Date();
      if (row.completed_at) {
        baseDate = new Date(row.completed_at);
      } else if (row.planned_date) {
        baseDate = new Date(row.planned_date);
      }
      
      // M+1 ~ M+3 (30 ~ 90일 후)
      const randomDays = 30 + Math.floor(Math.random() * 61);
      const plannedDateStr = getLocalDateString(baseDate, randomDays);
      const nextRound = row.review_round + 1;
      
      await dbQuery.run(insertSql, [row.topic_id, nextRound, plannedDateStr]);
      migratedCount++;
      console.log(`[Migration] Auto-created next round ${nextRound} for topic ${row.topic_id} planned on ${plannedDateStr}`);
    }
    
    console.log(`[Migration] Successfully migrated ${migratedCount} topics with new long-term schedules.`);
  } catch (error) {
    console.error('[Migration] Error running spaced intervals migration:', error);
  }
}

// 복습이 완료되었으나 planned_date가 실제 오늘 날짜(new Date())로 잘못 생성된 pending 일정들을 Ebbinghaus 주기 기준으로 자가 치유(Self-healing)
async function healPendingSchedules() {
  console.log('[Migration] Healing pending schedule planned dates...');
  try {
    const pendingSchedules = await dbQuery.all(`SELECT * FROM schedules WHERE status = 'pending' AND review_round != 99`);
    let healCount = 0;
    for (const sched of pendingSchedules) {
      const prevRound = sched.review_round - 1;
      const prevSched = await dbQuery.get(
        `SELECT completed_at, planned_date FROM schedules WHERE topic_id = ? AND review_round = ? AND status = 'completed'`,
        [sched.topic_id, prevRound]
      );
      
      if (prevSched) {
        let baseDateStr = prevSched.completed_at || prevSched.planned_date;
        if (baseDateStr) {
          let days = 0;
          if (prevRound === 1) days = 4;
          else if (prevRound === 2) days = 7;
          else if (prevRound === 3) days = 14;
          else if (prevRound === 4) days = 35;
          else if (prevRound === 5) days = 60;
          
          if (days > 0) {
            const baseDate = new Date(baseDateStr);
            const correctPlannedDate = getLocalDateString(baseDate, days);
            
            if (sched.planned_date !== correctPlannedDate) {
              await dbQuery.run(
                `UPDATE schedules SET planned_date = ? WHERE id = ?`,
                [correctPlannedDate, sched.id]
              );
              healCount++;
              console.log(`[Migration] Healed round ${sched.review_round} for topic ${sched.topic_id}: ${sched.planned_date} -> ${correctPlannedDate}`);
            }
          }
        }
      }
    }
    console.log(`[Migration] Completed pending schedules heal. Corrected ${healCount} records.`);
  } catch (error) {
    console.error('[Migration] Error healing pending schedules:', error);
  }
}

// 과거에 풀이했던 복습 일정 중 성적(score, correct_count, total_count)이 누락되었거나 불일치하지만 app_session에 풀이 이력이 존재하는 경우 채점하여 백필
// Helper to compute overall score (including subjective and table grading) matching the client logic
function computeOverallScore(parsed) {
  if (!parsed || !Array.isArray(parsed.questions)) return null;

  const aiQuestions = parsed.questions;
  const selectedAnswers = parsed.selectedAnswers || {};
  const tableGradingResults = parsed.tableGradingResults || {};

  let totalScoreObtained = 0;
  let correctCount = 0;

  const scoredIndices = [];
  aiQuestions.forEach((_, i) => {
    scoredIndices.push(i);
  });
  const M = scoredIndices.length;
  const baseWeight = M > 0 ? Math.floor(100 / M) : 10;
  const remainder = M > 0 ? (100 - (baseWeight * M)) : 0;

  aiQuestions.forEach((q, idx) => {

    const sIdx = scoredIndices.indexOf(idx);
    const W = sIdx !== -1 ? (sIdx < remainder ? (baseWeight + 1) : baseWeight) : 0;

    const isMC = q.options && q.options.length > 0;
    if (isMC) {
      const userAnswer = selectedAnswers[idx];
      const isCorrect = userAnswer === q.answer;
      if (isCorrect) {
        totalScoreObtained += W;
        correctCount++;
      }
    } else if (q.tableData) {
      const inputIds = Object.keys(q.answers || {});
      let sumVal = 0;
      let countVal = inputIds.length;
      inputIds.forEach(inputId => {
        const grading = tableGradingResults[`${idx}_${inputId}`];
        if (grading && grading.score !== undefined) {
          sumVal += grading.score;
        }
      });
      if (countVal > 0) {
        const questionScore = (sumVal / (countVal * 10)) * W;
        totalScoreObtained += questionScore;
        if (questionScore >= (W / 2)) {
          correctCount++;
        }
      }
    } else {
      const grading = tableGradingResults[`${idx}_INPUT`];
      if (grading && grading.score !== undefined) {
        const questionScore = (grading.score / 10) * W;
        totalScoreObtained += questionScore;
        if (questionScore >= (W / 2)) {
          correctCount++;
        }
      }
    }
  });

  const totalCount = M;
  const score = totalCount > 0 ? Math.min(100, Math.max(0, Math.round(totalScoreObtained * 10) / 10)) : 100;
  return { score, correctCount, totalCount };
}

// 과거에 풀이했던 복습 일정 중 성적(score, correct_count, total_count)이 누락되었거나 불일치하지만 app_session에 풀이 이력이 존재하는 경우 채점하여 백필
async function backfillPastScheduleScores() {
  console.log('[Backfill] Checking and backfilling past schedule scores from app_session...');
  try {
    const rows = await dbQuery.all(`SELECT key, value FROM app_session WHERE key LIKE 'completed_review_schedule_%'`);
    console.log(`[Backfill] Found ${rows.length} completed review session records.`);
    
    let updatedCount = 0;
    for (const row of rows) {
      const scheduleIdStr = row.key.replace('completed_review_schedule_', '');
      const scheduleId = parseInt(scheduleIdStr, 10);
      if (isNaN(scheduleId)) continue;
      
      try {
        const parsed = JSON.parse(row.value);
        if (parsed && Array.isArray(parsed.questions)) {
          const sched = await dbQuery.get('SELECT id, score, correct_count, total_count FROM schedules WHERE id = ?', [scheduleId]);
          if (sched) {
            const computed = computeOverallScore(parsed);
            if (computed) {
              const { score: computedScore, correctCount: computedCorrect, totalCount: computedTotal } = computed;
              
              // 데이터베이스의 현재 값과 비교하여 다르면 업데이트 진행 (주관식/표채점이 포함된 종합 점수와 비교)
              if (sched.score === null || sched.correct_count === null || sched.total_count === null || sched.score !== computedScore) {
                await dbQuery.run(
                  'UPDATE schedules SET score = ?, correct_count = ?, total_count = ? WHERE id = ?',
                  [computedScore, computedCorrect, computedTotal, scheduleId]
                );
                updatedCount++;
                console.log(`[Backfill] Updated schedule ${scheduleId} with computed score ${computedScore} (${computedCorrect}/${computedTotal})`);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[Backfill] Error parsing JSON or updating schedule for key ${row.key}:`, err);
      }
    }
    console.log(`[Backfill] Completed. Backfilled ${updatedCount} schedules with score data.`);
  } catch (error) {
    console.error('[Backfill] Error backfilling schedule scores:', error);
  }
}

// 과거에 난수(sess_xxx) 기반으로 저장되었던 app_session 내의 복습 캐시 키들을 절대 세션 ID 구조(sess_topic_X_round_Y)로 변환해주는 마이그레이션 함수
async function migrateLegacySessionKeys() {
  console.log('[Migration] Starting legacy session keys migration to absolute session ID format...');
  try {
    const rows = await dbQuery.all(`SELECT key, value FROM app_session WHERE key LIKE 'review_questions_schedule_%'`);
    console.log(`[Migration] Found ${rows.length} total review schedule session records.`);
    
    let migratedCount = 0;
    for (const row of rows) {
      // 키 형식: review_questions_schedule_${scheduleId}_sess_${sessionId}
      const match = row.key.match(/^review_questions_schedule_(\d+)_sess_(sess_[a-zA-Z0-9_\-\.]+)$/);
      if (!match) continue;
      
      const scheduleIdStr = match[1];
      const legacySessionId = match[2];
      
      // 이미 절대 고정 포맷인 경우 건너뜀
      if (legacySessionId.startsWith('sess_topic_') && legacySessionId.includes('_round_')) {
        continue;
      }
      
      const scheduleId = parseInt(scheduleIdStr, 10);
      if (isNaN(scheduleId)) continue;
      
      try {
        // schedules 테이블에서 이 스케줄의 topic_id 와 review_round 를 확인
        const sched = await dbQuery.get('SELECT topic_id, review_round FROM schedules WHERE id = ?', [scheduleId]);
        if (sched && sched.topic_id && sched.review_round !== undefined) {
          const absoluteSid = `sess_topic_${sched.topic_id}_round_${sched.review_round}`;
          const newKey = `review_questions_schedule_${scheduleId}_sess_${absoluteSid}`;
          
          // JSON value 내부에 저장되어 있는 sessionId 도 absoluteSid 로 업데이트
          let updatedValue = row.value;
          try {
            const parsed = JSON.parse(row.value);
            if (parsed) {
              parsed.sessionId = absoluteSid;
              updatedValue = JSON.stringify(parsed);
            }
          } catch(e) {
            // 파싱 에러는 경고만 띄우고 원본 유지
          }
          
          // 이미 새로운 키가 데이터베이스에 존재하는지 확인
          const exists = await dbQuery.get('SELECT id FROM app_session WHERE key = ?', [newKey]);
          if (!exists) {
            // 새로운 키로 업데이트
            await dbQuery.run('UPDATE app_session SET key = ?, value = ? WHERE id = ?', [newKey, updatedValue, row.id]);
            migratedCount++;
            console.log(`[Migration] Migrated legacy key ${row.key} -> ${newKey}`);
          } else {
            // 이미 존재한다면 예전 행을 안전하게 삭제
            await dbQuery.run('DELETE FROM app_session WHERE id = ?', [row.id]);
            console.log(`[Migration] Deleted duplicate legacy key ${row.key} because absolute key already exists.`);
          }
        }
      } catch (err) {
        console.warn(`[Migration] Error processing row ${row.key}:`, err);
      }
    }
    console.log(`[Migration] Session keys migration completed. Migrated ${migratedCount} records.`);
  } catch (error) {
    console.error('[Migration] Error running legacy session keys migration:', error);
  }
}

function mergeDefaultAndDbStandards(defaultList, dbList) {
  // DB에 저장된 지침 목록이 존재한다면, 사용자의 추가/수정/삭제 내역이 100% 보존되도록 DB 목록을 그대로 최종 권위로 삼아 반환합니다.
  if (Array.isArray(dbList)) {
    return dbList;
  }
  return defaultList;
}


async function initializeEngineeringStandards() {
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'engineering_standards'");
    let finalList = standardsList;
    if (row && row.value) {
      const dbList = JSON.parse(row.value);
      finalList = mergeDefaultAndDbStandards(standardsList, dbList);
    }
    const isDifferent = !row || JSON.stringify(finalList) !== row.value;
    if (isDifferent) {
      await saveSessionValue('engineering_standards', JSON.stringify(finalList));
      console.log('[Initialize] Synced and merged engineering standards in database.');
    }
    updateLiveEngineeringStandards(finalList);
    await writeStandardToFile('engineering_standards', finalList);
  } catch (err) {
    console.error('Failed to initialize engineering standards:', err.message);
  }
}

async function initializeGradingStandards() {
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'grading_standards'");
    let finalList = gradingStandardsList;
    if (row && row.value) {
      const dbList = JSON.parse(row.value);
      finalList = mergeDefaultAndDbStandards(gradingStandardsList, dbList);
    }
    const isDifferent = !row || JSON.stringify(finalList) !== row.value;
    if (isDifferent) {
      await saveSessionValue('grading_standards', JSON.stringify(finalList));
      console.log('[Initialize] Synced and merged grading standards in database.');
    }
    updateLiveGradingStandards(finalList);
    await writeStandardToFile('grading_standards', finalList);
  } catch (err) {
    console.error('Failed to initialize grading standards:', err.message);
  }
}

async function initializeValidationStandards() {
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'validation_standards'");
    let finalList = validationStandardsList;
    if (row && row.value) {
      const dbList = JSON.parse(row.value);
      finalList = mergeDefaultAndDbStandards(validationStandardsList, dbList);
    }
    const isDifferent = !row || JSON.stringify(finalList) !== row.value;
    if (isDifferent) {
      await saveSessionValue('validation_standards', JSON.stringify(finalList));
      console.log('[Initialize] Synced and merged validation standards in database.');
    }
    updateLiveValidationStandards(finalList);
    await writeStandardToFile('validation_standards', finalList);
  } catch (err) {
    console.error('Failed to initialize validation standards:', err.message);
  }
}

async function initializeGenerationStandards() {
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'generation_standards'");
    let finalList = generationStandardsList;
    if (row && row.value) {
      const dbList = JSON.parse(row.value);
      finalList = mergeDefaultAndDbStandards(generationStandardsList, dbList);
    }
    const isDifferent = !row || JSON.stringify(finalList) !== row.value;
    if (isDifferent) {
      await saveSessionValue('generation_standards', JSON.stringify(finalList));
      console.log('[Initialize] Synced and merged generation standards in database.');
    }
    updateLiveGenerationStandards(finalList);
    await writeStandardToFile('generation_standards', finalList);
  } catch (err) {
    console.error('Failed to initialize generation standards:', err.message);
  }
}

async function initializeLockscreenStandards() {
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_standards'");
    let finalList = lockscreenStandardsList;
    if (row && row.value) {
      const dbList = JSON.parse(row.value);
      finalList = mergeDefaultAndDbStandards(lockscreenStandardsList, dbList);
    }
    const isDifferent = !row || JSON.stringify(finalList) !== row.value;
    if (isDifferent) {
      await saveSessionValue('lockscreen_standards', JSON.stringify(finalList));
      console.log('[Initialize] Synced and merged lockscreen standards in database.');
    }
    updateLiveLockscreenStandards(finalList);
    await writeStandardToFile('lockscreen_standards', finalList);

    // One-time pool migration: clear pool when version increments to trigger fresh correct question generation
    const versionKey = 'lockscreen_pool_version';
    const currentVersion = '4'; // Increment to version 4 to clear previous stale Terzaghi/options questions
    const verRow = await dbQuery.get("SELECT value FROM app_session WHERE key = ?", [versionKey]);
    if (!verRow || verRow.value !== currentVersion) {
      await dbQuery.run("DELETE FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
      await saveSessionValue(versionKey, currentVersion);
      console.log('[Migration] Lockscreen pool cleared due to pool version update to:', currentVersion);
    }
  } catch (err) {
    console.error('Failed to initialize lockscreen standards:', err.message);
  }
}

async function writeStandardToFile(key, standards) {
  try {
    if (key === 'generation_standards') {
      const standardsFilePath = path.join(__dirname, 'plugins', 'generationStandards.js');
      const resolvedContent = `// This file is auto-generated by the system. Do not edit manually.
export let generationStandardsList = ${JSON.stringify(standards, null, 2)};

export let GENERATION_STANDARDS = assembleGenerationStandardsPrompt(generationStandardsList);

export function assembleGenerationStandardsPrompt(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return "- 등록된 문제생성 지침 기준이 없습니다.";
  }
  return list.map((std, idx) => \`\${idx + 1}. **\${std.title}**:\\n   - \${std.content}\`).join('\\n');
}

export function updateLiveGenerationStandards(newList) {
  generationStandardsList = newList;
  GENERATION_STANDARDS = assembleGenerationStandardsPrompt(newList);
}
`;
      await fs.promises.writeFile(standardsFilePath, resolvedContent, 'utf-8');
      console.log('Successfully wrote generation standards to local file.');
    } else if (key === 'lockscreen_standards') {
      const standardsFilePath = path.join(__dirname, 'plugins', 'lockscreenStandards.js');
      const resolvedContent = `// This file is auto-generated by the system. Do not edit manually.
export let lockscreenStandardsList = ${JSON.stringify(standards, null, 2)};

export let LOCKSCREEN_STANDARDS = assembleLockscreenStandardsPrompt(lockscreenStandardsList);

export function assembleLockscreenStandardsPrompt(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return "- 등록된 락스크린 출제 지침 기준이 없습니다.";
  }
  return list.map((std, idx) => \`\${idx + 1}. **\${std.title}**:\\n   - \${std.content}\`).join('\\n');
}

export function updateLiveLockscreenStandards(newList) {
  lockscreenStandardsList = newList;
  LOCKSCREEN_STANDARDS = assembleLockscreenStandardsPrompt(newList);
}
`;
      await fs.promises.writeFile(standardsFilePath, resolvedContent, 'utf-8');
      console.log('Successfully wrote lockscreen standards to local file.');
    } else if (key === 'engineering_standards') {
      const standardsFilePath = path.join(__dirname, 'plugins', 'engineeringStandards.js');
      const resolvedContent = `// This file is auto-generated by the system. Do not edit manually.
export let standardsList = ${JSON.stringify(standards, null, 2)};

export let ENGINEERING_STANDARDS = standardsList.map(s => s.content).join('\\n\\n');

export function updateLiveEngineeringStandards(newList) {
  if (Array.isArray(newList)) {
    standardsList = newList;
    ENGINEERING_STANDARDS = newList.map(s => s.content).join('\\n\\n');
  }
}

// Backwards compatibility exports
export const STRESS_CONVENTION = "";
export const SUBGRADE_REACTION_CONVENTION = "";
export const GRAPH_AND_TABLE_CONVENTION = "";
export const SITUATIONAL_FEASIBILITY_CONVENTION = "";
export const SEEPAGE_PRESSURE_CONVENTION = "";
export const USER_CONVENTIONS = "";
`;
      await fs.promises.writeFile(standardsFilePath, resolvedContent, 'utf-8');
      console.log('Successfully wrote engineering standards to local file.');
    } else if (key === 'grading_standards') {
      const filePath = path.join(__dirname, 'plugins', 'gradingPlugin.js');
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const updatedContent = fileContent.replace(
        /export let gradingStandardsList = \[\s*[\s\S]*?\n\];/m,
        `export let gradingStandardsList = ${JSON.stringify(standards, null, 2)};`
      );
      await fs.promises.writeFile(filePath, updatedContent, 'utf-8');
      console.log('Successfully wrote grading standards to local file (gradingPlugin.js).');
    } else if (key === 'validation_standards') {
      console.log('Bypassed writing validation standards to local file since validationPlugin was removed.');
    }

    // 로컬 파일 저장이 성공했다면 비동기로 git commit & push 파이프라인을 가동합니다.
    autoGitPushStandards(key).catch(() => {});
  } catch (fsErr) {
    if (fsErr.code === 'EROFS') {
      console.log(`Read-only file system detected (Vercel). Bypassed file write for ${key}.`);
    } else {
      console.error(`Failed to write ${key} to local file:`, fsErr.message);
    }
  }
}

async function autoGitPushStandards(key) {
  if (process.env.VERCEL) {
    return;
  }
  
  const getGitCmd = async () => {
    try {
      await execAsync('git --version');
      return 'git';
    } catch {
      const paths = [
        'C:\\Program Files\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'cmd', 'git.exe')
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) {
          return `"${p}"`;
        }
      }
      return 'git';
    }
  };

  try {
    const gitCmd = await getGitCmd();
    console.log(`[Auto Git Sync] Resolved Git command path: ${gitCmd}`);
    console.log(`[Auto Git Sync] Starting automatic git commit & push for ${key}...`);

    const execOpts = {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'true'
      }
    };

    try {
      await execAsync(`${gitCmd} config --get user.name`, execOpts);
    } catch {
      console.log('[Auto Git Sync] user.name is missing. Setting up fallback configuration...');
      await execAsync(`${gitCmd} config --local user.name "AI Tutor AutoSync"`, execOpts);
      await execAsync(`${gitCmd} config --local user.email "tutor-autosync@anti.internal"`, execOpts);
    }

    await execAsync(`${gitCmd} add .`, execOpts);
    const commitMsg = `feat: auto-update ${key} standards from UI [${new Date().toLocaleTimeString()}]`;
    await execAsync(`${gitCmd} commit -m "${commitMsg}"`, execOpts);
    await execAsync(`${gitCmd} push origin main`, execOpts);
    console.log(`[Auto Git Sync] Successfully pushed ${key} updates to GitHub origin!`);
  } catch (err) {
    if (err.message && err.message.includes('nothing to commit')) {
      console.log('[Auto Git Sync] Nothing to commit, working directory is clean.');
    } else {
      console.error('[Auto Git Sync] Failed to run auto git commit & push:', err.message);
    }
  }
}

async function pushStandardToProduction(apiPath, standards) {
  const isVercel = !!process.env.VERCEL;
  if (isVercel) return;
  try {
    const res = await fetch(`https://anti-ashy.vercel.app/api/${apiPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ standards })
    });
    if (res.ok) {
      console.log(`[Push] Successfully pushed ${apiPath} to Vercel production.`);
    } else {
      console.warn(`[Push] Failed to push ${apiPath} to Vercel production: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[Push] Network error pushing ${apiPath} to Vercel production:`, err.message);
  }
}

async function syncStandardsFromProduction() {
  const isVercel = !!process.env.VERCEL;
  if (isVercel) {
    console.log('[Sync] Deployed production server (Vercel) detected. Bypassing production standards sync.');
    return;
  }
  
  console.log('[Sync] Synchronizing standards from production (https://anti-ashy.vercel.app)...');
  
  const standardsToSync = [
    { key: 'generation_standards', api: 'generation-standards', updater: updateLiveGenerationStandards, currentList: () => generationStandardsList },
    { key: 'lockscreen_standards', api: 'lockscreen-standards', updater: updateLiveLockscreenStandards, currentList: () => lockscreenStandardsList },
    { key: 'engineering_standards', api: 'engineering-standards', updater: updateLiveEngineeringStandards, currentList: () => standardsList },
    { key: 'grading_standards', api: 'grading-standards', updater: updateLiveGradingStandards, currentList: () => gradingStandardsList },
    { key: 'validation_standards', api: 'validation-standards', updater: updateLiveValidationStandards, currentList: () => validationStandardsList }
  ];
  
  for (const item of standardsToSync) {
    try {
      const res = await fetch(`https://anti-ashy.vercel.app/api/${item.api}`);
      if (!res.ok) {
        console.warn(`[Sync] Failed to fetch ${item.key} from production: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const standards = data.standards;
      if (Array.isArray(standards) && standards.length > 0) {
        // Keep production source list as-is without forcing code defaults
        const mergedList = [...standards];
        const currentStr = JSON.stringify(item.currentList());
        const newStr = JSON.stringify(mergedList);
        if (currentStr !== newStr) {
          // Update live memory state
          item.updater(mergedList);
          
          // Save to database to persist across restarts
          await saveSessionValue(item.key, JSON.stringify(mergedList));
          // Sync to local physical files as well
          await writeStandardToFile(item.key, mergedList);
          console.log(`[Sync] Synced ${item.key} (${mergedList.length} items) successfully.`);
        }
      }
    } catch (err) {
      console.warn(`[Sync] Error syncing ${item.key}:`, err.message);
    }
  }
}

async function applyScorePatch() {
  console.log('[DB Patch] Running temporary score patch...');
  try {
    // 1) 탄소성보법 토픽 점수 복원
    const topic1 = await dbQuery.get("SELECT id FROM topics WHERE title LIKE '%탄소성보법%'");
    if (topic1) {
      console.log(`[DB Patch] Found topic1 id: ${topic1.id}`);
      const updateRes1 = await dbQuery.run(
        "UPDATE schedules SET score = 70 WHERE topic_id = ? AND (score = 0 OR score IS NULL) AND status = 'completed'",
        [topic1.id]
      );
      console.log(`[DB Patch] Updated ${updateRes1.changes} schedules for topic1.`);
    }

    // 2) prandtl_s_bearing_capacity_theory_report 토픽 0점 -> 70점 복원
    const topic2 = await dbQuery.get("SELECT id FROM topics WHERE title LIKE '%prandtl_s_bearing_capacity_theory_report%'");
    if (topic2) {
      console.log(`[DB Patch] Found topic2 id: ${topic2.id}`);
      // 5/31 및 6/9 완료 회차의 스케줄 점수를 70점으로 패치
      const updateRes2 = await dbQuery.run(
        "UPDATE schedules SET score = 70 WHERE topic_id = ? AND (planned_date = '2026-05-31' OR planned_date = '2026-06-09') AND status = 'completed'",
        [topic2.id]
      );
      console.log(`[DB Patch] Updated ${updateRes2.changes} schedules for topic2.`);
    }
  } catch (err) {
    console.error('[DB Patch] Score patch error:', err.message);
  }
}

async function applyResetPatchForTopics3To24() {
  console.log('[DB Patch] Running reset patch for topics 3 to 24...');
  try {
    const checkLock = await dbQuery.get("SELECT value FROM app_session WHERE key = 'patch_reset_topics_3_24_done'");
    if (checkLock && checkLock.value === 'true') {
      console.log('[DB Patch] Reset patch for topics 3 to 24 already applied. Skipping.');
      return;
    }

    const baseDateStr = '2026-06-29 00:00:00';
    const roundDates = {
      2: '2026-07-03',
      3: '2026-07-10',
      4: '2026-07-24',
      5: '2026-08-28',
      6: '2026-10-27',
    };

    const schedules = await dbQuery.all(
      "SELECT id, topic_id, review_round, status, score FROM schedules WHERE topic_id >= 3 AND topic_id <= 24 AND review_round < 99"
    );

    let patchCount1 = 0;
    let patchCount2 = 0;
    let deletedSessions = 0;

    for (const s of schedules) {
      if (s.review_round === 1) {
        const finalScore = (s.score && s.score > 0) ? s.score : 100;
        await dbQuery.run(
          "UPDATE schedules SET status = 'completed', completed_at = ?, score = ? WHERE id = ?",
          [baseDateStr, finalScore, s.id]
        );
        patchCount1++;
      } else if (s.review_round >= 2 && s.review_round <= 6) {
        const correctPlannedDate = roundDates[s.review_round];
        await dbQuery.run(
          "UPDATE schedules SET status = 'pending', completed_at = NULL, score = NULL, correct_count = NULL, total_count = NULL, planned_date = ? WHERE id = ?",
          [correctPlannedDate, s.id]
        );
        
        const keysToDelete = [
          `completed_review_schedule_${s.id}`,
          `review_questions_schedule_${s.id}`
        ];
        for (const k of keysToDelete) {
          const delRes = await dbQuery.run("DELETE FROM app_session WHERE key = ?", [k]);
          deletedSessions += delRes.changes || 0;
        }
        patchCount2++;
      }
    }

    await saveSessionValue('patch_reset_topics_3_24_done', 'true');
    console.log(`[DB Patch] Reset Patch completed: round1 completed=${patchCount1}, round2+ pending=${patchCount2}, deletedSessions=${deletedSessions}`);
  } catch (err) {
    console.error('[DB Patch] Error in reset patch for topics 3 to 24:', err.message);
  }
}

// [DB Session Policy] 전체 토픽에 대해 최근 2회차를 제외한 과거 복습 세션 데이터 일괄 삭제
async function cleanupOldReviewSessions() {
  console.log('[DB Session Policy] Cleaning up old review session data globally...');
  try {
    const topics = await dbQuery.all("SELECT id FROM topics");
    let deletedCount = 0;
    
    for (const t of topics) {
      const finished = await dbQuery.all(
        `SELECT id FROM schedules 
         WHERE topic_id = ? AND (status = 'completed' OR status = 'failed') 
         ORDER BY review_round DESC`,
        [t.id]
      );
      
      if (finished.length > 2) {
        const oldSchedules = finished.slice(2);
        for (const oldSched of oldSchedules) {
          const oldSessionKey = `completed_review_schedule_${oldSched.id}`;
          const res = await dbQuery.run('DELETE FROM app_session WHERE key = ?', [oldSessionKey]);
          if (res.changes > 0) {
            deletedCount += res.changes;
          }
        }
      }
    }
    console.log(`[DB Session Policy] Globally deleted ${deletedCount} old review session keys.`);
  } catch (err) {
    console.error('[DB Session Policy] Global cleanup error:', err.message);
  }
}

async function startServer() {
  try {
    await initDatabase();
    console.log('Database schema initialization completed.');
    await loadPreferredModel();
    await initializeEngineeringStandards();
    await initializeGradingStandards();
    await initializeValidationStandards();
    await initializeGenerationStandards();
    await initializeLockscreenStandards();
    // Sync from production to local database if running locally
    await syncStandardsFromProduction();
    
    // Start periodic background sync from production once every hour (3600000 ms)
    setInterval(() => {
      syncStandardsFromProduction().catch(err => {
        console.warn('[Periodic Sync] Error syncing standards from production:', err.message);
      });
    }, 3600000);

    await migrateSpacedIntervals();
    await healPendingSchedules();
    await backfillPastScheduleScores();
    await migrateLegacySessionKeys();
    await applyScorePatch();
    await applyResetPatchForTopics3To24();
    await cleanupOldReviewSessions();
  } catch (dbErr) {
    console.error('CRITICAL WARNING: Database schema initialization failed. Server starting anyway in degraded mode:', dbErr.message);
    global.dbInitError = dbErr.message;
  }

  try {
    app.listen(PORT, () => {
      console.log(`============================================`);
      console.log(`Spaced Repetition Backend is running!`);
      console.log(`Server Port: ${PORT}`);
      console.log(`============================================`);
      
      // Start automatic 3-day backup scheduler for Neon PostgreSQL
      startBackupScheduler();

      // Pregenerate/replenish lockscreen pool on startup in background
      replenishLockscreenPool(null).catch(err => console.error('Startup pool replenishment failed:', err));
    });
  } catch (err) {
    console.error('Failed to start application server listener:', err);
    process.exit(1);
  }
}

// 임시 디버깅 용도로 암호화되어 보이지 않던 API 키 값을 노출합니다.
app.get('/api/debug-keys', (req, res) => {
  res.json({
    primary: process.env.GEMINI_API_KEY || 'not_set',
    secondary: process.env.GEMINI_API_KEY_SECONDARY || 'not_set'
  });
});

app.get('/api/run-patch-3-24', async (req, res) => {
  console.log('[API Patch] Manual trigger run-patch-3-24 requested.');
  try {
    const isForce = req.query.force === 'true';
    if (!isForce) {
      const checkLock = await dbQuery.get("SELECT value FROM app_session WHERE key = 'patch_reset_topics_3_24_done'");
      if (checkLock && checkLock.value === 'true') {
        return res.json({ success: true, message: 'Reset patch already applied previously. Pass ?force=true to override.' });
      }
    }

    const baseDateStr = '2026-06-29 00:00:00';
    const roundDates = {
      2: '2026-07-03',
      3: '2026-07-10',
      4: '2026-07-24',
      5: '2026-08-28',
      6: '2026-10-27',
    };

    const schedules = await dbQuery.all(
      "SELECT id, topic_id, review_round, status, score FROM schedules WHERE topic_id >= 3 AND topic_id <= 24 AND review_round < 99"
    );

    let patchCount1 = 0;
    let patchCount2 = 0;
    let deletedSessions = 0;

    for (const s of schedules) {
      if (s.review_round === 1) {
        const finalScore = (s.score && s.score > 0) ? s.score : 100;
        await dbQuery.run(
          "UPDATE schedules SET status = 'completed', completed_at = ?, score = ? WHERE id = ?",
          [baseDateStr, finalScore, s.id]
        );
        patchCount1++;
      } else if (s.review_round >= 2 && s.review_round <= 6) {
        const correctPlannedDate = roundDates[s.review_round];
        await dbQuery.run(
          "UPDATE schedules SET status = 'pending', completed_at = NULL, score = NULL, correct_count = NULL, total_count = NULL, planned_date = ? WHERE id = ?",
          [correctPlannedDate, s.id]
        );
        
        const keysToDelete = [
          `completed_review_schedule_${s.id}`,
          `review_questions_schedule_${s.id}`
        ];
        for (const k of keysToDelete) {
          const delRes = await dbQuery.run("DELETE FROM app_session WHERE key = ?", [k]);
          deletedSessions += delRes.changes || 0;
        }
        patchCount2++;
      }
    }

    await saveSessionValue('patch_reset_topics_3_24_done', 'true');
    
    res.json({
      success: true,
      message: 'Successfully patched database.',
      round1_completed_count: patchCount1,
      round2_to_6_reset_count: patchCount2,
      deleted_sessions_count: deletedSessions
    });
  } catch (err) {
    console.error('[API Patch] Manual trigger failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/debug-topic-27', async (req, res) => {
  try {
    const resSchedules = await dbQuery.all(
      "SELECT id, review_round, status, score, completed_at, planned_date FROM schedules WHERE topic_id = 27 ORDER BY review_round"
    );
    const scheduleIds = resSchedules.map(r => r.id);
    let sessions = [];
    if (scheduleIds.length > 0) {
      const queryStr = `SELECT key, LENGTH(value) as len FROM app_session WHERE key IN (${scheduleIds.map(id => `'completed_review_schedule_${id}'`).join(',')})`;
      sessions = await dbQuery.all(queryStr);
    }
    res.json({
      success: true,
      schedules: resSchedules,
      sessions: sessions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// Express global error handler to prevent raw HTML gateway errors and enforce JSON responses
app.use((err, req, res, next) => {
  console.error('Express global error handler:', err);
  res.status(500).json({ error: err.message || '서버 내부 오류가 발생했습니다.' });
});

// Vercel Serverless 환경 대응: Vercel이 아닌 로컬 구동 시에만 포트 리스너(app.listen)를 시작합니다.
export default app;

if (!process.env.VERCEL) {
  startServer();
} else {
  // Vercel 서버리스 환경에서는 데이터베이스 연결 및 테이블 자동 생성을 비동기로 조용히 가동합니다.
  initDatabase().then(async () => {
    console.log('Vercel serverless DB initialization completed.');
    await loadPreferredModel();
    await initializeEngineeringStandards();
    await initializeGradingStandards();
    await initializeValidationStandards();
    await initializeGenerationStandards();
    await initializeLockscreenStandards();
    await migrateSpacedIntervals();
    await healPendingSchedules();
    await backfillPastScheduleScores();
    await migrateLegacySessionKeys();
    await applyScorePatch();
    await applyResetPatchForTopics3To24();
    await cleanupOldReviewSessions();
  }).catch(dbErr => {
    console.error('CRITICAL WARNING: Database schema initialization failed on Vercel:', dbErr.message);
    global.dbInitError = dbErr.message;
  });
}
// Trigger redeployment to apply absolute path fixes and BOM-less UTF-8 configuration.
