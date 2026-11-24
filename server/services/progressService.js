// Global AI progress tracker map
global.progressTracker = global.progressTracker || new Map();

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
