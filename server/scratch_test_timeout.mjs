import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

async function test() {
  const envContent = fs.readFileSync('.env', 'utf8');
  let key = '';
  for (const line of envContent.split('\n')) {
    if (line.startsWith('GEMINI_API_KEY=')) {
      key = line.split('=')[1].trim();
      break;
    }
  }

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }, { apiVersion: 'v1beta' });

  try {
    console.log('--- Test 3: Promise.race with 1ms timeout ---');
    const start = Date.now();
    
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API request timeout')), 1)
    );
    
    await Promise.race([
      model.generateContent("Hello, say 'yes' if you can hear me."),
      timeoutPromise
    ]);
    
    console.log('Finished without timeout in', Date.now() - start, 'ms');
  } catch (err) {
    console.log('Test 3 error (expected timeout):', err.message, 'in', Date.now() - Date.now(), 'ms');
  }
}

test();
