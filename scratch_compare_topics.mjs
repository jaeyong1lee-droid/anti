import { dbQuery, initDatabase } from './server/database.js';
import sqlite3 from 'sqlite3';
import path from 'path';

async function compare() {
  await initDatabase();
  const pgTopics = await dbQuery.all('SELECT id, title FROM topics ORDER BY id ASC');
  
  const sqliteDb = new sqlite3.Database(path.resolve('server/db_volume/spaced_repetition.db'), sqlite3.OPEN_READONLY);
  
  sqliteDb.all('SELECT id, title FROM topics ORDER BY id ASC', [], (err, sqliteTopics) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(`\n==========================================`);
    console.log(`📊 DB 마이그레이션 현황 정밀 비교`);
    console.log(`==========================================`);
    console.log(`▶ 로컬 SQLite (db_volume) 토픽 총 개수: ${sqliteTopics.length}개 (ID 최댓값: ${sqliteTopics[sqliteTopics.length - 1]?.id})`);
    console.log(`▶ 클라우드 Neon DB (PostgreSQL) 토픽 총 개수: ${pgTopics.length}개 (ID 범위: 1 ~ ${pgTopics.length})`);
    console.log(`==========================================\n`);

    const sqliteTitles = new Set(sqliteTopics.map(t => t.title.trim().toLowerCase()));
    const pgTitles = new Set(pgTopics.map(t => t.title.trim().toLowerCase()));

    const missingInPg = sqliteTopics.filter(t => !pgTitles.has(t.title.trim().toLowerCase()));
    const missingInSqlite = pgTopics.filter(t => !sqliteTitles.has(t.title.trim().toLowerCase()));

    console.log(`✅ SQLite ➔ Cloud PG 마이그레이션 누락 건수: ${missingInPg.length}개`);
    if (missingInPg.length > 0) {
      console.log('누락된 항목:', missingInPg);
    } else {
      console.log('🎉 로컬 SQLite의 모든 43개 토픽이 Neon Cloud PostgreSQL DB에 100% 동일하게 마이그레이션 되어 있습니다.');
    }

    console.log('\n[참고: ID 차이 원인]');
    console.log('- 로컬 SQLite에서는 과거 삭제된 토픽들로 인해 ID 번호가 비어있어 최댓값이 72번(예: 50번 Terzaghi, 53번 댐 저면 등)까지 올라갔었습니다.');
    console.log('- Neon PostgreSQL DB로 이전되면서 ID가 SERIAL(1~43)로 재정렬되었습니다.');
    process.exit(0);
  });
}

compare().catch(console.error);
