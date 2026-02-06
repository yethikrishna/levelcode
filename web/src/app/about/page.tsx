import { env } from '@levelcode/common/env'

import AboutClient from './about-client'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = `${env.NEXT_PUBLIC_LEVELCODE_APP_URL}/about`

  const title = 'About – Built for Developers, by Developers | LevelCode'
  const description =
    'Learn about the team behind LevelCode. Our mission is making AI-powered coding accessible to everyone through open source.'

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
        name: 'About',
        item: `${env.NEXT_PUBLIC_LEVELCODE_APP_URL}/about`,
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

export default function AboutPage() {
  return (
    <>
      <BreadcrumbJsonLd />
      <AboutClient />
    </>
  )
}
