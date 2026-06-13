const mockQ = {
  type: "주관식 (표채우기)",
  question: "터널 굴착면 상부의 보강 공법인 강관다단 그라우팅과 천단 훠폴링 공법의 비교표 빈칸 (A), (B)에 들어갈 공학적 설명을 기술하시오.",
  tableData: {
    headers: ["비교 항목", "강관다단 그라우팅 공법", "천단 훠폴링 (Forepoling) 공법"],
    rows: [
      ["보강재 규격 및 특성", "대구경 강관 주입재 가압 그라우팅", "[INPUT_1]"],
      ["주요 역할 및 역학적 기전", "[INPUT_2]", "천단 낙석 방지 및 국부 붕괴 방지"],
      ["시공 길이 및 범위", "10m ~ 15m (중합 시공 필요)", "3m ~ 6m 내외"]
    ]
  },
  answers: {
    "INPUT_1": "소구경 강봉 또는 이형철근 주입",
    "INPUT_2": "터널 상부 종방향 아치 형성 및 차수"
  },
  explanation: "강관다단 그라우팅은 대구경 강관과 가압 주입을 통해 천단부에 종방향 아치를 형성하고 차수 효과를 극대화하는 반면, 훠폴링은 소구경 보강재로 천단의 국부 탈락 및 낙석 방지에 초점을 둡니다."
};

function healQuizQuestionObject(q) {
  if (q && typeof q === 'object') {
    // 1. For table subjective fill-in questions, empty out all cell contents 
    // (except headers and row-label column) and turn them into inputs!
    if (q.type === '주관식 (표채우기)' && q.tableData && q.tableData.rows) {
      const { rows } = q.tableData;
      const oldAnswers = q.answers || {};
      const newAnswers = {};
      let inputCount = 1;

      const newRows = rows.map((row) => {
        return row.map((cell, cIdx) => {
          if (cIdx === 0) return cell; // Keep the row label intact

          const inputId = `INPUT_${inputCount}`;
          inputCount++;

          // Extract correct answer:
          let correctAnswer = '';
          const trimmedCell = typeof cell === 'string' ? cell.trim() : '';
          
          if (trimmedCell.includes('[INPUT_')) {
            // It was already an input field. Find its original input number (e.g. [INPUT_1] -> 1)
            const match = trimmedCell.match(/INPUT_(\d+)/i);
            if (match) {
              const origId = `INPUT_${match[1]}`;
              correctAnswer = oldAnswers[origId] || '';
            } else {
              correctAnswer = '';
            }
          } else {
            // It was plain text, so the text itself is the correct answer
            correctAnswer = cell;
          }

          newAnswers[inputId] = correctAnswer;
          return `[${inputId}]`;
        });
      });

      q.tableData.rows = newRows;
      q.answers = newAnswers;
    }
  }
  return q;
}

const healed = healQuizQuestionObject(mockQ);
console.log("=== HEALED QUESTION ===");
console.log(JSON.stringify(healed, null, 2));
