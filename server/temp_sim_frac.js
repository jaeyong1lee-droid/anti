const rawJson = `{"yAxisLabel": "시간-침하비 \\frac{t}{S_t} (일/cm)"}`;
// This is exactly what the AI outputted if it didn't escape the backslash!
console.log("Raw JSON string:", rawJson);

try {
  const parsed = JSON.parse(rawJson);
  console.log("Parsed yAxisLabel:", parsed.yAxisLabel);
  for (let i = 0; i < parsed.yAxisLabel.length; i++) {
    const ch = parsed.yAxisLabel[i];
    const code = ch.charCodeAt(0);
    console.log(`[${i}] '${ch}' U+${code.toString(16).padStart(4,'0')}`);
  }
} catch(e) {
  console.log("Error:", e.message);
}

const rawJson2 = `{"yAxisLabel": "시간-침하비 $\\frac{t}{S_t}$ (일/cm)"}`;
try {
  const parsed = JSON.parse(rawJson2);
  console.log("\nParsed yAxisLabel 2:", parsed.yAxisLabel);
} catch(e) {
  console.log("Error 2:", e.message);
}
