/**
 * Parses custom acronym code blocks from markdown and converts them into interactive HTML wrappers
 * with an export button for saving to the Memorization Modal's acronym tab.
 */

function renderContentAsHtmlTable(content) {
  if (!content) return "";
  if (content.includes('|')) {
    const lines = content.split('\n');
    let html = '<div class="overflow-x-auto w-full mt-2"><table class="w-full text-left border-collapse text-[14px] select-text">';
    html += '<thead>';
    html += '<tr class="border-b border-slate-800 bg-slateCustom-950/40">';
    html += '<th class="p-2.5 font-black text-slate-300 text-center w-16">두</th>';
    html += '<th class="p-2.5 font-black text-slate-300 text-center w-28">암기단어</th>';
    html += '<th class="p-2.5 font-black text-slate-300">설명</th>';
    html += '</tr>';
    html += '</thead>';
    html += '<tbody>';
    
    let hasRows = false;
    for (const line of lines) {
      if (!line.includes('|')) continue;
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 5) continue;
      const col1 = parts[1];
      const col2 = parts[2];
      const col3 = parts[3];
      if (col1 === '두문자' || col1 === '두' || col1.includes('---')) continue;
      hasRows = true;
      html += `<tr class="border-b border-slate-900/60 hover:bg-slate-900/10">`;
      html += `<td class="p-2.5 font-extrabold text-emerald-400 text-center">${col1}</td>`;
      html += `<td class="p-2.5 font-bold text-slate-100 text-center">${col2}</td>`;
      html += `<td class="p-2.5 text-slate-350 leading-relaxed">${col3}</td>`;
      html += `</tr>`;
    }
    html += '</tbody></table></div>';
    if (hasRows) return html;
  }

  return `<div class="whitespace-pre-wrap leading-relaxed">${content}</div>`;
}

export function convertMarkdownAcronymsToHtml(text) {
  if (!text) return text;

  // Search for ```acronym ... ``` code blocks
  const acronymRegex = /```acronym\s*([\s\S]*?)\s*```/g;

  return text.replace(acronymRegex, (match, blockContent) => {
    let title = "새 앞글자 암기법";
    let content = "";

    const lines = blockContent.split('\n');
    let inContent = false;
    const contentLines = [];

    for (let line of lines) {
      if (line.trim().startsWith('제목:')) {
        title = line.replace('제목:', '').trim();
      } else if (line.trim().startsWith('내용:')) {
        inContent = true;
        const remaining = line.replace('내용:', '').trim();
        if (remaining) {
          contentLines.push(remaining);
        }
      } else if (line.trim().startsWith('두문자:')) {
        // If content contains "두문자:" inside acronym block, also treat as content lines
        contentLines.push(line);
      } else {
        contentLines.push(line);
      }
    }

    content = contentLines.join('\n').trim();
    if (!content && !blockContent.includes('제목:')) {
      content = blockContent.trim();
    }

    const cleanTitle = title.replace(/["']/g, '&quot;');
    const cleanContent = content.replace(/["']/g, '&quot;').replace(/\n/g, '\\n');
    const safeTitleForDataAttr = cleanTitle.replace(/\$/g, '&#36;');
    const safeContentForDataAttr = cleanContent.replace(/\$/g, '&#36;');

    let html = '';
    html += `<div class="w-full my-4 space-y-2 acronym-export-wrapper relative">`;
    html += `<div class="flex items-center justify-between gap-4 border-b border-slate-800/60 pb-2">`;
    html += `<span class="text-xs sm:text-sm font-extrabold text-slate-350 select-none flex items-start gap-1.5">`;
    html += `<span>💡</span>`;
    html += `<span class="flex-1">${cleanTitle}</span>`;
    html += `</span>`;
    html += `<button 
      data-title="${safeTitleForDataAttr}"
      data-content="${safeContentForDataAttr}"
      onclick="if(window.__handleAcronymConfirmRequest) { window.__handleAcronymConfirmRequest(this.getAttribute('data-title'), this.getAttribute('data-content')) }"
      class="p-1.5 bg-slate-900 hover:bg-emerald-600 border border-slate-700/50 rounded-lg text-slate-200 hover:text-white transition-all cursor-pointer flex items-center justify-center shadow-md select-none hover:scale-105 active:scale-95"
      title="필수암기 앞글자로 내보내기"
      style="outline: none;"
    >`;
    html += `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>`;
    html += `</button>`;
    html += `</div>`;

    html += `<div class="w-full p-4 rounded-xl border border-slate-800 bg-slate-950/40 text-slate-300 text-sm select-text">`;
    html += renderContentAsHtmlTable(content);
    html += `</div>`;
    html += `</div>`;

    return html;
  });
}
