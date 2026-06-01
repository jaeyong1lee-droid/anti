const fs = require('fs');
const lines = fs.readFileSync('server/index.js', 'utf8').split('\n');
lines.slice(3952, 4005).forEach((l, i) => {
  console.log(3953 + i, JSON.stringify(l));
});
