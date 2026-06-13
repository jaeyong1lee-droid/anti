const fs = require('fs');
const path = require('path');

// 1. Patch server/database.js
const dbFilePath = path.join(__dirname, '../server/database.js');
let dbCode = fs.readFileSync(dbFilePath, 'utf8');

// Find all indexes of 'CREATE TABLE IF NOT EXISTS topics ('
let index = -1;
const indices = [];
while ((index = dbCode.indexOf('CREATE TABLE IF NOT EXISTS topics (', index + 1)) !== -1) {
  indices.push(index);
}

if (indices.length !== 2) {
  console.error("Error: Expected 2 occurrences of 'CREATE TABLE IF NOT EXISTS topics (' but found " + indices.length);
  process.exit(1);
}

// 1a. PostgreSQL path (the first occurrence)
const pgQueryIndex = dbCode.lastIndexOf('await pgPool.query(', indices[0]);
if (pgQueryIndex === -1) {
  console.error("Error: Could not find pgPool.query start");
  process.exit(1);
}

const pgTableSql = `await pgPool.query(\`
          CREATE TABLE IF NOT EXISTS answersheet_reports (
            id SERIAL PRIMARY KEY,
            pdf_name TEXT,
            pdf_data BYTEA,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        \`);

        `;

dbCode = dbCode.substring(0, pgQueryIndex) + pgTableSql + dbCode.substring(pgQueryIndex);

// Find occurrences again to handle shifted indices
let nextIndices = [];
let nextIndex = -1;
while ((nextIndex = dbCode.indexOf('CREATE TABLE IF NOT EXISTS topics (', nextIndex + 1)) !== -1) {
  nextIndices.push(nextIndex);
}

if (nextIndices.length !== 2) {
  console.error("Error: Expected 2 occurrences of 'CREATE TABLE IF NOT EXISTS topics (' after first patch but found " + nextIndices.length);
  process.exit(1);
}

// 1b. SQLite path (the second occurrence)
const sqliteQueryIndex = dbCode.lastIndexOf('await dbQuery.run(', nextIndices[1]);
if (sqliteQueryIndex === -1) {
  console.error("Error: Could not find SQLite dbQuery.run start");
  process.exit(1);
}

const sqliteTableSql = `await dbQuery.run(\`
    CREATE TABLE IF NOT EXISTS answersheet_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pdf_name TEXT,
      pdf_data BLOB,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  \`);

  `;

dbCode = dbCode.substring(0, sqliteQueryIndex) + sqliteTableSql + dbCode.substring(sqliteQueryIndex);

fs.writeFileSync(dbFilePath, dbCode, 'utf8');
console.log("Successfully patched server/database.js");


// 2. Patch server/index.js to make ensureAnswersheetReportsTable dialect-aware
const indexFilePath = path.join(__dirname, '../server/index.js');
let indexCode = fs.readFileSync(indexFilePath, 'utf8');

const ensureTableTarget = `async function ensureAnswersheetReportsTable() {
  try {
    await dbQuery.run(\`
      CREATE TABLE IF NOT EXISTS answersheet_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pdf_name TEXT,
        pdf_data BLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    \`);
  } catch (e) {
    console.warn('ensureAnswersheetReportsTable warning:', e.message);
  }
}`;

const ensureTableTargetLF = ensureTableTarget.replace(/\\r\\n/g, '\\n').replace(/\r\n/g, '\n');

const ensureTableReplacement = `async function ensureAnswersheetReportsTable() {
  try {
    const isPostgres = !!(
      process.env.DATABASE_URL || 
      process.env.POSTGRES_URL || 
      process.env.POSTGRES_PRISMA_URL || 
      process.env.SUPABASE_DATABASE_URL
    );
    if (isPostgres) {
      await dbQuery.run(\`
        CREATE TABLE IF NOT EXISTS answersheet_reports (
          id SERIAL PRIMARY KEY,
          pdf_name TEXT,
          pdf_data BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      \`);
    } else {
      await dbQuery.run(\`
        CREATE TABLE IF NOT EXISTS answersheet_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pdf_name TEXT,
          pdf_data BLOB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      \`);
    }
  } catch (e) {
    console.warn('ensureAnswersheetReportsTable warning:', e.message);
  }
}`;

let tblIdx = indexCode.indexOf(ensureTableTarget);
let tblLen = ensureTableTarget.length;
if (tblIdx === -1) {
  tblIdx = indexCode.indexOf(ensureTableTargetLF);
  tblLen = ensureTableTargetLF.length;
}

if (tblIdx === -1) {
  console.error("Error: Could not find ensureTableTarget in index.js");
  process.exit(1);
}

indexCode = indexCode.substring(0, tblIdx) + ensureTableReplacement + indexCode.substring(tblIdx + tblLen);
fs.writeFileSync(indexFilePath, indexCode, 'utf8');
console.log("Successfully patched server/index.js to support Postgres dialects");
