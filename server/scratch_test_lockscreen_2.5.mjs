import { initDatabase, dbQuery } from './database.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getTopicText } from './index.js';
import fs from 'fs';

const systemInstruction = `당신은 대한민국 토목공학, 지반공학, 구조공학 등 기술사 시험 출제위원입니다.
제시된 공식 후보군 및 토픽 본문 텍스트 데이터를 기반으로, 수험생이 화면 잠금을 해제할 때 풀 수 있는 객관식(3지선다형) 퀴즈 1문제를 출제하십시오.
질문의 유형, 보기의 형태, 수치 질문 대상을 매번 다양하게 변형하여 출제해 주십시오.
반드시 아래 지정된 JSON 배열 포맷으로만 응답해야 하며, 다른 부가 설명이나 백슬래시 에러가 있어서는 안 됩니다.

[출제 지침 기준 (Lockscreen Generation Standards)]:
1. **공식, 기준, 숫자 중심 출제**:
   - 락스크린 문제는 반드시 공식, 설계 및 시공 기준, 그리고 구체적인 수치/숫자값만 질문 대상으로 삼으십시오. 단순 서술형 개념 설명이나 일반적인 이론 설명에 대한 질문은 절대 출제하지 마십시오.
2. **정답 유형 제한**:
   - 질문은 무조건 "맞는 것(올바른 것)" 또는 "올바른 기준수치/값"만 고르도록 요구해야 합니다. 절대로 "틀린 것", "올바르지 않은 것", "잘못된 것"을 고르는 문제는 출제하지 마십시오.`;

async function runTest() {
  try {
    console.log('Initializing database...');
    await initDatabase();

    const envContent = fs.readFileSync('.env', 'utf8');
    let key = '';
    for (const line of envContent.split('\n')) {
      if (line.startsWith('GEMINI_API_KEY=')) {
        key = line.split('=')[1].trim();
        break;
      }
    }

    // Fetch topics
    const allTopics = await dbQuery.all('SELECT id, title, keywords FROM topics');
    const topic = await dbQuery.get('SELECT * FROM topics WHERE id = ?', [allTopics[0].id]);
    const textContent = topic ? await getTopicText(topic) : '';
    const truncatedText = textContent ? textContent.substring(0, 2000) : '';

    const userPrompt = `
[대상 후보군]:
=== [2. 토픽/수치 기준 후보군] ===
[Topic Candidate #1]:
- 토픽명 (Title): ${topic.title}
- 키워드 (Keywords): ${topic.keywords || ''}
- 본문 텍스트 요약 (Text Content):
${truncatedText}

[출제 요구사항]:
1. 문제 개수: 정확히 1개의 객관식 문제를 출제해 배열 형태로 반환하십시오.
2. 보기(options) 구성: 3개의 보기 중 정확히 1개만 정답이어야 합니다.
3. JSON 반환 규격:
[
  {
    "id": "ls_1",
    "question": "문제 질문 내용",
    "options": ["보기 1", "보기 2", "보기 3"],
    "answer": "정답 보기의 텍스트",
    "explanation": "해설"
  }
]
`;

    console.log('Calling GoogleGenerativeAI with gemini-2.5-flash...');
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemInstruction,
    }, { apiVersion: 'v1beta' });

    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    console.log('\nResponse received successfully:');
    console.log(text);

  } catch (err) {
    console.error('Error during direct gemini-2.5-flash call:', err);
    if (err.status) {
      console.error('HTTP Status:', err.status);
    }
  } finally {
    process.exit(0);
  }
}

runTest();
