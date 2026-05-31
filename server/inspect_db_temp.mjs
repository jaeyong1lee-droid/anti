import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'db_volume', 'spaced_repetition.db');
const db = new sqlite3.Database(dbPath);

console.log('--- Inspecting spaced_repetition.db ---');

// 1. Get today's topics (5월 27일)
db.all(
  `SELECT id, title, pdf_name, length(pdf_data) as data_size, created_at FROM topics ORDER BY created_at DESC LIMIT 15`,
  [],
  (err, rows) => {
    if (err) {
      console.error('Error fetching topics:', err);
      return;
    }
    console.log('\n[최근 등록된 토픽 목록]');
    if (rows.length === 0) {
      console.log('등록된 토픽이 없습니다.');
    } else {
      rows.forEach(r => {
        console.log(`ID: ${r.id} | 제목: "${r.title}" | 파일명: ${r.pdf_name || 'N/A'} | 파일 크기: ${r.data_size ? (r.data_size / 1024).toFixed(1) + ' KB' : '0 KB'} | 생성시각: ${r.created_at}`);
      });
    }

    // 2. Get today's completed schedules
    db.all(
      `SELECT s.id, s.review_round, s.planned_date, s.completed_at, s.status, t.title 
       FROM schedules s 
       JOIN topics t ON s.topic_id = t.id 
       ORDER BY s.completed_at DESC LIMIT 15`,
      [],
      (err, sRows) => {
        if (err) {
          console.error('Error fetching schedules:', err);
          return;
        }
        console.log('\n[최근 복습 일정 기록]');
        if (sRows.length === 0) {
          console.log('복습 일정이 없습니다.');
        } else {
          sRows.forEach(sr => {
            console.log(`ID: ${sr.id} | 회차: ${sr.review_round} | 계획일: ${sr.planned_date} | 완료시각: ${sr.completed_at || '대기중'} | 상태: ${sr.status} | 토픽: "${sr.title}"`);
          });
        }
        db.close();
      }
    );
  }
);
