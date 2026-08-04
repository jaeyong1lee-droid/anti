import http from 'http';

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/session/review/topic/50-02',
  method: 'DELETE'
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`[DELETE /api/session/review/topic/50-02] Status: ${res.statusCode}`);
    console.log(`Response:`, data);
  });
});

req.on('error', (err) => {
  console.error("Delete Error:", err.message);
});

req.end();
