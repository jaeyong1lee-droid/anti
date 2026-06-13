const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/App.jsx');
let code = fs.readFileSync(filePath, 'utf8');

function hideButtonWithLabel(labelSpan) {
  const labelIndex = code.indexOf(labelSpan);
  if (labelIndex === -1) {
    console.error(`Error: Could not find label "${labelSpan}"`);
    process.exit(1);
  }
  
  // Find the `<button` index preceding the label
  const buttonIndex = code.lastIndexOf('<button', labelIndex);
  if (buttonIndex === -1) {
    console.error(`Error: Could not find button for label "${labelSpan}"`);
    process.exit(1);
  }
  
  // Find `className="` inside this button tag
  const classIndex = code.indexOf('className="', buttonIndex);
  if (classIndex === -1 || classIndex > labelIndex) {
    console.error(`Error: Could not find className for button with label "${labelSpan}"`);
    process.exit(1);
  }
  
  const insertIndex = classIndex + 'className="'.length;
  const nextQuoteIndex = code.indexOf('"', insertIndex);
  let classValue = code.substring(insertIndex, nextQuoteIndex);
  
  if (classValue.includes('flex')) {
    classValue = classValue.replace(/\bflex\b/g, 'hidden md:flex');
  } else {
    classValue = 'hidden md:flex ' + classValue;
  }
  
  code = code.substring(0, insertIndex) + classValue + code.substring(nextQuoteIndex);
  console.log(`Successfully hid button labeled: "${labelSpan}"`);
}

hideButtonWithLabel('<span>새로운 공식 추가 (빈표 생성)</span>');
// Reload code since the file size/indices changed slightly
fs.writeFileSync(filePath, code, 'utf8');

// Re-read file to apply next changes on fresh state
code = fs.readFileSync(filePath, 'utf8');
hideButtonWithLabel('<span>새로운 이론 공식 추가 (빈표 생성)</span>');
fs.writeFileSync(filePath, code, 'utf8');

code = fs.readFileSync(filePath, 'utf8');
hideButtonWithLabel('<span>새로운 답안 추가 (빈표 생성)</span>');
fs.writeFileSync(filePath, code, 'utf8');

code = fs.readFileSync(filePath, 'utf8');
hideButtonWithLabel('<span>HTML/PDF 보고서 업로드</span>');
fs.writeFileSync(filePath, code, 'utf8');

console.log("All buttons successfully hidden on mobile screens.");
