import React, { useState, useMemo, useRef } from 'react';
import { X, Sparkles } from 'lucide-react';
import { TableQuiz } from './TableQuiz';
import { AcronymQuiz } from './AcronymQuiz';
import { parseMarkdownTable } from '../utils/latexUtils';
import { areCellsEqual } from '../utils/renderingHelpers';

export function InteractiveQuizModal({ item, type, onClose, katexLoaded = true }) {
  const [tableAnswers, setTableAnswers] = useState({});
  const tableAnswersRef = useRef({});
  const [revealed, setRevealed] = useState(false);
  const [tableGradingResults, setTableGradingResults] = useState({});
  const [gradingLoading, setGradingLoading] = useState(false);

  // Build question object q according to type
  const q = useMemo(() => {
    if (!item) return null;

    if (type === 'table') {
      let mainData = item.tableData || null;
      let compData = item.comparisonTableData || null;
      let answers = item.answers ? { ...item.answers } : {};

      // If no pre-built tableData, parse markdown content
      if (!mainData && !compData) {
        const textToParse = (item.content || '') + '\n' + (item.html || '');
        const mdParsed = parseMarkdownTable(textToParse);
        if (mdParsed && mdParsed.tableData && mdParsed.tableData.headers && mdParsed.tableData.rows) {
          const compRows = mdParsed.tableData.rows.map((row, rIdx) => {
            return row.map((cell, cIdx) => {
              if (cIdx === 0) return cell;
              const inputId = `INPUT_${rIdx}_${cIdx}`;
              answers[inputId] = cell;
              return `[${inputId}]`;
            });
          });
          mainData = {
            headers: mdParsed.tableData.headers,
            rows: compRows
          };
        }
      }

      return {
        id: item.id || `table_${Date.now()}`,
        type: '주관식 (표채우기)',
        subtype: '표채우기',
        title: item.title || '비교표 빈칸 채우기',
        question: item.title || '비교표 빈칸 채우기',
        content: item.html || item.content || '',
        explanation: item.content || '',
        tableData: mainData,
        comparisonTableData: compData,
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

  // Handle cell/overall submit & AI grading
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
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-955/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-[10px] font-black rounded-md border ${badge.color}`}>
                  {badge.name}
                </span>
                <h3 className="font-extrabold text-base sm:text-lg text-white">
                  {item?.title || '항목 퀴즈'}
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                표/항목 내부 빈칸(Input)에 직접 답안을 입력하고 즉시 채점·복습하세요.
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

        {/* Quiz Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <button
            onClick={() => {
              setTableAnswers({});
              setRevealed(false);
              setTableGradingResults({});
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition-colors cursor-pointer"
          >
            입력 초기화
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
}
