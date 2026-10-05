# Undo records snapshots of the committed layout, merged by key

Status: accepted

History is a stack of before/after snapshots of the layout as it would be saved (items and finishes), taken by a store subscriber rather than by each action. Items are immutable and shared between snapshots, so an entry costs one array. Edits that belong together merge into one entry by key: a drag or rotate gesture, a slider scrub on the same fields, a burst of nudges, a color-picker drag. A draft following the pointer is not committed, so placing records only the drop.

## Considered options

- **Command pattern (each action records its inverse).** Precise, but every store action, plus carry, settle and arrange, would need a correct inverse; snapshots cannot get an inverse wrong.

## Consequences

- Loading a layout file starts a fresh history: undo never reverts someone else's edit made on disk.
- Group names and the selection are not part of history.
- History is a subscriber, so it sees every write, including ones made outside the store's actions. Actions pass a merge key with the write; an open gesture overrides it.
