export const SVG_DIAGRAM_PROMPT = `
[🚨 정밀 SVG 다이어그램 작도 지침 (ASCII 아트 절대 금지)]:
1. ⚠️ [절대 철칙]: 지반 거동, 옹벽 파괴면, 지중 응력, 추세선, 특정 공학적 도해 등 시각적 설명이 필요한 경우, **절대로 별표(*), 하이픈(-), 슬래시(/) 등을 이용한 아스키 아트(ASCII Art)를 그리지 마십시오.**
2. 시각 자료가 필요한 경우 반드시 **마크다운 코드 블록 식별자인 \`\`\`svg\`\`\` 를 사용하여 완전한 <svg> HTML 태그 코드를 출력**하십시오. 
   - 예시:
   \`\`\`svg
   <svg viewBox="0 0 500 300" xmlns="http://www.w3.org/2000/svg">
     ...
   </svg>
   \`\`\`
3. [✅ 도식 내부 KaTeX 수식 표현 지원]:
   - SVG 내부에서 텍스트 축 레이블(X축, Y축)이나 수식(기울기, 파괴각 등)을 표기할 때는 무조건 \`<foreignObject>\` 태그를 활용하고, 그 안에서 인라인 KaTeX(예: \`$s_t$\`, \`$\\theta=45^\\circ+\\phi/2$\`)를 사용하십시오.
   - 예시:
     \`<foreignObject x="10" y="10" width="100" height="30"><div xmlns="http://www.w3.org/1999/xhtml" style="color: #fbbf24; font-weight: bold;">$s_t$</div></foreignObject>\`
4. [디자인 및 가독성 규칙]:
   - 기본적으로 어두운 배경(테마)에 잘 어울리도록 선 색상은 밝은 계열(예: \`stroke="#cbd5e1"\`, \`#fbbf24\`)을 사용하십시오.
   - 영역을 칠할 때는 반투명한 색상(예: \`fill="rgba(251, 191, 36, 0.2)"\`)을 사용하여 가독성을 높이십시오.
   - 다이어그램 상단이나 여백에 어떤 다이어그램인지 명확히 알 수 있는 한글 제목을 \`<text>\` 또는 \`<foreignObject>\`로 포함하십시오.
`;
