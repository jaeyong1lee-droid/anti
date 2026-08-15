// [Backup] 2026-08-15
// 이 파일은 ChartRenderer.jsx에서 사용되던 자체 미니 렌더러(renderMixedText)의 원본 백업입니다.
// 외부 렌더러(KaTeX)를 SVG <foreignObject> 내부에 적용했을 때 Safari 등 WebKit 브라우저에서 
// 분수 렌더링 레이아웃이 붕괴되는 버그가 심각하여 롤백이 필요할 경우, 이 코드를 다시 ChartRenderer.jsx로 복구하십시오.

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
    '\\leq': '≤', '\\geq': '≥', '\\pm': '±', '\\infty': '∞',
    '\\circ': '°', '\\degree': '°', '\\prime': '′', '\\rightarrow': '→', '\\leftarrow': '←'
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
  result = result.replace(/\^([a-zA-Z0-9_\u0370-\u03FF]+)/g, '<sup style="font-size: 0.75em; margin-left: 1px;">$1</sup>');

  // 5. Subscripts
  result = result.replace(/_\{([^{}]+)\}/g, '<sub style="font-size: 0.75em; margin-left: 1px;">$1</sub>');
  result = result.replace(/_([a-zA-Z0-9\u0370-\u03FF])/g, '<sub style="font-size: 0.75em; margin-left: 1px;">$1</sub>');

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
