import React, { useState, useEffect, useRef } from 'react';
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
  File, 
  Trash2, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
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
  Paperclip
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
    <div className="flex-grow flex flex-col items-center overflow-y-auto max-h-[55vh] px-2 bg-slateCustom-950 rounded-2xl border border-slate-850">
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

const buildHtmlDocument = (text, isPopup = false) => {
  let cleanedText = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  
  const styleInjection = `
    <style>
      /* Compact & Premium Spacing & Title Overrides */
      html, body {
        margin: 0 !important;
        padding: 16px !important;
        padding-top: 8px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        ${isPopup ? 'overflow: auto !important;' : 'overflow: hidden !important;'} /* Allow scrollbars in popup, hide in iframe */
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
      /* Adjust layout containers to be compact */
      .container, .wrapper, [class*="container"], [class*="wrapper"] {
        padding-top: 4px !important;
        margin-top: 0 !important;
      }
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-track {
        background: rgba(241, 245, 249, 0.5);
      }
      ::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 4px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #94a3b8;
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
          setTimeout(initKaTeX, 50);
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

// Dynamic KaTeX loader & Math text renderer
function LatexRenderer({ text, katexLoaded, className = "", onAddFormula = null, placeholderIfHeavy = false, popupTitle = "" }) {
  if (!text) return null;

  const pressTimer = useRef(null);
  const isLongPress = useRef(false);

  const startPress = (e) => {
    // "이 공식을 퀴즈에 추가" 기능 삭제에 따라 롱프레스 비활성화
  };

  const endPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  // 0.5) 필수공식/이론유도 내 지반 단위중량 기호 y(\y) 그리스 감마(\gamma) 자가치유 규칙 탑재
  const healFormulas = (val) => {
    if (!val) return val;
    let healed = val;
    healed = healed.replace(/\\+/g, '\\');
    
    // 0.1) If the entire text starts and ends with $ or $$ and contains Korean, strip the outer delimiters.
    let trimmed = healed.trim();
    const hasKorean = /[\uAC00-\uD7A3]/.test(trimmed);
    if (hasKorean) {
      if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
        healed = trimmed.substring(2, trimmed.length - 2).trim();
      } else if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
        healed = trimmed.substring(1, trimmed.length - 1).trim();
      }
    }

    // 1) Heal invalid \y commands used for gamma
    healed = healed.replace(/\\y([a-zA-Z0-9'_]+)/g, (match, suffix) => {
      if (suffix.startsWith('cdot')) {
        return '\\gamma \\cdot ' + suffix.substring(4);
      }
      return '\\gamma ' + suffix;
    });
    healed = healed.replace(/\\y\\b/g, '\\gamma');

    // 2) Inside LaTeX math blocks, convert bare 'y' used as gamma to '\gamma'
    healed = healed.replace(/\$([^\$]+)\$/g, (match, math) => {
      let replaced = math;
      replaced = replaced.replace(/\\by_([a-zA-Z0-9]+)\\b/g, '\\gamma_$1');
      replaced = replaced.replace(/\\by\\s*D_f\\b/g, '\\gamma D_f');
      replaced = replaced.replace(/\\byD_f\\b/g, '\\gamma D_f');
      replaced = replaced.replace(/\\by\\s*\\\\?cdot\\b/g, '\\gamma \\cdot');
      return `$${replaced}$`;
    });

    // 3) Wrap geotech variables and equations (like M_w < 7.5, MSF > 1.0) in $ if they aren't already wrapped
    healed = healed.replace(/\\b(M_w|MSF|F_s|K_h|K_{30})\\s*([<>=]=?)\\s*([0-9\\.]+)\\b/g, (match, v, op, num) => {
      return `$${v} ${op} ${num}$`;
    });

    // 4) Heal misplaced dollar sign typos like M_w$=7.5 or MSF$=1.0
    healed = healed.replace(/\\b([a-zA-Z0-9_]+)\\$=\\s*([0-9\\.]+)\\b/g, (match, v, num) => {
      return `$${v} = ${num}$`;
    });

    // 5) Wrap Greek letters and subscripts (like K_0, K_a, f_{ck}) in $ for partial LaTeX rendering
    const symbols = ['sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega'];
    
    const tokens = [];
    let lastIndex = 0;
    const regex = /(\$\$.*?\$\$)|(\$[^\$]+?\$)/gs;
    let match;
    while ((match = regex.exec(healed)) !== null) {
      const before = healed.substring(lastIndex, match.index);
      if (before) {
        tokens.push({ type: 'text', content: before });
      }
      tokens.push({ type: 'math', content: match[0] });
      lastIndex = regex.lastIndex;
    }
    const after = healed.substring(lastIndex);
    if (after) {
      tokens.push({ type: 'text', content: after });
    }

    const processedTokens = tokens.map(tok => {
      if (tok.type !== 'text') return tok.content;
      let t = tok.content;
      
      // Wrap greek letters
      symbols.forEach(sym => {
        const regex = new RegExp(`(?<!\\\\)\\b${sym}\\b`, 'g');
        t = t.replace(regex, `\\${sym}`);
      });
      // Wrap greek letters with subscripts
      const subscriptPattern = `(?:_[a-zA-Z0-9]+|_(?:\\{[a-zA-Z0-9_]+\\}))?`;
      const greekPattern = new RegExp(`(\\\\\\b(?:${symbols.join('|')})${subscriptPattern}(?![a-zA-Z0-9_]))`, 'g');
      t = t.replace(greekPattern, (match, p1) => '$' + p1 + '$');
      
      // Wrap plain variable subscripts like K_0, f_{ck}, i_{cor}, P_{max}, P_w, C_v, m_v, q_{ult}, N_c, N_q, N_{\gamma}, J_n, J_r, J_a, J_w, q_a, D_f
      const plainSubscriptPattern = /((\b[a-zA-Z](?:_[a-zA-Z0-9]+|_(?:\{[a-zA-Z0-9_]+\}))(?![a-zA-Z0-9_])))/g;
      t = t.replace(plainSubscriptPattern, (match, p1) => '$' + p1 + '$');
      
      return t;
    });

    healed = processedTokens.join('');
    
    return healed;
  };

  const isHeavy = isHeavyHtml(text);

  // 1) 불필요한 연속 빈 행(3개 이상 연속 개행)을 최대 2개로 압축하여 컴팩트하게 정리 (HTML 보고서인 경우 백슬래시 보호를 위해 자가치유 스킵)
  let cleanedText = isHeavy
    ? text.replace(/\\r\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim()
    : healFormulas(text).replace(/\\r\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim();

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
        try {
          return window.katex.renderToString(math.trim(), { displayMode: true, throwOnError: false }).replace(/\n/g, '');
        } catch (e) {
          return m;
        }
      });
      // Render inline math $ ... $
      htmlContent = htmlContent.replace(/\$([^\$]+?)\$/g, (m, math) => {
        try {
          return window.katex.renderToString(math.trim(), { displayMode: false, throwOnError: false }).replace(/\n/g, '');
        } catch (e) {
          return m;
        }
      });
    }

    const isInline = className.includes('inline');
    if (isInline) {
      return (
        <span 
          className={`${className} select-text`}
          onMouseDown={startPress}
          onMouseUp={endPress}
          onMouseMove={cancelPress}
          onMouseLeave={cancelPress}
          onTouchStart={startPress}
          onTouchEnd={endPress}
          onTouchMove={cancelPress}
          onTouchCancel={cancelPress}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      );
    }
    return (
      <div 
        className={`${className} select-text w-full overflow-x-auto`}
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseMove={cancelPress}
        onMouseLeave={cancelPress}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onTouchMove={cancelPress}
        onTouchCancel={cancelPress}
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
    if (beforeText) {
      parts.push({ type: 'text', content: beforeText });
    }
    parts.push({ type: 'math-block', content: match[1].trim() });
    lastIndex = blockRegex.lastIndex;
  }

  const afterText = cleanedText.substring(lastIndex);
  if (afterText) {
    parts.push({ type: 'text', content: afterText });
  }

  // Find the index of the last math-block in parts to only show add button there
  const mathBlockIndices = parts
    .map((p, i) => (p.type === 'math-block' ? i : -1))
    .filter((i) => i !== -1);
  const lastMathBlockIdx = mathBlockIndices.length > 0 ? mathBlockIndices[mathBlockIndices.length - 1] : -1;

  // 각 파트별 렌더링
  return (
    <div 
      className={`${className} space-y-1.5 select-text`}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseMove={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchMove={cancelPress}
      onTouchCancel={cancelPress}
    >
      {parts.map((part, idx) => {
        if (part.type === 'math-block') {
          let mathHtml = part.content;
          try {
            mathHtml = window.katex.renderToString(part.content, { displayMode: true, throwOnError: false }).replace(/\n/g, '');
          } catch (e) {
            console.warn(e);
            mathHtml = `$$${part.content}$$`;
          }

          return (
            <div 
              key={idx} 
              className="my-1 md:my-2 flex flex-col md:flex-row items-center justify-between gap-4 w-full bg-transparent rounded-none border-0 transition-all duration-300 group shadow-none select-text"
            >
              {/* KaTeX 수식 */}
              <div 
                className="flex-grow overflow-x-auto flex justify-start sm:justify-center py-1.5 min-w-0 select-text" 
                dangerouslySetInnerHTML={{ __html: mathHtml }} 
              />
              {/* "이 공식을 퀴즈에 추가" 기능 삭제 */}
            </div>
          );
        } else {
          // 일반 텍스트 내 inline math $ ... $ 처리
          let htmlContent = part.content;
          try {
            htmlContent = htmlContent.replace(/\$([^\$\n]+?)\$/g, (m, math) => {
              // 한글이 포함된 경우 단순 텍스트로 취급하여 수식 오작동 방지 (달러 기호 오탈자 구제)
              if (/[\uAC00-\uD7A3]/.test(math)) {
                return m;
              }
              try {
                return window.katex.renderToString(math.trim(), { displayMode: false, throwOnError: false }).replace(/\n/g, '');
              } catch (e) {
                return m;
              }
            });
          } catch (e) {
            console.warn(e);
          }

          const isInline = className.includes('inline');
          if (isInline) {
            return (
              <span 
                key={idx}
                className="leading-relaxed whitespace-pre-line select-text"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            );
          }

          // 비인라인 일반 텍스트의 경우, 빈 행을 제거하고 단락 숫자(1., 2. 등)가 있는 줄만 위아래 여백 적용
          const textLines = htmlContent.split('\n');
          const activeLines = textLines.filter(line => line.trim() !== '');

          return (
            <div key={idx} className="select-text">
              {activeLines.map((line, lIdx) => {
                const cleanLine = line.trim();
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

    if (window.katex) {
      setKatexLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    script.onload = () => {
      setKatexLoaded(true);
    };
    document.head.appendChild(script);
  }, []);
  
  // Views: 'dashboard' (today's tasks) or 'all_topics' (all materials tracker)
  const [viewMode, setViewMode] = useState('dashboard');
  const [editingFormulaIdx, setEditingFormulaIdx] = useState(null);
  const [editingFormulaText, setEditingFormulaText] = useState("");
  const [refreshingFormulaIdx, setRefreshingFormulaIdx] = useState(null);
  
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
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // AI Modal States
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [revealedQuestions, setRevealedQuestions] = useState({}); // Stores which question answers are unblurred/revealed
  const [selectedAnswers, setSelectedAnswers] = useState({}); // Stores chosen options for multiple choice questions { [questionIdx]: optionString }
  const [isFallback, setIsFallback] = useState(false);
  const [aiError, setAiError] = useState('');
  const [openSections, setOpenSections] = useState({}); // { 'qIdx-sIdx': bool } for section accordion
  
  // Exam mode state
  const [examQuestions, setExamQuestions] = useState([]);
  const [showExam, setShowExam] = useState(() => localStorage.getItem('anti_show_exam') === 'true');
  const [loadingExam, setLoadingExam] = useState(() => localStorage.getItem('anti_show_exam') === 'true');
  const [examTopic, setExamTopic] = useState(null);
  const [examRevealed, setExamRevealed] = useState({});
  const [examAnswers, setExamAnswers] = useState({});
  const [detailedAnswers, setDetailedAnswers] = useState({});
  const [chatHistory, setChatHistory] = useState([]);

  // Single Question Regeneration states
  const [regeneratingReview, setRegeneratingReview] = useState({});
  const [regeneratingExam, setRegeneratingExam] = useState({});
  // Question adjustment (AI 피드백) states
  const [adjustingInputKey, setAdjustingInputKey] = useState(null);
  const [adjustingText, setAdjustingText] = useState({});
  const [adjustingLoading, setAdjustingLoading] = useState({});

  // Formula mode states
  const [showFormulaExam, setShowFormulaExam] = useState(() => localStorage.getItem('anti_show_formula_exam') === 'true');
  const [showTheoryExam, setShowTheoryExam] = useState(() => localStorage.getItem('anti_show_theory_exam') === 'true');
  const theoryBodyRef = useRef(null);
  const savedTheoryScroll = useRef(0);
  const [formulaMobileTab, setFormulaMobileTab] = useState('list');
  const [theoryMobileTab, setTheoryMobileTab] = useState('list');
  const formulaSplitContainerRef = useRef(null);
  const theorySplitContainerRef = useRef(null);
  const [reviewMobileTab, setReviewMobileTab] = useState('list');
  const [examMobileTab, setExamMobileTab] = useState('list');
  const reviewSplitContainerRef = useRef(null);
  const examSplitContainerRef = useRef(null);
  const [formulaQuestions, setFormulaQuestions] = useState([]);
  const [loadingFormula, setLoadingFormula] = useState(false);
  const [formulaRevealed, setFormulaRevealed] = useState({});
  const [formulaSearchQuery, setFormulaSearchQuery] = useState('');
  const formulaBodyRef = useRef(null);
  const savedFormulaScroll = useRef(0);
  
  // Option Explanations State for Multiple Choice Option Analysis (Separated for Review and Exam)
  const [reviewOptionExplanations, setReviewOptionExplanations] = useState({});
  const [examOptionExplanations, setExamOptionExplanations] = useState({});

  // Hidden Weak-Point Bonus topic IDs (Client hide-on-complete state)
  const [hiddenBonusTopicIds, setHiddenBonusTopicIds] = useState([]);
  const [loadingWeakPoints, setLoadingWeakPoints] = useState(false);

  // Desktop view state (width >= 768px)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
  }, [selectedTopic, showExam, showFormulaExam, showTheoryExam]);

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
          setSelectedTopic(null);
        } else if (activeModalRef.current === 'exam') {
          setShowExam(false);
          localStorage.setItem('anti_show_exam', 'false');
        } else if (activeModalRef.current === 'formula') {
          setShowFormulaExam(false);
          localStorage.setItem('anti_show_formula_exam', 'false');
        } else if (activeModalRef.current === 'theory') {
          setShowTheoryExam(false);
          localStorage.setItem('anti_show_theory_exam', 'false');
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
    const isModalOpen = !!(selectedTopic || showExam || showFormulaExam || showTheoryExam);
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
  }, [selectedTopic, showExam, showFormulaExam, showTheoryExam]);
  
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
  const [theoryQuestions, setTheoryQuestions] = useState([]);
  const [loadingTheory, setLoadingTheory] = useState(false);
  const [theoryRevealed, setTheoryRevealed] = useState({});
  const [theorySearchQuery, setTheorySearchQuery] = useState('');
  const [refreshingTheoryIdx, setRefreshingTheoryIdx] = useState(null);
  const [uploadingTheoryPdf, setUploadingTheoryPdf] = useState(false);

  // Theory inline editing states
  const [editingTheoryIdx, setEditingTheoryIdx] = useState(null);
  const [editTheoryTitle, setEditTheoryTitle] = useState('');
  const [editTheoryConcept, setEditTheoryConcept] = useState('');
  const [editTheoryAssumptions, setEditTheoryAssumptions] = useState('');
  const [editTheoryFormula, setEditTheoryFormula] = useState('');
  const [theoryInputRevealed, setTheoryInputRevealed] = useState({});
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
  const latestTheoryQuestionsRef = useRef(theoryQuestions);
  useEffect(() => {
    latestTheoryQuestionsRef.current = theoryQuestions;
  }, [theoryQuestions]);

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
        setTodayReviews(uniqueList);
      } else {
        setTodayReviews([]);
        console.error('Failed to load dashboard or invalid data format:', data);
      }
    } catch (err) {
      setTodayReviews([]);
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoadingReviews(false);
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
  }, [referenceDate]);

  // ── Restore state from localStorage on mount (껐다 켜도 이어서 보기)
  useEffect(() => {
    // 1) localStorage → 탭/뷰 모드 등 비-종합평가 상태 복원
    try {
      const saved = localStorage.getItem('anti_app_state');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.viewMode) {
          // PC에서 열었을 때는 무조건 오늘의 복습('dashboard') 화면이 메인화면이 되도록 설정
          const isPC = window.innerWidth >= 768;
          setViewMode(isPC ? 'dashboard' : s.viewMode);
        }
        if (s.selectedTopic) setSelectedTopic(s.selectedTopic);
        if (s.aiQuestions?.length) setAiQuestions(s.aiQuestions);
        if (s.revealedQuestions) setRevealedQuestions(s.revealedQuestions);
        if (s.selectedAnswers) setSelectedAnswers(s.selectedAnswers);
        if (s.openSections) setOpenSections(s.openSections);
        if (s.isFallback !== undefined) setIsFallback(s.isFallback);
        if (s.chatHistory) setChatHistory(s.chatHistory);
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
        chatHistory,
      }));
    } catch (e) {
      console.warn('localStorage 저장 실패:', e);
    }
  }, [viewMode, selectedTopic, aiQuestions, revealedQuestions, selectedAnswers, openSections, isFallback, showExam, examTopic, examQuestions, examRevealed, examAnswers, chatHistory]);

  // ── Sync current topic's review progress (revealed subjective questions, chosen options) to topic-specific localStorage
  useEffect(() => {
    if (selectedTopic && selectedTopic.id) {
      if (Object.keys(revealedQuestions).length > 0 || Object.keys(selectedAnswers).length > 0) {
        try {
          localStorage.setItem(`anti_review_progress_${selectedTopic.id}`, JSON.stringify({
            revealedQuestions,
            selectedAnswers
          }));
        } catch (e) {
          console.warn('localStorage 복습 진행률 저장 실패:', e);
        }
      }
    }
  }, [selectedTopic, revealedQuestions, selectedAnswers]);

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
            savedExamScroll: examBodyRef.current?.scrollTop || 0
          })
        }).catch(e => console.warn('종합평가 세션 자동 동기화 실패:', e));
      }, 1000); // 1.0-second debounce to prevent spamming server on rapid clicks

      return () => clearTimeout(delayDebounceFn);
    }
  }, [examQuestions, examRevealed, examAnswers, examTopic]);

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
            savedQuizScroll: quizBodyRef.current?.scrollTop || 0
          })
        }).catch(e => console.warn('복습 세션 자동 동기화 실패:', e));
      }, 1000); // 1.0-second debounce

      return () => clearTimeout(delayDebounceFn);
    }
  }, [selectedTopic, aiQuestions, selectedAnswers, revealedQuestions]);


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
    if (pdfFile) {
      formData.append('pdf', pdfFile);
      formData.append('fileNameUtf8', pdfFile.name);
    }

    try {
      const res = await fetch(`${API_BASE}/api/topics`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        showNotification('새로운 토픽 등록 및 6개 회차 복습 스케줄 생성이 완료되었습니다!');
        setTitle('');
        setKeywords('');
        setPdfFile(null);
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
      // 약점극복학습(보너스 추천)은 클라이언트단에서 즉시 리스트에서 숨김 처리
      setHiddenBonusTopicIds(prev => [...prev, topicId]);
      showNotification(`[${topicTitle}] 약점극복 복습 완료 처리가 완료되었습니다!`);
      
      // 백엔드로 보너스 완료 이력을 가볍게 전송 (하루 최대 2개 추천 한도 동기화용)
      fetch(`${API_BASE}/api/schedules/bonus/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId })
      }).catch(e => console.warn('보너스 완료 이력 기록 실패:', e));
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/schedules/${scheduleId}/complete`, {
        method: 'POST',
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
    const scoreMC = totalMC > 0 ? Math.round((correctMC / totalMC) * 100) : 100;

    // 서버의 복습 세션 캐싱 문제 초기화 (완료되었으므로 캐시 삭제)
    if (selectedTopic.id) {
      const deleteUrl = sId 
        ? `${API_BASE}/api/session/review/topic/${selectedTopic.id}?scheduleId=${sId}`
        : `${API_BASE}/api/session/review/topic/${selectedTopic.id}`;
      fetch(deleteUrl, { method: 'DELETE' })
        .catch(e => console.warn('복습 완료 시 세션 리셋 실패:', e));
      localStorage.removeItem(`anti_review_progress_${selectedTopic.id}`); // 복습 완료 시 로컬 진행률 초기화
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
          revealedQuestions: revealedQuestions
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
          showNotification(`약점 보완 추천 토픽 ${newPoints.length}개가 오늘의 복습 목록에 성공적으로 추가되었습니다!`, 'success');
          return [...newPoints, ...prev]; // 보너스를 상단에 노출하기 위해 앞에 붙임
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

  const handleOpenAIQuestions = async (topicId, title, keywords, pdfName, mode = 'ai', scheduleId = null, reviewRound = null, isBonus = false) => {
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
        if (data.isCached && (data.selectedAnswers || data.revealedQuestions)) {
          setSelectedAnswers(data.selectedAnswers || {});
          setRevealedQuestions(data.revealedQuestions || {});
          if (data.savedQuizScroll) {
            savedQuizScroll.current = data.savedQuizScroll;
            requestAnimationFrame(() => {
              if (quizBodyRef.current) quizBodyRef.current.scrollTop = savedQuizScroll.current;
            });
          }
        } else {
          try {
            const savedProgress = localStorage.getItem(`anti_review_progress_${topicId}`);
            if (savedProgress) {
              const { revealedQuestions: savedRevealed, selectedAnswers: savedSelected } = JSON.parse(savedProgress);
              if (savedRevealed) setRevealedQuestions(savedRevealed);
              if (savedSelected) setSelectedAnswers(savedSelected);
            } else {
              setRevealedQuestions({});
              setSelectedAnswers({});
            }
          } catch (e) {
            console.warn('복습 진행률 복원 실패:', e);
          }
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

  // ── Reset Single Multiple-Choice Answer (다시 풀기) ──────────────────
  const handleResetSingleReviewAnswer = (idx) => {
    setSelectedAnswers(prev => {
      const copy = { ...prev };
      delete copy[idx];
      fetch(`${API_BASE}/api/session/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: selectedTopic?.id, scheduleId: selectedTopic?.schedule_id, questions: aiQuestions })
      }).catch(e => console.warn('복습 세화 동기화 실패:', e));
      return copy;
    });
    setReviewOptionExplanations(prev => {
      const copy = { ...prev };
      delete copy[idx];
      return copy;
    });
    showNotification('해당 문제의 풀이 상태를 초기화했습니다.', 'info');
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
    const url = `${API_BASE}/api/topics/${selectedTopic.id}/pdf`;
    window.open(url, `_blank`, 'width=1200,height=900,status=no,menubar=no,toolbar=no,resizable=yes,scrollbars=yes');
  };

  // ── Refresh All Review Questions (복습하기 전체 문제 재생성) ──────────────────
  const handleRefreshReviewQuestions = async () => {
    if (!selectedTopic?.id) return;
    if (!window.confirm("현재 생성된 복습 문제들이 토픽의 본래 주제와 어긋납니까? 전체 문제를 삭제하고 실시간 AI로 다시 구성하겠습니다.")) {
      return;
    }
    
    setLoadingAI(true);
    setAiQuestions([]);
    setRevealedQuestions({});
    setSelectedAnswers({});
    setReviewOptionExplanations({});
    setIsFallback(false);
    setAiError('');
    
    try {
      // 1. 기존의 복습 세션 데이터를 API를 통해 삭제
      const deleteUrl = selectedTopic.schedule_id
        ? `${API_BASE}/api/session/review/topic/${selectedTopic.id}?scheduleId=${selectedTopic.schedule_id}`
        : `${API_BASE}/api/session/review/topic/${selectedTopic.id}`;
      await fetch(deleteUrl, { method: 'DELETE' })
        .catch(e => console.warn('복습 세션 초기화 실패:', e));
      localStorage.removeItem(`anti_review_progress_${selectedTopic.id}`); // 전체 재생성 시 로컬 복습 기록도 제거
        
      // 2. 실시간 AI 생성 요청
      let url = `${API_BASE}/api/topics/${selectedTopic.id}/ai-questions`;
      if (selectedTopic.schedule_id) {
        url += `?scheduleId=${selectedTopic.schedule_id}`;
      }
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        setAiQuestions(data.questions || []);
        setIsFallback(!!data.isFallback);
        setAiError(data.error || '');
        lastQuizTopicId.current = selectedTopic.id;
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
            Object.keys(copy).forEach(key => {
              if (key.startsWith(`${idx}-`)) {
                delete copy[key];
              }
            });
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

    cards[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    cards[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const handleSendChat = async () => {
    const userMessage = chatInput.trim();
    if ((!userMessage && !attachedImage) || isChatLoading) return;
    
    const currentAttachedImage = attachedImage;
    setChatInput('');
    setAttachedImage(null);
    
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
        if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
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
      let newFormula = f.formula;
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
      localStorage.setItem('anti_formula_questions', JSON.stringify(qs));
      
      // Sync with database for cross-device support (AWAITED to avoid timing issues)
      const res = await fetch(`${API_BASE}/api/session/formula`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formulaQuestions: qs })
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

  const loadFormulaQuestions = async () => {
    setLoadingFormula(true);
    let loadedData = null;

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

    const cleaned = normalizeAndCompactifyFormulas(loadedData);
    latestFormulaQuestionsRef.current = cleaned;
    setFormulaQuestions(cleaned);
    localStorage.setItem('anti_formula_questions', JSON.stringify(cleaned));
    setFormulaRevealed({});
    setLoadingFormula(false);
    return cleaned;
  };

  const loadTheoryQuestions = async () => {
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

    latestTheoryQuestionsRef.current = loadedData;
    setTheoryQuestions(loadedData);
    localStorage.setItem('anti_theory_questions', JSON.stringify(loadedData));
    setTheoryRevealed({});
    setLoadingTheory(false);
    return loadedData;
  };

  const handleSaveTheoryQuestions = async (qs = theoryQuestions, showToast = true) => {
    try {
      localStorage.setItem('anti_theory_questions', JSON.stringify(qs));
      
      // Sync with database for cross-device support (AWAITED to avoid timing issues)
      const res = await fetch(`${API_BASE}/api/session/theory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theoryQuestions: qs })
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

  const handleUploadTheoryPdf = async (file) => {
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
        const updated = [...newItems, ...prev];
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
            });
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

  const handleOpenTheoryExam = async () => {
    setShowTheoryExam(true);
    setChatHistory([]); // Clear chat history to start fresh for theory study
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

    setFormulaQuestions(prev => [newFormula, ...prev]);
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
      const updated = [newFormula, ...prev];
      handleSaveFormulaQuestions(updated, false);
      return updated;
    });
    showNotification(`[${title}] 공식이 필수공식 퀴즈(Q1)에 성공적으로 추가되었습니다!`);

    // 6. 백그라운드 AI 정밀 공식 작명 및 변수/상수 해설 API 비동기 가동
    fetch(`${API_BASE}/api/formula/suggest-title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mathContent, fullText })
    })
      .then(res => res.json())
      .then(data => {
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
                  formula: suggestedStructure ? `$$${mathContent}$$\n\n${suggestedStructure}` : `$$${mathContent}$$`
                };
              }
              return f;
            });
            handleSaveFormulaQuestions(updated, false);
            return updated;
          });
          showNotification(`[${suggestedTitle}] 공식과 변수 해설이 AI 추천 분석을 거쳐 정밀 업데이트되었습니다!`, 'success');
        }
      })
      .catch(err => {
        console.warn('AI 타이틀 추천 반영 실패 (로컬 기본값 보존):', err);
      });
  };

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
      .then(res => res.json())
      .then(data => {
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
                  formula: suggestedStructure ? `$$${mathContent}$$\n\n${suggestedStructure}` : `$$${mathContent}$$`
                };
              }
              return f;
            });
            latestFormulaQuestionsRef.current = updated;
            handleSaveFormulaQuestions(updated, false);
            return updated;
          });
          showNotification(`[${suggestedTitle}] 공식의 제목, 핵심개념, 기호정의 분석 갱신이 완료되었습니다!`, 'success');
        } else {
          showNotification('공식 재분석 결과가 유효하지 않습니다.', 'error');
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

  // 필수공식 이론유도 질문 (실시간 튜터 연동)
  const handleAskTheoryDerivation = async (title, formula) => {
    if (isChatLoading) return;
    
    // LaTeX 기호 마크다운 전처리
    const cleanTitle = (title || '').replace(/\$/g, '').trim();
    const promptText = `기술사 시험을 대비하여, [${cleanTitle}] 공식의 상세한 이론적 배경과 수학적/역학적 유도 과정을 수험생의 눈높이에 맞춰 친절하고 구조적으로 유도해 설명해 주세요.\n\n공식 식: ${formula || ''}`;
    
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
        if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
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
        const completedForTopic = topic.schedules?.filter(s => s && s.status === 'completed').length || 0;
        return acc + completedForTopic;
      }, 0)
    : 0;
  const totalScheduleCount = Array.isArray(allTopics) ? allTopics.length * 6 : 0;
  const overallProgressPercent = totalScheduleCount > 0 ? Math.round((totalCompletedCount / totalScheduleCount) * 100) : 0;
  const isModalOpen = !!(selectedTopic || showExam || showFormulaExam || showTheoryExam);

  return (
    <div className="min-h-screen bg-slateCustom-950 pb-16 flex flex-col justify-start">
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
      <header className="w-full glass-panel border-b border-slate-800 py-5 px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-tr from-brand-600 to-indigo-500 rounded-2xl glow-purple">
            <Brain className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-brand-400 bg-clip-text text-transparent">
              기술사 Spaced Repetition 복습 시스템
            </h1>
            <p className="text-xs md:text-sm text-slate-400 font-medium">
              에빙하우스 망각곡선 기반 스케줄링 & AI 기출 예상문제 출제 비서
            </p>
          </div>
        </div>

        {/* Date Tester Slider & Tabs */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 bg-slateCustom-900 border border-slate-800 rounded-xl px-4 py-2">
            <Calendar size={16} className="text-brand-400" />
            <label className="text-xs font-semibold text-slate-400 whitespace-nowrap">복습 기준일:</label>
            <input 
              type="date" 
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-white border-0 focus:ring-0 focus:outline-none cursor-pointer"
            />
            {referenceDate !== getTodayString() && (
              <button 
                onClick={() => setReferenceDate(getTodayString())}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                title="오늘 날짜로 리셋"
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>

          <div className="flex md:hidden flex-col gap-2 w-full">
            {/* 첫 번째 줄 */}
            <div className="flex gap-2 w-full">
              <button
                onClick={() => setViewMode('dashboard')}
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
                onClick={() => setViewMode('all_topics')}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl transition-all duration-200 border border-slate-800/80 cursor-pointer ${
                  viewMode === 'all_topics'
                    ? 'bg-brand-600 text-white shadow-md'
                    : 'bg-slateCustom-900/60 text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <List size={14} />
                진행현황 ({allTopics.length})
              </button>
              <button
                onClick={handleOpenExam}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-amber-400 hover:text-amber-200 border border-slate-800/80 hover:bg-amber-950/40 rounded-xl transition-all duration-200 cursor-pointer"
              >
                <Award size={14} />
                종합평가
              </button>
            </div>
            
            {/* 두 번째 줄 */}
            <div className="flex gap-2 w-full">
              <button
                onClick={handleOpenFormulaExam}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-rose-400 hover:text-rose-200 border border-slate-800/80 hover:bg-rose-950/40 rounded-xl transition-all duration-200 cursor-pointer"
              >
                <Sigma size={14} />
                필수공식
              </button>
              <button
                onClick={handleOpenTheoryExam}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-indigo-400 hover:text-indigo-200 border border-slate-800/80 hover:bg-indigo-950/40 rounded-xl transition-all duration-200 cursor-pointer"
              >
                <Brain size={14} />
                이론유도
              </button>
            </div>
          </div>
        </div>
      </header>


      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto px-6 md:px-12 md:pl-28 mt-8 flex-grow">
        
        {/* Statistics Dashboard Banner */}
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

          <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex items-center gap-4">
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

          <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex items-center gap-4">
            <div className="p-3 bg-brand-950/60 text-brand-400 rounded-xl">
              <Award size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">총 복습 완료 세션</p>
              <h3 className="text-2xl font-black text-white mt-1">
                {totalCompletedCount}회 / {totalScheduleCount}회
              </h3>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-slate-800">
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
                <span className="text-xs font-bold text-slate-400 bg-slateCustom-900 border border-slate-800 rounded-lg px-2.5 py-1">
                  총 {todayReviews.filter(r => !(r.isBonus && hiddenBonusTopicIds.includes(r.topic_id))).length}개 대기 중
                </span>
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
                <div className="space-y-4">
                  {todayReviews.map((item) => {
                    if (item.isBonus && hiddenBonusTopicIds.includes(item.topic_id)) {
                      return null;
                    }
                    return (
                      <div 
                        key={item.schedule_id || `bonus_${item.topic_id}`}
                        className="glass-panel rounded-2xl p-5 border border-slate-800 hover:border-slate-700/80 transition-all duration-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glow-purple-hover"
                      >
                      <div className="space-y-2.5 flex-grow">
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
                          {!item.isBonus && item.planned_date < referenceDate && (
                            <span className="text-[10px] bg-rose-950/60 text-rose-300 border border-rose-500/30 font-bold px-2 py-0.5 rounded-full">
                              미뤄진 복습
                            </span>
                          )}
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
                      <div className="flex items-center gap-2 w-full md:w-auto pt-3 md:pt-0 border-t border-slate-800/60 md:border-t-0 justify-end flex-wrap">
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
            <section className="hidden md:block lg:col-span-5 glass-panel rounded-3xl p-6 border border-slate-800/80 shadow-xl">
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
          <section className="glass-panel rounded-3xl p-6 border border-slate-800/80 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <List size={20} className="text-brand-400" />
                <h2 className="text-lg font-bold text-white">등록한 모든 토픽 스케줄링 테이블</h2>
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
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-bold">
                        <th className="py-4 px-4">토픽 정보 (클릭 시 퀴즈)</th>
                        <th className="py-4 px-2 text-center">1회차 복습 (1일 뒤)</th>
                        <th className="py-4 px-2 text-center">2회차 복습 (4일 뒤)</th>
                        <th className="py-4 px-2 text-center">3회차 복습 (7일 뒤)</th>
                        <th className="py-4 px-2 text-center">4회차 복습 (14일 뒤)</th>
                        <th className="py-4 px-2 text-center">5회차 복습 (35일 뒤)</th>
                        <th className="py-4 px-2 text-center">6회차 복습 (60일 뒤)</th>
                        <th className="py-4 px-2 text-center">도구</th>
                        <th className="py-4 px-4 text-right">등록 일시</th>
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
                            <td className="py-4 px-4 max-w-xs">
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
                                  <div className="flex items-center gap-2 w-full min-w-0">
                                    <h4 
                                      onClick={() => {
                                        setEditingTopicId(topic.id);
                                        setEditingTitleText(topic.title);
                                      }}
                                      ref={isFirstMatch ? firstMatchRef : null}
                                      className="font-bold text-white text-sm truncate transition-colors cursor-pointer hover:text-violet-400 decoration-dotted hover:underline min-w-0 flex-grow"
                                      title="클릭 시 제목을 수정합니다."
                                    >
                                      {topic.title}
                                    </h4>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenAIQuestions(topic.id, topic.title, topic.keywords, topic.pdf_name, 'ai');
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-violet-950/60 hover:bg-violet-900/60 text-violet-300 border border-violet-500/20 text-[11px] font-bold transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
                                      title="소스 + Gemini AI로 고난도 문제 생성"
                                    >
                                      <Brain size={11} />
                                      <span>복습</span>
                                    </button>
                                  </div>
                                )}
                                {topic.pdf_name ? (
                                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                    {topic.pdf_name.toLowerCase().endsWith('.html') || topic.pdf_name.toLowerCase().endsWith('.htm') ? <FileCode size={10} /> : <FileText size={10} />}
                                    {topic.pdf_name}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-slate-600">직접 수기 등록</p>
                                )}
                              </div>
                            </td>
                            
                            {/* 6 spaced rounds status grid */}
                            {[1, 2, 3, 4, 5, 6].map((round) => {
                              const sched = topic.schedules?.find(s => s.review_round === round);
                              return (
                                <td key={round} className="py-4 px-2 text-center">
                                  {sched ? (
                                    <div className="flex flex-col items-center">
                                      {sched.status === 'completed' || sched.status === 'failed' ? (
                                        <button
                                          onClick={() => handleOpenCompletedReview(sched.id, topic.id, topic.title, round, topic.keywords, topic.pdf_name)}
                                          className={`inline-flex items-center gap-0.5 text-xs border px-2.5 py-0.5 rounded-full font-semibold cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm focus:outline-none ${
                                            sched.status === 'completed'
                                              ? 'text-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/60 hover:text-emerald-200 border-emerald-500/30'
                                              : 'text-rose-400 bg-rose-950/40 hover:bg-rose-900/60 hover:text-rose-200 border-rose-500/30'
                                          }`}
                                          title={`클릭 시 이 복습의 이전 풀이 및 정답 상세 결과를 확인합니다. ${sched.score !== null && sched.score !== undefined ? `(성적: ${sched.score}점)` : ''}`}
                                        >
                                          {sched.score !== null && sched.score !== undefined ? `${sched.score}점` : (sched.status === 'completed' ? '완료' : '실패')}
                                        </button>
                                      ) : (
                                        <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 bg-slateCustom-900 border border-slate-800 px-2 py-0.5 rounded-full font-medium">
                                          대기
                                        </span>
                                      )}
                                      <span className="text-[10px] text-slate-500 mt-1 block font-mono">{sched.planned_date}</span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-600">-</span>
                                  )}
                                </td>
                              );
                            })}

                            {/* Instant Quiz & Delete Buttons */}
                            <td className="py-4 px-2 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleDeleteTopic(topic.id, topic.title)}
                                  className="p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-500/20 text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                                  title="이 토픽과 모든 복습 일정을 영구 삭제합니다."
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>

                            <td className="py-4 px-4 text-right text-xs text-slate-500 font-mono">
                              {new Date(topic.created_at).toLocaleString('ko-KR', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
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
      </main>

      {/* ===== 복습 모달 (종합평가 스타일) ===== */}
      {selectedTopic && (
        <div className="fixed inset-y-0 right-0 left-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col">
          {/* Review Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-violet-500/20 flex-shrink-0 gap-4">
            <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
              <div className="p-2 bg-violet-950/80 text-violet-400 rounded-xl flex-shrink-0 mt-0.5">
                <Brain size={20} />
              </div>
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-violet-400 tracking-wider whitespace-nowrap">토픽 복습 (Gemini AI · 10문항)</span>
                  {!loadingAI && aiQuestions.length > 0 && (
                    <span className="text-[10px] bg-violet-950/60 text-violet-300 border border-violet-500/20 px-2 py-0.5 rounded-full font-bold">
                      {aiQuestions.length}문항
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <h3 className="font-bold text-white text-xs sm:text-sm truncate sm:whitespace-normal" title={selectedTopic.title}>
                    {selectedTopic.title}
                  </h3>
                  {selectedTopic.pdf_name && (
                    <button
                      onClick={handleOpenOriginalReport}
                      className="px-5 py-2.5 bg-violet-950/80 hover:bg-violet-900 text-violet-300 hover:text-white border border-violet-500/40 rounded-xl text-xs sm:text-sm font-black tracking-tight transition-all duration-200 cursor-pointer active:scale-95 flex items-center gap-2"
                      title="원본 보고서 파일(HTML/PDF) 팝업 열기"
                    >
                      <FileText size={18} />
                      <span>원 보고서 보기</span>
                    </button>
                  )}

                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0">
              {!loadingAI && aiQuestions.length > 0 && (
                <span className="text-[10px] text-slate-400 mr-auto sm:hidden font-bold">
                  정답: {Object.keys(selectedAnswers).filter(i => selectedAnswers[i] === aiQuestions[parseInt(i)]?.answer).length}/{aiQuestions.filter(q => q.options?.length > 0).length}
                </span>
              )}
              {selectedTopic && !selectedTopic.isReadOnly && (
                <button
                  onClick={handleRefreshReviewQuestions}
                  disabled={loadingAI}
                  className="px-4 py-2 bg-violet-950/40 hover:bg-violet-900/60 text-violet-300 hover:text-white border border-violet-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="주제와 문제가 맞지 않을 때 전체 AI 재출제"
                >
                  {loadingAI ? (
                    <svg className="animate-spin h-3.5 w-3.5 text-violet-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : "🔄"}
                  <span>리프레쉬</span>
                </button>
              )}
              <button
                onClick={() => { savedQuizScroll.current = quizBodyRef.current?.scrollTop || 0; setSelectedTopic(null); }}
                className="px-4 py-2 bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                title="화면만 숨김 (재개 시 문제 유지)"
              >
                닫기
              </button>
              {selectedTopic && !selectedTopic.isReadOnly && (
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
                  className="px-4 py-2 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-rose-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                  title="문제 초기화 (재개 시 새 문제 생성)"
                >
                  종료
                </button>
              )}
            </div>
          </div>

          {/* Sub-header tabs for Mobile */}
          <div className="flex md:hidden bg-slateCustom-950 px-5 py-2 border-b border-violet-500/10 justify-center flex-shrink-0">
            <div className="flex bg-slateCustom-900 p-1 rounded-xl w-full max-w-[320px] border border-slate-800">
              <button
                onClick={() => {
                  setReviewMobileTab('list');
                  reviewSplitContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  reviewMobileTab === 'list'
                    ? 'bg-violet-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                문제 풀이
              </button>
              <button
                onClick={() => {
                  setReviewMobileTab('tutor');
                  const containerWidth = reviewSplitContainerRef.current?.clientWidth || 0;
                  reviewSplitContainerRef.current?.scrollTo({ left: containerWidth, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  reviewMobileTab === 'tutor'
                    ? 'bg-violet-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                제미나이 AI 튜터
              </button>
            </div>
          </div>

          {/* Layout Split Container (Mobile: Horizontal Swipe, PC: Side-by-Side) */}
          <div 
            ref={reviewSplitContainerRef}
            onScroll={(e) => {
              if (!isDesktop) {
                const scrollLeft = e.currentTarget.scrollLeft;
                const clientWidth = e.currentTarget.clientWidth;
                if (clientWidth > 0) {
                  const activeTab = scrollLeft > clientWidth / 2 ? 'tutor' : 'list';
                  setReviewMobileTab(activeTab);
                }
              }
            }}
            className="flex-1 flex flex-row overflow-x-auto md:overflow-x-hidden overflow-y-hidden snap-x snap-mandatory scroll-smooth min-h-0 w-full scrollbar-none"
          >

            {/* Left: Quiz Wrapper (Takes exactly 60% width on Desktop) */}
            <div 
              className="w-full md:w-[60%] landscape-w-60 min-w-0 shrink-0 md:shrink snap-start h-full relative overflow-hidden flex flex-col items-center bg-slateCustom-900/30"
            >
              {/* Left: Quiz Body (Expanded to take full wrapper width with moved scrollbar) */}
              <div 
                ref={quizBodyRef} 
                className="flex-1 w-full overflow-y-auto p-3 sm:p-6 md:px-12 scroll-smooth"
              >
              {loadingAI ? (
                <div className="py-32 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="relative">
                    <div className="p-6 bg-violet-950/80 text-violet-400 rounded-full animate-bounce-slow">
                      <Brain size={40} />
                    </div>
                    <div className="absolute inset-0 bg-violet-500 rounded-full animate-ping opacity-20"></div>
                  </div>
                  <h4 className="text-xl font-bold text-white mt-2">Gemini AI가 10문항을 출제하는 중...</h4>
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

                    const subtypeBadgeColor =
                      q.type?.includes('개요') || q.type?.includes('인출') ? 'bg-sky-700' :
                      q.type?.includes('공식') ? 'bg-rose-700' :
                      q.type?.includes('서술') ? 'bg-indigo-700' :
                      'bg-amber-700';

                    return (
                      <div key={idx} className="quiz-card-item bg-slateCustom-900 border border-slate-800 rounded-2xl p-5 space-y-3 scroll-mt-2 transition-all duration-300 hover:border-slate-700/50">
                        {/* Q Header */}
                        <div className="flex items-center justify-between gap-2 flex-wrap w-full">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black bg-slate-700 text-slate-200 px-2 py-0.5 rounded">Q{idx + 1}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded text-white ${isMC ? 'bg-emerald-700' : subtypeBadgeColor}`}>
                              {isMC ? '객관식' : `주관식·${q.type?.replace('구조 인출 (단락별 리콜)', '개요') || '서술'}`}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {answered && isMC && !selectedTopic?.isReadOnly && (
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
                            
                            {!selectedTopic?.isReadOnly && (
                              <button
                                disabled={regeneratingReview[idx]}
                                onClick={() => handleRegenerateQuestion('review', idx, q)}
                                className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all duration-300 ${
                                  regeneratingReview[idx]
                                    ? 'bg-indigo-950/20 border-indigo-500/30 text-indigo-400 cursor-not-allowed animate-pulse'
                                    : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-indigo-950/40 hover:border-indigo-500/50 hover:text-indigo-400 active:scale-95'
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
                            )}
                          </div>
                        </div>

                        {/* Question Text */}
                        <div className="text-[17px] font-bold text-white leading-relaxed">
                          <LatexRenderer text={q.question} katexLoaded={katexLoaded} />
                        </div>

                        {/* MC Options */}
                        {isMC && (
                          <div className="space-y-2">
                            {q.options?.map((opt, oIdx) => {
                              let cls = "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 cursor-pointer ";
                              if (!answered) {
                                cls += "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/70 hover:border-slate-600";
                              } else if (opt === q.answer) {
                                cls += "bg-emerald-950/70 border-emerald-500 text-emerald-200 font-extrabold";
                              } else if (opt === selectedAnswers[idx] && opt !== q.answer) {
                                cls += "bg-rose-950/70 border-rose-500 text-rose-200";
                              } else {
                                cls += "bg-slate-800/30 border-slate-800/50 text-slate-300";
                              }
                              return (
                                <button
                                  key={oIdx}
                                  disabled={selectedTopic?.isReadOnly}
                                  onClick={() => {
                                    setSelectedAnswers(prev => {
                                      const updated = { ...prev, [idx]: opt };
                                      const normalizeAns = (s) => (s || '').replace(/^\d+\.\s*/, '').trim();
                                      if (normalizeAns(opt) === normalizeAns(q.answer)) {
                                        setTimeout(() => {
                                          const cards = quizBodyRef.current?.querySelectorAll('.quiz-card-item');
                                          if (cards && cards[idx + 1]) {
                                            cards[idx + 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }
                                        }, 600);
                                      }
                                      return updated;
                                    });
                                  }}
                                  className={cls}
                                >
                                  <span className="flex gap-2 items-start">
                                    <span className="font-black text-[10px] mt-0.5 flex-shrink-0">{['①','②','③','④'][oIdx]}</span>
                                    <LatexRenderer text={opt} katexLoaded={katexLoaded} className="inline" />
                                  </span>
                                </button>
                              );
                            })}
                            {answered && (
                              <div className={`mt-2 p-3 rounded-xl text-sm leading-relaxed ${isCorrect ? 'bg-emerald-950/50 border border-emerald-500/30 text-emerald-200' : 'bg-rose-950/50 border border-rose-500/30 text-rose-200'}`}>
                                <span className="font-black">{isCorrect ? '✅ 정답!' : '❌ 오답'}</span>
                                {!isCorrect && (
                                  <span className="ml-2 inline-flex items-center gap-1">
                                    정답: <strong className="inline-block"><LatexRenderer text={q.answer} katexLoaded={katexLoaded} className="inline" /></strong>
                                  </span>
                                )}
                                {q.explanation && <div className="mt-1.5 text-slate-300"><LatexRenderer text={q.explanation} katexLoaded={katexLoaded} onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, q.explanation)} /></div>}

                                                                 {/* AI 해설 및 보기분석 버튼 패널 */}
                                 <div className="mt-3 pt-3 border-t border-slate-700/50">
                                   <div className="flex flex-wrap items-center gap-2 mb-2">
                                     {/* 문제조정 버튼 */}
                                      {adjustingInputKey !== `r_${idx}` && !selectedTopic?.isReadOnly && (
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
                                         <LatexRenderer text={reviewOptionExplanations[idx].text} katexLoaded={katexLoaded} onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, reviewOptionExplanations[idx].text)} />
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
                          !isRevd ? (
                            <button
                              onClick={() => setRevealedQuestions(prev => ({ ...prev, [idx]: true }))}
                              className="w-full py-3 border-2 border-dashed border-slate-600 hover:border-violet-500 rounded-xl text-xs font-bold text-slate-400 hover:text-violet-300 transition-all duration-200"
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
                                  <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.concept} katexLoaded={katexLoaded} onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, q.concept)} /></div>
                                </div>
                              )}
                              {q.formula && (
                                <div className="space-y-1 pt-2 border-t border-amber-500/10">
                                  <span className="text-[10px] font-black text-rose-400">📐 공식/개념도: </span>
                                  <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.formula} katexLoaded={katexLoaded} onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, q.formula)} /></div>
                                </div>
                              )}
                              {q.structure && (
                                <div className="space-y-1 pt-2 border-t border-amber-500/10">
                                  <span className="text-[10px] font-black text-emerald-400">📋 답안 구조: </span>
                                  <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.structure} katexLoaded={katexLoaded} onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, q.structure)} /></div>
                                </div>
                              )}
                              {!q.concept && !q.formula && !q.structure && (
                                <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.answer || '답안 없음'} katexLoaded={katexLoaded} onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, q.answer || '')} /></div>
                              )}

                              {/* 문제조정 입력 및 결과 보드 */}
                              {!selectedTopic?.isReadOnly && (
                                <div className="mt-3 pt-2 border-t border-slate-700/50">
                                  {adjustingInputKey !== `r_${idx}` ? (
                                    <button
                                      onClick={() => setAdjustingInputKey(`r_${idx}`)}
                                      className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                    >
                                      🛠️ 문제조정 (AI 피드백)
                                    </button>
                                  ) : (
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
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}

                  {aiQuestions.length > 0 && (
                    <div className="text-center py-6">
                      <div className="flex justify-center gap-3 flex-wrap">
                        <button
                          onClick={selectedTopic?.isReadOnly ? () => {
                            setSelectedTopic(null);
                            setAiQuestions([]);
                            setRevealedQuestions({});
                            setSelectedAnswers({});
                            setReviewOptionExplanations({});
                            lastQuizTopicId.current = null;
                          } : handleQuizCompleteClick}
                          className="inline-flex items-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-650 rounded-2xl px-8 py-4 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-lg group font-bold text-white text-xs"
                          title={selectedTopic?.isReadOnly ? "풀이 결과 확인 완료" : "복습 완료 처리 및 점수 저장"}
                        >
                          <Award size={20} className="text-emerald-400" />
                          <span>확인 및 닫기</span>
                        </button>

                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Middle: Empty Gutter (Takes exactly 10% width on Desktop) */}
          <div className="hidden md:flex landscape-hide md:w-[10%] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20">
            {/* Floating Scroll Button Capsule (Floats beautifully in the center of the empty gutter) */}
            <div 
              className="flex flex-col gap-2.5 p-2 rounded-full bg-slateCustom-950/90 border border-slate-700/40 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.9)] hover:shadow-violet-500/10 hover:border-violet-500/30 select-none z-30 transition-all duration-300 hover:scale-105 cursor-default"
              title="문제 위/아래 이동"
            >
              <button 
                onClick={(e) => { e.stopPropagation(); handleScrollQuestion('up'); }}
                className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-violet-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-violet-400 hover:shadow-violet-650/30 cursor-pointer flex items-center justify-center group/btn"
                title="이전 문제로 스크롤"
              >
                <ChevronUp size={14} className="group-hover/btn:-translate-y-0.5 transition-transform" />
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); handleScrollQuestion('down'); }}
                className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-violet-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-violet-400 hover:shadow-violet-650/30 cursor-pointer flex items-center justify-center group/btn"
                title="다음 문제로 스크롤"
              >
                <ChevronDown size={14} className="group-hover/btn:translate-y-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* Right: Gemini Chat Sidebar (Takes exactly 30% width on Desktop) */}
          <div 
            className="w-full md:w-[30%] landscape-w-40 min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col"
          >
              <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slateCustom-950 flex-shrink-0">
                <Brain size={16} className="text-violet-500" />
                <span className="text-xs font-bold text-slate-200">제미나이 실시간 튜터 (Flash 2.0)</span>
              </div>

              <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-[11px] text-slate-400">문제 풀이 중 궁금한 점을<br/>무엇이든 물어보세요!</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
                      <div className={`text-[10px] mb-1 font-bold ${msg.role === 'user' ? 'text-indigo-400 mr-1' : 'text-violet-400 ml-1'}`}>
                        {msg.role === 'user' ? '나' : 'Gemini'}
                      </div>
                      <div className={
                        msg.role === 'user'
                          ? 'px-3 py-2 rounded-2xl max-w-[90%] text-sm leading-relaxed bg-indigo-600 text-white rounded-br-sm'
                          : 'text-sm leading-relaxed text-slate-200 md:bg-slate-800 md:border md:border-slate-700 md:rounded-bl-sm md:px-3 md:py-2 md:rounded-2xl md:max-w-[90%] bg-transparent border-0 p-0 max-w-full w-full'
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
                            onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, msg.text)}
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

              <div className="p-3 border-t border-slate-800 bg-slateCustom-950 flex-shrink-0">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} 
                  className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 flex items-center gap-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all shadow-lg"
                >
                  {/* 텍스트 입력창 */}
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="기술사 용어나 개념 질문..."
                      disabled={isChatLoading}
                      className="w-full bg-transparent border-0 p-1 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-0"
                    />
                  </div>

                  {/* 전송 버튼 */}
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="w-8 h-8 bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:hover:bg-violet-600 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-md shadow-violet-600/10 active:scale-95 flex-shrink-0"
                  >
                    <Send size={12} className="text-white" />
                  </button>
                </form>
              </div>
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
        <div className="fixed inset-y-0 right-0 left-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col">
          {/* Exam Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-amber-500/20 flex-shrink-0 gap-4">
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
            
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0">
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
                  setShowExam(false); setExamQuestions([]); setExamRevealed({}); setExamAnswers({}); setExamTopic(null); setExamOptionExplanations({});
                }}
                className="px-4 py-2 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-rose-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                title="종합평가 종료 (재개 시 새 문제 생성)"
              >
                종료
              </button>
            </div>
          </div>

          {/* Sub-header tabs for Mobile */}
          <div className="flex md:hidden bg-slateCustom-950 px-5 py-2 border-b border-amber-500/10 justify-center flex-shrink-0">
            <div className="flex bg-slateCustom-900 p-1 rounded-xl w-full max-w-[320px] border border-slate-800">
              <button
                onClick={() => {
                  setExamMobileTab('list');
                  examSplitContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  examMobileTab === 'list'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                문제 풀이
              </button>
              <button
                onClick={() => {
                  setExamMobileTab('tutor');
                  const containerWidth = examSplitContainerRef.current?.clientWidth || 0;
                  examSplitContainerRef.current?.scrollTo({ left: containerWidth, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  examMobileTab === 'tutor'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                제미나이 AI 튜터
              </button>
            </div>
          </div>

          {/* Layout Split Container (Mobile: Horizontal Swipe, PC: Side-by-Side) */}
          <div 
            ref={examSplitContainerRef}
            onScroll={(e) => {
              if (!isDesktop) {
                const scrollLeft = e.currentTarget.scrollLeft;
                const clientWidth = e.currentTarget.clientWidth;
                if (clientWidth > 0) {
                  const activeTab = scrollLeft > clientWidth / 2 ? 'tutor' : 'list';
                  setExamMobileTab(activeTab);
                }
              }
            }}
            className="flex-1 flex flex-row overflow-x-auto md:overflow-x-hidden overflow-y-hidden snap-x snap-mandatory scroll-smooth min-h-0 w-full scrollbar-none"
          >
            
            {/* Left: Exam Wrapper (Takes exactly 60% width on Desktop) */}
            <div 
              className="w-full md:w-[60%] landscape-w-60 min-w-0 shrink-0 md:shrink snap-start h-full relative overflow-hidden flex flex-col items-center bg-slateCustom-900/30"
            >
              {/* Left: Exam Body (Expanded to take full wrapper width with moved scrollbar) */}
              <div 
                ref={examBodyRef} 
                className="flex-1 w-full overflow-y-auto p-3 sm:p-6 md:px-12 scroll-smooth"
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
                    <div key={idx} className="exam-card-item bg-slateCustom-900 border border-slate-800 rounded-2xl p-5 space-y-3 scroll-mt-2 transition-all duration-300 hover:border-slate-700/50">
                      {/* Q Header */}
                      <div className="flex items-center justify-between gap-2 flex-wrap w-full">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black bg-slate-700 text-slate-200 px-2 py-0.5 rounded">Q{idx + 1}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded text-white ${isMC ? 'bg-emerald-700' : subtypeBadgeColor}`}>
                            {isMC ? '객관식' : `주관식·${q.subtype || '서술'}`}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
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
                                : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-indigo-950/40 hover:border-indigo-500/50 hover:text-indigo-400 active:scale-95'
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

                      {/* Question Text */}
                      <div className="text-[17px] font-bold text-white leading-relaxed">
                        <LatexRenderer text={q.question} katexLoaded={katexLoaded} />
                      </div>

                      {/* MC Options */}
                      {isMC && (
                        <div className="space-y-2">
                          {q.options?.map((opt, oIdx) => {
                            let cls = "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 cursor-pointer ";
                            if (!answered) {
                              cls += "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/70 hover:border-slate-600";
                            } else if (normalizeAns(opt) === normalizeAns(q.answer)) {
                              cls += "bg-emerald-950/70 border-emerald-500 text-emerald-200 font-extrabold";
                            } else if (normalizeAns(opt) === normalizeAns(examAnswers[idx]) && normalizeAns(opt) !== normalizeAns(q.answer)) {
                              cls += "bg-rose-950/70 border-rose-500 text-rose-200";
                            } else {
                              cls += "bg-slate-800/30 border-slate-800/50 text-slate-300";
                            }
                            return (
                              <button
                                key={oIdx}
                                onClick={() => {
                                  setExamAnswers(prev => {
                                    const updated = { ...prev, [idx]: opt };
                                    const normalizeAns = (s) => (s || '').replace(/^\d+\.\s*/, '').trim();
                                    if (normalizeAns(opt) === normalizeAns(q.answer)) {
                                      setTimeout(() => {
                                        const cards = examBodyRef.current?.querySelectorAll('.exam-card-item');
                                        if (cards && cards[idx + 1]) {
                                          cards[idx + 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        }
                                      }, 600);
                                    }
                                    return updated;
                                  });
                                }}
                                className={cls}
                              >
                                <span className="flex gap-2 items-start">
                                  <span className="font-black text-[10px] mt-0.5 flex-shrink-0">{['①','②','③','④'][oIdx]}</span>
                                  <LatexRenderer text={opt} katexLoaded={katexLoaded} className="inline" />
                                </span>
                              </button>
                            );
                          })}
                          {answered && (
                            <div className={`mt-2 p-3 rounded-xl text-sm leading-relaxed ${isCorrect ? 'bg-emerald-950/50 border border-emerald-500/30 text-emerald-200' : 'bg-rose-950/50 border border-rose-500/30 text-rose-200'}`}>
                              <span className="font-black">{isCorrect ? '✅ 정답!' : '❌ 오답'}</span>
                              {!isCorrect && (
                                <span className="ml-2 inline-flex items-center gap-1">
                                  정답: <strong className="inline-block"><LatexRenderer text={q.answer} katexLoaded={katexLoaded} className="inline" /></strong>
                                </span>
                              )}
                              {q.explanation && <div className="mt-1.5 text-slate-300"><LatexRenderer text={q.explanation} katexLoaded={katexLoaded} onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, q.explanation)} /></div>}
                              
                              {/* AI 해설 및 보기분석 버튼 패널 */}
                              <div className="mt-3 pt-3 border-t border-slate-700/50">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  {/* 문제조정 버튼 */}
                                  {adjustingInputKey !== `e_${idx}` && (
                                    <button
                                      onClick={() => setAdjustingInputKey(`e_${idx}`)}
                                      className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                    >
                                      🛠️ 문제조정 (AI 피드백)
                                    </button>
                                  )}
                                  
                                  {/* 보기별 정밀 분석 해설 보기 버튼 */}
                                  {!examOptionExplanations[idx] && (
                                    <button
                                      onClick={() => handleRequestOptionExplanation('exam', idx, q.question, q.options, q.answer)}
                                      className="text-[10px] px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 font-bold transition-all cursor-pointer"
                                    >
                                      🔍 보기별 정밀 분석 해설 보기 (AI)
                                    </button>
                                  )}
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
                                      <LatexRenderer text={examOptionExplanations[idx].text} katexLoaded={katexLoaded} onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, examOptionExplanations[idx].text)} />
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
                        !isRevd ? (
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
                              <LatexRenderer text={q.answer || '답안 없음'} katexLoaded={katexLoaded} onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, q.answer || '')} />
                            </div>
                            {q.concept && (
                              <div className="pt-2 border-t border-amber-500/10">
                                <span className="text-[10px] font-black text-indigo-400">💡 핵심 개념: </span>
                                <span className="text-[10px] text-slate-300">{q.concept}</span>
                              </div>
                            )}

                            {/* 문제조정 입력 및 결과 보드 */}
                            <div className="mt-3 pt-2 border-t border-slate-700/50">
                              {adjustingInputKey !== `e_${idx}` ? (
                                <button
                                  onClick={() => setAdjustingInputKey(`e_${idx}`)}
                                  className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                >
                                  🛠️ 문제조정 (AI 피드백)
                                </button>
                              ) : (
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
                            </div>
                          </div>
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
                  <div className="text-center py-6">
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

            {/* Middle: Empty Gutter (Takes exactly 10% width on Desktop) */}
            <div className="hidden md:flex landscape-hide md:w-[10%] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20">
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
              className="w-full md:w-[30%] landscape-w-40 min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col"
            >
              <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slateCustom-950 flex-shrink-0">
                <Brain size={16} className="text-amber-500" />
                <span className="text-xs font-bold text-slate-200">제미나이 실시간 튜터 (Flash 2.0)</span>
              </div>
              
              <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-[11px] text-slate-400">문제 풀이 중 궁금한 점을<br/>무엇이든 물어보세요!</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
                      <div className={`text-[10px] mb-1 font-bold ${msg.role === 'user' ? 'text-indigo-400 mr-1' : 'text-amber-400 ml-1'}`}>
                        {msg.role === 'user' ? '나' : 'Gemini'}
                      </div>
                      <div className={
                        msg.role === 'user' 
                          ? 'px-4 py-2.5 rounded-2xl max-w-[95%] text-xs leading-relaxed bg-indigo-600 text-white rounded-br-sm' 
                          : 'text-xs leading-relaxed text-slate-200 md:bg-slate-800 md:border md:border-slate-700 md:rounded-bl-sm md:px-4 md:py-2.5 md:rounded-2xl md:max-w-[95%] bg-transparent border-0 p-0 max-w-full w-full prose prose-invert prose-sm max-w-none'
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
                            onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, msg.text)}
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

              <div className="p-3 border-t border-slate-800 bg-slateCustom-950 flex-shrink-0">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} 
                  className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 flex items-center gap-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all shadow-lg"
                >
                  {/* 텍스트 입력창 */}
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="기술사 용어나 개념 질문..."
                      disabled={isChatLoading}
                      className="w-full bg-transparent border-0 p-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-0"
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
      )}

      {/* ===== ESSENTIAL FORMULA EXAM MODAL (주관식) ===== */}
      {showFormulaExam && (
        <div className="fixed inset-y-0 right-0 left-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col">
          {/* Formula Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-rose-500/20 flex-shrink-0 gap-4">
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
                    ← 좌우 쓸어 넘겨 튜터 대화 보기
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
                    className="py-1 px-3 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black rounded-lg transition-all duration-200 active:scale-[0.97] flex items-center justify-center gap-1 shadow-md shadow-rose-600/10 hover:shadow-rose-600/20 cursor-pointer border border-rose-500/20 select-none whitespace-nowrap"
                  >
                    <PlusCircle size={11} />
                    <span>새로운 공식 추가 (빈표 생성)</span>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0">
              <div className="relative flex items-center min-w-[200px] sm:min-w-[240px] flex-grow sm:flex-grow-0">
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

          {/* Sub-header tabs for Mobile */}
          <div className="flex md:hidden bg-slateCustom-950 px-5 py-2 border-b border-rose-500/10 justify-center flex-shrink-0">
            <div className="flex bg-slateCustom-900 p-1 rounded-xl w-full max-w-[320px] border border-slate-800">
              <button
                onClick={() => {
                  setFormulaMobileTab('list');
                  formulaSplitContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  formulaMobileTab === 'list'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                공식 리스트
              </button>
              <button
                onClick={() => {
                  setFormulaMobileTab('tutor');
                  const containerWidth = formulaSplitContainerRef.current?.clientWidth || 0;
                  formulaSplitContainerRef.current?.scrollTo({ left: containerWidth, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  formulaMobileTab === 'tutor'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                제미나이 AI 튜터
              </button>
            </div>
          </div>

          {/* Layout Split Container (Mobile: Horizontal Swipe, PC: Side-by-Side) */}
          <div 
            ref={formulaSplitContainerRef}
            onScroll={(e) => {
              if (!isDesktop) {
                const scrollLeft = e.currentTarget.scrollLeft;
                const clientWidth = e.currentTarget.clientWidth;
                if (clientWidth > 0) {
                  const activeTab = scrollLeft > clientWidth / 2 ? 'tutor' : 'list';
                  setFormulaMobileTab(activeTab);
                }
              }
            }}
            className="flex-1 flex flex-row overflow-x-auto md:overflow-x-hidden overflow-y-hidden snap-x snap-mandatory scroll-smooth min-h-0 w-full scrollbar-none"
          >
            
            {/* Left: Formula Wrapper (Takes exactly 68% width on Desktop) */}
            <div 
              className="w-full md:w-[68%] landscape-w-60 min-w-0 shrink-0 md:shrink snap-start h-full relative overflow-hidden flex flex-col items-center bg-slateCustom-900/30"
            >
              {/* Left: Formula Body (Expanded to take full wrapper width with moved scrollbar) */}
              <div 
                ref={formulaBodyRef} 
                className="flex-1 w-full overflow-y-auto p-3 sm:p-6 md:px-5 scroll-smooth"
              >
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
                      const isOutputVisible = isNewEmptyCard || !!formulaRevealed[idx];
                      const isInputVisible = isNewEmptyCard || !!formulaInputRevealed[idx];

                      return (
                      <div key={idx} id={`formula-card-${idx}`} className="formula-card-item bg-slateCustom-900 border border-slate-800 rounded-2xl p-5 space-y-4 scroll-mt-2 transition-all duration-300 hover:border-slate-700/50">
                        {/* Title Row */}
                        <div className="flex flex-col gap-3 border-b border-slate-800/80 pb-3">
                          {/* Row 1: Q badge & Title */}
                          <div className="flex items-start gap-2.5 w-full min-w-0">
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
                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item);
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
                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item);
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
                                    onClick={() => {
                                      setEditingFormulaIdx(idx);
                                      setEditingFormulaText(q.title || q.question || '');
                                    }}
                                    className="text-[17px] font-extrabold text-white leading-snug cursor-pointer hover:text-rose-400 hover:underline transition-all whitespace-normal break-words max-w-full inline-block"
                                    title="클릭하여 공식 제목 수정"
                                  >
                                    <LatexRenderer text={q.question || q.title} katexLoaded={katexLoaded} />
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingFormulaIdx(idx);
                                      setEditingFormulaText(q.title || q.question || '');
                                    }}
                                    className="p-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 hover:border-yellow-500/50 rounded-lg text-yellow-400 transition-all duration-150 cursor-pointer shrink-0 inline-flex items-center justify-center hover:scale-105 active:scale-95 shadow-[0_2px_8px_rgba(234,179,8,0.1)]"
                                    title="공식 제목 수정"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Action Buttons (정답확인, 리프레쉬, 삭제) */}
                          <div className="flex flex-wrap items-center gap-2.5 w-full mt-1.5">
                            {/* 정답확인/정답접기 button */}
                                                        {!isNewEmptyCard && (
                              !isOutputVisible ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isHeavyHtml(q.formula)) {
                                      handleOpenHtmlAnswerPopup(q.title || `Q${idx + 1}`, q.formula);
                                    }
                                    setFormulaRevealed(prev => ({ ...prev, [idx]: true }));
                                    scrollToFormulaCard(idx);
                                  }}
                                  className="py-1 px-3 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold rounded-lg transition-all duration-150 active:scale-[0.95] cursor-pointer shrink-0 select-none whitespace-nowrap shadow-md shadow-rose-600/10 hover:shadow-rose-600/20 border border-rose-500/20 flex items-center justify-center gap-1"
                                  title="정답 확인하기"
                                >
                                  <span>정답확인</span>
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormulaRevealed(prev => ({ ...prev, [idx]: false }));
                                  }}
                                  className="py-1 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 text-[11px] font-extrabold rounded-lg transition-all duration-150 active:scale-[0.95] cursor-pointer shrink-0 select-none whitespace-nowrap flex items-center justify-center gap-1"
                                  title="정답 접기"
                                >
                                  <span>정답접기</span>
                                </button>
                              )
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

                            {/* Toggle Input Editor */}
                            {q.isDirectlyAdded && (
                              <button
                                onClick={() => {
                                  setFormulaInputRevealed(prev => ({
                                    ...prev,
                                    [idx]: !prev[idx]
                                  }));
                                }}
                                className={`p-1.5 rounded-lg border transition-all cursor-pointer text-[11px] font-bold flex items-center gap-1.5 ${
                                  isInputVisible 
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

                        {/* Real-time LaTeX rendered Output Display Window */}
                        {isOutputVisible && (
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
                                  <LatexRenderer text={q.concept} katexLoaded={katexLoaded} placeholderIfHeavy={true} popupTitle={(q.title || `Q${idx + 1}`) + " - 핵심 개념"} />
                                </div>
                              </div>
                            )}

                            {q.formula ? (
                              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                                <span className="text-[10px] font-black text-rose-400 font-extrabold">📐 대표 공식 및 기호 정의: </span>
                                <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                                  <LatexRenderer text={q.formula} katexLoaded={katexLoaded} placeholderIfHeavy={true} popupTitle={q.title || `Q${idx + 1}`} />
                                </div>
                              </div>
                            ) : !q.concept && (
                              <div className="text-xs text-slate-500 italic select-none">아래 입력창에 LaTeX 수식을 입력하면 여기에 실시간으로 렌더링되어 보여집니다.</div>
                            )}
                          </div>
                        )}

                        {/* Input Textarea Area for Paste / Typing LaTeX */}
                        {isInputVisible && (
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
                              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-rose-500/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none transition-colors h-32"
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

            {/* Middle: Empty Gutter (Takes exactly 2% width on Desktop) */}
            <div className="hidden md:flex landscape-hide md:w-[2%] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20">
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

            {/* Right: Gemini Sidebar for Formula */}
            <div className="w-full max-w-full landscape-w-40 min-w-0 shrink-0 md:w-[30%] md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col">
              <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slateCustom-950 flex-shrink-0">
                <Brain size={16} className="text-rose-500" />
                <span className="text-xs font-bold text-slate-200">제미나이 실시간 공식 튜터</span>
              </div>
              
              <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-[11px] text-slate-400">공식 유도 과정이나 실제 계산 문제 등<br/>무엇이든 실시간으로 설명해 드립니다!</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
                      <div className={`text-[10px] mb-1 font-bold ${msg.role === 'user' ? 'text-indigo-400 mr-1' : 'text-rose-400 ml-1'}`}>
                        {msg.role === 'user' ? '나' : 'Gemini'}
                      </div>
                      <div className={
                        msg.role === 'user' 
                          ? 'px-4 py-2.5 rounded-2xl max-w-[95%] text-sm leading-relaxed bg-indigo-600 text-white rounded-br-sm' 
                          : 'text-sm leading-relaxed text-slate-200 md:bg-slate-800 md:border md:border-slate-700 md:rounded-bl-sm md:px-4 md:py-2.5 md:rounded-2xl md:max-w-[95%] bg-transparent border-0 p-0 max-w-full w-full prose prose-invert prose-base max-w-none'
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
                            onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, msg.text)}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex flex-col items-start w-full">
                    <div className="text-[10px] mb-1 font-bold text-rose-400 ml-1">Gemini</div>
                    <div className="md:px-3 md:py-2 md:rounded-2xl md:bg-slate-800 md:border md:border-slate-700 md:rounded-bl-sm bg-transparent border-0 p-0 text-slate-400 text-xs flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce delay-75"></div>
                      <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce delay-150"></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-slate-800 bg-slateCustom-950 flex-shrink-0">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} 
                  className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 flex items-center gap-2 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500/20 transition-all shadow-lg"
                >
                  {/* 텍스트 입력창 */}
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="공식 유도 및 개념 질문..."
                      disabled={isChatLoading}
                      className="w-full bg-transparent border-0 p-1 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-0"
                    />
                  </div>

                  {/* 전송 버튼 */}
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="w-8 h-8 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:hover:bg-rose-600 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-md shadow-rose-600/10 active:scale-95 flex-shrink-0"
                  >
                    <Send size={12} className="text-white" />
                  </button>
                </form>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ===== ESSENTIAL FORMULA THEORY DERIVATION MODAL ===== */}
      {showTheoryExam && (
        <div className="fixed inset-y-0 right-0 left-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-indigo-500/20 flex-shrink-0 gap-4">
            <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
              <div className="p-2 bg-indigo-950/80 text-indigo-400 rounded-xl flex-shrink-0 mt-0.5">
                <Brain size={20} />
              </div>
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider whitespace-nowrap">공식 이론유도</span>
                  {formulaQuestions.length > 0 && (
                    <span className="text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold">
                      {formulaQuestions.length}개 핵심공식
                    </span>
                  )}
                  {/* Mobile Swipe Hint */}
                  <span className="inline-flex md:hidden text-[9px] bg-indigo-950/60 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full font-black animate-pulse whitespace-nowrap">
                    ← 좌우 쓸어 넘겨 튜터 대화 보기
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <h3 className="font-bold text-white text-xs sm:text-sm truncate sm:whitespace-normal">
                    전공 필수 공식 이론 유도 및 상세 증명 학습
                  </h3>
                  {/* Centered Add Question/Theory Button (Header Position next to title) */}
                  <button
                    onClick={() => {
                      const newTheory = {
                        title: "",
                        concept: "",
                        assumptions: "",
                        formula: "",
                        isDirectlyAdded: true
                      };
                      const updated = [...theoryQuestions, newTheory];
                      latestTheoryQuestionsRef.current = updated;
                      setTheoryQuestions(updated);
                      localStorage.setItem('anti_theory_questions', JSON.stringify(updated));
                      showNotification('새로운 이론 카드 기출 빈표가 성공적으로 추가되었습니다.', 'success');
                      setTimeout(() => {
                        if (theoryBodyRef.current) {
                          theoryBodyRef.current.scrollTo({
                            top: theoryBodyRef.current.scrollHeight,
                            behavior: 'smooth'
                          });
                        }
                      }, 80);
                    }}
                    className="py-1 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black rounded-lg transition-all duration-200 active:scale-[0.97] flex items-center justify-center gap-1 shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 cursor-pointer border border-indigo-500/20 select-none whitespace-nowrap"
                  >
                    <PlusCircle size={11} />
                    <span>새로운 이론 공식 추가 (빈표 생성)</span>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0">
              <div className="relative flex items-center min-w-[200px] sm:min-w-[240px] flex-grow sm:flex-grow-0">
                <Search size={14} className="absolute left-3 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="이론 제목 검색..."
                  value={theorySearchQuery}
                  onChange={(e) => setTheorySearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 bg-slateCustom-900/60 hover:bg-slateCustom-900 border border-slate-800 focus:border-indigo-500/50 text-white placeholder-slate-500 text-xs rounded-xl focus:outline-none transition-all duration-200"
                />
                {theorySearchQuery && (
                  <button
                    onClick={() => setTheorySearchQuery('')}
                    className="absolute right-2.5 p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <button
                onClick={async () => {
                  await handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, false); // 닫기를 눌러도 저장 완료후 닫음
                  savedTheoryScroll.current = theoryBodyRef.current?.scrollTop || 0;
                  setTheorySearchQuery('');
                  setShowTheoryExam(false);
                }}
                className="px-4 py-2 bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                title="저장 후 닫기"
              >
                닫기
              </button>
              <button
                onClick={async () => {
                  await handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, true); // 저장 버튼: 저장 완료후 토스트 출력
                }}
                className="px-4 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 hover:text-white border border-emerald-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center flex items-center justify-center gap-1.5"
                title="이론 변경사항 실시간 저장"
              >
                <Save size={12} />
                저장
              </button>
            </div>
          </div>

          {/* Sub-header tabs for Mobile */}
          <div className="flex md:hidden bg-slateCustom-950 px-5 py-2 border-b border-indigo-500/10 justify-center flex-shrink-0">
            <div className="flex bg-slateCustom-900 p-1 rounded-xl w-full max-w-[320px] border border-slate-800">
              <button
                onClick={() => {
                  setTheoryMobileTab('list');
                  theorySplitContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  theoryMobileTab === 'list'
                    ? 'bg-indigo-650 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                공식 리스트
              </button>
              <button
                onClick={() => {
                  setTheoryMobileTab('tutor');
                  const containerWidth = theorySplitContainerRef.current?.clientWidth || 0;
                  theorySplitContainerRef.current?.scrollTo({ left: containerWidth, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  theoryMobileTab === 'tutor'
                    ? 'bg-indigo-650 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                제미나이 AI 튜터
              </button>
            </div>
          </div>

          {/* Modal Container (Mobile: Horizontal Swipe, PC: Side-by-Side) */}
          <div 
            ref={theorySplitContainerRef}
            onScroll={(e) => {
              if (!isDesktop) {
                const scrollLeft = e.currentTarget.scrollLeft;
                const clientWidth = e.currentTarget.clientWidth;
                if (clientWidth > 0) {
                  const activeTab = scrollLeft > clientWidth / 2 ? 'tutor' : 'list';
                  setTheoryMobileTab(activeTab);
                }
              }
            }}
            className="flex-1 flex flex-row overflow-x-auto md:overflow-x-hidden overflow-y-hidden snap-x snap-mandatory scroll-smooth min-h-0 w-full scrollbar-none"
          >
            
            {/* Left: Theory Wrapper (Takes exactly 68% width on Desktop) */}
            <div className="w-full md:w-[68%] landscape-w-60 min-w-0 shrink-0 md:shrink snap-start h-full relative overflow-hidden flex flex-col items-center bg-slateCustom-900/30">
              {/* Left: Theory Body (Expanded to take full wrapper width with moved scrollbar) */}
              <div ref={theoryBodyRef} className="flex-1 w-full overflow-y-auto p-3 sm:p-6 md:px-5 space-y-4 scroll-smooth">
                <div className="w-full space-y-5 pb-32">
                


                {/* No Search Results Fallback */}
                {theoryQuestions.filter(q => {
                  const titleMatch = (q.title || '').toLowerCase().includes(theorySearchQuery.toLowerCase());
                  const formulaMatch = (q.formula || '').toLowerCase().includes(theorySearchQuery.toLowerCase());
                  return titleMatch || formulaMatch;
                }).length === 0 && (
                  <div className="py-24 text-center flex flex-col items-center justify-center gap-4 text-center animate-scale-up">
                    <div className="p-5 bg-slateCustom-950/60 border border-slate-800 text-slate-500 rounded-full flex items-center justify-center">
                      <Search size={32} />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">검색 결과가 없습니다</h4>
                      <p className="text-xs text-slate-400 mt-1">다른 이론 명칭으로 검색하시거나 검색어를 확인해 보세요.</p>
                    </div>
                    <button
                      onClick={() => setTheorySearchQuery('')}
                      className="px-4 py-2 bg-slateCustom-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-black rounded-xl border border-slate-800 hover:border-slate-700 transition-all cursor-pointer active:scale-95"
                    >
                      검색 필터 초기화
                    </button>
                  </div>
                )}

                {/* Theory Questions Map */}
                {theoryQuestions
                  .map((q, originalIdx) => ({ ...q, originalIdx }))
                  .filter(q => {
                    const titleMatch = (q.title || '').toLowerCase().includes(theorySearchQuery.toLowerCase());
                    const formulaMatch = (q.formula || '').toLowerCase().includes(theorySearchQuery.toLowerCase());
                    return titleMatch || formulaMatch;
                  })
                  .map((q) => {
                    const idx = q.originalIdx;
                    const isNewEmptyCard = !q.title && !q.formula;
                    const isOutputVisible = isNewEmptyCard || !!theoryRevealed[idx];
                    const isInputVisible = isNewEmptyCard || !!theoryInputRevealed[idx];

                    return (
                      <div key={idx} id={`theory-card-${idx}`} className="formula-card-item bg-slateCustom-900 border border-slate-800 rounded-2xl p-5 space-y-4 transition-all duration-300 hover:border-slate-700/50">
                        {/* Title Row */}
                        <div className="flex flex-col gap-3 border-b border-slate-800/80 pb-3">
                          {/* Row 1: Q badge & Title */}
                          <div className="flex items-start gap-2.5 w-full min-w-0">
                            {/* 이론 번호 배지 */}
                            <span className="text-[11px] font-black bg-indigo-950/80 text-indigo-400 px-2.5 py-1 rounded-lg border border-indigo-500/20 shrink-0 select-none">
                              이론 {idx + 1}
                            </span>
                            
                            {/* Title & Editor */}
                            <div className="flex-grow min-w-0">
                              {editingTheoryIdx === idx ? (
                                <div className="flex items-center gap-2 w-full">
                                  <input
                                    type="text"
                                    value={editTheoryTitle}
                                    onChange={(e) => setEditTheoryTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const trimmed = editTheoryTitle.trim();
                                        if (trimmed) {
                                          setTheoryQuestions(prev => {
                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);
                                            handleSaveTheoryQuestions(updated, false);
                                            return updated;
                                          });
                                          setEditingTheoryIdx(null);
                                          showNotification('이론 제목이 저장되었습니다.', 'success');
                                        }
                                      } else if (e.key === 'Escape') {
                                        setEditingTheoryIdx(null);
                                      }
                                    }}
                                    className="bg-slateCustom-950 border border-slate-700 text-white text-[16px] font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-indigo-500 w-full max-w-[360px]"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => {
                                      const trimmed = editTheoryTitle.trim();
                                      if (trimmed) {
                                        setTheoryQuestions(prev => {
                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);
                                          handleSaveTheoryQuestions(updated, false);
                                          return updated;
                                        });
                                        setEditingTheoryIdx(null);
                                        showNotification('이론 제목이 저장되었습니다.', 'success');
                                      }
                                    }}
                                    className="px-2 py-1 bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded hover:bg-emerald-800/60 transition-colors shrink-0 cursor-pointer"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingTheoryIdx(null)}
                                    className="px-2 py-1 bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold rounded hover:bg-slate-700 transition-colors shrink-0 cursor-pointer"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
                                  <span 
                                    onClick={() => {
                                      setEditingTheoryIdx(idx);
                                      setEditTheoryTitle(q.title || '');
                                    }}
                                    className="text-[17px] font-extrabold text-white leading-snug cursor-pointer hover:text-indigo-400 hover:underline transition-all whitespace-normal break-words max-w-full inline-block"
                                    title="클릭하여 이론 제목 수정"
                                  >
                                    <LatexRenderer text={q.title} katexLoaded={katexLoaded} />
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingTheoryIdx(idx);
                                      setEditTheoryTitle(q.title || '');
                                    }}
                                    className="p-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 hover:border-yellow-500/50 rounded-lg text-yellow-400 transition-all duration-150 cursor-pointer shrink-0 inline-flex items-center justify-center hover:scale-105 active:scale-95 shadow-[0_2px_8px_rgba(234,179,8,0.1)]"
                                    title="이론 제목 수정"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Action Buttons (정답확인, 수정하기, 삭제) */}
                          <div className="flex flex-wrap items-center gap-2.5 w-full mt-1.5">
                            {/* 정답확인/정답접기 button */}
                                                        {!isNewEmptyCard && (
                              !isOutputVisible ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isHeavyHtml(q.formula)) {
                                      handleOpenHtmlAnswerPopup(q.title || `이론 ${idx + 1}`, q.formula);
                                    }
                                    setTheoryRevealed(prev => ({ ...prev, [idx]: true }));
                                    scrollToTheoryCard(idx);
                                  }}
                                  className="py-1 px-3 bg-indigo-650 hover:bg-indigo-550 text-white text-[11px] font-extrabold rounded-lg transition-all duration-150 active:scale-[0.95] cursor-pointer shrink-0 select-none whitespace-nowrap shadow-md shadow-indigo-650/10 hover:shadow-indigo-650/20 border border-indigo-500/20 flex items-center justify-center gap-1"
                                  title="정답 확인하기"
                                >
                                  <span>정답확인</span>
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTheoryRevealed(prev => ({ ...prev, [idx]: false }));
                                  }}
                                  className="py-1 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 text-[11px] font-extrabold rounded-lg transition-all duration-150 active:scale-[0.95] cursor-pointer shrink-0 select-none whitespace-nowrap flex items-center justify-center gap-1"
                                  title="정답 접기"
                                >
                                  <span>정답접기</span>
                                </button>
                              )
                            )}

                            {/* Toggle Input Editor */}
                            <button
                              onClick={() => {
                                setTheoryInputRevealed(prev => ({
                                  ...prev,
                                  [idx]: !prev[idx]
                                }));
                              }}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer text-[11px] font-bold flex items-center gap-1.5 ${
                                isInputVisible 
                                  ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' 
                                  : 'text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 border-slate-700/50 bg-slate-800/40'
                              }`}
                              title={isInputVisible ? "입력창 닫기" : "입력창 열기"}
                            >
                              <Edit2 size={12} />
                              <span>수정하기</span>
                            </button>

                            {/* Delete/Trash Button */}
                            <button
                              onClick={() => {
                                if (window.confirm(`[${q.title || `이론 ${idx + 1}`}] 이론 유도를 리스트에서 영구히 삭제하시겠습니까?`)) {
                                  const updated = theoryQuestions.filter((_, i) => i !== idx);
                                  latestTheoryQuestionsRef.current = updated;
                                  setTheoryQuestions(updated);
                                  handleSaveTheoryQuestions(updated, false);
                                  setTheoryRevealed(prev => {
                                    const updated = { ...prev };
                                    delete updated[idx];
                                    return updated;
                                  });
                                  setTheoryInputRevealed(prev => {
                                    const updated = { ...prev };
                                    delete updated[idx];
                                    return updated;
                                  });
                                  showNotification('선택한 이론 유도가 성공적으로 삭제되었습니다.', 'info');
                                }
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 border border-slate-700/50 bg-slate-800/40 transition-all cursor-pointer text-[11px] font-bold flex items-center gap-1.5"
                              title="이론 삭제"
                            >
                              <Trash2 size={12} />
                              <span>삭제</span>
                            </button>
                          </div>
                        </div>

                        {/* Real-time LaTeX rendered Output Display Window */}
                        {isOutputVisible && (
                          <div className="space-y-2 md:p-4 md:bg-slateCustom-950/40 md:rounded-xl md:border md:border-slate-800/80 p-0 bg-transparent border-0 min-h-0 relative">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-indigo-400 block select-none">🖥️ 출력창 (실시간 LaTeX 렌더링)</span>
                              {/* Hide Output/Answer Button */}
                              {!isNewEmptyCard && (
                                <button
                                  onClick={() => setTheoryRevealed(prev => ({ ...prev, [idx]: false }))}
                                  className="text-[10px] font-bold text-slate-500 hover:text-white px-2 py-0.5 bg-slate-800/80 hover:bg-slate-700 rounded-md transition-all cursor-pointer active:scale-95 select-none"
                                >
                                  접기 ✕
                                </button>
                              )}
                            </div>
                                                        {q.formula ? (
                              <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                                <LatexRenderer text={q.formula} katexLoaded={katexLoaded} placeholderIfHeavy={true} popupTitle={q.title || `이론 ${idx + 1}`} />
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 italic select-none">아래 입력창에 LaTeX 수식을 입력하면 여기에 실시간으로 렌더링되어 보여집니다.</div>
                            )}
                          </div>
                        )}

                        {/* Input Textarea Area for Paste / Typing LaTeX */}
                        {isInputVisible && (
                          <div className="space-y-1 pt-1 animate-fade-in">
                            <span className="text-[10px] font-black text-slate-400 block select-none">✍️ 입력창 (여기에 텍스트 및 LaTeX 수식 복사-붙여넣기)</span>
                            <textarea
                              value={q.formula || ''}
                              onChange={(e) => {
                                const updated = [...theoryQuestions];
                                updated[idx] = { ...updated[idx], formula: e.target.value };
                                latestTheoryQuestionsRef.current = updated;
                                setTheoryQuestions(updated);
                                localStorage.setItem('anti_theory_questions', JSON.stringify(updated));
                              }}
                              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-indigo-500/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none transition-colors h-32"
                              placeholder="여기에 LaTeX 블록($$ ... $$)이나 인라인 수식($ ... $)이 포함된 내용을 입력하거나 복사-붙여넣기(Ctrl+V) 하세요."
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Middle: Empty Gutter (Takes exactly 2% width on Desktop) */}
            <div className="hidden md:flex landscape-hide md:w-[2%] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20">
              {/* Floating Scroll Button Capsule (Floats beautifully in the center of the empty gutter) */}
              <div 
                className="flex flex-col gap-2.5 p-2 rounded-full bg-slateCustom-950/90 border border-slate-700/40 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.9)] hover:shadow-indigo-500/10 hover:border-indigo-500/30 select-none z-30 transition-all duration-300 hover:scale-105 cursor-default"
                title="이론 위/아래 이동"
              >
                <button 
                  onClick={(e) => { e.stopPropagation(); handleScrollTheory('up'); }}
                  className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-indigo-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-indigo-500 hover:shadow-indigo-650/30 cursor-pointer flex items-center justify-center group/btn"
                  title="이전 이론으로 스크롤"
                >
                  <ChevronUp size={14} className="group-hover/btn:-translate-y-0.5 transition-transform" />
                </button>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); handleScrollTheory('down'); }}
                  className="p-2 sm:p-2.5 rounded-full bg-slate-800/90 hover:bg-indigo-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-90 shadow-md border border-slate-700/60 hover:border-indigo-500 hover:shadow-indigo-650/30 cursor-pointer flex items-center justify-center group/btn"
                  title="다음 이론으로 스크롤"
                >
                  <ChevronDown size={14} className="group-hover/btn:translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right: Gemini Sidebar for Theory */}
            <div className="w-full max-w-full landscape-w-40 min-w-0 shrink-0 md:w-[30%] md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col">
              <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slateCustom-950 flex-shrink-0">
                <Brain size={16} className="text-indigo-500" />
                <span className="text-xs font-bold text-slate-200">제미나이 실시간 이론 유도 튜터</span>
              </div>
              
              <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-[11px] text-slate-400">학습하고 싶으신 공식을 왼쪽에서 선택하여<br/>이론 유도 및 상세 증명을 요청해 보세요!</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
                      <div className={`text-[10px] mb-1 font-bold ${msg.role === 'user' ? 'text-indigo-400 mr-1' : 'text-indigo-400 ml-1'}`}>
                        {msg.role === 'user' ? '나' : 'Gemini'}
                      </div>
                      <div className={
                        msg.role === 'user' 
                          ? 'px-4 py-2.5 rounded-2xl max-w-[95%] text-sm leading-relaxed bg-indigo-600 text-white rounded-br-sm' 
                          : 'text-sm leading-relaxed text-slate-200 md:bg-slate-800 md:border md:border-slate-700 md:rounded-bl-sm md:px-4 md:py-2.5 md:rounded-2xl md:max-w-[95%] bg-transparent border-0 p-0 max-w-full w-full prose prose-invert prose-base max-w-none'
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
                            onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, msg.text)}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex flex-col items-start w-full">
                    <div className="text-[10px] mb-1 font-bold text-indigo-400 ml-1">Gemini</div>
                    <div className="md:px-3 md:py-2 md:rounded-2xl md:bg-slate-800 md:border md:border-slate-700 md:rounded-bl-sm bg-transparent border-0 p-0 text-slate-400 text-xs flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-75"></div>
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-150"></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-slate-800 bg-slateCustom-950 flex-shrink-0">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} 
                  className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 flex items-center gap-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all shadow-lg"
                >
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="공식 유도 및 개념 질문..."
                      disabled={isChatLoading}
                      className="w-full bg-transparent border-0 p-1 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-0"
                    />
                  </div>

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
      )}
      {/* Floating Vertical Navigation - Left Center (Desktop Only, Rendered at end for DOM order stacking context safety) */}
      {!isModalOpen && (
        <div className="fixed left-4 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-4 glass-panel p-3 border border-slate-800 shadow-2xl z-[90] rounded-2xl glow-purple animate-fade-in">
          <button
            onClick={() => {
              setViewMode('dashboard');
              setSelectedTopic(null);
              setShowExam(false);
              setShowFormulaExam(false);
              setShowTheoryExam(false);
            }}
            className={`flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
              viewMode === 'dashboard' && !selectedTopic && !showExam && !showFormulaExam && !showTheoryExam
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
              setViewMode('all_topics');
              setSelectedTopic(null);
              setShowExam(false);
              setShowFormulaExam(false);
              setShowTheoryExam(false);
            }}
            className={`flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
              viewMode === 'all_topics' && !selectedTopic && !showExam && !showFormulaExam && !showTheoryExam
                ? 'bg-gradient-to-tr from-brand-600 to-indigo-500 text-white shadow-lg glow-purple'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
            title={`토픽 진행현황 (${allTopics.length})`}
          >
            <List size={20} />
            <span className="text-[10px] font-bold tracking-tight">진행현황</span>
            <span className="text-[9px] px-1.5 py-0.5 bg-slateCustom-950 text-brand-400 rounded-full border border-brand-500/20 font-black">{allTopics.length}</span>
          </button>
          {/* 종합평가 버튼 */}
          <button
            onClick={() => {
              setSelectedTopic(null);
              setShowFormulaExam(false);
              setShowTheoryExam(false);
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
              setSelectedTopic(null);
              setShowExam(false);
              setShowTheoryExam(false);
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
          {/* 이론유도 버튼 */}
          <button
            onClick={() => {
              setSelectedTopic(null);
              setShowExam(false);
              setShowFormulaExam(false);
              handleOpenTheoryExam();
            }}
            className={`flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
              showTheoryExam
                ? 'bg-gradient-to-tr from-indigo-600 to-purple-500 text-white shadow-lg glow-indigo'
                : 'text-indigo-400 hover:text-indigo-200 hover:bg-indigo-950/40'
            }`}
            title="전공 필수 공식 이론 유도 및 상세 증명 학습"
          >
            <Brain size={20} />
            <span className="text-[10px] font-bold tracking-tight">이론유도</span>
          </button>
        </div>
      )}
    </div>
  );
}
