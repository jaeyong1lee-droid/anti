async function run() {
  const payload = {
    question: "다음 중 베르누이 방정식의 가정으로 옳지 않은 것은?",
    options: [
      "유체는 압축성 유체이어야 한다.",
      "유체는 정상류(steady flow)이어야 한다.",
      "유체는 비점성 유체이어야 한다.",
      "동일한 유선 상에서만 적용된다."
    ],
    answer: "① 유체는 압축성 유체이어야 한다."
  };

  console.log("Sending request to local backend...");
  try {
    const res = await fetch('http://localhost:5000/api/question/option-explanation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    console.log("Response status:", res.status);
    const data = await res.json();
    console.log("Response data:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Request failed:", error);
  }
}

run();
