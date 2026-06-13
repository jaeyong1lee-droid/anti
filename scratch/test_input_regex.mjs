const text = '$[INPUT_1]$';
const regex = /\$?\[\s*INPUT_(\d+)\s*\]\$?/gi;
console.log("Restored:", text.replace(regex, '[INPUT_$1]'));
