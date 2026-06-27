async function run() {
  console.log("Fetching https://anti-ashy.vercel.app/api/session/completed-review/by-topic/19...");
  try {
    const res = await fetch("https://anti-ashy.vercel.app/api/session/completed-review/by-topic/19");
    console.log("Status:", res.status, res.statusText);
    const bodyText = await res.text();
    console.log("Body length:", bodyText.length);
    console.log("Body preview:", bodyText.substring(0, 500));
  } catch(e) {
    console.error("Fetch error:", e);
  }
}
run();
