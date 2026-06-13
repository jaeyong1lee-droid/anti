const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../server/index.js');
let content = fs.readFileSync(filePath, 'utf8');

const targetCode = `// POST /api/session/answersheet → 답안지 상태 저장
app.post('/api/session/answersheet', async (req, res) => {
  try {
    await ensureSessionTable();
    const { answersheetQuestions } = req.body;
    const value = JSON.stringify({ answersheetQuestions });
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', ['answersheet_questions']);
    await dbQuery.run(
      'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ['answersheet_questions', value]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/answersheet error:', err);
    res.status(500).json({ error: err.message });
  }
});`;

const replacementCode = `// POST /api/session/answersheet → 답안지 상태 저장
app.post('/api/session/answersheet', async (req, res) => {
  try {
    await ensureSessionTable();
    const { answersheetQuestions } = req.body;
    const value = JSON.stringify({ answersheetQuestions });
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', ['answersheet_questions']);
    await dbQuery.run(
      'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ['answersheet_questions', value]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/answersheet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/options/:key → Get generic option by key (e.g. right_sidebar_width)
app.get('/api/options/:key', async (req, res) => {
  try {
    await ensureSessionTable();
    const key = \`option_\${req.params.key}\`;
    const row = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);
    res.json({ value: row ? row.value : null });
  } catch (err) {
    console.error(\`GET /api/options/\${req.params.key} error:\`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/options/:key → Set generic option by key
app.post('/api/options/:key', async (req, res) => {
  try {
    await ensureSessionTable();
    const key = \`option_\${req.params.key}\`;
    const { value } = req.body;
    await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
    await dbQuery.run(
      'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(\`POST /api/options/\${req.params.key} error:\`, err);
    res.status(500).json({ error: err.message });
  }
});`;

// Normalize newlines for match
const normalizeNewlines = (str) => str.replace(/\r\n/g, '\n');

let normContent = normalizeNewlines(content);
const normTarget = normalizeNewlines(targetCode);
const normReplacement = normalizeNewlines(replacementCode);

if (normContent.includes(normTarget)) {
  normContent = normContent.replace(normTarget, normReplacement);
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(filePath, normContent.replace(/\n/g, newline), 'utf8');
  console.log('Successfully patched server/index.js with generic options sync endpoints!');
} else {
  console.error('Target code block not found in server/index.js');
  process.exit(1);
}
