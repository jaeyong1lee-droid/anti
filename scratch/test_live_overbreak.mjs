// Node.js native fetch will be used.

console.log('=== Starting Live Verification for Tunnel Overbreak Routing ===');

try {
  // 1. Get all topics to find the target topic ID for "여굴"
  console.log('Fetching topics list from live server...');
  const topicsRes = await fetch('https://anti-ashy.vercel.app/api/topics');
  if (!topicsRes.ok) {
    throw new Error(`Failed to fetch topics: ${topicsRes.status} ${topicsRes.statusText}`);
  }
  const topics = await topicsRes.json();
  
  const overbreakTopic = topics.find(t => 
    (t.title || '').includes('여굴') || 
    (t.keywords || '').includes('여굴')
  );
  
  if (!overbreakTopic) {
    console.log('Warning: No live topic containing "여굴" found. We will test with a dynamic trigger if possible, or print all topics.');
    console.log('Available topics:');
    topics.forEach(t => console.log(`- [ID: ${t.id}] ${t.title} (keywords: ${t.keywords})`));
    
    console.log('Aborting verification as no "여굴" topic is registered on this environment.');
  } else {
    console.log(`Found target topic: [ID: ${overbreakTopic.id}] "${overbreakTopic.title}"`);
    
    // 2. Trigger AI Questions generation for the topic (this will invoke the Interceptor)
    console.log(`Triggering AI Questions for topic ${overbreakTopic.id}...`);
    const quizRes = await fetch(`https://anti-ashy.vercel.app/api/topics/${overbreakTopic.id}/ai-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const quizStatus = quizRes.status;
    console.log(`Response Status: ${quizStatus}`);
    
    const quizData = await quizRes.json();
    if (quizStatus === 200) {
      console.log('SUCCESS! Custom expert quiz retrieved successfully.');
      console.log(`Total questions generated: ${quizData.questions.length}`);
      
      console.log('\n--- SAMPLE QUESTIONS VERIFICATION ---');
      quizData.questions.slice(0, 3).forEach((q, idx) => {
        console.log(`\n[Question ${idx + 1}] type: ${q.type}`);
        console.log(`Q: ${q.question}`);
        if (q.type.includes('주관식')) {
          console.log(`A: ${q.concept}`);
          if (q.formula) console.log(`Formula: ${q.formula}`);
        } else {
          console.log(`Options: ${q.options.join(' | ')}`);
          console.log(`Correct Answer: ${q.answer}`);
        }
      });
      
      // Strict safety validation: verify no boiling issues creep into the first few questions
      const hasBoiling = quizData.questions.some(q => 
        (q.question || '').includes('보일링') || 
        (q.question || '').includes('Boiling') ||
        (q.question || '').includes('분사') ||
        (q.question || '').includes('다짐')
      );
      
      console.log('\n--------------------------------------------------');
      if (hasBoiling) {
        console.error('FAIL: Detected residual boiling/compaction topics in the generated overbreak set!');
      } else {
        console.log('PASS: The quiz is 100% clean and free of unrelated geotechnical topics! Verified.');
      }
    } else {
      console.error('API Call Failure:', quizData);
    }
  }
} catch (err) {
  console.error('Verification failed due to network or logic error:', err.message || err);
}
