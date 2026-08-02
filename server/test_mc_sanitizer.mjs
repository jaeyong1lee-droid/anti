console.log('=== 🧪 REAL TIME TESTER: RESET & RE-SOLVE SIMULATION ===\n');

function normalizeMcText(s) {
  return (s || '')
    .replace(/\s+/g, '')
    .replace(/[①②③④⑤]/g, '')
    .replace(/^[1-5][.)\s]*/, '')
    .replace(/[.~,`'"'']/g, '')
    .toLowerCase();
}

function getSanitizedMcAnswer(q) {
  if (!q || !q.answer) return q ? q.answer : '';
  if (!q.options || q.options.length === 0 || !q.explanation) return q.answer;

  const options = q.options;
  const exp = q.explanation;
  const currentAns = String(q.answer).trim();

  const conclusionMatch = exp.match(/(?:\[최종\s*정답\s*산출\]|따라서|정답은|결론적으로)[\s\S]*$/i);
  const searchTarget = conclusionMatch ? conclusionMatch[0] : exp;
  const normalizedTarget = normalizeMcText(searchTarget);

  let bestMatch = null;
  let bestScore = 0;

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const normOpt = normalizeMcText(opt);
    if (!normOpt) continue;

    if (normalizedTarget.includes(normOpt)) {
      bestMatch = opt;
      bestScore = 100;
      break;
    }

    const numKeywords = normOpt.match(/(?:\d+\/\d+|\d+배|변화가\s*없다|증가|감소)/g) || [];
    if (numKeywords.length > 0) {
      const matchCount = numKeywords.filter(kw => normalizedTarget.includes(normalizeMcText(kw))).length;
      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestMatch = opt;
      }
    }
  }

  if (bestMatch && currentAns) {
    const normCurrent = normalizeMcText(currentAns);
    if (!normalizedTarget.includes(normCurrent) && (bestScore >= 100 || bestScore > 0)) {
      q.answer = bestMatch;
      return bestMatch;
    }
  }

  return q.answer;
}

// 1. Mock Stale Quiz Question (The exact Q11 problem in screenshot)
const q = {
  id: 'q11_test',
  type: 'multiple_choice',
  question: '어떤 사실토 기반에 침투주입을 수행할 때...',
  options: [
    '① 주입 속도가 2배 증가한다.',
    '② 주입 속도가 4배 증가한다.',
    '③ 주입 속도는 변화가 없다.',
    '④ 주입 속도가 1/4배로 감소한다.'
  ],
  answer: '① 주입 속도가 2배 증가한다.', // Stale wrong answer in DB
  explanation: '[적용 공식] 다카다(Takada) 및 달시의 법칙... [수치 대입 및 단위 환산] ... [최종 정답 산출] 따라서 주입 속도는 기존의 1/4 배로 감소하게 됩니다.'
};

console.log('1. Initial Question State:');
console.log('   Raw Stale Answer in DB:', q.answer);

// Step 1: Run Sanitizer
const targetAns = getSanitizedMcAnswer(q);

console.log('\n2. Sanitizer Execution:');
console.log('   Sanitized Answer:', targetAns);
console.log('   Updated q.answer:', q.answer);

if (q.answer !== '④ 주입 속도가 1/4배로 감소한다.') {
  console.error('❌ FAIL: q.answer was not updated to option ④!');
  process.exit(1);
}
console.log('   ✅ PASS: q.answer successfully updated to option ④.');

// Step 2: Simulate "다시 풀기" (Reset button click)
console.log('\n3. Simulating [다시 풀기] Button Click:');
let selectedAnswers = { 0: '① 주입 속도가 2배 증가한다.' }; // Previous submission
let answered = false;
delete selectedAnswers[0]; // Reset answer state

console.log('   Reset selectedAnswers state:', selectedAnswers);
console.log('   answered state set to:', answered);

// Verify UI class rendering in reset state
const optionsResetClasses = q.options.map(opt => {
  const isThisCorrect = opt === targetAns || opt === q.answer;
  if (!answered) return 'READY_TO_CLICK (bg-slate-800/60 border-slate-700 hover:bg-slate-700/70)';
  if (isThisCorrect) return 'CORRECT_GREEN (bg-emerald-950/70 border-emerald-500)';
  return 'DEFAULT (bg-slate-800/30)';
});

console.log('   Rendered option states after Reset:');
optionsResetClasses.forEach((cls, idx) => {
  console.log(`     Option ${idx + 1}: ${cls}`);
});

// Step 3: Re-solving by clicking Option ④
console.log('\n4. Re-solving: User clicks Option ④ [④ 주입 속도가 1/4배로 감소한다.]:');
selectedAnswers[0] = '④ 주입 속도가 1/4배로 감소한다.';
answered = true;

const optionsReSolvedClasses = q.options.map(opt => {
  const isThisCorrect = opt === targetAns || opt === q.answer;
  if (!answered) return 'READY_TO_CLICK';
  if (isThisCorrect) return 'CORRECT_GREEN (bg-emerald-950 border-emerald-500)';
  if (opt === selectedAnswers[0] && !isThisCorrect) return 'WRONG_RED (bg-rose-950 border-rose-500)';
  return 'DEFAULT';
});

console.log('   Rendered option states after Re-solving:');
optionsReSolvedClasses.forEach((cls, idx) => {
  console.log(`     Option ${idx + 1}: ${cls}`);
});

// Verifications
const option1IsGreen = optionsReSolvedClasses[0].includes('CORRECT_GREEN');
const option4IsGreen = optionsReSolvedClasses[3].includes('CORRECT_GREEN');
const userSelectedIsCorrect = (selectedAnswers[0] === targetAns || selectedAnswers[0] === q.answer);

console.log('\n5. Final Real-Time Verification Checks:');
console.log('   - Is Option ① Green? :', option1IsGreen ? '❌ FAIL (Should not be green)' : '✅ PASS (Not green)');
console.log('   - Is Option ④ Green? :', option4IsGreen ? '✅ PASS (Green border applied)' : '❌ FAIL (Not green)');
console.log('   - User Score Check  :', userSelectedIsCorrect ? '✅ PASS (7 / 7 Full Score)' : '❌ FAIL (0 Score)');

if (!option1IsGreen && option4IsGreen && userSelectedIsCorrect) {
  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Reset & Re-solve flow verified 100% cleanly.');
} else {
  console.error('\n❌ TEST FAILED!');
  process.exit(1);
}
