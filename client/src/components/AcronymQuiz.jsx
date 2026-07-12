import React, { useRef, useState, useEffect } from 'react';
import { LatexRenderer } from './LatexRenderer';
import { BufferedInput, BufferedTextarea } from './BufferedInput';
import { PopoutWindow } from './PopoutWindow';

export const AcronymQuiz = React.memo(function AcronymQuiz({ 
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
  gradingLoading, 
  gradeSingleAcronymCell, 
  cellGradingLoading,
  floatedTableId = null,
  setFloatedTableId = () => {},
  isExam = false
}) {
  if (!q.tableData || !q.tableData.rows) {
    return <div className="text-red-400 text-xs py-2">오류: 앞글자 데이터가 올바르지 않습니다.</div>;
  }

  const { rows } = q.tableData;
  const tableRef = useRef(null);

  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const acronymTableUniqueId = `${isExam ? 'exam' : 'review'}_${questionIdx}_acronym`;
  const isFloated = floatedTableId === acronymTableUniqueId;
  const usePopout = !isMobileView;

  const handleInputChange = (key, val) => {
    if (tableAnswersRef) {
      tableAnswersRef.current[`${questionIdx}_${key}`] = val;
    }
    setTableAnswers(prev => ({
      ...prev,
      [`${questionIdx}_${key}`]: val
    }));
  };

  const handleInputKeystroke = (key, val) => {
    if (tableAnswersRef) {
      tableAnswersRef.current[`${questionIdx}_${key}`] = val;
    }
  };

  const floatedStyleTag = isFloated ? (
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

  const tableTitle = !isFloated ? (
    <div className="flex justify-between items-center w-full mb-1">
      <div className="text-xs sm:text-sm font-extrabold text-slate-400 select-none text-left">
        📋 앞글자 암기표
      </div>
      {!isMobileView && (
        <button
          onClick={() => setFloatedTableId(acronymTableUniqueId)}
          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg text-sm transition-all active:scale-95 select-none font-bold"
          title="표를 화면에 고정하여 편리하게 문제를 풉니다"
        >
          &gt;
        </button>
      )}
    </div>
  ) : null;

  const tableEl = (
    <table ref={tableRef} className="w-full table-fixed text-center border-collapse text-[14px] sm:text-[16px] min-w-[320px] sm:min-w-[600px]">
      <colgroup>
        <col style={{ width: '20%' }} />
        <col style={{ width: '80%' }} />
      </colgroup>
      <thead>
        <tr className="bg-slate-900/80 text-slate-355 border-b border-slate-800">
          <th className="p-2 font-extrabold border-r border-slate-800 select-none">두</th>
          <th className="p-2 font-extrabold select-none">내용 (암기단어 : 설명)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rIdx) => {
          const rowAcronymVal = tableAnswers[`${questionIdx}_ROW_${rIdx}_ACRONYM`] || '';
          const rowCombVal = tableAnswers[`${questionIdx}_ROW_${rIdx}_COMB`] || '';
          
          const rowAcronymGrading = tableGradingResults[`${questionIdx}_ROW_${rIdx}_ACRONYM`];
          const rowCombGrading = tableGradingResults[`${questionIdx}_ROW_${rIdx}_COMB`];

          const acronymScore = ((rowAcronymGrading?.score || 0) / 10) * (weight / (rows.length * 2));
          const combScore = ((rowCombGrading?.score || 0) / 10) * (weight / (rows.length * 2));
          const rowTotalScore = Math.round((acronymScore + combScore) * 10) / 10;
          const isCellLoading = gradingLoading || cellGradingLoading?.[`${questionIdx}_ROW_${rIdx}_COMB`] || cellGradingLoading?.[`${questionIdx}_ROW_${rIdx}_ACRONYM`];

          return (
            <tr key={rIdx} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/20">
              {/* 두문자 글자 입력 cell */}
              <td className="p-0 border-r border-slate-800 align-middle">
                {revealed ? (
                  <div className={`w-full h-full p-0.5 ${
                    rowAcronymGrading?.isCorrect ? 'bg-emerald-950/10 text-emerald-400' : 'bg-rose-950/10 text-rose-400'
                  }`}>
                    <BufferedInput
                      type="text"
                      maxLength={1}
                      disabled={isCellLoading}
                      value={rowAcronymVal}
                      onChange={(val) => handleInputChange(`ROW_${rIdx}_ACRONYM`, val)}
                      onKeystroke={(val) => handleInputKeystroke(`ROW_${rIdx}_ACRONYM`, val)}
                      placeholder="글자"
                      className="w-full text-center text-[14px] sm:text-[16px] bg-transparent border-0 outline-none focus:outline-none focus:ring-0 text-inherit placeholder-slate-500 py-1"
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (gradeSingleAcronymCell && !cellGradingLoading?.[`${questionIdx}_ROW_${rIdx}_ACRONYM`]) {
                            await gradeSingleAcronymCell(questionIdx, q, rIdx);
                          }
                        }
                      }}
                    />
                  </div>
                ) : (
                  <BufferedInput
                    type="text"
                    maxLength={1}
                    disabled={gradingLoading}
                    value={rowAcronymVal}
                    onChange={(val) => handleInputChange(`ROW_${rIdx}_ACRONYM`, val)}
                    onKeystroke={(val) => handleInputKeystroke(`ROW_${rIdx}_ACRONYM`, val)}
                    placeholder="글자"
                    className="w-full text-center text-[14px] sm:text-[16px] bg-slate-900/10 focus:bg-slate-900/40 border-0 outline-none focus:outline-none focus:ring-0 text-slate-100 placeholder-slate-500 py-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (tableRef.current) {
                          const inputs = Array.from(tableRef.current.querySelectorAll('input, textarea'));
                          const curIdx = inputs.indexOf(e.target);
                          if (curIdx !== -1 && curIdx < inputs.length - 1) {
                            inputs[curIdx + 1].focus();
                          }
                        }
                      }
                    }}
                  />
                )}
              </td>
              
              {/* 내용(암기단어 : 설명) 입력 cell */}
              <td className="p-0 align-middle">
                {revealed ? (
                  <div className={`w-full h-full flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-1 p-1 sm:p-1.5 text-[14px] sm:text-[16px] ${
                    rowCombGrading?.isCorrect ? 'bg-emerald-950/20 text-emerald-300' : 'bg-rose-950/20 text-rose-300'
                  }`}>
                    <div className="flex-grow text-left font-medium">
                      <BufferedTextarea
                        value={rowCombVal}
                        disabled={isCellLoading}
                        onChange={(val) => handleInputChange(`ROW_${rIdx}_COMB`, val)}
                        onKeystroke={(val) => handleInputKeystroke(`ROW_${rIdx}_COMB`, val)}
                        placeholder="암기단어 : 설명"
                        className="w-full text-left text-[14px] sm:text-[16px] bg-transparent border-0 outline-none focus:outline-none focus:ring-0 text-inherit placeholder-slate-500 py-1 px-1.5 resize-none min-h-[30px] block font-medium align-middle"
                        rows={1}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (gradeSingleAcronymCell && !cellGradingLoading?.[`${questionIdx}_ROW_${rIdx}_COMB`]) {
                              await gradeSingleAcronymCell(questionIdx, q, rIdx);
                            }
                          }
                        }}
                      />
                    </div>
                    {rowCombGrading && rowCombGrading.score !== undefined && (
                      <button
                        disabled={isCellLoading}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (isCellLoading) return;
                          if (gradeSingleAcronymCell) {
                            await gradeSingleAcronymCell(questionIdx, q, rIdx);
                          } else if (onSubmit) {
                            await onSubmit();
                          }
                        }}
                        title="클릭 시 이 칸의 답안을 재평가합니다"
                        className={`mt-1 sm:mt-0 sm:ml-2 text-center sm:text-right font-extrabold select-none whitespace-nowrap hover:underline active:scale-95 transition-all text-[11px] sm:text-[13px] cursor-pointer bg-transparent border-0 ${
                          rowCombGrading.isCorrect ? 'text-emerald-400' : 'text-rose-400'
                        } ${isCellLoading ? 'animate-pulse' : ''}`}
                        style={{ outline: 'none' }}
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
                          `${rowTotalScore}점 ↻`
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <BufferedTextarea
                    value={rowCombVal}
                    disabled={gradingLoading}
                    onChange={(val) => handleInputChange(`ROW_${rIdx}_COMB`, val)}
                    onKeystroke={(val) => handleInputKeystroke(`ROW_${rIdx}_COMB`, val)}
                    placeholder="암기단어 : 설명"
                    className="w-full text-left text-[14px] sm:text-[16px] bg-slate-900/10 focus:bg-slate-900/40 border-0 outline-none focus:outline-none focus:ring-0 text-slate-100 placeholder-slate-500 py-1 px-2 resize-none min-h-[30px] block"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (tableRef.current) {
                          const inputs = Array.from(tableRef.current.querySelectorAll('input, textarea'));
                          const curIdx = inputs.indexOf(e.target);
                          if (curIdx !== -1) {
                            if (curIdx === inputs.length - 1) {
                              if (onSubmit) onSubmit();
                            } else {
                              inputs[curIdx + 1].focus();
                            }
                          }
                        }
                      }
                    }}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  if (isFloated) {
    if (usePopout) {
      return (
        <PopoutWindow
          title="📌 앞글자 암기표"
          onClose={() => setFloatedTableId(null)}
          initWidth={floatedSize.width}
          initHeight={floatedSize.height}
          storageKey={"anti_popout_table_acronym_" + acronymTableUniqueId}
        >
          <div className="w-full h-full flex flex-col overflow-hidden text-slate-100 p-3 floated-table-quiz">
            {floatedStyleTag}
            <div className="flex-grow overflow-auto">
              {tableEl}
            </div>
          </div>
        </PopoutWindow>
      );
    }
  }

  return (
    <div className="w-full my-3 space-y-4">
      {floatedStyleTag}
      {tableTitle}
      {/* 테이블 입력란 */}
      <div className="w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
        {tableEl}
      </div>
      {revealed && (
        <div className="mt-4 space-y-3">
          {/* 연상문장 */}
          {q.sentence && (
            <div className="p-3 bg-violet-950/20 border border-violet-500/20 text-violet-300 rounded-xl text-xs sm:text-sm font-medium select-text text-left">
              💡 <strong>연상문장</strong>: <LatexRenderer text={q.sentence} katexLoaded={katexLoaded} className="inline" />
            </div>
          )}
        </div>
      )}
    </div>
  );
});
