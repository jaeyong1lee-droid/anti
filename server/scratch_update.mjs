import { dbQuery, initDatabase } from './database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

await initDatabase();

console.log("Updating prandtl topic category to '일반'...");

// Update PostgreSQL
try {
  const pgRes = await dbQuery.run(
    "UPDATE topics SET category = '일반' WHERE title = 'prandtl_s_bearing_capacity_theory_report'"
  );
  console.log("PostgreSQL update result:", pgRes);
} catch (e) {
  console.error("PostgreSQL update failed:", e.message);
}

// Update SQLite (local spaced_repetition.db)
try {
  const sqliteRes = await dbQuery.run(
    "UPDATE topics SET category = '일반' WHERE title = 'prandtl_s_bearing_capacity_theory_report'"
  );
  console.log("SQLite update result:", sqliteRes);
} catch (e) {
  console.error("SQLite update failed:", e.message);
}

// Clear any active stale review caches for this topic to refresh the review mode
try {
  await dbQuery.run("DELETE FROM app_session WHERE key LIKE '%review_questions_topic_1%'");
  await dbQuery.run("DELETE FROM app_session WHERE key LIKE '%review_questions_schedule_1%'");
  console.log("Stale caches cleared successfully.");
} catch (e) {
  console.warn("Cache clearing failed:", e.message);
}

process.exit(0);
