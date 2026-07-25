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

  const hasBranchingShear = stepItems.some(s => s.includes('UU') || s.includes('비압밀')) &&
                            stepItems.some(s => s.includes('CU') || s.includes('압밀 비배수')) &&
                            stepItems.some(s => s.includes('CD') || s.includes('압밀 배수'));

  if (hasBranchingShear) {
    return `
\n<div class="my-6 w-full max-w-4xl mx-auto bg-[#0b0f19] rounded-2xl p-6 border border-slate-800 shadow-2xl select-text font-sans">
  <div class="flex items-center justify-between border-b border-slate-800/80 pb-4">
    <div class="flex items-center gap-2">
      <span class="text-base">⚡</span>
      <h4 class="text-xs font-black text-slate-200 tracking-tight uppercase">${escapeXmlText(title.replace(/\$/g, ''))}</h4>
      <span class="text-[10px] font-extrabold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full uppercase tracking-wider">⚡ Realtime Vector</span>
    </div>
    <button onclick="window.toggleDiagramCard &amp;&amp; window.toggleDiagramCard(this)" class="text-xs font-bold bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/80 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer select-none">
      <span class="toggle-label">▼ 펼치기</span>
    </button>
  </div>
  <div class="diagram-card-content hidden w-full select-text mt-4">
    <svg width="100%" viewBox="0 0 650 560" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: auto; display: block;">
      <defs>
        <marker id="tikz-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
        <filter id="tikz-shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.4" />
        </filter>
      </defs>

      <!-- Step 1 Node -->
      <g transform="translate(175, 20)">
        <rect width="300" height="60" rx="8" fill="#1e1b4b" stroke="#6366f1" stroke-width="2" filter="url(#tikz-shadow)"/>
        <text x="150" y="26" text-anchor="middle" font-size="13" font-weight="bold" fill="#e0e7ff">1. Specimen Preparation &amp; Cell Mounting</text>
        <text x="150" y="46" text-anchor="middle" font-size="11" fill="#a5b4fc">Cylindrical Specimen (H/D = 2.0), O-rings &amp; Membrane</text>
      </g>

      <line x1="325" y1="80" x2="325" y2="115" stroke="#94a3b8" stroke-width="2" marker-end="url(#tikz-arrow)"/>

      <!-- Step 2 Node -->
      <g transform="translate(175, 120)">
        <rect width="300" height="60" rx="6" fill="#0f172a" stroke="#3b82f6" stroke-width="2" filter="url(#tikz-shadow)"/>
        <text x="150" y="26" text-anchor="middle" font-size="13" font-weight="bold" fill="#dbeafe">2. Saturation &amp; Skempton B-Check</text>
        <text x="150" y="46" text-anchor="middle" font-size="11" fill="#93c5fd">Back Pressure Increments ➔ B = Δu / Δσ₃</text>
      </g>

      <line x1="325" y1="180" x2="325" y2="215" stroke="#94a3b8" stroke-width="2" marker-end="url(#tikz-arrow)"/>

      <!-- Decision Node B >= 0.95 -->
      <g transform="translate(325, 250)">
        <polygon points="0,-30 110,0 0,30 -110,0" fill="#451a03" stroke="#f97316" stroke-width="2" filter="url(#tikz-shadow)"/>
        <text x="0" y="5" text-anchor="middle" font-size="13" font-weight="bold" fill="#ffedd5">Is B ≥ 0.95?</text>
      </g>

      <line x1="325" y1="280" x2="325" y2="325" stroke="#94a3b8" stroke-width="2" marker-end="url(#tikz-arrow)"/>
      <text x="335" y="305" font-size="11" font-weight="bold" fill="#34d399">Yes (Saturated)</text>

      <!-- Loop back line for B < 0.95 -->
      <path d="M 215,250 L 120,250 L 120,150 L 170,150" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#tikz-arrow)"/>
      <text x="130" y="240" font-size="10" font-weight="bold" fill="#fca5a5">No (B &lt; 0.95)</text>

      <!-- Step 3 Consolidation Node -->
      <g transform="translate(175, 330)">
        <rect width="300" height="55" rx="6" fill="#0f172a" stroke="#8b5cf6" stroke-width="2" filter="url(#tikz-shadow)"/>
        <text x="150" y="24" text-anchor="middle" font-size="13" font-weight="bold" fill="#ddd6fe">3. Isotropic Consolidation Phase</text>
        <text x="150" y="42" text-anchor="middle" font-size="11" fill="#c4b5fd">Cell Pressure σ₃' ➔ Volume Change ΔV</text>
      </g>

      <!-- 3 Branching Shearing Nodes -->
      <line x1="200" y1="385" x2="90" y2="425" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#tikz-arrow)"/>
      <line x1="325" y1="385" x2="325" y2="425" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#tikz-arrow)"/>
      <line x1="450" y1="385" x2="560" y2="425" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#tikz-arrow)"/>

      <g transform="translate(20, 430)">
        <rect width="140" height="50" rx="6" fill="#450a0a" stroke="#ef4444" stroke-width="1.5" filter="url(#tikz-shadow)"/>
        <text x="70" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="#fecaca">UU Shearing</text>
        <text x="70" y="38" text-anchor="middle" font-size="10" fill="#fca5a5">Cᵤ, φᵤ = 0</text>
      </g>

      <g transform="translate(255, 430)">
        <rect width="140" height="50" rx="6" fill="#1e3a8a" stroke="#3b82f6" stroke-width="1.5" filter="url(#tikz-shadow)"/>
        <text x="70" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="#dbeafe">CU Shearing</text>
        <text x="70" y="38" text-anchor="middle" font-size="10" fill="#93c5fd">u measured ➔ c', φ'</text>
      </g>

      <g transform="translate(490, 430)">
        <rect width="140" height="50" rx="6" fill="#064e3b" stroke="#10b981" stroke-width="1.5" filter="url(#tikz-shadow)"/>
        <text x="70" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="#d1fae5">CD Shearing</text>
        <text x="70" y="38" text-anchor="middle" font-size="10" fill="#6ee7b7">Δu ≈ 0 ➔ c', φ'</text>
      </g>

      <line x1="90" y1="480" x2="200" y2="515" stroke="#94a3b8" stroke-width="1.5"/>
      <line x1="325" y1="480" x2="325" y2="515" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#tikz-arrow)"/>
      <line x1="560" y1="480" x2="450" y2="515" stroke="#94a3b8" stroke-width="1.5"/>

      <!-- Output Step 5 -->
      <g transform="translate(175, 515)">
        <rect width="300" height="40" rx="6" fill="#064e3b" stroke="#10b981" stroke-width="2" filter="url(#tikz-shadow)"/>
        <text x="150" y="25" text-anchor="middle" font-size="12" font-weight="bold" fill="#d1fae5">5. Mohr-Coulomb Envelope: τ = c' + σ' tan(φ')</text>
      </g>
    </svg>
  </div>
</div>\n`;
  }

  const boxWidth = 540;
  const startX = 130;
  const gapY = 45;
  let currentY = 40;

  let svgElements = '';

  stepItems.forEach((stepText, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === stepItems.length - 1;
    const isDiamond = (stepText.trim().endsWith('?') || stepText.toLowerCase().startsWith('is ')) && stepText.length < 35;

    // Clean escaped XML & LaTeX math symbols safely
    let cleanText = stepText
      .replace(/&amp;Wgt;|amp;Wgt;|&Wgt;|Wgt|\\gt|₩gt|&gt;/gi, ' > ')
      .replace(/&amp;Wlt;|amp;Wlt;|&Wlt;|Wlt|\\lt|₩lt|&lt;/gi, ' < ')
      .replace(/\\textbf\{([^}]+)\}/gi, '$1')
      .replace(/\\textit\{([^}]+)\}/gi, '$1')
      .replace(/\\scriptsize\{([^}]+)\}/gi, '$1')
      .replace(/\\small\{([^}]+)\}/gi, '$1')
      .replace(/\\large\{([^}]+)\}/gi, '$1')
      .replace(/\\text\{([^}]+)\}/gi, '$1')
      .replace(/\\textbf\b|\\textit\b|\\scriptsize\b|\\small\b|\\large\b|\\font=[^\n]*/gi, '')
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/gi, '($1/$2)')
      .replace(/\\rightarrow/gi, '➔')
      .replace(/\\leftarrow/gi, '⬅')
      .replace(/\\approx/gi, '≈')
      .replace(/\\Delta/gi, 'Δ')
      .replace(/\\sigma/gi, 'σ')
      .replace(/\\gamma/gi, 'γ')
      .replace(/\\cdot/gi, '·')
      .replace(/\\sqrt\{?([^}]+)\}?/gi, '√($1)')
      .replace(/\\ge/gi, '≥')
      .replace(/\\le/gi, '≤')
      .replace(/\\alpha/gi, 'α')
      .replace(/\\beta/gi, 'β')
      .replace(/\\tau/gi, 'τ')
      .replace(/\\phi/gi, 'ϕ')
      .replace(/\\delta/gi, 'δ')
      .replace(/\\varepsilon|\\epsilon/gi, 'ε')
      .replace(/\\&/g, '&')
      .replace(/\$/g, '')
      .replace(/[{}]/g, '')
      .replace(/\\/g, '');

    const lines = wordWrapText(cleanText, 46);
    const boxHeight = Math.max(64, lines.length * 22 + 26);

    const y = currentY;

    if (isDiamond) {
      const cx = startX + boxWidth / 2;
      const cy = y + boxHeight / 2;
      const rx = 180;
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
  <div class="flex items-center justify-between border-b border-slate-800/80 pb-4">
    <div class="flex items-center gap-2">
      <span class="text-base">⚡</span>
      <h4 class="text-xs font-black text-slate-200 tracking-tight uppercase">${escapeXmlText(title.replace(/\$/g, ''))}</h4>
      <span class="text-[10px] font-extrabold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full uppercase tracking-wider">⚡ Realtime Vector</span>
    </div>
    <button onclick="const content=this.closest('.my-6').querySelector('.diagram-card-content'); const isHidden=content.classList.toggle('hidden'); this.querySelector('.toggle-label').textContent=isHidden?'▼ 펼치기':'▲ 접기';" class="text-xs font-bold bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/80 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer select-none">
      <span class="toggle-label">▼ 펼치기</span>
    </button>
  </div>
  <div class="diagram-card-content hidden w-full select-text mt-4">
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

  // Clean out outer LaTeX document and library wrappers globally so they never leak raw text
  processed = processed
    .replace(/\\documentclass\[[^\]]*\]\{[^}]+\}/gi, '')
    .replace(/\\usepackage(?:\[[^\]]*\])?\{[^}]+\}/gi, '')
    .replace(/\\usetikzlibrary(?:\[[^\]]*\])?\{[^}]+\}/gi, '')
    .replace(/\\tikzset\{[\s\S]*?\}/gi, '')
    .replace(/\\begin\{center\}/gi, '')
    .replace(/\\end\{center\}/gi, '')
    .replace(/\\begin\{document\}/gi, '')
    .replace(/\\end\{document\}/gi, '')
    .replace(/\\centering/gi, '');

  const tikzRegex = /(?:```[a-zA-Z0-9_-]*\s*)?[\s\S]*?\\(?:begin\{tikzpicture\}|node\s*(?:\[|\())[\s\S]*?(?:\\end\{tikzpicture\}|```\s*$|$)/gi;

  processed = processed.replace(tikzRegex, (match) => {
    let cleanTikz = match.replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```\s*$/, '');
    
    // If the block is an ASCII Art diagram, preserve as ASCII Art
    const isAsciiArt = /[━┃┌┐└┘├┤╋┿┼┴░▒▓█╲]|\/ *\\|\\ *\/|<-|->|\[지표면\]|\[굴착저면\]/i.test(cleanTikz) && !cleanTikz.includes('\\begin{tikzpicture}') && !cleanTikz.includes('\\node');
    if (isAsciiArt) {
      return match;
    }

    const nodeMatches = [...cleanTikz.matchAll(/\\node\s*(?:\[[\s\S]*?\])?\s*(?:\([\s\S]*?\))?\s*(?:\[[\s\S]*?\])?\s*\{([\s\S]*?)\};|([A-Za-z0-9_-]+)\s*\["([\s\S]*?)"\]/gi)];
    const stepItems = [];
    const seen = new Set();

    nodeMatches.forEach(m => {
      let rawText = (m[1] || m[3] || '').trim();
      let cleanedNode = rawText
        .replace(/%.*$/gm, '')
        .replace(/\\\\/g, '\n')
        .trim();

      // Split numbered multi-steps if multiple steps were concatenated into a single node
      const subSteps = cleanedNode.split(/(?=\[\d+(?:-\d+)?\]|\b\d+[\.\)]\s+)/g);
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
