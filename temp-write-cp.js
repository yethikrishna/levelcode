const fs = require('fs');
const path = require('path');
const content = require('fs').readFileSync(process.argv[2], 'utf-8');
const outPath = path.resolve(process.argv[3]);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content, 'utf-8');
console.log('OK:', outPath, content.length, 'bytes');
