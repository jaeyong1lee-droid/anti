async function run() {
  console.log("Fetching https://anti-ashy.vercel.app/api/session/last-active-review...");
  try {
    const res = await fetch("https://anti-ashy.vercel.app/api/session/last-active-review");
    console.log("Status:", res.status, res.statusText);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data));
  } catch(e) {
    console.error("Fetch error:", e);
  }
}
run();
