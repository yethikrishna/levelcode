#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CONFIG,
  downloadBinary,
  getLatestVersion,
} = require('./installer');

// Clean up old binary
try {
  fs.unlinkSync(CONFIG.binaryPath);
} catch (e) {
  /* ignore if file doesn't exist */
}

/**
 * Rewrite npm's generated bin shims to exec the standalone binary directly.
 *
 * npm's shims are Node scripts: they need `node` on PATH at *run* time,
 * which fails on machines that don't have Node installed (or shells where
 * it isn't on PATH). Node is only truly required at *install* time — so
 * here, while Node is guaranteed to be running, we replace the shims with
 * direct executors for the downloaded binary.
 */
function rewriteBinShims() {
  // npm lays out the global install as <prefix>/node_modules/levelcode, with
  // shims in <prefix>[/bin on unix]. Three levels up from this file.
  const npmBinDir =
    process.platform === 'win32'
      ? path.resolve(__dirname, '..', '..')
      : path.resolve(__dirname, '..', '..', '..', 'bin');
  const shimBase = path.join(npmBinDir, 'levelcode');
  const exe = CONFIG.binaryPath;

  if (process.platform === 'win32') {
    // cmd shim
    fs.writeFileSync(
      shimBase + '.cmd',
      ['@ECHO off', `"${exe}" %*`, 'EXIT /b %ERRORLEVEL%', ''].join('\r\n'),
    );
    // PowerShell shim
    fs.writeFileSync(
      shimBase + '.ps1',
      [`& "${exe}" @args`, 'exit $LASTEXITCODE', ''].join('\r\n'),
    );
    // bash shim (Git Bash / MSYS) — translate C:\...\file to /c/.../file
    const posixPath = exe
      .split(path.sep)
      .join('/')
      .replace(/^([A-Za-z]):/, (_m, drive) => '/' + drive.toLowerCase());
    fs.writeFileSync(
      shimBase,
      ['#!/bin/sh', `exec "${posixPath}" "$@"`, ''].join('\n'),
    );
    try { fs.chmodSync(shimBase, 0o755); } catch (e) { /* best effort */ }
  } else {
    fs.writeFileSync(
      shimBase,
      ['#!/bin/sh', `exec "${exe}" "$@"`, ''].join('\n'),
    );
    try { fs.chmodSync(shimBase, 0o755); } catch (e) { /* best effort */ }
  }
}

async function main() {
  // Download the binary eagerly: Node is guaranteed here (npm install runs
  // this script), while the rewritten shims must run without Node.
  let downloaded = false;
  try {
    const version = await getLatestVersion();
    if (version) {
      await downloadBinary(version);
      downloaded = true;
    }
  } catch (e) {
    // Not fatal: the Node wrapper (index.js) downloads on first run if the
    // binary is missing.
    console.log('(Binary will be downloaded on first run instead)');
  }

  if (downloaded) {
    try {
      rewriteBinShims();
    } catch (e) {
      // Best-effort: if the rewrite fails, npm's generated shims still work
      // wherever Node is on PATH.
    }
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
}

main().catch(() => {
  // postinstall must never fail the install; index.js handles first-run
  // download as a fallback.
  process.exit(0);
});
