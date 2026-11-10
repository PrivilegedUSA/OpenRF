# OpenRF v0.2.3 — Five-inch touchscreen workspace

Primary target: official Raspberry Pi Touch Display 2, 5-inch, 720×1280 portrait by default; allow 1280×720 landscape with OS rotation. Hardware integration is **future**.

- Desktop browsers wider than 900 CSS px retain the left sidebar and Overview landing page.
- Narrow/touch browsers use fixed bottom navigation and Map landing page. When rotating or resizing, CSS changes layout; keyboard/mouse controls continue to work.
- Map has one **Layers & Scan** drawer. It filters **saved survey positions** by recorded category. The drawer's one-shot scan button calls the same Linux Wi-Fi API as Analysis. The temporary results have no GNSS location or range; they are intentionally not mapped.
- Demo records require opt-in. A manually entered Wi-Fi category is a **manual label**, not a verified measurement.
- No automatic walking/driving tracking, discovery scan loop, RF transmitter geolocation, or source-location estimate is implemented.
- Test a phone-sized 390×844 viewport, portrait 720×1280, rotated 1280×720 with touch and desktop 1450×900. Inspect fixed navigation, panel scrolling, vector/raster fallback, offline coordinate maps, geolocation opt-in, and observations.
- UI-level browser tests used mocked location/API data. Radio hardware, the actual Raspberry Pi display, and real GPS are not verified.

References: https://www.raspberrypi.com/documentation/accessories/touch-display-2.html (5-inch display specifications and orientation).
