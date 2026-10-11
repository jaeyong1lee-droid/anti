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

import { renderKatexString, cleanAndSanitizeMathText } from '../utils/renderingHelpers';
import { healLatexFormulas } from '../utils/latexUtils';
import { LatexRenderer } from './LatexRenderer';

/**
 * 🪶 autoWrapBareMath: 차트 데이터 내에 AI가 달러 기호($)를 누락하고 보낸 날것의 LaTeX 수식을 $...$로 자동 래핑
 */
export const autoWrapBareMath = (text) => {
  if (!text || typeof text !== 'string') return text || '';
  if (!/\\|[_\^]/.test(text)) return text;

  // 1. 이미 존재하는 $...$ 및 $$...$$ 블록 임시 보호
  const tokens = [];
  let masked = text.replace(/\$\$[\s\S]*?\$\$|\$[^\$\n]+\$/g, (m) => {
    const ph = `__MATH_PH_${tokens.length}__`;
    tokens.push({ ph, val: m });
    return ph;
  });

  // 2. 등호 포함 수식 (예: q = \frac{\sigma_1 - \sigma_3}{2} (\text{kPa}))
  masked = masked.replace(/([a-zA-Z]\s*=\s*\\(?:frac|dfrac)\{[^{}]*\}\{[^{}]*\}(?:\s*\(\\text\{[^{}]*\}\))?)/g, (m) => {
    const ph = `__MATH_PH_${tokens.length}__`;
    tokens.push({ ph, val: `$${m}$` });
    return ph;
  });

  // 3. 고립된 백슬래시 분수 (예: \frac{a}{b})
  masked = masked.replace(/(?<!\$)(?:\\(?:frac|dfrac)\{[^{}]*\}\{[^{}]*\})(?!\$)/g, (m) => {
    const ph = `__MATH_PH_${tokens.length}__`;
    tokens.push({ ph, val: `$${m}$` });
    return ph;
  });

  // 4. 그리스 문자 및 변수 첨자 (예: \epsilon_1, E_{50}, \sigma_3, \tau_{max}, \Delta u 등)
  const mathSymbols = 'alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega';
  const symbolRegex = new RegExp(`(?<![a-zA-Z\\$])([A-Z]_[a-zA-Z0-9]+|[A-Z]_\\{[^{}]+\\}|\\\\(?:${mathSymbols})(?:_[a-zA-Z0-9]+|_\\{[^{}]+\\})?)(?![a-zA-Z0-9_\\}\\$])`, 'gi');
  masked = masked.replace(symbolRegex, (m) => {
    const ph = `__MATH_PH_${tokens.length}__`;
    tokens.push({ ph, val: `$${m}$` });
    return ph;
  });

  // 5. 보호했던 수식 복원
  for (const { ph, val } of tokens) {
    masked = masked.replace(ph, val);
  }

  // 중복 $ 정제
  masked = masked.replace(/\${3,}/g, '$$').replace(/\${2}([^$]+)\${2}/g, '$$$1$$');
  return masked;
};

// Renders mixed text with math using the main LaTeX rendering & sanitization pipeline
export const renderMixedText = (text, isMarkdown = false) => {
  if (text === null || text === undefined) return '';
  const str = typeof text === 'string' ? text : String(text);
  if (!str.trim()) return '';

  // 1. 개행 정규화 및 메인 렌더링 파이프라인의 수식 정제 적용
  let normalized = str.replace(/\r\n/g, '\n');
  let sanitized = cleanAndSanitizeMathText(normalized);
  sanitized = healLatexFormulas(sanitized, false, null);

  // 3. 기존 $ 및 $$ 수식 블록 보호 (방화벽 - 언더스코어 간섭 없는 안전 토큰 사용)
  const mathPlaceholders = [];
  let protectedText = sanitized.replace(/\$\$([\s\S]*?)\$\$/g, (m, math) => {
    const ph = `\uE000BLOCKMATH${mathPlaceholders.length}\uE001`;
    mathPlaceholders.push({ ph, math: math.trim(), displayMode: true });
    return ph;
  });

  protectedText = protectedText.replace(/\$([^\$\n]+)\$/g, (m, math) => {
    const ph = `\uE000INLINEMATH${mathPlaceholders.length}\uE001`;
    mathPlaceholders.push({ ph, math: math.trim(), displayMode: false });
    return ph;
  });

  // 3.1. 수식 블록이 보호된 후, 텍스트 영역의 리터럴 \n만 안전 복원 (\nu 등 LaTeX 명령어 훼손 원천 방지)
  if (protectedText.includes('\\n')) {
    protectedText = protectedText.replace(/\\n/g, '\n');
  }

  // 3.5. 닫히지 않은 고립된 $ 수식 자동 치유 (예: "저항 계수 $F(\mu)", "$T_h", "$i_c = (G_s - 1)/(1 + e)")
  if (protectedText.includes('$')) {
    protectedText = protectedText.replace(/\$([a-zA-Z\\][^\$\n\uE000]*?)(?=[\uAC00-\uD7A3\n\uE000]|$)/g, (match, formula) => {
      let trimmed = formula.trimEnd();
      let trailingPunct = '';
      const punctMatch = trimmed.match(/[,.;:]+$/);
      if (punctMatch) {
        trailingPunct = punctMatch[0];
        trimmed = trimmed.substring(0, trimmed.length - trailingPunct.length).trimEnd();
      }

      // 괄호 및 중괄호 쌍 유효성 검사 (바깥쪽 닫는 괄호 초과 방지)
      let openParen = 0, openBrace = 0, openBracket = 0;
      let validEndIdx = trimmed.length;
      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (ch === '(') openParen++;
        else if (ch === ')') {
          if (openParen > 0) openParen--;
          else { validEndIdx = i; break; }
        } else if (ch === '{') openBrace++;
        else if (ch === '}') {
          if (openBrace > 0) openBrace--;
          else { validEndIdx = i; break; }
        } else if (ch === '[') openBracket++;
        else if (ch === ']') {
          if (openBracket > 0) openBracket--;
          else { validEndIdx = i; break; }
        }
      }

      const validFormula = trimmed.substring(0, validEndIdx).trim();
      const leftover = trimmed.substring(validEndIdx) + trailingPunct;

      if (!validFormula) return match;

      const ph = `\uE000INLINEMATH${mathPlaceholders.length}\uE001`;
      mathPlaceholders.push({ ph, math: validFormula, displayMode: false });
      return `${ph}${leftover}`;
    });
  }

  // 5. 마크다운 문법 적용 (description 등 서술 텍스트인 경우)
  let result = protectedText;
  if (isMarkdown) {
    result = result.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-amber-300">$1</strong>');
    result = result.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em class="italic text-slate-200">$1</em>');
    result = result.replace(/^[ \t]*[-*•][ \t]+(.*)$/gm, '<div class="flex items-start gap-1.5 my-1 pl-1 leading-relaxed"><span class="text-amber-400 select-none font-bold">•</span><span class="flex-1">$1</span></div>');
    result = result.replace(/\n{2,}/g, '<div class="h-2"></div>');
    result = result.replace(/\n/g, '<br/>');
  }

  // 6. 메인 KaTeX 엔진으로 렌더링된 수식 복원
  for (const item of mathPlaceholders) {
    let math = item.math;
    if (/[\uAC00-\uD7A3]/.test(math)) {
      const isReal = /\\/.test(math) || /_/.test(math) || /\^/.test(math) || /[=+\-\*\/]/.test(math) || /\\cdot/.test(math);
      if (!isReal) {
        result = result.replace(item.ph, `$${math}$`);
        continue;
      }
    }

    // 그리스 문자 및 특수 기호 KaTeX 호환 정규화
    math = math.replace(/[µμ]/g, '\\mu ')
               .replace(/π/g, '\\pi ')
               .replace(/σ/g, '\\sigma ')
               .replace(/τ/g, '\\tau ')
               .replace(/λ/g, '\\lambda ')
               .replace(/α/g, '\\alpha ')
               .replace(/β/g, '\\beta ')
               .replace(/γ/g, '\\gamma ')
               .replace(/Δ/g, '\\Delta ')
               .replace(/ε/g, '\\epsilon ')
               .replace(/θ/g, '\\theta ')
               .replace(/φ/g, '\\phi ')
               .replace(/ω/g, '\\omega ');

    const rendered = renderKatexString(math, { 
      displayMode: item.displayMode, 
      throwOnError: false 
    });
    result = result.replace(item.ph, rendered);
  }

  return result;
};

// Custom Tooltip with KaTeX support via LatexRenderer
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const labelStr = label !== undefined && label !== null ? String(label) : '';
    const labelHasMath = labelStr.includes('$') || labelStr.includes('\\');
    return (
      <div className="bg-slate-900 border border-slate-700/60 p-2 sm:p-3 rounded-lg shadow-xl text-slate-200">
        <div className="text-[9px] sm:text-[11px] font-bold mb-1.5 border-b border-slate-700/60 pb-1">
          {labelHasMath ? <LatexRenderer text={labelStr} forceInline={true} /> : <span>{labelStr}</span>}
        </div>
        {payload.map((entry, index) => {
          const nameStr = entry?.name !== undefined && entry?.name !== null ? String(entry.name) : '';
          return (
            <div key={index} className="flex items-center gap-1.5 text-[9px] sm:text-[11px] font-semibold" style={{ color: entry.color }}>
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
              <LatexRenderer text={nameStr} forceInline={true} />: <span className="font-mono ml-1 font-bold">{entry.value}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

// Custom Legend to support KaTeX via LatexRenderer
const CustomLegend = (props) => {
  const { payload } = props;
  if (!Array.isArray(payload)) return null;
  
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-2.5 w-full px-2">
      {payload.map((entry, index) => (
        <li key={`item-${index}`} className="flex items-center gap-1.5 text-[9.5px] sm:text-xs font-bold text-slate-300">
          <span className="block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
          <LatexRenderer text={String(entry.value ?? '')} forceInline={true} />
        </li>
      ))}
    </ul>
  );
};

// Recharts 표준 규격 및 Chart.js ({ type, data: { labels, datasets } }) 규격을 상호 호환 정규화하는 헬퍼
export const normalizeChartData = (raw) => {
  if (!raw || typeof raw !== 'object') return null;

  // AI 응답이 { visual_component: { ... } }, { chart: { ... } }, { chart_data: { ... } } 래핑 객체인 경우 선제적 언래핑
  if (raw.visual_component && typeof raw.visual_component === 'object') {
    raw = { ...raw, ...raw.visual_component };
  }
  if (raw.chart && typeof raw.chart === 'object') {
    raw = { ...raw, ...raw.chart };
  } else if (raw.chart_data && typeof raw.chart_data === 'object') {
    raw = { ...raw, ...raw.chart_data };
  }

  // lines / series 별칭 호환
  if (!Array.isArray(raw.lines) && Array.isArray(raw.series)) {
    raw.lines = raw.series;
  }

  let result = raw;

  // Case 1: 이미 Recharts 배열 형식인 경우 (x 속성 보정)
  if (Array.isArray(raw.data)) {
    const fixedData = raw.data.map(item => {
      if (item && typeof item === 'object' && item.x === undefined) {
        return { ...item, x: item.X !== undefined ? item.X : (item.label || item.name || '') };
      }
      return item;
    });
    result = { ...raw, data: fixedData };
  } else if (raw.data && typeof raw.data === 'object' && Array.isArray(raw.data.datasets)) {
    // Case 2: Chart.js 형식 ({ type, data: { labels: [...], datasets: [...] } }) 지원
    const labels = Array.isArray(raw.data.labels) ? raw.data.labels : [];
    const datasets = raw.data.datasets;
    const palette = ['#38bdf8', '#f43f5e', '#34d399', '#fbbf24', '#a855f7', '#fb923c', '#06b6d4'];
    const colorMap = {
      blue: '#38bdf8',
      red: '#f43f5e',
      green: '#34d399',
      yellow: '#fbbf24',
      purple: '#a855f7',
      orange: '#fb923c',
      cyan: '#06b6d4'
    };

    const lines = datasets.map((ds, idx) => {
      const rawColor = String(ds.borderColor || ds.backgroundColor || '').toLowerCase();
      const strokeColor = colorMap[rawColor] || ds.borderColor || ds.backgroundColor || palette[idx % palette.length];
      return {
        name: ds.label || `시리즈 ${idx + 1}`,
        dataKey: `y${idx}`,
        stroke: strokeColor
      };
    });

    const convertedData = labels.map((label, lIdx) => {
      const item = { x: String(label) };
      datasets.forEach((ds, dIdx) => {
        item[`y${dIdx}`] = (Array.isArray(ds.data) && ds.data[lIdx] !== undefined) ? ds.data[lIdx] : null;
      });
      return item;
    });

    let yLabel = raw.yAxisLabel || (raw.options?.scales?.y?.title?.text);
    if (!yLabel && datasets[0]?.label) {
      yLabel = datasets[0].label;
    }

    result = {
      title: raw.title || (raw.options?.plugins?.title?.text) || '공학 차트그래프',
      xAxisLabel: raw.xAxisLabel || (raw.options?.scales?.x?.title?.text) || '심도 (X축)',
      yAxisLabel: yLabel || '측정값 (Y축)',
      description: raw.description || '',
      lines,
      data: convertedData
    };
  }

  // 텍스트 필드 자동 수식 래핑 (AI가 달러 $ 누락 시 선제적 보정)
  if (result && typeof result === 'object') {
    result = {
      ...result,
      title: autoWrapBareMath(result.title),
      xAxisLabel: autoWrapBareMath(result.xAxisLabel),
      yAxisLabel: autoWrapBareMath(result.yAxisLabel),
      description: autoWrapBareMath(result.description),
      lines: Array.isArray(result.lines) ? result.lines.map(line => ({
        ...line,
        name: autoWrapBareMath(line.name)
      })) : result.lines
    };
  }

  return result;
};

const ChartRenderer = ({ data: rawData, height, compact = false, hideHeader = false, className = '' }) => {
  const data = normalizeChartData(rawData);
  if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
    return <div className="text-rose-400 p-3 bg-rose-900/20 border border-rose-500/30 rounded-xl my-2 text-xs font-bold">⚠️ 유효하지 않은 차트 데이터입니다 (JSON 형식이 올바르지 않습니다).</div>;
  }

  const { title = '공학 차트그래프', xAxisLabel = 'X축', yAxisLabel = 'Y축', description, lines = [], data: chartData } = data;
  
  // Default line if none provided
  const plotLines = lines.length > 0 ? lines : [{ name: '측정값', dataKey: 'y', stroke: '#38bdf8' }];

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  // Custom tick formatter to render KaTeX in Axis ticks (via <foreignObject>)
  // Recharts XAxis tick supports React elements
  const CustomTickX = ({ x, y, payload }) => {
    const val = payload?.value !== undefined && payload?.value !== null ? payload.value : '';
    const strVal = String(val);
    const hasMath = strVal.includes('$') || strVal.includes('\\');
    return (
      <g transform={`translate(${x},${y})`}>
        <foreignObject x="-30" y="5" width="60" height="20" style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-start justify-center text-[9px] sm:text-[11px] font-semibold text-slate-400 w-full h-full pt-1 normal-nums">
            {hasMath ? <LatexRenderer text={strVal} forceInline={true} /> : <span>{strVal}</span>}
          </div>
        </foreignObject>
      </g>
    );
  };

  const CustomTickY = ({ x, y, payload }) => {
    const val = payload?.value !== undefined && payload?.value !== null ? payload.value : '';
    const strVal = String(val);
    const hasMath = strVal.includes('$') || strVal.includes('\\');
    return (
      <g transform={`translate(${x},${y})`}>
        <foreignObject x="-50" y="-10" width="45" height="20" style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-center justify-end text-[9px] sm:text-[11px] font-semibold text-slate-400 w-full h-full pr-1 normal-nums">
            {hasMath ? <LatexRenderer text={strVal} forceInline={true} /> : <span>{strVal}</span>}
          </div>
        </foreignObject>
      </g>
    );
  };

  const CustomXAxisLabel = ({ viewBox }) => {
    const { x = 0, y = 0, width = 0 } = viewBox || {};
    return (
      <g>
        <foreignObject x={x} y={y - 35} width={width} height={30} style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-end justify-end text-[10px] sm:text-[12px] font-bold text-slate-400 w-full h-full text-right pr-2 pb-1 normal-nums">
            <LatexRenderer text={xAxisLabel} forceInline={true} />
          </div>
        </foreignObject>
      </g>
    );
  };

  const CustomYAxisLabel = ({ viewBox }) => {
    const { x = 0, y = 0 } = viewBox || {};
    return (
      <g>
        <foreignObject x={10} y={y - 25} width={250} height={20} style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-center justify-start text-left text-[10px] sm:text-[12px] font-bold text-slate-400 w-full h-full whitespace-nowrap normal-nums">
            <LatexRenderer text={yAxisLabel} forceInline={true} />
          </div>
        </foreignObject>
      </g>
    );
  };

  const containerHeightClass = height ? height : (compact ? 'h-[210px] sm:h-[240px]' : 'h-[360px] sm:h-[400px]');

  return (
    <div className={`w-full ${compact ? 'my-1 border-slate-700/50 bg-slate-950/60' : 'my-4 border-slate-700/60 bg-slate-900/40'} border rounded-xl overflow-hidden shadow-lg relative select-text normal-nums chart-katex-container ${className}`}>
      <style>{`
        .chart-katex-container .katex {
          font-size: 1.05em !important;
          line-height: normal !important;
          white-space: nowrap !important;
        }
        .chart-katex-container .katex-display {
          margin: 0.25rem 0 !important;
        }
      `}</style>
      {/* Header */}
      {!hideHeader && (
        <div className={`px-3 ${compact ? 'py-1.5' : 'py-2'} bg-slate-800/50 border-b border-slate-700/60 flex items-center justify-between ${compact ? 'mb-1' : 'mb-3'}`}>
          <h4 className={`${compact ? 'text-[12px]' : 'text-[14px]'} font-semibold text-slate-200 flex items-center leading-relaxed`}>
            <span className="mr-1.5">📈</span>
            <LatexRenderer text={title} forceInline={true} />
          </h4>
          <div className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-[9.5px] text-amber-400 font-medium whitespace-nowrap">
            인터랙티브 차트
          </div>
        </div>
      )}

      <div className={`w-full ${compact ? 'p-1 sm:p-2' : 'p-2 sm:p-4'} ${containerHeightClass}`}>
        {/* Recharts Container */}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: compact ? 20 : 30, right: 15, left: 0, bottom: compact ? 5 : 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
            <XAxis 
              dataKey="x" 
              stroke="#64748b" 
              height={compact ? 22 : 25}
              tick={<CustomTickX />} 
              label={<CustomXAxisLabel />} 
            />
            <YAxis 
              stroke="#64748b" 
              width={compact ? 48 : 55}
              tick={<CustomTickY />}
              label={<CustomYAxisLabel />} 
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="bottom" align="center" content={<CustomLegend />} />
            
            {plotLines.map((line, idx) => (
              <Line 
                key={idx}
                type="monotone" 
                dataKey={line.dataKey} 
                name={line.name}
                stroke={line.stroke} 
                strokeWidth={isMobile || compact ? 1.8 : 2.5}
                dot={{ r: isMobile || compact ? 1 : 2, strokeWidth: 1, fill: '#0f172a' }}
                activeDot={{ r: isMobile || compact ? 4 : 6, fill: line.stroke, stroke: '#fff', strokeWidth: 1.5 }}
                animationDuration={1500}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {description && (
        <div className={`${compact ? 'mx-2 mb-2 p-2 text-[11px]' : 'mx-3 mb-4 p-3 text-[12px] sm:text-[13px]'} bg-slate-800/80 border border-slate-700/60 rounded-lg text-slate-300 font-medium leading-relaxed shadow-inner`}>
          <div className="flex items-start gap-1.5">
            <span className="text-blue-400 mt-[1px] shrink-0 select-none">💡</span>
            <div className="flex-1 select-text">
              <LatexRenderer text={description} isMarkdown={true} forceInline={true} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartRenderer;
