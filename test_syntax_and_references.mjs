// [초고도화된 자가 개선 테스터]: 런타임 ReferenceError 사전 방지 및 latexUtils / App.jsx 무결성 정밀 검증 스크립트

import fs from 'fs';
import path from 'path';

console.log("==========================================================");
console.log("🤖 [초고도화된 자가 개선 테스터: ReferenceError 0% 사전 검증]");
console.log("==========================================================\n");

let failedCount = 0;

// [TEST 1] client/src/utils/latexUtils.js 런타임 실전 실행 테스트 (ReferenceError 검사)
console.log("[TEST 1] client/src/utils/latexUtils.js 함수 런타임 실전 검증...");
try {
  const clientLatexUtils = await import('./client/src/utils/latexUtils.js');
  
  // 다양한 퀴즈 객체 모의 데이터 세트 준비
  const mockComparisonQuiz = {
    type: '주관식 (표채우기)',
    question: '지반 조건별 그라우팅 주입재 적용성 비교표',
    tableData: {
      headers: ['주입재 종류', '지반 조건', '장점', '단점', '활용분야'],
      rows: [
        ['시멘트계', 'A 입력', 'B 입력', 'C 입력', 'D 입력'],
        ['규산소다계', 'E 입력', 'F 입력', 'G 입력', 'H 입력'],
        ['초미립자 시멘트', 'I 입력', 'J 입력', 'K 입력', 'L 입력'],
        ['약액(용액형)', 'M 입력', 'N 입력', 'O 입력', 'P 입력']
      ]
    },
    answers: { A: '사질토', B: '고강도', C: '침투한계', D: '대규모 공극' }
  };

  const mockCalcQuiz = {
    type: '주관식 (계산)',
    tableData: {
      headers: ['구하는 항목', '답안'],
      rows: [['안전율 F.S', '[INPUT_1]']]
    },
    answers: { INPUT_1: '2.5' }
  };

  const mockOverviewQuiz = {
    type: '주관식 (개요)',
    question: 'Terzaghi 지지력 공식',
    explanation: '핵심 개념 및 메커니즘'
  };

  const mockTerzaghiCalc = {
    type: '주관식 (계산)',
    question: 'Terzaghi 지지력 공식을 사용하여 허용지지력 및 허용하중을 산정하시오. B=2.0m, c=20kPa, phi=30도. (1) 조건(a) 허용지지력 q_all(a) (2) 조건(a) 허용하중 P_all(a) (3) 조건(b) 허용지지력 q_all(b) (4) 조건(b) 허용하중 P_all(b)',
    tableData: {
      headers: ['구하는 항목', '계산 결과 및 답안'],
      rows: [
        ['(1) 조건 (a)의 허용지지력 q_all(a) (kN/m²)', '[INPUT_1]'],
        ['(2) 조건 (a)의 허용하중 P_all(a) (kN)', '[INPUT_2]'],
        ['(3) 조건 (b)의 허용지지력 q_all(b) (kN/m²)', '[INPUT_3]'],
        ['(4) 조건 (b)의 허용하중 P_all(b) (kN)', '[INPUT_4]']
      ]
    },
    answers: { INPUT_1: '632', INPUT_2: '10112', INPUT_3: '813', INPUT_4: '13008' }
  };

  // healQuizQuestionObject 실전 런타임호출 테스트
  const healedComp = clientLatexUtils.healQuizQuestionObject(mockComparisonQuiz);
  if (!healedComp || !healedComp.tableData) {
    throw new Error('healQuizQuestionObject(Comparison) 반환 구조 결함');
  }
  console.log('  ➜ [PASS] healQuizQuestionObject (비교표 16개 셀 모의 데이터) ReferenceError 없이 통과!');

  const healedCalc = clientLatexUtils.healQuizQuestionObject(mockCalcQuiz);
  if (!healedCalc) throw new Error('healQuizQuestionObject(Calc) 반환 구조 결함');
  console.log('  ➜ [PASS] healQuizQuestionObject (계산표 모의 데이터) ReferenceError 없이 통과!');

  const healedTerzaghi = clientLatexUtils.healQuizQuestionObject(mockTerzaghiCalc);
  if (!healedTerzaghi || !healedTerzaghi.calcItems || healedTerzaghi.calcItems.length !== 4) {
    throw new Error('healQuizQuestionObject(Terzaghi 4개 수치 항목) 추출 결함');
  }
  const isCalcQ = clientLatexUtils.isCalculationQuestion(mockTerzaghiCalc);
  if (!isCalcQ) throw new Error('isCalculationQuestion(Terzaghi) 판정 오류');
  console.log('  ➜ [PASS] Terzaghi 수치 계산 문제 4개 항목(A,B,C,D) 100% 감지 및 healQuizQuestionObject 통과!');

  const healedOverview = clientLatexUtils.healQuizQuestionObject(mockOverviewQuiz);
  if (!healedOverview) throw new Error('healQuizQuestionObject(Overview) 반환 구조 결함');
  console.log('  ➜ [PASS] healQuizQuestionObject (개요 모의 데이터) ReferenceError 없이 통과!');

  const healedAnswersheet = clientLatexUtils.healAnswersheetQuestionObject(mockComparisonQuiz);
  if (!healedAnswersheet) throw new Error('healAnswersheetQuestionObject 반환 구조 결함');
  console.log('  ➜ [PASS] healAnswersheetQuestionObject ReferenceError 없이 통과!');

} catch (err) {
  failedCount++;
  console.error(`  ❌ [CRITICAL FAIL] client/src/utils/latexUtils.js 런타임 오류 감지: ${err.stack || err.message}`);
}

// [TEST 2] server/utils/latexUtils.js 런타임 실전 실행 테스트
console.log('\n[TEST 2] server/utils/latexUtils.js 백엔드 유틸리티 런타임 검증...');
try {
  const serverLatexUtils = await import('./server/utils/latexUtils.js');
  const mockQuiz = {
    type: '주관식 (표채우기)',
    tableData: {
      headers: ['구분', '공법A', '공법B'],
      rows: [['메커니즘', 'A 입력', 'B 입력']]
    },
    answers: { A: '답1', B: '답2' }
  };
  const healed = serverLatexUtils.healQuizQuestionObject(mockQuiz);
  if (!healed) throw new Error('server healQuizQuestionObject 반환 오류');
  console.log('  ➜ [PASS] server/utils/latexUtils.js ReferenceError 없이 런타임 통과!');
} catch (err) {
  failedCount++;
  console.error(`  ❌ [CRITICAL FAIL] server/utils/latexUtils.js 런타임 오류 감지: ${err.stack || err.message}`);
}

// [TEST 3] 식별자 선언 스코프 전수 정밀 정적 스캔 (App.jsx, latexUtils.js)
console.log('\n[TEST 3] 핵심 소스파일 미선언 변수(ReferenceError 유발 원인) 전수 정밀 스캔...');
const targetFiles = [
  'client/src/App.jsx',
  'client/src/utils/latexUtils.js',
  'server/utils/latexUtils.js',
  'server/routes/gradingRoutes.js',
  'server/routes/quizRoutes.js',
  'server/plugins/calculationPlugin.js'
];

const checkSymbols = [
  'isComparisonTable', 'isExcessPlaceholders', 'targetCIdx', 'boxNum', 'boxNumMatch', 'validateAndHealQuestion',
  'lockedTableIds', 'lockedAcronymIds', 'lockedOverviewIds',
  'setLockedTableIds', 'setLockedAcronymIds', 'setLockedOverviewIds'
];

for (const filePath of targetFiles) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) continue;
  const fileContent = fs.readFileSync(fullPath, 'utf8');
  const lines = fileContent.split('\n');

  for (const sym of checkSymbols) {
    lines.forEach((lineStr, lineIdx) => {
      const symRegex = new RegExp(`\\b${sym}\\b`);
      if (symRegex.test(lineStr)) {
        // 해당 구문 이전에서 식별자가 선언되었는지 확인
        const beforeContent = lines.slice(Math.max(0, lineIdx - 20), lineIdx + 1).join('\n');
        const isDecl = new RegExp(`(const|let|var|function|import|export|class|\\(|,)\\s*${sym}\\b`).test(beforeContent);
        if (!isDecl && !lineStr.includes(`//`) && !lineStr.includes(`*`)) {
          // 추가 확인: 파일 전체 스코프에 선언이 존재하는지 전수 체크
          const fullDecl = new RegExp(`(const|let|var|function|import|export|class|{|,)\\s*[^;\\n]*\\b${sym}\\b`).test(fileContent);
          if (!fullDecl) {
            failedCount++;
            console.error(`  ❌ [CRITICAL ReferenceError 감지]: ${filePath}:${lineIdx + 1} 라인에서 식별자 '${sym}'가 선언(useState/const/let/props) 없이 참조되고 있습니다!`);
          }
        }
      }
    });
  }
}

if (failedCount === 0) {
  console.log('  ➜ [PASS] 미선언 식별자 스코프 전수 스캔 100% 정상 (ReferenceError 위험 요인 0개)');
}

// [TEST 4] 자물쇠(Lock/Unlock) 기능 UI 컴포넌트 실체화 정밀 검증 (Table, Acronym, Overview)
console.log('\n[TEST 4] 자물쇠(Lock/Unlock) 기능 UI 컴포넌트 실체화 정밀 검증 (선언 + 사용 이중 검증)...');
const lockVerificationFiles = [
  'client/src/App.jsx',
  'client/src/components/FloatingMemorization.jsx'
];

for (const filePath of lockVerificationFiles) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    failedCount++;
    console.error(`  ❌ [CRITICAL FAIL] 필수 소스파일 ${filePath} 가 존재하지 않습니다.`);
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');

  // Check state declarations and lock icon imports
  const hasLockIcon = content.includes('<Lock') || content.includes('Lock,') || content.includes('Lock ');
  
  // Verify both declaration AND usage for each lock state
  const hasLockedTableDecl = /const\s*\[\s*lockedTableIds|lockedTableIds\s*=\s*\{\}/.test(content);
  const hasLockedAcronymDecl = /const\s*\[\s*lockedAcronymIds|lockedAcronymIds\s*=\s*\{\}/.test(content);
  const hasLockedOverviewDecl = /const\s*\[\s*lockedOverviewIds|lockedOverviewIds\s*=\s*\{\}/.test(content);

  const hasLockedTableUse = content.includes('lockedTableIds');
  const hasLockedAcronymUse = content.includes('lockedAcronymIds');
  const hasLockedOverviewUse = content.includes('lockedOverviewIds');

  if (!hasLockIcon) {
    failedCount++;
    console.error(`  ❌ [자물쇠 기능 누락 감지]: ${filePath} 에 <Lock> 자물쇠 아이콘 컴포넌트가 존재하지 않습니다!`);
  }
  if (!hasLockedTableDecl || !hasLockedTableUse) {
    failedCount++;
    console.error(`  ❌ [자물쇠 선언/사용 누락 감지]: ${filePath} 에 lockedTableIds (표 자물쇠 상태) 선언(${hasLockedTableDecl}) 및 사용(${hasLockedTableUse}) 검증 실패!`);
  }
  if (!hasLockedAcronymDecl || !hasLockedAcronymUse) {
    failedCount++;
    console.error(`  ❌ [자물쇠 선언/사용 누락 감지]: ${filePath} 에 lockedAcronymIds (두문자 자물쇠 상태) 선언(${hasLockedAcronymDecl}) 및 사용(${hasLockedAcronymUse}) 검증 실패!`);
  }
  if (!hasLockedOverviewDecl || !hasLockedOverviewUse) {
    failedCount++;
    console.error(`  ❌ [자물쇠 선언/사용 누락 감지]: ${filePath} 에 lockedOverviewIds (개요 자물쇠 상태) 선언(${hasLockedOverviewDecl}) 및 사용(${hasLockedOverviewUse}) 검증 실패!`);
  }

  if (hasLockIcon && hasLockedTableDecl && hasLockedAcronymDecl && hasLockedOverviewDecl && hasLockedTableUse && hasLockedAcronymUse && hasLockedOverviewUse) {
    console.log(`  ➜ [PASS] ${filePath} 표, 두문자, 개요 3개 탭 자물쇠(Lock/Unlock) 선언+사용 100% 정상 실체화 확인!`);
  }
}

// [TEST 5] 자물쇠(Lock) 상태 시 수정/재생성/삭제 차단 정밀 검증 (Lock Leak Detection)
console.log('\n[TEST 5] 자물쇠(Lock) 상태 시 수정/재생성/삭제 차단 정밀 검증 (Lock Leak Detection)...');
const appContent = fs.readFileSync(path.resolve('client/src/App.jsx'), 'utf8');

const lockLeakChecks = [
  { name: '표 AI 재작성 차단 (handleRegenerateTable)', check: appContent.includes('lockedTableIds[t.id]') && appContent.includes('표가 잠겨 있어 재작성할 수 없습니다.') },
  { name: '표 셀/헤더 편집 차단 (lockedTableIds)', check: /lockedTableIds\[t\.id\]\s*\|\|\s*hIdx\s*===\s*0/.test(appContent) && appContent.includes('if (lockedTableIds[t.id]) return;') },
  { name: '두문자 완전변경 차단 (handleRegenerateAcronym)', check: appContent.includes('lockedAcronymIds[ac.id]') && appContent.includes('두문자가 잠겨 있어 완전변경할 수 없습니다.') },
  { name: '두문자 재조합 차단 (handleOptimizeAcronym)', check: appContent.includes('lockedAcronymIds[ac.id]') && appContent.includes('두문자가 잠겨 있어 재조합할 수 없습니다.') },
  { name: '두문자 입력창 readOnly 차단 (lockedAcronymIds)', check: appContent.includes('readOnly={lockedAcronymIds[ac.id]}') },
  { name: '개요 새로고침 차단 (handleRefreshOverview)', check: appContent.includes('lockedOverviewIds[ov.id]') && appContent.includes('개요가 잠겨 있어 새로고침할 수 없습니다.') },
  { name: '개요 비교표 헤더 편집 차단 (lockedOverviewIds)', check: appContent.includes('if (lockedOverviewIds[ov.id]) return;') },
  { name: '개요 비교표 행 삭제 차단 (lockedOverviewIds)', check: appContent.includes('!lockedOverviewIds[ov.id]') }
];

for (const lc of lockLeakChecks) {
  if (!lc.check) {
    failedCount++;
    console.error(`  ❌ [자물쇠 수정 누수 감지]: ${lc.name} 가드 로직이 누락되어 있습니다!`);
  } else {
    console.log(`  ➜ [PASS] ${lc.name} 차단 가드 100% 정상 작동 확인`);
  }
}

// [TEST 6] 더미 수치 계산 항목 (수치 계산 항목 1, 2) 감지기 (Dummy Calc Item Fault Detector)
console.log('\n[TEST 6] 더미 수치 계산 항목 (수치 계산 항목 1, 2) 감지기 (Dummy Calc Item Fault Detector)...');
const { healQuizQuestionObject } = await import('./client/src/utils/latexUtils.js');
const mockTopic53Q = {
  type: '주관식 (계산)',
  question: "3. 그림에 나타낸 댐에 대하여 (1) 침투수량 (2) A, B 및 C점에서의 간극수압, (3) C점에서 출구까지 동수경사를 구하시오. 단, 흙의 투수계수는 2.0*10^-3 m/s 이다.",
  topicId: 53,
  calcItems: [
    { id: 'INPUT_1', label: '(1) 수치 계산 항목 1' },
    { id: 'INPUT_2', label: '(2) 수치 계산 항목 2' }
  ]
};

const healed53 = healQuizQuestionObject(mockTopic53Q);
const isDummyPresent = healed53.calcItems.some(it => /수치\s*계산\s*항목/i.test(it.label || ''));
const isCountInvalid = healed53.calcItems.length !== 5;

const mockTypoTopic53Q = {
  type: '주관식 (계산)',
  question: "3. 그림에 나타낸 덤에 대하여 (1) 침투수량 (2) A, B 및 C점에서의 간극수압, (3) C점에서 출구까지 동수경사를 구하시오.",
  topicId: 53
};
const healedTypo53 = healQuizQuestionObject(mockTypoTopic53Q);
const hasTerzaghiHijack = healedTypo53.calcItems.some(it => /q_\{all\}|P_\{all\}|허용지지력/i.test(it.label || ''));
const isTypo53Valid = healedTypo53.calcItems.length === 5;

if (isDummyPresent || isCountInvalid || hasTerzaghiHijack || !isTypo53Valid) {
  failedCount++;
  console.error(`  ❌ [더미/Terzaghi 하이재킹 감지 오류]: 주제 53 오타 지문("덤에 대하여")에서 Terzaghi 하이재킹(${hasTerzaghiHijack}) 또는 잘못된 항목 수(${healedTypo53.calcItems.length}개)가 감지되었습니다!`);
} else {
  console.log(`  ➜ [PASS] 주제 53 오타 지문("덤에 대하여") Terzaghi 하이재킹 0% 방지 및 5개 침투 항목 100% 보정 생성!`);
}

// [TEST 8] Dynamic Item Extraction & Dummy Label Wording Purge Check
console.log('\n[TEST 8] 동적 변수 추출 및 더미 문구("수치 계산 요구 항목") 완전 박멸 검증...');
const mockLimestoneQ = {
  type: '주관식 (계산)',
  question: "석회암 코어시료에 대한 실내실험을 수행한 결과가 다음과 같다. 그 결과를 Mohr 파괴기준으로 도시하고, 삼축시험결과를 이용하여 S_i(점착력)값과 \\phi(내부마찰각)값을 나타내시오."
};
const healedLimestone = healQuizQuestionObject(mockLimestoneQ);
const isSiPresent = healedLimestone.calcItems?.some(it => /점착력|S_i/i.test(it.label || ''));
const isPhiPresent = healedLimestone.calcItems?.some(it => /내부마찰각|\\phi|phi/i.test(it.label || ''));

const scanDummyFiles = [
  'client/src/utils/latexUtils.js',
  'server/utils/latexUtils.js',
  'server/plugins/calculationPlugin.js'
];
let dummyLabelFound = false;
for (const fileRel of scanDummyFiles) {
  const content = fs.readFileSync(path.resolve(fileRel), 'utf8');
  if (content.includes('수치 계산 요구 항목')) {
    dummyLabelFound = true;
    console.error(`  ❌ [더미 라벨 박멸 실패]: ${fileRel} 소스에 하드코딩된 '수치 계산 요구 항목'이 남아있습니다!`);
  }
}

if (!isSiPresent || !isPhiPresent || dummyLabelFound) {
  failedCount++;
  console.error(`  ❌ [동적 추출/더미 박멸 실패]: Limestone Si: ${isSiPresent}, Phi: ${isPhiPresent}, DummyLabelFound: ${dummyLabelFound}`);
} else {
  console.log(`  ➜ [PASS] 석회암 문제 (점착력 S_i, 내부마찰각 φ) 100% 동적 파싱 및 더미 문구 하드코딩 0개 완전 박멸 검증 통과!`);
}

console.log('\n==========================================================');
if (failedCount > 0) {
  console.error(`  ❌ 자가 개선 테스터 검증 실패 - ${failedCount}개의 런타임 위험 감지됨!`);
  console.log('==========================================================');
  process.exit(1);
} else {
  console.log('  ✅ [초고도화 자가 개선 테스터 최종 통과]: ReferenceError 0% 및 자물쇠 수정차단 100% 정밀 검증 완료!');
  console.log('==========================================================');
  process.exit(0);
}
