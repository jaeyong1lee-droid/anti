import app, { ensureDbInitialized } from '../server/index.js';

export default async function handler(req, res) {
  try {
    if (ensureDbInitialized) {
      await ensureDbInitialized();
    }
    return app(req, res);
  } catch (err) {
    console.error('Vercel API handler error:', err);
    res.status(500).json({ error: 'Server initialization error', message: err.message });
  }
}
