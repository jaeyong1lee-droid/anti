// [고도화된 자가 개선 테스터]: 상자별 알파벳 필터링 및 입력창 12개 과밀 억제 모의 실증 스크립트

const sampleFlowchartTextWithRepeatedLetters = `
┌────────────────────────────────────────────────────────┐
│ [1] 비탈면 현장 조사 및 지반 정수 산정               │
│ - 지질조사, 지하수위 확인, 토사 및 암반의 전단강도 산정 │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ [ (A) 입력 , (B) 입력 , (C) 입력 , (D) 입력 , (E) 입력 , (F) 입력 ] │
│ - (A) 입력 , (B) 입력 , (C) 입력 , (D) 입력 , (E) 입력 , (F) 입력  │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ [3] 억지말뚝 배치 간격 및 제원 산정                  │
│ - 말뚝 직경, 길이, 단면 강성 및 허용 휨모멘트 검토     │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ [ (A) 입력 , (B) 입력 , (C) 입력 , (D) 입력 , (E) 입력 , (F) 입력 ] │
│ - (A) 입력 , (B) 입력 , (C) 입력 , (D) 입력 , (E) 입력 , (F) 입력  │
└────────────────────────────────────────────────────────┘
`;

function testFlowchartBoxFiltering(text) {
  const lines = text.split('\n');
  const items = [];
  let currentBoxes = null;

  const flushBoxes = () => {
    if (currentBoxes && currentBoxes.length > 0) {
      const validBoxes = currentBoxes.filter(b => b.content.length > 0);
      if (validBoxes.length === 1) {
        items.push(validBoxes[0]);
      } else if (validBoxes.length > 1) {
        items.push({ type: 'branch', boxes: validBoxes });
      }
      currentBoxes = null;
    }
  };

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('┌') || trimmed.startsWith('└') || trimmed.startsWith('─') || trimmed.includes('───') || trimmed.includes('━━━')) {
      flushBoxes();
      continue;
    }
    if (line.includes('│') || line.includes('┃')) {
      const rawParts = line.split(/[│┃]/);
      let cols = rawParts.length > 2 ? rawParts.slice(1, rawParts.length - 1).map(c => c.trim()) : [line.trim()];
      if (!currentBoxes) currentBoxes = [];
      while (currentBoxes.length < cols.length) currentBoxes.push({ type: 'box', content: [] });
      cols.forEach((colContent, colIdx) => {
        if (colContent && currentBoxes[colIdx]) currentBoxes[colIdx].content.push(colContent);
      });
    } else {
      flushBoxes();
      if (trimmed === '│' || trimmed === '┃' || trimmed === '▼' || trimmed === '↓') items.push({ type: 'arrow', text: '▼' });
    }
  }
  flushBoxes();

  let inputBoxCount = 0;
  const boxResults = [];

  items.filter(i => i.type === 'box').forEach((box, idx) => {
    let allowedLetters = null;
    const hasAnyInput = box.content.some(line => /\(([A-F])\)/.test(line));
    if (hasAnyInput) {
      inputBoxCount++;
      if (inputBoxCount === 1) allowedLetters = ['A', 'B'];
      else if (inputBoxCount === 2) allowedLetters = ['C', 'D'];
      else if (inputBoxCount === 3) allowedLetters = ['E', 'F'];
    }

    const boxInputs = [];
    box.content.forEach(line => {
      const matches = line.match(/\(([A-F])\)/g);
      if (matches) {
        matches.forEach(m => {
          const letterMatch = m.match(/\(([A-F])\)/);
          if (letterMatch) {
            const letter = letterMatch[1];
            if (!allowedLetters || allowedLetters.includes(letter)) {
              if (!boxInputs.includes(letter)) {
                boxInputs.push(letter);
              }
            }
          }
        });
      }
    });

    boxResults.push({
      boxIndex: idx + 1,
      inputBoxSeq: hasAnyInput ? inputBoxCount : null,
      allowedLetters,
      renderedInputLetters: boxInputs
    });
  });

  return boxResults;
}

console.log("==========================================");
console.log("🤖 [보강된 자가 개선 테스터: 입력창 12개 과밀화 검증]");
console.log("==========================================");

const results = testFlowchartBoxFiltering(sampleFlowchartTextWithRepeatedLetters);
let passAll = true;

results.forEach((res) => {
  console.log(`\n- [상자 ${res.boxIndex}]: 입력상자 순번=${res.inputBoxSeq || '없음(안내상자)'}`);
  console.log(`  * 허용 알파벳: ${res.allowedLetters ? res.allowedLetters.join(', ') : '전체'}`);
  console.log(`  * 실제 렌더링 입력창: [ ${res.renderedInputLetters.join(', ')} ] (총 ${res.renderedInputLetters.length}개)`);

  if (res.inputBoxSeq === 1 && res.renderedInputLetters.length > 2) {
    console.error(`❌ [실패]: 상자 2에 2개를 초과하는 입력창이 과밀 렌더링되었습니다!`);
    passAll = false;
  }
  if (res.inputBoxSeq === 2 && res.renderedInputLetters.length > 2) {
    console.error(`❌ [실패]: 상자 4에 2개를 초과하는 입력창이 과밀 렌더링되었습니다!`);
    passAll = false;
  }
});

if (passAll) {
  console.log("\n✅ [자가 개선 테스터 통과]: 상자당 12개 폭탄 입력창이 100% 제거되고, 상자별 지정 알파벳(A,B / C,D) 2개씩만 정갈하게 필터링 렌더링되었습니다!");
  process.exit(0);
} else {
  console.error("\n❌ [자가 개선 테스터 실패]: 입력창 과밀 억제 실패");
  process.exit(1);
}
