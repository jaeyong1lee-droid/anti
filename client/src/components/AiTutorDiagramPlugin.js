// ============================================================================
// 🎨 Master AI Tutor Diagram Orchestrator
// (Imports 3 Isolated Standalone Plugins - Zero side-effects on existing KaTeX)
// ============================================================================

import { renderAiTutorSvg } from './plugins/AiTutorSvgPlugin.js';
import { renderAiTutorMermaid } from './plugins/AiTutorMermaidPlugin.js';
import { renderAiTutorTikz } from './plugins/AiTutorTikzPlugin.js';

export function processAiTutorDiagrams(text) {
  if (!text || typeof text !== 'string') return text || '';
  
  let processed = text;

  // 1. Isolated SVG Plugin
  processed = renderAiTutorSvg(processed);

  // 2. Isolated TikZ Plugin
  processed = renderAiTutorTikz(processed);

  // 3. Isolated Mermaid Plugin
  processed = renderAiTutorMermaid(processed);

  return processed;
}
