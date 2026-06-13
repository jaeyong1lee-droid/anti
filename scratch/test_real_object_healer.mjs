import { healQuizQuestionObject } from '../server/utils/latexUtils.js';

const mockQ = {
  type: "객관식",
  question: `Gouy – Chapman 이론에 근거하여 이중층 두께 t 와 지반공학적 특성 변화를 올바르게 설명한 것은 무엇인가? < tableborder = "1"style = "border – collapse: collapse; width: 100%; text – align: center;">< tr >< thstyle = "padding: 8px;">구분 < /th >< thstyle = "padding: 8px;">점토 지반 X < /th >< thstyle = "padding: 8px;">점토 지반 Y < /th >< /tr >< tr >< tdstyle = "padding: 8px;">퇴적 환경 < /td >< tdstyle = "padding: 8px;">해수 환경 (고농도 전해질 ) < /td >< tdstyle = "padding: 8px;">담수 환경 (저농도 전해질 ) < /td >< /tr >< /table >`,
  tableData: null
};

console.log("=== BEFORE HEAL ===");
console.log(mockQ);

const healed = healQuizQuestionObject(mockQ);
console.log("\n=== AFTER HEAL ===");
console.log(JSON.stringify(healed, null, 2));
