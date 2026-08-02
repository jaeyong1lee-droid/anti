import React, { useState, useMemo, useRef } from 'react';
import { X, Sparkles, Eye, EyeOff, BookOpen, CheckCircle, RefreshCw, ChevronRight } from 'lucide-react';
import { TableQuiz } from './TableQuiz';
import { AcronymQuiz } from './AcronymQuiz';
import { parseMarkdownTable } from '../utils/latexUtils';
import { areCellsEqual } from '../utils/renderingHelpers';
import { LatexRenderer } from './LatexRenderer';

const parseHtmlTable = (htmlStr) => {
  if (!htmlStr) return { headers: [], rows: [] };
  if (typeof htmlStr === 'object' && htmlStr !== null) {
    if (Array.isArray(htmlStr.headers) && Array.isArray(htmlStr.rows)) {
      return { headers: htmlStr.headers, rows: htmlStr.rows };
    }
    if (htmlStr.tableData && Array.isArray(htmlStr.tableData.headers) && Array.isArray(htmlStr.tableData.rows)) {
      return { headers: htmlStr.tableData.headers, rows: htmlStr.tableData.rows };
    }
  }

  const str = typeof htmlStr === 'string' ? htmlStr : String(htmlStr);

  if (str.trim().startsWith('{') || str.trim().startsWith('[')) {
    try {
      const parsedJson = JSON.parse(str);
      if (parsedJson && Array.isArray(parsedJson.headers) && Array.isArray(parsedJson.rows)) {
        return { headers: parsedJson.headers, rows: parsedJson.rows };
      }
      if (parsedJson && parsedJson.tableData && Array.isArray(parsedJson.tableData.headers) && Array.isArray(parsedJson.tableData.rows)) {
        return { headers: parsedJson.tableData.headers, rows: parsedJson.tableData.rows };
      }
    } catch (e) {}
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(str, 'text/html');
  
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
  const dataTrs = thead ? allTrs.filter(tr => !tr.closest('thead')) : allTrs.slice(1);

  for (const tr of dataTrs) {
    const tds = Array.from(tr.querySelectorAll('td, th')).map(el => el.textContent.trim());
    if (tds.length > 0) rows.push(tds);
  }

  return { headers: ths, rows };
};

export function InteractiveQuizModal({ 
  item, 
  type, 
  onClose, 
  katexLoaded = true, 
  itemList = [], 
  onSelectNextItem 
}) {
  const [tableAnswers, setTableAnswers] = useState({});
  const tableAnswersRef = useRef({});
  const [revealed, setRevealed] = useState(false);
  const [tableGradingResults, setTableGradingResults] = useState({});
  const [gradingLoading, setGradingLoading] = useState(false);
  const [showExplanation, setShowExplanation] = useState(true);

  // Find index of current item in list
  const currentItemIndex = useMemo(() => {
    if (!itemList || itemList.length === 0) return -1;
    return itemList.findIndex(it => (it.id && item?.id) ? it.id === item.id : it.title === item?.title);
  }, [itemList, item]);

  // Handle switching to next item
  const handleNextItem = () => {
    if (!itemList || itemList.length <= 1) return;
    const nextIdx = (currentItemIndex + 1) % itemList.length;
    const nextItem = itemList[nextIdx];
    
    // Reset local inputs & states
    setTableAnswers({});
    setRevealed(false);
    setTableGradingResults({});

    if (onSelectNextItem) {
      onSelectNextItem(nextItem);
    }
  };

  // Build exact question object q according to type & actual item structure
  const q = useMemo(() => {
    if (!item) return null;

    if (type === 'table') {
      const answers = {};
      let parsed = parseHtmlTable(item.html || item.content);
      
      if (!parsed.rows || parsed.rows.length === 0) {
        const mdParsed = parseMarkdownTable((item.content || '') + '\n' + (item.html || ''));
        if (mdParsed && mdParsed.tableData) {
          parsed = mdParsed.tableData;
        }
      }

      const headers = (parsed.headers && parsed.headers.length > 0) 
        ? parsed.headers 
        : ['구분', '항목 1', '항목 2'];

      const compRows = (parsed.rows || []).map((row, rIdx) => {
        return row.map((cell, cIdx) => {
          if (cIdx === 0) return cell;
          const inputId = `INPUT_${rIdx}_${cIdx}`;
          answers[inputId] = cell;
          return `[${inputId}]`;
        });
      });

      return {
        id: item.id || `table_${Date.now()}`,
        type: '주관식 (표채우기)',
        subtype: '표채우기',
        title: item.title || '비교표 빈칸 채우기',
        question: item.title || '비교표 빈칸 채우기',
        content: item.html || item.content || '',
        explanation: item.content || item.explanation || '',
        tableData: {
          headers: headers,
          rows: compRows
        },
        rawHeaders: headers,
        rawRows: parsed.rows || [],
        answers: answers
      };
    } else if (type === 'acronym') {
      let mainData = item.tableData || null;
      let answers = item.answers ? { ...item.answers } : {};

      if (!mainData) {
        const itemsList = item.items || item.list || [];
        if (itemsList.length > 0) {
          const rows = itemsList.map((it, rIdx) => {
            const inputId = `INPUT_${rIdx}_1`;
            answers[inputId] = it.word || it.name || it.desc || '';
            return [it.char || it.letter || `${rIdx + 1}`, `[${inputId}]`, it.desc || ''];
          });
          mainData = {
            headers: ['구분', '암기단어', '연상문장/공학적의미'],
            rows: rows
          };
        } else {
          const titleStr = item.title || '';
          const chars = titleStr.split('');
          const rows = chars.map((c, rIdx) => {
            const inputId = `INPUT_${rIdx}_1`;
            answers[inputId] = item.content || '';
            return [c, `[${inputId}]`, item.content || ''];
          });
          mainData = {
            headers: ['두문자', '암기단어', '연상문장'],
            rows: rows
          };
        }
      }

      return {
        id: item.id || `acronym_${Date.now()}`,
        type: '주관식 (앞글자)',
        subtype: '앞글자',
        title: item.title || '두문자 암기 퀴즈',
        word: item.title || '',
        tableData: mainData,
        answers: answers,
        content: item.content || ''
      };
    } else if (type === 'overview') {
      const contentStr = typeof item.content === 'object' ? JSON.stringify(item.content) : (item.content || '');
      
      const answers = {
        'INPUT_0_1': item.content?.definition || contentStr,
        'INPUT_1_1': item.content?.mechanism || contentStr,
        'INPUT_2_1': item.content?.significance || contentStr
      };

      return {
        id: item.id || `overview_${Date.now()}`,
        type: 'overview',
        subtype: '개요',
        title: item.title || '개요/메커니즘 퀴즈',
        question: `[개요 작성/복습] ${item.title}`,
        concept: contentStr,
        explanation: contentStr,
        content: contentStr,
        answers: answers,
        tableData: {
          headers: ['구분', '핵심 기술 내용 (빈칸 입력)'],
          rows: [
            ['1. 학술적 정의', '[INPUT_0_1]'],
            ['2. 메커니즘', '[INPUT_1_1]'],
            ['3. 공학적 의미', '[INPUT_2_1]']
          ]
        }
      };
    }
    return null;
  }, [item, type]);

  const handleSubmit = async () => {
    setGradingLoading(true);
    try {
      const results = {};
      const answers = q?.answers || {};
      
      for (const key of Object.keys(answers)) {
        const userVal = tableAnswers[key] || tableAnswersRef.current?.[key] || '';
        const correctVal = answers[key] || '';
        const isMatch = areCellsEqual(userVal, correctVal);
        results[key] = {
          score: isMatch ? 100 : (userVal.trim().length > 0 ? 60 : 0),
          isCorrect: isMatch,
          correctAnswer: correctVal
        };
      }
      
      setTableGradingResults(results);
      setRevealed(true);
    } catch (err) {
      console.error('Grading error:', err);
    } finally {
      setGradingLoading(false);
    }
  };

  const handleGradeSingleCell = async (inputId, val) => {
    const correctVal = q?.answers?.[inputId] || '';
    const isMatch = areCellsEqual(val, correctVal);
    setTableGradingResults(prev => ({
      ...prev,
      [inputId]: {
        score: isMatch ? 100 : (val.trim().length > 0 ? 60 : 0),
        isCorrect: isMatch,
        correctAnswer: correctVal
      }
    }));
  };

  const getTypeBadge = () => {
    switch (type) {
      case 'overview': return { name: '개요 빈칸 퀴즈', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
      case 'table': return { name: '비교표 빈칸 퀴즈', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' };
      case 'acronym': return { name: '두문자 빈칸 퀴즈', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' };
      default: return { name: '빈칸 퀴즈', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' };
    }
  };

  const badge = getTypeBadge();

  if (!q) return null;

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-text">
      
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-[10px] font-black rounded-md border ${badge.color}`}>
                {badge.name}
              </span>
              <h3 className="font-extrabold text-sm sm:text-base text-white">
                {item?.title || '항목 맞춤 퀴즈'}
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              표 빈칸(Input)에 직접 답안을 입력하고 채점 및 답안·해설을 확인하세요.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRevealed(prev => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
              revealed 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{revealed ? '답안 숨기기' : '🔑 답안 전체 보기'}</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="창 닫기"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Body (Vertical Scroll Container for plenty of dragging & detailed review) */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
        
        {/* Table/Acronym Quiz Component */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 shadow-xl">
          {type === 'acronym' ? (
            <AcronymQuiz
              questionIdx={0}
              q={q}
              tableAnswers={tableAnswers}
              setTableAnswers={setTableAnswers}
              tableAnswersRef={tableAnswersRef}
              revealed={revealed}
              katexLoaded={katexLoaded}
              tableGradingResults={tableGradingResults}
              onSubmit={handleSubmit}
              gradingLoading={gradingLoading}
              gradeSingleAcronymCell={handleGradeSingleCell}
            />
          ) : (
            <TableQuiz
              questionIdx={0}
              q={q}
              tableAnswers={tableAnswers}
              setTableAnswers={setTableAnswers}
              tableAnswersRef={tableAnswersRef}
              revealed={revealed}
              katexLoaded={katexLoaded}
              tableGradingResults={tableGradingResults}
              onSubmit={handleSubmit}
              onGradeOverviewStep={handleSubmit}
              gradingLoading={gradingLoading}
              gradeSingleTableCell={handleGradeSingleCell}
            />
          )}
        </div>

        {/* Model Answer Table (Full Model Answers Display) */}
        {revealed && q.rawHeaders && q.rawRows && (
          <div className="bg-slate-900/80 border border-emerald-500/40 rounded-2xl p-5 shadow-2xl space-y-3 animate-fadeIn">
            <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm border-b border-emerald-500/20 pb-2">
              <CheckCircle size={16} />
              <span>🔑 전체 모범 답안 비교표</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800/80 text-slate-200 border-b border-slate-700">
                    {q.rawHeaders.map((h, idx) => (
                      <th key={idx} className="p-2.5 border-r border-slate-700 last:border-r-0 font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {q.rawRows.map((r, rIdx) => (
                    <tr key={rIdx} className="border-b border-slate-800/80 hover:bg-slate-800/40">
                      {r.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2.5 border-r border-slate-800 last:border-r-0 font-medium text-slate-200">
                          <LatexRenderer text={cell} katexLoaded={katexLoaded} isMarkdown={true} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Detailed Explanation / Notes (해설 및 추가 공학적 설명) */}
        {(q.explanation || item?.content) && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-indigo-400 font-extrabold text-sm">
                <BookOpen size={16} />
                <span>📖 상세 해설 및 학습 노하우</span>
              </div>
              <button
                onClick={() => setShowExplanation(prev => !prev)}
                className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                {showExplanation ? '접기' : '펼치기'}
              </button>
            </div>

            {showExplanation && (
              <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-2 pt-1 font-medium">
                <LatexRenderer 
                  text={typeof item.content === 'string' ? item.content : (q.explanation || '')} 
                  katexLoaded={katexLoaded} 
                  isMarkdown={true} 
                />
              </div>
            )}
          </div>
        )}

      </div>

      {/* Footer Controls (Left: 입력 초기화 + 전체 채점 및 확인 / Right: 다음 문제 + 닫기) */}
      <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0 shadow-inner select-none">
        
        {/* Left Side Group */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setTableAnswers({});
              setRevealed(false);
              setTableGradingResults({});
            }}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition-colors cursor-pointer active:scale-95"
          >
            입력 초기화
          </button>

          <button
            onClick={handleSubmit}
            disabled={gradingLoading}
            className="px-4.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
          >
            {gradingLoading ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            <span>전체 채점 및 확인</span>
          </button>
        </div>

        {/* Right Side Group */}
        <div className="flex items-center gap-2.5">
          {itemList && itemList.length > 1 && (
            <button
              onClick={handleNextItem}
              className="px-4.5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
              title="다음 항목 퀴즈 풀기"
            >
              <span>다음 문제</span>
              {currentItemIndex >= 0 && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-md font-black">
                  {currentItemIndex + 1}/{itemList.length}
                </span>
              )}
              <ChevronRight size={14} />
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>

      </div>

    </div>
  );
}
