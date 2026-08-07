const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db_volume/spaced_repetition.db');

db.all("SELECT id, question_text, calc_items, flowchart_data FROM questions WHERE question_text LIKE '%침투수량%' OR question_text LIKE '%스케일 조정%'", [], (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    require('fs').writeFileSync('sqlite_dump.json', JSON.stringify(rows, null, 2));
    console.log('Dumped to sqlite_dump.json');
  }
});
