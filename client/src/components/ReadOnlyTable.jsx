import React, { useRef, useState, useEffect, useCallback } from 'react';
import { LatexRenderer } from './LatexRenderer';
import { areCellsEqual } from '../utils/renderingHelpers';

export const ReadOnlyTable = React.memo(function ReadOnlyTable({ 
  tableData, 
  katexLoaded, 
  questionIdx = null 
}) {
  if (!tableData || !tableData.headers || !tableData.rows) return null;
  const { headers, rows } = tableData;
  const colCount = headers.length;

  const [colWidths, setColWidths] = useState(() => {
    if (colCount <= 1) return ['100%'];
    if (colCount === 2) return [60, 40];
    if (colCount === 3) return [40, 30, 30];
    const first = 30;
    const others = (100 - first) / (colCount - 1);
    return [first, ...Array(colCount - 1).fill(others)];
  });

  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handleMobileViewResize = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener('resize', handleMobileViewResize);
    return () => window.removeEventListener('resize', handleMobileViewResize);
  }, []);

  const [mobileColWidths, setMobileColWidths] = useState(() => {
    const widths = [];
    const storageKeyFirst = `mobileFirstColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}`;
    const savedFirst = typeof window !== 'undefined' ? localStorage.getItem(storageKeyFirst) : null;
    widths.push(savedFirst || '120px');
    
    for (let i = 1; i < colCount; i++) {
      const storageKeyOther = `mobileColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}_${i}`;
      const savedOther = typeof window !== 'undefined' ? localStorage.getItem(storageKeyOther) : null;
      widths.push(savedOther || '140px');
    }
    return widths;
  });

  useEffect(() => {
    setMobileColWidths(prev => {
      if (prev.length === colCount) return prev;
      const next = [...prev];
      if (next.length < colCount) {
        for (let i = next.length; i < colCount; i++) {
          const storageKeyOther = `mobileColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}_${i}`;
          const savedOther = typeof window !== 'undefined' ? localStorage.getItem(storageKeyOther) : null;
          next.push(savedOther || '140px');
        }
      } else {
        next.splice(colCount);
      }
      return next;
    });
  }, [colCount, questionIdx]);

  useEffect(() => {
    const handleWidthChange = (e) => {
      const targetIdx = e.detail?.questionIdx;
      if (targetIdx === questionIdx) {
        setMobileColWidths(prev => {
          if (prev[0] === e.detail.width) return prev;
          const next = [...prev];
          next[0] = e.detail.width;
          return next;
        });
      }
    };
    window.addEventListener('firstColWidthChanged', handleWidthChange);
    return () => window.removeEventListener('firstColWidthChanged', handleWidthChange);
  }, [questionIdx]);

  const resetMobileColWidths = useCallback(() => {
    const defaultFirst = '120px';
    const storageKeyFirst = `mobileFirstColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}`;
    localStorage.removeItem(storageKeyFirst);
    
    for (let i = 1; i < colCount; i++) {
      const storageKeyOther = `mobileColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}_${i}`;
      localStorage.removeItem(storageKeyOther);
    }
    
    setMobileColWidths(prev => {
      const next = [defaultFirst];
      for (let i = 1; i < colCount; i++) {
        next.push('140px');
      }
      return next;
    });

    window.dispatchEvent(new CustomEvent('firstColWidthChanged', {
      detail: { questionIdx, width: defaultFirst }
    }));
  }, [questionIdx, colCount]);

  const lastTapRef = useRef(0);
  const handleHeaderClick = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      resetMobileColWidths();
    }
    lastTapRef.current = now;
  }, [resetMobileColWidths]);

  const tableRef = useRef(null);

  const startColumnResize = useCallback((e, idx, isTouch) => {
    if (isTouch) {
      if (e.cancelable) e.preventDefault();
    } else {
      e.preventDefault();
    }
    if (!tableRef.current) return;

    const thElements = tableRef.current.querySelectorAll('th');
    const widths = Array.from(thElements).map(th => th.getBoundingClientRect().width);
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    const percentWidths = widths.map(w => (w / totalWidth) * 100);
    const firstColStartWidth = thElements[0] ? thElements[0].getBoundingClientRect().width : 120;
    const targetColStartWidth = thElements[idx] ? thElements[idx].getBoundingClientRect().width : 140;

    const container = tableRef.current.closest('.table-quiz-container');
    const startScrollLeft = container ? container.scrollLeft : 0;
    const startX = isTouch ? e.touches[0].clientX : e.clientX;

    if (isTouch && container) {
      container.scrollLeft = startScrollLeft;
      container.style.overflowX = 'hidden';
    }

    const doResize = (ev) => {
      if (isTouch && ev.cancelable) {
        ev.preventDefault();
      }
      const currentX = isTouch ? ev.touches[0].clientX : ev.clientX;
      const deltaX = currentX - startX;

      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        const newWidth = Math.max(idx === 0 ? 50 : 60, targetColStartWidth + deltaX);
        
        setMobileColWidths(prev => {
          const next = [...prev];
          if (idx === 0) {
            next[0] = `${newWidth}px`;
            const storageKey = `mobileFirstColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}`;
            localStorage.setItem(storageKey, `${newWidth}px`);
            window.dispatchEvent(new CustomEvent('firstColWidthChanged', {
              detail: { questionIdx, width: `${newWidth}px` }
            }));
          } else {
            for (let i = 1; i < colCount; i++) {
              next[i] = `${newWidth}px`;
              const storageKey = `mobileColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}_${i}`;
              localStorage.setItem(storageKey, `${newWidth}px`);
            }
          }
          return next;
        });
      } else {
        const deltaPercent = (deltaX / totalWidth) * 100;
        setColWidths(prev => {
          const next = [...prev];
          const sum = percentWidths[idx] + percentWidths[idx + 1];
          const newLeftWidth = Math.max(10, percentWidths[idx] + deltaPercent);
          const actualLeft = Math.min(sum - 10, newLeftWidth);
          const actualRight = sum - actualLeft;

          next[idx] = actualLeft;
          next[idx + 1] = actualRight;
          return next;
        });
      }
    };

    const stopResize = () => {
      if (isTouch && container) {
        container.style.overflowX = '';
      }
      if (isTouch) {
        window.removeEventListener('touchmove', doResize);
        window.removeEventListener('touchend', stopResize);
      } else {
        window.removeEventListener('mousemove', doResize);
        window.removeEventListener('mouseup', stopResize);
      }
    };

    if (isTouch) {
      window.addEventListener('touchmove', doResize, { passive: false });
      window.addEventListener('touchend', stopResize);
    } else {
      window.addEventListener('mousemove', doResize);
      window.addEventListener('mouseup', stopResize);
    }
  }, [questionIdx]);

  return (
    <div 
      className="table-quiz-container w-full my-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40"
      style={mobileColWidths.reduce((acc, w, i) => {
        acc[`--col-width-${i}`] = w;
        return acc;
      }, {})}
    >
      <table 
        ref={tableRef} 
        className={`table-quiz-table w-full table-fixed text-center border-collapse text-[14px] sm:text-[16px] ${
          colCount === 2 ? 'min-w-[320px] sm:min-w-[600px]' : 'min-w-[480px] sm:min-w-[700px]'
        }`}
        style={isMobileView ? {
          '--table-width': colCount === 2 ? '100%' : `max(100%, ${mobileColWidths.reduce((sum, w) => sum + parseInt(w || '0', 10), 0)}px)`,
          minWidth: '0px'
        } : undefined}
      >
        <colgroup>
          {colWidths.map((w, idx) => (
            <col 
              key={idx} 
              className={idx === 0 ? "table-quiz-col-first" : ""} 
              style={{ 
                width: isMobileView
                  ? (idx === colCount - 1
                      ? 'auto'
                      : (mobileColWidths[idx] || (typeof w === 'number' ? `${w}%` : w)))
                  : (typeof w === 'number' ? `${w}%` : w)
              }} 
            />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-slate-900/80 text-slate-355 border-b border-slate-800">
            {headers.map((header, hIdx) => {
              const isFirstCol = hIdx === 0;
              return (
                <th 
                  key={hIdx} 
                  className={`relative p-1 sm:p-1.5 font-extrabold border-r border-slate-800 last:border-r-0 select-text ${
                    isFirstCol ? 'text-left break-all cursor-pointer' : ''
                  }`}
                  onClick={isFirstCol ? handleHeaderClick : undefined}
                  title={isFirstCol ? "더블클릭 시 너비 초기화" : undefined}
                >
                  <LatexRenderer text={header} katexLoaded={katexLoaded} className="inline" />
                  {hIdx < colCount - 1 && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-4 sm:w-2 cursor-col-resize select-none z-10 hover:bg-sky-500/30 active:bg-sky-500/50 touch-none"
                      onMouseDown={(e) => startColumnResize(e, hIdx, false)}
                      onTouchStart={(e) => startColumnResize(e, hIdx, true)}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => {
            const canMerge = colCount > 2 && 
                             row.slice(1).every(cellVal => areCellsEqual(row[1], cellVal));

            return (
              <tr key={rIdx} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/20">
                {row.map((cell, cIdx) => {
                  if (canMerge && cIdx > 1) return null;
                  const isFirstCol = cIdx === 0;
                  const cellColSpan = (canMerge && cIdx === 1) ? colCount - 1 : 1;
                  return (
                    <td 
                      key={cIdx} 
                      colSpan={cellColSpan}
                      className={`p-1 sm:p-1.5 border-r border-slate-800 last:border-r-0 text-slate-355 text-[14px] sm:text-[16px] select-text ${
                        isFirstCol ? 'text-left break-all' : 'text-center'
                      }`}
                    >
                      <LatexRenderer text={cell} katexLoaded={katexLoaded} className="inline" />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
