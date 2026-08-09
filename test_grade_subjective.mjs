import { gradeSubjective } from './server/plugins/gradingPlugin.js';

async function runTests() {
  const mockCallLLM = (text) => async () => text;

  console.log("=== 테스트 1: 숫자형 점수 정상 처리 ===");
  const res1 = await gradeSubjective({
    userAnswer: '테스트',
    correctAnswer: '테스트',
    callLLMWithFailover: mockCallLLM('{"isCorrect": false, "score": 7, "reason": "숫자"}')
  });
  console.log("출력 score:", res1.score);
  console.log("성공 여부:", res1.score === 7 ? "PASS" : "FAIL");

  console.log("\n=== 테스트 2: 단순 문자열 점수 (예: '5') ===");
  const res2 = await gradeSubjective({
    userAnswer: '테스트',
    correctAnswer: '오답',
    callLLMWithFailover: mockCallLLM('{"isCorrect": false, "score": "5", "reason": "문자열 5점"}')
  });
  console.log("출력 score:", res2.score);
  console.log("성공 여부:", res2.score === 5 ? "PASS" : "FAIL");

  console.log("\n=== 테스트 3: 혼합 문자열 점수 (예: '7점(부분)') ===");
  const res3 = await gradeSubjective({
    userAnswer: '테스트',
    correctAnswer: '오답',
    callLLMWithFailover: mockCallLLM('{"isCorrect": false, "score": "7점(부분)", "reason": "혼합 문자열"}')
  });
  console.log("출력 score:", res3.score);
  console.log("성공 여부:", res3.score === 7 ? "PASS" : "FAIL");

  console.log("\n=== 테스트 4: 점수 누락 시 Fallback ===");
  const res4 = await gradeSubjective({
    userAnswer: '테스트',
    correctAnswer: '오답',
    callLLMWithFailover: mockCallLLM('{"isCorrect": false, "reason": "점수 없음"}')
  });
  console.log("출력 score:", res4.score);
  console.log("성공 여부:", res4.score === 0 ? "PASS" : "FAIL");
}

runTests();
