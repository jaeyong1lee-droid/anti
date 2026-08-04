import { execSync } from 'child_process';
import fs from 'fs';

const oldAppJsx = execSync('git show 862ac20:client/src/App.jsx', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });

const startIdx = oldAppJsx.indexOf('const renderLineContent =');
const endIdx = oldAppJsx.indexOf('const isAllGraded =', startIdx);

console.log("==========================================");
console.log("📜 [어제 정상 코딩 (Commit 862ac20) renderLineContent 및 renderSingleBox 추출]");
console.log("==========================================");
console.log(oldAppJsx.slice(startIdx, startIdx + 3500));
