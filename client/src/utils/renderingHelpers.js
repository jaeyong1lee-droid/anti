// ============================================================================
// Markdown, KaTeX LaTeX, and HTML Iframe Rendering Helper Utilities
// ============================================================================
import { healLatexFormulas } from './latexUtils';


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
    alert("팝업 차단기가 활성화되어 있어 팝업창을 열 수 없습니다. 브라우저 설정에서 이 사이트의 팝업을 허용해 주세요.");
  }
};

export function convertMarkdownToHtml(mdText, isMarkdown = false, highlightBold = false, isTutor = false) {
  const mathBlocks = [];
  let placeholderIndex = 0;
  
  // Protect HTML table blocks generated by convertMarkdownTablesToHtml to prevent markdown rules from corrupting styles
  const tableBlocks = [];
  let tempText = mdText || '';

  // Protect and convert markdown code blocks (``` ... ```) to styled pre/code blocks
  const codeBlocks = [];
  let codeBlockIndex = 0;
  tempText = tempText.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
    const placeholder = `___CODE_BLOCK_${codeBlockIndex}___`;
    const styledHtml = `<pre class="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 overflow-x-auto my-3 font-mono text-xs text-slate-300 leading-relaxed select-text" style="white-space: pre; font-family: monospace;">${code}</pre>`;
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

  // Normalize Windows line endings
  tempText = tempText.replace(/\r\n/g, '\n');

  // Protect $$ ... $$
  tempText = tempText.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (match) => {
    const placeholder = `___BLOCK_MATH_${placeholderIndex}___`;
    mathBlocks.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });

  // Protect $ ... $
  tempText = tempText.replace(/\$((?:[^\$\n<]|<(?![a-zA-Z/!]))+?)\$/g, (match, math) => {
    const isReal = !/[\uAC00-\uD7A3]/.test(math) || /\\/.test(math) || /_/.test(math) || /\^/.test(math) || /[=+\-\*\/]/.test(math) || /\\cdot/.test(math);
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
  tempText = tempText.replace(/\n+(___BLOCK_MATH_\d+___)\n+/g, '\n$1\n');

  // Headings on same line
  tempText = tempText.replace(/([^\n])\s*(#{2,6}\s+)/g, '$1\n\n$2');

  // Bold text
  if (isTutor) {
    tempText = tempText.replace(/\*\*([^\*]+?)\*\*/g, `<span style="color: #fbbf24; font-weight: normal;">$1</span>`);
    tempText = tempText.replace(/'([^'\n]+?)'/g, `<span style="color: #fbbf24; font-weight: normal;">'$1'</span>`);
  } else {
    const boldColor = (isMarkdown && highlightBold) ? '#fbbf24' : '#f1f5f9';
    tempText = tempText.replace(/\*\*([^\*]+?)\*\*/g, `<strong style="color: ${boldColor}; font-weight: 700;">$1</strong>`);
    if (isMarkdown && highlightBold) {
      tempText = tempText.replace(/'([^'\n]+?)'/g, `<span style="color: #fbbf24; font-weight: normal;">'$1'</span>`);
    }
  }

  tempText = tempText.replace(/([^\n])[ \t]*(?:\* * \*|\*\*\*)[ \t]*/g, '$1\n* * * ');

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

  // Render dividers
  tempText = tempText.replace(/^[ \t]*(?:\*\*\*|\* \* \*|---|---|===)[ \t]*$/gm, '<hr style="border: 0; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 0 0 1.0rem 0;" />');

  // Render list items
  const lines = tempText.split('\n');
  const renderedLines = [];
  let currentListBlock = null;
  const listMarkerRegex = /^(?:[ \t]*(?:\*|-|•)[ \t]+|(\d+)\.\s+|(\d+\))\s*|([a-zA-Z가-힣]\))\s*|([①-⑳])\s*)/;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const match = line.match(listMarkerRegex);

    if (match) {
      if (currentListBlock) {
        renderedLines.push(currentListBlock.outerStyleStart + currentListBlock.content.join('\n') + '</div>');
      }
      const isBullet = line.trim().startsWith('*') || line.trim().startsWith('-') || line.trim().startsWith('•');
      let displayMarker = '';
      if (isBullet) {
        displayMarker = '• ';
      }
      
      const contentWithoutMarker = line.replace(listMarkerRegex, '');
      const marginVal = isMarkdown ? '0.5rem' : '0.2rem';
      const paddingVal = isMarkdown ? '1.25rem' : '1rem';
      const lineHi = isMarkdown ? '1.6' : '1.5';
      
      currentListBlock = {
        outerStyleStart: `<div style="margin-top: ${marginVal}; margin-bottom: ${marginVal}; padding-left: ${paddingVal}; text-indent: -${paddingVal}; color: #ffffff; line-height: ${lineHi};">`,
        content: [displayMarker + contentWithoutMarker]
      };
    } else if (line.trim() === '' || /^___(?:BLOCK|INLINE)_MATH_\d+___$/.test(line.trim())) {
      const isMathPlaceholder = /^___(?:BLOCK|INLINE)_MATH_\d+___$/.test(line.trim());
      if (isMathPlaceholder && currentListBlock) {
        currentListBlock.content.push(line);
      } else {
        if (currentListBlock) {
          renderedLines.push(currentListBlock.outerStyleStart + currentListBlock.content.join('\n') + '</div>');
          currentListBlock = null;
        }
        renderedLines.push(isMathPlaceholder ? line : '');
      }
    } else {
      if (currentListBlock) {
        currentListBlock.content.push(line);
      } else {
        renderedLines.push(line);
      }
    }
  }

  if (currentListBlock) {
    renderedLines.push(currentListBlock.outerStyleStart + currentListBlock.content.join('\n') + '</div>');
  }
  tempText = renderedLines.join('\n');

  if (isMarkdown) {
    tempText = tempText.replace(/\n\n/g, '<div style="height: 1.2rem;"></div>');
    tempText = tempText.replace(/\n/g, '<br/>');
  } else {
    tempText = tempText.replace(/\n\n/g, '<div style="height: 0.6rem;"></div>');
    tempText = tempText.replace(/\n/g, '<br/>');
  }

  tempText = tempText.replace(/(?:<br\/>|<div style="height: [^"]*"><\/div>)*\s*(___BLOCK_MATH_\d+___)\s*(?:<br\/>|<div style="height: [^"]*"><\/div>)*/g, '$1');
  tempText = tempText.replace(/(?:<br\/>|<div style="height: [^"]*"><\/div>)+(<div style="[^"]*padding-left:[^"]*")/g, '$1');
  tempText = tempText.replace(/(<\/div>)(?:<br\/>|<div style="height: [^"]*"><\/div>)+(<div style="[^"]*padding-left:[^"]*")/g, '$1$2');
  tempText = tempText.replace(/(?:<br\/>|<div style="height: [^"]*"><\/div>)+\s*(<hr\b[^>]*>)/g, '$1');

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

  // Clean placeholders
  tempText = tempText.replace(/___(BLOCK|INLINE)_MATH_\d+___/g, '');
  tempText = tempText.replace(/___HTML_TABLE_\d+___/g, '');
  tempText = tempText.replace(/___CODE_BLOCK_\d+___/g, '');

  return tempText;
}

export const renderKatexString = (math, options) => {
  if (!math) return '';

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

  let cleaned = processedMath.trim();
  if (cleaned.startsWith('$$') && cleaned.endsWith('$$')) {
    cleaned = cleaned.substring(2, cleaned.length - 2).trim();
  } else if (cleaned.startsWith('$') && cleaned.endsWith('$')) {
    cleaned = cleaned.substring(1, cleaned.length - 1).trim();
  }
  cleaned = cleaned.replace(/^\$|\$/g, '').trim();
  processedMath = cleaned;

  if (window.katex) {
    try {
      return window.katex.renderToString(processedMath, { ...options, throwOnError: true, strict: 'ignore' }).replace(/\n/g, ' ');
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
      const colonIdx = msg.lastIndexOf(':');
      if (colonIdx !== -1 && colonIdx < msg.length - 1) {
        msg = msg.substring(colonIdx + 1);
      }
      return cleanAndSplitFormula(msg);
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

export const cleanAndSanitizeMathText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return rawText || '';
  
  let cleaned = healCorruptedKatexHtml(rawText);
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


