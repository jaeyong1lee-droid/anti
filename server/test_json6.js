const dbVal = '{"text": "foo \\\\n u bar"}';
console.log('dbVal:', dbVal);
console.log('Match with /\\n/ (newline):', dbVal.match(/\n/g));
console.log('Match with /\\\\n/ (backslash n):', dbVal.match(/\\n/g));
console.log('Match with /\\\\\\\\n/ (two backslash n):', dbVal.match(/\\\\n/g));
