#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

// Clean up old binary
const binaryPath = path.join(
  os.homedir(),
  '.config',
  'levelcode',
  process.platform === 'win32' ? 'levelcode.exe' : 'levelcode'
);

try {
  fs.unlinkSync(binaryPath);
} catch (e) {
  /* ignore if file doesn't exist */
}

// Print welcome message
console.log('\n');
console.log('🎉 Welcome to LevelCode!');
console.log('\n');
console.log('To get started:');
console.log('  1. cd to your project directory');
console.log('  2. Run: levelcode');
console.log('\n');
console.log('Example:');
console.log('  $ cd ~/my-project');
console.log('  $ levelcode');
console.log('\n');
console.log('For more information, visit: https://levelcode.vercel.app/docs');
console.log('\n');
