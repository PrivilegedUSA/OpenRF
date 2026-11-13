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


### v0.2.51 — Floating tool panels replace scroll-to-Tools

On the normal full-viewport map, four compact **left-side icon controls** launch the existing Trip, Map settings, GPS-linked (manual waypoints and completed SDR survey sites), and Offline map sections in scrollable overlays. Their original inputs, statuses, saved data, and event listeners are reused in the document; opening a panel never downloads map data, initiates wireless scanning, or tracks the user. Press the same icon, the panel X, or Escape to dismiss. Layers / Scan remains a separate right-side control; only one tool/layer panel is presented at a time. The former centered Tools down-arrow no longer exists.

Choosing a destination by tapping the map now collapses the bulky search panel while picking. After placing a point, **Get directions** is offered in a small selected-point card. **Start navigation** appears only after an actual local road route is available; offline direct-line references are not drivable guidance. The card can be closed without losing the selected coordinate; the normal search can be reopened at any time. The offline maps tool includes MBTiles import and region planning; choosing two area corners closes the tool overlay while tapping, and reopens the panel after both corners are selected.

MapTiler HTTP 400 means an invalid/overlong query or parameters according to its published API. It should not be automatically diagnosed as a bad API key or exhausted quota; authentication restrictions normally use 403 and rate/quota often use 429. The interface now distinguishes these cases and preserves local map-point selection when address search is unavailable. The user's provider account and specific request have not been tested.

Screen-size checks use an **isolated** Chromium DOM/CSS test with a visibly placeholder map; they do not verify a live MapLibre basemap, GNSS hardware, or actual Raspberry Pi touch. For full test steps see `docs/RELEASE_0.2.51_TESTS.md`.
