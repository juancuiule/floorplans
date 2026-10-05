# The dev server is the backend; layouts are files in the repo

Status: accepted, amended by [0009](0009-workspaces.md) and [0010](0010-spaces.md) (a server holds many spaces; `pnpm start` serves the API in production)

The app saves through a small API added to the Vite dev server (`server/studioApi.ts`), which reads and writes layout JSON in `data/` and images in `public/artwork/`. There is no database or hosted backend. A layout is then a plain file that can be diffed, committed, branched and edited by hand or by an agent, with open tabs reloading it live, which suits a single owner planning one apartment.

## Considered options

- **Browser storage (localStorage / IndexedDB).** No setup, but layouts would be invisible to git and to editors, and lost with the browser profile.
- **A hosted backend with a database.** Needed for sharing by link and for other users, but adds auth, hosting and migrations before there is a second user.

## Consequences

- `pnpm build` produces a static site that renders but cannot save: the store detects the missing API and starts empty.
- The API is the seam for a future backend. The front end only knows the routes (`/api/decor`, `/api/layouts`, `/api/artwork`, `/api/image`), so a hosted service that answers the same routes per user can replace the plugin. See `docs/your-own-floorplan.md#toward-a-platform`.
- Saving from the app creates commits' worth of churn in `data/`. Layout commits are kept separate from code commits.
