# Furniture and plants are parametric code, not imported models

Status: accepted

Every catalog piece is a React Three Fiber component built from boxes and simple shapes, with its sizes, options and finishes described in the catalog (`src/decor/furnitureCatalog.ts`, `src/decor/catalog.ts`). Plants are generated procedurally from a seed. This makes every dimension editable, keeps the bundle free of model files, matches the flat-shaded look and lets a piece be added from a product link and its dimensions.

## Considered options

- **glTF models.** Higher fidelity, but fixed sizes, heavy assets, mismatched styles and an asset pipeline.

## Consequences

- Adding a piece is code: a type, a catalog entry and a component (see `docs/your-own-floorplan.md#7-add-a-piece-that-isnt-in-the-catalog`). `tests/unit/catalog.test.ts` checks every entry.
- Furniture geometry cannot move to a database as data; only the catalog specs could.
