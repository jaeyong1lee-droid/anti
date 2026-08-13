const katex = require('katex');

const html = katex.renderToString('t/S', { throwOnError: false, strict: 'ignore' });
console.log("KaTeX t/S HTML:\n", html);

const html2 = katex.renderToString('t/S_t', { throwOnError: false, strict: 'ignore' });
console.log("\nKaTeX t/S_t HTML:\n", html2);

const html3 = katex.renderToString('\\frac{t}{S_t}', { throwOnError: false, strict: 'ignore' });
console.log("\nKaTeX \\frac{t}{S_t} HTML:\n", html3);

