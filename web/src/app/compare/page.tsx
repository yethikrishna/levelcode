import { env } from '@levelcode/common/env'

import CompareClient from './compare-client'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = `${env.NEXT_PUBLIC_LEVELCODE_APP_URL}/compare`

  const title = 'Compare – How LevelCode Compares to Other AI Coding Tools'
  const description =
    'See how LevelCode stacks up against Claude Code, Cursor, Aider, and GitHub Copilot. Open source, multi-agent, and 61% benchmark accuracy on 175+ tasks.'

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      siteName: 'LevelCode',
      images: '/opengraph-image.png',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: '/opengraph-image.png',
    },
  }
}

function BreadcrumbJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: env.NEXT_PUBLIC_LEVELCODE_APP_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Compare',
        item: `${env.NEXT_PUBLIC_LEVELCODE_APP_URL}/compare`,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

export const dynamic = 'force-static'

export default function ComparePage() {
  return (
    <>
      <BreadcrumbJsonLd />
      <CompareClient />
    </>
  )
}
