import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
console.log('DB_URL:', process.env.DATABASE_URL || 'Using local sqlite');

const isPg = !!process.env.DATABASE_URL;
if (isPg) {
  const { Client } = pg;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query("SELECT id, title, category, pdf_name, LENGTH(pdf_data) as len FROM topics ORDER BY created_at DESC LIMIT 5");
    console.log('Recent PG topics:', res.rows);
    if (res.rows.length > 0) {
      const id = res.rows[0].id;
      const detail = await client.query("SELECT pdf_name, pdf_data FROM topics WHERE id = $1", [id]);
      console.log('PDF Name of most recent:', detail.rows[0].pdf_name);
      const dataStr = detail.rows[0].pdf_data ? detail.rows[0].pdf_data.toString('utf-8') : '';
      console.log('HTML starting substring:', dataStr.substring(0, 500));
      const imgRegex = /<img[^>]+src=["']data:(image\/[^;]+);base64,([^"']+)["']/i;
      const match = imgRegex.exec(dataStr);
      console.log('Found embedded image:', !!match);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
} else {
  console.log('No postgres configured.');
}
