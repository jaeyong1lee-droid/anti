import { setTimeout } from 'timers/promises';

console.log('Polling Vercel Deployment for /api/test-llm diagnostic results...');

for (let attempt = 1; attempt <= 20; attempt++) {
  try {
    const response = await fetch('https://anti-ashy.vercel.app/api/test-llm');
    if (response.status === 200) {
      const json = await response.json();
      console.log(`Success! /api/test-llm diagnosed on attempt #${attempt}`);
      console.log('=== LLM Keys Diagnostic Logs ===');
      console.log(JSON.stringify(json, null, 2));
      break;
    } else {
      console.log(`Attempt #${attempt}: Status ${response.status}`);
    }
  } catch (err) {
    console.warn(`Attempt #${attempt} failed: ${err.message}`);
  }
  await setTimeout(4000);
}
