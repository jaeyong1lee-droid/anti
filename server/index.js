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
  '\u20AC': 0x80, // ??
  '\u201A': 0x82, // ??
  '\u0192': 0x83, // ?
  '\u201E': 0x84, // ??
  '\u2026': 0x85, // ??
  '\u2020': 0x86, // ??
  '\u2021': 0x87, // ??
  '\u02C6': 0x88, // ?
  '\u2030': 0x89, // ??
  '\u0160': 0x8A, // Š
  '\u2039': 0x8B, // ??
  '\u0152': 0x8C, // Œ
  '\u017D': 0x8E, // Ž
  '\u2018': 0x91, // ??
  '\u2019': 0x92, // ??
  '\u201C': 0x93, // ??
  '\u201D': 0x94, // ??
  '\u2022': 0x95, // ??
  '\u2013': 0x96, // ??
  '\u2014': 0x97, // ??
  '\u02DC': 0x98, // ?
  '\u2122': 0x99, // ??
  '\u0161': 0x9A, // š
  '\u203A': 0x9B, // ??
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
      
      const originalKoreanCount = (decodedText.match(/[가-??/g) || []).length;
      const restoredKoreanCount = (restoredText.match(/[가-??/g) || []).length;
      
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
    '&euro;': '??,
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
      s.endsWith('??') || s.endsWith('??') || s.endsWith('??') || s.endsWith('??') ||
      s.endsWith('??) || s.endsWith('??) || s.endsWith('??) || s.endsWith('??) ||
      s.includes('??) || s.includes('기반') || s.includes('구조') || s.includes('?�징') ||
      s.includes('공법') || s.includes('방식') || s.includes('?�행') || s.includes('?�계') ||
      s.includes('?��?') || s.includes('?�토') || s.includes('?�괴') || s.includes('?�험') ||
      s.includes('?�력') || s.includes('지�?) || s.includes('강도')
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
            sTrim.includes('공식') || sTrim.includes('?�식') || sTrim.includes('관계식') || sTrim.includes('계산??) || sTrim.includes('방정??) ||
            sTrim.includes(' F.S ') || sTrim.includes('OCR') || sTrim.includes('?�행?��?') || sTrim.includes('과압밀') || sTrim.includes('?�괴 규�???));
  }).map(s => s.trim()).filter(s => s.length > 15 && s.length < 200);

  result.extractedFormulas = Array.from(new Set(formulaCandidates)).slice(0, 3);

  // Parse distinct keywords based on noun-like occurrences
  const words = cleanText.match(/[a-zA-Z가-??-9]{3,10}/g) || [];
  const wordFreq = {};
  const stopWords = ['?�?�여', '?�??, '?�으�?, '?�는', '?�습?�다', '?�는', '?�니??, '?�라', '?�해', '?�해', '그리�?, '?�라??, '?�는', '?�한', '?�한', '?��?', '것이??, '?�의'];
  
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
    type: '개념 문제 (10??',
    question: `?��???Single Shell) ?�널 공법???�의 �?기존 NATM 공법(?�중 ??과의 차별?�된 구조??메커?�즘???�명?�시??`,
    concept: `?��????�널 공법?� 1�?지보재(?�크리트, ?�볼???� 2�??�이?�을 ?�합?�여 ?�일 ?�구 지�?구조(Single Shell)�??�널???�성?�는 공법?�니?? ?��? 지?�수�?배수?�키??배수?�과 ?�압??직접 견디??비배?�형?�로 분류?�니??`,
    formula: `[?�수 개념??구성 ?�소]\n1. ?�크리트 + ?�볼??+ 방수???�체???�면???�식 ?�수\n2. ?�크리트 ?�력분포곡선 (?�력 ?�분�?메커?�즘)\n3. ?�볼??축력 분배공식: $T = P \\times r$ ( $T$ : ?�장?? $P$ : ?�압, $r$ : ?�널 반경)`,
    structure: `1?�락: ?��????�널 공법???�의 �??�장 배경 (NATM ?��?공기?�축/공사�??�감 ?�구)\n2?�락: ?��????�널??구조??메커?�즘 �?지�?지보재 거동 ?�성 (?�중 ?�과??비교??\n3?�락: ?�장 ?�용 ??리스???�크리트 균열, 지?�수 ?�수) �?기술?�로?�의 ?�공 ?�질 ?�보 ?��?
  };

  const q2 = {
    type: '공식 문제 (25??',
    question: `?�널 공학 관?�에???��???공법 ?�용 ???�크리트?� 지반의 ?�체??Bonding) 거동 ?�성???�하�? ?�기 ?�뢰??Reliability) ?�보�??�한 방수 ?�트 간소??공정 �??�공 ??고려?�항??기술?�시??`,
    concept: `?�크리트?� ?�반???�단 ?�착 강도(Bonding Strength)�?극�??�하??지�??�체???�단 ?�??��???�용?�고, 고성???�유보강 ?�크리트(SFRC)�??�해 ?�구 지보재로서???�인???�성???�보?�는 공법?�니??`,
    formula: `[?�크리트 ?�께 ?�정 공식 (Rabcewicz 공식)]\n- $t = \\frac{P - 2C \\sin\\varphi}{\\gamma \\tan\\varphi + \\frac{2S}{D}}$\n  ( $t$ : ?�께, $P$ : 지반압, $C$ : ?�착?? $\\varphi$ : ?��?마찰�? $S$ : ?�단강도, $D$ : ?�널 직경)`,
    structure: `1?�락: ?�구 지보재로서 ?��????�크리트-지�??�호?�용(Soil-Structure Interaction)???�의\n2?�락: ?�크리트 ?�단 ?�착 거동 ?�성 �?SFRC(?�유보강)???�한 ?�성 증�? ?�과 메커?�즘\n3?�락: 방수/배수 ?�체???�스???�공 ?�세 �??�구 ?�크리트 ?�기 ?�화(중성?? ?�산?��??? 방�? ?��?
  };

  const mcQuestions = [
    {
      type: '객�???(4지?�다)',
      question: `?��????�널 공법�?기존 NATM ?�중 ??Double Shell) 공법??차이?�에 ?�???�명?�로 가???�절?��? ?��? 것�??`,
      options: shuffleArray([
        "?��???공법?� 1�?지보재?� 2�??�이?�을 ?�합?�여 ?�일 ?�구 지�?구조�??�성?�다.",
        "NATM ?�중 ??공법?� ?�크리트 배면??방수 ?�트�?기�??�로 ?�외�?구조가 분리?�어 거동?�다.",
        "?��???공법?� ?�이??콘크리트�?별도�??�?�하므�?NATM ?��?공기?�축 ?�과가 ?��? ?�다.",
        "?��???공법?� ?��? 지?�수�?배수?�키??배수?�과 ?�압??견디??비배?�형?�로 ?�계????"
      ]),
      answer: "?��???공법?� ?�이??콘크리트�?별도�??�?�하므�?NATM ?��?공기?�축 ?�과가 ?��? ?�다.",
      explanation: "?��???공법?� 1�?지보�? 2�??�이?�을 ?�체?�하???�공?��?�?NATM ?�중??공법 ?��?공기 ?�축 �?공사�??�감 ?�과가 ?�수?�니?? ?�라??공기?�축 ?�과가 ?��? ?�다??진술?� ?�답?�니??"
    },
    {
      type: '객�???(4지?�다)',
      question: `?��????�널?�서 ?�크리트?� 지�??�반)??부�?Bonding) ?�성??중요????��???�유�?가???�바�?것�??`,
      options: shuffleArray([
        "?�크리트?� ?�반???�단 ?�착 강도�?극�??�하??지�??�체???�립?�을 최�????�용?�기 ?�함?�다.",
        "?�크리트 배면??지?�수�??�활?�게 ?�입?�켜 ?�압??최�??�하�??�함?�다.",
        "?�널 ?�이?�의 균열???�도?�여 ?�력??집중?�키�??�함?�다.",
        "?�볼?�의 ?�치 개수�??�???�리�??�한 ?�제조건?�다."
      ]),
      answer: "?�크리트?� ?�반???�단 ?�착 강도�?극�??�하??지�??�체???�립?�을 최�????�용?�기 ?�함?�다.",
      explanation: "?��???공법?� ?�크리트?� ?�반???�착 ?�력???�해 ?�력 ?�분배�? ?�도?�고 지반의 ?�칭 ?�과(?�립??�?극�??�하??것이 ?�심 메커?�즘?�니??"
    },
    {
      type: '객�???(4지?�다)',
      question: `?��???공법?�서 ?�크리트 ?�께�??�정?�기 ?�해 ?�용?�는 고전?�인 구조 ?�계 공식?� 무엇?��??`,
      options: shuffleArray([
        "Rabcewicz 공식",
        "Darcy 공식",
        "Prandtl 공식",
        "Terzaghi 공식"
      ]),
      answer: "Rabcewicz 공식",
      explanation: "?�널 구조 ?�계 ???�크리트 ?�께(t) ?�정???�해 지반압, ?��?마찰�? ?�크리트 ?�단강도 ?�을 고려?�는 Rabcewicz 공식???�통?�으�??�리 ?�용?�니??"
    },
    {
      type: '객�???(4지?�다)',
      question: `비배??Hydraulic) ?��????�널 ?�계 ?? ?�널 ?�이??배면 ?�압(Water Pressure) ?�정???�해 ?�용?�는 기본?�인 ?�두 관계식?�로 가???�절??것�??`,
      options: shuffleArray([
        "p_w = γ_w × H (γ_w: 물의 ?�위중량, H: ?�두)",
        "p_w = γ_w / H",
        "p_w = k × i",
        "p_w = OCR × p_0"
      ]),
      answer: "p_w = γ_w × H (γ_w: 물의 ?�위중량, H: ?�두)",
      explanation: "비배???�널 ?�이??배면???�용?�는 ?�수??Hydrostatic Pressure)?� 지?�수???�래?�서??깊이(?�두, H)?� 물의 ?�위중량(γ_w)??곱으�??�정?�니??"
    },
    {
      type: '객�???(4지?�다)',
      question: `?��????�크리트???�기 ?�뢰??Long-term Reliability)???�?�하???�학???�화 ?�인�?가??거리가 �?것�??`,
      options: shuffleArray([
        "?�크리트??중성??Carbonation)",
        "지?�수 ???�산??침투???�한 ?�산??부??,
        "?��?중의 질소 가??결합???�한 급격??질화 ?�창",
        "보강 ?�유 �?격자지보의 ?�기 부???�상"
      ]),
      answer: "?��?중의 질소 가??결합???�한 급격??질화 ?�창",
      explanation: "콘크리트??주요 ?�화 메커?�즘?� ?�산?�탄?�에 ?�한 중성?? 지?�수 ?�산??부?? 철근/보강?�유 부???�이�??��?질소???�한 질화 ?�창?� 콘크리트 ?�화??주요 ?�인???�닙?�다."
    },
    {
      type: '객�???(4지?�다)',
      question: `?��???공법 ?�계 ??배수??Drained) ?�스?�과 비교??비배?�형(Non-drained/Hydraulic) ?�스?�의 ?�징?�로 ?��? ?��? 것�??`,
      options: shuffleArray([
        "?�널 배면??방수막을 ?�치?�여 지?�수???�널 ?�입??차단?�다.",
        "?�널 주�???지?�수???�?��? ?�발?��?�?주�? 지�?침하 리스?��? ?�다.",
        "?�널 배면???�수?�이 ?�시 ?�용?��?�??�이???�께가 ?�꺼?�진??",
        "?�자??보존 �??�경 ?�향??최소?�해???�는 ?�심지 ?�널??주로 ?�용?�다."
      ]),
      answer: "?�널 주�???지?�수???�?��? ?�발?��?�?주�? 지�?침하 리스?��? ?�다.",
      explanation: "비배?�형 ?�스?��? 지?�수???�널 ?�입??차단?�여 지?�수?��? 그�?�??��??��?�? 주�? 지?�수???�?�에 ?�른 지�?침하 리스?��? 매우 ??��?�다. 반면 배수?��? 지?�수 배출�??�한 ?�위 ?�?��? 침하 ?�려가 ?�습?�다."
    },
    {
      type: '객�???(4지?�다)',
      question: `?��????�크리트??취성 ?�괴�?방�??�고 ?�인??Flexural Toughness)??극�??�하�??�해 첨�??�는 ?�심 ?�료??무엇?��??`,
      options: shuffleArray([
        "강섬??Steel Fiber) ?�는 ?�성?�유",
        "지?�수??급결??Accelerator)",
        "?�리�???Silica Fume)",
        "벤토?�이??Bentonite) ?�토 분말"
      ]),
      answer: "강섬??Steel Fiber) ?�는 ?�성?�유",
      explanation: "?�유보강 ?�크리트(SFRC)??콘크리트 ?��???미세??강섬?�나 ?�성?�유�?균일?�게 분산?�켜 ?�장 강도?� ?�인?�을 ?�상?�키�?균열 발생???�과?�으�??�제?�니??"
    },
    {
      type: '객�???(4지?�다)',
      question: `NATM ?��????�널??거동 분석???�해 ?�용?�는 지�?반응 곡선(GRC)�?지�??�한 곡선(LSC)??관???�명?�로 가???�바�?것�??`,
      options: shuffleArray([
        "GRC???�널 굴착 ??지�??�압 감소???�른 막장�?천단부 변??증�? 거동???��??�다.",
        "지보재???�치 ?�기가 빠�??�록 GRC 곡선?� ?�로 급격???�동?�다.",
        "LSC 곡선?� 지반의 ?�중 변?�만???�량?�으�??��??�는 ?�?�나?�형 곡선?�다.",
        "GRC?� LSC가 만나??교점?� ?�널??무조�?붕괴?�는 극한 ?�태�??��??�다."
      ]),
      answer: "GRC???�널 굴착 ??지�??�압 감소???�른 막장�?천단부 변??증�? 거동???��??�다.",
      explanation: "GRC(Ground Reaction Curve)???�널 변?��? 증�??�에 ?�라 지�??�스�?지지?�는 ?�력 ?�태??변?��? ?��??�며, LSC?�??교점?� ?�널 변?��? 지보재가 조화�?�� ?�형???�루???�정?�되???�형 ?�렴 ?�태�??��??�니??"
    }
  ];

  return [q1, q2, ...mcQuestions];
}

// Built-in Expert-Grade PE Questions for Prandtl's Bearing Capacity Theory
function getPrandtlExpertQuestions(title, keywords) {
  const q1 = {
    type: '개념 문제 (10??',
    question: `?��? 기초??극한 지지??결정???�한 ?��??�(Prandtl)??지지???�론??가??조건 �??�성?�형 ?�역(Failure Zone)??구성 ?�소�??�명?�시??`,
    concept: `?��??� 지지???�론?� 기초 ?��? 지반을 강소?�체(Rigid-Plastic)�?가?�하�? 기초 극한 ?�중 ???�성 ?�괴 ?�역??3개의 ?�역(?�성 ?��??�기, ?�?�나??방사???�단, ??�� ?�동 ?�역)?�로 구분?�여 지지??공식???�도??고전 ?�성�?기반 지???�론?�니??`,
    formula: `[Failure Zone 구성]\n?��??? ?�성 ?�기(Elastic Wedge)\n?��??? 방사???�단(Radial Shear Zone, ?�?�나??경로)\n????? ?�동 ??�� ?�기(Passive Rankine Zone)\n기본 공식: $q_{ult} = c N_c + q N_q$`,
    structure: `1?�락: ?��??� 지지???�론??공학???�의 �??�의 (지�?극한 ?�성 ?�형 ?�론??기초)\n2?�락: ?�성?�괴 ?�역??Failure Zone Diagram) ?�식??�??�역�??? ?? ?? 거동 ?�성\n3?�락: ?��??� ?�론???�계??(지�??�중 γ??무시) �??�르?�기(Terzaghi) 지지??공식?�로??발전 과정`
  };

  const q2 = {
    type: '공식 문제 (25??',
    question: `지반공?�에???��??�(Prandtl) 지지???�론???�론??배경�?극한지지???�도 과정???�술?�고, 지반의 ?�중(γ)??고려???�르?�기(Terzaghi) �?마이?�호??Meyerhof) 지지??공식과의 차별?�을 기초 ?�상 �?경사 ?�중 조건??중심?�로 ?�하?�오.`,
    concept: `?�성 ??��???�립?�인�?Slip Line Method)???�질??��??최초 ?�용???�론?�로, ?��??� 공식??지�??�중 ??0.5·γ·B·N_γ)�??�상/깊이/경사 계수�?보완?�여 ?�무 ?�계??Terzaghi, Meyerhof, Vesic 공식???�성?�었?�니??`,
    formula: `[Terzaghi 지지??공식 (?�속기초)]\n- $q_{ult} = c N_c + q N_q + 0.5 \gamma B N_{\gamma}$\n- ?�상계수 고려 (?�사각형 기초): $q_{ult} = 1.3 c N_c + q N_q + 0.4 \gamma B N_{\gamma}$\n( $N_c$ , $N_q$ , $N_{\gamma}$ : 지지??계수)`,
    structure: `1?�락: 극한 ?�형 ?�태?� 지�??�성?�동 법칙??관�?�??��??� ?�론???�상\n2?�락: Prandtl 지지???�론 and Terzaghi, Meyerhof 공식??비교 분석 (지�??�중, 기초 조도, ?�상, 지?�수???�향)\n3?�락: ?�무 ?�계 ???�전??F.S=3.0) ?�정 기�? �??��? ?�중 ?�심/경사???�른 지지??감소 ?��?
  };

  const mcQuestions = [
    {
      type: '객�???(4지?�다)',
      question: `?��??�(Prandtl) 지지???�론?�서 가?�하??지반의 ??��??모델�?가???�절??것�??`,
      options: shuffleArray([
        "?�소??Elasto-plastic) 모델",
        "?�전 강소??Rigid-Perfect Plastic) 모델",
        "?�형 ?�성(Linear Elastic) 모델",
        "?�탄??Visco-elastic) 모델"
      ]),
      answer: "?�전 강소??Rigid-Perfect Plastic) 모델",
      explanation: "?��??� 지지???�론?� ?�의 ?�단 ?�괴 ??지반의 ?�성 변?�을 무시?�고, 지반을 ?�축?�이 ?��? ?�는 ?�전 강소?�체�?가?�하???�립?�인법을 ?�용?�습?�다."
    },
    {
      type: '객�???(4지?�다)',
      question: `?��??�???�성 ?�괴 ?�역(Failure Zone) �?기초 직하부???�성?�며, 기초?� ?�께 ?�체�??�강?�다�?가?�하???�역(?��?????명칭?�?`,
      options: shuffleArray([
        "?�성 ?��??�기 ?�역 (Elastic Wedge)",
        "방사???�단 ?�역 (Radial Shear Zone)",
        "??�� ?�동 ?�역 (Rankine Passive Zone)",
        "?�?�나???�단 ?�역 (Logarithmic Spiral Zone)"
      ]),
      answer: "?�성 ?��??�기 ?�역 (Elastic Wedge)",
      explanation: "기초 직하부???��???? 기초 ?�면과??마찰�??�해 ?�괴?��? ?�고 기초?� ?�체�??�향 ?�동?�는 ?�성 ?�기(Elastic Wedge) ?�태�?존재?�니??"
    },
    {
      type: '객�???(4지?�다)',
      question: `?��??� 지지???�론??극한 지지??공식(?�속기초 기�?)?�로 ?��? ?��? 것�?? (?? c???�착?? N_c, N_q??지지??계수, q??기초 ?�면의 ?�재?�중?�다)`,
      options: shuffleArray([
        "q_ult = c·N_c + q·N_q",
        "q_ult = c·N_c + q·N_q + 0.5·γ·B·N_γ",
        "q_ult = c·cot?·[tan^2(45°+?/2)·e^(?·tan?) - 1] + q·tan^2(45°+?/2)·e^(?·tan?)",
        "?��??� 공식?� 지�??�체???�위중량(γ)??0?�로 무시?�고 ?�도?�었??"
      ]),
      answer: "q_ult = c·N_c + q·N_q + 0.5·γ·B·N_γ",
      explanation: "?��??�?� 지�??�체???�중(γ)??무시?��??��?�? ?�중 ??�� 0.5·γ·B·N_γ가 ?�함??공식?� ?�르?�기 공식?�며 ?��??� 공식???�닙?�다."
    },
    {
      type: '객�???(4지?�다)',
      question: `?��??� 지지?�성 ?�형 ?�역 �??�?�나??Logarithmic Spiral) ?�상?�로 ?�괴면이 발달?�며 방사?�으�??�단???�어?�는 ?�역(?��?????명칭?�?`,
      options: shuffleArray([
        "??�� 주동 ?�역 (Rankine Active Zone)",
        "??�� ?�동 ?�역 (Rankine Passive Zone)",
        "방사???�단 ?�역 (Radial Shear Zone)",
        "?�성 방사 ?�기 ?�역"
      ]),
      answer: "방사???�단 ?�역 (Radial Shear Zone)",
      explanation: "?��???? 기초 ?��? ?�성?�동??측면?�로 ?�장?�는 과도�??�역?�로, ?�단 ?�괴?�이 ?�?�나??경로�?그리�?방사???�단(Radial Shear Zone) 거동??보입?�다."
    },
    {
      type: '객�???(4지?�다)',
      question: `?�르?�기(Terzaghi) 지지??공식???��??�(Prandtl) ?�론???�계�?극복?�기 ?�해 추�????�심 공학???�자??무엇?��??`,
      options: shuffleArray([
        "지�??�체???�위중량(γ)???�한 ?�중 ?�과",
        "기초 ?��??�재?�중(q)???�한 ?�재 ?�중 ?�과",
        "?�의 ?�착??c)???�한 ?�단 ?�???�과",
        "기초 ?�면과 ???�이???�전 ?�성 조건"
      ]),
      answer: "지�??�체???�위중량(γ)???�한 ?�중 ?�과",
      explanation: "?��??� ?�론?� 지�??�중(γ)??무시?��??�나, Terzaghi??지�??�중???�한 지지???�향 ??0.5·γ·B·N_γ)???�안?�고 겹침???�리(Superposition Principle)�??�해 ?��? 공식?�했?�니??"
    },
    {
      type: '객�???(4지?�다)',
      question: `?�질??지반의 극한 지지???�험 ?? 모래가 조�???경우?� ?�슨??경우???�단 ?�괴 모드???�???�명?�로 ?�바르�? ?��? 것�??`,
      options: shuffleArray([
        "조�???모래 지반에?�는 급격?�고 명확???�면 ?�단 ?�괴(General Shear Failure)가 주로 발생?�다.",
        "?�슨??모래???�약???�성?�에?�는 지�??�괴면이 불완?�하�??�멸?�는 �?? ?�단 ?�괴(Local Shear Failure)가 발생?�기 ?�다.",
        "매우 ?�슨??모래?�서??기초가 ?�고 ?�어가???��??�단 ?�괴(Punching Shear Failure)가 지배적?�다.",
        "지반이 ?�슨????�?? ?�단 ?�괴가 ?�려?�면 ?�착??c)�?마찰�??)??각각 2배로 증�??�켜 ?�계?�야 ?�정?�이??"
      ]),
      answer: "지반이 ?�슨????�?? ?�단 ?�괴가 ?�려?�면 ?�착??c)�?마찰�??)??각각 2배로 증�??�켜 ?�계?�야 ?�정?�이??",
      explanation: "�?? ?�단 ?�괴가 ?�려?�는 ?�슨??지�??�계 ?�에???�히???�전??측면?�서 ?�착??c)�?마찰�?tan?)???�기�?2/3 ?��??�로 감쇄(c' = 2/3 c, tan?' = 2/3 tan?) ?�키??감쇄법을 ?�용?�야 ?�니??"
    },
    {
      type: '객�???(4지?�다)',
      question: `마이?�호??Meyerhof) 지지???�론??기존 ?�르?�기(Terzaghi) 지지???�론 ?��?개선???�심 ?�항???�닌 것�??`,
      options: shuffleArray([
        "기초??근입 깊이(D_f) 증�????�른 측면 ?�단 ?�??��(기초 배면 ?�의 강도)??반영?��???",
        "기초 ?��????�용?�는 ?�중??경사 계수(Inclination Factors)�?공식?�하?�??",
        "지�??�중(γ)??존재�?배제?�고 기초 ??B)??중요?�을 ?�전???�외?��???",
        "기초??3차원 ?�상 계수(Shape Factors) �?깊이 계수�?체계?�으�??�립?��???"
      ]),
      answer: "지�??�중(γ)??존재�?배제?�고 기초 ??B)??중요?�을 ?�전???�외?��???",
      explanation: "Meyerhof??지�??�중(γ) �?기초 ??B)??중요 ?�자�??�루?�으�? Terzaghi 공식???�상 계수, 깊이 계수, ?�중 경사 계수�?곱하???�장 ?�계 공식???�안?�습?�다."
    },
    {
      type: '객�???(4지?�다)',
      question: `기초 지반의 극한 지지??q_ult)???�용 지지??q_allow)?�로 ?�산?�기 ?�해 지�?공학?�서 ?�속기초???�용?�는 보편?�인 ?�전??F.S) ?�계 ?�치 기�??�로 ?�바�?것�??`,
      options: shuffleArray([
        "F.S = 1.0",
        "F.S >= 3.0",
        "F.S = 0.5 ~ 0.8",
        "F.S = 1.2 ~ 1.5"
      ]),
      answer: "F.S >= 3.0",
      explanation: "지반의 불균질성 �?지지??거동??불확?�성??고려?�여, ?��? 기초??지지???�계 ???�상 3.0 ?�상??충분???�전?�을 ?�용?�여 ?�용 지지?�을 결정?�니??"
    }
  ];

  return [q1, q2, ...mcQuestions];
}

// Helper function to generate technical and high-quality PE questions locally (Dynamic domain-agnostic fallback)
function generateFallbackQuestions(title, keywords, fileText = '') {
  const cleanTitle = title.toLowerCase();
  const cleanText = fileText.toLowerCase();

  // Route to Expert Built-in Review Content if matching keyword is detected!
  if (cleanTitle.includes('?��???) || cleanTitle.includes('single shell') || cleanTitle.includes('single_shell') || cleanText.includes('?��???) || cleanText.includes('single shell')) {
    console.log("Routing to Built-in Expert PE Content: Single Shell Tunnel Method");
    return getSingleShellExpertQuestions(title, keywords);
  }

  if (cleanTitle.includes('?��??�') || cleanTitle.includes('prandtl') || cleanTitle.includes('지지??) || cleanText.includes('?��??�') || cleanText.includes('prandtl') || cleanText.includes('bearing_capacity')) {
    console.log("Routing to Built-in Expert PE Content: Prandtl's Bearing Capacity Theory");
    return getPrandtlExpertQuestions(title, keywords);
  }

  // Dynamic Content Mining (For unknown topics)
  const features = extractFeaturesFromText(fileText);
  
  // Merge user keywords and extracted keywords
  const userKwList = keywords ? keywords.split(/[,#\s]+/).filter(Boolean) : [];
  const mergedKw = Array.from(new Set([...userKwList, ...features.extractedKeywords])).slice(0, 6);
  if (mergedKw.length === 0) {
    mergedKw.push('?�심 공법');
    mergedKw.push('최적 ?�계');
    mergedKw.push('?�전??);
  }
  const keywordDisplay = mergedKw.join(', ');

  const s0 = features.keySentences[0] || `[${title}]?�/???��? 기술 ?�무?�서 ?�심?�인 ?�의?� 고유???��??�어�??�계�??�함?�니??`;
  const s1 = features.keySentences[1] || `?�심 구성 ?�소??${mergedKw.slice(0, 3).join(', ')}???�호 메커?�즘??규명?�고 최적?�하??것이 ?�공 ?�인?�니??`;
  const s2 = features.keySentences[2] || `구축 �??�무 ?�장 ?�입 과정???�상 리스?��? ?�제 ?�제?�고 ?�계 ?�전??가?�드�??�립?�야 ?�니??`;
  const s3 = features.keySentences[3] || `?�량??물리/?�학??모델?�과 개념??배치�??�계 ?��???준?�여 ?�성?�야 ?�니??`;

  // Title-based classification (Highest priority)
  const isTitleSoil = cleanTitle.includes('?��?') || cleanTitle.includes('?�토') || cleanTitle.includes('?�단') || cleanTitle.includes('?�괴') || cleanTitle.includes('지지??) || cleanTitle.includes('??) || cleanTitle.includes('지�?) || cleanTitle.includes('clay') || cleanTitle.includes('shear') || cleanTitle.includes('consolidation') || cleanTitle.includes('mohr') || cleanTitle.includes('c-phi') || cleanTitle.includes('c - phi');
  const isTitleHydraulics = cleanTitle.includes('seepage') || cleanTitle.includes('discharge') || cleanTitle.includes('velocity') || cleanTitle.includes('flow') || cleanTitle.includes('permeability') || cleanTitle.includes('?�수') || cleanTitle.includes('침투') || cleanTitle.includes('?�출') || cleanTitle.includes('?�두') || cleanTitle.includes('darcy');
  const isTitleTunnel = cleanTitle.includes('?�널') || cleanTitle.includes('tunnel') || cleanTitle.includes('natm') || cleanTitle.includes('?�반') || cleanTitle.includes('지�?) || cleanTitle.includes('?�크리트') || cleanTitle.includes('?�볼??) || cleanTitle.includes('?�이??);

  let domain = 'general';
  if (isTitleSoil) {
    domain = 'soil';
  } else if (isTitleHydraulics) {
    domain = 'hydraulics';
  } else if (isTitleTunnel) {
    domain = 'tunnel';
  } else {
    // Text-based classification fallback (If title is non-descriptive)
    const hasSoilText = cleanText.includes('?��?') || cleanText.includes('?�토') || cleanText.includes('?�효?�력') || cleanText.includes('?�단강도') || cleanText.includes('?�행?��?');
    const hasHydraulicsText = cleanText.includes('seepage') || cleanText.includes('darcy') || cleanText.includes('?�수계수') || cleanText.includes('?�수경사') || cleanText.includes('?�이??) || cleanText.includes('piping');
    const hasTunnelText = cleanText.includes('지보재') || cleanText.includes('?�볼??) || cleanText.includes('?�크리트') || cleanText.includes('?�널�?);

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
      type: '개념 문제 (10??',
      question: `Darcy???�수 공식??기초?�여 ?�출 ?�도(Discharge Velocity, v)?� ?�제 침투 ?�도(Seepage Velocity, vs)????��???�의 �?차이?�을 간극�?n) 관?�에???�식�??�께 ?�명?�시??`,
      concept: `?�출 ?�도(v)???�의 ?�체 ?�면???�르??가?�의 ?�도??반면, ?�제 침투 ?�도(vs)?????�자 ?�이???�제 공극만을 ?�르???�제 ?�도?�며 vs = v / n 공식?�로 ?�의?�니??`,
      formula: `[Darcy??법칙 �?침투?�도 공식]\n- ?�출?�도(체적?�도): $v = k \\times i$\n- ?�제 침투?�도: $v_s = \\frac{v}{n} = \\frac{k \\times i}{n}$ ( $n$ : 간극�? $k$ : ?�수계수, $i$ : ?�수경사)`,
      structure: `1?�락: Darcy 법칙??기본 개념 �??�수 ?�름 ?�동???�징\n2?�락: ?�출 ?�도(v)?� ?�제 침투 ?�도(v_s)???�식???�도 �?간극률에 ?�른 거동 ?��?n3?�락: ?�수경사 증�????�른 지�???Piping 방�? ?��?�??�무???�수 ?�어 방안`
    };
    q2 = {
      type: '공식 문제 (25??',
      question: `지�???지?�수 ?�름 ??발생?�는 침투??Seepage Force)??발생 메커?�즘??규명?�고, ?�계?�수경사(Critical Hydraulic Gradient)??공식 ?�도 과정 �?분사?�상(Quick Sand) 방�?�??�한 ?�전??F.S) ?�계 기�????�술?�시??`,
      concept: `?�향 침투?�으�??�해 ?�효?�력??0???�는 ?�태�?분사?�상?�라 ?�며, ?�때???�수경사???�계?�수경사(icr)?� ?�제 ?�수경사(i)??비�? ?�해 침투 ?�전?�을 ?��??�니??`,
      formula: `[?�계?�수경사 �?침투 ?�정??공식]\n- ?�계?�수경사: $i_{cr} = \\frac{G_s - 1}{1 + e}$ ( $G_s$ : ???�자 비중, $e$ : 간극�?\n- 침투???�위체적??: $j = i \\times \\gamma_w$ ( $i$ : ?�수경사, $\\gamma_w$ : 물의 ?�위중량)\n- 분사?�상 ?�전?? $F.S = \\frac{i_{cr}}{i} \\ge 1.5 \\sim 2.0$`,
      structure: `1?�락: 지�???침투?�의 ?�향 ?�름 and 침투??Seepage Force)??물리??메커?�즘\n2?�락: ?�계?�수경사(i_cr) 공식???�계 ?�성 ?�형 ?�태 ?�도 과정 �??�샌???�상 ?��?n3?�락: 차수�?�??�터???�치�??�한 ?�수경사 ?�어 기법 �??�계 ?�전???�보 ?�언`
    };
    mcQuestions = [
      {
        type: '객�???(4지?�다)',
        question: `Darcy??법칙(v = k × i)?�서 v(?�출?�도), k(?�수계수), i(?�수경사) ?�이??관계�? 가???�바르게 ?�명??것�??`,
        options: shuffleArray([
          "?�출?�도???�수경사??반비례?�고 ?�수계수??비�??�다.",
          "?�출?�도???�수계수?� ?�수경사 모두??직접 비�??�다.",
          "?�수계수???�수경사???�비례?�며 ?�출?�도?� 무�??�다.",
          "?�수경사가 무한??커�?�??�출?�도??0?�로 ?�렴?�다."
        ]),
        answer: "?�출?�도???�수계수?� ?�수경사 모두??직접 비�??�다.",
        explanation: "Darcy???�수 공식???�르�??�출?�도(v)???�의 ?�수계수(k)?� 침투 ?�동???�수경사(i)??곱으�??�의?��?�????�자 모두??직접 비�??�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `?�제 ???�자 ?�이??공극???�르???�제 침투 ?�도(vs)?� 가?�의 ?�출 ?�도(v)???��?관계�? ?�의?�는 변?�로 ?��? 것�??`,
        options: shuffleArray([
          "간극�?(Porosity, n)",
          "과압밀�?(OCR)",
          "?�수계수 (k)",
          "?�착??(c)"
        ]),
        answer: "간극�?(Porosity, n)",
        explanation: "?�제 물이 ?�르???�면?��? ?�체 ???�면?�보???�기 ?�문???�제 침투 ?�도(vs)????�� ?�출 ?�도(v)보다 ?�며, vs = v / n (n: 간극�?�??�의?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `지�????�향 침투류�? ?��? ???�효?�력??0???�어 ???�자가 물과 ?�께 분출?�는 ?�상??명칭?�?`,
        options: shuffleArray([
          "?��? ?�상 (Consolidation)",
          "분사 ?�상 ?�는 ?�샌???�상 (Quick Sand)",
          "?�일?�이?�시 ?�상 (Dilatancy)",
          "?�리???�상 (Creep)"
        ]),
        answer: "분사 ?�상 ?�는 ?�샌???�상 (Quick Sand)",
        explanation: "모래 지반에???�향 침투?�이 ?�의 ?�효 ?�위중량�?같아???�효?�력??0???�으로써 지반의 ?�단강도가 ?�실?�어 분출?�는 ?�상??분사 ?�상(Quick Sand) ?�는 ?�음 ?�상(Boiling)?�라�??�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `???�자??비중??2.65?�고 간극�?e)가 0.65???�질??지반의 ?�계?�수경사(icr)???�마?��??`,
        options: shuffleArray([
          "1.0",
          "0.5",
          "1.5",
          "2.0"
        ]),
        answer: "1.0",
        explanation: "?�계?�수경사 공식 i_cr = (G_s - 1) / (1 + e) ??값을 ?�?�하�?(2.65 - 1) / (1 + 0.65) = 1.65 / 1.65 = 1.0 ???�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `지?�수 침투??Seepage Force)???�용 방향???�???�명?�로 가???�바�?것�??`,
        options: shuffleArray([
          "?�제???�직 ?�향?�로�??�용?�다.",
          "침투 ?�름??방향(?�선 방향)�??�일??방향?�로 ?�용?�다.",
          "?�수경사?� ?�직??방향?�로 ?�용?�다.",
          "지반의 ?�응?�이 감소?�는 반�? 방향?�로 ?�용?�다."
        ]),
        answer: "침투 ?�름??방향(?�선 방향)�??�일??방향?�로 ?�용?�다.",
        explanation: "침투??Seepage Force)?� 물이 ???�을 ?�르면서 ???�자??가?�는 마찰?�이�? �?방향?� ??�� 물이 ?�르???�선(Flow Line)??방향�?같습?�다."
      },
      {
        type: '객�???(4지?�다)',
        question: `분사?�상(Quick Sand)??방�??�기 ?�한 공학???�책으�?가???�절?��? ?��? 것�??`,
        options: shuffleArray([
          "차수�??�트?�일 ????지�???깊이 ?�치?�여 침투 경로�?길게 만든??",
          "?�류 측의 지?�수?��? 강제?�으�?급격???�승?�킨??",
          "?�류 쪽에 ?�터???�는 가�?블랭??Surcharge)???�치?�여 ?�향 침투?�에 ?�??��??",
          "?�포?�트 ??배수 공법???�용?�여 지�?지?�수?�을 ?�?�시?�다."
        ]),
        answer: "?�류 측의 지?�수?��? 강제?�으�?급격???�승?�킨??",
        explanation: "?�류 �?지?�수?��? ?�승?�면 ?�하�??�위 차�? 커져 ?�수경사(i)가 증�??��?�?분사?�상 발생 ?�험???�아집니?? ?�라???�는 ?�못???�책입?�다."
      },
      {
        type: '객�???(4지?�다)',
        question: `침투 ?�석 �?차수�??�계 ???�평 ?�수계수?� ?�직 ?�수계수가 ?�른 ?�방??지반을 ?�루�??�해 ?�선망을 ?�도????취하??변??방법?�?`,
        options: shuffleArray([
          "지반의 ?�평 좌표(x�?�??�수계수 비율??맞추??축소 변?�한??",
          "간극비�? 강제�?1.0?�로 고정?�여 ?�방?�으�?취급?�다.",
          "?�수경사�??�직 ?�향?�로�?2�?가?�한??",
          "Darcy??공식 ?�??Mohr-Coulomb 공식?�로 ?�도?�다."
        ]),
        answer: "지반의 ?�평 좌표(x�?�??�수계수 비율??맞추??축소 변?�한??",
        explanation: "?�평 ?�수계수(kx)?� ?�직 ?�수계수(ky)가 ?�른 ?�방??지반에?�는 x_t = x × sqrt(k_y / k_x) ?� 같이 ?�평 좌표�?축소?�여 변?�단�?Transformation Section)??만든 ???�방 지반처???�선망을 ?�도?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `침투�??�선�?Flow Net)???�징 �??�도 규칙???�???�명?�로 ?��? 것�??`,
        options: shuffleArray([
          "?�선(Flow line)�??�수?�선(Potential line)?� 반드??직교?�다.",
          "�??�로�??�과?�는 침투 ?�량?� ?�로 ?�전???�르??",
          "?�접?????�수?�선 ?�이???�두 ?�실?��? ?�류�?갈수�?감소?�다.",
          "?�선망에 ?�해 ?�성?�는 ?�각?��? ?�제???�삼각형?�어???�다."
        ]),
        answer: "?�선(Flow line)�??�수?�선(Potential line)?� 반드??직교?�다.",
        explanation: "?�방??지반에???�선�??�수?�선?� ?�제???�로 직교(90???�며, �??�로�??�르???�량�??�수?�선 간의 ?�차??모두 ?�일?�도�??�선망을 ?�도?�니??"
      }
    ];
  } else if (domain === 'soil') {
    console.log("Generating tailored Geotechnical & Clay local questions.");
    q1 = {
      type: '개념 문제 (10??',
      question: `?�성??지반의 ?��?(Consolidation) 메커?�즘???�효?�력(Effective Stress) ?�리�??�용?�여 ?�명?�고, 과압밀�?OCR)???�른 ?�토??분류(NC?�토, OC?�토) �??�력 ?�력 ?�성???�명?�시??`,
      concept: `?�력???�해 ?�발??과잉간극?�압???�멸?�면???�효?�력???�차 증�??�여 ?�의 체적??감소(?��?)?�는 과정?�며, ?�력 ?�력???�라 ?�규?��?(OCR=1)�?과압밀(OCR>1)�??��?분류?�니??`,
      formula: `[과압밀�?OCR) �??�효?�력 공식]\n- 과압밀�? $OCR = \\frac{p_c}{p_0}$\n- ?�효?�력 ?�리: $\\sigma' = \\sigma - u$\n( $p_c$ : ?�행?��??�력, $p_0$ : ?�재 ?�효?�피?? $\\sigma$ : ?�응?? $u$ : 간극?�압)`,
      structure: `1?�락: ?�성???��???공학???�의 �??�효?�력 증�??�???��?관�?n2?�락: 과압밀�?OCR)???�식 ?�의 �??�토 분류�?N.C, O.C) ?�단 �??�축 거동 비교??n3?�락: ?�토 ?�력 ?�력 ?�단??중요??�?1�?2�??��? 침하?�의 ?�장 거동 ?�어 방안`
    };
    q2 = {
      type: '공식 문제 (25??',
      question: `지반공?�적 ?�계 ???�의 ?�단 ?�괴 ?�락?�을 결정?�는 Mohr-Coulomb ?�괴 규�??�을 ?�명?�고, CD?�험(?��?배수) 조건?�서 ?�규?��??�토?� 과압밀?�토???�단 강도 ?�정 공식 �??�괴 ??부??변???�성(Dilatancy)??비교 기술?�시??`,
      concept: `Mohr-Coulomb ?�론?� ?�의 ?�단강도�??�직?�력, ?�착?? ?��?마찰각의 관계로 ?�의?�며, CD ?�험 ??과압밀?�토???�자 ?�배?�로 ?�해 부?��? ?�창?�는 ?�레?�턴??Dilatancy) ?�상???�어?�니??`,
      formula: `[Mohr-Coulomb ?�단강도 공식]\n- 기본 ?�괴 ?�락?? $s = c + \\sigma \\tan\\varphi$\n- N.C Clay CD ?�단강도: $s = \\sigma' \\tan\\varphi'$ ( $c' = 0$ )\n- O.C Clay CD ?�단강도: $s = c' + \\sigma' \\tan\\varphi'$ ( $c' > 0$ )`,
      structure: `1?�락: Mohr-Coulomb ?�단 ?�괴 ?�라미터(c, ?)???�의 �?지�??�단 ?�??거동\n2?�락: CD ?�험 ?�의 NC/OC ?�토???�단 강도 ?�식??�?변?�률-체적 변??Dilatancy) 메커?�즘 분석\n3?�락: ?�무 ?�계 ???�단 강도?�수 ?�정 ?�의?�항 �??��? 배수 조건??지�?구조물에 미치???�향`
    };
    mcQuestions = [
      {
        type: '객�???(4지?�다)',
        question: `?�성??지반에???�력???�해 ?�발??과잉간극?�압(Excess Pore Water Pressure)???�멸?�면???�효?�력??증�???체적??감소?�는 ?�상??명칭?�?`,
        options: shuffleArray([
          "?�축 (Compression)",
          "?��? (Consolidation)",
          "?�짐 (Compaction)",
          "?�상??(Liquefaction)"
        ]),
        answer: "?��? (Consolidation)",
        explanation: "?��?(Consolidation)?� ?�수?�이 ??? ?�성??지반에???�간??경과?�에 ?�라 과잉간극?�압??배출?�고 ?�효?�력??증�??�여 ?�진?�으�?체적???�축?�는 ?�상?�니?? ?�짐?� ?�질???�에??공기�?배출?�여 밀?��? ?�이???�기 ?�상?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `과압밀�?OCR, Overconsolidation Ratio)가 1.0보다 ??지�?OCR > 1)???��??�는 ?�토??공학??명칭?�?`,
        options: shuffleArray([
          "?�규?��??�토 (NC Clay)",
          "과압밀?�토 (OC Clay)",
          "과소?��??�토 (UC Clay)",
          "비소?�점??(Non-plastic Clay)"
        ]),
        answer: "과압밀?�토 (OC Clay)",
        explanation: "과압밀�?OCR = ?�행?��??�력(pc) / ?�재 ?�효?�력(p0)?�로 ?�의?�며, OCR > 1.0??지반�? 과거???�재보다 ?????�중??받았???�력???�는 과압밀?�토(Overconsolidated Clay)?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `?�의 ?�효?�력(Effective Stress, ?')??구하�??�한 ?�리�??��? 것�?? (?? ????�응?? u??간극?�압?�다)`,
        options: shuffleArray([
          "?' = ? + u",
          "?' = ? - u",
          "?' = ? × u",
          "?' = ? / u"
        ]),
        answer: "?' = ? - u",
        explanation: "?�르?�기???�효?�력 ?�리???�르�? 지�??��????�제 ???�자가 분담?�는 ?�효?�력(?')?� ?�체 ?�력(?�응?? ?)?�서 물이 부?�하??간극?�압(u)??뺀 값으�??�정?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `Mohr-Coulomb ?�괴 규�???공식 's = c + ? × tan?'?�서 �?기호???�의�??�바르�? ?��? 것�??`,
        options: shuffleArray([
          "s: ?�의 ?�단 강도",
          "c: ?�의 ?�착??,
          "?: 기초 ?�면의 침하??,
          "?: ?�의 ?��?마찰�?
        ]),
        answer: "?: 기초 ?�면의 침하??,
        explanation: "Mohr-Coulomb ?�괴 ?�락??공식?�서 ????�괴면에 ?�용?�는 ?�직?�력(Normal Stress)???��??�며, 침하?�과??무�??�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `배수 조건 ?�의 ?�단 ?�험(CD ?�험)?�서 과압밀?�토(OC Clay)가 ?�괴 ??부?��? ?�창?�는 거동 ?�성??명칭?�?`,
        options: shuffleArray([
          "?��? ?�상 (Consolidation)",
          "?�레?�턴???�상 (Dilatancy / Volume Expansion)",
          "?�상???�상 (Liquefaction)",
          "?�리???�상 (Creep)"
        ]),
        answer: "?�레?�턴???�상 (Dilatancy / Volume Expansion)",
        explanation: "과압밀?�토??조�????�질?�는 ?�단 변?�이 ?�어???????�자?�이 ?�로 ?��??�어가면서 조�??�던 구조가 ?�트?�져 부?��? ?�창?�는 ?�레?�턴??Positive Dilatancy) 거동??보입?�다."
      },
      {
        type: '객�???(4지?�다)',
        question: `Terzaghi??1차원 ?��? 방정?�의 가???�항?�로 ?�절?��? ?��? 것�??`,
        options: shuffleArray([
          "???�자?� 물�? ?�축?�이 ?�는 ?�전 비압축성체이??",
          "지�??��???지?�수 침투 ?�름?� 3차원 ?�방???�름?�다.",
          "?�의 ?�수계수?� ?�축?��? ?��? 과정 ?�안 ?�정?�다.",
          "?�질?� 균질?�고 ?�전???�화?�어 ?�다."
        ]),
        answer: "지�??��???지?�수 침투 ?�름?� 3차원 ?�방???�름?�다.",
        explanation: "Terzaghi??1차원 ?��? ?�론?� 지?�수???�름�??�토???�축 변?�이 ?�직 ?�직(1차원) 방향?�로�??�어?�다�?가?�합?�다."
      },
      {
        type: '객�???(4지?�다)',
        question: `?�규?��??�토(NC Clay)???�축?�축 CD ?�험(?��?배수) ???�착??c')???�론???�기�?가???�절??것�??`,
        options: shuffleArray([
          "c' = 0",
          "c' > 100 kPa",
          "c'???�직?�력�???�� 비�??�여 무한??커진??",
          "c'???��?마찰각과 ?�일?�다."
        ]),
        answer: "c' = 0",
        explanation: "?�규?��??�토??과거???�재 ?�상???��? ?�력??받�? ?�이 ?�으므�? ?�전??배수???�태(CD ?�험)?�서???�학???�멘?�이?�이 ?�는 ???�효?�착??c')???�론?�으�?0???�어 강도?�이 ?�점???�과?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `?�심 ?�성??지반의 1�??��? 침하 ?�료 ?? ???�자??구조???�배?�로 ?�해 발생?�는 비정?�적 ?�기 침하 ?�상??명칭?�?`,
        options: shuffleArray([
          "1�??��? 침하",
          "?�성 침하",
          "2�??��? 침하 (Secondary Compression)",
          "즉시 침하"
        ]),
        answer: "2�??��? 침하 (Secondary Compression)",
        explanation: "과잉간극?�압??모두 ?�멸????1�??��? ?�료 ?? ?�효?�력??변???�이 ???�자 골격??지?�적???�리??변?�에 ?�해 발생?�는 ?�기 침하�?2�??��? 침하 ?�는 2�??�축 침하?�고 ?�니??"
      }
    ];
  } else if (domain === 'tunnel') {
    console.log("Generating tailored Tunneling & Rock Mechanics local questions.");
    q1 = {
      type: '개념 문제 (10??',
      question: `?�널 공학 관?�에??NATM 공법??기본 지지 메커?�즘(지�??�체 지지 ?�과) �?1�?지보재(?�크리트, ?�볼?????�동 ?�용 ??��??기술?�시??`,
      concept: `?�널 굴착 ??지�??�스�??�칭 ?�과(Arching Effect)�??�으�??�중??지지?�도�??�고, ?�크리트?� ?�볼?��? 지반과 ?�체?�되???�완 ?�역??보강?�는 메커?�즘?�니??`,
      formula: `[지�?지�??�호?�용 ?�론]\n- 지�?반응 곡선(Ground Reaction Curve) ?�계\n- ?�볼??분배 공식: $T = P \\times r$ ( $T$ : ?�장?? $P$ : 지�??�압, $r$ : ?�널 반경)`,
      structure: `1?�락: NATM 공법???�의 �?강�?�??��?차별?�된 지지 메커?�즘\n2?�락: ?�크리트(?�단/??보강)?� ?�볼??보강/봉합/지반아�??�성)???�기???�호 ?�용\n3?�락: ?�널 굴착 ???�의?�항 �?지�?조사 기반 지�??�턴 결정 ?�로?�스`
    };
    q2 = {
      type: '공식 문제 (25??',
      question: `?�널 굴착???�른 지�?지�??�호?�용(Ground-Support Interaction)???�력 ?�분�?거동 ?�성???�술?�고, 지�?반응 곡선(GRC)�?지�??�한 곡선(LSC)??관계식??준?�여 ?�널 지보재???�정 ?�치 ?�기 결정 방안???�하?�오.`,
      concept: `?�널 굴착???�한 변???�렴?��? 지보재???�성/?�성 변???�???�계�?GRC?� LSC 곡선???�호 ?�점 분석???�해 밝�??�어 ?�정 ?�치 ?�기(?�치 �? Timing Window)�??�계?�는 ?�론?�니??`,
      formula: `[지�?지�??�계 ?�계 변??조건]\n- ?�계 ?�용 ?�전??조건: $P_i = P_g - P_s \\le P_{allow}$ ( $P_g$ : 지반압, $P_s$ : 지�??�??��)\n- 3차원 ?�널 거동 ?�석???�른 ?�크리트 ?�괴 방�? 극한 ?�계 ?�태 변?�량 ?�정`,
      structure: `1?�락: ?�널 굴착�??�방 ?�치(Fore-arching) ?�성 �?지�?지�??�호?�용??공학???�의\n2?�락: ?�치?�석??지반반?�곡??GRC) �?지보특?�곡??LSC)???�도?� 최적???�치 지??Timing) ?�출\n3?�락: 초기 변??발생???�른 ?��?�?천단보강, 강�??�단그라?�팅) 기법 �??�널 ?�정???�보 방안`
    };
    mcQuestions = [
      {
        type: '객�???(4지?�다)',
        question: `NATM ?�널 공법??가???�심?�인 ??��??지지 기본 ?�리??무엇?��??`,
        options: shuffleArray([
          "?�널 ?�이?�의 강도�??�여 ?��? ?�사 ?�중??100% 차단?�다.",
          "지�??�체??강도?� ?�칭 ?�과(Arching Effect)�??�용?�여 지반이 ?�스�?지지?�게 ?�다.",
          "?�크리트�?매우 ?�껍�??�?�하??강�?보의 ?�께�??�??감소?�킨??",
          "?�널 ?��???공기?�을 ?�여 지?�수???�입???�천?�으�?차단?�다."
        ]),
        answer: "지�??�체??강도?� ?�칭 ?�과(Arching Effect)�??�용?�여 지반이 ?�스�?지지?�게 ?�다.",
        explanation: "NATM 공법?� 굴착 ??지�??�체가 가지??고유??강도?� ?�칭 ?�과(Arching Effect)�?최�???보존?�면?? ?�완?�기 ?�에 ?�크리트?� ?�볼?�로 밀�?보강?�여 지반이 ?�스�??�정?�도�??�는 공법?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `NATM ?�널 공법??1�?지보재 �??�나�? 굴착면의 급격???�완??방�??�고 ?�철??메우�??�칭 �?Arching Ring)???�성?�는 주된 지보재??`,
        options: shuffleArray([
          "?�크리트 (Shotcrete)",
          "방수 ?�트",
          "?�버??콘크리트",
          "벤토?�이??차수??
        ]),
        answer: "?�크리트 (Shotcrete)",
        explanation: "?�크리트??분사??콘크리트�?굴착 즉시 ?�반 ?�면??밀착되???�주 ?�력??균일?�게 분산?�키�?지반의 조기 ?�완??방�??�여 ?�칭 �???��???�행?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `?�볼??Rock Bolt)가 ?�널 ?�반??보강?�는 ?�?�적????��??메커?�즘?�로 ?��? ?��? 것�??`,
        options: shuffleArray([
          "봉합 ?�과 (Sewing Effect): ?�괴 지반과 견고???�반??꿰어 묶어준??",
          "�??�성 ?�과 (Beam Effect): ?��? 층상???�반???�체?�하????보�? ?�성?�다.",
          "부???�쇄 ?�과 (Buoyancy Effect): ?�널 ?��????�압?�을 ?�제?�여 ?�크리트 부?��? 차단?�다.",
          "?�수 ?�과 (Suspension Effect): ?�완 ?�역???�석???��? 미이???�반??매달??지지?�다."
        ]),
        answer: "부???�쇄 ?�과 (Buoyancy Effect): ?�널 ?��????�압?�을 ?�제?�여 ?�크리트 부?��? 차단?�다.",
        explanation: "?�볼?�의 주요 지�?기능?� 봉합(Sewing), �??�성(Beam), ?�수(Suspension), 지�??�치 ?�성(Arching) ??지�?보강 기능?�며, 부???�쇄 ?�과???�볼?�의 주요 기능???�닙?�다."
      },
      {
        type: '객�???(4지?�다)',
        question: `?�널 굴착???�른 지반의 강도 감소?� 지보재??지??��??그래???�에???�호 교점?�로 ?��??�어 ?�널 ?�정?�을 ?��??�는 ?�계 ?�론?�?`,
        options: shuffleArray([
          "지�?지�??�호?�용 ?�론 (Ground-Support Interaction / GRC-LSC)",
          "Darcy??침투�??�론",
          "Mohr-Coulomb??강소???�괴 ?�론",
          "Terzaghi??1차원 ?��? ?�론"
        ]),
        answer: "지�?지�??�호?�용 ?�론 (Ground-Support Interaction / GRC-LSC)",
        explanation: "지�?지�??�호?�용(Ground-Support Interaction)?� 굴착 ??방출?�는 지�??�력???�른 변?��? ?��??�는 지반반?�곡??GRC)�?지보재??지???�능???��??�는 지보제?�곡??LSC)??매핑?�여 ?�정 ?�치 ?�기?� 지�??�력???�계?�는 ?�심 ?�론?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `?�널 굴착 ??막장 ?�방???�행 변??�?막장�?붕괴�??�제?�으�??�어?�기 ?�해 ?�용?�는 ?�?�적???�전 보강(?��?�? 기법?�?`,
        options: shuffleArray([
          "강�??�단 그라?�팅 (Umbrella Arch Method)",
          "2�??�구 콘크리트 ?�이???�??,
          "?�버???�합 �?콘크리트 ?�장",
          "?�크리트??리바?�드 증량 배합"
        ]),
        answer: "강�??�단 그라?�팅 (Umbrella Arch Method)",
        explanation: "강�??�단 그라?�팅?� ?�널 막장�??�방 천단부??강�????�입?�고 그라?�트?��? 주입?�여 굴착 ?�에 ?�산 ?�태???�행 지�??�치�??�성?�으로써 막장 ?�전???�보?�는 공법?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `NATM ?�널???�공변??�?천단침하 계측 결과, ?�적 변?��? ?�렴?��? ?�고 ?�정 ?��? ?�상?�로 ?�형 증�? ?�는 급격??증�??????�요??공학??조치�?가???�절??것�??`,
        options: shuffleArray([
          "계측???�작?�한 것이므�?즉시 계측???�구 중단?�다.",
          "굴착 ?�업???�시 중단?�고 보강 ?�볼??추�? �??�크리트 증설 ??보강 ?�책을 즉시 ?�행?�다.",
          "?�렴?��? ?�는 ?�태가 ?�상?�이므�?굴착 ?�도�?2배로 ?�여 ?�속???�합?�다.",
          "2�??�이?�을 무리?�게 ?�?�하??강제�?변?��? 막는??"
        ]),
        answer: "굴착 ?�업???�시 중단?�고 보강 ?�볼??추�? �??�크리트 증설 ??보강 ?�책을 즉시 ?�행?�다.",
        explanation: "변?��? ?�렴?��? ?�고 지?�적?�로 증�??�는 것�? ?�널 붕괴???�조 증상?????�으므�?즉시 굴착??멈추�?지�??�태�?분석?�여 보강(?�볼??추�?, ?�크리트 ?��??? ?�버??조기?�합 ?????�시?�야 ?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `?�널 ?�이???�계 ???�널???��? 굴착면을 ?�래�??�목???�치?�태�?조기???�합?�여 ?�체 ?�널 ?�면????��???�정?�을 ?�모?�는 지�?부?�는 무엇?��??`,
        options: shuffleArray([
          "?�버??(Invert)",
          "막장�??�크리트",
          "격자지�?(Lattice Girder)",
          "?�어?�링 (Forepoling)"
        ]),
        answer: "?�버??(Invert)",
        explanation: "?�버??Invert)???�널 ?��? 바닥???�치 구조�??�합?�여 지보재 ?�체�?조기??�?Ring) ?�태�?구성?�으로써 ?��? ?�중 분산 �?측벽부 밀�??�상???�과?�으�?차단?�니??"
      },
      {
        type: '객�???(4지?�다)',
        question: `NATM ?�널 지보재 ?�계?�서 지�?변?��? 발생?�기 ??극도�??�른 ?�기???�무 뻣뻣??Rigid) 지보재�??�치??경우 발생?�는 부?�용?�?`,
        options: shuffleArray([
          "지반의 ?�립 ?�칭 ?�과가 극�??�되???�전?�진??",
          "지�??�력???�소?��? ?�고 지보재??과도???�중??집중?�어 지보재 ?�괴 ?�험??증�??�다.",
          "지?�수가 ?��? 배출?�어 ?�널 주�? 침하가 ?�전???�라진다.",
          "?�볼?�의 ?�착 ?�능??무한??커진??"
        ]),
        answer: "지�??�력???�소?��? ?�고 지보재??과도???�중??집중?�어 지보재 ?�괴 ?�험??증�??�다.",
        explanation: "지보재�??�무 ?�찍 ?�치?�면 지반이 변?�을 겪으�??�력???�소?�고 ?�스�?지지?�을 발휘?�는 과정(?�칭 ?�과)??방해?�여, 지�??�압 ?�체가 지보재??걸려 지보재가 과�??�로 ?�괴?????�습?�다."
      }
    ];
  } else {
    // Pure General Fallback Q1 & Q2
    console.log("Generating high-quality domain-agnostic local fallback questions.");
    q1 = {
      type: '개념 문제 (10??',
      question: `기술?�적 관?�에??[${title}]???�심 ?�의 �?개념 구조?��? ?�시?�고, 본문 진술 "${s0.substring(0, 60)}${s0.length > 60 ? '...' : ''}"??기초?�여 ?�의 공학???�징??3?�락 ???�식?�로 간략???�술?�시??`,
      concept: `교재 본문 ?�의: "${s0}"\n\n[?�의 �??�의] [${title}]?�/??${keywordDisplay} ???�심 공학???�소�?기반?�로 ?�계 ?�전?�을 ?�보?�고 ?�능 ?�뢰?�을 극�??�하�??�한 ?�심 ?��??�어�?기술?�니??`,
      formula: `[개념??구성 ?�소]\n?�험?��? ?�안지???�래 ?�심 ?�자 간의 ?�호 ?�용 �?거동 ?�름??반영??개념?��? ?�히 ?�식?�해???�니??\n- ?�호 ?�용 경로: ${mergedKw.slice(0, 4).join(' ??')}\n- ?�수 ?�해 ?�소: ${keywordDisplay}`,
      structure: `1?�락: ${title}???�술???��??�어�??�의 �??�입 ?�요??(Need)\n2?�락: ${title}???�심 ?�동 메커?�즘 �??�세 구성 ?�소�???�� (?�심 차별??비교???�함)\n3?�락: ?�무 ?�용 ???�상 ?�애(Bottleneck) ?�인 �?공학??극복 방안 ?�언`
    };

    let formula2 = '';
    if (features.extractedFormulas && features.extractedFormulas.length > 0) {
      formula2 = `[교재 본문 추출 ?�심 공식/관계식]\n- ${features.extractedFormulas.join('\n- ')}`;
    } else {
      formula2 = `[?�심 ?�향 ?�자 �??��?관계식]\n- 주요 공학??변?? ${mergedKw.slice(0, 3).join(', ')}\n- ?�험?��? ??변?�들 간의 비�?/반비례 공학??메커?�즘??규명?�는 관�?법칙(?? f(${mergedKw.slice(0, 2).join(', ')}) ?��??�전???�향)???�계 ?�술?�야 ?�니??`;
    }

    q2 = {
      type: '공식 문제 (25??',
      question: `?�무 ?�용 ?�경?�서 [${title}]???�입 ?�요?�을 ?�명?�고, 본문 ?�약 "${s1.substring(0, 60)}${s1.length > 60 ? '...' : ''}"??�?반영?�여 기존 공법/?�계 방식 ?��?기술??차별??�??�공/?�계 ??주요 고려?�항???�하?�오.`,
      concept: `교재 본문 ?�약: "${s1}"\n\n[?�요??분석] 기존 기술/방법론의 ?�계?�을 극복?�고, 고도???��? ?�어 �??�질???�보?�기 ?�해 [${title}]???�세 ?�계 기�????�심?�으�??�용?�니??`,
      formula: formula2,
      structure: `1?�락: 최신 기술 기�????�른 ${title} ?�계 기�????�입 ?�위??�??��??�어�?가�?n2?�락: ${title}??거동 ?�성 �??�세 메커?�즘 분석 (기존 공법 ?��??�능/?�전??차별??\n3?�락: ?�무 ?�용 ?�계�??�량???�질/?�전 관�?기�? �?계측/모니?�링 ?�뢰???�보 ?�언`
    };

    // Create 8 programmatically generated dynamic multiple-choice questions
    for (let i = 0; i < 8; i++) {
      const correctSentence = features.keySentences[i % features.keySentences.length] || 
        `[${title}]?�/??${keywordDisplay} ?�의 ?�동 ?�어�??�해 구조???�전?�을 ?�보?�는 것이 ?�심 ?�계 기�??�니??`;

      let questionText = '';
      let correctOption = '';
      let explanationText = '';
      let options = [];

      if (i % 2 === 0) {
        questionText = `?�음 �?본문 진술 �?공학???�리??기초?�여 [${title}]???�???�바�??�명?� 무엇?��??`;
        correctOption = correctSentence;
        
        const incorrectOption1 = `?�무 ?��??�어�??�계 ??${mergedKw[0] || '?�심 ?�자'} ?�의 변?�는 공학???�전??계산?�서 ?�전??배제?�어???�전?�니??`;
        const incorrectOption2 = `[${title}]???�공 과정?�서??물리??리스?�나 ?�계 ?�치�??�전??감시/계측???�요가 ?��? ?�습?�다.`;
        const incorrectOption3 = `[${title}]?� 기존 기술 ?��??�공 ?��??��? 경제???�율?�을 급격???�?�시?�는 공법?�니??`;
        
        options = shuffleArray([correctOption, incorrectOption1, incorrectOption2, incorrectOption3]);
        explanationText = `?�답?� "${correctOption}"?�니?? 본문 교재??진술 �??�심 ?�리???�각???? ${title}???�계 ?�전?�과 주요 기술 규�??� ?��? 같이 ?�바르게 ?�의?�니?? ?�른 보기?��? 계측???�략?�나 ?�전??배제 ??공학???�?�성???��? ?�는 명백???�류?�니??`;
      } else {
        questionText = `?�음 �?본문 교재???�술??맥락??비추??�??? [${title}]�?관?�하??가???�바르�? ?��?(?��? 진술?� 무엇?��??`;
        
        const incorrectOption = `?�계/?�공 기�? ?�립 ??${mergedKw[1] || '최적 ?�계'} ???�심 ?�소???�향 �??�호 거동 ?�석?� ?��??�어�?가�?기�??�서 무의미하므�?무시?�야 ?�니??`;
        correctOption = incorrectOption;
        
        const opt2 = correctSentence;
        const opt3 = `본문 진술??근거?�여 [${title}] ?�계 ???�계 취약 ?�인(Bottleneck)???�량 분석?�고 ?�어 ?�책을 강구?�야 ?�니??`;
        const opt4 = `[${title}]???�공??가?�을 ?�해 ${mergedKw.slice(0, 3).join(', ')} ?�의 ?�기???��? 거동 ?�성??규명?�는 ?�키?�처 ?�계�?반영?�니??`;
        
        options = shuffleArray([correctOption, opt2, opt3, opt4]);
        explanationText = `?�답?� "${correctOption}"?�니?? ??보기???�심 ?�계 ?�라미터??거동 ?�석??무의미하�?취급?�고 무시?�자??주장?�로, 공학 ?�계 �?기술??기�????�배?�는 명백???��??�명?�니?? ?�른 보기?��? 모두 본문 �?공학 ?�리??부?�하???�바�??�명?�니??`;
      }

      mcQuestions.push({
        type: '객�???(4지?�다)',
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
    return res.status(400).json({ error: '?�픽 ?�목?� ?�수 ?�력 ??��?�니??' });
  }

  try {
    // 1. Double secure filename extraction: Read fileNameUtf8 from body first to avoid Multer header decoding bugs
    let pdfName = req.body.fileNameUtf8 || (req.file ? req.file.originalname : null);
    let pdfData = req.file ? req.file.buffer : null;

    // 2. Fallback regex-based decoder for raw originalname if body is not populated
    if (!req.body.fileNameUtf8 && req.file) {
      const name = req.file.originalname;
      if (/[가-??/.test(name)) {
        pdfName = name;
      } else {
        try {
          const decoded = Buffer.from(name, 'latin1').toString('utf-8');
          pdfName = /[가-??/.test(decoded) ? decoded : name;
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

    // 망각주기 ?��?줄링 ?�고리즘: ?�록??기�? [+1?? +4?? +7?? +14?? +35?? +60??
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
      message: '?�픽 ?�록 �?복습 ?��?�??�성???�료?�었?�니??',
      topicId: topicId,
      title: title,
      keywords: keywords,
      schedulesCreated: intervals.length
    });
  } catch (error) {
    console.error('Error registering topic and creating schedules:', error);
    res.status(500).json({ error: '?�버 ?�류�??�픽 ?�록???�패?�습?�다.' });
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
    res.status(500).json({ error: '?�버 ?�류�?복습 ?�?�보?��? 불러?????�습?�다.' });
  }
});

// 3. Mark Review Round as Complete
app.post('/api/schedules/:id/complete', async (req, res) => {
  const scheduleId = req.params.id;

  try {
    const checkSql = `SELECT * FROM schedules WHERE id = ?`;
    const schedule = await dbQuery.get(checkSql, [scheduleId]);

    if (!schedule) {
      return res.status(404).json({ error: '?�당 복습 ?�정??찾을 ???�습?�다.' });
    }

    if (schedule.status === 'completed') {
      return res.status(400).json({ error: '?��? 복습 ?�료????��?�니??' });
    }

    const nowTimestamp = new Date().toISOString();
    const updateSql = `
      UPDATE schedules 
      SET status = 'completed', completed_at = ? 
      WHERE id = ?
    `;
    await dbQuery.run(updateSql, [nowTimestamp, scheduleId]);

    res.json({
      message: `${schedule.review_round}?�차 복습 ?�료 처리?�었?�니??`,
      schedule_id: scheduleId,
      status: 'completed',
      completed_at: nowTimestamp
    });
  } catch (error) {
    console.error('Error completing review:', error);
    res.status(500).json({ error: '?�버 ?�류�?복습 ?�료 처리???�패?�습?�다.' });
  }
});

// 3.5. Reset/Cancel Review Round Completion (Change back from completed to pending)
app.post('/api/schedules/:id/reset', async (req, res) => {
  const scheduleId = req.params.id;

  try {
    const checkSql = `SELECT * FROM schedules WHERE id = ?`;
    const schedule = await dbQuery.get(checkSql, [scheduleId]);

    if (!schedule) {
      return res.status(404).json({ error: '?�당 복습 ?�정??찾을 ???�습?�다.' });
    }

    if (schedule.status !== 'completed') {
      return res.status(400).json({ error: '?�료 ?�태????���?초기?�할 ???�습?�다.' });
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
      message: `${schedule.review_round}?�차 복습???��??�태�?초기?�되?�습?�다.`,
      schedule_id: scheduleId,
      status: 'pending',
      planned_date: newPlannedDate,
      completed_at: null
    });
  } catch (error) {
    console.error('Error resetting review:', error);
    res.status(500).json({ error: '?�버 ?�류�?복습 ?�태 초기?�에 ?�패?�습?�다.' });
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
    res.status(500).json({ error: '?�버 ?�류�??�픽 목록??조회?��? 못했?�니??' });
  }
});

// 5. Delete Topic and associated Schedules
app.delete('/api/topics/:id', async (req, res) => {
  const topicId = req.params.id;

  try {
    const checkSql = `SELECT * FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(checkSql, [topicId]);

    if (!topic) {
      return res.status(404).json({ error: '?�당 ?�픽??찾을 ???�습?�다.' });
    }

    const deleteSql = `DELETE FROM topics WHERE id = ?`;
    await dbQuery.run(deleteSql, [topicId]);

    res.json({
      message: `?�픽 [${topic.title}] �?관??복습 ?�정???�전?�게 ??��?�었?�니??`,
      topicId: topicId
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({ error: '?�버 ?�류�??�픽 ??��???�패?�습?�다.' });
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
      return res.status(404).json({ error: '?�픽??찾을 ???�습?�다.' });
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
        fileText = fileText.substring(0, 10000) + '... [?�스?��? ?�무 길어 중략??';
      }
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const forceLocal = req.query.local === 'true';

    // Force local/source-based mode (no Gemini)
    if (forceLocal || !geminiApiKey) {
      const reason = forceLocal ? '?�스 기반 모드�??�청?? : 'GEMINI_API_KEY ?�음';
      console.log(`Generating local fallback questions. Reason: ${reason}`);
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      return res.json({ 
        questions: fallbackQuestions, 
        isFallback: true,
        mode: 'local',
        error: forceLocal ? null : '백엔???�경변?�에 GEMINI_API_KEY가 존재?��? ?�습?�다.'
      });
    }

    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const QUIZ_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];

      const prompt = `
?�신?� ?�?��?�?�??기술?�격 기술??Professional Engineer) ?�험 출제?�원?�니??
?�래 ?�공?�는 [?�픽 ?�목], [?�심 ?�워??, 그리�?[첨�??�일 본문 ?�스??�??�층 분석?�여, �?10개의 고난???�상문제�??�성??주십?�오.

[?�픽 ?�목]: ${topic.title}
[?�심 ?�워??: ${topic.keywords || '?�공?��? ?�음'}
[첨�??�일 본문 ?�스??: ${fileText || '?�공?��? ?�음'}

[출제 ?�구?�항]:
1. 반드??�?10개의 문제�??�음�?같이 구성?�여 출제?�십?�오:

   [1�?문제] 구조 ?�출??(?�드??복습??:
   - 목적: ?�락 ?�목�?보고 ?�용??머릿?�으�??�출(recall)?�는 개조??복습 문제.
   - "type" �? 반드??"구조 ?�출 (?�락�?리콜)"
   - "question" ?�드 ?�식:
       [개요]
       (?�픽 ?�체 ?�심 개요 1문장)
       (?�픽 ?�체 ?�심 개요 2문장)

       [?�락�??�출]
       ?�음 �??�락 ?�목??보고, ?�당 ?�용??머릿?�으�??�올??보세??
       ??(첨�??�일???�제 ?�락/??�� ?�목 1)
       ??(첨�??�일???�제 ?�락/??�� ?�목 2)
       ??(첨�??�일???�제 ?�락/??�� ?�목 3)
       ...
   - 만약 주요 ?�락/??��??5�??�상?�면, ?�쪽??1번으�? ?�머지�?2번으�?분리??구조 ?�출??2개�? 만들 �? ??경우 공식 문제??3�?
   - ?�락??4�??�하?�면 1�?1개만 만들�?2번을 공식 문제�?
   - "concept" ?�드: �??�락???�심 ?�용 1~2�??�약 (?�②???�식, ?�안 ?�트??.
   - "formula" ?�드: ?�심 공식/구성?�소 (?�으�?�?문자??"").
   - "structure" ?�드: �??�락 ?�목 + ?�심 ?�용??짝�????�답 가?�드 (\\n 줄바�?.

   [공식 문제] 1�?
   - ?�식, 물리/?�학??지???�산?? ?��? 공법 개념???�심 구성?�소�??�성?�는 ?�술??문제.
   - "type" �? 반드??"공식 문제 (25??"

   [?�머지] 4지?�다 객�??�으�?�?10개�? 채울 �?
   - "type" �? 반드??"객�???(4지?�다)"

2. ?��? 무조�?IT 분야???�프?�웨??관???�어(Saga, MSA, CAP ??�??�괄 주입?��? 말고, ?�픽 ?�목�?첨�??�일 본문???�제 ?�공 ?�문 분야(?? ?�목, 기계, 지�? ?�리, ?�경 ?????�벽???�합??고급 공학 질문??출제?�십?�오.

3. �?문제??JSON ?�성 ?�건:
   - 1번과 2�?문제 (?�동 ?�출 카드):
     * "question": ?�험?�이 고�??�볼 ?�성??문제 질문.
     * "concept": ?�당 질문???�??1~2줄짜�??�심 개념 ?�의 �?기술???�약.
     * "formula": ?�안지??반드??직접 기재?�야 ?�는 ?�수 공식, 물리/?�학??지???�산?? ?��? ?�키?�처/공법 개념??Diagram) ?�심 구성?�소 ?�보.
     * "structure": 고득??기술???�안 구조??'1?�락', '2?�락', '3?�락'??목차 �??�웃?�인 지�?(줄바꿈이 ?�용?�도�?\\n ?�함).
   - 3�?~ 10�?문제 (객�???4지?�다):
     * "question": 구체?�이�??�술?�인 ?�용 ?�치 ?�는 ?�리 분석 객�???질문.
     * "options": 4개의 보기 문항?�로 구성??문자??배열 (반드???�답 1개�? 매력?�인 ?�답 3개로 구성).
     * "answer": "options" 배열 ?�에 ?�는 �?�??�확???�치?�는 ?�답 문자??
     * "explanation": ????보기가 ?�답?�고 ?�른 보기?�이 ?�답?��????�???�리?�이�??�문?�인 ?�세 ?�설.

5. 공식?�나 ?�식??보여�??�는 반드??LaTeX 문법 ?�식???�용?�여 기재?�십?�오. ?�라???�식?� \`$?�식$\` ?�태�? 블록 ?�식?� \`$$?�식$$\` ?�태�?감싸???�니??
6. 중요: LaTeX ?�식 기호(\`$\`, \`$$\`) 바로 ?�쪽?�는 ?��? 공백???�어가지 ?�아???�니??(?? \`$?�식$\`?� ?�바르고, \`$ ?�식 $\`�?같이 ?�쪽??공백???�으�??��? ???�니??. ?�한, LaTeX ?�식 바깥�??�뒤�??��??????�는 �??�이??반드??공백(?�어?�기)??주어 ?��?�??�식???�라붙�? ?�게 처리?�십?�오. (?? "공식 $T = P \times r$ ?�" ?��? 같이 ?�식 바깥�??�뒤 ?�옆???��?과의 공백???�실???�어 가?�성???�보?�십?�오.)
7. 중요: JSON ?�맷 ?�에??LaTeX ?�식??기재???? 모든 ??��?�시(backslash, \\ 기호)??반드???�중 ??��?�시(\\\\\\\\ 기호)�??�중 ?�스케?�프?�여 출력?�셔??JSON ?�싱 ?�류가 발생?��? ?�습?�다. (?? "\\\\frac" ?�??"\\\\\\\\frac", "\\\\sin" ?�??"\\\\\\\\sin" �?같이 모든 LaTeX 명령??기호 ?�의 ??��?�시�???번씩 기재?�십?�오.)

4. 반드???�래 지?�된 JSON 배열 ?�맷?�로�??�확??반환?�십?�오. 마크?�운??'\`\`\`json' 코드 블록?�나 추�??�인 ?�스???�명?� 배제?�고 ?�수??JSON ?�이?�만 ?�공??주십?�오.

[?�답 JSON ?�맷]:
[
  {
    "type": "구조 ?�출 (?�락�?리콜)",
    "question": "[개요]\\n개요 1문장.\\n개요 2문장.\\n\\n[?�락�??�출]\\n?�음 �??�락 ?�목??보고, ?�당 ?�용??머릿?�으�??�올??보세??\\n???�락 ?�목 1\\n???�락 ?�목 2\\n???�락 ?�목 3",
    "concept": "???�락1 ?�심 ?�약\\n???�락2 ?�심 ?�약\\n???�락3 ?�심 ?�약",
    "formula": "?�심 공식 ?�는 �?문자??,
    "structure": "???�락 ?�목 1\\n?�세 ?�용 ?�명\\n\\n???�락 ?�목 2\\n?�세 ?�용 ?�명"
  },
  {
    "type": "공식 문제 (25??",
    "question": "질문 ?�용",
    "concept": "?�심 개념 ?�명",
    "formula": "?�수 공식/구성?�소",
    "structure": "1?�락: ...\\n2?�락: ...\\n3?�락: ..."
  },
  {
    "type": "객�???(4지?�다)",
    "question": "질문 ?�용",
    "options": ["보기 1", "보기 2", "보기 3", "보기 4"],
    "answer": "?�확???�치?�는 ?�답 보기 ?�스??,
    "explanation": "?�세???�설"
  }
  ... (�?10개�? ?�도�?객�???계속)
]
`;

      let questions = null;
      let lastErr = null;

      for (const modelName of QUIZ_MODELS) {
        try {
          console.log(`[?�일?�픽?�즈] 모델 ?�도: ${modelName}`);
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
            console.warn(`[?�일?�픽?�즈] ${modelName} ?�싱 ?�시??`, parseErr);
            questions = extractJsonArray(rawText);
          }

          if (!questions || !Array.isArray(questions)) {
            throw new Error('Parsed result is not a valid JSON array or empty');
          }

          console.log(`[?�일?�픽?�즈] ?�공: ${modelName}, ${questions.length}문항`);
          break; // ?�공 ??루프 종료
        } catch (modelErr) {
          lastErr = modelErr;
          const isQuota = modelErr.message?.includes('Quota') || modelErr.message?.includes('quota') || modelErr.message?.includes('rate') || modelErr.status === 429;
          if (isQuota) {
            console.warn(`[?�일?�픽?�즈] ${modelName} Quota 초과, ?�음 모델�??�백`);
            continue;
          }
          throw modelErr; // Quota ???�류??즉시 throw
        }
      }

      if (!questions) {
        throw lastErr || new Error('모든 ?��??�이 모델 ?�출 ?�패');
      }

      res.json({ questions, isFallback: false });
    } catch (aiError) {
      console.error('Gemini API call failed, generating fallbacks:', aiError);
      const isQuota = aiError.message?.includes('Quota') || aiError.message?.includes('quota') || aiError.message?.includes('rate');
      const errorMsg = isQuota ? 'AI API ?�일 ?�용 ?�도�?초과?�습?�다. ?�시 문제�??�체됩?�다.' : aiError.message;
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      res.json({ questions: fallbackQuestions, isFallback: true, error: errorMsg });
    }
  } catch (error) {
    console.error('Error in AI question generation route:', error);
    res.status(500).json({ error: '?�버 ?�류�?AI 기출문제�??�성?��? 못했?�니??' });
  }
});

// 6-1. Comprehensive Exam: Generate 70 questions from ALL topics via Gemini
app.post('/api/exam/all', async (req, res) => {
  try {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) return res.status(400).json({ error: 'GEMINI_API_KEY가 ?�정?��? ?�았?�니??' });

    // Fetch all topics with pdf_data
    const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name, pdf_data FROM topics ORDER BY created_at DESC`);
    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: '?�록???�픽???�습?�다. 먼�? ?�습 ?�료�??�록?�주?�요.' });
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
      topicTexts.push(`[?�픽: ${topic.title}]\n?�워?? ${topic.keywords || '?�음'}\n${fileText || '?�스 ?�음'}`);
    }

    const combinedText = topicTexts.join('\n\n---\n\n');
    const topicTitles = topics.map(t => t.title).join(', ');
    const randomSeed = Math.floor(Math.random() * 10000);

    const prompt = `
?�신?� �??기술?�격 기술???�험 출제?�원?�니??
?�래 모든 ?�픽???�스 ?�료�??�합?�여 ?�확??70개의 종합?��? 문제�??�성?�십?�오.
매번 문제 구성???�르�?출제?�십?�오 (?�덤 ?�드: ${randomSeed}).

[?��? 범위 ?�픽 목록]: ${topicTitles}

[?�합 ?�스 ?�스??:
${combinedText}

[출제 규칙]:
1. �?70문제�??�래 비율�?구성:
   - 주�???(type: "주�???): 25문제
     * subtype "개요": 개요/?�의/?�징??2~3줄로 ?�술 (최소 8문제)
     * subtype "공식": 공식·?�식·계산?�·핵??구성?�소 기술 (최소 6문제)
     * subtype "?�술": 메커?�즘·?�리·비교 ?�명 (?�머지)
   - 객�???(type: "객�???): 45문제 (4지?�다)
2. 개요·?�의·공식??묻는 문제??반드??주�??�으로만 출제.
3. 모든 ?�픽?�서 골고�?출제 (�??�픽�?최소 1문제 ?�상).
4. ?�문?�어, ?�치, 공식???�확???�용.
5. 객�????�답?� 그럴??���?구성.
6. 공식·?�식?� LaTeX ?�식 ?�용 ($?�식$).
7. 반드???�수 JSON 배열�?반환 (마크?�운 코드블록 ?�이).

[JSON ?�맷]:
[
  {
    "type": "주�???,
    "subtype": "개요",
    "question": "질문",
    "answer": "2~3�?모범?�안",
    "concept": "?�심 개념 1�?
  },
  {
    "type": "객�???,
    "question": "질문",
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "answer": "?�답 보기 ?�스??,
    "explanation": "?�설"
  }
  ... (�?70�?
]
`;

    const genAI = new GoogleGenerativeAI(geminiApiKey);

    // 모델 ?�백 체인: gemini-3.5-flash ??gemini-2.5-flash ??gemini-2.0-flash
    const EXAM_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    let questions = null;
    let lastErr = null;

    for (const modelName of EXAM_MODELS) {
      try {
        console.log(`[종합?��?] 모델 ?�도: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const rawText = result.response.text().trim();
        try {
          let text = rawText;
          if (text.startsWith('```')) text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
          questions = JSON.parse(text);
        } catch {
          questions = extractJsonArray(rawText);
        }
        if (!questions || !Array.isArray(questions) || questions.length === 0) {
          throw new Error('70문항 ?�싱 ?�패');
        }
        console.log(`[종합?��?] ?�공: ${modelName}, ${questions.length}문항`);
        break; // ?�공 ??루프 종료
      } catch (modelErr) {
        lastErr = modelErr;
        const isQuota = modelErr.message?.includes('Quota') || modelErr.message?.includes('quota') || modelErr.message?.includes('rate') || modelErr.status === 429;
        if (isQuota) {
          console.warn(`[종합?��?] ${modelName} Quota 초과, ?�음 모델�??�백`);
          continue;
        }
        throw modelErr; // Quota ???�류??즉시 throw
      }
    }

    if (!questions) {
      const isQuota = lastErr?.message?.includes('Quota') || lastErr?.message?.includes('quota') || lastErr?.message?.includes('rate');
      if (isQuota) {
        return res.status(429).json({ error: 'AI API ?�일 ?�용 ?�도�?초과?�습?�다. ?�일 ?�시 ?�도?�거?? ?�시 ???�시 ?�러보세??' });
      }
      throw lastErr || new Error('문제 ?�성 ?�패');
    }

    res.json({ questions, total: questions.length, topicCount: topics.length });
  } catch (err) {
    console.error('Exam route error:', err);
    const isQuota = err?.message?.includes('Quota') || err?.message?.includes('quota') || err?.message?.includes('rate');
    if (isQuota) {
      return res.status(429).json({ error: 'AI API ?�일 ?�용 ?�도�?초과?�습?�다. ?�일 ?�시 ?�도?�거?? ?�시 ???�시 ?�러보세??' });
    }
    res.status(500).json({ error: '?�버 ?�류가 발생?�습?�다.' });
  }
});


// 6-2. Comprehensive Exam: Generate Detailed Answer for a specific question
app.post('/api/exam/detailed-answer', async (req, res) => {
  try {
    const { question, answer } = req.body;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) return res.status(400).json({ error: 'GEMINI_API_KEY가 ?�정?��? ?�았?�니??' });

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const EXAM_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    const prompt = `
?�신?� ?�?��?�?�??기술?�격 기술???�험 출제?�원 �?최고 권위?�입?�다.
?�험?�이 종합?��?�??�??�??�음 문제???�??'?�안 ?�문보기(?�층 ?�설)'�??�청?�습?�다.

[문제]: ${question}
[기존 간략 ?�답/?�설]: ${answer || '?�음'}

???�용??바탕?�로, ??문제?� 관?�된 기술??배경, ?�심 메커?�즘, 그리�??�무???�사?�을 ?�함?�여 ?�벽??기술??모범 ?�안(?�는 ?�층 ?�설)???�성??주십?�오.
?�음 규칙???�격???�르??��??
1. 3?�락 구조(1. 개요 �?기술??배경, 2. ?�심 메커?�즘/구성?�소/비교분석, 3. ?�무???�사??�?결론)�??�리?�으�??�성?�십?�오.
2. ?�식?�나 공식???�다�?반드??LaTeX ?�식($?�식$ ?�는 $$?�식$$)???�용?�십?�오.
3. 보기 ?�한 Markdown ?�식(?�절??굵�? 글?? 글머리 기호 ?????�용?�되, 마크?�운 코드블록(\`\`\`markdown)?�로 ?�체�?감싸지 말고 바로 ?�스?�로 출력?�십?�오.
`;

    let responseText = null;
    let lastErr = null;

    for (const modelName of EXAM_MODELS) {
      try {
        console.log(`[?�안?�문보기] 모델 ?�도: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        responseText = result.response.text().trim();
        console.log(`[?�안?�문보기] ?�공: ${modelName}`);
        break;
      } catch (modelErr) {
        lastErr = modelErr;
        const isQuota = modelErr.message?.includes('Quota') || modelErr.message?.includes('quota') || modelErr.message?.includes('rate') || modelErr.status === 429;
        if (isQuota) {
          console.warn(`[?�안?�문보기] ${modelName} Quota 초과, ?�음 모델�??�백`);
          continue;
        }
        throw modelErr;
      }
    }

    if (!responseText) {
      const isQuota = lastErr?.message?.includes('Quota') || lastErr?.message?.includes('quota') || lastErr?.message?.includes('rate');
      if (isQuota) {
        return res.status(429).json({ error: 'AI API ?�일 ?�용 ?�도�?초과?�습?�다.' });
      }
      throw lastErr || new Error('?�층 ?�설 ?�성 ?�패');
    }

    res.json({ text: responseText });
  } catch (err) {
    console.error('Detailed answer route error:', err);
    res.status(500).json({ error: '?�버 ?�류가 발생?�습?�다.' });
  }
});

// 6-3. Freeform Chat Search
app.post('/api/chat', async (req, res) => {
  try {
    const { history, message } = req.body;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) return res.status(400).json({ error: 'GEMINI_API_KEY가 ?�정?��? ?�았?�니??' });

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const CHAT_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    // Convert history to Gemini format
    const contents = [];
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    let responseText = null;
    let lastErr = null;

    for (const modelName of CHAT_MODELS) {
      try {
        console.log(`[채팅검?? 모델 ?�도: ${modelName}`);
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          systemInstruction: "?�신?� �??기술?�격 기술???�험???�는 ?�문 ?�터?�니?? ?�용?�의 질문???�??기술???�험 ?��????�문 ?�어�??�용?�여 명확?�고 구조?�으�??��??�주?�요. ?�식?� LaTeX ?�식?�로 ?�성?�주?�요."
        });
        const result = await model.generateContent({ contents });
        responseText = result.response.text().trim();
        console.log(`[채팅검?? ?�공: ${modelName}`);
        break;
      } catch (modelErr) {
        lastErr = modelErr;
        const isQuota = modelErr.message?.includes('Quota') || modelErr.message?.includes('quota') || modelErr.message?.includes('rate') || modelErr.status === 429;
        if (isQuota) {
          console.warn(`[채팅검?? ${modelName} Quota 초과, ?�음 모델�??�백`);
          continue;
        }
        throw modelErr;
      }
    }

    if (!responseText) {
      const isQuota = lastErr?.message?.includes('Quota') || lastErr?.message?.includes('quota') || lastErr?.message?.includes('rate');
      if (isQuota) {
        return res.status(429).json({ error: 'AI API ?�일 ?�용 ?�도�?초과?�습?�다.' });
      }
      throw lastErr || new Error('?��? ?�성 ?�패');
    }

    res.json({ text: responseText });
  } catch (err) {
    console.error('Chat route error:', err);
    res.status(500).json({ error: '?�버 ?�류가 발생?�습?�다.' });
  }
});

// 7. Get Topic File Raw Text for Reading
app.get('/api/topics/:id/text', async (req, res) => {
  const topicId = req.params.id;

  try {
    const topicSql = `SELECT * FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(topicSql, [topicId]);

    if (!topic) {
      return res.status(404).json({ error: '?�픽??찾을 ???�습?�다.' });
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
      fileText = '?�기�??�록???�픽?�며 첨�???보고???�일???�습?�다.';
    }

    res.json({
      id: topic.id,
      title: topic.title,
      pdf_name: topic.pdf_name,
      text: fileText || '보고???�용??비어 ?�거??추출???�스?��? ?�습?�다.'
    });
  } catch (error) {
    console.error('Error fetching topic file text:', error);
    res.status(500).json({ error: '?�버 ?�류�?보고???�문??불러?��? 못했?�니??' });
  }
});

// 8. Stream Raw PDF/HTML File directly for native browser viewing
app.get('/api/topics/:id/pdf', async (req, res) => {
  const topicId = req.params.id;

  try {
    const topicSql = `SELECT pdf_name, pdf_data FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(topicSql, [topicId]);

    if (!topic || !topic.pdf_data) {
      return res.status(404).send('첨�???PDF/HTML ?�본 ?�일??찾을 ???�습?�다.');
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
    res.status(500).send('?�버 ?�류�??�일???�트리밍?��? 못했?�니??');
  }
});

// SERVER INLINE STARTUP
// ?�?� Cross-device Session Sync API ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
// ?�이�??�동 ?�성 ?�퍼
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

// GET /api/session/exam ???�?�된 종합?��? ?�태 반환
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
    res.json({ data: null }); // ?�류 ?�에??null 반환 (?�로 ?�성?�도�?
  }
});

// POST /api/session/exam ??종합?��? ?�태 ?�??(?�기 ??
app.post('/api/session/exam', async (req, res) => {
  try {
    await ensureSessionTable();
    const { examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll } = req.body;
    const value = JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll });
    // DELETE + INSERT (모든 DB ?�환 UPSERT)
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

// DELETE /api/session/exam ??종합?��? ?�태 초기??(종료 ??
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

startServer();
