import { dbQuery } from "./database.js";
async function run() {
  try {
    const rows = await dbQuery.all(
      "SELECT key, value FROM app_session WHERE key LIKE $1 OR key LIKE $2",
      ["%28%", "%topic_instructions_%"]
    );
    console.log("=== REMOTE POSTGRES APP_SESSION DATA ===");
    for (const r of rows) {
      console.log("\nKey: " + r.key);
      try {
        const parsed = JSON.parse(r.value);
        console.log(JSON.stringify(parsed, null, 2).substring(0, 2000));
      } catch (e) {
        console.log(r.value.substring(0, 1000));
      }
    }
  } catch (err) {
    console.error("Postgres Error:", err);
  }
}
run();
