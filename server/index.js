import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initDatabase, dbQuery, isPostgres } from './database.js';
import { startBackupScheduler } from './backupManager.js';
import { loadPreferredModel, globalPreferredModel } from './services/aiService.js';

// Route Imports
import configRoutes from './routes/configRoutes.js';
import topicRoutes from './routes/topicRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import gradingRoutes from './routes/gradingRoutes.js';
import lockscreenRoutes from './routes/lockscreenRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Global Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// AI Progress Tracker State
global.progressTracker = global.progressTracker || new Map();

app.get('/api/progress/:progressId', (req, res) => {
  const { progressId } = req.params;
  const progress = global.progressTracker.get(progressId);
  if (!progress) {
    return res.json({ step: 0, message: '', percentage: 0 });
  }
  res.json({ step: progress.step, message: progress.message, percentage: progress.percentage });
});

// Clean up expired progress tracks every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, value] of global.progressTracker.entries()) {
    if (now - value.timestamp > 300000) { // 5 minutes
      global.progressTracker.delete(id);
    }
  }
}, 60000);

// Initialize DB route (diagnostic)
app.get('/api/init-db', async (req, res) => {
  try {
    await initDatabase();
    res.json({ success: true, message: 'DB tables initialized successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Diagnostic LLM key tester route
app.get('/api/test-llm', async (req, res) => {
  const logs = [];
  const keys = [
    { name: 'GEMINI_API_KEY', val: process.env.GEMINI_API_KEY },
    { name: 'GEMINI_API_KEY_SECONDARY', val: process.env.GEMINI_API_KEY_SECONDARY }
  ];

  for (const k of keys) {
    if (!k.val) {
      logs.push({ name: k.name, status: 'SKIPPED', reason: 'Key not configured' });
      continue;
    }
    const trimmed = k.val.trim().replace(/^['"]|['"]$/g, '');
    const masked = `${trimmed.substring(0, 8)}...${trimmed.substring(trimmed.length - 4)}`;
    logs.push({ name: k.name, masked, status: 'CONFIGURED' });
  }
  res.json({ success: true, logs });
});

// Bind Modularized Express Routers
app.use('/api', configRoutes);
app.use('/api', topicRoutes);
app.use('/api', quizRoutes);
app.use('/api', gradingRoutes);
app.use('/api/lockscreen', lockscreenRoutes);

// Static Client Asset Serving for Production deployments
const clientBuildPath = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientBuildPath)) {
  console.log(`[Static Serving] Serving production build assets from: ${clientBuildPath}`);
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  console.log('[Static Serving] Production build folder not found. Local server started in API mode.');
}

import { updateLiveEngineeringStandards, standardsList } from './plugins/engineeringStandards.js';
import { updateLiveGradingStandards } from './plugins/gradingPlugin.js';
import { gradingStandardsList } from './plugins/gradingStandardsList.js';
import { updateLiveGenerationStandards, generationStandardsList } from './plugins/generationStandards.js';
import { updateLiveLockscreenStandards, lockscreenStandardsList } from './plugins/lockscreenStandards.js';

import { saveSessionValue } from './services/aiService.js';

function mergeStandards(fileList, dbList, fileIsNewer = false) {
  if (fileIsNewer) {
    const dbMap = new Map((dbList || []).map(item => [item.id, item]));
    return fileList.map(fileItem => {
      const dbItem = dbMap.get(fileItem.id);
      if (!dbItem || dbItem.content !== fileItem.content || dbItem.title !== fileItem.title) {
        return { ...fileItem, updatedAt: new Date().toISOString() };
      }
      return dbItem;
    });
  } else {
    const fileMap = new Map(fileList.map(item => [item.id, item]));
    const merged = [];
    for (const dbItem of dbList || []) {
      merged.push(dbItem);
    }
    const dbIds = new Set((dbList || []).map(item => item.id));
    for (const fileItem of fileList) {
      if (!dbIds.has(fileItem.id)) {
        merged.push({ ...fileItem, updatedAt: new Date().toISOString() });
      }
    }
    return merged;
  }
}

async function checkIsFileNewer(fileName, dbKey) {
  try {
    const filePath = path.resolve(__dirname, 'plugins', fileName);
    if (!fs.existsSync(filePath)) return false;
    const fileMtime = fs.statSync(filePath).mtime.getTime();

    const row = await dbQuery.get("SELECT updated_at FROM app_session WHERE key = ?", [dbKey]);
    if (!row || !row.updated_at) return true;
    const dbUpdatedAt = new Date(row.updated_at).getTime();

    return fileMtime > (dbUpdatedAt + 1000);
  } catch (err) {
    console.error(`Failed to check file mtime for ${fileName}:`, err.message);
    return false;
  }
}

async function initializeAllStandards() {
  const syncStandard = async (fileName, dbKey, fileList, updateFn) => {
    try {
      let dbList = [];
      const row = await dbQuery.get("SELECT value FROM app_session WHERE key = ?", [dbKey]);
      if (row && row.value) {
        dbList = JSON.parse(row.value);
      }

      const fileIsNewer = await checkIsFileNewer(fileName, dbKey);
      const merged = mergeStandards(fileList, dbList, fileIsNewer);

      if (JSON.stringify(merged) !== JSON.stringify(dbList)) {
        await saveSessionValue(dbKey, JSON.stringify(merged));
        console.log(`[Startup Sync] Automatically synced ${dbKey} to database.`);
      }
      updateFn(merged);
    } catch (err) {
      console.warn(`[Startup Sync] Failed to load/sync ${dbKey}:`, err.message);
    }
  };

  await syncStandard('engineeringStandards.js', 'engineering_standards', standardsList, updateLiveEngineeringStandards);
  await syncStandard('gradingStandardsList.js', 'grading_standards', gradingStandardsList, updateLiveGradingStandards);
  await syncStandard('generationStandards.js', 'generation_standards', generationStandardsList, updateLiveGenerationStandards);
  await syncStandard('lockscreenStandards.js', 'lockscreen_standards', lockscreenStandardsList, updateLiveLockscreenStandards);
}

// Database and Server Startup
async function startServer() {
  try {
    console.log('[Startup] Initializing SQLite/PostgreSQL Database connection...');
    await initDatabase();
    console.log('[Startup] Syncing saved standards from database...');
    await initializeAllStandards();
    console.log('[Startup] Loading saved preferred model configuration...');
    await loadPreferredModel();
    
    // Start automated DB backup cron job
    startBackupScheduler();

    app.listen(PORT, () => {
      console.log(`================================================`);
      console.log(`  Antigravity Server is running on port ${PORT}`);
      console.log(`  Mode: ${process.env.NODE_ENV || 'development'}`);
      console.log(`================================================`);
    });
  } catch (error) {
    console.error('[CRITICAL STARTUP ERROR] Server failed to start:', error);
    process.exit(1);
  }
}

startServer();
export default app;
