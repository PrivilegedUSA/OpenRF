# OpenRF v0.2.30 — Live address suggestions and Firefox form cleanup

## Update and restart

Download `OpenRF-v0.2.30.zip` into Windows Downloads. Stop any running OpenRF server using Ctrl+C, then from **Windows PowerShell** run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

From **Ubuntu**:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

Open `http://127.0.0.1:8765/` in Firefox; refresh with Ctrl+F5. No data migration, and your local Valhalla graph is not touched by this patch.

## Manual checks

1. In the Survey Map, click Destination and start typing. Firefox should show a normal search field, not the Manage Passwords popup. The API-key password field is now outside the destination form. Firefox extensions may still add browser UI.
2. With Online U.S. address search **off**, typing never sends address text to online services. Saved local destination names should suggest immediately.
3. Enable Online U.S. address search (explicit opt-in). With **no MapTiler key**, enter `25005 State Hwy 88, Pioneer, CA` gradually. Once the street, city and state are complete, a Census/TIGER approximate address match may appear after a short pause **before** Start navigation, provided the Census service is reachable. Partial-number autocomplete is not provided by Census.
4. Select the matching address. Confirm an approximation warning, then press Start navigation. The local Valhalla road route should follow road geometry where the installed dataset covers the endpoints; otherwise the map must label direct-line output honestly. Check that a different address isn't auto-selected.
5. With a valid MapTiler key saved in private Map settings or a locally hosted Photon, partial text should offer earlier suggestions. Test arrows, Enter, Escape, and tapping an option. A public Photon error is a provider limitation, not evidence that Valhalla is offline.
6. Check the destination checkbox explanation, full-width button, responsive map, GPS-recenter, survey observations, investigations, downloads, and offline maps. No background GPS collection or RF scan is initiated by searching.

## Implementation and limits

- Python backend: `openrf/geocoding.py`, `openrf/server.py`; browser: `openrf/static/index.html`, `openrf/static/app.js`, `openrf/static/app.css`.
- Tests: `tests/test_live_address_lookup.py`, `tests/test_live_autocomplete.js`, updated `tests/test_navigation_frontend.js` and `tests/test_routing_geocoding.py`; Linux CI expanded to 8 JS suites.
- Census is an exact/complete-address geocoder providing approximate TIGER street-range coordinates, **not** search-as-you-type prefix completion. True partial-address autocomplete still needs MapTiler or self-hosted Photon. Public Photon is best-effort.
- No live Firefox extension, MapTiler, Photon, Census, Valhalla Docker, GNSS receiver, RF hardware, or Raspberry Pi integration is verified by automated source tests. A local Chromium GUI smoke check may be unavailable in restricted environments.
- Third-party address services receive typed address text **only** with the checkbox enabled. Provider terms, attribution and quotas still apply; keys remain in private local configuration and outside the source ZIP.

### Map destination tap-picker regression (v0.2.30)

1. Open Map and choose **Choose destination on map**. Verify the cursor turns into a **crosshair** instead of the usual grab hand. The map should show **TAP MAP TO CHOOSE DESTINATION**.
2. Tap an arbitrary road away from the blue browser-location dot; the destination input must change to coordinates at that exact tap, NOT the blue-dot position. A **yellow destination pin** should remain on the map and normal drag/pan behavior should return. Press **Start navigation** to request a local Valhalla road plan.
3. Repeat selection while tapping directly on the blue GPS marker or a saved survey point: the tap is a destination, never an automatic observation, and no observation popup should appear.
4. Start choosing and press Escape (or press **Choose destination on map** again) to cancel. Confirm the cursor returns to normal and that no destination is changed.
5. Switch to offline/raster map mode and repeat; picker must use the tapped point's position, not the center of the map.
6. Field/browser testing is still required; automated tests use mocked coordinates and interactions rather than a physical touchscreen.
