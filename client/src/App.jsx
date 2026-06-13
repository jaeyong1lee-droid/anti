import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  healLatexFormulas, 
  healQuizQuestionObject, 
  healTheoryQuestionObject, 
  healFormulaQuestionObject, 
  healAnswersheetQuestionObject 
} from './utils/latexUtils';
import { 
  Brain, 
  UploadCloud, 
  CheckCircle, 
  Calendar, 
  List, 
  FileText, 
  FileCode,
  Sparkles, 
  PlusCircle, 
  RefreshCw, 
  Trash2, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  ChevronRight,
  Award, 
  BookOpen, 
  Sigma, 
  Info,
  Check,
  Eye,
  EyeOff,
  Flame,
  LayoutTemplate,
  MessageSquare,
  Send,
  Save,
  Edit2,
  Search,
  X,
  Paperclip,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Battery,
  BatteryCharging,
  Wifi,
  Signal,
  HelpCircle
} from 'lucide-react';

// Pure browser-side PDF-to-Image renderer using PDF.js CDN
function PdfImageRenderer({ pdfUrl, pdfjsLoaded }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    const renderPages = async () => {
      if (!window.pdfjsLib) return;
      setLoading(true);
      setHasError(false);
      try {
        const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        if (!active) return;
        setNumPages(pdf.numPages);
        
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (!active) return;

          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.className = 'w-full max-w-3xl my-4 rounded-xl shadow-lg bg-white border border-slate-800 animate-fade-in';
          
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };
          await page.render(renderContext).promise;
          if (!active) return;
          
          container.appendChild(canvas);
        }
      } catch (err) {
        console.error('Error rendering PDF as image, falling back to native iframe:', err);
        if (active) {
          setHasError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    renderPages();
    return () => {
      active = false;
    };
  }, [pdfUrl, pdfjsLoaded]);

  if (hasError) {
    return (
      <div className="w-full flex-grow flex flex-col items-center bg-white rounded-2xl overflow-hidden h-[55vh] border border-slate-800">
        <iframe
          src={pdfUrl}
          className="w-full h-full border-0"
          title="Document Fallback HTML Viewer"
        />
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col items-center overflow-y-auto max-h-[55vh] px-2 bg-slateCustom-950 rounded-2xl border border-slate-800">
      {loading && (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="relative">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
          </div>
          <p className="text-xs text-slate-400">PDF를 고해상도 그림으로 변환하여 렌더링 중입니다...</p>
        </div>
      )}
      <div ref={containerRef} className="w-full flex flex-col items-center"></div>
      {!loading && numPages > 0 && (
        <p className="text-[10px] text-slate-500 my-2">총 {numPages}페이지가 이미지로 정상 변환되었습니다.</p>
      )}
    </div>
  );
}

// 1.4) HTML/시뮬레이터 감지 및 문서 템플릿 생성 헬퍼
const isHeavyHtml = (rawText) => {
  if (!rawText) return false;
  const lower = rawText.toLowerCase();
  return (
    lower.includes('<!doctype') ||
    lower.includes('<html>') ||
    lower.includes('<body') ||
    lower.includes('<script') ||
    lower.includes('<canvas') ||
    lower.includes('<svg') ||
    (lower.includes('<div') && lower.includes('style='))
  );
};

const extractTitleFromHtml = (html) => {
  if (!html || typeof html !== 'string') return '';
  
  // 1) Try <title> tag
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const txt = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    if (txt) return txt;
  }
  
  // 2) Try <h1> tag
  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    const txt = h1Match[1].replace(/<[^>]+>/g, '').trim();
    if (txt) return txt;
  }

  // 3) Try <h2> tag
  const h2Match = html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
  if (h2Match && h2Match[1]) {
    const txt = h2Match[1].replace(/<[^>]+>/g, '').trim();
    if (txt) return txt;
  }
  
  return '';
};

const generateLocalConceptQuestion = (quizItem, targetFormula, allFormulas) => {
  const validFormulas = allFormulas.filter(f => f.title && f.formula && f.title !== targetFormula.title);
  
  // Pick random question type: 0 = identify formula by name, 1 = identify formula name by concept description
  const qType = validFormulas.length >= 3 ? Math.floor(Math.random() * 2) : 0;

  if (qType === 0) {
    const distractors = [];
    const pool = [...validFormulas];
    while (distractors.length < 3 && pool.length > 0) {
      const dIdx = Math.floor(Math.random() * pool.length);
      distractors.push(pool.splice(dIdx, 1)[0]);
    }

    const options = [targetFormula.formula, ...distractors.map(d => d.formula)];
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const correctOptionIndex = shuffled.indexOf(targetFormula.formula);

    return {
      ...quizItem,
      loading: false,
      question: `다음 중 **${targetFormula.title}** 공식의 올바른 수식 표현을 고르시오.`,
      options: shuffled,
      correctOptionIndex,
      explanation: `**${targetFormula.title}**의 공식은 다음과 같습니다:\n\n${targetFormula.formula}\n\n개념: ${targetFormula.concept || '없음'}`,
      isAiGenerated: false
    };
  } else {
    const distractors = [];
    const pool = [...validFormulas];
    while (distractors.length < 3 && pool.length > 0) {
      const dIdx = Math.floor(Math.random() * pool.length);
      distractors.push(pool.splice(dIdx, 1)[0]);
    }

    const options = [targetFormula.title, ...distractors.map(d => d.title)];
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const correctOptionIndex = shuffled.indexOf(targetFormula.title);

    return {
      ...quizItem,
      loading: false,
      question: `다음 설명에 가장 부합하는 공식의 명칭을 고르시오.\n\n> ${targetFormula.concept || '이 공식은 토목/지반공학적 원리를 나타내는 중요한 관계식입니다.'}`,
      options: shuffled,
      correctOptionIndex,
      explanation: `해당 설명은 **${targetFormula.title}** 공식에 관한 것입니다.\n\n공식: ${targetFormula.formula}`,
      isAiGenerated: false
    };
  }
};

const LOCAL_DISTRACTOR_FORMULAS = [
  {
    title: '테르자기 1차 압밀방정식(Terzaghi 1D Consolidation, $C_v$)',
    formula: 'C_v = \\frac{k}{m_v \\gamma_w}',
    concept: '외부 점진/순간 하중 재하 시 시간이 경과함에 따라 과잉간극수압이 상하 배수층을 통해 소산되어 나가는 속도를 규정한 1차원 미분방정식'
  },
  {
    title: '테르자기 극한지지력(Terzaghi Ultimate Bearing Capacity, $q_{ult}$)',
    formula: 'q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}',
    concept: '기초 저면 아래 지반이 전단 파괴 없이 지탱할 수 있는 최대 하중 강도 식'
  },
  {
    title: '바톤 암반 Q분류(Barton Q-system, $Q$)',
    formula: 'Q = \\frac{RQD}{J_n} \\times \\frac{J_r}{J_a} \\times \\frac{J_w}{SRF}',
    concept: '암반의 공학적 특성을 6가지 독립된 변수를 통해 정량화하여 터널 1차 지보 설계를 설계하는 지수 공식'
  },
  {
    title: '연약지반 샌드매트 최소두께(Sand Mat Minimum Thickness, $H$)',
    formula: 'H = \\frac{q - q_a}{\\gamma \\tan\\theta}',
    concept: '표층 개량 및 연약지반 상부에 무거운 주행성 장비를 얹기 위한 하중 지지 소요 두께식'
  },
  {
    title: '락볼트 고착력 계산식(Rockbolt Bond Strength, $P$)',
    formula: 'P = \\pi d L \\tau_{allow}',
    concept: '인발 하중 재하 시 천공홀 배면의 마찰 부착 면적을 기반으로 볼트 탈락에 지탱하는 한계 고착력 식'
  },
  {
    title: '랭킹 주동토압계수(Rankine Active Earth Pressure Coefficient, $K_a$)',
    formula: 'K_a = \\tan^2(45^\\circ - \\phi/2)',
    concept: '지반이 인장 변형을 일으켜 한계 주동 소성 평형 상태에 도달할 때 가설 옹벽 배면에 수평으로 밀어내는 토압식'
  },
  {
    title: '보상기초 보상도(Compensated Foundation Safety Factor, $C$)',
    formula: 'C = \\frac{\\gamma D_f}{q}',
    concept: '구조물 자중을 굴착한 흙의 총 중량으로 완벽히 치환 상쇄하여 순 침하 하중을 Zero로 수렴시키는 평가 공식'
  }
];

const generateRandomQuizQuestion = (allFormulas) => {
  if (!allFormulas || allFormulas.length < 1) return null;
  const validFormulas = allFormulas.filter(f => f.title && f.formula);
  if (validFormulas.length < 1) return null;
  
  const targetIndex = Math.floor(Math.random() * validFormulas.length);
  const target = validFormulas[targetIndex];

  const quizItemPlaceholder = {
    id: `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    formulaTitle: target.title,
    question: '',
    options: [],
    correctOptionIndex: 0,
    userAnswerIndex: null,
    isCorrect: false,
    dateAdded: new Date().toLocaleDateString('sv-SE')
  };

  // Combine validFormulas and LOCAL_DISTRACTOR_FORMULAS to ensure we have at least 4 formulas for distractors
  const pool = [...validFormulas];
  for (const item of LOCAL_DISTRACTOR_FORMULAS) {
    if (!pool.some(f => f.title === item.title)) {
      pool.push(item);
    }
  }

  return generateLocalConceptQuestion(quizItemPlaceholder, target, pool);
};


const clientExtractVariables = (mathContent) => {
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
  return uniqueVars.map(v => `* $${v}$: (이 기호의 공학적 정의를 입력해 보세요)`).join('\n\n');
};

const cleanCorruptedFormula = (formula) => {
  if (!formula || typeof formula !== 'string') return formula;
  
  let cleaned = formula;
  if (cleaned.includes('color:#cc0000') || cleaned.includes('math mode at position')) {
    const match = cleaned.match(/color:#cc0000"\s*>\s*([^<]+?)\s*<\s*\/\s*span\s*>/i) ||
                  cleaned.match(/color:#cc0000"\s*&gt;\s*([^&]+?)\s*&lt;\s*\/\s*span\s*&gt;/i);
                  
    if (match) {
      const coreMath = match[1].trim();
      const closingSpanIndex = cleaned.search(/<\s*\/\s*span\s*>/i);
      let rest = '';
      if (closingSpanIndex !== -1) {
        const restStart = cleaned.indexOf('>', closingSpanIndex);
        if (restStart !== -1) {
          rest = cleaned.substring(restStart + 1);
        }
      } else {
        const closingSpanIndexEntity = cleaned.search(/&lt;\s*\/\s*span\s*&gt;/i);
        if (closingSpanIndexEntity !== -1) {
          const restStart = cleaned.indexOf('&gt;', closingSpanIndexEntity);
          if (restStart !== -1) {
            rest = cleaned.substring(restStart + 4);
          }
        }
      }
      
      let cleanRest = rest
        .replace(/<\s*\/\s*(span|div|p)\s*>/gi, '')
        .replace(/<\s*(div|span|p)[^>]*>/gi, '')
        .replace(/&lt;\s*\/\s*(span|div|p)\s*&gt;/gi, '')
        .replace(/&lt;\s*(div|span|p)[^&]*&gt;/gi, '')
        .trim();
        
      cleaned = `$$${coreMath}$$\n\n${cleanRest}`;
    }
  }
  return cleaned;
};

const cleanAndSanitizeMathText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return rawText || '';
  
  let cleaned = rawText;
  cleaned = cleanCorruptedFormula(cleaned);
  
  // 1. 파싱 과정에서 HTML 코드로 변형된 엔티티 부호들을 순수 문자로 가장 먼저 강제 복구 (태그 매칭 유도)
  cleaned = cleaned.replace(/&#x27;/g, "'")
                   .replace(/&quot;/g, '"')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/&amp;/g, '&');
  
  // 2. 문장 맨 앞에 잘못 달라붙은 깨진 기호('_') 다듬기
  cleaned = cleaned.replace(/_따라서/g, '따라서');
  
  return cleaned;
};

const buildHtmlDocument = (text, isPopup = false) => {
  let cleanedText = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  
  const styleInjection = `
    <style>
      /* Compact & Premium Spacing & Title Overrides */
      html, body {
        margin: 0 !important;
        padding: 6px !important; /* Minimized margin from 16px to 6px */
        padding-top: 8px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        max-width: 100vw !important;
        width: 100% !important;
        overflow-x: hidden !important; /* Crucial: Lock horizontal scroll on page level */
        ${isPopup ? 'overflow-y: auto !important;' : 'overflow-y: hidden !important;'} /* Scroll vertical only */
        background-color: #edf7f2 !important; /* Elegant light pastel green / mint-green background */
        color: #111827 !important; /* High-contrast deep black/charcoal text */
      }
      body > *:first-child, body > *:first-child > *:first-child {
        margin-top: 0 !important;
        padding-top: 0 !important;
      }
      /* Collapse empty spacing elements */
      p:empty, div:empty, span:empty {
        display: none !important;
      }
      /* Make titles elegant, compact and not overly thick */
      h1, h2, h3, h4, .title, [class*="title"], [class*="header"], [class*="banner"], [class*="title-bar"] {
        font-weight: 700 !important; /* Premium semi-bold instead of ultra-bold 900 */
        letter-spacing: -0.025em !important;
        margin-top: 4px !important;
        margin-bottom: 8px !important;
        padding-top: 8px !important;
        padding-bottom: 8px !important;
        min-height: auto !important;
        height: auto !important;
      }
      h1 { font-size: 1.4rem !important; }
      h2 { font-size: 1.2rem !important; }
      h3 { font-size: 1.05rem !important; }
      
      /* KaTeX formulas and tables auto-scroll horizontally instead of stretching the screen */
      .katex-display, table, pre, code {
        max-width: 100% !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        box-sizing: border-box !important;
      }
      .katex-display {
        padding: 0.5em 8px !important;
        margin: 0.25em 0 !important;
      }
      
      /* Custom elegant thin dark scrollbars for light pastel green theme */
      .katex-display::-webkit-scrollbar,
      .overflow-x-auto::-webkit-scrollbar,
      table::-webkit-scrollbar,
      pre::-webkit-scrollbar {
        height: 5px !important;
        width: 5px !important;
        display: block !important;
      }
      .katex-display::-webkit-scrollbar-track,
      .overflow-x-auto::-webkit-scrollbar-track,
      table::-webkit-scrollbar-track,
      pre::-webkit-scrollbar-track {
        background: transparent !important;
      }
      .katex-display::-webkit-scrollbar-thumb,
      .overflow-x-auto::-webkit-scrollbar-thumb,
      table::-webkit-scrollbar-thumb,
      pre::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.15) !important;
        border-radius: 9999px !important;
        border: none !important;
      }
      .katex-display::-webkit-scrollbar-thumb:hover,
      .overflow-x-auto::-webkit-scrollbar-thumb:hover,
      table::-webkit-scrollbar-thumb:hover,
      pre::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.3) !important;
      }

      /* Adjust layout containers to be compact and minimize margins */
      .container, .wrapper, [class*="container"], [class*="wrapper"] {
        padding-top: 4px !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        margin-top: 0 !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }

      /* Restore KaTeX fonts against wildcard !important overrides in HTML reports */
      .katex {
        font-family: KaTeX_Main, "Times New Roman", serif !important;
      }
      .katex * {
        font-family: inherit !important;
      }
      .katex .mathnormal {
        font-family: KaTeX_Math, "Times New Roman", serif !important;
        font-style: italic !important;
      }
      .katex .main {
        font-family: KaTeX_Main, "Times New Roman", serif !important;
      }
      .katex .size1 { font-family: KaTeX_Size1 !important; }
      .katex .size2 { font-family: KaTeX_Size2 !important; }
      .katex .size3 { font-family: KaTeX_Size3 !important; }
      .katex .size4 { font-family: KaTeX_Size4 !important; }
      .katex .ams { font-family: KaTeX_AMS !important; }
      .katex .cal { font-family: KaTeX_Caligraphic !important; }
      .katex .frak { font-family: KaTeX_Fraktur !important; }
      .katex .sans { font-family: KaTeX_SansSerif !important; }
      .katex .mono { font-family: KaTeX_Typewriter !important; }
    </style>
  `;

  const katexAndAutoRenderInjection = `
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/copy-tex.min.js"></script>
    <script>
      function healIframeMath() {
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        const mathNodes = [];
        const hasLaTeX = /\\\\(cdot|frac|left|right|gamma|sigma|tau|beta|alpha|delta|theta|phi|mu|omega|pi|sqrt|times|bar|hat|tilde|mathrm|text)\\b|([kK]_[{]?[h30]+[}]?)|([yγ]_[{]?[a-zA-Z0-9]+[}]?)/;
        while (node = walk.nextNode()) {
          const parent = node.parentNode;
          if (parent) {
            const tag = parent.tagName.toUpperCase();
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'CODE' || tag === 'PRE') {
              continue;
            }
          }
          const text = node.nodeValue;
          if (!text) continue;
          if (hasLaTeX.test(text) && !text.includes('$')) {
            mathNodes.push(node);
          }
        }
        mathNodes.forEach(node => {
          node.nodeValue = '$$' + node.nodeValue + '$$';
        });
      }

      let isRendering = false;
      function triggerRender() {
        if (isRendering) return;
        isRendering = true;
        try {
          healIframeMath();
          if (typeof renderMathInElement === 'function') {
            renderMathInElement(document.body, {
              delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false},
                {left: "\\\\(", right: "\\\\)", display: false},
                {left: "\\\\[", right: "\\\\]", display: true}
              ],
              throwOnError: false
            });
          }
          if (window.parent) {
            window.parent.postMessage({ type: 'mathRendered' }, '*');
          }
        } catch (e) {
          console.warn("KaTeX render error inside HTML:", e);
        } finally {
          isRendering = false;
        }
      }

      let initRetries = 0;
      function initKaTeX() {
        if (typeof renderMathInElement === 'function') {
          triggerRender();
          
          document.body.addEventListener('input', () => {
            setTimeout(triggerRender, 50);
          });
          document.body.addEventListener('change', () => {
            setTimeout(triggerRender, 50);
          });
          document.body.addEventListener('click', () => {
            setTimeout(triggerRender, 100);
          });
          
          const intervals = [100, 300, 600, 1200, 2000, 4000];
          intervals.forEach((delay) => {
            setTimeout(triggerRender, delay);
          });
        } else {
          if (initRetries < 100) {
            initRetries++;
            setTimeout(initKaTeX, 50);
          } else {
            console.warn("KaTeX did not load after 5 seconds. Giving up.");
          }
        }
      }

      // Immediately run failsafe, and also bind to load/DOMContentLoaded
      initKaTeX();
      document.addEventListener("DOMContentLoaded", initKaTeX);
      window.addEventListener("load", initKaTeX);
    </script>
  `;

  let srcDoc = cleanedText;
  if (!/<!DOCTYPE/i.test(cleanedText) && !/<html/i.test(cleanedText)) {
    srcDoc = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${styleInjection}
  ${katexAndAutoRenderInjection}
</head>
<body>
  ${cleanedText}
</body>
</html>
    `;
  } else {
    if (/<head>/i.test(srcDoc)) {
      srcDoc = srcDoc.replace(/<head>/i, () => `<head>${styleInjection}${katexAndAutoRenderInjection}</head>`);
    } else if (/<html/i.test(srcDoc)) {
      srcDoc = srcDoc.replace(/<html[^>]*>/i, (m) => `${m}<head>${styleInjection}${katexAndAutoRenderInjection}</head>`);
    } else {
      srcDoc = styleInjection + katexAndAutoRenderInjection + srcDoc;
    }
  }

  return srcDoc;
};

// 1.6) HTML/시뮬레이터 팝업 창 오픈 헬퍼 함수
const handleOpenHtmlAnswerPopup = (title, text) => {
  if (!text) return;
  const parsedTitle = title || "정답 확인";
  const popupWidth = 1200;
  const popupHeight = 900;
  const left = window.screen.width / 2 - popupWidth / 2;
  const top = window.screen.height / 2 - popupHeight / 2;
  
  const popupWindow = window.open(
    '', 
    '_blank', 
    `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
  );
  
  if (popupWindow) {
    const htmlDocument = buildHtmlDocument(text, true);
    // Escape single quotes and double quotes for srcdoc
    const escapedHtml = htmlDocument
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');

    const wrapperHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${parsedTitle} - 시뮬레이터 정답</title>
  <style>
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
      background-color: #edf7f2 !important;
    }
    iframe {
      width: 100% !important;
      height: 100% !important;
      border: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  </style>
</head>
<body>
  <iframe srcdoc="${escapedHtml}"></iframe>
</body>
</html>
    `;
    popupWindow.document.open();
    popupWindow.document.write(wrapperHtml);
    popupWindow.document.close();
    popupWindow.focus();
  } else {
    alert("팝업 차단기가 활성화되어 있어 팝업창을 열 수 없습니다. 브라우저 설정에서 이 사이트의 팝업을 허용해 주세요.");
  }
};

function convertMarkdownToHtml(mdText, isMarkdown = false) {
  const mathBlocks = [];
  let placeholderIndex = 0;
  
  // 0. Normalize escaped and actual newlines
  let tempText = mdText
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');

  // Protect $$ ... $$
  tempText = tempText.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (match) => {
    const placeholder = `___BLOCK_MATH_${placeholderIndex}___`;
    mathBlocks.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  // Protect $ ... $ (Allowing newlines inside inline math blocks so they don't break during split)
  tempText = tempText.replace(/\$([^\$]+?)\$/g, (match) => {
    const placeholder = `___INLINE_MATH_${placeholderIndex}___`;
    mathBlocks.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  // 2. Headings on same line: "Text ### Title" -> "Text\n\n### Title"
  tempText = tempText.replace(/([^\n])\s*(#{2,6}\s+)/g, '$1\n\n$2');

  // 3. Bold text
  tempText = tempText.replace(/\*\*([^\*]+?)\*\*/g, '<strong style="color: #f1f5f9; font-weight: 700;">$1</strong>');

  // 3.5. Force line breaks before *** or * * * if they are in the middle of a line and not preceded by a newline
  tempText = tempText.replace(/([^\n])[ \t]*(?:\* * \*|\*\*\*)[ \t]*/g, '$1\n* * * ');

  // 4. Render headings to styled HTML
  tempText = tempText.replace(/^(###+)\s+(.*?)$/gm, (match, hashes, title) => {
    if (isMarkdown) {
      return `<h3 style="margin-top: 1.6rem; margin-bottom: 0.6rem; font-weight: 800; color: #f1f5f9; font-size: 1.05rem; border-bottom: 1px solid #334155; padding-bottom: 0.3rem;">${title}</h3>`;
    } else {
      return `<h3 style="margin-top: 0.8rem; margin-bottom: 0.4rem; font-weight: 800; color: #f1f5f9; font-size: 1rem; border-bottom: 1px solid rgba(51, 65, 85, 0.3); padding-bottom: 0.2rem;">${title}</h3>`;
    }
  });
  tempText = tempText.replace(/^(##)\s+(.*?)$/gm, (match, hashes, title) => {
    if (isMarkdown) {
      return `<h2 style="margin-top: 1.8rem; margin-bottom: 0.8rem; font-weight: 900; color: #f8fafc; font-size: 1.2rem; border-bottom: 1px solid #475569; padding-bottom: 0.4rem;">${title}</h2>`;
    } else {
      return `<h2 style="margin-top: 1rem; margin-bottom: 0.5rem; font-weight: 900; color: #f8fafc; font-size: 1.1rem; border-bottom: 1px solid rgba(71, 85, 105, 0.3); padding-bottom: 0.3rem;">${title}</h2>`;
    }
  });

  // 5. Render list items (both bullet points * and - and numbered lists)
  if (isMarkdown) {
    tempText = tempText.replace(/^[ \t]*(?:\* \* \*|\*\*\*)[ \t]*(.*?)$/gm, '<div style="margin-top: 0.6rem; margin-bottom: 0.6rem; padding-left: 1.25rem; text-indent: -1.25rem; color: #ffffff; line-height: 1.6;">• $1</div>');
    tempText = tempText.replace(/^[ \t]*(?:\*|-)[ \t]+(.*?)$/gm, '<div style="margin-top: 0.6rem; margin-bottom: 0.6rem; padding-left: 1.25rem; text-indent: -1.25rem; color: #ffffff; line-height: 1.6;">• $1</div>');
    tempText = tempText.replace(/^(\d+)\.\s+(.*?)$/gm, '<div style="margin-top: 0.6rem; margin-bottom: 0.6rem; padding-left: 1.25rem; text-indent: -1.25rem; color: #ffffff; line-height: 1.6;">$1. $2</div>');
  } else {
    tempText = tempText.replace(/^[ \t]*(?:\* \* \*|\*\*\*)[ \t]*(.*?)$/gm, '<div style="margin-top: 0.2rem; margin-bottom: 0.2rem; padding-left: 1rem; text-indent: -1rem; color: #ffffff; line-height: 1.5;">• $1</div>');
    tempText = tempText.replace(/^[ \t]*(?:\*|-)[ \t]+(.*?)$/gm, '<div style="margin-top: 0.2rem; margin-bottom: 0.2rem; padding-left: 1rem; text-indent: -1rem; color: #ffffff; line-height: 1.5;">• $1</div>');
    tempText = tempText.replace(/^(\d+)\.\s+(.*?)$/gm, '<div style="margin-top: 0.2rem; margin-bottom: 0.2rem; padding-left: 1rem; text-indent: -1rem; color: #ffffff; line-height: 1.5;">$1. $2</div>');
  }

  // 5.5. Remove extra newlines around list divs to prevent spacers/br from adding huge gaps
  tempText = tempText.replace(/(<\/div>)\n+(<div style="[^"]*">(?:•|\d+\.))/g, '$1$2');

  // 6. Spacers for paragraph gaps
  if (isMarkdown) {
    tempText = tempText.replace(/\n\n/g, '<div style="height: 0.8rem;"></div>');
    tempText = tempText.replace(/\n/g, '<br/>');
  } else {
    tempText = tempText.replace(/\n\n/g, '<div style="height: 0.4rem;"></div>');
    tempText = tempText.replace(/\n/g, '<br/>');
  }

  // Restore math blocks — MUST use function replacer to prevent $ from being treated as special pattern ($1, $&, etc.)
  mathBlocks.forEach(block => {
    while (tempText.includes(block.placeholder)) {
      tempText = tempText.replace(block.placeholder, () => block.content);
    }
  });

  // Final guard: remove any leaked placeholders that couldn't be restored
  tempText = tempText.replace(/___(BLOCK|INLINE)_MATH_\d+___/g, '');

  return tempText;
}

// Helper to render KaTeX with display-style fractions (\dfrac) for improved readability
const renderKatexString = (math, options) => {
  if (!math) return '';
  const processedMath = math.replace(/\\frac\b/g, '\\dfrac');
  if (window.katex) {
    try {
      // Force throwOnError: true to prevent KaTeX from generating title strings with '$'
      return window.katex.renderToString(processedMath, { ...options, throwOnError: true }).replace(/\n/g, '');
    } catch (e) {
      console.warn('KaTeX render error:', e);
      const escapedMath = processedMath
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\$/g, '&#36;');
      return `<span class="katex-error" style="color:#cc0000; font-family: monospace;" title="KaTeX error: ${escapedMath}">${escapedMath}</span>`;
    }
  }
  return options.displayMode ? `$$${math}$$` : `$${math}$`;
};

function buildHtmlTableFromMarkdownRows(rows) {
  if (rows.length < 2) return rows.join('\n');

  const headers = rows[0]
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim());

  const separator = rows[1];
  if (!separator.includes('---')) {
    return rows.join('\n');
  }

  const bodyRows = [];
  for (let i = 2; i < rows.length; i++) {
    const cells = rows[i]
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    bodyRows.push(cells);
  }

  let html = `<div class="w-full my-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">`;
  html += `<table class="w-full text-center border-collapse text-sm">`;
  html += `<thead>`;
  html += `<tr class="bg-slate-900/80 text-slate-350 border-b border-slate-800">`;
  headers.forEach(h => {
    html += `<th class="p-3 font-extrabold border-r border-slate-800 last:border-r-0">${h}</th>`;
  });
  html += `</tr>`;
  html += `</thead>`;
  html += `<tbody>`;
  bodyRows.forEach(row => {
    html += `<tr class="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/20">`;
    row.forEach(cell => {
      html += `<td class="p-3 border-r border-slate-800 last:border-r-0 text-slate-350">${cell}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody>`;
  html += `</table>`;
  html += `</div>`;

  return html;
}

function convertMarkdownTablesToHtml(text) {
  if (!text) return text;
  const lines = text.split('\n');
  let inTable = false;
  let tableRows = [];
  const processedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(trimmed);
    } else {
      if (inTable) {
        const htmlTable = buildHtmlTableFromMarkdownRows(tableRows);
        processedLines.push(htmlTable);
        inTable = false;
      }
      processedLines.push(line);
    }
  }
  if (inTable) {
    const htmlTable = buildHtmlTableFromMarkdownRows(tableRows);
    processedLines.push(htmlTable);
  }
  return processedLines.join('\n');
}

// Dynamic KaTeX loader & Math text renderer
const LatexRenderer = React.memo(function LatexRenderer({ text, katexLoaded, className = "", enableAddFormula = false, placeholderIfHeavy = false, popupTitle = "", isMarkdown = false }) {
  if (!text) return null;

  const longPressTimer = useRef(null);
  const isLongPressActive = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const triggerAddFormula = (katexEl) => {
    const annotation = katexEl.querySelector('annotation[encoding="application/x-tex"]');
    if (!annotation) return;
    
    const mathTex = annotation.textContent || annotation.innerText;
    if (!mathTex) return;
    
    const cleanMath = mathTex.trim();
    if (typeof window.__handleFormulaConfirmRequest === 'function') {
      window.__handleFormulaConfirmRequest(cleanMath, text);
    }
  };

  const startPress = (clientX, clientY, target) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    isLongPressActive.current = false;
    startPos.current = { x: clientX, y: clientY };

    let katexEl = target.closest('.katex, .katex-display');
    if (!katexEl) {
      katexEl = target.querySelector('.katex, .katex-display');
    }
    if (!katexEl) return;

    longPressTimer.current = setTimeout(() => {
      isLongPressActive.current = true;
      triggerAddFormula(katexEl);
    }, 1500);
  };

  const cancelPress = (clientX, clientY, isMove = false) => {
    if (isMove) {
      const dx = clientX - startPos.current.x;
      const dy = clientY - startPos.current.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) return;
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    startPress(e.clientX, e.clientY, e.target);
  };

  const handleMouseMove = (e) => {
    cancelPress(e.clientX, e.clientY, true);
  };

  const handleMouseUpOrLeave = () => {
    cancelPress(0, 0, false);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    startPress(touch.clientX, touch.clientY, e.target);
  };

  const handleTouchMove = (e) => {
    const touch = e.touches[0];
    cancelPress(touch.clientX, touch.clientY, true);
  };

  const handleTouchEndOrCancel = () => {
    cancelPress(0, 0, false);
  };

  const handleFormulaClick = (e) => {
    if (isLongPressActive.current) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressActive.current = false;
    }
  };

  const eventHandlers = enableAddFormula ? {
    onClick: handleFormulaClick,
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUpOrLeave,
    onMouseLeave: handleMouseUpOrLeave,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEndOrCancel,
    onTouchCancel: handleTouchEndOrCancel,
    onContextMenu: (e) => e.preventDefault(),
  } : {};

  // 0.5) 필수공식/이론유도 내 지반 단위중량 기호 y(\y) 그리스 감마(\gamma) 자가치유 규칙 탑재
  const healFormulas = (val) => {
    return healLatexFormulas(val);
  };

  let renderText = cleanAndSanitizeMathText(text);
  if (typeof renderText === 'string') {
    renderText = renderText.replace(/INPUT_?(\d+)/gi, (match, p1) => {
      const num = parseInt(p1, 10);
      return String.fromCharCode(64 + num);
    });
  }
  if (typeof renderText === 'string' && renderText.trim().startsWith('{')) {
    try {
      const trimmedText = renderText.trim();
      if (trimmedText.endsWith('}')) {
        const parsed = JSON.parse(trimmedText);
        let parts = [];
        if (parsed.title) parts.push(`### ${parsed.title}`);
        if (parsed.concept) parts.push(`**개념:** ${parsed.concept}`);
        if (parsed.assumptions) parts.push(`**기본 가정:**\n${parsed.assumptions}`);
        if (parsed.explanation) parts.push(`**상세 설명:**\n${parsed.explanation}`);
        if (parsed.answer) parts.push(`**유도 및 해설:**\n${parsed.answer}`);
        if (parts.length > 0) {
          renderText = parts.join('\n\n');
        }
      }
    } catch (e) {
      // JSON 파싱 실패 시 원본 그대로 사용
    }
  }

  const isHeavy = isHeavyHtml(renderText);
  let processedText = renderText;
  if (typeof processedText === 'string' && !isHeavy) {
    processedText = processedText.replace(/<div[^>]*>/gi, '').replace(/<\/div>/gi, '');
    if (!processedText.includes('\n')) {
      processedText = processedText.replace(/([가-힣a-zA-Z0-9])다\.\s+/g, '$1다.\n\n');
    }
  }

  // 1) 불필요한 연속 빈 행을 최대 2개로 압축하여 컴팩트하게 정리
  let cleanedText = isHeavy
    ? processedText.replace(/\\r\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim()
    : healFormulas(processedText)
        .replace(/\\r\\n/g, '\n')  // escaped \r\n → real newline
        .replace(/\\n/g, '\n')      // escaped \n → real newline
        .replace(/\r\n/g, '\n')     // CR+LF → LF
        .replace(/\n{3,}/g, '\n\n') // max 2 consecutive newlines
        .trim();

  if (typeof cleanedText === 'string') {
    cleanedText = convertMarkdownTablesToHtml(cleanedText);
  }

  // Tutor panels (isMarkdown=true) use rich markdown-to-HTML conversion.
  // Standard answers (isMarkdown=false) use the safe line-by-line rendering path.
  if (!isHeavy && isMarkdown) {
    cleanedText = convertMarkdownToHtml(cleanedText, true);
  }

  if (isHeavy) {
    if (placeholderIfHeavy) {
      return (
        <div className="w-full my-3 p-6 rounded-2xl border border-slate-700/60 shadow-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 animate-fade-in flex flex-col items-center justify-center text-center space-y-4">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full animate-pulse shadow-[0_0_20px_rgba(244,63,94,0.15)]">
            <Brain size={32} className="text-rose-500" />
          </div>
          <div className="space-y-1 max-w-md">
            <h4 className="text-base font-extrabold text-white tracking-tight">인터랙티브 시뮬레이터 로드 완료</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              복잡한 대형 HTML/JS 시뮬레이터 정답입니다. 학습 환경의 쾌적함과 고성능 운용을 위해 별도의 <strong>새 브라우저 팝업 창</strong>에 안전하게 마운트되었습니다.
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenHtmlAnswerPopup(popupTitle, text);
            }}
            className="mt-2 py-2 px-5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl transition-all duration-200 active:scale-[0.97] hover:scale-105 cursor-pointer shadow-lg shadow-rose-600/20 hover:shadow-rose-600/40 border border-rose-500/30 flex items-center justify-center gap-2 group select-none"
          >
            <span>🖥️ 새 팝업 창에 다시 열기</span>
          </button>
        </div>
      );
    }

    const srcDoc = buildHtmlDocument(text, false);
    return (
      <div className="w-full my-3 overflow-hidden rounded-2xl border border-slate-700/40 shadow-2xl bg-white animate-fade-in">
        <iframe
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin allow-modals allow-popups"
          className="w-full border-0 block"
          style={{ height: '520px', overflow: 'hidden' }}
          scrolling="no"
          onLoad={(e) => {
            const iframe = e.target;
            const adjustHeight = () => {
              try {
                const doc = iframe.contentWindow?.document;
                if (doc && doc.body) {
                  const height = Math.max(
                    doc.body.scrollHeight,
                    doc.documentElement.scrollHeight,
                    doc.body.offsetHeight,
                    doc.documentElement.offsetHeight
                  );
                  iframe.style.height = (height + 28) + 'px';
                }
              } catch (err) {
                // ignore
              }
            };

            adjustHeight();

            const handleMessage = (event) => {
              if (event.data && event.data.type === 'mathRendered') {
                adjustHeight();
              }
            };
            window.addEventListener('message', handleMessage);

            const intervals = [100, 300, 600, 1000, 2000, 4000];
            intervals.forEach((delay) => {
              setTimeout(adjustHeight, delay);
            });

            iframe.addEventListener('unload', () => {
              window.removeEventListener('message', handleMessage);
            });
          }}
          title="Interactive Simulator Drawing"
        />
      </div>
    );
  }

  // Convert simple block math (double dollars) to inline math (single dollars) if they are short and simple
  cleanedText = cleanedText.replace(/\$\$\s*([^\$\n]{1,50})\s*\$\$/g, (match, formula) => {
    const lower = formula.toLowerCase();
    const hasBlockElement = /\\frac|\\sqrt|\\sum|\\int|\\begin|\\end|\\\\|=/.test(lower);
    if (!hasBlockElement) {
      return `$${formula.trim()}$`;
    }
    return match;
  });

  // Clean up newlines and extra spaces around inline math if they are part of a continuous sentence
  cleanedText = cleanedText.replace(/([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9a-zA-Z\(\[\{])\s*\n\s*(\$[^\$]+?\$)/g, '$1 $2');
  cleanedText = cleanedText.replace(/(\$[^\$]+?\$)\s*\n\s*([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F0-9a-zA-Z\)\}\]\,\.\!\?])/g, '$1 $2');

  // Check if text contains HTML tags (fully supported for custom layouts/tables/styling)
  const hasHtml = /<\/?(div|table|tr|td|th|tbody|thead|tfoot|p|span|br|hr|strong|em|ul|ol|li|h[1-6]|b|i|a|img|code|pre|style|html|body)\b[^>]*>/i.test(cleanedText);

  if (hasHtml) {
    let htmlContent = cleanedText;
    if (window.katex) {
      // Render block math $$ ... $$
      htmlContent = htmlContent.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (m, math) => {
        const rendered = renderKatexString(math.trim(), { displayMode: true, throwOnError: false });
        return `<div class="formula-scroll-container py-1.5" style="text-align: center; margin-top: 0.5rem; margin-bottom: 0.5rem; width: 100%;">${rendered}</div>`;
      });
      // Render inline math $ ... $
      htmlContent = htmlContent.replace(/\$([^\$]+?)\$/gs, (m, math) => {
        return renderKatexString(math.trim(), { displayMode: false, throwOnError: false });
      });
    }

    const isInline = className.includes('inline');
    if (isInline) {
      return (
        <span 
          className={`${className} select-text ${enableAddFormula ? 'enable-add-formula' : ''}`}
          {...eventHandlers}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      );
    }
    return (
      <div 
        className={`${className} select-text w-full formula-scroll-container ${enableAddFormula ? 'enable-add-formula' : ''}`}
        {...eventHandlers}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    );
  }


  if (!window.katex) {
    return <div className={`${className} whitespace-pre-line leading-relaxed select-text`}>{cleanedText}</div>;
  }

  // $$ ... $$ 블록 수학 기호를 기준으로 쪼갭니다.
  const parts = [];
  let lastIndex = 0;
  const blockRegex = /\$\$(.*?)\$\$/gs;
  let match;

  while ((match = blockRegex.exec(cleanedText)) !== null) {
    const beforeText = cleanedText.substring(lastIndex, match.index);
    if (beforeText && beforeText.trim() !== '') {
      parts.push({ type: 'text', content: beforeText });
    }
    parts.push({ type: 'math-block', content: match[1].trim() });
    lastIndex = blockRegex.lastIndex;
  }

  const afterText = cleanedText.substring(lastIndex);
  if (afterText && afterText.trim() !== '') {
    parts.push({ type: 'text', content: afterText });
  }

  // Find the index of the last math-block in parts to only show add button there
  const mathBlockIndices = parts
    .map((p, i) => (p.type === 'math-block' ? i : -1))
    .filter((i) => i !== -1);
  const lastMathBlockIdx = mathBlockIndices.length > 0 ? mathBlockIndices[mathBlockIndices.length - 1] : -1;

  // 각 파트별 렌더링
  const isInline = className.includes('inline');

  if (isInline) {
    return (
      <span 
        className={`${className} select-text ${enableAddFormula ? 'enable-add-formula' : ''}`}
        {...eventHandlers}
      >
        {parts.map((part, idx) => {
          if (part.type === 'math-block') {
            const mathHtml = renderKatexString(part.content, { displayMode: true, throwOnError: false });
            return (
              <span 
                key={idx} 
                className="my-0.5 md:my-1 inline-block w-full bg-transparent rounded-none border-0 transition-all duration-300 group shadow-none select-text"
              >
                <span 
                  className="formula-scroll-container block w-full py-1.5 min-w-0 select-text" 
                  onTouchStart={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                  onTouchMove={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                  onTouchEnd={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                  onTouchCancel={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                  dangerouslySetInnerHTML={{ __html: mathHtml }} 
                />
              </span>
            );
          } else {
            let htmlContent = part.content;
            try {
              htmlContent = htmlContent.replace(/\$([^\$]+?)\$/gs, (m, math) => {
                if (/[\uAC00-\uD7A3]/.test(math)) {
                  const isRealFormula = /\\/.test(math) || /_/.test(math) || /\^/.test(math) || /[=+\-\*\/]/.test(math) || /\\cdot/.test(math);
                  if (!isRealFormula) {
                    return m;
                  }
                }
                return renderKatexString(math.trim(), { displayMode: false, throwOnError: false });
              });
            } catch (e) {
              console.warn(e);
            }
            return (
              <span 
                key={idx}
                className="leading-relaxed whitespace-pre-line select-text"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            );
          }
        })}
      </span>
    );
  }

  return (
    <div 
      className={`${className} space-y-1.5 select-text ${enableAddFormula ? 'enable-add-formula' : ''}`}
      {...eventHandlers}
    >
      {parts.map((part, idx) => {
        if (part.type === 'math-block') {
          const mathHtml = renderKatexString(part.content, { displayMode: true, throwOnError: false });

          return (
            <div 
              key={idx} 
              className="my-0.5 md:my-1 flex flex-col md:flex-row items-center justify-center gap-4 w-full bg-transparent rounded-none border-0 transition-all duration-300 group shadow-none select-text"
            >
              {/* KaTeX 수식 */}
              <div 
                className="formula-scroll-container w-full py-1.5 min-w-0 select-text" 
                onTouchStart={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                onTouchMove={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                onTouchEnd={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                onTouchCancel={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                dangerouslySetInnerHTML={{ __html: mathHtml }} 
              />
            </div>
          );
        } else {
          // 비인라인 일반 텍스트의 경우, 빈 행을 제거하고 단락 숫자(1., 2. 등)가 있는 줄만 위아래 여백 적용
          // KaTeX HTML이 개행 기호 split으로 인해 깨지는 것을 막기 위해 전체 텍스트에서 수식을 먼저 치환한 다음 개행으로 쪼갭니다.
          let htmlContent = part.content;
          try {
            htmlContent = htmlContent.replace(/\$([^\$]+?)\$/gs, (m, math) => {
              if (/[\uAC00-\uD7A3]/.test(math)) {
                const isRealFormula = /\\/.test(math) || /_/.test(math) || /\^/.test(math) || /[=+\-\*\/]/.test(math) || /\\cdot/.test(math);
                if (!isRealFormula) {
                  return m;
                }
              }
              return renderKatexString(math.trim(), { displayMode: false, throwOnError: false });
            });
          } catch (e) {
            console.warn(e);
          }

          const textLines = htmlContent.split('\n');

          return (
            <div key={idx} className="select-text">
              {textLines.map((line, lIdx) => {
                const cleanLine = line.trim();
                if (cleanLine === '') {
                  return <div key={lIdx} className="h-2 select-none" />;
                }
                // 1. 또는 2.1. 또는 단계 2.1 등 단락 구분 숫자가 있는 경우 위아래 여백 부여
                const isHeading = /^\s*\d+(\.\d+)*\./.test(cleanLine) || /^\s*단계\s*\d+(\.\d+)*/.test(cleanLine);
                
                if (isHeading) {
                  return (
                    <div 
                      key={lIdx}
                      className={`${lIdx === 0 ? 'pt-2' : 'pt-6'} pb-2 font-extrabold text-white text-[15px] sm:text-base leading-relaxed select-text block`}
                      dangerouslySetInnerHTML={{ __html: line }}
                    />
                  );
                }

                // 치환된 KaTeX가 단독으로 한 줄을 차지하는 경우 가운데 정렬 마크업 적용
                const isStandaloneMath = (cleanLine.startsWith('<span class="katex') || cleanLine.startsWith('<div class="katex')) && cleanLine.endsWith('</span>');

                if (isStandaloneMath) {
                  return (
                    <div 
                      key={lIdx}
                      className="formula-scroll-container w-full py-1 text-sm sm:text-[14px] text-slate-300 leading-relaxed select-text"
                      onTouchStart={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                      onTouchMove={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                      onTouchEnd={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                      onTouchCancel={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                      dangerouslySetInnerHTML={{ __html: line }}
                    />
                  );
                }

                return (
                  <div 
                    key={lIdx}
                    className="py-0.5 text-sm sm:text-[14px] text-slate-300 leading-relaxed select-text block"
                    dangerouslySetInnerHTML={{ __html: line }}
                  />
                );
              })}
            </div>
          );
        }
      })}
    </div>
  );
});

// ── 주관식 표채우기 퀴즈 렌더러 ──────────────────
const TableQuiz = React.memo(function TableQuiz({ questionIdx, q, tableAnswers, setTableAnswers, revealed, katexLoaded, tableGradingResults }) {
  if (!q.tableData || !q.tableData.headers || !q.tableData.rows) {
    return <div className="text-red-400 text-xs py-2">오류: 표 데이터가 올바르지 않습니다.</div>;
  }

  const { headers, rows } = q.tableData;

  const handleInputChange = (inputId, val) => {
    setTableAnswers(prev => ({
      ...prev,
      [`${questionIdx}_${inputId}`]: val
    }));
  };

  return (
    <div className="w-full my-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
      <table className="w-full text-center border-collapse text-sm">
        <thead>
          <tr className="bg-slate-900/80 text-slate-350 border-b border-slate-800">
            {headers.map((header, hIdx) => (
              <th key={hIdx} className="p-3 font-extrabold border-r border-slate-800 last:border-r-0 select-text">
                <LatexRenderer text={header} katexLoaded={katexLoaded} className="inline" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/20">
              {row.map((cell, cIdx) => {
                const isInput = typeof cell === 'string' && cell.includes('[INPUT_');
                if (isInput) {
                  const inputId = cell.replace('[', '').replace(']', '').trim();
                  const value = tableAnswers[`${questionIdx}_${inputId}`] || '';
                  const correctAnswer = q.answers?.[inputId] || '';
                  
                  const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
                  const gradingResult = tableGradingResults?.[`${questionIdx}_${inputId}`];
                  const isCorrect = gradingResult 
                    ? gradingResult.isCorrect 
                    : (normalize(value) === normalize(correctAnswer));
 
                  const match = inputId.match(/\d+/);
                  const inputNum = match ? parseInt(match[0], 10) : 1;
                  const inputLetter = String.fromCharCode(64 + inputNum);
                  return (
                    <td key={cIdx} className="p-1.5 border-r border-slate-800 last:border-r-0 text-slate-200 min-w-[130px]">
                      <div className="flex flex-col gap-1 justify-center items-center w-full">
                        <div className="flex items-center gap-1.5 w-full">
                          <span className="text-xs font-bold text-slate-400 select-none min-w-[14px] text-right">{inputLetter}</span>
                          <input
                            type="text"
                            disabled={revealed}
                            value={value}
                            onChange={(e) => handleInputChange(inputId, e.target.value)}
                            placeholder={`${inputLetter} 입력`}
                            className={`w-full text-xs px-2 py-1 rounded-lg bg-slate-900 border text-slate-100 placeholder-slate-600 focus:outline-none transition-all duration-200 ${
                              revealed 
                                ? (isCorrect 
                                    ? 'border-emerald-500 bg-emerald-950/20 text-emerald-300 font-bold' 
                                    : 'border-rose-500 bg-rose-950/20 text-rose-300')
                                : 'border-slate-700 focus:border-slate-500 focus:ring-1 focus:ring-slate-500'
                            }`}
                          />
                        </div>
                        {revealed && !isCorrect && (
                          <span className="text-[10px] text-emerald-450 font-black flex items-center gap-1 select-text">
                            {inputLetter} 정답: <LatexRenderer text={correctAnswer} katexLoaded={katexLoaded} className="inline" />
                          </span>
                        )}
                        {revealed && isCorrect && (
                          <span className="text-[10px] text-emerald-450 font-black flex items-center gap-1 select-text">
                            {inputLetter} 일치함
                          </span>
                        )}
                      </div>
                    </td>
                  );
                } else {
                  return (
                    <td key={cIdx} className="p-3 border-r border-slate-800 last:border-r-0 text-slate-350 select-text">
                      <LatexRenderer text={cell} katexLoaded={katexLoaded} className="inline" />
                    </td>
                  );
                }
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

// ── 객관식 표 렌더러 ──────────────────
const ReadOnlyTable = React.memo(function ReadOnlyTable({ tableData, katexLoaded }) {
  if (!tableData || !tableData.headers || !tableData.rows) return null;
  const { headers, rows } = tableData;
  return (
    <div className="w-full my-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
      <table className="w-full text-center border-collapse text-sm">
        <thead>
          <tr className="bg-slate-900/80 text-slate-350 border-b border-slate-800">
            {headers.map((header, hIdx) => (
              <th key={hIdx} className="p-3 font-extrabold border-r border-slate-800 last:border-r-0 select-text">
                <LatexRenderer text={header} katexLoaded={katexLoaded} className="inline" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/20">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="p-3 border-r border-slate-800 last:border-r-0 text-slate-350 select-text">
                  <LatexRenderer text={cell} katexLoaded={katexLoaded} className="inline" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

function parseMarkdownTable(questionText) {
  if (!questionText) return null;
  const lines = questionText.split('\n');
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (startIdx === -1) {
        startIdx = i;
      }
      endIdx = i;
    } else {
      if (startIdx !== -1) {
        break;
      }
    }
  }

  if (startIdx !== -1 && endIdx !== -1 && (endIdx - startIdx) >= 2) {
    const headers = lines[startIdx]
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    
    const separatorLine = lines[startIdx + 1];
    if (separatorLine.includes('---')) {
      const rows = [];
      for (let i = startIdx + 2; i <= endIdx; i++) {
        const rowCells = lines[i]
          .split('|')
          .slice(1, -1)
          .map(cell => cell.trim());
        rows.push(rowCells);
      }
      
      const originalTableText = lines.slice(startIdx, endIdx + 1).join('\n');
      return {
        tableData: { headers, rows },
        originalTableText
      };
    }
  }
  return null;
}

// ── 질문 내 표 파싱 유틸리티 ──────────────────
function parseQuestionTable(q) {
  let questionText = q.question || '';
  let tableData = q.tableData || null;

  if (questionText.toLowerCase().includes('<table') || questionText.toLowerCase().replace(/\s+/g, '').includes('<table')) {
    // HTML 태그 내의 불필요한 공백을 표준 공백으로 정규화
    let cleaned = questionText
      .replace(/<\s*table[^>]*>/gi, '<table>')
      .replace(/<\s*\/+\s*table[^>]*>/gi, '</table>')
      .replace(/<\s*tr[^>]*>/gi, '<tr>')
      .replace(/<\s*\/+\s*tr[^>]*>/gi, '</tr>')
      .replace(/<\s*th[^>]*>/gi, '<th>')
      .replace(/<\s*\/+\s*th[^>]*>/gi, '</th>')
      .replace(/<\s*td[^>]*>/gi, '<td>')
      .replace(/<\s*\/+\s*td[^>]*>/gi, '</td>');

    const tableRegex = /<table>([\s\S]*?)<\/table>/i;
    const match = cleaned.match(tableRegex);
    if (match) {
      const tableContent = match[1];
      const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      const headers = [];
      const rows = [];
      
      while ((trMatch = trRegex.exec(tableContent)) !== null) {
        const rowContent = trMatch[1];
        const thRegex = /<th>([\s\S]*?)<\/th>/gi;
        let thMatch;
        const ths = [];
        while ((thMatch = thRegex.exec(rowContent)) !== null) {
          ths.push(thMatch[1].trim());
        }
        if (ths.length > 0) {
          headers.push(...ths);
          continue;
        }
        
        const tdRegex = /<td>([\s\S]*?)<\/td>/gi;
        let tdMatch;
        const tds = [];
        while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
          tds.push(tdMatch[1].trim());
        }
        if (tds.length > 0) {
          rows.push(tds);
        }
      }

      if (rows.length > 0) {
        tableData = {
          headers: headers.length > 0 ? headers : rows[0],
          rows: headers.length > 0 ? rows : rows.slice(1)
        };
        
        // 원본 질문 텍스트에서 표 태그 부분 제거
        const tableStartIdx = questionText.toLowerCase().search(/<\s*table/i);
        const tableEndIdx = questionText.toLowerCase().search(/<\s*\/+\s*table/i);
        if (tableStartIdx !== -1 && tableEndIdx !== -1) {
          const endBracketIdx = questionText.indexOf('>', tableEndIdx);
          if (endBracketIdx !== -1) {
            const originalTableHtml = questionText.substring(tableStartIdx, endBracketIdx + 1);
            questionText = questionText.replace(originalTableHtml, '').trim();
          }
        }
      }
    }
  }

  // Markdown table fallback
  if (!tableData) {
    const mdParsed = parseMarkdownTable(questionText);
    if (mdParsed) {
      tableData = mdParsed.tableData;
      questionText = questionText.replace(mdParsed.originalTableText, '').trim();
    }
  }

  return { questionText, tableData };
}


// ── 공학용 계산기 컴포넌트 ──────────────────
function parseFormula(str) {
  let i = 0;
  
  function parseExpr() {
    let nodes = [];
    while (i < str.length) {
      if (str.startsWith('frac(', i)) {
        let fracStart = i;
        i += 5; // skip 'frac('
        
        let level = 0;
        let commaIdx = -1;
        let numStart = i;
        
        while (i < str.length) {
          if (str[i] === '(') level++;
          else if (str[i] === ')') level--;
          else if (str[i] === ',' && level === 0) {
            commaIdx = i;
            break;
          }
          i++;
        }
        
        if (commaIdx === -1) {
          nodes.push({ type: 'text', content: 'frac(', startIdx: fracStart, endIdx: numStart });
          i = numStart;
          continue;
        }
        
        i++; // skip ','
        let denStart = i;
        
        level = 0;
        let closeIdx = -1;
        while (i < str.length) {
          if (str[i] === '(') level++;
          else if (str[i] === ')') {
            if (level === 0) {
              closeIdx = i;
              break;
            } else {
              level--;
            }
          }
          i++;
        }
        
        if (closeIdx === -1) {
          nodes.push({ type: 'text', content: str.substring(fracStart, denStart), startIdx: fracStart, endIdx: denStart });
          i = denStart;
          continue;
        }
        
        const numStr = str.substring(numStart, commaIdx);
        const denStr = str.substring(denStart, closeIdx);
        
        nodes.push({
          type: 'fraction',
          numStr: numStr,
          denStr: denStr,
          numStartIdx: numStart,
          numEndIdx: commaIdx,
          denStartIdx: denStart,
          denEndIdx: closeIdx,
          startIdx: fracStart,
          endIdx: closeIdx + 1
        });
        
        i = closeIdx + 1;
      } else if (str.startsWith('^(', i)) {
        let expStart = i;
        i += 2; // skip '^('
        let contentStart = i;
        let level = 0;
        let closeIdx = -1;
        while (i < str.length) {
          if (str[i] === '(') level++;
          else if (str[i] === ')') {
            if (level === 0) {
              closeIdx = i;
              break;
            } else {
              level--;
            }
          }
          i++;
        }
        
        if (closeIdx === -1) {
          nodes.push({ type: 'text', content: '^(', startIdx: expStart, endIdx: contentStart });
          i = contentStart;
          continue;
        }
        
        const expStr = str.substring(contentStart, closeIdx);
        nodes.push({
          type: 'exponent',
          expStr: expStr,
          expStartIdx: contentStart,
          expEndIdx: closeIdx,
          startIdx: expStart,
          endIdx: closeIdx + 1
        });
        
        i = closeIdx + 1;
      } else if (str.startsWith('sqrt(', i)) {
        let sqrtStart = i;
        i += 5; // skip 'sqrt('
        let contentStart = i;
        let level = 0;
        let closeIdx = -1;
        while (i < str.length) {
          if (str[i] === '(') level++;
          else if (str[i] === ')') {
            if (level === 0) {
              closeIdx = i;
              break;
            } else {
              level--;
            }
          }
          i++;
        }
        
        if (closeIdx === -1) {
          nodes.push({ type: 'text', content: 'sqrt(', startIdx: sqrtStart, endIdx: contentStart });
          i = contentStart;
          continue;
        }
        
        const sqrtStr = str.substring(contentStart, closeIdx);
        nodes.push({
          type: 'sqrt',
          sqrtStr: sqrtStr,
          sqrtStartIdx: contentStart,
          sqrtEndIdx: closeIdx,
          startIdx: sqrtStart,
          endIdx: closeIdx + 1
        });
        
        i = closeIdx + 1;
      } else {
        let textStart = i;
        while (i < str.length && !str.startsWith('frac(', i) && !str.startsWith('^(', i) && !str.startsWith('sqrt(', i)) {
          i++;
        }
        nodes.push({
          type: 'text',
          content: str.substring(textStart, i),
          startIdx: textStart,
          endIdx: i
        });
      }
    }
    return nodes;
  }
  
  return parseExpr();
}

function ScientificCalculator() {
  const [calcInput, setCalcInput] = useState(() => localStorage.getItem('anti_calc_input') || '');
  const [calcResult, setCalcResult] = useState(() => localStorage.getItem('anti_calc_result') || '');
  const [calcAngleMode, setCalcAngleMode] = useState(() => localStorage.getItem('anti_calc_angle_mode') || 'deg'); // deg / rad
  const [lastAns, setLastAns] = useState(() => localStorage.getItem('anti_calc_last_ans') || '');
  const [shiftActive, setShiftActive] = useState(false);
  const [alphaActive, setAlphaActive] = useState(false);
  const [hypActive, setHypActive] = useState(false);
  const [isOn, setIsOn] = useState(true);
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('anti_calc_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [historyIndex, setHistoryIndex] = useState(() => {
    const saved = localStorage.getItem('anti_calc_history_index');
    return saved !== null ? parseInt(saved, 10) : -1;
  });
  const [variables, setVariables] = useState(() => {
    const saved = localStorage.getItem('anti_calc_variables');
    return saved ? JSON.parse(saved) : { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0, Y: 0, M: 0 };
  });
  const [isStoring, setIsStoring] = useState(false);
  const [isRecalling, setIsRecalling] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [displaySdMode, setDisplaySdMode] = useState(() => localStorage.getItem('anti_calc_sd_mode') || 'decimal'); // both, decimal, fraction
  const [cursorPosition, setCursorPosition] = useState(() => {
    const saved = localStorage.getItem('anti_calc_cursor_pos');
    return saved !== null ? parseInt(saved, 10) : 0;
  });

  useEffect(() => {
    localStorage.setItem('anti_calc_input', calcInput);
  }, [calcInput]);

  useEffect(() => {
    localStorage.setItem('anti_calc_result', calcResult);
  }, [calcResult]);

  useEffect(() => {
    localStorage.setItem('anti_calc_angle_mode', calcAngleMode);
  }, [calcAngleMode]);

  useEffect(() => {
    localStorage.setItem('anti_calc_last_ans', lastAns);
  }, [lastAns]);

  useEffect(() => {
    localStorage.setItem('anti_calc_variables', JSON.stringify(variables));
  }, [variables]);

  useEffect(() => {
    localStorage.setItem('anti_calc_sd_mode', displaySdMode);
  }, [displaySdMode]);

  useEffect(() => {
    localStorage.setItem('anti_calc_cursor_pos', cursorPosition.toString());
  }, [cursorPosition]);

  useEffect(() => {
    localStorage.setItem('anti_calc_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('anti_calc_history_index', historyIndex.toString());
  }, [historyIndex]);

  const inputRef = useRef(null);

  const appendToInput = (val) => {
    if (!isOn) return;
    insertAtCursor(val);
  };

  const isOperatorString = (val) => {
    const operators = ['+', '-', '×', '÷', '^', '*', '/', '%', '!', '°'];
    if (!val) return false;
    if (val === 'Ans') return false;
    return operators.some(op => val.startsWith(op));
  };

  const insertAtCursor = (val) => {
    let start = cursorPosition;
    let text = calcInput;
    
    if (calcResult) {
      setCalcResult('');
      if (isOperatorString(val)) {
        text = 'Ans';
        start = 3;
      } else {
        text = '';
        start = 0;
      }
      setHistoryIndex(-1);
    } else {
      setStatusMessage('');
    }
    
    const before = text.substring(0, start);
    const after = text.substring(start);
    const newText = before + val + after;
    setCalcInput(newText);
    
    let newCursorPos = start + val.length;
    if (val === 'frac(,)') {
      newCursorPos = start + 5;
    } else if (val === 'sqrt()') {
      newCursorPos = start + 5;
    } else if (val === '^()') {
      newCursorPos = start + 2;
    } else if (val === '10^()') {
      newCursorPos = start + 4;
    } else if (val === 'e^()') {
      newCursorPos = start + 3;
    } else if (val === '*10^()') {
      newCursorPos = start + 5;
    } else if (val === '^(1/)') {
      newCursorPos = start + 4;
    }
    setCursorPosition(newCursorPos);
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  };

  const handleClear = () => {
    setCalcInput('');
    setCalcResult('');
    setStatusMessage('');
    setShiftActive(false);
    setAlphaActive(false);
    setHypActive(false);
    setIsStoring(false);
    setIsRecalling(false);
    setCursorPosition(0);
  };

  const getFractions = (currentStr) => {
    const fracs = [];
    let i = 0;
    while (i < currentStr.length) {
      if (currentStr.startsWith('frac(', i)) {
        let fracStart = i;
        i += 5;
        let level = 0;
        let commaIdx = -1;
        let numStart = i;
        while (i < currentStr.length) {
          if (currentStr[i] === '(') level++;
          else if (currentStr[i] === ')') level--;
          else if (currentStr[i] === ',' && level === 0) {
            commaIdx = i;
            break;
          }
          i++;
        }
        if (commaIdx === -1) continue;
        i++;
        let denStart = i;
        level = 0;
        let closeIdx = -1;
        while (i < currentStr.length) {
          if (currentStr[i] === '(') level++;
          else if (currentStr[i] === ')') {
            if (level === 0) {
              closeIdx = i;
              break;
            } else {
              level--;
            }
          }
          i++;
        }
        if (closeIdx === -1) continue;
        
        fracs.push({
          startIdx: fracStart,
          numStartIdx: numStart,
          numEndIdx: commaIdx,
          denStartIdx: denStart,
          denEndIdx: closeIdx,
          endIdx: closeIdx + 1
        });
        i = closeIdx + 1;
      } else {
        i++;
      }
    }
    return fracs;
  };

  const getExponents = (currentStr) => {
    const exps = [];
    let i = 0;
    while (i < currentStr.length) {
      if (currentStr.startsWith('^(', i)) {
        let expStart = i;
        i += 2;
        let level = 0;
        let closeIdx = -1;
        let contentStart = i;
        while (i < currentStr.length) {
          if (currentStr[i] === '(') level++;
          else if (currentStr[i] === ')') {
            if (level === 0) {
              closeIdx = i;
              break;
            } else {
              level--;
            }
          }
          i++;
        }
        if (closeIdx === -1) {
          i = contentStart;
          continue;
        }
        exps.push({
          startIdx: expStart,
          expStartIdx: contentStart,
          expEndIdx: closeIdx,
          endIdx: closeIdx + 1
        });
        i = closeIdx + 1;
      } else {
        i++;
      }
    }
    return exps;
  };

  const getSqrts = (currentStr) => {
    const sqrts = [];
    let i = 0;
    while (i < currentStr.length) {
      if (currentStr.startsWith('sqrt(', i)) {
        let sqrtStart = i;
        i += 5;
        let level = 0;
        let closeIdx = -1;
        let contentStart = i;
        while (i < currentStr.length) {
          if (currentStr[i] === '(') level++;
          else if (currentStr[i] === ')') {
            if (level === 0) {
              closeIdx = i;
              break;
            } else {
              level--;
            }
          }
          i++;
        }
        if (closeIdx === -1) {
          i = contentStart;
          continue;
        }
        sqrts.push({
          startIdx: sqrtStart,
          sqrtStartIdx: contentStart,
          sqrtEndIdx: closeIdx,
          endIdx: closeIdx + 1
        });
        i = closeIdx + 1;
      } else {
        i++;
      }
    }
    return sqrts;
  };

  const adjustCursorOnMove = (currentStr, newPos, direction) => {
    const fracs = getFractions(currentStr);
    for (const f of fracs) {
      if (newPos > f.startIdx && newPos < f.numStartIdx) {
        if (direction === 'right') return f.numStartIdx;
        if (direction === 'left') return f.startIdx;
      }
      if (newPos > f.numEndIdx && newPos < f.denStartIdx) {
        if (direction === 'right') return f.denStartIdx;
        if (direction === 'left') return f.numEndIdx;
      }
      if (newPos > f.denEndIdx && newPos < f.endIdx) {
        if (direction === 'right') return f.endIdx;
        if (direction === 'left') return f.denEndIdx;
      }
    }
    const exps = getExponents(currentStr);
    for (const e of exps) {
      if (newPos > e.startIdx && newPos < e.expStartIdx) {
        if (direction === 'right') return e.expStartIdx;
        if (direction === 'left') return e.startIdx;
      }
      if (newPos > e.expEndIdx && newPos < e.endIdx) {
        if (direction === 'right') return e.endIdx;
        if (direction === 'left') return e.expEndIdx;
      }
    }
    const sqrts = getSqrts(currentStr);
    for (const s of sqrts) {
      if (newPos > s.startIdx && newPos < s.sqrtStartIdx) {
        if (direction === 'right') return s.sqrtStartIdx;
        if (direction === 'left') return s.startIdx;
      }
      if (newPos > s.sqrtEndIdx && newPos < s.endIdx) {
        if (direction === 'right') return s.endIdx;
        if (direction === 'left') return s.sqrtEndIdx;
      }
    }
    return newPos;
  };

  const handleBackspace = () => {
    if (!isOn) return;
    if (calcResult) {
      setCalcResult('');
      setCursorPosition(calcInput.length);
      return;
    }
    setStatusMessage('');

    // Check if there is active mouse drag selection in the LCD
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const getElementIndex = (node) => {
        let curr = node;
        while (curr && curr !== document.body) {
          if (curr.nodeType === Node.ELEMENT_NODE && curr.hasAttribute('data-index')) {
            return parseInt(curr.getAttribute('data-index'), 10);
          }
          curr = curr.parentNode;
        }
        return null;
      };
      const startIdx = getElementIndex(range.startContainer);
      const endIdx = getElementIndex(range.endContainer);
      if (startIdx !== null && endIdx !== null) {
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx) + 1;
        const before = calcInput.substring(0, minIdx);
        const after = calcInput.substring(maxIdx);
        setCalcInput(before + after);
        setCursorPosition(minIdx);
        selection.removeAllRanges();
        return;
      }
    }
    
    if (cursorPosition > 0) {
      const cur = cursorPosition;
      
      const fracs = getFractions(calcInput);
      let deletedFraction = false;
      for (const f of fracs) {
        const isSyntax = 
          (cur - 1 >= f.startIdx && cur - 1 < f.numStartIdx) || // "frac("
          (cur - 1 === f.numEndIdx) || // ","
          (cur - 1 === f.denEndIdx); // ")"
          
        if (isSyntax) {
          const before = calcInput.substring(0, f.startIdx);
          const after = calcInput.substring(f.endIdx);
          setCalcInput(before + after);
          setCursorPosition(f.startIdx);
          deletedFraction = true;
          break;
        }
      }
      if (deletedFraction) return;

      const exps = getExponents(calcInput);
      let deletedExponent = false;
      for (const e of exps) {
        const isSyntax =
          (cur - 1 >= e.startIdx && cur - 1 < e.expStartIdx) || // "^("
          (cur - 1 === e.expEndIdx); // ")"
          
        if (isSyntax) {
          const before = calcInput.substring(0, e.startIdx);
          const after = calcInput.substring(e.endIdx);
          setCalcInput(before + after);
          setCursorPosition(e.startIdx);
          deletedExponent = true;
          break;
        }
      }
      if (deletedExponent) return;

      const sqrts = getSqrts(calcInput);
      let deletedSqrt = false;
      for (const s of sqrts) {
        const isSyntax =
          (cur - 1 >= s.startIdx && cur - 1 < s.sqrtStartIdx) || // "sqrt("
          (cur - 1 === s.sqrtEndIdx); // ")"
          
        if (isSyntax) {
          const before = calcInput.substring(0, s.startIdx);
          const after = calcInput.substring(s.endIdx);
          setCalcInput(before + after);
          setCursorPosition(s.startIdx);
          deletedSqrt = true;
          break;
        }
      }
      if (deletedSqrt) return;
      
      const before = calcInput.substring(0, cur - 1);
      const after = calcInput.substring(cur);
      setCalcInput(before + after);
      setCursorPosition(cur - 1);
    }
  };

  const moveCursor = (direction) => {
    if (!isOn || !inputRef.current) return;
    let newPos = cursorPosition;
    if (direction === 'left') {
      newPos = Math.max(0, cursorPosition - 1);
    } else if (direction === 'right') {
      newPos = Math.min(calcInput.length, cursorPosition + 1);
    }
    newPos = adjustCursorOnMove(calcInput, newPos, direction);
    setCursorPosition(newPos);
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  const handleDpad = (direction) => {
    if (!isOn) return;
    if (direction === 'up' || direction === 'down') {
      const fracs = getFractions(calcInput);
      for (const f of fracs) {
        if (direction === 'down' && cursorPosition >= f.numStartIdx && cursorPosition <= f.numEndIdx) {
          setCursorPosition(f.denStartIdx);
          return;
        }
        if (direction === 'up' && cursorPosition >= f.denStartIdx && cursorPosition <= f.denEndIdx) {
          setCursorPosition(f.numEndIdx);
          return;
        }
      }
      
      const exps = getExponents(calcInput);
      for (const e of exps) {
        if (direction === 'down' && cursorPosition >= e.expStartIdx && cursorPosition <= e.expEndIdx) {
          setCursorPosition(e.endIdx);
          return;
        }
        if (direction === 'up' && cursorPosition === e.startIdx) {
          setCursorPosition(e.expStartIdx);
          return;
        }
      }
      
      if (direction === 'up') {
        if (history.length > 0) {
          const nextIndex = Math.min(historyIndex + 1, history.length - 1);
          setHistoryIndex(nextIndex);
          const histVal = history[history.length - 1 - nextIndex];
          setCalcInput(histVal);
          setCursorPosition(histVal.length);
          setCalcResult('');
        }
      } else if (direction === 'down') {
        if (historyIndex > 0) {
          const nextIndex = historyIndex - 1;
          setHistoryIndex(nextIndex);
          const histVal = history[history.length - 1 - nextIndex];
          setCalcInput(histVal);
          setCursorPosition(histVal.length);
          setCalcResult('');
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setCalcInput('');
          setCursorPosition(0);
          setCalcResult('');
        }
      }
    } else if (direction === 'left' || direction === 'right') {
      if (calcResult) {
        setCalcResult('');
        const pos = direction === 'left' ? calcInput.length : 0;
        setCursorPosition(pos);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.setSelectionRange(pos, pos);
          }
        }, 10);
        return;
      }
      moveCursor(direction);
    }
  };

  function decimalToFraction(val, maxDenominator = 100000) {
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return null;
    let x = val;
    let sign = Math.sign(x);
    x = Math.abs(x);
    
    if (x < 1e-9) return { numerator: 0, denominator: 1 };
    if (Number.isInteger(x)) return { numerator: sign * x, denominator: 1 };
    
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
    let b = Math.floor(x);
    let h = b;
    let k = 1;
    
    let limit = 0;
    while (x - b > 1e-11 && limit < 15) {
      let aux = h1;
      h1 = b * h1 + h2;
      h2 = aux;
      
      aux = k1;
      k1 = b * k1 + k2;
      k2 = aux;
      
      x = 1 / (x - b);
      b = Math.floor(x);
      
      let nextH = b * h1 + h2;
      let nextK = b * k1 + k2;
      if (nextK > maxDenominator) break;
      h = nextH;
      k = nextK;
      limit++;
    }
    
    const approx = h / k;
    if (Math.abs(approx - Math.abs(val)) < 1e-6) {
      return { numerator: sign * h, denominator: k };
    }
    return null;
  }

  const resolveFractions = (expr) => {
    let processed = expr;
    while (processed.includes('frac(')) {
      const idx = processed.indexOf('frac(');
      let parenCount = 1;
      let endIdx = -1;
      for (let i = idx + 5; i < processed.length; i++) {
        if (processed[i] === '(') parenCount++;
        else if (processed[i] === ')') parenCount--;
        if (parenCount === 0) {
          endIdx = i;
          break;
        }
      }
      if (endIdx === -1) break;
      
      const content = processed.substring(idx + 5, endIdx);
      const args = [];
      let currentArg = '';
      let level = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '(') level++;
        else if (char === ')') level--;
        
        if (char === ',' && level === 0) {
          args.push(currentArg);
          currentArg = '';
        } else {
          currentArg += char;
        }
      }
      args.push(currentArg);
      
      if (args.length === 2) {
        let resolvedNum = resolveFractions(args[0]);
        let resolvedDen = resolveFractions(args[1]);
        if (!resolvedNum.trim()) resolvedNum = '0';
        if (!resolvedDen.trim()) resolvedDen = '1';
        const replacement = `((${resolvedNum})/(${resolvedDen}))`;
        processed = processed.substring(0, idx) + replacement + processed.substring(endIdx + 1);
      } else {
        processed = processed.substring(0, idx) + 'Error' + processed.substring(endIdx + 1);
      }
    }
    return processed;
  };

  const parseIntegrationAndDerivatives = (expr) => {
    let processed = expr;
    
    // Process ∫(
    while (processed.includes('∫(')) {
      const idx = processed.indexOf('∫(');
      let parenCount = 1;
      let endIdx = -1;
      for (let i = idx + 2; i < processed.length; i++) {
        if (processed[i] === '(') parenCount++;
        else if (processed[i] === ')') parenCount--;
        if (parenCount === 0) {
          endIdx = i;
          break;
        }
      }
      if (endIdx === -1) break;
      
      const content = processed.substring(idx + 2, endIdx);
      const args = [];
      let currentArg = '';
      let level = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '(') level++;
        else if (char === ')') level--;
        
        if (char === ',' && level === 0) {
          args.push(currentArg);
          currentArg = '';
        } else {
          currentArg += char;
        }
      }
      args.push(currentArg);
      
      if (args.length === 3) {
        const funcStr = args[0];
        const aVal = evaluateExpr(args[1], calcAngleMode, true);
        const bVal = evaluateExpr(args[2], calcAngleMode, true);
        
        if (aVal === 'Error' || bVal === 'Error') {
          return 'Error';
        }
        
        const a = parseFloat(aVal);
        const b = parseFloat(bVal);
        
        const N = 500;
        const h = (b - a) / N;
        let sum = 0;
        let hasError = false;
        
        const f = (xVal) => {
          let subbed = funcStr.replace(/\bX\b/g, `(${xVal})`);
          const res = evaluateExpr(subbed, calcAngleMode, true);
          if (res === 'Error') {
            hasError = true;
            return 0;
          }
          return parseFloat(res);
        };
        
        sum += 0.5 * (f(a) + f(b));
        for (let i = 1; i < N; i++) {
          sum += f(a + i * h);
          if (hasError) break;
        }
        
        if (hasError) {
          processed = processed.substring(0, idx) + 'Error' + processed.substring(endIdx + 1);
        } else {
          const finalVal = sum * h;
          processed = processed.substring(0, idx) + finalVal.toString() + processed.substring(endIdx + 1);
        }
      } else {
        processed = processed.substring(0, idx) + 'Error' + processed.substring(endIdx + 1);
      }
    }
    
    // Process d/dx(
    while (processed.includes('d/dx(')) {
      const idx = processed.indexOf('d/dx(');
      let parenCount = 1;
      let endIdx = -1;
      for (let i = idx + 5; i < processed.length; i++) {
        if (processed[i] === '(') parenCount++;
        else if (processed[i] === ')') parenCount--;
        if (parenCount === 0) {
          endIdx = i;
          break;
        }
      }
      if (endIdx === -1) break;
      
      const content = processed.substring(idx + 5, endIdx);
      const args = [];
      let currentArg = '';
      let level = 0;
      for (let i = 0; i < content.length; i++) {
        const textChar = content[i];
        if (textChar === '(') level++;
        else if (textChar === ')') level--;
        
        if (textChar === ',' && level === 0) {
          args.push(currentArg);
          currentArg = '';
        } else {
          currentArg += textChar;
        }
      }
      args.push(currentArg);
      
      if (args.length === 2) {
        const funcStr = args[0];
        const x0Val = evaluateExpr(args[1], calcAngleMode, true);
        if (x0Val === 'Error') return 'Error';
        
        const x0 = parseFloat(x0Val);
        const h = 1e-5;
        let hasError = false;
        
        const f = (xVal) => {
          let subbed = funcStr.replace(/\bX\b/g, `(${xVal})`);
          const res = evaluateExpr(subbed, calcAngleMode, true);
          if (res === 'Error') {
            hasError = true;
            return 0;
          }
          return parseFloat(res);
        };
        
        const df = (f(x0 + h) - f(x0 - h)) / (2 * h);
        if (hasError) {
          processed = processed.substring(0, idx) + 'Error' + processed.substring(endIdx + 1);
        } else {
          processed = processed.substring(0, idx) + df.toString() + processed.substring(endIdx + 1);
        }
      } else {
        processed = processed.substring(0, idx) + 'Error' + processed.substring(endIdx + 1);
      }
    }
    
    // Process log(value, base) or log(value)
    while (processed.includes('log(')) {
      const idx = processed.indexOf('log(');
      let parenCount = 1;
      let endIdx = -1;
      for (let i = idx + 4; i < processed.length; i++) {
        if (processed[i] === '(') parenCount++;
        else if (processed[i] === ')') parenCount--;
        if (parenCount === 0) {
          endIdx = i;
          break;
        }
      }
      if (endIdx === -1) break;
      
      const content = processed.substring(idx + 4, endIdx);
      const args = [];
      let currentArg = '';
      let level = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '(') level++;
        else if (char === ')') level--;
        
        if (char === ',' && level === 0) {
          args.push(currentArg);
          currentArg = '';
        } else {
          currentArg += char;
        }
      }
      args.push(currentArg);
      
      if (args.length === 2) {
        const valStr = evaluateExpr(args[0], calcAngleMode, true);
        const baseStr = evaluateExpr(args[1], calcAngleMode, true);
        if (valStr === 'Error' || baseStr === 'Error') return 'Error';
        const val = parseFloat(valStr);
        const base = parseFloat(baseStr);
        const logVal = Math.log(val) / Math.log(base);
        processed = processed.substring(0, idx) + logVal.toString() + processed.substring(endIdx + 1);
      } else {
        processed = processed.substring(0, idx) + 'Math.log10(' + content + ')' + processed.substring(endIdx + 1);
      }
    }

    return processed;
  };

  const solveEquation = (left, right, varName, angleMode) => {
    const evalWithVar = (val) => {
      const originalVal = variables[varName];
      variables[varName] = val;
      let res = NaN;
      try {
        const leftVal = parseFloat(evaluateExpr(left, angleMode, true));
        const rightVal = parseFloat(evaluateExpr(right, angleMode, true));
        res = leftVal - rightVal;
      } catch (e) {
        // ignore
      }
      variables[varName] = originalVal;
      return res;
    };

    const roots = [];
    const addRoot = (r) => {
      if (isNaN(r) || !isFinite(r)) return;
      if (roots.some(existing => Math.abs(existing - r) < 0.01)) return;
      roots.push(r);
    };

    // 1. Grid search for sign changes
    const grid = [-100, -50, -20, -10, -5, -2, -1, -0.5, 0, 0.5, 1, 2, 5, 10, 20, 50, 100];
    const evals = grid.map(x => ({ x, y: evalWithVar(x) }));

    for (let i = 0; i < evals.length - 1; i++) {
      const p1 = evals[i];
      const p2 = evals[i+1];
      if (!isNaN(p1.y) && !isNaN(p2.y) && isFinite(p1.y) && isFinite(p2.y)) {
        if (p1.y * p2.y <= 0) {
          const r = runSecant(p1.x, p2.x, evalWithVar);
          if (r !== null) addRoot(r);
        }
      }
    }

    // 2. Search pairs for double roots or local minima close to 0
    const startPairs = [
      [-1.0, 0.0],
      [0.0, 1.0],
      [-10.0, -9.0],
      [9.0, 10.0]
    ];
    for (const pair of startPairs) {
      const r = runSecant(pair[0], pair[1], evalWithVar);
      if (r !== null) addRoot(r);
    }

    if (roots.length === 0) return 'Error';

    roots.sort((a, b) => a - b);
    
    if (roots.length === 1) {
      return roots[0].toString();
    } else {
      return roots.map(r => r.toString()).join('; ');
    }
  };

  const runSecant = (x0, x1, evalWithVar) => {
    let y0 = evalWithVar(x0);
    let y1 = evalWithVar(x1);
    if (isNaN(y0) || isNaN(y1)) return null;

    const tol = 1e-7;
    const maxIter = 60;
    for (let iter = 0; iter < maxIter; iter++) {
      if (Math.abs(y1) < tol) {
        let val = parseFloat(x1.toFixed(6));
        if (Math.abs(val - Math.round(val)) < 1e-3) val = Math.round(val);
        return val;
      }
      if (Math.abs(y1 - y0) < 1e-12) {
        break;
      }
      const x2 = x1 - y1 * (x1 - x0) / (y1 - y0);
      if (isNaN(x2) || !isFinite(x2)) {
        break;
      }
      x0 = x1;
      y0 = y1;
      x1 = x2;
      y1 = evalWithVar(x1);
    }
    if (Math.abs(y1) < 1e-3) {
      let val = parseFloat(x1.toFixed(6));
      if (Math.abs(val - Math.round(val)) < 1e-3) val = Math.round(val);
      return val;
    }
    return null;
  };

  const evaluateExpr = (expr, angleMode, isInternal = false) => {
    try {
      if (!expr.trim()) return '';
      
      let processedExpr = expr;
      if (!isInternal && processedExpr.trim().startsWith('=')) {
        processedExpr = processedExpr.trim().substring(1);
      }
      
      if (!processedExpr.trim()) return '';
      
      if (!isInternal && processedExpr.includes('=')) {
        const eqParts = processedExpr.split('=');
        if (eqParts.length !== 2) return 'Error';
        
        let varName = null;
        const possibleVars = ['X', 'Y', 'A', 'B', 'C', 'D', 'E', 'F', 'M'];
        for (const v of possibleVars) {
          if (processedExpr.includes(v)) {
            varName = v;
            break;
          }
        }
        if (!varName) return 'Error';
        
        const solvedVal = solveEquation(eqParts[0], eqParts[1], varName, angleMode);
        if (solvedVal === 'Error') return 'Error';
        
        // Store only the first numerical root in variables memory to prevent future syntax errors
        let numToStore = 0;
        if (solvedVal.includes(';')) {
          numToStore = parseFloat(solvedVal.split(';')[0]);
        } else {
          numToStore = parseFloat(solvedVal);
        }
        if (isNaN(numToStore)) numToStore = 0;
        
        setVariables(prev => ({ ...prev, [varName]: numToStore }));
        return solvedVal.toString();
      }
      
      let preProcessed = resolveFractions(processedExpr);
      if (preProcessed.includes('Error')) return 'Error';
      
      preProcessed = preProcessed.replace(/\^\(\s*\)/g, '^(1)');

      // Implicit multiplication replacements
      preProcessed = preProcessed.replace(/(\d+(\.\d+)?)\s*([a-zA-Z가-힣π_∛\(]|sin⁻¹|cos⁻¹|tan⁻¹)/g, '$1*$3');
      preProcessed = preProcessed.replace(/([XYABCDEFMπe])\s*(\d+(\.\d+)?)/g, '$1*$2');
      preProcessed = preProcessed.replace(/([XYABCDEFMπe])\s*([XYABCDEFMπe\(])/g, '$1*$2');
      preProcessed = preProcessed.replace(/\)\s*([\dXYABCDEFMπe\([a-zA-Z가-힣_∛]|sin⁻¹|cos⁻¹|tan⁻¹)/g, ')*$1');
      
      // Percentage conversion
      preProcessed = preProcessed.replace(/([XYABCDEFMπe\d\.\)]+)%/g, '($1*0.01)');
      
      if (!isInternal) {
        preProcessed = parseIntegrationAndDerivatives(preProcessed);
        if (preProcessed === 'Error') return 'Error';
      }
      
      const placeholders = {
        'sin⁻¹': '__ASIN__',
        'cos⁻¹': '__ACOS__',
        'tan⁻¹': '__ATAN__',
        'sin': '__SIN__',
        'cos': '__COS__',
        'tan': '__TAN__',
        'asin': '__ASIN__',
        'acos': '__ACOS__',
        'atan': '__ATAN__',
        'sinh': '__SINH__',
        'cosh': '__COSH__',
        'tanh': '__TANH__',
        'asinh': '__ASINH__',
        'acosh': '__ACOSH__',
        'atanh': '__ATANH__',
        'ln': '__LN__',
        'exp': '__EXP__',
        'sqrt': '__SQRT__',
        'cbrt': '__CBRT__',
        'Abs': '__ABS__'
      };

      let tempExpr = preProcessed;
      Object.keys(placeholders).forEach(key => {
        tempExpr = tempExpr.replaceAll(key, placeholders[key]);
      });

      // Replace variables (A, B, C, D, E, F, X, Y, M)
      Object.keys(variables).forEach(v => {
        const val = variables[v] !== undefined ? variables[v] : 0;
        tempExpr = tempExpr.replace(new RegExp(`\\b${v}\\b`, 'g'), `(${val})`);
      });

      Object.keys(placeholders).forEach(key => {
        tempExpr = tempExpr.replaceAll(placeholders[key], key);
      });
      
      preProcessed = tempExpr;
      
      preProcessed = preProcessed
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/π/g, 'Math.PI')
        .replace(/\be\b/g, 'Math.E')
        .replace(/sin⁻¹\(/g, 'asin(')
        .replace(/cos⁻¹\(/g, 'acos(')
        .replace(/tan⁻¹\(/g, 'atan(')
        .replace(/∛\(/g, 'cbrt(')
        .replace(/e\^\(/g, 'exp(')
        .replace(/10\^\(/g, '10^(')
        .replace(/Ans/g, `(${lastAns || '0'})`);

      if (angleMode === 'deg') {
        preProcessed = preProcessed
          .replace(/sin\(/g, 'Math.sin((Math.PI/180)*')
          .replace(/cos\(/g, 'Math.cos((Math.PI/180)*')
          .replace(/tan\(/g, 'Math.tan((Math.PI/180)*')
          .replace(/asin\(/g, '((180/Math.PI)*Math.asin(')
          .replace(/acos\(/g, '((180/Math.PI)*Math.acos(')
          .replace(/atan\(/g, '((180/Math.PI)*Math.atan(');
      } else {
        preProcessed = preProcessed
          .replace(/sin\(/g, 'Math.sin(')
          .replace(/cos\(/g, 'Math.cos(')
          .replace(/tan\(/g, 'Math.tan(')
          .replace(/asin\(/g, 'Math.asin(')
          .replace(/acos\(/g, 'Math.acos(')
          .replace(/atan\(/g, 'Math.atan(');
      }

      preProcessed = preProcessed
        .replace(/sinh\(/g, 'Math.sinh(')
        .replace(/cosh\(/g, 'Math.cosh(')
        .replace(/tanh\(/g, 'Math.tanh(')
        .replace(/asinh\(/g, 'Math.asinh(')
        .replace(/acosh\(/g, 'Math.acosh(')
        .replace(/atanh\(/g, 'Math.atanh(');

      preProcessed = preProcessed
        .replace(/ln\(/g, 'Math.log(')
        .replace(/sqrt\(/g, 'Math.sqrt(')
        .replace(/cbrt\(/g, 'Math.cbrt(')
        .replace(/exp\(/g, 'Math.exp(')
        .replace(/Abs\(/g, 'Math.abs(')
        .replace(/\^/g, '**');

      const fact = (n) => {
        if (n < 0) return NaN;
        if (n === 0 || n === 1) return 1;
        let result = 1;
        for (let i = 2; i <= n; i++) result *= i;
        return result;
      };
      
      let factProcessed = preProcessed;
      factProcessed = factProcessed.replace(/(\d+(\.\d+)?|\bMath\.PI\b|\bMath\.E\b|\bAns\b)\!/g, 'fact($1)');
      
      const result = new Function('fact', `return (${factProcessed})`)(fact);
      if (typeof result === 'number' && !isNaN(result)) {
        if (!isFinite(result)) return 'Infinity';
        if (Number.isInteger(result)) return result.toString();
        return parseFloat(result.toFixed(9)).toString();
      }
      return 'Error';
    } catch (err) {
      return 'Error';
    }
  };

  const previewResult = useMemo(() => {
    if (!calcInput.trim()) return '';
    try {
      const res = evaluateExpr(calcInput, calcAngleMode);
      if (res && res !== 'Error') {
        return res;
      }
    } catch (e) {}
    return '';
  }, [calcInput, calcAngleMode, variables, lastAns]);

  const handleEqual = () => {
    if (!isOn || !calcInput.trim()) return;
    const res = evaluateExpr(calcInput, calcAngleMode);
    setCalcResult(res);
    if (res !== 'Error') {
      setLastAns(res);
      setHistory(prev => {
        const updated = [...prev, calcInput];
        if (updated.length > 20) {
          updated.shift();
        }
        return updated;
      });
      setHistoryIndex(-1);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleEqual();
    } else if (e.key === '/') {
      e.preventDefault();
      handleFracKey();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleDpad('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDpad('down');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handleDpad('left');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleDpad('right');
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      if (calcResult) {
        e.preventDefault();
        setCalcResult('');
        setCursorPosition(calcInput.length);
        return;
      }
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const getElementIndex = (node) => {
          let curr = node;
          while (curr && curr !== document.body) {
            if (curr.nodeType === Node.ELEMENT_NODE && curr.hasAttribute('data-index')) {
              return parseInt(curr.getAttribute('data-index'), 10);
            }
            curr = curr.parentNode;
          }
          return null;
        };
        const startIdx = getElementIndex(range.startContainer);
        const endIdx = getElementIndex(range.endContainer);
        if (startIdx !== null && endIdx !== null) {
          e.preventDefault();
          const minIdx = Math.min(startIdx, endIdx);
          const maxIdx = Math.max(startIdx, endIdx) + 1;
          const before = calcInput.substring(0, minIdx);
          const after = calcInput.substring(maxIdx);
          setCalcInput(before + after);
          setCursorPosition(minIdx);
          selection.removeAllRanges();
        }
      }
    }
  };

  const handleFracKey = () => {
    if (!isOn) return;
    setCalcResult('');
    setStatusMessage('');
    
    let start = cursorPosition;
    let text = calcInput;
    let operandStart = start;
    
    // Scan backwards to find digits, decimals, variables, pi, or e that form the numerator
    while (operandStart > 0) {
      const char = text[operandStart - 1];
      if (/[\d.XYABCDEFMπe]/.test(char)) {
        operandStart--;
      } else {
        break;
      }
    }
    
    const before = text.substring(0, operandStart);
    const numStr = text.substring(operandStart, start);
    const after = text.substring(start);
    const val = `frac(${numStr},)`;
    
    setCalcInput(before + val + after);
    const newPos = numStr === '' ? operandStart + 5 : operandStart + 5 + numStr.length + 1;
    setCursorPosition(newPos);
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  const handleSdToggle = () => {
    setDisplaySdMode(prev => {
      if (prev === 'both') return 'decimal';
      if (prev === 'decimal') return 'fraction';
      return 'both';
    });
  };

  const handleVariableButton = (varName) => {
    if (isStoring) {
      const valueToStore = calcResult && calcResult !== 'Error' ? parseFloat(calcResult) : (calcInput ? parseFloat(evaluateExpr(calcInput, calcAngleMode)) : 0);
      setVariables(prev => ({ ...prev, [varName]: isNaN(valueToStore) ? 0 : valueToStore }));
      setStatusMessage(`${isNaN(valueToStore) ? 0 : valueToStore} → ${varName}`);
      setIsStoring(false);
      setShiftActive(false);
    } else if (isRecalling) {
      insertAtCursor(variables[varName].toString());
      setIsRecalling(false);
    } else {
      if (alphaActive) {
        insertAtCursor(varName);
        setAlphaActive(false);
      } else {
        if (varName === 'A') insertAtCursor('-');
        else if (varName === 'B') insertAtCursor('°');
        else if (varName === 'C') {
          setHypActive(true);
          setStatusMessage('hyp');
        }
        else if (varName === 'D') insertAtCursor('sin(');
        else if (varName === 'E') insertAtCursor('cos(');
        else if (varName === 'F') insertAtCursor('tan(');
        else if (varName === 'X') insertAtCursor('(');
        else if (varName === 'Y') insertAtCursor(')');
        else if (varName === 'M') insertAtCursor('M');
      }
    }
  };

  const handleKeyClick = (keyId) => {
    if (!isOn && keyId !== 'on') return;

    if (isStoring || isRecalling || alphaActive) {
      const varMap = {
        'neg': 'A',
        'dms': 'B',
        'hyp': 'C',
        'sin': 'D',
        'cos': 'E',
        'tan': 'F',
        'lparen': 'X',
        'rparen': 'Y',
        'mplus': 'M'
      };
      if (varMap[keyId]) {
        handleVariableButton(varMap[keyId]);
        return;
      }
    }

    setStatusMessage('');

    switch (keyId) {
      case 'shift':
        setShiftActive(prev => !prev);
        setAlphaActive(false);
        break;
      case 'alpha':
        setAlphaActive(prev => !prev);
        setShiftActive(false);
        break;
      case 'mode':
        setCalcAngleMode(prev => prev === 'deg' ? 'rad' : 'deg');
        setShiftActive(false);
        break;
      case 'on':
        if (!isOn) {
          setIsOn(true);
        } else {
          handleClear();
        }
        break;
      case 'calc':
        if (shiftActive) {
          handleEqual();
          setShiftActive(false);
        } else if (alphaActive) {
          insertAtCursor('=');
          setAlphaActive(false);
        } else {
          handleEqual();
        }
        break;
      case 'integration':
        if (shiftActive) {
          insertAtCursor('d/dx(');
          setShiftActive(false);
        } else if (alphaActive) {
          insertAtCursor(':');
          setAlphaActive(false);
        } else {
          insertAtCursor('∫(');
        }
        break;
      case 'inverse':
        if (shiftActive) {
          insertAtCursor('!');
          setShiftActive(false);
        } else {
          insertAtCursor('^(-1)');
        }
        break;
      case 'log_base':
        if (shiftActive) {
          insertAtCursor('Σ(');
          setShiftActive(false);
        } else {
          insertAtCursor('log(');
        }
        break;
      case 'frac':
        handleFracKey();
        break;
      case 'sqrt':
        if (shiftActive) {
          insertAtCursor('∛(');
          setShiftActive(false);
        } else {
          insertAtCursor('sqrt()');
        }
        break;
      case 'sq':
        if (shiftActive) {
          insertAtCursor('^(3)');
          setShiftActive(false);
        } else {
          insertAtCursor('^(2)');
        }
        break;
      case 'pow':
        if (shiftActive) {
          insertAtCursor('^(1/)');
          setShiftActive(false);
        } else {
          insertAtCursor('^()');
        }
        break;
      case 'log':
        if (shiftActive) {
          insertAtCursor('10^()');
          setShiftActive(false);
        } else {
          insertAtCursor('log(');
        }
        break;
      case 'ln':
        if (shiftActive) {
          insertAtCursor('e^()');
          setShiftActive(false);
        } else {
          insertAtCursor('ln(');
        }
        break;
      case 'neg':
        if (shiftActive) {
          insertAtCursor('∠');
          setShiftActive(false);
        } else {
          insertAtCursor('-');
        }
        break;
      case 'dms':
        insertAtCursor('°');
        break;
      case 'hyp':
        if (shiftActive) {
          insertAtCursor('Abs(');
          setShiftActive(false);
        } else {
          setHypActive(true);
          setStatusMessage('hyp');
        }
        break;
      case 'sin':
        if (hypActive) {
          if (shiftActive) insertAtCursor('asinh(');
          else insertAtCursor('sinh(');
          setHypActive(false);
          setShiftActive(false);
        } else {
          if (shiftActive) {
            insertAtCursor('sin⁻¹(');
            setShiftActive(false);
          } else {
            insertAtCursor('sin(');
          }
        }
        break;
      case 'cos':
        if (hypActive) {
          if (shiftActive) insertAtCursor('acosh(');
          else insertAtCursor('cosh(');
          setHypActive(false);
          setShiftActive(false);
        } else {
          if (shiftActive) {
            insertAtCursor('cos⁻¹(');
            setShiftActive(false);
          } else {
            insertAtCursor('cos(');
          }
        }
        break;
      case 'tan':
        if (hypActive) {
          if (shiftActive) insertAtCursor('atanh(');
          else insertAtCursor('tanh(');
          setHypActive(false);
          setShiftActive(false);
        } else {
          if (shiftActive) {
            insertAtCursor('tan⁻¹(');
            setShiftActive(false);
          } else {
            insertAtCursor('tan(');
          }
        }
        break;
      case 'rcl':
        if (shiftActive) {
          setIsStoring(true);
          setShiftActive(false);
        } else {
          setIsRecalling(true);
        }
        break;
      case 'eng':
        insertAtCursor('*10^()');
        break;
      case 'lparen':
        if (shiftActive) {
          insertAtCursor('%');
          setShiftActive(false);
        } else {
          insertAtCursor('(');
        }
        break;
      case 'rparen':
        if (shiftActive) {
          insertAtCursor(',');
          setShiftActive(false);
        } else {
          insertAtCursor(')');
        }
        break;
      case 'sd':
        handleSdToggle();
        break;
      case 'mplus':
        if (shiftActive) {
          const resVal = parseFloat(evaluateExpr(calcInput, calcAngleMode));
          if (!isNaN(resVal)) {
            setVariables(prev => ({ ...prev, M: prev.M - resVal }));
            setStatusMessage(`M - ${resVal}`);
          }
          setShiftActive(false);
        } else {
          const resVal = parseFloat(evaluateExpr(calcInput, calcAngleMode));
          if (!isNaN(resVal)) {
            setVariables(prev => ({ ...prev, M: prev.M + resVal }));
            setStatusMessage(`M + ${resVal}`);
          }
        }
        break;
      default:
        break;
    }
  };

  const renderSilverKey = (label, topLabel, keyId) => {
    let topColor = 'text-slate-400';
    let topSize = 'text-[9px] h-3.5 mb-1';
    if (keyId === 'shift') {
      topColor = 'text-amber-500';
      topSize = 'text-[9px] h-4 mb-0.5';
    } else if (keyId === 'alpha') {
      topColor = 'text-rose-400';
      topSize = 'text-[9px] h-4 mb-0.5';
    }
    
    let activeCls = '';
    if (keyId === 'shift' && shiftActive) activeCls = 'bg-amber-500 border-amber-400 text-slate-950 scale-95 shadow-inner';
    else if (keyId === 'alpha' && alphaActive) activeCls = 'bg-rose-500 border-rose-400 text-white scale-95 shadow-inner';
    else activeCls = 'bg-[#7c8682] border-[#919c98] text-slate-950 active:scale-95 hover:bg-[#8d9995] cursor-pointer';

    return (
      <div className="flex flex-col items-center w-full relative">
        <span className={`font-black ${topColor} ${topSize} select-none pointer-events-none truncate max-w-full uppercase`}>
          {topLabel || ' '}
        </span>
        <button
          onClick={() => handleKeyClick(keyId)}
          className={`w-full py-1 rounded text-[11px] font-black transition-all shadow-sm select-none h-8 flex items-center justify-center border ${activeCls}`}
        >
          {label}
        </button>
      </div>
    );
  };

  const renderFuncKey = (keyId, label, shiftLabel, alphaLabel, keyName) => {
    const isDms = keyId === 'dms';
    return (
      <div className="flex flex-col items-center w-full relative">
        <div className="flex justify-between items-end w-full px-0.5 mb-0.5 select-none h-4">
          <span className="text-[8px] font-black text-amber-500 truncate max-w-[50%] leading-none">{shiftLabel || ' '}</span>
          <span className="text-[8px] font-black text-rose-400 truncate max-w-[50%] leading-none self-end">{alphaLabel || ' '}</span>
        </div>
        <button
          onClick={() => handleKeyClick(keyId)}
          className={`w-full py-1 rounded bg-[#2c3230] border border-[#404845] text-slate-100 font-extrabold active:scale-95 hover:bg-[#383f3d] transition-all cursor-pointer shadow-md select-none h-9 flex items-center justify-center relative ${
            isDms ? 'text-[16px] tracking-wider pt-0 pb-0.5' : 'text-[11px]'
          }`}
        >
          {label}
        </button>
      </div>
    );
  };

  const renderNumPadKey = (label, onClick, colorType) => {
    let btnCls = "w-full py-1 text-[16px] font-black rounded-md border transition-all cursor-pointer h-[52px] flex items-center justify-center select-none ";
    if (colorType === 'green') {
      btnCls += "bg-[#a3c965] border-[#8aab51] text-slate-950 hover:bg-[#b0da6d] active:scale-95 shadow-sm shadow-emerald-950/20";
    } else if (colorType === 'equal') {
      btnCls += "bg-[#2c3230] border-[#404845] text-slate-100 hover:bg-[#383f3d] active:scale-95 shadow-sm";
    } else if (colorType === 'operator') {
      btnCls += "bg-[#2c3230] border-[#404845] text-slate-100 hover:bg-[#383f3d] active:scale-95 shadow-sm";
    } else {
      btnCls += "bg-[#eceeed] border-[#cfd2d1] text-slate-900 hover:bg-[#f7f9f8] active:scale-95 shadow-sm font-sans text-[18px]";
    }

    return (
      <button onClick={onClick} className={btnCls}>
        {label}
      </button>
    );
  };

  const FormulaRenderer = ({ str, cursorIdx }) => {
    const parsed = parseFormula(str);
    
    const renderCursor = (idx) => {
      if (idx === cursorIdx) {
        return (
          <>
            <style>{`
              @keyframes casio-blink {
                50% { opacity: 0; }
              }
            `}</style>
            <span style={{
              display: 'inline-block',
              borderLeft: '2px solid #202528',
              height: '20px',
              marginLeft: '-1px',
              verticalAlign: 'middle',
              animation: 'casio-blink 1s step-start infinite'
            }}></span>
          </>
        );
      }
      return null;
    };

    const shiftIndices = (node, offset) => {
      if (node.type === 'text') {
        return {
          ...node,
          startIdx: node.startIdx + offset,
          endIdx: node.endIdx + offset
        };
      } else if (node.type === 'fraction') {
        return {
          ...node,
          numStartIdx: node.numStartIdx + offset,
          numEndIdx: node.numEndIdx + offset,
          denStartIdx: node.denStartIdx + offset,
          denEndIdx: node.denEndIdx + offset,
          startIdx: node.startIdx + offset,
          endIdx: node.endIdx + offset
        };
      } else if (node.type === 'exponent') {
        return {
          ...node,
          expStartIdx: node.expStartIdx + offset,
          expEndIdx: node.expEndIdx + offset,
          startIdx: node.startIdx + offset,
          endIdx: node.endIdx + offset
        };
      } else if (node.type === 'sqrt') {
        return {
          ...node,
          sqrtStartIdx: node.sqrtStartIdx + offset,
          sqrtEndIdx: node.sqrtEndIdx + offset,
          startIdx: node.startIdx + offset,
          endIdx: node.endIdx + offset
        };
      }
      return node;
    };

    const renderTree = (nodes) => {
      return nodes.map((node, index) => {
        if (node.type === 'text') {
          const chars = [];
          for (let idx = node.startIdx; idx <= node.endIdx; idx++) {
            chars.push(
              <span key={idx} data-index={idx} className="inline">
                {renderCursor(idx)}
                {idx < node.endIdx ? node.content[idx - node.startIdx] : null}
              </span>
            );
          }
          return <span key={index} className="inline">{chars}</span>;
        } else if (node.type === 'fraction') {
          return (
            <span key={index} data-index={node.startIdx} className="inline-flex flex-col items-center mx-1.5 align-middle leading-none">
              <span className="border-b border-[#202528] pb-1 px-1.5 w-full text-center flex justify-center items-center min-w-[22px] min-h-[22px] leading-none">
                {node.numStr === '' ? (
                  <span data-index={node.numEndIdx} className={`border border-dashed border-[#202528]/40 w-[18px] h-[18px] rounded-[1px] inline-block ${cursorIdx === node.numEndIdx ? 'bg-[#202528]/25' : ''}`}></span>
                ) : (
                  renderTree(parseFormula(str.substring(node.numStartIdx, node.numEndIdx)).map(n => shiftIndices(n, node.numStartIdx)))
                )}
                {renderCursor(node.numEndIdx)}
              </span>
              <span className="pt-1 px-1.5 w-full text-center flex justify-center items-center min-w-[22px] min-h-[22px] leading-none">
                {node.denStr === '' ? (
                  <span data-index={node.denEndIdx} className={`border border-dashed border-[#202528]/40 w-[18px] h-[18px] rounded-[1px] inline-block ${cursorIdx === node.denEndIdx ? 'bg-[#202528]/25' : ''}`}></span>
                ) : (
                  renderTree(parseFormula(str.substring(node.denStartIdx, node.denEndIdx)).map(n => shiftIndices(n, node.denStartIdx)))
                )}
                {renderCursor(node.denEndIdx)}
              </span>
            </span>
          );
        } else if (node.type === 'exponent') {
          const isEmpty = node.expStr === '';
          const wrapperClass = isEmpty
            ? `inline-flex items-center justify-center align-super text-[0.6em] font-bold border border-dashed border-[#202528]/40 rounded-[1px] p-0.5 min-w-[16px] min-h-[16px] ml-0.5 leading-none bg-[#202528]/25`
            : `inline-flex items-center justify-center align-super text-[0.6em] font-bold ml-0.5 leading-none`;
          
          const isBaseEmpty = node.startIdx === 0 || /[\+\-\*\/×÷\(,]/.test(str[node.startIdx - 1]);
          const isBaseFocused = cursorIdx === node.startIdx;

          return (
            <React.Fragment key={index}>
              {isBaseEmpty && (
                <span 
                  data-index={node.startIdx} 
                  className={`border border-dashed border-[#202528]/40 w-[18px] h-[18px] rounded-[1px] inline-flex items-center justify-center mr-0.5 align-middle ${isBaseFocused ? 'bg-[#202528]/25' : ''}`}
                >
                  {renderCursor(node.startIdx)}
                </span>
              )}
              <span 
                className={wrapperClass} 
                style={{ position: 'relative', top: '-0.35em' }}
                data-index={node.expEndIdx}
              >
                {isEmpty ? (
                  <span className="w-2.5 h-3.5 inline-block"></span>
                ) : (
                  renderTree(parseFormula(str.substring(node.expStartIdx, node.expEndIdx)).map(n => shiftIndices(n, node.expStartIdx)))
                )}
                {renderCursor(node.expEndIdx)}
              </span>
            </React.Fragment>
          );
        } else if (node.type === 'sqrt') {
          const isEmpty = node.sqrtStr === '';
          return (
            <span key={index} data-index={node.startIdx} className="inline-flex items-stretch mx-0.5 align-middle relative leading-none">
              <svg 
                className="w-[12px] shrink-0 text-[#202528] select-none" 
                viewBox="0 0 10 20" 
                preserveAspectRatio="none"
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ verticalAlign: 'middle' }}
              >
                <path d="M 1,11 L 3,11 L 6,18 L 9.5,2" />
              </svg>
              <span className="border-t-2 border-[#202528] pt-[1px] pb-[1px] px-1 w-full text-center flex justify-center items-center min-w-[20px] min-h-[22px] leading-none">
                {isEmpty ? (
                  <span data-index={node.sqrtEndIdx} className={`border border-dashed border-[#202528]/40 w-[18px] h-[18px] rounded-[1px] inline-block ${cursorIdx === node.sqrtEndIdx ? 'bg-[#202528]/25' : ''}`}></span>
                ) : (
                  renderTree(parseFormula(str.substring(node.sqrtStartIdx, node.sqrtEndIdx)).map(n => shiftIndices(n, node.sqrtStartIdx)))
                )}
                {renderCursor(node.sqrtEndIdx)}
              </span>
            </span>
          );
        }
        return null;
      });
    };
    
    return (
      <span className="flex items-center flex-nowrap select-text whitespace-nowrap overflow-x-auto py-1 max-w-full text-[20px] font-extrabold leading-none text-[#202528] font-mono">
        {renderTree(parsed)}
        {renderCursor(str.length)}
      </span>
    );
  };

  const renderLcdDisplay = () => {
    if (!isOn) {
      return (
        <div className="bg-[#1a1c19] border-2 border-[#30332f] rounded-md p-2 font-mono shadow-inner text-transparent mb-2 h-24 select-none" />
      );
    }

    const displayResult = calcResult || previewResult;

    let showFraction = false;
    let showDecimal = true;
    
    let fracNumerator = '';
    let fracDenominator = '';
    
    if (displayResult && displayResult !== 'Error') {
      const numVal = parseFloat(displayResult);
      if (!isNaN(numVal)) {
        const frac = decimalToFraction(numVal);
        if (frac && frac.denominator > 1) {
          fracNumerator = frac.numerator.toString();
          fracDenominator = frac.denominator.toString();
          
          if (displaySdMode === 'both') {
            showFraction = true;
            showDecimal = true;
          } else if (displaySdMode === 'fraction') {
            showFraction = true;
            showDecimal = false;
          } else {
            showFraction = false;
            showDecimal = true;
          }
        }
      }
    }
    
    return (
      <div 
        onClick={() => inputRef.current && inputRef.current.focus()}
        className="bg-[#E3E8E5] border-2 border-[#b8c2be] rounded-md pt-2 pb-2 px-3 font-mono shadow-inner text-[#202528] mb-2 relative overflow-hidden h-[90px] flex flex-col justify-between select-text cursor-text"
      >
        <div className="flex gap-3 text-[12px] font-black select-none h-3.5 leading-none text-[#202528] tracking-wider">
          <span className={shiftActive ? "opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]" : "opacity-10"}>S</span>
          <span className={alphaActive ? "opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]" : "opacity-10"}>A</span>
          <span className={variables.M !== 0 ? "opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]" : "opacity-10"}>M</span>
          <span className={calcAngleMode === 'deg' ? "opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]" : "opacity-10"}>D</span>
          <span className={calcAngleMode === 'rad' ? "opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]" : "opacity-10"}>R</span>
          {isStoring && <span className="opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]">STO</span>}
          {isRecalling && <span className="opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]">RCL</span>}
          <span className="ml-auto opacity-100">Math</span>
        </div>
        
        <div className="flex flex-row justify-between flex-grow mt-1 select-text w-full items-center gap-1.5 overflow-hidden h-[52px]">
          <div className="flex-[8] w-[80%] flex items-center select-text overflow-x-auto h-full pr-1.5 scrollbar-thin">
            <div className="w-full select-text">
              <FormulaRenderer str={calcInput} cursorIdx={cursorPosition} />
            </div>
            
            {statusMessage && (
              <span className="text-[10px] text-[#202528] bg-[#202528]/10 px-1 py-0.5 rounded select-none shrink-0 ml-1">
                {statusMessage}
              </span>
            )}
          </div>
          
          <div className="flex-[2] w-[20%] flex items-center justify-center select-text h-full px-1 text-center overflow-hidden bg-[#c9d0cc] rounded-md border border-[#b0b8b4]/30 shadow-sm">
            <span className="text-[18px] opacity-75 text-[#202528] select-none leading-none mr-1 shrink-0">=</span>
            <div className="text-[#202528] select-all font-mono leading-none flex items-center justify-center overflow-hidden max-w-full">
              {showFraction ? (
                <div className="inline-flex flex-col items-center justify-center font-bold px-0.5 text-[14px] align-middle shrink-0 leading-tight">
                  <span className="border-b border-[#202528] pb-0.5 px-0.5 select-text">{fracNumerator}</span>
                  <span className="pt-0.5 px-0.5 select-text">{fracDenominator}</span>
                </div>
              ) : (
                <span className="text-[20px] font-black tracking-tight select-text leading-none truncate">{showDecimal ? (displayResult || '0') : ''}</span>
              )}
            </div>
          </div>
        </div>

        <input
          ref={inputRef}
          id="calc-input-field"
          type="text"
          value={calcInput}
          onChange={(e) => {
            const val = e.target.value;
            
            if (calcResult) {
              setCalcResult('');
              const prev = calcInput;
              let inserted = '';
              if (val.length > prev.length) {
                const cursor = e.target.selectionStart;
                inserted = val.substring(cursor - (val.length - prev.length), cursor);
              } else {
                inserted = val;
              }

              if (inserted) {
                let mapped = inserted;
                if (mapped === '*') mapped = '×';
                if (mapped === '/') mapped = '÷';
                
                if (isOperatorString(mapped)) {
                  setCalcInput('Ans' + mapped);
                  setCursorPosition(3 + mapped.length);
                  setHistoryIndex(-1);
                } else {
                  setCalcInput(mapped);
                  setCursorPosition(mapped.length);
                  setHistoryIndex(-1);
                }
                return;
              }
            }
            
            setCalcResult('');
            
            // If they type or paste 'sqrt(', convert to 'sqrt()'
            if (val.includes('sqrt(')) {
              let idx = -1;
              for (let i = 0; i < val.length; i++) {
                if (val.startsWith('sqrt(', i) && !val.startsWith('sqrt()', i)) {
                  idx = i;
                  break;
                }
              }
              if (idx !== -1) {
                const before = val.substring(0, idx);
                const after = val.substring(idx + 5);
                const finalVal = before + 'sqrt()' + after;
                setCalcInput(finalVal);
                const newPos = idx + 5;
                setCursorPosition(newPos);
                setTimeout(() => {
                  if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.setSelectionRange(newPos, newPos);
                  }
                }, 10);
                return;
              }
            }

            // Intercept caret '^' typed by physical keyboard
            if (val.includes('^')) {
              let caretIdx = -1;
              for (let idx = 0; idx < val.length; idx++) {
                if (val[idx] === '^' && val[idx + 1] !== '(') {
                  caretIdx = idx;
                  break;
                }
              }
              if (caretIdx !== -1) {
                const before = val.substring(0, caretIdx);
                const after = val.substring(caretIdx + 1);
                const finalVal = before + '^()' + after;
                setCalcInput(finalVal);
                const newPos = caretIdx + 2; // inside the parenthesis
                setCursorPosition(newPos);
                setTimeout(() => {
                  if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.setSelectionRange(newPos, newPos);
                  }
                }, 10);
                return;
              }
            }

            // If the user typed or inserted a slash '/', convert it to frac(,)
            if (val.includes('/')) {
              const slashIdx = val.indexOf('/');
              const beforeSlash = val.substring(0, slashIdx);
              const afterSlash = val.substring(slashIdx + 1);
              
              // Scan backwards to find operand prefix
              let operandStart = beforeSlash.length;
              while (operandStart > 0) {
                const char = beforeSlash[operandStart - 1];
                if (/[\d.XYABCDEFMπe]/.test(char)) {
                  operandStart--;
                } else {
                  break;
                }
              }
              
              const before = beforeSlash.substring(0, operandStart);
              const numStr = beforeSlash.substring(operandStart);
              const fracVal = `frac(${numStr},)`;
              const finalVal = before + fracVal + afterSlash;
              
              setCalcInput(finalVal);
              const newPos = numStr === '' ? operandStart + 5 : operandStart + 5 + numStr.length + 1;
              setCursorPosition(newPos);
              
              setTimeout(() => {
                if (inputRef.current) {
                  inputRef.current.focus();
                  inputRef.current.setSelectionRange(newPos, newPos);
                }
              }, 10);
              return;
            }
            
            setCalcInput(val);
            setCursorPosition(e.target.selectionStart);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={(e) => {
            setCursorPosition(e.target.selectionStart);
          }}
          onClick={(e) => {
            setCursorPosition(e.target.selectionStart);
          }}
          className="absolute opacity-0 pointer-events-none w-0 h-0"
        />
      </div>
    );
  };

  return (
    <div className="w-full bg-[#181d1b] border-b border-slate-800 p-3 flex flex-col gap-1 select-none relative font-sans">
      
      {/* Casio LCD Screen */}
      {renderLcdDisplay()}

      {/* Keypad Container (Function keys on left, Number pad on right) */}
      <div className="flex flex-row gap-2 mt-1 w-full overflow-hidden items-stretch">
        
        {/* Left Side: Casio Scientific Function Keys (6 columns with center D-pad) */}
        <div className="flex-[1.25] min-w-0 pr-1 border-r border-[#404845]/30 flex flex-col justify-end">
          <div className="grid grid-cols-6 gap-x-1.5 gap-y-1.5 select-none">
            {/* Row 1 */}
            {renderSilverKey('SHIFT', 'SHIFT', 'shift')}
            {renderSilverKey('ALPHA', 'ALPHA', 'alpha')}
            
            {/* D-Pad occupies cols 3 & 4 and spans 2 rows */}
            <div className="col-span-2 row-span-2 flex items-center justify-center relative w-full h-full my-auto px-0.5">
              <div className="relative w-24 h-24 bg-gradient-to-tr from-[#3a423e] to-[#252a28] border-2 border-[#4a5450] rounded-full shadow-md flex items-center justify-center shrink-0">
                <button onClick={() => handleDpad('up')} className="absolute top-2 left-1/2 -translate-x-1/2 text-slate-400 hover:text-white active:scale-90 select-none text-[18px] font-black cursor-pointer leading-none">▲</button>
                <button onClick={() => handleDpad('down')} className="absolute bottom-2 left-1/2 -translate-x-1/2 text-slate-400 hover:text-white active:scale-90 select-none text-[18px] font-black cursor-pointer leading-none">▼</button>
                <button onClick={() => handleDpad('left')} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white active:scale-90 select-none text-[18px] font-black cursor-pointer leading-none">◀</button>
                <button onClick={() => handleDpad('right')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white active:scale-90 select-none text-[18px] font-black cursor-pointer leading-none">▶</button>
                <span className="text-[9px] font-black text-slate-500 tracking-wider">REPLAY</span>
              </div>
            </div>
            
            {renderSilverKey('MODE', 'SETUP', 'mode')}
            {renderSilverKey('CLR', 'OFF', 'on')}
            
            {/* Row 2 */}
            {renderFuncKey('calc', 'CALC', 'SOLVE', '=', 'calc')}
            {renderFuncKey('integration', '∫dx', 'd/dx', ':', 'integration')}
            {/* cols 3 & 4 skipped for row-span-2 D-Pad */}
            {renderFuncKey('inverse', 'x⁻¹', 'x!', 'DEC', 'inverse')}
            {renderFuncKey('log_base', 'log_■', 'Σ', 'HEX', 'log_base')}
            
            {/* Row 3 */}
            {renderFuncKey('frac', '■/□', 'a b/c', '', 'frac')}
            {renderFuncKey('sqrt', '√', '∛', '', 'sqrt')}
            {renderFuncKey('sq', 'x²', 'x³', 'DEC', 'sq')}
            {renderFuncKey('pow', 'x^■', 'x√', 'HEX', 'pow')}
            {renderFuncKey('log', 'log', '10ˣ', 'BIN', 'log')}
            {renderFuncKey('ln', 'ln', 'eˣ', 'OCT', 'ln')}
            
            {/* Row 4 */}
            {renderFuncKey('neg', '(-)', '∠', 'A', 'neg')}
            {renderFuncKey('dms', '°\'"', '←', 'B', 'dms')}
            {renderFuncKey('hyp', 'hyp', 'Abs', 'C', 'hyp')}
            {renderFuncKey('sin', 'sin', 'sin⁻¹', 'D', 'sin')}
            {renderFuncKey('cos', 'cos', 'cos⁻¹', 'E', 'cos')}
            {renderFuncKey('tan', 'tan', 'tan⁻¹', 'F', 'tan')}
            
            {/* Row 5 */}
            {renderFuncKey('rcl', 'RCL', 'STO', '', 'rcl')}
            {renderFuncKey('eng', 'ENG', '←', 'i', 'eng')}
            {renderFuncKey('lparen', '(', '%', 'X', 'lparen')}
            {renderFuncKey('rparen', ')', ',', 'Y', 'rparen')}
            {renderFuncKey('sd', 'S⇔D', 'd/c', '', 'sd')}
            {renderFuncKey('mplus', 'M+', 'M-', 'M', 'mplus')}
          </div>
        </div>

        {/* Right Side: Casio Number Pad (5 columns) */}
        <div className="flex-[0.75] min-w-0 pl-1 flex flex-col justify-end">
          <div className="grid grid-cols-5 gap-2 select-none">
            {/* Top Row (Row 0): Aligns keypad top edges, adds pi, %, e, =, and X buttons */}
            {renderNumPadKey('π', () => appendToInput('π'))}
            {renderNumPadKey('%', () => appendToInput('%'))}
            {renderNumPadKey('e', () => appendToInput('e'))}
            {renderNumPadKey('=', () => appendToInput('='))}
            {renderNumPadKey('X', () => appendToInput('X'))}

            {/* Row 6 */}
            {renderNumPadKey('7', () => appendToInput('7'))}
            {renderNumPadKey('8', () => appendToInput('8'))}
            {renderNumPadKey('9', () => appendToInput('9'))}
            {renderNumPadKey('DEL', handleBackspace, 'green')}
            {renderNumPadKey('AC', () => handleKeyClick('on'), 'green')}

            {/* Row 7 */}
            {renderNumPadKey('4', () => appendToInput('4'))}
            {renderNumPadKey('5', () => appendToInput('5'))}
            {renderNumPadKey('6', () => appendToInput('6'))}
            {renderNumPadKey('×', () => appendToInput('×'), 'operator')}
            {renderNumPadKey('÷', () => appendToInput('÷'), 'operator')}

            {/* Row 8 */}
            {renderNumPadKey('1', () => appendToInput('1'))}
            {renderNumPadKey('2', () => appendToInput('2'))}
            {renderNumPadKey('3', () => appendToInput('3'))}
            {renderNumPadKey('+', () => appendToInput('+'), 'operator')}
            {renderNumPadKey('-', () => appendToInput('-'), 'operator')}

            {/* Row 9 */}
            {renderNumPadKey('0', () => appendToInput('0'))}
            {renderNumPadKey('.', () => appendToInput('.'))}
            {renderNumPadKey('×10ˣ', () => appendToInput('*10^()'))}
            {renderNumPadKey('Ans', () => appendToInput('Ans'), 'operator')}
            {renderNumPadKey('=', handleEqual, 'equal')}
          </div>
        </div>

      </div>

    </div>
  );
}


const formatReviewDate = (completedAt, plannedDate) => {
  if (completedAt) {
    try {
      const d = new Date(completedAt);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm}.${dd}`;
      }
    } catch (e) {
      console.warn('formatReviewDate error:', e);
    }
  }
  if (plannedDate) {
    const match = plannedDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[2]}.${match[3]}`;
    }
  }
  return '';
};

// Mock Mobile Status Bar Component (DISABLED: Native phone header is kept visible)
function MobileStatusBar() {
  return null;
}

// Floating Casio Calculator Component
function FloatingCalculator({ isVisible, onClose }) {
  const dragRef = useRef(null);
  const [position, setPosition] = useState(() => {
    const isMobile = window.innerWidth < 768;
    const width = isMobile ? window.innerWidth * 0.9 : 660;
    return { x: Math.max(10, window.innerWidth - width - 20), y: 150 };
  });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.target.closest('.drag-handle')) {
      isDragging.current = true;
      dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current) return;
    const newX = e.clientX - dragStart.current.x;
    const newY = e.clientY - dragStart.current.y;
    const width = dragRef.current?.clientWidth || 660;
    const height = dragRef.current?.clientHeight || 500;
    const boundedX = Math.max(10, Math.min(window.innerWidth - width - 10, newX));
    const boundedY = Math.max(10, Math.min(window.innerHeight - height - 10, newY));
    setPosition({ x: boundedX, y: boundedY });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e) => {
    if (e.target.closest('.drag-handle')) {
      isDragging.current = true;
      const touch = e.touches[0];
      dragStart.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.current.x;
    const newY = touch.clientY - dragStart.current.y;
    const width = dragRef.current?.clientWidth || 660;
    const height = dragRef.current?.clientHeight || 500;
    const boundedX = Math.max(10, Math.min(window.innerWidth - width - 10, newX));
    const boundedY = Math.max(10, Math.min(window.innerHeight - height - 10, newY));
    setPosition({ x: boundedX, y: boundedY });
    e.preventDefault();
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  };

  return (
    <div
      ref={dragRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9999,
        touchAction: 'none',
        display: isVisible ? 'flex' : 'none'
      }}
      className="w-[90vw] md:w-[660px] bg-slate-900 border border-slate-700/60 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden backdrop-blur-md transition-shadow duration-300 hover:shadow-rose-500/10 hover:border-rose-500/20"
    >
      {/* Draggable Header */}
      <div 
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="drag-handle flex items-center justify-between px-3.5 py-2.5 bg-lime-200 border-b border-lime-300 cursor-move select-none"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-slate-950 text-slate-100 font-black px-1.5 py-0.5 rounded border border-slate-900/30">CASIO</span>
          <span className="text-[10px] text-slate-950 font-black tracking-wider">공학용 계산기</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-lime-300 text-slate-900 hover:text-black transition-colors cursor-pointer flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>
      {/* Calculator Body Wrapper */}
      <div className="p-2 overflow-y-auto max-h-[70vh] custom-vertical-scrollbar bg-slate-950/20">
        <ScientificCalculator />
      </div>
    </div>
  );
}

export default function App() {
  const API_BASE = import.meta.env.VITE_API_URL || '';

  // Dynamic KaTeX Loader State
  const [katexLoaded, setKatexLoaded] = useState(false);
  useEffect(() => {
    if (!document.getElementById('katex-css')) {
      const link = document.createElement('link');
      link.id = 'katex-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
      document.head.appendChild(link);
    }

    const loadCopyTex = () => {
      if (!document.getElementById('katex-copy-tex')) {
        const copyScript = document.createElement('script');
        copyScript.id = 'katex-copy-tex';
        copyScript.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/copy-tex.min.js';
        document.head.appendChild(copyScript);
      }
    };

    if (window.katex) {
      setKatexLoaded(true);
      loadCopyTex();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    script.onload = () => {
      setKatexLoaded(true);
      loadCopyTex();
    };
    document.head.appendChild(script);
  }, []);
  
  // Views: 'dashboard' (today's tasks) or 'all_topics' (all materials tracker)
  const [viewMode, setViewMode] = useState('dashboard');
  const [showFloatingCalculator, setShowFloatingCalculator] = useState(false);
  const [lastActiveReview, setLastActiveReview] = useState(null);
  useEffect(() => {
    const saved = localStorage.getItem('anti_last_active_review');
    if (saved) {
      try {
        setLastActiveReview(JSON.parse(saved));
      } catch (e) {}
    }

    // Always fetch last active review from database to sync in real-time
    fetch(`${API_BASE}/api/session/last-active-review`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.lastActive) {
          setLastActiveReview(data.lastActive);
          localStorage.setItem('anti_last_active_review', JSON.stringify(data.lastActive));
        }
      })
      .catch(err => console.warn('마지막 복습 내역 로드 실패:', err));
  }, []);
  const [editingFormulaIdx, setEditingFormulaIdx] = useState(null);
  const [editingFormulaText, setEditingFormulaText] = useState("");
  const [refreshingFormulaIdx, setRefreshingFormulaIdx] = useState(null);
  const [formulaConfirmTarget, setFormulaConfirmTarget] = useState(null);
  const [formulaAddedTarget, setFormulaAddedTarget] = useState(null);

  
  // Date selector for easy testing (defaults to today's local date 'YYYY-MM-DD')
  const getTodayString = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const [referenceDate, setReferenceDate] = useState(getTodayString());

  // Lists
  const [todayReviews, setTodayReviews] = useState([]);
  const [completedTopicIds, setCompletedTopicIds] = useState([]);
  const [allTopics, setAllTopics] = useState([]);
  const [editingTopicId, setEditingTopicId] = useState(null);
  const [editingTitleText, setEditingTitleText] = useState('');
  
  // Loadings
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  
  // Registration Form States
  const [title, setTitle] = useState('');
  const [keywords, setKeywords] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const htmlTextareaRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  
  // Custom Answersheet Title & Auto-Extraction tracking refs
  const [answersheetUploadTitle, setAnswersheetUploadTitle] = useState('');
  const autoExtractedTitleRef = useRef('');
  const answersheetAutoExtractedTitleRef = useRef('');

  // AI Modal States
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [revealedQuestions, setRevealedQuestions] = useState({}); // Stores which question answers are unblurred/revealed
  const [selectedAnswers, setSelectedAnswers] = useState({}); // Stores chosen options for multiple choice questions { [questionIdx]: optionString }
  const [tableAnswers, setTableAnswers] = useState({}); // Stores user text inputs for table fill-in questions
  const [tableGradingResults, setTableGradingResults] = useState({});
  const [gradingLoading, setGradingLoading] = useState({});

  const gradeTableQuestion = async (qIdx, q) => {
    setGradingLoading(prev => ({ ...prev, [qIdx]: true }));
    const inputs = Object.keys(q.answers || {});
    
    const promises = inputs.map(async (inputId) => {
      const userAnswer = tableAnswers[`${qIdx}_${inputId}`] || '';
      const correctAnswer = q.answers[inputId] || '';
      
      try {
        const res = await fetch(`${API_BASE}/api/grade-subjective`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q.question,
            correctAnswer,
            userAnswer
          })
        });
        const data = await res.json();
        setTableGradingResults(prev => ({
          ...prev,
          [`${qIdx}_${inputId}`]: {
            isCorrect: data.isCorrect,
            reason: data.reason
          }
        }));
      } catch (err) {
        console.error('Grading error:', err);
        const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
        const isCorrect = normalize(userAnswer) === normalize(correctAnswer);
        setTableGradingResults(prev => ({
          ...prev,
          [`${qIdx}_${inputId}`]: {
            isCorrect,
            reason: isCorrect ? '단순 일치(로컬 채점)' : '모범 답안과 불일치'
          }
        }));
      }
    });

    await Promise.all(promises);
    setGradingLoading(prev => ({ ...prev, [qIdx]: false }));
  };

  const gradeSubjectiveQuestion = async (qIdx, q) => {
    setGradingLoading(prev => ({ ...prev, [qIdx]: true }));
    const userAnswer = tableAnswers[`${qIdx}_INPUT`] || '';
    const correctAnswer = q.answer || '';
    
    try {
      const res = await fetch(`${API_BASE}/api/grade-subjective`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.question,
          correctAnswer,
          userAnswer
        })
      });
      const data = await res.json();
      setTableGradingResults(prev => ({
        ...prev,
        [`${qIdx}_INPUT`]: {
          isCorrect: data.isCorrect,
          reason: data.reason
        }
      }));
    } catch (err) {
      console.error('Grading error:', err);
      const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
      const isCorrect = normalize(userAnswer) === normalize(correctAnswer);
      setTableGradingResults(prev => ({
        ...prev,
        [`${qIdx}_INPUT`]: {
          isCorrect,
          reason: isCorrect ? '단순 일치(로컬 채점)' : '모범 답안과 불일치'
        }
      }));
    } finally {
      setGradingLoading(prev => ({ ...prev, [qIdx]: false }));
    }
  };

  const [isFallback, setIsFallback] = useState(false);
  const [aiError, setAiError] = useState('');
  const [openSections, setOpenSections] = useState({}); // { 'qIdx-sIdx': bool } for section accordion
  const [questionFeedback, setQuestionFeedback] = useState({}); // Stores upvotes/downvotes of questions { `${topic_id}_${questionText}`: 'upvote' | 'downvote' }
  
  // Exam mode state
  const [examQuestions, setExamQuestions] = useState([]);
  const [showExam, setShowExam] = useState(() => localStorage.getItem('anti_show_exam') === 'true');
  const [loadingExam, setLoadingExam] = useState(() => localStorage.getItem('anti_show_exam') === 'true');
  const [examTopic, setExamTopic] = useState(null);
  const [examRevealed, setExamRevealed] = useState({});
  const [examAnswers, setExamAnswers] = useState({});
  const [detailedAnswers, setDetailedAnswers] = useState({});
  const [chatHistory, setChatHistory] = useState([]);

  // Formula AI Tutor states
  const [selectedFormulaIdx, setSelectedFormulaIdx] = useState(-1);
  const [formulaChatHistory, setFormulaChatHistory] = useState([]);
  const [isFormulaChatLoading, setIsFormulaChatLoading] = useState(false);
  const formulaChatBodyRef = useRef(null);
  const [formulaChatInput, setFormulaChatInput] = useState('');

  // Single Question Regeneration states
  const [regeneratingReview, setRegeneratingReview] = useState({});

  // Sidebar resizing state & handlers for Desktop
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('anti_right_sidebar_width');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 200 && parsed <= window.innerWidth * 0.9) {
        return parsed;
      }
    }
    return Math.max(300, Math.min(800, Math.round(window.innerWidth * 0.3)));
  });
  const [isResizing, setIsResizing] = useState(false);

  // Sync rightSidebarWidth to localStorage
  useEffect(() => {
    localStorage.setItem('anti_right_sidebar_width', rightSidebarWidth.toString());
  }, [rightSidebarWidth]);

  // Load rightSidebarWidth from server database on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/options/right_sidebar_width`)
      .then(res => res.json())
      .then(data => {
        if (data && data.value) {
          const parsed = parseInt(data.value, 10);
          if (!isNaN(parsed) && parsed >= 200 && parsed <= window.innerWidth * 0.9) {
            setRightSidebarWidth(parsed);
            localStorage.setItem('anti_right_sidebar_width', parsed.toString());
          }
        }
      })
      .catch(err => console.warn('Failed to load right_sidebar_width from database:', err));
  }, []);

  // --- Formula Adjust States & Context Registration ---
  const [adjustingFormulaInputKey, setAdjustingFormulaInputKey] = useState(null);
  const [adjustingFormulaText, setAdjustingFormulaText] = useState({});
  const [adjustingFormulaLoading, setAdjustingFormulaLoading] = useState({});

  const selectedTopicRefForFormula = useRef(null);
  selectedTopicRefForFormula.current = selectedTopic;

  const examTopicRefForFormula = useRef(null);
  examTopicRefForFormula.current = examTopic;

  useEffect(() => {
    window.__handleFormulaConfirmRequest = (math, fullText) => {
      let contextText = fullText || "";
      const selTopic = selectedTopicRefForFormula.current;
      const exTopic = examTopicRefForFormula.current;
      
      if (selTopic && selTopic.title) {
        contextText = `[현재 학습 중인 토픽]: ${selTopic.title}\n\n${contextText}`;
      } else if (exTopic && exTopic.title) {
        contextText = `[현재 시험 중인 토픽]: ${exTopic.title}\n\n${contextText}`;
      }
      setFormulaConfirmTarget({ math, fullText: contextText });
    };
    return () => {
      delete window.__handleFormulaConfirmRequest;
    };
  }, []);

  // Save sidebar width to server database when resizing stops
  const prevIsResizing = useRef(false);
  useEffect(() => {
    if (prevIsResizing.current && !isResizing) {
      fetch(`${API_BASE}/api/options/right_sidebar_width`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: rightSidebarWidth.toString() })
      }).catch(err => console.warn('Failed to save right_sidebar_width to database:', err));
    }
    prevIsResizing.current = isResizing;
  }, [isResizing, rightSidebarWidth]);

  const startResize = useCallback((e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      return;
    }

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e) => {
      const newWidth = window.innerWidth - e.clientX - 25;
      const minWidth = 250;
      const maxWidth = window.innerWidth * 0.7;
      setRightSidebarWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);
  const [regeneratingExam, setRegeneratingExam] = useState({});
  // Question adjustment (AI 피드백) states
  const [adjustingInputKey, setAdjustingInputKey] = useState(null);
  const [adjustingText, setAdjustingText] = useState({});
  const [adjustingLoading, setAdjustingLoading] = useState({});
  const [activeTutorInputKey, setActiveTutorInputKey] = useState(null);
  const [tutorInputText, setTutorInputText] = useState({});
  const [tutorAnswers, setTutorAnswers] = useState({});

  // Formula mode states
  const [showFormulaExam, setShowFormulaExam] = useState(() => localStorage.getItem('anti_show_formula_exam') === 'true');
  const showTheoryExam = false;
  const setShowTheoryExam = () => {};
  const theoryBodyRef = { current: null };
  const savedTheoryScroll = { current: 0 };
  const [formulaMobileTab, setFormulaMobileTab] = useState('list');
  const [formulaQuizQuestions, setFormulaQuizQuestions] = useState([]);
  const [generatingFormulaQuiz, setGeneratingFormulaQuiz] = useState(false);
  const theoryMobileTab = "list";
  const setTheoryMobileTab = () => {};
  const formulaSplitContainerRef = useRef(null);
  const theorySplitContainerRef = { current: null };
  const [reviewMobileTab, setReviewMobileTab] = useState('list');
  const [examMobileTab, setExamMobileTab] = useState('list');
  const reviewSplitContainerRef = useRef(null);
  const examSplitContainerRef = useRef(null);
  const [formulaQuestions, setFormulaQuestions] = useState([]);
  const [loadingFormula, setLoadingFormula] = useState(false);
  const [formulaRevealed, setFormulaRevealed] = useState(() => {
    try {
      const saved = localStorage.getItem('anti_formula_revealed');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [formulaSearchQuery, setFormulaSearchQuery] = useState('');
  const formulaBodyRef = useRef(null);
  const savedFormulaScroll = useRef(0);
  
  // Option Explanations State for Multiple Choice Option Analysis (Separated for Review and Exam)
  const [reviewOptionExplanations, setReviewOptionExplanations] = useState({});
  const [examOptionExplanations, setExamOptionExplanations] = useState({});

  // Hidden Weak-Point Bonus topic IDs (Client hide-on-complete state)
  const [hiddenBonusTopicIds, setHiddenBonusTopicIds] = useState([]);
  const [loadingWeakPoints, setLoadingWeakPoints] = useState(false);

  // Answersheet study modal states
  const [showAnswerSheet, setShowAnswerSheet] = useState(() => localStorage.getItem('anti_show_answersheet') === 'true');
  const [answersheetQuestions, setAnswersheetQuestions] = useState([]);
  const [loadingAnswersheet, setLoadingAnswersheet] = useState(false);
  const [answersheetRevealed, setAnswersheetRevealed] = useState(() => {
    try {
      const saved = localStorage.getItem('anti_answersheet_revealed');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [answersheetSearchQuery, setAnswersheetSearchQuery] = useState('');
  const [refreshingAnswersheetIdx, setRefreshingAnswersheetIdx] = useState(null);
  const [uploadingAnswersheetPdf, setUploadingAnswersheetPdf] = useState(false);
  const [editingAnswersheetIdx, setEditingAnswersheetIdx] = useState(null);
  const [editAnswersheetTitle, setEditAnswersheetTitle] = useState('');
  const [answersheetInputRevealed, setAnswersheetInputRevealed] = useState({});
  const [answersheetMobileTab, setAnswersheetMobileTab] = useState('list');
  const [answersheetDragActive, setAnswersheetDragActive] = useState(false);
  const [answersheetFile, setAnswersheetFile] = useState(null);
  const answersheetTextareaRef = useRef(null);
  const answersheetFileInputRef = useRef(null);

  // Answersheet refs
  const latestAnswersheetQuestionsRef = useRef([]);
  const answersheetSplitContainerRef = useRef(null);
  const answersheetBodyRef = useRef(null);
  const savedAnswersheetScroll = useRef(0);

  // Close floating calculator auto-toggle is now handled via visibility hiding rather than unmounting

  // 1) Load Selected Formula Index and Mobile Tab when selectedTopic changes
  useEffect(() => {
    const topicKey = selectedTopic?.id || 'default';
    
    // Load Selected Formula Index
    const idxKey = `anti_selected_formula_idx_${topicKey}`;
    const savedIdx = localStorage.getItem(idxKey);
    if (savedIdx !== null) {
      const parsedIdx = parseInt(savedIdx, 10);
      if (!isNaN(parsedIdx)) {
        setSelectedFormulaIdx(parsedIdx);
      } else {
        setSelectedFormulaIdx(-1);
      }
    } else {
      setSelectedFormulaIdx(-1);
    }

    // Load Mobile Tab
    const tabKey = `anti_formula_mobile_tab_${topicKey}`;
    const savedTab = localStorage.getItem(tabKey);
    if (savedTab) {
      setFormulaMobileTab(savedTab);
    } else {
      setFormulaMobileTab('list');
    }
  }, [selectedTopic?.id]);

  // 2) Load Chat History when selectedTopic or selectedFormulaIdx changes
  useEffect(() => {
    const topicKey = selectedTopic?.id || 'default';
    if (selectedFormulaIdx === -1) {
      setFormulaChatHistory([]);
      return;
    }
    const chatKey = `anti_formula_chat_history_${topicKey}_${selectedFormulaIdx}`;
    const savedChat = localStorage.getItem(chatKey);
    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat);
        if (Array.isArray(parsed)) {
          setFormulaChatHistory(parsed);
        } else {
          setFormulaChatHistory([]);
        }
      } catch (e) {
        setFormulaChatHistory([]);
      }
    } else {
      setFormulaChatHistory([]);
    }
  }, [selectedTopic?.id, selectedFormulaIdx]);

  const saveFormulaChatHistory = (historyOrFn) => {
    setFormulaChatHistory(prev => {
      const next = typeof historyOrFn === 'function' ? historyOrFn(prev) : historyOrFn;
      const nextArray = Array.isArray(next) ? next : [];
      const key = `anti_formula_chat_history_${selectedTopic?.id || 'default'}_${selectedFormulaIdx}`;
      localStorage.setItem(key, JSON.stringify(nextArray));
      return nextArray;
    });
  };

  // Save selectedFormulaIdx when it changes
  useEffect(() => {
    const key = `anti_selected_formula_idx_${selectedTopic?.id || 'default'}`;
    localStorage.setItem(key, String(selectedFormulaIdx));
  }, [selectedFormulaIdx, selectedTopic?.id]);

  // Save formulaMobileTab when it changes
  useEffect(() => {
    const key = `anti_formula_mobile_tab_${selectedTopic?.id || 'default'}`;
    localStorage.setItem(key, formulaMobileTab);
  }, [formulaMobileTab, selectedTopic?.id]);

  // Desktop view state (width >= 768px)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [isMobileLandscape, setIsMobileLandscape] = useState(window.innerWidth >= 768 && window.innerHeight <= 600);
  const [isCover, setIsCover] = useState(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return h > 0 && w > 0 && (h / w < 1.5);
  });

  // Mobile Status Bar States
  const [statusBarTime, setStatusBarTime] = useState('');
  const [batteryLevel, setBatteryLevel] = useState(88);
  const [isCharging, setIsCharging] = useState(false);

  // Mobile landscape sidebar swipe hide states
  const [landscapeSidebarHidden, setLandscapeSidebarHidden] = useState(false);
  const landscapeSidebarTouchStartRef = useRef({ x: 0, y: 0 });

  const handleLandscapeTouchStart = (e) => {
    if (!isMobileLandscape) return;
    const touch = e.touches[0];
    landscapeSidebarTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleLandscapeTouchEnd = (e) => {
    if (!isMobileLandscape) return;
    const touch = e.changedTouches[0];
    const diffX = landscapeSidebarTouchStartRef.current.x - touch.clientX;
    const diffY = landscapeSidebarTouchStartRef.current.y - touch.clientY;
    
    // Swipe left: horizontal move >= 40px and dominant over vertical shift
    if (diffX > 40 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      setLandscapeSidebarHidden(true);
    }
  };

  // Touch swipe gesture handling for Galaxy Z Flip 6 cover screen and mobile portrait views
  const swipeTouchStartX = useRef(null);
  const swipeTouchStartY = useRef(null);

  const handleSwipeTouchStart = (e) => {
    // Only detect swipe on mobile portrait
    if (isDesktop || isMobileLandscape) return;

    // Check if the touch start target is inside an interactive or horizontally scrollable element
    let current = e.target;
    while (current && current !== document.body) {
      const tagName = current.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'button' || tagName === 'select' || tagName === 'a') {
        return;
      }
      if (current.getAttribute('role') === 'button' || current.onclick) {
        return;
      }
      try {
        const style = window.getComputedStyle(current);
        if (
          style &&
          (current.scrollWidth > current.clientWidth) &&
          (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'overlay')
        ) {
          return;
        }
      } catch (err) {
        // ignore errors
      }
      current = current.parentElement;
    }

    swipeTouchStartX.current = e.touches[0].clientX;
    swipeTouchStartY.current = e.touches[0].clientY;
  };

  const handleSwipeTouchEnd = (e, currentTab, setTab) => {
    if (isDesktop || isMobileLandscape) return;
    if (swipeTouchStartX.current === null || swipeTouchStartY.current === null) return;

    const diffX = e.changedTouches[0].clientX - swipeTouchStartX.current;
    const diffY = e.changedTouches[0].clientY - swipeTouchStartY.current;

    // Min distance 50px, and horizontal distance must be at least 1.5 times the vertical distance
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX < 0 && currentTab === 'list') {
        setTab('tutor');
      } else if (diffX > 0 && currentTab === 'tutor') {
        setTab('list');
      }
    }

    swipeTouchStartX.current = null;
    swipeTouchStartY.current = null;
  };

  // States and refs for modal pull-to-refresh
  const [formulaPull, setFormulaPull] = useState(0);
  const [formulaRefreshing, setFormulaRefreshing] = useState(false);
  const formulaTouchStartY = useRef(0);

  const [theoryPull, setTheoryPull] = useState(0);
  const [theoryRefreshing, setTheoryRefreshing] = useState(false);
  const theoryTouchStartY = useRef(0);

  const [answersheetPull, setAnswersheetPull] = useState(0);
  const [answersheetRefreshing, setAnswersheetRefreshing] = useState(false);
  const answersheetTouchStartY = useRef(0);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
      const isLandscape = window.innerWidth >= 768 && window.innerHeight <= 600;
      setIsMobileLandscape(isLandscape);
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsCover(h > 0 && w > 0 && (h / w < 1.5));
      if (!isLandscape) {
        setLandscapeSidebarHidden(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mobile Status Bar Updater (Time & Battery)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setStatusBarTime(`${hours}:${minutes}`);
    };
    updateTime();
    const timeInterval = setInterval(updateTime, 10000);

    if (navigator.getBattery) {
      navigator.getBattery().then((battery) => {
        const updateBattery = () => {
          setBatteryLevel(Math.round(battery.level * 100));
          setIsCharging(battery.charging);
        };
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
        battery.addEventListener('chargingchange', updateBattery);
      });
    }

    return () => {
      clearInterval(timeInterval);
    };
  }, []);

  // Mobile portrait fullscreen auto-request on user interaction (DISABLED to keep native status bar visible)
  useEffect(() => {
    // Fullscreen request is disabled so that the mobile device's native system status bar is not hidden.
  }, []);



  // Mobile Back Button Interception logic to prevent accidental exit and close modals instead
  const activeModalRef = useRef(null);
  const wasModalOpenRef = useRef(false);
  const ignoreNextPopState = useRef(false);

  useEffect(() => {
    const isMobileDevice = window.innerWidth < 768;

    if (selectedTopic) {
      activeModalRef.current = 'review';
    } else if (showExam) {
      activeModalRef.current = 'exam';
    } else if (showFormulaExam) {
      activeModalRef.current = 'formula';
    } else if (showTheoryExam) {
      activeModalRef.current = 'theory';
    } else if (showAnswerSheet) {
      activeModalRef.current = 'answersheet';
    } else {
      activeModalRef.current = null;
    }

    const isCurrentlyOpen = activeModalRef.current !== null;

    if (isMobileDevice) {
      if (isCurrentlyOpen && !wasModalOpenRef.current) {
        // 모달이 닫혀있다가 처음 열리는 시점 -> history push
        window.history.pushState({ home: true, modalOpen: true }, "");
        console.log("[History] Push state for modal open");
      } else if (!isCurrentlyOpen && wasModalOpenRef.current) {
        // 모달이 열려있다가 UI 닫기 버튼 등으로 닫히는 시점 -> 히스토리 백을 해줘서 push된 모달 히스토리를 꺼냄
        const state = window.history.state;
        if (state && state.modalOpen) {
          ignoreNextPopState.current = true;
          window.history.back();
          console.log("[History] Back triggered for modal close via UI button");
        }
      }
    }
    
    wasModalOpenRef.current = isCurrentlyOpen;
  }, [selectedTopic, showExam, showFormulaExam, showTheoryExam, showAnswerSheet]);

  useEffect(() => {
    const handlePopState = (event) => {
      const isMobileDevice = window.innerWidth < 768;
      if (!isMobileDevice) return;

      if (ignoreNextPopState.current) {
        ignoreNextPopState.current = false;
        console.log("[History] Ignored popstate event because it was triggered by UI close");
        return;
      }

      if (activeModalRef.current) {
        // 뒤로가기를 눌러서 모달이 닫히는 경우
        if (activeModalRef.current === 'review') {
          forceSaveActiveSessions();
          setSelectedTopic(null);
        } else if (activeModalRef.current === 'exam') {
          forceSaveActiveSessions();
          setShowExam(false);
          localStorage.setItem('anti_show_exam', 'false');
        } else if (activeModalRef.current === 'formula') {
          setShowFormulaExam(false);
          localStorage.setItem('anti_show_formula_exam', 'false');
        } else if (activeModalRef.current === 'theory') {
          setShowTheoryExam(false);
          localStorage.setItem('anti_show_theory_exam', 'false');
        } else if (activeModalRef.current === 'answersheet') {
          setShowAnswerSheet(false);
          localStorage.setItem('anti_show_answersheet', 'false');
        }
        console.log("[History] Back button pressed, closed modal: " + activeModalRef.current);
      } else {
        // 메인 화면에서 뒤로가기 누른 경우 앱 종료 여부 팝업 출력
        if (window.confirm("앱을 끄시겠습니까?")) {
          window.close();
          window.location.href = "about:blank";
        } else {
          // 취소 시 다시 home 방어막 형성
          window.history.pushState({ home: true }, "");
        }
      }
    };

    // Push initial dummy state to block the first back exit
    window.history.pushState({ home: true }, "");
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Disable body scroll when any full-screen modal is open to eliminate the redundant far-right browser scrollbar on PC
  useEffect(() => {
    const isModalOpen = !!(selectedTopic || showExam || showFormulaExam || showTheoryExam || showAnswerSheet);
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.classList.add('modal-open');
    } else {
      document.body.style.overflow = '';
      document.documentElement.classList.remove('modal-open');
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.classList.remove('modal-open');
    };
  }, [selectedTopic, showExam, showFormulaExam, showTheoryExam, showAnswerSheet]);
  
  // Drag Resizable Splitter State and Event Handlers
  const [reviewSplitRatio, setReviewSplitRatio] = useState(60);
  const [examSplitRatio, setExamSplitRatio] = useState(60);

  const startReviewResize = (e) => {
    e.preventDefault();
    const startX = e.clientX || (e.touches && e.touches[0].clientX);
    const containerWidth = reviewSplitContainerRef.current?.clientWidth || 1000;
    const startRatio = reviewSplitRatio;

    const doResize = (moveEvent) => {
      const currentX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
      const deltaX = currentX - startX;
      const deltaRatio = (deltaX / containerWidth) * 100;
      const newRatio = Math.max(30, Math.min(80, startRatio + deltaRatio));
      setReviewSplitRatio(newRatio);
    };

    const stopResize = () => {
      window.removeEventListener('mousemove', doResize);
      window.removeEventListener('mouseup', stopResize);
      window.removeEventListener('touchmove', doResize);
      window.removeEventListener('touchend', stopResize);
    };

    window.addEventListener('mousemove', doResize);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchmove', doResize, { passive: false });
    window.addEventListener('touchend', stopResize);
  };

  const startExamResize = (e) => {
    e.preventDefault();
    const startX = e.clientX || (e.touches && e.touches[0].clientX);
    const containerWidth = examSplitContainerRef.current?.clientWidth || 1000;
    const startRatio = examSplitRatio;

    const doResize = (moveEvent) => {
      const currentX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
      const deltaX = currentX - startX;
      const deltaRatio = (deltaX / containerWidth) * 100;
      const newRatio = Math.max(30, Math.min(80, startRatio + deltaRatio));
      setExamSplitRatio(newRatio);
    };

    const stopResize = () => {
      window.removeEventListener('mousemove', doResize);
      window.removeEventListener('mouseup', stopResize);
      window.removeEventListener('touchmove', doResize);
      window.removeEventListener('touchend', stopResize);
    };

    window.addEventListener('mousemove', doResize);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchmove', doResize, { passive: false });
    window.addEventListener('touchend', stopResize);
  };
  
  // Theory questions states (independent of formulas)
  const theoryQuestions = [];
  const setTheoryQuestions = () => {};
  const loadingTheory = false;
  const setLoadingTheory = () => {};
  const theoryRevealed = {};
  const setTheoryRevealed = () => {};
  const theorySearchQuery = "";
  const setTheorySearchQuery = () => {};
  const refreshingTheoryIdx = null;
  const setRefreshingTheoryIdx = () => {};
  const uploadingTheoryPdf = false;
  const setUploadingTheoryPdf = () => {};

  // Theory inline editing states
  const editingTheoryIdx = null;
  const setEditingTheoryIdx = () => {};
  const editTheoryTitle = "";
  const setEditTheoryTitle = () => {};
  const editTheoryConcept = "";
  const setEditTheoryConcept = () => {};
  const editTheoryAssumptions = "";
  const setEditTheoryAssumptions = () => {};
  const editTheoryFormula = "";
  const setEditTheoryFormula = () => {};
  const theoryInputRevealed = {};
  const setTheoryInputRevealed = () => {};
  const [formulaInputRevealed, setFormulaInputRevealed] = useState({});
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBodyRef = useRef(null);
  const [attachedImage, setAttachedImage] = useState(null); // { name, mimeType, data }
  const [resetConfirmTarget, setResetConfirmTarget] = useState(null); // { scheduleId, topicTitle, round }
  const [showFullReport, setShowFullReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportViewType, setReportViewType] = useState('pdf'); // 'pdf' or 'image'
  const [pdfjsLoaded, setPdfjsLoaded] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const firstMatchRef = useRef(null);
  const lastQuizTopicId = useRef(null); // 마지막으로 로드한 퀴즈 토픽 ID (닫기 후 재열 감지용)
  const quizBodyRef = useRef(null);     // 퀴즈 패널 스크롤 컨테이너
  const savedQuizScroll = useRef(0);    // 퀴즈 패널 저장된 스크롤 위치
  const examBodyRef = useRef(null);     // 종합평가 패널 스크롤 컨테이너
  const savedExamScroll = useRef(0);    // 종합평가 패널 저장된 스크롤 위치

  // Latest values refs to prevent stale closure bugs in modal headers
  const latestTheoryQuestionsRef = { current: [] };

  const latestFormulaQuestionsRef = useRef(formulaQuestions);
  useEffect(() => {
    latestFormulaQuestionsRef.current = formulaQuestions;
  }, [formulaQuestions]);

  // Success Notification banner
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

    // Fetch reviews based on selected reference date
  const fetchTodayReviews = async (dateStr) => {
    setLoadingReviews(true);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard?date=${dateStr}`);
      const data = await res.json();
      if (res.ok && data && Array.isArray(data.reviews)) {
        // 동일 토픽 중복 일정 방어 (중복 시 가장 낮은 review_round 일정 하나만 프론트에서도 유지)
        const uniqueMap = new Map();
        for (const r of data.reviews) {
          const existing = uniqueMap.get(r.topic_id);
          if (!existing || r.review_round < existing.review_round) {
            uniqueMap.set(r.topic_id, r);
          }
        }
        const uniqueList = Array.from(uniqueMap.values());
        uniqueList.sort((a, b) => {
          const dateA = a.planned_date || '';
          const dateB = b.planned_date || '';
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          return (a.review_round || 0) - (b.review_round || 0);
        });
        setTodayReviews(uniqueList);
        if (data && Array.isArray(data.completedTopicIds)) {
          setCompletedTopicIds(data.completedTopicIds);
        } else {
          setCompletedTopicIds([]);
        }
      } else {
        setTodayReviews([]);
        setCompletedTopicIds([]);
        console.error('Failed to load dashboard or invalid data format:', data);
      }
    } catch (err) {
      setTodayReviews([]);
      setCompletedTopicIds([]);
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  // Fetch all question feedbacks
  const fetchAllFeedback = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/question-feedback/all`);
      const data = await res.json();
      if (res.ok && data.success) {
        const feedbackMap = {};
        data.feedback.forEach(f => {
          feedbackMap[`${f.topic_id}_${f.question_text.trim()}`] = f.feedback_type;
        });
        setQuestionFeedback(feedbackMap);
      }
    } catch (err) {
      console.warn('피드백 데이터를 로드하는 중 오류가 발생했습니다:', err);
    }
  };

  // Toggle upvote/downvote for a question
  const handleToggleFeedback = async (topicId, questionText, type) => {
    if (!topicId) {
      showNotification('토픽 정보를 식별할 수 없어 피드백을 반영하지 못했습니다.', 'warning');
      return;
    }
    const trimmedQ = questionText.trim();
    const key = `${topicId}_${trimmedQ}`;
    const current = questionFeedback[key];
    const newFeedbackType = current === type ? 'none' : type;

    // Optimistically update UI
    setQuestionFeedback(prev => {
      const updated = { ...prev };
      if (newFeedbackType === 'none') {
        delete updated[key];
      } else {
        updated[key] = newFeedbackType;
      }
      return updated;
    });

    try {
      const res = await fetch(`${API_BASE}/api/topics/${topicId}/question-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_text: trimmedQ, feedback_type: newFeedbackType })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        // Rollback on failure
        setQuestionFeedback(prev => {
          const rolledBack = { ...prev };
          if (current) {
            rolledBack[key] = current;
          } else {
            delete rolledBack[key];
          }
          return rolledBack;
        });
        showNotification('피드백 저장에 실패했습니다.', 'error');
      } else {
        if (newFeedbackType === 'upvote') {
          showNotification('해당 문제의 출제 추천 피드백을 반영했습니다. (출제 빈도 증가)', 'success');
        } else if (newFeedbackType === 'downvote') {
          showNotification('해당 문제의 출제 비추천 피드백을 반영했습니다. (출제 빈도 감소)', 'info');
        } else {
          showNotification('피드백을 해제했습니다.', 'info');
        }
      }
    } catch (err) {
      console.error('피드백 연동 중 오류 발생:', err);
      // Rollback
      setQuestionFeedback(prev => {
        const rolledBack = { ...prev };
        if (current) {
          rolledBack[key] = current;
        } else {
          delete rolledBack[key];
        }
        return rolledBack;
      });
      showNotification('서버 통신 오류로 피드백을 반영하지 못했습니다.', 'error');
    }
  };

  // Fetch all registered topics
  const fetchAllTopics = async () => {
    setLoadingTopics(true);
    try {
      const res = await fetch(`${API_BASE}/api/topics`);
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setAllTopics(data);
      } else {
        setAllTopics([]);
        console.error('Failed to load topics or invalid format:', data);
      }
    } catch (err) {
      setAllTopics([]);
      console.error('Error fetching topics:', err);
    } finally {
      setLoadingTopics(false);
    }
  };

  // Load initial data
  useEffect(() => {
    fetchTodayReviews(referenceDate);
    fetchAllTopics();
    fetchAllFeedback();
  }, [referenceDate]);

  // ── Restore state from localStorage on mount (껐다 켜도 이어서 보기)
  useEffect(() => {
    // 1) localStorage → 탭/뷰 모드 등 비-종합평가 상태 복원
    try {
      const saved = localStorage.getItem('anti_app_state');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.viewMode) {
          setViewMode(s.viewMode);
        }
        if (s.selectedTopic) setSelectedTopic(s.selectedTopic);
        if (s.aiQuestions?.length) setAiQuestions(s.aiQuestions);
        if (s.revealedQuestions) setRevealedQuestions(s.revealedQuestions);
        if (s.selectedAnswers) setSelectedAnswers(s.selectedAnswers);
        if (s.openSections) setOpenSections(s.openSections);
        if (s.isFallback !== undefined) setIsFallback(s.isFallback);
        if (s.chatHistory) setChatHistory(s.chatHistory);
        if (s.tableAnswers) setTableAnswers(s.tableAnswers);
        // 종합평가 상태는 서버에서 덮어씀 (아래)
        if (s.examTopic) setExamTopic(s.examTopic);
        if (s.examQuestions?.length) setExamQuestions(s.examQuestions);
        if (s.examRevealed) setExamRevealed(s.examRevealed);
        if (s.examAnswers) setExamAnswers(s.examAnswers);
      }
    } catch (e) {
      console.warn('localStorage 복원 실패:', e);
    }

    // 2) 서버 → 종합평가 세션 복원 (기기 간 공유 우선)
    fetch(`${API_BASE}/api/session/exam?t=${Date.now()}`)
      .then(r => r.json())
      .then(({ data }) => {
        if (data?.examQuestions?.length) {
          setExamQuestions(data.examQuestions);
          if (data.examRevealed) setExamRevealed(data.examRevealed);
          if (data.examAnswers) setExamAnswers(data.examAnswers);
          if (data.examTopic) setExamTopic(data.examTopic);
          if (data.tableAnswers) setTableAnswers(data.tableAnswers);
          if (data.savedExamScroll) savedExamScroll.current = data.savedExamScroll;
          requestAnimationFrame(() => {
            if (examBodyRef.current) examBodyRef.current.scrollTop = savedExamScroll.current;
          });
        } else {
          // 서버 세션에 데이터가 없더라도, 로컬스토리지 복원을 통해 이미 메모리에 로드된 종합평가 문제가 있다면 유지
          setExamQuestions(prev => {
            if (prev && prev.length > 0) return prev;
            setShowExam(false);
            return prev;
          });
        }
      })
      .catch(e => {
        console.warn('서버 세션 복원 실패:', e);
        // 서버 요청 오류 시에도 로컬스토리지 복원된 종합평가가 있다면 유지
        setExamQuestions(prev => {
          if (prev && prev.length > 0) return prev;
          setShowExam(false);
          return prev;
        });
      })
      .finally(() => {
        setLoadingExam(false);
      });
  }, []); // mount 시 1회만

  // ── Save state to localStorage whenever key state changes
  useEffect(() => {
    try {
      localStorage.setItem('anti_app_state', JSON.stringify({
        viewMode,
        selectedTopic,
        aiQuestions,
        revealedQuestions,
        selectedAnswers,
        openSections,
        isFallback,
        showExam,
        examTopic,
        examQuestions,
        examRevealed,
        examAnswers,
        tableAnswers,
        chatHistory,
      }));
    } catch (e) {
      console.warn('localStorage 저장 실패:', e);
    }
  }, [viewMode, selectedTopic, aiQuestions, revealedQuestions, selectedAnswers, openSections, isFallback, showExam, examTopic, examQuestions, examRevealed, examAnswers, tableAnswers, chatHistory]);

  // ── Sync current topic's review progress (revealed subjective questions, chosen options) to topic-specific localStorage
  useEffect(() => {
    if (selectedTopic && selectedTopic.id) {
      if (Object.keys(revealedQuestions).length > 0 || Object.keys(selectedAnswers).length > 0 || Object.keys(tableAnswers).length > 0) {
        try {
          const key = selectedTopic.schedule_id 
            ? `anti_review_progress_sched_${selectedTopic.schedule_id}`
            : `anti_review_progress_${selectedTopic.id}`;
          localStorage.setItem(key, JSON.stringify({
            revealedQuestions,
            selectedAnswers,
            tableAnswers
          }));
        } catch (e) {
          console.warn('localStorage 복습 진행률 저장 실패:', e);
        }
      }
    }
  }, [selectedTopic, revealedQuestions, selectedAnswers, tableAnswers]);

  // ── Auto-sync Comprehensive Exam state to server on changes (for multi-device real-time link)
  useEffect(() => {
    if (examQuestions.length > 0 && !loadingExam) {
      const delayDebounceFn = setTimeout(() => {
        fetch(`${API_BASE}/api/session/exam`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            examQuestions,
            examRevealed,
            examAnswers,
            examTopic,
            tableAnswers,
            savedExamScroll: examBodyRef.current?.scrollTop || 0
          })
        }).catch(e => console.warn('종합평가 세션 자동 동기화 실패:', e));
      }, 1000); // 1.0-second debounce to prevent spamming server on rapid clicks

      return () => clearTimeout(delayDebounceFn);
    }
  }, [examQuestions, examRevealed, examAnswers, examTopic, tableAnswers]);

  const forceSaveActiveSessions = () => {
    // 1) Save active review session immediately
    if (selectedTopic && selectedTopic.id && aiQuestions.length > 0 && !selectedTopic.isReadOnly) {
      console.log('[forceSaveActiveSessions] Immediately saving active review session');
      fetch(`${API_BASE}/api/session/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: selectedTopic.id,
          scheduleId: selectedTopic.schedule_id,
          questions: aiQuestions,
          selectedAnswers,
          revealedQuestions,
          tableAnswers,
          savedQuizScroll: quizBodyRef.current?.scrollTop || 0
        })
      }).catch(e => console.warn('복습 세션 긴급 동기화 실패:', e));
    }

    // 2) Save active exam session immediately
    if (examQuestions.length > 0 && !loadingExam) {
      console.log('[forceSaveActiveSessions] Immediately saving active exam session');
      fetch(`${API_BASE}/api/session/exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examQuestions,
          examRevealed,
          examAnswers,
          examTopic,
          tableAnswers,
          savedExamScroll: examBodyRef.current?.scrollTop || 0
        })
      }).catch(e => console.warn('종합평가 세션 긴급 동기화 실패:', e));
    }
  };

  // ── Auto-save active sessions when leaving/reloading the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      forceSaveActiveSessions();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [selectedTopic, aiQuestions, selectedAnswers, revealedQuestions, examQuestions, examRevealed, examAnswers, examTopic, tableAnswers]);

  // ── Auto-sync Review Quiz state to server on changes
  useEffect(() => {
    if (selectedTopic && selectedTopic.id && aiQuestions.length > 0 && !selectedTopic.isReadOnly) {
      const delayDebounceFn = setTimeout(() => {
        fetch(`${API_BASE}/api/session/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicId: selectedTopic.id,
            scheduleId: selectedTopic.schedule_id,
            questions: aiQuestions,
            selectedAnswers,
            revealedQuestions,
            tableAnswers,
            savedQuizScroll: quizBodyRef.current?.scrollTop || 0
          })
        }).catch(e => console.warn('복습 세션 자동 동기화 실패:', e));
      }, 1000); // 1.0-second debounce

      return () => clearTimeout(delayDebounceFn);
    }
  }, [selectedTopic, aiQuestions, selectedAnswers, revealedQuestions, tableAnswers]);

  const getCurrentTabIndex = () => {
    if (showAnswerSheet) return 3;
    if (showTheoryExam) return 2;
    if (showFormulaExam) return 1;
    return 0; // dashboard
  };

  const navigateToTabByIndex = (index) => {
    forceSaveActiveSessions();
    if (index === 0) {
      setShowFormulaExam(false);
      setShowTheoryExam(false);
      setShowAnswerSheet(false);
      setViewMode('dashboard');
    } else if (index === 1) {
      setShowFormulaExam(true);
      setShowTheoryExam(false);
      setShowAnswerSheet(false);
    } else if (index === 2) {
      setShowFormulaExam(false);
      setShowTheoryExam(true);
      setShowAnswerSheet(false);
    } else if (index === 3) {
      setShowFormulaExam(false);
      setShowTheoryExam(false);
      setShowAnswerSheet(true);
    }
  };

  // Handle swipe gestures for mobile portrait view navigation
  const globalTouchStartX = useRef(0);
  const globalTouchStartY = useRef(0);

  useEffect(() => {
    const handleTouchStart = (e) => {
      // Only track in mobile portrait and when no quiz/exam modals are open, and not in 'all_topics' view
      if (!isDesktop && !isMobileLandscape && !selectedTopic && !showExam && !showFormulaExam && !showTheoryExam && !showAnswerSheet && viewMode !== 'all_topics') {
        globalTouchStartX.current = e.touches[0].clientX;
        globalTouchStartY.current = e.touches[0].clientY;
      }
    };

    const handleTouchEnd = (e) => {
      if (!isDesktop && !isMobileLandscape && !selectedTopic && !showExam && !showFormulaExam && !showTheoryExam && !showAnswerSheet && viewMode !== 'all_topics') {
        // Exclude inputs, textareas, etc.
        const target = e.target;
        if (target && target.closest('input, textarea, [contenteditable="true"], button, a, select')) {
          return;
        }

        const deltaX = e.changedTouches[0].clientX - globalTouchStartX.current;
        const deltaY = e.changedTouches[0].clientY - globalTouchStartY.current;

        // If swipe horizontal delta is high and vertical is low
        if (Math.abs(deltaX) > 80 && Math.abs(deltaY) < 40) {
          const currentIndex = getCurrentTabIndex();
          
          // Swipe on today's dashboard tab with active review session -> Open the active review
          if (viewMode === 'dashboard' && !showFormulaExam && !showTheoryExam && !showAnswerSheet && lastActiveReview) {
            handleOpenLastActiveReview();
            return;
          }

          if (deltaX < 0) {
            // Swipe Left -> Go Next Tab (Index increases, loops to 0 at 3)
            const nextIndex = (currentIndex + 1) % 4;
            navigateToTabByIndex(nextIndex);
          } else {
            // Swipe Right -> Go Prev Tab (Index decreases, loops to 3 at 0)
            const prevIndex = (currentIndex - 1 + 4) % 4;
            navigateToTabByIndex(prevIndex);
          }
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [viewMode, showFormulaExam, showTheoryExam, showAnswerSheet, selectedTopic, showExam, isDesktop, isMobileLandscape, lastActiveReview]);


  // Load PDF.js dynamically when switching to image view
  useEffect(() => {
    if (showFullReport && reportViewType === 'image' && !pdfjsLoaded) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        setPdfjsLoaded(true);
      };
      document.head.appendChild(script);
    }
  }, [showFullReport, reportViewType, pdfjsLoaded]);

  // Auto-scroll and focus on the first search match in grid tracker
  useEffect(() => {
    if (searchQuery && firstMatchRef.current) {
      firstMatchRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      firstMatchRef.current.focus();
    }
  }, [searchQuery]);

  // Form Submit (Uses the UI referenceDate as baseDate to maintain perfect study session alignment)
  const handleRegisterTopic = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      showNotification('토픽 제목을 입력해 주세요.', 'error');
      return;
    }

    setSubmitLoading(true);
    const formData = new FormData();
    formData.append('title', title);
    formData.append('keywords', keywords);
    formData.append('baseDate', referenceDate); // Fixes midnight timezone shifts
    
    let fileToUpload = pdfFile;
    const htmlVal = htmlTextareaRef.current ? htmlTextareaRef.current.value : '';
    if (htmlVal.trim()) {
      const blob = new Blob([htmlVal], { type: 'text/html' });
      fileToUpload = new window.File([blob], `${title.trim()}.html`, { type: 'text/html' });
    }

    if (fileToUpload) {
      formData.append('pdf', fileToUpload);
      formData.append('fileNameUtf8', fileToUpload.name);
    }

    try {
      const res = await fetch(`${API_BASE}/api/topics`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        showNotification('새로운 토픽 등록 및 1회차 복습 스케줄 생성이 완료되었습니다!');
        
        // 공부 토픽 등록 성공 시 업로드한 파일이 있으면 답안지에도 자동 업로드/AI 분석 수행
        if (fileToUpload) {
          handleUploadAnswersheetPdf(fileToUpload);
        }

        setTitle('');
        setKeywords('');
        setPdfFile(null);
        autoExtractedTitleRef.current = '';
        if (htmlTextareaRef.current) htmlTextareaRef.current.value = '';
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        // Refresh
        fetchTodayReviews(referenceDate);
        fetchAllTopics();
      } else {
        showNotification(data.error || '토픽 등록에 실패했습니다.', 'error');
      }
    } catch (err) {
      console.error('Registration error:', err);
      showNotification('서버 통신 오류로 등록에 실패했습니다.', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Mark specific schedule round as complete
  const handleCompleteReview = async (scheduleId, topicTitle, round, isBonus = false, topicId = null) => {
    if (isBonus && topicId) {
      try {
        const res = await fetch(`${API_BASE}/api/schedules/bonus/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicId, scheduleId })
        });
        if (res.ok) {
          setHiddenBonusTopicIds(prev => [...prev, topicId]);
          showNotification(`[${topicTitle}] 약점극복 복습 완료 처리가 완료되었습니다!`);
          fetchTodayReviews(referenceDate);
          fetchAllTopics();
        } else {
          showNotification('약점극복 복습 완료 처리에 실패했습니다.', 'error');
        }
      } catch (e) {
        console.warn('보너스 완료 이력 기록 실패:', e);
        showNotification('서버 오류로 약점극복 복습 완료 처리에 실패했습니다.', 'error');
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/schedules/${scheduleId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceDate })
      });
      const data = await res.json();

      if (res.ok) {
        showNotification(`[${topicTitle}] ${round}회차 복습 완료 처리가 완료되었습니다!`);
        fetchTodayReviews(referenceDate);
        fetchAllTopics();
      } else {
        showNotification(data.error || '복습 완료 처리에 실패했습니다.', 'error');
      }
    } catch (err) {
      console.error('Review completion error:', err);
      showNotification('서버 오류로 완료 처리에 실패했습니다.', 'error');
    }
  };

  // AI 복습 완료 버튼 클릭 시 처리
  const handleQuizCompleteClick = async () => {
    if (!selectedTopic) return;
    
    let sId = selectedTopic.schedule_id;
    let sRound = selectedTopic.review_round;

    // 만약 schedule_id가 없을 경우, 오늘 대기 중인 복습 일정 중에 매칭되는 것이 있는지 탐색
    if (!sId && todayReviews.length > 0) {
      const matchingReview = todayReviews.find(
        (r) => r.topic_id === selectedTopic.id && r.status !== 'completed'
      );
      if (matchingReview) {
        sId = matchingReview.schedule_id;
        sRound = matchingReview.review_round;
      }
    }

    // 객관식 정답률(점수) 정밀 채점
    const totalMC = aiQuestions.filter(q => q.options?.length > 0).length;
    const correctMC = Object.keys(selectedAnswers).filter(
      (i) => selectedAnswers[i] === aiQuestions[parseInt(i)]?.answer
    ).length;
    const scoreMC = totalMC > 0 ? Math.round((correctMC / totalMC) * 100) : null;

    // 서버의 복습 세션 캐싱 문제 초기화 (완료되었으므로 캐시 삭제)
    if (selectedTopic.id) {
      const deleteUrl = sId 
        ? `${API_BASE}/api/session/review/topic/${selectedTopic.id}?scheduleId=${sId}`
        : `${API_BASE}/api/session/review/topic/${selectedTopic.id}`;
      fetch(deleteUrl, { method: 'DELETE' })
        .catch(e => console.warn('복습 완료 시 세션 리셋 실패:', e));
      
      const progressKey = selectedTopic.schedule_id 
        ? `anti_review_progress_sched_${selectedTopic.schedule_id}`
        : `anti_review_progress_${selectedTopic.id}`;
      localStorage.removeItem(progressKey); // 복습 완료 시 로컬 진행률 초기화
    }

    try {
      // 퀴즈 결과 및 채점된 점수를 서버로 전송 (영구 보존 및 약점 극복 조건 탈출)
      const res = await fetch(`${API_BASE}/api/quiz/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: sId || 9999,
          topic_id: selectedTopic.id,
          total: totalMC,
          correctCount: correctMC,
          score: scoreMC,
          isPassed: true,
          isBonus: !!selectedTopic.isBonus,
          questions: aiQuestions,
          selectedAnswers: selectedAnswers,
          revealedQuestions: revealedQuestions,
          referenceDate: referenceDate
        })
      });
      const data = await res.json();

      if (res.ok) {
        if (selectedTopic.isBonus) {
          // 약점 보완 추천은 즉시 클라이언트 숨김 처리
          setHiddenBonusTopicIds(prev => [...prev, selectedTopic.id]);
          showNotification(`[${selectedTopic.title}] 약점극복 복습이 완료되어 성적이 ${scoreMC}점으로 업데이트되었습니다!`, 'success');
        } else {
          showNotification(`[${selectedTopic.title}] ${sRound}회차 복습 완료 및 성적이 ${scoreMC}점으로 업데이트되었습니다!`, 'success');
        }
        
        // 목록 갱신
        fetchTodayReviews(referenceDate);
        fetchAllTopics();
      } else {
        // 백엔드 점수 업데이트 실패 시에도 약점보완 강제완료 처리 지원 (UX 복원용)
        if (selectedTopic.isBonus) {
          setHiddenBonusTopicIds(prev => [...prev, selectedTopic.id]);
          showNotification(`[${selectedTopic.title}] 약점극복 복습 완료 처리가 완료되었습니다!`);
        } else {
          showNotification(data.error || '복습 완료 성적 갱신에 실패했습니다.', 'error');
        }
      }
    } catch (err) {
      console.error('Quiz submit error:', err);
      if (selectedTopic.isBonus) {
        setHiddenBonusTopicIds(prev => [...prev, selectedTopic.id]);
        showNotification(`[${selectedTopic.title}] 약점극복 복습 완료 처리가 완료되었습니다!`);
      } else {
        showNotification('서버 오류로 퀴즈 완료 성적 처리에 실패했습니다.', 'error');
      }
    } finally {
      // 모달 닫기 및 상태 전면 리셋
      setSelectedTopic(null);
      setAiQuestions([]);
      setRevealedQuestions({});
      setSelectedAnswers({});
      setOpenSections({});
      setReviewOptionExplanations({});
      lastQuizTopicId.current = null;
    }
  };

  // 약점 보완 추천 토픽 수동 추가 요청 핸들러
  const handleRequestWeakPoints = async () => {
    setLoadingWeakPoints(true);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/weak-points?date=${referenceDate}`);
      const data = await res.json();
      if (data.weakPoints && data.weakPoints.length > 0) {
        // 이미 todayReviews에 존재하는 topic_id가 있는지 걸러내고 병합
        setTodayReviews(prev => {
          const existingIds = new Set(prev.map(r => r.topic_id));
          const newPoints = data.weakPoints.filter(w => !existingIds.has(w.topic_id));
          if (newPoints.length === 0) {
            showNotification('이미 모든 약점 보완 토픽이 복습 목록에 추가되어 있습니다.', 'info');
            return prev;
          }
          
          // 새로 추가되는 약점 추천 토픽은 숨김(hiddenBonusTopicIds) 목록에서 제외시켜 화면에 즉시 렌더링되도록 함
          const newTopicIds = newPoints.map(w => w.topic_id);
          setHiddenBonusTopicIds(prevHidden => prevHidden.filter(id => !newTopicIds.includes(id)));

          showNotification(`약점 보완 추천 토픽 ${newPoints.length}개가 오늘의 복습 목록에 성공적으로 추가되었습니다!`, 'success');
          const merged = [...newPoints, ...prev];
          merged.sort((a, b) => {
            const dateA = a.planned_date || '';
            const dateB = b.planned_date || '';
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return (a.review_round || 0) - (b.review_round || 0);
          });
          return merged;
        });
      } else {
        showNotification(data.message || '추천 가능한 새로운 약점 토픽이 없습니다.', 'info');
      }
    } catch (err) {
      console.error('Weak points fetch error:', err);
      showNotification('서버 통신 오류로 약점 토픽을 가져오지 못했습니다.', 'error');
    } finally {
      setLoadingWeakPoints(false);
    }
  };

  // Reset completed schedule back to pending
  const handleResetReview = async (scheduleId, topicTitle, round) => {
    try {
      const res = await fetch(`${API_BASE}/api/schedules/${scheduleId}/reset`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok) {
        showNotification(`[${topicTitle}] ${round}회차 복습이 대기 상태로 변경되었으며 오늘의 복습 목록에 다시 추가되었습니다.`);
        fetchTodayReviews(referenceDate);
        fetchAllTopics();
      } else {
        showNotification(data.error || '복습 상태 초기화에 실패했습니다.', 'error');
      }
    } catch (err) {
      console.error('Review reset error:', err);
      showNotification('서버 오류로 초기화 처리에 실패했습니다.', 'error');
    } finally {
      setResetConfirmTarget(null);
    }
  };

  // 특정 완료 복습 회차 클릭 시, 이전 풀이 기록(풀었던 문제, 마크한 정답, 유도과정 열람)을 기기 간 복구하여 조회 전용으로 시각화
  const handleOpenCompletedReview = async (scheduleId, topicId, topicTitle, round, keywords = '', pdfName = '') => {
    const activeInfo = {
      topicId,
      title: topicTitle,
      keywords,
      pdfName,
      mode: 'completed',
      scheduleId,
      reviewRound: round,
      isReadOnly: true
    };
    localStorage.setItem('anti_last_active_review', JSON.stringify(activeInfo));
    setLastActiveReview(activeInfo);

    setShowAnswerSheet(false);
    setReviewMobileTab('list');
    requestAnimationFrame(() => {
      if (reviewSplitContainerRef.current) reviewSplitContainerRef.current.scrollLeft = 0;
    });

    setLoadingAI(true);
    setSelectedTopic({ 
      id: topicId, 
      title: topicTitle, 
      keywords,
      pdf_name: pdfName,
      schedule_id: scheduleId, 
      review_round: round, 
      isReadOnly: true 
    });
    setAiQuestions([]);
    setRevealedQuestions({});
    setSelectedAnswers({});
    setReviewOptionExplanations({});
    setIsFallback(false);
    setAiError('');
    setShowFullReport(false);
    setReportText('');
    setChatHistory([]);

    try {
      const res = await fetch(`${API_BASE}/api/session/completed-review/${scheduleId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setAiQuestions(data.data.questions || []);
        setSelectedAnswers(data.data.selectedAnswers || {});
        setRevealedQuestions(data.data.revealedQuestions || {});
      } else {
        // [Fallback] 이전 데이터 기록이 존재하지 않는 경우 (업데이트 이전 항목 등), 실시간 API를 통해 가볍게 기출문제만 재조회
        showNotification(data.error || '이전 풀이 상세 기록이 존재하지 않아 새로 예상문제를 조회합니다.', 'info');
        const fbRes = await fetch(`${API_BASE}/api/topics/${topicId}/ai-questions`, { method: 'POST' });
        const fbData = await fbRes.json();
        if (fbRes.ok) {
          setAiQuestions(fbData.questions || []);
        } else {
          showNotification('해당 토픽의 예상문제를 로드하지 못했습니다.', 'error');
        }
      }
    } catch (err) {
      console.error('Load completed review error:', err);
      showNotification('통신 오류로 복습 풀이 기록을 가져오지 못했습니다.', 'error');
    } finally {
      setLoadingAI(false);
    }
  };

  // Long press or normal click helper for round badges in grid
  const createRoundBadgeHandlers = (schedId, topicId, topicTitle, round, keywords, pdfName) => {
    let pressTimer = null;
    let isLong = false;

    const start = (e) => {
      isLong = false;
      pressTimer = setTimeout(() => {
        isLong = true;
        if (window.confirm(`[${topicTitle}] ${round}회차 복습을 취소하고 대기 상태로 되돌리시겠습니까?`)) {
          handleResetReview(schedId, topicTitle, round);
        }
      }, 700);
    };

    const cancel = (e) => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    const click = (e) => {
      if (!isLong) {
        handleOpenCompletedReview(schedId, topicId, topicTitle, round, keywords, pdfName);
      }
    };

    return {
      onMouseDown: start,
      onTouchStart: start,
      onMouseUp: cancel,
      onTouchEnd: cancel,
      onMouseLeave: cancel,
      onClick: click
    };
  };

  // Delete specific Topic (includes prompt safety confirm)
  const handleDeleteTopic = async (topicId, topicTitle) => {
    if (!window.confirm(`[${topicTitle}] 토픽과 관련된 모든 4회차 복습 스케줄이 영구 삭제됩니다.\n정말 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/topics/${topicId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok) {
        showNotification(`토픽 [${topicTitle}]이 성공적으로 삭제되었습니다.`);
        // Refresh
        fetchTodayReviews(referenceDate);
        fetchAllTopics();
      } else {
        showNotification(data.error || '토픽 삭제에 실패했습니다.', 'error');
      }
    } catch (err) {
      console.error('Delete topic error:', err);
      showNotification('서버 오류로 토픽 삭제에 실패했습니다.', 'error');
    }
  };

  const handleSaveTopicTitle = async (topicId) => {
    if (!editingTitleText || !editingTitleText.trim()) {
      showNotification('제목은 비워둘 수 없습니다.', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/topics/${topicId}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingTitleText.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('토픽 제목이 수정되었습니다.', 'success');
        setEditingTopicId(null);
        // Refresh
        fetchTodayReviews(referenceDate);
        fetchAllTopics();
      } else {
        showNotification(data.error || '제목 수정에 실패했습니다.', 'error');
      }
    } catch (err) {
      console.error('Update topic title error:', err);
      showNotification('서버 통신 오류로 제목 수정에 실패했습니다.', 'error');
    }
  };

  const handleCopyReportToAnswersheet = async (topicId, topicTitle) => {
    if (!window.confirm(`[${topicTitle}] 토픽의 원보고서 보기를 답안지 탭에 추가하시겠습니까?`)) {
      return;
    }

    showNotification(`[${topicTitle}] 보고서를 답안지 탭에 연동 중...`, 'info');
    try {
      const res = await fetch(`${API_BASE}/api/session/answersheet/add-from-topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '답안지 탭 추가 실패');
      }

      const data = await res.json();
      const theories = data.theories || [];
      if (theories.length === 0) {
        throw new Error('답안지 문항을 생성하지 못했습니다.');
      }

      const currentQs = await loadAnswersheetQuestions();
      const newItems = theories.map(t => ({
        title: t.title,
        concept: t.concept || '연동된 원보고서입니다.',
        assumptions: t.assumptions || '',
        formula: t.formula || t.answer || '',
        answersheet_report_id: t.answersheet_report_id,
        pdf_name: t.pdf_name
      }));
      const updated = [...newItems, ...currentQs];
      latestAnswersheetQuestionsRef.current = updated;
      setAnswersheetQuestions(updated);
      await handleSaveAnswersheetQuestions(updated, false);

      showNotification(`[${topicTitle}] 원보고서가 성공적으로 연동되어 답안지 탭에 추가되었습니다!`, 'success');
    } catch (err) {
      console.error('Copy report to answersheet failed:', err);
      showNotification(err.message || '보고서 연동 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleOpenAIQuestions = async (topicId, title, keywords, pdfName, mode = 'ai', scheduleId = null, reviewRound = null, isBonus = false) => {
    setShowAnswerSheet(false);
    let finalScheduleId = scheduleId;
    let finalReviewRound = reviewRound;
    if (!finalScheduleId) {
      const topicObj = allTopics.find(t => t.id === topicId);
      if (topicObj && topicObj.schedules) {
        const pendingSched = topicObj.schedules.find(s => s.status === 'pending');
        if (pendingSched) {
          finalScheduleId = pendingSched.id;
          finalReviewRound = pendingSched.review_round;
        }
      }
    }

    const activeInfo = {
      topicId,
      title,
      keywords,
      pdfName,
      mode,
      scheduleId: finalScheduleId,
      reviewRound: finalReviewRound,
      isBonus
    };
    localStorage.setItem('anti_last_active_review', JSON.stringify(activeInfo));
    setLastActiveReview(activeInfo);

    console.log(`[handleOpenAIQuestions] Initiating review: topicId=${topicId}, title="${title}", keywords="${keywords}", pdfName="${pdfName}", mode=${mode}, scheduleId=${finalScheduleId}, reviewRound=${finalReviewRound}, isBonus=${isBonus}`);
    setReviewMobileTab('list');
    requestAnimationFrame(() => {
      if (reviewSplitContainerRef.current) reviewSplitContainerRef.current.scrollLeft = 0;
    });
    // 같은 토픽의 문제가 이미 있으면 (닫기 후 재열) → 바로 열기
    if (lastQuizTopicId.current === topicId && aiQuestions.length > 0 && selectedTopic?.schedule_id === finalScheduleId) {
      console.log(`[handleOpenAIQuestions] Memory Hit! Reopening cached questions in memory for topicId=${topicId}`);
      setSelectedTopic({ id: topicId, title, keywords, pdf_name: pdfName, schedule_id: finalScheduleId, review_round: finalReviewRound, isBonus });
      // 이전 스크롤 위치 복원
      requestAnimationFrame(() => {
        if (quizBodyRef.current) quizBodyRef.current.scrollTop = savedQuizScroll.current;
      });
      return;
    }
    setSelectedTopic({ id: topicId, title, keywords, pdf_name: pdfName, schedule_id: finalScheduleId, review_round: finalReviewRound, isBonus });
    setLoadingAI(true);
    setAiQuestions([]);
    setRevealedQuestions({}); // Reset revealed answers
    setSelectedAnswers({}); // Reset MC selected answers
    setReviewOptionExplanations({}); // Reset Option Explanations
    setIsFallback(false);
    setAiError('');
    setShowFullReport(false);
    setReportText('');
    setChatHistory([]);

    try {
      let url = `${API_BASE}/api/topics/${topicId}/ai-questions`;
      const queryParams = [];
      if (mode === 'local') queryParams.push('local=true');
      if (finalScheduleId) queryParams.push(`scheduleId=${finalScheduleId}`);
      if (queryParams.length > 0) {
        url += '?' + queryParams.join('&');
      }
      console.log(`[handleOpenAIQuestions] Fetching questions: URL=${url}`);
      const res = await fetch(url, { method: 'POST' });
      console.log(`[handleOpenAIQuestions] Response status: ${res.status} (${res.statusText})`);
      const data = await res.json();
      console.log(`[handleOpenAIQuestions] Parsed response data:`, data);

      if (res.ok) {
        setAiQuestions(data.questions || []);
        setIsFallback(!!data.isFallback);
        setAiError(data.error || '');
        lastQuizTopicId.current = topicId; // 로드 완료 후 기록
        
        // 특정 토픽의 복습 진행 상황(답안확인 표시 여부, 객관식 마크)을 복원
        if (data.isCached && (data.selectedAnswers || data.revealedQuestions || data.tableAnswers)) {
          setSelectedAnswers(data.selectedAnswers || {});
          setRevealedQuestions(data.revealedQuestions || {});
          setTableAnswers(data.tableAnswers || {});
          if (data.savedQuizScroll) {
            savedQuizScroll.current = data.savedQuizScroll;
            requestAnimationFrame(() => {
              if (quizBodyRef.current) quizBodyRef.current.scrollTop = savedQuizScroll.current;
            });
          }
        } else {
          let initialSelectedAnswers = {};
          let initialRevealedQuestions = {};
          try {
            const key = finalScheduleId 
              ? `anti_review_progress_sched_${finalScheduleId}`
              : `anti_review_progress_${topicId}`;
            const savedProgress = localStorage.getItem(key);
            if (savedProgress) {
              const parsed = JSON.parse(savedProgress);
              if (parsed.revealedQuestions) initialRevealedQuestions = parsed.revealedQuestions;
              if (parsed.selectedAnswers) initialSelectedAnswers = parsed.selectedAnswers;
              if (parsed.tableAnswers) setTableAnswers(parsed.tableAnswers);
              if (parsed.revealedQuestions) setRevealedQuestions(parsed.revealedQuestions);
              if (parsed.selectedAnswers) setSelectedAnswers(parsed.selectedAnswers);
            } else {
              setRevealedQuestions({});
              setSelectedAnswers({});
              setTableAnswers({});
            }
          } catch (e) {
            console.warn('복습 진행률 복원 실패:', e);
            setRevealedQuestions({});
            setSelectedAnswers({});
          }

          // 즉시 DB 저장
          fetch(`${API_BASE}/api/session/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topicId: topicId,
              scheduleId: finalScheduleId,
              questions: data.questions || [],
              selectedAnswers: initialSelectedAnswers,
              revealedQuestions: initialRevealedQuestions,
              savedQuizScroll: 0
            })
          }).catch(e => console.warn('신규 생성 복습 세션 즉시 저장 실패:', e));
        }
      } else {
        showNotification(data.error || 'AI 기출문제를 생성하지 못했습니다.', 'error');
      }
    } catch (err) {
      console.error('AI call error:', err);
      showNotification('서버 통신 오류로 AI 예상문제를 로드하지 못했습니다.', 'error');
      setAiError(err.message || '서버 통신 오류');
    } finally {
      setLoadingAI(false);
    }
  };

  const handleOpenLastActiveReview = () => {
    const saved = localStorage.getItem('anti_last_active_review');
    if (!saved) {
      showNotification('최근 진행 중이었던 복습 내역이 없습니다.', 'info');
      return;
    }
    try {
      const info = JSON.parse(saved);
      if (info.isReadOnly || info.mode === 'completed') {
        handleOpenCompletedReview(info.scheduleId, info.topicId, info.title, info.reviewRound, info.keywords, info.pdfName);
      } else {
        handleOpenAIQuestions(info.topicId, info.title, info.keywords, info.pdfName, info.mode || 'ai', info.scheduleId, info.reviewRound, info.isBonus);
      }
    } catch (err) {
      console.error('Error opening last active review:', err);
      showNotification('복습 내역을 불러오는 중 오류가 발생했습니다.', 'error');
    }
  };

  // ── Reset Single Multiple-Choice Answer (다시 풀기) ──────────────────
  const handleResetSingleReviewAnswer = (idx) => {
    setSelectedAnswers(prev => {
      const copy = { ...prev };
      delete copy[idx];
      if (!selectedTopic?.isReadOnly) {
        fetch(`${API_BASE}/api/session/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicId: selectedTopic?.id, scheduleId: selectedTopic?.schedule_id, questions: aiQuestions })
        }).catch(e => console.warn('복습 세션 동기화 실패:', e));
      }
      return copy;
    });
    setReviewOptionExplanations(prev => {
      const copy = { ...prev };
      delete copy[idx];
      return copy;
    });
    showNotification('해당 문제의 풀이 상태를 초기화했습니다.', 'info');
  };

  // ── Reset All Review Answers (다시 풀기) ──────────────────
  const handleRetakeReviewQuiz = async () => {
    if (!selectedTopic) return;

    const isReadOnly = !!selectedTopic.isReadOnly;
    const confirmMessage = isReadOnly 
      ? `이 복습 회차를 완료 해제하고 처음부터 다시 푸시겠습니까?`
      : `현재 출제된 모든 문제의 풀이 상태(선택한 답)를 초기화하시겠습니까?`;

    if (!window.confirm(confirmMessage)) return;

    // If it's read-only (completed) and has a valid database schedule, reset it on the server
    if (isReadOnly && selectedTopic.schedule_id && selectedTopic.schedule_id !== 9999) {
      try {
        const res = await fetch(`${API_BASE}/api/schedules/${selectedTopic.schedule_id}/reset`, {
          method: 'POST',
        });
        const data = await res.json();

        if (res.ok) {
          showNotification(`[${selectedTopic.title}] ${selectedTopic.review_round}회차 복습이 대기 상태로 변경되었습니다.`);
          fetchTodayReviews(referenceDate);
          fetchAllTopics();
        } else {
          showNotification(data.error || '복습 상태 초기화에 실패했습니다.', 'error');
          return;
        }
      } catch (err) {
        console.error('Review reset error:', err);
        showNotification('서버 오류로 초기화 처리에 실패했습니다.', 'error');
        return;
      }
    }

    // Reset local state of the quiz answers & revealed status
    setSelectedAnswers({});
    setRevealedQuestions({});
    setReviewOptionExplanations({});
    setTableAnswers({});
    setOpenSections({}); // Clear accordion open sections if any
    
    // Remove localStorage progress
    const progressKey = selectedTopic.schedule_id 
      ? `anti_review_progress_sched_${selectedTopic.schedule_id}`
      : `anti_review_progress_${selectedTopic.id}`;
    localStorage.removeItem(progressKey);

    // Make it editable
    if (isReadOnly) {
      setSelectedTopic(prev => prev ? { ...prev, isReadOnly: false } : null);
    }

    // Force save/sync the reset state to the server session immediately
    try {
      await fetch(`${API_BASE}/api/session/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: selectedTopic.id,
          scheduleId: selectedTopic.schedule_id,
          questions: aiQuestions,
          selectedAnswers: {},
          revealedQuestions: {},
          savedQuizScroll: 0
        })
      });
      console.log('[handleRetakeReviewQuiz] Successfully synced cleared review session to server');
    } catch (e) {
      console.warn('[handleRetakeReviewQuiz] Failed to sync cleared session to server:', e);
    }

    showNotification('모든 문제의 풀이 상태가 초기화되었습니다. 다시 풀 수 있습니다.', 'success');
  };

  const handleResetSingleExamAnswer = (idx) => {
    setExamAnswers(prev => {
      const copy = { ...prev };
      delete copy[idx];
      fetch(`${API_BASE}/api/session/exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          examQuestions, 
          examRevealed, 
          examAnswers: copy, 
          examTopic,
          savedExamScroll: examBodyRef.current?.scrollTop || 0 
        })
      }).catch(e => console.warn('종합평가 세션 동기화 실패:', e));
      return copy;
    });
    setExamOptionExplanations(prev => {
      const copy = { ...prev };
      delete copy[idx];
      return copy;
    });
    showNotification('해당 문제의 풀이 상태를 초기화했습니다.', 'info');
  };

  // ── Open Original Report (복습하기 원 보고서 팝업 띄우기) ──────────────────
  const handleOpenOriginalReport = () => {
    if (!selectedTopic?.id) return;
    const isPdf = selectedTopic.pdf_name && selectedTopic.pdf_name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      if (!window.confirm(`[${selectedTopic.pdf_name}] 파일을 다운로드하시겠습니까?`)) {
        return;
      }
    }
    const url = `${API_BASE}/api/topics/${selectedTopic.id}/pdf`;
    window.open(url, `_blank`, 'width=1200,height=900,status=no,menubar=no,toolbar=no,resizable=yes,scrollbars=yes');
  };

  // ── Refresh All Review Questions (복습하기 전체 문제 재생성) ──────────────────
  const handleRefreshReviewQuestions = async () => {
    if (!selectedTopic?.id) return;
    const isReadOnly = !!selectedTopic.isReadOnly;
    const confirmMsg = isReadOnly
      ? "이 완료된 복습 회차를 초기화하고, 새로운 실시간 AI 문제들로 다시 구성하여 처음부터 푸시겠습니까?"
      : "현재 생성된 복습 문제들이 토픽의 본래 주제와 어긋납니까? 전체 문제를 삭제하고 실시간 AI로 다시 구성하겠습니다.";

    if (!window.confirm(confirmMsg)) {
      return;
    }
    
    setLoadingAI(true);
    setAiQuestions([]);
    setRevealedQuestions({});
    setSelectedAnswers({});
    setReviewOptionExplanations({});
    setTableAnswers({});
    setIsFallback(false);
    setAiError('');
    
    try {
      if (isReadOnly && selectedTopic.schedule_id && selectedTopic.schedule_id !== 9999) {
        const resetRes = await fetch(`${API_BASE}/api/schedules/${selectedTopic.schedule_id}/reset`, {
          method: 'POST',
        });
        if (!resetRes.ok) {
          showNotification('복습 상태 초기화에 실패했습니다.', 'error');
          setLoadingAI(false);
          return;
        }
      }

      // 1. 기존의 복습 세션 데이터를 API를 통해 삭제
      const deleteUrl = selectedTopic.schedule_id
        ? `${API_BASE}/api/session/review/topic/${selectedTopic.id}?scheduleId=${selectedTopic.schedule_id}`
        : `${API_BASE}/api/session/review/topic/${selectedTopic.id}`;
      await fetch(deleteUrl, { method: 'DELETE' })
        .catch(e => console.warn('복습 세션 초기화 실패:', e));
      
      const progressKey = selectedTopic.schedule_id 
        ? `anti_review_progress_sched_${selectedTopic.schedule_id}`
        : `anti_review_progress_${selectedTopic.id}`;
      localStorage.removeItem(progressKey); // 전체 재생성 시 로컬 복습 기록도 제거
        
      // 2. 실시간 AI 생성 요청
      let url = `${API_BASE}/api/topics/${selectedTopic.id}/ai-questions`;
      if (selectedTopic.schedule_id) {
        url += `?scheduleId=${selectedTopic.schedule_id}`;
      }
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        const newQuestions = data.questions || [];
        setAiQuestions(newQuestions);
        setIsFallback(!!data.isFallback);
        setAiError(data.error || '');
        lastQuizTopicId.current = selectedTopic.id;
        setSelectedTopic(prev => prev ? { ...prev, isReadOnly: false } : null);
        
        // 공부중 버튼 캐시 및 상태 연동 업데이트
        const activeInfo = {
          topicId: selectedTopic.id,
          title: selectedTopic.title,
          keywords: selectedTopic.keywords || '',
          pdfName: selectedTopic.pdf_name || '',
          mode: 'ai',
          scheduleId: selectedTopic.schedule_id,
          reviewRound: selectedTopic.review_round,
          isReadOnly: false
        };
        localStorage.setItem('anti_last_active_review', JSON.stringify(activeInfo));
        setLastActiveReview(activeInfo);

        // 즉시 DB 저장
        fetch(`${API_BASE}/api/session/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicId: selectedTopic.id,
            scheduleId: selectedTopic.schedule_id,
            questions: newQuestions,
            selectedAnswers: {},
            revealedQuestions: {},
            savedQuizScroll: 0
          })
        }).catch(e => console.warn('복습 세션 전체 재생성 즉시 저장 실패:', e));

        if (isReadOnly) {
          fetchTodayReviews(referenceDate);
          fetchAllTopics();
        }
        showNotification('복습 문제가 성공적으로 다시 구성되었습니다.', 'success');
      } else {
        showNotification(data.error || 'AI 기출문제를 생성하지 못했습니다.', 'error');
      }
    } catch (err) {
      console.error('AI refresh call error:', err);
      showNotification('서버 통신 오류로 AI 예상문제를 로드하지 못했습니다.', 'error');
      setAiError(err.message || '서버 통신 오류');
    } finally {
      setLoadingAI(false);
    }
  };

  // ── Refresh Exam Questions (종합평가 1~10번 삭제 및 하단 10문항 추가) ──────────────────
  const handleRefreshExamQuestions = async () => {
    if (!window.confirm("종합평가 리프레쉬를 진행하시겠습니까?\n1~10번까지의 문제를 삭제하고, 추가로 10문제를 하단에 생성하여 추가합니다.\n(기존 남은 문제들은 계속해서 풀이가 가능합니다)")) {
      return;
    }
    
    const deleteCount = Math.min(10, examQuestions.length);
    const remainingQuestions = examQuestions.slice(deleteCount);

    // Shift keys of answer/revealed indices by deleteCount
    const newAnswers = {};
    Object.keys(examAnswers).forEach(key => {
      const idx = parseInt(key);
      if (idx >= deleteCount) {
        newAnswers[idx - deleteCount] = examAnswers[key];
      }
    });

    const newRevealed = {};
    Object.keys(examRevealed).forEach(key => {
      const idx = parseInt(key);
      if (idx >= deleteCount) {
        newRevealed[idx - deleteCount] = examRevealed[key];
      }
    });

    const newOptionExplanations = {};
    Object.keys(examOptionExplanations).forEach(key => {
      const idx = parseInt(key);
      if (idx >= deleteCount) {
        newOptionExplanations[idx - deleteCount] = examOptionExplanations[key];
      }
    });

    const newDetailedAnswers = {};
    Object.keys(detailedAnswers).forEach(key => {
      const idx = parseInt(key);
      if (idx >= deleteCount) {
        newDetailedAnswers[idx - deleteCount] = detailedAnswers[key];
      }
    });

    // Update state to immediately reflect the deletion & shifts (so they can keep playing!)
    setExamQuestions(remainingQuestions);
    setExamAnswers(newAnswers);
    setExamRevealed(newRevealed);
    setExamOptionExplanations(newOptionExplanations);
    setDetailedAnswers(newDetailedAnswers);

    setLoadingExam(true);
    
    try {
      // 2. 전체 토픽 통합 종합평가 추가 10문제 생성
      const res = await fetch(`${API_BASE}/api/exam/additional`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const newQs = data.questions || [];
        const updatedQuestions = [...remainingQuestions, ...newQs];
        
        setExamQuestions(updatedQuestions);
        
        // Sync to server session
        await fetch(`${API_BASE}/api/session/exam`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            examQuestions: updatedQuestions, 
            examRevealed: newRevealed, 
            examAnswers: newAnswers, 
            examTopic,
            savedExamScroll: examBodyRef.current?.scrollTop || 0 
          })
        }).catch(e => console.warn('종합평가 세션 동기화 실패:', e));
        
        showNotification('1~10번 문항을 삭제하고 새로운 10개 문항을 하단에 추가했습니다.', 'success');
      } else {
        showNotification(data.error || '종합평가 생성에 실패했습니다.', 'error');
      }
    } catch (err) {
      showNotification('서버 통신 오류: ' + err.message, 'error');
    } finally {
      setLoadingExam(false);
    }
  };

  // ── Add Questions (종합평가 10문항 하단에 추가 - 기존 문제 보존) ──────────────────
  const handleAddExamQuestions = async () => {
    if (!window.confirm("종합평가 문제 추가를 진행하시겠습니까?\n하단에 새로운 10문제를 생성하여 추가합니다.\n(기존 문제들은 풀이 내역과 함께 모두 안전하게 보존됩니다)")) {
      return;
    }

    setLoadingExam(true);
    
    try {
      // 2. 전체 토픽 통합 종합평가 추가 10문제 생성
      const res = await fetch(`${API_BASE}/api/exam/additional`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const newQs = data.questions || [];
        const updatedQuestions = [...examQuestions, ...newQs];
        
        setExamQuestions(updatedQuestions);
        
        // Sync to server session
        await fetch(`${API_BASE}/api/session/exam`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            examQuestions: updatedQuestions, 
            examRevealed, 
            examAnswers, 
            examTopic,
            savedExamScroll: examBodyRef.current?.scrollTop || 0 
          })
        }).catch(e => console.warn('종합평가 세션 동기화 실패:', e));
        
        showNotification('새로운 10개 문항을 하단에 추가했습니다.', 'success');
      } else {
        showNotification(data.error || '종합평가 생성에 실패했습니다.', 'error');
      }
    } catch (err) {
      showNotification('서버 통신 오류: ' + err.message, 'error');
    } finally {
      setLoadingExam(false);
    }
  };

  // ── Delete a single Comprehensive Exam Question (종합평가 단일 문제 삭제) ──────────────────
  const handleDeleteExamQuestion = (deleteIdx) => {
    if (!window.confirm(`Q${deleteIdx + 1}번 문제를 종합평가에서 영구 삭제하시겠습니까?\n삭제 시 이후 문제들의 응답 상태 및 해설 내역이 앞으로 한 칸씩 안전하게 자동 정렬됩니다.`)) {
      return;
    }

    const updatedQuestions = examQuestions.filter((_, i) => i !== deleteIdx);

    const newAnswers = {};
    Object.keys(examAnswers).forEach(key => {
      const idx = parseInt(key);
      if (idx < deleteIdx) {
        newAnswers[idx] = examAnswers[key];
      } else if (idx > deleteIdx) {
        newAnswers[idx - 1] = examAnswers[key];
      }
    });

    const newRevealed = {};
    Object.keys(examRevealed).forEach(key => {
      const idx = parseInt(key);
      if (idx < deleteIdx) {
        newRevealed[idx] = examRevealed[key];
      } else if (idx > deleteIdx) {
        newRevealed[idx - 1] = examRevealed[key];
      }
    });

    const newOptionExplanations = {};
    Object.keys(examOptionExplanations).forEach(key => {
      const idx = parseInt(key);
      if (idx < deleteIdx) {
        newOptionExplanations[idx] = examOptionExplanations[key];
      } else if (idx > deleteIdx) {
        newOptionExplanations[idx - 1] = examOptionExplanations[key];
      }
    });

    const newDetailedAnswers = {};
    Object.keys(detailedAnswers).forEach(key => {
      const idx = parseInt(key);
      if (idx < deleteIdx) {
        newDetailedAnswers[idx] = detailedAnswers[key];
      } else if (idx > deleteIdx) {
        newDetailedAnswers[idx - 1] = detailedAnswers[key];
      }
    });

    setExamQuestions(updatedQuestions);
    setExamAnswers(newAnswers);
    setExamRevealed(newRevealed);
    setExamOptionExplanations(newOptionExplanations);
    setDetailedAnswers(newDetailedAnswers);

    // Sync to server session
    fetch(`${API_BASE}/api/session/exam`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        examQuestions: updatedQuestions, 
        examRevealed: newRevealed, 
        examAnswers: newAnswers, 
        examTopic,
        savedExamScroll: examBodyRef.current?.scrollTop || 0 
      })
    }).catch(e => console.warn('종합평가 세션 동기화 실패:', e));

    showNotification('해당 문제를 성공적으로 삭제했습니다.', 'info');
  };

  // Regenerate a single question (mode: 'review' or 'exam')
  const handleRegenerateQuestion = async (mode, idx, currentQ) => {
    if (!window.confirm('이 문제를 새로운 다른 문제로 변환(재생성)하시겠습니까?')) {
      return;
    }
    const isReview = mode === 'review';
    const setRegenerating = isReview ? setRegeneratingReview : setRegeneratingExam;
    
    setRegenerating(prev => ({ ...prev, [idx]: true }));

    try {
      const body = {
        mode,
        topicId: isReview ? selectedTopic?.id : null,
        currentQuestion: currentQ,
        questionIdx: idx
      };

      const res = await fetch(`${API_BASE}/api/question/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();

      if (res.ok && data.question) {
        if (isReview) {
          const updated = aiQuestions.map((q, i) => i === idx ? data.question : q);
          const nextSelectedAnswers = { ...selectedAnswers };
          delete nextSelectedAnswers[idx];
          const nextRevealedQuestions = { ...revealedQuestions };
          delete nextRevealedQuestions[idx];

          setAiQuestions(updated);
          setSelectedAnswers(nextSelectedAnswers);
          setRevealedQuestions(nextRevealedQuestions);

          // 주관식인 경우 혹시 열려있는 아코디언 섹션도 초기화
          setOpenSections(prev => {
            const copy = { ...prev };
            Object.keys(copy).forEach(key => {
              if (key.startsWith(`${idx}-`)) {
                delete copy[key];
              }
            });
            return copy;
          });

          // 즉시 DB 저장
          fetch(`${API_BASE}/api/session/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topicId: selectedTopic?.id,
              scheduleId: selectedTopic?.schedule_id,
              questions: updated,
              selectedAnswers: nextSelectedAnswers,
              revealedQuestions: nextRevealedQuestions,
              savedQuizScroll: quizBodyRef.current?.scrollTop || 0
            })
          }).catch(e => console.warn('복습 세션 동기화 실패:', e));
        } else {
          const updated = examQuestions.map((q, i) => i === idx ? data.question : q);
          const nextExamAnswers = { ...examAnswers };
          delete nextExamAnswers[idx];
          const nextExamRevealed = { ...examRevealed };
          delete nextExamRevealed[idx];

          setExamQuestions(updated);
          setExamAnswers(nextExamAnswers);
          setExamRevealed(nextExamRevealed);

          // 즉시 DB 저장
          fetch(`${API_BASE}/api/session/exam`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              examQuestions: updated, 
              examRevealed: nextExamRevealed, 
              examAnswers: nextExamAnswers, 
              examTopic,
              savedExamScroll: examBodyRef.current?.scrollTop || 0 
            })
          }).catch(e => console.warn('종합평가 세션 동기화 실패:', e));
        }
        showNotification('해당 문제를 성공적으로 변환했습니다.', 'success');
      } else {
        showNotification(data.error || '문제를 변환하지 못했습니다.', 'error');
      }
    } catch (err) {
      console.error('Regenerate question error:', err);
      showNotification('서버 통신 오류로 문제를 변환하지 못했습니다.', 'error');
    } finally {
      setRegenerating(prev => ({ ...prev, [idx]: false }));
    }
  };

  // Adjust a single question based on user feedback (mode: 'review' or 'exam')
  const handleAdjustQuestion = async (mode, idx, currentQ) => {
    const isReview = mode === 'review';
    const key = isReview ? `r_${idx}` : `e_${idx}`;
    const feedbackText = adjustingText[key] || '';

    if (!feedbackText.trim()) {
      showNotification('의견을 입력해 주세요.', 'warning');
      return;
    }

    setAdjustingLoading(prev => ({ ...prev, [key]: true }));

    try {
      const body = {
        mode,
        topicId: isReview ? selectedTopic?.id : null,
        currentQuestion: currentQ,
        questionIdx: idx,
        userFeedback: feedbackText
      };

      const res = await fetch(`${API_BASE}/api/question/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();

      if (res.ok && data.question) {
        if (isReview) {
          // 1. 해당 인덱스 문항 교체 및 서버 세션 동기화 저장
          setAiQuestions(prev => {
            const updated = prev.map((q, i) => i === idx ? data.question : q);
            fetch(`${API_BASE}/api/session/review`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ topicId: selectedTopic?.id, scheduleId: selectedTopic?.schedule_id, questions: updated })
            }).catch(e => console.warn('복습 세션 동기화 실패:', e));
            return updated;
          });
          // 2. 해당 인덱스의 선택 답안, 정답 확인 여부 초기화
          setSelectedAnswers(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
          setRevealedQuestions(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
          // 3. 주관식인 경우 혹시 열려있는 아코디언 섹션도 초기화
          setOpenSections(prev => {
            const copy = { ...prev };
            Object.keys(copy).forEach(k => {
              if (k.startsWith(`${idx}-`)) {
                delete copy[k];
              }
            });
            return copy;
          });
          // 4. 보기별 해설도 초기화
          setReviewOptionExplanations(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
        } else {
          // 종합평가인 경우 문항 교체 및 서버 세션 동기화 저장
          setExamQuestions(prev => {
            const updated = prev.map((q, i) => i === idx ? data.question : q);
            fetch(`${API_BASE}/api/session/exam`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                examQuestions: updated, 
                examRevealed, 
                examAnswers, 
                examTopic,
                savedExamScroll: examBodyRef.current?.scrollTop || 0 
              })
            }).catch(e => console.warn('종합평가 세션 동기화 실패:', e));
            return updated;
          });
          setExamAnswers(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
          setExamRevealed(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
          // 보기별 해설 초기화
          setExamOptionExplanations(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
        }
        
        // 입력창 상태 초기화 및 닫기
        setAdjustingText(prev => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        setAdjustingInputKey(null);
        showNotification('의견을 반영하여 문제를 성공적으로 조정했습니다.', 'success');
      } else {
        showNotification(data.error || '문제를 조정하지 못했습니다.', 'error');
      }
    } catch (err) {
      console.error('Adjust question error:', err);
      showNotification('서버 통신 오류로 문제를 조정하지 못했습니다.', 'error');
    } finally {
      setAdjustingLoading(prev => ({ ...prev, [key]: false }));
    }
  };


  // Open review quiz AND mark schedule as complete simultaneously
  // (removed - now handled by separate buttons)

  // ── Request Option Explanation for Multiple Choice Questions ──────────
  const handleRequestOptionExplanation = async (mode, idx, question, options, answer) => {
    const isReview = mode === 'review';
    const explanations = isReview ? reviewOptionExplanations : examOptionExplanations;
    const setExplanations = isReview ? setReviewOptionExplanations : setExamOptionExplanations;

    // 이미 가져온 해설이 있다면 무시
    if (explanations[idx]) return;
    
    setExplanations(prev => ({ ...prev, [idx]: { loading: true, text: '', error: '' } }));
    try {
      const res = await fetch(`${API_BASE}/api/question/option-explanation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, options, answer })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '보기별 해설을 생성하지 못했습니다.');
      setExplanations(prev => ({ ...prev, [idx]: { loading: false, text: data.text, error: '' } }));
    } catch (err) {
      setExplanations(prev => ({ ...prev, [idx]: { loading: false, text: '', error: err.message } }));
    }
  };

  // ── Ask AI Tutor In-Card (Expanded panel) ───────────────────────────
  const handleAskCardTutor = async (key, q) => {
    const userQuery = (tutorInputText[key] || '').trim();
    if (!userQuery) return;

    setTutorAnswers(prev => ({
      ...prev,
      [key]: { loading: true, text: '', error: '' }
    }));

    try {
      let contextPrompt = `[학습 문맥 정보]\n`;
      contextPrompt += `■ 문제: ${q.question}\n`;
      if (q.options && q.options.length > 0) {
        contextPrompt += `■ 보기:\n${q.options.map((opt, i) => `${i + 1}) ${opt}`).join('\n')}\n`;
      }
      if (q.answers && typeof q.answers === 'object') {
        contextPrompt += `■ 정답/모범 답안 (표 빈칸):\n${Object.entries(q.answers).map(([k, v]) => `- ${k.replace('INPUT_', '')}: ${v}`).join('\n')}\n`;
      } else {
        contextPrompt += `■ 정답/모범 답안: ${q.answer || ''}\n`;
      }
      if (q.explanation) contextPrompt += `■ 기존 해설: ${q.explanation}\n`;
      if (q.concept) contextPrompt += `■ 핵심 개념: ${q.concept}\n`;
      if (q.formula) contextPrompt += `■ 공식: ${q.formula}\n`;
      
      contextPrompt += `\n[사용자 질문]\n${userQuery}\n\n`;
      contextPrompt += `[답변 지침]\n위 문제의 문맥을 바탕으로 사용자의 질문에만 직접적이고 깊이 있게 답변해 주세요. 불필요한 서론이나 인사말은 생략하고 본론으로 바로 대답해야 하며, 수식은 LaTeX 형식($...$ 또는 $$...$$)을 사용해 정밀하게 표현해야 합니다.`;

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: [],
          message: contextPrompt
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '답변을 생성하지 못했습니다.');
      
      setTutorAnswers(prev => ({
        ...prev,
        [key]: { loading: false, text: data.text, error: '' }
      }));
    } catch (err) {
      setTutorAnswers(prev => ({
        ...prev,
        [key]: { loading: false, text: '', error: err.message }
      }));
    }
  };

  const renderCardTutorChat = (key, q) => {
    return (
      <div className="mt-2.5 p-3.5 bg-violet-955/20 border border-violet-500/25 rounded-2xl w-full text-left">
        <label className="block text-[10px] font-black text-violet-400 mb-1">💬 AI 튜터 질문하기 (이 문제에 대해 물어보세요):</label>
        <div className="flex gap-2">
          <textarea
            rows={1}
            value={tutorInputText[key] || ''}
            onChange={(e) => {
              const text = e.target.value;
              setTutorInputText(prev => ({ ...prev, [key]: text }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const isPending = tutorAnswers[key]?.loading;
                const hasText = (tutorInputText[key] || '').trim();
                if (!isPending && hasText) {
                  handleAskCardTutor(key, q);
                }
              }
            }}
            placeholder="이 문제의 계산 과정이나 특정 보기가 정오답인 근거를 물어보세요..."
            className="flex-1 text-xs p-2 rounded-xl bg-slate-900 border border-slate-750 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 resize-none leading-relaxed"
          />
          <button
            disabled={tutorAnswers[key]?.loading || !(tutorInputText[key] || '').trim()}
            onClick={() => handleAskCardTutor(key, q)}
            className="text-[10px] px-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-extrabold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap active:scale-95 duration-200"
          >
            {tutorAnswers[key]?.loading ? '작성 중...' : '질문'}
          </button>
        </div>

        {/* AI Tutor In-Card Answer Panel */}
        {tutorAnswers[key]?.loading && (
          <div className="py-2.5 flex flex-col gap-1.5 animate-pulse select-text mt-2 border-t border-violet-500/10">
            <div className="text-[10px] text-violet-400 font-bold flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-ping"></div>
              <span>⏳ AI 튜터가 답변을 구성하는 중...</span>
            </div>
            <div className="h-4 bg-slate-850 rounded w-5/6"></div>
            <div className="h-4 bg-slate-850 rounded w-4/6"></div>
          </div>
        )}
        {tutorAnswers[key]?.error && (
          <div className="text-[10px] text-rose-400 font-bold select-text mt-2 border-t border-violet-500/10 pt-2">❌ 답변 오류: {tutorAnswers[key].error}</div>
        )}
        {tutorAnswers[key]?.text && !tutorAnswers[key]?.loading && (
          <div className="mt-2.5 pt-2.5 border-t border-violet-500/20 select-text">
            <div className="text-[11px] font-black text-violet-400 mb-1.5">💬 AI 튜터 답변</div>
            <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap select-text text-left w-full bg-slate-900/60 p-3 rounded-xl border border-violet-500/10 shadow-inner">
              <LatexRenderer text={tutorAnswers[key].text} katexLoaded={katexLoaded} enableAddFormula={true} isMarkdown={true} />
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Ask AI Tutor About a Specific Question ──────────────────────────
  const handleAskTutorAboutQuestion = async (q, mode = 'review') => {
    if (isChatLoading) return;

    let promptText = `[기술사 학습 질문]\n다음 문제에 대해 핵심 전공 지식과 풀이 방식을 매우 친절하고 깊이 있게 설명해 주세요.\n\n`;
    promptText += `■ 문제:\n${q.question}\n\n`;
    
    if (q.options && q.options.length > 0) {
      promptText += `■ 객관식 보기:\n${q.options.map((opt, i) => `${i + 1}) ${opt}`).join('\n')}\n\n`;
      promptText += `■ 정답/해설:\n${q.answer || '확인 필요'}\n`;
      if (q.explanation) {
        promptText += `(해설 요약: ${q.explanation})\n`;
      }
    } else {
      if (q.concept) {
        promptText += `■ 핵심 개념:\n${q.concept}\n\n`;
      }
      if (q.formula) {
        promptText += `■ 공식/개념도:\n${q.formula}\n\n`;
      }
      if (q.answer) {
        promptText += `■ 예시 답안:\n${q.answer}\n`;
      }
    }

    // Switch tab to Tutor in the respective split containers
    if (mode === 'review') {
      setReviewMobileTab('tutor');
      requestAnimationFrame(() => {
        const containerWidth = reviewSplitContainerRef.current?.clientWidth || 0;
        reviewSplitContainerRef.current?.scrollTo({ left: containerWidth, behavior: 'smooth' });
      });
    } else if (mode === 'exam') {
      setExamMobileTab('tutor');
      requestAnimationFrame(() => {
        const containerWidth = examSplitContainerRef.current?.clientWidth || 0;
        examSplitContainerRef.current?.scrollTo({ left: containerWidth, behavior: 'smooth' });
      });
    }

    // Send immediately via handleSendChat
    await handleSendChat(promptText);
  };

  // ── Request Detailed Answer for Exam Questions ────────────────────────
  const handleRequestDetailedAnswer = async (idx, question, answer) => {
    setDetailedAnswers(prev => ({ ...prev, [idx]: { loading: true, text: '', error: '' } }));
    try {
      const res = await fetch(`${API_BASE}/api/exam/detailed-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '답안 전문을 가져오는 중 오류가 발생했습니다.');
      setDetailedAnswers(prev => ({ ...prev, [idx]: { loading: false, text: data.text, error: '' } }));
    } catch (err) {
      setDetailedAnswers(prev => ({ ...prev, [idx]: { loading: false, text: '', error: err.message } }));
    }
  };

  // ── Scroll Quiz Question Up/Down for Desktop Split-View ────────────
  const handleScrollQuestion = (direction) => {
    if (!quizBodyRef.current) return;
    const cards = quizBodyRef.current.querySelectorAll('.quiz-card-item');
    if (cards.length === 0) return;

    const containerTop = quizBodyRef.current.getBoundingClientRect().top;
    
    // 현재 화면(컨테이너 기준)의 상단에 가장 가까운 카드를 찾습니다.
    let currentIndex = 0;
    let minDiff = Infinity;
    
    cards.forEach((card, idx) => {
      const rect = card.getBoundingClientRect();
      const diff = Math.abs(rect.top - containerTop - 10);
      if (diff < minDiff) {
        minDiff = diff;
        currentIndex = idx;
      }
    });

    let targetIndex = currentIndex;
    if (direction === 'down') {
      targetIndex = Math.min(currentIndex + 1, cards.length - 1);
      // 만약 현재 카드의 top이 이미 컨테이너보다 아래에 있다면 그 카드가 타겟이 될 수 있음
      const curRect = cards[currentIndex].getBoundingClientRect();
      if (curRect.top - containerTop > 20) {
        targetIndex = currentIndex;
      }
    } else if (direction === 'up') {
      targetIndex = Math.max(currentIndex - 1, 0);
      // 만약 현재 카드의 top이 컨테이너보다 위에 있다면 현재 카드가 타겟이 될 수 있음
      const curRect = cards[currentIndex].getBoundingClientRect();
      if (curRect.top - containerTop < -20) {
        targetIndex = currentIndex;
      }
    }

    quizBodyRef.current?.scrollTo({ top: cards[targetIndex].offsetTop, behavior: 'smooth' });
  };

  // ── Scroll Exam Question Up/Down for Desktop Split-View ────────────
  const handleScrollExamQuestion = (direction) => {
    if (!examBodyRef.current) return;
    const cards = examBodyRef.current.querySelectorAll('.exam-card-item');
    if (cards.length === 0) return;

    const containerTop = examBodyRef.current.getBoundingClientRect().top;
    
    // 현재 화면(컨테이너 기준)의 상단에 가장 가까운 카드를 찾습니다.
    let currentIndex = 0;
    let minDiff = Infinity;
    
    cards.forEach((card, idx) => {
      const rect = card.getBoundingClientRect();
      const diff = Math.abs(rect.top - containerTop - 10);
      if (diff < minDiff) {
        minDiff = diff;
        currentIndex = idx;
      }
    });

    let targetIndex = currentIndex;
    if (direction === 'down') {
      targetIndex = Math.min(currentIndex + 1, cards.length - 1);
      // 만약 현재 카드의 top이 이미 컨테이너보다 아래에 있다면 그 카드가 타겟이 될 수 있음
      const curRect = cards[currentIndex].getBoundingClientRect();
      if (curRect.top - containerTop > 20) {
        targetIndex = currentIndex;
      }
    } else if (direction === 'up') {
      targetIndex = Math.max(currentIndex - 1, 0);
      // 만약 현재 카드의 top이 컨테이너보다 위에 있다면 현재 카드가 타겟이 될 수 있음
      const curRect = cards[currentIndex].getBoundingClientRect();
      if (curRect.top - containerTop < -20) {
        targetIndex = currentIndex;
      }
    }

    examBodyRef.current?.scrollTo({ top: cards[targetIndex].offsetTop, behavior: 'smooth' });
  };

  // ── Gemini Sidebar Image Attachment Handlers ───────────────────────
  const handleImageAttachment = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showNotification('이미지 파일만 첨부할 수 있습니다.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result.split(',')[1];
      setAttachedImage({
        name: file.name,
        mimeType: file.type,
        data: base64Data
      });
    };
    reader.readAsDataURL(file);
  };

  const handleClearAttachedImage = () => {
    setAttachedImage(null);
  };

  const handlePasteImage = (e) => {
    // 1. clipboardData.files 우선 검사 (모던 브라우저 및 OS 캡처 비트맵 파일 직접 맵핑 대응)
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            setAttachedImage({
              name: file.name || `clipboard-image-${Date.now().toString().slice(-4)}.png`,
              mimeType: file.type,
              data: base64Data
            });
            showNotification('클립보드 이미지가 첨부되었습니다!');
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          return;
        }
      }
    }

    // 2. clipboardData.items 보조 검사 (브라우저 호환성 백업 및 특수 클립보드 항목 대응)
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/') || item.kind === 'file') {
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            setAttachedImage({
              name: `clipboard-image-${Date.now().toString().slice(-4)}.png`,
              mimeType: file.type || 'image/png',
              data: base64Data
            });
            showNotification('클립보드 이미지가 첨부되었습니다!');
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          return;
        }
      }
    }
  };

  // ── Gemini Sidebar Chat Handler ───────────────────────────────
  const handleSendChat = async (customMessage) => {
    const userMessage = (typeof customMessage === 'string' ? customMessage : chatInput).trim();
    if ((!userMessage && !attachedImage) || isChatLoading) return;
    
    const currentAttachedImage = attachedImage;
    if (typeof customMessage !== 'string') {
      setChatInput('');
    }
    setAttachedImage(null);
    
    const userMsgIdx = chatHistory.length;
    setChatHistory(prev => [...prev, { role: 'user', text: userMessage, image: currentAttachedImage }]);
    setIsChatLoading(true);

    requestAnimationFrame(() => {
      if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    });

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history: chatHistory.map(h => ({ role: h.role, text: h.text })), 
          message: userMessage,
          image: currentAttachedImage ? { mimeType: currentAttachedImage.mimeType, data: currentAttachedImage.data } : null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '답변 생성 실패');
      setChatHistory(prev => [...prev, { role: 'model', text: data.text }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'model', text: `오류가 발생했습니다: ${err.message}` }]);
    } finally {
      setIsChatLoading(false);
      requestAnimationFrame(() => {
        const parent = chatBodyRef.current;
        const userMsgEl = parent?.querySelector(`#chat-msg-${userMsgIdx}`);
        if (parent && userMsgEl) {
          const parentRect = parent.getBoundingClientRect();
          const childRect = userMsgEl.getBoundingClientRect();
          const relativeTop = childRect.top - parentRect.top + parent.scrollTop;
          parent.scrollTo({ top: relativeTop, behavior: 'smooth' });
        } else if (parent) {
          parent.scrollTop = parent.scrollHeight;
        }
      });
    }
  };

  const handleGenerateTopicProblem = async (topic) => {
    if (!topic) return;
    
    setChatHistory(prev => [...prev, { role: 'model', text: '📝 문제를 생성 중입니다... 잠시만 기다려주세요.' }]);
    setIsChatLoading(true);

    const promptText = `[수험생이 선택하여 문제를 출제받고자 하는 토픽 정보: 토픽명 - ${topic.title || ''}]

위 토픽의 핵심 이론과 공식을 활용하여 풀 수 있는 정량적(수치 계산이 포함된) 주관식 문제를 하나 출제해주세요.
반드시 다음 지침을 준수해야 합니다:
1. 계산에 필요한 조건과 수치(예: 탄성계수 E = 200 GPa, 포아송비 v = 0.3 등)를 구체적이고 명확하게 제시하세요.
2. 처음 출제하는 답변에는 절대 정답 수치나 풀이 과정(해설)을 함께 적지 마세요. 사용자가 직접 주관식 답안을 계산하여 입력하고 피드백을 받을 수 있도록 오직 문제 내용과 질문만 제공해야 합니다.
3. 사용자가 주관식 답안을 입력할 수 있도록 "답안을 댓글(채팅)창에 주관식으로 입력해 주세요."와 같은 안내를 덧붙여 주세요.
4. 친절하고 전문적인 AI 공학 튜터의 톤앤매너로 출제해주세요.`;

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: [],
          message: promptText,
          image: null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '문제 출제 실패');
      
      setChatHistory(prev => {
        const filtered = prev.filter(msg => msg.text !== '📝 문제를 생성 중입니다... 잠시만 기다려주세요.');
        return [...filtered, { role: 'model', text: data.text }];
      });
    } catch (err) {
      setChatHistory(prev => {
        const filtered = prev.filter(msg => msg.text !== '📝 문제를 생성 중입니다... 잠시만 기다려주세요.');
        return [...filtered, { role: 'model', text: `문제를 출제하는 중 오류가 발생했습니다: ${err.message}` }];
      });
    } finally {
      setIsChatLoading(false);
      requestAnimationFrame(() => {
        if (chatBodyRef.current) {
          chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
      });
    }
  };

  // Open Comprehensive Exam (70 questions from ALL topics via Gemini)
  const handleOpenExam = async () => {
    setExamMobileTab('list');
    requestAnimationFrame(() => {
      if (examSplitContainerRef.current) examSplitContainerRef.current.scrollLeft = 0;
    });
    // 1) ALWAYS try to retrieve the latest session from the server first (ensures perfect Mobile-PC linkage)
    setLoadingExam(true);
    setShowExam(true);
    try {
      const sessionRes = await fetch(`${API_BASE}/api/session/exam?t=${Date.now()}`);
      const sessionData = await sessionRes.json();
      if (sessionData?.data?.examQuestions?.length > 0) {
        // Server has a valid session → Restore it perfectly
        const d = sessionData.data;
        setExamQuestions(d.examQuestions);
        setExamRevealed(d.examRevealed || {});
        setExamAnswers(d.examAnswers || {});
        setExamTopic(d.examTopic || { title: '전체 토픽 통합 종합평가' });
        if (d.savedExamScroll) savedExamScroll.current = d.savedExamScroll;
        
        setLoadingExam(false);
        requestAnimationFrame(() => {
          if (examBodyRef.current) examBodyRef.current.scrollTop = savedExamScroll.current;
        });
        return;
      } else {
        // If server session is empty but we had local memory state,
        // it means the session was ended/reset on another device. We should sync and clear local state.
        setExamQuestions([]);
        setExamRevealed({});
        setExamAnswers({});
        setExamTopic(null);
        setTableAnswers({});
      }
    } catch (e) {
      console.warn('서버 세션 확인 실패, 로컬 상태를 사용합니다:', e);
      // Fallback to local memory only if server query fails
      if (examQuestions.length > 0) {
        setLoadingExam(false);
        requestAnimationFrame(() => {
          if (examBodyRef.current) examBodyRef.current.scrollTop = savedExamScroll.current;
        });
        return;
      }
    }

    // 2) No server session and no local memory → Create new questions
    setExamTopic({ title: '전체 토픽 통합 종합평가' });
    setExamQuestions([]);
    setExamRevealed({});
    setExamAnswers({});
    setExamOptionExplanations({});
    setTableAnswers({});
    try {
      const res = await fetch(`${API_BASE}/api/exam/all`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const qs = data.questions || [];
        // Fisher-Yates shuffle – 주관식/객관식 랜덤 혼합
        for (let i = qs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [qs[i], qs[j]] = [qs[j], qs[i]];
        }
        setExamQuestions(qs);
        
        // Save the newly created session to the server immediately
        fetch(`${API_BASE}/api/session/exam`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            examQuestions: qs, 
            examRevealed: {}, 
            examAnswers: {}, 
            examTopic: { title: '전체 토픽 통합 종합평가' },
            savedExamScroll: 0 
          }),
        }).catch(e => console.warn('서버 세션 초기 저장 실패:', e));

      } else {
        showNotification(data.error || '종합평가 생성에 실패했습니다.', 'error');
        setShowExam(false);
      }
    } catch (err) {
      showNotification('서버 통신 오류: ' + err.message, 'error');
      setShowExam(false);
    } finally {
      setLoadingExam(false);
    }
  };

  const filterStructureLinesClient = (mathContent, structure) => {
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

    const lines = structure.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      
      if (/^\s*[\-\*\d\.]/.test(trimmed)) {
        const colonIdx = trimmed.indexOf(':');
        const dashIdx = trimmed.indexOf('-', 1);
        const sepIdx = colonIdx !== -1 ? colonIdx : dashIdx;
        
        if (sepIdx !== -1) {
          const symbolPortion = trimmed.substring(0, sepIdx);
          const symbolTokens = symbolPortion.match(tokenRegex) || [];
          const normalizedSymbols = symbolTokens.map(s => normalize(s)).filter(Boolean);
          
          if (normalizedSymbols.length === 0) return true;
          
          const hasMatch = normalizedSymbols.some(s => formulaTokenSet.has(s));
          return hasMatch;
        }
      }
      return true;
    });

    return filteredLines.join('\n').trim();
  };

  // 필수공식 타이틀/지문 정화 및 콤팩트 규격화 함수
  const normalizeAndCompactifyFormulas = (formulas) => {
    if (!Array.isArray(formulas)) return [];
    return formulas.map(f => {
      let title = f.title || "";
      
      // 1. JSON 깨짐 버그 데이터 정화 ({ "title": "..." } 형태 등)
      if (title.includes('{') || title.includes('"title"')) {
        const titleMatch = title.match(/"title"\s*:\s*"([^"]+)"/);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1];
        } else {
          title = title.replace(/[{}\[\]"']/g, '').replace(/title\s*:\s*/g, '').trim();
        }
      }
      
      title = title.replace(/^["'`\s\t\n]+|["'`\s\t\n]+$/g, '').trim();

      // 2. 디폴트 공식 및 기존 공식 타이틀/질문 강제 콤팩트 변환
      let newTitle = title;
      
      const compactTitles = {
        "Barton의 암반 Q분류": "바톤 암반 Q분류(Barton Q-system, $Q$)",
        "Terzaghi 얕은기초 극한 지지력": "테르자기 극한지지력(Terzaghi Ultimate Bearing Capacity, $q_{ult}$)",
        "연약지반 Sand Mat 최소 소요 두께": "연약지반 샌드매트 최소두께(Sand Mat Minimum Thickness, $H$)",
        "평사투영 극점 변환 반경 (등면적 투영)": "슈미트네트 극점반경(Schmidt Net Pole Radius, $r$)",
        "락볼트 인발시험 설계 지반 고착력": "락볼트 고착력 계산식(Rockbolt Bond Strength, $P$)",
        "Rankine 주동토압": "랭킹 주동토압계수(Rankine Active Earth Pressure Coefficient, $K_a$)",
        "Terzaghi 1차원 압밀 지배 미분방정식": "테르자기 1차 압밀방정식(Terzaghi 1D Consolidation, $C_v$)",
        "보상도 (보상기초 하중 상쇄 비율)": "보상기초 보상도(Compensated Foundation Safety Factor, $C$)",
        "터널 배면 싱글쉘 정수압 분포 공식": "싱글쉘 터널 설계수압(Single Shell Tunnel Design Water Pressure, $p_w$)",
        "가설 흙막이 벽체 지반스프링상수": "가설흙막이 수평지반반력계수(Temporary Retaining Wall Horizontal Subgrade Reaction Coefficient, $k_h$)"
      };

      if (compactTitles[newTitle]) {
        newTitle = compactTitles[newTitle];
      }

      // 사족 전면 완전 삭제: 질문을 그냥 콤팩트한 공식 타이틀명 자체로 정돈!
      const newQuestion = newTitle;

      // 3. [보상기초 보상도 공식] 기호 정의 자가 치유 (Self-Healing)
      // 만약 타이틀이 보상도 공식이면 디폴트 기본 스펙으로 100% 무조건 강제 정화 및 자가 치유!
      let newFormula = cleanCorruptedFormula(f.formula || "");
      let newConcept = f.concept;
      if (newTitle.includes("보상도") || newTitle.includes("보상기초")) {
        newFormula = "$$C = \\frac{\\gamma D_f}{q}$$\n\n- $C$: 보상도 (Compensational ratio, $C = 1.0$이면 완전 보상)\n- $\\gamma$: 굴착하여 배출한 흙의 단위중량\n- $D_f$: 기초의 굴착 깊이\n- $q$: 상부 구조물 총 자중 및 하중 합산값";
        newConcept = "구조물 자중을 굴착한 흙의 총 중량으로 완벽히 치환 상쇄하여 순 침하 하중을 Zero로 수렴시키는 평가 공식";
      }

      // 4. 모든 공식 대상 기호정의 자동 정화 (수식에 있는 기호만 표시하도록 강제 필터링!)
      if (newFormula && newFormula.includes('$$')) {
        const mathMatch = newFormula.match(/\$\$(.*?)\$\$/s);
        if (mathMatch) {
          const mathContent = mathMatch[1].trim();
          const structureContent = newFormula.replace(/\$\$(.*?)\$\$/s, '').trim();
          if (structureContent) {
            const filteredStructure = filterStructureLinesClient(mathContent, structureContent);
            newFormula = `$$${mathContent}$$\n\n${filteredStructure}`;
          }
        }
      }

      return {
        ...f,
        title: newTitle,
        question: newQuestion,
        formula: newFormula,
        concept: newConcept
      };
    });
  };

  const handleSaveFormulaQuestions = async (qs = formulaQuestions, showToast = true) => {
    try {
      const healedQs = Array.isArray(qs) ? qs.map(healFormulaQuestionObject) : qs;
      latestFormulaQuestionsRef.current = healedQs;
      setFormulaQuestions(healedQs);
      localStorage.setItem('anti_formula_questions', JSON.stringify(healedQs));
      
      // Sync with database for cross-device support (AWAITED to avoid timing issues)
      const res = await fetch(`${API_BASE}/api/session/formula`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formulaQuestions: healedQs })
      });

      if (!res.ok) {
        throw new Error('Database sync returned non-OK status');
      }

      if (showToast) {
        showNotification('필수공식 리스트가 성공적으로 저장되었습니다!', 'success');
      }
    } catch (err) {
      console.warn('필수공식 저장 실패:', err);
      if (showToast) {
        showNotification('서버 저장 실패: 로컬 스토리지에만 저장됩니다.', 'warning');
      }
    }
  };

  const initializeFormulaQuiz = useCallback(() => {
    if (!formulaQuestions || formulaQuestions.length < 1) return;
    
    const todayStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
    const lastDate = localStorage.getItem('anti_last_quiz_date') || '';
    let currentQuiz = [];
    try {
      const saved = localStorage.getItem('anti_formula_quiz_questions');
      if (saved) {
        currentQuiz = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to parse saved formula quiz:', e);
    }
    
    if (lastDate !== todayStr) {
      const unsolved = currentQuiz.filter(q => !q.isCorrect);
      const needed = Math.max(0, 3 - unsolved.length);
      const newQuestions = [];
      for (let i = 0; i < needed; i++) {
        const newQ = generateRandomQuizQuestion(formulaQuestions);
        if (newQ) newQuestions.push(newQ);
      }
      const updatedQuiz = [...unsolved, ...newQuestions];
      
      setFormulaQuizQuestions(updatedQuiz);
      localStorage.setItem('anti_formula_quiz_questions', JSON.stringify(updatedQuiz));
      localStorage.setItem('anti_last_quiz_date', todayStr);
    } else {
      if (currentQuiz.length === 0) {
        const newQuestions = [];
        for (let i = 0; i < 3; i++) {
          const newQ = generateRandomQuizQuestion(formulaQuestions);
          if (newQ) newQuestions.push(newQ);
        }
        setFormulaQuizQuestions(newQuestions);
        localStorage.setItem('anti_formula_quiz_questions', JSON.stringify(newQuestions));
        localStorage.setItem('anti_last_quiz_date', todayStr);
      } else {
        setFormulaQuizQuestions(currentQuiz);
      }
    }
  }, [formulaQuestions]);

  const fetchQuestionContent = async (quizItem) => {
    const targetFormula = formulaQuestions.find(f => f.title === quizItem.formulaTitle);
    if (!targetFormula) {
      return {
        ...quizItem,
        loading: false,
        error: '공식 정보를 찾을 수 없습니다.'
      };
    }

    try {
      const res = await fetch(`${API_BASE}/api/formula/generate-quiz-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formulaTitle: targetFormula.title,
          formula: targetFormula.formula,
          concept: targetFormula.concept || '',
          assumptions: ''
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }

      const correctOptionIndex = data.options.indexOf(data.answer);
      const finalCorrectIdx = correctOptionIndex !== -1 ? correctOptionIndex : 0;

      return {
        ...quizItem,
        loading: false,
        question: data.question,
        options: data.options,
        correctOptionIndex: finalCorrectIdx,
        explanation: data.explanation,
        isAiGenerated: true
      };
    } catch (err) {
      console.warn('AI 공식 계산 문제 생성 실패. 로컬 백업 질문 생성으로 전환합니다:', err);
      const validFormulas = formulaQuestions.filter(f => f.title && f.formula);
      return generateLocalConceptQuestion(quizItem, targetFormula, validFormulas);
    }
  };

  const handleGenerateExtraQuizQuestion = async () => {
    const validFormulas = formulaQuestions.filter(f => f.title && f.formula);
    if (validFormulas.length < 1) {
      showNotification('등록된 공식이 없습니다. 먼저 공식을 추가해 주세요.', 'error');
      return;
    }

    setGeneratingFormulaQuiz(true);

    const target = validFormulas[Math.floor(Math.random() * validFormulas.length)];
    const tempId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newQPlaceholder = {
      id: tempId,
      formulaTitle: target.title,
      question: '',
      options: [],
      correctOptionIndex: 0,
      userAnswerIndex: null,
      isCorrect: false,
      loading: true,
      error: null,
      dateAdded: new Date().toLocaleDateString('sv-SE')
    };

    const listWithPlaceholder = [...formulaQuizQuestions, newQPlaceholder];
    setFormulaQuizQuestions(listWithPlaceholder);
    localStorage.setItem('anti_formula_quiz_questions', JSON.stringify(listWithPlaceholder));
    showNotification('공식 문제를 출제하고 있습니다. 잠시만 기다려주세요...', 'info');

    try {
      const resolvedQ = await fetchQuestionContent(newQPlaceholder);
      setFormulaQuizQuestions(prev => {
        const updated = prev.map(item => item.id === tempId ? resolvedQ : item);
        localStorage.setItem('anti_formula_quiz_questions', JSON.stringify(updated));
        return updated;
      });
      showNotification('새로운 공식 문제가 성공적으로 추가되었습니다!', 'success');
    } catch (err) {
      setFormulaQuizQuestions(prev => {
        const updated = prev.map(item => item.id === tempId ? { ...item, loading: false, error: '문제 출제 실패' } : item);
        localStorage.setItem('anti_formula_quiz_questions', JSON.stringify(updated));
        return updated;
      });
    } finally {
      setGeneratingFormulaQuiz(false);
    }
  };

  const confirmAndGenerateQuizQuestion = async (shouldNavigateMobile = false) => {
    const hasConfirmed = window.confirm("새로운 공식 문제를 생성하시겠습니까?");
    if (hasConfirmed) {
      await handleGenerateExtraQuizQuestion();
      if (shouldNavigateMobile && !isDesktop && !isMobileLandscape) {
        setFormulaMobileTab('tutor');
      }
    } else {
      if (shouldNavigateMobile && !isDesktop && !isMobileLandscape) {
        setFormulaMobileTab('tutor');
      }
    }
  };

  const handleRemoveFormulaQuizQuestion = (quizId) => {
    const updated = formulaQuizQuestions.filter(q => q.id !== quizId);
    setFormulaQuizQuestions(updated);
    localStorage.setItem('anti_formula_quiz_questions', JSON.stringify(updated));
    showNotification('공식 문제가 목록에서 제거되었습니다.', 'success');
  };




  useEffect(() => {
    if (showFormulaExam && formulaQuestions.length >= 1) {
      initializeFormulaQuiz();
    }
  }, [showFormulaExam, formulaQuestions, initializeFormulaQuiz]);

  const loadFormulaQuestions = async () => {
    setLoadingFormula(true);
    let loadedData = null;
    let fallbackToLocal = false;

    // 1) Try Database Sync
    try {
      const res = await fetch(`${API_BASE}/api/session/formula?t=${Date.now()}`);
      if (res.ok) {
        const body = await res.json();
        if (body && body.data && Array.isArray(body.data.formulaQuestions) && body.data.formulaQuestions.length > 0) {
          loadedData = body.data.formulaQuestions;
          console.log('[Sync] Loaded formula questions from database.');
        }
      }
    } catch (err) {
      console.warn('[Sync] Database formula loading failed:', err);
    }

    // 2) Try LocalStorage Fallback
    if (!loadedData) {
      try {
        const savedStr = localStorage.getItem('anti_formula_questions');
        if (savedStr) {
          const parsed = JSON.parse(savedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            loadedData = parsed;
            fallbackToLocal = true;
            console.log('[Fallback] Loaded formula questions from LocalStorage.');
          }
        }
      } catch (err) {
        console.warn('localStorage 필수공식 복원 실패:', err);
      }
    }

    // 3) Fallback to Defaults if still empty
    if (!loadedData) {
      const defaultFormulas = [
        {
          title: "바톤 암반 Q분류(Barton Q-system, $Q$)",
          question: "바톤 암반 Q분류(Barton Q-system, $Q$)",
          concept: "암반의 공학적 특성을 6가지 독립된 변수를 통해 정량화하여 터널 1차 지보 설계를 설계하는 지수 공식",
          formula: "$$Q = \\frac{RQD}{J_n} \\times \\frac{J_r}{J_a} \\times \\frac{J_w}{SRF}$$\n\n- $Q$: 암반 등급 지수\n- $RQD$: 암질지수 (Rock Quality Designation)\n- $J_n$: 절리군 수 (Joint set number)\n- $J_r$: 절리면 거칠기 계수 (Joint roughness number)\n- $J_a$: 절리면 변질 계수 (Joint alteration number)\n- $J_w$: 절리수 보정 계수 (Joint water reduction factor)\n- $SRF$: 응력 감소 계수 (Stress Reduction Factor)",
          structure: "1. RQD/Jn: 블록의 크기\n2. Jr/Ja: 블록 전단강도\n3. Jw/SRF: 지반 유효응력 분포 상태"
        },
        {
          title: "테르자기 극한지지력(Terzaghi Ultimate Bearing Capacity, $q_{ult}$)",
          question: "테르자기 극한지지력(Terzaghi Ultimate Bearing Capacity, $q_{ult}$)",
          concept: "흙의 전단파괴 형상을 대수나선 등으로 모델화하여 기초 저면 아래 지반이 전단 파괴 없이 지탱할 수 있는 최대 하중 강도 식",
          formula: "$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$\n\n- $q_{ult}$: 극한 지지력\n- $c$: 흙의 점착력\n- $q$: 기초 저면의 유효상재하중 ($\\gamma D_f$)\n- $\\gamma$: 기초 저면 아래 흙의 단위중량\n- $B$: 기초의 폭 (단변 길이)\n- $N_c, N_q, N_{\\gamma}$: 지반의 내부마찰각($\\phi$)에 의해 정의되는 지지력 계수",
          structure: "1. 점착력 성분 ($c N_c$)\n2. 마찰각 및 상재하중 성분 ($q N_q$)\n3. 기초 자중 및 마찰 성분 ($0.5 \\gamma B N_{\\gamma}$)"
        },
        {
          title: "연약지반 샌드매트 최소두께(Sand Mat Minimum Thickness, $H$)",
          question: "연약지반 샌드매트 최소두께(Sand Mat Minimum Thickness, $H$)",
          concept: "표층 개량 및 연약지반 상부에 무거운 주행성 장비(Trafficability)를 얹기 위한 하중 지지 소요 두께식",
          formula: "$$H = \\frac{q - q_a}{2 \\gamma \\tan\\theta}$$\n\n- $H$: 샌드매트의 소요 최소 두께\n- $q$: 포설 장비의 접지압\n- $q_a$: 지반의 허용 지지력\n- $\\gamma$: 모래의 단위중량\n- $\\theta$: 하중 분산각 (일반적으로 $45^\\circ$ 적용)",
          structure: "1. 상부 장비 접지압 분산 원리\n2. 모래의 전단 부착각과 저면 마찰 저항"
        },
        {
          title: "슈미트네트 극점반경(Schmidt Net Pole Radius, $r$)",
          question: "슈미트네트 극점반경(Schmidt Net Pole Radius, $r$)",
          concept: "통계적 밀도 보정을 위해 면적 왜곡을 줄인 슈미트 네트(Schmidt Net) 평면 변환 투영식",
          formula: "$$r = \\sqrt{2} R \\sin\\left(45^\\circ - \\frac{\\alpha}{2}\\right)$$\n\n- $r$: 투영원 중심으로부터 극점(Pole)까지의 평면 거리\n- $R$: 투영구(Sphere)의 반경\n- $\\alpha$: 불연속면의 경사각 (Dip angle)",
          structure: "1. 등면적 조건 구면 투영 원리\n2. 극점(Pole) 매핑 기하학"
        },
        {
          title: "락볼트 고착력 계산식(Rockbolt Bond Strength, $P$)",
          question: "락볼트 고착력 계산식(Rockbolt Bond Strength, $P$)",
          concept: "인발 하중 재하 시 천공홀 배면의 마찰 부착 면적을 기반으로 볼트 탈락에 지탱하는 한계 고착력 식",
          formula: "$$P = \\pi \\cdot d \\cdot L \\cdot \\tau_{allow}$$\n\n- $P$: 락볼트의 최대 허용 인발 저항력 (인발 하중)\n- $d$: 락볼트 천공 구멍의 직경\n- $L$: 그라우팅 정착 길이 (고착 영역)\n- $\\tau_{allow}$: 지반과 그라우팅재(또는 그라우트와 락볼트) 간의 허용 부착 전단강도",
          structure: "1. 부착 저항 주면적 ($\\pi d L$)\n2. 정착 한계 부착 전단저항 특성"
        },
        {
          title: "랭킹 주동토압계수(Rankine Active Earth Pressure Coefficient, $K_a$)",
          question: "랭킹 주동토압계수(Rankine Active Earth Pressure Coefficient, $K_a$)",
          concept: "지반이 인장 변형을 일으켜 한계 주동 소성 평형 상태에 도달할 때 가설 옹벽 배면에 수평으로 밀어내는 토압식",
          formula: "$$K_a = \\tan^2\\left(45^\\circ - \\frac{\\phi}{2}\\right) = \\frac{1 - \\sin\\phi}{1 + \\sin\\phi}$$\n$$p_a = K_a \\gamma z - 2 c \\sqrt{K_a}$$\n\n- $K_a$: 주동토압 계수\n- $\\phi$: 흙의 내부마찰각\n- $p_a$: 깊이 $z$에서의 주동토압 강도\n- $\\gamma$: 흙의 단위중량\n- $z$: 검토 단면 깊이\n- $c$: 흙의 점착력",
          structure: "1. 흙의 유효 상재압에 의한 주동토압력\n2. 흙의 자립 점착력에 의한 인장 저항력 감쇄 ($2c\\sqrt{K_a}$)"
        },
        {
          title: "테르자기 1차 압밀방정식(Terzaghi 1D Consolidation, $C_v$)",
          question: "테르자기 1차 압밀방정식(Terzaghi 1D Consolidation, $C_v$)",
          concept: "외부 점진/순간 하중 재하 시 시간이 경과함에 따라 과잉간극수압이 상하 배수층을 통해 소산되어 나가는 속도를 규정한 1차원 미분방정식",
          formula: "$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$\n\n- $u$: 시간 $t$, 깊이 $z$에서의 과잉간극수압\n- $t$: 하중 작용 후 경과 시간\n- $z$: 하중 분담 전파 수직 깊이\n- $C_v$: 압밀계수 ($C_v = \\frac{k}{m_v \\gamma_w}$)\n  * $k$: 투수계수\n  * $m_v$: 체적압축계수\n  * $\\gamma_w$: 물의 단위중량",
          structure: "1. 시간에 따른 수압 변화 항 (\\partial u / \\partial t)\n2. 깊이에 따른 2차 수두 배수 확산 항 (\\partial^2 u / \\partial z^2)"
        },
        {
          title: "보상기초 보상도(Compensated Foundation Safety Factor, $C$)",
          question: "보상기초 보상도(Compensated Foundation Safety Factor, $C$)",
          concept: "구조물 자중을 굴착한 흙의 총 중량으로 완벽히 치환 상쇄하여 순 침하 하중을 Zero로 수렴시키는 평가 공식",
          formula: "$$C = \\frac{\\gamma D_f}{q}$$\n\n- $C$: 보상도 (Compensational ratio, $C = 1.0$이면 완전 보상)\n- $\\gamma$: 굴착하여 배출한 흙의 단위중량\n- $D_f$: 기초의 굴착 깊이\n- $q$: 상부 구조물 총 자중 및 하중 합산값",
          structure: "1. 흙의 굴착 자중 상쇄량 (\\gamma D_f)\n2. 실제 침하를 유발하는 순응력 ($q_{net} = q - \\gamma D_f$)"
        },
        {
          title: "싱글쉘 터널 설계수압(Single Shell Tunnel Design Water Pressure, $p_w$)",
          question: "싱글쉘 터널 설계수압(Single Shell Tunnel Design Water Pressure, $p_w$)",
          concept: "방수가 완벽히 차단된 비배수 터널 아치 배면에 상부 수위 높이에 비례하여 수직으로 가해지는 정수압식",
          formula: "$$p_w = \\gamma_w \\times H$$\n\n- $p_w$: 라이닝 배면 작용 설계 수압\n- $\\gamma_w$: 지하수(물)의 단위중량 ($9.81\\,\\text{kN/m}^3$)\n- $H$: 설계 지하수위 면으로부터 터널 아치 정상까지의 수직 거리 (수두 높이)",
          structure: "1. 비배수 터널의 전수압 설계 한계\n2. 심도와 수두의 완전 비례 관계"
        },
        {
          title: "가설흙막이 수평지반반력계수(Temporary Retaining Wall Horizontal Subgrade Reaction Coefficient, $k_h$)",
          question: "가설흙막이 수평지반반력계수(Temporary Retaining Wall Horizontal Subgrade Reaction Coefficient, $k_h$)",
          concept: "벽체 배면의 지반 탄소성 반응을 등가의 선형 탄성 연속 압축 스프링 강성값으로 치환하는 반력 산정식",
          formula: "$$k_h = k_{h0} \\left(\\frac{B_H}{0.3}\\right)^{-3/4}$$\n\n- $k_h$: 설계 수평 지반반력계수 (탄성 스프링 상수)\n- $k_{h0}$: 직경 $30\\,\\text{cm}$ 강체 원판에 의한 표준 수평 지반반력계수 ($k_{h0} = \\frac{1}{0.3} E_0$)\n- $B_H$: 가상의 기초 환산폭 ($B_H = \\sqrt{A/h}$ 또는 벽체 영향 단위폭)\n- $E_0$: 지반의 탄성계수 (보통 표준관입시험 N치 연동: $E_0 = 2800 N$)",
          structure: "1. 치수 효과(Size Effect) 보정 지수 ($-3/4$승)\n2. 지반의 유효 지반 반력 강성 변환식"
        }
      ];

      // Shuffle defaults randomly
      const shuffled = [...defaultFormulas];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      loadedData = shuffled;
      console.log('[Fallback] Loaded default formula questions.');
    }

    const cleaned = normalizeAndCompactifyFormulas(loadedData).map(healFormulaQuestionObject);
    latestFormulaQuestionsRef.current = cleaned;
    setFormulaQuestions(cleaned);
    localStorage.setItem('anti_formula_questions', JSON.stringify(cleaned));
    
    // Auto sync back to database if loaded from local storage fallback
    if (fallbackToLocal) {
      console.log('[Sync] Auto syncing local formulas to database...');
      fetch(`${API_BASE}/api/session/formula`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formulaQuestions: cleaned })
      }).catch(err => console.warn('[Sync] Auto sync formulas failed:', err));
    }

    setLoadingFormula(false);
    return cleaned;
  };

  const loadTheoryQuestions = async () => { return []; };
  const _loadTheoryQuestions_unused = async () => {
    setLoadingTheory(true);
    let loadedData = null;

    // 1) Try Database Sync
    try {
      const res = await fetch(`${API_BASE}/api/session/theory?t=${Date.now()}`);
      if (res.ok) {
        const body = await res.json();
        if (body && body.data && Array.isArray(body.data.theoryQuestions) && body.data.theoryQuestions.length > 0) {
          loadedData = body.data.theoryQuestions;
          console.log('[Sync] Loaded theory questions from database.');
        }
      }
    } catch (err) {
      console.warn('[Sync] Database theory loading failed:', err);
    }

    // 2) Try LocalStorage Fallback
    if (!loadedData) {
      try {
        const savedStr = localStorage.getItem('anti_theory_questions');
        if (savedStr) {
          const parsed = JSON.parse(savedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            loadedData = parsed;
            console.log('[Fallback] Loaded theory questions from LocalStorage.');
          }
        }
      } catch (err) {
        console.warn('localStorage 이론유도 복원 실패:', err);
      }
    }

    // 3) Fallback to Defaults if still empty
    if (!loadedData) {
      const defaultTheories = [
        {
          title: "Terzaghi 1차원 압밀 지배방정식 유도",
          concept: "점토층 내 과잉간극수압의 소산 및 침하 시간적 추이를 물리적으로 정밀 묘사하는 지배방정식",
          formula: "지배 미분방정식:\n$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$\n\n[주요 유도 가정]:\n1. 흙입자와 물은 압축성이 없음(비압축성)\n2. 흙 속 물의 흐름은 Darcy 법칙을 따름 ($v = k i$)\n3. 압밀은 1차원으로만 진행되며 흙의 공극비 변화는 유효응력 증가에 선형 비례함 ($a_v$ 일정)"
        },
        {
          title: "Terzaghi 얕은기초 극한지지력 공식의 유도",
          concept: "기초 저면 아래 지반의 전단 전파 거동(일반 전단 파괴)을 극한 상태 한계 평형으로 수치화한 지지력 공식",
          formula: "Terzaghi 극한 지지력:\n$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$\n\n[유도 메커니즘]:\n- 지반 파괴 영역을 3개 zone(Zone I: 탄성 쐐기, Zone II: 대수나선 방사형 전단 영역, Zone III: Rankine 수동 수평 지반 영역)으로 분할하여 상부 하중 벡터와 전단 저항 한계선 결합"
        },
        {
          title: "Rankine 주동토압 공식의 이론적 유도",
          concept: "지반이 가설 벽체 배면 방향으로 팽창 변형을 일으켜 한계 인장 소성 상태에 도달할 때의 수평 응력",
          formula: "주동토압 강도 식:\n$$p_a = \\gamma z K_a - 2 c \\sqrt{K_a}$$\n\n[주요 유도 공식]:\n- Mohr-Coulomb 파괴 포락선과 Mohr 응력원의 접점 기하학적 분석을 통하여 $K_a = \\tan^2(45^\\circ - \\phi/2)$ 수식 도출"
        }
      ];
      loadedData = defaultTheories;
    }

    const cleaned = (loadedData || []).map(healTheoryQuestionObject);
    latestTheoryQuestionsRef.current = cleaned;
    setTheoryQuestions(cleaned);
    localStorage.setItem('anti_theory_questions', JSON.stringify(cleaned));
    setLoadingTheory(false);
    return loadedData;
  };

  const handleSaveTheoryQuestions = async () => {};
  const _handleSaveTheoryQuestions_unused = async () => {
    try {
      const healedQs = Array.isArray(qs) ? qs.map(healTheoryQuestionObject) : qs;
      latestTheoryQuestionsRef.current = healedQs;
      setTheoryQuestions(healedQs);
      localStorage.setItem('anti_theory_questions', JSON.stringify(healedQs));
      
      // Sync with database for cross-device support (AWAITED to avoid timing issues)
      const res = await fetch(`${API_BASE}/api/session/theory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theoryQuestions: healedQs })
      });

      if (!res.ok) {
        throw new Error('Database sync returned non-OK status');
      }

      if (showToast) {
        showNotification('이론유도 리스트가 성공적으로 저장되었습니다!', 'success');
      }
    } catch (err) {
      console.warn('이론유도 저장 실패:', err);
      if (showToast) {
        showNotification('서버 저장 실패: 로컬 스토리지에만 저장됩니다.', 'warning');
      }
    }
  };

  const handleUploadTheoryPdf = async () => {};
  const _handleUploadTheoryPdf_unused = async () => {
    if (!file) return;
    const fileNameLower = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf');
    const isHtml = file.type === 'text/html' || fileNameLower.endsWith('.html') || fileNameLower.endsWith('.htm');
    
    if (!isPdf && !isHtml) {
      showNotification('PDF 또는 HTML 파일 형식만 업로드 가능합니다.', 'error');
      return;
    }

    setUploadingTheoryPdf(true);
    showNotification(`[${file.name}] 문서를 업로드하여 AI 분석을 시작합니다...`, 'info');

    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('fileNameUtf8', file.name);

      const res = await fetch(`${API_BASE}/api/session/theory/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'PDF 분석 실패');
      }

      const data = await res.json();
      const theories = data.theories || [];
      if (theories.length === 0) {
        throw new Error('AI 분석 결과에서 이론 유도 문제를 생성하지 못했습니다.');
      }

      // Add to state
      setTheoryQuestions(prev => {
        const newItems = theories.map(t => ({
          title: t.title,
          concept: t.concept || '업로드한 본문 문서를 기반으로 실시간 AI가 분석한 이론식입니다.',
          assumptions: t.assumptions || '',
          formula: t.answer
        }));
        const updated = [...newItems, ...prev].map(healTheoryQuestionObject);
        latestTheoryQuestionsRef.current = updated;
        handleSaveTheoryQuestions(updated, false);
        return updated;
      });

      showNotification(`총 ${theories.length}개의 핵심 이론 유도 문제가 성공적으로 생성되어 리스트 맨 위에 추가되었습니다!`, 'success');
    } catch (err) {
      console.error('Theory upload failed:', err);
      showNotification(err.message || 'PDF 분석 중 오류가 발생했습니다.', 'error');
    } finally {
      setUploadingTheoryPdf(false);
    }
  };

  const handleRefreshTheory = (idx) => {
    if (idx === null || idx === undefined) return;
    const q = theoryQuestions[idx];
    if (!q) return;

    setRefreshingTheoryIdx(idx);
    showNotification(`[${q.title || `Q${idx + 1}`}] 이론 유도를 AI가 정밀 고도화하여 갱신하고 있습니다...`);

    fetch(`${API_BASE}/api/theory/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: q.title,
        answer: q.formula
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('AI 고도화 실패');
        return res.json();
      })
      .then(data => {
        if (data && data.title && data.answer) {
          setTheoryQuestions(prev => {
            const updated = prev.map((item, i) => {
              if (i === idx) {
                return {
                  ...item,
                  title: data.title,
                  concept: data.concept || item.concept,
                  assumptions: data.assumptions || '',
                  formula: data.answer
                };
              }
              return item;
            }).map(healTheoryQuestionObject);
            latestTheoryQuestionsRef.current = updated;
            handleSaveTheoryQuestions(updated, false);
            return updated;
          });
          showNotification(`[${data.title}] 이론 유도가 성공적으로 갱신되었습니다!`, 'success');
        }
      })
      .catch(err => {
        console.error('Theory refresh error:', err);
        showNotification('이론 갱신에 실패했습니다.', 'error');
      })
      .finally(() => {
        setRefreshingTheoryIdx(null);
      });
  };

    const loadAnswersheetQuestions = async () => {
    setLoadingAnswersheet(true);
    let loadedData = null;
    let fallbackToLocal = false;

    try {
      const res = await fetch(`${API_BASE}/api/session/answersheet?t=${Date.now()}`);
      if (res.ok) {
        const body = await res.json();
        if (body && body.data && Array.isArray(body.data.answersheetQuestions)) {
          loadedData = body.data.answersheetQuestions;
          console.log('[Sync] Loaded answersheet questions from database.');
        }
      }
    } catch (err) {
      console.warn('[Sync] Database answersheet loading failed:', err);
    }

    if (loadedData === null) {
      try {
        const savedStr = localStorage.getItem('anti_answersheet_questions');
        if (savedStr) {
          const parsed = JSON.parse(savedStr);
          if (Array.isArray(parsed)) {
            loadedData = parsed;
            fallbackToLocal = true;
            console.log('[Fallback] Loaded answersheet questions from LocalStorage.');
          }
        }
      } catch (err) {
        console.warn('localStorage 답안지 복원 실패:', err);
      }
    }

    if (loadedData === null) {
      loadedData = [];
    }

    const cleaned = (loadedData || []).map(healAnswersheetQuestionObject);
    latestAnswersheetQuestionsRef.current = cleaned;
    setAnswersheetQuestions(cleaned);
    localStorage.setItem('anti_answersheet_questions', JSON.stringify(cleaned));
    
    // Auto sync back to database if loaded from local storage fallback
    if (fallbackToLocal) {
      console.log('[Sync] Auto syncing local answersheet to database...');
      fetch(`${API_BASE}/api/session/answersheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answersheetQuestions: cleaned })
      }).catch(err => console.warn('[Sync] Auto sync answersheet failed:', err));
    }

    setLoadingAnswersheet(false);
    return loadedData;
  };

  const handleSaveAnswersheetQuestions = async (qs = answersheetQuestions, showToast = true) => {
    try {
      const healedQs = Array.isArray(qs) ? qs.map(healAnswersheetQuestionObject) : qs;
      latestAnswersheetQuestionsRef.current = healedQs;
      setAnswersheetQuestions(healedQs);
      localStorage.setItem('anti_answersheet_questions', JSON.stringify(healedQs));
      
      const res = await fetch(`${API_BASE}/api/session/answersheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answersheetQuestions: healedQs })
      });

      if (!res.ok) {
        throw new Error('Database sync returned non-OK status');
      }

      if (showToast) {
        showNotification('답안지 리스트가 성공적으로 저장되었습니다!', 'success');
      }
    } catch (err) {
      console.warn('답안지 저장 실패:', err);
      if (showToast) {
        showNotification('서버 저장 실패: 로컬 스토리지에만 저장됩니다.', 'warning');
      }
    }
  };

  const handleUploadAnswersheetPdf = async (file) => {
    if (!file) return;
    const fileNameLower = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf');
    const isHtml = file.type === 'text/html' || fileNameLower.endsWith('.html') || fileNameLower.endsWith('.htm');
    
    if (!isPdf && !isHtml) {
      showNotification('PDF 또는 HTML 파일 형식만 업로드 가능합니다.', 'error');
      return;
    }

    setUploadingAnswersheetPdf(true);
    showNotification(`[${file.name}] 문서를 업로드하여 답안지에 추가 중...`, 'info');

    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('fileNameUtf8', file.name);

      const res = await fetch(`${API_BASE}/api/session/answersheet/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '답안지 업로드 실패');
      }

      const data = await res.json();
      const theories = data.theories || [];
      if (theories.length === 0) {
        throw new Error('답안지 문항을 생성하지 못했습니다.');
      }

      const currentQs = await loadAnswersheetQuestions();
      const newItems = theories.map(t => ({
        title: t.title,
        concept: t.concept || '업로드된 원보고서입니다.',
        assumptions: t.assumptions || '',
        formula: t.formula || t.answer || '',
        answersheet_report_id: t.answersheet_report_id,
        pdf_name: t.pdf_name
      }));
      const updated = [...newItems, ...currentQs];
      latestAnswersheetQuestionsRef.current = updated;
      setAnswersheetQuestions(updated);
      await handleSaveAnswersheetQuestions(updated, false);

      showNotification(`[${file.name}] 보고서가 성공적으로 답안지 탭에 연동 추가되었습니다!`, 'success');
    } finally {
      setUploadingAnswersheetPdf(false);
    }
  };

  const handleAnswersheetDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setAnswersheetDragActive(true);
    } else if (e.type === 'dragleave') {
      setAnswersheetDragActive(false);
    }
  };

  const handleAnswersheetDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAnswersheetDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const fileNameLower = file.name.toLowerCase();
      const isPdf = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf');
      const isHtml = file.type === 'text/html' || fileNameLower.endsWith('.html') || fileNameLower.endsWith('.htm');
      if (isPdf || isHtml) {
        setAnswersheetFile(file);
        if (!answersheetUploadTitle.trim()) {
          const baseName = file.name.replace(/\.[^/.]+$/, "");
          setAnswersheetUploadTitle(baseName);
        }
      } else {
        showNotification('PDF 또는 HTML 파일 형식만 업로드 가능합니다.', 'error');
      }
    }
  };

  const handleAnswersheetFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const fileNameLower = file.name.toLowerCase();
      const isPdf = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf');
      const isHtml = file.type === 'text/html' || fileNameLower.endsWith('.html') || fileNameLower.endsWith('.htm');
      if (isPdf || isHtml) {
        setAnswersheetFile(file);
        if (!answersheetUploadTitle.trim()) {
          const baseName = file.name.replace(/\.[^/.]+$/, "");
          setAnswersheetUploadTitle(baseName);
        }
      } else {
        showNotification('PDF 또는 HTML 파일 형식만 업로드 가능합니다.', 'error');
      }
    }
  };

  const handleRefreshAnswersheet = (idx) => {
    if (idx === null || idx === undefined) return;
    const q = answersheetQuestions[idx];
    if (!q) return;

    setRefreshingAnswersheetIdx(idx);
    showNotification(`[${q.title || `Q${idx + 1}`}] 답안을 AI가 정밀 고도화하여 갱신하고 있습니다...`);

    fetch(`${API_BASE}/api/theory/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: q.title,
        answer: q.formula
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('AI 고도화 실패');
        return res.json();
      })
      .then(data => {
        if (data && data.title && data.answer) {
          setAnswersheetQuestions(prev => {
            const updated = prev.map((item, i) => {
              if (i === idx) {
                return {
                  ...item,
                  title: data.title,
                  concept: data.concept || item.concept,
                  assumptions: data.assumptions || '',
                  formula: data.answer
                };
              }
              return item;
            }).map(healAnswersheetQuestionObject);
            latestAnswersheetQuestionsRef.current = updated;
            handleSaveAnswersheetQuestions(updated, false);
            return updated;
          });
          showNotification(`[${data.title}] 답안이 성공적으로 갱신되었습니다!`, 'success');
        }
      })
      .catch(err => {
        console.error('Answersheet refresh error:', err);
        showNotification('답안 갱신에 실패했습니다.', 'error');
      })
      .finally(() => {
        setRefreshingAnswersheetIdx(null);
      });
  };

  const scrollToAnswersheetCard = (idx) => {
    const container = answersheetBodyRef.current;
    if (!container) return;
    const cards = container.querySelectorAll('.formula-card-item');
    if (cards && cards[idx]) {
      const offsetTop = cards[idx].offsetTop;
      container.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }
  };

  const handleOpenAnswerSheet = async () => {
    setShowAnswerSheet(true);
    setShowExam(false);
    setShowFormulaExam(false);
    setShowTheoryExam(false);
    setAnswersheetMobileTab('list');
    requestAnimationFrame(() => {
      if (answersheetSplitContainerRef.current) answersheetSplitContainerRef.current.scrollLeft = 0;
    });

    await loadAnswersheetQuestions();

    requestAnimationFrame(() => {
      if (answersheetBodyRef.current) answersheetBodyRef.current.scrollTop = savedAnswersheetScroll.current;
    });
  };

// ── 마운트 시 필수공식 및 이론유도 최우선 서버 동기화 로딩
  useEffect(() => {
    loadFormulaQuestions().catch(e => console.warn('서버 필수공식 사전로딩 실패:', e));
    loadTheoryQuestions().catch(e => console.warn('서버 이론유도 사전로딩 실패:', e));
  }, []);

  // ── 필수공식 및 이론유도 오픈 상태 브라우저 새로고침 영구 유지 연동
  useEffect(() => {
    localStorage.setItem('anti_show_formula_exam', showFormulaExam ? 'true' : 'false');
  }, [showFormulaExam]);

  useEffect(() => {
    localStorage.setItem('anti_show_theory_exam', showTheoryExam ? 'true' : 'false');
  }, [showTheoryExam]);

  useEffect(() => {
    localStorage.setItem('anti_show_exam', showExam ? 'true' : 'false');
  }, [showExam]);

  useEffect(() => {
    localStorage.setItem('anti_show_answersheet', showAnswerSheet ? 'true' : 'false');
  }, [showAnswerSheet]);

  useEffect(() => {
    localStorage.setItem('anti_formula_revealed', JSON.stringify(formulaRevealed));
  }, [formulaRevealed]);

  useEffect(() => {
    localStorage.setItem('anti_theory_revealed', JSON.stringify(theoryRevealed));
  }, [theoryRevealed]);

  useEffect(() => {
    localStorage.setItem('anti_answersheet_revealed', JSON.stringify(answersheetRevealed));
  }, [answersheetRevealed]);

  const handleOpenTheoryExam = async () => {};
  const _handleOpenTheoryExam_unused = async () => {
    setShowTheoryExam(true);
    setTheoryMobileTab('list');
    requestAnimationFrame(() => {
      if (theorySplitContainerRef.current) theorySplitContainerRef.current.scrollLeft = 0;
    });
    
    // Always load the latest synced data from database to ensure multi-device sync
    await loadTheoryQuestions();
    
    requestAnimationFrame(() => {
      if (theoryBodyRef.current) theoryBodyRef.current.scrollTop = savedTheoryScroll.current;
    });
  };

  const handleOpenFormulaExam = async () => {
    setShowFormulaExam(true);
    setFormulaMobileTab('list');
    requestAnimationFrame(() => {
      if (formulaSplitContainerRef.current) formulaSplitContainerRef.current.scrollLeft = 0;
    });
    
    // Always load the latest synced data from database to ensure multi-device sync
    const latest = await loadFormulaQuestions();
    
    requestAnimationFrame(() => {
      if (formulaBodyRef.current) formulaBodyRef.current.scrollTop = savedFormulaScroll.current;
    });
  };

  const handleScrollFormula = (direction) => {
    if (!formulaBodyRef.current) return;
    const cards = formulaBodyRef.current.querySelectorAll('.formula-card-item');
    if (cards.length === 0) return;

    const containerTop = formulaBodyRef.current.getBoundingClientRect().top;
    
    let currentIndex = 0;
    let minDiff = Infinity;
    
    cards.forEach((card, idx) => {
      const rect = card.getBoundingClientRect();
      const diff = Math.abs(rect.top - containerTop - 10);
      if (diff < minDiff) {
        minDiff = diff;
        currentIndex = idx;
      }
    });

    let targetIndex = currentIndex;
    if (direction === 'down') {
      targetIndex = Math.min(currentIndex + 1, cards.length - 1);
    } else if (direction === 'up') {
      targetIndex = Math.max(currentIndex - 1, 0);
    }

    const targetCard = cards[targetIndex];
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleScrollTheory = (direction) => {
    if (!theoryBodyRef.current) return;
    const cards = theoryBodyRef.current.querySelectorAll('.formula-card-item');
    if (cards.length === 0) return;

    const containerTop = theoryBodyRef.current.getBoundingClientRect().top;
    
    let currentIndex = 0;
    let minDiff = Infinity;
    
    cards.forEach((card, idx) => {
      const rect = card.getBoundingClientRect();
      const diff = Math.abs(rect.top - containerTop - 10);
      if (diff < minDiff) {
        minDiff = diff;
        currentIndex = idx;
      }
    });

    let targetIndex = currentIndex;
    if (direction === 'down') {
      targetIndex = Math.min(currentIndex + 1, cards.length - 1);
    } else if (direction === 'up') {
      targetIndex = Math.max(currentIndex - 1, 0);
    }

    const targetCard = cards[targetIndex];
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 정답확인 클릭 시 카드가 스크롤 영역 상단에 부드럽게 안착되도록 돕는 헬퍼 함수
  const scrollToFormulaCard = (idx) => {
    setTimeout(() => {
      const cardEl = document.getElementById(`formula-card-${idx}`);
      if (cardEl && formulaBodyRef.current) {
        const container = formulaBodyRef.current;
        const offsetTop = cardEl.offsetTop - 16; // 최적의 가독성을 위한 16px 마진 감안
        container.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
    }, 120);
  };

  const scrollToTheoryCard = (idx) => {
    setTimeout(() => {
      const cardEl = document.getElementById(`theory-card-${idx}`);
      if (cardEl && theoryBodyRef.current) {
        const container = theoryBodyRef.current;
        const offsetTop = cardEl.offsetTop - 16;
        container.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
    }, 120);
  };

  // 실시간 튜터 대화에서 공식 마이닝 및 필수공식 리스트 추가 함수
  const handleAddFormulaFromChat = (text) => {
    if (!text) return;

    // 1. Title 마이닝
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    let title = "실시간 추가 공식";
    
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      const line = lines[i];
      const cleanLine = line.replace(/^(#+\s*|\*+\s*)/, '').replace(/\*+$/, '').trim();
      if (cleanLine && cleanLine.length < 30 && !cleanLine.includes('$') && !cleanLine.includes(':')) {
        title = cleanLine;
        break;
      }
    }

    // 2. formula (LaTeX 수식 블록) 발굴
    let formula = "";
    const blockMathRegex = /\$\$(.*?)\$\$/gs;
    const inlineMathRegex = /\$(.*?)\$/g;
    
    let blockMatch = blockMathRegex.exec(text);
    if (blockMatch) {
      formula = `$$${blockMatch[1].trim()}$$`;
    } else {
      let inlineMatch = inlineMathRegex.exec(text);
      if (inlineMatch) {
        formula = `$$${inlineMatch[1].trim()}$$`;
      }
    }

    // 3. 기호 정의 목록 발굴
    const definitionLines = [];
    const definitionRegex = /^\s*[-*]\s*(.*?)$/;
    
    lines.forEach(line => {
      if (definitionRegex.test(line) || (line.includes(':') && !line.startsWith('http') && line.length < 100)) {
        definitionLines.push(line);
      }
    });

    if (definitionLines.length > 0) {
      if (formula) {
        formula += "\n\n" + definitionLines.join('\n');
      } else {
        formula = definitionLines.join('\n');
      }
    }

    // 4. concept 수확
    let concept = "실시간 튜터링을 통해 추가된 전공 공식에 대한 설명입니다.";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = line.replace(/^(#+\s*|\*+\s*)/, '').replace(/\*+$/, '').trim();
      if (
        cleanLine &&
        !cleanLine.includes('$') &&
        !cleanLine.includes(':') &&
        !cleanLine.startsWith('-') &&
        !cleanLine.startsWith('*') &&
        cleanLine.length > 10 &&
        cleanLine !== title
      ) {
        concept = cleanLine;
        break;
      }
    }

    // 5. Question 합성
    const question = title;

    // 6. structure 합성
    const structure = "1. 공식 구성 인자의 물리적/역학적 상관관계 분석\n2. 기술사 답안 작성을 위한 공식의 실무적 의의 이해";

    const newFormula = {
      title,
      question,
      concept,
      formula,
      structure
    };

    setFormulaQuestions(prev => {
      const updated = [newFormula, ...prev].map(healFormulaQuestionObject);
      handleSaveFormulaQuestions(updated, false);
      return updated;
    });
    showNotification(`[${title}] 공식이 필수공식 퀴즈(Q1)에 성공적으로 추가되었습니다!`);
  };

  // 특정 큰 수식 블록 우측에서 개별 추가 시 지능적 마이닝 처리 함수
  const handleAddSpecificFormula = (mathContent, fullText) => {
    if (!mathContent || !fullText) return;

    const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
    
    // 이 수식이 위치한 line index 찾기
    let targetMathLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(mathContent)) {
        targetMathLineIdx = i;
        break;
      }
    }

    // 1. Title 마이닝 (수식 윗방향으로 헤더나 의미 있는 구절 탐색)
    let title = "실시간 추출 공식";
    if (targetMathLineIdx !== -1) {
      for (let i = targetMathLineIdx - 1; i >= 0; i--) {
        const line = lines[i];
        const cleanLine = line.replace(/^(#+\s*|\*+\s*)/, '').replace(/\*+$/, '').trim();
        // markdown header 거나, 짧고 강렬한 구절(3~35자) 이면서 수식이 들어있지 않은 줄
        if (cleanLine && cleanLine.length >= 3 && cleanLine.length <= 35 && !cleanLine.includes('$') && !cleanLine.includes(':')) {
          title = cleanLine;
          break;
        }
      }
    }

    // Title 기본 예외 처리 및 정리 (수식 기호 기반 보완)
    if (title === "실시간 추출 공식" || title.length > 40) {
      if (mathContent.includes('Z =') || mathContent.includes('Z=')) {
        title = "투수계수 가설검정 Z통계량";
      } else if (mathContent.includes('k =') || mathContent.includes('k=')) {
        title = "Darcy 투수계수 산정식";
      }
    }

    // 2. formula (LaTeX 대표 수식 + 바로 아래 기호설명 병합)
    let formula = `$$${mathContent}$$`;
    const definitionLines = [];
    
    if (targetMathLineIdx !== -1) {
      // 수식 바로 아래 줄부터 기호 정의가 나오는지 순방향 탐색 (최대 4줄 검사)
      for (let i = targetMathLineIdx + 1; i < Math.min(lines.length, targetMathLineIdx + 5); i++) {
        const line = lines[i];
        if (line.startsWith('여기서') || line.startsWith('-') || line.startsWith('*') || line.includes('는') || line.includes('은')) {
          definitionLines.push(line);
        } else {
          break;
        }
      }
    }

    if (definitionLines.length > 0) {
      formula += "\n\n" + definitionLines.join('\n');
    }

    // 3. concept (수식 이전 줄들 중 설명글 탐색)
    let concept = "실시간 공식 튜터링 대화에서 개별 추출된 전공 공식입니다.";
    if (targetMathLineIdx !== -1) {
      for (let i = targetMathLineIdx - 1; i >= 0; i--) {
        const line = lines[i];
        const cleanLine = line.replace(/^(#+\s*|\*+\s*)/, '').replace(/\*+$/, '').trim();
        if (
          cleanLine &&
          cleanLine.length > 10 &&
          !cleanLine.includes('$') &&
          !cleanLine.includes(':') &&
          !cleanLine.startsWith('-') &&
          !cleanLine.startsWith('*') &&
          cleanLine !== title
        ) {
          concept = cleanLine;
          break;
        }
      }
    }

    // 4. Question 합성
    const question = title;

    // 5. initialFormula 정의 (실시간 AI 로딩 인디케이터 부착)
    const initialFormula = formula + "\n\n⏳ 각 변수/상수의 상세 의미를 AI가 분석하고 있습니다...";

    const newFormula = {
      id: `f-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // 실시간 비동기 매칭용 고유 ID
      title,
      question,
      concept,
      formula: initialFormula
    };

    setFormulaQuestions(prev => {
      const updated = [newFormula, ...prev].map(healFormulaQuestionObject);
      handleSaveFormulaQuestions(updated, false);
      return updated;
    });

    setFormulaAddedTarget({ title });

    // 6. 백그라운드 AI 정밀 공식 작명 및 변수/상수 해설 API 비동기 가동
    fetch(`${API_BASE}/api/formula/suggest-title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mathContent, fullText })
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (data && data.error) {
          throw new Error(data.error);
        }
        if (data && data.title) {
          const suggestedTitle = data.title;
          const suggestedConcept = data.concept;
          const suggestedStructure = data.structure;
          setFormulaQuestions(prev => {
            const updated = prev.map(f => {
              if (f.id === newFormula.id) {
                return {
                  ...f,
                  title: suggestedTitle,
                  question: suggestedTitle,
                  concept: suggestedConcept || f.concept,
                  formula: `$$${mathContent}$$` + (suggestedStructure ? "\n\n" + suggestedStructure : ""),
                  structure: suggestedStructure || f.structure
                };
              }
              return f;
            }).map(healFormulaQuestionObject);
            handleSaveFormulaQuestions(updated, false);
            return updated;
          });
          showNotification(`[${suggestedTitle}] 공식과 변수 해설이 AI 추천 분석을 거쳐 정밀 업데이트되었습니다!`, 'success');
        } else {
          throw new Error('API returned empty title');
        }
      })
      .catch(err => {
        console.warn('AI 타이틀 추천 반영 실패 (로컬 기본값 보존):', err);
        setFormulaQuestions(prev => {
          const updated = prev.map(f => {
            if (f.id === newFormula.id) {
              const localStructure = clientExtractVariables(mathContent);
              return {
                ...f,
                formula: `$$${mathContent}$$` + (localStructure ? "\n\n" + localStructure : ""),
                structure: localStructure
              };
            }
            return f;
          }).map(healFormulaQuestionObject);
          handleSaveFormulaQuestions(updated, false);
          return updated;
        });
      });
  };

  window.__handleAddSpecificFormula = handleAddSpecificFormula;

  // 필수공식 개별 리프레쉬 (AI 분석 재요청 및 갱신)
  const handleRefreshFormula = (idx) => {
    if (idx === null || idx === undefined) return;
    const q = formulaQuestions[idx];
    if (!q) return;

    // 수식 본문 내 LaTeX 추출
    let mathContent = "";
    const match = q.formula.match(/\$\$(.*?)\$\$/s);
    if (match) {
      mathContent = match[1].trim();
    } else {
      mathContent = q.formula.replace(/^\$\$|\$\$$/g, '').trim();
    }

    setRefreshingFormulaIdx(idx);
    showNotification(`[${q.title || `Q${idx + 1}`}] 공식을 AI가 정밀 분석하여 재생성하고 있습니다...`);

    fetch(`${API_BASE}/api/formula/suggest-title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mathContent,
        fullText: `${q.concept || ''}\n${q.formula || ''}`
      })
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (data && data.error) {
          throw new Error(data.error);
        }
        if (data && data.title) {
          const suggestedTitle = data.title;
          const suggestedConcept = data.concept;
          const suggestedStructure = data.structure;
          setFormulaQuestions(prev => {
            const updated = prev.map((f, i) => {
              if (i === idx) {
                return {
                  ...f,
                  title: suggestedTitle,
                  question: suggestedTitle,
                  concept: suggestedConcept || f.concept,
                  formula: `$$${mathContent}$$` + (suggestedStructure ? "\n\n" + suggestedStructure : ""),
                  structure: suggestedStructure || f.structure
                };
              }
              return f;
            }).map(healFormulaQuestionObject);
            latestFormulaQuestionsRef.current = updated;
            handleSaveFormulaQuestions(updated, false);
            return updated;
          });
          showNotification(`[${suggestedTitle}] 공식의 제목, 핵심개념, 기호정의 분석 갱신이 완료되었습니다!`, 'success');
        } else {
          throw new Error('API returned empty title');
        }
      })
      .catch(err => {
        console.warn('공식 리프레쉬 AI 추천 반영 실패:', err);
        showNotification('AI 재분석 호출 중 오류가 발생했습니다.', 'error');
      })
      .finally(() => {
        setRefreshingFormulaIdx(null);
      });
  };

  // 필수공식 개별 AI 조정 (사용자 의견 반영 재작성)
  const handleAdjustFormula = async (idx) => {
    if (idx === null || idx === undefined) return;
    const q = formulaQuestions[idx];
    if (!q) return;

    const feedbackText = adjustingFormulaText[idx] || '';
    if (!feedbackText.trim()) {
      showNotification('공식 조정 의견을 입력해 주세요.', 'warning');
      return;
    }

    // 수식 본문 내 LaTeX 추출
    let mathContent = "";
    const match = q.formula.match(/\$\$(.*?)\$\$/s);
    if (match) {
      mathContent = match[1].trim();
    } else {
      mathContent = q.formula.replace(/^\$\$|\$\$$/g, '').trim();
    }

    setAdjustingFormulaLoading(prev => ({ ...prev, [idx]: true }));
    showNotification(`[${q.title || `Q${idx + 1}`}] 공식을 사용자 피드백을 반영하여 재조정 중입니다...`);

    try {
      const res = await fetch(`${API_BASE}/api/formula/suggest-title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mathContent,
          fullText: `${q.concept || ''}\n${q.formula || ''}`,
          userFeedback: feedbackText
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      if (data && data.error) {
        throw new Error(data.error);
      }

      if (data && data.title) {
        const suggestedTitle = data.title;
        const suggestedConcept = data.concept;
        const suggestedStructure = data.structure;

        setFormulaQuestions(prev => {
          const updated = prev.map((f, i) => {
            if (i === idx) {
              return {
                ...f,
                title: suggestedTitle,
                question: suggestedTitle,
                concept: suggestedConcept || f.concept,
                formula: `$$${mathContent}$$` + (suggestedStructure ? "\n\n" + suggestedStructure : ""),
                structure: suggestedStructure || f.structure
              };
            }
            return f;
          }).map(healFormulaQuestionObject);
          latestFormulaQuestionsRef.current = updated;
          handleSaveFormulaQuestions(updated, false);
          return updated;
        });

        showNotification(`[${suggestedTitle}] 공식이 사용자 피드백을 반영하여 재조정되었습니다!`, 'success');
        setAdjustingFormulaInputKey(null); // 입력창 닫기
      } else {
        throw new Error('API returned empty title');
      }
    } catch (err) {
      console.warn('공식 피드백 AI 조정 실패:', err);
      showNotification('AI 공식 조정 호출 중 오류가 발생했습니다.', 'error');
    } finally {
      setAdjustingFormulaLoading(prev => ({ ...prev, [idx]: false }));
    }
  };

  // 필수공식 이론유도 질문 (실시간 튜터 연동)
  const handleAskTheoryDerivation = async (title, formula) => {
    if (isChatLoading) return;
    
    // LaTeX 기호 마크다운 전처리
    const cleanTitle = (title || '').replace(/\$/g, '').trim();
    const promptText = `기술사 시험을 대비하여, [${cleanTitle}] 공식의 상세한 이론적 배경과 수학적/역학적 유도 과정을 수험생의 눈높이에 맞춰 친절하고 구조적으로 유도해 설명해 주세요.\n\n공식 식: ${formula || ''}`;
    
    const userMsgIdx = chatHistory.length;
    setChatHistory(prev => [...prev, { role: 'user', text: promptText }]);
    setIsChatLoading(true);

    requestAnimationFrame(() => {
      if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    });

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history: chatHistory.map(h => ({ role: h.role, text: h.text })), 
          message: promptText,
          image: null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '답변 생성 실패');
      setChatHistory(prev => [...prev, { role: 'model', text: data.text }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'model', text: `오류가 발생했습니다: ${err.message}` }]);
    } finally {
      setIsChatLoading(false);
      requestAnimationFrame(() => {
        const parent = chatBodyRef.current;
        const userMsgEl = parent?.querySelector(`#chat-msg-${userMsgIdx}`);
        if (parent && userMsgEl) {
          const parentRect = parent.getBoundingClientRect();
          const childRect = userMsgEl.getBoundingClientRect();
          const relativeTop = childRect.top - parentRect.top + parent.scrollTop;
          parent.scrollTo({ top: relativeTop, behavior: 'smooth' });
        } else if (parent) {
          parent.scrollTop = parent.scrollHeight;
        }
      });
    }
  };

  // Formula AI Tutor handlers
  const handleFormulaSelect = (idx) => {
    setSelectedFormulaIdx(idx);
  };

  const handleGenerateFormulaProblem = async (idx) => {
    if (idx === -1) return;
    setSelectedFormulaIdx(idx);
    setFormulaMobileTab('tutor');
    
    // Explicitly set loading state for the specific index to prevent state races
    const topicKey = selectedTopic?.id || 'default';
    const chatKey = `anti_formula_chat_history_${topicKey}_${idx}`;
    const initialHistory = [{ role: 'model', text: '📝 문제를 생성 중입니다... 잠시만 기다려주세요.' }];
    localStorage.setItem(chatKey, JSON.stringify(initialHistory));
    setFormulaChatHistory(initialHistory);
    
    setIsFormulaChatLoading(true);

    const selected = formulaQuestions[idx];
    if (!selected) {
      setIsFormulaChatLoading(false);
      return;
    }

    const promptText = `[수험생이 선택하여 문제를 출제받고자 하는 공식 정보: 공식명 - ${selected.title || ''}, 공식 - ${selected.formula || ''}, 주요 개념 - ${selected.concept || ''}]

위 공식을 활용하여 풀 수 있는 정량적(수치 계산이 포함된) 주관식 문제를 하나 출제해주세요.
반드시 다음 지침을 준수해야 합니다:
1. 계산에 필요한 조건과 수치(예: 탄성계수 E = 200 GPa, 포아송비 v = 0.3 등)를 구체적이고 명확하게 제시하세요.
2. 처음 출제하는 답변에는 절대 정답 수치나 풀이 과정(해설)을 함께 적지 마세요. 사용자가 직접 주관식 답안을 계산하여 입력하고 피드백을 받을 수 있도록 오직 문제 내용과 질문만 제공해야 합니다.
3. 사용자가 주관식 답안을 입력할 수 있도록 "답안을 댓글(채팅)창에 주관식으로 입력해 주세요."와 같은 안내를 덧붙여 주세요.
4. 친절하고 전문적인 AI 공학 튜터의 톤앤매너로 출제해주세요.`;

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: [],
          message: promptText,
          image: null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '문제 출제 실패');
      
      const newHistory = [{ role: 'model', text: data.text }];
      localStorage.setItem(chatKey, JSON.stringify(newHistory));
      setFormulaChatHistory(newHistory);
    } catch (err) {
      const newHistory = [{ role: 'model', text: `문제를 출제하는 중 오류가 발생했습니다: ${err.message}` }];
      localStorage.setItem(chatKey, JSON.stringify(newHistory));
      setFormulaChatHistory(newHistory);
    } finally {
      setIsFormulaChatLoading(false);
      requestAnimationFrame(() => {
        if (formulaChatBodyRef.current) {
          formulaChatBodyRef.current.scrollTop = formulaChatBodyRef.current.scrollHeight;
        }
      });
    }
  };

  const handleSendFormulaChatMessage = async (e) => {
    if (e) e.preventDefault();
    if (isFormulaChatLoading || !formulaChatInput.trim() || selectedFormulaIdx === -1) return;
    
    const userMessage = formulaChatInput.trim();
    setFormulaChatInput('');
    
    const updatedHistory = [...formulaChatHistory, { role: 'user', text: userMessage }];
    saveFormulaChatHistory(updatedHistory);
    setIsFormulaChatLoading(true);
    
    requestAnimationFrame(() => {
      if (formulaChatBodyRef.current) {
        formulaChatBodyRef.current.scrollTop = formulaChatBodyRef.current.scrollHeight;
      }
    });
    
    const selected = formulaQuestions[selectedFormulaIdx];
    const promptText = `[수험생이 선택하여 논의 중인 공식 정보: 공식명 - ${selected.title || ''}, 공식 - ${selected.formula || ''}, 주요 개념 - ${selected.concept || ''}]\n\n질문: ${userMessage}`;
    
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: formulaChatHistory.map(h => ({ role: h.role, text: h.text })),
          message: promptText,
          image: null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '답변 생성 실패');
      saveFormulaChatHistory(prev => [...prev, { role: 'model', text: data.text }]);
    } catch (err) {
      saveFormulaChatHistory(prev => [...prev, { role: 'model', text: `오류가 발생했습니다: ${err.message}` }]);
    } finally {
      setIsFormulaChatLoading(false);
      requestAnimationFrame(() => {
        if (formulaChatBodyRef.current) {
          formulaChatBodyRef.current.scrollTop = formulaChatBodyRef.current.scrollHeight;
        }
      });
    }
  };

  // View full report text
  const handleViewFullReport = async (topicId) => {
    setLoadingReport(true);
    setShowFullReport(true);
    try {
      const res = await fetch(`${API_BASE}/api/topics/${topicId}/text`);
      const data = await res.json();
      if (res.ok) {
        setReportText(data.text || '보고서 내용이 비어 있습니다.');
      } else {
        setReportText(`오류: ${data.error || '보고서를 불러오지 못했습니다.'}`);
      }
    } catch (err) {
      console.error("Error fetching report:", err);
      setReportText("서버 통신 오류로 보고서를 불러오지 못했습니다.");
    } finally {
      setLoadingReport(false);
    }
  };

  // Toggle reveal state for specific question index
  const handleToggleReveal = (index) => {
    setRevealedQuestions(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Drag and Drop File Handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const fileNameLower = file.name.toLowerCase();
      const isPdf = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf');
      const isHtml = file.type === 'text/html' || fileNameLower.endsWith('.html') || fileNameLower.endsWith('.htm');
      if (isPdf || isHtml) {
        setPdfFile(file);
        // Auto-populate title with filename without extension
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        setTitle(baseName);
      } else {
        showNotification('PDF 또는 HTML 파일 형식만 업로드 가능합니다.', 'error');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPdfFile(file);
      // Auto-populate title with filename without extension
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      setTitle(baseName);
    }
  };

  // Helper colors for spaced repetition rounds
  const getRoundBadgeStyle = (round) => {
    switch (round) {
      case 1: return 'bg-violet-950/60 text-violet-300 border border-violet-500/30';
      case 2: return 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/30';
      case 3: return 'bg-blue-950/60 text-blue-300 border border-blue-500/30';
      case 4: return 'bg-amber-950/60 text-amber-300 border border-amber-500/30';
      case 5: return 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30';
      case 6: return 'bg-rose-950/60 text-rose-300 border border-rose-500/30';
      default: return 'bg-slate-900 text-slate-300';
    }
  };

  // Completion calculation for header stats
  const totalCompletedCount = Array.isArray(allTopics) 
    ? allTopics.reduce((acc, topic) => {
        if (!topic) return acc;
        const completedForTopic = topic.schedules?.filter(s => s && s.status === 'completed' && s.review_round !== 99).length || 0;
        return acc + completedForTopic;
      }, 0)
    : 0;
  const totalScheduleCount = Array.isArray(allTopics) ? allTopics.length * 6 : 0;
  const overallProgressPercent = totalScheduleCount > 0 ? Math.round((totalCompletedCount / totalScheduleCount) * 100) : 0;
  const isModalOpen = !!(selectedTopic || showExam || showFormulaExam || showTheoryExam);

  // ── Restore active modal data on mount after all functions are defined
  useEffect(() => {
    try {
      const saved = localStorage.getItem('anti_app_state');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.selectedTopic) {
          console.log('[Mount Restore] Restoring selected topic AI questions:', s.selectedTopic);
          handleOpenAIQuestions(
            s.selectedTopic.id, 
            s.selectedTopic.title, 
            s.selectedTopic.keywords, 
            s.selectedTopic.pdf_name, 
            s.selectedTopic.mode || 'ai', 
            s.selectedTopic.schedule_id, 
            s.selectedTopic.review_round, 
            s.selectedTopic.isBonus
          ).catch(e => console.warn('[Mount Restore] Failed to load AI questions:', e));
        }
      }
    } catch (e) {
      console.warn('[Mount Restore] Failed to parse saved state for AI questions:', e);
    }

    // Unconditionally load answersheet questions on mount to prevent state desync and subsequent data loss
    loadAnswersheetQuestions().catch(e => console.warn('[Mount Restore] Failed to load answersheet:', e));
  }, []);

  return (
    <div className="min-h-screen bg-slateCustom-950 pb-16 flex flex-col justify-start">
      {/* Mobile Mock Status Bar on Main Page */}
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl transition-all duration-300 transform scale-100 ${
          notification.type === 'error' 
            ? 'bg-rose-950/90 text-rose-200 border border-rose-500/50' 
            : 'bg-emerald-950/90 text-emerald-200 border border-emerald-500/50'
        }`}>
          {notification.type === 'error' ? <Info size={20} /> : <CheckCircle size={20} />}
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Top Premium Navbar */}
      <header className="w-full glass-panel border-b border-slate-800 py-5 px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-40 landscape-hide">
        <div className="flex items-center gap-4 landscape-hide">
          <div className="p-3 bg-gradient-to-tr from-brand-600 to-indigo-500 rounded-2xl glow-purple flex items-center justify-center">
            {(!isDesktop && !isMobileLandscape) ? (
              <span className="text-2xl select-none leading-none">👦👧</span>
            ) : (
              <Brain className="text-white" size={28} />
            )}
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-brand-400 bg-clip-text text-transparent">
              {(!isDesktop && !isMobileLandscape) ? '집중, 노력, 끈기' : '기술사 Spaced Repetition 복습 시스템'}
            </h1>
            {(!(!isDesktop && !isMobileLandscape)) && (
              <p className="text-xs md:text-sm text-slate-400 font-medium">
                에빙하우스 망각곡선 기반 스케줄링 & AI 기출 예상문제 출제 비서
              </p>
            )}
          </div>
        </div>

        {/* Date Tester Slider & Tabs */}
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          {(!isDesktop && !isMobileLandscape) ? null : (
            <div className="flex items-center gap-3 bg-slateCustom-900 border border-slate-800 rounded-xl px-4 py-2 w-full md:w-auto">
              <Calendar size={16} className="text-brand-400" />
              <label className="text-xs font-semibold text-slate-400 whitespace-nowrap">복습 기준일:</label>
              <input 
                type="date" 
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
                className="bg-transparent text-sm font-bold text-white border-0 focus:ring-0 focus:outline-none cursor-pointer w-full"
              />
              {referenceDate !== getTodayString() && (
                <button 
                  onClick={() => setReferenceDate(getTodayString())}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors flex-shrink-0"
                  title="오늘 날짜로 리셋"
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          )}

          <div className="flex md:hidden landscape-flex-important flex-col gap-2 w-full">
            {/* 첫 번째 줄 */}
            <div className="flex gap-2 w-full">
              <button
                onClick={() => { forceSaveActiveSessions(); setViewMode('dashboard'); }}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl transition-all duration-200 border border-slate-800/80 cursor-pointer ${
                  viewMode === 'dashboard'
                    ? 'bg-brand-600 text-white shadow-md'
                    : 'bg-slateCustom-900/60 text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Calendar size={14} />
                오늘의 복습
              </button>
              <button
                onClick={() => { forceSaveActiveSessions(); setViewMode('all_topics'); }}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl transition-all duration-200 border border-slate-800/80 cursor-pointer ${
                  viewMode === 'all_topics'
                    ? 'bg-brand-600 text-white shadow-md'
                    : 'bg-slateCustom-900/60 text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <List size={14} />
                복습토픽 ({allTopics.length})
              </button>
              <button
                onClick={() => { forceSaveActiveSessions(); handleOpenExam(); }}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-amber-400 hover:text-amber-200 border border-slate-800/80 hover:bg-amber-950/40 rounded-xl transition-all duration-200 cursor-pointer"
              >
                <Award size={14} />
                종합평가
              </button>
            </div>
            
            {/* 두 번째 줄 */}
            <div className="flex gap-2 w-full">
              <button
                onClick={() => { forceSaveActiveSessions(); handleOpenFormulaExam(); }}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-rose-400 hover:text-rose-200 border border-slate-800/80 hover:bg-rose-950/40 rounded-xl transition-all duration-200 cursor-pointer"
              >
                <Sigma size={14} />
                필수공식
              </button>
              <button
                onClick={() => { forceSaveActiveSessions(); handleOpenAnswerSheet(); }}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 border border-slate-800/80 rounded-xl transition-all duration-200 cursor-pointer ${
                  showAnswerSheet
                    ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg'
                    : 'bg-slateCustom-900/60 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/40'
                }`}
              >
                <FileText size={14} />
                답안지
              </button>
            </div>

            {/* 공부중 버튼 instead of 복습기준일 on mobile portrait under all_topics and dashboard, placed under the 6 switcher buttons */}
            {!isDesktop && !isMobileLandscape && (viewMode === 'all_topics' || viewMode === 'dashboard') && lastActiveReview && (
              <button
                onClick={handleOpenLastActiveReview}
                className="flex bg-light-rainbow-animate border rounded-2xl py-1.5 px-3 items-center gap-2 cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-95 text-left shadow-[0_4px_20px_rgba(0,0,0,0.12)] relative overflow-hidden group select-none w-full mt-2"
                title={`가장 최근 진행한 복습: [${lastActiveReview.title}] (클릭 시 이어서 학습)`}
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-white/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="p-1.5 bg-slate-950/10 text-slate-900 rounded-lg group-hover:bg-slate-950/15 transition-all duration-300 flex-shrink-0 relative">
                  <Clock size={16} className="text-slate-950" />
                </div>
                <div className="min-w-0 flex-grow relative text-slate-950">
                  <h3 className="text-xs font-black text-slate-950 truncate leading-tight">
                    {lastActiveReview.title}
                  </h3>
                </div>
              </button>
            )}
          </div>
        </div>
      </header>


      {/* Main Content Area */}
      <main className={`w-full mx-auto px-3 md:px-12 md:pl-36 landscape-pl-0 mt-8 flex-grow ${viewMode === 'all_topics' ? 'max-w-none xl:max-w-none 2xl:max-w-none' : 'max-w-7xl xl:max-w-[85rem] 2xl:max-w-[95rem]'}`}>
        {isMobileLandscape && landscapeSidebarHidden && (
          <button
            onClick={() => setLandscapeSidebarHidden(false)}
            className="fixed top-2 left-2 z-50 flex items-center justify-center w-8 h-8 rounded-lg bg-slateCustom-900/90 text-slate-300 border border-slate-800 hover:text-white hover:bg-slate-800 transition-all cursor-pointer shadow-md select-none active:scale-95"
            title="메뉴 열기"
          >
            <ChevronRight size={16} />
          </button>
        )}
        <div className={`flex flex-col landscape-dashboard-row gap-0 ${landscapeSidebarHidden ? 'sidebar-collapsed' : ''}`}>
          <div 
            className={`landscape-dashboard-left ${landscapeSidebarHidden ? 'collapsed' : ''}`}
            onTouchStart={handleLandscapeTouchStart}
            onTouchEnd={handleLandscapeTouchEnd}
          >
            {/* Card 3 (공부중) inside the landscape left menu (at the top) */}
            {lastActiveReview && isMobileLandscape && (
              <button
                onClick={handleOpenLastActiveReview}
                className="flex bg-light-rainbow-animate border rounded-xl p-2 items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 text-left w-full select-none mb-3"
                title={`가장 최근 진행한 복습: [${lastActiveReview.title}] (클릭 시 이어서 학습)`}
              >
                <Clock size={12} className="text-slate-950 shrink-0" />
                <span className="text-[9px] font-black text-slate-950 truncate text-ellipsis overflow-hidden whitespace-nowrap max-w-[80px]">공부중: {lastActiveReview.title}</span>
              </button>
            )}

            {isMobileLandscape && (
              <div className="flex flex-col gap-2.5 w-full">
                {/* 오늘의 복습 */}
                <button
                  onClick={() => {
                    forceSaveActiveSessions();
                    setViewMode('dashboard');
                    setSelectedTopic(null);
                    setShowExam(false);
                    setShowFormulaExam(false);
                    setShowTheoryExam(false);
                    setShowAnswerSheet(false);
                  }}
                  className={`flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                    viewMode === 'dashboard' && !selectedTopic && !showExam && !showFormulaExam && !showTheoryExam && !showAnswerSheet
                      ? 'bg-brand-600 text-white border-brand-500 shadow-md glow-purple'
                      : 'bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Calendar size={16} />
                  <span>오늘의 복습</span>
                </button>

                {/* 복습토픽 */}
                <button
                  onClick={() => {
                    forceSaveActiveSessions();
                    setViewMode('all_topics');
                    setSelectedTopic(null);
                    setShowExam(false);
                    setShowFormulaExam(false);
                    setShowTheoryExam(false);
                    setShowAnswerSheet(false);
                  }}
                  className={`flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                    viewMode === 'all_topics' && !selectedTopic && !showExam && !showFormulaExam && !showTheoryExam && !showAnswerSheet
                      ? 'bg-brand-600 text-white border-brand-500 shadow-md glow-purple'
                      : 'bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <List size={16} />
                  <span>복습토픽</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-slateCustom-950 text-brand-400 rounded-full border border-brand-500/20 font-black ml-auto">{allTopics.length}</span>
                </button>

                {/* 종합평가 */}
                <button
                  onClick={() => {
                    forceSaveActiveSessions();
                    setSelectedTopic(null);
                    setShowFormulaExam(false);
                    setShowTheoryExam(false);
                    setShowAnswerSheet(false);
                    handleOpenExam();
                  }}
                  className={`flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                    showExam
                      ? 'bg-gradient-to-tr from-amber-600 to-yellow-500 text-white border-amber-500 shadow-lg glow-amber'
                      : 'bg-slateCustom-900/60 text-amber-400 border-slate-800/80 hover:text-amber-200 hover:bg-amber-950/40'
                  }`}
                >
                  <Award size={16} />
                  <span>종합평가</span>
                </button>

                {/* 필수공식 */}
                <button
                  onClick={() => {
                    forceSaveActiveSessions();
                    setSelectedTopic(null);
                    setShowExam(false);
                    setShowTheoryExam(false);
                    setShowAnswerSheet(false);
                    handleOpenFormulaExam();
                  }}
                  className={`flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                    showFormulaExam
                      ? 'bg-gradient-to-tr from-rose-600 to-pink-500 text-white border-rose-500 shadow-lg glow-rose'
                      : 'bg-slateCustom-900/60 text-rose-400 border-slate-800/80 hover:text-rose-200 hover:bg-rose-950/40'
                  }`}
                >
                  <Sigma size={16} />
                  <span>필수공식</span>
                </button>


                {/* 답안지 */}
                <button
                  onClick={() => {
                    forceSaveActiveSessions();
                    setSelectedTopic(null);
                    setShowExam(false);
                    setShowFormulaExam(false);
                    setShowTheoryExam(false);
                    handleOpenAnswerSheet();
                  }}
                  className={`flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                    showAnswerSheet
                      ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white border-emerald-500 shadow-lg glow-emerald'
                      : 'bg-slateCustom-900/60 text-emerald-400 border-slate-800/80 hover:text-emerald-200 hover:bg-emerald-950/40'
                  }`}
                >
                  <FileText size={16} />
                  <span>답안지</span>
                </button>
              </div>
            )}

            {/* Statistics Dashboard Banner */}
            {(isDesktop || viewMode !== 'all_topics') && !isMobileLandscape && (
              <section className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
            <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex items-center gap-4 glow-purple">
              <div className="p-3 bg-violet-950/60 text-violet-400 rounded-xl">
                <Clock size={24} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">오늘 복습 대상 토픽</p>
                <h3 className="text-2xl font-black text-white mt-1">
                  {loadingReviews ? '-' : `${todayReviews.length}개`}
                </h3>
              </div>
            </div>

            <div className="hidden md:flex glass-panel rounded-2xl p-5 border border-slate-800 items-center gap-4">
              <div className="p-3 bg-emerald-950/60 text-emerald-400 rounded-xl">
                <CheckCircle size={24} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">학습 시작한 토픽</p>
                <h3 className="text-2xl font-black text-white mt-1">
                  {allTopics.length}개
                </h3>
              </div>
            </div>

            <button
              onClick={handleOpenLastActiveReview}
              className="hidden md:flex bg-light-rainbow-animate border rounded-2xl p-5 items-center gap-4 cursor-pointer transition-all duration-300 hover:scale-[1.03] active:scale-95 text-left shadow-[0_4px_20px_rgba(0,0,0,0.12)] relative overflow-hidden group select-none w-full"
              title={lastActiveReview ? `가장 최근 진행한 복습: [${lastActiveReview.title}] (클릭 시 이어서 학습)` : "최근 복습 진행 내역이 없습니다."}
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-white/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="p-3 bg-slate-950/10 text-slate-900 rounded-xl group-hover:bg-slate-950/15 transition-all duration-300 flex-shrink-0 relative">
                <Clock size={24} className="animate-pulse-slow text-slate-950" />
              </div>
              <div className="min-w-0 flex-grow relative text-slate-950">
                <h3 className="text-[15px] font-black text-slate-950 truncate leading-tight">
                  {lastActiveReview ? lastActiveReview.title : '최근 복습 내역 없음'}
                </h3>
              </div>
            </button>

            <div className="hidden md:block glass-panel rounded-2xl p-5 border border-slate-800">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-medium text-slate-400">전체 스케줄 완료율</p>
                <span className="text-xs font-black text-brand-400">{overallProgressPercent}%</span>
              </div>
              <div className="w-full bg-slateCustom-900 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-brand-600 to-indigo-500 h-2 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${overallProgressPercent}%` }}
                ></div>
              </div>
               <p className="text-[10px] text-slate-500 mt-2">각 토픽의 1일, 4일, 7일, 14일, 35일, 60일 복습 달성률</p>
            </div>
          </section>
        )}
          </div>
          
          <div className="landscape-dashboard-right">
            {viewMode === 'dashboard' ? (
          /* DASHBOARD VIEW (Two Column) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT: Today's review items list */}
            <section className="lg:col-span-7 space-y-5">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Clock size={20} className="text-brand-400" />
                    <h2 className="text-lg font-bold text-white">오늘의 복습 토픽 목록</h2>
                  </div>
                  <button
                    onClick={handleRequestWeakPoints}
                    disabled={loadingWeakPoints}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-500/30 font-black transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed glow-amber-hover"
                    title="이전 복습 성적이 낮았던 약점 토픽을 추가 추천받아 복습 (하루 최대 2개)"
                  >
                    {loadingWeakPoints ? '⏳ 불러오는 중...' : '💡 약점 추천 받기'}
                  </button>
                </div>
                {(!(!isDesktop && !isMobileLandscape)) && (
                  <span className="text-xs font-bold text-slate-400 bg-slateCustom-900 border border-slate-800 rounded-lg px-2.5 py-1">
                    총 {todayReviews.filter(r => !(r.isBonus && hiddenBonusTopicIds.includes(r.topic_id))).length}개 대기 중
                  </span>
                )}
              </div>

              {loadingReviews ? (
                <div className="glass-panel rounded-3xl p-12 border border-slate-800 flex flex-col items-center justify-center gap-4">
                  <RefreshCw className="animate-spin text-brand-500" size={32} />
                  <p className="text-sm font-medium text-slate-400">데이터를 불러오는 중입니다...</p>
                </div>
              ) : todayReviews.filter(r => !(r.isBonus && hiddenBonusTopicIds.includes(r.topic_id))).length === 0 ? (
                /* Empty state */
                <div className="glass-panel rounded-3xl p-12 border border-slate-800 text-center flex flex-col items-center justify-center">
                  <div className="p-4 bg-emerald-950/30 text-emerald-400 rounded-full mb-4 animate-pulse-slow">
                    <CheckCircle size={36} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">오늘 예정된 복습이 모두 완료되었습니다!</h3>
                  <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
                    에빙하우스 망각곡선 필터 기준, 복습 대상인 토픽이 없습니다. 새로운 학습 토픽을 등록하거나 복습 기준일을 미래 날짜로 변경하여 테스트해 보세요.
                  </p>
                </div>
              ) : (
                /* Card List */
                <div className="space-y-4 md:max-h-[calc(100vh-300px)] md:overflow-y-auto md:pr-2 custom-vertical-scrollbar">
                  {todayReviews.map((item) => {
                    if (item.isBonus && hiddenBonusTopicIds.includes(item.topic_id)) {
                      return null;
                    }
                    return (
                      <div 
                        key={item.schedule_id || `bonus_${item.topic_id}`}
                        className="glass-panel rounded-2xl p-5 border border-slate-800 hover:border-slate-700/80 transition-all duration-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glow-purple-hover"
                      >
                      <div className="space-y-2.5 flex-grow min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.isBonus ? (
                            <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-500/30 font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1">
                              💡 약점 보완 추천 {item.score !== undefined && item.score !== null ? `(이전 점수: ${item.score}점)` : ''}
                            </span>
                          ) : (
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${getRoundBadgeStyle(item.review_round)}`}>
                              {item.review_round}회차 복습
                            </span>
                          )}
                          {!item.isBonus && item.planned_date < referenceDate && (() => {
                            const p = new Date(item.planned_date);
                            const r = new Date(referenceDate);
                            const diffDays = Math.round((r.getTime() - p.getTime()) / (1000 * 60 * 60 * 24));
                            return (
                              <span className="text-[10px] bg-rose-950/60 text-rose-300 border border-rose-500/30 font-bold px-2 py-0.5 rounded-full">
                                {diffDays}일 지연
                              </span>
                            );
                          })()}
                          {item.pdf_name && (
                            <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              {item.pdf_name.toLowerCase().endsWith('.html') || item.pdf_name.toLowerCase().endsWith('.htm') ? <FileCode size={10} /> : <FileText size={10} />}
                              {item.pdf_name.toLowerCase().endsWith('.html') || item.pdf_name.toLowerCase().endsWith('.htm') ? 'HTML 첨부' : 'PDF 첨부'}
                            </span>
                          )}
                        </div>

                        {editingTopicId === item.topic_id ? (
                          <div className="flex items-center gap-1.5 w-full select-text max-w-md" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingTitleText}
                              onChange={(e) => setEditingTitleText(e.target.value)}
                              className="flex-grow bg-slate-950 border border-violet-500 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTopicTitle(item.topic_id);
                                else if (e.key === 'Escape') setEditingTopicId(null);
                              }}
                            />
                            <button
                              onClick={() => handleSaveTopicTitle(item.topic_id)}
                              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => setEditingTopicId(null)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold cursor-pointer transition-colors"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <h3 
                            onClick={() => {
                              setEditingTopicId(item.topic_id);
                              setEditingTitleText(item.title);
                            }}
                            className="text-base md:text-lg font-bold text-white tracking-tight cursor-pointer hover:text-violet-400 decoration-dotted hover:underline"
                            title="클릭 시 제목을 수정합니다."
                          >
                            {item.title}
                          </h3>
                        )}

                        {/* Keyword list */}
                        {item.keywords && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {item.keywords.split(/[,#\s]+/).filter(Boolean).map((kw, i) => (
                              <span key={i} className="text-xs bg-slateCustom-900 text-slate-400 border border-slate-800/80 px-2 py-0.5 rounded-md font-medium">
                                #{kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-row flex-nowrap items-center gap-2 w-full md:w-auto pt-3 md:pt-0 border-t border-slate-800/60 md:border-t-0 justify-end shrink-0">
                        {/* 소스 + Gemini 복습 */}
                        <button
                          onClick={() => handleOpenAIQuestions(item.topic_id, item.title, item.keywords, item.pdf_name, 'ai', item.schedule_id, item.review_round, item.isBonus)}
                          className="flex-grow md:flex-grow-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-violet-950/60 hover:bg-violet-900/60 text-violet-300 border border-violet-500/20 text-xs font-bold transition-all duration-200 animate-pulse-slow"
                          title="소스 + Gemini AI로 고난도 문제 생성"
                        >
                          <Brain size={13} />
                          🧠 복습하기
                        </button>
                        {/* 복습 완료 */}
                        <button
                          onClick={() => handleCompleteReview(item.schedule_id, item.title, item.review_round, item.isBonus, item.topic_id)}
                          className="flex-grow md:flex-grow-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                        >
                          <Check size={13} />
                          복습완료
                        </button>
                      </div>
                    </div>
                  ); })}
                </div>
              )}
            </section>

            {/* RIGHT: Today's study registration form */}
            <section className="hidden lg:block w-full lg:col-span-5 glass-panel rounded-3xl p-5 md:p-6 border border-slate-800/80 shadow-xl mt-6 lg:mt-0">
              <div className="flex items-center gap-2 mb-6">
                <PlusCircle size={20} className="text-brand-400" />
                <h2 className="text-lg font-bold text-white">오늘 공부한 토픽 등록</h2>
              </div>

              <form onSubmit={handleRegisterTopic} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">
                    토픽 제목 <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: B-Tree와 B+Tree 구조 및 비교"
                    className="w-full bg-slateCustom-900/90 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all duration-200"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">
                    핵심 키워드 <span className="text-slate-500">(쉼표로 구분)</span>
                  </label>
                  <input 
                    type="text" 
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="예: 인덱스, 리프노드, 순차주사, 데이터 저장구조"
                    className="w-full bg-slateCustom-900/90 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all duration-200"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    * AI가 해당 키워드를 활용해 10점형/25점형 기출문제를 더 정교하게 만듭니다.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">
                    기술사 서적/노트 PDF 또는 HTML 업로드
                  </label>
                  
                  <div 
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer flex flex-col items-center justify-center transition-all duration-200 ${
                      dragActive 
                        ? 'border-brand-500 bg-brand-950/20' 
                        : pdfFile 
                          ? 'border-emerald-500/50 bg-emerald-950/5' 
                          : 'border-slate-800 hover:border-slate-700 hover:bg-slateCustom-900/30'
                    }`}
                  >
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      accept=".pdf,.html,.htm"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {pdfFile ? (
                      <div className="w-full flex flex-col items-center">
                        <div className="p-3 bg-emerald-950/50 text-emerald-400 rounded-full mb-3">
                          {pdfFile.name.toLowerCase().endsWith('.html') || pdfFile.name.toLowerCase().endsWith('.htm') ? (
                            <FileCode size={28} />
                          ) : (
                            <FileText size={28} />
                          )}
                        </div>
                        <p className="text-sm font-semibold text-emerald-300 truncate max-w-full px-4">
                          {pdfFile.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPdfFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/50 text-rose-300 hover:bg-rose-900/60 border border-rose-500/20 text-xs font-bold transition-all duration-200"
                        >
                          <Trash2 size={12} />
                          제거
                        </button>
                      </div>
                    ) : (
                      <>
                        <UploadCloud size={32} className="text-slate-500 mb-2" />
                        <p className="text-sm font-bold text-slate-300">Drag & Drop 또는 파일 선택</p>
                        <p className="text-xs text-slate-500 mt-1">PDF 또는 HTML 파일 가능 (최대 10MB)</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                    또는 HTML 코딩 직접 입력
                  </label>
                  <textarea
                    ref={htmlTextareaRef}
                    onChange={(e) => {
                      const extracted = extractTitleFromHtml(e.target.value);
                      if (extracted && (title === '' || title === autoExtractedTitleRef.current)) {
                        setTitle(extracted);
                        autoExtractedTitleRef.current = extracted;
                      }
                    }}
                    rows={4}
                    placeholder="HTML 코드 내용을 여기에 직접 붙여넣거나 코딩하여 토픽 자료로 등록하세요. (작성 시 위 파일 업로드보다 우선 처리됩니다.)"
                    className="w-full bg-slateCustom-900/90 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 rounded-xl px-4 py-3 text-xs font-mono text-slate-100 placeholder-slate-500 outline-none transition-all duration-200 resize-none"
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={submitLoading}
                  className="w-full bg-gradient-to-r from-brand-600 to-indigo-600 text-white rounded-xl py-3.5 font-black text-sm hover:from-brand-500 hover:to-indigo-500 transition-all duration-300 shadow-lg shadow-brand-950/40 border border-brand-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed glow-purple-hover"
                >
                  {submitLoading ? (
                    <>
                      <RefreshCw className="animate-spin" size={16} />
                      토픽 등록 스케줄링 중...
                    </>
                  ) : (
                    <>
                      <PlusCircle size={16} />
                      오늘 공부 토픽으로 등록
                    </>
                  )}
                </button>
              </form>
            </section>
          </div>
        ) : (
          /* TOTAL SPaced Grid TRACKER VIEW */
          <section className={`min-h-0 flex flex-col ${(isDesktop && !isMobileLandscape) ? 'glass-panel rounded-3xl p-6 md:p-8 border border-slate-800/80 shadow-2xl bg-slateCustom-900/40 h-[calc(100vh-270px)] overflow-hidden' : 'h-full bg-transparent rounded-none p-0 border-0 shadow-none'}`}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 flex-shrink-0">
              <div className="flex items-center gap-2">
                <List size={20} className="text-brand-400" />
                <h2 className="text-lg font-bold text-white">복습 토픽</h2>
              </div>
              
              {/* Search bar inside allTopics view */}
              <div className="relative w-full md:w-80 flex gap-2">
                <div className="relative flex-grow">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setSearchQuery(searchInput);
                      }
                    }}
                    placeholder="토픽 제목 또는 키워드 검색..."
                    className="w-full bg-slateCustom-900 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all duration-200"
                  />
                  <div className="absolute left-3 top-3 text-slate-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                  </div>
                </div>
                
                {/* Dynamically toggle between Search and Clear button */}
                {searchQuery && searchQuery === searchInput ? (
                  <button 
                    onClick={() => {
                      setSearchInput('');
                      setSearchQuery('');
                    }}
                    className="flex-shrink-0 text-slate-400 hover:text-white text-xs font-bold bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-2.5 transition-colors border border-slate-700"
                  >
                    지우기
                  </button>
                ) : (
                  <button 
                    onClick={() => setSearchQuery(searchInput)}
                    className="flex-shrink-0 text-brand-300 hover:text-white text-xs font-bold bg-brand-950/60 hover:bg-brand-900/60 border border-brand-500/30 rounded-xl px-4 py-2.5 transition-colors"
                  >
                    검색
                  </button>
                )}
              </div>
            </div>

            {loadingTopics ? (
              <div className="py-12 flex flex-col items-center justify-center gap-4">
                <RefreshCw className="animate-spin text-brand-500" size={32} />
                <p className="text-sm font-medium text-slate-400">전체 목록을 로딩하는 중입니다...</p>
              </div>
            ) : allTopics.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-400">아직 등록된 학습 토픽이 없습니다. 첫 번째 토픽을 등록해 복습 스케줄을 확인해 보세요!</p>
              </div>
            ) : (() => {
              const matchedIndex = searchQuery 
                ? allTopics.findIndex(topic => 
                    topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (topic.keywords && topic.keywords.toLowerCase().includes(searchQuery.toLowerCase()))
                  )
                : -1;
              return (
                <div className={`overflow-x-auto landscape-overflow-x-auto md:pr-2 custom-vertical-scrollbar ${
                  (isDesktop && !isMobileLandscape) 
                    ? 'flex-1 min-h-0 overflow-y-scroll' 
                    : 'md:max-h-[calc(100vh-300px)] md:overflow-y-scroll'
                }`}>
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#0f172a] z-10 shadow-sm">
                      <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-bold">
                        <th className={`py-2.5 px-3 ${(isDesktop && !isMobileLandscape) ? '' : 'min-w-[66vw] max-w-[66vw] w-[66vw]'}`}>토픽 정보</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">1회차<span className="hidden md:inline"> 복습 (등록 1일 후)</span></th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">2회차<span className="hidden md:inline"> 복습 (완료 4일 후)</span></th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">3회차<span className="hidden md:inline"> 복습 (완료 7일 후)</span></th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">4회차<span className="hidden md:inline"> 복습 (완료 14일 후)</span></th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">5회차<span className="hidden md:inline"> 복습 (완료 35일 후)</span></th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">6회차<span className="hidden md:inline"> 복습 (완료 60일 후)</span></th>
                        <th className="py-2.5 px-2 text-center">도구</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-sm">
                      {allTopics.map((topic, idx) => {
                        const isFirstMatch = searchQuery && idx === matchedIndex;
                        return (
                          <tr 
                            key={topic.id} 
                            className={`transition-all duration-300 ${
                              isFirstMatch 
                                ? 'bg-brand-950/20 border-l-4 border-l-brand-500 scale-[1.005] shadow-md shadow-brand-500/10' 
                                : 'hover:bg-slateCustom-900/40 hover:scale-[1.002]'
                            }`}
                          >
                            <td className={`py-2.5 px-3 ${(isDesktop && !isMobileLandscape) ? 'max-w-md xl:max-w-2xl' : 'min-w-[66vw] max-w-[66vw] w-[66vw]'}`}>
                              <div className="space-y-1">
                                {editingTopicId === topic.id ? (
                                  <div className="flex items-center gap-1.5 w-full select-text" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={editingTitleText}
                                      onChange={(e) => setEditingTitleText(e.target.value)}
                                      className="flex-grow bg-slate-950 border border-violet-500 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveTopicTitle(topic.id);
                                        else if (e.key === 'Escape') setEditingTopicId(null);
                                      }}
                                    />
                                    <button
                                      onClick={() => handleSaveTopicTitle(topic.id)}
                                      className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                                    >
                                      저장
                                    </button>
                                    <button
                                      onClick={() => setEditingTopicId(null)}
                                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold cursor-pointer transition-colors"
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  (isDesktop && !isMobileLandscape) ? (
                                    /* PC: Single Line (title + review button inline) */
                                    <div className="flex items-center gap-3 w-full min-w-0">
                                      <h4 
                                        onDoubleClick={() => {
                                          setEditingTopicId(topic.id);
                                          setEditingTitleText(topic.title);
                                        }}
                                        ref={isFirstMatch ? firstMatchRef : null}
                                        className={`font-bold text-sm md:text-[17px] truncate transition-colors cursor-pointer hover:text-violet-400 decoration-dotted hover:underline min-w-0 flex-grow ${
                                          completedTopicIds.includes(topic.id) ? 'text-yellow-400' : 'text-white'
                                        }`}
                                        title="더블클릭 시 제목을 수정합니다."
                                      >
                                        {topic.title}
                                      </h4>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenAIQuestions(topic.id, topic.title, topic.keywords, topic.pdf_name, 'ai');
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-violet-950/60 hover:bg-violet-900/60 text-violet-300 border border-violet-500/20 text-xs md:text-[14px] font-bold transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
                                        title="소스 + Gemini AI로 고난도 문제 생성"
                                      >
                                        <Brain size={14} />
                                        <span>복습</span>
                                      </button>
                                    </div>
                                  ) : (
                                    /* Mobile: Double line title with ellipsis + inline review button */
                                    <div className="flex items-center gap-2 w-full min-w-0">
                                      <h4 
                                        onDoubleClick={() => {
                                          setEditingTopicId(topic.id);
                                          setEditingTitleText(topic.title);
                                        }}
                                        ref={isFirstMatch ? firstMatchRef : null}
                                        style={{
                                          display: '-webkit-box',
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          wordBreak: 'break-all',
                                          whiteSpace: 'normal'
                                        }}
                                        className={`font-bold text-xs transition-colors cursor-pointer hover:text-violet-400 decoration-dotted hover:underline min-w-0 flex-grow ${
                                          completedTopicIds.includes(topic.id) ? 'text-yellow-400' : 'text-white'
                                        }`}
                                        title="더블클릭 시 제목을 수정합니다."
                                      >
                                        {topic.title}
                                      </h4>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenAIQuestions(topic.id, topic.title, topic.keywords, topic.pdf_name, 'ai');
                                        }}
                                        className="inline-flex items-center justify-center p-1 rounded-lg bg-violet-950/60 hover:bg-violet-900/60 text-violet-300 border border-violet-500/20 transition-all duration-200 cursor-pointer shrink-0"
                                        title="소스 + Gemini AI로 고난도 문제 생성"
                                      >
                                        <Brain size={12} />
                                      </button>
                                    </div>
                                  )
                                )}
                              </div>
                            </td>
                            
                            {/* 6 spaced rounds status grid */}
                            {[1, 2, 3, 4, 5, 6].map((round) => {
                              const sched = topic.schedules?.find(s => s.review_round === round);
                              const finishedRounds = topic.schedules
                                ? topic.schedules
                                    .filter(s => (s.status === 'completed' || s.status === 'failed') && s.review_round < 99)
                                    .map(s => s.review_round)
                                : [];
                              const lastFinishedRound = finishedRounds.length > 0 ? Math.max(...finishedRounds) : 0;
                              const nextRoundToReview = lastFinishedRound + 1;
                              return (
                                <td key={round} className="py-2.5 px-2 text-center">
                                  {(() => {
                                    if (sched && (sched.status === 'completed' || sched.status === 'failed')) {
                                      return (
                                        <div className="flex flex-col items-center justify-center" title={`복습 예정일: ${sched.planned_date}`}>
                                          <button
                                            {...createRoundBadgeHandlers(sched.id, topic.id, topic.title, round, topic.keywords, topic.pdf_name)}
                                            className={`inline-flex items-center gap-0.5 text-[11px] md:text-[13px] border px-2 py-0.5 rounded-full font-semibold cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm focus:outline-none whitespace-nowrap ${
                                              sched.status === 'completed'
                                                ? (sched.score === 100
                                                    ? 'text-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/60 hover:text-emerald-200 border-emerald-500/30'
                                                    : sched.score >= 80
                                                      ? 'text-blue-400 bg-blue-950/40 hover:bg-blue-900/60 hover:text-blue-200 border-blue-500/30'
                                                      : 'text-orange-400 bg-orange-950/40 hover:bg-orange-900/60 hover:text-orange-200 border-orange-500/30'
                                                  )
                                                : 'text-rose-400 bg-rose-950/40 hover:bg-rose-900/60 hover:text-rose-200 border-rose-500/30'
                                            }`}
                                            title={`클릭 시 복습 내용 보기 / 길게 누르면 복습 취소 (예정일: ${sched.planned_date}) ${sched.score !== null && sched.score !== undefined ? `(성적: ${sched.score}점)` : ''}`}
                                          >
                                            {sched.score !== null && sched.score !== undefined ? `${sched.score}점` : (sched.status === 'completed' ? '완료' : '실패')}
                                          </button>
                                          {isDesktop && (
                                            <span className="text-[10px] text-slate-500 mt-1 font-semibold select-none">
                                              {formatReviewDate(sched.completed_at, sched.planned_date)}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    } else {
                                      if (round === nextRoundToReview && sched) {
                                        const p = new Date(sched.planned_date);
                                        const r = new Date(referenceDate);
                                        const diffDays = Math.round((p.getTime() - r.getTime()) / (1000 * 60 * 60 * 24));
                                        return (
                                          <div className="flex flex-col items-center justify-center" title={`복습 예정일: ${sched.planned_date}`}>
                                            {diffDays > 0 ? (
                                              <span className="inline-flex items-center gap-0.5 text-[10px] md:text-[12px] text-violet-400 bg-violet-950/40 border border-violet-500/30 px-2 py-0.5 rounded-full font-black whitespace-nowrap shadow-sm">
                                                {diffDays}일후
                                              </span>
                                            ) : diffDays < 0 ? (
                                              <span className="inline-flex items-center gap-0.5 text-[10px] md:text-[12px] text-rose-400 bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 rounded-full font-black whitespace-nowrap shadow-sm">
                                                {Math.abs(diffDays)}일 지연
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-0.5 text-[10px] md:text-[12px] text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-full font-black whitespace-nowrap shadow-sm">
                                                오늘 복습
                                              </span>
                                            )}
                                          </div>
                                        );
                                      } else if (sched && sched.status === 'pending' && round < nextRoundToReview) {
                                        return (
                                          <div className="flex flex-col items-center justify-center" title={`복습 예정일: ${sched.planned_date}`}>
                                            <span className="inline-flex items-center gap-0.5 text-[10px] md:text-[12px] text-sky-400 bg-sky-950/40 border border-sky-500/30 px-2 py-0.5 rounded-full font-black whitespace-nowrap shadow-sm">
                                              재복습중
                                            </span>
                                          </div>
                                        );
                                      } else if (round >= nextRoundToReview) {
                                        return (
                                          <div className="flex flex-col items-center justify-center">
                                            <span className="inline-flex items-center gap-0.5 text-[10px] md:text-[12px] text-slate-400 bg-slateCustom-900 border border-slate-800 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                                              대기
                                            </span>
                                          </div>
                                        );
                                      } else {
                                        return (
                                          <span className="text-xs text-slate-600 cursor-help" title="이전 회차 복습 완료 시 생성">-</span>
                                        );
                                      }
                                    }
                                  })()}
                                </td>
                              );
                            })}

                            {/* Column 8: 작업/도구 */}
                            <td className="py-2.5 px-2 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {topic.pdf_name && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyReportToAnswersheet(topic.id, topic.title);
                                    }}
                                    className="inline-flex items-center justify-center p-1.5 rounded-xl bg-teal-950/60 hover:bg-teal-900/60 text-teal-300 border border-teal-500/20 transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                                    title="답안지 추가 (이 토픽의 원보고서 보기를 답안지탭에 추가합니다)"
                                  >
                                    <Copy size={14} />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteTopic(topic.id, topic.title);
                                  }}
                                  className="inline-flex items-center justify-center p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-500/20 transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                                  title="삭제 (이 토픽과 모든 복습 일정을 영구 삭제합니다)"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </section>
        )}
          </div>
        </div>
      </main>

      {/* ===== 복습 모달 (종합평가 스타일) ===== */}
      {selectedTopic && (
        <div 
          onTouchStart={handleSwipeTouchStart}
          onTouchEnd={(e) => handleSwipeTouchEnd(e, reviewMobileTab, setReviewMobileTab)}
          className="fixed inset-y-0 right-0 left-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col md:pl-36 landscape-pl-0 pc-enlarged-text overflow-hidden scrollbar-none-mobile"
        >
          


          {/* Main Layout Area */}
          <div className="flex-1 flex flex-row min-h-0 w-full overflow-hidden">
            {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
                        {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
            <div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-40 flex-shrink-0 items-stretch justify-start overflow-y-auto scrollbar-none">
              {lastActiveReview && (
                <button
                  onClick={() => {
                    handleOpenLastActiveReview();
                  }}
                  className="flex bg-light-rainbow-animate border rounded-xl p-2 items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 text-left w-full select-none"
                  title="공부중 복습 이어서 진행"
                >
                  <Clock size={12} className="text-slate-950 shrink-0" />
                  <span className="text-[9px] font-black text-slate-950 truncate text-ellipsis overflow-hidden whitespace-nowrap max-w-[80px]">공부중: {lastActiveReview.title}</span>
                </button>
              )}

              <button
                onClick={() => {
                  forceSaveActiveSessions();
                  setSelectedTopic(null);
                  setViewMode('dashboard');
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <Calendar size={12} />
                <span>오늘의 복습</span>
              </button>

              <button
                onClick={() => {
                  forceSaveActiveSessions();
                  setSelectedTopic(null);
                  setViewMode('all_topics');
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <List size={12} />
                <span>복습토픽</span>
              </button>

              <button
                onClick={() => {
                  forceSaveActiveSessions();
                  setSelectedTopic(null);
                  handleOpenExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-amber-400 border-slate-800/80 hover:text-amber-200 hover:bg-amber-950/40 transition-all cursor-pointer"
              >
                <Award size={12} />
                <span>종합평가</span>
              </button>

              <button
                onClick={() => {
                  forceSaveActiveSessions();
                  setSelectedTopic(null);
                  handleOpenFormulaExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-rose-400 border-slate-800/80 hover:text-rose-200 hover:bg-rose-950/40 transition-all cursor-pointer"
              >
                <Sigma size={12} />
                <span>필수공식</span>
              </button>


              <button
                onClick={() => {
                  forceSaveActiveSessions();
                  setSelectedTopic(null);
                  handleOpenAnswerSheet();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-emerald-400 border-slate-800/80 hover:text-emerald-200 hover:bg-emerald-950/40 transition-all cursor-pointer"
              >
                <FileText size={12} />
                <span>답안지</span>
              </button>

              <div className="h-px bg-slate-800/60 my-1 shrink-0" />

              {selectedTopic?.pdf_name && (
                <button
                  onClick={handleOpenOriginalReport}
                  className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-violet-950/80 hover:bg-violet-900 text-violet-300 hover:text-white border-violet-500/40 transition-all cursor-pointer active:scale-95"
                  title="원본 보고서 파일(HTML/PDF) 팝업 열기"
                >
                  <FileText size={12} className="text-violet-400" />
                  <span>원보고서</span>
                </button>
              )}

              {selectedTopic && (
                <button
                  onClick={handleRetakeReviewQuiz}
                  className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-amber-950/80 hover:bg-amber-900 text-amber-300 hover:text-white border-amber-500/40 transition-all cursor-pointer active:scale-95"
                  title="현재 복습 화면의 모든 문제 풀이 상태를 풀기 전 상태로 초기화합니다."
                >
                  <RefreshCw size={12} className="text-amber-400" />
                  <span>다시풀기</span>
                </button>
              )}

              {selectedTopic && (
                <button
                  onClick={handleRefreshReviewQuestions}
                  disabled={loadingAI}
                  className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-violet-950/40 hover:bg-violet-900/60 text-violet-300 hover:text-white border-violet-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  title="주제와 문제가 맞지 않을 때 전체 AI 재출제"
                >
                  {loadingAI ? (
                    <svg className="animate-spin h-3.5 w-3.5 text-violet-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <span className="text-xs">🔄</span>
                  )}
                  <span>리프레쉬</span>
                </button>
              )}

              <button
                onClick={() => { 
                  savedQuizScroll.current = quizBodyRef.current?.scrollTop || 0; 
                  if (selectedTopic?.isReadOnly) {
                    setSelectedTopic(null); 
                  } else {
                    forceSaveActiveSessions();
                    setSelectedTopic(null); 
                  }
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900 text-slate-300 hover:text-white border-slate-800 hover:bg-slate-800/50 transition-all cursor-pointer active:scale-95"
                title={selectedTopic?.isReadOnly ? "화면 닫기" : "화면만 숨김 (재개 시 문제 유지)"}
              >
                <span className="text-[10px]">❌</span>
                <span>닫기</span>
              </button>
            </div>

            {/* Layout Split Container (Mobile: Horizontal Swipe, PC: Side-by-Side) */}
            <div 
              ref={reviewSplitContainerRef}
              onScroll={(e) => {
                if (!isDesktop && isMobileLandscape) {
                  const scrollLeft = e.currentTarget.scrollLeft;
                  const clientWidth = e.currentTarget.clientWidth;
                  if (clientWidth > 0) {
                    const activeTab = scrollLeft > clientWidth / 2 ? 'tutor' : 'list';
                    setReviewMobileTab(activeTab);
                  }
                }
              }}
              className={`flex-1 flex flex-row ${(!isDesktop && !isMobileLandscape) ? 'overflow-x-hidden' : 'overflow-x-auto md:overflow-x-hidden'} landscape-split-container overflow-y-hidden ${(!isDesktop && !isMobileLandscape) ? '' : 'snap-x snap-mandatory'} scroll-smooth min-h-0 w-full scrollbar-none`}
            >

              {/* Left: Quiz Wrapper (Takes exactly 60% width on Desktop) */}
              <div 
                className={`w-full shrink-0 md:flex-1 md:shrink landscape-w-55 landscape-bg-slate-900 min-w-0 snap-start h-full relative overflow-hidden flex flex-col items-center bg-slateCustom-900/30 ${
                  (!isDesktop && !isMobileLandscape && reviewMobileTab !== 'list') ? 'hidden' : ''
                }`}
              >
          {/* Review Header */}
          <div className="w-full flex flex-col items-stretch md:flex-row md:items-center justify-start px-5 py-4 bg-slateCustom-950 border-b border-violet-500/20 flex-shrink-0 gap-4 md:gap-8 landscape-hide">
            <div className="flex items-start gap-3 min-w-0 w-full md:w-auto">
              <div className="p-2 bg-violet-950/80 text-violet-400 rounded-xl flex-shrink-0 mt-0.5">
                <Brain size={20} />
              </div>
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-violet-400 tracking-wider whitespace-nowrap">토픽 복습</span>
                  {!loadingAI && aiQuestions.length > 0 && (
                    <span className="text-[10px] bg-violet-950/60 text-violet-300 border border-violet-500/20 px-2 py-0.5 rounded-full font-bold">
                      {aiQuestions.length}문항
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 mt-1">
                  <h3 className="font-bold text-white text-xs sm:text-sm truncate sm:whitespace-normal" title={selectedTopic.title}>
                    {selectedTopic.title}
                  </h3>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 w-full md:w-auto md:justify-start border-t border-slate-800/40 md:border-t-0 pt-3 md:pt-0">
              {selectedTopic.pdf_name && (
                <button
                  onClick={handleOpenOriginalReport}
                  className="flex-1 md:flex-none px-2 py-1.5 bg-violet-950/80 hover:bg-violet-900 text-violet-300 hover:text-white border border-violet-500/40 rounded-lg text-[10px] font-black tracking-tight transition-all duration-200 cursor-pointer active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap min-w-0"
                  title="원본 보고서 파일(HTML/PDF) 팝업 열기"
                >
                  <FileText size={12} className="flex-shrink-0" />
                  <span className="whitespace-nowrap">원보고서</span>
                </button>
              )}
              {isDesktop && selectedTopic && (
                <button
                  onClick={handleRetakeReviewQuiz}
                  className="flex-1 md:flex-none px-2 py-1.5 bg-amber-950/80 hover:bg-amber-900 text-amber-300 hover:text-white border border-amber-500/40 rounded-lg text-[10px] font-black tracking-tight transition-all duration-200 cursor-pointer active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap min-w-0"
                  title="현재 복습 화면의 모든 문제 풀이 상태를 풀기 전 상태로 초기화합니다."
                >
                  <RefreshCw size={12} className="text-amber-400 flex-shrink-0" />
                  <span className="whitespace-nowrap">다시풀기</span>
                </button>
              )}
              {selectedTopic && (
                <button
                  onClick={handleRefreshReviewQuestions}
                  disabled={loadingAI}
                  className="flex-1 md:flex-none px-2 py-1.5 bg-violet-950/40 hover:bg-violet-900/60 text-violet-300 hover:text-white border border-violet-500/20 rounded-lg text-[10px] font-black tracking-tight transition-all duration-200 cursor-pointer active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="주제와 문제가 맞지 않을 때 전체 AI 재출제"
                >
                  {loadingAI ? (
                    <svg className="animate-spin h-3.5 w-3.5 text-violet-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <span className="text-violet-300 flex-shrink-0">🔄</span>
                  )}
                  <span className="whitespace-nowrap">리프레쉬</span>
                </button>
              )}
              <button
                onClick={() => { 
                  savedQuizScroll.current = quizBodyRef.current?.scrollTop || 0; 
                  if (selectedTopic?.isReadOnly) {
                    setSelectedTopic(null); 
                  } else {
                    forceSaveActiveSessions();
                    setSelectedTopic(null); 
                  }
                }}
                className="flex-1 md:flex-none px-2 md:px-5 py-2 md:py-2.5 bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl text-[11px] sm:text-xs md:text-sm font-black transition-all duration-200 cursor-pointer active:scale-95 text-center whitespace-nowrap min-w-0"
                title={selectedTopic?.isReadOnly ? "화면 닫기" : "화면만 숨김 (재개 시 문제 유지)"}
              >
                닫기
              </button>
              {selectedTopic && (
                <>
                  <button
                    onClick={() => { 
                      if (selectedTopic?.id) {
                        const deleteUrl = selectedTopic.schedule_id
                          ? `${API_BASE}/api/session/review/topic/${selectedTopic.id}?scheduleId=${selectedTopic.schedule_id}`
                          : `${API_BASE}/api/session/review/topic/${selectedTopic.id}`;
                        fetch(deleteUrl, { method: 'DELETE' })
                          .catch(e => console.warn('세션 초기화 실패:', e));
                      }
                      setSelectedTopic(null); setAiQuestions([]); setRevealedQuestions({}); setSelectedAnswers({}); setOpenSections({}); setReviewOptionExplanations({}); lastQuizTopicId.current = null; 
                    }}
                    className="flex-1 md:flex-none px-2 md:px-5 py-2 md:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-[11px] sm:text-xs md:text-sm font-black transition-all duration-200 cursor-pointer active:scale-95 text-center whitespace-nowrap min-w-0"
                    title="문제 초기화 (재개 시 새 문제 생성)"
                  >
                    종료
                  </button>

                </>
              )}
            </div>
          </div>
              <div 
                ref={quizBodyRef} 
                className={`flex-1 w-full overflow-hidden px-0 py-3 sm:p-6 md:pl-6 md:pr-1 landscape-quiz-body scroll-smooth relative scrollbar-none-mobile overflow-y-auto ${(!isDesktop && !isMobileLandscape) ? 'snap-y snap-mandatory' : ''}`}
              >
              {loadingAI ? (
                <div className="py-32 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="relative">
                    <div className="p-6 bg-violet-950/80 text-violet-400 rounded-full animate-bounce-slow">
                      <Brain size={40} />
                    </div>
                    <div className="absolute inset-0 bg-violet-500 rounded-full animate-ping opacity-20"></div>
                  </div>
                  <h4 className="text-xl font-bold text-white mt-2">Gemini AI가 13문항을 출제하는 중...</h4>
                  <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                    소스 자료를 분석하여 주관식(개요·공식)과 객관식을 혼용한 복습 문제를 생성하고 있습니다. 약 10~20초 소요됩니다.
                  </p>
                </div>
              ) : (
                <div className="w-full space-y-5 pb-32">
                  {isFallback && (
                    <div className="p-5 rounded-2xl bg-amber-950/40 border border-amber-500/20 text-amber-200 flex items-start gap-3 animate-fade-in mb-6 shadow-xl">
                      <div className="p-2.5 bg-amber-900/50 text-amber-400 rounded-xl">
                        <Info size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-0.5">로컬 오프라인 엔진 출제 완료</h4>
                        <p className="text-xs text-amber-300/90 leading-relaxed">
                          구글 Gemini API의 일일 사용 한도 초과(또는 일시적인 네트워크 제한)로 인해, 시스템에 내장된 <b>고품질 오프라인 백업 출제 엔진</b>이 소스 문서를 기반으로 기출문제를 대체 생성하였습니다. 중단 없이 복습을 계속 진행하실 수 있습니다!
                        </p>
                        {aiError && (
                          <p className="text-[10px] text-amber-500/50 mt-1.5 font-mono">
                            * 상세 오류: {aiError}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {aiQuestions.map((q, idx) => {
                    const isMC = q.type === '객관식' || (q.options && q.options.length > 0);
                    const isSubj = !isMC;
                    const answered = selectedAnswers[idx] !== undefined;
                    const isCorrect = answered && selectedAnswers[idx] === q.answer;
                    const isRevd = !!revealedQuestions[idx];
                    const subjIdx = isSubj ? aiQuestions.slice(0, idx).filter(question => {
                      const itemMC = question.type === '객관식' || (question.options && question.options.length > 0);
                      return !itemMC;
                    }).length : -1;

                    const subtypeBadgeColor =
                      q.type?.includes('개요') || q.type?.includes('인출') ? 'bg-sky-700' :
                      q.type?.includes('공식') ? 'bg-rose-700' :
                      q.type?.includes('서술') ? 'bg-indigo-700' :
                      'bg-amber-700';

                    return (
                      <div key={idx} className={`quiz-card-item bg-slateCustom-900 border border-slate-800 rounded-2xl px-2.5 py-4 sm:p-5 space-y-3 scroll-mt-2 transition-all duration-300 hover:border-slate-700/50 ${(!isDesktop && !isMobileLandscape) ? 'snap-start scroll-mt-4' : ''}`}>
                        {/* Q Header */}
                        <div className="flex items-center justify-between gap-2 flex-wrap w-full">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black bg-slate-700 text-slate-200 px-2 py-0.5 rounded">Q{idx + 1}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded text-white ${isMC ? 'bg-emerald-700' : subtypeBadgeColor}`}>
                              {isMC ? '객관식' : '주관식'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* 답안보기 버튼 */}
                            <button
                              onClick={() => {
                                if (isMC) {
                                  setSelectedAnswers(prev => ({ ...prev, [idx]: q.answer }));
                                } else {
                                  setRevealedQuestions(prev => ({ ...prev, [idx]: !prev[idx] }));
                                }
                              }}
                              className="flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg border bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-700/50 hover:text-white transition-all duration-300 active:scale-95 cursor-pointer select-none"
                              title="정답 및 해설 바로 확인"
                            >
                              <span>👁️ 답안보기</span>
                            </button>
                            {/* 추천/비추천 피드백 버튼 */}
                            <button
                              onClick={() => handleToggleFeedback(q.topic_id || selectedTopic?.id || examTopic?.id, q.question, 'upvote')}
                              className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg border transition-all duration-300 active:scale-95 cursor-pointer ${
                                questionFeedback[`${q.topic_id || selectedTopic?.id || examTopic?.id}_${q.question.trim()}`] === 'upvote'
                                  ? 'bg-emerald-950/60 border-emerald-500 text-emerald-450 font-black' 
                                  : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-emerald-950/20 hover:border-emerald-500/30 hover:text-emerald-400'
                              }`}
                              title="추천: 다음에 문제 생성 시 이 문제 유형의 출제 빈도를 높입니다."
                            >
                              <ThumbsUp size={12} />
                              <span>추천</span>
                            </button>
                            <button
                              onClick={() => handleToggleFeedback(q.topic_id || selectedTopic?.id || examTopic?.id, q.question, 'downvote')}
                              className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg border transition-all duration-300 active:scale-95 cursor-pointer ${
                                questionFeedback[`${q.topic_id || selectedTopic?.id || examTopic?.id}_${q.question.trim()}`] === 'downvote'
                                  ? 'bg-rose-950/60 border-rose-500 text-rose-450 font-black' 
                                  : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-rose-950/20 hover:border-rose-500/30 hover:text-rose-400'
                              }`}
                              title="비추천: 다음에 문제 생성 시 이 문제 유형의 출제 빈도를 낮추거나 제외합니다."
                            >
                              <ThumbsDown size={12} />
                              <span>비추천</span>
                            </button>

                            {answered && isMC && (
                              <button
                                onClick={() => handleResetSingleReviewAnswer(idx)}
                                className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-violet-950/40 hover:border-violet-500/50 hover:text-violet-400 active:scale-95 transition-all duration-300"
                              >
                                <svg
                                  className="w-3 h-3 text-slate-400 hover:text-violet-400"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                                다시 풀기
                              </button>
                            )}
                            
                            <button
                              disabled={regeneratingReview[idx]}
                              onClick={() => handleRegenerateQuestion('review', idx, q)}
                              className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all duration-300 ${
                                regeneratingReview[idx]
                                  ? 'bg-indigo-950/20 border-indigo-500/30 text-indigo-400 cursor-not-allowed animate-pulse'
                                  : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-indigo-950/40 hover:border-indigo-500/50 hover:text-indigo-400 active:scale-95 cursor-pointer'
                              }`}
                            >
                              <svg
                                className={`w-3 h-3 ${regeneratingReview[idx] ? 'animate-spin text-indigo-400' : 'text-slate-400 group-hover:text-indigo-400'}`}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                              </svg>
                              {regeneratingReview[idx] ? '변환 중...' : '변환'}
                            </button>
                          </div>
                        </div>

                        {(() => {
                          const { questionText, tableData } = parseQuestionTable(q);
                          const cleanQuestionText = questionText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
                          return (
                            <>
                              <div className="text-[17px] font-bold text-white leading-relaxed">
                                <LatexRenderer text={cleanQuestionText} katexLoaded={katexLoaded} enableAddFormula={true} />
                              </div>
                              {isMC && tableData && (
                                <ReadOnlyTable tableData={tableData} katexLoaded={katexLoaded} />
                              )}
                            </>
                          );
                        })()}

                        {/* MC Options */}
                        {isMC && (
                          <div className="space-y-2">
                            {q.options?.map((opt, oIdx) => {
                              let cls = "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 ";
                              if (!answered) {
                                cls += "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/70 hover:border-slate-600 cursor-pointer select-none";
                              } else if (opt === q.answer) {
                                cls += "bg-emerald-950/70 border-emerald-500 text-emerald-200 font-extrabold cursor-default select-text";
                              } else if (opt === selectedAnswers[idx] && opt !== q.answer) {
                                cls += "bg-rose-950/70 border-rose-500 text-rose-200 cursor-default select-text";
                              } else {
                                cls += "bg-slate-800/30 border-slate-800/50 text-slate-300 cursor-default select-text";
                              }
                              return (
                                <div
                                  key={oIdx}
                                  onClick={() => {
                                    if (answered) return;
                                    setSelectedAnswers(prev => {
                                      const updated = { ...prev, [idx]: opt };
                                      const normalizeAns = (s) => (s || '').replace(/^\d+\.\s*/, '').trim();
                                      if (isDesktop || isMobileLandscape) {
                                        if (normalizeAns(opt) === normalizeAns(q.answer)) {
                                          setTimeout(() => {
                                            const cards = quizBodyRef.current?.querySelectorAll('.quiz-card-item');
                                            if (cards && cards[idx]) {
                                              quizBodyRef.current?.scrollTo({ top: cards[idx].offsetTop, behavior: 'smooth' });
                                            }
                                          }, 600);
                                        }
                                      }
                                      return updated;
                                    });
                                  }}
                                  className={cls}
                                >
                                  <span className="flex gap-2 items-start select-text">
                                    <span className="font-black text-[10px] mt-0.5 flex-shrink-0 select-none">{['①','②','③','④'][oIdx]}</span>
                                    <LatexRenderer text={opt} katexLoaded={katexLoaded} className="inline select-text" enableAddFormula={true} />
                                  </span>
                                </div>
                              );
                            })}
                            {answered && (
                              <div className={`mt-2 p-3 rounded-xl text-sm leading-relaxed ${isCorrect ? 'bg-emerald-950/50 border border-emerald-500/30 text-emerald-200' : 'bg-rose-950/50 border border-rose-500/30 text-rose-200'}`}>
                                <span className="font-black">{isCorrect ? '✅ 정답!' : '❌ 오답'}</span>
                                {!isCorrect && (
                                  <span className="ml-2 inline-flex items-center gap-1">
                                    정답: <strong className="inline-block"><LatexRenderer text={q.answer} katexLoaded={katexLoaded} className="inline" enableAddFormula={true} /></strong>
                                  </span>
                                )}
                                {q.explanation && <div className="mt-1.5 text-slate-300"><LatexRenderer text={q.explanation} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} /></div>}

                                 {/* AI 해설 및 보기분석 버튼 패널 */}
                                 <div className="mt-3 pt-3 border-t border-slate-700/50">
                                   <div className="flex flex-wrap items-center gap-2 mb-2">
                                     {/* 문제조정 버튼 */}
                                      {adjustingInputKey !== `r_${idx}` && (
                                        <button
                                          onClick={() => setAdjustingInputKey(`r_${idx}`)}
                                          className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                        >
                                          🛠️ 문제조정 (AI 피드백)
                                        </button>
                                      )}
                                     
                                     {/* 보기별 정밀 분석 해설 보기 버튼 */}
                                     {!reviewOptionExplanations[idx] && (
                                       <button
                                         onClick={() => handleRequestOptionExplanation('review', idx, q.question, q.options, q.answer)}
                                         className="text-[10px] px-3 py-1.5 rounded-lg border border-violet-500/30 text-violet-300 hover:bg-violet-500/10 font-bold transition-all cursor-pointer"
                                       >
                                         🔍 보기별 정밀 분석 해설 보기 (AI)
                                       </button>
                                     )}

                                     {/* AI 튜터 버튼 */}
                                     <button
                                       onClick={() => setActiveTutorInputKey(prev => prev === `r_${idx}` ? null : `r_${idx}`)}
                                       className="text-[10px] px-3 py-1.5 rounded-lg border border-violet-500/30 text-violet-300 hover:bg-violet-500/10 font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-95 duration-200"
                                     >
                                       💬 AI 튜터
                                     </button>
                                   </div>

                                   {/* 문제조정 입력 및 결과 보드 */}
                                    {adjustingInputKey === `r_${idx}` && (
                                      <div className="mt-2 p-3 bg-indigo-950/20 border border-indigo-500/30 rounded-xl w-full">
                                        <label className="block text-[10px] font-black text-indigo-400 mb-1">🛠️ 문제조정 의견을 제시해 주세요:</label>
                                        <textarea
                                          rows={2}
                                          value={adjustingText[`r_${idx}`] || ''}
                                          onChange={(e) => {
                                            const text = e.target.value;
                                            setAdjustingText(prev => ({ ...prev, [`r_${idx}`]: text }));
                                          }}
                                          placeholder="예: 수치를 20m로 변경해줘, 난이도를 낮춰줘 등..."
                                          className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-2 resize-none"
                                        />
                                        <div className="flex gap-2 justify-end">
                                          <button
                                            onClick={() => setAdjustingInputKey(null)}
                                            className="text-[10px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors font-bold cursor-pointer"
                                          >
                                            취소
                                          </button>
                                          <button
                                            onClick={() => handleAdjustQuestion('review', idx, q)}
                                            disabled={adjustingLoading[`r_${idx}`]}
                                            className="text-[10px] px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors font-bold cursor-pointer disabled:opacity-50"
                                          >
                                            {adjustingLoading[`r_${idx}`] ? '조정 중...' : '조정하기'}
                                          </button>
                                        </div>
                                        {adjustingLoading[`r_${idx}`] && (
                                          <div className="text-[10px] text-indigo-400 font-bold animate-pulse py-1.5 mt-2">⏳ AI가 의견을 반영하여 문제를 조율 중입니다...</div>
                                        )}
                                      </div>
                                    )}

                                    {/* AI 튜터 입력 및 답변 보드 */}
                                    {activeTutorInputKey === `r_${idx}` && (
                                      <div className="mt-2 p-3 bg-violet-950/20 border border-violet-500/20 rounded-xl w-full">
                                        <label className="block text-[10px] font-black text-violet-400 mb-1">💬 AI 튜터 질문하기 (이 문제에 대해 물어보세요):</label>
                                        <textarea
                                          rows={3}
                                          value={tutorInputText[`r_${idx}`] || ''}
                                          onChange={(e) => {
                                            const text = e.target.value;
                                            setTutorInputText(prev => ({ ...prev, [`r_${idx}`]: text }));
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                              e.preventDefault();
                                              const isPending = tutorAnswers[`r_${idx}`]?.loading;
                                              const hasText = (tutorInputText[`r_${idx}`] || '').trim();
                                              if (!isPending && hasText) {
                                                handleAskCardTutor(`r_${idx}`, q);
                                              }
                                            }
                                          }}
                                          placeholder="예: 이 공식이 유도되는 세부적인 역학적 기작을 설명해줘, 이 보기에서 마찰 저항이 왜 감쇄하는지 자세히 알려줘 등..."
                                          className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500 mb-2 resize-none"
                                        />
                                        <div className="flex gap-2 justify-end">
                                          <button
                                            onClick={() => setActiveTutorInputKey(null)}
                                            className="text-[10px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors font-bold cursor-pointer"
                                          >
                                            취소
                                          </button>
                                          <button
                                            disabled={tutorAnswers[`r_${idx}`]?.loading || !(tutorInputText[`r_${idx}`] || '').trim()}
                                            onClick={() => handleAskCardTutor(`r_${idx}`, q)}
                                            className="text-[10px] px-2.5 py-1 rounded bg-slate-300 hover:bg-slate-200 disabled:bg-slate-800 disabled:text-slate-500 text-slate-900 font-bold transition-all cursor-pointer active:scale-95 duration-200"
                                          >
                                            {tutorAnswers[`r_${idx}`]?.loading ? '답변 작성 중...' : '질문하기'}
                                          </button>
                                        </div>

                                        {/* AI Tutor In-Card Answer Panel */}
                                        {tutorAnswers[`r_${idx}`]?.loading && (
                                          <div className="py-2.5 flex flex-col gap-1.5 animate-pulse select-text mt-2 border-t border-violet-500/10">
                                            <div className="text-[10px] text-violet-400 font-bold flex items-center gap-1.5">
                                              <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-ping"></div>
                                              <span>⏳ AI 튜터가 답변을 구성하는 중...</span>
                                            </div>
                                            <div className="h-4 bg-slate-800 rounded w-5/6"></div>
                                            <div className="h-4 bg-slate-800 rounded w-4/6"></div>
                                          </div>
                                        )}
                                        {tutorAnswers[`r_${idx}`]?.error && (
                                          <div className="text-[10px] text-rose-400 font-bold select-text mt-2 border-t border-violet-500/10 pt-2">❌ 답변 오류: {tutorAnswers[`r_${idx}`].error}</div>
                                        )}
                                        {tutorAnswers[`r_${idx}`]?.text && !tutorAnswers[`r_${idx}`]?.loading && (
                                          <div className="mt-2 pt-2 border-t border-violet-500/20 select-text">
                                            <div className="text-[11px] font-black text-violet-400 mb-1.5">💬 AI 튜터 답변</div>
                                            <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap select-text text-left w-full">
                                              <LatexRenderer text={tutorAnswers[`r_${idx}`].text} katexLoaded={katexLoaded} enableAddFormula={true} isMarkdown={true} />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                   {/* 보기별 정밀 분석 결과 */}
                                   {reviewOptionExplanations[idx]?.loading && (
                                     <div className="py-2.5 flex flex-col gap-1.5 animate-pulse select-text">
                                       <div className="text-[10px] text-violet-400 font-bold flex items-center gap-1.5">
                                         <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-ping"></div>
                                         <span>⏳ AI가 각 보기의 정/오답 메커니즘을 정밀 분석 중...</span>
                                       </div>
                                       <div className="h-4 bg-slate-800 rounded w-5/6"></div>
                                       <div className="h-4 bg-slate-800 rounded w-4/6"></div>
                                     </div>
                                   )}
                                   {reviewOptionExplanations[idx]?.error && (
                                     <div className="text-[10px] text-rose-400 font-bold select-text">❌ 보기 해설 실패: {reviewOptionExplanations[idx].error}</div>
                                   )}
                                   {reviewOptionExplanations[idx]?.text && !reviewOptionExplanations[idx]?.loading && (
                                     <div className="mt-2 p-3 bg-violet-950/20 border border-violet-500/20 rounded-xl select-text">
                                       <div className="text-[11px] font-black text-violet-400 mb-2">🔍 보기별 정밀 분석 해설 (오답 및 정답 사유)</div>
                                       <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap select-text">
                                         <LatexRenderer text={reviewOptionExplanations[idx].text} katexLoaded={katexLoaded} enableAddFormula={true} />
                                       </div>
                                     </div>
                                   )}
                                 </div>
                               </div>
                             )}
                           </div>
                         )}

                        {/* Subjective Reveal */}
                        {isSubj && (
                          q.type === '주관식 (표채우기)' ? (
                            <div className="space-y-3 w-full">
                              <TableQuiz 
                                questionIdx={idx} 
                                q={q} 
                                tableAnswers={tableAnswers} 
                                setTableAnswers={setTableAnswers} 
                                revealed={isRevd} 
                                katexLoaded={katexLoaded} 
                                tableGradingResults={tableGradingResults}
                              />
                              {!isRevd ? (
                                <button
                                  disabled={gradingLoading[idx]}
                                  onClick={async () => {
                                    await gradeTableQuestion(idx, q);
                                    setRevealedQuestions(prev => ({ ...prev, [idx]: true }));
                                  }}
                                  className="w-full py-3 bg-slate-600 hover:bg-slate-500 text-white border border-slate-500/50 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-slate-600/10 font-black disabled:opacity-50"
                                >
                                  {gradingLoading[idx] ? 'AI 채점 진행 중...' : '제출하고 채점하기 →'}
                                </button>
                              ) : (
                                <div className="md:bg-amber-950/30 md:border md:border-amber-500/20 md:rounded-xl md:p-4 p-0 bg-transparent border-0 space-y-2">
                                  <div className="flex justify-between items-center text-[11px] font-black text-amber-400">
                                    <span>📝 상세 해설</span>
                                    <button
                                      onClick={() => setRevealedQuestions(prev => ({ ...prev, [idx]: false }))}
                                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer font-bold"
                                      title="답안 접기"
                                    >
                                      접기 ✕
                                    </button>
                                  </div>
                                  {q.explanation && (
                                    <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.explanation} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} /></div>
                                  )}
                                  {renderCardTutorChat(`r_${idx}`, q)}
                                </div>
                              )}
                            </div>
                          ) : q.type === '주관식 (단답형)' ? (
                            <div className="space-y-3 w-full animate-fade-in">
                              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 space-y-3 text-left">
                                <div className="space-y-1">
                                  <div className="text-[10px] text-slate-500 font-bold">답안 입력:</div>
                                  <div className="relative">
                                    <input
                                      type="text"
                                      disabled={isRevd}
                                      value={tableAnswers[`${idx}_INPUT`] || ''}
                                      onChange={(e) => setTableAnswers(prev => ({ ...prev, [`${idx}_INPUT`]: e.target.value }))}
                                      placeholder="답안을 입력하세요 (한글 10~15자 내외)"
                                      className="w-full bg-slate-900 border border-slate-750 focus:border-slate-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                                    />
                                  </div>
                                </div>
                                {tableGradingResults[`${idx}_INPUT`] && (
                                  <div className={`mt-2 p-2.5 border rounded-xl select-text text-left animate-fade-in ${
                                    tableGradingResults[`${idx}_INPUT`].isCorrect
                                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-450'
                                      : 'bg-rose-950/20 border-rose-500/30 text-rose-450'
                                  }`}>
                                    <div className="text-[10px] font-black flex items-center gap-1.5 mb-0.5">
                                      <span>{tableGradingResults[`${idx}_INPUT`].isCorrect ? '✅ 정답 인정' : '❌ 오답 판정'}</span>
                                    </div>
                                    <p className="text-[10px] leading-relaxed opacity-90">{tableGradingResults[`${idx}_INPUT`].reason}</p>
                                  </div>
                                )}
                              </div>
                              {!isRevd ? (
                                <button
                                  disabled={gradingLoading[idx]}
                                  onClick={async () => {
                                    await gradeSubjectiveQuestion(idx, q);
                                    setRevealedQuestions(prev => ({ ...prev, [idx]: true }));
                                  }}
                                  className="w-full py-3 bg-slate-600 hover:bg-slate-500 text-white border border-slate-500/50 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-slate-600/10 font-black disabled:opacity-50"
                                >
                                  {gradingLoading[idx] ? 'AI 채점 진행 중...' : '제출하고 채점하기 →'}
                                </button>
                              ) : (
                                <div className="md:bg-amber-950/30 md:border md:border-amber-500/20 md:rounded-xl md:p-4 p-0 bg-transparent border-0 space-y-2">
                                  <div className="flex justify-between items-center text-[11px] font-black text-amber-400">
                                    <span>📝 모범 답안 및 해설</span>
                                    <button
                                      onClick={() => setRevealedQuestions(prev => ({ ...prev, [idx]: false }))}
                                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer font-bold"
                                      title="답안 접기"
                                    >
                                      접기 ✕
                                    </button>
                                  </div>
                                  <div className="space-y-1 text-left">
                                    <span className="text-[10px] font-black text-indigo-400">💡 모범 답안: </span>
                                    <div className="text-xs text-slate-200 leading-relaxed font-bold bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/40">{q.answer}</div>
                                  </div>
                                  {q.explanation && (
                                    <div className="space-y-1 pt-2 border-t border-amber-500/10 text-left">
                                      <span className="text-[10px] font-black text-rose-400">🔍 해설: </span>
                                      <div className="text-xs text-slate-200 leading-relaxed bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/40"><LatexRenderer text={q.explanation} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} /></div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            !isRevd ? (
                              <button
                                onClick={() => setRevealedQuestions(prev => ({ ...prev, [idx]: true }))}
                                className="w-full py-3 border-2 border-dashed border-slate-600 hover:border-slate-400 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 transition-all duration-200"
                              >
                                💡 머릿속으로 답안을 구성한 뒤 → 정답 확인
                              </button>
                            ) : (
                              <div className="md:bg-amber-950/30 md:border md:border-amber-500/20 md:rounded-xl md:p-4 p-0 bg-transparent border-0 space-y-2">
                                <div className="flex justify-between items-center text-[11px] font-black text-amber-400">
                                  <span>📝 모범 답안</span>
                                  <button
                                    onClick={() => setRevealedQuestions(prev => ({ ...prev, [idx]: false }))}
                                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer font-bold"
                                    title="답안 접기"
                                  >
                                    접기 ✕
                                  </button>
                                </div>
                                {q.concept && (
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-black text-indigo-400">💡 핵심 개념: </span>
                                    <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.concept} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} /></div>
                                  </div>
                                )}
                                {q.formula && (
                                  <div className="space-y-1 pt-2 border-t border-amber-500/10">
                                    <span className="text-[10px] font-black text-rose-400">📐 공식/개념도: </span>
                                    <div className="text-sm text-slate-200 leading-relaxed bg-slate-900/40 p-4 rounded-xl border border-slate-800/40 my-1 text-left w-full"><LatexRenderer text={q.formula} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} /></div>
                                  </div>
                                )}
                                {subjIdx === 1 && q.structure && (
                                  <div className="space-y-1 pt-2 border-t border-amber-500/10">
                                    <span className="text-[10px] font-black text-rose-455">📋 기호 정의: </span>
                                    <div className="text-sm text-slate-200 leading-relaxed bg-slate-900/40 p-4 rounded-xl border border-slate-800/40 my-1 text-left w-full"><LatexRenderer text={q.structure} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} /></div>
                                  </div>
                                )}
                                {!q.concept && !q.formula && (subjIdx !== 1 || !q.structure) && (
                                  <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.answer || '답안 없음'} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} /></div>
                                )}
                              </div>
                            )
                          )
                        )}
                      </div>
                    );
                  })}

                  {aiQuestions.length > 0 && (
                    <div className={`quiz-card-item text-center py-6 ${(!isDesktop && !isMobileLandscape) ? 'snap-start scroll-mt-4' : ''}`}>
                      <div className="flex justify-center gap-3 flex-wrap">
                        {selectedTopic?.isReadOnly ? (
                          <>
                            <button
                              onClick={handleQuizCompleteClick}
                              className="inline-flex items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-650 rounded-2xl px-6 py-4 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-lg group font-bold text-white text-xs"
                              title="현재 복습 풀이 점수 및 진행 상황을 저장하고 닫습니다."
                            >
                              <span>저장 후 닫기</span>
                            </button>
                            <button
                              onClick={handleQuizCompleteClick}
                              className="inline-flex items-center gap-3 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 hover:border-emerald-450 rounded-2xl px-6 py-4 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-lg group font-bold text-white text-xs"
                              title="다시 풀이한 내용과 성적으로 DB 기록을 업데이트합니다."
                            >
                              <Award size={20} className="text-emerald-200" />
                              <span>다시 푼 성적으로 업데이트</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={handleQuizCompleteClick}
                            className="inline-flex items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-650 rounded-2xl px-8 py-4 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-lg group font-bold text-white text-xs"
                            title="복습 완료 처리 및 점수 저장"
                          >
                            <Award size={20} className="text-emerald-400" />
                            <span>확인 및 완료</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Middle: Gutter (Takes exactly 50px width on Desktop) */}
          <div 
            onMouseDown={startResize}
            className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20 cursor-col-resize select-none hover:bg-slate-800/25 active:bg-violet-500/10 transition-colors group"
          >
            <div className="absolute inset-y-0 w-px bg-slate-800/80 group-hover:bg-slate-700/80 group-active:bg-violet-500/50 transition-colors pointer-events-none" />
            {/* Floating Scroll Button Capsule (Floats beautifully in the center of the empty gutter) */}
            <div 
              className="flex flex-col gap-2.5 p-2 rounded-full bg-slateCustom-950/90 border border-slate-700/40 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.9)] hover:shadow-slate-500/10 hover:border-slate-500/30 select-none z-30 transition-all duration-300 hover:scale-105 cursor-default"
              title="문제 위/아래 이동"
            >
              <button 
                onClick={(e) => { e.stopPropagation(); handleScrollQuestion('up'); }}
                className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-slate-500 hover:shadow-slate-700/30 cursor-pointer flex items-center justify-center group/btn"
                title="이전 문제로 스크롤"
              >
                <ChevronUp size={14} className="group-hover/btn:-translate-y-0.5 transition-transform" />
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); handleScrollQuestion('down'); }}
                className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-slate-500 hover:shadow-slate-700/30 cursor-pointer flex items-center justify-center group/btn"
                title="다음 문제로 스크롤"
              >
                <ChevronDown size={14} className="group-hover/btn:translate-y-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* Right: Gemini Chat Sidebar (Takes exactly 30% width on Desktop) */}
          <div 
            style={isDesktop ? { width: `${rightSidebarWidth}px` } : {}}
            className={`w-full md:w-[30vw] landscape-w-45 min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 md:border-l border-slate-800/30 flex flex-col ${
              (!isDesktop && !isMobileLandscape && reviewMobileTab !== 'tutor') ? 'hidden' : ''
            }`}
          >
              {/* Sidebar Header */}
              <div className="p-3 border-b border-slate-800 flex flex-col gap-2 bg-slateCustom-950 flex-shrink-0 landscape-hide cover-hide">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain size={16} className="text-violet-500" />
                    <span className="text-xs font-bold text-slate-300">AI 튜터</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowFloatingCalculator(prev => !prev)}
                      className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer active:scale-95 shadow-md hidden md:flex items-center gap-1 ${
                        showFloatingCalculator 
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                          : 'bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800/80 hover:bg-slate-800/50'
                      }`}
                      title="공학용 계산기 토글"
                    >
                      <span>🧮 계산기</span>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("튜터 대화 기록과 저장된 캐시 찌꺼기를 모두 삭제하시겠습니까?")) {
                          setChatHistory([]);
                          if (typeof setCurrentAttachedImage === 'function') {
                            setCurrentAttachedImage(null);
                          }
                          setTimeout(() => {
                            forceSaveActiveSessions();
                          }, 50);
                          alert("튜터 데이터가 초기화되었습니다.");
                        }
                      }}
                      className="px-2.5 py-1 text-[10px] font-black bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-white border border-rose-800/80 hover:border-rose-700/80 rounded-lg transition-all cursor-pointer active:scale-95 shadow-md flex items-center gap-1"
                      title="튜터 관련 대화 내용, 캐시 및 저장메모리 청소"
                    >
                      <span>🧹 튜터클린</span>
                    </button>
                  </div>
                </div>

                {selectedTopic && (
                  <button
                    type="button"
                    onClick={() => handleGenerateTopicProblem(selectedTopic)}
                    disabled={isChatLoading}
                    className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all active:scale-98 text-[11px] font-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <HelpCircle size={11} className="text-amber-400" />
                    <span>이 토픽으로 문제 출제 받기 📝</span>
                  </button>
                )}
              </div>

              <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-[11px] text-slate-400">문제 풀이 중 궁금한 점을<br/>무엇이든 물어보세요!</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} id={`chat-msg-${i}`} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
                      <div className={`text-[10px] mb-1 font-bold ${msg.role === 'user' ? 'text-indigo-400 mr-1' : 'text-violet-400 ml-1'}`}>
                        {msg.role === 'user' ? '나' : 'Gemini'}
                      </div>
                      <div className={
                        msg.role === 'user'
                          ? 'px-3 py-2 rounded-2xl max-w-[90%] text-sm leading-relaxed bg-indigo-600 text-white rounded-br-sm'
                          : 'text-sm leading-relaxed text-slate-200 md:bg-slate-800 md:border md:border-slate-700 md:rounded-bl-sm md:px-3 md:py-2 md:rounded-2xl md:max-w-[99%] bg-transparent border-0 p-0 max-w-full w-full'
                      }>
                        {msg.role === 'user' ? (
                          <div className="flex flex-col gap-2">
                            {msg.image && (
                              <img 
                                src={`data:${msg.image.mimeType};base64,${msg.image.data}`} 
                                alt="첨부 이미지" 
                                className="max-w-full max-h-48 rounded-xl object-contain border border-indigo-455 shadow-md"
                              />
                            )}
                            {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                          </div>
                        ) : (
                          <LatexRenderer 
                            text={msg.text} 
                            katexLoaded={katexLoaded} 
                            enableAddFormula={true}
                            isMarkdown={true}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex flex-col items-start w-full">
                    <div className="text-[10px] mb-1 font-bold text-violet-400 ml-1">Gemini</div>
                    <div className="md:px-3 md:py-2 md:rounded-2xl md:bg-slate-800 md:border md:border-slate-700 md:rounded-bl-sm bg-transparent border-0 p-0 text-slate-400 text-xs flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce delay-75"></div>
                      <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce delay-150"></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-slate-800 bg-slateCustom-950 flex-shrink-0 landscape-tutor-input-wrapper">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} 
                  className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 flex items-center gap-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all shadow-lg"
                >
                  {/* 텍스트 입력창 */}
                  <div className="flex-grow">
                    <textarea
                      rows={1}
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendChat();
                        }
                      }}
                      placeholder="기술사 용어나 개념 질문..."
                      disabled={isChatLoading}
                      className="w-full bg-transparent border-0 p-1 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-0 resize-none"
                    />
                  </div>

                  {/* 전송 버튼 */}
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="w-8 h-8 bg-slate-300 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-slate-300 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-md shadow-slate-300/10 active:scale-95 flex-shrink-0"
                  >
                    <Send size={12} className="text-slate-900" />
                  </button>
                </form>
              </div>
            </div>

          </div>
        </div>
      </div>
      )}
      {/* 공식 추가 확인 모달 (Formula Add Confirmation Modal) */}
      {formulaConfirmTarget && (
        <div className="fixed inset-0 z-[200] overflow-y-auto flex items-center justify-center p-4 bg-black/35 transition-all duration-300 animate-fade-in">
          <div className="w-full max-w-[340px] bg-slateCustom-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-5 text-center space-y-4 animate-scale-up">
            
            {/* Modal Icon and Title */}
            <div className="flex flex-col items-center gap-2.5">
              <div className="p-2.5 bg-violet-500/10 text-violet-400 rounded-full">
                <Brain size={22} className="text-violet-500 animate-pulse" />
              </div>
              <h3 className="text-base font-extrabold text-white">필수공식 추가</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                선택한 수식을 필수공식 리스트에 추가하시겠습니까?
              </p>
              <div className="bg-slateCustom-950/60 p-3 border border-slate-800/80 rounded-xl w-full text-center overflow-x-auto select-text">
                <LatexRenderer text={`$$${formulaConfirmTarget.math}$$`} katexLoaded={katexLoaded} />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2.5 justify-center">
              <button
                onClick={() => {
                  const target = formulaConfirmTarget;
                  setFormulaConfirmTarget(null);
                  handleAddSpecificFormula(target.math, target.fullText);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-300 hover:bg-slate-200 text-slate-900 font-extrabold text-xs tracking-wide transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shadow-md shadow-slate-300/10"
              >
                추가하기
              </button>
              <button
                onClick={() => setFormulaConfirmTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-xs tracking-wide transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              >
                취소
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* 공식 추가 완료 및 이동 확인 모달 (Formula Added Modal) */}
      {formulaAddedTarget && (
        <div className="fixed inset-0 z-[200] overflow-y-auto flex items-center justify-center p-4 bg-black/35 transition-all duration-300 animate-fade-in">
          <div className="w-full max-w-[340px] bg-slateCustom-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-5 text-center space-y-4 animate-scale-up">
            
            {/* Modal Icon and Title */}
            <div className="flex flex-col items-center gap-2.5">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-full">
                <CheckCircle size={22} className="text-emerald-500" />
              </div>
              <h3 className="text-base font-extrabold text-white">추가 완료!</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                [<span className="text-brand-400">{formulaAddedTarget.title}</span>] 공식이 필수공식 리스트에 추가되었습니다.
              </p>
              <div className="bg-slateCustom-950/60 p-3 border border-slate-800/80 rounded-xl text-[10.5px] text-emerald-300 font-bold leading-normal w-full">
                지금 필수공식 탭으로 이동하여 학습/퀴즈를 진행하시겠습니까?
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2.5 justify-center">
              <button
                onClick={() => {
                  setFormulaAddedTarget(null);
                  setSelectedTopic(null);
                  setShowExam(false);
                  setShowAnswerSheet(false);
                  setShowFormulaExam(true);
                  setViewMode('dashboard');
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs tracking-wide transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shadow-md"
              >
                이동하기
              </button>
              <button
                onClick={() => setFormulaAddedTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-xs tracking-wide transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              >
                계속 학습하기
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* 복습 초기화 확인 모달 (Reset Review Confirmation Modal) */}
      {resetConfirmTarget && (
        <div className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center p-4 bg-slateCustom-950/80 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-md bg-slateCustom-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 text-center space-y-6 animate-scale-up">
            
            {/* Modal Icon and Title */}
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-amber-500/10 text-amber-400 rounded-full">
                <RefreshCw size={28} className="animate-spin-slow text-amber-500" />
              </div>
              <h3 className="text-lg font-extrabold text-white">복습을 다시 하겠습니까?</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                [<span className="text-brand-400">{resetConfirmTarget.topicTitle}</span>]의 <strong>{resetConfirmTarget.round}회차 복습</strong>을 다시 수행하시겠습니까?
              </p>
              <div className="bg-slateCustom-950/60 p-3.5 border border-slate-800/80 rounded-2xl text-[11px] text-amber-300 font-bold leading-normal w-full">
                ※ 완료 상태가 <span className="underline text-amber-400">대기</span>로 환원되며,<br/>
                <strong>오늘의 복습 리스트</strong>에 해당 항목이 다시 생성됩니다!
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => handleResetReview(resetConfirmTarget.scheduleId, resetConfirmTarget.topicTitle, resetConfirmTarget.round)}
                className="flex-1 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs tracking-wide transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shadow-md"
              >
                예
              </button>
              <button
                onClick={() => setResetConfirmTarget(null)}
                className="flex-1 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-xs tracking-wide transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              >
                아니오
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* ===== COMPREHENSIVE EXAM MODAL (70문항) ===== */}
      {showExam && (
        <div 
          onTouchStart={handleSwipeTouchStart}
          onTouchEnd={(e) => handleSwipeTouchEnd(e, examMobileTab, setExamMobileTab)}
          className="fixed inset-y-0 right-0 left-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col md:pl-36 landscape-pl-0 pc-enlarged-text overflow-hidden scrollbar-none-mobile"
        >
          


          {/* Main Layout Area */}
          <div className="flex-1 flex flex-row min-h-0 w-full overflow-hidden">
            {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
                        {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
            <div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-40 flex-shrink-0 items-stretch justify-start overflow-y-auto scrollbar-none">
              {lastActiveReview && (
                <button
                  onClick={() => {
                    savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                    fetch(`${API_BASE}/api/session/exam`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll: savedExamScroll.current }),
                    }).catch(e => console.warn('세션 저장 실패:', e));
                    setShowExam(false);
                    handleOpenLastActiveReview();
                  }}
                  className="flex bg-light-rainbow-animate border rounded-xl p-2 items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 text-left w-full select-none"
                  title="공부중 복습 이어서 진행"
                >
                  <Clock size={12} className="text-slate-950 shrink-0" />
                  <span className="text-[9px] font-black text-slate-950 truncate text-ellipsis overflow-hidden whitespace-nowrap max-w-[80px]">공부중: {lastActiveReview.title}</span>
                </button>
              )}

              <button
                onClick={() => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  fetch(`${API_BASE}/api/session/exam`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll: savedExamScroll.current }),
                  }).catch(e => console.warn('세션 저장 실패:', e));
                  setShowExam(false);
                  setViewMode('dashboard');
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <Calendar size={12} />
                <span>오늘의 복습</span>
              </button>

              <button
                onClick={() => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  fetch(`${API_BASE}/api/session/exam`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll: savedExamScroll.current }),
                  }).catch(e => console.warn('세션 저장 실패:', e));
                  setShowExam(false);
                  setViewMode('all_topics');
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <List size={12} />
                <span>복습토픽</span>
              </button>

              <button
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-gradient-to-tr from-amber-600 to-yellow-500 text-white border-amber-500 shadow-lg select-none cursor-default"
              >
                <Award size={12} />
                <span>종합평가</span>
              </button>

              <button
                onClick={() => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  fetch(`${API_BASE}/api/session/exam`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll: savedExamScroll.current }),
                  }).catch(e => console.warn('세션 저장 실패:', e));
                  setShowExam(false);
                  handleOpenFormulaExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-rose-400 border-slate-800/80 hover:text-rose-200 hover:bg-rose-950/40 transition-all cursor-pointer"
              >
                <Sigma size={12} />
                <span>필수공식</span>
              </button>


              <button
                onClick={() => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  fetch(`${API_BASE}/api/session/exam`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll: savedExamScroll.current }),
                  }).catch(e => console.warn('세션 저장 실패:', e));
                  setShowExam(false);
                  handleOpenAnswerSheet();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-emerald-400 border-slate-800/80 hover:text-emerald-200 hover:bg-emerald-950/40 transition-all cursor-pointer"
              >
                <FileText size={12} />
                <span>답안지</span>
              </button>

              <div className="h-px bg-slate-800/60 my-1 shrink-0" />

              <button
                onClick={handleAddExamQuestions}
                disabled={loadingExam}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white border-indigo-500/40 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                title="종합평가에 신규 AI 문제 10문항 추가"
              >
                <span className="text-[10px]">➕</span>
                <span>문제 추가</span>
              </button>
              
              <button
                onClick={handleRefreshExamQuestions}
                disabled={loadingExam}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-violet-950/40 hover:bg-violet-900/60 text-violet-300 hover:text-white border-violet-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                title="종합평가 전체 문제 실시간 AI 재출제"
              >
                <span className="text-xs">🔄</span>
                <span>리프레쉬</span>
              </button>

              <button
                onClick={async () => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  try {
                    const r = await fetch(`${API_BASE}/api/session/exam`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        examQuestions, 
                        examRevealed, 
                        examAnswers, 
                        examTopic,
                        savedExamScroll: savedExamScroll.current 
                      }),
                    });
                    if (!r.ok) throw new Error('서버 응답 오류');
                  } catch (e) {
                    console.warn('세션 저장 실패:', e);
                  }
                  setShowExam(false);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900 text-slate-300 hover:text-white border-slate-800 hover:bg-slate-800/50 transition-all cursor-pointer active:scale-95"
                title="화면만 숨김 (재개 시 문제 유지)"
              >
                <span className="text-[10px]">❌</span>
                <span>닫기</span>
              </button>

              <button
                onClick={() => {
                  if (window.confirm("종합평가를 완전히 종료하고 결과 리포트를 저장하시겠습니까?")) {
                    fetch(`${API_BASE}/api/session/exam`, { method: 'DELETE' })
                      .catch(e => console.warn('세션 삭제 실패:', e));
                    setShowExam(false); setExamQuestions([]); setExamRevealed({}); setExamAnswers({}); setExamTopic(null); setExamOptionExplanations({}); setTableAnswers({});
                  }
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-rose-950/60 hover:bg-rose-900/65 text-rose-300 hover:text-white border-rose-500/20 transition-all cursor-pointer active:scale-95"
                title="종합평가 종료"
              >
                <span className="text-xs">⏹️</span>
                <span>종료</span>
              </button>

              <button
                onClick={() => {
                  if (window.confirm("튜터 대화 기록과 저장된 캐시 찌꺼기를 모두 삭제하시겠습니까?")) {
                    setChatHistory([]);
                    if (typeof setCurrentAttachedImage === 'function') {
                      setCurrentAttachedImage(null);
                    }
                    setTimeout(() => {
                      forceSaveActiveSessions();
                    }, 50);
                    alert("튜터 데이터가 초기화되었습니다.");
                  }
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-white border-rose-800/80 hover:border-rose-700/80 transition-all cursor-pointer active:scale-95"
                title="튜터 관련 대화 내용, 캐시 및 저장메모리 청소"
              >
                <span className="text-xs">🧹</span>
                <span>튜터클린</span>
              </button>
            </div>

            {/* Layout Split Container (Mobile: Horizontal Swipe, PC: Side-by-Side) */}
            <div 
              ref={examSplitContainerRef}
              onScroll={(e) => {
                if (!isDesktop && isMobileLandscape) {
                  const scrollLeft = e.currentTarget.scrollLeft;
                  const clientWidth = e.currentTarget.clientWidth;
                  if (clientWidth > 0) {
                    const activeTab = scrollLeft > clientWidth / 2 ? 'tutor' : 'list';
                    setExamMobileTab(activeTab);
                  }
                }
              }}
              className={`flex-1 flex flex-row ${(!isDesktop && !isMobileLandscape) ? 'overflow-x-hidden' : 'overflow-x-auto md:overflow-x-hidden'} overflow-y-hidden ${(!isDesktop && !isMobileLandscape) ? '' : 'snap-x snap-mandatory'} scroll-smooth min-h-0 w-full scrollbar-none`}
            >
            
            {/* Left: Exam Wrapper (Takes exactly 60% width on Desktop) */}
            <div 
              className={`w-full shrink-0 md:flex-1 md:shrink min-w-0 snap-start h-full relative overflow-hidden flex flex-col items-center bg-slateCustom-900/30 landscape-bg-slate-900 ${
                (!isDesktop && !isMobileLandscape && examMobileTab !== 'list') ? 'hidden' : ''
              }`}
            >
          {/* Exam Header */}
          <div className="w-full flex flex-col sm:flex-row sm:items-center justify-start px-5 py-4 bg-slateCustom-950 border-b border-amber-500/20 flex-shrink-0 gap-4 sm:gap-8 landscape-hide">
            <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
              <div className="p-2 bg-amber-950/80 text-amber-400 rounded-xl flex-shrink-0 mt-0.5">
                <Award size={20} />
              </div>
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider whitespace-nowrap">종합평가 (Gemini AI)</span>
                  {!loadingExam && examQuestions.length > 0 && (
                    <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                      {examQuestions.length}문항
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-white text-xs sm:text-sm truncate sm:whitespace-normal" title={examTopic?.title}>
                  {examTopic?.title}
                </h3>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-start border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0">
              {!loadingExam && examQuestions.length > 0 && (
                <span className="text-[10px] text-slate-400 mr-auto sm:hidden font-bold">
                  정답: {Object.keys(examAnswers).filter(i => examAnswers[i] === examQuestions[parseInt(i)]?.answer).length}/{examQuestions.filter(q => q.type === '객관식').length}
                </span>
              )}
              <button
                onClick={handleAddExamQuestions}
                disabled={loadingExam}
                className="px-4 py-2 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 hover:text-white border border-indigo-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed mr-1"
                title="종합평가에 신규 AI 문제 10문항 추가 (기존 풀이 보존)"
              >
                {loadingExam ? (
                  <svg className="animate-spin h-3.5 w-3.5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : "➕"}
                <span>문제추가</span>
              </button>
              <button
                onClick={handleRefreshExamQuestions}
                disabled={loadingExam}
                className="px-4 py-2 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 hover:text-white border border-amber-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                title="종합평가 전체 문제 실시간 AI 재출제"
              >
                {loadingExam ? (
                  <svg className="animate-spin h-3.5 w-3.5 text-amber-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : "🔄"}
                <span>리프레쉬</span>
              </button>
              <button
                onClick={async () => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  // 서버에 현재 상태 저장 (기기 간 공유) - 완료 확인 후 닫기
                  try {
                    const r = await fetch(`${API_BASE}/api/session/exam`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        examQuestions, 
                        examRevealed, 
                        examAnswers, 
                        examTopic,
                        savedExamScroll: savedExamScroll.current 
                      }),
                    });
                    if (!r.ok) throw new Error('서버 응답 오류');
                  } catch (e) {
                    console.warn('세션 저장 실패:', e);
                    showNotification('다른 기기와 동기화에 실패했습니다. 로컬에만 저장됩니다.', 'error');
                  }
                  setShowExam(false);
                }}
                className="px-4 py-2 bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                title="화면만 숨김 (재개 시 문제 유지)"
              >
                닫기
              </button>
               <button
                onClick={() => {
                  // 서버 세션 삭제 (종료 = 새로 시작)
                  fetch(`${API_BASE}/api/session/exam`, { method: 'DELETE' })
                    .catch(e => console.warn('세션 삭제 실패:', e));
                  setShowExam(false); setExamQuestions([]); setExamRevealed({}); setExamAnswers({}); setExamTopic(null); setExamOptionExplanations({}); setTableAnswers({});
                }}
                className="px-4 py-2 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-rose-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                title="종합평가 종료 (재개 시 새 문제 생성)"
              >
                종료
              </button>

            </div>
          </div>
              <div 
                ref={examBodyRef} 
                className={`flex-1 w-full overflow-y-auto px-0 py-3 sm:p-6 md:pl-6 md:pr-1 scroll-smooth relative landscape-quiz-body scrollbar-none-mobile ${(!isDesktop && !isMobileLandscape) ? 'snap-y snap-mandatory' : ''}`}
              >
            {loadingExam && examQuestions.length === 0 ? (
              <div className="py-32 flex flex-col items-center justify-center gap-4 text-center">
                <div className="relative">
                  <div className="p-6 bg-amber-950/80 text-amber-400 rounded-full animate-bounce-slow">
                    <Brain size={40} />
                  </div>
                  <div className="absolute inset-0 bg-amber-500 rounded-full animate-ping opacity-20"></div>
                </div>
                <h4 className="text-xl font-bold text-white mt-2">Gemini AI가 종합평가 테스트 문제를 생성하는 중...</h4>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  구글 API 안정성 확보 및 버퍼 초과(429 Rate Limit) 방지를 위해 실시간 문제 빌드 및 자동 검증을 진행합니다. 잠시만 대기해 주세요.
                </p>
              </div>
            ) : (
              <div className="w-full space-y-5 pb-32">
                {examQuestions.map((q, idx) => {
                  const isMC = q.type === '객관식';
                  const isSubj = !isMC;
                  const answered = examAnswers[idx] !== undefined;
                  const normalizeAns = (s) => (s || '').replace(/^\d+\.\s*/, '').trim();
                  const isCorrect = answered && normalizeAns(examAnswers[idx]) === normalizeAns(q.answer);
                  const isRevd = !!examRevealed[idx];

                  const subtypeBadgeColor =
                    q.subtype === '개요' ? 'bg-sky-700' :
                    q.subtype === '공식' ? 'bg-rose-700' :
                    q.subtype === '서술' ? 'bg-indigo-700' :
                    'bg-emerald-700';

                  return (
                    <div key={idx} className={`exam-card-item bg-slateCustom-900 border border-slate-800 rounded-2xl px-2.5 py-4 sm:p-5 space-y-3 scroll-mt-2 transition-all duration-300 hover:border-slate-700/50 ${(!isDesktop && !isMobileLandscape) ? 'snap-start scroll-mt-4' : ''}`}>
                      {/* Q Header */}
                      <div className="flex items-center justify-between gap-2 flex-wrap w-full">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black bg-slate-700 text-slate-200 px-2 py-0.5 rounded">Q{idx + 1}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded text-white ${isMC ? 'bg-emerald-700' : subtypeBadgeColor}`}>
                            {isMC ? '객관식' : '주관식'}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {/* 답안보기 버튼 */}
                          <button
                            onClick={() => {
                              if (isMC) {
                                setExamAnswers(prev => ({ ...prev, [idx]: q.answer }));
                              } else {
                                setExamRevealed(prev => ({ ...prev, [idx]: !prev[idx] }));
                              }
                            }}
                            className="flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg border bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-700/50 hover:text-white transition-all duration-300 active:scale-95 cursor-pointer select-none"
                            title="정답 및 해설 바로 확인"
                          >
                            <span>👁️ 답안보기</span>
                          </button>
                          {/* 추천/비추천 피드백 버튼 */}
                          <button
                            onClick={() => handleToggleFeedback(q.topic_id || selectedTopic?.id || examTopic?.id, q.question, 'upvote')}
                            className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg border transition-all duration-300 active:scale-95 cursor-pointer ${
                              questionFeedback[`${q.topic_id || selectedTopic?.id || examTopic?.id}_${q.question.trim()}`] === 'upvote'
                                ? 'bg-emerald-950/60 border-emerald-500 text-emerald-450 font-black' 
                                : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-emerald-950/20 hover:border-emerald-500/30 hover:text-emerald-400'
                            }`}
                            title="추천: 다음에 문제 생성 시 이 문제 유형의 출제 빈도를 높깁니다."
                          >
                            <ThumbsUp size={12} />
                            <span>추천</span>
                          </button>
                          <button
                            onClick={() => handleToggleFeedback(q.topic_id || selectedTopic?.id || examTopic?.id, q.question, 'downvote')}
                            className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg border transition-all duration-300 active:scale-95 cursor-pointer ${
                              questionFeedback[`${q.topic_id || selectedTopic?.id || examTopic?.id}_${q.question.trim()}`] === 'downvote'
                                ? 'bg-rose-950/60 border-rose-500 text-rose-450 font-black' 
                                : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-rose-950/20 hover:border-rose-500/30 hover:text-rose-400'
                            }`}
                            title="비추천: 다음에 문제 생성 시 이 문제 유형의 출제 빈도를 낮추거나 제외합니다."
                          >
                            <ThumbsDown size={12} />
                            <span>비추천</span>
                          </button>

                          {answered && isMC && (
                            <button
                              onClick={() => handleResetSingleExamAnswer(idx)}
                              className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-amber-950/40 hover:border-amber-500/50 hover:text-amber-400 active:scale-95 transition-all duration-300"
                            >
                              <svg
                                className="w-3 h-3 text-slate-400 hover:text-amber-400"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                              </svg>
                              다시 풀기
                            </button>
                          )}
                          
                          <button
                            disabled={regeneratingExam[idx]}
                            onClick={() => handleRegenerateQuestion('exam', idx, q)}
                            className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all duration-300 ${
                              regeneratingExam[idx]
                                ? 'bg-indigo-950/20 border-indigo-500/30 text-indigo-400 cursor-not-allowed animate-pulse'
                                : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-indigo-950/40 hover:border-indigo-500/50 hover:text-indigo-400 active:scale-95 cursor-pointer'
                            }`}
                          >
                            <svg
                              className={`w-3 h-3 ${regeneratingExam[idx] ? 'animate-spin text-indigo-400' : 'text-slate-400 group-hover:text-indigo-400'}`}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                            {regeneratingExam[idx] ? '변환 중...' : '변환'}
                          </button>

                          <button
                            onClick={() => handleDeleteExamQuestion(idx)}
                            className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-rose-950/40 hover:border-rose-500/50 hover:text-rose-400 active:scale-95 transition-all duration-300 cursor-pointer"
                            title="이 문제를 종합평가에서 삭제"
                          >
                            <svg
                              className="w-3 h-3 text-slate-400 group-hover:text-rose-400"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            삭제
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const { questionText, tableData } = parseQuestionTable(q);
                        const cleanQuestionText = questionText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
                        return (
                          <>
                            <div className="text-[17px] font-bold text-white leading-relaxed">
                              <LatexRenderer text={cleanQuestionText} katexLoaded={katexLoaded} enableAddFormula={true} />
                            </div>
                            {isMC && tableData && (
                              <ReadOnlyTable tableData={tableData} katexLoaded={katexLoaded} />
                            )}
                          </>
                        );
                      })()}

                      {/* MC Options */}
                      {isMC && (
                        <div className="space-y-2">
                          {q.options?.map((opt, oIdx) => {
                            let cls = "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 ";
                            if (!answered) {
                              cls += "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/70 hover:border-slate-600 cursor-pointer select-none";
                            } else if (normalizeAns(opt) === normalizeAns(q.answer)) {
                              cls += "bg-emerald-950/70 border-emerald-500 text-emerald-200 font-extrabold cursor-default select-text";
                            } else if (normalizeAns(opt) === normalizeAns(examAnswers[idx]) && normalizeAns(opt) !== normalizeAns(q.answer)) {
                              cls += "bg-rose-950/70 border-rose-500 text-rose-200 cursor-default select-text";
                            } else {
                              cls += "bg-slate-800/30 border-slate-800/50 text-slate-300 cursor-default select-text";
                            }
                            return (
                              <div
                                key={oIdx}
                                onClick={() => {
                                  if (answered) return; // 한번 선택하면 끝, 다시 선택 불가
                                  setExamAnswers(prev => {
                                    const updated = { ...prev, [idx]: opt };
                                    const normalizeAns = (s) => (s || '').replace(/^\d+\.\s*/, '').trim();
                                    if (isDesktop || isMobileLandscape) {
                                      if (normalizeAns(opt) === normalizeAns(q.answer)) {
                                        setTimeout(() => {
                                          const cards = examBodyRef.current?.querySelectorAll('.exam-card-item');
                                          if (cards && cards[idx]) {
                                            examBodyRef.current?.scrollTo({ top: cards[idx].offsetTop, behavior: 'smooth' });
                                          }
                                        }, 600);
                                      }
                                    }
                                    return updated;
                                  });
                                }}
                                className={cls}
                              >
                                <span className="flex gap-2 items-start select-text">
                                  <span className="font-black text-[10px] mt-0.5 flex-shrink-0 select-none">{['①','②','③','④'][oIdx]}</span>
                                  <LatexRenderer text={opt} katexLoaded={katexLoaded} className="inline select-text" enableAddFormula={true} />
                                </span>
                              </div>
                            );
                          })}
                          {answered && (
                            <div className={`mt-2 p-3 rounded-xl text-sm leading-relaxed ${isCorrect ? 'bg-emerald-950/50 border border-emerald-500/30 text-emerald-200' : 'bg-rose-950/50 border border-rose-500/30 text-rose-200'}`}>
                              <span className="font-black">{isCorrect ? '✅ 정답!' : '❌ 오답'}</span>
                              {!isCorrect && (
                                <span className="ml-2 inline-flex items-center gap-1">
                                  정답: <strong className="inline-block"><LatexRenderer text={q.answer} katexLoaded={katexLoaded} className="inline" enableAddFormula={true} /></strong>
                                </span>
                              )}
                              {q.explanation && <div className="mt-1.5 text-slate-300"><LatexRenderer text={q.explanation} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} /></div>}
                              
                              {/* AI 해설 및 보기분석 버튼 패널 */}
                              <div className="mt-2 pt-2 border-t border-slate-700/40">
                                <div className="flex flex-wrap items-center justify-center gap-1.5 mb-1.5">
                                  {/* 문제조정 버튼 */}
                                  {adjustingInputKey !== `e_${idx}` && (
                                    <button
                                      onClick={() => setAdjustingInputKey(`e_${idx}`)}
                                      className="text-[9.5px] px-2 py-1 rounded-md border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                    >
                                      🛠️ 문제조정 (AI 피드백)
                                    </button>
                                  )}
                                  
                                  {/* 보기별 정밀 분석 해설 보기 버튼 */}
                                  {!examOptionExplanations[idx] && (
                                    <button
                                      onClick={() => handleRequestOptionExplanation('exam', idx, q.question, q.options, q.answer)}
                                      className="text-[9.5px] px-2 py-1 rounded-md border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 font-bold transition-all cursor-pointer"
                                    >
                                      🔍 보기별 정밀 분석 해설 보기 (AI)
                                    </button>
                                  )}
                                  
                                  {/* AI 튜터 버튼 */}
                                  <button
                                    onClick={() => setActiveTutorInputKey(prev => prev === `e_${idx}` ? null : `e_${idx}`)}
                                    className="text-[9.5px] px-2 py-1 rounded-md border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-95 duration-250"
                                  >
                                    💬 AI 튜터
                                  </button>
                                </div>

                                {/* 문제조정 입력 및 결과 보드 */}
                                {adjustingInputKey === `e_${idx}` && (
                                  <div className="mt-2 p-3 bg-indigo-950/20 border border-indigo-500/30 rounded-xl w-full">
                                    <label className="block text-[10px] font-black text-indigo-400 mb-1">🛠️ 문제조정 의견을 제시해 주세요:</label>
                                    <textarea
                                      rows={2}
                                      value={adjustingText[`e_${idx}`] || ''}
                                      onChange={(e) => {
                                        const text = e.target.value;
                                        setAdjustingText(prev => ({ ...prev, [`e_${idx}`]: text }));
                                      }}
                                      placeholder="예: 수치를 20m로 변경해줘, 난이도를 낮춰줘 등..."
                                      className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-2 resize-none"
                                    />
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        onClick={() => setAdjustingInputKey(null)}
                                        className="text-[10px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors font-bold cursor-pointer"
                                      >
                                        취소
                                      </button>
                                      <button
                                        onClick={() => handleAdjustQuestion('exam', idx, q)}
                                        disabled={adjustingLoading[`e_${idx}`]}
                                        className="text-[10px] px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors font-bold cursor-pointer disabled:opacity-50"
                                      >
                                        {adjustingLoading[`e_${idx}`] ? '조정 중...' : '조정하기'}
                                      </button>
                                    </div>
                                    {adjustingLoading[`e_${idx}`] && (
                                      <div className="text-[10px] text-indigo-400 font-bold animate-pulse py-1.5 mt-2">⏳ AI가 의견을 반영하여 문제를 조율 중입니다...</div>
                                    )}
                                  </div>
                                )}

                                    {/* AI 튜터 입력 및 답변 보드 */}
                                    {activeTutorInputKey === `e_${idx}` && (
                                      <div className="mt-2 p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl w-full">
                                        <label className="block text-[10px] font-black text-amber-400 mb-1">💬 AI 튜터 질문하기 (이 문제에 대해 물어보세요):</label>
                                        <textarea
                                          rows={3}
                                          value={tutorInputText[`e_${idx}`] || ''}
                                          onChange={(e) => {
                                            const text = e.target.value;
                                            setTutorInputText(prev => ({ ...prev, [`e_${idx}`]: text }));
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                              e.preventDefault();
                                              const isPending = tutorAnswers[`e_${idx}`]?.loading;
                                              const hasText = (tutorInputText[`e_${idx}`] || '').trim();
                                              if (!isPending && hasText) {
                                                handleAskCardTutor(`e_${idx}`, q);
                                              }
                                            }
                                          }}
                                          placeholder="예: 이 공식이 유도되는 세부적인 역학적 기작을 설명해줘, 이 보기에서 마찰 저항이 왜 감쇄하는지 자세히 알려줘 등..."
                                          className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 mb-2 resize-none"
                                        />
                                        <div className="flex gap-2 justify-end">
                                          <button
                                            onClick={() => setActiveTutorInputKey(null)}
                                            className="text-[10px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors font-bold cursor-pointer"
                                          >
                                            취소
                                          </button>
                                          <button
                                            disabled={tutorAnswers[`e_${idx}`]?.loading || !(tutorInputText[`e_${idx}`] || '').trim()}
                                            onClick={() => handleAskCardTutor(`e_${idx}`, q)}
                                            className="text-[10px] px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800/50 disabled:text-amber-400 text-white font-bold transition-all cursor-pointer active:scale-95 duration-200"
                                          >
                                            {tutorAnswers[`e_${idx}`]?.loading ? '답변 작성 중...' : '질문하기'}
                                          </button>
                                        </div>

                                        {/* AI Tutor In-Card Answer Panel */}
                                        {tutorAnswers[`e_${idx}`]?.loading && (
                                          <div className="py-2.5 flex flex-col gap-1.5 animate-pulse select-text mt-2 border-t border-amber-500/10">
                                            <div className="text-[10px] text-amber-400 font-bold flex items-center gap-1.5">
                                              <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></div>
                                              <span>⏳ AI 튜터가 답변을 구성하는 중...</span>
                                            </div>
                                            <div className="h-4 bg-slate-800 rounded w-5/6"></div>
                                            <div className="h-4 bg-slate-800 rounded w-4/6"></div>
                                          </div>
                                        )}
                                        {tutorAnswers[`e_${idx}`]?.error && (
                                          <div className="text-[10px] text-rose-400 font-bold select-text mt-2 border-t border-amber-500/10 pt-2">❌ 답변 오류: {tutorAnswers[`e_${idx}`].error}</div>
                                        )}
                                        {tutorAnswers[`e_${idx}`]?.text && !tutorAnswers[`e_${idx}`]?.loading && (
                                          <div className="mt-2 pt-2 border-t border-amber-500/20 select-text">
                                            <div className="text-[11px] font-black text-amber-400 mb-1.5">💬 AI 튜터 답변</div>
                                            <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap select-text text-left w-full">
                                              <LatexRenderer text={tutorAnswers[`e_${idx}`].text} katexLoaded={katexLoaded} enableAddFormula={true} isMarkdown={true} />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* 보기별 정밀 분석 결과 */}
                                {examOptionExplanations[idx]?.loading && (
                                  <div className="py-2.5 flex flex-col gap-1.5 animate-pulse select-text">
                                    <div className="text-[10px] text-amber-400 font-bold flex items-center gap-1.5">
                                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></div>
                                      <span>⏳ AI가 각 보기의 정/오답 메커니즘을 정밀 분석 중...</span>
                                    </div>
                                    <div className="h-4 bg-slate-800 rounded w-5/6"></div>
                                    <div className="h-4 bg-slate-800 rounded w-4/6"></div>
                                  </div>
                                )}
                                {examOptionExplanations[idx]?.error && (
                                  <div className="text-[10px] text-rose-400 font-bold select-text">❌ 보기 해설 실패: {examOptionExplanations[idx].error}</div>
                                )}
                                {examOptionExplanations[idx]?.text && !examOptionExplanations[idx]?.loading && (
                                  <div className="mt-2 p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl select-text">
                                    <div className="text-[11px] font-black text-amber-400 mb-2">🔍 보기별 정밀 분석 해설 (오답 및 정답 사유)</div>
                                    <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap select-text">
                                      <LatexRenderer text={examOptionExplanations[idx].text} katexLoaded={katexLoaded} enableAddFormula={true} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Subjective Reveal */}
                      {isSubj && (
                          q.type === '주관식 (표채우기)' ? (
                            <div className="space-y-3 w-full">
                              <TableQuiz 
                                questionIdx={idx} 
                                q={q} 
                                tableAnswers={tableAnswers} 
                                setTableAnswers={setTableAnswers} 
                                revealed={!!examRevealed[idx]} 
                                katexLoaded={katexLoaded} 
                                tableGradingResults={tableGradingResults}
                              />
                              {!examRevealed[idx] ? (
                                <button
                                  disabled={gradingLoading[idx]}
                                  onClick={async () => {
                                    await gradeTableQuestion(idx, q);
                                    setExamRevealed(prev => ({ ...prev, [idx]: true }));
                                  }}
                                  className="w-full py-3 bg-amber-600 hover:bg-amber-500 border border-amber-500/50 text-white rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-amber-600/20 font-black disabled:opacity-50"
                                >
                                  {gradingLoading[idx] ? 'AI 채점 진행 중...' : '제출하고 채점하기 →'}
                                </button>
                              ) : (
                                <div className="md:bg-amber-950/30 md:border md:border-amber-500/20 md:rounded-xl md:p-4 p-0 bg-transparent border-0 space-y-2">
                                  <div className="flex justify-between items-center text-[11px] font-black text-amber-400">
                                    <span>📝 상세 해설</span>
                                    <button
                                      onClick={() => setExamRevealed(prev => ({ ...prev, [idx]: false }))}
                                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer font-bold"
                                      title="답안 접기"
                                    >
                                      접기 ✕
                                    </button>
                                  </div>
                                  {q.explanation && (
                                    <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.explanation} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} /></div>
                                  )}
                                  {renderCardTutorChat(`e_${idx}`, q)}
                                </div>
                              )}
                            </div>
                          ) : q.type === '주관식 (단답형)' ? (
                            <div className="space-y-3 w-full animate-fade-in">
                              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 space-y-3 text-left">
                                <div className="space-y-1">
                                  <div className="text-[10px] text-slate-500 font-bold">답안 입력:</div>
                                  <div className="relative">
                                    <input
                                      type="text"
                                      disabled={!!examRevealed[idx]}
                                      value={tableAnswers[`${idx}_INPUT`] || ''}
                                      onChange={(e) => setTableAnswers(prev => ({ ...prev, [`${idx}_INPUT`]: e.target.value }))}
                                      placeholder="답안을 입력하세요 (한글 10~15자 내외)"
                                      className="w-full bg-slate-900 border border-slate-750 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition-all"
                                    />
                                  </div>
                                </div>
                                {tableGradingResults[`${idx}_INPUT`] && (
                                  <div className={`mt-2 p-2.5 border rounded-xl select-text text-left animate-fade-in ${
                                    tableGradingResults[`${idx}_INPUT`].isCorrect
                                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-450'
                                      : 'bg-rose-950/20 border-rose-500/30 text-rose-450'
                                  }`}>
                                    <div className="text-[10px] font-black flex items-center gap-1.5 mb-0.5">
                                      <span>{tableGradingResults[`${idx}_INPUT`].isCorrect ? '✅ 정답 인정' : '❌ 오답 판정'}</span>
                                    </div>
                                    <p className="text-[10px] leading-relaxed opacity-90">{tableGradingResults[`${idx}_INPUT`].reason}</p>
                                  </div>
                                )}
                              </div>
                              {!examRevealed[idx] ? (
                                <button
                                  disabled={gradingLoading[idx]}
                                  onClick={async () => {
                                    await gradeSubjectiveQuestion(idx, q);
                                    setExamRevealed(prev => ({ ...prev, [idx]: true }));
                                  }}
                                  className="w-full py-3 bg-amber-600 hover:bg-amber-550 border border-amber-500/50 text-white rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-amber-600/20 font-black disabled:opacity-50"
                                >
                                  {gradingLoading[idx] ? 'AI 채점 진행 중...' : '제출하고 채점하기 →'}
                                </button>
                              ) : (
                                <div className="md:bg-amber-950/30 md:border md:border-amber-500/20 md:rounded-xl md:p-4 p-0 bg-transparent border-0 space-y-2">
                                  <div className="flex justify-between items-center text-[11px] font-black text-amber-400">
                                    <span>📝 모범 답안 및 해설</span>
                                    <button
                                      onClick={() => setExamRevealed(prev => ({ ...prev, [idx]: false }))}
                                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer font-bold"
                                      title="답안 접기"
                                    >
                                      접기 ✕
                                    </button>
                                  </div>
                                  <div className="space-y-1 text-left">
                                    <span className="text-[10px] font-black text-indigo-400">💡 모범 답안: </span>
                                    <div className="text-xs text-slate-200 leading-relaxed font-bold bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/40">{q.answer}</div>
                                  </div>
                                  {q.explanation && (
                                    <div className="space-y-1 pt-2 border-t border-amber-500/10 text-left">
                                      <span className="text-[10px] font-black text-rose-400">🔍 해설: </span>
                                      <div className="text-xs text-slate-200 leading-relaxed bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/40"><LatexRenderer text={q.explanation} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} /></div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            !examRevealed[idx] ? (
                              <button
                                onClick={() => setExamRevealed(prev => ({ ...prev, [idx]: true }))}
                                className="w-full py-3 border-2 border-dashed border-slate-600 hover:border-amber-500 rounded-xl text-xs font-bold text-slate-400 hover:text-amber-300 transition-all duration-200"
                              >
                                💡 머릿속으로 답안을 구성한 뒤 → 정답 확인
                              </button>
                            ) : (
                              <div className="md:bg-amber-950/30 md:border md:border-amber-500/20 md:rounded-xl md:p-4 p-0 bg-transparent border-0 space-y-2">
                                <div className="flex justify-between items-center text-[11px] font-black text-amber-400">
                                  <span>📝 모범 답안</span>
                                  <button
                                    onClick={() => setExamRevealed(prev => ({ ...prev, [idx]: false }))}
                                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer font-bold"
                                    title="답안 접기"
                                  >
                                    접기 ✕
                                  </button>
                                </div>
                                <div className="text-sm text-slate-200 leading-relaxed">
                                  <LatexRenderer text={q.answer || '답안 없음'} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} />
                                </div>
                                {q.concept && (
                                  <div className="pt-2 border-t border-amber-500/10">
                                    <span className="text-[10px] font-black text-indigo-400">💡 핵심 개념: </span>
                                    <span className="text-[10px] text-slate-300">{q.concept}</span>
                                  </div>
                                )}
                              </div>
                            )
                          )
                        )}
                    </div>
                  );
                })}

                {loadingExam && (
                  <div className="bg-slateCustom-900 border border-violet-500/30 rounded-2xl p-6 text-center animate-pulse flex flex-col items-center justify-center gap-3">
                    <div className="p-3 bg-violet-950/80 text-violet-400 rounded-full animate-bounce">
                      <Brain size={28} />
                    </div>
                    <div className="space-y-1">
                      <h5 className="text-sm font-bold text-white">Gemini AI가 추가 10문항을 생성하고 있습니다...</h5>
                      <p className="text-[11px] text-slate-400">1~10번 문항이 삭제되었으며, 기존 남은 문제들을 푸는 동안 백그라운드에서 신규 문항이 하단에 자동으로 채워집니다.</p>
                    </div>
                  </div>
                )}

                {examQuestions.length > 0 && !loadingExam && (
                  <div className={`exam-card-item text-center py-6 ${(!isDesktop && !isMobileLandscape) ? 'snap-start scroll-mt-4' : ''}`}>
                    <div className="inline-flex items-center gap-3 bg-amber-950/60 border border-amber-500/20 rounded-2xl px-6 py-4">
                      <Award size={20} className="text-amber-400" />
                      <div className="text-left">
                        <div className="text-xs text-amber-300 font-black">종합평가 완료</div>
                        <div className="text-sm text-white font-extrabold">
                          객관식 정답률: {Math.round(Object.keys(examAnswers).filter(i => examAnswers[i] === examQuestions[parseInt(i)]?.answer).length / Math.max(examQuestions.filter(q => q.type === '객관식').length, 1) * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
              </div>
            </div>

            {/* Middle: Gutter (Takes exactly 50px width on Desktop) */}
            <div 
              onMouseDown={startResize}
              className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20 cursor-col-resize select-none hover:bg-slate-800/25 active:bg-amber-500/10 transition-colors group"
            >
              <div className="absolute inset-y-0 w-px bg-slate-800/80 group-hover:bg-slate-700/80 group-active:bg-amber-500/50 transition-colors pointer-events-none" />
              {/* Floating Scroll Button Capsule (Floats beautifully in the center of the empty gutter) */}
              <div 
                className="flex flex-col gap-2.5 p-2 rounded-full bg-slateCustom-950/90 border border-slate-700/40 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.9)] hover:shadow-amber-500/10 hover:border-amber-500/30 select-none z-30 transition-all duration-300 hover:scale-105 cursor-default"
                title="문제 위/아래 이동"
              >
                <button 
                  onClick={(e) => { e.stopPropagation(); handleScrollExamQuestion('up'); }}
                  className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-amber-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-amber-400 hover:shadow-amber-650/30 cursor-pointer flex items-center justify-center group/btn"
                  title="이전 문제로 스크롤"
                >
                  <ChevronUp size={14} className="group-hover/btn:-translate-y-0.5 transition-transform" />
                </button>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); handleScrollExamQuestion('down'); }}
                  className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-amber-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-amber-400 hover:shadow-amber-650/30 cursor-pointer flex items-center justify-center group/btn"
                  title="다음 문제로 스크롤"
                >
                  <ChevronDown size={14} className="group-hover/btn:translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right: Gemini Sidebar (Takes exactly 30% width on Desktop) */}
            <div 
              style={isDesktop ? { width: `${rightSidebarWidth}px` } : {}}
              className={`w-full md:w-[30vw] landscape-w-45 min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 md:border-l border-slate-800/30 flex flex-col ${
                (!isDesktop && !isMobileLandscape && examMobileTab !== 'tutor') ? 'hidden' : ''
              }`}
            >
              {/* Sidebar Header */}
              <div className="p-3 border-b border-slate-800 flex flex-col gap-2 bg-slateCustom-950 flex-shrink-0 landscape-hide cover-hide">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain size={16} className="text-amber-500" />
                    <span className="text-xs font-bold text-slate-300">AI 튜터</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowFloatingCalculator(prev => !prev)}
                      className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer active:scale-95 shadow-md hidden md:flex items-center gap-1 ${
                        showFloatingCalculator 
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                          : 'bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800/80 hover:bg-slate-800/50'
                      }`}
                      title="공학용 계산기 토글"
                    >
                      <span>🧮 계산기</span>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("튜터 대화 기록과 저장된 캐시 찌꺼기를 모두 삭제하시겠습니까?")) {
                          setChatHistory([]);
                          if (typeof setCurrentAttachedImage === 'function') {
                            setCurrentAttachedImage(null);
                          }
                          setTimeout(() => {
                            forceSaveActiveSessions();
                          }, 50);
                          alert("튜터 데이터가 초기화되었습니다.");
                        }
                      }}
                      className="px-2.5 py-1 text-[10px] font-black bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-white border border-rose-800/80 hover:border-rose-700/80 rounded-lg transition-all cursor-pointer active:scale-95 shadow-md flex items-center gap-1"
                      title="튜터 관련 대화 내용, 캐시 및 저장메모리 청소"
                    >
                      <span>🧹 튜터클린</span>
                    </button>
                  </div>
                </div>


              </div>
              
              <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-[11px] text-slate-400">문제 풀이 중 궁금한 점을<br/>무엇이든 물어보세요!</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} id={`chat-msg-${i}`} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
                      <div className={`text-[10px] mb-1 font-bold ${msg.role === 'user' ? 'text-indigo-400 mr-1' : 'text-amber-400 ml-1'}`}>
                        {msg.role === 'user' ? '나' : 'Gemini'}
                      </div>
                      <div className={
                        msg.role === 'user' 
                          ? 'px-4 py-2.5 rounded-2xl max-w-[95%] text-xs leading-relaxed bg-indigo-600 text-white rounded-br-sm' 
                          : 'text-xs leading-relaxed text-slate-200 md:bg-slate-800 md:border md:border-slate-700 md:rounded-bl-sm md:px-4 md:py-2.5 md:rounded-2xl md:max-w-[99%] bg-transparent border-0 p-0 max-w-full w-full prose prose-invert prose-sm max-w-none'
                      }>
                        {msg.role === 'user' ? (
                          <div className="flex flex-col gap-2">
                            {msg.image && (
                              <img 
                                src={`data:${msg.image.mimeType};base64,${msg.image.data}`} 
                                alt="첨부 이미지" 
                                className="max-w-full max-h-48 rounded-xl object-contain border border-indigo-455 shadow-md"
                              />
                            )}
                            {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                          </div>
                        ) : (
                          <LatexRenderer 
                            text={msg.text} 
                            katexLoaded={katexLoaded} 
                            enableAddFormula={true}
                            isMarkdown={true}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex flex-col items-start w-full">
                    <div className="text-[10px] mb-1 font-bold text-amber-400 ml-1">Gemini</div>
                    <div className="md:px-3 md:py-2 md:rounded-2xl md:bg-slate-800 md:border md:border-slate-700 md:rounded-bl-sm bg-transparent border-0 p-0 text-slate-400 text-xs flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce delay-75"></div>
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce delay-150"></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-slate-800 bg-slateCustom-950 flex-shrink-0 landscape-tutor-input-wrapper">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} 
                  className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 flex items-center gap-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all shadow-lg"
                >
                  {/* 텍스트 입력창 */}
                  <div className="flex-grow">
                    <textarea
                      rows={1}
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendChat();
                        }
                      }}
                      placeholder="기술사 용어나 개념 질문..."
                      disabled={isChatLoading}
                      className="w-full bg-transparent border-0 p-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-0 resize-none"
                    />
                  </div>

                  {/* 전송 버튼 */}
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="w-8 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-md shadow-indigo-600/10 active:scale-95 flex-shrink-0"
                  >
                    <Send size={12} className="text-white" />
                  </button>
                </form>
              </div>
            </div>

          </div>
          </div>
        </div>
      )}

      {/* ===== ESSENTIAL FORMULA EXAM MODAL (주관식) ===== */}
      {showFormulaExam && (
        <div 
          onTouchStart={handleSwipeTouchStart}
          onTouchEnd={(e) => handleSwipeTouchEnd(e, formulaMobileTab, setFormulaMobileTab)}
          className="fixed inset-y-0 right-0 left-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col md:pl-36 landscape-pl-0 pc-enlarged-text overflow-hidden scrollbar-none-mobile"
        >
          
          {/* Formula Header */}
          {(!isDesktop && !isMobileLandscape) ? (
            formulaMobileTab === 'list' ? (
              /* Mobile Portrait Header for Formulas Modal */
              <div className="flex flex-col gap-3 px-4 py-4 bg-slateCustom-950 border-b border-slate-800/80 flex-shrink-0">
                {/* Title Line */}
                <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-brand-400 bg-clip-text text-transparent">
                  필수공식
                </h1>
                
                {/* 6 Category Switcher Buttons */}
                <div className="flex flex-col gap-2 w-full">
                  {/* 첫 번째 줄 */}
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => {
                        handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                        setShowFormulaExam(false);
                        setViewMode('dashboard');
                      }}
                      className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl border border-slate-800/80 bg-slateCustom-900/60 text-slate-400 hover:text-white"
                    >
                      <Calendar size={14} />
                      오늘의 복습
                    </button>
                    <button
                      onClick={() => {
                        handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                        setShowFormulaExam(false);
                        setViewMode('all_topics');
                      }}
                      className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl border border-slate-800/80 bg-slateCustom-900/60 text-slate-400 hover:text-white"
                    >
                      <List size={14} />
                      복습토픽
                    </button>
                    <button
                      onClick={() => {
                        handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                        setShowFormulaExam(false);
                        handleOpenExam();
                      }}
                      className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-amber-400 hover:text-amber-200 border border-slate-800/80 rounded-xl"
                    >
                      <Award size={14} />
                      종합평가
                    </button>
                  </div>
                  {/* 두 번째 줄 */}
                  <div className="flex gap-2 w-full">
                    <button
                      className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 border border-rose-500 bg-gradient-to-tr from-rose-600 to-pink-500 text-white shadow-lg rounded-xl"
                    >
                      <Sigma size={14} />
                      필수공식
                    </button>
                    <button
                      onClick={() => {
                        handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                        setShowFormulaExam(false);
                        handleOpenAnswerSheet();
                      }}
                      className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-emerald-400 hover:text-emerald-200 border border-slate-800/80 rounded-xl"
                    >
                      <FileText size={14} />
                      답안지
                    </button>
                  </div>
                </div>

                {/* Topic Search Box (공식퀴즈 버튼 숨김) */}
                <div className="flex items-center gap-2 w-full mt-1">
                  <div className="relative flex items-center flex-grow">
                    <Search size={14} className="absolute left-3 text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="공식 제목 검색..."
                      value={formulaSearchQuery}
                      onChange={(e) => setFormulaSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 bg-slateCustom-900/60 hover:bg-slateCustom-900 border border-slate-800 focus:border-rose-500/50 text-white placeholder-slate-500 text-xs rounded-xl focus:outline-none transition-all duration-200"
                    />
                    {formulaSearchQuery && (
                      <button
                        onClick={() => setFormulaSearchQuery('')}
                        className="absolute right-2.5 p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null
          ) : (
             /* Desktop/Landscape Header for Formulas Modal */
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-rose-500/20 flex-shrink-0 gap-4 landscape-hide">
              <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
                <div className="p-2 bg-rose-950/80 text-rose-400 rounded-xl flex-shrink-0 mt-0.5">
                  <Sigma size={20} />
                </div>
                <div className="min-w-0 flex-grow">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase text-rose-400 tracking-wider whitespace-nowrap">필수공식 집중 복습</span>
                    {!loadingFormula && formulaQuestions.length > 0 && (
                      <span className="text-[10px] bg-rose-950/60 text-rose-300 border border-rose-500/20 px-2 py-0.5 rounded-full font-bold">
                        {formulaQuestions.length}개 공식
                      </span>
                    )}
                    {/* Mobile Swipe Hint */}
                    <span className="inline-flex md:hidden text-[9px] bg-rose-950/60 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full font-black animate-pulse whitespace-nowrap">
                      ← 좌우 쓸어 넘겨 공식 퀴즈 보기
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <h3 className="font-bold text-white text-xs sm:text-sm truncate sm:whitespace-normal">
                      전공 필수 공식 집중 평가 (주관식 인출)
                    </h3>
                    {/* Centered Add Question/Formula Button (Header Position next to title) */}
                    <button
                      onClick={() => {
                        const newFormula = {
                          title: "",
                          concept: "",
                          assumptions: "",
                          formula: "",
                          isDirectlyAdded: true
                        };
                        const updated = [...formulaQuestions, newFormula];
                        latestFormulaQuestionsRef.current = updated;
                        setFormulaQuestions(updated);
                        localStorage.setItem('anti_formula_questions', JSON.stringify(updated));
                        showNotification('새로운 필수 공식 카드 기출 빈표가 성공적으로 추가되었습니다.', 'success');
                        setTimeout(() => {
                          if (formulaBodyRef.current) {
                            formulaBodyRef.current.scrollTo({
                              top: formulaBodyRef.current.scrollHeight,
                              behavior: 'smooth'
                            });
                          }
                        }, 80);
                      }}
                      className="py-1 px-3 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black rounded-lg transition-all duration-200 active:scale-[0.97] hidden md:flex items-center justify-center gap-1 shadow-md shadow-rose-600/10 hover:shadow-rose-600/20 cursor-pointer border border-rose-500/20 select-none whitespace-nowrap"
                    >
                      <PlusCircle size={11} />
                      <span>새로운 공식 추가 (빈표 생성)</span>
                    </button>

                    {lastActiveReview && (
                      <button
                        onClick={() => {
                          handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                          setShowFormulaExam(false);
                          handleOpenLastActiveReview();
                        }}
                        className="py-1 px-3 bg-light-rainbow-animate text-slate-950 text-[11px] font-black rounded-lg transition-all duration-200 active:scale-[0.97] hidden md:flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 hover:shadow-emerald-600/20 cursor-pointer border border-slate-700/30 select-none whitespace-nowrap hover:scale-[1.02]"
                        title={`가장 최근 진행한 복습: [${lastActiveReview.title}] (클릭 시 이어서 학습)`}
                      >
                        <Clock size={11} className="text-slate-950 animate-pulse-slow shrink-0" />
                        <span className="max-w-[120px] truncate">공부중: {lastActiveReview.title}</span>
                      </button>
                    )}

                    {/* Moved Search Box */}
                    <div className="relative flex items-center min-w-[200px] sm:min-w-[240px] flex-grow sm:flex-grow-0 ml-1">
                      <Search size={14} className="absolute left-3 text-slate-500 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="공식 제목 검색..."
                        value={formulaSearchQuery}
                        onChange={(e) => setFormulaSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-1.5 bg-slateCustom-900/60 hover:bg-slateCustom-900 border border-slate-800 focus:border-rose-500/50 text-white placeholder-slate-500 text-xs rounded-xl focus:outline-none transition-all duration-200"
                      />
                      {formulaSearchQuery && (
                        <button
                          onClick={() => setFormulaSearchQuery('')}
                          className="absolute right-2.5 p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0">
                <button
                  onClick={() => setShowFloatingCalculator(prev => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 hidden md:flex items-center justify-center gap-1.5 ${
                    showFloatingCalculator 
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                      : 'bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50'
                  }`}
                  title="공학용 계산기 플로팅 창 토글"
                >
                  <span>🧮 계산기</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("AI 튜터와의 모든 대화 기록을 지우시겠습니까?")) {
                      saveFormulaChatHistory([]);
                    }
                  }}
                  className="px-3 py-2 bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                  title="AI 튜터와의 모든 대화 기록 비우기"
                >
                  <Trash2 size={12} className="text-slate-400" />
                  <span>튜터클린</span>
                </button>
                <button
                  onClick={() => {
                    handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false); // 닫기를 눌러도 저장후 닫기
                    savedFormulaScroll.current = formulaBodyRef.current?.scrollTop || 0;
                    setFormulaSearchQuery('');
                    setShowFormulaExam(false);
                  }}
                  className="px-4 py-2 bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                  title="저장 후 닫기"
                >
                  닫기
                </button>
                <button
                  onClick={() => {
                    handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, true); // 저장 버튼: 저장만 하고 닫지는 않음
                  }}
                  className="px-4 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 hover:text-white border border-emerald-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center flex items-center justify-center gap-1.5"
                  title="공식 변경사항 실시간 저장"
                >
                  <Save size={13} />
                  저장
                </button>
              </div>
            </div>
          )}



          {/* Layout Split Container (Mobile: Hides inactive column to lock layout, PC: Side-by-Side) */}
          <div 
            ref={formulaSplitContainerRef}
            className="flex-1 flex flex-row overflow-x-hidden overflow-y-hidden min-h-0 w-full scrollbar-none landscape-split-container"
          >
            
            {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
                        {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
            <div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-40 flex-shrink-0 items-stretch justify-start overflow-y-auto scrollbar-none">
              {lastActiveReview && (
                <button
                  onClick={() => {
                    handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                    setShowFormulaExam(false);
                    handleOpenLastActiveReview();
                  }}
                  className="flex bg-light-rainbow-animate border rounded-xl p-2 items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 text-left w-full select-none"
                  title="공부중 복습 이어서 진행"
                >
                  <Clock size={12} className="text-slate-950 shrink-0" />
                  <span className="text-[9px] font-black text-slate-950 truncate text-ellipsis overflow-hidden whitespace-nowrap max-w-[80px]">공부중: {lastActiveReview.title}</span>
                </button>
              )}

              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                  setShowFormulaExam(false);
                  setViewMode('dashboard');
                  setSelectedTopic(null);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <Calendar size={12} />
                <span>오늘의 복습</span>
              </button>

              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                  setShowFormulaExam(false);
                  setViewMode('all_topics');
                  setSelectedTopic(null);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <List size={12} />
                <span>복습토픽</span>
              </button>

              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                  setShowFormulaExam(false);
                  handleOpenExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-amber-400 border-slate-800/80 hover:text-amber-200 hover:bg-amber-950/40 transition-all cursor-pointer"
              >
                <Award size={12} />
                <span>종합평가</span>
              </button>

              <button
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-gradient-to-tr from-rose-600 to-pink-500 text-white border-rose-500 shadow-lg select-none cursor-default"
              >
                <Sigma size={12} />
                <span>필수공식</span>
              </button>


              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                  setShowFormulaExam(false);
                  handleOpenAnswerSheet();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-emerald-400 border-slate-800/80 hover:text-emerald-200 hover:bg-emerald-950/40 transition-all cursor-pointer"
              >
                <FileText size={12} />
                <span>답안지</span>
              </button>

              </div>
            
            {/* Left: Formula Wrapper (Takes exactly 68% width on Desktop) */}
              <div 
                className={`w-full shrink-0 md:flex-1 md:shrink min-w-0 snap-start h-full relative overflow-hidden flex flex-col items-center bg-slateCustom-900/30 ${
                  (!isDesktop && !isMobileLandscape && formulaMobileTab !== 'list') ? 'hidden' : ''
                }`}
              >
              {/* Left: Formula Body (Expanded to take full wrapper width with moved scrollbar) */}
              <div 
                ref={formulaBodyRef} 
                className="flex-1 w-full overflow-y-auto overflow-x-hidden p-3 sm:p-6 md:px-5 md:pr-3 scroll-smooth flex flex-col scrollbar-none-mobile custom-vertical-scrollbar"
                onTouchStart={(e) => {
                  if (!isDesktop && !isMobileLandscape && formulaBodyRef.current && formulaBodyRef.current.scrollTop === 0) {
                    formulaTouchStartY.current = e.touches[0].clientY;
                  }
                }}
                onTouchMove={(e) => {
                  if (!isDesktop && !isMobileLandscape && formulaBodyRef.current && formulaBodyRef.current.scrollTop === 0 && !formulaRefreshing) {
                    const currentY = e.touches[0].clientY;
                    const deltaY = currentY - formulaTouchStartY.current;
                    if (deltaY > 0) {
                      const dist = Math.min(deltaY * 0.4, 80);
                      setFormulaPull(dist);
                      if (dist > 10 && e.cancelable) {
                        e.preventDefault();
                      }
                    }
                  }
                }}
                onTouchEnd={async () => {
                  if (!isDesktop && !isMobileLandscape && !formulaRefreshing) {
                    if (formulaPull >= 60) {
                      setFormulaRefreshing(true);
                      setFormulaPull(40);
                      try {
                        await loadFormulaQuestions();
                        showNotification('필수공식이 성공적으로 새로고침되었습니다.', 'success');
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setFormulaRefreshing(false);
                        setFormulaPull(0);
                      }
                    } else {
                      setFormulaPull(0);
                    }
                  }
                }}
              >
              {/* Pull to Refresh Indicator */}
              {(formulaPull > 0 || formulaRefreshing) && (
                <div 
                  style={{ height: `${formulaPull}px` }} 
                  className="w-full flex items-center justify-center overflow-hidden transition-all duration-150 text-slate-400 text-xs font-semibold gap-2 bg-slateCustom-950/40 border-b border-slate-800/40 select-none flex-shrink-0"
                >
                  {formulaRefreshing ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw size={14} className="animate-spin text-brand-400" />
                      <span>새로고침 중...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <ChevronDown size={14} className={`transition-transform duration-200 ${formulaPull >= 60 ? 'rotate-180 text-brand-400' : ''}`} />
                      <span>{formulaPull >= 60 ? '놓아서 새로고침' : '아래로 당겨서 새로고침'}</span>
                    </div>
                  )}
                </div>
              )}
              {loadingFormula ? (
                <div className="py-32 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="relative">
                    <div className="p-6 bg-rose-950/80 text-rose-400 rounded-full animate-bounce-slow">
                      <Sigma size={40} />
                    </div>
                    <div className="absolute inset-0 bg-rose-500 rounded-full animate-ping opacity-20"></div>
                  </div>
                  <h4 className="text-xl font-bold text-white mt-2">필수 공식 데이터를 로드하는 중...</h4>
                </div>
              ) : (
                <div className="w-full space-y-5 pb-32">

                  {formulaQuestions.filter(q => {
                    const titleMatch = (q.title || '').toLowerCase().includes(formulaSearchQuery.toLowerCase());
                    const questionMatch = (q.question || '').toLowerCase().includes(formulaSearchQuery.toLowerCase());
                    return titleMatch || questionMatch;
                  }).length === 0 && (
                    <div className="py-24 text-center flex flex-col items-center justify-center gap-4 text-center animate-scale-up">
                      <div className="p-5 bg-slateCustom-950/60 border border-slate-800 text-slate-500 rounded-full flex items-center justify-center">
                        <Search size={32} />
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-white">검색 결과가 없습니다</h4>
                        <p className="text-xs text-slate-400 mt-1">다른 공식 명칭으로 검색하시거나 검색어를 확인해 보세요.</p>
                      </div>
                      <button
                        onClick={() => setFormulaSearchQuery('')}
                        className="px-4 py-2 bg-slateCustom-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-black rounded-xl border border-slate-800 hover:border-slate-700 transition-all cursor-pointer active:scale-95"
                      >
                        검색 필터 초기화
                      </button>
                    </div>
                  )}

                  {formulaQuestions
                    .map((q, originalIdx) => ({ ...q, originalIdx }))
                    .filter(q => {
                      const titleMatch = (q.title || '').toLowerCase().includes(formulaSearchQuery.toLowerCase());
                      const questionMatch = (q.question || '').toLowerCase().includes(formulaSearchQuery.toLowerCase());
                      return titleMatch || questionMatch;
                    })
                    .map((q) => {
                      const idx = q.originalIdx;
                      const isNewEmptyCard = !q.title && !q.formula;
                      const isInputVisible = isNewEmptyCard || !!formulaInputRevealed[idx];
                      const isOutputVisible = isNewEmptyCard || (!!formulaRevealed[idx] && !isInputVisible);

                      return (
                      <div key={idx} id={`formula-card-${idx}`} className="formula-card-item bg-slateCustom-900 border border-slate-800 rounded-2xl p-5 space-y-4 scroll-mt-2 transition-all duration-300 hover:border-slate-700/50">
                        {/* Title Row */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                          {/* Row 1: Q badge & Title */}
                          <div className="flex items-start gap-2.5 md:flex-1 min-w-0">
                            {/* Q 번호 배지 */}
                            <span className="text-[11px] font-black bg-rose-950/80 text-rose-400 px-2.5 py-1 rounded-lg border border-rose-500/20 shrink-0 select-none">
                              Q{idx + 1}
                            </span>
                            
                            {/* Title & Editor */}
                            <div className="flex-grow min-w-0">
                              {editingFormulaIdx === idx ? (
                                <div className="flex items-center gap-2 w-full">
                                  <input
                                    type="text"
                                    value={editingFormulaText}
                                    onChange={(e) => setEditingFormulaText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const trimmed = editingFormulaText.trim();
                                        if (trimmed) {
                                          setFormulaQuestions(prev => {
                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item).map(healFormulaQuestionObject);
                                            handleSaveFormulaQuestions(updated, false);
                                            return updated;
                                          });
                                          setEditingFormulaIdx(null);
                                          showNotification('공식 제목이 저장되었습니다.', 'success');
                                        }
                                      } else if (e.key === 'Escape') {
                                        setEditingFormulaIdx(null);
                                      }
                                    }}
                                    className="bg-slateCustom-950 border border-slate-700 text-white text-[16px] font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-rose-500 w-full max-w-[360px]"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => {
                                      const trimmed = editingFormulaText.trim();
                                      if (trimmed) {
                                        setFormulaQuestions(prev => {
                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item).map(healFormulaQuestionObject);
                                          handleSaveFormulaQuestions(updated, false);
                                          return updated;
                                        });
                                        setEditingFormulaIdx(null);
                                        showNotification('공식 제목이 저장되었습니다.', 'success');
                                      }
                                    }}
                                    className="px-2 py-1 bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded hover:bg-emerald-800/60 transition-colors shrink-0 cursor-pointer"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingFormulaIdx(null)}
                                    className="px-2 py-1 bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold rounded hover:bg-slate-700 transition-colors shrink-0 cursor-pointer"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
                                  <span 
                                    onDoubleClick={() => {
                                      setEditingFormulaIdx(idx);
                                      setEditingFormulaText(q.title || q.question || '');
                                    }}
                                    className="text-[17px] font-extrabold text-white leading-snug cursor-pointer hover:text-rose-400 hover:underline transition-all whitespace-normal break-words max-w-full inline-block"
                                    title="더블클릭하여 공식 제목 수정"
                                  >
                                    <LatexRenderer text={q.question || q.title} katexLoaded={katexLoaded} />
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingFormulaIdx(idx);
                                      setEditingFormulaText(q.title || q.question || '');
                                    }}
                                    className="p-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 hover:border-yellow-500/50 rounded-lg text-yellow-400 transition-all duration-150 cursor-pointer shrink-0 inline-flex items-center justify-center hover:scale-105 active:scale-95 shadow-[0_2px_8px_rgba(234,179,8,0.1)] landscape-hide mobile-portrait-hide"
                                    title="공식 제목 수정"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Action Buttons (정답확인, 리프레쉬, 삭제) */}
                          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto mt-1.5 md:mt-0 select-none md:justify-end shrink-0">
                            {/* 정답확인 button */}
                            {!isNewEmptyCard && (
                              (isMobileLandscape || isHeavyHtml(q.formula) || !isOutputVisible) ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (formulaInputRevealed[idx]) {
                                      handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                                      setFormulaInputRevealed(prev => ({ ...prev, [idx]: false }));
                                    }
                                    if (isMobileLandscape || isHeavyHtml(q.formula)) {
                                      handleOpenHtmlAnswerPopup(q.title || `Q${idx + 1}`, q.formula);
                                    } else {
                                      setFormulaRevealed({ [idx]: true });
                                      scrollToFormulaCard(idx);
                                    }
                                  }}
                                  className="py-1 px-3 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold rounded-lg transition-all duration-150 active:scale-[0.95] cursor-pointer shrink-0 select-none whitespace-nowrap shadow-md shadow-rose-600/10 hover:shadow-rose-600/20 border border-rose-500/20 flex items-center justify-center gap-1"
                                  title="정답 확인하기"
                                >
                                  <span>정답확인</span>
                                </button>
                              ) : null
                            )}

                            {/* AI Refresh Button */}
                            {!q.isDirectlyAdded && (
                              <button
                                onClick={() => handleRefreshFormula(idx)}
                                disabled={refreshingFormulaIdx === idx}
                                className={`p-1.5 rounded-lg border border-slate-700/50 text-slate-400 hover:text-brand-400 hover:bg-brand-500/10 hover:border-brand-500/20 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 text-[11px] font-bold bg-slate-800/40 ${
                                  refreshingFormulaIdx === idx ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                                title="AI를 통해 공식 제목, 핵심개념, 기호정의를 다시 분석하여 재생성"
                              >
                                <RefreshCw 
                                  size={12} 
                                  className={refreshingFormulaIdx === idx ? 'animate-spin text-brand-400' : ''} 
                                />
                                <span>새로고침</span>
                              </button>
                            )}

                            {/* AI Adjust Formula Button */}
                            {!q.isDirectlyAdded && (
                              <button
                                onClick={() => setAdjustingFormulaInputKey(prev => prev === idx ? null : idx)}
                                disabled={adjustingFormulaLoading[idx]}
                                className={`p-1.5 rounded-lg border border-slate-700/50 text-slate-400 hover:text-brand-400 hover:bg-brand-500/10 hover:border-brand-500/20 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 text-[11px] font-bold bg-slate-800/40 ${
                                  adjustingFormulaLoading[idx] ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                                title="공식 제목, 핵심개념, 기호정의를 조율하기 위한 피드백 입력창 토글"
                              >
                                <Edit2 size={12} />
                                <span>공식조정</span>
                              </button>
                            )}

                            {/* AI Tutor Discussion Button */}
                            {!isNewEmptyCard && (
                              <button
                                onClick={() => {
                                  handleFormulaSelect(idx);
                                  setFormulaMobileTab('tutor');
                                }}
                                className={`p-1.5 rounded-lg border text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 text-[11px] font-bold bg-slate-800/40 ${
                                  selectedFormulaIdx === idx 
                                    ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' 
                                    : 'border-slate-700/50'
                                }`}
                                title="AI 튜터와 이 공식에 대해 질문하고 토론하기"
                              >
                                <MessageSquare size={12} />
                                <span>AI 토론</span>
                              </button>
                            )}


                            {/* Toggle Input Editor */}
                            {q.isDirectlyAdded && (
                              <button
                                onClick={() => {
                                  if (isMobileLandscape) {
                                    const val = window.prompt("LaTeX 공식을 입력하세요:", q.formula || "");
                                    if (val !== null) {
                                      const updated = [...formulaQuestions];
                                      updated[idx] = { ...updated[idx], formula: val };
                                      latestFormulaQuestionsRef.current = updated;
                                      setFormulaQuestions(updated);
                                      localStorage.setItem('anti_formula_questions', JSON.stringify(updated));
                                      handleSaveFormulaQuestions(updated, false);
                                    }
                                  } else {
                                    setFormulaInputRevealed(prev => ({
                                      ...prev,
                                      [idx]: !prev[idx]
                                    }));
                                  }
                                }}
                                className={`p-1.5 rounded-lg border transition-all cursor-pointer text-[11px] font-bold flex items-center gap-1.5 ${
                                  !isMobileLandscape && isInputVisible 
                                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' 
                                    : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border-slate-700/50 bg-slate-800/40'
                                }`}
                                title={isInputVisible ? "입력창 닫기" : "입력창 열기"}
                              >
                                <Edit2 size={12} />
                                <span>수정하기</span>
                              </button>
                            )}

                            {/* Delete/Trash Button */}
                            <button
                              onClick={() => {
                                if (window.confirm(`[${q.title || `Q${idx + 1}`}] 공식을 필수공식 퀴즈 리스트에서 삭제하시겠습니까?`)) {
                                  const updated = formulaQuestions.filter((_, i) => i !== idx);
                                  latestFormulaQuestionsRef.current = updated;
                                  setFormulaQuestions(updated);
                                  handleSaveFormulaQuestions(updated, false);
                                  setFormulaRevealed(prev => {
                                    const next = { ...prev };
                                    delete next[idx];
                                    return next;
                                  });
                                  setFormulaInputRevealed(prev => {
                                    const next = { ...prev };
                                    delete next[idx];
                                    return next;
                                  });
                                  showNotification(`[${q.title || `Q${idx + 1}`}] 공식이 삭제되었습니다.`, 'info');
                                }
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 border border-slate-700/50 bg-slate-800/40 transition-all cursor-pointer text-[11px] font-bold flex items-center gap-1.5"
                              title="공식 삭제"
                            >
                              <Trash2 size={12} />
                              <span>삭제</span>
                            </button>
                          </div>
                        </div>

                        {/* 공식조정 입력 및 결과 보드 */}
                        {adjustingFormulaInputKey === idx && (
                          <div className="mt-2.5 p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-xl w-full">
                            <label className="block text-[10px] font-black text-indigo-400 mb-1.5 select-none">🛠️ 공식조정 의견을 제시해 주세요:</label>
                            <textarea
                              rows={2}
                              value={adjustingFormulaText[idx] || ''}
                              onChange={(e) => {
                                const text = e.target.value;
                                setAdjustingFormulaText(prev => ({ ...prev, [idx]: text }));
                              }}
                              placeholder="예: 이 공식의 명칭을 '터널 여굴 두께 공식'으로 바꾼 뒤, 변수 L을 터널 굴착 길이로 맞추어 개념을 자세히 써줘..."
                              className="w-full text-xs p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-2 resize-none animate-fade-in"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => setAdjustingFormulaInputKey(null)}
                                className="text-[10px] px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors font-bold cursor-pointer"
                              >
                                취소
                              </button>
                              <button
                                onClick={() => handleAdjustFormula(idx)}
                                disabled={adjustingFormulaLoading[idx]}
                                className="text-[10px] px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors font-bold cursor-pointer disabled:opacity-50"
                              >
                                {adjustingFormulaLoading[idx] ? '조정 중...' : '조정하기'}
                              </button>
                            </div>
                            {adjustingFormulaLoading[idx] && (
                              <div className="text-[10px] text-indigo-400 font-bold animate-pulse py-1.5 mt-2">⏳ AI가 의견을 반영하여 공식을 재구성 중입니다...</div>
                            )}
                          </div>
                        )}

                        {/* Real-time LaTeX rendered Output Display Window */}
                        {!isMobileLandscape && isOutputVisible && (
                          <div className="space-y-3 md:p-4 md:bg-slateCustom-950/40 md:rounded-xl md:border md:border-slate-800/80 p-0 bg-transparent border-0 min-h-0 relative">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-rose-400 block select-none">🖥️ 출력창 (실시간 LaTeX 렌더링)</span>
                              {!isNewEmptyCard && (
                                <button
                                  onClick={() => setFormulaRevealed(prev => ({ ...prev, [idx]: false }))}
                                  className="text-[10px] font-bold text-slate-500 hover:text-white px-2 py-0.5 bg-slate-800/80 hover:bg-slate-700 rounded-md transition-all cursor-pointer active:scale-95 select-none"
                                >
                                  접기 ✕
                                </button>
                              )}
                            </div>

                                                        {q.concept && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-black text-indigo-400">💡 핵심 개념: </span>
                                <div className="text-sm text-slate-200 leading-relaxed">
                                  <LatexRenderer text={q.concept} katexLoaded={katexLoaded} isMarkdown={true} placeholderIfHeavy={true} popupTitle={(q.title || `Q${idx + 1}`) + " - 핵심 개념"} />
                                </div>
                              </div>
                            )}

                            {q.formula ? (
                              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                                <span className="text-[10px] font-black text-rose-400 font-extrabold">📐 대표 공식 및 기호 정의: </span>
                                <div className="text-sm text-slate-200 leading-relaxed bg-slate-900/40 p-4 rounded-xl border border-slate-800/40 my-1 text-left w-full">
                                  <LatexRenderer text={q.formula} katexLoaded={katexLoaded} isMarkdown={true} placeholderIfHeavy={true} popupTitle={q.title || `Q${idx + 1}`} />
                                </div>
                              </div>
                            ) : !q.concept && (
                              <div className="text-xs text-slate-500 italic select-none">아래 입력창에 LaTeX 수식을 입력하면 여기에 실시간으로 렌더링되어 보여집니다.</div>
                            )}
                          </div>
                        )}

                        {/* Input Textarea Area for Paste / Typing LaTeX */}
                        {!isMobileLandscape && isInputVisible && (
                          <div className="space-y-1 pt-1 animate-fade-in">
                            <span className="text-[10px] font-black text-slate-400 block select-none">✍️ 입력창 (여기에 텍스트 및 LaTeX 수식 복사-붙여넣기)</span>
                            <textarea
                              value={q.formula || ''}
                              onChange={(e) => {
                                const updated = [...formulaQuestions];
                                updated[idx] = { ...updated[idx], formula: e.target.value };
                                latestFormulaQuestionsRef.current = updated;
                                setFormulaQuestions(updated);
                                localStorage.setItem('anti_formula_questions', JSON.stringify(updated));
                              }}
                              onBlur={() => {
                                handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                              }}
                              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-rose-500/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none transition-colors h-80 md:h-[450px]"
                              placeholder="여기에 LaTeX 블록($$ ... $$)이나 인라인 수식($ ... $)이 포함된 내용을 입력하거나 복사-붙여넣기(Ctrl+V) 하세요."
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </div>

            {/* Middle: Gutter (Takes exactly 50px width on Desktop) */}
            <div 
              onMouseDown={startResize}
              className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20 cursor-col-resize select-none hover:bg-slate-800/25 active:bg-rose-500/10 transition-colors group"
            >
              <div className="absolute inset-y-0 w-px bg-slate-800/80 group-hover:bg-slate-700/80 group-active:bg-rose-500/50 transition-colors pointer-events-none" />
              {/* Floating Scroll Button Capsule (Floats beautifully in the center of the empty gutter) */}
              <div 
                className="flex flex-col gap-2.5 p-2 rounded-full bg-slateCustom-950/90 border border-slate-700/40 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.9)] hover:shadow-rose-500/10 hover:border-rose-500/30 select-none z-30 transition-all duration-300 hover:scale-105 cursor-default"
                title="공식 위/아래 이동"
              >
                <button 
                  onClick={(e) => { e.stopPropagation(); handleScrollFormula('up'); }}
                  className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-rose-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-rose-455 hover:shadow-rose-650/30 cursor-pointer flex items-center justify-center group/btn"
                  title="이전 공식으로 스크롤"
                >
                  <ChevronUp size={14} className="group-hover/btn:-translate-y-0.5 transition-transform" />
                </button>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); handleScrollFormula('down'); }}
                  className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-rose-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-rose-455 hover:shadow-rose-650/30 cursor-pointer flex items-center justify-center group/btn"
                  title="다음 공식으로 스크롤"
                >
                  <ChevronDown size={14} className="group-hover/btn:translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right: Formula AI Tutor Sidebar */}
              <div 
                style={isDesktop ? { width: `${rightSidebarWidth}px` } : {}}
                className={`w-full max-w-full landscape-hide min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col ${
                  (!isDesktop && !isMobileLandscape && formulaMobileTab !== 'tutor') ? 'hidden' : ''
                }`}
              >
                {/* Header with Formula Selector */}
                <div className="p-3.5 border-b border-slate-800 flex flex-col gap-2.5 bg-slateCustom-950 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={16} className="text-rose-500 animate-pulse" />
                      <span className="text-xs font-extrabold text-slate-200">실시간 AI 공식 튜터</span>
                    </div>
                    {(!isDesktop && !isMobileLandscape) && (
                      <button
                        onClick={() => {
                          handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                          setShowFormulaExam(false);
                          setViewMode('dashboard');
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-black py-1 px-2.5 rounded-lg border border-slate-800 bg-slateCustom-900/60 text-slate-350 hover:text-white transition-all cursor-pointer"
                      >
                        <Calendar size={11} className="text-slate-400" />
                        <span>오늘의 복습</span>
                      </button>
                    )}
                  </div>

                  {/* Formula Dropdown Selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-extrabold block">학습 및 질의할 공식 선택:</label>
                    <select
                      value={selectedFormulaIdx}
                      onChange={(e) => handleFormulaSelect(Number(e.target.value))}
                      className="w-full bg-slateCustom-900 border border-slate-800 focus:border-rose-500/50 text-white text-xs rounded-xl px-2.5 py-1.5 focus:outline-none transition-all cursor-pointer font-bold"
                    >
                      <option value={-1}>-- 공식을 선택하세요 --</option>
                      {formulaQuestions.map((fq, idx) => (
                        <option key={idx} value={idx}>
                          Q{idx + 1}. {fq.title || `공식 카드 ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                    {selectedFormulaIdx !== -1 && (
                      <button
                        onClick={() => handleGenerateFormulaProblem(selectedFormulaIdx)}
                        disabled={isFormulaChatLoading}
                        className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all active:scale-98 text-[11px] font-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <HelpCircle size={11} className="text-amber-400" />
                        <span>이 공식으로 문제 출제 받기 📝</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Chat Message History */}
                <div 
                  ref={formulaChatBodyRef}
                  className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-1.5 md:pr-2 space-y-4 scrollbar-none-mobile bg-slate-950/20 custom-vertical-scrollbar"
                >
                  {selectedFormulaIdx === -1 ? (
                    <div className="text-center py-16 px-4 opacity-50 flex flex-col items-center justify-center h-full">
                      <div className="p-4 bg-slateCustom-900 border border-slate-800/80 text-rose-500 rounded-2xl mb-3 animate-bounce-slow">
                        <MessageSquare size={32} />
                      </div>
                      <p className="text-xs text-slate-300 font-bold">공식에 대해 AI 튜터와 논의해 보세요!</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-[240px] leading-relaxed">
                        상단의 드롭다운 메뉴나 왼쪽 공식 카드에서 <strong>[AI 토론]</strong> 버튼을 눌러 공식 대화를 시작하세요.
                      </p>
                    </div>
                  ) : (
                    <div className="w-full flex flex-col gap-4">
                      {/* Formula display block - always shown at the top! */}
                      {(() => {
                        const formulaStr = formulaQuestions[selectedFormulaIdx]?.formula || '';
                        const lines = formulaStr.split('\n');
                        const mathLines = lines.filter(line => {
                          const trimmed = line.trim();
                          if (!trimmed) return false;
                          // Skip lines starting with description bullet points or dashes
                          if (trimmed.startsWith('-') || trimmed.startsWith('—') || trimmed.startsWith('–') || trimmed.startsWith('―') || trimmed.startsWith('*') || trimmed.startsWith('•')) {
                            return false;
                          }
                          // Skip lines containing variable explanations/symbol definitions (which have colons like "$E$: Elastic Modulus")
                          if (trimmed.includes(':')) {
                            return false;
                          }
                          // Skip lines containing explanatory keywords
                          if (trimmed.toLowerCase().includes('where') || trimmed.includes('단,') || trimmed.includes('여기서')) {
                            return false;
                          }
                          return true;
                        });
                        const formulaOnly = mathLines.join('\n').trim();
                        
                        return formulaOnly ? (
                          <div className="w-full bg-slate-900/40 p-4 rounded-xl border border-slate-800/40 text-sm text-slate-200 leading-relaxed text-left overflow-x-auto custom-vertical-scrollbar">
                            <LatexRenderer 
                              text={formulaOnly} 
                              katexLoaded={katexLoaded} 
                              isMarkdown={true} 
                              enableAddFormula={true}
                            />
                          </div>
                        ) : null;
                      })()}

                      {/* Chat messages list */}
                      {formulaChatHistory.map((msg, mIdx) => {
                        const isUser = msg.role === 'user';
                        return (
                          <div 
                            key={mIdx} 
                            className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                          >
                            <span className="text-[10px] text-slate-400 font-bold px-1">
                              {isUser ? '수험생' : 'AI 튜터'}
                            </span>
                            <div className={`${isUser ? 'max-w-[92%]' : 'max-w-[97%]'} rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed select-text break-words ${
                              isUser 
                                ? 'bg-rose-600 text-white border border-rose-500/20 rounded-tr-none' 
                                : 'bg-slateCustom-900/60 border border-slate-800/80 text-slate-200 rounded-tl-none'
                            }`}>
                              <LatexRenderer text={msg.text} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isFormulaChatLoading && (
                    <div className="flex flex-col items-start space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold px-1">AI 튜터</span>
                      <div className="bg-slateCustom-900/60 border border-slate-800/80 text-slate-400 rounded-2xl rounded-tl-none px-4 py-3 text-xs flex items-center gap-1.5">
                        <RefreshCw size={12} className="animate-spin text-rose-500" />
                        <span>생각하는 중...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input Area */}
                <div className="p-3 border-t border-slate-800 bg-slateCustom-950 flex-shrink-0">
                  <form onSubmit={handleSendFormulaChatMessage} className="flex gap-2">
                    <input
                      type="text"
                      disabled={selectedFormulaIdx === -1 || isFormulaChatLoading}
                      value={formulaChatInput}
                      onChange={(e) => setFormulaChatInput(e.target.value)}
                      placeholder={
                        selectedFormulaIdx === -1 
                          ? "공식을 먼저 선택해 주세요..." 
                          : "공식에 대해 질문해 보세요 (예: 유도과정, 적용조건)..."
                      }
                      className="flex-grow bg-slateCustom-900 border border-slate-800 focus:border-rose-500/50 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none placeholder-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                      type="submit"
                      disabled={selectedFormulaIdx === -1 || isFormulaChatLoading || !formulaChatInput.trim()}
                      className="px-4 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:border-slate-800 border border-rose-500/20 text-white text-xs font-black rounded-xl transition-all duration-150 active:scale-95 flex items-center justify-center cursor-pointer shrink-0 disabled:cursor-not-allowed disabled:scale-100"
                    >
                      <span>보내기</span>
                    </button>
                  </form>
                </div>
              </div>

          </div>
        </div>
      )}

      {/* ===== ESSENTIAL ANSWERSHEET STUDY MODAL ===== */}
      {showAnswerSheet && (
        <div className="fixed inset-y-0 right-0 left-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col md:pl-36 landscape-pl-0 pc-enlarged-text overflow-hidden scrollbar-none-mobile">
          
          {/* Header */}
          {(!isDesktop && !isMobileLandscape) ? (
            /* Mobile Portrait Header for Answersheet Modal */
            <div className="flex flex-col gap-3 px-4 py-4 bg-slateCustom-950 border-b border-slate-800/80 flex-shrink-0">
              {/* Title Line */}
              <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-brand-400 bg-clip-text text-transparent">
                답안지
              </h1>
              
              {/* 6 Category Switcher Buttons */}
              <div className="flex flex-col gap-2 w-full">
                {/* 첫 번째 줄 */}
                <div className="flex gap-2 w-full">
                  <button
                    onClick={async () => {
                      await handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                      setShowAnswerSheet(false);
                      setViewMode('dashboard');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl border border-slate-800/80 bg-slateCustom-900/60 text-slate-400 hover:text-white"
                  >
                    <Calendar size={14} />
                    오늘의 복습
                  </button>
                  <button
                    onClick={async () => {
                      await handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                      setShowAnswerSheet(false);
                      setViewMode('all_topics');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl border border-slate-800/80 bg-slateCustom-900/60 text-slate-400 hover:text-white"
                  >
                    <List size={14} />
                    복습토픽
                  </button>
                  <button
                    onClick={async () => {
                      await handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                      setShowAnswerSheet(false);
                      handleOpenExam();
                    }}
                    className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-amber-400 hover:text-amber-200 border border-slate-800/80 rounded-xl"
                  >
                    <Award size={14} />
                    종합평가
                  </button>
                </div>
                {/* 두 번째 줄 */}
                <div className="flex gap-2 w-full">
                  <button
                    onClick={async () => {
                      await handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                      setShowAnswerSheet(false);
                      handleOpenFormulaExam();
                    }}
                    className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-rose-400 hover:text-rose-200 border border-slate-800/80 rounded-xl"
                  >
                    <Sigma size={14} />
                    필수공식
                  </button>
                  <button
                    className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 border border-emerald-500 bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg rounded-xl"
                  >
                    <FileText size={14} />
                    답안지
                  </button>
                </div>
              </div>

              {/* Topic Search Box */}
              <div className="relative flex items-center w-full mt-1">
                <Search size={14} className="absolute left-3 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="답안 제목 검색..."
                  value={answersheetSearchQuery}
                  onChange={(e) => setAnswersheetSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slateCustom-900/60 hover:bg-slateCustom-900 border border-slate-800 focus:border-emerald-500/50 text-white placeholder-slate-500 text-xs rounded-xl focus:outline-none transition-all duration-200"
                />
                {answersheetSearchQuery && (
                  <button
                    onClick={() => setAnswersheetSearchQuery('')}
                    className="absolute right-2.5 p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Desktop/Landscape Header for Answersheet Modal */
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-emerald-500/20 flex-shrink-0 gap-4 landscape-hide">
              <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
                <div className="p-2 bg-emerald-950/80 text-emerald-400 rounded-xl flex-shrink-0 mt-0.5 animate-pulse glow-emerald">
                  <FileText size={20} />
                </div>
                <div className="min-w-0 flex-grow">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider whitespace-nowrap">모범 답안지 및 보고서</span>
                    {answersheetQuestions.length > 0 && (
                      <span className="text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                        {answersheetQuestions.length}개 항목
                      </span>
                    )}
                    {/* Mobile Swipe Hint */}
                    <span className="inline-flex md:hidden text-[9px] bg-emerald-950/60 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full font-black animate-pulse whitespace-nowrap">
                      ← 좌우 쓸어 넘겨 튜터 대화 보기
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <h3 className="font-bold text-white text-xs sm:text-sm truncate sm:whitespace-normal">
                      전공 기술 보고서 및 모범 답안 정밀 분석 학습
                    </h3>
                    {/* Centered Add / Upload Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">

                      {lastActiveReview && (
                        <button
                          onClick={() => {
                            handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                            setShowAnswerSheet(false);
                            handleOpenLastActiveReview();
                          }}
                          className="py-1 px-3 bg-light-rainbow-animate text-slate-950 text-[11px] font-black rounded-lg transition-all duration-200 active:scale-[0.97] hidden md:flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 hover:shadow-emerald-600/20 cursor-pointer border border-slate-700/30 select-none whitespace-nowrap hover:scale-[1.02]"
                          title={`가장 최근 진행한 복습: [${lastActiveReview.title}] (클릭 시 이어서 학습)`}
                        >
                          <Clock size={11} className="text-slate-950 animate-pulse-slow shrink-0" />
                          <span className="max-w-[120px] truncate">공부중: {lastActiveReview.title}</span>
                        </button>
                      )}
                     </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0">
                <div className="relative flex items-center min-w-[200px] sm:min-w-[240px] flex-grow sm:flex-grow-0">
                  <Search size={14} className="absolute left-3 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="답안 제목 검색..."
                    value={answersheetSearchQuery}
                    onChange={(e) => setAnswersheetSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-1.5 bg-slateCustom-900/60 hover:bg-slateCustom-900 border border-slate-800 focus:border-emerald-500/50 text-white placeholder-slate-500 text-xs rounded-xl focus:outline-none transition-all duration-200"
                  />
                  {answersheetSearchQuery && (
                    <button
                      onClick={() => setAnswersheetSearchQuery('')}
                      className="absolute right-2.5 p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowFloatingCalculator(prev => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 hidden md:flex items-center justify-center gap-1.5 ${
                    showFloatingCalculator 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50'
                  }`}
                  title="공학용 계산기 플로팅 창 토글"
                >
                  <span>🧮 계산기</span>
                </button>
                <button
                  onClick={async () => {
                    await handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                    savedAnswersheetScroll.current = answersheetBodyRef.current?.scrollTop || 0;
                    setAnswersheetSearchQuery('');
                    setShowAnswerSheet(false);
                  }}
                  className="px-4 py-2 bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                  title="저장 후 닫기"
                >
                  닫기
                </button>
                <button
                  onClick={async () => {
                    await handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, true);
                  }}
                  className="px-4 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 hover:text-white border border-emerald-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center flex items-center justify-center gap-1.5"
                  title="답안 변경사항 실시간 저장"
                >
                  <Save size={12} />
                  저장
                </button>
              </div>
            </div>
          )}

          {/* Sub-header tabs for Mobile */}
          {(isDesktop || isMobileLandscape) && (
            <div className="flex md:hidden bg-slateCustom-950 px-5 py-2 border-b border-emerald-500/10 justify-center flex-shrink-0 landscape-hide">
              <div className="flex bg-slateCustom-900 p-1 rounded-xl w-full max-w-[320px] border border-slate-800">
                <button
                  onClick={() => {
                    setAnswersheetMobileTab('list');
                    answersheetSplitContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
                  }}
                  className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                    answersheetMobileTab === 'list'
                      ? 'bg-emerald-650 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  답안지 리스트
                </button>
                <button
                  onClick={() => {
                    setAnswersheetMobileTab('tutor');
                    const containerWidth = answersheetSplitContainerRef.current?.clientWidth || 0;
                    answersheetSplitContainerRef.current?.scrollTo({ left: containerWidth, behavior: 'smooth' });
                  }}
                  className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                    answersheetMobileTab === 'tutor'
                      ? 'bg-emerald-650 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  보고서 업로드
                </button>
              </div>
            </div>
          )}

          {/* Modal Container */}
          <div 
            ref={answersheetSplitContainerRef}
            onScroll={(e) => {
              if (!isDesktop) {
                const scrollLeft = e.currentTarget.scrollLeft;
                const clientWidth = e.currentTarget.clientWidth;
                if (clientWidth > 0) {
                  const activeTab = scrollLeft > clientWidth / 2 ? 'tutor' : 'list';
                  setAnswersheetMobileTab(activeTab);
                }
              }
            }}
            className={`flex-1 flex flex-row ${(!isDesktop && !isMobileLandscape) ? 'overflow-x-hidden' : 'overflow-x-auto md:overflow-x-hidden'} overflow-y-hidden ${(!isDesktop && !isMobileLandscape) ? '' : 'snap-x snap-mandatory'} scroll-smooth min-h-0 w-full scrollbar-none landscape-split-container`}
          >
            
            {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
                        {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
            <div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-40 flex-shrink-0 items-stretch justify-start overflow-y-auto scrollbar-none">
              {lastActiveReview && (
                <button
                  onClick={() => {
                    handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                    setShowAnswerSheet(false);
                    handleOpenLastActiveReview();
                  }}
                  className="flex bg-light-rainbow-animate border rounded-xl p-2 items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 text-left w-full select-none"
                  title="공부중 복습 이어서 진행"
                >
                  <Clock size={12} className="text-slate-950 shrink-0" />
                  <span className="text-[9px] font-black text-slate-950 truncate text-ellipsis overflow-hidden whitespace-nowrap max-w-[80px]">공부중: {lastActiveReview.title}</span>
                </button>
              )}

              <button
                onClick={() => {
                  handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                  setShowAnswerSheet(false);
                  setViewMode('dashboard');
                  setSelectedTopic(null);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <Calendar size={12} />
                <span>오늘의 복습</span>
              </button>

              <button
                onClick={() => {
                  handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                  setShowAnswerSheet(false);
                  setViewMode('all_topics');
                  setSelectedTopic(null);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <List size={12} />
                <span>복습토픽</span>
              </button>

              <button
                onClick={() => {
                  handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                  setShowAnswerSheet(false);
                  handleOpenExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-amber-400 border-slate-800/80 hover:text-amber-200 hover:bg-amber-950/40 transition-all cursor-pointer"
              >
                <Award size={12} />
                <span>종합평가</span>
              </button>

              <button
                onClick={() => {
                  handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                  setShowAnswerSheet(false);
                  handleOpenFormulaExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-rose-400 border-slate-800/80 hover:text-rose-200 hover:bg-rose-950/40 transition-all cursor-pointer"
              >
                <Sigma size={12} />
                <span>필수공식</span>
              </button>


              <button
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-gradient-to-tr from-emerald-600 to-teal-500 text-white border-emerald-500 shadow-lg select-none cursor-default"
              >
                <FileText size={12} />
                <span>답안지</span>
              </button>

              </div>
            
            {/* Left: Answersheet List */}
            <div className="w-full shrink-0 md:flex-1 md:shrink min-w-0 snap-start h-full relative overflow-hidden flex flex-col items-center bg-slateCustom-900/30">
              <div 
                ref={answersheetBodyRef} 
                className="flex-1 w-full overflow-y-auto overflow-x-hidden p-3 sm:p-6 md:px-5 scroll-smooth flex flex-col scrollbar-none-mobile"
                onTouchStart={(e) => {
                  if (!isDesktop && !isMobileLandscape && answersheetBodyRef.current && answersheetBodyRef.current.scrollTop === 0) {
                    answersheetTouchStartY.current = e.touches[0].clientY;
                  }
                }}
                onTouchMove={(e) => {
                  if (!isDesktop && !isMobileLandscape && answersheetBodyRef.current && answersheetBodyRef.current.scrollTop === 0 && !answersheetRefreshing) {
                    const currentY = e.touches[0].clientY;
                    const deltaY = currentY - answersheetTouchStartY.current;
                    if (deltaY > 0) {
                      const dist = Math.min(deltaY * 0.4, 80);
                      setAnswersheetPull(dist);
                      if (dist > 10 && e.cancelable) {
                        e.preventDefault();
                      }
                    }
                  }
                }}
                onTouchEnd={async () => {
                  if (!isDesktop && !isMobileLandscape && !answersheetRefreshing) {
                    if (answersheetPull >= 60) {
                      setAnswersheetRefreshing(true);
                      setAnswersheetPull(40);
                      try {
                        await loadAnswersheetQuestions();
                        showNotification('답안지가 성공적으로 새로고침되었습니다.', 'success');
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setAnswersheetRefreshing(false);
                        setAnswersheetPull(0);
                      }
                    } else {
                      setAnswersheetPull(0);
                    }
                  }
                }}
              >
                {/* Pull to Refresh Indicator */}
                {(answersheetPull > 0 || answersheetRefreshing) && (
                  <div 
                    style={{ height: `${answersheetPull}px` }} 
                    className="w-full flex items-center justify-center overflow-hidden transition-all duration-150 text-slate-400 text-xs font-semibold gap-2 bg-slateCustom-950/40 border-b border-slate-800/40 select-none flex-shrink-0"
                  >
                    {answersheetRefreshing ? (
                      <div className="flex items-center gap-2">
                        <RefreshCw size={14} className="animate-spin text-brand-400" />
                        <span>새로고침 중...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <ChevronDown size={14} className={`transition-transform duration-200 ${answersheetPull >= 60 ? 'rotate-180 text-brand-400' : ''}`} />
                        <span>{answersheetPull >= 60 ? '놓아서 새로고침' : '아래로 당겨서 새로고침'}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="w-full space-y-5 pb-32">
                
                {/* No Search Results Fallback */}
                {answersheetQuestions.filter(q => {
                  const titleMatch = (q.title || '').toLowerCase().includes(answersheetSearchQuery.toLowerCase());
                  const formulaMatch = (q.formula || '').toLowerCase().includes(answersheetSearchQuery.toLowerCase());
                  return titleMatch || formulaMatch;
                }).length === 0 && (
                  <div className="py-24 text-center flex flex-col items-center justify-center gap-4 text-center animate-scale-up">
                    <div className="p-5 bg-slateCustom-950/60 border border-slate-800 text-slate-500 rounded-full flex items-center justify-center">
                      <Search size={32} />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">검색 결과가 없습니다</h4>
                      <p className="text-xs text-slate-400 mt-1">다른 답안지 명칭으로 검색하시거나 검색어를 확인해 보세요.</p>
                    </div>
                    <button
                      onClick={() => setAnswersheetSearchQuery('')}
                      className="px-4 py-2 bg-slateCustom-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-black rounded-xl border border-slate-800 hover:border-slate-700 transition-all cursor-pointer active:scale-95"
                    >
                      검색 필터 초기화
                    </button>
                  </div>
                )}

                {/* Answersheet Questions Map */}
                {answersheetQuestions
                  .map((q, originalIdx) => ({ ...q, originalIdx }))
                  .filter(q => {
                    const titleMatch = (q.title || '').toLowerCase().includes(answersheetSearchQuery.toLowerCase());
                    const formulaMatch = (q.formula || '').toLowerCase().includes(answersheetSearchQuery.toLowerCase());
                    return titleMatch || formulaMatch;
                  })
                  .map((q) => {
                    const idx = q.originalIdx;
                    const isNewEmptyCard = !q.title && !q.formula;
                    const isInputVisible = isNewEmptyCard || !!answersheetInputRevealed[idx];
                    const isOutputVisible = true;

                    return (
                      <div key={idx} id={`answersheet-card-${idx}`} className="formula-card-item answersheet-card-item bg-slateCustom-900 border border-slate-800 rounded-2xl p-4 space-y-3 transition-all duration-300 hover:border-slate-700/50">
                        {/* Title Row */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-2 border-b border-slate-800/40 w-full min-w-0">
                          {/* Row 1: Number & Title inline */}
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <span className="text-[15px] font-black text-emerald-400 shrink-0 select-none pt-0.5">
                              {idx + 1}.
                            </span>
                            
                            <div className="flex-grow min-w-0">
                              {editingAnswersheetIdx === idx ? (
                                <div className="flex items-center gap-2 w-full">
                                  <input
                                    type="text"
                                    value={editAnswersheetTitle}
                                    onChange={(e) => setEditAnswersheetTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const trimmed = editAnswersheetTitle.trim();
                                        if (trimmed) {
                                          setAnswersheetQuestions(prev => {
                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healAnswersheetQuestionObject);
                                            handleSaveAnswersheetQuestions(updated, false);
                                            return updated;
                                          });
                                          setEditingAnswersheetIdx(null);
                                          showNotification('답안지 제목이 저장되었습니다.', 'success');
                                        }
                                      } else if (e.key === 'Escape') {
                                        setEditingAnswersheetIdx(null);
                                      }
                                    }}
                                    className="bg-slateCustom-950 border border-slate-700 text-white text-[15px] font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-emerald-500 w-full max-w-[360px]"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => {
                                      const trimmed = editAnswersheetTitle.trim();
                                      if (trimmed) {
                                        setAnswersheetQuestions(prev => {
                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healAnswersheetQuestionObject);
                                          handleSaveAnswersheetQuestions(updated, false);
                                          return updated;
                                        });
                                        setEditingAnswersheetIdx(null);
                                        showNotification('답안지 제목이 저장되었습니다.', 'success');
                                      }
                                    }}
                                    className="px-2 py-1 bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold rounded hover:bg-emerald-800/60 transition-colors shrink-0 cursor-pointer"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingAnswersheetIdx(null)}
                                    className="px-2 py-1 bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold rounded hover:bg-slate-700 transition-colors shrink-0 cursor-pointer"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-start gap-1.5 w-full min-w-0">
                                  <span 
                                    onDoubleClick={() => {
                                      setEditingAnswersheetIdx(idx);
                                      setEditAnswersheetTitle(q.title || '');
                                    }}
                                    style={{
                                      display: '-webkit-box',
                                      WebkitLineClamp: isDesktop ? 1 : 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      wordBreak: 'break-all',
                                      whiteSpace: 'normal',
                                    }}
                                    className="text-[15px] font-extrabold text-white leading-snug cursor-pointer hover:text-emerald-400 hover:underline transition-all min-w-0 flex-grow"
                                    title="더블클릭하여 답안 제목 수정"
                                  >
                                    {q.title}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Action Buttons */}
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1 md:mt-0 select-none justify-start md:justify-end shrink-0 w-auto">

                            {(q.answersheet_report_id || q.formula) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (q.answersheet_report_id) {
                                    const url = `${API_BASE}/api/session/answersheet/report/${q.answersheet_report_id}`;
                                    const isPdf = q.pdf_name && q.pdf_name.toLowerCase().endsWith('.pdf');
                                    if (isPdf) {
                                      if (window.confirm(`[${q.pdf_name || '원 보고서'}] 파일을 다운로드하시겠습니까?`)) {
                                        const link = document.createElement('a');
                                        link.href = `${url}?download=true`;
                                        link.download = q.pdf_name;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                      }
                                    } else {
                                      window.open(url, `_blank`, 'width=1200,height=900,status=no,menubar=no,toolbar=no,resizable=yes,scrollbars=yes');
                                    }
                                  } else {
                                    handleOpenHtmlAnswerPopup(q.title || `답안 ${idx + 1}`, q.formula);
                                  }
                                }}
                                className="py-1 px-1.5 sm:px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-extrabold rounded-lg transition-all duration-150 active:scale-[0.95] cursor-pointer shrink-0 select-none whitespace-nowrap shadow-md border border-emerald-500/20 flex items-center justify-center gap-0.5 sm:gap-1"
                                title="원본 보고서 파일(HTML/PDF/LaTeX) 팝업 열기"
                              >
                                <FileText size={10} />
                                <span>{(!isDesktop && !isMobileLandscape) ? "원보고서" : "원 보고서 보기"}</span>
                              </button>
                            )}

                            {/* Toggle Input Editor / 수정하기 */}
                            <button
                              onClick={() => {
                                  if (isMobileLandscape) {
                                    const val = window.prompt("답안 LaTeX/HTML 내용을 입력하세요:", q.formula || "");
                                    if (val !== null) {
                                      const updated = [...answersheetQuestions];
                                      updated[idx] = { ...updated[idx], formula: val };
                                      latestAnswersheetQuestionsRef.current = updated;
                                      setAnswersheetQuestions(updated);
                                      localStorage.setItem('anti_answersheet_questions', JSON.stringify(updated));
                                      handleSaveAnswersheetQuestions(updated, false);
                                    }
                                  } else {
                                    setAnswersheetInputRevealed(prev => ({
                                      ...prev,
                                      [idx]: !prev[idx]
                                    }));
                                  }
                              }}
                              className={`py-1 px-1.5 sm:px-2.5 rounded-lg border transition-all cursor-pointer text-[10px] font-bold flex items-center gap-0.5 sm:gap-1.5 ${
                                !isMobileLandscape && isInputVisible 
                                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                                  : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border-slate-700/50 bg-slate-800/40'
                              }`}
                              title={isInputVisible ? "입력창 닫기" : "입력창 열기"}
                            >
                              <Edit2 size={10} />
                              <span>{(!isDesktop && !isMobileLandscape) ? "수정" : "수정하기"}</span>
                            </button>

                            <button
                              onClick={() => {
                                if (window.confirm(`[${q.title || `답안 ${idx + 1}`}] 답안 유도를 리스트에서 영구히 삭제하시겠습니까?`)) {
                                  const updated = answersheetQuestions.filter((_, i) => i !== idx);
                                  latestAnswersheetQuestionsRef.current = updated;
                                  setAnswersheetQuestions(updated);
                                  handleSaveAnswersheetQuestions(updated, false);
                                  setAnswersheetRevealed(prev => {
                                    const updated = { ...prev };
                                    delete updated[idx];
                                    return updated;
                                  });
                                  setAnswersheetInputRevealed(prev => {
                                    const updated = { ...prev };
                                    delete updated[idx];
                                    return updated;
                                  });
                                  showNotification('선택한 답안이 성공적으로 삭제되었습니다.', 'info');
                                }
                              }}
                              className="py-1 px-1.5 sm:px-2.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 border border-slate-700/50 bg-slate-800/40 transition-all cursor-pointer text-[10px] font-bold flex items-center gap-0.5 sm:gap-1.5"
                              title="답안 삭제"
                            >
                              <Trash2 size={10} />
                              <span>삭제</span>
                            </button>
                          </div>
                        </div>



                        {/* Input Area */}
                        {!isMobileLandscape && isInputVisible && (
                          <div className="space-y-1 pt-1 animate-fade-in">
                            <span className="text-[10px] font-black text-slate-400 block select-none">✍️ 입력창 (여기에 텍스트, HTML 및 LaTeX 수식 복사-붙여넣기)</span>
                            <textarea
                              value={q.formula || ''}
                              onChange={(e) => {
                                const updated = [...answersheetQuestions];
                                updated[idx] = { ...updated[idx], formula: e.target.value };
                                latestAnswersheetQuestionsRef.current = updated;
                                setAnswersheetQuestions(updated);
                                localStorage.setItem('anti_answersheet_questions', JSON.stringify(updated));
                              }}
                              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-emerald-500/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none transition-colors h-32"
                              placeholder="여기에 LaTeX 블록($ ... $), 인라인 수식($ ... $), 또는 HTML 문서를 입력하거나 복사-붙여넣기 하세요."
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Middle Gutter (Takes exactly 50px width on Desktop) */}
            <div 
              onMouseDown={startResize}
              className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20 cursor-col-resize select-none hover:bg-slate-800/25 active:bg-emerald-500/10 transition-colors group"
            >
              <div className="absolute inset-y-0 w-px bg-slate-800/80 group-hover:bg-slate-700/80 group-active:bg-emerald-500/50 transition-colors pointer-events-none" />
              <div 
                className="flex flex-col gap-2.5 p-2 rounded-full bg-slateCustom-950/90 border border-slate-700/40 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.9)] hover:shadow-emerald-500/10 hover:border-emerald-500/30 select-none z-30 transition-all duration-300 hover:scale-105 cursor-default"
                title="답안 위/아래 이동"
              >
                <button 
                  onClick={(e) => { e.stopPropagation(); }}
                  className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-emerald-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-emerald-500 hover:shadow-emerald-650/30 cursor-pointer flex items-center justify-center group/btn"
                  title="이전 공식으로 이동"
                >
                  <ChevronUp size={14} className="group-hover/btn:-translate-y-0.5 transition-transform" />
                </button>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); }}
                  className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-emerald-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-emerald-500 hover:shadow-emerald-650/30 cursor-pointer flex items-center justify-center group/btn"
                  title="다음 공식으로 이동"
                >
                  <ChevronDown size={14} className="group-hover/btn:translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right: PDF/HTML upload section instead of AI Tutor */}
            <div 
              style={isDesktop ? { width: `${rightSidebarWidth}px` } : {}}
              className={`w-full max-w-full landscape-hide min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col ${
                (!isDesktop && !isMobileLandscape && answersheetMobileTab !== 'tutor') ? 'hidden' : ''
              }`}
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex items-center gap-2 bg-slateCustom-950 flex-shrink-0">
                <UploadCloud size={16} className="text-emerald-500 animate-pulse glow-emerald" />
                <span className="text-xs font-bold text-slate-200">기술사 서적/노트 PDF 또는 HTML 업로드</span>
              </div>
              
              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    let fileToUpload = answersheetFile;
                    const answersheetHtmlVal = answersheetTextareaRef.current ? answersheetTextareaRef.current.value : '';
                    
                    const titleText = answersheetUploadTitle.trim();
                    if (!titleText) {
                      showNotification('토픽 제목을 입력해 주세요.', 'warning');
                      return;
                    }

                    if (answersheetHtmlVal.trim()) {
                      const blob = new Blob([answersheetHtmlVal], { type: 'text/html' });
                      const fileName = `${titleText}.html`;
                      fileToUpload = new window.File([blob], fileName, { type: 'text/html' });
                    } else if (fileToUpload) {
                      const extension = fileToUpload.name.split('.').pop();
                      const fileName = `${titleText}.${extension}`;
                      fileToUpload = new window.File([fileToUpload], fileName, { type: fileToUpload.type });
                    }

                    if (!fileToUpload) {
                      showNotification('업로드할 파일이나 HTML 코드를 입력해 주세요.', 'warning');
                      return;
                    }

                    await handleUploadAnswersheetPdf(fileToUpload);
                    
                    // Reset
                    setAnswersheetFile(null);
                    setAnswersheetUploadTitle('');
                    answersheetAutoExtractedTitleRef.current = '';
                    if (answersheetTextareaRef.current) answersheetTextareaRef.current.value = '';
                    if (answersheetFileInputRef.current) answersheetFileInputRef.current.value = '';
                  }}
                  className="space-y-6"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                        토픽 제목 <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const userTitle = prompt("토픽 제목을 입력하세요:", answersheetUploadTitle);
                          if (userTitle !== null) {
                            setAnswersheetUploadTitle(userTitle);
                          }
                        }}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer bg-transparent border-0 outline-none"
                      >
                        <Edit2 size={10} />
                        제목 직접 입력
                      </button>
                    </div>
                    <input 
                      type="text" 
                      value={answersheetUploadTitle}
                      onChange={(e) => setAnswersheetUploadTitle(e.target.value)}
                      placeholder="예: Barton의 암반 Q분류 (업로드/입력 전 설정)"
                      className="w-full bg-slateCustom-900/90 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 outline-none transition-all duration-200"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                      PDF 또는 HTML 파일 선택
                    </label>
                    <div 
                      onDragEnter={handleAnswersheetDrag}
                      onDragOver={handleAnswersheetDrag}
                      onDragLeave={handleAnswersheetDrag}
                      onDrop={handleAnswersheetDrop}
                      onClick={() => answersheetFileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[160px] ${
                        answersheetDragActive 
                          ? 'border-emerald-500 bg-emerald-500/10' 
                          : answersheetFile
                            ? 'border-emerald-500/50 bg-slateCustom-900/40'
                            : 'border-slate-800 hover:border-emerald-500/40 hover:bg-slateCustom-900/30'
                      }`}
                    >
                      <input 
                        ref={answersheetFileInputRef}
                        type="file" 
                        accept=".pdf,.html,.htm"
                        onChange={handleAnswersheetFileChange}
                        className="hidden"
                      />

                      {answersheetFile ? (
                        <div className="w-full flex flex-col items-center">
                          <div className="p-3 bg-emerald-950/50 text-emerald-400 rounded-full mb-3">
                            {answersheetFile.name.toLowerCase().endsWith('.html') || answersheetFile.name.toLowerCase().endsWith('.htm') ? (
                              <FileCode size={28} />
                            ) : (
                              <FileText size={28} />
                            )}
                          </div>
                          <p className="text-sm font-semibold text-emerald-300 truncate max-w-full px-4">
                            {answersheetFile.name}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            ({(answersheetFile.size / 1024 / 1024).toFixed(2)} MB)
                          </p>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAnswersheetFile(null);
                              if (answersheetFileInputRef.current) answersheetFileInputRef.current.value = '';
                              const baseName = answersheetFile ? answersheetFile.name.replace(/\.[^/.]+$/, "") : "";
                              if (answersheetUploadTitle === baseName) {
                                setAnswersheetUploadTitle('');
                              }
                            }}
                            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/50 text-rose-300 hover:bg-rose-900/60 border border-rose-500/20 text-xs font-bold transition-all duration-200 cursor-pointer"
                          >
                            <Trash2 size={12} />
                            제거
                          </button>
                        </div>
                      ) : (
                        <>
                          <UploadCloud size={32} className="text-slate-500 mb-2" />
                          <p className="text-sm font-bold text-slate-300">Drag & Drop 또는 파일 선택</p>
                          <p className="text-xs text-slate-500 mt-1">PDF 또는 HTML 파일 가능 (최대 10MB)</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                      또는 HTML 코딩 직접 입력
                    </label>
                    <textarea
                      ref={answersheetTextareaRef}
                      onChange={(e) => {
                        const extracted = extractTitleFromHtml(e.target.value);
                        if (extracted && (answersheetUploadTitle === '' || answersheetUploadTitle === answersheetAutoExtractedTitleRef.current)) {
                          setAnswersheetUploadTitle(extracted);
                          answersheetAutoExtractedTitleRef.current = extracted;
                        }
                      }}
                      rows={8}
                      placeholder="HTML 코드 내용을 여기에 직접 붙여넣어 답안지로 등록하세요. (작성 시 위 파일 업로드보다 우선 처리됩니다.)"
                      className="w-full bg-slateCustom-900/90 border border-slate-800 hover:border-slate-700/60 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-3 text-xs font-mono text-slate-100 placeholder-slate-500 outline-none transition-all duration-200 resize-none h-48"
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={uploadingAnswersheetPdf}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl py-3.5 font-black text-sm hover:from-emerald-500 hover:to-teal-500 transition-all duration-300 shadow-lg shadow-emerald-950/40 border border-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed glow-emerald-hover cursor-pointer"
                  >
                    {uploadingAnswersheetPdf ? (
                      <>
                        <RefreshCw className="animate-spin" size={16} />
                        분석 및 문제 추가 중...
                      </>
                    ) : (
                      <>
                        <PlusCircle size={16} />
                        답안지에 문제 추가
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

          </div>
        </div>
      )}
      {/* Floating Vertical Navigation - Left Center (Desktop Only, Rendered at end for DOM order stacking context safety) */}
      {(!isModalOpen || isDesktop) && (
        <div className="fixed left-4 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-4 glass-panel p-3 border border-slate-800 shadow-2xl z-[90] rounded-2xl glow-purple animate-fade-in landscape-hide">
          <button
            onClick={() => {
              forceSaveActiveSessions();
              setViewMode('dashboard');
              setSelectedTopic(null);
              setShowExam(false);
              setShowFormulaExam(false);
              setShowTheoryExam(false);
              setShowAnswerSheet(false);
            }}
            className={`flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
              viewMode === 'dashboard' && !selectedTopic && !showExam && !showFormulaExam && !showTheoryExam && !showAnswerSheet
                ? 'bg-gradient-to-tr from-brand-600 to-indigo-500 text-white shadow-lg glow-purple'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
            title="오늘의 복습"
          >
            <Calendar size={20} />
            <span className="text-[10px] font-bold tracking-tight">오늘의 복습</span>
          </button>
          <button
            onClick={() => {
              forceSaveActiveSessions();
              setViewMode('all_topics');
              setSelectedTopic(null);
              setShowExam(false);
              setShowFormulaExam(false);
              setShowTheoryExam(false);
              setShowAnswerSheet(false);
            }}
            className={`flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
              viewMode === 'all_topics' && !selectedTopic && !showExam && !showFormulaExam && !showTheoryExam && !showAnswerSheet
                ? 'bg-gradient-to-tr from-brand-600 to-indigo-500 text-white shadow-lg glow-purple'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
            title={`복습토픽 (${allTopics.length})`}
          >
            <List size={20} />
            <span className="text-[10px] font-bold tracking-tight">복습토픽</span>
            <span className="text-[9px] px-1.5 py-0.5 bg-slateCustom-950 text-brand-400 rounded-full border border-brand-500/20 font-black">{allTopics.length}</span>
          </button>
          {/* 종합평가 버튼 */}
          <button
            onClick={() => {
              forceSaveActiveSessions();
              setSelectedTopic(null);
              setShowFormulaExam(false);
              setShowTheoryExam(false);
              setShowAnswerSheet(false);
              handleOpenExam();
            }}
            className={`flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
              showExam
                ? 'bg-gradient-to-tr from-amber-600 to-yellow-500 text-white shadow-lg glow-amber'
                : 'text-amber-400 hover:text-amber-200 hover:bg-amber-950/40'
            }`}
            title="전체 소스 기반 70문항 종합평가"
          >
            <Award size={20} />
            <span className="text-[10px] font-bold tracking-tight">종합평가</span>
          </button>
          {/* 필수공식 버튼 */}
          <button
            onClick={() => {
              forceSaveActiveSessions();
              setSelectedTopic(null);
              setShowExam(false);
              setShowTheoryExam(false);
              setShowAnswerSheet(false);
              handleOpenFormulaExam();
            }}
            className={`flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
              showFormulaExam
                ? 'bg-gradient-to-tr from-rose-600 to-red-500 text-white shadow-lg glow-rose'
                : 'text-rose-400 hover:text-rose-200 hover:bg-rose-950/40'
            }`}
            title="전공 필수 공식 집중 평가 (주관식 인출)"
          >
            <Sigma size={20} />
            <span className="text-[10px] font-bold tracking-tight">필수공식</span>
          </button>
          
          {/* 답안지 버튼 */}
          <button
            onClick={() => {
              forceSaveActiveSessions();
              setSelectedTopic(null);
              setShowExam(false);
              setShowFormulaExam(false);
              setShowTheoryExam(false);
              handleOpenAnswerSheet();
            }}
            className={`flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
              showAnswerSheet
                ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg glow-emerald'
                : 'text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/40'
            }`}
            title="모범 답안지 및 기술 보고서 학습"
          >
            <FileText size={20} />
            <span className="text-[10px] font-bold tracking-tight">답안지</span>
          </button>
        </div>
      )}

      {selectedTopic && (
        <DraggableFloatingButton
          currentTab={reviewMobileTab}
          onToggle={(targetTab) => {
            setReviewMobileTab(targetTab);
            if (targetTab === 'list') {
              reviewSplitContainerRef.current?.scrollTo({ left: 0 });
            } else {
              const containerWidth = reviewSplitContainerRef.current?.clientWidth || 0;
              reviewSplitContainerRef.current?.scrollTo({ left: containerWidth });
            }
          }}
          theme="violet"
        />
      )}

      {showExam && (
        <DraggableFloatingButton
          currentTab={examMobileTab}
          onToggle={(targetTab) => {
            setExamMobileTab(targetTab);
            if (targetTab === 'list') {
              examSplitContainerRef.current?.scrollTo({ left: 0 });
            } else {
              const containerWidth = examSplitContainerRef.current?.clientWidth || 0;
              examSplitContainerRef.current?.scrollTo({ left: containerWidth });
            }
          }}
          theme="amber"
        />
      )}

      {showFormulaExam && (
        <DraggableFloatingButton
          currentTab={formulaMobileTab}
          onToggle={(targetTab) => {
            setFormulaMobileTab(targetTab);
            if (targetTab === 'list') {
              formulaSplitContainerRef.current?.scrollTo({ left: 0 });
            } else {
              const containerWidth = formulaSplitContainerRef.current?.clientWidth || 0;
              formulaSplitContainerRef.current?.scrollTo({ left: containerWidth });
            }
          }}
          theme="rose"
        />
      )}

      <FloatingCalculator 
        isVisible={showFloatingCalculator && (showFormulaExam || showAnswerSheet || selectedTopic !== null || showExam)} 
        onClose={() => setShowFloatingCalculator(false)} 
      />
    </div>
  );
}

function DraggableFloatingButton({ currentTab, onToggle, theme = 'violet' }) {
  const [isCover, setIsCover] = useState(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return h > 0 && w > 0 && (h / w < 1.5);
  });

  const [pos, setPos] = useState(() => {
    const w = window.innerWidth && window.innerWidth > 50 ? window.innerWidth : 320;
    const h = window.innerHeight && window.innerHeight > 50 ? window.innerHeight : 480;
    const isCoverMode = h / w < 1.5;
    const key = isCoverMode ? `anti_fab_pos_${theme}_cover` : `anti_fab_pos_${theme}`;
    const saved = localStorage.getItem(key);
    
    // Top-left defaults (below mobile headers)
    const initialX = 16; 
    const initialY = 70; 

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (
          typeof parsed.x === 'number' && Number.isFinite(parsed.x) &&
          typeof parsed.y === 'number' && Number.isFinite(parsed.y)
        ) {
          const x = Math.max(10, Math.min(parsed.x, w - 100));
          const y = Math.max(10, Math.min(parsed.y, h - 60));
          return { x, y };
        }
      } catch (e) {}
    }
    return { x: initialX, y: initialY };
  });

  const dragStart = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    const clampPos = () => {
      const wVal = window.innerWidth || 0;
      const hVal = window.innerHeight || 0;
      setIsCover(hVal > 0 && wVal > 0 && (hVal / wVal < 1.5));
      setPos(prev => {
        const btnWidth = buttonRef.current?.clientWidth || 100;
        const btnHeight = buttonRef.current?.clientHeight || 52;
        const w = window.innerWidth && window.innerWidth > 50 ? window.innerWidth : 320;
        const h = window.innerHeight && window.innerHeight > 50 ? window.innerHeight : 480;
        const x = Math.min(prev.x, w - btnWidth - 10);
        const y = Math.min(prev.y, h - btnHeight - 10);
        const nextX = Math.max(10, x);
        const nextY = Math.max(10, y);
        if (Number.isFinite(nextX) && Number.isFinite(nextY)) {
          return { x: nextX, y: nextY };
        }
        return prev;
      });
    };
    
    // Immediate clamp on mount
    clampPos();
    // Also clamp after a short timeout to ensure the layout is fully ready and clientWidth/clientHeight are populated
    const timer = setTimeout(clampPos, 100);

    const handleResize = () => {
      clampPos();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleStart = (clientX, clientY) => {
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    dragStart.current = {
      startX: clientX,
      startY: clientY,
      startPosX: pos.x,
      startPosY: pos.y,
      isDragging: false,
    };
  };

  const handleMove = (clientX, clientY) => {
    if (!dragStart.current) return;
    const { startX, startY, startPosX, startPosY } = dragStart.current;
    const dx = clientX - startX;
    const dy = clientY - startY;

    if (Math.hypot(dx, dy) > 6) {
      dragStart.current.isDragging = true;
    }

    let newX = startPosX + dx;
    let newY = startPosY + dy;

    const btnWidth = buttonRef.current?.clientWidth || 100;
    const btnHeight = buttonRef.current?.clientHeight || 52;
    const w = window.innerWidth && window.innerWidth > 50 ? window.innerWidth : 320;
    const h = window.innerHeight && window.innerHeight > 50 ? window.innerHeight : 480;

    newX = Math.max(10, Math.min(newX, w - btnWidth - 10));
    newY = Math.max(10, Math.min(newY, h - btnHeight - 10));

    if (Number.isFinite(newX) && Number.isFinite(newY)) {
      setPos({ x: newX, y: newY });
    }
  };

  const handleEnd = (targetElement) => {
    if (!dragStart.current) return;
    if (!dragStart.current.isDragging) {
      if (targetElement) {
        const btn = targetElement.closest('[data-tab]');
        if (btn) {
          const targetTab = btn.getAttribute('data-tab');
          if (targetTab && currentTab !== targetTab) {
            onToggle(targetTab);
          }
        }
      }
    } else {
      const w = window.innerWidth && window.innerWidth > 50 ? window.innerWidth : 320;
      const h = window.innerHeight && window.innerHeight > 50 ? window.innerHeight : 480;
      const isCoverMode = h / w < 1.5;
      const key = isCoverMode ? `anti_fab_pos_${theme}_cover` : `anti_fab_pos_${theme}`;
      if (Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        localStorage.setItem(key, JSON.stringify(pos));
      }
    }
    dragStart.current = null;
  };

  const onTouchStart = (e) => {
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const onTouchMove = (e) => {
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const onTouchEnd = (e) => {
    handleEnd(e.target);
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    handleStart(e.clientX, e.clientY);

    const onMouseMove = (moveEvent) => {
      handleMove(moveEvent.clientX, moveEvent.clientY);
    };

    const onMouseUp = (upEvent) => {
      handleEnd(upEvent.target);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const isList = currentTab === 'list';

  return (
    <div
      ref={buttonRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      style={{
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        touchAction: 'none',
      }}
      className={`z-[9999] ${isCover ? '' : 'md:hidden landscape-hide'} flex flex-row items-center gap-2.5 p-1.5 rounded-full border bg-slateCustom-950/90 border-slate-800 shadow-2xl backdrop-blur-md cursor-grab active:cursor-grabbing select-none`}
    >
      <div
        data-tab="list"
        className={`w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all duration-200 cursor-pointer ${
          isList
            ? theme === 'amber'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-500/30'
              : theme === 'rose'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-500/30'
                : 'bg-violet-600 text-white shadow-md shadow-violet-500/30'
            : 'bg-slate-800/80 text-slate-500 hover:text-slate-300'
        }`}
        title="문제 풀이"
      >
        📝
      </div>
      <div
        data-tab="tutor"
        className={`w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all duration-200 cursor-pointer ${
          !isList
            ? theme === 'amber'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-500/30'
              : theme === 'rose'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-500/30'
                : 'bg-violet-600 text-white shadow-md shadow-violet-500/30'
            : 'bg-slate-800/80 text-slate-500 hover:text-slate-300'
        }`}
        title="제미나이 AI 튜터"
      >
        💬
      </div>
    </div>
  );
}
