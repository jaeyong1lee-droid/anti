import { cleanAndSanitizeMathText } from './renderingHelpers';

function parseRow(rowText) {
  if (!rowText) return [];
  let cells = rowText.split('|').map(cell => cell.trim());
  while (cells.length > 0 && cells[0] === '') {
    cells.shift();
  }
  while (cells.length > 0 && cells[cells.length - 1] === '') {
    cells.pop();
  }
  return cells;
}

function renderCellMath(text) {
  if (!text) return '';
  if (typeof text !== 'string') return text;
  
  const cleanedText = cleanAndSanitizeMathText(text);
  
  // Replace $$ ... $$ first (block math)
  let temp = cleanedText.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (match, math) => {
    if (window.katex) {
      try {
        let cleaned = math.trim();
        cleaned = cleaned.replace(/\\frac\b/g, '\\dfrac');
        cleaned = cleaned.replace(/\\{2,}%/g, '\\%');
        cleaned = cleaned.replace(/(?<!\\)%/g, '\\%');
        cleaned = cleaned.replace(/^\$|\$/g, '').trim();
        return window.katex.renderToString(cleaned, { displayMode: true, throwOnError: false });
      } catch (e) {
        console.warn('KaTeX render error in table cell (block):', e);
        return match;
      }
    }
    return match;
  });

  // Replace $ ... $ (inline math)
  temp = temp.replace(/\$([^\$]+?)\$/g, (match, math) => {
    const isReal = !/[\uAC00-\uD7A3]/.test(math) || /\\/.test(math) || /_/.test(math) || /\^/.test(math) || /[=+\-\*\/]/.test(math) || /\\cdot/.test(math);
    if (!isReal) {
      return match;
    }
    if (window.katex) {
      try {
        let cleaned = math.trim();
        cleaned = cleaned.replace(/\\frac\b/g, '\\dfrac');
        cleaned = cleaned.replace(/\\{2,}%/g, '\\%');
        cleaned = cleaned.replace(/(?<!\\)%/g, '\\%');
        cleaned = cleaned.replace(/^\$|\$/g, '').trim();
        return window.katex.renderToString(cleaned, { displayMode: false, throwOnError: false });
      } catch (e) {
        console.warn('KaTeX render error in table cell (inline):', e);
        return match;
      }
    }
    return match;
  });

  return temp;
}

function renderTableToHtml(tableLines, precedingTitle = "", hideWrapper = false, hideRemarks = false) {
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
  
  const is2Col = colCount === 2;
  const tableClass = is2Col ? "markdown-table markdown-table-2col" : "markdown-table";

  let html = '';

  if (hideWrapper) {
    // Render clean table container without Comparison Table card, buttons, or extra headers
    html += `<div class="markdown-table-container w-full my-2 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20">`;
    html += `<table class="${tableClass} w-full table-auto text-center border-collapse text-[14px] sm:text-[15px] min-w-full">`;
    html += `<thead>`;
    html += `<tr class="bg-slate-900/80 text-slate-355 border-b border-slate-800">`;
    headers.forEach((h, hIdx) => {
      const renderedH = renderCellMath(h);
      if (hIdx === 0) {
        html += `<th class="p-1 sm:p-1.5 font-black border-r border-slate-800 last:border-r-0" style="position: relative; select-none;">`;
        html += `${renderedH}`;
        html += `<div class="markdown-table-resize-handle" onmousedown="if(window.__startMarkdownTableResize) { window.__startMarkdownTableResize(event, this, false) }" ontouchstart="if(window.__startMarkdownTableResize) { window.__startMarkdownTableResize(event, this, true) }"></div>`;
        html += `</th>`;
      } else {
        html += `<th class="p-1 sm:p-1.5 font-black border-r border-slate-800 last:border-r-0">${renderedH}</th>`;
      }
    });
    if (!hideRemarks) {
      html += `<th class="p-1 sm:p-1.5 font-black border-r border-slate-800 text-rose-400 select-none whitespace-nowrap w-16" style="border-right:0;">비고</th>`;
    }
    html += `</tr>`;
    html += `</thead>`;
    html += `<tbody>`;
    bodyRows.forEach((row, rIdx) => {
      if (row.length === 0 || (row.length === 1 && row[0] === '')) return;
      
      html += `<tr class="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/20 group">`;
      row.forEach(cell => {
        const renderedCell = renderCellMath(cell);
        html += `<td class="p-1 sm:p-1.5 border-r border-slate-800 text-slate-200 font-semibold">${renderedCell}</td>`;
      });
      if (row.length < colCount) {
        for (let k = row.length; k < colCount; k++) {
          html += `<td class="p-1 sm:p-1.5 border-r border-slate-800 text-slate-200 font-semibold"></td>`;
        }
      }
      if (!hideRemarks) {
        const firstCellSafe = (row[0] || '').replace(/"/g, '&quot;').replace(/\$/g, '&#36;');
        const cleanTitleSafe = precedingTitle.replace(/"/g, '&quot;').replace(/\$/g, '&#36;');
        const entireTableEscaped = tableLines.join('\n').replace(/"/g, '&quot;').replace(/\$/g, '&#36;').replace(/\n/g, '&#10;');
        html += `<td class="p-1 sm:p-1.5 text-center align-middle whitespace-nowrap bg-slate-950/10" style="border-right:0;">`;
        html += `<button data-row-title="${firstCellSafe}" data-preceding-title="${cleanTitleSafe}" data-entire-table="${entireTableEscaped}" onclick="if(window.__handleGlobalRowDelete) { window.__handleGlobalRowDelete(this) } else { alert('공식 개요 삭제 핸들러가 준비되지 않았습니다.'); }" class="p-1 rounded bg-slate-850 hover:bg-rose-950 text-slate-400 hover:text-rose-400 cursor-pointer transition-all border border-slate-800 hover:border-rose-500/20 md:opacity-0 md:group-hover:opacity-100 opacity-100 flex items-center justify-center mx-auto shrink-0 animate-fade-in" title="행 삭제" style="outline:none; display:inline-flex;">`;
        html += `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
        html += `</button>`;
        html += `</td>`;
      }
      html += `</tr>`;
    });
    html += `</tbody>`;
    html += `</table>`;
    html += `</div>`;
    
    return html;
  }

  const cleanTitle = precedingTitle ? precedingTitle.replace(/["']/g, '&quot;') : '비교표';
  const safeTitleForDataAttr = cleanTitle.replace(/\$/g, '&#36;');

  html += `<div class="w-full my-4 space-y-2 table-export-wrapper relative">`;
  html += `<div class="flex items-center justify-between gap-4 border-b border-slate-800/60 pb-2">`;
  html += `<span class="text-xs sm:text-sm font-extrabold text-slate-350 select-none flex items-start gap-1.5">`;
  html += `<span>📊</span>`;
  html += `<span class="flex-1">${cleanTitle}</span>`;
  html += `</span>`;
  html += `<button data-title="${safeTitleForDataAttr}" onclick="if(window.__handleTableConfirmRequest) { window.__handleTableConfirmRequest(this.closest('.table-export-wrapper').querySelector('table').outerHTML, this.getAttribute('data-title')) }" class="p-1.5 bg-slate-900 hover:bg-rose-600 border border-slate-700/50 rounded-lg text-slate-200 hover:text-white transition-all cursor-pointer flex items-center justify-center shadow-md select-none hover:scale-105 active:scale-95" title="필수암기 표로 내보내기" style="outline: none;">`;

  html += `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>`;
  html += `</button>`;
  html += `</div>`;

  html += `<div class="markdown-table-container w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">`;
  html += `<table class="${tableClass} w-full table-auto text-center border-collapse text-[14px] sm:text-[15px] min-w-full">`;
  html += `<thead>`;
  html += `<tr class="bg-slate-900/80 text-slate-350 border-b border-slate-800">`;
  headers.forEach((h, hIdx) => {
    const renderedH = renderCellMath(h);
    if (hIdx === 0) {
      html += `<th class="p-1 sm:p-1.5 font-extrabold border-r border-slate-800 last:border-r-0" style="position: relative; select-none;">`;
      html += `${renderedH}`;
      html += `<div class="markdown-table-resize-handle" onmousedown="if(window.__startMarkdownTableResize) { window.__startMarkdownTableResize(event, this, false) }" ontouchstart="if(window.__startMarkdownTableResize) { window.__startMarkdownTableResize(event, this, true) }"></div>`;
      html += `</th>`;
    } else {
      html += `<th class="p-1 sm:p-1.5 font-extrabold border-r border-slate-800 last:border-r-0">${renderedH}</th>`;
    }
  });
  if (!hideRemarks) {
    html += `<th class="p-1 sm:p-1.5 font-extrabold border-r border-slate-800 text-rose-400 select-none whitespace-nowrap w-16" style="border-right:0;">비고</th>`;
  }
  html += `</tr>`;
  html += `</thead>`;
  html += `<tbody>`;
  bodyRows.forEach(row => {
    if (row.length === 0 || (row.length === 1 && row[0] === '')) return;
    
    html += `<tr class="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/20 group">`;
    row.forEach(cell => {
      const renderedCell = renderCellMath(cell);
      html += `<td class="p-1 sm:p-1.5 border-r border-slate-800 text-slate-355">${renderedCell}</td>`;
    });
    if (row.length < colCount) {
      for (let k = row.length; k < colCount; k++) {
        html += `<td class="p-1 sm:p-1.5 border-r border-slate-800 text-slate-355"></td>`;
      }
    }
    if (!hideRemarks) {
      const firstCellSafe = (row[0] || '').replace(/"/g, '&quot;').replace(/\$/g, '&#36;');
      const cleanTitleSafe = cleanTitle.replace(/"/g, '&quot;').replace(/\$/g, '&#36;');
      const entireTableEscaped = tableLines.join('\n').replace(/"/g, '&quot;').replace(/\$/g, '&#36;').replace(/\n/g, '&#10;');
      html += `<td class="p-1 sm:p-1.5 text-center align-middle whitespace-nowrap bg-slate-950/10" style="border-right:0;">`;
      html += `<button data-row-title="${firstCellSafe}" data-preceding-title="${cleanTitleSafe}" data-entire-table="${entireTableEscaped}" onclick="if(window.__handleGlobalRowDelete) { window.__handleGlobalRowDelete(this) } else { alert('공식 개요 삭제 핸들러가 준비되지 않았습니다.'); }" class="p-1 rounded bg-slate-850 hover:bg-rose-950 text-slate-400 hover:text-rose-400 cursor-pointer transition-all border border-slate-800 hover:border-rose-500/20 md:opacity-0 md:group-hover:opacity-100 opacity-100 flex items-center justify-center mx-auto shrink-0 animate-fade-in" title="행 삭제" style="outline:none; display:inline-flex;">`;
      html += `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
      html += `</button>`;
      html += `</td>`;
    }
    html += `</tr>`;
  });
  html += `</tbody>`;
  html += `</table>`;
  html += `</div>`; // closes overflow-x-auto
  html += `</div>`; // closes table-export-wrapper
  
  return html;
}

function isHeaderLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('**') && trimmed.endsWith('**')) return true;
  if (trimmed.startsWith('*') && trimmed.endsWith('*')) return true;
  if (trimmed.length > 0 && trimmed.length < 40) {
    const hasSentenceEnding = /[.!?다]$/.test(trimmed) || trimmed.includes('. ') || trimmed.includes(', ');
    if (!hasSentenceEnding) {
      return true;
    }
  }
  return false;
}

/**
 * Parses markdown tables from a given string and converts them into HTML tables.
 * Extremely robust against spacing variations in the separator line (e.g. |:---| or | : - - - |).
 * 
 * @param {string} text 
 * @param {boolean} hideWrapper
 * @returns {string} Converted HTML string
 */
export function convertMarkdownTablesToHtml(text, hideWrapper = false, hideRemarks = false) {
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
                if (isHeaderLine(pLine)) {
                  let candidate = pLine.replace(/^(#+\s*|\*+\s*|-\s*)/, '').replace(/\*+$/, '').trim();
                  
                  // If it contains a colon, check if the prefix is a good title candidate
                  if (candidate.includes(':') || candidate.includes('：')) {
                    const colonIdx = candidate.indexOf(':') !== -1 ? candidate.indexOf(':') : candidate.indexOf('：');
                    const prefix = candidate.substring(0, colonIdx).replace(/\*+/g, '').trim();
                    if (prefix.length > 1 && prefix.length <= 100) {
                      candidate = prefix;
                    }
                  }
                  
                  // Limit title length to 100 characters maximum to avoid long description lines
                  if (candidate.length > 100) {
                    candidate = candidate.substring(0, 100) + '...';
                  }
                  
                  precedingTitle = candidate;
                  
                  // Nullify the consumed title line in processedLines so it is not rendered twice
                  processedLines[searchIdx] = null;
                  
                  // Nullify any blank lines between the consumed title and the table to prevent gap/spacing issues
                  for (let k = searchIdx + 1; k < i; k++) {
                    if (processedLines[k] !== undefined && processedLines[k] !== null && processedLines[k].trim() === "") {
                      processedLines[k] = null;
                    }
                  }
                }
                break;
              }
              searchIdx--;
            }
          }
          const htmlTable = renderTableToHtml(tableLines, precedingTitle, hideWrapper, hideRemarks);
          processedLines.push(htmlTable);
          i = j; // Advance past the table block
          continue;
        }
      }
    }
    
    processedLines.push(line);
    i++;
  }
  
  return processedLines.filter(line => line !== null).join('\n');
}
