import { healLatexFormulas } from './src/utils/latexUtils.js';

const input = 'K = \\dfrac{\\text{ 하중 }}{\\text{ 침하량}}';
const result = healLatexFormulas(input);
console.log('Original:', input);
console.log('Healed:', result);
