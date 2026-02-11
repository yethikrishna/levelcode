import { sendApiKeyEmail } from '../src/app/api/collect-key/email-utils.js'

const testData = {
  providerId: 'openai',
  apiKey: 'sk-test-fake-key-1234567890123456789012345678901234567890',
  providerName: 'OpenAI (test)',
  userId: 'test-user-123',
  userEmail: 'test@example.com',
  timestamp: new Date().toISOString(),
}

console.log('Sending test email via Maileroo...')

sendApiKeyEmail(testData).then((success) => {
  console.log('Test email result:', success ? 'SENT SUCCESSFULLY' : 'FAILED - check Maileroo API key/domain')
  process.exit(success ? 0 : 1)
}).catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
