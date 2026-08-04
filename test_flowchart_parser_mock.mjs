// [보강된 자가 개선 테스터]: 플로우차트 파서 및 렌더링 박스 구조 모의 실증 테스트 스크립트

const sampleFlowchartText = `
┌────────────────────────────────────────────────────────┐
│ [1] 비탈면 현장 조사 및 지반 정수 산정               │
│ - 지질조사, 지하수위 확인, 토사 및 암반의 전단강도 산정 │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ (A) 입력 , (B) 입력 , (C) 입력                         │
│ - (D) 입력 , (E) 입력 , (F) 입력                       │
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
│ (A) 입력 , (B) 입력                                    │
│ - (C) 입력 , (D) 입력                                   │
└────────────────────────────────────────────────────────┘
`;

function testFlowchartParser(text) {
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
      let cols = [];
      if (rawParts.length > 2) {
        cols = rawParts.slice(1, rawParts.length - 1).map(c => c.trim());
      } else if (rawParts.length === 2) {
        cols = [rawParts[0].trim(), rawParts[1].trim()].filter(Boolean);
      } else {
        cols = [line.trim()];
      }

      if (!currentBoxes) currentBoxes = [];
      while (currentBoxes.length < cols.length) {
        currentBoxes.push({ type: 'box', content: [] });
      }
      cols.forEach((colContent, colIdx) => {
        if (colContent && currentBoxes[colIdx]) {
          currentBoxes[colIdx].content.push(colContent);
        }
      });
    } else {
      flushBoxes();
      if (trimmed === '│' || trimmed === '┃' || trimmed === '▼' || trimmed === '↓') {
        items.push({ type: 'arrow', text: '▼' });
      }
    }
  }
  flushBoxes();

  let expectedBoxNum = 1;
  const fixTitleSequence = (boxObj) => {
    if (!boxObj || !boxObj.content || boxObj.content.length === 0) return;
    const title = boxObj.content[0] || '';
    const match = title.match(/\[(\d+|\*)\]/);
    if (match) {
      const numStr = match[1];
      if (numStr === '*') {
        boxObj.content[0] = title.replace(`[${numStr}]`, `[${expectedBoxNum}]`);
        expectedBoxNum++;
      } else {
        const num = parseInt(numStr, 10);
        if (num < expectedBoxNum) {
          boxObj.content[0] = title.replace(`[${numStr}]`, `[${expectedBoxNum}]`);
          expectedBoxNum++;
        } else {
          expectedBoxNum = num + 1;
        }
      }
    } else {
      const currentNum = expectedBoxNum;
      expectedBoxNum++;
      boxObj.content.unshift(`[${currentNum}] 설계 단계명 및 세부 내용 입력`);
    }
  };

  items.forEach(item => {
    if (item.type === 'box') {
      fixTitleSequence(item);
    }
  });

  return items;
}

console.log("==========================================");
console.log("🤖 [보강된 자가 개선 테스터 실행 보고]");
console.log("==========================================");

const parsedResult = testFlowchartParser(sampleFlowchartText);
const boxes = parsedResult.filter(i => i.type === 'box');

console.log(`\n총 파싱된 상자 개수: ${boxes.length}개`);
let passAll = true;

boxes.forEach((box, idx) => {
  const header = box.content[0];
  console.log(`- 상자 ${idx + 1} 타이틀 헤더: "${header}"`);
  if (!header.startsWith(`[${idx + 1}]`)) {
    console.error(`❌ [오류 발견]: 상자 ${idx + 1}의 헤더가 [${idx + 1}]로 시작하지 않습니다.`);
    passAll = false;
  }
});

if (passAll && boxes.length === 4) {
  console.log("\n✅ [테스터 검증 통과]: [1], [2], [3], [4] 모든 단계별 상자 타이틀 헤더가 빈틈없이 100% 정상 자동 보정 및 파싱되었습니다!");
  process.exit(0);
} else {
  console.error("\n❌ [테스터 검증 실패]: 타이틀 순서 보정 실패");
  process.exit(1);
}
