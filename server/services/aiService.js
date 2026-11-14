import { GoogleGenerativeAI } from '@google/generative-ai';
import { dbQuery } from '../database.js';
import { parseLlmJson } from '../utils/latexUtils.js';
import { SVG_DIAGRAM_PROMPT } from '../plugins/svgDiagramPlugin.js';
import { CHART_DIAGRAM_PROMPT } from '../plugins/chartPlugin.js';

// Global AI progress tracker map
global.progressTracker = global.progressTracker || new Map();

// 차트 지침(CHART_DIAGRAM_PROMPT)을 붙이지 않는 시나리오 (순수 텍스트/JSON 출력 전용)
const NO_CHART_PROMPT_SCENARIOS = new Set(['grading', 'general', 'slides', 'ocr', 'source-search']);

export const DEFAULT_STAGE_MODELS = {
  ppt: 'claude-hybrid',
  question: 'claude-hybrid',
  grading: 'gemini-3.5-flash-lite',
  tutor: 'gemini-3.5-flash-lite'
};
export let globalStageModels = { ...DEFAULT_STAGE_MODELS };
export let globalPreferredModel = 'gemini-3.5-flash-lite';
export let globalAllowGradingFallback = false;
export let globalAnthropicApiKey = null;

export function updateAllowGradingFallback(allow = false) {
  globalAllowGradingFallback = Boolean(allow);
  return globalAllowGradingFallback;
}

export function inferStageFromScenario(scenario = 'default', options = {}) {
  if (options && typeof options.stage === 'string' && ['ppt', 'question', 'grading', 'tutor'].includes(options.stage)) {
    return options.stage;
  }
  if (scenario === 'slides') return 'ppt';
  if (scenario === 'question' || scenario === 'validation' || scenario === 'generation') return 'question';
  if (scenario === 'grading') return 'grading';
  return 'tutor';
}

export function resolveStageModel(scenario = 'default', options = {}) {
  const stage = inferStageFromScenario(scenario, options);
  if (options && options.stageModels && typeof options.stageModels === 'object' && options.stageModels[stage]) {
    return options.stageModels[stage];
  }
  if (options && typeof options.preferredModel === 'string' && options.preferredModel.trim()) {
    return options.preferredModel.trim();
  }
  return (globalStageModels && globalStageModels[stage]) || DEFAULT_STAGE_MODELS[stage] || 'gemini-3.5-flash-lite';
}

export function updateStageModels(nextStageModels = {}) {
  if (!nextStageModels || typeof nextStageModels !== 'object') return globalStageModels;
  for (const k of ['ppt', 'question', 'grading', 'tutor']) {
    const v = nextStageModels[k];
    if (typeof v === 'string' && (v.startsWith('gemini-') || v.startsWith('claude-'))) {
      globalStageModels[k] = v;
    }
  }
  globalPreferredModel = globalStageModels.tutor || 'gemini-3.5-flash-lite';
  return { ...globalStageModels };
}
export const FALLBACK_MODELS = [
  'claude-hybrid',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'claude-opus-5-5',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-4-hydrogen'
];

export async function loadPreferredModel() {
  try {
    // Sync ANTHROPIC_API_KEY between env and DB so both local and Vercel production work seamlessly
    const envClaudeKey = process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.trim().replace(/^['"]|['"]$/g, '') : '';
    const keyRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'anthropic_api_key'");
    if (envClaudeKey && envClaudeKey.startsWith('sk-ant-')) {
      globalAnthropicApiKey = envClaudeKey;
      if (!keyRow || keyRow.value !== envClaudeKey) {
        await saveSessionValue('anthropic_api_key', envClaudeKey);
      }
    } else if (keyRow && keyRow.value && keyRow.value.startsWith('sk-ant-')) {
      globalAnthropicApiKey = keyRow.value.trim();
      process.env.ANTHROPIC_API_KEY = globalAnthropicApiKey;
    }

    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'preferred_model'");
    if (row && row.value) {
      if (row.value === 'gemini-3.89-flash') {
        globalPreferredModel = 'gemini-3.8-flash';
        await saveSessionValue('preferred_model', 'gemini-3.8-flash');
      } else if (row.value.includes('2.5') || row.value.includes('2.0') || row.value.includes('gemini-2')) {
        console.log(`[Setting Cleanup] Legacy preferred model '${row.value}' detected in DB. Resetting to gemini-3.5-flash-lite.`);
        globalPreferredModel = 'gemini-3.5-flash-lite';
        await saveSessionValue('preferred_model', 'gemini-3.5-flash-lite');
      } else {
        globalPreferredModel = row.value;
        console.log(`[Setting Loaded] Preferred Model: ${globalPreferredModel}`);
      }
    }
    const stageRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'stage_preferred_models'");
    if (stageRow && stageRow.value) {
      try {
        const parsedStages = JSON.parse(stageRow.value);
        updateStageModels(parsedStages);
        console.log('[Setting Loaded] Stage Models:', JSON.stringify(globalStageModels));
      } catch (e) {}
    } else {
      await saveSessionValue('stage_preferred_models', JSON.stringify(globalStageModels));
    }
    const fallbackRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'grading_allow_fallback'");
    if (fallbackRow && fallbackRow.value !== undefined && fallbackRow.value !== null) {
      globalAllowGradingFallback = String(fallbackRow.value).trim().toLowerCase() === 'true';
      console.log(`[Setting Loaded] Allow Grading Fallback: ${globalAllowGradingFallback}`);
    }
  } catch (e) {
    console.warn("Failed to load preferred model setting:", e);
  }
}

export function updatePreferredModel(model) {
  globalPreferredModel = model;
}

export async function saveSessionValue(key, value) {
  try {
    // Optimization: skip write entirely if the stored value is already identical
    // This is the most common case during quiz autosave (user hasn't changed anything meaningful)
    const existing = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);
    if (existing && existing.value === value) return;

    // Use UPSERT for atomicity and efficiency
    await dbQuery.run(
      `INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
      [key, value]
    );
  } catch (err) {
    // Fallback: DELETE + INSERT for DB engines or edge cases where ON CONFLICT fails
    try {
      await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
      await dbQuery.run(
        'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [key, value]
      );
    } catch (e2) {
      if (e2.code === '23505' || String(e2).includes('UNIQUE')) {
        await dbQuery.run(
          'UPDATE app_session SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
          [value, key]
        );
      } else {
        throw e2;
      }
    }
  }
}

export function normalizeGeminiModel(modelName) {
  if (!modelName || typeof modelName !== 'string') return 'gemini-3.5-flash-lite';
  const name = modelName.trim().toLowerCase();

  if (name.startsWith('gemini-')) {
    return name;
  }

  return 'gemini-3.5-flash-lite';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function updateProgress(progressId, step, message, percentage = null) {
  if (!progressId) return;
  const existing = global.progressTracker.get(progressId) || {};
  let finalPercentage = percentage !== null ? percentage : existing.percentage || 0;
  if (percentage !== null && existing.step === step && existing.percentage && percentage < existing.percentage && percentage < 100) {
    finalPercentage = existing.percentage;
  }
  global.progressTracker.set(progressId, {
    step: step !== undefined ? step : existing.step || 1,
    message: message || existing.message || '',
    percentage: finalPercentage,
    timestamp: Date.now()
  });
}

export function reportLlmProgress(options, scenario, modelName) {
  if (options && options.progressId && !options.skipProgressUpdate) {
    const step = scenario === 'validation' ? 2 : 1;
    let stageText = '';
    const modelUpper = modelName ? modelName.toUpperCase() : 'AI';
    if (scenario === 'question') {
      stageText = `1단계: ${modelUpper} 엔진으로 예상 문제 생성 중...`;
    } else if (scenario === 'validation') {
      stageText = `2단계: ${modelUpper} 엔진으로 생성된 문제 검증 및 자가교정 중...`;
    } else if (scenario === 'grading') {
      stageText = `1단계: ${modelUpper} 엔진으로 제출 답안 채점 중...`;
    } else if (scenario === 'tutor') {
      stageText = `1단계: ${modelUpper} 엔진으로 AI 튜터 피드백 생성 중...`;
    } else if (scenario === 'formula') {
      stageText = `1단계: ${modelUpper} 엔진으로 수식 분석 및 튜터 답변 생성 중...`;
    } else if (scenario === 'source-search' || scenario === 'source') {
      stageText = `1단계: ${modelUpper} 엔진으로 출처 검색 및 국가설계기준 대조 중...`;
    } else if (scenario === 'option-explanation') {
      stageText = `1단계: ${modelUpper} 엔진으로 보기 오답 원인 분석 중...`;
    } else {
      stageText = `1단계: ${modelUpper} 엔진으로 처리 중...`;
    }
    
    const progress = global.progressTracker.get(options.progressId);
    let percentage = progress ? progress.percentage : 0;
    if (step === 2) {
      if (percentage < 50) percentage = 50;
    } else {
      if (percentage === 0) percentage = 15;
    }
    updateProgress(options.progressId, step, stageText, percentage);
  }
}

export function reportValidationProgress(progressId, total) {
  if (!progressId) return;
  const progress = global.progressTracker.get(progressId) || {};
  const validatedCount = (progress.validatedCount || 0) + 1;
  const percentage = Math.floor(50 + (validatedCount / total) * 50);
  global.progressTracker.set(progressId, {
    ...progress,
    step: 2,
    validatedCount,
    totalCount: total,
    message: `2단계: 생성 문제 정합성 검토 중... (${validatedCount}/${total} 완료)`,
    percentage: Math.min(percentage, 100),
    timestamp: Date.now()
  });
}

export function startBackendProgressTimer(progressId, step, initialMessage, maxPercentage = 88, intervalMs = 700, stepIncrement = 3) {
  if (!progressId) return null;
  const existing = global.progressTracker.get(progressId);
  let currentPercent = existing && existing.percentage > 10 ? existing.percentage : 10;
  updateProgress(progressId, step, initialMessage, currentPercent);
  
  const timer = setInterval(() => {
    const remaining = maxPercentage - currentPercent;
    let increment = stepIncrement;
    if (remaining < 15) increment = 1;
    else if (remaining < 30) increment = 2;
    
    currentPercent = Math.min(currentPercent + increment, maxPercentage);
    const progress = global.progressTracker.get(progressId);
    if (progress) {
      updateProgress(progressId, progress.step || step, progress.message || initialMessage, currentPercent);
      if (currentPercent >= maxPercentage) {
        clearInterval(timer);
      }
    } else {
      clearInterval(timer);
    }
  }, intervalMs);
  return timer;
}

export function stopBackendProgressTimer(progressId, percentage, message, isSuccess, timer = null) {
  if (timer) {
    try { clearInterval(timer); } catch (e) {}
  }
  updateProgress(progressId, 2, message, percentage);
}

export function normalizeClaudeModel(modelName, scenario = 'default', options = {}) {
  if (!modelName || typeof modelName !== 'string') return 'claude-sonnet-5-5';
  const name = modelName.trim().toLowerCase();
  if (name === 'claude-hybrid') {
    if (options.hybridRole === 'deep') return 'claude-sonnet-5-5';
    if (options.hybridRole === 'fast' || scenario === 'general' || scenario === 'source-search' || scenario === 'source' || scenario === 'slides') {
      return 'claude-haiku-5-5';
    }
    return 'claude-sonnet-5-5';
  }
  if (name.startsWith('claude-')) return name;
  return 'claude-sonnet-5-5';
}

// Server-side LLM Concurrency Semaphore & Rate-Limit Backoff Controller
// [Blocker-2 Fix]: MAX_CONCURRENT_LLM=8 (클라이언트 6워커 수용 + 여유 슬롯 2개), 대기 예산 20초(deadline 기반), 백오프 sleep 중에는 슬롯을 즉시 반환하도록 네트워크 호출 단위로 슬롯 점유
export const MAX_CONCURRENT_LLM = 8;
export const MAX_SEMAPHORE_QUEUE = 24;
export const MAX_QUEUE_WAIT_MS = 20000;
let activeLlmCount = 0;
const semaphoreWaitQueue = [];

export function getLlmSemaphoreStats() {
  return {
    activeLlmCount,
    queuedCount: semaphoreWaitQueue.length,
    maxConcurrent: MAX_CONCURRENT_LLM,
    maxQueue: MAX_SEMAPHORE_QUEUE
  };
}

export async function acquireLlmSlot(deadlineAt) {
  if (activeLlmCount < MAX_CONCURRENT_LLM) {
    activeLlmCount++;
    return;
  }
  const now = Date.now();
  const remainingForQueue = deadlineAt ? (deadlineAt - now - 2000) : MAX_QUEUE_WAIT_MS;
  if (semaphoreWaitQueue.length >= MAX_SEMAPHORE_QUEUE || remainingForQueue <= 200) {
    throw new Error('LLM 동시 요청 대기열 초과 또는 데드라인 임박 (Concurrency Queue Full)');
  }
  const waitBudgetMs = Math.min(MAX_QUEUE_WAIT_MS, Math.max(200, remainingForQueue));
  await new Promise((resolve, reject) => {
    const entry = {
      resolve: () => {
        clearTimeout(entry.timer);
        activeLlmCount++;
        resolve();
      },
      timer: setTimeout(() => {
        const idx = semaphoreWaitQueue.indexOf(entry);
        if (idx !== -1) semaphoreWaitQueue.splice(idx, 1);
        reject(new Error(`LLM 세마포어 대기 시간 초과 (${waitBudgetMs}ms)`));
      }, waitBudgetMs)
    };
    semaphoreWaitQueue.push(entry);
  });
}

export function releaseLlmSlot() {
  activeLlmCount = Math.max(0, activeLlmCount - 1);
  if (semaphoreWaitQueue.length > 0 && activeLlmCount < MAX_CONCURRENT_LLM) {
    const nextEntry = semaphoreWaitQueue.shift();
    if (nextEntry && typeof nextEntry.resolve === 'function') {
      nextEntry.resolve();
    }
  }
}

export async function withLlmConcurrencySlot(deadlineAt, fn) {
  await acquireLlmSlot(deadlineAt);
  try {
    return await fn();
  } finally {
    releaseLlmSlot();
  }
}

export async function callLLMWithFailover(systemInstruction, userPrompt, image = null, scenario = 'default', options = {}) {
  const defaultBudgetMs = scenario === 'grading' ? 42000 : (scenario === 'slides' ? 95000 : 52000);
  const totalBudgetMs = options.timeoutBudgetMs || defaultBudgetMs;
  const deadlineAt = options.deadlineAt || (Date.now() + totalBudgetMs);
  return await _callLLMWithFailoverCore(systemInstruction, userPrompt, image, scenario, { ...options, deadlineAt });
}

async function _callLLMWithFailoverCore(systemInstruction, userPrompt, image = null, scenario = 'default', options = {}) {
  const defaultBudgetMs = scenario === 'grading' ? 42000 : (scenario === 'slides' ? 95000 : 52000);
  const deadlineAt = options.deadlineAt || (Date.now() + defaultBudgetMs);
  // SVG_DIAGRAM_PROMPT는 어설픈 그림 강제 방지를 위해 문제 출제에서 제외.
  // CHART_DIAGRAM_PROMPT는 5번 인터랙티브 그래프해석 문제의 Recharts 규격 유지를 위해 문제 출제 시 필수 포함.
  // 단, 차트 출력이 불필요한 단순 텍스트 시나리오(grading, general)에는 붙이지 않는다.
  const diagramInstructions = NO_CHART_PROMPT_SCENARIOS.has(scenario) ? '' : ('\n\n' + CHART_DIAGRAM_PROMPT);
  const finalSystemInstruction = (systemInstruction || '') + diagramInstructions;
  const primaryKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim().replace(/^['"]|['"]$/g, '') : null;
  const secondaryKey = process.env.GEMINI_API_KEY_SECONDARY ? process.env.GEMINI_API_KEY_SECONDARY.trim().replace(/^['"]|['"]$/g, '') : null;
  const tertiaryKey = process.env.GEMINI_API_KEY_TERTIARY ? process.env.GEMINI_API_KEY_TERTIARY.trim().replace(/^['"]|['"]$/g, '') : null;
  let anthropicKey = (process.env.ANTHROPIC_API_KEY || globalAnthropicApiKey || '').trim().replace(/^['"]|['"]$/g, '');
  if (!anthropicKey) {
    try {
      const keyRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'anthropic_api_key'");
      if (keyRow && keyRow.value && keyRow.value.startsWith('sk-ant-')) {
        anthropicKey = keyRow.value.trim();
        globalAnthropicApiKey = anthropicKey;
        process.env.ANTHROPIC_API_KEY = anthropicKey;
      }
    } catch (e) {}
  }

  const keyErrors = [];
  const hasImage = Array.isArray(image)
    ? image.some(img => img && img.data && img.mimeType)
    : !!(image && image.data && image.mimeType);

  const executionList = [];

  const targetPref = resolveStageModel(scenario, options);
  const activeStage = inferStageFromScenario(scenario, options);
  const isGradingStage = activeStage === 'grading';
  const isClaudePreferred = targetPref.trim().toLowerCase().startsWith('claude-');
  const allowFallback = (options && typeof options.allowFallback === 'boolean')
    ? options.allowFallback
    : (isGradingStage ? globalAllowGradingFallback : true);
  const primaryActualModel = isClaudePreferred
    ? normalizeClaudeModel(targetPref, scenario, options)
    : normalizeGeminiModel(targetPref);

  const addClaudeTasks = () => {
    if (!anthropicKey || !anthropicKey.startsWith('sk-ant-')) return;
    const resolvedPrimaryClaude = normalizeClaudeModel(targetPref, scenario, options);
    let claudeModels;
    if (isGradingStage) {
      if (!allowFallback) {
        claudeModels = [resolvedPrimaryClaude];
      } else {
        const secondaryClaude = resolvedPrimaryClaude === 'claude-sonnet-5-5' ? 'claude-haiku-5-5' : 'claude-sonnet-5-5';
        claudeModels = [...new Set([resolvedPrimaryClaude, secondaryClaude])];
      }
    } else if (isClaudePreferred) {
      claudeModels = (scenario === 'slides')
        ? [resolvedPrimaryClaude]
        : [...new Set([resolvedPrimaryClaude, 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'])];
    } else {
      claudeModels = ['claude-sonnet-5-5', 'claude-haiku-5-5'];
    }
    for (const cm of claudeModels) {
      executionList.push({
        key: anthropicKey,
        label: 'Claude Key',
        model: cm,
        actualModel: normalizeClaudeModel(cm, scenario, options),
        type: 'claude'
      });
    }
  };

  const addGeminiTasks = () => {
    const keys = [];
    if (primaryKey && !primaryKey.startsWith('gsk_')) keys.push({ key: primaryKey, label: 'Key #1' });
    if (secondaryKey && !secondaryKey.startsWith('gsk_') && secondaryKey !== primaryKey) keys.push({ key: secondaryKey, label: 'Key #2' });
    if (tertiaryKey && !tertiaryKey.startsWith('gsk_') && tertiaryKey !== primaryKey && tertiaryKey !== secondaryKey) keys.push({ key: tertiaryKey, label: 'Key #3' });

    const geminiPref = isClaudePreferred ? 'gemini-3.5-flash-lite' : targetPref;
    let rawFallbacks;
    if (isGradingStage) {
      rawFallbacks = allowFallback
        ? [geminiPref, 'gemini-3.5-flash-lite', 'gemini-3.8-flash']
        : [geminiPref];
    } else {
      rawFallbacks = [
        geminiPref,
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
        'gemini-3.7-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-4-hydrogen'
      ];
    }
    const uniqueRaw = [...new Set(rawFallbacks.filter(Boolean))];

    // [Interleaved Key Rotation]: 동일 키 6개 모델 연속 시도로 타임아웃 낭비 방지
    // 선호 모델을 모든 키(Key #1 -> Key #2 -> Key #3)에 걸쳐 먼저 시도한 뒤 차순위 모델로 순연
    for (const modelName of uniqueRaw) {
      const actual = normalizeGeminiModel(modelName);
      for (const k of keys) {
        executionList.push({ key: k.key, label: k.label, model: modelName, actualModel: actual, type: 'gemini' });
      }
    }
  };

  if (isClaudePreferred) {
    addClaudeTasks();
    if (!isGradingStage || allowFallback) {
      addGeminiTasks();
    }
  } else {
    addGeminiTasks();
    if (options.allowCrossProviderFallback && (!isGradingStage || allowFallback)) {
      addClaudeTasks();
    }
  }

  let attemptedAny = false;
  let attemptCount = 0;
  const attemptsTrace = [];
  const emitModelMeta = (task, actualModelName) => {
    const switchedModel = actualModelName !== primaryActualModel;
    const meta = {
      modelRequested: targetPref,
      resolvedPrimaryModel: primaryActualModel,
      modelUsed: actualModelName,
      configuredModelUsed: task.model,
      provider: task.type,
      keyLabel: task.label,
      attemptCount,
      keyRotated: attemptCount > 1 && !switchedModel,
      switchedModel,
      failoverOccurred: switchedModel,
      allowFallback,
      attempts: attemptsTrace
    };
    if (options && options.metaOut && typeof options.metaOut === 'object') {
      Object.assign(options.metaOut, meta);
    }
    if (options && typeof options.onModelResolved === 'function') {
      try { options.onModelResolved(meta); } catch {}
    }
  };
  const failedKeys = new Set();
  const rateLimitedKeyModels = new Set();
  const retriedTaskIndices = new Set();

  for (let idx = 0; idx < executionList.length; idx++) {
    const remainingBudget = deadlineAt - Date.now();
    if (remainingBudget < 1500 && attemptedAny) {
      console.warn(`[LLM Deadline Budget] 남은 시간 예산(${remainingBudget}ms) 부족으로 추가 모델 페일오버를 중단합니다.`);
      break;
    }
    const task = executionList[idx];
    const key = task.key;

    if (failedKeys.has(key)) {
      continue;
    }
    const actualModelName = task.actualModel || (task.type === 'claude' ? normalizeClaudeModel(task.model, scenario, options) : normalizeGeminiModel(task.model));
    if (rateLimitedKeyModels.has(`${key}:${actualModelName}`)) {
      continue;
    }

    const maskedKey = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    const modelName = task.model;

    attemptedAny = true;
    attemptCount++;
    attemptsTrace.push({
      attempt: attemptCount,
      provider: task.type,
      configuredModel: modelName,
      actualModel: actualModelName,
      keyLabel: task.label
    });

    if (task.type === 'claude') {
      try {
        console.log(`[Claude 시도] ${task.label} (${maskedKey}), 모델: ${modelName} -> ${actualModelName}`);
        reportLlmProgress(options, scenario, modelName);

        const contentParts = [];
        if (Array.isArray(image)) {
          image.forEach(img => {
            if (img && img.data && img.mimeType) {
              contentParts.push({
                type: 'image',
                source: { type: 'base64', media_type: img.mimeType, data: img.data }
              });
            }
          });
        } else if (image && image.data && image.mimeType) {
          contentParts.push({
            type: 'image',
            source: { type: 'base64', media_type: image.mimeType, data: image.data }
          });
        }
        contentParts.push({ type: 'text', text: String(userPrompt || '') });

        const jsonInstruction = (scenario === 'grading' || scenario === 'question' || scenario === 'slides')
          ? '\n\n[CRITICAL JSON RULE]: 반드시 마크다운 코드블록(```json)이나 부연 설명 없이 순수 유효 JSON만 출력하십시오.'
          : '';

        // [P0/P1 Fix]: 세마포어 슬롯 획득 이후에 AbortController 타이머를 시작하고 응답 본문 수신까지 완료 후 finally에서 clearTimeout 보장
        const maxTokensForScenario = (scenario === 'slides' || scenario === 'question') ? 16384 : 8192;
        const data = await withLlmConcurrencySlot(deadlineAt, async () => {
          const controller = new AbortController();
          const perAttemptCapMs = scenario === 'grading' ? 28000 : (scenario === 'slides' ? 48000 : 50000);
          const perAttemptTimeoutMs = Math.min(
            perAttemptCapMs,
            Math.max(2500, (deadlineAt - Date.now()) - 400)
          );
          const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeoutMs);
          try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
              },
              body: JSON.stringify({
                model: actualModelName,
                max_tokens: maxTokensForScenario,
                system: (finalSystemInstruction || '') + jsonInstruction,
                messages: [{ role: 'user', content: contentParts }]
              }),
              signal: controller.signal
            });
            if (!response.ok) {
              const errText = await response.text();
              const errObj = new Error(`Claude HTTP ${response.status}: ${errText}`);
              errObj.status = response.status;
              const retryAfterHeader = response.headers?.get ? response.headers.get('retry-after') : null;
              if (retryAfterHeader) {
                const parsedSec = parseFloat(retryAfterHeader);
                if (!isNaN(parsedSec) && parsedSec > 0) {
                  errObj.retryAfterMs = Math.ceil(parsedSec * 1000);
                }
              }
              throw errObj;
            }
            return await response.json();
          } finally {
            clearTimeout(timeoutId);
          }
        });
        let text = (data.content || [])
          .filter(part => part && part.type === 'text')
          .map(part => part.text)
          .join('\n')
          .trim();
        text = text.replace(/^[ \t]*#[ \t]*$/gm, '');
        if (text) {
          if (scenario === 'slides' || scenario === 'question') {
            if (data.stop_reason === 'max_tokens') {
              throw new Error(`Claude JSON output truncated by max_tokens (${maxTokensForScenario})`);
            }
            try {
              parseLlmJson(text);
            } catch (jsonErr) {
              throw new Error(`Claude JSON parse validation failed (${jsonErr.message})`);
            }
          }
          console.log(`[Claude 성공] ${task.label} (${maskedKey}), 모델: ${modelName} (${actualModelName})`);
          emitModelMeta(task, actualModelName);
          return text;
        } else {
          throw new Error('Claude response empty');
        }
      } catch (err) {
        console.warn(`[Claude 시도 실패] ${task.label} (${maskedKey}), 모델: ${task.model}: ${err.message?.substring(0, 120)}`);
        keyErrors.push(`${task.label} (${task.model}): ${err.message?.substring(0, 120)}`);
        if (err.status === 429 || err.status === 529 || err.message?.includes('rate_limit') || err.message?.includes('overloaded')) {
          const jitterMs = Math.floor(Math.random() * 300);
          const desiredWaitMs = err.retryAfterMs ? (err.retryAfterMs + jitterMs) : (1000 + jitterMs);
          const remainingAfterWait = (deadlineAt - Date.now()) - desiredWaitMs;
          if (remainingAfterWait >= 3500 && !retriedTaskIndices.has(idx)) {
            retriedTaskIndices.add(idx);
            console.log(`[Claude 429/529 백오프] ${desiredWaitMs}ms 대기 후 동일 모델(${actualModelName}) 1회 재시도...`);
            await sleep(desiredWaitMs);
            idx--;
            continue;
          } else if (remainingAfterWait >= 3500) {
            await sleep(Math.min(desiredWaitMs, 1500));
          }
        }
        if (err.status === 401 || err.status === 403 || err.message?.includes('authentication_error')) {
          failedKeys.add(key);
        }
        continue;
      }
    }

    try {
      console.log(`[Gemini 시도] ${task.label} (${maskedKey}), 모델: ${modelName} -> ${actualModelName}`);
      const genAI = new GoogleGenerativeAI(key);

      let generateContentArg = [userPrompt];
      if (Array.isArray(image)) {
        image.forEach(img => {
          if (img && img.data && img.mimeType) {
            generateContentArg.push({
              inlineData: {
                mimeType: img.mimeType,
                data: img.data
              }
            });
          }
        });
      } else if (image && image.data && image.mimeType) {
        generateContentArg.push({
          inlineData: {
            mimeType: image.mimeType,
            data: image.data
          }
        });
      }
      if (generateContentArg.length === 1) {
        generateContentArg = userPrompt;
      }

      reportLlmProgress(options, scenario, modelName);
      // [Blocker-5 / P0 Fix]: 세마포어 슬롯 획득 이후 SDK timeout(AbortSignal) + 안전 타이머를 시작해 타임아웃 시 HTTP 소켓도 즉시 중단
      const result = await withLlmConcurrencySlot(deadlineAt, async () => {
        const perCallCapMs = scenario === 'grading'
          ? (actualModelName === 'gemini-4-hydrogen' ? 22000 : 18000)
          : 50000;
        const timeoutMs = Math.min(
          perCallCapMs,
          Math.max(2500, (deadlineAt - Date.now()) - 400)
        );
        const model = genAI.getGenerativeModel({
          model: actualModelName,
          systemInstruction: finalSystemInstruction,
          generationConfig: {
            temperature: options.temperature !== undefined ? options.temperature : (scenario === 'tutor' ? 0.7 : 0.2),
            ...((scenario === 'grading' || scenario === 'question' || scenario === 'slides') ? { responseMimeType: 'application/json' } : {})
          }
        }, { apiVersion: 'v1beta', timeout: timeoutMs });
        let geminiTimeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
          geminiTimeoutId = setTimeout(
            () => reject(new Error(`Gemini request timeout after ${timeoutMs}ms`)),
            timeoutMs + 250
          );
        });
        try {
          return await Promise.race([
            model.generateContent(generateContentArg),
            timeoutPromise
          ]);
        } finally {
          if (geminiTimeoutId !== null) clearTimeout(geminiTimeoutId);
        }
      });
      let text = result.response.text().trim();
      text = text.replace(/^[ \t]*#[ \t]*$/gm, '');
      if (text) {
        console.log(`[Gemini 성공] ${task.label} (${maskedKey}), 모델: ${modelName} (${actualModelName})`);
        emitModelMeta(task, actualModelName);
        return text;
      } else {
        throw new Error('Gemini response empty');
      }
    } catch (err) {
      console.warn(`[API 시도 실패] ${task.label} (${maskedKey}), 모델: ${task.model}: ${err.message?.substring(0, 120)}`);
      keyErrors.push(`${task.label} (${task.model}): ${err.message?.substring(0, 120)}`);

      const isQuota = err.status === 429 || err.message?.includes('429') || err.message?.includes('Quota') || err.message?.includes('quota') || err.message?.includes('rate');
      const isNotFoundModel = err.status === 404 || err.message?.includes('404') || err.message?.includes('is not found') || err.message?.includes('models/');
      const isAuthError = err.message?.includes('API_KEY_INVALID') || err.message?.includes('API key not valid') || err.status === 401 || err.status === 403;

      if (isAuthError) {
        failedKeys.add(key);
        console.log(`[키 장애 감지] ${task.label} 키 유효성 오류(Auth)로 인해 다음 키로 즉시 페일오버합니다.`);
        continue;
      }

      if (isQuota) {
        rateLimitedKeyModels.add(`${key}:${actualModelName}`);
        console.log(`[모델 쿼터 초과 감지] ${task.label} (${task.model} -> ${actualModelName}) 쿼터 초과(429). 다음 순번 모델/키로 즉시 페일오버합니다.`);
        continue;
      }

      if (isNotFoundModel) {
        console.log(`[모델 미존재] 모델 '${task.model}'이 Gemini API에 존재하지 않으므로 재시도 없이 다음 모델로 건너땁니다.`);
        continue;
      }

      continue;
    }
  }

  if (hasImage && !attemptedAny) {
    throw new Error('이미지 분석에는 Gemini API 키가 필요하지만, 현재 등록된 Gemini API 키가 없습니다. 관리자에게 문의해 주세요.');
  }

  if (options && options.metaOut && typeof options.metaOut === 'object') {
    Object.assign(options.metaOut, {
      modelRequested: targetPref,
      resolvedPrimaryModel: primaryActualModel,
      modelUsed: null,
      failoverOccurred: false,
      allowFallback,
      attemptCount,
      attempts: attemptsTrace,
      failed: true
    });
  }
  if (keyErrors.length > 0) {
    const uniqueErrors = [...new Set(keyErrors)].slice(0, 3);
    if (hasImage) {
      throw new Error(`이미지 분석을 위한 모든 API 키가 할당량 초과(429) 또는 오류로 인해 실패했습니다. (상세 오류 요약: ${uniqueErrors.join(' | ')})`);
    } else {
      throw new Error(`[AI 호출 실패] ${uniqueErrors.join(' | ')}`);
    }
  }

  throw new Error('모든 API 키 호출에 실패하였습니다.');
}

global.standardsAnalysisCache = global.standardsAnalysisCache || new Map();

export async function analyzeStandardsBeforeTask(progressId, topicTitle, standards, scenario = 'generation', preferredModel = null) {
  // [Performance Optimization] 사전 지침 분석 단계 생략
  // 메인 시스템 프롬프트(systemInstruction)에 전체 지침이 이미 모두 포함되어 전달되므로,
  // 10초 이상 소요되는 불필요한 사전 요약 LLM 호출을 건너뛰고 즉시 본 태스크로 진입하여 성능을 최적화합니다.
  if (progressId) {
    updateProgress(progressId, 0, '0단계: 사전 절대 지침 통과 (즉시 적용)', 20);
  }
  return '';
}

// Helper: Stream detection flags
function isBufferPng(buf) {
  if (!buf || buf.length < 8) return false;
  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
         buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;
}
function isBufferJpeg(buf) {
  if (!buf || buf.length < 3) return false;
  return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
function isBufferGif(buf) {
  if (!buf || buf.length < 4) return false;
  return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
}
function isBufferWebp(buf) {
  if (!buf || buf.length < 12) return false;
  return buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
}

export async function getTopicText(topic, fileUtils, ocrPlugin, pdfParse) {
  if (topic && topic.extracted_text) {
    return topic.extracted_text;
  }

  const topicId = topic ? (topic.id || topic.topic_id) : null;
  const cacheKey = `topic_extracted_text_${topicId}`;

  if (topicId) {
    try {
      const cached = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [cacheKey]);
      if (cached && cached.value) {
        console.log(`[Cache Hit] Serving cached extracted text for topicId=${topicId}`);
        return cached.value;
      }
    } catch (cacheErr) {
      console.warn(`[Cache Read Error] Failed to read text cache for topicId=${topicId}:`, cacheErr);
    }
  }

  let pdfData = topic ? topic.pdf_data : null;
  let rawPdfName = topic ? topic.pdf_name : null;
  if (!pdfData && topicId) {
    try {
      const dbRow = await dbQuery.get('SELECT pdf_name, pdf_data, pdf_url FROM topics WHERE id = ?', [topicId]);
      if (dbRow) {
        pdfData = dbRow.pdf_data;
        rawPdfName = dbRow.pdf_name;
        if (dbRow.pdf_url && (!pdfData || pdfData.length === 0)) {
          console.log(`Lazy loading PDF/HTML buffer from Vercel Blob URL: ${dbRow.pdf_url}`);
          const headers = {};
          if (process.env.BLOB_READ_WRITE_TOKEN) {
            headers['Authorization'] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
          }
          const response = await fetch(dbRow.pdf_url, { headers });
          if (!response.ok) throw new Error(`Blob fetch failed with status: ${response.status}`);
          pdfData = Buffer.from(await response.arrayBuffer());
        }
        if (topic) {
          topic.pdf_data = pdfData;
          topic.pdf_name = rawPdfName;
        }
      }
    } catch (dbErr) {
      console.warn(`[DB Fetch Error] Failed to lazy load pdf_data for topicId=${topicId}:`, dbErr);
    }
  }

  if (!pdfData) {
    return '수기로 등록한 토픽이며 첨부된 보고서 파일이 없습니다.';
  }

  const pdfName = (rawPdfName || '').toLowerCase();
  const isImage = pdfName.endsWith('.png') || pdfName.endsWith('.jpg') || pdfName.endsWith('.jpeg') || pdfName.endsWith('.gif') || pdfName.endsWith('.webp');

  let fileText = '';
  if (isImage) {
    try {
      const mimeType = pdfName.endsWith('.png') ? 'image/png' :
                       (pdfName.endsWith('.gif') ? 'image/gif' :
                        (pdfName.endsWith('.webp') ? 'image/webp' : 'image/jpeg'));
      const base64Data = topic.pdf_data.toString('base64');
      fileText = await ocrPlugin.extractTextFromCalculationImage(base64Data, mimeType, callLLMWithFailover);
    } catch (err) {
      console.error(`[OCR Image Extraction] Failed for topicId=${topicId}:`, err);
      fileText = `[이미지 OCR 추출 실패: ${err.message}]`;
    }
  } else {
    const isHtml = topic.pdf_name && (
      topic.pdf_name.toLowerCase().endsWith('.html') || 
      topic.pdf_name.toLowerCase().endsWith('.htm') || 
      fileUtils.isBufferHtml(topic.pdf_data)
    );
    if (isHtml) {
      try {
        const rawHtml = fileUtils.decodeHtmlBuffer(topic.pdf_data);
        fileText = fileUtils.htmlToPlainText(rawHtml);

        const imgRegex = /<img[^>]+src=["']data:(image\/[^;]+);base64,([^"']+)["']/gi;
        let match;
        let ocrTexts = [];
        while ((match = imgRegex.exec(rawHtml)) !== null) {
          const mimeType = match[1];
          const base64Data = match[2];
          console.log(`[OCR Embedded Image] Found embedded base64 image in HTML. Running OCR...`);
          try {
            const ocrText = await ocrPlugin.extractTextFromCalculationImage(base64Data, mimeType, callLLMWithFailover);
            if (ocrText) {
              ocrTexts.push(ocrText);
            }
          } catch (ocrErr) {
            console.error('[OCR Embedded Image] Failed to run OCR on embedded image:', ocrErr);
          }
        }
        if (ocrTexts.length > 0) {
          fileText = `[이미지 OCR 추출 텍스트]:\n${ocrTexts.join('\n\n')}\n\n[HTML 본문 텍스트]:\n${fileText}`;
        }
      } catch (htmlErr) {
        console.warn('Failed to parse HTML string:', htmlErr);
      }
    } else {
      try {
        const parsedPdf = await pdfParse(topic.pdf_data);
        fileText = parsedPdf.text || '';
      } catch (pdfErr) {
        console.warn('Failed to parse PDF binary:', pdfErr);
      }
    }
    fileText = fileUtils.mergeVerticalText(fileText);
  }

  if (topicId && fileText && fileText.length > 0) {
    try {
      await saveSessionValue(cacheKey, fileText);
    } catch (saveErr) {
      console.warn(`[Cache Write Error] Failed to cache extracted text for topicId=${topicId}:`, saveErr.message);
    }
  }

  return fileText;
}

export async function searchSourceDocumentWithGeminiLite(systemInstruction, userPrompt, image = null, options = {}) {
  return await callLLMWithFailover(systemInstruction, userPrompt, image, 'source-search', {
    ...options,
    isSourceSearch: true
  });
}

let topicGroundingCache = {
  rows: null,
  loadedAt: 0
};

async function getCachedTopicsForGrounding() {
  const now = Date.now();
  if (topicGroundingCache.rows && (now - topicGroundingCache.loadedAt < 60000)) {
    return topicGroundingCache.rows;
  }
  try {
    const rows = await dbQuery.all(
      `SELECT id, title, keywords, category, extracted_text 
       FROM topics 
       WHERE extracted_text IS NOT NULL AND extracted_text != ''`
    );
    topicGroundingCache.rows = Array.isArray(rows) ? rows : [];
    topicGroundingCache.loadedAt = now;
    return topicGroundingCache.rows;
  } catch (err) {
    console.warn('[TopicGrounding] Failed to load topics cache:', err.message);
    return topicGroundingCache.rows || [];
  }
}

/**
 * 질문 텍스트 또는 topicId를 기반으로 DB에 등록된 토픽 본문(extracted_text)을 검색하여
 * 프롬프트 주입용 컨텍스트 문자열로 반환합니다.
 */
export async function getMatchingTopicContent(queryText = '', topicId = null, maxChars = 5000) {
  try {
    const rows = await getCachedTopicsForGrounding();
    const numericId = Number(topicId);

    // 1. 명시적 topicId가 주어진 경우 최우선 매칭
    if (!isNaN(numericId) && numericId > 0) {
      let target = rows.find(r => Number(r.id) === numericId);
      if (!target) {
        target = await dbQuery.get(
          `SELECT id, title, keywords, category, extracted_text FROM topics WHERE id = ?`,
          [numericId]
        );
      }
      if (target && target.extracted_text && !target.extracted_text.includes('수기로 등록한 토픽')) {
        const text = selectRelevantExcerpt(target.extracted_text, queryText, maxChars);
        return `[📚 관련 등록 토픽 본문 (${target.title})]:\n${text}`;
      }
    }

    // 2. queryText 기반 키워드/제목 스마트 매칭
    const qClean = String(queryText || '').trim().toLowerCase();
    if (!qClean || qClean.length < 2 || rows.length === 0) return '';

    const GENERIC_WORDS = new Set([
      '및', '의', '에', '와', '과', '대한', '위한', '방법', '특성', '검토', '해석',
      '비교', '종류', '원인', '대책', '정의', '개념', '이론', '공법', '시험', '측정',
      '기준', '설계', '시공', '관리', '영향', '요소', '현상', '방지', '산정', '공식',
      '문제', '설명', '특징', '장단점', '차이점', '유도', '계산', '적용', '원리', '거동',
      '단순', '테스트', '질문', '결과', '이용한', '분석', '추정', '결정', '산출', '조사',
      '평가', '계획', '검증', '일반', '구조', '지반', '토질', '기초', '토목', '현장',
      '흙', '흙의', '지반의', '토질역학', '토질역학적', '지반공학', '지반공학적', '공학적', '역학적',
      '물리적', '보고서', '기술', '기술사', '토질및기초기술사', '서술형', '답안', '검토사항', '유의사항',
      '방안', '활용', '활용방안', '확보', '확보방안', '문제점', '대책시설', '상관관계', '아래', '파괴'
    ]);

    const isGenericToken = (tok) => {
      if (!tok || tok.length < 2) return true;
      if (GENERIC_WORDS.has(tok)) return true;
      const stripped = tok.replace(/(에서|으로|은|는|이|가|을|를|의|에|로|과|와|별|적)$/, '');
      if (!stripped || stripped.length < 2 || GENERIC_WORDS.has(stripped)) return true;
      return false;
    };

    const scored = [];
    for (const row of rows) {
      if (!row.extracted_text || row.extracted_text.includes('수기로 등록한 토픽')) continue;
      let score = 0;
      let matchedSpecificTerm = false;
      const titleLower = String(row.title || '').trim().toLowerCase();
      const titleCore = titleLower.replace(/\([^)]*\)/g, '').trim();

      if (titleLower && titleLower.length >= 2 && qClean.includes(titleLower)) {
        score += 25;
        matchedSpecificTerm = true;
      } else if (titleCore && titleCore.length >= 2 && qClean.includes(titleCore)) {
        score += 20;
        matchedSpecificTerm = true;
      }

      // 제목 단어 매칭
      const titleTokens = titleLower
        .split(/[\s,·/()[\]\-_]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2);

      for (const token of titleTokens) {
        if (qClean.includes(token)) {
          if (isGenericToken(token)) {
            score += 1;
          } else {
            score += 8;
            matchedSpecificTerm = true;
          }
        }
      }

      // 키워드 매칭
      const kwTokens = String(row.keywords || '')
        .toLowerCase()
        .split(/[\s,·/()[\]]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2);

      for (const kw of kwTokens) {
        if (qClean.includes(kw)) {
          if (isGenericToken(kw)) {
            score += 1;
          } else {
            score += 6;
            matchedSpecificTerm = true;
          }
        }
      }

      if (matchedSpecificTerm && score >= 8) {
        scored.push({ row, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.slice(0, 2);
    if (topMatches.length === 0) return '';

    const perTopicLimit = Math.floor(maxChars / topMatches.length);
    const blocks = topMatches.map(
      ({ row }) => `[📚 관련 등록 토픽 본문 (${row.title})]:\n${selectRelevantExcerpt(row.extracted_text, queryText, perTopicLimit)}`
    );
    return blocks.join('\n\n');
  } catch (err) {
    console.warn('[getMatchingTopicContent] Error:', err.message);
    return '';
  }
}


/**
 * 긴 본문에서 질문과 관련된 단락을 발췌하여 maxChars 이내로 반환합니다.
 * - 본문이 maxChars 이하이면 원문을 그대로 반환합니다.
 * - 첫 단락(정의/개요)은 항상 포함하고, 질문 토큰과 겹치는 단락을 가중치 순으로 채웁니다.
 * - 토큰 가중치는 문서 자체의 분포(IDF)로 계산하므로 별도 불용어 목록이 필요 없습니다.
 * - 점수가 있는 단락을 모두 채우고도 예산이 남으면 앞쪽 단락부터 채워 기존(앞부분 절단) 동작과 호환됩니다.
 * - 비연속 구간 사이에는 중략 표시를 넣어 발췌본임을 AI가 알 수 있게 합니다.
 */
const EXCERPT_GAP_MARK = '\n[…중략…]\n';
const EXCERPT_MAX_CHUNK = 1200;

export function selectRelevantExcerpt(text, queryText = '', maxChars = 5000) {
  const full = String(text || '').trim();
  if (full.length <= maxChars) return full;

  const chunkLimit = Math.min(EXCERPT_MAX_CHUNK, Math.max(250, Math.floor(maxChars * 0.45)));

  // 1. 단락 분할 (빈 줄 → 줄바꿈 → 고정 길이 순으로 세분화)
  const chunks = [];
  for (const block of full.split(/\n{2,}/)) {
    const b = block.trim();
    if (!b) continue;
    if (b.length <= chunkLimit) { chunks.push(b); continue; }
    let buf = '';
    for (const line of b.split('\n')) {
      if (buf && (buf.length + line.length + 1) > chunkLimit) { chunks.push(buf); buf = ''; }
      if (line.length > chunkLimit) {
        for (let i = 0; i < line.length; i += chunkLimit) chunks.push(line.slice(i, i + chunkLimit));
      } else {
        buf = buf ? `${buf}\n${line}` : line;
      }
    }
    if (buf) chunks.push(buf);
  }
  if (chunks.length === 0) return full.substring(0, maxChars);

  // 2. 질문 토큰 추출 (조사 제거)
  const tokens = [...new Set(
    String(queryText || '').toLowerCase()
      .split(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3]+/)
      .map(t => t.replace(/(에서|으로|은|는|이|가|을|를|의|에|로|과|와|별|적)$/, ''))
      .filter(t => t.length >= 2)
  )];

  // 3. 단락별 점수 (토큰 IDF 가중 합)
  const lowered = chunks.map(c => c.toLowerCase());
  const weights = tokens.map(tok => {
    const df = lowered.reduce((n, c) => n + (c.includes(tok) ? 1 : 0), 0);
    return df === 0 ? 0 : Math.log(1 + chunks.length / df);
  });
  const scores = lowered.map(c => tokens.reduce((s, tok, i) => s + (weights[i] && c.includes(tok) ? weights[i] : 0), 0));

  // 4. 선택: 첫 단락 필수 → 점수 높은 순 → 남는 예산은 앞쪽 단락 순
  const selected = new Set();
  let used = 0;
  const tryAdd = (idx) => {
    if (selected.has(idx)) return;
    const cost = chunks[idx].length + 2 + EXCERPT_GAP_MARK.length;
    if (used + cost > maxChars) return;
    selected.add(idx);
    used += cost;
  };
  tryAdd(0);
  chunks.map((_, i) => i).filter(i => scores[i] > 0).sort((a, b) => scores[b] - scores[a]).forEach(tryAdd);
  chunks.forEach((_, i) => tryAdd(i));
  if (selected.size === 0) return full.substring(0, maxChars);

  // 5. 원문 순서 복원 + 비연속 구간 중략 표시
  const order = [...selected].sort((a, b) => a - b);
  let out = '';
  order.forEach((idx, n) => {
    if (n > 0) out += (idx === order[n - 1] + 1) ? '\n\n' : EXCERPT_GAP_MARK;
    out += chunks[idx];
  });
  return out.length > maxChars ? out.substring(0, maxChars) : out;
}
