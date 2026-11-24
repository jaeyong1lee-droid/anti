import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbQuery } from '../database.js';
import { saveSessionValue } from './aiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

/**
 * Compute a deterministic content hash over standard { id, title, content } fields.
 * Intentionally ignores `updatedAt` because plugin modules generate dynamic timestamps on load.
 */
export function computeStandardsHash(list) {
  const normalized = (Array.isArray(list) ? list : []).map((item) => ({
    id: item?.id ?? '',
    title: item?.title ?? '',
    content: item?.content ?? ''
  }));
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Parse DB `updated_at` timestamps safely.
 * SQLite CURRENT_TIMESTAMP produces timezone-less UTC strings ('YYYY-MM-DD HH:MM:SS').
 */
export function parseDbTimestampMs(raw) {
  if (!raw) return NaN;
  if (raw instanceof Date) return raw.getTime();
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    return Date.parse(`${str.replace(' ', 'T')}Z`);
  }
  return Date.parse(str);
}

export function stampUpdatedStandards(newList, oldList) {
  if (!Array.isArray(newList)) return [];
  const oldMap = new Map((oldList || []).map((item) => [item.id, item]));
  return newList.map((item) => {
    const oldItem = oldMap.get(item.id);
    if (!oldItem || oldItem.content !== item.content || oldItem.title !== item.title || !item.updatedAt) {
      return { ...item, updatedAt: new Date().toISOString() };
    }
    return item;
  });
}

export function mergeStandards(fileList, dbList, fileIsNewer = false) {
  if (!dbList || dbList.length === 0) {
    return fileList;
  }

  if (fileIsNewer) {
    const dbMap = new Map((dbList || []).map((item) => [item.id, item]));
    const merged = fileList.map((fileItem) => {
      const dbItem = dbMap.get(fileItem.id);
      if (!dbItem || dbItem.content !== fileItem.content || dbItem.title !== fileItem.title) {
        return { ...fileItem, updatedAt: new Date().toISOString() };
      }
      return dbItem;
    });

    // Preserve only user-created entries; deletions of default file entries stay deleted
    const fileIds = new Set(fileList.map((item) => item.id));
    for (const dbItem of dbList || []) {
      if (!fileIds.has(dbItem.id) && String(dbItem.id || '').startsWith('user_')) {
        merged.push(dbItem);
      }
    }
    return merged;
  }

  // DB is authoritative when deployed/file defaults have not changed
  return dbList;
}

export async function checkIsFileNewer(fileName, dbKey, fileList = null, deps = {}) {
  const {
    db = dbQuery,
    isVercel = !!process.env.VERCEL,
    fsModule = fs,
    serverDirOverride = serverDir
  } = deps;

  if (isVercel) {
    // Option B (Vercel): gate file->DB merge on canonical content hash rather than container mtime
    if (!Array.isArray(fileList)) return false;
    try {
      const currentHash = computeStandardsHash(fileList);
      const row = await db.get('SELECT value FROM app_session WHERE key = ?', [`${dbKey}_file_hash`]);
      if (!row || !row.value) {
        // First boot before hash baseline exists: keep existing DB edits and let sync record baseline hash
        return false;
      }
      return row.value !== currentHash;
    } catch (err) {
      console.error(`Failed to check content hash for ${fileName}:`, err.message);
      return false;
    }
  }

  try {
    const filePath = path.join(serverDirOverride, 'plugins', fileName);
    if (!fsModule.existsSync(filePath)) return false;
    const fileMtime = fsModule.statSync(filePath).mtime.getTime();

    const row = await db.get('SELECT updated_at FROM app_session WHERE key = ?', [dbKey]);
    if (!row || !row.updated_at) return true;
    const dbUpdatedAt = parseDbTimestampMs(row.updated_at);
    if (Number.isNaN(dbUpdatedAt)) return false;

    return fileMtime > (dbUpdatedAt + 1000);
  } catch (err) {
    console.error(`Failed to check file mtime for ${fileName}:`, err.message);
    return false;
  }
}

export async function syncStandardWithDb(
  { fileName, dbKey, defaultFileList, updateLive, logPrefix = '[Sync]' },
  deps = {}
) {
  const {
    db = dbQuery,
    saveSession = saveSessionValue,
    isVercel = !!process.env.VERCEL,
    fsModule = fs,
    serverDirOverride = serverDir
  } = deps;

  let dbList = [];
  try {
    const row = await db.get('SELECT value FROM app_session WHERE key = ?', [dbKey]);
    if (row && row.value) {
      dbList = JSON.parse(row.value);
    }
  } catch (dbErr) {
    console.error(`${logPrefix} Failed to read ${dbKey} from database:`, dbErr.message);
  }

  const fileIsNewer = await checkIsFileNewer(fileName, dbKey, defaultFileList, {
    db,
    isVercel,
    fsModule,
    serverDirOverride
  });
  const merged = mergeStandards(defaultFileList, dbList, fileIsNewer);

  if (JSON.stringify(merged) !== JSON.stringify(dbList)) {
    try {
      await saveSession(dbKey, JSON.stringify(merged));
      console.log(`${logPrefix} Automatically synced ${dbKey} to database.`);
    } catch (saveErr) {
      console.error(`${logPrefix} Failed to auto-save merged ${dbKey} to database:`, saveErr.message);
    }
  }

  if (Array.isArray(defaultFileList)) {
    try {
      const currentHash = computeStandardsHash(defaultFileList);
      await saveSession(`${dbKey}_file_hash`, currentHash);
    } catch (hashErr) {
      console.warn(`${logPrefix} Failed to persist hash baseline for ${dbKey}:`, hashErr.message);
    }
  }

  updateLive(merged);
  return merged;
}
