const str = '{"reason":"' + 'a'.repeat(50000) + '"}';
const start = Date.now();
const match = str.match(/"reason"\s*:\s*"([\s\S]*?)"\s*,\s*"/i);
console.log('Time ms:', Date.now() - start);
