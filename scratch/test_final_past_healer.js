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

const tempModuleFile = path.join(__dirname, 'temp_final_past_module.js');
fs.writeFileSync(tempModuleFile, runCode);
const { healLatexFormulas } = require(tempModuleFile);
fs.unlinkSync(tempModuleFile);

// Raw text from screenshot
const rawInput = `\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2} 여기서,
* u: 과잉간극수압 (kN/m^2)
* t: 시간 (s)
* z: 배수 거리 (m)
* c_v : 압밀계수 (m^2/s)
이때 압밀계수 c_v는 다음과 같이 정의됩니다. c_v = \\frac{k}{\\gamma_w m_v} = \\frac{k \\cdot E_v}{\\gamma_w}
(k: 투수계수, \\gamma_w: 물의 단위중량, m_v: 체적압축계수, E_v: 압축계수)
### 3. 압밀도 (U) 와 시간계수 (T_v) 의 관계
지배방정식을 경계조건에 따라 풀이하면, 시간 t에서의 평균 압밀도 (U) 와 시간계수 (T_v) 의 관계식을 얻을 수 있습니다.
* **시간계수 (T_v):**
T_v = \\frac{c_v \\cdot t}{H_d^2}
(H_d : 최대 배수거리, 양면 배수 시 H/2, 단면 배수 시 H)
* **압밀도 (U) 와 시간계수 (T_v) 의 관계:**
- U < 60% 일 때: T_v = \\frac{\\pi}{4} U^2
- U \\ge 60% 일 때: T_v = 1.781 - 0.933 \\log(100 - U%)
### 4. 실무적 시사점 및 기술사적 고찰`;

const testInput1 = `* **시간계수 (T_v)**: 무차원 시간 변수로, $T_v = \\frac{c_v t}{H_d^2} (단, H_d 는 배수거리)`;

console.log("=== FINAL PAST HEALER OUTPUT 1 ===");
console.log(healLatexFormulas(rawInput));

console.log("\n=== FINAL PAST HEALER OUTPUT 2 ===");
console.log(healLatexFormulas(testInput1));


