async function testSingleItemGrading() {
  console.log("=================================================");
  console.log("🧪 [자가 개선 테스터] (D)번 항목 및 개별 재채점 테스트");
  console.log("=================================================");

  const payload = {
    question: "Terzaghi 지지력 공식을 사용하여 극한지지력을 산정하시오. B=2.0m, gamma=18kN/m3, c=20kPa, phi=30도. (1) 조건(a) 허용지지력 (2) 조건(a) 허용하중 (3) 조건(b) 허용지지력 (4) 조건(b) 허용하중",
    correctAnswer: "",
    userAnswer: "13008",
    rowHeader: "(4) 조건 (b)의 허용하중 P_all (b) (kN)",
    colHeader: "수치 답안",
    explanation: "Terzaghi 지지력 공식(q_u = 1.3cN_c + gamma*D_f*N_q + 0.4*gamma*B*N_gamma)을 이용한 허용하중 계산 결과입니다.",
    category: "계산",
    temperature: 0.7,
    preferredModel: "gemini-3.5-flash-lite"
  };

  try {
    console.log("📡 API 요청 전송 중 (POST /api/grade-subjective)...");
    const res = await fetch("http://localhost:5000/api/grade-subjective", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log("📥 AI 채점 응답 결과:", JSON.stringify(data, null, 2));

    if (data.reason === '답안이 비어 있습니다.') {
      console.error("❌ [FAIL] 여전히 '답안이 비어 있습니다' 에러가 발생합니다!");
      process.exit(1);
    }

    if (typeof data.score === 'number' && data.score >= 0) {
      console.log(`✅ [PASS] AI 채점 성공! (점수: ${data.score}점, 사유: ${data.reason})`);
      process.exit(0);
    } else {
      console.error("❌ [FAIL] 유효하지 않은 채점 응답입니다:", data);
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ [ERROR] 테스트 중 예외 발생:", err.message);
    process.exit(1);
  }
}

testSingleItemGrading();
