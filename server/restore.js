import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import readline from 'readline';

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

async function runRestore() {
  if (!connectionString) {
    console.error('[Restore] DATABASE_URL is not set. Cannot restore to Neon PostgreSQL.');
    process.exit(1);
  }

  const backupDir = path.resolve(__dirname, 'backups');
  
  // Default to latest backup
  const targetBackupFile = process.argv[2] || 'latest_neon_backup.json';
  const filePath = path.join(backupDir, targetBackupFile);

  if (!fs.existsSync(filePath)) {
    console.error(`[Restore] Error: Backup file not found at ${filePath}`);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`\n=============================================================`);
  console.log(`[WARNING] DATABASE RESTORE INITIATED`);
  console.log(`=============================================================`);
  console.log(`Target Backup File: ${filePath}`);
  console.log(`\nThis operation will WIPE all existing data in the following tables:`);
  console.log(`topics, answersheet_reports, schedules, app_session, question_feedback, question_adjustments\n`);
  
  rl.question('Are you absolutely sure you want to proceed? Type "yes" to restore: ', async (answer) => {
    rl.close();
    if (answer.toLowerCase() !== 'yes') {
      console.log('[Restore] Operation cancelled by user.');
      process.exit(0);
    }

    let backupData;
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      backupData = JSON.parse(fileContent);
      console.log(`[Restore] Successfully loaded backup data from ${backupData.timestamp}`);
    } catch (e) {
      console.error(`[Restore] Error reading or parsing JSON backup file: ${e.message}`);
      process.exit(1);
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

    const client = await pool.connect();
    
    try {
      console.log('[Restore] Connected to PostgreSQL. Starting transaction...');
      await client.query('BEGIN');

      // The order of tables to TRUNCATE (bottom-up to respect foreign keys safely)
      const tablesToWipe = [
        'question_adjustments',
        'question_feedback',
        'schedules',
        'answersheet_reports',
        'app_session',
        'topics'
      ];

      // TRUNCATE CASCADE to ensure completely clean slate
      for (const table of tablesToWipe) {
        // We use IF EXISTS conceptually, but Postgres TRUNCATE doesn't have IF EXISTS.
        // We will catch errors if table doesn't exist.
        try {
          await client.query(`TRUNCATE TABLE ${table} CASCADE`);
          console.log(`[Restore] Truncated table: ${table}`);
        } catch (e) {
          console.warn(`[Restore] Skipping TRUNCATE for ${table} (might not exist).`);
        }
      }

      // The order of tables to INSERT (top-down, parents first)
      const tablesToInsert = [
        'topics',
        'app_session',
        'answersheet_reports',
        'schedules',
        'question_feedback',
        'question_adjustments'
      ];

      for (const table of tablesToInsert) {
        const rows = backupData.tables[table];
        if (!rows || rows.length === 0) {
          console.log(`[Restore] No data to insert for table: ${table}`);
          continue;
        }

        console.log(`[Restore] Inserting ${rows.length} rows into ${table}...`);
        
        for (const row of rows) {
          // Reconstruct Buffers from base64
          const processedRow = { ...row };
          for (const key in processedRow) {
            if (processedRow[key] && typeof processedRow[key] === 'object' && processedRow[key]._type === 'Buffer') {
              processedRow[key] = Buffer.from(processedRow[key].data, 'base64');
            }
          }

          const columns = Object.keys(processedRow);
          const values = Object.values(processedRow);
          
          const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
          const columnNames = columns.map(c => `"${c}"`).join(', ');
          
          const query = `INSERT INTO ${table} (${columnNames}) VALUES (${placeholders})`;
          
          await client.query(query, values);
        }
        console.log(`[Restore] Successfully restored ${table}`);
      }

      console.log('[Restore] All tables restored successfully. Committing transaction...');
      await client.query('COMMIT');
      console.log('[Restore] RESTORE COMPLETE! 🎉');

    } catch (err) {
      console.error('[Restore] ERROR during restore. Rolling back transaction...', err);
      await client.query('ROLLBACK');
      console.log('[Restore] Rollback complete. No data was changed.');
    } finally {
      client.release();
      await pool.end();
    }
  });
}

runRestore();
