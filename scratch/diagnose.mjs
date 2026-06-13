import { healLatexFormulas } from '../client/src/utils/latexUtils.js';

const text1 = `$K_0 = #dfrac{ u}{1 - u}\n\n* K_0 : 정지토압계수(Coefficientofearthpressureatrest)*\n\nu$: 흙의 포아송 비 (Poisson's ratio of soil)`;
const text2 = `$Q = k #cdot H #cdot #dfrac{N_f}{N_d}\n\n* Q : 단위폭당침투유량*k: 흙의 투수계수\n\n* H : 상.하류측의전수두차*N_d$: 등수두선 낙차 수`;

console.log("=== Text 1 ===");
console.log(healLatexFormulas(text1));
console.log("=== Text 2 ===");
console.log(healLatexFormulas(text2));
