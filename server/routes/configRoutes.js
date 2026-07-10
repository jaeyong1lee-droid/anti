import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dbQuery } from '../database.js';
import { saveSessionValue, globalPreferredModel, updatePreferredModel, callLLMWithFailover, startBackendProgressTimer, updateProgress } from '../services/aiService.js';
import { updateLiveEngineeringStandards, standardsList, ENGINEERING_STANDARDS } from '../plugins/engineeringStandards.js';
import { updateLiveGradingStandards, gradingStandardsList } from '../plugins/gradingPlugin.js';
let validationStandardsList = [];
function updateLiveValidationStandards(newList) {
  validationStandardsList = newList;
}
import { updateLiveGenerationStandards, generationStandardsList } from '../plugins/generationStandards.js';
import { updateLiveLockscreenStandards, lockscreenStandardsList } from '../plugins/lockscreenStandards.js';
import { healFormulaQuestionObject, healAnswersheetQuestionObject, healQuizQuestionObject, parseLlmJson, healLatexFormulas, LATEX_CHAT_PROMPT_INSTRUCTIONS } from '../utils/latexUtils.js';
import { defaultAcronyms, generateAcronymTutorResponse } from '../plugins/acronymsPlugin.js';
import { defaultOverviews, generateOverviewTutorResponse } from '../plugins/overviewsPlugin.js';
import { ASCII_DIAGRAM_PROMPT } from '../plugins/asciiDiagramPlugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

const router = express.Router();

async function pushStandardToProduction(apiPath, standards) {
  // Disabled as per user instruction. No local-to-production sync.
  return;
}

async function purgeAllQuizCaches() {
  console.log('[Cache Clean] Bypassed automatic quiz cache purging to preserve user review histories.');
}

// Config In-Memory Cache to bypass DB queries on high frequency reads
const configMemoryCache = new Map();

function stampUpdatedStandards(newList, oldList) {
  if (!Array.isArray(newList)) return [];
  const oldMap = new Map((oldList || []).map(item => [item.id, item]));
  return newList.map(item => {
    const oldItem = oldMap.get(item.id);
    if (!oldItem || oldItem.content !== item.content || oldItem.title !== item.title || !item.updatedAt) {
      return { ...item, updatedAt: new Date().toISOString() };
    }
    return item;
  });
}

// GET /api/preferred-model
router.get('/preferred-model', async (req, res) => {
  if (configMemoryCache.has('preferred_model')) {
    return res.json({ model: configMemoryCache.get('preferred_model') });
  }
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'preferred_model'");
    if (row && row.value) {
      updatePreferredModel(row.value);
      configMemoryCache.set('preferred_model', row.value);
    }
  } catch (err) {
    console.warn("Failed to load preferred model from DB in GET /api/preferred-model:", err.message);
  }
  res.json({ model: globalPreferredModel });
});

// POST /api/preferred-model
router.post('/preferred-model', async (req, res) => {
  const { model } = req.body;
  if (typeof model === 'string' && model.startsWith('gemini-')) {
    updatePreferredModel(model);
    try {
      await saveSessionValue('preferred_model', model);
      configMemoryCache.set('preferred_model', model);
      console.log(`[Setting Saved] Preferred Model updated to: ${model}`);
      return res.json({ success: true, model });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(400).json({ error: 'Invalid model' });
});

// POST /api/verify-pin
router.post('/verify-pin', (req, res) => {
  try {
    const { pin } = req.body;
    const correctPin = process.env.PIN_CODE || '7942';
    if (pin && pin.toString() === correctPin.toString()) {
      return res.json({ success: true });
    }
    return res.json({ success: false, error: '올바르지 않은 PIN 코드입니다.' });
  } catch (err) {
    console.error('Verify pin error:', err);
    res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
  }
});

// GET /api/engineering-standards
router.get('/engineering-standards', async (req, res) => {
  try {
    try {
      const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'engineering_standards'");
      if (row && row.value) {
        const list = JSON.parse(row.value);
        return res.json({ standards: list });
      }
    } catch (dbErr) {
      console.error('Failed to read engineering standards from database:', dbErr.message);
    }

    const standardsFilePath = path.join(serverDir, 'plugins', 'engineeringStandards.js');
    const content = await fs.promises.readFile(standardsFilePath, 'utf-8');
    const match = content.match(/export const standardsList = (\[[\s\S]*?\]);/);
    if (!match) {
      return res.status(500).json({ error: 'standardsList structure not found in engineeringStandards.js' });
    }
    const list = JSON.parse(match[1]);
    res.json({ standards: list });
  } catch (err) {
    console.error('GET /api/engineering-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/engineering-standards
router.post('/engineering-standards', async (req, res) => {
  try {
    const { standards } = req.body;
    if (!Array.isArray(standards)) {
      return res.status(400).json({ error: 'standards must be an array' });
    }

    const stamped = stampUpdatedStandards(standards, standardsList);
    updateLiveEngineeringStandards(stamped);

    try {
      await saveSessionValue('engineering_standards', JSON.stringify(stamped));
      console.log('Successfully saved engineering standards to database.');
    } catch (dbErr) {
      console.error('Failed to save engineering standards to database:', dbErr.message);
    }

    pushStandardToProduction('engineering-standards', stamped).catch(() => {});
    await purgeAllQuizCaches();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/engineering-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/grading-standards
router.get('/grading-standards', async (req, res) => {
  try {
    try {
      const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'grading_standards'");
      if (row && row.value) {
        const list = JSON.parse(row.value);
        return res.json({ standards: list });
      }
    } catch (dbErr) {
      console.error('Failed to read grading standards from database:', dbErr.message);
    }
    res.json({ standards: gradingStandardsList });
  } catch (err) {
    console.error('GET /api/grading-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/grading-standards
router.post('/grading-standards', async (req, res) => {
  try {
    const { standards } = req.body;
    if (!Array.isArray(standards)) {
      return res.status(400).json({ error: 'standards must be an array' });
    }

    const stamped = stampUpdatedStandards(standards, gradingStandardsList);
    updateLiveGradingStandards(stamped);

    try {
      await saveSessionValue('grading_standards', JSON.stringify(stamped));
      console.log('Successfully saved grading standards to database.');
    } catch (dbErr) {
      console.error('Failed to save grading standards to database:', dbErr.message);
    }

    pushStandardToProduction('grading-standards', stamped).catch(() => {});
    await purgeAllQuizCaches();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/grading-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/validation-standards
router.get('/validation-standards', async (req, res) => {
  try {
    try {
      const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'validation_standards'");
      if (row && row.value) {
        const list = JSON.parse(row.value);
        return res.json({ standards: list });
      }
    } catch (dbErr) {
      console.error('Failed to read validation standards from database:', dbErr.message);
    }
    res.json({ standards: validationStandardsList });
  } catch (err) {
    console.error('GET /api/validation-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/validation-standards
router.post('/validation-standards', async (req, res) => {
  try {
    const { standards } = req.body;
    if (!Array.isArray(standards)) {
      return res.status(400).json({ error: 'standards must be an array' });
    }

    const stamped = stampUpdatedStandards(standards, validationStandardsList);
    updateLiveValidationStandards(stamped);

    try {
      await saveSessionValue('validation_standards', JSON.stringify(stamped));
      console.log('Successfully saved validation standards to database.');
    } catch (dbErr) {
      console.error('Failed to save validation standards to database:', dbErr.message);
    }

    pushStandardToProduction('validation-standards', stamped).catch(() => {});
    await purgeAllQuizCaches();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/validation-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/generation-standards
router.get('/generation-standards', async (req, res) => {
  try {
    try {
      const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'generation_standards'");
      if (row && row.value) {
        const list = JSON.parse(row.value);
        return res.json({ standards: list });
      }
    } catch (dbErr) {
      console.error('Failed to read generation standards from database:', dbErr.message);
    }
    res.json({ standards: generationStandardsList });
  } catch (err) {
    console.error('GET /api/generation-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generation-standards
router.post('/generation-standards', async (req, res) => {
  try {
    const { standards } = req.body;
    if (!Array.isArray(standards)) {
      return res.status(400).json({ error: 'standards must be an array' });
    }

    const stamped = stampUpdatedStandards(standards, generationStandardsList);
    updateLiveGenerationStandards(stamped);

    try {
      await saveSessionValue('generation_standards', JSON.stringify(stamped));
      console.log('Successfully saved generation standards to database.');
    } catch (dbErr) {
      console.error('Failed to save generation standards to database:', dbErr.message);
    }

    pushStandardToProduction('generation-standards', stamped).catch(() => {});
    await purgeAllQuizCaches();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/generation-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lockscreen-standards
router.get('/lockscreen-standards', async (req, res) => {
  try {
    try {
      const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_standards'");
      if (row && row.value) {
        const list = JSON.parse(row.value);
        return res.json({ standards: list });
      }
    } catch (dbErr) {
      console.error('Failed to read lockscreen standards from database:', dbErr.message);
    }
    res.json({ standards: lockscreenStandardsList });
  } catch (err) {
    console.error('GET /api/lockscreen-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lockscreen-standards
router.post('/lockscreen-standards', async (req, res) => {
  try {
    const { standards } = req.body;
    if (!Array.isArray(standards)) {
      return res.status(400).json({ error: 'standards must be an array' });
    }

    const stamped = stampUpdatedStandards(standards, lockscreenStandardsList);
    updateLiveLockscreenStandards(stamped);

    try {
      await saveSessionValue('lockscreen_standards', JSON.stringify(stamped));
      await dbQuery.run("DELETE FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
      console.log('Successfully saved lockscreen standards to database and cleared pregenerated pool.');
    } catch (dbErr) {
      console.error('Failed to save lockscreen standards to database:', dbErr.message);
    }

    pushStandardToProduction('lockscreen-standards', stamped).catch(() => {});
    await purgeAllQuizCaches();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/lockscreen-standards error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function ensureSessionTable() {
  try {
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS app_session (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn('ensureSessionTable warning:', e.message);
  }
}

const LATEX_PROMPT_INSTRUCTIONS = `
[수학 공식/특수문자 표기 규칙 - 극도로 중요]:
1. 인라인(글 중간)에 수학 공식이나 물리적 변수(예: kh, kv 등)를 적을 때는 반드시 단일 달러 기호 하나로 감싸서 LaTeX 형식으로 작성하십시오. (예: $k_h$, $k_v$, $\\beta$ 등)
2. 디스플레이(독립된 단락) 수학 공식을 작성할 때는 반드시 이중 달러 기호로 감싸서 작성하십시오. (예: $$k_e = \\sqrt{k_h k_v}$$)
3. 역슬래시 문자는 이스케이프가 중복 처리되지 않도록 한 번만 적어 전달되도록 주의하십시오.
`;

// GET /api/session/formula
router.get('/session/formula', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['formula_questions']);
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      if (parsed && Array.isArray(parsed.formulaQuestions)) {
        parsed.formulaQuestions = parsed.formulaQuestions.map(q => healFormulaQuestionObject(q));
      }
      res.json({ data: parsed });
    } else {
      res.json({ data: null });
    }
  } catch (err) {
    console.error('GET /api/session/formula error:', err);
    res.json({ data: null });
  }
});

// POST /api/session/formula
router.post('/session/formula', async (req, res) => {
  try {
    await ensureSessionTable();
    const { formulaQuestions } = req.body;
    const healedQuestions = Array.isArray(formulaQuestions)
      ? formulaQuestions.map(healFormulaQuestionObject)
      : formulaQuestions;
    const value = JSON.stringify({ formulaQuestions: healedQuestions });
    await saveSessionValue('formula_questions', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/formula error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/tables
router.get('/session/tables', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['formula_tables']);
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {
      res.json({ data: null });
    }
  } catch (err) {
    console.error('GET /api/session/tables error:', err);
    res.json({ data: null });
  }
});

// POST /api/session/tables
router.post('/session/tables', async (req, res) => {
  try {
    await ensureSessionTable();
    const { formulaTables } = req.body;
    const value = JSON.stringify({ formulaTables });
    await saveSessionValue('formula_tables', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/tables error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/acronyms
router.get('/session/acronyms', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['formula_acronyms']);
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {
      res.json({ data: { formulaAcronyms: defaultAcronyms } });
    }
  } catch (err) {
    console.error('GET /api/session/acronyms error:', err);
    res.json({ data: { formulaAcronyms: defaultAcronyms } });
  }
});

// POST /api/session/acronyms
router.post('/session/acronyms', async (req, res) => {
  try {
    await ensureSessionTable();
    const { formulaAcronyms } = req.body;
    const value = JSON.stringify({ formulaAcronyms });
    await saveSessionValue('formula_acronyms', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/acronyms error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/overviews
router.get('/session/overviews', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['formula_overviews']);
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {
      res.json({ data: { formulaOverviews: defaultOverviews } });
    }
  } catch (err) {
    console.error('GET /api/session/overviews error:', err);
    res.json({ data: { formulaOverviews: defaultOverviews } });
  }
});

// POST /api/session/overviews
router.post('/session/overviews', async (req, res) => {
  try {
    await ensureSessionTable();
    const { formulaOverviews } = req.body;
    const value = JSON.stringify({ formulaOverviews });
    await saveSessionValue('formula_overviews', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/overviews error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/images
router.get('/session/images', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['formula_images']);
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {
      res.json({ data: { formulaImages: [] } });
    }
  } catch (err) {
    console.error('GET /api/session/images error:', err);
    res.json({ data: { formulaImages: [] } });
  }
});

// POST /api/session/images
router.post('/session/images', async (req, res) => {
  try {
    await ensureSessionTable();
    const { formulaImages } = req.body;
    const value = JSON.stringify({ formulaImages });
    await saveSessionValue('formula_images', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/images error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/mixed-completed
router.get('/session/mixed-completed', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['mixed_completed_dates']);
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      res.json({ data: parsed });
    } else {
      res.json({ data: { completedDates: [] } });
    }
  } catch (err) {
    console.error('GET /api/session/mixed-completed error:', err);
    res.json({ data: { completedDates: [] } });
  }
});

// POST /api/session/mixed-completed
router.post('/session/mixed-completed', async (req, res) => {
  try {
    await ensureSessionTable();
    const { completedDates } = req.body;
    const value = JSON.stringify({ completedDates });
    await saveSessionValue('mixed_completed_dates', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/mixed-completed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/options/:key
router.get('/options/:key', async (req, res) => {
  try {
    await ensureSessionTable();
    const key = `option_${req.params.key}`;
    const row = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);
    res.json({ value: row ? row.value : null });
  } catch (err) {
    console.error(`GET /api/options/${req.params.key} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/options/:key
router.post('/options/:key', async (req, res) => {
  try {
    await ensureSessionTable();
    const key = `option_${req.params.key}`;
    const { value } = req.body;
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
    await dbQuery.run(
      'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(`POST /api/options/${req.params.key} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/question/option-explanation
router.post('/question/option-explanation', async (req, res) => {
  const { question, options, answer } = req.body;
  const progressId = req.body.progressId || req.query.progressId;
  const localCallLLM = (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });

  if (!question || !options || !Array.isArray(options) || options.length !== 4) {
    return res.status(400).json({ error: '올바른 객관식 문제 정보가 아닙니다.' });
  }

  let progressTimer = null;
  if (progressId) {
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 보기 오답 원인 분석 중...', 90, 800, 10);
  }

  try {
    const prompt = `
당신은 대한민국 국가건설기준설계코드(KDS) 및 지반공학 기술사 시험 출제위원입니다.
제시하는 객관식 문제의 질문과 4개 보기 목록을 면밀히 분석하여, 각 보기(①, ②, ③, ④)가 왜 정답인지(정답 이유) 또는 왜 오답인지(오답 이유)를 공학 지식과 학술 이론에 근거하여 매우 직관적이고 명확하게 기술적 관점에서 설명해 주십시오.

[질문]: ${question}
[보기 목록]:
① ${options[0]}
② ${options[1]}
③ ${options[2]}
④ ${options[3]}
[정답]: ${answer}

[요구사항]:
1. ①, ②, ③, ④의 보기별 정답/오답 원인 분석이 한눈에 들어오도록 콤팩트하게 구성하십시오 (각 보기당 1~2줄 이내 권장).
2. ${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
3. 마크다운의 '\`\`\`' 등의 특수 기호로 감싸지 말고 다음의 문자열 형식으로만 곧바로 반환해 주십시오:

- **① ${options[0]}** : [정답/오답 핵심 분석] (여기에 명확하고 압축된 공학적 해설 기재)
- **② ${options[1]}** : [정답/오답 핵심 분석] ...
- **③ ${options[2]}** : [정답/오답 핵심 분석] ...
- **④ ${options[3]}** : [정답/오답 핵심 분석] ...
`;

    const responseText = await localCallLLM(null, prompt, null, 'option-explanation');
    if (progressId) {
      updateProgress(progressId, 1, '1단계: 분석 완료!', 100);
    }
    res.json({ text: responseText.trim() });
  } catch (err) {
    console.error('Error generating option explanation:', err);
    if (progressId) {
      updateProgress(progressId, 1, '오류 발생으로 분석 실패', 100);
    }
    res.status(500).json({ error: 'AI 보기 분석 해설을 생성하지 못했습니다.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// POST /api/formula/generate-memorization-tip
router.post('/formula/generate-memorization-tip', async (req, res) => {
  const { title, concept, formula } = req.body;
  if (!title && !formula) {
    return res.status(400).json({ error: '공식 제목 또는 공식 내용이 필요합니다.' });
  }

  try {
    const prompt = `
당신은 대한민국 국가기술자격 기술사 시험 공부를 지원하는 최고 권위의 공학 전문 튜터입니다.
시험준비생들이 시험장에서 복잡한 공식의 구조를 물리적으로 이해하여 기억해낼 수 있도록 **[공식의 분모의 의미], [분자의 의미], 그리고 [각 변수의 영향]**을 물리적으로 분석한 직관적 요약(2~3문장)을 한국어로 작성해 주십시오.

[공식명칭]: ${title || '미정'}
[공식개념]: ${concept || '미정'}
[수식내용]: ${formula}

[요구사항]:
1. 직관적이고 쉬운 실무 비유나 물리적 원리를 결합하여 2~3문장으로 간결하게 답변하십시오.
2. ${LATEX_PROMPT_INSTRUCTIONS}
3. 다른 사족 설명(예: '요약은 다음과 같습니다') 없이 오직 마크다운 리스트 형태로 핵심 내용만 출력하십시오.
`;

    const responseText = await callLLMWithFailover(null, prompt, null, 'formula');
    res.json({ text: responseText.trim() });
  } catch (err) {
    console.error('Error generating formula memorization tip:', err);
    res.status(500).json({ error: '공식 암기 요약을 생성하지 못했습니다.' });
  }
});

// POST /api/formula/suggest-title
router.post('/formula/suggest-title', async (req, res) => {
  try {
    const { mathContent, fullText } = req.body;
    if (!mathContent) {
      return res.status(400).json({ error: '수식 내용이 존재하지 않습니다.' });
    }

    let bestLocalMatch = null;
    let maxMatchCount = 0;
    const cleanMathContent = mathContent.replace(/\s+/g, '');
    
    // LaTeX 명령어(예: \frac, \left, \right)의 내부 텍스트만 추출하고 명령어 단어 자체는 차단
    const mathTokens = mathContent
      .replace(/\\[a-zA-Z]+/g, ' ') // 모든 \명령어를 공백으로 지움 (변수만 남김)
      .replace(/[^a-zA-Z0-9\_]/g, ' ') // 알파벳, 숫자, 언더바만 남김
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    for (const dict of LOCAL_FORMULA_DICTIONARY) {
      let matchCount = 0;
      for (const kw of dict.keywords) {
        const cleanKw = kw.replace(/\\\\/g, '\\');
        // 만약 키워드가 그리스 문자(\gamma 등)나 LaTeX 기호 형식이면 mathContent에 백슬래시 기호가 포함되었는지 안전 검사
        if (cleanKw.startsWith('\\')) {
          if (cleanMathContent.includes(cleanKw)) {
            matchCount++;
          }
        } else {
          // 키워드가 일반 알파벳(C, D_f 등)이면, 오염된 \frac 등의 단어를 피하기 위해
          // 위에서 정제한 mathTokens 배열에 정확히 존재하는지 검사!
          if (mathTokens.includes(cleanKw) || mathTokens.some(tok => tok === cleanKw || tok.startsWith(cleanKw + '_') || tok.endsWith('_' + cleanKw))) {
            matchCount++;
          }
        }
      }
      
      // 매칭 신뢰도 판단 (최소 2개 이상의 핵심 변수 매칭 필요)
      if (matchCount > maxMatchCount && matchCount >= 2) {
        maxMatchCount = matchCount;
        bestLocalMatch = dict;
      }
    }

    if (bestLocalMatch) {
      console.log('[LocalMatch] Found pre-defined dictionary formula:', bestLocalMatch.title);
      return res.json({
        title: bestLocalMatch.title,
        concept: bestLocalMatch.concept,
        structure: bestLocalMatch.structure,
        memorizationTip: '' // 클라이언트에서 기존 직관적 의미를 그대로 유지하도록 빈 값 전달
      });
    }

    const systemInstruction = `당신은 대한민국 토목공학 및 토질및기초 기술사 교육 전문 튜터이자 출제위원입니다.
제시된 LaTeX 공식 수식과 기존 맥락을 면밀히 분석하여, 다음 4가지 핵심 정보를 반드시 JSON 형식으로만 반환해 주십시오. 다른 설명 텍스트나 마크다운 코드블록 기호는 절대 포함하지 마십시오.

JSON 반환 포맷:
{
  "title": "공식의 가장 적절하고 널리 쓰이는 표준 전공 명칭 (예: 'Terzaghi 극한 지지력 공식', '모세관 상승고 산정식' 등, 20자 이내)",
  "concept": "이 공식의 핵심 공학적 정의와 쓰임새를 설명하는 짧은 글 (2문장 이내)",
  "structure": "이 공식에 사용된 각 기호(변수)들의 정의 리스트. 각 항목은 반드시 마크다운 리스트 형태로 작성하십시오. (예: '- $h_c$: 모관상승고\\n- $T_s$: 표면장력')",
  "memorizationTip": "이 공식이 내포하는 물리적 거동 메커니즘과 직관적인 공학적 해석/의미를 설명하십시오. 절대로 암기 가사나 유치한 말장난 식의 암기 팁을 적지 말고, 수식의 분모/분자가 가지는 물리적 의미나 물성 관계를 기술사 답안지 수준의 전문적이고 직관적인 문장으로 2~3문장 서술하십시오."
}`;

    const userPrompt = `[수식]: ${mathContent}\n\n[대화 본문 맥락 및 기존정보]:\n${fullText || '(정보 없음)'}`;

    let responseText = '';
    try {
      responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'formula');
      let cleanJsonText = responseText.trim();
      const startIdx = cleanJsonText.indexOf('{');
      const endIdx = cleanJsonText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
      } else if (cleanJsonText.startsWith('```')) {
        cleanJsonText = cleanJsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      }

      const result = parseLlmJson(cleanJsonText);
      res.json({
        title: result.title || '자동 분석 공식',
        concept: result.concept || '',
        structure: result.structure || '',
        memorizationTip: result.memorizationTip || ''
      });
    } catch (err) {
      console.error('Formula suggest title LLM error:', err);
      const rawText = responseText ? responseText.substring(0, 50).trim() : '자동 분석 공식';
      res.json({
        title: rawText,
        concept: '',
        structure: '',
        memorizationTip: ''
      });
    }
  } catch (err) {
    console.error('Formula suggest title route error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/image-standards/analyze
router.post('/image-standards/analyze', async (req, res) => {
  try {
    const { base64Image, base64Images, description } = req.body;
    const incomingImages = base64Images || (base64Image ? [base64Image] : []);
    if (!incomingImages || incomingImages.length === 0) {
      return res.status(400).json({ error: '이미지 데이터가 존재하지 않습니다.' });
    }

    const imageParts = incomingImages.map(imgStr => {
      let mimeType = 'image/png';
      let rawBase64 = imgStr;
      const match = imgStr.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        rawBase64 = match[2];
      }
      return { data: rawBase64, mimeType };
    });

    const systemInstruction = `당신은 대한민국 토질및기초 기술사 자격시험 전문 채점위원이자 튜터입니다.
사용자가 붙여넣은 공학 그림/그래프/도표를 바탕으로 원본 분석을 수행하십시오.
반드시 아래 지정된 JSON 형식으로만 응답해야 합니다. 다른 설명 텍스트나 마크다운 코드블록 기호는 절대 포함하지 마십시오.

JSON 포맷 규격:
{
  "title": "이 그림/그래프가 무엇을 뜻하는지 가장 명확하고 간결한 핵심 전공 주제명으로 제안(공백 포함 25자 이내)",
  "analysis": "해당 그림/그래프에 표현된 다양한 구성 요소, 변수 관계, 공학적 의미 및 거동 메커니즘을 상세히 설명하십시오. LaTeX 수식이 들어갈 경우 $수식$ 형태로 표현하십시오. (상세 서술)",
  "intuitive": "이 복잡한 공학 도표나 그림이 궁극적으로 설명하고자 하는 핵심 본질을 일상생활의 비유나 아주 직관적이고 쉬운 비유적 설명으로 풀어내어 작성하십시오. (최대 2~3문장)"
}`;

    const userPrompt = description 
      ? `사용자가 덧붙인 추가 설명:\n${description}\n\n이 설명과 함께 첨부된 공학 그림/그래프들을 면밀히 판독하여 분석 내용을 작성하십시오.`
      : `첨부된 공학 그림/그래프의 세부 구조와 기호 정의를 면밀히 판독하여 분석 내용을 작성하십시오.`;

    const responseText = await callLLMWithFailover(systemInstruction, userPrompt, imageParts, 'formula');
    let cleanJsonText = responseText.trim();
    const startIdx = cleanJsonText.indexOf('{');
    const endIdx = cleanJsonText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
    } else if (cleanJsonText.startsWith('```')) {
      cleanJsonText = cleanJsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    try {
      const result = parseLlmJson(cleanJsonText);
      res.json({
        ok: true,
        title: result.title || '자동 분석 그림',
        analysis: result.analysis || '분석 정보를 가져올 수 없습니다.',
        intuitive: result.intuitive || '직관적 의미를 추출할 수 없습니다.'
      });
    } catch (parseErr) {
      console.error('Gemini image analyze parse error:', parseErr, 'Raw response:', responseText);
      res.json({
        ok: true,
        title: '자동 분석 그림',
        analysis: responseText,
        intuitive: '텍스트 파싱 오류로 직관적 의미를 가져오지 못했습니다.'
      });
    }
  } catch (err) {
    console.error('POST /api/image-standards/analyze error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/image-standards/generate-question
router.post('/image-standards/generate-question', async (req, res) => {
  try {
    const { title, analysis, intuitive } = req.body;
    
    const systemInstruction = `당신은 대한민국 토질및기초 기술사 자격시험 전문 채점위원이자 튜터입니다.
제시된 그림의 주제(title)와 해당 그림의 공학적 분석 내용(analysis)을 면밀히 분석하십시오.
그림의 분석 내용(analysis)에 기재되어 있는 핵심 공학적 요소, 수식 기호, 변수 관계, 또는 핵심 메커니즘 중 하나를 선택하여 구체적인 주관식 질문을 생성하십시오.
질문은 반드시 물음표(?)로 끝나는 하나의 문장으로 작성하십시오.

질문 방식 예시:
- "해당 그림/그래프에서 언급된 X 기호(또는 영역)의 공학적 의의는 무엇인가?"
- "분석 내용에 따른 Y 상태에서 지반 변위가 변화하는 물리적 이유는 무엇인가?"
- "위 Z 변수의 변동을 제어하기 위한 구체적인 대책을 설명하시오."`;

    const userPrompt = `그림 주제: ${title}
그림 분석 내용:
${analysis}

위 분석 정보를 바탕으로, 해당 분석 내용 중 핵심 공학 요소 하나를 짚어서 짧고 명확한 주관식 질문문 1개를 작성하십시오. (매번 다양하게 출제되도록 무작위 시드 ${Math.random()}을 반영하십시오.)`;

    const responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'formula');
    res.json({ success: true, question: responseText.trim() });
  } catch (err) {
    console.error('POST /api/image-standards/generate-question error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/exam
router.get('/session/exam', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['exam_session']);
    if (rows.length > 0 && rows[0].value) {
      const data = JSON.parse(rows[0].value);
      if (data) {
        if (Array.isArray(data.questions)) {
          data.questions = data.questions.map(q => healQuizQuestionObject(q));
        }
        if (Array.isArray(data.examQuestions)) {
          data.examQuestions = data.examQuestions.map(q => healQuizQuestionObject(q));
        }
      }
      res.json({ data });
    } else {
      res.json({ data: null });
    }
  } catch (err) {
    console.error('GET /api/session/exam error:', err);
    res.json({ data: null });
  }
});

// POST /api/session/exam
router.post('/session/exam', async (req, res) => {
  try {
    await ensureSessionTable();
    const { examQuestions, examRevealed, examAnswers, examTopic, tableAnswers, tableGradingResults, tutorAnswers, tutorInputText, chatHistory, savedExamScroll } = req.body;
    const value = JSON.stringify({
      examQuestions,
      examRevealed,
      examAnswers,
      examTopic,
      tableAnswers: tableAnswers || {},
      tableGradingResults: tableGradingResults || {},
      tutorAnswers: tutorAnswers || {},
      tutorInputText: tutorInputText || {},
      chatHistory: chatHistory || [],
      savedExamScroll
    });
    await saveSessionValue('exam_session', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/exam error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat
router.post('/chat', async (req, res) => {
  const { message, history, image, overviewMode, acronymMode } = req.body;
  const progressId = req.body.progressId || req.query.progressId;
  const localCallLLM = (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });

  let progressTimer = null;
  if (progressId) {
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 튜터 답변 생성 중...', 90, 1500, 5);
  }

  try {
    if (overviewMode) {
      try {
        const responseText = await generateOverviewTutorResponse(message, image, localCallLLM);
        const healedText = healLatexFormulas(responseText);
        if (progressId) {
          updateProgress(progressId, 1, '1단계: 개요서 생성 완료!', 100);
        }
        return res.json({ text: healedText });
      } catch (err) {
        console.error('Overview tutor generation error:', err);
        if (progressId) {
          updateProgress(progressId, 1, '오류 발생으로 개요 생성 실패', 100);
        }
        return res.status(500).json({ error: err.message || '개요 생성 실패.' });
      }
    }

    if (acronymMode) {
      try {
        const responseText = await generateAcronymTutorResponse(message, image, localCallLLM);
        const healedText = healLatexFormulas(responseText);
        if (progressId) {
          updateProgress(progressId, 1, '1단계: 앞글자 연상 완료!', 100);
        }
        return res.json({ text: healedText });
      } catch (err) {
        console.error('Acronym tutor generation error:', err);
        if (progressId) {
          updateProgress(progressId, 1, '오류 발생으로 앞글자 생성 실패', 100);
        }
        return res.status(500).json({ error: err.message || '앞글자 생성 실패.' });
      }
    }

    // Format conversation history as a structured string prompt
    let structuredPrompt = '';
    if (history && Array.isArray(history) && history.length > 0) {
      structuredPrompt += "이전 대화 기록:\n";
      for (const msg of history) {
        const sender = msg.role === 'user' ? '수험생' : '튜터';
        structuredPrompt += `${sender}: ${msg.text}\n`;
      }
      structuredPrompt += "\n현재 질문:\n";
    }
    
    let currentMessage = (message || '').trim();
    if (image) {
      if (!currentMessage) {
        currentMessage = "[첨부 이미지 분석 요청] 수험생이 기술사 관련 스크린샷/이미지를 첨부하였습니다. 이미지에 담긴 모든 텍스트, 문제, 수식, 그래프, 도표 등을 고도로 이해하기 쉽게 분석 및 판독하여, 해당 문제의 출제 의도, 명쾌한 풀이 과정 및 정확한 최종 정답을 친절하고 기술적/공학적으로 완벽히 설명해 주십시오.";
      } else {
        currentMessage = `[첨부 이미지 분석 요청] 수험생이 이미지(스크린샷)와 함께 다음 질문을 보냈습니다: "${currentMessage}". 첨부된 이미지에 표현된 핵심 기술적 문제, 수식, 다이어그램, 텍스트 등을 최우선으로 분석하여 질문에 매우 구체적이고 체계적으로 답변해 주십시오.`;
      }
    }
    structuredPrompt += currentMessage;

    try {
      const systemInstruction = `당신은 대한민국 국가기술자격 기술사 시험(토질및기초기술사, 토목구조기술사, 토목시공기술사, 도로및공항기술사, 수자원개발기술사, 상하수도기술사, 터널기술사 등 토목공학 전 분야) 최고 권위의 기술사 시험 전문 튜터입니다.
수험생의 질문이나 이미지 자료에 대해 학회 표준 및 기술사 시험 수준의 전문 용어를 사용하여 매우 깊이 있는 기술적/실무적 답변을 제시해 주십시오.

[기본 원칙]:
1. 토목공학 전 분야의 유기적 지식 활용:
   - 지반공학(토질 및 기초, 터널), 구조공학(콘크리트, 강구조, 교량), 시공 및 사업관리, 도로, 수자원 등 전 분야에 걸친 깊이 있는 지식을 기반으로 자연스럽고 전문성 높은 지식의 전파.
2. 개념의 기술적/실무적 정확성 확보:
   - 특정 공학적 원리나 거동 메커니즘을 설명할 때는 기술적 맥락을 정확히 파악하여 주동/수동 관점을 명확히 구분하고 균형 있게 설명하십시오.
   - **실제 전공 설계 기준이나 정립된 공학 이론만을 근거로 삼아야 하며, 임의로 부적절한 수학 공식이나 비현실적인 공학 논리를 조합(창작)하지 마십시오.**
   - 물리적 거동 메커니즘을 명확하게 파악하여 논리적 인과관계를 철저히 고수해 주십시오.
3. 환각(Hallucination) 현상 방지:
   - "현재 예측 Canvas에 그려진 문서", "우측 화면의 캔버스", "상단 문서 뷰어" 등 실제 애플리케이션 인터페이스 요소를 멋대로 추측하거나 언급하지 마십시오.
   - **[이미지/스크린샷 판독 최우선]**: 만약 사용자가 이미지(캡처 사진, 문제지 사진 등)를 전송하여 질문한 경우, 이미지 내부의 수식, 필기, 표, 그래프를 최우선으로 판독하고 이를 대화 메시지와 종합하여 답변을 도출하십시오.
4. 겸손하고 전문적인 튜터 태도 유지.
5. 고품질 학술 구조 및 직관적 설명 보완:
   - 공인된 전공 교재의 품질에 걸맞도록 체계적인 개요를 지반공학 정보에 입각하여 자연스럽게 구성하십시오.
   - 설명 도중 등장하는 모든 주요 핵심 개념, 이론, 공식 또는 공학적 판단 기준에 대해서는 수험생의 이해를 돕기 위해 **'정의'**, **'직관적 설명'**, **'메커니즘'** 등의 항목을 아래의 접두사 포맷(글머리 기호 '•', 볼드 '**', 콜론 ':')을 사용하여 개요 바로 아래에 추가하십시오:
     * • **정의**: [해당 개념의 학술적/기술적 정의] (콜론 뒤에 한 칸의 공백을 두고 즉시 같은 줄에 작성)
     * • **직관적 설명**: [개념의 본질을 파악할 수 있는 일상생활 비유, 실무적 느낌, 이미지화 기법 등을 추가 보완]
   - 콜론(:) 바로 앞에서 줄바꿈을 절대 하지 마십시오.
   - 개 개별 이론이나 공법, 개념을 비교 설명할 때는 불필요한 공백 라인을 줄이고 중제목(###)으로 구조를 명확히 분할하십시오 (예: ### 1. 테르자기의 1차원 압밀이론 등).
   - 표(Table)를 사용할 경우 반드시 마크다운 테이블 표준 포맷(| 구분 | 공법 A | 공법 B |)만을 이용해 작성하십시오.
${ENGINEERING_STANDARDS}
${ASCII_DIAGRAM_PROMPT}
${LATEX_CHAT_PROMPT_INSTRUCTIONS}`;

      const responseText = await localCallLLM(systemInstruction, structuredPrompt, image, 'tutor');
      const healedText = healLatexFormulas(responseText);
      if (progressId) {
        updateProgress(progressId, 1, '1단계: 답변 생성 완료!', 100);
      }
      res.json({ text: healedText });
    } catch (err) {
      console.error('Chat route error:', err);
      if (progressId) {
        updateProgress(progressId, 1, '오류 발생으로 답변 실패', 100);
      }
      res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
    }
  } catch (err) {
    console.error('Chat route error:', err);
    if (progressId) {
      updateProgress(progressId, 1, '오류 발생으로 답변 실패', 100);
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// GET /api/debug-env
router.get('/debug-env', async (req, res) => {
  const connectionString = process.env.DATABASE_URL || 
                           process.env.POSTGRES_URL || 
                           process.env.POSTGRES_PRISMA_URL ||
                           process.env.SUPABASE_DATABASE_URL ||
                           '';
  
  const envKeys = Object.keys(process.env).sort();

  // Parse URL to show connection details (no password)
  let parsedInfo = null;
  if (connectionString) {
    try {
      const normalized = connectionString.replace(/^postgres:\/\//, 'postgresql://');
      const url = new URL(normalized);
      parsedInfo = {
        host: url.hostname,
        port: url.port,
        user: decodeURIComponent(url.username),
        database: url.pathname.replace(/^\//, ''),
        passwordLength: url.password.length,
      };
    } catch(e) {
      parsedInfo = { parseError: e.message };
    }
  }

  // Live DB connection test and diagnostics
  let dbLiveTest = 'not_attempted';
  let dbLiveError = null;
  let liveTopics = [];
  let liveSchedules = [];
  if (connectionString) {
    try {
      const { default: pg } = await import('pg');
      const normalized = connectionString.replace(/^postgres:\/\//, 'postgresql://');
      const url = new URL(normalized);
      const testPool = new pg.Pool({
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        host: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 5432,
        database: url.pathname.replace(/^\//, ''),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });
      await testPool.query('SELECT 1');
      
      const topicsRes = await testPool.query('SELECT id, title, category, keywords FROM topics ORDER BY id ASC');
      liveTopics = topicsRes.rows;
      
      const schedulesRes = await testPool.query('SELECT id, topic_id, review_round, status, planned_date FROM schedules ORDER BY id DESC LIMIT 20');
      liveSchedules = schedulesRes.rows;

      await testPool.end();
      dbLiveTest = 'success';
    } catch (e) {
      dbLiveTest = 'failed';
      dbLiveError = e.message;
    }
  }

  const progressList = [];
  if (global.progressTracker) {
    for (const [key, value] of global.progressTracker.entries()) {
      progressList.push({ progressId: key, ...value });
    }
  }

  res.json({
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    keyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
    primaryKeyPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : '',
    hasSecondaryGeminiKey: !!process.env.GEMINI_API_KEY_SECONDARY,
    secondaryKeyLength: process.env.GEMINI_API_KEY_SECONDARY ? process.env.GEMINI_API_KEY_SECONDARY.length : 0,
    secondaryKeyPrefix: process.env.GEMINI_API_KEY_SECONDARY ? process.env.GEMINI_API_KEY_SECONDARY.substring(0, 5) : '',
    hasTertiaryGeminiKey: !!process.env.GEMINI_API_KEY_TERTIARY,
    tertiaryKeyLength: process.env.GEMINI_API_KEY_TERTIARY ? process.env.GEMINI_API_KEY_TERTIARY.length : 0,
    hasClaudeKey: !!process.env.ANTHROPIC_API_KEY,
    claudeKeyLength: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.length : 0,
    hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    openaiKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
    hasXaiKey: !!process.env.XAI_API_KEY,
    xaiKeyLength: process.env.XAI_API_KEY ? process.env.XAI_API_KEY.length : 0,
    hasGrokKey: !!process.env.GROK_API_KEY,
    grokKeyLength: process.env.GROK_API_KEY ? process.env.GROK_API_KEY.length : 0,
    hasDbUrl: !!connectionString,
    dbUrlLength: connectionString.length,
    parsedDbInfo: parsedInfo,
    dbInitError: global.dbInitError || null,
    dbLiveTest,
    dbLiveError,
    liveTopics,
    liveSchedules,
    progressList,
    envKeys: envKeys,
    nodeEnv: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

// GET /api/debug-db
router.get('/debug-db', async (req, res) => {
  try {
    const rows = await dbQuery.all("SELECT key, LENGTH(value) as len, updated_at FROM app_session ORDER BY updated_at DESC LIMIT 50");
    const topics = await dbQuery.all("SELECT id, title FROM topics ORDER BY id DESC LIMIT 50");
    const formulaRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'formula_questions'");
    const recentLS = await dbQuery.get("SELECT value FROM app_session WHERE key = 'recent_lockscreen_questions'");
    const formulaParsed = formulaRow && formulaRow.value ? JSON.parse(formulaRow.value) : null;
    const recentLSParsed = recentLS && recentLS.value ? JSON.parse(recentLS.value) : null;
    res.json({ 
      success: true, 
      rows, 
      topics, 
      debugLogs: global.globalDebugLogs,
      recentLockscreen: recentLSParsed,
      formulasCount: formulaParsed?.formulaQuestions?.length || 0,
      firstFormulas: formulaParsed?.formulaQuestions?.slice(0, 3)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/debug-keys
router.get('/debug-keys', (req, res) => {
  res.json({
    primary: process.env.GEMINI_API_KEY || 'not_set',
    secondary: process.env.GEMINI_API_KEY_SECONDARY || 'not_set'
  });
});

// GET /api/debug-topic-27
router.get('/debug-topic-27', async (req, res) => {
  try {
    const resSchedules = await dbQuery.all(
      "SELECT id, review_round, status, score, completed_at, planned_date FROM schedules WHERE topic_id = 27 ORDER BY review_round"
    );
    const scheduleIds = resSchedules.map(r => r.id);
    let sessions = [];
    if (scheduleIds.length > 0) {
      const queryStr = `SELECT key, LENGTH(value) as len FROM app_session WHERE key IN (${scheduleIds.map(id => `'completed_review_schedule_${id}'`).join(',')})`;
      sessions = await dbQuery.all(queryStr);
    }
    res.json({
      success: true,
      schedules: resSchedules,
      sessions: sessions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/temp-update-db
router.get('/temp-update-db', async (req, res) => {
  try {
    const updateQuestionObj = (formulaQuestions) => {
      if (!Array.isArray(formulaQuestions)) return formulaQuestions;
      return formulaQuestions.map(q => {
        if (!q) return q;
        
        // 댐 침투 또는 침윤선 관련 질문 검출 (비교표 형태의 침윤선 질문)
        const isSeepageTarget = q.id === 11 || 
                                (q.question && 
                                 q.question.includes('침투류') && 
                                 q.question.includes('비교표') && 
                                 (q.question.includes('차수') || q.question.includes('배수')));
        
        // 말뚝 기초 t-z, q-z 거동 관련 질문 검출 (제목/질문에 't-z', 't - z' 포함된 비교표 형태)
        const isPileTarget = q.question &&
                             (q.question.includes('t-z') || q.question.includes('t - z')) &&
                             (q.question.includes('q-z') || q.question.includes('q - z')) &&
                             q.question.includes('비교표') &&
                             (q.question.includes('주면마찰') || q.question.includes('선단지'));
                         
        if (isSeepageTarget) {
          console.log(`[Migration] Migrating Seepage Question ID: ${q.id}, Title: ${q.title}`);
          
          const answerA = "상류 사면 점토 코어나 차수벽 시공을 통해 유입 침투 유량 자체를 물리적으로 차단하고 침투 경로 연장";
          const answerB = "자갈, 필터 모래 등 배수재를 하류측 경계부에 배치하여 유입된 침투수를 세굴 없이 안전하게 외곽으로 배수 유도";
          const answerC = "불투수성 차수벽 전면에서 차단 및 수두 손실이 유도되어 차벽 배후면부터 침윤선 높이가 급격히 저하됨";
          const answerD = "수평 드레인과 필터 구조체의 배수 작용을 통해 침윤선이 하류 사면으로 분출되는 것을 막고 연직 위치를 낮춤";
          
          return {
            ...q,
            title: "필터 및 배수/차수 설계",
            question: "댐체 및 기초지반의 침투류 제어 대책 중 차수 대책과 배수 대책의 거동 메커니즘을 아래 비교표의 빈칸 (A), (B), (C), (D)에 맞게 서술하시오.",
            tableData: {
              headers: ["구분", "주요 기전 (유량 제어)", "침윤선(Seepage Line)에 미치는 영향"],
              rows: [
                ["차수 대책", "[INPUT_1]", "[INPUT_3]"],
                ["배수 대책", "[INPUT_2]", "[INPUT_4]"]
              ]
            },
            answers: {
              "INPUT_1": answerA,
              "INPUT_2": answerB,
              "INPUT_3": answerC,
              "INPUT_4": answerD
            }
          };
        } else if (isPileTarget) {
          console.log(`[Migration] Migrating Pile Question ID: ${q.id}, Title: ${q.title}`);
          
          const answerA = "말뚝 주면의 지반 변위가 발생함에 따라 전단 저항 거동이 발현되며, 매우 미세한 변위(약 5~10mm)에서 최대 극한 저항력에 도달함";
          const answerB = "말뚝 선단부가 침하 및 압축됨에 따라 지반 압축 전단 저항이 발현되며, 상대적으로 매우 큰 변위(말뚝 직경의 10% 수준)가 요구됨";
          const answerC = "초기 재하 단계에서 지반 강성 저항을 통해 즉각 발현되어 하중의 대부분을 지지하나, 슬립이 발생한 이후에는 일정한 마찰력 유지";
          const answerD = "초기 하중 전이 비중이 낮으나 하중이 증가하고 주면 마찰이 항복에 이르면 점진적으로 지지 분담율이 극대화되어 최종 극한 지지력 확보";
          
          return {
            ...q,
            title: "말뚝 하중 전이 메커니즘",
            question: "말뚝 기초 하중 전이 메커니즘 중 주면 전단 거동(t-z)과 선단 저항 거동(q-z)의 거동 특징을 아래 비교표의 빈칸 (A), (B), (C), (D)에 맞게 서술하시오.",
            tableData: {
              headers: ["구분", "발현 변위 조건 및 극한 상태 도달 기준", "하중 전이 기전 및 지지력 분담 특성"],
              rows: [
                ["주면마찰 거동 (t-z)", "[INPUT_1]", "[INPUT_3]"],
                ["선단지지 거동 (q-z)", "[INPUT_2]", "[INPUT_4]"]
              ]
            },
            answers: {
              "INPUT_1": answerA,
              "INPUT_2": answerB,
              "INPUT_3": answerC,
              "INPUT_4": answerD
            }
          };
        }
        return q;
      });
    };

    // 1. Migrate formula_questions
    const formulaRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'formula_questions'");
    if (formulaRow && formulaRow.value) {
      const parsed = JSON.parse(formulaRow.value);
      if (parsed && Array.isArray(parsed.formulaQuestions)) {
        const updated = updateQuestionObj(parsed.formulaQuestions);
        await saveSessionValue('formula_questions', JSON.stringify({ formulaQuestions: updated }));
        console.log('[Migration] Successfully updated formula_questions in DB.');
      }
    }

    // 2. Migrate schedules matching review rounds
    const scheduleIds = await dbQuery.all("SELECT id FROM schedules WHERE topic_id = 11");
    for (const s of scheduleIds) {
      const sessionKey = `review_questions_schedule_${s.id}`;
      const sessionRow = await dbQuery.get("SELECT value FROM app_session WHERE key = ?", [sessionKey]);
      if (sessionRow && sessionRow.value) {
        const parsed = JSON.parse(sessionRow.value);
        if (parsed && Array.isArray(parsed.questions)) {
          const updated = updateQuestionObj(parsed.questions);
          await saveSessionValue(sessionKey, JSON.stringify({ questions: updated }));
          console.log(`[Migration] Successfully updated schedule ${s.id} questions in DB.`);
        }
      }
    }

    // 3. Synchronize generation standards as safety fallback
    const log = [];
    const latestStandards = [
      {
        "id": "user_generation_lqyjy05",
        "title": "전반적 지침2",
        "content": "AI는 문제를 출제할 때 제공된 토픽 문서 텍스트에 포함된 단어들을 단순히 빈칸으로 만들거나 그대로 베끼는 1차원적인 문제 출제를 엄격히 금지합니다. 해당 토픽에 대해 튜터와 대화할 때 도출되는 수준의\n① 거동 원리 및 메커니즘\n② 공식 유도 과정 및 가정 조건\n③ 공법/이론 간의 장단점 비교 대조표\n④ 설계·시공 현장에서의 실무적 문제 상황 해결책(시나리오)을\n\n종합적으로 감안하여 학술적 깊이가 있는 기술사형 응용 문제를 출제"
      },
      {
        "id": "user_generation_wiapyp1",
        "title": "전반적 지침1",
        "content": "1. 제공된 원보고서(노트)의 요약 텍스트 내용에만 기계적으로 국한하여 출제하지 마십시오.\n2. 해당 토픽의 전반적인 학술적 개요, 물리적·역학적 거동 메커니즘, 이론 전개 시 사용되는 기본 가정 조건, 그리고 핵심 공학 수식을 지반공학 전공 서적 및 실무 설계 기준(KDS) 관점에서 심층 분석하여 문제를 구성하십시오.\n3. 특히 타 공법이나 유사 이론과의 비교표 칸채우기(표채우기 문항), 현장에서 발생할 수 있는 구체적인 한계 상태 시나리오 및 기술사로서의 실무 안정 대책(단답형 문항)을 적극적으로 연계하여 다차원적인 공학적 판단력을 평가할 수 있도록 참신하게 출제해 주십시오."
      },
      {
        "id": "user_generation_cpjrwj5",
        "title": "복합 문제",
        "content": "하나의 토픽 내에서 2가지 이상의 세부 항목을 질문할 경우, 각각의 정의를 묻는 방식도 중요하지만  \n두 항목 간의 상호 관계, 역학적 메커니즘의 차이, 설계/시공 시의 상호 영향성, 혹은 공학적 비교 분석을 요구하는 통합형 문제를 출제하십시오.."
      },
      {
        "id": "user_generation_long_noun_ending_answers",
        "title": "주관식 정답의 장문 메커니즘 및 명사형 종결어미 의무화",
        "content": "🚨 [주관식 정답의 장문 메커니즘 및 명사형 종결어미 의무화 - 극도로 중요!]: 주관식(개요, 공식, 단답형, 표채우기 등)의 모든 모범 답안(\"answers\" 내의 각 값 또는 \"answer\")은 절대로 1~2 단어의 단순 명칭이나 짧은 요약형 문장으로 작성해서는 안 되며, 반드시 지반공학적 거동 원리, 인과관계, 시공 및 설계 제어 메커니즘을 명확히 명시하되, 너무 길어지지 않도록 핵심 위주의 명료한 서술형(최소 50자에서 최대 120자 내외)으로 간결하게 작성하십시오. 또한, 모든 정답의 어미는 기술사 답안지 작성 원칙에 부합하도록 \"~다\", \"~입니다\", \"~하겠다\"와 같은 평서문/구어체 종결어미를 절대 금지하며, 반드시 명사형 종결어미(예: ~함, ~저감, ~방지, ~유도, ~제어, ~확보, ~감소, ~소산, ~이동, ~상쇄, ~상태, ~형태, ~수준 등)로 명확히 끝맺음하여 서술하십시오. 예시: '...을 방지함', '...을 통한 침투압 감소' (O) / '...을 방지합니다', '...을 통해 침투압이 감소된다' (X)"
      },
      {
        "id": "user_generation_vfp6zqj",
        "title": "객관식 지침",
        "content": "지침 내용: \n1.🚨 [계산형 문항의 정확한 계산값 객관식 보기 의무화 - 극도로 중요!]: 계산형 문제(특히 선택형/객관식 문항)를 출제할 때, 문제의 공식과 대입값으로 산출되는 실제 정확한 수학적/공학적 계산값(소수점 1~2자리 포함, 예: 66.67 GPa)은 반드시 객관식 보기의 4개 항목(options) 중 하나(정답 항목)로 정확히 포함되어야 합니다. 계산 결과가 소수점을 가질 경우, 보기 항목을 임의의 정수나 엉뚱한 값(예: 70 GPa)으로 둥글게 처리하여 '가장 근사한 값을 고르라'는 식으로 얼버무려서 출제하는 행위를 엄격히 금지합니다. 반드시 실제 공식에 값을 대입해 나온 정확한 수치를 보기 항목과 모범 답안으로 등록하십시오.\n\n2.객관식문제낼때 소스에 한정하지말고 소스 토픽을 ai튜터와 이야기 나눴을때, 나오는 메커니즘, 정의, 공식 등 전반적인 내용으로 출제하도록 해\n\n3.중요한 개념문제를 난이도 어렵게 내도록 해"
      },
      {
        "id": "user_generation_bu5e5cd",
        "title": "표 채우기 문제출제 절대 지침",
        "content": "1. 🚨 [표 채우기 문항의 가로/세로축 독립 차원 설계 의무화 - 극도로 중요!]: 표 채우기(Table Quiz) 형태의 문항을 설계 및 출제할 때, 표의 가로 헤더(Column)와 세로 헤더(Row)가 절대로 동일하거나 유사한 성격의 평가 차원(예: 가로축도 '주변 지반 영향', 세로축도 '역학적 영향' 등)으로 중복 구성되지 않도록 엄격히 제약하십시오. 가로축과 세로축은 반드시 서로 완전히 다른 독립적인 성격의 차원을 형성해야 합니다. 예를 들어, 세로축이 비교 대상이 되는 시공/공법 항목(예: '어스앵커', '소일내일링')이라면, 가로축은 그에 대응하는 평가 속성(예: '거동 메커니즘', '활용성')으로 결합되어 각 격자(Cell)가 고유하고 유일한 지식 범주를 검증할 수 있도록 설계하십시오. 동일한 답안이 가로축의 여러 칸에 의미 없이 복사-붙여넣기식으로 겹쳐서 생성되는 형태의 출제를 엄격히 금지합니다.\n\n2.🚨 [표 채우기 문항의 칸별 정답 속성 매핑 무결성 의무화 - 극도로 중요!]: 표 채우기(Table Quiz) 문항을 출제할 때, 각 격자(Cell)에 매핑되는 정답(`answers` 객체의 `INPUT_1`, `INPUT_2` 등)은 반드시 해당 셀이 속한 열(Column) 헤더와 행(Row) 헤더의 기하학적/공학적 정의와 **100% 일치**해야 합니다. 등방성(Isotropic) 지반을 나타내는 열의 셀(`[INPUT_1]`)에 이방성(Anisotropic) 관련 개념이나 수식(예: $x' = x\\sqrt{k_v/k_h}$ 등)을 정답으로 배치하는 식의 컬럼 간 정답 혼동 및 오매핑 행위를 엄격히 금지합니다. 표의 각 입력 칸은 해당 지반 조건(예: 등방성 균질 vs 이방성 불균질) 및 공학 분류의 의미적 범주를 절대 벗어나지 않도록 완벽히 교차 검증하여 정답을 설계하십시오.\n\n3.🚨 [표 채우기 문항의 지문 내 빈칸 지칭 일치 의무화 - 극도로 중요!]: 표 채우기(Table Quiz) 문항을 출제할 때, 질문(question) 지문 내에 언급하는 빈칸 번호(예: \"빈칸 (A), (B), (C), (D)에 들어갈 내용...\")의 개수와 알파벳 순서는 실제 표(tableData) 내부에 배치된 빈칸 토큰(INPUT_1, INPUT_2, INPUT_3, INPUT_4)의 총 개수 및 순서와 반드시 **100% 일치**해야 합니다. 만약 표 내부에 빈칸이 4개(a, b, c, d) 존재함에도 지문에서 \"빈칸 (A), (B)에 들어갈 내용...\"과 같이 일부만 지칭하여 질문하는 식의 심각한 불일치 오류를 절대 발생시키지 마십시오. 또한, 비교 대상(예: 현장 베인 시험, 피에조콘 시험)을 지칭하는 기호(A), (B)는 질문 본문에서 대괄호/괄호 형태 기호로 직접 지칭하는 것을 금지하며, 명칭 자체로만 언급하십시오. `(A), (B), (C), (D)` 기호는 오직 표의 빈칸 입력 칸들만을 순서대로 지칭하는 용도로만 일관되게 사용하십시오."
      }
    ];

    await saveSessionValue('generation_standards', JSON.stringify(latestStandards));
    updateLiveGenerationStandards(latestStandards);
    log.push("Successfully synchronized all generation standards to database.");

    res.json({ success: true, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/run-patch-3-24
router.get('/run-patch-3-24', async (req, res) => {
  console.log('[API Patch] Manual trigger run-patch-3-24 requested.');
  try {
    const isForce = req.query.force === 'true';
    if (!isForce) {
      const checkLock = await dbQuery.get("SELECT value FROM app_session WHERE key = 'patch_reset_topics_3_24_done'");
      if (checkLock && checkLock.value === 'true') {
        return res.json({ success: true, message: 'Reset patch already applied previously. Pass ?force=true to override.' });
      }
    }

    const baseDateStr = '2026-06-29 00:00:00';
    const roundDates = {
      2: '2026-07-03',
      3: '2026-07-10',
      4: '2026-07-24',
      5: '2026-08-28',
      6: '2026-10-27',
    };

    const schedules = await dbQuery.all(
      "SELECT id, topic_id, review_round, status, score FROM schedules WHERE topic_id >= 3 AND topic_id <= 24 AND review_round < 99"
    );

    let patchCount1 = 0;
    let patchCount2 = 0;
    let deletedSessions = 0;

    for (const s of schedules) {
      if (s.review_round === 1) {
        const finalScore = (s.score && s.score > 0) ? s.score : 100;
        await dbQuery.run(
          "UPDATE schedules SET status = 'completed', completed_at = ?, score = ? WHERE id = ?",
          [baseDateStr, finalScore, s.id]
        );
        patchCount1++;
      } else if (s.review_round >= 2 && s.review_round <= 6) {
        const correctPlannedDate = roundDates[s.review_round];
        await dbQuery.run(
          "UPDATE schedules SET status = 'pending', completed_at = NULL, score = NULL, correct_count = NULL, total_count = NULL, planned_date = ? WHERE id = ?",
          [correctPlannedDate, s.id]
        );
        
        const keysToDelete = [
          `completed_review_schedule_${s.id}`,
          `review_questions_schedule_${s.id}`
        ];
        for (const k of keysToDelete) {
          const delRes = await dbQuery.run("DELETE FROM app_session WHERE key = ?", [k]);
          deletedSessions += delRes.changes || 0;
        }
        patchCount2++;
      }
    }

    await saveSessionValue('patch_reset_topics_3_24_done', 'true');
    
    res.json({
      success: true,
      message: 'Successfully patched database.',
      round1_completed_count: patchCount1,
      round2_to_6_reset_count: patchCount2,
      deleted_sessions_count: deletedSessions
    });
  } catch (err) {
    console.error('[API Patch] Manual trigger failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
