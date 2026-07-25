// ============================================================================
// 📊 Isolated AI Tutor Mermaid Flowchart Plugin
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

function renderMermaidVectorSvgCard(stepItems, title = 'Mermaid Realtime Vector Flowchart') {
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
      svgElements += `<polygon points="${points}" fill="#451a03" stroke="#f97316" stroke-width="2.5" filter="url(#mermaid-shadow)" />`;
      svgElements += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="12" font-weight="900" fill="#ffedd5">${escapeXmlText(mainTitle)}</text>`;
    } else if (isFirst) {
      svgElements += `<rect x="${startX}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#1e1b4b" stroke="#6366f1" stroke-width="2.5" filter="url(#mermaid-shadow)" />`;
      svgElements += `<text x="${startX + boxWidth / 2}" y="${y + (subtitle ? 26 : boxHeight / 2 + 4)}" text-anchor="middle" font-size="12" font-weight="900" fill="#e0e7ff">${escapeXmlText(mainTitle)}</text>`;
      if (subtitle) {
        svgElements += `<text x="${startX + boxWidth / 2}" y="${y + 46}" text-anchor="middle" font-size="10" font-weight="700" fill="#a5b4fc">${escapeXmlText(subtitle)}</text>`;
      }
    } else if (isLast) {
      svgElements += `<rect x="${startX}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#064e3b" stroke="#10b981" stroke-width="2.5" filter="url(#mermaid-shadow)" />`;
      svgElements += `<text x="${startX + boxWidth / 2}" y="${y + (subtitle ? 26 : boxHeight / 2 + 4)}" text-anchor="middle" font-size="12" font-weight="900" fill="#d1fae5">${escapeXmlText(mainTitle)}</text>`;
      if (subtitle) {
        svgElements += `<text x="${startX + boxWidth / 2}" y="${y + 46}" text-anchor="middle" font-size="10" font-weight="700" fill="#6ee7b7">${escapeXmlText(subtitle)}</text>`;
      }
    } else {
      svgElements += `<rect x="${startX}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#0f172a" stroke="#3b82f6" stroke-width="2.5" filter="url(#mermaid-shadow)" />`;
      svgElements += `<text x="${startX + boxWidth / 2}" y="${y + (subtitle ? 26 : boxHeight / 2 + 4)}" text-anchor="middle" font-size="12" font-weight="900" fill="#dbeafe">${escapeXmlText(mainTitle)}</text>`;
      if (subtitle) {
        svgElements += `<text x="${startX + boxWidth / 2}" y="${y + 46}" text-anchor="middle" font-size="10" font-weight="700" fill="#93c5fd">${escapeXmlText(subtitle)}</text>`;
      }
    }

    if (idx < stepItems.length - 1) {
      const arrowStartY = y + boxHeight;
      const arrowEndY = y + boxHeight + gapY - 6;
      const cx = startX + boxWidth / 2;
      svgElements += `<path d="M ${cx} ${arrowStartY} L ${cx} ${arrowEndY}" stroke="#94a3b8" stroke-width="2" marker-end="url(#mermaid-arrowhead)" />`;
    }
  });

  return `
\n<div class="my-6 w-full max-w-4xl mx-auto bg-[#0b0f19] rounded-2xl p-6 border border-slate-800 shadow-2xl select-text font-sans">
  <div class="flex items-center justify-between border-b border-slate-800/80 pb-4">
    <div class="flex items-center gap-2">
      <span class="text-base">⚡</span>
      <h4 class="text-xs font-black text-slate-200 tracking-tight uppercase">${escapeXmlText(title)}</h4>
      <span class="text-[10px] font-extrabold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full uppercase tracking-wider">⚡ Realtime Vector</span>
    </div>
    <button onclick="window.toggleDiagramCard &amp;&amp; window.toggleDiagramCard(this)" class="text-xs font-bold bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/80 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer select-none">
      <span class="toggle-label">▼ 펼치기</span>
    </button>
  </div>
  <div class="diagram-card-content hidden w-full select-text mt-4">
    <svg width="100%" viewBox="0 0 800 ${svgHeight}" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: auto; display: block;">
    <defs>
      <marker id="mermaid-arrowhead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
      </marker>
      <filter id="mermaid-shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.4" />
      </filter>
    </defs>
    ${svgElements}
  </svg>
  </div>
</div>\n
`;
}

export function renderAiTutorMermaid(text) {
  if (!text || typeof text !== 'string') return text || '';

  const mermaidRegex = /(?:```[a-zA-Z0-9_-]*\s*)?(?:graph\s+TD|graph\s+LR|flowchart\s+TD|flowchart\s+LR)[\s\S]*?(?:```\s*$|$)/gi;

  return text.replace(mermaidRegex, (match) => {
    let cleanMermaid = match.replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```\s*$/, '');
    
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
      return renderMermaidVectorSvgCard(stepItems, 'Mermaid Realtime Vector Flowchart');
    }

    return match;
  });
}
