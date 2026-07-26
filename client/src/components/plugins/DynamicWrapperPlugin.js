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

  const followingListSectionRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*|#{1,6}\s*|\[|\*\*)?\s*([^\n<]*(?:다음과\s*같은|아래와\s*같은|다음과\s*같이|아래와\s*같이|다음\s*항목|아래\s*항목|주요\s*특징|특징은\s*다음|사항은\s*다음|다음과\s*같음)[^\n<]*)\s*[:\]\*\*,\.]*[ \t]*(?:<\/div>|<\/p>|<br\/>|\n)*\s*((?:(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*|\d+[\.\)]\s+)[^\n]*?(?:<\/div>|<\/p>|<br\/>|\n|$))+)/gi;

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
          `<div class="flex items-start gap-2.5 p-2.5 my-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 shadow-sm text-left select-text"><span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0 mt-2 shadow-sm shadow-emerald-400/50"></span><div class="flex-1 text-[13px] sm:text-[14px] text-slate-100 leading-relaxed break-words">${highlightedContent}</div></div>`
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
  const symbolSectionRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*|#{1,6}\s*|\[|\*\*)?\s*([^\n<]*(?:여기서|Where|기호\s*정의|변수\s*정의|공식\s*기호|기호\s*설명)[^\n<]*)\s*[:\]\*\*,\.]*[ \t]*(?:<\/div>|<\/p>|<br\/>|\n)+\s*((?:(?:<div[^>]*>|<p>)?\s*(?:[•\*\-\u2022]\s*)?[^\n<:]+:\s*[^\n<]*[\s\S]*?(?:<\/div>|<\/p>|<br\/>|\n|$))+)/gi;

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
            `<div class="flex items-baseline gap-2 px-1 py-0.5 select-text text-left leading-relaxed"><span class="text-purple-300 font-bold font-mono text-[14px] sm:text-[15px] italic shrink-0">• ${symbolVar}:</span><div class="flex-1 text-[14px] sm:text-[15px] text-slate-100 leading-relaxed break-words">${descText}</div></div>`
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
            `<div class="flex items-baseline gap-2 px-1 py-0.5 select-text text-left leading-relaxed"><span class="text-purple-300 font-bold font-mono text-[14px] sm:text-[15px] italic shrink-0">• ${symbolVar}:</span><div class="flex-1 text-[14px] sm:text-[15px] text-slate-100 leading-relaxed break-words">${descText}</div></div>`
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

  // Pattern A: Strict Header + Numbered Steps ONLY (1. ... 2. ... or ① ... ② ...)
  // 🚨 [사용자 절대 수칙]: 기호정의를 제외하고는 번호(1., 2. 또는 ①, ②)가 없으면 동적 감싸기를 절대 수행하지 않음
  const sectionRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:[•\*\-]\s*|#{1,6}\s*|\[|\*\*)?\s*([^\n<]*(?:절차|흐름도|플로우차트|순서도|프로세스|가정\s*사항|가정\s*조건|기본\s*가정|전제\s*조건|가정|메커니즘|작동\s*원리|Procedure|Assumptions)[^\n<]*)\s*[:\]\*\*]*[ \t]*(?:<br\/>|\n|<\/p>|<p>)+((?:[ \t]*(?:<div[^>]*>|<p>)?(?:\d+[\.\)]|[①-⑳])[ \t]*[^\n<]+(?:<\/div>|<\/p>|<br\/>|\n|$))+)/gi;

  let result = text.replace(sectionRegex, (fullMatch, headerTitle, stepsBlock) => {
    if (fullMatch.includes('___HTML_TABLE_') || fullMatch.includes('___CODE_BLOCK_') || /<table/i.test(fullMatch)) {
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

      itemBoxes.push(
        `<div class="flex items-start gap-3 px-2.5 py-2 hover:bg-slate-900/60 rounded-lg transition-colors text-left select-text flowchart-text-force"><span class="w-5 h-5 rounded-md bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 flex items-center justify-center font-bold text-[11px] font-mono shrink-0 select-none mt-0.5">${stepNum}</span><div class="flex-1 text-[14px] sm:text-[15px] text-slate-100 leading-relaxed break-words min-w-0 flowchart-text-force">${content}</div></div>`
      );
    });

    if (itemBoxes.length === 0) return fullMatch;

    let titleClean = headerTitle.replace(/<[^>]+>/g, '').replace(/^[#\*\-•\[\]:s]+/, '').replace(/[#\*\-•\[\]:s]+$/, '').trim();
    const isAssumption = /:*assumptions/i.test(titleClean) || titleClean.includes('가정');

    if (isAssumption) {
      // 🚨 사용자 지침: '5. 기본 가정사항 및 유의사항' 헤더 텍스트가 상단에 이미 표출되므로 카드 내부의 불필요한 'assumption' 표제 행을 100% 소거
      return `<div class="my-3.5 p-3.5 rounded-2xl bg-slate-950/90 border border-indigo-500/35 shadow-lg text-left select-text flowchart-text-force"><div class="space-y-1 my-1 divide-y divide-slate-800/60">${itemBoxes.join('')}</div></div>`;
    }

    // 🚨 사용자 지침: '4. 시험 절차' 등의 헤더 텍스트가 상단에 이미 표출되므로 카드 내부의 불필요한 중복 표제 행(border-b)을 100% 소거
    return `<div class="my-3.5 p-3.5 rounded-2xl bg-slate-950/90 border border-indigo-500/35 shadow-lg text-left select-text flowchart-text-force"><div class="space-y-1 my-1 divide-y divide-slate-800/60">${itemBoxes.join('')}</div></div>`;
  });

  return result;
}

/**
 * 4. KDS/KCS 규정 및 영문 위키피디아 지반역학 참조 동적 감싸기 카드 박스
 */
export function wrapKdsKcsAndWikipediaReferencesHtml(text) {
  if (!text || typeof text !== 'string') return text;

  const refSectionRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*|#{1,6}\s*|\[|\*\*)?\s*([^\n<]*(?:📚|KDS|KCS|국가건설기준|위키피디아|Wikipedia|Soil\s*Mechanics|참조|근거|규정)[^\n<]*)\s*[:\]\*\*,\.]*[ \t]*(?:<\/div>|<\/p>|<br\/>|\n)+\s*((?:[ \t]*(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*)?[^\n<]+(?:<\/div>|<\/p>|<br\/>|\n|$))+)/gi;

  let result = text.replace(refSectionRegex, (fullMatch, headerTitle, refBlock) => {
    if (fullMatch.includes('___HTML_TABLE_') || fullMatch.includes('___CODE_BLOCK_') || /<table/i.test(fullMatch)) {
      return fullMatch;
    }

    const rawLines = refBlock.split(/(?:<\/p>|<\/div>|<br\/>|\n)+/);
    const itemBoxes = [];

    rawLines.forEach((line) => {
      const stripped = line.replace(/<[^>]+>/g, '').trim();
      if (!stripped) return;

      // Match KDS/KCS or Wikipedia lines with :: or : separator on stripped line
      const matchRef = stripped.match(/(?:[•\*\-]\s*)?\$?([가-힣A-Za-z0-9_\'\^\(\)\{\}\+\-\*\/\=\s\-\[\]]+?)\$?\s*(?:::|:)\s*(.+)$/);
      if (matchRef) {
        let refTag = matchRef[1].replace(/^[•\*\-\s]+/, '').trim();
        const descText = matchRef[2].trim();
        const isWiki = /wikipedia|soil\s*mechanics/i.test(refTag);
        const badgeClass = isWiki 
          ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40' 
          : 'bg-amber-600/20 text-amber-300 border-amber-500/40';

        let titleSummary = descText;
        let detailContent = descText;
        if (descText.includes('||')) {
          const parts = descText.split('||');
          titleSummary = parts[0].trim();
          detailContent = parts[1].trim();
        } else if (descText.includes('::')) {
          const parts = descText.split('::');
          titleSummary = parts[0].trim();
          detailContent = parts[1].trim();
        } else if (descText.startsWith('[')) {
          const closeBracketIdx = descText.indexOf(']');
          if (closeBracketIdx !== -1) {
            titleSummary = descText.substring(0, closeBracketIdx + 1).trim();
            detailContent = descText.substring(closeBracketIdx + 1).trim() || descText;
          }
        }

        itemBoxes.push(
          `<details class="group rounded-xl border border-slate-800 bg-slate-900/80 my-1.5 transition-all overflow-hidden">` +
            `<summary class="flex items-center justify-between gap-2.5 p-2.5 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">` +
              `<div class="flex items-center gap-2 min-w-0 flex-1">` +
                `<span class="px-2 py-0.5 rounded ${badgeClass} border font-bold text-xs font-mono shrink-0 select-none">${refTag}</span>` +
                `<span class="text-[13px] sm:text-[14px] text-slate-100 font-medium leading-tight truncate">${titleSummary}</span>` +
              `</div>` +
              `<span class="text-xs font-bold text-amber-400/90 group-open:rotate-180 transition-transform shrink-0 ml-1.5">▼</span>` +
            `</summary>` +
            `<div class="p-3 pt-2 text-[13px] sm:text-[14px] text-slate-200 leading-relaxed border-t border-slate-800/80 bg-slate-950/80 break-words select-text font-sans">` +
              `<div class="text-xs font-bold text-emerald-400 mb-1">📖 검색 규정/이론 전문 내역:</div>` +
              `${detailContent}` +
            `</div>` +
          `</details>`
        );
      } else {
        const content = stripped.replace(/^(?:[•\*\-]\s*)/, '').trim();
        if (content && !/^[-–—\s]+$/.test(content) && content !== '--') {
          const isWikiOrKdsLine = /wikipedia|soil\s*mechanics|kds|kcs/i.test(content);
          if (isWikiOrKdsLine) {
            let refTag = 'Wikipedia Soil Mechanics';
            let descText = content;
            if (content.includes('::')) {
              const parts = content.split('::');
              refTag = parts[0].replace(/^[•\*\-\s]+/, '').trim();
              descText = parts[1].trim();
            } else if (content.includes(':')) {
              const parts = content.split(':');
              refTag = parts[0].replace(/^[•\*\-\s]+/, '').trim();
              descText = parts[1].trim();
            }
            const isWiki = /wikipedia|soil\s*mechanics/i.test(refTag);
            const badgeClass = isWiki 
              ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40' 
              : 'bg-amber-600/20 text-amber-300 border-amber-500/40';

            let titleSummary = descText;
            let detailContent = descText;
            if (descText.startsWith('[')) {
              const closeBracketIdx = descText.indexOf(']');
              if (closeBracketIdx !== -1) {
                titleSummary = descText.substring(0, closeBracketIdx + 1).trim();
                detailContent = descText.substring(closeBracketIdx + 1).trim() || descText;
              }
            }

            itemBoxes.push(
              `<details class="group rounded-xl border border-slate-800 bg-slate-900/80 my-1.5 transition-all overflow-hidden">` +
                `<summary class="flex items-center justify-between gap-2.5 p-2.5 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">` +
                  `<div class="flex items-center gap-2 min-w-0 flex-1">` +
                    `<span class="px-2 py-0.5 rounded ${badgeClass} border font-bold text-xs font-mono shrink-0 select-none">${refTag}</span>` +
                    `<span class="text-[13px] sm:text-[14px] text-slate-100 font-medium leading-tight truncate">${titleSummary}</span>` +
                  `</div>` +
                  `<span class="text-xs font-bold text-amber-400/90 group-open:rotate-180 transition-transform shrink-0 ml-1.5">▼</span>` +
                `</summary>` +
                `<div class="p-3 pt-2 text-[13px] sm:text-[14px] text-slate-200 leading-relaxed border-t border-slate-800/80 bg-slate-950/80 break-words select-text font-sans">` +
                  `<div class="text-xs font-bold text-emerald-400 mb-1">📖 검색 규정/이론 전문 내역:</div>` +
                  `${detailContent}` +
                `</div>` +
              `</details>`
            );
          } else {
            itemBoxes.push(
              `<div class="flex items-baseline gap-2 px-2 py-1 text-slate-300 text-[14px] sm:text-[15px] leading-[1.3]"><span class="text-emerald-400 font-bold">•</span><div class="flex-1 text-slate-100 leading-[1.3]">${content}</div></div>`
            );
          }
        }
      }
    });

    if (itemBoxes.length === 0) return fullMatch;

    const titleClean = headerTitle.replace(/<[^>]+>/g, '').replace(/^[#\*\-•\[\]\s📚]+/, '').replace(/[#\*\-•\[\]\s]+$/, '').trim();

    return `<div class="my-3.5 p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/40 shadow-lg text-left select-text leading-[1.3]"><div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-emerald-500/25 text-emerald-300 text-[14px] sm:text-[16px] font-bold select-none leading-[1.3]"><span class="text-base">📚</span><span>${titleClean || 'KDS/KCS 규정 및 영문 위키피디아 지반역학 참조'}</span></div><div class="space-y-1.5 leading-[1.3]">${itemBoxes.join('')}</div></div>`;
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

    const titleText = bracketTitle ? `${bracketTitle} ${bodyContent.trim().substring(0, 50)}...` : bodyContent.trim().substring(0, 65) + '...';

    return `<details class="group rounded-xl border border-slate-800 bg-slate-900/80 my-2 transition-all overflow-hidden text-left select-text">` +
             `<summary class="flex items-center justify-between gap-2.5 p-2.5 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">` +
               `<div class="flex items-center gap-2 min-w-0 flex-1">` +
                 `<span class="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-bold text-xs font-mono shrink-0 select-none">${wikiTag.trim()}</span>` +
                 `<span class="text-[13px] sm:text-[14px] text-slate-100 font-medium leading-tight truncate">${titleText}</span>` +
               `</div>` +
               `<span class="text-xs font-bold text-amber-400/90 group-open:rotate-180 transition-transform shrink-0 ml-1.5">▼</span>` +
             `</summary>` +
             `<div class="p-3 pt-2 text-[13px] sm:text-[14px] text-slate-200 leading-relaxed border-t border-slate-800/80 bg-slate-950/80 break-words select-text font-sans">` +
               `<div class="text-xs font-bold text-emerald-400 mb-1">📖 검색 규정/이론 전문 내역:</div>` +
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

  return text.replace(/(•\s*)(?:<strong[^>]*>|\*\*|\$)?\s*([가-힣a-zA-Z0-9_\s\-\(\)]{2,25})\s*(?:\<\/strong\>|\*\*|\$)?\s*:/gi, (match, bulletPrefix, keyword) => {
    const cleanKeyword = keyword.trim();
    if (!cleanKeyword || /kds|kcs|wikipedia|http|https/i.test(cleanKeyword)) return match;
    return `${bulletPrefix}<span class="text-amber-300 font-bold">${cleanKeyword}</span>:`;
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
