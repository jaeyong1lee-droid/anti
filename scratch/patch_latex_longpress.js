const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/App.jsx');
let code = fs.readFileSync(filePath, 'utf8');

// Replacement 1: Re-enable startPress, endPress, cancelPress and add triggerFormulaPopup in LatexRenderer
const target1 = `  const pressTimer = useRef(null);
  const isLongPress = useRef(false);

  const startPress = (e) => {
    // "이 공식을 퀴즈에 추가" 기능 삭제에 따라 롱프레스 비활성화
  };

  const endPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };`;

const target1LF = target1.replace(/\r\n/g, '\n');

const replacement1 = `  const pressTimer = useRef(null);
  const pressTarget = useRef(null);

  const startPress = (e) => {
    // Find the nearest katex formula wrapper
    const katexEl = e.target.closest('.katex, .katex-display');
    if (!katexEl) return;
    
    pressTarget.current = katexEl;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    
    pressTimer.current = setTimeout(() => {
      if (pressTarget.current) {
        triggerFormulaPopup();
      }
      pressTarget.current = null;
    }, 600); // 600ms long press threshold
  };

  const endPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressTarget.current = null;
  };

  const triggerFormulaPopup = () => {
    const el = pressTarget.current;
    if (!el) return;
    
    const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
    if (!annotation) return;
    
    const mathTex = annotation.textContent || annotation.innerText;
    if (!mathTex) return;
    
    const cleanMath = mathTex.trim();
    if (window.confirm(\`[\${cleanMath}] 공식을 필수공식 리스트에 추가하시겠습니까?\`)) {
      if (typeof window.__handleAddSpecificFormula === 'function') {
        window.__handleAddSpecificFormula(cleanMath, text);
      } else if (typeof onAddFormula === 'function') {
        onAddFormula(cleanMath);
      }
    }
  };`;

let idx1 = code.indexOf(target1);
let len1 = target1.length;

if (idx1 === -1) {
  idx1 = code.indexOf(target1LF);
  len1 = target1LF.length;
}

if (idx1 === -1) {
  console.error("Error: Could not find target1 block in App.jsx");
  process.exit(1);
}

code = code.substring(0, idx1) + replacement1 + code.substring(idx1 + len1);

// Replacement 2: Register window.__handleAddSpecificFormula after handleAddSpecificFormula definition
const target2 = `  // 필수공식 개별 리프레쉬 (AI 분석 재요청 및 갱신)
  const handleRefreshFormula = (idx) => {`;

const target2LF = target2.replace(/\r\n/g, '\n');

const replacement2 = `  window.__handleAddSpecificFormula = handleAddSpecificFormula;

  // 필수공식 개별 리프레쉬 (AI 분석 재요청 및 갱신)
  const handleRefreshFormula = (idx) => {`;

let idx2 = code.indexOf(target2);
let len2 = target2.length;

if (idx2 === -1) {
  idx2 = code.indexOf(target2LF);
  len2 = target2LF.length;
}

if (idx2 === -1) {
  console.error("Error: Could not find target2 block in App.jsx");
  process.exit(1);
}

code = code.substring(0, idx2) + replacement2 + code.substring(idx2 + len2);

fs.writeFileSync(filePath, code, 'utf8');
console.log("Successfully patched App.jsx for LaTeX formula long-press popup");
