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
export function wrapSymbolDefinitionsHtml(text) {
  if (!text || typeof text !== 'string') return text;

  let cleanText = text.replace(/(?:<br\/>|\n|<p>)\s*(?:<div[^>]*>)?\s*[\*\-•]\s*(?:<\/div>|<\/p>|<br\/>|\n|$)/gi, '');

  const symbolSectionRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*|#{1,6}\s*|\[|\*\*)?\s*([^\n<]*(?:여기서|Where|기호\s*정의|변수\s*정의|공식\s*기호|기호\s*설명)[^\n<]*)\s*[:\]\*\*,\.]*[ \t]*(?:<\/div>|<\/p>|<br\/>|\n)+\s*((?:(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*)?[\$\w\(\)]+\s*:[^\n<]*[\s\S]*?(?:<\/div>|<\/p>|<br\/>|\n))+)/gi;

  return cleanText.replace(symbolSectionRegex, (fullMatch, headerTitle, symbolsBlock) => {
    if (fullMatch.includes('___HTML_TABLE_') || fullMatch.includes('___CODE_BLOCK_') || /<table/i.test(fullMatch)) {
      return fullMatch;
    }

    const rawLines = symbolsBlock.split(/(?:<\/p>|<\/div>|<br\/>|\n)+/);
    const itemBoxes = [];

    rawLines.forEach((line) => {
      const stripped = line.replace(/<[^>]+>/g, '').trim();
      if (!stripped) return;

      const matchSymbol = line.match(/(?:[•\*\-]\s*)?\$?([a-zA-Z0-9_\'\^\(\)\{\}\+\-\*\/\=\\]+)\$?\s*:\s*(.+)$/);
      if (matchSymbol) {
        const symbolVar = matchSymbol[1].trim();
        const descText = matchSymbol[2].trim();
        itemBoxes.push(
          `<div class="flex items-baseline gap-2 px-1 py-0.5 select-text text-left leading-[1.3]"><span class="text-purple-300 font-bold font-mono text-[14px] sm:text-[15px] italic shrink-0">• ${symbolVar}:</span><div class="flex-1 text-[14px] sm:text-[15px] text-slate-100 leading-[1.3] break-words">${descText}</div></div>`
        );
      } else {
        const content = stripped.replace(/^(?:[•\*\-]\s*)/, '').trim();
        if (content && !/^[-–—\s]+$/.test(content) && content !== '--') {
          itemBoxes.push(
            `<div class="flex items-baseline gap-1.5 px-1 py-0.5 text-slate-300 text-[14px] sm:text-[15px] leading-[1.3]"><span class="text-purple-400 font-bold">•</span><div class="flex-1 text-slate-100 leading-[1.3]">${content}</div></div>`
          );
        }
      }
    });

    if (itemBoxes.length === 0) return fullMatch;

    const titleClean = headerTitle.replace(/<[^>]+>/g, '').replace(/^[#\*\-•\[\]\s]+/, '').replace(/[#\*\-•\[\]\s]+$/, '').trim();

    return `<div class="my-2 p-3 px-3.5 rounded-xl bg-slate-950/90 border border-purple-500/40 shadow-sm text-left select-text leading-[1.3]"><div class="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-purple-500/20 text-purple-300 text-[14px] sm:text-[16px] font-bold select-none leading-[1.3]"><span class="text-sm">✨</span><span>${titleClean || '공식 기호 정의'}</span></div><div class="space-y-0.5 leading-[1.3]">${itemBoxes.join('')}</div></div>`;
  });
}

/**
 * 3. 메커니즘, 시험 절차, 가정 사항 동적 카드 박스
 */
export function wrapMechanismProcedureAssumptionsHtml(text) {
  if (!text || typeof text !== 'string') return text;

  const sectionRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:[•\*\-]\s*|#{1,6}\s*|\[|\*\*)?\s*([^\n<]*(?:절차|흐름도|플로우차트|순서도|프로세스|가정\s*사항|가정\s*조건|기본\s*가정|전제\s*조건|가정|Procedure|Assumptions)[^\n<]*)\s*[:\]\*\*]*[ \t]*(?:<br\/>|\n|<\/p>|<p>)((?:[ \t]*(?:<div[^>]*>|<p>)?(?:\d+[\.\)]|[①-⑳]|[•\*\-]|[가-힣]+[\.\)]|\([0-9a-zA-Z가-힣]+\)|\[[0-9a-zA-Z가-힣]+\])[ \t]*[\s\S]*?(?:<\/div>|<\/p>|<br\/>|\n))+)/gi;

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

    const titleClean = headerTitle.replace(/<[^>]+>/g, '').replace(/^[#\*\-•\[\]\s]+/, '').replace(/[#\*\-•\[\]\s]+$/, '').trim();

    return `<div class="my-3.5 p-3.5 rounded-2xl bg-slate-950/90 border border-indigo-500/35 shadow-lg text-left select-text flowchart-text-force"><div class="my-1.5 font-bold text-[14px] sm:text-[16px] text-indigo-300 flex items-center gap-1.5 pb-2 border-b border-indigo-500/20 select-none"><span>⚡</span><span>${titleClean}</span></div><div class="space-y-1 my-1 divide-y divide-slate-800/60">${itemBoxes.join('')}</div></div>`;
  });

  return result;
}

/**
 * 4. KDS/KCS 규정 및 영문 위키피디아 지반역학 참조 동적 감싸기 카드 박스
 */
export function wrapKdsKcsAndWikipediaReferencesHtml(text) {
  if (!text || typeof text !== 'string') return text;

  const refSectionRegex = /(?:^|<br\/>|\n|<p>)[ \t]*(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*|#{1,6}\s*|\[|\*\*)?\s*([^\n<]*(?:📚|KDS|KCS|국가건설기준|위키피디아|Wikipedia|Soil\s*Mechanics|참조|근거|규정)[^\n<]*)\s*[:\]\*\*,\.]*[ \t]*(?:<\/div>|<\/p>|<br\/>|\n)+\s*((?:(?:<div[^>]*>|<p>)?\s*(?:[•\*\-]\s*)?(?:KDS|KCS|Wikipedia|Soil\s*Mechanics|[가-힣A-Za-z0-9_\-]+)[^\n<]*[\s\S]*?(?:<\/div>|<\/p>|<br\/>|\n))+)/gi;

  let result = text.replace(refSectionRegex, (fullMatch, headerTitle, refBlock) => {
    if (fullMatch.includes('___HTML_TABLE_') || fullMatch.includes('___CODE_BLOCK_') || /<table/i.test(fullMatch)) {
      return fullMatch;
    }

    const rawLines = refBlock.split(/(?:<\/p>|<\/div>|<br\/>|\n)+/);
    const itemBoxes = [];

    rawLines.forEach((line) => {
      const stripped = line.replace(/<[^>]+>/g, '').trim();
      if (!stripped) return;

      const matchRef = line.match(/(?:[•\*\-]\s*)?\$?([A-Za-z0-9_\'\^\(\)\{\}\+\-\*\/\=\\s]+)\$?\s*:\s*(.+)$/);
      if (matchRef) {
        const refTag = matchRef[1].trim();
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
          itemBoxes.push(
            `<div class="flex items-baseline gap-2 px-2 py-1 text-slate-300 text-[14px] sm:text-[15px] leading-[1.3]"><span class="text-emerald-400 font-bold">•</span><div class="flex-1 text-slate-100 leading-[1.3]">${content}</div></div>`
          );
        }
      }
    });

    if (itemBoxes.length === 0) return fullMatch;

    const titleClean = headerTitle.replace(/<[^>]+>/g, '').replace(/^[#\*\-•\[\]\s📚]+/, '').replace(/[#\*\-•\[\]\s]+$/, '').trim();

    return `<div class="my-3.5 p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/40 shadow-lg text-left select-text leading-[1.3]"><div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-emerald-500/25 text-emerald-300 text-[14px] sm:text-[16px] font-bold select-none leading-[1.3]"><span class="text-base">📚</span><span>${titleClean || 'KDS/KCS 규정 및 영문 위키피디아 지반역학 참조'}</span></div><div class="space-y-1.5 leading-[1.3]">${itemBoxes.join('')}</div></div>`;
  });

  // Auto-fallback: Ensure KDS/KCS and Wikipedia Soil Mechanics Reference Accordion Card is always present
  if (!result.includes('KDS/KCS 규정 및 영문 위키피디아 지반역학 참조') && !result.includes('___HTML_TABLE_')) {
    const autoRefCard = 
      `<div class="my-3.5 p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/40 shadow-lg text-left select-text leading-[1.3]">` +
        `<div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-emerald-500/25 text-emerald-300 text-[14px] sm:text-[16px] font-bold select-none leading-[1.3]">` +
          `<span class="text-base">📚</span>` +
          `<span>KDS/KCS 규정 및 영문 위키피디아 지반역학 참조</span>` +
        `</div>` +
        `<div class="space-y-1.5 leading-[1.3]">` +
          `<details class="group rounded-xl border border-slate-800 bg-slate-900/80 my-1.5 transition-all overflow-hidden">` +
            `<summary class="flex items-center justify-between gap-2.5 p-2.5 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">` +
              `<div class="flex items-center gap-2 min-w-0 flex-1">` +
                `<span class="px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 border border-amber-500/40 font-bold text-xs font-mono shrink-0 select-none">KDS 11 20 00</span>` +
                `<span class="text-[13px] sm:text-[14px] text-slate-100 font-medium leading-tight truncate">지반조사 설계기준 - 실내 전단시험 규정(삼축압축 UU, CU, CD) 및 지반강도 정수 결정 지침 적용</span>` +
              `</div>` +
              `<span class="text-xs font-bold text-amber-400/90 group-open:rotate-180 transition-transform shrink-0 ml-1.5">▼</span>` +
            `</summary>` +
            `<div class="p-3 pt-2 text-[13px] sm:text-[14px] text-slate-200 leading-relaxed border-t border-slate-800/80 bg-slate-950/80 break-words select-text font-sans">` +
              `<div class="text-xs font-bold text-emerald-400 mb-1">📖 검색 규정/이론 전문 내역:</div>` +
              `KDS 11 20 00 (지반조사 설계기준): 흙의 유효응력 해석 및 전단강도 산정을 위해 삼축압축시험(UU, CU, CD)을 표준 시험법으로 규정함. CSL/NFL 공간에서의 유효내부마찰각($\\phi'$) 산정 시 소수점 둘째자리 정밀도 유지 및 간극수압 계수 A, B 상한값 검증 절차 적용.` +
            `</div>` +
          `</details>` +
          `<details class="group rounded-xl border border-slate-800 bg-slate-900/80 my-1.5 transition-all overflow-hidden">` +
            `<summary class="flex items-center justify-between gap-2.5 p-2.5 px-3 cursor-pointer select-none hover:bg-slate-800/60 transition-colors">` +
              `<div class="flex items-center gap-2 min-w-0 flex-1">` +
                `<span class="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-bold text-xs font-mono shrink-0 select-none">Wikipedia Soil Mechanics</span>` +
                `<span class="text-[13px] sm:text-[14px] text-slate-100 font-medium leading-tight truncate">Triaxial Shear Test & Stress Path (p-q invariants, Critical State M-line)</span>` +
              `</div>` +
              `<span class="text-xs font-bold text-amber-400/90 group-open:rotate-180 transition-transform shrink-0 ml-1.5">▼</span>` +
            `</summary>` +
            `<div class="p-3 pt-2 text-[13px] sm:text-[14px] text-slate-200 leading-relaxed border-t border-slate-800/80 bg-slate-950/80 break-words select-text font-sans">` +
              `<div class="text-xs font-bold text-emerald-400 mb-1">📖 검색 규정/이론 전문 내역:</div>` +
              `Soil Mechanics (Cambridge Triaxial Stress Space): $p' = (\\sigma_1' + 2\\sigma_3')/3$, $q = \\sigma_1' - \\sigma_3'$. Critical State Line (CSL) M-line slope $M = 6\\sin\\phi' / (3 - \\sin\\phi')$. Stress path trajectories under UU, CU, and CD drainage conditions.` +
            `</div>` +
          `</details>` +
        `</div>` +
      `</div>`;
    result += '\n\n' + autoRefCard;
  }

  return result;
}

/**
 * 5. 모든 동적 감싸기 엔진 통합 파이프라인
 */
export function applyAllDynamicWrappers(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  result = wrapMechanismProcedureAssumptionsHtml(result);
  result = wrapSymbolDefinitionsHtml(result);
  result = wrapKdsKcsAndWikipediaReferencesHtml(result);
  return result;
}

export default {
  wrapMechanismProcedureAssumptionsHtml,
  wrapSymbolDefinitionsHtml,
  wrapFollowingListItemsHtml,
  wrapKdsKcsAndWikipediaReferencesHtml,
  applyAllDynamicWrappers
};
