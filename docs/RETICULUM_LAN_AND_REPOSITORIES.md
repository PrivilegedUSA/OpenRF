# Reticulum/LXMF LAN foundation — v0.2.83

## What works in this release

- OpenRF has **two separate messaging transports**: existing optional Meshtastic USB, and an optional Reticulum/LXMF LAN workspace. Neither starts automatically.
- The local status API reports whether `rns` and `lxmf` are installed. **Enable LAN messaging** starts a separate Python child process with one Reticulum instance, a link-local AutoInterface and its own private LXMF identity. **Stop** terminates that child and closes its network interfaces.
- The identity persists in OpenRF local data outside the release/Git. The UI shows only the public LXMF destination (32 hex characters). Never share the private identity file.
- On Enable, the LXMF destination is announced. The user can manually announce again. A direct LXMF send requires a known destination path; otherwise, OpenRF requests the path and reports **not sent**. Messages accepted by LXMF are **queued, not confirmed delivered**.
- Received signed LXMF text is shown in a bounded in-memory inbox. This phase does not provide permanent OpenRF LXMF history, identity trust verification, delivery receipts, file transfer, automatic transport switching, or cross-posting into Meshtastic conversations. LXMF itself may write private runtime data to its scoped storage directory.
- Starting the ordinary OpenRF HTTP service does **not** open Reticulum LAN ports or import RNS/LXMF. Its web API remains bound to 127.0.0.1.

## Requirements and test procedure

Install the optional dependencies in the **same Linux Python environment that launches OpenRF**:

```bash
python3 -m pip install rns lxmf
```

On Ubuntu distributions that enforce externally managed Python environments, create a virtual environment on the Linux filesystem instead:

```bash
python3 -m venv "$HOME/.local/share/openrf/reticulum-venv"
"$HOME/.local/share/openrf/reticulum-venv/bin/python" -m pip install rns lxmf
cd /mnt/c/projects/OpenRF
"$HOME/.local/share/openrf/reticulum-venv/bin/python" -m openrf
```

To try two OpenRF devices on a **trusted Wi-Fi/LAN**, install both packages on each machine, open Messages → Reticulum and press Enable on each. Exchange the public LXMF addresses. Press **Announce my address** on each device after both are up. Enter the other device's 32-character destination and send a short message. If the status says **PATH_REQUESTED_NOT_SENT**, wait for discovery and press Send again. Do not interpret a queued status as confirmed reception. Click Stop when finished.

Reticulum AutoInterface needs IPv6 link-local multicast discovery and UDP network access. In WSL, Windows firewall and virtual networking can prevent device-to-device discovery; passing localhost HTTP tests is not proof of LAN connectivity. It is normal for two identical devices sharing an address due to copying an identity file to have conflicts—each physical device should generate its own identity.

The scoped configuration uses `share_instance = No`, `enable_transport = No`, `group_id = openrf` and `discovery_scope = link` to limit initial use to the local network. These settings are not access control or a secret; anyone on the same LAN with a compatible configuration may see public announces. Connections to standard Reticulum network configurations, Sideband, or Haven may require matching interface group settings. This scope does not guarantee a disconnected network or block other OS-level networking.

## Review of the three supplied repositories

The user's ZIP archives were inspected as **references only**. No code or firmware from them has been copied or flashed.

1. **Haven MANET IP Mesh Radio** (`haven-manet-ip-mesh-radio-main.zip`, MIT): Relevant for future HaLow and BATMAN-adv IP mesh. Its documentation describes a Pi 5/OpenWrt/Morse **experimental** hardware path using an MM8108 USB HaLow radio, while its Pi 4 path is more mature. For ordinary clients, Reticulum runs on endpoints, with the Haven mesh merely transporting IP traffic. We can preserve OpenRF's Raspberry Pi OS and use a compatible external HaLow/IP bridge later. Do **not** replace the OpenRF OS or assume Pi 5/HaLow support is proven by this project.
2. **Reticulum RNodes** (`reticulum-rnodes-main.zip`, GPLv3): This is an RNode firmware fork emphasizing LilyGO LoRa32 v2.1 NeoPixel status indicators. It is not a general-purpose OpenRF message library. Use it to inform RNode hardware support and optional LED diagnostics later; verify the exact board, transceiver, firmware, and radio-region settings first. Meshtastic and RNode are distinct firmware stacks even on similar LoRa chips.
3. **reticulum-hf-bridge** (`reticulum-hf-bridge-main.zip`): A specialized proof of concept to exchange short notes over licensed 28 MHz/10-meter amateur radio using Hermes-Lite 2 TX plus RTL-SDR RX. Its HF hop intentionally decrypts and transmits **plaintext**; it is not end-to-end encrypted over that segment. This is an optional future, separate licensed-radio project, not appropriate for default private OpenRF messaging or our initial LAN transport.

## Next technical phases

1. Field-verify RNS/LXMF in two separate Linux/Pi installations and refine delivery receipt/status callbacks.
2. Offer a configuration selector for specific LAN interface/group, with no auto-transmit on app startup.
3. Add a tested RNode serial interface as an additional optional Reticulum transport, not as a replacement for Meshtastic.
4. Investigate HaLow IP mesh integration with hardware/driver power budget checks before committing to a Wi-Fi HaLow card for the Pi 5.

Reticulum source: <https://reticulum.network/manual/>. LXMF examples: <https://github.com/markqvist/LXMF/tree/master/docs>. Haven and RNode references are the user-provided snapshots; check upstream licensing and releases before adopting code.
