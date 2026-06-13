const textWithMdTable = `다음 표는 동일한 점토 광물로 구성된 두 지반 X 와 Y 의 간극수 화학적 특성을 나타낸 것이다. Gouy - Chapman 이론에 근거하여 이중층 두께 t 와 지반공학적 특성 변화를 올바르게 설명한 것은 무엇인가?

| 구분 | 점토 지반 X | 점토 지반 Y |
| --- | --- | --- |
| 퇴적 환경 | 해수 환경 (고농도 전해질 ) | 담수 환경 (저농도 전해질 ) |
| 주요 양이온 | 다가 이온 (Ca2+ ) | 단가 이온 (Na+ ) |`;

function parseMarkdownTable(questionText) {
  if (!questionText) return null;
  const lines = questionText.split('\n');
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (startIdx === -1) {
        startIdx = i;
      }
      endIdx = i;
    } else {
      if (startIdx !== -1) {
        break;
      }
    }
  }

  if (startIdx !== -1 && endIdx !== -1 && (endIdx - startIdx) >= 2) {
    const headers = lines[startIdx]
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    
    const separatorLine = lines[startIdx + 1];
    if (separatorLine.includes('---')) {
      const rows = [];
      for (let i = startIdx + 2; i <= endIdx; i++) {
        const rowCells = lines[i]
          .split('|')
          .slice(1, -1)
          .map(cell => cell.trim());
        rows.push(rowCells);
      }
      
      const originalTableText = lines.slice(startIdx, endIdx + 1).join('\n');
      return {
        tableData: { headers, rows },
        originalTableText
      };
    }
  }
  return null;
}

const parsed = parseMarkdownTable(textWithMdTable);
console.log('Parsed:', parsed);
if (parsed) {
  console.log('Cleaned text:', textWithMdTable.replace(parsed.originalTableText, '').trim());
}
