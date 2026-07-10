import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbQuery } from '../database.js';
import { callLLMWithFailover, analyzeStandardsBeforeTask, saveSessionValue, getTopicText, startBackendProgressTimer, updateProgress } from '../services/aiService.js';
import { healLatexFormulas, healQuizQuestionObject, healAnswersheetQuestionObject } from '../utils/latexUtils.js';
import * as fileUtils from '../utils/fileUtils.js';
import { generateFallbackQuestions } from '../fallback_generator.js';
import { GENERATION_STANDARDS } from '../plugins/generationStandards.js';
import { ENGINEERING_STANDARDS } from '../plugins/engineeringStandards.js';
import * as ocrPlugin from '../plugins/calculationPlugin.js';
import pdfParse from 'pdf-parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

const router = express.Router();

function cleanQuizQuestion(q) {
  if (!q) return q;
  return q.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function getCoreSubjectFromTitle(title) {
  if (!title) return '';
  return title.trim();
}

function shuffleMultipleChoice(q) {
  if (!q || !q.options || q.options.length === 0) return q;
  const originalAnswer = q.answer;
  const shuffledOptions = [...q.options];
  for (let i = shuffledOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
  }
  const normalize = (s) => (s || '').replace(/^\d+\.\s*/, '').trim();
  const matchedOption = shuffledOptions.find(opt => normalize(opt) === normalize(originalAnswer)) || originalAnswer;
  return {
    ...q,
    options: shuffledOptions,
    answer: matchedOption
  };
}

function isQuestionMismatched(question, topicTitle, topicKeywords) {
  return null;
}

function deduplicateQuestions(questions) {
  return questions;
}

function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateCalculationFallbackQuestions(title, keywords) {
  return [
    {
      type: "주관식 (단답형)",
      question: `[${title} 계산 문제 1] ${title}의 기본 가정을 바탕으로 극한 지지력 및 구조물의 허용하중 수치를 구하시오. (첨부된 원보고서의 이미지 및 도표를 참고하여 설계 인자들을 대입하여 계산하십시오.)`,
      answer: "원보고서 조건에 따른 수치",
      explanation: "원보고서 및 제공된 스크샷 이미지의 공학적 설계 조건(지반 종류, 지하수위, 기초폭 등)을 대입하여 극한 지지력을 계산하는 전개 과정입니다."
    },
    {
      type: "주관식 (단답형)",
      question: `[${title} 계산 문제 2] ${title}의 설계 매개변수 변화에 따른 최종 지반 반력 및 작용 응력 분포를 연산하시오. (첨부된 그림의 수치를 적용하여 연산하십시오.)`,
      answer: "설계 조건 변화에 따른 변동 수치",
      explanation: "공식에 변경된 지반 매개변수 및 구조적 수치를 대입하여 최종 연직/수평 하중 및 안정성을 구하는 계산 해설입니다."
    },
    {
      type: "주관식 (단답형)",
      question: `[${title} 공학적 의미] 이 계산 과정 및 결과가 설계와 시공 실무에 주는 교훈 또는 공학적 의미(지반 거동 해석, 안전성 평가 등)를 설명하십시오.`,
      answer: "설계 및 시공 조건의 안전 여유도 확보와 지반 거동 분석의 기초 자료 제공",
      explanation: "계산 결과를 통해 한계 상태를 판단하고, 실제 지반의 거동 특징과 불확실성을 고려한 설계 마진 및 공학적 교훈을 이해하는 것이 핵심입니다."
    },
    {
      type: "주관식 (단답형)",
      question: `[${title} 공학적 대책] 이 문제의 계산 결과(지지력 부족, 침하량 과다, 불안정 등)와 관련하여 현장에서 공학적 문제가 발생했을 때의 실무적 해결책 및 대책을 서술하십시오.`,
      answer: "지반 개량 공법 적용, 하중 분산 대책 수립, 계측 관리 강화 및 차수/배수 공법 설계",
      explanation: "계산치 초과 또는 지반 붕괴 위험 등 불안정성 발생 시 현장에서 취할 수 있는 구체적인 지반 개량(그라우팅, 다짐 등) 및 공법 변경 대책을 제시하는 문항입니다."
    }
  ];
}

function assembleFinalCalculationQuestions(questions, topic) {
  let finalQuestions = (questions || []).filter(q =>
    q.type === '주관식 (단답형)' || q.type === '주관식 (표채우기)'
  );
  const fb = generateCalculationFallbackQuestions(topic.title, topic.keywords);
  while (finalQuestions.length < 4) {
    finalQuestions.push(fb[finalQuestions.length]);
  }
  return finalQuestions.slice(0, 4);
}

function assembleFinalQuestions(questions, topic, carryOverQuestions, fileText) {
  let qIntro = questions.find(q => q.type === '주관식 (개요)');
  let qFormula = questions.find(q => q.type === '주관식 (공식)');
  
  const fallbackQs = generateFallbackQuestions(topic.title, topic.keywords, fileText || '')
    .filter(q => !(q.question || '').includes('general_geotech'));
  
  if (!qIntro) {
    qIntro = fallbackQs.find(q => q.type === '주관식 (개요)');
  }
  if (!qFormula) {
    qFormula = fallbackQs.find(q => q.type === '주관식 (공식)');
  }

  if (qIntro) {
    qIntro = { ...qIntro };
    qIntro.type = '주관식 (개요)';
    delete qIntro.tableData;
    delete qIntro.answers;
    delete qIntro.subtype;
  } else {
    qIntro = {
      type: "주관식 (개요)",
      question: `[${topic.title}]의 가장 핵심적인 공학적 정의(개요)와 기본적인 작동 원리를 서술하시오.`,
      concept: `${topic.title}의 개요와 기본 원리입니다.`,
      formula: "",
      structure: ""
    };
  }

  if (qFormula) {
    qFormula = { ...qFormula };
    qFormula.type = '주관식 (공식)';
    delete qFormula.tableData;
    delete qFormula.answers;
    delete qFormula.subtype;
  } else {
    qFormula = {
      type: "주관식 (공식)",
      question: `${topic.title}의 대표적인 설계 공식 명칭을 기술하시오.`,
      concept: `${topic.title}의 대표 공식입니다.`,
      formula: "",
      structure: ""
    };
  }

  const subjsShort = questions.filter(q => q.type === '주관식 (단답형)' && q !== qIntro && q !== qFormula);
  const subjsTable = questions.filter(q => (q.type === '주관식 (표채우기)' || q.subtype === '표채우기') && q !== qIntro && q !== qFormula);
  const mcs = questions.filter(q => (q.type === '객관식 (4지선다)' || (q.options && q.options.length > 0)) && q !== qIntro && q !== qFormula);

  let finalSubjsShort = [...subjsShort];
  if (finalSubjsShort.length < 4) {
    const fallbackShorts = fallbackQs.filter(q => q.type === '주관식 (단답형)' && q !== qIntro && q !== qFormula);
    finalSubjsShort = [...finalSubjsShort, ...fallbackShorts];
  }

  const uniqueShort = [];
  const shortSeen = new Set();
  finalSubjsShort.forEach(q => {
    const qText = (q.question || '').trim();
    if (qText && !shortSeen.has(qText)) {
      shortSeen.add(qText);
      uniqueShort.push(q);
    }
  });
  finalSubjsShort = uniqueShort.slice(0, 4);

  if (finalSubjsShort.length < 4 && qIntro) {
    finalSubjsShort.push({
      type: "주관식 (단답형)",
      question: `[${topic.title}]의 가장 핵심적인 공학적 정의(개요)와 기본적인 작동 원리를 서술하시오.`,
      answer: qIntro.concept || `${topic.title}의 핵심 개념`,
      explanation: `${topic.title}에 관한 핵심 정의 및 개요 서술형 평가입니다.`
    });
  }

  const defaultShortQuestions = [
    `${topic.title} 공법/개념의 핵심적인 공학적 의미 및 메커니즘을 설명하시오.`,
    `${topic.title} 적용 시 현장에서 발생할 수 있는 주요 시공 하자 원인과 그 대책을 서술하시오.`,
    `${topic.title} 설계 시 안전율 확보 및 하중 작용 조건에 따른 검토 사항을 서술하시오.`,
    `${topic.title}의 장단점을 타 유사 공법과 비교하여 설명하시오.`
  ];
  let defaultQIdx = 0;
  while (finalSubjsShort.length < 4) {
    finalSubjsShort.push({
      type: "주관식 (단답형)",
      question: defaultShortQuestions[defaultQIdx % defaultShortQuestions.length],
      answer: "핵심 메커니즘 및 공학적 대책",
      explanation: `${topic.title}의 세부 공학적 개념과 현장 실무적인 작동 원리입니다.`
    });
    defaultQIdx++;
  }

  let finalSubjsTable = [...subjsTable].slice(0, 2);
  if (finalSubjsTable.length < 2) {
    const fallbackTables = fallbackQs.filter(q => (q.type === '주관식 (표채우기)' || q.subtype === '표채우기') && q !== qIntro && q !== qFormula);
    finalSubjsTable = [...finalSubjsTable, ...fallbackTables].slice(0, 2);
  }
  while (finalSubjsTable.length < 2) {
    finalSubjsTable.push({
      type: "주관식 (표채우기)",
      question: "터널 굴착면 상부의 보강 공법인 강관다단 그라우팅과 천단 훠폴링 공법의 비교표 빈칸 (A), (B)에 들어갈 공학적 설명을 기술하시오.",
      tableData: {
        headers: ["비교 항목", "강관다단 그라우팅 공법", "천단 훠폴링 (Forepoling) 공법"],
        rows: [
          ["보강재 규격 및 특성", "대구경 강관 주입재 가압 그라우팅", "[INPUT_1]"],
          ["주요 역할 및 역학적 기전", "[INPUT_2]", "천단 낙석 방지 및 국부 붕괴 방지"],
          ["시공 길이 및 범위", "10m ~ 15m (중첩 시공 필요)", "3m ~ 6m 내외"]
        ]
      },
      answers: {
        "INPUT_1": "소구경 강봉 또는 이형철근 주입",
        "INPUT_2": "터널 상부 종방향 아치 형성 및 차수"
      },
      explanation: "강관다단 그라우팅은 대구경 강관과 가압 주입을 통해 천단부에 종방향 아치를 형성하고 차수 효과를 극대화하는 반면, 훠폴링은 소구경 보강재로 천단의 국부 탈락 및 낙석 방지에 초점을 둡니다."
    });
  }

  let finalMcs = [];
  const uniqueMcQuestions = new Set();

  mcs.forEach(q => {
    if (finalMcs.length >= 5) return;
    const cleanQ = (q.question || '').trim();
    if (cleanQ && !uniqueMcQuestions.has(cleanQ)) {
      uniqueMcQuestions.add(cleanQ);
      finalMcs.push(q);
    }
  });

  if (finalMcs.length < 5 && carryOverQuestions && carryOverQuestions.length > 0) {
    const shuffledCarryOvers = carryOverQuestions.map(q => shuffleMultipleChoice(q));
    shuffledCarryOvers.forEach(q => {
      if (finalMcs.length >= 5) return;
      const cleanQ = (q.question || '').trim();
      if (cleanQ && !uniqueMcQuestions.has(cleanQ)) {
        uniqueMcQuestions.add(cleanQ);
        finalMcs.push(q);
      }
    });
  }

  if (finalMcs.length < 5) {
    const fallbackMcs = fallbackQs.filter(q => (q.options && q.options.length > 0) && q !== qIntro && q !== qFormula).map(q => shuffleMultipleChoice(q));
    for (const fQ of fallbackMcs) {
      if (finalMcs.length >= 5) break;
      const cleanQ = (fQ.question || '').trim();
      if (cleanQ && !uniqueMcQuestions.has(cleanQ)) {
        uniqueMcQuestions.add(cleanQ);
        finalMcs.push(fQ);
      }
    }
  }

  if (finalMcs.length < 5) {
    const defaultGeotechMcs = [
      {
        type: "객관식 (4지선다)",
        question: `[${topic.title} 공학적 특성] 토목 및 지반 공사에서 흙과 암반의 투수성 및 배수 설계 시 지하수위 변동이 옹벽 구조물의 배면 토압에 미치는 영향으로 가장 부적절한 것은?`,
        options: [
          "지하수위가 상승하면 배면 정수압이 추가되어 옹벽에 작용하는 전주동토압이 증가한다.",
          "지하수위 이하 지반의 흙 단위중량은 수중 단위중량으로 감소하여 토압 자체는 줄어든다.",
          "수압과 토압이 동시에 작용할 때 구조물의 전도 및 활동 리스크가 감소한다.",
          "원활한 배수를 위해 필터재와 유공관을 설계하여 수압 상승을 적극 억제해야 한다."
        ],
        answer: "수압과 토압이 동시에 작용할 때 구조물의 전도 및 활동 리스크가 감소한다.",
        explanation: "배면 수압과 토압이 동시에 작용하면 구조물에 가해지는 횡압력이 급격히 증가하여 전도(Overturning) 및 활동(Sliding) 리스크가 대폭 증가합니다. 따라서 리스크가 감소한다는 설명은 잘못되었습니다."
      },
      {
        type: "객관식 (4지선다)",
        question: `[${topic.title} 설계 안전율] 지반 공학적 설계 조건에서 사면 안정 및 기초의 지지력 산정 시 적용되는 안전율(Factor of Safety) 개념에 관한 설명으로 가장 올바르지 않은 것은?`,
        options: [
          "안전율은 지반 정수의 불확실성, 시공 오차, 하중 변동성 등을 고려한 마진이다.",
          "일시적 집중호우나 지진 등의 지진동 작용 시에는 기준 안전율을 상향하여 설계해야 한다.",
          "허용응력설계법(ASD)에서는 극한 저항력을 소요 안전율로 나누어 허용력을 산정한다.",
          "안전율이 1.0 미만인 지반 구조물은 역학적으로 항상 영구히 안정한 상태를 유지한다."
        ],
        answer: "안전율이 1.0 미만인 지반 구조물은 역학적으로 항상 영구히 안정한 상태를 유지한다.",
        explanation: "안전율(F.S)이 1.0 미만이라는 것은 저항력이 작용력보다 작다는 의미이므로 붕괴나 미끄러짐 등의 한계상태에 도달하여 불안정한 상태가 됨을 뜻합니다. 따라서 항상 안전하다는 진술은 잘못되었습니다."
      },
      {
        type: "객관식 (4지선다)",
        question: `[${topic.title} 전단강도] Terzaghi의 유효응력(Effective Stress) 원리를 적용하여 점성토 지반의 전단강도를 해석할 때, 과잉간극수압(Excess Pore Water Pressure)의 소산과 흙의 거동에 관한 설명 중 가장 옳지 않은 것은?`,
        options: [
          "압밀이 진행됨에 따라 과잉간극수압이 소산되고 유효응력이 증가한다.",
          "유효응력이 증가하면 점성토 지반의 전단강도와 전단 저항각이 점진적으로 증가한다.",
          "비배수 상태에서 급속 하중을 재하하면 유효응력의 변화가 즉시 차단되므로 전단강도가 무한대로 상승한다.",
          "간극수압계(Piezometer)를 활용하여 현장에서 과잉간극수압의 소산 경향을 계측할 수 "
        ],
        answer: "비배수 상태에서 급속 하중을 재하하면 유효응력의 변화가 즉시 차단되므로 전단강도가 무한대로 상승한다.",
        explanation: "비배수 상태에서 급속 하중을 가하면 과잉간극수압이 상승하고 유효응력은 증가하지 않거나 감소하여 전단강도가 저하될 수 있으며, 결코 전단강도가 무한대로 상승하지 않습니다."
      }
    ];

    const deficit = 5 - finalMcs.length;
    console.log(`[문항 치환/보강] 유니크 객관식이 부족하여 ${deficit}개 문항을 고품질 기본 지반공학 객관식으로 보강합니다.`);
    for (let i = 0; i < deficit; i++) {
      finalMcs.push(defaultGeotechMcs[i % defaultGeotechMcs.length]);
    }
  }

  const shuffledMcs = shuffleArray([...finalMcs]);
  const shuffledTables = shuffleArray([...finalSubjsTable]);
  const shuffledShortsMiddle = shuffleArray([finalSubjsShort[0], finalSubjsShort[1]]);

  return [
    qIntro,                     // 1번 주관식 (index 0)
    qFormula,                   // 2번 주관식 (index 1)
    shuffledMcs[0],             // 3번 객관식 (index 2)
    shuffledTables[0],          // 4번 표채우기 (index 3)
    shuffledMcs[1],             // 5번 객관식 (index 4)
    shuffledShortsMiddle[0],    // 6번 주관식 (index 5)
    shuffledMcs[2],             // 7번 객관식 (index 6)
    shuffledTables[1],          // 8번 표채우기 (index 7)
    shuffledMcs[3],             // 9번 객관식 (index 8)
    shuffledShortsMiddle[1],    // 10번 주관식 (index 9)
    shuffledMcs[4],             // 11번 객관식 (index 10)
    finalSubjsShort[2],         // 12번 주관식 (index 11)
    finalSubjsShort[3]          // 13번 주관식 (index 12)
  ];
}

async function ensureSessionTable() {
  try {
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS app_session (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn('ensureSessionTable warning:', e.message);
  }
}

async function ensureAnswersheetReportsTable() {
  try {
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS answersheet_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pdf_name TEXT,
        pdf_data BLOB,
        pdf_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn('ensureAnswersheetReportsTable warning:', e.message);
  }
}

async function getFormattedTopicInstructions(topicId) {
  if (!topicId) return '';
  try {
    const key = 'topic_instructions_' + topicId;
    const row = await dbQuery.get("SELECT value FROM app_session WHERE key = ?", [key]);
    if (row && row.value) {
      const list = JSON.parse(row.value);
      if (Array.isArray(list) && list.length > 0) {
        const formatted = list.map((item, idx) => (idx + 1) + '. **' + item.title + '**:\n   - ' + item.content).join('\n');
        return '\n[🚨 이 토픽(' + topicId + ')의 전용 문제 출제 및 변환 지침 - 반드시 반영하십시오]:\n' + formatted + '\n';
      }
    }
  } catch (e) {}
  return '';
}

// POST /api/topics/:id/ai-questions -> Generate AI review questions
router.post('/topics/:id/ai-questions', async (req, res) => {
  const topicId = Number(req.params.id) || req.params.id;
  let resolvedScheduleId;
  let topic = null;

  try {
    const topicSql = `SELECT id, title, keywords, pdf_name, category, pdf_url, extracted_text FROM topics WHERE id = ?`;
    topic = await dbQuery.get(topicSql, [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '토픽을 찾을 수 없습니다.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  let isCacheHit = false;
  let cachedResponseData = null;

  try {
    await ensureSessionTable();
    const scheduleId = req.query.scheduleId;
    const isPractice = req.query.isPractice === 'true';
    resolvedScheduleId = scheduleId;

    if (!resolvedScheduleId || resolvedScheduleId === '9999' || resolvedScheduleId === 'null' || resolvedScheduleId === 'undefined' || resolvedScheduleId === 9999) {
      const existingPending = await dbQuery.get(
        `SELECT id FROM schedules WHERE topic_id = ? AND (status = 'pending' OR status = 'practice') ORDER BY id DESC LIMIT 1`,
        [topicId]
      );
      if (existingPending) {
        resolvedScheduleId = existingPending.id;
      } else {
        const today = fileUtils.getLocalDateString();
        const initialStatus = isPractice ? 'practice' : 'pending';
        const insertRes = await dbQuery.run(
          `INSERT INTO schedules (topic_id, review_round, planned_date, status) VALUES (?, 99, ?, ?)`,
          [topicId, today, initialStatus]
        );
        resolvedScheduleId = insertRes.id;
      }
    }

    const sId = req.query.sessionId || 'legacy_default';
    const key = resolvedScheduleId
      ? `review_questions_schedule_${resolvedScheduleId}_sess_${sId}`
      : `review_questions_topic_${topicId}_sess_${sId}`;

    let cached = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);

    let newestSessionRow = null;
    const patterns = [];
    if (resolvedScheduleId && resolvedScheduleId !== '9999' && resolvedScheduleId !== 'null' && resolvedScheduleId !== 'undefined') {
      patterns.push(`review_questions_schedule_${resolvedScheduleId}_sess_%`);
    }
    patterns.push(`review_questions_topic_${topicId}_sess_%`);

    if (!resolvedScheduleId || resolvedScheduleId === '9999' || resolvedScheduleId === 'null' || resolvedScheduleId === 'undefined') {
      const existingPending = await dbQuery.get(
        `SELECT id FROM schedules WHERE topic_id = ? AND (status = 'pending' OR status = 'practice') ORDER BY id DESC LIMIT 1`,
        [topicId]
      );
      if (existingPending) {
        patterns.push(`review_questions_schedule_${existingPending.id}_sess_%`);
      }
    }

    for (const pattern of patterns) {
      const row = await dbQuery.get(
        'SELECT key, value FROM app_session WHERE key LIKE ? ORDER BY updated_at DESC LIMIT 1',
        [pattern]
      );
      if (row && !newestSessionRow) newestSessionRow = row;
    }

    if (!cached && newestSessionRow) {
      cached = newestSessionRow;
      try {
        const parsedVal = JSON.parse(cached.value);
        let extractedSid = '';
        if (newestSessionRow.key.includes('_sess_')) {
          const parts = newestSessionRow.key.split('_sess_');
          extractedSid = parts[parts.length - 1];
        }
        if (parsedVal && extractedSid) {
          parsedVal.sessionId = extractedSid;
          cached.value = JSON.stringify(parsedVal);
        }
      } catch (e) {}
    }

    if (!cached) {
      const legacyKey = resolvedScheduleId
        ? `review_questions_schedule_${resolvedScheduleId}`
        : `review_questions_topic_${topicId}`;
      cached = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [legacyKey]);
    }

    if (cached && cached.value) {
      const parsed = JSON.parse(cached.value);
      let cachedQuestions = null;
      let cachedMeta = {};
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedQuestions = parsed;
      } else if (parsed && Array.isArray(parsed.questions)) {
        cachedQuestions = parsed.questions;
        cachedMeta = {
          selectedAnswers: parsed.selectedAnswers || {},
          revealedQuestions: parsed.revealedQuestions || {},
          tableAnswers: parsed.tableAnswers || {},
          tableGradingResults: parsed.tableGradingResults || {},
          tutorAnswers: parsed.tutorAnswers || {},
          tutorInputText: parsed.tutorInputText || {},
          chatHistory: parsed.chatHistory || [],
          savedQuizScroll: parsed.savedQuizScroll || 0
        };
      }

      if (cachedQuestions && cachedQuestions.length > 0) {
        if (!(topic.category === '계산' && cachedQuestions.length !== 4)) {
          const mismatchedCount = cachedQuestions.filter(q => isQuestionMismatched(q, topic.title, topic.keywords)).length;
          if (mismatchedCount === 0) {
            const healed = cachedQuestions.map(q => healQuizQuestionObject({ ...q, category: topic.category }));
            isCacheHit = true;
            cachedResponseData = {
              questions: healed,
              ...cachedMeta,
              sessionId: parsed.sessionId || sId,
              isFallback: false,
              isCached: true,
              scheduleId: resolvedScheduleId
            };
          } else {
            await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
          }
        } else {
          await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        }
      }
    }
  } catch (e) {
    console.warn('Failed to parse cached review questions:', e);
  }

  if (isCacheHit && cachedResponseData) {
    return res.json(cachedResponseData);
  }

  let progressTimer = null;
  try {
    const progressId = req.query.progressId || req.body.progressId;
    let standardsAnalysis = '';
    const localCallLLM = (sys, prompt, img, scenario, opts) => {
      const enrichedPrompt = `[🚨 0단계 AI가 사전 분석한 절대 지침 준수 주의사항]:\n${standardsAnalysis}\n\n${prompt}`;
      return callLLMWithFailover(sys, enrichedPrompt, img, scenario, { ...opts, progressId });
    };

    if (progressId) {
      standardsAnalysis = await analyzeStandardsBeforeTask(progressId, topic.title, GENERATION_STANDARDS, 'generation');
      progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 예상 문제 생성 시작...', 50, 1500, 5);
    }

    let carryOverQuestions = [];
    let incorrectQuestions = [];
    try {
      const prevSchedule = await dbQuery.get(
        `SELECT id FROM schedules WHERE topic_id = ? AND (status = 'completed' OR status = 'failed') ORDER BY completed_at DESC LIMIT 1`,
        [topicId]
      );
      if (prevSchedule) {
        const prevSessionKey = `completed_review_schedule_${prevSchedule.id}`;
        const prevSession = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [prevSessionKey]);
        if (prevSession && prevSession.value) {
          const parsed = JSON.parse(prevSession.value);
          if (parsed && Array.isArray(parsed.questions)) {
            parsed.questions.forEach((q, qIdx) => {
              if (q.options && q.options.length > 0) {
                const selected = parsed.selectedAnswers?.[qIdx];
                const normalizeAns = (s) => (s || '').replace(/^\d+\.\s*/, '').trim();
                if (normalizeAns(selected) !== normalizeAns(q.answer)) {
                  if (!isQuestionMismatched(q, topic.title, topic.keywords)) {
                    incorrectQuestions.push(q);
                  }
                }
              }
            });
          }
        }
      }
    } catch (err) {
      console.warn('이전 오답 로딩 실패:', err);
    }

    const carryOverCount = Math.min(incorrectQuestions.length, 5);
    carryOverQuestions = incorrectQuestions.slice(0, carryOverCount);

    let fileText = '';
    if (topic.pdf_data) {
      fileText = await getTopicText(topic, fileUtils, ocrPlugin, pdfParse);
      fileText = fileUtils.smartTruncate(fileText, 30000);
    }

    const cleanTitle = (topic.title || '').toLowerCase();
    const cleanKeywords = (topic.keywords || '').toLowerCase();
    const searchTarget = `${cleanTitle} ${cleanKeywords}`;

    const isCoreTopic = 
      searchTarget.includes('활성도') || searchTarget.includes('activity') ||
      searchTarget.includes('이중층') || searchTarget.includes('double layer') || searchTarget.includes('ddl') ||
      searchTarget.includes('압밀') || searchTarget.includes('consolidation') || searchTarget.includes('침하') || searchTarget.includes('settlement') ||
      searchTarget.includes('샌드매트') || searchTarget.includes('sand mat') ||
      searchTarget.includes('평사투영') || searchTarget.includes('stereographic') ||
      searchTarget.includes('인발') || searchTarget.includes('pullout') ||
      searchTarget.includes('q 분류') || searchTarget.includes('q-system') ||
      searchTarget.includes('싱글쉘') || searchTarget.includes('single shell') ||
      searchTarget.includes('소일내일') || searchTarget.includes('soil nail') ||
      searchTarget.includes('프란틀') || searchTarget.includes('prandtl') ||
      searchTarget.includes('여굴') || searchTarget.includes('overbreak') ||
      searchTarget.includes('사면안정') || searchTarget.includes('slope stability') ||
      searchTarget.includes('토압') || searchTarget.includes('earth pressure') ||
      searchTarget.includes('전단강도') || searchTarget.includes('shear strength') ||
      searchTarget.includes('투수') || searchTarget.includes('침투') ||
      searchTarget.includes('흙막이') || searchTarget.includes('탄소성') ||
      searchTarget.includes('액상화') || searchTarget.includes('liquefaction') ||
      searchTarget.includes('보상기초') || searchTarget.includes('compensated foundation') ||
      searchTarget.includes('수압파쇄') || searchTarget.includes('hydraulic fracturing');

    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    const forceLocal = req.query.local === 'true';

    if (isCoreTopic && (forceLocal || !hasAnyAiKey)) {
      console.log(`[AI Route Interceptor - Local Fallback] Precision routed core topic "${topic.title}"`);
      const coreQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      const finalQuestions = topic.category === '계산'
        ? assembleFinalCalculationQuestions(coreQuestions, topic)
        : assembleFinalQuestions(coreQuestions, topic, carryOverQuestions, fileText);
      
      const cleanedCore = finalQuestions.map(q => healQuizQuestionObject({
        ...q,
        topic_id: Number(topicId),
        category: topic.category,
        question: cleanQuizQuestion(q.question)
      }));

      const deduplicatedCore = deduplicateQuestions(cleanedCore);
      const sId = req.query.sessionId || 'legacy_default';
      const key = resolvedScheduleId
        ? `review_questions_schedule_${resolvedScheduleId}_sess_${sId}`
        : `review_questions_topic_${topicId}_sess_${sId}`;

      try {
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        await dbQuery.run(
          'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, JSON.stringify(deduplicatedCore)]
        );
      } catch (e) {}

      if (progressTimer) clearInterval(progressTimer);
      return res.json({
        questions: deduplicatedCore,
        isFallback: true,
        mode: 'ai-optimized',
        info: 'Handcrafted premium routing bypass',
        scheduleId: resolvedScheduleId
      });
    }

    if (forceLocal || !hasAnyAiKey) {
      const fallbackQuestions = generateFallbackQuestions(topic.title, topic.keywords, fileText);
      const finalQuestions = topic.category === '계산'
        ? assembleFinalCalculationQuestions(fallbackQuestions, topic)
        : assembleFinalQuestions(fallbackQuestions, topic, carryOverQuestions, fileText);
      
      const cleanedFallback = finalQuestions.map(q => healQuizQuestionObject({
        ...q,
        topic_id: Number(topicId),
        category: topic.category,
        question: cleanQuizQuestion(q.question)
      }));

      const deduplicatedFallback = deduplicateQuestions(cleanedFallback);
      const sId = req.query.sessionId || 'legacy_default';
      const key = resolvedScheduleId
        ? `review_questions_schedule_${resolvedScheduleId}_sess_${sId}`
        : `review_questions_topic_${topicId}_sess_${sId}`;

      try {
        await dbQuery.run('DELETE FROM app_session WHERE key = ?', [key]);
        await dbQuery.run(
          'INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, JSON.stringify(deduplicatedFallback)]
        );
      } catch (e) {}

      if (progressTimer) clearInterval(progressTimer);
      return res.json({ 
        questions: deduplicatedFallback, 
        isFallback: true,
        mode: 'local',
        scheduleId: resolvedScheduleId
      });
    }

    let specialInstructions = '';
    if (cleanTitle.includes('확대기초') && cleanTitle.includes('거동') && cleanTitle.includes('파괴')) {
      specialInstructions = `
[특별 출제 지침 - 매우 중요]:
이 토픽은 '프란틀 지지력 공식'이나 '테르자기 극한지지력 공식' 자체의 상세한 유도나 공식 정의를 단독으로 묻는 토픽이 아닙니다.
1. 기초 아래 지반의 3대 파괴 형태: 전반전단파괴, 국부전단파괴, 관입전단파괴의 구체적 발생 조건 및 기전.
2. Vesic(1973)이 제안한 예측 도표의 특징.
3. 접지압 분포 패턴 및 침하 형상 비교.
`;
    }

    let weaknessPrompt = '';
    if (carryOverQuestions.length > 0) {
      weaknessPrompt = `
[이전 회차 오답 정보 및 출제 지침]:
아래 오답들은 사용자가 이전 회차에서 틀린 문제입니다.
이번에 생성할 5개의 객관식 문제 중 앞의 ${carryOverQuestions.length}개 문제(6번부터 ${5 + carryOverQuestions.length}번)는 반드시 아래 오답의 변형 문제로 출제하십시오:
${carryOverQuestions.map((q, idx) => `
오답 문제 ${idx + 1}:
- 질문: ${q.question}
- 보기: ${JSON.stringify(q.options)}
- 정답: ${q.answer}
`).join('\n')}
`;
    }

    const totalAiQuestionsCount = topic.category === '계산' ? 4 : 13;
    let feedbackPrompt = '';
    try {
      const feedbacks = await dbQuery.all(
        'SELECT question_text, feedback_type FROM question_feedback WHERE topic_id = ?',
        [topicId]
      );
      if (feedbacks.length > 0) {
        const upvotes = feedbacks.filter(f => f.feedback_type === 'upvote').map(f => f.question_text);
        const downvotes = feedbacks.filter(f => f.feedback_type === 'downvote').map(f => f.question_text);
        feedbackPrompt = `
[사용자 피드백 지침 - 출제 빈도 반영 및 조정 필수]:
1. 추천 질문 목록:
${upvotes.map((q, i) => `   - 추천 질문 ${i + 1}: ${q}`).join('\n')}
2. 비추천 질문 목록 (절대 유사문제 출제 금지):
${downvotes.map((q, i) => `   - 비추천 질문 ${i + 1}: ${q}`).join('\n')}
`;
      }
    } catch (fbErr) {}

    let adjustmentsPrompt = '';
    try {
      const adjustments = await dbQuery.all(
        'SELECT question_text, adjusted_text, user_feedback FROM question_adjustments WHERE topic_id = ? ORDER BY created_at DESC LIMIT 10',
        [topicId]
      );
      if (adjustments.length > 0) {
        adjustmentsPrompt = `
[사용자 이전 문제 조정(피드백) 내역]:
${adjustments.map((a, idx) => `
조정 이력 ${idx + 1}:
- 기존 문제: "${a.question_text}"
- 사용자의 피드백 요구사항: "${a.user_feedback}"
- 반영된 최종 문제: "${a.adjusted_text}"
`).join('\n')}
`;
      }
    } catch (adjErr) {}

    const coreSubject = getCoreSubjectFromTitle(topic.title);
    const topicInstructionsPrompt = await getFormattedTopicInstructions(topicId);

    const prompt = (topic.category === '계산') ? `
[문제 생성 태스크 시작]:
아래 제공되는 정보를 분석하여 총 정확히 4개의 계산 예상문제를 생성해 주십시오.
[토픽 제목]: ${topic.title}
[핵심 키워드]: ${topic.keywords || '제공되지 않음'}
[첨부파일 본문 텍스트](HTML 공부노트): ${fileText || '제공되지 않음'}

[출제 요구사항]:
1. 1번 문항 (첨부 이미지의 물음과 본문 HTML의 답변을 분석한 마크다운 질문표) - type: "주관식 (표채우기)"
2. 2번 문항 (개념 비교 표 칸채우기 문제) - type: "주관식 (표채우기)"
3. 3번 문항 (공학적 의미/교훈 주관식 문제) - type: "주관식 (단답형)"
4. 4번 문항 (관련 공학적 문제 발생 시 대책 주관식 문제) - type: "주관식 (단답형)"
` : `
[문제 생성 태스크 시작]:
아래 제공되는 정보를 분석하여 총 정확히 13개의 예상문제를 생성해 주십시오. (객관식 5개, 개요 1개, 공식 1개, 표채우기 2개, 단답형 4개)
[토픽 제목]: ${topic.title}
[첨부파일 본문 텍스트]: ${fileText || '제공되지 않음'}
`;

    const systemInstruction = `당신은 대한민국 국가건설기준설계코드(KDS) 및 지반공학 기술사 시험 출제위원입니다.
JSON 배열 형식으로만 문제를 출력하십시오.`;

    const rawText = await localCallLLM(systemInstruction, prompt, null, 'question');
    let parsedArray = null;
    
    // Parse json array safely
    const startIdx = rawText.indexOf('[');
    const endIdx = rawText.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1) {
      parsedArray = JSON.parse(rawText.substring(startIdx, endIdx + 1));
    }

    if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
      throw new Error('AI output is not a valid JSON array.');
    }

    const finalQuestions = topic.category === '계산'
      ? assembleFinalCalculationQuestions(parsedArray, topic)
      : assembleFinalQuestions(parsedArray, topic, carryOverQuestions, fileText);

    const cleanedQuestions = finalQuestions.map(q => healQuizQuestionObject({
      ...q,
      topic_id: Number(topicId),
      category: topic.category,
      question: cleanQuizQuestion(q.question)
    }));

    const deduplicated = deduplicateQuestions(cleanedQuestions);
    const sId = req.query.sessionId || 'legacy_default';
    const key = resolvedScheduleId
      ? `review_questions_schedule_${resolvedScheduleId}_sess_${sId}`
      : `review_questions_topic_${topicId}_sess_${sId}`;

    await saveSessionValue(key, JSON.stringify(deduplicated));
    if (progressTimer) clearInterval(progressTimer);

    res.json({
      questions: deduplicated,
      isFallback: false,
      scheduleId: resolvedScheduleId
    });

  } catch (err) {
    if (progressTimer) clearInterval(progressTimer);
    console.error('Error generating AI questions:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/review -> Get saved review session state
router.get('/session/review', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rawTopicId = req.query.topicId;
    let targetTopicId = String(rawTopicId || '');
    if (targetTopicId.startsWith('mixed_') && targetTopicId.includes('_sess_')) {
      targetTopicId = targetTopicId.split('_sess_')[0];
    }

    if (!rawTopicId) {
      return res.status(400).json({ error: 'topicId가 누락되었습니다.' });
    }

    if (targetTopicId && targetTopicId.startsWith('mixed_')) {
      const sId = req.query.sessionId || 'legacy_default';
      const key = `review_questions_topic_${targetTopicId}_sess_${sId}`;
      let row = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);
      if (row && row.value) {
        return res.json({ success: true, data: JSON.parse(row.value) });
      }
      return res.json({ success: true, data: null });
    }

    const key = `review_questions_topic_${targetTopicId}`;
    let row = await dbQuery.get('SELECT value FROM app_session WHERE key = ?', [key]);

    if (!row) {
      const topicPattern = `review_questions_topic_${targetTopicId}_sess_%`;
      const topicSessionRow = await dbQuery.get(
        'SELECT key, value FROM app_session WHERE key LIKE ? ORDER BY updated_at DESC LIMIT 1',
        [topicPattern]
      );
      if (topicSessionRow) row = topicSessionRow;
    }

    if (row && row.value) {
      let data = JSON.parse(row.value);
      if (data) {
        if (Array.isArray(data)) {
          data = {
            sessionId: 'legacy_default',
            questions: data,
            selectedAnswers: {},
            revealedQuestions: {},
            tableAnswers: {},
            tableGradingResults: {},
            tutorAnswers: {},
            tutorInputText: {},
            chatHistory: [],
            savedQuizScroll: 0
          };
        }
        if (Array.isArray(data.questions)) {
          data.questions = data.questions.map(q => healQuizQuestionObject(q));
        }
      }
      res.json({ success: true, data });
    } else {
      res.json({ success: false, error: '세션 정보가 없습니다.' });
    }
  } catch (err) {
    console.error('GET /api/session/review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/session/review -> Save review session state
router.post('/session/review', async (req, res) => {
  try {
    await ensureSessionTable();
    const { topicId, sessionId, questions, selectedAnswers, revealedQuestions, tableAnswers, tableGradingResults, tutorAnswers, tutorInputText, chatHistory, savedQuizScroll } = req.body;
    let targetTopicId = String(topicId || '');
    if (targetTopicId.startsWith('mixed_') && targetTopicId.includes('_sess_')) {
      targetTopicId = targetTopicId.split('_sess_')[0];
    }

    if (!topicId || !questions) {
      return res.status(400).json({ error: '필수 인자가 누락되었습니다.' });
    }

    if (targetTopicId && targetTopicId.startsWith('mixed_')) {
      const sId = sessionId || 'legacy_default';
      const key = `review_questions_topic_${targetTopicId}_sess_${sId}`;
      const value = JSON.stringify({
        sessionId: sessionId || '',
        questions,
        selectedAnswers: selectedAnswers || {},
        revealedQuestions: revealedQuestions || {},
        tableAnswers: tableAnswers || {},
        tableGradingResults: tableGradingResults || {},
        tutorAnswers: tutorAnswers || {},
        tutorInputText: tutorInputText || {},
        chatHistory: chatHistory || [],
        savedQuizScroll: savedQuizScroll || 0
      });
      await dbQuery.run(
        `INSERT INTO app_session (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
        [key, value]
      );
      return res.json({ success: true, message: 'Mixed session stored.' });
    }

    const key = `review_questions_topic_${targetTopicId}`;
    const value = JSON.stringify({
      sessionId: sessionId || '',
      questions,
      selectedAnswers: selectedAnswers || {},
      revealedQuestions: revealedQuestions || {},
      tableAnswers: tableAnswers || {},
      tableGradingResults: tableGradingResults || {},
      tutorAnswers: tutorAnswers || {},
      tutorInputText: tutorInputText || {},
      chatHistory: chatHistory || [],
      savedQuizScroll: savedQuizScroll || 0
    });

    await saveSessionValue(key, value);
    res.json({ success: true, ok: true });
  } catch (err) {
    console.error('POST /api/session/review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/session/review/topic/:id -> Delete a review session
router.delete('/session/review/topic/:id', async (req, res) => {
  try {
    await ensureSessionTable();
    const topicId = req.params.id;
    const targetTopicId = String(topicId || '');

    if (targetTopicId && targetTopicId.startsWith('mixed_')) {
      await dbQuery.run(
        "DELETE FROM app_session WHERE key LIKE ?",
        [`review_questions_topic_${targetTopicId}%`]
      );
      return res.json({ ok: true });
    }

    await dbQuery.run(
      "DELETE FROM app_session WHERE key = ? OR key LIKE ?",
      [`review_questions_topic_${targetTopicId}`, `review_questions_topic_${targetTopicId}_sess_%`]
    );

    const schedules = await dbQuery.all('SELECT id FROM schedules WHERE topic_id = ?', [targetTopicId]);
    if (schedules && schedules.length > 0) {
      for (const s of schedules) {
        await dbQuery.run(
          "DELETE FROM app_session WHERE key = ? OR key LIKE ?",
          [`review_questions_schedule_${s.id}`, `review_questions_schedule_${s.id}_sess_%`]
        );
      }
    }

    const allSchedSessions = await dbQuery.all(
      `SELECT key, value FROM app_session WHERE key LIKE 'review_questions_schedule_%'`
    );
    if (allSchedSessions && allSchedSessions.length > 0) {
      for (const sRow of allSchedSessions) {
        try {
          const parsedVal = JSON.parse(sRow.value);
          if (parsedVal && String(parsedVal.topicId || '') === targetTopicId) {
            await dbQuery.run('DELETE FROM app_session WHERE key = ?', [sRow.key]);
          }
        } catch (err) {}
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/session/review/topic error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/completed-review/:scheduleId -> Get completed review state
router.get('/session/completed-review/:scheduleId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const scheduleId = req.params.scheduleId;
  try {
    await ensureSessionTable();
    const row = await dbQuery.get(
      'SELECT value FROM app_session WHERE key = ?',
      [`completed_review_schedule_${scheduleId}`]
    );
    if (row && row.value) {
      const data = JSON.parse(row.value);
      if (data && Array.isArray(data.questions)) {
        data.questions = data.questions.map(q => healQuizQuestionObject(q));
      }
      res.json({ success: true, data });
    } else {
      res.json({ success: false, error: '해당 복습의 저장된 풀이 기록이 없습니다.' });
    }
  } catch (err) {
    console.error('GET /api/session/completed-review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/completed-review/by-topic/:topicId -> Get last completed review by topic
router.get('/session/completed-review/by-topic/:topicId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const topicId = parseInt(req.params.topicId, 10);
  if (isNaN(topicId)) {
    return res.status(400).json({ error: '유효한 topicId가 아닙니다.' });
  }
  try {
    await ensureSessionTable();
    const schedule = await dbQuery.get(
      `SELECT id FROM schedules WHERE topic_id = ? AND (status = 'completed' OR status = 'failed') ORDER BY completed_at DESC LIMIT 1`,
      [topicId]
    );
    if (schedule) {
      const row = await dbQuery.get(
        'SELECT value FROM app_session WHERE key = ?',
        [`completed_review_schedule_${schedule.id}`]
      );
      if (row && row.value) {
        const data = JSON.parse(row.value);
        if (data && Array.isArray(data.questions)) {
          data.questions = data.questions.map(q => healQuizQuestionObject(q));
        }
        return res.json({ success: true, scheduleId: schedule.id, data });
      }
    }
    res.json({ success: false, error: '해당 토픽의 완료된 복습 기록이 없습니다.' });
  } catch (err) {
    console.error('GET /api/session/completed-review/by-topic error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/last-active-review -> Get last active review session metadata
router.get('/session/last-active-review', async (req, res) => {
  try {
    await ensureSessionTable();
    const row = await dbQuery.get(
      `SELECT key FROM app_session 
       WHERE key LIKE 'review_questions_schedule_%' 
          OR key LIKE 'review_questions_topic_%' 
          OR key LIKE 'completed_review_schedule_%' 
       ORDER BY updated_at DESC LIMIT 1`
    );

    if (!row) {
      return res.json({ success: true, lastActive: null });
    }

    const key = row.key;
    if (key.startsWith('completed_review_schedule_')) {
      const scheduleId = parseInt(key.replace('completed_review_schedule_', ''), 10);
      const sched = await dbQuery.get(
        `SELECT s.id, s.topic_id, s.review_round, t.title, t.keywords, t.pdf_name, t.category 
         FROM schedules s 
         JOIN topics t ON s.topic_id = t.id 
         WHERE s.id = ?`,
        [scheduleId]
      );
      if (sched) {
        return res.json({
          success: true,
          lastActive: {
            topicId: sched.topic_id,
            title: sched.title,
            keywords: sched.keywords || '',
            pdfName: sched.pdf_name || '',
            mode: 'completed',
            scheduleId: sched.id,
            reviewRound: sched.review_round,
            isReadOnly: true,
            isBonus: sched.review_round === 99,
            category: sched.category || '일반'
          }
        });
      }
    } else if (key.startsWith('review_questions_schedule_')) {
      const scheduleId = parseInt(key.replace('review_questions_schedule_', ''), 10);
      const sched = await dbQuery.get(
        `SELECT s.id, s.topic_id, s.review_round, t.title, t.keywords, t.pdf_name, t.category 
         FROM schedules s 
         JOIN topics t ON s.topic_id = t.id 
         WHERE s.id = ?`,
        [scheduleId]
      );
      if (sched) {
        return res.json({
          success: true,
          lastActive: {
            topicId: sched.topic_id,
            title: sched.title,
            keywords: sched.keywords || '',
            pdfName: sched.pdf_name || '',
            mode: 'ai',
            scheduleId: sched.id,
            reviewRound: sched.review_round,
            isReadOnly: false,
            isBonus: sched.review_round === 99,
            category: sched.category || '일반'
          }
        });
      }
    } else if (key.startsWith('review_questions_topic_')) {
      let topicIdRaw = key.replace('review_questions_topic_', '');
      if (topicIdRaw.includes('_sess_')) {
        topicIdRaw = topicIdRaw.split('_sess_')[0];
      }
      if (topicIdRaw.startsWith('mixed_')) {
        return res.json({
          success: true,
          lastActive: {
            topicId: topicIdRaw,
            title: '오늘의 필수 믹스복습 (10제 1세트)',
            keywords: '',
            pdfName: 'mixed.html',
            mode: 'ai',
            scheduleId: `mixed_schedule_${topicIdRaw.replace('mixed_', '')}`,
            reviewRound: 'MIX',
            isReadOnly: false,
            isBonus: false,
            category: '믹스'
          }
        });
      }
      const topicId = parseInt(topicIdRaw, 10);
      const topicObj = await dbQuery.get(`SELECT id, title, keywords, pdf_name, category FROM topics WHERE id = ?`, [topicId]);
      if (topicObj) {
        const sched = await dbQuery.get(`SELECT id, review_round FROM schedules WHERE topic_id = ? AND status = 'pending' LIMIT 1`, [topicId]);
        return res.json({
          success: true,
          lastActive: {
            topicId: topicObj.id,
            title: topicObj.title,
            keywords: topicObj.keywords || '',
            pdfName: topicObj.pdf_name || '',
            mode: 'ai',
            scheduleId: sched ? sched.id : null,
            reviewRound: sched ? sched.review_round : null,
            isReadOnly: false,
            isBonus: sched ? sched.review_round === 99 : false,
            category: topicObj.category || '일반'
          }
        });
      }
    }
    res.json({ success: true, lastActive: null });
  } catch (err) {
    console.error('GET /api/session/last-active-review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/answersheet -> Load answersheet session state
router.get('/session/answersheet', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();
    const rows = await dbQuery.all(
      'SELECT value FROM app_session WHERE key = ?',
      ['answersheet_questions']
    );
    if (rows.length > 0 && rows[0].value) {
      const parsed = JSON.parse(rows[0].value);
      if (parsed && Array.isArray(parsed.questions)) {
        parsed.questions = parsed.questions.map(q => healAnswersheetQuestionObject(q));
      }
      res.json({ data: parsed });
    } else {
      res.json({ data: null });
    }
  } catch (err) {
    console.error('GET /api/session/answersheet error:', err);
    res.json({ data: null });
  }
});

// POST /api/session/answersheet -> Save answersheet session state
router.post('/session/answersheet', async (req, res) => {
  try {
    await ensureSessionTable();
    const { answersheetQuestions } = req.body;
    const healedQuestions = Array.isArray(answersheetQuestions)
      ? answersheetQuestions.map(healAnswersheetQuestionObject)
      : answersheetQuestions;
    const value = JSON.stringify({ answersheetQuestions: healedQuestions });
    await saveSessionValue('answersheet_questions', value);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/answersheet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/session/answersheet/report/:id -> Stream raw PDF/HTML report from answersheet
router.get('/session/answersheet/report/:id', async (req, res) => {
  const reportId = req.params.id;
  const forceDownload = req.query.download === 'true';
  try {
    await ensureAnswersheetReportsTable();
    const reportSql = `SELECT pdf_name, pdf_data, pdf_url FROM answersheet_reports WHERE id = ?`;
    const report = await dbQuery.get(reportSql, [reportId]);
    if (!report) {
      return res.status(404).send('첨부된 PDF/HTML 원본 파일을 찾을 수 없습니다.');
    }

    let pdfData = report.pdf_data;
    if (report.pdf_url && (!pdfData || pdfData.length === 0)) {
      try {
        const response = await fetch(report.pdf_url);
        pdfData = Buffer.from(await response.arrayBuffer());
      } catch (fetchErr) {
        console.error(`Failed to lazy load answersheet buffer: ${report.pdf_url}`, fetchErr);
      }
    }

    if (!pdfData || pdfData.length === 0) {
      return res.status(404).send('첨부된 PDF/HTML 원본 파일을 찾을 수 없습니다.');
    }

    const isHtml = report.pdf_name && (
      report.pdf_name.toLowerCase().endsWith('.html') || 
      report.pdf_name.toLowerCase().endsWith('.htm') || 
      fileUtils.isBufferHtml(pdfData)
    );
    if (isHtml) {
      let htmlContent = fileUtils.decodeHtmlBuffer(pdfData);
      htmlContent = htmlContent.replace(/<script\b[^>]*?src=["']?[^"'>]*?polyfill\.io[^"'>]*?["']?[^>]*?>([\s\S]*?<\/script>)?/gi, '<!-- polyfill removed -->');
      
      const responsiveStyle = `
<style>
html, body {
  background-color: #ffffff !important;
  color: #1e293b !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
  line-height: 1.6 !important;
  margin: 0 !important;
  padding: 24px !important;
  box-sizing: border-box !important;
}
h1, h2, h3, h4, h5, h6, th, strong, b {
  color: #0f172a !important;
}
p, span, td, li, div, section, article {
  color: #334155 !important;
}
a {
  color: #0284c7 !important;
  text-decoration: underline !important;
}
table {
  border-collapse: collapse !important;
  width: 100% !important;
  margin: 20px 0 !important;
  background-color: #ffffff !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 8px !important;
  overflow: hidden !important;
}
th {
  background-color: #f1f5f9 !important;
  color: #0f172a !important;
  font-weight: 700 !important;
  border: 1px solid #cbd5e1 !important;
  padding: 12px 16px !important;
}
td {
  border: 1px solid #e2e8f0 !important;
  padding: 12px 16px !important;
}
div, section, article, form, .container, .page, .wrapper, .section, .WordSection1, #page-container, #sidebar, #content {
  background-color: transparent !important;
  border-color: #e2e8f0 !important;
  box-shadow: none !important;
}
::-webkit-scrollbar {
  width: 8px !important;
  height: 8px !important;
}
::-webkit-scrollbar-track {
  background: #f8fafc !important;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1 !important;
  border-radius: 9999px !important;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8 !important;
}
@media (max-width: 768px) {
  html, body {
    padding: 12px !important;
  }
  div, section, article, form, .container, .page, .wrapper, .section, .WordSection1, #page-container, #sidebar, #content {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin: 0 auto !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
    height: auto !important;
  }
  img, svg, table, pre, code {
    max-width: 100% !important;
    height: auto !important;
  }
  .katex-display, table, pre, code {
    overflow-x: auto !important;
    overflow-y: hidden !important;
    box-sizing: border-box !important;
  }
  .katex-display {
    padding: 0.5em 8px !important;
  }
}
</style>
`;
      htmlContent = htmlContent + responsiveStyle;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(htmlContent);
    } else {
      const fileNameLower = (report.pdf_name || '').toLowerCase();
      let contentType = 'application/pdf';
      if (fileNameLower.endsWith('.png')) {
        contentType = 'image/png';
      } else if (fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg')) {
        contentType = 'image/jpeg';
      } else if (fileNameLower.endsWith('.gif')) {
        contentType = 'image/gif';
      } else if (fileNameLower.endsWith('.webp')) {
        contentType = 'image/webp';
      } else if (fileNameLower.endsWith('.svg')) {
        contentType = 'image/svg+xml';
      }

      res.setHeader('Content-Type', contentType);
      if (forceDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(report.pdf_name)}"`);
      } else {
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(report.pdf_name)}"`);
      }
      res.send(pdfData);
    }
  } catch (error) {
    console.error('Error streaming answersheet report:', error);
    res.status(500).send('서버 오류로 파일을 스트리밍하지 못했습니다.');
  }
});

// POST /api/schedules/bonus/complete -> Complete a weakpoint bonus review
router.post('/schedules/bonus/complete', async (req, res) => {
  const { topicId, score, scheduleId, schedule_id } = req.body;
  const targetScheduleId = scheduleId || schedule_id;
  const today = fileUtils.getLocalDateString();
  const now = new Date().toISOString();

  if (!topicId) {
    return res.status(400).json({ error: '필수 인자 topicId가 누락되었습니다.' });
  }

  try {
    let finalScheduleId = targetScheduleId;
    if (!finalScheduleId) {
      const row = await dbQuery.get(
        `SELECT id FROM schedules WHERE topic_id = ? AND review_round = 99 AND planned_date = ? AND status = 'pending' LIMIT 1`,
        [topicId, today]
      );
      if (row) finalScheduleId = row.id;
    }

    if (!finalScheduleId) {
      const insertRes = await dbQuery.run(
        `INSERT INTO schedules (topic_id, review_round, planned_date, status, completed_at, score) 
         VALUES (?, 99, ?, 'completed', ?, ?)`,
        [topicId, today, now, score || 100]
      );
      finalScheduleId = insertRes.id;
    } else {
      await dbQuery.run(
        `UPDATE schedules SET status = 'completed', completed_at = ?, score = ? WHERE id = ?`,
        [now, score || 100, finalScheduleId]
      );
    }

    res.json({ success: true, scheduleId: finalScheduleId });
  } catch (err) {
    console.error('POST /api/schedules/bonus/complete error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
