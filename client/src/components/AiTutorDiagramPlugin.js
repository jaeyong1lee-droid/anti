// ============================================================================
// 🎨 Isolated AI Tutor Self-Contained Diagram & KaTeX Rendering Plugin
// (100% Standalone & Encapsulated - Zero side-effects on Review Engine)
// ============================================================================

/**
 * Clean & protect string from KaTeX parsing errors (e.g. Expected 'EOF', got '#')
 */
export function sanitizeAiTutorKatexText(rawText) {
  if (!rawText || typeof rawText !== 'string') return rawText || '';

  let text = rawText;

  // 1. Unescape Wgt / Wlt and escaped quotes from LLM text stream
  text = text
    .replace(/Wgt/g, '>')
    .replace(/Wlt/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/''#/g, '"#')
    .replace(/''/g, '"');

  // 2. Shield Hex Color Codes (#e7f5ff, #868e96, #343a40, #f8f9fa, etc.) from KaTeX
  text = text.replace(/(fill|stroke|color|background-color):\s*#([a-fA-F0-9]{3,8})/gi, '$1: __HEXCOLOR_$2__');
  text = text.replace(/(fill|stroke|color|background-color)=['"]*#([a-fA-F0-9]{3,8})['"]*/gi, '$1="__HEXCOLOR_$2__"');

  return text;
}

/**
 * Master isolated AI Tutor diagram & flowchart processor
 */
export function processAiTutorDiagrams(text) {
  if (!text || typeof text !== 'string') return text || '';
  
  let processed = sanitizeAiTutorKatexText(text);

  // --------------------------------------------------------------------------
  // 1. Process SVG Diagrams (Handles <svg, < svg, xmlns="http://www.w3.org/2000/svg", $ SVG)
  // --------------------------------------------------------------------------
  const svgRegex = /(?:```[a-zA-Z0-9_-]*\s*)?(?:\$xml|\$|\$ SVG|SVG)?\s*(?:<[ \t]*svg|xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["'])[\s\S]*?(?:<\/[ \t]*svg>|<\/svg>|(?=```\s*$|$))/gi;
  
  processed = processed.replace(svgRegex, (match) => {
    let cleanSvg = match
      .replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```\s*$/, '')
      .replace(/^\$xml\s*/i, '').replace(/^\$ SVG\s*/i, '').replace(/^\$/, '')
      .replace(/<\s+svg/gi, '<svg')
      .replace(/__HEXCOLOR_([a-fA-F0-9]{3,8})__/g, '#$1');

    // Ensure valid <svg prefix if starting with xmlns
    if (!cleanSvg.trim().startsWith('<svg') && cleanSvg.includes('xmlns=')) {
      const xmlnsIdx = cleanSvg.indexOf('xmlns=');
      cleanSvg = `<svg ${cleanSvg.substring(xmlnsIdx)}`;
    }
    if (!cleanSvg.includes('</svg>')) {
      cleanSvg += '</svg>';
    }

    const svgMatch = cleanSvg.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      return `\n<div class="my-4 w-full flex flex-col items-center justify-center p-4 rounded-2xl bg-white text-slate-900 border border-indigo-500/30 shadow-xl overflow-x-auto select-text">${svgMatch[0]}</div>\n`;
    }
    return '';
  });

  // --------------------------------------------------------------------------
  // 2. Process TikZ Flowchart Code Blocks (\begin{tikzpicture} or \documentclass[tikz])
  // --------------------------------------------------------------------------
  const tikzRegex = /(?:```[a-zA-Z0-9_-]*\s*)?[\s\S]*?\\(?:documentclass\[tikz|begin\{tikzpicture\}|usepackage\{tikz\})[\s\S]*?(?:\\end\{tikzpicture\}|```\s*$|$)/gi;

  processed = processed.replace(tikzRegex, (match) => {
    let cleanTikz = match.replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```\s*$/, '');
    
    // Extract \node text blocks (multiline supported)
    const nodeMatches = [...cleanTikz.matchAll(/\\node\s*(?:\[[\s\S]*?\])?\s*(?:\([\s\S]*?\))?\s*\{([\s\S]*?)\};|([A-Za-z0-9_-]+)\s*\["([\s\S]*?)"\]/gi)];
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

    return '';
  });

  // --------------------------------------------------------------------------
  // 3. Process Mermaid / Graph Flowchart Code Blocks (graph TD, flowchart TD, multiline nodes)
  // --------------------------------------------------------------------------
  const mermaidRegex = /(?:```[a-zA-Z0-9_-]*\s*)?(?:graph\s+TD|graph\s+LR|flowchart\s+TD|flowchart\s+LR)[\s\S]*?(?:```\s*$|$)/gi;

  processed = processed.replace(mermaidRegex, (match) => {
    let cleanMermaid = match.replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```\s*$/, '');
    
    // Extract multiline node definitions like Core["Text \n * detail..."] or A[Text]
    const nodeMatches = [...cleanMermaid.matchAll(/(?:([A-Za-z0-9_-]+)\s*\[(?:["']?)([\s\S]*?)(?:["']?)\](?:\s*:\s*:::[a-zA-Z0-9_-]+)?)/gi)];
    const stepItems = [];
    const seen = new Set();

    nodeMatches.forEach(m => {
      let rawText = m[2].replace(/:::[a-zA-Z0-9_-]+/g, '').trim();
      if (rawText && !rawText.startsWith('%') && !seen.has(rawText)) {
        seen.add(rawText);
        stepItems.push(rawText);
      }
    });

    if (stepItems.length > 0) {
      let cardsHtml = '\n<div class="w-full my-4 flex flex-col items-center gap-2 select-text font-sans">';
      stepItems.forEach((step, sIdx) => {
        const formattedStep = step
          .replace(/\n/g, '<br/>')
          .replace(/__HEXCOLOR_([a-fA-F0-9]{3,8})__/g, '#$1');
        cardsHtml += `<div class="w-full bg-slate-900/90 border border-emerald-500/30 p-3.5 rounded-xl text-left shadow-md flex flex-col gap-1">`;
        cardsHtml += `<div class="font-bold text-emerald-300 text-xs flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center font-black shrink-0">${sIdx + 1}</span><div class="leading-relaxed">${formattedStep}</div></div>`;
        cardsHtml += `</div>`;
        if (sIdx < stepItems.length - 1) {
          cardsHtml += `<div class="text-emerald-400 font-extrabold text-xs">▼</div>`;
        }
      });
      cardsHtml += '</div>\n';
      return cardsHtml;
    }

    return '';
  });

  // Restore protected Hex Colors in remaining text
  processed = processed.replace(/__HEXCOLOR_([a-fA-F0-9]{3,8})__/g, '#$1');

  return processed;
}
