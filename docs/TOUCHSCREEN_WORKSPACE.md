# OpenRF v0.2.5 — Five-inch touchscreen workspace

Target: official Raspberry Pi Touch Display 2, five-inch 720×1280 portrait; optional 1280×720 landscape. Hardware integration is a future phase.

- Compact view (≤900 CSS pixels, or landscape touch at ≤1400×850) opens Map by default.
- The hamburger button at the top left opens a **vertical slide-out navigation drawer** with six full-width destinations. There is no bottom strip and no left/right scrolling to see destinations. Tap a destination, ×, outside the drawer, or Escape to close it. The drawer does not receive keyboard focus when closed.
- Long records and Wi-Fi result tables stack as labeled cards on small viewports. The page, not the user, handles wrapping long identifiers; no horizontal page scrolling should be necessary.
- Desktop retains persistent side navigation and Overview landing page.
- The map has a separate Layers & Scan panel. It filters saved survey positions by category, not guessed radio source locations. One-shot Linux Wi-Fi results without GPS remain in a temporary list.
- Browser geolocation permission/centering, dark styles and raster fallback are retained.
- Test 320×568, 390×844, 720×1280, 1280×720 touch, and 1450×900 desktop for scrolling, drawer, focus, maps, modal, and table readability. Actual touchscreen testing is pending.

Reference: https://www.raspberrypi.com/documentation/accessories/touch-display-2.html


### v0.2.5 controls

The five-inch map has a top-right hamburger that opens a right-side vertical navigation drawer. The on-map Layers & Scan launcher is a single icon at bottom-right, with the full panel available when tapped. Compact map attribution is behind the bottom-left `ⓘ` disclosure, not deleted. The vector map applies a browser fix when style initialization finishes; `My location` remains available to retry. At 390×844 and 720×1280, the map launcher should be visible without sideways scrolling. No physical touchscreen verification yet.

### v0.2.49 landscape controls

The primary field optimization target is approximately **800×480 landscape**. The on-map destination search can now collapse to a one-touch **Find destination** button and reopen without resetting its text or initiating any location action. **Focus map** in the header temporarily hides the below-map managers and compresses the header, leaving the map, layers, route HUD, settings button and attribution accessible. **Exit focus** restores the full map workspace. Switching away from Map exits focus automatically. Touch hardware verification is still pending. See `RELEASE_0.2.49_TESTS.md`.

### v0.2.50 current map-first behavior

The `Map` page itself is the near-fullscreen display at **800×480**: there is no Focus Map toggle. On compact screens the menu is a fixed, floating **top-right** button over the map, while search begins as a small **Where to?** bar at the **top-left**. Tap to expand the original destination form, and tap Close search or press Escape to collapse. You can reach the unchanged offline maps, investigation/waypoint controls and optional detailed trip planner with the **Tools ↓** button at the bottom of the map. The button hides during active navigation guidance to reduce clutter. Leaving/re-entering Map collapses search without erasing the destination or route.

`v0.2.49` focus instructions above are historical only. No automatic RF scans, new location requests or network calls result from simply opening search, closing it or scrolling to Tools. Full-map touch/pinch handling, GNSS and actual offline tiles require testing on physical Raspberry Pi hardware. See `RELEASE_0.2.50_TESTS.md`.
