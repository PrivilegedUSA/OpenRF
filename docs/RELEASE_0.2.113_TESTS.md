# OpenRF v0.2.113 — Route-start button and lower-right popup alignment

## Installation

1. Download `OpenRF-v0.2.113.zip` into Windows Downloads.
2. From PowerShell, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`.
3. Stop OpenRF in Ubuntu (Ctrl+C), then start it again: `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
4. In Firefox, open `http://localhost:8765/` and use Ctrl+Shift+R to refresh the CSS/JS.

## Manual checks

1. With the local Valhalla road router running, **Where to? → Get directions**. Enable the ALPR category and compare routes. Select the alternate. The selected road turns teal and the dashed amber map line denotes the other road.
2. Tap **Start navigation** at the *bottom of the Choose a route sheet*. The current selected road should enter the existing GPS-follow view and ask for browser location permission if needed. Repeat with Main. This action must never start on a direct-line preview; it must never silently start merely because an alternate is suggested.
3. Plan another route with a main and alternate road. Click the **×** in Choose a route. Both route lines, the destination and custom origin pins, Directions strip, route cards and temporary address text must disappear. Saved destinations and camera/road preferences must remain. Reselecting a route requires Get directions again.
4. At **800×480 landscape**, open the bottom-right **gear**. The popup must begin beneath the top Where to? and hamburger controls, end above the bottom controls, and fit to the left of the right map toolbar/scrollbar. Scroll through all preferences and confirm the close X remains reachable.
5. Close the gear, open **layers**. It should have the same size and location, with internal scrolling and an accessible X. Open **+ Add observation**. Its form should use the same rectangle when opened from the map; entries and Save/Cancel should be scrollable. Opening a second popup should close the first.
6. From **Discoveries → Add observation**, verify the normal dialog style is retained. No new GPS collection or automatic saves happen simply by opening the form.
7. Resize the Firefox window or scroll the page while any of the lower-right popups is open. Confirm that it stays aligned with the visible map area and does not cover the hamburger or right-hand scrollbar.

## Automated tests and limitations

- Python: `python3 -m unittest discover -s tests -q`.
- JavaScript: `for test_file in tests/*.js; do node "$test_file" || exit 1; done`.
- New route UI/geometry regression: `node tests/test_route_start_and_popup_alignment_v113.js`.
- Static code tests cannot verify the exact Firefox/Chromium rendering on the user's desktop or a 5-inch physical Raspberry Pi touchscreen. Real camera reports, road availability, and fresh GPS reception remain user-/hardware-specific. No live camera, route, GNSS, sensor or external service test is claimed.
