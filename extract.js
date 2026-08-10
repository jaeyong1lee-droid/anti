const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:\\Users\\15U50S\\.gemini\\antigravity\\brain\\c7fb3568-c53d-4931-b1b4-c39c1f65be86\\.system_generated\\logs\\transcript_full.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const history = [];
  for await (const line of rl) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.source === 'MODEL' && parsed.type === 'PLANNER_RESPONSE' && parsed.content) {
        history.push({ role: 'model', content: parsed.content });
      }
      if (parsed.source === 'USER_EXPLICIT' && parsed.type === 'USER_INPUT') {
        history.push({ role: 'user', content: parsed.content });
      }
    } catch (e) {}
  }
  
  const tail = history.slice(-20);
  for (const item of tail) {
    console.log(`[${item.role.toUpperCase()}]`);
    console.log(item.content);
    console.log('-------------------------');
  }
}

processLineByLine();
