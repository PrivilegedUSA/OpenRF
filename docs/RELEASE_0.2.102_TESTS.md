# OpenRF v0.2.102 — local hotspot test and operator guide

## Changes

- `openrf/field_hotspot.py`: explicit NetworkManager WPA2 profile creation, status, ownership checks, stop/delete, crash-recovery record outside Git.
- `openrf/server.py`: loopback-only GET status and confirmed JSON POST Start/Stop; attempt owned-profile cleanup on clean shutdown.
- `openrf/static/index.html`: Hardware hotspot form and warnings, including possible existing-internet-uplink sharing.
- `openrf/static/field_hotspot.js`: explicit confirmation and secure password generation (no persistence), disconnected-state display, no background activation.
- `openrf/static/app.css`: 16px vertical separation for adjacent Mesh, Field network and HaLow cards; compact form on narrow screens.
- `tests/test_field_hotspot_v102.py` and `.js`: fake NetworkManager process commands, HTTP checks, frontend consent and layout regression.
- `README.md`, `CHANGELOG.md`, `openrf/__init__.py`, page script cache versions, ZIP manifest: release update.

## Install and launch

1. Download the **complete** `OpenRF-v0.2.102.zip` to Windows Downloads.
2. From any PowerShell working directory, run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

3. Stop an already running OpenRF service with Ctrl+C. Restart in Ubuntu:

   ```bash
   cd /mnt/c/projects/OpenRF && python3 -m openrf
   ```

4. Open `http://localhost:8765` and choose Hardware → Field network. The updater is expected to back up the previous managed source and optionally push to GitHub; neither an installation nor GitHub CI result can be verified by this release build.

## Lab checks performed

From `project/`:

```bash
python3 -m unittest discover -s tests -q
for f in tests/*.js; do node "$f"; done
```

The new mock tests verify no automatic activation, correct WPA2/RSN + `autoconnect=no`, disconnected-only radio selection, exclusion of HaLow candidate radios, refusal to delete another connection, no password in OpenRF state or API, confirmation-gated POSTs, explicit Stop, creation failures, recovery and visual card spacing. **No actual `nmcli connection add/up/down/delete` command is invoked by tests.**

## Optional physical test (Raspberry Pi OS with compatible Wi-Fi adapter)

1. Confirm the correct adapter in Linux with `nmcli device status`, and confirm AP support with `iw list`. Do not activate while the adapter provides your only internet connection or remote administration access.
2. Open Hardware and click **Refresh status**. AP support and NetworkManager must both be present. On standard Windows WSL, the host's Windows Wi-Fi adapter is typically not directly usable; an unsupported indicator is correct.
3. Generate a password and click **Start hotspot**. Read the warning: NetworkManager shared IPv4 can provide DHCP/NAT and might forward a *different* internet uplink. Use the supplied password to connect a second device. The OpenRF web dashboard intentionally remains unavailable to that second device.
4. Verify clients can join locally, then press **Stop hotspot**. Check the client disconnect and that no `OpenRF-Field-…` NetworkManager profile remains. Never use an untrusted/production network as the first test.
5. Physically reboot and repeat to test country regulations, antenna selection, range, power draw and Profile cleanup; these are **not verified by CI**.

## Security and limits

- Ordinary 2.4/5 GHz Wi-Fi hotspot only, not 802.11ah HaLow, LoRa, a gateway/bridge to Reticulum, or a phone-accessible dashboard.
- Requires suitable Linux wireless drivers, `iw` for OS AP-mode evidence, an unlocked/authorized NetworkManager connection, and correct radio/country settings; Linux permissions may block it.
- Authenticated/encrypted WPA2 profile required; no legacy WEP fallback. Password can appear briefly in local process arguments and is retained by NetworkManager while profile exists. OpenRF doesn't store it itself.
- `ipv4.method shared` is NetworkManager-managed DHCP/NAT and can share existing upstream internet. No custom firewall commands or inbound OpenRF HTTP exposure.
- Normal shutdown tries to stop the exact owned profile; a crash, permissions issue or external profile modification may require user inspection and a retry. No active peer/packet/RF measurements are claimed.
