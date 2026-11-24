import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverDir, '..');

const rulesPath = path.join(__dirname, 'anti_lens_rules.json');
const guardBaselinePath = path.join(__dirname, 'anti_guard_baseline.json');
const sizeBaselinePath = path.join(__dirname, 'size_baseline.json');
const OK_MARKER_RE = /\/\/\s*(?:anti-lens|ask-first)\s*:\s*ok\b/i;

function makeRuleFingerprint(ruleId, relPath, snippet) {
  const norm = String(snippet || '').trim().replace(/\s+/g, ' ');
  return crypto.createHash('sha1').update(`${ruleId}|${relPath}|${norm}`).digest('hex').slice(0, 16);
}

/**
 * Evaluate declarative anti-lens rules against a single source text.
 */
export function auditRulesOnText(text, relPath, rules) {
  const normRel = String(relPath || '').replace(/\\/g, '/');
  const lines = String(text || '').split(/\r?\n/);
  const findings = [];

  for (const rule of rules || []) {
    const exts = rule.extensions || [];
    if (exts.length > 0 && !exts.some((ext) => normRel.endsWith(ext))) continue;
    if (rule.path_prefix && !normRel.startsWith(rule.path_prefix)) continue;
    if (Array.isArray(rule.exclude_paths) && rule.exclude_paths.some((ex) => normRel.startsWith(ex))) continue;

    const flags = rule.flags && rule.flags.includes('g') ? rule.flags : `${rule.flags || ''}g`;
    const re = new RegExp(rule.pattern, flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      const prefix = text.slice(0, m.index);
      const lineNo = prefix.split(/\r?\n/).length;
      const matchedSnippet = m[0];
      const lineText = lines[lineNo - 1] || '';
      const snippetEndLineNo = lineNo + matchedSnippet.split(/\r?\n/).length - 1;
      const hasOk = lines.slice(lineNo - 1, snippetEndLineNo).some((l) => OK_MARKER_RE.test(l));
      if (hasOk) continue;

      findings.push({
        rule: rule.name || rule.id,
        id: rule.id,
        severity: rule.severity || 'MEDIUM',
        mode: rule.mode || 'strict',
        file: normRel,
        line: lineNo,
        snippet: matchedSnippet.replace(/\s+/g, ' ').trim().slice(0, 100),
        suggestion: rule.suggestion || '',
        fingerprint: makeRuleFingerprint(rule.id, normRel, lineText + '|' + matchedSnippet)
      });
    }
  }
  return findings;
}

/**
 * Evaluate large-file ratchet against baseline counts (AL-5).
 */
export function checkSizeRatchet(currentSizes, baselineSizes, threshold = 1500, deltaLimit = 50) {
  const violations = [];
  for (const [relPath, count] of Object.entries(currentSizes || {})) {
    const base = baselineSizes ? baselineSizes[relPath] : undefined;
    if (base !== undefined) {
      if (count - base > deltaLimit) {
        violations.push({
          rule: 'AL-5(대형파일래칫)',
          file: relPath,
          baseline: base,
          current: count,
          delta: count - base,
          message: `대형 파일(${base}L)이 +${count - base}줄 증가해 상한(+${deltaLimit}L)을 초과했습니다.`
        });
      }
    } else if (count >= threshold) {
      violations.push({
        rule: 'AL-5(신규대형파일차단)',
        file: relPath,
        baseline: threshold,
        current: count,
        delta: count - threshold,
        message: `신규 파일(${count}L)이 상한(${threshold}L) 이상입니다.`
      });
    }
  }
  return violations;
}

/**
 * Verify protected files were not modified without explicit opt-in (AL-6).
 */
export function checkProtectedGitDiff(changedFiles, protectedFiles, allowProtectedEdit = false) {
  if (allowProtectedEdit) return [];
  const protectedSet = new Set((protectedFiles || []).map((f) => String(f).replace(/\\/g, '/')));
  return (changedFiles || [])
    .map((f) => String(f).replace(/\\/g, '/'))
    .filter((f) => protectedSet.has(f));
}

function collectScanFiles(scanDirs, excludeDirs, exts = ['.js', '.jsx']) {
  const files = [];
  const exSet = new Set(excludeDirs || []);
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (exSet.has(ent.name)) continue;
        walk(abs);
      } else if (exts.some((ext) => ent.name.endsWith(ext))) {
        files.push(abs);
      }
    }
  };
  for (const sub of scanDirs || []) {
    walk(path.join(repoRoot, sub));
  }
  return files.sort();
}

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return null;
}

function runEvolve(ledger) {
  const id = getArgValue('--id');
  const name = getArgValue('--name');
  const pattern = getArgValue('--pattern');
  const origin = getArgValue('--origin') || 'Added via --evolve';
  if (!id || !name || !pattern) {
    console.error('[FAIL] --evolve requires --id, --name, and --pattern');
    process.exit(1);
  }
  new RegExp(pattern); // validate regex
  const pathPrefix = getArgValue('--path-prefix') || '';
  const mode = getArgValue('--mode') || 'strict';
  const severity = getArgValue('--severity') || 'HIGH';
  const suggestion = getArgValue('--suggestion') || '규칙 위반을 수정하십시오.';
  const extsRaw = getArgValue('--extensions') || '.js';
  const extensions = extsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  ledger.rules = (ledger.rules || []).filter((r) => r.id !== id);
  ledger.rules.push({
    id,
    name,
    severity,
    mode,
    pattern,
    flags: '',
    extensions,
    path_prefix: pathPrefix,
    exclude_paths: [],
    suggestion,
    origin,
    added_at: new Date().toISOString().slice(0, 10)
  });
  fs.writeFileSync(rulesPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  console.log(`[Evolved] Rule '${id}' (${name}) saved to ${path.relative(repoRoot, rulesPath)}`);
  process.exit(0);
}

function getChangedFilesForGuard(stagedOnly) {
  const args = stagedOnly ? 'git diff --cached --name-only' : 'git diff --name-only HEAD';
  try {
    return execSync(args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString('utf8')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function runCli() {
  const ledger = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  if (process.argv.includes('--evolve')) {
    runEvolve(ledger);
    return;
  }

  const updateBaseline = process.argv.includes('--update-baseline');
  const stagedOnly = process.argv.includes('--staged');
  const ratchet = ledger.size_ratchet || {};
  const files = collectScanFiles(ratchet.scan_dirs || ['server', 'client/src'], ratchet.exclude_dirs || []);

  const allFindings = [];
  const currentLargeSizes = {};
  const threshold = ratchet.file_large_threshold ?? 1500;
  const deltaLimit = ratchet.file_delta_limit ?? 50;

  for (const fp of files) {
    const rel = path.relative(repoRoot, fp).replace(/\\/g, '/');
    const txt = fs.readFileSync(fp, 'utf8');
    const lineCount = txt.split(/\r?\n/).length;
    if (lineCount >= threshold) {
      currentLargeSizes[rel] = lineCount;
    }
    allFindings.push(...auditRulesOnText(txt, rel, ledger.rules || []));
  }

  if (updateBaseline) {
    const reason = getArgValue('--reason') || 'baseline freeze';
    const baseEntries = allFindings
      .filter((f) => f.mode === 'baseline')
      .map(({ id, file, line, snippet, fingerprint }) => ({ id, file, line, snippet, fingerprint }));
    fs.writeFileSync(
      guardBaselinePath,
      JSON.stringify({ schema_version: '1.0', reason, updated_at: new Date().toISOString(), entries: baseEntries }, null, 2) + '\n',
      'utf8'
    );
    fs.writeFileSync(
      sizeBaselinePath,
      JSON.stringify({ schema_version: '1.0', reason, updated_at: new Date().toISOString(), threshold, delta_limit: deltaLimit, files: currentLargeSizes }, null, 2) + '\n',
      'utf8'
    );
    console.log(`[Baseline Updated] ${baseEntries.length} guard finding(s) & ${Object.keys(currentLargeSizes).length} large file(s) frozen (${reason})`);
    process.exit(0);
  }

  // 1. Protected files guard (AL-6)
  const changedFiles = getChangedFilesForGuard(stagedOnly);
  const allowProtected = process.env.ALLOW_PROTECTED_EDIT === '1';
  const protectedHits = checkProtectedGitDiff(changedFiles, ledger.protected_files || [], allowProtected);
  if (protectedHits.length > 0) {
    console.error(`[FAIL][AL-6] 보호 파일 무단 수정 감지 (허가 시 ALLOW_PROTECTED_EDIT=1): ${protectedHits.join(', ')}`);
    process.exit(1);
  }

  // 2. Strict + Baseline rule checks (AL-1 ~ AL-4)
  let knownGuardFps = new Set();
  if (fs.existsSync(guardBaselinePath)) {
    const gBase = JSON.parse(fs.readFileSync(guardBaselinePath, 'utf8'));
    knownGuardFps = new Set((gBase.entries || []).map((e) => e.fingerprint));
  }

  const failingRules = allFindings.filter(
    (f) => f.mode === 'strict' || !knownGuardFps.has(f.fingerprint)
  );
  const frozenRuleCount = allFindings.length - failingRules.length;

  // 3. Size ratchet check (AL-5)
  let baseSizes = {};
  if (fs.existsSync(sizeBaselinePath)) {
    const sBase = JSON.parse(fs.readFileSync(sizeBaselinePath, 'utf8'));
    baseSizes = sBase.files || {};
  }
  const sizeViolations = checkSizeRatchet(currentLargeSizes, baseSizes, threshold, deltaLimit);

  if (failingRules.length > 0 || sizeViolations.length > 0) {
    for (const f of failingRules) {
      console.error(`[FAIL][${f.rule}] ${f.file}:${f.line} -> ${f.snippet}\n   조치: ${f.suggestion}`);
    }
    for (const v of sizeViolations) {
      console.error(`[FAIL][${v.rule}] ${v.file}: ${v.baseline}L -> ${v.current}L (+${v.delta}L) — ${v.message}`);
    }
    process.exit(1);
  }

  console.log(
    `[PASS] Anti-Lens & Size Ratchet (AL-1~AL-6): ${files.length} files, 0 new violations (${frozenRuleCount} baselined, ${Object.keys(currentLargeSizes).length} large files within ratchet)`
  );
  process.exit(0);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  runCli();
}
