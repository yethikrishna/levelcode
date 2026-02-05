import { mock } from 'bun:test'

import type { LevelCodeApiClient } from '../../utils/levelcode-api'

export interface MockApiClientOverrides {
  get?: ReturnType<typeof mock>
  post?: ReturnType<typeof mock>
  put?: ReturnType<typeof mock>
  patch?: ReturnType<typeof mock>
  delete?: ReturnType<typeof mock>
  request?: ReturnType<typeof mock>
  me?: ReturnType<typeof mock>
  usage?: ReturnType<typeof mock>
  loginCode?: ReturnType<typeof mock>
  loginStatus?: ReturnType<typeof mock>
  referral?: ReturnType<typeof mock>
  publish?: ReturnType<typeof mock>
  logout?: ReturnType<typeof mock>
  baseUrl?: string
  authToken?: string
}

/**
 * Default OK response for mock API methods.
 * Returns { ok: true, status: 200 } without data, matching our ApiResponse type
 * where `data` is optional for responses without a body.
 */
const defaultOkResponse = () =>
  Promise.resolve({ ok: true as const, status: 200 })

/**
 * Creates a mock LevelCodeApiClient with sensible defaults.
 * All methods return { ok: true, status: 200 } by default.
 * Pass overrides to customize specific methods.
 */
export const createMockApiClient = (
  overrides: MockApiClientOverrides = {},
): LevelCodeApiClient => ({
  get: (overrides.get ?? mock(defaultOkResponse)) as LevelCodeApiClient['get'],
  post: (overrides.post ??
    mock(defaultOkResponse)) as LevelCodeApiClient['post'],
  put: (overrides.put ?? mock(defaultOkResponse)) as LevelCodeApiClient['put'],
  patch: (overrides.patch ??
    mock(defaultOkResponse)) as LevelCodeApiClient['patch'],
  delete: (overrides.delete ??
    mock(defaultOkResponse)) as LevelCodeApiClient['delete'],
  request: (overrides.request ??
    mock(defaultOkResponse)) as LevelCodeApiClient['request'],
  me: (overrides.me ?? mock(defaultOkResponse)) as LevelCodeApiClient['me'],
  usage: (overrides.usage ??
    mock(defaultOkResponse)) as LevelCodeApiClient['usage'],
  loginCode: (overrides.loginCode ??
    mock(defaultOkResponse)) as LevelCodeApiClient['loginCode'],
  loginStatus: (overrides.loginStatus ??
    mock(defaultOkResponse)) as LevelCodeApiClient['loginStatus'],
  referral: (overrides.referral ??
    mock(defaultOkResponse)) as LevelCodeApiClient['referral'],
  publish: (overrides.publish ??
    mock(defaultOkResponse)) as LevelCodeApiClient['publish'],
  logout: (overrides.logout ??
    mock(defaultOkResponse)) as LevelCodeApiClient['logout'],
  baseUrl: overrides.baseUrl ?? 'https://test.levelcode.com',
  authToken: overrides.authToken,
})
