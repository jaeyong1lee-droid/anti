import React, { useRef, useState, useEffect, useCallback } from 'react';
import { LatexRenderer } from './LatexRenderer';
import { BufferedTextarea } from './BufferedInput';
import { PopoutWindow } from './PopoutWindow';
import { getTableScoreColorTheme, areCellsEqual, isOverviewReview as isOverviewReviewHelper } from '../utils/renderingHelpers';

const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');

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
  onGradeOverviewStep,
  gradingLoading = false,
  gradeSingleTableCell, 
  cellGradingLoading,
  floatedTableId = null,
  setFloatedTableId = () => {},
  isExam = false
}) {
  if (!q.tableData || !q.tableData.headers || !q.tableData.rows) {
    return <div className="text-red-400 text-xs py-2">오류: 표 데이터가 올바르지 않습니다.</div>;
  }

  const isOverviewReview = isOverviewReviewHelper(q);
  const isFlowchart = q.question?.includes('┌') || q.question?.includes('▼') || q.question?.includes('흐름도') || q.question?.includes('플로우차트');

  const getTableInputIds = () => {
    const firstTableInputs = [];
    const secondTableInputs = [];

    if (q.tableData && q.tableData.rows) {
      q.tableData.rows.forEach(row => {
        row.forEach(cell => {
          if (typeof cell === 'string' && cell.includes('[INPUT_')) {
            const inputId = cell.replace('[', '').replace(']', '').trim();
            firstTableInputs.push(inputId);
          }
        });
      });
    }

    if (q.comparisonTableData && q.comparisonTableData.rows) {
      q.comparisonTableData.rows.forEach(row => {
        row.forEach(cell => {
          if (typeof cell === 'string' && cell.includes('[INPUT_')) {
            const inputId = cell.replace('[', '').replace(']', '').trim();
            secondTableInputs.push(inputId);
          }
        });
      });
    }

    return { firstTableInputs, secondTableInputs };
  };

  const { firstTableInputs, secondTableInputs } = getTableInputIds();

  const isFirstTableGraded = revealed || (firstTableInputs.length > 0 && firstTableInputs.every(
    id => tableGradingResults && tableGradingResults[`${questionIdx}_${id}`] !== undefined
  ));

  const isSecondTableGraded = revealed || (secondTableInputs.length > 0 && secondTableInputs.every(
    id => tableGradingResults && tableGradingResults[`${questionIdx}_${id}`] !== undefined
  ));

  const renderStepFeedback = (targetInputs, title) => {
    if (targetInputs.length === 0) return null;
    
    return (
      <div className="mt-4 text-left space-y-3 w-full animate-in fade-in slide-in-from-top-2 duration-200">
        <span className="font-extrabold text-amber-400 text-[14px] sm:text-[16px]">{title}:</span>
        <div className="divide-y divide-slate-800/80 mt-1">
          {targetInputs.map((inputId) => {
            const value = tableAnswers[`${questionIdx}_${inputId}`] || '';
            const correctAnswer = q.answers?.[inputId] || '';
            const gradingResult = tableGradingResults?.[`${questionIdx}_${inputId}`];
            
            const inputIdx = inputIds.indexOf(inputId);
            const inputLetter = String.fromCharCode(65 + (inputIdx !== -1 ? inputIdx : 0));
            
            const isCorrect = gradingResult 
              ? gradingResult.isCorrect 
              : (normalize(value) === normalize(correctAnswer));
            const theme = getTableScoreColorTheme(gradingResult, isCorrect, value);
            
            const cellObtained = gradingResult && gradingResult.score !== undefined
              ? (gradingResult.score / 10) * (weight / inputIds.length)
              : 0;
            const displayScore = Math.round(cellObtained * 10) / 10;
            
            let rowHeader = '';
            let colHeader = '';
            if (q.tableData && q.tableData.rows && q.tableData.headers) {
              q.tableData.rows.forEach((row) => {
                row.forEach((cell, colIdx) => {
                  if (typeof cell === 'string' && cell.includes(`[${inputId}]`)) {
                    rowHeader = row[0] || '';
                    colHeader = q.tableData.headers[colIdx] || '';
                  }
                });
              });
            }
            if (!rowHeader && q.comparisonTableData && q.comparisonTableData.rows && q.comparisonTableData.headers) {
              q.comparisonTableData.rows.forEach((row) => {
                row.forEach((cell, colIdx) => {
                  if (typeof cell === 'string' && cell.includes(`[${inputId}]`)) {
                    rowHeader = row[0] || '';
                    colHeader = q.comparisonTableData.headers[colIdx] || '';
                  }
                });
              });
            }
            
            const formatReason = (text) => {
              if (!text) return '';
              let formatted = text.replace(/^[-\s·*]+/, '');
              if (formatted.startsWith('score:')) {
                const idx = formatted.indexOf('\n');
                if (idx !== -1) {
                  formatted = formatted.substring(idx + 1).trim();
                }
              }
              return formatted;
            };

            return (
              <div key={inputId} className="py-3 first:pt-1 last:pb-1 text-[13px] sm:text-[14px] space-y-1.5 w-full text-left">
                {(rowHeader || colHeader) && (
                  <div className="text-[12px] sm:text-[13px] text-slate-400 flex items-center flex-wrap gap-1.5 font-medium mb-1 bg-slate-900/30 px-2 py-0.5 rounded border border-slate-800/40 w-fit">
                    <span className="text-slate-100 font-bold bg-slate-800/60 px-1 py-0.5 rounded mr-1">({inputLetter})</span>
                    {rowHeader && (
                      <span className="text-slate-300 font-semibold">
                        <LatexRenderer text={rowHeader} katexLoaded={katexLoaded} className="inline" />
                      </span>
                    )}
                    {rowHeader && colHeader && <span className="text-slate-500">/</span>}
                    {colHeader && (
                      <span className="text-slate-300 font-semibold">
                        <LatexRenderer text={colHeader} katexLoaded={katexLoaded} className="inline" />
                      </span>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center font-extrabold border-b border-slate-800/40 pb-1 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {!(rowHeader || colHeader) && <span className={theme.text}>({inputLetter})</span>}
                    <span className={`font-bold ${theme.text}`}>내 답변:</span>
                    <span className={`font-semibold ${theme.text}`}>{value || '(미입력)'}</span>
                  </div>
                  {gradingResult && gradingResult.score !== undefined && (
                    <span className={theme.text}>{displayScore}점</span>
                  )}
                </div>
                {gradingResult?.reason && (
                  <div>
                    <span className={`mr-1.5 font-bold ${theme.text}`}>피드백:</span>
                    <span className={`font-normal leading-relaxed inline ${theme.text}`}>
                      <LatexRenderer text={formatReason(gradingResult.reason)} katexLoaded={katexLoaded} isMarkdown={true} highlightBold={true} className="inline" />
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-slate-100 mr-1.5 font-bold">정답:</span>
                  <div className="text-slate-100 font-semibold mt-1">
                    <LatexRenderer 
                      text={gradingResult?.suggestedModelAnswer || correctAnswer} 
                      katexLoaded={katexLoaded} 
                      isMarkdown={true} 
                      highlightBold={true}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const containerRef = useRef(null);
  const [floatedSize, setFloatedSize] = useState(() => {
    try {
      const saved = localStorage.getItem('anti_floated_table_size');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          return parsed;
        }
      }
    } catch (e) {}
    return { width: 500, height: 450 };
  });

  const floatedSizeRef = useRef(floatedSize);
  useEffect(() => {
    floatedSizeRef.current = floatedSize;
  }, [floatedSize]);

  const [floatedPos, setFloatedPos] = useState(() => {
    try {
      const saved = localStorage.getItem('anti_floated_table_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch (e) {}
    const w = floatedSize.width || 500;
    const initialX = window.innerWidth - w - 24;
    return { x: initialX > 0 ? initialX : 24, y: 80 };
  });

  const floatedPosRef = useRef(floatedPos);
  useEffect(() => {
    floatedPosRef.current = floatedPos;
  }, [floatedPos]);

  const { headers, rows } = q.tableData;
  const inputIds = Object.keys(q.answers || {});

  // Comparison table resize states & methods
  const compColCount = q.comparisonTableData?.headers?.length || 0;
  const compTableRef = useRef(null);

  const [compColWidths, setCompColWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(`anti_desktop_col_widths_comp_${compColCount}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === compColCount) {
          return parsed;
        }
      }
    } catch (e) {}

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
    const storageKeyFirst = `anti_mobile_first_comp_col_width_${compColCount}`;
    const savedFirst = typeof window !== 'undefined' ? localStorage.getItem(storageKeyFirst) : null;
    widths.push(savedFirst || '120px');
    
    for (let i = 1; i < compColCount; i++) {
      const storageKeyOther = `anti_mobile_comp_col_width_${compColCount}_${i}`;
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
          try {
            const saved = localStorage.getItem(`anti_desktop_col_widths_comp_${compColCount}`);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length === compColCount) {
                setCompColWidths(parsed);
                return;
              }
            }
          } catch (e) {}

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
          const storageKeyOther = `anti_mobile_comp_col_width_${compColCount}_${i}`;
          const savedOther = typeof window !== 'undefined' ? localStorage.getItem(storageKeyOther) : null;
          next.push(savedOther || '140px');
        }
      } else {
        next.splice(compColCount);
      }
      return next;
    });
  }, [compColCount]);

  const startCompColumnResize = useCallback((e, idx, isTouch) => {
    if (isTouch) {
      if (e.cancelable) e.preventDefault();
    } else {
      e.preventDefault();
    }
    if (!compTableRef.current) return;

    const thElements = compTableRef.current.querySelectorAll('th');
    const widths = Array.from(thElements).map(th => th.getBoundingClientRect().width);
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    const percentWidths = widths.map(w => (w / totalWidth) * 100);
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
            const storageKey = `anti_mobile_first_comp_col_width_${compColCount}`;
            localStorage.setItem(storageKey, `${newWidth}px`);
          } else {
            for (let i = 1; i < compColCount; i++) {
              next[i] = `${newWidth}px`;
              const storageKey = `anti_mobile_comp_col_width_${compColCount}_${i}`;
              localStorage.setItem(storageKey, `${newWidth}px`);
            }
          }
          return next;
        });
      } else {
        const deltaPercent = (deltaX / totalWidth) * 100;
        setCompColWidths(prev => {
          const next = [...prev];
          if (idx === 0) {
            const newFirstWidth = Math.max(10, Math.min(80, percentWidths[0] + deltaPercent));
            next[0] = newFirstWidth;
            const remaining = 100 - newFirstWidth;
            const eachWidth = remaining / (compColCount - 1);
            for (let i = 1; i < compColCount; i++) {
              next[i] = eachWidth;
            }
          } else {
            const newVal = percentWidths[idx] + deltaPercent;
            const maxNewVal = (100 - 10) / (compColCount - 1);
            const minNewVal = (100 - 80) / (compColCount - 1);
            const actualVal = Math.max(minNewVal, Math.min(maxNewVal, newVal));
            for (let i = 1; i < compColCount; i++) {
              next[i] = actualVal;
            }
            next[0] = 100 - actualVal * (compColCount - 1);
          }
          
          try {
            localStorage.setItem(`anti_desktop_col_widths_comp_${compColCount}`, JSON.stringify(next));
          } catch(e) {}

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
  }, [compColCount]);

  const resetCompMobileColWidths = useCallback(() => {
    const defaultFirst = '120px';
    const storageKeyFirst = `anti_mobile_first_comp_col_width_${compColCount}`;
    localStorage.removeItem(storageKeyFirst);
    
    for (let i = 1; i < compColCount; i++) {
      const storageKeyOther = `anti_mobile_comp_col_width_${compColCount}_${i}`;
      localStorage.removeItem(storageKeyOther);
    }
    
    localStorage.removeItem(`anti_desktop_col_widths_comp_${compColCount}`);
    
    setCompMobileColWidths(prev => {
      const next = [defaultFirst];
      for (let i = 1; i < compColCount; i++) {
        next.push('140px');
      }
      return next;
    });

    if (compColCount === 2) {
      setCompColWidths([60, 40]);
    } else if (compColCount === 3) {
      setCompColWidths([40, 30, 30]);
    } else {
      const first = 30;
      const others = (100 - first) / (compColCount - 1);
      setCompColWidths([first, ...Array(compColCount - 1).fill(others)]);
    }
  }, [compColCount]);

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
    try {
      const saved = localStorage.getItem(`anti_desktop_col_widths_main_${colCount}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === colCount) {
          return parsed;
        }
      }
    } catch(e) {}

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

  const [usePopout, setUsePopout] = useState(() => {
    return localStorage.getItem('anti_use_popout_table') !== 'false';
  });

  const togglePopoutMode = () => {
    const newVal = !usePopout;
    setUsePopout(newVal);
    localStorage.setItem('anti_use_popout_table', newVal ? 'true' : 'false');
  };

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
          try {
            const saved = localStorage.getItem(`anti_desktop_col_widths_main_${colCount}`);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length === colCount) {
                setColWidths(parsed);
                return;
              }
            }
          } catch(e) {}

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
    const storageKeyFirst = `anti_mobile_first_col_width_${colCount}`;
    const savedFirst = typeof window !== 'undefined' ? localStorage.getItem(storageKeyFirst) : null;
    
    if (savedFirst) {
      widths.push(savedFirst);
      for (let i = 1; i < colCount; i++) {
        const storageKeyOther = `anti_mobile_col_width_${colCount}_${i}`;
        const savedOther = typeof window !== 'undefined' ? localStorage.getItem(storageKeyOther) : null;
        widths.push(savedOther || '140px');
      }
    } else {
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
          widths.push(`${others}%`);
        }
      }
    }
    return widths;
  });

  useEffect(() => {
    setMobileColWidths(prev => {
      if (prev.length === colCount) return prev;
      const next = [...prev];
      if (next.length < colCount) {
        for (let i = next.length; i < colCount; i++) {
          const storageKeyOther = `anti_mobile_col_width_${colCount}_${i}`;
          const savedOther = typeof window !== 'undefined' ? localStorage.getItem(storageKeyOther) : null;
          next.push(savedOther || '140px');
        }
      } else {
        next.splice(colCount);
      }
      return next;
    });
  }, [colCount]);

  useEffect(() => {
    const handleWidthChange = (e) => {
      if (e.detail?.colCount === colCount) {
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
  }, [colCount]);

  const resetMobileColWidths = useCallback(() => {
    const storageKeyFirst = `anti_mobile_first_col_width_${colCount}`;
    localStorage.removeItem(storageKeyFirst);
    
    for (let i = 1; i < colCount; i++) {
      const storageKeyOther = `anti_mobile_col_width_${colCount}_${i}`;
      localStorage.removeItem(storageKeyOther);
    }
    
    localStorage.removeItem(`anti_desktop_col_widths_main_${colCount}`);
    
    setMobileColWidths(() => {
      const next = [];
      if (colCount <= 1) {
        next.push('100%');
      } else if (colCount === 2) {
        next.push('45%', '55%');
      } else if (colCount === 3) {
        next.push('40%', '30%', '30%');
      } else {
        const first = 30;
        const others = (100 - first) / (colCount - 1);
        next.push(`${first}%`);
        for (let i = 1; i < colCount; i++) {
          next.push(`${others}%`);
        }
      }
      return next;
    });

    if (colCount === 2) {
      setColWidths([60, 40]);
    } else if (colCount === 3) {
      setColWidths([40, 30, 30]);
    } else {
      const first = 30;
      const others = (100 - first) / (colCount - 1);
      setColWidths([first, ...Array(colCount - 1).fill(others)]);
    }

    window.dispatchEvent(new CustomEvent('firstColWidthChanged', {
      detail: { colCount, width: colCount === 2 ? '45%' : colCount === 3 ? '40%' : '30%' }
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

    const doc = tableRef.current ? tableRef.current.ownerDocument : document;
    const targetWindow = doc.defaultView || window;

    const container = tableRef.current.closest('.table-quiz-container');
    const startScrollLeft = container ? container.scrollLeft : 0;
    const startX = isTouch ? e.touches[0].clientX : e.clientX;

    if (isTouch && container) {
      container.scrollLeft = startScrollLeft;
      container.style.overflowX = 'hidden';
      container.style.touchAction = 'none';
      doc.body.style.touchAction = 'none';
    }

    const doResize = (ev) => {
      ev.stopPropagation();
      if (isTouch && ev.cancelable) {
        ev.preventDefault();
      }
      const currentX = isTouch ? ev.touches[0].clientX : ev.clientX;
      const deltaX = currentX - startX;

      const isMobile = targetWindow.innerWidth < 768;
      if (isMobile) {
        const newWidth = Math.max(idx === 0 ? 50 : 60, targetColStartWidth + deltaX);
        
        setMobileColWidths(prev => {
          const next = [...prev];
          if (idx === 0) {
            next[0] = `${newWidth}px`;
            const storageKey = `anti_mobile_first_col_width_${colCount}`;
            localStorage.setItem(storageKey, `${newWidth}px`);
            window.dispatchEvent(new CustomEvent('firstColWidthChanged', {
              detail: { colCount, width: `${newWidth}px` }
            }));
          } else {
            for (let i = 1; i < colCount; i++) {
              next[i] = `${newWidth}px`;
              const storageKey = `anti_mobile_col_width_${colCount}_${i}`;
              localStorage.setItem(storageKey, `${newWidth}px`);
            }
          }
          return next;
        });
      } else {
        const deltaPercent = (deltaX / totalWidth) * 100;
        setColWidths(prev => {
          const next = [...prev];
          if (idx === 0) {
            const newFirstWidth = Math.max(10, Math.min(80, percentWidths[0] + deltaPercent));
            next[0] = newFirstWidth;
            const remaining = 100 - newFirstWidth;
            const eachWidth = remaining / (colCount - 1);
            for (let i = 1; i < colCount; i++) {
              next[i] = eachWidth;
            }
          } else {
            const newVal = percentWidths[idx] + deltaPercent;
            const maxNewVal = (100 - 10) / (colCount - 1);
            const minNewVal = (100 - 80) / (colCount - 1);
            const actualVal = Math.max(minNewVal, Math.min(maxNewVal, newVal));
            for (let i = 1; i < colCount; i++) {
              next[i] = actualVal;
            }
            next[0] = 100 - actualVal * (colCount - 1);
          }
          
          try {
            localStorage.setItem(`anti_desktop_col_widths_main_${colCount}`, JSON.stringify(next));
          } catch(e) {}

          return next;
        });
      }
    };

    const stopResize = (ev) => {
      if (ev) ev.stopPropagation();
      if (isTouch && container) {
        container.style.overflowX = '';
        container.style.touchAction = '';
        doc.body.style.touchAction = '';
      }
      if (isTouch) {
        targetWindow.removeEventListener('touchmove', doResize);
        targetWindow.removeEventListener('touchend', stopResize);
      } else {
        targetWindow.removeEventListener('mousemove', doResize);
        targetWindow.removeEventListener('mouseup', stopResize);
      }
    };

    if (isTouch) {
      targetWindow.addEventListener('touchmove', doResize, { passive: false });
      targetWindow.addEventListener('touchend', stopResize);
    } else {
      targetWindow.addEventListener('mousemove', doResize);
      targetWindow.addEventListener('mouseup', stopResize);
    }
  }, [colCount]);

  const startFloatedResizeLeft = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isTouch = e.type === 'touchstart';
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startY = isTouch ? e.touches[0].clientY : e.clientY;
    
    const startWidth = floatedSizeRef.current.width;
    const startHeight = floatedSizeRef.current.height;
    const startLeft = floatedPosRef.current.x;
    
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'sw-resize';
    
    const doResize = (moveEvent) => {
      const currentX = (moveEvent.touches && moveEvent.touches.length > 0) ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = (moveEvent.touches && moveEvent.touches.length > 0) ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      const dx = currentX - startX;
      const dy = currentY - startY;
      
      const newWidth = Math.max(300, Math.min(window.innerWidth - 40, startWidth - dx));
      const newHeight = Math.max(200, Math.min(window.innerHeight - 100, startHeight + dy));
      const newLeft = Math.max(0, startLeft - (newWidth - startWidth));
      
      setFloatedSize({ width: newWidth, height: newHeight });
      setFloatedPos(prev => ({ ...prev, x: newLeft }));
    };
    
    const stopResize = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      try {
        localStorage.setItem('anti_floated_table_size', JSON.stringify(floatedSizeRef.current));
        localStorage.setItem('anti_floated_table_pos', JSON.stringify(floatedPosRef.current));
      } catch (err) {}
      
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
  }, []);

  const startFloatedResizeRight = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isTouch = e.type === 'touchstart';
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startY = isTouch ? e.touches[0].clientY : e.clientY;
    
    const startWidth = floatedSizeRef.current.width;
    const startHeight = floatedSizeRef.current.height;
    
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'se-resize';
    
    const doResize = (moveEvent) => {
      const currentX = (moveEvent.touches && moveEvent.touches.length > 0) ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = (moveEvent.touches && moveEvent.touches.length > 0) ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      const dx = currentX - startX;
      const dy = currentY - startY;
      
      const newWidth = Math.max(300, Math.min(window.innerWidth - 40, startWidth + dx));
      const newHeight = Math.max(200, Math.min(window.innerHeight - 100, startHeight + dy));
      
      setFloatedSize({ width: newWidth, height: newHeight });
    };
    
    const stopResize = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      try {
        localStorage.setItem('anti_floated_table_size', JSON.stringify(floatedSizeRef.current));
      } catch (err) {}
      
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
  }, []);

  const startFloatedMove = useCallback((e) => {
    if (e.target.closest('button, svg, path, input, textarea, td, th')) return;

    e.preventDefault();
    e.stopPropagation();

    const isTouch = e.type === 'touchstart';
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    const startX = clientX - floatedPosRef.current.x;
    const startY = clientY - floatedPosRef.current.y;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    // Temporarily disable pointer-events on all iframes to prevent event interception
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      iframe.style.pointerEvents = 'none';
    });

    const handleMove = (moveEvent) => {
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const currentX = (moveEvent.touches && moveEvent.touches.length > 0) ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = (moveEvent.touches && moveEvent.touches.length > 0) ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const newX = currentX - startX;
      const newY = currentY - startY;

      const currentSize = floatedSizeRef.current;
      const boundedX = Math.max(10, Math.min(window.innerWidth - currentSize.width - 10, newX));
      const boundedY = Math.max(10, Math.min(window.innerHeight - currentSize.height - 10, newY));

      setFloatedPos({ x: boundedX, y: boundedY });
    };

    const handleMoveEnd = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        iframe.style.pointerEvents = 'auto';
      });

      try {
        localStorage.setItem('anti_floated_table_pos', JSON.stringify(floatedPosRef.current));
      } catch (err) {}

      if (isTouch) {
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleMoveEnd);
      } else {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleMoveEnd);
      }
    };

    if (isTouch) {
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleMoveEnd);
    } else {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleMoveEnd);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (floatedTableId) {
          setFloatedTableId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [floatedTableId, setFloatedTableId]);

  useEffect(() => {
    if (isMobileView && floatedTableId) {
      setFloatedTableId(null);
    }
  }, [isMobileView, floatedTableId, setFloatedTableId]);

  const mainTableUniqueId = `${isExam ? 'exam' : 'review'}_${questionIdx}_main`;
  const isMainFloated = floatedTableId === mainTableUniqueId;

  const compTableUniqueId = `${isExam ? 'exam' : 'review'}_${questionIdx}_comp`;
  const isCompFloated = floatedTableId === compTableUniqueId;

  const isAnyFloated = isMainFloated || isCompFloated;
  const textSizeClass = isAnyFloated ? "text-[14px]" : "text-[14px] sm:text-[16px]";

  const floatedStyleTag = isAnyFloated ? (
    <style>{`
      .floated-table-quiz,
      .floated-table-quiz *,
      .floated-table-quiz textarea,
      .floated-table-quiz input,
      .floated-table-quiz .table-quiz-input {
        font-size: 13px !important;
      }
    `}</style>
  ) : null;

  const mainTablePlaceholder = isMainFloated ? (
    <div className="w-full my-3 p-4 rounded-xl border border-dashed border-sky-500/20 bg-sky-500/5 text-center flex flex-col items-center justify-center gap-1.5 min-h-[100px] select-none">
      <span className="text-lg">📌</span>
      <p className="text-xs font-semibold text-sky-400">표가 우측 상단에 고정되어 있습니다.</p>
      <button 
        onClick={() => setFloatedTableId(null)}
        className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-bold rounded-lg transition-all border border-sky-500/30 active:scale-95"
      >
        화면 고정 해제
      </button>
    </div>
  ) : null;

  const mainTableTitle = !isMainFloated ? (
    <div className="flex justify-between items-center w-full mb-1">
      <div className="text-xs sm:text-sm font-extrabold text-slate-400 select-none text-left">
        📋 표 채우기
      </div>
      {!isMobileView && (
        <button
          onClick={() => setFloatedTableId(mainTableUniqueId)}
          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg text-sm transition-all active:scale-95 select-none font-bold"
          title="표를 화면에 고정하여 편리하게 문제를 풉니다"
        >
          &gt;
        </button>
      )}
    </div>
  ) : null;

  const activeUsePopout = usePopout && !isMobileView;

  const mainTable = (() => {
    const tableEl = (
      <div className={isMainFloated ? "flex-1 overflow-auto w-full h-full" : "w-full"}>
        <table 
          ref={tableRef} 
          className={`table-quiz-table w-full table-fixed text-center border-collapse text-[14px] sm:text-[16px] min-w-full ${
            colCount === 2 ? 'sm:min-w-[600px]' : 'sm:min-w-[700px]'
          } ${isMainFloated ? 'h-full' : ''}`}
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
                    
                    const gradingResult = tableGradingResults?.[`${questionIdx}_${inputId}`];
                    const isCorrect = gradingResult 
                      ? gradingResult.isCorrect 
                      : (normalize(value) === normalize(correctAnswer));
   
                    const inputIdx = inputIds.indexOf(inputId);
                    const inputLetter = String.fromCharCode(65 + (inputIdx !== -1 ? inputIdx : 0));
                    const isCellGraded = revealed || (tableGradingResults && tableGradingResults[`${questionIdx}_${inputId}`] !== undefined);
                    const theme = isCellGraded ? getTableScoreColorTheme(gradingResult, isCorrect, value) : null;
                    return (
                      <td 
                        key={cIdx} 
                        colSpan={cellColSpan}
                        className={`p-0 border-r border-slate-800 last:border-r-0 text-slate-200 text-[14px] sm:text-[16px] whitespace-normal break-words text-center align-middle cursor-text ${theme ? theme.cellBg : ''}`}
                        onClick={(e) => {
                          const textarea = e.currentTarget.querySelector('textarea');
                          if (textarea) textarea.focus();
                        }}
                      >
                        {isCellGraded ? (
                          <div className="w-full flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-1 p-1 sm:p-1.5 text-[14px] sm:text-[16px]">
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
                        ) : (
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

    if (isMainFloated) {
      if (activeUsePopout) {
        return (
          <PopoutWindow
            title="📌 표 채우기"
            onClose={() => setFloatedTableId(null)}
            initWidth={floatedSize.width}
            initHeight={floatedSize.height}
            storageKey={"anti_popout_table_main_" + mainTableUniqueId}
          >
            <div className="w-full h-full flex flex-col overflow-hidden text-slate-100 p-4 sm:p-5 bg-[#020617]">


              {/* Table wrapper with elegant border gradient and shadow */}
              <div className="flex-1 w-full h-full flex flex-col overflow-hidden bg-slate-900/40 rounded-2xl border border-slate-800/80 p-3 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative">
                <div className="absolute inset-0 rounded-2xl border border-transparent bg-gradient-to-tr from-violet-500/20 via-transparent to-emerald-500/20 pointer-events-none" />
                {tableEl}
              </div>
            </div>
          </PopoutWindow>
        );
      }
      return (
        <div 
          key="floated"
          className="fixed z-[9991] bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl p-3 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md floated-table-quiz"
          style={{
            width: `${floatedSize.width}px`,
            height: `${floatedSize.height}px`,
            left: `${floatedPos.x}px`,
            top: `${floatedPos.y}px`,
            maxWidth: '90vw',
            maxHeight: '90vh'
          }}
        >
          <>
            {/* Bottom Left Resize */}
            <div 
              className="absolute left-0 bottom-0 w-4.5 h-4.5 cursor-sw-resize z-50 flex items-end justify-start p-1 select-none active:scale-95"
              onMouseDown={startFloatedResizeLeft}
              onTouchStart={startFloatedResizeLeft}
              title="드래그하여 좌측으로 크기를 조절합니다"
            >
              <svg className="w-2.5 h-2.5 text-slate-500 hover:text-slate-300" viewBox="0 0 10 10" fill="none" stroke="currentColor">
                <path d="M1 9 L9 1 M1 6 L6 1 M1 3 L3 1" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
            {/* Bottom Right Resize */}
            <div 
              className="absolute right-0 bottom-0 w-4.5 h-4.5 cursor-se-resize z-50 flex items-end justify-end p-1 select-none active:scale-95"
              onMouseDown={startFloatedResizeRight}
              onTouchStart={startFloatedResizeRight}
              title="드래그하여 우측으로 크기를 조절합니다"
            >
              <svg className="w-2.5 h-2.5 text-slate-500 hover:text-slate-300" viewBox="0 0 10 10" fill="none" stroke="currentColor">
                <path d="M9 9 L1 1 M9 6 L6 9 M9 3 L3 9" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
          </>
          <div 
            onMouseDown={startFloatedMove}
            onTouchStart={startFloatedMove}
            className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800 select-none cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center gap-2">
              <span className="text-sky-400 font-extrabold text-sm sm:text-base flex items-center gap-1.5">
                ⚖️
              </span>
              <span className="text-xs text-slate-400 hidden sm:inline">
                (입력 및 채점 상태가 실시간 동기화됩니다)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={togglePopoutMode}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 rounded text-[9px] font-black transition-colors cursor-pointer border-none"
                title="독립된 새 창으로 분리합니다"
              >
                새창 분리
              </button>
              <button 
                onClick={() => setFloatedTableId(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-all active:scale-95 hover:bg-slate-800"
                title="고정 해제 (ESC)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {tableEl}
        </div>
      );
    }

    return (
      <div 
        key="inline"
        className="table-quiz-container w-full my-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40"
        style={mobileColWidths.reduce((acc, w, i) => {
          acc[`--col-width-${i}`] = w;
          return acc;
        }, {})}
      >
        {tableEl}
      </div>
    );
  })();

  const compTablePlaceholder = (isCompFloated && q.comparisonTableData) ? (
    <div className="w-full my-3 p-4 rounded-xl border border-dashed border-sky-500/20 bg-sky-500/5 text-center flex flex-col items-center justify-center gap-1.5 min-h-[100px] select-none">
      <span className="text-lg">⚖️</span>
      <p className="text-xs font-semibold text-sky-400">비교표가 우측 상단에 고정되어 있습니다.</p>
      <button 
        onClick={() => setFloatedTableId(null)}
        className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-bold rounded-lg transition-all border border-sky-500/30 active:scale-95"
      >
        화면 고정 해제
      </button>
    </div>
  ) : null;

  const compTableTitle = (!isCompFloated && q.comparisonTableData) ? (
    <div className="flex justify-between items-center w-full mt-4 mb-1">
      <div className="text-xs sm:text-sm font-extrabold text-slate-400 select-none text-left">
        ⚖️ 비교표 / 장단점 채우기
      </div>
      {!isMobileView && (
        <button
          onClick={() => setFloatedTableId(compTableUniqueId)}
          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg text-sm transition-all active:scale-95 select-none font-bold"
          title="비교표를 화면에 고정하여 편리하게 문제를 풉니다"
        >
          &gt;
        </button>
      )}
    </div>
  ) : null;

  const compTable = q.comparisonTableData ? (
    (() => {
      const tableEl = (
        <div className={isCompFloated ? "flex-1 overflow-auto w-full h-full" : "w-full"}>
          <table 
            ref={compTableRef}
            className={`table-quiz-table w-full table-fixed text-center border-collapse text-[14px] sm:text-[16px] min-w-full ${isCompFloated ? 'h-full' : ''}`}
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
                      
                      const gradingResult = tableGradingResults?.[`${questionIdx}_${inputId}`];
                      const isCorrect = gradingResult 
                        ? gradingResult.isCorrect 
                        : (normalize(value) === normalize(correctAnswer));
     
                      const inputIdx = inputIds.indexOf(inputId);
                      const inputLetter = String.fromCharCode(65 + (inputIdx !== -1 ? inputIdx : 0));
                      const isCellGraded = revealed || (tableGradingResults && tableGradingResults[`${questionIdx}_${inputId}`] !== undefined);
                      const theme = isCellGraded ? getTableScoreColorTheme(gradingResult, isCorrect, value) : null;
                      return (
                        <td 
                          key={cIdx} 
                          className={`p-0 border-r border-slate-800 last:border-r-0 text-slate-200 text-[14px] sm:text-[16px] whitespace-normal break-words text-center align-middle cursor-text ${theme ? theme.cellBg : ''}`}
                          onClick={(e) => {
                            if (isOverviewReview && !isFirstTableGraded) return;
                            const textarea = e.currentTarget.querySelector('textarea');
                            if (textarea) textarea.focus();
                          }}
                        >
                          {isCellGraded ? (
                            <div className="w-full flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-1 p-1 sm:p-1.5 text-[14px] sm:text-[16px]">
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
                          ) : (
                            <BufferedTextarea
                              value={value}
                              onChange={(val) => handleInputChange(inputId, val)}
                              onKeystroke={(val) => handleInputKeystroke(inputId, val)}
                              placeholder={isOverviewReview && !isFirstTableGraded ? "🔒 1단계 완료 후 활성화" : `${inputLetter} 입력`}
                              readOnly={isOverviewReview && !isFirstTableGraded}
                              disabled={isOverviewReview && !isFirstTableGraded}
                              data-answer-key={`${questionIdx}_${inputId}`}
                              className={`table-quiz-input w-full text-center text-[14px] sm:text-[16px] border-0 outline-none focus:outline-none focus:ring-0 resize-none min-h-[30px] block align-middle ${
                                isOverviewReview && !isFirstTableGraded
                                  ? 'bg-slate-950/60 text-slate-500 cursor-not-allowed placeholder-slate-600'
                                  : 'bg-slate-900/10 focus:bg-slate-900/40 text-slate-250 placeholder-slate-500'
                              }`}
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
      );

    if (isCompFloated) {
      if (activeUsePopout) {
        return (
          <PopoutWindow
            title="⚖️ 비교표"
            onClose={() => setFloatedTableId(null)}
            initWidth={floatedSize.width}
            initHeight={floatedSize.height}
            storageKey={"anti_popout_table_comp_" + compTableUniqueId}
          >
            <div className="w-full h-full flex flex-col overflow-hidden text-slate-100 p-4 sm:p-5 bg-[#020617]">


              {/* Table wrapper with elegant border gradient and shadow */}
              <div className="flex-1 w-full h-full flex flex-col overflow-hidden bg-slate-900/40 rounded-2xl border border-slate-800/80 p-3 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative">
                <div className="absolute inset-0 rounded-2xl border border-transparent bg-gradient-to-tr from-violet-500/20 via-transparent to-emerald-500/20 pointer-events-none" />
                {tableEl}
              </div>
            </div>
          </PopoutWindow>
        );
      }
      return (
        <div 
          key="floated"
          className="fixed z-[9991] bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl p-3 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md floated-table-quiz"
          style={{
            width: `${floatedSize.width}px`,
            height: `${floatedSize.height}px`,
            left: `${floatedPos.x}px`,
            top: `${floatedPos.y}px`,
            maxWidth: '90vw',
            maxHeight: '90vh'
          }}
        >
          <>
            {/* Bottom Left Resize */}
            <div 
              className="absolute left-0 bottom-0 w-4.5 h-4.5 cursor-sw-resize z-50 flex items-end justify-start p-1 select-none active:scale-95"
              onMouseDown={startFloatedResizeLeft}
              onTouchStart={startFloatedResizeLeft}
              title="드래그하여 좌측으로 크기를 조절합니다"
            >
              <svg className="w-2.5 h-2.5 text-slate-500 hover:text-slate-300" viewBox="0 0 10 10" fill="none" stroke="currentColor">
                <path d="M1 9 L9 1 M1 6 L6 1 M1 3 L3 1" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
            {/* Bottom Right Resize */}
            <div 
              className="absolute right-0 bottom-0 w-4.5 h-4.5 cursor-se-resize z-50 flex items-end justify-end p-1 select-none active:scale-95"
              onMouseDown={startFloatedResizeRight}
              onTouchStart={startFloatedResizeRight}
              title="드래그하여 우측으로 크기를 조절합니다"
            >
              <svg className="w-2.5 h-2.5 text-slate-500 hover:text-slate-300" viewBox="0 0 10 10" fill="none" stroke="currentColor">
                <path d="M9 9 L1 1 M9 6 L6 9 M9 3 L3 9" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
          </>
          <div 
            onMouseDown={startFloatedMove}
            onTouchStart={startFloatedMove}
            className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800 select-none cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center gap-2">
              <span className="text-sky-400 font-extrabold text-sm sm:text-base flex items-center gap-1.5">
                ⚖️
              </span>
              <span className="text-xs text-slate-400 hidden sm:inline">
                (입력 및 채점 상태가 실시간 동기화됩니다)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={togglePopoutMode}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 rounded text-[9px] font-black transition-colors cursor-pointer border-none"
                title="독립된 새 창으로 분리합니다"
              >
                새창 분리
              </button>
              <button 
                onClick={() => setFloatedTableId(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-all active:scale-95 hover:bg-slate-800"
                title="고정 해제 (ESC)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {tableEl}
        </div>
      );
      }

      return (
        <div className="mt-2">
          <div 
            key="inline"
            className="table-quiz-container w-full my-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40"
          >
            {tableEl}
          </div>
        </div>
      );
    })()
  ) : null;

  return (
    <div ref={containerRef} className="w-full">
      {floatedStyleTag}
      {!isFlowchart && mainTableTitle}
      {!isFlowchart && mainTablePlaceholder}
      {!isFlowchart && mainTable}
 
       {isOverviewReview && !isFirstTableGraded && (
         <div className="mt-3.5 mb-5 select-none flex justify-center w-full">
           <button
             type="button"
             onClick={async () => {
               if (onGradeOverviewStep) {
                 await onGradeOverviewStep(1, firstTableInputs);
               }
             }}
             disabled={gradingLoading || (cellGradingLoading && Object.keys(cellGradingLoading).some(k => k.startsWith(`${questionIdx}_`) && cellGradingLoading[k]))}
             className={`w-full py-3 bg-slate-600 hover:bg-slate-500 text-white border border-slate-500/50 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-slate-600/10 font-black ${
               gradingLoading ? 'opacity-50 pointer-events-none' : ''
             }`}
           >
             {gradingLoading ? (
               <span className="flex items-center gap-2">
                 <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
                 AI 채점 진행 중...
               </span>
             ) : '제출하고 채점하기 (1단계: 개요) →'}
           </button>
         </div>
       )}
 
       {isOverviewReview && isFirstTableGraded && (
         <div className="my-4 w-full">
           {renderStepFeedback(firstTableInputs, "📋 [1단계: 개요] 채점 피드백")}
         </div>
       )}
 
       {compTableTitle}
       {compTablePlaceholder}
       {compTable}
 
       {isOverviewReview && isFirstTableGraded && !isSecondTableGraded && (
         <div className="mt-3.5 mb-2 select-none flex justify-center w-full">
           <button
             type="button"
             onClick={async () => {
               if (onGradeOverviewStep) {
                 await onGradeOverviewStep(2, secondTableInputs);
               }
             }}
             disabled={gradingLoading || (cellGradingLoading && Object.keys(cellGradingLoading).some(k => k.startsWith(`${questionIdx}_`) && cellGradingLoading[k]))}
             className={`w-full py-3 bg-slate-600 hover:bg-slate-500 text-white border border-slate-500/50 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-slate-600/10 font-black ${
               gradingLoading ? 'opacity-50 pointer-events-none' : ''
             }`}
           >
             {gradingLoading ? (
               <span className="flex items-center gap-2">
                 <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2050/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
                 AI 채점 진행 중...
               </span>
             ) : '제출하고 채점하기 (2단계: 비교표) →'}
           </button>
         </div>
       )}
 
       {isOverviewReview && isSecondTableGraded && (
         <div className="my-4 w-full">
           {renderStepFeedback(secondTableInputs, "⚖️ [2단계: 비교표] 채점 피드백")}
         </div>
       )}
    </div>
  );
});
