import { dbQuery } from '../server/database.js';

async function testConnection() {
  console.log('Testing Cloud PostgreSQL (Neon) connection...');
  try {
    const startTime = Date.now();
    // Simple test query to check database responsiveness
    const res = await dbQuery.get('SELECT NOW() as current_time');
    const elapsed = Date.now() - startTime;
    console.log('Database connection successful!');
    console.log('Response:', res);
    console.log(`Connection time: ${elapsed}ms`);
  } catch (err) {
    console.error('Database connection FAILED!');
    console.error('Error details:', err);
  }
}

testConnection();
