import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

async function run() {
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query("SELECT key, value FROM app_session WHERE key LIKE 'review_questions_%'");
    console.log(`Scanning ${res.rows.length} sessions...`);
    
    for (const row of res.rows) {
      let data;
      try {
        data = JSON.parse(row.value);
      } catch (e) {
        continue;
      }
      
      const isObjectSession = data && !Array.isArray(data) && Array.isArray(data.questions);
      const isArraySession = Array.isArray(data);
      const questions = isObjectSession ? data.questions : (isArraySession ? data : null);
      
      if (!questions || questions.length !== 13) continue;
      
      // Determine if already alternating
      const types = questions.map(q => q.type || '');
      const expected = [
        '주관식 (개요)',
        '주관식 (공식)',
        '객관식 (4지선다)',
        '주관식 (표채우기)',
        '객관식 (4지선다)',
        '주관식 (단답형)',
        '객관식 (4지선다)',
        '주관식 (표채우기)',
        '객관식 (4지선다)',
        '주관식 (단답형)',
        '객관식 (4지선다)',
        '주관식 (단답형)',
        '주관식 (단답형)'
      ];
      
      let isAlternating = true;
      for (let i = 0; i < 13; i++) {
        const actualType = types[i] || '';
        const expectedType = expected[i];
        if (expectedType === '객관식 (4지선다)') {
          if (!actualType.includes('객관식')) isAlternating = false;
        } else {
          if (actualType !== expectedType) isAlternating = false;
        }
      }
      
      if (isAlternating) continue;
      
      console.log(`\nFound non-alternating 13-question session: ${row.key}`);
      
      // Find Topic ID and Title
      let topicId = null;
      if (row.key.startsWith('review_questions_topic_')) {
        const parts = row.key.split('_');
        // key format: review_questions_topic_ID_sess_SID or review_questions_topic_ID
        const idPart = parts[3];
        topicId = parseInt(idPart, 10);
      } else if (row.key.startsWith('review_questions_schedule_')) {
        const parts = row.key.split('_');
        // key format: review_questions_schedule_SCHEDID_sess_SID or review_questions_schedule_SCHEDID
        const schedId = parseInt(parts[3], 10);
        if (!isNaN(schedId)) {
          const schedRes = await pool.query("SELECT topic_id FROM schedules WHERE id = $1", [schedId]);
          if (schedRes.rows.length > 0) {
            topicId = schedRes.rows[0].topic_id;
          }
        }
      }
      
      if (!topicId || isNaN(topicId)) {
        console.log(`  [SKIPPED] Could not resolve topic ID for key: ${row.key}`);
        continue;
      }
      
      const topicRes = await pool.query("SELECT title FROM topics WHERE id = $1", [topicId]);
      if (topicRes.rows.length === 0) {
        console.log(`  [SKIPPED] Topic ID ${topicId} not found in topics table.`);
        continue;
      }
      const topicTitle = topicRes.rows[0].title;
      console.log(`  Resolved Topic ID: ${topicId} | Title: "${topicTitle}"`);
      
      // Separate questions by type
      let qIntro = questions.find(q => (q.type || '').includes('개요'));
      let qFormula = questions.find(q => (q.type || '').includes('공식'));
      
      if (!qIntro) qIntro = questions[0];
      if (!qFormula) qFormula = questions[1];
      
      const mcs = questions.filter(q => q !== qIntro && q !== qFormula && ((q.type || '').includes('객관식') || (q.options && q.options.length > 0)));
      const tables = questions.filter(q => q !== qIntro && q !== qFormula && ((q.type || '').includes('표채우기') || q.subtype === '표채우기'));
      const shorts = questions.filter(q => q !== qIntro && q !== qFormula && ((q.type || '').includes('단답형') || q.subtype === '단답형' || (!q.options && !(q.type || '').includes('표채우기') && !(q.type || '').includes('개요') && !(q.type || '').includes('공식'))));
      
      const finalMcs = [...mcs];
      const finalTables = [...tables];
      const finalShorts = [...shorts];
      
      // Supplement MCs if needed (should have 5)
      while (finalMcs.length < 5) {
        finalMcs.push({
          type: "객관식 (4지선다)",
          question: `[${topicTitle} 공학적 특성] ${topicTitle} 설계 시 고려해야 하는 지반의 역학적 강도 및 응력 상태에 대한 설명으로 가장 부적절한 것은?`,
          options: [
            "지반의 유효응력이 증가하면 전단강도가 커져 전체적인 안전율이 향상된다.",
            "간극수압이 상승하면 유효응력이 감소하여 구조물의 전도 및 활동 위험이 커진다.",
            "비배수 조건에서는 하중 재하 시 즉시 물이 배수되므로 간극수압 변화가 없다.",
            "계측기 관리를 철저히 하여 시공 중 안전성을 실시간 검증해야 한다."
          ],
          answer: "비배수 조건에서는 하중 재하 시 즉시 물이 배수되므로 간극수압 변화가 없다.",
          explanation: "비배수 상태에서는 간극수가 배출되지 못하므로 하중 재하 시 과잉간극수압이 발생하며 유효응력이 즉시 증가하지 않습니다."
        });
      }
      
      // Supplement Tables if needed (should have 2)
      while (finalTables.length < 2) {
        finalTables.push({
          type: "주관식 (표채우기)",
          question: `다음 ${topicTitle} 공학적 개념의 특성 비교표 빈칸에 들어갈 공학적 설명을 기술하시오.`,
          tableData: {
            headers: ["비교 항목", "개념 A (일반)", "개념 B (상세)"],
            rows: [
              ["역학적 거동 특징", "변형률이 작고 탄성 거동을 보임", "[INPUT_1]"],
              ["주요 설계 매개변수", "[INPUT_2]", "비선형 탄소성 정수 적용"]
            ]
          },
          answers: {
            "INPUT_1": "소성 변형 및 파괴 거동 지배",
            "INPUT_2": "선형 탄성계수 및 포아송비"
          },
          explanation: "일반 설계 개념과 정밀 공학 해석 개념 간의 입력 물성값 및 지반 거동 특징을 비교하는 표입니다."
        });
      }
      
      // Supplement Shorts if needed (should have 4)
      const defaultShortQuestions = [
        `${topicTitle} 공법/개념의 핵심적인 공학적 의미 및 메커니즘을 설명하시오.`,
        `${topicTitle} 적용 시 현장에서 발생할 수 있는 주요 시공 하자 원인과 그 대책을 서술하시오.`,
        `${topicTitle} 설계 시 안전율 확보 및 하중 작용 조건에 따른 검토 사항을 서술하시오.`,
        `${topicTitle}의 장단점을 타 유사 공법과 비교하여 설명하시오.`
      ];
      let defaultQIdx = 0;
      while (finalShorts.length < 4) {
        finalShorts.push({
          type: "주관식 (단답형)",
          question: defaultShortQuestions[defaultQIdx % defaultShortQuestions.length],
          answer: "핵심적인 공학적 메커니즘 및 현장 안전 확보 대책 수립",
          explanation: `${topicTitle}에 관련된 실무적 설계 인자 분석 및 시공 대책에 관한 해설입니다.`
        });
        defaultQIdx++;
      }
      
      // Check if user has answered questions at indices >= 2
      let hasAnswersInRest = false;
      if (isObjectSession) {
        const selectedAnswers = data.selectedAnswers || {};
        const revealedQuestions = data.revealedQuestions || {};
        const tableAnswers = data.tableAnswers || {};
        
        for (const k of Object.keys(selectedAnswers)) {
          if (parseInt(k, 10) >= 2) hasAnswersInRest = true;
        }
        for (const k of Object.keys(revealedQuestions)) {
          if (parseInt(k, 10) >= 2) hasAnswersInRest = true;
        }
        for (const k of Object.keys(tableAnswers)) {
          const idx = parseInt(k.split('_')[0], 10);
          if (idx >= 2 && tableAnswers[k]) {
            hasAnswersInRest = true;
          }
        }
      }
      
      if (hasAnswersInRest) {
        console.log(`  [SKIPPED] User has already answered questions beyond Q1/Q2. Cannot safely re-order.`);
        continue;
      }
      
      // Re-order questions using alternating structure
      const reordered = [
        qIntro,             // Q1 (index 0)
        qFormula,           // Q2 (index 1)
        finalMcs[0],        // Q3 (index 2)
        finalTables[0],     // Q4 (index 3)
        finalMcs[1],        // Q5 (index 4)
        finalShorts[0],     // Q6 (index 5)
        finalMcs[2],        // Q7 (index 6)
        finalTables[1],     // Q8 (index 7)
        finalMcs[3],        // Q9 (index 8)
        finalShorts[1],     // Q10 (index 9)
        finalMcs[4],        // Q11 (index 10)
        finalShorts[2],     // Q12 (index 11)
        finalShorts[3]      // Q13 (index 12)
      ];
      
      // Set correct types & categories
      reordered.forEach(q => {
        if (!q.category) q.category = '일반';
      });
      
      if (isObjectSession) {
        data.questions = reordered;
      } else {
        data = reordered;
      }
      
      const updatedValue = JSON.stringify(data);
      await pool.query("UPDATE app_session SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2", [updatedValue, row.key]);
      console.log(`  [SUCCESS] Session ${row.key} successfully reordered!`);
    }
  } catch (err) {
    console.error("Error during session reordering:", err);
  } finally {
    await pool.end();
  }
}

run().catch(console.error);
