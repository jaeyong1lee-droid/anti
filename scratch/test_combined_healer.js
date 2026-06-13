const fs = require('fs');
const path = require('path');

// Load current server index.js
const serverFile = path.join(__dirname, '..', 'server', 'index.js');
let code = fs.readFileSync(serverFile, 'utf8');

// Apply Fix 1: Modify formulaPattern to horizontal space and include =
code = code.replace(
  /const formulaPattern = \/.*\/g;/,
  `const formulaPattern = /((?:\\\\?[a-zA-Z_0-9']+(?:_[a-zA-Z0-9{}]+)?[ \\t]*[<>=]+[ \\t]*[a-zA-Z0-9'_ \\t\\-+\\/{}\\(\\)\\[\\],.\\\\/<>=:;!?^~&|%]*[a-zA-Z0-9'\\)\\}]))/g;`
);

// Apply Fix 2: Modify Rule 1.5 to check for Korean characters
const oldRule15 = `  // STEP 1.5: 괄호 안의 LaTeX 명령어/그리스 변수 감싸기
  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;
      t = t.replace(/\\(([^)$]*?(?:\\\\gamma|\\\\sigma|\\\\theta|\\\\phi|\\\\alpha|\\\\beta|\\\\frac|\\\\delta|\\\\Delta|_[a-zA-Z0-9{])[^)$]*?)\\)/g, (match, p1) => {
        if (p1.includes('\\\\left') || p1.includes('\\\\right')) {
          return match;
        }
        return '($' + p1.trim() + '$)';
      });
      token.content = t;
    }
  });`;

const newRule15 = `  // STEP 1.5: 괄호 안의 LaTeX 명령어/그리스 변수 감싸기
  tokens.forEach(token => {
    if (token.type === 'text') {
      let t = token.content;
      t = t.replace(/\\(([^)$]*?(?:\\\\gamma|\\\\sigma|\\\\theta|\\\\phi|\\\\alpha|\\\\beta|\\\\frac|\\\\delta|\\\\Delta|_[a-zA-Z0-9{])[^)$]*?)\\)/g, (match, p1) => {
        if (p1.includes('\\\\left') || p1.includes('\\\\right')) {
          return match;
        }
        if (/[\\uAC00-\\uD7A3]/.test(p1)) {
          return match;
        }
        return '($' + p1.trim() + '$)';
      });
      token.content = t;
    }
  });`;

// We will do normalized checks to make sure line endings don't break string matches
const normCode = code.replace(/\r\n/g, '\n');
const normOldRule = oldRule15.replace(/\r\n/g, '\n');
const normNewRule = newRule15.replace(/\r\n/g, '\n');

if (normCode.includes(normOldRule)) {
  code = normCode.replace(normOldRule, normNewRule);
} else {
  console.log("Could not find exact STEP 1.5 block in server/index.js, using RegExp.");
  code = code.replace(
    /t = t\.replace\(\/\\\\\(\(\[\^\)\$\]\*\?\(\?:\\\\\\\\gamma[\s\S]*?return '\(\$' \+ p1\.trim\(\) \+ '\$\)';\s*\}\);\r?\n\s*token\.content = t;/g,
    `t = t.replace(/\\(([^)$]*?(?:\\\\\\\\gamma|\\\\\\\\sigma|\\\\\\\\theta|\\\\\\\\phi|\\\\\\\\alpha|\\\\\\\\beta|\\\\\\\\frac|\\\\\\\\delta|\\\\\\\\Delta|_[a-zA-Z0-9{])[^)$]*?)\\)/g, (match, p1) => {
        if (p1.includes('\\\\\\\\left') || p1.includes('\\\\\\\\right')) {
          return match;
        }
        if (/[\\\\uAC00-\\\\uD7A3]/.test(p1)) {
          return match;
        }
        return '($' + p1.trim() + '$)';
      });
      token.content = t;`
  );
}

// Slice the functions to test in memory
const lines = code.split('\n');
const tokenizeLineIndex = lines.findIndex(l => l.includes('function tokenizeForHealing('));
const healLineIndex = lines.findIndex(l => l.includes('function healLatexFormulas('));
const healEndLineIndex = lines.findIndex((l, idx) => idx > healLineIndex && l.includes('return result;')) + 1;

const tokenizeForHealingCode = lines.slice(tokenizeLineIndex, healLineIndex).join('\n');
const healLatexFormulasCode = lines.slice(healLineIndex, healEndLineIndex + 1).join('\n');

const runCode = `
${tokenizeForHealingCode}
${healLatexFormulasCode}
module.exports = { tokenizeForHealing, healLatexFormulas };
`;

const tempModuleFile = path.join(__dirname, 'temp_combined_module.js');
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

const testInput1 = `* **물리적 기전**: 지반의 내부마찰각 (
ϕ
ϕ) 이 클수록 흙 입자 간의 전단 저항력이 커지며, 이는 하중을 주변 지반으로 전이 (Stress Transfer) 시키는 능력을 강화합니다. 따라서 $\\phi 가 증가할수록 주변으로 전이되는 응력은 커지고, 결과적으로 하부의 잔류 연직 응력 (\\sigma_v$) 은 지수함수적으로 감소하게 됩니다.
### 2. 테르자기의 연직 응력 지배방정식
테르자기는 폭 B 인 트랩도어 상부의 연직 응력 (\\sigma_v) 을 다음과 같은 비선형 미분방정식의 해로 제시하였습니다.
\\sigma_v$ = \\frac{B(\\gamma$ - \\frac{c}{B})}{K \\tan $\\phi$} (1 - e^{-K \\tan $\\phi$ \\frac{z}{B}}) + q e^{-K \\tan $\\phi$ \\frac{z}{B}}$**[변수 설명]***
\\sigma_v$: 깊이 z 에서의 연직 응력
* \\gamma: 흙의 단위중량
* c: 흙의 점착력
* B: 이완 영역 of폭 (트랩도어 폭)
* K: 토압계수 (수평/연직 응력비)
*
\\phi$: 흙의 내부마찰각* q: 지표면 상`;

console.log("=== COMBINED HEALER OUTPUT 1 (rawInput) ===");
console.log(healLatexFormulas(rawInput));

console.log("\n=== COMBINED HEALER OUTPUT 2 (testInput1) ===");
console.log(healLatexFormulas(testInput1));
