import { healLatexFormulas } from '../server/utils/latexUtils.js';

const testCases = [
  {
    name: "Hashtag healing and Nu recovery",
    input: "공식 $K_0 = #dfrac{ #nu}{1 - #nu}$ 입니다.",
    expected: "공식 $K_0 = \\dfrac{ \\nu}{1 - \\nu}$ 입니다."
  },
  {
    name: "Hex color code protection",
    input: "<span style=\"color:#cc0000\">공식 $K_0 = #dfrac{ #nu}{1 - #nu}$</span>",
    expected: "<span style=\"color:#cc0000\">공식 $K_0 = \\dfrac{ \\nu}{1 - \\nu}$</span>"
  },
  {
    name: "Inline math spacing with newlines",
    input: "식: $K_0 = \\frac{\n u}{\n 1 - u}$",
    expected: "식: $K_0 = \\frac{ u}{ 1 - u}$"
  },
  {
    name: "Lone dollar signs are not greedily matched across lines",
    input: "This has a lone $ symbol here.\nAnd a formula $K_0 = \\frac{u}{1-u}$ on the next line.",
    expected: "This has a lone $ symbol here.\nAnd a formula $K_0 = \\frac{u}{1-u}$ on the next line."
  }
];

let failed = false;
for (const tc of testCases) {
  const result = healLatexFormulas(tc.input);
  // Compare after normalizing spaces/newlines to check core content
  const normalizedResult = result.replace(/\s+/g, ' ').trim();
  const normalizedExpected = tc.expected.replace(/\s+/g, ' ').trim();
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

if (failed) {
  process.exit(1);
} else {
  console.log("ALL TESTS PASSED!");
}
