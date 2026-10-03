# Drawn rooms are right-angled polygons; the 3D app gets rectangles

Status: accepted

The floor plan editor draws a room as a polygon of any number of corners (an L, a U, an alcove), but every edge runs along x or z. The 3D app already assumes that in several places: decor hangs and snaps to walls facing one of four directions (`Facing` is `x+ | x- | z+ | z-`), and the measure tool, taking a wall out and painting per room work on axis-aligned walls. Keeping drawn rooms right-angled lets them work everywhere at once. `planFromSketch` cuts each room into rectangles (`rectangles` in `src/model/polygon.ts`) for the plan's floors, ceilings and rooms, which stay rectangles; the room's largest piece carries its label.

## Considered options

- **Any angle now.** Diagonal walls render already, but placement, hanging, measuring, wall removal and per-room paint would all need to learn arbitrary directions, and floors would need polygon geometry. Too much at once to do well.

## Consequences

- An L-shaped room is several rooms in the plan with the same name; per-room paint already treats same-named rooms as one (`paintFaces`).
- A side of a piece that is partly open to the rest of its room is not shrunk by half a wall, so wall faces along it still find the room.
- Sketches from before polygons (`version: 1`, rooms as rectangles) are read as polygons (`readSketch`).
- Angled walls are the next step: `Facing` becomes a direction, and the axis-aligned code paths above take a wall frame instead.
