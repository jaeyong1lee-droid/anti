# Antigravity Project Instructions

## 절대 지침 관리 및 수정 수칙 (Absolute Standards Update Rules)

1. **지침의 절대성**:
   - UI의 '기준', '채점', '검증', '문제', '락스크린' 버튼을 클릭했을 때 로드되고 표출되는 모든 지침들(각 파일의 디폴트 기준 리스트 및 DB 세션 값)은 AI 에이전트 및 채점관, 퀴즈 출제자에게 절대적인 헌법과 같은 최우선 순위(#1)의 철칙입니다. 이 지침을 위반하는 문제 출제나 채점은 허용되지 않습니다.

2. **사용자 요청 시 실시간 지침 직접 수정 권한**:
   - 사용자가 Antigravity(AI 튜터) 대화방에서 특정 지침(예: 락스크린 퀴즈 지침, 문제 생성 지침, 주관식 채점 지침, 자가 검증 지침 등)을 "수정", "추가", 또는 "삭제"해 달라고 직접 텍스트로 요구하는 경우:
   - **반드시** 관련 파일([lockscreenStandards.js](file:///c:/Users/airfo/OneDrive/바탕 화면/안티/server/plugins/lockscreenStandards.js), [generationStandards.js](file:///c:/Users/airfo/OneDrive/바탕 화면/안티/server/plugins/generationStandards.js), [gradingPlugin.js](file:///c:/Users/airfo/OneDrive/바탕 화면/안티/server/plugins/gradingPlugin.js), [validationPlugin.js](file:///c:/Users/airfo/OneDrive/바탕 화면/안티/server/plugins/validationPlugin.js), [engineeringStandards.js](file:///c:/Users/airfo/OneDrive/바탕 화면/안티/server/plugins/engineeringStandards.js))의 기본 목록 배열(`lockscreenStandardsList`, `generationStandardsList`, `gradingStandardsList`, `validationStandardsList`, `standardsList`)을 사용자의 요구사항에 맞게 직접 편집(수정/추가/삭제)하십시오.
   - 코드 수정을 수행한 후에는 반드시 변경 사항을 커밋하고 푸시(`git push`)하여 프로덕션 배포에도 실시간 반영될 수 있도록 조치하십시오.
