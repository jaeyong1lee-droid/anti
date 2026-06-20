/**
 * 자가 검증 및 교정 플러그인 (Validation & Healing Plugin)
 */
import { ENGINEERING_STANDARDS } from './engineeringStandards.js';


/**
 * 생성된 문제의 오류를 검증하고 치료(Self-Healing)하여 반환합니다.
 * @param {Object} question 문항 객체
 * @param {Function} callLLMWithFailover AI API 호출용 함수 (의존성 주입)
 */
export async function validateAndHealQuestion(question, callLLMWithFailover) {
  if (!question || typeof question !== 'object') return question;

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
        console.log(`[ValidationPlugin Linter] Mismatched MCQ answer repaired: "${question.answer}" -> "${bestOpt}"`);
        question.answer = bestOpt;
      }
    }
  }

  // ── [2단계] 수리/계산형 문항, 수식이 포함된 문항, 표가 포함된 문항에 대해 2차 AI 검증 및 자가 교정 수행 (LLM Self-Correction Loop)
  const hasTable = question.tableData && 
                   Array.isArray(question.tableData.headers) && 
                   Array.isArray(question.tableData.rows);
  const hasMath = (question.question && question.question.includes('$')) || 
                  (question.formula && question.formula.includes('$')) ||
                  (question.concept && question.concept.includes('$')) ||
                  (question.answer && typeof question.answer === 'string' && question.answer.includes('$'));
  
  const needsCorrection = 
    question.type === '객관식 (4지선다)' || 
    hasTable || 
    hasMath || 
    /[0-9]/.test(question.question || '');

  if (needsCorrection && typeof callLLMWithFailover === 'function') {
    try {
      console.log(`[ValidationPlugin] High-risk question (MC/Math/Table) detected. Running 2nd pass LLM self-correction...`);
      
      const validatorSystemInstruction = `
당신은 대한민국 국가기술자격 토목공학/지반공학 기술사 시험 전문 검수위원입니다.
제공된 문제 객체(JSON)의 공학적 정합성, 수학적 타당성, 그리고 LaTeX 수식 및 표 레이아웃 문법을 엄격히 검증하십시오.

[🚨 중요 검수 요건]:
1. **수학적/논리적 일관성 검증**:
   - 공식의 비례/반비례 관계(예: 변수가 분모에 있어 원래는 감소해야 하는데 AI의 오작동으로 증가한다고 서술된 오개념)나 계산식의 논리적 모순이 해설(explanation)과 정답(answer) 사이에 존재하는지 계산 단계를 직접 추론하여 팩트체크하고 수정하십시오.
   - 해설의 계산식에 의한 최종 수치값과 정답('answer')의 내용이 일치해야 합니다.
2. **LaTeX 수식 문법 검증**:
   - 지문, 보기, 해설, 정답 내의 모든 LaTeX 수식($기호로 둘러싸인 표현)이 문법적으로 올바른지 확인하십시오 (예: 중괄호 {} 열고 닫기 매칭, 백슬래시 이중 이스케이프 '\\\\' 적용 상태 등).
   - 깨져서 렌더링이 안 되는 수식이나 중괄호 탈락 오류는 정상 수식으로 정정하십시오.
3. **표(Table) 데이터 레이아웃 검증**:
   - 문제에 표 데이터('tableData')가 존재할 경우, 헤더(headers)의 열 개수와 모든 행(rows)의 셀 개수가 일치하는지 확인하고, 표의 열 매칭 오류나 빈칸 플레이스홀더 위치를 올바르게 교정하십시오.
4. **객관식 선택지 일치화**:
   - 객관식 문제의 경우, 'options' 배열 내에 정답('answer') 문자열과 토씨 하나 틀리지 않고 완벽하게 일치하는 항목이 반드시 포함되도록 정답 필드를 보정하십시오.
5. **질문의 명확성 및 조건 완결성 검증**:
   - 질문 발문이 어조가 어색하거나 모호하지 않은지, 묻고자 하는 전제와 요구사항이 명확한지 검수하십시오.
   - 만약 문제의 가정 조건이 불충분하거나 단위가 불분명해 해석의 오해 소지가 있다면, 학생이 학술적으로 오류 없이 문제를 정확하게 풀 수 있도록 발문을 구체적이고 정교하게 수정 보강하십시오.
6. 마크다운 백틱(\`\`\`) 기호나 부가 설명 없이 오직 완성된 최종 JSON 객체 텍스트만 출력하십시오.

[공학적 검증 표준 기준]:
${ENGINEERING_STANDARDS}
`;
      const userPrompt = `다음 문제 객체를 철저히 검수하고, 올바르게 수정한 최종 문제 JSON만 출력하십시오:\n${JSON.stringify(question)}`;
      
      const responseText = await callLLMWithFailover(validatorSystemInstruction, userPrompt, null, 'validation', { temperature: 0.0 });
      const corrected = parseLlmJson(responseText);
      if (corrected && typeof corrected === 'object' && corrected.question) {
        console.log(`[ValidationPlugin] Self-correction succeeded!`);
        return { ...question, ...corrected };
      }
    } catch (err) {
      console.warn(`[ValidationPlugin] Self-correction loop failed or skipped:`, err.message);
    }
  }

  return question;
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
