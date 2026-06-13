const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/App.jsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const replacements = [
  {
    name: '1. loadFormulaQuestions',
    search: `    const cleaned = normalizeAndCompactifyFormulas(loadedData);\n    latestFormulaQuestionsRef.current = cleaned;\n    setFormulaQuestions(cleaned);\n    localStorage.setItem('anti_formula_questions', JSON.stringify(cleaned));`,
    replace: `    const cleaned = normalizeAndCompactifyFormulas(loadedData).map(healFormulaQuestionObject);\n    latestFormulaQuestionsRef.current = cleaned;\n    setFormulaQuestions(cleaned);\n    localStorage.setItem('anti_formula_questions', JSON.stringify(cleaned));`
  },
  {
    name: '2. loadTheoryQuestions',
    search: `    latestTheoryQuestionsRef.current = loadedData;\n    setTheoryQuestions(loadedData);\n    localStorage.setItem('anti_theory_questions', JSON.stringify(loadedData));`,
    replace: `    const cleaned = (loadedData || []).map(healTheoryQuestionObject);\n    latestTheoryQuestionsRef.current = cleaned;\n    setTheoryQuestions(cleaned);\n    localStorage.setItem('anti_theory_questions', JSON.stringify(cleaned));`
  },
  {
    name: '3. PDF upload theory',
    search: `        const newItems = theories.map(t => ({\n          title: t.title,\n          concept: t.concept || '업로드한 본문 문서를 기반으로 실시간 AI가 분석한 이론식입니다.',\n          assumptions: t.assumptions || '',\n          formula: t.answer\n        }));\n        const updated = [...newItems, ...prev];\n        latestTheoryQuestionsRef.current = updated;`,
    replace: `        const newItems = theories.map(t => ({\n          title: t.title,\n          concept: t.concept || '업로드한 본문 문서를 기반으로 실시간 AI가 분석한 이론식입니다.',\n          assumptions: t.assumptions || '',\n          formula: t.answer\n        }));\n        const updated = [...newItems, ...prev].map(healTheoryQuestionObject);\n        latestTheoryQuestionsRef.current = updated;`
  },
  {
    name: '4. handleRefreshTheory',
    search: `          setTheoryQuestions(prev => {\n            const updated = prev.map((item, i) => {\n              if (i === idx) {\n                return {\n                  ...item,\n                  title: data.title,\n                  concept: data.concept || item.concept,\n                  assumptions: data.assumptions || '',\n                  formula: data.answer\n                };\n              }\n              return item;\n            });\n            latestTheoryQuestionsRef.current = updated;`,
    replace: `          setTheoryQuestions(prev => {\n            const updated = prev.map((item, i) => {\n              if (i === idx) {\n                return {\n                  ...item,\n                  title: data.title,\n                  concept: data.concept || item.concept,\n                  assumptions: data.assumptions || '',\n                  formula: data.answer\n                };\n              }\n              return item;\n            }).map(healTheoryQuestionObject);\n            latestTheoryQuestionsRef.current = updated;`
  },
  {
    name: '5. loadAnswersheetQuestions',
    search: `    latestAnswersheetQuestionsRef.current = loadedData;\n    setAnswersheetQuestions(loadedData);\n    localStorage.setItem('anti_answersheet_questions', JSON.stringify(loadedData));`,
    replace: `    const cleaned = (loadedData || []).map(healAnswersheetQuestionObject);\n    latestAnswersheetQuestionsRef.current = cleaned;\n    setAnswersheetQuestions(cleaned);\n    localStorage.setItem('anti_answersheet_questions', JSON.stringify(cleaned));`
  },
  {
    name: '6. handleRefreshAnswersheet',
    search: `          setAnswersheetQuestions(prev => {\n            const updated = prev.map((item, i) => {\n              if (i === idx) {\n                return {\n                  ...item,\n                  title: data.title,\n                  concept: data.concept || item.concept,\n                  assumptions: data.assumptions || '',\n                  formula: data.answer\n                };\n              }\n              return item;\n            });\n            latestAnswersheetQuestionsRef.current = updated;`,
    replace: `          setAnswersheetQuestions(prev => {\n            const updated = prev.map((item, i) => {\n              if (i === idx) {\n                return {\n                  ...item,\n                  title: data.title,\n                  concept: data.concept || item.concept,\n                  assumptions: data.assumptions || '',\n                  formula: data.answer\n                };\n              }\n              return item;\n            }).map(healAnswersheetQuestionObject);\n            latestAnswersheetQuestionsRef.current = updated;`
  },
  {
    name: '7. handleAddFormulaFromChat',
    search: `    const newFormula = {\n      title,\n      question,\n      concept,\n      formula,\n      structure\n    };\n\n    setFormulaQuestions(prev => [newFormula, ...prev]);`,
    replace: `    const newFormula = {\n      title,\n      question,\n      concept,\n      formula,\n      structure\n    };\n\n    setFormulaQuestions(prev => {\n      const updated = [newFormula, ...prev].map(healFormulaQuestionObject);\n      handleSaveFormulaQuestions(updated, false);\n      return updated;\n    });`
  },
  {
    name: '8. handleAddSpecificFormula first updater',
    search: `    setFormulaQuestions(prev => {\n      const updated = [newFormula, ...prev];\n      handleSaveFormulaQuestions(updated, false);\n      return updated;\n    });`,
    replace: `    setFormulaQuestions(prev => {\n      const updated = [newFormula, ...prev].map(healFormulaQuestionObject);\n      handleSaveFormulaQuestions(updated, false);\n      return updated;\n    });`
  },
  {
    name: '9. handleAddSpecificFormula second updater',
    search: `          setFormulaQuestions(prev => {\n            const updated = prev.map(f => {\n              if (f.id === newFormula.id) {\n                return {\n                  ...f,\n                  title: suggestedTitle,\n                  question: suggestedTitle,\n                  concept: suggestedConcept || f.concept,\n                  formula: \`$$\${mathContent}$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\n                  structure: suggestedStructure || f.structure\n                };\n              }\n              return f;\n            });\n            handleSaveFormulaQuestions(updated, false);`,
    replace: `          setFormulaQuestions(prev => {\n            const updated = prev.map(f => {\n              if (f.id === newFormula.id) {\n                return {\n                  ...f,\n                  title: suggestedTitle,\n                  question: suggestedTitle,\n                  concept: suggestedConcept || f.concept,\n                  formula: \`$$$$\${mathContent}$$$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\n                  structure: suggestedStructure || f.structure\n                };\n              }\n              return f;\n            }).map(healFormulaQuestionObject);\n            handleSaveFormulaQuestions(updated, false);`
  },
  {
    name: '10. handleAddSpecificFormula third updater',
    search: `        setFormulaQuestions(prev => {\n          const updated = prev.map(f => {\n            if (f.id === newFormula.id) {\n              return {\n                ...f,\n                formula: f.formula.replace("\\n\\n⏳ 각 변수/상수의 상세 의미를 AI가 분석하고 있습니다...", "")\n              };\n            }\n            return f;\n          });\n          handleSaveFormulaQuestions(updated, false);`,
    replace: `        setFormulaQuestions(prev => {\n          const updated = prev.map(f => {\n            if (f.id === newFormula.id) {\n              return {\n                ...f,\n                formula: f.formula.replace("\\n\\n⏳ 각 변수/상수의 상세 의미를 AI가 분석하고 있습니다...", "")\n              };\n            }\n            return f;\n          }).map(healFormulaQuestionObject);\n          handleSaveFormulaQuestions(updated, false);`
  },
  {
    name: '11. handleRefreshFormula updater',
    search: `          setFormulaQuestions(prev => {\n            const updated = prev.map((f, i) => {\n              if (i === idx) {\n                return {\n                  ...f,\n                  title: suggestedTitle,\n                  question: suggestedTitle,\n                  concept: suggestedConcept || f.concept,\n                  formula: \`$$\${mathContent}$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\n                  structure: suggestedStructure || f.structure\n                };\n              }\n              return f;\n            });\n            latestFormulaQuestionsRef.current = updated;`,
    replace: `          setFormulaQuestions(prev => {\n            const updated = prev.map((f, i) => {\n              if (i === idx) {\n                return {\n                  ...f,\n                  title: suggestedTitle,\n                  question: suggestedTitle,\n                  concept: suggestedConcept || f.concept,\n                  formula: \`$$$$\${mathContent}$$$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\n                  structure: suggestedStructure || f.structure\n                };\n              }\n              return f;\n            }).map(healFormulaQuestionObject);\n            latestFormulaQuestionsRef.current = updated;`
  },
  {
    name: '12. formula title keydown',
    search: `                                          setFormulaQuestions(prev => {\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item);\n                                            handleSaveFormulaQuestions(updated, false);\n                                            return updated;\n                                          });`,
    replace: `                                          setFormulaQuestions(prev => {\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item).map(healFormulaQuestionObject);\n                                            handleSaveFormulaQuestions(updated, false);\n                                            return updated;\n                                          });`
  },
  {
    name: '13. formula title click',
    search: `                                        setFormulaQuestions(prev => {\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item);\n                                          handleSaveFormulaQuestions(updated, false);\n                                          return updated;\n                                        });`,
    replace: `                                        setFormulaQuestions(prev => {\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item).map(healFormulaQuestionObject);\n                                          handleSaveFormulaQuestions(updated, false);\n                                          return updated;\n                                        });`
  },
  {
    name: '14. theory title keydown',
    search: `                                          setTheoryQuestions(prev => {\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\n                                            handleSaveTheoryQuestions(updated, false);\n                                            return updated;\n                                          });`,
    replace: `                                          setTheoryQuestions(prev => {\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healTheoryQuestionObject);\n                                            handleSaveTheoryQuestions(updated, false);\n                                            return updated;\n                                          });`
  },
  {
    name: '15. theory title click',
    search: `                                        setTheoryQuestions(prev => {\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\n                                          handleSaveTheoryQuestions(updated, false);\n                                          return updated;\n                                        });`,
    replace: `                                        setTheoryQuestions(prev => {\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healTheoryQuestionObject);\n                                          handleSaveTheoryQuestions(updated, false);\n                                          return updated;\n                                        });`
  },
  {
    name: '16. answersheet title keydown',
    search: `                                          setAnswersheetQuestions(prev => {\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\n                                            handleSaveAnswersheetQuestions(updated, false);\n                                            return updated;\n                                          });`,
    replace: `                                          setAnswersheetQuestions(prev => {\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healAnswersheetQuestionObject);\n                                            handleSaveAnswersheetQuestions(updated, false);\n                                            return updated;\n                                          });`
  },
  {
    name: '17. answersheet title click',
    search: `                                        setAnswersheetQuestions(prev => {\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\n                                          handleSaveAnswersheetQuestions(updated, false);\n                                          return updated;\n                                        });`,
    replace: `                                        setAnswersheetQuestions(prev => {\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healAnswersheetQuestionObject);\n                                          handleSaveAnswersheetQuestions(updated, false);\n                                          return updated;\n                                        });`
  }
];

let appliedCount = 0;
for (const rep of replacements) {
  if (content.includes(rep.search)) {
    content = content.replace(rep.search, rep.replace);
    console.log(`Successfully applied: ${rep.name}`);
    appliedCount++;
  } else {
    console.log(`Skipped: ${rep.name} (not found)`);
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`Finished. Total successfully applied replacements: ${appliedCount}`);
