import { robustJSONParse } from './server/plugins/gradingPlugin.js';

console.log("=== 테스트 1: 숫자형 점수 정상 처리 ===");
const input1 = '{"isCorrect": false, "score": 7, "reason": "숫자 점수 테스트"}';
const result1 = robustJSONParse(input1);
console.log("입력:", input1);
console.log("출력 score:", result1.score);
console.log("성공 여부:", result1.score === 7 ? "PASS" : "FAIL");

console.log("\n=== 테스트 2: 단순 문자열 점수 (예: '5') ===");
const input2 = '{"isCorrect": false, "score": "5", "reason": "문자열 5점"}';
const result2 = robustJSONParse(input2);
console.log("입력:", input2);
console.log("출력 score:", result2.score);
console.log("성공 여부:", result2.score === 5 ? "PASS" : "FAIL");

console.log("\n=== 테스트 3: 혼합 문자열 점수 (예: '7점(부분)') ===");
const input3 = '{"isCorrect": false, "score": "7점(부분)", "reason": "혼합 문자열"}';
const result3 = robustJSONParse(input3);
console.log("입력:", input3);
console.log("출력 score:", result3.score);
console.log("성공 여부:", result3.score === 7 ? "PASS" : "FAIL");

console.log("\n=== 테스트 4: 점수 누락 시 Fallback ===");
const input4 = '{"isCorrect": false, "reason": "점수 없음"}';
const result4 = robustJSONParse(input4);
console.log("입력:", input4);
console.log("출력 score:", result4.score);
console.log("성공 여부:", result4.score === 0 ? "PASS" : "FAIL");
