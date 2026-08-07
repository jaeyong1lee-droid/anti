import { dbQuery } from './server/database.js';

async function checkScores() {
  try {
    const sess2 = await dbQuery.all("SELECT key, value FROM app_session WHERE value LIKE '%tableGradingResults%'");
    console.log(`Found ${sess2.length} sessions with grading results.`);
    let tenCount = 0;
    let zeroCount = 0;
    let partialCount = 0;

    for (const s of sess2) {
      const match = s.value.match(/"score":\s*(\d+)/g);
      if (match) {
        for (const m of match) {
          const score = parseInt(m.replace(/"score":\s*/, ''), 10);
          if (score === 10) tenCount++;
          else if (score === 0) zeroCount++;
          else partialCount++;
        }
      }
    }
    console.log(`10 points: ${tenCount}, 0 points: ${zeroCount}, Partial points (1-9): ${partialCount}`);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

checkScores();
