import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import { PopoutWindow } from './PopoutWindow';

function computeParenthesisPairs(str) {
  if (!str) return {};
  
  // 1. 여는 괄호와 닫는 괄호 개수 차이를 계산하여 부족한 만큼 임시 닫는 괄호를 뒤에 채워줌
  let openCount = 0;
  let closeCount = 0;
  for (let idx = 0; idx < str.length; idx++) {
    if (str[idx] === '(') openCount++;
    else if (str[idx] === ')') closeCount++;
  }
  let paddedStr = str;
  if (openCount > closeCount) {
    paddedStr += ')'.repeat(openCount - closeCount);
  }

  // 2. 패딩된 문자열을 기준으로 괄호 쌍을 생성
  const parentMap = {};
  const stack = [];
  const rightCloseCount = new Array(paddedStr.length + 1).fill(0);
  let count = 0;
  for (let j = paddedStr.length - 1; j >= 0; j--) {
    if (paddedStr[j] === ')') count++;
    rightCloseCount[j] = count;
  }
  for (let i = 0; i < paddedStr.length; i++) {
    if (paddedStr[i] === '(') {
      stack.push(i);
      while (stack.length > rightCloseCount[i]) {
        stack.shift();
      }
    } else if (paddedStr[i] === ')') {
      if (stack.length > 0) {
        const openIdx = stack.pop();
        parentMap[openIdx] = i;
        parentMap[i] = openIdx;
      }
    }
  }
  return parentMap;
}

function parseFormula(str) {
  const parentMap = computeParenthesisPairs(str);
  let i = 0;
  
  function parseExpr() {
    let nodes = [];
    while (i < str.length) {
      if (str.startsWith('frac(', i)) {
        const startIdx = i;
        const openIdx = i + 4;
        let closeIdx = parentMap[openIdx];
        if (closeIdx === undefined) {
          nodes.push({ type: 'text', content: 'frac(', startIdx: i, endIdx: i + 5 });
          i += 5;
          continue;
        }
        
        // Hijack check: if outer closing parenthesis was padded but the real string
        // ends with a ')' that got hijacked by a nested unmatched '('
        if (closeIdx >= str.length && str[str.length - 1] === ')') {
          const hijackedIdx = str.length - 1;
          const mappedOpen = parentMap[hijackedIdx];
          if (mappedOpen !== undefined && mappedOpen > openIdx) {
            closeIdx = hijackedIdx;
          }
        }
        
        // Find comma using minimum parenthesis level
        let level = 0;
        let minLevel = Infinity;
        let commaIdx = -1;
        for (let j = openIdx + 1; j < closeIdx; j++) {
          if (str[j] === '(') level++;
          else if (str[j] === ')') level--;
          else if (str[j] === ',') {
            if (level < minLevel) {
              minLevel = level;
              commaIdx = j;
            }
          }
        }
        
        if (commaIdx === -1) {
          nodes.push({ type: 'text', content: str.substring(i, Math.min(closeIdx + 1, str.length)), startIdx: i, endIdx: Math.min(closeIdx + 1, str.length) });
          i = closeIdx + 1;
          continue;
        }
        
        const numStartIdx = openIdx + 1;
        const numEndIdx = commaIdx;
        const denStartIdx = commaIdx + 1;
        const denEndIdx = Math.min(closeIdx, str.length);
        
        nodes.push({
          type: 'fraction',
          numStartIdx,
          numEndIdx,
          denStartIdx,
          denEndIdx,
          numStr: str.substring(numStartIdx, numEndIdx),
          denStr: str.substring(denStartIdx, denEndIdx),
          startIdx,
          endIdx: Math.min(closeIdx + 1, str.length)
        });
        i = closeIdx + 1;
      } else if (str.startsWith('^(', i)) {
        const startIdx = i;
        const openIdx = i + 1;
        const closeIdx = parentMap[openIdx];
        if (closeIdx === undefined) {
          nodes.push({ type: 'text', content: '^(', startIdx: i, endIdx: i + 2 });
          i += 2;
          continue;
        }
        const expStartIdx = openIdx + 1;
        const expEndIdx = closeIdx;
        nodes.push({
          type: 'exponent',
          expStartIdx,
          expEndIdx,
          expStr: str.substring(expStartIdx, expEndIdx),
          startIdx,
          endIdx: closeIdx + 1
        });
        i = closeIdx + 1;
      } else if (str.startsWith('sqrt(', i)) {
        const startIdx = i;
        const openIdx = i + 4;
        const closeIdx = parentMap[openIdx];
        if (closeIdx === undefined) {
          nodes.push({ type: 'text', content: 'sqrt(', startIdx: i, endIdx: i + 5 });
          i += 5;
          continue;
        }
        const sqrtStartIdx = openIdx + 1;
        const sqrtEndIdx = closeIdx;
        nodes.push({
          type: 'sqrt',
          sqrtStartIdx,
          sqrtEndIdx,
          sqrtStr: str.substring(sqrtStartIdx, sqrtEndIdx),
          startIdx,
          endIdx: closeIdx + 1
        });
        i = closeIdx + 1;
      } else if (str.startsWith('_(', i)) {
        const startIdx = i;
        const openIdx = i + 1;
        const closeIdx = parentMap[openIdx];
        if (closeIdx === undefined) {
          nodes.push({ type: 'text', content: '_(', startIdx: i, endIdx: i + 2 });
          i += 2;
          continue;
        }
        const subStartIdx = openIdx + 1;
        const subEndIdx = closeIdx;
        nodes.push({
          type: 'subscript',
          subStartIdx,
          subEndIdx,
          subStr: str.substring(subStartIdx, subEndIdx),
          startIdx,
          endIdx: closeIdx + 1
        });
        i = closeIdx + 1;
      } else if (str[i] === '_') {
        const startIdx = i;
        i++;
        let subContentStart = i;
        const varCharRegex = /[a-zA-Z\u0370-\u03ff0-9]/;
        while (i < str.length && varCharRegex.test(str[i])) {
          i++;
        }
        const subContentEnd = i;
        nodes.push({
          type: 'subscript',
          subStartIdx: subContentStart,
          subEndIdx: subContentEnd,
          subStr: str.substring(subContentStart, subContentEnd),
          startIdx,
          endIdx: subContentEnd
        });
      } else {
        let start = i;
        while (i < str.length && 
               !str.startsWith('frac(', i) && 
               !str.startsWith('^(', i) && 
               !str.startsWith('sqrt(', i) && 
               !str.startsWith('_(', i) && 
               str[i] !== '_') {
          i++;
        }
        nodes.push({
          type: 'text',
          content: str.substring(start, i),
          startIdx: start,
          endIdx: i
        });
      }
    }
    return nodes;
  }
  return parseExpr();
}

export function ScientificCalculator() {
  const [calcInput, setCalcInput] = useState(() => localStorage.getItem('anti_calc_input') || '');
  const [calcResult, setCalcResult] = useState(() => localStorage.getItem('anti_calc_result') || '');
  const [calcAngleMode, setCalcAngleMode] = useState(() => localStorage.getItem('anti_calc_angle_mode') || 'deg'); // deg / rad
  const [lastAns, setLastAns] = useState(() => localStorage.getItem('anti_calc_last_ans') || '');

  const [customAlphabetButtons, setCustomAlphabetButtons] = useState(() => {
    const saved = localStorage.getItem('anti_calc_custom_alphabet');
    return saved ? JSON.parse(saved) : Array(10).fill('');
  });

  const [customGreekButtons, setCustomGreekButtons] = useState(() => {
    const saved = localStorage.getItem('anti_calc_custom_greek');
    return saved ? JSON.parse(saved) : Array(10).fill('');
  });
  const [shiftActive, setShiftActive] = useState(false);
  const [alphaActive, setAlphaActive] = useState(false);
  const [hypActive, setHypActive] = useState(false);
  const [isOn, setIsOn] = useState(true);
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('anti_calc_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [historyIndex, setHistoryIndex] = useState(() => {
    const saved = localStorage.getItem('anti_calc_history_index');
    return saved !== null ? parseInt(saved, 10) : -1;
  });
  const [variables, setVariables] = useState(() => {
    const initial = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0, Y: 0, M: 0 };
    'abcdefghijklmnopqrstuvwxyz'.split('').forEach(char => {
      initial[char] = 0;
    });
    const greekLetters = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω', 'Δ', 'Σ', 'Φ', 'Ω'];
    greekLetters.forEach(char => {
      initial[char] = 0;
    });

    const saved = localStorage.getItem('anti_calc_variables');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...initial, ...parsed };
      } catch (e) {}
    }
    return initial;
  });
  const [isStoring, setIsStoring] = useState(false);
  const [isRecalling, setIsRecalling] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [displaySdMode, setDisplaySdMode] = useState(() => localStorage.getItem('anti_calc_sd_mode') || 'decimal'); // both, decimal, fraction
  const [cursorPosition, setCursorPosition] = useState(() => {
    const saved = localStorage.getItem('anti_calc_cursor_pos');
    return saved !== null ? parseInt(saved, 10) : 0;
  });

  useEffect(() => {
    localStorage.setItem('anti_calc_input', calcInput);
  }, [calcInput]);

  useEffect(() => {
    localStorage.setItem('anti_calc_result', calcResult);
  }, [calcResult]);

  useEffect(() => {
    localStorage.setItem('anti_calc_angle_mode', calcAngleMode);
  }, [calcAngleMode]);

  useEffect(() => {
    localStorage.setItem('anti_calc_last_ans', lastAns);
  }, [lastAns]);

  useEffect(() => {
    localStorage.setItem('anti_calc_variables', JSON.stringify(variables));
  }, [variables]);

  useEffect(() => {
    localStorage.setItem('anti_calc_sd_mode', displaySdMode);
  }, [displaySdMode]);

  useEffect(() => {
    localStorage.setItem('anti_calc_cursor_pos', cursorPosition.toString());
  }, [cursorPosition]);

  useEffect(() => {
    localStorage.setItem('anti_calc_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('anti_calc_history_index', historyIndex.toString());
  }, [historyIndex]);

  const inputRef = useRef(null);

  const appendToInput = (val) => {
    if (!isOn) return;
    insertAtCursor(val);
  };

  const isOperatorString = (val) => {
    const operators = ['+', '-', '×', '÷', '^', '*', '/', '%', '!', '°'];
    if (!val) return false;
    if (val === 'Ans') return false;
    return operators.some(op => val.startsWith(op));
  };

  const insertAtCursor = (val) => {
    let start = cursorPosition;
    let text = calcInput;
    
    if (calcResult) {
      setCalcResult('');
      if (isOperatorString(val)) {
        text = 'Ans';
        start = 3;
      } else {
        text = '';
        start = 0;
      }
      setHistoryIndex(-1);
    } else {
      setStatusMessage('');
    }
    
    if (val === '.') {
      const before = text.substring(0, start);
      if (start === 0 || !/\d/.test(before[before.length - 1])) {
        val = '0.';
      }
    }
    
    const before = text.substring(0, start);
    const after = text.substring(start);
    const newText = before + val + after;
    
    const formattedText = newText.replace(/(?<!\d)\./g, '0.');
    setCalcInput(formattedText);
    
    const addedLen = formattedText.length - newText.length;
    let newCursorPos = start + val.length + addedLen;
    if (val === 'frac(,)') {
      newCursorPos = start + 5;
    } else if (val === 'sqrt()') {
      newCursorPos = start + 5;
    } else if (val === '^()') {
      newCursorPos = start + 2;
    } else if (val === '10^()') {
      newCursorPos = start + 4;
    } else if (val === 'e^()') {
      newCursorPos = start + 3;
    } else if (val === '*10^()') {
      newCursorPos = start + 5;
    } else if (val === '^(1/)') {
      newCursorPos = start + 4;
    }
    setCursorPosition(newCursorPos);
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  };

  const handleClear = () => {
    setCalcInput('');
    setCalcResult('');
    setStatusMessage('');
    setShiftActive(false);
    setAlphaActive(false);
    setHypActive(false);
    setIsStoring(false);
    setIsRecalling(false);
    setCursorPosition(0);
  };

  const handleCopyFormula = () => {
    if (!calcInput) {
      setStatusMessage('Empty Formula');
      // Clear message after 1.5 seconds
      setTimeout(() => {
        setStatusMessage('');
      }, 1500);
      return;
    }

    const childDoc = inputRef.current ? inputRef.current.ownerDocument : document;
    const childWindow = childDoc.defaultView || window;

    // Helper to copy using legacy textarea method on the child document
    const fallbackCopy = (text) => {
      try {
        const textarea = childDoc.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '2em';
        textarea.style.height = '2em';
        textarea.style.padding = '0';
        textarea.style.border = 'none';
        textarea.style.outline = 'none';
        textarea.style.boxShadow = 'none';
        textarea.style.background = 'transparent';
        childDoc.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = childDoc.execCommand('copy');
        childDoc.body.removeChild(textarea);
        if (successful) {
          setStatusMessage('Copied!');
        } else {
          setStatusMessage('Copy Failed');
        }
      } catch (err) {
        console.error('Fallback copy failed:', err);
        setStatusMessage('Copy Failed');
      }
      setTimeout(() => {
        setStatusMessage('');
      }, 1500);
    };

    if (childWindow.navigator && childWindow.navigator.clipboard && typeof childWindow.navigator.clipboard.writeText === 'function') {
      childWindow.navigator.clipboard.writeText(calcInput)
        .then(() => {
          setStatusMessage('Copied!');
          // Clear message after 1.5 seconds
          setTimeout(() => {
            setStatusMessage('');
          }, 1500);
        })
        .catch((err) => {
          console.warn('Child clipboard API failed, using fallback:', err);
          fallbackCopy(calcInput);
        });
    } else {
      fallbackCopy(calcInput);
    }
  };

  // Handle custom button single/double click
  const clickTimeoutRef = useRef({});
  const handleCustomButtonClick = (type, index, val) => {
    const key = `${type}-${index}`;
    if (clickTimeoutRef.current[key]) {
      // Double click detected!
      clearTimeout(clickTimeoutRef.current[key]);
      delete clickTimeoutRef.current[key];
      handleDoubleClickCustomButton(type, index, val);
    } else {
      clickTimeoutRef.current[key] = setTimeout(() => {
        delete clickTimeoutRef.current[key];
        if (val) {
          insertAtCursor(val);
        } else {
          setStatusMessage('Double-click to edit');
          setTimeout(() => setStatusMessage(''), 1500);
        }
      }, 250);
    }
  };

  const handleDoubleClickCustomButton = (type, index, currentVal) => {
    const newVal = prompt("버튼에 등록할 문자나 수식을 입력하세요 (예: e_max, G_s):", currentVal);
    if (newVal !== null) {
      if (type === 'alphabet') {
        setCustomAlphabetButtons(prev => {
          const updated = [...prev];
          updated[index] = newVal.trim();
          localStorage.setItem('anti_calc_custom_alphabet', JSON.stringify(updated));
          return updated;
        });
      } else {
        setCustomGreekButtons(prev => {
          const updated = [...prev];
          updated[index] = newVal.trim();
          localStorage.setItem('anti_calc_custom_greek', JSON.stringify(updated));
          return updated;
        });
      }
    }
  };

  const getFractions = (currentStr) => {
    const parentMap = computeParenthesisPairs(currentStr);
    const fracs = [];
    let i = 0;
    while (i < currentStr.length) {
      if (currentStr.startsWith('frac(', i)) {
        let fracStart = i;
        const openIdx = fracStart + 4;
        const closeIdx = parentMap[openIdx];
        if (closeIdx === undefined) {
          i++;
          continue;
        }
        
        let level = 0;
        let commaIdx = -1;
        for (let j = openIdx + 1; j < closeIdx; j++) {
          if (currentStr[j] === '(') level++;
          else if (currentStr[j] === ')') level--;
          else if (currentStr[j] === ',' && level === 0) {
            commaIdx = j;
            break;
          }
        }
        
        if (commaIdx === -1) {
          i++;
          continue;
        }
        
        fracs.push({
          startIdx: fracStart,
          numStartIdx: openIdx + 1,
          numEndIdx: commaIdx,
          denStartIdx: commaIdx + 1,
          denEndIdx: closeIdx,
          endIdx: closeIdx + 1
        });
        i = closeIdx + 1;
      } else {
        i++;
      }
    }
    return fracs;
  };

  const getExponents = (currentStr) => {
    const parentMap = computeParenthesisPairs(currentStr);
    const exps = [];
    let i = 0;
    while (i < currentStr.length) {
      if (currentStr.startsWith('^(', i)) {
        let expStart = i;
        const openIdx = expStart + 1;
        const closeIdx = parentMap[openIdx];
        if (closeIdx === undefined) {
          i++;
          continue;
        }
        exps.push({
          startIdx: expStart,
          expStartIdx: openIdx + 1,
          expEndIdx: closeIdx,
          endIdx: closeIdx + 1
        });
        i = closeIdx + 1;
      } else {
        i++;
      }
    }
    return exps;
  };

  const getSqrts = (currentStr) => {
    const parentMap = computeParenthesisPairs(currentStr);
    const sqrts = [];
    let i = 0;
    while (i < currentStr.length) {
      if (currentStr.startsWith('sqrt(', i)) {
        let sqrtStart = i;
        const openIdx = sqrtStart + 4;
        const closeIdx = parentMap[openIdx];
        if (closeIdx === undefined) {
          i++;
          continue;
        }
        sqrts.push({
          startIdx: sqrtStart,
          sqrtStartIdx: openIdx + 1,
          sqrtEndIdx: closeIdx,
          endIdx: closeIdx + 1
        });
        i = closeIdx + 1;
      } else {
        i++;
      }
    }
    return sqrts;
  };

  const adjustCursorOnMove = (currentStr, newPos, direction) => {
    const fracs = getFractions(currentStr);
    for (const f of fracs) {
      if (newPos > f.startIdx && newPos < f.numStartIdx) {
        if (direction === 'right') return f.numStartIdx;
        if (direction === 'left') return f.startIdx;
      }
      if (newPos > f.numEndIdx && newPos < f.denStartIdx) {
        if (direction === 'right') return f.denStartIdx;
        if (direction === 'left') return f.numEndIdx;
      }
      if (newPos > f.denEndIdx && newPos < f.endIdx) {
        if (direction === 'right') return f.endIdx;
        if (direction === 'left') return f.denEndIdx;
      }
    }
    const exps = getExponents(currentStr);
    for (const e of exps) {
      if (newPos > e.startIdx && newPos < e.expStartIdx) {
        if (direction === 'right') return e.expStartIdx;
        if (direction === 'left') return e.startIdx;
      }
      if (newPos > e.expEndIdx && newPos < e.endIdx) {
        if (direction === 'right') return e.endIdx;
        if (direction === 'left') return e.expEndIdx;
      }
    }
    const sqrts = getSqrts(currentStr);
    for (const s of sqrts) {
      if (newPos > s.startIdx && newPos < s.sqrtStartIdx) {
        if (direction === 'right') return s.sqrtStartIdx;
        if (direction === 'left') return s.startIdx;
      }
      if (newPos > s.sqrtEndIdx && newPos < s.endIdx) {
        if (direction === 'right') return s.endIdx;
        if (direction === 'left') return s.sqrtEndIdx;
      }
    }
    return newPos;
  };

  const handleBackspace = () => {
    if (!isOn) return;
    if (calcResult) {
      setCalcResult('');
      setCursorPosition(calcInput.length);
      return;
    }
    setStatusMessage('');

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const getElementIndex = (node) => {
        let curr = node;
        while (curr && curr !== document.body) {
          if (curr.nodeType === Node.ELEMENT_NODE && curr.hasAttribute('data-index')) {
            return parseInt(curr.getAttribute('data-index'), 10);
          }
          curr = curr.parentNode;
        }
        return null;
      };
      const startIdx = getElementIndex(range.startContainer);
      const endIdx = getElementIndex(range.endContainer);
      if (startIdx !== null && endIdx !== null) {
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx) + 1;
        const before = calcInput.substring(0, minIdx);
        const after = calcInput.substring(maxIdx);
        setCalcInput(before + after);
        setCursorPosition(minIdx);
        selection.removeAllRanges();
        return;
      }
    }
    
    if (cursorPosition > 0) {
      const cur = cursorPosition;
      const fracs = getFractions(calcInput);
      let deletedFraction = false;
      for (const f of fracs) {
        const isSyntax = 
          (cur - 1 >= f.startIdx && cur - 1 < f.numStartIdx) || 
          (cur - 1 === f.numEndIdx) || 
          (cur - 1 === f.denEndIdx);
          
        if (isSyntax) {
          const before = calcInput.substring(0, f.startIdx);
          const after = calcInput.substring(f.endIdx);
          setCalcInput(before + after);
          setCursorPosition(f.startIdx);
          deletedFraction = true;
          break;
        }
      }
      if (deletedFraction) return;

      const exps = getExponents(calcInput);
      let deletedExponent = false;
      for (const e of exps) {
        const isSyntax =
          (cur - 1 >= e.startIdx && cur - 1 < e.expStartIdx) || 
          (cur - 1 === e.expEndIdx);
          
        if (isSyntax) {
          const before = calcInput.substring(0, e.startIdx);
          const after = calcInput.substring(e.endIdx);
          setCalcInput(before + after);
          setCursorPosition(e.startIdx);
          deletedExponent = true;
          break;
        }
      }
      if (deletedExponent) return;

      const sqrts = getSqrts(calcInput);
      let deletedSqrt = false;
      for (const s of sqrts) {
        const isSyntax =
          (cur - 1 >= s.startIdx && cur - 1 < s.sqrtStartIdx) || 
          (cur - 1 === s.sqrtEndIdx);
          
        if (isSyntax) {
          const before = calcInput.substring(0, s.startIdx);
          const after = calcInput.substring(s.endIdx);
          setCalcInput(before + after);
          setCursorPosition(s.startIdx);
          deletedSqrt = true;
          break;
        }
      }
      if (deletedSqrt) return;
      
      const before = calcInput.substring(0, cur - 1);
      const after = calcInput.substring(cur);
      setCalcInput(before + after);
      setCursorPosition(cur - 1);
    }
  };

  const moveCursor = (direction) => {
    if (!isOn || !inputRef.current) return;
    let newPos = cursorPosition;
    if (direction === 'left') {
      newPos = Math.max(0, cursorPosition - 1);
    } else if (direction === 'right') {
      newPos = Math.min(calcInput.length, cursorPosition + 1);
    }
    newPos = adjustCursorOnMove(calcInput, newPos, direction);
    setCursorPosition(newPos);
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  const handleDpad = (direction) => {
    if (!isOn) return;
    if (direction === 'up' || direction === 'down') {
      const fracs = getFractions(calcInput);
      for (const f of fracs) {
        if (direction === 'down' && cursorPosition >= f.numStartIdx && cursorPosition <= f.numEndIdx) {
          setCursorPosition(f.denStartIdx);
          return;
        }
        if (direction === 'up' && cursorPosition >= f.denStartIdx && cursorPosition <= f.denEndIdx) {
          setCursorPosition(f.numEndIdx);
          return;
        }
      }
      
      const exps = getExponents(calcInput);
      for (const e of exps) {
        if (direction === 'down' && cursorPosition >= e.expStartIdx && cursorPosition <= e.expEndIdx) {
          setCursorPosition(e.endIdx);
          return;
        }
        if (direction === 'up' && cursorPosition === e.startIdx) {
          setCursorPosition(e.expStartIdx);
          return;
        }
      }
      
      if (fracs.length > 0) {
        let closestFrac = fracs[0];
        let minDistance = Math.min(
          Math.abs(cursorPosition - fracs[0].numStartIdx),
          Math.abs(cursorPosition - fracs[0].denStartIdx)
        );
        for (const f of fracs) {
          const distNum = Math.abs(cursorPosition - f.numStartIdx);
          const distDen = Math.abs(cursorPosition - f.denStartIdx);
          const dist = Math.min(distNum, distDen);
          if (dist < minDistance) {
            minDistance = dist;
            closestFrac = f;
          }
        }
        if (direction === 'up') {
          setCursorPosition(closestFrac.numEndIdx);
          return;
        } else if (direction === 'down') {
          setCursorPosition(closestFrac.denStartIdx);
          return;
        }
      }

      if (calcInput === '') {
        if (direction === 'up') {
          if (history.length > 0) {
            const nextIndex = Math.min(historyIndex + 1, history.length - 1);
            setHistoryIndex(nextIndex);
            const histVal = history[history.length - 1 - nextIndex];
            setCalcInput(histVal);
            setCursorPosition(histVal.length);
            setCalcResult('');
          }
        } else if (direction === 'down') {
          if (historyIndex > 0) {
            const nextIndex = historyIndex - 1;
            setHistoryIndex(nextIndex);
            const histVal = history[history.length - 1 - nextIndex];
            setCalcInput(histVal);
            setCursorPosition(histVal.length);
            setCalcResult('');
          } else if (historyIndex === 0) {
            setHistoryIndex(-1);
            setCalcInput('');
            setCursorPosition(0);
            setCalcResult('');
          }
        }
      }
    } else if (direction === 'left' || direction === 'right') {
      if (calcResult) {
        setCalcResult('');
        const pos = direction === 'left' ? calcInput.length : 0;
        setCursorPosition(pos);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.setSelectionRange(pos, pos);
          }
        }, 10);
        return;
      }
      moveCursor(direction);
    }
  };

  function decimalToFraction(val, maxDenominator = 100000) {
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return null;
    let x = val;
    let sign = Math.sign(x);
    x = Math.abs(x);
    
    if (x < 1e-9) return { numerator: 0, denominator: 1 };
    if (Number.isInteger(x)) return { numerator: sign * x, denominator: 1 };
    
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
    let b = Math.floor(x);
    let h = b;
    let k = 1;
    
    let limit = 0;
    while (x - b > 1e-11 && limit < 15) {
      let aux = h1;
      h1 = b * h1 + h2;
      h2 = aux;
      
      aux = k1;
      k1 = b * k1 + k2;
      k2 = aux;
      
      x = 1 / (x - b);
      b = Math.floor(x);
      
      let nextH = b * h1 + h2;
      let nextK = b * k1 + k2;
      if (nextK > maxDenominator) break;
      h = nextH;
      k = nextK;
      limit++;
    }
    
    const approx = h / k;
    if (Math.abs(approx - Math.abs(val)) < 1e-6) {
      return { numerator: sign * h, denominator: k };
    }
    return null;
  }

  const resolveFractions = (expr) => {
    let processed = expr;
    while (processed.includes('frac(')) {
      const idx = processed.indexOf('frac(');
      const parentMap = computeParenthesisPairs(processed);
      const openIdx = idx + 4;
      const endIdx = parentMap[openIdx];
      if (endIdx === undefined) break;
      
      const content = processed.substring(openIdx + 1, endIdx);
      const args = [];
      let currentArg = '';
      let level = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '(') level++;
        else if (char === ')') level--;
        
        if (char === ',' && level === 0) {
          args.push(currentArg);
          currentArg = '';
        } else {
          currentArg += char;
        }
      }
      args.push(currentArg);
      
      if (args.length === 2) {
        let resolvedNum = resolveFractions(args[0]);
        let resolvedDen = resolveFractions(args[1]);
        if (!resolvedNum.trim()) resolvedNum = '0';
        if (!resolvedDen.trim()) resolvedDen = '1';
        const replacement = `((${resolvedNum})/(${resolvedDen}))`;
        processed = processed.substring(0, idx) + replacement + processed.substring(endIdx + 1);
      } else {
        processed = processed.substring(0, idx) + 'Error' + processed.substring(endIdx + 1);
      }
    }
    return processed;
  };

  const parseIntegrationAndDerivatives = (expr) => {
    let processed = expr;
    
    while (processed.includes('∫(')) {
      const idx = processed.indexOf('∫(');
      let parenCount = 1;
      let endIdx = -1;
      for (let i = idx + 2; i < processed.length; i++) {
        if (processed[i] === '(') parenCount++;
        else if (processed[i] === ')') parenCount--;
        if (parenCount === 0) {
          endIdx = i;
          break;
        }
      }
      if (endIdx === -1) break;
      
      const content = processed.substring(idx + 2, endIdx);
      const args = [];
      let currentArg = '';
      let level = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '(') level++;
        else if (char === ')') level--;
        
        if (char === ',' && level === 0) {
          args.push(currentArg);
          currentArg = '';
        } else {
          currentArg += char;
        }
      }
      args.push(currentArg);
      
      if (args.length === 3) {
        const funcStr = args[0];
        const aVal = evaluateExpr(args[1], calcAngleMode, true);
        const bVal = evaluateExpr(args[2], calcAngleMode, true);
        
        if (aVal === 'Error' || bVal === 'Error') {
          return 'Error';
        }
        
        const a = parseFloat(aVal);
        const b = parseFloat(bVal);
        
        const N = 500;
        const h = (b - a) / N;
        let sum = 0;
        let hasError = false;
        
        const f = (xVal) => {
          let subbed = funcStr.replace(/\bX\b/g, `(${xVal})`);
          const res = evaluateExpr(subbed, calcAngleMode, true);
          if (res === 'Error') {
            hasError = true;
            return 0;
          }
          return parseFloat(res);
        };
        
        sum += 0.5 * (f(a) + f(b));
        for (let i = 1; i < N; i++) {
          sum += f(a + i * h);
          if (hasError) break;
        }
        
        if (hasError) {
          processed = processed.substring(0, idx) + 'Error' + processed.substring(endIdx + 1);
        } else {
          const finalVal = sum * h;
          processed = processed.substring(0, idx) + finalVal.toString() + processed.substring(endIdx + 1);
        }
      } else {
        processed = processed.substring(0, idx) + 'Error' + processed.substring(endIdx + 1);
      }
    }
    
    while (processed.includes('d/dx(')) {
      const idx = processed.indexOf('d/dx(');
      let parenCount = 1;
      let endIdx = -1;
      for (let i = idx + 5; i < processed.length; i++) {
        if (processed[i] === '(') parenCount++;
        else if (processed[i] === ')') parenCount--;
        if (parenCount === 0) {
          endIdx = i;
          break;
        }
      }
      if (endIdx === -1) break;
      
      const content = processed.substring(idx + 5, endIdx);
      const args = [];
      let currentArg = '';
      let level = 0;
      for (let i = 0; i < content.length; i++) {
        const textChar = content[i];
        if (textChar === '(') level++;
        else if (textChar === ')') level--;
        
        if (textChar === ',' && level === 0) {
          args.push(currentArg);
          currentArg = '';
        } else {
          currentArg += textChar;
        }
      }
      args.push(currentArg);
      
      if (args.length === 2) {
        const funcStr = args[0];
        const x0Val = evaluateExpr(args[1], calcAngleMode, true);
        if (x0Val === 'Error') return 'Error';
        
        const x0 = parseFloat(x0Val);
        const h = 1e-5;
        let hasError = false;
        
        const f = (xVal) => {
          let subbed = funcStr.replace(/\bX\b/g, `(${xVal})`);
          const res = evaluateExpr(subbed, calcAngleMode, true);
          if (res === 'Error') {
            hasError = true;
            return 0;
          }
          return parseFloat(res);
        };
        
        const df = (f(x0 + h) - f(x0 - h)) / (2 * h);
        if (hasError) {
          processed = processed.substring(0, idx) + 'Error' + processed.substring(endIdx + 1);
        } else {
          processed = processed.substring(0, idx) + df.toString() + processed.substring(endIdx + 1);
        }
      } else {
        processed = processed.substring(0, idx) + 'Error' + processed.substring(endIdx + 1);
      }
    }
    
    while (processed.includes('log(')) {
      const idx = processed.indexOf('log(');
      let parenCount = 1;
      let endIdx = -1;
      for (let i = idx + 4; i < processed.length; i++) {
        if (processed[i] === '(') parenCount++;
        else if (processed[i] === ')') parenCount--;
        if (parenCount === 0) {
          endIdx = i;
          break;
        }
      }
      if (endIdx === -1) break;
      
      const content = processed.substring(idx + 4, endIdx);
      const args = [];
      let currentArg = '';
      let level = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '(') level++;
        else if (char === ')') level--;
        
        if (char === ',' && level === 0) {
          args.push(currentArg);
          currentArg = '';
        } else {
          currentArg += char;
        }
      }
      args.push(currentArg);
      
      if (args.length === 2) {
        const valStr = evaluateExpr(args[0], calcAngleMode, true);
        const baseStr = evaluateExpr(args[1], calcAngleMode, true);
        if (valStr === 'Error' || baseStr === 'Error') return 'Error';
        const val = parseFloat(valStr);
        const base = parseFloat(baseStr);
        const logVal = Math.log(val) / Math.log(base);
        processed = processed.substring(0, idx) + logVal.toString() + processed.substring(endIdx + 1);
      } else {
        processed = processed.substring(0, idx) + 'Math.log10(' + content + ')' + processed.substring(endIdx + 1);
      }
    }

    return processed;
  };

  const solveEquation = (left, right, varName, angleMode) => {
    const evalWithVar = (val) => {
      const originalVal = variables[varName];
      variables[varName] = val;
      let res = NaN;
      try {
        const leftVal = parseFloat(evaluateExpr(left, angleMode, true));
        const rightVal = parseFloat(evaluateExpr(right, angleMode, true));
        res = leftVal - rightVal;
      } catch (e) {
        // ignore
      }
      variables[varName] = originalVal;
      return res;
    };

    const roots = [];
    const addRoot = (r) => {
      if (isNaN(r) || !isFinite(r)) return;
      if (roots.some(existing => Math.abs(existing - r) < 0.01)) return;
      roots.push(r);
    };

    const grid = [-100, -50, -20, -10, -5, -2, -1, -0.5, 0, 0.5, 1, 2, 5, 10, 20, 50, 100];
    const evals = grid.map(x => ({ x, y: evalWithVar(x) }));

    for (let i = 0; i < evals.length - 1; i++) {
      const p1 = evals[i];
      const p2 = evals[i+1];
      if (!isNaN(p1.y) && !isNaN(p2.y) && isFinite(p1.y) && isFinite(p2.y)) {
        if (p1.y * p2.y <= 0) {
          const r = runSecant(p1.x, p2.x, evalWithVar);
          if (r !== null) addRoot(r);
        }
      }
    }

    const startPairs = [
      [-1.0, 0.0],
      [0.0, 1.0],
      [-10.0, -9.0],
      [9.0, 10.0]
    ];
    for (const pair of startPairs) {
      const r = runSecant(pair[0], pair[1], evalWithVar);
      if (r !== null) addRoot(r);
    }

    if (roots.length === 0) return 'Error';

    roots.sort((a, b) => a - b);
    
    if (roots.length === 1) {
      return roots[0].toString();
    } else {
      return roots.map(r => r.toString()).join('; ');
    }
  };

  const runSecant = (x0, x1, evalWithVar) => {
    let y0 = evalWithVar(x0);
    let y1 = evalWithVar(x1);
    if (isNaN(y0) || isNaN(y1)) return null;

    const tol = 1e-7;
    const maxIter = 60;
    for (let iter = 0; iter < maxIter; iter++) {
      if (Math.abs(y1) < tol) {
        let val = parseFloat(x1.toFixed(6));
        if (Math.abs(val - Math.round(val)) < 1e-3) val = Math.round(val);
        return val;
      }
      if (Math.abs(y1 - y0) < 1e-12) {
        break;
      }
      const x2 = x1 - y1 * (x1 - x0) / (y1 - y0);
      if (isNaN(x2) || !isFinite(x2)) {
        break;
      }
      x0 = x1;
      y0 = y1;
      x1 = x2;
      y1 = evalWithVar(x1);
    }
    if (Math.abs(y1) < 1e-3) {
      let val = parseFloat(x1.toFixed(6));
      if (Math.abs(val - Math.round(val)) < 1e-3) val = Math.round(val);
      return val;
    }
    return null;
  };

  const evaluateExpr = (expr, angleMode, isInternal = false, skipStateUpdate = false) => {
    try {
      if (!expr.trim()) return '';
      
      let processedExpr = expr;
      if (!isInternal && processedExpr.trim().startsWith('=')) {
        processedExpr = processedExpr.trim().substring(1);
      }
      
      if (!processedExpr.trim()) return '';
      
      if (!isInternal && processedExpr.includes('=')) {
        const eqParts = processedExpr.split('=');
        if (eqParts.length !== 2) return 'Error';
        
        let varName = null;
        const varRegex = /[a-zA-Z\u0370-\u03ff]+(_[a-zA-Z\u0370-\u03ff0-9]+)?/g;
        const excludedNames = new Set([
          'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
          'log', 'ln', 'exp', 'sqrt', 'cbrt', 'Abs', 'Ans', 'Math', 'd', 'dx', 'd/dx', 'pi', 'e'
        ]);
        
        let match;
        // Search left side of equation first, then right side
        while ((match = varRegex.exec(eqParts[0])) !== null) {
          const name = match[0];
          if (!excludedNames.has(name) && isNaN(name)) {
            varName = name;
            break;
          }
        }
        if (!varName) {
          while ((match = varRegex.exec(eqParts[1])) !== null) {
            const name = match[0];
            if (!excludedNames.has(name) && isNaN(name)) {
              varName = name;
              break;
            }
          }
        }
        if (!varName) return 'Error';
        
        const solvedVal = solveEquation(eqParts[0], eqParts[1], varName, angleMode);
        if (solvedVal === 'Error') return 'Error';
        
        let numToStore = 0;
        if (solvedVal.includes(';')) {
          numToStore = parseFloat(solvedVal.split(';')[0]);
        } else {
          numToStore = parseFloat(solvedVal);
        }
        if (isNaN(numToStore)) numToStore = 0;
        
        if (!skipStateUpdate) {
          setVariables(prev => ({ ...prev, [varName]: numToStore }));
        }
        return solvedVal.toString();
      }
      
      let preProcessed = resolveFractions(processedExpr);
      if (preProcessed.includes('Error')) return 'Error';
      
      preProcessed = preProcessed.replace(/\^\(\s*\)/g, '^(1)');

      preProcessed = preProcessed.replace(/(\d+(\.\d+)?)\s*([a-zA-Z가-힣\u0370-\u03ff_∛\(]|sin⁻¹|cos⁻¹|tan⁻¹)/g, '$1*$3');
      preProcessed = preProcessed.replace(/([a-zA-Z\u0370-\u03ff])\s*(\d+(\.\d+)?)/g, '$1*$2');
      preProcessed = preProcessed.replace(/([a-zA-Z\u0370-\u03ff])\s*([a-zA-Z\u0370-\u03ff\(])/g, '$1*$2');
      preProcessed = preProcessed.replace(/\)\s*([\da-zA-Z가-힣\u0370-\u03ff_∛\(]|sin⁻¹|cos⁻¹|tan⁻¹)/g, ')*$1');
      
      preProcessed = preProcessed.replace(/([a-zA-Z\u0370-\u03ff\d\.\)]+)%/g, '($1*0.01)');
      
      if (!isInternal) {
        preProcessed = parseIntegrationAndDerivatives(preProcessed);
        if (preProcessed === 'Error') return 'Error';
      }
      
      const placeholders = {
        'sin⁻¹': '__ASIN__',
        'cos⁻¹': '__ACOS__',
        'tan⁻¹': '__ATAN__',
        'sin': '__SIN__',
        'cos': '__COS__',
        'tan': '__TAN__',
        'asin': '__ASIN__',
        'acos': '__ACOS__',
        'atan': '__ATAN__',
        'sinh': '__SINH__',
        'cosh': '__COSH__',
        'tanh': '__TANH__',
        'asinh': '__ASINH__',
        'acosh': '__ACOSH__',
        'atanh': '__ATANH__',
        'ln': '__LN__',
        'exp': '__EXP__',
        'sqrt': '__SQRT__',
        'cbrt': '__CBRT__',
        'Abs': '__ABS__'
      };

      let tempExpr = preProcessed;
      Object.keys(placeholders).forEach(key => {
        tempExpr = tempExpr.replaceAll(key, placeholders[key]);
      });

      // 1. Build a map of all variables to substitute (existing state variables + any newly detected ones in expression)
      const activeVars = { ...variables };
      const varRegex = /[a-zA-Z\u0370-\u03ff]+(_[a-zA-Z\u0370-\u03ff0-9]+)?/g;
      const excludedNames = new Set([
        'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
        'log', 'ln', 'exp', 'sqrt', 'cbrt', 'Abs', 'Ans', 'Math', 'd', 'dx', 'd/dx', 'pi', 'e'
      ]);
      
      let match;
      while ((match = varRegex.exec(tempExpr)) !== null) {
        const name = match[0];
        if (!excludedNames.has(name) && isNaN(name) && activeVars[name] === undefined) {
          activeVars[name] = 0;
        }
      }
      
      // 2. Sort by length descending to replace longer variable names (like γ_w) before shorter ones (like γ)
      const sortedVarKeys = Object.keys(activeVars).sort((a, b) => b.length - a.length);
      
      sortedVarKeys.forEach(v => {
        const val = activeVars[v];
        const escapedVar = v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        // Word boundary that works safely for English, Greek, numbers, and underscores
        const pattern = `(?<![a-zA-Z\\u0370-\\u03ff0-9_])${escapedVar}(?![a-zA-Z\\u0370-\\u03ff0-9_])`;
        tempExpr = tempExpr.replace(new RegExp(pattern, 'g'), `(${val})`);
      });

      Object.keys(placeholders).forEach(key => {
        tempExpr = tempExpr.replaceAll(placeholders[key], key);
      });
      
      preProcessed = tempExpr;
      
      preProcessed = preProcessed
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/π/g, 'Math.PI')
        .replace(/\be\b/g, 'Math.E')
        .replace(/sin⁻¹\(/g, 'asin(')
        .replace(/cos⁻¹\(/g, 'acos(')
        .replace(/tan⁻¹\(/g, 'atan(')
        .replace(/∛\(/g, 'cbrt(')
        .replace(/e\^\(/g, 'exp(')
        .replace(/10\^\(/g, '10^(')
        .replace(/Ans/g, `(${lastAns || '0'})`);

      if (angleMode === 'deg') {
        preProcessed = preProcessed
          .replace(/\bsin\(/g, 'Math.sin((Math.PI/180)*')
          .replace(/\bcos\(/g, 'Math.cos((Math.PI/180)*')
          .replace(/\btan\(/g, 'Math.tan((Math.PI/180)*')
          .replace(/\basin\(/g, '(180/Math.PI)*Math.asin(')
          .replace(/\bacos\(/g, '(180/Math.PI)*Math.acos(')
          .replace(/\batan\(/g, '(180/Math.PI)*Math.atan(');
      } else {
        preProcessed = preProcessed
          .replace(/\bsin\(/g, 'Math.sin(')
          .replace(/\bcos\(/g, 'Math.cos(')
          .replace(/\btan\(/g, 'Math.tan(')
          .replace(/\basin\(/g, 'Math.asin(')
          .replace(/\bacos\(/g, 'Math.acos(')
          .replace(/\batan\(/g, 'Math.atan(');
      }

      preProcessed = preProcessed
        .replace(/\bsinh\(/g, 'Math.sinh(')
        .replace(/\bcosh\(/g, 'Math.cosh(')
        .replace(/\btanh\(/g, 'Math.tanh(')
        .replace(/\basinh\(/g, 'Math.asinh(')
        .replace(/\bacosh\(/g, 'Math.acosh(')
        .replace(/\batanh\(/g, 'Math.atanh(');

      preProcessed = preProcessed
        .replace(/\bln\(/g, 'Math.log(')
        .replace(/\bsqrt\(/g, 'Math.sqrt(')
        .replace(/\bcbrt\(/g, 'Math.cbrt(')
        .replace(/\bexp\(/g, 'Math.exp(')
        .replace(/\bAbs\(/g, 'Math.abs(')
        .replace(/\^/g, '**');

      const fact = (n) => {
        if (n < 0) return NaN;
        if (n === 0 || n === 1) return 1;
        let result = 1;
        for (let i = 2; i <= n; i++) result *= i;
        return result;
      };
      
      let factProcessed = preProcessed;
      factProcessed = factProcessed.replace(/(\d+(\.\d+)?|\bMath\.PI\b|\bMath\.E\b|\bAns\b)\!/g, 'fact($1)');
      
      const result = new Function('fact', `return (${factProcessed})`)(fact);
      if (typeof result === 'number' && !isNaN(result)) {
        if (!isFinite(result)) return 'Infinity';
        if (Number.isInteger(result)) return result.toString();
        return parseFloat(result.toFixed(9)).toString();
      }
      return 'Error';
    } catch (err) {
      return 'Error';
    }
  };

  const previewResult = useMemo(() => {
    if (!calcInput.trim()) return '';
    try {
      const res = evaluateExpr(calcInput, calcAngleMode, false, true);
      if (res && res !== 'Error') {
        return res;
      }
    } catch (e) {}
    return '';
  }, [calcInput, calcAngleMode, variables, lastAns]);

  const handleEqual = () => {
    if (!isOn || !calcInput.trim()) return;
    const res = evaluateExpr(calcInput, calcAngleMode);
    setCalcResult(res);
    if (res !== 'Error') {
      setLastAns(res);
      setHistory(prev => {
        const updated = [...prev, calcInput];
        if (updated.length > 20) {
          updated.shift();
        }
        return updated;
      });
      setHistoryIndex(-1);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleEqual();
    } else if (e.key === '/') {
      e.preventDefault();
      handleFracKey();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleDpad('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDpad('down');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handleDpad('left');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleDpad('right');
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (calcResult) {
        setCalcResult('');
        setCursorPosition(calcInput.length);
        return;
      }
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const getElementIndex = (node) => {
          let curr = node;
          while (curr && curr !== document.body) {
            if (curr.nodeType === Node.ELEMENT_NODE && curr.hasAttribute('data-index')) {
              return parseInt(curr.getAttribute('data-index'), 10);
            }
            curr = curr.parentNode;
          }
          return null;
        };
        const startIdx = getElementIndex(range.startContainer);
        const endIdx = getElementIndex(range.endContainer);
        if (startIdx !== null && endIdx !== null) {
          const minIdx = Math.min(startIdx, endIdx);
          const maxIdx = Math.max(startIdx, endIdx) + 1;
          const before = calcInput.substring(0, minIdx);
          const after = calcInput.substring(maxIdx);
          setCalcInput(before + after);
          setCursorPosition(minIdx);
          selection.removeAllRanges();
        }
      } else {
        handleBackspace();
      }
    }
  };

  const handleFracKey = () => {
    if (!isOn) return;
    setCalcResult('');
    setStatusMessage('');
    
    let start = cursorPosition;
    let text = calcInput;
    let operandStart = start;
    
    const beforeCursor = text.substring(0, start);
    let numStr = '';
    
    if (beforeCursor.endsWith('Ans')) {
      operandStart = start - 3;
      numStr = 'Ans';
    } else {
      while (operandStart > 0) {
        const char = text[operandStart - 1];
        if (/[\d.XYABCDEFMπe]/.test(char)) {
          operandStart--;
        } else {
          break;
        }
      }
      numStr = text.substring(operandStart, start);
    }
    
    const before = text.substring(0, operandStart);
    const after = text.substring(start);
    const val = `frac(${numStr},)`;
    
    setCalcInput(before + val + after);
    const newPos = numStr === '' ? operandStart + 5 : operandStart + 5 + numStr.length + 1;
    setCursorPosition(newPos);
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  const handleSdToggle = () => {
    setDisplaySdMode(prev => {
      if (prev === 'both') return 'decimal';
      if (prev === 'decimal') return 'fraction';
      return 'both';
    });
  };

  const handleVariableButton = (varName) => {
    if (isStoring) {
      const valueToStore = calcResult && calcResult !== 'Error' ? parseFloat(calcResult) : (calcInput ? parseFloat(evaluateExpr(calcInput, calcAngleMode)) : 0);
      setVariables(prev => ({ ...prev, [varName]: isNaN(valueToStore) ? 0 : valueToStore }));
      setStatusMessage(`${isNaN(valueToStore) ? 0 : valueToStore} → ${varName}`);
      setIsStoring(false);
      setShiftActive(false);
    } else if (isRecalling) {
      insertAtCursor(variables[varName].toString());
      setIsRecalling(false);
    } else {
      if (alphaActive) {
        insertAtCursor(varName);
        setAlphaActive(false);
      } else {
        if (varName === 'A') insertAtCursor('-');
        else if (varName === 'B') insertAtCursor('°');
        else if (varName === 'C') {
          setHypActive(true);
          setStatusMessage('hyp');
        }
        else if (varName === 'D') insertAtCursor('sin(');
        else if (varName === 'E') insertAtCursor('cos(');
        else if (varName === 'F') insertAtCursor('tan(');
        else if (varName === 'X') insertAtCursor('(');
        else if (varName === 'Y') insertAtCursor(')');
        else if (varName === 'M') insertAtCursor('M');
      }
    }
  };

  const handleKeyClick = (keyId) => {
    if (!isOn && keyId !== 'on') return;

    if (isStoring || isRecalling || alphaActive) {
      const varMap = {
        'neg': 'A',
        'dms': 'B',
        'hyp': 'C',
        'sin': 'D',
        'cos': 'E',
        'tan': 'F',
        'lparen': 'X',
        'rparen': 'Y',
        'mplus': 'M'
      };
      if (varMap[keyId]) {
        handleVariableButton(varMap[keyId]);
        return;
      }
    }

    setStatusMessage('');

    switch (keyId) {
      case 'shift':
        setShiftActive(prev => !prev);
        setAlphaActive(false);
        break;
      case 'alpha':
        setAlphaActive(prev => !prev);
        setShiftActive(false);
        break;
      case 'mode':
        setCalcAngleMode(prev => prev === 'deg' ? 'rad' : 'deg');
        setShiftActive(false);
        break;
      case 'copy':
        handleCopyFormula();
        break;
      case 'on':
        if (!isOn) {
          setIsOn(true);
        } else {
          handleClear();
        }
        break;
      case 'calc':
        if (shiftActive) {
          handleEqual();
          setShiftActive(false);
        } else if (alphaActive) {
          insertAtCursor('=');
          setAlphaActive(false);
        } else {
          handleEqual();
        }
        break;
      case 'integration':
        if (shiftActive) {
          insertAtCursor('d/dx(');
          setShiftActive(false);
        } else if (alphaActive) {
          insertAtCursor(':');
          setAlphaActive(false);
        } else {
          insertAtCursor('∫(');
        }
        break;
      case 'inverse':
        if (shiftActive) {
          insertAtCursor('!');
          setShiftActive(false);
        } else {
          insertAtCursor('^(-1)');
        }
        break;
      case 'log_base':
        if (shiftActive) {
          insertAtCursor('Σ(');
          setShiftActive(false);
        } else {
          insertAtCursor('log(');
        }
        break;
      case 'frac':
        handleFracKey();
        break;
      case 'sqrt':
        if (shiftActive) {
          insertAtCursor('∛(');
          setShiftActive(false);
        } else {
          insertAtCursor('sqrt()');
        }
        break;
      case 'sq':
        if (shiftActive) {
          insertAtCursor('^(3)');
          setShiftActive(false);
        } else {
          insertAtCursor('^(2)');
        }
        break;
      case 'pow':
        if (shiftActive) {
          insertAtCursor('^(1/)');
          setShiftActive(false);
        } else {
          insertAtCursor('^()');
        }
        break;
      case 'log':
        if (shiftActive) {
          insertAtCursor('10^()');
          setShiftActive(false);
        } else {
          insertAtCursor('log(');
        }
        break;
      case 'ln':
        if (shiftActive) {
          insertAtCursor('e^()');
          setShiftActive(false);
        } else {
          insertAtCursor('ln(');
        }
        break;
      case 'neg':
        if (shiftActive) {
          insertAtCursor('∠');
          setShiftActive(false);
        } else {
          insertAtCursor('-');
        }
        break;
      case 'dms':
        insertAtCursor('°');
        break;
      case 'hyp':
        if (shiftActive) {
          insertAtCursor('Abs(');
          setShiftActive(false);
        } else {
          setHypActive(true);
          setStatusMessage('hyp');
        }
        break;
      case 'sin':
        if (hypActive) {
          if (shiftActive) insertAtCursor('asinh(');
          else insertAtCursor('sinh(');
          setHypActive(false);
          setShiftActive(false);
        } else {
          if (shiftActive) {
            insertAtCursor('sin⁻¹(');
            setShiftActive(false);
          } else {
            insertAtCursor('sin(');
          }
        }
        break;
      case 'cos':
        if (hypActive) {
          if (shiftActive) insertAtCursor('acosh(');
          else insertAtCursor('cosh(');
          setHypActive(false);
          setShiftActive(false);
        } else {
          if (shiftActive) {
            insertAtCursor('cos⁻¹(');
            setShiftActive(false);
          } else {
            insertAtCursor('cos(');
          }
        }
        break;
      case 'tan':
        if (hypActive) {
          if (shiftActive) insertAtCursor('atanh(');
          else insertAtCursor('tanh(');
          setHypActive(false);
          setShiftActive(false);
        } else {
          if (shiftActive) {
            insertAtCursor('tan⁻¹(');
            setShiftActive(false);
          } else {
            insertAtCursor('tan(');
          }
        }
        break;
      case 'rcl':
        if (shiftActive) {
          setIsStoring(true);
          setShiftActive(false);
        } else {
          setIsRecalling(true);
        }
        break;
      case 'eng':
        insertAtCursor('*10^()');
        break;
      case 'lparen':
        if (shiftActive) {
          insertAtCursor('%');
          setShiftActive(false);
        } else {
          insertAtCursor('(');
        }
        break;
      case 'rparen':
        if (shiftActive) {
          insertAtCursor(',');
          setShiftActive(false);
        } else {
          insertAtCursor(')');
        }
        break;
      case 'sd':
        handleSdToggle();
        break;
      case 'mplus':
        if (shiftActive) {
          const resVal = parseFloat(evaluateExpr(calcInput, calcAngleMode));
          if (!isNaN(resVal)) {
            setVariables(prev => ({ ...prev, M: prev.M - resVal }));
            setStatusMessage(`M - ${resVal}`);
          }
          setShiftActive(false);
        } else {
          const resVal = parseFloat(evaluateExpr(calcInput, calcAngleMode));
          if (!isNaN(resVal)) {
            setVariables(prev => ({ ...prev, M: prev.M + resVal }));
            setStatusMessage(`M + ${resVal}`);
          }
        }
        break;
      default:
        break;
    }
  };

  const renderSilverKey = (label, topLabel, keyId) => {
    let topColor = 'text-slate-400';
    let topSize = 'text-[9px] h-3.5 mb-1';
    if (keyId === 'shift') {
      topColor = 'text-amber-500';
      topSize = 'text-[9px] h-4 mb-0.5';
    } else if (keyId === 'alpha') {
      topColor = 'text-rose-400';
      topSize = 'text-[9px] h-4 mb-0.5';
    }
    
    let activeCls = '';
    if (keyId === 'shift' && shiftActive) activeCls = 'bg-amber-500 border-amber-400 text-slate-950 scale-95 shadow-inner';
    else if (keyId === 'alpha' && alphaActive) activeCls = 'bg-rose-500 border-rose-400 text-white scale-95 shadow-inner';
    else activeCls = 'bg-[#7c8682] border-[#919c98] text-slate-950 active:scale-95 hover:bg-[#8d9995] cursor-pointer';

    return (
      <div className="flex flex-col items-center w-full relative">
        <span className={`font-black ${topColor} ${topSize} select-none pointer-events-none truncate max-w-full uppercase`}>
          {topLabel || ' '}
        </span>
        <button
          type="button"
          onClick={() => handleKeyClick(keyId)}
          className={`w-full py-1 rounded text-[11px] font-black transition-all shadow-sm select-none h-8 flex items-center justify-center border ${activeCls}`}
        >
          {label}
        </button>
      </div>
    );
  };

  const renderFuncKey = (keyId, label, shiftLabel, alphaLabel) => {
    const isDms = keyId === 'dms';
    return (
      <div className="flex flex-col items-center w-full relative">
        <div className="flex justify-between items-end w-full px-0.5 mb-0.5 select-none h-4">
          <span className="text-[8px] font-black text-amber-500 truncate max-w-[50%] leading-none">{shiftLabel || ' '}</span>
          <span className="text-[8px] font-black text-rose-400 truncate max-w-[50%] leading-none self-end">{alphaLabel || ' '}</span>
        </div>
        <button
          type="button"
          onClick={() => handleKeyClick(keyId)}
          className={`w-full py-1 rounded bg-[#2c3230] border border-[#404845] text-slate-100 font-extrabold active:scale-95 hover:bg-[#383f3d] transition-all cursor-pointer shadow-md select-none h-9 flex items-center justify-center relative ${
            isDms ? 'text-[16px] tracking-wider pt-0 pb-0.5' : 'text-[11px]'
          }`}
        >
          {label}
        </button>
      </div>
    );
  };

  const renderNumPadKey = (label, onClick, colorType) => {
    let btnCls = "w-full py-1 text-[16px] font-black rounded-md border transition-all cursor-pointer h-[52px] flex items-center justify-center select-none ";
    if (colorType === 'green') {
      btnCls += "bg-[#a3c965] border-[#8aab51] text-slate-950 hover:bg-[#b0da6d] active:scale-95 shadow-sm shadow-emerald-950/20";
    } else if (colorType === 'equal') {
      btnCls += "bg-[#2c3230] border-[#404845] text-slate-100 hover:bg-[#383f3d] active:scale-95 shadow-sm";
    } else if (colorType === 'operator') {
      btnCls += "bg-[#2c3230] border-[#404845] text-slate-100 hover:bg-[#383f3d] active:scale-95 shadow-sm";
    } else {
      btnCls += "bg-[#eceeed] border-[#cfd2d1] text-slate-900 hover:bg-[#f7f9f8] active:scale-95 shadow-sm font-sans text-[18px]";
    }

    return (
      <button type="button" onClick={onClick} className={btnCls}>
        {label}
      </button>
    );
  };

  const FormulaRenderer = ({ str, cursorIdx }) => {
    const parsed = parseFormula(str);
    
    const renderCursor = (idx) => {
      if (idx === cursorIdx) {
        return (
          <>
            <style>{`
              @keyframes casio-blink {
                50% { opacity: 0; }
              }
            `}</style>
            <span style={{
              display: 'inline-block',
              borderLeft: '2px solid #202528',
              height: '20px',
              marginLeft: '-1px',
              verticalAlign: 'middle',
              animation: 'casio-blink 1s step-start infinite'
            }}></span>
          </>
        );
      }
      return null;
    };

    const shiftIndices = (node, offset) => {
      if (node.type === 'text') {
        return {
          ...node,
          startIdx: node.startIdx + offset,
          endIdx: node.endIdx + offset
        };
      } else if (node.type === 'fraction') {
        return {
          ...node,
          numStartIdx: node.numStartIdx + offset,
          numEndIdx: node.numEndIdx + offset,
          denStartIdx: node.denStartIdx + offset,
          denEndIdx: node.denEndIdx + offset,
          startIdx: node.startIdx + offset,
          endIdx: node.endIdx + offset
        };
      } else if (node.type === 'exponent') {
        return {
          ...node,
          expStartIdx: node.expStartIdx + offset,
          expEndIdx: node.expEndIdx + offset,
          startIdx: node.startIdx + offset,
          endIdx: node.endIdx + offset
        };
      } else if (node.type === 'sqrt') {
        return {
          ...node,
          sqrtStartIdx: node.sqrtStartIdx + offset,
          sqrtEndIdx: node.sqrtEndIdx + offset,
          startIdx: node.startIdx + offset,
          endIdx: node.endIdx + offset
        };
      } else if (node.type === 'subscript') {
        return {
          ...node,
          subStartIdx: node.subStartIdx + offset,
          subEndIdx: node.subEndIdx + offset,
          startIdx: node.startIdx + offset,
          endIdx: node.endIdx + offset
        };
      }
      return node;
    };

    const renderTree = (nodes) => {
      return nodes.map((node, index) => {
        if (node.type === 'text') {
          const chars = [];
          for (let idx = node.startIdx; idx <= node.endIdx; idx++) {
            chars.push(
              <span key={idx} data-index={idx} className="inline">
                {renderCursor(idx)}
                {idx < node.endIdx ? node.content[idx - node.startIdx] : null}
              </span>
            );
          }
          return <span key={index} className="inline">{chars}</span>;
        } else if (node.type === 'fraction') {
          return (
            <span key={index} data-index={node.startIdx} className="inline-flex flex-col items-center mx-1.5 align-middle leading-none">
              <span className="border-b border-[#202528] pb-1 px-1.5 w-full text-center flex justify-center items-center min-w-[22px] min-h-[22px] leading-none">
                {node.numStr === '' ? (
                  <span data-index={node.numEndIdx} className={`border border-dashed border-[#202528]/40 w-[18px] h-[18px] rounded-[1px] inline-block ${cursorIdx === node.numEndIdx ? 'bg-[#202528]/25' : ''}`}></span>
                ) : (
                  renderTree(parseFormula(str.substring(node.numStartIdx, node.numEndIdx)).map(n => shiftIndices(n, node.numStartIdx)))
                )}
                {renderCursor(node.numEndIdx)}
              </span>
              <span className="pt-1 px-1.5 w-full text-center flex justify-center items-center min-w-[22px] min-h-[22px] leading-none">
                {node.denStr === '' ? (
                  <span data-index={node.denEndIdx} className={`border border-dashed border-[#202528]/40 w-[18px] h-[18px] rounded-[1px] inline-block ${cursorIdx === node.denEndIdx ? 'bg-[#202528]/25' : ''}`}></span>
                ) : (
                  renderTree(parseFormula(str.substring(node.denStartIdx, node.denEndIdx)).map(n => shiftIndices(n, node.denStartIdx)))
                )}
                {renderCursor(node.denEndIdx)}
              </span>
            </span>
          );
        } else if (node.type === 'exponent') {
          const isEmpty = node.expStr === '';
          const wrapperClass = isEmpty
            ? `inline-flex items-center justify-center align-super text-[0.6em] font-bold border border-dashed border-[#202528]/40 rounded-[1px] p-0.5 min-w-[16px] min-h-[16px] ml-0.5 leading-none bg-[#202528]/25`
            : `inline-flex items-center justify-center align-super text-[0.6em] font-bold ml-0.5 leading-none`;
          
          const isBaseEmpty = node.startIdx === 0 || /[\+\-\*\/×÷\(,]/.test(str[node.startIdx - 1]);
          const isBaseFocused = cursorIdx === node.startIdx;

          return (
            <React.Fragment key={index}>
              {isBaseEmpty && (
                <span 
                  data-index={node.startIdx} 
                  className={`border border-dashed border-[#202528]/40 w-[18px] h-[18px] rounded-[1px] inline-flex items-center justify-center mr-0.5 align-middle ${isBaseFocused ? 'bg-[#202528]/25' : ''}`}
                >
                  {renderCursor(node.startIdx)}
                </span>
              )}
              <span 
                className={wrapperClass} 
                style={{ position: 'relative', top: '-0.35em' }}
                data-index={node.expEndIdx}
              >
                {isEmpty ? (
                  <span className="w-2.5 h-3.5 inline-block"></span>
                ) : (
                  renderTree(parseFormula(str.substring(node.expStartIdx, node.expEndIdx)).map(n => shiftIndices(n, node.expStartIdx)))
                )}
                {renderCursor(node.expEndIdx)}
              </span>
            </React.Fragment>
          );
        } else if (node.type === 'sqrt') {
          const isEmpty = node.sqrtStr === '';
          return (
            <span key={index} data-index={node.startIdx} className="inline-flex items-stretch mx-0.5 align-middle relative leading-none">
              <svg 
                className="w-[12px] shrink-0 text-[#202528] select-none" 
                viewBox="0 0 10 20" 
                preserveAspectRatio="none"
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.8"
                strokeLinejoin="round"
                style={{ verticalAlign: 'middle' }}
              >
                <path d="M 1,11 L 3,11 L 6,18 L 9.5,2" />
              </svg>
              <span className="border-t-2 border-[#202528] pt-[1px] pb-[1px] px-1 w-full text-center flex justify-center items-center min-w-[20px] min-h-[22px] leading-none">
                {isEmpty ? (
                  <span data-index={node.sqrtEndIdx} className={`border border-dashed border-[#202528]/40 w-[18px] h-[18px] rounded-[1px] inline-block ${cursorIdx === node.sqrtEndIdx ? 'bg-[#202528]/25' : ''}`}></span>
                ) : (
                  renderTree(parseFormula(str.substring(node.sqrtStartIdx, node.sqrtEndIdx)).map(n => shiftIndices(n, node.sqrtStartIdx)))
                )}
                {renderCursor(node.sqrtEndIdx)}
              </span>
            </span>
          );
        } else if (node.type === 'subscript') {
          const isEmpty = node.subStr === '';
          const wrapperClass = isEmpty
            ? `inline-flex items-center justify-center align-sub text-[0.65em] font-black border border-dashed border-[#202528]/40 rounded-[1px] p-0.5 min-w-[16px] min-h-[16px] ml-0.5 leading-none bg-[#202528]/25`
            : `inline-flex items-center justify-center align-sub text-[0.65em] font-black ml-0.5 leading-none`;

          return (
            <span 
              key={index}
              className={wrapperClass} 
              style={{ position: 'relative', bottom: '-0.3em' }}
              data-index={node.subEndIdx}
            >
              {isEmpty ? (
                <span className="w-2.5 h-3.5 inline-block"></span>
              ) : (
                renderTree(parseFormula(str.substring(node.subStartIdx, node.subEndIdx)).map(n => shiftIndices(n, node.subStartIdx)))
              )}
              {renderCursor(node.subEndIdx)}
            </span>
          );
        }
        return null;
      });
    };
    
    return (
      <span className="flex items-center flex-nowrap select-text whitespace-nowrap overflow-x-auto py-1 max-w-full text-[20px] font-extrabold leading-none text-[#202528] font-mono">
        {renderTree(parsed)}
        {renderCursor(str.length)}
      </span>
    );
  };

  const handleLcdClick = (e) => {
    const target = e.target.closest('[data-index]');
    if (target) {
      const idx = parseInt(target.getAttribute('data-index'), 10);
      if (!isNaN(idx)) {
        setCursorPosition(idx);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.setSelectionRange(idx, idx);
          }
        }, 10);
        e.stopPropagation();
        return;
      }
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const renderLcdDisplay = () => {
    if (!isOn) {
      return (
        <div className="bg-[#1a1c19] border-2 border-[#30332f] rounded-md p-2 font-mono shadow-inner text-transparent mb-2 h-24 select-none" />
      );
    }

    const displayResult = calcResult || previewResult;

    let showFraction = false;
    let showDecimal = true;
    
    let fracNumerator = '';
    let fracDenominator = '';
    
    if (displayResult && displayResult !== 'Error') {
      const numVal = parseFloat(displayResult);
      if (!isNaN(numVal)) {
        const frac = decimalToFraction(numVal);
        if (frac && frac.denominator > 1) {
          fracNumerator = frac.numerator.toString();
          fracDenominator = frac.denominator.toString();
          
          if (displaySdMode === 'both') {
            showFraction = true;
            showDecimal = true;
          } else if (displaySdMode === 'fraction') {
            showFraction = true;
            showDecimal = false;
          } else {
            showFraction = false;
            showDecimal = true;
          }
        }
      }
    }
    
    return (
      <div 
        onClick={handleLcdClick}
        className="bg-[#E3E8E5] border-2 border-[#b8c2be] rounded-md pt-2 pb-2 px-3 font-mono shadow-inner text-[#202528] mb-2 relative min-h-[90px] h-auto flex flex-col justify-between select-text cursor-text"
      >
        <div className="flex gap-3 text-[12px] font-black select-none h-3.5 leading-none text-[#202528] tracking-wider">
          <span className={shiftActive ? "opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]" : "opacity-10"}>S</span>
          <span className={alphaActive ? "opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]" : "opacity-10"}>A</span>
          <span className={variables.M !== 0 ? "opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]" : "opacity-10"}>M</span>
          <span className={calcAngleMode === 'deg' ? "opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]" : "opacity-10"}>D</span>
          <span className={calcAngleMode === 'rad' ? "opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]" : "opacity-10"}>R</span>
          {isStoring && <span className="opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]">STO</span>}
          {isRecalling && <span className="opacity-100 bg-[#202528] text-[#E3E8E5] px-0.5 rounded-[1px]">RCL</span>}
          <span className="ml-auto opacity-100">Math</span>
        </div>
        
        <div className="flex flex-row justify-between flex-grow mt-1 select-text w-full items-center gap-1.5 min-h-[52px] h-auto py-1">
          <div className="flex-[8] w-[80%] flex items-center select-text overflow-x-auto min-h-[52px] h-auto py-0.5 pr-1.5 scrollbar-thin">
            <div className="w-full select-text">
              <FormulaRenderer str={calcInput} cursorIdx={cursorPosition} />
            </div>
            
            {statusMessage && (
              <span className="text-[10px] text-[#202528] bg-[#202528]/10 px-1 py-0.5 rounded select-none shrink-0 ml-1">
                {statusMessage}
              </span>
            )}
          </div>
          
          <div className="flex-[2] w-[20%] flex items-center justify-center select-text min-h-[52px] h-auto py-1 px-1 text-center overflow-hidden bg-[#c9d0cc] rounded-md border border-[#b0b8b4]/30 shadow-sm">
            <span className="text-[18px] opacity-75 text-[#202528] select-none leading-none mr-1 shrink-0">=</span>
            <div className="text-[#202528] select-all font-mono leading-none flex items-center justify-center overflow-hidden max-w-full">
              {showFraction ? (
                <div className="inline-flex flex-col items-center justify-center font-bold px-0.5 text-[14px] align-middle shrink-0 leading-tight">
                  <span className="border-b border-[#202528] pb-0.5 px-0.5 select-text">{fracNumerator}</span>
                  <span className="pt-0.5 px-0.5 select-text">{fracDenominator}</span>
                </div>
              ) : (
                <span className="text-[20px] font-black tracking-tight select-text leading-none truncate">{showDecimal ? (displayResult || '0') : ''}</span>
              )}
            </div>
          </div>
        </div>

        <input
          ref={inputRef}
          id="calc-input-field"
          type="text"
          value={calcInput}
          onChange={(e) => {
            const val = e.target.value;
            
            if (calcResult) {
              setCalcResult('');
              const prev = calcInput;
              let inserted = '';
              if (val.length > prev.length) {
                const cursor = e.target.selectionStart;
                inserted = val.substring(cursor - (val.length - prev.length), cursor);
              } else {
                inserted = val;
              }

              if (inserted) {
                let mapped = inserted;
                if (mapped === '*') mapped = '×';
                if (mapped === '/') mapped = '÷';
                
                if (isOperatorString(mapped)) {
                  setCalcInput('Ans' + mapped);
                  setCursorPosition(3 + mapped.length);
                  setHistoryIndex(-1);
                } else {
                  setCalcInput(mapped);
                  setCursorPosition(mapped.length);
                  setHistoryIndex(-1);
                }
                return;
              }
            }
            
            setCalcResult('');
            
            if (val.includes('sqrt(')) {
              let idx = -1;
              for (let i = 0; i < val.length; i++) {
                if (val.startsWith('sqrt(', i) && !val.startsWith('sqrt()', i)) {
                  idx = i;
                  break;
                }
              }
              if (idx !== -1) {
                const before = val.substring(0, idx);
                const after = val.substring(idx + 5);
                const finalVal = before + 'sqrt()' + after;
                setCalcInput(finalVal);
                const newPos = idx + 5;
                setCursorPosition(newPos);
                setTimeout(() => {
                  if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.setSelectionRange(newPos, newPos);
                  }
                }, 10);
                return;
              }
            }

            if (val.includes('^')) {
              let caretIdx = -1;
              for (let idx = 0; idx < val.length; idx++) {
                if (val[idx] === '^' && val[idx + 1] !== '(') {
                  caretIdx = idx;
                  break;
                }
              }
              if (caretIdx !== -1) {
                const before = val.substring(0, caretIdx);
                const after = val.substring(caretIdx + 1);
                const finalVal = before + '^()' + after;
                setCalcInput(finalVal);
                const newPos = caretIdx + 2;
                setCursorPosition(newPos);
                setTimeout(() => {
                  if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.setSelectionRange(newPos, newPos);
                  }
                }, 10);
                return;
              }
            }

            if (val.includes('/')) {
              const slashIdx = val.indexOf('/');
              const beforeSlash = val.substring(0, slashIdx);
              const afterSlash = val.substring(slashIdx + 1);
              
              let operandStart = beforeSlash.length;
              let numStr = '';
              
              if (beforeSlash.endsWith('Ans')) {
                operandStart = beforeSlash.length - 3;
                numStr = 'Ans';
              } else {
                while (operandStart > 0) {
                  const char = beforeSlash[operandStart - 1];
                  if (/[\d.XYABCDEFMπe]/.test(char)) {
                    operandStart--;
                  } else {
                    break;
                  }
                }
                numStr = beforeSlash.substring(operandStart);
              }
              
              const before = beforeSlash.substring(0, operandStart);
              const fracVal = `frac(${numStr},)`;
              const finalVal = before + fracVal + afterSlash;
              
              setCalcInput(finalVal);
              const newPos = numStr === '' ? operandStart + 5 : operandStart + 5 + numStr.length + 1;
              setCursorPosition(newPos);
              
              setTimeout(() => {
                if (inputRef.current) {
                  inputRef.current.focus();
                  inputRef.current.setSelectionRange(newPos, newPos);
                }
              }, 10);
              return;
            }
            
            const originalCursor = e.target.selectionStart;
            const textBeforeCursor = val.substring(0, originalCursor);
            const matches = textBeforeCursor.match(/(?<!\d)\./g);
            const addedZeros = matches ? matches.length : 0;
            
            const formattedVal = val.replace(/(?<!\d)\./g, '0.');
            const newCursor = originalCursor + addedZeros;
            
            setCalcInput(formattedVal);
            setCursorPosition(newCursor);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={(e) => {
            setCursorPosition(e.target.selectionStart);
          }}
          onClick={(e) => {
            setCursorPosition(e.target.selectionStart);
          }}
          className="absolute opacity-0 pointer-events-none w-0 h-0"
        />
      </div>
    );
  };

  return (
    <div className="w-full bg-[#181d1b] border-b border-slate-800 p-3 flex flex-col gap-1 select-none relative font-sans">
      {renderLcdDisplay()}
      <div className="flex flex-row gap-2 mt-1 w-full overflow-hidden items-stretch">
        <div className="flex-[1.25] min-w-0 pr-1 border-r border-[#404845]/30 flex flex-col justify-end">
          <div className="grid grid-cols-6 gap-x-1.5 gap-y-1.5 select-none">
            {renderSilverKey('SHIFT', 'SHIFT', 'shift')}
            {renderSilverKey('ALPHA', 'ALPHA', 'alpha')}
            
            <div className="col-span-2 row-span-2 flex items-center justify-center relative w-full h-full my-auto px-0.5">
              <div className="relative w-24 h-24 bg-gradient-to-tr from-[#3a423e] to-[#252a28] border-2 border-[#4a5450] rounded-full shadow-md flex items-center justify-center shrink-0">
                <button onClick={() => handleDpad('up')} className="absolute top-2 left-1/2 -translate-x-1/2 text-slate-400 hover:text-white active:scale-90 select-none text-[18px] font-black cursor-pointer leading-none">▲</button>
                <button onClick={() => handleDpad('down')} className="absolute bottom-2 left-1/2 -translate-x-1/2 text-slate-400 hover:text-white active:scale-90 select-none text-[18px] font-black cursor-pointer leading-none">▼</button>
                <button onClick={() => handleDpad('left')} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white active:scale-90 select-none text-[18px] font-black cursor-pointer leading-none">◀</button>
                <button onClick={() => handleDpad('right')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white active:scale-90 select-none text-[18px] font-black cursor-pointer leading-none">▶</button>
                <span className="text-[9px] font-black text-slate-500 tracking-wider">REPLAY</span>
              </div>
            </div>
            
            {renderSilverKey('MODE', 'SETUP', 'mode')}
            {renderSilverKey('복사', 'COPY', 'copy')}
            
            {renderFuncKey('calc', 'CALC', 'SOLVE', '=')}
            {renderFuncKey('integration', '∫dx', 'd/dx', ':')}
            {renderFuncKey('inverse', 'x⁻¹', 'x!', 'DEC')}
            {renderFuncKey('log_base', 'log_■', 'Σ', 'HEX')}
            
            {renderFuncKey('frac', '■/□', 'a b/c', '')}
            {renderFuncKey('sqrt', '√', '∛', '')}
            {renderFuncKey('sq', 'x²', 'x³', 'DEC')}
            {renderFuncKey('pow', 'x^■', 'x√', 'HEX')}
            {renderFuncKey('log', 'log', '10ˣ', 'BIN')}
            {renderFuncKey('ln', 'ln', 'eˣ', 'OCT')}
            
            {renderFuncKey('neg', '(-)', '∠', 'A')}
            {renderFuncKey('dms', '°\'"', '←', 'B')}
            {renderFuncKey('hyp', 'hyp', 'Abs', 'C')}
            {renderFuncKey('sin', 'sin', 'sin⁻¹', 'D')}
            {renderFuncKey('cos', 'cos', 'cos⁻¹', 'E')}
            {renderFuncKey('tan', 'tan', 'tan⁻¹', 'F')}
            
            {renderFuncKey('rcl', 'RCL', 'STO', '')}
            {renderFuncKey('eng', 'ENG', '←', 'i')}
            {renderFuncKey('lparen', '(', '%', 'X')}
            {renderFuncKey('rparen', ')', ',', 'Y')}
            {renderFuncKey('sd', 'S⇔D', 'd/c', '')}
            {renderFuncKey('mplus', 'M+', 'M-', 'M')}
          </div>
        </div>

        <div className="flex-[0.75] min-w-0 pl-1 flex flex-col justify-end">
          <div className="grid grid-cols-5 gap-2 select-none">
            {renderNumPadKey('π', () => appendToInput('π'))}
            {renderNumPadKey('%', () => appendToInput('%'))}
            {renderNumPadKey('e', () => appendToInput('e'))}
            {renderNumPadKey('=', () => appendToInput('='))}
            {renderNumPadKey('X', () => appendToInput('X'))}

            {renderNumPadKey('7', () => appendToInput('7'))}
            {renderNumPadKey('8', () => appendToInput('8'))}
            {renderNumPadKey('9', () => appendToInput('9'))}
            {renderNumPadKey('DEL', handleBackspace, 'green')}
            {renderNumPadKey('AC', () => handleKeyClick('on'), 'green')}

            {renderNumPadKey('4', () => appendToInput('4'))}
            {renderNumPadKey('5', () => appendToInput('5'))}
            {renderNumPadKey('6', () => appendToInput('6'))}
            {renderNumPadKey('×', () => appendToInput('×'), 'operator')}
            {renderNumPadKey('÷', () => appendToInput('÷'), 'operator')}

            {renderNumPadKey('1', () => appendToInput('1'))}
            {renderNumPadKey('2', () => appendToInput('2'))}
            {renderNumPadKey('3', () => appendToInput('3'))}
            {renderNumPadKey('+', () => appendToInput('+'), 'operator')}
            {renderNumPadKey('-', () => appendToInput('-'), 'operator')}

            {renderNumPadKey('0', () => appendToInput('0'))}
            {renderNumPadKey('.', () => appendToInput('.'))}
            {renderNumPadKey('×10ˣ', () => appendToInput('*10^()'))}
            {renderNumPadKey('Ans', () => appendToInput('Ans'), 'operator')}
            {renderNumPadKey('=', handleEqual, 'equal')}
          </div>
        </div>
      </div>

      {/* Quick Insert Panel for variables and Greek letters */}
      <div className="mt-4 p-3 bg-slate-900/60 rounded-xl border border-slate-800 select-none">
        <div className="text-[11px] font-black text-slate-400 mb-2.5 tracking-wide uppercase flex items-center gap-1.5">
          <span>📝 Quick Insert (영어 소문자 & 그리스 문자)</span>
          <span className="text-[9px] font-normal text-slate-500 lowercase">(클릭 시 커서 위치에 입력됩니다)</span>
        </div>
        
        {/* a-z alphabet buttons */}
        <div className="mb-3">
          <div className="text-[10px] font-bold text-slate-500 mb-1 flex justify-between items-center">
            <span>Alphabet (a-z) & Custom Presets</span>
            <span className="text-[8px] font-normal text-slate-600">(빈 버튼 더블클릭 시 편집 가능)</span>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
            {['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'].map(char => (
              <button
                key={char}
                type="button"
                onClick={() => insertAtCursor(char)}
                className="py-1 bg-slate-950/60 hover:bg-slate-800 text-slate-300 hover:text-white rounded border border-slate-800 text-[12px] font-bold transition-all active:scale-90 cursor-pointer"
              >
                {char}
              </button>
            ))}
            {/* 10 custom alphabet preset buttons */}
            {customAlphabetButtons.map((val, idx) => (
              <button
                key={`custom-alp-${idx}`}
                type="button"
                onClick={() => handleCustomButtonClick('alphabet', idx, val)}
                className={`py-1 rounded border text-[11px] font-bold transition-all active:scale-90 cursor-pointer ${
                  val 
                    ? 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border-indigo-900/50' 
                    : 'bg-slate-950/30 hover:bg-slate-900 text-slate-600 border-slate-900 border-dashed'
                }`}
                title={val ? `클릭: 입력 | 더블클릭: 편집` : `더블클릭하여 등록`}
              >
                {val || '+'}
              </button>
            ))}
          </div>
        </div>

        {/* Greek letter buttons */}
        <div className="mb-3">
          <div className="text-[10px] font-bold text-slate-500 mb-1">Greek Symbols</div>
          <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
            {[
              { label: 'α (alpha)', char: 'α' },
              { label: 'β (beta)', char: 'β' },
              { label: 'γ (gamma)', char: 'γ' },
              { label: 'δ (delta)', char: 'δ' },
              { label: 'ε (epsilon)', char: 'ε' },
              { label: 'ζ (zeta)', char: 'ζ' },
              { label: 'η (eta)', char: 'η' },
              { label: 'θ (theta)', char: 'θ' },
              { label: 'ι (iota)', char: 'ι' },
              { label: 'κ (kappa)', char: 'κ' },
              { label: 'λ (lambda)', char: 'λ' },
              { label: 'μ (mu)', char: 'μ' },
              { label: 'ν (nu)', char: 'ν' },
              { label: 'ξ (xi)', char: 'ξ' },
              { label: 'π (pi)', char: 'π' },
              { label: 'ρ (rho)', char: 'ρ' },
              { label: 'σ (sigma)', char: 'σ' },
              { label: 'τ (tau)', char: 'τ' },
              { label: 'υ (upsilon)', char: 'υ' },
              { label: 'φ (phi)', char: 'φ' },
              { label: 'χ (chi)', char: 'χ' },
              { label: 'ψ (psi)', char: 'ψ' },
              { label: 'ω (omega)', char: 'ω' },
              { label: 'Δ (Delta)', char: 'Δ' },
              { label: 'Σ (Sigma)', char: 'Σ' },
              { label: 'Φ (Phi)', char: 'Φ' },
              { label: 'Ω (Omega)', char: 'Ω' },
              { label: '아래첨자 (_)', char: '_', display: 'x_□' }
            ].map(item => (
              <button
                key={item.char}
                type="button"
                onClick={() => insertAtCursor(item.char)}
                title={item.label}
                className="py-1 bg-slate-950/60 hover:bg-slate-800 text-amber-500 hover:text-amber-400 rounded border border-slate-800 text-[12px] font-bold transition-all active:scale-90 cursor-pointer"
              >
                {item.display || item.char}
              </button>
            ))}
          </div>
        </div>

        {/* Engineering Constants & Greek Custom Presets */}
        <div>
          <div className="text-[10px] font-bold text-slate-500 mb-1 flex justify-between items-center">
            <span>토질 및 기초 공학 공식 기호 & 커스텀 기호</span>
            <span className="text-[8px] font-normal text-slate-600">(빈 버튼 더블클릭 시 편집 가능)</span>
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5">
            {[
              { label: 'γ_sat (포화단위중량)', char: 'γ_sat' },
              { label: 'γ_w (물의 단위중량)', char: 'γ_w' },
              { label: 'γ_d (건조단위중량)', char: 'γ_d' },
              { label: 'γ_d_max (최대건조단위중량)', char: 'γ_d_max' }
            ].map(item => (
              <button
                key={item.char}
                type="button"
                onClick={() => insertAtCursor(item.char)}
                title={item.label}
                className="py-1.5 bg-slate-950/60 hover:bg-slate-800 text-amber-400 hover:text-amber-300 rounded border border-slate-800 text-[11px] font-bold transition-all active:scale-90 cursor-pointer"
              >
                {item.char}
              </button>
            ))}
            {/* 10 custom Greek/Engineering preset buttons */}
            {customGreekButtons.map((val, idx) => (
              <button
                key={`custom-grk-${idx}`}
                type="button"
                onClick={() => handleCustomButtonClick('greek', idx, val)}
                className={`py-1.5 rounded border text-[11px] font-bold transition-all active:scale-90 cursor-pointer ${
                  val 
                    ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-900/50' 
                    : 'bg-slate-950/30 hover:bg-slate-900 text-slate-600 border-slate-900 border-dashed'
                }`}
                title={val ? `클릭: 입력 | 더블클릭: 편집` : `더블클릭하여 등록`}
              >
                {val || '+'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FloatingCalculator({ isVisible, onClose }) {
  const dragRef = useRef(null);
  const [position, setPosition] = useState(() => {
    const isMobile = window.innerWidth < 768;
    const width = isMobile ? window.innerWidth * 0.9 : 660;
    return { x: Math.max(10, window.innerWidth - width - 20), y: 150 };
  });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.target.closest('.drag-handle')) {
      isDragging.current = true;
      dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current) return;
    const newX = e.clientX - dragStart.current.x;
    const newY = e.clientY - dragStart.current.y;
    const width = dragRef.current?.clientWidth || 660;
    const height = dragRef.current?.clientHeight || 500;
    const boundedX = Math.max(10, Math.min(window.innerWidth - width - 10, newX));
    const boundedY = Math.max(10, Math.min(window.innerHeight - height - 10, newY));
    setPosition({ x: boundedX, y: boundedY });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e) => {
    if (e.target.closest('.drag-handle')) {
      isDragging.current = true;
      const touch = e.touches[0];
      dragStart.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.current.x;
    const newY = touch.clientY - dragStart.current.y;
    const width = dragRef.current?.clientWidth || 660;
    const height = dragRef.current?.clientHeight || 500;
    const boundedX = Math.max(10, Math.min(window.innerWidth - width - 10, newX));
    const boundedY = Math.max(10, Math.min(window.innerHeight - height - 10, newY));
    setPosition({ x: boundedX, y: boundedY });
    e.preventDefault();
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  };

  if (!isVisible) return null;

  const isMobile = window.innerWidth < 768;
  const usePopout = !isMobile;

  const content = (
    <div className="w-full h-full flex flex-col overflow-hidden bg-slate-900 text-slate-100">
      {!usePopout && (
        <div 
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className={`drag-handle flex items-center justify-between px-3.5 py-2.5 bg-lime-200 border-b border-lime-300 select-none cursor-move`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-slate-950 text-slate-100 font-black px-1.5 py-0.5 rounded border border-slate-900/30">CASIO</span>
            <span className="text-[10px] text-slate-950 font-black tracking-wider">공학용 계산기</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-lime-300 text-slate-900 hover:text-black transition-colors cursor-pointer flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="p-2 overflow-y-auto flex-1 custom-vertical-scrollbar bg-slate-950/20">
        <ScientificCalculator />
      </div>
    </div>
  );

  if (usePopout) {
    return (
      <PopoutWindow
        title="공학용 계산기"
        onClose={onClose}
        initWidth={680}
        initHeight={780}
        storageKey="anti_popout_calculator"
      >
        {content}
      </PopoutWindow>
    );
  }

  return (
    <div
      ref={dragRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9999,
        touchAction: 'none'
      }}
      className="w-[90vw] md:w-[660px] bg-slate-900 border border-slate-700/60 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden backdrop-blur-md transition-shadow duration-300 hover:shadow-rose-500/10 hover:border-rose-500/20"
    >
      {content}
    </div>
  );
}
