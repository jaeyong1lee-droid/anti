const fs = require('fs');
const filePath = 'client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF
content = content.replace(/\r\n/g, '\n');

const startTag = '<div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-24 flex-shrink-0 items-stretch justify-start overflow-y-auto">';

// Find all indices of startTag
let indices = [];
let idx = content.indexOf(startTag);
while (idx !== -1) {
  indices.push(idx);
  idx = content.indexOf(startTag, idx + 1);
}

console.log(`Found ${indices.length} occurrences of the button strip.`);

if (indices.length < 5) {
  console.log("Error: Expected at least 5 occurrences!");
  process.exit(1);
}

const formulaIdx = indices[2]; // 3rd occurrence
const theoryIdx = indices[3];  // 4th occurrence
const answersheetIdx = indices[4]; // 5th occurrence

// Replacement strings
const formulaNewStrip = `            {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
            <div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-40 flex-shrink-0 items-stretch justify-start overflow-y-auto scrollbar-none">
              {lastActiveReview && (
                <button
                  onClick={() => {
                    handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                    setShowFormulaExam(false);
                    handleOpenLastActiveReview();
                  }}
                  className="flex bg-yellow-50 border border-yellow-200/80 rounded-xl p-2 items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 text-left w-full select-none"
                  title="공부중 복습 이어서 진행"
                >
                  <Clock size={12} className="text-slate-950 shrink-0" />
                  <span className="text-[9px] font-black text-slate-950 truncate text-ellipsis overflow-hidden whitespace-nowrap max-w-[80px]">공부중: {lastActiveReview.title}</span>
                </button>
              )}

              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                  setShowFormulaExam(false);
                  setViewMode('dashboard');
                  setSelectedTopic(null);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <Calendar size={12} />
                <span>오늘의 복습</span>
              </button>

              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                  setShowFormulaExam(false);
                  setViewMode('all_topics');
                  setSelectedTopic(null);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <List size={12} />
                <span>복습토픽</span>
              </button>

              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                  setShowFormulaExam(false);
                  handleOpenExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-amber-400 border-slate-800/80 hover:text-amber-200 hover:bg-amber-950/40 transition-all cursor-pointer"
              >
                <Award size={12} />
                <span>종합평가</span>
              </button>

              <button
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-gradient-to-tr from-rose-600 to-pink-500 text-white border-rose-500 shadow-lg select-none cursor-default"
              >
                <Sigma size={12} />
                <span>필수공식</span>
              </button>

              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                  setShowFormulaExam(false);
                  handleOpenTheoryExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-indigo-400 border-slate-800/80 hover:text-indigo-200 hover:bg-indigo-950/40 transition-all cursor-pointer"
              >
                <Brain size={12} />
                <span>이론유도</span>
              </button>

              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                  setShowFormulaExam(false);
                  handleOpenAnswerSheet();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-emerald-400 border-slate-800/80 hover:text-emerald-200 hover:bg-emerald-950/40 transition-all cursor-pointer"
              >
                <FileText size={12} />
                <span>답안지</span>
              </button>

              <div className="h-px bg-slate-800/60 my-1 shrink-0" />

              <button
                onClick={() => {
                  const newFormula = {
                    title: "",
                    concept: "",
                    formula: "",
                    isDirectlyAdded: true
                  };
                  const updated = [...formulaQuestions, newFormula];
                  latestFormulaQuestionsRef.current = updated;
                  setFormulaQuestions(updated);
                  localStorage.setItem('anti_formula_questions', JSON.stringify(updated));
                  showNotification('새로운 필수 공식 카드 기출 빈표가 성공적으로 추가되었습니다.', 'success');
                  setTimeout(() => {
                    if (formulaBodyRef.current) {
                      formulaBodyRef.current.scrollTo({
                        top: formulaBodyRef.current.scrollHeight,
                        behavior: 'smooth'
                      });
                    }
                  }, 80);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-rose-950/80 hover:bg-rose-900 text-rose-300 hover:text-white border-rose-500/40 transition-all cursor-pointer active:scale-95"
              >
                <PlusCircle size={12} className="text-rose-400" />
                <span>공식 추가</span>
              </button>

              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, true);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 hover:text-white border-emerald-500/20 transition-all cursor-pointer active:scale-95"
              >
                <Save size={12} className="text-emerald-400" />
                <span>실시간 저장</span>
              </button>

              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false);
                  savedFormulaScroll.current = formulaBodyRef.current?.scrollTop || 0;
                  setFormulaSearchQuery('');
                  setShowFormulaExam(false);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900 text-slate-300 hover:text-white border-slate-800 hover:bg-slate-800/50 transition-all cursor-pointer active:scale-95"
              >
                <span className="text-[10px]">❌</span>
                <span>닫기</span>
              </button>
            </div>`;

const theoryNewStrip = `            {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
            <div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-40 flex-shrink-0 items-stretch justify-start overflow-y-auto scrollbar-none">
              {lastActiveReview && (
                <button
                  onClick={() => {
                    handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, false);
                    setShowTheoryExam(false);
                    handleOpenLastActiveReview();
                  }}
                  className="flex bg-yellow-50 border border-yellow-200/80 rounded-xl p-2 items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 text-left w-full select-none"
                  title="공부중 복습 이어서 진행"
                >
                  <Clock size={12} className="text-slate-950 shrink-0" />
                  <span className="text-[9px] font-black text-slate-950 truncate text-ellipsis overflow-hidden whitespace-nowrap max-w-[80px]">공부중: {lastActiveReview.title}</span>
                </button>
              )}

              <button
                onClick={() => {
                  handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, false);
                  setShowTheoryExam(false);
                  setViewMode('dashboard');
                  setSelectedTopic(null);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <Calendar size={12} />
                <span>오늘의 복습</span>
              </button>

              <button
                onClick={() => {
                  handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, false);
                  setShowTheoryExam(false);
                  setViewMode('all_topics');
                  setSelectedTopic(null);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <List size={12} />
                <span>복습토픽</span>
              </button>

              <button
                onClick={() => {
                  handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, false);
                  setShowTheoryExam(false);
                  handleOpenExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-amber-400 border-slate-800/80 hover:text-amber-200 hover:bg-amber-950/40 transition-all cursor-pointer"
              >
                <Award size={12} />
                <span>종합평가</span>
              </button>

              <button
                onClick={() => {
                  handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, false);
                  setShowTheoryExam(false);
                  handleOpenFormulaExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-rose-400 border-slate-800/80 hover:text-rose-200 hover:bg-rose-950/40 transition-all cursor-pointer"
              >
                <Sigma size={12} />
                <span>필수공식</span>
              </button>

              <button
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-gradient-to-tr from-indigo-600 to-blue-500 text-white border-indigo-500 shadow-lg select-none cursor-default"
              >
                <Brain size={12} />
                <span>이론유도</span>
              </button>

              <button
                onClick={() => {
                  handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, false);
                  setShowTheoryExam(false);
                  handleOpenAnswerSheet();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-emerald-400 border-slate-800/80 hover:text-emerald-200 hover:bg-emerald-950/40 transition-all cursor-pointer"
              >
                <FileText size={12} />
                <span>답안지</span>
              </button>

              <div className="h-px bg-slate-800/60 my-1 shrink-0" />

              <button
                onClick={() => {
                  const newTheory = {
                    title: "",
                    concept: "",
                    assumptions: "",
                    formula: "",
                    isDirectlyAdded: true
                  };
                  const updated = [...theoryQuestions, newTheory];
                  latestTheoryQuestionsRef.current = updated;
                  setTheoryQuestions(updated);
                  localStorage.setItem('anti_theory_questions', JSON.stringify(updated));
                  showNotification('새로운 이론 카드 기출 빈표가 성공적으로 추가되었습니다.', 'success');
                  setTimeout(() => {
                    if (theoryBodyRef.current) {
                      theoryBodyRef.current.scrollTo({
                        top: theoryBodyRef.current.scrollHeight,
                        behavior: 'smooth'
                      });
                    }
                  }, 80);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-indigo-950/80 hover:bg-indigo-905 text-indigo-300 hover:text-white border-indigo-500/40 transition-all cursor-pointer active:scale-95"
              >
                <PlusCircle size={12} className="text-indigo-400" />
                <span>이론 추가</span>
              </button>

              <button
                onClick={() => {
                  handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, true);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 hover:text-white border-emerald-500/20 transition-all cursor-pointer active:scale-95"
              >
                <Save size={12} className="text-emerald-400" />
                <span>실시간 저장</span>
              </button>

              <button
                onClick={() => {
                  handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, false);
                  savedTheoryScroll.current = theoryBodyRef.current?.scrollTop || 0;
                  setTheorySearchQuery('');
                  setShowTheoryExam(false);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900 text-slate-300 hover:text-white border-slate-800 hover:bg-slate-800/50 transition-all cursor-pointer active:scale-95"
              >
                <span className="text-[10px]">❌</span>
                <span>닫기</span>
              </button>
            </div>`;

const answersheetNewStrip = `            {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
            <div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-40 flex-shrink-0 items-stretch justify-start overflow-y-auto scrollbar-none">
              {lastActiveReview && (
                <button
                  onClick={() => {
                    handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                    setShowAnswerSheet(false);
                    handleOpenLastActiveReview();
                  }}
                  className="flex bg-yellow-50 border border-yellow-200/80 rounded-xl p-2 items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 text-left w-full select-none"
                  title="공부중 복습 이어서 진행"
                >
                  <Clock size={12} className="text-slate-950 shrink-0" />
                  <span className="text-[9px] font-black text-slate-950 truncate text-ellipsis overflow-hidden whitespace-nowrap max-w-[80px]">공부중: {lastActiveReview.title}</span>
                </button>
              )}

              <button
                onClick={() => {
                  handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                  setShowAnswerSheet(false);
                  setViewMode('dashboard');
                  setSelectedTopic(null);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <Calendar size={12} />
                <span>오늘의 복습</span>
              </button>

              <button
                onClick={() => {
                  handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                  setShowAnswerSheet(false);
                  setViewMode('all_topics');
                  setSelectedTopic(null);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <List size={12} />
                <span>복습토픽</span>
              </button>

              <button
                onClick={() => {
                  handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                  setShowAnswerSheet(false);
                  handleOpenExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-amber-400 border-slate-800/80 hover:text-amber-200 hover:bg-amber-950/40 transition-all cursor-pointer"
              >
                <Award size={12} />
                <span>종합평가</span>
              </button>

              <button
                onClick={() => {
                  handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                  setShowAnswerSheet(false);
                  handleOpenFormulaExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-rose-400 border-slate-800/80 hover:text-rose-200 hover:bg-rose-950/40 transition-all cursor-pointer"
              >
                <Sigma size={12} />
                <span>필수공식</span>
              </button>

              <button
                onClick={() => {
                  handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                  setShowAnswerSheet(false);
                  handleOpenTheoryExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-indigo-400 border-slate-800/80 hover:text-indigo-200 hover:bg-indigo-950/40 transition-all cursor-pointer"
              >
                <Brain size={12} />
                <span>이론유도</span>
              </button>

              <button
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-gradient-to-tr from-emerald-600 to-teal-500 text-white border-emerald-500 shadow-lg select-none cursor-default"
              >
                <FileText size={12} />
                <span>답안지</span>
              </button>

              <div className="h-px bg-slate-800/60 my-1 shrink-0" />

              <button
                onClick={() => {
                  const newItem = {
                    title: "",
                    concept: "",
                    assumptions: "",
                    formula: "",
                    isDirectlyAdded: true
                  };
                  const updated = [...answersheetQuestions, newItem];
                  latestAnswersheetQuestionsRef.current = updated;
                  setAnswersheetQuestions(updated);
                  localStorage.setItem('anti_answersheet_questions', JSON.stringify(updated));
                  showNotification('새로운 답안지 카드 기출 빈표가 성공적으로 추가되었습니다.', 'success');
                  setTimeout(() => {
                    if (answersheetBodyRef.current) {
                      answersheetBodyRef.current.scrollTo({
                        top: answersheetBodyRef.current.scrollHeight,
                        behavior: 'smooth'
                      });
                    }
                  }, 80);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-emerald-950/80 hover:bg-emerald-905 text-emerald-300 hover:text-white border-emerald-500/40 transition-all cursor-pointer active:scale-95"
              >
                <PlusCircle size={12} className="text-emerald-400" />
                <span>답안 추가</span>
              </button>

              <button
                onClick={async () => {
                  await handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, true);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 hover:text-white border-emerald-500/20 transition-all cursor-pointer active:scale-95"
              >
                <Save size={12} className="text-emerald-400" />
                <span>실시간 저장</span>
              </button>

              <button
                onClick={async () => {
                  await handleSaveAnswersheetQuestions(latestAnswersheetQuestionsRef.current, false);
                  savedAnswersheetScroll.current = answersheetBodyRef.current?.scrollTop || 0;
                  setAnswersheetSearchQuery('');
                  setShowAnswerSheet(false);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900 text-slate-300 hover:text-white border-slate-800 hover:bg-slate-800/50 transition-all cursor-pointer active:scale-95"
              >
                <span className="text-[10px]">❌</span>
                <span>닫기</span>
              </button>
            </div>`;

// Replace functions to safely isolate slice
function replaceStripAtIndex(startIdx, replacement) {
  // Find first closing </div> after startIdx
  const closeIdx = content.indexOf('</div>', startIdx);
  if (closeIdx === -1) {
    console.log("Error: closing </div> not found after position " + startIdx);
    process.exit(1);
  }
  const endIdx = closeIdx + '</div>'.length;
  content = content.slice(0, startIdx) + replacement + content.slice(endIdx);
}

// We must replace them in reverse order of index to avoid offset shifting!
replaceStripAtIndex(answersheetIdx, answersheetNewStrip);
replaceStripAtIndex(theoryIdx, theoryNewStrip);
replaceStripAtIndex(formulaIdx, formulaNewStrip);

// 4. Hide Gemini Sidebar for Formula
const formulaTutorOld = `<div className="w-full max-w-full landscape-w-45 min-w-0 shrink-0 md:w-[35vw] md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col">`;
const formulaTutorNew = `<div className="w-full max-w-full landscape-hide min-w-0 shrink-0 md:w-[35vw] md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col">`;
content = content.replace(formulaTutorOld, formulaTutorNew);

// 5. Hide Gemini Sidebar for Theory
const theoryTutorOld = `<div className="w-full max-w-full landscape-w-45 min-w-0 shrink-0 md:w-[35vw] md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col">`;
const theoryTutorNew = `<div className="w-full max-w-full landscape-hide min-w-0 shrink-0 md:w-[35vw] md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col">`;
content = content.replace(theoryTutorOld, theoryTutorNew);

// 6. Hide Gemini Sidebar for Answer Sheet
const answersheetTutorOld = `<div className="w-full max-w-full landscape-w-45 min-w-0 shrink-0 md:w-[35vw] md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col">`;
const answersheetTutorNew = `<div className="w-full max-w-full landscape-hide min-w-0 shrink-0 md:w-[35vw] md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col">`;
content = content.replace(answersheetTutorOld, answersheetTutorNew);

// 7. Hide Edit icon button for Formula title
const formulaEditButtonOld = `<button
                                    onClick={() => {
                                      setEditingFormulaIdx(idx);
                                      setEditingFormulaText(q.title || q.question || '');
                                    }}
                                    className="p-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 hover:border-yellow-500/50 rounded-lg text-yellow-400 transition-all duration-150 cursor-pointer shrink-0 inline-flex items-center justify-center hover:scale-105 active:scale-95 shadow-[0_2px_8px_rgba(234,179,8,0.1)]"
                                    title="공식 제목 수정"
                                  >
                                    <Edit2 size={12} />
                                  </button>`;

const formulaEditButtonNew = `<button
                                    onClick={() => {
                                      setEditingFormulaIdx(idx);
                                      setEditingFormulaText(q.title || q.question || '');
                                    }}
                                    className="p-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 hover:border-yellow-500/50 rounded-lg text-yellow-400 transition-all duration-150 cursor-pointer shrink-0 inline-flex items-center justify-center hover:scale-105 active:scale-95 shadow-[0_2px_8px_rgba(234,179,8,0.1)] landscape-hide"
                                    title="공식 제목 수정"
                                  >
                                    <Edit2 size={12} />
                                  </button>`;
content = content.replace(formulaEditButtonOld, formulaEditButtonNew);

// 8. Hide Edit icon button for Theory title
const theoryEditButtonOld = `<button
                                    onClick={() => {
                                      setEditingTheoryIdx(idx);
                                      setEditTheoryTitle(q.title || '');
                                    }}
                                    className="p-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 hover:border-yellow-500/50 rounded-lg text-yellow-400 transition-all duration-150 cursor-pointer shrink-0 inline-flex items-center justify-center hover:scale-105 active:scale-95 shadow-[0_2px_8px_rgba(234,179,8,0.1)]"
                                    title="이론 제목 수정"
                                  >
                                    <Edit2 size={12} />
                                  </button>`;

const theoryEditButtonNew = `<button
                                    onClick={() => {
                                      setEditingTheoryIdx(idx);
                                      setEditTheoryTitle(q.title || '');
                                    }}
                                    className="p-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 hover:border-yellow-500/50 rounded-lg text-yellow-400 transition-all duration-150 cursor-pointer shrink-0 inline-flex items-center justify-center hover:scale-105 active:scale-95 shadow-[0_2px_8px_rgba(234,179,8,0.1)] landscape-hide"
                                    title="이론 제목 수정"
                                  >
                                    <Edit2 size={12} />
                                  </button>`;
content = content.replace(theoryEditButtonOld, theoryEditButtonNew);

// 9. Hide Edit icon button for Answer Sheet title
const answersheetEditButtonOld = `<button
                                    onClick={() => {
                                      setEditingAnswersheetIdx(idx);
                                      setEditAnswersheetTitle(q.title || '');
                                    }}
                                    className="p-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 hover:border-yellow-500/50 rounded-lg text-yellow-400 transition-all duration-150 cursor-pointer shrink-0 inline-flex items-center justify-center hover:scale-105 active:scale-95 mt-0.5"
                                    title="답안 제목 수정"
                                  >
                                    <Edit2 size={10} />
                                  </button>`;

const answersheetEditButtonNew = `<button
                                    onClick={() => {
                                      setEditingAnswersheetIdx(idx);
                                      setEditAnswersheetTitle(q.title || '');
                                    }}
                                    className="p-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 hover:border-yellow-500/50 rounded-lg text-yellow-400 transition-all duration-150 cursor-pointer shrink-0 inline-flex items-center justify-center hover:scale-105 active:scale-95 mt-0.5 landscape-hide"
                                    title="답안 제목 수정"
                                  >
                                    <Edit2 size={10} />
                                  </button>`;
content = content.replace(answersheetEditButtonOld, answersheetEditButtonNew);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully patched client/src/App.jsx!");
