// ============================================================================
// 📐 Isolated AI Tutor TikZ Flowchart Plugin
// (100% Standalone & Encapsulated - Zero side-effects on existing KaTeX)
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

function renderTikzVectorSvgCard(stepItems, title = 'LaTeX TikZ Realtime Vector Flowchart') {
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
      svgElements += `<polygon points="${points}" fill="#451a03" stroke="#f97316" stroke-width="2.5" filter="url(#tikz-shadow)" />`;
      svgElements += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="12" font-weight="900" fill="#ffedd5">${escapeXmlText(mainTitle)}</text>`;
    } else if (isFirst) {
      svgElements += `<rect x="${startX}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#1e1b4b" stroke="#6366f1" stroke-width="2.5" filter="url(#tikz-shadow)" />`;
      svgElements += `<text x="${startX + boxWidth / 2}" y="${y + (subtitle ? 26 : boxHeight / 2 + 4)}" text-anchor="middle" font-size="12" font-weight="900" fill="#e0e7ff">${escapeXmlText(mainTitle)}</text>`;
      if (subtitle) {
        svgElements += `<text x="${startX + boxWidth / 2}" y="${y + 46}" text-anchor="middle" font-size="10" font-weight="700" fill="#a5b4fc">${escapeXmlText(subtitle)}</text>`;
      }
    } else if (isLast) {
      svgElements += `<rect x="${startX}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#064e3b" stroke="#10b981" stroke-width="2.5" filter="url(#tikz-shadow)" />`;
      svgElements += `<text x="${startX + boxWidth / 2}" y="${y + (subtitle ? 26 : boxHeight / 2 + 4)}" text-anchor="middle" font-size="12" font-weight="900" fill="#d1fae5">${escapeXmlText(mainTitle)}</text>`;
      if (subtitle) {
        svgElements += `<text x="${startX + boxWidth / 2}" y="${y + 46}" text-anchor="middle" font-size="10" font-weight="700" fill="#6ee7b7">${escapeXmlText(subtitle)}</text>`;
      }
    } else {
      svgElements += `<rect x="${startX}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#0f172a" stroke="#3b82f6" stroke-width="2.5" filter="url(#tikz-shadow)" />`;
      svgElements += `<text x="${startX + boxWidth / 2}" y="${y + (subtitle ? 26 : boxHeight / 2 + 4)}" text-anchor="middle" font-size="12" font-weight="900" fill="#dbeafe">${escapeXmlText(mainTitle)}</text>`;
      if (subtitle) {
        svgElements += `<text x="${startX + boxWidth / 2}" y="${y + 46}" text-anchor="middle" font-size="10" font-weight="700" fill="#93c5fd">${escapeXmlText(subtitle)}</text>`;
      }
    }

    if (idx < stepItems.length - 1) {
      const arrowStartY = y + boxHeight;
      const arrowEndY = y + boxHeight + gapY - 6;
      const cx = startX + boxWidth / 2;
      svgElements += `<path d="M ${cx} ${arrowStartY} L ${cx} ${arrowEndY}" stroke="#94a3b8" stroke-width="2" marker-end="url(#tikz-arrowhead)" />`;
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
  <div class="w-full svg-scroll-container select-text">
    <svg width="100%" viewBox="0 0 800 ${svgHeight}" xmlns="http://www.w3.org/2000/svg" style="min-width: 750px; width: 100%; height: auto; display: block;">
    <defs>
      <marker id="tikz-arrowhead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
      </marker>
      <filter id="tikz-shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.4" />
      </filter>
    </defs>
    ${svgElements}
  </svg>
  </div>
</div>\n
`;
}

export function renderAiTutorTikz(text) {
  if (!text || typeof text !== 'string') return text || '';

  let processed = text;
  const tikzRegex = /(?:```[a-zA-Z0-9_-]*\s*)?[\s\S]*?\\(?:documentclass\[tikz|begin\{tikzpicture\}|usepackage\{tikz\})[\s\S]*?(?:\\end\{tikzpicture\}|```\s*$|$)/gi;

  processed = processed.replace(tikzRegex, (match) => {
    let cleanTikz = match.replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```\s*$/, '');
    
    // If the block is an ASCII Art diagram (contains ASCII/Unicode drawing characters without actual \\begin{tikzpicture} or \\node commands), preserve as ASCII Art
    const isAsciiArt = /[━┃┌┐└┘├┤╋┿┼┴░▒▓█╲]|\/ *\\|\\ *\/|<-|->|\[지표면\]|\[굴착저면\]/i.test(cleanTikz) && !cleanTikz.includes('\\begin{tikzpicture}') && !cleanTikz.includes('\\node');
    if (isAsciiArt) {
      return match;
    }

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
      return renderTikzVectorSvgCard(stepItems, 'LaTeX TikZ Realtime Vector Flowchart');
    }

    return match;
  });

  return processed.replace(/\\end\{document\}/gi, '').replace(/\\begin\{document\}/gi, '');
}
