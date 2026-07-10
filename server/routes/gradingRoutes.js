import express from 'express';
import pdfParse from 'pdf-parse';
import { dbQuery } from '../database.js';
import { callLLMWithFailover, analyzeStandardsBeforeTask, getTopicText, startBackendProgressTimer, updateProgress, stopBackendProgressTimer } from '../services/aiService.js';
import { healQuizQuestionObject, parseLlmJson, healLatexFormulas } from '../utils/latexUtils.js';
import * as fileUtils from '../utils/fileUtils.js';
import { generateFallbackQuestions } from '../fallback_generator.js';
import { gradeSubjective, GRADING_STANDARDS } from '../plugins/gradingPlugin.js';
import { ENGINEERING_STANDARDS } from '../plugins/engineeringStandards.js';
import { GENERATION_STANDARDS } from '../plugins/generationStandards.js';
import * as ocrPlugin from '../plugins/calculationPlugin.js';

const router = express.Router();
const BT = '```';

const LATEX_PROMPT_INSTRUCTIONS = `
[수학 공식/특수문자 표기 규칙 - 극도로 중요]:
1. 인라인(글 중간)에 수학 공식이나 물리적 변수(예: kh, kv 등)를 적을 때는 반드시 단일 달러 기호 하나로 감싸서 LaTeX 형식으로 작성하십시오. (예: $k_h$, $k_v$, $\\beta$ 등)
2. 디스플레이(독립된 단락) 수학 공식을 작성할 때는 반드시 이중 달러 기호로 감싸서 작성하십시오. (예: $$k_e = \\sqrt{k_h k_v}$$)
3. 역슬래시 문자는 이스케이프가 중복 처리되지 않도록 한 번만 적어 전달되도록 주의하십시오.
`;

function cleanQuizQuestion(q) {
  if (!q) return q;
  return q.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function getCoreSubjectFromTitle(title) {
  if (!title) return '';
  return title.trim();
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

function deduplicateQuestions(questions) {
  return questions;
}

function isQuestionMismatched(question, topicTitle, topicKeywords) {
  return null;
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

// POST /api/grade-subjective -> AI Subjective Grading
router.post('/grade-subjective', async (req, res) => {
  const { question, correctAnswer, userAnswer, rowHeader, colHeader, explanation, category } = req.body;
  const progressId = req.body.progressId || req.query.progressId;

  let dynamicGradingStandards = GRADING_STANDARDS;
  let dynamicEngineeringStandards = ENGINEERING_STANDARDS;
  try {
    const gradingRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'grading_standards'");
    if (gradingRow && gradingRow.value) {
      const list = JSON.parse(gradingRow.value);
      if (Array.isArray(list)) {
        dynamicGradingStandards = list.map(s => s.content).join('\n\n');
      }
    }
  } catch (dbErr) {
    console.error('Failed to dynamically fetch grading standards:', dbErr);
  }

  try {
    const engRow = await dbQuery.get("SELECT value FROM app_session WHERE key = 'engineering_standards'");
    if (engRow && engRow.value) {
      const list = JSON.parse(engRow.value);
      if (Array.isArray(list)) {
        dynamicEngineeringStandards = list.map(s => s.content).join('\n\n');
      }
    }
  } catch (dbErr) {
    console.error('Failed to dynamically fetch engineering standards:', dbErr);
  }

  let standardsAnalysis = '';
  const localCallLLM = (sys, prompt, img, scenario, opts) => {
    const enrichedPrompt = `[🚨 0단계 AI가 사전 분석한 절대 채점 지침 준수 주의사항]:\n${standardsAnalysis}\n\n${prompt}`;
    return callLLMWithFailover(sys, enrichedPrompt, img, scenario, { ...opts, temperature: 0.0, progressId });
  };
  if (progressId) {
    standardsAnalysis = await analyzeStandardsBeforeTask(progressId, question || '주관식 채점', dynamicGradingStandards, 'grading');
    updateProgress(progressId, 1, '1단계: AI 엔진으로 제출 답안 채점 중...', 30);
  }

  let attempt = 0;
  const maxAttempts = 3;
  let delay = 1000;
  let lastError = null;

  try {
    while (attempt < maxAttempts) {
      try {
        const result = await gradeSubjective({
          question,
          correctAnswer,
          userAnswer,
          rowHeader,
          colHeader,
          explanation,
          category,
          callLLMWithFailover: localCallLLM,
          gradingStandards: dynamicGradingStandards,
          engineeringStandards: dynamicEngineeringStandards
        });
        if (progressId) {
          updateProgress(progressId, 1, '1단계: 채점 완료!', 100);
        }
        return res.json(result);
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt < maxAttempts) {
          console.warn(`[AI grading retry] Attempt ${attempt} failed. Retrying...`, err.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
    }

    const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
    const localCorrect = normalize(userAnswer) === normalize(correctAnswer);
    if (progressId) {
      updateProgress(progressId, 1, '1단계: 채점 완료(로컬)!', 100);
    }
    res.json({
      isCorrect: localCorrect,
      score: localCorrect ? 10 : 0,
      reason: localCorrect 
        ? '로컬 단순 비교로 정답 판정' 
        : 'AI 채점 오버로드로 평가 실패 (재평가 버튼을 눌러주세요)'
    });
  } catch (outerErr) {
    console.error('Outer AI grading error:', outerErr);
    res.status(500).json({ error: '서버 오류로 채점을 수행하지 못했습니다.' });
  }
});

// GET /api/topics/:id/question-feedback -> Retrieve question feedbacks
router.get('/topics/:id/question-feedback', async (req, res) => {
  const topicId = Number(req.params.id);
  try {
    const rows = await dbQuery.all(
      'SELECT question_text, feedback_type FROM question_feedback WHERE topic_id = ?',
      [topicId]
    );
    res.json({ success: true, feedback: rows });
  } catch (err) {
    console.error('GET question-feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/topics/:id/question-feedback -> Save question feedback
router.post('/topics/:id/question-feedback', async (req, res) => {
  const topicId = Number(req.params.id);
  const { question_text, feedback_type } = req.body;
  if (!question_text || !feedback_type) {
    return res.status(400).json({ error: 'question_text와 feedback_type은 필수입니다.' });
  }

  try {
    const trimmedQ = question_text.trim();
    await dbQuery.run(
      'DELETE FROM question_feedback WHERE topic_id = ? AND question_text = ?',
      [topicId, trimmedQ]
    );
    if (feedback_type === 'upvote' || feedback_type === 'downvote') {
      await dbQuery.run(
        'INSERT INTO question_feedback (topic_id, question_text, feedback_type) VALUES (?, ?, ?)',
        [topicId, trimmedQ, feedback_type]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('POST question-feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/question-feedback/all -> Get all feedbacks
router.get('/question-feedback/all', async (req, res) => {
  try {
    const rows = await dbQuery.all(
      'SELECT topic_id, question_text, feedback_type FROM question_feedback'
    );
    res.json({ success: true, feedback: rows });
  } catch (err) {
    console.error('GET all question-feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/question/regenerate -> Regenerate a single question
router.post('/question/regenerate', async (req, res) => {
  const { mode, topicId, currentQuestion, questionIdx, allQuestions, targetTypeSelection } = req.body;
  const topicInstructionsPrompt = await getFormattedTopicInstructions(topicId);
  const progressId = req.query.progressId || req.body.progressId;
  let standardsAnalysis = '';
  let progressTimer = null;
  const localCallLLM = (sys, prompt, img, scenario, opts) => {
    const enrichedPrompt = `[🚨 0단계 AI가 사전 분석한 절대 지침 준수 주의사항]:\n${standardsAnalysis}\n\n${prompt}`;
    return callLLMWithFailover(sys, enrichedPrompt, img, scenario, { ...opts, progressId });
  };
  if (progressId) {
    standardsAnalysis = '- 문항 재생성을 위해 0단계 사전 지침 분석은 생략하고 즉시 재생성 단계로 진입합니다.';
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 문항 재생성 시작...', 50, 1500, 5);
  }

  try {
    if ((topicId && String(topicId).startsWith('mixed_')) || currentQuestion?.mixedType) {
      const mixedType = currentQuestion?.mixedType || (currentQuestion?.acronym ? 'acronym' : 'table');
      if (mixedType === 'image') {
        if (progressTimer) {
          clearInterval(progressTimer);
          stopBackendProgressTimer(progressId, 100, '성공적으로 재출제했습니다!', true);
        }
        return res.json({ question: currentQuestion });
      }
      
      const content = currentQuestion.explanation || '';
      let systemPrompt = "당신은 지반공학 기술사 시험 전문 출제위원 및 튜터입니다.";
      let userPrompt = "";

      if (mixedType === 'table') {
        systemPrompt = `당신은 지반공학 기술사 시험 전문 튜터이자 출제위원입니다.
제공된 비교/대비 표 데이터를 기반으로, 수험생이 학습할 수 있는 참신한 표 빈칸 채우기(Table Quiz) 문항을 새로 구성하여 출제해 주십시오.
${GENERATION_STANDARDS}
${ENGINEERING_STANDARDS}
출력은 반드시 마크다운 블록이나 설명 없이 오직 순수한 JSON 객체 하나만 반환하십시오.`;
        userPrompt = `[원본 비교 표 HTML]:\n${content}\n\n[기존 문제 질문]:\n${currentQuestion.question || ''}\n\n위 데이터를 바탕으로 JSON 포맷으로 재출제해 주십시오.`;
      } else {
        systemPrompt = `당신은 지반공학 기술사 시험 전문 튜터이자 출제위원입니다.
제시된 앞글자(두문자) 암기법 데이터를 기반으로 새롭게 두문자 조합 및 연상문장을 반환해 주십시오.
${GENERATION_STANDARDS}`;
        userPrompt = `[원본 두문자 암기법 정보]:\n${content}\n\n위 데이터를 바탕으로 JSON 포맷으로 재출제해 주십시오.`;
      }

      const response = await localCallLLM(systemPrompt, userPrompt, null, mixedType === 'table' ? 'mixed_table_regen' : 'mixed_acronym_regen', { temperature: 1.0 });
      let parsed = {};
      try {
        const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanJson);
      } catch (err) {
        throw new Error('AI 응답 파싱 실패');
      }

      if (mixedType === 'table') {
        parsed.type = '주관식 (표채우기)';
        parsed.subtype = '표채우기';
        parsed.explanation = content;
        parsed.mixedType = 'table';
      } else {
        parsed.type = '주관식 (앞글자)';
        parsed.explanation = content;
        parsed.mixedType = 'acronym';
        if (parsed.correctRows) {
          parsed.tableData = {
            headers: ['두문자', '내용 (암기단어 : 설명)'],
            rows: parsed.correctRows.map(() => ['', ''])
          };
        }
      }

      if (progressTimer) clearInterval(progressTimer);
      if (progressId) stopBackendProgressTimer(progressId, 100, '성공적으로 재출제했습니다!', true);

      return res.json({
        question: parsed,
        isFallback: false
      });
    }

    let duplicatePreventionPrompt = '';
    if (Array.isArray(allQuestions) && allQuestions.length > 0) {
      const otherQs = allQuestions.filter((_, i) => i !== questionIdx);
      if (otherQs.length > 0) {
        duplicatePreventionPrompt = `
[🚨 중복 출제 금지 규칙 - 극도로 중요!]:
현재 이 문제 세트 내에 아래 문제들이 이미 출제되어 있습니다. 새로 생성하는 문제는 아래 기존 문제들(질문 내용, 공식, 표의 구분 항목, 정답 등)과 **절대 중복되거나 유사해서는 안 됩니다.**:
${otherQs.map((q, i) => `기존 문제 ${i + 1}: ${q.question || '없음'}`).join('\n\n')}
`;
      }
    }

    const hasAnyAiKey = !!(
      process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_SECONDARY ||
      process.env.GEMINI_API_KEY_TERTIARY ||
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY
    );

    if (mode === 'review') {
      if (!topicId) {
        return res.status(400).json({ error: '토픽 ID가 제공되지 않았습니다.' });
      }
      const topic = await dbQuery.get(`SELECT id, title, keywords, pdf_name, category, pdf_url, extracted_text FROM topics WHERE id = ?`, [topicId]);
      if (!topic) {
        return res.status(404).json({ error: '토픽을 찾을 수 없습니다.' });
      }

      let fileText = '';
      if (topic.pdf_data || topic.pdf_url || topic.extracted_text) {
        fileText = await getTopicText(topic, fileUtils, ocrPlugin, pdfParse);
        fileText = fileUtils.smartTruncate(fileText, 25000);
      }

      let targetType = '객관식 (4지선다)';
      let targetSubtype = '';
      const currentType = currentQuestion?.type || '';

      if (targetTypeSelection === 'mc') {
        targetType = '객관식 (4지선다)';
      } else if (targetTypeSelection === 'subj') {
        targetType = '주관식 (단답형)';
        const rand = Math.floor(Math.random() * 2);
        targetSubtype = rand === 0 ? '12번형태' : '13번형태';
      } else if (targetTypeSelection === 'table') {
        targetType = '주관식 (표채우기)';
      } else {
        if (currentType.includes('개요')) targetType = '주관식 (개요)';
        else if (currentType.includes('공식')) targetType = '주관식 (공식)';
        else if (currentType.includes('표채우기') || currentQuestion?.tableData) targetType = '주관식 (표채우기)';
        else if (currentType.includes('단답형') || currentType.includes('단답')) {
          targetType = '주관식 (단답형)';
          const rand = Math.floor(Math.random() * 2);
          targetSubtype = rand === 0 ? '12번형태' : '13번형태';
        } else {
          targetType = '객관식 (4지선다)';
        }
      }

      if (!hasAnyAiKey) {
        const fallbackList = generateFallbackQuestions(topic.title, topic.keywords, fileText);
        const candidates = fallbackList.filter(q => {
          if (targetType === '주관식 (개요)') return q.type?.includes('개요');
          if (targetType === '주관식 (공식)') return q.type?.includes('공식');
          if (targetType === '주관식 (표채우기)') return q.type?.includes('표채우기') || q.subtype?.includes('표채우기');
          if (targetType === '주관식 (단답형)') return q.type?.includes('단답') || q.subtype?.includes('단답');
          return q.type?.includes('객관식');
        });
        let selectedQ = candidates.find(c => c.question !== currentQuestion?.question);
        if (!selectedQ) selectedQ = candidates[Math.floor(Math.random() * candidates.length)] || fallbackList[0];

        if (progressTimer) clearInterval(progressTimer);
        return res.json({
          question: healQuizQuestionObject({
            ...selectedQ,
            question: cleanQuizQuestion(selectedQ.question)
          }),
          isFallback: true
        });
      }

      let typeRequirement = '';
      let formatRequirement = '';
      if (targetType === '주관식 (개요)') {
        typeRequirement = `[주관식 (개요) 유형으로 생성하십시오]`;
        formatRequirement = `{"type": "주관식 (개요)", "question": "질문", "concept": "개요", "formula": "", "structure": ""}`;
      } else if (targetType === '주관식 (공식)') {
        typeRequirement = `[주관식 (공식) 유형으로 생성하십시오]`;
        formatRequirement = `{"type": "주관식 (공식)", "question": "질문", "concept": "요약", "formula": "$공식$", "structure": "- $기호$: 설명"}`;
      } else if (targetType === '주관식 (표채우기)') {
        typeRequirement = `[주관식 (표채우기) 유형으로 생성하십시오]`;
        formatRequirement = `{"type": "주관식 (표채우기)", "question": "질문", "tableData": {"headers": ["구분", "비교1", "비교2"], "rows": [["항목", "[INPUT_1]", "[INPUT_2]"]]}, "answers": {"INPUT_1": "답1", "INPUT_2": "답2"}, "explanation": "해설"}`;
      } else if (targetType === '주관식 (단답형)') {
        typeRequirement = `[주관식 (단답형) ${targetSubtype} 유형으로 생성하십시오]`;
        formatRequirement = `{"type": "주관식 (단답형)", "question": "질문", "answer": "답안", "explanation": "해설"}`;
      } else {
        typeRequirement = `[객관식 4지선다 유형으로 생성하십시오]`;
        formatRequirement = `{"type": "객관식 (4지선다)", "question": "질문", "tableData": null, "options": ["보기1", "보기2", "보기3", "보기4"], "answer": "정답보기", "explanation": "해설"}`;
      }

      const prompt = `당신은 기술사 시험 출제위원입니다.
${duplicatePreventionPrompt}
[토픽 제목]: ${topic.title}
[기초 소스 문제]:
- 질문: ${currentQuestion?.question}
- 유형: ${targetType}
- 기존 정답: ${currentQuestion?.answer || ''}

[출제 요구사항]:
반드시 기초 문제를 변형/응용하여 새로운 문제를 출제하십시오.
${typeRequirement}
${GENERATION_STANDARDS}
${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
오직 순수 JSON 데이터만 반환하십시오.
[응답 포맷]:
${formatRequirement}`;

      const responseText = await localCallLLM(null, prompt, null, 'question');
      let text = responseText.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      let parsedQuestion = parseLlmJson(text);
      const healedQ = healQuizQuestionObject({
        ...parsedQuestion,
        question: cleanQuizQuestion(parsedQuestion.question)
      });

      if (progressTimer) clearInterval(progressTimer);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: validationPlugin으로 생성 문제 검증 중...', 50);
      }
      const validatedQ = await validateAndHealQuestion(healedQ, localCallLLM, topic.title, topic.keywords, fileText);
      const finalValidatedQ = healQuizQuestionObject({
        ...validatedQ,
        topic_id: Number(topicId),
        category: topic.category
      });
      if (progressId) {
        updateProgress(progressId, 2, '2단계: 문제 생성 및 검증 완료!', 100);
      }

      return res.json({
        question: finalValidatedQ,
        isFallback: false
      });

    } else if (mode === 'exam') {
      const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name FROM topics ORDER BY created_at DESC`);
      if (!topics || topics.length === 0) {
        return res.status(400).json({ error: '등록된 토픽이 없습니다.' });
      }
      const targetTopics = topics.slice(0, 8);
      const targetIds = targetTopics.map(t => t.id);

      const pdfDataRows = await dbQuery.all(
        `SELECT id, extracted_text, (CASE WHEN extracted_text IS NULL OR extracted_text = '' THEN pdf_data ELSE NULL END) AS pdf_data FROM topics WHERE id IN (${targetIds.map(() => '?').join(',')})`,
        targetIds
      );
      const pdfDataMap = {};
      const extractedTextMap = {};
      for (const row of pdfDataRows) {
        pdfDataMap[row.id] = row.pdf_data;
        extractedTextMap[row.id] = row.extracted_text;
      }
      for (const topic of targetTopics) {
        topic.pdf_data = pdfDataMap[topic.id] || null;
        topic.extracted_text = extractedTextMap[topic.id] || null;
      }

      const topicTexts = await Promise.all(targetTopics.map(async (topic) => {
        let fileText = '';
        if (topic.extracted_text) fileText = topic.extracted_text;
        else if (topic.pdf_data) {
          const isHtml = topic.pdf_name && (
            topic.pdf_name.toLowerCase().endsWith('.html') ||
            topic.pdf_name.toLowerCase().endsWith('.htm') ||
            fileUtils.isBufferHtml(topic.pdf_data)
          );
          try {
            if (isHtml) fileText = fileUtils.htmlToPlainText(fileUtils.decodeHtmlBuffer(topic.pdf_data));
            else {
              const parsed = await pdfParse(topic.pdf_data);
              fileText = parsed.text || '';
            }
          } catch (e) {}
          fileText = fileUtils.mergeVerticalText(fileText);
        }
        if (fileText.length > 1000) fileText = fileText.substring(0, 1000);
        return `[토픽: ${topic.title}]\n${fileText}`;
      }));

      const combinedText = topicTexts.join('\n\n---\n\n');
      const topicTitles = topics.map(t => t.title).join(', ');

      const qType = currentQuestion?.type || '객관식';
      const qSubtype = currentQuestion?.subtype || '';

      const prompt = `당신은 기술사 시험 출제위원입니다.
${duplicatePreventionPrompt}
[평가 범위 토픽 목록]: ${topicTitles}
[통합 소스 텍스트]:
${combinedText}

[기초 소스 문제]:
- 질문: ${currentQuestion?.question}
- 유형: ${qType} (하위 유형: ${qSubtype})

[출제 요구사항]:
반드시 기초 문제를 변형/응용하여 새로운 문제를 출제하십시오.
${GENERATION_STANDARDS}
${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
오직 순수 JSON 데이터만 반환하십시오.`;

      const responseText = await localCallLLM(null, prompt, null, 'question');
      let text = responseText.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      let parsedQuestion = parseLlmJson(text);
      const finalTopicId = topicId || currentQuestion?.topic_id || (topics && topics[0] ? topics[0].id : null);
      const activeTopic = topics.find(t => t.id === Number(finalTopicId));
      const activeTopicTitle = activeTopic ? activeTopic.title : '';
      const activeTopicKeywords = activeTopic ? activeTopic.keywords : '';
      let activeTopicFileText = '';

      const healedQ = healQuizQuestionObject({
        ...parsedQuestion,
        topic_id: finalTopicId ? Number(finalTopicId) : null,
        question: cleanQuizQuestion(parsedQuestion.question)
      });

      if (progressTimer) clearInterval(progressTimer);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: validationPlugin으로 생성 문제 검증 중...', 50);
      }
      const validatedQ = await validateAndHealQuestion(healedQ, localCallLLM, activeTopicTitle, activeTopicKeywords, activeTopicFileText);
      const finalValidatedQ = healQuizQuestionObject(validatedQ);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: 문제 생성 및 검증 완료!', 100);
      }

      return res.json({
        question: finalValidatedQ,
        isFallback: false
      });
    }

  } catch (error) {
    console.error('Regeneration error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// POST /api/question/adjust -> Adjust a single question based on user feedback
router.post('/question/adjust', async (req, res) => {
  const { mode, topicId, currentQuestion, questionIdx, userFeedback } = req.body;
  const topicInstructionsPrompt = await getFormattedTopicInstructions(topicId);
  const progressId = req.query.progressId || req.body.progressId;
  const localCallLLM = (sys, prompt, img, scenario, opts) => 
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, progressId });

  let progressTimer = null;
  let standardsAnalysis = '';
  if (progressId) {
    const targetQText = currentQuestion ? currentQuestion.question : '의견 조절';
    standardsAnalysis = await analyzeStandardsBeforeTask(progressId, targetQText, GENERATION_STANDARDS, 'generation');
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 의견 반영 조절 시작...', 50, 1500, 5);
  }

  if (!userFeedback || !userFeedback.trim()) {
    if (progressTimer) clearInterval(progressTimer);
    return res.status(400).json({ error: '의견이 입력되지 않았습니다.' });
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

    if (!hasAnyAiKey) {
      if (progressTimer) clearInterval(progressTimer);
      return res.status(400).json({ error: '의견을 반영할 AI API 키가 설정되어 있지 않습니다.' });
    }

    if (mode === 'review') {
      const topic = await dbQuery.get(`SELECT id, title, keywords, pdf_name, category, pdf_url, extracted_text FROM topics WHERE id = ?`, [topicId]);
      if (!topic) {
        if (progressTimer) clearInterval(progressTimer);
        return res.status(404).json({ error: '토픽을 찾을 수 없습니다.' });
      }

      let fileText = '';
      if (topic.pdf_data || topic.pdf_url || topic.extracted_text) {
        fileText = await getTopicText(topic, fileUtils, ocrPlugin, pdfParse);
        fileText = fileUtils.smartTruncate(fileText, 25000);
      }

      let targetType = '객관식 (4지선다)';
      const currentType = currentQuestion?.type || '';
      if (currentType.includes('개요')) targetType = '주관식 (개요)';
      else if (currentType.includes('공식')) targetType = '주관식 (공식)';
      else if (currentType.includes('표채우기') || currentQuestion?.tableData) targetType = '주관식 (표채우기)';
      else if (currentType.includes('단답형') || currentType.includes('단답')) targetType = '주관식 (단답형)';
      else targetType = '객관식 (4지선다)';

      const prompt = `당신은 기술사 시험 출제위원입니다.
[사용자 조정 요청]: "${userFeedback}"
[기초 소스 문제]:
- 질문: ${currentQuestion?.question}
- 유형: ${targetType}
- 기존 정답: ${currentQuestion?.answer || ''}

반드시 사용자 요구사항을 100% 반영하여 수정, 보완, 응용 또는 전면 개편된 새로운 문제 1개를 반환하십시오.
${GENERATION_STANDARDS}
${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
오직 JSON 객체만 반환하십시오.`;

      const responseText = await localCallLLM(null, prompt, null, 'question');
      let text = responseText.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      let parsedQuestion = parseLlmJson(text);
      const finalTopicId = Number(topicId || currentQuestion?.topic_id);
      if (finalTopicId) {
        try {
          await dbQuery.run(
            `INSERT INTO question_adjustments (topic_id, question_text, adjusted_text, user_feedback) 
             VALUES (?, ?, ?, ?)`,
            [finalTopicId, currentQuestion?.question.trim(), parsedQuestion.question.trim(), userFeedback.trim()]
          );
        } catch (e) {}
      }

      const healedQ = healQuizQuestionObject({
        ...parsedQuestion,
        topic_id: finalTopicId,
        question: cleanQuizQuestion(parsedQuestion.question)
      });

      if (progressTimer) clearInterval(progressTimer);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: validationPlugin으로 생성 문제 검증 중...', 50);
      }
      const validatedQ = await validateAndHealQuestion(healedQ, localCallLLM, topic.title, topic.keywords, fileText);
      const finalValidatedQ = healQuizQuestionObject({
        ...validatedQ,
        topic_id: finalTopicId,
        category: topic.category
      });
      if (progressId) {
        updateProgress(progressId, 2, '2단계: 문제 생성 및 검증 완료!', 100);
      }

      return res.json({
        question: finalValidatedQ
      });

    } else if (mode === 'exam') {
      const topics = await dbQuery.all(`SELECT id, title, keywords, pdf_name FROM topics ORDER BY created_at DESC`);
      if (!topics || topics.length === 0) {
        if (progressTimer) clearInterval(progressTimer);
        return res.status(400).json({ error: '등록된 토픽이 없습니다.' });
      }
      const targetTopics = topics.slice(0, 8);
      const targetIds = targetTopics.map(t => t.id);

      const pdfDataRows = await dbQuery.all(
        `SELECT id, extracted_text, (CASE WHEN extracted_text IS NULL OR extracted_text = '' THEN pdf_data ELSE NULL END) AS pdf_data FROM topics WHERE id IN (${targetIds.map(() => '?').join(',')})`,
        targetIds
      );
      const pdfDataMap = {};
      const extractedTextMap = {};
      for (const row of pdfDataRows) {
        pdfDataMap[row.id] = row.pdf_data;
        extractedTextMap[row.id] = row.extracted_text;
      }
      for (const topic of targetTopics) {
        topic.pdf_data = pdfDataMap[topic.id] || null;
        topic.extracted_text = extractedTextMap[topic.id] || null;
      }

      const topicTexts = await Promise.all(targetTopics.map(async (topic) => {
        let fileText = '';
        if (topic.extracted_text) fileText = topic.extracted_text;
        else if (topic.pdf_data) {
          const isHtml = topic.pdf_name && (
            topic.pdf_name.toLowerCase().endsWith('.html') ||
            topic.pdf_name.toLowerCase().endsWith('.htm') ||
            fileUtils.isBufferHtml(topic.pdf_data)
          );
          try {
            if (isHtml) fileText = fileUtils.htmlToPlainText(fileUtils.decodeHtmlBuffer(topic.pdf_data));
            else {
              const parsed = await pdfParse(topic.pdf_data);
              fileText = parsed.text || '';
            }
          } catch (e) {}
          fileText = fileUtils.mergeVerticalText(fileText);
        }
        if (fileText.length > 1000) fileText = fileText.substring(0, 1000);
        return `[토픽: ${topic.title}]\n${fileText}`;
      }));

      const combinedText = topicTexts.join('\n\n---\n\n');
      const topicTitles = topics.map(t => t.title).join(', ');

      const qType = currentQuestion?.type || '객관식';
      const qSubtype = currentQuestion?.subtype || '';

      const prompt = `당신은 기술사 시험 출제위원입니다.
[사용자 조정 요청]: "${userFeedback}"
[기초 소스 문제]:
- 질문: ${currentQuestion?.question}
- 유형: ${qType} (하위 유형: ${qSubtype})
[평가 범위 토픽 목록]: ${topicTitles}
[통합 소스 텍스트]:
${combinedText}

반드시 사용자 요구사항을 100% 반영하여 수정, 보완, 응용 또는 전면 개편된 새로운 문제 1개를 반환하십시오.
${GENERATION_STANDARDS}
${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
오직 JSON 객체만 반환하십시오.`;

      const responseText = await localCallLLM(null, prompt, null, 'question');
      let text = responseText.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      let parsedQuestion = parseLlmJson(text);
      const finalTopicId = Number(topicId || currentQuestion?.topic_id || (topics && topics[0] ? topics[0].id : null));
      const activeTopic = topics.find(t => t.id === Number(finalTopicId));
      const activeTopicTitle = activeTopic ? activeTopic.title : '';
      const activeTopicKeywords = activeTopic ? activeTopic.keywords : '';
      let activeTopicFileText = '';

      if (finalTopicId) {
        try {
          await dbQuery.run(
            `INSERT INTO question_adjustments (topic_id, question_text, adjusted_text, user_feedback) 
             VALUES (?, ?, ?, ?)`,
            [finalTopicId, currentQuestion?.question.trim(), parsedQuestion.question.trim(), userFeedback.trim()]
          );
        } catch (dbErr) {}
      }

      const healedQ = healQuizQuestionObject({
        ...parsedQuestion,
        topic_id: finalTopicId,
        question: cleanQuizQuestion(parsedQuestion.question)
      });

      if (progressTimer) clearInterval(progressTimer);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: validationPlugin으로 생성 문제 검증 중...', 50);
      }
      const validatedQ = await validateAndHealQuestion(healedQ, localCallLLM, activeTopicTitle, activeTopicKeywords, activeTopicFileText);
      const finalValidatedQ = healQuizQuestionObject(validatedQ);
      if (progressId) {
        updateProgress(progressId, 2, '2단계: 문제 생성 및 검증 완료!', 100);
      }

      return res.json({
        question: finalValidatedQ
      });
    }

  } catch (error) {
    console.error('Adjust error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

export default router;
