import React, { useState, useEffect, useRef } from 'react';
import { 
  Brain, 
  UploadCloud, 
  CheckCircle, 
  Calendar, 
  List, 
  FileText, 
  FileCode,
  Sparkles, 
  PlusCircle, 
  RefreshCw, 
  File, 
  Trash2, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Award, 
  BookOpen, 
  Info,
  Check,
  Eye,
  EyeOff,
  Flame,
  LayoutTemplate
} from 'lucide-react';

// Pure browser-side PDF-to-Image renderer using PDF.js CDN
function PdfImageRenderer({ pdfUrl, pdfjsLoaded }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    const renderPages = async () => {
      if (!window.pdfjsLib) return;
      setLoading(true);
      setHasError(false);
      try {
        const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        if (!active) return;
        setNumPages(pdf.numPages);
        
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (!active) return;

          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.className = 'w-full max-w-3xl my-4 rounded-xl shadow-lg bg-white border border-slate-800 animate-fade-in';
          
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };
          await page.render(renderContext).promise;
          if (!active) return;
          
          container.appendChild(canvas);
        }
      } catch (err) {
        console.error('Error rendering PDF as image, falling back to native iframe:', err);
        if (active) {
          setHasError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    renderPages();
    return () => {
      active = false;
    };
  }, [pdfUrl, pdfjsLoaded]);

  if (hasError) {
    return (
      <div className="w-full flex-grow flex flex-col items-center bg-white rounded-2xl overflow-hidden h-[55vh] border border-slate-800">
        <iframe
          src={pdfUrl}
          className="w-full h-full border-0"
          title="Document Fallback HTML Viewer"
        />
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col items-center overflow-y-auto max-h-[55vh] px-2 bg-slateCustom-950 rounded-2xl border border-slate-850">
      {loading && (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="relative">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
          </div>
          <p className="text-xs text-slate-400">PDF를 고해상도 그림으로 변환하여 렌더링 중입니다...</p>
        </div>
      )}
      <div ref={containerRef} className="w-full flex flex-col items-center"></div>
      {!loading && numPages > 0 && (
        <p className="text-[10px] text-slate-500 my-2">총 {numPages}페이지가 이미지로 정상 변환되었습니다.</p>
      )}
    </div>
  );
}

export default function App() {
  const API_BASE = import.meta.env.VITE_API_URL || '';
  
  // Views: 'dashboard' (today's tasks) or 'all_topics' (all materials tracker)
  const [viewMode, setViewMode] = useState('dashboard');
  
  // Date selector for easy testing (defaults to today's local date 'YYYY-MM-DD')
  const getTodayString = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const [referenceDate, setReferenceDate] = useState(getTodayString());

  // Lists
  const [todayReviews, setTodayReviews] = useState([]);
  const [allTopics, setAllTopics] = useState([]);
  
  // Loadings
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  
  // Registration Form States
  const [title, setTitle] = useState('');
  const [keywords, setKeywords] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // AI Modal States
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [revealedQuestions, setRevealedQuestions] = useState({}); // Stores which question answers are unblurred/revealed
  const [selectedAnswers, setSelectedAnswers] = useState({}); // Stores chosen options for multiple choice questions { [questionIdx]: optionString }
  const [isFallback, setIsFallback] = useState(false);
  const [resetConfirmTarget, setResetConfirmTarget] = useState(null); // { scheduleId, topicTitle, round }
  const [showFullReport, setShowFullReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportViewType, setReportViewType] = useState('pdf'); // 'pdf' or 'image'
  const [pdfjsLoaded, setPdfjsLoaded] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const firstMatchRef = useRef(null);

  // Success Notification banner
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Fetch reviews based on selected reference date
  const fetchTodayReviews = async (dateStr) => {
    setLoadingReviews(true);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard?date=${dateStr}`);
      const data = await res.json();
      if (res.ok) {
        setTodayReviews(data.reviews || []);
      } else {
        console.error('Failed to load dashboard:', data.error);
      }
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  // Fetch all registered topics
  const fetchAllTopics = async () => {
    setLoadingTopics(true);
    try {
      const res = await fetch(`${API_BASE}/api/topics`);
      const data = await res.json();
      if (res.ok) {
        setAllTopics(data || []);
      } else {
        console.error('Failed to load topics:', data.error);
      }
    } catch (err) {
      console.error('Error fetching topics:', err);
    } finally {
      setLoadingTopics(false);
    }
  };

  // Load initial data
  useEffect(() => {
    fetchTodayReviews(referenceDate);
    fetchAllTopics();
  }, [referenceDate]);

  // Load PDF.js dynamically when switching to image view
  useEffect(() => {
    if (showFullReport && reportViewType === 'image' && !pdfjsLoaded) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        setPdfjsLoaded(true);
      };
      document.head.appendChild(script);
    }
  }, [showFullReport, reportViewType, pdfjsLoaded]);

  // Auto-scroll and focus on the first search match in grid tracker
  useEffect(() => {
    if (searchQuery && firstMatchRef.current) {
      firstMatchRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      firstMatchRef.current.focus();
    }
  }, [searchQuery]);

  // Form Submit (Uses the UI referenceDate as baseDate to maintain perfect study session alignment)
  const handleRegisterTopic = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      showNotification('토픽 제목을 입력해 주세요.', 'error');
      return;
    }

    setSubmitLoading(true);
    const formData = new FormData();
    formData.append('title', title);
    formData.append('keywords', keywords);
    formData.append('baseDate', referenceDate); // Fixes midnight timezone shifts
    if (pdfFile) {
      formData.append('pdf', pdfFile);
      formData.append('fileNameUtf8', pdfFile.name);
    }

    try {
      const res = await fetch(`${API_BASE}/api/topics`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        showNotification('새로운 토픽 등록 및 6개 회차 복습 스케줄 생성이 완료되었습니다!');
        setTitle('');
        setKeywords('');
        setPdfFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        // Refresh
        fetchTodayReviews(referenceDate);
        fetchAllTopics();
      } else {
        showNotification(data.error || '토픽 등록에 실패했습니다.', 'error');
      }
    } catch (err) {
      console.error('Registration error:', err);
      showNotification('서버 통신 오류로 등록에 실패했습니다.', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Mark specific schedule round as complete
  const handleCompleteReview = async (scheduleId, topicTitle, round) => {
    try {
      const res = await fetch(`${API_BASE}/api/schedules/${scheduleId}/complete`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok) {
        showNotification(`[${topicTitle}] ${round}회차 복습 완료 처리가 완료되었습니다!`);
        fetchTodayReviews(referenceDate);
        fetchAllTopics();
      } else {
        showNotification(data.error || '복습 완료 처리에 실패했습니다.', 'error');
      }
    } catch (err) {
      console.error('Review completion error:', err);
      showNotification('서버 오류로 완료 처리에 실패했습니다.', 'error');
    }
  };

  // Reset completed schedule back to pending
  const handleResetReview = async (scheduleId, topicTitle, round) => {
    try {
      const res = await fetch(`${API_BASE}/api/schedules/${scheduleId}/reset`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok) {
        showNotification(`[${topicTitle}] ${round}회차 복습이 대기 상태로 변경되었으며 오늘의 복습 목록에 다시 추가되었습니다.`);
        fetchTodayReviews(referenceDate);
        fetchAllTopics();
      } else {
        showNotification(data.error || '복습 상태 초기화에 실패했습니다.', 'error');
      }
    } catch (err) {
      console.error('Review reset error:', err);
      showNotification('서버 오류로 초기화 처리에 실패했습니다.', 'error');
    } finally {
      setResetConfirmTarget(null);
    }
  };

  // Delete specific Topic (includes prompt safety confirm)
  const handleDeleteTopic = async (topicId, topicTitle) => {
    if (!window.confirm(`[${topicTitle}] 토픽과 관련된 모든 4회차 복습 스케줄이 영구 삭제됩니다.\n정말 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/topics/${topicId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok) {
        showNotification(`토픽 [${topicTitle}]이 성공적으로 삭제되었습니다.`);
        // Refresh
        fetchTodayReviews(referenceDate);
        fetchAllTopics();
      } else {
        showNotification(data.error || '토픽 삭제에 실패했습니다.', 'error');
      }
    } catch (err) {
      console.error('Delete topic error:', err);
      showNotification('서버 오류로 토픽 삭제에 실패했습니다.', 'error');
    }
  };

  // Trigger Gemini AI custom questions Modal
  const handleOpenAIQuestions = async (topicId, title, keywords, pdfName) => {
    setSelectedTopic({ id: topicId, title, keywords, pdf_name: pdfName });
    setLoadingAI(true);
    setAiQuestions([]);
    setRevealedQuestions({}); // Reset revealed answers
    setSelectedAnswers({}); // Reset MC selected answers
    setIsFallback(false);
    setShowFullReport(false);
    setReportText('');

    try {
      const res = await fetch(`${API_BASE}/api/topics/${topicId}/ai-questions`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok) {
        setAiQuestions(data.questions || []);
        setIsFallback(!!data.isFallback);
      } else {
        showNotification(data.error || 'AI 기출문제를 생성하지 못했습니다.', 'error');
      }
    } catch (err) {
      console.error('AI call error:', err);
      showNotification('서버 통신 오류로 AI 예상문제를 로드하지 못했습니다.', 'error');
    } finally {
      setLoadingAI(false);
    }
  };

  // View full report text
  const handleViewFullReport = async (topicId) => {
    setLoadingReport(true);
    setShowFullReport(true);
    try {
      const res = await fetch(`${API_BASE}/api/topics/${topicId}/text`);
      const data = await res.json();
      if (res.ok) {
        setReportText(data.text || '보고서 내용이 비어 있습니다.');
      } else {
        setReportText(`오류: ${data.error || '보고서를 불러오지 못했습니다.'}`);
      }
    } catch (err) {
      console.error("Error fetching report:", err);
      setReportText("서버 통신 오류로 보고서를 불러오지 못했습니다.");
    } finally {
      setLoadingReport(false);
    }
  };

  // Toggle reveal state for specific question index
  const handleToggleReveal = (index) => {
    setRevealedQuestions(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Drag and Drop File Handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const fileNameLower = file.name.toLowerCase();
      const isPdf = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf');
      const isHtml = file.type === 'text/html' || fileNameLower.endsWith('.html') || fileNameLower.endsWith('.htm');
      if (isPdf || isHtml) {
        setPdfFile(file);
        // Auto-populate title with filename without extension
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        setTitle(baseName);
      } else {
        showNotification('PDF 또는 HTML 파일 형식만 업로드 가능합니다.', 'error');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPdfFile(file);
      // Auto-populate title with filename without extension
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      setTitle(baseName);
    }
  };

  // Helper colors for spaced repetition rounds
  const getRoundBadgeStyle = (round) => {
    switch (round) {
      case 1: return 'bg-violet-950/60 text-violet-300 border border-violet-500/30';
      case 2: return 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/30';
      case 3: return 'bg-blue-950/60 text-blue-300 border border-blue-500/30';
      case 4: return 'bg-amber-950/60 text-amber-300 border border-amber-500/30';
      case 5: return 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30';
      case 6: return 'bg-rose-950/60 text-rose-300 border border-rose-500/30';
      default: return 'bg-slate-900 text-slate-300';
    }
  };

  // Completion calculation for header stats
  const totalCompletedCount = allTopics.reduce((acc, topic) => {
    const completedForTopic = topic.schedules?.filter(s => s.status === 'completed').length || 0;
    return acc + completedForTopic;
  }, 0);
  const totalScheduleCount = allTopics.length * 4;
  const overallProgressPercent = totalScheduleCount > 0 ? Math.round((totalCompletedCount / totalScheduleCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-slateCustom-950 pb-16 flex flex-col justify-start">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl transition-all duration-300 transform scale-100 ${
          notification.type === 'error' 
            ? 'bg-rose-950/90 text-rose-200 border border-rose-500/50' 
            : 'bg-emerald-950/90 text-emerald-200 border border-emerald-500/50'
        }`}>
          {notification.type === 'error' ? <Info size={20} /> : <CheckCircle size={20} />}
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Top Premium Navbar */}
      <header className="w-full glass-panel border-b border-slate-800 py-5 px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-tr from-brand-600 to-indigo-500 rounded-2xl glow-purple">
            <Brain className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-brand-400 bg-clip-text text-transparent">
              기술사 Spaced Repetition 복습 시스템
            </h1>
            <p className="text-xs md:text-sm text-slate-400 font-medium">
              에빙하우스 망각곡선 기반 스케줄링 & AI 기출 예상문제 출제 비서
            </p>
          </div>
        </div>

        {/* Date Tester Slider & Tabs */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 bg-slateCustom-900 border border-slate-800 rounded-xl px-4 py-2">
            <Calendar size={16} className="text-brand-400" />
            <label className="text-xs font-semibold text-slate-400 whitespace-nowrap">복습 기준일:</label>
            <input 
              type="date" 
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-white border-0 focus:ring-0 focus:outline-none cursor-pointer"
            />
            {referenceDate !== getTodayString() && (
              <button 
                onClick={() => setReferenceDate(getTodayString())}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                title="오늘 날짜로 리셋"
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>

          <div className="flex md:hidden bg-slateCustom-900/60 p-1 border border-slate-800/80 rounded-xl">
            <button
              onClick={() => setViewMode('dashboard')}
              className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all duration-200 ${
                viewMode === 'dashboard'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Calendar size={14} />
              오늘의 복습
            </button>
            <button
              onClick={() => setViewMode('all_topics')}
              className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all duration-200 ${
                viewMode === 'all_topics'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <List size={14} />
              토픽 진행현황 ({allTopics.length})
            </button>
          </div>
        </div>
      </header>

      {/* Floating Vertical Navigation - Left Center (Desktop Only) */}
      <div className="fixed left-4 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-4 glass-panel p-3 border border-slate-800 shadow-2xl z-40 rounded-2xl glow-purple animate-fade-in">
        <button
          onClick={() => setViewMode('dashboard')}
          className={`flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
            viewMode === 'dashboard'
              ? 'bg-gradient-to-tr from-brand-600 to-indigo-500 text-white shadow-lg glow-purple'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
          title="오늘의 복습"
        >
          <Calendar size={20} />
          <span className="text-[10px] font-bold tracking-tight">오늘의 복습</span>
        </button>
        <button
          onClick={() => setViewMode('all_topics')}
          className={`flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
            viewMode === 'all_topics'
              ? 'bg-gradient-to-tr from-brand-600 to-indigo-500 text-white shadow-lg glow-purple'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
          }`}
          title={`토픽 진행현황 (${allTopics.length})`}
        >
          <List size={20} />
          <span className="text-[10px] font-bold tracking-tight">진행현황</span>
          <span className="text-[9px] px-1.5 py-0.5 bg-slateCustom-950 text-brand-400 rounded-full border border-brand-500/20 font-black">{allTopics.length}</span>
        </button>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto px-6 md:px-12 md:pl-28 mt-8 flex-grow">
        
        {/* Statistics Dashboard Banner */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
          <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex items-center gap-4 glow-purple">
            <div className="p-3 bg-violet-950/60 text-violet-400 rounded-xl">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">오늘 복습 대상 토픽</p>
              <h3 className="text-2xl font-black text-white mt-1">
                {loadingReviews ? '-' : `${todayReviews.length}개`}
              </h3>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex items-center gap-4">
            <div className="p-3 bg-emerald-950/60 text-emerald-400 rounded-xl">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">학습 시작한 토픽</p>
              <h3 className="text-2xl font-black text-white mt-1">
                {allTopics.length}개
              </h3>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex items-center gap-4">
            <div className="p-3 bg-brand-950/60 text-brand-400 rounded-xl">
              <Award size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">총 복습 완료 세션</p>
              <h3 className="text-2xl font-black text-white mt-1">
                {totalCompletedCount}회 / {totalScheduleCount}회
              </h3>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-slate-800">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-medium text-slate-400">전체 스케줄 완료율</p>
              <span className="text-xs font-black text-brand-400">{overallProgressPercent}%</span>
            </div>
            <div className="w-full bg-slateCustom-900 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-brand-600 to-indigo-500 h-2 rounded-full transition-all duration-500 ease-out" 
                style={{ width: `${overallProgressPercent}%` }}
              ></div>
            </div>
             <p className="text-[10px] text-slate-500 mt-2">각 토픽의 1일, 4일, 7일, 14일, 35일, 60일 복습 달성률</p>
          </div>
        </section>

        {viewMode === 'dashboard' ? (
          /* DASHBOARD VIEW (Two Column) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT: Today's review items list */}
            <section className="lg:col-span-7 space-y-5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Clock size={20} className="text-brand-400" />
                  <h2 className="text-lg font-bold text-white">오늘의 복습 토픽 목록</h2>
                </div>
                <span className="text-xs font-bold text-slate-400 bg-slateCustom-900 border border-slate-800 rounded-lg px-2.5 py-1">
                  총 {todayReviews.length}개 대기 중
                </span>
              </div>

              {loadingReviews ? (
                <div className="glass-panel rounded-3xl p-12 border border-slate-800 flex flex-col items-center justify-center gap-4">
                  <RefreshCw className="animate-spin text-brand-500" size={32} />
                  <p className="text-sm font-medium text-slate-400">데이터를 불러오는 중입니다...</p>
                </div>
              ) : todayReviews.length === 0 ? (
                /* Empty state */
                <div className="glass-panel rounded-3xl p-12 border border-slate-800 text-center flex flex-col items-center justify-center">
                  <div className="p-4 bg-emerald-950/30 text-emerald-400 rounded-full mb-4 animate-pulse-slow">
                    <CheckCircle size={36} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">오늘 예정된 복습이 모두 완료되었습니다!</h3>
                  <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
                    에빙하우스 망각곡선 필터 기준, 복습 대상인 토픽이 없습니다. 새로운 학습 토픽을 등록하거나 복습 기준일을 미래 날짜로 변경하여 테스트해 보세요.
                  </p>
                </div>
              ) : (
                /* Card List */
                <div className="space-y-4">
                  {todayReviews.map((item) => (
                    <div 
                      key={item.schedule_id}
                      className="glass-panel rounded-2xl p-5 border border-slate-800 hover:border-slate-700/80 transition-all duration-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glow-purple-hover"
                    >
                      <div className="space-y-2.5 flex-grow">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${getRoundBadgeStyle(item.review_round)}`}>
                            {item.review_round}회차 복습
                          </span>
                          {item.planned_date < referenceDate && (
                            <span className="text-[10px] bg-rose-950/60 text-rose-300 border border-rose-500/30 font-bold px-2 py-0.5 rounded-full">
                              미뤄진 복습
                            </span>
                          )}
                          {item.pdf_name && (
                            <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              {item.pdf_name.toLowerCase().endsWith('.html') || item.pdf_name.toLowerCase().endsWith('.htm') ? <FileCode size={10} /> : <FileText size={10} />}
                              {item.pdf_name.toLowerCase().endsWith('.html') || item.pdf_name.toLowerCase().endsWith('.htm') ? 'HTML 첨부' : 'PDF 첨부'}
                            </span>
                          )}
                        </div>

                        <h3 className="text-base md:text-lg font-bold text-white tracking-tight">
                          {item.title}
                        </h3>

                        {/* Keyword list */}
                        {item.keywords && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {item.keywords.split(/[,#\s]+/).filter(Boolean).map((kw, i) => (
                              <span key={i} className="text-xs bg-slateCustom-900 text-slate-400 border border-slate-800/80 px-2 py-0.5 rounded-md font-medium">
                                #{kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2.5 w-full md:w-auto pt-3 md:pt-0 border-t border-slate-800/60 md:border-t-0 justify-end">
                        <button
                          onClick={() => handleOpenAIQuestions(item.topic_id, item.title, item.keywords, item.pdf_name)}
                          className="flex-grow md:flex-grow-0 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-stone-950 border border-amber-300/60 text-xs font-black transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
                        >
                          <Sparkles size={14} className="text-stone-950 animate-pulse" />
                          복습하기 (AI 기출)
                        </button>
                        
                        <button
                          onClick={() => handleCompleteReview(item.schedule_id, item.title, item.review_round)}
                          className="flex-grow md:flex-grow-0 flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-slate-300 hover:bg-slate-200 text-slate-900 border border-slate-400/30 text-xs font-black transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
                          title="skip"
                        >
                          <Check size={14} className="text-slate-900" />
                          skip
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* RIGHT: Today's study registration form */}
            <section className="lg:col-span-5 glass-panel rounded-3xl p-6 border border-slate-800/80 shadow-xl">
              <div className="flex items-center gap-2 mb-6">
                <PlusCircle size={20} className="text-brand-400" />
                <h2 className="text-lg font-bold text-white">오늘 공부한 토픽 등록</h2>
              </div>

              <form onSubmit={handleRegisterTopic} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">
                    토픽 제목 <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: B-Tree와 B+Tree 구조 및 비교"
                    className="w-full bg-slateCustom-900/90 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all duration-200"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">
                    핵심 키워드 <span className="text-slate-500">(쉼표로 구분)</span>
                  </label>
                  <input 
                    type="text" 
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="예: 인덱스, 리프노드, 순차주사, 데이터 저장구조"
                    className="w-full bg-slateCustom-900/90 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all duration-200"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    * AI가 해당 키워드를 활용해 10점형/25점형 기출문제를 더 정교하게 만듭니다.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">
                    기술사 서적/노트 PDF 또는 HTML 업로드
                  </label>
                  
                  <div 
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer flex flex-col items-center justify-center transition-all duration-200 ${
                      dragActive 
                        ? 'border-brand-500 bg-brand-950/20' 
                        : pdfFile 
                          ? 'border-emerald-500/50 bg-emerald-950/5' 
                          : 'border-slate-800 hover:border-slate-700 hover:bg-slateCustom-900/30'
                    }`}
                  >
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      accept=".pdf,.html,.htm"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {pdfFile ? (
                      <div className="w-full flex flex-col items-center">
                        <div className="p-3 bg-emerald-950/50 text-emerald-400 rounded-full mb-3">
                          {pdfFile.name.toLowerCase().endsWith('.html') || pdfFile.name.toLowerCase().endsWith('.htm') ? (
                            <FileCode size={28} />
                          ) : (
                            <FileText size={28} />
                          )}
                        </div>
                        <p className="text-sm font-semibold text-emerald-300 truncate max-w-full px-4">
                          {pdfFile.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPdfFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/50 text-rose-300 hover:bg-rose-900/60 border border-rose-500/20 text-xs font-bold transition-all duration-200"
                        >
                          <Trash2 size={12} />
                          제거
                        </button>
                      </div>
                    ) : (
                      <>
                        <UploadCloud size={32} className="text-slate-500 mb-2" />
                        <p className="text-sm font-bold text-slate-300">Drag & Drop 또는 파일 선택</p>
                        <p className="text-xs text-slate-500 mt-1">PDF 또는 HTML 파일 가능 (최대 10MB)</p>
                      </>
                    )}
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={submitLoading}
                  className="w-full bg-gradient-to-r from-brand-600 to-indigo-600 text-white rounded-xl py-3.5 font-black text-sm hover:from-brand-500 hover:to-indigo-500 transition-all duration-300 shadow-lg shadow-brand-950/40 border border-brand-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed glow-purple-hover"
                >
                  {submitLoading ? (
                    <>
                      <RefreshCw className="animate-spin" size={16} />
                      토픽 등록 스케줄링 중...
                    </>
                  ) : (
                    <>
                      <PlusCircle size={16} />
                      오늘 공부 토픽으로 등록
                    </>
                  )}
                </button>
              </form>
            </section>
          </div>
        ) : (
          /* TOTAL SPaced Grid TRACKER VIEW */
          <section className="glass-panel rounded-3xl p-6 border border-slate-800/80 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <List size={20} className="text-brand-400" />
                <h2 className="text-lg font-bold text-white">등록한 모든 토픽 스케줄링 테이블</h2>
              </div>
              
              {/* Search bar inside allTopics view */}
              <div className="relative w-full md:w-80 flex gap-2">
                <div className="relative flex-grow">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setSearchQuery(searchInput);
                      }
                    }}
                    placeholder="토픽 제목 또는 키워드 검색..."
                    className="w-full bg-slateCustom-900 border border-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all duration-200"
                  />
                  <div className="absolute left-3 top-3 text-slate-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                  </div>
                </div>
                
                {/* Dynamically toggle between Search and Clear button */}
                {searchQuery && searchQuery === searchInput ? (
                  <button 
                    onClick={() => {
                      setSearchInput('');
                      setSearchQuery('');
                    }}
                    className="flex-shrink-0 text-slate-400 hover:text-white text-xs font-bold bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-2.5 transition-colors border border-slate-700"
                  >
                    지우기
                  </button>
                ) : (
                  <button 
                    onClick={() => setSearchQuery(searchInput)}
                    className="flex-shrink-0 text-brand-300 hover:text-white text-xs font-bold bg-brand-950/60 hover:bg-brand-900/60 border border-brand-500/30 rounded-xl px-4 py-2.5 transition-colors"
                  >
                    검색
                  </button>
                )}
              </div>
            </div>

            {loadingTopics ? (
              <div className="py-12 flex flex-col items-center justify-center gap-4">
                <RefreshCw className="animate-spin text-brand-500" size={32} />
                <p className="text-sm font-medium text-slate-400">전체 목록을 로딩하는 중입니다...</p>
              </div>
            ) : allTopics.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-400">아직 등록된 학습 토픽이 없습니다. 첫 번째 토픽을 등록해 복습 스케줄을 확인해 보세요!</p>
              </div>
            ) : (() => {
              const matchedIndex = searchQuery 
                ? allTopics.findIndex(topic => 
                    topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (topic.keywords && topic.keywords.toLowerCase().includes(searchQuery.toLowerCase()))
                  )
                : -1;
              
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-bold">
                        <th className="py-4 px-4">토픽 정보 (클릭 시 퀴즈)</th>
                        <th className="py-4 px-2 text-center">1회차 복습 (1일 뒤)</th>
                        <th className="py-4 px-2 text-center">2회차 복습 (4일 뒤)</th>
                        <th className="py-4 px-2 text-center">3회차 복습 (7일 뒤)</th>
                        <th className="py-4 px-2 text-center">4회차 복습 (14일 뒤)</th>
                        <th className="py-4 px-2 text-center">5회차 복습 (35일 뒤)</th>
                        <th className="py-4 px-2 text-center">6회차 복습 (60일 뒤)</th>
                        <th className="py-4 px-2 text-center">도구</th>
                        <th className="py-4 px-4 text-right">등록 일시</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-sm">
                      {allTopics.map((topic, idx) => {
                        const isFirstMatch = searchQuery && idx === matchedIndex;
                        return (
                          <tr 
                            key={topic.id} 
                            className={`transition-all duration-300 ${
                              isFirstMatch 
                                ? 'bg-brand-950/20 border-l-4 border-l-brand-500 scale-[1.005] shadow-md shadow-brand-500/10' 
                                : 'hover:bg-slateCustom-900/40 hover:scale-[1.002]'
                            }`}
                          >
                            <td className="py-4 px-4 max-w-xs">
                              <div className="space-y-1">
                                <h4 
                                  ref={isFirstMatch ? firstMatchRef : null}
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleOpenAIQuestions(topic.id, topic.title, topic.keywords, topic.pdf_name);
                                    }
                                  }}
                                  onClick={() => handleOpenAIQuestions(topic.id, topic.title, topic.keywords, topic.pdf_name)}
                                  className="font-bold text-white text-sm truncate hover:text-brand-400 cursor-pointer transition-colors focus:text-brand-400 focus:outline-none"
                                  title="클릭 시 복습 주기에 상관없이 자율 인출 기출 퀴즈를 풉니다."
                                >
                                  {topic.title}
                                </h4>
                                {topic.pdf_name ? (
                                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                    {topic.pdf_name.toLowerCase().endsWith('.html') || topic.pdf_name.toLowerCase().endsWith('.htm') ? <FileCode size={10} /> : <FileText size={10} />}
                                    {topic.pdf_name}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-slate-600">직접 수기 등록</p>
                                )}
                              </div>
                            </td>
                            
                            {/* 6 spaced rounds status grid */}
                            {[1, 2, 3, 4, 5, 6].map((round) => {
                              const sched = topic.schedules?.find(s => s.review_round === round);
                              return (
                                <td key={round} className="py-4 px-2 text-center">
                                  {sched ? (
                                    <div className="flex flex-col items-center">
                                      {sched.status === 'completed' ? (
                                        <button
                                          onClick={() => setResetConfirmTarget({
                                            scheduleId: sched.id,
                                            topicTitle: topic.title,
                                            round: round
                                          })}
                                          className="inline-flex items-center gap-0.5 text-xs text-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/60 hover:text-emerald-200 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-semibold cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm focus:outline-none"
                                          title="클릭 시 이 복습을 다시 대기 상태로 되돌리고 오늘 복습에 생성합니다."
                                        >
                                          완료
                                        </button>
                                      ) : (
                                        <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 bg-slateCustom-900 border border-slate-800 px-2 py-0.5 rounded-full font-medium">
                                          대기
                                        </span>
                                      )}
                                      <span className="text-[10px] text-slate-500 mt-1 block font-mono">{sched.planned_date}</span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-600">-</span>
                                  )}
                                </td>
                              );
                            })}

                            {/* Instant Quiz & Delete Buttons */}
                            <td className="py-4 px-2 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleOpenAIQuestions(topic.id, topic.title, topic.keywords, topic.pdf_name)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-950/60 hover:bg-violet-900/60 text-violet-300 border border-violet-500/20 text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                                  title="복습 주기에 관계없이 언제든 실전 기출 퀴즈를 풉니다."
                                >
                                  <Sparkles size={12} />
                                  즉시 퀴즈
                                </button>
                                <button
                                  onClick={() => handleDeleteTopic(topic.id, topic.title)}
                                  className="p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-500/20 text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                                  title="이 토픽과 모든 복습 일정을 영구 삭제합니다."
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>

                            <td className="py-4 px-4 text-right text-xs text-slate-500 font-mono">
                              {new Date(topic.created_at).toLocaleString('ko-KR', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </section>
        )}
      </main>

      {/* AI 복습 도우미 모달 (Korean PE Examination Theme - Active Recall Style) */}
      {selectedTopic && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slateCustom-950/80 backdrop-blur-md transition-all duration-300">
          <div className="w-full max-w-4xl glass-panel rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-violet-950 to-slateCustom-900 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <Sparkles className="text-brand-400" size={18} />
                <h3 className="font-bold text-white text-base">인출 중심 AI 복습 도우미</h3>
              </div>
              <button 
                onClick={() => setSelectedTopic(null)}
                className="text-slate-400 hover:text-white bg-slateCustom-900 border border-slate-800 p-1.5 rounded-lg text-sm transition-colors"
              >
                닫기
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-grow bg-slateCustom-900/30">
              {loadingAI ? (
                /* Pulsing AI Thinking state */
                <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="relative">
                    <div className="p-5 bg-brand-950/80 text-brand-400 rounded-full relative z-10 animate-bounce-slow">
                      <Brain size={36} />
                    </div>
                    <div className="absolute inset-0 bg-brand-500 rounded-full animate-ping opacity-25"></div>
                  </div>
                  <h4 className="text-lg font-bold text-white mt-2">Gemini AI가 예상문제 및 답안 가이드라인 설계 중...</h4>
                  <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                    본문 자료를 분석하여 기술사 합격 기준의 **예상 기출문제**와 **답안 구성 핵심(개념, 공식, 답안 구조)**을 생성하고 있습니다. 잠시만 기다려 주세요.
                  </p>
                </div>
              ) : (
                /* Styled Professional Engineer Examination Sheet */
                <div className="space-y-6">
                  <div className="p-4 bg-slateCustom-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center">
                    <div>
                      <span className="text-[10px] font-black uppercase text-brand-400 tracking-wider">복습 대상 토픽</span>
                      <h3 className="text-base font-extrabold text-white mt-0.5">{selectedTopic.title}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      {selectedTopic && selectedTopic.id && (
                        <button
                          onClick={() => setShowFullReport(!showFullReport)}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-500/20 text-xs font-bold transition-all duration-200"
                        >
                          {showFullReport ? "✍️ 기출문제 풀기로 가기" : "📄 보고서 전문 보기"}
                        </button>
                      )}
                      {isFallback && (
                        <span className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold">
                          <Info size={12} />
                          로컬 기출문제 출제기 가동됨
                        </span>
                      )}
                    </div>
                  </div>

                  {showFullReport ? (
                    /* Beautiful Glassmorphic Full Report Native PDF Viewer */
                    <div className="bg-slateCustom-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-4 max-h-[80vh] flex flex-col animate-fade-in">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
                        <div>
                          <h4 className="font-extrabold text-white text-base flex items-center gap-2">
                            <FileText className="text-brand-400" size={18} />
                            {selectedTopic.title} - 원본 파일 보기
                          </h4>
                          {!selectedTopic.pdf_name?.toLowerCase().endsWith('.html') && !selectedTopic.pdf_name?.toLowerCase().endsWith('.htm') ? (
                            <div className="flex mt-1.5 p-0.5 bg-slateCustom-950 border border-slate-800/80 rounded-lg max-w-max">
                              <button
                                onClick={() => setReportViewType('pdf')}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all duration-200 ${
                                  reportViewType === 'pdf'
                                    ? 'bg-brand-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                📄 PDF 파일로 보기
                              </button>
                              <button
                                onClick={() => setReportViewType('image')}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all duration-200 ${
                                  reportViewType === 'image'
                                    ? 'bg-brand-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                🖼️ 그림(이미지)으로 보기
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-black text-emerald-400 mt-2 block animate-pulse">
                              🌐 HTML 보고서 원본 모드 (그림/도표 완벽 지원)
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          {selectedTopic.pdf_name && (
                            <a
                              href={`${API_BASE}/api/topics/${selectedTopic.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-grow sm:flex-grow-0 text-center text-xs bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-500/20 px-3.5 py-2 rounded-xl transition-all duration-200 font-bold"
                            >
                              ↗️ 새 창에서 원본 열기
                            </a>
                          )}
                          <button
                            onClick={() => setShowFullReport(false)}
                            className="flex-grow sm:flex-grow-0 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-xl transition-all duration-200 font-bold"
                          >
                            시험지로 돌아가기
                          </button>
                        </div>
                      </div>
                      {selectedTopic.pdf_name ? (
                        selectedTopic.pdf_name.toLowerCase().endsWith('.html') || selectedTopic.pdf_name.toLowerCase().endsWith('.htm') ? (
                          <div className="flex-grow rounded-2xl overflow-hidden border border-slate-800 bg-white h-[55vh]">
                            <iframe
                              src={`${API_BASE}/api/topics/${selectedTopic.id}/pdf`}
                              className="w-full h-full border-0"
                              title="Original HTML Document Viewer"
                            />
                          </div>
                        ) : reportViewType === 'pdf' ? (
                          <div className="flex-grow rounded-2xl overflow-hidden border border-slate-800 bg-slateCustom-950 h-[55vh]">
                            <iframe
                              src={`${API_BASE}/api/topics/${selectedTopic.id}/pdf`}
                              className="w-full h-full border-0"
                              title="Original Document PDF Viewer"
                            />
                          </div>
                        ) : (
                          <PdfImageRenderer pdfUrl={`${API_BASE}/api/topics/${selectedTopic.id}/pdf`} pdfjsLoaded={pdfjsLoaded} />
                        )
                      ) : (
                        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                          <Info size={32} className="text-slate-500" />
                          <p className="text-sm text-slate-400">수기로 등록한 토픽이며 첨부된 보고서 파일이 없습니다.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {isFallback && (
                        <div className="bg-amber-950/40 text-amber-200 border border-amber-500/30 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed animate-fade-in">
                          <div className="text-amber-400 font-extrabold flex-shrink-0 text-base">💡</div>
                          <div>
                            <strong className="font-bold text-amber-300 block mb-1">알림: Gemini API Key 미설정 (로컬 출제 모드)</strong>
                            현재 백엔드에 Gemini API Key가 설정되지 않아, 파일 본문(PDF/HTML) 대신 등록하신 <strong>제목과 키워드 중심의 로컬 예상 기출문제</strong>가 출력되었습니다. 
                            파일 본문의 구체적인 기술 명세를 학습 분석하여 고난도 실전 기출문제를 출제하고 싶다면, 백엔드의 <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-400 font-mono">server/.env</code> 파일에 <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-400 font-mono">GEMINI_API_KEY</code>를 등록하고 백엔드 서버를 재시작해 주세요.
                          </div>
                        </div>
                      )}

                      {/* PE Traditional Exam Sheet */}
                      <div className="exam-paper rounded-2xl p-6 md:p-8 font-sans">
                        
                        {/* Sheet Title */}
                        <div className="border-4 double border-stone-800 text-center py-4 mb-6 relative">
                          <div className="absolute left-4 top-3 text-[10px] font-black text-stone-500 tracking-tighter">기술사 모의시험</div>
                          <h4 className="text-xl md:text-2xl font-black text-stone-900 tracking-widest">🧠 기 술 사 인 출 고 사</h4>
                          <p className="text-xs font-bold text-stone-700 mt-1">에빙하우스 능동적 인출(Active Recall) 훈련</p>
                        </div>

                        {/* Technical Exam Instructions */}
                        <div className="bg-stone-200/50 border border-stone-300 rounded-lg p-3 text-[11px] text-stone-800 space-y-1.5 leading-relaxed mb-6 font-semibold">
                          <p className="font-extrabold text-stone-900">※ 수험생 유의사항:</p>
                          <ul className="list-disc pl-4 space-y-0.5">
                            <li>제시된 질문을 읽고, <strong>핵심 개념, 연산 공식(또는 개념도 형태), 답안 3단락 구성 방식</strong>을 머릿속으로 먼저 철저히 인출(Recall)하십시오.</li>
                            <li>생각이 정리되었다면 아래의 **[인출 완료! 정답 확인하기]** 버튼을 클릭하여 실제 모범 답안 구조와 내 기억을 매핑하십시오.</li>
                            <li>단순히 답안을 읽는 것은 복습 효과가 낮습니다. 반드시 머릿속에서 끄집어내는 과정을 거친 후 확인하는 습관을 들이십시오.</li>
                          </ul>
                        </div>

                        {/* Question List */}
                        <div className="space-y-8">
                          {aiQuestions.map((q, idx) => {
                            const isRevealed = !!revealedQuestions[idx];
                            const isMultipleChoice = q.options && q.options.length > 0;
                            const hasAnsweredMC = selectedAnswers[idx] !== undefined;

                            return (
                              <div key={idx} className="border-b border-stone-300 pb-6 last:border-0 last:pb-0">
                                
                                {/* Round Header */}
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded text-white ${
                                    q.type.includes('개념') ? 'bg-indigo-700' : 
                                    q.type.includes('공식') ? 'bg-rose-700' : 
                                    'bg-emerald-700'
                                  }`}>
                                    {q.type}
                                  </span>
                                  <span className="text-[10px] font-bold text-stone-500">질문 {idx + 1}</span>
                                </div>

                                {/* Question prompt */}
                                <p className="text-base font-black text-stone-900 leading-relaxed mb-4 text-left">
                                  {idx + 1}. {q.question}
                                </p>

                                {/* INTERACTIVE CARD */}
                                <div className="mt-4">
                                  {isMultipleChoice ? (
                                    /* INTERACTIVE MULTIPLE CHOICE CARD */
                                    <div className="space-y-3">
                                      <div className="grid grid-cols-1 gap-2.5">
                                        {q.options.map((opt, oIdx) => {
                                          const isSelected = selectedAnswers[idx] === opt;
                                          const isCorrect = q.answer === opt;
                                          
                                          let buttonClass = "w-full text-left p-3.5 bg-stone-100/50 hover:bg-stone-200/80 active:scale-[0.99] border border-stone-300 rounded-xl text-stone-850 text-xs font-bold tracking-tight transition-all duration-200 flex items-center justify-between shadow-sm cursor-pointer";
                                          
                                          if (hasAnsweredMC) {
                                            if (isCorrect) {
                                              buttonClass = "w-full text-left p-3.5 bg-emerald-50 border-2 border-emerald-500 rounded-xl text-emerald-950 text-xs font-extrabold tracking-tight transition-all duration-200 flex items-center justify-between shadow-md";
                                            } else if (isSelected) {
                                              buttonClass = "w-full text-left p-3.5 bg-rose-50 border-2 border-rose-500 rounded-xl text-rose-950 text-xs font-extrabold tracking-tight transition-all duration-200 flex items-center justify-between shadow-md";
                                            } else {
                                              buttonClass = "w-full text-left p-3.5 bg-stone-50/50 border border-stone-200 rounded-xl text-stone-400 text-xs font-medium tracking-tight transition-all duration-200 flex items-center justify-between opacity-50 cursor-not-allowed";
                                            }
                                          }

                                          return (
                                            <button
                                              key={oIdx}
                                              disabled={hasAnsweredMC}
                                              onClick={() => setSelectedAnswers(prev => ({ ...prev, [idx]: opt }))}
                                              className={buttonClass}
                                            >
                                              <span className="leading-snug pr-4 text-left">{oIdx + 1}. {opt}</span>
                                              {hasAnsweredMC && isCorrect && (
                                                <span className="bg-emerald-500 text-white rounded-full p-0.5 flex items-center justify-center flex-shrink-0 animate-scale-up">
                                                  <Check size={12} strokeWidth={3} />
                                                </span>
                                              )}
                                              {hasAnsweredMC && isSelected && !isCorrect && (
                                                <span className="bg-rose-500 text-white rounded-full px-1 py-0.5 text-[8px] font-black flex items-center justify-center flex-shrink-0 animate-scale-up">
                                                  X
                                                </span>
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>

                                      {/* Explanation Box */}
                                      {hasAnsweredMC && (
                                        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-5 md:p-6 space-y-3 shadow-sm animate-fade-in transition-all duration-300 mt-4 text-left">
                                          <div className="flex items-center gap-1.5 border-b border-amber-200/60 pb-2">
                                            <Sparkles size={14} className="text-amber-700 animate-pulse" />
                                            <span className="text-xs font-black text-amber-950">
                                              풀이 검증 및 상세 해설 (Explanation)
                                            </span>
                                            <span className={`ml-auto text-[10px] font-extrabold px-2 py-0.5 rounded text-white ${
                                              selectedAnswers[idx] === q.answer ? 'bg-emerald-600 animate-bounce' : 'bg-rose-600'
                                            }`}>
                                              {selectedAnswers[idx] === q.answer ? '정답입니다!' : '오답입니다'}
                                            </span>
                                          </div>
                                          <div className="text-xs font-bold text-stone-850 space-y-2">
                                            <p className="text-stone-900 font-extrabold flex items-center gap-1">
                                              <span className="text-[10px] bg-stone-200 px-1.5 py-0.5 rounded text-stone-700">체크된 정답</span> 
                                              <span className="text-emerald-700 underline">{q.answer}</span>
                                            </p>
                                            <p className="leading-relaxed font-medium text-stone-700 whitespace-pre-line pt-1 text-[11px] border-t border-stone-200/40">
                                              {q.explanation || '해당 문제의 상세 설명이 제공되지 않았습니다.'}
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    /* ACTIVE RECALL INTERACTIVE CARD (For Question 1 & 2) */
                                    <>
                                      {!isRevealed ? (
                                        /* Locked/Blurred Trigger Box */
                                        <button
                                          onClick={() => handleToggleReveal(idx)}
                                          className="w-full p-6 bg-stone-200/70 hover:bg-stone-200 border-2 border-dashed border-stone-400 hover:border-brand-500 rounded-2xl flex flex-col items-center justify-center gap-2 text-stone-700 transition-all duration-300 group hover:shadow-lg cursor-pointer"
                                        >
                                          <EyeOff size={24} className="text-stone-500 group-hover:text-brand-500 transition-colors animate-pulse" />
                                          <span className="text-sm font-black text-stone-900 tracking-tight group-hover:text-brand-600 transition-colors">
                                            뇌에서 끄집어내기 완료! 정답(개념, 공식, 답안 구조) 확인하기
                                          </span>
                                          <span className="text-[11px] text-stone-500">
                                            * 머릿속으로 아웃라인을 설계한 뒤 클릭해 정답을 맞추는 것이 암기 효율에 가장 좋습니다.
                                          </span>
                                        </button>
                                      ) : (
                                        /* Answer Display Container */
                                        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-5 md:p-6 space-y-4 shadow-sm animate-fade-in transition-all duration-300">
                                          
                                          {/* Answer Reveal Header */}
                                          <div className="flex justify-between items-center border-b border-amber-200/60 pb-2">
                                            <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                                              <Flame size={14} className="text-amber-700" />
                                              능동 인출 검증용 모범 답안 지침
                                            </span>
                                            <button
                                              onClick={() => handleToggleReveal(idx)}
                                              className="text-[10px] text-amber-800 hover:text-amber-950 border border-amber-300 px-2 py-0.5 rounded-md hover:bg-amber-100/50 font-bold transition-colors cursor-pointer"
                                            >
                                              다시 가리기
                                            </button>
                                          </div>

                                          {/* Concept Section */}
                                          <div className="space-y-1 text-left">
                                            <h5 className="text-xs font-black text-indigo-900 flex items-center gap-1">
                                              <Brain size={13} />
                                              [1] 핵심 개념 (Core Concept)
                                            </h5>
                                            <p className="text-xs text-stone-800 font-semibold pl-4 leading-relaxed whitespace-pre-line">
                                              {q.concept || '개념 내용이 제공되지 않았습니다.'}
                                            </p>
                                          </div>

                                          {/* Formula / Diagram Section */}
                                          <div className="space-y-1 text-left">
                                            <h5 className="text-xs font-black text-rose-900 flex items-center gap-1">
                                              <Award size={13} />
                                              [2] 필수 공식 및 개념도 구성요소 (Formula / Diagram)
                                            </h5>
                                            <p className="text-xs text-stone-800 font-semibold pl-4 leading-relaxed whitespace-pre-line">
                                              {q.formula || '공식 또는 아키텍처 필수 구성요소가 제공되지 않았습니다.'}
                                            </p>
                                          </div>

                                          {/* Structure Section */}
                                          <div className="space-y-1.5 text-left">
                                            <h5 className="text-xs font-black text-emerald-900 flex items-center gap-1">
                                              <LayoutTemplate size={13} />
                                              [3] 답안 작성 구조 방식 아웃라인 (3-Paragraph Structure Layout)
                                            </h5>
                                            <div className="text-xs text-stone-850 font-semibold pl-4 leading-normal whitespace-pre-line space-y-1">
                                              {q.structure ? q.structure : '답안지 1~3단락 가이드라인이 제공되지 않았습니다.'}
                                            </div>
                                          </div>

                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>

                              </div>
                            );
                          })}
                        </div>

                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slateCustom-900 border-t border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setSelectedTopic(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 복습 초기화 확인 모달 (Reset Review Confirmation Modal) */}
      {resetConfirmTarget && (
        <div className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center p-4 bg-slateCustom-950/80 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-md bg-slateCustom-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 text-center space-y-6 animate-scale-up">
            
            {/* Modal Icon and Title */}
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-amber-500/10 text-amber-400 rounded-full">
                <RefreshCw size={28} className="animate-spin-slow text-amber-500" />
              </div>
              <h3 className="text-lg font-extrabold text-white">복습을 다시 하겠습니까?</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                [<span className="text-brand-400">{resetConfirmTarget.topicTitle}</span>]의 <strong>{resetConfirmTarget.round}회차 복습</strong>을 다시 수행하시겠습니까?
              </p>
              <div className="bg-slateCustom-950/60 p-3.5 border border-slate-800/80 rounded-2xl text-[11px] text-amber-300 font-bold leading-normal w-full">
                ※ 완료 상태가 <span className="underline text-amber-400">대기</span>로 환원되며,<br/>
                <strong>오늘의 복습 리스트</strong>에 해당 항목이 다시 생성됩니다!
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => handleResetReview(resetConfirmTarget.scheduleId, resetConfirmTarget.topicTitle, resetConfirmTarget.round)}
                className="flex-1 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs tracking-wide transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shadow-md"
              >
                예
              </button>
              <button
                onClick={() => setResetConfirmTarget(null)}
                className="flex-1 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-xs tracking-wide transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              >
                아니오
              </button>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
