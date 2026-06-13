const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../client/src/App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace the class logic
const target1 = `                            let cls = "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 cursor-pointer ";
                            if (!answered) {
                              cls += "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/70 hover:border-slate-600";
                            } else if (normalizeAns(opt) === normalizeAns(q.answer)) {
                              cls += "bg-emerald-950/70 border-emerald-500 text-emerald-200 font-extrabold";
                            } else if (normalizeAns(opt) === normalizeAns(examAnswers[idx]) && normalizeAns(opt) !== normalizeAns(q.answer)) {
                              cls += "bg-rose-950/70 border-rose-500 text-rose-200";
                            } else {
                              cls += "bg-slate-800/30 border-slate-800/50 text-slate-300";
                            }`;

const replacement1 = `                            let cls = "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 ";
                            if (!answered) {
                              cls += "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/70 hover:border-slate-600 cursor-pointer select-none";
                            } else if (normalizeAns(opt) === normalizeAns(q.answer)) {
                              cls += "bg-emerald-950/70 border-emerald-500 text-emerald-200 font-extrabold cursor-default select-text";
                            } else if (normalizeAns(opt) === normalizeAns(examAnswers[idx]) && normalizeAns(opt) !== normalizeAns(q.answer)) {
                              cls += "bg-rose-950/70 border-rose-500 text-rose-200 cursor-default select-text";
                            } else {
                              cls += "bg-slate-800/30 border-slate-800/50 text-slate-300 cursor-default select-text";
                            }`;

// 2. Replace the element start and onClick
const target2 = `                            return (
                              <button
                                key={oIdx}
                                onClick={() => {
                                  setExamAnswers(prev => {`;

const replacement2 = `                            return (
                              <div
                                key={oIdx}
                                onClick={() => {
                                  if (answered) return; // 한번 선택하면 끝, 다시 선택 불가
                                  setExamAnswers(prev => {`;

// 3. Replace the element end
const target3 = `                                className={cls}
                              >
                                <span className="flex gap-2 items-start">
                                  <span className="font-black text-[10px] mt-0.5 flex-shrink-0">{['①','②','③','④'][oIdx]}</span>
                                  <LatexRenderer text={opt} katexLoaded={katexLoaded} className="inline" />
                                </span>
                              </button>`;

const replacement3 = `                                className={cls}
                              >
                                <span className="flex gap-2 items-start select-text">
                                  <span className="font-black text-[10px] mt-0.5 flex-shrink-0 select-none">{['①','②','③','④'][oIdx]}</span>
                                  <LatexRenderer text={opt} katexLoaded={katexLoaded} className="inline select-text" />
                                </span>
                              </div>`;

const normalizeNewlines = (str) => str.replace(/\r\n/g, '\n');

let normContent = normalizeNewlines(content);
const normTarget1 = normalizeNewlines(target1);
const normTarget2 = normalizeNewlines(target2);
const normTarget3 = normalizeNewlines(target3);

if (normContent.includes(normTarget1) && normContent.includes(normTarget2) && normContent.includes(normTarget3)) {
  normContent = normContent.replace(normTarget1, normalizeNewlines(replacement1));
  normContent = normContent.replace(normTarget2, normalizeNewlines(replacement2));
  normContent = normContent.replace(normTarget3, normalizeNewlines(replacement3));
  
  // Write back keeping the platform newlines style (we can join by Windows CRLF)
  fs.writeFileSync(filePath, normContent.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Successfully patched Exam multiple choice options in App.jsx!');
} else {
  console.error('One or more targets were not found in App.jsx');
  console.log('normContent.includes(normTarget1):', normContent.includes(normTarget1));
  console.log('normContent.includes(normTarget2):', normContent.includes(normTarget2));
  console.log('normContent.includes(normTarget3):', normContent.includes(normTarget3));
}
