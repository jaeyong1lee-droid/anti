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

// GET /api/db-diagnostics -> Check topic 44 data on Vercel
router.get('/db-diagnostics', async (req, res) => {
  try {
    const schedules = await dbQuery.all(
      'SELECT id, review_round, planned_date, completed_at, status, score FROM schedules WHERE topic_id = 44 ORDER BY review_round'
    );
    
    const sessions = await dbQuery.all(
      "SELECT key, length(value) as len, updated_at FROM app_session WHERE key LIKE 'completed_review_schedule_%'"
    );
    
    res.json({
      success: true,
      schedules,
      sessions: sessions.filter(s => {
        const schedId = s.key.replace('completed_review_schedule_', '');
        return schedules.some(sch => String(sch.id) === String(schedId));
      })
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

export default router;
