function normalizeMcText(text) {
  if (!text) return '';
  return text
    .replace(/^[①②③④⑤1-5][\s\.\)\:\s]*/, '')
    .replace(/\s+/g, '')
    .replace(/[.~,`'"'']/g, '')
    .toLowerCase();
}

function getSanitizedMcAnswer(q) {
  if (!q || !q.answer) return q ? q.answer : '';
  if (!q.options || q.options.length === 0 || !q.explanation) return q.answer;

  const options = q.options;
  const exp = q.explanation;
  const currentAns = String(q.answer).trim();

  // Extract conclusion text if present (e.g. after [최종 정답 산출], 따라서, 정답은)
  const conclusionMatch = exp.match(/(?:\[최종\s*정답\s*산출\]|따라서|정답은|결론적으로)[\s\S]*$/i);
  const searchTarget = conclusionMatch ? conclusionMatch[0] : exp;
  const normalizedTarget = normalizeMcText(searchTarget);

  let bestMatch = null;
  let bestScore = 0;

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const normOpt = normalizeMcText(opt);
    if (!normOpt) continue;

    // 1) Direct substring match in normalized text (e.g. "1/4배로감소" inside "1/4배로감소하게됩니다")
    if (normalizedTarget.includes(normOpt)) {
      bestMatch = opt;
      bestScore = 100;
      break;
    }

    // 2) Keyword / Key numeric ratio matching (e.g. "1/4" or "2배" or "4배" or "변화가없다")
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
    const normBest = normalizeMcText(bestMatch);
    if (!normalizedTarget.includes(normCurrent) && (bestScore >= 100 || bestScore > 0)) {
      return bestMatch;
    }
  }

  return q.answer;
}

const sampleQ11 = {
  question: "어떤 사질토 지반에 침투주입을 수행할 때, 지반의 투수계수 k가 1.0 * 10^-4 cm/s 이고 주입재의 점성이 기준 조건 대비 4배로 증가하였을 때, 다카다(Takada) 및 관련 주입 이론에 근거할 때 동일한 압력 구배 조건에서 주입 속도의 변화 경향으로 알맞은 것을 고르시오.",
  options: [
    "① 주입 속도가 2배 증가한다.",
    "② 주입 속도가 4배 증가한다.",
    "③ 주입 속도는 변화가 없다.",
    "④ 주입 속도가 1/4배로 감소한다."
  ],
  answer: "① 주입 속도가 2배 증가한다.", // AI 환각으로 잘못 저장된 이전 정답
  explanation: "[적용 공식] 다카다(Takada) 및 달시의 법칙(Darcy's Law)에 기반한 침투주입 속도 공식 v = k * i ... [수치 대입 및 단위 환산] 주입재의 점성이 4배로 증가. [단계별 연산 과정] 점성이 4배로 증가함에 따라 주입재의 투수계수는 1/4 수준으로 감소. [최종 정답 산출] 따라서 주입 속도는 기존 대비 1/4 배로 감소하게 됩니다."
};

console.log("=== MC SANITIZER TEST RUN ===");
console.log("Input Stale Answer :", sampleQ11.answer);
const sanitizedAnswer = getSanitizedMcAnswer(sampleQ11);
console.log("Sanitized Correct Answer :", sanitizedAnswer);

if (sanitizedAnswer === sampleQ11.options[3]) {
  console.log("\n✅ SUCCESS: Corrected stale answer from ① to ④ ('④ 주입 속도가 1/4배로 감소한다.') perfectly!");
  process.exit(0);
} else {
  console.error("\n❌ FAIL: Answer was not corrected properly.");
  process.exit(1);
}
