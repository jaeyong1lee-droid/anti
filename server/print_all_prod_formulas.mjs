async function main() {
  const url = 'https://anti-ashy.vercel.app/api/session/formula';
  console.log(`Fetching from: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Error status: ${res.status}`);
      return;
    }
    const data = await res.json();
    const list = data.data?.formulaQuestions || [];
    console.log('Total formulas:', list.length);
    list.forEach((q, idx) => {
      console.log(`[${idx}] ID: ${q.id} | Title: ${q.title || q.question?.substring(0, 50)}`);
    });
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}
main();
