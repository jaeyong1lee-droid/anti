#!/usr/bin/env node
// sync-latex.cjs
// 빌드 전 서버의 latexUtils.js를 클라이언트로 자동 동기화하는 스크립트
// [절대 편집 금지] - 이 파일은 server/utils/latexUtils.js 에서 자동 생성됩니다.
const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../server/utils/latexUtils.js');
const dest = path.resolve(__dirname, 'src/utils/latexUtils.js');

if (!fs.existsSync(src)) {
  console.error('[sync-latex] ERROR: Source file not found:', src);
  process.exit(1);
}

fs.copyFileSync(src, dest);
console.log('[sync-latex] ✅ latexUtils.js synced from server to client successfully.');
