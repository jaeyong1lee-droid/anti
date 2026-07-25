// ============================================================================
// AI 튜터 및 기타 시스템 지침 기본 목록 (Other & Tutor System Standards)
// - 절대 지침 수칙 #1: UI [기타] 버튼 클릭 시 로드되는 최우선 철칙 목록
// ============================================================================

export let otherStandardsList = [
  {
    "id": "tutor_bullet_and_header_formatting_standard",
    "title": "소제목 및 주요 섹션 머리기호 필수 표기 지침",
    "content": "🚨 [소제목 및 주요 섹션 머리기호 필수 표기 지침 - 극도로 중요!]: 답변을 작성할 때 '시험의 장단점', '적용 분야', '개요', '공식 유도', '기본 가정', '시공시 유의사항' 등 모든 단락 소제목 및 섹션 헤더 앞에는 머리기호 없이 밋밋한 글자만 독립 출제하지 말고, 반드시 불릿 기호('• ') 또는 마크다운 소제목 헤더(예: '### 📌 시험의 장단점', '• 적용 분야:')를 명확히 부여하여 시각적 직관성을 확보하십시오.",
    "updatedAt": "2026-07-26T07:58:00.000Z"
  },
  {
    "id": "tutor_latex_formula_wrapping_standard",
    "title": "LaTeX 수식 기호 달러($) 자동 감싸기 규칙",
    "content": "수식 내의 모든 단일 변수 및 수식 표현(예: Q, k, A, i, h, L 등)은 문맥 속에서 반드시 $...$ 달러 기호로 감싸서 KaTeX 수식 엔진으로 자동 렌더링되도록 하십시오.",
    "updatedAt": "2026-07-26T07:58:00.000Z"
  }
];

export let OTHER_STANDARDS = assembleOtherStandardsPrompt(otherStandardsList);

export function assembleOtherStandardsPrompt(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return "- 등록된 기타 시스템 지침이 없습니다.";
  }
  return list.map((std, idx) => `${idx + 1}. **${std.title}**:\n   - ${std.content}`).join('\n');
}

export function updateLiveOtherStandards(newList) {
  otherStandardsList = newList;
  OTHER_STANDARDS = assembleOtherStandardsPrompt(newList);
}
