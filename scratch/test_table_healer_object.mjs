function parseQuestionTableText(questionText) {
  let tableData = null;
  if (questionText.toLowerCase().includes('<table') || questionText.toLowerCase().replace(/\s+/g, '').includes('<table')) {
    let cleaned = questionText
      .replace(/<\s*table[^>]*>/gi, '<table>')
      .replace(/<\s*\/table\s*>/gi, '</table>')
      .replace(/<\s*tr[^>]*>/gi, '<tr>')
      .replace(/<\s*\/tr\s*>/gi, '</tr>')
      .replace(/<\s*th[^>]*>/gi, '<th>')
      .replace(/<\s*\/th\s*>/gi, '</th>')
      .replace(/<\s*td[^>]*>/gi, '<td>')
      .replace(/<\s*\/td\s*>/gi, '</td>');

    const tableRegex = /<table>([\s\S]*?)<\/table>/i;
    const match = cleaned.match(tableRegex);
    if (match) {
      const tableContent = match[1];
      const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      const headers = [];
      const rows = [];
      
      while ((trMatch = trRegex.exec(tableContent)) !== null) {
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
        
        const tableStartIdx = questionText.toLowerCase().search(/<\s*table/i);
        const tableEndIdx = questionText.toLowerCase().search(/<\s*\/\s*table\s*>/i);
        if (tableStartIdx !== -1 && tableEndIdx !== -1) {
          const endBracketIdx = questionText.indexOf('>', tableEndIdx);
          if (endBracketIdx !== -1) {
            const originalTableHtml = questionText.substring(tableStartIdx, endBracketIdx + 1);
            questionText = questionText.replace(originalTableHtml, '').trim();
          }
        }
      }
    }
  }
  return { questionText, tableData };
}

function healQuizQuestionObject(q) {
  if (q && typeof q === 'object') {
    if (q.question && (!q.tableData || !q.tableData.headers || !q.tableData.rows)) {
      const parsed = parseQuestionTableText(q.question);
      if (parsed.tableData) {
        q.tableData = parsed.tableData;
        q.question = parsed.questionText;
      }
    }
  }
  return q;
}

const mockQ = {
  type: "객관식",
  question: `Gouy – Chapman 이론에 근거하여 이중층 두께 t 와 지반공학적 특성 변화를 올바르게 설명한 것은 무엇인가? < tableborder = "1"style = "border – collapse: collapse; width: 100%; text – align: center;">< tr >< thstyle = "padding: 8px;">구분 < /th >< thstyle = "padding: 8px;">점토 지반 X < /th >< thstyle = "padding: 8px;">점토 지반 Y < /th >< /tr >< tr >< tdstyle = "padding: 8px;">퇴적 환경 < /td >< tdstyle = "padding: 8px;">해수 환경 (고농도 전해질 ) < /td >< tdstyle = "padding: 8px;">담수 환경 (저농도 전해질 ) < /td >< /tr >< /table >`,
  tableData: null
};

console.log("=== BEFORE HEAL ===");
console.log(mockQ);

const healed = healQuizQuestionObject(mockQ);
console.log("\n=== AFTER HEAL ===");
console.log(healed);
