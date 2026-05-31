import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("No Gemini API key found in server/.env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(key);

// 1x1 transparent pixel base64 image
const sampleImage = {
  mimeType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
};

async function testWithPlainString() {
  console.log("\n--- Testing with plain string in array ---");
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent([
      "Explain this image.",
      {
        inlineData: {
          mimeType: sampleImage.mimeType,
          data: sampleImage.data
        }
      }
    ]);
    console.log("Success! Response:", result.response.text());
  } catch (e) {
    console.error("Failed with plain string:", e.message);
  }
}

async function testWithTextObject() {
  console.log("\n--- Testing with { text: ... } object in array ---");
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent([
      { text: "Explain this image." },
      {
        inlineData: {
          mimeType: sampleImage.mimeType,
          data: sampleImage.data
        }
      }
    ]);
    console.log("Success! Response:", result.response.text());
  } catch (e) {
    console.error("Failed with { text: ... } object:", e.message);
  }
}

async function run() {
  await testWithPlainString();
  await testWithTextObject();
}
run();
