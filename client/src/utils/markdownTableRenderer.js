function parseRow(rowText) {
  if (!rowText) return [];
  let cells = rowText.split('|');
  
  // If it starts with '|', the first element of split is empty. Remove it.
  if (cells[0] !== undefined && cells[0].trim() === '') {
    cells.shift();
  }
  // If it ends with '|', the last element of split is empty. Remove it.
  if (cells[cells.length - 1] !== undefined && cells[cells.length - 1].trim() === '') {
    cells.pop();
  }
  
  return cells.map(cell => cell.trim());
}

function renderTableToHtml(tableLines) {
  if (tableLines.length < 2) return tableLines.join('\n');

  let headers = parseRow(tableLines[0]);
  let titleHeader = null;

  // If the first header cell starts with '#' (e.g. '### 요약 비교')
  if (headers[0] && headers[0].trim().startsWith('#')) {
    titleHeader = headers[0];
    headers.shift(); // Shift headers left
  }

  const colCount = headers.length;
  const bodyRows = tableLines.slice(2).map(line => {
    const row = parseRow(line);
    return row.slice(0, colCount);
  });
  
  let html = '';
  if (titleHeader) {
    const match = titleHeader.match(/^(#+)\s*(.*)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      html += `<h${level} class="text-[14px] sm:text-[16px]" style="margin-top: 1.8rem; margin-bottom: 0.6rem; font-weight: normal; color: #f1f5f9; border-bottom: 1px solid rgba(51, 65, 85, 0.2); padding-bottom: 0.15rem;">${text}</h${level}>`;
    }
  }

  html += `<div class="w-full my-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">`;
  html += `<table class="w-full table-auto text-center border-collapse text-[13px] sm:text-[15px] ${
    colCount === 2 ? 'min-w-[320px] sm:min-w-full' : 'min-w-[480px] sm:min-w-full'
  }">`;
  html += `<thead>`;
  html += `<tr class="bg-slate-900/80 text-slate-350 border-b border-slate-800">`;
  headers.forEach(h => {
    html += `<th class="p-1 sm:p-1.5 font-extrabold border-r border-slate-800 last:border-r-0">${h}</th>`;
  });
  html += `</tr>`;
  html += `</thead>`;
  html += `<tbody>`;
  bodyRows.forEach(row => {
    if (row.length === 0 || (row.length === 1 && row[0] === '')) return;
    
    html += `<tr class="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/20">`;
    row.forEach(cell => {
      html += `<td class="p-1 sm:p-1.5 border-r border-slate-800 last:border-r-0 text-slate-350">${cell}</td>`;
    });
    if (row.length < colCount) {
      for (let k = row.length; k < colCount; k++) {
        html += `<td class="p-1 sm:p-1.5 border-r border-slate-800 last:border-r-0 text-slate-350"></td>`;
      }
    }
    html += `</tr>`;
  });
  html += `</tbody>`;
  html += `</table>`;
  html += `</div>`;
  
  return html;
}

/**
 * Parses markdown tables from a given string and converts them into HTML tables.
 * Extremely robust against spacing variations in the separator line (e.g. |:---| or | : - - - |).
 * 
 * @param {string} text 
 * @returns {string} Converted HTML string
 */
export function convertMarkdownTablesToHtml(text) {
  if (!text) return text;
  
  const lines = text.split('\n');
  const processedLines = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if we are starting a table
    if (trimmed.includes('|') && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const isNextSeparator = nextLine.includes('|') && 
                              nextLine.includes('-') && 
                              /^[|:\s\-]+$/.test(nextLine);
                              
      if (isNextSeparator) {
        // Collect all consecutive lines that contain '|'
        const tableLines = [];
        let j = i;
        while (j < lines.length && lines[j].includes('|')) {
          tableLines.push(lines[j]);
          j++;
        }
        
        // Parse the collected lines
        if (tableLines.length >= 2) {
          const htmlTable = renderTableToHtml(tableLines);
          processedLines.push(htmlTable);
          i = j; // Advance past the table block
          continue;
        }
      }
    }
    
    processedLines.push(line);
    i++;
  }
  
  return processedLines.join('\n');
}
