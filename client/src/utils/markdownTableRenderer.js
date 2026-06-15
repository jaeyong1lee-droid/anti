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

  const headers = parseRow(tableLines[0]);
  const bodyRows = tableLines.slice(2).map(line => parseRow(line));
  
  let html = `<div class="w-full my-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">`;
  html += `<table class="w-full table-auto min-w-[480px] sm:min-w-full text-center border-collapse text-[13px] sm:text-[15px]">`;
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
