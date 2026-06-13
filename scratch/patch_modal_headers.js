const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../client/src/App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalizing line endings for robust parsing
const newline = content.includes('\r\n') ? '\r\n' : '\n';

// ─── 1. PATCh REVIEW MODAL HEADER ───
// We need to find the Review Header block and slice it out.
const reviewHeaderMarker = '          {/* Review Header */}';
const reviewHeaderStartIndex = content.indexOf(reviewHeaderMarker);

if (reviewHeaderStartIndex === -1) {
  console.error('Cannot find review header marker!');
  process.exit(1);
}

// Parse balanced div to find the end of Review Header
let openDivs = 0;
let reviewHeaderEndIndex = -1;
let searchIndex = content.indexOf('<div', reviewHeaderStartIndex);

while (searchIndex !== -1) {
  const nextOpen = content.indexOf('<div', searchIndex + 1);
  const nextClose = content.indexOf('</div>', searchIndex + 1);
  
  if (nextClose === -1) break;
  
  if (nextOpen !== -1 && nextOpen < nextClose) {
    openDivs++;
    searchIndex = nextOpen;
  } else {
    if (openDivs === 0) {
      reviewHeaderEndIndex = nextClose + '</div>'.length;
      break;
    }
    openDivs--;
    searchIndex = nextClose;
  }
}

if (reviewHeaderEndIndex === -1) {
  console.error('Failed to parse balanced divs for review header!');
  process.exit(1);
}

let reviewHeaderBlock = content.substring(reviewHeaderStartIndex, reviewHeaderEndIndex);

// Remove the review header block from its original place
let beforeReviewHeader = content.substring(0, reviewHeaderStartIndex);
let afterReviewHeader = content.substring(reviewHeaderEndIndex);

// Clean up any extra empty lines left behind
beforeReviewHeader = beforeReviewHeader.trimEnd() + newline;
afterReviewHeader = afterReviewHeader.trimStart();

// Reassemble content temporarily
content = beforeReviewHeader + afterReviewHeader;

// Modify review header block:
// Change alignment classes for PC to left align
reviewHeaderBlock = reviewHeaderBlock.replace(
  'flex flex-col items-stretch md:flex-row md:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-violet-500/20 flex-shrink-0 gap-4 landscape-hide',
  'w-full flex flex-col items-stretch md:flex-row md:items-center justify-start px-5 py-4 bg-slateCustom-950 border-b border-violet-500/20 flex-shrink-0 gap-4 md:gap-8 landscape-hide'
);

reviewHeaderBlock = reviewHeaderBlock.replace(
  'className="flex items-center gap-2 w-full md:w-auto justify-stretch md:justify-end border-t border-slate-800/40 md:border-t-0 pt-3 md:pt-0"',
  'className="flex items-center gap-2 w-full md:w-auto justify-stretch md:justify-start border-t border-slate-800/40 md:border-t-0 pt-3 md:pt-0"'
);

// Now find where Left: Quiz Wrapper starts and insert the reviewHeaderBlock as its first child
const leftQuizWrapperMarker = '              {/* Left: Quiz Wrapper (Takes exactly 60% width on Desktop) */}';
const leftQuizWrapperIndex = content.indexOf(leftQuizWrapperMarker);

if (leftQuizWrapperIndex === -1) {
  console.error('Cannot find Left Quiz Wrapper marker!');
  process.exit(1);
}

// Find the opening div of Left Quiz Wrapper
const leftQuizDivIndex = content.indexOf('<div', leftQuizWrapperIndex);
const insertPoint = content.indexOf('>', leftQuizDivIndex) + 1;

content = content.substring(0, insertPoint) + newline + reviewHeaderBlock + content.substring(insertPoint);


// ─── 2. PATCH COMPREHENSIVE EXAM MODAL HEADER ───
const examHeaderMarker = '          {/* Exam Header */}';
const examHeaderStartIndex = content.indexOf(examHeaderMarker);

if (examHeaderStartIndex === -1) {
  console.error('Cannot find exam header marker!');
  process.exit(1);
}

// Parse balanced div to find the end of Exam Header
openDivs = 0;
let examHeaderEndIndex = -1;
searchIndex = content.indexOf('<div', examHeaderStartIndex);

while (searchIndex !== -1) {
  const nextOpen = content.indexOf('<div', searchIndex + 1);
  const nextClose = content.indexOf('</div>', searchIndex + 1);
  
  if (nextClose === -1) break;
  
  if (nextOpen !== -1 && nextOpen < nextClose) {
    openDivs++;
    searchIndex = nextOpen;
  } else {
    if (openDivs === 0) {
      examHeaderEndIndex = nextClose + '</div>'.length;
      break;
    }
    openDivs--;
    searchIndex = nextClose;
  }
}

if (examHeaderEndIndex === -1) {
  console.error('Failed to parse balanced divs for exam header!');
  process.exit(1);
}

let examHeaderBlock = content.substring(examHeaderStartIndex, examHeaderEndIndex);

// Remove the exam header block from its original place
let beforeExamHeader = content.substring(0, examHeaderStartIndex);
let afterExamHeader = content.substring(examHeaderEndIndex);

// Clean up empty lines
beforeExamHeader = beforeExamHeader.trimEnd() + newline;
afterExamHeader = afterExamHeader.trimStart();

// Reassemble content temporarily
content = beforeExamHeader + afterExamHeader;

// Modify exam header block:
// Change alignment classes for PC to left align
examHeaderBlock = examHeaderBlock.replace(
  'flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-amber-500/20 flex-shrink-0 gap-4 landscape-hide',
  'w-full flex flex-col sm:flex-row sm:items-center justify-start px-5 py-4 bg-slateCustom-950 border-b border-amber-500/20 flex-shrink-0 gap-4 sm:gap-8 landscape-hide'
);

examHeaderBlock = examHeaderBlock.replace(
  'className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0"',
  'className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-start border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0"'
);

// Now find where Left: Exam Wrapper starts and insert the examHeaderBlock as its first child
const leftExamWrapperMarker = '            {/* Left: Exam Wrapper (Takes exactly 60% width on Desktop) */}';
const leftExamWrapperIndex = content.indexOf(leftExamWrapperMarker);

if (leftExamWrapperIndex === -1) {
  console.error('Cannot find Left Exam Wrapper marker!');
  process.exit(1);
}

// Find the opening div of Left Exam Wrapper
const leftExamDivIndex = content.indexOf('<div', leftExamWrapperIndex);
const examInsertPoint = content.indexOf('>', leftExamDivIndex) + 1;

content = content.substring(0, examInsertPoint) + newline + examHeaderBlock + content.substring(examInsertPoint);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully completed relocating headers inside left columns, left-aligning top buttons on PC, and lifting the calculator!');
