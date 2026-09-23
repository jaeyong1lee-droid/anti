import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2,
  Minimize2,
  Upload,
  Link as LinkIcon,
  Trash2,
  Sparkles,
  RefreshCw,
  FileText,
  Monitor,
  ExternalLink,
  Presentation,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { LatexRenderer } from './LatexRenderer';

/**
 * 📊 TopicSlidePlugin (NotebookLM 스타일 5장 프레젠테이션 슬라이드 덱 뷰어 & 관리 플러그인)
 *
 * @param {number|string} topicId - 토픽 ID
 * @param {string} topicTitle - 토픽 제목
 * @param {boolean} isOpen - 모달 열림 여부
 * @param {function} onClose - 모달 닫기 콜백
 * @param {string} apiBase - API 베이스 URL (기본값 '')
 */
export default function TopicSlidePlugin({
  topicId,
  topicTitle = '',
  isOpen,
  onClose,
  apiBase = ''
}) {
  const [slideMeta, setSlideMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [viewMode, setViewMode] = useState('auto'); // 'file' | 'ai' | 'auto'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadUrlInput, setUploadUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  // 1. 슬라이드 메타데이터 조회
  const fetchSlideMeta = async () => {
    if (!topicId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/topics/${topicId}/slides`);
      if (res.ok) {
        const data = await res.json();
        setSlideMeta(data);
        if (data.has_file || data.slide_url) {
          setViewMode('file');
        } else if (data.slide_deck?.slides?.length > 0) {
          setViewMode('ai');
        } else {
          setViewMode('auto');
        }
      } else {
        setSlideMeta(null);
      }
    } catch (err) {
      console.error('[TopicSlidePlugin Fetch Error]:', err);
      setErrorMsg('슬라이드 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && topicId) {
      fetchSlideMeta();
      setCurrentSlideIndex(0);
    } else {
      setSlideMeta(null);
      setCurrentSlideIndex(0);
      setIsFullscreen(false);
      setShowUploadModal(false);
      setErrorMsg(null);
    }
  }, [isOpen, topicId]);

  // 2. 키보드 네비게이션
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (showUploadModal) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        handleNextSlide();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrevSlide();
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      } else if (e.key.toLowerCase() === 'f') {
        setIsFullscreen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showUploadModal, isFullscreen, slideMeta, currentSlideIndex]);

  // 3. AI 5-Slide Visual Deck 생성
  const handleGenerateAiDeck = async () => {
    if (!topicId || generating) return;
    setGenerating(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/topics/${topicId}/slides/generate`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setSlideMeta(prev => ({
          ...(prev || {}),
          slide_deck: data.slide_deck
        }));
        setViewMode('ai');
        setCurrentSlideIndex(0);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'AI 슬라이드 생성에 실패했습니다.');
      }
    } catch (err) {
      console.error('[Generate Slide Error]:', err);
      setErrorMsg('AI 슬라이드 덱을 생성하는 중 통신 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  // 4. 슬라이드 파일 직접 업로드 (PDF / PPTX / 이미지)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !topicId) return;

    const formData = new FormData();
    formData.append('slide_file', file);

    setIsUploading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/topics/${topicId}/slides`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        await fetchSlideMeta();
        setViewMode('file');
        setShowUploadModal(false);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || '파일 업로드에 실패했습니다.');
      }
    } catch (err) {
      console.error('[Upload Slide Error]:', err);
      setErrorMsg('파일 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 5. 구글 슬라이드/웹 링크 등록
  const handleSaveUrl = async () => {
    if (!uploadUrlInput.trim() || !topicId) return;
    let url = uploadUrlInput.trim();

    // 구글 슬라이드 링크인 경우 /embed 형식으로 스마트 변환
    if (url.includes('docs.google.com/presentation') && !url.includes('/embed')) {
      const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        url = `https://docs.google.com/presentation/d/${match[1]}/embed?start=false&loop=false&delayms=3000`;
      }
    }

    setIsUploading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/topics/${topicId}/slides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slide_url: url })
      });
      if (res.ok) {
        await fetchSlideMeta();
        setViewMode('file');
        setShowUploadModal(false);
        setUploadUrlInput('');
      } else {
        const err = await res.json();
        setErrorMsg(err.error || '링크 저장에 실패했습니다.');
      }
    } catch (err) {
      console.error('[Save URL Error]:', err);
      setErrorMsg('링크 저장 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  // 6. 슬라이드 삭제 / 초기화
  const handleDeleteSlides = async () => {
    if (!window.confirm('등록된 슬라이드 자료(파일 및 링크)를 완전히 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`${apiBase}/api/topics/${topicId}/slides`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchSlideMeta();
        setViewMode('auto');
        setShowUploadModal(false);
      }
    } catch (err) {
      console.error('[Delete Slide Error]:', err);
    }
  };

  const slides = slideMeta?.slide_deck?.slides || [];
  const totalSlides = slides.length || 5;

  const handleNextSlide = () => {
    if (currentSlideIndex < totalSlides - 1) {
      setCurrentSlideIndex(prev => prev + 1);
    }
  };

  const handlePrevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
    }
  };

  if (!isOpen) return null;

  const currentSlide = slides[currentSlideIndex] || null;
  const hasFileOrUrl = !!(slideMeta?.has_file || slideMeta?.slide_url);
  const hasAiDeck = slides.length > 0;

  // 실제 렌더링할 뷰 결정
  const activeView = viewMode === 'file' && hasFileOrUrl
    ? 'file'
    : viewMode === 'ai' && hasAiDeck
    ? 'ai'
    : hasFileOrUrl
    ? 'file'
    : hasAiDeck
    ? 'ai'
    : 'empty';

  return (
    <div
      className="fixed inset-0 z-[9999999] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in text-slate-100 select-none"
      onClick={() => {
        if (!showUploadModal) onClose();
      }}
    >
      <div
        ref={containerRef}
        className={`relative w-full ${
          isFullscreen ? 'w-screen h-screen max-w-none rounded-none' : 'max-w-6xl max-h-[92vh] rounded-2xl'
        } bg-[#0A0F1D] border border-amber-500/30 shadow-2xl flex flex-col overflow-hidden transition-all duration-300`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================= */}
        {/* 1. 상단 툴바 (헤더) */}
        {/* ================================================================= */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-[#0F172A] border-b border-slate-800 shrink-0">
          {/* 좌측: 타이틀 및 뱃지 */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Presentation size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  NotebookLM Slide Deck
                </span>
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                  {activeView === 'ai' ? `Slide ${currentSlideIndex + 1} / ${totalSlides}` : (slideMeta?.slide_name || '원본 프레젠테이션')}
                </span>
              </div>
              <h2 className="text-xs sm:text-sm font-black text-white truncate max-w-md" title={topicTitle}>
                {topicTitle}
              </h2>
            </div>
          </div>

          {/* 중앙: 뷰 모드 토글 (파일 vs AI) */}
          <div className="hidden md:flex items-center gap-1 bg-[#162138] p-1 rounded-xl border border-slate-700/60">
            {hasFileOrUrl && (
              <button
                type="button"
                onClick={() => setViewMode('file')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeView === 'file' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor size={12} />
                <span>원본 파일 뷰어</span>
              </button>
            )}
            {hasAiDeck && (
              <button
                type="button"
                onClick={() => setViewMode('ai')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeView === 'ai' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles size={12} />
                <span>AI 5장 브리핑</span>
              </button>
            )}
          </div>

          {/* 우측 컨트롤 버튼 그룹 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 파일 등록/변경 버튼 */}
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold transition-all cursor-pointer active:scale-95"
              title="NotebookLM PDF/PPTX 파일 등록 또는 구글 슬라이드 링크 연결"
            >
              <Upload size={13} className="text-amber-400" />
              <span className="hidden sm:inline">{hasFileOrUrl ? '파일/링크 변경' : '슬라이드 등록'}</span>
            </button>

            {/* AI 덱 새로고침 / 생성 */}
            <button
              type="button"
              onClick={handleGenerateAiDeck}
              disabled={generating}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-md"
              title="토픽 소스 기반 5장 비주얼 슬라이드 AI 실시간 재생성"
            >
              <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{hasAiDeck ? 'AI 덱 재생성' : 'AI 덱 생성'}</span>
            </button>

            {/* 전체화면 */}
            <button
              type="button"
              onClick={() => setIsFullscreen(prev => !prev)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
              title={isFullscreen ? '창 모드로 복귀 (Esc)' : '전체화면 발표 모드 (F)'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* 닫기 */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition-all cursor-pointer"
              title="닫기 (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 에러 메시지 알림 바 */}
        {errorMsg && (
          <div className="px-4 py-1.5 bg-rose-950/80 border-b border-rose-500/40 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertCircle size={14} />
              <span>{errorMsg}</span>
            </div>
            <button type="button" onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">
              <X size={12} />
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* 2. 본체 프레젠테이션 스테이지 (16:9 비율 영역) */}
        {/* ================================================================= */}
        <div className="flex-1 min-h-0 bg-[#060913] relative overflow-hidden flex flex-col justify-center items-center">
          {loading || generating ? (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin"></div>
                <Presentation className="w-6 h-6 text-amber-400 absolute inset-0 m-auto" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white mb-1">
                  {generating ? 'NotebookLM 스타일 5장 프레젠테이션 덱 생성 중...' : '슬라이드 데이터를 불러오는 중...'}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  {generating ? '토픽의 핵심 원문, 역학 메커니즘, KDS 설계기준, 현장 시공 포인트를 16:9 비주얼 슬라이드로 구성하고 있습니다.' : '잠시만 기다려 주십시오.'}
                </p>
              </div>
            </div>
          ) : activeView === 'file' ? (
            /* 모드 A: 원본 파일 / 구글 슬라이드 뷰어 */
            <div className="w-full h-full p-2 flex flex-col">
              {slideMeta.slide_url?.includes('google.com') ? (
                <iframe
                  src={slideMeta.slide_url}
                  title="Google Slides"
                  className="w-full h-full rounded-xl border border-slate-800 shadow-2xl"
                  allowFullScreen
                />
              ) : (
                <iframe
                  src={`${apiBase}/api/topics/${topicId}/slides/file#toolbar=0&navpanes=0&view=FitH`}
                  title="Slide Presentation"
                  className="w-full h-full rounded-xl border border-slate-800 shadow-2xl bg-slate-900"
                />
              )}
            </div>
          ) : activeView === 'ai' && currentSlide ? (
            /* 모드 B: AI 5-Slide Visual Presentation Deck */
            <div className="w-full h-full max-w-5xl aspect-video p-4 sm:p-6 md:p-8 flex flex-col justify-between overflow-y-auto scrollbar-none animate-fade-in">
              {/* 슬라이드 상단 진행 바 */}
              <div className="w-full flex items-center justify-between gap-3 mb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {currentSlide.category_tag || `SLIDE 0${currentSlideIndex + 1}`}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    PART {currentSlideIndex + 1} OF {totalSlides}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {slides.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentSlideIndex(idx)}
                      className={`h-1.5 transition-all rounded-full cursor-pointer ${
                        idx === currentSlideIndex ? 'w-6 bg-amber-400' : 'w-2 bg-slate-700 hover:bg-slate-500'
                      }`}
                      title={`Slide ${idx + 1}로 이동`}
                    />
                  ))}
                </div>
              </div>

              {/* 슬라이드 헤더 */}
              <div className="border-b border-slate-800 pb-3 mb-3 shrink-0">
                <h1 className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <span className="text-amber-400 font-mono text-base sm:text-lg">0{currentSlideIndex + 1}.</span>
                  <span>{currentSlide.title}</span>
                </h1>
                {currentSlide.key_takeaway && (
                  <p className="text-xs sm:text-sm text-amber-300/90 font-medium mt-1 pl-6 border-l-2 border-amber-500/60 leading-relaxed">
                    💡 {currentSlide.key_takeaway}
                  </p>
                )}
              </div>

              {/* 슬라이드 본문: 2컬럼 레이아웃 (핵심 요점 + 비주얼 컴포넌트) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 flex-1 min-h-0 items-stretch">
                {/* 좌측 6컬럼: 핵심 불릿 카드 */}
                <div className="md:col-span-6 space-y-2 flex flex-col justify-center">
                  {(currentSlide.bullet_points || []).map((b, bIdx) => (
                    <div
                      key={bIdx}
                      className="p-3 bg-[#111827]/80 hover:bg-[#152033] border border-slate-800 hover:border-amber-500/40 rounded-xl transition-all shadow-sm group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {b.badge && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30">
                            {b.badge}
                          </span>
                        )}
                        <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                          {b.title}
                        </h4>
                      </div>
                      <div className="text-[11px] sm:text-xs text-slate-300 leading-relaxed pl-1">
                        <LatexRenderer text={b.desc || ''} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* 우측 6컬럼: 비주얼 컴포넌트 (요약 카드 / 매트릭스 / KDS 공식 박스) */}
                <div className="md:col-span-6 flex flex-col justify-center">
                  <div className="p-3 sm:p-4 bg-gradient-to-br from-[#121B2F] to-[#0A101D] border border-blue-500/30 rounded-2xl shadow-lg h-full flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider flex items-center gap-1.5">
                        <CheckCircle size={12} className="text-emerald-400" />
                        <span>Core Engineering Visual</span>
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">NotebookLM Form</span>
                    </div>

                    {/* 카드 매트릭스 렌더링 */}
                    {currentSlide.visual_component?.cards && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 my-2">
                        {currentSlide.visual_component.cards.map((card, cIdx) => (
                          <div
                            key={cIdx}
                            className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                              card.highlight
                                ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                                : 'bg-[#0E1626] border-slate-800 text-slate-300'
                            }`}
                          >
                            <span className="text-[9px] font-bold text-slate-400 uppercase">{card.label}</span>
                            <span className="text-xs font-black mt-1 line-clamp-3">
                              <LatexRenderer text={card.content || ''} />
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 기술사 착안점 & 엔지니어 노트 */}
                    {currentSlide.engineer_note && (
                      <div className="mt-2 p-2.5 bg-indigo-950/50 border border-indigo-500/40 rounded-xl">
                        <div className="text-[9.5px] font-bold text-indigo-300 flex items-center gap-1 mb-0.5">
                          <span>🎯 기술사 답안 차별화 & 실무 착안점</span>
                        </div>
                        <p className="text-[11px] text-indigo-100 font-medium leading-relaxed">
                          <LatexRenderer text={currentSlide.engineer_note} />
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 하단 푸터 */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 shrink-0">
                <span>Anti Intelligent Tunnel Engineering Deck</span>
                <span className="font-mono">키보드 방향키(◀ ▶)로 슬라이드를 넘길 수 있습니다</span>
              </div>
            </div>
          ) : (
            /* 모드 C: 슬라이드가 아직 등록되지 않은 경우 안내 화면 */
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Presentation className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-black text-white mb-1.5">등록된 슬라이드 자료가 없습니다</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  NotebookLM 스튜디오에서 내보낸 <span className="text-amber-300 font-bold">PDF/PPTX 파일</span>을 업로드하시거나, AI 버튼을 눌러 <span className="text-amber-300 font-bold">5장 프레젠테이션 슬라이드 덱</span>을 즉시 자동 생성해 보세요!
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleGenerateAiDeck}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer"
                >
                  <Sparkles size={14} />
                  <span>AI 5장 슬라이드 즉시 생성</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer"
                >
                  <Upload size={14} className="text-amber-400" />
                  <span>내 파일 등록</span>
                </button>
              </div>
            </div>
          )}

          {/* 좌우 슬라이드 이동 플로팅 버튼 (AI 모드일 때 표출) */}
          {activeView === 'ai' && (
            <>
              <button
                type="button"
                onClick={handlePrevSlide}
                disabled={currentSlideIndex === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/80 hover:bg-amber-600 disabled:opacity-20 disabled:hover:bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center transition-all cursor-pointer shadow-xl backdrop-blur-sm"
                title="이전 슬라이드 (◀)"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={handleNextSlide}
                disabled={currentSlideIndex >= totalSlides - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/80 hover:bg-amber-600 disabled:opacity-20 disabled:hover:bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center transition-all cursor-pointer shadow-xl backdrop-blur-sm"
                title="다음 슬라이드 (▶)"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}
        </div>

        {/* ================================================================= */}
        {/* 3. 파일 등록/링크 연결 팝업 (서브 모달) */}
        {/* ================================================================= */}
        {showUploadModal && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[#0F172A] border border-amber-500/40 rounded-2xl p-5 shadow-2xl space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Upload size={18} className="text-amber-400" />
                  <h3 className="text-sm font-bold text-white">NotebookLM 슬라이드 등록 및 변경</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 1. 파일 직접 업로드 (PDF / PPTX / 이미지) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  1. NotebookLM 슬라이드 파일 직접 업로드 (PDF / PPTX / 이미지)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-amber-400/80 rounded-xl p-5 text-center cursor-pointer transition-all bg-[#0A0F1D] hover:bg-[#121B2F]"
                >
                  <FileText className="w-8 h-8 text-amber-400 mx-auto mb-2 opacity-80" />
                  <span className="text-xs font-bold text-white block">
                    {isUploading ? '업로드 중입니다...' : '클릭하여 PDF 또는 PPTX 파일 선택'}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    NotebookLM에서 [내보내기 ➔ PDF 또는 PowerPoint]로 저장한 파일을 선택하세요
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* 2. 구글 슬라이드 / 웹 링크 연결 */}
              <div className="pt-2 border-t border-slate-800">
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <LinkIcon size={13} className="text-blue-400" />
                  <span>2. 구글 슬라이드 웹 링크 또는 임베드 URL 연결</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={uploadUrlInput}
                    onChange={(e) => setUploadUrlInput(e.target.value)}
                    placeholder="https://docs.google.com/presentation/d/.../embed"
                    className="flex-1 bg-[#0A0F1D] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={handleSaveUrl}
                    disabled={isUploading || !uploadUrlInput.trim()}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow"
                  >
                    연결 저장
                  </button>
                </div>
              </div>

              {/* 하단 관리 버튼 */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                {hasFileOrUrl ? (
                  <button
                    type="button"
                    onClick={handleDeleteSlides}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>등록된 슬라이드 삭제</span>
                  </button>
                ) : <div />}
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
