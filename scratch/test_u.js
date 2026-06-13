function healMathToken(math, overallText = "") {
  let temp = math;

  // 1. Protect pore pressure u if math contains sigma/tau/P_w, or if overallText mentions geotech pore pressure terms
  const isPorePressureContext = 
    /\\sigma|\\tau|P_w/i.test(math) || 
    (/(간극수압|유효응력|전단강도|피압|수압|테르자기)/.test(overallText) && /^\s*u\s*$/.test(math));

  if (isPorePressureContext) {
    // Mask u in contexts of pore pressure: e.g., \sigma - u -> \sigma - __PORE_U__
    // We target 'u' as a word boundary, but only if not preceded by alphabetical/backslash/underscore
    // Wait, if it is pore pressure, we want to protect all standalone 'u's in this math token.
    temp = temp.replace(/(?<![a-zA-Z\\_])u\b/g, '__PORE_U__');
  }

  // 2. Perform Poisson's ratio u -> \nu replacement
  temp = temp.replace(/(?<![a-zA-Z\\_])u\b/g, '\\nu');

  // 3. Restore protected pore pressure u
  if (isPorePressureContext) {
    temp = temp.replace(/__PORE_U__/g, 'u');
  }

  return temp;
}

const testCases = [
  { math: "c_u", text: "비배수 점착력 c_u" },
  { math: "\\sigma_u", text: "비배수 응력 \\sigma_u" },
  { math: "E_u", text: "비배수 탄성계수 E_u" },
  { math: "u = 0.3", text: "포아송비 u = 0.3" },
  { math: "K_0 = \\dfrac{u}{1-u}", text: "정지토압계수 공식" },
  { math: "\\sigma' = \\sigma - u", text: "유효응력 공식" },
  { math: "u", text: "간극수압(u)이 상승하여" },
  { math: "\\tau_f = c' + (\\sigma - u) \\tan\\phi'", text: "전단강도 공식" }
];

testCases.forEach(tc => {
  const result = healMathToken(tc.math, tc.text);
  console.log(`Input: [${tc.math}] in context [${tc.text}]`);
  console.log(`  =>  [${result}]`);
});
