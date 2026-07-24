// ============================================================================
// 🎨 Isolated AI Tutor Diagram & Flowchart Rendering Plugin
// (Strictly Isolated for AI Tutor - Zero side effects on Review Engine)
// ============================================================================

export function processAiTutorDiagrams(text) {
  if (!text || typeof text !== 'string') return text || '';
  
  let processed = text;

  // 0. Protect Hex Colors (#e7f5ff, #868e96, etc.) and Markdown Headings (###) from KaTeX parse errors
  // Fixes: "KaTeX parse error: Expected 'EOF', got '#' at position..."
  processed = processed.replace(/(fill|stroke|color):\s*#([a-fA-F0-9]{3,8})/gi, '$1: __HEXCOLOR_$2__');
  processed = processed.replace(/(fill|stroke|color)=['"]*#([a-fA-F0-9]{3,8})['"]*/gi, '$1="__HEXCOLOR_$2__"');

  // 1. Process SVG Diagrams (including < svg with space, xml &lt;svg, and escaped quotes)
  processed = processed.replace(/(?:```[a-zA-Z0-9_-]*\s*)?(?:\$xml\s*|\$)?(?:&lt;\s*svg|<[ \t]*svg)[\s\S]*?(?:&lt;\/\s*svg&gt;|<\/[ \t]*svg>)\$?(?:\s*```)?/gi, (match) => {
    let cleanSvg = match
      .replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```\s*$/, '')
      .replace(/^\$xml\s*/i, '').replace(/^\$/, '').replace(/\$$/, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/''#/g, '"#').replace(/''/g, '"')
      .replace(/<\s+svg/gi, '<svg')
      .replace(/__HEXCOLOR_([a-fA-F0-9]{3,8})__/g, '#$1');

    const svgMatch = cleanSvg.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      return `\n<div class="my-4 w-full flex flex-col items-center justify-center p-4 rounded-2xl bg-white text-slate-900 border border-indigo-500/30 shadow-xl overflow-x-auto select-text">${svgMatch[0]}</div>\n`;
    }
    return match;
  });

  // 2. Process TikZ Flowchart Code Blocks (\begin{tikzpicture} or \documentclass[tikz])
  processed = processed.replace(/(?:```[a-zA-Z0-9_-]*\s*)?\\(?:documentclass\[tikz|begin\{tikzpicture\}|usepackage\{tikz\})[\s\S]*?(?:\\end\{tikzpicture\}|```)/gi, (match) => {
    let cleanTikz = match.replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```\s*$/, '');
    
    // Extract \node text or Core["Text"] nodes
    const nodeMatches = [...cleanTikz.matchAll(/\\node\s*(?:\[[^\]]*\])?\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\};|([A-Za-z0-9_-]+)\s*\["([^"]+)"\]/gi)];
    const stepItems = [];
    const seen = new Set();

    nodeMatches.forEach(m => {
      let rawText = (m[1] || m[3] || '').trim();
      let cleanedNode = rawText
        .replace(/%.*$/gm, '')
        .replace(/\\small|\\large|\\textbf|\\textit|\\font=[^\n]*/gi, '')
        .replace(/\\\\/g, ' ')
        .replace(/[{}]/g, '')
        .trim();

      if (cleanedNode && !cleanedNode.toLowerCase().includes('standalone') && !cleanedNode.toLowerCase().includes('document') && !seen.has(cleanedNode)) {
        seen.add(cleanedNode);
        stepItems.push(cleanedNode);
      }
    });

    if (stepItems.length > 0) {
      let cardsHtml = '\n<div class="w-full my-4 flex flex-col items-center gap-2 select-text font-sans">';
      stepItems.forEach((step, sIdx) => {
        cardsHtml += `<div class="w-full bg-slate-900/90 border border-indigo-500/30 p-3.5 rounded-xl text-left shadow-md flex flex-col gap-1">`;
        cardsHtml += `<div class="font-bold text-indigo-300 text-xs flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] flex items-center justify-center font-black shrink-0">${sIdx + 1}</span>${step}</div>`;
        cardsHtml += `</div>`;
        if (sIdx < stepItems.length - 1) {
          cardsHtml += `<div class="text-indigo-400 font-extrabold text-xs">▼</div>`;
        }
      });
      cardsHtml += '</div>\n';
      return cardsHtml;
    }

    return match;
  });

  // 3. Process Mermaid / Graph Flowchart Code Blocks (graph TD, flowchart TD, etc.)
  processed = processed.replace(/(?:```[a-zA-Z0-9_-]*\s*)?(?:graph\s+TD|graph\s+LR|flowchart\s+TD)[\s\S]*?(?:```|$)/gi, (match) => {
    let cleanMermaid = match.replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```\s*$/, '');
    
    // Extract nodes like Core["Text"], Lab["Text"], A[Text]
    const nodeMatches = [...cleanMermaid.matchAll(/(?:([A-Za-z0-9_-]+)\s*\[(?:["']?)(.*?)(?:["']?)\])/gi)];
    const stepItems = [];
    const seen = new Set();

    nodeMatches.forEach(m => {
      const text = m[2].replace(/:::[a-zA-Z0-9_-]+/g, '').trim();
      if (text && !text.startsWith('%') && !seen.has(text)) {
        seen.add(text);
        stepItems.push(text);
      }
    });

    if (stepItems.length > 0) {
      let cardsHtml = '\n<div class="w-full my-4 flex flex-col items-center gap-2 select-text font-sans">';
      stepItems.forEach((step, sIdx) => {
        cardsHtml += `<div class="w-full bg-slate-900/90 border border-emerald-500/30 p-3.5 rounded-xl text-left shadow-md flex flex-col gap-1">`;
        cardsHtml += `<div class="font-bold text-emerald-300 text-xs flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center font-black shrink-0">${sIdx + 1}</span>${step}</div>`;
        cardsHtml += `</div>`;
        if (sIdx < stepItems.length - 1) {
          cardsHtml += `<div class="text-emerald-400 font-extrabold text-xs">▼</div>`;
        }
      });
      cardsHtml += '</div>\n';
      return cardsHtml;
    }

    return match;
  });

  // Restore protected Hex Colors
  processed = processed.replace(/__HEXCOLOR_([a-fA-F0-9]{3,8})__/g, '#$1');

  return processed;
}
