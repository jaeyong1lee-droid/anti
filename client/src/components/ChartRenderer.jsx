import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

// Helper to render mixed text and simplified Math (Mini-KaTeX) safely inside SVG <foreignObject>
// We avoid calling window.katex.renderToString because its complex .vlist absolute positioning
// collapses inside SVG <foreignObject> on WebKit/Blink, causing mangled fractions.
export const renderMixedText = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  let result = text;

  // 1. Strip block and inline dollar signs
  result = result.replace(/\$/g, '');

  // 2. Convert Greek letters
  const greek = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\Gamma': 'Γ',
    '\\delta': 'δ', '\\Delta': 'Δ', '\\epsilon': 'ε', '\\varepsilon': 'ε',
    '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ', '\\Theta': 'Θ',
    '\\kappa': 'κ', '\\lambda': 'λ', '\\Lambda': 'Λ', '\\mu': 'μ',
    '\\nu': 'ν', '\\xi': 'ξ', '\\Xi': 'Ξ', '\\pi': 'π', '\\Pi': 'Π',
    '\\rho': 'ρ', '\\sigma': 'σ', '\\Sigma': 'Σ', '\\tau': 'τ',
    '\\upsilon': 'υ', '\\phi': 'φ', '\\Phi': 'Φ', '\\chi': 'χ',
    '\\psi': 'ψ', '\\Psi': 'Ψ', '\\omega': 'ω', '\\Omega': 'Ω',
    '\\times': '×', '\\cdot': '·', '\\approx': '≈', '\\neq': '≠',
    '\\leq': '≤', '\\geq': '≥', '\\pm': '±', '\\infty': '∞'
  };
  for (const [tex, uni] of Object.entries(greek)) {
    const regex = new RegExp(tex.replace(/\\/g, '\\\\') + '(?![a-zA-Z])', 'g');
    result = result.replace(regex, uni);
  }

  // 3. Render Fractions \frac{A}{B} or \dfrac{A}{B} using bulletproof inline-block HTML
  // We use [\\s,]* between brackets to catch AI hallucinations like \frac{t}, {S_t} where it inserts a comma!
  result = result.replace(/\\d?frac{([^{}]+)}[\s,]*{([^{}]+)}/g, (match, num, den) => {
    return `<span style="display: inline-block; vertical-align: middle; text-align: center; font-size: 0.9em; line-height: 1.1; margin: 0 0.2em;">
      <span style="display: block; padding: 0 0.1em;">${num}</span>
      <span style="display: block; border-top: 1px solid currentColor;"></span>
      <span style="display: block; padding: 0 0.1em;">${den}</span>
    </span>`;
  });

  // 4. Superscripts
  result = result.replace(/\^\{([^{}]+)\}/g, '<sup style="font-size: 0.75em; margin-left: 1px;">$1</sup>');
  result = result.replace(/\^([a-zA-Z0-9_]+)/g, '<sup style="font-size: 0.75em; margin-left: 1px;">$1</sup>');

  // 5. Subscripts
  result = result.replace(/_\{([^{}]+)\}/g, '<sub style="font-size: 0.75em; margin-left: 1px;">$1</sub>');
  result = result.replace(/_([a-zA-Z0-9])/g, '<sub style="font-size: 0.75em; margin-left: 1px;">$1</sub>');

  // 6. Fix legacy AI hallucinations (e.g., ^t/S -> t/S)
  result = result.replace(/\/_/g, '/');
  result = result.replace(/\^t\//g, 't/');

  // 7. Convert unicode super/sub scripts to HTML tags for better cross-browser sizing
  const uniSupMap = { 'ᵗ': 't', 'ᵃ': 'a', 'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e', 'ᶠ': 'f', 'ᵍ': 'g', 'ʰ': 'h', 'ⁱ': 'i', 'ʲ': 'j', 'ᵏ': 'k', 'ˡ': 'l', 'ᵐ': 'm', 'ⁿ': 'n', 'ᵒ': 'o', 'ᵖ': 'p', 'ʳ': 'r', 'ˢ': 's', 'ᵘ': 'u', 'ᵛ': 'v', 'ʷ': 'w', 'ˣ': 'x', 'ʸ': 'y', 'ᶻ': 'z', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  const uniSubMap = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₛ': 's', 'ₜ': 't', 'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o', 'ₚ': 'p', 'ᵣ': 'r', 'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x' };
  
  result = result.replace(/[ᵗᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵘᵛʷˣʸᶻ⁰¹²³⁴⁵⁶⁷⁸⁹]/g, m => `<sup style="font-size: 0.75em;">${uniSupMap[m]}</sup>`);
  result = result.replace(/[₀₁₂₃₄₅₆₇₈₉ₛₜₐₑₕᵢₖₗₘₙₒₚᵣᵤᵥₓ]/g, m => `<sub style="font-size: 0.75em;">${uniSubMap[m]}</sub>`);

  return result.trim();
};

// Custom Tooltip with KaTeX support via dangerouslySetInnerHTML
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    // Process label through KaTeX if window.katex is available, else leave as is
    const renderLabel = () => {
      return <div dangerouslySetInnerHTML={{ __html: renderMixedText(label) }} />;
    };

    return (
      <div className="bg-slate-900 border border-slate-700/60 p-2 sm:p-3 rounded-lg shadow-xl text-slate-200">
        <div className="text-[9px] sm:text-[11px] font-bold mb-1.5 border-b border-slate-700/60 pb-1">{renderLabel()}</div>
        {payload.map((entry, index) => {
          const renderName = () => {
            return <span dangerouslySetInnerHTML={{ __html: renderMixedText(entry.name) }} />;
          };
          
          return (
            <div key={index} className="flex items-center gap-1.5 text-[9px] sm:text-[11px] font-semibold" style={{ color: entry.color }}>
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
              {renderName()}: <span className="font-mono ml-1 font-bold">{entry.value}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

// Custom Legend to support KaTeX
const CustomLegend = (props) => {
  const { payload } = props;
  
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-4 w-full px-2">
      {payload.map((entry, index) => {
        const renderText = () => {
          return <span dangerouslySetInnerHTML={{ __html: renderMixedText(entry.value) }} />;
        };

        return (
          <li key={`item-${index}`} className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-slate-300">
            <span className="block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
            {renderText()}
          </li>
        );
      })}
    </ul>
  );
};

const ChartRenderer = ({ data }) => {
  if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
    return <div className="text-rose-400 p-4 bg-rose-900/20 border border-rose-500/30 rounded-xl my-4 text-sm font-bold">⚠️ 유효하지 않은 차트 데이터입니다 (JSON 형식이 올바르지 않습니다).</div>;
  }

  const { title = '공학 차트그래프', xAxisLabel = 'X축', yAxisLabel = 'Y축', lines = [], data: chartData } = data;
  
  // Default line if none provided
  const plotLines = lines.length > 0 ? lines : [{ name: '측정값', dataKey: 'y', stroke: '#38bdf8' }];

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  // Custom tick formatter to render KaTeX in Axis ticks (via <foreignObject>)
  // Recharts XAxis tick supports React elements
  const CustomTickX = ({ x, y, payload }) => {
    const tickHtml = renderMixedText(payload.value);
    return (
      <g transform={`translate(${x},${y})`}>
        <foreignObject x="-30" y="5" width="60" height="20" style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-start justify-center text-[9px] sm:text-[11px] font-semibold text-slate-400 w-full h-full pt-1 normal-nums">
            <span dangerouslySetInnerHTML={{ __html: tickHtml }} />
          </div>
        </foreignObject>
      </g>
    );
  };

  const CustomTickY = ({ x, y, payload }) => {
    const tickHtml = renderMixedText(payload.value);
    return (
      <g transform={`translate(${x},${y})`}>
        <foreignObject x="-50" y="-10" width="45" height="20" style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-center justify-end text-[9px] sm:text-[11px] font-semibold text-slate-400 w-full h-full pr-1 normal-nums">
            <span dangerouslySetInnerHTML={{ __html: tickHtml }} />
          </div>
        </foreignObject>
      </g>
    );
  };

  const CustomXAxisLabel = ({ viewBox }) => {
    const { x = 0, y = 0, width = 0 } = viewBox || {};
    const html = renderMixedText(xAxisLabel);
    return (
      <g>
        <foreignObject x={x} y={y + 30} width={width} height={40} style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-start justify-center text-[10px] sm:text-[12px] font-bold text-slate-400 w-full h-full text-center normal-nums">
            <span dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </foreignObject>
      </g>
    );
  };

  const CustomYAxisLabel = ({ viewBox }) => {
    const { x = 0, y = 0 } = viewBox || {};
    const html = renderMixedText(yAxisLabel);
    return (
      <g>
        <foreignObject x={10} y={y - 25} width={250} height={20} style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-center justify-start text-left text-[10px] sm:text-[12px] font-bold text-slate-400 w-full h-full whitespace-nowrap normal-nums">
            <span dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </foreignObject>
      </g>
    );
  };

  return (
    <div className="w-full my-4 border border-slate-700/60 rounded-xl overflow-hidden shadow-lg bg-slate-900/40 relative select-text normal-nums">
      {/* Header */}
      <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-700/60 flex items-center justify-between mb-4">
        <h4 className="text-[14px] font-semibold text-slate-200 flex items-center leading-relaxed">
          <span className="mr-2">📈</span>
          <span dangerouslySetInnerHTML={{ __html: renderMixedText(title) }} />
        </h4>
        <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-[10px] text-amber-400 font-medium whitespace-nowrap">
          인터랙티브 차트
        </div>
      </div>

      <div className="p-2 sm:p-4 w-full h-[360px] sm:h-[400px]">
        {/* Recharts Container */}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 30, right: 15, left: 0, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
            <XAxis 
              dataKey="x" 
              stroke="#64748b" 
              height={65}
              tick={<CustomTickX />} 
              label={<CustomXAxisLabel />} 
            />
            <YAxis 
              stroke="#64748b" 
              width={55}
              tick={<CustomTickY />}
              label={<CustomYAxisLabel />} 
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '10px' }} verticalAlign="bottom" align="center" content={<CustomLegend />} />
            
            {plotLines.map((line, idx) => (
              <Line 
                key={idx}
                type="monotone" 
                dataKey={line.dataKey} 
                name={line.name}
                stroke={line.stroke} 
                strokeWidth={isMobile ? 1.5 : 2.5}
                dot={{ r: isMobile ? 1 : 2, strokeWidth: 1, fill: '#0f172a' }}
                activeDot={{ r: isMobile ? 4 : 6, fill: line.stroke, stroke: '#fff', strokeWidth: 1.5 }}
                animationDuration={1500}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ChartRenderer;
