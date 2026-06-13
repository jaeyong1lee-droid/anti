async function main() {
  const url = 'https://anti-ashy.vercel.app/api/restore-answersheet-endpoint';
  console.log(`Sending POST request to: ${url}`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      console.error(`Error status: ${res.status}`);
      const text = await res.text();
      console.error(text);
      return;
    }
    const data = await res.json();
    console.log("\n=== Production Restoration Response ===");
    console.log("Success:", data.success);
    console.log("Restored Count:", data.restored_count);
    console.log("Restored Topic Titles:");
    console.log(data.topics);
  } catch (err) {
    console.error("POST request failed:", err);
  }
}
main();
