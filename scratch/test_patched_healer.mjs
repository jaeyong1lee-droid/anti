import { healLatexFormulas } from '../server/utils/latexUtils.js';

const testCase1 = `Gouy - Chapman 이론에 근거하여 이중층 두께 t 와 지반공학적 특성 변화를 올바르게 설명한 것은 무엇인가? <table border="1" style="border-collapse: collapse; width: 100%; text-align: center;"><tr><th style="padding: 8px;">구분</th><th style="padding: 8px;">점토 지반 X</th><th style="padding: 8px;">점토 지반 Y</th></tr><tr><td style="padding: 8px;">퇴적 환경</td><td style="padding: 8px;">해수 환경 (고농도 전해질)</td><td style="padding: 8px;">담수 환경 (저농도 전해질)</td></tr></table>`;

const testCase2 = `다음 표는 비교표입니다. 빈칸 [INPUT_1], [INPUT_2] 에 들어갈 내용을 알맞게 서술하시오.

<table border="1">
  <tr>
    <th>구분 항목</th>
    <th>생석회 개량 전</th>
    <th>생석회 개량 후</th>
  </tr>
  <tr>
    <td>확산이중층 두께 t</td>
    <td>[INPUT_1]</td>
    <td>[INPUT_2]</td>
  </tr>
</table>`;

console.log("=== TEST CASE 1 ===");
const healed1 = healLatexFormulas(testCase1);
console.log("HEALED 1:", healed1);
console.log("IS INTACT:", healed1.includes('<table border="1" style="border-collapse: collapse; width: 100%; text-align: center;">'));

console.log("\n=== TEST CASE 2 ===");
const healed2 = healLatexFormulas(testCase2);
console.log("HEALED 2:", healed2);
console.log("INPUT 1 OK:", healed2.includes('[INPUT_1]'));
console.log("INPUT 2 OK:", healed2.includes('[INPUT_2]'));
