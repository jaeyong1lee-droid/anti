const fs = require('fs');
const path = require('path');

const appJsxPath = path.join(__dirname, '..', 'client', 'src', 'App.jsx');
console.log("Reading App.jsx from:", appJsxPath);

let content = fs.readFileSync(appJsxPath, 'utf8');

// Normalize line endings to LF for easy replacement
const isCRLF = content.includes('\r\n');
if (isCRLF) {
  content = content.replace(/\r\n/g, '\n');
}

// 1. Patch Quiz Section
const oldQuizSection = `            {/* Left: Quiz Wrapper */}
            <div 
              style={{ width: \`\${reviewSplitRatio}%\` }} 
              className="shrink-0 h-full relative overflow-hidden flex flex-col bg-slateCustom-900/30"
            >
              {/* Left: Quiz Body */}
              <div 
                ref={quizBodyRef} 
                className="flex-1 max-w-3xl w-full mx-auto overflow-y-auto p-3 sm:p-6 scroll-smooth scrollbar-none"
              >`;

const newQuizSection = `            {/* Left: Quiz Wrapper */}
            <div 
              style={{ width: \`\${reviewSplitRatio}%\` }} 
              className="shrink-0 h-full relative overflow-hidden flex flex-col items-center bg-slateCustom-900/30"
            >
              {/* Left: Quiz Body */}
              <div 
                ref={quizBodyRef} 
                className="flex-1 max-w-3xl w-full mx-auto overflow-y-auto p-3 sm:p-6 scroll-smooth"
              >`;

if (content.includes(oldQuizSection)) {
  content = content.replace(oldQuizSection, newQuizSection);
  console.log("Successfully patched Quiz scrollbar wrapper!");
} else {
  console.error("Could not find oldQuizSection in App.jsx!");
}

// 2. Patch Exam Section
const oldExamSection = `            {/* Left: Exam Wrapper */}
            <div 
              style={{ width: \`\${examSplitRatio}%\` }} 
              className="shrink-0 h-full relative overflow-hidden flex flex-col bg-slateCustom-900/30"
            >
              {/* Left: Exam Body */}
              <div 
                ref={examBodyRef} 
                className="flex-1 max-w-3xl w-full mx-auto overflow-y-auto p-3 sm:p-6 scroll-smooth scrollbar-none"
              >`;

const newExamSection = `            {/* Left: Exam Wrapper */}
            <div 
              style={{ width: \`\${examSplitRatio}%\` }} 
              className="shrink-0 h-full relative overflow-hidden flex flex-col items-center bg-slateCustom-900/30"
            >
              {/* Left: Exam Body */}
              <div 
                ref={examBodyRef} 
                className="flex-1 max-w-3xl w-full mx-auto overflow-y-auto p-3 sm:p-6 scroll-smooth"
              >`;

if (content.includes(oldExamSection)) {
  content = content.replace(oldExamSection, newExamSection);
  console.log("Successfully patched Exam scrollbar wrapper!");
} else {
  console.error("Could not find oldExamSection in App.jsx!");
}

// Convert back to CRLF if original file had CRLF
if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(appJsxPath, content, 'utf8');
console.log("Successfully patched scrollbar layouts in App.jsx!");
