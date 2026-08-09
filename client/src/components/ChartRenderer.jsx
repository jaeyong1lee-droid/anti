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

// Helper to render mixed text and KaTeX (e.g. "응력 $\\sigma$")
const renderMixedText = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  // [LATEX Rendering Logic Defense Shield] 
  // 메인 파이프라인(latexUtils.js)을 보호하기 위해, 차트 컴포넌트 내부에만 격리된 치유 로직 적용.
  // AI가 환각으로 슬래시 바로 뒤에 아래첨자를 붙여 생긴 콤마 착시(t/_S)를 t/S로 평탄화.
  let cleanText = text.replace(/([a-zA-Z])\/_([a-zA-Z0-9])/g, '$1/$2');

  if (!window.katex) return cleanText;
  
  try {
    return cleanText.replace(/\$([^\$]+)\$/g, (match, math) => {
      try {
        return window.katex.renderToString(math.trim(), { throwOnError: false });
      } catch (e) {
        return match;
      }
    });
  } catch (e) {
    return cleanText;
  }
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
        <foreignObject x={x} y={y + 25} width={width} height={20} style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-start justify-center text-[10px] sm:text-[12px] font-bold text-slate-400 w-full h-full text-center pt-1 normal-nums">
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
          <LineChart data={chartData} margin={{ top: 30, right: 15, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
            <XAxis 
              dataKey="x" 
              stroke="#64748b" 
              tick={<CustomTickX />} 
              label={<CustomXAxisLabel />} 
            />
            <YAxis 
              stroke="#64748b" 
              width={50}
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
    </div>
  );
};

export default ChartRenderer;
