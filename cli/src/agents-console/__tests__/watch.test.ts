import { describe, it, expect } from 'bun:test'

import { renderWatchTick, runWatchLoop } from '../run-agents'

describe('agents watch mode', () => {
  it('renderWatchTick clears the screen and renders the overview', () => {
    const tick = renderWatchTick()
    expect(tick.startsWith('\x1b[2J\x1b[H')).toBe(true)
    expect(tick).toContain('LevelCode agents')
  })

  it('runWatchLoop renders on each interval tick until aborted', async () => {
    const controller = new AbortController()
    let renders = 0
    const sleeps: number[] = []

    const rendered: string[] = []
    const write = process.stdout.write.bind(process.stdout)
    ;(process.stdout as any).write = (chunk: string) => {
      rendered.push(chunk)
      return true
    }

    try {
      const loop = runWatchLoop(5, async (ms) => {
        sleeps.push(ms)
        renders++
        if (renders >= 3) controller.abort()
      }, controller.signal)
      await loop
    } finally {
      ;(process.stdout as any).write = write
    }

    expect(renders).toBe(3)
    expect(sleeps).toEqual([5, 5, 5])
    expect(rendered.length).toBe(3)
    expect(rendered[0]!.startsWith('\x1b[2J\x1b[H')).toBe(true)
  })

  it('runWatchLoop returns immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    let renders = 0
    await runWatchLoop(1, async () => { renders++ }, controller.signal)
    expect(renders).toBe(0)
  })
})
