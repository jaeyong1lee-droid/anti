const fs = require('fs');
let code = fs.readFileSync('client/src/utils/latexUtils.js', 'utf8');

const finalScript = `
${code.replace('export function healLatexFormulas', 'function healLatexFormulas').replace(/export function/g, 'function')}

const text = '특히 $\\sqrt{$ $\\sqrt{\\dots}$ $}$ 내부의 분모($V_2 - V_1$)와 분자($V_2 + V_1$) 형태는';
console.log('Original:', text);

let lastText = text;
const P = new Proxy(String.prototype, {
  get(target, prop) {
    if (prop === 'replace') {
      return function(...args) {
        const res = target.replace.apply(this, args);
        if (this.valueOf() !== res) {
          console.log('replace changed:', res);
        }
        return res;
      };
    }
    return target[prop];
  }
});

// Since String is primitive, we can't easily proxy it.
// Let's just override String.prototype.replace temporarily!
const origReplace = String.prototype.replace;
String.prototype.replace = function(...args) {
  const res = origReplace.apply(this, args);
  if (this.valueOf() !== res && res.includes('$$')) {
    // console.log('Replaced to:', res, '\\nUsing args:', args);
  }
  return res;
};

// Wait, doing this globally is easier:
let currentString = text;
let logs = [];
const orig = String.prototype.replace;
String.prototype.replace = function(...args) {
  const res = orig.apply(this, args);
  if (this.valueOf() !== res) {
    logs.push({ from: this.valueOf(), to: res, args: args });
  }
  return res;
};

let output = healLatexFormulas(text);
String.prototype.replace = orig;

for (const log of logs) {
  if (log.from.includes('특히') || log.to.includes('특히')) {
    if (log.from !== log.to) {
      console.log('--- CHANGE ---');
      console.log('TO:  ', log.to);
      console.log('ARGS:', log.args[0].toString());
    }
  }
}
console.log('Final:', output);
`;

fs.writeFileSync('proxy_test.js', finalScript);
