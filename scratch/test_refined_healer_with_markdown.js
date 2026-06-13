const questionText = `다음 표는 동일한 점토 광물로 구성된 두 지반 X 와 Y 의 간극수 화학적 특성을 나타낸 것이다. Gouy – Chapman 이론에 근거하여 이중층 두께 t 와 지반공학적 특성 변화를 올바르게 설명한 것은 무엇인가? < tableborder = "1"style = "border – collapse: collapse; width: 100%; text – align: center;">< tr >< thstyle = "padding: 8px;">구분 < /th >< thstyle = "padding: 8px;">점토 지반 X < /th >< thstyle = "padding: 8px;">점토 지반 Y < /th >< /tr >< tr >< tdstyle = "padding: 8px;">퇴적 환경 < /td >< tdstyle = "padding: 8px;">해수 환경 (고농도 전해질 ) < /td >< tdstyle = "padding: 8px;">담수 환경 (저농도 전해질 ) < /td >< /tr >< tr >< tdstyle = "padding: 8px;">주요 양이온 < /td >< tdstyle = "padding: 8px;">다가 이온 (Ca2+ ) < /td >< tdstyle = "padding: 8px;">단가 이온 (Na+ ) < /td >< /tr >< /table >`;

function htmlTableToMarkdown(html) {
  if (!html) return html;

  let cleanHtml = html
    .replace(/<\s*table[^>]*>/gi, '<table>')
    .replace(/<\s*\/\s*table\s*>/gi, '</table>')
    .replace(/<\s*tr[^>]*>/gi, '<tr>')
    .replace(/<\s*\/\s*tr\s*>/gi, '</tr>')
    .replace(/<\s*th[^>]*>/gi, '<th>')
    .replace(/<\s*\/\s*th\s*>/gi, '</th>')
    .replace(/<\s*td[^>]*>/gi, '<td>')
    .replace(/<\s*\/\s*td\s*>/gi, '</td>');

  return cleanHtml.replace(/<table>([\s\S]*?)<\/table>/gi, (match, tableContent) => {
    const rows = [];
    const trRegex = /<tr>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    let hasHeader = false;

    while ((trMatch = trRegex.exec(tableContent)) !== null) {
      const rowContent = trMatch[1];
      const cells = [];
      
      const cellRegex = /<(?:th|td)[^>]*>([\s\S]*?)<\/\s*(?:th|td)>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        cells.push(cellMatch[1].trim());
      }
      
      if (cells.length > 0) {
        rows.push(`| ${cells.join(' | ')} |`);
        if (rowContent.includes('<th')) hasHeader = true;
      }
    }

    if (rows.length === 0) return '';

    const colCount = rows[0].split('|').length - 2;
    const separator = `| ${Array(colCount).fill('---').join(' | ')} |`;

    if (hasHeader) {
      rows.splice(1, 0, separator);
    } else {
      rows.unshift(`| ${Array(colCount).fill(' ').join(' | ')} |`);
      rows.splice(1, 0, separator);
    }

    return `\n\n${rows.join('\n')}\n\n`;
  });
}

const md = htmlTableToMarkdown(questionText);
console.log("=== MARKDOWN ===");
console.log(md);
