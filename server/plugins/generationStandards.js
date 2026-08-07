export let generationStandardsList = [
  {
    "id": "source_report_review_first",
    "title": "1. 출처 사전 학습 및 정론 출제 철칙",
    "content": "🚨 [출처 사전 학습 및 정론 출제 철칙 - 극도로 중요!]: AI는 문제를 출제할 때 가장 첫번째 단계에서 반드시 관련 출처 보고서 및 국가기준/학술문헌(KDS/KCS, 원보고서 본문, Wikipedia Soil Mechanics)의 원문 내용과 핵심 지침을 직접 읽고 사전 학습해야 합니다. 이 공부한 출처 문헌에 근거하여 질문을 설계하고, 해설 필드에 정확한 출처(예: '* KDS 11 10 20 (설계지침)')를 명시하십시오. 하드코딩되거나 무관한 더미 찌꺼기 문구를 절대 사용해서는 안 됩니다.",
    "updatedAt": new Date().toISOString()
  },
  {
    "id": "user_generation_comprehensive_engineering",
    "title": "2. 기술사급 종합 응용 및 다차원 통합 출제",
    "content": "🚨 [기술사급 종합 응용 및 다차원 통합 출제 - 극도로 중요!]: 단순 요약식 단어나 문장을 베끼는 1차원적 저난도 출제를 엄격히 금지합니다. 해당 토픽에 대해 AI 튜터와 대화할 때 도출되는 ① 물리적·역학적 거동 메커니즘, ② 수식 유도 과정 및 기본 가정 조건, ③ 공법/이론 간의 장단점 비교 대조, ④ 설계·시공 현장에서의 실무적 문제 상황 해결 시나리오 등 2개 이상의 세부 항목을 연계하여 지반공학 전공 서적 및 설계기준(KDS) 관점에서 심층 평가하는 기술사형 통찰 문제로 출제하십시오.",
    "updatedAt": new Date().toISOString()
  },
  {
    "id": "user_generation_bu5e5cd",
    "title": "3. 표 채우기(Table Quiz) 대조축 독립성 및 무결성 철칙",
    "content": "🚨 [표 채우기 대조축 독립성 및 무결성 철칙 - 극도로 중요!]:\n1. [가로/세로축 독립 차원 설계 의무화]: 가로 헤더(Column)와 세로 헤더(Row)는 반드시 서로 완전히 다른 고유한 공학적 평가 차원(예: 세로축 = '비교 공법/이론', 가로축 = '평가 속성/메커니즘')으로 설계하십시오.\n2. [의미적 중복 및 말장난 셀 금지]: 행(Row)과 열(Column)이 교차하는 격자 간 정답의 공학적 의미가 모호하거나 유사한 개념으로 중복 분할되는 부실한 셀 설계를 철저히 금지합니다. 가로축과 세로축이 만나는 모든 격자(Cell)는 공학적으로 모순 없이 명확히 구분되는 고유한 답안이어야 합니다.\n3. [최대 2~4개 핵심 빈칸 제한 및 Row-Major 순서 매핑]: 모든 셀을 빈칸으로 만들지 말고, 각 행당 1개 내외로 총 2~4개의 핵심 빈칸만 [INPUT_1]~[INPUT_4]로 설정하고 나머지 셀에는 풍부한 비교 참조 지식을 사전 채워넣으십시오. [INPUT_1]~[INPUT_4]는 반드시 가로행 우선(Row-Major) 순서로 answers 객체의 키(INPUT_1, INPUT_2 등)와 100% 매핑되도록 물리적으로 일치시키십시오.\n4. [지문 내 표 재작성 금지]: question 필드에는 표를 직접 작성하지 말고, 단순하고 명확한 질문 문장(예: '다음 비교표 빈칸에 들어갈 내용을 서술하시오.')으로만 구성하십시오.\n5. [AI 동적 출제 및 고정 템플릿 금지]: 하드코딩된 정적 템플릿 문구를 절대 강제 덮어쓰지 말고, AI가 해당 토픽의 원보고서와 지지력/유선망/토압 등 핵심 공법/이론의 본질을 직접 파악하여 타 관련 이론과 비교 분석하는 문제를 동적으로 출제(AI Dynamic Generation)하도록 하십시오.",
    "updatedAt": new Date().toISOString()
  },
  {
    "id": "user_generation_essay_and_noun_ending",
    "title": "4. 주관식 서술형 고난도 및 간결성 출제 철칙",
    "content": "🚨 [주관식 서술형 출제 간결성 철칙 - 극도로 중요!]:\n1. [핵심 위주 간결한 질문]: 주관식 문항(단답형 등)은 단순 용어만을 묻는 수준 낮은 출제를 피하되, 질문(question) 본문에 지나치게 길고 장황한 현장 상황 시나리오나 공학적 조건을 전부 나열하여 정답을 유출(스포일러)하는 행위를 엄격히 금지합니다.\n2. [출제 방향]: 질문은 2~3줄 이내로 간결명료하게 작성하여, 수험생이 스스로 현장 상황과 역학적 원리를 떠올려 서술할 수 있도록 '핵심 한계점', '주요 단점', '핵심 대책' 등을 핵심만 찌르듯이 도출하여 출제하십시오.",
    "updatedAt": new Date().toISOString()
  },
  {
    "id": "user_generation_vfp6zqj",
    "title": "5. 객관식 계산값 정확성 및 발문 종결 어미 철칙",
    "content": "🚨 [객관식 계산값 정확성 및 발문 종결 어미 철칙 - 극도로 중요!]:\n1. [정확한 계산값 보기 주입]: 계산형 문제 출제 시, 정답과 공식 대입으로 산출되는 실제 정확한 공학적 계산값(소수점 포함)은 반드시 4개 보기 항목 중 하나로 포함시키십시오. 임의의 정수로 둥글게 만들어 '가장 근사한 값을 고르라'는 식으로 얼버무리는 행위를 엄금합니다.\n2. [변별력 오답 보기 구성]: 단순 가감산 산수 문제를 지양하고 다단계 공학 공식 대입 및 명확한 오개념에 기초한 유인 오답 보기를 설계하십시오.\n3. [발문 종결 어미]: 객관식 질문 본문(question)의 마지막 종결 어미로 절대로 '서술하십시오'를 사용하지 말고, 반드시 '알맞은 것을 고르시오', '선택하십시오'로 작성하십시오.",
    "updatedAt": new Date().toISOString()
  },
  {
    "id": "user_generation_simplified_math_unit",
    "title": "6. 수식 및 단위 표기 단권화 표정 표준 철칙",
    "content": "🚨 [수식 및 단위 표기 단권화 표정 표준 철칙 - 극도로 중요!]: 수식과 수치/단위 작성 시 `\\(` `\\)` 나 `\\[` `\\]`, `(\\ (` 같은 이중 괄호 이스케이프 및 불필요하게 꼬인 지시 표현을 철저히 금지합니다. 문장 내부에 들어가는 인라인 수식은 반드시 `$94.4\\text{mm}$` 형태로 단일 달러(`$ ... $`)를 사용하고, 줄을 바꿔 단독으로 중앙 정렬해야 하는 큰 핵심 공식은 반드시 이중 달러(`$$ ... $$`) 문법만 사용하여 일관성 있게 출력하십시오.",
    "updatedAt": new Date().toISOString()
  },
  {
    "id": "user_generation_subscript_braces",
    "title": "7. 수식 밑첨자 다중 문자 중괄호 필수 철칙",
    "content": "🚨 [수식 밑첨자 다중 문자 중괄호 필수 철칙 - 극도로 중요!]: 2자리 이상의 숫자나 문자가 결합된 밑첨자를 표현할 때는 반드시 전체를 중괄호 `{}`로 감싸서 출력하십시오. (예시: `E_{50}`, `D_{10}`, `C_u`) 절대로 `E_50`과 같이 중괄호를 누락하여 수식이 깨지게 만들지 마십시오.",
    "updatedAt": new Date().toISOString()
  }
];

export let GENERATION_STANDARDS = assembleGenerationStandardsPrompt(generationStandardsList);

export function assembleGenerationStandardsPrompt(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return "- 등록된 문제생성 지침 기준이 없습니다.";
  }
  return list.map((std, idx) => "" + (idx + 1) + ". **" + std.title + "**:\n   - " + std.content).join('\n');
}

export function updateLiveGenerationStandards(newList) {
  generationStandardsList = newList;
  GENERATION_STANDARDS = assembleGenerationStandardsPrompt(newList);
}
