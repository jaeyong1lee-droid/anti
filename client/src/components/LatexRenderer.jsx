import React, { useRef, useState, useEffect } from 'react';
import { Brain } from 'lucide-react';
import { 
  convertMarkdownToHtml, 
  renderKatexString, 
  getSelectionTextWithLatex, 
  handleOpenHtmlAnswerPopup,
  buildHtmlDocument,
  isHeavyHtml,
  cleanAndSanitizeMathText
} from '../utils/renderingHelpers';
import { convertMarkdownTablesToHtml } from '../utils/markdownTableRenderer';
import { convertMarkdownAcronymsToHtml } from '../utils/markdownAcronymRenderer';
import { healLatexFormulas } from '../utils/latexUtils';
import ChartRenderer from './ChartRenderer';
import { parseChartJson } from '../utils/parseChartJson';

const parseAndRenderFlowchart = (flowchartText, katexLoaded, questionKey) => {
  const lines = flowchartText.split('\n');
  const items = [];
  let currentBoxes = null;

  const flushBoxes = () => {
    if (currentBoxes && currentBoxes.length > 0) {
      const validBoxes = currentBoxes.filter(b => b.content.length > 0);
      if (validBoxes.length === 1) {
        items.push(validBoxes[0]);
      } else if (validBoxes.length > 1) {
        items.push({ type: 'branch', boxes: validBoxes });
      }
      currentBoxes = null;
    }
  };

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 가로 테두리선 기호 패스
    if (trimmed.startsWith('┌') || trimmed.startsWith('└') || trimmed.startsWith('─') || trimmed.includes('───') || trimmed.includes('━━━')) {
      flushBoxes();
      continue;
    }

    // 본문 줄 (세로선 │, ┃ 또는 | 포함)
    if (line.includes('│') || line.includes('┃') || line.includes('|')) {
      const rawParts = line.split(/[│┃|]/);
      let cols = [];
      if (rawParts.length > 2) {
        cols = rawParts.slice(1, rawParts.length - 1).map(c => c.trim());
      } else if (rawParts.length === 2) {
        cols = [rawParts[0].trim(), rawParts[1].trim()].filter(Boolean);
      } else {
        cols = [line.trim()];
      }

      if (!currentBoxes) {
        currentBoxes = [];
      }
      while (currentBoxes.length < cols.length) {
        currentBoxes.push({ type: 'box', content: [] });
      }
      cols.forEach((colContent, colIdx) => {
        if (colContent && currentBoxes[colIdx]) {
          currentBoxes[colIdx].content.push(colContent);
        }
      });
    } else {
      // 연결 화살표 또는 분기 기호
      flushBoxes();
      if (trimmed === '│' || trimmed === '┃' || trimmed === '|' || trimmed === '▼' || trimmed === '↓') {
        items.push({ type: 'arrow', text: '▼' });
      } else if (trimmed.includes('┌') || trimmed.includes('┴') || trimmed.includes('┐')) {
        items.push({ type: 'arrow', text: '▼ (분기)' });
      }
    }
  }
  flushBoxes();

  // 중복 연속 화살표 제거
  const cleanItems = [];
  let lastWasArrow = false;
  items.forEach(item => {
    if (item.type === 'arrow') {
      if (!lastWasArrow) {
        cleanItems.push(item);
        lastWasArrow = true;
      }
    } else {
      cleanItems.push(item);
      lastWasArrow = false;
    }
  });

  return (
    <div className="w-full flex flex-col items-center gap-1.5 select-text my-2.5 flowchart-text-force">
      {cleanItems.map((item, idx) => {
        if (item.type === 'box') {
          const title = item.content[0] || '';
          const bodyLines = item.content.slice(1);
          const hasBoxNumber = /\[[\d\*\s가-힣a-zA-Z\-]+\]/.test(title) || /\(([A-F])\)/.test(item.content.join('\n'));
          if (!hasBoxNumber) {
            return (
              <div key={idx} className="w-full h-auto text-left leading-relaxed my-1 select-text text-[14px] sm:text-[15px] text-slate-200 whitespace-pre-wrap">
                <LatexRenderer text={item.content.join('\n')} katexLoaded={katexLoaded} enableAddFormula={true} questionKey={questionKey} />
              </div>
            );
          }
          return (
            <div key={idx} className="w-full h-auto min-h-fit border border-amber-400/70 bg-slate-900/60 p-2.5 rounded-xl text-left leading-relaxed shadow-sm flex flex-col gap-0.5 shadow-[0_0_12px_rgba(251,191,36,0.12)]">
              <div className="font-bold text-[13px] sm:text-[14px] flowchart-text-force text-amber-400 mb-0.5 w-full h-auto whitespace-pre-wrap break-all">
                <LatexRenderer text={title} katexLoaded={katexLoaded} enableAddFormula={true} questionKey={questionKey} forceInline={true} />
              </div>
              {bodyLines.map((bl, bIdx) => (
                <div key={bIdx} className="text-[13px] sm:text-[14px] flowchart-text-force text-slate-300 pl-1.5 border-l border-slate-700/50 my-0.5 w-full h-auto whitespace-pre-wrap break-all">
                  <LatexRenderer text={bl} katexLoaded={katexLoaded} enableAddFormula={true} questionKey={questionKey} forceInline={true} />
                </div>
              ))}
            </div>
          );
        } else if (item.type === 'branch') {
          return (
            <div key={idx} className="w-full flex flex-col sm:flex-row gap-3 items-stretch justify-center">
              {item.boxes.map((box, bIdx) => {
                const title = box.content[0] || '';
                const bodyLines = box.content.slice(1);
                const hasBoxNumber = /\[[\d\*\s가-힣a-zA-Z\-]+\]/.test(title) || /\(([A-F])\)/.test(box.content.join('\n'));
                if (!hasBoxNumber) {
                  return (
                    <div key={bIdx} className="flex-1 w-full h-auto font-mono whitespace-pre bg-slate-950/70 border border-slate-800/80 p-3 rounded-xl overflow-x-auto text-left leading-relaxed my-2 select-text font-mono text-[12.5px] sm:text-[13.5px] shadow-sm">
                      <div className="font-bold text-slate-200 mb-0.5 w-full h-auto whitespace-pre font-mono">
                        <LatexRenderer text={title} katexLoaded={katexLoaded} enableAddFormula={true} questionKey={questionKey} forceInline={true} />
                      </div>
                      {bodyLines.map((bl, blIdx) => (
                        <div key={blIdx} className="text-slate-300 my-0.5 w-full h-auto whitespace-pre font-mono">
                          <LatexRenderer text={bl} katexLoaded={katexLoaded} enableAddFormula={true} questionKey={questionKey} forceInline={true} />
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <div key={bIdx} className="flex-1 w-full h-auto min-h-fit border border-amber-400/70 bg-slate-900/60 p-2.5 rounded-xl text-left leading-relaxed shadow-sm flex flex-col gap-0.5 shadow-[0_0_12px_rgba(251,191,36,0.12)]">
                    <div className="font-bold text-[13px] sm:text-[14px] flowchart-text-force text-amber-400 mb-0.5 w-full h-auto whitespace-pre-wrap break-all">
                      <LatexRenderer text={title} katexLoaded={katexLoaded} enableAddFormula={true} questionKey={questionKey} forceInline={true} />
                    </div>
                    {bodyLines.map((bl, blIdx) => (
                      <div key={blIdx} className="text-[13px] sm:text-[14px] flowchart-text-force text-slate-300 pl-1.5 border-l border-slate-700/50 my-0.5 w-full h-auto whitespace-pre-wrap break-all">
                        <LatexRenderer text={bl} katexLoaded={katexLoaded} enableAddFormula={true} questionKey={questionKey} forceInline={true} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        } else {
          return (
            <div key={idx} className="text-indigo-400 font-extrabold text-[13px] sm:text-[14px] flowchart-text-force my-0.5 select-none">
              ▼
            </div>
          );
        }
      })}
    </div>
  );
};

export const LatexRenderer = React.memo(function LatexRenderer({ 
  text, 
  katexLoaded, 
  className = "", 
  enableAddFormula = false, 
  formulaSource = "main", 
  placeholderIfHeavy = false, 
  popupTitle = "", 
  isMarkdown = false, 
  highlightBold = false, 
  questionKey = "", 
  isRealTimeTutor = false, 
  hideTableWrapper = false,
  forceInline = false,
  isExplanation = false
}) {
  if (!text) return null;

  let parsedText = typeof text === 'string' 
    ? text.replace(/\\\s*\(/g, '\\(').replace(/\\\s*\)/g, '\\)').replace(/\\\(([\s\S]*?)\\\)/g, (m, p1) => '$' + p1.trim() + '$')
    : text;
  if ((forceInline || (typeof className === 'string' && className.includes('inline'))) && typeof parsedText === 'string') {
    parsedText = parsedText.replace(/\$\$/g, '$').trim();
  }

  // Option 3: Explicit code block type matching (ascii vs flowchart vs chart)
  const codeBlockRegex = /```(ascii|ascii-art|flowchart|step|sequence|chart)?\n([\s\S]*?)```/gi;
  const hasCodeBlocks = codeBlockRegex.test(parsedText);
  codeBlockRegex.lastIndex = 0;

  if (hasCodeBlocks) {
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = codeBlockRegex.exec(parsedText)) !== null) {
      const beforeText = parsedText.substring(lastIndex, match.index);
      const lang = (match[1] || '').toLowerCase().trim();
      const blockContent = match[2];

      if (beforeText) {
        parts.push({ type: 'text', content: beforeText });
      }

      // Differentiate Flowcharts vs ASCII Drawings/Graphs:
      // - Language tag is 'flowchart', 'step', 'sequence'
      // - OR contains box borders (┌, └, │, ▼) AND box numbers ([1], [2], etc.)
      const isFlowchart = lang === 'flowchart' || lang === 'step' || lang === 'sequence' || 
        (lang !== 'ascii' && lang !== 'ascii-art' && (blockContent.includes('┌') || blockContent.includes('└') || blockContent.includes('│') || blockContent.includes('▼')) &&
         /\[[\d\*\s가-힣a-zA-Z\-]+\]/.test(blockContent));

      if (isFlowchart) {
        parts.push({ type: 'flowchart', content: blockContent });
      } else if (lang === 'chart') {
        parts.push({ type: 'chart', content: blockContent });
      } else {
        parts.push({ type: 'ascii', content: blockContent });
      }
      lastIndex = codeBlockRegex.lastIndex;
    }
    const afterText = parsedText.substring(lastIndex);
    if (afterText) {
      parts.push({ type: 'text', content: afterText });
    }

    return (
      <div className={`w-full min-w-0 max-w-full space-y-2 select-text text-left ${className}`}>
        {parts.map((part, pIdx) => {
          if (part.type === 'text') {
            return (
              <LatexRenderer 
                key={pIdx} 
                text={part.content} 
                katexLoaded={katexLoaded} 
                className={className} 
                enableAddFormula={enableAddFormula} 
                formulaSource={formulaSource} 
                placeholderIfHeavy={placeholderIfHeavy} 
                popupTitle={popupTitle} 
                isMarkdown={isMarkdown} 
                highlightBold={highlightBold} 
                questionKey={questionKey} 
                isRealTimeTutor={isRealTimeTutor} 
                hideTableWrapper={hideTableWrapper} 
              />
            );
          } else if (part.type === 'chart') {
            let chartData = null;
            try {
              // Strip any extra markdown formatting or backticks the AI might have included inside the block
              const cleanJson = part.content.replace(/```json/gi, '').replace(/```/g, '').trim();
              chartData = parseChartJson(cleanJson);
            } catch (e) {
              console.error("Failed to parse chart JSON:", e);
            }
            return (
              <div key={pIdx} className="w-full">
                {chartData ? <ChartRenderer data={chartData} /> : <div className="text-rose-400 p-4 bg-rose-900/20 rounded font-bold text-sm">⚠️ 차트 데이터 파싱 오류</div>}
              </div>
            );
          } else if (part.type === 'ascii') {
            const cleanAscii = typeof part.content === 'string'
              ? part.content
                  .replace(/&lt;/gi, '<')
                  .replace(/&gt;/gi, '>')
                  .replace(/&amp;/gi, '&')
                  .replace(/&quot;/gi, '"')
                  .replace(/&#39;/gi, "'")
              : part.content;

            const renderAsciiWithKatex = (asciiText) => {
              if (!asciiText || typeof asciiText !== 'string') return asciiText;
              
              const mathRegex = /(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$)/g;
              const subParts = asciiText.split(mathRegex);

              return subParts.map((partStr, i) => {
                if (!partStr) return null;

                const isDisplayMath = partStr.startsWith('$$') && partStr.endsWith('$$') && partStr.length > 4;
                const isInlineMath = partStr.startsWith('$') && partStr.endsWith('$') && partStr.length > 2;

                if (isDisplayMath || isInlineMath) {
                  const rawMath = isDisplayMath 
                    ? partStr.slice(2, -2) 
                    : partStr.slice(1, -1);
                  
                  try {
                    const renderedHtml = renderKatexString(rawMath.trim(), {
                      displayMode: isDisplayMath,
                      throwOnError: false
                    });
                    return (
                      <span
                        key={i}
                        className="inline-block align-middle font-normal"
                        dangerouslySetInnerHTML={{ __html: renderedHtml }}
                      />
                    );
                  } catch (e) {
                    return <span key={i}>{partStr}</span>;
                  }
                }

                return <React.Fragment key={i}>{partStr}</React.Fragment>;
              });
            };

            return (
              <pre 
                key={pIdx} 
                className="w-auto max-w-full inline-block font-mono text-[12px] sm:text-[13px] overflow-x-auto whitespace-pre p-3 rounded-xl bg-slate-900/70 border border-slate-700/50 text-slate-200 leading-snug my-2 select-text font-mono"
              >
                {renderAsciiWithKatex(cleanAscii)}
              </pre>
            );
          } else {
            return (
              <div key={pIdx} className="w-full max-w-[700px] mx-auto">
                {parseAndRenderFlowchart(part.content, katexLoaded, questionKey)}
              </div>
            );
          }
        })}
      </div>
    );
  }

  const longPressTimer = useRef(null);
  const isLongPressActive = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const iframeRef = useRef(null);

  const triggerAddFormula = (katexEl) => {
    const annotation = katexEl.querySelector('annotation[encoding="application/x-tex"]');
    if (!annotation) return;
    
    const mathTex = annotation.textContent || annotation.innerText;
    if (!mathTex) return;
    
    // Clear selection to prevent drag-selection popup from showing up
    try {
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
    } catch (e) {}

    // Hide drag selection AI tutor popup
    if (typeof window.__hideSelectionPopup === 'function') {
      window.__hideSelectionPopup();
    }

    const cleanMath = mathTex.trim();
    if (typeof window.__handleFormulaConfirmRequest === 'function') {
      window.__handleFormulaConfirmRequest(cleanMath, text, formulaSource);
    }
  };

  const startPress = (clientX, clientY, target) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    isLongPressActive.current = false;
    startPos.current = { x: clientX, y: clientY };

    const katexEl = target.closest('.katex, .katex-display');
    if (!katexEl) return;

    // Set global flags indicating formula touch is active
    window.__isFormulaLongPressing = true;
    window.__isFormulaTouchActive = true;

    const isTouchDevice = !!(window.ontouchstart !== undefined && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
    const duration = isTouchDevice ? 700 : 2000;

    longPressTimer.current = setTimeout(() => {
      isLongPressActive.current = true;
      triggerAddFormula(katexEl);
      window.__isFormulaLongPressing = false;
    }, duration);
  };

  const cancelPress = (clientX, clientY, isMove = false, isTouch = false) => {
    if (isMove) {
      const dx = clientX - startPos.current.x;
      const dy = clientY - startPos.current.y;
      const dist = Math.hypot(dx, dy);
      const threshold = isTouch ? 80 : 35;
      if (dist < threshold) return;
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    window.__isFormulaLongPressing = false;

    // Keep active flag for 300ms after touch release to block asynchronous selection change popups
    setTimeout(() => {
      window.__isFormulaTouchActive = false;
    }, 300);
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    startPress(e.clientX, e.clientY, e.target);
  };

  const handleMouseMove = (e) => {
    cancelPress(e.clientX, e.clientY, true, false);
  };

  const handleMouseUpOrLeave = () => {
    cancelPress(0, 0, false, false);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    startPress(touch.clientX, touch.clientY, e.target);
  };

  const handleTouchMove = (e) => {
    const touch = e.touches[0];
    cancelPress(touch.clientX, touch.clientY, true, true);
  };

  const handleTouchEndOrCancel = () => {
    cancelPress(0, 0, false, true);
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
    onContextMenu: (e) => {
      const katexEl = e.target.closest('.katex, .katex-display');
      if (katexEl) {
        e.preventDefault();
      }
    },
  } : {};

  // 0.5) 연수공식/이론유도 내 지반단위중량 기호 y(\y) 그리크 감마(\gamma) 자가치유 규칙 탑재
  const healFormulas = (val) => {
    return healLatexFormulas(val, false, null, forceInline);
  };

  let renderText = cleanAndSanitizeMathText(parsedText);
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
      // JSON 파싱 실패 시 기본 그대로 사용
    }
  }

  const isHeavy = isHeavyHtml(renderText) && !isRealTimeTutor && formulaSource !== 'tutor';

  // Manage iframe resize event listener and message listener cleanly
  useEffect(() => {
    if (!isHeavy) return;

    const handleMessage = (event) => {
      if (event.data && event.data.type === 'mathRendered') {
        const iframe = iframeRef.current;
        if (iframe && iframe.contentWindow === event.source) {
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
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isHeavy, text]);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.__restoreAllTableColumnWidths === 'function') {
      window.__restoreAllTableColumnWidths(document);
      const timer = setTimeout(() => {
        if (window.__restoreAllTableColumnWidths) {
          window.__restoreAllTableColumnWidths(document);
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [text, katexLoaded, isMarkdown]);

  let processedText = renderText;

  // 1) 불필요한 연속 개행을 최소 2개로 압축하여 컴팩트하게 정리
  let cleanedText = processedText;
  if (typeof cleanedText === 'string') {
    cleanedText = cleanedText.replace(/\r\n/g, '\n');
  }

  cleanedText = healFormulas(cleanedText);
  if (typeof cleanedText === 'string') {
    // Convert <b> / <strong> HTML tags & entities into markdown bold (**text**)
    cleanedText = cleanedText.replace(/(?:<b\b[^>]*>|&lt;b&gt;|<strong\b[^>]*>|&lt;strong&gt;)([\s\S]*?)(?:<\/b>|&lt;\/b&gt;|<\/strong>|&lt;\/strong&gt;)/gi, '**$1**');
    // Collapse empty lines between colon-ended lines and list items
    cleanedText = cleanedText.replace(/(:[ \t]*)\n\n+(\s*(?:\d+\.(?!\d)|\d+\)|[a-zA-Z가-힣]\)|\*|-|•|[①-⑳]))/g, '$1\n$2');

    cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').trim();
  }

  if (typeof cleanedText === 'string') {
    cleanedText = preprocessMarkdownTables(cleanedText);
    const isMixedReview = !!window.__isMixedReviewActive;
    const shouldHideRemarks = isMixedReview || (formulaSource === 'tutor' && !hideTableWrapper);
    cleanedText = convertMarkdownTablesToHtml(cleanedText, hideTableWrapper, shouldHideRemarks);
    cleanedText = convertMarkdownAcronymsToHtml(cleanedText);
  }

  // Tutor panels (isMarkdown=true) use rich markdown-to-HTML conversion.
  // Standard answers (isMarkdown=false) use the safe line-by-line rendering path.
  if (!isHeavy && isMarkdown) {
    cleanedText = convertMarkdownToHtml(cleanedText, true, highlightBold, formulaSource === 'tutor', isExplanation);
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
          ref={iframeRef}
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

            const intervals = [100, 300, 600, 1000, 2000, 4000];
            intervals.forEach((delay) => {
              setTimeout(adjustHeight, delay);
            });

            // Listen for selection inside iframe
            try {
              const doc = iframe.contentWindow?.document;
              if (doc) {
                let iframeSelectionTimeout = null;
                const handleIframeSelection = () => {
                  if (iframeSelectionTimeout) clearTimeout(iframeSelectionTimeout);
                  iframeSelectionTimeout = setTimeout(() => {
                    const iframeSelection = iframe.contentWindow?.getSelection();
                    if (!iframeSelection) return;
                    const selectedText = getSelectionTextWithLatex(iframeSelection);
                    
                    // Ignore selections in input fields, textareas, etc.
                    const activeEl = doc.activeElement;
                    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                      return;
                    }

                    if (!selectedText) {
                      const closeEvent = new CustomEvent('anti-selection-close');
                      window.parent.dispatchEvent(closeEvent);
                      return;
                    }
                    
                    try {
                      const range = iframeSelection.getRangeAt(0);
                      const rect = range.getBoundingClientRect();
                      const iframeRect = iframe.getBoundingClientRect();
                      
                      const changeEvent = new CustomEvent('anti-selection-change', {
                        detail: {
                          text: selectedText,
                          x: iframeRect.left + rect.left + rect.width / 2,
                          y: iframeRect.top + rect.bottom + 8,
                          questionKey: questionKey,
                          isRealTimeTutor: isRealTimeTutor
                        }
                      });
                      window.parent.dispatchEvent(changeEvent);
                    } catch (err) {}
                  }, 400); // 400ms debounce
                };

                doc.addEventListener('selectionchange', handleIframeSelection);
              }
            } catch (err) {
              console.warn('Failed to bind iframe selection events:', err);
            }
          }}
          title="Interactive Simulator Drawing"
        />
      </div>
    );
  }



  // Check if text contains HTML tags
  // We use (?:\s+[^>]*)?\/?> instead of \b[^>]*> to prevent matching <p, q> (where p is followed by comma)
  const hasHtml = /<\/?(div|table|tr|td|th|tbody|thead|tfoot|p|span|br|hr|strong|em|ul|ol|li|h[1-6]|b|i|a|img|code|pre|style|html|body|button|svg|path|polyline|line|polygon|rect|circle|foreignObject|text|g|defs|marker|clipPath|pattern|ellipse|image)(?:\s+[^>]*)?\/?>/i.test(cleanedText);

  if (hasHtml) {
    let htmlContent = cleanedText;
    
    // Protect non-HTML tags like <p, q> or <모어원> from being swallowed
    htmlContent = htmlContent.replace(/<([a-zA-Z가-힣][^>]*)>/g, (match, content) => {
      const tagMatch = match.match(/^<\/?(div|table|tr|td|th|tbody|thead|tfoot|p|span|br|hr|strong|em|ul|ol|li|h[1-6]|b|i|a|img|code|pre|style|html|body|button|svg|path|polyline|line|polygon|rect|circle|foreignObject|text|g|defs|marker|clipPath|pattern|ellipse|image)(?:\s|>|\/>)/i);
      if (tagMatch) return match;
      return `&lt;${content}>`;
    });
    if (window.katex) {
      const isInline = className.includes('inline');
      htmlContent = htmlContent.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (m, math) => {
        if (isInline) {
          const rendered = renderKatexString(math.trim(), { displayMode: false, throwOnError: false });
          return `<span class="inline bg-transparent select-text">${rendered}</span>`;
        }
        const rendered = renderKatexString(math.trim(), { displayMode: true, throwOnError: false });
        return `<div class="formula-scroll-container py-1.5" style="text-align: center; margin-top: 0.5rem; margin-bottom: 0.5rem; width: 100%;">${rendered}</div>`;
      });
      htmlContent = htmlContent.replace(/\$((?:[^\$\n<]|<(?![a-zA-Z/!]))+?)\$/g, (m, math) => {
        const trimmed = math.trim();
        if (!trimmed) return m;
        return renderKatexString(trimmed, { displayMode: false, throwOnError: false });
      });
      // [Self-Healing] Clean up remnant $$ symbols appearing before plain text
      htmlContent = htmlContent.replace(/(?:^|\n)\s*\$\$\s*(?=\n|[가-힣a-zA-Z])/g, '\n');
    }

    const isInlineMode = className.includes('inline') && !htmlContent.includes('<table') && !htmlContent.includes('<div');
    if (isInlineMode) {
      return (
        <span 
          className={`${className} select-text whitespace-pre-wrap ${enableAddFormula ? 'enable-add-formula' : ''}`}
          {...eventHandlers}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      );
    }
    return (
      <div 
        className={`${className} select-text w-full whitespace-pre-wrap ${enableAddFormula ? 'enable-add-formula' : ''}`}
        {...eventHandlers}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    );
  }

  if (!window.katex) {
    return <div className={`${className} whitespace-pre-line leading-relaxed select-text`}>{cleanedText}</div>;
  }

  // Split by block math $$ ... $$
  const parts = [];
  let lastIndex = 0;
  // 방화벽(Block Boundary Firewall) 적용: $$ 수식이 HTML 구조 태그(svg, div, table 등)를 침범/집어삼키지 못하도록 차단
  const blockRegex = /\$\$((?:(?!<\/?(?:div|svg|foreignObject|table|tr|td|th|p|pre|blockquote|ul|ol|li)\b)[\s\S])*?)\$\$/g;
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

  const isInline = className.includes('inline');

  if (isInline) {
    return (
      <span 
        className={`${className} select-text ${enableAddFormula ? 'enable-add-formula' : ''}`}
        {...eventHandlers}
      >
        {parts.map((part, idx) => {
          if (part.type === 'math-block') {
            const mathHtml = renderKatexString(part.content, { displayMode: false, throwOnError: false });
            return (
              <span 
                key={idx} 
                className="inline bg-transparent select-text"
                dangerouslySetInnerHTML={{ __html: mathHtml }} 
              />
            );
          } else {
            let htmlContent = part.content;
            htmlContent = htmlContent.replace(/<([a-zA-Z가-힣])/g, '&lt;$1');
            try {
              htmlContent = htmlContent.replace(/\$((?:[^\$\n<]|<(?![a-zA-Z/!]))+?)\$/g, (m, math) => {
                if (/[\uAC00-\uD7A3]/.test(math)) {
                  const isRealFormula = /\\/.test(math) || /_/.test(math) || /\^/.test(math) || /[=+\-\*\/]/.test(math) || /\\cdot/.test(math);
                  if (!isRealFormula) return m;
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
              {/* KaTeX 공식 */}
              <div 
                className="formula-scroll-container w-full py-1.5 min-w-0 select-text text-center" 
                onTouchStart={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                onTouchMove={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                onTouchEnd={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                onTouchCancel={(e) => { if (!enableAddFormula) e.stopPropagation(); }}
                dangerouslySetInnerHTML={{ __html: mathHtml }} 
              />
            </div>
          );
        } else {
          let htmlContent = part.content;
          htmlContent = htmlContent.replace(/<([a-zA-Z가-힣])/g, '&lt;$1');
          try {
            htmlContent = htmlContent.replace(/\$((?:[^\$\n<]|<(?![a-zA-Z/!]))+?)\$/g, (m, math) => {
              if (/[\uAC00-\uD7A3]/.test(math) && !/\\/.test(math) && !/_/.test(math) && !/\^/.test(math) && !/[=+\-\*\/]/.test(math) && !/\\cdot/.test(math)) {
                return m;
              }
              return renderKatexString(math.trim(), { displayMode: false, throwOnError: false });
            });
          } catch (e) {
            console.warn(e);
          }
          return (
            <div 
              key={idx}
              className="py-0.5 text-[14px] sm:text-[16px] text-slate-300 leading-relaxed whitespace-pre-wrap select-text block"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          );
        }
      })}
    </div>
  );
});

function preprocessMarkdownTables(text) {
  if (!text || typeof text !== 'string') return text;

  const lines = text.split('\n');
  const resultLines = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if table start
    if (trimmed.startsWith('|') && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const isNextSeparator = nextLine.startsWith('|') && 
                              nextLine.includes('-') && 
                              /^[|:\s\-]+$/.test(nextLine);

      if (isNextSeparator) {
        // We found a table!
        // First, count the number of pipes in the header or separator to determine columns.
        const headerPipes = (line.match(/\|/g) || []).length;
        const separatorPipes = (nextLine.match(/\|/g) || []).length;
        const targetPipes = Math.max(headerPipes, separatorPipes);

        resultLines.push(line);       // Push header
        resultLines.push(nextLine);   // Push separator
        i += 2;

        let accumulatedRowText = '';
        let currentPipesCount = 0;

        while (i < lines.length) {
          const curLine = lines[i];
          const curTrimmed = curLine.trim();

          // If we encounter a completely empty line or a line starting with a heading/divider that is clearly not part of the table
          if (curTrimmed === '' && currentPipesCount === 0) {
            break;
          }
          if (curTrimmed.startsWith('---') || curTrimmed.startsWith('###') || curTrimmed.startsWith('1.') || curTrimmed.startsWith('2.') || curTrimmed.startsWith('3.')) {
            break;
          }

          // Count pipes in this line
          const linePipes = (curLine.match(/\|/g) || []).length;
          const isNewRow = curTrimmed.startsWith('|');

          if (accumulatedRowText !== '' && isNewRow) {
            // Force push the previous row because we hit a new row, even if it lacked pipes
            resultLines.push(accumulatedRowText);
            accumulatedRowText = '';
            currentPipesCount = 0;
          }
          
          if (accumulatedRowText === '') {
            accumulatedRowText = curLine;
          } else {
            // Join cell continuation with <br>
            const prevTrimmed = accumulatedRowText.trim();
            if (prevTrimmed.endsWith('|')) {
              accumulatedRowText += ' ' + curLine;
            } else {
              accumulatedRowText += '<br>' + curLine;
            }
          }
          currentPipesCount += linePipes;

          // If we have accumulated the target number of pipes (or more), this row is complete
          if (currentPipesCount >= targetPipes) {
            resultLines.push(accumulatedRowText);
            accumulatedRowText = '';
            currentPipesCount = 0;
          }

          i++;
        }

        // Push any remaining accumulated row text if the table ended abruptly
        if (accumulatedRowText.trim() !== '') {
          resultLines.push(accumulatedRowText);
        }

        continue;
      }
    }

    resultLines.push(line);
    i++;
  }

  return resultLines.join('\n');
}
