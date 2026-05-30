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
  Sigma, 
  Info,
  Check,
  Eye,
  EyeOff,
  Flame,
  LayoutTemplate,
  MessageSquare,
  Send,
  Save,
  Edit2,
  Search,
  X,
  Paperclip
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

// Dynamic KaTeX loader & Math text renderer
function LatexRenderer({ text, katexLoaded, className = "", onAddFormula = null }) {
  if (!text) return null;

  if (!window.katex) {
    return <div className={`${className} whitespace-pre-line leading-relaxed`}>{text}</div>;
  }

  // $$ ... $$ 블록 수학 기호를 기준으로 쪼갭니다.
  const parts = [];
  let lastIndex = 0;
  const blockRegex = /\$\$(.*?)\$\$/gs;
  let match;

  while ((match = blockRegex.exec(text)) !== null) {
    const beforeText = text.substring(lastIndex, match.index);
    if (beforeText) {
      parts.push({ type: 'text', content: beforeText });
    }
    parts.push({ type: 'math-block', content: match[1].trim() });
    lastIndex = blockRegex.lastIndex;
  }

  const afterText = text.substring(lastIndex);
  if (afterText) {
    parts.push({ type: 'text', content: afterText });
  }

  // 제일 밑(마지막) $$ ... $$ 블록 공식의 인덱스를 찾습니다.
  let lastMathBlockIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === 'math-block') {
      lastMathBlockIdx = i;
      break;
    }
  }

  // 각 파트별 렌더링
  return (
    <div className={`${className} space-y-3`}>
      {parts.map((part, idx) => {
        if (part.type === 'math-block') {
          let mathHtml = part.content;
          try {
            mathHtml = window.katex.renderToString(part.content, { displayMode: true, throwOnError: false });
          } catch (e) {
            console.warn(e);
            mathHtml = `$$${part.content}$$`;
          }

          return (
            <div 
              key={idx} 
              className="my-4 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slateCustom-950/60 rounded-2xl border border-slate-800/80 hover:border-rose-500/30 transition-all duration-300 group shadow-lg"
            >
              {/* KaTeX 수식 */}
              <div 
                className="flex-grow overflow-x-auto flex justify-center py-2 min-w-0" 
                dangerouslySetInnerHTML={{ __html: mathHtml }} 
              />
              {/* 우측 추가 버튼 (제일 밑 공식만 퀴즈 추가 버튼 표시) */}
              {onAddFormula && idx === lastMathBlockIdx && (
                <button
                  onClick={() => onAddFormula(part.content)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 text-rose-300 hover:text-white text-xs font-black tracking-tight transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm cursor-pointer whitespace-nowrap opacity-80 group-hover:opacity-100 animate-fade-in"
                  title="이 특정 수식만 필수공식 퀴즈에 추가"
                >
                  <Sparkles size={12} className="text-rose-400" />
                  <span>이 공식을 퀴즈에 추가</span>
                </button>
              )}
            </div>
          );
        } else {
          // 일반 텍스트 내 inline math $ ... $ 처리
          let htmlContent = part.content;
          try {
            htmlContent = htmlContent.replace(/\$([^\$\n]+?)\$/g, (m, math) => {
              try {
                return window.katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
              } catch (e) {
                return m;
              }
            });
          } catch (e) {
            console.warn(e);
          }

          const isInline = className.includes('inline');
          if (isInline) {
            return (
              <span 
                key={idx}
                className="leading-relaxed whitespace-pre-line"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            );
          }

          return (
            <div 
              key={idx}
              className="leading-relaxed whitespace-pre-line text-sm md:text-base"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          );
        }
      })}
    </div>
  );
}

export default function App() {
  const API_BASE = import.meta.env.VITE_API_URL || '';

  // Dynamic KaTeX Loader State
  const [katexLoaded, setKatexLoaded] = useState(false);
  useEffect(() => {
    if (!document.getElementById('katex-css')) {
      const link = document.createElement('link');
      link.id = 'katex-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
      document.head.appendChild(link);
    }

    if (window.katex) {
      setKatexLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    script.onload = () => {
      setKatexLoaded(true);
    };
    document.head.appendChild(script);
  }, []);
  
  // Views: 'dashboard' (today's tasks) or 'all_topics' (all materials tracker)
  const [viewMode, setViewMode] = useState('dashboard');
  const [editingFormulaIdx, setEditingFormulaIdx] = useState(null);
  const [editingFormulaText, setEditingFormulaText] = useState("");
  const [refreshingFormulaIdx, setRefreshingFormulaIdx] = useState(null);
  
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
  const [aiError, setAiError] = useState('');
  const [openSections, setOpenSections] = useState({}); // { 'qIdx-sIdx': bool } for section accordion
  
  // Exam mode state
  const [examQuestions, setExamQuestions] = useState([]);
  const [loadingExam, setLoadingExam] = useState(false);
  const [showExam, setShowExam] = useState(false);
  const [examTopic, setExamTopic] = useState(null);
  const [examRevealed, setExamRevealed] = useState({});
  const [examAnswers, setExamAnswers] = useState({});
  const [detailedAnswers, setDetailedAnswers] = useState({});
  const [chatHistory, setChatHistory] = useState([]);

  // Formula mode states
  const [showFormulaExam, setShowFormulaExam] = useState(() => localStorage.getItem('anti_show_formula_exam') === 'true');
  const [showTheoryExam, setShowTheoryExam] = useState(() => localStorage.getItem('anti_show_theory_exam') === 'true');
  const theoryBodyRef = useRef(null);
  const savedTheoryScroll = useRef(0);
  const [formulaMobileTab, setFormulaMobileTab] = useState('list');
  const [theoryMobileTab, setTheoryMobileTab] = useState('list');
  const formulaSplitContainerRef = useRef(null);
  const theorySplitContainerRef = useRef(null);
  const [reviewMobileTab, setReviewMobileTab] = useState('list');
  const [examMobileTab, setExamMobileTab] = useState('list');
  const reviewSplitContainerRef = useRef(null);
  const examSplitContainerRef = useRef(null);
  const [formulaQuestions, setFormulaQuestions] = useState([]);
  const [loadingFormula, setLoadingFormula] = useState(false);
  const [formulaRevealed, setFormulaRevealed] = useState({});
  const [formulaSearchQuery, setFormulaSearchQuery] = useState('');
  const formulaBodyRef = useRef(null);
  const savedFormulaScroll = useRef(0);
  
  // Theory questions states (independent of formulas)
  const [theoryQuestions, setTheoryQuestions] = useState([]);
  const [loadingTheory, setLoadingTheory] = useState(false);
  const [theoryRevealed, setTheoryRevealed] = useState({});
  const [theorySearchQuery, setTheorySearchQuery] = useState('');
  const [refreshingTheoryIdx, setRefreshingTheoryIdx] = useState(null);
  const [uploadingTheoryPdf, setUploadingTheoryPdf] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBodyRef = useRef(null);
  const [attachedImage, setAttachedImage] = useState(null); // { name, mimeType, data }
  const [resetConfirmTarget, setResetConfirmTarget] = useState(null); // { scheduleId, topicTitle, round }
  const [showFullReport, setShowFullReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportViewType, setReportViewType] = useState('pdf'); // 'pdf' or 'image'
  const [pdfjsLoaded, setPdfjsLoaded] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const firstMatchRef = useRef(null);
  const lastQuizTopicId = useRef(null); // 마지막으로 로드한 퀴즈 토픽 ID (닫기 후 재열 감지용)
  const quizBodyRef = useRef(null);     // 퀴즈 패널 스크롤 컨테이너
  const savedQuizScroll = useRef(0);    // 퀴즈 패널 저장된 스크롤 위치
  const examBodyRef = useRef(null);     // 종합평가 패널 스크롤 컨테이너
  const savedExamScroll = useRef(0);    // 종합평가 패널 저장된 스크롤 위치

  // Latest values refs to prevent stale closure bugs in modal headers
  const latestTheoryQuestionsRef = useRef(theoryQuestions);
  useEffect(() => {
    latestTheoryQuestionsRef.current = theoryQuestions;
  }, [theoryQuestions]);

  const latestFormulaQuestionsRef = useRef(formulaQuestions);
  useEffect(() => {
    latestFormulaQuestionsRef.current = formulaQuestions;
  }, [formulaQuestions]);

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
      if (res.ok && data && Array.isArray(data.reviews)) {
        setTodayReviews(data.reviews);
      } else {
        setTodayReviews([]);
        console.error('Failed to load dashboard or invalid data format:', data);
      }
    } catch (err) {
      setTodayReviews([]);
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
      if (res.ok && Array.isArray(data)) {
        setAllTopics(data);
      } else {
        setAllTopics([]);
        console.error('Failed to load topics or invalid format:', data);
      }
    } catch (err) {
      setAllTopics([]);
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

  // ── Restore state from localStorage on mount (껐다 켜도 이어서 보기)
  useEffect(() => {
    // 1) localStorage → 탭/뷰 모드 등 비-종합평가 상태 복원
    try {
      const saved = localStorage.getItem('anti_app_state');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.viewMode) setViewMode(s.viewMode);
        if (s.selectedTopic) setSelectedTopic(s.selectedTopic);
        if (s.aiQuestions?.length) setAiQuestions(s.aiQuestions);
        if (s.revealedQuestions) setRevealedQuestions(s.revealedQuestions);
        if (s.selectedAnswers) setSelectedAnswers(s.selectedAnswers);
        if (s.openSections) setOpenSections(s.openSections);
        if (s.isFallback !== undefined) setIsFallback(s.isFallback);
        // 종합평가 상태는 서버에서 덮어씀 (아래)
        if (s.examTopic) setExamTopic(s.examTopic);
        if (s.examQuestions?.length) setExamQuestions(s.examQuestions);
        if (s.examRevealed) setExamRevealed(s.examRevealed);
        if (s.examAnswers) setExamAnswers(s.examAnswers);
      }
    } catch (e) {
      console.warn('localStorage 복원 실패:', e);
    }

    // 2) 서버 → 종합평가 세션 복원 (기기 간 공유 우선)
    fetch(`${API_BASE}/api/session/exam`)
      .then(r => r.json())
      .then(({ data }) => {
        if (data?.examQuestions?.length) {
          setExamQuestions(data.examQuestions);
          if (data.examRevealed) setExamRevealed(data.examRevealed);
          if (data.examAnswers) setExamAnswers(data.examAnswers);
          if (data.examTopic) setExamTopic(data.examTopic);
          if (data.savedExamScroll) savedExamScroll.current = data.savedExamScroll;
        }
      })
      .catch(e => console.warn('서버 세션 복원 실패:', e));
  }, []); // mount 시 1회만

  // ── Save state to localStorage whenever key state changes
  useEffect(() => {
    try {
      localStorage.setItem('anti_app_state', JSON.stringify({
        viewMode,
        selectedTopic,
        aiQuestions,
        revealedQuestions,
        selectedAnswers,
        openSections,
        isFallback,
        showExam,
        examTopic,
        examQuestions,
        examRevealed,
        examAnswers,
      }));
    } catch (e) {
      console.warn('localStorage 저장 실패:', e);
    }
  }, [viewMode, selectedTopic, aiQuestions, revealedQuestions, selectedAnswers, openSections, isFallback, showExam, examTopic, examQuestions, examRevealed, examAnswers]);


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

  // AI 복습 완료 버튼 클릭 시 처리
  const handleQuizCompleteClick = async () => {
    if (!selectedTopic) return;
    
    let sId = selectedTopic.schedule_id;
    let sRound = selectedTopic.review_round;

    // 만약 schedule_id가 없을 경우, 오늘 대기 중인 복습 일정 중에 매칭되는 것이 있는지 탐색
    if (!sId && todayReviews.length > 0) {
      const matchingReview = todayReviews.find(
        (r) => r.topic_id === selectedTopic.id && r.status !== 'completed'
      );
      if (matchingReview) {
        sId = matchingReview.schedule_id;
        sRound = matchingReview.review_round;
      }
    }

    if (sId) {
      await handleCompleteReview(sId, selectedTopic.title, sRound);
      // 모달 닫기
      setSelectedTopic(null);
      setAiQuestions([]);
      setRevealedQuestions({});
      setSelectedAnswers({});
      setOpenSections({});
      lastQuizTopicId.current = null;
    } else {
      showNotification('오늘 이 토픽의 예정된 복습 일정이 없습니다. 자유 복습이 완료되었습니다!', 'info');
      // 모달 닫기
      setSelectedTopic(null);
      setAiQuestions([]);
      setRevealedQuestions({});
      setSelectedAnswers({});
      setOpenSections({});
      lastQuizTopicId.current = null;
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

  // Trigger AI questions Modal (mode: 'ai' = Gemini+source, 'local' = source only)
  const handleOpenAIQuestions = async (topicId, title, keywords, pdfName, mode = 'ai', scheduleId = null, reviewRound = null) => {
    setReviewMobileTab('list');
    requestAnimationFrame(() => {
      if (reviewSplitContainerRef.current) reviewSplitContainerRef.current.scrollLeft = 0;
    });
    // 같은 토픽의 문제가 이미 있으면 (닫기 후 재열) → 바로 열기
    if (lastQuizTopicId.current === topicId && aiQuestions.length > 0) {
      setSelectedTopic({ id: topicId, title, keywords, pdf_name: pdfName, schedule_id: scheduleId, review_round: reviewRound });
      // 이전 스크롤 위치 복원
      requestAnimationFrame(() => {
        if (quizBodyRef.current) quizBodyRef.current.scrollTop = savedQuizScroll.current;
      });
      return;
    }
    setSelectedTopic({ id: topicId, title, keywords, pdf_name: pdfName, schedule_id: scheduleId, review_round: reviewRound });
    setLoadingAI(true);
    setAiQuestions([]);
    setRevealedQuestions({}); // Reset revealed answers
    setSelectedAnswers({}); // Reset MC selected answers
    setIsFallback(false);
    setAiError('');
    setShowFullReport(false);
    setReportText('');

    try {
      const url = mode === 'local'
        ? `${API_BASE}/api/topics/${topicId}/ai-questions?local=true`
        : `${API_BASE}/api/topics/${topicId}/ai-questions`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        setAiQuestions(data.questions || []);
        setIsFallback(!!data.isFallback);
        setAiError(data.error || '');
        lastQuizTopicId.current = topicId; // 로드 완료 후 기록
      } else {
        showNotification(data.error || 'AI 기출문제를 생성하지 못했습니다.', 'error');
      }
    } catch (err) {
      console.error('AI call error:', err);
      showNotification('서버 통신 오류로 AI 예상문제를 로드하지 못했습니다.', 'error');
      setAiError(err.message || '서버 통신 오류');
    } finally {
      setLoadingAI(false);
    }
  };

  // Open review quiz AND mark schedule as complete simultaneously
  // (removed - now handled by separate buttons)

  // ── Request Detailed Answer for Exam Questions ────────────────────────
  const handleRequestDetailedAnswer = async (idx, question, answer) => {
    setDetailedAnswers(prev => ({ ...prev, [idx]: { loading: true, text: '', error: '' } }));
    try {
      const res = await fetch(`${API_BASE}/api/exam/detailed-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '답안 전문을 가져오는 중 오류가 발생했습니다.');
      setDetailedAnswers(prev => ({ ...prev, [idx]: { loading: false, text: data.text, error: '' } }));
    } catch (err) {
      setDetailedAnswers(prev => ({ ...prev, [idx]: { loading: false, text: '', error: err.message } }));
    }
  };

  // ── Scroll Quiz Question Up/Down for Desktop Split-View ────────────
  const handleScrollQuestion = (direction) => {
    if (!quizBodyRef.current) return;
    const cards = quizBodyRef.current.querySelectorAll('.quiz-card-item');
    if (cards.length === 0) return;

    const containerTop = quizBodyRef.current.getBoundingClientRect().top;
    
    // 현재 화면(컨테이너 기준)의 상단에 가장 가까운 카드를 찾습니다.
    let currentIndex = 0;
    let minDiff = Infinity;
    
    cards.forEach((card, idx) => {
      const rect = card.getBoundingClientRect();
      const diff = Math.abs(rect.top - containerTop - 10);
      if (diff < minDiff) {
        minDiff = diff;
        currentIndex = idx;
      }
    });

    let targetIndex = currentIndex;
    if (direction === 'down') {
      targetIndex = Math.min(currentIndex + 1, cards.length - 1);
      // 만약 현재 카드의 top이 이미 컨테이너보다 아래에 있다면 그 카드가 타겟이 될 수 있음
      const curRect = cards[currentIndex].getBoundingClientRect();
      if (curRect.top - containerTop > 20) {
        targetIndex = currentIndex;
      }
    } else if (direction === 'up') {
      targetIndex = Math.max(currentIndex - 1, 0);
      // 만약 현재 카드의 top이 컨테이너보다 위에 있다면 현재 카드가 타겟이 될 수 있음
      const curRect = cards[currentIndex].getBoundingClientRect();
      if (curRect.top - containerTop < -20) {
        targetIndex = currentIndex;
      }
    }

    cards[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Gemini Sidebar Image Attachment Handlers ───────────────────────
  const handleImageAttachment = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showNotification('이미지 파일만 첨부할 수 있습니다.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result.split(',')[1];
      setAttachedImage({
        name: file.name,
        mimeType: file.type,
        data: base64Data
      });
    };
    reader.readAsDataURL(file);
  };

  const handleClearAttachedImage = () => {
    setAttachedImage(null);
  };

  const handlePasteImage = (e) => {
    // 1. clipboardData.files 우선 검사 (모던 브라우저 및 OS 캡처 비트맵 파일 직접 맵핑 대응)
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            setAttachedImage({
              name: file.name || `clipboard-image-${Date.now().toString().slice(-4)}.png`,
              mimeType: file.type,
              data: base64Data
            });
            showNotification('클립보드 이미지가 첨부되었습니다!');
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          return;
        }
      }
    }

    // 2. clipboardData.items 보조 검사 (브라우저 호환성 백업 및 특수 클립보드 항목 대응)
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/') || item.kind === 'file') {
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            setAttachedImage({
              name: `clipboard-image-${Date.now().toString().slice(-4)}.png`,
              mimeType: file.type || 'image/png',
              data: base64Data
            });
            showNotification('클립보드 이미지가 첨부되었습니다!');
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          return;
        }
      }
    }
  };

  // ── Gemini Sidebar Chat Handler ───────────────────────────────
  const handleSendChat = async () => {
    const userMessage = chatInput.trim();
    if ((!userMessage && !attachedImage) || isChatLoading) return;
    
    const currentAttachedImage = attachedImage;
    setChatInput('');
    setAttachedImage(null);
    
    setChatHistory(prev => [...prev, { role: 'user', text: userMessage, image: currentAttachedImage }]);
    setIsChatLoading(true);

    requestAnimationFrame(() => {
      if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    });

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history: chatHistory.map(h => ({ role: h.role, text: h.text })), 
          message: userMessage,
          image: currentAttachedImage ? { mimeType: currentAttachedImage.mimeType, data: currentAttachedImage.data } : null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '답변 생성 실패');
      setChatHistory(prev => [...prev, { role: 'model', text: data.text }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'model', text: `오류가 발생했습니다: ${err.message}` }]);
    } finally {
      setIsChatLoading(false);
      requestAnimationFrame(() => {
        if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      });
    }
  };

  // Open Comprehensive Exam (70 questions from ALL topics via Gemini)
  const handleOpenExam = async () => {
    setExamMobileTab('list');
    requestAnimationFrame(() => {
      if (examSplitContainerRef.current) examSplitContainerRef.current.scrollLeft = 0;
    });
    // 1) 이미 state에 문제가 있으면 바로 열기 (같은 기기, 이미 로드됨)
    if (examQuestions.length > 0) {
      setShowExam(true);
      requestAnimationFrame(() => {
        if (examBodyRef.current) examBodyRef.current.scrollTop = savedExamScroll.current;
      });
      return;
    }

    // 2) 서버에서 저장된 세션 확인 (기기 간 공유 - 타이밍 이슈 없이 직접 조회)
    setLoadingExam(true);
    setShowExam(true);
    try {
      const sessionRes = await fetch(`${API_BASE}/api/session/exam`);
      const sessionData = await sessionRes.json();
      if (sessionData?.data?.examQuestions?.length > 0) {
        // 서버에 저장된 문제가 있음 → 그대로 복원
        const d = sessionData.data;
        setExamQuestions(d.examQuestions);
        if (d.examRevealed) setExamRevealed(d.examRevealed);
        if (d.examAnswers) setExamAnswers(d.examAnswers);
        if (d.examTopic) setExamTopic(d.examTopic);
        else setExamTopic({ title: '전체 토픽 통합 종합평가' });
        if (d.savedExamScroll) savedExamScroll.current = d.savedExamScroll;
        
        setLoadingExam(false);
        requestAnimationFrame(() => {
          if (examBodyRef.current) examBodyRef.current.scrollTop = savedExamScroll.current;
        });
        return;
      }
    } catch (e) {
      console.warn('서버 세션 확인 실패, 새로 생성합니다:', e);
    }

    // 3) 저장된 세션 없음 → 새로 생성
    setExamTopic({ title: '전체 토픽 통합 종합평가' });
    setExamQuestions([]);
    setExamRevealed({});
    setExamAnswers({});
    try {
      const res = await fetch(`${API_BASE}/api/exam/all`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const qs = data.questions || [];
        // Fisher-Yates shuffle – 주관식/객관식 랜덤 혼합
        for (let i = qs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [qs[i], qs[j]] = [qs[j], qs[i]];
        }
        setExamQuestions(qs);
      } else {
        showNotification(data.error || '종합평가 생성에 실패했습니다.', 'error');
        setShowExam(false);
      }
    } catch (err) {
      showNotification('서버 통신 오류: ' + err.message, 'error');
      setShowExam(false);
    } finally {
      setLoadingExam(false);
    }
  };

  const filterStructureLinesClient = (mathContent, structure) => {
    if (!structure) return '';
    
    const layoutCommands = [
      '\\frac', '\\sqrt', '\\left', '\\right', '\\times', '\\cdot',
      '\\partial', '\\sin', '\\cos', '\\tan', '\\log', '\\ln',
      '\\text', '\\operatorname', '\\mathrm', '\\mathbf', '\\over', '\\choose',
      '\\quad', '\\qquad', '\\;', '\\:', '\\,', '\\!', '\\begin', '\\end', '\\array'
    ];
    let cleanedFormula = mathContent;
    for (const cmd of layoutCommands) {
      cleanedFormula = cleanedFormula.split(cmd).join(' ');
    }

    const tokenRegex = /[a-zA-Z0-9_]+/g;
    const formulaTokens = cleanedFormula.match(tokenRegex) || [];
    
    const normalize = (v) => {
      if (!v) return '';
      return v
        .replace(/[\$\s\{\}\[\]\(\)]/g, '')
        .replace(/\\/g, '')
        .replace(/_/g, '');
    };

    const formulaTokenSet = new Set(formulaTokens.map(t => normalize(t)).filter(Boolean));

    const lines = structure.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      
      if (/^\s*[\-\*\d\.]/.test(trimmed)) {
        const colonIdx = trimmed.indexOf(':');
        const dashIdx = trimmed.indexOf('-', 1);
        const sepIdx = colonIdx !== -1 ? colonIdx : dashIdx;
        
        if (sepIdx !== -1) {
          const symbolPortion = trimmed.substring(0, sepIdx);
          const symbolTokens = symbolPortion.match(tokenRegex) || [];
          const normalizedSymbols = symbolTokens.map(s => normalize(s)).filter(Boolean);
          
          if (normalizedSymbols.length === 0) return true;
          
          const hasMatch = normalizedSymbols.some(s => formulaTokenSet.has(s));
          return hasMatch;
        }
      }
      return true;
    });

    return filteredLines.join('\n').trim();
  };

  // 필수공식 타이틀/지문 정화 및 콤팩트 규격화 함수
  const normalizeAndCompactifyFormulas = (formulas) => {
    if (!Array.isArray(formulas)) return [];
    return formulas.map(f => {
      let title = f.title || "";
      
      // 1. JSON 깨짐 버그 데이터 정화 ({ "title": "..." } 형태 등)
      if (title.includes('{') || title.includes('"title"')) {
        const titleMatch = title.match(/"title"\s*:\s*"([^"]+)"/);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1];
        } else {
          title = title.replace(/[{}\[\]"']/g, '').replace(/title\s*:\s*/g, '').trim();
        }
      }
      
      title = title.replace(/^["'`\s\t\n]+|["'`\s\t\n]+$/g, '').trim();

      // 2. 디폴트 공식 및 기존 공식 타이틀/질문 강제 콤팩트 변환
      let newTitle = title;
      
      const compactTitles = {
        "Barton의 암반 Q분류": "바톤 암반 Q분류(Barton Q-system, $Q$)",
        "Terzaghi 얕은기초 극한 지지력": "테르자기 극한지지력(Terzaghi Ultimate Bearing Capacity, $q_{ult}$)",
        "연약지반 Sand Mat 최소 소요 두께": "연약지반 샌드매트 최소두께(Sand Mat Minimum Thickness, $H$)",
        "평사투영 극점 변환 반경 (등면적 투영)": "슈미트네트 극점반경(Schmidt Net Pole Radius, $r$)",
        "락볼트 인발시험 설계 지반 고착력": "락볼트 고착력 계산식(Rockbolt Bond Strength, $P$)",
        "Rankine 주동토압": "랭킹 주동토압계수(Rankine Active Earth Pressure Coefficient, $K_a$)",
        "Terzaghi 1차원 압밀 지배 미분방정식": "테르자기 1차 압밀방정식(Terzaghi 1D Consolidation, $C_v$)",
        "보상도 (보상기초 하중 상쇄 비율)": "보상기초 보상도(Compensated Foundation Safety Factor, $C$)",
        "터널 배면 싱글쉘 정수압 분포 공식": "싱글쉘 터널 설계수압(Single Shell Tunnel Design Water Pressure, $p_w$)",
        "가설 흙막이 벽체 지반스프링상수": "가설흙막이 수평지반반력계수(Temporary Retaining Wall Horizontal Subgrade Reaction Coefficient, $k_h$)"
      };

      if (compactTitles[newTitle]) {
        newTitle = compactTitles[newTitle];
      }

      // 사족 전면 완전 삭제: 질문을 그냥 콤팩트한 공식 타이틀명 자체로 정돈!
      const newQuestion = newTitle;

      // 3. [보상기초 보상도 공식] 기호 정의 자가 치유 (Self-Healing)
      // 만약 타이틀이 보상도 공식이면 디폴트 기본 스펙으로 100% 무조건 강제 정화 및 자가 치유!
      let newFormula = f.formula;
      let newConcept = f.concept;
      if (newTitle.includes("보상도") || newTitle.includes("보상기초")) {
        newFormula = "$$C = \\frac{\\gamma D_f}{q}$$\n\n- $C$: 보상도 (Compensational ratio, $C = 1.0$이면 완전 보상)\n- $\\gamma$: 굴착하여 배출한 흙의 단위중량\n- $D_f$: 기초의 굴착 깊이\n- $q$: 상부 구조물 총 자중 및 하중 합산값";
        newConcept = "구조물 자중을 굴착한 흙의 총 중량으로 완벽히 치환 상쇄하여 순 침하 하중을 Zero로 수렴시키는 평가 공식";
      }

      // 4. 모든 공식 대상 기호정의 자동 정화 (수식에 있는 기호만 표시하도록 강제 필터링!)
      if (newFormula && newFormula.includes('$$')) {
        const mathMatch = newFormula.match(/\$\$(.*?)\$\$/s);
        if (mathMatch) {
          const mathContent = mathMatch[1].trim();
          const structureContent = newFormula.replace(/\$\$(.*?)\$\$/s, '').trim();
          if (structureContent) {
            const filteredStructure = filterStructureLinesClient(mathContent, structureContent);
            newFormula = `$$${mathContent}$$\n\n${filteredStructure}`;
          }
        }
      }

      return {
        ...f,
        title: newTitle,
        question: newQuestion,
        formula: newFormula,
        concept: newConcept
      };
    });
  };

  const handleSaveFormulaQuestions = async (qs = formulaQuestions, showToast = true) => {
    try {
      localStorage.setItem('anti_formula_questions', JSON.stringify(qs));
      
      // Sync with database for cross-device support (AWAITED to avoid timing issues)
      const res = await fetch(`${API_BASE}/api/session/formula`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formulaQuestions: qs })
      });

      if (!res.ok) {
        throw new Error('Database sync returned non-OK status');
      }

      if (showToast) {
        showNotification('필수공식 리스트가 성공적으로 저장되었습니다!', 'success');
      }
    } catch (err) {
      console.warn('필수공식 저장 실패:', err);
      if (showToast) {
        showNotification('서버 저장 실패: 로컬 스토리지에만 저장됩니다.', 'warning');
      }
    }
  };

  const loadFormulaQuestions = async () => {
    setLoadingFormula(true);
    let loadedData = null;

    // 1) Try Database Sync
    try {
      const res = await fetch(`${API_BASE}/api/session/formula`);
      if (res.ok) {
        const body = await res.json();
        if (body && body.data && Array.isArray(body.data.formulaQuestions) && body.data.formulaQuestions.length > 0) {
          loadedData = body.data.formulaQuestions;
          console.log('[Sync] Loaded formula questions from database.');
        }
      }
    } catch (err) {
      console.warn('[Sync] Database formula loading failed:', err);
    }

    // 2) Try LocalStorage Fallback
    if (!loadedData) {
      try {
        const savedStr = localStorage.getItem('anti_formula_questions');
        if (savedStr) {
          const parsed = JSON.parse(savedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            loadedData = parsed;
            console.log('[Fallback] Loaded formula questions from LocalStorage.');
          }
        }
      } catch (err) {
        console.warn('localStorage 필수공식 복원 실패:', err);
      }
    }

    // 3) Fallback to Defaults if still empty
    if (!loadedData) {
      const defaultFormulas = [
        {
          title: "바톤 암반 Q분류(Barton Q-system, $Q$)",
          question: "바톤 암반 Q분류(Barton Q-system, $Q$)",
          concept: "암반의 공학적 특성을 6가지 독립된 변수를 통해 정량화하여 터널 1차 지보 설계를 설계하는 지수 공식",
          formula: "$$Q = \\frac{RQD}{J_n} \\times \\frac{J_r}{J_a} \\times \\frac{J_w}{SRF}$$\n\n- $Q$: 암반 등급 지수\n- $RQD$: 암질지수 (Rock Quality Designation)\n- $J_n$: 절리군 수 (Joint set number)\n- $J_r$: 절리면 거칠기 계수 (Joint roughness number)\n- $J_a$: 절리면 변질 계수 (Joint alteration number)\n- $J_w$: 절리수 보정 계수 (Joint water reduction factor)\n- $SRF$: 응력 감소 계수 (Stress Reduction Factor)",
          structure: "1. RQD/Jn: 블록의 크기\n2. Jr/Ja: 블록 전단강도\n3. Jw/SRF: 지반 유효응력 분포 상태"
        },
        {
          title: "테르자기 극한지지력(Terzaghi Ultimate Bearing Capacity, $q_{ult}$)",
          question: "테르자기 극한지지력(Terzaghi Ultimate Bearing Capacity, $q_{ult}$)",
          concept: "흙의 전단파괴 형상을 대수나선 등으로 모델화하여 기초 저면 아래 지반이 전단 파괴 없이 지탱할 수 있는 최대 하중 강도 식",
          formula: "$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$\n\n- $q_{ult}$: 극한 지지력\n- $c$: 흙의 점착력\n- $q$: 기초 저면의 유효상재하중 ($\\gamma D_f$)\n- $\\gamma$: 기초 저면 아래 흙의 단위중량\n- $B$: 기초의 폭 (단변 길이)\n- $N_c, N_q, N_{\\gamma}$: 지반의 내부마찰각($\\phi$)에 의해 정의되는 지지력 계수",
          structure: "1. 점착력 성분 ($c N_c$)\n2. 마찰각 및 상재하중 성분 ($q N_q$)\n3. 기초 자중 및 마찰 성분 ($0.5 \\gamma B N_{\\gamma}$)"
        },
        {
          title: "연약지반 샌드매트 최소두께(Sand Mat Minimum Thickness, $H$)",
          question: "연약지반 샌드매트 최소두께(Sand Mat Minimum Thickness, $H$)",
          concept: "표층 개량 및 연약지반 상부에 무거운 주행성 장비(Trafficability)를 얹기 위한 하중 지지 소요 두께식",
          formula: "$$H = \\frac{q - q_a}{2 \\gamma \\tan\\theta}$$\n\n- $H$: 샌드매트의 소요 최소 두께\n- $q$: 포설 장비의 접지압\n- $q_a$: 지반의 허용 지지력\n- $\\gamma$: 모래의 단위중량\n- $\\theta$: 하중 분산각 (일반적으로 $45^\\circ$ 적용)",
          structure: "1. 상부 장비 접지압 분산 원리\n2. 모래의 전단 부착각과 저면 마찰 저항"
        },
        {
          title: "슈미트네트 극점반경(Schmidt Net Pole Radius, $r$)",
          question: "슈미트네트 극점반경(Schmidt Net Pole Radius, $r$)",
          concept: "통계적 밀도 보정을 위해 면적 왜곡을 줄인 슈미트 네트(Schmidt Net) 평면 변환 투영식",
          formula: "$$r = \\sqrt{2} R \\sin\\left(45^\\circ - \\frac{\\alpha}{2}\\right)$$\n\n- $r$: 투영원 중심으로부터 극점(Pole)까지의 평면 거리\n- $R$: 투영구(Sphere)의 반경\n- $\\alpha$: 불연속면의 경사각 (Dip angle)",
          structure: "1. 등면적 조건 구면 투영 원리\n2. 극점(Pole) 매핑 기하학"
        },
        {
          title: "락볼트 고착력 계산식(Rockbolt Bond Strength, $P$)",
          question: "락볼트 고착력 계산식(Rockbolt Bond Strength, $P$)",
          concept: "인발 하중 재하 시 천공홀 배면의 마찰 부착 면적을 기반으로 볼트 탈락에 지탱하는 한계 고착력 식",
          formula: "$$P = \\pi \\cdot d \\cdot L \\cdot \\tau_{allow}$$\n\n- $P$: 락볼트의 최대 허용 인발 저항력 (인발 하중)\n- $d$: 락볼트 천공 구멍의 직경\n- $L$: 그라우팅 정착 길이 (고착 영역)\n- $\\tau_{allow}$: 지반과 그라우팅재(또는 그라우트와 락볼트) 간의 허용 부착 전단강도",
          structure: "1. 부착 저항 주면적 ($\\pi d L$)\n2. 정착 한계 부착 전단저항 특성"
        },
        {
          title: "랭킹 주동토압계수(Rankine Active Earth Pressure Coefficient, $K_a$)",
          question: "랭킹 주동토압계수(Rankine Active Earth Pressure Coefficient, $K_a$)",
          concept: "지반이 인장 변형을 일으켜 한계 주동 소성 평형 상태에 도달할 때 가설 옹벽 배면에 수평으로 밀어내는 토압식",
          formula: "$$K_a = \\tan^2\\left(45^\\circ - \\frac{\\phi}{2}\\right) = \\frac{1 - \\sin\\phi}{1 + \\sin\\phi}$$\n$$p_a = K_a \\gamma z - 2 c \\sqrt{K_a}$$\n\n- $K_a$: 주동토압 계수\n- $\\phi$: 흙의 내부마찰각\n- $p_a$: 깊이 $z$에서의 주동토압 강도\n- $\\gamma$: 흙의 단위중량\n- $z$: 검토 단면 깊이\n- $c$: 흙의 점착력",
          structure: "1. 흙의 유효 상재압에 의한 주동토압력\n2. 흙의 자립 점착력에 의한 인장 저항력 감쇄 ($2c\\sqrt{K_a}$)"
        },
        {
          title: "테르자기 1차 압밀방정식(Terzaghi 1D Consolidation, $C_v$)",
          question: "테르자기 1차 압밀방정식(Terzaghi 1D Consolidation, $C_v$)",
          concept: "외부 점진/순간 하중 재하 시 시간이 경과함에 따라 과잉간극수압이 상하 배수층을 통해 소산되어 나가는 속도를 규정한 1차원 미분방정식",
          formula: "$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$\n\n- $u$: 시간 $t$, 깊이 $z$에서의 과잉간극수압\n- $t$: 하중 작용 후 경과 시간\n- $z$: 하중 분담 전파 수직 깊이\n- $C_v$: 압밀계수 ($C_v = \\frac{k}{m_v \\gamma_w}$)\n  * $k$: 투수계수\n  * $m_v$: 체적압축계수\n  * $\\gamma_w$: 물의 단위중량",
          structure: "1. 시간에 따른 수압 변화 항 (\\partial u / \\partial t)\n2. 깊이에 따른 2차 수두 배수 확산 항 (\\partial^2 u / \\partial z^2)"
        },
        {
          title: "보상기초 보상도(Compensated Foundation Safety Factor, $C$)",
          question: "보상기초 보상도(Compensated Foundation Safety Factor, $C$)",
          concept: "구조물 자중을 굴착한 흙의 총 중량으로 완벽히 치환 상쇄하여 순 침하 하중을 Zero로 수렴시키는 평가 공식",
          formula: "$$C = \\frac{\\gamma D_f}{q}$$\n\n- $C$: 보상도 (Compensational ratio, $C = 1.0$이면 완전 보상)\n- $\\gamma$: 굴착하여 배출한 흙의 단위중량\n- $D_f$: 기초의 굴착 깊이\n- $q$: 상부 구조물 총 자중 및 하중 합산값",
          structure: "1. 흙의 굴착 자중 상쇄량 (\\gamma D_f)\n2. 실제 침하를 유발하는 순응력 ($q_{net} = q - \\gamma D_f$)"
        },
        {
          title: "싱글쉘 터널 설계수압(Single Shell Tunnel Design Water Pressure, $p_w$)",
          question: "싱글쉘 터널 설계수압(Single Shell Tunnel Design Water Pressure, $p_w$)",
          concept: "방수가 완벽히 차단된 비배수 터널 아치 배면에 상부 수위 높이에 비례하여 수직으로 가해지는 정수압식",
          formula: "$$p_w = \\gamma_w \\times H$$\n\n- $p_w$: 라이닝 배면 작용 설계 수압\n- $\\gamma_w$: 지하수(물)의 단위중량 ($9.81\\,\\text{kN/m}^3$)\n- $H$: 설계 지하수위 면으로부터 터널 아치 정상까지의 수직 거리 (수두 높이)",
          structure: "1. 비배수 터널의 전수압 설계 한계\n2. 심도와 수두의 완전 비례 관계"
        },
        {
          title: "가설흙막이 수평지반반력계수(Temporary Retaining Wall Horizontal Subgrade Reaction Coefficient, $k_h$)",
          question: "가설흙막이 수평지반반력계수(Temporary Retaining Wall Horizontal Subgrade Reaction Coefficient, $k_h$)",
          concept: "벽체 배면의 지반 탄소성 반응을 등가의 선형 탄성 연속 압축 스프링 강성값으로 치환하는 반력 산정식",
          formula: "$$k_h = k_{h0} \\left(\\frac{B_H}{0.3}\\right)^{-3/4}$$\n\n- $k_h$: 설계 수평 지반반력계수 (탄성 스프링 상수)\n- $k_{h0}$: 직경 $30\\,\\text{cm}$ 강체 원판에 의한 표준 수평 지반반력계수 ($k_{h0} = \\frac{1}{0.3} E_0$)\n- $B_H$: 가상의 기초 환산폭 ($B_H = \\sqrt{A/h}$ 또는 벽체 영향 단위폭)\n- $E_0$: 지반의 탄성계수 (보통 표준관입시험 N치 연동: $E_0 = 2800 N$)",
          structure: "1. 치수 효과(Size Effect) 보정 지수 ($-3/4$승)\n2. 지반의 유효 지반 반력 강성 변환식"
        }
      ];

      // Shuffle defaults randomly
      const shuffled = [...defaultFormulas];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      loadedData = shuffled;
      console.log('[Fallback] Loaded default formula questions.');
    }

    const cleaned = normalizeAndCompactifyFormulas(loadedData);
    latestFormulaQuestionsRef.current = cleaned;
    setFormulaQuestions(cleaned);
    localStorage.setItem('anti_formula_questions', JSON.stringify(cleaned));
    setFormulaRevealed({});
    setLoadingFormula(false);
    return cleaned;
  };

  const loadTheoryQuestions = async () => {
    setLoadingTheory(true);
    let loadedData = null;

    // 1) Try Database Sync
    try {
      const res = await fetch(`${API_BASE}/api/session/theory`);
      if (res.ok) {
        const body = await res.json();
        if (body && body.data && Array.isArray(body.data.theoryQuestions) && body.data.theoryQuestions.length > 0) {
          loadedData = body.data.theoryQuestions;
          console.log('[Sync] Loaded theory questions from database.');
        }
      }
    } catch (err) {
      console.warn('[Sync] Database theory loading failed:', err);
    }

    // 2) Try LocalStorage Fallback
    if (!loadedData) {
      try {
        const savedStr = localStorage.getItem('anti_theory_questions');
        if (savedStr) {
          const parsed = JSON.parse(savedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            loadedData = parsed;
            console.log('[Fallback] Loaded theory questions from LocalStorage.');
          }
        }
      } catch (err) {
        console.warn('localStorage 이론유도 복원 실패:', err);
      }
    }

    // 3) Fallback to Defaults if still empty
    if (!loadedData) {
      const defaultTheories = [
        {
          title: "Terzaghi 1차원 압밀 지배방정식 유도",
          concept: "점토층 내 과잉간극수압의 소산 및 침하 시간적 추이를 물리적으로 정밀 묘사하는 지배방정식",
          formula: "지배 미분방정식:\n$$\\frac{\\partial u}{\\partial t} = C_v \\frac{\\partial^2 u}{\\partial z^2}$$\n\n[주요 유도 가정]:\n1. 흙입자와 물은 압축성이 없음(비압축성)\n2. 흙 속 물의 흐름은 Darcy 법칙을 따름 ($v = k i$)\n3. 압밀은 1차원으로만 진행되며 흙의 공극비 변화는 유효응력 증가에 선형 비례함 ($a_v$ 일정)"
        },
        {
          title: "Terzaghi 얕은기초 극한지지력 공식의 유도",
          concept: "기초 저면 아래 지반의 전단 전파 거동(일반 전단 파괴)을 극한 상태 한계 평형으로 수치화한 지지력 공식",
          formula: "Terzaghi 극한 지지력:\n$$q_{ult} = c N_c + q N_q + 0.5 \\gamma B N_{\\gamma}$$\n\n[유도 메커니즘]:\n- 지반 파괴 영역을 3개 zone(Zone I: 탄성 쐐기, Zone II: 대수나선 방사형 전단 영역, Zone III: Rankine 수동 수평 지반 영역)으로 분할하여 상부 하중 벡터와 전단 저항 한계선 결합"
        },
        {
          title: "Rankine 주동토압 공식의 이론적 유도",
          concept: "지반이 가설 벽체 배면 방향으로 팽창 변형을 일으켜 한계 인장 소성 상태에 도달할 때의 수평 응력",
          formula: "주동토압 강도 식:\n$$p_a = \\gamma z K_a - 2 c \\sqrt{K_a}$$\n\n[주요 유도 공식]:\n- Mohr-Coulomb 파괴 포락선과 Mohr 응력원의 접점 기하학적 분석을 통하여 $K_a = \\tan^2(45^\\circ - \\phi/2)$ 수식 도출"
        }
      ];
      loadedData = defaultTheories;
    }

    latestTheoryQuestionsRef.current = loadedData;
    setTheoryQuestions(loadedData);
    localStorage.setItem('anti_theory_questions', JSON.stringify(loadedData));
    setTheoryRevealed({});
    setLoadingTheory(false);
    return loadedData;
  };

  const handleSaveTheoryQuestions = async (qs = theoryQuestions, showToast = true) => {
    try {
      localStorage.setItem('anti_theory_questions', JSON.stringify(qs));
      
      // Sync with database for cross-device support (AWAITED to avoid timing issues)
      const res = await fetch(`${API_BASE}/api/session/theory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theoryQuestions: qs })
      });

      if (!res.ok) {
        throw new Error('Database sync returned non-OK status');
      }

      if (showToast) {
        showNotification('이론유도 리스트가 성공적으로 저장되었습니다!', 'success');
      }
    } catch (err) {
      console.warn('이론유도 저장 실패:', err);
      if (showToast) {
        showNotification('서버 저장 실패: 로컬 스토리지에만 저장됩니다.', 'warning');
      }
    }
  };

  const handleUploadTheoryPdf = async (file) => {
    if (!file) return;
    const fileNameLower = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf');
    const isHtml = file.type === 'text/html' || fileNameLower.endsWith('.html') || fileNameLower.endsWith('.htm');
    
    if (!isPdf && !isHtml) {
      showNotification('PDF 또는 HTML 파일 형식만 업로드 가능합니다.', 'error');
      return;
    }

    setUploadingTheoryPdf(true);
    showNotification(`[${file.name}] 문서를 업로드하여 AI 분석을 시작합니다...`, 'info');

    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('fileNameUtf8', file.name);

      const res = await fetch(`${API_BASE}/api/session/theory/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'PDF 분석 실패');
      }

      const data = await res.json();
      const theories = data.theories || [];
      if (theories.length === 0) {
        throw new Error('AI 분석 결과에서 이론 유도 문제를 생성하지 못했습니다.');
      }

      // Add to state
      setTheoryQuestions(prev => {
        const newItems = theories.map(t => ({
          title: t.title,
          concept: t.concept || '업로드한 본문 문서를 기반으로 실시간 AI가 분석한 이론식입니다.',
          assumptions: t.assumptions || '',
          formula: t.answer
        }));
        const updated = [...newItems, ...prev];
        latestTheoryQuestionsRef.current = updated;
        handleSaveTheoryQuestions(updated, false);
        return updated;
      });

      showNotification(`총 ${theories.length}개의 핵심 이론 유도 문제가 성공적으로 생성되어 리스트 맨 위에 추가되었습니다!`, 'success');
    } catch (err) {
      console.error('Theory upload failed:', err);
      showNotification(err.message || 'PDF 분석 중 오류가 발생했습니다.', 'error');
    } finally {
      setUploadingTheoryPdf(false);
    }
  };

  const handleRefreshTheory = (idx) => {
    if (idx === null || idx === undefined) return;
    const q = theoryQuestions[idx];
    if (!q) return;

    setRefreshingTheoryIdx(idx);
    showNotification(`[${q.title || `Q${idx + 1}`}] 이론 유도를 AI가 정밀 고도화하여 갱신하고 있습니다...`);

    fetch(`${API_BASE}/api/theory/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: q.title,
        answer: q.formula
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('AI 고도화 실패');
        return res.json();
      })
      .then(data => {
        if (data && data.title && data.answer) {
          setTheoryQuestions(prev => {
            const updated = prev.map((item, i) => {
              if (i === idx) {
                return {
                  ...item,
                  title: data.title,
                  concept: data.concept || item.concept,
                  assumptions: data.assumptions || '',
                  formula: data.answer
                };
              }
              return item;
            });
            latestTheoryQuestionsRef.current = updated;
            handleSaveTheoryQuestions(updated, false);
            return updated;
          });
          showNotification(`[${data.title}] 이론 유도가 성공적으로 갱신되었습니다!`, 'success');
        }
      })
      .catch(err => {
        console.error('Theory refresh error:', err);
        showNotification('이론 갱신에 실패했습니다.', 'error');
      })
      .finally(() => {
        setRefreshingTheoryIdx(null);
      });
  };

  // ── 마운트 시 필수공식 및 이론유도 최우선 서버 동기화 로딩
  useEffect(() => {
    loadFormulaQuestions().catch(e => console.warn('서버 필수공식 사전로딩 실패:', e));
    loadTheoryQuestions().catch(e => console.warn('서버 이론유도 사전로딩 실패:', e));
  }, []);

  // ── 필수공식 및 이론유도 오픈 상태 브라우저 새로고침 영구 유지 연동
  useEffect(() => {
    localStorage.setItem('anti_show_formula_exam', showFormulaExam ? 'true' : 'false');
  }, [showFormulaExam]);

  useEffect(() => {
    localStorage.setItem('anti_show_theory_exam', showTheoryExam ? 'true' : 'false');
  }, [showTheoryExam]);

  const handleOpenTheoryExam = async () => {
    setShowTheoryExam(true);
    setChatHistory([]); // Clear chat history to start fresh for theory study
    setTheoryMobileTab('list');
    requestAnimationFrame(() => {
      if (theorySplitContainerRef.current) theorySplitContainerRef.current.scrollLeft = 0;
    });
    
    // Always load the latest synced data from database to ensure multi-device sync
    await loadTheoryQuestions();
    
    requestAnimationFrame(() => {
      if (theoryBodyRef.current) theoryBodyRef.current.scrollTop = savedTheoryScroll.current;
    });
  };

  const handleOpenFormulaExam = async () => {
    setShowFormulaExam(true);
    setFormulaMobileTab('list');
    requestAnimationFrame(() => {
      if (formulaSplitContainerRef.current) formulaSplitContainerRef.current.scrollLeft = 0;
    });
    
    // Always load the latest synced data from database to ensure multi-device sync
    const latest = await loadFormulaQuestions();
    
    requestAnimationFrame(() => {
      if (formulaBodyRef.current) formulaBodyRef.current.scrollTop = savedFormulaScroll.current;
    });
  };

  const handleScrollFormula = (direction) => {
    if (!formulaBodyRef.current) return;
    const cards = formulaBodyRef.current.querySelectorAll('.formula-card-item');
    if (cards.length === 0) return;

    const containerTop = formulaBodyRef.current.getBoundingClientRect().top;
    
    let currentIndex = 0;
    let minDiff = Infinity;
    
    cards.forEach((card, idx) => {
      const rect = card.getBoundingClientRect();
      const diff = Math.abs(rect.top - containerTop - 10);
      if (diff < minDiff) {
        minDiff = diff;
        currentIndex = idx;
      }
    });

    let targetIndex = currentIndex;
    if (direction === 'down') {
      targetIndex = Math.min(currentIndex + 1, cards.length - 1);
    } else if (direction === 'up') {
      targetIndex = Math.max(currentIndex - 1, 0);
    }

    const targetCard = cards[targetIndex];
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleScrollTheory = (direction) => {
    if (!theoryBodyRef.current) return;
    const cards = theoryBodyRef.current.querySelectorAll('.formula-card-item');
    if (cards.length === 0) return;

    const containerTop = theoryBodyRef.current.getBoundingClientRect().top;
    
    let currentIndex = 0;
    let minDiff = Infinity;
    
    cards.forEach((card, idx) => {
      const rect = card.getBoundingClientRect();
      const diff = Math.abs(rect.top - containerTop - 10);
      if (diff < minDiff) {
        minDiff = diff;
        currentIndex = idx;
      }
    });

    let targetIndex = currentIndex;
    if (direction === 'down') {
      targetIndex = Math.min(currentIndex + 1, cards.length - 1);
    } else if (direction === 'up') {
      targetIndex = Math.max(currentIndex - 1, 0);
    }

    const targetCard = cards[targetIndex];
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 실시간 튜터 대화에서 공식 마이닝 및 필수공식 리스트 추가 함수
  const handleAddFormulaFromChat = (text) => {
    if (!text) return;

    // 1. Title 마이닝
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    let title = "실시간 추가 공식";
    
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      const line = lines[i];
      const cleanLine = line.replace(/^(#+\s*|\*+\s*)/, '').replace(/\*+$/, '').trim();
      if (cleanLine && cleanLine.length < 30 && !cleanLine.includes('$') && !cleanLine.includes(':')) {
        title = cleanLine;
        break;
      }
    }

    // 2. formula (LaTeX 수식 블록) 발굴
    let formula = "";
    const blockMathRegex = /\$\$(.*?)\$\$/gs;
    const inlineMathRegex = /\$(.*?)\$/g;
    
    let blockMatch = blockMathRegex.exec(text);
    if (blockMatch) {
      formula = `$$${blockMatch[1].trim()}$$`;
    } else {
      let inlineMatch = inlineMathRegex.exec(text);
      if (inlineMatch) {
        formula = `$$${inlineMatch[1].trim()}$$`;
      }
    }

    // 3. 기호 정의 목록 발굴
    const definitionLines = [];
    const definitionRegex = /^\s*[-*]\s*(.*?)$/;
    
    lines.forEach(line => {
      if (definitionRegex.test(line) || (line.includes(':') && !line.startsWith('http') && line.length < 100)) {
        definitionLines.push(line);
      }
    });

    if (definitionLines.length > 0) {
      if (formula) {
        formula += "\n\n" + definitionLines.join('\n');
      } else {
        formula = definitionLines.join('\n');
      }
    }

    // 4. concept 수확
    let concept = "실시간 튜터링을 통해 추가된 전공 공식에 대한 설명입니다.";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = line.replace(/^(#+\s*|\*+\s*)/, '').replace(/\*+$/, '').trim();
      if (
        cleanLine &&
        !cleanLine.includes('$') &&
        !cleanLine.includes(':') &&
        !cleanLine.startsWith('-') &&
        !cleanLine.startsWith('*') &&
        cleanLine.length > 10 &&
        cleanLine !== title
      ) {
        concept = cleanLine;
        break;
      }
    }

    // 5. Question 합성
    const question = title;

    // 6. structure 합성
    const structure = "1. 공식 구성 인자의 물리적/역학적 상관관계 분석\n2. 기술사 답안 작성을 위한 공식의 실무적 의의 이해";

    const newFormula = {
      title,
      question,
      concept,
      formula,
      structure
    };

    setFormulaQuestions(prev => [newFormula, ...prev]);
    showNotification(`[${title}] 공식이 필수공식 퀴즈(Q1)에 성공적으로 추가되었습니다!`);
  };

  // 특정 큰 수식 블록 우측에서 개별 추가 시 지능적 마이닝 처리 함수
  const handleAddSpecificFormula = (mathContent, fullText) => {
    if (!mathContent || !fullText) return;

    const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
    
    // 이 수식이 위치한 line index 찾기
    let targetMathLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(mathContent)) {
        targetMathLineIdx = i;
        break;
      }
    }

    // 1. Title 마이닝 (수식 윗방향으로 헤더나 의미 있는 구절 탐색)
    let title = "실시간 추출 공식";
    if (targetMathLineIdx !== -1) {
      for (let i = targetMathLineIdx - 1; i >= 0; i--) {
        const line = lines[i];
        const cleanLine = line.replace(/^(#+\s*|\*+\s*)/, '').replace(/\*+$/, '').trim();
        // markdown header 거나, 짧고 강렬한 구절(3~35자) 이면서 수식이 들어있지 않은 줄
        if (cleanLine && cleanLine.length >= 3 && cleanLine.length <= 35 && !cleanLine.includes('$') && !cleanLine.includes(':')) {
          title = cleanLine;
          break;
        }
      }
    }

    // Title 기본 예외 처리 및 정리 (수식 기호 기반 보완)
    if (title === "실시간 추출 공식" || title.length > 40) {
      if (mathContent.includes('Z =') || mathContent.includes('Z=')) {
        title = "투수계수 가설검정 Z통계량";
      } else if (mathContent.includes('k =') || mathContent.includes('k=')) {
        title = "Darcy 투수계수 산정식";
      }
    }

    // 2. formula (LaTeX 대표 수식 + 바로 아래 기호설명 병합)
    let formula = `$$${mathContent}$$`;
    const definitionLines = [];
    
    if (targetMathLineIdx !== -1) {
      // 수식 바로 아래 줄부터 기호 정의가 나오는지 순방향 탐색 (최대 4줄 검사)
      for (let i = targetMathLineIdx + 1; i < Math.min(lines.length, targetMathLineIdx + 5); i++) {
        const line = lines[i];
        if (line.startsWith('여기서') || line.startsWith('-') || line.startsWith('*') || line.includes('는') || line.includes('은')) {
          definitionLines.push(line);
        } else {
          break;
        }
      }
    }

    if (definitionLines.length > 0) {
      formula += "\n\n" + definitionLines.join('\n');
    }

    // 3. concept (수식 이전 줄들 중 설명글 탐색)
    let concept = "실시간 공식 튜터링 대화에서 개별 추출된 전공 공식입니다.";
    if (targetMathLineIdx !== -1) {
      for (let i = targetMathLineIdx - 1; i >= 0; i--) {
        const line = lines[i];
        const cleanLine = line.replace(/^(#+\s*|\*+\s*)/, '').replace(/\*+$/, '').trim();
        if (
          cleanLine &&
          cleanLine.length > 10 &&
          !cleanLine.includes('$') &&
          !cleanLine.includes(':') &&
          !cleanLine.startsWith('-') &&
          !cleanLine.startsWith('*') &&
          cleanLine !== title
        ) {
          concept = cleanLine;
          break;
        }
      }
    }

    // 4. Question 합성
    const question = title;

    // 5. initialFormula 정의 (실시간 AI 로딩 인디케이터 부착)
    const initialFormula = formula + "\n\n⏳ 각 변수/상수의 상세 의미를 AI가 분석하고 있습니다...";

    const newFormula = {
      id: `f-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // 실시간 비동기 매칭용 고유 ID
      title,
      question,
      concept,
      formula: initialFormula
    };

    setFormulaQuestions(prev => {
      const updated = [newFormula, ...prev];
      handleSaveFormulaQuestions(updated, false);
      return updated;
    });
    showNotification(`[${title}] 공식이 필수공식 퀴즈(Q1)에 성공적으로 추가되었습니다!`);

    // 6. 백그라운드 AI 정밀 공식 작명 및 변수/상수 해설 API 비동기 가동
    fetch(`${API_BASE}/api/formula/suggest-title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mathContent, fullText })
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.title) {
          const suggestedTitle = data.title;
          const suggestedConcept = data.concept;
          const suggestedStructure = data.structure;
          setFormulaQuestions(prev => {
            const updated = prev.map(f => {
              if (f.id === newFormula.id) {
                return {
                  ...f,
                  title: suggestedTitle,
                  question: suggestedTitle,
                  concept: suggestedConcept || f.concept,
                  formula: suggestedStructure ? `$$${mathContent}$$\n\n${suggestedStructure}` : `$$${mathContent}$$`
                };
              }
              return f;
            });
            handleSaveFormulaQuestions(updated, false);
            return updated;
          });
          showNotification(`[${suggestedTitle}] 공식과 변수 해설이 AI 추천 분석을 거쳐 정밀 업데이트되었습니다!`, 'success');
        }
      })
      .catch(err => {
        console.warn('AI 타이틀 추천 반영 실패 (로컬 기본값 보존):', err);
      });
  };

  // 필수공식 개별 리프레쉬 (AI 분석 재요청 및 갱신)
  const handleRefreshFormula = (idx) => {
    if (idx === null || idx === undefined) return;
    const q = formulaQuestions[idx];
    if (!q) return;

    // 수식 본문 내 LaTeX 추출
    let mathContent = "";
    const match = q.formula.match(/\$\$(.*?)\$\$/s);
    if (match) {
      mathContent = match[1].trim();
    } else {
      mathContent = q.formula.replace(/^\$\$|\$\$$/g, '').trim();
    }

    setRefreshingFormulaIdx(idx);
    showNotification(`[${q.title || `Q${idx + 1}`}] 공식을 AI가 정밀 분석하여 재생성하고 있습니다...`);

    fetch(`${API_BASE}/api/formula/suggest-title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mathContent,
        fullText: `${q.concept || ''}\n${q.formula || ''}`
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.title) {
          const suggestedTitle = data.title;
          const suggestedConcept = data.concept;
          const suggestedStructure = data.structure;
          setFormulaQuestions(prev => {
            const updated = prev.map((f, i) => {
              if (i === idx) {
                return {
                  ...f,
                  title: suggestedTitle,
                  question: suggestedTitle,
                  concept: suggestedConcept || f.concept,
                  formula: suggestedStructure ? `$$${mathContent}$$\n\n${suggestedStructure}` : `$$${mathContent}$$`
                };
              }
              return f;
            });
            latestFormulaQuestionsRef.current = updated;
            handleSaveFormulaQuestions(updated, false);
            return updated;
          });
          showNotification(`[${suggestedTitle}] 공식의 제목, 핵심개념, 기호정의 분석 갱신이 완료되었습니다!`, 'success');
        } else {
          showNotification('공식 재분석 결과가 유효하지 않습니다.', 'error');
        }
      })
      .catch(err => {
        console.warn('공식 리프레쉬 AI 추천 반영 실패:', err);
        showNotification('AI 재분석 호출 중 오류가 발생했습니다.', 'error');
      })
      .finally(() => {
        setRefreshingFormulaIdx(null);
      });
  };

  // 필수공식 이론유도 질문 (실시간 튜터 연동)
  const handleAskTheoryDerivation = async (title, formula) => {
    if (isChatLoading) return;
    
    // LaTeX 기호 마크다운 전처리
    const cleanTitle = (title || '').replace(/\$/g, '').trim();
    const promptText = `기술사 시험을 대비하여, [${cleanTitle}] 공식의 상세한 이론적 배경과 수학적/역학적 유도 과정을 수험생의 눈높이에 맞춰 친절하고 구조적으로 유도해 설명해 주세요.\n\n공식 식: ${formula || ''}`;
    
    setChatHistory(prev => [...prev, { role: 'user', text: promptText }]);
    setIsChatLoading(true);

    requestAnimationFrame(() => {
      if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    });

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history: chatHistory.map(h => ({ role: h.role, text: h.text })), 
          message: promptText,
          image: null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '답변 생성 실패');
      setChatHistory(prev => [...prev, { role: 'model', text: data.text }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'model', text: `오류가 발생했습니다: ${err.message}` }]);
    } finally {
      setIsChatLoading(false);
      requestAnimationFrame(() => {
        if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      });
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
  const totalCompletedCount = Array.isArray(allTopics) 
    ? allTopics.reduce((acc, topic) => {
        if (!topic) return acc;
        const completedForTopic = topic.schedules?.filter(s => s && s.status === 'completed').length || 0;
        return acc + completedForTopic;
      }, 0)
    : 0;
  const totalScheduleCount = Array.isArray(allTopics) ? allTopics.length * 6 : 0;
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

          <div className="flex md:hidden flex-col gap-2 w-full">
            {/* 첫 번째 줄 */}
            <div className="flex gap-2 w-full">
              <button
                onClick={() => setViewMode('dashboard')}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl transition-all duration-200 border border-slate-800/80 cursor-pointer ${
                  viewMode === 'dashboard'
                    ? 'bg-brand-600 text-white shadow-md'
                    : 'bg-slateCustom-900/60 text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Calendar size={14} />
                오늘의 복습
              </button>
              <button
                onClick={() => setViewMode('all_topics')}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl transition-all duration-200 border border-slate-800/80 cursor-pointer ${
                  viewMode === 'all_topics'
                    ? 'bg-brand-600 text-white shadow-md'
                    : 'bg-slateCustom-900/60 text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <List size={14} />
                진행현황 ({allTopics.length})
              </button>
              <button
                onClick={handleOpenExam}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-amber-400 hover:text-amber-200 border border-slate-800/80 hover:bg-amber-950/40 rounded-xl transition-all duration-200 cursor-pointer"
              >
                <Award size={14} />
                종합평가
              </button>
            </div>
            
            {/* 두 번째 줄 */}
            <div className="flex gap-2 w-full">
              <button
                onClick={handleOpenFormulaExam}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-rose-400 hover:text-rose-200 border border-slate-800/80 hover:bg-rose-950/40 rounded-xl transition-all duration-200 cursor-pointer"
              >
                <Sigma size={14} />
                필수공식
              </button>
              <button
                onClick={handleOpenTheoryExam}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 bg-slateCustom-900/60 text-indigo-400 hover:text-indigo-200 border border-slate-800/80 hover:bg-indigo-950/40 rounded-xl transition-all duration-200 cursor-pointer"
              >
                <Brain size={14} />
                이론유도
              </button>
            </div>
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
        {/* 종합평가 버튼 */}
        <button
          onClick={handleOpenExam}
          className="flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 text-amber-400 hover:text-amber-200 hover:bg-amber-950/40"
          title="전체 소스 기반 70문항 종합평가"
        >
          <Award size={20} />
          <span className="text-[10px] font-bold tracking-tight">종합평가</span>
        </button>
        {/* 필수공식 버튼 */}
        <button
          onClick={handleOpenFormulaExam}
          className="flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 text-rose-400 hover:text-rose-200 hover:bg-rose-950/40"
          title="전공 필수 공식 집중 평가 (주관식 인출)"
        >
          <Sigma size={20} />
          <span className="text-[10px] font-bold tracking-tight">필수공식</span>
        </button>
        {/* 이론유도 버튼 */}
        <button
          onClick={handleOpenTheoryExam}
          className="flex flex-col items-center justify-center gap-2 w-20 h-20 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 text-indigo-400 hover:text-indigo-200 hover:bg-indigo-950/40"
          title="전공 필수 공식 이론 유도 및 상세 증명 학습"
        >
          <Brain size={20} />
          <span className="text-[10px] font-bold tracking-tight">이론유도</span>
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
                      <div className="flex items-center gap-2 w-full md:w-auto pt-3 md:pt-0 border-t border-slate-800/60 md:border-t-0 justify-end flex-wrap">
                        {/* 소스 + Gemini 복습 */}
                        <button
                          onClick={() => handleOpenAIQuestions(item.topic_id, item.title, item.keywords, item.pdf_name, 'ai', item.schedule_id, item.review_round)}
                          className="flex-grow md:flex-grow-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-violet-950/60 hover:bg-violet-900/60 text-violet-300 border border-violet-500/20 text-xs font-bold transition-all duration-200 animate-pulse-slow"
                          title="소스 + Gemini AI로 고난도 문제 생성"
                        >
                          <Brain size={13} />
                          🧠 복습하기
                        </button>
                        {/* 복습 완료 */}
                        <button
                          onClick={() => handleCompleteReview(item.schedule_id, item.title, item.review_round)}
                          className="flex-grow md:flex-grow-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                        >
                          <Check size={13} />
                          복습완료
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* RIGHT: Today's study registration form */}
            <section className="hidden md:block lg:col-span-5 glass-panel rounded-3xl p-6 border border-slate-800/80 shadow-xl">
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
                                  className="font-bold text-white text-sm truncate transition-colors"
                                  title="제목"
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
                                  onClick={() => handleOpenAIQuestions(topic.id, topic.title, topic.keywords, topic.pdf_name, 'ai')}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-950/60 hover:bg-violet-900/60 text-violet-300 border border-violet-500/20 text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                                  title="소스 + Gemini AI로 고난도 문제 생성"
                                >
                                  <Brain size={12} />
                                  🧠 복습하기
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

      {/* ===== 복습 모달 (종합평가 스타일) ===== */}
      {selectedTopic && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col">
          {/* Review Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-violet-500/20 flex-shrink-0 gap-4">
            <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
              <div className="p-2 bg-violet-950/80 text-violet-400 rounded-xl flex-shrink-0 mt-0.5">
                <Brain size={20} />
              </div>
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-violet-400 tracking-wider whitespace-nowrap">토픽 복습 (Gemini AI · 10문항)</span>
                  {!loadingAI && aiQuestions.length > 0 && (
                    <span className="text-[10px] bg-violet-950/60 text-violet-300 border border-violet-500/20 px-2 py-0.5 rounded-full font-bold">
                      {aiQuestions.length}문항
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-white text-xs sm:text-sm truncate sm:whitespace-normal" title={selectedTopic.title}>
                  {selectedTopic.title}
                </h3>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0">
              {!loadingAI && aiQuestions.length > 0 && (
                <span className="text-[10px] text-slate-400 mr-auto sm:hidden font-bold">
                  정답: {Object.keys(selectedAnswers).filter(i => selectedAnswers[i] === aiQuestions[parseInt(i)]?.answer).length}/{aiQuestions.filter(q => q.options?.length > 0).length}
                </span>
              )}
              <button
                onClick={() => { savedQuizScroll.current = quizBodyRef.current?.scrollTop || 0; setSelectedTopic(null); }}
                className="px-4 py-2 bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                title="화면만 숨김 (재개 시 문제 유지)"
              >
                닫기
              </button>
              <button
                onClick={() => { setSelectedTopic(null); setAiQuestions([]); setRevealedQuestions({}); setSelectedAnswers({}); setOpenSections({}); lastQuizTopicId.current = null; }}
                className="px-4 py-2 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-rose-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                title="문제 초기화 (재개 시 새 문제 생성)"
              >
                종료
              </button>
            </div>
          </div>

          {/* Sub-header tabs for Mobile */}
          <div className="flex md:hidden bg-slateCustom-950 px-5 py-2 border-b border-violet-500/10 justify-center flex-shrink-0">
            <div className="flex bg-slateCustom-900 p-1 rounded-xl w-full max-w-[320px] border border-slate-800">
              <button
                onClick={() => {
                  setReviewMobileTab('list');
                  reviewSplitContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  reviewMobileTab === 'list'
                    ? 'bg-violet-650 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                문제 리스트
              </button>
              <button
                onClick={() => {
                  setReviewMobileTab('tutor');
                  const containerWidth = reviewSplitContainerRef.current?.clientWidth || 0;
                  reviewSplitContainerRef.current?.scrollTo({ left: containerWidth, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  reviewMobileTab === 'tutor'
                    ? 'bg-violet-650 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                제미나이 AI 튜터
              </button>
            </div>
          </div>

          {/* Layout Split Container */}
          <div 
            ref={reviewSplitContainerRef}
            onScroll={(e) => {
              const scrollLeft = e.currentTarget.scrollLeft;
              const clientWidth = e.currentTarget.clientWidth;
              if (clientWidth > 0) {
                const activeTab = scrollLeft > clientWidth / 2 ? 'tutor' : 'list';
                setReviewMobileTab(activeTab);
              }
            }}
            className="flex-1 flex flex-row overflow-x-auto md:overflow-x-hidden overflow-y-hidden snap-x snap-mandatory scroll-smooth min-h-0 w-full select-none scrollbar-none"
          >

            {/* Left: Quiz Body */}
            <div ref={quizBodyRef} className="w-full max-w-full min-w-0 shrink-0 md:w-1/2 md:shrink snap-start h-full overflow-y-auto p-4 md:p-6 bg-slateCustom-900/30 scroll-smooth">
              {loadingAI ? (
                <div className="py-32 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="relative">
                    <div className="p-6 bg-violet-950/80 text-violet-400 rounded-full animate-bounce-slow">
                      <Brain size={40} />
                    </div>
                    <div className="absolute inset-0 bg-violet-500 rounded-full animate-ping opacity-20"></div>
                  </div>
                  <h4 className="text-xl font-bold text-white mt-2">Gemini AI가 10문항을 출제하는 중...</h4>
                  <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                    소스 자료를 분석하여 주관식(개요·공식)과 객관식을 혼용한 복습 문제를 생성하고 있습니다. 약 10~20초 소요됩니다.
                  </p>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-5">
                  {isFallback && (
                    <div className="p-5 rounded-2xl bg-amber-950/40 border border-amber-500/20 text-amber-200 flex items-start gap-3 animate-fade-in mb-6 shadow-xl">
                      <div className="p-2.5 bg-amber-900/50 text-amber-400 rounded-xl">
                        <Info size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 mb-0.5">로컬 오프라인 엔진 출제 완료</h4>
                        <p className="text-xs text-amber-300/90 leading-relaxed">
                          구글 Gemini API의 일일 사용 한도 초과(또는 일시적인 네트워크 제한)로 인해, 시스템에 내장된 <b>고품질 오프라인 백업 출제 엔진</b>이 소스 문서를 기반으로 기출문제를 대체 생성하였습니다. 중단 없이 복습을 계속 진행하실 수 있습니다!
                        </p>
                        {aiError && (
                          <p className="text-[10px] text-amber-500/50 mt-1.5 font-mono">
                            * 상세 오류: {aiError}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {aiQuestions.map((q, idx) => {
                    const isMC = q.type === '객관식' || (q.options && q.options.length > 0);
                    const isSubj = !isMC;
                    const answered = selectedAnswers[idx] !== undefined;
                    const isCorrect = answered && selectedAnswers[idx] === q.answer;
                    const isRevd = !!revealedQuestions[idx];

                    const subtypeBadgeColor =
                      q.type?.includes('개요') || q.type?.includes('인출') ? 'bg-sky-700' :
                      q.type?.includes('공식') ? 'bg-rose-700' :
                      q.type?.includes('서술') ? 'bg-indigo-700' :
                      'bg-amber-700';

                    return (
                      <div key={idx} className="quiz-card-item bg-slateCustom-900 border border-slate-800 rounded-2xl p-5 space-y-3 scroll-mt-2 transition-all duration-300 hover:border-slate-700/50">
                        {/* Q Header */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-black bg-slate-700 text-slate-200 px-2 py-0.5 rounded">Q{idx + 1}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded text-white ${isMC ? 'bg-emerald-700' : subtypeBadgeColor}`}>
                            {isMC ? '객관식' : `주관식·${q.type?.replace('구조 인출 (단락별 리콜)', '개요') || '서술'}`}
                          </span>
                        </div>

                        {/* Question Text */}
                        <div className="text-[17px] font-bold text-white leading-relaxed">
                          <LatexRenderer text={q.question} katexLoaded={katexLoaded} />
                        </div>

                        {/* MC Options */}
                        {isMC && (
                          <div className="space-y-2">
                            {q.options?.map((opt, oIdx) => {
                              let cls = "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 cursor-pointer ";
                              if (!answered) {
                                cls += "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/70 hover:border-slate-600";
                              } else if (opt === q.answer) {
                                cls += "bg-emerald-950/70 border-emerald-500 text-emerald-200 font-extrabold";
                              } else if (opt === selectedAnswers[idx] && opt !== q.answer) {
                                cls += "bg-rose-950/70 border-rose-500 text-rose-200";
                              } else {
                                cls += "bg-slate-800/30 border-slate-800 text-slate-500 opacity-60";
                              }
                              return (
                                <button
                                  key={oIdx}
                                  disabled={answered}
                                  onClick={() => setSelectedAnswers(prev => ({ ...prev, [idx]: opt }))}
                                  className={cls}
                                >
                                  <span className="flex gap-2 items-start">
                                    <span className="font-black text-[10px] mt-0.5 flex-shrink-0">{['①','②','③','④'][oIdx]}</span>
                                    <LatexRenderer text={opt} katexLoaded={katexLoaded} className="inline" />
                                  </span>
                                </button>
                              );
                            })}
                            {answered && (
                              <div className={`mt-2 p-3 rounded-xl text-sm leading-relaxed ${isCorrect ? 'bg-emerald-950/50 border border-emerald-500/30 text-emerald-200' : 'bg-rose-950/50 border border-rose-500/30 text-rose-200'}`}>
                                <span className="font-black">{isCorrect ? '✅ 정답!' : '❌ 오답'}</span>
                                {!isCorrect && (
                                  <span className="ml-2 inline-flex items-center gap-1">
                                    정답: <strong className="inline-block"><LatexRenderer text={q.answer} katexLoaded={katexLoaded} className="inline" /></strong>
                                  </span>
                                )}
                                {q.explanation && <div className="mt-1.5 text-slate-300"><LatexRenderer text={q.explanation} katexLoaded={katexLoaded} /></div>}

                                {/* Detailed Answer Button */}
                                <div className="mt-3 pt-2 border-t border-slate-700/50">
                                  {!detailedAnswers[`r_${idx}`]?.text && !detailedAnswers[`r_${idx}`]?.loading ? (
                                    <button
                                      onClick={() => handleRequestDetailedAnswer(`r_${idx}`, q.question, q.explanation)}
                                      className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all"
                                    >
                                      ✨ 답안 전문보기 (AI 심층 해설)
                                    </button>
                                  ) : detailedAnswers[`r_${idx}`]?.loading ? (
                                    <div className="text-[10px] text-indigo-400 font-bold animate-pulse">⏳ AI가 심층 해설 작성 중...</div>
                                  ) : (
                                    <div className="mt-2 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl">
                                      <div className="text-[11px] font-black text-indigo-400 mb-2">✨ AI 심층 해설</div>
                                      <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                                        <LatexRenderer text={detailedAnswers[`r_${idx}`].text} katexLoaded={katexLoaded} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Subjective Reveal */}
                        {isSubj && (
                          !isRevd ? (
                            <button
                              onClick={() => setRevealedQuestions(prev => ({ ...prev, [idx]: true }))}
                              className="w-full py-3 border-2 border-dashed border-slate-600 hover:border-violet-500 rounded-xl text-xs font-bold text-slate-400 hover:text-violet-300 transition-all duration-200"
                            >
                              💡 머릿속으로 답안을 구성한 뒤 → 정답 확인
                            </button>
                          ) : (
                            <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4 space-y-2">
                              <div className="flex justify-between items-center text-[11px] font-black text-amber-400">
                                <span>📝 모범 답안</span>
                                <button
                                  onClick={() => setRevealedQuestions(prev => ({ ...prev, [idx]: false }))}
                                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer font-bold"
                                  title="답안 접기"
                                >
                                  접기 ✕
                                </button>
                              </div>
                              {q.concept && (
                                <div className="space-y-1">
                                  <span className="text-[10px] font-black text-indigo-400">💡 핵심 개념: </span>
                                  <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.concept} katexLoaded={katexLoaded} /></div>
                                </div>
                              )}
                              {q.formula && (
                                <div className="space-y-1 pt-2 border-t border-amber-500/10">
                                  <span className="text-[10px] font-black text-rose-400">📐 공식/개념도: </span>
                                  <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.formula} katexLoaded={katexLoaded} /></div>
                                </div>
                              )}
                              {q.structure && (
                                <div className="space-y-1 pt-2 border-t border-amber-500/10">
                                  <span className="text-[10px] font-black text-emerald-400">📋 답안 구조: </span>
                                  <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.structure} katexLoaded={katexLoaded} /></div>
                                </div>
                              )}
                              {!q.concept && !q.formula && !q.structure && (
                                <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.answer || '답안 없음'} katexLoaded={katexLoaded} /></div>
                              )}

                              {/* Detailed Answer Button */}
                              <div className="mt-3 pt-2 border-t border-slate-700/50">
                                {!detailedAnswers[`r_${idx}`]?.text && !detailedAnswers[`r_${idx}`]?.loading ? (
                                  <button
                                    onClick={() => handleRequestDetailedAnswer(`r_${idx}`, q.question, q.answer || q.concept)}
                                    className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all"
                                  >
                                    ✨ 답안 전문보기 (AI 심층 해설)
                                  </button>
                                ) : detailedAnswers[`r_${idx}`]?.loading ? (
                                  <div className="text-[10px] text-indigo-400 font-bold animate-pulse">⏳ AI가 심층 해설 작성 중...</div>
                                ) : (
                                  <div className="mt-2 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl">
                                    <div className="text-[11px] font-black text-indigo-400 mb-2">✨ AI 심층 해설</div>
                                    <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                                      <LatexRenderer text={detailedAnswers[`r_${idx}`].text} katexLoaded={katexLoaded} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}

                  {aiQuestions.length > 0 && (
                    <div className="text-center py-6">
                      <button
                        onClick={handleQuizCompleteClick}
                        className="inline-flex items-center gap-3 bg-violet-950 hover:bg-violet-900/90 border border-violet-500/40 hover:border-violet-400 rounded-2xl px-8 py-4 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-lg shadow-violet-950/50 hover:shadow-violet-900/30 group"
                        title="복습 완료 처리 및 대시보드로 돌아가기"
                      >
                        <Award size={22} className="text-violet-400 group-hover:animate-bounce-slow" />
                        <div className="text-left">
                          <div className="text-xs text-violet-300 font-black">복습 완료하기</div>
                          <div className="text-sm text-white font-extrabold">
                            객관식 정답률: {Math.round(
                              Object.keys(selectedAnswers).filter(i => selectedAnswers[i] === aiQuestions[parseInt(i)]?.answer).length /
                              Math.max(aiQuestions.filter(q => q.options?.length > 0).length, 1) * 100
                            )}%
                          </div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Vertical Navigation Divider Controller (PC Only) */}
            <div className="hidden md:flex flex-col items-center relative z-20 w-0 h-full">
              <div 
                style={{ top: '33.33%', transform: 'translate(-50%, -50%)' }}
                className="absolute flex flex-col gap-2 p-1.5 rounded-full bg-slateCustom-950/90 border border-slate-800 backdrop-blur-md shadow-2xl shadow-black/80 select-none"
              >
                <button 
                  onClick={() => handleScrollQuestion('up')}
                  className="p-2.5 rounded-full bg-slate-800/80 hover:bg-violet-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-95 shadow-md border border-slate-700/50 hover:border-violet-500 hover:shadow-violet-600/30 cursor-pointer flex items-center justify-center group"
                  title="이전 문제로 스크롤"
                >
                  <ChevronUp size={16} className="group-hover:-translate-y-0.5 transition-transform" />
                </button>
                <div className="w-4 border-t border-slate-800/80 mx-auto"></div>
                <button 
                  onClick={() => handleScrollQuestion('down')}
                  className="p-2.5 rounded-full bg-slate-800/80 hover:bg-violet-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-95 shadow-md border border-slate-700/50 hover:border-violet-500 hover:shadow-violet-600/30 cursor-pointer flex items-center justify-center group"
                  title="다음 문제로 스크롤"
                >
                  <ChevronDown size={16} className="group-hover:translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right: Gemini Chat Sidebar */}
            <div className="w-full max-w-full min-w-0 shrink-0 md:w-1/2 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col">
              <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slateCustom-950 flex-shrink-0">
                <Brain size={16} className="text-violet-500" />
                <span className="text-xs font-bold text-slate-200">제미나이 실시간 튜터 (Flash 2.0)</span>
              </div>

              <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-[11px] text-slate-400">문제 풀이 중 궁금한 점을<br/>무엇이든 물어보세요!</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`text-[10px] mb-1 font-bold ${msg.role === 'user' ? 'text-indigo-400 mr-1' : 'text-violet-400 ml-1'}`}>
                        {msg.role === 'user' ? '나' : 'Gemini'}
                      </div>
                      <div className={`px-3 py-2 rounded-2xl max-w-[90%] text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'
                      }`}>
                        {msg.role === 'user' ? (
                          <div className="flex flex-col gap-2">
                            {msg.image && (
                              <img 
                                src={`data:${msg.image.mimeType};base64,${msg.image.data}`} 
                                alt="첨부 이미지" 
                                className="max-w-full max-h-48 rounded-xl object-contain border border-indigo-455 shadow-md"
                              />
                            )}
                            {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                          </div>
                        ) : (
                          <LatexRenderer 
                            text={msg.text} 
                            katexLoaded={katexLoaded} 
                            onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, msg.text)}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex flex-col items-start">
                    <div className="text-[10px] mb-1 font-bold text-violet-400 ml-1">Gemini</div>
                    <div className="px-3 py-2 rounded-2xl bg-slate-800 text-slate-400 border border-slate-700 rounded-bl-sm text-xs flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce delay-75"></div>
                      <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce delay-150"></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-slate-800 bg-slateCustom-950 flex-shrink-0">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} 
                  onPaste={handlePasteImage}
                  className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 flex flex-col gap-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all shadow-lg"
                >
                  {/* 첨부 이미지 썸네일 (입력창 내부 상단 배치) */}
                  {attachedImage && (
                    <div className="relative w-12 h-12 rounded-xl border border-slate-650 shadow-md overflow-hidden group animate-fade-in ml-1 mt-1 flex-shrink-0">
                      <img 
                        src={`data:${attachedImage.mimeType};base64,${attachedImage.data}`} 
                        alt="첨부 이미지" 
                        className="w-full h-full object-cover"
                      />
                      <button 
                        type="button" 
                        onClick={handleClearAttachedImage} 
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 hover:bg-black text-white rounded-full flex items-center justify-center transition-colors cursor-pointer"
                        title="이미지 삭제"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}

                  {/* 텍스트 입력창 (보더 없음) */}
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onPaste={handlePasteImage}
                      placeholder={attachedImage ? "이미지와 함께 보낼 질문 입력..." : "기술사 용어나 개념 질문..."}
                      disabled={isChatLoading}
                      className="w-full bg-transparent border-0 p-1 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-0"
                    />
                  </div>

                  {/* 하단 컨트롤 바 */}
                  <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 px-1">
                    {/* 왼쪽: 이미지 첨부 클립 버튼 */}
                    <div className="flex items-center gap-2">
                      <input 
                        type="file" 
                        id="quiz-image-upload" 
                        accept="image/*" 
                        onChange={handleImageAttachment}
                        className="hidden" 
                      />
                      <label 
                        htmlFor="quiz-image-upload" 
                        className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-700/60 transition-all cursor-pointer flex items-center justify-center"
                        title="스크린샷/이미지 첨부"
                      >
                        <Paperclip size={14} />
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium tracking-tight">Gemini 2.0 Flash (High)</span>
                    </div>

                    {/* 오른쪽: 전송 버튼 */}
                    <button
                      type="submit"
                      disabled={(!chatInput.trim() && !attachedImage) || isChatLoading}
                      className="w-7 h-7 bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:hover:bg-violet-600 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-md shadow-violet-600/10 active:scale-95"
                    >
                      <Send size={11} className="text-white" />
                    </button>
                  </div>
                </form>
              </div>
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

      {/* ===== COMPREHENSIVE EXAM MODAL (70문항) ===== */}
      {showExam && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col">
          {/* Exam Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-amber-500/20 flex-shrink-0 gap-4">
            <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
              <div className="p-2 bg-amber-950/80 text-amber-400 rounded-xl flex-shrink-0 mt-0.5">
                <Award size={20} />
              </div>
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider whitespace-nowrap">종합평가 (Gemini AI)</span>
                  {!loadingExam && examQuestions.length > 0 && (
                    <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                      {examQuestions.length}문항
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-white text-xs sm:text-sm truncate sm:whitespace-normal" title={examTopic?.title}>
                  {examTopic?.title}
                </h3>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0">
              {!loadingExam && examQuestions.length > 0 && (
                <span className="text-[10px] text-slate-400 mr-auto sm:hidden font-bold">
                  정답: {Object.keys(examAnswers).filter(i => examAnswers[i] === examQuestions[parseInt(i)]?.answer).length}/{examQuestions.filter(q => q.type === '객관식').length}
                </span>
              )}
              <button
                onClick={async () => {
                  savedExamScroll.current = examBodyRef.current?.scrollTop || 0;
                  // 서버에 현재 상태 저장 (기기 간 공유) - 완료 확인 후 닫기
                  try {
                    const r = await fetch(`${API_BASE}/api/session/exam`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        examQuestions, 
                        examRevealed, 
                        examAnswers, 
                        examTopic,
                        savedExamScroll: savedExamScroll.current 
                      }),
                    });
                    if (!r.ok) throw new Error('서버 응답 오류');
                  } catch (e) {
                    console.warn('세션 저장 실패:', e);
                    showNotification('다른 기기와 동기화에 실패했습니다. 로컬에만 저장됩니다.', 'error');
                  }
                  setShowExam(false);
                }}
                className="px-4 py-2 bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                title="화면만 숨김 (재개 시 문제 유지)"
              >
                닫기
              </button>
              <button
                onClick={() => {
                  // 서버 세션 삭제 (종료 = 새로 시작)
                  fetch(`${API_BASE}/api/session/exam`, { method: 'DELETE' })
                    .catch(e => console.warn('세션 삭제 실패:', e));
                  setShowExam(false); setExamQuestions([]); setExamRevealed({}); setExamAnswers({}); setExamTopic(null);
                }}
                className="px-4 py-2 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-rose-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                title="종합평가 종료 (재개 시 새 문제 생성)"
              >
                종료
              </button>
            </div>
          </div>

          {/* Sub-header tabs for Mobile */}
          <div className="flex md:hidden bg-slateCustom-950 px-5 py-2 border-b border-amber-500/10 justify-center flex-shrink-0">
            <div className="flex bg-slateCustom-900 p-1 rounded-xl w-full max-w-[320px] border border-slate-800">
              <button
                onClick={() => {
                  setExamMobileTab('list');
                  examSplitContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  examMobileTab === 'list'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                문제 리스트
              </button>
              <button
                onClick={() => {
                  setExamMobileTab('tutor');
                  const containerWidth = examSplitContainerRef.current?.clientWidth || 0;
                  examSplitContainerRef.current?.scrollTo({ left: containerWidth, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  examMobileTab === 'tutor'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                제미나이 AI 튜터
              </button>
            </div>
          </div>

          {/* Layout Split Container */}
          <div 
            ref={examSplitContainerRef}
            onScroll={(e) => {
              const scrollLeft = e.currentTarget.scrollLeft;
              const clientWidth = e.currentTarget.clientWidth;
              if (clientWidth > 0) {
                const activeTab = scrollLeft > clientWidth / 2 ? 'tutor' : 'list';
                setExamMobileTab(activeTab);
              }
            }}
            className="flex-1 flex flex-row overflow-x-auto md:overflow-x-hidden overflow-y-hidden snap-x snap-mandatory scroll-smooth min-h-0 w-full select-none scrollbar-none"
          >
            
            {/* Left: Exam Body */}
            <div ref={examBodyRef} className="w-full max-w-full min-w-0 shrink-0 md:w-1/2 md:shrink snap-start h-full overflow-y-auto p-4 md:p-6 bg-slateCustom-900/30 scroll-smooth">
            {loadingExam ? (
              <div className="py-32 flex flex-col items-center justify-center gap-4 text-center">
                <div className="relative">
                  <div className="p-6 bg-amber-950/80 text-amber-400 rounded-full animate-bounce-slow">
                    <Brain size={40} />
                  </div>
                  <div className="absolute inset-0 bg-amber-500 rounded-full animate-ping opacity-20"></div>
                </div>
                <h4 className="text-xl font-bold text-white mt-2">Gemini AI가 70문항을 출제하는 중...</h4>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  소스 자료를 분석하여 주관식(개요·공식)과 객관식을 혼용한 종합평가를 생성하고 있습니다. 약 30~60초 소요됩니다.
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-5">
                {examQuestions.map((q, idx) => {
                  const isMC = q.type === '객관식';
                  const isSubj = !isMC;
                  const answered = examAnswers[idx] !== undefined;
                  const isCorrect = answered && examAnswers[idx] === q.answer;
                  const isRevd = !!examRevealed[idx];

                  const subtypeBadgeColor =
                    q.subtype === '개요' ? 'bg-sky-700' :
                    q.subtype === '공식' ? 'bg-rose-700' :
                    q.subtype === '서술' ? 'bg-indigo-700' :
                    'bg-emerald-700';

                  return (
                    <div key={idx} className="bg-slateCustom-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                      {/* Q Header */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black bg-slate-700 text-slate-200 px-2 py-0.5 rounded">Q{idx + 1}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded text-white ${isMC ? 'bg-emerald-700' : subtypeBadgeColor}`}>
                          {isMC ? '객관식' : `주관식·${q.subtype || '서술'}`}
                        </span>
                      </div>

                      {/* Question Text */}
                      <div className="text-[17px] font-bold text-white leading-relaxed">
                        <LatexRenderer text={q.question} katexLoaded={katexLoaded} />
                      </div>

                      {/* MC Options */}
                      {isMC && (
                        <div className="space-y-2">
                          {q.options?.map((opt, oIdx) => {
                            let cls = "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 cursor-pointer ";
                            if (!answered) {
                              cls += "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/70 hover:border-slate-600";
                            } else if (opt === q.answer) {
                              cls += "bg-emerald-950/70 border-emerald-500 text-emerald-200 font-extrabold";
                            } else if (opt === examAnswers[idx] && opt !== q.answer) {
                              cls += "bg-rose-950/70 border-rose-500 text-rose-200";
                            } else {
                              cls += "bg-slate-800/30 border-slate-800 text-slate-500 opacity-60";
                            }
                            return (
                              <button
                                key={oIdx}
                                disabled={answered}
                                onClick={() => setExamAnswers(prev => ({ ...prev, [idx]: opt }))}
                                className={cls}
                              >
                                <span className="flex gap-2 items-start">
                                  <span className="font-black text-[10px] mt-0.5 flex-shrink-0">{['①','②','③','④'][oIdx]}</span>
                                  <LatexRenderer text={opt} katexLoaded={katexLoaded} className="inline" />
                                </span>
                              </button>
                            );
                          })}
                          {answered && (
                            <div className={`mt-2 p-3 rounded-xl text-sm leading-relaxed ${isCorrect ? 'bg-emerald-950/50 border border-emerald-500/30 text-emerald-200' : 'bg-rose-950/50 border border-rose-500/30 text-rose-200'}`}>
                              <span className="font-black">{isCorrect ? '✅ 정답!' : '❌ 오답'}</span>
                              {!isCorrect && (
                                <span className="ml-2 inline-flex items-center gap-1">
                                  정답: <strong className="inline-block"><LatexRenderer text={q.answer} katexLoaded={katexLoaded} className="inline" /></strong>
                                </span>
                              )}
                              {q.explanation && <div className="mt-1.5 text-slate-300"><LatexRenderer text={q.explanation} katexLoaded={katexLoaded} /></div>}
                              
                              {/* Detailed Answer Button & Content */}
                              <div className="mt-3 pt-2 border-t border-slate-700/50">
                                {!detailedAnswers[idx]?.text && !detailedAnswers[idx]?.loading ? (
                                  <button
                                    onClick={() => handleRequestDetailedAnswer(idx, q.question, q.explanation)}
                                    className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all"
                                  >
                                    ✨ 답안 전문보기 (AI 심층 해설)
                                  </button>
                                ) : detailedAnswers[idx]?.loading ? (
                                  <div className="text-[10px] text-indigo-400 font-bold animate-pulse">
                                    ⏳ AI가 기술사 수준의 심층 해설을 작성 중입니다...
                                  </div>
                                ) : (
                                  <div className="mt-2 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl">
                                    <div className="text-[11px] font-black text-indigo-400 mb-2">✨ AI 심층 해설</div>
                                    <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap prose prose-invert max-w-none prose-base">
                                      <LatexRenderer text={detailedAnswers[idx].text} katexLoaded={katexLoaded} />
                                    </div>
                                    {detailedAnswers[idx].error && (
                                      <div className="text-xs text-rose-400 mt-2">{detailedAnswers[idx].error}</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Subjective Reveal */}
                      {isSubj && (
                        !isRevd ? (
                          <button
                            onClick={() => setExamRevealed(prev => ({ ...prev, [idx]: true }))}
                            className="w-full py-3 border-2 border-dashed border-slate-600 hover:border-amber-500 rounded-xl text-xs font-bold text-slate-400 hover:text-amber-300 transition-all duration-200"
                          >
                            💡 머릿속으로 답안을 구성한 뒤 → 정답 확인
                          </button>
                        ) : (
                          <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between items-center text-[11px] font-black text-amber-400">
                              <span>📝 모범 답안</span>
                              <button
                                onClick={() => setExamRevealed(prev => ({ ...prev, [idx]: false }))}
                                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer font-bold"
                                title="답안 접기"
                              >
                                접기 ✕
                              </button>
                            </div>
                            <div className="text-sm text-slate-200 leading-relaxed">
                              <LatexRenderer text={q.answer || '답안 없음'} katexLoaded={katexLoaded} />
                            </div>
                            {q.concept && (
                              <div className="pt-2 border-t border-amber-500/10">
                                <span className="text-[10px] font-black text-indigo-400">💡 핵심 개념: </span>
                                <span className="text-[10px] text-slate-300">{q.concept}</span>
                              </div>
                            )}

                            {/* Detailed Answer Button & Content */}
                            <div className="mt-3 pt-2 border-t border-slate-700/50">
                              {!detailedAnswers[idx]?.text && !detailedAnswers[idx]?.loading ? (
                                <button
                                  onClick={() => handleRequestDetailedAnswer(idx, q.question, q.answer)}
                                  className="text-[10px] px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold transition-all"
                                >
                                  ✨ 답안 전문보기 (AI 심층 해설)
                                </button>
                              ) : detailedAnswers[idx]?.loading ? (
                                <div className="text-[10px] text-indigo-400 font-bold animate-pulse">
                                  ⏳ AI가 기술사 수준의 심층 해설을 작성 중입니다...
                                </div>
                              ) : (
                                <div className="mt-2 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl">
                                  <div className="text-[11px] font-black text-indigo-400 mb-2">✨ AI 심층 해설</div>
                                  <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap prose prose-invert max-w-none prose-base">
                                    <LatexRenderer text={detailedAnswers[idx].text} katexLoaded={katexLoaded} />
                                  </div>
                                  {detailedAnswers[idx].error && (
                                    <div className="text-xs text-rose-400 mt-2">{detailedAnswers[idx].error}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}

                {examQuestions.length > 0 && (
                  <div className="text-center py-6">
                    <div className="inline-flex items-center gap-3 bg-amber-950/60 border border-amber-500/20 rounded-2xl px-6 py-4">
                      <Award size={20} className="text-amber-400" />
                      <div className="text-left">
                        <div className="text-xs text-amber-300 font-black">종합평가 완료</div>
                        <div className="text-sm text-white font-extrabold">
                          객관식 정답률: {Math.round(Object.keys(examAnswers).filter(i => examAnswers[i] === examQuestions[parseInt(i)]?.answer).length / Math.max(examQuestions.filter(q => q.type === '객관식').length, 1) * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>

            {/* Right: Gemini Sidebar */}
            <div className="w-full max-w-full min-w-0 shrink-0 md:w-1/2 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col">
              <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slateCustom-950 flex-shrink-0">
                <Brain size={16} className="text-amber-500" />
                <span className="text-xs font-bold text-slate-200">제미나이 실시간 튜터 (Flash 2.0)</span>
              </div>
              
              <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-[11px] text-slate-400">문제 풀이 중 궁금한 점을<br/>무엇이든 물어보세요!</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`text-[10px] mb-1 font-bold ${msg.role === 'user' ? 'text-indigo-400 mr-1' : 'text-amber-400 ml-1'}`}>
                        {msg.role === 'user' ? '나' : 'Gemini'}
                      </div>
                      <div className={`px-4 py-2.5 rounded-2xl max-w-[95%] text-xs leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-indigo-600 text-white rounded-br-sm' 
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm prose prose-invert prose-sm max-w-none'
                      }`}>
                        {msg.role === 'user' ? (
                          <div className="flex flex-col gap-2">
                            {msg.image && (
                              <img 
                                src={`data:${msg.image.mimeType};base64,${msg.image.data}`} 
                                alt="첨부 이미지" 
                                className="max-w-full max-h-48 rounded-xl object-contain border border-indigo-455 shadow-md"
                              />
                            )}
                            {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                          </div>
                        ) : (
                          <LatexRenderer 
                            text={msg.text} 
                            katexLoaded={katexLoaded} 
                            onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, msg.text)}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex flex-col items-start">
                    <div className="text-[10px] mb-1 font-bold text-amber-400 ml-1">Gemini</div>
                    <div className="px-3 py-2 rounded-2xl bg-slate-800 text-slate-400 border border-slate-700 rounded-bl-sm text-xs flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce delay-75"></div>
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce delay-150"></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-slate-800 bg-slateCustom-950 flex-shrink-0">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} 
                  onPaste={handlePasteImage}
                  className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 flex flex-col gap-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all shadow-lg"
                >
                  {/* 첨부 이미지 썸네일 (입력창 내부 상단 배치) */}
                  {attachedImage && (
                    <div className="relative w-12 h-12 rounded-xl border border-slate-650 shadow-md overflow-hidden group animate-fade-in ml-1 mt-1 flex-shrink-0">
                      <img 
                        src={`data:${attachedImage.mimeType};base64,${attachedImage.data}`} 
                        alt="첨부 이미지" 
                        className="w-full h-full object-cover"
                      />
                      <button 
                        type="button" 
                        onClick={handleClearAttachedImage} 
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 hover:bg-black text-white rounded-full flex items-center justify-center transition-colors cursor-pointer"
                        title="이미지 삭제"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}

                  {/* 텍스트 입력창 (보더 없음) */}
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onPaste={handlePasteImage}
                      placeholder={attachedImage ? "이미지와 함께 보낼 질문 입력..." : "기술사 용어나 개념 질문..."}
                      disabled={isChatLoading}
                      className="w-full bg-transparent border-0 p-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-0"
                    />
                  </div>

                  {/* 하단 컨트롤 바 */}
                  <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 px-1">
                    {/* 왼쪽: 이미지 첨부 클립 버튼 */}
                    <div className="flex items-center gap-2">
                      <input 
                        type="file" 
                        id="exam-image-upload" 
                        accept="image/*" 
                        onChange={handleImageAttachment}
                        className="hidden" 
                      />
                      <label 
                        htmlFor="exam-image-upload" 
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-700/60 transition-all cursor-pointer flex items-center justify-center"
                        title="스크린샷/이미지 첨부"
                      >
                        <Paperclip size={14} />
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium tracking-tight">Gemini 2.0 Flash (High)</span>
                    </div>

                    {/* 오른쪽: 전송 버튼 */}
                    <button
                      type="submit"
                      disabled={(!chatInput.trim() && !attachedImage) || isChatLoading}
                      className="w-7 h-7 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-md shadow-indigo-600/10 active:scale-95"
                    >
                      <Send size={11} className="text-white" />
                    </button>
                  </div>
                </form>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ===== ESSENTIAL FORMULA EXAM MODAL (주관식) ===== */}
      {showFormulaExam && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col">
          {/* Formula Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-rose-500/20 flex-shrink-0 gap-4">
            <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
              <div className="p-2 bg-rose-950/80 text-rose-400 rounded-xl flex-shrink-0 mt-0.5">
                <Sigma size={20} />
              </div>
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-rose-400 tracking-wider whitespace-nowrap">필수공식 집중 복습</span>
                  {!loadingFormula && formulaQuestions.length > 0 && (
                    <span className="text-[10px] bg-rose-950/60 text-rose-300 border border-rose-500/20 px-2 py-0.5 rounded-full font-bold">
                      {formulaQuestions.length}개 공식
                    </span>
                  )}
                  {/* Mobile Swipe Hint */}
                  <span className="inline-flex md:hidden text-[9px] bg-rose-950/60 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full font-black animate-pulse whitespace-nowrap">
                    ← 좌우 쓸어 넘겨 튜터 대화 보기
                  </span>
                </div>
                <h3 className="font-bold text-white text-xs sm:text-sm truncate sm:whitespace-normal">
                  전공 필수 공식 집중 평가 (주관식 인출)
                </h3>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-800/40 sm:border-t-0 pt-3 sm:pt-0">
              <div className="relative flex items-center min-w-[200px] sm:min-w-[240px] flex-grow sm:flex-grow-0">
                <Search size={14} className="absolute left-3 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="공식 제목 검색..."
                  value={formulaSearchQuery}
                  onChange={(e) => setFormulaSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 bg-slateCustom-900/60 hover:bg-slateCustom-900 border border-slate-800 focus:border-rose-500/50 text-white placeholder-slate-500 text-xs rounded-xl focus:outline-none transition-all duration-200"
                />
                {formulaSearchQuery && (
                  <button
                    onClick={() => setFormulaSearchQuery('')}
                    className="absolute right-2.5 p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, false); // 닫기를 눌러도 저장후 닫기
                  savedFormulaScroll.current = formulaBodyRef.current?.scrollTop || 0;
                  setFormulaSearchQuery('');
                  setShowFormulaExam(false);
                }}
                className="px-4 py-2 bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                title="저장 후 닫기"
              >
                닫기
              </button>
              <button
                onClick={() => {
                  handleSaveFormulaQuestions(latestFormulaQuestionsRef.current, true); // 저장 버튼: 저장만 하고 닫지는 않음
                }}
                className="px-4 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 hover:text-white border border-emerald-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center flex items-center justify-center gap-1.5"
                title="공식 변경사항 실시간 저장"
              >
                <Save size={13} />
                저장
              </button>
            </div>
          </div>

          {/* Sub-header tabs for Mobile */}
          <div className="flex md:hidden bg-slateCustom-950 px-5 py-2 border-b border-rose-500/10 justify-center flex-shrink-0">
            <div className="flex bg-slateCustom-900 p-1 rounded-xl w-full max-w-[320px] border border-slate-800">
              <button
                onClick={() => {
                  setFormulaMobileTab('list');
                  formulaSplitContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  formulaMobileTab === 'list'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                공식 리스트
              </button>
              <button
                onClick={() => {
                  setFormulaMobileTab('tutor');
                  const containerWidth = formulaSplitContainerRef.current?.clientWidth || 0;
                  formulaSplitContainerRef.current?.scrollTo({ left: containerWidth, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  formulaMobileTab === 'tutor'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                제미나이 AI 튜터
              </button>
            </div>
          </div>

          {/* Layout Split Container (Mobile: Horizontal Swipe, PC: Side-by-Side) */}
          <div 
            ref={formulaSplitContainerRef}
            onScroll={(e) => {
              const scrollLeft = e.currentTarget.scrollLeft;
              const clientWidth = e.currentTarget.clientWidth;
              if (clientWidth > 0) {
                const activeTab = scrollLeft > clientWidth / 2 ? 'tutor' : 'list';
                setFormulaMobileTab(activeTab);
              }
            }}
            className="flex-1 flex flex-row overflow-x-auto md:overflow-x-hidden overflow-y-hidden snap-x snap-mandatory scroll-smooth min-h-0 w-full select-none scrollbar-none"
          >
            
            {/* Left: Formula Body */}
            <div ref={formulaBodyRef} className="w-full max-w-full min-w-0 shrink-0 md:w-1/2 md:shrink snap-start h-full overflow-y-auto overflow-x-hidden p-4 md:p-6 bg-slateCustom-900/30">
              {loadingFormula ? (
                <div className="py-32 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="relative">
                    <div className="p-6 bg-rose-950/80 text-rose-400 rounded-full animate-bounce-slow">
                      <Sigma size={40} />
                    </div>
                    <div className="absolute inset-0 bg-rose-500 rounded-full animate-ping opacity-20"></div>
                  </div>
                  <h4 className="text-xl font-bold text-white mt-2">필수 공식 데이터를 로드하는 중...</h4>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-5">
                  {formulaQuestions.filter(q => {
                    const titleMatch = (q.title || '').toLowerCase().includes(formulaSearchQuery.toLowerCase());
                    const questionMatch = (q.question || '').toLowerCase().includes(formulaSearchQuery.toLowerCase());
                    return titleMatch || questionMatch;
                  }).length === 0 && (
                    <div className="py-24 text-center flex flex-col items-center justify-center gap-4 text-center animate-scale-up">
                      <div className="p-5 bg-slateCustom-950/60 border border-slate-800 text-slate-500 rounded-full flex items-center justify-center">
                        <Search size={32} />
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-white">검색 결과가 없습니다</h4>
                        <p className="text-xs text-slate-400 mt-1">다른 공식 명칭으로 검색하시거나 검색어를 확인해 보세요.</p>
                      </div>
                      <button
                        onClick={() => setFormulaSearchQuery('')}
                        className="px-4 py-2 bg-slateCustom-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-black rounded-xl border border-slate-800 hover:border-slate-700 transition-all cursor-pointer active:scale-95"
                      >
                        검색 필터 초기화
                      </button>
                    </div>
                  )}

                  {formulaQuestions
                    .map((q, originalIdx) => ({ ...q, originalIdx }))
                    .filter(q => {
                      const titleMatch = (q.title || '').toLowerCase().includes(formulaSearchQuery.toLowerCase());
                      const questionMatch = (q.question || '').toLowerCase().includes(formulaSearchQuery.toLowerCase());
                      return titleMatch || questionMatch;
                    })
                    .map((q) => {
                      const idx = q.originalIdx;
                      const isRevd = !!formulaRevealed[idx];

                      return (
                      <div key={idx} className="formula-card-item bg-slateCustom-900 border border-slate-800 rounded-2xl p-5 space-y-3 scroll-mt-2 transition-all duration-300 hover:border-slate-700/50">
                        {/* Q Title Row (Q{idx + 1} 배지와 제목, 수정창, 삭제버튼이 한 행에 위치) */}
                        <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                          <div className="flex items-center gap-2 flex-grow min-w-0">
                            {/* Q 번호 배지 */}
                            <span className="text-[11px] font-black bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700/50 shrink-0 select-none">
                              Q{idx + 1}
                            </span>

                            {/* 제목 및 편집기 */}
                            {editingFormulaIdx === idx ? (
                              <div className="flex items-center gap-2 flex-grow min-w-0">
                                <input
                                  type="text"
                                  value={editingFormulaText}
                                  onChange={(e) => setEditingFormulaText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const trimmed = editingFormulaText.trim();
                                      if (trimmed) {
                                        setFormulaQuestions(prev => {
                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item);
                                          handleSaveFormulaQuestions(updated, false);
                                          return updated;
                                        });
                                        setEditingFormulaIdx(null);
                                        showNotification('공식 제목이 저장되었습니다.', 'success');
                                      }
                                    } else if (e.key === 'Escape') {
                                      setEditingFormulaIdx(null);
                                    }
                                  }}
                                  className="bg-slateCustom-950 border border-slate-700 text-white text-[16px] font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-rose-500 w-full max-w-[360px]"
                                  autoFocus
                                />
                                <button
                                  onClick={() => {
                                    const trimmed = editingFormulaText.trim();
                                    if (trimmed) {
                                      setFormulaQuestions(prev => {
                                        const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item);
                                        handleSaveFormulaQuestions(updated, false);
                                        return updated;
                                      });
                                      setEditingFormulaIdx(null);
                                      showNotification('공식 제목이 저장되었습니다.', 'success');
                                    }
                                  }}
                                  className="px-2 py-1 bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded hover:bg-emerald-800/60 transition-colors shrink-0 cursor-pointer"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={() => setEditingFormulaIdx(null)}
                                  className="px-2 py-1 bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold rounded hover:bg-slate-700 transition-colors shrink-0 cursor-pointer"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 min-w-0 max-w-[85%] group">
                                <span 
                                  onClick={() => {
                                    setEditingFormulaIdx(idx);
                                    setEditingFormulaText(q.title || q.question || '');
                                  }}
                                  className="text-[17px] font-extrabold text-white leading-snug truncate cursor-pointer hover:text-rose-400 hover:underline transition-all"
                                  title="클릭하여 공식 제목 수정"
                                >
                                  <LatexRenderer text={q.question || q.title} katexLoaded={katexLoaded} />
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingFormulaIdx(idx);
                                    setEditingFormulaText(q.title || q.question || '');
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white rounded transition-opacity cursor-pointer shrink-0"
                                  title="공식 제목 수정"
                                >
                                  <Edit2 size={12} />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* 액션 버튼 그룹 (리프레쉬 & 삭제) - 동일한 행높이에 배치 */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* 리프레쉬 버튼 */}
                            <button
                              onClick={() => handleRefreshFormula(idx)}
                              disabled={refreshingFormulaIdx === idx}
                              className={`p-1.5 rounded-lg border border-transparent text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 transition-all active:scale-95 cursor-pointer flex items-center justify-center ${
                                refreshingFormulaIdx === idx ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              title="AI를 통해 공식 제목, 핵심개념, 기호정의를 다시 분석하여 재생성"
                            >
                              <RefreshCw 
                                size={14} 
                                className={refreshingFormulaIdx === idx ? 'animate-spin text-brand-400' : ''} 
                              />
                            </button>

                            {/* 삭제 버튼 */}
                            <button
                              onClick={() => {
                                if (window.confirm(`[${q.title || `Q${idx + 1}`}] 공식을 필수공식 퀴즈 리스트에서 삭제하시겠습니까?`)) {
                                  const updated = formulaQuestions.filter((_, i) => i !== idx);
                                  latestFormulaQuestionsRef.current = updated;
                                  setFormulaQuestions(updated);
                                  handleSaveFormulaQuestions(updated, false);
                                  setFormulaRevealed(prev => {
                                    const next = { ...prev };
                                    delete next[idx];
                                    return next;
                                  });
                                  showNotification(`[${q.title || `Q${idx + 1}`}] 공식이 삭제되었습니다.`, 'info');
                                }
                              }}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                              title="이 공식 문제를 평가 리스트에서 삭제"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Subjective Reveal */}
                        {!isRevd ? (
                          <button
                            onClick={() => setFormulaRevealed(prev => ({ ...prev, [idx]: true }))}
                            className="w-full py-3 border-2 border-dashed border-slate-600 hover:border-rose-500 rounded-xl text-xs font-bold text-slate-400 hover:text-rose-300 transition-all duration-200"
                          >
                            💡 머릿속으로 답안을 구성한 뒤 → 정답 확인
                          </button>
                        ) : (
                          <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4 space-y-3 relative animate-scale-up">
                            <div className="flex justify-between items-center text-[11px] font-black text-amber-400 mb-1">
                              <span>📝 공식 및 기호 정의</span>
                              <button
                                onClick={() => setFormulaRevealed(prev => ({ ...prev, [idx]: false }))}
                                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer font-bold"
                                title="답안 접기"
                              >
                                접기 ✕
                              </button>
                            </div>
                            
                            {q.concept && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-black text-indigo-400">💡 핵심 개념: </span>
                                <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.concept} katexLoaded={katexLoaded} /></div>
                              </div>
                            )}

                            {q.formula && (
                              <div className="space-y-1 pt-2 border-t border-amber-500/10">
                                <span className="text-[10px] font-black text-rose-400 font-extrabold">📐 대표 공식 및 기호 정의: </span>
                                <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap"><LatexRenderer text={q.formula} katexLoaded={katexLoaded} /></div>
                              </div>
                            )}

                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Vertical Navigation Divider Controller (PC Only) */}
            <div className="hidden md:flex flex-col items-center relative z-20 w-0 h-full">
              <div 
                style={{ top: '33.33%', transform: 'translate(-50%, -50%)' }}
                className="absolute flex flex-col gap-2 p-1.5 rounded-full bg-slateCustom-950/90 border border-slate-800 backdrop-blur-md shadow-2xl shadow-black/80 select-none"
              >
                <button 
                  onClick={() => handleScrollFormula('up')}
                  className="p-2.5 rounded-full bg-slate-800/80 hover:bg-rose-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-95 shadow-md border border-slate-700/50 hover:border-rose-500 hover:shadow-rose-600/30 cursor-pointer flex items-center justify-center group"
                  title="이전 공식으로 스크롤"
                >
                  <ChevronUp size={16} className="group-hover:-translate-y-0.5 transition-transform" />
                </button>
                <div className="w-4 border-t border-slate-800/80 mx-auto"></div>
                <button 
                  onClick={() => handleScrollFormula('down')}
                  className="p-2.5 rounded-full bg-slate-800/80 hover:bg-rose-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-95 shadow-md border border-slate-700/50 hover:border-rose-500 hover:shadow-rose-600/30 cursor-pointer flex items-center justify-center group"
                  title="다음 공식으로 스크롤"
                >
                  <ChevronDown size={16} className="group-hover:translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right: Gemini Sidebar for Formula */}
            <div className="w-full max-w-full min-w-0 shrink-0 md:w-1/2 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col">
              <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slateCustom-950 flex-shrink-0">
                <Brain size={16} className="text-rose-500" />
                <span className="text-xs font-bold text-slate-200">제미나이 실시간 공식 튜터</span>
              </div>
              
              <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-[11px] text-slate-400">공식 유도 과정이나 실제 계산 문제 등<br/>무엇이든 실시간으로 설명해 드립니다!</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`text-[10px] mb-1 font-bold ${msg.role === 'user' ? 'text-indigo-400 mr-1' : 'text-rose-400 ml-1'}`}>
                        {msg.role === 'user' ? '나' : 'Gemini'}
                      </div>
                      <div className={`px-4 py-2.5 rounded-2xl max-w-[95%] text-sm leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-indigo-600 text-white rounded-br-sm' 
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm prose prose-invert prose-base max-w-none'
                      }`}>
                        {msg.role === 'user' ? (
                          <div className="flex flex-col gap-2">
                            {msg.image && (
                              <img 
                                src={`data:${msg.image.mimeType};base64,${msg.image.data}`} 
                                alt="첨부 이미지" 
                                className="max-w-full max-h-48 rounded-xl object-contain border border-indigo-455 shadow-md"
                              />
                            )}
                            {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                          </div>
                        ) : (
                          <LatexRenderer 
                            text={msg.text} 
                            katexLoaded={katexLoaded} 
                            onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, msg.text)}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex flex-col items-start">
                    <div className="text-[10px] mb-1 font-bold text-rose-400 ml-1">Gemini</div>
                    <div className="px-3 py-2 rounded-2xl bg-slate-800 text-slate-400 border border-slate-700 rounded-bl-sm text-xs flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce delay-75"></div>
                      <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce delay-150"></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-slate-800 bg-slateCustom-950 flex-shrink-0">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} 
                  onPaste={handlePasteImage}
                  className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 flex flex-col gap-2 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500/20 transition-all shadow-lg"
                >
                  {/* 첨부 이미지 썸네일 (입력창 내부 상단 배치) */}
                  {attachedImage && (
                    <div className="relative w-12 h-12 rounded-xl border border-slate-650 shadow-md overflow-hidden group animate-fade-in ml-1 mt-1 flex-shrink-0">
                      <img 
                        src={`data:${attachedImage.mimeType};base64,${attachedImage.data}`} 
                        alt="첨부 이미지" 
                        className="w-full h-full object-cover"
                      />
                      <button 
                        type="button" 
                        onClick={handleClearAttachedImage} 
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 hover:bg-black text-white rounded-full flex items-center justify-center transition-colors cursor-pointer"
                        title="이미지 삭제"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}

                  {/* 텍스트 입력창 (보더 없음) */}
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onPaste={handlePasteImage}
                      placeholder={attachedImage ? "이미지와 함께 보낼 질문 입력..." : "공식 유도 및 개념 질문..."}
                      disabled={isChatLoading}
                      className="w-full bg-transparent border-0 p-1 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-0"
                    />
                  </div>

                  {/* 하단 컨트롤 바 */}
                  <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 px-1">
                    {/* 왼쪽: 이미지 첨부 클립 버튼 */}
                    <div className="flex items-center gap-2">
                      <input 
                        type="file" 
                        id="formula-image-upload" 
                        accept="image/*" 
                        onChange={handleImageAttachment}
                        className="hidden" 
                      />
                      <label 
                        htmlFor="formula-image-upload" 
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 transition-all cursor-pointer flex items-center justify-center"
                        title="스크린샷/이미지 첨부"
                      >
                        <Paperclip size={14} />
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium tracking-tight">Gemini 2.0 Flash (High)</span>
                    </div>

                    {/* 오른쪽: 전송 버튼 */}
                    <button
                      type="submit"
                      disabled={(!chatInput.trim() && !attachedImage) || isChatLoading}
                      className="w-7 h-7 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:hover:bg-rose-600 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-md shadow-rose-600/10 active:scale-95"
                    >
                      <Send size={11} className="text-white" />
                    </button>
                  </div>
                </form>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ===== ESSENTIAL FORMULA THEORY DERIVATION MODAL ===== */}
      {showTheoryExam && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 bg-slateCustom-950 border-b border-indigo-500/20 flex-shrink-0 gap-4">
            <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
              <div className="p-2 bg-indigo-950/80 text-indigo-400 rounded-xl flex-shrink-0 mt-0.5">
                <Brain size={20} />
              </div>
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider whitespace-nowrap">공식 이론유도</span>
                  {formulaQuestions.length > 0 && (
                    <span className="text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold">
                      {formulaQuestions.length}개 핵심공식
                    </span>
                  )}
                  {/* Mobile Swipe Hint */}
                  <span className="inline-flex md:hidden text-[9px] bg-indigo-950/60 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full font-black animate-pulse whitespace-nowrap">
                    ← 좌우 쓸어 넘겨 튜터 대화 보기
                  </span>
                </div>
                <h3 className="font-bold text-white text-xs sm:text-sm truncate sm:whitespace-normal">
                  전공 필수 공식 이론 유도 및 상세 증명 학습
                </h3>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end">
              <button
                onClick={() => {
                  handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, false); // 닫기를 눌러도 저장후 닫기
                  savedTheoryScroll.current = theoryBodyRef.current?.scrollTop || 0;
                  setShowTheoryExam(false);
                }}
                className="px-4 py-2 bg-slateCustom-900 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center"
                title="저장 후 닫기"
              >
                닫기
              </button>
              <button
                onClick={() => {
                  handleSaveTheoryQuestions(latestTheoryQuestionsRef.current, true); // 저장 버튼: 저장만 하고 닫지는 않음
                }}
                className="px-4 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 hover:text-white border border-emerald-500/20 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 flex-grow sm:flex-grow-0 text-center flex items-center justify-center gap-1.5"
                title="이론 변경사항 실시간 저장"
              >
                <Save size={12} />
                저장
              </button>
            </div>
          </div>

          {/* Sub-header tabs for Mobile */}
          <div className="flex md:hidden bg-slateCustom-950 px-5 py-2 border-b border-indigo-500/10 justify-center flex-shrink-0">
            <div className="flex bg-slateCustom-900 p-1 rounded-xl w-full max-w-[320px] border border-slate-800">
              <button
                onClick={() => {
                  setTheoryMobileTab('list');
                  theorySplitContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  theoryMobileTab === 'list'
                    ? 'bg-indigo-650 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                공식 리스트
              </button>
              <button
                onClick={() => {
                  setTheoryMobileTab('tutor');
                  const containerWidth = theorySplitContainerRef.current?.clientWidth || 0;
                  theorySplitContainerRef.current?.scrollTo({ left: containerWidth, behavior: 'smooth' });
                }}
                className={`flex-1 py-1.5 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                  theoryMobileTab === 'tutor'
                    ? 'bg-indigo-650 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                제미나이 AI 튜터
              </button>
            </div>
          </div>

          {/* Modal Container (Mobile: Horizontal Swipe, PC: Side-by-Side) */}
          <div 
            ref={theorySplitContainerRef}
            onScroll={(e) => {
              const scrollLeft = e.currentTarget.scrollLeft;
              const clientWidth = e.currentTarget.clientWidth;
              if (clientWidth > 0) {
                const activeTab = scrollLeft > clientWidth / 2 ? 'tutor' : 'list';
                setTheoryMobileTab(activeTab);
              }
            }}
            className="flex-1 flex flex-row overflow-x-auto md:overflow-x-hidden overflow-y-hidden snap-x snap-mandatory scroll-smooth min-h-0 w-full select-none scrollbar-none"
          >
            
            {/* Left: Theory list */}
            <div ref={theoryBodyRef} className="w-full max-w-full min-w-0 shrink-0 md:w-1/2 md:shrink snap-start h-full overflow-y-auto overflow-x-hidden p-5 space-y-4 scroll-smooth">
              <div className="max-w-3xl mx-auto space-y-5">
                
                {/* PDF Drag & Drop Upload Area for Theory */}
                <div 
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('border-indigo-500', 'bg-indigo-950/20');
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-950/20');
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-950/20');
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      await handleUploadTheoryPdf(e.dataTransfer.files[0]);
                    }
                  }}
                  className="relative group border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slateCustom-900/40 rounded-2xl p-5 text-center transition-all duration-300 backdrop-blur-sm shadow-inner overflow-hidden cursor-pointer"
                >
                  <input 
                    type="file" 
                    accept=".pdf,.html,.htm"
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    onChange={async (e) => {
                      if (e.target.files && e.target.files[0]) {
                        await handleUploadTheoryPdf(e.target.files[0]);
                      }
                    }}
                  />
                  {uploadingTheoryPdf ? (
                    <div className="flex flex-col items-center justify-center py-2 gap-3">
                      <div className="w-8 h-8 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                      <div className="text-xs font-black text-indigo-400">PDF 문서 텍스트 정밀 분석 중...</div>
                      <p className="text-[10px] text-slate-500">핵심 이론 공식 및 상세 증명 유도 과정을 생성하고 있습니다.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-2 gap-2">
                      <div className="p-3 bg-indigo-950/40 text-indigo-400 rounded-xl group-hover:scale-110 transition-transform duration-300 border border-indigo-500/10">
                        <UploadCloud size={22} className="text-indigo-400" />
                      </div>
                      <div className="text-xs font-black text-slate-300">기술사 교재/수식 PDF 및 HTML 업로드</div>
                      <p className="text-[10px] text-slate-500">여기에 파일을 끌어다 놓거나 클릭하여 새로운 이론 유도를 AI가 파싱하여 학습에 편입합니다.</p>
                    </div>
                  )}
                </div>

                {/* Theory Questions Map */}
                {theoryQuestions.map((q, idx) => {
                  const isRevealed = !!theoryRevealed[idx];
                  return (
                    <div key={idx} className="formula-card-item bg-slateCustom-900 border border-slate-800 rounded-2xl p-5 space-y-4 transition-all duration-300 hover:border-slate-700/50">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] font-black bg-indigo-950/80 text-indigo-400 px-2.5 py-1 rounded-lg border border-indigo-500/20 shrink-0 select-none">
                            이론 {idx + 1}
                          </span>
                          <h4 className="text-[15px] font-extrabold text-white leading-snug truncate">
                            <LatexRenderer text={q.title} katexLoaded={katexLoaded} />
                          </h4>
                        </div>
                        
                        {/* Actions (Refresh, Trash) */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleRefreshTheory(idx)}
                            disabled={refreshingTheoryIdx === idx}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all cursor-pointer disabled:opacity-50"
                            title="이론 증명 AI 재정리 및 갱신"
                          >
                            <RefreshCw size={14} className={refreshingTheoryIdx === idx ? "animate-spin" : ""} />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`[${q.title || `이론 ${idx + 1}`}] 이론 유도를 리스트에서 영구히 삭제하시겠습니까?`)) {
                                const updated = theoryQuestions.filter((_, i) => i !== idx);
                                latestTheoryQuestionsRef.current = updated;
                                setTheoryQuestions(updated);
                                handleSaveTheoryQuestions(updated, false);
                                setTheoryRevealed(prev => {
                                  const updated = { ...prev };
                                  delete updated[idx];
                                  return updated;
                                });
                                showNotification('선택한 이론 유도가 성공적으로 삭제되었습니다.', 'info');
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                            title="이론 삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Collapsible Answer & Concept */}
                      <div className="space-y-3">
                        {q.concept && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-indigo-400">💡 직관적 의미: </span>
                            <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.concept} katexLoaded={katexLoaded} /></div>
                          </div>
                        )}

                        {q.assumptions && (
                          <div className="space-y-1 pt-1">
                            <span className="text-[10px] font-black text-amber-400">📋 가정 조건: </span>
                            <div className="text-sm text-slate-200 leading-relaxed"><LatexRenderer text={q.assumptions} katexLoaded={katexLoaded} /></div>
                          </div>
                        )}

                        {isRevealed ? (
                          <div className="space-y-3 pt-3 border-t border-slate-800/80 animate-fade-in">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-indigo-300 font-extrabold">📐 상세 이론 유도 및 공학적 증명: </span>
                              <button
                                onClick={() => setTheoryRevealed(prev => ({ ...prev, [idx]: false }))}
                                className="text-[10px] font-bold text-slate-500 hover:text-white px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded-md transition-all cursor-pointer active:scale-95"
                              >
                                접기 ✕
                              </button>
                            </div>
                            <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap"><LatexRenderer text={q.formula} katexLoaded={katexLoaded} /></div>
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-slate-800/80">
                            <button
                              onClick={() => setTheoryRevealed(prev => ({ ...prev, [idx]: true }))}
                              className="w-full py-2.5 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 hover:text-white border border-indigo-500/20 text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 shadow-sm"
                            >
                              💡 이론 유도 과정 및 상세 증명 확인하기
                            </button>
                          </div>
                        )}
                      </div>

                      {/* AI Theory Derivation Sidebar Request Button */}
                      <div className="pt-3 border-t border-slate-800/80 flex justify-end">
                        <button
                          onClick={() => handleAskTheoryDerivation(q.title, q.formula || '')}
                          disabled={isChatLoading}
                          className="w-full py-2 bg-slateCustom-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800/80 text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <Brain size={13} className={isChatLoading ? "animate-pulse" : ""} />
                          <span>💬 실시간 AI 튜터와 1:1 심층 문답하기</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Vertical Navigation Divider Controller (PC Only) */}
            <div className="hidden md:flex flex-col items-center relative z-20 w-0 h-full">
              <div 
                style={{ top: '33.33%', transform: 'translate(-50%, -50%)' }}
                className="absolute flex flex-col gap-2 p-1.5 rounded-full bg-slateCustom-950/90 border border-slate-800 backdrop-blur-md shadow-2xl shadow-black/80 select-none"
              >
                <button 
                  onClick={() => handleScrollTheory('up')}
                  className="p-2.5 rounded-full bg-slate-800/80 hover:bg-indigo-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-95 shadow-md border border-slate-700/50 hover:border-indigo-500 hover:shadow-indigo-600/30 cursor-pointer flex items-center justify-center group"
                  title="이전 공식으로 스크롤"
                >
                  <ChevronUp size={16} className="group-hover:-translate-y-0.5 transition-transform" />
                </button>
                <div className="w-4 border-t border-slate-800/80 mx-auto"></div>
                <button 
                  onClick={() => handleScrollTheory('down')}
                  className="p-2.5 rounded-full bg-slate-800/80 hover:bg-indigo-600 text-slate-300 hover:text-white transition-all duration-300 active:scale-95 shadow-md border border-slate-700/50 hover:border-indigo-500 hover:shadow-indigo-600/30 cursor-pointer flex items-center justify-center group"
                  title="다음 공식으로 스크롤"
                >
                  <ChevronDown size={16} className="group-hover:translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Right: Gemini Sidebar for Theory */}
            <div className="w-full max-w-full min-w-0 shrink-0 md:w-1/2 md:shrink snap-start h-full bg-slate-900 border-l border-slate-800 flex flex-col">
              <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slateCustom-950 flex-shrink-0">
                <Brain size={16} className="text-indigo-500" />
                <span className="text-xs font-bold text-slate-200">제미나이 실시간 이론 유도 튜터</span>
              </div>
              
              <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-[11px] text-slate-400">학습하고 싶으신 공식을 왼쪽에서 선택하여<br/>이론 유도 및 상세 증명을 요청해 보세요!</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`text-[10px] mb-1 font-bold ${msg.role === 'user' ? 'text-indigo-400 mr-1' : 'text-indigo-400 ml-1'}`}>
                        {msg.role === 'user' ? '나' : 'Gemini'}
                      </div>
                      <div className={`px-4 py-2.5 rounded-2xl max-w-[95%] text-sm leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-indigo-600 text-white rounded-br-sm' 
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm prose prose-invert prose-base max-w-none'
                      }`}>
                        {msg.role === 'user' ? (
                          <div className="flex flex-col gap-2">
                            {msg.image && (
                              <img 
                                src={`data:${msg.image.mimeType};base64,${msg.image.data}`} 
                                alt="첨부 이미지" 
                                className="max-w-full max-h-48 rounded-xl object-contain border border-indigo-455 shadow-md"
                              />
                            )}
                            {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                          </div>
                        ) : (
                          <LatexRenderer 
                            text={msg.text} 
                            katexLoaded={katexLoaded} 
                            onAddFormula={(mathContent) => handleAddSpecificFormula(mathContent, msg.text)}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex flex-col items-start">
                    <div className="text-[10px] mb-1 font-bold text-indigo-400 ml-1">Gemini</div>
                    <div className="px-3 py-2 rounded-2xl bg-slate-800 text-slate-400 border border-slate-700 rounded-bl-sm text-xs flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-75"></div>
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-150"></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-slate-800 bg-slateCustom-950 flex-shrink-0">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} 
                  onPaste={handlePasteImage}
                  className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 flex flex-col gap-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all shadow-lg"
                >
                  {attachedImage && (
                    <div className="relative w-12 h-12 rounded-xl border border-slate-650 shadow-md overflow-hidden group animate-fade-in ml-1 mt-1 flex-shrink-0">
                      <img 
                        src={`data:${attachedImage.mimeType};base64,${attachedImage.data}`} 
                        alt="첨부 이미지" 
                        className="w-full h-full object-cover"
                      />
                      <button 
                        type="button" 
                        onClick={handleClearAttachedImage} 
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 hover:bg-black text-white rounded-full flex items-center justify-center transition-colors cursor-pointer"
                        title="이미지 삭제"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}

                  <div className="flex-grow">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onPaste={handlePasteImage}
                      placeholder={attachedImage ? "이미지와 함께 보낼 질문 입력..." : "공식 유도 및 개념 질문..."}
                      disabled={isChatLoading}
                      className="w-full bg-transparent border-0 p-1 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-0"
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 px-1">
                    <div className="flex items-center gap-2">
                      <input 
                        type="file" 
                        id="theory-image-upload" 
                        accept="image/*" 
                        onChange={handleImageAttachment}
                        className="hidden" 
                      />
                      <label 
                        htmlFor="theory-image-upload" 
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-700/60 transition-all cursor-pointer flex items-center justify-center"
                        title="스크린샷/이미지 첨부"
                      >
                        <Paperclip size={14} />
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium tracking-tight">Gemini 2.0 Flash (High)</span>
                    </div>

                    <button
                      type="submit"
                      disabled={(!chatInput.trim() && !attachedImage) || isChatLoading}
                      className="w-7 h-7 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-md shadow-indigo-600/10 active:scale-95"
                    >
                      <Send size={11} className="text-white" />
                    </button>
                  </div>
                </form>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
