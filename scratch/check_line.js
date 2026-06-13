const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../client/src/App.jsx');
const lines = fs.readFileSync(file, 'utf8').split('\n');
for (let i = 10008; i < 10040; i++) {
  console.log(`${i+1}: ${JSON.stringify(lines[i])}`);
}
