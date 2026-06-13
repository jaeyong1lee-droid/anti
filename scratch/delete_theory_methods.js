const fs = require('fs');

const filePath = 'c:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF for consistent matching
const isCrlf = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

// Helper to replace using regex and log it
function replaceRegex(regex, replacement, name) {
  if (!regex.test(content)) {
    console.warn(`WARNING: Regex for ${name} not matched!`);
    return;
  }
  content = content.replace(regex, replacement);
  console.log(`Successfully replaced ${name}.`);
}

// 1. Stub the state variables
replaceRegex(
  /const\s+\[showTheoryExam,\s*setShowTheoryExam\]\s*=\s*useState\([\s\S]*?\);/,
  'const showTheoryExam = false;\n  const setShowTheoryExam = () => {};',
  'showTheoryExam'
);

replaceRegex(
  /const\s+theoryBodyRef\s*=\s*useRef\([\s\S]*?\);/,
  'const theoryBodyRef = { current: null };',
  'theoryBodyRef'
);

replaceRegex(
  /const\s+savedTheoryScroll\s*=\s*useRef\([\s\S]*?\);/,
  'const savedTheoryScroll = { current: 0 };',
  'savedTheoryScroll'
);

replaceRegex(
  /const\s+\[theoryMobileTab,\s*setTheoryMobileTab\]\s*=\s*useState\([\s\S]*?\);/,
  'const theoryMobileTab = "list";\n  const setTheoryMobileTab = () => {};',
  'theoryMobileTab'
);

replaceRegex(
  /const\s+theorySplitContainerRef\s*=\s*useRef\([\s\S]*?\);/,
  'const theorySplitContainerRef = { current: null };',
  'theorySplitContainerRef'
);

replaceRegex(
  /const\s+\[theoryQuestions,\s*setTheoryQuestions\]\s*=\s*useState\([\s\S]*?\);/,
  'const theoryQuestions = [];\n  const setTheoryQuestions = () => {};',
  'theoryQuestions'
);

replaceRegex(
  /const\s+\[loadingTheory,\s*setLoadingTheory\]\s*=\s*useState\([\s\S]*?\);/,
  'const loadingTheory = false;\n  const setLoadingTheory = () => {};',
  'loadingTheory'
);

replaceRegex(
  /const\s+\[theoryRevealed,\s*setTheoryRevealed\]\s*=\s*useState\(\(\)\s*=>\s*\{[\s\S]*?\}\);/,
  'const theoryRevealed = {};\n  const setTheoryRevealed = () => {};',
  'theoryRevealed'
);

replaceRegex(
  /const\s+\[theorySearchQuery,\s*setTheorySearchQuery\]\s*=\s*useState\([\s\S]*?\);/,
  'const theorySearchQuery = "";\n  const setTheorySearchQuery = () => {};',
  'theorySearchQuery'
);

replaceRegex(
  /const\s+\[refreshingTheoryIdx,\s*setRefreshingTheoryIdx\]\s*=\s*useState\([\s\S]*?\);/,
  'const refreshingTheoryIdx = null;\n  const setRefreshingTheoryIdx = () => {};',
  'refreshingTheoryIdx'
);

replaceRegex(
  /const\s+\[uploadingTheoryPdf,\s*setUploadingTheoryPdf\]\s*=\s*useState\([\s\S]*?\);/,
  'const uploadingTheoryPdf = false;\n  const setUploadingTheoryPdf = () => {};',
  'uploadingTheoryPdf'
);

replaceRegex(
  /const\s+\[editingTheoryIdx,\s*setEditingTheoryIdx\]\s*=\s*useState\([\s\S]*?\);/,
  'const editingTheoryIdx = null;\n  const setEditingTheoryIdx = () => {};',
  'editingTheoryIdx'
);

replaceRegex(
  /const\s+\[editTheoryTitle,\s*setEditTheoryTitle\]\s*=\s*useState\([\s\S]*?\);/,
  'const editTheoryTitle = "";\n  const setEditTheoryTitle = () => {};',
  'editTheoryTitle'
);

replaceRegex(
  /const\s+\[editTheoryConcept,\s*setEditTheoryConcept\]\s*=\s*useState\([\s\S]*?\);/,
  'const editTheoryConcept = "";\n  const setEditTheoryConcept = () => {};',
  'editTheoryConcept'
);

replaceRegex(
  /const\s+\[editTheoryAssumptions,\s*setEditTheoryAssumptions\]\s*=\s*useState\([\s\S]*?\);/,
  'const editTheoryAssumptions = "";\n  const setEditTheoryAssumptions = () => {};',
  'editTheoryAssumptions'
);

replaceRegex(
  /const\s+\[editTheoryFormula,\s*setEditTheoryFormula\]\s*=\s*useState\([\s\S]*?\);/,
  'const editTheoryFormula = "";\n  const setEditTheoryFormula = () => {};',
  'editTheoryFormula'
);

replaceRegex(
  /const\s+\[theoryInputRevealed,\s*setTheoryInputRevealed\]\s*=\s*useState\([\s\S]*?\);/,
  'const theoryInputRevealed = {};\n  const setTheoryInputRevealed = () => {};',
  'theoryInputRevealed'
);

// 2. Stub latestTheoryQuestionsRef and load/save methods
replaceRegex(
  /const\s+latestTheoryQuestionsRef\s*=\s*useRef\(theoryQuestions\);\s*useEffect\(\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[theoryQuestions\]\);/,
  'const latestTheoryQuestionsRef = { current: [] };',
  'latestTheoryQuestionsRef'
);

// 3. Stub functions so they do nothing
replaceRegex(
  /const\s+loadTheoryQuestions\s*=\s*async\s*\(\)\s*=>\s*\{/,
  'const loadTheoryQuestions = async () => { return []; };\n  const _loadTheoryQuestions_unused = async () => {',
  'loadTheoryQuestions'
);

replaceRegex(
  /const\s+handleSaveTheoryQuestions\s*=\s*async\s*\([\s\S]*?\)\s*=>\s*\{/,
  'const handleSaveTheoryQuestions = async () => {};\n  const _handleSaveTheoryQuestions_unused = async () => {',
  'handleSaveTheoryQuestions'
);

replaceRegex(
  /const\s+handleUploadTheoryPdf\s*=\s*async\s*\([\s\S]*?\)\s*=>\s*\{/,
  'const handleUploadTheoryPdf = async () => {};\n  const _handleUploadTheoryPdf_unused = async () => {',
  'handleUploadTheoryPdf'
);

replaceRegex(
  /const\s+handleOpenTheoryExam\s*=\s*async\s*\(\)\s*=>\s*\{/,
  'const handleOpenTheoryExam = async () => {};\n  const _handleOpenTheoryExam_unused = async () => {',
  'handleOpenTheoryExam'
);

// Restore CRLF line endings if original file was CRLF
if (isCrlf) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully completed regex replacements!');
