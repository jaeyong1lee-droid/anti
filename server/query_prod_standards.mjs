async function main() {
  const url = 'https://anti-ashy.vercel.app/api/grading-standards';
  console.log(`Fetching from: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Error status: ${res.status}`);
      return;
    }
    const data = await res.json();
    console.log('Standards count:', data.standards?.length);
    console.log('Titles:', data.standards?.map(s => s.title));
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}
main();
