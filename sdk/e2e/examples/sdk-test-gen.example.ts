/**
 * Example: SDK Test Generator
 *
 * Generates unit tests for code.
 * Run with: bun run sdk/e2e/examples/sdk-test-gen.example.ts
 */

import { LevelCodeClient } from '../../src/client'

const CODE_TO_TEST = `
function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}
`.trim()

async function main() {
  const apiKey = process.env.LEVELCODE_API_KEY
  if (!apiKey) {
    console.error('LEVELCODE_API_KEY environment variable is required')
    process.exit(1)
  }

  const client = new LevelCodeClient({ apiKey })

  console.log('🧪 Generating tests...\n')
  console.log('Code to test:')
  console.log('```')
  console.log(CODE_TO_TEST)
  console.log('```\n')
  console.log('Generated tests:\n')

  const result = await client.run({
    agent: 'levelcode/base2@latest',
    prompt: `Generate unit tests for these functions using Jest:\n\n${CODE_TO_TEST}`,
    handleStreamChunk: (chunk) => {
      if (typeof chunk === 'string') {
        process.stdout.write(chunk)
      }
    },
  })

  console.log('\n')

  if (result.output.type === 'error') {
    console.error('Error:', result.output.message)
    process.exit(1)
  }

  console.log('✅ Test generation complete!')
}

main().catch(console.error)
