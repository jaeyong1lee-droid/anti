const fs = require('fs');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('server/local.db'); // Wait, let's check where local.db is or what database backend is configured

// Wait, let's load env to check DB type: PostgreSQL or SQLite
require('dotenv').config({ path: 'server/.env' });
console.log('DB_URL:', process.env.DATABASE_URL || 'Using local sqlite');

const isPg = !!process.env.DATABASE_URL;
if (isPg) {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  client.connect().then(async () => {
    try {
      const res = await client.query("SELECT id, title, category, pdf_name, LENGTH(pdf_data) as len FROM topics WHERE title LIKE '%Terzaghi%' OR title LIKE '%테르자기%' ORDER BY created_at DESC LIMIT 5");
      console.log('PG topics:', res.rows);
      if (res.rows.length > 0) {
        const id = res.rows[0].id;
        const detail = await client.query("SELECT pdf_name, pdf_data FROM topics WHERE id = $1", [id]);
        fs.writeFileSync('scratch/topic_pdf_name.txt', detail.rows[0].pdf_name || '');
        fs.writeFileSync('scratch/topic_pdf_data_len.txt', String(detail.rows[0].pdf_data ? detail.rows[0].pdf_data.length : 0));
        // Check if there are base64 images inside HTML
        const dataStr = detail.rows[0].pdf_data ? detail.rows[0].pdf_data.toString('utf-8') : '';
        console.log('HTML starting substring:', dataStr.substring(0, 1000));
        const imgRegex = /<img[^>]+src=["']data:(image\/[^;]+);base64,([^"']+)["']/i;
        const match = imgRegex.exec(dataStr);
        console.log('Found embedded image:', !!match);
      }
    } catch (e) {
      console.error(e);
    } finally {
      client.end();
    }
  });
} else {
  console.log('No postgres configured.');
}
