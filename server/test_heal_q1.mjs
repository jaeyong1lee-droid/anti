import { dbQuery } from './database.js';
import { generateCalcTopicQuiz } from './plugins/calculationPlugin.js';
import { callLLMWithFailover } from './services/aiService.js';
import { healQuizQuestionObject } from '../client/src/utils/latexUtils.js';

async function testHeal() {
  const topic = await dbQuery.get('SELECT * FROM topics WHERE id = 32');
  const fileText = topic.extracted_text || '';
  
  const questions = await generateCalcTopicQuiz(
    topic,
    fileText,
    '댐 저면 침투 및 유선망 수리해석',
    '',
    '',
    '',
    callLLMWithFailover
  );

  console.log('--- RAW GENERATED Q1 ---');
  console.log('tableData:', JSON.stringify(questions[0].tableData, null, 2));
  console.log('calcItems:', questions[0].calcItems);

  console.log('--- HEALED Q1 (WHAT FRONTEND SEES) ---');
  const healed = healQuizQuestionObject(questions[0]);
  console.log('Healed calcItems:', JSON.stringify(healed.calcItems, null, 2));

  process.exit(0);
}

testHeal().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
