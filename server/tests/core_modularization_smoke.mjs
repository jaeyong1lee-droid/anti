import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Ensure strict DB & cloud isolation BEFORE dynamically importing server modules
process.env.DATABASE_URL = '';
process.env.VERCEL = '1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');
const baselinePath = path.join(__dirname, 'route_snapshot_baseline.json');

function extractStackRoutes(stack, prefix, outSet) {
  if (!Array.isArray(stack)) return;
  for (const layer of stack) {
    if (layer.route) {
      const routePaths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      const methods = Object.keys(layer.route.methods || {}).filter((m) => layer.route.methods[m]);
      for (const rp of routePaths) {
        const joined = `${prefix}${rp === '/' ? '' : rp}`.replace(/\/{2,}/g, '/') || '/';
        for (const method of methods) {
          outSet.add(`${method.toUpperCase()} ${joined}`);
        }
      }
    } else if (layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
      extractStackRoutes(layer.handle.stack, prefix, outSet);
    }
  }
}

async function collectMountedRoutes() {
  const indexPath = path.join(serverDir, 'index.js');
  const indexSrc = fs.readFileSync(indexPath, 'utf8');

  const routeSet = new Set();

  // Direct app.<method>(...) definitions in server/index.js (excluding catch-all '*')
  const directRegex = /app\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = directRegex.exec(indexSrc)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    if (routePath === '*') continue;
    routeSet.add(`${method} ${routePath}`);
  }

  // Router imports & app.use mounts
  const importMap = new Map();
  const importRegex = /import\s+([A-Za-z0-9_$]+)\s+from\s+['"](\.\/routes\/[^'"]+)['"]\s*;/g;
  while ((match = importRegex.exec(indexSrc)) !== null) {
    importMap.set(match[1], match[2]);
  }

  const mountRegex = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_$]+)\s*\)/g;
  const mounts = [];
  while ((match = mountRegex.exec(indexSrc)) !== null) {
    const prefix = match[1];
    const varName = match[2];
    if (importMap.has(varName)) {
      mounts.push({ prefix, varName, relPath: importMap.get(varName) });
    }
  }

  assert.ok(mounts.length >= 7, `Expected at least 7 mounted routers in server/index.js, got ${mounts.length}`);

  for (const { prefix, relPath } of mounts) {
    const absPath = path.resolve(serverDir, relPath);
    const mod = await import(pathToFileURL(absPath).href);
    const router = mod.default;
    assert.ok(router && Array.isArray(router.stack), `Router ${relPath} did not export a valid Express router`);
    extractStackRoutes(router.stack, prefix, routeSet);
  }

  return [...routeSet].sort();
}

async function verifyAiServiceContractAndUnitTests() {
  const aiServiceUrl = pathToFileURL(path.join(serverDir, 'services', 'aiService.js')).href;
  const ai = await import(aiServiceUrl);

  const expectedTypes = {
    DEFAULT_STAGE_MODELS: 'object',
    globalStageModels: 'object',
    globalPreferredModel: 'string',
    globalAllowGradingFallback: 'boolean',
    MAX_CONCURRENT_LLM: 'number',
    MAX_SEMAPHORE_QUEUE: 'number',
    MAX_QUEUE_WAIT_MS: 'number',
    updateAllowGradingFallback: 'function',
    inferStageFromScenario: 'function',
    resolveStageModel: 'function',
    updateStageModels: 'function',
    loadPreferredModel: 'function',
    updatePreferredModel: 'function',
    saveSessionValue: 'function',
    normalizeGeminiModel: 'function',
    updateProgress: 'function',
    reportLlmProgress: 'function',
    startBackendProgressTimer: 'function',
    stopBackendProgressTimer: 'function',
    normalizeClaudeModel: 'function',
    acquireLlmSlot: 'function',
    releaseLlmSlot: 'function',
    withLlmConcurrencySlot: 'function',
    callLLMWithFailover: 'function',
    analyzeStandardsBeforeTask: 'function',
    getTopicText: 'function',
    searchSourceDocumentWithGeminiLite: 'function',
    getMatchingTopicContent: 'function',
    selectRelevantExcerpt: 'function'
  };

  for (const [key, expectedType] of Object.entries(expectedTypes)) {
    assert.ok(key in ai, `Missing aiService export: ${key}`);
    assert.equal(typeof ai[key], expectedType, `aiService.${key} typeof mismatch`);
  }
  assert.ok('globalAnthropicApiKey' in ai, 'Missing aiService export: globalAnthropicApiKey');
  assert.ok(
    ai.globalAnthropicApiKey === null || typeof ai.globalAnthropicApiKey === 'string',
    'aiService.globalAnthropicApiKey must be null or string'
  );

  // Unit tests: inferStageFromScenario
  assert.equal(ai.inferStageFromScenario('slides'), 'ppt');
  assert.equal(ai.inferStageFromScenario('question'), 'question');
  assert.equal(ai.inferStageFromScenario('validation'), 'question');
  assert.equal(ai.inferStageFromScenario('generation'), 'question');
  assert.equal(ai.inferStageFromScenario('grading'), 'grading');
  assert.equal(ai.inferStageFromScenario('tutor'), 'tutor');
  assert.equal(ai.inferStageFromScenario('other'), 'tutor');
  assert.equal(ai.inferStageFromScenario('tutor', { stage: 'grading' }), 'grading');

  // Unit tests: resolveStageModel & updateStageModels
  const origStages = { ...ai.globalStageModels };
  const origPreferred = ai.globalPreferredModel;
  const origFallback = ai.globalAllowGradingFallback;
  try {
    ai.updateStageModels({ tutor: 'gemini-3.8-flash', ignored: 'bad-model' });
    assert.equal(ai.resolveStageModel('tutor'), 'gemini-3.8-flash');
    assert.equal(ai.resolveStageModel('tutor', { preferredModel: 'claude-haiku-5-5' }), 'claude-haiku-5-5');
    assert.equal(ai.resolveStageModel('grading', { stageModels: { grading: 'claude-sonnet-5-5' } }), 'claude-sonnet-5-5');
    assert.equal(ai.updateAllowGradingFallback(true), true);
    assert.equal(ai.updateAllowGradingFallback(false), false);
  } finally {
    ai.updateStageModels(origStages);
    ai.updatePreferredModel(origPreferred);
    ai.updateAllowGradingFallback(origFallback);
  }

  // Unit tests: model normalization
  assert.equal(ai.normalizeGeminiModel('gemini-3.5-flash-lite'), 'gemini-3.5-flash-lite');
  assert.equal(ai.normalizeGeminiModel('  GEMINI-3.8-FLASH  '), 'gemini-3.8-flash');
  assert.equal(ai.normalizeGeminiModel('claude-sonnet-5-5'), 'gemini-3.5-flash-lite');
  assert.equal(ai.normalizeGeminiModel(''), 'gemini-3.5-flash-lite');

  assert.equal(ai.normalizeClaudeModel('claude-hybrid', 'tutor'), 'claude-sonnet-5-5');
  assert.equal(ai.normalizeClaudeModel('claude-hybrid', 'tutor', { hybridRole: 'fast' }), 'claude-haiku-5-5');
  assert.equal(ai.normalizeClaudeModel('claude-hybrid', 'slides'), 'claude-haiku-5-5');
  assert.equal(ai.normalizeClaudeModel('claude-haiku-5-5'), 'claude-haiku-5-5');

  // Unit tests: selectRelevantExcerpt
  const shortDoc = '짧은 정의 문단입니다.';
  assert.equal(ai.selectRelevantExcerpt(shortDoc, '정의', 100), shortDoc);

  const paragraphs = [
    '개요: Terzaghi 압밀 이론은 1차원 연직 배수 조건을 가정한다. ' + '가나다라 '.repeat(25),
    '무관한 문단 A: 아스팔트 포장 재료의 마모 시험 기준. ' + '마바사아 '.repeat(45),
    '핵심 문단 B: 유효응력 원리와 과잉간극수압 소산 과정 및 시간계수 Tv 산정 공식. ' + '자차카타 '.repeat(45),
    '무관한 문단 C: 터널 숏크리트 배합 설계 및 강도 관리. ' + '파하거너 '.repeat(45)
  ].join('\n\n');
  const excerpt = ai.selectRelevantExcerpt(paragraphs, '과잉간극수압 시간계수 Tv', 500);
  assert.ok(excerpt.length <= 500, `Excerpt exceeded maxChars: ${excerpt.length}`);
  assert.ok(excerpt.includes('Terzaghi 압밀 이론'), 'Excerpt should keep first paragraph');
  assert.ok(excerpt.includes('시간계수 Tv'), 'Excerpt should include relevant matched chunk');
  assert.ok(excerpt.includes('[…중략…]'), 'Excerpt should mark non-contiguous gaps');

  // Unit tests: progress tracker
  global.progressTracker = global.progressTracker || new Map();
  const pid = `smoke_pid_${Date.now()}`;
  try {
    ai.updateProgress(pid, 1, 'step1', 40);
    ai.updateProgress(pid, 1, 'step1-backwards', 25);
    assert.equal(global.progressTracker.get(pid).percentage, 40, 'Monotonic guard failed within step 1');

    ai.reportLlmProgress({ progressId: pid }, 'validation', 'gemini-3.5-flash-lite');
    const afterReport = global.progressTracker.get(pid);
    assert.equal(afterReport.step, 2);
    assert.ok(afterReport.percentage >= 50);

    const timer = ai.startBackendProgressTimer(pid, 2, 'working', 88, 5000, 3);
    assert.ok(timer !== null);
    ai.stopBackendProgressTimer(pid, 100, 'done', true, timer);
    assert.equal(global.progressTracker.get(pid).percentage, 100);
    assert.equal(global.progressTracker.get(pid).message, 'done');
  } finally {
    global.progressTracker.delete(pid);
  }

  // Unit tests: concurrency semaphore slot acquisition/release & error safety
  const results = await Promise.all([1, 2, 3, 4].map((n) => ai.withLlmConcurrencySlot(Date.now() + 5000, async () => n * 2)));
  assert.deepEqual(results, [2, 4, 6, 8]);
  await assert.rejects(
    ai.withLlmConcurrencySlot(Date.now() + 5000, async () => {
      throw new Error('simulated failure');
    }),
    /simulated failure/
  );
  const afterErr = await ai.withLlmConcurrencySlot(Date.now() + 5000, async () => 'ok');
  assert.equal(afterErr, 'ok');
}

async function verifyAllServerModulesLoad() {
  const dirs = ['routes', 'services', 'plugins'];
  let loaded = 0;
  for (const dir of dirs) {
    const absDir = path.join(serverDir, dir);
    const files = fs.readdirSync(absDir).filter((f) => f.endsWith('.js')).sort();
    for (const file of files) {
      await import(pathToFileURL(path.join(absDir, file)).href);
      loaded++;
    }
  }
  return loaded;
}

async function main() {
  const writeBaseline = process.argv.includes('--write-baseline');
  const routes = await collectMountedRoutes();

  if (writeBaseline) {
    fs.writeFileSync(baselinePath, JSON.stringify(routes, null, 2) + '\n', 'utf8');
    console.log(`[Baseline Written] ${routes.length} routes saved to ${path.relative(serverDir, baselinePath)}`);
  } else {
    assert.ok(fs.existsSync(baselinePath), `Baseline snapshot missing at ${baselinePath}`);
    const expectedRoutes = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const missing = expectedRoutes.filter((r) => !routes.includes(r));
    const added = routes.filter((r) => !expectedRoutes.includes(r));
    assert.equal(missing.length, 0, `Missing routes vs baseline: ${JSON.stringify(missing)}`);
    assert.equal(added.length, 0, `Unexpected added routes vs baseline: ${JSON.stringify(added)}`);
    assert.deepEqual(routes, expectedRoutes);
    console.log(`[PASS] Route Snapshot Parity: ${routes.length}/${expectedRoutes.length} routes exact match`);
  }

  await verifyAiServiceContractAndUnitTests();
  console.log('[PASS] aiService Export Contract (30 exports) & Pure Unit Tests');

  const moduleCount = await verifyAllServerModulesLoad();
  console.log(`[PASS] Server Module ESM Load Check: ${moduleCount} modules loaded cleanly (DB isolated)`);

  process.exit(0);
}

main().catch((err) => {
  console.error('[FAIL] core_modularization_smoke:', err);
  process.exit(1);
});
