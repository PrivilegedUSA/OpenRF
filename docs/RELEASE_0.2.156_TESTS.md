# OpenRF v0.2.156 — sidebar Map icon

## Automated checks

- **427 Python unittest tests passed** (`python3 -m unittest discover -s tests -p 'test_*.py' -q`).
- **126 Node.js test files passed**, including `tests/test_sidebar_map_icon_v156.js`.
- Verify ZIP-root `openrf-bundle.json` declares version `0.2.156` and every installable path is under `project/`.

## Visual check in Electron

1. Install the bundle with the existing Windows updater and restart the Ubuntu Electron shell.
2. With the main sidebar open, confirm **Map** has a folded-map outline, not a rectangle or missing glyph. It should use the same blue/teal nav colors and selected background as other entries.
3. Switch to Emergency, then back to Map; confirm the icon's selected color changes with the menu. Test both 1280×800 desktop-sidebar and narrower collapsible-sidebar layouts.

## Limits

Automated tests can validate the SVG markup and class styling, but visual rendering in the user's Electron/WSLg setup and Raspberry Pi hardware still needs manual confirmation. No live RF, GPS or battery hardware was tested.
