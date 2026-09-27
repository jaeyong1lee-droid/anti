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
console.log(`[AST Scope & Hook Integrity] 검사 대상 파일 수: ${files.length}개 (client/src 하위 모든 .js, .jsx)`);

let totalErrors = 0;
const scopeErrorsByFile = new Map();
const hookErrorsByFile = new Map();

const hookPattern = /^use[A-Z0-9]/;

function getHookCalleeName(calleeNode) {
  if (calleeNode.type === 'Identifier' && hookPattern.test(calleeNode.name)) {
    return calleeNode.name;
  }
  if (calleeNode.type === 'MemberExpression' && calleeNode.property && calleeNode.property.type === 'Identifier') {
    if (calleeNode.object && calleeNode.object.type === 'Identifier' && calleeNode.object.name === 'React' && hookPattern.test(calleeNode.property.name)) {
      return `React.${calleeNode.property.name}`;
    }
  }
  return null;
}

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

  // 1. 미선언 식별자 검증 (ReferenceError 방지)
  const undeclared = new Map();

  // 2. React Hooks 규칙 검증 (Minified React Error #300/#310 방지)
  const hookViolations = [];

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
    },

    CallExpression(p) {
      const hookName = getHookCalleeName(p.node.callee);
      if (!hookName) return;

      // Rule A: 조건문, 반복문, 중첩 함수 내부 훅 호출 금지
      let parent = p.parentPath;
      let badContext = null;
      let funcDepth = 0;
      while (parent) {
        const type = parent.node.type;
        if (type === 'IfStatement') { badContext = 'IfStatement (조건문 내부)'; break; }
        if (type === 'ConditionalExpression') { badContext = 'ConditionalExpression (삼항연산자 내부)'; break; }
        if (type === 'LogicalExpression') { badContext = 'LogicalExpression (&&, || 단축평가 내부)'; break; }
        if (['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'].includes(type)) {
          badContext = `${type} (반복문 내부)`;
          break;
        }
        if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(type)) {
          funcDepth++;
          if (funcDepth > 1) {
            badContext = 'NestedFunction (중첩 함수 내부)';
            break;
          }
        }
        parent = parent.parentPath;
      }

      if (badContext) {
        const loc = p.node.loc?.start;
        hookViolations.push({
          line: loc ? loc.line : 'unknown',
          col: loc ? loc.column : 'unknown',
          hookName,
          reason: `React Rules of Hooks 위반: ${badContext}에서 호출됨`
        });
      }
    },

    'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression'(funcPath) {
      const body = funcPath.node.body;
      if (!body || body.type !== 'BlockStatement') return;

      // Rule B: 조기 반환(early return) 이후 훅 호출 금지
      for (let i = 0; i < body.body.length; i++) {
        const stmt = body.body[i];
        let hasEarlyReturn = false;
        let earlyReturnLine = stmt.loc?.start.line || 'unknown';

        if (stmt.type === 'ReturnStatement' && i < body.body.length - 1) {
          hasEarlyReturn = true;
        } else if (stmt.type === 'IfStatement') {
          // If statement contains a return statement in its consequent
          const consequent = stmt.consequent;
          if (consequent.type === 'ReturnStatement' || 
              (consequent.type === 'BlockStatement' && consequent.body.some(s => s.type === 'ReturnStatement'))) {
            hasEarlyReturn = true;
          }
        }

        if (hasEarlyReturn) {
          // Inspect all subsequent statements in this function body for hooks
          for (let j = i + 1; j < body.body.length; j++) {
            const nextStmt = body.body[j];
            traverse(nextStmt, {
              CallExpression(innerP) {
                const hookName = getHookCalleeName(innerP.node.callee);
                if (hookName) {
                  const loc = innerP.node.loc?.start;
                  hookViolations.push({
                    line: loc ? loc.line : 'unknown',
                    col: loc ? loc.column : 'unknown',
                    hookName,
                    reason: `React Rules of Hooks 위반: 조기 반환(Line ${earlyReturnLine}) 이후 호출됨 (React Error #300/#310 위험)`
                  });
                }
              }
            }, funcPath.scope, funcPath);
          }
        }
      }
    }
  });

  if (undeclared.size > 0) {
    scopeErrorsByFile.set(relativePath, { undeclared, lines });
    totalErrors += undeclared.size;
  }

  if (hookViolations.length > 0) {
    // Deduplicate violations by line + hookName
    const deduped = [];
    const seen = new Set();
    hookViolations.forEach(v => {
      const k = `${v.line}:${v.hookName}:${v.reason}`;
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push(v);
      }
    });
    hookErrorsByFile.set(relativePath, { violations: deduped, lines });
    totalErrors += deduped.length;
  }
}

console.log(`\n==================================================`);
console.log(`[AST Scope & Hook Integrity] 프론트엔드 전수 정적 스코프 & 훅 규칙 검증 결과`);
console.log(`==================================================`);

if (totalErrors === 0) {
  console.log(`✅ 전수 무결성 검증 100% 통과: 총 ${files.length}개 파일에서`);
  console.log(`   - 미선언 식별자(ReferenceError 위험): 0건`);
  console.log(`   - React Rules of Hooks 위반(조건부/반복문/조기반환 후 훅 호출): 0건`);
  console.log(`모든 컴포넌트, 상태(State), 함수, 훅이 React 공식 철칙을 완벽히 준수하고 있습니다.\n`);
  process.exit(0);
} else {
  console.error(`❌ 전수 무결성 검증 실패: 총 ${totalErrors}개의 잠재적 런타임 결함 발견!\n`);

  if (scopeErrorsByFile.size > 0) {
    console.error(`--- [1] 미선언 식별자 (ReferenceError 위험) ---`);
    for (const [file, { undeclared, lines }] of scopeErrorsByFile.entries()) {
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
  }

  if (hookErrorsByFile.size > 0) {
    console.error(`--- [2] React Rules of Hooks 위반 (React Error #300/#310 위험) ---`);
    for (const [file, { violations, lines }] of hookErrorsByFile.entries()) {
      console.error(`📁 파일: ${file}`);
      for (const { line, col, hookName, reason } of violations) {
        console.error(`   🔴 훅 규칙 위반: "${hookName}" (Line ${line}:${col})`);
        console.error(`      원인: ${reason}`);
        const snippet = lines[line - 1] ? lines[line - 1].trim() : '';
        console.error(`      코드: ${snippet}`);
      }
      console.error(``);
    }
  }

  console.error(`위 결함들은 런타임에서 화면을 깨뜨리거나 기능 먹통을 초래합니다.`);
  console.error(`수정 후 다시 검증을 진행하십시오.\n`);
  process.exit(1);
}
