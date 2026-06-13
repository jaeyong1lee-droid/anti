const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../server/index.js');
let code = fs.readFileSync(filePath, 'utf8');

const targetStr = `app.get('/api/session/theory', async (req, res) => {`;
const targetIndex = code.indexOf(targetStr);

if (targetIndex === -1) {
  console.error("Error: Could not find targetStr in server/index.js");
  process.exit(1);
}

const newEndpoint = `// POST /api/session/answersheet/add-from-topic → 토픽 원보고서를 답안지탭으로 연동 복사
app.post('/api/session/answersheet/add-from-topic', async (req, res) => {
  const { topicId } = req.body;
  try {
    // 1. Fetch topic from DB
    const topic = await dbQuery.get('SELECT title, pdf_name, pdf_data FROM topics WHERE id = ?', [topicId]);
    if (!topic) {
      return res.status(404).json({ error: '해당 토픽을 찾을 수 없습니다.' });
    }
    if (!topic.pdf_data) {
      return res.status(400).json({ error: '해당 토픽에 첨부된 원본 보고서 파일이 없습니다.' });
    }

    // 2. Parse text from the buffer
    let fileText = '';
    const pdfName = topic.pdf_name || '';
    const pdfNameLower = pdfName.toLowerCase();
    const isHtml = pdfNameLower.endsWith('.html') || pdfNameLower.endsWith('.htm') || isBufferHtml(topic.pdf_data);

    if (isHtml) {
      fileText = htmlToPlainText(topic.pdf_data.toString('utf-8'));
    } else {
      const parsedPdf = await pdfParse(topic.pdf_data);
      fileText = parsedPdf.text || '';
    }

    fileText = mergeVerticalText(fileText);

    if (!fileText || fileText.trim().length < 20) {
      return res.status(400).json({ error: '파일에서 텍스트를 추출할 수 없습니다.' });
    }

    // 3. Save to answersheet_reports
    await ensureAnswersheetReportsTable();
    const insertReportSql = \`
      INSERT INTO answersheet_reports (pdf_name, pdf_data)
      VALUES (?, ?)
    \`;
    const reportResult = await dbQuery.run(insertReportSql, [
      pdfName,
      topic.pdf_data
    ]);
    const reportId = reportResult.id;

    // 4. Perform LLM analysis (identical to upload endpoint)
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
      return res.status(400).json({ error: '등록된 AI API 키가 존재하지 않습니다.' });
    }

    if (fileText.length > 20000) {
      fileText = fileText.substring(0, 20000) + '...[중략]';
    }

    const systemInstruction = \`당신은 지반공학 및 토목구조/시공 전 분야 최고의 권위자이자 기술사 시험 전문 설계/시공 보고서 출제위원입니다. 
제공된 공학 전공 PDF/HTML 텍스트(설계보고서, 시방서, 기술 기준, 모범 답안지 등)를 정밀 분석하여 핵심 설계/해설 정보들을 발췌 및 요약하여 **여러 개의 모범 답안지 세트**로 구성한 JSON 형식으로 작성해 주세요.

JSON 규격:
{
  "theories": [
    {
      "title": "답안지/보고서 항목 명칭 (예: 테르자기 압밀 보고서)",
      "concept": "이 항목의 직관적인 요약 및 공학적 의미 설명",
      "assumptions": "필요한 전제 조건이나 설계 인자들 (있다면 번호 매겨 서술, 없으면 생략)",
      "answer": "핵심 설계 내용, 유도 공식, 시공 지침, 구체적인 계산 또는 모범 해설 내용 전체를 처음부터 끝까지 완전하게 기술. (수식은 KaTeX 기호 $...$ 또는 $$...$$로 작성하고 줄바꿈과 단락을 깊이 있게 구성)"
    }
  ]
}

반드시 다른 군더더기 텍스트나 마크다운 블록 없이 오직 지정된 JSON 구조로만 반환해 주세요.\`;

    const userPrompt = \`[문서 원본 텍스트]:\\n\${fileText}\`;

    try {
      const responseText = await callLLMWithFailover(systemInstruction, userPrompt);
      let cleanJsonText = responseText.trim();
      const startIdx = cleanJsonText.indexOf('{');
      const endIdx = cleanJsonText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        cleanJsonText = cleanJsonText.substring(startIdx, endIdx + 1);
      } else if (cleanJsonText.startsWith('\`\`\`')) {
        cleanJsonText = cleanJsonText.replace(/^\`\`\`(json)?/, '').replace(/\`\`\`$/, '').trim();
      }

      const result = parseLlmJson(cleanJsonText);
      let theories = [];
      if (result.theories && Array.isArray(result.theories)) {
        theories = result.theories;
      } else if (result.title && result.answer) {
        theories = [result];
      } else {
        throw new Error('AI 추출 정보 누락');
      }

      res.json({
        theories: theories.map(t => ({
          title: healLatexFormulas((t.title || '실시간 추출 공식').trim()),
          concept: healLatexFormulas((t.concept || '업로드한 본문 문서를 기반으로 실시간 AI가 분석한 이론식입니다.').trim()),
          assumptions: healLatexFormulas((t.assumptions || '').trim()),
          formula: healLatexFormulas((t.answer || '상세 유도 과정이 존재하지 않습니다.').trim()),
          answersheet_report_id: reportId,
          pdf_name: pdfName
        }))
      });
    } catch (llmErr) {
      console.warn('[Add from Topic AI Fallback] Gemini analysis failed. Falling back to local parser:', llmErr);
      const theories = generateLocalTheoryQuestions(pdfName, fileText);
      res.json({
        theories: theories.map(t => ({
          title: t.title.trim(),
          concept: '업로드한 본문 문서를 기반으로 분석한 로컬 마이닝 결과식입니다.',
          assumptions: '본 문서의 물리적 관계식을 기반으로 추출됨',
          answer: t.answer.trim(),
          answersheet_report_id: reportId,
          pdf_name: pdfName
        }))
      });
    }
  } catch (err) {
    console.error('POST /api/session/answersheet/add-from-topic error:', err);
    res.status(500).json({ error: err.message || 'PDF/HTML 분석에 실패했습니다.' });
  }
});

`;

const updatedCode = code.substring(0, targetIndex) + newEndpoint + code.substring(targetIndex);
fs.writeFileSync(filePath, updatedCode, 'utf8');
console.log("Successfully added add-from-topic endpoint to server/index.js");
