const fs = require('fs');

const filePath = 'C:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1) Helper functions to be inserted inside App component
const helperTarget = `  const getSubjectiveStatusText = (idx) => {
    const score = tableGradingResults[\`\${idx}_INPUT\`]?.score;
    if (score === undefined) return '채점 완료';
    if (score >= 9) return '✅ 정답 인정';
    if (score >= 6) return '⚠️ 부분 인정 (우수)';
    if (score >= 3) return '⚠️ 부분 인정 (보통)';
    return '❌ 오답 판정';
  };`;

const helperReplacement = `  const getSubjectiveStatusText = (idx) => {
    const score = tableGradingResults[\`\${idx}_INPUT\`]?.score;
    if (score === undefined) return '채점 완료';
    if (score >= 9) return '✅ 정답 인정';
    if (score >= 6) return '⚠️ 부분 인정 (우수)';
    if (score >= 3) return '⚠️ 부분 인정 (보통)';
    return '❌ 오답 판정';
  };

  const getTableAverageScore = (idx, q) => {
    const inputIds = Object.keys(q.answers || {});
    if (inputIds.length === 0) return 10;
    
    let sumScore = 0;
    let gradedCount = 0;
    inputIds.forEach(inputId => {
      const grading = tableGradingResults[\`\${idx}_\${inputId}\`];
      if (grading && grading.score !== undefined) {
        sumScore += grading.score;
        gradedCount++;
      }
    });
    
    if (gradedCount === 0) return undefined;
    return sumScore / gradedCount;
  };

  const getTableBannerClasses = (idx, q) => {
    const score = getTableAverageScore(idx, q);
    if (score === undefined) return 'bg-rose-950/20 border-rose-500/30 text-rose-450';
    if (score >= 9) return 'bg-emerald-950/20 border-emerald-500/30 text-emerald-450';
    if (score >= 6) return 'bg-yellow-950/20 border-yellow-500/30 text-yellow-450';
    if (score >= 3) return 'bg-orange-950/20 border-orange-500/30 text-orange-450';
    return 'bg-rose-950/20 border-rose-500/30 text-rose-450';
  };

  const getTableBannerTitleClasses = (idx, q) => {
    const score = getTableAverageScore(idx, q);
    if (score === undefined) return 'text-rose-400';
    if (score >= 9) return 'text-emerald-400';
    if (score >= 6) return 'text-yellow-400';
    if (score >= 3) return 'text-orange-400';
    return 'text-rose-400';
  };

  const getTableBannerStatusText = (idx, q) => {
    const score = getTableAverageScore(idx, q);
    if (score === undefined) return '❌ 감점 및 오답 사유 피드백';
    if (score >= 9) return '✅ 채점 피드백 (정답인정)';
    if (score >= 6) return '⚠️ 채점 피드백 (우수)';
    if (score >= 3) return '⚠️ 채점 피드백 (보통)';
    return '❌ 감점 및 오답 사유 피드백';
  };`;

if (content.includes(helperTarget)) {
  content = content.replace(helperTarget, helperReplacement);
  console.log('Successfully inserted TableQuiz helper functions.');
} else {
  // LF
  const helperTargetLF = helperTarget.replace(/\r\n/g, '\n');
  const contentLF = content.replace(/\r\n/g, '\n');
  if (contentLF.includes(helperTargetLF)) {
    content = contentLF.replace(helperTargetLF, helperReplacement.replace(/\r\n/g, '\n'));
    console.log('Successfully inserted TableQuiz helper functions (LF).');
  } else {
    console.error('Target helperTarget not found!');
  }
}

// 2) Replace wrong feedback banner for TableQuiz (Review page)
// We will replace using a flexible regex to avoid any whitespace mismatch
const bannerRegex = /<div className="p-3\.5 bg-rose-950\/30 border border-rose-500\/20 rounded-xl space-y-2 text-left animate-fade-in my-2">(\s*)<div className="text-xs font-black text-rose-400 flex items-center gap-1\.5">(\s*)<span>❌ 감점 및 오답 사유 피드백<\/span>(\s*)<\/div>(\s*)<ul className="space-y-1\.5 list-disc pl-4 text-xs text-slate-350 leading-relaxed">(\s*)\{wrongFeedbacks\.map\(\(fb, fIdx\) => \((\s*)<li key=\{fIdx\}>(\s*)<span className="font-extrabold text-rose-350">\{fb\.letter\} 입력창 검토 의견:<\/span> \{fb\.reason\}/g;

const bannerReplacement = `<div className={\`p-3.5 border rounded-xl space-y-2 text-left animate-fade-in my-2 \${getTableBannerClasses(idx, q)}\`}>
                                          <div className={\`text-xs font-black flex items-center gap-1.5 \${getTableBannerTitleClasses(idx, q)}\`}>
                                            <span>{getTableBannerStatusText(idx, q)}</span>
                                          </div>
                                          <ul className="space-y-1.5 list-disc pl-4 text-xs text-slate-350 leading-relaxed">
                                            {wrongFeedbacks.map((fb, fIdx) => (
                                              <li key={fIdx}>
                                                <span className="font-extrabold">{fb.letter} 입력창 검토 의견:</span> {fb.reason}`;

// Let's do a direct exact match search & replace for both pages instead to be absolutely safe
const exactTargetStr = `                                        <div className="p-3.5 bg-rose-950/30 border border-rose-500/20 rounded-xl space-y-2 text-left animate-fade-in my-2">
                                          <div className="text-xs font-black text-rose-400 flex items-center gap-1.5">
                                            <span>❌ 감점 및 오답 사유 피드백</span>
                                          </div>
                                          <ul className="space-y-1.5 list-disc pl-4 text-xs text-slate-350 leading-relaxed">
                                            {wrongFeedbacks.map((fb, fIdx) => (
                                              <li key={fIdx}>
                                                <span className="font-extrabold text-rose-350">{fb.letter} 입력창 검토 의견:</span> {fb.reason}`;

const exactReplacementStr = `                                        <div className={\`p-3.5 border rounded-xl space-y-2 text-left animate-fade-in my-2 \${getTableBannerClasses(idx, q)}\`}>
                                          <div className={\`text-xs font-black flex items-center gap-1.5 \${getTableBannerTitleClasses(idx, q)}\`}>
                                            <span>{getTableBannerStatusText(idx, q)}</span>
                                          </div>
                                          <ul className="space-y-1.5 list-disc pl-4 text-xs text-slate-350 leading-relaxed">
                                            {wrongFeedbacks.map((fb, fIdx) => (
                                              <li key={fIdx}>
                                                <span className="font-extrabold">{fb.letter} 입력창 검토 의견:</span> {fb.reason}`;

if (content.includes(exactTargetStr)) {
  content = content.replace(new RegExp(exactTargetStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), exactReplacementStr);
  console.log('Successfully replaced Table wrong feedback banner.');
} else {
  // LF
  const targetLF = exactTargetStr.replace(/\r\n/g, '\n');
  const contentLF = content.replace(/\r\n/g, '\n');
  if (contentLF.includes(targetLF)) {
    content = contentLF.replace(new RegExp(targetLF.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), exactReplacementStr.replace(/\r\n/g, '\n'));
    console.log('Successfully replaced Table wrong feedback banner (LF).');
  } else {
    console.error('Target exactTargetStr not found!');
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished writing updates.');
