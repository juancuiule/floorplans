import loft from '../../examples/loft/plans/loft.plan.json'
import monoambiente from '../../examples/monoambiente/plans/monoambiente.plan.json'

// The plans unit tests run against. Most tests are written for the monoambiente
// example; a few cover the loft too.

export const PLANS: Record<string, unknown> = { loft, monoambiente }

/**
 * Opens the plan named by ?plan= (monoambiente without one) in the current
 * module graph and points the API at it in the test space, as src/main.tsx does
 * at startup. Call it right after
 * vi.resetModules(), before importing anything that reads the plan.
 */
export async function openTestPlan() {
  const { openPlan } = await import('../../src/project/plan')
  const { setScope } = await import('../../src/decor/api')
  const id = new URLSearchParams(window.location.search).get('plan') ?? 'monoambiente'
  openPlan(PLANS[id])
  setScope(TEST_SPACE, id)
}

/** The space the API calls of unit tests go to. */
export const TEST_SPACE = 'test'

/** The URL of a plan route in the test space, e.g. planUrl('decor?file=unit'). */
export const planUrl = (rest: string, plan = 'monoambiente') => `/api/spaces/${TEST_SPACE}/plans/${plan}/${rest}`
