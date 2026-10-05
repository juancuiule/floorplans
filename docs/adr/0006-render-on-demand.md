# The scene renders on demand, with manual shadow updates and static batching

Status: accepted

The canvas uses `frameloop="demand"`: nothing renders unless something calls `invalidate()`. Shadow maps re-render only after `requestShadowUpdate()` (`src/scene/shadows.ts`), and static geometry is merged into one mesh per material by `<Merged>` (`src/scene/Merged.tsx`). An idle apartment costs no GPU time, which matters on laptops left open on the app, and draw calls stay low with hundreds of furniture parts.

## Consequences

- Any code that changes the scene outside React's render (a store subscription, an animation, a texture load) must call `invalidate()`, and anything that moves geometry or toggles shadows must call `requestShadowUpdate()`. Forgetting shows up as a frame that updates late; `tests/e2e/render-on-demand.mjs` covers the known cases.
- Animations (fades, camera moves, playing the day) keep requesting frames until they settle.
- Children of `<Merged>` that move on their own must stay outside it.
