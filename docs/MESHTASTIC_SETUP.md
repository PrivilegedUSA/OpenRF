# Meshtastic USB text support in OpenRF

OpenRF v0.2.75 targets the user's future standalone Raspberry Pi. For now, WSL can display the interface without hardware, and all sending is disabled until a real compatible USB node is connected.

## Hardware and optional dependency

- Obtain a Meshtastic-compatible LoRa node and antenna for your legal region (in the United States, use properly configured US regional settings, not an arbitrary frequency). Confirm compatible firmware and channel configuration using official Meshtastic tools.
- Connect it over USB serial to the Linux system. Check that `/dev/ttyUSB0`, `/dev/ttyACM0` or another numbered port appears and that the OpenRF user has permission to open it. WSL may need Windows USB passthrough; a native Pi is usually simpler.
- Install the optional Meshtastic Python package into the **same Python environment that runs OpenRF**, using an isolated environment when possible, for example `python3 -m pip install meshtastic`. Base OpenRF continues working without this dependency. Keep its protocol/API version compatible with your radio firmware.
- Start OpenRF on loopback as usual. In **Radio → LoRa mesh messaging**, press Refresh. No connection or transmission happens from opening the page.

## Messaging

1. Select the real USB port and click **Connect USB node**. A successful USB connection only confirms local software-radio communication, not radio signal reception or internet access.
2. Leave mode at **Normal**. Set destination to `^all` for a channel broadcast, or `!1234abcd` for a direct message to a known node. Use a channel index configured in the radio (0–7). Short UTF-8 text only, at most 180 bytes.
3. Click **Send via connected radio**. The result says *submitted to radio*, not *delivered*. Have a second device verify actual over-the-air receipt; radio firmware and network traffic decide delivery.
4. Text packet callbacks are shown as reported by the radio, without saving position packets or GPS histories. Text messages remain only in OpenRF process memory (maximum 100) until disconnect or restart. OpenRF does not upload or archive them.

## Automatic relay and dedicated mode

Meshtastic firmware handles mesh retransmission. Its standard `CLIENT` role already helps forward packets intelligently, generally the recommended choice. OpenRF's **Relay-focused** option is an application-level mode: it disables originating text from OpenRF while leaving the attached radio connected to perform whatever rebroadcast behavior its existing firmware configuration permits. OpenRF does not write the radio's role or manually repeat packets.

The old `REPEATER` firmware role was deprecated in firmware 2.7.11. Infrastructure roles (`ROUTER`, `ROUTER_LATE`) require a suitable site/network plan; turning them on indiscriminately may worsen collisions. A future hardware-tested release may add opt-in role configuration with explicit warnings and a rollback path, but this version does not.

## Privacy, safety, constraints

Treat mesh text as potentially visible to participants on shared channels; encryption depends on the radio and channel setup, not OpenRF. Avoid typing credentials, personal locations or sensitive information on a public channel. Do not assume radio hardware is compliant until the region, antenna and firmware are verified. No account, cloud broker, Internet forwarding, spoofing, jamming or unapproved interception is built into this integration.

Official references:

- https://meshtastic.org/docs/configuration/radio/device/
- https://meshtastic.org/docs/configuration/tips/
- https://python.meshtastic.org/

## v0.2.76 conversations and local history

The Radio page now offers a **Conversation** filter, grouped by source/destination
node ID and channel index. Tap **Reply to this node** on a real received
message to fill the destination and channel fields. This does **not** send
anything until the operator presses Send.

Message storage starts as **memory only** and is lost on restart/disconnect.
If the operator chooses **Save message history locally**, OpenRF stores up to
1,000 recent text messages in `mesh-history.sqlite3` next to the private
OpenRF application database. Messages are not encrypted at rest. Clear messages
deletes both saved and session records; disabling history deletes all saved
message bodies. No messages are generated unless an actual USB node is used.
Direct-send receipt means **submitted to radio**, not guaranteed reception.

On WSL, USB radios require appropriate serial-device passthrough; the ordinary
Windows COM programming cable for a Baofeng is not a Meshtastic LoRa node.
Meshtastic radio firmware controls any rebroadcasting. OpenRF's relay-focused
setting only disables composing in this UI.
