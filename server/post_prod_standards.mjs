import { gradingStandardsList } from './plugins/gradingPlugin.js';

async function main() {
  const url = 'https://anti-ashy.vercel.app/api/grading-standards';
  console.log(`Pushing to production URL: ${url}`);
  console.log(`Sending ${gradingStandardsList.length} items...`);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ standards: gradingStandardsList })
    });
    
    if (res.ok) {
      console.log('Successfully pushed to production!');
      const data = await res.json();
      console.log('Response:', data);
    } else {
      console.error('Failed to push. Status:', res.status);
      const text = await res.text();
      console.error('Body:', text);
    }
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}
main();
