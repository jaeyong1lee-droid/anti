// ============================================================================
// Markdown, KaTeX LaTeX, and HTML Iframe Rendering Helper Utilities
// ============================================================================
import { healLatexFormulas, balanceMathBraces } from './latexUtils.js';

export const getCorrectAnswerForInput = (q, inputId) => {
  if (!q) return '';
  if (q.answers && q.answers[inputId]) return q.answers[inputId];

  const resolveCalcItem = (items, targetId) => {
    if (!Array.isArray(items) || items.length === 0 || !targetId) return null;
    const strId = String(targetId).trim();
    let hit = items.find(it => String(it.id || '').trim() === strId);
    if (hit) return hit;

    const numMatch = strId.match(/\d+/);
    const targetNum = numMatch ? parseInt(numMatch[0], 10) : null;

    let targetLetter = null;
    const letterMatch = strId.match(/_([A-F])\b/i) || strId.match(/^([A-F])$/i) || strId.match(/([A-F])$/i);
    if (letterMatch) {
      targetLetter = letterMatch[1].toUpperCase();
    }
    const targetLetterIdx = targetLetter ? targetLetter.charCodeAt(0) - 65 + 1 : null;
    const targetIndex = targetNum || targetLetterIdx;

    if (targetIndex) {
      return items.find((it, idx) => {
        const itemStr = String(it.id || '').trim();
        const itemNum = (itemStr.match(/\d+/) || [])[0];
        const itemLetterMatch = itemStr.match(/_([A-F])\b/i) || itemStr.match(/^([A-F])$/i) || (it.label || '').match(/\(([A-F])\)/i);
        const itemLetter = itemLetterMatch ? itemLetterMatch[1].toUpperCase() : null;
        const itemLetterIdx = itemLetter ? itemLetter.charCodeAt(0) - 65 + 1 : null;

        const itemIdx = (itemNum ? parseInt(itemNum, 10) : null) || itemLetterIdx || (idx + 1);
        return itemIdx === targetIndex;
      }) || (targetIndex <= items.length ? items[targetIndex - 1] : null);
    }
    return null;
  };

  if (q.calcItems && Array.isArray(q.calcItems)) {
    const calcItem = resolveCalcItem(q.calcItems, inputId);
    if (calcItem) {
      if (calcItem.modelAnswer) return calcItem.modelAnswer;
      if (calcItem.correctAnswer) return calcItem.correctAnswer;
      if (calcItem.answer) return calcItem.answer;
      if (q.answers && calcItem.id && q.answers[calcItem.id]) return q.answers[calcItem.id];
      if (calcItem.label) return calcItem.label;
    }
  }

  if (!q.answers) return '';

  const match = String(inputId || '').match(/^INPUT_(\d+)$/i);
  if (match) {
    const idx = parseInt(match[1], 10);
    const letter = String.fromCharCode(65 + idx - 1);
    const letterLower = letter.toLowerCase();

    const candidates = [
      `INPUT_${letter}`,
      `INPUT_${letterLower}`,
      `(${letter})`,
      `(${letterLower})`,
      `${letter}`,
      `${letterLower}`,
      `${idx}`,
      `INPUT_${idx}`
    ];
    for (const cand of candidates) {
      if (q.answers[cand]) return q.answers[cand];
    }
  }

  const letterMatch = String(inputId || '').match(/^\(?([A-F])\)?$/i);
  if (letterMatch) {
    const letter = letterMatch[1].toUpperCase();
    const idx = letter.charCodeAt(0) - 65 + 1;
    const candidates = [
      `INPUT_${idx}`,
      `INPUT_${letter}`,
      `(${letter})`,
      `${letter}`,
      `${idx}`
    ];
    for (const cand of candidates) {
      if (q.answers[cand]) return q.answers[cand];
    }
  }

  return '';
};


export const getAnswerValue = (tableAnswers, questionIdx, inputId, isComparisonTable = false) => {
  if (!tableAnswers) return '';
  const key = `${questionIdx}_${inputId}`;

  // Exact key match has highest priority
  if (tableAnswers[key] !== undefined && tableAnswers[key] !== '') {
    return tableAnswers[key];
  }

  if (isComparisonTable) {
    const match = String(inputId || '').match(/^INPUT_(\d+)_(\d+)$/);
    if (match) {
      const r = parseInt(match[1], 10);
      const c = parseInt(match[2], 10);
      const compKeys = [
        `${questionIdx}_INPUT_COMP_${r}_${c}`,
        `${questionIdx}_INPUT_COMP_${r - 2}_${c}`
      ];
      for (const alt of compKeys) {
        if (tableAnswers[alt] !== undefined && tableAnswers[alt] !== '') {
          return tableAnswers[alt];
        }
      }
    }
    return tableAnswers[key] || '';
  }

  const altKeys = [];
  if (inputId === 'INPUT_1') altKeys.push(`${questionIdx}_INPUT_0_1`, `${questionIdx}_INPUT_0`);
  if (inputId === 'INPUT_2') altKeys.push(`${questionIdx}_INPUT_1_1`);
  if (inputId === 'INPUT_0_1') altKeys.push(`${questionIdx}_INPUT_1`);
  if (inputId === 'INPUT_1_1') altKeys.push(`${questionIdx}_INPUT_2`);

  for (const alt of altKeys) {
    if (alt !== key && tableAnswers[alt] !== undefined && tableAnswers[alt] !== '') {
      return tableAnswers[alt];
    }
  }
  return tableAnswers[key] || '';
};

export const getGradingResult = (tableGradingResults, questionIdx, inputId, isComparisonTable = false) => {
  if (!tableGradingResults) return undefined;
  const key = `${questionIdx}_${inputId}`;

  // Exact key match has highest priority
  if (tableGradingResults[key] !== undefined) {
    return tableGradingResults[key];
  }

  if (isComparisonTable) {
    const match = String(inputId || '').match(/^INPUT_(\d+)_(\d+)$/);
    if (match) {
      const r = parseInt(match[1], 10);
      const c = parseInt(match[2], 10);
      const compKeys = [
        `${questionIdx}_INPUT_COMP_${r}_${c}`,
        `${questionIdx}_INPUT_COMP_${r - 2}_${c}`
      ];
      for (const alt of compKeys) {
        if (tableGradingResults[alt] !== undefined) {
          return tableGradingResults[alt];
        }
      }
    }
    return undefined;
  }

  const altKeys = [];
  if (inputId === 'INPUT_1') altKeys.push(`${questionIdx}_INPUT_0_1`, `${questionIdx}_INPUT_0`);
  if (inputId === 'INPUT_2') altKeys.push(`${questionIdx}_INPUT_1_1`);
  if (inputId === 'INPUT_0_1') altKeys.push(`${questionIdx}_INPUT_1`);
  if (inputId === 'INPUT_1_1') altKeys.push(`${questionIdx}_INPUT_2`);

  for (const alt of altKeys) {
    if (alt !== key && tableGradingResults[alt] !== undefined) {
      return tableGradingResults[alt];
    }
  }
  return undefined;
};

export const formatGradingReason = (reason) => {
  if (!reason) return '';
  return reason.replace(/(\b\d+(?:\.\d+)?)(점\s*(?:을\s*)?감점)/g, '10점 만점 기준 $1$2');
};

export const buildHtmlDocument = (text, isPopup = false) => {
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
        white-space: nowrap !important;
        text-align: center !important;
      }
      .katex-display > .katex {
        display: inline-block !important;
        white-space: nowrap !important;
        text-align: initial !important;
      }
      .katex-display > .katex > .katex-html {
        display: inline-block !important;
        white-space: nowrap !important;
      }
      .katex-display > .katex > .katex-html > .base {
        display: inline-block !important;
        white-space: nowrap !important;
      }
      .formula-scroll-container .katex-display {
        overflow-x: visible !important;
        max-width: none !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
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
        while (node = walk.nextNode()) {
          const parent = node.parentNode;
          if (parent) {
            const tag = parent.tagName.toUpperCase();
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'CODE' || tag === 'PRE' || (parent.classList && (parent.classList.contains('katex') || parent.classList.contains('katex-html')))) {
              continue;
            }
          }
          const text = node.nodeValue;
          if (!text) continue;
          if (text.includes('₩')) {
            mathNodes.push(node);
          }
        }
        mathNodes.forEach(node => {
          node.nodeValue = node.nodeValue.replace(/₩/g, '\\');
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

export const handleOpenHtmlAnswerPopup = (title, text) => {
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
    alert("팝업 차단기가 활성화되어 창을 열 수 없습니다. 팝업 차단을 해제해 주세요.");
  }
};

// Helper to build a single collapsible button HTML
export const buildSingleButtonHtml = (itemStr, fallbackBody = '') => {
  if (!itemStr || typeof itemStr !== 'string') return '';
  const rawLines = itemStr.trim().split('\n');
  const firstLine = rawLines[0]
    .replace(/^[ \t]*(?:\*|-|•|\d+[\.\)]|\[\d+\])[ \t]*/, '')
    .replace(/^[ \t]*(?:📚|📖|📄|🔖|💡|📌|🔍|📜|📑|📘)[ \t]*/, '')
    .replace(/^(\*\*|\[)?\s*/, '')
    .replace(/(\*\*|\])?\s*$/, '')
    .trim();
  if (!firstLine || firstLine.length < 2) return '';

  const subLines = rawLines.slice(1).map(l => l.trim()).filter(Boolean);

  let mainTitle = firstLine;
  let mainContent = subLines.length > 0 ? subLines.join('<br/>') : '';

  let categoryBadge = '📘 설계지침 / 공학서적';
  if (/KDS|KCS|설계기준|시방서|KS|AASHTO|ASTM|ISO|USACE|FHWA|국토교통부|국토부|건설교통부|해양수산부|한국도로공사|LH/i.test(firstLine)) {
    categoryBadge = '📜 국가설계기준';
  } else if (/원보고서|보고서|실측치|계측치|감리|진단/i.test(firstLine)) {
    categoryBadge = '📄 원보고서 본문';
  } else if (/Wikipedia|위키|http:\/\/|https:\/\/|논문|학술지|Journal|Proceedings/i.test(firstLine)) {
    categoryBadge = '🌐 Wikipedia / 학술문헌';
  }

  if (!mainContent) {
    if (fallbackBody) {
      mainContent = fallbackBody;
    } else if (/KDS|KCS|국가설계기준|설계기준|시방서/i.test(firstLine)) {
      mainContent = `• <strong>${mainTitle}</strong>:<br/>국토교통부 KDS/KCS 국가건설기준에 수록된 해당 공법/토픽의 표준 설계 지침, 품질 관리 기준 및 시공 안전 규정.`;
    } else if (/원보고서/i.test(firstLine)) {
      mainContent = `• <strong>${mainTitle}</strong>:<br/>현장 공사 계측치 데이터 분석, 공학적 변위/응력 검토 결과 및 실무 기술 수록 본문.`;
    } else if (/Wikipedia|위키|Soil Mechanics/i.test(firstLine)) {
      mainContent = `• <strong>${mainTitle}</strong>:<br/>지반공학 및 학술 문헌에 근거한 공학적 변량 규정, 거동 메커니즘 및 역학적 파라미터 표준.`;
    } else {
      mainContent = `• <strong>${mainTitle}</strong>:<br/>해당 기술 기준 및 학술 문헌의 설계 파라미터 수치와 핵심 공학적 메커니즘 규정.`;
    }
  }

  return `<details class="my-0.5 border border-slate-800 rounded-lg overflow-hidden bg-slate-900/80 shadow-xs"><summary class="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-100 font-medium text-xs sm:text-sm cursor-pointer flex items-center justify-between select-none transition-colors group border-b border-slate-800/40"><span class="flex items-center gap-1.5 min-w-0"><span class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">${categoryBadge}</span><span class="text-slate-100 group-hover:text-amber-300 transition-colors truncate font-semibold">${mainTitle}</span></span><span class="ml-2 text-[10px] sm:text-[11px] text-amber-400/90 font-semibold px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 whitespace-nowrap flex items-center gap-0.5 shrink-0"><span>본문 확인</span><span class="text-[9px]">▼</span></span></summary><div class="p-2 bg-slate-950 text-xs text-slate-300 leading-relaxed border-t border-slate-800/80 space-y-1 select-text"><div class="pl-2.5 py-1 border-l-2 border-amber-500/50 text-slate-200 bg-slate-900/40 rounded-r-md text-[11px] sm:text-xs leading-relaxed">${mainContent}</div></div></details>`;
};

export function transformAsciiGraphToSvg(code) {
  if (!code || typeof code !== 'string') return null;

  // Check if code block looks like an ASCII graph (multiple slashes, trend lines, or slope formulas)
  const slashCount = (code.match(/\//g) || []).length;
  const isAsciiGraph = slashCount >= 4 || /기울기|추세선|실측 데이터|┌─|└─|시간/i.test(code);
  if (!isAsciiGraph) return null;

  let title = '실측 데이터 계측 역해석 추세선';
  const titleMatch = code.match(/\(([^)]*추세선[^)]*)\)/i) || code.match(/(실측 데이터[^\n\r]*)/i);
  if (titleMatch) title = titleMatch[1];

  let slopeRaw = 'e^{-\\alpha \\Delta t}';
  const slopeMatch = code.match(/기울기\s*=\s*([^\n\r]+)/i);
  if (slopeMatch) {
    slopeRaw = slopeMatch[1].replace(/[\^▲┌─]/g, '').trim();
  }

  let slopeKatex = slopeRaw;
  if (!slopeKatex.startsWith('$')) {
    slopeKatex = `$${slopeKatex}$`;
  }
  
  let renderedSlope = slopeKatex;
  let renderedY = '$s_t$';
  let renderedX = '$s_{t-\\Delta t}$';
  
  if (typeof renderKatexString === 'function') {
    renderedSlope = renderKatexString(slopeKatex, { displayMode: false, throwOnError: false });
    renderedY = renderKatexString('$s_t$', { displayMode: false, throwOnError: false });
    renderedX = renderKatexString('$s_{t-\\Delta t}$', { displayMode: false, throwOnError: false });
  }

  return `<div class="w-full my-3 border border-amber-500/30 rounded-xl p-3 sm:p-4 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 shadow-md select-text"><div class="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3"><div class="flex items-center gap-2"><span class="text-amber-400 font-bold text-sm sm:text-base">📈</span><span class="text-slate-100 font-bold text-xs sm:text-sm truncate">${title}</span></div><span class="px-2 py-0.5 text-[10px] sm:text-xs font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-md shrink-0">SVG 역해석 추세선</span></div><div class="relative w-full overflow-hidden py-1"><svg width="100%" height="150" viewBox="0 0 500 150" class="w-full h-[130px] sm:h-[150px]"><line x1="45" y1="12" x2="45" y2="125" stroke="#475569" stroke-width="1.5"/><line x1="45" y1="125" x2="480" y2="125" stroke="#475569" stroke-width="1.5"/><path d="M 41 17 L 45 10 L 49 17" fill="none" stroke="#475569" stroke-width="1.5"/><path d="M 473 121 L 483 125 L 473 129" fill="none" stroke="#475569" stroke-width="1.5"/><line x1="45" y1="50" x2="480" y2="50" stroke="#1e293b" stroke-width="1" stroke-dasharray="3,3"/><line x1="45" y1="88" x2="480" y2="88" stroke="#1e293b" stroke-width="1" stroke-dasharray="3,3"/><line x1="180" y1="12" x2="180" y2="125" stroke="#1e293b" stroke-width="1" stroke-dasharray="3,3"/><line x1="330" y1="12" x2="330" y2="125" stroke="#1e293b" stroke-width="1" stroke-dasharray="3,3"/><path d="M 52 118 Q 190 55 455 22" fill="none" stroke="#f59e0b" stroke-width="2.5"/><circle cx="52" cy="118" r="4" fill="#fbbf24"/><circle cx="160" cy="72" r="4" fill="#fbbf24"/><circle cx="310" cy="42" r="4" fill="#fbbf24"/><circle cx="455" cy="22" r="4" fill="#fbbf24"/></svg><div class="absolute top-0 left-[8px] text-amber-400 font-bold text-xs sm:text-sm">${renderedY}</div><div class="absolute bottom-0 right-[10px] text-slate-300 font-semibold text-xs sm:text-sm flex items-center gap-1">${renderedX} <span class="text-slate-400 text-xs font-normal">(시간 t)</span></div><div class="absolute top-[30%] left-[35%] -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-950/95 border border-amber-500/60 rounded-lg shadow-lg text-amber-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 z-10"><span class="text-amber-400 shrink-0">기울기=</span><span class="inline-block">${renderedSlope}</span></div></div></div>`;
}

export function removeSourceCitationsFromText(text) {
  if (!text || typeof text !== 'string') return text;
  // Separate multiple inline citation bullets onto their own lines
  let formatted = text.replace(/([^\n])\s+(\*\s*(?:KDS|KCS|KWCS|KS|ASTM|AASHTO|국토교통부|한국도로공사|원보고서|Wikipedia|출처|참고문헌|설계기준))/gi, '$1\n$2');
  return formatted.replace(/\n{3,}/g, '\n\n').trim();
}

export function getOnlySourceAccordion(text, qTitle = '') {
  return '';
}

export function sanitizeSvgDarkBackground(svgHtml) {
  if (!svgHtml || typeof svgHtml !== 'string') return svgHtml;
  let cleaned = svgHtml;

  // 1. Replace white/light background styles in <svg> or child elements (#ffffff, #fff, white, #f8fafc, #f1f5f9, #e2e8f0, etc.)
  cleaned = cleaned.replace(/(style="[^"]*background(?:-color)?\s*:\s*)(#ffffff|#fff|white|#f8fafc|#f1f5f9|#e2e8f0|#ffffff[0-9a-f]{2})/gi, '$1#1e1e1e');

  // 2. If <svg> tag has style attribute, ensure it has our required base styles
  cleaned = cleaned.replace(/<svg([^>]*\bstyle=")([^"]*)(")/gi, (match, prefix, styleVal, suffix) => {
    let newStyle = styleVal;
    if (!/background(-color)?\s*:/i.test(newStyle)) {
      newStyle += '; background-color: #1e1e1e; border-radius: 8px;';
    }
    if (!/overflow\s*:/i.test(newStyle)) newStyle += '; overflow: visible;';
    if (!/padding-bottom\s*:/i.test(newStyle)) newStyle += '; padding-bottom: 2.5rem;';
    if (!/height\s*:/i.test(newStyle)) newStyle += '; height: auto;';
    return `<svg${prefix}${newStyle}${suffix}`;
  });

  // 3. If <svg> tag has NO style attribute at all, add style
  cleaned = cleaned.replace(/<svg(?![^>]*\bstyle=)/gi, '<svg style="background-color: #1e1e1e; border-radius: 8px; overflow: visible; padding-bottom: 2.5rem; height: auto;"');

  // 4. Replace background <rect> elements with white/light fill
  cleaned = cleaned.replace(/(<rect[^>]*\bfill=")(#ffffff|#fff|white|#f8fafc|#f1f5f9|#e2e8f0|#ffffff[0-9a-f]{2})(")/gi, '$1#1e1e1e$3');

  // 5. Fix text color if dark/black text was used (which becomes invisible on dark background)
  cleaned = cleaned.replace(/(style="[^"]*color\s*:\s*)(#000000|#000|black|#1e293b|#334155|#0f172a)/gi, '$1#e2e8f0');

  return cleaned;
}

export function convertMarkdownToHtml(mdText, isMarkdown = false, highlightBold = false, isTutor = false, isExplanation = false) {
  const mathBlocks = [];
  let placeholderIndex = 0;
  
  // Protect HTML table blocks generated by convertMarkdownTablesToHtml to prevent markdown rules from corrupting styles
  const tableBlocks = [];
  let tempText = mdText || '';

  // Normalize Windows line endings early to prevent regex bugs
  tempText = tempText.replace(/\r\n/g, '\n');

  // Clean and transform raw :::mechanism [Title] or ::: directive tags
  tempText = tempText.replace(/:::mechanism\s*\[(.*?)\]/gi, (match, title) => {
    return title ? `⚙️ **${title.trim()}**` : '';
  });
  tempText = tempText.replace(/:::[a-zA-Z0-9_-]*/g, '');

  // Always remove inline source citation texts
  tempText = removeSourceCitationsFromText(tempText);

  // Protect details/summary HTML blocks so markdown line splitters don't break them
  const detailsBlocks = [];
  let detailsIndex = 0;
  tempText = tempText.replace(/(<details[\s\S]*?<\/details>)/gi, (match) => {
    const placeholder = `___DETAILS_BLOCK_${detailsIndex}___`;
    detailsBlocks.push({ placeholder, content: match });
    detailsIndex++;
    return placeholder;
  });

  // Protect and convert markdown code blocks (``` ... ```) to styled pre/code blocks or SVG charts
  const codeBlocks = [];
  let codeBlockIndex = 0;
  tempText = tempText.replace(/```([a-zA-Z0-9_\-\$]*)[ \t]*\n([\s\S]*?)\n```/g, (match, rawLang, code) => {
    const placeholder = `___CODE_BLOCK_${codeBlockIndex}___`;
    let lang = rawLang.replace(/\$/g, '');
    code = code.replace(/<svg\$/gi, '<svg'); // Fix AI inserting $ into svg tag
    
    const svgChart = transformAsciiGraphToSvg(code);
    let codeHtml = code;
    if (typeof renderKatexString === 'function') {
      codeHtml = codeHtml.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (m, math) => {
        return renderKatexString(math.trim(), { displayMode: false, throwOnError: false });
      });
      codeHtml = codeHtml.replace(/\$((?:[^\$\n<]|<(?![a-zA-Z/!]))+?)\$/g, (m, math) => {
        const isReal = !/[\uAC00-\uD7A3]/.test(math) || /\\/.test(math) || /_/.test(math) || /\^/.test(math) || /[=+\-\*\/]/.test(math) || /\\cdot/.test(math);
        if (!isReal) return m;
        return renderKatexString(math.trim(), { displayMode: false, throwOnError: false });
      });
    }
    const hasSvgTag = codeHtml.includes('<svg') && codeHtml.includes('</svg>');
    
    if (lang === 'svg' || hasSvgTag) {
      const svgMatch = codeHtml.match(/(<svg[\s\S]*<\/svg>)/i);
      const pureSvg = svgMatch ? svgMatch[1] : codeHtml;
      const darkSvgHtml = sanitizeSvgDarkBackground(pureSvg);
      const styledSvgHtml = `<div class="w-full my-4 border border-slate-700/60 rounded-xl overflow-hidden shadow-lg bg-slate-900/40 relative select-text"><div class="px-3 py-2 bg-slate-800/50 border-b border-slate-700/60 flex items-center justify-between"><span class="text-xs font-bold text-slate-300 flex items-center gap-2"><span class="text-amber-400">📊</span> 공학 다이어그램</span><button onclick="if(window.openSvgZoomModal) window.openSvgZoomModal(this)" class="p-1.5 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/30 rounded-lg cursor-pointer transition-all active:scale-95 flex items-center justify-center shadow-sm" title="확대해서 보기"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg></button></div><div class="p-3 overflow-x-auto flex items-center justify-center min-h-[120px] max-w-full text-slate-200">${darkSvgHtml}</div></div>`;
      codeBlocks.push({ placeholder, content: styledSvgHtml });
      codeBlockIndex++;
      return placeholder;
    }

    const styledHtml = svgChart ? svgChart : `<pre class="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 overflow-x-auto my-3 font-mono text-xs text-slate-300 leading-relaxed select-text" style="white-space: pre; font-family: monospace;">${codeHtml}</pre>`;
    codeBlocks.push({ placeholder, content: styledHtml });
    codeBlockIndex++;
    return placeholder;
  });


  
  // Primary: match table-export-wrapper div from open tag to the two closing </div> tags that follow </table>
  tempText = tempText.replace(/(<div[^>]*class="[^"]*table-export-wrapper[^"]*"[^>]*>[\s\S]*?<\/table>[\s\S]*?<\/div>\s*<\/div>)/g, (match) => {
    const placeholder = `___HTML_TABLE_${placeholderIndex}___`;
    tableBlocks.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });
  
  // Secondary: protect any remaining table-quiz-container divs that weren't caught (safety net)
  tempText = tempText.replace(/(<div[^>]*class="[^"]*table-quiz-container[^"]*"[^>]*>[\s\S]*?<\/table>\s*<\/div>)/g, (match) => {
    const placeholder = `___HTML_TABLE_${placeholderIndex}___`;
    tableBlocks.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  // (Line endings normalized early at top)

  // Protect $$ ... $$
  tempText = tempText.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (match) => {
    const placeholder = `___BLOCK_MATH_${placeholderIndex}___`;
    mathBlocks.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  // Protect $ ... $
  tempText = tempText.replace(/\$((?:[^\$\n<]|<(?![a-zA-Z/!]))+?)\$/g, (match, math) => {
    const isReal = !/[\uAC00-\uD7A3]/.test(math) || /\\/.test(math) || /_/.test(math) || /\^/.test(math) || /[+=]/.test(math) || /\\cdot/.test(math);
    if (!isReal) {
      return match;
    }
    const placeholder = `___INLINE_MATH_${placeholderIndex}___`;
    mathBlocks.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  // Prevent inline math newlines from breaking
  tempText = tempText.replace(/(___INLINE_MATH_\d+___)\n(?!\n)([)}\],.!?\uAC00-\uD7A3a-zA-Z0-9])/g, '$1$2');
  tempText = tempText.replace(/([(\[{\uAC00-\uD7A3a-zA-Z0-9])\n(?!\n)(___INLINE_MATH_\d+___)/g, '$1 $2');

  tempText = tempText.replace(/\n\s*\n/g, '\n\n');
  tempText = tempText.replace(/\n{3,}/g, '\n\n');


  // Headings on same line
  tempText = tempText.replace(/([^\n])\s*(#{2,6}\s+)/g, '$1\n\n$2');

  // Bold & Italics text highlight
  const yellowColor = '#fbbf24';
  const shouldHighlight = isMarkdown || isTutor || isExplanation || highlightBold;
  const boldColor = shouldHighlight ? yellowColor : '#f1f5f9';
  
  tempText = tempText.replace(/\*\*\*([^\*]+?)\*\*\*/g, `<strong style="color: ${boldColor}; font-style: italic; font-weight: 800;">$1</strong>`);
  tempText = tempText.replace(/\*\*([^\*]+?)\*\*/g, `<strong style="color: ${boldColor}; font-weight: 700;">$1</strong>`);
  // Standalone horizontal rule divider
  tempText = tempText.replace(/^[ \t]*(?:\* * \*|\*\*\*|---|___)[ \t]*$/gm, '<hr style="border: 0; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 0.8rem 0;" />');

  // Render headings
  tempText = tempText.replace(/^(###+)\s+(.*?)$/gm, (match, hashes, title) => {
    if (isTutor) {
      return `<h3 class="text-[14px] sm:text-[16px]" style="margin-top: 1.8rem; margin-bottom: 0.6rem; font-weight: normal; color: #f1f5f9; border-bottom: 1px solid rgba(51, 65, 85, 0.2); padding-bottom: 0.15rem;">${title}</h3>`;
    }
    if (isMarkdown) {
      return `<h3 style="margin-top: 1.8rem; margin-bottom: 0.8rem; font-weight: 800; color: #f1f5f9; font-size: 1.05rem; border-bottom: 1px solid #334155; padding-bottom: 0.3rem;">${title}</h3>`;
    } else {
      return `<h3 style="margin-top: 0.8rem; margin-bottom: 0.4rem; font-weight: 800; color: #f1f5f9; font-size: 1rem; border-bottom: 1px solid rgba(51, 65, 85, 0.2); padding-bottom: 0.2rem;">${title}</h3>`;
    }
  });
  tempText = tempText.replace(/^(##)\s+(.*?)$/gm, (match, hashes, title) => {
    if (isTutor) {
      return `<h2 class="text-[14px] sm:text-[16px]" style="margin-top: 2.2rem; margin-bottom: 0.8rem; font-weight: normal; color: #f8fafc; border-bottom: 1px solid rgba(71, 85, 105, 0.2); padding-bottom: 0.2rem;">${title}</h2>`;
    }
    if (isMarkdown) {
      return `<h2 style="margin-top: 2rem; margin-bottom: 1rem; font-weight: 900; color: #f8fafc; font-size: 1.2rem; border-bottom: 1px solid #475569; padding-bottom: 0.4rem;">${title}</h2>`;
    } else {
      return `<h2 style="margin-top: 1rem; margin-bottom: 0.5rem; font-weight: 900; color: #f8fafc; font-size: 1.1rem; border-bottom: 1px solid rgba(71, 85, 105, 0.3); padding-bottom: 0.3rem;">${title}</h2>`;
    }
  });
  tempText = tempText.replace(/^(#)\s+(.*?)$/gm, (match, hashes, title) => {
    if (isTutor) {
      return `<h1 class="text-[14px] sm:text-[16px]" style="margin-top: 2.6rem; margin-bottom: 1rem; font-weight: normal; color: #f8fafc; border-bottom: 1px solid rgba(71, 85, 105, 0.25); padding-bottom: 0.25rem;">${title}</h1>`;
    }
    if (isMarkdown) {
      return `<h1 style="margin-top: 2.4rem; margin-bottom: 1.2rem; font-weight: 950; color: #f8fafc; font-size: 1.35rem; border-bottom: 1px solid #475569; padding-bottom: 0.5rem;">${title}</h1>`;
    } else {
      return `<h1 style="margin-top: 1.2rem; margin-bottom: 0.6rem; font-weight: 950; color: #f8fafc; font-size: 1.2rem; border-bottom: 1px solid rgba(71, 85, 105, 0.3); padding-bottom: 0.35rem;">${title}</h1>`;
    }
  });
  // Convert markdown list items (*, -, •, or 1., 2.) including multi-level indentation into nested <ul>/<ol>
  tempText = tempText.replace(/((?:^[ \t]*(?:(?:>|&gt;)\s*)?(?:[-*•▪▫·]|\d+[\.\)](?!\d))\s*.+(?:\n|$))+)/gm, (block) => {
    const lines = block.split('\n');
    let html = '';
    let inOuter = false;
    let inInner = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^([ \t]*)(?:(?:>|&gt;)\s*)?(?:([-*•▪▫·])|(\d+)[\.\)](?!\d))\s*(.+)$/);
      if (!match) continue;
      
      const indentLen = match[1].replace(/\t/g, '  ').length;
      let content = match[4].replace(/^[ \t]*(?:[•\-*▪▫·]|\d+[\.\)](?!\d))[ \t]*/g, '').trim();
      content = content.replace(/^정의\s*:\s*/, '');
      if (!content) continue;

      const isSubItem = indentLen > 0 || (i > 0 && /:$/.test(lines[i - 1].trim()));

      if (!isSubItem) {
        if (inInner) { html += '</ul>'; inInner = false; }
        if (!inOuter) { html += '<ul style="list-style-type: disc; padding-left: 1.4rem; margin: 0.3rem 0 0.3rem 0;">'; inOuter = true; }
        html += `<li style="margin-bottom: 0.25rem; line-height: 1.65; font-weight: 600;">${content}</li>`;
      } else {
        if (!inOuter) { html += '<ul style="list-style-type: disc; padding-left: 1.4rem; margin: 0.3rem 0 0.3rem 0;">'; inOuter = true; }
        if (!inInner) { html += '<ul style="list-style-type: circle; padding-left: 1.3rem; margin: 0.15rem 0;">'; inInner = true; }
        html += `<li style="margin-bottom: 0.2rem; line-height: 1.6; font-weight: normal; color: #cbd5e1;">${content}</li>`;
      }
    }
    if (inInner) html += '</ul>';
    if (inOuter) html += '</ul>';
    return html;
  });



  tempText = tempText.replace(/(?:<br\/>|<div style="height: [^"]*"><\/div>)*\s*(___BLOCK_MATH_\d+___)\s*(?:<br\/>|<div style="height: [^"]*"><\/div>)*/g, '$1');
  tempText = tempText.replace(/(?:<br\/>|<div style="height: [^"]*"><\/div>)+(<div style="[^"]*padding-left:[^"]*")/g, '$1');
  tempText = tempText.replace(/(<\/div>)(?:<br\/>|<div style="height: [^"]*"><\/div>)+(<div style="[^"]*padding-left:[^"]*")/g, '$1$2');
  tempText = tempText.replace(/(?:<br\/>|<div style="height: [^"]*"><\/div>)+\s*(<hr\b[^>]*>)/g, '$1');

  // Remove spacer divs / br immediately before and after HTML table blocks
  tempText = tempText.replace(/(?:<br\/>|<div style="height: [^"]*"><\/div>)+\s*(___HTML_TABLE_\d+___)/g, '$1');
  tempText = tempText.replace(/(___HTML_TABLE_\d+___)\s*(?:<br\/>|<div style="height: [^"]*"><\/div>)+/g, '$1');

  // Restore math blocks
  mathBlocks.forEach(block => {
    while (tempText.includes(block.placeholder)) {
      tempText = tempText.replace(block.placeholder, () => block.content);
    }
  });

  // Restore HTML tables
  tableBlocks.forEach(block => {
    while (tempText.includes(block.placeholder)) {
      tempText = tempText.replace(block.placeholder, () => block.content);
    }
  });

  // Restore code blocks
  codeBlocks.forEach(block => {
    while (tempText.includes(block.placeholder)) {
      tempText = tempText.replace(block.placeholder, () => block.content);
    }
  });

  // Restore details blocks
  detailsBlocks.forEach(block => {
    while (tempText.includes(block.placeholder)) {
      tempText = tempText.replace(block.placeholder, () => block.content);
    }
  });

  // Clean placeholders
  tempText = tempText.replace(/___DETAILS_BLOCK_\d+___/g, '');

  // Clean placeholders
  tempText = tempText.replace(/___(BLOCK|INLINE)_MATH_\d+___/g, '');
  tempText = tempText.replace(/___HTML_TABLE_\d+___/g, '');
  tempText = tempText.replace(/___CODE_BLOCK_\d+___/g, '');

  return tempText;
}

export const renderKatexString = (math, options = {}) => {
  if (!math || typeof math !== 'string') return '';
  
  // Decode standard HTML entities inside math formula
  let decoded = math
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Self-heal quotes: convert double quote " to double prime '' (which KaTeX supports in math mode)
  decoded = decoded.replace(/"/g, "''");

  let processedMath = decoded.replace(/\\frac\b/g, '\\dfrac');
  processedMath = processedMath.replace(/\\{2,}%/g, '\\%');
  processedMath = processedMath.replace(/(?<!\\)%/g, '\\%');
  processedMath = processedMath.replace(/₩/g, '\\');

  let cleaned = processedMath.trim();
  if (cleaned.startsWith('$$') && cleaned.endsWith('$$')) {
    cleaned = cleaned.substring(2, cleaned.length - 2).trim();
  } else if (cleaned.startsWith('$') && cleaned.endsWith('$')) {
    cleaned = cleaned.substring(1, cleaned.length - 1).trim();
  }
  cleaned = cleaned.replace(/^\$|\$/g, '').trim();
  processedMath = cleaned.replace(/₩/g, '\\');

  // Strip accidental HTML tags (like <em> or <strong>) that markdown parsers might have injected inside the math block
  processedMath = processedMath.replace(/<\/?(?:em|strong|b|i|u|span|div|p)[^>]*>/gi, '');

  // Auto-heal brace balancing (open & orphan closing braces) before passing to KaTeX
  processedMath = balanceMathBraces(processedMath);

  if (typeof window !== 'undefined' && window.katex) {
    try {
      return window.katex.renderToString(processedMath, { ...options, throwOnError: true, strict: 'ignore' }).replace(/\n/g, ' ');
    } catch (e) {
      // Retry once with strict throwOnError: false
      try {
        return window.katex.renderToString(processedMath, { ...options, throwOnError: false, strict: 'ignore' }).replace(/\n/g, ' ');
      } catch (err) {
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
  }
  return options.displayMode ? `$$${processedMath}$$` : `$${processedMath}$`;
};

export const getSelectionTextWithLatex = (selection) => {
  if (!selection || selection.rangeCount === 0) return "";
  const range = selection.getRangeAt(0);
  if (range.collapsed) return "";
  
  const fragment = range.cloneContents();
  const katexes = Array.from(fragment.querySelectorAll('.katex'));
  const rootKatexes = Array.from(fragment.childNodes).filter(node => 
    node.nodeType === Node.ELEMENT_NODE && 
    (node.classList.contains('katex') || node.classList.contains('katex-display'))
  );
  
  const allKatexes = [...new Set([...katexes, ...rootKatexes])];
  
  for (const el of allKatexes) {
    const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
    if (annotation) {
      const latex = (annotation.textContent || annotation.innerText || "").trim();
      const isDisplay = el.classList.contains('katex-display') || el.closest('.katex-display') || el.querySelector('.katex-display');
      const textNode = document.createTextNode(isDisplay ? `\n$$${latex}$$\n` : `$${latex}$`);
      if (el.parentNode) {
        el.parentNode.replaceChild(textNode, el);
      }
    }
  }
  return (fragment.textContent || "").trim();
};

export const isSameConditionValue = (val) => {
  if (typeof val !== 'string') return false;
  const clean = val.trim().replace(/\s+/g, '');
  return clean === '동일조건적용' || 
         clean === '동일조건' || 
         clean === '동일' || 
         clean === '상동' || 
         clean === '동일적용';
};

export const areCellsEqual = (cellA, cellB) => {
  if (cellA === cellB) return true;
  if (isSameConditionValue(cellB)) return true;
  if (isSameConditionValue(cellA)) return true;
  return false;
};

export const getTableScoreColorTheme = (gradingResult, isCorrect, value) => {
  const score = gradingResult?.score;
  if (score !== undefined) {
    if (score >= 9) {
      return {
        cellBg: 'bg-emerald-950/20 text-emerald-300 font-medium',
        border: 'border-emerald-800/60',
        text: 'text-emerald-400',
        scoreText: 'text-emerald-400'
      };
    }
    if (score >= 8) {
      return {
        cellBg: 'bg-yellow-950/20 text-yellow-300 font-medium',
        border: 'border-yellow-800/60',
        text: 'text-yellow-400',
        scoreText: 'text-yellow-400'
      };
    }
    if (score >= 5) {
      return {
        cellBg: 'bg-orange-950/20 text-orange-300 font-medium',
        border: 'border-orange-800/60',
        text: 'text-orange-400',
        scoreText: 'text-orange-400'
      };
    }
    return {
      cellBg: 'bg-rose-950/20 text-rose-300 font-medium',
      border: 'border-rose-800/60',
      text: 'text-rose-400',
      scoreText: 'text-rose-400'
    };
  }

  if (!value) {
    return {
      cellBg: 'bg-emerald-950/10 text-emerald-350 italic font-medium',
      border: 'border-emerald-800/40',
      text: 'text-emerald-400',
      scoreText: 'text-emerald-500'
    };
  }
  
  return isCorrect
    ? {
        cellBg: 'bg-emerald-950/20 text-emerald-300 font-bold',
        border: 'border-emerald-800/40',
        text: 'text-emerald-400',
        scoreText: 'text-emerald-400'
      }
    : {
        cellBg: 'bg-rose-950/20 text-rose-300',
        border: 'border-rose-800/40',
        text: 'text-rose-400',
        scoreText: 'text-rose-400'
      };
};

export const isHeavyHtml = (rawText) => {
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

export const healCorruptedKatexHtml = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text.replace(/\u200b/g, '');
  
  const cleanAndSplitFormula = (formula) => {
    let clean = (formula || '').trim().replace(/\\+/g, '\\');
    clean = clean.replace(/&#x27;/g, "'")
                 .replace(/&quot;/g, '"')
                 .replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&amp;/g, '&');
                 
    const parts = clean.split(/(?:<[^>]+?>)/gi);
    return parts.map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      const isMath = /[\+\-\*\/=_\\^]/.test(trimmed) && !/^[가-힣\s.,:;!]+$/.test(trimmed);
      const hasKorean = /[가-힣]/.test(trimmed);
      if (isMath && !hasKorean) {
        return ` __MATH_FORMULA_START__${trimmed}__MATH_FORMULA_END__ `;
      } else {
        return ` ${trimmed} `;
      }
    }).join(' ');
  };

  const annotationRegex = /<\s*annotation[a-z]*\b(?:[^"'>]|"[^"]*"|'[^']*')*?>([\s\S]*?)<\s*\/\s*annotation[a-z]*\s*>/gi;
  cleaned = cleaned.replace(annotationRegex, (match, formula) => {
    return cleanAndSplitFormula(formula);
  });
  
  const errorSpanRegex = /<\s*span\b(?:[^"'>]|"[^"]*"|'[^']*')*?\bclass=["'][^"']*\bkatex-error\b[^"']*["'](?:[^"'>]|"[^"]*"|'[^']*')*?>([\s\S]*?)<\s*\/\s*span\s*>/gi;
  cleaned = cleaned.replace(errorSpanRegex, (match, errContent) => {
    const titleMatch = match.match(/title=["']KaTeX error:\s*([\s\S]*?)["']/i);
    if (titleMatch && titleMatch[1]) {
      let msg = titleMatch[1];
      // Strip KaTeX error prefixes and position trailers
      msg = msg.replace(/^[\s\S]*?ParseError:\s*/i, '');
      msg = msg.replace(/^[\s\S]*?Expected\s+['"][^'"]*['"](?:,\s*got\s+['"][^'"]*['"])?\s+at\s+position\s+\d+:\s*/i, '');
      const colonIdx = msg.lastIndexOf(':');
      if (colonIdx !== -1 && colonIdx < msg.length - 1) {
        msg = msg.substring(colonIdx + 1);
      }
      msg = msg.trim();
      // Filter out orphan closing braces like } or }_ or } =
      if (/^\}[_a-zA-Z0-9]*$/.test(msg)) {
        return '';
      }
      return cleanAndSplitFormula(msg);
    }
    if (/^\}[_a-zA-Z0-9]*$/.test(errContent.trim())) {
      return '';
    }
    return errContent;
  });
  
  const katexTagsRegex = /<\s*\/?\s*(?:div|span|annotation|semantics|math|mrow|msub|msup|mfrac|msqrt|msubsup|mo|mi|mn|mtext|mspace|mstyle|mtd|mtr|mtable)[a-z]*\b(?:[^"'>]|"[^"]*"|'[^']*')*?>/gi;
  cleaned = cleaned.replace(katexTagsRegex, '');
  
  cleaned = cleaned.replace(/__MATH_FORMULA_START__([\s\S]*?)__MATH_FORMULA_END__/g, (match, formula) => {
    return ` $${formula}$ `;
  });
  
  return cleaned;
};

export const cleanCorruptedFormula = (formula) => {
  if (!formula || typeof formula !== 'string') return formula;
  
  let cleaned = formula.replace(/₩/g, '\\');
  if (cleaned.includes('color:#cc0000') || cleaned.includes('math mode at position')) {
    const match = cleaned.match(/color:#cc0000"\s*>\s*([^<]+?)\s*<\s*\/\s*span\s*>/i) ||
                  cleaned.match(/color:#cc0000"\s*&gt;\s*([^&]+?)\s*&lt;\s*\/\s*span\s*&gt;/i);
                  
    if (match) {
      let coreMath = match[1].trim().replace(/₩/g, '\\');
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

export const cleanAndSanitizeMathText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return rawText || '';
  
  let cleaned = (rawText || '').replace(/₩/g, '\\');
  cleaned = healCorruptedKatexHtml(cleaned);
  cleaned = cleanCorruptedFormula(cleaned);

  cleaned = cleaned.replace(/&amp;#gt;/gi, '>')
                   .replace(/&amp;#lt;/gi, '<')
                   .replace(/&#gt;/gi, '>')
                   .replace(/&#lt;/gi, '<');

  // ₩lt, \lt, &\lt 등 기괴하게 깨진 HTML 엔티티 및 이스케이프 부등호 기호를 표준 < 및 > 기호로 정밀 복원
  // 1. 역슬래시가 포함된 경우 (오작동 위험이 없으므로 세미콜론/경계 없이 공격적으로 매칭)
  cleaned = cleaned.replace(/&amp;\\gt;?/gi, '>')
                   .replace(/&amp;\\lt;?/gi, '<')
                   .replace(/&\\gt;?/gi, '>')
                   .replace(/&\\lt;?/gi, '<')
  // 2. 역슬래시가 없는 일반 엔티티 (URL 쿼리 파라미터 &gt=10 등과의 충돌 방지를 위해 단어 경계 \b 및 = 제외 필터링 적용)
                   .replace(/&amp;gt;/gi, '>')
                   .replace(/&amp;lt;/gi, '<')
                   .replace(/&amp;gt\b(?!=)/gi, '>')
                   .replace(/&amp;lt\b(?!=)/gi, '<')
                   .replace(/&gt;/gi, '>')
                   .replace(/&lt;/gi, '<')
                   .replace(/&gt\b(?!=)/gi, '>')
                   .replace(/&lt\b(?!=)/gi, '<')
                   .replace(/\\gt\b/gi, '>')
                   .replace(/\\lt\b/gi, '<');

  cleaned = cleaned.replace(/&amp;lt;/g, '<')
                    .replace(/&amp;gt;/g, '>')
                    .replace(/&amp;quot;/g, '"')
                    .replace(/&amp;apos;/g, "'")
                    .replace(/&apos;/g, "'")
                    .replace(/&#39;/g, "'")
                    .replace(/&#x27;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&');
   
  // Normalize inline HTML bold tags/entities (<b>, strong, &lt;b&gt;, &lt;strong&gt;) into markdown **text**
  cleaned = cleaned.replace(/(?:<b\b[^>]*>|&lt;b&gt;|<strong\b[^>]*>|&lt;strong&gt;)([\s\S]*?)(?:<\/b>|&lt;\/b&gt;|<\/strong>|&lt;\/strong&gt;)/gi, '**$1**');

  cleaned = cleaned.replace(/[–—−]/g, '-');
  
  cleaned = cleaned.replace(/\uD835\uDC58/g, 'k')
                   .replace(/\uD835\uDC8C/g, 'k')
                   .replace(/\uD835\uDCC0/g, 'k')
                   .replace(/[\uFF4B\uFF2B]/g, 'k');
  cleaned = cleaned.replace(/<[^>]+>/g, (tag) => {
    return tag.replace(/(\w)\s*-\s*(\w)/g, '$1-$2');
  });

  const katexHtmlRegex = /<(div|span)\b[^>]*?class=["'][^"']*\b(?:formula-scroll-container|katex|inline|katex-display|katex-error)\b[^"']*["'][\s\S]*?<\/\s*\1\s*>/gi;
  cleaned = cleaned.replace(katexHtmlRegex, (htmlBlock) => {
    const annotMatch = htmlBlock.match(/<annotation[^>]*?encoding=["']?application\/x-tex["']?[^>]*?>([\s\S]*?)<\/annotation>/i);
    if (annotMatch && annotMatch[1]) {
      const formula = annotMatch[1].trim().replace(/\\+/g, '\\');
      return ` $${formula}$ `;
    }
    const errMatch = htmlBlock.match(/title=["']KaTeX error:\s*([\s\S]*?)["']/i);
    if (errMatch && errMatch[1]) {
      let msg = errMatch[1].trim();
      const colonIdx = msg.lastIndexOf(':');
      if (colonIdx !== -1 && colonIdx < msg.length - 1) {
        msg = msg.substring(colonIdx + 1);
      }
      const formula = msg.trim().replace(/\\+/g, '\\');
      return ` $${formula}$ `;
    }
    return '';
  });

  const spaceCorruptedKatexRegex = /<\s*(div|span)class\b[\s\S]*?<\/\s*\1\s*>/gi;
  cleaned = cleaned.replace(spaceCorruptedKatexRegex, (htmlBlock) => {
    const annotMatch = htmlBlock.match(/<\s*annotationencoding\s*=\s*["']?application\/x-tex["']?[^>]*?>([\s\S]*?)<\/\s*annotation\s*>/i) ||
                       htmlBlock.match(/<annotation[^>]*?encoding=["']?application\/x-tex["']?[^>]*?>([\s\S]*?)<\/annotation>/i);
    if (annotMatch && annotMatch[1]) {
      const formula = annotMatch[1].trim().replace(/\\+/g, '\\');
      return ` $${formula}$ `;
    }
    return '';
  });

  cleaned = cleaned.replace(/<[^>]*?(?:katex|formula-scroll|katex-display)[^>]*>[\s\S]*?<\/\s*(?:div|span)\s*>/gi, (htmlBlock) => {
    const annotMatch = htmlBlock.match(/<\s*annotation[^>]*?encoding\s*=\s*["']?application\/x-tex["']?[^>]*?>([\s\S]*?)<\/\s*annotation\s*>/i);
    if (annotMatch && annotMatch[1]) {
      const formula = annotMatch[1].trim().replace(/\\+/g, '\\');
      return ` $${formula}$ `;
    }
    return '';
  });

  cleaned = cleaned.replace(/<\s*\/?\s*(?:div|span|annotation|semantics|math|mrow|msub|msup|mfrac|msqrt|msubsup|mo|mi|mn|mtext|mspace|mstyle|mtd|mtr|mtable)\b[^>]*>/gi, '');
  
  cleaned = healLatexFormulas(cleaned);

  cleaned = cleaned.replace(/_따라서/g, '따라서');

  cleaned = cleaned.replace(/\\\[(\s*[\s\S]*?\s*)\\\]/g, (match, math) => {
    return `$$${math}$$`;
  });

  cleaned = cleaned.replace(/\\\((\s*[\s\S]*?\s*)\\\)/g, (match, math) => {
    if (/^[가-힣\s,.!?·()]+$/.test(math)) return match;
    return `$${math}$`;
  });

  // [🚨 긴급 수정]: healLatexFormulas에서 무조건 텍스트 토큰 내의 < > 기호를 &lt; &gt;로 이스케이프하여 
  // 일반 텍스트 영역의 순수 SVG 태그(마크다운 블록이 없는)와 주석이 텍스트로 노출되는 현상 치유
  cleaned = cleaned.replace(/&lt;(\/?(?:svg|path|polyline|line|polygon|rect|circle|ellipse|g|defs|marker|clipPath|pattern|image|foreignObject|text)(?:\s+[^&]*)?\/?)&gt;/gi, '<$1>');
  cleaned = cleaned.replace(/&lt;!--([\s\S]*?)(?:--&gt;|→)/g, '<!--$1-->');

  return cleaned;
};

export const stripHtmlTagsFromRawData = (text) => {
  if (!text || typeof text !== 'string') return text || '';
  
  let clean = healCorruptedKatexHtml(text);

  clean = clean.replace(/&#x27;/g, "'")
               .replace(/&quot;/g, '"')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&amp;/g, '&');

  // [🚨 핵심] KaTeX HTML 블록 매칭 전에 en-dash/em-dash/math minus를 일반 하이픈으로 정규화
  clean = clean.replace(/[–—−]/g, '-');
  // 태그 속성 주변의 비정상적 공백 정규화 (예: "x - tex" → "x-tex", "py - 1.5" → "py-1.5")
  // HTML 태그 내부의 속성값에서만 적용 (수식 텍스트의 "1.65 - 1.2" 공백 보존)
  clean = clean.replace(/<[^>]+>/g, (tag) => {
    return tag.replace(/(\w)\s*-\s*(\w)/g, '$1-$2');
  });

  const katexHtmlRegex = /<(div|span)\b[^>]*?class=["'](?:formula-scroll-container|katex|inline|katex-display|katex-error)["'][\s\S]*?<\/\s*\1\s*>/gi;
  clean = clean.replace(katexHtmlRegex, (htmlBlock) => {
    const annotMatch = htmlBlock.match(/<annotation[^>]*?encoding=["']?application\/x-tex["']?[^>]*?>([\s\S]*?)<\/annotation>/i);
    if (annotMatch && annotMatch[1]) {
      const formula = annotMatch[1].trim().replace(/\\+/g, '\\');
      return ` $${formula}$ `;
    }
    const errMatch = htmlBlock.match(/title=["']KaTeX error:\s*([\s\S]*?)["']/i);
    if (errMatch && errMatch[1]) {
      let msg = errMatch[1].trim();
      const colonIdx = msg.lastIndexOf(':');
      if (colonIdx !== -1 && colonIdx < msg.length - 1) {
        msg = msg.substring(colonIdx + 1);
      }
      const formula = msg.trim().replace(/\\+/g, '\\');
      return ` $${formula}$ `;
    }
    return '';
  });

  // [🚨 최후 방어선] annotation 포함된 잔존 KaTeX HTML 잔해 일괄 수식 추출
  clean = clean.replace(/<[^>]*?(?:katex|formula-scroll|katex-display)[^>]*>[\s\S]*?<\/\s*(?:div|span)\s*>/gi, (htmlBlock) => {
    const annotMatch = htmlBlock.match(/<\s*annotation[^>]*?encoding\s*=\s*["']?application\/x-tex["']?[^>]*?>([\s\S]*?)<\/\s*annotation\s*>/i);
    if (annotMatch && annotMatch[1]) {
      const formula = annotMatch[1].trim().replace(/\\+/g, '\\');
      return ` $${formula}$ `;
    }
    return '';
  });

  // [🚨 태그 완전 붕괴 대응] 잔해 KaTeX/MathML 태그 단편 일괄 제거
  clean = clean.replace(/<\s*\/?\s*(?:div|span|annotation|semantics|math|mrow|msub|msup|mfrac|msqrt|msubsup|mo|mi|mn|mtext|mspace|mstyle|mtd|mtr|mtable)\b[^>]*>/gi, '');

  clean = healLatexFormulas(clean);

  clean = clean.replace(/<[^>]+>/gi, '');
  
  return clean.trim();
};

export const isOverviewReview = (q) => {
  if (!q) return false;
  return (
    (q.question && q.question.startsWith("[개요 복습]")) || 
    q.mixedType === "overview" || 
    q.subtype === "개요"
  ) && !!q.comparisonTableData;
};


