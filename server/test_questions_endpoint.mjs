import { dbQuery, initDatabase } from './database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function run() {
  await initDatabase();
  try {
    const topics = await dbQuery.all('SELECT id, title FROM topics');
    console.log('Available topics:');
    console.table(topics);

    if (topics.length === 0) {
      console.log('No topics in database!');
      return;
    }

    const topicId = topics[0].id;
    console.log(`Testing AI question generation for topic ID ${topicId} ("${topics[0].title}")...`);

    // Call the endpoint function directly to see the exception stack trace
    // Let's mock req, res
    const req = {
      params: { id: topicId },
      query: { progressId: 'test_progress_id' },
      body: {}
    };

    // We need to mock res.json and res.status
    const res = {
      status(code) {
        console.log('res.status called with:', code);
        return this;
      },
      json(data) {
        console.log('res.json called with data keys:', Object.keys(data));
        if (data.error) {
          console.error('API returned error:', data.error);
        }
        if (data.questions) {
          console.log(`API returned ${data.questions.length} questions successfully!`);
        }
      }
    };

    // We can import the handler from index.js if exported, but index.js is not exporting handlers.
    // Instead, let's trigger it by making a real HTTP request to the running server, or if the server is not running, let's start it or run a test using fetch!
    console.log('Clearing review questions cache for topic...');
    await dbQuery.run("DELETE FROM app_session WHERE key LIKE 'review_questions_topic_%' OR key LIKE 'review_questions_schedule_%'");
    console.log('Sending fetch request to http://localhost:5000/api/topics/' + topicId + '/ai-questions...');
    const response = await fetch(`http://localhost:5000/api/topics/${topicId}/ai-questions`, {
      method: 'POST'
    });
    console.log('Response status:', response.status);
    const body = await response.json();
    console.log('Response body:', JSON.stringify(body, null, 2).substring(0, 1000));
  } catch (err) {
    console.error('Test failed with error:', err);
  }
}

run();
