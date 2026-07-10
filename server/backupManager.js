import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL || 
                         process.env.POSTGRES_URL || 
                         process.env.POSTGRES_PRISMA_URL ||
                         process.env.SUPABASE_DATABASE_URL ||
                         '';

function parseDbUrl(rawUrl) {
  try {
    const normalized = rawUrl.replace(/^postgres:\/\//, 'postgresql://');
    const url = new URL(normalized);
    return {
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 5432,
      database: url.pathname.replace(/^\//, ''),
    };
  } catch (e) {
    return null;
  }
}

export async function runBackup() {
  if (!connectionString) {
    console.log('[Backup] DATABASE_URL is not set. SQLite/Local mode active. Skipping cloud Neon backup.');
    return;
  }

  const parsed = parseDbUrl(connectionString);
  let pool;
  if (parsed) {
    pool = new pg.Pool({
      user: parsed.user,
      password: parsed.password,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      ssl: { rejectUnauthorized: false },
    });
  } else {
    pool = new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }

  const tables = [
    'topics',
    'answersheet_reports',
    'schedules',
    'app_session',
    'question_feedback',
    'question_adjustments'
  ];

  const backupData = {
    timestamp: new Date().toISOString(),
    tables: {}
  };

  try {
    console.log('[Backup] Connecting to Neon PostgreSQL for backup...');
    for (const table of tables) {
      // Check if table exists
      const tableCheck = await pool.query(
        `SELECT EXISTS (
           SELECT FROM information_schema.tables 
           WHERE table_schema = 'public' AND table_name = $1
         )`,
        [table]
      );
      if (!tableCheck.rows[0].exists) {
        console.log(`[Backup] Table ${table} does not exist in the database. Skipping.`);
        continue;
      }

      console.log(`[Backup] Fetching data for table: ${table}...`);
      const res = await pool.query(`SELECT * FROM ${table}`);
      
      const processedRows = res.rows.map(row => {
        const newRow = { ...row };
        for (const key in newRow) {
          if (Buffer.isBuffer(newRow[key])) {
            newRow[key] = {
              _type: 'Buffer',
              data: newRow[key].toString('base64')
            };
          }
        }
        return newRow;
      });

      backupData.tables[table] = processedRows;
      console.log(`[Backup] Successfully backed up ${processedRows.length} rows from ${table}`);
    }

    const backupDir = path.resolve(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `neon_backup_${timestampStr}.json`;
    const filePath = path.join(backupDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`[Backup] Backup completed successfully! Saved to: ${filePath}`);
    
    const latestPath = path.join(backupDir, 'latest_neon_backup.json');
    fs.writeFileSync(latestPath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`[Backup] Updated latest backup reference file: ${latestPath}`);

    // Clean up older backups (keep only the last 7 days)
    try {
      const files = fs.readdirSync(backupDir);
      const now = Date.now();
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      let deleteCount = 0;
      
      for (const file of files) {
        if (file.startsWith('neon_backup_') && file.endsWith('.json')) {
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);
          const age = now - stats.mtimeMs;
          if (age > SEVEN_DAYS_MS) {
            fs.unlinkSync(filePath);
            deleteCount++;
          }
        }
      }
      if (deleteCount > 0) {
        console.log(`[Backup] Cleaned up ${deleteCount} old backup files older than 7 days.`);
      }
    } catch (cleanupErr) {
      console.error('[Backup] Error cleaning up old backup files:', cleanupErr.message);
    }

  } catch (err) {
    console.error('[Backup] Error during database backup:', err);
  } finally {
    await pool.end();
  }
}

export function startBackupScheduler() {
  console.log('[Backup] Automatic backup scheduler is disabled as per user instruction. Backups must be run manually.');
}
