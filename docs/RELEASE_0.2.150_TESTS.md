# OpenRF v0.2.150 — Optional web browser workspace

## Install

The complete `OpenRF-v0.2.150.zip` includes the ZIP-root manifest:

```json
{"project":"OpenRF","formatVersion":1,"version":"0.2.150"}
```

Save the ZIP **without extracting it** to Windows Downloads. Run the existing updater from any PowerShell directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

To restart in Ubuntu/WSL, stop the current app with Ctrl+C, then:

```bash
cd /mnt/c/projects/OpenRF && python3 -m openrf
```

The updater may perform a GitHub commit/push and start CI, but this ZIP's generation and local tests **do not prove** installation or remote CI succeeded.

## What changed

- `openrf/static/index.html` — optional **Web Browser** sidebar entry and accessible browser workspace.
- `openrf/static/browser-workspace.js` — up to eight local address tabs, 16-entry-per-tab history, 24 bookmarks, public-name HTTP(S) address/search normalization, sandboxed HTTPS preview, and explicit Full browser link. Session state and bookmarks use browser-local storage.
- `openrf/static/app.css` — responsive styling for 1280×800 and compact touchscreen widths.
- `openrf/static/app.js` — browser page registration, title and visibility notification.
- `openrf/server.py` — browser JS in static-file allowlist, `frame-src https:` for explicitly requested previews. Existing loopback Host checks and restrictive response headers remain.
- `openrf/__init__.py`, release manifest, frontend query versions, `README.md` and `CHANGELOG.md` — v0.2.150 release metadata.
- `tests/test_browser_workspace_v150.js` and `.py` — interaction, session, URL and HTTP-security checks.

## Tests run

- `python3 -m unittest discover -s tests -p 'test_*.py' -q`: **420 tests passed**.
- `node tests/*.js` executed individually: **117 JavaScript test files passed**.
- `node --check openrf/static/browser-workspace.js`: syntax passed.
- Verified `/static/browser-workspace.js` serves and the new route does not grant a generic web proxy. The loopback API still rejects an untrusted Host header.

## Manual acceptance checklist

1. At desktop 1280×800, click **Web Browser** from the always-open left sidebar. At narrow widths, open the navigation drawer and do the same. Confirm nothing overlaps or scrolls sideways.
2. With Wi-Fi/internet available, enter `https://example.org` and choose **Go**. The preview may be blocked by that site; click **Full browser** for a regular tab.
3. Enter a search phrase and press **Go**; use **Full browser** if the results page cannot be embedded. Check Back, Forward, Reload, Home, and New tab.
4. Add a bookmark, close and reopen OpenRF, and return to Web Browser. The bookmark and saved addresses should remain; no website should load until **Go** or a bookmark is selected.
5. Disconnect networking. Confirm the browser reports its own offline state without blocking offline maps, navigation, RF investigations, or the Emergency page.
6. Confirm `file:///...`, `javascript:...`, `http://localhost:2947`, and numeric-IP entries are rejected by the embedded workspace.

## Limits and next patch

This is an intentionally limited **online web workspace**, not a native Chromium/WebView embedded browser. Many sites disallow iframes; their logins and downloads belong in **Full browser**. Browsing history tracks addresses entered in OpenRF, not navigations inside a preview. Network reporting follows `navigator.onLine` and cannot confirm actual internet reachability. It does not run web sites through the Python API, store page contents, or provide an offline website cache. It does not verify arbitrary redirects, third-party website behavior, or network security of external sites.

No Raspberry Pi or RF/GNSS hardware, live driving or Wi-Fi connection tests were performed. The next suggested patch is a **Saved Trips & Map Packs** organizer with offline coverage metadata, explicit storage management and trip field-readiness checks. Native full in-window Chromium kiosk browsing can follow when the Pi runtime and power/memory profile are available.
