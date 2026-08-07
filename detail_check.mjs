import { dbQuery } from './server/database.js';

async function detailCheck() {
  try {
    const t50 = await dbQuery.get('SELECT * FROM topics WHERE id = 50');
    console.log('--- TOPIC 50 FULL DATA ---');
    console.log('id:', t50.id);
    console.log('title:', t50.title);
    console.log('category:', t50.category);
    console.log('pdf_name:', t50.pdf_name);
    console.log('keywords:', t50.keywords);
    console.log('extracted_text length:', t50.extracted_text ? t50.extracted_text.length : 0);
    console.log('extracted_text sample:', t50.extracted_text ? t50.extracted_text.substring(0, 400) : 'null');

    // Also check calculation vs non-calculation topics in DB
    const allTopics = await dbQuery.all('SELECT id, title, category, pdf_name FROM topics ORDER BY id ASC');
    console.log('\n--- ALL TOPICS LIST (${allTopics.length}) ---');
    allTopics.forEach(t => {
      console.log(`id:${t.id} | category:${t.category} | title:${t.title} | pdf_name:${t.pdf_name}`);
    });

  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

detailCheck();
