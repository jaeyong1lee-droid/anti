const shuffleArray = (arr) => arr.slice().sort(() => Math.random() - 0.5);

const geotechPool = [
  "지반의 전단강도를 극대화하기 위해 유효응력을 증가시키고 간극수압을 신속히 배출하는 공법을 적용한다.",
  "동수경사가 한계동수경사에 도달하면 유효응력이 0이 되어 지반이 지지력을 상실하는 분사 현상이 발생한다.",
  "터널 굴착 시 막장 전방의 아칭 효과를 최대한 유도하여 지반 스스로 하중을 분산시키도록 유도한다.",
  "압밀 시험에서 얻은 압축지수와 압밀계수를 활용하여 연약지반의 최종 침하량 및 소요 시간을 예측한다.",
  "구조물의 안정성 검토 시 요구되는 임계 저항 강도 및 허용 한계를 계측으로 감시한다."
];

const inversionMap = {
  '증가': '감소',
  '감소': '증가',
  '비례': '반비례',
  '반비례': '비례',
  '이하': '이상',
  '이상': '이하',
  '상승': '저하',
  '저하': '상승',
  '촉진': '지연',
  '지연': '촉진',
  '확보': '배제',
  '배제': '확보',
  '유리': '불리',
  '불리': '유리',
  '필수': '불필요',
  '불필요': '필수',
  '일체화': '분리',
  '동일': '상이',
  '독립': '의존',
  '안정': '불안정',
  '불안정': '안정',
  '유사': '상이',
  '내부': '외부',
  '외부': '내부',
  '가능': '불가능',
  '불가능': '가능',
  '유효': '무효',
  '적절': '부적절',
  '용이': '곤란',
  '최대': '최소',
  '최소': '최대',
  '상부': '하부',
  '하부': '상부',
  '팽창': '수축',
  '수축': '팽창',
  '정적': '동적',
  '동적': '정적',
  '탄성': '소성',
  '소성': '탄성',
  '조립토': '세립토',
  '세립토': '조립토',
  '주동': '수동',
  '수동': '주동',
  '느슨한': '조밀한',
  '조밀한': '느슨한',
  '배수': '비배수',
  '투수성': '불투수성',
  '강성': '연성',
  '연성': '강성'
};

function extractSubjectFromSentence(sentence, displayTitle = '해당 공법') {
  const clean = sentence.trim();
  const headerMatch = clean.match(/^([^:.\n]+?)(?::|-|\*\*는|\*\*은)/);
  if (headerMatch) {
    let subj = headerMatch[1].replace(/[*_()]/g, '').trim();
    if (subj.length > 1 && subj.length < 30) return subj;
  }
  const particleMatch = clean.match(/^([A-Za-z가-힣0-9\s_]+?)(?:은|는|이|가|란|이란)\b/);
  if (particleMatch) {
    let subj = particleMatch[1].replace(/[*_()]/g, '').trim();
    if (subj.length > 1 && subj.length < 30) return subj;
  }
  const subjectList = ['샌드매트', '모래', '배수', '투수', '접지압', '두께', '콘지수', '지반', '압밀', '점토', '전단', '파괴', '지지력', '흙', '터널', '지보', '숏크리트', '락볼트', '라이닝', '침투', '수두', '차수', '유효응력', '간극수압', '공법', '설계', '토목', '안전율'];
  for (const term of subjectList) {
    if (clean.includes(term)) return term;
  }
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    let firstTwo = words.slice(0, 2).join(' ').replace(/[*_():.,]/g, '').trim();
    if (firstTwo.length > 1 && firstTwo.length < 30) return firstTwo;
    let first = words[0].replace(/[*_():.,]/g, '').trim();
    return first;
  }
  return '공학 원리';
}

function createGeotechDistractor(sentence) {
  let modified = sentence.trim();
  let replaced = false;
  for (const [orig, repl] of Object.entries(inversionMap)) {
    if (modified.includes(orig)) {
      const regex = new RegExp(orig, 'g');
      modified = modified.replace(regex, repl);
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    if (modified.includes('이다.')) {
      modified = modified.replace('이다.', '이 아니다.');
      replaced = true;
    } else if (modified.includes('한다.')) {
      modified = modified.replace('한다.', '하지 않는다.');
      replaced = true;
    } else if (modified.includes('된다.')) {
      modified = modified.replace('된다.', '되지 않는다.');
      replaced = true;
    } else if (modified.includes('있다.')) {
      modified = modified.replace('있다.', '없다.');
      replaced = true;
    } else if (modified.includes('없다.')) {
      modified = modified.replace('없다.', '있다.');
      replaced = true;
    }
  }
  if (!replaced && /[가-힣]\.$/.test(modified)) {
    const lastWordChar = modified.charAt(modified.length - 2);
    const lastCharCode = lastWordChar.charCodeAt(0);
    let josa = '가';
    if (lastCharCode >= 0xac00 && lastCharCode <= 0xd7a3) {
      const lastConsonant = (lastCharCode - 0xac00) % 28;
      if (lastConsonant > 0) josa = '이';
    }
    modified = modified.slice(0, -1) + `${josa} 아니다.`;
    replaced = true;
  }
  if (!replaced) {
    modified = modified + " (지반 공학 설계 기준에 부합하지 않음)";
  }
  return modified;
}

function generateFallbackQuestions(title, keywords, fileText = '') {
  const cleanTitle = title.toLowerCase();
  const cleanText = fileText.toLowerCase();

  const cleanTextRaw = fileText.replace(/\s+/g, ' ').trim();
  const rawSentences = cleanTextRaw.split(/(?<=[.?!])\s+/);

  const candidates = rawSentences.filter(s => {
    const len = s.length;
    if (len < 25 || len > 180) return false;
    const koreanCharCount = (s.match(/[가-힣]/g) || []).length;
    if (koreanCharCount / len < 0.25) return false;
    const greekOrMath = (s.match(/[αβφθσ◦±∘~^$<>=\[\]\/\\]/g) || []).length;
    if (greekOrMath > 2) return false;
    if (/\b[a-zA-Z가-힣αβφθσ]\s+[a-zA-Z가-힣αβφθσ]\s+[a-zA-Z가-힣αβφθσ]\b/.test(s)) return false;
    return (
      s.endsWith('다.') || s.endsWith('음.') || s.endsWith('함.') || s.endsWith('임.') ||
      s.endsWith('다') || s.endsWith('음') || s.endsWith('함') || s.endsWith('임') ||
      s.includes('기반') || s.includes('구조') || s.includes('특징') ||
      s.includes('공법') || s.includes('방식') || s.includes('설계') ||
      s.includes('압밀') || s.includes('점토') || s.includes('파괴') || s.includes('시험') ||
      s.includes('응력') || s.includes('지반') || s.includes('강도') || s.includes('투영') ||
      s.includes('해석') || s.includes('평가') || s.includes('기준')
    );
  }).map(s => s.replace(/\s+\d+\.?\s*$/, '').trim());

  let uniqueCandidates = Array.from(new Set(candidates));
  if (uniqueCandidates.length < 8) {
    uniqueCandidates = [...uniqueCandidates, ...geotechPool, ...geotechPool];
  }
  // Shuffle uniquely
  uniqueCandidates = shuffleArray(uniqueCandidates);

  const mcQuestions = [];

  for (let i = 0; i < 8; i++) {
    const correctSentence = uniqueCandidates[i];
    let subject = extractSubjectFromSentence(correctSentence, title);
    
    // Clean trailing particles again
    subject = subject.replace(/(?:은|는|이|가|란|이란)$/, '').trim();
    if (subject.length <= 3) {
      subject = `해당 공학 원리(${subject})`;
    }

    const dist1 = createGeotechDistractor(correctSentence);
    const otherCandidates = uniqueCandidates.filter(c => c !== correctSentence);
    const shuffledOthers = shuffleArray([...otherCandidates, ...geotechPool]);
    const correctB = shuffledOthers[0];
    const correctC = shuffledOthers[1];

    let typeIndicator = i % 4; // 0: Correct, 1: Incorrect, 2: Keyword Blank, 3: Composite Selection

    if (typeIndicator === 0) {
      // Type 0: Find Correct
      const formats = [
        `현장 설계 및 시공 조건에서 [${subject}]의 공학적 원리로 가장 적절한 것은?`,
        `[${subject}]에 대한 기술적 진술 중 사실에 가장 부합하는 것을 고르시오.`
      ];
      mcQuestions.push({
        type: '객관식 (4지선다)',
        question: formats[i % formats.length],
        options: shuffleArray([correctSentence, dist1, createGeotechDistractor(correctB), createGeotechDistractor(correctC)]),
        answer: correctSentence,
        explanation: `정답은 "${correctSentence}"입니다. 업로드하신 소스 본문 내용에 근거할 때, [${subject}]에 대한 공학적 진술은 이 설명과 부합합니다.`
      });
    } else if (typeIndicator === 1) {
      // Type 1: Find Incorrect
      const formats = [
        `안정성 검토 및 설계 기준에 따르면, [${subject}]에 관한 진술로 적절하지 않은 것은?`,
        `다음 중 [${subject}]의 메커니즘이나 거동 특성을 잘못 설명하고 있는 것은?`
      ];
      mcQuestions.push({
        type: '객관식 (4지선다)',
        question: formats[i % formats.length],
        options: shuffleArray([dist1, correctSentence, correctB, correctC]),
        answer: dist1,
        explanation: `정답은 "${dist1}"입니다. 이 지문은 [${subject}]에 관한 거동 원리나 현상을 반대로 기술하여 공학적 한계 상태를 왜곡한 오답입니다.`
      });
    } else if (typeIndicator === 2) {
      // Type 2: Keyword Blank (빈칸 추론)
      // Hide the subject in the sentence
      let blankedSentence = correctSentence;
      let actualSubject = extractSubjectFromSentence(correctSentence, title).replace(/(?:은|는|이|가|란|이란)$/, '').trim();
      
      if (actualSubject.length > 1 && blankedSentence.includes(actualSubject)) {
        blankedSentence = blankedSentence.replace(new RegExp(actualSubject, 'g'), '[ (가) ]');
      } else {
        blankedSentence = `[ (가) ]은(는) ` + blankedSentence;
      }
      
      const otherSubjects = shuffleArray([
        extractSubjectFromSentence(correctB).replace(/(?:은|는|이|가|란|이란)$/, '').trim(),
        extractSubjectFromSentence(correctC).replace(/(?:은|는|이|가|란|이란)$/, '').trim(),
        '간극수압', '점착력', '탄성계수', '침하량'
      ]).filter(s => s !== actualSubject && s.length > 1);

      mcQuestions.push({
        type: '객관식 (4지선다)',
        question: `다음 본문의 설명에서 빈칸 (가)에 들어갈 공학적 용어로 가장 적절한 것은?\n\n<본문>\n"${blankedSentence}"`,
        options: shuffleArray([actualSubject, otherSubjects[0], otherSubjects[1], otherSubjects[2]]),
        answer: actualSubject,
        explanation: `정답은 "${actualSubject}"입니다. 본문에서 설명하고 있는 기술적 원리 및 메커니즘은 [${actualSubject}]에 대한 명확한 정의와 특성입니다.`
      });
    } else if (typeIndicator === 3) {
      // Type 3: Composite Selection (합답형)
      const st1 = correctSentence;
      const st2 = correctB;
      const st3 = createGeotechDistractor(correctC); // 틀린 문장
      const st4 = createGeotechDistractor(shuffledOthers[2] || geotechPool[0]); // 틀린 문장
      
      const stArr = shuffleArray([
        { id: 'ㄱ', text: st1, isCorrect: true },
        { id: 'ㄴ', text: st2, isCorrect: true },
        { id: 'ㄷ', text: st3, isCorrect: false },
        { id: 'ㄹ', text: st4, isCorrect: false }
      ]);
      
      const correctIds = stArr.filter(s => s.isCorrect).map(s => s.id).sort().join(', ');
      const opt1 = stArr[0].id + ', ' + stArr[1].id;
      const opt2 = stArr[1].id + ', ' + stArr[2].id;
      const opt3 = stArr[0].id + ', ' + stArr[2].id + ', ' + stArr[3].id;
      
      const finalOpts = shuffleArray([correctIds, opt1, opt2, opt3]);
      // make sure they are strictly unique options, though very likely unique.
      const uniqueOpts = Array.from(new Set([...finalOpts, 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ', 'ㄱ, ㄹ'])).slice(0, 4);
      if (!uniqueOpts.includes(correctIds)) uniqueOpts[0] = correctIds;

      mcQuestions.push({
        type: '객관식 (4지선다)',
        question: `다음 <보기>의 기술적 설명 중 내용이 올바른 것을 모두 고른 것은?\n\n<보기>\nㄱ. ${stArr[0].text}\nㄴ. ${stArr[1].text}\nㄷ. ${stArr[2].text}\nㄹ. ${stArr[3].text}`,
        options: shuffleArray(uniqueOpts),
        answer: correctIds,
        explanation: `정답은 "${correctIds}"입니다. 올바른 문장은 ${correctIds}이며, 나머지 문장들은 전단강도, 응력, 혹은 설계 기준 등의 메커니즘을 정반대로 기술하거나 왜곡한 오답입니다.`
      });
    }
  }

  return mcQuestions;
}

const mockFileText = `
모래 다짐 말뚝 공법(Sand Compaction Pile)은 진동을 이용하여 연약지반 내에 모래기둥을 조성하는 공법이다.
이 공법은 점토 지반에서는 압밀 배수를 촉진하고 모래 지반에서는 밀도를 증가시켜 액상화를 방지한다.
치환율이 높아질수록 복합지반의 지지력은 증가하며 침하량은 감소하는 경향을 보인다.
지반 내 팽창성 점토 광물이 존재할 경우 다짐 효율이 크게 저하되므로 사전 조사가 필수적이다.
상재하중 재하 시 모래기둥으로 응력이 집중되는 응력 분담 효과(Stress Concentration)가 발생한다.
응력 집중비가 클수록 점토 지반에 가해지는 하중이 줄어들어 잔류 침하를 최소화할 수 있다.
설계 시 모래 기둥의 직경과 타설 간격을 고려하여 치환율을 결정하며 현장 조건에 따라 변동될 수 있다.
`;

const res = generateFallbackQuestions('연약지반 모래다짐말뚝', 'SCP', mockFileText);
for (let i = 0; i < res.length; i++) {
  console.log(`\n--- Q${i + 1} (${res[i].type}) ---`);
  console.log('Question:\n' + res[i].question);
  console.log('Options:', res[i].options);
  console.log('Answer:', res[i].answer);
  // console.log('Explanation:', res[i].explanation);
}
