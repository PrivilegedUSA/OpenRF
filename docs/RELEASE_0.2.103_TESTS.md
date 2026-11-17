# OpenRF v0.2.103 — Two-node Reticulum TCP lab

## What was implemented

1. An **opt-in TCP client** in OpenRF's existing Reticulum/LXMF service, targeting only a confirmed private IPv4/loopback peer and port 1024–65535.
2. An **optional listener port** other than 4242, useful for multiple independently running OpenRF instances.
3. Purely local, separately configured TCP client/server RNS runtime sections. No third-party RNS files are overwritten and no outbound peer gets added without user consent.
4. Existing ordinary Wi-Fi hotspot now uses **IPv6 link-local** configuration alongside the existing NetworkManager shared IPv4 setup. Reticulum AutoInterface requires IPv6 link-local for discovery, but no discovery on physical AP hardware has been verified.
5. A two-node loopback development launcher, distinct storage roots and no automatic Reticulum/radio activation.

Changed paths: `openrf/reticulum_lan.py`, `openrf/field_hotspot.py`, `openrf/static/reticulum.js`, `openrf/static/index.html`, `openrf/static/app.css`, `scripts/run-two-node-lab.sh`, `tests/test_multi_node_v103.py`, `tests/test_multi_node_v103.js`, hotspot regression test, README/CHANGELOG, version and bundle manifest.

## Update and restart

1. Place the complete `OpenRF-v0.2.103.zip` in Windows Downloads.
2. In PowerShell:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

3. After Ctrl+C stops the previously running app, restart in Ubuntu:

   ```bash
   cd /mnt/c/projects/OpenRF && python3 -m openrf
   ```

GitHub push, CI, update installation and hardware tests are not verified by the bundle build.

## Two-node local lab, no radios required

**Optional runtime prerequisite**: Reticulum (`rns`) and LXMF must be installed into the exact Python interpreter used to launch OpenRF. For a separate Linux virtual environment outside the OpenRF managed source tree, the operator may run:

```bash
python3 -m venv ~/.local/share/openrf/reticulum-venv
source ~/.local/share/openrf/reticulum-venv/bin/activate
python3 -m pip install rns lxmf
```

This is **not** performed automatically, may require internet access, and package compatibility with Python 3.14 must be checked on the user's host. If imports still fail, the Reticulum UI correctly reports optional dependencies unavailable.

To start the lab after updating OpenRF:

```bash
bash /mnt/c/projects/OpenRF/scripts/run-two-node-lab.sh
```

- **Box A** opens at `http://localhost:8871` with its own local state and identity.
- **Box B** opens at `http://localhost:8872` with a separate state and identity.
- In A: navigate to Reticulum, enable **Accept direct Reticulum TCP connections**, port `4242`, then press **Enable LAN messaging**.
- In B: navigate to Reticulum, enable **Connect to another OpenRF / Reticulum TCP listener**. Set `127.0.0.1` and port `4242`; press **Enable LAN messaging** and accept the explicit outbound confirmation.
- Copy the addresses, manually announce if necessary, send one short message from each box and inspect actual inboxes and diagnostics. A `PATH_REQUESTED_NOT_SENT` response means **nothing was sent**; `QUEUED_WITH_LXMF_NOT_DELIVERED` is **not** a verified delivery receipt.
- Stop the two Reticulum sessions in the UI before terminating the lab with Ctrl+C. The script preserves lab databases and private identities in the printed temporary path for review. It does not automatically delete material.

**Important:** The management pages remain loopback-only. This lab simulates two hosts' separate app state but uses *one actual Linux network namespace*. Reticulum LAN multicast behavior and port conflicts may differ from two physical devices. The optional `rns`/`lxmf` packages were **not present** in the automated test environment, so no real cross-process encrypted message exchange was verified here.

## Automatic checks

```bash
python3 -m unittest discover -s tests -q
for file in tests/*.js; do node "$file"; done
bash -n scripts/run-two-node-lab.sh
```

The new tests cover two private source/config trees, different HTTP ports, strict private IPv4 peer validation, invalid listener ports, user confirmation, no public peer target, no implicit relay, no background messaging, the Reticulum TCP config stanza, prior controls and link-local IPv6 intent. All Reticulum activity in these tests is **mocked or unavailable**, never presented as a live delivered message.

## Future hardware verification

For two actual OpenRF boxes, one may create the existing ordinary Wi-Fi hotspot and the other can join using the **Linux operating system's Wi-Fi settings**. The second box can then be pointed to the first box's private IPv4 listener, with OS firewall restrictions and explicit transport consent. The current OpenRF UI does not yet manage joining a hotspot as a station. Wi-Fi HaLow uses a *different radio* and depends on vendor drivers, an independently verified IP link and physical testing before it can be a reliable alternative route. A real peer should never be inferred merely from the interface being UP.
