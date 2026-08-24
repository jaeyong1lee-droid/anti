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
      colHeader: '제1교시 단답/서술형',
      explanation: `토질및기초기술사 기출문제 (${sessionInfo} 제1교시 ${numberInfo}) "${questionText}"에 대한 주관식 단답/서술형 답안 채점입니다. 지반공학적 핵심 메커니즘, 역학적 원리, 관련 공식(LaTeX), 설계/시공 기준에 부합하는지 전문적으로 평가하고, 고도화된 모범 답안을 도출하십시오.`,
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
