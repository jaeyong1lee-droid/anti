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

// Renders mixed text with math using the main LaTeX rendering & sanitization pipeline
export const renderMixedText = (text, isMarkdown = false) => {
  if (text === null || text === undefined) return '';
  const str = typeof text === 'string' ? text : String(text);
  if (!str.trim()) return '';

  // 1. 단일 백슬래시 탈락 및 Tab/FormFeed/VerticalTab 기호로 변형된 \text / \frac / S_{extmax} 등 자동 복원
  let sanitized = str
    .replace(/\t(ext|au|heta|an|imes|ilde)\b/g, '\\t$1')
    .replace(/\x0c(rac)\b/g, '\\f$1')
    .replace(/\x0b(ert)\b/g, '\\v$1')
    .replace(/([A-Za-z0-9_\^\-]+)\s*[\t ]+ext\b/g, '$1\\text')
    .replace(/\b([A-Za-z0-9_]+)_{ext([A-Za-z0-9]+)}/g, '$1_{\\text{$2}}')
    .replace(/\b([A-Za-z0-9_]+)ext([A-Za-z0-9]+)\b/g, '$1_{\\text{$2}}');

  // 2. 메인 렌더링 파이프라인의 수식 정제 및 자동 치유 적용
  sanitized = cleanAndSanitizeMathText(sanitized);
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

  // 4. 달러 기호 없이 노출된 순수 그리스 문자 및 LaTeX 명령어 자동 감지 및 래핑
  // (예: \sigma_v, \tau_{max}, \frac{a}{b}, \Delta u, \phi = 30^\circ, \epsilon_a 등)
  const mathToken = '(?:\\\\[a-zA-Z]+(?:_(?:\\{[^{}]*\\}|[a-zA-Z0-9])|\\^(?:\\{[^{}]*\\}|[a-zA-Z0-9])|\\{[^{}]*\\}|\'{1,3})*|[a-zA-Z](?:_(?:\\{[^{}]*\\}|[a-zA-Z0-9])|\\^(?:\\{[^{}]*\\}|[a-zA-Z0-9])|\'{1,3}))';
  const bareLatexPattern = new RegExp(mathToken + '(?:\\s*(?:[=+\\-*\\/<>~]|\\\\le|\\\\ge|\\\\approx|\\\\times|\\\\cdot)\\s*(?:' + mathToken + '|[a-zA-Z0-9\\.]+|\\{[^{}]*\\}))*', 'g');

  protectedText = protectedText.replace(bareLatexPattern, (match) => {
    // 수식 기호(역슬래시, 첨자, 거듭제곱)가 포함된 경우에만 안전하게 KaTeX 대상으로 포섭
    if (!/\\|[_\^]/.test(match)) return match;
    const ph = `\uE000INLINEMATH${mathPlaceholders.length}\uE001`;
    mathPlaceholders.push({ ph, math: match.trim(), displayMode: false });
    return ph;
  });

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

    const rendered = renderKatexString(math, { 
      displayMode: item.displayMode, 
      throwOnError: false 
    });
    result = result.replace(item.ph, rendered);
  }

  return result;
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

// Recharts 표준 규격 및 Chart.js ({ type, data: { labels, datasets } }) 규격을 상호 호환 정규화하는 헬퍼
export const normalizeChartData = (raw) => {
  if (!raw || typeof raw !== 'object') return null;

  // Case 1: 이미 Recharts 배열 형식인 경우 (x 속성 보정)
  if (Array.isArray(raw.data)) {
    const fixedData = raw.data.map(item => {
      if (item && typeof item === 'object' && item.x === undefined) {
        return { ...item, x: item.label || item.name || '' };
      }
      return item;
    });
    return { ...raw, data: fixedData };
  }

  // Case 2: Chart.js 형식 ({ type, data: { labels: [...], datasets: [...] } }) 지원
  if (raw.data && typeof raw.data === 'object' && Array.isArray(raw.data.datasets)) {
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
      const rawColor = (ds.borderColor || ds.backgroundColor || '').toLowerCase();
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

    return {
      title: raw.title || (raw.options?.plugins?.title?.text) || '공학 차트그래프',
      xAxisLabel: raw.xAxisLabel || (raw.options?.scales?.x?.title?.text) || '심도 (X축)',
      yAxisLabel: yLabel || '측정값 (Y축)',
      description: raw.description || '',
      lines,
      data: convertedData
    };
  }

  return raw;
};

const ChartRenderer = ({ data: rawData }) => {
  const data = normalizeChartData(rawData);
  if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
    return <div className="text-rose-400 p-4 bg-rose-900/20 border border-rose-500/30 rounded-xl my-4 text-sm font-bold">⚠️ 유효하지 않은 차트 데이터입니다 (JSON 형식이 올바르지 않습니다).</div>;
  }

  const { title = '공학 차트그래프', xAxisLabel = 'X축', yAxisLabel = 'Y축', description, lines = [], data: chartData } = data;
  
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
        <foreignObject x={x} y={y - 35} width={width} height={30} style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-end justify-end text-[10px] sm:text-[12px] font-bold text-slate-400 w-full h-full text-right pr-2 pb-1 normal-nums">
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
    <div className="w-full my-4 border border-slate-700/60 rounded-xl overflow-hidden shadow-lg bg-slate-900/40 relative select-text normal-nums chart-katex-container">
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
          <LineChart data={chartData} margin={{ top: 30, right: 15, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
            <XAxis 
              dataKey="x" 
              stroke="#64748b" 
              height={25}
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
            <Legend verticalAlign="bottom" align="center" content={<CustomLegend />} />
            
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

      {description && (
        <div className="mx-3 mb-4 p-3 bg-slate-800/80 border border-slate-700/60 rounded-lg text-[12px] sm:text-[13px] text-slate-300 font-medium leading-relaxed shadow-inner">
          <div className="flex items-start gap-1.5">
            <span className="text-blue-400 mt-[1px] shrink-0 select-none">💡</span>
            <div className="flex-1 select-text" dangerouslySetInnerHTML={{ __html: renderMixedText(description, true) }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartRenderer;
