// [자가 개선 테스터]: 백엔드 AI 퀴즈 생성 API 모듈 및 프롬프트 로드 검사

console.log("==========================================");
console.log("🤖 [자가 개선 테스터: 백엔드 AI 퀴즈 생성 모듈 500 에러 추적]");
console.log("==========================================");

async function testAiQuestionsApi() {
  try {
    const flowchartPlugin = await import('./server/plugins/flowchartQuizPlugin.js');
    console.log("✅ [모듈 로드 통과]: flowchartQuizPlugin.js 정상 로드 완료.");
    
    if (!flowchartPlugin.FLOWCHART_QUIZ_GENERATION_PROMPT) {
      console.error("❌ [오류 감지]: FLOWCHART_QUIZ_GENERATION_PROMPT가 export 되지 않았습니다!");
      process.exit(1);
    } else {
      console.log("✅ [프롬프트 통과]: FLOWCHART_QUIZ_GENERATION_PROMPT 정상 검출 완료.");
    }

    const generationStandards = await import('./server/plugins/generationStandards.js');
    console.log("✅ [모듈 로드 통과]: generationStandards.js 정상 로드 완료.");

    const engineeringStandards = await import('./server/plugins/engineeringStandards.js');
    console.log("✅ [모듈 로드 통과]: engineeringStandards.js 정상 로드 완료.");

    console.log("\n==========================================");
    console.log("✅ [모듈 검증 통과]: 백엔드 플러그인 모듈 로드에 이상이 없습니다.");
    console.log("==========================================");
    process.exit(0);

  } catch (err) {
    console.error("❌ [500 에러 유발 모듈 발견!]:", err);
    process.exit(1);
  }
}

testAiQuestionsApi();
