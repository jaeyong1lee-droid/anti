import fs from 'fs';

// 1. extractCalculationRowsFromText logic
function extractCalculationRowsFromText(fileText) {
  if (!fileText) return null;

  const subQuestionPattern = /[（(](\d+)[)）]\s*([^\n(（]+?)(?=\s*[（(]\d+[)）]|\n\n|$)/g;
  const matches = [];
  let match;
  while ((match = subQuestionPattern.exec(fileText)) !== null) {
    const num = parseInt(match[1]);
    const text = match[2].trim().replace(/[,，]\s*$/, '').replace(/\s+/g, ' ');
    if (text.length >= 3 && text.length <= 80 && num >= 1 && num <= 10) {
      matches.push({ num, text });
    }
  }

  if (matches.length < 2) return null;

  let bestGroup = [];
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].num === 1) {
      const group = [matches[i]];
      for (let j = i + 1; j < matches.length; j++) {
        if (matches[j].num === group[group.length - 1].num + 1) {
          group.push(matches[j]);
        } else if (matches[j].num > group[group.length - 1].num + 1) {
          break;
        }
      }
      if (group.length > bestGroup.length) bestGroup = group;
    }
  }

  if (bestGroup.length < 2) return null;

  const rows = bestGroup.map(({ num, text }) => [
    `(${num}) ${text}`,
    `[INPUT_${num}]`
  ]);
  const answers = {};
  bestGroup.forEach(({ num, text }) => {
    answers[`INPUT_${num}`] = `(${num}) ${text} 공식 및 수치 풀이`;
  });

  return { rows, answers };
}

// Mock the fileText based on the problem context
const fileText = `
댐 저면 침투 및 유선망 수리해석 보고서
(1) 침투수량
계산과정...
(2) A, B 및 C점에서의 간극수압
계산과정...
(3) C점에서 출구까지 동수경사를 구하시오.
계산과정...
`;

const title = "댐 저면 침투 및 유선망 수리해석 보고서";
const extracted = extractCalculationRowsFromText(fileText);
const rows = extracted ? extracted.rows : [];
const answers = extracted ? extracted.answers : {};

const fallbackQuestion = {
  type: "주관식 (표채우기)",
  subtype: "표채우기",
  question: `[${title} 계산 문제] 첨부 그림 및 원보고서 조건에 따른 수치 계산 항목의 정답을 구하여 아래 표의 빈칸을 완성하시오.`,
  tableData: {
    headers: ["구하는 항목", "계산 결과 및 답안"],
    rows: rows
  },
  answers: answers,
  answer: "첨부된 보고서 해설 및 풀이 참조",
  concept: "주어진 수치 조건(투수계수, 수두차, 형상계수 등)을 바탕으로 관련 공식을 적용하여 각 항목을 산정합니다.",
  explanation: "보고서 본문의 상세 계산 과정을 참고하여 올바른 수치 답안을 기재해야 합니다."
};

console.log(JSON.stringify(fallbackQuestion, null, 2));

// Simulate healQuizQuestionObject
const q = { ...fallbackQuestion };
const hasCalcHeaders = q.tableData && Array.isArray(q.tableData.headers) && (
  q.tableData.headers[0] === '구하는 항목' || q.tableData.headers[1] === '계산 결과 및 답안'
);
if (hasCalcHeaders) {
  q.type = '주관식 (계산)';
  q.subtype = '계산';
}
console.log("After healQuizQuestionObject type:", q.type);

// Simulate isCalculationQuestion
const qText = q.question || '';
const isExplicitCompOrTheory = /비교하시오|특성을\s*비교|차이점|서술하시오|설명하시오/i.test(qText);
const hasCalcHeadersFinal = q.tableData && Array.isArray(q.tableData.headers) && (
  q.tableData.headers[0] === '구하는 항목' || q.tableData.headers[1] === '계산 결과 및 답안'
);
let isCalc = false;
if (isExplicitCompOrTheory) isCalc = false;
else if (hasCalcHeadersFinal) isCalc = true;
else if (q.type === '주관식 (계산)' || q.subtype === '계산') isCalc = true;

console.log("isCalculationQuestion returns:", isCalc);
