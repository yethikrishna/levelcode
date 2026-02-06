import { env, IS_DEV, IS_TEST, IS_PROD } from '@levelcode/common/env'

export { IS_DEV, IS_TEST, IS_PROD }

export const LEVELCODE_BINARY = 'levelcode'

export const WEBSITE_URL = env.NEXT_PUBLIC_LEVELCODE_APP_URL || ''
