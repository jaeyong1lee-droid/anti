import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

async function run() {
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query("SELECT key, value FROM app_session WHERE key LIKE 'review_questions_%'");
    console.log(`Scanning ${res.rows.length} sessions...`);
    
    for (const row of res.rows) {
      let data;
      try {
        data = JSON.parse(row.value);
      } catch (e) {
        continue;
      }
      
      const isObjectSession = data && !Array.isArray(data) && Array.isArray(data.questions);
      const isArraySession = Array.isArray(data);
      const questions = isObjectSession ? data.questions : (isArraySession ? data : null);
      
      if (!questions || questions.length !== 13) continue;
      
      // Determine if already alternating
      const types = questions.map(q => q.type || '');
      const expected = [
        '주관식 (개요)',
        '주관식 (공식)',
        '객관식 (4지선다)',
        '주관식 (표채우기)',
        '객관식 (4지선다)',
        '주관식 (단답형)',
        '객관식 (4지선다)',
        '주관식 (표채우기)',
        '객관식 (4지선다)',
        '주관식 (단답형)',
        '객관식 (4지선다)',
        '주관식 (단답형)',
        '주관식 (단답형)'
      ];
      
      let isAlternating = true;
      for (let i = 0; i < 13; i++) {
        const actualType = types[i] || '';
        const expectedType = expected[i];
        if (expectedType === '객관식 (4지선다)') {
          if (!actualType.includes('객관식')) isAlternating = false;
        } else {
          if (actualType !== expectedType) isAlternating = false;
        }
      }
      
      if (isAlternating) continue;
      
      console.log(`\nFound non-alternating 13-question session: ${row.key}`);
      
      // Separate questions by type
      let qIntro = questions.find(q => (q.type || '').includes('개요'));
      let qFormula = questions.find(q => (q.type || '').includes('공식'));
      
      // If we don't have explicit intro/formula in these positions, fallback to indices 0 and 1
      if (!qIntro) qIntro = questions[0];
      if (!qFormula) qFormula = questions[1];
      
      const mcs = questions.filter(q => q !== qIntro && q !== qFormula && ((q.type || '').includes('객관식') || (q.options && q.options.length > 0)));
      const tables = questions.filter(q => q !== qIntro && q !== qFormula && ((q.type || '').includes('표채우기') || q.subtype === '표채우기'));
      const shorts = questions.filter(q => q !== qIntro && q !== qFormula && ((q.type || '').includes('단답형') || q.subtype === '단답형' || (!q.options && !(q.type || '').includes('표채우기') && !(q.type || '').includes('개요') && !(q.type || '').includes('공식'))));
      
      console.log(`  Extracted → Intro: ${qIntro ? 1 : 0}, Formula: ${qFormula ? 1 : 0}, MCs: ${mcs.length}, Tables: ${tables.length}, Shorts: ${shorts.length}`);
      
      if (!qIntro || !qFormula || mcs.length < 5 || tables.length < 2 || shorts.length < 4) {
        console.log(`  [SKIPPED] Insufficient question counts to build standard alternating order.`);
        continue;
      }
      
      // Check if user has answered questions at indices >= 2
      let hasAnswersInRest = false;
      if (isObjectSession) {
        const selectedAnswers = data.selectedAnswers || {};
        const revealedQuestions = data.revealedQuestions || {};
        const tableAnswers = data.tableAnswers || {};
        
        // Check if any keys for indices >= 2 exist in selectedAnswers or revealedQuestions
        for (const k of Object.keys(selectedAnswers)) {
          if (parseInt(k, 10) >= 2) hasAnswersInRest = true;
        }
        for (const k of Object.keys(revealedQuestions)) {
          if (parseInt(k, 10) >= 2) hasAnswersInRest = true;
        }
        // tableAnswers keys are usually like '0_INPUT', '1_INPUT', '2_INPUT_1', '7_INPUT_1'...
        for (const k of Object.keys(tableAnswers)) {
          const idx = parseInt(k.split('_')[0], 10);
          if (idx >= 2 && tableAnswers[k]) {
            hasAnswersInRest = true;
          }
        }
      }
      
      if (hasAnswersInRest) {
        console.log(`  [SKIPPED] User has already answered questions beyond Q1/Q2. Cannot safely re-order.`);
        continue;
      }
      
      // Re-order questions
      const reordered = [
        qIntro,          // Q1 (index 0)
        qFormula,        // Q2 (index 1)
        mcs[0],          // Q3 (index 2)
        tables[0],       // Q4 (index 3)
        mcs[1],          // Q5 (index 4)
        shorts[0],       // Q6 (index 5)
        mcs[2],          // Q7 (index 6)
        tables[1],       // Q8 (index 7)
        mcs[3],          // Q9 (index 8)
        shorts[1],       // Q10 (index 9)
        mcs[4],          // Q11 (index 10)
        shorts[2],       // Q12 (index 11)
        shorts[3]        // Q13 (index 12)
      ];
      
      // Ensure all elements are defined
      if (reordered.some(q => !q)) {
        console.log(`  [SKIPPED] Reordered array contains undefined elements.`);
        continue;
      }
      
      if (isObjectSession) {
        data.questions = reordered;
      } else {
        data = reordered;
      }
      
      const updatedValue = JSON.stringify(data);
      await pool.query("UPDATE app_session SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2", [updatedValue, row.key]);
      console.log(`  [SUCCESS] Session ${row.key} successfully reordered!`);
    }
  } catch (err) {
    console.error("Error during session reordering:", err);
  } finally {
    await pool.end();
  }
}

run().catch(console.error);
