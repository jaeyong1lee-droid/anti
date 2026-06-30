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

function renderTableToHtml(tableLines, precedingTitle = "") {
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
  const cleanTitle = precedingTitle ? precedingTitle.replace(/["']/g, '&quot;') : '비교표';

  html += `<div class="w-full my-4 space-y-2 table-export-wrapper relative">`;
  html += `<div class="flex items-center justify-between gap-4 border-b border-slate-800/60 pb-2">`;
  html += `<span class="text-xs sm:text-sm font-extrabold text-slate-350 select-none flex items-center gap-1.5">`;
  html += `📊 ${cleanTitle}`;
  html += `</span>`;
  html += `<button 
    onclick="if(window.__handleTableConfirmRequest) { window.__handleTableConfirmRequest(this.closest('.table-export-wrapper').querySelector('table').outerHTML, '${cleanTitle}') }"
    class="p-1.5 bg-slate-900 hover:bg-rose-600 border border-slate-700/50 rounded-lg text-slate-200 hover:text-white transition-all cursor-pointer flex items-center justify-center shadow-md select-none hover:scale-105 active:scale-95"
    title="필수암기 표로 내보내기"
    style="outline: none;"
  >`;
  html += `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>`;
  html += `</button>`;
  html += `</div>`;

  html += `<div class="w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">`;
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
  html += `</div>`; // closes overflow-x-auto
  html += `</div>`; // closes table-export-wrapper
  
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
          let precedingTitle = "";
          if (i > 0) {
            let searchIdx = i - 1;
            while (searchIdx >= 0) {
              const pLine = lines[searchIdx].trim();
              if (pLine && !pLine.includes('|') && !pLine.startsWith('```')) {
                let candidate = pLine.replace(/^(#+\s*|\*+\s*|-\s*)/, '').replace(/\*+$/, '').trim();
                
                // If it contains a colon, check if the prefix is a good title candidate
                if (candidate.includes(':') || candidate.includes('：')) {
                  const colonIdx = candidate.indexOf(':') !== -1 ? candidate.indexOf(':') : candidate.indexOf('：');
                  const prefix = candidate.substring(0, colonIdx).replace(/\*+/g, '').trim();
                  if (prefix.length > 1 && prefix.length <= 40) {
                    candidate = prefix;
                  }
                }
                
                // Limit title length to 40 characters maximum to avoid long description lines
                if (candidate.length > 40) {
                  candidate = candidate.substring(0, 40) + '...';
                }
                
                precedingTitle = candidate;
                break;
              }
              searchIdx--;
            }
          }
          const htmlTable = renderTableToHtml(tableLines, precedingTitle);
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

