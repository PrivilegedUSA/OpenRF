# OpenRF v0.2.163 — Reticulum tabs regression fix

## What changed

- Fixed HTTP 404 for previously bundled `/static/reticulum-tabs.js`. Fixed the same backend allowlist omission for `/static/camera_alerts.js`.
- Tab order **Dashboard → Inbox → Contacts → Connections → Files**; Dashboard opens first.
- Inbox now contains message actions and threads only. Local-history/privacy settings moved to Dashboard; address book to Contacts. Bluetooth remains accessible under Files even with Reticulum off.
- Message a saved contact moves back to Inbox; save an LXMF recipient moves to Contacts. Existing message drafts, file-transfer forms and buttons retain their original event listeners.

## User checks (WSL / Raspberry Pi, 1280×800)

1. Install the whole `OpenRF-v0.2.163.zip` with the normal updater, then restart the Python backend. Do not use a still-running v0.2.162 backend; it will continue returning 404 for the tab script.
2. In Messages → Reticulum, the first **Dashboard** tab should be selected. Press **Inbox**, **Contacts**, **Connections**, **Files** and **Dashboard** in turn. Each changes the visible content without extra page jumps.
3. On **Inbox**, check the conversation list and, after choosing a conversation, the message composer and voice-note buttons. The Bluetooth file card should be absent.
4. On **Contacts**, the saved-address form opens immediately. From a saved contact press **Message**; this should open the relevant Inbox thread. From a new message press **Save recipient as contact**; this should open Contacts to complete the nickname.
5. On **Files**, confirm both the nearby Bluetooth card and Reticulum Resource card are present. No receiver arms or radio scans unless explicitly requested.
6. On **Connections**, verify TCP peer/listener, optional HaLow, RNode and diagnostics. On **Dashboard**, verify local address, enable/stop and privacy/history settings. Opening any tab does not enable Reticulum.
7. Repeat on a narrower screen; the five tabs can scroll horizontally without making the overall page scroll sideways. Try Left/Right/Home/End keyboard tab switching. Previously prepared message drafts should remain intact after tab changes.

## Automated tests

- `python3 -m unittest discover -s tests -p 'test_reticulum_tabs_v163_http.py' -q` actually requests **every local JavaScript script named by the main page** and requires HTTP 200 for each.
- `node tests/test_reticulum_tabs_v162.js` validates node preservation, grouping, keyboard selection and unread count with mock DOM.
- Full Python suite: `python3 -m unittest discover -s tests -p 'test_*.py' -q`.
- Full JS suite: `for test in tests/*.js; do node "$test" || exit 1; done`.

**Result:** 458 Python tests and 132 JavaScript test files passed. All local JavaScript files declared by the main HTML returned HTTP 200, including both formerly missing scripts.

## Limits

Tests prove the code serves and selects controls, not physical Bluetooth, LoRa/RNode, live Reticulum delivery, touchscreen layout or audio capture on Raspberry Pi. Real-time LXST phone calls remain deferred at the user's request. An earlier headless Chromium test environment rejected browser process sockets, so visual confirmation still needs a normal desktop or Pi session.
