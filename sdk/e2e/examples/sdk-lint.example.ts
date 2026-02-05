/**
 * Example: SDK Lint
 *
 * An AI-powered linter that finds issues in code.
 * Run with: bun run sdk/e2e/examples/sdk-lint.example.ts
 */

import { LevelCodeClient } from '../../src/client'

const CODE_TO_LINT = `
class Calculator {
  result = 0;
  
  add(n) {
    this.result += n;
  }
  
  divide(n) {
    this.result /= n; // Bug: division by zero not handled
  }
  
  getResult() {
    return this.result;
  }
}
`.trim()

async function main() {
  const apiKey = process.env.LEVELCODE_API_KEY
  if (!apiKey) {
    console.error('LEVELCODE_API_KEY environment variable is required')
    process.exit(1)
  }

  const client = new LevelCodeClient({ apiKey })

  console.log('🔎 Linting code...\n')
  console.log('Code:')
  console.log('```')
  console.log(CODE_TO_LINT)
  console.log('```\n')
  console.log('Lint results:\n')

  const result = await client.run({
    agent: 'levelcode/base2@latest',
    prompt: `Act as a linter. Find issues in this code and provide specific feedback:\n\n${CODE_TO_LINT}`,
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

  console.log('✅ Linting complete!')
}

main().catch(console.error)
