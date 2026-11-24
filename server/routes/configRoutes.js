import express from 'express';
import { dbQuery } from '../database.js';
import { saveSessionValue, globalPreferredModel, globalStageModels, globalAllowGradingFallback, updatePreferredModel, updateStageModels, updateAllowGradingFallback } from '../services/aiService.js';
import { healFormulaQuestionObject } from '../utils/latexUtils.js';
import { defaultAcronyms } from '../plugins/acronymsPlugin.js';
import { defaultOverviews } from '../plugins/overviewsPlugin.js';

const router = express.Router();

// Config In-Memory Cache to bypass DB queries on high frequency reads
const configMemoryCache = new Map();

// GET /api/preferred-model
router.get('/preferred-model', async (req, res) => {
  if (
    configMemoryCache.has('preferred_model') &&
    configMemoryCache.has('stage_preferred_models') &&
    configMemoryCache.has('grading_allow_fallback')
  ) {
    return res.json({
      model: configMemoryCache.get('preferred_model'),
      stageModels: configMemoryCache.get('stage_preferred_models'),
      allowGradingFallback: Boolean(configMemoryCache.get('grading_allow_fallback'))
    });
  }
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'preferred_model'");
    if (row && row.value) {
      updatePreferredModel(row.value);
    }
    const stageRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'stage_preferred_models'");
    if (stageRow && stageRow.value) {
      try {
        updateStageModels(JSON.parse(stageRow.value));
      } catch (e) {}
    }
    const fallbackRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'grading_allow_fallback'");
    if (fallbackRow && fallbackRow.value !== undefined && fallbackRow.value !== null) {
      updateAllowGradingFallback(String(fallbackRow.value).trim().toLowerCase() === 'true');
    }
    configMemoryCache.set('preferred_model', globalPreferredModel);
    configMemoryCache.set('stage_preferred_models', { ...globalStageModels });
    configMemoryCache.set('grading_allow_fallback', Boolean(globalAllowGradingFallback));
  } catch (err) {
    console.warn("Failed to load preferred model from DB in GET /api/preferred-model:", err.message);
  }
  res.json({
    model: globalPreferredModel,
    stageModels: globalStageModels,
    allowGradingFallback: Boolean(globalAllowGradingFallback)
  });
});

// POST /api/preferred-model
router.post('/preferred-model', async (req, res) => {
  const { model, stage, stageModels, allowGradingFallback } = req.body || {};
  let handled = false;
  try {
    if (typeof allowGradingFallback === 'boolean') {
      const updatedFallback = updateAllowGradingFallback(allowGradingFallback);
      await saveSessionValue('grading_allow_fallback', String(updatedFallback));
      configMemoryCache.set('grading_allow_fallback', updatedFallback);
      console.log(`[Setting Saved] Allow Grading Fallback updated to: ${updatedFallback}`);
      handled = true;
    }
    if (stageModels && typeof stageModels === 'object') {
      const updated = updateStageModels(stageModels);
      await saveSessionValue('stage_preferred_models', JSON.stringify(updated));
      await saveSessionValue('preferred_model', updated.tutor || globalPreferredModel);
      configMemoryCache.set('preferred_model', updated.tutor || globalPreferredModel);
      configMemoryCache.set('stage_preferred_models', { ...updated });
      console.log('[Setting Saved] Stage Models updated to:', JSON.stringify(updated));
      return res.json({
        success: true,
        model: globalPreferredModel,
        stageModels: updated,
        allowGradingFallback: Boolean(globalAllowGradingFallback)
      });
    }
    if (typeof stage === 'string' && ['ppt', 'question', 'grading', 'tutor'].includes(stage) && typeof model === 'string' && (model.startsWith('gemini-') || model.startsWith('claude-'))) {
      const updated = updateStageModels({ [stage]: model });
      await saveSessionValue('stage_preferred_models', JSON.stringify(updated));
      configMemoryCache.set('stage_preferred_models', { ...updated });
      if (stage === 'tutor') {
        await saveSessionValue('preferred_model', model);
        configMemoryCache.set('preferred_model', model);
      }
      console.log(`[Setting Saved] Stage [${stage}] Model updated to: ${model}`);
      return res.json({
        success: true,
        model: globalPreferredModel,
        stageModels: updated,
        allowGradingFallback: Boolean(globalAllowGradingFallback)
      });
    }
    if (typeof model === 'string' && (model.startsWith('gemini-') || model.startsWith('claude-'))) {
      updatePreferredModel(model);
      await saveSessionValue('preferred_model', model);
      configMemoryCache.set('preferred_model', model);
      configMemoryCache.set('stage_preferred_models', { ...globalStageModels });
      console.log(`[Setting Saved] Preferred Model updated to: ${model}`);
      return res.json({
        success: true,
        model,
        stageModels: globalStageModels,
        allowGradingFallback: Boolean(globalAllowGradingFallback)
      });
    }
    if (handled) {
      return res.json({
        success: true,
        model: globalPreferredModel,
        stageModels: globalStageModels,
        allowGradingFallback: Boolean(globalAllowGradingFallback)
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
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

// GET /api/session/formula
router.get('/session/formula', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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
    const { formulaOverviews } = req.body;
    const value = JSON.stringify({ formulaOverviews });
    await saveSessionValue('formula_overviews', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/overviews error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/mixed-completed
router.get('/session/mixed-completed', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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
    const key = `option_${req.params.key}`;
    const { value } = req.body;
    await dbQuery.run(
      `INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
      [key, value]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(`POST /api/options/${req.params.key} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/exam
router.get('/session/exam', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const rows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['exam_session']);
    if (rows.length > 0 && rows[0].value) {
      const data = JSON.parse(rows[0].value);
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

export default router;
