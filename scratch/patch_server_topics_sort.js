const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../server/index.js');
let code = fs.readFileSync(filePath, 'utf8');

const targetQuery = 'SELECT id, title, keywords, pdf_name, created_at';
const targetIndex = code.indexOf(targetQuery);

if (targetIndex === -1) {
  console.error("Error: Could not find target query in server/index.js");
  process.exit(1);
}

// Find the backtick before the target query
const backtickBefore = code.lastIndexOf('`', targetIndex);
// Find the backtick after the target query
const backtickAfter = code.indexOf('`', targetIndex);

if (backtickBefore === -1 || backtickAfter === -1) {
  console.error("Error: Could not find backticks in server/index.js");
  process.exit(1);
}

const replacementQuery = `
      SELECT t.id, t.title, t.keywords, t.pdf_name, t.created_at,
             COALESCE((SELECT MAX(completed_at) FROM schedules WHERE topic_id = t.id AND completed_at IS NOT NULL), t.created_at) AS last_active
      FROM topics t
      ORDER BY last_active DESC
    `;

const updatedCode = code.substring(0, backtickBefore + 1) + replacementQuery + code.substring(backtickAfter);
fs.writeFileSync(filePath, updatedCode, 'utf8');
console.log("Successfully patched server/index.js sorting");
