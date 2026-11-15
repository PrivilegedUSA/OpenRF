# OpenRF v0.2.77 — Messaging and radio-workspace split

## What changed

- **Messages** has a dedicated sidebar page and a header bubble on all pages including Map.
- A connected USB Meshtastic node can provide new received text events; unread counts appear only while another page is open. Sent texts and previously saved messages do not create unread alerts. Opening Messages clears the count.
- Radio Receiver holds RTL-SDR tuning/audio, Ham Radio holds imported CHIRP profiles. The old monolithic Radio section is removed, but all underlying controls remain.
- USB connect / Normal vs Relay-focused mode and opt-in local history are now in expandable sections on Messages.
- The notifier never sends on its own and never claims recipient delivery.

## WSL / Windows checks

1. Update using the existing `Update-OpenRF.ps1` and restart in Ubuntu with `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
2. Open **Messages**. With no hardware, verify it says **NOT CONNECTED** and **Send via connected radio** is disabled. Expand **USB radio connection & relay settings** and **Message storage & privacy**. All existing fields should be present.
3. Switch among **Map**, **Radio Receiver**, **Ham Radio** and **Messages**. Verify the header message icon opens Messages. Maps/routes, saved camera reports and radio sample status should remain intact.
4. Import a CHIRP CSV on Ham Radio (if you have one); **Copy to RTL-SDR tuner** should open Radio Receiver with that frequency prefilled, but it must not start listening or operate your Baofeng.
5. With two separately configured, compatible Meshtastic nodes, **explicitly** connect one via USB and use the other to send a valid text. On a different OpenRF page, allow up to four seconds for the header/sidebar unread badge. Open Messages; check received text and that the badge clears. Repeat for consecutive messages, then confirm your own sent texts do **not** count as unread. No live radio tests were performed during development.
6. Optionally enable local history and restart. Old stored messages should remain visible, without being presented as new unread arrivals. Clear history only if you deliberately wish to delete it.

## Automated checks

From the project root run:

```bash
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || break; done
```

The new Python test covers a synthetic Meshtastic callback sequence, bounded history, and outgoing text not increasing the received counter. The JavaScript test covers separated pages, header navigation and unread state changes. USB hardware, real LoRa propagation, notifications under browser suspension, kiosk input and GitHub CI are not verified by these tests.
