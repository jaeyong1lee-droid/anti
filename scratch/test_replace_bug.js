const q = {
  question: `다음 표는 동일한 점토 광물로 구성된 두 지반 X 와 Y 의 간극수 화학적 특성을 나타낸 것이다. Gouy - Chapman 이론에 근거하여 이중층 두께 t 와 지반공학적 특성 변화를 올바르게 설명한 것은 무엇인가? < tableborder = "1"style = "border - collapse: collapse; width: 100%; text - align: center;">< tr >< thstyle = "padding: 8px;">구분 < /th >< thstyle = "padding: 8px;">점토 지반 X < /th >< thstyle = "padding: 8px;">점토 지반 Y < /th >< /tr >< tr >< tdstyle = "padding: 8px;">퇴적 환경 < /td >< tdstyle = "padding: 8px;">해수 환경 (고농도 전해질 ) < /td >< tdstyle = "padding: 8px;">담수 환경 (저농도 전해질 ) < /td >< /tr >< tr >< tdstyle = "padding: 8px;">주요 양이온 < /td >< tdstyle = "padding: 8px;">다가 이온 (Ca2+ ) < /td >< tdstyle = "padding: 8px;">단가 이온 (Na+ ) < /td >< /tr >< /table >`
};

function parseQuestionTable(q) {
  let questionText = q.question || '';
  let tableData = q.tableData || null;

  // 테이블 매칭 정규식 (시작 태그와 끝 태그 사이에 임의의 내용 매칭)
  const tableRegex = /<\s*table[^>]*>([\s\S]*?)<\s*\/\s*table\s*>/i;
  const match = questionText.match(tableRegex);

  if (match) {
    const fullTableHtml = match[0];
    const tableContent = match[1];

    // 테이블 내부 태그 표준화 (공백 허용)
    const cleanedContent = tableContent
      .replace(/<\s*tr[^>]*>/gi, '<tr>')
      .replace(/<\s*\/\s*tr\s*>/gi, '</tr>')
      .replace(/<\s*th[^>]*>/gi, '<th>')
      .replace(/<\s*\/\s*th\s*>/gi, '</th>')
      .replace(/<\s*td[^>]*>/gi, '<td>')
      .replace(/<\s*\/\s*td\s*>/gi, '</td>');

    const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    const headers = [];
    const rows = [];
    
    while ((trMatch = trRegex.exec(cleanedContent)) !== null) {
      const rowContent = trMatch[1];
      const thRegex = /<th>([\s\S]*?)<\/th>/gi;
      let thMatch;
      const ths = [];
      while ((thMatch = thRegex.exec(rowContent)) !== null) {
        ths.push(thMatch[1].trim());
      }
      if (ths.length > 0) {
        headers.push(...ths);
        continue;
      }
      
      const tdRegex = /<td>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      const tds = [];
      while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
        tds.push(tdMatch[1].trim());
      }
      if (tds.length > 0) {
        rows.push(tds);
      }
    }

    if (rows.length > 0) {
      tableData = {
        headers: headers.length > 0 ? headers : rows[0],
        rows: headers.length > 0 ? rows : rows.slice(1)
      };
      
      // 원본 질문 텍스트에서 표 태그 부분 제거
      questionText = questionText.replace(fullTableHtml, '').trim();
    }
  }

  return { questionText, tableData };
}

const result = parseQuestionTable(q);
console.log("=== RESULT ===");
console.log("questionText:", result.questionText);
console.log("tableData:", result.tableData);

