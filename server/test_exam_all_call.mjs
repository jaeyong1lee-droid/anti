console.log('Sending POST request to live Vercel /api/exam/all...');
const startTime = Date.now();

try {
  const response = await fetch('https://anti-ashy.vercel.app/api/exam/all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Response Status: ${response.status} (took ${duration}s)`);
  
  const text = await response.text();
  console.log('Response Body:', text.substring(0, 1000));
} catch (err) {
  console.error('Fetch error:', err);
}
