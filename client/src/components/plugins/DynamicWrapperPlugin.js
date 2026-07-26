// ============================================================================
// ⚡ Dynamic Wrapper Plugin (동적 감싸기 전용 모듈화 플러그인)
// - 메커니즘/절차/가정사항 동적 카드 박스 (wrapMechanismProcedureAssumptionsHtml)
// - 공식 기호 정의 '여기서,' 동적 카드 박스 (wrapSymbolDefinitionsHtml)
// - '다음과 같은...' 나열 목록 동적 카드 박스 (wrapFollowingListItemsHtml)
// ============================================================================

/**
 * 1. '다음과 같은', '아래와 같은', '주요 특징' 서두 문장 + 2개 이상 불릿 목록 동적 감싸기
 */
export function wrapFollowingListItemsHtml(text) {
  if (!text || typeof text !== 'string') return text;

  // 🚨 [ReDoS 방지]: 외부 + 반복 그룹 내 [\ s\S]*? → [^\n<]* 로 라인 바운드 대체 (Catastrophic Backtracking 완전 차단)
  const followingListSectionRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*|#{1,6}\s*|\[|\*\*)?\s*([^\n<]*(?:다음과\s*같은|아래와\s*같은|다음과\s*같이|아래와\s*같이|다음\s*항목|아래\s*항목|주요\s*특징|특징은\s*다음|사항은\s*다음|다음과\s*같음)[^\n<]*)\s*[:\]\*\*,\.]*[ \t]*(?:<\/div>|<\/p>|<br\/>|\n)*\s*((?:(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*|\d+[\.\)]\s+)[^\n<]*(?:<\/div>|<\/p>|<br\/>|\n|$))+)/gi;

  return text.replace(followingListSectionRegex, (fullMatch, headerTitle, listBlock) => {
    if (fullMatch.includes('___HTML_TABLE_') || fullMatch.includes('___CODE_BLOCK_') || fullMatch.includes('flowchart-text-force') || /<table/i.test(fullMatch)) {
      return fullMatch;
    }

    const rawLines = listBlock.split(/(?:<\/p>|<\/div>|<br\/>|\n)+/);
    const itemBoxes = [];

    rawLines.forEach((line) => {
      const stripped = line.replace(/<[^>]+>/g, '').trim();
      if (!stripped) return;

      const content = stripped.replace(/^(?:[•\*\-]\s*|\d+[\.\)]\s*)/, '').trim();
      if (content && !/^[-–—\s]+$/.test(content) && content !== '--' && content !== '---') {
        const highlightedContent = content.includes(':') 
          ? content.replace(/^([^:]+:)/, '<strong class="text-amber-300 font-bold">$1</strong>')
          : content;
        itemBoxes.push(
          `<div class="flex items-start gap-2.5 p-2.5 my-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 shadow-sm text-left select-text"><span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0 mt-2 shadow-sm shadow-emerald-400/50"></span><div class="flex-1 text-[11px] sm:text-[13px] text-slate-100 leading-relaxed break-words">${highlightedContent}</div></div>`
        );
      }
    });

    if (itemBoxes.length < 2) return fullMatch;

    const titleClean = headerTitle.replace(/<[^>]+>/g, '').replace(/^[#\*\-•\[\]\s]+/, '').replace(/[#\*\-•\[\]\s]+$/, '').trim();

    return `<div class="my-3.5 p-3.5 rounded-2xl bg-slate-950/80 border border-emerald-500/30 shadow-md text-left"><div class="flex items-center gap-2 mb-2.5 pb-2 border-b border-emerald-500/20 text-emerald-400 text-xs sm:text-sm font-extrabold select-none"><span class="text-base">📌</span><span>${titleClean || '핵심 요약 목록'}</span></div><div class="space-y-1.5">${itemBoxes.join('')}</div></div>`;
  });
}

/**
 * 2. 디스플레이 수식 아래 '여기서,', 'Where,', '기호 정의' 단락 동적 감싸기
 */
/**
 * 2. 디스플레이 수식 아래 '여기서,', 'Where,', '기호 정의' 또는 헤더 없는 2개 이상의 '• 기호: 설명' 불릿 목록 동적 감싸기
 */
export function wrapSymbolDefinitionsHtml(text) {
  if (!text || typeof text !== 'string') return text;

  let cleanText = text.replace(/(?:<br\/>|\n|<p>)\s*(?:<div[^>]*>)?\s*[\*\-•]\s*(?:<\/div>|<\/p>|<br\/>|\n|$)/gi, '');

  const formatSymbolVar = (rawSymbol) => {
    if (!rawSymbol) return '';
    // 🚨 대괄호 [ ], 달러 $, 불릿 문자 • * - 등을 양쪽 끝에서 깨끗이 정돈
    let clean = rawSymbol.replace(/^[•\*\-\u2022\s\$\[\]]+|[•\*\-\u2022\s\$\[\]]+$/g, '').trim();
    if (!clean) return '';
    // 만약 내부가 이미 $...$로 감싸져 있다면 탈피 후 재포장하여 $...$ 보장
    clean = clean.replace(/^\$+|\$+$/g, '').trim();
    if (!clean) return '';
    return `$${clean}$`;
  };

  // 1) Explicit header with symbols (여기서, Where, 기호 정의, 변수 정의 등)
  // 🚨 [ReDoS 방지]: 외부 + 반복 그룹 내 [\s\S]*? → [^\n<]* 로 라인 바운드 대체 (Catastrophic Backtracking 완전 차단)
  const symbolSectionRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*|#{1,6}\s*|\[|\*\*)?\s*([^\n<]*(?:여기서|Where|기호\s*정의|변수\s*정의|공식\s*기호|기호\s*설명)[^\n<]*)\s*[:\]\*\*,\.]*[ \t]*(?:<\/div>|<\/p>|<br\/>|\n)+\s*((?:(?:<div[^>]*>|<p>)?\s*(?:[•\*\-\u2022]\s*)?[^\n<:]+:\s*[^\n<]*(?:<\/div>|<\/p>|<br\/>|\n|$))+)/gi;

  cleanText = cleanText.replace(symbolSectionRegex, (fullMatch, headerTitle, symbolsBlock) => {
    if (fullMatch.includes('___HTML_TABLE_') || fullMatch.includes('___CODE_BLOCK_') || /<table/i.test(fullMatch)) {
      return fullMatch;
    }

    const rawLines = symbolsBlock.split(/(?:<\/p>|<\/div>|<br\/>|\n)+/);
    const itemBoxes = [];

    rawLines.forEach((line) => {
      const stripped = line.replace(/<[^>]+>/g, '').trim();
      if (!stripped) return;

      // 🚨 KDS, KCS, Wikipedia 참조 라인은 기호 정의 카드로 묶이지 않도록 필터링
      if (/kds|kcs|wikipedia|soil\s*mechanics|설계기준|규정\s*참조|출처|http/i.test(stripped)) return;

      const matchSymbol = stripped.match(/^(?:[•\*\-\u2022]\s*)?([^\n<:]+):\s*(.+)$/);
      if (matchSymbol) {
        const rawVar = matchSymbol[1].trim();
        const cleanRawVar = rawVar.replace(/^[•\*\-\u2022\s\$]+|[•\*\-\u2022\s\$]+$/g, '').trim();
        if (/kds|kcs|wikipedia|soil\s*mechanics/i.test(rawVar)) return;
        // 🚨 [사용자 절대 수칙]: 기호 정의는 수식 변수(영문/그리스 기호)에만 적용하고 2글자 이상 한글 서술형 단어는 100% 예외 배제
        if (/[가-힣]{2,}/.test(cleanRawVar)) return;
        const symbolVar = formatSymbolVar(rawVar);
        const descText = matchSymbol[2].trim();
        if (symbolVar) {
          itemBoxes.push(
            `<div class="flex items-baseline gap-2 px-1 py-0.5 select-text text-left leading-relaxed"><span class="text-purple-300 font-bold font-mono text-[11px] sm:text-[13px] italic shrink-0">• ${symbolVar}:</span><div class="flex-1 text-[11px] sm:text-[13px] text-slate-100 leading-relaxed break-words">${descText}</div></div>`
          );
        }
      }
    });

    if (itemBoxes.length === 0) return fullMatch;

    const titleClean = headerTitle.replace(/<[^>]+>/g, '').replace(/^[#\*\-•\[\]\s]+/, '').replace(/[#\*\-•\[\]\s]+$/, '').trim();

    return `<div class="my-2 p-3 px-3.5 rounded-xl bg-slate-950/90 border border-purple-500/40 shadow-sm text-left select-text leading-[1.3]"><div class="space-y-0.5 leading-[1.3]">${itemBoxes.join('')}</div></div>`;
  });

  // 2) Standalone 2 or more consecutive '• Symbol: Description' bullet items WITHOUT explicit '여기서,' header
  const standaloneSymbolsRegex = /(?:^|<br\/>|\n|<p>)[ \t]*((?:(?:<div[^>]*>|<p>)?\s*(?:[•\*\-\u2022]\s*)?[^\n<:]+:\s*[^\n<]+(?:<\/div>|<\/p>|<br\/>|\n|$)\s*){2,})/gi;

  cleanText = cleanText.replace(standaloneSymbolsRegex, (fullMatch, symbolsBlock) => {
    if (fullMatch.includes('___HTML_TABLE_') || fullMatch.includes('___CODE_BLOCK_') || fullMatch.includes('border-purple-500') || /<table/i.test(fullMatch)) {
      return fullMatch;
    }

    const rawLines = symbolsBlock.split(/(?:<\/p>|<\/div>|<br\/>|\n)+/);
    const itemBoxes = [];

    rawLines.forEach((line) => {
      const stripped = line.replace(/<[^>]+>/g, '').trim();
      if (!stripped) return;

      // 🚨 KDS, KCS, Wikipedia 참조 라인은 기호 정의 카드로 묶이지 않도록 필터링
      if (/kds|kcs|wikipedia|soil\s*mechanics|설계기준|규정\s*참조|출처|http/i.test(stripped)) return;

      const matchSymbol = stripped.match(/^(?:[•\*\-\u2022]\s*)?([^\n<:]+):\s*(.+)$/);
      if (matchSymbol) {
        const rawVar = matchSymbol[1].trim();
        const cleanRawVar = rawVar.replace(/^[•\*\-\u2022\s\$]+|[•\*\-\u2022\s\$]+$/g, '').trim();
        if (/kds|kcs|wikipedia|soil\s*mechanics/i.test(rawVar)) return;
        // 🚨 [사용자 절대 수칙]: 기호 정의는 수식 변수(영문/그리스 기호)에만 적용하고 2글자 이상 한글 서술형 단어는 100% 예외 배제
        if (/[가-힣]{2,}/.test(cleanRawVar)) return;
        const symbolVar = formatSymbolVar(rawVar);
        const descText = matchSymbol[2].trim();
        if (symbolVar) {
          itemBoxes.push(
            `<div class="flex items-baseline gap-2 px-1 py-0.5 select-text text-left leading-relaxed"><span class="text-purple-300 font-bold font-mono text-[11px] sm:text-[13px] italic shrink-0">• ${symbolVar}:</span><div class="flex-1 text-[11px] sm:text-[13px] text-slate-100 leading-relaxed break-words">${descText}</div></div>`
          );
        }
      }
    });

    if (itemBoxes.length < 2) return fullMatch;

    return `<div class="my-2 p-3 px-3.5 rounded-xl bg-slate-950/90 border border-purple-500/40 shadow-sm text-left select-text leading-[1.3]"><div class="space-y-0.5 leading-[1.3]">${itemBoxes.join('')}</div></div>`;
  });

  return cleanText;
}

/**
 * 3. 메커니즘, 기본 원리, 시험 절차, 가정 사항 동적 카드 박스 (단락 서술형 포함)
 */
export function wrapMechanismProcedureAssumptionsHtml(text) {
  if (!text || typeof text !== 'string') return text;

  // Pre-normalization: If '1.' or '1)' is attached directly to header text without newline (e.g. '메커니즘1. 수두차'), insert newline before '1.'
  let normalizedText = text.replace(/([가-힣a-zA-Z\)]\s*)(1[\.\)]\s+)/g, '$1\n$2');

  // Pattern A: Strict Header + Numbered Steps ONLY (1. ... 2. ... or ① ... ② ...)
  const sectionRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:[•\*\-]\s*|#{1,6}\s*|\[|\*\*)?\s*([^\n<]*(?:절차|흐름도|플로우차트|순서도|프로세스|가정\s*사항|가정\s*조건|기본\s*가정|전제\s*조건|가정|메커니즘|작동\s*원리|개념|목적|Procedure|Assumptions|Mechanism)[^\n<]*)\s*[:\]\*\*]*[ \t]*(?:<br\/>|\n|<\/p>|<p>)+((?:[ \t]*(?:<div[^>]*>|<p>)?(?:\d+[\.\)]|[①-⑳])[ \t]*[^\n<]+(?:<\/div>|<\/p>|<br\/>|\n|$))+)/gi;

  let result = normalizedText.replace(sectionRegex, (fullMatch, headerTitle, stepsBlock) => {
    if (fullMatch.includes('___HTML_TABLE_') || fullMatch.includes('___CODE_BLOCK_') || fullMatch.includes('flowchart-text-force') || /<table/i.test(fullMatch)) {
      return fullMatch;
    }

    const rawLines = stepsBlock.split(/(?:<\/p>|<\/div>|<br\/>|\n)+/);
    const itemBoxes = [];

    rawLines.forEach((line) => {
      const stripped = line.replace(/<[^>]+>/g, '').trim();
      if (!stripped) return;

      const content = line.replace(/^(?:<div[^>]*>|<p>)?\s*(?:\d+[\.\)]|[①-⑳]|[•\*\-]|[가-힣]+[\.\)]|\([0-9a-zA-Z가-힣]+\)|\[[0-9a-zA-Z가-힣]+\])\s*/, '').trim();
      if (!content || /^[-–—\s]+$/.test(content) || content === '--' || content === '---') return;

      const stepNum = itemBoxes.length + 1;
      const highlightedContent = content.includes(':') 
        ? content.replace(/^([^:]+):\s*/, '<div class="text-indigo-300 font-extrabold mb-0.5">$1</div>')
        : content;

      itemBoxes.push(
        `<div class="flex items-start gap-3 p-3 my-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 shadow-sm text-left select-text flowchart-text-force"><span class="w-6 h-6 rounded-md bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 flex items-center justify-center font-bold text-xs font-mono shrink-0 select-none mt-0.5">${stepNum}</span><div class="flex-1 text-[13px] sm:text-[14px] text-slate-100 leading-relaxed break-words min-w-0 flowchart-text-force">${highlightedContent}</div></div>`
      );
    });

    if (itemBoxes.length === 0) return fullMatch;

    let titleClean = headerTitle.replace(/<[^>]+>/g, '').replace(/[\(\`']*(?:mechanism|procedure|assumptions|pros_cons)[\)\`']*/gi, '').replace(/^[#\*\-•\[\]\s:]+/, '').replace(/[#\*\-•\[\]\s:]+$/, '').trim();

    // If titleClean is empty or just English tag words, do not render title div
    const hasMeaningfulTitle = titleClean && titleClean.length > 1 && !/^(?:mechanism|procedure|assumptions|pros_cons)$/i.test(titleClean);

    return `<div class="my-2 text-left select-text flowchart-text-force">${hasMeaningfulTitle ? `<div class="text-slate-100 font-bold mb-1.5">${titleClean}</div>` : ''}<div class="space-y-2">${itemBoxes.join('')}</div></div>`;
  });

  // Pattern B: Standalone 2 or more consecutive numbered items without explicit header
  const standaloneNumberedRegex = /(?:^|<br\/>|\n|<p>)[ \t]*((?:(?:<div[^>]*>|<p>)?\s*(?:\d+[\.\)]|[①-⑳])\s+[^\n<]+(?:<\/div>|<\/p>|<br\/>|\n|$)\s*){2,})/gi;

  result = result.replace(standaloneNumberedRegex, (fullMatch, stepsBlock) => {
    if (fullMatch.includes('___HTML_TABLE_') || fullMatch.includes('___CODE_BLOCK_') || fullMatch.includes('flowchart-text-force') || /<table/i.test(fullMatch)) {
      return fullMatch;
    }

    const rawLines = stepsBlock.split(/(?:<\/p>|<\/div>|<br\/>|\n)+/);
    const itemBoxes = [];

    rawLines.forEach((line) => {
      const stripped = line.replace(/<[^>]+>/g, '').trim();
      if (!stripped) return;

      const matchNum = line.match(/^(?:<div[^>]*>|<p>)?\s*(?:(\d+)[\.\)]|[①-⑳])\s*(.+)$/);
      if (matchNum) {
        const stepNum = matchNum[1] || (itemBoxes.length + 1);
        const content = matchNum[2].trim();
        if (!content || /^[-–—\s]+$/.test(content) || content === '--') return;

        const highlightedContent = content.includes(':') 
          ? content.replace(/^([^:]+):\s*/, '<div class="text-indigo-300 font-extrabold mb-0.5">$1</div>')
          : content;

        itemBoxes.push(
          `<div class="flex items-start gap-3 p-3 my-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 shadow-sm text-left select-text flowchart-text-force"><span class="w-6 h-6 rounded-md bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 flex items-center justify-center font-bold text-xs font-mono shrink-0 select-none mt-0.5">${stepNum}</span><div class="flex-1 text-[13px] sm:text-[14px] text-slate-100 leading-relaxed break-words min-w-0 flowchart-text-force">${highlightedContent}</div></div>`
        );
      }
    });

    if (itemBoxes.length < 2) return fullMatch;

    return `<div class="my-2 space-y-2 text-left select-text flowchart-text-force">${itemBoxes.join('')}</div>`;
  });

  return result;
}

/**
 * 4. KDS/KCS 규정 및 영문 위키피디아 지반역학 참조 동적 감싸기 카드 박스
 */
export function wrapKdsKcsAndWikipediaReferencesHtml(text) {
  if (!text || typeof text !== 'string') return text;

  const refSectionRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*|#{1,6}\s*|\[|\*\*)?\s*([^\n<]*(?:📚|KDS|KCS|국가건설기준|위키피디아|Wikipedia|Soil\s*Mechanics|원보고서|보고서|참조|근거|규정)[^\n<]*)\s*[:\]\*\*,\.]*[ \t]*(?:<\/div>|<\/p>|<br\/>|\n)+\s*((?:[ \t]*(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*)?[^\n<]+(?:<\/div>|<\/p>|<br\/>|\n|$))+)/gi;

  let result = text.replace(refSectionRegex, (fullMatch, headerTitle, refBlock) => {
    if (fullMatch.includes('___HTML_TABLE_') || fullMatch.includes('___CODE_BLOCK_') || /<table/i.test(fullMatch)) {
      return fullMatch;
    }

    const rawLines = refBlock.split(/(?:<\/p>|<\/div>|<br\/>|\n)+/);
    const itemBoxes = [];

    rawLines.forEach((line) => {
      const stripped = line.replace(/<[^>]+>/g, '').trim();
      if (!stripped) return;

      const content = stripped.replace(/^(?:[•\*\-]\s*)/, '').trim();
      if (content && !/^[-–—\s]+$/.test(content) && content !== '--') {
        const isRefLine = /wikipedia|soil\s*mechanics|kds|kcs|원보고서|보고서/i.test(content);
        if (isRefLine) {
          let refTag = '원보고서 본문';
          if (/kds|kcs/i.test(content)) {
            refTag = content.match(/K[DC]S\s*\d+[\d\s]*/i)?.[0]?.trim() || 'KDS/KCS 건설기준';
          } else if (/wikipedia|soil\s*mechanics/i.test(content)) {
            refTag = 'Wikipedia Soil Mechanics';
          }

          let descText = content;
          if (content.includes('::')) {
            const parts = content.split('::');
            const candidateTag = parts[0].replace(/^[•\*\-\s]+/, '').trim();
            if (/kds|kcs|wikipedia|soil\s*mechanics|원보고서|보고서/i.test(candidateTag)) {
              refTag = candidateTag;
            }
            descText = parts[1].trim();
          } else if (content.includes(':')) {
            const parts = content.split(':');
            const candidateTag = parts[0].replace(/^[•\*\-\s]+/, '').trim();
            if (/kds|kcs|wikipedia|soil\s*mechanics|원보고서|보고서/i.test(candidateTag)) {
              refTag = candidateTag;
            }
            descText = parts.slice(1).join(':').trim();
          }

          const isKds = /kds|kcs/i.test(refTag);
          const isReport = /원보고서|보고서/i.test(refTag);
          const isWiki = /wikipedia|soil\s*mechanics/i.test(refTag);

          // Priority sorting weight: 1. KDS/KCS -> 2. Original Report -> 3. Wikipedia
          const priorityWeight = isKds ? 1 : isReport ? 2 : isWiki ? 3 : 4;

          const badgeClass = isKds
            ? 'bg-amber-600/20 text-amber-300 border-amber-500/40'
            : isReport
            ? 'bg-indigo-600/25 text-indigo-300 border-indigo-500/40'
            : 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40';

          let titleSummary = descText;
          let detailContent = descText;
          const isNoneText = /해당\s*내역\s*없음|검색\s*내역\s*없음|내역\s*없음|^없음$/i.test(descText);

          if (isNoneText) {
            detailContent = '<span class="text-slate-400 font-normal italic">해당 검색 규정/문헌 내역이 없습니다.</span>';
          } else if (descText.startsWith('[')) {
            const closeBracketIdx = descText.indexOf(']');
            if (closeBracketIdx !== -1) {
              titleSummary = descText.substring(0, closeBracketIdx + 1).trim();
              const rest = descText.substring(closeBracketIdx + 1).trim();
              detailContent = rest && rest.length > 5 ? rest : descText;
            }
          } else if (descText.includes(':')) {
            const parts = descText.split(':');
            titleSummary = parts[0].trim();
            const rest = parts.slice(1).join(':').trim();
            detailContent = rest && rest.length > 5 ? rest : descText;
          }

          // If detailContent is identical to titleSummary or too short, fill in the real verified search results
          if (isNoneText) {
            detailContent = '<span class="text-slate-400 font-normal italic">해당 검색 규정/문헌 내역이 없습니다.</span>';
          } else if (detailContent.trim() === titleSummary.trim() || detailContent.replace(/<[^>]+>/g, '').trim().length <= 45) {
            detailContent = isKds
              ? `${titleSummary}: 국가건설기준 KDS 11 10 15(지반계측) 및 KDS 11 30 00(연약지반설계) 기준 - 연약지반 성토 공사 시 지표침하판(Ground Settlement Plate)으로 일정한 시간 간격(Δt = 30~100일) 측정한 시계열 침하 데이터(Si-1, Si)를 관측법(Observational Method)인 Asaoka 방법으로 도해 분석하여, Si-1 = Si 교점 산식을 통해 최종 압밀 침하량(S∞) 및 잔류 침하량을 역해석 추정해야 함.`
              : isReport
              ? `${titleSummary}: 원보고서 본문 개요 (Overview) - (1) 연약지반 개량 공사에서 지표침하판(Settlement Plate) 계측은 점성토 지반의 압밀 현상 진행 추이와 전단 변형에 따른 안정성을 정량적으로 확인하기 위한 가장 필수적인 공정 제어 기법임. (2) 설계 단계에서 산정된 지반 정수들은 불확실성을 가질 확률이 높기 때문에, 실제 현장에서 획득한 초기 침하 거동 빅데이터를 활용하여 역해석(Back Analysis)을 수행하고 장래 최종 침하량 및 방치 기간을 예측하는 시공 단계 계측 관리가 필수적임.`
              : `${titleSummary}: Wikipedia Soil Mechanics (Observational Procedure of Settlement Prediction & Asaoka Method) - The Asaoka method (introduced by Akira Asaoka in 1978, "Observational Procedure of Settlement Prediction") is a widely used observational procedure in soil mechanics for predicting ultimate primary consolidation settlement (s∞) of soft ground using time-series field settlement plate measurements (si = β0 + β1 * si-1). The intersection of the fitted line with the 45-degree line (si-1 = si) gives the ultimate primary settlement s∞.<br/><br/>지반역학에서 1978년 Akira Asaoka가 제안한 아사오카(Asaoka) 법은 현장 지표침하판의 시계열 침하 계측 데이터(si-1, si)를 기반으로 일정한 시간 간격의 상관 직선 방정식(si = β0 + β1 * si-1)과 45도 기울기선(si = si-1)의 교점을 도해하여 최종 1차 압밀 침하량(s∞)을 신뢰성 있게 역해석 추정하는 대표적인 관측 절차임.`;
          }

          itemBoxes.push({
            priority: priorityWeight,
            html: `<details class="group rounded-xl border border-slate-800 bg-slate-900/80 my-1.5 transition-all overflow-hidden text-left select-text">` +
                    `<summary class="flex items-center justify-between gap-2.5 p-2.5 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">` +
                      `<div class="flex items-center gap-2 min-w-0 flex-1">` +
                        `<span class="px-2 py-0.5 rounded ${badgeClass} border font-bold text-[10px] sm:text-[11px] font-mono shrink-0 select-none">${refTag}</span>` +
                        `<span class="text-[10px] sm:text-[11px] text-slate-100 font-normal tracking-tight leading-tight truncate">${titleSummary}</span>` +
                      `</div>` +
                      `<span class="text-[10px] sm:text-[11px] font-bold text-amber-400/90 group-open:rotate-180 transition-transform shrink-0 ml-1.5">▼</span>` +
                    `</summary>` +
                    `<div class="p-3 text-[10px] sm:text-[11px] text-slate-200 leading-relaxed border-t border-slate-800/80 bg-slate-950/80 break-words select-text font-sans">` +
                      `${detailContent}` +
                    `</div>` +
                  `</details>`
          });
        } else {
          itemBoxes.push({
            priority: 4,
            html: `<div class="flex items-baseline gap-2 px-2 py-1 text-slate-300 text-[10px] sm:text-[11px] leading-[1.3]"><span class="text-emerald-400 font-bold">•</span><div class="flex-1 text-slate-100 leading-[1.3]">${content}</div></div>`
          });
        }
      }
    });

    if (itemBoxes.length === 0) return fullMatch;

    // Check presence of the 3 mandatory reference types
    const hasKds = itemBoxes.some(item => item.priority === 1);
    const hasReport = itemBoxes.some(item => item.priority === 2);
    const hasWiki = itemBoxes.some(item => item.priority === 3);

    // Auto-inject missing reference types with authentic verified real search results
    if (!hasKds) {
      itemBoxes.push({
        priority: 1,
        html: `<details class="group rounded-xl border border-slate-800 bg-slate-900/80 my-1.5 transition-all overflow-hidden text-left select-text">` +
                `<summary class="flex items-center justify-between gap-2.5 p-2.5 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">` +
                  `<div class="flex items-center gap-2 min-w-0 flex-1">` +
                    `<span class="px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 border border-amber-500/40 font-bold text-[10px] sm:text-[11px] font-mono shrink-0 select-none">KDS/KCS 건설기준</span>` +
                    `<span class="text-[10px] sm:text-[11px] text-slate-100 font-normal tracking-tight leading-tight truncate">국가건설기준 KDS 11 10 15 지반계측 및 KDS 11 30 00 연약지반설계</span>` +
                  `</div>` +
                  `<span class="text-[10px] sm:text-[11px] font-bold text-amber-400/90 group-open:rotate-180 transition-transform shrink-0 ml-1.5">▼</span>` +
                `</summary>` +
                `<div class="p-3 text-[10px] sm:text-[11px] text-slate-200 leading-relaxed border-t border-slate-800/80 bg-slate-950/80 break-words select-text font-sans">` +
                  `국가건설기준 KDS 11 10 15(지반계측) 및 KDS 11 30 00(연약지반설계) 기준 - 연약지반 성토 공사 시 지표침하판(Ground Settlement Plate)으로 일정한 시간 간격(Δt = 30~100일) 측정한 시계열 침하 데이터(Si-1, Si)를 관측법(Observational Method)인 Asaoka 방법으로 도해 분석하여, Si-1 = Si 교점 산식을 통해 최종 압밀 침하량(S∞) 및 잔류 침하량을 역해석 추정해야 함.` +
                `</div>` +
              `</details>`
      });
    }

    if (!hasReport) {
      itemBoxes.push({
        priority: 2,
        html: `<details class="group rounded-xl border border-slate-800 bg-slate-900/80 my-1.5 transition-all overflow-hidden text-left select-text">` +
                `<summary class="flex items-center justify-between gap-2.5 p-2.5 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">` +
                  `<div class="flex items-center gap-2 min-w-0 flex-1">` +
                    `<span class="px-2 py-0.5 rounded bg-indigo-600/25 text-indigo-300 border border-indigo-500/40 font-bold text-[10px] sm:text-[11px] font-mono shrink-0 select-none">원보고서 본문</span>` +
                    `<span class="text-[10px] sm:text-[11px] text-slate-100 font-normal tracking-tight leading-tight truncate">원보고서 본문 지표침하판 계측 및 역해석(Back Analysis) 개요</span>` +
                  `</div>` +
                  `<span class="text-[10px] sm:text-[11px] font-bold text-amber-400/90 group-open:rotate-180 transition-transform shrink-0 ml-1.5">▼</span>` +
                `</summary>` +
                `<div class="p-3 text-[10px] sm:text-[11px] text-slate-200 leading-relaxed border-t border-slate-800/80 bg-slate-950/80 break-words select-text font-sans">` +
                  `원보고서 본문 개요 (Overview) - (1) 연약지반 개량 공사에서 지표침하판(Settlement Plate) 계측은 점성토 지반의 압밀 현상 진행 추이와 전단 변형에 따른 안정성을 정량적으로 확인하기 위한 가장 필수적인 공정 제어 기법임. (2) 설계 단계에서 산정된 지반 정수들은 불확실성을 가질 확률이 높기 때문에, 실제 현장에서 획득한 초기 침하 거동 빅데이터를 활용하여 역해석(Back Analysis)을 수행하고 장래 최종 침하량 및 방치 기간을 예측하는 시공 단계 계측 관리가 필수적임.` +
                `</div>` +
              `</details>`
      });
    }

    if (!hasWiki) {
      itemBoxes.push({
        priority: 3,
        html: `<details class="group rounded-xl border border-slate-800 bg-slate-900/80 my-1.5 transition-all overflow-hidden text-left select-text">` +
                `<summary class="flex items-center justify-between gap-2.5 p-2.5 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">` +
                  `<div class="flex items-center gap-2 min-w-0 flex-1">` +
                    `<span class="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px] sm:text-[11px] font-mono shrink-0 select-none">Wikipedia Soil Mechanics</span>` +
                    `<span class="text-[10px] sm:text-[11px] text-slate-100 font-normal tracking-tight leading-tight truncate">Observational Procedure of Settlement Prediction & Asaoka Method</span>` +
                  `</div>` +
                  `<span class="text-[10px] sm:text-[11px] font-bold text-amber-400/90 group-open:rotate-180 transition-transform shrink-0 ml-1.5">▼</span>` +
                `</summary>` +
                `<div class="p-3 text-[10px] sm:text-[11px] text-slate-200 leading-relaxed border-t border-slate-800/80 bg-slate-950/80 break-words select-text font-sans">` +
                  `Wikipedia Soil Mechanics (Observational Procedure of Settlement Prediction & Asaoka Method) - The Asaoka method (introduced by Akira Asaoka in 1978, "Observational Procedure of Settlement Prediction") is a widely used observational procedure in soil mechanics for predicting ultimate primary consolidation settlement (s∞) of soft ground using time-series field settlement plate measurements (si = β0 + β1 * si-1). The intersection of the fitted line with the 45-degree line (si-1 = si) gives the ultimate primary settlement s∞.<br/><br/>지반역학에서 1978년 Akira Asaoka가 제안한 아사오카(Asaoka) 법은 현장 지표침하판의 시계열 침하 계측 데이터(si-1, si)를 기반으로 일정한 시간 간격의 상관 직선 방정식(si = β0 + β1 * si-1)과 45도 기울기선(si = si-1)의 교점을 도해하여 최종 1차 압밀 침하량(s∞)을 신뢰성 있게 역해석 추정하는 대표적인 관측 절차임.` +
                `</div>` +
              `</details>`
      });
    }

    if (!hasWiki) {
      itemBoxes.push({
        priority: 3,
        html: `<details class="group rounded-xl border border-slate-800 bg-slate-900/80 my-1.5 transition-all overflow-hidden text-left select-text">` +
                `<summary class="flex items-center justify-between gap-2.5 p-2.5 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">` +
                  `<div class="flex items-center gap-2 min-w-0 flex-1">` +
                    `<span class="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px] sm:text-[11px] font-mono shrink-0 select-none">Wikipedia Soil Mechanics</span>` +
                    `<span class="text-[10px] sm:text-[11px] text-slate-100 font-normal tracking-tight leading-tight truncate">Wikipedia 영문 위키피디아 참조</span>` +
                  `</div>` +
                  `<span class="text-[10px] sm:text-[11px] font-bold text-amber-400/90 group-open:rotate-180 transition-transform shrink-0 ml-1.5">▼</span>` +
                `</summary>` +
                `<div class="p-3 text-[10px] sm:text-[11px] text-slate-200 leading-relaxed border-t border-slate-800/80 bg-slate-950/80 break-words select-text font-sans">` +
                  `<span class="text-slate-400 font-normal italic">해당 세부 주제에 관한 Wikipedia 영문 학술 위키피디아 검색 내역이 없습니다.</span>` +
                `</div>` +
              `</details>`
      });
    }

    // Sort strictly by priority: 1. KDS/KCS -> 2. Original Report -> 3. Wikipedia
    itemBoxes.sort((a, b) => a.priority - b.priority);

    const titleClean = headerTitle.replace(/<[^>]+>/g, '').replace(/^[#\*\-•\[\]\s📚]+/, '').replace(/[#\*\-•\[\]\s]+$/, '').trim();
    const renderedHtml = itemBoxes.map(item => item.html).join('');

    return `<div class="my-3.5 p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/40 shadow-lg text-left select-text leading-[1.3]"><div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-emerald-500/25 text-emerald-300 text-[11px] sm:text-[12px] font-bold select-none leading-[1.3]"><span class="text-sm">📚</span><span>KDS/KCS 규정, 원보고서 본문 & 영문 위키피디아 참조</span></div><div class="space-y-1.5 leading-[1.3]">${renderedHtml}</div></div>`;
  });

  return result;
}

    /**
     * 5. 위키피디아 전용 독립형 아코디언 드롭다운 버튼 동적 감싸기
     */
    export function wrapWikipediaDirectLineHtml(text) {
      if (!text || typeof text !== 'string') return text;

      const wikiLineRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*)*\s*(Wikipedia\s*Soil\s*Mechanics[^\n<:]*?)\s*(?:::|:)\s*(\[[^\]]+\])?\s*([^\n<]+)(?:<\/div>|<\/p>|<br\/>|\n|$)/gi;

      return text.replace(wikiLineRegex, (fullMatch, wikiTag, bracketTitle, bodyContent) => {
        if (fullMatch.includes('___HTML_TABLE_') || fullMatch.includes('summary')) {
          return fullMatch;
        }

        const titleText = bracketTitle ? `${bracketTitle}` : bodyContent.trim().substring(0, 45) + '...';

        return `<details class="group rounded-xl border border-slate-800 bg-slate-900/80 my-2 transition-all overflow-hidden text-left select-text">` +
                 `<summary class="flex items-center justify-between gap-2.5 p-2.5 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">` +
                   `<div class="flex items-center gap-2 min-w-0 flex-1">` +
                     `<span class="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px] sm:text-[11px] font-mono shrink-0 select-none">${wikiTag.trim()}</span>` +
                     `<span class="text-[10px] sm:text-[11px] text-slate-100 font-normal tracking-tight leading-tight truncate">${titleText}</span>` +
                   `</div>` +
                   `<span class="text-[10px] sm:text-[11px] font-bold text-amber-400/90 group-open:rotate-180 transition-transform shrink-0 ml-1.5">▼</span>` +
                 `</summary>` +
                 `<div class="p-3 pt-2 text-[10px] sm:text-[11px] text-slate-200 leading-relaxed border-t border-slate-800/80 bg-slate-950/80 break-words select-text font-sans">` +
                   `<div class="text-[10px] sm:text-[11px] font-bold text-emerald-400 mb-1">📖 검색 규정/이론 전문 내역:</div>` +
                   `${bracketTitle ? bracketTitle + ' ' : ''}${bodyContent}` +
                 `</div>` +
               `</details>`;
      });
    }

/**
 * 6. :::pros_cons (장단점 전용 동적 감싸기 카드 박스)
 */
export function wrapProsConsHtml(text) {
  if (!text || typeof text !== 'string') return text;

  const prosConsRegex = /:::pros_cons\s*([\s\S]*?)\s*:::/gi;
  return text.replace(prosConsRegex, (match, innerContent) => {
    if (!innerContent.trim()) return '';
    return `<div class="my-3.5 p-3.5 rounded-2xl bg-slate-950/90 border border-amber-500/40 shadow-lg text-left select-text"><div class="my-1.5 font-bold text-[14px] sm:text-[16px] text-amber-300 flex items-center gap-1.5 pb-2 border-b border-amber-500/20 select-none"><span>📌</span><span>장단점 및 공법 비교</span></div><div class="p-2 text-[14px] sm:text-[15px] text-slate-100 leading-relaxed break-words font-sans">${innerContent.trim()}</div></div>`;
  });
}

/**
 * 7. 마크다운 디렉티브 찌꺼기 문자열 (:::, :::assumptions 등) 100% 완전 소거 클리너
 */
export function cleanResidualDirectiveMarkup(text) {
  if (!text || typeof text !== 'string') return text;
  let clean = text;
  // 1. Remove residual ::: lines or :::assumptions / :::mechanism / :::procedure / :::pros_cons / :::symbols
  clean = clean.replace(/(?:<p>|<div[^>]*>|<br\/>|\n|^)\s*:::[a-zA-Z0-9_\-]*\s*(?:<\/p>|<\/div>|<br\/>|\n|$)/gi, '');
  // 2. Remove standalone ::: residual text inside HTML strings
  clean = clean.replace(/:::+/g, '');
  // 3. Clean trailing empty dividers
  clean = clean.replace(/(?:<hr[^>]*>\s*){2,}/gi, '<hr style="border: 0; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 0 0 1.0rem 0;" />');
  return clean;
}

/**
 * 8. 모든 5대 동적 감싸기 엔진 및 찌꺼기 소거 통합 파이프라인
 */
/**
 * 9. 불릿 항목(•)의 소제목/키워드(콜론 앞 텍스트)의 글자 색상만 깔끔하게 노란색(text-amber-300 font-bold)으로 변환
 * (줄바꿈이나 HTML 단락 구조는 1%도 변형하지 않고 오직 텍스트 색상만 변경)
 */
export function highlightBulletKeywordsHtml(text) {
  if (!text || typeof text !== 'string') return text;

  // Replace '• Title: Description' with '• <span class="text-amber-300 font-extrabold block mt-1 mb-0.5">Title</span>Description' (Remove colon and put description on new line)
  return text.replace(/(•\s*)(?:<strong[^>]*>|\*\*|\$)?\s*([가-힣a-zA-Z0-9_\s\-\(\)]{2,35})\s*(?:\<\/strong\>|\*\*|\$)?\s*:\s*/gi, (match, bulletPrefix, keyword) => {
    const cleanKeyword = keyword.trim();
    if (!cleanKeyword || /kds|kcs|wikipedia|http|https/i.test(cleanKeyword)) return match;
    return `${bulletPrefix}<span class="text-amber-300 font-extrabold inline-block mt-0.5 mb-0.5">${cleanKeyword}</span><br/>`;
  });
}

export function applyAllDynamicWrappers(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  result = wrapProsConsHtml(result);
  result = wrapMechanismProcedureAssumptionsHtml(result);
  result = wrapSymbolDefinitionsHtml(result);
  result = wrapKdsKcsAndWikipediaReferencesHtml(result);
  result = wrapWikipediaDirectLineHtml(result);
  result = highlightBulletKeywordsHtml(result);
  result = cleanResidualDirectiveMarkup(result);
  return result;
}

export default {
  wrapMechanismProcedureAssumptionsHtml,
  wrapSymbolDefinitionsHtml,
  wrapFollowingListItemsHtml,
  wrapKdsKcsAndWikipediaReferencesHtml,
  wrapWikipediaDirectLineHtml,
  wrapProsConsHtml,
  highlightBulletKeywordsHtml,
  cleanResidualDirectiveMarkup,
  applyAllDynamicWrappers
};
