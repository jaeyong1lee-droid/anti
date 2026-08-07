
  const { healLatexFormulas } = require('./client/src/utils/latexUtils_debug.js');
  const text = '특히 $\sqrt{$ $\sqrt{\dots}$ $}$ 내부의 분모($V_2 - V_1$)와 분자($V_2 + V_1$) 형태는';
  console.log('Final:', healLatexFormulas(text));
