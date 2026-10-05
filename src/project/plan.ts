import type { Plan } from '../model/plan'
import { checkedPlan } from '../model/validate'

// The open plan. Plans are fetched from the open space when the page starts
// (src/main.tsx, docs/adr/0010), checked, and opened here before the app's
// modules load: many of them read the plan, or values derived from it, when
// they are imported (docs/adr/0002).

/** The open plan. Set by openPlan() before anything that reads it is imported. */
export let plan: Plan

/** Checks a plan and makes it the open one; a broken plan fails with every problem listed. */
export function openPlan(raw: unknown, source = 'The plan'): Plan {
  plan = checkedPlan(raw, source)
  return plan
}
