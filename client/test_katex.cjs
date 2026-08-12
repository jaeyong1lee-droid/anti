const katex = require('katex');
const fs = require('fs');

const html = `<html>
<head><link rel="stylesheet" href="node_modules/katex/dist/katex.min.css"></head>
<body style="font-size: 10px; background: #0f172a; color: white;">
<div>1. \\frac{t}{S}: ${katex.renderToString('\\frac{t}{S}', {throwOnError: false})}</div>
<div>2. \\frac{t}{,S}: ${katex.renderToString('\\frac{t}{,S}', {throwOnError: false})}</div>
<div>3. \\frac{t}{_S}: ${katex.renderToString('\\frac{t}{_S}', {throwOnError: false})}</div>
<div>4. t /_ S: ${katex.renderToString('t /_ S', {throwOnError: false})}</div>
<div>5. \\frac{t}{S_t}: ${katex.renderToString('\\frac{t}{S_t}', {throwOnError: false})}</div>
<div>6. \\frac{t}{, S}: ${katex.renderToString('\\frac{t}{, S}', {throwOnError: false})}</div>
<div>7. \\frac{t}{\\, S}: ${katex.renderToString('\\frac{t}{\\, S}', {throwOnError: false})}</div>
</body>
</html>`;
fs.writeFileSync('test_katex.html', html);
