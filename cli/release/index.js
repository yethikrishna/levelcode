#!/usr/bin/env node

/**
 * Node fallback launcher for the levelcode npm package.
 *
 * postinstall downloads the binary eagerly and rewrites the bin shims to
 * exec it directly (no Node needed at run time). This script covers the
 * remaining cases: shim rewrite skipped (download failed at install),
 * non-global installs, and the background update check.
 */

const { spawn } = require('child_process')

const {
  CONFIG,
  compareVersions,
  downloadBinary,
  getCurrentVersion,
  getLatestVersion,
  term,
} = require('./installer')

async function ensureBinaryExists() {
  const currentVersion = getCurrentVersion()
  if (currentVersion !== null) {
    return
  }

  const version = await getLatestVersion()
  if (!version) {
    console.error('❌ Failed to determine latest version')
    console.error('Please check your internet connection and try again')
    process.exit(1)
  }

  try {
    await downloadBinary(version)
  } catch (error) {
    term.clearLine()
    console.error('❌ Failed to download levelcode:', error.message)
    console.error('Please check your internet connection and try again')
    process.exit(1)
  }
}

async function checkForUpdates(runningProcess, exitListener) {
  try {
    const currentVersion = getCurrentVersion()

    const latestVersion = await getLatestVersion()
    if (!latestVersion) return

    if (
      // Download new version if current version is unknown or outdated.
      currentVersion === null ||
      compareVersions(currentVersion, latestVersion) < 0
    ) {
      term.clearLine()

      runningProcess.removeListener('exit', exitListener)
      runningProcess.kill('SIGTERM')

      await new Promise((resolve) => {
        runningProcess.on('exit', resolve)
        setTimeout(() => {
          if (!runningProcess.killed) {
            runningProcess.kill('SIGKILL')
          }
          resolve()
        }, 5000)
      })

      console.log(`Update available: ${currentVersion} → ${latestVersion}`)

      await downloadBinary(latestVersion)

      const newChild = spawn(CONFIG.binaryPath, process.argv.slice(2), {
        stdio: 'inherit',
        detached: false,
      })

      newChild.on('exit', (code) => {
        process.exit(code || 0)
      })

      return new Promise(() => {})
    }
  } catch (error) {
    // Ignore update failures
  }
}

async function main() {
  await ensureBinaryExists()

  const child = spawn(CONFIG.binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
  })

  const exitListener = (code) => {
    process.exit(code || 0)
  }

  child.on('exit', exitListener)

  setTimeout(() => {
    checkForUpdates(child, exitListener)
  }, 100)
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error.message)
  process.exit(1)
})
