# OpenRF v0.2.87 — Borderless unread counter

Small user-requested visual change: the 13px teal unread count over the envelope's upper-right corner has no dark border. Number, placement, color, read logic and Sideband messaging remain unchanged.

1. Download `OpenRF-v0.2.87.zip` into Downloads and run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

2. Restart OpenRF in WSL:

   ```bash
   source "$HOME/.local/share/openrf/reticulum-venv/bin/activate"
   cd /mnt/c/projects/OpenRF && python -m openrf
   ```

3. Enable Reticulum with your previously configured TCP option, reconnect Sideband, navigate to Overview, and send a new Sideband message. The envelope should show a small teal number at its corner with no border. Opening Messages clears it.

Automated checks: `python3 -m unittest discover -s tests -q`, all `tests/*.js`, ZIP integrity and versioned root manifest. The UI appearance remains to be verified by the user; no live connection tests were performed for this CSS-only change.
