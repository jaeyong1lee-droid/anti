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
    const saved = typeof window !== 'undefined' ? localStorage.getItem(`anti_global_desktop_col_widths_${colCount}`) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === colCount) return parsed;
      } catch (e) {}
    }
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
    const isPopout = typeof window !== 'undefined' && (window.name === 'anti_popout_window' || window.name?.includes('popout') || window.opener !== null);
    const saved = typeof window !== 'undefined' ? localStorage.getItem(`anti_global_mobile_col_widths_${colCount}`) : null;
    if (saved && !isPopout) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === colCount) {
          const hasPx = parsed.some(w => typeof w === 'string' && w.includes('px'));
          if (hasPx) {
            const nums = parsed.map(w => parseFloat(w) || (100 / colCount));
            const sum = nums.reduce((a, b) => a + b, 0);
            if (sum > 0) return nums.map(n => `${((n / sum) * 100).toFixed(1)}%`);
          }
          return parsed;
        }
      } catch (e) {}
    }
    const widths = [];
    if (colCount <= 1) {
      widths.push('100%');
    } else if (colCount === 2) {
      widths.push('45%', '55%');
    } else if (colCount === 3) {
      widths.push('40%', '30%', '30%');
    } else {
      const first = 30;
      const others = (100 - first) / (colCount - 1);
      widths.push(`${first}%`);
      for (let i = 1; i < colCount; i++) {
        widths.push(`${others.toFixed(1)}%`);
      }
    }
    return widths;
  });

  useEffect(() => {
    setMobileColWidths(prev => {
      if (prev.length === colCount) return prev;
      const saved = typeof window !== 'undefined' ? localStorage.getItem(`anti_global_mobile_col_widths_${colCount}`) : null;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === colCount) return parsed;
        } catch (e) {}
      }
      const next = [...prev];
      if (next.length < colCount) {
        for (let i = next.length; i < colCount; i++) {
          next.push('140px');
        }
      } else {
        next.splice(colCount);
      }
      return next;
    });
  }, [colCount]);

  useEffect(() => {
    const handleGlobalMobileWidthChange = (e) => {
      if (e.detail?.colCount === colCount && e.detail?.widths) {
        setMobileColWidths(e.detail.widths);
      }
    };
    const handleGlobalDesktopWidthChange = (e) => {
      if (e.detail?.colCount === colCount && e.detail?.widths) {
        setColWidths(e.detail.widths);
      }
    };
    window.addEventListener('globalMobileTableWidthChanged', handleGlobalMobileWidthChange);
    window.addEventListener('globalDesktopTableWidthChanged', handleGlobalDesktopWidthChange);
    return () => {
      window.removeEventListener('globalMobileTableWidthChanged', handleGlobalMobileWidthChange);
      window.removeEventListener('globalDesktopTableWidthChanged', handleGlobalDesktopWidthChange);
    };
  }, [colCount]);

  const resetMobileColWidths = useCallback(() => {
    localStorage.removeItem(`anti_global_mobile_col_widths_${colCount}`);
    localStorage.removeItem(`anti_global_desktop_col_widths_${colCount}`);
    
    const nextMobile = [];
    if (colCount <= 1) {
      nextMobile.push('100%');
    } else if (colCount === 2) {
      nextMobile.push('45%', '55%');
    } else if (colCount === 3) {
      nextMobile.push('40%', '30%', '30%');
    } else {
      const first = 30;
      const others = (100 - first) / (colCount - 1);
      nextMobile.push(`${first}%`);
      for (let i = 1; i < colCount; i++) {
        nextMobile.push(`${others}%`);
      }
    }
    setMobileColWidths(nextMobile);

    let nextDesktop;
    if (colCount <= 1) nextDesktop = ['100%'];
    else if (colCount === 2) nextDesktop = [60, 40];
    else if (colCount === 3) nextDesktop = [40, 30, 30];
    else {
      const first = 30;
      const others = (100 - first) / (colCount - 1);
      nextDesktop = [first, ...Array(colCount - 1).fill(others)];
    }
    setColWidths(nextDesktop);

    window.dispatchEvent(new CustomEvent('globalMobileTableWidthChanged', {
      detail: { colCount, widths: nextMobile }
    }));
    window.dispatchEvent(new CustomEvent('globalDesktopTableWidthChanged', {
      detail: { colCount, widths: nextDesktop }
    }));
  }, [colCount]);

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
    e.stopPropagation();
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
    const targetColStartWidth = thElements[idx] ? thElements[idx].getBoundingClientRect().width : 140;

    const container = tableRef.current.closest('.table-quiz-container');
    const startScrollLeft = container ? container.scrollLeft : 0;
    const startX = isTouch ? e.touches[0].clientX : e.clientX;

    if (isTouch && container) {
      container.scrollLeft = startScrollLeft;
      container.style.overflowX = 'hidden';
      container.style.touchAction = 'none';
      document.body.style.touchAction = 'none';
    }

    const doResize = (ev) => {
      ev.stopPropagation();
      if (isTouch && ev.cancelable) {
        ev.preventDefault();
      }
      const currentX = isTouch ? ev.touches[0].clientX : ev.clientX;
      const deltaX = currentX - startX;

      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        if (colCount === 2 && idx === 0) {
          const containerWidth = container ? container.clientWidth : 320;
          const MIN_W = 60;
          let newW1 = Math.max(MIN_W, Math.min(containerWidth - MIN_W, targetColStartWidth + deltaX));
          let newW2 = Math.max(MIN_W, containerWidth - newW1);
          setMobileColWidths(prev => {
            const next = [`${newW1}px`, `${newW2}px`];
            try {
              localStorage.setItem(`anti_global_mobile_col_widths_${colCount}`, JSON.stringify(next));
            } catch(e) {}
            window.dispatchEvent(new CustomEvent('globalMobileTableWidthChanged', {
              detail: { colCount, widths: next }
            }));
            return next;
          });
        } else {
          const newWidth = Math.max(idx === 0 ? 50 : 60, targetColStartWidth + deltaX);
          
          setMobileColWidths(prev => {
            const next = [...prev];
            next[idx] = `${newWidth}px`;
            try {
              localStorage.setItem(`anti_global_mobile_col_widths_${colCount}`, JSON.stringify(next));
            } catch(e) {}
            window.dispatchEvent(new CustomEvent('globalMobileTableWidthChanged', {
              detail: { colCount, widths: next }
            }));
            return next;
          });
        }
      } else {
        const deltaPercent = (deltaX / totalWidth) * 100;
        setColWidths(prev => {
          const next = [...prev];
          if (idx < colCount - 1) {
            const sum = percentWidths[idx] + percentWidths[idx + 1];
            const minColWidth = 5;
            const desiredLeft = percentWidths[idx] + deltaPercent;
            const actualLeft = Math.max(minColWidth, Math.min(sum - minColWidth, desiredLeft));
            const actualRight = sum - actualLeft;

            next[idx] = actualLeft;
            next[idx + 1] = actualRight;
          }

          try {
            localStorage.setItem(`anti_global_desktop_col_widths_${colCount}`, JSON.stringify(next));
          } catch(e) {}
          window.dispatchEvent(new CustomEvent('globalDesktopTableWidthChanged', {
            detail: { colCount, widths: next }
          }));

          return next;
        });
      }
    };

    const stopResize = (ev) => {
      if (ev) ev.stopPropagation();
      if (isTouch && container) {
        container.style.overflowX = '';
        container.style.touchAction = '';
        document.body.style.touchAction = '';
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
  }, [questionIdx, colCount]);

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
        className={`table-quiz-table w-full table-fixed text-center border-collapse text-[14px] sm:text-[16px] min-w-full ${
          colCount === 2 ? 'sm:min-w-[600px]' : 'sm:min-w-[700px]'
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
                width: mobileColWidths[idx] || (typeof w === 'number' ? `${w}%` : w)
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
                  className={`relative p-1.5 sm:p-2 font-extrabold border-r border-slate-800 last:border-r-0 whitespace-normal break-keep select-text ${
                    isFirstCol ? 'text-left cursor-pointer' : 'text-center'
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
                      className={`p-1.5 sm:p-2 border-r border-slate-800 last:border-r-0 text-slate-300 text-[14px] sm:text-[16px] whitespace-pre-line break-keep select-text ${
                        isFirstCol ? 'text-center font-extrabold' : 'text-left'
                      }`}
                    >
                      <LatexRenderer text={typeof cell === 'string' ? cell.trim() : cell} katexLoaded={katexLoaded} className="inline" />
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
