import express from 'express';
import { healLatexFormulas, healQuizQuestionObject, healTheoryQuestionObject, healFormulaQuestionObject, healAnswersheetQuestionObject, LATEX_PROMPT_INSTRUCTIONS, LATEX_CHAT_PROMPT_INSTRUCTIONS } from './utils/latexUtils.js';
import cors from 'cors';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initDatabase, dbQuery, isPostgres } from './database.js';
import { startBackupScheduler } from './backupManager.js';
import { generateFallbackQuestions as generateFallbackQuestionsModule } from './fallback_generator.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { gradeSubjective } from './plugins/gradingPlugin.js';
import { ENGINEERING_STANDARDS } from './plugins/engineeringStandards.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BT = '```';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
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


// Safe LaTeX-preserving backslash escaper for LLM JSON responses
function escapeJsonBackslashes(str) {
  if (!str) return str;
  let result = '';
  let inString = false;
  let i = 0;
  
  const latexCommands = [
    // n
    'newline', 'nabla', 'nu', 'neq', 'neg', 'ni', 'notin', 'ngeq', 'nleq', 'nsim', 'ncong', 'nparallel', 'noindent',
    // t
    'theta', 'tau', 'tan', 'times', 'tilde', 'text', 'tfrac', 'triangle', 'top', 'to', 'tiny', 'today',
    // r
    'rho', 'right', 'rule', 'rangle', 'rightarrow', 'rightleftharpoons', 'rightharpoonup', 'rightharpoondown', 'real', 'ref', 'raise',
    // b
    'beta', 'bar', 'begin', 'bmod', 'boldsymbol', 'bullet', 'box', 'bigcap', 'bigcup', 'backslash',
    // f
    'frac', 'forall', 'flat', 'frown', 'footnotesize', 'fbox',
    // other greek/common commands
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
        // Safe unicode sequence bypass
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

function parseLlmJson(text) {
  if (!text) return null;
  let cleaned = text.trim();
  
  // 마크다운 코드 블록 제거 복원
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  }

  const escaped = escapeJsonBackslashes(cleaned);
  return JSON.parse(escaped);
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

/**
 * 5월 30일 업그레이드 완료된 다중 API 키 순환, 지수 백오프(Exponential Backoff), 3단계 모델 폴백 시스템
 * 429 감지 시 즉각 2초 -> 4초 -> 8초의 지수 백오프로 자동 대기 후 재시도하며, 완전히 소진될 때만 다음 보조 키로 감쇄 전환
 */
async function callLLMWithFailover(systemInstruction, userPrompt, image = null, scenario = 'default') {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_SECONDARY,
    process.env.GEMINI_API_KEY_TERTIARY,
    process.env.XAI_API_KEY,
    process.env.GROK_API_KEY
  ]
    .filter(Boolean)
    .map(k => k.trim().replace(/^['"]|['"]$/g, ''));

  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY 또는 XAI_API_KEY가 설정되어 있지 않습니다.');
  }

  const keyErrors = [];
  const hasImage = image && image.data && image.mimeType;
  let attemptedAny = false;

  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const key = keys[kIdx];
    const maskedKey = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    const isGrok = key.startsWith('xai-');
    const isGroq = key.startsWith('gsk_');

    if (hasImage && (isGrok || isGroq)) {
      console.log(`[Skip Text-Only Key] Key #${kIdx + 1} (${maskedKey}) - Grok/Groq은 이미지 입력을 지원하지 않으므로 건너뜁니다.`);
      continue;
    }

    attemptedAny = true;
    let keyExhausted = false;
    let keyLastError = null;

    if (isGrok) {
      const GROK_MODELS = ['grok-2-1212', 'grok-2', 'grok-beta'];
      let basicModelFailedCount = 0;
      for (const modelName of GROK_MODELS) {
        if (keyExhausted) break;

        let attempt = 0;
        const maxAttempts = 2; // 1 retry (2s)
        let delay = 2000; // Initial delay: 2s

        while (attempt < maxAttempts) {
          try {
            console.log(`[Grok 시도] Key #${kIdx + 1} (${maskedKey}), 모델: ${modelName} (시도 #${attempt + 1})`);
            const messages = [];
            if (systemInstruction) {
              messages.push({ role: 'system', content: systemInstruction });
            }
            messages.push({ role: 'user', content: userPrompt });

            const response = await fetch('https://api.x.ai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: modelName,
                messages: messages,
                temperature: 0.2
              })
            });

            if (!response.ok) {
              const errBody = await response.text().catch(() => '');
              throw new Error(`HTTP Error ${response.status}: ${errBody}`);
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content?.trim();
            if (text) {
              console.log(`[Grok 성공] Key #${kIdx + 1} (${maskedKey}), 모델: ${modelName}`);
              return text;
            } else {
              throw new Error('Grok response empty or invalid choices structure');
            }
          } catch (err) {
            console.warn(`[Grok 실패] Key #${kIdx + 1} (${maskedKey}), ${modelName} (시도 #${attempt + 1}): ${err.message?.substring(0, 120)}`);
            keyLastError = err;

            const isQuota = err.message?.includes('Quota') || err.message?.includes('quota') || err.message?.includes('rate') || err.status === 429 || err.message?.includes('429') || err.message?.includes('Limit');
            if (isQuota) {
              attempt++;
              if (attempt < maxAttempts) {
                console.log(`[지수 백오프] 429 감지 (Grok). ${delay}ms 후 재시도합니다...`);
                await sleep(delay);
                delay *= 2; // Double the delay
              } else {
                console.warn(`[Grok Model Limit] Key #${kIdx + 1}의 ${modelName} 호출 한도 초과. 다음 하위 모델로 우회합니다.`);
                basicModelFailedCount++;
                break;
              }
            } else {
              basicModelFailedCount++;
              break;
            }
          }
        }
      }
      if (basicModelFailedCount >= GROK_MODELS.length) {
        console.warn(`[Grok Key Exhausted] Key #${kIdx + 1} (${maskedKey})의 모든 가용 모델 한도 소진. 다음 보조 API 키로 전환합니다.`);
        keyExhausted = true;
      }
    } else if (isGroq) {
      const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
      let basicModelFailedCount = 0;
      for (const modelName of GROQ_MODELS) {
        if (keyExhausted) break;

        let attempt = 0;
        const maxAttempts = 2; // 1 retry (2s)
        let delay = 2000; // Initial delay: 2s

        while (attempt < maxAttempts) {
          try {
            console.log(`[Groq 시도] Key #${kIdx + 1} (${maskedKey}), 모델: ${modelName} (시도 #${attempt + 1})`);
            const messages = [];
            if (systemInstruction) {
              messages.push({ role: 'system', content: systemInstruction });
            }
            messages.push({ role: 'user', content: userPrompt });

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: modelName,
                messages: messages,
                temperature: 0.2
              })
            });

            if (!response.ok) {
              const errBody = await response.text().catch(() => '');
              throw new Error(`HTTP Error ${response.status}: ${errBody}`);
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content?.trim();
            if (text) {
              console.log(`[Groq 성공] Key #${kIdx + 1} (${maskedKey}), 모델: ${modelName}`);
              return text;
            } else {
              throw new Error('Groq response empty or invalid choices structure');
            }
          } catch (err) {
            console.warn(`[Groq 실패] Key #${kIdx + 1} (${maskedKey}), ${modelName} (시도 #${attempt + 1}): ${err.message?.substring(0, 120)}`);
            keyLastError = err;

            const isQuota = err.message?.includes('Quota') || err.message?.includes('quota') || err.message?.includes('rate') || err.status === 429 || err.message?.includes('429') || err.message?.includes('Limit');
            if (isQuota) {
              attempt++;
              if (attempt < maxAttempts) {
                console.log(`[지수 백오프] 429 감지 (Groq). ${delay}ms 후 재시도합니다...`);
                await sleep(delay);
                delay *= 2;
              } else {
                console.warn(`[Groq Model Limit] Key #${kIdx + 1}의 ${modelName} 호출 한도 초과. 다음 하위 모델로 우회합니다.`);
                basicModelFailedCount++;
                break;
              }
            } else {
              basicModelFailedCount++;
              break;
            }
          }
        }
      }
      if (basicModelFailedCount >= GROQ_MODELS.length) {
        console.warn(`[Groq Key Exhausted] Key #${kIdx + 1} (${maskedKey})의 모든 가용 모델 한도 소진. 다음 보조 API 키로 전환합니다.`);
        keyExhausted = true;
      }
    } else {
      // Gemini (심폐소생 순환 로직 최적화 파트)
      const genAI = new GoogleGenerativeAI(key);
      let MODELS = [
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
      ];
      if (scenario === 'question' || scenario === 'formula' || scenario === 'tutor' || scenario === 'option-explanation' || scenario === 'grading') {
        MODELS = [
          'gemini-3.1-flash-lite',
          'gemini-3.5-flash',
          'gemini-2.5-flash',
          'gemini-2.5-flash-lite',
          'gemini-2.0-flash',
          'gemini-1.5-flash'
        ];
      }
      
      let basicModelFailedCount = 0;

      for (const modelName of MODELS) {
        let attempt = 0;
        const maxAttempts = 2; // 실패 시 딱 1번만 더 재시도 (최초 1회 + 재시도 1회 = 총 2회 시도)
        let delay = 1000; // 재시도 대기 시간 1초로 최적화

        while (attempt < maxAttempts) {
          try {
            console.log(`[Gemini 시도] Key #${kIdx + 1} (${maskedKey}), 모델: ${modelName} (시도 #${attempt + 1})`);
            const model = genAI.getGenerativeModel({
              model: modelName,
              systemInstruction: systemInstruction || undefined,
              generationConfig: { temperature: 0.2 }
            });
            
            let generateContentArg = userPrompt;
            if (image && image.data && image.mimeType) {
              generateContentArg = [
                userPrompt,
                {
                  inlineData: {
                    mimeType: image.mimeType,
                    data: image.data
                  }
                }
              ];
            }
            
            const result = await model.generateContent(generateContentArg);
            const text = result.response.text().trim();
            if (text) {
              console.log(`[Gemini 성공] Key #${kIdx + 1} (${maskedKey}), 모델: ${modelName}`);
              return text;
            }
          } catch (err) {
            console.warn(`[Gemini 실패] Key #${kIdx + 1} (${maskedKey}), ${modelName} (시도 #${attempt + 1}): ${err.message?.substring(0, 120)}`);
            keyLastError = err;

            const isQuota = (err.status === 429 || err.message?.includes('429') || err.message?.includes('Quota') || err.message?.includes('quota') || err.message?.includes('rate')) && !err.message?.includes('not found') && !err.message?.includes('Model');
            if (isQuota) {
              attempt++;
              if (attempt < maxAttempts) {
                console.log(`[지수 백오프] 429 감지. ${delay}ms 후 재시도합니다...`);
                await sleep(delay);
                delay *= 2;
              } else {
                console.warn(`[Gemini Model Limit] Key #${kIdx + 1}의 ${modelName} 호출 한도 초과. 다음 하위 모델로 우회합니다.`);
                basicModelFailedCount++;
                break; // 현재 모델의 while 루프만 탈출하고 다음 modelName 자원을 계속 탐색
              }
            } else {
              // 쿼터 에러가 아닌 다른 치명적 에러 발생 시에도 하위 모델 기회 균등 보장
              basicModelFailedCount++;
              break;
            }
          }
        }
      }

      // [핵심] 3가지 백오프 대상 모델이 '전부' 무력화되었을 때만 최종 키 사망 마킹 처리
      if (basicModelFailedCount >= MODELS.length) {
        console.warn(`[Gemini Key Exhausted] Key #${kIdx + 1} (${maskedKey})의 모든 가용 모델 한도 소진. 다음 보조 API 키로 전환합니다.`);
        keyExhausted = true;
      }
    }

    if (keyLastError) {
      const errMsg = keyLastError.message || 'Unknown error';
      let keyType = 'Gemini';
      if (isGrok) keyType = 'Grok';
      else if (isGroq) keyType = 'Groq';
      keyErrors.push(`Key #${kIdx + 1} (${keyType}): ${errMsg.substring(0, 120)}`);
    }
  }

  if (hasImage && !attemptedAny) {
    throw new Error('이미지 분석에는 Gemini API 키가 필요하지만, 현재 등록된 Gemini API 키가 없습니다. 관리자에게 문의해 주세요.');
  }

  if (keyErrors.length > 0) {
    if (hasImage) {
      throw new Error(`이미지 분석을 위한 모든 Gemini API 키가 할당량 초과(429 Rate Limit) 또는 장애로 인해 사용 불가능합니다. 잠시 후 다시 시도해 주세요. (상세 오류 요약: ${keyErrors.join(' | ')})`);
    } else {
      throw new Error(`[AI 호출 실패] ${keyErrors.join(' | ')}`);
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

// Built-in Expert-Grade PE Questions for Single Shell Tunnel Method
function getSingleShellExpertQuestions(title, keywords) {
  const q1 = {
    type: '주관식 (개요)',
    question: `싱글쉘(Single Shell) 터널 공법의 정의 및 핵심 개념을 간략히 서술하시오.`,
    concept: `싱글쉘 터널 공법은 1차 지보재(숏크리트, 락볼트)와 2차 라이닝을 하나로 통합하여 단일 영구 지보 구조로 터널을 형성하는 영구 지보 공법입니다.`,
    formula: '',
    structure: ''
  };

  const q2 = {
    type: '주관식 (공식)',
    question: `싱글쉘 및 NATM 공법의 숏크리트 소요 두께를 설계하는 대표적인 Rabcewicz 공식`,
    concept: `지반압과 숏크리트 전단강도, 지반 물성을 고려하여 터널을 안정시키는 데 필요한 숏크리트 두께를 정량적으로 계산하는 조건 수식입니다.`,
    formula: `$t = \\frac{P - 2C \\sin\\varphi}{\\gamma \\tan\\varphi + \\frac{2S}{D}}$\n- $t$: 숏크리트 두께\n- $P$: 지반압\n- $C$: 지반 점착력\n- $\\varphi$: 내부마찰각\n- $S$: 전단강도\n- $D$: 터널 직경`,
    structure: ''
  };

  const mcQuestions = [
    {
      type: '객관식 (4지선다)',
      question: `싱글쉘 터널 공법과 기존 NATM 이중 쉘(Double Shell) 공법의 차이점에 대한 설명으로 가장 적절하지 않은 것은?`,
      options: shuffleArray([
        "싱글쉘 공법은 1차 지보재와 2차 라이닝을 통합하여 단일 영구 지보 구조를 형성한다.",
        "NATM 이중 쉘 공법은 숏크리트 배면의 방수 시트를 기준으로 내외측 구조가 분리되어 거동한다.",
        "싱글쉘 공법은 라이닝 콘크리트를 별도로 타설하므로 NATM 대비 공기단축 효과가 전혀 없다.",
        "싱글쉘 공법은 외부 지하수를 배수시키는 배수형과 수압을 견디는 비배수형으로 설계할 수."
      ]),
      answer: "싱글쉘 공법은 라이닝 콘크리트를 별도로 타설하므로 NATM 대비 공기단축 효과가 전혀 없다.",
      explanation: "싱글쉘 공법은 1차 지보와 2차 라이닝을 일체화하여 시공하므로 NATM 이중쉘 공법 대비 공기 단축 및 공사비 절감 효과가 우수합니다. 따라서 공기단축 효과가 전혀 없다는 진술은 오답입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `싱글쉘 터널에서 숏크리트와 지반(암반)의 부착(Bonding) 특성이 중요한 역학적 이유로 가장 올바른 것은?`,
      options: shuffleArray([
        "숏크리트와 암반의 전단 접착 강도를 극대화하여 지반 자체의 자립력을 최대한 활용하기 위함이다.",
        "숏크리트 배면에 지하수를 원활하게 유입시켜 수압을 최대화하기 위함이다.",
        "터널 라이닝의 균열을 유도하여 응력을 집중시키기 위함이다.",
        "락볼트의 설치 개수를 대폭 늘리기 위한 전제조건이다."
      ]),
      answer: "숏크리트와 암반의 전단 접착 강도를 극대화하여 지반 자체의 자립력을 최대한 활용하기 위함이다.",
      explanation: "싱글쉘 공법은 숏크리트와 암반의 접착 능력을 통해 응력 재분배를 유도하고 지반의 아칭 효과(자립력)를 극대화하는 것이 핵심 메커니즘입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `싱글쉘 공법에서 숏크리트 두께를 산정하기 위해 활용되는 고전적인 구조 설계 공식은 무엇인가?`,
      options: shuffleArray([
        "Rabcewicz 공식",
        "Darcy 공식",
        "Prandtl 공식",
        "Terzaghi 공식"
      ]),
      answer: "Rabcewicz 공식",
      explanation: "터널 구조 설계 시 숏크리트 두께(t) 산정을 위해 지반압, 내부마찰각, 숏크리트 전단강도 등을 고려하는 Rabcewicz 공식이 전통적으로 널리 사용됩니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `비배수(Hydraulic) 싱글쉘 터널 설계 시, 터널 라이닝 배면 수압(Water Pressure) 산정을 위해 사용하는 기본적인 수두 관계식으로 가장 적절한 것은?`,
      options: shuffleArray([
        "$p_w = \\gamma_w \\times H$ ($\\gamma_w$: 물의 단위중량, $H$: 수두)",
        "$p_w = \\gamma_w / H$",
        "$p_w = k \\times i$",
        "$p_w = OCR \\times p_0$"
      ]),
      answer: "$p_w = \\gamma_w \\times H$ ($\\gamma_w$: 물의 단위중량, $H$: 수두)",
      explanation: "비배수 터널 라이닝 배면에 작용하는 정수압(Hydrostatic Pressure)은 지하수위 아래에서의 깊이(수두, $H$)와 물의 단위중량($\\gamma_w$)의 곱으로 산정됩니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `싱글쉘 숏크리트의 장기 신뢰성(Long-term Reliability)을 저해하는 화학적 열화 요인과 가장 거리가 먼 것은?`,
      options: shuffleArray([
        "숏크리트의 중성화(Carbonation)",
        "지하수 내 황산염 침투에 의한 황산염 부식",
        "대기 중의 질소 가스 결합에 의한 급격한 질화 팽창",
        "보강 섬유 및 격자지보의 장기 부식 현상"
      ]),
      answer: "대기 중의 질소 가스 결합에 의한 급격한 질화 팽창",
      explanation: "콘크리트의 주요 열화 메커니즘은 이산화탄소에 의한 중성화, 지하수 황산염 부식, 철근/보강섬유 부식 등이며 대기 질소에 의한 질화 팽창은 콘크리트 열화의 주요 요인이 아닙니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `싱글쉘 공법 설계 시 배수형(Drained) 시스템과 비교한 비배수형(Non-drained/Hydraulic) 시스템의 특징으로 옳지 않은 것은?`,
      options: shuffleArray([
        "터널 배면에 방수막을 설치하여 지하수의 터널 유입을 차단한다.",
        "터널 주변의 지하수위 저하를 유발하므로 주변 지반 침하 리스크가 크다.",
        "터널 배면에 정수압이 상시 작용하므로 라이닝 두께가 두꺼워진다.",
        "수자원 보존 및 환경 영향을 최소화해야 하는 도심지 터널에 주로 적용된다."
      ]),
      answer: "터널 주변의 지하수위 저하를 유발하므로 주변 지반 침하 리스크가 크다.",
      explanation: "비배수형 시스템은 지하수의 터널 유입을 차단하여 지하수위를 그대로 유지하므로, 주변 지하수위 저하에 따른 지반 침하 리스크가 매우 낮습니다. 반면 배수형은 지하수 배출로 인한 수위 저하와 침하 우려가 있습니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `싱글쉘 숏크리트의 취성 파괴를 방지하고 휨인성(Flexural Toughness)을 극대화하기 위해 첨가하는 핵심 재료는 무엇인가?`,
      options: shuffleArray([
        "강섬유(Steel Fiber) 또는 합성섬유",
        "지하수용 급결제(Accelerator)",
        "실리카 퓸(Silica Fume)",
        "벤토나이트(Bentonite) 점토 분말"
      ]),
      answer: "강섬유(Steel Fiber) 또는 합성섬유",
      explanation: "섬유보강 숏크리트(SFRC)는 콘크리트 내부에 미세한 강섬유나 합성섬유를 균일하게 분산시켜 인장 강도와 휨인성을 향상시키고 균열 발생을 효과적으로 통제합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `NATM 싱글쉘 터널의 거동 분석을 위해 사용되는 지반 반응 곡선(GRC)과 지보 제한 곡선(LSC)에 관한 설명으로 가장 올바른 것은?`,
      options: shuffleArray([
        "GRC는 터널 굴착 시 지반 내압 감소에 따른 막장면/천단부 변위 증가 거동을 나타낸다.",
        "지보재의 설치 시기가 빠를수록 GRC 곡선은 위로 급격히 이동한다.",
        "LSC 곡선은 지반의 자중 변화만을 정량적으로 나타내는 대수나선형 곡선이다.",
        "GRC와 LSC가 만나는 교점은 터널이 무조건 붕괴하는 극한 상태를 의미한다."
      ]),
      answer: "GRC는 터널 굴착 시 지반 내압 감소에 따른 막장면/천단부 변위 증가 거동을 나타낸다.",
      explanation: "GRC(Ground Reaction Curve)는 터널 변위가 증가함에 따라 지반 스스로 지지하는 응력 상태의 변화를 나타내며, LSC와의 교점은 터널 변위와 지보재가 조화롭게 평형을 이루어 안정화되는 평형 수렴 상태를 의미합니다."
    }
  ];

  return [q1, q2, ...mcQuestions];
}

// Built-in Expert-Grade PE Questions for Soil Nailing & Earth Anchor Comparison
function getSoilNailingEarthAnchorExpertQuestions(title, keywords) {
  console.log("Routing to Built-in Expert PE Content: Soil Nailing & Earth Anchor Comparison");
  const q1 = {
    type: '주관식 (개요)',
    question: `소일네일링(Soil Nailing) 공법과 어스앵커(Earth Anchor) 공법의 역학적 거동 및 지지력 확보 방식의 핵심 차이점을 비교 설명하시오.`,
    concept: `• 역학적 거동: 소일네일링은 변위 발생 시 저항하는 수동적(Passive) 거동인 반면, 어스앵커는 선행 긴장력(Prestress)으로 변위를 사전에 능동적(Active)으로 제어합니다.\n• 지지력 확보 방식: 소일네일링은 네일 전면과 흙 사이의 마찰력으로 지반을 일체화(유사 옹벽화)하며, 어스앵커는 자유장을 지나 정착장 주변마찰 저항과 강선의 긴장력으로 하중을 심부 지반에 전달합니다.\n• 핵심 차이점: 변위를 허용하는 연성 지반 보강(수동) vs 지반 변위를 강력하게 억제하는 고정식 지보(능동) 구조입니다.`,
    formula: '',
    structure: ''
  };

  const q2 = {
    type: '주관식 (공식)',
    question: `어스앵커 설계 시 극한 인장력을 산정하는 대표적인 기본 설계 공식`,
    concept: `어스앵커의 정착부 설계에서 정착 마찰 저항력에 의한 앵커의 극한 지지력을 결정하는 공학적 공식입니다.`,
    formula: `$T_u = \\pi \\cdot d \\cdot L_a \\cdot \\tau_u$\n- $T_u$: 앵커의 극한 인장 지지력\n- $d$: 정착장 천공 직경\n- $L_a$: 앵커 정착장의 길이\n- $\\tau_u$: 지반과 그라우트 사이의 극한 주변마찰응력`,
    structure: ''
  };

  const mcQuestions = [
    {
      type: '객관식 (4지선다)',
      question: `소일네일링(Soil Nailing) 공법의 역학적 거동 특성에 대한 설명으로 가장 올바르지 않은 것은?`,
      options: shuffleArray([
        "네일은 지반 변위가 발생함에 따라 인장력이 유발되는 수동적(Passive) 보강재이다.",
        "보강된 지반 전체가 하나의 유사 옹벽(Pseudo-retaining wall)처럼 일체 거동한다.",
        "인장 강선에 큰 선행 인장력(Prestress)을 미리 도입하여 지반 변위를 원천 차단한다.",
        "사면이나 옹벽 등 비교적 변위 허용폭이 넓은 지반 보강에 매우 유리하다."
      ]),
      answer: "인장 강선에 큰 선행 인장력(Prestress)을 미리 도입하여 지반 변위를 원천 차단한다.",
      explanation: "소일네일링은 선행 긴장력을 가하지 않는 수동적(Passive) 시스템입니다. 큰 선행 하중(Prestress)을 가하여 변위를 강력히 억제하는 것은 어스앵커 공법의 대표적 특징입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `어스앵커(Earth Anchor) 공법의 가장 핵심적인 공학적 장점 및 역학적 특징으로 옳은 것은?`,
      options: shuffleArray([
        "지반 내부에 별도의 인장 강선을 설치하지 않아 경제적이다.",
        "능동적(Active) 지지 시스템으로 선행 인장력을 인가하여 주변 지반 변위를 최소화한다.",
        "정착 부위의 마찰력이 아닌 전면 판의 수동 토압에만 100% 의존한다.",
        "천공 직경이 소일네일링보다 매우 작아 연약지반에서만 유일하게 시공이 가능하다."
      ]),
      answer: "능동적(Active) 지지 시스템으로 선행 인장력을 인가하여 주변 지반 변위를 최소화한다.",
      explanation: "어스앵커는 강선에 인장력(Prestress)을 도입함으로써 흙막이벽이나 지반의 수평 변위를 강력하고 적극적으로 제어하는 능동적(Active) 지중 지보 시스템입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `어스앵커를 설계할 때 인장력 도입을 위해 정착부와 자유장으로 분할하여 시공하는데, 이때 '자유장(Free Length)'의 주된 역학적 역할로 올바른 것은?`,
      options: shuffleArray([
        "주변 흙과의 마찰력을 전면 차단하여 긴장력이 정착부까지 안전하게 도달하도록 돕는 구간이다.",
        "그라우트를 채워 흙과 네일이 완전히 접착되도록 밀착 마찰력을 제공하는 구간이다.",
        "전면 지압판을 지탱하기 위해 시멘트 풀로 완전히 보강된 단단한 지반 구간이다.",
        "지하수의 유입을 원천적으로 차단하기 위해 실링 고무 패커만 설치하는 구간이다."
      ]),
      answer: "주변 흙과의 마찰력을 전면 차단하여 긴장력이 정착부까지 안전하게 도달하도록 돕는 구간이다.",
      explanation: "어스앵커의 자유장(Free Length)은 긴장력을 가할 때 발생하는 하중이 정착부(Anchor Zone)에만 확실히 전달되도록 쉬스관 등을 씌워 지반과의 마찰 및 본딩을 의도적으로 차단하는 구간입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `소일네일링 배치 설계 시 네일 간의 간격과 천공 각도에 대한 설명 중 가장 적절한 것은?`,
      options: shuffleArray([
        "수평이나 수직 변위를 조절하기 위해 천공 각도는 90도 연직 방향이 표준이다.",
        "그라우트 충전 가독성과 중력식 배출을 위해 아래로 10~20도 정도 경사지게 천공한다.",
        "네일의 간격은 넓을수록 인장 전단 포락선 효과가 증대되어 안전하다.",
        "천공 각도가 수평선 위쪽(상향)으로 경사질수록 그라우트 밀착도가 극대화된다."
      ]),
      answer: "그라우트 충전 가독성과 중력식 배출을 위해 아래로 10~20도 정도 경사지게 천공한다.",
      explanation: "소일네일링 및 어스앵커의 천공은 시멘트 그라우트가 중력에 의해 조밀하게 주입 및 배치될 수 있도록 수평면 기준 아래 방향(하향)으로 10~20도 경사지게 시공하는 것이 표준 실무입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `어스앵커 인장 시험(Tensile Test) 중 앵커의 시공 품질, 크리프 안정성 및 적정 긴장력 유지 여부를 검증하기 위해 실제 현장 앵커 중 일부(통상 5% 내외)를 대상으로 정밀하게 수행하는 시험의 명칭은?`,
      options: shuffleArray([
        "확인 시험 (Acceptance Test / Proof Test)",
        "인발 시험 (Pull-out Test)",
        "인장 압축 탄성 계수 측정 시험",
        "동적 타격 관입 시험 (SPT)"
      ]),
      answer: "확인 시험 (Acceptance Test / Proof Test)",
      explanation: "어스앵커 시공 시 현장에 설치된 앵커가 설계 기준 조건에 완벽히 부합하고 설계 정착력을 유지하는지 확인하기 위해 일부 앵커에 대해 실시하는 정밀한 시험을 확인 시험(Acceptance Test 또는 Proof Test)이라고 합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `소일네일링 공법의 주요 파괴 모드(Failure Mode) 중 '외적 파괴(External Failure)'에 해당하는 것은?`,
      options: shuffleArray([
        "네일 철근의 인장 파괴 (Tensile failure of nail steel bar)",
        "네일과 그라우트 계면의 전단 부착 파괴 (Bond failure between nail and grout)",
        "보강 토체 전체의 전면적 사면 슬라이딩 파괴 (Global slope sliding failure)",
        "전면 지압판 및 지보 콘크리트의 휨 파괴"
      ]),
      answer: "보강 토체 전체의 전면적 사면 슬라이딩 파괴 (Global slope sliding failure)",
      explanation: "소일네일링 파괴 모드 중 네일재 자체의 파괴나 흙-그라우트 부착 실패는 내적 파괴(Internal Failure)에 해당하며, 보강된 토체 전체가 사면 형태로 회전 붕괴하거나 활동하는 것은 외적 파괴(External Failure)입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `어스앵커의 정착방식 중 인장 하중을 정착 장 내에 있는 지압 장치를 통해 그라우트에 전면 압축 응력으로 직접 전달하는 압축형 앵커의 장점으로 가장 거리가 먼 것은?`,
      options: shuffleArray([
        "그라우트재의 단점인 인장 균열 발생을 근본적으로 차단할 수 있다.",
        "인장형 앵커 대비 응력 집중 현상이 적어 내구성이 크게 향상된다.",
        "시공 및 조립 과정이 인장형에 비해 매우 단순하여 공사비가 압도적으로 저렴하다.",
        "그라우트체의 크리프 변형에 의한 프리스트레스 장기 손실량이 적다."
      ]),
      answer: "시공 및 조립 과정이 인장형에 비해 매우 단순하여 공사비가 압도적으로 저렴하다.",
      explanation: "압축형 앵커는 내압판, 쉬스관, 이중 튜브 배치 등 특수 정착 장치가 다수 삽입되기 때문에 부품 구조가 복잡하여 인장형 앵커 대비 자재 비용 및 제작 공정이 더 비싸고 조립이 까다롭습니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `어스앵커 또는 소일네일링 설치 현장에서 시멘트 그라우트 주입 시 가장 널리 배합되는 물-시멘트비(W/C)와 첨가제의 공학적 거동에 대한 설명 중 옳은 것은?`,
      options: shuffleArray([
        "물-시멘트비는 통상 40~45% 내외로 유지하며 무수축 팽창제를 혼합하여 부착력을 극대화한다.",
        "물-시멘트비를 80% 이상으로 극대화하여 투수 계수를 높여야 정착 효율이 증가한다.",
        "수축성을 조장하기 위해 알루미늄 파우더를 30% 이상 초과 배합한다.",
        "모래가 90% 이상 섞인 일반 사질 시멘트 모르타르를 고압으로 주입하는 것이 원칙이다."
      ]),
      answer: "물-시멘트비는 통상 40~45% 내외로 유지하며 무수축 팽창제를 혼합하여 부착력을 극대화한다.",
      explanation: "그라우트 페이스트는 고강도 및 고품질 접착력이 생명입니다. 통상 물-시멘트비(W/C)는 40~45% 범위의 묽기로 타설하며, 경화 중 수축으로 인한 틈새나 들뜸 방지를 위해 무수축 팽창제를 첨가합니다."
    }
  ];

  return [q1, q2, ...mcQuestions];
}

// Built-in Expert-Grade PE Questions for Prandtl's Bearing Capacity Theory
function getPrandtlExpertQuestions(title, keywords) {
  const q1 = {
    type: '주관식 (개요)',
    question: `얕은 기초의 극한 지지력을 규명하는 프란틀(Prandtl) 지지력 이론의 기본 정의와 핵심 개념을 간략히 서술하시오.`,
    concept: `프란틀 지지력 이론은 기초 하부 지반을 완전 강소성체로 가정하고 전단 파괴선 슬립라인법을 적용하여 지반 점착력과 상재하중에 의한 극한 지지력 공식($q_{ult} = c N_c + q N_q$)을 정립한 고전 소성 이론입니다.`,
    formula: '',
    structure: ''
  };

  const q2 = {
    type: '주관식 (공식)',
    question: `테르자기(Terzaghi)의 극한 지지력 공식`,
    concept: `지반 점착력과 깊이 방향 상재하중, 그리고 지반 자체의 무게에 의한 영향을 모두 고려하여 연속기초의 극한 지지력을 평가하는 공학 수식입니다.`,
    formula: `$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$\n- $q_{ult}$: 극한 지지력\n- $c$: 지반 점착력\n- $q$: 기초 바닥면의 유효상재압\n- $\\gamma$: 흙의 단위중량\n- $B$: 기초의 폭 (너비)\n- $N_c, N_q, N_{\\gamma}$: 지반 지지력 계수`,
    structure: ''
  };

  const mcQuestions = [
    {
      type: '객관식 (4지선다)',
      question: `프란틀(Prandtl) 지지력 이론에서 가정하는 지반의 역학적 모델로 가장 적절한 것은?`,
      options: shuffleArray([
        "탄소성(Elasto-plastic) 모델",
        "완전 강소성(Rigid-Perfect Plastic) 모델",
        "선형 탄성(Linear Elastic) 모델",
        "점탄성(Visco-elastic) 모델"
      ]),
      answer: "완전 강소성(Rigid-Perfect Plastic) 모델",
      explanation: "프란틀 지지력 이론은 흙의 전단 파괴 시 지반의 탄성 변형을 무시하고, 지반을 압축성이 전혀 없는 완전 강소성체로 가정하여 슬립라인법을 적용했습니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `프란틀의 소성 파괴 영역(Failure Zone) 중 기초 직하부에 형성되며, 기초와 함께 일체로 하강한다고 가정하는 영역(Ⅰ지역)의 명칭은?`,
      options: shuffleArray([
        "탄성 대칭 쐐기 영역 (Elastic Wedge)",
        "방사형 전단 영역 (Radial Shear Zone)",
        "랭킨 수동 영역 (Rankine Passive Zone)",
        "대수나선 전단 영역 (Logarithmic Spiral Zone)"
      ]),
      answer: "탄성 대칭 쐐기 영역 (Elastic Wedge)",
      explanation: "기초 직하부의 Ⅰ지역은 기초 저면과의 마찰로 인해 파괴되지 않고 기초와 일체로 하향 운동하는 탄성 쐐기(Elastic Wedge) 상태로 존재합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `프란틀 지지력 이론의 극한 지지력 공식(연속기초 기준)으로 옳지 않은 것은? (단, c는 점착력, N_c, N_q는 지지력 계수, q는 기초 저면의 상재하중이다)`,
      options: shuffleArray([
        "q_ult = c·N_c + q·N_q",
        "q_ult = c·N_c + q·N_q + 0.5·γ·B·N_γ",
        "q_ult = c·cotφ·[tan^2(45°+φ/2)·e^(π·tanφ) - 1] + q·tan^2(45°+φ/2)·e^(π·tanφ)",
        "프란틀 공식은 지반 자체의 단위중량(γ)을 0으로 무시하고 유도되었다."
      ]),
      answer: "q_ult = c·N_c + q·N_q + 0.5·γ·B·N_γ",
      explanation: "프란틀은 지반 자체의 자중(γ)을 무시하였으므로, 자중 항인 0.5·γ·B·N_γ가 포함된 공식은 테르자기 공식이며 프란틀 공식이 아닙니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `프란틀 지지소성 평형 영역 중 대수나선(Logarithmic Spiral) 형상으로 파괴면이 발달하며 방사상으로 전단이 일어나는 영역(Ⅱ지역)의 명칭은?`,
      options: shuffleArray([
        "랭킨 주동 영역 (Rankine Active Zone)",
        "랭킨 수동 영역 (Rankine Passive Zone)",
        "방사형 전단 영역 (Radial Shear Zone)",
        "탄성 방사 쐐기 영역"
      ]),
      answer: "방사형 전단 영역 (Radial Shear Zone)",
      explanation: "Ⅱ지역은 기초 하부 소성유동이 측면으로 확장되는 과도기 영역으로, 전단 파괴선이 대수나선 경로를 그리며 방사형 전단(Radial Shear Zone) 거동을 보입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `테르자기(Terzaghi) 지지력 공식이 프란틀(Prandtl) 이론의 한계를 극복하기 위해 추가한 핵심 공학적 인자는 무엇인가?`,
      options: shuffleArray([
        "지반 자체의 단위중량(γ)에 의한 자중 효과",
        "기초 저면 상재하중(q)에 의한 상재 하중 효과",
        "흙의 점착력(c)에 의한 전단 저항 효과",
        "기초 저면과 흙 사이의 완전 활성 조건"
      ]),
      answer: "지반 자체의 단위중량(γ)에 의한 자중 효과",
      explanation: "프란틀 이론은 지반 자중(γ)을 무시하였으나, Terzaghi는 지반 자중에 의한 지지력 영향 항(0.5·γ·B·N_γ)을 제안하고 겹침의 원리(Superposition Principle)를 통해 이를 공식화했습니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `사질토 지반의 극한 지지력 시험 시, 모래가 조밀한 경우와 느슨한 경우의 전단 파괴 모드에 대한 설명으로 올바르지 않은 것은?`,
      options: shuffleArray([
        "조밀한 모래 지반에서는 급격하고 명확한 전면 전단 파괴(General Shear Failure)가 주로 발생한다.",
        "느슨한 모래나 연약한 점성토에서는 지중 파괴면이 불완전하게 소멸하는 국부 전단 파괴(Local Shear Failure)가 발생하기 쉽다.",
        "매우 느슨한 모래에서는 기초가 뚫고 들어가는 펀칭 전단 파괴(Punching Shear Failure)가 지배적이다.",
        "지반이 느슨할 때 국부 전단 파괴가 우려되면 점착력(c)과 마찰각(φ)을 각각 2배로 증대시켜 설계해야 안정적이다."
      ]),
      answer: "지반이 느슨할 때 국부 전단 파괴가 우려되면 점착력(c)과 마찰각(φ)을 각각 2배로 증대시켜 설계해야 안정적이다.",
      explanation: "국부 전단 파괴가 우려되는 느슨한 지반 설계 시에는 오히려 안전율 측면에서 점착력(c)과 마찰각(tanφ)의 크기를 2/3 수준으로 감쇄(c' = 2/3 c, tanφ' = 2/3 tanφ) 시키는 감쇄법을 적용해야 합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `마이어호프(Meyerhof) 지지력 이론이 기존 테르자기(Terzaghi) 지지력 이론 대비 개선한 핵심 사항이 아닌 것은?`,
      options: shuffleArray([
        "기초의 근입 깊이(D_f) 증가에 따른 측면 전단 저항력(기초 배면 흙의 강도)을 반영하였다.",
        "기초 상부에 작용하는 하중의 경사 계수(Inclination Factors)를 공식화하였다.",
        "지반 자중(γ)의 존재를 배제하고 기초 폭(B)의 중요성을 완전히 제외하였다.",
        "기초의 3차원 형상 계수(Shape Factors) 및 깊이 계수를 체계적으로 정립하였다."
      ]),
      answer: "지반 자중(γ)의 존재를 배제하고 기초 폭(B)의 중요성을 완전히 제외하였다.",
      explanation: "Meyerhof는 지반 자중(γ) 및 기초 폭(B)을 중요 인자로 다루었으며, Terzaghi 공식에 형상 계수, 깊이 계수, 하중 경사 계수를 곱하여 확장 설계 공식을 제안했습니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `기초 지반의 극한 지지력(q_ult)을 허용 지지력(q_allow)으로 환산하기 위해 지반 공학에서 연속기초에 적용하는 보편적인 안전율(F.S) 설계 수치 기준으로 올바른 것은?`,
      options: shuffleArray([
        "F.S = 1.0",
        "F.S >= 3.0",
        "F.S = 0.5 ~ 0.8",
        "F.S = 1.2 ~ 1.5"
      ]),
      answer: "F.S >= 3.0",
      explanation: "지반의 불균질성 및 지지력 거동의 불확실성을 고려하여, 얕은 기초의 지지력 설계 시 통상 3.0 이상의 충분한 안전율을 적용하여 허용 지지력을 결정합니다."
    }
  ];

  return [q1, q2, ...mcQuestions];
}

// Built-in Expert-Grade PE Questions for Soft Ground Sand Mat Thickness Calculation
function getSandMatExpertQuestions(title, keywords) {
  const q1 = {
    type: '주관식 (개요)',
    question: `연약지반 점성토 상부에 부설되는 샌드매트(Sand Mat)의 주요 공학적 역할과 기능에 대하여 간략히 서술하시오.`,
    concept: `샌드매트는 연약지반 표층에 부설하여 배수 경로(여과 및 상부 배수층)를 형성함으로써 점토의 압밀을 촉진하고, 장비 주행성(Trafficability)을 확보하며, 상부 성토 하중을 균등하게 분산시키는 표층처리 인프라입니다.`,
    formula: '',
    structure: ''
  };

  const q2 = {
    type: '주관식 (공식)',
    question: `샌드매트 설계 시 장비 주행성 확보를 위한 최소 소요 두께(H) 산정 공식`,
    concept: `건설장비의 집중 하중이 연약지반에 직접 전달되어 국부 전단파괴가 일어나는 것을 방지하기 위해 필요한 샌드매트의 소요 두께를 하중분산각을 응용해 도출하는 공식입니다.`,
    formula: `$H = \\frac{q - q_a}{2 \\gamma \\tan\\theta}$\n- $H$: Sand Mat 최소 소요 두께\n- $q$: 시공장비의 접지압 (하중)\n- $q_a$: 연약지반의 허용지지력\n- $\\gamma$: Sand Mat 모래의 단위중량\n- $\\theta$: 하중 분산각 (일반적으로 $30^\\circ \\sim 45^\\circ$)`,
    structure: ''
  };

  const mcQuestions = [
    {
      type: '객관식 (4지선다)',
      question: `연약지반에 부설하는 샌드매트(Sand Mat)의 주된 공학적 배수 기능과 거리가 먼 진술은 무엇인가?`,
      options: shuffleArray([
        "압밀 시 배출되는 물을 측면으로 원활히 배수하기 위한 수평배수층 역할을 한다.",
        "점토 지반 고유의 물리적 압밀계수(Cv) 자체를 획기적으로 증가시킨다.",
        "상부 양면 배수(Double Drainage) 조건을 형성하여 압밀 배수 거리를 절반으로 단축한다.",
        "샌드드레인이나 팩드레인 등 연직배수재와 연결되어 과잉간극수를 외부로 배출한다."
      ]),
      answer: "점토 지반 고유의 물리적 압밀계수(Cv) 자체를 획기적으로 증가시킨다.",
      explanation: "점토의 압밀계수(Cv)는 지반 고유의 투수성과 압축성 지표이므로 샌드매트를 깐다고 변하지 않습니다. 샌드매트는 단지 배수 거리(d)를 단축시켜 압밀 시간을 단축시킬 뿐입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `샌드매트에 사용되는 모래의 적합한 토질 공학적 품질 및 입도 조건에 대한 설명으로 올바르지 않은 것은?`,
      options: shuffleArray([
        "투수성이 우수하고 배수 기능이 탁월한 조립토이어야 한다.",
        "배수 기능 저하를 막기 위해 세립분(특히 점토분) 함유량이 3~5% 이하로 매우 극소량이어야 한다.",
        "투수계수(k)는 최소한 배수 효과가 보장되는 1.0 × 10^-3 cm/s 이상이 권장된다.",
        "실트나 진흙 지반의 장기 압밀을 방지하기 위해 가급적 실트분을 30% 이상 넉넉히 혼합 배합해야 한다."
      ]),
      answer: "실트나 진흙 지반의 장기 압밀을 방지하기 위해 가급적 실트분을 30% 이상 넉넉히 혼합 배합해야 한다.",
      explanation: "모래매트 내 세립분(실트/점토)이 많아지면 틈새가 막혀 투수계수가 급격히 저하되어 수평 배수층으로서의 역할을 상실하므로 세립분은 엄격히 차단되어야 합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `초연약지반 상부에 무거운 건설장비가 올라설 때, 장비 주행 가능 여부를 나타내는 지표인 Cone 지수(qc 또는 Ic)와 트래피커빌리티(Trafficability)에 대한 설명으로 옳은 것은?`,
      options: shuffleArray([
        "Cone 지수가 클수록 연약지반의 강도가 강하므로 장비 주행성이 양호하다.",
        "Cone 지수가 작을수록 모래 매트의 두께를 얇게 설계해도 궤도장비 주행이 가능하다.",
        "트래피커빌리티는 장비의 접지압과 무관하며 오직 모래의 색상에 의해서만 결정된다.",
        "보통 불도저와 같은 초경량 습지 장비는 Cone 지수가 1.0 이하인 완전 뻘지반에서도 무조건 주행한다."
      ]),
      answer: "Cone 지수가 클수록 연약지반의 강도가 강하므로 장비 주행성이 양호하다.",
      explanation: "Cone 지수는 흙의 전단 강도와 연관된 저항 지표로, 지수 값이 높을수록 지반 지지력이 크기 때문에 건설장비의 진입 및 주행(Trafficability)이 훨씬 원활해집니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `장비 하중 분산 효과를 고려하여 Sand Mat 두께를 산정할 때, 모래의 내부마찰각(φ)이 커짐에 따른 공학적 설계 변화로 옳은 것은?`,
      options: shuffleArray([
        "하중 분산각(θ)이 작아지므로 필요한 소요 두께(H)가 증가한다.",
        "하중 분산각(θ)이 커져 지중 응력이 넓게 분산되므로 필요한 소요 두께(H)는 감소한다.",
        "단위중량이 수중중량으로 자동 환산되어 소요 두께는 하중과 상관없이 0이 된다.",
        "모래의 강도가 커져 연약지반 표층의 고유 점착력(c)을 물리적으로 무한대 증가시킨다."
      ]),
      answer: "하중 분산각(θ)이 커져 지중 응력이 넓게 분산되므로 필요한 소요 두께(H)는 감소한다.",
      explanation: "모래의 마찰각(φ)이 크고 다짐이 양호할수록 집중 하중을 양옆으로 널리 퍼뜨리는 분산각(θ)이 증가하여 하부 연약지반에 도달하는 응력이 줄어들므로, 샌드매트의 소요 두께(H)를 줄여 경제적 설계가 가능합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `샌드매트 포설 후 장기적으로 지하수위가 모래매트 상부까지 급격히 상승할 때 지반 엔지니어가 예상해야 하는 역학적 리스크로 옳은 것은?`,
      options: shuffleArray([
        "모래 입자 자체의 비중(Gs)이 수중에서 약 10배 이상으로 크게 증가한다.",
        "지하수위 상승으로 부력이 발생하여 모래의 유효단위중량이 감소하고 모래층 지지력이 저하된다.",
        "간극수압 소멸 속도가 무한대로 빨라져 점토의 1차 압밀 완료 시간이 0초로 단축된다.",
        "모래의 내부마찰각이 강제로 90도까지 증폭되어 응력 분산 효과가 극대화된다."
      ]),
      answer: "지하수위 상승으로 부력이 발생하여 모래의 유효단위중량이 감소하고 모래층 지지력이 저하된다.",
      explanation: "지하수위가 포설된 샌드매트 내부로 침투하여 포화 상태가 되면, 흙의 단위중량이 유효단위중량(습윤중량 - 물의중량)으로 약 절반 가까이 감소하므로 연약지반의 상부 지반 지지 압력이 약해집니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `Sand Mat 포설 후 상부 성토를 시행하여 하부 점토층 압밀 배수를 촉진할 때, 점토 상하부가 모래매트와 암반층으로 각각 둘러싸인 양면배수(Double Drainage) 조건에서 최대 배수거리(d) 산정 수식으로 옳은 것은? (단, 점토층의 전체 두께는 Hc 이다)`,
      options: shuffleArray([
        "d = Hc / 2",
        "d = Hc",
        "d = 2 * Hc",
        "d = Hc / 4"
      ]),
      answer: "d = Hc / 2",
      explanation: "양면배수 조건에서는 점토 중앙에서 가장 멀리 있는 물이 상부 또는 하부 배수층(샌드매트 등)으로 도달하는 최장 거리가 전체 두께의 절반이 되므로 d = Hc / 2 가 됩니다. 일면배수 시에는 d = Hc 입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `표층 지반의 Cone 지수가 2 이하인 초연약 뻘 지반에서 장비 진입 시 샌드매트 모래의 국부 전단파괴 및 침하를 방지하기 위해 샌드매트 하부에 병행 부설하는 공학 재료는?`,
      options: shuffleArray([
        "벤토나이트 차수 매트 (GCL)",
        "고강도 토목섬유 매트 (Geotextile)",
        "콘크리트 라이닝 패널",
        "아스팔트 코팅재"
      ]),
      answer: "고강도 토목섬유 매트 (Geotextile)",
      explanation: "초연약지반 표층 처리 시에는 샌드매트 포설 전에 고강도 토목섬유(P.P 매트 등)를 먼저 포설하여 장비 하중을 인장력으로 버텨주고 모래가 흙 속으로 함몰하는 것을 막는 격리 및 보강(Reinforcement) 효과를 도모합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `샌드매트 내부에 모래 입도 분량 등의 원인으로 배수가 막혀 과잉간극수가 외부로 원활히 배출되지 못할 때 발생하는 역학적 유해 현상으로 옳은 것은?`,
      options: shuffleArray([
        "모래층 내 과잉간극수압 증가로 유효응력이 저하되어 시공 장비 지지력이 상실되고 압밀이 정체된다.",
        "점토의 마찰각이 음수값으로 급락하여 사면이 스스로 뒤집히게 된다.",
        "흙 내부의 공극률이 강제로 0%가 되어 지반이 순식간에 암반으로 경화된다.",
        "모래의 전단강도가 무한대로 상승하여 어떠한 장비든 침하 없이 주행한다."
      ]),
      answer: "모래층 내 과잉간극수압 증가로 유효응력이 저하되어 시공 장비 지지력이 상실되고 압밀이 정체된다.",
      explanation: "과잉간극수가 배출되지 못하고 정체되면 수압(u)이 해소되지 않고 상부 모래층의 유효응력(σ' = σ - u)을 깎아먹게 되어, 샌드매트 자체의 강도 저하 및 전체 연약지반 복합 체계의 붕괴나 주행 불능 상태를 유발합니다."
    }
  ];

  return [q1, q2, ...mcQuestions];
}

// Built-in Expert-Grade PE Questions for Rock Slopes Stereographic Projection
function getStereonetExpertQuestions(title, keywords) {
  const q1 = {
    type: '주관식 (개요)',
    question: `암반 불연속면 해석 및 비탈면 설계 분야에서 평사투영법(Stereographic Projection)의 주요 공학적 정의와 핵심 목적을 간략히 서술하시오.`,
    concept: `평사투영법은 3차원 공간상의 불연속면(면)이나 교선(선)의 기하학적 방향성과 상대적 관계를 2차원 평면(투영망) 상에 투영하여, 암반 사면의 잠재적 파괴 모드(평면, 쐐기, 전도 파괴)를 신속하게 통계적·기하학적으로 해석하기 위한 기법입니다.`,
    formula: '',
    structure: ''
  };

  const q2 = {
    type: '주관식 (공식)',
    question: `평사투영망 작도 시 극점(Pole) 변환 투영 공식(r)`,
    concept: `구의 표면과 접하는 교차 경로를 구의 최북단 또는 최남단에서 정사투영하여 2차원 평면의 투영 반경으로 좌표 변환하는 작도 공식입니다.`,
    formula: `$r = R \\tan(45^\\circ - \\frac{\\alpha}{2})$\n- $r$: 평사투영망 중심으로부터 극점(Pole)까지의 투영 거리 (반경)\n- $R$: 평사투영망(투영구)의 반지름\n- $\\alpha$: 불연속면의 경사각 (Dip)`,
    structure: ''
  };

  const mcQuestions = [
    {
      type: '객관식 (4지선다)',
      question: `평사투영 시 불연속면(Plane)을 가상의 투영구(Sphere) 하반구(Lower Hemisphere)와 교차시켰을 때 생기는 공간상의 호(Arc)를 평면에 투영한 형상의 명칭은?`,
      options: shuffleArray([
        "대원 (Great Circle)",
        "극점 (Pole)",
        "소원 (Small Circle)",
        "동수두선 (Potential Line)"
      ]),
      answer: "대원 (Great Circle)",
      explanation: "3차원 공간상의 면(Plane)은 투영 하반구 표면과 만나 대원(Great Circle)이라는 호를 형성하고, 이를 평사투영망 평면에 투영하면 반원 아치 모양의 투영선으로 그려집니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `평사투영망(Stereonet) 상에서 불연속면의 경사각(Dip)이 90도인 완전 수직 불연속면을 투영한 대원(Great Circle)의 기하학적 거동 형상으로 옳은 것은?`,
      options: shuffleArray([
        "평사투영망 정중앙(Center)을 지나는 곧은 직선",
        "평사투영망 가장 바깥 테두리를 그리는 원 (외주원)",
        "투영망의 남북극점을 잇는 아주 불완전한 소원들",
        "수평면을 뜻하는 투영망 중심의 단일 점 (Point)"
      ]),
      answer: "평사투영망 정중앙(Center)을 지나는 곧은 직선",
      explanation: "경사가 90도(수직)인 면은 투영구 하반구를 좌우 대칭으로 똑같이 절단하므로 투영 중심을 관통하는 지름 형태의 완벽한 직선으로 표현됩니다. 경사가 0도(수평)인 면은 가장 바깥 테두리인 외주원(Outer Circle)이 됩니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `암반 비탈면의 평면파괴(Planar Failure)가 발생할 가능성이 있는 한계 평형 기하학적 조건식으로 옳은 것은? (단, α_p는 불연속면 경사, α_f는 사면 경사, φ는 불연속면 내부마찰각이다)`,
      options: shuffleArray([
        "φ < α_p < α_f",
        "α_f < α_p < φ",
        "α_p < φ < α_f",
        "α_p > α_f > φ"
      ]),
      answer: "φ < α_p < α_f",
      explanation: "평면파괴는 ① 불연속면 경사가 사면 경사보다 완만해야 사면 전면으로 노출되고(α_p < α_f), ② 불연속면 경사가 마찰각보다 급해야 마찰 저항을 이겨내고 미끄러지므로(α_p > φ) 'φ < α_p < α_f' 조건이 만족되어야 합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `평사투영망 상에서 암반 비탈면의 전단 파괴 안정성을 판단하기 위해 마찰각(φ)을 원의 반경으로 작도하는 마찰 원(Friction Cone)의 중심점 기준으로 옳은 것은?`,
      options: shuffleArray([
        "평사투영망의 정중앙 센터 포인트 (Center Point)",
        "남북극점 중 최남단 포인트",
        "사면 경사각의 외주원 교차점",
        "불연속면 극점(Pole)의 최빈 밀도 분포 영역"
      ]),
      answer: "평사투영망의 정중앙 센터 포인트 (Center Point)",
      explanation: "마찰각(φ)은 구의 중심에서 사방으로 균일한 전단 저항 한계 원뿔을 형성하므로, 평사투영 상에서는 투영망 정중앙(Center)을 중심으로 반경 (90°-φ)에 해당하는 마찰 원(Friction Cone)을 작도하여 안정 영역을 구분합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `암반 사면의 쐐기파괴(Wedge Failure)를 평사투영으로 해석할 때, 두 불연속면 대원의 교차점인 교선(Intersection Line)의 투영점과 사면 대원 및 마찰 원의 상대적 위치에 따른 기하학적 파괴 조건으로 옳은 것은?`,
      options: shuffleArray([
        "교선의 투영점이 마찰 원의 바깥쪽(Friction Cone 외곽)이면서 사면 대원과 마찰 원 영역 사이에 위치할 때",
        "교선의 투영점이 마찰 원의 안쪽(Friction Cone 내부)에 위치할 때",
        "교선 투영점이 외주원 바깥으로 탈출하여 아예 사라졌을 때",
        "교선의 경사가 사면 경사보다 크고 내부마찰각보다 무한히 작을 때"
      ]),
      answer: "교선의 투영점이 마찰 원의 바깥쪽(Friction Cone 외곽)이면서 사면 대원과 마찰 원 영역 사이에 위치할 때",
      explanation: "쐐기파괴는 두 불연속면의 교선 방향으로 미끄러집니다. 따라서 교선의 경사각이 사면 경사보다는 완만하여 사면 밖으로 노출(사면 대원과 마찰원 사이)되고, 내부마찰각 원뿔 밖(마찰원 외곽)에 위치하여 마찰 저항을 초과할 때 파괴가 유발됩니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `평사투영법에서 불연속면의 방향을 기재할 때 주향이 N90W 이고 경사가 30S 인 완만한 남향 불연속면의 극점(Pole)은 평사투영망 상에서 대략 어느 방향(방위)에 찍히게 되는가?`,
      options: shuffleArray([
        "북쪽(North) 부근 영역",
        "남쪽(South) 부근 영역",
        "동쪽(East) 부근 영역",
        "투영망 정중앙 정밀 센터점"
      ]),
      answer: "북쪽(North) 부근 영역",
      explanation: "극점(Pole)은 면에 수직인 지향선입니다. 경사가 남쪽(S)으로 30도 누워 있는 면은 그 수직 법선인 극점이 정반대편인 북쪽(N) 방향으로 중심에서 외곽 방향으로 30도 떨어진 지점에 투영됩니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `평사투영망 종류 중, 기하학적 각도(Angle) 관계가 완전히 보존되어 현장 불연속면의 교선 각도 등을 측정하는 데는 탁월하나 투영 면적의 왜곡이 있어 극점 통계 분석에는 적절하지 않은 투영망의 명칭은?`,
      options: shuffleArray([
        "울프 망 (Wulff Net / 등각 투영망)",
        "슈미트 망 (Schmidt Net / 등면적 투영망)",
        "카르테시안 망 (Cartesian Net)",
        "모르 망 (Mohr Net)"
      ]),
      answer: "울프 망 (Wulff Net / 등각 투영망)",
      explanation: "울프 망(Wulff Net)은 각도가 왜곡 없이 보존되는 등각 투영망으로 기하 분석에 유용하나 외곽으로 갈수록 면적이 과대 투영되는 단점이 있습니다. 통계적 극점 밀도 분포 분석에는 면적이 보존되는 슈미트 망(Schmidt Net)이 사용됩니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `불연속면 경사가 사면 경사와 반대 방향으로 급하게 발달할 때 발생하는 전도파괴(Toppling Failure)의 발생 한계 평형 기하학적 관계식으로 옳은 것은? (단, α_p는 불연속면 경사, α_f는 사면 경사, φ는 내부마찰각이다)`,
      options: shuffleArray([
        "(90° - α_p) + φ < α_f",
        "(90° - α_p) + φ > α_f",
        "α_p + φ < α_f",
        "α_p - φ > α_f"
      ]),
      answer: "(90° - α_p) + φ < α_f",
      explanation: "전도파괴(Toppling)가 일어나기 위해서는 사면 경사가 충분히 급해야 하고, 암반 블록이 앞으로 넘어질 수 있는 기하학적 미끄러짐 마찰 조건인 '(90° - α_p) + φ < α_f' 가 반드시 만족되어야 전도가 가능합니다."
    }
  ];

  return [q1, q2, ...mcQuestions];
}

// Built-in Expert-Grade PE Questions for Rock Mass Q-System Classification
function getQSystemExpertQuestions(title, keywords) {
  const q1 = {
    type: '주관식 (개요)',
    question: `Barton 등이 제안한 암반 평가 방법인 Q 분류법(Q-System)의 기본 정의와 이를 구성하는 세 가지 주요 공학적 평가 요소의 물리적 의미를 간략히 서술하시오.`,
    concept: `Q 분류법은 RQD를 포함한 6가지 핵심 변수를 조합하여 수치화된 Q 지수($0.001 \\sim 1000$)를 도출하는 기법으로, 지반의 '블록 크기', '블록 간 전단강도', '능동적인 지중 응력 상태'의 세 가지 비율 항목을 정량적으로 대표합니다.`,
    formula: '',
    structure: ''
  };

  const q2 = {
    type: '주관식 (공식)',
    question: `Q 분류법의 최종 지표인 Q 지수(Q)를 도출하는 Barton의 Q 산정 공식을 쓰고, 이를 구성하는 6가지 주요 매개변수 기호의 명칭과 역학적 지표 의미를 서술하시오.`,
    concept: `암질지수와 절리군의 개수, 거칠기 및 충전물 상태, 지하수 영향과 응력 감소 현상을 모조리 변수화하여 곱하고 나누는 지반 등급 산출 수식입니다.`,
    formula: `$Q = \\frac{RQD}{J_n} \\cdot \\frac{J_r}{J_a} \\cdot \\frac{J_w}{SRF}$\n- $Q$: 암반 품질 Q 지수\n- $RQD$: 암질 지수 (Rock Quality Designation)\n- $J_n$: 절리군 수 계수 (Joint Set Number)\n- $J_r$: 절리 거칠기 계수 (Joint Roughness Number)\n- $J_a$: 절리 변질/충전 계수 (Joint Alteration Number)\n- $J_w$: 절리 지하수 감쇄 계수 (Joint Water Reduction Factor)\n- $SRF$: 응력 저감 계수 (Stress Reduction Factor)`,
    structure: ''
  };

  const mcQuestions = [
    {
      type: '객관식 (4지선다)',
      question: `Barton의 Q 공식 $Q = (RQD / J_n) \\times (J_r / J_a) \\times (J_w / SRF)$ 에서 첫 번째 분수 항인 RQD와 Jn의 조합비(RQD / Jn)가 정량적으로 대변하는 암반의 공학적 구조 특성은?`,
      options: shuffleArray([
        "절리면의 기하학적 전단 강도",
        "암반의 전체적인 블록 크기 (Block Size)",
        "지반 내부에 작용하는 능동 응력 상태",
        "지하수 유입에 따른 유효응력 감쇄량"
      ]),
      answer: "암반의 전체적인 블록 크기 (Block Size)",
      explanation: "RQD(암질지수)와 Jn(절리군 수)의 조합비(RQD/Jn)는 절리에 의해 분할되는 암반의 대략적인 블록 크기(Block Size)에 상응하는 구조적 상태를 정량적으로 지시합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `Q 분류 매개변수 중 절리군 수(Joint Set Number)를 뜻하는 Jn 지수의 설계 평치 기준으로 올바르지 않은 것은?`,
      options: shuffleArray([
        "절리가 없는 무균열 신선 암반인 경우 Jn의 값은 0.5~1.0 수준으로 매우 낮게 책정된다.",
        "절리군이 많아질수록(예: 3군 이상 또는 흙처럼 파쇄) Jn의 값은 9.0~15.0 이상으로 매우 커진다.",
        "Jn이 분모에 위치하므로, 절리군이 많아져 Jn이 커질수록 Q 지수 값은 작아져 암질이 극도로 악화된다.",
        "절리군 수가 증가하면 지반의 아칭 효과가 극대화되므로 Jn 값이 커질수록 Q 값도 비례하여 증가한다."
      ]),
      answer: "절리군 수가 증가하면 지반의 아칭 효과가 극대화되므로 Jn 값이 커질수록 Q 값도 비례하여 증가한다.",
      explanation: "Jn은 절리군의 갯수로, 절리군이 많을수록 지반이 잘게 쪼개져 불안정하므로 분모인 Jn 값이 커져 전체 Q 지수(암질)를 크게 깎아먹게 됩니다. 따라서 비례하여 증가한다는 잘못된 설명입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `Q 공식의 두 번째 분수 항인 절리 거칠기 계수(Jr)와 절리 변질/충전 계수(Ja)의 조합비(Jr / Ja)가 의미하는 암반의 공학적 거동 물리량은 무엇인가?`,
      options: shuffleArray([
        "절리 블록 간의 기하학적 전단 강도 (Shear Strength)",
        "지반의 유효 점착력 자체의 급격한 소실 비율",
        "터널 굴착 시 발생하는 암석 파열(Rock Burst) 응력 비",
        "지하수 투수에 따른 수압 감쇄율"
      ]),
      answer: "절리 블록 간의 기하학적 전단 강도 (Shear Strength)",
      explanation: "Jr(거칠기)과 Ja(변질 및 점토 충전)의 비인 Jr/Ja 는 불연속면(절리)끼리 맞물리는 미찰 저항 및 점토 충전물 상태를 정량화한 것이며, 이는 절리면의 전단 강도(Shear Strength)를 나타내는 지표입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `Q 분류 매개변수 중 응력 저감 계수인 SRF(Stress Reduction Factor)가 매우 높게 산정되어 Q 지수를 크게 저하시키는 공학적 파괴 상황이 아닌 것은?`,
      options: shuffleArray([
        "깊은 심도 터널 굴착 시 고지압으로 인한 암석 폭발성 파열(Rock Burst)이 우려되는 경우",
        "초연약대 또는 단층 파쇄대가 발달하여 소성 변형 및 스퀴징(Squeezing, 압쇄) 지반압이 급증하는 지반",
        "지반 내부에 작용하는 전응력과 간극수압의 차이가 완전히 0이 되어 지반이 순식간에 다져진 암반으로 경화되는 현상",
        "취성 암반에서 고응력 집중으로 인해 벽면 박리 파괴(Spalling)가 발달하는 공학적 상황"
      ]),
      answer: "지반 내부에 작용하는 전응력과 간극수압의 차이가 완전히 0이 되어 지반이 순식간에 다져진 암반으로 경화되는 현상",
      explanation: "SRF는 응력 집중, 고지압 취성 파괴(락버스트), 점토 충전 단층대의 취약성 등으로 인해 작용하는 응력 저하 인자이며, 유효응력이 0이 되어 압축 경화된다는 진술은 SRF가 높게 유도되는 상황과 무관합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `Barton의 암질 Q 지수 스케일 분류 중 Q 지수가 0.01 이하(Q = 0.001 ~ 0.01)로 아주 낮게 도출된 지반의 암반 품질 등급 명칭으로 가장 적절한 것은?`,
      options: shuffleArray([
        "매우 양호 (Very Good)",
        "보통 (Fair)",
        "극히 불량 (Exceptionally Poor)",
        "극히 양호 (Exceptionally Good)"
      ]),
      answer: "극히 불량 (Exceptionally Poor)",
      explanation: "Q 지수는 로그 스케일 형태로 0.001(극도로 불량)부터 1000(완벽한 신선암)까지 분류되며, Q < 0.01 이하의 범위는 지보가 대대적으로 필요한 '극히 불량(Exceptionally Poor)' 또는 '극도로 불량(Extremely Poor)' 등급입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `Q 분류 시스템을 적용하여 터널의 무지보 자립 시간(Stand-up Time) 및 최적 지보압을 도출할 때, 터널의 중요도와 내용연수 설계 안전율을 고려하여 터널 지간 폭(D)을 나누는 공학적 환산 인자의 명칭은?`,
      options: shuffleArray([
        "굴착 지보비 (ESR, Excavation Support Ratio)",
        "간극수압비 (Ru)",
        "과압밀비 (OCR)",
        "암질지수비 (RQD_Ratio)"
      ]),
      answer: "굴착 지보비 (ESR, Excavation Support Ratio)",
      explanation: "터널 설계 시 등가 지간폭(Equivalent Span) = 터널 지간폭(D) / ESR 공식을 적용하여 지보 사양을 산정하며, 중요 시설물(철도 터널 등)은 ESR 값이 낮게 책정되어 안전율이 엄격히 제어됩니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `시추 코어(Core) 시편 분석 시 획득하는 RQD(Rock Quality Designation) 지수의 토질 및 기초 공학적 물리 정의로 가장 옳은 것은?`,
      options: shuffleArray([
        "회수된 모든 암석 코어 조각 중 길이가 5cm 이상인 신선한 암석 부재의 누적 백분율",
        "총 시추 길이 중, 균열이 없는 원통형 신선 코어 편 중 '10cm 이상' 되는 코어 조각들의 길이 합을 백분율로 환산한 값",
        "시추 중에 부서져서 완전히 가루(Slime)가 된 세립질 점토 코어의 비율",
        "시추 장비의 비트 회전 속도에 비례하는 지반 전단 변형각"
      ]),
      answer: "총 시추 길이 중, 균열이 없는 원통형 신선 코어 편 중 '10cm 이상' 되는 코어 조각들의 길이 합을 백분율로 환산한 값",
      explanation: "RQD는 암석 코어 중 신선하고 단단한 '10cm 이상' 조각들의 누적 길이를 총 시추 길이로 나눈 백분율(%)로, 암반의 절리 균열 밀도를 대변하는 핵심 기초 지표입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `지반 엔지니어링 실무에서 널리 활용되는 Bieniawski의 RMR 분류 지수와 Barton의 Q 분류 지수 간의 대표적인 경험적 변환 공식으로 가장 널리 공인된 것은?`,
      options: shuffleArray([
        "RMR = 9 ln Q + 44",
        "RMR = Q + 100",
        "RMR = ln Q - 10",
        "RMR = 0.5 * log Q"
      ]),
      answer: "RMR = 9 ln Q + 44",
      explanation: "경험적으로 RMR과 Q 지수 사이에는 RMR = 9 × ln Q + 44 의 로그 비례 관계식이 성립함이 입증되어 있으며, 두 암반 평가 방법의 등급 비교 환산에 상호 유용하게 활용됩니다."
    }
  ];

  return [q1, q2, ...mcQuestions];
}

// Built-in Expert-Grade PE Questions for Rock Bolt Pull-out Test
function getRockboltPulloutTestExpertQuestions(title, keywords) {
  const q1 = {
    type: '주관식 (개요)',
    question: `터널 지보재로 시공된 락볼트(Rock Bolt)의 인발시험(Pull-out Test)의 공학적 정의와 시험을 수행하는 주된 목적에 대하여 간략히 서술하시오.`,
    concept: `락볼트 인발시험은 시공된 락볼트에 축방향 인장 하중을 가하여 볼트와 그라우트재, 그리고 암반 간의 부착력 및 최대 인발 저항력(정착 성능)을 정량적으로 평가하고 시공 상태를 검증하기 위한 품질 시험입니다.`,
    formula: '',
    structure: ''
  };

  const q2 = {
    type: '주관식 (공식)',
    question: `락볼트 인발시험 설계 시 적용하는 최대 인발 저항력(P)과 유효 정착 길이(L) 및 허용 부착 전단 강도(\\tau_{allow})의 관계 공식`,
    concept: `시추공 벽면과 그라우트재 사이의 접촉 면적과 허용 전단응력을 곱하여 전체 볼트 정착부의 극한 인발 한계 하중을 산정하는 공식입니다.`,
    formula: `$P = \\pi \\cdot d \\cdot L \\cdot \\tau_{allow}$\n- $P$: 락볼트 최대 인발 저항력 (허용 인발 하중)\n- $d$: 시추 구멍(또는 볼트)의 직경\n- $L$: 락볼트의 유효 정착 길이 (Bond Length)\n- $\\tau_{allow}$: 그라우트와 주변 암반 간의 허용 부착 전단 강도`,
    structure: ''
  };

  const mcQuestions = [
    {
      type: '객관식 (4지선다)',
      question: `락볼트 인발시험을 통해 직접적으로 측정하고 판정하는 락볼트 지보 시스템의 가장 핵심적인 공학적 성능 인자는 무엇인가?`,
      options: shuffleArray([
        "락볼트의 최대 인발 정착 하중 (Pull-out Capacity)",
        "락볼트 철근 자체의 열팽창 계수",
        "터널 내벽의 2차 콘크리트 라이닝 휨 압축 강도",
        "지하수 유입에 따른 락볼트 부식 전기 화학적 속도"
      ]),
      answer: "락볼트의 최대 인발 정착 하중 (Pull-out Capacity)",
      explanation: "락볼트 인발시험은 락볼트가 지반 내에 고정되어 버틸 수 있는 최대 하중인 '인발 정착력(Pull-out Capacity)'을 직접 인장력을 주어 확인하는 품질 보증 시험입니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `국내 터널 시공 기준에 따라 현장 락볼트의 품질 관리를 위해 실시하는 인발시험의 표준 검사 빈도 기준으로 가장 적절한 것은?`,
      options: shuffleArray([
        "시공된 전체 락볼트 총 개수의 최소 1% 이상 (또는 설계서 기준 개수 및 50~100개당 1회 이상)",
        "터널 굴착 거리 10km 마다 단 1개씩 임의 샘플 검사",
        "시공된 모든 락볼트를 전부 인발하여 뽑아낸 후 재시공 (100% 전수 파괴 검사)",
        "현장 대리인의 육안 관찰로 대체하며 실제 시험은 일절 금지한다."
      ]),
      answer: "시공된 전체 락볼트 총 개수의 최소 1% 이상 (또는 설계서 기준 개수 및 50~100개당 1회 이상)",
      explanation: "일반적으로 현장 락볼트 인발시험은 시공된 락볼트 품질 신뢰성 검증을 위해 전체 수량의 최소 1% 이상(또는 일정 개수 단위당 1회 이상)을 무작위 추출하여 실시하는 것을 표준으로 합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `현장 락볼트 인발시험 결과, 볼트가 급격히 빠져나오는 대표적인 정착 파괴 형태(Failure Mode) 중 가장 빈번하게 발견되는 역학적 파괴 취약부는 어디인가?`,
      options: shuffleArray([
        "그라우트재와 주변 암반 경계면 사이의 전단 부착 파괴 (Bond failure at grout-rock interface)",
        "락볼트용 철근 강재 내부의 자체 취성 인장 인절 파괴",
        "인발 잭(Jack) 기계 장비 프레임의 유압 실린더 압착 파손",
        "숏크리트와 강지보재 사이의 박리 파괴"
      ]),
      answer: "그라우트재와 주변 암반 경계면 사이의 전단 부착 파괴 (Bond failure at grout-rock interface)",
      explanation: "대부분의 락볼트 인발 파괴는 그라우트재와 암반 구멍 벽면 사이의 전단 부착력(Bond Strength) 부족으로 인해 경계면이 미끄러지며 발생하며, 강재 자체가 끊어지는 경우는 극히 드뭅니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `선단 정착용 쐐기 장치를 시추공 깊은 곳에 대고 기계적으로 즉시 물려 지보하는 선단정착형(Mechanical Anchor) 락볼트 인발 시 전면접착형(Resin/Cement) 대비 거동 특성으로 옳은 것은?`,
      options: shuffleArray([
        "인발 하중 재하 시 즉각적인 초기 슬립(Slip, 미끄러짐) 변위가 다소 발생하며, 장기 크리프 변형에 취약하다.",
        "인발 즉시 암반과 하나로 용융되어 어떠한 변위도 발생하지 않는다.",
        "그라우트가 양생될 때까지 최소 28일간은 인발시험을 절대로 실시해서는 안 된다.",
        "선단 정착 장치에 부력이 작용하여 볼트가 터널 내부로 스스로 밀려 들어간다."
      ]),
      answer: "인발 하중 재하 시 즉각적인 초기 슬립(Slip, 미끄러짐) 변위가 다소 발생하며, 장기 크리프 변형에 취약하다.",
      explanation: "기계적 선단정착형 락볼트는 시공 즉시 지보력을 발휘하지만 전면접착형에 비해 초기 변위(슬립)가 크게 발생하고 느슨해지기 쉬워 장기적인 암반 변형 제어 성능은 다소 떨어집니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `락볼트 인발시험 시 하중 재하 장비인 유압 잭(Jack)의 압력계 눈금과 볼트 선단부의 신장량을 측정하여 그래프 상에 매핑 작도하는 거동 평가 곡선의 명칭은 무엇인가?`,
      options: shuffleArray([
        "하중-변위 곡선 (Load-Displacement Curve)",
        "GRC-LSC 반응 곡선",
        "투수-압밀 대수 곡선",
        "Mohr-Coulomb 파괴 포락 곡선"
      ]),
      answer: "하중-변위 곡선 (Load-Displacement Curve)",
      explanation: "인발시험의 하중-변위 관계선에서 초기 경사 기울기 비율이 100%에 가까울수록 볼트 정착 강도가 극대화됩니다. 따라서 이는 시공 불량 원인이 아니며 최적의 시공 상태입니다."
    }
  ];

  return [q1, q2, ...mcQuestions];
}

// Built-in Expert-Grade PE Questions for Soil Nailing & Earth Anchor Comparison
function generateFallbackQuestions(title, keywords, fileText = '') {
  return generateFallbackQuestionsModule(title, keywords, fileText);
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


// -------------------------------------------------------------
// ENDPOINTS
// -------------------------------------------------------------

// 1. Topic Registration + Auto Spaced Scheduling (With customized baseDate support)
app.post('/api/topics', upload.single('pdf'), async (req, res) => {
  const { title, keywords, baseDate } = req.body;

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
      INSERT INTO topics (title, keywords, pdf_name, pdf_data, created_at)
      VALUES (?, ?, ?, ?, ?)
    `;
    const topicResult = await dbQuery.run(insertTopicSql, [
      title,
      keywords || '',
      pdfName,
      pdfData,
      dbDateStr
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
        t.created_at
      FROM schedules s
      JOIN topics t ON s.topic_id = t.id
      WHERE s.planned_date <= ? AND s.status = 'pending'
      ORDER BY s.planned_date ASC, s.review_round ASC
    `;

    const pendingReviews = await dbQuery.all(sql, [queryDate]);

    // 중복 방어: 동일 토픽에 대해 당장 처리해야 하는 가장 낮은 차수의 pending 일정을 우선 유지
    // review_round ASC 정렬이므로 첫 번째 삽입 항목이 항상 가장 긴급한(낮은) 차수
    const uniqueReviewsMap = new Map();
    for (const r of pendingReviews) {
      if (!uniqueReviewsMap.has(r.topic_id)) {
        uniqueReviewsMap.set(r.topic_id, r);
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
       WHERE status = 'completed' AND completed_at IS NOT NULL 
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
async function generateWeakPointRecommendation(queryDate) {
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

  // 오늘의 복습 목록에 떠있는 약점복습토픽이 3개 이상이면 신규 추천하지 않음
  const activeWeaknessCount = await dbQuery.get(
    `SELECT COUNT(*) as count FROM schedules 
     WHERE review_round = 99 AND planned_date <= ? AND status = 'pending'`,
    [queryDate]
  );
  if (activeWeaknessCount.count >= 3) {
    return null;
  }

  // 1. 제외 대상 추출: 오늘 pending 상태로 대기 중이거나, 오늘 이미 보너스(round = 99)로 추천받아 완료한 토픽 목록
  const excludedRows = await dbQuery.all(
    `SELECT DISTINCT topic_id FROM schedules 
     WHERE (status = 'pending' AND planned_date <= ?) 
        OR (review_round = 99 AND planned_date = ? AND status = 'completed')`,
    [queryDate, queryDate]
  );
  const excludedTopicIds = excludedRows.map(r => r.topic_id);

  // 2. 정규 복습하기 점수와 내부에 저장된 약점복습 점수의 평균점수가 90점 이하인 토픽 추출
  const scoreHistory = await dbQuery.all(
    `SELECT topic_id, AVG(score) as avg_score
     FROM schedules
     WHERE status = 'completed' AND score IS NOT NULL
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
      isBonus: true
    };
  }
  return null;
}

// 2-8-2. Get Weak-Point Bonus Reviews for Manual Trigger (한도 없는 실시간 약점 추천 버전)
app.get('/api/dashboard/weak-points', async (req, res) => {
  const queryDate = req.query.date || getLocalDateString();

  try {
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

  try {
    let existing = null;
    if (targetScheduleId) {
      existing = await dbQuery.get('SELECT * FROM schedules WHERE id = ?', [targetScheduleId]);
    }

    if (!existing) {
      // 오늘 해당 토픽에 대해 이미 보너스 완료(round = 99) 기록이 있는지 점검
      existing = await dbQuery.get(
        'SELECT id FROM schedules WHERE topic_id = ? AND review_round = 99 AND planned_date = ?',
        [topicId, today]
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
        [topicId, today, now, score !== undefined ? score : null]
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
  const { schedule_id, topic_id, total, correctCount, score, isPassed, isBonus, questions, selectedAnswers, revealedQuestions, tableAnswers, tableGradingResults, referenceDate } = req.body;

  if (!schedule_id || !topic_id) {
    return res.status(400).json({ error: 'schedule_id와 topic_id는 필수입니다.' });
  }

  const now = new Date().toISOString();

  try {
    let targetScheduleId = schedule_id;

    if (isBonus) {
      let existingBonus = null;
      if (schedule_id && schedule_id !== 9999 && String(schedule_id) !== '9999') {
        existingBonus = await dbQuery.get('SELECT * FROM schedules WHERE id = ?', [schedule_id]);
      }
      if (!existingBonus) {
        const today = getLocalDateString();
        existingBonus = await dbQuery.get(
          'SELECT id FROM schedules WHERE topic_id = ? AND review_round = 99 AND planned_date = ?',
          [topic_id, today]
        );
      }

      if (!existingBonus) {
        const today = getLocalDateString();
        await dbQuery.run(
          `INSERT INTO schedules (topic_id, review_round, planned_date, status) VALUES (?, 99, ?, 'pending')`,
          [topic_id, today]
        );
        const newlyCreated = await dbQuery.get(
          'SELECT id FROM schedules WHERE topic_id = ? AND review_round = 99 AND planned_date = ?',
          [topic_id, today]
        );
        targetScheduleId = newlyCreated.id;
      } else {
        targetScheduleId = existingBonus.id;
      }
    } else {
      // 만약 가상 ID이거나 9999일 경우, 또는 schedule_id가 없을 때만 안전하게 최근 완료된(또는 존재하는) 일반 일정을 타겟으로 복원
      if (schedule_id === 9999 || String(schedule_id) === '9999' || !schedule_id) {
        const lastCompleted = await dbQuery.get(
          `SELECT id FROM schedules WHERE topic_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
          [topic_id]
        );
        if (lastCompleted) {
          targetScheduleId = lastCompleted.id;
        } else {
          const anySchedule = await dbQuery.get(
            `SELECT id FROM schedules WHERE topic_id = ? LIMIT 1`,
            [topic_id]
          );
          if (anySchedule) {
            targetScheduleId = anySchedule.id;
          }
        }
      }
    }

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
        tableGradingResults: tableGradingResults || {}
      });
      await dbQuery.run('DELETE FROM app_session WHERE key = ?', [solvedSessionKey]);
      await dbQuery.run(
        'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [solvedSessionKey, solvedSessionValue]
      );
    }

    // 3. 해당 토픽의 임시 캐시(문제집 세션) 초기화 → 다음 복습 시 새 문제 생성 보장
    await ensureSessionTable();
    const sessionKeyTopic = `review_questions_topic_${topic_id}`;
    const sessionKeySchedule = targetScheduleId && targetScheduleId !== 9999 && targetScheduleId !== '9999'
      ? `review_questions_schedule_${targetScheduleId}`
      : null;
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', [sessionKeyTopic]);
    if (sessionKeySchedule) {
      await dbQuery.run('DELETE FROM app_session WHERE key = ?', [sessionKeySchedule]);
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

    if (schedule.status !== 'completed') {
      return res.status(400).json({ error: '완료 상태인 항목만 초기화할 수 있습니다.' });
    }

    const todayDateStr = getLocalDateString();
    let newPlannedDate = schedule.planned_date;

    const updateSql = `
      UPDATE schedules 
      SET status = 'pending', completed_at = NULL, planned_date = ?, score = NULL, correct_count = NULL, total_count = NULL
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [newPlannedDate, scheduleId]);

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
      SELECT t.id, t.title, t.keywords, t.pdf_name, t.created_at,
             COALESCE((SELECT MAX(completed_at) FROM schedules WHERE topic_id = t.id AND completed_at IS NOT NULL), t.created_at) AS last_active
      FROM topics t
      ORDER BY t.id ASC
    `;
    const topics = await dbQuery.all(sql);

    const topicsWithSchedules = [];
    for (const topic of topics) {
      const scheduleSql = `
        SELECT id, review_round, planned_date, completed_at, status, score, correct_count, total_count
        FROM schedules
        WHERE topic_id = ?
        ORDER BY review_round ASC
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
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
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

  // Live DB connection test
  let dbLiveTest = 'not_attempted';
  let dbLiveError = null;
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
      await testPool.end();
      dbLiveTest = 'success';
    } catch (e) {
      dbLiveTest = 'failed';
      dbLiveError = e.message;
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

// 6. AI Review Helper: Generate 3 custom PE-style exam questions
function createLocalFallbackTableQuestion(idx, title, keywords) {
  if (idx === 0) {
    return {
      type: "주관식 (표채우기)",
      question: "다음 소일네일링(Soil Nailing) 공법과 어스앵커(Earth Anchor) 공법의 주요 공학적 특징 비교표 빈칸 (A), (B)에 들어갈 알맞은 핵심 개념을 서술하시오.",
      tableData: {
        headers: ["구분 항목", "소일네일링 (Soil Nailing)", "어스앵커 (Earth Anchor)"],
        rows: [
          ["보강 방식 및 지지력 메커니즘", "[INPUT_1]", "[INPUT_2]"],
          ["긴장력 도입 여부", "수동적 보강 (긴장력 도입 없음)", "능동적 보강 (프리스트레스 긴장력 도입)"],
          ["주요 구성 요소", "강봉 또는 네일, 시멘트 그라우팅", "PC 강연선, 인장재, 자유장 및 정착장"]
        ]
      },
      answers: {
        "INPUT_1": "수동적 전단 및 인장 저항",
        "INPUT_2": "선단 지지력 및 주면 마찰력"
      },
      explanation: "소일네일링은 지반 변형 시 가동되는 수동적 저항 메커니즘을 가지며, 어스앵커는 프리스트레스를 이용해 능동적으로 지반을 지지하는 특성을 갖습니다."
    };
  } else if (idx === 1) {
    return {
      type: "주관식 (표채우기)",
      question: "다음 얕은기초(확대기초)와 깊은기초(말뚝기초)의 공학적 설계 조건 및 하중 전이 경로 비교표 빈칸 (A), (B)에 들어갈 핵심 용어를 작성하시오.",
      tableData: {
        headers: ["비교 구분 항목", "얕은기초 (확대기초)", "깊은기초 (말뚝기초)"],
        rows: [
          ["근입 깊이 기하학적 조건", "근입깊이가 기초 폭보다 작거나 같음 (Df <= B)", "근입깊이가 기초 폭보다 훨씬 큼 (Df >> B)"],
          ["하중 전이 경로 및 저항 기전", "[INPUT_1]", "[INPUT_2]"],
          ["적용 지층의 조건", "상부 지반의 지지력이 양호함", "상부 연약 지반 아래에 견고한 지지층이 존재함"]
        ]
      },
      answers: {
        "INPUT_1": "기초 저면 지반의 직접 지지력",
        "INPUT_2": "선단 지지력 및 주면 마찰력"
      },
      explanation: "얕은기초는 저면 지반의 지지력을 직접 이용하며, 깊은기초는 얕은 지층이 연약할 때 하부 암반층까지 말뚝을 박아 선단 지지력과 주면 마찰력으로 저항합니다."
    };
  } else {
    return {
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
    };
  }
}

function assembleFinalQuestions(questions, topic, carryOverQuestions, fileText) {
  const subjsIntroFormula = questions.filter(q => q.type === '주관식 (개요)' || q.type === '주관식 (공식)');
  const subjsShort = questions.filter(q => q.type === '주관식 (단답형)');
  const subjsTable = questions.filter(q => q.type === '주관식 (표채우기)' || q.subtype === '표채우기');
  const mcs = questions.filter(q => q.type === '객관식 (4지선다)' || (q.options && q.options.length > 0));

  // 1. Q1, Q2 (Intro/Formula) - exactly 2
  let finalSubjsIntroFormula = [...subjsIntroFormula].slice(0, 2);
  if (finalSubjsIntroFormula.length < 2) {
    const fallbackQs = generateFallbackQuestions(topic.title, topic.keywords, fileText || '');
    const fallbackSubjs = fallbackQs.filter(q => q.type === '주관식 (개요)' || q.type === '주관식 (공식)');
    finalSubjsIntroFormula = [...finalSubjsIntroFormula, ...fallbackSubjs].slice(0, 2);
  }

  // 2. Q3, Q4 (Short Answer) - exactly 2
  let finalSubjsShort = [...subjsShort];
  if (finalSubjsShort.length < 2) {
    const fallbackQs = generateFallbackQuestions(topic.title, topic.keywords, fileText || '');
    const fallbackShorts = fallbackQs.filter(q => q.type === '주관식 (단답형)');
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
  finalSubjsShort = uniqueShort.slice(0, 2);

  // If we still need more to make exactly 2, we dynamically derive from Q1 (finalSubjsIntroFormula[0])
  if (finalSubjsShort.length < 2 && finalSubjsIntroFormula.length > 0) {
    const q1 = finalSubjsIntroFormula[0];
    finalSubjsShort.push({
      type: "주관식 (단답형)",
      question: `[${topic.title}]의 가장 핵심적인 공학적 정의(개요)와 기본적인 작동 원리를 서술하시오.`,
      answer: q1.concept || `${topic.title}의 핵심 개념`,
      explanation: `${topic.title}에 관한 핵심 정의 및 개요 서술형 평가입니다.`
    });
  }

  // Ensure we have exactly 2
  while (finalSubjsShort.length < 2) {
    finalSubjsShort.push({
      type: "주관식 (단답형)",
      question: `${topic.title} 공법/개념의 핵심적인 공학적 의미 및 메커니즘을 설명하시오.`,
      answer: "핵심 메커니즘",
      explanation: `${topic.title}의 기본적인 공학적 개념과 핵심 작동 메커니즘입니다.`
    });
  }

  // 3. Q5, Q6, Q7 (Table Quiz) - exactly 3
  let finalSubjsTable = [...subjsTable].slice(0, 3);
  if (finalSubjsTable.length < 3) {
    const fallbackQs = generateFallbackQuestions(topic.title, topic.keywords, fileText || '');
    const fallbackTables = fallbackQs.filter(q => q.type === '주관식 (표채우기)' || q.subtype === '표채우기');
    finalSubjsTable = [...finalSubjsTable, ...fallbackTables].slice(0, 3);
  }
  while (finalSubjsTable.length < 3) {
    finalSubjsTable.push(createLocalFallbackTableQuestion(finalSubjsTable.length, topic.title, topic.keywords));
  }

  // 4. MC questions (6 questions)
  let finalMcs = [];
  const uniqueMcQuestions = new Set();

  mcs.forEach(q => {
    if (finalMcs.length >= 6) return;
    const cleanQ = (q.question || '').trim();
    if (cleanQ && !uniqueMcQuestions.has(cleanQ)) {
      uniqueMcQuestions.add(cleanQ);
      finalMcs.push(q);
    }
  });

  if (finalMcs.length < 6 && carryOverQuestions && carryOverQuestions.length > 0) {
    const shuffledCarryOvers = carryOverQuestions.map(q => shuffleMultipleChoice(q));
    shuffledCarryOvers.forEach(q => {
      if (finalMcs.length >= 6) return;
      const cleanQ = (q.question || '').trim();
      if (cleanQ && !uniqueMcQuestions.has(cleanQ)) {
        uniqueMcQuestions.add(cleanQ);
        finalMcs.push(q);
      }
    });
  }

  if (finalMcs.length < 6) {
    const fallbackQs = generateFallbackQuestions(topic.title, topic.keywords, fileText || '');
    const fallbackMcs = fallbackQs.filter(q => q.options && q.options.length > 0).map(q => shuffleMultipleChoice(q));
    for (const fQ of fallbackMcs) {
      if (finalMcs.length >= 6) break;
      const cleanQ = (fQ.question || '').trim();
      if (cleanQ && !uniqueMcQuestions.has(cleanQ)) {
        uniqueMcQuestions.add(cleanQ);
        finalMcs.push(fQ);
      }
    }
  }

  if (finalMcs.length < 6) {
    const deficit = 6 - finalMcs.length;
    console.log(`[문항 치환] 유니크 객관식이 부족하여 ${deficit}개 문항을 표 주관식으로 대체합니다.`);
    for (let i = 0; i < deficit; i++) {
      finalSubjsTable.push(createLocalFallbackTableQuestion(finalSubjsTable.length, topic.title, topic.keywords));
    }
  }

  const shuffledRest = shuffleArray([...finalSubjsTable, ...finalMcs]);
  return [...finalSubjsIntroFormula, ...shuffledRest, ...finalSubjsShort];
}

app.post('/api/topics/:id/ai-questions', async (req, res) => {
  const topicId = Number(req.params.id) || req.params.id;
  console.log(`[POST /api/topics/:id/ai-questions] Triggered: req.params.id="${req.params.id}", coerced topicId=${topicId} (type: ${typeof topicId})`);

  try {
    const topicSql = `SELECT * FROM topics WHERE id = ?`;
    console.log(`[POST /api/topics/:id/ai-questions] Querying topic row using SQL: "${topicSql}"`);
    const topic = await dbQuery.get(topicSql, [topicId]);

    if (!topic) {
      console.warn(`[POST /api/topics/:id/ai-questions] Topic NOT found in DB for topicId=${topicId}`);
      return res.status(404).json({ error: '토픽을 찾을 수 없습니다.' });
    }
    console.log(`[POST /api/topics/:id/ai-questions] Found topic in DB: title="${topic.title}", keywords="${topic.keywords}", pdf_name="${topic.pdf_name}"`);

    // 캐싱된 복습 세션 문제 복원
    await ensureSessionTable();
    const scheduleId = req.query.scheduleId;
    const key = scheduleId && scheduleId !== '9999' && scheduleId !== 'null' && scheduleId !== 'undefined'
      ? `review_questions_schedule_${scheduleId}`
      : `review_questions_topic_${topicId}`;
    const cached = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);
    if (cached && cached.value) {
      console.log(`[Cache Hit] Serving saved review questions for key ${key}`);
      try {
        const parsed = JSON.parse(cached.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const healed = parsed.map(q => healQuizQuestionObject(q));
          return res.json({ questions: healed, isFallback: false, isCached: true });
        } else if (parsed && Array.isArray(parsed.questions)) {
          const healed = parsed.questions.map(q => healQuizQuestionObject(q));
          return res.json({
            questions: healed,
            selectedAnswers: parsed.selectedAnswers || {},
            revealedQuestions: parsed.revealedQuestions || {},
            tableAnswers: parsed.tableAnswers || {},
            tableGradingResults: parsed.tableGradingResults || {},
            tutorAnswers: parsed.tutorAnswers || {},
            tutorInputText: parsed.tutorInputText || {},
            chatHistory: parsed.chatHistory || [],
            savedQuizScroll: parsed.savedQuizScroll || 0,
            isFallback: false,
            isCached: true
          });
        }
      } catch (e) {
        console.warn('Failed to parse cached review questions:', e);
      }
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
                  incorrectQuestions.push(q);
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
    const neededAiMcCount = 6;

    let fileText = '';
    if (topic.pdf_data) {
      const isHtml = topic.pdf_name && (
        topic.pdf_name.toLowerCase().endsWith('.html') || 
        topic.pdf_name.toLowerCase().endsWith('.htm') || 
        isBufferHtml(topic.pdf_data)
      );
      if (isHtml) {
        try {
          const rawHtml = decodeHtmlBuffer(topic.pdf_data);
          fileText = htmlToPlainText(rawHtml);
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
      searchTarget.includes('사면안정') || searchTarget.includes('사면 안정') || searchTarget.includes('slope stability') || searchTarget.includes('slope') || searchTarget.includes('사면 붕괴') || searchTarget.includes('사면붕괴') || searchTarget.includes('원호파괴') || searchTarget.includes('평면파괴') || searchTarget.includes('쐐기파괴') || searchTarget.includes('전도파괴') || searchTarget.includes('절편법') || searchTarget.includes('fellenius') || searchTarget.includes('펠레니우스') || searchTarget.includes('bishop') || searchTarget.includes('비숍') ||
      searchTarget.includes('토압') || searchTarget.includes('옹벽') || searchTarget.includes('earth pressure') || searchTarget.includes('retaining wall') || searchTarget.includes('주동토압') || searchTarget.includes('수동토압') || searchTarget.includes('정지토압') || searchTarget.includes('주동 토압') || searchTarget.includes('수동 토압') || searchTarget.includes('정지 토압') || searchTarget.includes('랭킨') || searchTarget.includes('rankine') || searchTarget.includes('쿨롱') || searchTarget.includes('coulomb') ||
      searchTarget.includes('전단강도') || searchTarget.includes('전단 강도') || searchTarget.includes('shear strength') || searchTarget.includes('삼축압축') || searchTarget.includes('삼축 압축') || searchTarget.includes('uu 시험') || searchTarget.includes('cu 시험') || searchTarget.includes('cd 시험') || searchTarget.includes('uu시험') || searchTarget.includes('cu시험') || searchTarget.includes('cd시험') || searchTarget.includes('비배수') || searchTarget.includes('mohr-coulomb') || searchTarget.includes('모어 쿨롱') || searchTarget.includes('모어-쿨롱') ||
      searchTarget.includes('투수') || searchTarget.includes('침투') || searchTarget.includes('보일링') || searchTarget.includes('boiling') || searchTarget.includes('분사현상') || searchTarget.includes('분사 현상') || searchTarget.includes('piping') || searchTarget.includes('파이핑') || searchTarget.includes('seepage') || searchTarget.includes('permeability') || searchTarget.includes('darcy') || searchTarget.includes('다르시') || searchTarget.includes('임계동수경사') || searchTarget.includes('동수경사') || searchTarget.includes('유선망') || searchTarget.includes('flow net') ||
      searchTarget.includes('흙막이') || searchTarget.includes('가설 흙막이') || searchTarget.includes('가설흙막이') || searchTarget.includes('탄소성') || searchTarget.includes('탄소성보') || searchTarget.includes('탄소성보법') || searchTarget.includes('braced wall') || searchTarget.includes('braced_wall') || searchTarget.includes('지반스프링') || searchTarget.includes('지반 스프링') ||
      searchTarget.includes('액상화') || searchTarget.includes('liquefaction') || searchTarget.includes('간극수압') || searchTarget.includes('과잉간극수압') ||
      searchTarget.includes('보상기초') || searchTarget.includes('compensated foundation') || searchTarget.includes('compensated_foundation') || searchTarget.includes('하중 보상') || searchTarget.includes('하중보상');

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
      const finalQuestions = assembleFinalQuestions(coreQuestions, topic, carryOverQuestions, fileText);
      const cleanedCore = finalQuestions.map(q => healQuizQuestionObject({
        ...q,
        topic_id: Number(topicId),
        question: cleanQuizQuestion(q.question)
      }));

      // 세션에 자동 저장
      try {
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        await dbQuery.run(
          'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, JSON.stringify(cleanedCore)]
        );
      } catch (e) {
        console.warn('Failed to auto-save core review questions to app_session:', e);
      }

      return res.json({
        questions: cleanedCore,
        isFallback: true, // Treat as fallback as AI was bypassed
        mode: 'ai-optimized',
        info: 'Handcrafted premium routing bypass'
      });
    }

    // Force local/source-based mode
    if (forceLocal || !hasAnyAiKey) {
      const reason = forceLocal ? '소스 기반 모드로 요청됨' : '등록된 AI API 키 없음';
      console.log(`Generating local fallback questions. Reason: ${reason}`);
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      const finalQuestions = assembleFinalQuestions(fallbackQuestions, topic, carryOverQuestions, fileText);
      const cleanedFallback = finalQuestions.map(q => healQuizQuestionObject({
        ...q,
        topic_id: Number(topicId),
        question: cleanQuizQuestion(q.question)
      }));

      // 세션에 자동 저장
      try {
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        await dbQuery.run(
          'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, JSON.stringify(cleanedFallback)]
        );
      } catch (e) {
        console.warn('Failed to auto-save local fallback review questions to app_session:', e);
      }

      return res.json({ 
        questions: cleanedFallback, 
        isFallback: true,
        mode: 'local',
        error: forceLocal ? null : '백엔드 환경변수에 AI API 키가 존재하지 않습니다.'
      });
    }

    let specialInstructions = '';
    if (cleanTitle.includes('확대기초') && cleanTitle.includes('거동') && cleanTitle.includes('파괴')) {
      specialInstructions = `
[특별 출제 지침 - 매우 중요]:
이 토픽은 '프란틀 지지력 공식'이나 '테르자기 극한지지력 공식' 자체의 상세한 유도나 공식 정의를 단독으로 묻는 토픽이 아닙니다.
반드시 다음의 핵심 영역들에 고도로 집중하여 객관식 7문제와 주관식 표채우기 3문제를 출제하십시오:
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

    const totalAiQuestionsCount = 13;

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

    const prompt = `
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원입니다.
아래 제공되는 [토픽 제목], [핵심 키워드], [첨부파일 본문 텍스트], [이전 회차 오답 정보], [사용자 피드백 지침] 그리고 [사용자 문제 조정 내역]을 심층 분석하여, 총 ${totalAiQuestionsCount}개의 예상문제를 생성해 주십시오.
${specialInstructions}
${weaknessPrompt}
${feedbackPrompt}
${adjustmentsPrompt}

[토픽 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}
[첨부파일 본문 텍스트]: ${fileText || '제공되지 않음'}

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
     * 정답("answer"): 12번과 13번의 모범 답안은 단순히 한 단어 키워드가 아니라, 핵심 내용이 논리적으로 포함된 1줄 서술형(최소 15자에서 최대 30자 내외)으로 작성하십시오. 또한, 이 정답 문장 내에서 채점에 중요도가 가장 높은 필수 공학 키워드들은 반드시 역슬래시 없이 일반 마크다운 강조 기호인 **키워드** 형태로 감싸서 작성해 주십시오. (예: **이중층 두께**, **전단강도 저하** 등)
     * "explanation": 왜 이 답안이 올바른 공학적 대책/이론인지 상세히 설명하십시오.

   [3번~11번 문제 중 3개] 주관식 (표채우기):
   - 목적: 토픽에서 기술사로서 반드시 숙지하고 있어야 하는 가장 핵심적이고 중요한 공학 개념, 메커니즘, 혹은 서로 비교/대비되는 두 공법(예: 소일네일링 vs 어스앵커, 얕은기초 vs 깊은기초 등)의 특징을 대조하는 유기적 표(Table) 질문 출제.
     - 구성 형태: 열(Column)에 비교 대상들을 배치하고, 행(Row)의 첫 번째 열에는 구분/평가 기준(구분 항목)을 둡니다. 이때, 구분 항목은 단순히 '지반 보강 특성', '보강 효과', '실무 적용', '시험 특징' 등과 같이 너무 짧고 모호하게 작성하지 마십시오. 사용자가 빈칸에 채워 넣을 답안의 방향(예: 보강 효과 및 두께 영향인지, 한계점 및 단점인지, 실무 활용처인지, 시공 시 유의사항인지 등)을 명확하게 파악할 수 있도록 **구체적이고 명확한 평가 기준명으로 서술형태의 구체적인 명칭을 적용**하십시오.
      - 🚨 **[구분 항목(행 제목) 명확화 원칙 - 극도로 중요!]**: 구분 항목(행 제목)은 **그것만 읽어도 ① 이 표가 무슨 주제/토픽에 대한 비교인지, ② 이 행에 어떤 종류의 답을 써야 하는지 100% 확신할 수 있어야** 합니다. **글자수는 반드시 최소 10자에서 최대 25자 이내**로 구체적으로 작성하십시오.
        🚫 **절대 금지하는 구분항목 유형**:
        (1) '보강 효과', '시험 특징', '실무 적용' 같은 5~6자짜리 짧고 모호한 범용 표현 → **어떤 토픽에든 갖다 붙일 수 있는 추상적 표현은 절대 금지**
        (2) '지지 메커니즘', '설계 핵심 변수', '주요 적용 지반' 같은 일반적 공학 용어만 나열 → **해당 비교 대상(토픽)의 고유한 공학적 특성이 전혀 드러나지 않는 구분항목은 절대 금지**
        ✅ **올바른 구분항목 작성법**: 반드시 **해당 비교 대상(예: 소일네일링 vs 어스앵커)의 고유한 공학적 특성·거동·현상을 직접 언급**하여, 이 구분항목만 읽어도 "아, 이건 OO과 XX를 비교하는 표에서 △△ 측면을 묻는 행이구나"라고 즉시 파악할 수 있도록 작성하십시오.
        ❌ 나쁜 예(범용적·추상적, 무슨 문제인지 알 수 없음): '지지 메커니즘', '보강 효과', '시험 특징', '실무 적용 특성', '설계 핵심 변수'
        ✅ 좋은 예(토픽 특화, 해당 문제 내용이 명확히 드러남):
          - 소일네일링 vs 어스앵커 비교 시: '네일/앵커체 인장력 전달 및 선행 긴장 도입 여부', '굴착면 수동저항 vs 정착부 능동긴장의 지반보강 원리 차이', '네일/앵커 설계 시 인발저항력 산정 기준 및 안전율 적용 차이'
          - CU vs CD 삼축시험 비교 시: '전단 중 간극수압 배수 허용 여부와 유효응력 경로 차이', '시험 소요시간 및 포화점토 현장 재현성 차이', '파괴 시 측정되는 강도정수(Cu vs C′,φ′) 종류 차이'
        🔍 **자기 검증 필수**: 구분 항목 작성 후 반드시 자문하십시오—**"이 구분항목을 비교 대상 컬럼(헤더) 없이 단독으로 읽었을 때, 무슨 토픽/주제에 대한 비교표인지 추측할 수 있는가?"** → 추측할 수 없다면 구분항목이 너무 범용적인 것이므로, 해당 토픽의 고유 특성을 반영하여 더 구체적으로 수정하십시오.
   - ⚠️ [중요 금지 규칙 - 입력 편의성 극대화]: 주관식 표채우기 문제 출제 시, 사용자가 직접 수식(예: $\\sqrt{k_h/k_v}$와 같은 루트, 제곱, 분수식 등)이나 로마자/그리스 문자 기호, 또는 단위(m, kN, Pa 등)를 직접 키보드로 입력해야 하는 문제는 **절대로 출제하지 마십시오.** 키보드로 기호 및 수식을 입력하는 것은 불가능에 가깝고 오타 발생률이 극도로 높습니다.
   - ⚠️ [정답 구성 원칙]: 수식이나 공식 자체를 묻고 싶다면 반드시 '객관식'으로 질문을 구성하십시오. 주관식 표채우기 빈칸(\`[INPUT_1]\`)에는 단순히 '면모 구조 형성'이나 '이온 교환' 같은 5~6자 내외의 단순 용어 명칭은 **절대로 출제하지 마십시오.** 대신 **핵심 원리/개념을 관통하여 15자~20자 내외로 서술해야 하는 서술형 문구**이거나, 혹은 **특정 공학적 상황을 가정했을 때 대처 방안 및 어떻게 해야 하는가에 대해 15자~20자 내외로 명확히 답하는 구체적인 서술형 문구**를 정답으로 구성하십시오.
    - ⚠️ **[비교 컬럼 빈칸 처리 및 질문 일치 원칙 - 극단적으로 중요]**:
      1. 만약 질문(question) 지문(대주제 제목)에서 비교하고자 하는 대상이 3개 이상(예: UU, CIU, CK_0U)인 경우, 비교표(tableData) 역시 해당 비교 대상 전부를 열(Column)로 빠짐없이 포함해야 합니다. (예: ["구분 항목", "UU 시험", "CIU 시험", "CK_0U 시험"]와 같이 총 4개 이상의 열). 일부 비교 대상을 표 작성에서 완전히 누락시키는 것을 엄격히 금지합니다.
      2. **모든 비교 대상 컬럼의 셀에 빠짐없이 순차적으로 '[INPUT_1]', '[INPUT_2]', '[INPUT_3]', '[INPUT_4]', '[INPUT_5]', '[INPUT_6]' 등의 입력 토큰을 채워 넣으십시오.**
      3. 질문 지문(question) 내의 빈칸 표시 (A), (B), (C), (D)... 개수는 입력 토큰의 총 개수(예: 3개 비교대상 열 * 2개 행 = 6개인 경우 A, B, C, D, E, F)와 정확히 일치해야 합니다. 비교 대상이 3개 이상이거나 행이 늘어나 입력창이 5개 이상(예: 6개)인 경우에는 순서대로 "(A)", "(B)", "(C)", "(D)", "(E)", "(F)" 등 늘어난 개수만큼 명시하여 지문을 구성하십시오.
      4. 만약 비교 대상 열이 비어 있어 아무것도 입력할 수 없거나 비교 대상이 단 하나뿐이라면 2개 열(구분, 비교대상1)만으로 표를 구성하고, 3개 이상의 열로 구성할 때는 모든 비교 셀을 빈칸 토큰으로 채워 입력창으로 만들어야 합니다.
   - "type" 값: 반드시 "주관식 (표채우기)"
    - "question": 표의 빈칸에 알맞은 핵심 답안을 서술하라는 질문 (예: "다음 소일네일링과 어스앵커 공법의 주요 공학적 특징 비교표 빈칸 (A), (B), (C), (D)에 들어갈 내용을 기술하십시오."). (⚠️ [지문 작성 수칙 - 매우 중요!]): "question" 본문에는 절대로 "INPUT_1", "INPUT_2" 또는 "[INPUT_1]" 같은 시스템 토큰명 자체를 노출하여 적지 마십시오. 대신 사용자가 직관적으로 알아볼 수 있도록 순서대로 "(A)", "(B)", "(C)", "(D)" 등으로 지칭하여 지문을 구성하십시오. 만약 비교 대상이 3개 이상이거나 행이 늘어나 입력창이 5개 이상인 경우에는 순서대로 "(A)", "(B)", "(C)", "(D)", "(E)", "(F)" 등 늘어난 개수만큼 명시하여 지문을 구성하십시오.
   - "tableData": 표의 데이터를 구조화한 객체. 반드시 다음 키를 포함하는 오브젝트여야 합니다:
     * "headers": 표의 열 제목들을 담은 문자열 배열 (예: ["구분 항목", "소일네일링", "어스앵커"])
     * "rows": 각 행의 셀 데이터들을 담은 이중 배열. (⚠️ [비교 컬럼 전체 빈칸 비우기 수칙 - 극도로 중요!]): 첫 번째 '구분 항목' 열을 제외하고, 오른쪽에 위치하는 모든 비교/대비 대상 컬럼의 셀들은 단 하나의 텍스트 힌트도 남기지 말고 **무조건 전부 빈칸 토큰([INPUT_1], [INPUT_2] 등)으로 비워두십시오.** 일부 셀이 텍스트로 미리 채워져 있으면 사용자가 서로 반대 내용을 대입하여 정답을 쉽게 맞추므로 변별력이 사라집니다. 따라서 구분 컬럼을 제외한 내부는 **전부 입력창(3열 3행 테이블 기준 총 6칸 전체)**으로 구성해야 합니다. (예: rows 구조: [["지지 매커니즘", "[INPUT_1]", "[INPUT_2]"], ["설계 핵심 변수", "[INPUT_3]", "[INPUT_4]"], ["주요 적용 지반", "[INPUT_5]", "[INPUT_6]"]])
   - "answers": 각 빈칸 토큰에 해당하는 정확한 모범 답안 객체 (예: {"INPUT_1": "인장 및 전단력에 대한 수동적 저항", "INPUT_2": "정착지반 마찰저항 및 인장력 선도입", "INPUT_3": "선행 긴장력을 도입하지 않음", "INPUT_4": "인장력을 도입하여 변위를 적극적 제어"}). 각 모범 답안은 핵심 메커니즘을 상세히 기술하는 **15자~20자 내외의 서술형 문구**여야 합니다. 단순 용어 명칭은 제외하십시오.
     🚨 **[모범 답안-구분항목 범주 일치 원칙 - 극도로 중요!]**: 각 INPUT의 모범 답안은 반드시 **해당 행의 구분 항목(행 제목)이 요구하는 답변 범주**에 정확히 부합하는 내용이어야 합니다. 예를 들어 구분 항목이 '실무 활용처 및 적용 사례'이면 모범 답안도 '어디에 쓰이는지(활용처)'를 기술해야 하고, '시공 시 유의사항 및 한계'이면 '주의해야 할 점(유의사항)'을 기술해야 합니다. 구분 항목이 묻는 범주와 전혀 다른 범주의 답(예: 유의점을 물었는데 활용처를 답안으로 작성)은 **출제 오류**이므로 절대 발생시키지 마십시오.
   - "explanation": 표 전체 내용 및 각 빈칸에 대한 공학적 상세 해설.

   [3번~11번 문제 중 6개] 객관식 (4지선다):
   - 목적: ${carryOverQuestions.length > 0 ? '이전 회차 오답 문제들의 취약한 개념을 보완하고, ' : ''}토픽의 상세한 원리, 메커니즘, 장단점 등을 다각도로 평가하는 고난도 4지선다형 질문.
   - "type" 값: 반드시 "객관식 (4지선다)"
   - 개수: 반드시 정확히 6개의 객관식 문제를 출제해야 합니다.
   - ⚠️ [계산문제 비중 조건 - 매우 중요]: 전체 6개의 객관식 문제 중, **반드시 정확히 2개의 문제는 공학적 수치 판단이나 정량적 분석 능력을 평가하는 문제로 출제**하십시오. 단, **🚨 [단순 대입 계산 문제 절대 금지]**: 질문 지문에 공식이나 수치를 미리 제시한 뒤 "이 값을 대입하여 계산하시오" 식의 기계적 계산 문제는 **절대로 출제하지 마십시오.** 대신, 공학적 변수 간의 인과관계, 비례/반비례 거동의 물리적 원인, 설계 조건 변화에 따른 결과 예측 등 **핵심 원리의 이해력을 검증하는 정량적 사고 문제**로 구성하십시오.
   - ⚠️ [핵심 관통 질문 원칙]: 모든 객관식 문제는 해당 토픽의 가장 본질적인 공학적 메커니즘, 거동 원리, 설계 판단 근거를 관통하는 질문이어야 합니다. 보기(options) 역시 공학적 개념 차이를 정확히 식별해야만 정답을 고를 수 있도록 설계하십시오.
   - "question": 구체적이고 학술적인 내용 일치 또는 원리 분석 객관식 질문. (⚠️ 중요: 질문에 비교/특성 표가 필요한 경우, 절대 <table> 등 HTML 태그로 표를 직접 작성하지 말고 일반 텍스트로만 질문을 작성한 뒤 아래 of "tableData" 필드에 표 데이터를 객체 구조로 작성하십시오.)
   - "tableData": (선택사항) 문제에 표를 표시해야 하는 경우에만 정의하십시오. 주관식 (표채우기)와 마찬가지로 "headers"(열 제목 배열)와 "rows"(각 행 데이터의 배열)를 포함하는 오브젝트여야 합니다. (예: {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적환경", "해수", "담수"]]})
   - "options": 4개의 보기 문항으로 구성된 문자열 배열.
   - "answer": "options" 배열 안에 있는 값 중 정확히 일치하는 정답 문자열.
   - "explanation": 왜 이 보기가 정답이고 다른 보기들이 오답인지에 대한 논리적이고 전문적인 상세 해설.
   - 중요 특화 출제 사항 (공식 은닉 원칙 - 극도로 중요):
      🚨 [공식 및 공식 수치 범위 노출 절대 금지 규칙 - 극도로 중요!]: 문제 질문(question) 본문 내에 문제를 해결하는 데 필요한 공학 수식 자체(예: $E_u = 300 s_u$ 등)나 수식의 특정 수치 범위(예: $E_u = (200 \sim 500)s_u$ 등), 비례 관계 식 등을 **절대로 직접 텍스트로 적어 제공하지 마십시오.** 수식이나 경험적 수치 범위를 지문에 미리 주면 학생의 암기 및 연상 능력을 평가할 수 없습니다. 대신 공식의 명칭("비배수 탄성계수 경험식")이나 변수들의 명칭("비배수 전단강도 $s_u$")만을 제시하고, 학생이 스스로 공식과 범위를 떠올려서 해결하도록 하십시오. (단, 해설(explanation)에서는 학생의 학습을 위해 공식을 상세히 명시하고 계산 과정을 설명해야 합니다.)
       🚨 [유사/중복 질문 출제 절대 금지 - 매우 중요!]: 하나의 공식이나 거동 특성에서 파생되는 변수만 바꾼 형태의 유사한 비례/반비례 질문은 **절대로 중복하여 출제하지 마십시오.** (예: 공식 $A = B \times C$에 대해 "B가 증가할 때 A의 변화"를 묻는 문제를 출제했다면, 동일한 테스트 세트 내에 "C가 증가할 때 A의 변화"를 묻는 질문은 사실상 동일한 비례 관계 메커니즘을 묻는 중복 문제이므로 **절대로 같이 내지 말고**, 완전히 다른 공학적 개념이나 새로운 지식을 묻는 독립적인 문제로만 구성하십시오.)

${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}

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
  ... (총 ${totalAiQuestionsCount}개가 되도록 주관식(개요 1, 공식 1, 표채우기 3), 객관식(6개), 주관식(단답형 2)을 순서대로 배열하여 총 13개 완성)
]
`;

try {
        const responseText = await callLLMWithFailover(null, prompt, null, 'question');
        
        let text = responseText.trim();
        if (text.startsWith('```')) {
          text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }
        
        let questions = null;
        try {
          questions = parseLlmJson(text);
        } catch (parseErr) {
          console.warn('[단일토픽퀴즈] JSON.parse 실패로 인해 정규식 배열 추출을 시도합니다:', parseErr);
          questions = extractJsonArray(responseText);
        }

        if (!questions || !Array.isArray(questions)) {
          throw new Error('AI 응답을 유효한 문제 JSON 배열로 파싱하지 못했습니다.');
        }

        const finalQuestions = assembleFinalQuestions(questions, topic, carryOverQuestions, fileText);
        const cleanedQuestions = finalQuestions.map(q => healQuizQuestionObject({
          ...q,
          topic_id: Number(topicId),
          question: cleanQuizQuestion(q.question)
        }));

        // 세션에 자동 저장
        try {
          await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
          await dbQuery.run(
            'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            [key, JSON.stringify(cleanedQuestions)]
          );
        } catch (e) {
          console.warn('Failed to auto-save generated review questions to app_session:', e);
        }

        res.json({ questions: cleanedQuestions, isFallback: false });
    } catch (aiError) {
      console.error('Gemini API call failed, generating fallbacks:', aiError);
      const isQuota = aiError.message?.includes('Quota') || aiError.message?.includes('quota') || aiError.message?.includes('rate') || aiError.message?.includes('429');
      const errorMsg = isQuota ? 'AI API 일일 사용 한도를 초과했습니다. 임시 문제로 대체됩니다.' : aiError.message;
      
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      const finalQuestions = assembleFinalQuestions(fallbackQuestions, topic, carryOverQuestions, fileText);
      
      const cleanedFallback = finalQuestions.map(q => healQuizQuestionObject({
        ...q,
        topic_id: Number(topicId),
        question: cleanQuizQuestion(q.question)
      }));

      // 세션에 자동 저장
      try {
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        await dbQuery.run(
          'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, JSON.stringify(cleanedFallback)]
        );
      } catch (e) {
        console.warn('Failed to auto-save fallback review questions to app_session:', e);
      }

      res.json({ questions: cleanedFallback, isFallback: true, error: errorMsg });
    }
  } catch (error) {
    console.error('Error in AI question generation route:', error);
    res.status(500).json({ error: '서버 오류로 AI 기출문제를 생성하지 못했습니다.' });
  }
});

// 6-1-1. POST /api/grade-subjective → Gemini 3.1 Flash Lite를 사용한 주관식 답안 판정 (플러그인 방식 적용)
app.post('/api/grade-subjective', async (req, res) => {
  const { question, correctAnswer, userAnswer, rowHeader, colHeader } = req.body;

  let attempt = 0;
  const maxAttempts = 3;
  let delay = 2000;
  let lastError = null;

  while (attempt < maxAttempts) {
    try {
      const result = await gradeSubjective({
        question,
        correctAnswer,
        userAnswer,
        rowHeader,
        colHeader,
        callLLMWithFailover
      });
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
  res.json({
    isCorrect: localCorrect,
    score: localCorrect ? 10 : 0,
    reason: localCorrect 
      ? '로컬 단순 비교로 정답 판정' 
      : 'AI 채점 오버로드로 평가 실패 (재평가 버튼을 눌러주세요)'
  });
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
  const { mode, topicId, currentQuestion, questionIdx, allQuestions } = req.body;

  try {
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
        const isHtml = topic.pdf_name && (
          topic.pdf_name.toLowerCase().endsWith('.html') || 
          topic.pdf_name.toLowerCase().endsWith('.htm') || 
          isBufferHtml(topic.pdf_data)
        );
        if (isHtml) {
          try {
            const rawHtml = decodeHtmlBuffer(topic.pdf_data);
            fileText = htmlToPlainText(rawHtml);
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
        searchTarget.includes('보상기초') || searchTarget.includes('compensated foundation') || searchTarget.includes('compensated_foundation') || searchTarget.includes('하중 보상') || searchTarget.includes('하중보상');

      // targetType 결정
      let targetType = '객관식 (4지선다)';
      const currentType = currentQuestion?.type || '';
      const isMC = currentType.includes('객관식') || (currentQuestion?.options && currentQuestion.options.length > 0);
      
      if (isMC) {
        // 객관식 -> 주관식(주관식 OR 칸채우기)으로 변경
        const subjs = ['주관식 (개요)', '주관식 (공식)', '주관식 (표채우기)'];
        targetType = subjs[Math.floor(Math.random() * subjs.length)];
      } else if (currentType.includes('주관식')) {
        // 주관식 -> 객관식으로 변경
        targetType = '객관식 (4지선다)';
      } else {
        // fallback
        if (questionIdx === 0) targetType = '주관식 (개요)';
        else if (questionIdx === 1) targetType = '주관식 (공식)';
        else targetType = '객관식 (4지선다)';
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
  '- "tableData": 표의 데이터를 구조화한 객체. headers(열 제목 배열)와 rows(각 행의 셀 데이터 배열)를 포함합니다.\n' +
  '  * headers의 비교 대상 열 제목은 "비교대상 A" 같은 추상 명칭이 아니라, 토픽에서 도출된 **구체적인 실제 비교 대상명(예: "소일네일링(Soil Nailing)", "어스앵커(Earth Anchor)")**을 기재하십시오.\n' +
  '  * 🚨 **[구분 항목(행 제목) 명확화 원칙]**: 구분 항목(rows 첫째 열)은 그것만 읽어도 ①무슨 토픽/주제 비교인지, ②어떤 답을 써야 하는지 100% 확신할 수 있어야 합니다. 해당 비교 대상의 고유한 공학적 특성을 직접 언급하십시오. ❌ 나쁜 예(범용적): "보강 효과", "지지 메커니즘", "설계 핵심 변수" → ✅ 좋은 예(토픽 특화): "네일/앵커체 인장력 전달 및 선행 긴장 도입 여부", "굴착면 수동저항 vs 정착부 능동긴장의 보강 원리 차이"\n' +
  '  * 구분 컬럼을 제외한 내부는 전부 입력 토큰([INPUT_1], [INPUT_2] 등)으로 비워두십시오.\n' +
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
        typeRequirement = BT + '[주관식 (단답형)] 유형으로 생성하십시오:\n' +
  '- 목적: 구체적인 실무 문제 상황이나 공학적 개념에 대해 서술형으로 묻고 1줄짜리 명확한 답을 요구하는 질문.\n' +
  '- "type" 값: 반드시 "주관식 (단답형)"\n' +
  '- "question": 토픽과 관련된 중요 이론이나 실무 시나리오에 대해 묻는 질문.\n' +
  '- "answer": 핵심 키워드가 **강조**된 1줄 서술형 모범답안 (최소 15자에서 최대 30자 내외).\n' +
  '- "explanation": 답안에 대한 논리적이고 전문적인 상세 해설.' + BT;
        formatRequirement = BT + '{\n' +
  '  "type": "주관식 (단답형)",\n' +
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
  '   - **[핵심 관통 질문 원칙]**: 해당 토픽의 가장 본질적인 공학적 메커니즘, 거동 원리, 설계 판단 근거, 또는 현장 적용 시 발생하는 핵심 문제를 관통하는 질문을 구성하십시오.\n' +
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

${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
- 마크다운 블록 (\`\`\`json) 등 불필요한 설명은 제거하고 오직 순수 JSON 객체만 반환하십시오.

[응답 JSON 포맷]:
${formatRequirement}
`;

      const responseText = await callLLMWithFailover(null, prompt, null, 'question');
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

      return res.json({
        question: healQuizQuestionObject({
          ...parsedQuestion,
          question: cleanQuizQuestion(parsedQuestion.question)
        }),
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
      
      const isMC = currentType.includes('객관식') || (currentQuestion?.options && currentQuestion.options.length > 0);
      
      if (isMC) {
        qType = '주관식';
        const subtypes = ['개요', '공식', '서술', '표채우기', '단답형'];
        qSubtype = subtypes[Math.floor(Math.random() * subtypes.length)];
      } else {
        qType = '객관식';
        qSubtype = '';
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
  '- "tableData": 표 데이터 객체. headers 비교 대상 열은 "공법 A" 같은 추상 명칭 대신 **토픽에서 도출된 실제 비교 대상명(예: "소일네일링", "어스앵커")**을 기재하십시오.\n' +
  '  * 🚨 구분 항목(행 제목)은 그것만 읽어도 어떤 답을 써야 하는지 100% 확신할 수 있도록 구체적으로 작성하십시오. (❌ "보강 효과" → ✅ "보강재의 인장력 전달 메커니즘 및 변위 억제 효과")\n' +
  '  * 구분 컬럼을 제외한 내부는 전부 입력 토큰([INPUT_1], [INPUT_2] 등)으로 비워두십시오.\n' +
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
          typeRequirement = BT + '[주관식 단답형 유형]으로 생성하십시오:\n' +
  '- "type": "주관식"\n' +
  '- "subtype": "단답형"\n' +
  '- "question": 구체적인 실무 문제점/시나리오를 지문으로 제시하고 해결책/대안을 요구하는 질문\n' +
  '- "answer": 핵심 키워드 강조가 들어간 1줄 서술형 모범답안\n' +
  '- "concept": 핵심 개념 1줄 요약' + BT;
          formatRequirement = BT + '{\n' +
  '  "type": "주관식",\n' +
  '  "subtype": "단답형",\n' +
  '  "question": "구체적인 실무 시나리오 질문...",\n' +
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

${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
- 추가 설명 텍스트 없이 오직 순수 JSON 데이터만 반환하십시오.

[JSON 포맷]:
${formatRequirement}
`;

      const responseText = await callLLMWithFailover(null, prompt, null, 'question');
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
      return res.json({
        question: healQuizQuestionObject({
          ...parsedQuestion,
          topic_id: finalTopicId ? Number(finalTopicId) : null,
          question: cleanQuizQuestion(parsedQuestion.question)
        }),
        isFallback: false
      });
    } else {
      return res.status(400).json({ error: '올바르지 않은 모드(mode)입니다.' });
    }
  } catch (error) {
    console.error('Error in question regeneration route:', error);
    res.status(500).json({ error: error.message || '서버 오류로 단일 문제를 재생성하지 못했습니다.' });
  }
});

// 6-6. Interactive Question Adjustment API based on user feedback
app.post('/api/question/adjust', async (req, res) => {
  const { mode, topicId, currentQuestion, questionIdx, userFeedback } = req.body;

  if (!userFeedback || !userFeedback.trim()) {
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
        const isHtml = topic.pdf_name && (
          topic.pdf_name.toLowerCase().endsWith('.html') || 
          topic.pdf_name.toLowerCase().endsWith('.htm') || 
          isBufferHtml(topic.pdf_data)
        );
        if (isHtml) {
          try {
            const rawHtml = decodeHtmlBuffer(topic.pdf_data);
            fileText = htmlToPlainText(rawHtml);
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
        fileText = smartTruncate(fileText, 25000);
      }

      // targetType 결정
      let targetType = '객관식 (4지선다)';
      if (questionIdx === 0) targetType = '주관식 (개요)';
      else if (questionIdx === 1) targetType = '주관식 (공식)';

      let typeRequirement = '';
      let formatRequirement = '';
      if (targetType === '주관식 (개요)') {
        const coreSubject = getCoreSubjectFromTitle(topic.title);
        typeRequirement = `[1번 문제] 주관식 (개요) 유형으로 생성하십시오:
- 목적: 토픽의 핵심 정의(개요)를 명확하고 짜임새 있게 묻는 질문.
- "type" 값: 반드시 "주관식 (개요)"
- "question": 제공된 본문 텍스트 전체를 아우를 수 있는 핵심 공학적 대주제(대제목)를 도출하고, 그 주제에 관한 개요, 원리, 개념적 정의를 깊이 있게 묻는 자연스럽고 전문적인 지문(서술형 질문 문장)을 직접 작성하십시오. 토픽 제목을 단순히 그대로 적용하거나 획일화된 고정 템플릿(예: "~의 핵심 개념, 정의, 원리 등을 설명하는 키워드를 입력하세요")을 사용하는 것을 엄격히 금지합니다.
- "concept": 질문에 정확히 부합하며, 최소 4줄에서 최대 6줄 사이의 분량으로 아주 전문적이고 직관적인 개요 및 개념 설명을 서술하십시오. 또한, 이 설명 내에서 채점관이 식별해야 할 핵심 공학적 키워드들은 반드시 역슬래시 없이 일반 마크다운 강조 기호인 **키워드** 형태로 감싸서 표현해 주십시오. (예: **숏크리트 두께**, **지반 압력** 등)
- "formula": 반드시 빈 문자열 ""
- "structure": 위 formula에서 사용된 각 기호의 정의를 장황하지 않게 줄바꿈(\n)으로 최소한의 명사형 위주로 간단히 작성. (예: "- $t$: 숏크리트 두께\n- $P$: 지반압")`;
        formatRequirement = `{
  "type": "주관식 (개요)",
  "question": "토픽의 기본 정의와 핵심 개념을 묻는 질문 내용",
  "concept": "핵심 키워드가 **강조**된 4~6줄 분량의 개요 설명 답변",
  "formula": "",
    "structure": ""
}`;
      } else if (targetType === '주관식 (공식)') {
        typeRequirement = `[2번 문제] 주관식 (공식) 유형으로 생성하십시오:
- 목적: 토픽에 적용되는 가장 대표적이고 단순한 공식만 묻는 질문.
- "type" 값: 반드시 "주관식 (공식)"
- "question": 토픽을 대표하는 가장 핵심적인 공식의 공식명칭 자체나 핵심 질문 문구만 간결하게 작성하십시오. 뒤에 사족은 붙이지 말고 핵심 명사형 공식 제목만 구성해 주십시오.
- "concept": 공식에 대한 1줄짜리 매우 컴팩트한 요약 설명.
- "formula": 오직 대표 LaTeX 공식 1개만 순수하게 작성. 문자열이나 설명 기호는 절대 넣지 마십시오. (예: "$t = \frac{P - 2C \sin\varphi}{\gamma \tan\varphi + \frac{2S}{D}}$")
- "structure": 위 formula에서 사용된 각 기호의 정의를 장황하지 않게 줄바꿈(\n)으로 최소한의 명사형 위주로 간단히 작성. (예: "- $t$: 숏크리트 두께\n- $P$: 지반압")`;
        formatRequirement = `{
  "type": "주관식 (공식)",
  "question": "토픽의 대표 공식명칭 (사족 배제)",
  "concept": "공식에 대한 한 줄 요약",
  "formula": "$LaTeX공식",
  "structure": "- $기호1$: 간단한 명사형 의미\n- $기호2$: 간단한 명사형 의미"
}`;
      } else {
        typeRequirement = `[객관식 4지선다] 유형으로 생성하십시오:
- "type" 값: 반드시 "객관식 (4지선다)"
- "question": 구체적이고 학술적인 내용 일치 또는 원리 분석 객관식 질문. (⚠️ 중요: 질문에 비교/특성 표가 필요한 경우, 절대 <table> 등 HTML 태그로 표를 직접 작성하지 말고 일반 텍스트로만 질문을 작성한 뒤 아래의 "tableData" 필드에 표 데이터를 객체 구조로 작성하십시오.)
- "tableData": (선택사항) 문제에 표를 표시해야 하는 경우에만 정의하십시오. 주관식 (표채우기)와 마찬가지로 "headers"(열 제목 배열)와 "rows"(각 행 데이터의 배열)를 포함하는 오브젝트여야 합니다. (예: {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적환경", "해수", "담수"]]})
- "options": 4개의 보기 문항으로 구성된 문자열 배열 (반드시 정답 1개와 매력적인 오답 3개로 구성).
- "answer": "options" 배열 안에 있는 값 중 정확히 일치하는 정답 문자열.
- "explanation": 왜 이 보기가 정답이고 다른 보기들이 오답인지에 대한 논리적이고 전문적인 상세 해설.`;
        formatRequirement = `{
  "type": "객관식 (4지선다)",
  "question": "질문 내용",
  "tableData": null,
  "options": ["보기 1", "보기 2", "보기 3", "보기 4"],
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

      const responseText = await callLLMWithFailover(null, prompt, null, 'question');
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

      return res.json({
        question: healQuizQuestionObject({
          ...parsedQuestion,
          topic_id: finalTopicId,
          question: cleanQuizQuestion(parsedQuestion.question)
        })
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

      const responseText = await callLLMWithFailover(null, prompt, null, 'question');
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

      return res.json({
        question: healQuizQuestionObject({
          ...parsedQuestion,
          topic_id: finalTopicId,
          question: cleanQuizQuestion(parsedQuestion.question)
        })
      });
    } else {
      return res.status(400).json({ error: '올바르지 않은 모드(mode)입니다.' });
    }
  } catch (error) {
    console.error('Error in question adjust route:', error);
    res.status(500).json({ error: error.message || '서버 오류로 문제를 조정하지 못했습니다.' });
  }
});

// 6-1. Comprehensive Exam: Generate 70 questions from ALL topics via Gemini (5문항 분할 배치 최적화 버전)
app.post('/api/exam/all', async (req, res) => {
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
   - 주관식 (type: "주관식", subtype: "표채우기"): 1문제 (질문에는 비교/특성 표가 필요한 공학적 분석 지식을 물어보며, 아래 "tableData" 필드에 <table> 태그 대신 표 데이터 객체 구조를 채워넣는 칸채우기 주관식 문제)
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
4. 소스 텍스트의 숨겨진 공학적 개념과 실무 기전을 포착하여 고품격 질문을 던지십시오.

[환각 방지 철칙 (Anti-Hallucination Constraints)]:
1. 제공된 소스 문서 텍스트(<Source_Document>) 내에 명시적 수치, 허용 안전율, 설계기준(KDS/KCS) 조항 번호나 공식이 없는 경우, 임의로 수식을 유도하거나 외부 시방서 수치 한계를 날조(Hallucination)하지 마십시오.
2. 문서 범위를 벗어나는 역학적 수치나 비물리적 수치(예: 내부마찰각 60도 이상 등)를 창작하여 모순을 발생시키면 안 됩니다. 수치가 부족하다면 정량 계산 문제 출제를 즉시 우회하고 개념 이해형 문제로 대체하십시오.

${LATEX_PROMPT_INSTRUCTIONS}
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
        const rawText = await callLLMWithFailover(null, batchPrompt, null, 'question');
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

    console.log(`[종합평가 출제 완료] 총 ${finalQuestions.length}문항이 성공적으로 준비되었습니다.`);
    const healedFinalQuestions = finalQuestions.map(q => healQuizQuestionObject(q));
    res.json({ questions: healedFinalQuestions, total: healedFinalQuestions.length, topicCount: topics.length });

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
4. 소스 자료에 존재하는 구체적인 수식, 기호, 이론유도 논리, 토픽 내용만을 결합하여 학술적이고 깊이 있는 문제를 만드십시오.

[환각 방지 철칙 (Anti-Hallucination Constraints)]:
1. 제공된 소스 문서 텍스트(<Source_Document>) 내에 명시적 수치, 허용 안전율, 설계기준(KDS/KCS) 조항 번호나 공식이 없는 경우, 임의로 수식을 유도하거나 외부 시방서 수치 한계를 날조(Hallucination)하지 마십시오.
2. 문서 범위를 벗어나는 역학적 수치나 비물리적 수치(예: 내부마찰각 60도 이상 등)를 창작하여 모순을 발생시키면 안 됩니다. 수치가 부족하다면 정량 계산 문제 출제를 즉시 우회하고 개념 이해형 문제로 대체하십시오.

${LATEX_PROMPT_INSTRUCTIONS}
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

    res.json({ questions: finalQuestions });

  } catch (err) {
    console.error('Exam additional route error:', err);
    res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
});



// 6-2. Comprehensive Exam: Generate Detailed Answer for a specific question
app.post('/api/exam/detailed-answer', async (req, res) => {
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
    if (!hasAnyAiKey) return res.status(400).json({ error: '등록된 AI API 키가 존재하지 않습니다.' });

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
      const responseText = await callLLMWithFailover(null, prompt);
      const healedText = healLatexFormulas(responseText.trim()); // 대화 수식 정정 결합
      res.json({ text: healedText });
    } catch (err) {
      console.error('Detailed answer route error:', err);
      res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
    }
  } catch (err) {
    console.error('Detailed answer route error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 6-2.5. Generate Hint for a Question
app.post('/api/hint', async (req, res) => {
  try {
    const { questionText } = req.body;
    if (!questionText) {
      return res.status(400).json({ error: '질문(문제) 텍스트가 제공되지 않았습니다.' });
    }

    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY
    );
    if (!hasAnyAiKey) return res.status(400).json({ error: '등록된 AI API 키가 존재하지 않습니다.' });

    const systemInstruction = `당신은 대한민국 기술사 시험 전문 튜터입니다.
수험생이 풀고 있는 주관식 또는 객관식 문제에 대해 **매우 쉽고 직관적이며 간단한 힌트**를 한 문단(3줄 이내)으로 제공해 주십시오.

[지침]:
1. 복잡한 공식이나 유도 과정을 설명하지 말고, 이 문제를 해결하기 위해 가장 핵심적으로 생각해야 하는 개념이나 물리적 거동을 일상적이고 직관적인 비유로 설명하십시오.
2. 수험생이 스스로 문제를 풀 수 있도록 유도해야 하며, 직접적인 해답이나 최종 정답 수치를 제공해서는 절대 안 됩니다.
3. 친절하고 부드러운 튜터의 말투를 사용하십시오.
${ENGINEERING_STANDARDS}`;
    const userPrompt = `다음 문제에 대한 쉽고 직관적인 힌트를 간단히 적어주세요:\n\n[문제 본문]\n${questionText}`;
    
    const responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'question');
    const healedText = healLatexFormulas(responseText);
    res.json({ hint: healedText });
  } catch (err) {
    console.error('Hint generation error:', err);
    res.status(500).json({ error: err.message || '힌트를 생성하는 데 실패했습니다.' });
  }
});

// 6-3. Freeform Chat Search
app.post('/api/chat', async (req, res) => {
  try {
    const { history, message, image } = req.body;
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
      const responseText = await callLLMWithFailover(systemInstruction, structuredPrompt, image, 'tutor');
      const healedText = healLatexFormulas(responseText); // AI 튜터 렌더링 깨짐 치유 적용
      res.json({ text: healedText });
    } catch (err) {
      console.error('Chat route error:', err);
      res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
    }
  } catch (err) {
    console.error('Chat route error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
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
    res.json(healed);
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
}`;

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
          structure: structure // structure는 하단에서 filterStructureLines에 의해 별도 정제되므로 그대로 유지 가능합니다.
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
          title: fallbackTitle,
          concept: fallbackConcept,
          structure: fallbackStructure
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
        title: fallbackTitle,
        concept: fallbackConcept,
        structure: fallbackStructure
      });
    }
  } catch (err) {
    console.error('Formula suggest title route error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
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

    let fileText = '';
    if (topic.pdf_data) {
      const isHtml = topic.pdf_name && (
        topic.pdf_name.toLowerCase().endsWith('.html') || 
        topic.pdf_name.toLowerCase().endsWith('.htm') || 
        isBufferHtml(topic.pdf_data)
      );
      if (isHtml) {
        try {
          const rawHtml = decodeHtmlBuffer(topic.pdf_data);
          fileText = htmlToPlainText(rawHtml);
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
    } else {
      fileText = '수기로 등록한 토픽이며 첨부된 보고서 파일이 없습니다.';
    }

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
app.get('/api/topics/:id/pdf', async (req, res) => {
  const topicId = req.params.id;

  try {
    const topicSql = `SELECT pdf_name, pdf_data FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(topicSql, [topicId]);

    if (!topic || !topic.pdf_data) {
      return res.status(404).send('첨부된 PDF/HTML 원본 파일을 찾을 수 없습니다.');
    }

    const isHtml = topic.pdf_name && (
      topic.pdf_name.toLowerCase().endsWith('.html') || 
      topic.pdf_name.toLowerCase().endsWith('.htm') || 
      isBufferHtml(topic.pdf_data)
    );
    if (isHtml) {
      // Decode HTML buffer cleanly and stream it natively with UTF-8 encoding
      let htmlContent = decodeHtmlBuffer(topic.pdf_data);
      // Remove any script tag containing polyfill.io to prevent malicious loads and credential prompts
      htmlContent = htmlContent.replace(/<script\b[^>]*?src=["']?[^"'>]*?polyfill\.io[^"'>]*?["']?[^>]*?>([\s\S]*?<\/script>)?/gi, '<!-- polyfill removed -->');
      
      const responsiveStyle = `
<style>
@media (max-width: 768px) {
  html, body {
    margin: 0 !important;
    padding: 8px !important;
    width: 100% !important;
    box-sizing: border-box !important;
    background: #ffffff !important;
  }
  div, section, article, table, form, .container, .page, .wrapper, .section, .WordSection1, #page-container, #sidebar, #content, [class*="page"], [id*="page"], [class*="container"], [id*="container"], [class*="wrapper"] {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin: 0 auto !important;
    padding: 4px !important;
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
    left: auto !important;
    top: auto !important;
    transform: none !important;
    height: auto !important;
  }
  img, svg, table {
    max-width: 100% !important;
    height: auto !important;
  }
  body {
    overflow-x: hidden !important;
  }
}
</style>
`;
      htmlContent = htmlContent + responsiveStyle;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(htmlContent);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
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
      if (data && Array.isArray(data.questions)) {
        data.questions = data.questions.map(q => healQuizQuestionObject(q));
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
    // DELETE + INSERT (모든 DB 호환 UPSERT)
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', ['exam_session']);
    await dbQuery.run(
      'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ['exam_session', value]
    );
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

// POST /api/session/review → 복습 문제 세트 영구 저장
app.post('/api/session/review', async (req, res) => {
  try {
    await ensureSessionTable();
    const { topicId, scheduleId, questions, selectedAnswers, revealedQuestions, tableAnswers, tableGradingResults, tutorAnswers, tutorInputText, chatHistory, savedQuizScroll } = req.body;
    if (!topicId || !questions) {
      return res.status(400).json({ error: '필수 인자가 누락되었습니다.' });
    }
    const key = scheduleId && scheduleId !== '9999' && scheduleId !== 'null' && scheduleId !== 'undefined'
      ? `review_questions_schedule_${scheduleId}`
      : `review_questions_topic_${topicId}`;
    const value = JSON.stringify({
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
    
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
    await dbQuery.run(
      'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );
    res.json({ ok: true });
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
    const scheduleId = req.query.scheduleId;
    const key = scheduleId && scheduleId !== '9999' && scheduleId !== 'null' && scheduleId !== 'undefined'
      ? `review_questions_schedule_${scheduleId}`
      : `review_questions_topic_${topicId}`;
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/session/review/topic error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/completed-review/:scheduleId → 특정 복습 회차의 저장된 풀이 문제, 객관식 마크 및 주관식 열람 이력 반환
app.get('/api/session/completed-review/:scheduleId', async (req, res) => {
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
        `SELECT s.id, s.topic_id, s.review_round, t.title, t.keywords, t.pdf_name 
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
            isReadOnly: true
          }
        });
      }
    } else if (key.startsWith('review_questions_schedule_')) {
      const scheduleId = parseInt(key.replace('review_questions_schedule_', ''), 10);
      const sched = await dbQuery.get(
        `SELECT s.id, s.topic_id, s.review_round, t.title, t.keywords, t.pdf_name 
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
            isReadOnly: false
          }
        });
      }
    } else if (key.startsWith('review_questions_topic_')) {
      const topicId = parseInt(key.replace('review_questions_topic_', ''), 10);
      const topicObj = await dbQuery.get(`SELECT id, title, keywords, pdf_name FROM topics WHERE id = ?`, [topicId]);
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
            isReadOnly: false
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

  if (!question || !options || !Array.isArray(options) || options.length !== 4) {
    return res.status(400).json({ error: '유효하지 않은 객관식 문제 정보입니다.' });
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

    const responseText = await callLLMWithFailover(null, prompt, null, 'option-explanation');
    res.json({ text: responseText.trim() });
  } catch (err) {
    console.error('Error generating option explanation:', err);
    res.status(500).json({ error: 'AI 보기별 분석 해설을 생성하지 못했습니다.' });
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
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', ['formula_questions']);
    await dbQuery.run(
      'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ['formula_questions', value]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/formula error:', err);
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
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', ['answersheet_questions']);
    await dbQuery.run(
      'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ['answersheet_questions', value]
    );
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
@media (max-width: 768px) {
  html, body {
    margin: 0 !important;
    padding: 6px !important; /* Minimized padding from 8px to 6px */
    width: 100% !important;
    max-width: 100vw !important;
    box-sizing: border-box !important;
    background: #ffffff !important;
    overflow-x: hidden !important; /* Crucial: Lock horizontal scroll on page level */
  }
  div, section, article, form, .container, .page, .wrapper, .section, .WordSection1, #page-container, #sidebar, #content, [class*="page"], [id*="page"], [class*="container"], [id*="container"], [class*="wrapper"] {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin: 0 auto !important;
    padding-top: 4px !important;
    padding-bottom: 4px !important;
    padding-left: 0 !important;  /* Crucial: Collapse horizontal padding accumulation */
    padding-right: 0 !important; /* Crucial: Collapse horizontal padding accumulation */
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
    left: auto !important;
    top: auto !important;
    transform: none !important;
    height: auto !important;
    box-sizing: border-box !important;
  }
  img, svg, table, pre, code {
    max-width: 100% !important;
    height: auto !important;
  }
  /* Force math formulas and tables to scroll horizontally inside the locked viewport */
  .katex-display, table, pre, code {
    overflow-x: auto !important;
    overflow-y: hidden !important;
    box-sizing: border-box !important;
  }
  .katex-display {
    padding: 0.5em 8px !important;
  }
  /* Custom elegant thin dark scrollbars for light background */
  .katex-display::-webkit-scrollbar,
  table::-webkit-scrollbar,
  pre::-webkit-scrollbar {
    height: 5px !important;
    width: 5px !important;
    display: block !important;
  }
  .katex-display::-webkit-scrollbar-track,
  table::-webkit-scrollbar-track,
  pre::-webkit-scrollbar-track {
    background: transparent !important;
  }
  .katex-display::-webkit-scrollbar-thumb,
  table::-webkit-scrollbar-thumb,
  pre::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15) !important;
    border-radius: 9999px !important;
    border: none !important;
  }
  .katex-display::-webkit-scrollbar-thumb:hover,
  table::-webkit-scrollbar-thumb:hover,
  pre::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.3) !important;
  }
  body {
    overflow-x: hidden !important;
  }
}
</style>
`;
      htmlContent = htmlContent + responsiveStyle;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(htmlContent);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
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
    const topic = await dbQuery.get('SELECT title, pdf_name, pdf_data FROM topics WHERE id = ?', [topicId]);
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
        pdf_name: pdfName
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


async function startServer() {
  try {
    await initDatabase();
    console.log('Database schema initialization completed.');
    await migrateSpacedIntervals();
    await healPendingSchedules();
    await backfillPastScheduleScores();
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
    });
  } catch (err) {
    console.error('Failed to start application server listener:', err);
    process.exit(1);
  }
}

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
    await migrateSpacedIntervals();
    await healPendingSchedules();
    await backfillPastScheduleScores();
  }).catch(dbErr => {
    console.error('CRITICAL WARNING: Database schema initialization failed on Vercel:', dbErr.message);
    global.dbInitError = dbErr.message;
  });
}
// Trigger redeployment to apply absolute path fixes and BOM-less UTF-8 configuration.
