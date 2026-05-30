import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initDatabase, dbQuery } from './database.js';
import { generateFallbackQuestions as generateFallbackQuestionsModule } from './fallback_generator.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Helper: Extract JSON array from string robustly
function extractJsonArray(str) {
  if (!str) return null;
  const startIdx = str.indexOf('[');
  const endIdx = str.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonSub = str.substring(startIdx, endIdx + 1);
    try {
      return JSON.parse(jsonSub);
    } catch (e) {
      console.warn('Failed parsing extracted JSON substring, trying aggressive cleanup:', e);
      const cleanSub = jsonSub
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .trim();
      try {
        return JSON.parse(cleanSub);
      } catch (e2) {
        console.error('Aggressive JSON cleanup failed:', e2);
        return null;
      }
    }
  }
  return null;
}

/**
 * 5월 24일 검증 완료된 단일 키 기반 3단계 모델 폴백 시스템 복원
 * 모델 순서: gemini-3.5-flash → gemini-2.5-flash → gemini-2.0-flash
 */
async function callLLMWithFailover(systemInstruction, userPrompt) {
  const geminiApiKey = process.env.GEMINI_API_KEY || 
                       process.env.GEMINI_API_KEY_SECONDARY || 
                       process.env.GEMINI_API_KEY_TERTIARY || 
                       '';
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY가 설정되어 있지 않습니다.');
  }

  const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  const genAI = new GoogleGenerativeAI(geminiApiKey);

  let lastError = null;

  for (const modelName of MODELS) {
    try {
      console.log(`[Gemini 시도] 모델: ${modelName}`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction || undefined
      });
      const result = await model.generateContent(userPrompt);
      const text = result.response.text().trim();
      if (text) {
        console.log(`[Gemini 성공] 모델: ${modelName}`);
        return text;
      }
    } catch (err) {
      console.warn(`[Gemini 실패] ${modelName}: ${err.message?.substring(0, 120)}`);
      lastError = err;
    }
  }

  throw lastError || new Error('모든 Gemini 모델 호출에 실패했습니다.');
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

// Helper: Extract clean plain text from HTML
function htmlToPlainText(html) {
  if (!html) return '';
  // 1. Remove script and style tags and their contents
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // 2. Replace common block elements with newlines/spaces to maintain layout structure
  text = text.replace(/<\/p>|<\/div>|<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/td>|<\/th>/gi, '   ');

  // 3. Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 4. Unescape common HTML entities
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

  // 5. Collapse excessive empty lines and whitespace but keep paragraphs
  text = text.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n\n');
  
  return mergeVerticalText(text);
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
    question: `싱글쉘 및 NATM 공법의 숏크리트 소요 두께를 설계하는 대표적인 Rabcewicz 공식을 쓰고, 각 기호의 정의를 서술하시오.`,
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
    question: `어스앵커 설계 시 극한 인장력을 산정하는 대표적인 기본 설계 공식을 쓰고, 각 기호의 정의를 서술하시오.`,
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
    question: `프란틀 공식에 지반 자체의 자중(γ)을 더해 실무에서 가장 널리 쓰이는 테르자기(Terzaghi)의 극한 지지력 공식을 쓰고, 각 기호의 정의를 서술하시오.`,
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
    question: `샌드매트 설계 시 시공장비의 접지압과 지반 점착력을 고려한 장비 주행성 확보(전단파괴 방지) 최소 소요 두께(H) 산정 공식을 쓰고, 각 기호의 정의를 서술하시오.`,
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
    question: `평사투영망 작도 시 불연속면의 '경사각(Dip, \\alpha)'을 구의 중심을 지나는 투영면 상에 극점(Pole)으로 기하학적으로 변환하는 투영 공식(r)을 쓰고, 각 기호의 정의를 서술하시오.`,
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
    question: `락볼트 인발시험 설계 시 적용하는 락볼트 최대 인발 저항력(P)과 유효 정착 길이(L) 및 허용 부착 전단 강도(\\tau_{allow})의 기하학적 한계 관계 공식을 쓰고, 각 기호의 정의를 서술하시오.`,
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
      explanation: "락볼트 인발시험 시 하중을 점진적으로 가하면서 그때마다 발생하는 볼트의 인발 변위량(신장량)을 계측하여 '하중-변위 곡선(Load-Displacement Curve)'을 작성해 정착 성능 및 변형 능력을 분석합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `현장 락볼트 인발시험 시 가해주는 최대 시험 하중(재하 기준)의 보편적인 공학적 품질 판정 기준으로 가장 적절한 것은?`,
      options: shuffleArray([
        "설계인발력(통상 10~15톤 내외) 이상을 확실히 도달 및 지지하는지 검증한다.",
        "락볼트 강재가 우주선 인장 파괴 한계 하중인 1000톤에 도달할 때까지 파괴 재하한다.",
        "하중을 전혀 가하지 않고 손으로 흔들어서 강도를 오감 판정한다.",
        "설계 지압력의 10% 미만의 극미한 미동 하중만 순간적으로 가하고 해제한다."
      ]),
      answer: "설계인발력(통상 10~15톤 내외) 이상을 확실히 도달 및 지지하는지 검증한다.",
      explanation: "인발시험 시 락볼트가 설계 조건상의 허용 지지력을 만족하는지 검증하는 것이 목적이므로, 설계인발력(현장별 통상 10~15톤 내외 또는 설계 하중의 1.2배 이상)까지 하중을 가해 버티는지 판정합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `전면접착식 시멘트 그라우팅 락볼트 시공 시 충전재로 널리 쓰이는 시멘트 페이스트(Cement Paste)의 부착 강도 및 워커빌리티를 확보하기 위한 가장 적합한 물-시멘트비(W/C) 범위는?`,
      options: shuffleArray([
        "W/C = 35% ~ 45% 내외",
        "W/C = 90% ~ 100% 내외 (완전 물 상태)",
        "W/C = 5% ~ 10% 내외 (완전 건조 가루 상태)",
        "시멘트를 섞지 않고 순수한 지하수만 주입하는 것이 최적이다."
      ]),
      answer: "W/C = 35% ~ 45% 내외",
      explanation: "부착 강도 극대화와 적절한 그라우트 주입성(압송성)을 동시에 만족시키기 위해 락볼트 충전재의 물-시멘트비는 일반적으로 35% ~ 45% 범위 내외의 걸쭉한 슬러리 상태로 배합 설계합니다."
    },
    {
      type: '객관식 (4지선다)',
      question: `현장 락볼트 인발시험 진행 도중, 설계 지지력에 미치지 못하고 볼트가 맥없이 미끄러져 빠져나오는 시공 불량 요인으로 가장 합리적이지 않은 진술은?`,
      options: shuffleArray([
        "천공 구멍 내부의 암분(가루) 청소를 불량하게 하여 그라우트 부착을 방해한 경우",
        "시멘트 페이스트 주입량이 부족하여 구멍 상부에 공극(Void)이 다량 형성된 경우",
        "그라우트 재료가 규정된 시간 동안 충분히 경화(양생)되지 않은 채 조기 인발을 시행한 경우",
        "시추 구멍 내부에 그라우트(시멘트 충전재)가 빈틈없이 너무 꽉 찬 충만 밀실 상태인 경우"
      ]),
      answer: "시추 구멍 내부에 그라우트(시멘트 충전재)가 빈틈없이 너무 꽉 찬 충만 밀실 상태인 경우",
      explanation: "그라우트가 시추공 내에 빈틈없이 밀실하게 가득 차서 충전율이 100%에 가까울수록 볼트 정착 강도는 극대화됩니다. 따라서 이는 시공 불량 원인이 아니라 최적의 시공 상태입니다."
    }
  ];

  return [q1, q2, ...mcQuestions];
}

// Helper function to generate technical and high-quality PE questions locally (Dynamic domain-agnostic fallback)
function generateFallbackQuestions(title, keywords, fileText = '') {
  return generateFallbackQuestionsModule(title, keywords, fileText);
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

    // 망각주기 스케줄링 알고리즘: 등록일 기준 [+1일, +4일, +7일, +14일, +35일, +60일]
    const intervals = [1, 4, 7, 14, 35, 60];
    
    const insertScheduleSql = `
      INSERT INTO schedules (topic_id, review_round, planned_date, status)
      VALUES (?, ?, ?, 'pending')
    `;

    for (let i = 0; i < intervals.length; i++) {
      const round = i + 1;
      const plannedDate = getLocalDateString(createdDate, intervals[i]);
      await dbQuery.run(insertScheduleSql, [topicId, round, plannedDate]);
    }

    res.status(201).json({
      message: '토픽 등록 및 복습 스케줄 생성이 완료되었습니다.',
      topicId: topicId,
      title: title,
      keywords: keywords,
      schedulesCreated: intervals.length
    });
  } catch (error) {
    console.error('Error registering topic and creating schedules:', error);
    res.status(500).json({ error: '서버 오류로 토픽 등록에 실패했습니다.' });
  }
});

// 2. Today's Review Dashboard (Pending reviews due today or overdue)
app.get('/api/dashboard', async (req, res) => {
  const queryDate = req.query.date || getLocalDateString();

  try {
    const sql = `
      SELECT 
        s.id AS schedule_id,
        s.review_round,
        s.planned_date,
        s.status,
        s.completed_at,
        t.id AS topic_id,
        t.title,
        t.keywords,
        t.pdf_name,
        t.created_at
      FROM schedules s
      JOIN topics t ON s.topic_id = t.id
      WHERE s.planned_date <= ? AND s.status = 'pending'
      ORDER BY s.planned_date ASC, t.title ASC
    `;

    const pendingReviews = await dbQuery.all(sql, [queryDate]);
    res.json({
      date: queryDate,
      count: pendingReviews.length,
      reviews: pendingReviews
    });
  } catch (error) {
    console.error('Error fetching dashboard reviews:', error);
    res.status(500).json({ error: '서버 오류로 복습 대시보드를 불러올 수 없습니다.' });
  }
});

// 3. Mark Review Round as Complete
app.post('/api/schedules/:id/complete', async (req, res) => {
  const scheduleId = req.params.id;

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

    // 6회차 이상 복습 완료 시, 장기 보존 복습을 위해 M+1(30일) ~ M+3(90일) 뒤에 다음 회차 복습을 자동으로 추가합니다.
    if (schedule.review_round >= 6) {
      const nextRound = schedule.review_round + 1;
      const nextCheckSql = `SELECT * FROM schedules WHERE topic_id = ? AND review_round = ?`;
      const existingNextSchedule = await dbQuery.get(nextCheckSql, [schedule.topic_id, nextRound]);
      
      if (!existingNextSchedule) {
        const randomDays = 30 + Math.floor(Math.random() * 61); // 30 ~ 90일 후
        const nextPlannedDate = getLocalDateString(new Date(), randomDays);
        
        const insertSql = `
          INSERT INTO schedules (topic_id, review_round, planned_date, status)
          VALUES (?, ?, ?, 'pending')
        `;
        await dbQuery.run(insertSql, [schedule.topic_id, nextRound, nextPlannedDate]);
        console.log(`Auto-created review round ${nextRound} for topic ${schedule.topic_id} planned on ${nextPlannedDate}`);
      }
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
    
    // If the planned date was in the future, bring it back to today so it immediately shows in Today's Review
    if (schedule.planned_date > todayDateStr) {
      newPlannedDate = todayDateStr;
    }

    const updateSql = `
      UPDATE schedules 
      SET status = 'pending', completed_at = NULL, planned_date = ?
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [newPlannedDate, scheduleId]);

    // 6회차 이상 복습이 대기 상태로 리셋될 경우, 뒤이어 자동 생성되었던 다음 회차의 pending 스케줄을 삭제합니다.
    if (schedule.review_round >= 6) {
      const nextRound = schedule.review_round + 1;
      const deleteSql = `
        DELETE FROM schedules 
        WHERE topic_id = ? AND review_round = ? AND status = 'pending'
      `;
      await dbQuery.run(deleteSql, [schedule.topic_id, nextRound]);
      console.log(`Cleaned up auto-created future round ${nextRound} for topic ${schedule.topic_id} due to reset`);
    }

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

// 4. Retrieve All Topics with Spaced Schedules
app.get('/api/topics', async (req, res) => {
  try {
    const sql = `
      SELECT id, title, keywords, pdf_name, created_at
      FROM topics
      ORDER BY created_at DESC
    `;
    const topics = await dbQuery.all(sql);

    const topicsWithSchedules = [];
    for (const topic of topics) {
      const scheduleSql = `
        SELECT id, review_round, planned_date, completed_at, status
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
  const topicId = req.params.id;

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

// Force DB table initialization route
app.get('/api/init-db', async (req, res) => {
  try {
    await initDatabase();
    res.json({ success: true, message: 'DB tables initialized successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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
    hasSecondaryGeminiKey: !!process.env.GEMINI_API_KEY_SECONDARY,
    secondaryKeyLength: process.env.GEMINI_API_KEY_SECONDARY ? process.env.GEMINI_API_KEY_SECONDARY.length : 0,
    hasTertiaryGeminiKey: !!process.env.GEMINI_API_KEY_TERTIARY,
    tertiaryKeyLength: process.env.GEMINI_API_KEY_TERTIARY ? process.env.GEMINI_API_KEY_TERTIARY.length : 0,
    hasClaudeKey: !!process.env.ANTHROPIC_API_KEY,
    claudeKeyLength: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.length : 0,
    hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    openaiKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
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

// 6. AI Review Helper: Generate 3 custom PE-style exam questions
app.post('/api/topics/:id/ai-questions', async (req, res) => {
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
          const rawHtml = topic.pdf_data.toString('utf-8');
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

      if (fileText.length > 10000) {
        fileText = fileText.substring(0, 10000) + '... [텍스트가 너무 길어 중략됨]';
      }
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
      searchTarget.includes('프란틀') || searchTarget.includes('prandtl') || searchTarget.includes('지지력') || searchTarget.includes('bearing') || searchTarget.includes('확대기초') || searchTarget.includes('확대 기초') || searchTarget.includes('얕은기초') || cleanTitle.includes('얕은 기초') || searchTarget.includes('테르자기') || searchTarget.includes('terzaghi') || searchTarget.includes('흙의 거동') || searchTarget.includes('확대기초 아래') || searchTarget.includes('기초 아래 흙') ||
      searchTarget.includes('여굴') || searchTarget.includes('overbreak') || searchTarget.includes('제어발파') || searchTarget.includes('제어 발파') || searchTarget.includes('contour hole') || searchTarget.includes('외곽공') || searchTarget.includes('smooth blasting') || searchTarget.includes('스무드 블라스팅') || searchTarget.includes('스무드블라스팅') || searchTarget.includes('line drilling') || searchTarget.includes('라인 드릴링') || searchTarget.includes('presplitting') || searchTarget.includes('프리스플리팅') || searchTarget.includes('디커플링') || searchTarget.includes('decoupling') ||
      searchTarget.includes('사면안정') || searchTarget.includes('사면 안정') || searchTarget.includes('slope stability') || searchTarget.includes('slope') || searchTarget.includes('사면 붕괴') || searchTarget.includes('사면붕괴') || searchTarget.includes('원호파괴') || searchTarget.includes('평면파괴') || searchTarget.includes('쐐기파괴') || searchTarget.includes('전도파괴') || searchTarget.includes('절편법') || searchTarget.includes('fellenius') || searchTarget.includes('펠레니우스') || searchTarget.includes('bishop') || searchTarget.includes('비숍') ||
      searchTarget.includes('토압') || searchTarget.includes('옹벽') || searchTarget.includes('earth pressure') || searchTarget.includes('retaining wall') || searchTarget.includes('주동토압') || searchTarget.includes('수동토압') || searchTarget.includes('정지토압') || searchTarget.includes('주동 토압') || searchTarget.includes('수동 토압') || searchTarget.includes('정지 토압') || searchTarget.includes('랭킨') || searchTarget.includes('rankine') || searchTarget.includes('쿨롱') || searchTarget.includes('coulomb') ||
      searchTarget.includes('전단강도') || searchTarget.includes('전단 강도') || searchTarget.includes('shear strength') || searchTarget.includes('삼축압축') || searchTarget.includes('삼축 압축') || searchTarget.includes('uu 시험') || searchTarget.includes('cu 시험') || searchTarget.includes('cd 시험') || searchTarget.includes('uu시험') || searchTarget.includes('cu시험') || searchTarget.includes('cd시험') || searchTarget.includes('비배수') || searchTarget.includes('mohr-coulomb') || searchTarget.includes('모어 쿨롱') || searchTarget.includes('모어-쿨롱') ||
      searchTarget.includes('투수') || searchTarget.includes('침투') || searchTarget.includes('보일링') || searchTarget.includes('boiling') || searchTarget.includes('분사현상') || searchTarget.includes('분사 현상') || searchTarget.includes('piping') || searchTarget.includes('파이핑') || searchTarget.includes('seepage') || searchTarget.includes('permeability') || searchTarget.includes('darcy') || searchTarget.includes('다르시') || searchTarget.includes('임계동수경사') || searchTarget.includes('동수경사') || searchTarget.includes('유선망') || searchTarget.includes('flow net') ||
      searchTarget.includes('흙막이') || searchTarget.includes('가설 흙막이') || searchTarget.includes('가설흙막이') || searchTarget.includes('탄소성') || searchTarget.includes('탄소성보') || searchTarget.includes('탄소성보법') || searchTarget.includes('braced wall') || searchTarget.includes('braced_wall') || searchTarget.includes('지반스프링') || searchTarget.includes('지반 스프링') ||
      searchTarget.includes('액상화') || searchTarget.includes('liquefaction') || searchTarget.includes('간극수압') || searchTarget.includes('과잉간극수압') ||
      searchTarget.includes('보상기초') || searchTarget.includes('compensated foundation') || searchTarget.includes('compensated_foundation') || searchTarget.includes('하중 보상') || searchTarget.includes('하중보상');

    if (isCoreTopic) {
      console.log(`[AI Route Interceptor] Precision routed core topic "${topic.title}" to handcrafted expert-grade questions.`);
      const coreQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      return res.json({
        questions: coreQuestions,
        isFallback: false, // Mark false to mimic natural AI generation so UI keeps premium styling
        mode: 'ai-optimized',
        info: 'Handcrafted premium routing bypass'
      });
    }

    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    const forceLocal = req.query.local === 'true';

    // Force local/source-based mode
    if (forceLocal || !hasAnyAiKey) {
      const reason = forceLocal ? '소스 기반 모드로 요청됨' : '등록된 AI API 키 없음';
      console.log(`Generating local fallback questions. Reason: ${reason}`);
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      return res.json({ 
        questions: fallbackQuestions, 
        isFallback: true,
        mode: 'local',
        error: forceLocal ? null : '백엔드 환경변수에 AI API 키가 존재하지 않습니다.'
      });
    }

    const prompt = `
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원입니다.
아래 제공되는 [토픽 제목], [핵심 키워드], 그리고 [첨부파일 본문 텍스트]를 심층 분석하여, 총 10개의 고난도 예상문제를 생성해 주십시오.

[토픽 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}
[첨부파일 본문 텍스트]: ${fileText || '제공되지 않음'}

[출제 요구사항]:
1. 반드시 총 10개의 문제를 다음과 같이 구성하여 출제하십시오:

   [1번 문제] 주관식 (개요):
   - 목적: 토픽의 핵심 정의(개요)만 명확하게 묻는 간결한 질문.
   - "type" 값: 반드시 "주관식 (개요)"
   - "question": 토픽의 핵심 정의와 기본 개념만 묻는 초간결 완성형 질문. (예: "[토픽]의 핵심 정의와 기본 개념을 간략히 서술하시오.")
   - "concept": 질문에 정확히 부합하는 1~2줄 이내의 매우 명료하고 컴팩트한 핵심 정의 및 요약 답변 (절대 길거나 장황하게 쓰지 말 것).
   - "formula": 반드시 빈 문자열 ""
   - "structure": 반드시 빈 문자열 ""

   [2번 문제] 주관식 (공식):
   - 목적: 토픽에 적용되는 가장 대표적이고 단순한 공식만 묻는 질문.
   - "type" 값: 반드시 "주관식 (공식)"
   - "question": 토픽을 대표하는 가장 핵심적인 설계/평가 공식을 제시하고, 각 기호의 정의를 서술하라는 질문. (예: "[토픽]의 대표적인 핵심 공식을 제시하고, 각 기호의 정의를 서술하시오.")
   - "concept": 공식에 대한 1줄짜리 매우 컴팩트한 요약 설명.
   - "formula": 대표 LaTeX 공식과 함께 공식의 각 기호 정의를 절대 장황하지 않게 줄바꿈(\\n)으로 최소한의 명사형 위주로 간단히 작성.
     * 예시 형식:
       $t = \\\\frac{P - 2C \\\\sin\\\\varphi}{\\gamma \\\\tan\\\\varphi + \\\\frac{2S}{D}}$\\n- $t$: 숏크리트 두께\\n- $P$: 지반압\\n- $C$: 점착력\\n- $\\\\varphi$: 내부마찰각\\n- $\\\\gamma$: 단위중량\\n- $S$: 전단강도\\n- $D$: 터널직경
     * 공식과 간단한 각 기호 정의 외에 불필요한 서술형 설명은 일절 배제하고 매우 컴팩트하게 작성하십시오.
   - "structure": 반드시 빈 문자열 ""

   [3번 ~ 10번 문제] 4지선다 객관식:
   - "type" 값: 반드시 "객관식 (4지선다)"
   - 총 8개의 객관식 문제를 채워 전체 10개 문항으로 구성하십시오.

2. 절대 무조건 IT 분야나 소프트웨어 관련 용어(Saga, MSA, CAP 등)를 일괄 주입하지 말고, 토픽 제목과 첨부파일 본문의 실제 전공 학문 분야(예: 토목, 기계, 지반, 수리, 환경 등)에 완벽히 정합된 고급 공학 질문을 출제하십시오.

3. 각 문제의 JSON 속성 요건:
   - 1번 문제 (주관식 (개요)):
     * "question": 완성형 질문.
     * "concept": 1~2줄의 아주 깔끔하고 군더더기 없는 컴팩트한 핵심 정의 답변.
     * "formula": "" (빈 문자열).
     * "structure": "" (빈 문자열).
   - 2번 문제 (주관식 (공식)):
     * "question": 완성형 질문.
     * "concept": 아주 짧은 핵심 공식 요약 (1줄).
     * "formula": LaTeX 공식과 각 기호에 대한 매우 간결하고 컴팩트한 설명 (\\n 구분).
     * "structure": "" (빈 문자열).
   - 3번 ~ 10번 문제 (객관식 4지선다):
     * "question": 구체적이고 학술적인 내용 일치 또는 원리 분석 객관식 질문.
     * "options": 4개의 보기 문항으로 구성된 문자열 배열 (반드시 정답 1개와 매력적인 오답 3개로 구성).
     * "answer": "options" 배열 안에 있는 값 중 정확히 일치하는 정답 문자열.
     * "explanation": 왜 이 보기가 정답이고 다른 보기들이 오답인지에 대한 논리적이고 전문적인 상세 해설.

4. [주관식 답안 컴팩트화 원칙]:
   - 주관식 1번과 2번의 답안(concept, formula)은 구구절절하고 장황한 설명조의 문장을 일절 배제하십시오.
   - 1번 개요는 해당 토픽이 무엇인지를 명확하게 가리키는 1~2줄의 직관적 문장으로만 구성하십시오.
   - 2번 공식은 공식 수식 자체와 각 기호의 직관적 물리 명칭만 아주 짧고 컴팩트하게 나열하여 기재하십시오.

5. 공식이나 수식을 보여줄 때는 반드시 LaTeX 문법 형식을 활용하여 기재하십시오. 인라인 수식은 '$수식$' 형태로, 블록 수식은 '$$수식$$' 형태로 감싸야 합니다.
6. 중요: LaTeX 수식 기호( $ 또는 $$ ) 바로 안쪽에는 절대 공백이 들어가지 않아야 합니다 (예: '$수식$'은 올바르고, '$ 수식 $'과 같이 안쪽에 공백이 있으면 절대 안 됩니다). 또한, LaTeX 수식 바깥쪽 앞뒤로 한글이 올 때는 그 사이에 반드시 공백(띄어쓰기)을 주어 한글과 수식이 달라붙지 않게 처리하십시오. (예: "공식 $T = P \\\\times r$ 은" 이와 같이 수식 바깥쪽 앞뒤 양옆에 한글과의 공백을 확실히 두어 가독성을 확보하십시오.)
7. 중요: JSON 포맷 내에서 LaTeX 수식을 기재할 때, 모든 역슬래시(backslash, \\ 기호)는 반드시 이중 역슬래시(\\\\ 기호)로 이중 이스케이프하여 출력하셔야 JSON 파싱 오류가 발생하지 않습니다. (예: "\\\\frac" 대신 "\\\\frac", "\\\\sin" 대신 "\\\\sin" 과 같이 모든 LaTeX 명령어 기호 앞의 역슬래시를 두 번씩 기재하십시오.)

8. 반드시 아래 지정된 JSON 배열 포맷으로만 정확히 반환하십시오. 마크다운의 '\`\`\`json' 코드 블록이나 추가적인 텍스트 설명은 배제하고 순수한 JSON 데이터만 제공해 주십시오.

[응답 JSON 포맷]:
[
  {
    "type": "주관식 (개요)",
    "question": "토픽의 기본 정의와 핵심 개념을 묻는 질문 내용",
    "concept": "1~2줄 컴팩트 요약 답변",
    "formula": "",
    "structure": ""
  },
  {
    "type": "주관식 (공식)",
    "question": "토픽의 대표 공식과 각 기호의 정의를 서술하라는 질문 내용",
    "concept": "공식에 대한 한 줄 요약",
    "formula": "$LaTeX공식$\\n- $기호1$: 간단한 명사형 의미\\n- $기호2$: 간단한 명사형 의미",
    "structure": ""
  },
  {
    "type": "객관식 (4지선다)",
    "question": "질문 내용",
    "options": ["보기 1", "보기 2", "보기 3", "보기 4"],
    "answer": "정확히 일치하는 정답 보기 텍스트",
    "explanation": "상세한 해설"
  }
  ... (총 10개가 되도록 객관식 계속)
]
`;

      try {
        const geminiApiKey = process.env.GEMINI_API_KEY || 
                             process.env.GEMINI_API_KEY_SECONDARY || 
                             process.env.GEMINI_API_KEY_TERTIARY || 
                             '';
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const QUIZ_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

      let questions = null;
      let lastErr = null;

      for (const modelName of QUIZ_MODELS) {
        try {
          console.log(`[단일토픽퀴즈] 모델 시도: ${modelName}`);
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          const response = await result.response;
          const rawText = response.text().trim();

          try {
            let text = rawText;
            if (text.startsWith('```')) {
              text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
            }
            questions = JSON.parse(text);
          } catch (parseErr) {
            console.warn(`[단일토픽퀴즈] ${modelName} 파싱 재시도:`, parseErr);
            questions = extractJsonArray(rawText);
          }

          if (!questions || !Array.isArray(questions)) {
            throw new Error('Parsed result is not a valid JSON array or empty');
          }

          console.log(`[단일토픽퀴즈] 성공: ${modelName}, ${questions.length}문항`);
          break; // 성공 시 루프 종료
        } catch (modelErr) {
          lastErr = modelErr;
          const isQuota = modelErr.message?.includes('Quota') || modelErr.message?.includes('quota') || modelErr.message?.includes('rate') || modelErr.status === 429;
          if (isQuota) {
            console.warn(`[단일토픽퀴즈] ${modelName} Quota 초과, 다음 모델로 폴백`);
            continue;
          }
          throw modelErr; // Quota 외 오류는 즉시 throw
        }
      }

      if (!questions) {
        throw lastErr || new Error('모든 제미나이 모델 호출 실패');
      }

      res.json({ questions, isFallback: false });
    } catch (aiError) {
      console.error('Gemini API call failed, generating fallbacks:', aiError);
      const isQuota = aiError.message?.includes('Quota') || aiError.message?.includes('quota') || aiError.message?.includes('rate') || aiError.message?.includes('429');
      const errorMsg = isQuota ? 'AI API 일일 사용 한도를 초과했습니다. 임시 문제로 대체됩니다.' : aiError.message;
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      res.json({ questions: fallbackQuestions, isFallback: true, error: errorMsg });
    }
  } catch (error) {
    console.error('Error in AI question generation route:', error);
    res.status(500).json({ error: '서버 오류로 AI 기출문제를 생성하지 못했습니다.' });
  }
});

// 6-1. Comprehensive Exam: Generate 70 questions from ALL topics via Gemini
app.post('/api/exam/all', async (req, res) => {
  try {
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) return res.status(400).json({ error: '등록된 AI API 키가 존재하지 않습니다.' });

    // Fetch all topics with pdf_data
    const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name, pdf_data FROM topics ORDER BY created_at DESC`);
    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: '등록된 토픽이 없습니다. 먼저 학습 자료를 등록해주세요.' });
    }

    // Extract text from each topic (limit per topic to avoid token overflow)
    const topicTexts = [];
    for (const topic of topics) {
      let fileText = '';
      if (topic.pdf_data) {
        const isHtml = topic.pdf_name && (
          topic.pdf_name.toLowerCase().endsWith('.html') ||
          topic.pdf_name.toLowerCase().endsWith('.htm') ||
          isBufferHtml(topic.pdf_data)
        );
        try {
          if (isHtml) {
            fileText = htmlToPlainText(topic.pdf_data.toString('utf-8'));
          } else {
            const parsed = await pdfParse(topic.pdf_data);
            fileText = parsed.text || '';
          }
        } catch (e) { console.warn(`Topic ${topic.id} parse error:`, e.message); }
        fileText = mergeVerticalText(fileText);
        // Limit per topic: 2000 chars to avoid total overflow
        if (fileText.length > 2000) fileText = fileText.substring(0, 2000) + '...[중략]';
      }
      topicTexts.push(`[토픽: ${topic.title}]\n키워드: ${topic.keywords || '없음'}\n${fileText || '소스 없음'}`);
    }

    const combinedText = topicTexts.join('\n\n---\n\n');
    const topicTitles = topics.map(t => t.title).join(', ');
    const randomSeed = Math.floor(Math.random() * 10000);

    const prompt = `
당신은 국가기술자격 기술사 시험 출제위원입니다.
아래 모든 토픽의 소스 자료를 통합하여 정확히 70개의 종합평가 문제를 생성하십시오.
매번 문제 구성을 다르게 출제하십시오 (랜덤 시드: ${randomSeed}).

[평가 범위 토픽 목록]: ${topicTitles}

[통합 소스 텍스트]:
${combinedText}

[출제 규칙]:
1. 총 70문제를 아래 비율로 구성:
   - 주관식 (type: "주관식"): 25문제
     * subtype "개요": 개요/정의/특징을 2~3줄로 서술 (최소 8문제)
     * subtype "공식": 공식·수식·계산식·핵심 구성요소 기술 (최소 6문제)
     * subtype "서술": 메커니즘·원리·비교 설명 (나머지)
   - 객관식 (type: "객관식"): 45문제 (4지선다)
2. 개요·정의·공식을 묻는 문제는 반드시 주관식으로만 출제.
3. 모든 토픽에서 골고루 출제 (각 토픽별 최소 1문제 이상).
4. 전문용어, 수치, 공식을 정확히 사용.
5. 객관식 오답은 그럴듯하게 구성.
6. 공식·수식은 LaTeX 형식 사용 ($수식$).
7. 반드시 순수 JSON 배열만 반환 (마크다운 코드블록 없이).

[JSON 포맷]:
[
  {
    "type": "주관식",
    "subtype": "개요",
    "question": "질문",
    "answer": "2~3줄 모범답안",
    "concept": "핵심 개념 1줄"
  },
  {
    "type": "객관식",
    "question": "질문",
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "answer": "정답 보기 텍스트",
    "explanation": "해설"
  }
  ... (총 70개)
]
`;

    let questions = null;
    try {
      const rawText = await callLLMWithFailover(null, prompt);
      try {
        let text = rawText;
        if (text.startsWith('```')) text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        questions = JSON.parse(text);
      } catch {
        questions = extractJsonArray(rawText);
      }
      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        throw new Error('70문항 파싱 실패');
      }
      res.json({ questions, total: questions.length, topicCount: topics.length });
    } catch (err) {
      console.error('Exam route error:', err);
      const isQuota = err?.message?.includes('Quota') || err?.message?.includes('quota') || err?.message?.includes('rate') || err?.message?.includes('429');
      if (isQuota) {
        return res.status(429).json({ error: 'AI API 일일 사용 한도를 초과했습니다. 내일 다시 시도하거나, 잠시 후 다시 눌러보세요.' });
      }
      res.status(500).json({ error: err.message || '문제 생성 실패' });
    }
  } catch (err) {
    console.error('Exam route error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
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
2. 수식이나 공식이 있다면 반드시 LaTeX 형식($수식$ 또는 $$수식$$)을 사용하십시오.
3. 보기 편한 Markdown 형식(적절한 굵은 글씨, 글머리 기호 등)을 사용하되, 마크다운 코드블록(\`\`\`markdown)으로 전체를 감싸지 말고 바로 텍스트로 출력하십시오.
`;

    try {
      const responseText = await callLLMWithFailover(null, prompt);
      res.json({ text: responseText });
    } catch (err) {
      console.error('Detailed answer route error:', err);
      const isQuota = err?.message?.includes('Quota') || err?.message?.includes('quota') || err?.message?.includes('rate') || err?.message?.includes('429');
      if (isQuota) {
        return res.status(429).json({ error: 'AI API 일일 사용 한도를 초과했습니다.' });
      }
      res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
    }
  } catch (err) {
    console.error('Detailed answer route error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 6-3. Freeform Chat Search
app.post('/api/chat', async (req, res) => {
  try {
    const { history, message } = req.body;
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
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
    structuredPrompt += message;

    try {
      const systemInstruction = "당신은 국가기술자격 기술사 시험을 돕는 전문 튜터입니다. 사용자의 질문에 대해 기술사 시험 수준의 전문 용어를 사용하여 명확하고 구조적으로 답변해주세요. 수식은 LaTeX 형식으로 작성해주세요.";
      const responseText = await callLLMWithFailover(systemInstruction, structuredPrompt);
      res.json({ text: responseText });
    } catch (err) {
      console.error('Chat route error:', err);
      const isQuota = err?.message?.includes('Quota') || err?.message?.includes('quota') || err?.message?.includes('rate') || err?.message?.includes('429');
      if (isQuota) {
        return res.status(429).json({ error: 'AI API 일일 사용 한도를 초과했습니다.' });
      }
      res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
    }
  } catch (err) {
    console.error('Chat route error:', err);
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
          const rawHtml = topic.pdf_data.toString('utf-8');
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
      const htmlContent = decodeHtmlBuffer(topic.pdf_data);
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
    await ensureSessionTable();
    const rows = await dbQuery.all(
      'SELECT value FROM app_session WHERE key = ?',
      ['exam_session']
    );
    if (rows.length > 0 && rows[0].value) {
      res.json({ data: JSON.parse(rows[0].value) });
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
    const { examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll } = req.body;
    const value = JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll });
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

async function startServer() {
  try {
    await initDatabase();
    console.log('Database schema initialization completed.');
    await migrateSpacedIntervals();
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
    });
  } catch (err) {
    console.error('Failed to start application server listener:', err);
    process.exit(1);
  }
}

// Vercel Serverless 환경 대응: Vercel이 아닌 로컬 구동 시에만 포트 리스너(app.listen)를 시작합니다.
export default app;

if (!process.env.VERCEL) {
  startServer();
} else {
  // Vercel 서버리스 환경에서는 데이터베이스 연결 및 테이블 자동 생성을 비동기로 조용히 가동합니다.
  initDatabase().then(async () => {
    console.log('Vercel serverless DB initialization completed.');
    await migrateSpacedIntervals();
  }).catch(dbErr => {
    console.error('CRITICAL WARNING: Database schema initialization failed on Vercel:', dbErr.message);
    global.dbInitError = dbErr.message;
  });
}
