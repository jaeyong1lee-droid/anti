async function main() {
  const url = 'https://anti-ashy.vercel.app/api/temp-update-db';
  console.log(`Triggering production update at: ${url}`);
  
  for (let i = 1; i <= 12; i++) {
    console.log(`Attempt ${i}/12...`);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log('Response:', data);
        if (data.success || data.error) {
          console.log('Finished polling.');
          break;
        }
      } else {
        console.log(`Failed. Status: ${res.status}`);
      }
    } catch (err) {
      console.log('Error fetching:', err.message);
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}
main();
