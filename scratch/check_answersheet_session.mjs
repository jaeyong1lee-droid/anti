async function main() {
  try {
    const res1 = await fetch('http://localhost:5000/api/session/formula');
    const data1 = await res1.json();
    console.log("=== FORMULA SESSION DATA ===");
    console.log(JSON.stringify(data1, null, 2).substring(0, 1000));
  } catch (e) {
    console.error("Formula session fetch failed:", e.message);
  }

  try {
    const res2 = await fetch('http://localhost:5000/api/session/exam');
    const data2 = await res2.json();
    console.log("=== EXAM SESSION DATA ===");
    console.log(JSON.stringify(data2, null, 2).substring(0, 1000));
  } catch (e) {
    console.error("Exam session fetch failed:", e.message);
  }
}

main();
