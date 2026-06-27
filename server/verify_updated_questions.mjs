async function main() {
  const url = 'https://anti-ashy.vercel.app/api/session/formula';
  console.log(`Fetching from: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Error status: ${res.status}`);
      return;
    }
    const data = await res.json();
    const formulaQuestions = data.data?.formulaQuestions || [];
    const q11 = formulaQuestions.find(q => q.id === 11 || q.id === '11');
    if (q11) {
      console.log('Found question 11!');
      console.log('Table data:', JSON.stringify(q11.table_data, null, 2));
    } else {
      console.log('Question 11 not found in active session.');
      console.log('Available IDs:', formulaQuestions.map(q => q.id));
    }
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}
main();
