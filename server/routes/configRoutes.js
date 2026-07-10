import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dbQuery } from '../database.js';
import { saveSessionValue, globalPreferredModel, updatePreferredModel } from '../services/aiService.js';
import { updateLiveEngineeringStandards, standardsList } from '../plugins/engineeringStandards.js';
import { updateLiveGradingStandards, gradingStandardsList } from '../plugins/gradingPlugin.js';
let validationStandardsList = [];
function updateLiveValidationStandards(newList) {
  validationStandardsList = newList;
}
import { updateLiveGenerationStandards, generationStandardsList } from '../plugins/generationStandards.js';
import { updateLiveLockscreenStandards, lockscreenStandardsList } from '../plugins/lockscreenStandards.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

const router = express.Router();

async function pushStandardToProduction(apiPath, standards) {
  const isVercel = !!process.env.VERCEL;
  if (isVercel) return;
  try {
    const res = await fetch(`https://anti-ashy.vercel.app/api/${apiPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ standards })
    });
    if (res.ok) {
      console.log(`[Push] Successfully pushed ${apiPath} to Vercel production.`);
    } else {
      console.warn(`[Push] Failed to push ${apiPath} to Vercel production: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[Push] Network error pushing ${apiPath} to Vercel production:`, err.message);
  }
}

async function purgeAllQuizCaches() {
  console.log('[Cache Clean] Bypassed automatic quiz cache purging to preserve user review histories.');
}

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
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'preferred_model'");
    if (row && row.value) {
      updatePreferredModel(row.value);
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
      console.log(`[Setting Saved] Preferred Model updated to: ${model}`);
      return res.json({ success: true, model });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(400).json({ error: 'Invalid model' });
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

export default router;
