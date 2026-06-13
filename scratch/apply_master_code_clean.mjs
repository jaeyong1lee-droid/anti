import fs from 'fs';

const clientPath = 'client/src/utils/latexUtils.js';
const serverPath = 'server/utils/latexUtils.js';
const masterPath = 'scratch/master_code.txt';

// Read existing contents to extract prompt instructions
const clientContent = fs.readFileSync(clientPath, 'utf8');
const serverContent = fs.readFileSync(serverPath, 'utf8');
const coreLogic = fs.readFileSync(masterPath, 'utf8');

const clientChatInstructionsStart = clientContent.indexOf('export const LATEX_CHAT_PROMPT_INSTRUCTIONS = `');
const clientChatInstructionsEnd = clientContent.indexOf('`;', clientChatInstructionsStart) + 2;
const clientChatInstructions = clientContent.substring(clientChatInstructionsStart, clientChatInstructionsEnd);

const serverPromptInstructionsStart = serverContent.indexOf('export const LATEX_PROMPT_INSTRUCTIONS = `');
const serverPromptInstructionsEnd = serverContent.indexOf('`;', serverPromptInstructionsStart) + 2;
const serverPromptInstructions = serverContent.substring(serverPromptInstructionsStart, serverPromptInstructionsEnd);

const serverChatInstructionsStart = serverContent.indexOf('export const LATEX_CHAT_PROMPT_INSTRUCTIONS = `');
const serverChatInstructionsEnd = serverContent.indexOf('`;', serverChatInstructionsStart) + 2;
const serverChatInstructions = serverContent.substring(serverChatInstructionsStart, serverChatInstructionsEnd);

// Build clean client file
const newClientContent = coreLogic + '\n' + clientChatInstructions + '\n';
fs.writeFileSync(clientPath, newClientContent, 'utf8');
console.log("Recreated client/src/utils/latexUtils.js successfully!");

// Build clean server file
const newServerContent = coreLogic + '\n' + serverPromptInstructions + '\n\n' + serverChatInstructions + '\n';
fs.writeFileSync(serverPath, newServerContent, 'utf8');
console.log("Recreated server/utils/latexUtils.js successfully!");
