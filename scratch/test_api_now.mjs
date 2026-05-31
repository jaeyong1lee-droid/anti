import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../server/.env');
console.log('Loading env file from:', envPath);
const envContent = fs.readFileSync(envPath, 'utf8');

const keys = {
  PRIMARY: '',
  SECONDARY: '',
  TERTIARY: ''
};

envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const parts = trimmed.split('=');
  if (parts.length >= 2) {
    const name = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    
    if (name === 'GEMINI_API_KEY') keys.PRIMARY = val;
    if (name === 'GEMINI_API_KEY_SECONDARY') keys.SECONDARY = val;
    if (name === 'GEMINI_API_KEY_TERTIARY') keys.TERTIARY = val;
  }
});

async function testLocalKeysDirectly() {
  console.log('=== TESTING LOCAL ENV KEYS DIRECTLY ===');
  
  console.log('Loaded Local Keys (Lengths):');
  console.log(`- PRIMARY: ${keys.PRIMARY ? keys.PRIMARY.length : 'MISSING'}`);
  console.log(`- SECONDARY: ${keys.SECONDARY ? keys.SECONDARY.length : 'MISSING'}`);
  console.log(`- TERTIARY: ${keys.TERTIARY ? keys.TERTIARY.length : 'MISSING'}`);

  for (const [name, key] of Object.entries(keys)) {
    if (!key) continue;
    console.log(`\nTesting Key [${name}] ...`);
    
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = '사질토 지반의 액상화 현상에 대해 기술사 수준으로 짧게 1줄로 정의해줘.';
      
      console.log('Sending request to Gemini API...');
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      
      console.log(`SUCCESS! Response from Key [${name}]:`);
      console.log(text);
    } catch (err) {
      console.error(`FAILURE! Key [${name}] failed with error:`);
      console.error(err.message || err);
    }
  }
}

testLocalKeysDirectly();
