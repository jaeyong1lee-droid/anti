import sqlite3 from 'sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/.env 파일에서 DATABASE_URL 환경 변수 로드
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("오류: .env 파일에 DATABASE_URL이 설정되어 있지 않습니다.");
  process.exit(1);
}

const sqliteDbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');
console.log('로컬 SQLite 파일 경로:', sqliteDbPath);

const sqliteDb = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('SQLite 데이터베이스 연결 실패:', err.message);
    process.exit(1);
  }
});

const pgPool = new pg.Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log('클라우드 PostgreSQL 연결 시도 중...');
    const testRes = await pgPool.query('SELECT NOW()');
    console.log('클라우드 PostgreSQL 연결 성공! 서버 시간:', testRes.rows[0].now);

    // 테이블이 없다면 미리 생성해 둡니다.
    console.log('PostgreSQL 테이블 검증 및 생성 중...');
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS topics (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        keywords TEXT,
        pdf_name TEXT,
        pdf_data BYTEA,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        review_round INTEGER NOT NULL,
        planned_date TEXT NOT NULL,
        completed_at TIMESTAMP,
        status TEXT DEFAULT 'pending'
      )
    `);

    // 1. SQLite topics 읽기
    const topics = await new Promise((resolve, reject) => {
      sqliteDb.all("SELECT * FROM topics", [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    console.log(`SQLite에서 발견된 토픽: 총 ${topics.length}개`);

    // 2. SQLite schedules 읽기
    const schedules = await new Promise((resolve, reject) => {
      sqliteDb.all("SELECT * FROM schedules", [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    console.log(`SQLite에서 발견된 복습 스케줄: 총 ${schedules.length}개`);

    // 3. PostgreSQL 이식 작업
    let successCount = 0;
    let skipCount = 0;

    for (const t of topics) {
      // 동일한 제목의 토픽이 이미 PostgreSQL에 있는지 체크
      const dup = await pgPool.query("SELECT id FROM topics WHERE title = $1", [t.title]);
      let pgTopicId = null;

      if (dup.rows.length > 0) {
        pgTopicId = dup.rows[0].id;
        skipCount++;
        console.log(`[연동/중복] "${t.title}" 토픽이 이미 클라우드에 존재합니다. ID: ${pgTopicId}`);
      } else {
        // 클라우드로 이식
        const ins = await pgPool.query(
          "INSERT INTO topics (title, keywords, pdf_name, pdf_data, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
          [t.title, t.keywords || '', t.pdf_name || null, t.pdf_data || null, t.created_at]
        );
        pgTopicId = ins.rows[0].id;
        successCount++;
        console.log(`[이식 성공] "${t.title}" -> 클라우드 토픽 ID: ${pgTopicId}`);
      }

      // 토픽에 소속된 스케줄 처리
      const subSchedules = schedules.filter(s => s.topic_id === t.id);
      for (const s of subSchedules) {
        const sDup = await pgPool.query(
          "SELECT id FROM schedules WHERE topic_id = $1 AND review_round = $2",
          [pgTopicId, s.review_round]
        );

        if (sDup.rows.length > 0) {
          // 상태 및 완료 데이터 동기화
          await pgPool.query(
            "UPDATE schedules SET completed_at = $1, status = $2, planned_date = $3 WHERE id = $4",
            [s.completed_at || null, s.status || 'pending', s.planned_date, sDup.rows[0].id]
          );
        } else {
          // 새로 삽입
          await pgPool.query(
            "INSERT INTO schedules (topic_id, review_round, planned_date, completed_at, status) VALUES ($1, $2, $3, $4, $5)",
            [pgTopicId, s.review_round, s.planned_date, s.completed_at || null, s.status || 'pending']
          );
        }
      }
      console.log(`   └─ 해당 토픽의 스케줄 ${subSchedules.length}개 동기화 완료`);
    }

    console.log("\n==========================================");
    console.log(" 클라우드 데이터베이스 마이그레이션 완료!");
    console.log(` 신규 이식 토픽: ${successCount}개`);
    console.log(` 기 존재 토픽 연동: ${skipCount}개`);
    console.log("==========================================");

  } catch (err) {
    console.error('오류: 마이그레이션 작업 중 에러 발생:', err);
  } finally {
    sqliteDb.close();
    await pgPool.end();
    console.log('연결 종료 완료.');
  }
}

migrate();
