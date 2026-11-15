# OpenRF v0.2.86 — Compact unread indicator

## Changes

The header envelope's unread badge now sits **inside and on top of its upper-right corner** at a compact 13px size with an 8px numeral and teal background. The earlier 19px amber chip was visually separated from the envelope and more prominent than intended. The sidebar unread count also adopts teal. All receiving, combined Meshtastic/Reticulum counting and clear-on-read behavior from v0.2.85 remain unchanged.

## Install and verify

Download the full `OpenRF-v0.2.86.zip` into Downloads and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
```

Restart OpenRF in WSL with its optional messaging dependencies:

```bash
source "$HOME/.local/share/openrf/reticulum-venv/bin/activate"
cd /mnt/c/projects/OpenRF && python -m openrf
```

Open Overview, enable Reticulum in Messages (and re-enable its TCP option as required), then leave Messages and send an LXMF text from Sideband. Expect a small teal **1** overlapping the top-right of the envelope; sending another real inbound text increments it. Entering Messages clears the count. Test the default 5-inch 800×480 landscape size as well as the current narrow desktop viewport. Large `99+` counts may widen slightly to fit the digits.

The envelope still remains hidden on the Map page per the earlier UI preference; Messages remains accessible from the sidebar. No desktop OS notifications or audio alerts are added. Changes are limited to CSS, version metadata, docs and a focused JavaScript test; the backend and network logic are untouched. Automated tests cannot replace a screenshot-based field check on the operator's device.
