import fs from 'fs';

const testText = `3. 지반공학적 시사점 및 활용

• **정의**: 포화된 점토 지반에서 비배수 상태($\\phi_u = 0$)를 가정할 때, 간극수압의 영향으로 인해 포아송비 $u$는 0.5에 수렴하게 됩니다.

• **직관적 설명**: 비배수 조건의 포화 점토는 물의 비압축성으로 인해 전체 부피 변화가 거의 발생하지 않습니다. 이때 $K$ 값은 이론적으로 무한대($\\infty$)에 가까워지며, 이는 지반이 전단 변형은 가능하나 체적 변화는 불가능한 상태임을 의미합니다.

• **메커니즘**:
1) **비배수 조건**: $u \\rightarrow 0.5$ 이므로, $K = \\frac{E}{3(1 - 2u)}$ 식에서 분모가 0으로 수렴하여 $K$ 값은 매우 커집니다.
2) **응력 경로**: 삼축압축시험 등에서 평균 유효응력($\\sigma'_m$)의 변화가 체적 변화($\\Delta \\epsilon_v$)를 유발하는 메커니즘을 통해 지반의 강성(Stiffness)을 평가합니다.
3) **설계 적용**: 터널 굴착 시 지반의 변위 예측이나 기초의 침하 해석 시, 지반의 압축성을 고려하기 위해 $K$ 또는 이와 연관된 $E, u$ 값을 정확히 산정하는 것이 중요합니다.

기술사 시험에서는 단순히 공식만 나열하기보다, **비배수 조건에서의 $K$ 값의 거동과 응력-변형률 관계에서의 물리적 의미**를 결합하여 서술하는 것이 고득점의 핵심입니다.`;

function convertMarkdownToHtml(mdText, isMarkdown = false, highlightBold = false, isTutor = false) {
  let tempText = mdText || '';

  // 0. Normalize escaped and actual newlines
  tempText = tempText
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');

  // Collapse consecutive newlines (or empty lines) to at most 2 newlines (\n\n)
  tempText = tempText.replace(/\n\s*\n/g, '\n\n');
  tempText = tempText.replace(/\n{3,}/g, '\n\n');

  // 2. Headings on same line: "Text ### Title" -> "Text\n\n### Title"
  tempText = tempText.replace(/([^\n])\s*(#{2,6}\s+)/g, '$1\n\n$2');

  // 3. Bold text
  if (isTutor) {
    tempText = tempText.replace(/\*\*([^\*]+?)\*\*/g, `<span style="color: #fbbf24; font-weight: normal;">$1</span>`);
    tempText = tempText.replace(/'([^'\n]+?)'/g, `<span style="color: #fbbf24; font-weight: normal;">'$1'</span>`);
  }

  // 4. Render headings to styled HTML
  tempText = tempText.replace(/^(###+)\s+(.*?)$/gm, (match, hashes, title) => {
    return `<h3 class="text-[14px] sm:text-[16px]" style="margin-top: 1.8rem; margin-bottom: 0.6rem; font-weight: normal; color: #f1f5f9; border-bottom: 1px solid rgba(51, 65, 85, 0.2); padding-bottom: 0.15rem;">${title}</h3>`;
  });

  // 5. Render list items (both bullet points * and - and numbered/sub-numbered lists)
  if (isMarkdown) {
    // Treat \d+\. as a prominent section header for tutor
    if (isTutor) {
      tempText = tempText.replace(/^(\d+)\.\s+(.*?)$/gm, '<div style="margin-top: 2.2rem; margin-bottom: 1rem; font-weight: 800; color: #f8fafc; font-size: 1.15rem; line-height: 1.6; border-bottom: 1px solid rgba(244, 63, 94, 0.15); padding-bottom: 0.3rem;">$1. $2</div>');
    } else {
      tempText = tempText.replace(/^(\d+)\.\s+(.*?)$/gm, '<div style="margin-top: 1.2rem; margin-bottom: 1.2rem; padding-left: 1.25rem; text-indent: -1.25rem; color: #ffffff; line-height: 1.6;">$1. $2</div>');
    }

    tempText = tempText.replace(/^[ \t]*(?:\* \* \*|\*\*\*)[ \t]*(.*?)$/gm, '<div style="margin-top: 1.2rem; margin-bottom: 1.2rem; padding-left: 1.25rem; text-indent: -1.25rem; color: #ffffff; line-height: 1.6;">• $1</div>');
    tempText = tempText.replace(/^[ \t]*(?:\*|-|•)[ \t]+(.*?)$/gm, '<div style="margin-top: 1rem; margin-bottom: 1rem; padding-left: 1.25rem; text-indent: -1.25rem; color: #ffffff; line-height: 1.6;">• $1</div>');
    
    tempText = tempText.replace(/^[ \t]*(\d+\))\s*(.*?)$/gm, '<div style="margin-top: 1rem; margin-bottom: 1rem; padding-left: 1.25rem; text-indent: -1.25rem; color: #ffffff; line-height: 1.6;">$1 $2</div>');
    tempText = tempText.replace(/^[ \t]*([a-zA-Z가-힣]\))\s*(.*?)$/gm, '<div style="margin-top: 1rem; margin-bottom: 1rem; padding-left: 1.25rem; text-indent: -1.25rem; color: #ffffff; line-height: 1.6;">$1 $2</div>');
    tempText = tempText.replace(/^[ \t]*([①-⑳])\s*(.*?)$/gm, '<div style="margin-top: 1rem; margin-bottom: 1rem; padding-left: 1.25rem; text-indent: -1.25rem; color: #ffffff; line-height: 1.6;">$1 $2</div>');
  }

  // 5.5. Remove extra newlines around list divs to prevent spacers/br from adding huge gaps
  tempText = tempText.replace(/(<\/div>)\n+(<div style="[^"]*">(?:•|\d+\.|\d+\)|[a-zA-Z가-힣]\)|[①-⑳]))/g, '$1$2');

  // 6. Spacers for paragraph gaps
  if (isMarkdown) {
    tempText = tempText.replace(/\n\n/g, '<div style="height: 1.2rem;"></div>');
    tempText = tempText.replace(/\n/g, '<br/>');
  } else {
    tempText = tempText.replace(/\n\n/g, '<div style="height: 0.6rem;"></div>');
    tempText = tempText.replace(/\n/g, '<br/>');
  }

  return tempText;
}

const output = convertMarkdownToHtml(testText, true, false, true);

console.log("=== FULL OUTPUT ===");
console.log(output);
