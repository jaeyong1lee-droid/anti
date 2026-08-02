import React, { useState } from 'react';
import { 
  HelpCircle, 
  Sparkles, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  X, 
  Award, 
  BookOpen, 
  Send, 
  FileText, 
  Flame,
  ChevronRight
} from 'lucide-react';
import { LatexRenderer } from './LatexRenderer';

export function InteractiveQuizModal({ item, type, onClose }) {
  const [level, setLevel] = useState('standard'); // 'basic', 'standard', 'deep'
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [userAnswers, setUserAnswers] = useState({});
  const [isGrading, setIsGrading] = useState(false);
  const [gradingResults, setGradingResults] = useState(null);
  const [error, setError] = useState(null);

  const getTypeLabel = () => {
    switch (type) {
      case 'overview': return { name: '개요 퀴즈', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
      case 'table': return { name: '비교표 퀴즈', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' };
      case 'acronym': return { name: '두문자 퀴즈', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' };
      case 'formula': return { name: '공식 퀴즈', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
      default: return { name: '항목 퀴즈', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' };
    }
  };

  const handleGenerateQuestions = async () => {
    setLoading(true);
    setError(null);
    setGradingResults(null);
    setUserAnswers({});
    try {
      const res = await fetch('/api/quiz/generate-item-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, type, level })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '퀴즈 문제 생성을 실패했습니다.');
      }
      setQuestions(data.questions || []);
    } catch (err) {
      console.error('Failed to generate item questions:', err);
      setError(err.message || '문제 생성 도중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleGradeAnswers = async () => {
    setIsGrading(true);
    setError(null);
    try {
      const res = await fetch('/api/quiz/grade-item-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item,
          type,
          questions,
          userAnswers
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '채점을 완료하지 못했습니다.');
      }
      setGradingResults(data);
    } catch (err) {
      console.error('Failed to grade item answers:', err);
      setError(err.message || '채점 처리 중 오류가 발생했습니다.');
    } finally {
      setIsGrading(false);
    }
  };

  const typeInfo = getTypeLabel();

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-[10px] font-black rounded-md border ${typeInfo.color}`}>
                  {typeInfo.name}
                </span>
                <h3 className="font-extrabold text-base sm:text-lg text-white">
                  {item?.title || '항목 맞춤 퀴즈'}
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                AI 기반 즉시 문제 출제 및 자동 채점 시스템
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          
          {/* Level Selector & Action Panel */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 shrink-0 flex items-center gap-1">
                <Flame size={14} className="text-amber-400" />
                출제 난이도:
              </span>
              <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1 gap-1">
                {[
                  { id: 'basic', label: '기본 (1문제)' },
                  { id: 'standard', label: '표준 (3문제)' },
                  { id: 'deep', label: '심화 (5문제)' }
                ].map((lvl) => (
                  <button
                    key={lvl.id}
                    onClick={() => setLevel(lvl.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      level === lvl.id
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerateQuestions}
              disabled={loading}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>AI 문제 출제 중...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>{questions.length > 0 ? '문제 다시 출제하기' : '퀴즈 문제 출제하기'}</span>
                </>
              )}
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-4 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-200 text-xs font-semibold flex items-center gap-2">
              <XCircle size={16} className="text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Empty State */}
          {questions.length === 0 && !loading && !error && (
            <div className="py-12 flex flex-col items-center justify-center text-center bg-slate-950/30 border border-dashed border-slate-800 rounded-2xl p-8">
              <BookOpen size={48} className="text-slate-600 mb-3" />
              <h4 className="text-sm font-bold text-slate-300 mb-1">출제할 난이도를 선택한 후 상단 버튼을 눌러주세요</h4>
              <p className="text-xs text-slate-500 max-w-md">
                선택한 {typeInfo.name}의 학습 데이터를 기반으로 즉시 서술형, 계산형, 빈칸채우기 등 다양한 문제와 자동 채점 기능을 제공합니다.
              </p>
            </div>
          )}

          {/* Questions List */}
          {questions.length > 0 && (
            <div className="space-y-6">
              
              {/* Overall Score Banner (If graded) */}
              {gradingResults && (
                <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl border shadow-inner ${
                      gradingResults.totalScore >= 80 
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                        : gradingResults.totalScore >= 60
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}>
                      {gradingResults.totalScore}점
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Award size={18} className="text-indigo-400" />
                        <h4 className="font-extrabold text-white text-base">채점 완료 결과 보고서</h4>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        {gradingResults.feedbackSummary || '제출하신 답안에 대한 종합 채점 및 분석입니다.'}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-900/40 border border-indigo-700/50 text-indigo-200">
                    획득점수: {gradingResults.earnedPoints} / {gradingResults.maxPoints}점
                  </div>
                </div>
              )}

              {/* Individual Question Cards */}
              {questions.map((q, idx) => {
                const gradeInfo = gradingResults?.questionResults?.[idx];

                return (
                  <div 
                    key={idx} 
                    className={`bg-slate-950/60 border rounded-2xl p-5 transition-all space-y-4 ${
                      gradeInfo 
                        ? gradeInfo.isCorrect 
                          ? 'border-emerald-500/40 bg-emerald-950/10' 
                          : 'border-rose-500/40 bg-rose-950/10'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Question Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span className="px-2.5 py-1 bg-indigo-950 text-indigo-300 border border-indigo-800/60 rounded-lg text-xs font-black shrink-0">
                          Q{idx + 1}
                        </span>
                        <div className="font-bold text-sm sm:text-base text-slate-100 leading-relaxed pt-0.5">
                          <LatexRenderer text={q.question} isMarkdown={true} />
                        </div>
                      </div>
                      
                      {gradeInfo && (
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 shrink-0 ${
                          gradeInfo.isCorrect 
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {gradeInfo.isCorrect ? <CheckCircle size={14} /> : <XCircle size={14} />}
                          <span>{gradeInfo.score}점</span>
                        </div>
                      )}
                    </div>

                    {/* Options (if multiple choice) */}
                    {q.options && q.options.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                        {q.options.map((opt, oIdx) => (
                          <button
                            key={oIdx}
                            onClick={() => setUserAnswers(prev => ({ ...prev, [idx]: opt }))}
                            className={`p-3 rounded-xl text-left text-xs font-semibold border transition-all cursor-pointer flex items-center gap-2 ${
                              userAnswers[idx] === opt
                                ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-md'
                                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-850'
                            }`}
                          >
                            <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                              {oIdx + 1}
                            </span>
                            <span className="flex-1 leading-snug">{opt}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      /* Subjective Text Area */
                      <div className="pt-2">
                        <textarea
                          rows={3}
                          value={userAnswers[idx] || ''}
                          onChange={(e) => setUserAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                          placeholder="답안을 자유롭게 기입하세요..."
                          className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-y font-medium"
                        />
                      </div>
                    )}

                    {/* Grading Result Feedback */}
                    {gradeInfo && (
                      <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2 text-xs">
                        {gradeInfo.feedback && (
                          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-slate-300">
                            <span className="font-bold text-indigo-400 block mb-1">💡 AI 채점 피드백</span>
                            <LatexRenderer text={gradeInfo.feedback} isMarkdown={true} />
                          </div>
                        )}
                        {gradeInfo.modelAnswer && (
                          <div className="p-3 bg-indigo-950/30 rounded-xl border border-indigo-900/50 text-indigo-200">
                            <span className="font-bold text-indigo-300 block mb-1">🔑 모범 답안</span>
                            <LatexRenderer text={gradeInfo.modelAnswer} isMarkdown={true} />
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

        {/* Footer Actions */}
        {questions.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              작성된 답안은 AI 채점 가이드라인을 통해 공정하게 평가됩니다.
            </span>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                닫기
              </button>

              <button
                onClick={handleGradeAnswers}
                disabled={isGrading}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/40 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGrading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>채점 진행 중...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>답안 제출 및 자가 채점</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
