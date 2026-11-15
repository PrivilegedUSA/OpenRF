# OpenRF v0.2.78 — Navigation icon polish

## Checks after updating

1. On **Messages**, **Overview** and **Radio Receiver**, the header's hamburger and message-bubble buttons have no surrounding visible border or background square. Both still open their destinations.
2. Open the right-side hamburger menu. The close X should look centered, without a bordered box. Tap it and verify the menu closes.
3. Open **Map**. The message icon must be hidden from the map header; the hamburger remains visible on the intended compact layout. From the sidebar, Messages should still open correctly and retain unread indicators for genuine received messages.
4. Verify no new horizontal scroll on an approximately 800×480 view.
5. Test the same ordinary map controls, existing message UI and radio panels. These are presentation-only changes; no hardware behavior has been altered.

## Local checks

```bash
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file" || break; done
```

Automated checks cannot substitute for the final small-screen visual check. No live Meshtastic hardware or GPS navigation testing was performed for this polish release.
