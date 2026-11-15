# OpenRF v0.2.84 — Sideband direct TCP and Reticulum diagnostics

## Why this release

The Windows 11 / Ubuntu WSL instance was observed sending UDP/IPv6 AutoInterface packets to multicast address `ff12:0:d70b:fb1c:16e4:5e39:485e:31e1` on port 29716, but no incoming counterpart appeared in the supplied `tcpdump` capture. Android Sideband on the same Wi-Fi continued showing zero reachable peers. This proves the Linux process transmitted packets to its WSL network interface, **not** that Android received them. It also does not establish whether the Windows firewall, Wi-Fi AP client isolation, multicast forwarding, group configuration or some other detail was responsible.

This release adds an operator-controlled **direct TCP transport** that does not need LAN multicast discovery between the phone and WSL. Reticulum's TCPServerInterface is separate from OpenRF's unauthenticated HTTP server, which stays bound to `127.0.0.1:8765`.

## Installation and startup

1. Download `OpenRF-v0.2.84.zip` to Downloads on Windows 11.
2. From PowerShell, run your existing validated updater:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

   This installs managed source and normally attempts a GitHub commit and push. A successful local update does not prove GitHub CI passed. Do not change or overwrite `.openrf-state`, private Reticulum identities, local maps, or investigation data.

3. In Ubuntu WSL:

   ```bash
   source "$HOME/.local/share/openrf/reticulum-venv/bin/activate"
   cd /mnt/c/projects/OpenRF && python -m openrf
   ```

   The `rns` and `lxmf` packages must be installed inside the same Python environment used to launch OpenRF. Browse to `http://127.0.0.1:8765` on Windows. Stop any duplicate OpenRF process on port 8765 first; **do not** expose the OpenRF HTTP port to the LAN.

## Test the phone without depending on UDP multicast

1. Ensure Android and Windows are on the same *trusted, non-guest* Wi-Fi. Disable any VPN or client-isolation feature that prevents phone-to-PC LAN connections for this local test, if safe to do so. Check the Windows PC's real local IPv4 address using `Get-NetIPConfiguration` in PowerShell (typically a `192.168.x.x`/`10.x.x.x` address on its Wi-Fi adapter). Do **not** use the LXMF destination hash, `127.0.0.1`, a WSL link-local IPv6 address, or the router's IP as the TCP host.
2. In OpenRF: **Messages → Reticulum**, check **Also accept a direct Sideband TCP connection**, then click **Enable LAN messaging**. The checkbox cannot be changed while the Reticulum process is running. Press **Stop Reticulum**, change the checkbox, and enable again to switch modes.
3. Expand **Connection diagnostics**, click **Refresh connection details**. Look for an RNS TCPServerInterface entry and its reported state. If `RNS interface counters unavailable`, there is no evidence yet that the TCP listener is up. `0` peers is not proof of a firewall problem.
4. On the phone in Sideband: **Connectivity → Connect via TCP**, configure the Windows LAN IPv4 address, port **4242**, and enable that connection. Sideband's local Wi-Fi/Ethernet option can remain enabled, but TCP does not rely on its AutoInterface multicast visibility. Check OpenRF's **Connection diagnostics** again for TCP client / received-byte activity; a connection can be present before either endpoint learns the other's LXMF public address.
5. After a TCP Reticulum path exists, use **Announce my address** on OpenRF and Sideband's address-announce capability, then exchange public **32-hex-character LXMF delivery hashes**. A local HTTP `POST /api/reticulum/announce` result of 200, a send with `PATH_REQUESTED_NOT_SENT`, or outgoing bytes **does not prove another device received an announce or message**. Wait for destination keys and retry a message if path discovery was pending. Do not assume delivery until a real receiving device confirms.

### If Sideband cannot connect

- Check whether the phone can reach the Windows LAN IPv4 at all and whether the WSL mirrored networking option is still active. On Windows, `Get-Content "$env:USERPROFILE\.wslconfig"` should show `networkingMode=mirrored` if it was configured earlier. Changing WSL network mode requires `wsl --shutdown` and restarting WSL; stop OpenRF first.
- Windows Defender Firewall and the Hyper-V WSL firewall **may both restrict inbound TCP 4242**. If you choose to open this port, do so as an administrator with narrowly scoped **Private/LAN remote addresses only**, and only for the explicit TCP **4242** Reticulum listener. No rule is created or broadened by this release. A rule previously opened for UDP 29716/29717/42671 does not automatically allow TCP 4242. Do not turn off the firewall globally.
- Some guest/hotspot Wi-Fi networks use device isolation; direct phone-to-PC traffic will not work there. An internet-connected Sideband node or a third-party server is **not** necessary for this LAN-only test and should not be configured without deliberate authorization.
- If diagnostics show a TCP listener but zero connected clients, inspect firewall/address/Sideband client configuration before changing cryptographic identities. Preserve the local identity file; deleting it changes your public address.

## Test and safety coverage

- Python: `python3 -m unittest discover -s tests -q` from the project root.
- JS: run `node tests/test_reticulum_v084.js` and existing `tests/*.js` checks.
- Verify `/api/reticulum/diagnostics` is inactive before pressing Enable, does not initialize network sockets, and displays **unknown** for missing RNS counters rather than pretending there are zero peers.
- Verify the app still listens only at `127.0.0.1:8765` and that TCP port 4242 has no listener before Enable and after Stop. Do not place public HTTP access on TCP 4242.
- Ensure optional TCP runtime config stays outside the release and Git under OpenRF local state. In the user's normal setup, the generated file is beside their private Reticulum configuration in an `rns-tcp-runtime` directory.

No Android Sideband or Raspberry Pi hardware was available to the release test environment; TCP connectivity, real RNS interface data, WSL firewall behavior, actual LXMF delivery and touch-screen ergonomics still need testing in the user's installation. All Reticulum sends and announcements remain opt-in.
