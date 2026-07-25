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

  // Match SVG graphic blocks strictly from <svg> to </svg>, optionally matching trailing split parameters
  const svgRegex = /(?:```(?:xml|svg)?\s*)?(<svg[\s\S]*?<\/svg>)(?:\s*[\r\n]+([^\r\n]+?\)))?(?:\s*```)?/gi;
  
  processed = processed.replace(svgRegex, (match, svgContent, trailingLine) => {
    let cleanSvg = svgContent
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
      const isMohrApparatus = cleanSvg.includes('Mohr') || cleanSvg.includes('Apparatus') || cleanSvg.includes('모어') || cleanSvg.includes('삼축');
      const cardTitle = isMohrApparatus ? 'DYNAMIC INLINE SVG APPARATUS & MOHR CIRCLE' : '실시간 SVG 그래픽 도해';
      const badgeText = isMohrApparatus ? '지반공학 시뮬레이션' : '실시간 벡터';

      let baseSvgContent = svgMatch[0];
      
      // Auto-heal split soil parameters (e.g., <text>1층 점토층 (</text> \gamma_1...) back into intact text inside SVG
      if (trailingLine && trailingLine.includes(')')) {
        // Find any text element inside SVG that ends with open parenthesis '('
        const unclosedTextMatch = baseSvgContent.match(/(<text\b[^>]*>[^<]*\(\s*)<\/text>/i);
        if (unclosedTextMatch) {
          // Format LaTeX greek letters back to clean unicode symbols for SVG display
          let cleanFirst = trailingLine
            .replace(/\\gamma/g, 'γ')
            .replace(/\\phi/g, 'φ')
            .replace(/\\sigma/g, 'σ')
            .replace(/\\tau/g, 'τ')
            .replace(/\\theta/g, 'θ')
            .replace(/\\delta/g, 'δ')
            .replace(/\\alpha/g, 'α')
            .replace(/\\beta/g, 'β')
            .replace(/\\/g, ''); // strip any backslashes

          // Safely merge parameters into the unclosed parenthesized text tag!
          baseSvgContent = baseSvgContent.replace(/(<text\b[^>]*>[^<]*\(\s*)<\/text>/i, `$1${cleanFirst}</text>`);
        }
      }

      // Transform white background & dark text into sleek Dark Mode (#0f172a / #f8fafc)
      let darkSvg = baseSvgContent
        .replace(/fill=["']#(?:ffffff|fff|f8f9fa|fafafa|f1f5f9|FFFFFF)["']/gi, 'fill="#0f172a"')
        .replace(/fill=["']white["']/gi, 'fill="#0f172a"')
        .replace(/background(?:-color)?:\s*#(?:ffffff|fff|f8f9fa|fafafa|FFFFFF)/gi, 'background-color: #0f172a')
        .replace(/background(?:-color)?:\s*white/gi, 'background-color: #0f172a')
        .replace(/<text\b([^>]*?)\bfill=["']#(?:000000|000|111827|0f172a|1e293b|334155)["']/gi, '<text$1fill="#f8fafc"')
        .replace(/<text\b([^>]*?)\bfill=["']black["']/gi, '<text$1fill="#f8fafc"');

      // Enforce fixed drawing size & horizontal scrollbar when width exceeds container
      const vbMatch = darkSvg.match(/viewBox=["']\s*\d+\s+\d+\s+(\d+)\s+\d+["']/i);
      const minWidth = vbMatch ? Math.max(parseInt(vbMatch[1], 10), 750) : 800;
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
