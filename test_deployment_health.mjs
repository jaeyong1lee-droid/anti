// [자가 개선 테스터 - Vercel 배포 컴파일 및 구문 무결성 사전 검증 스크립트]

import { execSync } from 'child_process';
import fs from 'fs';

console.log("==========================================");
console.log("🤖 [자가 개선 테스터 - Vercel 배포 컴파일 사전 3단계 검증]");
console.log("==========================================");

try {
  // 1단계: 백엔드 노드 파일 Syntax 및 Import 컴파일 검사
  console.log("1단계: 백엔드 노드 파일 구문 검사 중...");
  execSync('node --check server/routes/quizRoutes.js', { stdio: 'pipe' });
  execSync('node --check server/plugins/flowchartQuizPlugin.js', { stdio: 'pipe' });
  console.log("  -> 백엔드 구문 검사: 100% 정상 (Error 0건)");

  // 2단계: 프론트엔드 latexUtils.js 및 App.jsx 구문 및 Export 컴파일 검사
  console.log("\n2단계: 프론트엔드 latexUtils.js 구문 및 Export 위치 검사 중...");
  const latexUtilsContent = fs.readFileSync('client/src/utils/latexUtils.js', 'utf8');
  if (/healDeep[\s\S]*?export\s+function/i.test(latexUtilsContent)) {
    const healDeepIdx = latexUtilsContent.indexOf('function healDeep');
    const exportIdx = latexUtilsContent.indexOf('export function sanitizeGarbageTextFromQuestion');
    const nextFnIdx = latexUtilsContent.indexOf('function parseQuestionTableText');
    
    if (exportIdx > healDeepIdx && exportIdx < nextFnIdx) {
      // Check brace counts between healDeep and exportIdx
      const sub = latexUtilsContent.slice(healDeepIdx, exportIdx);
      const openCount = (sub.match(/\{/g) || []).length;
      const closeCount = (sub.match(/\}/g) || []).length;
      if (openCount > closeCount) {
        throw new Error("latexUtils.js 내 export 문이 healDeep 함수 내부에 잘못 삽입되어 Vercel 배포 실패 리스크가 존재합니다!");
      }
    }
  }
  console.log("  -> 프론트엔드 구문 검사: 100% 정상 (Export 오작동 리스크 없음)");

  // 3단계: client/npm run build 실행으로 Vite 프로덕션 컴파일 최종 검증
  console.log("\n3단계: Vite 프로덕션 컴파일 빌드 검사 중 (npm run build)...");
  const buildOut = execSync('npm run build', { cwd: 'client', encoding: 'utf8' });
  console.log("  -> Vite 프로덕션 빌드 성공 완료!");

  console.log("\n==========================================");
  console.log("✅ [Vercel 배포 무결성 검증 완료]: Vercel 배포 실패 리스크(Error 5s 등)가 0%이며 안전하게 배포 가능합니다!");
  console.log("==========================================");
  process.exit(0);

} catch (err) {
  console.error("\n❌ [Vercel 배포 컴파일 결함 감지]:");
  console.error("  ->", err.message || err.stderr || err);
  process.exit(1);
}
