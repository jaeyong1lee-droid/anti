async function run() {
  console.log("Fetching https://anti-ashy.vercel.app/api/topics...");
  try {
    const res = await fetch("https://anti-ashy.vercel.app/api/topics");
    const data = await res.json();
    console.log("Schedules completed on 2026-06-25 or 2026-06-26:");
    data.forEach(t => {
      if (t.schedules) {
        t.schedules.forEach(s => {
          if (s.completed_at && (s.completed_at.startsWith('2026-06-25') || s.completed_at.startsWith('2026-06-26'))) {
            console.log(`Topic ID: ${t.id}, Title: "${t.title}"`);
            console.log(`  Sched ID: ${s.id}, Round: ${s.review_round}, Status: "${s.status}", CompletedAt: ${s.completed_at}, Score: ${s.score}`);
          }
        });
      }
    });
  } catch(e) {
    console.error("Fetch error:", e);
  }
}
run();
