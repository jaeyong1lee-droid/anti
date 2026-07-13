import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Trash2, RefreshCw, Clipboard, FileText, Sparkles, ChevronDown, ChevronUp, Search } from 'lucide-react';

// 1. PC Right-side Upload Panel
export function ImageUploadPanel({ formulaImages, setFormulaImages, handleSaveFormulaImages, API_BASE, showNotification, compact = false }) {
  const [images, setImages] = useState([]);
  const [description, setDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const pasteAreaRef = useRef(null);

  // Handle Ctrl+V Paste inside the document/panel
  useEffect(() => {
    const handlePaste = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'textarea' || activeTag === 'input') {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => {
            setImages(prev => [...prev, event.target.result]);
            showNotification('클립보드 스크린샷이 성공적으로 붙여넣어졌습니다.', 'success');
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [showNotification]);

  const handleRegisterImageCard = async () => {
    if (images.length === 0) {
      showNotification('먼저 클립보드 스크린샷을 붙여넣으세요.', 'warning');
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/api/image-standards/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Images: images,
          description: description.trim()
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'AI 이미지 분석에 실패했습니다.');
      }

      const result = await res.json();
      if (result.ok) {
        const newCard = {
          id: `img_${Date.now()}`,
          title: result.title,
          base64Images: images,
          description: description.trim(),
          analysis: result.analysis,
          intuitive: result.intuitive
        };

        const updated = [newCard, ...formulaImages];
        setFormulaImages(updated);
        await handleSaveFormulaImages(updated, false);

        // Reset inputs
        setImages([]);
        setDescription('');
        showNotification(`[${result.title}] 그림 카드가 성공적으로 등록되었습니다.`, 'success');
      }
    } catch (err) {
      console.error(err);
      showNotification(err.message, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className={`bg-slateCustom-900/60 border border-slate-800 rounded-2xl text-left animate-fade-in w-full ${
      compact ? 'p-3 space-y-2.5' : 'p-5 md:p-6 space-y-5'
    }`}>
      <div className={`border-b border-slate-800/80 flex items-center justify-between ${compact ? 'pb-2' : 'pb-3'}`}>
        <div>
          <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-extrabold text-white flex items-center gap-1.5`}>
            <ImageIcon size={compact ? 12 : 14} className="text-brand-400" />
            <span>필수 암기 그림 등록</span>
          </h3>
          {!compact && (
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              클립보드 이미지를 복사하여 붙여넣고 AI 분석 결과를 그림 카드로 등록하세요.
            </p>
          )}
        </div>
      </div>

      {/* Paste Dropzone */}
      <div
        ref={pasteAreaRef}
        tabIndex={0}
        className={`relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all duration-200 focus:outline-none cursor-pointer select-none ${
          compact ? 'p-3 min-h-[80px] gap-1.5' : 'p-6 min-h-[160px] gap-3'
        } ${
          images.length > 0 
            ? 'border-indigo-500/50 bg-indigo-950/10' 
            : 'border-slate-700/60 hover:border-slate-600 bg-slate-950/30 focus:border-brand-500/50 focus:bg-slate-950/50'
        }`}
      >
        {images.length > 0 ? (
          <div className="w-full flex flex-col gap-2 overflow-y-auto max-h-[300px] p-1">
            {images.map((src, index) => (
              <div key={index} className={`relative w-full flex items-center justify-center overflow-hidden rounded-lg border border-slate-800 ${compact ? 'max-h-[80px]' : 'max-h-[140px]'}`}>
                <img src={src} className={`${compact ? 'max-h-[70px]' : 'max-h-[130px]'} object-contain rounded`} alt={`Pasted preview ${index + 1}`} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImages(prev => prev.filter((_, idx) => idx !== index));
                  }}
                  className="absolute top-1 right-1 p-1 bg-slate-950/80 hover:bg-rose-900 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                  title="이미지 삭제"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center gap-1.5">
            <div className={`bg-slate-900 border border-slate-800 text-slate-400 rounded-xl ${compact ? 'p-1.5' : 'p-3'}`}>
              <Clipboard size={compact ? 15 : 22} className="animate-pulse" />
            </div>
            <div className="space-y-0.5">
              <p className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-bold text-white`}>클립보드 스크린샷 붙여넣기</p>
              {!compact && <p className="text-[10px] text-slate-400">클릭 후 단축키 Ctrl+V를 입력하세요 (2개 이상 가능)</p>}
            </div>
          </div>
        )}
      </div>

      {/* Description Textarea */}
      <div className="space-y-1">
        <label className="text-[10px] font-black text-slate-400 flex items-center gap-1 select-none">
          <FileText size={10} />
          <span>그림/그래프 추가 설명</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={compact ? "추가할 한글 참고사항 (공란 가능)" : "그림에 대한 참고사항이나 추가할 한글 내용을 입력해 보세요. (한글 전용, 공란 가능)"}
          rows={compact ? 1 : 3}
          disabled={isAnalyzing}
          className="w-full bg-slateCustom-950 border border-slate-700 text-white placeholder-slate-500 text-[11px] rounded-xl p-2 focus:outline-none focus:border-brand-500 transition-all font-semibold resize-none"
        />
      </div>

      {/* Submit Button */}
      <button
        onClick={handleRegisterImageCard}
        disabled={isAnalyzing || images.length === 0}
        className={`w-full rounded-xl font-black text-[11px] transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 border-none shadow-md ${
          compact ? 'py-1.5' : 'py-2.5'
        } ${
          isAnalyzing
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : images.length > 0
              ? 'bg-gradient-to-tr from-brand-600 to-indigo-500 hover:from-brand-500 hover:to-indigo-400 text-white active:scale-95'
              : 'bg-slate-800 text-slate-400 cursor-not-allowed opacity-50'
        }`}
      >
        {isAnalyzing ? (
          <>
            <RefreshCw className="animate-spin" size={12} />
            <span>AI 정밀 분석 중...</span>
          </>
        ) : (
          <>
            <Sparkles size={12} />
            <span>그림 암기 카드로 등록</span>
          </>
        )}
      </button>
    </div>
  );
}

// 2. Memorization Modal -> "그림" Subtab list
export function ImageTabList({ formulaImages, setFormulaImages, handleSaveFormulaImages, showNotification, API_BASE, LatexRenderer, katexLoaded, formulaSearchQuery = '' }) {
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [refreshingId, setRefreshingId] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState({});

  const getFullImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('/')) {
      const base = API_BASE ? (API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE) : '';
      return `${base}${url}`;
    }
    return url;
  };

  const toggleCollapse = (id) => {
    setCollapsedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleDeleteImageCard = async (id, title) => {
    if (window.confirm(`[${title}] 그림 카드를 필수암기 리스트에서 삭제하시겠습니까?`)) {
      const updated = formulaImages.filter(x => x.id !== id);
      setFormulaImages(updated);
      await handleSaveFormulaImages(updated, false);
      showNotification(`[${title}] 그림 카드가 삭제되었습니다.`, 'info');
    }
  };

  const handleFinishEditingTitle = async (id) => {
    const trimmed = editingText.trim();
    if (trimmed) {
      const updated = formulaImages.map(item => item.id === id ? { ...item, title: trimmed } : item);
      setFormulaImages(updated);
      await handleSaveFormulaImages(updated, false);
      setEditingId(null);
      showNotification('그림 카드 제목이 수정되었습니다.', 'success');
    }
  };

  const handleRefreshImageCard = async (id, base64Images, base64Image, description, title) => {
    setRefreshingId(id);
    try {
      const imgs = base64Images || (base64Image ? [base64Image] : []);
      const res = await fetch(`${API_BASE}/api/image-standards/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Images: imgs,
          description: (description || '').trim()
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'AI 이미지 재분석에 실패했습니다.');
      }

      const result = await res.json();
      if (result.ok) {
        const updated = formulaImages.map(item => {
          if (item.id === id) {
            return {
              ...item,
              title: result.title,
              analysis: result.analysis,
              intuitive: result.intuitive
            };
          }
          return item;
        });
        setFormulaImages(updated);
        await handleSaveFormulaImages(updated, false);
        showNotification(`[${result.title}] 그림 카드가 성공적으로 재분석되었습니다.`, 'success');
      }
    } catch (err) {
      console.error(err);
      showNotification(err.message, 'error');
    } finally {
      setRefreshingId(null);
    }
  };

  const filteredImages = formulaImages.filter(img => {
    const query = formulaSearchQuery.toLowerCase().trim();
    if (!query) return true;
    const idMatch = String(img.id).toLowerCase() === query;
    const textMatch = (img.title || '').toLowerCase().includes(query) ||
           (img.analysis || '').toLowerCase().includes(query) ||
           (img.intuitive || '').toLowerCase().includes(query) ||
           (img.description || '').toLowerCase().includes(query);
    return idMatch || textMatch;
  });

  if (!formulaImages || formulaImages.length === 0) {
    return (
      <div className="w-full bg-slateCustom-900 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-4">
        <div className="border-b border-slate-800/80 pb-3 text-left">
          <h2 className="text-base md:text-lg font-black text-white">필수 암기 그림</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            암기 및 이해를 돕기 위한 필수 공학 그림 자료입니다.
          </p>
        </div>
        <div className="py-24 text-center flex flex-col items-center justify-center gap-4 text-center animate-scale-up">
          <div className="p-5 bg-slateCustom-950/60 border border-slate-800 text-slate-500 rounded-full flex items-center justify-center select-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" className="text-slate-500">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </div>
          <div>
            <h4 className="text-lg font-bold text-white">보관된 그림이 없습니다</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              PC 환경의 우측 <strong>[필수 암기 그림 등록]</strong> 패널에서 클립보드 복사(Ctrl+V)를 활용하여 중요한 그림을 이곳에 보관할 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (filteredImages.length === 0) {
    return (
      <div className="w-full bg-slateCustom-900 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-4">
        <div className="border-b border-slate-800/80 pb-3 text-left">
          <h2 className="text-base md:text-lg font-black text-white">필수 암기 그림</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            암기 및 이해를 돕기 위한 필수 공학 그림 자료입니다.
          </p>
        </div>
        <div className="py-24 text-center flex flex-col items-center justify-center gap-4 text-center animate-scale-up">
          <div className="p-5 bg-slateCustom-950/60 border border-slate-800 text-slate-500 rounded-full flex items-center justify-center select-none animate-scale-up">
            <Search size={32} />
          </div>
          <div>
            <h4 className="text-lg font-bold text-white">검색 결과가 없습니다</h4>
            <p className="text-xs text-slate-400 mt-1">다른 검색어로 검색하시거나 검색어를 확인해 보세요.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-slateCustom-900 border border-slate-800 rounded-2xl divide-y divide-slate-800/80 overflow-hidden animate-fade-in">
      {filteredImages.map((img, idx) => {
        const isEditing = editingId === img.id;
        return (
          <div key={img.id} className="px-2.5 py-4 sm:p-5 md:p-6 space-y-4 w-full text-left">
            
            {/* Header Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-start gap-2.5 md:flex-1 min-w-0">
                <span className="text-[11px] font-black bg-rose-955/80 text-rose-455 px-2.5 py-1 rounded-lg border border-rose-500/20 shrink-0 select-none">
                  I{idx + 1}
                </span>
                <div className="flex-grow min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-2 w-full">
                      <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleFinishEditingTitle(img.id);
                          else if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="bg-slate-950 border border-slate-700 text-white rounded px-2 py-1 text-sm font-bold focus:outline-none focus:border-rose-500 flex-1 max-w-[360px]"
                        autoFocus
                      />
                      <button
                        onClick={() => handleFinishEditingTitle(img.id)}
                        className="px-2 py-1 bg-emerald-600 text-white text-xs font-bold rounded hover:bg-emerald-500 transition-colors shrink-0 cursor-pointer"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold rounded hover:bg-slate-700 transition-colors shrink-0 cursor-pointer"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
                      <span
                        onDoubleClick={() => {
                          setEditingId(img.id);
                          setEditingText(img.title || '');
                        }}
                        className="text-[14px] md:text-[16px] font-extrabold text-white leading-snug cursor-pointer hover:text-rose-455 hover:underline transition-all whitespace-normal break-words max-w-full inline-block"
                        title="더블클릭하여 제목 수정"
                      >
                        {img.title}
                      </span>

                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 self-end md:self-auto shrink-0 select-none">
                <button
                  onClick={() => toggleCollapse(img.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-455 hover:bg-rose-500/10 hover:border-rose-500/20 border border-slate-700/50 bg-slate-800/40 transition-all cursor-pointer text-[11px] font-bold flex items-center gap-1"
                  title={collapsedIds[img.id] ? "상세 정보 펼치기" : "상세 정보 접기"}
                >
                  {collapsedIds[img.id] ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                  <span>{collapsedIds[img.id] ? '열기' : '접기'}</span>
                </button>

                <button
                  onClick={() => handleRefreshImageCard(img.id, img.base64Images, img.base64Image, img.description, img.title)}
                  disabled={refreshingId === img.id}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-455 hover:bg-rose-500/10 hover:border-rose-500/20 border border-slate-700/50 bg-slate-800/40 transition-all cursor-pointer text-[11px] font-bold flex items-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
                  title="AI 재분석 (새로고침)"
                >
                  <RefreshCw size={12} className={refreshingId === img.id ? "animate-spin text-rose-500" : ""} />
                  <span>새로고침</span>
                </button>

                <button
                  onClick={() => handleDeleteImageCard(img.id, img.title)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-455 hover:bg-rose-500/10 hover:border-rose-500/20 border border-slate-700/50 bg-slate-800/40 transition-all cursor-pointer text-[11px] font-bold flex items-center gap-1"
                  title="그림 삭제"
                >
                  <Trash2 size={12} />
                  <span>삭제</span>
                </button>
              </div>
            </div>

            {/* 2-Column Comparison Layout (Left: Image, Right: AI Analysis & Metaphor) */}
            {!collapsedIds[img.id] && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start w-full animate-fade-in">
                {/* Left Column: Image(s) stacked vertically */}
                <div className="flex flex-col gap-3 w-full">
                  {(img.base64Images || [img.base64Image]).filter(Boolean).map((src, index) => (
                    <div key={index} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40 p-2 flex items-center justify-center max-h-[340px] w-full select-none">
                      <img
                        src={src}
                        className="max-h-[320px] object-contain rounded-lg max-w-full hover:scale-[1.02] transition-transform duration-300"
                        alt={`${img.title} - ${index + 1}`}
                      />
                    </div>
                  ))}
                </div>

                {/* Right Column: AI Analysis */}
                <div className="flex flex-col gap-3">
                  {/* 1. AI Analysis details */}
                  <div className="bg-slate-900/40 border border-slate-800/60 p-3.5 rounded-xl text-slate-200 text-[14px] leading-relaxed text-left">
                    <span className="text-[10px] text-slate-400 font-black block mb-1.5 uppercase tracking-wider select-none">📊 그림/그래프 공학적 분석</span>
                    {LatexRenderer ? (
                      <div className="text-white leading-relaxed select-text font-semibold">
                        <LatexRenderer text={img.analysis} katexLoaded={katexLoaded} isMarkdown={true} formulaSource="tutor" hideTableWrapper={true} />
                      </div>
                    ) : (
                      <p className="font-bold text-white leading-relaxed whitespace-pre-line select-text">{img.analysis}</p>
                    )}
                  </div>

                  {/* 2. Intuitive metaphors */}
                  <div className="bg-violet-950/15 border border-violet-500/10 p-3.5 rounded-xl text-slate-355 text-[14px] font-medium leading-relaxed text-left">
                    <span className="text-[10px] text-violet-400 font-extrabold block mb-1.5 uppercase tracking-wider select-none">💡 직관적 본질 (비유)</span>
                    {LatexRenderer ? (
                      <div className="text-slate-300 leading-relaxed select-text">
                        <LatexRenderer text={img.intuitive} katexLoaded={katexLoaded} isMarkdown={true} formulaSource="tutor" hideTableWrapper={true} />
                      </div>
                    ) : (
                      <p className="text-slate-300 leading-relaxed select-text">{img.intuitive}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        );
      })}
    </div>
  );
}
