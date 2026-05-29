import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initDatabase, dbQuery } from './database.js';
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
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY가 설정되어 있지 않습니다.');
  }

  const MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];
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
        "p_w = γ_w × H (γ_w: 물의 단위중량, H: 수두)",
        "p_w = γ_w / H",
        "p_w = k × i",
        "p_w = OCR × p_0"
      ]),
      answer: "p_w = γ_w × H (γ_w: 물의 단위중량, H: 수두)",
      explanation: "비배수 터널 라이닝 배면에 작용하는 정수압(Hydrostatic Pressure)은 지하수위 아래에서의 깊이(수두, H)와 물의 단위중량(γ_w)의 곱으로 산정됩니다."
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

// Helper function to generate technical and high-quality PE questions locally (Dynamic domain-agnostic fallback)
function generateFallbackQuestions(title, keywords, fileText = '') {
  const cleanTitle = title.toLowerCase();
  const cleanText = fileText.toLowerCase();

  // Route to Expert Built-in Review Content if matching keyword is detected!
  if (cleanTitle.includes('싱글쉘') || cleanTitle.includes('single shell') || cleanTitle.includes('single_shell') || cleanText.includes('싱글쉘') || cleanText.includes('single shell')) {
    console.log("Routing to Built-in Expert PE Content: Single Shell Tunnel Method");
    return getSingleShellExpertQuestions(title, keywords);
  }

  if (
    cleanTitle.includes('소일내일링') || cleanTitle.includes('소일네일링') || cleanTitle.includes('soil nailing') || cleanTitle.includes('soilnailing') ||
    cleanTitle.includes('어스앵커') || cleanTitle.includes('어스 앵커') || cleanTitle.includes('earth anchor') || cleanTitle.includes('earthanchor') ||
    cleanTitle.includes('앵커') ||
    cleanText.includes('소일내일링') || cleanText.includes('소일네일링') || cleanText.includes('soil nailing') || cleanText.includes('어스앵커') || cleanText.includes('어스 앵커')
  ) {
    return getSoilNailingEarthAnchorExpertQuestions(title, keywords);
  }

  if (cleanTitle.includes('프란틀') || cleanTitle.includes('prandtl') || cleanTitle.includes('지지력') || cleanText.includes('프란틀') || cleanText.includes('prandtl') || cleanText.includes('bearing_capacity')) {
    console.log("Routing to Built-in Expert PE Content: Prandtl's Bearing Capacity Theory");
    return getPrandtlExpertQuestions(title, keywords);
  }

  // Dynamic Content Mining (For unknown topics)
  const features = extractFeaturesFromText(fileText);
  
  // Merge user keywords and extracted keywords
  const userKwList = keywords ? keywords.split(/[,#\s]+/).filter(Boolean) : [];
  const mergedKw = Array.from(new Set([...userKwList, ...features.extractedKeywords])).slice(0, 6);
  if (mergedKw.length === 0) {
    mergedKw.push('핵심 공법');
    mergedKw.push('최적 설계');
    mergedKw.push('안전성');
  }
  const keywordDisplay = mergedKw.join(', ');

  const s0 = features.keySentences[0] || `[${title}]은/는 현대 기술 실무에서 핵심적인 의의와 고유한 엔지니어링 설계를 포함합니다.`;
  const s1 = features.keySentences[1] || `핵심 구성 요소인 ${mergedKw.slice(0, 3).join(', ')}의 상호 메커니즘을 규명하고 최적화하는 것이 성공 요인입니다.`;
  const s2 = features.keySentences[2] || `구축 및 실무 현장 도입 과정의 예상 리스크를 선제 통제하고 설계 안전성 가이드를 정립해야 합니다.`;
  const s3 = features.keySentences[3] || `정량적 물리/수학적 모델식과 개념도 배치를 설계 표준에 준하여 작성해야 합니다.`;

  // Title-based classification (Highest priority)
  const isTitleSoil = cleanTitle.includes('압밀') || cleanTitle.includes('점토') || cleanTitle.includes('전단') || cleanTitle.includes('파괴') || cleanTitle.includes('지지력') || cleanTitle.includes('흙') || cleanTitle.includes('지반') || cleanTitle.includes('clay') || cleanTitle.includes('shear') || cleanTitle.includes('consolidation') || cleanTitle.includes('mohr') || cleanTitle.includes('c-phi') || cleanTitle.includes('c - phi');
  const isTitleHydraulics = cleanTitle.includes('seepage') || cleanTitle.includes('discharge') || cleanTitle.includes('velocity') || cleanTitle.includes('flow') || cleanTitle.includes('permeability') || cleanTitle.includes('투수') || cleanTitle.includes('침투') || cleanTitle.includes('유출') || cleanTitle.includes('수두') || cleanTitle.includes('darcy');
  const isTitleTunnel = cleanTitle.includes('터널') || cleanTitle.includes('tunnel') || cleanTitle.includes('natm') || cleanTitle.includes('암반') || cleanTitle.includes('지보') || cleanTitle.includes('숏크리트') || cleanTitle.includes('락볼트') || cleanTitle.includes('라이닝');

  let domain = 'general';
  if (isTitleSoil) {
    domain = 'soil';
  } else if (isTitleHydraulics) {
    domain = 'hydraulics';
  } else if (isTitleTunnel) {
    domain = 'tunnel';
  } else {
    // Text-based classification fallback (If title is non-descriptive)
    const hasSoilText = cleanText.includes('압밀') || cleanText.includes('점토') || cleanText.includes('유효응력') || cleanText.includes('전단강도') || cleanText.includes('선행압밀');
    const hasHydraulicsText = cleanText.includes('seepage') || cleanText.includes('darcy') || cleanText.includes('투수계수') || cleanText.includes('동수경사') || cleanText.includes('피이핑') || cleanText.includes('piping');
    const hasTunnelText = cleanText.includes('지보재') || cleanText.includes('락볼트') || cleanText.includes('숏크리트') || cleanText.includes('터널공');

    if (hasSoilText) {
      domain = 'soil';
    } else if (hasHydraulicsText) {
      domain = 'hydraulics';
    } else if (hasTunnelText) {
      domain = 'tunnel';
    }
  }

  let q1 = null;
  let q2 = null;
  let mcQuestions = [];

  if (domain === 'hydraulics') {
    console.log("Generating tailored Hydraulics & Seepage local questions.");
    q1 = {
      type: '주관식 (개요)',
      question: `Darcy의 투수 공식의 기본 정의와 투수계수(k)의 공학적 개념을 간략히 서술하시오.`,
      concept: `Darcy 법칙은 유체의 침투 흐름 속도가 동수경사에 직접 비례한다는 역학 법칙으로, 투수계수는 흙의 물 통과 용이성을 나타내는 물리적 지표입니다.`,
      formula: '',
      structure: ''
    };
    q2 = {
      type: '주관식 (공식)',
      question: `상향 침투류 발생 시 퀵샌드 현상을 유발하는 한계동수경사(icr) 산정 공식을 쓰고, 각 기호의 정의를 서술하시오.`,
      concept: `상향 침투력에 의해 지반의 유효응력이 0이 되는 한계 상태의 동수경사를 산정하는 공학적 수식입니다.`,
      formula: `$i_{cr} = \\frac{G_s - 1}{1 + e}$\n- $i_{cr}$: 한계동수경사\n- $G_s$: 흙 입자 비중\n- $e$: 간극비`,
      structure: ''
    };
    mcQuestions = [
      {
        type: '객관식 (4지선다)',
        question: `Darcy의 법칙(v = k × i)에서 v(유출속도), k(투수계수), i(동수경사) 사이의 관계를 가장 올바르게 설명한 것은?`,
        options: shuffleArray([
          "유출속도는 동수경사에 반비례하고 투수계수에 비례한다.",
          "유출속도는 투수계수와 동수경사 모두에 직접 비례한다.",
          "투수계수는 동수경사에 정비례하며 유출속도와 무관하다.",
          "동수경사가 무한히 커지면 유출속도는 0으로 수렴한다."
        ]),
        answer: "유출속도는 투수계수와 동수경사 모두에 직접 비례한다.",
        explanation: "Darcy의 투수 공식에 따르면 유출속도(v)는 흙의 투수계수(k)와 침투 유동의 동수경사(i)의 곱으로 정의되므로 두 인자 모두에 직접 비례합니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `실제 흙 입자 사이의 공극을 흐르는 실제 침투 속도(vs)와 가상의 유출 속도(v)의 상관관계를 정의하는 변수로 옳은 것은?`,
        options: shuffleArray([
          "간극률 (Porosity, n)",
          "과압밀비 (OCR)",
          "투수계수 (k)",
          "점착력 (c)"
        ]),
        answer: "간극률 (Porosity, n)",
        explanation: "실제 물이 흐르는 단면적은 전체 흙 단면적보다 작기 때문에 실제 침투 속도(vs)는 항상 유출 속도(v)보다 크며, vs = v / n (n: 간극률)로 정의됩니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `지반 내 상향 침투류가 흐를 때 유효응력이 0이 되어 흙 입자가 물과 함께 분출하는 현상의 명칭은?`,
        options: shuffleArray([
          "압밀 현상 (Consolidation)",
          "분사 현상 또는 퀵샌드 현상 (Quick Sand)",
          "다일레이턴시 현상 (Dilatancy)",
          "크리프 현상 (Creep)"
        ]),
        answer: "분사 현상 또는 퀵샌드 현상 (Quick Sand)",
        explanation: "모래 지반에서 상향 침투력이 흙의 유효 단위중량과 같아져 유효응력이 0이 됨으로써 지반의 전단강도가 상실되어 분출하는 현상을 분사 현상(Quick Sand) 또는 끓음 현상(Boiling)이라고 합니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `흙 입자의 비중이 2.65이고 간극비(e)가 0.65인 사질토 지반의 한계동수경사(icr)는 얼마인가?`,
        options: shuffleArray([
          "1.0",
          "0.5",
          "1.5",
          "2.0"
        ]),
        answer: "1.0",
        explanation: "한계동수경사 공식 i_cr = (G_s - 1) / (1 + e) 에 값을 대입하면 (2.65 - 1) / (1 + 0.65) = 1.65 / 1.65 = 1.0 이 됩니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `지하수 침투력(Seepage Force)의 작용 방향에 대한 설명으로 가장 올바른 것은?`,
        options: shuffleArray([
          "언제나 연직 하향으로만 작용한다.",
          "침투 흐름의 방향(유선 방향)과 동일한 방향으로 작용한다.",
          "동수경사와 수직인 방향으로 작용한다.",
          "지반의 전응력이 감소하는 반대 방향으로 작용한다."
        ]),
        answer: "침투 흐름의 방향(유선 방향)과 동일한 방향으로 작용한다.",
        explanation: "침투력(Seepage Force)은 물이 흙 속을 흐르면서 흙 입자에 가하는 마찰력이며, 그 방향은 항상 물이 흐르는 유선(Flow Line)의 방향과 같습니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `분사현상(Quick Sand)을 방지하기 위한 공학적 대책으로 가장 적절하지 않은 것은?`,
        options: shuffleArray([
          "차수벽(시트파일 등)을 지반 내 깊이 설치하여 침투 경로를 길게 만든다.",
          "상류 측의 지하수위를 강제적으로 급격히 상승시킨다.",
          "하류 쪽에 필터재 또는 가중 블랭킷(Surcharge)을 설치하여 상향 침투력에 저항한다.",
          "웰포인트 등 배수 공법을 활용하여 지중 지하수압을 저하시킨다."
        ]),
        answer: "상류 측의 지하수위를 강제적으로 급격히 상승시킨다.",
        explanation: "상류 측 지하수위가 상승하면 상하류 수위 차가 커져 동수경사(i)가 증가하므로 분사현상 발생 위험이 높아집니다. 따라서 이는 잘못된 대책입니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `침투 해석 및 차수벽 설계 시 수평 투수계수와 수직 투수계수가 다른 이방성 지반을 다루기 위해 유선망을 작도할 때 취하는 변환 방법은?`,
        options: shuffleArray([
          "지반의 수평 좌표(x축)를 투수계수 비율에 맞추어 축소 변환한다.",
          "간극비를 강제로 1.0으로 고정하여 등방성으로 취급한다.",
          "동수경사를 연직 하향으로만 2배 가산한다.",
          "Darcy의 공식 대신 Mohr-Coulomb 공식으로 작도한다."
        ]),
        answer: "지반의 수평 좌표(x축)를 투수계수 비율에 맞추어 축소 변환한다.",
        explanation: "수평 투수계수(kx)와 수직 투수계수(ky)가 다른 이방성 지반에서는 x_t = x × sqrt(k_y / k_x) 와 같이 수평 좌표를 축소하여 변환단면(Transformation Section)을 만든 후 등방 지반처럼 유선망을 작도합니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `침투류 유선망(Flow Net)의 특징 및 작도 규칙에 대한 설명으로 옳은 것은?`,
        options: shuffleArray([
          "유선(Flow line)과 등수두선(Potential line)은 반드시 직교한다.",
          "각 유로를 통과하는 침투 유량은 서로 완전히 다르다.",
          "인접한 두 등수두선 사이의 수두 손실량은 하류로 갈수록 감소한다.",
          "유선망에 의해 형성되는 사각형은 언제나 정삼각형이어야 한다."
        ]),
        answer: "유선(Flow line)과 등수두선(Potential line)은 반드시 직교한다.",
        explanation: "등방성 지반에서 유선과 등수두선은 언제나 서로 직교(90도)하며, 각 유로를 흐르는 유량과 등수두선 간의 낙차는 모두 동일하도록 유선망을 작도합니다."
      }
    ];
  } else if (domain === 'soil') {
    console.log("Generating tailored Geotechnical & Clay local questions.");
    q1 = {
      type: '주관식 (개요)',
      question: `점성토 지반에서 발생하는 압밀(Consolidation) 현상의 기본 정의와 발생 원인을 간략히 서술하시오.`,
      concept: `압밀은 외력에 의해 점성토 속의 물(과잉간극수압)이 빠져나가면서 흙 입자 사이의 간극이 좁아지고 지반이 압축되면서 다져지는 현상입니다.`,
      formula: '',
      structure: ''
    };
    q2 = {
      type: '주관식 (공식)',
      question: `흙의 전단 저항 한계를 결정하는 대표적인 Mohr-Coulomb 파괴 규준 공식을 쓰고, 각 기호의 정의를 서술하시오.`,
      concept: `수직응력과 점착력, 내부마찰각의 수학적 관계로 흙의 전단 강도를 정량적으로 정의하는 기준 수식입니다.`,
      formula: `$s = c + \\sigma \\tan\\varphi$\n- $s$: 전단강도\n- $c$: 흙의 점착력\n- $\\sigma$: 파괴면의 수직응력\n- $\\varphi$: 흙의 내부마찰각`,
      structure: ''
    };
    mcQuestions = [
      {
        type: '객관식 (4지선다)',
        question: `점성토 지반에서 외력에 의해 유발된 과잉간극수압(Excess Pore Water Pressure)이 소멸하면서 유효응력이 증가해 체적이 감소하는 현상의 명칭은?`,
        options: shuffleArray([
          "압축 (Compression)",
          "압밀 (Consolidation)",
          "다짐 (Compaction)",
          "액상화 (Liquefaction)"
        ]),
        answer: "압밀 (Consolidation)",
        explanation: "압밀(Consolidation)은 투수성이 낮은 점성토 지반에서 시간이 경과함에 따라 과잉간극수압이 배출되고 유효응력이 증가하여 점진적으로 체적이 압축되는 현상입니다. 다짐은 사질토 등에서 공기를 배출하여 밀도를 높이는 단기 현상입니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `과압밀비(OCR, Overconsolidation Ratio)가 1.0보다 큰 지반(OCR > 1)을 의미하는 점토의 공학적 명칭은?`,
        options: shuffleArray([
          "정규압밀점토 (NC Clay)",
          "과압밀점토 (OC Clay)",
          "과소압밀점토 (UC Clay)",
          "비소성점토 (Non-plastic Clay)"
        ]),
        answer: "과압밀점토 (OC Clay)",
        explanation: "과압밀비 OCR = 선행압밀응력(pc) / 현재 유효응력(p0)으로 정의되며, OCR > 1.0인 지반은 과거에 현재보다 더 큰 하중을 받았던 이력이 있는 과압밀점토(Overconsolidated Clay)입니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `흙의 유효응력(Effective Stress, σ')을 구하기 위한 원리로 옳은 것은? (단, σ는 전응력, u는 간극수압이다)`,
        options: shuffleArray([
          "σ' = σ + u",
          "σ' = σ - u",
          "σ' = σ × u",
          "σ' = σ / u"
        ]),
        answer: "σ' = σ - u",
        explanation: "테르자기의 유효응력 원리에 따르면, 지반 내부의 실제 흙 입자가 분담하는 유효응력(σ')은 전체 응력(전응력, σ)에서 물이 부담하는 간극수압(u)을 뺀 값으로 산정됩니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `Mohr-Coulomb 파괴 규준선 공식 's = c + σ × tanφ'에서 각 기호의 정의로 올바르지 않은 것은?`,
        options: shuffleArray([
          "s: 흙의 전단 강도",
          "c: 흙의 점착력",
          "σ: 기초 저면의 침하량",
          "φ: 흙의 내부마찰각"
        ]),
        answer: "σ: 기초 저면의 침하량",
        explanation: "Mohr-Coulomb 파괴 포락선 공식에서 σ는 파괴면에 작용하는 수직응력(Normal Stress)을 의미하며, 침하량과는 무관합니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `배수 조건 하의 전단 시험(CD 시험)에서 과압밀점토(OC Clay)가 파괴 시 부피가 팽창하는 거동 특성의 명칭은?`,
        options: shuffleArray([
          "압밀 현상 (Consolidation)",
          "딜레이턴시 현상 (Dilatancy / Volume Expansion)",
          "액상화 현상 (Liquefaction)",
          "크리프 현상 (Creep)"
        ]),
        answer: "딜레이턴시 현상 (Dilatancy / Volume Expansion)",
        explanation: "과압밀점토나 조밀한 사질토는 전단 변형이 일어날 때 흙 입자들이 서로 타고 넘어가면서 조밀했던 구조가 흐트러져 부피가 팽창하는 딜레이턴시(Positive Dilatancy) 거동을 보입니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `Terzaghi의 1차원 압밀 방정식의 가정 사항으로 적절하지 않은 것은?`,
        options: shuffleArray([
          "흙 입자와 물은 압축성이 없는 완전 비압축성체이다.",
          "지반 내부의 지하수 침투 흐름은 3차원 다방향 흐름이다.",
          "흙의 투수계수와 압축성은 압밀 과정 동안 일정하다.",
          "토질은 균질하고 완전히 포화되어 있다."
        ]),
        answer: "지반 내부의 지하수 침투 흐름은 3차원 다방향 흐름이다.",
        explanation: "Terzaghi의 1차원 압밀 이론은 지하수의 흐름과 점토의 압축 변형이 오직 연직(1차원) 방향으로만 일어난다고 가정합니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `정규압밀점토(NC Clay)의 삼축압축 CD 시험(압밀배수) 시 점착력(c')의 이론적 크기로 가장 적절한 것은?`,
        options: shuffleArray([
          "c' = 0",
          "c' > 100 kPa",
          "c'는 수직응력과 항상 비례하여 무한히 커진다.",
          "c'는 내부마찰각과 동일하다."
        ]),
        answer: "c' = 0",
        explanation: "정규압밀점토는 과거에 현재 이상의 압밀 응력을 받은 적이 없으므로, 완전히 배수된 상태(CD 시험)에서는 화학적 시멘테이션이 없는 한 유효점착력(c')이 이론적으로 0이 되어 강도선이 원점을 통과합니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `핵심 점성토 지반의 1차 압밀 침하 완료 후, 흙 입자의 구조적 재배열로 인해 발생하는 비정량적 장기 침하 현상의 명칭은?`,
        options: shuffleArray([
          "1차 압밀 침하",
          "탄성 침하",
          "2차 압밀 침하 (Secondary Compression)",
          "즉시 침하"
        ]),
        answer: "2차 압밀 침하 (Secondary Compression)",
        explanation: "과잉간극수압이 모두 소멸한 후(1차 압밀 완료 후) 유효응력의 변화 없이 흙 입자 골격의 지속적인 크리프 변형에 의해 발생하는 장기 침하를 2차 압밀 침하 또는 2차 압축 침하라고 합니다."
      }
    ];
  } else if (domain === 'tunnel') {
    console.log("Generating tailored Tunneling & Rock Mechanics local questions.");
    q1 = {
      type: '주관식 (개요)',
      question: `NATM 터널 공법의 가장 핵심적인 기본 정의와 설계 개념을 간략히 서술하시오.`,
      concept: `NATM 공법은 지반 고유의 지지력을 최대한 보존 및 활용하고, 굴착 후 발생하는 지반 변형을 허용하되 숏크리트와 락볼트로 밀착 보강하여 터널의 안정을 도모하는 공법입니다.`,
      formula: '',
      structure: ''
    };
    q2 = {
      type: '주관식 (공식)',
      question: `NATM 터널의 숏크리트 두께 설계에 적용하는 대표적인 숏크리트 소요 두께 산정 공식을 쓰고, 각 기호의 정의를 서술하시오.`,
      concept: `터널 지반의 압력에 저항하고 전단 파괴를 방지하기 위해 필요한 숏크리트의 소요 두께를 정량적으로 도출하는 공학적 수식입니다.`,
      formula: `$t = \\frac{P \\cdot D}{2 \\cdot \\tau_{allow}}$\n- $t$: 숏크리트 소요 두께\n- $P$: 터널 천단 지반압\n- $D$: 터널 직경\n- $\\tau_{allow}$: 숏크리트 허용 전단강도`,
      structure: ''
    };
    mcQuestions = [
      {
        type: '객관식 (4지선다)',
        question: `NATM 터널 공법의 가장 핵심적인 역학적 지지 기본 원리는 무엇인가?`,
        options: shuffleArray([
          "터널 라이닝의 강도를 높여 상부 토사 하중을 100% 차단한다.",
          "지반 자체의 강도와 아칭 효과(Arching Effect)를 활용하여 지반이 스스로 지지하게 한다.",
          "숏크리트를 매우 두껍게 타설하여 강지보의 두께를 대폭 감소시킨다.",
          "터널 내부의 공기압을 높여 지하수의 유입을 원천적으로 차단한다."
        ]),
        answer: "지반 자체의 강도와 아칭 효과(Arching Effect)를 활용하여 지반이 스스로 지지하게 한다.",
        explanation: "NATM 공법은 굴착 후 지반 자체가 가지는 고유의 강도와 아칭 효과(Arching Effect)를 최대한 보존하면서, 이완되기 전에 숏크리트와 락볼트로 밀착 보강하여 지반이 스스로 안정하도록 돕는 공법입니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `NATM 터널 공법의 1차 지보재 중 하나로, 굴착면의 급격한 이완을 방지하고 요철을 메우며 아칭 링(Arching Ring)을 형성하는 주된 지보재는?`,
        options: shuffleArray([
          "숏크리트 (Shotcrete)",
          "방수 시트",
          "인버트 콘크리트",
          "벤토나이트 차수재"
        ]),
        answer: "숏크리트 (Shotcrete)",
        explanation: "숏크리트는 분사식 콘크리트로 굴착 즉시 암반 표면에 밀착되어 외주 응력을 균일하게 분산시키고 지반의 조기 이완을 방지하여 아칭 링 역할을 수행합니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `락볼트(Rock Bolt)가 터널 암반을 보강하는 대표적인 역학적 메커니즘으로 옳지 않은 것은?`,
        options: shuffleArray([
          "봉합 효과 (Sewing Effect): 파괴 지반과 견고한 암반을 꿰어 묶어준다.",
          "보 형성 효과 (Beam Effect): 얇은 층상의 암반을 일체화하여 큰 보를 형성한다.",
          "부력 상쇄 효과 (Buoyancy Effect): 터널 하부의 양압력을 억제하여 숏크리트 부유를 차단한다.",
          "현수 효과 (Suspension Effect): 이완 영역의 암석을 상부 미이완 암반에 매달아 지지한다."
        ]),
        answer: "부력 상쇄 효과 (Buoyancy Effect): 터널 하부의 양압력을 억제하여 숏크리트 부유를 차단한다.",
        explanation: "락볼트의 주요 지보 기능은 봉합(Sewing), 보 형성(Beam), 현수(Suspension), 지반 아치 형성(Arching) 등 지반 보강 기능이며, 부력 상쇄 효과는 락볼트의 주요 기능이 아닙니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `터널 굴착에 따른 지반의 강도 감소와 지보재의 지항력을 그래프 상에서 상호 교점으로 나타내어 터널 안정성을 평가하는 설계 이론은?`,
        options: shuffleArray([
          "지반-지보 상호작용 이론 (Ground-Support Interaction / GRC-LSC)",
          "Darcy의 침투망 이론",
          "Mohr-Coulomb의 강소성 파괴 이론",
          "Terzaghi의 1차원 압밀 이론"
        ]),
        answer: "지반-지보 상호작용 이론 (Ground-Support Interaction / GRC-LSC)",
        explanation: "지반-지보 상호작용(Ground-Support Interaction)은 굴착 시 방출되는 지반 응력에 따른 변위를 나타내는 지반반응곡선(GRC)과 지보재의 지항 성능을 나타내는 지보제한곡선(LSC)을 매핑하여 적정 설치 시기와 지보 압력을 설계하는 핵심 이론입니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `터널 굴착 시 막장 전방의 선행 변위 및 막장면 붕괴를 선제적으로 제어하기 위해 적용하는 대표적인 사전 보강(선지보) 기법은?`,
        options: shuffleArray([
          "강관다단 그라우팅 (Umbrella Arch Method)",
          "2차 영구 콘크리트 라이닝 타설",
          "인버트 폐합 및 콘크리트 포장",
          "숏크리트의 리바운드 증량 배합"
        ]),
        answer: "강관다단 그라우팅 (Umbrella Arch Method)",
        explanation: "강관다단 그라우팅은 터널 막장면 전방 천단부에 강관을 삽입하고 그라우트재를 주입하여 굴착 전에 우산 형태의 선행 지보 아치를 형성함으로써 막장 안전을 확보하는 공법입니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `NATM 터널의 내공변위 및 천단침하 계측 결과, 누적 변위가 수렴하지 않고 일정 수준 이상으로 선형 증가 또는 급격히 증가할 때 필요한 공학적 조치로 가장 적절한 것은?`,
        options: shuffleArray([
          "계측이 오작동한 것이므로 즉시 계측을 영구 중단한다.",
          "굴착 작업을 일시 중단하고 보강 락볼트 추가 및 숏크리트 증설 등 보강 대책을 즉시 시행한다.",
          "수렴하지 않는 상태가 정상적이므로 굴착 속도를 2배로 높여 신속히 폐합한다.",
          "2차 라이닝을 무리하게 타설하여 강제로 변위를 막는다."
        ]),
        answer: "굴착 작업을 일시 중단하고 보강 락볼트 추가 및 숏크리트 증설 등 보강 대책을 즉시 시행한다.",
        explanation: "변위가 수렴하지 않고 지속적으로 증가하는 것은 터널 붕괴의 전조 증상일 수 있으므로 즉시 굴착을 멈추고 지반 상태를 분석하여 보강(락볼트 추가, 숏크리트 재타설, 인버트 조기폐합 등)을 실시해야 합니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `터널 라이닝 설계 시 터널의 하부 굴착면을 아래로 오목한 아치형태로 조기에 폐합하여 전체 터널 단면의 역학적 안정성을 도모하는 지보 부재는 무엇인가?`,
        options: shuffleArray([
          "인버트 (Invert)",
          "막장면 숏크리트",
          "격자지보 (Lattice Girder)",
          "포어폴링 (Forepoling)"
        ]),
        answer: "인버트 (Invert)",
        explanation: "인버트(Invert)는 터널 하부 바닥을 아치 구조로 폐합하여 지보재 전체를 조기에 링(Ring) 형태로 구성함으로써 상부 하중 분산 및 측벽부 밀림 현상을 효과적으로 차단합니다."
      },
      {
        type: '객관식 (4지선다)',
        question: `NATM 터널 지보재 설계에서 지반 변위가 발생하기 전 극도로 이른 시기에 너무 뻣뻣한(Rigid) 지보재를 설치할 경우 발생하는 부작용은?`,
        options: shuffleArray([
          "지반의 자립 아칭 효과가 극대화되어 안전해진다.",
          "지반 압력이 해소되지 않고 지보재에 과도한 하중이 집중되어 지보재 파괴 위험이 증가한다.",
          "지하수가 전부 배출되어 터널 주변 침하가 완전히 사라진다.",
          "락볼트의 정착 성능이 무한히 커진다."
        ]),
        answer: "지반 압력이 해소되지 않고 지보재에 과도한 하중이 집중되어 지보재 파괴 위험이 증가한다.",
        explanation: "지보재를 너무 일찍 설치하면 지반이 변형을 겪으며 응력을 해소하고 스스로 지지력을 발휘하는 과정(아칭 효과)을 방해하여, 지반 토압 전체가 지보재에 걸려 지보재가 과부하로 파괴될 수 있습니다."
      }
    ];
  } else {
    // Pure General Fallback Q1 & Q2
    console.log("Generating high-quality domain-agnostic local fallback questions.");
    q1 = {
      type: '주관식 (개요)',
      question: `[${title}]의 핵심 정의와 기본 개념에 대해 간략히 서술하시오.`,
      concept: `[${title}]은/는 ${keywordDisplay} 등 핵심 요소를 바탕으로 공학적 안전성과 원리를 규명하기 위한 핵심 공학 설계 개념이자 기준입니다.`,
      formula: '',
      structure: ''
    };

    let formula2 = '';
    if (features.extractedFormulas && features.extractedFormulas.length > 0) {
      // Clean and format any extracted formula
      const cleanFormulas = features.extractedFormulas.map(f => f.replace(/[\[\]]/g, '').trim());
      formula2 = `${cleanFormulas[0]}\n- (추출 공식의 기호 정의를 기재하십시오.)`;
    } else {
      formula2 = `$F.S. = \\frac{R}{S} \\ge F.S._{req}$\n- $F.S.$: 안전율 (Factor of Safety)\n- $R$: 저항 강도 (Resistance)\n- $S$: 설계 응력 (Stress)\n- $F.S._{req}$: 요구 안전율`;
    }

    q2 = {
      type: '주관식 (공식)',
      question: `[${title}]의 거동이나 평가 시 적용하는 가장 대표적인 허용 안전율 공식을 제시하고, 각 기호의 정의를 서술하시오.`,
      concept: `[${title}]의 설계 안전성을 평가하기 위한 가장 기본적인 공학적 허용 한계상태 조건식입니다.`,
      formula: formula2,
      structure: ''
    };
    // Create 8 programmatically generated dynamic multiple-choice questions
    for (let i = 0; i < 8; i++) {
      const correctSentence = features.keySentences[i % features.keySentences.length] || 
        `[${title}]은/는 ${keywordDisplay} 등의 연동 제어를 통해 구조적 안전율을 확보하는 것이 핵심 설계 기준입니다.`;

      let questionText = '';
      let correctOption = '';
      let explanationText = '';
      let options = [];

      if (i % 2 === 0) {
        questionText = `다음 중 본문 진술 및 공학적 원리에 기초하여 [${title}]에 대한 올바른 설명은 무엇인가?`;
        correctOption = correctSentence;
        
        const incorrectOption1 = `실무 엔지니어링 설계 시 ${mergedKw[0] || '핵심 인자'} 등의 변수는 공학적 안전율 계산에서 완전히 배제되어야 안전합니다.`;
        const incorrectOption2 = `[${title}]의 시공 과정에서는 물리적 리스크나 한계 수치를 사전에 감시/계측할 필요가 전혀 없습니다.`;
        const incorrectOption3 = `[${title}]은 기존 기술 대비 시공 정밀도와 경제적 효율성을 급격히 저하시키는 공법입니다.`;
        
        options = shuffleArray([correctOption, incorrectOption1, incorrectOption2, incorrectOption3]);
        explanationText = `정답은 "${correctOption}"입니다. 본문 교재의 진술 및 핵심 원리에 입각할 때, ${title}의 설계 안전성과 주요 기술 규준은 이와 같이 올바르게 정의됩니다. 다른 보기들은 계측의 생략이나 안전율 배제 등 공학적 타당성이 전혀 없는 명백한 오류입니다.`;
      } else {
        questionText = `다음 중 본문 교재의 학술적 맥락에 비추어 볼 때, [${title}]과 관련하여 가장 올바르지 않은(틀린) 진술은 무엇인가?`;
        
        const incorrectOption = `설계/시공 기준 수립 시 ${mergedKw[1] || '최적 설계'} 등 핵심 요소의 영향 및 상호 거동 해석은 엔지니어링 가치 기준에서 무의미하므로 무시해야 합니다.`;
        correctOption = incorrectOption;
        
        const opt2 = correctSentence;
        const opt3 = `본문 진술에 근거하여 [${title}] 설계 시 임계 취약 요인(Bottleneck)을 정량 분석하고 제어 대책을 강구해야 합니다.`;
        const opt4 = `[${title}]의 성공적 가동을 위해 ${mergedKw.slice(0, 3).join(', ')} 등의 유기적 상관 거동 특성을 규명하는 아키텍처 설계를 반영합니다.`;
        
        options = shuffleArray([correctOption, opt2, opt3, opt4]);
        explanationText = `정답은 "${correctOption}"입니다. 이 보기는 핵심 설계 파라미터의 거동 해석을 무의미하게 취급하고 무시하자는 주장으로, 공학 설계 및 기술자 기준에 위배되는 명백히 틀린 설명입니다. 다른 보기들은 모두 본문 및 공학 원리에 부합하는 올바른 설명입니다.`;
      }

      mcQuestions.push({
        type: '객관식 (4지선다)',
        question: questionText,
        options: options,
        answer: correctOption,
        explanation: explanationText
      });
    }
  }

  return [q1, q2, ...mcQuestions];
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

      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const QUIZ_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];

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

async function startServer() {
  try {
    await initDatabase();
    console.log('Database schema initialization completed.');
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
  initDatabase().then(() => {
    console.log('Vercel serverless DB initialization completed.');
  }).catch(dbErr => {
    console.error('CRITICAL WARNING: Database schema initialization failed on Vercel:', dbErr.message);
    global.dbInitError = dbErr.message;
  });
}
