# OpenRF v0.2.4 — Five-inch touchscreen workspace

Target: official Raspberry Pi Touch Display 2, five-inch 720×1280 portrait; optional 1280×720 landscape. Hardware integration is a future phase.

- Compact view (≤900 CSS pixels, or landscape touch at ≤1400×850) opens Map by default.
- The hamburger button at the top left opens a **vertical slide-out navigation drawer** with six full-width destinations. There is no bottom strip and no left/right scrolling to see destinations. Tap a destination, ×, outside the drawer, or Escape to close it. The drawer does not receive keyboard focus when closed.
- Long records and Wi-Fi result tables stack as labeled cards on small viewports. The page, not the user, handles wrapping long identifiers; no horizontal page scrolling should be necessary.
- Desktop retains persistent side navigation and Overview landing page.
- The map has a separate Layers & Scan panel. It filters saved survey positions by category, not guessed radio source locations. One-shot Linux Wi-Fi results without GPS remain in a temporary list.
- Browser geolocation permission/centering, dark styles and raster fallback are retained.
- Test 320×568, 390×844, 720×1280, 1280×720 touch, and 1450×900 desktop for scrolling, drawer, focus, maps, modal, and table readability. Actual touchscreen testing is pending.

Reference: https://www.raspberrypi.com/documentation/accessories/touch-display-2.html
