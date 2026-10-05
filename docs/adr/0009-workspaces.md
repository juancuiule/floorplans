# One apartment's data lives in a workspace, outside the code

Status: amended by [0010](0010-spaces.md): workspaces are the format of examples and imports; the server holds spaces. Amends [0001](0001-dev-server-is-the-backend.md) and [0002](0002-plans-are-bundled-data.md).

The repo started as one person's apartment: its plan in `src/plans/`, its layouts in `data/` and its artwork in `public/artwork/`, mixed with the code that anyone cloning it would use. A workspace is a directory with one apartment's data (`workspace.json`, `plans/`, `layouts/`, `artwork/`), and the dev server opens the one named by `FLOORPLAN_WORKSPACE` (environment or `.env.local`). The code ships with two example workspaces: `examples/loft`, a small neutral flat that opens by default, and `examples/monoambiente`, the apartment the project was built for.

## Considered options

- **Keep the owner's apartment as the default.** Least work, but a stranger's first run opens someone else's home and their 13 MB of personal images, and their own data would sit in the same folders.
- **A separate data repo.** Cleaner ownership, but splits every layout change from the code it needs, and the examples are what the docs and tests point at.

## Consequences

- Plans still reach the app bundled ([0002](0002-plans-are-bundled-data.md)): the workspace plugin (`server/workspace.ts`) generates `virtual:workspace` from the open workspace's plans. Adding or removing a plan restarts the dev server.
- `/artwork/*` is served from the workspace, and a build copies it into `dist/artwork`.
- Layout files move from `data/` to `<workspace>/layouts/`; the file format and slugs are unchanged ([0003](0003-layout-file-format.md)).
- Unit tests run against `examples/monoambiente` (plus the loft plan), because they are written for that apartment's walls and partitions. Browser tests run against whatever the dev server opened, and ask it where its layouts are (`GET /api/workspace`).
- Your own apartment is a workspace you keep anywhere, in this repo or not, and point `FLOORPLAN_WORKSPACE` at.
