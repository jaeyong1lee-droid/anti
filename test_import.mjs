try {
  console.log('Testing import of server/index.js...');
  const module = await import('./server/index.js');
  console.log('Successfully imported server/index.js! Export keys:', Object.keys(module));
} catch (err) {
  console.error('Import error:', err);
}
