import React, { useRef, useState, useEffect } from 'react';
import { Brain } from 'lucide-react';
import { 
  convertMarkdownToHtml, 
  renderKatexString, 
  getSelectionTextWithLatex, 
  handleOpenHtmlAnswerPopup,
  buildHtmlDocument 
} from '../utils/renderingHelpers';

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
  hideTableWrapper = false 
}) {
  if (!text) return null;

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
    const delay = isTouchDevice ? 350 : 250; // Faster long-press recognition for desktop mouse clicks

    longPressTimer.current = setTimeout(() => {
      isLongPressActive.current = true;
      triggerAddFormula(katexEl);
    }, delay);
  };

  const endPress = (clientX, clientY, target) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    window.__isFormulaLongPressing = false;
    window.__isFormulaTouchActive = false;

    // If it was not a long press, but rather a simple click/touch, check if we should trigger the popup
    if (!isLongPressActive.current) {
      const dx = clientX - startPos.current.x;
      const dy = clientY - startPos.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 8) {
        const katexEl = target.closest('.katex, .katex-display');
        if (katexEl) {
          // Normal click behavior (if needed)
        }
      }
    }
  };

  const handleMouseDown = (e) => {
    // Only handle left mouse button (button 0)
    if (e.button !== 0) return;
    startPress(e.clientX, e.clientY, e.target);
  };

  const handleMouseUp = (e) => {
    if (e.button !== 0) return;
    endPress(e.clientX, e.clientY, e.target);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length > 1) return; // Ignore multi-touch
    const touch = e.touches[0];
    startPress(touch.clientX, touch.clientY, e.target);
  };

  const handleTouchEnd = (e) => {
    const touch = e.changedTouches[0] || e.touches[0];
    endPress(touch.clientX, touch.clientY, e.target);
  };

  // Convert custom bold representations and clean latex
  let cleanedText = text;
  
  // Protect block math newlines
  const mathBlockPattern = /\$\$\s*([\s\S]*?)\s*\$\$/g;
  cleanedText = cleanedText.replace(mathBlockPattern, (match, formula) => {
    const protectedFormula = formula.replace(/\n/g, ' ');
    return `$$${protectedFormula}$$`;
  });

  const isHeavy = cleanedText.includes('<!DOCTYPE') || cleanedText.includes('<html') || cleanedText.includes('class="table-quiz-container"');

  // Standard answers (isMarkdown=false) use the safe line-by-line rendering path.
  if (!isHeavy && isMarkdown) {
    cleanedText = convertMarkdownToHtml(cleanedText, true, highlightBold, formulaSource === 'tutor');
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
    
    // Auto-calculate height based on content to prevent nested scrolling inside the card
    const [iframeHeight, setIframeHeight] = useState(260);

    useEffect(() => {
      let isMounted = true;
      const handleMessage = (e) => {
        if (!isMounted) return;
        if (e.data && e.data.type === 'mathRendered') {
          setTimeout(() => {
            const iframe = iframeRef.current;
            if (iframe && iframe.contentWindow && iframe.contentWindow.document) {
              const body = iframe.contentWindow.document.body;
              if (body) {
                const scrollHeight = body.scrollHeight;
                const newHeight = Math.max(120, Math.min(1600, scrollHeight + 4));
                setIframeHeight(newHeight);
              }
            }
          }, 60);
        }
      };

      window.addEventListener('message', handleMessage);
      return () => {
        isMounted = false;
        window.removeEventListener('message', handleMessage);
      };
    }, []);

    const handleIframeLoad = () => {
      setTimeout(() => {
        const iframe = iframeRef.current;
        if (iframe && iframe.contentWindow && iframe.contentWindow.document) {
          const body = iframe.contentWindow.document.body;
          if (body) {
            const scrollHeight = body.scrollHeight;
            const newHeight = Math.max(120, Math.min(1600, scrollHeight + 4));
            setIframeHeight(newHeight);
            
            // Re-bind click event inside iframe to detect drag selections for Real-time AI Tutor
            if (isRealTimeTutor) {
              iframe.contentWindow.document.addEventListener('mouseup', () => {
                const iframeSelection = iframe.contentWindow.getSelection();
                if (iframeSelection) {
                  const selectedText = getSelectionTextWithLatex(iframeSelection);
                  if (selectedText && selectedText.trim().length > 0) {
                    if (typeof window.__handleIframeSelection === 'function') {
                      window.__handleIframeSelection(selectedText, e => {
                        const rect = iframe.getBoundingClientRect();
                        const clientX = e.clientX + rect.left;
                        const clientY = e.clientY + rect.top;
                        return { clientX, clientY };
                      });
                    }
                  }
                }
              });
            }
          }
        }
      }, 100);
    };

    const containerStyle = hideTableWrapper 
      ? { width: '100%' } 
      : { width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' };

    return (
      <div className="table-quiz-container relative my-1 py-1" style={containerStyle}>
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          onLoad={handleIframeLoad}
          className="w-full border-0 select-text overflow-hidden"
          style={{ height: `${iframeHeight}px`, display: 'block', transition: 'height 0.15s ease' }}
          scrolling="no"
          sandbox="allow-scripts allow-popups allow-same-origin"
        />
      </div>
    );
  }

  // Pure Latex line-by-line render path for standard text
  const tokens = [];
  let lastIndex = 0;
  const regex = /(\$\$.*?\$\$)|(\$[^\$\n]+?\$)/g;
  let match;

  while ((match = regex.exec(cleanedText)) !== null) {
    const before = cleanedText.substring(lastIndex, match.index);
    if (before) tokens.push({ type: 'text', content: before });
    tokens.push({
      type: match[0].startsWith('$$') ? 'block-math' : 'inline-math',
      content: match[0]
    });
    lastIndex = regex.lastIndex;
  }
  const after = cleanedText.substring(lastIndex);
  if (after) tokens.push({ type: 'text', content: after });

  return (
    <div 
      className={`select-text ${className}`} 
      onMouseDown={enableAddFormula ? handleMouseDown : undefined}
      onMouseUp={enableAddFormula ? handleMouseUp : undefined}
      onTouchStart={enableAddFormula ? handleTouchStart : undefined}
      onTouchEnd={enableAddFormula ? handleTouchEnd : undefined}
    >
      {tokens.map((token, idx) => {
        if (token.type === 'text') {
          if (isMarkdown) {
            return (
              <span 
                key={idx}
                dangerouslySetInnerHTML={{ __html: token.content }}
                className="select-text inline"
              />
            );
          } else {
            return (
              <span key={idx} className="select-text inline leading-relaxed whitespace-pre-wrap">
                {token.content}
              </span>
            );
          }
        } else {
          const displayMode = token.type === 'block-math';
          let htmlContent = '';
          try {
            htmlContent = renderKatexString(token.content, { displayMode, throwOnError: false });
          } catch (e) {
            console.warn(e);
          }

          if (displayMode) {
            return (
              <div 
                key={idx}
                className="py-1 my-1 text-[14px] sm:text-[16px] text-slate-300 leading-relaxed select-text block text-center formula-scroll-container"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            );
          } else {
            return (
              <span 
                key={idx}
                className="px-0.5 text-[14px] sm:text-[16px] text-slate-300 leading-relaxed select-text inline"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            );
          }
        }
      })}
    </div>
  );
});
