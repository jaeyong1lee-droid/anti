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

function wordWrapText(text, maxCharsPerLine = 48) {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(w => {
    if ((currentLine + ' ' + w).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + w).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = w;
    }
  });
  if (currentLine) lines.push(currentLine);

  return lines.length > 0 ? lines : [text];
}

function renderTikzVectorSvgCard(stepItems, title = 'LaTeX TikZ Realtime Vector Flowchart') {
  if (!stepItems || stepItems.length === 0) return '';

  const boxWidth = 520;
  const startX = 140;
  const gapY = 45;
  let currentY = 40;

  let svgElements = '';

  stepItems.forEach((stepText, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === stepItems.length - 1;
    const isDiamond = stepText.includes('?') || stepText.toLowerCase().startsWith('is ') || stepText.includes('검증') || stepText.includes('선택');

    // Clean LaTeX math symbols for SVG rendering
    let cleanText = stepText
      .replace(/\\cdot/g, '·')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\sqrt\{?([^}]+)\}?/g, '√($1)')
      .replace(/\\ge/g, '≥')
      .replace(/\\le/g, '≤')
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\tau/g, 'τ')
      .replace(/\\phi/g, 'ϕ')
      .replace(/\\delta/g, 'δ')
      .replace(/[{}]/g, '')
      .replace(/\\/g, '');

    const lines = wordWrapText(cleanText, 46);
    const boxHeight = Math.max(60, lines.length * 22 + 24);

    const y = currentY;

    if (isDiamond) {
      const cx = startX + boxWidth / 2;
      const cy = y + boxHeight / 2;
      const rx = boxWidth / 2 - 20;
      const ry = boxHeight / 2 + 10;
      const points = `${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy}`;
      svgElements += `<polygon points="${points}" fill="#451a03" stroke="#f97316" stroke-width="2.5" filter="url(#tikz-shadow)" />`;
      
      lines.forEach((l, lineIdx) => {
        const textY = cy - (lines.length - 1) * 10 + lineIdx * 20 + 4;
        svgElements += `<text x="${cx}" y="${textY}" text-anchor="middle" font-size="12" font-weight="900" fill="#ffedd5">${escapeXmlText(l)}</text>`;
      });
    } else {
      let fillColor = '#0f172a';
      let strokeColor = '#3b82f6';
      let textColor = '#dbeafe';

      if (isFirst) {
        fillColor = '#1e1b4b';
        strokeColor = '#6366f1';
        textColor = '#e0e7ff';
      } else if (isLast) {
        fillColor = '#064e3b';
        strokeColor = '#10b981';
        textColor = '#d1fae5';
      }

      svgElements += `<rect x="${startX}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="10" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2.5" filter="url(#tikz-shadow)" />`;
      
      lines.forEach((l, lineIdx) => {
        const textY = y + 26 + lineIdx * 20;
        const isHeader = lineIdx === 0 && (l.startsWith('[') || /^\d+[\.\)]/.test(l));
        svgElements += `<text x="${startX + boxWidth / 2}" y="${textY}" text-anchor="middle" font-size="${isHeader ? '13' : '11.5'}" font-weight="${isHeader ? '900' : '700'}" fill="${textColor}">${escapeXmlText(l)}</text>`;
      });
    }

    if (idx < stepItems.length - 1) {
      const arrowStartY = y + boxHeight;
      const arrowEndY = y + boxHeight + gapY - 6;
      const cx = startX + boxWidth / 2;
      svgElements += `<path d="M ${cx} ${arrowStartY} L ${cx} ${arrowEndY}" stroke="#94a3b8" stroke-width="2" marker-end="url(#tikz-arrowhead)" />`;
    }

    currentY += boxHeight + gapY;
  });

  const svgHeight = currentY + 20;

  return `
\n<div class="my-6 w-full max-w-4xl mx-auto bg-[#0b0f19] rounded-2xl p-6 border border-slate-800 shadow-2xl select-text font-sans">
  <div class="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-4">
    <div class="flex items-center gap-2">
      <span class="text-base">⚡</span>
      <h4 class="text-xs font-black text-slate-200 tracking-tight uppercase">${escapeXmlText(title)}</h4>
    </div>
    <span class="text-[10px] font-extrabold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full uppercase tracking-wider">⚡ Realtime Vector</span>
  </div>
  <div class="w-full select-text">
    <svg width="100%" viewBox="0 0 800 ${svgHeight}" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: auto; display: block;">
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

  // Clean out outer LaTeX document wrapper tags so they never leak into response text
  processed = processed
    .replace(/\\begin\{center\}/gi, '')
    .replace(/\\end\{center\}/gi, '')
    .replace(/\\begin\{document\}/gi, '')
    .replace(/\\end\{document\}/gi, '')
    .replace(/\\documentclass\[[^\]]*\]\{[^}]+\}/gi, '')
    .replace(/\\usepackage\{[^}]+\}/gi, '')
    .replace(/\\centering/gi, '');

  const tikzRegex = /(?:```[a-zA-Z0-9_-]*\s*)?[\s\S]*?\\(?:begin\{tikzpicture\}|node\s*(?:\[|\())[\s\S]*?(?:\\end\{tikzpicture\}|```\s*$|$)/gi;

  processed = processed.replace(tikzRegex, (match) => {
    let cleanTikz = match.replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```\s*$/, '');
    
    // If the block is an ASCII Art diagram, preserve as ASCII Art
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
        .replace(/\\\\/g, '\n')
        .trim();

      // Split numbered multi-steps if multiple steps were concatenated into a single node
      const subSteps = cleanedNode.split(/(?=\[\d+\]|\b\d+[\.\)]\s+)/g);
      subSteps.forEach(sub => {
        const itemText = sub.replace(/^[{}\s]+|[{}\s]+$/g, '').trim();
        if (itemText && !itemText.toLowerCase().includes('standalone') && !itemText.toLowerCase().includes('document') && !seen.has(itemText)) {
          seen.add(itemText);
          stepItems.push(itemText);
        }
      });
    });

    if (stepItems.length > 0) {
      return renderTikzVectorSvgCard(stepItems, 'LaTeX TikZ Realtime Vector Flowchart');
    }

    return match;
  });

  return processed.trim();
}
