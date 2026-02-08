import http from 'http'

interface CallbackResult {
  code: string
  state: string
}

interface CallbackServer {
  server: http.Server
  waitForCallback: () => Promise<CallbackResult>
  close: () => void
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head><title>Authorization Successful</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f8f9fa;">
  <div style="text-align: center; padding: 2rem;">
    <h1 style="color: #22c55e;">Authorization Successful</h1>
    <p>You can close this window and return to the terminal.</p>
  </div>
</body>
</html>`

const ERROR_HTML = `<!DOCTYPE html>
<html>
<head><title>Authorization Failed</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f8f9fa;">
  <div style="text-align: center; padding: 2rem;">
    <h1 style="color: #ef4444;">Authorization Failed</h1>
    <p>Something went wrong. Please try again in the terminal.</p>
  </div>
</body>
</html>`

/**
 * Start a localhost HTTP server to receive the OAuth callback redirect.
 * The server listens for GET /callback?code=XXX&state=YYY and auto-closes
 * after the callback is received or after a 5-minute timeout.
 */
export function startCallbackServer(port: number): CallbackServer {
  let resolveCallback: ((result: CallbackResult) => void) | null = null
  let rejectCallback: ((error: Error) => void) | null = null

  const callbackPromise = new Promise<CallbackResult>((resolve, reject) => {
    resolveCallback = resolve
    rejectCallback = reject
  })

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)

    if (url.pathname === '/callback' && req.method === 'GET') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(ERROR_HTML)
        rejectCallback?.(new Error(`OAuth callback error: ${error}`))
        return
      }

      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(ERROR_HTML)
        rejectCallback?.(new Error('Missing code or state in OAuth callback'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(SUCCESS_HTML)
      resolveCallback?.({ code, state })
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  server.listen(port, '127.0.0.1')

  // Auto-close after 5 minutes
  const timeout = setTimeout(() => {
    server.close()
    rejectCallback?.(new Error('OAuth callback timed out after 5 minutes'))
  }, 5 * 60 * 1000)

  const close = () => {
    clearTimeout(timeout)
    server.close()
  }

  const waitForCallback = async (): Promise<CallbackResult> => {
    try {
      const result = await callbackPromise
      return result
    } finally {
      close()
    }
  }

  return { server, waitForCallback, close }
}
