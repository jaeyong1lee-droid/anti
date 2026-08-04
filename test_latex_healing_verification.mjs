import { healLatexFormulas } from './client/src/utils/latexUtils.js';

const testInput = "보기 ①(\\ (94.4 \\text{mm}\\)), ②(\\ (75.1 \\text{mm}\\)), ③(\\ (47.2 \\text{mm}\\)), ④(\\ (120.5 \\text{mm}\\)) 중 어디에도";
const healed = healLatexFormulas(testInput);

console.log("=== RAW INPUT ===");
console.log(testInput);
console.log("\n=== HEALED RESULT ===");
console.log(healed);

if (healed.includes('($94.4 \\text{mm}$)') && healed.includes('($75.1 \\text{mm}$)')) {
  console.log("\n✅ Test Passed: Corrupted (\\ ( ... \\)) formulas successfully restored to standard ($ ... $) format!");
  process.exit(0);
} else {
  console.error("\n❌ Test Failed: Formula healing failed.");
  process.exit(1);
}
