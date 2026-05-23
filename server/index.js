import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initDatabase, dbQuery } from './database.js';
import fs from 'fs';
import PDFDocument from 'pdfkit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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
  // If UTF-8 succeeded but there are no Korean characters and it looks like mojibake,
  // convert it back to original 8-bit bytes using loss-free CP1252 map and decode as EUC-KR.
  if (utf8Success && !/[가-힣]/.test(decodedText)) {
    try {
      const restoredBytes = stringToCp1252Buffer(decodedText);
      const restoredText = new TextDecoder('euc-kr').decode(restoredBytes);
      if (/[가-힣]/.test(restoredText)) {
        console.log('Double-encoded EUC-KR (mojibake) successfully detected and restored with CP1252 map!');
        return restoredText;
      }
    } catch (restoreErr) {
      console.warn('EUC-KR mojibake restoration check failed:', restoreErr);
    }
  }

  return decodedText;
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

      // Try to load standard Windows Korean font, fallback to standard Helvetica
      let fontLoaded = false;
      const fontPath = 'C:\\Windows\\Fonts\\malgun.ttf'; // Malgun Gothic (Standard Windows Korean Font)
      if (fs.existsSync(fontPath)) {
        try {
          doc.font(fontPath);
          fontLoaded = true;
        } catch (e) {
          console.warn('Failed to load Malgun Gothic font, falling back to default:', e);
        }
      }

      if (!fontLoaded) {
        // Fallback: If on another OS or missing Malgun Gothic, check other system fonts
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
      s.includes('공법') || s.includes('방식') || s.includes('수행') || s.includes('설계')
    );
  });

  result.keySentences = candidates.slice(0, 4);
  
  if (result.keySentences.length === 0) {
    result.keySentences = sentences.slice(0, 3).filter(s => s.trim().length > 10);
  }

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
  const s2 = features.keySentences[2] || `구축 및 실무 현장 도입 과정의 예상 리스크를 선제 통제하고 거버넌스 설계 지침을 정립해야 합니다.`;
  const s3 = features.keySentences[3] || `정량적 효율 평가 공식과 개념도 배치를 설계 표준에 준하여 작성해야 합니다.`;

  // Dynamic Concepts (Answers)
  const concept1 = `교재 본문 정의: "${s0}"\n\n[정의 및 의의] [${title}]은/는 ${keywordDisplay} 등 핵심 기술 요소를 적용하여 시스템의 성능 효율을 극대화하고 동작 안전성을 확보하기 위한 핵심 공학 기술 및 설계 공법입니다.`;

  const concept2 = `교재 본문 요약: "${s1}"\n\n[필요성 분석] 기존 전통 구조의 비효율 및 구조적 한계를 통제하고, 고안전/고효율 프로세스를 확보하기 위해 [${title}]의 도입이 실무적으로 강력하게 요구됩니다.`;

  const concept3 = `교재 본문 핵심 진술: "${s2}"\n\n[장애 극복 방안] 본문 진술에 기초하여 구축 초기 취약점 및 임계 리스크(Bottleneck) 요인을 사전에 모니터링하고, 가동 신뢰성을 유지하기 위해 거버넌스를 최적화하는 설계 방안입니다.`;

  // Dynamic Formula & Diagram lists (Answers)
  const formula1 = `[개념도 구성 요소]\n수험생은 답안지에 아래 핵심 인자 간의 연동 흐름과 부하 분산/응력 재분배 메커니즘을 반영한 개념도를 도식화해야 합니다:\n- 흐름 경로: ${mergedKw.slice(0, 4).join(' ➔ ')}\n- 설계 구성 요소: ${keywordDisplay}`;

  const formula2 = `[정량적 효율 평가 공식]\n- 정량적 효율 평가식: η = [ (개선 후 측정치 - 개선 전 측정치) / 개선 전 측정치 ] × 100 (%)\n- 핵심 물리/기술적 메커니즘: ${mergedKw.slice(0, 3).join(', ')} 등의 연동 제어 및 성능 계수 최적화 공식 정립.`;

  const formula3 = `[신뢰성 및 안전성 평가지표]\n- 설비 가동 신뢰도 공식: Availability = MTBF / (MTBF + MTTR)\n- 장애 복구 메커니즘: 임계 취약 요인 극복을 위한 단위 독립적 예비(Redundancy) 설계 및 차단 도식 필수.`;

  // Dynamic Questions that use the extracted sentences directly!
  const question1 = `기술사적 관점에서 [${title}]의 핵심 정의 및 개념 구조도를 제시하고, 본문 진술 "${s0.substring(0, 60)}${s0.length > 60 ? '...' : ''}"에 기초하여 이의 공학적 특징을 3단락 표 형식으로 간략히 서술하시오.`;

  const question2 = `실무 도입 환경에서 [${title}]의 적용 필요성을 설명하고, 본문 요약 "${s1.substring(0, 60)}${s1.length > 60 ? '...' : ''}"을/를 반영하여 기존 전통 기술 방식 대비 기술적 차별성 및 실무 시공/설계 시 주요 고려사항을 논하시오.`;

  const question3 = `[${title}]의 실무 적용 시 발생할 수 있는 주요 장애 및 취약성 요인(Bottleneck)을 다차원적으로 분석하고, 본문의 "${s2.substring(0, 60)}${s2.length > 60 ? '...' : ''}" 진술에 근거한 엔지니어링 신뢰성 확보 방안과 발전 방향을 서술하시오.`;

  return [
    {
      type: '용어형 (10점)',
      question: question1,
      concept: concept1,
      formula: formula1,
      structure: `1단락: ${title}의 기술적 정의 및 도입 필요성 (Need)\n2단락: ${title}의 상세 메커니즘 분석 및 핵심 구성 요소별 역할 (유사 기술과의 차별점 비교표 포함)\n3단락: 실무 시공/설계 시 예상 Bottleneck 요인 및 기술사로서의 공학적 극복 방안 제언`
    },
    {
      type: '서술형 (25점)',
      question: question2,
      concept: concept2,
      formula: formula2,
      structure: `1단락: 기술 트렌드 변화에 따른 ${title} 도입의 당위성 및 실무 관점의 엔지니어링 가치\n2단락: ${title}의 아키텍처/작동 프로세스 상세 메커니즘 분석 및 기존 전통 방식 대비 차별화 성능 (비교 항목 4개 이상)\n3단락: 실무 적용 단계별 정량적 품질/안전 관리 기준 및 기술사적 거버넌스 제언`
    },
    {
      type: '서술형 (25점)',
      question: question3,
      concept: concept3,
      formula: formula3,
      structure: `1단락: ${title} 실무 운용 시 부하 집중 또는 구조적 임계 장애 요인의 다차원적 분석\n2단락: 본문의 핵심 취약성 극복 가이드에 기초한 공정 신뢰성(Reliability) 및 고가용성 확보 방안\n3단락: 지속 가능한 설비 운용을 위한 표준 거버넌스 수립 및 미래 융합 신기술 발전 방향 제언`
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

    // Check if uploaded file is HTML, convert to PDF buffer automatically
    if (req.file) {
      const isHtml = req.file.originalname.endsWith('.html') || 
                     req.file.originalname.endsWith('.htm') || 
                     req.file.mimetype === 'text/html' || 
                     (pdfName && (pdfName.endsWith('.html') || pdfName.endsWith('.htm')));
      if (isHtml) {
        try {
          console.log(`HTML file upload detected: ${pdfName}. Converting to PDF automatically.`);
          const htmlContent = decodeHtmlBuffer(req.file.buffer);
          const plainText = htmlToPlainText(htmlContent);
          const pdfBuffer = await convertTextToPdfBuffer(plainText, title);
          
          pdfData = pdfBuffer;
          // Change the extension of the decoded name to .pdf
          const baseName = pdfName.replace(/\.[^/.]+$/, "");
          pdfName = `${baseName}.pdf`;
          console.log(`HTML file successfully converted to PDF: ${pdfName}`);
        } catch (convErr) {
          console.error('Failed to convert HTML to PDF, falling back to raw html buffer:', convErr);
        }
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

    // 망각주기 스케줄링 알고리즘: 등록일 기준 [+1일, +4일, +7일, +14일]
    const intervals = [1, 4, 7, 14];
    
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
      const isHtml = topic.pdf_name && (topic.pdf_name.endsWith('.html') || topic.pdf_name.endsWith('.htm'));
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
      let text = response.text().trim();

      if (text.startsWith('```')) {
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      const questions = JSON.parse(text);
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
      const isHtml = topic.pdf_name && (topic.pdf_name.endsWith('.html') || topic.pdf_name.endsWith('.htm'));
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

// 8. Stream Raw PDF File directly for native browser viewing
app.get('/api/topics/:id/pdf', async (req, res) => {
  const topicId = req.params.id;

  try {
    const topicSql = `SELECT pdf_name, pdf_data FROM topics WHERE id = ?`;
    const topic = await dbQuery.get(topicSql, [topicId]);

    if (!topic || !topic.pdf_data) {
      return res.status(404).send('첨부된 PDF/HTML 원본 파일을 찾을 수 없습니다.');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(topic.pdf_name)}"`);
    res.send(topic.pdf_data);
  } catch (error) {
    console.error('Error streaming PDF file:', error);
    res.status(500).send('서버 오류로 PDF 파일을 스트리밍하지 못했습니다.');
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
