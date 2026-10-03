# Spaces: many people's apartments on one server, without accounts yet

Status: accepted, amended by [0011](0011-right-angled-rooms.md) (rooms are drawn as right-angled polygons). Amends [0001](0001-dev-server-is-the-backend.md), [0002](0002-plans-are-bundled-data.md) and [0009](0009-workspaces.md).

The app served one person's apartment from files in the repo. To make it usable by others, one server now holds many **spaces**: a space is one person's (or household's) plans, the layouts of each plan, and their artwork. A space is identified by a random 12-character id in its link (`/?space=<id>`), and that link is the only key to it: there are no accounts yet. The furniture, plant and lamp catalog stays code, the same for everyone; artwork never leaves its space.

The API (`server/api.ts`) is one node:http handler over a storage module (`server/storage.ts`). The Vite dev server mounts it, and `pnpm start` serves it with the built app, so there is now a production server. Storage is a folder (`FLOORPLAN_DATA`, default `storage/`) with one directory per space, shaped like the example workspaces (ADR 0009): files are still diffable and editable by hand, and the dev server still reloads open tabs when a layout changes on disk.

Plans are no longer bundled: the page fetches its plan, checks it, and opens it (`openPlan`) before importing the app, the async step ADR 0002 anticipated. Plans can be drawn in a floor plan editor (`src/pages/floorplan/`): rooms on a grid, doors and windows on walls, a few fittings. A pure function, `planFromSketch` (`src/model/sketch.ts`), derives walls, roles, floors, ceilings and removable partitions from the drawing, and the drawing is kept in the plan (`sketch`) so it can be edited again.

## Considered options

- **Accounts from the start.** Needed eventually, but auth, sessions and recovery would come before anyone can try the app. Unguessable links (as in Excalidraw or many doc tools) give private-enough spaces now, and an owner field can be added to `space.json` later.
- **A database.** Fits many users better, but the data is a few JSON documents and images per space. Files keep hand and agent edits and live reload working; the storage module is the seam to swap.
- **Generating plans from an image with a model.** The first plan was transcribed with an LLM. Drawing rectangles is slower for an expert but needs nothing, and is exact.

## Consequences

- Anyone with a space's link can read and change it. The home page keeps the spaces a browser opened in its local storage; losing a link loses access.
- Layout files live in `<space>/layouts/<plan>/`, one folder per plan, so a plan's main layout is always `decor.json` and the `plan-<id>` naming of ADR 0009 is only read when importing a workspace (`pnpm space:import`).
- Artwork URLs include the space (`/api/spaces/<id>/artwork/<name>`). An artwork whose image cannot be loaded shows as a blank print instead of breaking the scene.
- Examples are templates: a new plan can start as a copy of one, furnished but without its artwork.
- The editor draws axis-aligned rooms only; angled walls, columns and dropped ceilings still need a hand-written plan.
