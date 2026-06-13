const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../client/src/App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Helper to normalize newlines
const newline = content.includes('\r\n') ? '\r\n' : '\n';
const normalizeNewlines = (str) => str.replace(/\r\n/g, '\n');

// ─── 1. Add useCallback import at the top of App.jsx ───
const oldImport = "import React, { useState, useEffect, useRef } from 'react';";
const newImport = "import React, { useState, useEffect, useRef, useCallback } from 'react';";
if (content.includes(oldImport)) {
  content = content.replace(oldImport, newImport);
}

// ─── 2. Insert resizing states & handlers in component state ───
const stateMarker = "  const [regeneratingReview, setRegeneratingReview] = useState({});";
const stateReplacement = `  const [regeneratingReview, setRegeneratingReview] = useState({});

  // Sidebar resizing state & handlers for Desktop
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => {
    return Math.max(300, Math.min(800, Math.round(window.innerWidth * 0.3)));
  });
  const [isResizing, setIsResizing] = useState(false);

  const startResize = useCallback((e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      return;
    }

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e) => {
      const newWidth = window.innerWidth - e.clientX - 25;
      const minWidth = 250;
      const maxWidth = window.innerWidth * 0.7;
      setRightSidebarWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);`;

if (content.includes(stateMarker)) {
  content = content.replace(stateMarker, stateReplacement);
} else {
  console.error("Could not find state marker in App.jsx");
  process.exit(1);
}

let normContent = normalizeNewlines(content);

// ─── 3. Replace Gutters and Sidebars for all 5 Modals ───

// A. Review Modal Gutter & Sidebar
const reviewGutterTarget = `          {/* Middle: Gutter (Takes exactly 50px width on Desktop) */}
          <div className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20">`;
const reviewGutterRep = `          {/* Middle: Gutter (Takes exactly 50px width on Desktop) */}
          <div 
            onMouseDown={startResize}
            className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20 cursor-col-resize select-none hover:bg-slate-800/25 active:bg-violet-500/10 transition-colors group"
          >
            <div className="absolute inset-y-0 w-px bg-slate-800/80 group-hover:bg-slate-700/80 group-active:bg-violet-500/50 transition-colors pointer-events-none" />`;

const reviewSidebarTarget = `          {/* Right: Gemini Chat Sidebar (Takes exactly 30% width on Desktop) */}
          <div 
            className="w-full md:w-[30vw] landscape-w-45 min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col"
          >`;
const reviewSidebarRep = `          {/* Right: Gemini Chat Sidebar (Takes exactly 30% width on Desktop) */}
          <div 
            style={isDesktop ? { width: \`\${rightSidebarWidth}px\` } : {}}
            className="w-full md:w-[30vw] landscape-w-45 min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col"
          >`;

// B. Exam Modal Gutter & Sidebar
const examGutterTarget = `            {/* Middle: Gutter (Takes exactly 50px width on Desktop) */}
            <div className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20">`;
const examGutterRep = `            {/* Middle: Gutter (Takes exactly 50px width on Desktop) */}
            <div 
              onMouseDown={startResize}
              className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20 cursor-col-resize select-none hover:bg-slate-800/25 active:bg-amber-500/10 transition-colors group"
            >
              <div className="absolute inset-y-0 w-px bg-slate-800/80 group-hover:bg-slate-700/80 group-active:bg-amber-500/50 transition-colors pointer-events-none" />`;

const examSidebarTarget = `            {/* Right: Gemini Sidebar (Takes exactly 30% width on Desktop) */}
            <div 
              className="w-full md:w-[30vw] landscape-w-45 min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col"
            >`;
const examSidebarRep = `            {/* Right: Gemini Sidebar (Takes exactly 30% width on Desktop) */}
            <div 
              style={isDesktop ? { width: \`\${rightSidebarWidth}px\` } : {}}
              className="w-full md:w-[30vw] landscape-w-45 min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col"
            >`;

// C. Formula Modal Gutter & Sidebar
const formulaGutterTarget = `            {/* Middle: Gutter (Takes exactly 50px width on Desktop) */}
            <div className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20">`;
const formulaGutterRep = `            {/* Middle: Gutter (Takes exactly 50px width on Desktop) */}
            <div 
              onMouseDown={startResize}
              className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20 cursor-col-resize select-none hover:bg-slate-800/25 active:bg-rose-500/10 transition-colors group"
            >
              <div className="absolute inset-y-0 w-px bg-slate-800/80 group-hover:bg-slate-700/80 group-active:bg-rose-500/50 transition-colors pointer-events-none" />`;

const formulaSidebarTarget = `            {/* Right: Gemini Sidebar for Formula */}
            {(isDesktop || isMobileLandscape) && (
              <div className="w-full max-w-full landscape-hide min-w-0 shrink-0 md:w-[35vw] md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col">`;
const formulaSidebarRep = `            {/* Right: Gemini Sidebar for Formula */}
            {(isDesktop || isMobileLandscape) && (
              <div 
                style={isDesktop ? { width: \`\${rightSidebarWidth}px\` } : {}}
                className="w-full max-w-full landscape-hide min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800/30 flex flex-col"
              >`;

// D. Theory Modal Gutter & Sidebar
const theoryGutterTarget = `            {/* Middle: Gutter (Takes exactly 50px width on Desktop) */}
            <div className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20">`;
const theoryGutterRep = `            {/* Middle: Gutter (Takes exactly 50px width on Desktop) */}
            <div 
              onMouseDown={startResize}
              className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20 cursor-col-resize select-none hover:bg-slate-800/25 active:bg-indigo-500/10 transition-colors group"
            >
              <div className="absolute inset-y-0 w-px bg-slate-800/80 group-hover:bg-slate-700/80 group-active:bg-indigo-500/50 transition-colors pointer-events-none" />`;

const theorySidebarTarget = `            {/* Right: Gemini Sidebar for Theory */}
            {(isDesktop || isMobileLandscape) && (
              <div className="w-full max-w-full landscape-hide min-w-0 shrink-0 md:w-[35vw] md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col">`;
const theorySidebarRep = `            {/* Right: Gemini Sidebar for Theory */}
            {(isDesktop || isMobileLandscape) && (
              <div 
                style={isDesktop ? { width: \`\${rightSidebarWidth}px\` } : {}}
                className="w-full max-w-full landscape-hide min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col"
              >`;

// E. Answer Sheet Modal Gutter & Sidebar
const answersheetGutterTarget = `            {/* Middle Gutter (Takes exactly 50px width on Desktop) */}
            <div className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20">`;
const answersheetGutterRep = `            {/* Middle Gutter (Takes exactly 50px width on Desktop) */}
            <div 
              onMouseDown={startResize}
              className="hidden md:flex landscape-hide md:w-[50px] h-full shrink-0 relative items-center justify-center bg-slateCustom-950/20 cursor-col-resize select-none hover:bg-slate-800/25 active:bg-emerald-500/10 transition-colors group"
            >
              <div className="absolute inset-y-0 w-px bg-slate-800/80 group-hover:bg-slate-700/80 group-active:bg-emerald-500/50 transition-colors pointer-events-none" />`;

const answersheetSidebarTarget = `            {/* Right: AI Tutor */}
            {(isDesktop || isMobileLandscape) && (
              <div className="w-full max-w-full landscape-hide min-w-0 shrink-0 md:w-[35vw] md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col">`;
const answersheetSidebarRep = `            {/* Right: AI Tutor */}
            {(isDesktop || isMobileLandscape) && (
              <div 
                style={isDesktop ? { width: \`\${rightSidebarWidth}px\` } : {}}
                className="w-full max-w-full landscape-hide min-w-0 shrink-0 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col"
              >`;

// Perform normalized replacement helper
const applyRep = (target, replacement) => {
  const normTarget = normalizeNewlines(target);
  const normRep = normalizeNewlines(replacement);
  if (normContent.includes(normTarget)) {
    normContent = normContent.replace(normTarget, normRep);
    return true;
  }
  return false;
};

// Apply all 10 changes
const results = {
  reviewGutter: applyRep(reviewGutterTarget, reviewGutterRep),
  reviewSidebar: applyRep(reviewSidebarTarget, reviewSidebarRep),
  examGutter: applyRep(examGutterTarget, examGutterRep),
  examSidebar: applyRep(examSidebarTarget, examSidebarRep),
  formulaGutter: applyRep(formulaGutterTarget, formulaGutterRep),
  formulaSidebar: applyRep(formulaSidebarTarget, formulaSidebarRep),
  theoryGutter: applyRep(theoryGutterTarget, theoryGutterRep),
  theorySidebar: applyRep(theorySidebarTarget, theorySidebarRep),
  answersheetGutter: applyRep(answersheetGutterTarget, answersheetGutterRep),
  answersheetSidebar: applyRep(answersheetSidebarTarget, answersheetSidebarRep)
};

console.log('Replacement results:', results);

// Check if all replacements succeeded
const allSucceeded = Object.values(results).every(v => v === true);

if (allSucceeded) {
  // Convert back to original newline format
  fs.writeFileSync(filePath, normContent.replace(/\n/g, newline), 'utf8');
  console.log('Successfully applied resizing functionality to all 5 modals!');
} else {
  console.error('One or more replacements failed to find the target code.');
  process.exit(1);
}
