function cleanAndSanitizeMathText(rawText) {
  let cleaned = rawText;
  cleaned = cleaned.replace(/\$([^\$]+?)\$/g, (m, math) => {
    if (/[\uAC00-\uD7A3]/.test(math)) {
      const isRealFormula = /\\/.test(math) || /_/.test(math) || /\^/.test(math) || /[=+\-\*\/]/.test(math) || /\\cdot/.test(math);
      if (!isRealFormula) {
        return math.trim();
      }
    }
    return m;
  });
  return cleaned;
}

console.log("Inline Korean:", cleanAndSanitizeMathText("보이는 $완전 탄소성체$ 로"));
console.log("Inline Math:", cleanAndSanitizeMathText("공식 $q_u = c N_c$ 입니다"));
console.log("Block Math:", cleanAndSanitizeMathText("공식은 $$q_u = c N_c$$ 입니다"));
console.log("Korean Math:", cleanAndSanitizeMathText("공식 $지반\\ 단위중량\\ \\gamma = 18\\ kN/m^3$ 입니다"));
