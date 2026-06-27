async function run() {
  console.log("Testing POST https://anti-ashy.vercel.app/api/topics/1/ai-questions...");
  try {
    const res = await fetch("https://anti-ashy.vercel.app/api/topics/1/ai-questions?progressId=test_diag_123", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scheduleId: 9999
      })
    });
    console.log("Status:", res.status, res.statusText);
    const bodyText = await res.text();
    console.log("Body:", bodyText);
  } catch(e) {
    console.error("Fetch error:", e);
  }
}
run();
