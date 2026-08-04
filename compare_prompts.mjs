import { execSync } from 'child_process';

const oldPrompt = execSync('git show 862ac20:server/plugins/flowchartQuizPlugin.js', { encoding: 'utf8' });
const newPrompt = execSync('git show HEAD:server/plugins/flowchartQuizPlugin.js', { encoding: 'utf8' });

console.log("==========================================");
console.log("📜 [어제(862ac20) vs 오늘(HEAD) flowchartQuizPlugin.js 차이점 1:1 대조]");
console.log("==========================================");

const oldLines = oldPrompt.split('\n');
const newLines = newPrompt.split('\n');

console.log(`어제 라인 수: ${oldLines.length}, 오늘 라인 수: ${newLines.length}`);

// 프롬프트 예시 부분 추출 비교
const oldExampleStart = oldPrompt.indexOf('```markdown');
const oldExampleEnd = oldPrompt.indexOf('```', oldExampleStart + 12);
const oldExample = oldPrompt.slice(oldExampleStart, oldExampleEnd + 3);

const newExampleStart = newPrompt.indexOf('```markdown');
const newExampleEnd = newPrompt.indexOf('```', newExampleStart + 12);
const newExample = newPrompt.slice(newExampleStart, newExampleEnd + 3);

console.log("\n--- [어제 862ac20 예시 마크다운] ---");
console.log(oldExample);

console.log("\n--- [오늘 HEAD 예시 마크다운] ---");
console.log(newExample);
