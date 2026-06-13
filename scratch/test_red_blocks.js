const fs = require('fs');
const path = require('path');

const pastHealerFile = path.join(__dirname, 'past_healer.js');
const pastHealerContent = fs.readFileSync(pastHealerFile, 'utf8');

// Load current server index.js to get tokenizeForHealing
const serverFile = path.join(__dirname, '..', 'server', 'index.js');
const serverContent = fs.readFileSync(serverFile, 'utf8');
const lines = serverContent.split('\n');
const tokenizeLineIndex = lines.findIndex(l => l.includes('function tokenizeForHealing('));
const tokenizeForHealingCode = lines.slice(tokenizeLineIndex, lines.findIndex(l => l.includes('function healLatexFormulas('))).join('\n');

const runCode = `
${tokenizeForHealingCode}
${pastHealerContent}
module.exports = { tokenizeForHealing, healLatexFormulas };
`;

const tempModuleFile = path.join(__dirname, 'temp_red_module.js');
fs.writeFileSync(tempModuleFile, runCode);
const { healLatexFormulas } = require(tempModuleFile);
fs.unlinkSync(tempModuleFile);

// Test inputs reflecting the red blocks from the screenshot (already corrupted in DB)
const testInput1 = `이를 앞서 구한 연속방정식의 좌변에 대입하여 z 에 대해 한 번 더 미분하면 다음과 같습니다.

- \\frac{\\partial v_z}{\\partial z} = \\frac{k}{\\gamma_w} \\frac{\\partial^2 u}{\\partial z^2}$따라서, 흐름과 체적 변화의 관계식은 다음과 같이 정리됩니다.$\\frac{k}{\\gamma_w} \\frac{\\partial^2 u}{\\partial z^2} = \\frac{1}{1 + e_0} \\frac{\\partial e}{\\partial t}`;

const testInput2 = `이를 시간 t 에 대해 미분하면 다음과 같습니다.

\\frac{\\partial e}{\\partial t} = a_v \\frac{\\partial u}{\\partial t}$이 식을 단계 2.3의 최종 관계식 우변에 대입합니다.$\\frac{k}{\\gamma_w} \\frac{\\partial^2 u}{\\partial z^2} = \\frac{a_v}{1 + e_0} \\frac{\\partial u}{\\partial t}`;

const testInput3 = `정리됩니다.$\\frac{k}{\\gamma_w}$이 식은`;

console.log("=== TEST INPUT 1 HEALED ===");
console.log(healLatexFormulas(testInput1));

console.log("\n=== TEST INPUT 2 HEALED ===");
console.log(healLatexFormulas(testInput2));

console.log("\n=== TEST INPUT 3 HEALED ===");
console.log(healLatexFormulas(testInput3));
