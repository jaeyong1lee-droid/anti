import { initDatabase, dbQuery } from './database.js';
import { generateDailyLockscreenQuestions } from './plugins/lockscreenQuizPlugin.js';
import { callLLMWithFailover, getTopicText } from './index.js';
import { LOCKSCREEN_STANDARDS } from './plugins/lockscreenStandards.js';

async function runTest() {
  try {
    console.log('Initializing database...');
    await initDatabase();

    const count = 1;
    
    // 0. Fetch recent lockscreen questions
    let recentQuestions = [];
    const recentRows = await dbQuery.all("SELECT value FROM app_session WHERE key = 'recent_lockscreen_questions'");
    if (recentRows.length > 0 && recentRows[0].value) {
      recentQuestions = JSON.parse(recentRows[0].value) || [];
    }
    console.log(`Recent questions count: ${recentQuestions.length}`);

    // 1. Fetch formula questions
    const rows = await dbQuery.all("SELECT value FROM app_session WHERE key = 'formula_questions'");
    let formulaQuestions = [];
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      formulaQuestions = parsed && Array.isArray(parsed.formulaQuestions) ? parsed.formulaQuestions : [];
    }
    console.log(`Formula questions total count in DB: ${formulaQuestions.length}`);

    const formulaLimit = count === 1 ? 6 : 12;
    const formulaCandidates = [...formulaQuestions]
      .sort(() => 0.5 - Math.random())
      .slice(0, formulaLimit);
    console.log(`Selected formula candidates: ${formulaCandidates.length}`);

    // 2. Fetch topics
    const allTopics = await dbQuery.all('SELECT id, title, keywords FROM topics');
    console.log(`Topics total count in DB: ${allTopics.length}`);

    const textExtractionLimit = 12;
    const shuffledTopics = [...allTopics].sort(() => 0.5 - Math.random());
    const pickedForText = shuffledTopics.slice(0, textExtractionLimit);
    
    const textExtractedCandidates = await Promise.all(
      pickedForText.map(async (t) => {
        try {
          const fullTopic = await dbQuery.get('SELECT * FROM topics WHERE id = ?', [t.id]);
          const textContent = fullTopic ? await getTopicText(fullTopic) : '';
          const truncatedText = textContent ? textContent.substring(0, 2000) : '';
          return {
            id: t.id,
            title: t.title,
            keywords: t.keywords || '',
            textContent: truncatedText
          };
        } catch (err) {
          return {
            id: t.id,
            title: t.title,
            keywords: t.keywords || '',
            textContent: ''
          };
        }
      })
    );

    const remainingTopics = shuffledTopics.slice(textExtractionLimit).map(t => ({
      id: t.id,
      title: t.title,
      keywords: t.keywords || '',
      textContent: '(생략 - 제목 및 키워드 기반으로 문제 출제 가능)'
    }));

    const finalTopicCandidates = [...textExtractedCandidates, ...remainingTopics];
    console.log(`Selected topic candidates: ${finalTopicCandidates.length}`);

    if (formulaCandidates.length === 0 && finalTopicCandidates.length === 0) {
      console.error('No candidate data available.');
      return;
    }

    console.log('Generating lockscreen questions...');
    const generatedQuestions = await generateDailyLockscreenQuestions(
      formulaCandidates, 
      finalTopicCandidates, 
      callLLMWithFailover, 
      count, 
      LOCKSCREEN_STANDARDS,
      recentQuestions
    );

    console.log('\n======================================');
    console.log('SUCCESSFULLY GENERATED LOCKSCREEN QUIZ:');
    console.log(JSON.stringify(generatedQuestions, null, 2));
    console.log('======================================');

  } catch (err) {
    console.error('Test script failed with error:', err);
  } finally {
    process.exit(0);
  }
}

runTest();
