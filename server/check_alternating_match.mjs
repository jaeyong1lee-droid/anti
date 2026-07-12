import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

async function check() {
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query("SELECT key, value, updated_at FROM app_session WHERE key LIKE 'review_questions_%'");
    console.log(`Analyzing ${res.rows.length} sessions...`);
    for (const row of res.rows) {
      console.log(`\nKey: ${row.key}`);
      try {
        const parsed = JSON.parse(row.value);
        const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
        const types = questions.map(q => q.type);
        console.log(`  Total: ${types.length} questions`);
        console.log(`  Types: ${types.join(', ')}`);
        
        // Check if it alternates: MC, Table, MC, Short, MC, Table, MC, Short, MC
        // (For indices 2 to 10: alternating MC and subjective)
        let isAlternating = true;
        if (types.length >= 13) {
          const expected = [
            '주관식 (개요)',
            '주관식 (공식)',
            '객관식 (4지선다)', // 3
            '주관식 (표채우기)', // 4
            '객관식 (4지선다)', // 5
            '주관식 (단답형)', // 6
            '객관식 (4지선다)', // 7
            '주관식 (표채우기)', // 8
            '객관식 (4지선다)', // 9
            '주관식 (단답형)', // 10
            '객관식 (4지선다)', // 11
            '주관식 (단답형)', // 12
            '주관식 (단답형)'  // 13
          ];
          for (let i = 0; i < 13; i++) {
            // allow '객관식' to match '객관식 (4지선다)'
            const actualType = types[i] || '';
            const expectedType = expected[i];
            if (expectedType === '객관식 (4지선다)') {
              if (!actualType.includes('객관식')) isAlternating = false;
            } else {
              if (actualType !== expectedType) isAlternating = false;
            }
          }
          console.log(`  Alternating match: ${isAlternating ? 'YES' : 'NO'}`);
        } else {
          console.log(`  Alternating match: N/A (length < 13)`);
        }
      } catch (e) {
        console.log(`  Error parsing: ${e.message}`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check().catch(console.error);
