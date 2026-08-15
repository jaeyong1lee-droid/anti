import React, { useState, useMemo, useRef } from 'react';
import { X, Sparkles, Eye, EyeOff, BookOpen, CheckCircle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { TableQuiz } from './TableQuiz';
import { AcronymQuiz } from './AcronymQuiz';
import { parseMarkdownTable } from '../utils/latexUtils';
import { areCellsEqual } from '../utils/renderingHelpers';
import { LatexRenderer } from './LatexRenderer';

const getAcronymRows = (content) => {
  if (!content) return [];
  const contentStr = typeof content === 'string' ? content : String(content);
  
  if (contentStr.includes('|')) {
    const lines = contentStr.split('\n');
    const rows = [];
    for (const line of lines) {
      if (!line.includes('|')) continue;
      let cleanLine = line.trim();
      if (cleanLine.startsWith('|')) cleanLine = cleanLine.substring(1);
      if (cleanLine.endsWith('|')) cleanLine = cleanLine.substring(0, cleanLine.length - 1);
      const parts = cleanLine.split('|').map(p => p ? p.trim() : '');
      if (parts.length < 3) continue;
      const col1 = parts[0];
      const col2 = parts[1];
      const col3 = parts[2];
      if (col1 === '두문자' || col1 === '두' || col1 === '글자' || col1.includes('---') || col2.includes('---')) continue;
      if (!col1 && !col2 && !col3) continue;
      rows.push({
        acronym: col1,
        word: col2,
        description: col3
      });
    }
    if (rows.length > 0) return rows;
  }

  // Fallback parser for bullet points
  const rows = [];
  const lines = contentStr.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
      const match = trimmed.match(/^[•\-*]\s*([^(:\s]+)\s*\(([^)]+)\)\s*:\s*(.+)$/);
      if (match) {
        rows.push({
          acronym: match[1].trim(),
          word: match[2].trim(),
          description: match[3].trim()
        });
      } else {
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex !== -1) {
          const left = trimmed.substring(1, colonIndex).trim();
          const right = trimmed.substring(colonIndex + 1).trim();
          rows.push({
            acronym: left[0] || '',
            word: left,
            description: right
          });
        }
      }
    }
  }
  return rows;
};

const parseOverviewContent = (content) => {
  const result = { definition: '', mechanism: '', comparison: '', significance: '', intuitive: '' };
  if (!content) return result;

  let healedContent = typeof content === 'string' ? content : String(content || '');
  healedContent = healedContent.replace(/\|\s*(개요\(\d+~\d+자\)|개요|메커니즘|비교표|비교|장단점|의미|한계성|직관적의미|직관적)\s*\|/gi, '\n| $1 |');
  healedContent = healedContent.replace(/\|[ \t]*\|/g, '\n|');

  const lines = healedContent.split('\n');
  let currentKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '|') continue;
    
    if ((trimmed.includes(':---') || (trimmed.startsWith('|') && trimmed.includes('구분') && trimmed.includes('내용'))) && !currentKey) {
      continue;
    }

    const sectionMatch = trimmed.match(/^\|\s*([^|]+)\s*\|?\s*([\s\S]*)$/);
    const rawKeyCandidate = sectionMatch ? sectionMatch[1].trim() : '';
    const isTopLevelKey = 
      rawKeyCandidate === '개요' || 
      rawKeyCandidate.startsWith('개요(') || 
      rawKeyCandidate === '메커니즘' || 
      rawKeyCandidate === '비교표' || 
      rawKeyCandidate === '비교' || 
      rawKeyCandidate === '장단점' || 
      rawKeyCandidate === '공학적 의미/한계성' || 
      rawKeyCandidate === '공학적 의미 및 한계성' || 
      rawKeyCandidate === '의미/한계성' || 
      rawKeyCandidate === '직관적의미' || 
      rawKeyCandidate === '직관적';

    if (sectionMatch && isTopLevelKey) {
      const rawKey = sectionMatch[1].trim();
      let rawVal = sectionMatch[2].trim();
      
      if (rawVal.endsWith('|')) {
        rawVal = rawVal.slice(0, -1).trim();
      }

      if (rawKey.includes('개요')) {
        currentKey = 'definition';
      } else if (rawKey.includes('메커니즘')) {
        currentKey = 'mechanism';
      } else if (rawKey.includes('직관적')) {
        currentKey = 'intuitive';
      } else if (rawKey.includes('비교') || rawKey.includes('비교표') || rawKey.includes('장단점')) {
        currentKey = 'comparison';
      } else if (rawKey.includes('의미') || rawKey.includes('한계성')) {
        currentKey = 'significance';
      }

      result[currentKey] = rawVal;
    } else {
      if (currentKey) {
        result[currentKey] += '\n' + trimmed;
      }
    }
  }

  for (const k in result) {
    result[k] = result[k].replace(/<br\s*\/?>/gi, '\n').trim();
    if (result[k].endsWith('|') && !result[k].includes('\n')) {
      result[k] = result[k].slice(0, -1).trim();
    }
  }

  if (!result.definition && !result.mechanism && !result.comparison && !result.significance && !result.intuitive && content) {
    result.definition = typeof content === 'string' ? content.trim() : String(content).trim();
  }

  return result;
};

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
  onSelectNextItem,
  formulaTables = []
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

  // Handle switching to previous item
  const handlePrevItem = () => {
    if (!itemList || itemList.length <= 1) return;
    const prevIdx = (currentItemIndex - 1 + itemList.length) % itemList.length;
    const prevItem = itemList[prevIdx];
    
    // Reset local inputs & states
    setTableAnswers({});
    setRevealed(false);
    setTableGradingResults({});

    if (onSelectNextItem) {
      onSelectNextItem(prevItem);
    }
  };

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
      let parsed = null;

      // Check pre-parsed tableData or comparisonTableData first
      if (item.tableData && Array.isArray(item.tableData.headers) && Array.isArray(item.tableData.rows) && item.tableData.rows.length > 0) {
        parsed = item.tableData;
      } else if (item.comparisonTableData && Array.isArray(item.comparisonTableData.headers) && Array.isArray(item.comparisonTableData.rows) && item.comparisonTableData.rows.length > 0) {
        parsed = item.comparisonTableData;
      } else {
        parsed = parseHtmlTable(item.html || item.content);
        if (!parsed.rows || parsed.rows.length === 0) {
          const mdParsed = parseMarkdownTable((item.content || '') + '\n' + (item.html || ''));
          if (mdParsed && mdParsed.tableData) {
            parsed = mdParsed.tableData;
          }
        }
      }

      const headers = (parsed && parsed.headers && parsed.headers.length > 0) 
        ? parsed.headers 
        : ['구분', '항목 1', '항목 2'];

      const compRows = (parsed && parsed.rows ? parsed.rows : []).map((row, rIdx) => {
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
        rawRows: (parsed && parsed.rows) ? parsed.rows : [],
        answers: answers
      };
    } else if (type === 'acronym') {
      let mainData = item.tableData || null;
      let answers = item.answers ? { ...item.answers } : {};

      if (!mainData) {
        const contentStr = typeof item.content === 'string' ? item.content : String(item.content || '');
        const parsedRows = getAcronymRows(contentStr);

        if (parsedRows.length > 0) {
          const rows = parsedRows.map((it, rIdx) => {
            const inputId = `INPUT_${rIdx}_1`;
            answers[inputId] = it.word || '';
            return [it.acronym || `${rIdx + 1}`, `[${inputId}]`, it.description || ''];
          });
          mainData = {
            headers: ['두문자', '암기단어', '연상문장/공학적의미'],
            rows: rows
          };
        } else {
          const itemsList = item.items || item.list || [];
          if (itemsList.length > 0) {
            const rows = itemsList.map((it, rIdx) => {
              const inputId = `INPUT_${rIdx}_1`;
              answers[inputId] = it.word || it.name || it.desc || '';
              return [it.char || it.letter || `${rIdx + 1}`, `[${inputId}]`, it.desc || ''];
            });
            mainData = {
              headers: ['두문자', '암기단어', '연상문장/공학적의미'],
              rows: rows
            };
          } else {
            const parsedTable = parseHtmlTable(contentStr).rows.length > 0 
              ? parseHtmlTable(contentStr) 
              : (parseMarkdownTable(contentStr)?.tableData || null);

            if (parsedTable && parsedTable.rows && parsedTable.rows.length > 0) {
              const compRows = parsedTable.rows.map((row, rIdx) => {
                return row.map((cell, cIdx) => {
                  if (cIdx === 0) return cell;
                  const inputId = `INPUT_${rIdx}_${cIdx}`;
                  answers[inputId] = cell;
                  return `[${inputId}]`;
                });
              });
              mainData = {
                headers: parsedTable.headers || ['두문자', '암기단어', '연상문장'],
                rows: compRows
              };
            }
          }
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
      const contentStr = typeof item.content === 'string' ? item.content : String(item.content || '');
      const parsed = parseOverviewContent(contentStr);
      const answers = {};
      const rows = [];
      const tableHeaders = ['구분', '내용'];
      let comparisonTableData = null;

      if (parsed.definition) {
        answers['INPUT_0_1'] = parsed.definition;
        rows.push(['학술적 정의', '[INPUT_0_1]']);
      }
      if (parsed.mechanism) {
        const rowIdx = rows.length;
        answers[`INPUT_${rowIdx}_1`] = parsed.mechanism;
        rows.push(['공학적 작동 메커니즘', `[INPUT_${rowIdx}_1]`]);
      }
      if (rows.length === 0) {
        const labelName = (item.title && item.title.length <= 30) ? item.title.trim() : '핵심 평가 항목';
        const fallbackVal = contentStr || item.answer || item.concept || '서술 답안';
        answers['INPUT_0_1'] = fallbackVal;
        rows.push([labelName, '[INPUT_0_1]']);
      }

      let rawCompText = parsed.comparison || '';
      if (!rawCompText && formulaTables && Array.isArray(formulaTables)) {
        const matchedTable = formulaTables.find(t => t.title && item.title && (t.title.trim() === item.title.trim() || t.title.includes(item.title) || item.title.includes(t.title)));
        if (matchedTable) {
          rawCompText = matchedTable.html || matchedTable.content || '';
        }
      }

      if (rawCompText) {
        let normalizedComparison = rawCompText;
        normalizedComparison = normalizedComparison.split('\n').map(line => {
          let l = line.trim();
          if (l && l.includes('|')) {
            if (!l.startsWith('|')) l = '| ' + l;
            if (!l.endsWith('|')) l = l + ' |';
          }
          return l;
        }).join('\n');

        const parsedCompHtml = parseHtmlTable(normalizedComparison);
        const compTable = (parsedCompHtml.rows && parsedCompHtml.rows.length > 0)
          ? parsedCompHtml
          : (parseMarkdownTable(normalizedComparison)?.tableData || null);

        if (compTable && compTable.headers && compTable.rows && compTable.rows.length > 0) {
          const compRows = compTable.rows.map((row, rIdx) => {
            return row.map((cell, cIdx) => {
              if (cIdx === 0) return cell;
              const inputId = `INPUT_${rows.length + rIdx}_${cIdx}`;
              answers[inputId] = cell;
              return `[${inputId}]`;
            });
          });
          comparisonTableData = {
            headers: compTable.headers,
            rows: compRows
          };
        }
      }

      let explanationHtml = '';
      if (parsed.definition) explanationHtml += `📖 **학술적 정의**\n${parsed.definition}\n\n`;
      if (parsed.mechanism) explanationHtml += `⚙️ **공학적 작동 메커니즘**\n${parsed.mechanism}\n\n`;
      if (parsed.comparison) explanationHtml += `⚖️ **비교표 / 장단점**\n${parsed.comparison}\n\n`;

      return {
        id: item.id || `overview_${Date.now()}`,
        type: '주관식 (표채우기)',
        subtype: '개요',
        mixedType: 'overview',
        title: item.title || '개요/메커니즘 퀴즈',
        question: '[개요 복습] ' + (item.title || ''),
        tableData: {
          headers: tableHeaders,
          rows: rows
        },
        comparisonTableData: comparisonTableData,
        answers: answers,
        explanation: explanationHtml || item.content || item.title
      };
    }
    return null;
  }, [item, type, formulaTables]);

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
      case 'overview': return { name: '개요 2단계 복습 퀴즈', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
      case 'table': return { name: '비교표 빈칸 퀴즈', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' };
      case 'acronym': return { name: '두문자 빈칸 퀴즈', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' };
      default: return { name: '빈칸 퀴즈', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' };
    }
  };

  const badge = getTypeBadge();

  if (!q) return null;

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-text quiz-modal-container">
      <style>{`
        .quiz-modal-container table {
          table-layout: auto !important;
          width: max-content !important;
          min-width: 100% !important;
        }
        .quiz-modal-container td,
        .quiz-modal-container th {
          height: auto !important;
          padding: 8px 10px !important;
          vertical-align: middle !important;
        }
        .quiz-modal-container textarea,
        .quiz-modal-container .table-quiz-input {
          min-height: 32px !important;
          height: auto !important;
          max-height: 120px !important;
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className={`px-2.5 py-1 text-xs font-black rounded-lg border w-fit ${badge.color}`}>
                {badge.name}
              </span>
              <h3 className="font-black text-xl sm:text-2xl text-white tracking-tight leading-snug">
                {item?.title || '항목 맞춤 퀴즈'}
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {type === 'overview' 
                ? '1단계(학술적 개요 및 핵심 기전) 및 2단계(비교표/공학적 의미) 순차 입력 복습' 
                : '표 빈칸(Input)에 직접 답안을 입력하고 채점 및 답안·해설을 확인하세요.'}
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
      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-slate-700 quiz-modal-table-container">
        
        {/* Table/Acronym Quiz Component */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 shadow-xl overflow-x-auto">
          {type === 'acronym' ? (
            <AcronymQuiz
              key={q.id || item?.id || 'acronym_quiz'}
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
              key={q.id || item?.id || 'table_quiz'}
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

        {/* Detailed Explanation / Notes (해설 및 추가 공학적 설명) - Only visible when revealed */}
        {revealed && (q.explanation || item?.content) && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3 animate-fadeIn">
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
                  text={(typeof item.content === 'string' ? item.content : (q.explanation || '')).replace(/(?<!\$)(?<!\b)(\\(?:sqrt|frac|dfrac|sum|int|partial|Delta|sigma|gamma|tau|pi|theta|alpha|beta|phi|omega|mu|lambda|rho|nu|le|ge|ne|neq)\b(?:_\{[^}]*\}|\^\{[^}]*\}|\{[^}]*\})*)(?!\$)/gi, '$$$1$$')} 
                  katexLoaded={katexLoaded} 
                  isMarkdown={true} 
                />
              </div>
            )}
          </div>
        )}

        {!revealed && (
          <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30 text-center text-xs text-slate-400 font-medium select-none">
            🔒 [전체 채점 및 확인] 또는 상단 [🔑 답안 전체 보기]를 누르면 상세 모범 답안과 해설이 표출됩니다.
          </div>
        )}

      </div>

      {/* Footer Controls (Left: 입력 초기화 + 전체 채점 및 확인 / Right: 이전 문제 + 다음 문제 + 닫기) */}
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
        <div className="flex items-center gap-2">
          {itemList && itemList.length > 1 && (
            <>
              <button
                onClick={handlePrevItem}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 border border-slate-700/80"
                title="이전 항목 퀴즈 풀기"
              >
                <ChevronLeft size={14} />
                <span>이전 문제</span>
              </button>

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
            </>
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
