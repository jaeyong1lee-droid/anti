import fs from 'fs';
import path from 'path';

const appJsxPath = path.resolve('client/src/App.jsx');
let content = fs.readFileSync(appJsxPath, 'utf8');

// Normalize line endings to LF
const normalizedContent = content.replace(/\r\n/g, '\n');
const lines = normalizedContent.split('\n');

// 1. Insert states near `const [regeneratingExam, setRegeneratingExam] = useState({});` (line 337 in original)
const regeneratingExamLineIdx = lines.findIndex(l => l.includes('const [regeneratingExam, setRegeneratingExam] = useState({});'));

if (regeneratingExamLineIdx !== -1) {
  console.log(`Found regeneratingExam state declaration at line ${regeneratingExamLineIdx + 1}`);
  
  const stateInsert = `  // Question adjustment (AI 피드백) states
  const [adjustingInputKey, setAdjustingInputKey] = useState(null);
  const [adjustingText, setAdjustingText] = useState({});
  const [adjustingLoading, setAdjustingLoading] = useState({});`;
  
  lines.splice(regeneratingExamLineIdx + 1, 0, stateInsert);
  console.log('Inserted states!');
} else {
  console.error('ERROR: Could not find regeneratingExam state line!');
}

// 2. Insert handler function `handleAdjustQuestion` below `handleRegenerateQuestion` ending
// `handleRegenerateQuestion` ends with:
//     } finally {
//       setRegenerating(prev => ({ ...prev, [idx]: false }));
//     }
//   };
// Let's locate the line `setRegenerating(prev => ({ ...prev, [idx]: false }));` under `handleRegenerateQuestion` (approx index 980+)
// We can locate it by finding where `setRegenerating(prev => ({ ...prev, [idx]: false }));` is, and then the next line is `    }` and the next is `  };`.
let handlerInsertIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('setRegenerating(prev => ({ ...prev, [idx]: false }));') && 
      lines[i + 1] && lines[i + 1].includes('}') && 
      lines[i + 2] && lines[i + 2].includes('};') &&
      lines[i + 4] && lines[i + 4].includes('// Open review quiz AND mark schedule')) {
    handlerInsertIdx = i + 3;
    break;
  }
}

if (handlerInsertIdx !== -1) {
  console.log(`Found end of handleRegenerateQuestion at index ${handlerInsertIdx + 1}`);
  
  const handlerCode = `
  // Adjust a single question based on user feedback (mode: 'review' or 'exam')
  const handleAdjustQuestion = async (mode, idx, currentQ) => {
    const isReview = mode === 'review';
    const key = isReview ? \`r_\${idx}\` : \`e_\${idx}\`;
    const feedbackText = adjustingText[key] || '';

    if (!feedbackText.trim()) {
      showNotification('의견을 입력해 주세요.', 'warning');
      return;
    }

    setAdjustingLoading(prev => ({ ...prev, [key]: true }));

    try {
      const body = {
        mode,
        topicId: isReview ? selectedTopic?.id : null,
        currentQuestion: currentQ,
        questionIdx: idx,
        userFeedback: feedbackText
      };

      const res = await fetch(\`\${API_BASE}/api/question/adjust\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();

      if (res.ok && data.question) {
        if (isReview) {
          // 1. 해당 인덱스 문항 교체 및 서버 세션 동기화 저장
          setAiQuestions(prev => {
            const updated = prev.map((q, i) => i === idx ? data.question : q);
            fetch(\`\${API_BASE}/api/session/review\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ topicId: selectedTopic?.id, questions: updated })
            }).catch(e => console.warn('복습 세션 동기화 실패:', e));
            return updated;
          });
          // 2. 해당 인덱스의 선택 답안, 정답 확인 여부 초기화
          setSelectedAnswers(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
          setRevealedQuestions(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
          // 3. 주관식인 경우 혹시 열려있는 아코디언 섹션도 초기화
          setOpenSections(prev => {
            const copy = { ...prev };
            Object.keys(copy).forEach(k => {
              if (k.startsWith(\`\${idx}-\`)) {
                delete copy[k];
              }
            });
            return copy;
          });
          // 4. 보기별 해설도 초기화
          setOptionExplanations(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
        } else {
          // 종합평가인 경우 문항 교체 및 서버 세션 동기화 저장
          setExamQuestions(prev => {
            const updated = prev.map((q, i) => i === idx ? data.question : q);
            fetch(\`\${API_BASE}/api/session/exam\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                examQuestions: updated, 
                examRevealed, 
                examAnswers, 
                examTopic,
                savedExamScroll: examBodyRef.current?.scrollTop || 0 
              })
            }).catch(e => console.warn('종합평가 세션 동기화 실패:', e));
            return updated;
          });
          setExamAnswers(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
          setExamRevealed(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
          // 보기별 해설 초기화
          setOptionExplanations(prev => {
            const copy = { ...prev };
            delete copy[idx];
            return copy;
          });
        }
        
        // 입력창 상태 초기화 및 닫기
        setAdjustingText(prev => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        setAdjustingInputKey(null);
        showNotification('의견을 반영하여 문제를 성공적으로 조정했습니다.', 'success');
      } else {
        showNotification(data.error || '문제를 조정하지 못했습니다.', 'error');
      }
    } catch (err) {
      console.error('Adjust question error:', err);
      showNotification('서버 통신 오류로 문제를 조정하지 못했습니다.', 'error');
    } finally {
      setAdjustingLoading(prev => ({ ...prev, [key]: false }));
    }
  };
`;

  lines.splice(handlerInsertIdx, 0, handlerCode);
  console.log('Inserted handler!');
} else {
  console.error('ERROR: Could not find insert index for handleAdjustQuestion!');
}

fs.writeFileSync(appJsxPath, lines.join('\n'), 'utf8');
console.log('Finished states and handler insertion!');
