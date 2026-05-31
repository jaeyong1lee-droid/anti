import fs from 'fs';
import readline from 'readline';

const logsPath = 'C:\\Users\\airfo\\.gemini\\antigravity\\brain\\00924c85-2a67-451f-9338-7b3cbb10be60\\.system_generated\\logs\\transcript.jsonl';

if (!fs.existsSync(logsPath)) {
  console.log('Logs file does not exist at:', logsPath);
  process.exit(0);
}

const fileStream = fs.createReadStream(logsPath);
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity
});

const userInputs = [];
for await (const line of rl) {
  try {
    const step = JSON.parse(line);
    if (step.type === 'USER_INPUT') {
      userInputs.push(step);
    }
  } catch (e) {}
}

console.log(`Total user inputs recorded: ${userInputs.length}`);
const lastUserInputs = userInputs.slice(-20);
for (const ui of lastUserInputs) {
  console.log('========================================');
  console.log(`Step ${ui.step_index} | Date: ${ui.created_at || 'unknown'}`);
  console.log(`User Prompt: ${ui.content}`);
}
