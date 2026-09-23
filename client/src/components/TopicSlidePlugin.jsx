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
  Presentation,
  CheckCircle,
  AlertCircle,
  Download,
  Image as ImageIcon
} from 'lucide-react';
import { renderMixedText } from './ChartRenderer';

/**
 * 🪶 SlideLatex: 훅(Hook)을 전혀 사용하지 않는 초경량 고성능 슬라이드 전용 수식/텍스트 렌더러
 * (React Hook 규칙 위반 에러 #300 원천 방지 및 KaTeX 고속 렌더링)
 */
function SlideLatex({ text, className = '' }) {
  if (!text) return null;
  const html = renderMixedText(text, true);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * 📦 PDF.js CDN 동적 로더
 */
const loadPdfJs = () => {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const existing = document.getElementById('pdfjs-cdn-script');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.pdfjsLib));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'pdfjs-cdn-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } else {
        reject(new Error('PDF.js 로드 실패'));
      }
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

/**
 * 🖼️ PDF 소스(URL/File/Buffer)를 초경량 고화질 JPG 이미지 슬라이드 배열로 변환하는 함수
 */
const convertPdfToJpgSlides = async (pdfSource, onProgress) => {
  const pdfjs = await loadPdfJs();
  let loadingTask;
  if (pdfSource instanceof ArrayBuffer || pdfSource instanceof Uint8Array) {
    loadingTask = pdfjs.getDocument({ data: pdfSource });
  } else if (typeof pdfSource === 'string') {
    loadingTask = pdfjs.getDocument(pdfSource);
  } else if (pdfSource instanceof File || pdfSource instanceof Blob) {
    const arrayBuffer = await pdfSource.arrayBuffer();
    loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  } else {
    throw new Error('지원되지 않는 PDF 형식입니다.');
  }

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const slides = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (onProgress) {
      onProgress(pageNum, numPages);
    }
    const page = await pdf.getPage(pageNum);
    // 16:9 슬라이드 기준 1.6 스케일 (~1536x864 해상도로 선명한 텍스트 보장)
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d', { alpha: false });

    // 흰색 배경 채우기 (투명도 검은색 왜곡 방지)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;

    // 압축률 0.82의 최적화된 경량 JPEG 생성 (~80KB~120KB/장)
    const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.82);
    slides.push({
      slide_no: pageNum,
      title: `Slide 0${pageNum}`,
      imgUrl: jpgDataUrl
    });
  }

  return slides;
};

/**
 * 📊 TopicSlidePlugin
 * NotebookLM 스타일 프레젠테이션 슬라이드 덱 뷰어 & 관리 플러그인
 * (PDF iframe 대신 용량이 가벼운 JPG 형식 변환 뷰어 탑재)
 */
export default function TopicSlidePlugin({
  topicId,
  topicTitle = '',
  isOpen,
  onClose,
  apiBase = '',
  isGenerating = false,
  onStartSlideGeneration,
  slideRefreshTick = 0,
  showNotification
}) {
  const [slideMeta, setSlideMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const [convertProgress, setConvertProgress] = useState({ current: 0, total: 0 });

  const [jpgSlides, setJpgSlides] = useState([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [viewMode, setViewMode] = useState('auto'); // 'jpg' | 'ai' | 'web' | 'empty'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadUrlInput, setUploadUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  // 1. 슬라이드 메타데이터 조회 및 JPG 변환 처리
  const fetchSlideMeta = async () => {
    if (!topicId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/topics/${topicId}/slides`);
      if (res.ok) {
        const data = await res.json();
        setSlideMeta(data);

        // A. 이미 저장된 경량 JPG 덱이 있는 경우
        if (data.slide_deck?.type === 'jpg_deck' && Array.isArray(data.slide_deck.slides) && data.slide_deck.slides.length > 0) {
          setJpgSlides(data.slide_deck.slides);
          setViewMode('jpg');
        }
        // B. 단일 이미지 파일(JPG, PNG 등)이 등록된 경우
        else if (data.has_file && data.slide_name && /\.(jpe?g|png|webp)$/i.test(data.slide_name)) {
          const singleImageSlide = [{
            slide_no: 1,
            title: data.slide_name,
            imgUrl: `${apiBase}/api/topics/${topicId}/slides/file`
          }];
          setJpgSlides(singleImageSlide);
          setViewMode('jpg');
        }
        // C. PDF 파일이 등록되어 있으나 아직 JPG로 변환되지 않은 경우 -> 즉시 자동 경량 JPG 변환 수행
        else if (data.has_file) {
          try {
            setIsConvertingPdf(true);
            setConvertProgress({ current: 0, total: 0 });
            const fileRes = await fetch(`${apiBase}/api/topics/${topicId}/slides/file`);
            if (fileRes.ok) {
              const buffer = await fileRes.arrayBuffer();
              const converted = await convertPdfToJpgSlides(buffer, (cur, tot) => {
                setConvertProgress({ current: cur, total: tot });
              });
              setJpgSlides(converted);
              setViewMode('jpg');

              // 향후 재방문 시 즉각 로딩을 위해 서버에 JPG 덱 캐시 저장
              try {
                await fetch(`${apiBase}/api/topics/${topicId}/slides`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    slide_deck_json: {
                      type: 'jpg_deck',
                      total_slides: converted.length,
                      slides: converted
                    }
                  })
                });
              } catch (saveErr) {
                console.warn('Failed to background-cache converted JPG slides:', saveErr);
              }
            }
          } catch (pdfErr) {
            console.error('PDF to JPG on-the-fly conversion error:', pdfErr);
            setErrorMsg('PDF를 JPG로 변환하는 중 오류가 발생했습니다.');
          } finally {
            setIsConvertingPdf(false);
          }
        }
        // D. 구글 슬라이드 임베드 URL이 있는 경우
        else if (data.slide_url?.includes('google.com')) {
          setViewMode('web');
        }
        // E. AI 5장 브리핑 덱이 있는 경우
        else if (data.slide_deck?.slides?.length > 0) {
          setViewMode('ai');
        } else {
          setViewMode('empty');
        }
      } else {
        setSlideMeta(null);
        setViewMode('empty');
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
      setErrorMsg(null);
      fetchSlideMeta();
    } else {
      setSlideMeta(null);
      setJpgSlides([]);
      setCurrentSlideIndex(0);
      setIsFullscreen(false);
      setShowUploadModal(false);
      setIsConvertingPdf(false);
      setErrorMsg(null);
    }
  }, [isOpen, topicId, slideRefreshTick]);

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
      } else if (e.key.toLowerCase() === 'd') {
        handleDownloadCurrentJpg();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showUploadModal, isFullscreen, slideMeta, currentSlideIndex, jpgSlides, viewMode]);

  // 3. AI 5-Slide Visual Deck 생성 (백그라운드 지원)
  const handleGenerateAiDeck = async () => {
    if (!topicId || isGenerating || generating) return;
    if (onStartSlideGeneration) {
      onStartSlideGeneration(topicId, topicTitle);
      return;
    }

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

  // 4. 슬라이드 파일 직접 업로드 (PDF / 이미지 -> 즉시 경량 JPG 슬라이드 덱 변환)
  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !topicId) return;

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const firstFile = files[0];
      const isPdf = firstFile.name.toLowerCase().endsWith('.pdf') || firstFile.type === 'application/pdf';

      if (isPdf) {
        // PDF인 경우: 브라우저에서 직접 경량 JPG 덱으로 변환
        setIsConvertingPdf(true);
        setConvertProgress({ current: 0, total: 0 });

        const convertedSlides = await convertPdfToJpgSlides(firstFile, (cur, tot) => {
          setConvertProgress({ current: cur, total: tot });
        });

        // 1) 서버에 파일 업로드 및 JPG 덱 JSON 동시 등록
        const formData = new FormData();
        formData.append('slide_file', firstFile);
        formData.append('slide_deck_json', JSON.stringify({
          type: 'jpg_deck',
          total_slides: convertedSlides.length,
          slides: convertedSlides
        }));

        const res = await fetch(`${apiBase}/api/topics/${topicId}/slides`, {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          setJpgSlides(convertedSlides);
          setViewMode('jpg');
          setCurrentSlideIndex(0);
          setShowUploadModal(false);
          await fetchSlideMeta();
        } else {
          const err = await res.json();
          setErrorMsg(err.error || '업로드 및 변환 저장에 실패했습니다.');
        }
      } else {
        // 이미지 파일들인 경우 (JPG/PNG 등)
        const imageSlides = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const dataUrl = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });
          imageSlides.push({
            slide_no: i + 1,
            title: file.name,
            imgUrl: dataUrl
          });
        }

        const formData = new FormData();
        formData.append('slide_file', firstFile);
        formData.append('slide_deck_json', JSON.stringify({
          type: 'jpg_deck',
          total_slides: imageSlides.length,
          slides: imageSlides
        }));

        const res = await fetch(`${apiBase}/api/topics/${topicId}/slides`, {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          setJpgSlides(imageSlides);
          setViewMode('jpg');
          setCurrentSlideIndex(0);
          setShowUploadModal(false);
          await fetchSlideMeta();
        } else {
          const err = await res.json();
          setErrorMsg(err.error || '이미지 슬라이드 등록에 실패했습니다.');
        }
      }
    } catch (err) {
      console.error('[Upload/Convert Error]:', err);
      setErrorMsg(err.message || '파일 처리 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
      setIsConvertingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 5. 구글 슬라이드 임베드 URL 연결
  const handleSaveUrl = async () => {
    if (!uploadUrlInput.trim() || !topicId) return;
    setIsUploading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/topics/${topicId}/slides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slide_url: uploadUrlInput.trim()
        })
      });
      if (res.ok) {
        await fetchSlideMeta();
        setViewMode('web');
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
    if (!window.confirm('등록된 슬라이드 자료(JPG 파일 및 덱)를 완전히 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`${apiBase}/api/topics/${topicId}/slides`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setJpgSlides([]);
        await fetchSlideMeta();
        setViewMode('empty');
        setShowUploadModal(false);
      }
    } catch (err) {
      console.error('[Delete Slide Error]:', err);
    }
  };

  // 7. 현재 슬라이드 JPG 다운로드
  const handleDownloadCurrentJpg = () => {
    const currentJpg = jpgSlides[currentSlideIndex];
    if (!currentJpg?.imgUrl) return;
    const a = document.createElement('a');
    a.href = currentJpg.imgUrl;
    const cleanTitle = (topicTitle || 'topic').replace(/[/\\?%*:|"<>]/g, '_');
    a.download = `${cleanTitle}_slide_0${currentSlideIndex + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const aiSlides = slideMeta?.slide_deck?.type !== 'jpg_deck' ? (slideMeta?.slide_deck?.slides || []) : [];
  const currentAiSlide = aiSlides[currentSlideIndex] || null;

  const totalSlideCount = viewMode === 'jpg'
    ? jpgSlides.length
    : viewMode === 'ai'
    ? aiSlides.length
    : 0;

  const handleNextSlide = () => {
    if (currentSlideIndex < totalSlideCount - 1) {
      setCurrentSlideIndex(prev => prev + 1);
    }
  };

  const handlePrevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
    }
  };

  if (!isOpen) return null;

  const hasJpgSlides = jpgSlides.length > 0;
  const hasAiDeck = aiSlides.length > 0;
  const hasWebUrl = !!slideMeta?.slide_url?.includes('google.com');
  const hasAnyContent = hasJpgSlides || hasAiDeck || hasWebUrl;
  const isGeneratingDeck = isGenerating || generating;

  // 실제 활성 뷰 모드 산출
  const activeView = (viewMode === 'jpg' && hasJpgSlides)
    ? 'jpg'
    : (viewMode === 'ai' && hasAiDeck)
    ? 'ai'
    : (viewMode === 'web' && hasWebUrl)
    ? 'web'
    : hasJpgSlides
    ? 'jpg'
    : hasAiDeck
    ? 'ai'
    : hasWebUrl
    ? 'web'
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
          isFullscreen ? 'w-screen h-screen max-w-none rounded-none' : 'max-w-6xl max-h-[94vh] rounded-2xl'
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
                  {activeView === 'jpg' ? '16:9 이미지 슬라이드' : '5장 프레젠테이션 덱'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                  {activeView === 'jpg'
                    ? `Slide ${currentSlideIndex + 1} / ${jpgSlides.length} (경량 JPG)`
                    : activeView === 'ai'
                    ? `Slide ${currentSlideIndex + 1} / ${aiSlides.length} (서론-본론-결론)`
                    : '프레젠테이션'}
                </span>
              </div>
              <h2 className="text-xs sm:text-sm font-black text-white truncate max-w-md" title={topicTitle}>
                {topicTitle}
              </h2>
            </div>
          </div>

          {/* 중앙: 뷰 모드 탭 (경량 JPG 슬라이드 vs 5장 프레젠테이션 vs 웹) */}
          <div className="hidden md:flex items-center gap-1 bg-[#162138] p-1 rounded-xl border border-slate-700/60">
            {hasJpgSlides && (
              <button
                type="button"
                onClick={() => { setViewMode('jpg'); setCurrentSlideIndex(0); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeView === 'jpg' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <ImageIcon size={13} />
                <span>JPG 슬라이드 ({jpgSlides.length}장)</span>
              </button>
            )}
            {hasAiDeck && (
              <button
                type="button"
                onClick={() => { setViewMode('ai'); setCurrentSlideIndex(0); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeView === 'ai' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles size={13} />
                <span>5장 프레젠테이션 덱</span>
              </button>
            )}
            {hasWebUrl && (
              <button
                type="button"
                onClick={() => setViewMode('web')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeView === 'web' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor size={13} />
                <span>구글 슬라이드</span>
              </button>
            )}
          </div>

          {/* 우측 컨트롤 버튼 그룹 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* JPG 다운로드 버튼 (JPG 모드일 때) */}
            {activeView === 'jpg' && (
              <button
                type="button"
                onClick={handleDownloadCurrentJpg}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white border border-amber-500/30 text-xs font-bold transition-all cursor-pointer active:scale-95"
                title="현재 슬라이드를 고화질 JPG 이미지로 다운로드 (단축키: D)"
              >
                <Download size={13} />
                <span className="hidden sm:inline">JPG 저장</span>
              </button>
            )}

            {/* 파일 등록/변경 버튼 */}
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold transition-all cursor-pointer active:scale-95"
              title="NotebookLM PDF/PPTX/이미지 등록 또는 구글 슬라이드 링크 연결"
            >
              <Upload size={13} className="text-amber-400" />
              <span className="hidden sm:inline">{hasJpgSlides || hasWebUrl ? '자료 관리' : '슬라이드 등록'}</span>
            </button>

            {/* AI 덱 새로고침 / 생성 */}
            <button
              type="button"
              onClick={handleGenerateAiDeck}
              disabled={isGeneratingDeck}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-md"
              title="토픽 소스 기반 5장 비주얼 슬라이드 AI 실시간 재생성 (백그라운드 실행)"
            >
              <RefreshCw size={13} className={isGeneratingDeck ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">
                {isGeneratingDeck
                  ? '작성 중...'
                  : hasAiDeck
                  ? 'AI 덱 재생성'
                  : 'AI 덱 생성'}
              </span>
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

        {/* 백그라운드 슬라이드 덱 작성 중 알림 배너 (기존 슬라이드 자료가 있는 상태에서 재생성 중일 때) */}
        {isGeneratingDeck && hasAnyContent && (
          <div className="px-4 py-2 bg-gradient-to-r from-amber-950/90 to-orange-950/90 border-b border-amber-500/40 text-amber-200 text-xs flex items-center justify-between animate-pulse shrink-0">
            <div className="flex items-center gap-2">
              <RefreshCw size={13} className="animate-spin text-amber-400 shrink-0" />
              <span className="font-medium">
                ⚡ 새로운 5장 프레젠테이션 덱을 백그라운드에서 작성 중입니다 (약 30초~1분 소요)... 완성이 끝나면 자동으로 새 덱으로 갱신됩니다.
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-amber-300 hover:text-white text-xs underline font-bold cursor-pointer shrink-0 ml-3"
              title="창을 닫아도 백그라운드 생성이 계속됩니다"
            >
              창 닫고 다른 작업하기
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* 2. 본체 프레젠테이션 스테이지 (16:9 비율 영역) */}
        {/* ================================================================= */}
        <div className="flex-1 min-h-0 bg-[#060913] relative overflow-hidden flex flex-col justify-center items-center">
          {/* A. 백그라운드 AI 슬라이드 덱 작성 중이며 아직 기존 슬라이드가 없는 경우 -> 차단 없는 친절한 백그라운드 안내 UI */}
          {isGeneratingDeck && !hasAnyContent ? (
            <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center space-y-5 max-w-lg animate-fade-in">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin"></div>
                <Sparkles className="w-8 h-8 text-amber-400 absolute inset-0 m-auto animate-pulse" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                  <RefreshCw size={12} className="animate-spin" />
                  <span>백그라운드 AI 슬라이드 작성 진행 중</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  NotebookLM 5장 프레젠테이션 덱을 작성하고 있습니다
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md">
                  토픽의 핵심 원문, 역학 메커니즘, KDS 설계기준, 현장 시공 포인트를 집약한 16:9 비주얼 슬라이드를 백그라운드에서 안전하게 구성 중입니다 (약 30초~1분 소요).
                </p>
                <p className="text-xs text-amber-400/90 font-medium">
                  💡 이 창을 닫고 다른 문제 풀이, 채점, 복습 등의 작업을 자유롭게 진행하셔도 백그라운드에서 계속 진행되며, 완성이 끝나면 화면 상단 알림으로 즉시 안내해 드립니다!
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-950/40 cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                >
                  <span>창 닫고 다른 작업 계속하기 (백그라운드 진행)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Upload size={13} className="text-amber-400" />
                  <span>내 파일 직접 등록</span>
                </button>
              </div>
            </div>
          ) : (loading || isConvertingPdf) ? (
            /* B. 단순 메타데이터 조회 중 또는 로컬 PDF->JPG 변환 처리 중 */
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin"></div>
                {isConvertingPdf ? (
                  <ImageIcon className="w-6 h-6 text-amber-400 absolute inset-0 m-auto" />
                ) : (
                  <Presentation className="w-6 h-6 text-amber-400 absolute inset-0 m-auto" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white mb-1">
                  {isConvertingPdf
                    ? `PDF 슬라이드를 가벼운 JPG 형식으로 변환 중... (${convertProgress.current}/${convertProgress.total || '?'})`
                    : '슬라이드 데이터를 불러오는 중...'}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  {isConvertingPdf
                    ? '무거운 PDF 대신 고화질/저용량 경량 JPG 이미지 슬라이드로 변환하여 즉각적인 고속 브라우징을 준비합니다.'
                    : '잠시만 기다려 주십시오.'}
                </p>
              </div>
            </div>
          ) : activeView === 'jpg' && jpgSlides.length > 0 ? (
            /* 모드 1: 초경량 고화질 JPG 이미지 슬라이드 뷰어 (NO PDF iframe) */
            <div className="w-full h-full flex flex-col justify-between">
              {/* 메인 16:9 슬라이드 이미지 스테이지 */}
              <div className="relative flex-1 min-h-0 flex items-center justify-center p-3 sm:p-5">
                <div className="relative max-h-full max-w-full flex items-center justify-center">
                  <img
                    key={currentSlideIndex}
                    src={jpgSlides[currentSlideIndex]?.imgUrl}
                    alt={jpgSlides[currentSlideIndex]?.title || `Slide ${currentSlideIndex + 1}`}
                    className="max-h-[64vh] sm:max-h-[70vh] max-w-full object-contain rounded-xl shadow-2xl border border-slate-800/80 select-none animate-fade-in pointer-events-none"
                  />

                  {/* 슬라이드 번호 뱃지 */}
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 text-white text-[11px] font-mono font-bold shadow-lg flex items-center gap-1.5">
                    <span className="text-amber-400">0{currentSlideIndex + 1}</span>
                    <span className="text-slate-400">/</span>
                    <span className="text-slate-300">0{jpgSlides.length}</span>
                  </div>
                </div>

                {/* 좌우 이동 플로팅 버튼 */}
                <button
                  type="button"
                  onClick={handlePrevSlide}
                  disabled={currentSlideIndex === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-slate-900/85 hover:bg-amber-600 disabled:opacity-20 disabled:hover:bg-slate-900/85 border border-slate-700 text-white flex items-center justify-center transition-all cursor-pointer shadow-2xl backdrop-blur-sm z-20 active:scale-95"
                  title="이전 슬라이드 (◀)"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  type="button"
                  onClick={handleNextSlide}
                  disabled={currentSlideIndex >= jpgSlides.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-slate-900/85 hover:bg-amber-600 disabled:opacity-20 disabled:hover:bg-slate-900/85 border border-slate-700 text-white flex items-center justify-center transition-all cursor-pointer shadow-2xl backdrop-blur-sm z-20 active:scale-95"
                  title="다음 슬라이드 (▶)"
                >
                  <ChevronRight size={24} />
                </button>
              </div>

              {/* 하단 썸네일 스트립 네비게이션 */}
              <div className="w-full bg-[#0B101D] border-t border-slate-800/90 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 max-w-full">
                  {jpgSlides.map((slide, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => setCurrentSlideIndex(sIdx)}
                      className={`relative flex flex-col items-center gap-1 p-1 rounded-xl transition-all cursor-pointer group shrink-0 ${
                        sIdx === currentSlideIndex
                          ? 'ring-2 ring-amber-400 bg-amber-500/15'
                          : 'opacity-50 hover:opacity-100 hover:bg-slate-800/60'
                      }`}
                      title={`Slide ${sIdx + 1}로 이동`}
                    >
                      <div className="w-16 sm:w-20 aspect-video rounded-lg overflow-hidden border border-slate-700 bg-black flex items-center justify-center">
                        <img src={slide.imgUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                      <span className={`text-[10px] font-mono font-bold ${sIdx === currentSlideIndex ? 'text-amber-400' : 'text-slate-400'}`}>
                        0{sIdx + 1}
                      </span>
                    </button>
                  ))}
                </div>

                {/* 우측 상태 뱃지 및 단축키 안내 */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold text-emerald-400 hidden sm:flex items-center gap-1 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                    ⚡ 경량 JPG 모드
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
                    방향키(◀ ▶) 또는 Spacebar 슬라이드 넘김
                  </span>
                </div>
              </div>
            </div>
          ) : activeView === 'ai' && currentAiSlide ? (
            /* 모드 2: AI 5-Slide Visual Presentation Deck */
            <div className="w-full h-full flex flex-col justify-between relative overflow-hidden">
              {/* 메인 슬라이드 스테이지 */}
              <div className="flex-1 min-h-0 w-full max-w-5xl mx-auto p-3 sm:p-5 md:p-6 flex flex-col justify-between overflow-y-auto scrollbar-none animate-fade-in relative">
                {/* 슬라이드 상단 진행 바 */}
                <div className="w-full flex items-center justify-between gap-3 mb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {currentAiSlide.category_tag || `SLIDE 0${currentSlideIndex + 1}`}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      PART {currentSlideIndex + 1} OF {aiSlides.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {aiSlides.map((slide, idx) => {
                      const stages = ['서론', '본론①', '본론②', '본론③', '결론'];
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCurrentSlideIndex(idx)}
                          className={`px-2 py-0.5 text-[10px] font-bold transition-all rounded-md cursor-pointer ${
                            idx === currentSlideIndex 
                              ? 'bg-amber-400 text-slate-950 font-black shadow-sm' 
                              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                          }`}
                          title={`Slide ${idx + 1}: ${slide.title || ''}`}
                        >
                          {stages[idx] || `0${idx + 1}`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 슬라이드 헤더 */}
                <div className="border-b border-slate-800 pb-2.5 mb-2.5 shrink-0">
                  <h1 className="text-base sm:text-lg md:text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <span className="text-amber-400 font-mono">0{currentSlideIndex + 1}.</span>
                    <span>{currentAiSlide.title}</span>
                  </h1>
                  {currentAiSlide.key_takeaway && (
                    <p className="text-xs sm:text-sm text-amber-300/90 font-medium mt-1 pl-4 border-l-2 border-amber-500/60 leading-relaxed">
                      💡 <SlideLatex text={currentAiSlide.key_takeaway} />
                    </p>
                  )}
                </div>

                {/* 슬라이드 본문: 2컬럼 레이아웃 */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 flex-1 min-h-0 items-stretch">
                  {/* 좌측 6컬럼: 핵심 불릿 카드 */}
                  <div className="md:col-span-6 space-y-2 flex flex-col justify-center">
                    {(currentAiSlide.bullet_points || []).map((b, bIdx) => (
                      <div
                        key={bIdx}
                        className="p-2.5 sm:p-3 bg-[#111827]/80 hover:bg-[#152033] border border-slate-800 hover:border-amber-500/40 rounded-xl transition-all shadow-sm group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {b.badge && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30 shrink-0">
                              {b.badge}
                            </span>
                          )}
                          <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                            {b.title}
                          </h4>
                        </div>
                        <div className="text-[11px] sm:text-xs text-slate-300 leading-relaxed pl-1">
                          <SlideLatex text={b.desc || ''} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 우측 6컬럼: 비주얼 컴포넌트 */}
                  <div className="md:col-span-6 flex flex-col justify-center">
                    <div className="p-3 sm:p-4 bg-gradient-to-br from-[#121B2F] to-[#0A101D] border border-blue-500/30 rounded-2xl shadow-lg h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
                        <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider flex items-center gap-1.5">
                          <CheckCircle size={12} className="text-emerald-400" />
                          <span>Core Engineering Visual</span>
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">Engineering Matrix</span>
                      </div>

                      {/* 이미지 다이어그램이 있는 경우 최우선 시각화 */}
                      {currentAiSlide.image_url ? (
                        <div className="my-2 rounded-xl overflow-hidden border border-slate-700 bg-black flex items-center justify-center max-h-[30vh]">
                          <img 
                            src={currentAiSlide.image_url} 
                            alt={currentAiSlide.title} 
                            className="w-full h-full object-contain pointer-events-none"
                          />
                        </div>
                      ) : null}

                      {/* 카드 매트릭스 렌더링 */}
                      {currentAiSlide.visual_component?.cards && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 my-2">
                          {currentAiSlide.visual_component.cards.map((card, cIdx) => (
                            <div
                              key={cIdx}
                              className={`p-2 rounded-xl border flex flex-col justify-between ${
                                card.highlight
                                  ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                                  : 'bg-[#0E1626] border-slate-800 text-slate-300'
                              }`}
                            >
                              <span className="text-[9px] font-bold text-slate-400 uppercase">{card.label}</span>
                              <span className="text-xs font-black mt-1 line-clamp-3">
                                <SlideLatex text={card.content || ''} />
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 기술사 착안점 & 엔지니어 노트 */}
                      {currentAiSlide.engineer_note && (
                        <div className="mt-2 p-2.5 bg-indigo-950/50 border border-indigo-500/40 rounded-xl shrink-0">
                          <div className="text-[9.5px] font-bold text-indigo-300 flex items-center gap-1 mb-0.5">
                            <span>🎯 기술사 답안 차별화 & 실무 착안점</span>
                          </div>
                          <p className="text-[11px] text-indigo-100 font-medium leading-relaxed">
                            <SlideLatex text={currentAiSlide.engineer_note} />
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 좌우 이동 플로팅 버튼 */}
                <button
                  type="button"
                  onClick={handlePrevSlide}
                  disabled={currentSlideIndex === 0}
                  className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/90 hover:bg-amber-600 disabled:opacity-10 disabled:pointer-events-none border border-slate-700 text-white flex items-center justify-center transition-all cursor-pointer shadow-2xl backdrop-blur-sm z-20 active:scale-95"
                  title="이전 슬라이드 (◀)"
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  type="button"
                  onClick={handleNextSlide}
                  disabled={currentSlideIndex >= aiSlides.length - 1}
                  className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/90 hover:bg-amber-600 disabled:opacity-10 disabled:pointer-events-none border border-slate-700 text-white flex items-center justify-center transition-all cursor-pointer shadow-2xl backdrop-blur-sm z-20 active:scale-95"
                  title="다음 슬라이드 (▶)"
                >
                  <ChevronRight size={22} />
                </button>
              </div>

              {/* 하단 5장 서론-본론-결론 네비게이션 스트립 */}
              <div className="w-full bg-[#0B101D] border-t border-slate-800/90 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 max-w-full">
                  {aiSlides.map((slide, sIdx) => {
                    const stageNames = ['서론 | 정의', '본론 ① | 메커니즘', '본론 ② | KDS 수식', '본론 ③ | 실무 시공', '결론 | 고득점 제언'];
                    const stageLabel = stageNames[sIdx] || `Slide 0${sIdx + 1}`;
                    return (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => setCurrentSlideIndex(sIdx)}
                        className={`relative flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all cursor-pointer group shrink-0 ${
                          sIdx === currentSlideIndex
                            ? 'ring-2 ring-amber-400 bg-amber-500/25 text-amber-300 font-black shadow-md'
                            : 'opacity-60 hover:opacity-100 hover:bg-slate-800/60 text-slate-400'
                        }`}
                        title={`Slide ${sIdx + 1}: ${slide.title || ''}`}
                      >
                        <span className="font-mono text-xs font-bold text-amber-400">0{sIdx + 1}</span>
                        <span className="text-xs font-bold">{stageLabel}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 shrink-0 text-slate-400 text-[11px] font-mono hidden sm:flex">
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-amber-400">5장 완결 덱</span>
                  <span>(방향키 ◀ ▶ 넘김)</span>
                </div>
              </div>
            </div>
          ) : activeView === 'web' && slideMeta?.slide_url ? (
            /* 모드 3: 구글 슬라이드 임베드 */
            <div className="w-full h-full p-2 flex flex-col">
              <iframe
                src={slideMeta.slide_url}
                title="Google Slides"
                className="w-full h-full rounded-xl border border-slate-800 shadow-2xl"
                allowFullScreen
              />
            </div>
          ) : (
            /* 모드 4: 미등록 안내 화면 */
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Presentation className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-black text-white mb-1.5">등록된 슬라이드 자료가 없습니다</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  NotebookLM 스튜디오에서 내보낸 <span className="text-amber-300 font-bold">PDF 파일</span>을 업로드하시면, <span className="text-emerald-400 font-bold">초경량 고화질 JPG 슬라이드</span>로 자동 변환되어 초고속 브라우징이 가능합니다!
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleGenerateAiDeck}
                  disabled={isGeneratingDeck}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer active:scale-95"
                >
                  <Sparkles size={14} className={isGeneratingDeck ? 'animate-spin' : ''} />
                  <span>{isGeneratingDeck ? 'AI 슬라이드 백그라운드 작성 중...' : 'AI 5장 슬라이드 생성 (백그라운드)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer"
                >
                  <Upload size={14} className="text-amber-400" />
                  <span>내 파일 등록 (JPG 자동 변환)</span>
                </button>
              </div>
            </div>
          )}

          {/* AI 모드일 때 좌우 플로팅 버튼 */}
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
                disabled={currentSlideIndex >= aiSlides.length - 1}
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
                  <h3 className="text-sm font-bold text-white">슬라이드(PPT / NotebookLM / 이미지) 등록 및 관리</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 1. 파일 직접 업로드 (PDF / 이미지 -> 경량 JPG 변환) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <ImageIcon size={13} className="text-amber-400" />
                  <span>1. 슬라이드 파일 직접 등록 (PDF / JPG / PNG)</span>
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-amber-400/80 rounded-xl p-5 text-center cursor-pointer transition-all bg-[#0A0F1D] hover:bg-[#121B2F]"
                >
                  <FileText className="w-8 h-8 text-amber-400 mx-auto mb-2 opacity-80" />
                  <span className="text-xs font-bold text-white block">
                    {isUploading || isConvertingPdf
                      ? '경량 JPG 슬라이드로 변환 및 업로드 중...'
                      : '클릭하여 NotebookLM PDF 또는 JPG 이미지 파일 선택'}
                  </span>
                  <span className="text-[10px] text-amber-300/80 mt-1 block font-medium">
                    ⚡ PDF를 선택하면 무거운 PDF 뷰어 대신 고화질 경량 JPG 슬라이드로 자동 변환됩니다
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  multiple
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
                {hasJpgSlides || hasWebUrl ? (
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
