import { 
  healLatexFormulas, 
  healDeep 
} from '../server/utils/latexUtils.js';

const testCases = [
  {
    name: "Standard inline math tokenizer",
    input: "공식 $K_0 = \\frac{nu}{1 - nu}$ 입니다.",
    expected: "공식 $K_0 = \\frac{\\nu}{1 - \\nu}$ 입니다."
  },
  {
    name: "Backslash recovery for Greek symbols and functions",
    input: "알파 alpha, 베타 beta, 시그마 sigma, 로그 log x, 사인 sin(theta)",
    expected: "알파 $\\alpha,$ 베타 $\\beta,$ 시그마 $\\sigma,$ 로그 $\\log x,$ 사인 $\\sin(\\theta)$"
  },
  {
    name: "Verify that raw formula chunks inside text tokens are wrapped ONLY in inline math ($), never display math ($$)",
    input: "여기서 frac{a}{b} 와 log(p) 가 존재한다.",
    expected: "여기서 $\\frac{a}{b}$ 와 $\\log(p)$ 가 존재한다."
  },
  {
    name: "HTML tags cleanup and markdown conversion",
    input: "문장 시작<br>두번째 줄<div class=\"some-class\">• 침투량</div>",
    expected: "문장 시작\n\n두번째 줄\n\n* 침투량"
  },
  {
    name: "Postposition spacing normalization (한글/숫자와 수식 간 공백 강제)",
    input: "공식$x+y=z$은 중요합니다. $a=b$가 성립한다.",
    expected: "공식 $x+y=z$ 은 중요합니다. $a=b$ 가 성립한다."
  },
  {
    name: "Single newline merging inside sentence / formula, while keeping bullet points and headers",
    input: "수식: \\frac{\\partial\n u}{\\partial t} = c_v \\frac{\\partial^2\n u}{\\partial z^2}\n\n### 제목\n\n* 리스트\n단일 줄바꿈\n테스트",
    expected: "수식: $\\frac{\\partial u}{\\partial t} = c_v \\frac{\\partial^2 u}{\\partial z^2}$\n\n### 제목\n\n* 리스트 단일 줄바꿈 테스트"
  },
  {
    name: "Subscript and superscript spacing cleanup",
    input: "식: q_ u = c N_ c + q N_ q + 0.5 \\gamma B N_\\gamma",
    expected: "식: $q_u = c N_c + q N_q + 0.5 \\gamma B N_\\gamma$"
  },
  {
    name: "Forcing paragraph breaks before dividers * * * and ***",
    input: "증가합니다.* * * 연직응력의 감쇄",
    expected: "증가합니다.\n\n* * * 연직응력의 감쇄"
  },
  {
    name: "Object deep healer",
    isDeep: true,
    input: {
      title: "문제 1",
      question: "공식 frac{a}{b} 은?",
      nested: {
        description: "log(x) 와 theta 를 구하시오."
      }
    },
    expected: {
      title: "문제 1",
      question: "공식 $\\frac{a}{b}$ 은?",
      nested: {
        description: "$\\log(x)$ 와 $\\theta$ 를 구하시오."
      }
    }
  }
];

let failed = false;
for (const tc of testCases) {
  if (tc.isDeep) {
    const result = healDeep(tc.input);
    const resultStr = JSON.stringify(result).replace(/\s+/g, '');
    const expectedStr = JSON.stringify(tc.expected).replace(/\s+/g, '');
    if (resultStr !== expectedStr) {
      console.error(`FAIL: ${tc.name}`);
      console.error(`  Expected: ${JSON.stringify(tc.expected)}`);
      console.error(`  Got:      ${JSON.stringify(result)}`);
      failed = true;
    } else {
      console.log(`PASS: ${tc.name}`);
    }
  } else {
    const result = healLatexFormulas(tc.input);
    const normalizedResult = result.replace(/\s+/g, '').trim();
    const normalizedExpected = tc.expected.replace(/\s+/g, '').trim();
    if (normalizedResult !== normalizedExpected) {
      console.error(`FAIL: ${tc.name}`);
      console.error(`  Input:    ${tc.input}`);
      console.error(`  Expected: ${tc.expected}`);
      console.error(`  Got:      ${result}`);
      failed = true;
    } else {
      console.log(`PASS: ${tc.name}`);
    }
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("ALL COMPACT HEALER TESTS PASSED!");
}
