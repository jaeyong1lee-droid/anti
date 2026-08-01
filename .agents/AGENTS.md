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

## 자가 개선 및 검증 철칙 (Self-Improvement Testing Directive) - [절대 지침 #1]

4. **모든 사용자 지시 사항 자가 개선 테스터 직접 테스트 및 결과보고 의무화 [극도로 중요/절대 철칙]**:
   - 사용자가 지시하거나 요청하는 모든 코드 수정, UI 조정, 기능 추가/수정 지시사항에 대해:
   - **반드시 자가 개선 테스터가 지시사항에 대한 실제 동작/빌드/스크립트 테스트를 직접 수행해 보고, 그 실증적 수치/동작 테스트 결과를 사용자에게 투명하게 명시하여 보고하는 것을 최우선 순위의 절대 지침(#1)으로 삼는다.**
   - 단순 코드 편집으로 끝내지 말고, 자가 개선 테스터 스크립트 가동 및 컴파일/빌드 검증을 통해 지시사항이 100% 정상 작동함을 자가 입증한 후 답변 출력 시 항상 `[🤖 자가 개선 테스터 검증 보고서]` 항목으로 결과를 명확히 보고하십시오.
