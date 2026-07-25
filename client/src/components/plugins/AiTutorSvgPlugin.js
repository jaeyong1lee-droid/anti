// ============================================================================
// 🎨 Isolated AI Tutor SVG Graphic Plugin
// (100% Standalone & Encapsulated - Zero side-effects on existing KaTeX)
// ============================================================================

export function renderAiTutorSvg(text) {
  if (!text || typeof text !== 'string') return text || '';
  if (text.includes('diagram-card-content') || text.includes('Realtime Vector Graphic Render') || text.includes('___DIAGRAM_CARD_')) return text;
  
  let processed = text;

  // Unescape Wgt / Wlt, \gt / \lt, ₩gt / ₩lt and escaped quotes from LLM stream
  processed = processed
    .replace(/\\gt|\\\\gt|\\gt;|₩gt/g, '>')
    .replace(/\\lt|\\\\lt|\\lt;|₩lt/g, '<')
    .replace(/Wgt/g, '>')
    .replace(/Wlt/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/''#/g, '"#')
    .replace(/''/g, '"')
    .replace(/<\s+\//g, '</')
    .replace(/<\s+([a-zA-Z0-9_-]+)/g, '<$1');

  // Match SVG graphic blocks including any trailing code block labels
  const svgRegex = /(?:```[a-zA-Z0-9_-]*\s*)?(?:<[ \t]*svg|xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["'])[\s\S]*?(?:```\s*$|$)/gi;
  
  processed = processed.replace(svgRegex, (match) => {
    let cleanSvg = match
      .replace(/^```[a-zA-Z0-9_-]*\s*/i, '').replace(/```\s*$/, '')
      .replace(/^\$xml\s*/i, '').replace(/^\$ SVG\s*/i, '').replace(/^\$/, '')
      .replace(/<\s*svg[\$a-zA-Z0-9_-]*/gi, '<svg');

    if (!cleanSvg.trim().startsWith('<svg') && cleanSvg.includes('xmlns=')) {
      const xmlnsIdx = cleanSvg.indexOf('xmlns=');
      cleanSvg = `<svg ${cleanSvg.substring(xmlnsIdx)}`;
    }
    if (!cleanSvg.includes('</svg>')) {
      cleanSvg += '</svg>';
    }

    const svgMatch = cleanSvg.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      let baseSvgContent = svgMatch[0];
      const endSvgIdx = cleanSvg.indexOf('</svg>');
      
      // Embed any orphan text labels after </svg> inside code block directly INTO the SVG drawing canvas!
      if (endSvgIdx !== -1) {
        const orphanLabelText = cleanSvg.substring(endSvgIdx + 6).trim();
        if (orphanLabelText) {
          let orphanLines = orphanLabelText
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('```') && !l.startsWith('<div') && !l.startsWith('</div'));

          // Re-attach split parameters if a <text> tag inside SVG ends with an open parenthesis '('
          if (orphanLines.length > 0) {
            const unclosedTextMatch = baseSvgContent.match(/(<text\b[^>]*>[^<]*\()\s*<\/text>/i);
            if (unclosedTextMatch) {
              const firstOrphan = orphanLines.shift();
              const cleanFirst = firstOrphan.replace(/\\/g, '');
              baseSvgContent = baseSvgContent.replace(/(<text\b[^>]*>[^<]*\()\s*<\/text>/i, `$1${cleanFirst}</text>`);
            }
          }

          if (orphanLines.length > 0) {
            let viewW = 850;
            let viewH = 450;
            const viewBoxMatch = baseSvgContent.match(/viewBox=["']\s*\d+\s+\d+\s+(\d+)\s+(\d+)\s*["']/i);
            if (viewBoxMatch && viewBoxMatch[1] && viewBoxMatch[2]) {
              viewW = Math.max(parseInt(viewBoxMatch[1], 10), 850);
              viewH = parseInt(viewBoxMatch[2], 10);
            }

            const legendBoxH = orphanLines.length * 28 + 20;
            const newViewH = viewH + legendBoxH + 30;

            let legendGroup = `\n<!-- Integrated SVG Diagram Legend -->\n<g id="integrated-legend" transform="translate(40, ${viewH + 15})">\n`;
            legendGroup += `  <rect x="0" y="0" width="${viewW - 80}" height="${legendBoxH}" fill="#0b1120" stroke="#334155" stroke-width="1.5" rx="10" />\n`;

            let textY = 25;
            orphanLines.forEach(line => {
              const cleanLineStr = line.replace(/\$/g, '');
              legendGroup += `  <text x="20" y="${textY}" fill="#38bdf8" font-size="13px" font-weight="bold">${cleanLineStr}</text>\n`;
              textY += 28;
            });
            legendGroup += `</g>\n`;

            // Expand viewBox height & height attribute so the legend box is 100% inside the SVG!
            if (viewBoxMatch) {
              baseSvgContent = baseSvgContent.replace(/viewBox=["'][^"']+["']/i, `viewBox="0 0 ${viewW} ${newViewH}"`);
            }
            baseSvgContent = baseSvgContent.replace(/height=["']\d+["']/i, `height="${newViewH}"`);
            baseSvgContent = baseSvgContent.replace(/<\/svg>/i, `${legendGroup}</svg>`);
          }
        }
      }

      const isMohrApparatus = cleanSvg.includes('Mohr') || cleanSvg.includes('Apparatus') || cleanSvg.includes('모어') || cleanSvg.includes('삼축');
      const cardTitle = isMohrApparatus ? 'DYNAMIC INLINE SVG APPARATUS & MOHR CIRCLE' : '실시간 SVG 그래픽 도해';
      const badgeText = isMohrApparatus ? '지반공학 시뮬레이션' : '실시간 벡터';

      // Transform white background & dark text/lines into sleek Dark Mode (#0f172a / #f8fafc / #cbd5e1)
      let darkSvg = baseSvgContent
        .replace(/fill=["']#(?:ffffff|fff|f8f9fa|fafafa|f1f5f9)["']/gi, 'fill="#0f172a"')
        .replace(/fill=["'](?:white|#ffffff|#fff|#FFFFFF)["']/gi, 'fill="#0f172a"')
        .replace(/background(?:-color)?:\s*#(?:ffffff|fff|f8f9fa|fafafa|FFFFFF)/gi, 'background-color: #0f172a')
        .replace(/background(?:-color)?:\s*white/gi, 'background-color: #0f172a')
        // Transform dark/brown/orange text fills to bright white/yellow (#f8fafc / #fde047)
        .replace(/<text\b([^>]*?)\bfill=["']#(?:000000|000|111827|0f172a|1e293b|334155|475569|64748b)["']/gi, '<text$1fill="#f8fafc"')
        .replace(/<text\b([^>]*?)\bfill=["']#(?:d97706|b45309|92400e|78350f|c2410c|9a3412)["']/gi, '<text$1fill="#fde047"')
        .replace(/<text\b([^>]*?)\bfill=["'](?:black|darkgray|navy|darkorange|brown)["']/gi, '<text$1fill="#f8fafc"')
        // Add fill="#f8fafc" to any <text> that doesn't have a fill attribute
        .replace(/<text\b((?:(?!fill=)[^>])*)>/gi, '<text fill="#f8fafc"$1>')
        // Transform dark line/path strokes (#000, #1e293b, #334155, black) to bright silver/slate (#cbd5e1)
        .replace(/stroke=["']#(?:000000|000|111827|0f172a|1e293b|334155|475569|64748b)["']/gi, 'stroke="#cbd5e1"')
        .replace(/stroke=["'](?:black|darkgray)["']/gi, 'stroke="#cbd5e1"')
        // Remove formula surrounding window box <rect> (stroke/rx box) so math text floats in open space while keeping dark background panels
        .replace(/<rect\b([^>]*?)(?:stroke=["'][^"']+["']|rx=["'][^"']+["'])([^>]*?)>/gi, (match) => {
          if (match.includes('width="850"') || match.includes('width="800"') || match.includes('width="100%"') || match.includes('width="730"') || match.includes('height="600"') || match.includes('height="480"')) return match;
          return match.replace(/fill=["'][^"']+["']/gi, 'fill="none"').replace(/stroke=["'][^"']+["']/gi, 'stroke="none"');
        });

      // Expand viewBox width to at least 850px to prevent right-side text clipping
      const vbMatch = darkSvg.match(/viewBox=["']\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)["']/i);
      let minWidth = 850;
      if (vbMatch && vbMatch[3]) {
        const origW = parseInt(vbMatch[3], 10);
        if (origW < 850) {
          minWidth = 850;
          darkSvg = darkSvg.replace(/viewBox=["'][^"']+["']/i, `viewBox="${vbMatch[1]} ${vbMatch[2]} 850 ${vbMatch[4]}"`);
        } else {
          minWidth = origW;
        }
      }
      
      darkSvg = darkSvg.replace(/<svg\b([^>]*?)>/i, (m, attrs) => {
        let cleanAttrs = attrs.replace(/\bstyle=["'][^"']*["']/gi, '');
        return `<svg${cleanAttrs} style="min-width: ${minWidth}px; width: 100%; height: auto; display: block;">`;
      });

      return `\n<div class="my-6 w-full max-w-5xl mx-auto bg-[#0b0f19] rounded-2xl p-6 border border-slate-800 shadow-2xl overflow-x-auto select-text font-sans">
  <div class="flex items-center justify-between border-b border-slate-800/80 pb-4">
    <div class="flex items-center gap-2">
      <span class="text-base">${isMohrApparatus ? '🧪' : '⚡'}</span>
      <h4 class="text-xs font-black text-slate-200 tracking-tight uppercase">${cardTitle}</h4>
      <span class="text-[10px] font-extrabold bg-indigo-950/80 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full uppercase tracking-wider">${badgeText}</span>
    </div>
    <button onclick="window.toggleDiagramCard &amp;&amp; window.toggleDiagramCard(this)" class="text-xs font-bold bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/80 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer select-none">
      <span class="toggle-label">▼ 펼치기</span>
    </button>
  </div>
  <div class="diagram-card-content hidden w-full svg-scroll-container select-text mt-4">
    ${darkSvg}
  </div>
</div>\n`;
    }
    return match;
  });

  return processed;
}
