import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Search, RefreshCw, Trash2, BookOpen, Type, FileText, Image, ChevronDown, ChevronUp, Layers, HelpCircle
} from 'lucide-react';
import { ImageTabList } from './ImageStandardsPlugin';
import { PopoutWindow } from './PopoutWindow';

const parseHtmlTable = (htmlStr) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlStr || '', 'text/html');
  
  let ths = [];
  const thead = doc.querySelector('thead');
  if (thead) {
    ths = Array.from(thead.querySelectorAll('th, td')).map(el => el.textContent.trim());
  } else {
    const firstTr = doc.querySelector('tr');
    if (firstTr) {
      ths = Array.from(firstTr.querySelectorAll('th, td')).map(el => el.textContent.trim());
    }
  }
  
  const rows = [];
  const allTrs = Array.from(doc.querySelectorAll('tr'));
  const dataTrs = thead 
    ? allTrs.filter(tr => !tr.closest('thead')) 
    : allTrs.slice(1);

  for (const tr of dataTrs) {
    const tds = Array.from(tr.querySelectorAll('td, th')).map(el => el.textContent.trim());
    if (tds.length > 0) {
      rows.push(tds);
    }
  }

  return { headers: ths, rows };
};

const rebuildTableHtml = (headers, rows) => {
  let html = '<div class="w-full my-4 space-y-2 table-export-wrapper relative">';
  html += '<div class="flex items-center justify-between gap-4 border-b border-slate-800/60 pb-2">';
  html += '<span class="text-xs sm:text-sm font-extrabold text-slate-350 select-none flex items-center gap-1.5">';
  html += '📊 비교표';
  html += '</span>';
  html += '</div>';
  html += '<div class="w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">';
  html += '<table class="w-full table-auto text-center border-collapse text-[13px] sm:text-[15px] min-w-full">';
  html += '<thead>';
  html += '<tr class="bg-slate-900/80 text-slate-350 border-b border-slate-800">';
  headers.forEach(h => {
    html += `<th class="p-1 sm:p-1.5 font-extrabold border-r border-slate-800 last:border-r-0">${h}</th>`;
  });
  html += '</tr>';
  html += '</thead>';
  html += '<tbody>';
  rows.forEach(row => {
    html += '<tr class="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/20">';
    row.forEach(cell => {
      html += `<td class="p-1 sm:p-1.5 border-r border-slate-800 last:border-r-0 text-slate-350">${cell}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  html += '</table>';
  html += '</div>';
  html += '</div>';
  return html;
};
const rebuildMarkdownTable = (headers, rows, separator = '\n') => {
  if (!headers || !rows) return '';
  const headerLine = '| ' + headers.join(' | ') + ' |';
  const sepLine = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const rowLines = rows.map(r => '| ' + r.join(' | ') + ' |');
  return [headerLine, sepLine, ...rowLines].join(separator);
};

const parseMarkdownTable = (questionText) => {
  if (!questionText) return null;
  const lines = questionText.split('\n');
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line !== '|') {
      if (startIdx === -1) {
        startIdx = i;
      }
      endIdx = i;
    } else {
      if (startIdx !== -1) {
        break;
      }
    }
  }

  const parseRowCells = (rowText) => {
    let cells = rowText.split('|').map(c => c.trim());
    while (cells.length > 0 && cells[0] === '') cells.shift();
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    return cells;
  };

  if (startIdx !== -1 && endIdx !== -1 && (endIdx - startIdx) >= 2) {
    const headers = parseRowCells(lines[startIdx]);
    
    const separatorLine = lines[startIdx + 1];
    if (separatorLine.includes('---')) {
      const rows = [];
      for (let i = startIdx + 2; i <= endIdx; i++) {
        const rowCells = parseRowCells(lines[i]);
        rows.push(rowCells);
      }
      
      const originalTableText = lines.slice(startIdx, endIdx + 1).join('\n');
      return {
        tableData: { headers, rows },
        originalTableText
      };
    }
  }
  return null;
};

const parseOverviewContent = (content) => {
  const result = { definition: '', mechanism: '', comparison: '', significance: '', intuitive: '' };
  if (!content) return result;

  let healedContent = content;
  if (typeof healedContent === 'string') {
    healedContent = healedContent.replace(/\|\s*(개요\(\d+~\d+자\)|개요|메커니즘|비교표|비교|장단점|의미|한계성|직관적의미|직관적)\s*\|/gi, '\n| $1 |');
    healedContent = healedContent.replace(/\|[ \t]*\|/g, '\n|');
  }

  const lines = healedContent.split('\n');
  let currentKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '|') continue;
    
    if ((trimmed.includes(':---') || (trimmed.startsWith('|') && trimmed.includes('구분') && trimmed.includes('내용'))) && !currentKey) {
      continue;
    }

    const sectionMatch = trimmed.match(/^\|\s*([^|]+)\s*\|?\s*([\s\S]*)$/);
    
    const rawKeyCandidate = sectionMatch ? sectionMatch[1].trim() : '';
    const isTopLevelKey = 
      rawKeyCandidate === '개요' || 
      rawKeyCandidate.startsWith('개요(') || 
      rawKeyCandidate === '메커니즘' || 
      rawKeyCandidate === '비교표' || 
      rawKeyCandidate === '비교' || 
      rawKeyCandidate === '장단점' || 
      rawKeyCandidate === '공학적 의미/한계성' || 
      rawKeyCandidate === '공학적 의미 및 한계성' || 
      rawKeyCandidate === '의미/한계성' || 
      rawKeyCandidate === '직관적의미' || 
      rawKeyCandidate === '직관적';

    if (sectionMatch && isTopLevelKey) {
      const rawKey = sectionMatch[1].trim();
      let rawVal = sectionMatch[2].trim();
      
      if (rawVal.endsWith('|')) {
        rawVal = rawVal.slice(0, -1).trim();
      }

      if (rawKey.includes('개요')) {
        currentKey = 'definition';
      } else if (rawKey.includes('메커니즘')) {
        currentKey = 'mechanism';
      } else if (rawKey.includes('직관적')) {
        currentKey = 'intuitive';
      } else if (rawKey.includes('비교') || rawKey.includes('비교표') || rawKey.includes('장단점')) {
        currentKey = 'comparison';
      } else if (rawKey.includes('의미') || rawKey.includes('한계성')) {
        currentKey = 'significance';
      }

      result[currentKey] = rawVal;
    } else {
      if (currentKey) {
        result[currentKey] += '\n' + trimmed;
      }
    }
  }

  for (const k in result) {
    result[k] = result[k].replace(/<br\s*\/?>/gi, '\n').trim();
    if (result[k].endsWith('|') && !result[k].includes('\n')) {
      result[k] = result[k].slice(0, -1).trim();
    }
  }

  return result;
};

export function FloatingMemorization({
  isVisible,
  onClose,
  focusedQuestion,
  // Tables
  formulaTables,
  setFormulaTables,
  loadingFormulaTables,
  expandedTableIds,
  setExpandedTableIds,
  handleSaveFormulaTables,
  editingTableIdx,
  setEditingTableIdx,
  editingTableText,
  setEditingTableText,
  // Acronyms
  formulaAcronyms,
  setFormulaAcronyms,
  loadingFormulaAcronyms,
  handleSaveFormulaAcronyms,
  editingAcronymId,
  setEditingAcronymId,
  editingAcronymText,
  setEditingAcronymText,
  handleUpdateAcronymSentence,
  handleUpdateAcronymRowCell,
  handleDeleteAcronymCard,
  handleOptimizeAcronym,
  handleAddAcronymKeyword,
  getAcronymRows,
  // Overviews
  formulaOverviews,
  setFormulaOverviews,
  loadingFormulaOverviews,
  handleSaveFormulaOverviews,
  // Images
  formulaImages,
  setFormulaImages,
  handleSaveFormulaImages,
  // General
  showNotification,
  API_BASE,
  LatexRenderer,
  katexLoaded,
  isDesktop
}) {
  const dragRef = useRef(null);
  const [position, setPosition] = useState(() => {
    const isMobile = window.innerWidth < 768;
    const width = isMobile ? window.innerWidth * 0.9 : 720;
    return { x: 80, y: 120 };
  });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastProcessedQuestionRef = useRef(null);
  const lastVisibleRef = useRef(false);

  const [subTab, setSubTab] = useState(() => {
    return localStorage.getItem('anti_memorization_sub_tab') || 'table';
  });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    localStorage.setItem('anti_memorization_sub_tab', subTab);
  }, [subTab]);

  useEffect(() => {
    const justOpened = isVisible && !lastVisibleRef.current;
    lastVisibleRef.current = isVisible;

    const questionChanged = focusedQuestion && (
      !lastProcessedQuestionRef.current ||
      lastProcessedQuestionRef.current.id !== focusedQuestion.id ||
      lastProcessedQuestionRef.current.question !== focusedQuestion.question
    );

    if (isVisible && focusedQuestion && (justOpened || questionChanged)) {
      lastProcessedQuestionRef.current = focusedQuestion;

      const qText = (focusedQuestion.question || '').toLowerCase();
      const qType = (focusedQuestion.type || '').toLowerCase();
      const qSubtype = (focusedQuestion.subtype || '').toLowerCase();
      const qTitle = (focusedQuestion.title || '').toLowerCase();
      
      let targetTab = 'table';
      
      // Decide targetTab based on type and content
      if (qText.includes('개요') || qType.includes('개요') || qSubtype.includes('개요') || qTitle.includes('개요')) {
        targetTab = 'overview';
      } else if (qType.includes('앞글자') || qType.includes('acronym') || qSubtype.includes('앞글자') || qText.includes('두문자') || qText.includes('앞글자')) {
        targetTab = 'acronym';
      } else if (qType.includes('그림') || qType.includes('image') || qSubtype.includes('그림') || qText.includes('그림') || qText.includes('그래프')) {
        targetTab = 'image';
      } else if (qType.includes('표') || qType.includes('table') || qSubtype.includes('표') || qText.includes('표채우기') || qText.includes('비교표')) {
        targetTab = 'table';
      } else if (qType.includes('공식') || qType.includes('formula') || qSubtype.includes('공식')) {
        targetTab = 'overview';
      } else {
        // Fallback matching logic based on acronym cards, tables, etc.
        const hasAcronymMatch = formulaAcronyms?.some(ac => {
          const titleClean = (ac.title || '').replace(/\s+/g, '').toLowerCase();
          return titleClean && (qText.replace(/\s+/g, '').includes(titleClean) || qTitle.replace(/\s+/g, '').includes(titleClean));
        });
        if (hasAcronymMatch) {
          targetTab = 'acronym';
        } else {
          const hasTableMatch = formulaTables?.some(tb => {
            const titleClean = (tb.title || '').replace(/\s+/g, '').toLowerCase();
            return titleClean && (qText.replace(/\s+/g, '').includes(titleClean) || qTitle.replace(/\s+/g, '').includes(titleClean));
          });
          if (hasTableMatch) {
            targetTab = 'table';
          } else {
            const hasOverviewMatch = formulaOverviews?.some(ov => {
              const titleClean = (ov.title || '').replace(/\s+/g, '').toLowerCase();
              return titleClean && (qText.replace(/\s+/g, '').includes(titleClean) || qTitle.replace(/\s+/g, '').includes(titleClean));
            });
            if (hasOverviewMatch) {
              targetTab = 'overview';
            }
          }
        }
      }
      
      // Find best matching card title/keyword
      let bestMatch = '';
      if (targetTab === 'acronym' && formulaAcronyms) {
        const found = formulaAcronyms.find(ac => {
          const title = (ac.title || '').trim();
          if (!title) return false;
          const tClean = title.toLowerCase().replace(/\s+/g, '');
          const qTextClean = qText.replace(/\s+/g, '');
          return qTextClean.includes(tClean) || tClean.includes(qTextClean) || (qTitle && (qTitle.includes(tClean) || tClean.includes(qTitle)));
        });
        if (found) {
          bestMatch = found.title;
        } else {
          const keywords = ['비배수', '전단강도', '압밀', '액상화', '지하수', '토압', '지지력', '사면', '옹벽', '터널', '말뚝', '기초'];
          for (const kw of keywords) {
            if (qText.includes(kw) || qTitle.includes(kw)) {
              const foundKw = formulaAcronyms.find(ac => (ac.title || '').includes(kw));
              if (foundKw) {
                bestMatch = foundKw.title;
                break;
              }
            }
          }
        }
      } else if (targetTab === 'table' && formulaTables) {
        const found = formulaTables.find(tb => {
          const title = (tb.title || '').trim();
          if (!title) return false;
          const tClean = title.toLowerCase().replace(/\s+/g, '');
          const qTextClean = qText.replace(/\s+/g, '');
          return qTextClean.includes(tClean) || tClean.includes(qTextClean) || (qTitle && (qTitle.includes(tClean) || tClean.includes(qTitle)));
        });
        if (found) bestMatch = found.title;
      } else if (targetTab === 'overview' && formulaOverviews) {
        const found = formulaOverviews.find(ov => {
          const title = (ov.title || '').trim();
          if (!title) return false;
          const tClean = title.toLowerCase().replace(/\s+/g, '');
          const qTextClean = qText.replace(/\s+/g, '');
          return qTextClean.includes(tClean) || tClean.includes(qTextClean) || (qTitle && (qTitle.includes(tClean) || tClean.includes(qTitle)));
        });
        if (found) bestMatch = found.title;
      } else if (targetTab === 'image' && formulaImages) {
        const found = formulaImages.find(img => {
          const title = (img.title || '').trim();
          if (!title) return false;
          const tClean = title.toLowerCase().replace(/\s+/g, '');
          const qTextClean = qText.replace(/\s+/g, '');
          return qTextClean.includes(tClean) || tClean.includes(qTextClean) || (qTitle && (qTitle.includes(tClean) || tClean.includes(qTitle)));
        });
        if (found) bestMatch = found.title;
      }
      
      setSubTab(targetTab);
      if (bestMatch) {
        setSearchQuery(bestMatch);
      } else {
        const keywords = ['비배수', '전단강도', '압밀', '액상화', '지하수', '토압', '지지력', '사면', '옹벽', '터널', '말뚝', '기초'];
        let fallbackKw = '';
        for (const kw of keywords) {
          if (qText.includes(kw) || qTitle.includes(kw)) {
            fallbackKw = kw;
            break;
          }
        }
        setSearchQuery(fallbackKw);
      }
    }
  }, [isVisible, focusedQuestion, formulaAcronyms, formulaTables, formulaOverviews, formulaImages]);

  useEffect(() => {
    const handleSelectIdEvent = (e) => {
      const { id } = e.detail;
      if (!id) return;
      
      let foundTab = null;
      if (formulaOverviews?.some(ov => String(ov.id) === String(id))) {
        foundTab = 'overview';
      } else if (formulaTables?.some(t => String(t.id) === String(id))) {
        foundTab = 'table';
      } else if (formulaAcronyms?.some(ac => String(ac.id) === String(id))) {
        foundTab = 'acronym';
      } else if (formulaImages?.some(img => String(img.id) === String(id))) {
        foundTab = 'image';
      }
      
      if (foundTab) {
        setSubTab(foundTab);
        setSearchQuery(id);
      }
    };
    
    window.addEventListener('anti-memorization-select-id', handleSelectIdEvent);
    return () => {
      window.removeEventListener('anti-memorization-select-id', handleSelectIdEvent);
    };
  }, [formulaOverviews, formulaTables, formulaAcronyms, formulaImages]);

  // Local editing states for cells and overviews inside the popup
  const [localActiveEditCell, setLocalActiveEditCell] = useState(null); // { tableId, type, rIdx, colIdx }
  const [localEditingCellValue, setLocalEditingCellValue] = useState('');
  const [localExpandedOverviewIds, setLocalExpandedOverviewIds] = useState({});
  const [localEditingOverviewId, setLocalEditingOverviewId] = useState(null);
  const [localEditingOverviewText, setLocalEditingOverviewText] = useState('');
  const [localEditingOverviewContent, setLocalEditingOverviewContent] = useState('');

  // Drag listeners
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
    const width = dragRef.current?.clientWidth || 720;
    const height = dragRef.current?.clientHeight || 600;
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
    const width = dragRef.current?.clientWidth || 720;
    const height = dragRef.current?.clientHeight || 600;
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

  const toggleTableCollapse = (id) => {
    setExpandedTableIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const toggleOverviewCollapse = (id) => {
    setLocalExpandedOverviewIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const [usePopout, setUsePopout] = useState(() => {
    if (!isDesktop) return false;
    return localStorage.getItem('anti_use_popout_memo') !== 'false';
  });

  const togglePopoutMode = () => {
    const newVal = !usePopout;
    setUsePopout(newVal);
    localStorage.setItem('anti_use_popout_memo', newVal ? 'true' : 'false');
  };

  const activeUsePopout = usePopout && isDesktop;

  if (!isVisible) return null;

  const content = (
    <div className="floating-memorization-popup w-full h-full flex flex-col overflow-hidden text-slate-100 bg-slate-950">
      {/* Header */}
      {!activeUsePopout && (
        <div 
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className="drag-handle flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-900/80 to-indigo-900/80 border-b border-violet-800/50 select-none shrink-0 cursor-move"
        >
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-violet-400" />
            <span className="text-xs text-white font-extrabold tracking-wider">플로팅 암기자료 팝업</span>
            <span className="text-[9px] font-black text-slate-400 bg-slate-950/40 px-1.5 py-0.5 rounded border border-slate-800">Review Companion</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePopoutMode}
              className="px-2 py-0.5 bg-slate-950 text-violet-300 hover:text-white rounded text-[9px] font-black transition-colors cursor-pointer border-none"
              title="독립된 새 창으로 분리합니다"
            >
              새창 분리
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center border-none bg-transparent"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Local Tab Row */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/20 select-none shrink-0">
        <div className="flex gap-1.5">
          {[
            { id: 'table', label: '표', count: formulaTables.length, color: 'text-violet-400 border-violet-500/30' },
            { id: 'acronym', label: '앞글자', count: formulaAcronyms.length, color: 'text-emerald-400 border-emerald-500/30' },
            { id: 'overview', label: '개요', count: formulaOverviews.length, color: 'text-rose-400 border-rose-500/30' },
            { id: 'image', label: '그림', count: formulaImages.length, color: 'text-indigo-400 border-indigo-500/30' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setSubTab(tab.id);
                setLocalActiveEditCell(null);
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                subTab === tab.id
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-md'
                  : 'bg-transparent text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[9px] font-bold px-1 py-0.2 bg-slate-950/50 rounded-full border ${tab.color}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Local Search Input */}
        {subTab !== 'image' && (
          <div className="flex items-center gap-2 bg-slateCustom-950/45 border border-slate-800 rounded-lg px-2 py-1 focus-within:border-violet-500/40 transition-all max-w-[200px] w-full">
            <Search size={12} className="text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="팝업 검색..."
              className="bg-transparent border-0 text-[10px] text-slate-200 focus:outline-none p-0 w-full"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-slate-200 cursor-pointer">
                <X size={10} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Body Area */}
      <div className="flex-1 overflow-y-auto p-4 custom-vertical-scrollbar select-text bg-slate-950/10">
        
        {/* TAB 1: TABLES */}
        {subTab === 'table' && (
          loadingFormulaTables ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4 text-center">
              <RefreshCw className="animate-spin text-violet-500" size={24} />
              <span className="text-xs font-bold text-slate-400">표 데이터를 로드하는 중...</span>
            </div>
          ) : formulaTables.filter(t => {
            const query = searchQuery.toLowerCase().trim();
            if (!query) return true;
            const idMatch = String(t.id).toLowerCase() === query;
            const textMatch = (t.title || '').toLowerCase().includes(query) || (t.html || '').toLowerCase().includes(query);
            return idMatch || textMatch;
          }).length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <Search size={24} className="text-slate-600" />
              <h4 className="text-sm font-bold text-slate-355">검색 결과가 없습니다</h4>
            </div>
          ) : (
            <div className="space-y-4 w-full">
              {formulaTables
                .filter(t => {
                  const query = searchQuery.toLowerCase();
                  return (t.title || '').toLowerCase().includes(query) || (t.html || '').toLowerCase().includes(query);
                })
                .map((t) => {
                  const idx = formulaTables.indexOf(t);
                  const isExpanded = !!expandedTableIds[t.id];
                  return (
                    <div key={t.id} className="bg-slateCustom-900 border border-slate-800/80 rounded-xl px-3 py-3 md:p-4 space-y-3 w-full">
                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2 gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-[10px] font-black bg-violet-950/80 text-violet-400 px-2 py-0.5 rounded border border-violet-500/20 shrink-0">
                            T{idx + 1}
                          </span>
                          {editingTableIdx === idx ? (
                            <div className="flex items-center gap-1.5 w-full max-w-[280px]">
                              <input
                                type="text"
                                value={editingTableText}
                                onChange={(e) => setEditingTableText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const trimmed = editingTableText.trim();
                                    if (trimmed) {
                                      const updated = formulaTables.map((item, i) => i === idx ? { ...item, title: trimmed } : item);
                                      setFormulaTables(updated);
                                      handleSaveFormulaTables(updated, false);
                                      setEditingTableIdx(null);
                                    }
                                  } else if (e.key === 'Escape') {
                                    setEditingTableIdx(null);
                                  }
                                }}
                                className="bg-slateCustom-950 border border-slate-700 text-white text-[12px] font-bold rounded px-2 py-0.5 focus:outline-none w-full"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <div className="flex items-center flex-wrap gap-1.5 min-w-0">
                              <h4 
                                onClick={() => { setEditingTableIdx(idx); setEditingTableText(t.title); }}
                                className="text-[12px] font-black text-white hover:text-violet-300 transition-colors cursor-pointer truncate max-w-[200px]"
                                title="클릭하여 제목 수정"
                              >
                                {t.title}
                              </h4>
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(t.id);
                                  showNotification('테이블 ID가 클립보드에 복사되었습니다: ' + t.id, 'success');
                                }}
                                className="text-[9px] font-black bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 px-1.5 py-0.5 rounded cursor-pointer transition-all active:scale-95 select-none"
                                title="클릭하여 ID 복사"
                              >
                                ID: {t.id}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => toggleTableCollapse(t.id)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                          <button
                            onClick={async (e) => {
                              const currentWindow = e.target.ownerDocument.defaultView || window;
                              if (currentWindow.confirm('이 표 카드를 삭제하시겠습니까?')) {
                                const updated = formulaTables.filter(x => x.id !== t.id);
                                setFormulaTables(updated);
                                await handleSaveFormulaTables(updated, false);
                                showNotification('표가 삭제되었습니다.', 'info');
                              }
                            }}
                            className="p-1 rounded bg-red-955/40 border border-red-500/20 text-red-400 hover:bg-red-900 transition-all cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="table-quiz-container overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 p-0 select-text animate-fade-in text-[14px] md:text-[16px]">
                          {(() => {
                            const parsed = parseHtmlTable(t.html);
                            return (
                              <table className="table-quiz-table w-full table-auto text-center border-collapse min-w-full">
                                <thead>
                                  <tr className="bg-slate-900/80 text-slate-355 border-b border-slate-800">
                                    {parsed.headers.map((h, hIdx) => {
                                      const isEditing = localActiveEditCell && localActiveEditCell.tableId === t.id && localActiveEditCell.type === 'header' && localActiveEditCell.colIdx === hIdx;
                                      return (
                                        <th 
                                          key={hIdx} 
                                          className="p-1.5 border-r border-slate-800/80 last:border-r-0 align-middle cursor-pointer min-w-[70px]"
                                          onClick={() => {
                                            if (!isEditing) {
                                              setLocalActiveEditCell({ tableId: t.id, type: 'header', colIdx: hIdx });
                                              setLocalEditingCellValue(h);
                                            }
                                          }}
                                        >
                                          {isEditing ? (
                                            <input
                                              type="text"
                                              value={localEditingCellValue}
                                              onChange={(e) => setLocalEditingCellValue(e.target.value)}
                                              onBlur={() => {
                                                const updatedHeaders = parsed.headers.map((hdr, idx) => idx === hIdx ? localEditingCellValue : hdr);
                                                const newHtml = rebuildTableHtml(updatedHeaders, parsed.rows);
                                                const updatedTables = formulaTables.map(item => item.id === t.id ? { ...item, html: newHtml } : item);
                                                setFormulaTables(updatedTables);
                                                handleSaveFormulaTables(updatedTables, false);
                                                setLocalActiveEditCell(null);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  const updatedHeaders = parsed.headers.map((hdr, idx) => idx === hIdx ? localEditingCellValue : hdr);
                                                  const newHtml = rebuildTableHtml(updatedHeaders, parsed.rows);
                                                  const updatedTables = formulaTables.map(item => item.id === t.id ? { ...item, html: newHtml } : item);
                                                  setFormulaTables(updatedTables);
                                                  handleSaveFormulaTables(updatedTables, false);
                                                  setLocalActiveEditCell(null);
                                                }
                                              }}
                                              className="w-full text-center bg-slateCustom-950 border border-slate-700 text-slate-200 font-black focus:outline-none p-0.5 text-[14px] md:text-[16px] rounded"
                                              autoFocus
                                            />
                                          ) : (
                                            <div className="w-full text-center p-0.5 text-[14px] md:text-[16px] text-slate-200 font-black">
                                              <LatexRenderer text={h} katexLoaded={katexLoaded} className="inline" />
                                            </div>
                                          )}
                                        </th>
                                      );
                                    })}
                                    <th className="p-1 text-center align-middle w-16">
                                      <button
                                        onClick={() => {
                                          const emptyRow = Array(parsed.headers.length).fill('');
                                          const updatedRows = [...parsed.rows, emptyRow];
                                          const newHtml = rebuildTableHtml(parsed.headers, updatedRows);
                                          const updatedTables = formulaTables.map(item => item.id === t.id ? { ...item, html: newHtml } : item);
                                          setFormulaTables(updatedTables);
                                          handleSaveFormulaTables(updatedTables, false);
                                        }}
                                        className="px-1 py-0.2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[8px] font-black cursor-pointer"
                                        title="새 행 추가"
                                      >
                                        +행
                                      </button>
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {parsed.rows.map((row, rIdx) => (
                                    <tr key={rIdx} className="border-b border-slate-800/80 last:border-b-0 hover:bg-slate-900/10">
                                      {row.map((cell, cIdx) => {
                                        const isEditing = localActiveEditCell && localActiveEditCell.tableId === t.id && localActiveEditCell.type === 'cell' && localActiveEditCell.rIdx === rIdx && localActiveEditCell.colIdx === cIdx;
                                        return (
                                          <td 
                                            key={cIdx} 
                                            className="p-1 border-r border-slate-800/60 last:border-r-0 align-middle cursor-pointer min-w-[90px]"
                                            onClick={() => {
                                              if (!isEditing) {
                                                setLocalActiveEditCell({ tableId: t.id, type: 'cell', rIdx, colIdx: cIdx });
                                                setLocalEditingCellValue(cell);
                                              }
                                            }}
                                          >
                                            {isEditing ? (
                                              <input
                                                type="text"
                                                value={localEditingCellValue}
                                                onChange={(e) => setLocalEditingCellValue(e.target.value)}
                                                onBlur={() => {
                                                  const updatedRows = parsed.rows.map((rowVal, rIdx2) => 
                                                    rIdx2 === rIdx 
                                                      ? rowVal.map((cellVal, cIdx2) => cIdx2 === cIdx ? localEditingCellValue : cellVal)
                                                      : rowVal
                                                  );
                                                  const newHtml = rebuildTableHtml(parsed.headers, updatedRows);
                                                  const updatedTables = formulaTables.map(item => item.id === t.id ? { ...item, html: newHtml } : item);
                                                  setFormulaTables(updatedTables);
                                                  handleSaveFormulaTables(updatedTables, false);
                                                  setLocalActiveEditCell(null);
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') {
                                                    const updatedRows = parsed.rows.map((rowVal, rIdx2) => 
                                                      rIdx2 === rIdx 
                                                        ? rowVal.map((cellVal, cIdx2) => cIdx2 === cIdx ? localEditingCellValue : cellVal)
                                                        : rowVal
                                                    );
                                                    const newHtml = rebuildTableHtml(parsed.headers, updatedRows);
                                                    const updatedTables = formulaTables.map(item => item.id === t.id ? { ...item, html: newHtml } : item);
                                                    setFormulaTables(updatedTables);
                                                    handleSaveFormulaTables(updatedTables, false);
                                                    setLocalActiveEditCell(null);
                                                  }
                                                }}
                                                className="w-full text-center bg-slateCustom-950 border border-slate-700 text-slate-200 focus:outline-none p-0.5 text-[14px] md:text-[16px] rounded"
                                                autoFocus
                                              />
                                            ) : (
                                              <div className="w-full text-center p-0.5 text-[14px] md:text-[16px] text-slate-200">
                                                <LatexRenderer text={cell} katexLoaded={katexLoaded} className="inline" />
                                              </div>
                                            )}
                                          </td>
                                        );
                                      })}
                                      <td className="p-1 text-center align-middle">
                                        <button
                                          onClick={(e) => {
                                            const currentWindow = e.target.ownerDocument.defaultView || window;
                                            if (currentWindow.confirm('이 행을 삭제하시겠습니까?')) {
                                              const updatedRows = parsed.rows.filter((_, idx) => idx !== rIdx);
                                              const newHtml = rebuildTableHtml(parsed.headers, updatedRows);
                                              const updatedTables = formulaTables.map(item => item.id === t.id ? { ...item, html: newHtml } : item);
                                              setFormulaTables(updatedTables);
                                              handleSaveFormulaTables(updatedTables, false);
                                            }
                                          }}
                                          className="p-0.5 rounded bg-red-955/40 border border-red-500/10 text-red-400 hover:bg-red-900 transition-all cursor-pointer"
                                        >
                                          삭제
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )
        )}

        {/* TAB 2: ACRONYMS */}
        {subTab === 'acronym' && (
          loadingFormulaAcronyms ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4 text-center">
              <RefreshCw className="animate-spin text-emerald-500" size={24} />
              <span className="text-xs font-bold text-slate-400">앞글자 데이터를 로드하는 중...</span>
            </div>
          ) : formulaAcronyms.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <Type size={24} className="text-slate-600" />
              <h4 className="text-sm font-bold text-slate-300">저장된 앞글자 카드가 없습니다</h4>
            </div>
          ) : formulaAcronyms.filter(ac => {
            const query = searchQuery.toLowerCase().trim();
            if (!query) return true;
            const idMatch = String(ac.id).toLowerCase() === query;
            const textMatch = (ac.title || '').toLowerCase().includes(query) || (ac.content || '').toLowerCase().includes(query);
            return idMatch || textMatch;
          }).length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <Search size={24} className="text-slate-600" />
              <h4 className="text-sm font-bold text-slate-355">검색 결과가 없습니다</h4>
            </div>
          ) : (
            <div className="space-y-4 w-full">
              {formulaAcronyms
                .filter(ac => {
                  const query = searchQuery.toLowerCase().trim();
                  if (!query) return true;
                  const idMatch = String(ac.id).toLowerCase() === query;
                  const textMatch = (ac.title || '').toLowerCase().includes(query) || (ac.content || '').toLowerCase().includes(query);
                  return idMatch || textMatch;
                })
                .map((ac, idx) => {
                  if (ac.isLoading && !ac.content) {
                    return (
                      <div key={ac.id || idx} className="px-3 py-4 bg-slateCustom-900 border border-slate-800/80 rounded-xl space-y-3 animate-pulse select-none w-full">
                        <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2">
                          <span className="text-[10px] font-black bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
                            AI
                          </span>
                          <h4 className="text-xs font-black text-white">
                            [{ac.title}] 앞글자 암기법을 생성하는 중...
                          </h4>
                        </div>
                        <div className="flex flex-col items-center justify-center py-4 gap-2">
                          <RefreshCw className="animate-spin text-emerald-450" size={20} />
                          <p className="text-[10px] text-slate-400 text-center">
                            AI 튜터가 최적의 앞글자 단어 조합과 마크다운 비교표를 구성하고 있습니다.
                          </p>
                        </div>
                      </div>
                    );
                  }

                  const rows = getAcronymRows(ac.content);
                  const acronymHeaderMatch = ac.content.match(/^두문자:\s*([^\n]+)/m);
                  const acronymHeaderText = acronymHeaderMatch ? acronymHeaderMatch[1].trim() : rows.map(r => r.acronym).join('');
                  const sentenceMatch = ac.content.match(/^연상문장:\s*([^\n]+)/m);
                  const sentenceText = sentenceMatch ? sentenceMatch[1] : '';

                  return (
                    <div key={ac.id || idx} className="bg-slateCustom-900 border border-slate-800/80 rounded-xl px-3 py-3 md:p-4 space-y-3 w-full relative overflow-hidden">
                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
                            A{idx + 1}
                          </span>
                          {editingAcronymId === ac.id ? (
                            <input
                              type="text"
                              value={editingAcronymText}
                              onChange={(e) => setEditingAcronymText(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter') {
                                  const trimmed = editingAcronymText.trim();
                                  if (trimmed) {
                                    const updated = formulaAcronyms.map(item => item.id === ac.id ? { ...item, title: trimmed } : item);
                                    setFormulaAcronyms(updated);
                                    if (handleSaveFormulaAcronyms) await handleSaveFormulaAcronyms(updated, false);
                                    setEditingAcronymId(null);
                                  }
                                } else if (e.key === 'Escape') {
                                  setEditingAcronymId(null);
                                }
                              }}
                              className="bg-slateCustom-950 border border-slate-700 text-white text-[12px] font-bold rounded px-2 py-0.5 focus:outline-none w-full max-w-[280px]"
                              autoFocus
                            />
                          ) : (
                            <div className="flex items-center flex-wrap gap-1.5 min-w-0">
                              <h4 
                                onClick={() => { setEditingAcronymId(ac.id); setEditingAcronymText(ac.title); }}
                                className="text-[12px] font-black text-white hover:text-emerald-300 transition-colors cursor-pointer truncate max-w-[200px]"
                                title="클릭하여 제목 수정"
                              >
                                {ac.title}
                              </h4>
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(ac.id);
                                  showNotification('두문자 ID가 클립보드에 복사되었습니다: ' + ac.id, 'success');
                                }}
                                className="text-[9px] font-black bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 px-1.5 py-0.5 rounded cursor-pointer transition-all active:scale-95 select-none"
                                title="클릭하여 ID 복사"
                              >
                                ID: {ac.id}
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            const currentWindow = e.target.ownerDocument.defaultView || window;
                            handleDeleteAcronymCard(ac.id, ac.title, currentWindow);
                          }}
                          className="p-1 rounded bg-red-955/40 border border-red-500/20 text-red-400 hover:bg-red-900 transition-all cursor-pointer shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Content editor */}
                      <div className="space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                          <div className="text-[10px] font-black text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded border border-emerald-500/10 shrink-0">
                            조합: {acronymHeaderText}
                          </div>
                          <div className="flex-1 flex items-center gap-1.5 bg-slate-950/45 border border-slate-800 rounded-lg px-2 py-1 focus-within:border-emerald-500/40 transition-all">
                            <span className="text-[10px] font-black text-emerald-400 shrink-0 select-none">💡 연상문장:</span>
                            <input
                              type="text"
                              value={sentenceText}
                              onChange={(e) => handleUpdateAcronymSentence(ac.id, e.target.value)}
                              placeholder="예: 띄어쓰기를 자유롭게 입력할 수 있습니다"
                              className="w-full bg-transparent border-0 text-[10.5px] text-slate-200 focus:outline-none p-0"
                            />
                          </div>
                          {/* 추가 키워드 입력창 */}
                          <div className="flex items-center gap-1.5 shrink-0 bg-slate-950/45 border border-slate-800 rounded-lg px-2 py-1 focus-within:border-emerald-500/40 transition-all w-full sm:w-48">
                            <span className="text-[10px] font-black text-emerald-400 shrink-0 select-none">➕ 키워드 추가:</span>
                            <input
                              type="text"
                              placeholder="키워드 입력 후 Enter"
                              disabled={ac.isLoading}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.target.value.trim()) {
                                  handleAddAcronymKeyword(ac.id, e.target.value.trim(), ac.title, ac.content);
                                  e.target.value = '';
                                }
                              }}
                              className="w-full bg-transparent border-0 text-[10.5px] text-slate-200 focus:outline-none p-0 font-bold disabled:opacity-50"
                            />
                          </div>
                          <button
                            onClick={() => handleOptimizeAcronym(ac.id)}
                            className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-750 text-[10px] font-bold cursor-pointer select-none shrink-0"
                            title="AI가 연상문장을 재조합합니다"
                          >
                            🔄 재조합
                          </button>
                        </div>

                        <div className="overflow-x-auto w-full border border-slate-800 bg-slate-950/40 rounded-xl select-text text-[14px]">
                          <table className="w-full text-left border-collapse table-fixed min-w-[500px]">
                            <colgroup>
                              <col style={{ width: '42px' }} />
                              <col style={{ width: '130px' }} />
                              <col />
                              <col style={{ width: '80px' }} />
                            </colgroup>
                            <thead>
                              <tr className="bg-slate-900/60 border-b border-slate-800 text-[14px] font-black text-slate-400 select-none">
                                <th className="p-2 border-r border-slate-800/80 text-center">두</th>
                                <th className="p-2 border-r border-slate-800/80">암기단어</th>
                                <th className="p-2 border-r border-slate-800/80">매칭설명 (키워드/스펙)</th>
                                <th className="p-2 text-center">순서</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((rowVal, rIdx) => {
                                return (
                                  <tr key={rIdx} className="border-b border-slate-850 last:border-b-0 hover:bg-slate-900/10">
                                    <td className="p-1 text-center border-r border-slate-850">
                                      <input
                                        type="text"
                                        value={rowVal.acronym}
                                        onChange={(e) => handleUpdateAcronymRowCell(ac.id, rIdx, 'acronym', e.target.value)}
                                        className="w-full text-center bg-transparent border-0 text-slate-100 font-extrabold focus:outline-none p-0 text-[14px]"
                                      />
                                    </td>
                                    <td className="p-1 border-r border-slate-850">
                                      <input
                                        type="text"
                                        value={rowVal.word}
                                        onChange={(e) => handleUpdateAcronymRowCell(ac.id, rIdx, 'word', e.target.value)}
                                        className="w-full bg-transparent border-0 text-slate-200 font-bold focus:outline-none p-0 text-[14px]"
                                      />
                                    </td>
                                    <td className="p-1 border-r border-slate-850">
                                      <textarea
                                        ref={(el) => {
                                          if (el) {
                                            el.style.height = 'auto';
                                            el.style.height = `${el.scrollHeight}px`;
                                          }
                                        }}
                                        value={rowVal.description}
                                        onChange={(e) => handleUpdateAcronymRowCell(ac.id, rIdx, 'description', e.target.value)}
                                        rows={1}
                                        className="w-full bg-transparent border-0 text-slate-300 focus:outline-none p-0 text-[14px] resize-none overflow-hidden"
                                      />
                                    </td>
                                    <td className="p-1 text-center align-middle select-none">
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          onClick={() => {
                                            // Shift row up
                                            if (rIdx > 0) {
                                              const newRows = [...rows];
                                              const temp = newRows[rIdx];
                                              newRows[rIdx] = newRows[rIdx - 1];
                                              newRows[rIdx - 1] = temp;
                                              const newContent = [
                                                `두문자: ${acronymHeaderText}`,
                                                `연상문장: ${sentenceText}`,
                                                '| 두문자 | 암기단어 | 설명 |',
                                                '| :--- | :--- | :--- |',
                                                ...newRows.map(r => `| ${r.acronym} | ${r.word} | ${r.description} |`)
                                              ].join('\n');
                                              const updated = formulaAcronyms.map(item => item.id === ac.id ? { ...item, content: newContent } : item);
                                              setFormulaAcronyms(updated);
                                              handleSaveFormulaAcronyms(updated, false);
                                            }
                                          }}
                                          disabled={rIdx === 0}
                                          className="px-1 py-0.2 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-20 text-[9px] cursor-pointer"
                                          title="위로 이동"
                                        >
                                          ▲
                                        </button>
                                        <button
                                          onClick={() => {
                                            // Shift row down
                                            if (rIdx < rows.length - 1) {
                                              const newRows = [...rows];
                                              const temp = newRows[rIdx];
                                              newRows[rIdx] = newRows[rIdx + 1];
                                              newRows[rIdx + 1] = temp;
                                              const newContent = [
                                                `두문자: ${acronymHeaderText}`,
                                                `연상문장: ${sentenceText}`,
                                                '| 두문자 | 암기단어 | 설명 |',
                                                '| :--- | :--- | :--- |',
                                                ...newRows.map(r => `| ${r.acronym} | ${r.word} | ${r.description} |`)
                                              ].join('\n');
                                              const updated = formulaAcronyms.map(item => item.id === ac.id ? { ...item, content: newContent } : item);
                                              setFormulaAcronyms(updated);
                                              handleSaveFormulaAcronyms(updated, false);
                                            }
                                          }}
                                          disabled={rIdx === rows.length - 1}
                                          className="px-1 py-0.2 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-20 text-[9px] cursor-pointer"
                                          title="아래로 이동"
                                        >
                                          ▼
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            const currentWindow = e.target.ownerDocument.defaultView || window;
                                            if (currentWindow.confirm('이 행을 삭제하시겠습니까?')) {
                                              const newRows = rows.filter((_, idx) => idx !== rIdx);
                                              const newContent = [
                                                `두문자: ${acronymHeaderText}`,
                                                `연상문장: ${sentenceText}`,
                                                '| 두문자 | 암기단어 | 설명 |',
                                                '| :--- | :--- | :--- |',
                                                ...newRows.map(r => `| ${r.acronym} | ${r.word} | ${r.description} |`)
                                              ].join('\n');
                                              const updated = formulaAcronyms.map(item => item.id === ac.id ? { ...item, content: newContent } : item);
                                              setFormulaAcronyms(updated);
                                              handleSaveFormulaAcronyms(updated, false);
                                            }
                                          }}
                                          className="px-1 py-0.5 rounded bg-slate-800/60 hover:bg-rose-950/75 text-slate-400 hover:text-rose-450 border border-slate-700/50 hover:border-rose-500/20 text-[9px] cursor-pointer transition-all"
                                          title="행 삭제"
                                        >
                                          <Trash2 size={10} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )
        )}

        {/* TAB 3: OVERVIEWS */}
        {subTab === 'overview' && (
          loadingFormulaOverviews ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4 text-center">
              <RefreshCw className="animate-spin text-rose-500" size={24} />
              <span className="text-xs font-bold text-slate-400">개요 데이터를 로드하는 중...</span>
            </div>
          ) : formulaOverviews.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <BookOpen size={24} className="text-slate-600" />
              <h4 className="text-sm font-bold text-slate-300">저장된 개요가 없습니다</h4>
            </div>
          ) : formulaOverviews.filter(ov => {
            const query = searchQuery.toLowerCase().trim();
            if (!query) return true;
            const idMatch = String(ov.id).toLowerCase() === query;
            const textMatch = (ov.title || '').toLowerCase().includes(query) || (ov.content || '').toLowerCase().includes(query);
            return idMatch || textMatch;
          }).length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <Search size={24} className="text-slate-600" />
              <h4 className="text-sm font-bold text-slate-355">검색 결과가 없습니다</h4>
            </div>
          ) : (
            <div className="space-y-4 w-full">
              {formulaOverviews
                .filter(ov => {
                  const query = searchQuery.toLowerCase().trim();
                  if (!query) return true;
                  const idMatch = String(ov.id).toLowerCase() === query;
                  const textMatch = (ov.title || '').toLowerCase().includes(query) || (ov.content || '').toLowerCase().includes(query);
                  return idMatch || textMatch;
                })
                .map((ov, idx) => {
                  const isExpanded = !!localExpandedOverviewIds[ov.id];
                  const isEditing = localEditingOverviewId === ov.id;
                  return (
                    <div key={ov.id || idx} className="bg-slateCustom-900 border border-slate-800/80 rounded-xl px-3 py-3 md:p-4 space-y-3 w-full">
                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-[10px] font-black bg-rose-950/80 text-rose-400 px-2 py-0.5 rounded border border-rose-500/20 shrink-0">
                            O{idx + 1}
                          </span>
                          <div className="flex items-center flex-wrap gap-1.5 min-w-0">
                            <h4 
                              onClick={() => {
                                setLocalEditingOverviewId(ov.id);
                                setLocalEditingOverviewText(ov.title);
                                setLocalEditingOverviewContent(ov.content);
                              }}
                              className="text-[12px] font-black text-white hover:text-rose-300 transition-colors cursor-pointer truncate max-w-[200px]"
                              title="클릭하여 내용 및 제목 수정"
                            >
                              {ov.title}
                            </h4>
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(ov.id);
                                showNotification('개요/공식 ID가 클립보드에 복사되었습니다: ' + ov.id, 'success');
                              }}
                              className="text-[9px] font-black bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 px-1.5 py-0.5 rounded cursor-pointer transition-all active:scale-95 select-none"
                              title="클릭하여 ID 복사"
                            >
                              ID: {ov.id}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => toggleOverviewCollapse(ov.id)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                          <button
                            onClick={async (e) => {
                              const currentWindow = e.target.ownerDocument.defaultView || window;
                              if (currentWindow.confirm('이 개요 카드를 삭제하시겠습니까?')) {
                                const updated = formulaOverviews.filter(x => x.id !== ov.id);
                                setFormulaOverviews(updated);
                                await handleSaveFormulaOverviews(updated, false);
                                showNotification('개요가 삭제되었습니다.', 'info');
                              }
                            }}
                            className="p-1 rounded bg-red-955/40 border border-red-500/20 text-red-400 hover:bg-red-900 transition-all cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Editing View */}
                      {isEditing && (
                        <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/80 space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">개요 제목</label>
                            <input
                              type="text"
                              value={localEditingOverviewText}
                              onChange={(e) => setLocalEditingOverviewText(e.target.value)}
                              className="w-full bg-slateCustom-950 border border-slate-800 text-white rounded px-2.5 py-1 text-[14px] md:text-[16px] font-bold focus:outline-none focus:border-rose-500"
                              placeholder="개요 제목"
                              autoFocus
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">마크다운 내용</label>
                            <textarea
                              value={localEditingOverviewContent}
                              onChange={(e) => setLocalEditingOverviewContent(e.target.value)}
                              rows={8}
                              className="w-full bg-slateCustom-950 border border-slate-800 text-slate-200 text-[14px] md:text-[16px] rounded p-2 focus:outline-none focus:border-rose-500 font-mono resize-none"
                              placeholder="개요 마크다운 내용을 입력하세요..."
                            />
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={async () => {
                                const trimmedText = localEditingOverviewText.trim();
                                if (trimmedText) {
                                  const updated = formulaOverviews.map(item => item.id === ov.id ? { ...item, title: trimmedText, content: localEditingOverviewContent } : item);
                                  setFormulaOverviews(updated);
                                  await handleSaveFormulaOverviews(updated, false);
                                  setLocalEditingOverviewId(null);
                                  showNotification('개요 제목과 내용이 저장되었습니다.', 'success');
                                }
                              }}
                              className="px-2.5 py-1 bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded hover:bg-emerald-800/60 transition-colors cursor-pointer"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => setLocalEditingOverviewId(null)}
                              className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold rounded hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      )}

                      {isExpanded && !isEditing && (() => {
                        const parsed = parseOverviewContent(ov.content);
                        const hasParsedData = parsed.definition || parsed.mechanism || parsed.comparison || parsed.significance || parsed.intuitive;
                        
                        if (hasParsedData) {
                          const steps = parsed.mechanism
                            ? parsed.mechanism.split(/\s*->\s*/).filter(Boolean)
                            : [];
                          return (
                            <div className="text-slate-355 text-[14px] md:text-[16px] leading-relaxed select-text border border-slate-800 bg-slate-950/40 p-4 rounded-xl animate-fade-in markdown-body text-left space-y-4">
                              {/* 1. 개요 */}
                              {parsed.definition && (
                                <div className="text-slate-200 py-1 px-0.5">
                                  <span className="text-[10px] text-slate-400 font-black block mb-1.5 uppercase tracking-wider select-none">📖 학술적 정의</span>
                                  <div className="font-bold text-white leading-relaxed">
                                    <LatexRenderer text={parsed.definition} katexLoaded={katexLoaded} isMarkdown={true} />
                                  </div>
                                </div>
                              )}

                              {/* 2. 메커니즘 */}
                              {steps.length > 0 && (
                                <div className="space-y-2">
                                  <span className="text-[10px] text-rose-455 font-black block mb-1.5 uppercase tracking-wider select-none">⚙️ 공학적 작동 메커니즘</span>
                                  <div className="flex flex-col gap-1 w-full">
                                    {steps.map((step, sIdx) => (
                                      <React.Fragment key={sIdx}>
                                        <div className="text-slate-250 font-semibold leading-relaxed py-1 px-0.5">
                                          <div className="flex gap-2.5 items-start">
                                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-black border border-rose-500/20 shrink-0 mt-0.5 select-none">
                                              {sIdx + 1}
                                            </span>
                                            <div className="flex-1 text-slate-200 leading-relaxed">
                                              <LatexRenderer text={step} katexLoaded={katexLoaded} isMarkdown={true} />
                                            </div>
                                          </div>
                                        </div>
                                        {sIdx < steps.length - 1 && (
                                          <div className="flex justify-center my-1 select-none">
                                            <span className="text-rose-500/40 text-[11px] font-black">↓</span>
                                          </div>
                                        )}
                                      </React.Fragment>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 3. 비교표 / 장단점 */}
                              {parsed.comparison && (() => {
                                const mdTable = parseMarkdownTable(parsed.comparison);
                                if (mdTable && mdTable.tableData && mdTable.tableData.headers) {
                                  const { headers, rows } = mdTable.tableData;
                                  return (
                                    <div className="text-slate-200 py-1.5 px-0.5 w-full">
                                      <span className="text-[10px] text-emerald-400 font-black block mb-1.5 uppercase tracking-wider select-none">⚖️ 비교표 / 장단점</span>
                                      <div className="w-full my-2 rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden overflow-x-auto scrollbar-thin">
                                        <table className="w-full text-center border-collapse text-[14px] md:text-[16px] min-w-full">
                                          <thead>
                                            <tr className="bg-slate-900/80 text-slate-355 border-b border-slate-800">
                                              {headers.map((h, hIdx) => (
                                                <th 
                                                  key={hIdx} 
                                                  className="p-2 sm:p-2.5 font-extrabold border-r border-slate-800 last:border-r-0 whitespace-normal break-words min-w-[90px]"
                                                >
                                                  <LatexRenderer text={h} katexLoaded={katexLoaded} />
                                                </th>
                                              ))}
                                              <th className="p-2 sm:p-2.5 font-extrabold text-rose-400 select-none whitespace-nowrap w-16">
                                                비고
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {rows.map((row, rIdx) => (
                                              <tr key={rIdx} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900/20 group">
                                                {row.map((cell, cIdx) => {
                                                  const isHeader = cIdx === 0;
                                                  if (isHeader) {
                                                    return (
                                                      <td key={cIdx} className="p-2 sm:p-2.5 border-r border-slate-800 font-extrabold text-slate-300 select-text whitespace-normal break-words align-middle text-left bg-slate-950/20">
                                                        <LatexRenderer text={cell} katexLoaded={katexLoaded} />
                                                      </td>
                                                    );
                                                  }
                                                  return (
                                                    <td key={cIdx} className="p-2 sm:p-2.5 border-r border-slate-800 last:border-r-0 text-slate-200 select-text whitespace-normal break-words align-middle text-center">
                                                      <LatexRenderer text={cell} katexLoaded={katexLoaded} />
                                                    </td>
                                                  );
                                                })}
                                                <td className="p-2 sm:p-2.5 text-center align-middle whitespace-nowrap bg-slate-950/10">
                                                  <button
                                                    onClick={async () => {
                                                      const currentWindow = window;
                                                      if (currentWindow.confirm(`'${row[0] || '이 행'}' 행을 삭제하시겠습니까?`)) {
                                                        const updatedRows = rows.filter((_, idx) => idx !== rIdx);
                                                        const newCompTableMd = rebuildMarkdownTable(headers, updatedRows, '<br>');
                                                        let newContent = ov.content;
                                                        let replaced = false;

                                                        const lines = ov.content.split('\n');
                                                        const compIdx = lines.findIndex(line => line.trim().match(/^\|\s*(비교표|비교|장단점)\s*\|/i));

                                                        if (compIdx !== -1) {
                                                          const line = lines[compIdx].trim();
                                                          const match = line.match(/^(\|\s*(비교표|비교|장단점)\s*\|)(.*)\|$/i);
                                                          if (match) {
                                                            lines[compIdx] = `${match[1]} ${newCompTableMd.trim()} |`;
                                                            newContent = lines.join('\n');
                                                            replaced = true;
                                                          }
                                                        }

                                                        if (!replaced) {
                                                          const match = ov.content.match(/^([\s\S]*\|\s*(비교표|비교|장단점)\s*\|)(.*?)(?=\s*\|\s*(공학적 의미\/한계성|공학적 의미 및 한계성|의미\/한계성|직관적의미|직관적)\s*\||$)/i);
                                                          if (match) {
                                                            let nestedPart = match[3].trim();
                                                            if (nestedPart.endsWith('|')) {
                                                              nestedPart = nestedPart.slice(0, -1).trim();
                                                            }
                                                            newContent = ov.content.replace(nestedPart, newCompTableMd.trim());
                                                            replaced = true;
                                                          }
                                                        }

                                                        const updated = formulaOverviews.map(item => item.id === ov.id ? { ...item, content: newContent } : item);
                                                        setFormulaOverviews(updated);
                                                        await handleSaveFormulaOverviews(updated, false);
                                                        showNotification('행이 삭제되었습니다.', 'info');
                                                      }
                                                    }}
                                                    className="p-1 rounded bg-slate-850 hover:bg-rose-950 text-slate-400 hover:text-rose-400 cursor-pointer transition-all border border-slate-800 hover:border-rose-500/20 md:opacity-0 md:group-hover:opacity-100 opacity-100 flex items-center justify-center mx-auto shrink-0"
                                                    title="행 삭제"
                                                  >
                                                    <Trash2 size={11} />
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  );
                                }
                                return (
                                  <div className="text-slate-200 py-1.5 px-0.5">
                                    <span className="text-[10px] text-emerald-400 font-black block mb-1.5 uppercase tracking-wider select-none">⚖️ 비교표 / 장단점</span>
                                    <div className="text-slate-250 leading-relaxed font-normal">
                                      <LatexRenderer text={parsed.comparison} katexLoaded={katexLoaded} isMarkdown={true} hideTableWrapper={true} />
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* 4. 공학적 의미/한계성 */}
                              {parsed.significance && (
                                <div className="text-slate-200 py-1 px-0.5">
                                  <span className="text-[10px] text-amber-400 font-black block mb-1.5 uppercase tracking-wider select-none">💡 공학적 의미 및 한계성</span>
                                  <div className="text-slate-200 leading-relaxed font-semibold">
                                    <LatexRenderer text={parsed.significance} katexLoaded={katexLoaded} isMarkdown={true} />
                                  </div>
                                </div>
                              )}

                              {/* 5. 직관적 의미 */}
                              {parsed.intuitive && (
                                <div className="text-slate-200 py-1 px-0.5">
                                  <span className="text-[10px] text-indigo-400 font-black block mb-1.5 uppercase tracking-wider select-none">🧠 직관적 의미</span>
                                  <div className="text-slate-200 leading-relaxed font-semibold">
                                    <LatexRenderer text={parsed.intuitive} katexLoaded={katexLoaded} isMarkdown={true} />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Fallback
                        return (
                          <div className="text-slate-355 text-[14px] md:text-[16px] leading-relaxed whitespace-pre-wrap select-text border border-slate-800 bg-slate-950/40 p-4 rounded-xl animate-fade-in markdown-body text-left">
                            <LatexRenderer text={ov.content} isMarkdown={true} formulaSource="tutor" hideTableWrapper={true} />
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
            </div>
          )
        )}

        {/* TAB 4: IMAGES */}
        {subTab === 'image' && (
          <div className="w-full pb-10">
            <ImageTabList
              formulaImages={formulaImages}
              setFormulaImages={setFormulaImages}
              handleSaveFormulaImages={handleSaveFormulaImages}
              showNotification={showNotification}
              API_BASE={API_BASE}
              LatexRenderer={LatexRenderer}
              katexLoaded={katexLoaded}
              formulaSearchQuery={searchQuery}
            />
          </div>
        )}
        
      </div>
      </div>
    );

    if (activeUsePopout) {
      return (
        <PopoutWindow
          title="플로팅 암기자료 팝업"
          onClose={onClose}
          initWidth={720}
          initHeight={650}
          storageKey="anti_popout_memorization"
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
          zIndex: 9998,
          touchAction: 'none'
        }}
        className="floating-memorization-popup w-[92vw] md:w-[720px] h-[80vh] md:h-[650px] bg-slate-900/95 border border-slate-700/60 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden backdrop-blur-md transition-shadow duration-300 hover:shadow-violet-500/10 hover:border-violet-500/20"
      >
        {content}
      </div>
    );
  }
