const fs = require('fs');

const filePath = 'client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Regex to find chatHistory.map and the corresponding div key={i}
const regex = /(chatHistory\.map\(\(msg,\s*i\)\s*=>\s*\(\r?\n\s*<div\s+key=\{i\})/g;

let count = 0;
content = content.replace(regex, (match) => {
  count++;
  return match + ' id={`chat-msg-${i}`}';
});

console.log(`Made ${count} replacements.`);

if (count > 0) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated client/src/App.jsx');
} else {
  console.log('No matches found to replace.');
}
