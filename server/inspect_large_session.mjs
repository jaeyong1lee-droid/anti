import { dbQuery, initDatabase } from './database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function run() {
  await initDatabase();
  try {
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = 'completed_review_schedule_264'");
    if (row && row.value) {
      const data = JSON.parse(row.value);
      console.log("Keys inside session:", Object.keys(data));
      if (data.chatHistory) {
        console.log("Chat history length:", data.chatHistory.length);
        data.chatHistory.forEach((msg, idx) => {
          console.log(`Msg ${idx}: role=${msg.role}, textLength=${msg.text?.length || 0}, hasImage=${!!msg.image}`);
          if (msg.image && typeof msg.image === 'string') {
            console.log(`  Image string length: ${msg.image.length} (Starts with: ${msg.image.substring(0, 50)})`);
          }
        });
      }
      if (data.questions) {
        console.log("Questions count:", data.questions.length);
        data.questions.forEach((q, idx) => {
          console.log(`Question ${idx}: type=${q.type}, questionLength=${q.question?.length}, hasImage=${!!q.image}`);
          if (q.image && typeof q.image === 'string') {
            console.log(`  Question Image length: ${q.image.length} (Starts with: ${q.image.substring(0, 50)})`);
          }
        });
      }
    }
  } catch (e) {
    console.error(e);
  }
}
run();
