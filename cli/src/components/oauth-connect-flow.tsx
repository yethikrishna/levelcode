import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useKeyboard } from '@opentui/react'
import open from 'open'

import { useTheme } from '../hooks/use-theme'
import { Panel, StatusBadge, KeyHint } from './primitives'
import { ShimmerText } from './shimmer-text'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
} from '@levelcode/common/providers/oauth-flow'
import { startCallbackServer } from '@levelcode/common/providers/oauth-callback-server'
import { saveOAuthToken } from '@levelcode/common/providers/oauth-storage'

import type { OAuthProviderConfig, OAuthToken } from '@levelcode/common/providers/oauth-types'
import type { KeyEvent } from '@opentui/core'

type FlowState = 'initiating' | 'waiting-for-callback' | 'exchanging' | 'success' | 'error'

interface OAuthConnectFlowProps {
  providerId: string
  providerName: string
  config: OAuthProviderConfig
  onSuccess: (token: OAuthToken) => void
  onCancel: () => void
}

export const OAuthConnectFlow: React.FC<OAuthConnectFlowProps> = ({
  providerId,
  providerName,
  config,
  onSuccess,
  onCancel,
}) => {
  const theme = useTheme()
  const [state, setState] = useState<FlowState>('initiating')
  const [error, setError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')

  // CRITICAL: Store the code verifier so it can be reused in manual code submission
  const codeVerifierRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const codeVerifier = generateCodeVerifier()
        codeVerifierRef.current = codeVerifier // Store for later use

        const codeChallenge = generateCodeChallenge(codeVerifier)
        const stateParam = codeVerifier // Same pattern as existing Claude OAuth
        const authUrl = buildAuthorizationUrl(config, codeChallenge, stateParam)

        if (config.callbackMode === 'localhost' && config.localhostPort) {
          const callbackServer = startCallbackServer(config.localhostPort)
          setState('waiting-for-callback')
          await open(authUrl)

          const result = await callbackServer.waitForCallback()
          if (cancelled) { callbackServer.close(); return }

          setState('exchanging')
          const token = await exchangeAuthorizationCode(
            config, result.code, codeVerifier, result.state,
          )
          callbackServer.close()

          if (cancelled) return
          await saveOAuthToken(providerId, token)
          setState('success')
          onSuccess(token)
        } else {
          // Copy-paste mode: open browser, wait for user to paste code
          setState('waiting-for-callback')
          await open(authUrl)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setState('error')
        }
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  const handleManualCodeSubmit = useCallback(async () => {
    if (!manualCode.trim()) return
    const verifier = codeVerifierRef.current
    if (!verifier) {
      setError('No code verifier found. Please restart the flow.')
      setState('error')
      return
    }

    try {
      setState('exchanging')
      // The code from copy-paste includes code#state (same as existing claude-oauth.ts)
      const splits = manualCode.trim().split('#')
      const code = splits[0]!
      const stateParam = splits[1]

      // Use the SAME verifier that was used to generate the challenge
      const token = await exchangeAuthorizationCode(config, code, verifier, stateParam)
      await saveOAuthToken(providerId, token)
      setState('success')
      onSuccess(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }, [manualCode, config, providerId, onSuccess])

  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (key.name === 'escape') {
          onCancel()
          return
        }
        if (config.callbackMode === 'copy-paste' && state === 'waiting-for-callback') {
          if (key.name === 'return' || key.name === 'enter') {
            handleManualCodeSubmit()
            return
          }
          if (key.name === 'backspace' || key.name === 'delete') {
            setManualCode((p) => p.slice(0, -1))
            return
          }
          if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
            setManualCode((p) => p + key.sequence)
            return
          }
        }
        if (state === 'success' || state === 'error') {
          if (key.name === 'return' || key.name === 'enter') {
            onCancel()
            return
          }
        }
      },
      [onCancel, config.callbackMode, state, handleManualCodeSubmit],
    ),
  )

  const getHints = () => {
    if (state === 'waiting-for-callback' && config.callbackMode === 'copy-paste') {
      return [
        { key: 'Enter', label: 'Submit code' },
        { key: 'Esc', label: 'Cancel' },
      ]
    }
    if (state === 'success' || state === 'error') {
      return [
        { key: 'Enter', label: 'Continue' },
        { key: 'Esc', label: 'Close' },
      ]
    }
    return [{ key: 'Esc', label: 'Cancel' }]
  }

  return (
    <Panel title={`Connect ${providerName}`} borderColor={theme.primary}>
      {state === 'initiating' && (
        <ShimmerText text="Starting authorization flow..." primaryColor={theme.secondary} />
      )}

      {state === 'waiting-for-callback' && config.callbackMode === 'localhost' && (
        <box style={{ flexDirection: 'column' }}>
          <text style={{ fg: theme.foreground }}>Browser opened for authorization.</text>
          <ShimmerText text="Waiting for callback..." primaryColor={theme.secondary} />
          <text style={{ fg: theme.muted }}>
            Complete the sign-in in your browser. The token will be captured automatically.
          </text>
        </box>
      )}

      {state === 'waiting-for-callback' && config.callbackMode === 'copy-paste' && (
        <box style={{ flexDirection: 'column' }}>
          <text style={{ fg: theme.foreground }}>
            Browser opened. Sign in and paste the authorization code below:
          </text>
          <box style={{ flexDirection: 'row', paddingTop: 1 }}>
            <text style={{ fg: theme.muted }}>Code: </text>
            <text style={{ fg: manualCode ? theme.foreground : theme.muted }}>
              {manualCode || '(paste code#state here)'}
            </text>
          </box>
          <text style={{ fg: theme.warning, paddingTop: 1 }}>
            Note: Using your subscription in LevelCode is not officially supported by Anthropic.
          </text>
        </box>
      )}

      {state === 'exchanging' && (
        <ShimmerText text="Exchanging code for token..." primaryColor={theme.warning} />
      )}

      {state === 'success' && (
        <box style={{ flexDirection: 'column' }}>
          <StatusBadge variant="connected" label={`${providerName} connected successfully`} />
          <text style={{ fg: theme.muted }}>Token saved and encrypted.</text>
        </box>
      )}

      {state === 'error' && (
        <box style={{ flexDirection: 'column' }}>
          <StatusBadge variant="error" label="Connection failed" />
          <text style={{ fg: theme.error }}>{error}</text>
        </box>
      )}

      <KeyHint hints={getHints()} />
    </Panel>
  )
}
