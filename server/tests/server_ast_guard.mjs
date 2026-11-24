import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverDir, '..');
const baselinePath = path.join(__dirname, 'server_ast_baseline.json');

const require = createRequire(import.meta.url);
const parser = require(path.join(repoRoot, 'client', 'node_modules', '@babel', 'parser'));
const traverseModule = require(path.join(repoRoot, 'client', 'node_modules', '@babel', 'traverse'));
const traverse = traverseModule.default || traverseModule;

const EXCLUDE_SERVER_DIRS = new Set(['node_modules', 'tests', 'data', 'db_volume', 'backups', 'scripts']);
const OK_MARKER_RE = /\/\/\s*(?:anti-lens|ast-guard)\s*:\s*ok\b/i;

const NODE_GLOBALS = new Set([
  'global', 'globalThis', 'process', 'Buffer', 'console', 'URL', 'URLSearchParams',
  'fetch', 'Request', 'Response', 'Headers', 'FormData', 'Blob', 'File',
  'AbortController', 'AbortSignal', 'Event', 'CustomEvent',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'queueMicrotask', 'structuredClone', 'TextEncoder', 'TextDecoder', 'crypto', 'performance', 'Intl',
  'atob', 'btoa', 'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
  'Date', 'Math', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'String', 'Number', 'Boolean', 'Array', 'Object', 'Function', 'Symbol', 'BigInt',
  'Set', 'Map', 'WeakSet', 'WeakMap', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'Promise', 'Infinity', 'NaN', 'undefined', 'Reflect', 'Proxy', 'Uint8Array', 'ArrayBuffer',
  'require', 'module', 'exports', '__dirname', '__filename'
]);

function makeFingerprint(rule, relPath, symbol, sourceLine) {
  const norm = String(sourceLine || '').trim().replace(/\s+/g, ' ');
  return crypto.createHash('sha1').update(`${rule}|${relPath}|${symbol}|${norm}`).digest('hex').slice(0, 16);
}

/**
 * Check buffer header for UTF-8 BOM (CL-5).
 */
export function hasUtf8Bom(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

/**
 * Run CL-1 (undeclared referenced symbols) and CL-14 (unused imports) on JS/ESM source text.
 */
export function auditServerSource(code, relPath = '<memory>') {
  const findings = [];
  const normRel = String(relPath).replace(/\\/g, '/');
  const lines = String(code).split(/\r?\n/);

  let ast;
  try {
    ast = parser.parse(code, { sourceType: 'module', plugins: ['topLevelAwait', 'importAttributes'] });
  } catch (err) {
    findings.push({
      rule: 'CL-1(PARSE)',
      severity: 'HIGH',
      file: normRel,
      line: err.loc?.line || 1,
      symbol: '<syntax>',
      message: `AST 파싱 실패: ${err.message}`,
      fingerprint: makeFingerprint('CL-1(PARSE)', normRel, '<syntax>', err.message)
    });
    return findings;
  }

  // Collect globals explicitly guarded via `typeof <Name>` so browser-optional branches do not false-positive
  const typeofGuarded = new Set();
  traverse(ast, {
    UnaryExpression(p) {
      if (p.node.operator === 'typeof' && p.node.argument?.type === 'Identifier') {
        typeofGuarded.add(p.node.argument.name);
      }
    }
  });

  traverse(ast, {
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (NODE_GLOBALS.has(name) || typeofGuarded.has(name)) return;
      if (!p.scope.hasBinding(name)) {
        const line = p.node.loc?.start?.line || 1;
        const srcLine = lines[line - 1] || '';
        if (OK_MARKER_RE.test(srcLine)) return;
        findings.push({
          rule: 'CL-1(미선언심볼)',
          severity: 'HIGH',
          file: normRel,
          line,
          symbol: name,
          message: `미선언 식별자 '${name}' 참조 (런타임 ReferenceError 위험)`,
          fingerprint: makeFingerprint('CL-1(미선언심볼)', normRel, name, srcLine)
        });
      }
    },
    ImportDeclaration(p) {
      for (const spec of p.node.specifiers) {
        const local = spec.local?.name;
        if (!local) continue;
        const binding = p.scope.getBinding(local);
        if (binding && binding.referencePaths.length === 0) {
          const line = spec.loc?.start?.line || p.node.loc?.start?.line || 1;
          const srcLine = lines[line - 1] || '';
          if (OK_MARKER_RE.test(srcLine)) continue;
          findings.push({
            rule: 'CL-14(미사용Import)',
            severity: 'MEDIUM',
            file: normRel,
            line,
            symbol: local,
            message: `미사용 import 심볼 '${local}'`,
            fingerprint: makeFingerprint('CL-14(미사용Import)', normRel, local, srcLine)
          });
        }
      }
    }
  });

  return findings;
}

function collectFiles(rootDir, exts, excludeDirs, out = []) {
  if (!fs.existsSync(rootDir)) return out;
  for (const ent of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const abs = path.join(rootDir, ent.name);
    if (ent.isDirectory()) {
      if (excludeDirs.has(ent.name)) continue;
      collectFiles(abs, exts, excludeDirs, out);
    } else if (exts.some((ext) => ent.name.endsWith(ext))) {
      out.push(abs);
    }
  }
  return out;
}

function runCli() {
  const updateBaseline = process.argv.includes('--update-baseline');
  const serverFiles = collectFiles(serverDir, ['.js'], EXCLUDE_SERVER_DIRS).sort();
  const bomTargets = [
    ...serverFiles,
    ...collectFiles(path.join(repoRoot, 'client', 'src'), ['.js', '.jsx'], new Set(['node_modules', 'dist'])),
    path.join(repoRoot, 'vercel.json')
  ].filter((f) => fs.existsSync(f));

  const bomFailures = [];
  for (const fp of bomTargets) {
    const buf = fs.readFileSync(fp);
    if (hasUtf8Bom(buf)) {
      bomFailures.push(path.relative(repoRoot, fp).replace(/\\/g, '/'));
    }
  }

  const allFindings = [];
  for (const fp of serverFiles) {
    const rel = path.relative(repoRoot, fp).replace(/\\/g, '/');
    const code = fs.readFileSync(fp, 'utf8');
    allFindings.push(...auditServerSource(code, rel));
  }

  if (bomFailures.length > 0) {
    console.error(`[FAIL][CL-5] UTF-8 BOM 감지: ${bomFailures.join(', ')}`);
    process.exit(1);
  }

  if (updateBaseline) {
    const payload = {
      schema_version: '1.0',
      updated_at: new Date().toISOString(),
      entries: allFindings.map(({ rule, file, line, symbol, fingerprint }) => ({
        rule,
        file,
        line,
        symbol,
        fingerprint
      }))
    };
    fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(`[Baseline Updated] server AST guard: ${serverFiles.length} files scanned, ${allFindings.length} baseline entry(ies) saved`);
    process.exit(0);
  }

  let knownFingerprints = new Set();
  if (fs.existsSync(baselinePath)) {
    const baseData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    knownFingerprints = new Set((baseData.entries || []).map((e) => e.fingerprint));
  }

  const newFindings = allFindings.filter((f) => !knownFingerprints.has(f.fingerprint));
  const baselinedCount = allFindings.length - newFindings.length;

  if (newFindings.length > 0) {
    console.error(`[FAIL] Server AST Guard: ${newFindings.length} new violation(s) found (baselined=${baselinedCount}):`);
    for (const f of newFindings) {
      console.error(`  - [${f.rule}] ${f.file}:${f.line} (${f.symbol}) -> ${f.message}`);
    }
    process.exit(1);
  }

  console.log(
    `[PASS] Server AST Guard (CL-1/CL-5/CL-14): ${serverFiles.length} server files, ${bomTargets.length} BOM checks, 0 new violations (${baselinedCount} baselined)`
  );
  process.exit(0);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  runCli();
}
