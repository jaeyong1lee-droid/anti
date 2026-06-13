const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../server/index.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace backticks with single quotes to avoid closing JS template literal early
content = content.replace(
  '의 각 `<Topic>...</Topic>` 태그에',
  "의 각 '<Topic>...</Topic>' 태그에"
);

content = content.replace(
  '의 각 `<Topic>...</Topic>` 태그,',
  "의 각 '<Topic>...</Topic>' 태그,"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully fixed backtick syntax issues in server/index.js');
