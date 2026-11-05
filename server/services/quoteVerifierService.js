/**
 * 🛡️ NotebookLM 방식 원문 인용 강제 + LaTeX-Aware 1:1 원문 일치 검증기 (Option B - Cloud/Mobile Native)
 * - AI 프로젝트(tunnel_estimator/core/quote_verifier.py & grounding_verifier.py)의 핵심 검증 로직을
 *   안티 프로젝트(Node.js + Vercel Serverless + 모바일 웹 환경)에 네이티브 이식한 모듈입니다.
 * - [수칙 #8 준수]: 특정 토픽이나 수식을 절대 하드코딩하지 않고 100% 동적 사료 번들(Fact Dossier) 대조만 수행합니다.
 * - [수칙 #10 준수]: 기존 LatexRenderer.jsx 및 latexUtils.js를 절대 수정하지 않고, 본 모듈 내부의 격리된 정규화 헬퍼만 사용합니다.
 */

export const MIN_QUOTE_CHARS = 12;

/**
 * LaTeX 수식 및 공학 단위를 평문 사료와 1:1 대조하기 위한 격리 정규화 헬퍼
 * (예: "$q_u \ge 1.5\text{ MPa}$" <-> "qu >= 1.5 mpa", "1㎥" <-> "1m3", "500㎜" <-> "500mm")
 */
export function normalizeLatexAwareText(text) {
  if (!text) return '';
  let t = String(text);

  // 1. 공학 특수 단위 기호 표준화 (quote_verifier.py 동일 규격 + 확장)
  t = t
    .replace(/㎥/g, 'm3')
    .replace(/㎡/g, 'm2')
    .replace(/㎜/g, 'mm')
    .replace(/㎝/g, 'cm')
    .replace(/㎞/g, 'km')
    .replace(/㎏/g, 'kg')
    .replace(/℃/g, 'c')
    .replace(/°c/gi, 'c')
    .replace(/tonf/gi, 't');

  // 2. LaTeX 래퍼 및 서식 명령어 제거 (격리 처리)
  t = t
    .replace(/\$\$/g, ' ')
    .replace(/\$/g, ' ')
    .replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|textbf|textit)\s*\{([^}]*)\}/g, '$1')
    .replace(/\\(?:left|right|big|Big|bigg|Bigg)\b/g, '')
    .replace(/\\(?:dfrac|frac)\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '$1/$2')
    .replace(/\\(?:ge|geq)\b/g, '>=')
    .replace(/\\(?:le|leq)\b/g, '<=')
    .replace(/\\(?:ne|neq)\b/g, '!=')
    .replace(/\\(?:approx|sim)\b/g, '~')
    .replace(/\\(?:times|cdot)\b/g, '*')
    .replace(/\\(?:pm)\b/g, '+-')
    // 첨자 및 중괄호 기호 정규화 (예: q_u -> qu, \sigma'_v -> \sigmav)
    .replace(/[_^]\s*\{([^}]*)\}/g, '$1')
    .replace(/[_^]([a-zA-Z0-9]+)/g, '$1')
    .replace(/[{}]/g, '');

  // 3. 마크다운 강조/불릿 기호 및 공백 정규화
  t = t
    .replace(/\*\*/g, '')
    .replace(/[`"'\u2018\u2019\u201C\u201D]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return t;
}

/**
 * 사료 번들(Fact Dossier) 조립기
 * - 원보고서/해설(topic/explanation) + 국가건설기준(KCSC) + 영문 위키피디아(Wikipedia) 통합
 */
export function buildFactDossier({ topicText = '', explanation = '', kcscContext = '', wikiGrounding = '' } = {}) {
  const topicSection = [topicText, explanation].filter(Boolean).join('\n\n').trim();
  const kcscSection = String(kcscContext || '').trim();
  const wikiSection = String(wikiGrounding || '').trim();

  const fullText = [topicSection, kcscSection, wikiSection].filter(Boolean).join('\n\n');

  return {
    fullText,
    sections: {
      topic: topicSection,
      kcsc: kcscSection,
      wiki: wikiSection
    },
    totalChars: fullText.length,
    hasSource: fullText.length > 0
  };
}

/**
 * 1:1 원문 부분문자열 및 토큰 일치 검증 (AI 프로젝트 QuoteVerifier.verify_quote 이식)
 * @param {string} quote 검증할 인용구 또는 핵심 근거 문장
 * @param {string} sourceCorpus 대조할 사료 번들 전체 원문
 * @param {number} minQuoteChars 최소 인용구 길이 (기본 12자)
 */
export function verifyQuote(quote, sourceCorpus, minQuoteChars = MIN_QUOTE_CHARS) {
  const qClean = String(quote || '').trim();
  if (!qClean) {
    return {
      verified: false,
      status: 'FAIL_QUOTE',
      matchType: 'EMPTY_QUOTE',
      confidence: 0,
      reason: '인용구(quote)가 비어 있습니다.'
    };
  }

  const nonSpaceLen = qClean.replace(/\s+/g, '').length;
  if (nonSpaceLen < minQuoteChars) {
    return {
      verified: false,
      status: 'FAIL_QUOTE',
      matchType: 'QUOTE_TOO_SHORT',
      confidence: 0,
      reason: `인용구 길이 부족 (${nonSpaceLen}자 < 최소 ${minQuoteChars}자)`
    };
  }

  const corpusRaw = String(sourceCorpus || '');
  if (!corpusRaw.trim()) {
    return {
      verified: false,
      status: 'NO_SOURCE_CORPUS',
      matchType: 'EMPTY_CORPUS',
      confidence: 0,
      reason: '대조할 사료 원문이 제공되지 않았습니다.'
    };
  }

  // 1단계: 원본 문자열 1:1 완전 일치 검사
  if (corpusRaw.includes(qClean)) {
    return {
      verified: true,
      status: 'PASS',
      matchType: 'EXACT_RAW_SUBSTRING',
      confidence: 1.0,
      reason: '사료 원문과 1:1 완벽 일치합니다.'
    };
  }

  // 2단계: LaTeX 및 단위 정규화 후 1:1 부분문자열 일치 검사
  const qNorm = normalizeLatexAwareText(qClean);
  const cNorm = normalizeLatexAwareText(corpusRaw);

  if (qNorm.length >= minQuoteChars && cNorm.includes(qNorm)) {
    return {
      verified: true,
      status: 'PASS',
      matchType: 'LATEX_NORMALIZED_SUBSTRING',
      confidence: 0.98,
      reason: 'LaTeX/단위 정규화 기준 사료 원문과 1:1 일치합니다.'
    };
  }

  // 3단계: 핵심 공학 어절(2글자 이상) 포함률 검사 (GroundingVerifier 기준)
  const stopWords = new Set(['있는', '하는', '되는', '대한', '위한', '따른', '경우', '통해', '및', '또는', '에서', '으로', '이다', '한다']);
  const tokens = qNorm
    .split(/[\s,.;:()\[\]\/]+/)
    .filter(w => w.length >= 2 && !stopWords.has(w));

  if (tokens.length === 0) {
    return {
      verified: false,
      status: 'FAIL_QUOTE',
      matchType: 'NO_VALID_TOKENS',
      confidence: 0,
      reason: '유효한 검증 토큰이 없습니다.'
    };
  }

  const matchedTokens = tokens.filter(t => cNorm.includes(t));
  const overlapRatio = matchedTokens.length / tokens.length;

  if (overlapRatio >= 0.85) {
    return {
      verified: true,
      status: 'PASS',
      matchType: 'HIGH_TOKEN_GROUNDING',
      confidence: Number(overlapRatio.toFixed(2)),
      reason: `사료 원문 내 핵심 용어 ${(overlapRatio * 100).toFixed(0)}% 일치 확인`
    };
  }

  return {
    verified: false,
    status: 'FAIL_QUOTE',
    matchType: 'QUOTE_NOT_IN_SOURCE',
    confidence: Number(overlapRatio.toFixed(2)),
    reason: `사료 원문에서 일치하는 문장을 찾을 수 없음 (토큰 일치율 ${(overlapRatio * 100).toFixed(0)}%)`
  };
}

/**
 * 인용구 주변 문맥(±250자) 내 복수 기준값/수치 후보 존재 여부 탐지
 * (AI 프로젝트 QuoteVerifier.detect_multiple_candidates 이식)
 */
export function detectMultipleCandidates(quote, sourceCorpus) {
  if (!quote || !sourceCorpus) return { isMultiCandidate: false, candidates: [] };

  const qNorm = normalizeLatexAwareText(quote);
  const cNorm = normalizeLatexAwareText(sourceCorpus);
  if (!qNorm || !cNorm) return { isMultiCandidate: false, candidates: [] };

  const idx = cNorm.indexOf(qNorm.slice(0, Math.min(25, qNorm.length)));
  if (idx === -1) return { isMultiCandidate: false, candidates: [] };

  const start = Math.max(0, idx - 250);
  const end = Math.min(cNorm.length, idx + qNorm.length + 250);
  const windowText = cNorm.slice(start, end);

  const numUnitMatches = [
    ...windowText.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:m|mm|cm|km|m2|m3|mpa|kpa|kn|kg|%|회|개소|일|시간|배)\b/gi)
  ].map(m => m[1]);

  const uniqueVals = [...new Set(numUnitMatches)];
  return {
    isMultiCandidate: uniqueVals.length >= 3,
    candidates: uniqueVals.slice(0, 8)
  };
}

/**
 * 생성된 답안/해설에 대응되는 사료 번들 내 최적의 원문 근거 문장(>=12자) 자동 추출 및 출처 식별
 */
export function extractBestGroundedQuote(targetText, dossier, minQuoteChars = MIN_QUOTE_CHARS) {
  if (!targetText || !dossier || !dossier.hasSource) {
    return { verified: false, matchedSource: 'NONE', bestQuote: '', confidence: 0 };
  }

  // 1) 만약 텍스트 내에 명시적 인용구 패턴이 있다면 우선 검증
  const explicitMatch = String(targetText).match(/\[(?:원문\s*근거|원문\s*인용|출처\s*인용)\s*[:：]\s*"?([^"\]]{12,200})"?\]/);
  if (explicitMatch) {
    const q = explicitMatch[1].trim();
    const check = verifyQuote(q, dossier.fullText, minQuoteChars);
    if (check.verified) {
      return {
        verified: true,
        matchedSource: identifyQuoteSourceSection(q, dossier),
        bestQuote: q,
        confidence: check.confidence,
        matchType: check.matchType
      };
    }
  }

  // 2) 사료 번들의 문장들 중 생성된 답안과 핵심 공학 어휘가 가장 높게 겹치는 실제 원문 문장(>=12자) 탐색
  const targetNorm = normalizeLatexAwareText(targetText);
  const targetTokens = new Set(
    targetNorm
      .split(/[\s,.;:()\[\]\/]+/)
      .filter(w => w.length >= 2 && !/^\d+$/.test(w))
  );

  if (targetTokens.size === 0) {
    return { verified: false, matchedSource: 'NONE', bestQuote: '', confidence: 0 };
  }

  const candidateSections = [
    { name: 'KCSC 국가건설기준', text: dossier.sections.kcsc },
    { name: '원보고서 본문', text: dossier.sections.topic },
    { name: 'Wikipedia 공학사전', text: dossier.sections.wiki }
  ];

  let bestScore = 0;
  let bestSentence = '';
  let bestSourceName = 'NONE';

  for (const sec of candidateSections) {
    if (!sec.text) continue;
    const rawSentences = sec.text
      .split(/(?<=[.?!다요])\s+|\n+/)
      .map(s => s.replace(/^[\s*\-•▪◦·#]+/, '').trim())
      .filter(s => s.replace(/\s+/g, '').length >= minQuoteChars && s.length <= 260);

    for (const sent of rawSentences) {
      // 메타 안내문 제외
      if (/^(채점관|모범답안|답변 또는 문제|이 기준은|출처:)/.test(sent)) continue;
      const sentNorm = normalizeLatexAwareText(sent);
      const sentTokens = sentNorm.split(/[\s,.;:()\[\]\/]+/).filter(w => w.length >= 2);
      if (sentTokens.length < 3) continue;

      let hitCount = 0;
      for (const st of sentTokens) {
        if (targetTokens.has(st)) hitCount++;
      }
      const coverage = hitCount / Math.min(sentTokens.length, 12);
      if (hitCount >= 2 && coverage > bestScore) {
        bestScore = coverage;
        bestSentence = sent;
        bestSourceName = sec.name;
      }
    }
  }

  if (bestSentence && bestScore >= 0.25) {
    const verifyRes = verifyQuote(bestSentence, dossier.fullText, minQuoteChars);
    return {
      verified: verifyRes.verified,
      matchedSource: bestSourceName,
      bestQuote: bestSentence,
      confidence: Number(Math.min(1, bestScore).toFixed(2)),
      matchType: verifyRes.matchType
    };
  }

  return { verified: false, matchedSource: 'NONE', bestQuote: '', confidence: 0 };
}

function identifyQuoteSourceSection(quote, dossier) {
  const qNorm = normalizeLatexAwareText(quote);
  if (dossier.sections.kcsc && normalizeLatexAwareText(dossier.sections.kcsc).includes(qNorm)) {
    return 'KCSC 국가건설기준';
  }
  if (dossier.sections.topic && normalizeLatexAwareText(dossier.sections.topic).includes(qNorm)) {
    return '원보고서 본문';
  }
  if (dossier.sections.wiki && normalizeLatexAwareText(dossier.sections.wiki).includes(qNorm)) {
    return 'Wikipedia 공학사전';
  }
  return '복합 사료 번들';
}

/**
 * 사료 번들(Fact Dossier) 및 질문 맥락에 전혀 존재하지 않는 무관한 블록 수식($$...$$) 환각 탐지 및 자동 정제
 * - 원보고서/문제/기존정답/사료번들에 단 한 번도 등장하지 않는 독립 수식 기호(원문 및 질문에 전혀 등장하지 않는 타 토픽의 수식 기호 등)를
 *   기계적으로 검출하여 환각 오염을 제거합니다.
 */
export function sanitizeUnfoundedBlockFormulas(targetText, { dossierText = '', question = '', correctAnswer = '' } = {}) {
  if (!targetText || typeof targetText !== 'string' || !targetText.includes('$$')) {
    return { sanitizedText: targetText, removedFormulas: [], hadHallucinatedFormula: false };
  }

  const referenceCorpusRaw = `${question || ''}\n${correctAnswer || ''}\n${dossierText || ''}`;
  if (!referenceCorpusRaw.trim()) {
    return { sanitizedText: targetText, removedFormulas: [], hadHallucinatedFormula: false };
  }

  const refLower = referenceCorpusRaw.toLowerCase();
  const refNorm = normalizeLatexAwareText(referenceCorpusRaw);

  const removedFormulas = [];
  let updatedText = targetText;

  // $$ ... $$ 블록 수식 전수 검사
  const blockRegex = /\$\$([\s\S]*?)\$\$(?:\s*\n+\s*단,\s*위\s*식은[^\n]*)?/g;
  updatedText = updatedText.replace(blockRegex, (fullMatch, formulaInner) => {
    const fClean = String(formulaInner || '').trim();
    if (!fClean) return fullMatch;

    // 수식 좌변(LHS) 또는 핵심 기호 추출 (수식 내 첨자 변수 추출)
    const subVars = [...fClean.matchAll(/\b([A-Za-z])\s*_\s*\{?([A-Za-z0-9]+)\}?/g)].map(m => ({
      raw: `${m[1]}_${m[2]}`.toLowerCase(),
      collapsed: `${m[1]}${m[2]}`.toLowerCase(),
      base: m[1].toLowerCase()
    }));

    // 첨자 변수가 1개 이상 있는 전문 공식인데, 그 첨자 변수들이 사료 번들(원보고서+KCSC+위키)이나 질문/정답 어디에도 전혀 등장하지 않는 경우
    if (subVars.length > 0) {
      const anySubVarInRef = subVars.some(
        v => refLower.includes(v.raw) || refNorm.includes(v.collapsed)
      );

      // 추가 안전장치: 질문 자체가 '공식', '수식', '산정식', '계산'을 직접 요구하는 경우는 유지
      const questionAsksFormula = /공식|수식|산정식|계산|유도|방정식/.test(question || '');

      if (!anySubVarInRef && !questionAsksFormula) {
        removedFormulas.push(fClean);
        return '';
      }
    }

    return fullMatch;
  });

  if (removedFormulas.length > 0) {
    updatedText = updatedText.replace(/\n{3,}/g, '\n\n').trim();
  }

  return {
    sanitizedText: updatedText,
    removedFormulas,
    hadHallucinatedFormula: removedFormulas.length > 0
  };
}

/**
 * NotebookLM 방식 원문 근거 기반(Grounded) 프롬프트 지침 블록 생성
 * - 하드코딩된 예시 없이 동적 사료 번들(Fact Dossier) 준수만 강제
 */
export function getNotebookLmGroundedPromptBlock(mode = 'grading') {
  if (mode === 'quiz') {
    return `
[🛡️ NotebookLM 방식 사료 근거(Grounded) 출제 및 원문 일치 검증 지침]:
1. 제공된 [첨부파일 본문 텍스트(원보고서)], [국가건설기준(KCSC)], [위키피디아 공학 사전]으로 구성된 **사료 번들(Fact Dossier)** 내부에 실제로 존재하는 공학적 사실·수식·기준값만을 근거로 출제하십시오.
2. 사료 번들에 존재하지 않는 타 공법의 수식이나 임의의 KDS 조항 번호·수치를 지어내어 삽입하는 환각(Hallucination)은 시스템의 원문 대조 검증기(QuoteVerifier)에 의해 즉시 적발됩니다.
3. 사료 내에 단기/장기, 상시/지진시 등 조건별 복수 기준값이 존재하는 경우, 질문 또는 해설에 적용 조건을 명확히 구분하여 명시하십시오.
`;
  }

  return `
[🛡️ NotebookLM 방식 사료 근거(Grounded) 모범답안 도출 및 원문 검증 지침]:
1. 제공된 [원보고서 및 전공 본문 해설], [국가건설기준(KCSC)], [위키피디아 사전 지식]으로 구성된 **사료 번들(Fact Dossier)** 내부의 사실을 최우선 근거로 삼아 모범답안과 채점평을 작성하십시오.
2. 문항과 무관한 다른 토픽의 공식이나 사료 번들에 전혀 근거가 없는 수식을 억지로 끼워 넣는 행위를 절대 금지합니다 (수식은 해당 문항의 공학적 본질이 수식을 직접 다루거나 사료 본문에 해당 수식이 명시된 경우에만 표기).
`;
}

/**
 * 주관식 채점 결과 및 모범 답안에 대한 NotebookLM 방식 원문 검증 수행 (< 2ms)
 */
export function verifyGroundedGradingResult({
  question = '',
  correctAnswer = '',
  authoritativeModelAnswer = '',
  reason = '',
  explanation = '',
  kcscContext = '',
  wikiGrounding = ''
} = {}) {
  const t0 = Date.now();
  const dossier = buildFactDossier({ explanation, kcscContext, wikiGrounding });

  // 1. 무관한 블록 수식 환각 여부 검사 및 자동 정제
  const formulaCheck = sanitizeUnfoundedBlockFormulas(authoritativeModelAnswer, {
    dossierText: dossier.fullText,
    question,
    correctAnswer
  });

  const cleanModelAnswer = formulaCheck.sanitizedText;

  // 2. 사료 번들 대비 원문 인용/근거 문장(>=12자) 매칭 검증
  const quoteExtraction = extractBestGroundedQuote(cleanModelAnswer, dossier, MIN_QUOTE_CHARS);

  // 3. 복수 기준값 후보 존재 여부 탐지
  const multiCand = quoteExtraction.bestQuote
    ? detectMultipleCandidates(quoteExtraction.bestQuote, dossier.fullText)
    : { isMultiCandidate: false, candidates: [] };

  const elapsedMs = Date.now() - t0;

  return {
    sanitizedModelAnswer: cleanModelAnswer,
    groundingVerification: {
      engine: 'NotebookLM-QuoteVerifier-v1 (Cloud/Mobile Native)',
      status: quoteExtraction.verified ? 'PASS' : (dossier.hasSource ? 'PARTIAL_CONTEXT' : 'NO_SOURCE'),
      verified: quoteExtraction.verified,
      matchedSource: quoteExtraction.matchedSource,
      verifiedQuote: quoteExtraction.bestQuote || null,
      confidence: quoteExtraction.confidence,
      matchType: quoteExtraction.matchType || null,
      multiCandidateDetected: multiCand.isMultiCandidate,
      candidateValues: multiCand.candidates,
      hallucinatedFormulaRemoved: formulaCheck.hadHallucinatedFormula,
      removedFormulas: formulaCheck.removedFormulas,
      dossierChars: dossier.totalChars,
      elapsedMs
    }
  };
}

/**
 * 출제된 퀴즈 문항 배열 전체에 대한 NotebookLM 방식 원문 검증 수행 (< 5ms)
 */
export function verifyQuizQuestionsGrounding(questions = [], { fileText = '', kcscGrounding = '', wikiGrounding = '' } = {}) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;

  const dossier = buildFactDossier({
    topicText: fileText,
    kcscContext: kcscGrounding,
    wikiGrounding
  });

  if (!dossier.hasSource) return questions;

  return questions.map(q => {
    const targetContent = [q.answer, q.explanation, q.concept].filter(Boolean).join(' ');
    const formulaCheck = sanitizeUnfoundedBlockFormulas(q.answer || '', {
      dossierText: dossier.fullText,
      question: q.question || '',
      correctAnswer: q.explanation || ''
    });

    const quoteRes = extractBestGroundedQuote(targetContent, dossier, MIN_QUOTE_CHARS);

    return {
      ...q,
      answer: formulaCheck.sanitizedText || q.answer,
      groundingVerification: {
        verified: quoteRes.verified,
        matchedSource: quoteRes.matchedSource,
        verifiedQuote: quoteRes.bestQuote ? quoteRes.bestQuote.slice(0, 140) : null,
        confidence: quoteRes.confidence,
        hallucinatedFormulaRemoved: formulaCheck.hadHallucinatedFormula
      }
    };
  });
}
