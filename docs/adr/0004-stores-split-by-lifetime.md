# Application state is split into stores by how long it lives

Status: accepted

State lives in several zustand stores, each owning one lifetime:

| Store | Lifetime | Holds |
|---|---|---|
| `useDecor` (`src/decor/store.ts`) | saved in the layout file, undoable | items, finishes, groups, selection, the open layout |
| `useEdit` + `editRefs` (`src/decor/edit.ts`) | one gesture | hover, snapping, guides, marquee, last pointer hit |
| `useView` (`src/store.ts`) | the browser (sun) or the session (flip) | camera preset, view mode, sun, walk mode, tools |
| `useUi` (`src/ui/uiStore.ts`) | the browser | which panels and sections are open, paint brush |
| `useMeasure`, `useLayouts`, `useStructure`, `useUploads` | the page | measurements, the layouts list, derived shell, upload progress |

The rule is that nothing transient enters `useDecor`, because everything in it is saved and recorded in history. A pointer move must never write a file or create an undo step.

## Consequences

- Stores are module singletons, initialized from the URL and browser storage at import. A store module reloads the page on hot update instead of swapping in place, because other modules hold references to it.
- `window.__decor` and `window.__view` expose the live stores in development for the browser tests and scripts.
