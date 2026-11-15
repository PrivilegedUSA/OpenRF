# OpenRF v0.2.88 — messaging navigation and LXMF quick replies

## Changes

- Messages sidebar entry expands to **Mesh messages** and **Reticulum**. The separate Reticulum page keeps the existing TCP, AutoInterface, announcement, diagnostics, LXMF inbox and compose features.
- Incoming LXMF message rows with a valid 32-character sender hash have **Reply** and **Copy address** controls. Reply only pre-fills the recipient and focuses text input. Copy uses clipboard access with a selected-recipient-field fallback; neither action submits or transmits.
- Combined header count is kept. Reading the Meshtastic inbox clears only Meshtastic unread, and reading the Reticulum inbox clears only Reticulum unread. The envelope opens Reticulum directly when it is the only system with unread messages.
- Responsive 800×480 landscape has a compact two-column Reticulum inbox/composer; narrow screens stack. Each page scrolls independently rather than embedding both messaging systems on one page.

## Verification commands (from `project/`)

```bash
python3 -m unittest discover -s tests -q
node --check openrf/static/reticulum.js
node --check openrf/static/mesh.js
node --check openrf/static/app.js
node tests/test_reticulum_reply_nav_v088.js
for script in tests/*.js; do node "$script" || exit 1; done
```

## Operator checks after installing

1. Start OpenRF in the Reticulum virtual environment as usual. Select **Messages** in the sidebar; verify **Mesh messages** and **Reticulum** appear. Open each and confirm distinct inbox/composer without losing prior settings.
2. Open Reticulum and explicitly enable the optional TCP listener if it was previously stopped. In Sideband, connect to your Windows computer's LAN IPv4 address on TCP port 4242. Don't expose the unauthenticated OpenRF HTTP API to the network.
3. Receive an actual Sideband LXMF text. Check that it appears in Reticulum, and that **Reply** fills the sender's address but doesn't send anything. Type a message and press **Send** explicitly, observing the honest queue/path state.
4. Check that **Copy address** copies the sender hash. If clipboard permission is refused, the hash should be selected in the recipient field for manual copying.
5. Confirm the teal envelope unread count, page-specific read clearing, and direct navigation to Reticulum when only it has unread texts. Check the 800×480 layout for text wrapping and scroll behavior.

## Boundaries

Local simulated DOM tests cannot establish actual network delivery, Sideband version compatibility, Windows multicast routing or Raspberry Pi touchscreen appearance. Transport remains operator-enabled. An open TCP socket and an accepted LXMF queue entry are not recipient delivery receipts. The existing AutoInterface discovery path remains available but is not repaired or field-verified by this UI-only patch.
