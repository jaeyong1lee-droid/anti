import sqlite3 from 'sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const newConnectionString = 'postgresql://neondb_owner:npg_VZ6NRSlM4HQA@ep-gentle-band-ay23lbvk-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';
const sqliteDbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');

const sqliteDb = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY);
const pgPool = new pg.Pool({ connectionString: newConnectionString, ssl: { rejectUnauthorized: false } });

async function debugMap() {
  const sqTopics = await new Promise(r => sqliteDb.all("SELECT id, title FROM topics", [], (_, rows) => r(rows)));
  const pgTopics = await new Promise(r => pgPool.query("SELECT id, title FROM topics", (_, res) => r(res.rows)));

  console.log('SQLite Topics count:', sqTopics.length);
  console.log('PG Topics count:', pgTopics.length);

  const titleToPgId = new Map(pgTopics.map(t => [t.title.trim(), t.id]));
  const topicIdMap = new Map();

  for (const t of sqTopics) {
    const pgId = titleToPgId.get(t.title.trim());
    if (pgId) {
      topicIdMap.set(Number(t.id), pgId);
    } else {
      console.log(`Unmatched topic title: "${t.title}"`);
    }
  }

  console.log('Mapped topics:', topicIdMap.size);

  const sqSchedules = await new Promise(r => sqliteDb.all("SELECT id, topic_id FROM schedules LIMIT 10", [], (_, rows) => r(rows)));
  console.log('First 5 SQLite schedules:', sqSchedules.slice(0, 5));
  console.log('Mapped targetTopicIds for first 5:', sqSchedules.slice(0, 5).map(s => ({
    sqTopicId: s.topic_id,
    mappedPgId: topicIdMap.get(Number(s.topic_id))
  })));

  sqliteDb.close();
  await pgPool.end();
}

debugMap();
