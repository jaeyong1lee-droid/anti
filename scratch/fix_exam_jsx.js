import fs from 'fs';
import path from 'path';

const appJsxPath = path.resolve('client/src/App.jsx');
let content = fs.readFileSync(appJsxPath, 'utf8');

// We want to replace:
const target = `                                </div>
                              )}
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
                      )}`;

const replacement = `                                </div>
                              )}
                            </div>
                          </div>
                        )
                      )}`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(appJsxPath, content, 'utf8');
  console.log('SUCCESS: Replaced exam subjective leftover!');
} else {
  console.error('ERROR: Target string not found!');
  // Let's print a small chunk to help debug
  const lines = content.split('\n');
  console.log('Lines 4090 to 4110 around that block:');
  for (let i = 4085; i <= 4115; i++) {
    if (lines[i]) {
      console.log(`${i + 1}: ${lines[i]}`);
    }
  }
}
