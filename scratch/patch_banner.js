const fs = require('fs');

const filePath = 'C:/Users/airfo/OneDrive/바탕 화면/안티/client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Flexible regex replacement for font-sizes in both pages
const regex = /class(Name)?="text-\[10px\] font-black flex items-center gap-1\.5 mb-0\.5"([\s\S]*?)<span>\{getSubjectiveStatusText\(idx\)\}<\/span>([\s\S]*?)<\/div>([\s\S]*?)class(Name)?="text-\[10px\]/g;

if (regex.test(content)) {
  content = content.replace(regex, 'class$1="text-[12px] font-black flex items-center gap-1.5 mb-0.5"$2<span>{getSubjectiveStatusText(idx)}</span>$3</div>$4class$5="text-[12px]');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated banner font sizes to 12px (1.2x).');
} else {
  console.error('Target banner pattern not found in file!');
}
