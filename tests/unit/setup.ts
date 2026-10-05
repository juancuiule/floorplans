import { setScope } from '../../src/decor/api'
import { openPlan } from '../../src/project/plan'
import { PLANS, TEST_SPACE } from './plans'

// Every test file starts with the monoambiente plan open, as src/main.tsx would.
openPlan(PLANS.monoambiente)
setScope(TEST_SPACE, 'monoambiente')

// jsdom has no 2D canvas. The procedural textures (src/scene/patterns.ts) only
// need the calls to succeed, so give them a recording fake instead of a real canvas dep.
if (typeof HTMLCanvasElement !== 'undefined') {
  const calls = new WeakMap<HTMLCanvasElement, string[]>()
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
    if (kind !== '2d') return null
    const log: string[] = calls.get(this) ?? []
    calls.set(this, log)
    const state: Record<string, unknown> = { canvas: this, fillStyle: '#000', globalAlpha: 1 }
    return new Proxy(state, {
      get(target, prop) {
        if (prop in target) return target[prop as string]
        return (..._args: unknown[]) => {
          log.push(String(prop))
          return undefined
        }
      },
      set(target, prop, value) {
        target[prop as string] = value
        return true
      },
    })
  } as unknown as HTMLCanvasElement['getContext']
  ;(globalThis as { __canvasCalls?: typeof calls }).__canvasCalls = calls
}
