# Monoambiente

A 3D model of an apartment for planning its interior: the apartment as it is built, and any number of furnished, painted "what if" versions of it.

## The apartment

**Space**:
One person's or household's corner of the app: their plans, the layouts of each, and their artwork. Its link is its key.
_Avoid_: account, tenant, project

**Workspace**:
A folder with one apartment's data (plans, layouts, artwork), the shape of the examples and of what can be imported as a space.
_Avoid_: data folder

**Template**:
An example plan a new plan can start as a copy of, furnished but without artwork.

**Sketch**:
A floor plan as drawn in the editor: right-angled rooms on wall centerlines, openings and fittings by position, and the reference image. The plan is worked out from it.
_Avoid_: drawing, draft (a draft is a decor item being placed)

**Reference image**:
A picture of the floor plan shown under a sketch to trace, scaled by a known length.
_Avoid_: background, underlay

**Plan**:
One apartment as data: its shell, fixtures, materials, location and the design rules that apply to it (which partitions can come out, which walls take an accent color).
_Avoid_: project, floorplan, model

**Shell**:
The built envelope of a plan: walls with their openings, rooms, floors, ceilings and bulges.
_Avoid_: structure (that word means something else here), geometry

**Wall**:
A straight wall, described by its centerline, thickness and height. Exterior, party, facade and partition are its roles.

**Partition**:
An interior wall that a layout may take out. Exterior walls, party walls and walls that carry load are never partitions.
_Avoid_: removable wall, interior wall

**Opening**:
A door, window or passage cut into a wall.

**Room**:
A named rectangle of usable floor inside the shell, with its own floor finish zone.

**Bulge**:
A column, beam or soffit that sticks out of a wall or ceiling.

**Fixture**:
A fitting that comes with the apartment and never moves: toilet, basin, shower tray, counter, sink, cooktop, downlight, railing.
_Avoid_: object, fitting

**Orientation**:
The compass bearing the plan's facade faces (its +x axis), which decides where the sun comes in.
_Avoid_: facing (that is a decor item's wall side)

## Layouts

**Layout**:
A furnished version of a plan: its decor items, groups and finishes. A plan has any number of layouts.
_Avoid_: decor file, arrangement, variant, scene

**Main layout**:
The layout a plan opens with, shown as "Current". It can be renamed but not deleted.
_Avoid_: default layout

**Slug**:
A layout's identity: lowercase letters, digits and dashes, derived from its name.

**Finishes**:
A layout's choices about surfaces and structure: floors per zone, wall and ceiling paint, bathroom tiles, shower options and the structure.

**Structure**:
Which partitions a layout takes out, and whether the entry's dropped ceiling is raised.
_Avoid_: what-if walls, removed walls

**Active shell**:
The shell as a layout has it: minus the partitions its structure takes out, with what those partitions carried.

**Paint face**:
One side of one wall, split by the room it faces, which can take its own color.

**Accent wall**:
A paint face offered by the plan as a feature color.

## Decor

**Decor item**:
Anything a layout places in the apartment. Every item is one of four kinds: artwork, plant, lamp or furniture.
_Avoid_: object, piece (in code and docs; "piece" is fine in UI copy)

**Kind**:
Which of the four families a decor item belongs to.
_Avoid_: type (a furniture item's `type` is the model within its kind)

**Mount**:
How a decor item attaches to the apartment: on a wall, on a surface (the floor or anything flat on top of furniture), or from the ceiling.

**Host**:
The wall a wall-mounted item hangs on.

**Facing**:
Which way a wall-mounted item faces: the outward normal of its host's surface.

**Tabletop item**:
Small furniture that stands on counters, desks and shelves rather than the floor.

**Rests on**:
A surface item rests on a piece of furniture when it stands inside that piece's footprint, on its top. What rests on a piece moves with it.

**Draft**:
A decor item that follows the pointer and is not part of the layout until it is dropped.

**Placed**:
A decor item that has been dropped somewhere. An unplaced item waits below the floor, out of sight.

**Group**:
Decor items that are selected and moved as one, optionally named.

**Selection**:
The decor items being edited. Its primary item is the one the inspector shows.

**Catalog**:
The built-in decor a layout can place: furniture models, plant species, lamp types, frame and pot styles.
_Avoid_: library (that is the artwork images)

**Artwork library**:
The images available to hang as artwork.

## Viewing and editing aids

**View preset**:
A named camera: two isometric overviews, top, and eye level from either end.

**Flip**:
Seeing an isometric preset from the opposite long side of the plan.

**Dollhouse**:
The view mode that cuts away the exterior walls facing the camera down to a stub.

**X-ray**:
The view mode that makes every wall translucent.

**Walk mode**:
Moving through the apartment at eye height, colliding with walls and furniture.

**Clearance**:
The free floor from each side of a floor item to the nearest wall or furniture.

**Frame**:
The 2D plane an item is arranged in: its host wall's surface, or the floor plan.

**Smart guides**:
Snapping a moving item's edges and center to other items' in the same frame, and to equal gaps between them.

**Gallery line**:
The height that artwork centers snap to, 150 cm by default.

## Flagged ambiguities

- "Facing" is used in code for both a decor item's wall side and the plan's orientation (`SunSettings.facing`). The glossary uses **Facing** for the first and **Orientation** for the second.
- "Objects" and "fixtures" both name the plan's fixed fittings in code (`Project.objects`, `Plan.fixtures`). **Fixture** is the term.
- "Structure" in code is the layout's removed partitions; it never means the shell or load-bearing structure.
