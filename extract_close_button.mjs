import { execSync } from 'child_process';

const oldAppJsx = execSync('git show 862ac20:client/src/App.jsx', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });

const lines = oldAppJsx.split('\n');
const startLine = 19630;
const endLine = 19700;

console.log("==========================================");
console.log("📜 [어제 21시 이전 862ac20 커밋 종료 버튼 핸들러 추출]");
console.log("==========================================");
console.log(lines.slice(startLine - 1, endLine).map((l, idx) => `${startLine + idx}: ${l}`).join('\n'));
