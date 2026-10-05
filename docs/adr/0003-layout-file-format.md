# Layout files: one per layout, only what differs from the defaults

Status: accepted (since [0009](0009-workspaces.md), layout files live in the workspace's `layouts/` folder instead of `data/`)

A layout is one JSON file (`data/decor.json` for the default plan's main layout, `data/decor.<slug>.json` otherwise; type `DecorFile` in `src/model/decor.ts`). Its file name is its identity, and its display name, plan, finishes and group names are written only when they differ from the defaults. Every new finish option gets a default that reproduces the original look, so files written before the option existed render unchanged and diffs stay small.

## Consequences

- No migrations: readers normalize (`normalizeFinishes`, `migrateAccent`) instead of rewriting files.
- The file is the contract for hand edits and for agents, so its shape changes only additively and `version` stays `1` until a change cannot be read by old code.
- Renaming a named layout renames its file. Main layouts keep their file and take only the new name.
