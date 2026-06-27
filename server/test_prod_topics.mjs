async function run() {
  console.log("Fetching https://anti-ashy.vercel.app/api/topics...");
  try {
    const res = await fetch("https://anti-ashy.vercel.app/api/topics");
    const data = await res.json();
    console.log("Filtering topics for '말뚝' or '기초':");
    data.forEach(t => {
      const match = t.title.includes('말뚝') || t.title.includes('기초');
      if (match) {
        console.log(`Topic ID: ${t.id}, Title: "${t.title}", Category: "${t.category}"`);
        if (t.schedules) {
          t.schedules.forEach(s => {
            console.log(`  Sched ID: ${s.id}, Round: ${s.review_round}, Status: "${s.status}", CompletedAt: ${s.completed_at}, Score: ${s.score}`);
          });
        }
      }
    });
  } catch(e) {
    console.error("Fetch error:", e);
  }
}
run();
