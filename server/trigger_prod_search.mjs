async function main() {
  const url = 'https://anti-ashy.vercel.app/api/temp-search-db?keyword=' + encodeURIComponent('침윤선');
  console.log(`Triggering production search at: ${url}`);
  
  for (let i = 1; i <= 12; i++) {
    console.log(`Attempt ${i}/12...`);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log('Results count:', data.results?.length);
        if (data.results && data.results.length > 0) {
          console.log('Found matches:');
          data.results.forEach(r => {
            console.log(`Table: ${r.table}, Column: ${r.col}, Count: ${r.count}`);
            r.rows.forEach(row => {
              console.log('Row:', JSON.stringify(row).substring(0, 1500));
            });
          });
          break;
        } else if (data.results && data.results.length === 0) {
          console.log('No results found.');
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
