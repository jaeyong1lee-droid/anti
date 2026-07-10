import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbQuery } from '../database.js';
import { callLLMWithFailover, analyzeStandardsBeforeTask, saveSessionValue, getTopicText, startBackendProgressTimer, updateProgress } from '../services/aiService.js';
import { healLatexFormulas, healQuizQuestionObject, healAnswersheetQuestionObject, parseLlmJson, LATEX_PROMPT_INSTRUCTIONS } from '../utils/latexUtils.js';
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

const LOCAL_FORMULA_DICTIONARY = [
  {
    keywords: ['C_v', 'm_v', '\\gamma_w', 'u', 'z', 't', '\\partial'],
    title: '테르자기 1차 압밀방정식(Terzaghi 1D Consolidation, $C_v$)',
    concept: '외부 점진/순간 하중 재하 시 시간이 경과함에 따라 과잉간극수압이 상하 배수층을 통해 소산되어 나가는 속도를 규정한 1차원 미분방정식',
    formula: `지배 미분방정식:
$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$

- $C_v$: 압밀계수 ($C_v = \\frac{k}{m_v \\gamma_w}$)
- $u$: 과잉간극수압 (Excess Pore Water Pressure)
- $t$: 압밀 경과 시간 (Time)
- $z$: 점토층 내의 배수 거리 방향 깊이
- $k$: 점토의 투수계수 (Coefficient of Permeability)
- $m_v$: 체적압축계수(체적변화계수) (Coefficient of Volume Compressibility)
- $\\gamma_w$: 물의 단위중량`,
    structure: `- $C_v$: 압밀계수 ($C_v = \\frac{k}{m_v \\gamma_w}$)\n- $u$: 과잉간극수압 (Excess Pore Water Pressure)\n- $t$: 압밀 경과 시간 (Time)\n- $z$: 점토층 내의 배수 거리 방향 깊이\n- $k$: 점토의 투수계수 (Coefficient of Permeability)\n- $m_v$: 체적압축계수(체적변화계수) (Coefficient of Volume Compressibility)\n- $\\gamma_w$: 물의 단위중량`
  },
  {
    keywords: ['q_{ult}', 'N_c', 'N_q', 'N_{\\gamma}', 'c', 'B', 'D_f'],
    title: '테르자기 극한지지력(Terzaghi Ultimate Bearing Capacity, $q_{ult}$)',
    concept: '흙의 전단파괴 형상을 대수나선 등으로 모델화하여 기초 저면 아래 지반이 전단 파괴 없이 지탱할 수 있는 최대 하중 강도 식',
    formula: `Terzaghi 극한 지지력:
$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$

- $q_{ult}$: 극한 지지력
- $c$: 흙의 점착력
- $q$: 기초 저면의 유효상재하중 ($\\gamma D_f$)
- $\\gamma$: 기초 저면 아래 흙의 단위중량
- $B$: 기초의 폭 (단변 길이)
- $N_c, N_q, N_{\\gamma}$: 지반 지지력 계수`,
    structure: `- $q_{ult}$: 극한 지지력\n- $c$: 흙의 점착력\n- $q$: 기초 저면의 유효상재하중 ($\\gamma D_f$)\n- $\\gamma$: 기초 저면 아래 흙의 단위중량\n- $B$: 기초의 폭 (단변 길이)\n- $N_c, N_q, N_{\\gamma}$: 지반 지지력 계수`
  },
  {
    keywords: ['Q', 'RQD', 'J_n', 'J_r', 'J_a', 'J_w', 'SRF'],
    title: '바톤 암반 Q분류(Barton Q-system, $Q$)',
    concept: '암반의 공학적 특성을 6가지 독립된 변수를 통해 정량화하여 터널 1차 지보 설계를 설계하는 지수 공식',
    formula: `암반 등급 Q지수 식:
$$Q = \\frac{RQD}{J_n} \\times \\frac{J_r}{J_a} \\times \\frac{J_w}{SRF}$$

- $Q$: 암반 등급 지수
- $RQD$: 암질지수 (Rock Quality Designation)
- $J_n$: 절리군 수 (Joint set number)
- $J_r$: 절리면 거칠기 계수 (Joint roughness number)
- $J_a$: 절리면 변질 계수 (Joint alteration number)
- $J_w$: 절리수 보정 계수 (Joint water reduction factor)
- $SRF$: 응력 감소 계수 (Stress Reduction Factor)`,
    structure: `- $Q$: 암반 등급 지수\n- $RQD$: 암질지수 (Rock Quality Designation)\n- $J_n$: 절리군 수 (Joint set number)\n- $J_r$: 절리면 거칠기 계수 (Joint roughness number)\n- $J_a$: 절리면 변질 계수 (Joint alteration number)\n- $J_w$: 절리수 보정 계수 (Joint water reduction factor)\n- $SRF$: 응력 감소 계수 (Stress Reduction Factor)`
  },
  {
    keywords: ['H', 'q', 'q_a', '\\tan\\theta'],
    title: '연약지반 샌드매트 최소두께(Sand Mat Minimum Thickness, $H$)',
    concept: '표층 개량 및 연약지반 상부에 무거운 주행성 장비(Trafficability)를 얹기 위한 하중 지지 소요 두께식',
    formula: `샌드매트 최소 두께 식:
$$H = \\sqrt{\\frac{q - q_a}{\\gamma \\tan \\theta}}$$

- $H$: 샌드매트의 소요 최소 두께
- $q$: 포설 장비의 접지압
- $q_a$: 지반의 허용 지지력
- $\\gamma$: 모래의 단위중량
- $\\theta$: 하중 분산각 (일반적으로 $45^\\circ$ 적용)`,
    structure: `- $H$: 샌드매트의 소요 최소 두께\n- $q$: 포설 장비의 접지압\n- $q_a$: 지반의 허용 지지력\n- $\\gamma$: 모래의 단위중량\n- $\\theta$: 하중 분산각 (일반적으로 $45^\\circ$ 적용)`
  },
  {
    keywords: ['r', 'R', '\\alpha', 'sin', '45'],
    title: '슈미트네트 극점반경(Schmidt Net Pole Radius, $r$)',
    concept: '통계적 밀도 보정을 위해 면적 왜곡을 줄인 슈미트 네트(Schmidt Net) 평면 변환 투영식',
    formula: `극점 반경 식:
$$r = \\sqrt{2} R \\sin\\left(45^\\circ - \\frac{\\alpha}{2}\\right)$$

- $r$: 투영원 중심으로부터 극점(Pole)까지의 평면 거리
- $R$: 투영구(Sphere)의 반경
- $\\alpha$: 불연속면의 경사각 (Dip angle)`,
    structure: `- $r$: 투영원 중심으로부터 극점(Pole)까지의 평면 거리\n- $R$: 투영구(Sphere)의 반경\n- $\\alpha$: 불연속면의 경사각 (Dip angle)`
  },
  {
    keywords: ['P', '\\tau_{allow}', 'd', 'L', '\\pi'],
    title: '락볼트 고착력 계산식(Rockbolt Bond Strength, $P$)',
    concept: '인발 하중 재하 시 천공홀 배면의 마찰 부착 면적을 기반으로 볼트 탈락에 지탱하는 한계 고착력 식',
    formula: `락볼트 허용 지지력 식:
$$P = \\pi d L \\tau_{allow}$$

- $P$: 락볼트의 최대 허용 인발 저항력 (인발 하중)
- $d$: 락볼트 천공 구멍의 직경
- $L$: 그라우팅 정착 길이 (고착 영역)
- $\\tau_{allow}$: 지반과 그라우팅재 간의 허용 부착 전단강도`,
    structure: `- $P$: 락볼트의 최대 허용 인발 저항력 (인발 하중)\n- $d$: 락볼트 천공 구멍의 직경\n- $L$: 그라우팅 정착 길이 (고착 영역)\n- $\\tau_{allow}$: 지반과 그라우팅재 간의 허용 부착 전단강도`
  },
  {
    keywords: ['K_a', 'K_p', 'p_a', '\\phi', '\\sin\\phi'],
    title: '랭킹 주동토압계수(Rankine Active Earth Pressure Coefficient, $K_a$)',
    concept: '지반이 인장 변형을 일으켜 한계 주동 소성 평형 상태에 도달할 때 가설 옹벽 배면에 수평으로 밀어내는 토압식',
    formula: `랭킹 주동토압계수 식:
$$K_a = \\tan^2\\left(45^\\circ - \\frac{\\phi}{2}\\right) = \\frac{1 - \\sin\\phi}{1 + \\sin\\phi}$$

- $K_a$: 주동토압 계수
- $K_p$: 수동토압 계수
- $\\phi$: 흙의 내부마찰각
- $p_a$: 주동토압 강도
- $c$: 흙의 점착력
- $\\gamma$: 흙의 단위중량
- $z$: 검토 단면 깊이`,
    structure: `- $K_a$: 주동토압 계수\n- $K_p$: 수동토압 계수\n- $\\phi$: 흙의 내부마찰각\n- $p_a$: 주동토압 강도\n- $c$: 흙의 점착력\n- $\\gamma$: 흙의 단위중량\n- $z$: 검토 단면 깊이`
  },
  {
    keywords: ['C', 'D_f', 'q_{net}'],
    title: '보상기초 보상도(Compensated Foundation Safety Factor, $C$)',
    concept: '구조물 자중을 굴착한 흙의 총 중량으로 완벽히 치환 상쇄하여 순 침하 하중을 Zero로 수렴시키는 평가 공식',
    formula: `보상기초 보상도 식:
$$C = \\frac{\\gamma D_f}{q}$$

- $C$: 보상도 ($C = 1.0$ 이면 완전 보상)
- $\\gamma$: 굴착하여 배출한 흙의 단위중량
- $D_f$: 기초의 굴착 깊이
- $q$: 상부 구조물 총 자중 및 하중 합산값
- $q_{net}$: 지반이 추가로 받는 순하중 ($q_{net} = q - \\gamma D_f$)`,
    structure: `- $C$: 보상도 ($C = 1.0$ 이면 완전 보상)\n- $\\gamma$: 굴착하여 배출한 흙의 단위중량\n- $D_f$: 기초의 굴착 깊이\n- $q$: 상부 구조물 총 자중 및 하중 합산값\n- $q_{net}$: 지반이 추가로 받는 순하중 ($q_{net} = q - \\gamma D_f$)`
  },
  {
    keywords: ['p_w', '\\gamma_w', 'H'],
    title: '싱글쉘 터널 설계수압(Single Shell Tunnel Design Water Pressure, $p_w$)',
    concept: '방수가 완벽히 차단된 비배수 터널 아치 배면에 상부 수위 높이에 비례하여 수직으로 가해지는 정수압식',
    formula: `설계수압 식:
$$p_w = \\gamma_w H$$

- $p_w$: 라이닝 배면 작용 설계 수압
- $\\gamma_w$: 지하수(물)의 단위중량 ($9.81\\,\\text{kN/m}^3$)
- $H$: 설계 지하수위 면으로부터 터널 아치 정상까지의 수직 거리 (수두 높이)`,
    structure: `- $p_w$: 라이닝 배면 작용 설계 수압\n- $\\gamma_w$: 지하수(물)의 단위중량 ($9.81\\,\\text{kN/m}^3$)\n- $H$: 설계 지하수위 면으로부터 터널 아치 정상까지의 수직 거리 (수두 높이)`
  },
  {
    keywords: ['k_h', 'k_{h0}', 'B_H', 'E_0', 'N', '2800'],
    title: '가설흙막이 수평지반반력계수(Temporary Retaining Wall Horizontal Subgrade Reaction Coefficient, $k_h$)',
    concept: '벽체 배면의 지반 탄소성 반응을 등가의 선형 탄성 연속 압축 스프링 강성값으로 치환하는 반력 산정식',
    formula: `수평 지반반력계수 식:
$$k_h = k_{h0} \\left(\\frac{B_H}{0.3}\\right)^{-3/4}$$

- $k_h$: 설계 수평 지반반력계수 (탄성 스프링 상수)
- $k_{h0}$: 표준 수평 지반반력계수
- $B_H$: 가상의 기초 환산폭
- $E_0$: 지반의 탄성계수 ($E_0 = 2800 N$)
- $N$: 표준관입시험 N치`,
    structure: `- $k_h$: 설계 수평 지반반력계수 (탄성 스프링 상수)\n- $k_{h0}$: 표준 수평 지반반력계수\n- $B_H$: 가상의 기초 환산폭\n- $E_0$: 지반의 탄성계수 ($E_0 = 2800 N$)\n- $N$: 표준관입시험 N치`
  }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractJsonArray(str) {
  if (!str) return null;
  const startIdx = str.indexOf('[');
  const endIdx = str.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonSub = str.substring(startIdx, endIdx + 1);
    try {
      return parseLlmJson(jsonSub);
    } catch (e) {
      console.warn('Failed parsing extracted JSON substring via extractJsonArray.');
      throw e;
    }
  }
  return null;
}

async function validateAndHealQuestion(question, callLLMWithFailover, topicTitle = '', topicKeywords = '', fileText = '') {
  if (question && typeof question === 'object') {
    if (!question.validationLogs) {
      question.validationLogs = [];
    }
    question.validationLogs.push(`[자가 검증 스킵] 검증 기능 및 validationPlugin 파일이 물리적으로 삭제되어 작동하지 않습니다.`);
  }
  return question;
}

// POST /api/exam/all
router.post('/exam/all', async (req, res) => {
  const progressId = req.query.progressId || req.body.progressId;
  let standardsAnalysis = '';
  if (progressId) {
    standardsAnalysis = await analyzeStandardsBeforeTask(progressId, '종합평가 시험 출제', GENERATION_STANDARDS, 'generation');
  }
  try {
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) return res.status(400).json({ error: '등록된 AI API 키가 존재하지 않습니다.' });

    // Fetch all topics with extracted_text (fallback to pdf_data if empty)
    const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name, extracted_text, (CASE WHEN extracted_text IS NULL OR extracted_text = '' THEN pdf_data ELSE NULL END) AS pdf_data FROM topics ORDER BY created_at DESC`);
    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: '등록된 토픽이 없습니다. 먼저 학습 자료를 등록해주세요.' });
    }

    const topicTextMap = {};
    // Extract text from each topic in parallel to avoid timeouts
    const topicTexts = await Promise.all(topics.map(async (topic) => {
      let fileText = '';
      if (topic.extracted_text) {
        fileText = topic.extracted_text;
      } else if (topic.pdf_data) {
        const isHtml = topic.pdf_name && (
          topic.pdf_name.toLowerCase().endsWith('.html') ||
          topic.pdf_name.toLowerCase().endsWith('.htm') ||
          fileUtils.isBufferHtml(topic.pdf_data)
        );
        try {
          if (isHtml) {
            fileText = fileUtils.htmlToPlainText(fileUtils.decodeHtmlBuffer(topic.pdf_data));
          } else {
            const parsed = await pdfParse(topic.pdf_data);
            fileText = parsed.text || '';
          }
        } catch (e) {
          console.warn(`Topic ${topic.id} parse error:`, e.message);
        }
        fileText = fileUtils.mergeVerticalText(fileText);
      }
      fileText = fileUtils.smartTruncate(fileText, 10000);
      topicTextMap[topic.id] = fileText;
      return `<Topic id="${topic.id}" title="${topic.title}" keywords="${topic.keywords || '없음'}">\n${fileText || '소스 없음'}\n</Topic>`;
    }));

    const combinedText = topicTexts.join('\n\n---\n\n');
    const topicTitles = topics.map(t => t.title).join(', ');

    // Fetch all user feedbacks (upvoted / downvoted) to adjust frequency in exam prompt
    let feedbackPrompt = '';
    try {
      const feedbacks = await dbQuery.all(
        `SELECT t.title, qf.question_text, qf.feedback_type 
         FROM question_feedback qf 
         JOIN topics t ON qf.topic_id = t.id`
      );
      if (feedbacks.length > 0) {
        const upvotes = feedbacks.filter(f => f.feedback_type === 'upvote');
        const downvotes = feedbacks.filter(f => f.feedback_type === 'downvote');
        
        feedbackPrompt = `
[사용자 피드백 지침 - 출제 빈도 조정에 반영 필수]:
- 아래 질문들과 연관된 주제/개념의 문제를 적극 출제해 주십시오 (출제 빈도 증가 대상):
${upvotes.map((f, idx) => `  * [토픽: ${f.title}] ${f.question_text}`).join('\n')}

- 아래 질문들과 동일하거나 유사한 문제는 절대 출제하지 말고 출제 빈도를 대폭 낮추거나 다른 문제로 대체해 주십시오 (출제 빈도 감소/제외 대상):
${downvotes.map((f, idx) => `  * [토픽: ${f.title}] ${f.question_text}`).join('\n')}
`;
      }
    } catch (fbErr) {
      console.warn('종합평가 피드백 로드 실패 (무시하고 진행):', fbErr);
    }

    let adjustmentsPrompt = '';
    try {
      const adjustments = await dbQuery.all(
        `SELECT t.title, qa.question_text, qa.adjusted_text, qa.user_feedback 
         FROM question_adjustments qa 
         JOIN topics t ON qa.topic_id = t.id 
         ORDER BY qa.created_at DESC LIMIT 15`
      );
      if (adjustments.length > 0) {
        adjustmentsPrompt = `
[사용자 이전 문제 조정(피드백) 내역 - 출제 시 반드시 참고하여 반영하십시오]:
사용자가 이전에 종합평가/복습 시 문제를 다음과 같이 조정 요청하여 반영된 이력이 있습니다. 향후 출제 시 아래 피드백 경향을 분석하여 반영해 주십시오:
${adjustments.map((a, idx) => `
조정 이력 ${idx + 1} [토픽: ${a.title}]:
- 기존 문제: "${a.question_text}"
- 사용자의 피드백 요구사항: "${a.user_feedback}"
- 반영된 최종 문제: "${a.adjusted_text}"
`).join('\n')}
`;
      }
    } catch (adjErr) {
      console.warn('종합평가 문제 조정 이력 로드 실패:', adjErr);
    }

    // Collect past questions from app_session
    let pastQuestionsPool = [];
    try {
      await ensureSessionTable();
      const sessionRows = await dbQuery.all(
        `SELECT value FROM app_session 
         WHERE key LIKE 'review_questions_schedule_%' 
            OR key LIKE 'review_questions_topic_%' 
            OR key LIKE 'completed_review_schedule_%'`
      );
      for (const row of sessionRows) {
        if (row.value) {
          try {
            const parsed = JSON.parse(row.value);
            const qs = parsed.questions || parsed.examQuestions || (Array.isArray(parsed) ? parsed : []);
            if (Array.isArray(qs)) {
              for (const q of qs) {
                if (q && q.question) {
                  pastQuestionsPool.push(q);
                }
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
      console.log(`[종합평가] 수집된 기존 복습 문항 수: ${pastQuestionsPool.length}개`);
    } catch (dbErr) {
      console.warn('[종합평가] 기존 문항 로드 실패:', dbErr);
    }

    const uniqueQuestionsMap = new Map();
    for (const q of pastQuestionsPool) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        uniqueQuestionsMap.set(cleanedText, q);
      }
    }
    const uniquePastQuestions = Array.from(uniqueQuestionsMap.values());
    console.log(`[종합평가] 중복 제거 후 고유 기존 복습 문항 수: ${uniquePastQuestions.length}개`);

    // Collect local fallback questions for all topics
    let fallbackQuestionsPool = [];
    try {
      for (const t of topics) {
        let topicText = '';
        if (t.pdf_data) {
          try {
            const isHtml = t.pdf_name && (
              t.pdf_name.toLowerCase().endsWith('.html') ||
              t.pdf_name.toLowerCase().endsWith('.htm') ||
              fileUtils.isBufferHtml(t.pdf_data)
            );
            if (isHtml) {
              topicText = fileUtils.htmlToPlainText(fileUtils.decodeHtmlBuffer(t.pdf_data));
            } else {
              const parsed = await pdfParse(t.pdf_data);
              topicText = parsed.text || '';
            }
          } catch (e) {
            // Ignore parse errors
          }
          topicText = fileUtils.mergeVerticalText(topicText);
        }
        const fallbackQs = generateFallbackQuestions(t.title, t.keywords, topicText);
        if (Array.isArray(fallbackQs)) {
          fallbackQuestionsPool.push(...fallbackQs);
        }
      }
      console.log(`[종합평가] 로컬 생성 예비 문항 수: ${fallbackQuestionsPool.length}개`);
    } catch (fallbackErr) {
      console.warn('[종합평가] 로컬 예비 문항 생성 실패:', fallbackErr);
    }

    // Generate 15 new AI questions in parallel (3 batches of 5)
    let aggregatedAiQuestions = [];
    const TOTAL_BATCHES = 3;
    console.log(`[종합평가 병렬 생성 가동] TPM 초과 방지를 위해 5문제씩 총 ${TOTAL_BATCHES}회 병렬 요청을 시작합니다.`);

    const batchPromises = Array.from({ length: TOTAL_BATCHES }).map(async (_, idx) => {
      const randomSeed = Math.floor(Math.random() * 10000);
      const batchPrompt = `
당신은 국가기술자격 기술사 시험 출제위원입니다.
아래 범위 토픽 소스 자료를 참고하여, 다른 문제들과 절대 중복되지 않는 고난도 종합평가 문제 **정확히 5개**를 생성하십시오.
(현재 분할 출제 회차: ${idx + 1} / ${TOTAL_BATCHES}, 랜덤 시드: ${randomSeed})

🚨 [출제 출처 한정 및 문맥 격리 규칙 (Topic Isolation) - 극도로 중요!]:
1. 반드시 아래 제공된 **[평가 범위 토픽 목록]** 및 **[통합 소스 텍스트]**의 각 '<Topic>...</Topic>' 태그에 직접 기술되어 있는 구체적인 개념, 공식, 이론 및 지식의 범위 안에서만 시험 문제를 생성하십시오.
2. 각 문제를 출제할 때 해당 문제의 출처가 되는 단 하나의 토픽의 범위로 한정하여 문제를 구성하십시오. 절대 특정 토픽에 관한 문제를 낼 때 다른 토픽에 적힌 단어, 수치, 공학적 조건이나 공식들을 혼합(Cross-contamination)하여 보기(options)나 지문을 만드는 '문맥 교차 오염'을 저지르지 마십시오. 각 문제는 소스 상의 독립된 개별 토픽 내용에 완전히 부합해야 합니다.
3. 제공된 소스 자료 텍스트에 **직접 등장하지 않는 외부의 타 공학/역학 이론이나 일반 상식(예: 지문에 직접 기재되지 않은 동역학, 구조역학, 진동학, 임계감쇠, 단자유도 시스템, 고유진동수, 또는 그 외 외부 임의 주제 등)은 절대로 지문에 주입하거나 날조하여 문제를 만들지 마십시오.**
4. 오직 제공된 소스 본문 텍스트 내에 **단어 및 수식으로 명시되어 있는 범위 내로만 출제 범위를 100% 철저히 한정**하십시오. 소스에 없는 타분야 내용을 엮거나 상상하여 문제를 구성할 경우 심각한 출제 오류로 간주됩니다.
5. 객관식 모든 보기(options) 및 해설 역시 오직 소스 문서 내용의 문장과 지식들을 변형/결합하여 만들어야 하며, 본문과 아예 무관한 엉뚱한 외부 용어나 가상의 기술적 지식을 보기에 혼합하는 것을 절대 금지합니다.

[평가 범위 토픽 목록]: ${topicTitles}
[통합 소스 텍스트]:
${combinedText}

${feedbackPrompt}

${adjustmentsPrompt}

[출제 규칙]:
1. 이번 회차에서는 **정확히 5개의 문제**만 반환하되 다음 유형별로 각각 정확히 1문제씩 골고루 구성하여 비율을 사수하십시오:
   - 주관식 (type: "주관식", subtype: "개요"): 1문제 (정의 및 특징을 3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명 모범답안)
   - 주관식 (type: "주관식", subtype: "공식"): 1문제 (해당 토픽의 대표적인 공학적 수식 및 물리적 관계식을 제시하고 수식을 구성하는 기호들의 정의를 나열하는 공식 문제)
   - 주관식 (type: "주관식", subtype: "표채우기"): 1문제 (비교 대상이 없는 단일 토픽은 '상태/단계 비교' 또는 '1행(Single-row) 테이블'로 구성하여 동일 열 내 답안 중복을 철저히 배제하고, 아래 "tableData" 필드에 <table> 태그 대신 표 데이터 객체 구조를 채워넣는 칸채우기 주관식 문제)
   - 주관식 (type: "주관식", subtype: "단답형"): 1문제 (구체적인 실무 문제점/시나리오를 질문으로 제시하고 핵심 키워드 강조가 들어간 1줄 서술형 모범답안으로 답하는 단답형 문제)
   - 객관식 (type: "객관식"): 1문제 (4지선다형 객관식 문제)
2. 객관식 문제의 유형 및 구성 비율 지침 (극도로 중요):
   - 출제되는 객관식 문항들은 반드시 아래 비율을 준수하여 구성하십시오:
     * **기본 기초 개념 문제 (40%, 약 2문제)**: 토픽의 기본 정의, 핵심 개념, 기초 원리를 직접적으로 묻는 기초 수준 문제. (예: "○○○의 정의로 가장 옳은 것은?", "○○○의 특징이 아닌 것은?"). 기사 수준의 핵심 개념 확인 문제로 출제.
     * **정량 계산 문제 (30%, 약 1문제)**: 구체적인 조건 수치를 대입하여 최종 값을 계산해내거나 정량 결과를 묻는 수치 계산 문제.
     * **심화 원리·비교 문제 (30%, 약 1문제)**: 공학적 메커니즘, 장단점, 비교, 실무 시공 유의사항 등 응용 이해형 문제.
   
   - **🚨 [공식 및 공식 수치 범위 노출 절대 금지 규칙 - 극도로 중요!]**: 문제 질문(question) 본문 내에 **문제를 해결하는 데 필요한 공학 수식 자체(예: $E_u = 300 s_u$ 등)나 수식의 특정 수치 범위(예: $E_u = (200 \\sim 500)s_u$ 등), 비례 관계 식 등을 절대로 직접 텍스트로 적어 제공하지 마십시오.** 수식이나 경험적 수치 범위를 지문에 미리 주면 학생의 암기 및 연상 능력을 평가할 수 없습니다. 대신 공식의 명칭("비배수 탄성계수 경험식")이나 변수들의 명칭("비배수 전단강도 $s_u$")만을 제시하고, 학생이 스스로 공식과 범위를 떠올려서 해결하도록 하십시오. (단, 해설(explanation)에서는 학생의 학습을 위해 공식을 상세히 명시하고 계산 과정을 설명해야 합니다.)
   - 특히 **수치 해석법이나 가설 구조물 해석과 같이 정량적 분석이 필요한 토픽의 경우, 제공된 소스 문서 내에 명시적인 수치나 파라미터가 존재한다면 이를 활용하여 정량 계산 문제를 구성하십시오. 단, 문서에 수치나 수식이 없다면 임의로 비현실적인 수치를 가상 부여하지 마십시오.**
   - 만약 전형적인 비계산형/정성적 토픽(예: 단순 품질 시험 절차, 단순 행정 제도 등)인 경우에만 일반적인 서술형/이해형 객관식 문제로 출제하되, 이 경우에도 가급적 물리적 변수의 영향도를 묻는 등 최대한 정량화에 가깝게 문제의 수준을 높여 출제하십시오.
   - **⚠️ [비교/특성 표 출제 규칙 - 극도로 중요!]**: 질문에 비교/특성 표가 필요한 경우, 절대 <table> 등 HTML 태그로 표를 직접 작성하지 말고 일반 텍스트로만 질문을 작성한 뒤 아래의 "tableData" 필드에 표 데이터를 객체 구조로 작성하십시오.
3. 오답 보기 구성 주의사항 (매우 중요):
   - 오답 보기(options) 구성 시 **절대로 터무니없거나 극단적인 표현, 혹은 비현실적인 공학적 가정(예: '무한대로 상승시킴', '실시간으로 기하급수적으로 증가함', '영원히 변하지 않음', '아예 발생하지 않음', '폭발함' 등)은 절대로 사용하지 마십시오**. 
   - 실제 전공 서적이나 실무 기술 기준에 부합하는 **고도로 타당성 있고 그럴듯한 오답(plausible engineering distractors)**으로 구성해 주십시오. 모든 보기는 반드시 원본 소스 및 공학적 상식선에 긴밀히 결합되어야 합니다.
- **🚨 [객관식 정밀성 및 정답 일치 조건 - 극도로 중요!]**: 모든 객관식(4지선다형) 계산 문제나 수치/공학적 판단 문제를 출제할 때, 계산으로 도출된 정확한 정답 수치나 조건이 4개의 보기(options) 중 반드시 정확히 1개로 존재해야 합니다. 절대로 실제 계산 결과와 보기의 수치가 불일치하여, 해설에서 '실제 계산값은 XX이나 보기 중 가장 가까운 YY를 선택합니다'와 같은 어처구니없는 변명을 적는 출제 오류를 범하지 마십시오. 문제를 생성하기 전에 실제 수식을 대입하여 정답을 한 번 더 직접 엄밀하게 계산하고 검증한 후, 그 결과값(토씨 하나 틀리지 않는 정확한 정답)을 보기와 'answer' 필드에 완벽히 일치하도록 기재하십시오.
    4. 소스 텍스트의 숨겨진 공학적 개념과 실무 기전을 포착하여 고품격 질문을 던지십시오.

[환각 방지 철칙 (Anti-Hallucination Constraints)]:
1. 제공된 소스 문서 텍스트(<Source_Document>) 내에 명시적 수치, 허용 안전율, 설계기준(KDS/KCS) 조항 번호나 공식이 없는 경우, 임의로 수식을 유도하거나 외부 시방서 수치 한계를 날조(Hallucination)하지 마십시오.
2. 문서 범위를 벗어나는 역학적 수치나 비물리적 수치(예: 내부마찰각 60도 이상 등)를 창작하여 모순을 발생시키면 안 됩니다. 수치가 부족하다면 정량 계산 문제 출제를 즉시 우회하고 개념 이해형 문제로 대체하십시오.

${LATEX_PROMPT_INSTRUCTIONS}
${GENERATION_STANDARDS}
${ENGINEERING_STANDARDS}
4. 반드시 추가 텍스트 없이 순수 JSON 배열만 반환하십시오.

[JSON 포맷]:
[
  {
    "type": "주관식",
    "subtype": "개요",
    "topic_title": "이 문제의 출제 근거가 되는 토픽 목록 내의 정확한 토픽명 (예: 평사투영법)",
    "question": "질문 내용",
    "answer": "3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명 모범답안",
    "concept": "핵심 개념 1줄 요약"
  },
  {
    "type": "객관식",
    "topic_title": "이 문제의 출제 근거가 되는 토픽 목록 내의 정확한 토픽명 (예: 락볼트 인발시험)",
    "question": "공학적 현상 분석 질문",
    "tableData": null,
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "answer": "정답 보기와 토씨 하나 틀리지 않는 정답 텍스트",
    "explanation": "이유와 오답 정밀 해설"
  }
] (※ 만약 표가 필요한 질문이라면 "tableData": {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적 환경", "해수", "담수"]]} 처럼 구조화된 표 객체를 작성하고, 그렇지 않은 일반 질문이면 "tableData": null 로 설정하십시오.)
`;
      try {
        console.log(`[종합평가 병렬 생성] #${idx + 1}번째 배치 전송 시작...`);
        const enrichedPrompt = `[🚨 0단계 AI가 사전 분석한 절대 지침 준수 주의사항]:\n${standardsAnalysis}\n\n${batchPrompt}`;
        const rawText = await callLLMWithFailover(null, enrichedPrompt, null, 'question');
        let text = rawText.trim();
        if (text.startsWith('```')) {
          text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }
        let parsedList = null;
        try {
          parsedList = parseLlmJson(text);
        } catch {
          parsedList = extractJsonArray(rawText);
        }
        if (parsedList && Array.isArray(parsedList)) {
          return parsedList;
        }
      } catch (err) {
        console.warn(`[종합평가 병렬 생성 실패] #${idx + 1}번째 배치 에러:`, err.message);
      }
      return [];
    });

    const results = await Promise.all(batchPromises);
    for (const r of results) {
      if (r) aggregatedAiQuestions.push(...r);
    }
    console.log(`[종합평가 병렬 생성 완료] AI 신규 문항 수: ${aggregatedAiQuestions.length}개`);

    // Merge all pools (AI questions, unique past study questions, fallback questions)
    const uniquePoolMap = new Map();
    // Priority 1: Newly generated AI questions
    for (const q of aggregatedAiQuestions) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        uniquePoolMap.set(cleanedText, q);
      }
    }
    // Priority 2: Past study questions from DB sessions
    for (const q of uniquePastQuestions) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        if (!uniquePoolMap.has(cleanedText)) {
          uniquePoolMap.set(cleanedText, q);
        }
      }
    }
    // Priority 3: Local fallback questions
    for (const q of fallbackQuestionsPool) {
      if (q && q.question) {
        const cleanedText = q.question.replace(/\s+/g, ' ').trim();
        if (!uniquePoolMap.has(cleanedText)) {
          uniquePoolMap.set(cleanedText, q);
        }
      }
    }

    const finalQuestionPool = Array.from(uniquePoolMap.values());
    console.log(`[종합평가 풀 구축 완료] 전체 후보 풀 문항 수: ${finalQuestionPool.length}개`);

    // Select up to 60 questions from the pool with exact type combination:
    // - 개요: 10개
    // - 공식: 10개
    // - 표채우기: 10개
    // - 단답형: 10개
    // - 객관식: 20개
    const poolGaeyo = [];
    const poolGongsik = [];
    const poolTable = [];
    const poolDandap = [];
    const poolMC = [];

    for (const q of finalQuestionPool) {
      if (q.type === '주관식') {
        if (q.subtype === '개요') poolGaeyo.push(q);
        else if (q.subtype === '공식') poolGongsik.push(q);
        else if (q.subtype === '표채우기') poolTable.push(q);
        else if (q.subtype === '단답형' || !q.subtype) poolDandap.push(q);
      } else if (q.type === '객관식') {
        poolMC.push(q);
      }
    }

    console.log(`[종합평가 분류] 개요: ${poolGaeyo.length}, 공식: ${poolGongsik.length}, 표채우기: ${poolTable.length}, 단답형: ${poolDandap.length}, 객관식: ${poolMC.length}`);

    const shuffleArray = (arr) => [...arr].sort(() => 0.5 - Math.random());
    const shufGaeyo = shuffleArray(poolGaeyo);
    const shufGongsik = shuffleArray(poolGongsik);
    const shufTable = shuffleArray(poolTable);
    const shufDandap = shuffleArray(poolDandap);
    const shufMC = shuffleArray(poolMC);

    const selectedQuestions = [];
    const take = (arr, n) => {
      const result = arr.slice(0, n);
      arr.splice(0, n);
      return result;
    };

    selectedQuestions.push(...take(shufGaeyo, 10));
    selectedQuestions.push(...take(shufGongsik, 10));
    selectedQuestions.push(...take(shufTable, 10));
    selectedQuestions.push(...take(shufDandap, 10));
    selectedQuestions.push(...take(shufMC, 20));

    // If total selected is less than 60, fill from remaining questions in other pools
    const remainingPool = [...shufGaeyo, ...shufGongsik, ...shufTable, ...shufDandap, ...shufMC];
    const shufRemaining = shuffleArray(remainingPool);
    const needed = Math.max(0, 60 - selectedQuestions.length);
    selectedQuestions.push(...take(shufRemaining, needed));

    console.log(`[종합평가 선택 완료] 최종 선택 문항 수: ${selectedQuestions.length}개`);

    // Clean selected questions & Map topic_title to topic_id
    const topicMap = {};
    topics.forEach(t => {
      topicMap[t.title.toLowerCase().trim()] = t.id;
    });

    const cleanedQuestions = selectedQuestions.map(q => {
      let topicId = q.topic_id || null;
      if (q.topic_title) {
        const cleanedTitle = q.topic_title.toLowerCase().trim();
        if (topicMap[cleanedTitle]) {
          topicId = topicMap[cleanedTitle];
        } else {
          const matchedKey = Object.keys(topicMap).find(k => k.includes(cleanedTitle) || cleanedTitle.includes(k));
          if (matchedKey) topicId = topicMap[matchedKey];
        }
      }
      if (!topicId && topics.length > 0) {
        // Try to guess from question text
        const matchedTopic = topics.find(t => q.question.includes(t.title) || (t.keywords && t.keywords.split(',').some(k => q.question.includes(k.trim()))));
        topicId = matchedTopic ? matchedTopic.id : topics[Math.floor(Math.random() * topics.length)].id;
      }
      return {
        type: q.type || "객관식",
        subtype: q.subtype || null,
        question: cleanQuizQuestion(q.question),
        tableData: q.tableData || null,
        options: q.options || [],
        answer: q.answer,
        explanation: q.explanation || '',
        concept: q.concept || '',
        topic_id: topicId
      };
    });

    // Retrieve custom formula questions from database
    let customFormulas = [];
    try {
      await ensureSessionTable();
      const formulaRows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['formula_questions']);
      if (formulaRows.length > 0 && formulaRows[0].value) {
        const parsed = JSON.parse(formulaRows[0].value);
        if (Array.isArray(parsed.formulaQuestions)) {
          customFormulas = parsed.formulaQuestions.filter(q => q && !q.isNewEmptyCard && (q.title || q.formula));
        }
      }
    } catch (dbErr) {
      console.warn('Error reading formula sessions for comprehensive exam:', dbErr);
    }

    // If database is empty, load defaults so that the user always has them
    if (customFormulas.length === 0) {
      customFormulas = LOCAL_FORMULA_DICTIONARY.map(d => ({
        title: d.title,
        formula: d.formula || d.structure || '',
        concept: d.concept || ''
      }));
    }

    // Shuffle and select up to 10 formula questions
    const shuffledFormulas = [...customFormulas].sort(() => 0.5 - Math.random());
    
    const selectedFormulas = shuffledFormulas.slice(0, 10).map(f => {
      const matchedTopic = topics.find(t => f.title && (t.title.includes(f.title) || f.title.includes(t.title)));
      return {
        type: "주관식",
        subtype: "공식",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[필수공식] ${f.title || f.question || '공식'} 공식을 제시하고, 각 기호의 정의를 서술하시오.`,
        answer: f.formula,
        concept: f.concept
      };
    });

    const customSubjs = [...selectedFormulas];

    // Merge local DB core 10 questions + split mined AI questions
    const finalQuestions = [...customSubjs, ...cleanedQuestions];

    const healedFinalQuestions = finalQuestions.map(q => healQuizQuestionObject(q));
    const validatedFinalQuestions = await Promise.all(
      healedFinalQuestions.map(async (q) => {
        const matchedTopic = topics.find(t => t.id === Number(q.topic_id));
        const title = matchedTopic ? matchedTopic.title : '';
        const keywords = matchedTopic ? matchedTopic.keywords : '';
        const text = matchedTopic ? (topicTextMap[matchedTopic.id] || '') : '';
        const res = await validateAndHealQuestion(q, callLLMWithFailover, title, keywords, text);
        return healQuizQuestionObject(res);
      })
    );
    res.json({ questions: validatedFinalQuestions, total: validatedFinalQuestions.length, topicCount: topics.length });

  } catch (err) {
    console.error('Exam route error:', err);
    res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
});

// POST /api/exam/additional
router.post('/exam/additional', async (req, res) => {
  try {
    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );
    if (!hasAnyAiKey) return res.status(400).json({ error: '등록된 AI API 키가 존재하지 않습니다.' });

    // Fetch all topics with extracted_text (fallback to pdf_data if empty)
    const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name, extracted_text, (CASE WHEN extracted_text IS NULL OR extracted_text = '' THEN pdf_data ELSE NULL END) AS pdf_data FROM topics ORDER BY created_at DESC`);
    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: '등록된 토픽이 없습니다. 먼저 학습 자료를 등록해주세요.' });
    }

    const topicTextMap = {};
    // Extract text from each topic in parallel to avoid timeouts
    const topicTexts = await Promise.all(topics.map(async (topic) => {
      let fileText = '';
      if (topic.extracted_text) {
        fileText = topic.extracted_text;
      } else if (topic.pdf_data) {
        const isHtml = topic.pdf_name && (
          topic.pdf_name.toLowerCase().endsWith('.html') ||
          topic.pdf_name.toLowerCase().endsWith('.htm') ||
          fileUtils.isBufferHtml(topic.pdf_data)
        );
        try {
          if (isHtml) {
            fileText = fileUtils.htmlToPlainText(fileUtils.decodeHtmlBuffer(topic.pdf_data));
          } else {
            const parsed = await pdfParse(topic.pdf_data);
            fileText = parsed.text || '';
          }
        } catch (e) {
          console.warn(`Topic ${topic.id} parse error:`, e.message);
        }
        fileText = fileUtils.mergeVerticalText(fileText);
      }
      fileText = fileUtils.smartTruncate(fileText, 10000);
      topicTextMap[topic.id] = fileText;
      return `<Topic id="${topic.id}" title="${topic.title}" keywords="${topic.keywords || '없음'}">\n${fileText || '소스 없음'}\n</Topic>`;
    }));

    const combinedText = topicTexts.join('\n\n---\n\n');
    const topicTitles = topics.map(t => t.title).join(', ');

    // Retrieve custom formula questions from database
    let customFormulas = [];
    try {
      await ensureSessionTable();
      const formulaRows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['formula_questions']);
      if (formulaRows.length > 0 && formulaRows[0].value) {
        const parsed = JSON.parse(formulaRows[0].value);
        if (Array.isArray(parsed.formulaQuestions)) {
          customFormulas = parsed.formulaQuestions.filter(q => q && !q.isNewEmptyCard && (q.title || q.formula));
        }
      }
    } catch (dbErr) {
      console.warn('Error reading formula sessions for comprehensive exam refresh:', dbErr);
    }

    // Load defaults if empty, exactly like /api/exam/all
    if (customFormulas.length === 0) {
      customFormulas = LOCAL_FORMULA_DICTIONARY.map(d => ({
        title: d.title,
        formula: d.formula || d.structure || '',
        concept: d.concept || ''
      }));
    }

    let customTheories = [];
    try {
      await ensureSessionTable();
      const theoryRows = await dbQuery.all('SELECT value FROM app_session WHERE key = ?', ['theory_questions']);
      if (theoryRows.length > 0 && theoryRows[0].value) {
        const parsed = JSON.parse(theoryRows[0].value);
        if (Array.isArray(parsed.theoryQuestions)) {
          customTheories = parsed.theoryQuestions.filter(q => q && !q.isNewEmptyCard && (q.title || q.formula));
        }
      }
    } catch (dbErr) {
      console.warn('Error reading theory sessions for comprehensive exam refresh:', dbErr);
    }

    if (customTheories.length === 0) {
      customTheories = [
        {
          title: "Terzaghi 1차원 압밀 지배방정식 유도",
          concept: "점토층 내 과잉간극수압의 소산 및 침하 시간적 추이를 물리적으로 정밀 묘사하는 지배방정식",
          formula: "지배 미분방정식:\n$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$\n\n[주요 유도 가정]:\n1. 흙입자와 물은 압축성이 없음(비압축성)\n2. 흙 속 물의 흐름은 Darcy 법칙을 따름 ($v = k i$)\n3. 압밀은 1차원으로만 진행되며 흙의 공극비 변화는 유효응력 증가에 선형 비례함 ($a_v$ 일정)"
        },
        {
          title: "Terzaghi 얕은기초 극한지지력 공식의 유도",
          concept: "기초 저면 아래 지반의 전단 전파 거동(일반 전단 파괴)을 극한 상태 한계 평형으로 수치화한 지지력 공식",
          formula: "Terzaghi 극한 지지력:\n$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$\n\n[유도 메커니즘]:\n- 지반 파괴 영역을 3개 zone(Zone I: 탄성 쐐기, Zone II: 대수나선 방사형 전단 영역, Zone III: Rankine 수동 수평 지반 영역)으로 분할하여 상부 하중 벡터와 전단 저항 한계선 결합"
        },
        {
          title: "Rankine 주동토압 공식의 이론적 유도",
          concept: "지반이 가설 벽체 배면 방향으로 팽창 변형을 일으켜 한계 인장 소성 상태에 도달할 때의 수평 응력",
          formula: "주동토압 강도 식:\n$$p_a = \\gamma z K_a - 2 c \\sqrt{K_a}$$\n\n[주요 유도 공식]:\n- Mohr-Coulomb 파괴 포락선과 Mohr 응력원의 접점 기하학적 분석을 통하여 $K_a = \\tan^2(45^\\circ - \\phi/2)$ 수식 도출"
        }
      ];
    }

    // Select 1 formula and 1 theory randomly
    const shuffledFormulas = [...customFormulas].sort(() => 0.5 - Math.random());
    const shuffledTheories = [...customTheories].sort(() => 0.5 - Math.random());

    const selectedFormula = shuffledFormulas.slice(0, 1).map(f => {
      const matchedTopic = topics.find(t => f.title && (t.title.includes(f.title) || f.title.includes(t.title)));
      return {
        type: "주관식",
        subtype: "공식",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[필수공식] ${f.title || f.question || '공식'} 공식을 제시하고, 각 기호의 정의를 서술하시오.`,
        answer: f.formula,
        concept: f.concept
      };
    });

    const selectedTheory = shuffledTheories.slice(0, 1).map(t => {
      const matchedTopic = topics.find(t => t.title && (t.title.includes(t.title) || t.title.includes(t.title)));
      return {
        type: "주관식",
        subtype: "서술",
        topic_id: matchedTopic ? matchedTopic.id : (topics[0] ? topics[0].id : null),
        question: `[이론유도] ${t.title || '이론유도'}의 이론 유도 과정 및 핵심 공학적 전제조건을 기술하시오.`,
        answer: t.formula,
        concept: t.concept
      };
    });

    const customSubjs = [...selectedFormula, ...selectedTheory];

    // Format formulas and theories text for LLM context
    const formulasText = customFormulas.map((f, idx) => `[필수공식 ${idx+1}] 제목: ${f.title}\n공식 및 설명:\n${f.formula}\n개념: ${f.concept}`).join('\n\n');
    const theoriesText = customTheories.map((t, idx) => `[이론유도 ${idx+1}] 제목: ${t.title}\n개념: ${t.concept}\n내용/수식:\n${t.formula}`).join('\n\n');

    let aggregatedAiQuestions = [];
    const TOTAL_BATCHES = 2; // 2 batches * 4 AI questions = 8 AI questions

    console.log(`[종합평가 추가 생성 가동] TPM 초과 방지를 위해 4문제씩 총 ${TOTAL_BATCHES}회 연속 분할 요청을 시작합니다.`);

    for (let i = 0; i < TOTAL_BATCHES; i++) {
      const randomSeed = Math.floor(Math.random() * 10000);
      
      const batchPrompt = `
당신은 국가기술자격 기술사 시험 출제위원입니다.
아래 제공된 [평가 범위 토픽 소스], [필수공식 목록], [이론유도 목록]에 해당하는 공식과 공학적 지식 내용만을 참고하여, 다른 문제들과 절대 중복되지 않는 고난도 종합평가 추가 문제 **정확히 4개**를 생성하십시오.
(현재 분할 출제 회차: ${i + 1} / ${TOTAL_BATCHES}, 랜덤 시드: ${randomSeed})

🚨 [출제 출처 한정 및 문맥 격리 규칙 (Topic Isolation) - 극도로 중요!]:
1. 반드시 아래 제공된 **[평가 범위 토픽 목록 및 본문]**의 '<Topic>...</Topic>' 태그, **[인용된 필수공식 목록]**에서 직접 다루는 구체적인 개념, 공식 및 물리적 기전의 범위 안에서만 시험 문제를 생성하십시오.
2. 각 문제를 출제할 때 해당 문제의 출처가 되는 단 하나의 토픽의 범위로 한정하여 문제를 구성하십시오. 절대 특정 토픽에 관한 문제를 낼 때 다른 토픽에 적힌 단어, 수치, 공학적 조건이나 공식들을 혼합(Cross-contamination)하여 보기(options)나 지문을 만드는 '문맥 교차 오염'을 저지르지 마십시오. 각 문제는 소스 상의 독립된 개별 토픽 내용에 완전히 부합해야 합니다.
3. 제공된 소스 자료 및 인용된 내용에 **직접 등장하지 않는 외부의 타 공학/역학 분야 이론(예: 텍스트에 언급되지 않은 동역학 구조해석, 진동학, 설계감쇠, 고유진동수 등)은 절대로 지문에 주입하거나 날조하여 문제를 만들지 마십시오.**
4. 오직 제공된 소스 본문 텍스트 내에 **단어 및 수식으로 명시되어 있는 범위 내로만 출제 범위를 100% 철저히 한정**하십시오. 소스에 없는 타분야 내용을 엮거나 상상하여 문제를 구성할 경우 심각한 출제 오류로 간주됩니다.
5. 객관식 모든 보기(options) 및 해설 역시 오직 소스 문서 내용의 문장과 지식들을 변형/결합하여 만들어야 하며, 본문과 아예 무관한 엉뚱한 외부 용어나 가상의 기술적 지식을 보기에 혼합하는 것을 절대 금지합니다.

[평가 범위 토픽 목록 및 본문]:
${combinedText}

[인용된 필수공식 목록]:
${formulasText || '인용된 내용 없음'}

[출제 규칙]:
1. 이번 회차에서는 **정확히 4개의 문제**만 반환하되 다음 비율을 사수할 것:
   - 주관식 (type: "주관식", subtype: "개요"): 1문제 (정의 및 특징을 3~5줄 내외로 깊이 있고 전문적인 서술형 개요 및 개념 설명 모범답안 (\\n 구분))
   - 객관식 (type: "객관식"): 3문제 (4지선다형)
2. 객관식 문제의 유형 및 구성 비율 지침 (극도로 중요):
   - 출제되는 객관식 문항들은 반드시 아래 비율을 준수하여 구성하십시오:
     * **기본 기초 개념 문제 (40%, 약 2문제)**: 토픽의 기본 정의, 핵심 개념, 기초 원리를 직접적으로 묻는 기초 수준 문제. (예: "○○○의 정의로 가장 옳은 것은?", "○○○의 특징이 아닌 것은?"). 기사 수준의 핵심 개념 확인 문제로 출제.
     * **정량 계산 문제 (30%, 약 1문제)**: 구체적인 조건 수치를 대입하여 최종 값을 계산해내거나 정량 결과를 묻는 수치 계산 문제.
     * **심화 원리·비교 문제 (30%, 약 1문제)**: 공학적 메커니즘, 장단점, 비교, 실무 시공 유의사항 등 응용 이해형 문제.
   
   - **🚨 [공식 및 공식 수치 범위 노출 절대 금지 규칙 - 극도로 중요!]**: 문제 질문(question) 본문 내에 **문제를 해결하는 데 필요한 공학 수식 자체(예: $E_u = 300 s_u$ 등)나 수식의 특정 수치 범위(예: $E_u = (200 \\sim 500)s_u$ 등), 비례 관계 식 등을 절대로 직접 텍스트로 적어 제공하지 마십시오.** 수식이나 경험적 수치 범위를 지문에 미리 주면 학생의 암기 및 연상 능력을 평가할 수 없습니다. 대신 공식의 명칭("비배수 탄성계수 경험식")이나 변수들의 명칭("비배수 전단강도 $s_u$")만을 제시하고, 학생이 스스로 공식과 범위를 떠올려서 해결하도록 하십시오. (단, 해설(explanation)에서는 학생의 학습을 위해 공식을 상세히 명시하고 계산 과정을 설명해야 합니다.)
   - 특히 **수치 해석법이나 가설 구조물 해석과 같이 정량적 분석이 필요한 토픽의 경우, 제공된 소스 문서 내에 명시적인 수치나 파라미터가 존재한다면 이를 활용하여 정량 계산 문제를 구성하십시오. 단, 문서에 수치나 수식이 없다면 임의로 비현실적인 수치를 가상 부여하지 마십시오.**
   - 만약 전형적인 비계산형/정성적 토픽(예: 단순 품질 시험 절차, 단순 행정 제도 등)인 경우에만 일반적인 서술형/이해형 객관식 문제로 출제하되, 이 경우에도 가급적 물리적 변수의 영향도를 묻는 등 최대한 정량화에 가깝게 문제의 수준을 높여 출제하십시오.
   - **⚠️ [비교/특성 표 출제 규칙 - 극도로 중요!]**: 질문에 비교/특성 표가 필요한 경우, 절대 <table> 등 HTML 태그로 표를 직접 작성하지 말고 일반 텍스트로만 질문을 작성한 뒤 아래의 "tableData" 필드에 표 데이터를 객체 구조로 작성하십시오.
3. 오답 보기 구성 주의사항 (매우 중요):
   - 오답 보기(options) 구성 시 **절대로 터무니없거나 극단적인 표현, 혹은 비현실적인 공학적 가정(예: '무한대로 상승시킴', '실시간으로 기하급수적으로 증가함', '영원히 변하지 않음', '아예 발생하지 않음', '폭발함' 등)은 절대로 사용하지 마십시오**. 
   - 실제 전공 서적이나 실무 기술 기준에 부합하는 **고도로 타당성 있고 그럴듯한 오답(plausible engineering distractors)**으로 구성해 주십시오. 모든 보기는 반드시 원본 소스 및 공학적 상식선에 긴밀히 결합되어야 합니다.
- **🚨 [객관식 정밀성 및 정답 일치 조건 - 극도로 중요!]**: 모든 객관식(4지선다형) 계산 문제나 수치/공학적 판단 문제를 출제할 때, 계산으로 도출된 정확한 정답 수치나 조건이 4개의 보기(options) 중 반드시 정확히 1개로 존재해야 합니다. 절대로 실제 계산 결과와 보기의 수치가 불일치하여, 해설에서 '실제 계산값은 XX이나 보기 중 가장 가까운 YY를 선택합니다'와 같은 어처구니없는 변명을 적는 출제 오류를 범하지 마십시오. 문제를 생성하기 전에 실제 수식을 대입하여 정답을 한 번 더 직접 엄밀하게 계산하고 검증한 후, 그 결과값(토씨 하나 틀리지 않는 정확한 정답)을 보기와 'answer' 필드에 완벽히 일치하도록 기재하십시오.
    4. 소스 텍스트의 숨겨진 공학적 개념과 실무 기전을 포착하여 고품격 질문을 던지십시오.

[환각 방지 철칙 (Anti-Hallucination Constraints)]:
1. 제공된 소스 문서 텍스트(<Source_Document>) 내에 명시적 수치, 허용 안전율, 설계기준(KDS/KCS) 조항 번호나 공식이 없는 경우, 임의로 수식을 유도하거나 외부 시방서 수치 한계를 날조(Hallucination)하지 마십시오.
2. 문서 범위를 벗어나는 역학적 수치나 비물리적 수치(예: 내부마찰각 60도 이상 등)를 창작하여 모순을 발생시키면 안 됩니다. 수치가 부족하다면 정량 계산 문제 출제를 즉시 우회하고 개념 이해형 문제로 대체하십시오.

${LATEX_PROMPT_INSTRUCTIONS}
${GENERATION_STANDARDS}
${ENGINEERING_STANDARDS}
4. 반드시 추가 텍스트 없이 순수 JSON 배열만 반환하십시오.

[JSON 포맷]:
[
  {
    "type": "주관식",
    "subtype": "개요",
    "topic_title": "이 문제의 출제 근거가 되는 토픽 목록 내의 정확한 토픽명 (예: 평사투영법)",
    "question": "질문 내용",
    "answer": "3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명 모범답안",
    "concept": "핵심 개념 1줄 요약"
  },
  {
    "type": "객관식",
    "topic_title": "이 문제의 출제 근거가 되는 토픽 목록 내의 정확한 토픽명 (예: 락볼트 인발시험)",
    "question": "공학적 현상 분석 질문",
    "tableData": null,
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "answer": "정답 보기와 토씨 하나 틀리지 않는 정답 텍스트",
    "explanation": "이유와 오답 정밀 해설"
  }
] (※ 만약 표가 필요한 질문이라면 "tableData": {"headers": ["구분", "지반 X", "지반 Y"], "rows": [["퇴적 환경", "해수", "담수"]]} 처럼 구조화된 표 객체를 작성하고, 그렇지 않은 일반 질문이면 "tableData": null 로 설정하십시오.)
`;
      try {
        console.log(`[종합평가 추가 생성] (${i + 1}/${TOTAL_BATCHES}) 회차 프롬프트 전송 시작...`);
        const rawText = await callLLMWithFailover(null, batchPrompt, null, 'question');
        let text = rawText.trim();
        if (text.startsWith('```')) {
          text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }

        let batchQuestions = null;
        try {
          batchQuestions = parseLlmJson(text);
        } catch {
          batchQuestions = extractJsonArray(rawText);
        }

        if (batchQuestions && Array.isArray(batchQuestions)) {
          aggregatedAiQuestions.push(...batchQuestions);
          console.log(`[종합평가 추가 배치 성공] (${i + 1}/${TOTAL_BATCHES}) 회차 완료. 누적 문항 수: ${aggregatedAiQuestions.length}`);
        }

        if (i < TOTAL_BATCHES - 1) {
          await sleep(1200);
        }
      } catch (batchError) {
        console.warn(`[추가 배치 조회 경고] ${i + 1}회차 생성 중 에러 발생:`, batchError.message);
      }
    }

    if (aggregatedAiQuestions.length === 0) {
      aggregatedAiQuestions = [
        {
          type: "객관식",
          question: "점성토 지반의 압밀 시험에서 하중 압력 변화에 따른 공극비($e$)와 대수 유효 압력($\\log \\sigma'$) 곡선(e-log p 곡선) 상의 주요 거동 특성에 대한 설명으로 가장 적절하지 않은 것은?",
          options: [
            "압축지수($C_c$)는 규정 압축 영역에서의 직선 기울기로 정의되며, 지반의 소성 활성도가 높을수록 감소한다.",
            "선행압밀하중($p_c$)은 흙이 과거에 받았던 최대 유효 연직응력이다.",
            "재압축지수($C_r$)는 팽창 및 재압축 구간의 평균 기울기로, 일반적으로 압축지수의 1/5 ~ 1/10 정도 수준이다.",
            "과압밀비(OCR)가 1보다 큰 점토는 전단 시험 시 전단 변형에 의한 체적 팽창(Dilatancy) 거동을 보일 수 있다."
          ],
          answer: "압축지수($C_c$)는 규정 압축 영역에서의 직선 기울기로 정의되며, 지반의 소성 활성도가 높을수록 감소한다.",
          explanation: "지반의 소성 활성도가 높고 압축성이 클수록 압축지수($C_c$)는 오히려 증가합니다."
        }
      ];
    }

    const topicMap = {};
    topics.forEach(t => {
      topicMap[t.title.toLowerCase().trim()] = t.id;
    });

    const cleanedQuestions = aggregatedAiQuestions.map(q => {
      let topicId = q.topic_id || null;
      if (q.topic_title) {
        const cleanedTitle = q.topic_title.toLowerCase().trim();
        if (topicMap[cleanedTitle]) {
          topicId = topicMap[cleanedTitle];
        } else {
          const matchedKey = Object.keys(topicMap).find(k => k.includes(cleanedTitle) || cleanedTitle.includes(k));
          if (matchedKey) topicId = topicMap[matchedKey];
        }
      }
      if (!topicId && topics.length > 0) {
        const matchedTopic = topics.find(t => q.question.includes(t.title) || (t.keywords && t.keywords.split(',').some(k => q.question.includes(k.trim()))));
        topicId = matchedTopic ? matchedTopic.id : topics[Math.floor(Math.random() * topics.length)].id;
      }
      return {
        type: q.type || "객관식",
        subtype: q.subtype || null,
        question: cleanQuizQuestion(q.question),
        tableData: q.tableData || null,
        options: q.options || [],
        answer: q.answer,
        explanation: q.explanation || '',
        concept: q.concept || '',
        topic_id: topicId
      };
    });

    const healedFinalQuestions = cleanedQuestions.map(q => healQuizQuestionObject(q));
    
    // Combine 2 custom questions and 8 AI questions
    const finalQuestions = [...customSubjs, ...healedFinalQuestions];

    // Fisher-Yates shuffle the final 10 questions to perfectly mix them
    for (let i = finalQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]];
    }

    const validatedFinalQuestions = await Promise.all(
      finalQuestions.map(async (q) => {
        const matchedTopic = topics.find(t => t.id === Number(q.topic_id));
        const title = matchedTopic ? matchedTopic.title : '';
        const keywords = matchedTopic ? matchedTopic.keywords : '';
        const text = matchedTopic ? (topicTextMap[matchedTopic.id] || '') : '';
        const res = await validateAndHealQuestion(q, callLLMWithFailover, title, keywords, text);
        return healQuizQuestionObject(res);
      })
    );

    res.json({ questions: validatedFinalQuestions });

  } catch (err) {
    console.error('Exam additional route error:', err);
    res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
});

export default router;
