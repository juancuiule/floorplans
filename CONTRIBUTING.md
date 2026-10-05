# Contributing

## Before you start

- Read [docs/architecture.md](docs/architecture.md) for where things go, and [GLOSSARY.md](GLOSSARY.md) for what things are called. Use the glossary's terms in code, comments, commits and docs; if a concept has no term yet, add one.
- `pnpm install`, then `pnpm dev`. To work on the apartment the tests are written against, `pnpm space:import examples/monoambiente` and open the link it prints.

## Before you commit

```sh
pnpm check     # typecheck, lint (warnings fail), format check, unit tests
```

CI runs the same and the build. For changes to editing, placement or the scene, also run `pnpm test:e2e` (or one test: `pnpm test:e2e smoke`); see [docs/development.md](docs/development.md#tests).

## Code

- **Respect the layers.** Imports point down the stack in [architecture.md](docs/architecture.md#layers). Logic that does not draw goes in `model/`, `project/`, `plan/` or `decor/`, where it can be unit tested without a canvas.
- **Component files export components.** Constants, hooks, stores and helpers shared between components go in a plain `.ts` module next to them (lint enforces this).
- **Nothing transient in the decor store.** Everything in `useDecor` is saved and undoable; pointer and gesture state goes in `useEdit`.
- **Tell the renderer.** The scene renders on demand: call `invalidate()` after changing it outside React, and `requestShadowUpdate()` after moving geometry.
- **Read walls from the active shell** (`activeShell()`, `activeWalls()`), never from the plan's shell.
- **Comments say why**, or what a non-obvious value means, in plain sentences. Units are meters unless named otherwise.
- **Tests for logic.** New logic in the lower layers gets a unit test in `tests/unit/`.

## Data

- Layout files and plans are a contract with people and agents who edit them by hand. Change their shape only additively, give every new field a default that keeps old files rendering the same, and update the type in `src/model/` and its check (`src/model/validate.ts` for plans, `src/decor/validateLayout.ts` for layouts).
- New URL parameters go in `src/project/launch.ts`, checked, and in `docs/features.md`.
- Commit changes to the example workspaces (`examples/`) separately from code changes.

## Decisions

When a change is hard to reverse, would surprise a future reader, and came from a real trade-off, record it as an ADR in [docs/adr/](docs/adr/): the next number, a short title, and a paragraph on the context, the decision and why. Supersede an ADR with a new one rather than rewriting it.

## Commits

One logical change per commit, with a subject that says what changed for the user or the code ("Walls taken out are saved per layout"), and a body for the why when it is not obvious. Formatting-only commits go in `.git-blame-ignore-revs`.
