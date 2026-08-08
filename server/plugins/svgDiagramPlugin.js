export const SVG_DIAGRAM_PROMPT = `
[🚨 정밀 SVG 다이어그램 작도 지침]:
1. ⚠️ [작도 기본 원칙]: 기본적으로 일반적인 그래프나 도해는 **아스키 차트 다이어그램(ASCII Chart)으로 보여주는 것을 기본**으로 합니다. 단, 사용자가 명시적으로 "SVG 그래프로 보여달라"고 요청한 경우에만 아래의 정밀 SVG 다이어그램 지침을 따라 작도하십시오.
2. 시각 자료가 필요한 경우 반드시 **마크다운 코드 블록 식별자인 \`\`\`svg 를 사용하여 완전한 \`<svg>\` HTML 태그 코드를 출력**하십시오. 
   - 예시:
   \`\`\`svg
   <svg width="100%" viewBox="0 0 500 300" style="background-color: #1e1e1e;" xmlns="http://www.w3.org/2000/svg">
     ...
   </svg>
   \`\`\`
3. [✅ 도식 내부 모든 텍스트 및 KaTeX 수식 표현 규칙 - 극도로 중요!]:
   - SVG 내부에 글자(레이블, 수치, 제목 등)나 수식을 넣을 때는 **절대로 \`<text>\` 태그를 사용하지 마십시오.** \`<text>\` 태그 내부에 수식 기호가 들어가면 프론트엔드의 KaTeX HTML 변환 과정에서 태그가 깨져 글자가 그림 밖으로 튕겨 나가는 치명적인 버그가 발생합니다.
   - 따라서 **SVG 내부의 모든 문자열(일반 텍스트 및 수식)은 무조건 \`<foreignObject>\` 태그와 그 안의 \`<div xmlns="http://www.w3.org/1999/xhtml">\`를 조합하여 작성**하십시오.
   - ⚠️ [마크다운 절대 금지]: \`<foreignObject>\` 내부의 \`<div>\` 안에는 **절대로 별표(*), 볼드체(**), 리스트 문법(-) 등의 마크다운(Markdown) 기호를 사용하지 마십시오.** 순수한 일반 텍스트 문장과 HTML 태그, 그리고 수식($...$) 기호만 허용됩니다.
   - <foreignObject>에는 요소가 잘리지 않도록 \`overflow="visible"\` 속성을 반드시 추가하고 충분한 \`width\`와 \`height\`를 지정하십시오.
   - 예시 (일반 텍스트 및 수식 혼용):
     \`<foreignObject x="10" y="10" width="150" height="40" overflow="visible"><div xmlns="http://www.w3.org/1999/xhtml" style="color: #fbbf24; font-weight: bold; font-size: 14px; white-space: nowrap;">주동토압 ($P_a$)</div></foreignObject>\`
4. [디자인 및 가독성 규칙]:
   - **그림 너비를 창너비로 맞추기 위해**, \`<svg>\` 태그에 \`width="100%"\` 속성을 부여하고 넉넉한 \`viewBox\` (예: \`viewBox="0 0 1000 500"\`)를 설정하여 가로폭을 가득 채우도록 하십시오.
   - 기본적으로 어두운 배경(테마)에 잘 어울리도록 선 색상은 밝은 계열(예: \`stroke="#cbd5e1"\`, \`#fbbf24\`)을 사용하십시오.
   - 영역을 칠할 때는 반투명한 색상(예: \`fill="rgba(251, 191, 36, 0.2)"\`)을 사용하여 가독성을 높이십시오.
   - 다이어그램 상단이나 여백에 어떤 다이어그램인지 명확히 알 수 있는 한글 제목을 \`<foreignObject>\`로 포함하십시오.
`;
