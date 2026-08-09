// 방금 고친 정규식이 실제로 t/_S 를 제대로 처리하는지 검증
const testCases = [
  // Case 1: 방금 수정한 t/_S 패턴
  `{"lines": [{"name": "실측 데이터 타점 (t, t/_S)"}]}`,
  // Case 2: 유니코드 위첨자 ᵗ (U+1D57) 
  `{"lines": [{"name": "실측 데이터 타점 (t, \u1D57/S)"}]}`,
  // Case 3: 일반 백슬래시 이스케이프 \_ 
  `{"title": "시간-침하비 t\\_S 그래프"}`,
  // Case 4: 인라인 수식 $t/S$
  `{"xAxisLabel": "시간 $t$", "yAxisLabel": "$t/S$"}`,
];

// App.jsx에서 방금 추가한 클렌징 코드
function cleanJson(rawJson) {
  return rawJson.replace(/\\(?![\\"/bfnrtu])/g, '');
}

// ChartRenderer.jsx의 renderMixedText 클렌징 코드  
function cleanText(text) {
  return text.replace(/([a-zA-Z])\/_([a-zA-Z0-9])/g, '$1/$2');
}

testCases.forEach((tc, i) => {
  console.log(`\n=== Case ${i+1} ===`);
  console.log('원본:', tc);
  const cleaned = cleanJson(tc);
  console.log('JSON 클렌징 후:', cleaned);
  try {
    const parsed = JSON.parse(cleaned);
    // 파싱 성공 후 name/title 필드에 cleanText 적용
    const str = JSON.stringify(parsed);
    console.log('파싱 성공:', str.substring(0, 200));
    // 실제 렌더링 시 cleanText 적용
    Object.values(parsed).forEach(v => {
      if (typeof v === 'string') console.log('  renderMixedText 적용:', cleanText(v));
      if (Array.isArray(v)) v.forEach(item => {
        if (item && item.name) console.log('  renderMixedText name:', cleanText(item.name));
      });
    });
  } catch(e) {
    console.log('파싱 실패:', e.message);
  }
});
