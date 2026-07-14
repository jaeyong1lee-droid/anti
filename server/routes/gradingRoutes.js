import express from 'express';
import pdfParse from 'pdf-parse';
import { dbQuery } from '../database.js';
import { callLLMWithFailover, analyzeStandardsBeforeTask, getTopicText, startBackendProgressTimer, updateProgress, stopBackendProgressTimer } from '../services/aiService.js';
import { healQuizQuestionObject, parseLlmJson, healLatexFormulas } from '../utils/latexUtils.js';
import * as fileUtils from '../utils/fileUtils.js';
import { generateFallbackQuestions } from '../fallback_generator.js';
import { gradeSubjective, GRADING_STANDARDS, gradingStandardsList } from '../plugins/gradingPlugin.js';
import { ENGINEERING_STANDARDS, standardsList as engineeringStandardsList } from '../plugins/engineeringStandards.js';
import { GENERATION_STANDARDS, generationStandardsList } from '../plugins/generationStandards.js';
import { FLOWCHART_QUIZ_GENERATION_PROMPT } from '../plugins/flowchartQuizPlugin.js';
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
  const isFlowchart = q.includes('┌──') || q.includes('▼') || q.includes('```') || q.includes('흐름도') || q.includes('플로우차트');
  if (isFlowchart) return q.trim();
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
  } catch (e) {
    console.error('getFormattedTopicInstructions error:', e);
  }
  return '';
}

// POST /api/grade-subjective -> AI Subjective Grading
router.post('/grade-subjective', async (req, res) => {
  const { question, correctAnswer, userAnswer, rowHeader, colHeader, explanation, category } = req.body;
  const progressId = req.body.progressId || req.query.progressId;

  const dynamicGradingStandards = gradingStandardsList && gradingStandardsList.length > 0
    ? gradingStandardsList.map(s => s.content).join('\n\n')
    : GRADING_STANDARDS;
  const dynamicEngineeringStandards = engineeringStandardsList && engineeringStandardsList.length > 0
    ? engineeringStandardsList.map(s => s.content).join('\n\n')
    : ENGINEERING_STANDARDS;

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

function parseOverviewContentServer(content) {
  const result = { definition: '', mechanism: '' };
  if (!content || typeof content !== 'string') return result;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '|') continue;
    if (trimmed.includes(':---') || (trimmed.startsWith('|') && trimmed.includes('구분') && trimmed.includes('내용'))) {
      continue;
    }

    const sectionMatch = trimmed.match(/^\|\s*([^|]+)\s*\|?\s*([\s\S]*)$/);
    if (sectionMatch) {
      const rawKey = sectionMatch[1].trim();
      let rawVal = sectionMatch[2].trim();
      if (rawVal.endsWith('|')) {
        rawVal = rawVal.slice(0, -1).trim();
      }

      if (rawKey.includes('개요')) {
        result.definition = rawVal;
      } else if (rawKey.includes('메커니즘')) {
        result.mechanism = rawVal;
      }
    }
  }
  return result;
}

function parseMarkdownTableServer(questionText) {
  if (!questionText) return null;
  const lines = questionText.split('\n');
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line !== '|') {
      if (startIdx === -1) {
        startIdx = i;
      }
      endIdx = i;
    } else {
      if (startIdx !== -1) {
        break;
      }
    }
  }

  const parseRowCells = (rowText) => {
    let cells = rowText.split('|').map(c => c.trim());
    while (cells.length > 0 && cells[0] === '') cells.shift();
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    return cells;
  };

  if (startIdx !== -1 && endIdx !== -1 && (endIdx - startIdx) >= 2) {
    const headers = parseRowCells(lines[startIdx]);
    
    const separatorLine = lines[startIdx + 1];
    if (separatorLine.includes('---')) {
      const rows = [];
      for (let i = startIdx + 2; i <= endIdx; i++) {
        const rowCells = parseRowCells(lines[i]);
        rows.push(rowCells);
      }
      return { headers, rows };
    }
  }
  return null;
}

// POST /api/question/regenerate -> Regenerate a single question
router.post('/question/regenerate', async (req, res) => {
  const { mode, topicId, currentQuestion, questionIdx, allQuestions, targetTypeSelection } = req.body;
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
    let mixedType = currentQuestion?.mixedType;
    const isMixedId = topicId && String(topicId).startsWith('mixed_');
    const isFlowchartQ = !!(
      (currentQuestion?.question || '').includes('┌──') ||
      (currentQuestion?.question || '').includes('▼') ||
      (currentQuestion?.question || '').includes('플로우차트') ||
      (currentQuestion?.question || '').includes('흐름도')
    );

    // 믹스복습이든 일반 복습이든 해당 문항의 실제 원본 토픽 ID 구하기 및 교재 텍스트 조회
    const finalTopicId = (isMixedId && currentQuestion?.originalTopicId) ? currentQuestion.originalTopicId : topicId;
    let fileText = '';
    let topicTitle = '';
    if (finalTopicId) {
      const topic = await dbQuery.get(
        `SELECT id, title, keywords, pdf_name, category, pdf_url, extracted_text FROM topics WHERE id = ?`, 
        [finalTopicId]
      );
      if (topic) {
        topicTitle = topic.title;
        fileText = await getTopicText(topic, fileUtils, ocrPlugin, pdfParse);
        fileText = fileUtils.smartTruncate(fileText, 25000);
      }
    }

    if ((topicId && String(topicId).startsWith('mixed_')) || currentQuestion?.mixedType) {
      mixedType = currentQuestion?.mixedType;
      const qText = currentQuestion?.question || '';
      
      // Robust auto-detect or heal mixedType based on title prefix or unique fields
      if (qText.startsWith('[개요 복습]')) {
        mixedType = 'overview';
      } else if (qText.startsWith('[그림 암기 복습]') || qText.startsWith('[그림 복습]')) {
        mixedType = 'image';
      } else if (qText.startsWith('[앞글자 복습]')) {
        mixedType = 'acronym';
      } else if (qText.startsWith('[표 복습]')) {
        mixedType = 'table';
      } else if (currentQuestion?.acronym || currentQuestion?.sentence || currentQuestion?.correctRows) {
        mixedType = 'acronym';
      } else if (currentQuestion?.answers) {
        mixedType = 'table';
      }

      if (!mixedType) {
        mixedType = currentQuestion?.acronym ? 'acronym' : 'table';
      }

      if ((mixedType === 'image' || mixedType === 'overview') && !isFlowchartQ) {
        if (progressTimer) {
          clearInterval(progressTimer);
          stopBackendProgressTimer(progressId, 100, '성공적으로 재출제했습니다!', true);
        }

        let healedQuestion = { ...currentQuestion, mixedType };
        
        // Auto-heal previously corrupted overview questions back to 주관식 (표채우기) TableQuiz layout
        if (mixedType === 'overview') {
          healedQuestion.type = '주관식 (표채우기)';
          healedQuestion.subtype = '표채우기';

          // Retrieve raw content from formula_overviews session store in database to ensure clean markdown pipes
          const ovSession = await dbQuery.get("SELECT value FROM app_session WHERE key = 'formula_overviews'");
          let originalContent = healedQuestion.explanation || '';
          if (ovSession && ovSession.value) {
            try {
              const parsedSession = JSON.parse(ovSession.value);
              const overviewsList = parsedSession.formulaOverviews || [];
              const cleanTitle = healedQuestion.question.replace(/^\[.*?\]\s*/, '').trim();
              const matchedOv = overviewsList.find(ov => ov.id === healedQuestion.originalId || ov.title === cleanTitle);
              if (matchedOv && matchedOv.content) {
                originalContent = matchedOv.content;
              }
            } catch (err) {
              console.error('Error parsing formula_overviews session:', err);
            }
          }

          // Extract original definition, mechanism, and comparison table text from parsed content
          const parsed = parseOverviewContentServer(originalContent);
          const answers = {};
          const rows = [];
          
          if (parsed.definition) {
            answers['INPUT_0_1'] = parsed.definition;
            rows.push(['학술적 정의', '[INPUT_0_1]']);
          }
          if (parsed.mechanism) {
            const rowIdx = rows.length;
            answers[`INPUT_${rowIdx}_1`] = parsed.mechanism;
            rows.push(['공학적 작동 메커니즘', `[INPUT_${rowIdx}_1]`]);
          }

          let comparisonTableData = null;
          if (parsed.comparison) {
            let normalizedComparison = parsed.comparison;
            normalizedComparison = normalizedComparison.split('\n').map(line => {
              let l = line.trim();
              if (l && l.includes('|')) {
                if (!l.startsWith('|')) l = '| ' + l;
                if (!l.endsWith('|')) l = l + ' |';
              }
              return l;
            }).join('\n');

            const parsedComp = parseMarkdownTableServer(normalizedComparison);
            if (parsedComp && parsedComp.headers && parsedComp.rows) {
              const compRows = parsedComp.rows.map((row, rIdx) => {
                return row.map((cell, cIdx) => {
                  if (cIdx === 0) return cell;
                  const inputId = `INPUT_${rows.length + rIdx}_${cIdx}`;
                  answers[inputId] = cell;
                  return `[${inputId}]`;
                });
              });
              comparisonTableData = {
                headers: parsedComp.headers,
                rows: compRows
              };
            }
          }

          let explanationHtml = '';
          if (parsed.definition) {
            explanationHtml += `📖 **학술적 정의**\n${parsed.definition}\n\n`;
          }
          if (parsed.mechanism) {
            explanationHtml += `⚙️ **공학적 작동 메커니즘**\n${parsed.mechanism}\n\n`;
          }
          if (parsed.comparison) {
            explanationHtml += `⚖️ **비교표 / 장단점**\n${parsed.comparison}\n\n`;
          }

          healedQuestion.tableData = {
            headers: ['구분', '내용'],
            rows: rows
          };
          healedQuestion.comparisonTableData = comparisonTableData;
          healedQuestion.answers = answers;
          healedQuestion.explanation = explanationHtml;

          delete healedQuestion.acronym;
          delete healedQuestion.sentence;
          delete healedQuestion.correctRows;
          delete healedQuestion.concept;
          delete healedQuestion.formula;
        }

        return res.json({
          question: healedQuestion,
          isFallback: false
        });
      }
      
      const content = currentQuestion.explanation || '';
      let systemPrompt = "당신은 지반공학 기술사 시험 전문 출제위원 및 튜터입니다.";
      let userPrompt = "";

      if (isFlowchartQ) {
        const prevAnswers = Object.values(currentQuestion?.answers || {}).join(', ');
        const flowchartDuplicationPrompt = `
[🚨 흐름도 문제 재생성 특수 철칙 (내용 및 빈칸 셔플링 강제)]:
1. **[페어형 빈칸 출제 의무화]**: 이번 재생성 문제에서는 흐름도 전체 상자 개수의 **정확히 40% 계산 후 소수점 이하 올림(Ceil)**에 해당하는 상자 개수(예: 총 3개 상자인 경우 **2개 상자**, 총 7개 상자인 경우 **3개 상자**)를 비워야 합니다. 비울 때는 반드시 선택한 상자의 **"단계 제목"과 "세부 내용" 세트를 통째로 비우십시오.** 
   - 이로 인해 빈칸 기호는 알파벳 순서대로 **(A), (B), (C), (D) ...** 형태로 순차적으로 뚫리게 됩니다. (빈칸 수량 유동적)
2. **[🚨 이웃한 상자 연속 빈칸 처리 엄격 금지 (No Consecutive Blanks)]**: 
   - 이웃한 상자 단계를 연달아 비우는 것은 절대로 금지됩니다. 상자는 무조건 최소 한 단계 이상 띄어서 띄엄띄엄 비워져야 합니다.
3. **[🚨 [2, 4, 마지막] 고착화 완전 금지 및 대체 무작위 조합 사용]**:
   - 항상 [2번 상자, 4번 상자, 마지막 상자]만 빈칸으로 뚫는 고질적인 패턴 모방 고착화 현상을 완전히 금지합니다.
   - 이번 재생성에서는 반드시 연속하지 않는 다른 상자 조합을 무작위로 새로 선택하여 비우십시오.
4. **[🚨 70자 가로폭 닫힌 박스 규격 원상복구]**: 모든 상자의 크기는 가로 폭을 **정확히 동일한 70칸 너비**로 통일하여 닫힌 박스(Closed Box) 형태를 취하게 하십시오. 한글은 2자, 영어/기호/공백은 1자로 정밀 계산하여 세로선을 칼정렬해야 합니다.
5. **[기존 빈칸 및 정답의 100% 원천 배제]**: 
   - 기존의 빈칸 정답들은 다음과 같습니다: [ ${prevAnswers || '없음'} ]
   - 이번 재생성에서는 **기존에 뚫려 있던 위 단계 정답 단어들을 절대로 정답 타겟으로 삼지 마십시오.** 즉, 이전 문제에서 비워두었던 상자는 이번 문제에서는 설명 텍스트를 고스란히 복원해 두고, **이전에 비어있지 않고 차있던 상자 중 M개를 새로 골라 빈칸으로 비워야 합니다.**
6. **[동적 tableData/answers 스키마]**: 뚫어낸 빈칸의 개수(총 6개)에 맞추어 tableData의 rows와 answers의 INPUT도 정확히 6개(INPUT_1부터 INPUT_6까지)로 동적 구성하여 JSON을 출력하십시오.
7. **[🚨 상자 내부 기술사급 상세 내용 기입 철칙 - 간소화 금지]**: 
   - 각 단계별 박스 내부의 텍스트 설명은 대충 명사 몇 개로 단순 요약 나열하는 것을 절대 금지합니다.
8. **[질문 지문에 토픽 제목 필수 명시]**: 질문("question" 필드) 텍스트를 작성할 때 단순히 "다음 흐름도를 보고"라고 작성하는 것을 절대 금지하며, 반드시 해당 토픽의 구체적인 제목/주제명을 포함한 "다음 [토픽명] 흐름도를 보고..." 형식으로 질문 지문을 작성해야 합니다.
`;

        systemPrompt = `당신은 기술사 시험 출제위원입니다.
${flowchartDuplicationPrompt}
[출제 요구사항]:
반드시 기초 문제를 변형/응용하여 새로운 문제를 출제하십시오.
[주관식 (표채우기) 유형으로 아스키 흐름도 문제를 생성하십시오]
${GENERATION_STANDARDS}
${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
${FLOWCHART_QUIZ_GENERATION_PROMPT}

오직 순수 JSON 데이터만 반환하십시오.
[응답 포맷]:
{"type": "주관식 (표채우기)", "question": "질문(마크다운 고정폭 코드블록으로 감싼 아스키 흐름도 포함)", "tableData": {"headers": ["빈칸 구분", "입력 답안"], "rows": [["(A)", "[INPUT_1]"], ["(B)", "[INPUT_2]"], ["(C)", "[INPUT_3]"], ["(D)", "[INPUT_4]"]]}, "answers": {"INPUT_1": "(A)정답", "INPUT_2": "(B)정답", "INPUT_3": "(C)정답", "INPUT_4": "(D)정답"}, "explanation": "해설"}`;

        userPrompt = `[토픽 원본 학습자료]:
${fileText || '없음'}

[기초 소스 문제]:
- 질문: ${currentQuestion?.question}
- 유형: 주관식 (표채우기)
- 기존 정답: ${prevAnswers || ''}

위 데이터를 바탕으로 JSON 포맷으로 재출제해 주십시오.`;
      } else if (mixedType === 'table') {
        systemPrompt = `당신은 지반공학 기술사 시험 전문 튜터이자 출제위원입니다.
제시된 비교/대비 표 데이터를 기반으로, 수험생이 학습할 수 있는 참신한 표 빈칸 채우기(Table Quiz) 문항을 새로 구성하여 출제해 주십시오.
${GENERATION_STANDARDS}
${ENGINEERING_STANDARDS}
제시된 HTML 테이블 소스를 성실히 반영하여 JSON 포맷으로 재출제해 주십시오.`;
        userPrompt = `[원본 비교 표 HTML]:\n${content}\n\n[기존 문제 질문]:\n${currentQuestion.question || ''}\n\n위 데이터를 바탕으로 JSON 포맷으로 재출제해 주십시오.`;
      } else {
        systemPrompt = `당신은 지반공학 기술사 시험 전문 튜터이자 출제위원입니다.
제시된 앞글자(두문자) 암기법 데이터를 기반으로 새롭게 두문자 조합 및 연상문장을 반환해 주십시오.
${GENERATION_STANDARDS}`;
        userPrompt = `[원본 두문자 암기법 정보]:\n${content}\n\n위 데이터를 바탕으로 JSON 포맷으로 재출제해 주십시오.`;
      }

      const response = await localCallLLM(systemPrompt, userPrompt, null, isFlowchartQ ? 'flowchart_quiz_gen' : (mixedType === 'table' ? 'mixed_table_regen' : 'mixed_acronym_regen'), { temperature: 1.0 });
      let parsed = {};
      try {
        const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanJson);
      } catch (err) {
        throw new Error('AI 응답 파싱 실패');
      }

      if (isFlowchartQ) {
        parsed.type = '주관식 (표채우기)';
        parsed.subtype = '표채우기';
        parsed.explanation = content;
        parsed.mixedType = 'table';
      } else if (mixedType === 'table') {
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

      // Preserve metadata and title/question from the current question
      const finalQuestion = {
        ...currentQuestion,
        ...parsed,
        mixedType: isFlowchartQ ? 'table' : mixedType
      };

      // Clean up mismatched properties during conversion to avoid corruption
      if (isFlowchartQ || mixedType === 'table') {
        delete finalQuestion.acronym;
        delete finalQuestion.sentence;
        delete finalQuestion.correctRows;
      } else if (mixedType === 'acronym') {
        delete finalQuestion.subtype;
      }

      if (progressTimer) clearInterval(progressTimer);
      if (progressId) stopBackendProgressTimer(progressId, 100, '성공적으로 재출제했습니다!', true);

      return res.json({
        question: finalQuestion,
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
      const finalTopicId = (isMixedId && currentQuestion?.originalTopicId) ? currentQuestion.originalTopicId : topicId;
      if (!finalTopicId) {
        return res.status(400).json({ error: '토픽 ID가 제공되지 않았습니다.' });
      }
      const topic = await dbQuery.get(`SELECT id, title, keywords, pdf_name, category, pdf_url, extracted_text FROM topics WHERE id = ?`, [finalTopicId]);
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
      const isFlowchartQ = !!(
        (currentQuestion?.question || '').includes('┌──') ||
        (currentQuestion?.question || '').includes('▼') ||
        (currentQuestion?.question || '').includes('플로우차트') ||
        (currentQuestion?.question || '').includes('흐름도') ||
        (currentQuestion?.question || '').includes('메커니즘') ||
        (currentQuestion?.question || '').includes('절차') ||
        (currentQuestion?.question || '').includes('순서') ||
        (currentQuestion?.question || '').includes('과정')
      );

      if (targetTypeSelection === 'mc') {
        targetType = '객관식 (4지선다)';
      } else if (targetTypeSelection === 'subj') {
        targetType = '주관식 (단답형)';
        const rand = Math.floor(Math.random() * 2);
        targetSubtype = rand === 0 ? '12번형태' : '13번형태';
      } else if (targetTypeSelection === 'table') {
        targetType = '주관식 (표채우기)';
      } else {
        if (isFlowchartQ) {
          targetType = '주관식 (표채우기)';
        } else if (currentType.includes('개요')) targetType = '주관식 (개요)';
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
      if (isFlowchartQ) {
        typeRequirement = `[주관식 (표채우기) 유형으로 아스키 흐름도 문제를 생성하십시오]`;
        formatRequirement = `{"type": "주관식 (표채우기)", "question": "질문(마크다운 고정폭 코드블록으로 감싼 아스키 흐름도 포함)", "tableData": {"headers": ["빈칸 구분", "입력 답안"], "rows": [["(A)", "[INPUT_1]"], ["(B)", "[INPUT_2]"], ["(C)", "[INPUT_3]"], ["(D)", "[INPUT_4]"]]}, "answers": {"INPUT_1": "(A)정답", "INPUT_2": "(B)정답", "INPUT_3": "(C)정답", "INPUT_4": "(D)정답"}, "explanation": "해설"}`;
      } else if (targetType === '주관식 (개요)') {
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

      let flowchartDuplicationPrompt = '';
      if (isFlowchartQ) {
        const prevAnswers = Object.values(currentQuestion?.answers || {}).join(', ');
        flowchartDuplicationPrompt = `
[🚨 흐름도 문제 재생성 특수 철칙 (내용 및 빈칸 셔플링 강제)]:
1. **[페어형 빈칸 출제 의무화]**: 이번 재생성 문제에서는 흐름도 전체 상자 개수의 **정확히 40% 계산 후 소수점 이하 올림(Ceil)**에 해당하는 상자 개수(예: 총 3개 상자인 경우 **2개 상자**, 총 7개 상자인 경우 **3개 상자**)를 비워야 합니다. 비울 때는 반드시 선택한 상자의 **"단계 제목"과 "세부 내용" 세트를 통째로 비우십시오.** 
   - 이로 인해 빈칸 기호는 알파벳 순서대로 **(A), (B), (C), (D) ...** 형태로 순차적으로 뚫리게 됩니다. (빈칸 수량 유동적)
   - 첫 번째 비워진 박스: [ (A) ] 와 - (B)
   - 두 번째 비워진 박스: [ (C) ] 와 - (D)
   - 세 번째 비워진 박스(존재 시): [ (E) ] 와 - (F)
2. **[🚨 이웃한 상자 연속 빈칸 처리 엄격 금지 (No Consecutive Blanks)]**: 
   - 이웃한 상자 단계를 연달아 비우는 것은 절대로 금지됩니다 (예: 2번 상자와 3번 상자를 동시에 빈칸으로 만드는 것은 절대 금지). 상자는 무조건 최소 한 단계 이상 띄어서 띄엄띄엄 비워져야 합니다.
3. **[🚨 [2, 4, 마지막] 고착화 완전 금지 및 대체 무작위 조합 사용]**:
   - 항상 [2번 상자, 4번 상자, 마지막 상자]만 빈칸으로 뚫는 고질적인 패턴 모방 고착화 현상을 완전히 금지합니다.
   - 이번 재생성에서는 반드시 연속하지 않는 다른 상자 조합(예: [1, 3, 5], [1, 4, 6], [2, 5, 7], [1, 3, 6] 등) 중 하나를 무작위로 새로 선택하여 비우십시오.
4. **[🚨 70자 가로폭 닫힌 박스 규격 원상복구]**: 모든 상자의 크기는 가로 폭을 **정확히 동일한 70칸 너비**로 통일하여 닫힌 박스(Closed Box) 형태를 취하게 하십시오. 한글은 2자, 영어/기호/공백은 1자로 정밀 계산하여 세로선을 칼정렬해야 합니다.
5. **[기존 빈칸 및 정답의 100% 원천 배제]**: 
   - 기존의 빈칸 정답들은 다음과 같습니다: [ ${prevAnswers || '없음'} ]
   - 이번 재생성에서는 **기존에 뚫려 있던 위 단계 정답 단어들을 절대로 정답 타겟으로 삼지 마십시오.** 즉, 이전 문제에서 비워두었던 상자는 이번 문제에서는 설명 텍스트를 고스란히 복원해 두고, **이전에 비어있지 않고 차있던 상자 중 M개를 새로 골라 빈칸으로 비워야 합니다.**
6. **[동적 tableData/answers 스키마]**: 뚫어낸 빈칸의 개수(총 6개)에 맞추어 tableData의 rows와 answers의 INPUT도 정확히 6개(INPUT_1부터 INPUT_6까지)로 동적 구성하여 JSON을 출력하십시오.
7. **[🚨 상자 내부 기술사급 상세 내용 기입 철칙 - 간소화 금지]**: 
   - 각 단계별 박스 내부의 텍스트 설명은 대충 명사 몇 개로 단순 요약 나열하는 것을 절대 금지합니다.
   - 예: [4] 안정성 및 변위 검토 단계에서는 단순히 '벽체 근입 깊이, 지지구조 배치, 벽체 강성 검토'라고 나열하지 말고, 반드시 다음 세 가지 공학 요소들을 구체적으로 서술하십시오.
     * 벽체 근입 깊이 검토 시: 구체적인 계산 공식 기입 (예: 토압 균형 조건, 또는 Sands/Clays 지반별 최소 근입 깊이 $D \\ge 0.5H_{exc}$ 등)
     * 지보재/지지구조 배치 시: 구체적인 공법/구조 장치 종류 명시 (예: H-Pile+토류판, CIP, SCW, 연속벽(D-Wall) 종류 및 Strut, Earth Anchor, IPS, Raker, 축대칭 띠장 등)
     * 벽체 강성($EI$) 검토 시: 구체적인 공식 기입 (예: $EI \\ge M_{max} / \\sigma_{all}$ 또는 응력 검토식 등 공식)
8. **[질문 지문에 토픽 제목 필수 명시]**: 질문("question" 필드) 텍스트를 작성할 때 단순히 "다음 흐름도를 보고"라고 작성하는 것을 절대 금지하며, 반드시 해당 토픽의 구체적인 제목/주제명을 포함한 "다음 [토픽명] 흐름도를 보고..." 형식으로 질문 지문을 작성해야 합니다.
`;
      }

      const prompt = `당신은 기술사 시험 출제위원입니다.
${duplicatePreventionPrompt}
${flowchartDuplicationPrompt}
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

${isFlowchartQ ? FLOWCHART_QUIZ_GENERATION_PROMPT : ''}

오직 순수 JSON 데이터만 반환하십시오.
[응답 포맷]:
${formatRequirement}`;

      const responseText = await localCallLLM(null, prompt, null, 'question', { temperature: 1.0 });
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
        topic_id: Number(finalTopicId),
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
          } catch (e) {
            console.warn('Failed to extract text from file buffer in mixed pool:', e);
          }
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

      const responseText = await localCallLLM(null, prompt, null, 'question', { temperature: 1.0 });
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

      const responseText = await localCallLLM(null, prompt, null, 'question', { temperature: 1.0 });
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
          // Prune: keep only the 20 most recent adjustment records per topic to prevent unbounded growth
          try {
            await dbQuery.run(
              `DELETE FROM question_adjustments
               WHERE topic_id = ? AND id NOT IN (
                 SELECT id FROM question_adjustments WHERE topic_id = ? ORDER BY id DESC LIMIT 20
               )`,
              [finalTopicId, finalTopicId]
            );
          } catch (pruneErr) {
            console.error('Failed to prune question_adjustments:', pruneErr);
          }
        } catch (e) {
          console.error('Failed to insert question_adjustments:', e);
        }
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
          } catch (e) {
            console.warn('Failed to extract text from file buffer in single adjust:', e);
          }
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

      const responseText = await localCallLLM(null, prompt, null, 'question', { temperature: 1.0 });
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
          // Prune: keep only the 20 most recent adjustment records per topic to prevent unbounded growth
          try {
            await dbQuery.run(
              `DELETE FROM question_adjustments
               WHERE topic_id = ? AND id NOT IN (
                 SELECT id FROM question_adjustments WHERE topic_id = ? ORDER BY id DESC LIMIT 20
               )`,
              [finalTopicId, finalTopicId]
            );
          } catch (pruneErr) {}
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
