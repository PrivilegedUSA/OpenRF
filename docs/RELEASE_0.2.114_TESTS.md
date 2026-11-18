# OpenRF v0.2.114 — Route chooser height and scrollbar spacing

## Install

1. Download `OpenRF-v0.2.114.zip` to Windows Downloads.
2. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'`.
3. In Ubuntu stop OpenRF with Ctrl+C and run `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
4. In Firefox use Ctrl+Shift+R on `http://localhost:8765/`.

## Manual visual checks

1. Set the OpenRF map to about **800×480** landscape; select a destination with two meaningfully different Valhalla routes so the Main and Alternate cards appear.
2. Confirm **Choose a route** extends down toward (but does not cover) the lower-left `ⓘ` map attribution/credits icon. The Main route, Alternate route comparison and full-width Start navigation button should appear **without scrolling** for ordinary two-route details.
3. Hover or scroll inside the chooser in Firefox to reveal its scrollbar. The cards must be slightly inset so neither the teal highlight nor alternate comparison text overlaps the scrollbar. Longer text may still scroll without hiding Start navigation.
4. Switch Main and Alternate, start navigation when safe, and verify the choice remains correct. Press × on a new planned route and verify it still removes lines, directions and temporary pins **then reopens the empty Where to? search**.
5. Open **Where to?** and confirm that its close control is a compact **×** with no extra Close search text. Type a starting point and destination without calculating a route, then open **Route preferences**. The gear should cover part of the open search; closing the gear must show the same unmodified form underneath. × on the search should collapse it only when you press that button.
6. Confirm the existing bottom-right gear/plus/layers pop-ups are unchanged.

## Automated checks and limits

- Python: `python3 -m unittest discover -s tests -q`.
- JavaScript: `for test_file in tests/*.js; do node "$test_file" || exit 1; done`.
- Targeted: `node tests/test_route_chooser_height_v114.js`.
- Destination/preferences regression: `node tests/test_destination_search_preferences_v114.js`.
- The UI regression verifies geometry with synthetic viewport measurements. It does not validate the exact scroll rendering of the user's Firefox build, mobile browser or Raspberry Pi display. Valhalla route and mapped camera evidence remain dependent on the installed local datasets.
