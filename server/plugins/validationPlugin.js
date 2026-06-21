/**
 * 자가 검증 및 교정 플러그인 (Validation & Healing Plugin)
 */
import { ENGINEERING_STANDARDS } from './engineeringStandards.js';


/**
 * 생성된 문제의 오류를 검증하고 치료(Self-Healing)하여 반환합니다.
 * @param {Object} question 문항 객체
 * @param {Function} callLLMWithFailover AI API 호출용 함수 (의존성 주입)
 */
export async function validateAndHealQuestion(question, callLLMWithFailover, topicTitle = '', topicKeywords = '', fileText = '') {
  if (!question || typeof question !== 'object') return question;

  const validationLogs = question.validationLogs || [];

  // ── [1단계] 객관식 정답-선택지 불일치 복구 (Rule-based Linter)
  if (question.type === '객관식 (4지선다)' && question.options && Array.isArray(question.options) && question.answer) {
    const hasExact = question.options.includes(question.answer);
    if (!hasExact) {
      let bestOpt = null;
      let maxScore = -1;
      
      const getOptionMatchScore = (opt, answer) => {
        const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
        const cOpt = clean(opt);
        const cAns = clean(answer);
        
        if (cOpt === cAns) return 1000;
        
        if (opt.includes('=')) {
          const parts = opt.split('=');
          const rhs = parts[parts.length - 1];
          if (clean(rhs) === cAns) return 900;
        }
        
        if (opt.trim().endsWith(answer.trim())) return 800;
        if (opt.trim().startsWith(answer.trim())) return 700;
        
        if (cAns && cOpt.includes(cAns)) {
          return 500 - (cOpt.length - cAns.length);
        }
        return 0;
      };

      for (const opt of question.options) {
        const score = getOptionMatchScore(opt, question.answer);
        if (score > maxScore) {
          maxScore = score;
          bestOpt = opt;
        }
      }

      if (bestOpt && maxScore > 0) {
        const logMsg = `[객관식 선택지 보정] 정답 "${question.answer}"이(가) 선택지 목록에 없어 가장 유사한 선택지 "${bestOpt}"(으)로 매칭하여 수정했습니다.`;
        console.log(`[ValidationPlugin Linter] Mismatched MCQ answer repaired: "${question.answer}" -> "${bestOpt}"`);
        question.answer = bestOpt;
        validationLogs.push(logMsg);
      }
    }
  }

  // ── [2단계] 수리/계산형 문항, 수식이 포함된 문항, 표가 포함된 문항, 그리고 토픽 불일치(Leakage)에 대해 2차 AI 검증 및 자가 교정 수행
  const cleanTitle = (topicTitle || '').trim();
  const cleanKeywords = (topicKeywords || '').trim();

  const hasTable = question.tableData && 
                   Array.isArray(question.tableData.headers) && 
                   Array.isArray(question.tableData.rows);
  const hasMath = (question.question && question.question.includes('$')) || 
                  (question.formula && question.formula.includes('$')) ||
                  (question.concept && question.concept.includes('$')) ||
                  (question.answer && typeof question.answer === 'string' && question.answer.includes('$'));
  
  // 토픽 불일치(Leakage) 여부 판정
  let isMismatched = false;
  const mismatchResult = isQuestionMismatched(question, topicTitle, topicKeywords);
  if (mismatchResult) {
    console.log(`[ValidationPlugin] Detected topic mismatch! Topic "${cleanTitle}" does not match domain "${mismatchResult.matchedDomain}", but question contains keywords: ${JSON.stringify(mismatchResult.matchedKws)}`);
    isMismatched = true;
    validationLogs.push(`[주제 이탈 감지] 활성 토픽 "${cleanTitle}"(와)과 일치하지 않는 타 분야 키워드(${mismatchResult.matchedKws.join(', ')})가 감지되어 AI 2차 검증을 통한 전면 재작성을 시작합니다.`);
  }

  const needsCorrection = 
    question.type === '객관식 (4지선다)' || 
    hasTable || 
    hasMath || 
    isMismatched ||
    /[0-9]/.test(question.question || '');

  if (needsCorrection && typeof callLLMWithFailover === 'function') {
    try {
      console.log(`[ValidationPlugin] Question correction triggered. isMismatched=${isMismatched}. Running 2nd pass LLM self-correction...`);
      
      let typeSpecificInstruction = '';
      if (question.type === '주관식 (공식)') {
        typeSpecificInstruction = `
[🚨 주관식 (공식) 유형 검수 특이사항]:
- 이 문제는 주관식 공식 문제입니다. 절대 표(tableData)나 서술형 답안을 작성하지 마십시오.
- 오직 공식 자체를 묻는 질문이어야 하며, "formula" 필드에 하나의 LaTeX 수식만 포함되어야 합니다.
- "type" 필드는 반드시 "주관식 (공식)"이어야 합니다.
`;
      } else if (question.type === '주관식 (개요)') {
        typeSpecificInstruction = `
[🚨 주관식 (개요) 유형 검수 특이사항]:
- 이 문제는 주관식 개요 문제입니다. 절대 표(tableData)나 수식(formula) 위주의 평가가 되어서는 안 됩니다.
- "type" 필드는 반드시 "주관식 (개요)"이어야 합니다.
`;
      } else if (question.type === '주관식 (표채우기)') {
        typeSpecificInstruction = `
[🚨 주관식 (표채우기) 유형 검수 특이사항]:
- 이 문제는 표채우기 문제입니다. 반드시 "tableData" 객체(headers, rows)가 정의되어야 하고, "answers" 객체(INPUT_1, INPUT_2 등)가 정확히 매핑되어야 합니다.
- "type" 필드는 반드시 "주관식 (표채우기)"이어야 합니다.
`;
      }

      const validatorSystemInstruction = `
당신은 대한민국 국가기술자격 토목공학/지반공학 기술사 시험 전문 검수위원입니다.
제공된 문제 객체(JSON)의 공학적 정합성, 수학적 타당성, 그리고 LaTeX 수식 및 표 레이아웃 문법을 엄격히 검증하십시오.

[현재 문제 유형]: "${question.type || '미정'}"
${typeSpecificInstruction}

[🚨 중요 검수 요건]:
1. **토픽 일치성 및 타 주제 잔재 제거 (핵심 필터링)**:
   - 현재 설정된 토픽 주제는 ${cleanTitle ? `[${cleanTitle}]` : '알 수 없음'} 이며, 핵심 키워드는 [${cleanKeywords || '없음'}] 입니다.
   - **가장 중요한 원칙**: 출제된 문제의 질문, 보기, 정답, 해설 내용이 반드시 현재 토픽 주제(${cleanTitle ? `[${cleanTitle}]` : '알 수 없음'})의 학술적 이론 및 공학적 사실에 100% 부합해야 합니다.
   - 만약 현재 토픽과 전혀 무관한 엉뚱한 타 토픽의 개념이나 수식(예: 수압파쇄시험 토픽인데 가설 흙막이 Chang 공식이나 지반스프링, 응력경로 p-q 좌표계 관련 내용 등)이 포함되어 있다면, 이는 치명적인 출제 오류입니다.
   - 이 경우, 타 토픽의 잔재를 완전히 배제하고, 오직 현재 토픽(${cleanTitle ? `[${cleanTitle}]` : '알 수 없음'})의 학술적 이론 및 제공된 첨부파일 본문 텍스트에 기반한 올바른 문제로 **전면 재작성(Heal)**하여 교정하십시오.
2. **수학적/논리적 일관성 검증**:
   - 공식의 비례/반비례 관계나 계산식의 논리적 모순이 해설(explanation)과 정답('answer' 또는 표채우기의 경우 'answers' 객체의 각 항목) 사이에 존재하는지 계산 단계를 직접 추론하여 팩트체크하고 수정하십시오.
   - 해설의 계산식에 의한 최종 수치값과 정답('answer' 또는 표채우기의 경우 'answers' 객체의 각 항목)의 내용이 일치해야 합니다.
3. **LaTeX 수식 문법 검증**:
   - 지문, 보기, 해설, 정답 내의 모든 LaTeX 수식($기호로 둘러싸인 표현)이 문법적으로 올바른지 확인하십시오 (예: 중괄호 {} 열고 닫기 매칭, 백슬래시 이중 이스케이프 '\\\\' 적용 상태 등).
   - 깨져서 렌더링이 안 되는 수식이나 중괄호 탈락 오류는 정상 수식으로 정정하십시오.
4. **표(Table) 데이터 레이아웃 및 상호 정합성 검증 (표채우기 등)**:
   - 문제에 표 데이터('tableData')가 존재할 경우, 헤더(headers)의 열 개수와 모든 행(rows)의 셀 개수가 일치하는지 확인하고, 표의 열 매칭 오류나 빈칸 플레이스홀더 위치를 올바르게 교정하십시오.
   - **주관식 (표채우기)의 정답 매핑 객체('answers') 검증 (극도로 중요)**:
     * 주관식 (표채우기) 문항은 반드시 각 빈칸 토큰(예: '[INPUT_1]', '[INPUT_2]' 등) 또는 알파벳 플레이스홀더(예: 'A', 'B' 등)에 대응하는 개별 모범 답안이 담긴 'answers' 객체를 포함해야 합니다.
     * 절대 'answers' 객체를 누락하거나, 단일 문자열 'answer' 필드로 대체하여 하나만 적지 마십시오.
     * 만약 표 내에 입력 칸이 3개(INPUT_1, INPUT_2, INPUT_3)라면, 'answers' 객체 역시 이 세 개에 대한 구체적인 서술형/계산형 정답을 모두 포함해야 합니다 (예: 'answers': { 'INPUT_1': '...', 'INPUT_2': '...', 'INPUT_3': '...' }).
   - **표 내용과 지문/헤더의 상호 논리적 일관성 검증 (극도로 중요)**:
     * 표의 행 제목(Row Headers)과 열 제목(Column Headers), 그리고 문제 지문(Question text)의 서술 방향이 논리적으로 완벽히 일치해야 합니다.
     * 예시 오류: 지문은 구체적인 수치 계산(심도 z=500m, Pb=14MPa 등)을 묻고 있으나, 표의 행 제목은 "공학적 의미", "안정성 평가 활용"과 같은 개념 서술형 내용을 요구하며, 정답/해설은 수치 계산이 아닌 일반 문장 답안을 갖는 경우. 이는 지문(계산형)과 표(개념형)가 완전히 따로 노는 치명적인 출제 오류입니다.
     * 이 경우, 지문(Question text)에 기재된 쓸데없는 가설 계산 상황(수치 정보)을 모두 제거하고, 오직 표의 행/열 제목이 묻는 개념적 내용에 부합하도록 지문 자체를 표 채우기에 걸맞은 개념 설명/비교 지시형 문장(예: "다음 수압파쇄시험의 최대/최소 수평응력 기준 측압계수 비교표를 보고 빈칸에 알맞은 내용을 기술하십시오.")으로 완전하게 **교정(Heal)**하십시오.
     * 즉, 지문과 표 내용의 성격이 하나로 통일되도록(수치 계산 상황이 있으면 표도 수치 계산을 요구하도록, 개념 비교 상황이면 지문도 개념을 묻도록) 정합성을 강력하게 수정하십시오.
5. **객관식 선택지 일치화**:
   - 객관식 문제의 경우, 'options' 배열 내에 정답('answer') 문자열과 토씨 하나 틀리지 않고 완벽하게 일치하는 항목이 반드시 포함되도록 정답 필드를 보정하십시오.
6. **질문의 명확성 및 조건 완결성 검증**:
   - 질문 발문이 어조가 어색하거나 모호하지 않은지, 묻고자 하는 전제와 요구사항이 명확한지 검수하십시오.
   - 만약 문제의 가정 조건이 불충분하거나 단위가 불분명해 해석의 오해 소지가 있다면, 학생이 학술적으로 오류 없이 문제를 정확하게 풀 수 있도록 발문을 구체적이고 정교하게 수정 보강하십시오.
7. 마크다운 백틱(\`\`\`) 기호나 부가 설명 없이 오직 완성된 최종 JSON 객체 텍스트만 출력하십시오.

[공학적 검증 표준 기준]:
${ENGINEERING_STANDARDS}
`;
      const userPrompt = `
다음 문제 객체를 철저히 검수하고, 현재 토픽(${cleanTitle ? `[${cleanTitle}]` : '알 수 없음'}) 및 첨부파일 본문 텍스트에 100% 부합하도록 수정한 최종 문제 JSON만 출력하십시오.
만약 토픽이 일치하지 않는 엉뚱한 문제라면, 현재 토픽(${cleanTitle ? `[${cleanTitle}]` : '알 수 없음'})에 어울리는 새로운 객관식/주관식 문제로 완전히 바꾸어 다시 작성해 주십시오.

[첨부파일 본문 텍스트 일부]:
${fileText ? fileText.substring(0, 8000) : '제공되지 않음'}

[원본 문제 JSON]:
${JSON.stringify(question)}
`;
      
      const responseText = await callLLMWithFailover(validatorSystemInstruction, userPrompt, null, 'validation', { temperature: 0.0 });
      const corrected = parseLlmJson(responseText);
      if (corrected && typeof corrected === 'object' && corrected.question) {
        console.log(`[ValidationPlugin] Self-correction succeeded!`);
        validationLogs.push(`[AI 자가 교정 완료] 2차 검증을 통해 문항의 공학적 정합성 및 LaTeX 수식 문법 검증을 완료하고 교정본을 반영했습니다.`);
        
        // Force the original question type and clean properties
        corrected.type = question.type;
        if (question.type === '주관식 (공식)' || question.type === '주관식 (개요)') {
          delete corrected.tableData;
          delete corrected.answers;
          delete corrected.subtype;
        }
        
        return { ...question, ...corrected, validationLogs };
      } else {
        validationLogs.push(`[AI 자가 검증 완료] 문항 구조 검증 완료 (이상 없음).`);
      }
    } catch (err) {
      console.warn(`[ValidationPlugin] Self-correction loop failed or skipped:`, err.message);
      validationLogs.push(`[AI 자가 교정 건너뜀/실패] 오류: ${err.message}`);
    }
  } else {
    validationLogs.push(`[정밀 검사 생략] 수식이나 표가 없는 기본 텍스트 문항으로, 정합성 기준을 패스했습니다.`);
  }

  return { ...question, validationLogs };
}

function escapeJsonBackslashes(str) {
  if (!str) return str;
  let result = '';
  let inString = false;
  let i = 0;
  
  const latexCommands = [
    'newline', 'nabla', 'nu', 'neq', 'neg', 'ni', 'notin', 'ngeq', 'nleq', 'nsim', 'ncong', 'nparallel', 'noindent',
    'theta', 'tau', 'tan', 'times', 'tilde', 'text', 'tfrac', 'triangle', 'top', 'to', 'tiny', 'today',
    'rho', 'right', 'rule', 'rangle', 'rightarrow', 'rightleftharpoons', 'rightharpoonup', 'rightharpoondown', 'real', 'ref', 'raise',
    'beta', 'bar', 'begin', 'bmod', 'boldsymbol', 'bullet', 'box', 'bigcap', 'bigcup', 'backslash',
    'frac', 'forall', 'flat', 'frown', 'footnotesize', 'fbox',
    'phi', 'varphi', 'mathrm'
  ];

  while (i < str.length) {
    const char = str[i];
    if (char === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      i++;
    } else if (inString && char === '\\') {
      const next = str[i + 1];
      
      if (next === '"' || next === '/' || next === '\\') {
        result += char + next;
        i += 2;
      } else if (next === 'n' || next === 't' || next === 'r' || next === 'b' || next === 'f') {
        let tempIndex = i + 1;
        let commandWord = '';
        while (tempIndex < str.length && /[a-zA-Z]/.test(str[tempIndex])) {
          commandWord += str[tempIndex];
          tempIndex++;
        }
        
        const isLatex = latexCommands.some(cmd => commandWord.startsWith(cmd));
        if (isLatex) {
          result += '\\\\';
          i++;
        } else {
          result += char + next;
          i += 2;
        }
      } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(str.substring(i + 2, i + 6))) {
        result += char + next + str.substring(i + 2, i + 6);
        i += 6;
      } else {
        result += '\\\\';
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  return result;
}

function parseLlmJson(text) {
  if (!text) return null;
  let cleaned = text.trim();
  
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleaned.match(jsonBlockRegex);
  if (match) {
    cleaned = match[1].trim();
  } else {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1).trim();
    }
  }

  const escaped = escapeJsonBackslashes(cleaned);
  return JSON.parse(escaped);
}

export function getSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const clean = (s) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  const s1 = clean(str1);
  const s2 = clean(str2);
  if (s1 === s2) return 1.0;
  
  const words1 = new Set(str1.toLowerCase().split(/[^a-zA-Z0-9가-힣]+/));
  const words2 = new Set(str2.toLowerCase().split(/[^a-zA-Z0-9가-힣]+/));
  words1.delete('');
  words2.delete('');
  if (words1.size === 0 || words2.size === 0) return 0;
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

export function areTablesDuplicate(t1, t2) {
  if (!t1 || !t2) return false;
  if (!t1.headers || !t2.headers || !t1.rows || !t2.rows) return false;
  if (t1.headers.length !== t2.headers.length || t1.rows.length !== t2.rows.length) return false;
  
  const h1 = t1.headers.join('|');
  const h2 = t2.headers.join('|');
  if (h1 !== h2) return false;
  
  const r1 = t1.rows.map(r => r.join('|')).join('\n');
  const r2 = t2.rows.map(r => r.join('|')).join('\n');
  return r1 === r2;
}

export function deduplicateQuestions(questions, topic, fileText, getFallbackQuestions) {
  const result = [];
  const seenQuestions = [];
  
  let fallbackQs = null;
  const getFallbackList = () => {
    if (!fallbackQs) {
      fallbackQs = getFallbackQuestions(topic.title, topic.keywords, fileText || '');
    }
    return fallbackQs;
  };

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    let isDuplicate = false;
    
    // Do not check duplication for intro and formula questions (always Q1 and Q2)
    if (i >= 2) {
      for (const accepted of seenQuestions) {
        if (q.tableData && accepted.tableData) {
          if (areTablesDuplicate(q.tableData, accepted.tableData)) {
            isDuplicate = true;
            break;
          }
        }
        const sim = getSimilarity(q.question, accepted.question);
        if (sim > 0.6) {
          isDuplicate = true;
          break;
        }
        if (q.options && accepted.options && q.options.length === accepted.options.length) {
          const simOptions = q.options.every((opt, idx) => getSimilarity(opt, accepted.options[idx]) > 0.85);
          if (simOptions) {
            isDuplicate = true;
            break;
          }
        }
      }
    }

    if (isDuplicate) {
      console.log(`[Deduplication] Detected duplicate question at index ${i}: "${q.question.substring(0, 50)}..."`);
      const fallbacks = getFallbackList();
      const sameTypeFallbacks = fallbacks.filter(f => f.type === q.type);
      
      let replacement = null;
      for (const candidate of sameTypeFallbacks) {
        let candidateIsDup = false;
        for (const accepted of seenQuestions) {
          if (candidate.tableData && accepted.tableData) {
            if (areTablesDuplicate(candidate.tableData, accepted.tableData)) {
              candidateIsDup = true;
              break;
            }
          }
          const sim = getSimilarity(candidate.question, accepted.question);
          if (sim > 0.6) {
            candidateIsDup = true;
            break;
          }
        }
        if (!candidateIsDup) {
          replacement = candidate;
          break;
        }
      }
      
      if (replacement) {
        console.log(`[Deduplication] Replaced duplicate question at index ${i} with fallback: "${replacement.question.substring(0, 50)}..."`);
        const replacedQ = {
          ...replacement,
          topic_id: q.topic_id,
          validationLogs: [...(q.validationLogs || []), '[중복 제거] 이전 문항과 내용이 유사하여 대체 문항으로 치환되었습니다.']
        };
        result.push(replacedQ);
        seenQuestions.push(replacedQ);
      } else {
        console.warn(`[Deduplication] Could not find a non-duplicate fallback for index ${i}. Keeping original.`);
        result.push(q);
        seenQuestions.push(q);
      }
    } else {
      result.push(q);
      seenQuestions.push(q);
    }
  }
  return result;
}

export function isQuestionMismatched(question, topicTitle, topicKeywords) {
  if (!question || typeof question !== 'object') return null;
  const cleanTitle = (topicTitle || '').trim();
  const cleanKeywords = (topicKeywords || '').trim();
  if (!cleanTitle) return null;

  const qText = `${question.question || ''} ${question.explanation || ''} ${Array.isArray(question.options) ? question.options.join(' ') : ''}`.toLowerCase();
  const tTitle = cleanTitle.toLowerCase();
  const tKeywords = cleanKeywords.toLowerCase();
  const searchTarget = `${tTitle} ${tKeywords}`;

  const domains = [
    { name: '흙막이/Chang', keywords: ['흙막이', 'chang', '지반 스프링', '상호작용', '변형 특성 길이', '수평지반반력계수', '수평 환산폭', '휨강성'] },
    { name: '응력 경로/Stress Path', keywords: ['응력 경로', 'stress path', 'p-q', '축차응력', '편차응력', '평균 응력'] },
    { name: '전기이중층', keywords: ['이중층', 'ddl', 'double layer', 'double diffuse layer'] },
    { name: '압밀', keywords: ['압밀', 'terzaghi', '압밀도', '압밀계수', '침하량', '과잉간극수압'] },
    { name: '옹벽', keywords: ['옹벽', '주동토압', '수동토압'] },
    { name: '사면', keywords: ['사면안정', '무한사면', '한계성토고'] },
    { name: '락볼트 인발', keywords: ['인발', '락볼트', 'pullout', '인발시험', '인발 시험'] },
    { name: 'Q 분류', keywords: ['q 분류', 'q분류', 'barton', '바톤', 'jr', 'ja', 'jw', 'srf'] },
    { name: '싱글쉘 터널', keywords: ['싱글쉘', 'single shell', '싱글 쉘', 'sst', '더블쉘', '더블 쉘'] },
    { name: '수압파쇄', keywords: ['수압파쇄', 'hydraulic fracturing', '폐쇄압력', '재개열압력'] }
  ];

  for (const domain of domains) {
    const topicMatchesDomain = domain.keywords.some(kw => searchTarget.includes(kw));
    if (!topicMatchesDomain) {
      const questionMatchesDomain = domain.keywords.some(kw => qText.includes(kw));
      if (questionMatchesDomain) {
        return { matchedDomain: domain.name, matchedKws: domain.keywords.filter(kw => qText.includes(kw)) };
      }
    }
  }
  return null;
}
