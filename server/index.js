// Production Release: rollback to 479bd17
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initDatabase, dbQuery, isPostgres } from './database.js';
import { startBackupScheduler } from './backupManager.js';
import { loadPreferredModel } from './services/aiService.js';
import { syncStandardWithDb } from './services/standardsSyncService.js';

import { updateLiveEngineeringStandards, standardsList } from './plugins/engineeringStandards.js';
import { updateLiveGradingStandards } from './plugins/gradingPlugin.js';
import { gradingStandardsList } from './plugins/gradingStandardsList.js';
import { updateLiveGenerationStandards, generationStandardsList } from './plugins/generationStandards.js';
import { updateLiveLockscreenStandards, lockscreenStandardsList } from './plugins/lockscreenStandards.js';

// Route Imports
import configRoutes from './routes/configRoutes.js';
import standardsRoutes from './routes/standardsRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import topicRoutes from './routes/topicRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import gradingRoutes from './routes/gradingRoutes.js';
import lockscreenRoutes from './routes/lockscreenRoutes.js';
import kcscRoutes from './routes/kcscRoutes.js';
import wikipediaRoutes from './routes/wikipediaRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

// Sanitize BLOB_READ_WRITE_TOKEN to handle copy-paste pollution
if (process.env.BLOB_READ_WRITE_TOKEN) {
  let token = process.env.BLOB_READ_WRITE_TOKEN.trim();
  const tokenIdx = token.indexOf('vercel_blob_rw_');
  if (tokenIdx !== -1) {
    token = token.substring(tokenIdx);
  }
  process.env.BLOB_READ_WRITE_TOKEN = token.replace(/['"]+$/g, '').trim();
}

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

// Boot-time snapshots of default plugin lists (immutable reference for file->DB comparison)
const defaultEngineeringStandards = standardsList.map((item) => ({ ...item }));
const defaultGradingStandards = gradingStandardsList.map((item) => ({ ...item }));
const defaultGenerationStandards = generationStandardsList.map((item) => ({ ...item }));
const defaultLockscreenStandards = lockscreenStandardsList.map((item) => ({ ...item }));

async function initializeAllStandards() {
  const specs = [
    { fileName: 'engineeringStandards.js', dbKey: 'engineering_standards', defaultFileList: defaultEngineeringStandards, updateLive: updateLiveEngineeringStandards },
    { fileName: 'gradingStandardsList.js', dbKey: 'grading_standards', defaultFileList: defaultGradingStandards, updateLive: updateLiveGradingStandards },
    { fileName: 'generationStandards.js', dbKey: 'generation_standards', defaultFileList: defaultGenerationStandards, updateLive: updateLiveGenerationStandards },
    { fileName: 'lockscreenStandards.js', dbKey: 'lockscreen_standards', defaultFileList: defaultLockscreenStandards, updateLive: updateLiveLockscreenStandards }
  ];

  for (const spec of specs) {
    try {
      await syncStandardWithDb({ ...spec, logPrefix: '[Startup Sync]' });
    } catch (err) {
      console.warn(`[Startup Sync] Failed to load/sync ${spec.dbKey}:`, err.message);
    }
  }
}

// Database Initialization Safeguard (Runs BEFORE route handling)
let isDbInitialized = false;
let dbInitPromise = null;

async function ensureDbInitialized() {
  if (isDbInitialized) return;
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        console.log('[Startup] Initializing Database connection...');
        await initDatabase();
        isDbInitialized = true;
        // Non-blocking background sync of standards and preferred model
        initializeAllStandards().catch(e => console.warn('[Background Standards Sync Warning]:', e.message));
        loadPreferredModel().catch(e => console.warn('[Background Model Load Warning]:', e.message));
      } catch (err) {
        console.error('[Startup DB Init Error]:', err.message);
        dbInitPromise = null;
        throw err;
      }
    })();
  }
  return dbInitPromise;
}

// Guarantee DB is connected before processing ANY incoming request
app.use(async (req, res, next) => {
  try {
    await ensureDbInitialized();
  } catch (err) {
    console.warn('[Middleware DB Warning]:', err.message);
  }
  next();
});

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
    res.json({ success: true, message: 'DB tables initialized successfully!', isPostgres });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
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

// Database Warm-up Ping (Prevent Neon Serverless Cold Start Timeout)
app.get('/api/health-db', async (req, res) => {
  try {
    await dbQuery.get('SELECT 1 as ping');
    res.json({ success: true });
  } catch (err) {
    console.error('[Health DB Ping Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bind Modularized Express Routers
app.use('/api', configRoutes);
app.use('/api', standardsRoutes);
app.use('/api', mediaRoutes);
app.use('/api', chatRoutes);
app.use('/api', topicRoutes);
app.use('/api', quizRoutes);
app.use('/api', gradingRoutes);
app.use('/api/lockscreen', lockscreenRoutes);
app.use('/api/kcsc', kcscRoutes);
app.use('/api/wiki', wikipediaRoutes);

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

async function startServer() {
  await ensureDbInitialized();
  if (!process.env.VERCEL) {
    startBackupScheduler();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`================================================`);
      console.log(`  Antigravity Server is running on port ${PORT}`);
      console.log(`  Mode: ${process.env.NODE_ENV || 'development'}`);
      console.log(`================================================`);
    });
  }
}

startServer().catch(err => console.error('[Startup Error]:', err.message));
export default app;
