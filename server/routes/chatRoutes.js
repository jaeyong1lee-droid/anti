import express from 'express';
import { globalPreferredModel, resolveStageModel, callLLMWithFailover, startBackendProgressTimer, updateProgress, getMatchingTopicContent } from '../services/aiService.js';
import { ENGINEERING_STANDARDS } from '../plugins/engineeringStandards.js';
import { parseLlmJson, healLatexFormulas, LATEX_CHAT_PROMPT_INSTRUCTIONS, LATEX_PROMPT_INSTRUCTIONS } from '../utils/latexUtils.js';
import { generateAcronymTutorResponse } from '../plugins/acronymsPlugin.js';
import { generateOverviewTutorResponse } from '../plugins/overviewsPlugin.js';
import { SVG_DIAGRAM_PROMPT } from '../plugins/svgDiagramPlugin.js';
import { getWikipediaKnowledge } from '../services/wikipediaService.js';
import { getKcscVerificationContext } from '../services/kcscService.js';
import { fetchStandardGrounding } from '../services/groundingService.js';

const router = express.Router();

// POST /api/question/option-explanation
router.post('/question/option-explanation', async (req, res) => {
  const { question, options, answer, topicId, topicTitle, category } = req.body;
  const progressId = req.body.progressId || req.query.progressId;
  const preferredModel = resolveStageModel('tutor', {
    stage: 'tutor',
    stageModels: req.body?.stageModels,
    preferredModel: req.body?.preferredModel || req.query?.preferredModel
  });
  const localCallLLM = (sys, prompt, img, scenario, opts) =>
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, stage: 'tutor', preferredModel, progressId });

  if (!question || !options || !Array.isArray(options) || options.length !== 4) {
    return res.status(400).json({ error: '올바른 객관식 문제 정보가 아닙니다.' });
  }

  let progressTimer = null;
  if (progressId) {
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 보기 오답 원인 분석 중...', 90, 800, 10);
  }

  try {
    const gQuery = `${topicTitle || ''} ${question} ${options.join(' ')}`.trim();
    const { groundingBlock } = await fetchStandardGrounding(gQuery, {
      topicId,
      category,
      maxChars: 4500,
      logTag: 'option-explanation'
    });

    const prompt = `
당신은 대한민국 국가건설기준설계코드(KDS) 및 지반공학 기술사 시험 출제위원입니다.
제시하는 객관식 문제의 질문과 4개 보기 목록을 면밀히 분석하여, 각 보기(①, ②, ③, ④)가 왜 정답인지(정답 이유) 또는 왜 오답인지(오답 이유)를 아래 제공된 [공학 표준 근거 자료]와 학술 이론에 근거하여 매우 직관적이고 명확하게 기술적 관점에서 설명해 주십시오.
${groundingBlock ? `\n[🔍 공학 표준 근거 자료 (원보고서 · KCSC 국가건설기준 · Wikipedia)]:\n${groundingBlock}\n` : ''}
[질문]: ${question}
[보기 목록]:
① ${options[0]}
② ${options[1]}
③ ${options[2]}
④ ${options[3]}
[정답]: ${answer}

[요구사항]:
1. ①, ②, ③, ④의 보기별 정답/오답 원인 분석이 한눈에 들어오도록 콤팩트하게 구성하십시오 (각 보기당 1~2줄 이내 권장).
2. 제공된 [공학 표준 근거 자료]에 명시된 공식, 부호, 수치 및 기준을 최우선 근거로 삼고, 근거 자료에 없는 가상의 공식이나 허위 KDS 번호를 날조하지 마십시오.
3. ${LATEX_PROMPT_INSTRUCTIONS}
${ENGINEERING_STANDARDS}
4. 마크다운의 '\`\`\`' 등의 특수 기호로 감싸지 말고 다음의 문자열 형식으로만 곧바로 반환해 주십시오:

- **① ${options[0]}** : [정답/오답 핵심 분석] (여기에 명확하고 압축된 공학적 해설 기재)
- **② ${options[1]}** : [정답/오답 핵심 분석] ...
- **③ ${options[2]}** : [정답/오답 핵심 분석] ...
- **④ ${options[3]}** : [정답/오답 핵심 분석] ...
`;

    const responseText = await localCallLLM(null, prompt, null, 'option-explanation');
    if (progressId) {
      updateProgress(progressId, 1, '1단계: 분석 완료!', 100);
    }
    res.json({ text: responseText.trim() });
  } catch (err) {
    console.error('Error generating option explanation:', err);
    if (progressId) {
      updateProgress(progressId, 1, '오류 발생으로 분석 실패', 100);
    }
    res.status(500).json({ error: 'AI 보기 분석 해설을 생성하지 못했습니다.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

// POST /api/formula/generate-memorization-tip
router.post('/formula/generate-memorization-tip', async (req, res) => {
  const { title, concept, formula } = req.body;
  if (!title && !formula) {
    return res.status(400).json({ error: '공식 제목 또는 공식 내용이 필요합니다.' });
  }

  try {
    const prompt = `
당신은 대한민국 국가기술자격 기술사 시험 공부를 지원하는 최고 권위의 공학 전문 튜터입니다.
시험준비생들이 시험장에서 복잡한 공식의 구조를 물리적으로 이해하여 기억해낼 수 있도록 **[공식의 분모의 의미], [분자의 의미], 그리고 [각 변수의 영향]**을 물리적으로 분석한 직관적 요약(2~3문장)을 한국어로 작성해 주십시오.

[공식명칭]: ${title || '미정'}
[공식개념]: ${concept || '미정'}
[수식내용]: ${formula}

[요구사항]:
1. 직관적이고 쉬운 실무 비유나 물리적 원리를 결합하여 2~3문장으로 간결하게 답변하십시오.
2. ${LATEX_PROMPT_INSTRUCTIONS}
3. 다른 사족 설명(예: '요약은 다음과 같습니다') 없이 오직 마크다운 리스트 형태로 핵심 내용만 출력하십시오.
`;

    const responseText = await callLLMWithFailover(null, prompt, null, 'formula');
    res.json({ text: responseText.trim() });
  } catch (err) {
    console.error('Error generating formula memorization tip:', err);
    res.status(500).json({ error: '공식 암기 요약을 생성하지 못했습니다.' });
  }
});

// POST /api/formula/suggest-title
router.post('/formula/suggest-title', async (req, res) => {
  try {
    const { mathContent, fullText } = req.body;
    if (!mathContent) {
      return res.status(400).json({ error: '수식 내용이 존재하지 않습니다.' });
    }

    const systemInstruction = `당신은 대한민국 토목공학 및 토질및기초 기술사 교육 전문 튜터이자 출제위원입니다.
제시된 LaTeX 공식 수식과 기존 맥락을 면밀히 분석하여, 다음 4가지 핵심 정보를 반드시 JSON 형식으로만 반환해 주십시오. 다른 설명 텍스트나 마크다운 코드블록 기호는 절대 포함하지 마십시오.

JSON 반환 포맷:
{
  "title": "공식의 가장 적절하고 널리 쓰이는 표준 전공 명칭 (20자 이내)",
  "concept": "이 공식의 핵심 공학적 정의와 쓰임새를 설명하는 짧은 글 (2문장 이내)",
  "structure": "이 공식에 사용된 각 기호(변수)들의 정의. 반드시 각 변수 기호는 $로 감싸고 '- $기호$: 정의' 형태의 마크다운 불릿 목록으로 줄바꿈하여 작성하십시오.",
  "memorizationTip": "이 공식이 내포하는 물리적 거동 메커니즘과 직관적인 공학적 해석/의미를 설명하십시오. 절대로 암기 가사나 유치한 말장난 식의 암기 팁을 적지 말고, 수식의 분모/분자가 가지는 물리적 의미나 물성 관계를 기술사 답안지 수준의 전문적이고 직관적인 문장으로 2~3문장 서술하십시오."
}`;

    const userPrompt = `[수식]: ${mathContent}\n\n[대화 본문 맥락 및 기존정보]:\n${fullText || '(정보 없음)'}`;

    let responseText = '';
    try {
      responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'formula');
      let cleanJsonText = responseText.trim();
      const startIdx = cleanJsonText.indexOf('{');
      const endIdx = cleanJsonText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
      } else if (cleanJsonText.startsWith('```')) {
        cleanJsonText = cleanJsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      }

      const result = parseLlmJson(cleanJsonText);
      res.json({
        title: result.title || '자동 분석 공식',
        concept: result.concept || '',
        structure: result.structure || '',
        memorizationTip: result.memorizationTip || '',
        modelName: globalPreferredModel || 'gemini-3.0-flash'
      });
    } catch (err) {
      console.error('Formula suggest title LLM error:', err);
      const rawText = responseText ? responseText.substring(0, 50).trim() : '자동 분석 공식';
      res.json({
        title: rawText,
        concept: '',
        structure: '',
        memorizationTip: '',
        modelName: globalPreferredModel || 'gemini-3.0-flash'
      });
    }
  } catch (err) {
    console.error('Formula suggest title route error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/image-standards/analyze
router.post('/image-standards/analyze', async (req, res) => {
  try {
    const { base64Image, base64Images, description } = req.body;
    const incomingImages = base64Images || (base64Image ? [base64Image] : []);
    if (!incomingImages || incomingImages.length === 0) {
      return res.status(400).json({ error: '이미지 데이터가 존재하지 않습니다.' });
    }

    const imageParts = await Promise.all(incomingImages.map(async (imgStr) => {
      let targetUrl = imgStr;

      // Decode proxy URL to canonical Vercel Blob URL if it exists
      if (imgStr && imgStr.startsWith('/api/session/images/proxy')) {
        const queryStr = imgStr.split('proxy?')[1];
        const urlParams = new URLSearchParams(queryStr);
        targetUrl = urlParams.get('url') || imgStr;
      }

      if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
        try {
          const headers = {};
          if (targetUrl.includes('blob.vercel-storage.com')) {
            if (process.env.BLOB_READ_WRITE_TOKEN) {
              headers['Authorization'] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
            } else if (process.env.VERCEL_OIDC_TOKEN) {
              headers['Authorization'] = `Bearer ${process.env.VERCEL_OIDC_TOKEN}`;
            }
          }
          const resp = await fetch(targetUrl, { headers });
          const arrayBuffer = await resp.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const mimeType = resp.headers.get('content-type') || 'image/png';
          return { data: buffer.toString('base64'), mimeType };
        } catch (fetchErr) {
          console.error(`Failed to fetch image from URL: ${targetUrl}`, fetchErr);
        }
      }
      let mimeType = 'image/png';
      let rawBase64 = imgStr;
      const match = imgStr ? imgStr.match(/^data:(image\/[^;]+);base64,(.+)$/) : null;
      if (match) {
        mimeType = match[1];
        rawBase64 = match[2];
      }
      return { data: rawBase64, mimeType };
    }));

    const systemInstruction = `당신은 대한민국 토질및기초 기술사 자격시험 전문 채점위원이자 튜터입니다.
사용자가 첨부한 공학 그림/그래프/도표를 시각적으로 직접 판독하여 아래 지정된 JSON 규격으로 응답하십시오.
그림이 수치 공식식인지 경험적 경향 도표인지를 정확히 구분하여, 도표에 포함된 핵심 공식/경험식과 주요 인자/기호 정의를 시각적 판독 결과로부터 직접 추출하십시오.

JSON 포맷 규격:
{
  "title": "이 그림/그래프가 무엇을 뜻하는지 가장 명확하고 간결한 핵심 전공 주제명으로 제안(공백 포함 25자 이내)",
  "analysis": "해당 그림/그래프에 표현된 다양한 구성 요소, 변수 관계, 공학적 의미 및 거동 메커니즘을 상세히 설명하십시오.",
  "intuitive": "이 복잡한 공학 도표나 그림이 궁극적으로 설명하고자 하는 핵심 본질을 일상생활의 비유나 아주 직관적이고 쉬운 비유적 설명으로 풀어내어 작성하십시오. (최대 2~3문장)",
  "formulaTitle": "그림/그래프의 핵심 공식 또는 경험적 관계 제목",
  "formulaText": "해당 그림의 대표 핵심 수식 또는 경험식 (모든 수식은 반드시 $ 기호로 감싸서 표기)",
  "params": [
    { "symbol": "$기호$", "desc": "기호 정의 및 물리적 의미" }
  ]
}`;

    const userPrompt = description
      ? `사용자가 덧붙인 추가 설명:\n${description}\n\n이 설명과 함께 첨부된 공학 그림/그래프들을 면밀히 판독하여 분석 내용, 핵심 공식 및 인자 정의를 작성하십시오.`
      : `첨부된 공학 그림/그래프의 세부 구조, 기호 정의, 핵심 공식/경험식을 면밀히 판독하여 작성하십시오.`;

    const responseText = await callLLMWithFailover(systemInstruction, userPrompt, imageParts, 'formula');
    let cleanJsonText = responseText.trim();
    const startIdx = cleanJsonText.indexOf('{');
    const endIdx = cleanJsonText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
    } else if (cleanJsonText.startsWith('```')) {
      cleanJsonText = cleanJsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    try {
      const result = parseLlmJson(cleanJsonText);
      res.json({
        ok: true,
        title: result.title || '자동 분석 그림',
        analysis: result.analysis || '분석 정보를 가져올 수 없습니다.',
        intuitive: result.intuitive || '직관적 의미를 추출할 수 없습니다.',
        formulaTitle: result.formulaTitle || '',
        formulaText: result.formulaText || '',
        params: Array.isArray(result.params) ? result.params : []
      });
    } catch (parseErr) {
      console.error('Gemini image analyze parse error:', parseErr, 'Raw response:', responseText);
      res.json({
        ok: true,
        title: '자동 분석 그림',
        analysis: responseText,
        intuitive: '텍스트 파싱 오류로 직관적 의미를 가져오지 못했습니다.',
        formulaTitle: '',
        formulaText: '',
        params: []
      });
    }
  } catch (err) {
    console.error('POST /api/image-standards/analyze error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/image-standards/generate-question
router.post('/image-standards/generate-question', async (req, res) => {
  try {
    const { title, analysis, intuitive } = req.body;

    const systemInstruction = `당신은 대한민국 토질및기초 기술사 자격시험 전문 채점위원이자 튜터입니다.
제시된 그림의 주제(title)와 해당 그림의 공학적 분석 내용(analysis)을 면밀히 분석하십시오.
그림의 분석 내용(analysis)에 기재되어 있는 핵심 공학적 요소, 수식 기호, 변수 관계, 또는 핵심 메커니즘 중 하나를 선택하여 구체적인 주관식 질문을 생성하십시오.
질문은 반드시 물음표(?)로 끝나는 하나의 문장으로 작성하십시오.

질문 방식 예시:
- "해당 그림/그래프에서 언급된 X 기호(또는 영역)의 공학적 의의는 무엇인가?"
- "분석 내용에 따른 Y 상태에서 지반 변위가 변화하는 물리적 이유는 무엇인가?"
- "위 Z 변수의 변동을 제어하기 위한 구체적인 대책을 설명하시오."`;

    const userPrompt = `그림 주제: ${title}
그림 분석 내용:
${analysis}

위 분석 정보를 바탕으로, 해당 분석 내용 중 핵심 공학 요소 하나를 짚어서 짧고 명확한 주관식 질문문 1개를 작성하십시오. (매번 다양하게 출제되도록 무작위 시드 ${Math.random()}을 반영하십시오.)`;

    const preferredModel = resolveStageModel('question', {
      stage: 'question',
      stageModels: req.body?.stageModels,
      preferredModel: req.body?.preferredModel || req.query?.preferredModel
    });
    const responseText = await callLLMWithFailover(systemInstruction, userPrompt, null, 'formula', { stage: 'question', preferredModel });
    res.json({ success: true, question: responseText.trim() });
  } catch (err) {
    console.error('POST /api/image-standards/generate-question error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat
router.post('/chat', async (req, res) => {
  const { message, history, image, images, overviewMode, acronymMode } = req.body;
  const topicId = req.body.topicId || req.body.topic_id || null;
  const progressId = req.body.progressId || req.query.progressId;
  const preferredModel = resolveStageModel('tutor', {
    stage: 'tutor',
    stageModels: req.body?.stageModels,
    preferredModel: req.body?.preferredModel || req.query?.preferredModel
  });
  const localCallLLM = (sys, prompt, img, scenario, opts) =>
    callLLMWithFailover(sys, prompt, img, scenario, { ...opts, stage: 'tutor', preferredModel, progressId });

  const rawImages = images || (image ? (Array.isArray(image) ? image : [image]) : []);
  let imageList = [];
  if (Array.isArray(rawImages)) {
    imageList = rawImages.filter(img => img && img.data && img.mimeType);
  }
  const hasImages = imageList.length > 0;
  const imageArg = hasImages ? (imageList.length === 1 ? imageList[0] : imageList) : null;

  let progressTimer = null;
  if (progressId) {
    progressTimer = startBackendProgressTimer(progressId, 1, '1단계: AI 튜터 답변 생성 중...', 90, 1500, 5);
  }

  try {
    // 📚 모든 튜터 모드(일반/개요/두문자)에서 위키피디아 + KCSC 국가건설기준 + 등록 토픽 본문 3대 근거 조회
    let wikiGrounding = '';
    let kcscGrounding = '';
    let topicGrounding = '';
    try {
      const rawMessage = (message || '').trim();
      let queryText = rawMessage.replace(/\n\s*(?:\[답변 지침\]|반드시 다음 지침을 준수해야 합니다|필수 조건\s*:)[\s\S]*$/, '').trim();
      let fallbackCardQuestion = '';
      const userQuestionMatch = rawMessage.match(/\[사용자 질문\]\s*\n([\s\S]*?)(?:\n\s*\[답변 지침\]|$)/);
      if (userQuestionMatch && userQuestionMatch[1].trim()) {
        queryText = userQuestionMatch[1].trim();
        fallbackCardQuestion = rawMessage.match(/■\s*문제:\s*([^\n]+)/)?.[1]?.trim() || '';
      }
      if (queryText || topicId) {
        const [wRes, kRes, tRes] = await Promise.allSettled([
          getWikipediaKnowledge(queryText),
          getKcscVerificationContext(queryText),
          getMatchingTopicContent(queryText, topicId, 6000)
        ]);
        if (wRes.status === 'fulfilled') wikiGrounding = wRes.value || '';
        if (kRes.status === 'fulfilled') kcscGrounding = kRes.value || '';
        if (tRes.status === 'fulfilled') topicGrounding = tRes.value || '';

        if (!wikiGrounding && !kcscGrounding && fallbackCardQuestion) {
          const [fwRes, fkRes, ftRes] = await Promise.allSettled([
            getWikipediaKnowledge(fallbackCardQuestion),
            getKcscVerificationContext(fallbackCardQuestion),
            !topicGrounding ? getMatchingTopicContent(fallbackCardQuestion, topicId, 6000) : Promise.resolve(topicGrounding)
          ]);
          if (fwRes.status === 'fulfilled') wikiGrounding = fwRes.value || '';
          if (fkRes.status === 'fulfilled') kcscGrounding = fkRes.value || '';
          if (ftRes.status === 'fulfilled' && !topicGrounding) topicGrounding = ftRes.value || '';
        }
      }
    } catch (wErr) {
      console.warn('[Chat] Grounding lookup error:', wErr.message);
    }

    const groundingBlock = [topicGrounding, wikiGrounding, kcscGrounding].filter(Boolean).join('\n\n');

    if (overviewMode) {
      try {
        const enrichedMessage = groundingBlock
          ? `${message}\n\n[참고 근거 자료 (등록 토픽 본문 / 위키피디아 / KCSC 국가건설기준 - 표 내용 작성 시 참고하되 출력 형식은 표만 유지)]:\n${groundingBlock}`
          : message;
        const responseText = await generateOverviewTutorResponse(enrichedMessage, imageArg, localCallLLM);
        const healedText = healLatexFormulas(responseText);
        if (progressId) {
          updateProgress(progressId, 1, '1단계: 개요서 생성 완료!', 100);
        }
        return res.json({ text: healedText, wikiGrounding, kcscGrounding, topicGrounding });
      } catch (err) {
        console.error('Overview tutor generation error:', err);
        if (progressId) {
          updateProgress(progressId, 1, '오류 발생으로 개요 생성 실패', 100);
        }
        return res.status(500).json({ error: err.message || '개요 생성 실패.' });
      }
    }

    if (acronymMode) {
      try {
        const enrichedMessage = groundingBlock
          ? `${message}\n\n[참고 근거 자료 (등록 토픽 본문 / 위키피디아 / KCSC 국가건설기준 - 두문자 설명 작성 시 참고하되 출력 형식 준수)]:\n${groundingBlock}`
          : message;
        const responseText = await generateAcronymTutorResponse(enrichedMessage, imageArg, localCallLLM);
        const healedText = healLatexFormulas(responseText);
        if (progressId) {
          updateProgress(progressId, 1, '1단계: 앞글자 연상 완료!', 100);
        }
        return res.json({ text: healedText, wikiGrounding, kcscGrounding, topicGrounding });
      } catch (err) {
        console.error('Acronym tutor generation error:', err);
        if (progressId) {
          updateProgress(progressId, 1, '오류 발생으로 앞글자 생성 실패', 100);
        }
        return res.status(500).json({ error: err.message || '앞글자 생성 실패.' });
      }
    }

    // Format recent conversation history (capped to avoid multi-turn prompt bloat)
    let structuredPrompt = '';
    if (history && Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-6);
      structuredPrompt += "이전 대화 기록:\n";
      for (const msg of recentHistory) {
        const sender = msg.role === 'user' ? '수험생' : '튜터';
        const clipped = String(msg.text || '').trim().slice(0, 1200);
        structuredPrompt += `${sender}: ${clipped}\n`;
      }
      structuredPrompt += "\n현재 질문:\n";
    }

    let currentMessage = (message || '').trim();
    if (hasImages) {
      const count = imageList.length;
      if (!currentMessage) {
        currentMessage = `[첨부 이미지(${count}장) 분석 요청] 수험생이 기술사 관련 스크린샷/이미지 ${count}장을 첨부하였습니다. 각 이미지에 담긴 모든 텍스트, 문제, 수식, 그래프, 도표 간의 연계 관계를 종합적으로 판독하여, 해당 문제의 출제 의도, 명쾌한 풀이 과정 및 정확한 최종 정답을 친절하고 기술적/공학적으로 완벽히 설명해 주십시오.`;
      } else {
        currentMessage = `[첨부 이미지(${count}장) 분석 요청] 수험생이 ${count}장의 이미지(스크린샷)와 함께 다음 질문을 보냈습니다: "${currentMessage}". 첨부된 모든 이미지에 표현된 핵심 기술적 문제, 수식, 다이어그램, 텍스트 등을 최우선으로 상호 대조 분석하여 질문에 매우 구체적이고 체계적으로 답변해 주십시오.`;
      }
    }
    structuredPrompt += currentMessage;

    if (groundingBlock) {
      structuredPrompt = `${groundingBlock}\n\n${structuredPrompt}`;
    }

    try {
      const systemInstruction = `당신은 대한민국 국가기술자격 기술사 시험(토질및기초기술사, 토목구조기술사, 토목시공기술사, 도로및공항기술사, 수자원개발기술사, 상하수도기술사, 터널기술사 등 토목공학 전 분야) 최고 권위의 기술사 시험 전문 튜터입니다.
수험생의 질문이나 이미지 자료에 대해 학회 표준 및 기술사 시험 수준의 전문 용어를 사용하여 매우 깊이 있는 기술적/실무적 답변을 제시해 주십시오.

[기본 원칙]:
1. 토목공학 전 분야의 유기적 지식 활용:
   - 지반공학(토질 및 기초, 터널), 구조공학(콘크리트, 강구조, 교량), 시공 및 사업관리, 도로, 수자원 등 전 분야에 걸친 깊이 있는 지식을 기반으로 자연스럽고 전문성 높은 지식의 전파.
2. 개념의 기술적/실무적 정확성 확보:
   - 특정 공학적 원리나 거동 메커니즘을 설명할 때는 기술적 맥락을 정확히 파악하여 주동/수동 관점을 명확히 구분하고 균형 있게 설명하십시오.
   - **실제 전공 설계 기준이나 정립된 공학 이론만을 근거로 삼아야 하며, 임의로 부적절한 수학 공식이나 비현실적인 공학 논리를 조합(창작)하지 마십시오.**
   - 물리적 거동 메커니즘을 명확하게 파악하여 논리적 인과관계를 철저히 고수해 주십시오.
3. 환각(Hallucination) 현상 방지:
   - "현재 예측 Canvas에 그려진 문서", "우측 화면의 캔버스", "상단 문서 뷰어" 등 실제 애플리케이션 인터페이스 요소를 멋대로 추측하거나 언급하지 마십시오.
   - **[이미지/스크린샷 판독 최우선]**: 만약 사용자가 이미지(캡처 사진, 문제지 사진 등)를 전송하여 질문한 경우, 이미지 내부의 수식, 필기, 표, 그래프를 최우선으로 판독하고 이를 대화 메시지와 종합하여 답변을 도출하십시오.
4. 겸손하고 전문적인 튜터 태도 유지.
5. 고품질 학술 구조 및 직관적 설명 보완:
   - 공인된 전공 교재의 품질에 걸맞도록 체계적인 개요를 지반공학 정보에 입각하여 자연스럽게 구성하십시오.
   - 개별 이론이나 공법, 개념을 비교 설명할 때는 불필요한 공백 라인을 줄이고 중제목(###)으로 구조를 명확히 분할하십시오 (예: ### 1. 핵심 개념 및 원리 등).
   - 표(Table)를 사용할 경우 반드시 마크다운 테이블 표준 포맷(| 구분 | 공법 A | 공법 B |)만을 이용해 작성하십시오.
6. [중요 키워드 강조 및 볼드 포맷 규칙]:
   - 답변 작성 시 지반역학 및 토목공학의 핵심 용어, 파괴 영역/존 명칭, 중요 공학 기전, 핵심 물리량 및 설계 조치 등의 중요 키워드들은 수험생이 한눈에 파악할 수 있도록 반드시 **더블 별표**(**키워드**)로 감싸서 작성해 주십시오.
7. [문장 수준별 머리기호 불릿 계층화 규칙]:
   - 답변 작성 시 동일한 별표(*)를 모든 레벨에 무분별하게 남발하지 말고, 문장 수준(계층 구조/Depth)에 따라 머리기호 불릿을 엄격히 구분하여 작성하십시오:
     * 1수준 (상위 대항목/핵심 질문/대주제): 작은 크기 불릿 ('• ')
     * 2수준 (중위 세부 설명/원리/상황): 작은 빈 불릿 ('◦ ')
     * 3수준 (하위 부가 요소/소항목): 그냥 일반 점 ('· ')
     * 4수준 (세부 설명/추가 보충): 대시 ('- ') 또는 별표 ('* ')
${ENGINEERING_STANDARDS}
${SVG_DIAGRAM_PROMPT}
${LATEX_CHAT_PROMPT_INSTRUCTIONS}`;

      const responseText = await localCallLLM(systemInstruction, structuredPrompt, imageArg, 'tutor');
      const healedText = healLatexFormulas(responseText);
      if (progressId) {
        updateProgress(progressId, 1, '1단계: 답변 생성 완료!', 100);
      }
      res.json({
        text: healedText,
        wikiGrounding,
        kcscGrounding,
        topicGrounding
      });
    } catch (err) {
      console.error('Chat route error:', err);
      if (progressId) {
        updateProgress(progressId, 1, '오류 발생으로 답변 실패', 100);
      }
      res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
    }
  } catch (err) {
    console.error('Chat route error:', err);
    if (progressId) {
      updateProgress(progressId, 1, '오류 발생으로 답변 실패', 100);
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }
});

export default router;
