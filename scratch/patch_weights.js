const fs = require('fs');
const path = require('path');

const filePath = 'C:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Helper for replacement
const replaceSub = (target, replacement) => {
  if (content.includes(target)) {
    content = content.replace(target, replacement);
    console.log('Successfully replaced standard target');
  } else {
    // try with normalized newlines
    const targetLF = target.replace(/\r\n/g, '\n');
    const contentLF = content.replace(/\r\n/g, '\n');
    if (contentLF.includes(targetLF)) {
      content = contentLF.replace(targetLF, replacement.replace(/\r\n/g, '\n'));
      console.log('Successfully replaced normalized target');
    } else {
      console.warn('Target not found:', target.substring(0, 100));
    }
  }
};

// 1) Occurrence 4: Review Card Map
replaceSub(
`                    const scoredList = aiQuestions.filter((_, i) => i >= 2);
                    const M = scoredList.length;
                    const baseWeight = M > 0 ? Math.floor(100 / M) : 10;
                    const remainder = M > 0 ? (100 - (baseWeight * M)) : 0;
                    const W = idx >= 2 ? (idx - 2 < remainder ? (baseWeight + 1) : baseWeight) : 0;`,
`                    const scoredIndices = [];
                    aiQuestions.forEach((_, i) => {
                      if (i !== 1) scoredIndices.push(i);
                    });
                    const M = scoredIndices.length;
                    const baseWeight = M > 0 ? Math.floor(100 / M) : 10;
                    const remainder = M > 0 ? (100 - (baseWeight * M)) : 0;
                    const sIdx = scoredIndices.indexOf(idx);
                    const W = sIdx !== -1 ? (sIdx < remainder ? (baseWeight + 1) : baseWeight) : 0;`
);

// 2) Occurrence 5: Review TableQuiz
replaceSub(
`                                const scoredList = aiQuestions.filter((_, i) => i >= 2);
                                const M = scoredList.length;
                                const baseWeight = M > 0 ? Math.floor(100 / M) : 10;
                                const remainder = M > 0 ? (100 - (baseWeight * M)) : 0;
                                const W = idx >= 2 ? (idx - 2 < remainder ? (baseWeight + 1) : baseWeight) : 0;`,
`                                const scoredIndices = [];
                                aiQuestions.forEach((_, i) => {
                                  if (i !== 1) scoredIndices.push(i);
                                });
                                const M = scoredIndices.length;
                                const baseWeight = M > 0 ? Math.floor(100 / M) : 10;
                                const remainder = M > 0 ? (100 - (baseWeight * M)) : 0;
                                const sIdx = scoredIndices.indexOf(idx);
                                const W = sIdx !== -1 ? (sIdx < remainder ? (baseWeight + 1) : baseWeight) : 0;`
);

// 3) Occurrence 6: Exam Card Map
replaceSub(
`                  const scoredList = examQuestions.filter((_, i) => i >= 2);
                  const M = scoredList.length;
                  const baseWeight = M > 0 ? Math.floor(100 / M) : 10;
                  const remainder = M > 0 ? (100 - (baseWeight * M)) : 0;
                  const W = idx >= 2 ? (idx - 2 < remainder ? (baseWeight + 1) : baseWeight) : 0;`,
`                  const scoredIndices = [];
                  examQuestions.forEach((_, i) => {
                    if (i !== 1) scoredIndices.push(i);
                  });
                  const M = scoredIndices.length;
                  const baseWeight = M > 0 ? Math.floor(100 / M) : 10;
                  const remainder = M > 0 ? (100 - (baseWeight * M)) : 0;
                  const sIdx = scoredIndices.indexOf(idx);
                  const W = sIdx !== -1 ? (sIdx < remainder ? (baseWeight + 1) : baseWeight) : 0;`
);

// 4) Occurrence 7: Exam TableQuiz
replaceSub(
`                                const scoredList = examQuestions.filter((_, i) => i >= 2);
                                const M = scoredList.length;
                                const baseWeight = M > 0 ? Math.floor(100 / M) : 10;
                                const remainder = M > 0 ? (100 - (baseWeight * M)) : 0;
                                const W = idx >= 2 ? (idx - 2 < remainder ? (baseWeight + 1) : baseWeight) : 0;`,
`                                const scoredIndices = [];
                                examQuestions.forEach((_, i) => {
                                  if (i !== 1) scoredIndices.push(i);
                                });
                                const M = scoredIndices.length;
                                const baseWeight = M > 0 ? Math.floor(100 / M) : 10;
                                const remainder = M > 0 ? (100 - (baseWeight * M)) : 0;
                                const sIdx = scoredIndices.indexOf(idx);
                                const W = sIdx !== -1 ? (sIdx < remainder ? (baseWeight + 1) : baseWeight) : 0;`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished writing update.');
