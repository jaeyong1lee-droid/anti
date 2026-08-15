const katex = require('katex');
try {
  const result = katex.renderToString('\\frac{A}{\\driving Force}', { throwOnError: false });
  console.log('Result for \\driving Force:');
  console.log(result);
} catch (e) {
  console.error(e);
}
try {
  const result2 = katex.renderToString('\\frac{A}{#driving Force}', { throwOnError: false });
  console.log('\nResult for #driving Force:');
  console.log(result2);
} catch (e) {
  console.error(e);
}
