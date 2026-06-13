import fs from 'fs';

const clientPath = 'client/src/utils/latexUtils.js';
const serverPath = 'server/utils/latexUtils.js';

const clientContent = fs.readFileSync(clientPath, 'utf8');
const serverContent = fs.readFileSync(serverPath, 'utf8');

// Extract healLatexFormulas from client
const clientStartMarker = 'export function healLatexFormulas(text) {';
const clientEndMarker = 'export const LATEX_CHAT_PROMPT_INSTRUCTIONS = `';

const clientStartIndex = clientContent.indexOf(clientStartMarker);
const clientEndIndex = clientContent.indexOf(clientEndMarker);

if (clientStartIndex === -1 || clientEndIndex === -1) {
  console.error("Could not find markers in client/src/utils/latexUtils.js!");
  process.exit(1);
}

const extractedHealer = clientContent.substring(clientStartIndex, clientEndIndex);

// Replace in server
const serverStartMarker = 'export function healLatexFormulas(text) {';
const serverEndMarker = '// 💡 [업그레이드] 프로토타입 오염 및 프레임워크 관찰 객체 순회 한계를 극복한 마스터 딥 힐러';

const serverStartIndex = serverContent.indexOf(serverStartMarker);
const serverEndIndex = serverContent.indexOf(serverEndMarker);

if (serverStartIndex === -1 || serverEndIndex === -1) {
  console.error("Could not find markers in server/utils/latexUtils.js!");
  process.exit(1);
}

const before = serverContent.substring(0, serverStartIndex);
const after = serverContent.substring(serverEndIndex);

const newServerContent = before + extractedHealer + after;
fs.writeFileSync(serverPath, newServerContent, 'utf8');
console.log("Successfully copied and patched server/utils/latexUtils.js from client!");
