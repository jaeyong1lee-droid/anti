const fs = require('fs');

const filePath = 'C:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Helper for exact replacement
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

// 1) tutorAnswers[key] render
replaceSub(
  `              <LatexRenderer text={tutorAnswers[key].text} katexLoaded={katexLoaded} enableAddFormula={true} isMarkdown={true} />`,
  `              <LatexRenderer text={tutorAnswers[key].text} katexLoaded={katexLoaded} enableAddFormula={true} formulaSource="tutor" isMarkdown={true} />`
);

// 2) tutorAnswers[`r_${idx}`] render
replaceSub(
  `                                              <LatexRenderer text={tutorAnswers[\`r_\${idx}\`].text} katexLoaded={katexLoaded} enableAddFormula={true} isMarkdown={true} />`,
  `                                              <LatexRenderer text={tutorAnswers[\`r_\${idx}\`].text} katexLoaded={katexLoaded} enableAddFormula={true} formulaSource="tutor" isMarkdown={true} />`
);

// 3) tutorAnswers[`e_${idx}`] render
replaceSub(
  `                                              <LatexRenderer text={tutorAnswers[\`e_\${idx}\`].text} katexLoaded={katexLoaded} enableAddFormula={true} isMarkdown={true} />`,
  `                                              <LatexRenderer text={tutorAnswers[\`e_\${idx}\`].text} katexLoaded={katexLoaded} enableAddFormula={true} formulaSource="tutor" isMarkdown={true} />`
);

// 4) Review page Gemini Chat Sidebar messages
replaceSub(
  `                          <LatexRenderer 
                            text={msg.text} 
                            katexLoaded={katexLoaded} 
                            enableAddFormula={true}
                            isMarkdown={true}
                          />`,
  `                          <LatexRenderer 
                            text={msg.text} 
                            katexLoaded={katexLoaded} 
                            enableAddFormula={true}
                            formulaSource="tutor"
                            isMarkdown={true}
                          />`
);

// 5) Exam page Gemini Chat Sidebar messages
replaceSub(
  `                            <LatexRenderer 
                              text={msg.text} 
                              katexLoaded={katexLoaded} 
                              enableAddFormula={true}
                              isMarkdown={true}
                            />`,
  `                            <LatexRenderer 
                              text={msg.text} 
                              katexLoaded={katexLoaded} 
                              enableAddFormula={true}
                              formulaSource="tutor"
                              isMarkdown={true}
                            />`
);

// 6) Formula display block
replaceSub(
  `                            <LatexRenderer 
                              text={formulaOnly} 
                              katexLoaded={katexLoaded} 
                              isMarkdown={true} 
                              enableAddFormula={true}
                            />`,
  `                            <LatexRenderer 
                              text={formulaOnly} 
                              katexLoaded={katexLoaded} 
                              isMarkdown={true} 
                              enableAddFormula={true}
                              formulaSource="tutor"
                            />`
);

// 7) Formula-specific tutor chat history messages
replaceSub(
  `                              <LatexRenderer text={msg.text} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} />`,
  `                              <LatexRenderer text={msg.text} katexLoaded={katexLoaded} isMarkdown={true} enableAddFormula={true} formulaSource="tutor" />`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done.');
