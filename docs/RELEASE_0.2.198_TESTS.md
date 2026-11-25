# Release 0.2.198 verification

Base: complete 0.2.197 bundle. Changed dashboard, Meshtastic, MeshCore and Reticulum JavaScript; HTML cache/version identifiers; Electron version metadata; README/changelog/bundle format; regression tests. Backend and Surveillance Hub code unchanged.

Passed: 28 mesh/Reticulum JS suites, 10 dashboard Python tests, 8 MeshCore Python tests, syntax checks for four changed JS files. No physical hardware, browser layout, full regression or GitHub CI verification.

Manual acceptance: open Mesh Network; select a node from inventory or map. Meshtastic opens all recorded channels for the selected ID, including empty history; draft and destination stay unchanged, sending disabled until another filter is selected. MeshCore client opens its thread; a different unsent draft blocks switching. Repeaters and room servers only open the general workspace. Reticulum saved contact opens its thread, preserving text drafts via existing thread logic; attachments/recording block switching. Cached paths without saved contacts do not open direct chat. Verify no transmission on selection, normal explicit send still works, close details works, and existing map/navigation/surveillance remain intact.

Install via Update-OpenRF.ps1 with -ZipPath pointing at OpenRF-v0.2.198.zip; use -NoPush for local validation. WSL: `cd /mnt/c/projects/OpenRF && python3 -m openrf`.
