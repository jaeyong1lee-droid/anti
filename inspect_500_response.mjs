import https from 'https';

https.get('https://anti-ashy.vercel.app/api/topics', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('Body:', body);
  });
});
