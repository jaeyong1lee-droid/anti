import fs from 'fs';
import readline from 'readline';

async function main() {
  const logPath = 'C:\\Users\\airfo\\.gemini\\antigravity\\brain\\ef7c384a-fc75-4d86-8fb9-6c81e9867cf7\\.system_generated\\logs\\transcript.jsonl';
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Searching conversation history for npm/node commands...');
  for await (const line of rl) {
    if (line.includes('CommandLine') && (line.includes('npm') || line.includes('node'))) {
      try {
        const step = JSON.parse(line);
        if (step.tool_calls) {
          step.tool_calls.forEach(tc => {
            if (tc.name === 'run_command' && tc.args && tc.args.CommandLine) {
              console.log(`[CWD: ${tc.args.Cwd || ''}] -> ${tc.args.CommandLine}`);
            }
          });
        }
      } catch (e) {
        // ignore JSON parse errors on truncated lines
      }
    }
  }
}

main();
