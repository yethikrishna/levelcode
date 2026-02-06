import { env } from '@levelcode/common/env'

export const siteConfig = {
  title: 'LevelCode',
  description:
    'Code faster with AI using LevelCode. Edit your codebase and run terminal commands via natural language instruction.',
  keywords: () => [
    'LevelCode',
    'LevelCode',
    'Coding Assistant',
    'Coding Assistant',
    'Agent',
    'AI',
    'Next.js',
    'React',
    'TypeScript',
  ],
  url: () => env.NEXT_PUBLIC_LEVELCODE_APP_URL,
  googleSiteVerificationId: () =>
    env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID || '',
}
