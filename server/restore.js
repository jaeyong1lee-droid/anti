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

async function runRestore() {
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Restore aborted.');
    return;
  }

  // Get backup path from command line arguments or default to latest
  const backupDir = path.resolve(__dirname, 'backups');
  let backupFile = process.argv[2] || 'latest_neon_backup.json';
  let backupPath = path.isAbsolute(backupFile) ? backupFile : path.join(backupDir, backupFile);

  if (!fs.existsSync(backupPath)) {
    console.error(`Backup file not found at: ${backupPath}`);
    return;
  }

  console.log(`Reading backup file: ${backupPath}...`);
  const backupContent = fs.readFileSync(backupPath, 'utf8');
  const backupData = JSON.parse(backupContent);

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

  try {
    console.log('Connecting to Neon PostgreSQL for restore...');
    
    // Safety Backup: Run a backup of the current database before doing restore!
    try {
      console.log('Safety first: Running automatic database backup before restore...');
      const { runBackup } = await import('./backupManager.js');
      await runBackup();
      console.log('Automatic database backup completed successfully.');
    } catch (backupErr) {
      console.warn('Warning: Pre-restore safety backup failed. Proceeding with caution...', backupErr);
    }

    // We restore in an order that respects foreign keys
    const orderOfRestore = [
      'topics',
      'answersheet_reports',
      'schedules',
      'app_session',
      'question_feedback',
      'question_adjustments'
    ];

    for (const table of orderOfRestore) {
      const rows = backupData.tables[table];
      if (!rows) {
        console.log(`No data in backup for table: ${table}. Skipping.`);
        continue;
      }

      console.log(`Restoring table: ${table} (${rows.length} rows)...`);
      
      // Truncate existing table data and restart identity cascade
      await pool.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);

      for (const row of rows) {
        const columns = [];
        const values = [];
        const placeholders = [];

        Object.keys(row).forEach((col, idx) => {
          columns.push(col);
          placeholders.push(`$${idx + 1}`);
          
          let val = row[col];
          // Check if it's a serialized Buffer
          if (val && typeof val === 'object' && val._type === 'Buffer') {
            val = Buffer.from(val.data, 'base64');
          }
          values.push(val);
        });

        if (columns.length > 0) {
          const insertSql = `
            INSERT INTO ${table} (${columns.join(', ')}) 
            VALUES (${placeholders.join(', ')})
          `;
          await pool.query(insertSql, values);
        }
      }
      console.log(`Successfully restored ${rows.length} rows to ${table}`);
    }

    // Reset PostgreSQL sequences to match restored primary key values
    console.log('Resetting PostgreSQL sequences to align with imported data...');
    const serialTables = ['topics', 'answersheet_reports', 'schedules', 'question_feedback', 'question_adjustments'];
    for (const table of serialTables) {
      try {
        await pool.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX(id), 1)) FROM ${table}`, [table]);
        console.log(`- Sequence reset completed for "${table}"`);
      } catch (seqErr) {
        console.warn(`Warning: Could not reset sequence for "${table}":`, seqErr.message);
      }
    }

    console.log('Database restore completed successfully!');

  } catch (err) {
    console.error('Error during database restore:', err);
  } finally {
    await pool.end();
  }
}

runRestore();
