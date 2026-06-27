async function main() {
  const url = 'https://anti-ashy.vercel.app/api/temp-search-db?keyword=Seepage';
  console.log(`Fetching from: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Error status: ${res.status}`);
      return;
    }
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}
main();
