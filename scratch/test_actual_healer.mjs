import { healFormulaQuestionObject } from '../client/src/utils/latexUtils.js';

const mockQuestion = {
  title: "유망망 침투유량 산정식 (Seepage Discharge by Flow Net)",
  question: "유망망 침투유량 산정식 (Seepage Discharge by Flow Net)",
  concept: "유망망의 기하학적 특성을 이용하여 흙 속을 흐르는 단위 폭당 침투유량을 산정하는 공식입니다.",
  formula: "$Q = k #cdot H #cdot #dfrac{N_f}{N_d}\n\n* Q : 단위폭당침투유량*k: 흙의 투수계수\n\n* H : 상.하류측의전수두차*N_d$: 등수두선 낙차 수",
  structure: "1. 유망망의 격자 요소별 압력강하 비율 분석\n2. 침투수량 공식 유도"
};

const healed = healFormulaQuestionObject(mockQuestion);
console.log("=== HEALED OBJECT ===");
console.log(JSON.stringify(healed, null, 2));
