import express from 'express';
import { dbQuery } from '../database.js';
import { saveSessionValue, callLLMWithFailover } from '../services/aiService.js';
import { getRandomLockscreenExamQuestion, loadAllPastExamQuestions } from '../services/pastExamService.js';
import { gradeSubjective, GRADING_STANDARDS, gradingStandardsList } from '../plugins/gradingPlugin.js';
import { ENGINEERING_STANDARDS, engineeringStandardsList } from '../plugins/engineeringStandards.js';

const router = express.Router();

function getCallLLM(req) {
  const progressId = req && (req.query?.progressId || req.body?.progressId);
  const preferredModel = req && (req.query?.preferredModel || req.body?.preferredModel);
  return (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, preferredModel, progressId });
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

// GET /api/lockscreen/random -> Retrieve a random 1st-period exam question (excluding questions served within 7 days)
router.get('/random', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();

    const question = await getRandomLockscreenExamQuestion();
    return res.json({ success: true, question });
  } catch (err) {
    console.error('GET /api/lockscreen/random error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/lockscreen/sync -> Backward-compatible endpoint returning a random exam question
router.get('/sync', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    await ensureSessionTable();

    const question = await getRandomLockscreenExamQuestion();
    return res.json({ success: true, question, questions: [question] });
  } catch (err) {
    console.error('GET /api/lockscreen/sync error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/lockscreen/pool -> Return list of all available past exam questions
router.get('/pool', async (req, res) => {
  try {
    const all = await loadAllPastExamQuestions();
    res.json({ success: true, total: all.length, pool: all });
  } catch (err) {
    console.error('GET /api/lockscreen/pool error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/lockscreen/grade -> Grade user subjective answer using AI grading plugin
router.post('/grade', async (req, res) => {
  try {
    const { question, userAnswer, questionId } = req.body;
    if (!userAnswer || !userAnswer.trim()) {
      return res.json({
        success: true,
        result: {
          isCorrect: false,
          score: 0,
          reason: '답안이 입력되지 않았습니다.',
          suggestedModelAnswer: '문제를 읽고 핵심 공학적 원리와 기준을 작성해 주십시오.'
        }
      });
    }

    const questionText = typeof question === 'string' ? question : (question?.question || question?.fullTitle || '');
    const sessionInfo = question?.sessionName || '';
    const numberInfo = question?.number ? `${question.number}번` : '';

    const dynamicGradingStandards = gradingStandardsList && gradingStandardsList.length > 0
      ? gradingStandardsList.map(s => s.content).join('\n\n')
      : GRADING_STANDARDS;
    const dynamicEngineeringStandards = engineeringStandardsList && engineeringStandardsList.length > 0
      ? engineeringStandardsList.map(s => s.content).join('\n\n')
      : ENGINEERING_STANDARDS;

    const callLLM = getCallLLM(req);

    const gradingResult = await gradeSubjective({
      question: `[토질및기초기술사 기출문제 ${sessionInfo} 제1교시 ${numberInfo}] ${questionText}`,
      correctAnswer: '',
      userAnswer: userAnswer.trim(),
      rowHeader: sessionInfo || '기술사 기출문제',
      colHeader: '기술사 제1교시 단답/서술형 (10점 만점)',
      explanation: `본 문제는 대한민국 토질및기초기술사 제1교시 10점 만점 단답/서술형 문항입니다.
문항: "${questionText}"
채점관 평가 수칙:
1. 사용자가 문제 제목이나 제시된 단어를 단순히 되묻거나(예: '?'), 문제 단어만 앵무새처럼 반복한 경우 반드시 0점~1점으로 엄격히 오답 처리하십시오.
2. 1교시 기술사 문제에 걸맞게 해당 토픽의 정의(개념), 발생 메커니즘(원인 및 지반 거동 특성), 핵심 공식(수식), 판정 기준/설계 고려사항 중 유효한 공학적 설명이 실질적으로 포함되어 있는지를 엄격하게 평가하십시오.
3. 고도화된 완성형 모범 답안(suggestedModelAnswer)에는 개념의 정의, 수식/공식(LaTeX), 그리고 실무/판정 기준을 체계적으로 서술하십시오.`,
      category: '일반',
      callLLMWithFailover: callLLM,
      gradingStandards: dynamicGradingStandards,
      engineeringStandards: dynamicEngineeringStandards
    });

    res.json({
      success: true,
      result: gradingResult
    });
  } catch (err) {
    console.error('POST /api/lockscreen/grade error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/lockscreen/solve -> Mark question as completed
router.post('/solve', async (req, res) => {
  try {
    const { id } = req.body;
    await ensureSessionTable();

    if (id) {
      let history = {};
      try {
        const historyRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'lockscreen_past_exam_history'");
        if (historyRow && historyRow.value) {
          history = JSON.parse(historyRow.value) || {};
        }
      } catch (e) {
        console.warn('Failed to parse lockscreen past exam history:', e);
      }
      history[id] = Date.now();
      await saveSessionValue('lockscreen_past_exam_history', JSON.stringify(history));
    }

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/lockscreen/solve error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
