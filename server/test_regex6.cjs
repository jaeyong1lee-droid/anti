const parsedText = "```ascii\n  [종축]\n   $t / S_t$\n     │\n```";
const codeBlockRegex = /```(ascii|ascii-art|flowchart|step|sequence|[a-zA-Z0-9_-]*)?\n([\s\S]*?)```/gi;
console.log(codeBlockRegex.test(parsedText));
