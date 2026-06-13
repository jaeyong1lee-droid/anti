const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/App.jsx');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Import Copy icon
const importTarget = `  Paperclip
} from 'lucide-react';`;

const importTargetLF = importTarget.replace(/\r\n/g, '\n');

const importReplacement = `  Paperclip,
  Copy
} from 'lucide-react';`;

let importIdx = code.indexOf(importTarget);
let importLen = importTarget.length;

if (importIdx === -1) {
  importIdx = code.indexOf(importTargetLF);
  importLen = importTargetLF.length;
}

if (importIdx === -1) {
  console.error("Error: Could not find importTarget in App.jsx");
  process.exit(1);
}

code = code.substring(0, importIdx) + importReplacement + code.substring(importIdx + importLen);

// 2. Add handleCopyReportToAnswersheet right after handleSaveTopicTitle
const functionTarget = `  const handleSaveTopicTitle = async (topicId) => {`;
const functionIndex = code.indexOf(functionTarget);

if (functionIndex === -1) {
  console.error("Error: Could not find handleSaveTopicTitle in App.jsx");
  process.exit(1);
}

// Find the end of handleSaveTopicTitle function (its closing brace `  };` and trailing newline)
const functionEndTarget = `    } catch (err) {
      console.error('Update topic title error:', err);
      showNotification('서버 통신 오류로 제목 수정에 실패했습니다.', 'error');
    }
  };`;

const functionEndTargetLF = functionEndTarget.replace(/\r\n/g, '\n');

let endIdx = code.indexOf(functionEndTarget, functionIndex);
let endLen = functionEndTarget.length;

if (endIdx === -1) {
  endIdx = code.indexOf(functionEndTargetLF, functionIndex);
  endLen = functionEndTargetLF.length;
}

if (endIdx === -1) {
  console.error("Error: Could not find end of handleSaveTopicTitle in App.jsx");
  process.exit(1);
}

const insertionPoint = endIdx + endLen;

const newFunction = `

  const handleCopyReportToAnswersheet = async (topicId, topicTitle) => {
    if (!window.confirm(\`[\${topicTitle}] 토픽의 원보고서 보기를 답안지 탭에 추가하시겠습니까?\\n(답안지 환경에 맞는 전공 공식/이론 카드가 새롭게 추출 및 생성됩니다)\`)) {
      return;
    }

    showNotification(\`[\${topicTitle}] 보고서를 답안지 탭에 연동 및 AI 분석 중...\`, 'info');
    try {
      const res = await fetch(\`\${API_BASE}/api/session/answersheet/add-from-topic\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '답안지 탭 추가 실패');
      }

      const data = await res.json();
      const theories = data.theories || [];
      if (theories.length === 0) {
        throw new Error('AI 분석 결과에서 답안지 문항을 생성하지 못했습니다.');
      }

      setAnswersheetQuestions(prev => {
        const newItems = theories.map(t => ({
          title: t.title,
          concept: t.concept || '업로드한 본문 문서를 기반으로 실시간 AI가 분석한 이론식입니다.',
          assumptions: t.assumptions || '',
          formula: t.answer,
          answersheet_report_id: t.answersheet_report_id,
          pdf_name: t.pdf_name
        }));
        const updated = [...newItems, ...prev];
        latestAnswersheetQuestionsRef.current = updated;
        handleSaveAnswersheetQuestions(updated, false);
        return updated;
      });

      showNotification(\`총 \${theories.length}개의 핵심 답안지 문항이 성공적으로 연동되어 답안지 탭에 추가되었습니다!\`, 'success');
      
      // Switch view and scroll
      await handleOpenAnswerSheet();
    } catch (err) {
      console.error('Copy report to answersheet failed:', err);
      showNotification(err.message || '보고서 연동 중 오류가 발생했습니다.', 'error');
    }
  };`;

code = code.substring(0, insertionPoint) + newFunction + code.substring(insertionPoint);

// 3. Render copy button next to delete button in topics list table
const buttonTarget = `                                <button
                                  onClick={() => handleDeleteTopic(topic.id, topic.title)}
                                  className="p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-500/20 text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                                  title="이 토픽과 모든 복습 일정을 영구 삭제합니다."
                                >
                                  <Trash2 size={12} />
                                </button>`;

const buttonTargetLF = buttonTarget.replace(/\r\n/g, '\n');

const buttonReplacement = `                                {topic.pdf_name && (
                                  <button
                                    onClick={() => handleCopyReportToAnswersheet(topic.id, topic.title)}
                                    className="p-1.5 rounded-xl bg-teal-950/60 hover:bg-teal-900/60 text-teal-300 border border-teal-500/20 text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95 mr-1"
                                    title="이 토픽의 원보고서 보기를 답안지탭에 추가합니다."
                                  >
                                    <Copy size={12} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteTopic(topic.id, topic.title)}
                                  className="p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-500/20 text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                                  title="이 토픽과 모든 복습 일정을 영구 삭제합니다."
                                >
                                  <Trash2 size={12} />
                                </button>`;

let btnIdx = code.indexOf(buttonTarget);
let btnLen = buttonTarget.length;

if (btnIdx === -1) {
  btnIdx = code.indexOf(buttonTargetLF);
  btnLen = buttonTargetLF.length;
}

if (btnIdx === -1) {
  console.error("Error: Could not find buttonTarget in App.jsx");
  process.exit(1);
}

code = code.substring(0, btnIdx) + buttonReplacement + code.substring(btnIdx + btnLen);

fs.writeFileSync(filePath, code, 'utf8');
console.log("Successfully patched client/src/App.jsx with copy report to answersheet button and logic");
