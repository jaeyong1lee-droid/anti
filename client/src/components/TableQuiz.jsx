import React, { useRef, useState, useEffect, useCallback } from 'react';
import { LatexRenderer } from './LatexRenderer';
import { BufferedTextarea } from './BufferedInput';
import { getTableScoreColorTheme, areCellsEqual } from '../utils/renderingHelpers';

export const TableQuiz = React.memo(function TableQuiz({ 
  questionIdx, 
  q, 
  tableAnswers, 
  setTableAnswers, 
  tableAnswersRef, 
  revealed, 
  katexLoaded, 
  tableGradingResults, 
  weight = 10, 
  onSubmit, 
  gradeSingleTableCell, 
  cellGradingLoading 
}) {
  if (!q.tableData || !q.tableData.headers || !q.tableData.rows) {
    return <div className="text-red-400 text-xs py-2">오류: 표 데이터가 올바르지 않습니다.</div>;
  }

  const containerRef = useRef(null);
  const { headers, rows } = q.tableData;
  const inputIds = Object.keys(q.answers || {});

  // Comparison table resize states & methods
  const compColCount = q.comparisonTableData?.headers?.length || 0;
  const compTableRef = useRef(null);

  const [compColWidths, setCompColWidths] = useState(() => {
    const isMobilePortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
    const isMixedTableOrOverview = q.mixedType === 'overview' || q.mixedType === 'table';

    if (isMobilePortrait && isMixedTableOrOverview) {
      if (compColCount <= 1) return ['100%'];
      const remainingPercent = 100 / (compColCount - 1);
      return ['85px', ...Array(compColCount - 1).fill(`${remainingPercent}%`)];
    }

    if (compColCount <= 1) return ['100%'];
    if (compColCount === 2) return [60, 40];
    if (compColCount === 3) return [40, 30, 30];
    const first = 30;
    const others = (100 - first) / (compColCount - 1);
    return [first, ...Array(compColCount - 1).fill(others)];
  });

  const [compMobileColWidths, setCompMobileColWidths] = useState(() => {
    const widths = [];
    const storageKeyFirst = `mobileFirstCompColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}`;
    const savedFirst = typeof window !== 'undefined' ? localStorage.getItem(storageKeyFirst) : null;
    widths.push(savedFirst || '120px');
    
    for (let i = 1; i < compColCount; i++) {
      const storageKeyOther = `mobileCompColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}_${i}`;
      const savedOther = typeof window !== 'undefined' ? localStorage.getItem(storageKeyOther) : null;
      widths.push(savedOther || '140px');
    }
    return widths;
  });

  useEffect(() => {
    const handleResize = () => {
      const isMobilePortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
      const isMixedTableOrOverview = q.mixedType === 'overview' || q.mixedType === 'table';
      if (isMixedTableOrOverview) {
        if (isMobilePortrait) {
          if (compColCount <= 1) {
            setCompColWidths(['100%']);
          } else {
            const remainingPercent = 100 / (compColCount - 1);
            setCompColWidths(['85px', ...Array(compColCount - 1).fill(`${remainingPercent}%`)]);
          }
        } else {
          if (compColCount <= 1) {
            setCompColWidths(['100%']);
          } else if (compColCount === 2) {
            setCompColWidths([60, 40]);
          } else if (compColCount === 3) {
            setCompColWidths([40, 30, 30]);
          } else {
            const first = 30;
            const others = (100 - first) / (compColCount - 1);
            setCompColWidths([first, ...Array(compColCount - 1).fill(others)]);
          }
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [compColCount, q.mixedType]);

  useEffect(() => {
    setCompMobileColWidths(prev => {
      if (prev.length === compColCount) return prev;
      const next = [...prev];
      if (next.length < compColCount) {
        for (let i = next.length; i < compColCount; i++) {
          const storageKeyOther = `mobileCompColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}_${i}`;
          const savedOther = typeof window !== 'undefined' ? localStorage.getItem(storageKeyOther) : null;
          next.push(savedOther || '140px');
        }
      } else {
        next.splice(compColCount);
      }
      return next;
    });
  }, [compColCount, questionIdx]);

  const startCompColumnResize = useCallback((e, idx, isTouch) => {
    if (isTouch) {
      if (e.cancelable) e.preventDefault();
    } else {
      e.preventDefault();
    }
    if (!compTableRef.current) return;

    const thElements = compTableRef.current.querySelectorAll('th');
    const targetColStartWidth = thElements[idx] ? thElements[idx].getBoundingClientRect().width : 140;

    const container = compTableRef.current.closest('.table-quiz-container');
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
        setCompMobileColWidths(prev => {
          const next = [...prev];
          if (idx === 0) {
            next[0] = `${newWidth}px`;
            const storageKey = `mobileFirstCompColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}`;
            localStorage.setItem(storageKey, `${newWidth}px`);
          } else {
            for (let i = 1; i < compColCount; i++) {
              next[i] = `${newWidth}px`;
              const storageKey = `mobileCompColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}_${i}`;
              localStorage.setItem(storageKey, `${newWidth}px`);
            }
          }
          return next;
        });
      }
    };

    const stopResize = () => {
      if (isTouch && container) {
        container.style.overflowX = 'auto';
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

  const resetCompMobileColWidths = useCallback(() => {
    const defaultFirst = '120px';
    const storageKeyFirst = `mobileFirstCompColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}`;
    localStorage.removeItem(storageKeyFirst);
    
    for (let i = 1; i < compColCount; i++) {
      const storageKeyOther = `mobileCompColWidth_${questionIdx !== null && questionIdx !== undefined ? questionIdx : 'default'}_${i}`;
      localStorage.removeItem(storageKeyOther);
    }
    
    setCompMobileColWidths(prev => {
      const next = [defaultFirst];
      for (let i = 1; i < compColCount; i++) {
        next.push('140px');
      }
      return next;
    });
  }, [questionIdx, compColCount]);

  const lastCompTapRef = useRef(0);
  const handleCompHeaderClick = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastCompTapRef.current < DOUBLE_TAP_DELAY) {
      resetCompMobileColWidths();
    }
    lastCompTapRef.current = now;
  }, [resetCompMobileColWidths]);

  const handleInputChange = (inputId, val) => {
    if (tableAnswersRef) {
      tableAnswersRef.current[`${questionIdx}_${inputId}`] = val;
    }
    setTableAnswers(prev => ({
      ...prev,
      [`${questionIdx}_${inputId}`]: val
    }));
  };

  const handleInputKeystroke = (inputId, val) => {
    if (tableAnswersRef) {
      tableAnswersRef.current[`${questionIdx}_${inputId}`] = val;
    }
  };

  const colCount = headers.length;

  const [colWidths, setColWidths] = useState(() => {
    const isMobilePortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
    const isMixedTableOrOverview = q.mixedType === 'overview' || q.mixedType === 'table';

    if (isMobilePortrait && isMixedTableOrOverview) {
      if (colCount <= 1) return ['100%'];
      const remainingPercent = 100 / (colCount - 1);
      return ['85px', ...Array(colCount - 1).fill(`${remainingPercent}%`)];
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
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
      const isMobilePortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
      const isMixedTableOrOverview = q.mixedType === 'overview' || q.mixedType === 'table';
      if (isMixedTableOrOverview) {
        if (isMobilePortrait) {
          if (colCount <= 1) {
            setColWidths(['100%']);
          } else {
            const remainingPercent = 100 / (colCount - 1);
            setColWidths(['85px', ...Array(colCount - 1).fill(`${remainingPercent}%`)]);
          }
        } else {
          if (colCount <= 1) {
            setColWidths(['100%']);
          } else if (colCount === 2) {
            setColWidths([60, 40]);
          } else if (colCount === 3) {
            setColWidths([40, 30, 30]);
          } else {
            const first = 30;
            const others = (100 - first) / (colCount - 1);
            setColWidths([first, ...Array(colCount - 1).fill(others)]);
          }
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [colCount, q.mixedType]);

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

  const mainTable = (
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
                  className={`relative p-1 sm:p-1.5 font-extrabold border-r border-slate-800 last:border-r-0 select-text whitespace-normal break-words ${
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
                             row.slice(1).every(cellVal => areCellsEqual(row[1], cellVal)) && 
                             !row.slice(1).some(cellVal => typeof cellVal === 'string' && cellVal.includes('[INPUT_'));

            return (
              <tr key={rIdx} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/20">
                {row.map((cell, cIdx) => {
                  if (canMerge && cIdx > 1) return null;
                  const isFirstCol = cIdx === 0;
                  const isInput = typeof cell === 'string' && cell.includes('[INPUT_');
                  const cellColSpan = (canMerge && cIdx === 1) ? colCount - 1 : 1;

                  if (isInput) {
                    const inputId = cell.replace('[', '').replace(']', '').trim();
                    const value = tableAnswers[`${questionIdx}_${inputId}`] || '';
                    const correctAnswer = q.answers?.[inputId] || '';
                    
                    const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
                    const gradingResult = tableGradingResults?.[`${questionIdx}_${inputId}`];
                    const isCorrect = gradingResult 
                      ? gradingResult.isCorrect 
                      : (normalize(value) === normalize(correctAnswer));
   
                    const inputIdx = inputIds.indexOf(inputId);
                    const inputLetter = String.fromCharCode(65 + (inputIdx !== -1 ? inputIdx : 0));

                    return (
                      <td 
                        key={cIdx} 
                        colSpan={cellColSpan}
                        className="p-0 border-r border-slate-800 last:border-r-0 text-slate-200 text-[14px] sm:text-[16px] whitespace-normal break-words text-center align-middle cursor-text h-full"
                        onClick={(e) => {
                          const textarea = e.currentTarget.querySelector('textarea');
                          if (textarea) textarea.focus();
                        }}
                      >
                        {revealed ? (() => {
                          const theme = getTableScoreColorTheme(gradingResult, isCorrect, value);
                          return (
                            <div className={`w-full h-full flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-1 p-1 sm:p-1.5 text-[14px] sm:text-[16px] ${theme.cellBg}`}>
                              <div className="flex-grow text-left font-medium">
                                <BufferedTextarea
                                  value={value}
                                  onChange={(val) => {
                                    handleInputChange(inputId, val);
                                  }}
                                  onKeystroke={(val) => {
                                    handleInputKeystroke(inputId, val);
                                  }}
                                  placeholder={`${inputLetter} 입력`}
                                  data-answer-key={`${questionIdx}_${inputId}`}
                                  className="table-quiz-input w-full text-left text-[14px] sm:text-[16px] bg-transparent border-0 outline-none focus:outline-none focus:ring-0 text-inherit placeholder-slate-500 py-1 px-1.5 resize-none min-h-[30px] block font-medium align-middle"
                                  rows={1}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      const newVal = e.target.value;
                                      if (newVal !== value) {
                                        handleInputChange(inputId, newVal);
                                      }
                                      e.target.blur();
                                      if (gradeSingleTableCell && !cellGradingLoading?.[`${questionIdx}_${inputId}`]) {
                                        await gradeSingleTableCell(questionIdx, q, inputId);
                                      }
                                    }
                                  }}
                                />
                              </div>
                              {gradingResult && gradingResult.score !== undefined && (() => {
                                const cellObtained = (gradingResult.score / 10) * (weight / inputIds.length);
                                const displayScore = Math.round(cellObtained * 10) / 10;
                                const isCellLoading = cellGradingLoading?.[`${questionIdx}_${inputId}`];
                                return (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (isCellLoading) return;
                                      if (gradeSingleTableCell) {
                                        await gradeSingleTableCell(questionIdx, q, inputId);
                                      }
                                    }}
                                    title="클릭 시 이 칸만 재평가합니다"
                                    className={`mt-1 sm:mt-0 sm:ml-2 text-center sm:text-right font-extrabold select-none whitespace-nowrap hover:underline active:scale-95 transition-all text-[11px] sm:text-[13px] cursor-pointer ${theme.text} ${
                                      isCellLoading ? 'animate-pulse' : ''
                                    }`}
                                  >
                                    {isCellLoading ? (
                                      <span className="flex items-center gap-1">
                                        <svg className="animate-spin h-3 w-3 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        ...
                                      </span>
                                    ) : (
                                      `${displayScore}점 ↻`
                                    )}
                                  </button>
                                );
                              })()}
                            </div>
                          );
                        })() : (
                          <BufferedTextarea
                            value={value}
                            onChange={(val) => {
                              handleInputChange(inputId, val);
                            }}
                            onKeystroke={(val) => {
                              handleInputKeystroke(inputId, val);
                            }}
                            placeholder={`${inputLetter} 입력`}
                            data-answer-key={`${questionIdx}_${inputId}`}
                            className="table-quiz-input w-full text-center text-[14px] sm:text-[16px] bg-slate-900/10 focus:bg-slate-900/40 border-0 outline-none focus:outline-none focus:ring-0 text-slate-100 placeholder-slate-500 py-1 px-1.5 resize-none min-h-[30px] block align-middle"
                            rows={1}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                e.target.blur();
                                if (containerRef.current) {
                                  const textareas = Array.from(containerRef.current.querySelectorAll('textarea'));
                                  const curIdx = textareas.indexOf(e.target);
                                  if (curIdx !== -1) {
                                    if (curIdx === textareas.length - 1) {
                                      if (onSubmit) onSubmit();
                                    } else {
                                      textareas[curIdx + 1].focus();
                                    }
                                  }
                                }
                              }
                            }}
                          />
                        )}
                      </td>
                    );
                  } else {
                    return (
                      <td 
                        key={cIdx} 
                        colSpan={cellColSpan}
                        className={`p-1 sm:p-1.5 border-r border-slate-800 last:border-r-0 text-slate-355 text-[14px] sm:text-[16px] select-text whitespace-normal break-words ${
                          isFirstCol ? 'text-left break-all' : 'text-center'
                        }`}
                      >
                        <LatexRenderer text={cell} katexLoaded={katexLoaded} className="inline" />
                      </td>
                    );
                  }
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const compTable = q.comparisonTableData ? (
    <div className="mt-4 space-y-2">
      <div className="text-xs sm:text-sm font-extrabold text-slate-400 select-none text-left">
        ⚖️ 비교표 / 장단점 채우기
      </div>
      <div className="table-quiz-container w-full my-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
        <table 
          ref={compTableRef}
          className="table-quiz-table w-full table-fixed text-center border-collapse text-[14px] sm:text-[16px] min-w-full"
          style={isMobileView ? {
            '--table-width': compColCount === 2 ? '100%' : `max(100%, ${compMobileColWidths.reduce((sum, w) => sum + parseInt(w || '0', 10), 0)}px)`,
            minWidth: '0px'
          } : undefined}
        >
          <colgroup>
            {compColWidths.map((w, idx) => (
              <col 
                key={idx} 
                className={idx === 0 ? "table-quiz-col-first" : ""} 
                style={{ 
                  width: isMobileView
                    ? (idx === compColCount - 1
                        ? 'auto'
                        : (compMobileColWidths[idx] || (typeof w === 'number' ? `${w}%` : w)))
                    : (typeof w === 'number' ? `${w}%` : w)
                }} 
              />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-slate-900/80 text-slate-355 border-b border-slate-800">
              {q.comparisonTableData.headers.map((header, hIdx) => {
                const isFirstCol = hIdx === 0;
                return (
                  <th 
                    key={hIdx} 
                    className={`relative p-1.5 sm:p-2 font-extrabold border-r border-slate-800 last:border-r-0 select-text whitespace-normal break-words cursor-pointer ${
                      isFirstCol ? 'text-left break-all' : ''
                    }`}
                    onClick={isFirstCol ? handleCompHeaderClick : undefined}
                    title={isFirstCol ? "더블클릭 시 너비 초기화" : undefined}
                  >
                    <LatexRenderer text={header} katexLoaded={katexLoaded} className="inline" />
                    {hIdx < compColCount - 1 && (
                      <div
                        className="absolute right-0 top-0 bottom-0 w-4 sm:w-2 cursor-col-resize select-none z-10 hover:bg-sky-500/30 active:bg-sky-500/50 touch-none"
                        onMouseDown={(e) => startCompColumnResize(e, hIdx, false)}
                        onTouchStart={(e) => startCompColumnResize(e, hIdx, true)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {q.comparisonTableData.rows.map((row, rIdx) => {
              return (
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
     
                      const inputIdx = inputIds.indexOf(inputId);
                      const inputLetter = String.fromCharCode(65 + (inputIdx !== -1 ? inputIdx : 0));

                      return (
                        <td 
                          key={cIdx} 
                          className="p-0 border-r border-slate-800 last:border-r-0 text-slate-200 text-[14px] sm:text-[16px] whitespace-normal break-words text-center align-middle cursor-text h-full"
                          onClick={(e) => {
                            const textarea = e.currentTarget.querySelector('textarea');
                            if (textarea) textarea.focus();
                          }}
                        >
                          {revealed ? (() => {
                            const theme = getTableScoreColorTheme(gradingResult, isCorrect, value);
                            return (
                              <div className={`w-full h-full flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-1 p-1 sm:p-1.5 text-[14px] sm:text-[16px] ${theme.cellBg}`}>
                                <div className="flex-grow text-left font-medium">
                                  <BufferedTextarea
                                    value={value}
                                    onChange={(val) => handleInputChange(inputId, val)}
                                    onKeystroke={(val) => handleInputKeystroke(inputId, val)}
                                    placeholder={`${inputLetter} 입력`}
                                    data-answer-key={`${questionIdx}_${inputId}`}
                                    className="table-quiz-input w-full text-left text-[14px] sm:text-[16px] bg-transparent border-0 outline-none focus:outline-none focus:ring-0 text-inherit placeholder-slate-500 py-1 px-1.5 resize-none min-h-[30px] block font-medium align-middle"
                                    rows={1}
                                    onKeyDown={async (e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        const newVal = e.target.value;
                                        if (newVal !== value) {
                                          handleInputChange(inputId, newVal);
                                        }
                                        e.target.blur();
                                        if (gradeSingleTableCell && !cellGradingLoading?.[`${questionIdx}_${inputId}`]) {
                                          await gradeSingleTableCell(questionIdx, q, inputId);
                                        }
                                      }
                                    }}
                                  />
                                </div>
                                {gradingResult && gradingResult.score !== undefined && (() => {
                                  const cellObtained = (gradingResult.score / 10) * (weight / inputIds.length);
                                  const displayScore = Math.round(cellObtained * 10) / 10;
                                  const isCellLoading = cellGradingLoading?.[`${questionIdx}_${inputId}`];
                                  return (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (isCellLoading) return;
                                        if (gradeSingleTableCell) {
                                          await gradeSingleTableCell(questionIdx, q, inputId);
                                        }
                                      }}
                                      title="클릭 시 이 칸만 재평가합니다"
                                      className={`mt-1 sm:mt-0 sm:ml-2 text-center sm:text-right font-extrabold select-none whitespace-nowrap hover:underline active:scale-95 transition-all text-[11px] sm:text-[13px] cursor-pointer ${theme.text} ${
                                        isCellLoading ? 'animate-pulse' : ''
                                      }`}
                                    >
                                      {isCellLoading ? (
                                        <span className="flex items-center gap-1">
                                          <svg className="animate-spin h-3 w-3 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                          </svg>
                                          ...
                                        </span>
                                      ) : (
                                        `${displayScore}점 ↻`
                                      )}
                                    </button>
                                  );
                                })()}
                              </div>
                            );
                          })() : (
                            <BufferedTextarea
                              value={value}
                              onChange={(val) => handleInputChange(inputId, val)}
                              onKeystroke={(val) => handleInputKeystroke(inputId, val)}
                              placeholder={`${inputLetter} 입력`}
                              data-answer-key={`${questionIdx}_${inputId}`}
                              className="table-quiz-input w-full text-center text-[14px] sm:text-[16px] bg-slate-900/10 focus:bg-slate-900/40 border-0 outline-none focus:outline-none focus:ring-0 text-slate-250 placeholder-slate-500 py-1 px-1.5 resize-none min-h-[30px] block align-middle"
                              rows={1}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  e.target.blur();
                                  if (containerRef.current) {
                                    const textareas = Array.from(containerRef.current.querySelectorAll('textarea'));
                                    const curIdx = textareas.indexOf(e.target);
                                    if (curIdx !== -1) {
                                      if (curIdx === textareas.length - 1) {
                                        if (onSubmit) onSubmit();
                                      } else {
                                        textareas[curIdx + 1].focus();
                                      }
                                    }
                                  }
                                }
                              }}
                            />
                          )}
                        </td>
                      );
                    }
                    
                    return (
                      <td 
                        key={cIdx} 
                        className="p-2 sm:p-2.5 border-r border-slate-800 last:border-r-0 text-slate-355 text-[14px] sm:text-[16px] whitespace-normal break-words text-center align-middle font-extrabold select-text"
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
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="w-full">
      {mainTable}
      {compTable}
    </div>
  );
});
