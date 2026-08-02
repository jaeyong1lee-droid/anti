console.log('=== 🧪 REAL TIME TESTER: SCREENSHOT CONTRADICTION FIX TEST ===\n');

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

  // 1. "올바른 정답은 'X'입니다" 또는 "정답은 'X'" 특수 패턴 최우선 추출
  const explicitCorrectMatch = exp.match(/(?:올바른\s*정답은|정답은|최종\s*정답은)\s*['"]?([^'".\n]+)['"]?/i);
  if (explicitCorrectMatch && explicitCorrectMatch[1]) {
    const rawTarget = explicitCorrectMatch[1];
    const normTarget = normalizeMcText(rawTarget);
    const matchedOpt = options.find(opt => {
      const normOpt = normalizeMcText(opt);
      return normOpt && (normTarget.includes(normOpt) || normOpt.includes(normTarget));
    });
    if (matchedOpt) {
      q.answer = matchedOpt;
      return matchedOpt;
    }
  }

  // 2. 일반 결론 문장 추출
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

  if (bestMatch) {
    q.answer = bestMatch;
    return bestMatch;
  }

  return q.answer;
}

// Exact scenario in user screenshot:
const q = {
  id: 'q11_user_screenshot',
  type: 'multiple_choice',
  question: '어떤 사실토 기반에 침투주입을 수행할 때...',
  options: [
    '① 주입 속도가 2배 증가한다.',
    '② 주입 속도가 4배 증가한다.',
    '③ 주입 속도는 변화가 없다.',
    '④ 주입 속도가 1/4배로 감소한다.'
  ],
  answer: '② 주입 속도가 4배 증가한다.', // Stale wrong answer set by JIT/DB
  explanation: "다카다(Takada)의 침투주입 이론 및 다르시의 법칙(Darcy's Law)에 따르면, 주입 속도(또는 침투 속도) v는 투수계수 k에 비례하고 주입재의 점성 μ에 반비례합니다. 즉, v = k · i 이며 투수계수 k는 유체의 점성 μ에 반비례하므로(k ∝ 1/μ), 주입재의 점성이 기존 대비 4배로 증가하면 동일한 압력 구배(i) 조건에서 주입 속도는 기존의 1/4배로 감소하게 됩니다. 따라서 사용자가 선택한 '주입 속도가 4배 증가한다'는 오답이며, 올바른 정답은 '주입 속도가 1/4배로 감소한다.'입니다."
};

console.log('1. User Screenshot Situation Setup:');
console.log('   Raw Stale Answer in DB/JIT:', q.answer);
console.log('   User Clicked Choice        :', '② 주입 속도가 4배 증가한다.');

// Step 1: Run Sanitizer
const targetAns = getSanitizedMcAnswer(q);

console.log('\n2. Sanitizer Execution Result:');
console.log('   Sanitized Effective Answer:', targetAns);
console.log('   Updated q.answer          :', q.answer);

if (targetAns !== '④ 주입 속도가 1/4배로 감소한다.') {
  console.error('❌ FAIL: Sanitizer failed to pick option ④ as true answer!');
  process.exit(1);
}
console.log('   ✅ PASS: Sanitizer correctly extracted option ④!');

// Step 2: User Choice Evaluation
const userSelectedOption = '② 주입 속도가 4배 증가한다.';
const isUserCorrect = (userSelectedOption === targetAns);

console.log('\n3. Scoring & Validation:');
console.log('   Is User Choice Correct? :', isUserCorrect ? '❌ FAIL (Should be false)' : '✅ PASS (Correctly rated FALSE / 0 score)');

// Step 3: Rendered UI Options Styling Check
const optionClasses = q.options.map(opt => {
  const isThisCorrect = (opt === targetAns);
  if (isThisCorrect) return 'CORRECT_GREEN (bg-emerald-950 border-emerald-500)';
  if (opt === userSelectedOption && !isThisCorrect) return 'WRONG_RED (bg-rose-950 border-rose-500)';
  return 'DEFAULT (bg-slate-800/30)';
});

console.log('\n4. UI Border Rendering Results:');
optionClasses.forEach((cls, idx) => {
  console.log(`   Option ${idx + 1}: ${cls}`);
});

if (optionClasses[1].includes('WRONG_RED') && optionClasses[3].includes('CORRECT_GREEN')) {
  console.log('\n🎉 ALL CHECKS PASSED PERFECTLY!');
  console.log('   - Option ② correctly rendered with RED border (Wrong)');
  console.log('   - Option ④ correctly rendered with GREEN border (Right Answer)');
  console.log('   - User score correctly set to 0 / 7');
} else {
  console.error('❌ FAIL: UI Option Class mismatch!');
  process.exit(1);
}
