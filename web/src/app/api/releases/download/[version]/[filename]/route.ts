import { NextResponse } from 'next/server'

import type { NextRequest} from 'next/server';

/**
 * Proxy endpoint for CLI binary downloads.
 * Redirects to the actual download location (currently GitHub releases).
 * This allows us to change the download location in the future without breaking old CLI versions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ version: string; filename: string }> },
) {
  const { version, filename } = await params

  if (!version || !filename) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  // Current download location - can be changed in the future without affecting old clients
  // Env-overridable so forks/self-hosted deploys can repoint without code edits.
  // Defaults to this repository's GitHub releases.
  const releasesBase =
    process.env.LEVELCODE_RELEASES_BASE_URL ||
    'https://github.com/yethikrishna/levelcode/releases/download'
  const downloadUrl = `${releasesBase}/v${version}/${filename}`

  return NextResponse.redirect(downloadUrl, 302)
}
