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

// Custom Tooltip with KaTeX support via dangerouslySetInnerHTML
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    // Process label through KaTeX if window.katex is available, else leave as is
    const renderLabel = () => {
      if (window.katex && label && typeof label === 'string') {
        try {
          return <div dangerouslySetInnerHTML={{ __html: window.katex.renderToString(label) }} />;
        } catch (e) {
          return <span>{label}</span>;
        }
      }
      return <span>{label}</span>;
    };

    return (
      <div className="bg-slate-900 border border-slate-700/60 p-3 rounded-lg shadow-xl text-slate-200">
        <div className="font-bold mb-2 border-b border-slate-700/60 pb-1">{renderLabel()}</div>
        {payload.map((entry, index) => {
          const renderName = () => {
            if (window.katex && entry.name && typeof entry.name === 'string') {
              try {
                return <span dangerouslySetInnerHTML={{ __html: window.katex.renderToString(entry.name) }} />;
              } catch(e) {}
            }
            return <span>{entry.name}</span>;
          };
          
          return (
            <div key={index} className="flex items-center gap-2 text-sm" style={{ color: entry.color }}>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></span>
              {renderName()}: <span className="font-mono ml-1 font-semibold">{entry.value}</span>
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
    <ul className="flex items-center justify-end gap-4 mt-1 mb-2">
      {payload.map((entry, index) => {
        const renderText = () => {
          if (window.katex && entry.value && typeof entry.value === 'string') {
            try {
              return <span dangerouslySetInnerHTML={{ __html: window.katex.renderToString(entry.value) }} />;
            } catch(e) {}
          }
          return <span>{entry.value}</span>;
        };

        return (
          <li key={`item-${index}`} className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
            <span className="block w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
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

  // Custom tick formatter to render KaTeX in Axis ticks (via <foreignObject>)
  // Recharts XAxis tick supports React elements
  const CustomTickX = ({ x, y, payload }) => {
    let tickHtml = payload.value;
    if (window.katex && typeof payload.value === 'string') {
      try {
        tickHtml = window.katex.renderToString(payload.value);
      } catch (e) {}
    }
    return (
      <g transform={`translate(${x},${y})`}>
        <foreignObject x="-30" y="5" width="60" height="30" style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-center justify-center text-[11px] font-semibold text-slate-400 w-full h-full">
            <span dangerouslySetInnerHTML={{ __html: tickHtml }} />
          </div>
        </foreignObject>
      </g>
    );
  };

  const CustomTickY = ({ x, y, payload }) => {
    let tickHtml = payload.value;
    if (window.katex && typeof payload.value === 'string') {
      try {
        tickHtml = window.katex.renderToString(payload.value);
      } catch (e) {}
    }
    return (
      <g transform={`translate(${x},${y})`}>
        <foreignObject x="-40" y="-10" width="30" height="20" style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className="flex items-center justify-end text-[11px] font-semibold text-slate-400 w-full h-full pr-1">
            <span dangerouslySetInnerHTML={{ __html: tickHtml }} />
          </div>
        </foreignObject>
      </g>
    );
  };

  return (
    <div className="w-full my-4 border border-slate-700/60 rounded-xl overflow-hidden shadow-lg bg-slate-900/40 relative select-text">
      {/* Header */}
      <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-700/60 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
          <span className="text-amber-400">📈</span> {title}
        </span>
        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
          인터랙티브 차트
        </span>
      </div>

      <div className="p-4 w-full h-[320px] sm:h-[400px]">
        {/* Recharts Container */}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
            <XAxis 
              dataKey="x" 
              stroke="#64748b" 
              tick={<CustomTickX />} 
              label={{ 
                value: xAxisLabel, 
                position: 'bottom', 
                offset: 5, 
                fill: '#94a3b8',
                fontSize: 12,
                fontWeight: 'bold'
              }} 
            />
            <YAxis 
              stroke="#64748b" 
              tick={<CustomTickY />}
              label={{ 
                value: yAxisLabel, 
                angle: -90, 
                position: 'insideLeft', 
                offset: 10,
                fill: '#94a3b8',
                fontSize: 12,
                fontWeight: 'bold'
              }} 
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="top" align="right" content={<CustomLegend />} wrapperStyle={{ paddingBottom: '10px' }} />
            
            {plotLines.map((line, idx) => (
              <Line 
                key={idx}
                type="monotone" 
                dataKey={line.dataKey} 
                name={line.name}
                stroke={line.stroke} 
                strokeWidth={2.5}
                dot={{ r: 4, strokeWidth: 2, fill: '#0f172a' }}
                activeDot={{ r: 6, fill: line.stroke, stroke: '#fff', strokeWidth: 1.5 }}
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
