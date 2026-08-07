import { robustJSONParse } from './server/plugins/gradingPlugin.js';

const text = '{"isCorrect": false, "score": "5", "reason": "부분점수"}';
const result = robustJSONParse(text);

const findKey = (obj, targetStr) => {
  const normalizedTarget = targetStr.toLowerCase().replace(/_/g, '');
  const keys = Object.keys(obj);
  for (const k of keys) {
    const normalizedK = k.toLowerCase().replace(/_/g, '');
    if (normalizedK === normalizedTarget || normalizedK.includes(normalizedTarget)) {
      return obj[k];
    }
  }
  return null;
};

const isCorrectVal = findKey(result, 'iscorrect');
const isCorrect = isCorrectVal !== null ? !!isCorrectVal : !!result.isCorrect;

const scoreVal = findKey(result, 'score');
const score = typeof scoreVal === 'number' 
  ? scoreVal 
  : (typeof result.score === 'number' ? result.score : (isCorrect ? 10 : 0));

console.log("Original parsed score:", result.score);
console.log("Final score calculated:", score);
