const fs = require('fs');

// Patch App.jsx
const appPath = 'client/src/App.jsx';
let appContent = fs.readFileSync(appPath, 'utf8');

// Normalize line endings
appContent = appContent.replace(/\r\n/g, '\n');

const startTag = '<div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-24 flex-shrink-0 items-stretch justify-start overflow-y-auto">';

// Find all indices of startTag
let indices = [];
let idx = appContent.indexOf(startTag);
while (idx !== -1) {
  indices.push(idx);
  idx = appContent.indexOf(startTag, idx + 1);
}

console.log(`Found ${indices.length} occurrences of the button strip in App.jsx.`);

if (indices.length < 2) {
  console.log("Error: Expected at least 2 occurrences for Review and Exam modals!");
  process.exit(1);
}

const reviewIdx = indices[0];
const examIdx = indices[1];

const reviewNewStrip = `            {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
            <div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-40 flex-shrink-0 items-stretch justify-start overflow-y-auto scrollbar-none">
              {lastActiveReview && (
                <button
                  onClick={() => {
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
                  forceSaveActiveSessions();
                  setSelectedTopic(null);
                  setViewMode('dashboard');
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <Calendar size={12} />
                <span>오늘의 복습</span>
              </button>

              <button
                onClick={() => {
                  forceSaveActiveSessions();
                  setSelectedTopic(null);
                  setViewMode('all_topics');
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <List size={12} />
                <span>복습토픽</span>
              </button>

              <button
                onClick={() => {
                  forceSaveActiveSessions();
                  setSelectedTopic(null);
                  handleOpenExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-amber-400 border-slate-800/80 hover:text-amber-200 hover:bg-amber-950/40 transition-all cursor-pointer"
              >
                <Award size={12} />
                <span>종합평가</span>
              </button>

              <button
                onClick={() => {
                  forceSaveActiveSessions();
                  setSelectedTopic(null);
                  handleOpenFormulaExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-rose-400 border-slate-800/80 hover:text-rose-200 hover:bg-rose-950/40 transition-all cursor-pointer"
              >
                <Sigma size={12} />
                <span>필수공식</span>
              </button>

              <button
                onClick={() => {
                  forceSaveActiveSessions();
                  setSelectedTopic(null);
                  handleOpenTheoryExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-indigo-400 border-slate-800/80 hover:text-indigo-200 hover:bg-indigo-950/40 transition-all cursor-pointer"
              >
                <Brain size={12} />
                <span>이론유도</span>
              </button>

              <button
                onClick={() => {
                  forceSaveActiveSessions();
                  setSelectedTopic(null);
                  handleOpenAnswerSheet();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-emerald-400 border-slate-800/80 hover:text-emerald-200 hover:bg-emerald-950/40 transition-all cursor-pointer"
              >
                <FileText size={12} />
                <span>답안지</span>
              </button>

              <div className="h-px bg-slate-800/60 my-1 shrink-0" />

              {selectedTopic?.pdf_name && (
                <button
                  onClick={handleOpenOriginalReport}
                  className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-violet-950/80 hover:bg-violet-900 text-violet-300 hover:text-white border-violet-500/40 transition-all cursor-pointer active:scale-95"
                  title="원본 보고서 파일(HTML/PDF) 팝업 열기"
                >
                  <FileText size={12} className="text-violet-400" />
                  <span>원보고서</span>
                </button>
              )}

              {selectedTopic?.schedule_id && selectedTopic?.schedule_id !== 9999 && (
                <button
                  onClick={() => {
                    setSelectedTopic(null);
                    setAiQuestions([]);
                    setRevealedQuestions({});
                    setSelectedAnswers({});
                    setReviewOptionExplanations({});
                    lastQuizTopicId.current = null;
                    setResetConfirmTarget({
                      scheduleId: selectedTopic.schedule_id,
                      topicTitle: selectedTopic.title,
                      round: selectedTopic.review_round
                    });
                  }}
                  className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-amber-950/80 hover:bg-amber-900 text-amber-300 hover:text-white border-amber-500/40 transition-all cursor-pointer active:scale-95"
                  title="이 복습 회차를 대기 상태로 되돌리고 처음부터 다시 풉니다."
                >
                  <RefreshCw size={12} className="text-amber-400" />
                  <span>다시풀기</span>
                </button>
              )}

              {selectedTopic && (
                <button
                  onClick={handleRefreshReviewQuestions}
                  disabled={loadingAI}
                  className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-violet-950/40 hover:bg-violet-900/60 text-violet-300 hover:text-white border-violet-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  title="주제와 문제가 맞지 않을 때 전체 AI 재출제"
                >
                  {loadingAI ? (
                    <svg className="animate-spin h-3.5 w-3.5 text-violet-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <span className="text-xs">🔄</span>
                  )}
                  <span>리프레쉬</span>
                </button>
              )}

              <button
                onClick={() => { 
                  savedQuizScroll.current = quizBodyRef.current?.scrollTop || 0; 
                  if (selectedTopic?.isReadOnly) {
                    setSelectedTopic(null); 
                  } else {
                    forceSaveActiveSessions();
                    setSelectedTopic(null); 
                  }
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900 text-slate-300 hover:text-white border-slate-800 hover:bg-slate-800/50 transition-all cursor-pointer active:scale-95"
                title={selectedTopic?.isReadOnly ? "화면 닫기" : "화면만 숨김 (재개 시 문제 유지)"}
              >
                <span className="text-[10px]">❌</span>
                <span>닫기</span>
              </button>
            </div>`;

const examNewStrip = `            {/* Left Vertical Button Strip (Visible ONLY in mobile landscape) */}
            <div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-40 flex-shrink-0 items-stretch justify-start overflow-y-auto scrollbar-none">
              {lastActiveReview && (
                <button
                  onClick={() => {
                    savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                    fetch(\`\${API_BASE}/api/session/exam\`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll: savedExamScroll.current }),
                    }).catch(e => console.warn('세션 저장 실패:', e));
                    setShowExam(false);
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
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  fetch(\`\${API_BASE}/api/session/exam\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll: savedExamScroll.current }),
                  }).catch(e => console.warn('세션 저장 실패:', e));
                  setShowExam(false);
                  setViewMode('dashboard');
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <Calendar size={12} />
                <span>오늘의 복습</span>
              </button>

              <button
                onClick={() => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  fetch(\`\${API_BASE}/api/session/exam\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll: savedExamScroll.current }),
                  }).catch(e => console.warn('세션 저장 실패:', e));
                  setShowExam(false);
                  setViewMode('all_topics');
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-slate-400 border-slate-800/80 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <List size={12} />
                <span>복습토픽</span>
              </button>

              <button
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-gradient-to-tr from-amber-600 to-yellow-500 text-white border-amber-500 shadow-lg select-none cursor-default"
              >
                <Award size={12} />
                <span>종합평가</span>
              </button>

              <button
                onClick={() => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  fetch(\`\${API_BASE}/api/session/exam\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll: savedExamScroll.current }),
                  }).catch(e => console.warn('세션 저장 실패:', e));
                  setShowExam(false);
                  handleOpenFormulaExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-rose-400 border-slate-800/80 hover:text-rose-200 hover:bg-rose-950/40 transition-all cursor-pointer"
              >
                <Sigma size={12} />
                <span>필수공식</span>
              </button>

              <button
                onClick={() => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  fetch(\`\${API_BASE}/api/session/exam\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll: savedExamScroll.current }),
                  }).catch(e => console.warn('세션 저장 실패:', e));
                  setShowExam(false);
                  handleOpenTheoryExam();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-indigo-400 border-slate-800/80 hover:text-indigo-200 hover:bg-indigo-950/40 transition-all cursor-pointer"
              >
                <Brain size={12} />
                <span>이론유도</span>
              </button>

              <button
                onClick={() => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  fetch(\`\${API_BASE}/api/session/exam\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ examQuestions, examRevealed, examAnswers, examTopic, savedExamScroll: savedExamScroll.current }),
                  }).catch(e => console.warn('세션 저장 실패:', e));
                  setShowExam(false);
                  handleOpenAnswerSheet();
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900/60 text-emerald-400 border-slate-800/80 hover:text-emerald-200 hover:bg-emerald-950/40 transition-all cursor-pointer"
              >
                <FileText size={12} />
                <span>답안지</span>
              </button>

              <div className="h-px bg-slate-800/60 my-1 shrink-0" />

              <button
                onClick={handleAddExamQuestions}
                disabled={loadingExam}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white border-indigo-500/40 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                title="종합평가에 신규 AI 문제 10문항 추가"
              >
                <span className="text-[10px]">➕</span>
                <span>문제 추가</span>
              </button>
              
              <button
                onClick={handleRefreshExamQuestions}
                disabled={loadingExam}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-violet-950/40 hover:bg-violet-900/60 text-violet-300 hover:text-white border-violet-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                title="종합평가 전체 문제 실시간 AI 재출제"
              >
                <span className="text-xs">🔄</span>
                <span>리프레쉬</span>
              </button>

              <button
                onClick={async () => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  try {
                    const r = await fetch(\`\${API_BASE}/api/session/exam\`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        examQuestions, 
                        examRevealed, 
                        examAnswers, 
                        examTopic,
                        savedExamScroll: savedExamScroll.current 
                      }),
                    });
                    if (!r.ok) throw new Error('서버 응답 오류');
                  } catch (e) {
                    console.warn('세션 저장 실패:', e);
                  }
                  setShowExam(false);
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-slateCustom-900 text-slate-300 hover:text-white border-slate-800 hover:bg-slate-800/50 transition-all cursor-pointer active:scale-95"
                title="화면만 숨김 (재개 시 문제 유지)"
              >
                <span className="text-[10px]">❌</span>
                <span>닫기</span>
              </button>

              <button
                onClick={() => {
                  if (window.confirm("종합평가를 완전히 종료하고 결과 리포트를 저장하시겠습니까?")) {
                    fetch(\`\${API_BASE}/api/session/exam\`, { method: 'DELETE' })
                      .catch(e => console.warn('세션 삭제 실패:', e));
                    setShowExam(false); setExamQuestions([]); setExamRevealed({}); setExamAnswers({}); setExamTopic(null); setExamOptionExplanations({});
                  }
                }}
                className="flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5 rounded-xl border bg-rose-950/60 hover:bg-rose-900/65 text-rose-300 hover:text-white border-rose-500/20 transition-all cursor-pointer active:scale-95"
                title="종합평가 종료"
              >
                <span className="text-xs">⏹️</span>
                <span>종료</span>
              </button>
            </div>`;

function replaceStripAtIndex(startIdx, replacement) {
  const closeIdx = appContent.indexOf('</div>', startIdx);
  if (closeIdx === -1) {
    console.log("Error: closing </div> not found after position " + startIdx);
    process.exit(1);
  }
  const endIdx = closeIdx + '</div>'.length;
  appContent = appContent.slice(0, startIdx) + replacement + appContent.slice(endIdx);
}

// Replace Exam modal first, then Review modal (reverse index order)
replaceStripAtIndex(examIdx, examNewStrip);
replaceStripAtIndex(reviewIdx, reviewNewStrip);

// Patch dashboard buttons inside landscape-dashboard-left
// Let's find: py-3 px-4 in the left sidebar and replace them with py-2 px-2.5
// Also change the size classes inside `landscape-dashboard-left`
// Find the "공부중" button inside App.jsx and replace it
const oldDashboardClock = `            {/* Card 3 (공부중) inside the landscape left menu (at the top) */}
            {lastActiveReview && isMobileLandscape && (
              <button
                onClick={handleOpenLastActiveReview}
                className="flex bg-yellow-50 border border-yellow-200/80 rounded-2xl p-4 items-center gap-3 cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-95 text-left hover:bg-yellow-100 shadow-[0_4px_20px_rgba(253,224,71,0.1)] relative overflow-hidden group select-none w-full mb-4"
                title={\`가장 최근 진행한 복습: [\${lastActiveReview.title}] (클릭 시 이어서 학습)\`}
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-white/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="p-2 bg-slate-950/10 text-slate-900 rounded-lg group-hover:bg-slate-950/15 transition-all duration-300 flex-shrink-0 relative">
                  <Clock size={18} className="text-slate-950" />
                </div>
                <div className="min-w-0 flex-grow relative text-slate-950">
                  <p className="text-[9px] font-black text-slate-900 tracking-wide uppercase flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping mr-1"></span>
                    공부중
                  </p>
                  <h3 className="text-xs font-black text-slate-950 mt-0.5 truncate leading-tight">
                    {lastActiveReview.title}
                  </h3>
                  <p className="text-[9px] text-slate-800 mt-0.5 font-bold truncate">
                    {lastActiveReview.isReadOnly ? '이전 복습 회차 열람 중' : \`\${lastActiveReview.reviewRound}회차 복습 진행 중\`}
                  </p>
                </div>
              </button>
            )}`;

const newDashboardClock = `            {/* Card 3 (공부중) inside the landscape left menu (at the top) */}
            {lastActiveReview && isMobileLandscape && (
              <button
                onClick={handleOpenLastActiveReview}
                className="flex bg-yellow-50 border border-yellow-200/80 rounded-xl p-2 items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 text-left w-full select-none mb-3"
                title={\`가장 최근 진행한 복습: [\${lastActiveReview.title}] (클릭 시 이어서 학습)\`}
              >
                <Clock size={12} className="text-slate-950 shrink-0" />
                <span className="text-[9px] font-black text-slate-950 truncate text-ellipsis overflow-hidden whitespace-nowrap max-w-[80px]">공부중: {lastActiveReview.title}</span>
              </button>
            )}`;

if (appContent.includes(oldDashboardClock)) {
  appContent = appContent.replace(oldDashboardClock, newDashboardClock);
} else {
  console.log("Error: oldDashboardClock not found!");
}

// Update the 6 menu buttons in the dashboard sidebar to use py-2 px-2.5 and text-[11px] gap-2
appContent = appContent.replace(
  /className={`flex items-center gap-2\.5 w-full text-xs font-black py-3 px-4/g,
  "className={`flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5"
);
appContent = appContent.replace(
  /className={`flex items-center gap-2\.5 w-full text-xs font-black py-3 px-4/g,
  "className={`flex items-center gap-2 w-full text-[11px] font-black py-2 px-2.5"
);

fs.writeFileSync(appPath, appContent, 'utf8');
console.log("Successfully patched client/src/App.jsx!");

// Now patch client/src/index.css
const cssPath = 'client/src/index.css';
let cssContent = fs.readFileSync(cssPath, 'utf8');
cssContent = cssContent.replace(/\r\n/g, '\n');

// Replace width and min-width rules for dashboard left sidebar
const oldLeftCss = `  .landscape-dashboard-left {
    width: 240px !important;
    min-width: 240px !important;
    flex-shrink: 0 !important;
  }`;

const newLeftCss = `  .landscape-dashboard-left {
    width: 160px !important;
    min-width: 160px !important;
    flex-shrink: 0 !important;
  }`;

if (cssContent.includes(oldLeftCss)) {
  cssContent = cssContent.replace(oldLeftCss, newLeftCss);
} else {
  console.log("Error: oldLeftCss not found!");
}

// Replace button styles inside dashboard left sidebar
const oldButtonCss = `  .landscape-dashboard-left .glass-panel,
  .landscape-dashboard-left button {
    padding: 10px 14px !important;
    border-radius: 12px !important;
    gap: 10px !important;
  }`;

const newButtonCss = `  .landscape-dashboard-left button {
    padding: 8px 10px !important;
    border-radius: 12px !important;
    gap: 8px !important;
  }`;

if (cssContent.includes(oldButtonCss)) {
  cssContent = cssContent.replace(oldButtonCss, newButtonCss);
} else {
  console.log("Error: oldButtonCss not found!");
}

fs.writeFileSync(cssPath, cssContent, 'utf8');
console.log("Successfully patched client/src/index.css!");
