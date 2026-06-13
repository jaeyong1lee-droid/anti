const fs = require('fs');
const path = require('path');

const indexPath = path.resolve('server/index.js');
let content = fs.readFileSync(indexPath, 'utf8');

const target = '     * "rows": 각 행의 셀 데이터들을 담은 이중 배열. 채워넣어야 하는 빈칸 자리에는 반드시 "[INPUT_1]", "[INPUT_2]" 등의 토큰을 삽입하십시오. (예: [["보강 방식 및 지지력 메커니즘", "[INPUT_1]", "[INPUT_2]"]])';

const replacement = '     * "rows": 각 행의 셀 데이터들을 담은 이중 배열. (⚠️ [비교 컬럼 전체 빈칸 비우기 수칙 - 극도로 중요!]): 첫 번째 \'구분 항목\' 열을 제외하고, 오른쪽에 위치하는 모든 비교/대비 대상 컬럼의 셀들은 단 하나의 텍스트 힌트도 남기지 말고 **무조건 전부 빈칸 토큰([INPUT_1], [INPUT_2] 등)으로 비워두십시오.** 일부 셀이 텍스트로 미리 채워져 있으면 사용자가 서로 반대 내용을 대입하여 정답을 쉽게 맞추므로 변별력이 사라집니다. 따라서 구분 컬럼을 제외한 내부는 **전부 입력창(3열 3행 테이블 기준 총 6칸 전체)**으로 구성해야 합니다. (예: rows 구조: [["지지 매커니즘", "[INPUT_1]", "[INPUT_2]"], ["설계 핵심 변수", "[INPUT_3]", "[INPUT_4]"], ["주요 적용 지반", "[INPUT_5]", "[INPUT_6]"]])';

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(indexPath, content, 'utf8');
  console.log('Successfully patched server/index.js!');
} else {
  console.error('Target string not found in server/index.js!');
  const lines = content.split(/\r?\n/);
  console.log('Line 3301 is:', JSON.stringify(lines[3300]));
}
