# Rooms are traced to the inside of their walls

Status: accepted

A floor plan picture (a listing's, a building's) shows rooms between thick walls, and gives their sizes between the walls. Before this, the editor drew rooms on wall centerlines: tracing a picture meant guessing where each centerline was, rooms traced along the inside of their walls came out a wall short, and two rooms traced on either side of a partition left a gap that became two outer walls. The editor now reads a drawing the way the picture is drawn:

- **Outer walls stand outside the room's edge.** A wall with nothing beyond it is centered half its thickness out (`Segment.shift` in `src/model/sketch.ts`); its corners run on to the far face of the outer wall they meet, which closes outside corners and stops at inside ones. The edge is the wall's inner face, so the room keeps all of its floor.
- **Walls between rooms stay centered on the shared edge**, including the one onto a balcony.
- **A gap up to 35 cm between two rooms closes in the middle** when a room is drawn or reshaped (`closeGaps` in `src/pages/floorplan/editing.ts`): both edges move to its middle line, the wall's centerline. Snapping to other rooms' edges is weaker over a reference image (5 cm, not 15), so a corner clicked on the far face of a wall is not pulled across it before the gap can close.
- **Sizes and areas are clear**, between the walls, in the drawing, the panel and the 3D labels, so they can be checked against the picture.

## Considered options

- **Keep centerlines, and ask for wall thicknesses while tracing.** Exact, but it asks people to think about something the picture does not show.
- **Trace walls instead of rooms** (as in The Sims). Natural for building, but a plan picture is read room by room, and rooms are what the 3D app needs (floors, paint, labels).
- **Close gaps by moving only the new room** onto its neighbor's edge. Simpler, but the partition then sits 5 cm off, and the rooms on either side are each that much off their sizes.

## Consequences

- Sketches carry `outerWalls`: `'outside'` for every new one, missing (centered, as before) for sketches drawn earlier, which keep making the same plan.
- A wall onto a balcony is centered, so a room traced to its inner face loses half of it; trace both sides and the gap closes on its centerline.
- A layout made for another plan of the same apartment can be brought over (`fitLayout` in `src/decor/transfer.ts`): positions are mapped from one plan's inside to the other's, wall items move onto the nearest wall facing the same way, paint follows the wall faces, and walls taken out come back.
