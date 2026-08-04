import { execSync } from 'child_process';

const oldPrompt = execSync('git show 862ac20:server/plugins/flowchartQuizPlugin.js', { encoding: 'utf8' });

console.log("==========================================");
console.log("📜 [어제 862ac20 커밋 flowchartQuizPlugin.js 전체 출제 예시 문구]");
console.log("==========================================");
const idx = oldPrompt.indexOf('### [출제 포맷 예시]');
console.log(oldPrompt.slice(idx, idx + 2500));
