# Taking out a wall is layout data, applied through the active shell

Status: accepted

Which partitions a layout takes out is saved in its finishes (`finishes.structure`), not in the plan. `src/project/structure.ts` derives the active shell from the plan's shell and the open layout's structure, including what a partition carried (door, tiles, accent paint) and what its absence needs (floor patch, bulkhead). Every consumer of walls (rendering, walk collision, wall snapping, overlap and clearance checks, measuring, shadows) reads the active shell, never the plan's shell directly, so A/B comparing a layout with and without a wall is a layout switch.

## Consequences

- New code that reads walls must use `activeWalls()` / `activeShell()`.
- What a partition takes with it is described per plan (`walls.removable`), so the rules stay data.
- Decor hosted on a removed wall stays in the layout and is marked, rather than deleted.
