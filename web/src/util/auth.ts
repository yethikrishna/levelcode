import type { NextRequest } from 'next/server'

/**
 * Extract api key from x-levelcode-api-key header or authorization header
 */
export function extractApiKeyFromHeader(req: NextRequest): string | undefined {
  const token = req.headers.get('x-levelcode-api-key')
  if (typeof token === 'string' && token) {
    return token
  }

  const authorization = req.headers.get('Authorization')
  if (!authorization) {
    return undefined
  }
  if (!authorization.startsWith('Bearer ')) {
    return undefined
  }
  return authorization.slice('Bearer '.length)
}
