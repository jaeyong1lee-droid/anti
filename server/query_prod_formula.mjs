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
    console.log('Data:', JSON.stringify(data, null, 2).substring(0, 2000));
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}
main();
