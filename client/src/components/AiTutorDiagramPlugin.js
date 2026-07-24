// ============================================================================
// 🎨 Isolated AI Tutor Self-Contained Realtime Vector Diagram & Flowchart Plugin
// (100% Standalone & Encapsulated - Matching Dark Realtime Vector & Mohr Circle Standard)
// ============================================================================

function escapeXmlText(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Renders Dark Mode Realtime Vector Flowchart Card
 */
function renderRealtimeVectorSvgCard(stepItems, title = 'Realtime Vector Flowchart Render') {
  if (!stepItems || stepItems.length === 0) return '';

  const boxWidth = 460;
  const boxHeight = 65;
  const gapY = 55;
  const startX = 170;
  const startY = 40;
  const svgHeight = startY + stepItems.length * (boxHeight + gapY) + 30;

  let svgElements = '';

  stepItems.forEach((stepText, idx) => {
    const y = startY + idx * (boxHeight + gapY);
    const isFirst = idx === 0;
    const isLast = idx === stepItems.length - 1;
    const isDiamond = stepText.includes('?') || stepText.toLowerCase().startsWith('is ') || stepText.includes('검증') || stepText.includes('선택');

    const cleanLines = stepText.split('\n').map(line => line.trim()).filter(Boolean);
    const mainTitle = cleanLines[0] || '';
    const subtitle = cleanLines.slice(1).join(' ') || '';

    if (isDiamond) {
      const cx = startX + boxWidth / 2;
      const cy = y + boxHeight / 2;
      const rx = boxWidth / 2 - 30;
      const ry = boxHeight / 2 + 10;
      const points = `${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy}`;
      svgElements += `<polygon points="${points}" fill="#451a03" stroke="#f97316" stroke-width="2.5" filter="url(#dark-shadow)" />`;
      svgElements += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="12" font-weight="900" fill="#ffedd5">${escapeXmlText(mainTitle)}</text>`;
    } else if (isFirst) {
      svgElements += `<rect x="${startX}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#1e1b4b" stroke="#6366f1" stroke-width="2.5" filter="url(#dark-shadow)" />`;
      svgElements += `<text x="${startX + boxWidth / 2}" y="${y + (subtitle ? 26 : boxHeight / 2 + 4)}" text-anchor="middle" font-size="12" font-weight="900" fill="#e0e7ff">${escapeXmlText(mainTitle)}</text>`;
      if (subtitle) {
        svgElements += `<text x="${startX + boxWidth / 2}" y="${y + 46}" text-anchor="middle" font-size="10" font-weight="700" fill="#a5b4fc">${escapeXmlText(subtitle)}</text>`;
      }
    } else if (isLast) {
      svgElements += `<rect x="${startX}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#064e3b" stroke="#10b981" stroke-width="2.5" filter="url(#dark-shadow)" />`;
      svgElements += `<text x="${startX + boxWidth / 2}" y="${y + (subtitle ? 26 : boxHeight / 2 + 4)}" text-anchor="middle" font-size="12" font-weight="900" fill="#d1fae5">${escapeXmlText(mainTitle)}</text>`;
      if (subtitle) {
        svgElements += `<text x="${startX + boxWidth / 2}" y="${y + 46}" text-anchor="middle" font-size="10" font-weight="700" fill="#6ee7b7">${escapeXmlText(subtitle)}</text>`;
      }
    } else {
      svgElements += `<rect x="${startX}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#0f172a" stroke="#3b82f6" stroke-width="2.5" filter="url(#dark-shadow)" />`;
      svgElements += `<text x="${startX + boxWidth / 2}" y="${y + (subtitle ? 26 : boxHeight / 2 + 4)}" text-anchor="middle" font-size="12" font-weight="900" fill="#dbeafe">${escapeXmlText(mainTitle)}</text>`;
      if (subtitle) {
        svgElements += `<text x="${startX + boxWidth / 2}" y="${y + 46}" text-anchor="middle" font-size="10" font-weight="700" fill="#93c5fd">${escapeXmlText(subtitle)}</text>`;
      }
    }

    if (idx < stepItems.length - 1) {
      const arrowStartY = y + boxHeight;
      const arrowEndY = y + boxHeight + gapY - 6;
      const cx = startX + boxWidth / 2;
      svgElements += `<path d="M ${cx} ${arrowStartY} L ${cx} ${arrowEndY}" stroke="#94a3b8" stroke-width="2" marker-end="url(#dark-arrowhead)" />`;
    }
  });

  return `
\n<div class="my-6 w-full max-w-4xl mx-auto bg-[#0b0f19] rounded-2xl p-6 border border-slate-800 shadow-2xl overflow-x-auto select-text font-sans">
  <div class="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-4">
    <div class="flex items-center gap-2">
      <span class="text-base">⚡</span>
      <h4 class="text-xs font-black text-slate-200 tracking-tight uppercase">${escapeXmlText(title)}</h4>
    </div>
    <span class="text-[10px] font-extrabold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full uppercase tracking-wider">⚡ Realtime Vector</span>
  </div>
  <svg width="100%" viewBox="0 0 800 ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="dark-arrowhead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
      </marker>
      <filter id="dark-shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.4" />
      </filter>
    </defs>
    ${svgElements}
  </svg>
</div>\n
`;
}

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
  // 1. Process SVG Diagrams (Apparatus & Mohr Circle, Dynamic Inline SVG)
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
      const isMohrApparatus = cleanSvg.includes('Mohr') || cleanSvg.includes('Apparatus') || cleanSvg.includes('모어') || cleanSvg.includes('삼축');
      const cardTitle = isMohrApparatus ? 'DYNAMIC INLINE SVG APPARATUS & MOHR CIRCLE' : 'Realtime Vector Graphic Render';
      const badgeText = isMohrApparatus ? 'Geotechnical Simulation' : '⚡ Realtime Vector';

      return `\n<div class="my-6 w-full max-w-5xl mx-auto bg-[#0b0f19] rounded-2xl p-6 border border-slate-800 shadow-2xl overflow-x-auto select-text font-sans">
  <div class="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-4">
    <div class="flex items-center gap-2">
      <span class="text-base">${isMohrApparatus ? '🧪' : '⚡'}</span>
      <h4 class="text-xs font-black text-slate-200 tracking-tight uppercase">${escapeXmlText(cardTitle)}</h4>
    </div>
    <span class="text-[10px] font-extrabold bg-indigo-950/80 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full uppercase tracking-wider">${escapeXmlText(badgeText)}</span>
  </div>
  ${svgMatch[0]}
</div>\n`;
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
      return renderRealtimeVectorSvgCard(stepItems, 'LaTeX TikZ Realtime Vector Flowchart');
    }

    return '';
  });

  // Clean leftover LaTeX standalone commands
  processed = processed.replace(/\\end\{document\}/gi, '').replace(/\\begin\{document\}/gi, '');

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
      return renderRealtimeVectorSvgCard(stepItems, 'Mermaid Realtime Vector Flowchart');
    }

    return '';
  });

  // Restore protected Hex Colors in remaining text
  processed = processed.replace(/__HEXCOLOR_([a-fA-F0-9]{3,8})__/g, '#$1');

  return processed;
}
