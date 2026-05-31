import fs from 'fs';
import path from 'path';

const filePath = 'c:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace Review Mode Multiple Choice detailedAnswers block
const reviewMcTarget = `                                      {/* 답안 전문보기 버튼 */}
                                      {!detailedAnswers[\`r_\${idx}\`]?.text && !detailedAnswers[\`r_\${idx}\`]?.loading && (
                                        <button
                                          onClick={() => handleRequestDetailedAnswer(\`r_\${idx}\`, q.question, q.explanation)}
                                          className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                        >
                                          ✨ 답안 전문보기 (AI 심층 해설)
                                        </button>
                                      )}`;

const reviewMcReplacement = `                                      {/* 문제조정 버튼 */}
                                      {adjustingInputKey !== \`r_\${idx}\` && (
                                        <button
                                          onClick={() => setAdjustingInputKey(\`r_\${idx}\`)}
                                          className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                        >
                                          🛠️ 문제조정 (AI 피드백)
                                        </button>
                                      )}`;

const reviewMcResultTarget = `                                    {/* 답안 전문보기 결과 */}
                                    {detailedAnswers[\`r_\${idx}\`]?.loading && (
                                      <div className="text-[10px] text-indigo-400 font-bold animate-pulse py-1">⏳ AI가 심층 해설 작성 중...</div>
                                    )}
                                    {detailedAnswers[\`r_\${idx}\`]?.text && (
                                      <div className="mt-2 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl select-text">
                                        <div className="text-[11px] font-black text-indigo-400 mb-2">✨ AI 심층 해설</div>
                                        <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap select-text">
                                          <LatexRenderer text={detailedAnswers[\`r_\${idx}\`].text} katexLoaded={katexLoaded} />
                                        </div>
                                      </div>
                                    )}`;

const reviewMcResultReplacement = `                                    {/* 문제조정 입력 및 결과 보드 */}
                                    {adjustingInputKey === \`r_\${idx}\` && (
                                      <div className="mt-2 p-3 bg-indigo-950/20 border border-indigo-500/30 rounded-xl w-full">
                                        <label className="block text-[10px] font-black text-indigo-400 mb-1">🛠️ 문제조정 의견을 제시해 주세요:</label>
                                        <textarea
                                          rows={2}
                                          value={adjustingText[\`r_\${idx}\`] || ''}
                                          onChange={(e) => {
                                            const text = e.target.value;
                                            setAdjustingText(prev => ({ ...prev, [\`r_\${idx}\`]: text }));
                                          }}
                                          placeholder="예: 수치를 20m로 변경해줘, 난이도를 낮춰줘 등..."
                                          className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-2 resize-none"
                                        />
                                        <div className="flex gap-2 justify-end">
                                          <button
                                            onClick={() => setAdjustingInputKey(null)}
                                            className="text-[10px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors font-bold cursor-pointer"
                                          >
                                            취소
                                          </button>
                                          <button
                                            onClick={() => handleAdjustQuestion('review', idx, q)}
                                            disabled={adjustingLoading[\`r_\${idx}\`]}
                                            className="text-[10px] px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors font-bold cursor-pointer disabled:opacity-50"
                                          >
                                            {adjustingLoading[\`r_\${idx}\`] ? '조정 중...' : '조정하기'}
                                          </button>
                                        </div>
                                        {adjustingLoading[\`r_\${idx}\`] && (
                                          <div className="text-[10px] text-indigo-400 font-bold animate-pulse py-1.5 mt-2">⏳ AI가 의견을 반영하여 문제를 조율 중입니다...</div>
                                        )}
                                      </div>
                                    )}`;

// 2. Replace Review Mode Subjective detailedAnswers block
const reviewSubjTarget = `                              {/* Detailed Answer Button */}
                              <div className="mt-3 pt-2 border-t border-slate-700/50">
                                {!detailedAnswers[\`r_\${idx}\`]?.text && !detailedAnswers[\`r_\${idx}\`]?.loading ? (
                                  <button
                                    onClick={() => handleRequestDetailedAnswer(\`r_\${idx}\`, q.question, q.answer || q.concept)}
                                    className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all"
                                  >
                                    ✨ 답안 전문보기 (AI 심층 해설)
                                  </button>
                                ) : detailedAnswers[\`r_\${idx}\`]?.loading ? (
                                  <div className="text-[10px] text-indigo-400 font-bold animate-pulse">⏳ AI가 심층 해설 작성 중...</div>
                                ) : (
                                  <div className="mt-2 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl">
                                    <div className="text-[11px] font-black text-indigo-400 mb-2">✨ AI 심층 해설</div>
                                    <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                                      <LatexRenderer text={detailedAnswers[\`r_\${idx}\`].text} katexLoaded={katexLoaded} />
                                    </div>
                                  </div>
                                )}
                              </div>`;

const reviewSubjReplacement = `                              {/* 문제조정 입력 및 결과 보드 */}
                              <div className="mt-3 pt-2 border-t border-slate-700/50">
                                {adjustingInputKey !== \`r_\${idx}\` ? (
                                  <button
                                    onClick={() => setAdjustingInputKey(\`r_\${idx}\`)}
                                    className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                  >
                                    🛠️ 문제조정 (AI 피드백)
                                  </button>
                                ) : (
                                  <div className="mt-2 p-3 bg-indigo-950/20 border border-indigo-500/30 rounded-xl w-full">
                                    <label className="block text-[10px] font-black text-indigo-400 mb-1">🛠️ 문제조정 의견을 제시해 주세요:</label>
                                    <textarea
                                      rows={2}
                                      value={adjustingText[\`r_\${idx}\`] || ''}
                                      onChange={(e) => {
                                        const text = e.target.value;
                                        setAdjustingText(prev => ({ ...prev, [\`r_\${idx}\`]: text }));
                                      }}
                                      placeholder="예: 수치를 20m로 변경해줘, 난이도를 낮춰줘 등..."
                                      className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-2 resize-none"
                                    />
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        onClick={() => setAdjustingInputKey(null)}
                                        className="text-[10px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors font-bold cursor-pointer"
                                      >
                                        취소
                                      </button>
                                      <button
                                        onClick={() => handleAdjustQuestion('review', idx, q)}
                                        disabled={adjustingLoading[\`r_\${idx}\`]}
                                        className="text-[10px] px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors font-bold cursor-pointer disabled:opacity-50"
                                      >
                                        {adjustingLoading[\`r_\${idx}\`] ? '조정 중...' : '조정하기'}
                                      </button>
                                    </div>
                                    {adjustingLoading[\`r_\${idx}\`] && (
                                      <div className="text-[10px] text-indigo-400 font-bold animate-pulse py-1.5 mt-2">⏳ AI가 의견을 반영하여 문제를 조율 중입니다...</div>
                                    )}
                                  </div>
                                )}
                              </div>`;

// 3. Replace Exam Mode Multiple Choice detailedAnswers block
const examMcTarget = `                                  {/* 답안 전문보기 버튼 */}
                                  {!detailedAnswers[idx]?.text && !detailedAnswers[idx]?.loading && (
                                    <button
                                      onClick={() => handleRequestDetailedAnswer(idx, q.question, q.explanation)}
                                      className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                    >
                                      ✨ 답안 전문보기 (AI 심층 해설)
                                    </button>
                                  )}`;

const examMcReplacement = `                                  {/* 문제조정 버튼 */}
                                  {adjustingInputKey !== \`e_\${idx}\` && (
                                    <button
                                      onClick={() => setAdjustingInputKey(\`e_\${idx}\`)}
                                      className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                    >
                                      🛠️ 문제조정 (AI 피드백)
                                    </button>
                                  )}`;

const examMcResultTarget = `                                {/* 답안 전문보기 결과 */}
                                {detailedAnswers[idx]?.loading && (
                                  <div className="text-[10px] text-indigo-400 font-bold animate-pulse py-1">
                                    ⏳ AI가 기술사 수준의 심층 해설을 작성 중입니다...
                                  </div>
                                )}
                                {detailedAnswers[idx]?.text && (
                                  <div className="mt-2 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl select-text">
                                    <div className="text-[11px] font-black text-indigo-400 mb-2">✨ AI 심층 해설</div>
                                    <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap select-text prose prose-invert max-w-none prose-base">
                                      <LatexRenderer text={detailedAnswers[idx].text} katexLoaded={katexLoaded} />
                                    </div>
                                    {detailedAnswers[idx].error && (
                                      <div className="text-xs text-rose-400 mt-2 select-text">{detailedAnswers[idx].error}</div>
                                    )}
                                  </div>
                                )}`;

const examMcResultReplacement = `                                {/* 문제조정 입력 및 결과 보드 */}
                                {adjustingInputKey === \`e_\${idx}\` && (
                                  <div className="mt-2 p-3 bg-indigo-950/20 border border-indigo-500/30 rounded-xl w-full">
                                    <label className="block text-[10px] font-black text-indigo-400 mb-1">🛠️ 문제조정 의견을 제시해 주세요:</label>
                                    <textarea
                                      rows={2}
                                      value={adjustingText[\`e_\${idx}\`] || ''}
                                      onChange={(e) => {
                                        const text = e.target.value;
                                        setAdjustingText(prev => ({ ...prev, [\`e_\${idx}\`]: text }));
                                      }}
                                      placeholder="예: 수치를 20m로 변경해줘, 난이도를 낮춰줘 등..."
                                      className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-2 resize-none"
                                    />
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        onClick={() => setAdjustingInputKey(null)}
                                        className="text-[10px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors font-bold cursor-pointer"
                                      >
                                        취소
                                      </button>
                                      <button
                                        onClick={() => handleAdjustQuestion('exam', idx, q)}
                                        disabled={adjustingLoading[\`e_\${idx}\`]}
                                        className="text-[10px] px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors font-bold cursor-pointer disabled:opacity-50"
                                      >
                                        {adjustingLoading[\`e_\${idx}\`] ? '조정 중...' : '조정하기'}
                                      </button>
                                    </div>
                                    {adjustingLoading[\`e_\${idx}\` && (
                                      <div className="text-[10px] text-indigo-400 font-bold animate-pulse py-1.5 mt-2">⏳ AI가 의견을 반영하여 문제를 조율 중입니다...</div>
                                    )}
                                  </div>
                                )}`;

// 4. Replace Exam Mode Subjective detailedAnswers block
const examSubjTarget = `                            {/* Detailed Answer Button & Content */}
                            <div className="mt-3 pt-2 border-t border-slate-700/50">
                              {!detailedAnswers[idx]?.text && !detailedAnswers[idx]?.loading ? (
                                <button
                                  onClick={() => handleRequestDetailedAnswer(idx, q.answer)}
                                  className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all"
                                >
                                  ✨ 답안 전문보기 (AI 심층 해설)
                                </button>
                              ) : detailedAnswers[idx]?.loading ? (
                                <div className="text-[10px] text-indigo-400 font-bold animate-pulse">
                                  ⏳ AI가 기술사 수준의 심층 해설을 작성 중입니다...
                                </div>
                              ) : (
                                <div className="mt-2 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl">
                                  <div className="text-[11px] font-black text-indigo-400 mb-2">✨ AI 심층 해설</div>
                                  <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap prose prose-invert max-w-none prose-base">
                                    <LatexRenderer text={detailedAnswers[idx].text} katexLoaded={katexLoaded} />
                                  </div>
                                  {detailedAnswers[idx].error && (
                                    <div className="text-xs text-rose-400 mt-2">{detailedAnswers[idx].error}</div>
                                  )}
                                </div>
                              )}
                            </div>`;

const examSubjReplacement = `                            {/* 문제조정 입력 및 결과 보드 */}
                            <div className="mt-3 pt-2 border-t border-slate-700/50">
                              {adjustingInputKey !== \`e_\${idx}\` ? (
                                <button
                                  onClick={() => setAdjustingInputKey(\`e_\${idx}\`)}
                                  className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                >
                                  🛠️ 문제조정 (AI 피드백)
                                </button>
                              ) : (
                                <div className="mt-2 p-3 bg-indigo-950/20 border border-indigo-500/30 rounded-xl w-full">
                                  <label className="block text-[10px] font-black text-indigo-400 mb-1">🛠️ 문제조정 의견을 제시해 주세요:</label>
                                  <textarea
                                    rows={2}
                                    value={adjustingText[\`e_\${idx}\`] || ''}
                                    onChange={(e) => {
                                      const text = e.target.value;
                                      setAdjustingText(prev => ({ ...prev, [\`e_\${idx}\`]: text }));
                                    }}
                                    placeholder="예: 수치를 20m로 변경해줘, 난이도를 낮춰줘 등..."
                                    className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-2 resize-none"
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      onClick={() => setAdjustingInputKey(null)}
                                      className="text-[10px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors font-bold cursor-pointer"
                                    >
                                      취소
                                    </button>
                                    <button
                                      onClick={() => handleAdjustQuestion('exam', idx, q)}
                                      disabled={adjustingLoading[\`e_\${idx}\`]}
                                      className="text-[10px] px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors font-bold cursor-pointer disabled:opacity-50"
                                    >
                                      {adjustingLoading[\`e_\${idx}\`] ? '조정 중...' : '조정하기'}
                                    </button>
                                  </div>
                                  {adjustingLoading[\`e_\${idx}\`] && (
                                    <div className="text-[10px] text-indigo-400 font-bold animate-pulse py-1.5 mt-2">⏳ AI가 의견을 반영하여 문제를 조율 중입니다...</div>
                                  )}
                                </div>
                              )}
                            </div>`;

// Normalise helper
function clean(str) {
  return str.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

let count = 0;
const replacements = [
  [reviewMcTarget, reviewMcReplacement],
  [reviewMcResultTarget, reviewMcResultReplacement],
  [reviewSubjTarget, reviewSubjReplacement],
  [examMcTarget, examMcReplacement],
  [examMcResultTarget, examMcResultReplacement],
  [examSubjTarget, examSubjReplacement]
];

// Perform replacements
let normalisedContent = content.replace(/\r\n/g, '\n');

for (const [target, replacement] of replacements) {
  const cleanTarget = clean(target);
  
  // Find substring that matches when cleaned
  // We can do a sliding window or search by finding lines
  const lines = target.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  const firstLine = lines[0];
  const lastLine = lines[lines.length - 1];
  
  let startIndex = -1;
  let searchPos = 0;
  
  while ((startIndex = normalisedContent.indexOf(firstLine, searchPos)) !== -1) {
    // Find matching block
    // Let's see if the lines match
    const sliceEnd = normalisedContent.indexOf(lastLine, startIndex);
    if (sliceEnd !== -1) {
      const block = normalisedContent.substring(startIndex, sliceEnd + lastLine.length);
      if (clean(block) === cleanTarget) {
        normalisedContent = normalisedContent.substring(0, startIndex) + replacement + normalisedContent.substring(sliceEnd + lastLine.length);
        count++;
        console.log(`Replaced block ${count}`);
        break;
      }
    }
    searchPos = startIndex + 1;
  }
}

fs.writeFileSync(filePath, normalisedContent, 'utf8');
console.log(`Finished! Replaced ${count} blocks.`);
