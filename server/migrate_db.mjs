import pg from 'pg';

const oldUrl = 'postgresql://neondb_owner:npg_VZ6NRSlM4HQA@ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';
const newUrl = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';

const oldPool = new pg.Pool({ connectionString: oldUrl });
const newPool = new pg.Pool({ connectionString: newUrl });

async function run() {
  console.log('Starting migration...');
  
  // 1. Create tables on new DB
  await newPool.query(`
    CREATE TABLE IF NOT EXISTS topics (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      keywords TEXT,
      pdf_name TEXT,
      pdf_data BYTEA,
      pdf_url TEXT,
      extracted_text TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      category TEXT DEFAULT '일반'
    )
  `);

  await newPool.query(`
    CREATE TABLE IF NOT EXISTS answersheet_reports (
      id SERIAL PRIMARY KEY,
      pdf_name TEXT,
      pdf_data BYTEA,
      pdf_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await newPool.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      review_round INTEGER NOT NULL,
      planned_date TEXT NOT NULL,
      completed_at TIMESTAMP,
      status TEXT DEFAULT 'pending',
      score REAL,
      correct_count INTEGER,
      total_count INTEGER
    )
  `);

  await newPool.query(`
    CREATE TABLE IF NOT EXISTS app_session (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await newPool.query(`
    CREATE TABLE IF NOT EXISTS question_feedback (
      id SERIAL PRIMARY KEY,
      topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      feedback_type TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await newPool.query(`
    CREATE TABLE IF NOT EXISTS question_adjustments (
      id SERIAL PRIMARY KEY,
      topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      adjusted_text TEXT NOT NULL,
      user_feedback TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Tables created on new DB.');

  // Wipe all existing data in new DB
  await newPool.query(`TRUNCATE TABLE schedules, question_feedback, question_adjustments, answersheet_reports, app_session, topics RESTART IDENTITY CASCADE;`);
  console.log('Cleared new database tables.');

  // 2. Migrate data
  // Table order: topics, answersheet_reports, schedules, app_session, question_feedback, question_adjustments

  async function migrateTable(tableName) {
    console.log(`Migrating table ${tableName}...`);
    const { rows } = await oldPool.query(`SELECT * FROM ${tableName}`);
    if (rows.length === 0) {
      console.log(`Table ${tableName} is empty.`);
      return;
    }
    const keys = Object.keys(rows[0]);
    
    // Insert rows
    for (const row of rows) {
      const values = keys.map(k => row[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      await newPool.query(`INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`, values);
    }

    // Update sequence
    if (keys.includes('id')) {
      await newPool.query(`SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), coalesce(max(id), 0) + 1, false) FROM ${tableName};`);
    }

    console.log(`Migrated ${rows.length} rows to ${tableName}.`);
  }

  await migrateTable('topics');
  await migrateTable('answersheet_reports');
  await migrateTable('schedules');
  await migrateTable('app_session');
  await migrateTable('question_feedback');
  await migrateTable('question_adjustments');

  console.log('Migration completed successfully!');
  oldPool.end();
  newPool.end();
}

run().catch(console.error);
