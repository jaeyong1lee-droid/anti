import fs from 'fs';
import path from 'path';

const appJsxPath = path.resolve('client/src/App.jsx');
let content = fs.readFileSync(appJsxPath, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

const target1 = `            {/* Left: Formula Body */}
            <div ref={formulaBodyRef} className="w-full max-w-full min-w-0 shrink-0 md:w-1/2 md:shrink snap-start h-full overflow-y-auto overflow-x-hidden p-4 md:p-6 bg-slateCustom-900/30">`;

const replacement1 = `            {/* Left: Formula Body */}
            <div ref={formulaBodyRef} className="w-full max-w-full min-w-0 shrink-0 md:w-1/2 md:shrink snap-start h-full overflow-y-auto overflow-x-hidden p-3 sm:p-6 bg-slateCustom-900/30">`;

const target2 = `            {/* Left: Theory list */}
            <div ref={theoryBodyRef} className="w-full max-w-full min-w-0 shrink-0 md:w-3/5 md:shrink snap-start h-full overflow-y-auto overflow-x-hidden p-5 space-y-4 scroll-smooth">`;

const replacement2 = `            {/* Left: Theory list */}
            <div ref={theoryBodyRef} className="w-full max-w-full min-w-0 shrink-0 md:w-3/5 md:shrink snap-start h-full overflow-y-auto overflow-x-hidden p-3 sm:p-6 space-y-4 scroll-smooth">`;

let success = true;

if (content.includes(target1)) {
  content = content.replace(target1, replacement1);
  console.log('SUCCESS: Replaced Formula Body padding!');
} else {
  console.error('ERROR: Could not find Formula Body target!');
  success = false;
}

if (content.includes(target2)) {
  content = content.replace(target2, replacement2);
  console.log('SUCCESS: Replaced Theory list padding!');
} else {
  console.error('ERROR: Could not find Theory list target!');
  success = false;
}

if (success) {
  fs.writeFileSync(appJsxPath, content, 'utf8');
  console.log('FINISHED: App.jsx updated successfully!');
}
