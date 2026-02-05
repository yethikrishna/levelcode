import { env } from '@levelcode/common/env'

export const getReferralLink = (referralCode: string): string =>
  `${env.NEXT_PUBLIC_LEVELCODE_APP_URL}/referrals/${referralCode}`
