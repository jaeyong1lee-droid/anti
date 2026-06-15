const fs = require('fs');

const filePath = 'C:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1) Define getTableInputColorClasses right before TableQuiz
const targetStr = '// ── 주관식 표채우기 퀴즈 렌더러 ──────────────────\nconst TableQuiz = React.memo';
const replacementStr = `// ── 주관식 표채우기 퀴즈 렌더러 ──────────────────
const getTableInputColorClasses = (gradingResult, isCorrect, value) => {
  if (!value) return 'border-emerald-500/30 bg-emerald-950/10 text-emerald-300/40 italic font-medium';
  
  const score = gradingResult?.score;
  if (score === undefined) {
    return isCorrect 
      ? 'border-emerald-500 bg-emerald-950/20 text-emerald-300 font-bold'
      : 'border-rose-500 bg-rose-950/20 text-rose-300';
  }
  
  if (score >= 9) return 'border-emerald-500 bg-emerald-950/20 text-emerald-300 font-bold';
  if (score >= 6) return 'border-yellow-500 bg-yellow-950/20 text-yellow-300 font-bold';
  if (score >= 3) return 'border-orange-500 bg-orange-950/20 text-orange-300 font-bold';
  return 'border-rose-500 bg-rose-950/20 text-rose-300';
};

const TableQuiz = React.memo`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  console.log('Successfully inserted getTableInputColorClasses helper.');
} else {
  // normalize line endings to LF and try again
  const targetStrLF = targetStr.replace(/\r\n/g, '\n');
  const contentLF = content.replace(/\r\n/g, '\n');
  if (contentLF.includes(targetStrLF)) {
    content = contentLF.replace(targetStrLF, replacementStr.replace(/\r\n/g, '\n'));
    console.log('Successfully inserted getTableInputColorClasses helper (LF).');
  } else {
    console.error('Target TableQuiz comment not found!');
  }
}

// 2) Update inputClassName inside TableQuiz to use getTableInputColorClasses
const inputClassTarget = `                  let inputClassName = \`w-full text-[10px] sm:text-xs pl-1.5 pr-8 py-0.5 sm:pl-2 sm:pr-12 sm:py-1 rounded-lg bg-slate-900 border text-slate-100 placeholder-slate-600 focus:outline-none transition-all duration-200 \`;
                  if (revealed) {
                    if (value) {
                      if (isCorrect) {
                        inputClassName += 'border-emerald-500 bg-emerald-950/20 text-emerald-300 font-bold';
                      } else {
                        inputClassName += 'border-rose-500 bg-rose-950/20 text-rose-300';
                      }
                    } else {
                      inputClassName += 'border-emerald-500/30 bg-emerald-950/10 text-emerald-300/40 italic font-medium';
                    }
                  } else {
                    inputClassName += 'border-slate-700 focus:border-slate-500 focus:ring-1 focus:ring-slate-500';
                  }`;

const inputClassReplacement = `                  let inputClassName = \`w-full text-[10px] sm:text-xs pl-1.5 pr-8 py-0.5 sm:pl-2 sm:pr-12 sm:py-1 rounded-lg bg-slate-900 border text-slate-100 placeholder-slate-600 focus:outline-none transition-all duration-200 \${
                    revealed
                      ? getTableInputColorClasses(gradingResult, isCorrect, value)
                      : 'border-slate-700 focus:border-slate-500 focus:ring-1 focus:ring-slate-500'
                  }\`;`;

if (content.includes(inputClassTarget)) {
  content = content.replace(inputClassTarget, inputClassReplacement);
  console.log('Successfully replaced inputClassName in TableQuiz.');
} else {
  // LF
  const targetLF = inputClassTarget.replace(/\r\n/g, '\n');
  const contentLF = content.replace(/\r\n/g, '\n');
  if (contentLF.includes(targetLF)) {
    content = contentLF.replace(targetLF, inputClassReplacement.replace(/\r\n/g, '\n'));
    console.log('Successfully replaced inputClassName in TableQuiz (LF).');
  } else {
    console.error('Target inputClassTarget not found!');
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done.');
