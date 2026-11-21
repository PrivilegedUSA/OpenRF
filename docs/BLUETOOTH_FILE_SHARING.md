# Bluetooth file sharing — Linux / Raspberry Pi

OpenRF v0.2.161 adds a private **OpenRF-to-OpenRF Bluetooth Classic RFCOMM** file transport, independent of Reticulum and Wi-Fi. It does **not** send ordinary OBEX files to phones, use BLE beacon advertisements, or automatically discover/accept peers. The first implementation is deliberately small and must be tested with actual Linux adapters before relying on it in the field.

## Hardware and prerequisite checks

- Two Linux devices with **Bluetooth Classic** (BR/EDR) support and functioning BlueZ. Raspberry Pi models with compatible onboard Bluetooth may work; USB Classic adapters are another option. Many BLE-only adapters cannot provide RFCOMM.
- The runtime's **Python 3.11+** must expose `socket.AF_BLUETOOTH` and `socket.BTPROTO_RFCOMM`; a Python build without them reports unsupported. WSL usually lacks direct Bluetooth access. This feature does not proxy a Windows Bluetooth adapter into WSL.
- The BlueZ `bluetoothctl` command must be installed and reachable from the OpenRF process. On Raspberry Pi OS, it is normally provided by the `bluez` OS package. It is an optional operating-system dependency, not a Python module or package shipped in the source ZIP.
- Linux's RFCOMM socket must accept `BT_SECURITY_HIGH` for an authenticated/encrypted link. If the kernel, adapter or pairing cannot guarantee this, OpenRF **refuses transfer** rather than silently permitting plaintext.

Check on each Pi:

```bash
bluetoothctl show
python3 -c "import socket; print('RFCOMM:', hasattr(socket, 'AF_BLUETOOTH') and hasattr(socket, 'BTPROTO_RFCOMM'))"
```

If `bluetoothctl` is missing, install BlueZ using your distribution's package manager before attempting pairing. `bluetoothctl show` should show the local adapter address; the same address is displayed inside the OpenRF file-sharing panel when available.

## Pair and trust the devices manually

Use the Pi desktop Bluetooth settings or interactively run `bluetoothctl` on both devices:

```text
bluetoothctl
power on
agent on
default-agent
scan on
```

On the first device, verify the **exact** other-device address before approving a pairing prompt:

```text
pair AA:BB:CC:DD:EE:FF
trust AA:BB:CC:DD:EE:FF
scan off
info AA:BB:CC:DD:EE:FF
```

Replace the example address with the actual address visible on the other device. Complete any matching-code confirmation on both devices. Confirm that `info` reports **Paired: yes** and **Trusted: yes**. Repeat if required on the other device. Pairing and trust grant ongoing OS-level permissions, so use only hardware you control. OpenRF does not pair or trust devices automatically.

## Send a file

1. Install **the same OpenRF v0.2.161 or later** on both devices. Open **Messages → Reticulum → Nearby Bluetooth file sharing** on both; this control works even if Reticulum is off. Read each adapter's address.
2. On the **receiver**, enter the **sender** Bluetooth MAC, then press **Receive one file (5 min)** and confirm. This opens one fixed RFCOMM listener on Bluetooth channel **22**. Receiving remains off otherwise.
3. On the **sender**, enter the **receiver** Bluetooth MAC, choose one file between 1 byte and 2 MiB, press **Send Bluetooth file**, then confirm.
4. Watch progress. **ACKNOWLEDGED** on the sender means the receiving OpenRF process accepted the bytes and verified the declared checksum. It does **not** mean the human opened/read the file. On the receiver, select **Download file** to save it, or **Discard** to erase the in-memory copy. Nothing is saved permanently just by receiving.
5. Press **Stop / cancel** to close the receiving window or interrupt an active transfer. The listener also closes automatically after one successful transfer or five minutes without one.

The file is transmitted in an application-defined binary frame with filename, byte count and SHA-256, followed by raw bytes. A separate checksum acknowledgement returns to the sender. There is no pairing code or private key stored in OpenRF, and no cloud path.

## Limitations and next steps

- **2 MiB** is a conservative memory/API cap for this first release, not a Bluetooth protocol maximum. Later versions can adopt streaming-to-disk with explicit storage quotas and larger transfer limits. Interrupted files do not resume.
- The receiver authorizes one **exact pre-paired and trusted Bluetooth MAC**. The link uses OS-level authenticated/encrypted Bluetooth security; this does not certify the human identity of the remote user. Keep Linux pairing records secure.
- A fixed private channel requires two compatible OpenRF applications with RFCOMM support; an Android phone or standard OBEX file manager does **not** understand it. Standard Bluetooth Object Push Protocol (OBEX) interoperability and a native on-device pairing chooser remain separate work.
- The `bluetoothctl` check reads existing OS device state but does **not** perform radio discovery; there is no startup Bluetooth scan, always-on listener or auto-accept. Opening the section may query the adapter address read-only.
- No physical Raspberry Pi, adapter, driver or measured RF performance was available for this development build. Test pairing, secure socket negotiation, OS permissions, real-world transfer speed and battery drain on two Pi devices before relying on it. Source-level tests use simulated authenticated sockets.

## Speaker and microphone for recorded voice messages

Voice notes added in v0.2.160 use Chromium's built-in **MediaRecorder**, audio-input permission and an HTML audio playback control. No direct ALSA driver integration or extra Python encoder is required for an ordinary USB microphone and USB audio output when Linux/Chromium already recognizes them. Raspberry Pi OS normally routes default audio through PipeWire/PulseAudio.

For the hardware prototype, a **USB microphone/speakerphone** is straightforward to verify. For a fully integrated enclosure, a supported **Raspberry Pi Codec Zero** or similar I²S audio board can provide a MEMS microphone, speaker output and mixer controls; that board requires explicit Raspberry Pi OS audio configuration. Reference: [official Raspberry Pi audio HAT instructions](https://www.raspberrypi.com/documentation/accessories/audio.html).

**Still to implement/test:** an OpenRF audio device readiness page, speaker/microphone chooser, on-device test recording/playback, volume/gain handling, native Pi microphone access, codec compatibility between devices, and real transmission over a connected Reticulum/RNode transport. A speaker/microphone alone does not enable live calls or radio voice streaming.
