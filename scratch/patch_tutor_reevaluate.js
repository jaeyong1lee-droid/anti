const fs = require('fs');

const filePath = 'C:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Helper for replacement
const replaceSub = (target, replacement) => {
  if (content.includes(target)) {
    content = content.replace(target, replacement);
    console.log('Replaced standard target');
  } else {
    const targetLF = target.replace(/\r\n/g, '\n');
    const contentLF = content.replace(/\r\n/g, '\n');
    if (contentLF.includes(targetLF)) {
      content = contentLF.replace(targetLF, replacement.replace(/\r\n/g, '\n'));
      console.log('Replaced normalized target');
    } else {
      console.warn('Target not found:', target.substring(0, 100));
    }
  }
};

// 1) Review Page Question Text layout & Re-evaluate button
const reviewQuestionTarget = `                        {(() => {
                          const { questionText, tableData } = parseQuestionTable(q, selectedTopic?.title);
                          const cleanQuestionText = questionText.replace(/\\r?\\n/g, ' ').replace(/\\s+/g, ' ');
                          return (
                            <>
                              <div className="text-[17px] font-bold text-white leading-relaxed">
                                <LatexRenderer text={cleanQuestionText} katexLoaded={katexLoaded} enableAddFormula={true} />
                              </div>
                              {isMC && tableData && (
                                <ReadOnlyTable tableData={tableData} katexLoaded={katexLoaded} />
                              )}
                            </>
                          );
                        })()}`;

const reviewQuestionReplacement = `                        {(() => {
                          const { questionText, tableData } = parseQuestionTable(q, selectedTopic?.title);
                          const cleanQuestionText = questionText.replace(/\\r?\\n/g, ' ').replace(/\\s+/g, ' ');
                          return (
                            <>
                              <div className="flex justify-between items-start gap-3 w-full">
                                <div className="text-[17px] font-bold text-white leading-relaxed flex-grow text-left">
                                  <LatexRenderer text={cleanQuestionText} katexLoaded={katexLoaded} enableAddFormula={true} />
                                </div>
                                {isSubj && isRevd && idx !== 1 && (
                                  <div className="flex-shrink-0 pt-0.5">
                                    <button
                                      onClick={async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (q.type === '주관식 (표채우기)') {
                                          await gradeTableQuestion(idx, q);
                                        } else {
                                          await gradeSubjectiveQuestion(idx, q);
                                        }
                                      }}
                                      disabled={gradingLoading[idx]}
                                      className="px-2.5 py-0.5 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-[11px] text-slate-350 hover:text-white border border-slate-700 hover:border-slate-500 rounded font-bold cursor-pointer transition-all flex items-center gap-1 shadow-md whitespace-nowrap"
                                      title="AI에게 답안 재채점 요청"
                                    >
                                      {gradingLoading[idx] ? (
                                        <RefreshCw size={10} className="animate-spin text-slate-400" />
                                      ) : (
                                        <RefreshCw size={10} className="text-slate-400" />
                                      )}
                                      <span>재평가</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                              {isMC && tableData && (
                                <ReadOnlyTable tableData={tableData} katexLoaded={katexLoaded} />
                              )}
                            </>
                          );
                        })()}`;

replaceSub(reviewQuestionTarget, reviewQuestionReplacement);

// 2) Exam Page Question Text layout & Re-evaluate button
const examQuestionTarget = `                      {(() => {
                        const { questionText, tableData } = parseQuestionTable(q, examTopic?.title);
                        const cleanQuestionText = questionText.replace(/\\r?\\n/g, ' ').replace(/\\s+/g, ' ');
                        return (
                          <>
                            <div className="text-[17px] font-bold text-white leading-relaxed">
                              <LatexRenderer text={cleanQuestionText} katexLoaded={katexLoaded} enableAddFormula={true} />
                            </div>
                            {isMC && tableData && (
                              <ReadOnlyTable tableData={tableData} katexLoaded={katexLoaded} />
                            )}
                          </>
                        );
                      })()}`;

const examQuestionReplacement = `                      {(() => {
                        const { questionText, tableData } = parseQuestionTable(q, examTopic?.title);
                        const cleanQuestionText = questionText.replace(/\\r?\\n/g, ' ').replace(/\\s+/g, ' ');
                        return (
                          <>
                            <div className="flex justify-between items-start gap-3 w-full">
                              <div className="text-[17px] font-bold text-white leading-relaxed flex-grow text-left">
                                <LatexRenderer text={cleanQuestionText} katexLoaded={katexLoaded} enableAddFormula={true} />
                              </div>
                              {isSubj && isRevd && idx !== 1 && (
                                <div className="flex-shrink-0 pt-0.5">
                                  <button
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (q.type === '주관식 (표채우기)') {
                                        await gradeTableQuestion(idx, q);
                                      } else {
                                        await gradeSubjectiveQuestion(idx, q);
                                      }
                                    }}
                                    disabled={gradingLoading[idx]}
                                    className="px-2.5 py-0.5 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-[11px] text-slate-350 hover:text-white border border-slate-700 hover:border-slate-500 rounded font-bold cursor-pointer transition-all flex items-center gap-1 shadow-md whitespace-nowrap"
                                    title="AI에게 답안 재채점 요청"
                                  >
                                    {gradingLoading[idx] ? (
                                      <RefreshCw size={10} className="animate-spin text-slate-400" />
                                    ) : (
                                      <RefreshCw size={10} className="text-slate-400" />
                                    )}
                                    <span>재평가</span>
                                  </button>
                                </div>
                              )}
                            </div>
                            {isMC && tableData && (
                              <ReadOnlyTable tableData={tableData} katexLoaded={katexLoaded} />
                            )}
                          </>
                        );
                      })()}`;

replaceSub(examQuestionTarget, examQuestionReplacement);

// 3) Review Page Input Field & Score
const reviewInputTarget = `                                        className={\`w-full bg-slate-900 border focus:border-slate-500 rounded-xl pl-3 pr-[110px] py-2 text-xs focus:outline-none transition-all \${getSubjectiveColorClasses(idx, isRevd)}\`}
                                      />
                                    {idx !== 1 && tableGradingResults[\`\${idx}_INPUT\`]?.score !== undefined && (
                                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 select-none z-10">
                                        <button
                                          onClick={async (e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            await gradeSubjectiveQuestion(idx, q);
                                          }}
                                          disabled={gradingLoading[idx]}
                                          className="px-2.5 py-0.5 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-[11px] text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded font-bold cursor-pointer transition-all flex items-center gap-1"
                                          title="AI에게 답안 재채점 요청"
                                        >
                                          {gradingLoading[idx] ? (
                                            <RefreshCw size={10} className="animate-spin text-slate-400" />
                                          ) : (
                                            <RefreshCw size={10} className="text-slate-400" />
                                          )}
                                          <span>재평가</span>
                                        </button>
                                        <span className="text-[10px] font-black text-amber-400 whitespace-nowrap">
                                          {Math.round(((tableGradingResults[\`\${idx}_INPUT\`].score / 10) * W) * 10) / 10}점
                                        </span>
                                      </div>
                                    )}`;

const reviewInputReplacement = `                                        className={\`w-full bg-slate-900 border focus:border-slate-500 rounded-xl pl-3 pr-[60px] py-2 text-xs focus:outline-none transition-all \${getSubjectiveColorClasses(idx, isRevd)}\`}
                                      />
                                    {idx !== 1 && tableGradingResults[\`\${idx}_INPUT\`]?.score !== undefined && (
                                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 select-none z-10">
                                        <span className="text-[10px] font-black text-amber-400 whitespace-nowrap">
                                          {Math.round(((tableGradingResults[\`\${idx}_INPUT\`].score / 10) * W) * 10) / 10}점
                                        </span>
                                      </div>
                                    )}`;

replaceSub(reviewInputTarget, reviewInputReplacement);

// 4) Exam Page Input Field & Score
const examInputTarget = `                                        className={\`w-full bg-slate-900 border focus:border-amber-500 rounded-xl pl-3 pr-[110px] py-2 text-xs focus:outline-none transition-all \${getSubjectiveColorClasses(idx, !!examRevealed[idx])}\`}
                                      />
                                    {idx !== 1 && tableGradingResults[\`\${idx}_INPUT\`]?.score !== undefined && (
                                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 select-none z-10">
                                        <button
                                          onClick={async (e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            await gradeSubjectiveQuestion(idx, q);
                                          }}
                                          disabled={gradingLoading[idx]}
                                          className="px-2.5 py-0.5 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-[11px] text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded font-bold cursor-pointer transition-all flex items-center gap-1"
                                          title="AI에게 답안 재채점 요청"
                                        >
                                          {gradingLoading[idx] ? (
                                            <RefreshCw size={10} className="animate-spin text-slate-400" />
                                          ) : (
                                            <RefreshCw size={10} className="text-slate-400" />
                                          )}
                                          <span>재평가</span>
                                        </button>
                                        <span className="text-[10px] font-black text-amber-400 whitespace-nowrap">
                                          {Math.round(((tableGradingResults[\`\${idx}_INPUT\`].score / 10) * W) * 10) / 10}점
                                        </span>
                                      </div>
                                    )}`;

const examInputReplacement = `                                        className={\`w-full bg-slate-900 border focus:border-amber-500 rounded-xl pl-3 pr-[60px] py-2 text-xs focus:outline-none transition-all \${getSubjectiveColorClasses(idx, !!examRevealed[idx])}\`}
                                      />
                                    {idx !== 1 && tableGradingResults[\`\${idx}_INPUT\`]?.score !== undefined && (
                                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 select-none z-10">
                                        <span className="text-[10px] font-black text-amber-400 whitespace-nowrap">
                                          {Math.round(((tableGradingResults[\`\${idx}_INPUT\`].score / 10) * W) * 10) / 10}점
                                        </span>
                                      </div>
                                    )}`;

replaceSub(examInputTarget, examInputReplacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished writing re-evaluate positioning updates.');
