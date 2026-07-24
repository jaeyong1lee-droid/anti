import pg from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_vY4Q7VcKFRIo@ep-broad-credit-aw98bx45-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const asciiText = `다음 간극수압계수의 종류와 삼축압축시험 산정 및 활용 절차 흐름도를 보고 빈칸 (A), (B), (C), (D)에 들어갈 올바른 단계명과 세부 내용을 아래 표의 입력창에 기입하시오.

┌──────────────────────────────────────┐
│ 1. 시료 채취 및 포화도 검증            │
│ - B-value 0.95 이상 확보             │
└──────────────────────────────────────┘
                  ▼
┌──────────────────────────────────────┐
│ [ (A) ]                              │
│ - (B)                                │
└──────────────────────────────────────┘
                  ▼
┌──────────────────────────────────────┐
│ 3. 비배수 전단 수행                   │
│ - 축차응력 및 간극수압 측정           │
└──────────────────────────────────────┘
                  ▼
┌──────────────────────────────────────┐
│ [ (C) ]                              │
│ - (D)                                │
└──────────────────────────────────────┘
                  ▼
┌──────────────────────────────────────┐
│ 5. 설계 및 현장 응용                  │
│ - 안정성 평가 및 계측 관리            │
└──────────────────────────────────────┘`;

try {
  console.log('Restoring Question 7 and Mixed Review 11 ASCII flowcharts in database...');

  // 1. Find all keys containing topic_23
  const topic23Keys = await pool.query('SELECT key, value FROM app_session WHERE key LIKE \'%topic_23%\'');
  for (const row of topic23Keys.rows) {
    if (row.key.endsWith('_q') || row.key.includes('schedule')) {
      try {
        const questions = JSON.parse(row.value);
        if (Array.isArray(questions) && questions.length >= 7) {
          console.log(`Updating Question 7 (index 6) for key: ${row.key}`);
          questions[6].question = asciiText;
          await pool.query('UPDATE app_session SET value = $1, updated_at = NOW() WHERE key = $2', [JSON.stringify(questions), row.key]);
        }
      } catch (e) {
        console.warn(`Error processing key ${row.key}:`, e.message);
      }
    }
  }

  // 2. Find all mixed review session keys
  const mixedKeys = await pool.query('SELECT key, value FROM app_session WHERE key LIKE \'%mixed%\' AND key LIKE \'%_q\'');
  for (const row of mixedKeys.rows) {
    try {
      const questions = JSON.parse(row.value);
      if (Array.isArray(questions)) {
        let updated = false;
        questions.forEach((q, idx) => {
          if (q.question && (q.question.includes('viewBox') || q.question.includes('&lt;svg') || q.question.includes('<svg') || q.question.includes('간극수압계수'))) {
            console.log(`Updating question index ${idx} in mixed key: ${row.key}`);
            q.question = asciiText;
            updated = true;
          }
        });
        if (updated) {
          await pool.query('UPDATE app_session SET value = $1, updated_at = NOW() WHERE key = $2', [JSON.stringify(questions), row.key]);
        }
      }
    } catch (e) {
      console.warn(`Error processing mixed key ${row.key}:`, e.message);
    }
  }

  console.log('✅ SUCCESS! Successfully restored ASCII flowcharts in database sessions!');
} catch (err) {
  console.error('Error during database update:', err);
} finally {
  await pool.end();
}
