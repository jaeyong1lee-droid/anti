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

  } catch (err) {
    console.error('[Backup] Error during database backup:', err);
  } finally {
    await pool.end();
  }
}

export function startBackupScheduler() {
  if (!!process.env.VERCEL) {
    console.log('[Backup] Running on Serverless Vercel. Disabling automatic backup scheduler.');
    return;
  }

  console.log('[Backup] Starting 3-day automatic backup scheduler...');
  
  // Run initial backup asynchronously after 5 seconds to not block startup
  setTimeout(() => {
    console.log('[Backup] Running initial startup database backup...');
    runBackup();
  }, 5000);

  // Run every 3 days (3 * 24 * 60 * 60 * 1000 ms)
  const INTERVAL_3_DAYS = 3 * 24 * 60 * 60 * 1000;
  setInterval(() => {
    console.log('[Backup] 3-day timer triggered. Running scheduled backup...');
    runBackup();
  }, INTERVAL_3_DAYS);
}
