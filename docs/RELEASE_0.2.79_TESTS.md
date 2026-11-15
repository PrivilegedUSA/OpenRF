# OpenRF v0.2.79 — Header envelope and alignment

1. On Overview or Messages, the envelope should be noticeably smaller than the hamburger; both icon centers should lie on one horizontal line.
2. The space between the icon tap targets should be narrow, without boxes or visible borders. Both retain an approximately 42×42-pixel touch target and keyboard focus indication.
3. Tap the envelope: it must still open Messages. Unread counts must still appear on genuine incoming messages, not outgoing texts or old saved history.
4. On Map, the message envelope must stay hidden, with Messages accessible from the sidebar. The map controls, navigation sheet and compact hamburger should remain unchanged.
5. Repeat at roughly 800×480 landscape and in a narrow mobile browser viewport; verify no horizontal scrolling.

Automated tests: `python3 -m unittest discover -s tests -q` and `for file in tests/*.js; do node "$file" || break; done`. No live RF hardware or physical touchscreen checks were made for this release.
