const text = `요소의 두께 dz 를 통과하여 상부로 유출되는 유속은 테일러 급수 (Taylor Series) 의 1 차 항까지 고려하여 v_z + \\frac{\\partial v_z}{\\partial z} dz 로 나타낼 수 있습니다.`;

const mathExprPattern = /(\b[a-zA-Z0-9_\-\+\*\/\(\)\[\] \t\.,]*?\\[a-zA-Z_]+(?:[a-zA-Z0-9_\-\+\*\/\(\)\[\] \t\.,]|\{[^}]*\})*)/g;

console.log("Matches:");
let match;
while ((match = mathExprPattern.exec(text)) !== null) {
  console.log("Match:", match[0]);
}
