import { 
  healLatexFormulas, 
  healQuizQuestionObject, 
  healTheoryQuestionObject, 
  healFormulaQuestionObject, 
  healAnswersheetQuestionObject 
} from '../server/utils/latexUtils.js';

const testCases = [
  {
    name: "Hashtag healing and Nu recovery",
    input: "공식 $K_0 = #dfrac{ #nu}{1 - #nu}$ 입니다.",
    expected: "공식 $K_0 = \\dfrac{\\nu}{1 - \\nu}$ 입니다."
  },
  {
    name: "Hex color code protection",
    input: "<span style=\"color:#cc0000\">공식 $K_0 = #dfrac{ #nu}{1 - #nu}$</span>",
    expected: "<span style=\"color:#cc0000\">공식 $K_0 = \\dfrac{\\nu}{1 - \\nu}$</span>"
  },
  {
    name: "Inline math spacing with newlines",
    input: "식: $K_0 = \\frac{\n u}{\n 1 - u}$",
    expected: "식: $K_0 = \\frac{\\nu}{1 - \\nu}$"
  },
  {
    name: "Lone dollar signs are not greedily matched across lines",
    input: "This has a lone $ symbol here.\nAnd a formula $K_0 = \\frac{u}{1-u}$ on the next line.",
    expected: "This has a lone $ symbol here.\nAnd a formula $K_0 = \\frac{\\nu}{1-\\nu}$ on the next line."
  },
  {
    name: "HTML tags (br and div) to markdown conversion",
    input: "라인1<br>라인2<br/>라인3<br />라인4<div style=\"color:#ffffff\">• 침투유량</div>",
    expected: "라인1\n\n라인2\n\n라인3\n\n라인4\n\n* 침투유량"
  },
  {
    name: "Stuck bullet points separation",
    input: "단위폭당침투유량*k: 흙의투수계수*H: 전수두차",
    expected: "단위폭당침투유량\n\n* $k$: 흙의투수계수\n\n* $H$: 전수두차"
  },
  {
    name: "Stray dollar symbols stripping",
    input: "변수 N_d$: 등수선 낙차 수",
    expected: "변수 $N_d$: 등수선 낙차 수"
  },
  {
    name: "u-to-nu conversion inside math blocks",
    input: "공식 $K_0 = \\dfrac{u}{1 - u}$",
    expected: "공식 $K_0 = \\dfrac{\\nu}{1 - \\nu}$"
  },
  {
    name: "Recursive deep healer for custom keys",
    isDeep: true,
    input: {
      question: "질문",
      custom_key: "공식 $K_0 = #dfrac{ #nu}{1 - #nu}$",
      nested: {
        another_custom: "침투유량*k: 흙의투수계수"
      }
    },
      expected: {
        question: "질문",
        custom_key: "공식 $K_0 = \\dfrac{\\nu}{1 - \\nu}$",
        nested: {
          another_custom: "침투유량\n\n* $k$: 흙의투수계수"
        }
      }
    },
    {
      name: "Geotechnical subscripts preservation (c_u, sigma_u, E_u)",
      input: "점착력 c_u 와 응력 \\sigma_u, 탄성계수 E_u",
      expected: "점착력 $c_u$ 와 응력 $\\sigma_u,$ 탄성계수 $E_u$"
    },
    {
      name: "Geotechnical subscripts preservation in block-math",
      input: "$$c_u = 10$$",
      expected: "$$c_u = 10$$"
    },
    {
      name: "Pore water pressure u preservation in formulas",
      input: "\\sigma' = \\sigma - u 및 \\tau_f = c' + (\\sigma - u) \\tan\\phi'",
      expected: "$$\\sigma' = \\sigma - u$$\n\n및 $\\tau_f = c' + (\\sigma - u) \\tan\\phi'$"
    },
    {
      name: "Pore water pressure u preservation in Korean context",
      input: "간극수압(u)이 증가하면 유효응력은 감소한다.",
      expected: "간극수압 (u) 이 증가하면 유효응력은 감소한다."
    }
  ];

let failed = false;
for (const tc of testCases) {
  if (tc.isDeep) {
    const result = healQuizQuestionObject(tc.input);
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
  console.log("ALL MASTER TESTS PASSED!");
}
