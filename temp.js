let text = '상부 하중 < strong > 100 %를 말뚝이 부담</ strong > (Raft 접지압 기여 무시) Q < sub > total </ sub > = Q < sub > raft + Q < sub > pile )';

const formatTags = ['strong', 'em', 'b', 'i', 'u', 'span', 'div', 'p', 'br', 'table', 'tr', 'td', 'th', 'tbody', 'thead'];
const formatRegex = new RegExp(`(<\\s*\\/?\\s*)(${formatTags.join('|')})\\b(\\s*[^>]*)?>`, 'gi');
text = text.replace(formatRegex, (match, prefix, tag, suffix) => {
  const isClosing = prefix.includes('/');
  return (isClosing ? '</' : '<') + tag + (suffix ? suffix.trim() : '') + '>';
});

text = text.replace(/<\s*\/\s*sub\s*>/gi, '');
text = text.replace(/\s*<\s*sub\s*>\s*/gi, '_');
text = text.replace(/<\s*\/\s*sup\s*>/gi, '');
text = text.replace(/\s*<\s*sup\s*>\s*/gi, '^');

console.log(text);
