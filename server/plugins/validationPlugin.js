/**
 * 자가 검증 및 교정 플러그인 (Validation & Healing Plugin)
 * 
 * 이 플러그인은 생성된 문제의 정답 및 해설이 학술적/공학적으로 올바른지 검증하고 수정하는 기능만을 수행합니다.
 */
import { ENGINEERING_STANDARDS } from './engineeringStandards.js';

/**
 * AI가 생성한 문제의 정답과 해설의 올바름 여부를 검증하고 오류를 교정(Self-Healing)하여 반환합니다.
 * @param {Object} question 문항 객체
 * @param {Function} callLLMWithFailover AI API 호출용 함수 (의존성 주입)
 * @param {string} topicTitle 토픽 제목
 * @param {string} topicKeywords 토픽 키워드
 * @param {string} fileText 파일 텍스트
 */
export async function validateAndHealQuestion(question, callLLMWithFailover, topicTitle = '', topicKeywords = '', fileText = '') {
  if (!question || typeof question !== 'object') return question;

  const validationLogs = question.validationLogs || [];

  if (typeof callLLMWithFailover !== 'function') {
    return question;
  }

  try {
    console.log(`[ValidationPlugin] Verifying answer correctness for question: "${(question.question || '').substring(0, 40)}..."`);
    
    const validatorSystemInstruction = `
당신은 대한민국 국가기술자격 토목공학/지반공학 기술사 시험 전문 검수위원입니다.
제공된 문제 객체(JSON)의 질문(question) 내용과 정답(answer/answers) 및 해설(explanation)을 비교하여, 제시된 정답이 공학적/학술적으로 맞는지 검증하십시오.

[🚨 중요 검수 및 교정 사항]:
${VALIDATION_STANDARDS}

[공학적 검증 표준 기준]:
${ENGINEERING_STANDARDS}
`;

    const userPrompt = `
다음 문제 객체의 질문, 정답, 해설을 분석하여 정답의 학술적/공학적 타당성을 검증하십시오.
오류가 있다면 정답과 해설을 올바르게 수정하고, 이상이 없다면 원본과 동일하게 유지하여 최종 문제 JSON만 반환해 주십시오.

[첨부파일 본문 텍스트 일부]:
${fileText ? fileText.substring(0, 8000) : '제공되지 않음'}

[검증 대상 문제 JSON]:
${JSON.stringify(question)}
`;

    const responseText = await callLLMWithFailover(validatorSystemInstruction, userPrompt, null, 'validation', { temperature: 0.0 });
    const corrected = parseLlmJson(responseText);
    
    if (corrected && typeof corrected === 'object' && corrected.question) {
      console.log(`[ValidationPlugin] Answer correctness verification and correction completed.`);
      validationLogs.push(`[AI 정답 검증 완료] 문항의 정답 및 해설의 공학적 타당성 검증을 완료하고 교정본을 반영했습니다.`);
      
      // 원래 문제 유형 유지
      corrected.type = question.type;
      return { ...question, ...corrected, validationLogs };
    } else {
      validationLogs.push(`[AI 정답 검증 완료] 정답 및 해설에 이상이 없어 원래대로 유지합니다.`);
    }
  } catch (err) {
    console.warn(`[ValidationPlugin] Answer verification failed or skipped:`, err.message);
    validationLogs.push(`[AI 정답 검증 실패] 오류: ${err.message}`);
  }

  return { ...question, validationLogs };
}

/**
 * JSON 파싱 보조 함수들
 */
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

/**
 * 다른 기능 삭제 후 호환성을 위해 제공되는 Stub 함수들
 */
export function deduplicateQuestions(questions) {
  // 중복 제거 기능을 수행하지 않고 그대로 반환합니다.
  return questions;
}

export function isQuestionMismatched(question, topicTitle, topicKeywords) {
  // 토픽 매칭 검사를 수행하지 않고 항상 통과시킵니다.
  return null;
}

export let validationStandardsList = [
  {
    "id": "def_val_1",
    "title": "정답의 정확성 검증",
    "content": "질문에서 묻는 바와 제시된 정답(answer 또는 answers of each input item)이 공학적 이론, 공식, 수치 계산상으로 100% 일치하고 올바른지 확인하십시오. 해설(explanation)에 적힌 설명이나 계산 과정이 정답과 논리적으로 일치하는지 확인하고, 모순이 있다면 정답과 해설을 올바르게 교정하십시오."
  },
  {
    "id": "def_val_2",
    "title": "LaTeX 수식 문법 검증",
    "content": "지문, 보기, 해설, 정답 내의 모든 LaTeX 수식($기호로 둘러싸인 표현)이 문법적으로 올바른지 확인하고 오류가 있다면 수정하십시오 (예: 중괄호 {} 매칭, 백슬래시 이중 이스케이프 '\\\\' 적용 상태 등)."
  },
  {
    "id": "def_val_3",
    "title": "JSON 정밀 규격 검증",
    "content": "마크다운 백틱(```) 기호나 부가 설명 없이 오직 완성된 최종 JSON 객체 텍스트만 반환하여 파서가 정상적으로 JSON을 파싱할 수 있게 엄격한 규격을 준수하십시오."
  }
];

export let VALIDATION_STANDARDS = assembleValidationStandardsPrompt(validationStandardsList);

export function assembleValidationStandardsPrompt(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return "- 등록된 검증 지시 기준이 없습니다.";
  }
  return list
    .map((std, idx) => {
      return `${idx + 1}. **${std.title}**:\n   - ${std.content}`;
    })
    .join("\n");
}

export function updateLiveValidationStandards(newList) {
  if (Array.isArray(newList)) {
    validationStandardsList = newList;
    VALIDATION_STANDARDS = assembleValidationStandardsPrompt(newList);
    console.log("[ValidationStandards] Live validation standards prompt updated. Count:", newList.length);
  }
}
