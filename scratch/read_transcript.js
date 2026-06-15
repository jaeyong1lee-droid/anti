const fs = require('fs');
const readline = require('readline');

async function readLastTurns() {
  const filePath = 'C:\\Users\\airfo\\.gemini\\antigravity\\brain\\6d74d6b8-f57e-4487-a8dd-c0117d283659\\.system_generated\\logs\\transcript.jsonl';
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const turns = [];
  for await (const line of rl) {
    try {
      const data = JSON.parse(line);
      if (data.type === 'USER_INPUT' || data.type === 'PLANNER_RESPONSE') {
        turns.push(data);
        if (turns.length > 30) {
          turns.shift();
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  turns.forEach((turn) => {
    console.log(`\n--- STEP ${turn.step_index} (${turn.source} / ${turn.type}) ---`);
    if (turn.content) {
      console.log(turn.content.substring(0, 1000));
      if (turn.content.length > 1000) console.log('... [TRUNCATED]');
    }
  });
}

readLastTurns();
