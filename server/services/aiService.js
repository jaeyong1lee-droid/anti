import { GoogleGenerativeAI } from '@google/generative-ai';
import { dbQuery } from '../database.js';
import { parseLlmJson } from '../utils/latexUtils.js';
import { CHART_DIAGRAM_PROMPT } from '../plugins/chartPlugin.js';
import { updateProgress, reportLlmProgress, startBackendProgressTimer, stopBackendProgressTimer } from './progressService.js';
import { saveSessionValue } from './sessionStore.js';
import { extractTopicText, getMatchingTopicContent, selectRelevantExcerpt } from './topicExtractor.js';

export { updateProgress, reportLlmProgress, startBackendProgressTimer, stopBackendProgressTimer };
export { saveSessionValue };
export { getMatchingTopicContent, selectRelevantExcerpt };

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

export function normalizeGeminiModel(modelName) {
  if (!modelName || typeof modelName !== 'string') return 'gemini-3.5-flash-lite';
  const name = modelName.trim().toLowerCase();

  if (name.startsWith('gemini-')) {
    return name;
  }

  return 'gemini-3.5-flash-lite';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const MODEL_OVERLOAD_COOLDOWN_MS = 60 * 1000;
const MODEL_TIMEOUT_COOLDOWN_MS = 45 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const INVALID_KEY_COOLDOWN_MS = 10 * 60 * 1000;
const transientOverloadedModels = new Map();
const transientRateLimitedKeyModels = new Map();
const transientInvalidKeys = new Map();

export async function callLLMWithFailover(systemInstruction, userPrompt, image = null, scenario = 'default', options = {}) {
  const defaultBudgetMs = scenario === 'grading'
    ? 42000
    : (scenario === 'slides' ? 95000 : (scenario === 'tutor' ? 110000 : 54000));
  const totalBudgetMs = options.timeoutBudgetMs || defaultBudgetMs;
  const deadlineAt = options.deadlineAt || (Date.now() + totalBudgetMs);
  return await _callLLMWithFailoverCore(systemInstruction, userPrompt, image, scenario, { ...options, deadlineAt });
}

async function _callLLMWithFailoverCore(systemInstruction, userPrompt, image = null, scenario = 'default', options = {}) {
  const defaultBudgetMs = scenario === 'grading'
    ? 42000
    : (scenario === 'slides' ? 95000 : (scenario === 'tutor' ? 110000 : 54000));
  const deadlineAt = options.deadlineAt || (Date.now() + defaultBudgetMs);
  // SVG_DIAGRAM_PROMPT는 어설픈 그림 강제 방지를 위해 문제 출제에서 제외.
  // CHART_DIAGRAM_PROMPT는 5번 인터랙티브 그래프해석 문제의 Recharts 규격 유지를 위해 문제 출제 시 필수 포함.
  // 단, 차트 출력이 불필요한 단순 텍스트 시나리오(grading, general) 및 skipChartPrompt 옵션 지정 시에는 붙이지 않는다.
  const skipChartPrompt = NO_CHART_PROMPT_SCENARIOS.has(scenario) || Boolean(options?.skipChartPrompt);
  const diagramInstructions = skipChartPrompt ? '' : ('\n\n' + CHART_DIAGRAM_PROMPT);
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
      claudeModels = (scenario === 'tutor')
        ? ['claude-haiku-5-5', 'claude-sonnet-5-5']
        : ['claude-sonnet-5-5', 'claude-haiku-5-5'];
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

  const nowMs = Date.now();
  const isModelInCooldown = (actualModelName) => {
    const exp = transientOverloadedModels.get(actualModelName);
    if (!exp) return false;
    if (exp <= nowMs) {
      transientOverloadedModels.delete(actualModelName);
      return false;
    }
    return true;
  };
  const isKeyKnownInvalid = (key) => {
    const exp = transientInvalidKeys.get(key);
    if (!exp) return false;
    if (exp <= nowMs) {
      transientInvalidKeys.delete(key);
      return false;
    }
    return true;
  };

  const addGeminiTasks = () => {
    const allKeys = [];
    if (primaryKey && !primaryKey.startsWith('gsk_')) allKeys.push({ key: primaryKey, label: 'Key #1' });
    if (secondaryKey && !secondaryKey.startsWith('gsk_') && secondaryKey !== primaryKey) allKeys.push({ key: secondaryKey, label: 'Key #2' });
    if (tertiaryKey && !tertiaryKey.startsWith('gsk_') && tertiaryKey !== primaryKey && tertiaryKey !== secondaryKey) allKeys.push({ key: tertiaryKey, label: 'Key #3' });

    const validKeys = allKeys.filter(k => !isKeyKnownInvalid(k.key));
    const keys = validKeys.length > 0 ? validKeys : allKeys;

    const geminiPref = isClaudePreferred ? 'gemini-3.5-flash-lite' : targetPref;
    let rawFallbacks;
    if (isGradingStage) {
      rawFallbacks = allowFallback
        ? [geminiPref, 'gemini-3.5-flash-lite', 'gemini-4-hydrogen', 'gemini-3.8-flash']
        : [geminiPref];
    } else {
      rawFallbacks = allowFallback ? [geminiPref, 'gemini-3.5-flash-lite'] : [geminiPref];
    }
    const uniqueRaw = [...new Set(rawFallbacks.filter(Boolean))];

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
    if (allowFallback) {
      addGeminiTasks();
    }
  } else {
    addGeminiTasks();
    if (allowFallback) {
      addClaudeTasks();
    }
  }

  // [Sticky Healthy Routing]: 자동 폴백 시 최근 503/타임아웃으로 쿨다운 중인 모델(프로바이더 불문)은 정상 모델 뒤로 배치
  // 단, tutor 시나리오에서는 사용자가 선택한 1순위 모델(primaryActualModel)을 항상 먼저 시도
  if (allowFallback && executionList.length > 1) {
    const keepPrimaryFirst = (scenario === 'tutor');
    const healthyTasks = [];
    const cooledTasks = [];
    for (const t of executionList) {
      const demote = isModelInCooldown(t.actualModel) && !(keepPrimaryFirst && t.actualModel === primaryActualModel);
      if (demote) {
        cooledTasks.push(t);
      } else {
        healthyTasks.push(t);
      }
    }
    executionList.length = 0;
    executionList.push(...healthyTasks, ...cooledTasks);
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
  const skippedModelsThisCall = new Set();
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
    if (skippedModelsThisCall.has(actualModelName)) {
      continue;
    }
    const pairKey = `${key}:${actualModelName}`;
    if (rateLimitedKeyModels.has(pairKey)) {
      continue;
    }
    const rlExp = transientRateLimitedKeyModels.get(pairKey);
    if (rlExp) {
      if (rlExp <= Date.now()) {
        transientRateLimitedKeyModels.delete(pairKey);
      } else {
        const hasAlternativeUntried = executionList.slice(idx + 1).some(t => {
          const m = t.actualModel || t.model;
          const tk = `${t.key}:${m}`;
          const tRl = transientRateLimitedKeyModels.get(tk);
          return !failedKeys.has(t.key) && !skippedModelsThisCall.has(m) && !rateLimitedKeyModels.has(tk) && !(tRl && tRl > Date.now());
        });
        if (hasAlternativeUntried) {
          continue;
        }
      }
    }
    const hasNextDistinctModel = executionList.slice(idx + 1).some(t => {
      const m = t.actualModel || t.model;
      return !failedKeys.has(t.key) && !skippedModelsThisCall.has(m) && m !== actualModelName;
    });

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
          const perAttemptCapMs = scenario === 'grading'
            ? 28000
            : (scenario === 'slides'
                ? 48000
                : (scenario === 'tutor'
                    ? 35000
                    : (hasNextDistinctModel ? 24000 : 45000)));
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

    let effectiveTimeoutMs = 0;
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
        const isPrimaryTutorGemini = (scenario === 'tutor' && actualModelName === primaryActualModel);
        const perCallCapMs = scenario === 'grading'
          ? ((allowFallback && hasNextDistinctModel) ? 12000 : (actualModelName === 'gemini-4-hydrogen' ? 22000 : 18000))
          : (scenario === 'slides'
              ? 50000
              : (isPrimaryTutorGemini
                  ? 45000
                  : (hasNextDistinctModel ? (scenario === 'question' ? 22000 : 20000) : 45000)));
        const timeoutMs = Math.min(
          perCallCapMs,
          Math.max(2500, (deadlineAt - Date.now()) - 400)
        );
        effectiveTimeoutMs = timeoutMs;
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
      const errMsg = String(err?.message || '');
      console.warn(`[API 시도 실패] ${task.label} (${maskedKey}), 모델: ${task.model}: ${errMsg.substring(0, 140)}`);
      keyErrors.push(`${task.label} (${task.model}): ${errMsg.substring(0, 140)}`);

      const isQuota = err.status === 429 || /\b429\b|quota|rate[\s_-]?limit|too\s+many\s+requests|resource_exhausted/i.test(errMsg);
      const isNotFoundModel = err.status === 404 || /\b404\b|is not found|not supported for generateContent/i.test(errMsg);
      const isAuthError = errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid') || err.status === 401 || err.status === 403;
      const isModelOverloaded = err.status === 503 || /\b503\b|high demand|overloaded|service unavailable/i.test(errMsg);
      const isTimeoutError = /aborted|timeout|etimedout|timed out/i.test(errMsg);

      if (isAuthError) {
        failedKeys.add(key);
        transientInvalidKeys.set(key, Date.now() + INVALID_KEY_COOLDOWN_MS);
        console.log(`[키 장애 감지] ${task.label} 키 유효성 오류(Auth)로 인해 다음 키로 즉시 페일오버합니다.`);
        continue;
      }

      if (isQuota) {
        const rlPair = `${key}:${actualModelName}`;
        rateLimitedKeyModels.add(rlPair);
        if (!options.disableCooldown) {
          transientRateLimitedKeyModels.set(rlPair, Date.now() + RATE_LIMIT_COOLDOWN_MS);
        }
        console.log(`[모델 쿼터 초과 감지] ${task.label} (${task.model} -> ${actualModelName}) 쿼터 초과(429). 다음 순번 모델/키로 즉시 페일오버합니다.`);
        continue;
      }

      if (isNotFoundModel) {
        if (allowFallback && hasNextDistinctModel) skippedModelsThisCall.add(actualModelName);
        console.log(`[모델 미존재] 모델 '${task.model}'이 Gemini API에 존재하지 않으므로 다음 모델로 건너뜁니다.`);
        continue;
      }

      if (isModelOverloaded && allowFallback && hasNextDistinctModel) {
        const hasNextKeyForSameModel = executionList.slice(idx + 1).some(t => {
          const m = t.actualModel || t.model;
          const tk = `${t.key}:${m}`;
          const tRl = transientRateLimitedKeyModels.get(tk);
          return m === actualModelName && !failedKeys.has(t.key) && !rateLimitedKeyModels.has(tk) && !(tRl && tRl > Date.now());
        });
        if (hasNextKeyForSameModel && (deadlineAt - Date.now()) >= 10000) {
          console.log(`[503 키 전환] ${task.label} (${actualModelName}) 503 과부하 감지. 동일 모델의 다음 API 키로 즉시 재시도합니다.`);
          continue;
        }
        skippedModelsThisCall.add(actualModelName);
        if (!options.disableCooldown) {
          transientOverloadedModels.set(actualModelName, Date.now() + MODEL_OVERLOAD_COOLDOWN_MS);
        }
        console.log(`[모델 과부하 감지] ${actualModelName} (503 과부하, 60초 쿨다운). 다음 정상 모델로 즉시 페일오버합니다.`);
        continue;
      }

      if (isTimeoutError && effectiveTimeoutMs >= 6000 && allowFallback && hasNextDistinctModel) {
        skippedModelsThisCall.add(actualModelName);
        if (!options.disableCooldown) {
          transientOverloadedModels.set(actualModelName, Date.now() + MODEL_TIMEOUT_COOLDOWN_MS);
        }
        console.log(`[모델 지연 감지] ${actualModelName} (응답 시간초과, 45초 쿨다운). 동일 모델 추가 키 재시도를 생략하고 다음 정상 모델로 즉시 페일오버합니다.`);
        continue;
      }

      continue;
    }
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
    throw new Error(`[AI 호출 실패] ${uniqueErrors.join(' | ')}`);
  }

  throw new Error('모든 API 키 호출에 실패하였습니다.');
}

export async function analyzeStandardsBeforeTask(progressId, topicTitle, standards, scenario = 'generation', preferredModel = null) {
  // [Performance Optimization] 사전 지침 분석 단계 생략
  // 메인 시스템 프롬프트(systemInstruction)에 전체 지침이 이미 모두 포함되어 전달되므로,
  // 10초 이상 소요되는 불필요한 사전 요약 LLM 호출을 건너뛰고 즉시 본 태스크로 진입하여 성능을 최적화합니다.
  if (progressId) {
    updateProgress(progressId, 0, '0단계: 사전 절대 지침 통과 (즉시 적용)', 20);
  }
  return '';
}

export async function getTopicText(topic, fileUtils, ocrPlugin, pdfParse) {
  return extractTopicText(topic, fileUtils, ocrPlugin, pdfParse, callLLMWithFailover);
}

export async function searchSourceDocumentWithGeminiLite(systemInstruction, userPrompt, image = null, options = {}) {
  return await callLLMWithFailover(systemInstruction, userPrompt, image, 'source-search', {
    ...options,
    isSourceSearch: true
  });
}
