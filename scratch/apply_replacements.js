const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const replacements = [
  {
    name: '1. loadFormulaQuestions',
    search: `    const cleaned = normalizeAndCompactifyFormulas(loadedData);\r\n    latestFormulaQuestionsRef.current = cleaned;\r\n    setFormulaQuestions(cleaned);\r\n    localStorage.setItem('anti_formula_questions', JSON.stringify(cleaned));`,
    replace: `    const cleaned = normalizeAndCompactifyFormulas(loadedData).map(healFormulaQuestionObject);\r\n    latestFormulaQuestionsRef.current = cleaned;\r\n    setFormulaQuestions(cleaned);\r\n    localStorage.setItem('anti_formula_questions', JSON.stringify(cleaned));`
  },
  {
    name: '1b. loadFormulaQuestions (LF alternate)',
    search: `    const cleaned = normalizeAndCompactifyFormulas(loadedData);\n    latestFormulaQuestionsRef.current = cleaned;\n    setFormulaQuestions(cleaned);\n    localStorage.setItem('anti_formula_questions', JSON.stringify(cleaned));`,
    replace: `    const cleaned = normalizeAndCompactifyFormulas(loadedData).map(healFormulaQuestionObject);\n    latestFormulaQuestionsRef.current = cleaned;\n    setFormulaQuestions(cleaned);\n    localStorage.setItem('anti_formula_questions', JSON.stringify(cleaned));`
  },
  {
    name: '2. loadTheoryQuestions',
    search: `    latestTheoryQuestionsRef.current = loadedData;\r\n    setTheoryQuestions(loadedData);\r\n    localStorage.setItem('anti_theory_questions', JSON.stringify(loadedData));`,
    replace: `    const cleaned = (loadedData || []).map(healTheoryQuestionObject);\r\n    latestTheoryQuestionsRef.current = cleaned;\r\n    setTheoryQuestions(cleaned);\r\n    localStorage.setItem('anti_theory_questions', JSON.stringify(cleaned));`
  },
  {
    name: '2b. loadTheoryQuestions (LF alternate)',
    search: `    latestTheoryQuestionsRef.current = loadedData;\n    setTheoryQuestions(loadedData);\n    localStorage.setItem('anti_theory_questions', JSON.stringify(loadedData));`,
    replace: `    const cleaned = (loadedData || []).map(healTheoryQuestionObject);\n    latestTheoryQuestionsRef.current = cleaned;\n    setTheoryQuestions(cleaned);\n    localStorage.setItem('anti_theory_questions', JSON.stringify(cleaned));`
  },
  {
    name: '3. PDF upload theory',
    search: `        const newItems = theories.map(t => ({\r\n          title: t.title,\r\n          concept: t.concept || '업로드한 본문 문서를 기반으로 실시간 AI가 분석한 이론식입니다.',\r\n          assumptions: t.assumptions || '',\r\n          formula: t.answer\r\n        }));\r\n        const updated = [...newItems, ...prev];\r\n        latestTheoryQuestionsRef.current = updated;`,
    replace: `        const newItems = theories.map(t => ({\r\n          title: t.title,\r\n          concept: t.concept || '업로드한 본문 문서를 기반으로 실시간 AI가 분석한 이론식입니다.',\r\n          assumptions: t.assumptions || '',\r\n          formula: t.answer\r\n        }));\r\n        const updated = [...newItems, ...prev].map(healTheoryQuestionObject);\r\n        latestTheoryQuestionsRef.current = updated;`
  },
  {
    name: '3b. PDF upload theory (LF alternate)',
    search: `        const newItems = theories.map(t => ({\n          title: t.title,\n          concept: t.concept || '업로드한 본문 문서를 기반으로 실시간 AI가 분석한 이론식입니다.',\n          assumptions: t.assumptions || '',\n          formula: t.answer\n        }));\n        const updated = [...newItems, ...prev];\n        latestTheoryQuestionsRef.current = updated;`,
    replace: `        const newItems = theories.map(t => ({\n          title: t.title,\n          concept: t.concept || '업로드한 본문 문서를 기반으로 실시간 AI가 분석한 이론식입니다.',\n          assumptions: t.assumptions || '',\n          formula: t.answer\n        }));\n        const updated = [...newItems, ...prev].map(healTheoryQuestionObject);\n        latestTheoryQuestionsRef.current = updated;`
  },
  {
    name: '4. handleRefreshTheory',
    search: `          setTheoryQuestions(prev => {\r\n            const updated = prev.map((item, i) => {\r\n              if (i === idx) {\r\n                return {\r\n                  ...item,\r\n                  title: data.title,\r\n                  concept: data.concept || item.concept,\r\n                  assumptions: data.assumptions || '',\r\n                  formula: data.answer\r\n                };\r\n              }\r\n              return item;\r\n            });\r\n            latestTheoryQuestionsRef.current = updated;`,
    replace: `          setTheoryQuestions(prev => {\r\n            const updated = prev.map((item, i) => {\r\n              if (i === idx) {\r\n                return {\r\n                  ...item,\r\n                  title: data.title,\r\n                  concept: data.concept || item.concept,\r\n                  assumptions: data.assumptions || '',\r\n                  formula: data.answer\r\n                };\r\n              }\r\n              return item;\r\n            }).map(healTheoryQuestionObject);\r\n            latestTheoryQuestionsRef.current = updated;`
  },
  {
    name: '4b. handleRefreshTheory (LF alternate)',
    search: `          setTheoryQuestions(prev => {\n            const updated = prev.map((item, i) => {\n              if (i === idx) {\n                return {\n                  ...item,\n                  title: data.title,\n                  concept: data.concept || item.concept,\n                  assumptions: data.assumptions || '',\n                  formula: data.answer\n                };\n              }\n              return item;\n            });\n            latestTheoryQuestionsRef.current = updated;`,
    replace: `          setTheoryQuestions(prev => {\n            const updated = prev.map((item, i) => {\n              if (i === idx) {\n                return {\n                  ...item,\n                  title: data.title,\n                  concept: data.concept || item.concept,\n                  assumptions: data.assumptions || '',\n                  formula: data.answer\n                };\n              }\n              return item;\n            }).map(healTheoryQuestionObject);\n            latestTheoryQuestionsRef.current = updated;`
  },
  {
    name: '5. loadAnswersheetQuestions',
    search: `    latestAnswersheetQuestionsRef.current = loadedData;\r\n    setAnswersheetQuestions(loadedData);\r\n    localStorage.setItem('anti_answersheet_questions', JSON.stringify(loadedData));`,
    replace: `    const cleaned = (loadedData || []).map(healAnswersheetQuestionObject);\r\n    latestAnswersheetQuestionsRef.current = cleaned;\r\n    setAnswersheetQuestions(cleaned);\r\n    localStorage.setItem('anti_answersheet_questions', JSON.stringify(cleaned));`
  },
  {
    name: '5b. loadAnswersheetQuestions (LF alternate)',
    search: `    latestAnswersheetQuestionsRef.current = loadedData;\n    setAnswersheetQuestions(loadedData);\n    localStorage.setItem('anti_answersheet_questions', JSON.stringify(loadedData));`,
    replace: `    const cleaned = (loadedData || []).map(healAnswersheetQuestionObject);\n    latestAnswersheetQuestionsRef.current = cleaned;\n    setAnswersheetQuestions(cleaned);\n    localStorage.setItem('anti_answersheet_questions', JSON.stringify(cleaned));`
  },
  {
    name: '6. handleRefreshAnswersheet',
    search: `          setAnswersheetQuestions(prev => {\r\n            const updated = prev.map((item, i) => {\r\n              if (i === idx) {\r\n                return {\r\n                  ...item,\r\n                  title: data.title,\r\n                  concept: data.concept || item.concept,\r\n                  assumptions: data.assumptions || '',\r\n                  formula: data.answer\r\n                };\r\n              }\r\n              return item;\r\n            });\r\n            latestAnswersheetQuestionsRef.current = updated;`,
    replace: `          setAnswersheetQuestions(prev => {\r\n            const updated = prev.map((item, i) => {\r\n              if (i === idx) {\r\n                return {\r\n                  ...item,\r\n                  title: data.title,\r\n                  concept: data.concept || item.concept,\r\n                  assumptions: data.assumptions || '',\r\n                  formula: data.answer\r\n                };\r\n              }\r\n              return item;\r\n            }).map(healAnswersheetQuestionObject);\r\n            latestAnswersheetQuestionsRef.current = updated;`
  },
  {
    name: '6b. handleRefreshAnswersheet (LF alternate)',
    search: `          setAnswersheetQuestions(prev => {\n            const updated = prev.map((item, i) => {\n              if (i === idx) {\n                return {\n                  ...item,\n                  title: data.title,\n                  concept: data.concept || item.concept,\n                  assumptions: data.assumptions || '',\n                  formula: data.answer\n                };\n              }\n              return item;\n            });\n            latestAnswersheetQuestionsRef.current = updated;`,
    replace: `          setAnswersheetQuestions(prev => {\n            const updated = prev.map((item, i) => {\n              if (i === idx) {\n                return {\n                  ...item,\n                  title: data.title,\n                  concept: data.concept || item.concept,\n                  assumptions: data.assumptions || '',\n                  formula: data.answer\n                };\n              }\n              return item;\n            }).map(healAnswersheetQuestionObject);\n            latestAnswersheetQuestionsRef.current = updated;`
  },
  {
    name: '7. handleAddFormulaFromChat',
    search: `    const newFormula = {\r\n      title,\r\n      question,\r\n      concept,\r\n      formula,\r\n      structure\r\n    };\r\n\r\n    setFormulaQuestions(prev => [newFormula, ...prev]);`,
    replace: `    const newFormula = {\r\n      title,\r\n      question,\r\n      concept,\r\n      formula,\r\n      structure\r\n    };\r\n\r\n    setFormulaQuestions(prev => {\r\n      const updated = [newFormula, ...prev].map(healFormulaQuestionObject);\r\n      handleSaveFormulaQuestions(updated, false);\r\n      return updated;\r\n    });`
  },
  {
    name: '7b. handleAddFormulaFromChat (LF alternate)',
    search: `    const newFormula = {\n      title,\n      question,\n      concept,\n      formula,\n      structure\n    };\n\n    setFormulaQuestions(prev => [newFormula, ...prev]);`,
    replace: `    const newFormula = {\n      title,\n      question,\n      concept,\n      formula,\n      structure\n    };\n\n    setFormulaQuestions(prev => {\n      const updated = [newFormula, ...prev].map(healFormulaQuestionObject);\n      handleSaveFormulaQuestions(updated, false);\n      return updated;\n    });`
  },
  {
    name: '8. handleAddSpecificFormula first updater',
    search: `    setFormulaQuestions(prev => {\r\n      const updated = [newFormula, ...prev];\r\n      handleSaveFormulaQuestions(updated, false);\r\n      return updated;\r\n    });`,
    replace: `    setFormulaQuestions(prev => {\r\n      const updated = [newFormula, ...prev].map(healFormulaQuestionObject);\r\n      handleSaveFormulaQuestions(updated, false);\r\n      return updated;\r\n    });`
  },
  {
    name: '8b. handleAddSpecificFormula first updater (LF alternate)',
    search: `    setFormulaQuestions(prev => {\n      const updated = [newFormula, ...prev];\n      handleSaveFormulaQuestions(updated, false);\n      return updated;\n    });`,
    replace: `    setFormulaQuestions(prev => {\n      const updated = [newFormula, ...prev].map(healFormulaQuestionObject);\n      handleSaveFormulaQuestions(updated, false);\n      return updated;\n    });`
  },
  {
    name: '9. handleAddSpecificFormula second updater',
    search: `          setFormulaQuestions(prev => {\r\n            const updated = prev.map(f => {\r\n              if (f.id === newFormula.id) {\r\n                return {\r\n                  ...f,\r\n                  title: suggestedTitle,\r\n                  question: suggestedTitle,\r\n                  concept: suggestedConcept || f.concept,\r\n                  formula: \`$$\\\${mathContent}$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\r\n                  structure: suggestedStructure || f.structure\r\n                };\r\n              }\r\n              return f;\r\n            });\r\n            handleSaveFormulaQuestions(updated, false);`,
    replace: `          setFormulaQuestions(prev => {\r\n            const updated = prev.map(f => {\r\n              if (f.id === newFormula.id) {\r\n                return {\r\n                  ...f,\r\n                  title: suggestedTitle,\r\n                  question: suggestedTitle,\r\n                  concept: suggestedConcept || f.concept,\r\n                  formula: \`$$\\\${mathContent}$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\r\n                  structure: suggestedStructure || f.structure\r\n                };\r\n              }\r\n              return f;\r\n            }).map(healFormulaQuestionObject);\r\n            handleSaveFormulaQuestions(updated, false);`
  },
  {
    name: '9b. handleAddSpecificFormula second updater (LF alternate)',
    search: `          setFormulaQuestions(prev => {\n            const updated = prev.map(f => {\n              if (f.id === newFormula.id) {\n                return {\n                  ...f,\n                  title: suggestedTitle,\n                  question: suggestedTitle,\n                  concept: suggestedConcept || f.concept,\n                  formula: \`$$\\\${mathContent}$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\n                  structure: suggestedStructure || f.structure\n                };\n              }\n              return f;\n            });\n            handleSaveFormulaQuestions(updated, false);`,
    replace: `          setFormulaQuestions(prev => {\n            const updated = prev.map(f => {\n              if (f.id === newFormula.id) {\n                return {\n                  ...f,\n                  title: suggestedTitle,\n                  question: suggestedTitle,\n                  concept: suggestedConcept || f.concept,\n                  formula: \`$$\\\${mathContent}$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\n                  structure: suggestedStructure || f.structure\n                };\n              }\n              return f;\n            }).map(healFormulaQuestionObject);\n            handleSaveFormulaQuestions(updated, false);`
  },
  {
    name: '10. handleAddSpecificFormula third updater',
    search: `        setFormulaQuestions(prev => {\r\n          const updated = prev.map(f => {\r\n            if (f.id === newFormula.id) {\r\n              return {\r\n                ...f,\r\n                formula: f.formula.replace("\\n\\n⏳ 각 변수/상수의 상세 의미를 AI가 분석하고 있습니다...", "")\r\n              };\r\n            }\r\n            return f;\r\n          });\r\n          handleSaveFormulaQuestions(updated, false);`,
    replace: `        setFormulaQuestions(prev => {\r\n          const updated = prev.map(f => {\r\n            if (f.id === newFormula.id) {\r\n              return {\r\n                ...f,\r\n                formula: f.formula.replace("\\n\\n⏳ 각 변수/상수의 상세 의미를 AI가 분석하고 있습니다...", "")\r\n              };\r\n            }\r\n            return f;\r\n          }).map(healFormulaQuestionObject);\r\n          handleSaveFormulaQuestions(updated, false);`
  },
  {
    name: '10b. handleAddSpecificFormula third updater (LF alternate)',
    search: `        setFormulaQuestions(prev => {\n          const updated = prev.map(f => {\n            if (f.id === newFormula.id) {\n              return {\n                ...f,\n                formula: f.formula.replace("\\n\\n⏳ 각 변수/상수의 상세 의미를 AI가 분석하고 있습니다...", "")\n              };\n            }\n            return f;\n          });\n          handleSaveFormulaQuestions(updated, false);`,
    replace: `        setFormulaQuestions(prev => {\n          const updated = prev.map(f => {\n            if (f.id === newFormula.id) {\n              return {\n                ...f,\n                formula: f.formula.replace("\\n\\n⏳ 각 변수/상수의 상세 의미를 AI가 분석하고 있습니다...", "")\n              };\n            }\n            return f;\n          }).map(healFormulaQuestionObject);\n          handleSaveFormulaQuestions(updated, false);`
  },
  {
    name: '11. handleRefreshFormula updater',
    search: `          setFormulaQuestions(prev => {\r\n            const updated = prev.map((f, i) => {\r\n              if (i === idx) {\r\n                return {\r\n                  ...f,\r\n                  title: suggestedTitle,\r\n                  question: suggestedTitle,\r\n                  concept: suggestedConcept || f.concept,\r\n                  formula: \`$$\\\${mathContent}$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\r\n                  structure: suggestedStructure || f.structure\r\n                };\r\n              }\r\n              return f;\r\n            });\r\n            latestFormulaQuestionsRef.current = updated;`,
    replace: `          setFormulaQuestions(prev => {\r\n            const updated = prev.map((f, i) => {\r\n              if (i === idx) {\r\n                return {\r\n                  ...f,\r\n                  title: suggestedTitle,\r\n                  question: suggestedTitle,\r\n                  concept: suggestedConcept || f.concept,\r\n                  formula: \`$$\\\${mathContent}$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\r\n                  structure: suggestedStructure || f.structure\r\n                };\r\n              }\r\n              return f;\r\n            }).map(healFormulaQuestionObject);\r\n            latestFormulaQuestionsRef.current = updated;`
  },
  {
    name: '11b. handleRefreshFormula updater (LF alternate)',
    search: `          setFormulaQuestions(prev => {\n            const updated = prev.map((f, i) => {\n              if (i === idx) {\n                return {\n                  ...f,\n                  title: suggestedTitle,\n                  question: suggestedTitle,\n                  concept: suggestedConcept || f.concept,\n                  formula: \`$$\\\${mathContent}$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\n                  structure: suggestedStructure || f.structure\n                };\n              }\n              return f;\n            });\n            latestFormulaQuestionsRef.current = updated;`,
    replace: `          setFormulaQuestions(prev => {\n            const updated = prev.map((f, i) => {\n              if (i === idx) {\n                return {\n                  ...f,\n                  title: suggestedTitle,\n                  question: suggestedTitle,\n                  concept: suggestedConcept || f.concept,\n                  formula: \`$$\\\${mathContent}$$\` + (suggestedStructure ? "\\n\\n" + suggestedStructure : ""),\n                  structure: suggestedStructure || f.structure\n                };\n              }\n              return f;\n            }).map(healFormulaQuestionObject);\n            latestFormulaQuestionsRef.current = updated;`
  },
  {
    name: '12. formula title keydown',
    search: `                                          setFormulaQuestions(prev => {\r\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item);\r\n                                            handleSaveFormulaQuestions(updated, false);\r\n                                            return updated;\r\n                                          });`,
    replace: `                                          setFormulaQuestions(prev => {\r\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item).map(healFormulaQuestionObject);\r\n                                            handleSaveFormulaQuestions(updated, false);\r\n                                            return updated;\r\n                                          });`
  },
  {
    name: '12b. formula title keydown (LF alternate)',
    search: `                                          setFormulaQuestions(prev => {\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item);\n                                            handleSaveFormulaQuestions(updated, false);\n                                            return updated;\n                                          });`,
    replace: `                                          setFormulaQuestions(prev => {\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item).map(healFormulaQuestionObject);\n                                            handleSaveFormulaQuestions(updated, false);\n                                            return updated;\n                                          });`
  },
  {
    name: '13. formula title click',
    search: `                                        setFormulaQuestions(prev => {\r\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item);\r\n                                          handleSaveFormulaQuestions(updated, false);\r\n                                          return updated;\r\n                                        });`,
    replace: `                                        setFormulaQuestions(prev => {\r\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item).map(healFormulaQuestionObject);\r\n                                          handleSaveFormulaQuestions(updated, false);\r\n                                          return updated;\r\n                                        });`
  },
  {
    name: '13b. formula title click (LF alternate)',
    search: `                                        setFormulaQuestions(prev => {\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item);\n                                          handleSaveFormulaQuestions(updated, false);\n                                          return updated;\n                                        });`,
    replace: `                                        setFormulaQuestions(prev => {\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed, question: trimmed } : item).map(healFormulaQuestionObject);\n                                          handleSaveFormulaQuestions(updated, false);\n                                          return updated;\n                                        });`
  },
  {
    name: '14. theory title keydown',
    search: `                                          setTheoryQuestions(prev => {\r\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\r\n                                            handleSaveTheoryQuestions(updated, false);\r\n                                            return updated;\r\n                                          });`,
    replace: `                                          setTheoryQuestions(prev => {\r\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healTheoryQuestionObject);\r\n                                            handleSaveTheoryQuestions(updated, false);\r\n                                            return updated;\r\n                                          });`
  },
  {
    name: '14b. theory title keydown (LF alternate)',
    search: `                                          setTheoryQuestions(prev => {\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\n                                            handleSaveTheoryQuestions(updated, false);\n                                            return updated;\n                                          });`,
    replace: `                                          setTheoryQuestions(prev => {\n                                            const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healTheoryQuestionObject);\n                                            handleSaveTheoryQuestions(updated, false);\n                                            return updated;\n                                          });`
  },
  {
    name: '15. theory title click',
    search: `                                        setTheoryQuestions(prev => {\r\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\r\n                                          handleSaveTheoryQuestions(updated, false);\r\n                                          return updated;\r\n                                        });`,
    replace: `                                        setTheoryQuestions(prev => {\r\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healTheoryQuestionObject);\r\n                                          handleSaveTheoryQuestions(updated, false);\r\n                                          return updated;\r\n                                        });`
  },
  {
    name: '15b. theory title click (LF alternate)',
    search: `                                        setTheoryQuestions(prev => {\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\n                                          handleSaveTheoryQuestions(updated, false);\n                                          return updated;\n                                        });`,
    replace: `                                        setTheoryQuestions(prev => {\n                                          const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healTheoryQuestionObject);\n                                          handleSaveTheoryQuestions(updated, false);\n                                          return updated;\n                                        });`
  },
  {
    name: '16. answersheet title keydown',
    search: `                                           setAnswersheetQuestions(prev => {\r\n                                             const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\r\n                                             handleSaveAnswersheetQuestions(updated, false);\r\n                                             return updated;\r\n                                           });`,
    replace: `                                           setAnswersheetQuestions(prev => {\r\n                                             const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healAnswersheetQuestionObject);\r\n                                             handleSaveAnswersheetQuestions(updated, false);\r\n                                             return updated;\r\n                                           });`
  },
  {
    name: '16b. answersheet title keydown (LF alternate)',
    search: `                                           setAnswersheetQuestions(prev => {\n                                             const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\n                                             handleSaveAnswersheetQuestions(updated, false);\n                                             return updated;\n                                           });`,
    replace: `                                           setAnswersheetQuestions(prev => {\n                                             const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healAnswersheetQuestionObject);\n                                             handleSaveAnswersheetQuestions(updated, false);\n                                             return updated;\n                                           });`
  },
  {
    name: '17. answersheet title click',
    search: `                                         setAnswersheetQuestions(prev => {\r\n                                           const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\r\n                                           handleSaveAnswersheetQuestions(updated, false);\r\n                                           return updated;\r\n                                         });`,
    replace: `                                         setAnswersheetQuestions(prev => {\r\n                                           const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healAnswersheetQuestionObject);\r\n                                           handleSaveAnswersheetQuestions(updated, false);\r\n                                           return updated;\r\n                                         });`
  },
  {
    name: '17b. answersheet title click (LF alternate)',
    search: `                                         setAnswersheetQuestions(prev => {\n                                           const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item);\n                                           handleSaveAnswersheetQuestions(updated, false);\n                                           return updated;\n                                         });`,
    replace: `                                         setAnswersheetQuestions(prev => {\n                                           const updated = prev.map((item, i) => i === idx ? { ...item, title: trimmed } : item).map(healAnswersheetQuestionObject);\n                                           handleSaveAnswersheetQuestions(updated, false);\n                                           return updated;\n                                         });`
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
