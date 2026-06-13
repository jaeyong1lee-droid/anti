import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

const connectionString = process.env.DATABASE_URL;
console.log('Connecting to:', connectionString);

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log('Searching for the question in app_session table...');
    const res = await pool.query("SELECT key, value FROM app_session WHERE value LIKE '%간극수 내 전해질 농도%'");
    
    if (res.rows.length === 0) {
      console.log('No matching session rows found.');
      return;
    }

    console.log(`Found ${res.rows.length} session(s) containing the question.`);

    for (const row of res.rows) {
      console.log(`Processing session key: ${row.key}`);
      let data;
      try {
        data = JSON.parse(row.value);
      } catch (err) {
        console.error('Failed to parse JSON for session key:', row.key);
        continue;
      }

      let modified = false;

      // The session structure could contain an array of questions or questions inside an object
      const checkAndFixQuestion = (q) => {
        if (q && q.question && q.question.includes('간극수 내 전해질 농도') && q.question.includes('양이온의 원자가')) {
          console.log('Found question in session:', q.question);
          console.log('Current correct answer choice / index:', q.answer, q.correct_index);
          console.log('Current options:', q.options);
          
          // Let's find "0.25배" in options.
          if (q.options) {
            const targetIdx = q.options.findIndex(opt => opt.includes('0.25배'));
            if (targetIdx !== -1) {
              console.log(`Correcting correct index from ${q.correct_index} to ${targetIdx} ("0.25배")`);
              q.correct_index = targetIdx;
              q.answer = q.options[targetIdx];
              modified = true;
            } else {
              console.log('Could not find option "0.25배" in options:', q.options);
            }
          }
        }
      };

      if (Array.isArray(data)) {
        data.forEach(q => checkAndFixQuestion(q));
      } else if (data.questions && Array.isArray(data.questions)) {
        data.questions.forEach(q => checkAndFixQuestion(q));
      } else if (typeof data === 'object') {
        // Search all keys
        for (const k in data) {
          if (Array.isArray(data[k])) {
            data[k].forEach(q => checkAndFixQuestion(q));
          } else if (data[k] && typeof data[k] === 'object') {
            checkAndFixQuestion(data[k]);
          }
        }
      }

      if (modified) {
        const newValue = JSON.stringify(data);
        await pool.query("UPDATE app_session SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2", [newValue, row.key]);
        console.log(`Successfully updated database session for key: ${row.key}`);
      } else {
        console.log(`No modifications needed or could be made for session: ${row.key}`);
      }
    }

  } catch (err) {
    console.error('Database error:', err);
  } finally {
    await pool.end();
  }
}

main();
