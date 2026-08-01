import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Trash2, RefreshCw, Clipboard, FileText, Sparkles, ChevronDown, ChevronUp, Search } from 'lucide-react';

// 1. PC Right-side Upload Panel
export function ImageUploadPanel({ formulaImages, setFormulaImages, handleSaveFormulaImages, API_BASE, showNotification, compact = false }) {
  const [images, setImages] = useState([]);
  const [description, setDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showClipboardModal, setShowClipboardModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const pasteAreaRef = useRef(null);
  const fileInputRefLeft = useRef(null);
  const fileInputRefModal = useRef(null);
  const modalPasteAreaRef = useRef(null);

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
            showNotification('클립보드 스크린샷이 붙여넣어졌습니다.', 'success');
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

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setImages(prev => [...prev, event.target.result]);
          showNotification('이미지가 성공적으로 추가되었습니다.', 'success');
        };
        reader.readAsDataURL(file);
      }
    }
    e.target.value = '';
  };

  const handleReadClipboardRight = async () => {
    let successCount = 0;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              const reader = new FileReader();
              reader.onload = (e) => {
                setImages(prev => [...prev, e.target.result]);
                showNotification('클립보드 이미지를 가져왔습니다.', 'success');
              };
              reader.readAsDataURL(blob);
              successCount++;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Direct clipboard.read failed or permission denied:', err);
    }

    if (successCount === 0) {
      setShowClipboardModal(true);
    }
  };

  const handleModalAreaPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    let hasImage = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          setImages(prev => [...prev, event.target.result]);
          setShowClipboardModal(false);
          showNotification('클립보드 스크린샷이 붙여넣어졌습니다.', 'success');
        };
        reader.readAsDataURL(file);
        hasImage = true;
        break;
      }
    }
    if (!hasImage) {
      const text = e.clipboardData?.getData('text');
      if (text && (text.startsWith('data:image/') || text.startsWith('http://') || text.startsWith('https://'))) {
        setImages(prev => [...prev, text.trim()]);
        setShowClipboardModal(false);
        showNotification('클립보드 이미지 링크가 추가되었습니다.', 'success');
      }
    }
  };

  const handleModalPasteTextSubmit = () => {
    const val = pasteText.trim();
    if (!val) {
      showNotification('붙여넣을 이미지 URL 또는 Base64 텍스트를 입력하세요.', 'warning');
      return;
    }
    if (val.startsWith('data:image/') || val.startsWith('http://') || val.startsWith('https://')) {
      setImages(prev => [...prev, val]);
      setPasteText('');
      setShowClipboardModal(false);
      showNotification('이미지가 추가되었습니다.', 'success');
    } else {
      showNotification('올바른 이미지 URL 또는 Data URI 형식이어야 합니다.', 'error');
    }
  };

  const handleRegisterImageCard = async () => {
    if (images.length === 0) {
      showNotification('먼저 스크린샷이나 이미지를 추가하세요.', 'warning');
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

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRefLeft}
        onChange={handleFileChange}
        accept="image/*"
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={fileInputRefModal}
        onChange={(e) => {
          handleFileChange(e);
          setShowClipboardModal(false);
        }}
        accept="image/*"
        multiple
        className="hidden"
      />

      {/* 2-Column Upload Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full select-none">
        {/* Left Box: Ctrl+V 붙여넣기 전용 영역 */}
        <div
          ref={pasteAreaRef}
          tabIndex={0}
          onClick={() => {
            pasteAreaRef.current?.focus();
          }}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = (event) => {
                  setImages(prev => [...prev, event.target.result]);
                  showNotification('클립보드 스크린샷이 붙여넣어졌습니다.', 'success');
                };
                reader.readAsDataURL(file);
                break;
              }
            }
          }}
          className={`relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer ${
            compact ? 'p-2.5 min-h-[90px] gap-1.5' : 'p-4 min-h-[130px] gap-2'
          } ${
            images.length > 0 
              ? 'border-indigo-500/50 bg-indigo-950/15 hover:border-indigo-400' 
              : 'border-slate-700/70 hover:border-slate-500 bg-slate-950/30 hover:bg-slate-950/50'
          }`}
          title="클릭하여 키보드 초점 설정 후 [Ctrl+V]를 누르세요"
        >
          <div className="bg-slate-900 border border-slate-800 text-slate-350 rounded-xl p-2.5">
            <Clipboard size={compact ? 16 : 20} className="text-indigo-400" />
          </div>
          <div className="text-center space-y-1">
            <p className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-extrabold text-white`}>
              [Ctrl+V] 붙여넣기
            </p>
            <p className="text-[10px] text-slate-400">
              클릭 시 포커스 후 <span className="text-indigo-300 font-bold">[Ctrl+V]</span> 입력
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRefLeft.current?.click();
              }}
              className="mt-1 text-[10px] text-slate-350 hover:text-white cursor-pointer bg-slate-900 hover:bg-slate-800 px-2 py-0.5 rounded border border-slate-700/60 inline-flex items-center gap-1 transition-all active:scale-95"
              title="컴퓨터 파일 탐색기 열기"
            >
              📁 파일 직접 선택
            </button>
          </div>
        </div>

        {/* Right Box: 클립보드 팝업 선택 */}
        <div
          onClick={handleReadClipboardRight}
          className={`relative border-2 border-dashed border-amber-500/50 hover:border-amber-400 bg-amber-950/15 hover:bg-amber-950/25 rounded-xl flex flex-col items-center justify-center transition-all duration-200 cursor-pointer ${
            compact ? 'p-2.5 min-h-[90px] gap-1.5' : 'p-4 min-h-[130px] gap-2'
          }`}
          title="누르면 클립보드 읽기 또는 태블릿 팝업 띄우기"
        >
          <div className="bg-amber-900/40 border border-amber-500/40 text-amber-300 rounded-xl p-2.5">
            <Sparkles size={compact ? 16 : 20} className="text-amber-400 animate-pulse" />
          </div>
          <div className="text-center space-y-0.5">
            <p className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-black text-amber-300`}>
              📋 클립보드 팝업 선택
            </p>
            <p className="text-[10px] text-amber-400/80">
              누르면 클립보드 읽기 / 선택 팝업
            </p>
          </div>
        </div>
      </div>

      {/* Selected Images Preview */}
      {images.length > 0 && (
        <div className="w-full space-y-2 bg-slate-950/40 border border-indigo-500/30 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-300">
              🖼️ 선택된 이미지 ({images.length}개)
            </span>
            <button
              onClick={() => setImages([])}
              className="text-[10px] text-rose-400 hover:text-rose-300 underline cursor-pointer font-bold"
            >
              전체 삭제
            </button>
          </div>
          <div className="w-full flex flex-col gap-2 overflow-y-auto max-h-[260px]">
            {images.map((src, index) => (
              <div key={index} className="relative w-full flex items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950/80 p-1">
                <img src={src} className="max-h-[120px] object-contain rounded" alt={`Preview ${index + 1}`} />
                <button
                  onClick={() => setImages(prev => prev.filter((_, idx) => idx !== index))}
                  className="absolute top-1 right-1 p-1 bg-slate-950/90 hover:bg-rose-900 border border-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                  title="이미지 삭제"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Tablet Clipboard Selection Popup Modal */}
      {showClipboardModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in select-none">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                <Clipboard className="text-amber-400" size={18} />
                <span>태블릿 클립보드 & 이미지 선택 팝업</span>
              </h3>
              <button
                onClick={() => setShowClipboardModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer"
              >
                ✕ 닫기
              </button>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              태블릿 환경에서 아래 방법 중 편하신 방법으로 클립보드 스크린샷이나 이미지를 업로드하세요.
            </p>

            <div className="space-y-3">
              {/* Option 1: Gallery / Photo File Selector */}
              <button
                onClick={() => fileInputRefModal.current?.click()}
                className="w-full p-3.5 rounded-xl border border-indigo-500/40 bg-indigo-950/30 hover:bg-indigo-900/40 text-white text-xs font-bold flex items-center justify-between transition-all cursor-pointer shadow-sm active:scale-98"
              >
                <span className="flex items-center gap-2">
                  <ImageIcon size={16} className="text-indigo-400" />
                  <span>📱 1. 태블릿 앨범 / 갤러리에서 이미지 선택</span>
                </span>
                <span className="text-[10px] text-indigo-300 font-extrabold">파일 선택 →</span>
              </button>

              {/* Option 2: Long press paste box */}
              <div className="space-y-1.5 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                <label className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                  <FileText size={10} />
                  <span>📋 2. 터치 붙여넣기 전용 칸 (이곳을 길게 누르고 [붙여넣기])</span>
                </label>
                <textarea
                  ref={modalPasteAreaRef}
                  onPaste={handleModalAreaPaste}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="이곳을 길게 눌러 [붙여넣기]를 선택하세요..."
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-[11px] rounded-lg p-2.5 focus:outline-none focus:border-amber-500 font-semibold resize-none"
                  autoFocus
                />
                {pasteText.trim() && (
                  <button
                    onClick={handleModalPasteTextSubmit}
                    className="w-full mt-1.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold rounded-lg transition-colors cursor-pointer shadow-md"
                  >
                    붙여넣은 이미지 추가하기
                  </button>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowClipboardModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 2. Memorization Modal -> "그림" Subtab list
function parseFormulaAndParams(analysisText, titleText = '') {
  if (!analysisText && !titleText) return null;

  const cleanTitle = (titleText || '').toLowerCase();
  const cleanText = (analysisText || '').toLowerCase();

  // Case A: 지하시설물 매설 깊이별 점검 범위 (User's 1st screenshot example)
  if (cleanTitle.includes('지하시설물') || cleanTitle.includes('매설 깊이') || cleanText.includes('b + h') || cleanText.includes('조사범위')) {
    return {
      formulaTitle: '지반안전점검 조사범위',
      formulaText: '$W = B + H$',
      params: [
        { symbol: '$B$', desc: '관경/관폭 ($\\ge 500\\text{mm}$)' },
        { symbol: '$H$', desc: '관 하단까지의 매설 심도' },
        { symbol: '$\\frac{H}{2}$', desc: '관 양측으로의 토사 이완 영향 확장 범위' }
      ]
    };
  }

  // Case B: 테일러법 압밀계수 산정 (User's 2nd screenshot example)
  if (cleanTitle.includes('테일러') || cleanTitle.includes('압밀계수') || cleanText.includes('t_{90}') || cleanText.includes('t90')) {
    return {
      formulaTitle: '압밀계수 산정식',
      formulaText: '$c_v = \\frac{T_v H_{dr}^2}{t_{90}}$',
      params: [
        { symbol: '$\\sqrt{t_{90}}$', desc: '실험곡선과 1.15배 선이 만나는 교점의 시간 가로축' },
        { symbol: '$t_{90}$', desc: '압밀도 90% 소요 시간 (가로축 제곱값)' },
        { symbol: '$T_{90}$', desc: '압밀도 90% 시간계수 ($0.848$)' },
        { symbol: '$a = 1.15x$', desc: '초기 직선 기울기 1.15배 가공 직선' },
        { symbol: '$H_{dr}$', desc: '최대 배수거리 (단면배수: $H$, 양면배수: $H/2$)' }
      ]
    };
  }

  // Case C1: 다운홀 탐사 (Downhole Test / Seismic Downhole Logging)
  if (cleanTitle.includes('다운홀') || cleanTitle.includes('downhole') || cleanText.includes('다운홀')) {
    return {
      formulaTitle: '다운홀 탐사 파선 경로 및 보정 전파 시간식',
      formulaText: '$R = \\sqrt{D^2 + L^2}, \\quad T_C = T_D \\times \\frac{D}{R}$',
      params: [
        { symbol: '$D$', desc: '지표면으로부터 공내 수신기(지오폰)까지의 수직 심도 (Vertical Depth)' },
        { symbol: '$L$', desc: '타격 진원과 시추공구 사이의 수평 이격 거리 (Offset Distance, $1 \\sim 3\\text{m}$)' },
        { symbol: '$R$', desc: '타격 지점에서 공내 수신기까지의 경사 직선 파선 경로 ($R = \\sqrt{D^2 + L^2}$)' },
        { symbol: '$T_D, T_C$', desc: '실측 경사 도달 시간($T_D$) 및 수직 정위치 보정 전파 시간($T_C$)' }
      ]
    };
  }

  // Case C2: 주시 곡선 (Time-Distance Curve) / 탄성파 굴절법 (Refraction Method)
  if (cleanTitle.includes('주시') || cleanTitle.includes('굴절법') || cleanText.includes('v_1') || cleanText.includes('v_2') || cleanText.includes('x_c')) {
    return {
      formulaTitle: '탄성파 속도 및 파동 전파식',
      formulaText: '$v = \\frac{1}{\\text{기울기}}, \\quad v_2 > v_1$',
      params: [
        { symbol: '$V_1$', desc: '상부 토사층(Layer 1) 탄성파 전파 속도' },
        { symbol: '$V_2$', desc: '하부 암반층(Layer 2) 탄성파 전파 속도' },
        { symbol: '$x_c$', desc: '지층 경계 파동 굴절 교차 거리 (Critical Distance)' },
        { symbol: '$T$', desc: '발진점(Source)에서 수신기(Geophones)까지의 도달 시간' }
      ]
    };
  }

  // Case D: 토양 내 침투 흐름의 연속방정식 (User's 4th screenshot example I10)
  if (cleanTitle.includes('침투') || cleanTitle.includes('연속방정식') || cleanText.includes('q_{in}') || cleanText.includes('q_{out}') || cleanText.includes('dx\\cdot dy') || cleanText.includes('q_in') || cleanText.includes('q_out')) {
    return {
      formulaTitle: '침투 흐름의 연속방정식',
      formulaText: '$V = dx \\cdot dy \\cdot dz, \\quad \\frac{\\partial v_x}{\\partial x} + \\frac{\\partial v_z}{\\partial z} = 0$',
      params: [
        { symbol: '$q_{in}$', desc: '단위 시간당 미소 흙 요소 유입 유량' },
        { symbol: '$q_{out}$', desc: '단위 시간당 미소 흙 요소 유출 유량' },
        { symbol: '$dx, dy, dz$', desc: '미소 흙 요소 K의 세 방향 요소 직교 변 길이' },
        { symbol: '$V$', desc: '미소 흙 요소 전체 체적 ($dx \\cdot dy \\cdot dz$)' }
      ]
    };
  }

  // Case E: Q-시스템 기반 터널 지보 (Barton Q-system) (User's screenshot I16)
  if (cleanTitle.includes('q-시스템') || cleanTitle.includes('q-system') || cleanTitle.includes('터널 지보') || cleanText.includes('rqd') || cleanText.includes('esr') || cleanText.includes('지보 설계')) {
    return {
      formulaTitle: 'Q-시스템 암반 품질 평가식',
      formulaText: '$Q = \\frac{RQD}{J_n} \\times \\frac{J_r}{J_a} \\times \\frac{J_w}{SRF}$',
      params: [
        { symbol: '$\\frac{RQD}{J_n}$', desc: '암반의 구조적 블록 크기 지표 ($RQD$: 암질지수, $J_n$: 절리군 수)' },
        { symbol: '$\\frac{J_r}{J_a}$', desc: '절리면 마찰 특성 ($J_r$: 거칠기 계수, $J_a$: 변색/풍화 계수)' },
        { symbol: '$\\frac{J_w}{SRF}$', desc: '수리적 및 응력 상태 지표 ($J_w$: 지하수 지수, $SRF$: 응력저감계수)' },
        { symbol: '$De$', desc: '등가 치수 ($De = \\frac{\\text{터널 경간(Span)}}{\\text{굴착지원비(ESR)}}$)' }
      ]
    };
  }

  // Case F: 동결심도 산정 및 동결지수 (User's screenshot I14)
  if (cleanTitle.includes('동결') || cleanText.includes('동결지수') || cleanText.includes('동결심도') || cleanText.includes('c\\sqrt{f}') || cleanText.includes('c\\sqrt f')) {
    return {
      formulaTitle: '동결심도 경험 산정식',
      formulaText: '$Z = C \\sqrt{F}$',
      params: [
        { symbol: '$Z$', desc: '지반 내 노상 동결 깊이 (동결심도, $\\text{cm}$)' },
        { symbol: '$F$', desc: '누적 일평균기온 변화 지표 (동결지수, ${}^\\circ\\text{C}\\cdot\\text{day}$)' },
        { symbol: '$C$', desc: '지반 종류, 함수비, 밀도에 따른 동결계수 ($0.9 \\sim 1.1$)' },
        { symbol: '$t$', desc: '동결지속기간 (누적 온도 최고점부터 최저점까지)' }
      ]
    };
  }

  // Case G: 주동/수동 토압 및 작용점 (수동토압/주동토압 전용)
  if (cleanTitle.includes('토압') || cleanText.includes('수동토압') || cleanText.includes('주동토압') || cleanText.includes('p_p') || cleanText.includes('p_a') || cleanText.includes('y_a') || cleanText.includes('y_p')) {
    return {
      formulaTitle: '주동/수동 토압 및 작용점 산정식',
      formulaText: '$P_p = \\frac{1}{2}\\gamma H^2 K_p, \\quad P_a = \\frac{1}{2}\\gamma H^2 K_a$',
      params: [
        { symbol: '$P_p$', desc: '수동토압 합력 (Passive Earth Pressure)' },
        { symbol: '$P_a$', desc: '주동토압 합력 (Active Earth Pressure)' },
        { symbol: '$Y_a$', desc: '주동토압 합력 작용점 위치 ($H/3$)' },
        { symbol: '$Y_p$', desc: '수동토압 합력 작용점 위치 ($H/3$)' }
      ]
    };
  }

  // Case H: 점성토의 압밀곡선 및 침하량 산정 (User's latest screenshot)
  if (cleanTitle.includes('압밀곡선') || cleanTitle.includes('점성토') || cleanText.includes('1차 압밀') || cleanText.includes('2차 압밀') || cleanText.includes('간극수압') || cleanText.includes('침하량')) {
    return {
      formulaTitle: '점성토 1차 압밀 침하량 산정식',
      formulaText: '$S_c = \\frac{C_c}{1+e_0} H \\log\\left(\\frac{\\sigma_0\' + \\Delta\\sigma\'}{\\sigma_0\'}\\right)$',
      params: [
        { symbol: '$S_e$', desc: '하중 재하 직후 발생하는 즉시 침하량 (Elastic Settlement)' },
        { symbol: '$S_c$', desc: '과잉간극수압 소산에 의한 1차 압밀 침하량' },
        { symbol: '$S_s$', desc: '흙 입자의 장기적 재배열에 의한 2차 압밀 침하량' },
        { symbol: '$\\sigma\'$', desc: '시간 $t$ 경과에 따른 유효연직응력 ($\\sigma\' = \\sigma - u$)' }
      ]
    };
  }

  // Case I: General Dynamic Parser for any other Engineering Image
  let formulaText = '';
  const params = [];

  const mathRegex = /\$([^\$]+)\$/g;
  let match;
  const extractedMath = [];
  while ((match = mathRegex.exec(analysisText)) !== null) {
    const mStr = match[1].trim();
    if (mStr && !extractedMath.includes(mStr)) {
      extractedMath.push(mStr);
    }
  }

  const eq = extractedMath.find(m => m.includes('=') || m.includes('\\frac') || m.includes('+'));
  if (eq) {
    formulaText = `$${eq}$`;
  }

  const lines = (analysisText || '').split('\n').map(l => l.trim()).filter(Boolean);
  lines.forEach(line => {
    if (line.startsWith('본 그림') || line.startsWith('본 모식도')) return;
    if (line.includes(':') || line.includes('=')) {
      const cleanLine = line.replace(/^[\*\-\#\d\.\s]+/, '');
      const parts = cleanLine.split(/[:=]/);
      if (parts.length >= 2) {
        const sym = parts[0].trim();
        const desc = parts.slice(1).join(':').trim();
        if (sym.length < 45 && desc.length > 0 && desc.length < 120) {
          // Wrap in $...$ ONLY if sym contains pure math characters and no Korean text
          const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(sym);
          const formattedSymbol = (hasKorean || sym.startsWith('$')) ? sym.replace(/^\$|\$$/g, '') : (sym.includes('$') ? sym : `$${sym}$`);
          params.push({ symbol: formattedSymbol, desc });
        }
      }
    }
  });

  if (params.length === 0) {
    const symbolMapDesc = {
      'P_p': '수동토압 합력 (Passive Earth Pressure)',
      'P_a': '주동토압 합력 (Active Earth Pressure)',
      'Y_a': '주동토압 합력 작용점 위치',
      'Y_p': '수동토압 합력 작용점 위치',
      'q_{in}': '단위 시간당 흙 요소 유입 유량',
      'q_{out}': '단위 시간당 흙 요소 유출 유량',
      'dx': 'x축 방향 미소 요소 길이',
      'dy': 'y축 방향 미소 요소 길이',
      'dz': 'z축 방향 미소 요소 길이',
      'V_1': '상부 토사층 전파 속도',
      'V_2': '하부 암반층 전파 속도',
      'x_c': '지층 경계 변곡 교차 거리',
      'T': '파동 전파 도달 시간',
      'H': '지층 매설 심도 및 전고',
      'B': '구조물 관경 및 기초 폭',
      'c_v': '점성토 압밀 계수',
      't_{90}': '90% 압밀 도달 소요시간',
      'T_{90}': '시간계수 0.848 산정값'
    };

    const fallbackDescs = [
      '주요 설계 영역 측정 변수',
      '영향 수치 계수 지표',
      '기하학적 공간 수치 인자',
      '지반/구조 물리적 상태 지표'
    ];

    extractedMath.filter(m => m !== eq && m.length < 20).slice(0, 4).forEach((m, idx) => {
      const cleanKey = m.replace(/\$/g, '').trim();
      const desc = symbolMapDesc[cleanKey] || symbolMapDesc[cleanKey.toUpperCase()] || fallbackDescs[idx % fallbackDescs.length];
      params.push({ symbol: `$${cleanKey}$`, desc });
    });
  }

  if (!formulaText && params.length === 0) return null;

  return {
    formulaTitle: '공학적 상관 산정식',
    formulaText: formulaText || '$S = S_e + S_c + S_s$',
    params: params.slice(0, 4)
  };
}

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
                {/* Left Column: Image(s) stacked vertically + Idea 1: Core Formulas & Parameters Card */}
                <div className="flex flex-col gap-3 w-full">
                  {(img.base64Images || [img.base64Image]).filter(Boolean).map((src, index) => (
                    <div key={index} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40 p-2 flex items-center justify-center max-h-[340px] w-full select-none">
                      <img
                        src={getFullImageUrl(src)}
                        className="max-h-[320px] object-contain rounded-lg max-w-full hover:scale-[1.02] transition-transform duration-300"
                        alt={`${img.title} - ${index + 1}`}
                      />
                    </div>
                  ))}

                  {/* 📐 핵심 공식 & 인자 정의 요약 카드 (사용자 스크린샷 100% 반영) */}
                  {(() => {
                    const parsed = parseFormulaAndParams(img.analysis, img.title);
                    if (!parsed) return null;

                    return (
                      <div className="bg-indigo-955/25 border border-indigo-500/20 p-4 rounded-xl text-slate-200 text-[15px] md:text-[16px] leading-relaxed text-left shadow-lg space-y-3">
                        <div className="flex items-center gap-1.5 pb-2 border-b border-indigo-500/20 select-none">
                          <span className="text-base">📐</span>
                          <span className="text-xs md:text-sm text-indigo-400 font-extrabold tracking-wider uppercase">핵심 공식 & 인자 정의 요약</span>
                        </div>
                        
                        <ul className="list-disc pl-5 space-y-2 select-text font-medium text-slate-200 text-[15px] md:text-[16px]">
                          {/* Bullet 1: Core Formula */}
                          {parsed.formulaText && (
                            <li className="text-[15px] md:text-[16px] leading-relaxed">
                              <span className="font-extrabold text-white">{parsed.formulaTitle}: </span>
                              {LatexRenderer ? (
                                <LatexRenderer text={parsed.formulaText} katexLoaded={katexLoaded} className="inline font-bold text-indigo-200" />
                              ) : (
                                <span className="font-bold text-indigo-200">{parsed.formulaText}</span>
                              )}
                            </li>
                          )}

                          {/* Bullet 2: Parameter Definitions */}
                          {parsed.params && parsed.params.length > 0 && (
                            <li className="text-[15px] md:text-[16px] leading-relaxed">
                              <span className="font-extrabold text-white">인자 정의:</span>
                              <ul className="list-[circle] pl-5 space-y-2 mt-2 border-l-2 border-indigo-500/30 ml-1">
                                {parsed.params.map((param, pIdx) => (
                                  <li key={pIdx} className="text-[15px] md:text-[16px] leading-relaxed">
                                    {LatexRenderer ? (
                                      <>
                                        {param.symbol.includes('$') ? (
                                          <LatexRenderer text={param.symbol} katexLoaded={katexLoaded} className="inline font-extrabold text-indigo-300" />
                                        ) : (
                                          <span className="font-extrabold text-indigo-300">{param.symbol}</span>
                                        )}
                                        <span className="text-slate-300 font-semibold">: </span>
                                        <LatexRenderer text={param.desc} katexLoaded={katexLoaded} className="inline text-slate-300 font-semibold" />
                                      </>
                                    ) : (
                                      <>
                                        <span className="font-extrabold text-indigo-300">{param.symbol}</span>
                                        <span className="text-slate-300 font-semibold">: {param.desc}</span>
                                      </>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </li>
                          )}
                        </ul>
                      </div>
                    );
                  })()}
                </div>

                {/* Right Column: AI Analysis */}
                <div className="flex flex-col gap-3">
                  {/* 1. AI Analysis details */}
                  <div className="bg-slate-900/40 border border-slate-800/60 p-3.5 sm:p-4 rounded-xl text-slate-200 text-[15px] md:text-[16px] leading-relaxed text-left">
                    <span className="text-xs text-slate-400 font-black block mb-1.5 uppercase tracking-wider select-none">📊 그림/그래프 공학적 분석</span>
                    {LatexRenderer ? (
                      <div className="text-white text-[15px] md:text-[16px] leading-relaxed select-text font-semibold [&_p]:text-[15px] [&_p]:md:text-[16px] [&_p]:leading-relaxed">
                        <LatexRenderer text={img.analysis} katexLoaded={katexLoaded} isMarkdown={true} formulaSource="tutor" hideTableWrapper={true} />
                      </div>
                    ) : (
                      <p className="font-bold text-white text-[15px] md:text-[16px] leading-relaxed whitespace-pre-line select-text">{img.analysis}</p>
                    )}
                  </div>

                  {/* 2. Intuitive metaphors */}
                  <div className="bg-violet-955/15 border border-violet-500/10 p-3.5 sm:p-4 rounded-xl text-slate-355 text-[15px] md:text-[16px] font-medium leading-relaxed text-left">
                    <span className="text-xs text-violet-400 font-extrabold block mb-1.5 uppercase tracking-wider select-none">💡 직관적 본질 (비유)</span>
                    {LatexRenderer ? (
                      <div className="text-slate-300 text-[15px] md:text-[16px] leading-relaxed select-text [&_p]:text-[15px] [&_p]:md:text-[16px] [&_p]:leading-relaxed">
                        <LatexRenderer text={img.intuitive} katexLoaded={katexLoaded} isMarkdown={true} formulaSource="tutor" hideTableWrapper={true} />
                      </div>
                    ) : (
                      <p className="text-slate-300 text-[15px] md:text-[16px] leading-relaxed select-text">{img.intuitive}</p>
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
