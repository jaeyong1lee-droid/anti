const fs = require('fs');
const path = require('path');

const clientPath = path.join(__dirname, '../client/src/App.jsx');
const serverPath = path.join(__dirname, '../server/index.js');

console.log('--- Patching client App.jsx ---');
let clientCode = fs.readFileSync(clientPath, 'utf8');

// Normalize clientCode to LF
clientCode = clientCode.replace(/\r\n/g, '\n');

// 1. Define forceSaveActiveSessions and tab-close pagehide effect
const clientTarget1 = `  // ── Auto-sync Review Quiz state to server on changes`;
const clientReplacement1 = `  const forceSaveActiveSessions = () => {
    // 1) Save active review session immediately
    if (selectedTopic && selectedTopic.id && aiQuestions.length > 0 && !selectedTopic.isReadOnly) {
      console.log('[forceSaveActiveSessions] Immediately saving active review session');
      fetch(\`\${API_BASE}/api/session/review\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: selectedTopic.id,
          scheduleId: selectedTopic.schedule_id,
          questions: aiQuestions,
          selectedAnswers,
          revealedQuestions,
          savedQuizScroll: quizBodyRef.current?.scrollTop || 0
        })
      }).catch(e => console.warn('복습 세션 긴급 동기화 실패:', e));
    }

    // 2) Save active exam session immediately
    if (examQuestions.length > 0 && !loadingExam) {
      console.log('[forceSaveActiveSessions] Immediately saving active exam session');
      fetch(\`\${API_BASE}/api/session/exam\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examQuestions,
          examRevealed,
          examAnswers,
          examTopic,
          savedExamScroll: examBodyRef.current?.scrollTop || 0
        })
      }).catch(e => console.warn('종합평가 세션 긴급 동기화 실패:', e));
    }
  };

  // ── Auto-save active sessions when leaving/reloading the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      forceSaveActiveSessions();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [selectedTopic, aiQuestions, selectedAnswers, revealedQuestions, examQuestions, examRevealed, examAnswers, examTopic]);

  // ── Auto-sync Review Quiz state to server on changes`;

let idx1 = clientCode.indexOf(clientTarget1);
if (idx1 === -1) {
  console.log('Target 1 already patched or not found.');
} else {
  clientCode = clientCode.substring(0, idx1) + clientReplacement1 + clientCode.substring(idx1 + clientTarget1.length);
}


// 2. Patch desktop sidebar buttons to call forceSaveActiveSessions
const desktopTargets = [
  {
    target: `            onClick={() => {
              setViewMode('dashboard');`,
    replacement: `            onClick={() => {
              forceSaveActiveSessions();
              setViewMode('dashboard');`
  },
  {
    target: `            onClick={() => {
              setViewMode('all_topics');`,
    replacement: `            onClick={() => {
              forceSaveActiveSessions();
              setViewMode('all_topics');`
  },
  {
    target: `            onClick={() => {
              setSelectedTopic(null);
              setShowFormulaExam(false);
              setShowTheoryExam(false);
              setShowAnswerSheet(false);
              handleOpenExam();`,
    replacement: `            onClick={() => {
              forceSaveActiveSessions();
              setSelectedTopic(null);
              setShowFormulaExam(false);
              setShowTheoryExam(false);
              setShowAnswerSheet(false);
              handleOpenExam();`
  },
  {
    target: `            onClick={() => {
              setSelectedTopic(null);
              setShowExam(false);
              setShowTheoryExam(false);
              setShowAnswerSheet(false);
              handleOpenFormulaExam();`,
    replacement: `            onClick={() => {
              forceSaveActiveSessions();
              setSelectedTopic(null);
              setShowExam(false);
              setShowTheoryExam(false);
              setShowAnswerSheet(false);
              handleOpenFormulaExam();`
  },
  {
    target: `            onClick={() => {
              setSelectedTopic(null);
              setShowExam(false);
              setShowFormulaExam(false);
              setShowAnswerSheet(false);
              handleOpenTheoryExam();`,
    replacement: `            onClick={() => {
              forceSaveActiveSessions();
              setSelectedTopic(null);
              setShowExam(false);
              setShowFormulaExam(false);
              setShowAnswerSheet(false);
              handleOpenTheoryExam();`
  },
  {
    target: `            onClick={() => {
              setSelectedTopic(null);
              setShowExam(false);
              setShowFormulaExam(false);
              setShowTheoryExam(false);
              handleOpenAnswerSheet();`,
    replacement: `            onClick={() => {
              forceSaveActiveSessions();
              setSelectedTopic(null);
              setShowExam(false);
              setShowFormulaExam(false);
              setShowTheoryExam(false);
              handleOpenAnswerSheet();`
  }
];

desktopTargets.forEach((t, i) => {
  const idx = clientCode.indexOf(t.target);
  if (idx !== -1) {
    clientCode = clientCode.substring(0, idx) + t.replacement + clientCode.substring(idx + t.target.length);
    console.log(`Patched desktop button #${i+1}`);
  } else {
    console.warn(`Desktop button #${i+1} target not found.`);
  }
});


// 3. Patch mobile header buttons to call forceSaveActiveSessions
const mobileTargets = [
  {
    target: `                onClick={() => setViewMode('dashboard')}`,
    replacement: `                onClick={() => { forceSaveActiveSessions(); setViewMode('dashboard'); }}`
  },
  {
    target: `                onClick={() => setViewMode('all_topics')}`,
    replacement: `                onClick={() => { forceSaveActiveSessions(); setViewMode('all_topics'); }}`
  },
  {
    target: `                onClick={handleOpenExam}`,
    replacement: `                onClick={() => { forceSaveActiveSessions(); handleOpenExam(); }}`
  },
  {
    target: `                onClick={handleOpenFormulaExam}`,
    replacement: `                onClick={() => { forceSaveActiveSessions(); handleOpenFormulaExam(); }}`
  },
  {
    target: `                onClick={handleOpenTheoryExam}`,
    replacement: `                onClick={() => { forceSaveActiveSessions(); handleOpenTheoryExam(); }}`
  },
  {
    target: `                onClick={handleOpenAnswerSheet}`,
    replacement: `                onClick={() => { forceSaveActiveSessions(); handleOpenAnswerSheet(); }}`
  }
];

mobileTargets.forEach((t, i) => {
  const idx = clientCode.indexOf(t.target);
  if (idx !== -1) {
    clientCode = clientCode.substring(0, idx) + t.replacement + clientCode.substring(idx + t.target.length);
    console.log(`Patched mobile button #${i+1}`);
  } else {
    console.warn(`Mobile button #${i+1} target not found.`);
  }
});


// 4. Patch Review Modal Close Button
const reviewCloseTarget = `                  if (selectedTopic?.isReadOnly) {
                    handleQuizCompleteClick();
                  } else {
                    setSelectedTopic(null); 
                  }`;
const reviewCloseReplacement = `                  if (selectedTopic?.isReadOnly) {
                    handleQuizCompleteClick();
                  } else {
                    forceSaveActiveSessions();
                    setSelectedTopic(null); 
                  }`;
const idxReviewClose = clientCode.indexOf(reviewCloseTarget);
if (idxReviewClose !== -1) {
  clientCode = clientCode.substring(0, idxReviewClose) + reviewCloseReplacement + clientCode.substring(idxReviewClose + reviewCloseTarget.length);
  console.log('Patched Review modal close button');
} else {
  console.warn('Review modal close button target not found.');
}


// 5. Patch Popstate close events for mobile browser back button
const popstateTargets = [
  {
    target: `        if (activeModalRef.current === 'review') {
          setSelectedTopic(null);`,
    replacement: `        if (activeModalRef.current === 'review') {
          forceSaveActiveSessions();
          setSelectedTopic(null);`
  },
  {
    target: `        } else if (activeModalRef.current === 'exam') {
          setShowExam(false);`,
    replacement: `        } else if (activeModalRef.current === 'exam') {
          forceSaveActiveSessions();
          setShowExam(false);`
  }
];

popstateTargets.forEach((t, i) => {
  const idx = clientCode.indexOf(t.target);
  if (idx !== -1) {
    clientCode = clientCode.substring(0, idx) + t.replacement + clientCode.substring(idx + t.target.length);
    console.log(`Patched popstate event #${i+1}`);
  } else {
    console.warn(`Popstate event #${i+1} target not found.`);
  }
});


fs.writeFileSync(clientPath, clientCode, 'utf8');
console.log('Successfully patched client App.jsx');

console.log('--- Patching server index.js ---');
let serverCode = fs.readFileSync(serverPath, 'utf8');

// Normalize serverCode to LF
serverCode = serverCode.replace(/\r\n/g, '\n');

// 1. Replace regenerate/adjust prompt instructions (line 3298 and 3709)
// Let's use the exact literal string.
// Note that in server/index.js, the line starts with `- 모든 수식이나` and has backslashes escaped for JS string literal representation.
// In the file, the text is:
// `- 모든 수식이나 변수 기호는 LaTeX 문법($수식$)으로 표기하며, JSON 파싱 에러를 유발하지 않도록 모든 LaTeX 명령어의 역슬래시(\\ 기호)는 반드시 이중 역슬래시(\\\\ 기호)로 이중 이스케이프해야 합니다.\n- 마크다운 블록 (\`\`\`json) 등 불필요한 설명은 제거하고 오직 순수 JSON 객체만 반환하십시오.`
const serverTargetPrompt1 = `- 모든 수식이나 변수 기호는 LaTeX 문법($수식$)으로 표기하며, JSON 파싱 에러를 유발하지 않도록 모든 LaTeX 명령어의 역슬래시(\\\\ 기호)는 반드시 이중 역슬래시(\\\\\\\\ 기호)로 이중 이스케이프해야 합니다.
- 마크다운 블록 (\\\`\\\`\\\`json) 등 불필요한 설명은 제거하고 오직 순수 JSON 객체만 반환하십시오.`;

const replacementPromptLines1 = `- 모든 수식이나 변수 기호는 LaTeX 문법($수식$)으로 표기합니다. 공식뿐만 아니라 모든 개별 물리/공학 변수 기호(예: $y_p$, $p_p$, $p_0$, $K_s$, $k_h$, $e$, $c$, $\\phi$, $\\sigma$, $\\tau$, $u$ 등)도 단독으로 올 때 무조건 인라인 LaTeX 기호인 $변수명$ 형태로 감싸야 하며, 절대 일반 텍스트로 날것으로 기재하지 마십시오.
- JSON 파싱 에러를 유발하지 않도록 모든 LaTeX 명령어의 역슬래시(\\\\ 기호)는 반드시 이중 역슬래시(\\\\\\\\ 기호)로 이중 이스케이프해야 합니다 (예: \\\\\\\\frac{a}{b}, \\\\\\\\sigma, \\\\\\\\cdot 등). 절대 역슬래시를 누락시켜 'frac{a}{b}' 등으로 기재하지 마십시오.
- LaTeX 명령어의 중괄호 {} 기호는 절대로 누락하지 말고 완전하게 기재하십시오 (예: \\\\\\\\frac{p_p - p_0}{k_h}가 올바르고, fracp_p - p_0k_h는 절대 오답입니다).
- 중요: LaTeX 수식 기호( $ 또는 $$ ) 바로 안쪽에는 절대 공백이 들어가지 않아야 합니다 (예: '$수식$'은 올바르고, '$ 수식 $'과 같이 안쪽에 공백이 있으면 절대 안 됩니다). 또한, LaTeX 수식 바깥쪽 앞뒤로 한글이 올 때는 그 사이에 반드시 공백(띄어쓰기)을 주어 한글과 수식이 달라붙지 않게 처리하십시오.
- 🚨 [수식 절대 엄금 경고]: 문장 중간이나 수식 명령어 내부(예: \\\\\\\\frac 뒤쪽 등)에 마크다운 기호 '$'를 파편화하여 쪼개 넣는 행위를 절대 금지합니다. 수식은 무조건 문장과 분리하여 완벽한 '단일 덩어리'로만 감싸십시오. 아래첨자('_')나 괄호 앞뒤에 불필요한 역슬래시('\\\\\\\\')를 임의로 우회 주입하여 구문 오류를 만들지 마십시오.
- 마크다운 블록 (\\\`\\\`\\\`json) 등 불필요한 설명은 제거하고 오직 순수 JSON 객체만 반환하십시오.`;

// Replace occurrences one-by-one by finding the index
let countPrompt1 = 0;
while (true) {
  const idx = serverCode.indexOf(serverTargetPrompt1);
  if (idx === -1) break;
  serverCode = serverCode.substring(0, idx) + replacementPromptLines1 + serverCode.substring(idx + serverTargetPrompt1.length);
  countPrompt1++;
}
console.log(`Replaced prompts in regenerate/adjust: count = ${countPrompt1}`);


// 2. Replace healLatexFormulas function's symbols wrapping to include frac, sqrt, etc.
// In the raw file (after LF normalization), the code is:
const serverTargetHeal = `      // Wrap bare Greek letters with backslashes
      symbols.forEach(sym => {
        const regex = new RegExp(\`(?<!\\\\\\\\)\\\\b\${sym}\\\\b\`, 'g');
        t = t.replace(regex, \`\\\\\${sym}\`);
      });

      // Wrap individual Greek variables like \\\\alpha_p, \\\\alpha_f, \\\\phi, including curly brace subscripts like \\\\tau_{allow}
      const subscriptPattern = \`(?:_[a-zA-Z0-9]+|_(?:\\\\{[a-zA-Z0-9_]+\\\\}))?\`;
      const greekPattern = new RegExp(\`(\\\\\\\\\\\\b(?:\${symbols.join('|')})\${subscriptPattern}(?![a-zA-Z0-9_]))\`, 'g');`;

const replacementHealLines = `      // Wrap bare Greek letters and standard math commands with backslashes
      const mathWords = [
        'sigma', 'tau', 'alpha', 'beta', 'gamma', 'phi', 'theta', 'epsilon', 'pi', 'delta', 'omega', 'mu', 'lambda', 'psi', 'rho', 'eta', 'Delta', 'Sigma', 'Gamma', 'Phi', 'Theta', 'Omega',
        'frac', 'sqrt', 'cdot', 'mathrm', 'times', 'log', 'ln', 'sin', 'cos', 'tan', 'approx', 'partial'
      ];
      mathWords.forEach(word => {
        const regex = new RegExp(\`(?<!\\\\\\\\)\\\\b\${word}\\\\b\`, 'g');
        t = t.replace(regex, \`\\\\\${word}\`);
      });

      // Wrap individual Greek variables like \\\\alpha_p, \\\\alpha_f, \\\\phi, including curly brace subscripts like \\\\tau_{allow}
      const subscriptPattern = \`(?:_[a-zA-Z0-9]+|_(?:\\\\{[a-zA-Z0-9_]+\\\\}))?\`;
      const greekPattern = new RegExp(\`(\\\\\\\\\\\\b(?:\${mathWords.join('|')})\${subscriptPattern}(?![a-zA-Z0-9_]))\`, 'g');`;

// Let's normalize LF
const normTargetHeal = serverTargetHeal.replace(/\r\n/g, '\n');
const normReplacementHeal = replacementHealLines.replace(/\r\n/g, '\n');

const idxHeal = serverCode.indexOf(normTargetHeal);
if (idxHeal !== -1) {
  serverCode = serverCode.substring(0, idxHeal) + normReplacementHeal + serverCode.substring(idxHeal + normTargetHeal.length);
  console.log('Successfully replaced symbols wrapping inside healLatexFormulas');
} else {
  console.error('Could not find symbols wrapping target inside healLatexFormulas!');
}

fs.writeFileSync(serverPath, serverCode, 'utf8');
console.log('Successfully patched server index.js');
