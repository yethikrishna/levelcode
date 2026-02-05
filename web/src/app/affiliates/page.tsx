import { env } from '@levelcode/common/env'

import AffiliatesClient from './affiliates-client'

import type { Metadata } from 'next'


export async function generateMetadata(): Promise<Metadata> {
  const canonicalUrl = `${env.NEXT_PUBLIC_LEVELCODE_APP_URL}/affiliates`

  const title = 'Affiliate Program – Earn Credits by Referring | LevelCode'
  const description =
    'Join the LevelCode Affiliate Program. Share your unique referral link and earn credits when friends sign up. Both you and your referrals get bonus credits!'

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
    keywords: [
      'affiliate program',
      'referral program',
      'earn credits',
      'LevelCode affiliate',
      'LevelCode referral',
      'AI coding assistant affiliate',
    ],
  }
}

// WebPage JSON-LD schema describing the affiliate program
function WebPageJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'LevelCode Affiliate Program',
    description:
      'Join the LevelCode Affiliate Program. Share your unique referral link and earn credits when friends sign up.',
    url: `${env.NEXT_PUBLIC_LEVELCODE_APP_URL}/affiliates`,
    mainEntity: {
      '@type': 'Service',
      name: 'LevelCode Affiliate Program',
      description:
        'Referral program that rewards users with bonus credits for inviting new users to LevelCode.',
      provider: {
        '@type': 'Organization',
        name: 'LevelCode',
        url: env.NEXT_PUBLIC_LEVELCODE_APP_URL,
      },
      serviceType: 'Affiliate/Referral Program',
      areaServed: 'Worldwide',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description:
          'Free to join. Earn bonus credits for both referrer and referee.',
      },
    },
    isPartOf: {
      '@type': 'WebSite',
      name: 'LevelCode',
      url: env.NEXT_PUBLIC_LEVELCODE_APP_URL,
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

// BreadcrumbList JSON-LD for navigation
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
        name: 'Affiliate Program',
        item: `${env.NEXT_PUBLIC_LEVELCODE_APP_URL}/affiliates`,
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

// Force static generation - content only changes on redeploy
export const dynamic = 'force-static'

export default function AffiliatesPage() {
  return (
    <>
      <WebPageJsonLd />
      <BreadcrumbJsonLd />
      <AffiliatesClient />
    </>
  )
}
