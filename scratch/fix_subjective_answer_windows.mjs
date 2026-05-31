import fs from 'fs';
import path from 'path';

const appJsxPath = path.resolve('client/src/App.jsx');
let content = fs.readFileSync(appJsxPath, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

const replacements = [
  {
    name: 'Review Subjective Answer Box',
    search: '                            <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4 space-y-2">',
    replace: '                            <div className="md:bg-amber-950/30 md:border md:border-amber-500/20 md:rounded-xl md:p-4 p-0 bg-transparent border-0 space-y-2">'
  },
  {
    name: 'Exam Subjective Answer Box',
    search: '                          <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4 space-y-2">',
    replace: '                          <div className="md:bg-amber-950/30 md:border md:border-amber-500/20 md:rounded-xl md:p-4 p-0 bg-transparent border-0 space-y-2">'
  },
  {
    name: 'Formula Output Box',
    search: '                          <div className="space-y-3 p-4 bg-slateCustom-950/40 rounded-xl border border-slate-800/80 min-h-[60px] relative">',
    replace: '                          <div className="space-y-3 md:p-4 md:bg-slateCustom-950/40 md:rounded-xl md:border md:border-slate-800/80 p-0 bg-transparent border-0 min-h-0 relative">'
  },
  {
    name: 'Theory Output Box',
    search: '                          <div className="space-y-2 p-4 bg-slateCustom-950/40 rounded-xl border border-slate-800/80 min-h-[60px] relative">',
    replace: '                          <div className="space-y-2 md:p-4 md:bg-slateCustom-950/40 md:rounded-xl md:border md:border-slate-800/80 p-0 bg-transparent border-0 min-h-0 relative">'
  }
];

let replaced = 0;
for (const rep of replacements) {
  if (content.includes(rep.search)) {
    content = content.replace(rep.search, rep.replace);
    console.log(`SUCCESS: Replaced ${rep.name}`);
    replaced++;
  } else {
    console.error(`ERROR: Could not find ${rep.name}!`);
  }
}

if (replaced === replacements.length) {
  fs.writeFileSync(appJsxPath, content, 'utf8');
  console.log('FINISHED: All subjective answer windows successfully updated!');
} else {
  console.error(`ERROR: Only replaced ${replaced} / ${replacements.length} blocks. Aborting write!`);
}
