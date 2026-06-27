/**
 * 자가 검증 및 교정 플러그인 (Validation & Healing Plugin)
 * 
 * 이 플러그인은 생성된 문제의 정답 및 해설이 학술적/공학적으로 올바른지 검증하고 수정하는 기능만을 수행합니다.
 */
import { ENGINEERING_STANDARDS } from './engineeringStandards.js';
import { GENERATION_STANDARDS } from './generationStandards.js';

/**
 * AI가 생성한 문제의 정답과 해설의 올바름 여부를 검증하고 오류를 교정(Self-Healing)하여 반환합니다.
 * @param {Object} question 문항 객체
 * @param {Function} callLLMWithFailover AI API 호출용 함수 (의존성 주입)
 * @param {string} topicTitle 토픽 제목
 * @param {string} topicKeywords 토픽 키워드
 * @param {string} fileText 파일 텍스트
 */
export async function validateAndHealQuestion(question, callLLMWithFailover, topicTitle = '', topicKeywords = '', fileText = '') {
  // 검증 기능 비활성화: 입력받은 문항을 그대로 반환합니다.
  if (question && typeof question === 'object') {
    if (!question.validationLogs) {
      question.validationLogs = [];
    }
    question.validationLogs.push(`[자가 검증 건너뜀] 자가 검증 및 교정 기능이 비활성화되었습니다.`);
  }
  return question;
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

export let validationStandardsList = [];

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
