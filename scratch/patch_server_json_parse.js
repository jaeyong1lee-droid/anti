import fs from 'fs';
import path from 'path';

const filePath = path.resolve('server/index.js');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize CRLF to LF to make search robust
const hasCrlf = content.includes('\r\n');
if (hasCrlf) {
  content = content.replace(/\r\n/g, '\n');
}

// 1. ai-questions cached check replacement
const target1 = `        if (Array.isArray(parsed) && parsed.length > 0) {
          return res.json({ questions: parsed, isFallback: false, isCached: true });
        } else if (parsed && Array.isArray(parsed.questions)) {
          return res.json({
            questions: parsed.questions,
            selectedAnswers: parsed.selectedAnswers || {},
            revealedQuestions: parsed.revealedQuestions || {},
            savedQuizScroll: parsed.savedQuizScroll || 0,
            isFallback: false,
            isCached: true
          });
        }`;

const replacement1 = `        if (Array.isArray(parsed) && parsed.length > 0) {
          const healed = parsed.map(q => healQuizQuestionObject(q));
          return res.json({ questions: healed, isFallback: false, isCached: true });
        } else if (parsed && Array.isArray(parsed.questions)) {
          const healed = parsed.questions.map(q => healQuizQuestionObject(q));
          return res.json({
            questions: healed,
            selectedAnswers: parsed.selectedAnswers || {},
            revealedQuestions: parsed.revealedQuestions || {},
            savedQuizScroll: parsed.savedQuizScroll || 0,
            isFallback: false,
            isCached: true
          });
        }`;

// 2. exam session get replacement
const target2 = `    if (rows.length > 0 && rows[0].value) {
      res.json({ data: JSON.parse(rows[0].value) });
    } else {`;

const replacement2 = `    if (rows.length > 0 && rows[0].value) {
      const data = JSON.parse(rows[0].value);
      if (data && Array.isArray(data.questions)) {
        data.questions = data.questions.map(q => healQuizQuestionObject(q));
      }
      res.json({ data });
    } else {`;

// 3. completed-review get replacement
const target3 = `    if (row && row.value) {
      res.json({ success: true, data: JSON.parse(row.value) });
    } else {`;

const replacement3 = `    if (row && row.value) {
      const data = JSON.parse(row.value);
      if (data && Array.isArray(data.questions)) {
        data.questions = data.questions.map(q => healQuizQuestionObject(q));
      }
      res.json({ success: true, data });
    } else {`;

// 4. formula session get replacement
const target4 = `    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {`;

const replacement4 = `    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      if (parsed && Array.isArray(parsed.formulaQuestions)) {
        parsed.formulaQuestions = parsed.formulaQuestions.map(q => healFormulaQuestionObject(q));
      }
      res.json({ data: parsed });
    } else {`;

// 5. answersheet session get replacement
const target5 = `    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {`;

const replacement5 = `    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      if (parsed && Array.isArray(parsed.questions)) {
        parsed.questions = parsed.questions.map(q => healAnswersheetQuestionObject(q));
      }
      res.json({ data: parsed });
    } else {`;

let patchedCount = 0;

if (content.includes(target1)) {
  content = content.replace(target1, replacement1);
  console.log("Patched target 1 (ai-questions cached)");
  patchedCount++;
} else {
  console.error("Target 1 not found!");
}

if (content.includes(target2)) {
  content = content.replace(target2, replacement2);
  console.log("Patched target 2 (exam session)");
  patchedCount++;
} else {
  console.error("Target 2 not found!");
}

if (content.includes(target3)) {
  content = content.replace(target3, replacement3);
  console.log("Patched target 3 (completed-review)");
  patchedCount++;
} else {
  console.error("Target 3 not found!");
}

// target 4 and 5 are identical in target text, so let's do search and replace carefully
const firstIndex4 = content.indexOf(target4);
if (firstIndex4 !== -1) {
  content = content.substring(0, firstIndex4) + replacement4 + content.substring(firstIndex4 + target4.length);
  console.log("Patched target 4 (formula session)");
  patchedCount++;
  
  // Find second one for answersheet
  const secondIndex5 = content.indexOf(target5);
  if (secondIndex5 !== -1) {
    content = content.substring(0, secondIndex5) + replacement5 + content.substring(secondIndex5 + target5.length);
    console.log("Patched target 5 (answersheet session)");
    patchedCount++;
  } else {
    console.error("Target 5 not found!");
  }
} else {
  console.error("Target 4/5 not found!");
}

// Restore CRLF if originally present
if (hasCrlf) {
  content = content.replace(/\n/g, '\r\n');
}

if (patchedCount > 0) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Successfully patched ${patchedCount} targets in server/index.js!`);
} else {
  console.error("No patches applied!");
}
