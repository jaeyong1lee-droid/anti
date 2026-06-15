const fs = require('fs');

const filePath = 'C:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = `                {chatHistory.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-[11px] text-slate-400">문제 풀이 중 궁금한 점을<br/>무엇이든 물어보세요!</p>
                  </div>
                ) : (`;

const replacementStr = `                {chatHistory.length === 0 ? (
                  <div className="flex flex-col gap-4 w-full">
                    {tutorAttachedFormula && (
                      <div className="w-full bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-center relative animate-fade-in">
                        <button
                          type="button"
                          onClick={() => setTutorAttachedFormula(null)}
                          className="absolute top-2 right-2 text-slate-400 hover:text-slate-200 text-[10px] cursor-pointer font-bold w-4 h-4 flex items-center justify-center rounded-full bg-slate-800"
                          title="공식 제거"
                        >
                          ✕
                        </button>
                        <div className="text-[10px] font-black text-violet-400 mb-2 tracking-wider">📎 전송된 공식</div>
                        <div className="overflow-x-auto p-2 bg-slate-950/60 border border-slate-800 rounded-lg">
                          <LatexRenderer text={\`$$\${tutorAttachedFormula}$$\`} katexLoaded={katexLoaded} />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 font-semibold">
                          이 공식에 대해 아래 입력창에 질문해보세요!
                        </p>
                      </div>
                    )}
                    <div className="text-center py-10 opacity-50">
                      <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                      <p className="text-[11px] text-slate-400">문제 풀이 중 궁금한 점을<br/>무엇이든 물어보세요!</p>
                    </div>
                  </div>
                ) : (`;

// Replace all occurrences of this target string (for both Review and Exam pages)
if (content.includes(targetStr)) {
  content = content.replace(new RegExp(targetStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), replacementStr);
  console.log('Successfully replaced standard target empty states.');
} else {
  // LF
  const targetLF = targetStr.replace(/\r\n/g, '\n');
  const contentLF = content.replace(/\r\n/g, '\n');
  if (contentLF.includes(targetLF)) {
    content = contentLF.replace(new RegExp(targetLF.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), replacementStr.replace(/\r\n/g, '\n'));
    console.log('Successfully replaced target empty states (LF).');
  } else {
    console.error('Target empty state string not found!');
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished writing empty states.');
