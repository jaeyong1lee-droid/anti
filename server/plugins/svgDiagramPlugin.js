export const SVG_DIAGRAM_PROMPT = `n[정밀 SVG 다이어그램 작도 지침]:
1. ⚠️ [작도 기본 원칙]: 기본적으로 일반적인 그래프나 도해는 **마크다운 표(Markdown Table) 또는 텍스트로 설명하는 것을 원칙**으로 합니다. 단, 사용자가 명시적으로 "SVG 그래프로 보여달라"고 요청한 경우에만 아래의 정밀 SVG 다이어그램 지침을 따라 작도하십시오.
2. 시각 자료가 필요한 경우 반드시 **마크다운 코드 블록 식별자인 \\\svg 를 사용하여 온전한 \<svg>\ HTML 태그 코드를 출력**하십시오. 
   - 예시:
   \\\svg
   <svg width="100%" viewBox="0 0 500 300" style="background-color: #1e1e1e;" xmlns="http://www.w3.org/2000/svg">
     ...
   </svg>
   \\\`n3. [수식 및 모든 텍스트의 KaTeX 수식 표현 규칙 - 극도로 중요!]:
   - SVG 내의 글자, 사이즈 수치, 제목 및 수식 기호를 쓸 때는 **절대로 \<text>\ 태그를 사용하지 마십시오.** \<text>\ 태그 내에 수식 기호가 들어가면 프론트엔드의 KaTeX HTML 변환 과정에서 태그가 깨져 글씨가 그림 밖으로 튕겨 나가는 치명적인 버그가 발생합니다.
   - 따라서 **SVG 내의 모든 문자(일반 텍스트 및 수식)는 무조건 \<foreignObject>\ 태그와 그 안의 \<div xmlns="http://www.w3.org/1999/xhtml">\를 조합하여 작성**하십시오.
   - ⚠️ [마크다운 기호 금지]: \<foreignObject>\ 안의 \<div>\ 내에는 **절대로 별표(*, 볼드체), 리스트 문법(-) 등의 마크다운(Markdown) 기호를 사용하지 마십시오.** 순수한 일반 텍스트 문장과 HTML 태그, 그리고 수식($ ... $) 기호만 사용합니다.
   - <foreignObject>안의 요소가 잘리지 않도록 \overflow="visible"\ 속성을 반드시 추가하고 충분한 \width\와 \height\를 지정하세요.
   - 예시 (일반 텍스트 및 수식 혼용):
     \<foreignObject x="10" y="10" width="150" height="40" overflow="visible"><div xmlns="http://www.w3.org/1999/xhtml" style="color: #fbbf24; font-weight: bold; font-size: 14px; white-space: nowrap;">주동토압 ($ P_a $)</div></foreignObject>\`n4. [디자인 및 가독성 규칙]:
   - **그림 너비를 창너비로 맞추기 위해**, \<svg>\ 태그에 \width="100%"\ 속성을 부여하고 넉넉한 \iewBox\ (예: \iewBox="0 0 1000 500"\)를 설정하여 가로폭을 가득 채우도록 하십시오.
   - **바탕은 검은색 계열(background-color: #1e1e1e;)**로 설정하십시오.
   - 어두운 배경(테마)에서도 잘 어울리도록 선 색상은 밝은 계열(예: \stroke="#cbd5e1"\, \#fbbf24\)을 사용하십시오.
   - 영역을 칠할 때는 반투명한 색상(예: \ill="rgba(251, 191, 36, 0.2)"\)을 사용하여 가독성을 높이세요.
   - 다이어그램 하단이나 여백에 어떤 다이어그램인지 명확히 알 수 있는 그림 제목을 \<foreignObject>\로 포함하십시오.
;