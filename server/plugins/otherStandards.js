// ============================================================================
// AI 튜터 및 기타 시스템 지침 기본 목록 (Other & Tutor System Standards)
// - 절대 지침 수칙 #1: UI [기타] 버튼 클릭 시 로드되는 최우선 철칙 목록
// ============================================================================

export let otherStandardsList = [
  {
    "id": "tutor_paragraph_empty_line_break_standard",
    "title": "소주제 간 정확한 1줄 빈행 및 소주제 내부 밀착 표기 지침",
    "content": "🚨 [소주제 간 정확한 1줄 빈행 및 소주제 내부 밀착 표기 지침 - 극도로 중요!]:\n1. 소주제 바로 밑에는 절대로 빈행을 넣지 말고 내용/불릿 항목을 바로 밀착시켜 작성하십시오.\n2. 동일 소주제 내부에서는 머리기호나 항목이 달라지더라도 중간에 빈행을 넣지 말고 밀착하여 정돈하십시오.\n3. 이전 소주제 단락 전체가 끝나고 '새로운 소주제(예: 2. 변형 특성 파악:)'가 시작될 때만 그 상단에 명확히 딱 1줄 빈행(\\n\\n)을 띄워 작성하십시오.",
    "updatedAt": "2026-07-26T08:25:00.000Z"
  },
  {
    "id": "tutor_kds_kcs_and_wikipedia_learning_standard",
    "title": "KDS/KCS 국가건설기준 및 영문 위키피디아 지반역학 사전 학습과 참조 동적 감싸기 표출 지침 (최우선 헌법)",
    "content": "🚨 [KDS/KCS 국가건설기준 및 영문 위키피디아 지반역학 사전 학습과 참조 동적 감싸기 표출 지침 - 최우선 헌법!]: AI 튜터는 수험생 질문에 답변할 때 반드시 다음 적용 지침 우선순위로 사전에 관련어를 검색하고 깊이 공부한 후 대답하십시오.\n\n[적용 지침 우선순위]\n1. KCS / KDS (국가건설기준): 관련어 사전 검색 및 규정 수치/시방기준 공부 후 대답\n2. 영문 위키피디아 지반역학 전문 섹션 (Wikipedia Soil Mechanics): p-q 응력경로, 전단강도, 압밀, 구성모델 등 지반역학 핵심 이론/수식 사전 검색 및 공부 후 대답\n\n또한 모든 답변의 가장 마지막(말미)에는 참조한 KDS/KCS 규정과 영문 위키피디아 지반역학 핵심 원리를 반드시 '📚 KDS/KCS 규정 및 영문 위키피디아 지반역학 참조' 동적 감싸기 단락으로 작성하여 표출되도록 하십시오.",
    "updatedAt": "2026-07-26T08:18:00.000Z"
  },
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
