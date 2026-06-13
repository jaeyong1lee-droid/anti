async function querySessions() {
  try {
    const res = await fetch('https://anti-ashy.vercel.app/api/topics');
    if (!res.ok) {
      console.log("Failed to fetch topics:", res.status);
      return;
    }
    const topics = await res.json();
    const targetTopic = topics.find(t => t.title.includes('가설흙막이 구조물 해석 방법 중 탄소성보법'));
    console.log("Schedules for topic 6 (가설흙막이):", JSON.stringify(targetTopic.schedules, null, 2));

    // Also let's check what other topics have completed schedules with score = 100 and correct_count = 0, total_count = 0
    console.log("\nChecking all topics for completed schedules with 0/0 correct/total counts:");
    topics.forEach(t => {
      t.schedules.forEach(s => {
        if (s.status === 'completed' && s.score === 100 && s.correct_count === 0 && s.total_count === 0) {
          console.log(`Topic: "${t.title}" (ID: ${t.id}), Round: ${s.review_round}, Completed At: ${s.completed_at}`);
        }
      });
    });

  } catch (err) {
    console.error("Error querying:", err.message);
  }
}

querySessions();
