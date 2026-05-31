import fs from 'fs';
import path from 'path';

const filePath = 'c:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize newlines
content = content.replace(/\r\n/g, '\n');

// 1. Review MC Button
const reviewMcBtnRegex = /\{\/\* 답안 전문보기 버튼 \*\/\}\s*\{!detailedAnswers\[`r_\$\{idx\}`\]\?\.text[\s\S]*?✨ 답안 전문보기 \(AI 심층 해설\)[\s\S]*?<\/button>\s*\)\}/g;
const reviewMcBtnReplacement = `{/* 문제조정 버튼 */}
                                      {adjustingInputKey !== \`r_\${idx}\` && (
                                        <button
                                          onClick={() => setAdjustingInputKey(\`r_\${idx}\`)}
                                          className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all cursor-pointer"
                                        >
                                          🛠️ 문제조정 (AI 피드백)
                                        </button>
                                      )}`;

// 2. Review MC Result
const reviewMcResultRegex = /\{\/\* 답안 전문보기 결과 \*\/\}[\s\S]*?detailedAnswers\[`r_\$\{idx\}`\]\?\.loading[\s\S]*?<\/div>\s*<\/div>\s*\)\}/g;
const reviewMcResultReplacement = `{/* 문제조정 입력 및 결과 보드 */}
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

let replaced = 0;
if (reviewMcBtnRegex.test(content)) {
  content = content.replace(reviewMcBtnRegex, reviewMcBtnReplacement);
  console.log("SUCCESS: Replaced Review MC Button");
  replaced++;
} else {
  console.error("ERROR: Failed to find Review MC Button");
}

if (reviewMcResultRegex.test(content)) {
  content = content.replace(reviewMcResultRegex, reviewMcResultReplacement);
  console.log("SUCCESS: Replaced Review MC Result");
  replaced++;
} else {
  console.error("ERROR: Failed to find Review MC Result");
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`FINISHED: Replaced ${replaced} blocks.`);
