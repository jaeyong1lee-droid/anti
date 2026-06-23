/**
 * 검증 지시 리스트 기본값 및 라이브 바인딩
 */

export let validationStandardsList = [
  {
    id: "def_val_1",
    title: "정답의 정확성 검증",
    content: "질문에서 묻는 바와 제시된 정답(answer 또는 answers of each input item)이 공학적 이론, 공식, 수치 계산상으로 100% 일치하고 올바른지 확인하십시오. 해설(explanation)에 적힌 설명이나 계산 과정이 정답과 논리적으로 일치하는지 확인하고, 모순이 있다면 정답과 해설을 올바르게 교정하십시오."
  },
  {
    id: "def_val_2",
    title: "LaTeX 수식 문법 검증",
    content: "지문, 보기, 해설, 정답 내의 모든 LaTeX 수식($기호로 둘러싸인 표현)이 문법적으로 올바른지 확인하고 오류가 있다면 수정하십시오 (예: 중괄호 {} 매칭, 백슬래시 이중 이스케이프 '\\\\' 적용 상태 등)."
  },
  {
    id: "def_val_3",
    title: "JSON 정밀 규격 검증",
    content: "마크다운 백틱(```) 기호나 부가 설명 없이 오직 완성된 최종 JSON 객체 텍스트만 반환하여 파서가 정상적으로 JSON을 파싱할 수 있게 엄격한 규격을 준수하십시오."
  }
];

// ESM 라이브 바인딩을 위한 전역 변수
export let VALIDATION_STANDARDS = assembleValidationStandardsPrompt(validationStandardsList);

/**
 * 검증 기준 리스트를 하나의 문자열 프롬프트로 병합합니다.
 */
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

/**
 * 실시간으로 프롬프트 상태를 갱신합니다.
 */
export function updateLiveValidationStandards(newList) {
  if (Array.isArray(newList)) {
    validationStandardsList = newList;
    VALIDATION_STANDARDS = assembleValidationStandardsPrompt(newList);
    console.log("[ValidationStandards] Live validation standards prompt updated. Count:", newList.length);
  }
}
