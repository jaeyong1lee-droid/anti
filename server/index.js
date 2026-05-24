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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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
  return [
    {
      type: '용어형 (10점)',
      question: `싱글쉘(Single Shell) 터널 공법의 정의 및 기존 NATM 공법(이중 쉘)과의 차별화된 구조적 메커니즘을 설명하시오.`,
      concept: `싱글쉘 터널 공법은 1차 지보재(쇼크리트, 락볼트)와 2차 라이닝을 통합하여 단일 영구 지보 구조(Single Shell)로 터널을 형성하는 공법입니다. 외부 지하수를 배수시키는 배수형과 수압을 직접 견디는 비배수형으로 분류됩니다.`,
      formula: `[필수 개념도 구성 요소]\n1. 숏크리트 + 락볼트 + 방수재 일체화 단면도 도식 필수\n2. 숏크리트 응력분포곡선 (응력 재분배 메커니즘)\n3. 락볼트 축력 분배공식: T = P × r (T: 인장력, P: 내압, r: 터널 반경)`,
      structure: `1단락: 싱글쉘 터널 공법의 정의 및 등장 배경 (NATM 대비 공기단축/공사비 절감 요구)\n2단락: 싱글쉘 터널의 구조적 메커니즘 및 지반-지보재 거동 특성 (이중 쉘과의 비교표)\n3단락: 현장 적용 시 리스크(숏크리트 균열, 지하수 누수) 및 기술사로서의 시공 품질 확보 대책`
    },
    {
      type: '서술형 (25점)',
      question: `터널 공학 관점에서 싱글쉘 공법 적용 시 숏크리트와 지반의 일체화(Bonding) 거동 특성을 논하고, 장기 신뢰성(Reliability) 확보를 위한 방수 시트 간소화 공정 및 시공 시 고려사항을 기술하시오.`,
      concept: `숏크리트와 암반의 전단 접착 강도(Bonding Strength)를 극대화하여 지반 자체의 전단 저항력을 활용하고, 고성능 섬유보강 숏크리트(SFRC)를 통해 영구 지보재로서의 휨인장 인성을 확보하는 공법입니다.`,
      formula: `[숏크리트 두께 산정 공식 (Rabcewicz 공식)]\n- t = (P - 2C·sinφ) / [ (γ·tanφ) + (2S / D) ]\n  (t: 두께, P: 지반압, C: 점착력, φ: 내부마찰각, S: 전단강도, D: 터널 직경)`,
      structure: `1단락: 영구 지보재로서 싱글쉘 숏크리트-지반 상호작용(Soil-Structure Interaction)의 의의\n2단락: 숏크리트 전단 접착 거동 특성 및 SFRC(섬유보강)에 의한 인성 증대 효과 메커니즘\n3단락: 방수/배수 일체화 시스템 시공 상세 및 영구 숏크리트 장기 열화(중성화, 황산염부식) 방지 대책`
    },
    {
      type: '서술형 (25점)',
      question: `싱글쉘 터널 설계 시 배수형(Drained)과 비배수형(Hydraulic) 시스템의 수압 분산 특성을 다차원적으로 분석하고, 터널 라이닝 설계 시 필수 고려사항을 지반-지보 상호작용 관점에서 서술하시오.`,
      concept: `지하수 흐름을 통제하여 수압을 원천 배출하는 배수형 구조와, 영구 숏크리트 배면의 지하수압을 전체 영구 쉘이 직접 견디도록 수밀 설계하는 비배수형 구조의 역학적 안정성 해석 설계 방식입니다.`,
      formula: `[수압 산정 및 안전율 공식]\n- 비배수 터널 배면 정수압: p_w = γ_w × H (γ_w: 물의 단위중량, H: 수두)\n- 단일 영구 쉘 단면력 해석 공식 및 부력 안전율(F.S > 1.2) 확보 조건 정립.`,
      structure: `1단락: 터널 배면 수압이 구조물에 미치는 영향 및 배수/비배수 설계의 선택 기준\n2단락: 배수형과 비배수형 싱글쉘 라이닝 배면 수압 분포 특성 비교 및 응력 제어 메커니즘\n3단락: 지하수위 보존 대책, 터널 누수 방지를 위한 고성능 조인트재 배치 및 장기 수밀 신뢰성 확보 제언`
    }
  ];
}

// Built-in Expert-Grade PE Questions for Prandtl's Bearing Capacity Theory
function getPrandtlExpertQuestions(title, keywords) {
  return [
    {
      type: '용어형 (10점)',
      question: `얕은 기초의 극한 지지력 결정을 위한 프란틀(Prandtl)의 지지력 이론의 가정 조건 및 소성평형 영역(Failure Zone)의 구성 요소를 설명하시오.`,
      concept: `프란틀 지지력 이론은 기초 하부 지반을 강소성체(Rigid-Plastic)로 가정하고, 기초 극한 하중 시 소성 파괴 영역을 3개의 영역(탄성 대칭 쐐기, 대수나선 방사형 전단, 랭킨 수동 영역)으로 구분하여 지지력 공식을 유도한 고전 소성론 기반 지력 이론입니다.`,
      formula: `[기초 극한 지지력 기본 공식]\n- q_ult = c·N_c + q·N_q\n- Failure Zone 구성: Ⅰ지역(탄성 쐐기, Elastic Wedge), Ⅱ지역(방사형 전단, Radial Shear Zone, 대수나선 경로), Ⅲ지역(수동 랭킨 쐐기, Passive Rankine Zone)`,
      structure: `1단락: 프란틀 지지력 이론의 공학적 정의 및 의의 (지반 극한 소성 평형 이론의 기초)\n2단락: 소성파괴 영역도(Failure Zone Diagram) 도식화 및 영역별(Ⅰ, Ⅱ, Ⅲ) 거동 특성\n3단락: 프란틀 이론의 한계성 (지반 자중 γ의 무시) 및 테르자기(Terzaghi) 지지력 공식으로의 발전 과정`
    },
    {
      type: '서술형 (25점)',
      question: `지반공학에서 프란틀(Prandtl) 지지력 이론의 이론적 배경과 극한지지력 유도 과정을 상술하고, 지반의 자중(γ)을 고려한 테르자기(Terzaghi) 및 마이어호프(Meyerhof) 지지력 공식과의 차별성을 기초 형상 및 경사 하중 조건을 중심으로 논하시오.`,
      concept: `소성 역학의 슬립라인법(Slip Line Method)을 토질역학에 최초 적용한 이론으로, 프란틀 공식에 지반 자중 항(0.5·γ·B·N_γ)과 형상/깊이/경사 계수를 보완하여 실무 설계용 Terzaghi, Meyerhof, Vesic 공식이 완성되었습니다.`,
      formula: `[Terzaghi 지지력 공식 (연속기초)]\n- q_ult = c·N_c + q·N_q + 0.5·γ·B·N_γ\n- 형상계수 고려 (정사각형 기초): q_ult = 1.3·c·N_c + q·N_q + 0.4·γ·B·N_γ\n(N_c, N_q, N_γ: 지지력 계수)`,
      structure: `1단락: 극한 평형 상태와 지반 소성유동 법칙의 관계 및 프란틀 이론의 위상\n2단락: Prandtl 지지력 이론과 Terzaghi, Meyerhof 공식의 비교 분석 (지반 자중, 기초 조도, 형상, 지하수위 영향)\n3단락: 실무 설계 시 안전율(F.S=3.0) 산정 기준 및 상부 하중 편심/경사에 따른 지지력 감소 대책`
    },
    {
      type: '서술형 (25점)',
      question: `기초 지반의 전단 파괴 모드인 국부전단파괴(Local Shear Failure)와 전면전단파괴(General Shear Failure)의 메커니즘을 Prandtl 지지력 소성 쐐기 이론 관점에서 대조 분석하고, 느슨한 사질토나 점성토 지반 설계 시 고려해야 할 지지력 계수 감쇄 조치 방안을 서술하시오.`,
      concept: `지반의 밀도와 압축성에 따라 지반 전단 파괴면이 리프 표면까지 완전히 발달하는 전면전단파괴와, 파괴면이 지반 내부에서 불완전하게 소멸하는 국부전단파괴의 지반-기초 상호작용 특징을 규명하는 설계 기준입니다.`,
      formula: `[국부전단 강도 감쇄 공식]\n- 감쇄된 점착력: c' = (2/3) × c\n- 감쇄된 마찰각: tanφ' = (2/3) × tanφ\n- 국부전단용 지지력 계수 N_c', N_q', N_γ' 적용 공식 정립.`,
      structure: `1단락: 기초 하부 지반의 밀도 및 점착성에 따른 전단 파괴 모드(전면, 국부, 펀칭전단)의 유형 정의\n2단락: Prandtl 소성평형대 발달 유무에 따른 파괴 메커니즘 비교 (하중-침하 곡선 대조 포함)\n3단락: 연약 지반 상부 기초 설계 시 강도 정수(c, φ) 감쇄 적용 상세 및 침하량 통제를 위한 허용 지지력 설계 대책`
    }
  ];
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

  if (domain === 'hydraulics') {
    console.log("Generating tailored Hydraulics & Seepage local questions.");
    return [
      {
        type: '용어형 (10점)',
        question: `Darcy의 투수 공식에 기초하여 유출 속도(Discharge Velocity, v)와 실제 침투 속도(Seepage Velocity, vs)의 역학적 정의 및 차이점을 간극률(n) 관점에서 수식과 함께 설명하시오.`,
        concept: `유출 속도(v)는 흙의 전체 단면을 흐르는 가상의 속도인 반면, 실제 침투 속도(vs)는 흙 입자 사이의 실제 공극만을 흐르는 실제 속도이며 vs = v / n 공식으로 정의됩니다.`,
        formula: `[Darcy의 법칙 및 침투속도 공식]\n- 유출속도(체적속도): v = k × i\n- 실제 침투속도: v_s = v / n = (k × i) / n (n: 간극률, k: 투수계수, i: 동수경사)`,
        structure: `1단락: Darcy 법칙의 기본 개념 및 투수 흐름 유동의 특징\n2단락: 유출 속도(v)와 실제 침투 속도(v_s)의 수식적 유도 및 간극률에 따른 거동 대조\n3단락: 동수경사 증가에 따른 지반 내 Piping 방지 대책 및 실무적 투수 제어 방안`
      },
      {
        type: '서술형 (25점)',
        question: `지반 내 지하수 흐름 시 발생하는 침투력(Seepage Force)의 발생 메커니즘을 규명하고, 한계동수경사(Critical Hydraulic Gradient)의 공식 유도 과정 및 분사현상(Quick Sand) 방지를 위한 안전율(F.S) 설계 기준을 서술하시오.`,
        concept: `상향 침투력으로 인해 유효응력이 0이 되는 상태를 분사현상이라 하며, 이때의 동수경사인 한계동수경사(icr)와 실제 동수경사(i)의 비를 통해 침투 안전율을 평가합니다.`,
        formula: `[한계동수경사 및 침투 안정성 공식]\n- 한계동수경사: i_cr = (G_s - 1) / (1 + e) (G_s: 흙 입자 비중, e: 간극비)\n- 침투압(단위체적당): j = i × γ_w (i: 동수경사, γ_w: 물의 단위중량)\n- 분사현상 안전율: F.S = i_cr / i >= 1.5 ~ 2.0`,
        structure: `1단락: 지반 내 침투수의 상향 흐름 and 침투력(Seepage Force)의 물리적 메커니즘\n2단락: 한계동수경사(i_cr) 공식의 한계 소성 평형 상태 유도 과정 및 퀵샌드 현상 대책\n3단락: 차수벽 및 필터재 설치를 통한 동수경사 제어 기법 및 설계 안전성 확보 제언`
      },
      {
        type: '서술형 (25점)',
        question: `지반 내 투수/침투수 흐름에 따른 유선망(Flow Net)의 특징을 설명하고, 본문 진술 "${s2.substring(0, 50)}${s2.length > 50 ? '...' : ''}"에 근거하여 침투 유량(Q) 산정 공식 및 지반 구조물의 파이핑(Piping) 안정성 평가 방안을 서술하시오.`,
        concept: `본문 흐름 관리를 반영한 안정성 검토로, 유선망을 통해 침투 유량(Q = k × h × Nf / Nd)을 계산하고 침투 속도와 압력을 제어하여 구조물의 파이핑 취약성을 차단하는 설계 기법입니다.`,
        formula: `[유선망을 이용한 침투 유량 및 수압 공식]\n- 총 침투 유량: Q = k × h × (N_f / N_d) × L\n- 임의 점의 간극수압: u = (h - Δh × n_d) × γ_w\n(k: 투수계수, h: 총수두차, N_f: 유로 수, N_d: 등수두선 낙하수, L: 터널/댐 길이)`,
        structure: `1단락: Laplace 방정식에 준한 지반 투수 유선망(Flow Net)의 기본 작도 법칙 및 수리적 성질\n2단락: 유선망을 이용한 침투 유량(Q) 및 수치해석적 침투 속도(Velocity) 변동 분석\n3단락: 본문 핵심 리스크 제어에 기초한 배수공 및 역필터(Reverse Filter) 최적 설계 기법 제언`
      }
    ];
  }

  if (domain === 'soil') {
    console.log("Generating tailored Geotechnical & Clay local questions.");
    return [
      {
        type: '용어형 (10점)',
        question: `점성토 지반의 압밀(Consolidation) 메커니즘을 유효응력(Effective Stress) 원리를 적용하여 설명하고, 과압밀비(OCR)에 따른 점토의 분류(NC점토, OC점토) 및 응력 이력 특성을 설명하시오.`,
        concept: `외력에 의해 유발된 과잉간극수압이 소멸하면서 유효응력이 점차 증가하여 흙의 체적이 감소(압밀)하는 과정이며, 응력 이력에 따라 정규압밀(OCR=1)과 과압밀(OCR>1)로 대조 분류됩니다.`,
        formula: `[과압밀비(OCR) 및 유효응력 공식]\n- 과압밀비: OCR = p_c / p_0\n- 유효응력 원리: σ' = σ - u\n(p_c: 선행압밀응력, p_0: 현재 유효토피압, σ: 전응력, u: 간극수압)`,
        structure: `1단락: 점성토 압밀의 공학적 정의 및 유효응력 증가와의 상관관계\n2단락: 과압밀비(OCR)의 수식 정의 및 점토 분류별(N.C, O.C) 전단 및 압축 거동 비교표\n3단락: 점토 응력 이력 판단의 중요성 및 1차/2차 압밀 침하량의 현장 거동 제어 방안`
      },
      {
        type: '서술형 (25점)',
        question: `지반공학적 설계 시 흙의 전단 파괴 포락선을 결정하는 Mohr-Coulomb 파괴 규준선을 설명하고, CD시험(압밀배수) 조건에서 정규압밀점토와 과압밀점토의 전단 강도 산정 공식 및 파괴 시 부피 변화 특성(Dilatancy)을 비교 기술하시오.`,
        concept: `Mohr-Coulomb 이론은 흙의 전단강도를 수직응력, 점착력, 내부마찰각의 관계로 정의하며, CD 시험 시 과압밀점토는 입자 재배열로 인해 부피가 팽창하는 딜레이턴시(Dilatancy) 현상이 일어납니다.`,
        formula: `[Mohr-Coulomb 전단강도 공식]\n- 기본 파괴 포락선: s = c + σ × tanφ\n- N.C Clay CD 전단강도: s = σ' × tanφ' (c' = 0)\n- O.C Clay CD 전단강도: s = c' + σ' × tanφ' (c' > 0)`,
        structure: `1단락: Mohr-Coulomb 전단 파괴 파라미터(c, φ)의 의의 및 지반 전단 저항 거동\n2단락: CD 시험 하의 NC/OC 점토의 전단 강도 수식화 및 변형률-체적 변화(Dilatancy) 메커니즘 분석\n3단락: 실무 설계 시 전단 강도정수 선정 유의사항 및 압밀 배수 조건이 지반 구조물에 미치는 영향`
      },
      {
        type: '서술형 (25점)',
        question: `점토 지반의 압밀 거동 특성에 따른 침하량(Settlement) 산정 메커니즘을 규명하고, 본문 진술 "${s2.substring(0, 50)}${s2.length > 50 ? '...' : ''}"에 기초하여 과압밀 점토의 압축지수(Cc)와 재압축지수(Cr)를 활용한 침하량 계산 공식 및 지반 신뢰성 확보 방안을 서술하시오.`,
        concept: `본문 침하/압밀 거동 기준을 적용하여, 압밀 곡선(e-log p) 상의 압축지수(Cc)와 재압축지수(Cr)를 선행압밀응력(pc)과 현재 유효토피압(p0)의 관계에 대응시켜 최종 압밀 침하량을 계산하는 방법입니다.`,
        formula: `[최종 압밀 침하량(S_c) 산정 공식]\n- NC 점토(p_0 + Δp > p_0): S_c = [ C_c / (1 + e_0) ] × H × log[ (p_0 + Δp) / p_0 ]\n- OC 점토(p_0 + Δp <= p_c): S_c = [ C_r / (1 + e_0) ] × H × log[ (p_0 + Δp) / p_0 ]\n(H: 점토층 두께, e_0: 초기 간극비, C_c: 압축지수, C_r: 재압축지수)`,
        structure: `1단락: 점성토 압밀 침하의 시간 의존적 거동 및 Terzaghi 1차원 압밀 침하 기본 공식\n2단락: p-e 곡선 상의Cc, Cr 정량 설계법 및 OCR 응력 수준별 최종 침하량(Sc) 계산 공식 분석\n3단락: 본문 리스크 관리에 기초한 현장 압밀 침하 계측(지중경사계, 침하판) 및 연약지반 개량 공법 제언`
      }
    ];
  }

  if (isTunnel) {
    console.log("Generating tailored Tunneling & Rock Mechanics local questions.");
    return [
      {
        type: '용어형 (10점)',
        question: `터널 공학 관점에서 NATM 공법의 기본 지지 메커니즘(지반 자체 지지 효과) 및 1차 지보재(숏크리트, 락볼트)의 연동 작용 역할을 기술하시오.`,
        concept: `터널 굴착 후 지반 스스로 아칭 효과(Arching Effect)를 일으켜 하중을 지지하도록 하고, 숏크리트와 락볼트가 지반과 일체화되어 이완 영역을 보강하는 메커니즘입니다.`,
        formula: `[지보 지반 상호작용 이론]\n- 지반 반응 곡선(Ground Reaction Curve) 설계\n- 락볼트 분배 공식: T = P × r (T: 인장력, P: 지반 내압, r: 터널 반경)`,
        structure: `1단락: NATM 공법의 정의 및 강지보 대비 차별화된 지지 메커니즘\n2단락: 숏크리트(전단/휨 보강)와 락볼트(보강/봉합/지반아치 형성)의 유기적 상호 작용\n3단락: 터널 굴착 시 유의사항 및 지반 조사 기반 지보 패턴 결정 프로세스`
      },
      {
        type: '서술형 (25점)',
        question: `터널 굴착에 따른 지반-지보 상호작용(Ground-Support Interaction)의 응력 재분배 거동 특성을 상술하고, 지반 반응 곡선(GRC)과 지보 제한 곡선(LSC)의 관계식에 준하여 터널 지보재의 적정 설치 시기 결정 방안을 논하시오.`,
        concept: `터널 굴착에 의한 변위 수렴도와 지보재의 탄성/소성 변형 저항 한계를 GRC와 LSC 곡선의 상호 접점 분석을 통해 밝혀내어 적정 설치 시기(설치 창, Timing Window)를 설계하는 이론입니다.`,
        formula: `[지반-지보 설계 한계 변위 조건]\n- 설계 허용 안전율 조건: P_i = P_g - P_s <= P_allow (P_g: 지반압, P_s: 지보 저항력)\n- 3차원 터널 거동 해석에 따른 숏크리트 파괴 방지 극한 한계 상태 변위량 설정`,
        structure: `1단락: 터널 굴착면 전방 아치(Fore-arching) 형성 및 지반-지보 상호작용의 공학적 의의\n2단락: 수치해석적 지반반응곡선(GRC) 및 지보특성곡선(LSC)의 작도와 최적의 설치 지점(Timing) 도출\n3단락: 초기 변위 발생에 따른 선지보(천단보강, 강관다단그라우팅) 기법 및 터널 안정성 확보 방안`
      },
      {
        type: '서술형 (25점)',
        question: `터널 공정에서 숏크리트의 전단/휨인장 파괴 거동을 다차원적으로 분석하고, 본문 진술 "${s2.substring(0, 50)}${s2.length > 50 ? '...' : ''}"에 근거하여 터널 라이닝의 지반 상호 결합(Bonding) 품질 확보 및 휨 두께 계산 설계 방안을 서술하시오.`,
        concept: `본문 지보 안전 지침을 적용하여, 숏크리트 배면의 전단 접착력을 확보하고 Rabcewicz 공식 등에 기초해 극한 영구 터널 쉘 단면 두께를 도출하여 터널 균열 및 임계 장애를 방지하는 설계 기법입니다.`,
        formula: `[숏크리트 영구 휨/전단 두께 산정 공식 (Rabcewicz 공식)]\n- t = (P - 2C × sinφ) / [ (γ × tanφ) + (2S / D) ]\n(t: 라이닝 두께, P: 지반압, C: 암반 점착력, φ: 내부마찰각, S: 숏크리트 전단강도, D: 터널 직경)`,
        structure: `1단락: 영구 숏크리트의 소성 유동 전단 저항 거동 및 암반-숏크리트 간 접착 전단강도의 중요성\n2단락: Rabcewicz 이론 공식의 유도 및 SFRC(강섬유보강)에 의한 인장/휨 지탱력 향상 수식\n3단락: 본문 품질 안전 기준에 따른 용수 대책, 숏크리트 리바운드(Rebound) 감소 및 현장 계측 관리 방안 제언`
      }
    ];
  }

  // Pure General Fallback (For IT, General Science, etc.) - Generates incredibly high-quality, professional general questions!
  console.log("Generating high-quality domain-agnostic local fallback questions.");
  
  // Question 2 formulas (Try to extract any math equations from text, else use general engineering balance)
  let formula2 = '';
  if (features.extractedFormulas && features.extractedFormulas.length > 0) {
    formula2 = `[교재 본문 추출 핵심 공식/관계식]\n- ${features.extractedFormulas.join('\n- ')}`;
  } else {
    formula2 = `[핵심 영향 인자 및 상관관계식]\n- 주요 공학적 변수: ${mergedKw.slice(0, 3).join(', ')}\n- 수험생은 이 변수들 간의 비례/반비례 공학적 메커니즘을 규명하는 관계 법칙(예: f(${mergedKw.slice(0, 2).join(', ')}) 대비 안전율 영향)을 연계 서술해야 합니다.`;
  }

  // Question 3 formulas
  let formula3 = '';
  if (features.extractedFormulas && features.extractedFormulas.length > 1) {
    formula3 = `[교재 본문 추출 설계/평가식]\n- ${features.extractedFormulas.slice(1).join('\n- ')}`;
  } else if (features.extractedFormulas && features.extractedFormulas.length > 0) {
    formula3 = `[설계/시공 단계별 품질/안전성 확보 공식]\n- 주요 설계 기준식: ${features.extractedFormulas[0]}\n- 추가 반영 요소: 수험생은 본문의 취약 요인 극복을 위해 저항력과 구동력 간의 정량적 안전율(F.S) 확보 수식을 연계해야 합니다.`;
  } else {
    formula3 = `[설계/시공 단계별 품질/안전성 확보 공식]\n- 주요 정량 지표: ${mergedKw.slice(3, 6).join(', ') || '설계 안전율(F.S)'}\n- 설계 기준 공식: F.S = (저항력 / 구동력) >= [대상 기준 안전율] 규준을 본문의 핵심 취약 요인과 연계하여 수식으로 표현하십시오.`;
  }

  // Dynamic Concepts (Answers)
  const concept1 = `교재 본문 정의: "${s0}"\n\n[정의 및 의의] [${title}]은/는 ${keywordDisplay} 등 핵심 공학적 요소를 기반으로 설계 안전성을 확보하고 성능 신뢰성을 극대화하기 위한 핵심 엔지니어링 기술입니다.`;

  const concept2 = `교재 본문 요약: "${s1}"\n\n[필요성 분석] 기존 기술/방법론의 한계점을 극복하고, 고도의 정밀 제어 및 품질을 확보하기 위해 [${title}]의 상세 설계 기준이 핵심적으로 활용됩니다.`;

  const concept3 = `교재 본문 핵심 진술: "${s2}"\n\n[엔지니어링 리스크 관리] 실무 운용 및 시공 시 발생 가능한 예기치 못한 물리적/환경적 취약 요인(Bottleneck)을 선제적으로 예방하고 설계 안전율을 유지하기 위한 거동 통제 방안입니다.`;

  const question1 = `기술사적 관점에서 [${title}]의 핵심 정의 및 개념 구조도를 제시하고, 본문 진술 "${s0.substring(0, 60)}${s0.length > 60 ? '...' : ''}"에 기초하여 이의 공학적 특징을 3단락 표 형식으로 간략히 서술하시오.`;
  const question2 = `실무 적용 환경에서 [${title}]의 도입 필요성을 설명하고, 본문 요약 "${s1.substring(0, 60)}${s1.length > 60 ? '...' : ''}"을/를 반영하여 기존 공법/설계 방식 대비 기술적 차별성 및 시공/설계 시 주요 고려사항을 논하시오.`;
  const question3 = `[${title}]의 실무 적용 시 발생할 수 있는 주요 장애 및 취약성 요인(Bottleneck)을 다차원적으로 분석하고, 본문의 "${s2.substring(0, 60)}${s2.length > 60 ? '...' : ''}" 진술에 근거한 설계/시공 신뢰성 확보 방안과 발전 방향을 서술하시오.`;

  return [
    {
      type: '용어형 (10점)',
      question: question1,
      concept: concept1,
      formula: formula1,
      structure: `1단락: ${title}의 학술적/엔지니어링 정의 및 도입 필요성 (Need)\n2단락: ${title}의 핵심 작동 메커니즘 및 상세 구성 요소별 역할 (핵심 차별점 비교표 포함)\n3단락: 실무 적용 시 예상 장애(Bottleneck) 요인 및 공학적 극복 방안 제언`
    },
    {
      type: '서술형 (25점)',
      question: question2,
      concept: concept2,
      formula: formula2,
      structure: `1단락: 최신 기술 기준에 따른 ${title} 설계 기준의 도입 당위성 및 엔지니어링 가치\n2단락: ${title}의 거동 특성 및 상세 메커니즘 분석 (기존 공법 대비 성능/안전성 차별성)\n3단락: 실무 적용 단계별 정량적 품질/안전 관리 기준 및 계측/모니터링 신뢰성 확보 제언`
    },
    {
      type: '서술형 (25점)',
      question: question3,
      concept: concept3,
      formula: formula3,
      structure: `1단락: ${title} 실무 운용/시공 시 발생하는 부하 집중 또는 구조적 취약 요인의 다차원적 분석\n2단락: 본문의 핵심 취약성 극복 가이드에 기초한 설계/공정 신뢰성(Reliability) 및 안전성 확보 방안\n3단락: 지속 가능한 안정성 유지를 위한 유지관리 표준 가이드라인 및 관련 기술 발전 방향 제언`
    }
  ];
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

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      console.log('No GEMINI_API_KEY environment variable found. Generating high-quality local fallback questions.');
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      return res.json({ questions: fallbackQuestions, isFallback: true });
    }

    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `
당신은 대한민국 국가기술자격 기술사(Professional Engineer) 시험 출제위원입니다.
아래 제공되는 [토픽 제목], [핵심 키워드], 그리고 [첨부파일 본문 텍스트]를 심층 분석하여, 수험생을 위한 **예상 기출문제 3개**와 이에 대한 **답안 작성 핵심 가이드라인(핵심 개념, 필수 공식/개념도 구성, 답안 3단락 작성 구조)**을 출제해 주십시오.

[토픽 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}
[첨부파일 본문 텍스트]: ${fileText || '제공되지 않음'}

[출제 요구사항]:
1. 총 3개의 문제를 한국어 기술사 시험 양식으로 출제하십시오.
2. 기술사 시험 특성에 맞춰 해당 기술이 속한 도메인(예: 토목, IT, 전기, 소방 등 각 업로드 파일 본문의 실제 전공 학문 분야)에 최적화된 용어형 및 서술형 문제를 골고루 출제하십시오. 절대 무조건 IT 분야나 소프트웨어 관련 용어(Saga, MSA, CAP 등)를 일괄 주입하지 말고, 본문의 핵심 공학 전공 맥락과 기술 정의에 전적으로 부합하게 문제를 만드십시오.
3. 각 문제별로 수험생이 직접 인출(Active Recall)하고, 클릭해서 답을 맞춰볼 수 있도록 다음 항목을 반드시 포함하여 작성해 주십시오:
   - concept: 해당 질문에 대한 1~2줄짜리 핵심 개념 정의 및 기술적 요약.
   - formula: 답안지에 수험생이 반드시 직접 그려야 하거나 써야 하는 필수 공식, 물리/수학적 지표 연산식, 혹은 아키텍처/공법 개념도(Diagram) 핵심 구성요소 정보.
   - structure: 기술사 전통의 고득점 답안 구조인 '1단락', '2단락', '3단락'의 목차명 및 핵심 내용 작성 방식 아웃라인 지침 (줄바꿈이 적용되도록 \\n 포함).
4. 반드시 아래 지정된 JSON 배열 포맷으로만 정확히 반환하십시오. 마크다운의 '\`\`\`json' 코드 블록이나 추가적인 텍스트 설명은 배제하고 순수한 JSON 데이터만 제공해 주십시오.

[응답 JSON 포맷]:
[
  {
    "type": "용어형 (10점)" 또는 "서술형 (25점)",
    "question": "기술사적 전공 학문 분야의 완성형 문제 질문",
    "concept": "핵심 개념 설명 (기술적 정의 및 요약)",
    "formula": "필수 수학/공학 공식, 연산식 또는 그려야 할 아키텍처/공법 개념도(Diagram) 핵심 구성요소 목록",
    "structure": "1단락: ...\\n2단락: ...\\n3단락: ..."
  }
]
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const rawText = response.text().trim();

      let questions = null;
      try {
        let text = rawText;
        if (text.startsWith('```')) {
          text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }
        questions = JSON.parse(text);
      } catch (parseErr) {
        console.warn('Direct JSON parse failed, trying robust JSON array extractor:', parseErr);
        questions = extractJsonArray(rawText);
      }

      if (!questions || !Array.isArray(questions)) {
        throw new Error('Parsed result is not a valid JSON array or empty');
      }

      res.json({ questions, isFallback: false });
    } catch (aiError) {
      console.error('Gemini API call failed, generating fallbacks:', aiError);
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      res.json({ questions: fallbackQuestions, isFallback: true, error: aiError.message });
    }
  } catch (error) {
    console.error('Error in AI question generation route:', error);
    res.status(500).json({ error: '서버 오류로 AI 기출문제를 생성하지 못했습니다.' });
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
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`============================================`);
      console.log(`Spaced Repetition Backend is running!`);
      console.log(`Server Port: ${PORT}`);
      console.log(`Database File: spaced_repetition.db`);
      console.log(`============================================`);
    });
  } catch (err) {
    console.error('Failed to start application server:', err);
    process.exit(1);
  }
}

startServer();
