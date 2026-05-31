import { dbQuery } from '../server/database.js';

async function main() {
  try {
    const topic = await dbQuery.get('SELECT * FROM topics WHERE id = 16');
    console.log('Topic ID 16:', topic);
  } catch (err) {
    console.error('Error fetching topic 16:', err);
  }
}

main();
