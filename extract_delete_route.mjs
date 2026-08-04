import { execSync } from 'child_process';

const oldQuizRoutes = execSync('git show 862ac20:server/routes/quizRoutes.js', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });

const startIdx = oldQuizRoutes.indexOf("router.delete('/session/review/topic/:id'");
const endIdx = oldQuizRoutes.indexOf("router.get('/session/completed-review/", startIdx);

console.log("==========================================");
console.log("📜 [어제 21시 이전 862ac20 커밋 quizRoutes DELETE 엔드포인트 추출]");
console.log("==========================================");
console.log(oldQuizRoutes.slice(startIdx, endIdx));
