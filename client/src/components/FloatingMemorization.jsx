import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Search, RefreshCw, Trash2, BookOpen, Type, FileText, Image, ChevronDown, ChevronUp, Layers, HelpCircle
} from 'lucide-react';
import { ImageTabList } from './ImageStandardsPlugin';

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

  const [subTab, setSubTab] = useState(() => {
    return localStorage.getItem('anti_memorization_sub_tab') || 'table';
  });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    localStorage.setItem('anti_memorization_sub_tab', subTab);
  }, [subTab]);

  useEffect(() => {
    if (isVisible && focusedQuestion) {
      const qText = (focusedQuestion.question || '').toLowerCase();
      const qType = (focusedQuestion.type || '').toLowerCase();
      const qSubtype = (focusedQuestion.subtype || '').toLowerCase();
      const qTitle = (focusedQuestion.title || '').toLowerCase();
      
      let targetTab = 'table';
      
      // Decide targetTab based on type and content
      if (qType.includes('앞글자') || qType.includes('acronym') || qSubtype.includes('앞글자') || qText.includes('두문자') || qText.includes('앞글자')) {
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

  return (
    <div
      ref={dragRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9998,
        touchAction: 'none',
        display: isVisible ? 'flex' : 'none'
      }}
      className="w-[92vw] md:w-[720px] h-[80vh] md:h-[650px] bg-slate-900/95 border border-slate-700/60 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden backdrop-blur-md transition-shadow duration-300 hover:shadow-violet-500/10 hover:border-violet-500/20"
    >
      {/* Header / Drag Handle */}
      <div 
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="drag-handle flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-900/80 to-indigo-900/80 border-b border-violet-800/50 cursor-move select-none"
      >
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-violet-400" />
          <span className="text-xs text-white font-extrabold tracking-wider">플로팅 암기자료 팝업</span>
          <span className="text-[9px] font-black text-slate-400 bg-slate-950/40 px-1.5 py-0.5 rounded border border-slate-800">Review Companion</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>

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
              onClick={() => { setSubTab(tab.id); setLocalActiveEditCell(null); }}
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
          ) : formulaTables.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <FileText size={24} className="text-slate-600" />
              <h4 className="text-sm font-bold text-slate-300">저장된 표가 없습니다</h4>
            </div>
          ) : formulaTables.filter(t => {
            const query = searchQuery.toLowerCase();
            return (t.title || '').toLowerCase().includes(query) || (t.html || '').toLowerCase().includes(query);
          }).length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <Search size={24} className="text-slate-600" />
              <h4 className="text-sm font-bold text-slate-350">검색 결과가 없습니다</h4>
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
                            <h4 
                              onClick={() => { setEditingTableIdx(idx); setEditingTableText(t.title); }}
                              className="text-[12px] font-black text-white hover:text-violet-300 transition-colors cursor-pointer truncate"
                              title="클릭하여 제목 수정"
                            >
                              {t.title}
                            </h4>
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
                            onClick={async () => {
                              if (window.confirm('이 표 카드를 삭제하시겠습니까?')) {
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
                                          onClick={() => {
                                            if (window.confirm('이 행을 삭제하시겠습니까?')) {
                                              const updatedRows = parsed.rows.filter((_, idx) => idx !== rIdx);
                                              const newHtml = rebuildTableHtml(parsed.headers, updatedRows);
                                              const updatedTables = formulaTables.map(item => item.id === t.id ? { ...item, html: newHtml } : item);
                                              setFormulaTables(updatedTables);
                                              handleSaveFormulaTables(updatedTables, false);
                                            }
                                          }}
                                          className="p-0.5 rounded bg-red-950/40 text-red-400 hover:bg-red-900 border border-red-500/10 cursor-pointer"
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
            const query = searchQuery.toLowerCase();
            return (ac.title || '').toLowerCase().includes(query) || (ac.content || '').toLowerCase().includes(query);
          }).length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <Search size={24} className="text-slate-600" />
              <h4 className="text-sm font-bold text-slate-355">검색 결과가 없습니다</h4>
            </div>
          ) : (
            <div className="space-y-4 w-full">
              {formulaAcronyms
                .filter(ac => {
                  const query = searchQuery.toLowerCase();
                  return (ac.title || '').toLowerCase().includes(query) || (ac.content || '').toLowerCase().includes(query);
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
                      {ac.isLoading && (
                        <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px] flex flex-col items-center justify-center gap-3 z-20">
                          <RefreshCw className="animate-spin text-emerald-450" size={20} />
                          <span className="text-[10px] font-bold text-slate-300">AI가 재조합하는 중...</span>
                        </div>
                      )}
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
                            <h4 
                              onClick={() => { setEditingAcronymId(ac.id); setEditingAcronymText(ac.title); }}
                              className="text-[12px] font-black text-white hover:text-emerald-300 transition-colors cursor-pointer truncate"
                              title="클릭하여 제목 수정"
                            >
                              {ac.title}
                            </h4>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteAcronymCard(ac.id, ac.title)}
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

                        <div className="overflow-x-auto w-full border border-slate-800 bg-slate-950/40 rounded-xl select-text text-[14px] md:text-[16px]">
                          <table className="w-full text-left border-collapse table-fixed min-w-[500px]">
                            <colgroup>
                              <col style={{ width: '42px' }} />
                              <col style={{ width: '130px' }} />
                              <col />
                              <col style={{ width: '80px' }} />
                            </colgroup>
                            <thead>
                              <tr className="bg-slate-900/60 border-b border-slate-800 text-[11px] font-black text-slate-400 select-none">
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
                                        className="w-full text-center bg-transparent border-0 text-slate-100 font-extrabold focus:outline-none p-0 text-[14px] md:text-[16px]"
                                      />
                                    </td>
                                    <td className="p-1 border-r border-slate-850">
                                      <input
                                        type="text"
                                        value={rowVal.word}
                                        onChange={(e) => handleUpdateAcronymRowCell(ac.id, rIdx, 'word', e.target.value)}
                                        className="w-full bg-transparent border-0 text-slate-200 font-bold focus:outline-none p-0 text-[14px] md:text-[16px]"
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
                                        className="w-full bg-transparent border-0 text-slate-300 focus:outline-none p-0 text-[14px] md:text-[16px] resize-none overflow-hidden"
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
                                          onClick={() => {
                                            if (window.confirm('이 행을 삭제하시겠습니까?')) {
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
            const query = searchQuery.toLowerCase();
            return (ov.title || '').toLowerCase().includes(query) || (ov.content || '').toLowerCase().includes(query);
          }).length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <Search size={24} className="text-slate-600" />
              <h4 className="text-sm font-bold text-slate-350">검색 결과가 없습니다</h4>
            </div>
          ) : (
            <div className="space-y-4 w-full">
              {formulaOverviews
                .filter(ov => {
                  const query = searchQuery.toLowerCase();
                  return (ov.title || '').toLowerCase().includes(query) || (ov.content || '').toLowerCase().includes(query);
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
                          <h4 
                            onClick={() => {
                              setLocalEditingOverviewId(ov.id);
                              setLocalEditingOverviewText(ov.title);
                              setLocalEditingOverviewContent(ov.content);
                            }}
                            className="text-[12px] font-black text-white hover:text-rose-300 transition-colors cursor-pointer truncate"
                            title="클릭하여 내용 및 제목 수정"
                          >
                            {ov.title}
                          </h4>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => toggleOverviewCollapse(ov.id)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                          <button
                            onClick={async () => {
                              if (window.confirm('이 개요 카드를 삭제하시겠습니까?')) {
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

                      {isExpanded && !isEditing && (
                        <div className="text-slate-355 text-[14px] md:text-[16px] leading-relaxed whitespace-pre-wrap select-text border border-slate-800 bg-slate-950/40 p-4 rounded-xl animate-fade-in markdown-body text-left">
                          <LatexRenderer text={ov.content} isMarkdown={true} formulaSource="tutor" hideTableWrapper={true} />
                        </div>
                      )}
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
}
