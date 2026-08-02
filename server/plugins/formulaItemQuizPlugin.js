/**
 * Formula Item Quiz Plugin (Table, Acronym, Overview Quiz Generation & Grading Plugin)
 * 
 * Provides dedicated quiz generation and grading logic for:
 * - Table Tab (비교표 빈칸 출제 및 채점)
 * - Acronym Tab (두문자/암기단어/연상문장 빈칸 출제 및 채점)
 * - Overview Tab (개요/메커니즘/공학적의미 주관식 빈칸 출제 및 채점)
 */

import { ENGINEERING_STANDARDS } from './engineeringStandards.js';
import { GENERATION_STANDARDS } from './generationStandards.js';
import { GRADING_STANDARDS } from './gradingPlugin.js';
import { LATEX_PROMPT_INSTRUCTIONS } from '../utils/latexUtils.js';

/**
 * Generates an interactive Table Quiz question object from a Table item.
 */
export async function generateTableQuizQuestion(tableItem) {
  if (!tableItem || (!tableItem.html && !tableItem.content)) {
    throw new Error('Valid table item data is required');
  }

  return {
    id: tableItem.id || `table_quiz_${Date.now()}`,
    type: 'table',
    question: tableItem.title || '비교표 빈칸 채우기',
    title: tableItem.title || '비교표 빈칸 채우기',
    content: tableItem.html || tableItem.content,
    tableData: tableItem.html || tableItem.content
  };
}

/**
 * Generates an interactive Acronym Quiz question object from an Acronym item.
 */
export async function generateAcronymQuizQuestion(acronymItem) {
  if (!acronymItem || (!acronymItem.title && !acronymItem.content)) {
    throw new Error('Valid acronym item data is required');
  }

  return {
    id: acronymItem.id || `acronym_quiz_${Date.now()}`,
    type: 'acronym',
    title: acronymItem.title || '두문자 암기 퀴즈',
    acronym: acronymItem.title || '두문자 암기 퀴즈',
    word: acronymItem.title,
    sentenceText: acronymItem.content
  };
}

/**
 * Generates an interactive Overview Quiz question object from an Overview item.
 */
export async function generateOverviewQuizQuestion(overviewItem) {
  if (!overviewItem || (!overviewItem.title && !overviewItem.content)) {
    throw new Error('Valid overview item data is required');
  }

  return {
    id: overviewItem.id || `overview_quiz_${Date.now()}`,
    type: 'overview',
    question: `[개요 작성/복습] ${overviewItem.title}`,
    title: overviewItem.title,
    concept: overviewItem.content,
    explanation: overviewItem.content
  };
}

/**
 * Dedicated Item Quiz Grading Assistant
 */
export async function gradeItemQuizAnswer({ itemType, questionTitle, correctContent, userInputs, callLLMWithFailover }) {
  const prompt = `[항목 유형]: ${itemType}
[토픽/주제]: ${questionTitle}
[모범 답안 데이터]:
${typeof correctContent === 'object' ? JSON.stringify(correctContent) : correctContent}

[수험생 입력 답안]:
${typeof userInputs === 'object' ? JSON.stringify(userInputs) : userInputs}

위 수험생 입력 답안을 모범 답안 및 토목공학/지반공학 기술사 채점 기준에 따라 정밀하게 평가하여, 각 빈칸/항목별 채점 결과 및 종합 피드백을 JSON 규격으로 반환해 주십시오.

[채점 지침]:
${GRADING_STANDARDS}
${ENGINEERING_STANDARDS}
${LATEX_PROMPT_INSTRUCTIONS}`;

  const responseText = await callLLMWithFailover(
    `당신은 대한민국 국가기술자격 기술사 시험 전문 채점관입니다. 주어진 수험생 답안을 공학적 정확성에 근거하여 객관적으로 채점하십시오.`,
    prompt,
    null,
    'grading'
  );

  return responseText;
}
