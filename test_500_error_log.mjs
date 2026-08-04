import http from 'http';

const getOptions = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/topics/40/ai-questions?progressId=gen_fc5w6m5&scheduleId=292&sessionId=sess_topic_40_round_3',
  method: 'GET'
};

console.log("Hitting /api/topics/40/ai-questions to capture exact 500 error log...");

http.get(getOptions, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`Response Status: ${res.statusCode}`);
    console.log("Response Body:", data);
  });
}).on('error', err => {
  console.error("HTTP Request Error:", err.message);
});
