const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../scratch/diagnose_prod_db_output.json');
try {
  const text = fs.readFileSync(file, 'utf16le');
  console.log(text);
} catch (e) {
  console.error(e.message);
}
