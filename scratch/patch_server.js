const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server', 'index.js');
console.log("Reading file:", filePath);

let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF for easy replacement
const isCRLF = content.includes('\r\n');
if (isCRLF) {
  content = content.replace(/\r\n/g, '\n');
}

// 1. Find the start index of healLatexFormulas function and replace it
const funcStart = content.indexOf('function healLatexFormulas(text) {');
if (funcStart === -1) {
  console.error("Could not find function healLatexFormulas in server/index.js!");
  process.exit(1);
}

let braceCount = 0;
let funcEnd = -1;
let started = false;

for (let i = funcStart; i < content.length; i++) {
  if (content[i] === '{') {
    braceCount++;
    started = true;
  } else if (content[i] === '}') {
    braceCount--;
  }
  
  if (started && braceCount === 0) {
    funcEnd = i + 1;
    break;
  }
}

if (funcEnd === -1) {
  console.error("Could not find matching closing brace for healLatexFormulas!");
  process.exit(1);
}

// Decode our target functions code from base64 to ensure 100% exact characters
const base64Code = "ZnVuY3Rpb24gaGVhbExhdGV4Rm9ybXVsYXModGV4dCkgewogIGlmICghdGV4dCkgcmV0dXJuIHRleHQ7CiAgCiAgbGV0IGhlYWxlZCA9IHRleHQ7CgogIC8vIDEuIFJlcGxhY2UgbXVsdGlwbGUgYmFja3NsYXNoZXMgd2l0aCBhIHNpbmdsZSBiYWNrc2xhc2gKICBoZWFsZWQgPSBoZWFsZWQucmVwbGFjZSgvXFwrL2csICdcXCcpOwoKICAvLyAyLiBXcmFwIGJhcmUgR3JlZWsgbGV0dGVycyB3aXRoIGJhY2tzbGFzaGVzCiAgY29uc3Qgc3ltYm9scyA9IFsnc2lnbWEnLCAndGF1JywgJ2FscGhhJywgJ2JldGEnLCAnZ2FtbWEnLCAncGhpJywgJ3RoZXRhJywgJ2Vwc2lsb24nLCAncGknLCAnZGVsdGEnLCAnb21lZ2EnLCAnbXUnLCAnbGFtYmRhJywgJ3BzaScsICdyaG8nLCAnZXRhJ107CiAgc3ltYm9scy5mb3JFYWNoKHN5bSA9PiB7CiAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoYCg/PCFcXFxcKVxcYiR7c3ltfVxcYmAsICdnJyk7CiAgICBoZWFsZWQgPSBoZWFsZWQucmVwbGFjZShyZWdleCwgYFxcJHtzeW19YCk7CiAgfSk7CgogIC8vIDMuIFdyYXAgc3BlY2lmaWMgYXJpdGhtZXRpYyBlcXVhdGlvbnMgbGlrZSBcc2lnbWEnID0gXHNpZ21hIC0gUF93CiAgaGVhbGVkID0gaGVhbGVkLnJlcGxhY2UoLyg/OlwkW15cJF0rXCQpfChcXHNpZ21hJ1xzKj1ccypcXHNpZ21hXHMqLVxzKlBfdykvZywgKG1hdGNoLCBnMSkgPT4gZzEgPyBgJCR7ZzF9JGAgOiBtYXRjaCk7CiAgaGVhbGVkID0gaGVhbGVkLnJlcGxhY2UoLyg/OlwkW15cJF0rXCQpfChcXHNpZ21hJ1xzKj1ccypcXHNpZ21hXHMqLVxzKnUpL2csIChtYXRjaCwgZzEpID0+IGcxID8gYCQke2cxfSRgIDogbWF0Y2gpOwogIGhlYWxlZCA9IGhlYWxlZC5yZXBsYWNlKC8oPzpcJFteXCRdK1wkKXwoXFxzaWdtYVxzKi1ccypQX3cpL2csIChtYXRjaCwgZzEpID0+IGcxID8gYCQke2cxfSRgIDogbWF0Y2gpOwoKICAvLyA0LiBNYXRjaCBhbmQgd3JhcCBjb21wYXJpc29uL2VxdWFsaXR5IGZvcm11bGFzIGNvbnRhaW5pbmcgZ3JlZWsgbGV0dGVycyBvciBiYWNrc2xhc2hlcwogIGNvbnN0IGZvcm11bGFQYXR0ZXJuID0gLyg/OlwkW15cJF0rXCQpfCgoPzpcXD9bYS16QS1aXzAtOSddKyg/Ol9bYS16QS1aMC05XSspPyg/OlxzKlstKypcL10qXHMqWzw+PV0rXHMqWy0rKlwvXSpccypcXD9bYS16QS1aXzAtOSddKyg/Ol9bYS16QS1aMC05XSspPykrKSkvZzsKICAKICBoZWFsZWQgPSBoZWFsZWQucmVwbGFjZShmb3JtdWxhUGF0dGVybiwgKG1hdGNoLCBnMSkgPT4gewogICAgaWYgKGcxKSB7CiAgICAgIGNvbnN0IGhhc0JhY2tzbGFzaCA9IGcxLmluY2x1ZGVzKCdcXCcpOwogICAgICBjb25zdCBoYXNHcmVlayA9IHN5bWJvbHMuc29tZShzeW0gPT4gZzEuaW5jbHVkZXMoc3ltKSk7CiAgICAgIGNvbnN0IGhhc01hdGhDb250ZXh0ID0gL1s8Pj1dLy50ZXN0KGcxKSAmJiAoaGFzQmFja3NsYXNoIHx8IGhhc0dyZWVrIHx8IC9cYltjdXFdXGIvLnRlc3QoZzEpKTsKICAgICAgaWYgKGhhc0JhY2tzbGFzaCB8fCBoYXNHcmVlayB8fCBoYXNNYXRoQ29udGV4dCkgewogICAgICAgIHJldHVybiBgJCR7ZzEudHJpbSgpfSRgOwogICAgICB9CiAgICAgIHJldHVybiBnMTsKICAgIH0KICAgIHJldHVybiBtYXRjaDsKICB9KTsKCiAgLy8gNS4gV3JhcCBpbmRpdmlkdWFsIEdyZWVrIHZhcmlhYmxlcyBsaWtlIFxhbHBoYV9wLCBcYWxwaGFfZiwgXHBoaSwgaW5jbHVkaW5nIGN1cmx5IGJyYWNlIHN1YnNjcmlwdHMgbGlrZSBcdGF1X3thbGxvd30KICBjb25zdCBzdWJzY3JpcHRQYXR0ZXJuID0gYCg/Ol9bYS16QS1aMC05XSt8Xyg/Olxce1thLXpBLVowLTlfXStcXH0pKT9gOwogIGNvbnN0IGdyZWVrUGF0dGVybiA9IG5ldyBSZWdFeHAoYCg/OlxcJFteXCRdK1xcJCl8KChcXFxcXFxiKD86JHtzeW1ib2xzLmpvaW4oJ3wnKX0pJHtzdWJzY3JpcHRQYXR0ZXJufSg/IVthLXpBLVowLTlfXSkpKWAsICdnJyk7CiAgaGVhbGVkID0gaGVhbGVkLnJlcGxhY2UoZ3JlZWtQYXR0ZXJuLCAobWF0Y2gsIGcxKSA9PiB7CiAgICBpZiAoZzEpIHsKICAgICAgcmV0dXJuIGAkJHtnMX0kYDsKICAgIH0KICAgIHJldHVybiBtYXRjaDsKICB9KTsKCiAgLy8gNi4gV3JhcCBwbGFpbiB2YXJpYWJsZSBzdWJzY3JpcHRzIChsaWtlIGZfe2NrfSwgaV97Y29yfSwgUF97bWF4fSwgUF93KSB0aGF0IGRvbid0IGhhdmUgYmFja3NsYXNoZXMKICBjb25zdCBwbGFpblN1YnNjcmlwdFBhdHRlcm4gPSAvKD86XCRbXlwkXStcJCl8KChcYlthLXpBLVpdKD86X1thLXpBLVowLTldK3xfKD86XHtbYS16QS1aMC05X10rXH0pKSg/IVthLXpBLVowLTlfXSkpKS9nOwogIGhlYWxlZCA9IGhlYWxlZC5yZXBsYWNlKHBsYWluU3Vic2NyaXB0UGF0dGVybiwgKG1hdGNoLCBnMSkgPT4gewogICAgaWYgKGcxKSB7CiAgICAgIHJldHVybiBgJCR7ZzF9JGA7CiAgICB9CiAgICByZXR1cm4gbWF0Y2g7CiAgfSk7CgogIC8vIDcuIEVuZm9yY2UgTGFUZVggUnVsZXM6CiAgLy8gUnVsZSAxOiDrgrTrtoAg6rO167CxIOygiOuMgCDquIjsp4AgKFJlbW92ZSBzcGFjZXMgaW5zaWRlICQgYW5kIGNvbnRlbnRzKQogIGhlYWxlZCA9IGhlYWxlZC5yZXBsYWNlKC9cJFxzKyhbXlwkXSs/KVxzK1wkL2csICckJCQxJCcpOwogIGhlYWxlZCA9IGhlYWxlZC5yZXBsYWNlKC9cJFxzKyhbXlwkXSs/KVwkL2csICckJCQxJCcpOwogIGhlYWxlZCA9IGhlYWxlZC5yZXBsYWNlKC9cJChbXlwkXSs/KVxzK1wkL2csICckJCQxJCcpOwoKICAvLyBSdWxlIDI6IOyZuOu2gCDqs7XrsLEg7ZWE7IiYIChFbnN1cmUgZXhhY3RseSBvbmUgc3BhY2UgYmVmb3JlIGFuZCBhZnRlciB0aGUgbWF0aCBibG9ja3MgaWYgbm90IGFscmVhZHkgc2VwYXJhdGVkKQogIGhlYWxlZCA9IGhlYWxlZC5yZXBsYWNlKC9cJChbXlwkXSs/KVwkL2csIChtYXRjaCwgZm9ybXVsYSwgb2Zmc2V0LCBvcmlnaW5hbFN0cmluZykgPT4gewogICAgbGV0IHJlc3VsdCA9IG1hdGNoOwogICAgCiAgICAvLyBDaGVjayBjaGFyYWN0ZXIgYmVmb3JlIG9wZW5pbmcgJAogICAgY29uc3QgY2hhckJlZm9yZUluZGV4ID0gb2Zmc2V0IC0gMTsKICAgIGlmIChjaGFyQmVmb3JlSW5kZXggPj0gMCkgewogICAgICBjb25zdCBjaGFyQmVmb3JlID0gb3JpZ2luYWxTdHJpbmdbY2hhckJlZm9yZUluZGV4XTsKICAgICAgaWYgKGNoYXJCZWZvcmUgIT09ICcgJyAmJiBjaGFyQmVmb3JlICE9PSAnJCcgJiYgY2hhckJlZm9yZSAhPT0gJ1xuJykgewogICAgICAgIHJlc3VsdCA9ICcgJyArIHJlc3VsdDsKICAgICAgfQogICAgfQogICAgCiAgICAvLyBDaGVjayBjaGFyYWN0ZXIgYWZ0ZXIgY2xvc2luZyAkCiAgICBjb25zdCBjaGFyQWZ0ZXJJbmRleCA9IG9mZnNldCArIG1hdGNoLmxlbmd0aDsKICAgIGlmIChjaGFyQWZ0ZXJJbmRleCA8IG9yaWdpbmFsU3RyaW5nLmxlbmd0aCkgewogICAgICBjb25zdCBjaGFyQWZ0ZXIgPSBvcmlnaW5hbFN0cmluZ1tjaGFyQWZ0ZXJJbmRleF07CiAgICAgIGlmIChjaGFyQWZ0ZXIgIT09ICcgJyAmJiBjaGFyQWZ0ZXIgIT09ICckJyAmJiBjaGFyQWZ0ZXIgIT09ICdcbicpIHsKICAgICAgICByZXN1bHQgPSByZXN1bHQgKyAnICc7CiAgICAgIH0KICAgIH0KICAgIAogICAgcmV0dXJuIHJlc3VsdDsKICB9KTsKCiAgcmV0dXJuIGhlYWxlZDsKfQoKZnVuY3Rpb24gaGVhbFF1aXpRdWVzdGlvbk9iamVjdChxKSB7CiAgaWYgKCFxKSByZXR1cm4gcTsKICBjb25zdCBoZWFsZWQgPSB7IC4uLnEgfTsKICBpZiAoaGVhbGVkLnF1ZXN0aW9uKSBoZWFsZWQucXVlc3Rpb24gPSBoZWFsTGF0ZXhGb3JtdWxhcyhoZWFsZWQucXVlc3Rpb24pOwogIGlmIChoZWFsZWQuYW5zd2VyKSBoZWFsZWQuYW5zd2VyID0gaGVhbExhdGV4Rm9ybXVsYXMoaGVhbGVkLmFuc3dlcik7CiAgaWYgKGhlYWxlZC5leHBsYW5hdGlvbikgaGVhbGVkLmV4cGxhbmF0aW9uID0gaGVhbExhdGV4Rm9ybXVsYXMoaGVhbGVkLmV4cGxhbmF0aW9uKTsKICBpZiAoaGVhbGVkLmNvbmNlcHQpIGhlYWxlZC5jb25jZXB0ID0gaGVhbExhdGV4Rm9ybXVsYXMoaGVhbGVkLmNvbmNlcHQpOwogIGlmIChoZWFsZWQuZm9ybXVsYSkgaGVhbGVkLmZvcm11bGEgPSBoZWFsTGF0ZXhGb3JtdWxhcyhoZWFsZWQuZm9ybXVsYSk7CiAgaWYgKGhlYWxlZC5zdHJ1Y3R1cmUpIGhlYWxlZC5zdHJ1Y3R1cmUgPSBoZWFsTGF0ZXhGb3JtdWxhcyhoZWFsZWQuc3RydWN0dXJlKTsKICBpZiAoaGVhbGVkLm9wdGlvbnMgJiYgQXJyYXkuaXNBcnJheShoZWFsZWQub3B0aW9ucykpIHsKICAgIGhlYWxlZC5vcHRpb25zID0gaGVhbGVkLm9wdGlvbnMubWFwKG9wdCA9PiBoZWFsTGF0ZXhGb3JtdWxhcyhvcHQpKTsKICB9CiAgcmV0dXJuIGhlYWxlZDsKfQo=";
const newFuncs = Buffer.from(base64Code, 'base64').toString('utf8');

// Perform the function replacement
content = content.substring(0, funcStart) + newFuncs + content.substring(funcEnd);
console.log("Successfully replaced function definitions!");

// 2. Perform the question mapping replacements to heal LaTeX inside question objects
// We replace the maps for core questions, fallback questions, and AI questions
const searchReplacements = [
  {
    target: `        const cleanedQuestions = questions.map(q => ({
          ...q,
          question: cleanQuizQuestion(q.question)
        }));`,
    replace: `        const cleanedQuestions = questions.map(q => healQuizQuestionObject({
          ...q,
          question: cleanQuizQuestion(q.question)
        }));`
  },
  {
    target: `      const cleanedCore = coreQuestions.map(q => ({
        ...q,
        question: cleanQuizQuestion(q.question)
      }));`,
    replace: `      const cleanedCore = coreQuestions.map(q => healQuizQuestionObject({
        ...q,
        question: cleanQuizQuestion(q.question)
      }));`
  },
  {
    target: `      const cleanedFallback = fallbackQuestions.map(q => ({
        ...q,
        question: cleanQuizQuestion(q.question)
      }));`,
    replace: `      const cleanedFallback = fallbackQuestions.map(q => healQuizQuestionObject({
        ...q,
        question: cleanQuizQuestion(q.question)
      }));`
  },
  {
    target: `          question: {
            ...selectedQ,
            question: cleanQuizQuestion(selectedQ.question)
          },`,
    replace: `          question: healQuizQuestionObject({
            ...selectedQ,
            question: cleanQuizQuestion(selectedQ.question)
          }),`
  },
  {
    target: `        question: {
          ...parsedQuestion,
          question: cleanQuizQuestion(parsedQuestion.question)
        },`,
    replace: `        question: healQuizQuestionObject({
          ...parsedQuestion,
          question: cleanQuizQuestion(parsedQuestion.question)
        }),`
  },
  {
    target: `    res.json({ questions: finalQuestions, total: finalQuestions.length, topicCount: topics.length });`,
    replace: `    const healedFinalQuestions = finalQuestions.map(q => healQuizQuestionObject(q));
    res.json({ questions: healedFinalQuestions, total: healedFinalQuestions.length, topicCount: topics.length });`
  }
];

searchReplacements.forEach((item, idx) => {
  if (!content.includes(item.target)) {
    console.warn(`Warning: Replacement ${idx + 1} target not found in server/index.js!`);
  } else {
    content = content.replace(item.target, item.replace);
    console.log(`Successfully applied replacement ${idx + 1}!`);
  }
});

// Convert back to CRLF if original file had CRLF
if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully patched server/index.js via clean Base64 + Mapping!");
