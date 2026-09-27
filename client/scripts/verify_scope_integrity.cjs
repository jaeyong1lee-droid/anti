const fs = require('fs');
const path = require('path');

// Resolve @babel/parser and @babel/traverse from client/node_modules
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const srcDir = path.resolve(__dirname, '../src');

// Standard ECMAScript + Web Browser + Web APIs + Build definitions
const GLOBALS_ALLOWLIST = new Set([
  // Browser window/document/DOM
  'window', 'document', 'navigator', 'location', 'history', 'screen',
  'localStorage', 'sessionStorage', 'console', 'fetch', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
  'performance', 'crypto', 'alert', 'confirm', 'prompt',
  'DOMParser', 'CSS', 'Highlight',

  // ECMAScript built-ins
  'Date', 'Math', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'String', 'Number', 'Boolean', 'Array', 'Object', 'Function', 'Symbol', 'BigInt',
  'Set', 'Map', 'WeakSet', 'WeakMap', 'RegExp', 'Error', 'TypeError', 'RangeError',
  'Promise', 'Infinity', 'NaN', 'undefined', 'globalThis', 'self', 'Intl',

  // Web APIs
  'AbortController', 'AbortSignal', 'Headers', 'Request', 'Response',
  'FormData', 'Blob', 'File', 'FileReader', 'URL', 'URLSearchParams',
  'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'TouchEvent', 'UIEvent', 'FocusEvent',
  'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node',
  'Image', 'Audio', 'AudioContext', 'webkitAudioContext',
  'btoa', 'atob', 'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
  'SpeechSynthesisUtterance', 'speechSynthesis',
  'IntersectionObserver', 'ResizeObserver', 'MutationObserver',
  'caches', 'Cache', 'CacheStorage', 'indexedDB', 'Notification', 'ClipboardItem',
  'process',

  // CDN script tags / Injected globals
  'katex', 'renderMathInElement', 'pdfjsLib',

  // Vite compile-time defines
  '__BUILD_TIME_MS__', '__BUILD_TIME_STR__'
]);

function getSourceFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getSourceFiles(fullPath));
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = getSourceFiles(srcDir);
console.log(`[AST Scope Integrity] 검사 대상 파일 수: ${files.length}개 (client/src 하위 모든 .js, .jsx)`);

let totalErrors = 0;
const resultsByFile = new Map();

for (const filePath of files) {
  const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
  const code = fs.readFileSync(filePath, 'utf8');
  const lines = code.split('\n');

  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx']
    });
  } catch (err) {
    console.error(`❌ [구문 오류 (SyntaxError)]: ${relativePath} 파싱 실패:`, err.message);
    totalErrors++;
    continue;
  }

  const undeclared = new Map();

  traverse(ast, {
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (GLOBALS_ALLOWLIST.has(name)) return;

      // Check if bound in any lexical or function scope
      if (!p.scope.hasBinding(name)) {
        const loc = p.node.loc?.start;
        const line = loc ? loc.line : 'unknown';
        const col = loc ? loc.column : 'unknown';
        if (!undeclared.has(name)) {
          undeclared.set(name, []);
        }
        undeclared.get(name).push({ line, col });
      }
    }
  });

  if (undeclared.size > 0) {
    resultsByFile.set(relativePath, { undeclared, lines });
    totalErrors += undeclared.size;
  }
}

console.log(`\n==================================================`);
console.log(`[AST Scope Integrity] 프론트엔드 전수 정적 스코프 검증 결과`);
console.log(`==================================================`);

if (totalErrors === 0) {
  console.log(`✅ 전수 무결성 검증 통과: 총 ${files.length}개 파일에서 미선언 식별자(ReferenceError 위험) 0건!`);
  console.log(`모든 컴포넌트, 상태(State), 함수, 이벤트 핸들러가 정상적으로 스코프 내에 바인딩되어 있습니다.\n`);
  process.exit(0);
} else {
  console.error(`❌ 전수 무결성 검증 실패: 총 ${totalErrors}종류의 잠재적 ReferenceError 결함 발견!\n`);
  for (const [file, { undeclared, lines }] of resultsByFile.entries()) {
    console.error(`📁 파일: ${file}`);
    for (const [name, occurrences] of undeclared.entries()) {
      console.error(`   🔴 미선언 식별자: "${name}" (${occurrences.length}회)`);
      occurrences.forEach(({ line, col }) => {
        const snippet = lines[line - 1] ? lines[line - 1].trim() : '';
        console.error(`      - Line ${line}:${col} -> ${snippet}`);
      });
    }
    console.error(``);
  }
  console.error(`위 식별자들은 런타임에서 ReferenceError를 유발하여 화면을 깨뜨리거나 기능 먹통을 초래합니다.`);
  console.error(`수정 후 다시 검증을 진행하십시오.\n`);
  process.exit(1);
}
