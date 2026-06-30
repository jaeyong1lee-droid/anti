export const defaultOverviews = [
  {
    id: "ov_1",
    title: "지반조사",
    content: "구조물 설계와 시공을 위해 지반의 공학적 특성을 파악하는 조사"
  },
  {
    id: "ov_2",
    title: "흙의 동해",
    content: "겨울철 노상 토사 내 수분이 동결되어 부피 팽창으로 도로가 융기하는 현상"
  },
  {
    id: "ov_3",
    title: "옹벽",
    content: "토압에 저항하여 사면이나 흙의 붕괴를 방지하기 위해 설치하는 구조물"
  }
];

export async function generateOverviewTutorResponse(message, image, localCallLLM) {
  const systemInstruction = `당신은 대한민국 국가기술자격 기술사 시험 전문 튜터입니다.
사용자가 입력한 주제(토픽)에 대해 시험 서술 시 첫 번째 칸에 적을 수 있는 가장 명확하고 전문적인 '개요'를 작성하십시오.

[작성 규칙]:
1. **30자 내외 분량 제한 (필수 수칙)**: 설명은 반드시 공백 포함 30자 내외(최소 20자, 최대 45자 이내)로 핵심만 간결하게 요약하여 한 줄로 작성하십시오. 설명이 너무 길어지면 감점 요인이 되므로 절대 불필요한 미사여구를 붙이지 마십시오.
2. **기술사 전문 문체**: 기술사 시험 답안지 형식에 걸맞게 명사형 종결(~하는 현상, ~하는 공법, ~하는 구조물 등)을 사용해 전문적이고 객관적으로 정의를 내려주십시오.
3. **오직 결과만 출력**: 사족이나 안내 멘트(예: "네, 작성해 드리겠습니다." 등)는 절대 포함하지 말고 오직 정의된 개요 한 줄만 바로 출력하십시오.

예시:
입력: 지반조사
출력: 구조물 설계와 시공을 위해 지반의 공학적 특성을 파악하는 조사`;

  const responseText = await localCallLLM(systemInstruction, message, image, 'tutor');
  return responseText.trim();
}
