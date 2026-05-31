const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server', 'index.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

// Extract the healLatexFormulas function from serverContent
const funcStart = serverContent.indexOf('function healLatexFormulas(text) {');
let braceCount = 0;
let funcEnd = -1;
let started = false;

for (let i = funcStart; i < serverContent.length; i++) {
  if (serverContent[i] === '{') {
    braceCount++;
    started = true;
  } else if (serverContent[i] === '}') {
    braceCount--;
  }
  
  if (started && braceCount === 0) {
    funcEnd = i + 1;
    break;
  }
}

const funcCode = serverContent.substring(funcStart, funcEnd);
console.log("=== Patched Function Code ===");
console.log(funcCode);

// Evaluate it
const healLatexFormulas = new Function('text', funcCode + '; return healLatexFormulas(text);');

const texts = [
  "- **① \\\\phi< \\\\alpha_p < \\\\alpha_f**",
  "- **② \\\\alpha_f < \\\\alpha_p < phi**",
  "- **③ \\\\alpha_p > \\\\alpha_f > phi**",
  "- **④ \\\\alpha_p < \\\\phi < \\\\alpha_f**",
  "불연속면 경사(\\\\alpha_p)가 내부마찰각(phi)보다 커서",
  "사면 경사(\\\\alpha_f)보다 작아",
  "평면파괴는 ① 불연속면 경사가 사면 경사보다 완만해야 사면 전면으로 노출되고(\\alpha_p < \\alpha_f), ② 불연속면 경사가 마찰각보다 급해야 마찰 저항을 이겨내고 미끄러지므로(\\alpha_p > \\phi) '\\phi < \\alpha_p < \\alpha_f' 조건이 만족되어야 합니다.",
  "\\phi = 0 이면",
  "c = 0 이고",
  "\\sigma' = \\sigma - P_w",
  "\\sigma' = \\sigma - u"
];

console.log("\n=== Testing Patched healLatexFormulas ===");
texts.forEach((t, i) => {
  console.log(`\n--- Test ${i+1} ---`);
  console.log("Original:", t);
  console.log("Healed:  ", healLatexFormulas(t));
});
