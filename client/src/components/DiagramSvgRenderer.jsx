import React, { useMemo } from 'react';
import { renderKatexString } from '../utils/renderingHelpers';

export const renderMixedTextInSvg = (text) => {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (m, math) => {
    return renderKatexString(math.trim(), { displayMode: true, throwOnError: false });
  });
  result = result.replace(/\$([^\$\n]+)\$/g, (m, math) => {
    return renderKatexString(math.trim(), { displayMode: false, throwOnError: false });
  });
  return result;
};

export const transformSvgWithKatex = (svgStr) => {
  if (!svgStr || typeof svgStr !== 'string') return svgStr;

  let cleaned = svgStr.trim();
  // Strip markdown code fences if present
  cleaned = cleaned.replace(/^```[a-z]*\s*/im, '').replace(/```\s*$/im, '').trim();

  // Ensure wrapping svg tag
  if (!cleaned.toLowerCase().includes('<svg')) {
    cleaned = `<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">\n${cleaned}\n</svg>`;
  }

  // 1. Process math inside existing <foreignObject>
  cleaned = cleaned.replace(/(<foreignObject[\s\S]*?>)([\s\S]*?)(<\/foreignObject>)/gi, (match, openTag, content, closeTag) => {
    return `${openTag}${renderMixedTextInSvg(content)}${closeTag}`;
  });

  // 2. Convert <text> containing $...$ into <foreignObject>
  cleaned = cleaned.replace(/<text([^>]*)>([\s\S]*?)<\/text>/gi, (match, attrs, innerText) => {
    if (!innerText.includes('$') && !innerText.includes('\\(') && !innerText.includes('\\[')) {
      return match;
    }

    // Extract attributes
    const getAttr = (name) => {
      const m = attrs.match(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, 'i'));
      return m ? m[1] : null;
    };

    const xVal = parseFloat(getAttr('x') || '0') || 0;
    const yVal = parseFloat(getAttr('y') || '0') || 0;
    const fill = getAttr('fill') || '#e2e8f0';
    const fontSize = getAttr('font-size') || getAttr('fontSize') || '13px';
    const fontWeight = getAttr('font-weight') || getAttr('fontWeight') || 'normal';
    const textAnchor = (getAttr('text-anchor') || getAttr('textAnchor') || 'start').toLowerCase();
    const transform = getAttr('transform');

    const renderedHtml = renderMixedTextInSvg(innerText);

    const width = 300;
    const height = 40;
    let xOffset = xVal;
    let justifyContent = 'flex-start';
    let textAlign = 'left';

    if (textAnchor === 'middle' || textAnchor === 'center') {
      xOffset = xVal - width / 2;
      justifyContent = 'center';
      textAlign = 'center';
    } else if (textAnchor === 'end' || textAnchor === 'right') {
      xOffset = xVal - width;
      justifyContent = 'flex-end';
      textAlign = 'right';
    }

    const numericFontSize = parseFloat(fontSize) || 13;
    const yOffset = yVal - height / 2 - (numericFontSize * 0.1);

    const transformAttr = transform ? ` transform="${transform}"` : '';

    return `<foreignObject x="${xOffset}" y="${yOffset}" width="${width}" height="${height}"${transformAttr} style="overflow: visible; pointer-events: none;">
      <div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; align-items: center; justify-content: ${justifyContent}; width: 100%; height: 100%; color: ${fill}; font-size: ${fontSize}; font-weight: ${fontWeight}; line-height: 1.2; text-align: ${textAlign}; white-space: nowrap; pointer-events: auto;">
        <span>${renderedHtml}</span>
      </div>
    </foreignObject>`;
  });

  return cleaned;
};

const DiagramSvgRenderer = ({ svgStr }) => {
  const processedSvg = useMemo(() => transformSvgWithKatex(svgStr), [svgStr]);

  if (!svgStr) return null;

  return (
    <div 
      className="p-4 w-full flex justify-center items-center overflow-x-auto overflow-y-hidden custom-scrollbar [&>svg]:max-w-full [&>svg]:h-auto" 
      dangerouslySetInnerHTML={{ __html: processedSvg }} 
    />
  );
};

export default DiagramSvgRenderer;
