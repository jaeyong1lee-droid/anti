# Antigravity Project Instructions

## 절대 지침 관리 및 수정 수칙 (Absolute Standards Update Rules)

1. **지침의 절대성**:
   - UI의 '기준', '채점', '검증', '문제', '락스크린' 버튼을 클릭했을 때 로드되고 표출되는 모든 지침들(각 파일의 디폴트 기준 리스트 및 DB 세션 값)은 AI 에이전트 및 채점관, 퀴즈 출제자에게 절대적인 헌법과 같은 최우선 순위(#1)의 철칙입니다. 이 지침을 위반하는 문제 출제나 채점은 허용되지 않습니다.

2. **사용자 요청 시 실시간 지침 직접 수정 권한**:
   - 사용자가 Antigravity(AI 튜터) 대화방에서 특정 지침(예: 락스크린 퀴즈 지침, 문제 생성 지침, 주관식 채점 지침, 자가 검증 지침 등)을 "수정", "추가", 또는 "삭제"해 달라고 직접 텍스트로 요구하는 경우:
   - **반드시** 관련 파일([lockscreenStandards.js](file:///c:/Users/airfo/OneDrive/바탕 화면/안티/server/plugins/lockscreenStandards.js), [generationStandards.js](file:///c:/Users/airfo/OneDrive/바탕 화면/안티/server/plugins/generationStandards.js), [gradingPlugin.js](file:///c:/Users/airfo/OneDrive/바탕 화면/안티/server/plugins/gradingPlugin.js), [validationPlugin.js](file:///c:/Users/airfo/OneDrive/바탕 화면/안티/server/plugins/validationPlugin.js), [engineeringStandards.js](file:///c:/Users/airfo/OneDrive/바탕 화면/안티/server/plugins/engineeringStandards.js))의 기본 목록 배열(`lockscreenStandardsList`, `generationStandardsList`, `gradingStandardsList`, `validationStandardsList`, `standardsList`)을 사용자의 요구사항에 맞게 직접 편집(수정/추가/삭제)하십시오.
   - 코드 수정을 수행한 후에는 반드시 변경 사항을 커밋하고 푸시(`git push`)하여 프로덕션 배포에도 실시간 반영될 수 있도록 조치하십시오.

## 데이터베이스 조회 및 쿼리 작성 수칙 (Database Query Standards)

3. **로컬-상용 데이터베이스 독립성 보장**:
   - 로컬 SQLite DB와 상용 Neon PostgreSQL DB는 일련번호(Primary Key ID)가 일치하지 않으므로, 데이터 업데이트나 조회 쿼리를 작성할 때 특정 일련번호(id)값을 직접 하드코딩하거나 상호 동등할 것으로 가정해서는 안 됩니다.
   - 특정 토픽의 복습 일정을 찾고 업데이트할 때의 표준 조회 조건은 항상 **토픽 ID (`topic_id`)**와 **복습 회차 (`review_round`)**의 조합을 기준으로 수행하도록 설계하고 코딩하십시오.

## 대화 답변 표출 철칙 (Mandatory Output Reporting Rule)

4. **작업 완료 후 테스트 실행 및 실제 렌더링 결과 실시간 표출 절대 의무**:
   - 사용자의 모든 지시 및 기능 구현/수정 작업이 끝나면 **예외 없이 답변의 가장 마지막 부분에 반드시 `node test_runner.mjs` 실시간 터미널 TEST 실행 결과 및 실제 렌더링 화면을 대화창 화면에 즉시 바로 표출**하여 시연 및 보고해야 합니다.
   - 사용자가 별도로 독촉하거나 지시하지 않더라도 항시 자동으로 실시간 테스트 결과 및 렌더링 화면이 표출되도록 철저히 이행하십시오.
