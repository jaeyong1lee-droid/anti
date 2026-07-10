import express from 'express';
import { dbQuery } from '../database.js';
import { saveSessionValue, callLLMWithFailover } from '../services/aiService.js';
import { LOCKSCREEN_STANDARDS } from '../plugins/lockscreenStandards.js';
import { generateDailyLockscreenQuestions } from './../plugins/lockscreenQuizPlugin.js';

const router = express.Router();

function getCallLLM(req) {
  const progressId = req && (req.query?.progressId || req.body?.progressId);
  return (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });
}

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

async function getLockscreenCandidates() {
  const historyRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_usage_history'");
  let usageHistory = {};
  if (historyRow && historyRow.value) {
    try {
      usageHistory = JSON.parse(historyRow.value) || {};
    } catch (e) {
      console.warn('Failed to parse lockscreen usage history:', e);
    }
  }

  const allTopics = await dbQuery.all(`
    SELECT id, title, keywords, category FROM topics ORDER BY created_at DESC
  `);
  
  const formulaRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'formula_images'");
  let formulaList = [];
  if (formulaRow && formulaRow.value) {
    try {
      const parsed = JSON.parse(formulaRow.value);
      formulaList = parsed.formulaImages || [];
    } catch (e) {
      console.warn('Failed to parse formula list for lockscreen:', e);
    }
  }

  const sortedFormulas = [...formulaList].sort((a, b) => {
    const usageA = usageHistory[a.id] || 0;
    const usageB = usageHistory[b.id] || 0;
    return usageA - usageB;
  });

  const sortedTopics = [...allTopics].sort((a, b) => {
    const usageA = usageHistory[a.id] || 0;
    const usageB = usageHistory[b.id] || 0;
    return usageA - usageB;
  });

  return {
    formulaCandidates: sortedFormulas,
    finalTopicCandidates: sortedTopics,
    usageHistory
  };
}

async function updateLockscreenUsageHistory(generatedQuestions, usageHistory) {
  if (Array.isArray(generatedQuestions)) {
    generatedQuestions.forEach(q => {
      if (q.originalId) {
        usageHistory[q.originalId] = (usageHistory[q.originalId] || 0) + 1;
      }
    });
    try {
      await saveSessionValue('lockscreen_usage_history', JSON.stringify(usageHistory));
    } catch (dbErr) {
      console.warn('Failed to save updated lockscreen usage history:', dbErr.message);
    }
  }
}

let isLockscreenPoolReplenishing = false;

async function replenishLockscreenPool(req) {
  if (isLockscreenPoolReplenishing) {
    console.log('[Lockscreen Pool] Replenishment is already in progress. Skipping.');
    return;
  }

  isLockscreenPoolReplenishing = true;
  console.log('[Lockscreen Pool] Checking replenishment status...');

  try {
    await ensureSessionTable();

    let pool = [];
    const poolRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
    if (poolRow && poolRow.value) {
      try {
        pool = JSON.parse(poolRow.value) || [];
      } catch (e) {
        console.warn('Failed to parse lockscreen pool:', e);
      }
    }

    const targetSize = 5;
    if (pool.length >= targetSize) {
      console.log(`[Lockscreen Pool] Pool has ${pool.length} questions. No replenishment needed.`);
      isLockscreenPoolReplenishing = false;
      return;
    }

    const needCount = targetSize - pool.length;
    console.log(`[Lockscreen Pool] Current pool size: ${pool.length}. Generating ${needCount} new questions...`);

    const { formulaCandidates, finalTopicCandidates, usageHistory } = await getLockscreenCandidates();
    if (formulaCandidates.length === 0 && finalTopicCandidates.length === 0) {
      console.warn('[Lockscreen Pool] No candidates available to generate new questions.');
      isLockscreenPoolReplenishing = false;
      return;
    }

    let recentQuestions = [];
    const recentRows = await dbQuery.all("SELECT value FROM app_session WHERE key = 'recent_lockscreen_questions'");
    if (recentRows.length > 0 && recentRows[0].value) {
      try {
        recentQuestions = JSON.parse(recentRows[0].value) || [];
      } catch (e) {
        console.warn('Failed to parse recent lockscreen questions:', e);
      }
    }

    const currentPoolTexts = pool.map(q => q.question);
    const combinedRecent = [...new Set([...currentPoolTexts, ...recentQuestions])];

    const callLLM = getCallLLM(req);
    const generatedQuestions = await generateDailyLockscreenQuestions(
      formulaCandidates,
      finalTopicCandidates,
      callLLM,
      needCount,
      LOCKSCREEN_STANDARDS,
      combinedRecent
    );

    if (Array.isArray(generatedQuestions) && generatedQuestions.length > 0) {
      const updatedPool = [...pool, ...generatedQuestions].map((q, idx) => ({
        ...q,
        id: `ls_${idx + 1}`
      }));
      await saveSessionValue('lockscreen_pregenerated_pool', JSON.stringify(updatedPool));
      await updateLockscreenUsageHistory(generatedQuestions, usageHistory);
      console.log(`[Lockscreen Pool] Added ${generatedQuestions.length} questions. Pool size: ${updatedPool.length}`);
    }
  } catch (err) {
    console.error('[Lockscreen Pool] Replenishment error:', err);
  } finally {
    isLockscreenPoolReplenishing = false;
  }
}

// GET /api/lockscreen/pool -> Retrieve pregenerated pool without consuming
router.get('/pool', async (req, res) => {
  try {
    await ensureSessionTable();
    let pool = [];
    const poolRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
    if (poolRow && poolRow.value) {
      try {
        pool = JSON.parse(poolRow.value) || [];
      } catch (e) {
        console.warn('Failed to parse lockscreen pool:', e);
      }
    }

    if (pool.length < 5) {
      console.log(`[Lockscreen Pool API] Pool has only ${pool.length} questions. Replenishing synchronously...`);
      await replenishLockscreenPool(req);
      const updatedPoolRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
      if (updatedPoolRow && updatedPoolRow.value) {
        try {
          pool = JSON.parse(updatedPoolRow.value) || [];
        } catch (e) {
          console.warn('Failed to parse updated lockscreen pool:', e);
        }
      }
    }

    res.json({ success: true, pool });
  } catch (err) {
    console.error('GET /api/lockscreen/pool error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lockscreen/solve -> Solve and remove a question from pregenerated pool
router.post('/solve', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Question ID is required' });
    }

    await ensureSessionTable();
    let pool = [];
    const poolRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
    if (poolRow && poolRow.value) {
      try {
        pool = JSON.parse(poolRow.value) || [];
      } catch (e) {
        console.warn('Failed to parse lockscreen pool:', e);
      }
    }

    const solvedQuestion = pool.find(q => q.id === id);
    const updatedPool = pool.filter(q => q.id !== id);

    await saveSessionValue('lockscreen_pregenerated_pool', JSON.stringify(updatedPool));
    console.log(`[Lockscreen Solve] Solved question ${id}. Remaining pool: ${updatedPool.length}`);

    if (solvedQuestion && solvedQuestion.question) {
      let recentQuestions = [];
      const recentRows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['recent_lockscreen_questions']);
      if (recentRows.length > 0 && recentRows[0].value) {
        try {
          recentQuestions = JSON.parse(recentRows[0].value) || [];
        } catch (e) {
          console.warn('Failed to parse recent lockscreen questions:', e);
        }
      }

      let updatedRecent = [solvedQuestion.question, ...recentQuestions];
      if (updatedRecent.length > 30) {
        updatedRecent = updatedRecent.slice(0, 30);
      }
      await saveSessionValue('recent_lockscreen_questions', JSON.stringify(updatedRecent));
    }

    replenishLockscreenPool(req).catch(err => {
      console.error('[Lockscreen Solve] Background replenishment failed:', err);
    });

    res.json({ success: true, pool: updatedPool });
  } catch (err) {
    console.error('POST /api/lockscreen/solve error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lockscreen/sync -> Get or generate daily lockscreen questions
router.get('/sync', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const count = parseInt(req.query.count || '1', 10);

    let recentQuestions = [];
    const recentRows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['recent_lockscreen_questions']);
    if (recentRows.length > 0 && recentRows[0].value) {
      try {
        recentQuestions = JSON.parse(recentRows[0].value) || [];
      } catch (e) {
        console.warn('Failed to parse recent lockscreen questions:', e);
      }
    }

    const poolRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_pregenerated_pool'");
    let pool = [];
    if (poolRow && poolRow.value) {
      try {
        pool = JSON.parse(poolRow.value) || [];
      } catch (e) {
        console.warn('Failed to parse lockscreen pool:', e);
      }
    }

    if (pool.length >= count) {
      const shuffledPool = [...pool].sort(() => 0.5 - Math.random());
      const selected = shuffledPool.slice(0, count);
      const remaining = shuffledPool.slice(count).map((q, idx) => ({ ...q, id: `ls_${idx + 1}` }));

      await saveSessionValue('lockscreen_pregenerated_pool', JSON.stringify(remaining));

      if (selected.length > 0) {
        const newQTexts = selected.map(q => q.question);
        let updatedRecent = [...newQTexts, ...recentQuestions];
        if (updatedRecent.length > 30) {
          updatedRecent = updatedRecent.slice(0, 30);
        }
        await saveSessionValue('recent_lockscreen_questions', JSON.stringify(updatedRecent));
      }

      replenishLockscreenPool(req).catch(err => console.error('[Lockscreen Sync] Replenish background error:', err));
      console.log(`[Lockscreen Sync] Served ${count} questions from pool. Remaining: ${remaining.length}`);
      return res.json({ success: true, questions: selected });
    }

    console.log(`[Lockscreen Sync] Pool is insufficient (${pool.length}/${count}). Generating synchronously...`);
    const { formulaCandidates, finalTopicCandidates, usageHistory } = await getLockscreenCandidates();

    if (formulaCandidates.length === 0 && finalTopicCandidates.length === 0) {
      return res.status(404).json({ success: false, error: '후보 데이터가 부족합니다.' });
    }

    const currentPoolTexts = pool.map(q => q.question);
    const combinedRecent = [...new Set([...currentPoolTexts, ...recentQuestions])];

    const callLLM = getCallLLM(req);
    const generatedQuestions = await generateDailyLockscreenQuestions(
      formulaCandidates,
      finalTopicCandidates,
      callLLM,
      count,
      LOCKSCREEN_STANDARDS,
      combinedRecent
    );

    if (Array.isArray(generatedQuestions) && generatedQuestions.length > 0) {
      const newQTexts = generatedQuestions.map(q => q.question);
      let updatedRecent = [...newQTexts, ...recentQuestions];
      if (updatedRecent.length > 30) {
        updatedRecent = updatedRecent.slice(0, 30);
      }
      await saveSessionValue('recent_lockscreen_questions', JSON.stringify(updatedRecent));
      await updateLockscreenUsageHistory(generatedQuestions, usageHistory);
    }

    replenishLockscreenPool(req).catch(err => console.error('[Lockscreen Sync] Replenish background error:', err));
    return res.json({ success: true, questions: generatedQuestions });
  } catch (err) {
    console.error('GET /api/lockscreen/sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
