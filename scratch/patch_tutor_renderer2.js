const fs = require('fs');
const filePath = 'C:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Use regex to find and replace the second chat messages renderer on the Exam page (around line 12770)
// We will replace:
// <LatexRenderer 
//   text={msg.text} 
//   katexLoaded={katexLoaded} 
//   enableAddFormula={true}
//   isMarkdown={true}
// />
// but only if it's the second occurrence or by targeting the lines.

const targetRegex = /<LatexRenderer\s+text=\{msg\.text\}\s+katexLoaded=\{katexLoaded\}\s+enableAddFormula=\{true\}\s+isMarkdown=\{true\}\s*\/>/g;

// Let's replace all occurrences that match this pattern to include formulaSource="tutor"!
// Wait! Is the first one (Review page) already modified?
// Yes, the first one was:
// <LatexRenderer 
//   text={msg.text} 
//   katexLoaded={katexLoaded} 
//   enableAddFormula={true}
//   formulaSource="tutor"
//   isMarkdown={true}
// />
// So it won't match targetRegex. Only the unmodified Exam page one will match.

content = content.replace(targetRegex, `<LatexRenderer 
                            text={msg.text} 
                            katexLoaded={katexLoaded} 
                            enableAddFormula={true}
                            formulaSource="tutor"
                            isMarkdown={true}
                          />`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating Exam page chat renderer.');
