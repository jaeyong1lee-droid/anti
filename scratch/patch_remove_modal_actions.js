const fs = require('fs');

const filePath = 'client/src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

// Function to remove actions for a specific modal
function removeActionsForModal(identifier) {
  // Find all startTags
  const startTag = '<div className="hidden landscape-mobile-only flex-col gap-2 p-2 bg-slateCustom-950 border-r border-slate-800/80 w-40';
  let idx = 0;
  while (true) {
    const startIdx = content.indexOf(startTag, idx);
    if (startIdx === -1) break;
    
    // Find closing </div> of this strip to isolate the search area
    const nextStripClose = content.indexOf('</div>', startIdx);
    if (nextStripClose === -1) {
      idx = startIdx + 1;
      continue;
    }
    
    const area = content.slice(startIdx, nextStripClose);
    if (area.includes(identifier)) {
      // Found the modal!
      console.log(`Found modal strip for ${identifier}`);
      
      // Find the separator inside this strip
      const separatorTag = '<div className="h-px bg-slate-800/60 my-1 shrink-0" />';
      const sepIdx = content.indexOf(separatorTag, startIdx);
      if (sepIdx !== -1 && sepIdx < nextStripClose) {
        // Replace from separator index to closing </div> with just </div>
        content = content.slice(0, sepIdx) + '</div>' + content.slice(nextStripClose + '</div>'.length);
        console.log(`Successfully removed actions for ${identifier}`);
        return;
      } else {
        console.log(`Separator not found or out of bounds for ${identifier}`);
      }
    }
    idx = startIdx + 1;
  }
}

// Remove actions for all three modals
removeActionsForModal('setShowFormulaExam');
removeActionsForModal('setShowTheoryExam');
removeActionsForModal('setShowAnswerSheet');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully updated client/src/App.jsx!");
