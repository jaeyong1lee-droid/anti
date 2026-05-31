import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../server/.env');
console.log('Loading env file from:', envPath);
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (e) {
  console.log('No .env file found, will check process.env');
}

const keys = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_API_KEY_SECONDARY: process.env.GEMINI_API_KEY_SECONDARY || '',
  GEMINI_API_KEY_TERTIARY: process.env.GEMINI_API_KEY_TERTIARY || '',
  XAI_API_KEY: process.env.XAI_API_KEY || '',
  GROK_API_KEY: process.env.GROK_API_KEY || ''
};

envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const parts = trimmed.split('=');
  if (parts.length >= 2) {
    const name = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    if (keys[name] !== undefined) {
      keys[name] = val;
    }
  }
});

async function testGrokDirectly() {
  console.log('=== TESTING GROK API DIRECTLY ===');
  console.log('Loaded Keys:');
  for (const [name, key] of Object.entries(keys)) {
    console.log(`- ${name}: ${key ? `${key.substring(0, 8)}...${key.substring(key.length - 4)} (len: ${key.length})` : 'MISSING'}`);
  }

  // Gather all keys that start with 'xai-'
  const grokKeys = Object.entries(keys)
    .filter(([_, key]) => key && key.startsWith('xai-'))
    .map(([name, key]) => ({ name, key }));

  if (grokKeys.length === 0) {
    console.log('\n❌ No keys starting with "xai-" found in .env or environment variables!');
    return;
  }

  for (const { name, key } of grokKeys) {
    console.log(`\nTesting Grok Key from [${name}] ...`);
    const GROK_MODELS = ['grok-2-1212', 'grok-2', 'grok-beta'];
    
    for (const modelName of GROK_MODELS) {
      console.log(`Trying model: ${modelName} ...`);
      try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: 'user', content: '사질토 지반의 액상화 현상에 대해 기술사 수준으로 짧게 1줄로 정의해줘.' }
            ],
            temperature: 0.2
          })
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          throw new Error(`HTTP Error ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        console.log(`✅ SUCCESS with model [${modelName}]! Response:`);
        console.log(text);
        break; // Success, go to next key
      } catch (err) {
        console.error(`❌ FAILED with model [${modelName}]:`, err.message);
      }
    }
  }
}

testGrokDirectly();
