# OpenRF v0.2.52 — Visual control alignment and regression checks

## Visual changes

- Collapsed destination-search surface and hamburger align at 40px tall with matching top offsets. Search still opens the existing full search form.
- Right-hand rail (below recenter), zoom/compass and recenter controls use borderless, dark teal buttons with light-teal icons; MapLibre and raster fallback are both styled. Keyboard focus remains visible.
- Active navigation still reserves room above the right-side map controls.

## How to check manually

1. On a browser at approximately 800×480, open Map. Confirm Where to? and menu align in height along the top edge.
2. Compare the four right-side tools (under recenter), zoom/compass/GPS controls, and bottom-right +/layers for consistent dark surfaces and icon tint.
3. Confirm the workspaces open to the left of the right-side tool stack and remain accessible on a short 800×480 screen. Open and close Where to?, Trip and Offline Maps, zoom/recenter, and map menu. Check focus with Tab and ensure overlays remain scrollable.
4. Switch to the offline raster fallback if configured and check its zoom/recenter buttons.
5. Verify attribution remains available; no geographic coordinates or scan readings are fabricated.

## Limits

CSS and source checks are performed locally, and automated viewport tests use browser control fixtures rather than live map tiles. This release does not verify real Raspberry Pi touch, physical GNSS/RF hardware or hosted GitHub CI.
