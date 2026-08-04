import { execSync } from 'child_process';

const oldPrompt = execSync('git show 862ac20:server/plugins/flowchartQuizPlugin.js', { encoding: 'utf8' });

console.log("==========================================");
console.log("📜 [어제 862ac20 커밋 flowchartQuizPlugin.js L50 ~ L120]");
console.log("==========================================");
const lines = oldPrompt.split('\n');
console.log(lines.slice(45, 120).join('\n'));
