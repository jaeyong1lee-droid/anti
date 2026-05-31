import fs from 'fs';
import path from 'path';

const appJsxPath = path.resolve('client/src/App.jsx');
let content = fs.readFileSync(appJsxPath, 'utf8');

// Normalize line endings
const lines = content.replace(/\r\n/g, '\n').split('\n');

// Find the index of the line containing ") : (" under the exam subjective block.
// We can locate it by finding the line that has "detailedAnswers[idx].text" and looking upwards and downwards.
const detailedAnswerLineIndex = lines.findIndex(l => l.includes('detailedAnswers[idx].text'));

if (detailedAnswerLineIndex !== -1) {
  console.log(`Found detailedAnswers[idx].text at line ${detailedAnswerLineIndex + 1}`);
  
  // We want to find the ") : (" above it, which starts the block we want to delete.
  let startDeleteIndex = -1;
  for (let i = detailedAnswerLineIndex; i >= 0; i--) {
    if (lines[i].includes(') : (')) {
      startDeleteIndex = i;
      break;
    }
  }
  
  // We want to find the corresponding ")}" of that block.
  let endDeleteIndex = -1;
  for (let i = detailedAnswerLineIndex; i < lines.length; i++) {
    if (lines[i].trim() === ')}') {
      endDeleteIndex = i;
      break;
    }
  }

  if (startDeleteIndex !== -1 && endDeleteIndex !== -1) {
    console.log(`Deleting from line ${startDeleteIndex + 1} to ${endDeleteIndex + 1}`);
    
    // Let's print what we are deleting to be absolutely sure
    for (let i = startDeleteIndex; i <= endDeleteIndex; i++) {
      console.log(`[DELETE] ${i + 1}: ${lines[i]}`);
    }
    
    // Remove these lines
    lines.splice(startDeleteIndex, endDeleteIndex - startDeleteIndex + 1);
    
    // Write back
    fs.writeFileSync(appJsxPath, lines.join('\n'), 'utf8');
    console.log('SUCCESS: Healed exam subjective card block!');
  } else {
    console.error(`ERROR: Could not find start/end delete bounds! start=${startDeleteIndex}, end=${endDeleteIndex}`);
  }
} else {
  console.error('ERROR: Could not find detailedAnswers[idx].text line!');
}
