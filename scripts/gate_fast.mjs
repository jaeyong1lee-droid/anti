import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const rulesPath = path.join(repoRoot, 'server', 'tests', 'anti_lens_rules.json');

function captureProtectedHashes() {
  const rulesCfg = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  const targets = [
    ...(rulesCfg.protected_files || []),
    'server/db_volume/spaced_repetition.db'
  ];
  const map = new Map();
  for (const rel of targets) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const data = fs.readFileSync(abs);
    map.set(rel, `${crypto.createHash('sha256').update(data).digest('hex')}:${data.length}`);
  }
  return map;
}

function main() {
  const tTotalStart = Date.now();
  const stagedFlag = process.argv.includes('--staged');
  const beforeHashes = captureProtectedHashes();

  const childEnv = {
    ...process.env,
    DATABASE_URL: '',
    VERCEL: '1'
  };

  const lensArgs = ['server/tests/anti_lens_check.mjs'];
  if (stagedFlag) lensArgs.push('--staged');

  const steps = [
    { name: '1/4 Server AST Guard (CL-1/CL-5/CL-14)', cmd: process.execPath, args: ['server/tests/server_ast_guard.mjs'], cwd: repoRoot },
    { name: '2/4 Anti-Lens Ledger & Size Ratchet (AL-1~AL-6)', cmd: process.execPath, args: lensArgs, cwd: repoRoot },
    { name: '3/4 Core Modularization & Failover Smoke', cmd: process.execPath, args: ['server/tests/core_modularization_smoke.mjs'], cwd: repoRoot },
    { name: '4/4 Client Scope & React Hook Integrity', cmd: process.execPath, args: ['scripts/verify_scope_integrity.cjs'], cwd: path.join(repoRoot, 'client') }
  ];

  const summary = [];
  let failed = false;

  console.log('==============================================================');
  console.log(`  Antigravity Tier-1 Fast Gate (${stagedFlag ? 'staged' : 'worktree'})`);
  console.log('==============================================================');

  for (const step of steps) {
    const t0 = Date.now();
    console.log(`\n▶ [${step.name}]`);
    const res = spawnSync(step.cmd, step.args, {
      cwd: step.cwd,
      env: childEnv,
      stdio: 'inherit'
    });
    const sec = ((Date.now() - t0) / 1000).toFixed(2);
    const ok = res.status === 0;
    summary.push({ name: step.name, ok, sec });
    if (!ok) {
      failed = true;
      break;
    }
  }

  const afterHashes = captureProtectedHashes();
  const mutatedProtected = [];
  for (const [rel, hashBefore] of beforeHashes.entries()) {
    if (afterHashes.get(rel) !== hashBefore) {
      mutatedProtected.push(rel);
    }
  }
  if (mutatedProtected.length > 0) {
    console.error(`\n[FAIL] 게이트 실행 중 보호/DB 파일 변조 감지: ${mutatedProtected.join(', ')}`);
    failed = true;
  }

  const totalSec = ((Date.now() - tTotalStart) / 1000).toFixed(2);
  console.log('\n--------------------------------------------------------------');
  for (const row of summary) {
    console.log(`  ${row.ok ? 'PASS' : 'FAIL'} | ${row.sec.padStart(5)}s | ${row.name}`);
  }
  console.log(`  Protected State Snapshot: ${mutatedProtected.length === 0 ? 'INTACT' : 'MUTATED'} (${beforeHashes.size} file(s))`);
  console.log(`  Total Elapsed: ${totalSec}s`);
  console.log('--------------------------------------------------------------');

  process.exit(failed ? 1 : 0);
}

main();
