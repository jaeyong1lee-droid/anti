import { GoogleGenerativeAI } from '@google/generative-ai';
import { dbQuery } from '../database.js';
import { parseLlmJson } from '../utils/latexUtils.js';

// Global AI progress tracker map
global.progressTracker = global.progressTracker || new Map();

export let globalPreferredModel = 'gemini-3.1-flash-lite';

export async function loadPreferredModel() {
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'preferred_model'");
    if (row && row.value) {
      globalPreferredModel = row.value;
      console.log(`[Setting Loaded] Preferred Model: ${globalPreferredModel}`);
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

export function updateProgress(progressId, step, message, percentage = null) {
  if (!progressId) return;
  const existing = global.progressTracker.get(progressId) || {};
  global.progressTracker.set(progressId, {
    step: step !== undefined ? step : existing.step || 1,
    message: message || existing.message || '',
    percentage: percentage !== null ? percentage : existing.percentage || 0,
    timestamp: Date.now()
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function reportLlmProgress(options, scenario, modelName) {
  if (options && options.progressId) {
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
    message: `2단계: validationPlugin으로 생성 문제 검증 중... (${validatedCount}/${total} 완료)`,
    percentage: Math.min(percentage, 100),
    timestamp: Date.now()
  });
}

export function startBackendProgressTimer(progressId, step, initialMessage, maxPercentage, intervalMs = 1500, stepIncrement = 5) {
  if (!progressId) return null;
  updateProgress(progressId, step, initialMessage, 10);
  let currentPercent = 10;
  const timer = setInterval(() => {
    currentPercent = Math.min(currentPercent + stepIncrement, maxPercentage);
    const progress = global.progressTracker.get(progressId);
    if (progress && progress.step === step) {
      updateProgress(progressId, step, progress.message || initialMessage, currentPercent);
    } else {
      clearInterval(timer);
    }
  }, intervalMs);
  return timer;
}

export function stopBackendProgressTimer(progressId, percentage, message, isSuccess) {
  updateProgress(progressId, 2, message, percentage);
}

export async function callLLMWithFailover(systemInstruction, userPrompt, image = null, scenario = 'default', options = {}) {
  const primaryKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim().replace(/^['"]|['"]$/g, '') : null;
  const secondaryKey = process.env.GEMINI_API_KEY_SECONDARY ? process.env.GEMINI_API_KEY_SECONDARY.trim().replace(/^['"]|['"]$/g, '') : null;
  const tertiaryKey = process.env.GEMINI_API_KEY_TERTIARY ? process.env.GEMINI_API_KEY_TERTIARY.trim().replace(/^['"]|['"]$/g, '') : null;
  const xaiKey = process.env.XAI_API_KEY ? process.env.XAI_API_KEY.trim().replace(/^['"]|['"]$/g, '') : null;
  const grokKey = process.env.GROK_API_KEY ? process.env.GROK_API_KEY.trim().replace(/^['"]|['"]$/g, '') : null;

  const keyErrors = [];
  const hasImage = Array.isArray(image)
    ? image.some(img => img && img.data && img.mimeType)
    : !!(image && image.data && image.mimeType);

  const executionList = [];

  const keys = [];
  if (primaryKey) keys.push({ key: primaryKey, label: 'Key #1' });
  if (secondaryKey) keys.push({ key: secondaryKey, label: 'Key #2' });
  if (tertiaryKey) keys.push({ key: tertiaryKey, label: 'Key #3' });

  for (const k of keys) {
    const isGroq = k.key.startsWith('gsk_');
    const isGrok = k.key.startsWith('xai-');

    if (isGroq) {
      executionList.push({ key: k.key, label: k.label, model: 'llama-3.3-70b-versatile', type: 'groq' });
      executionList.push({ key: k.key, label: k.label, model: 'llama-3.1-8b-instant', type: 'groq' });
    } else if (isGrok) {
      executionList.push({ key: k.key, label: k.label, model: 'grok-2-1212', type: 'grok' });
      executionList.push({ key: k.key, label: k.label, model: 'grok-2', type: 'grok' });
    } else {
      const geminiFallbacks = [
        globalPreferredModel,
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash',
        'gemini-3.0-flash',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite'
      ];
      const uniqueModels = [...new Set(geminiFallbacks.filter(Boolean))];
      for (const modelName of uniqueModels) {
        executionList.push({ key: k.key, label: k.label, model: modelName, type: 'gemini' });
      }
    }
  }

  if (xaiKey) {
    executionList.push({ key: xaiKey, label: 'Key #4 (Grok)', model: 'grok-2-1212', type: 'grok' });
    executionList.push({ key: xaiKey, label: 'Key #4 (Grok)', model: 'grok-2', type: 'grok' });
  }
  if (grokKey) {
    executionList.push({ key: grokKey, label: 'Key #5 (Grok)', model: 'grok-2-1212', type: 'grok' });
    executionList.push({ key: grokKey, label: 'Key #5 (Grok)', model: 'grok-2', type: 'grok' });
  }

  let attemptedAny = false;
  const failedKeys = new Set();

  for (let idx = 0; idx < executionList.length; idx++) {
    const task = executionList[idx];
    const key = task.key;

    if (failedKeys.has(key)) {
      continue;
    }

    const maskedKey = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    const modelName = task.model;
    const isGroq = task.type === 'groq';
    const isGrok = task.type === 'grok';

    if (hasImage && (isGroq || isGrok)) {
      continue;
    }

    attemptedAny = true;
    let attempt = 0;
    const maxAttempts = 2;
    let delay = 1000;

    while (attempt < maxAttempts) {
      try {
        if (isGrok) {
          console.log(`[Grok 시도] ${task.label} (${maskedKey}), 모델: ${modelName} (시도 #${attempt + 1})`);
          const messages = [];
          if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
          }
          messages.push({ role: 'user', content: userPrompt });

          reportLlmProgress(options, scenario, modelName);
          const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: modelName,
              messages: messages,
              temperature: options.temperature !== undefined ? options.temperature : 0.2,
              ...(scenario === 'grading' ? { response_format: { type: "json_object" } } : {})
            })
          });

          if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(`HTTP Error ${response.status}: ${errBody}`);
          }

          const data = await response.json();
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text) {
            console.log(`[Grok 성공] ${task.label} (${maskedKey}), 모델: ${modelName}`);
            return text;
          } else {
            throw new Error('Grok response empty');
          }

        } else if (isGroq) {
          console.log(`[Groq 시도] ${task.label} (${maskedKey}), 모델: ${modelName} (시도 #${attempt + 1})`);
          const messages = [];
          if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
          }
          messages.push({ role: 'user', content: userPrompt });

          reportLlmProgress(options, scenario, modelName);
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: modelName,
              messages: messages,
              temperature: options.temperature !== undefined ? options.temperature : 0.2
            })
          });

          if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(`HTTP Error ${response.status}: ${errBody}`);
          }

          const data = await response.json();
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text) {
            console.log(`[Groq 성공] ${task.label} (${maskedKey}), 모델: ${modelName}`);
            return text;
          } else {
            throw new Error('Groq response empty');
          }

        } else {
          console.log(`[Gemini 시도] ${task.label} (${maskedKey}), 모델: ${modelName} (시도 #${attempt + 1})`);
          const genAI = new GoogleGenerativeAI(key);
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemInstruction || undefined,
            generationConfig: {
              temperature: options.temperature !== undefined ? options.temperature : 0.2,
              ...(scenario === 'grading' ? { responseMimeType: 'application/json' } : {})
            }
          }, { apiVersion: 'v1beta' });

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
          const timeoutMs = 20000;
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini request timeout after ${timeoutMs}ms`)), timeoutMs)
          );
          const result = await Promise.race([
            model.generateContent(generateContentArg),
            timeoutPromise
          ]);
          const text = result.response.text().trim();
          if (text) {
            console.log(`[Gemini 성공] ${task.label} (${maskedKey}), 모델: ${modelName}`);
            return text;
          } else {
            throw new Error('Gemini response empty');
          }
        }
      } catch (err) {
        console.warn(`[API 시도 실패] ${task.label} (${maskedKey}), 모델: ${modelName} (시도 #${attempt + 1}): ${err.message?.substring(0, 120)}`);
        keyErrors.push(`${task.label} (${modelName}): ${err.message?.substring(0, 120)}`);

        const isQuota = err.status === 429 || err.message?.includes('429') || err.message?.includes('Quota') || err.message?.includes('quota') || err.message?.includes('rate');
        const isAuthError = err.message?.includes('API_KEY_INVALID') || err.message?.includes('invalid') || err.message?.includes('not found') || err.status === 400 || err.status === 403;

        if (isQuota || isAuthError) {
          failedKeys.add(key);
          console.log(`[키 장애 감지] ${task.label}에 문제(Quota/Auth)가 있어 해당 키의 다른 모델 시도를 생략하고 다음 키로 즉시 페일오버합니다.`);
          break;
        }

        const isQuotaCheck = err.status === 429 || err.message?.includes('429') || err.message?.includes('Quota') || err.message?.includes('quota') || err.message?.includes('rate');
        if (isQuotaCheck) {
          const isVercel = !!process.env.VERCEL;
          if (isVercel) {
            console.log('[Vercel 환경] 429 감지. 타임아웃 방지를 위해 즉시 다른 키/모델로 페일오버를 시도합니다.');
            break;
          }
          attempt++;
          if (attempt < maxAttempts) {
            console.log(`[지수 백오프] 429 감지. ${delay}ms 후 재시도...`);
            await sleep(delay);
            delay *= 2;
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }
  }

  if (hasImage && !attemptedAny) {
    throw new Error('이미지 분석에는 Gemini API 키가 필요하지만, 현재 등록된 Gemini API 키가 없습니다. 관리자에게 문의해 주세요.');
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

export async function analyzeStandardsBeforeTask(progressId, topicTitle, standards, scenario = 'generation') {
  try {
    const primaryKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim().replace(/^['"]|['"]$/g, '') : null;
    if (!primaryKey) return '';

    console.log(`[analyzeStandardsBeforeTask] Starting analysis for topic "${topicTitle}" (scenario: ${scenario})`);
    
    let scenarioGuideline = '';
    if (scenario === 'generation') {
      scenarioGuideline = '당신은 기술사 시험 출제위원입니다. 흙막이, 사질토, 점성토 등 토질역학 표준 정의를 꼬아 수치를 엉뚱하게 문제에 강제 출제하여 수정을 겪게 했던 사례가 있었습니다. 이번 출제 시 이러한 오류를 피하기 위해, 제공된 출제지침들을 정독하여 특히 어떤 항목들을 절대 주의해야 하는지 3~4줄로 핵심만 분석하십시오.';
    } else if (scenario === 'grading') {
      scenarioGuideline = '당신은 지반공학 전문 채점관입니다. 사용자가 쓴 단어가 정답과 유사하다는 이유로 과도하게 유연 채점하거나, 반대로 물리적으로 같은 의미임에도 자구 불일치로 오답 처리했던 오류 사례가 있었습니다. 이번 채점 시 지침 내의 핵심 판정 규칙 중 어떤 점을 최우선 준수하여 점수를 공정하게 산정해야 하는지 3~4줄로 분석하십시오.';
    } else {
      scenarioGuideline = '제시된 지침들 중 이번 태스크 처리에 핵심적으로 준수해야 할 필수적인 헌법적 철칙 3~4줄을 엄밀하게 분석하십시오.';
    }

    const systemInstruction = `당신은 대한민국 국가건설기준설계코드(KDS) 및 지반공학 기술사 시험 출제/채점 지침 분석용 AI 튜터입니다.
주어진 지침 리스트를 정독하고, 이번 태스크를 수행할 때 위배해서는 안 될 핵심적인 절대 강제 금지/의무 사항들을 0단계 사전 주의사항으로 요약하십시오.`;

    const userPrompt = `
[수행 태스크 대상]: ${topicTitle}
[분석 대상 지침/기준 문구]:
${standards}

[분석 요구 가이드라인]:
${scenarioGuideline}

[출력 요구사항]:
- 오직 3~4줄 내외의 컴팩트한 주의사항 리스트만 명료하게 반환하십시오.
- 부가적인 서론("지침을 분석한 결과는 다음과 같습니다" 등)이나 결론은 완벽하게 배제하고 알맹이 주의사항 텍스트만 출력하십시오.
`;

    updateProgress(progressId, 0, '0단계: 사전 절대 지침 준수 분석 중...', 5);
    const genAI = new GoogleGenerativeAI(primaryKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction: systemInstruction,
      generationConfig: { temperature: 0.1 }
    }, { apiVersion: 'v1beta' });

    const result = await model.generateContent(userPrompt);
    const text = result.response.text().trim();
    console.log(`[analyzeStandardsBeforeTask] Success! Analysis:\n${text}`);
    updateProgress(progressId, 0, '0단계: 사전 절대 지침 분석 완료!', 10);
    return text;
  } catch (err) {
    console.warn('[analyzeStandardsBeforeTask] Warning: standards analysis failed:', err.message);
    updateProgress(progressId, 0, '0단계: 사전 지침 분석 스킵 (오류로 우회)', 10);
    return '';
  }
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
          const response = await fetch(dbRow.pdf_url);
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
