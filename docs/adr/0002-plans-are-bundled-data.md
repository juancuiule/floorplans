# Plans are data files, bundled and chosen once per page load

Status: accepted, amended by [0009](0009-workspaces.md) and [0010](0010-spaces.md) (plans are fetched at startup, not bundled)

Everything specific to an apartment lives in a plan file (`src/plans/<id>.plan.json`, typed by `src/model/plan.ts`); what a plan does not spell out is derived from its geometry (`src/project/derived.ts`). The code knows no apartment by name. All plans are bundled with `import.meta.glob`, and `src/project/plan.ts` picks one from `?plan=` when the module loads and exports it as a constant, so switching plans is a page reload.

## Considered options

- **Plan as React context or store state.** Allows switching without a reload, but almost every module (geometry, placement, walk collision, shadows, derived cameras) reads the plan, and threading it through all of them costs more than a reload saves.
- **Apartment-specific code.** Where the project started; it made a second apartment impossible.

## Consequences

- Modules may read `plan` (and values derived from it) at import time.
- Loading plans at runtime (uploaded by users) means turning the constant into an async step before the app mounts, not rewriting its readers.
- Some assumptions from the first apartment are still in code rather than in the plan: the four floor zones, the bathroom tile options and the balcony in the sun occluders.
