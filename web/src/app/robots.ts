import { env } from '@levelcode/common/env'

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${env.NEXT_PUBLIC_LEVELCODE_APP_URL}/sitemap.xml`,
  }
}
