process.env.PORT = '5001';
// Disable automatic backup during startup test to speed up and avoid DB locks
process.env.DISABLE_BACKUP_ON_STARTUP = 'true'; 

console.log('Importing index.js and starting server on port 5001...');
import('./index.js').then(async () => {
  console.log('Waiting 25 seconds for server and DB initialization...');
  await new Promise(resolve => setTimeout(resolve, 25000));
  
  try {
    console.log('Sending request to http://localhost:5001/api/lockscreen/sync?count=1 ...');
    const res = await fetch('http://localhost:5001/api/lockscreen/sync?count=1');
    console.log('Response status:', res.status);
    const data = await res.json();
    console.log('API Response data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch to lockscreen sync failed:', err);
  } finally {
    console.log('Exiting...');
    process.exit(0);
  }
}).catch(err => {
  console.error('Failed to import index.js:', err);
  process.exit(1);
});
