import { dbQuery } from '../database.js';

export async function saveSessionValue(key, value) {
  try {
    // Optimization: skip write entirely if the stored value is already identical
    // This is the most common case during quiz autosave (user hasn't changed anything meaningful)
    const existing = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);
    if (existing && existing.value === value) return;

    // Use UPSERT for atomicity and efficiency
    await dbQuery.run(
      `INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
      [key, value]
    );
  } catch (err) {
    // Fallback: DELETE + INSERT for DB engines or edge cases where ON CONFLICT fails
    try {
      await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
      await dbQuery.run(
        'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [key, value]
      );
    } catch (e2) {
      if (e2.code === '23505' || String(e2).includes('UNIQUE')) {
        await dbQuery.run(
          'UPDATE app_session SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
          [value, key]
        );
      } else {
        throw e2;
      }
    }
  }
}
