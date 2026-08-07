const dbStr = '```ascii\n  [종축]\n   $t / S_t$\n     │\n     │                 / (실측 데이터 회귀 직선: $t / S_t = \\alpha + \\beta * t)$\n     │                /\n     │               /\n     │              /  <-- 기울기 $= \\beta ($ 최종 침하량 $S_f = 1 / \\beta)$\n     │             /\n     │            /\n     │           /\n  $(\\alpha)$ ─── ●\n     │      /\n     │     /\n     └───────────────────────────────────────── [횡축]\n     0                                           시간 (t)\n```';
const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```/g;
console.log(dbStr.match(regex));
