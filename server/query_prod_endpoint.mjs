async function main() {
  const url = 'https://anti-ashy.vercel.app/api/topics';
  console.log(`Fetching from: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Error status: ${res.status}`);
      return;
    }
    const data = await res.json();
    
    const targetTitles = ["터널 굴착 여굴", "압밀문제"];
    for (const titleKeyword of targetTitles) {
      const matched = data.filter(t => t.title.includes(titleKeyword));
      for (const topic of matched) {
        console.log(`\n=============================================`);
        console.log(`Topic ID: ${topic.id} | Title: ${topic.title}`);
        console.log(`=============================================`);
        if (topic.schedules) {
          console.table(topic.schedules.map(s => ({
            id: s.id,
            round: s.review_round,
            planned: s.planned_date,
            completed_at: s.completed_at,
            status: s.status,
            score: s.score
          })));
        } else {
          console.log("No schedules found.");
        }
      }
    }
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}
main();
