/**
 * AI가 생성한 차트 JSON 데이터를 안전하게 파싱하는 전용 유틸리티.
 * 오직 차트 그래프(ChartRenderer) 렌더링 시 발생하는 AI의 확률적 환각(단일 백슬래시, 후행 쉼표 등)만을 방어하며,
 * 시스템 전역의 다른 JSON 파싱 로직에는 영향을 주지 않도록 격리된 모듈입니다.
 * 
 * @param {string} rawJsonStr - AI가 생성한 원시 JSON 문자열
 * @returns {object} 파싱 완료된 차트 객체
 * @throws {Error} 파싱 실패 시 에러 던짐
 */
export function parseChartJson(rawJsonStr) {
  if (!rawJsonStr) return null;

  let jsonStr = rawJsonStr.trim();
  
  // 1. 단일 백슬래시 교정: 이중 백슬래시로 이스케이프 되지 않은 LaTeX 기호 보호 (\f, \n 등도 강제 이스케이프하여 KaTeX \frac 등 보호)
  jsonStr = jsonStr.replace(/(?<!\\)\\(?!["\\/])/g, '\\\\');
  
  // 2. 후행 쉼표(Trailing Comma) 제거: JSON 배열이나 객체 마지막에 쉼표가 붙는 환각 방어
  jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
  
  // 교정된 문자열을 파싱
  return JSON.parse(jsonStr);
}
