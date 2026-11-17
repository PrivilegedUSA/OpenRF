# OpenRF v0.2.101 — Offline-First Navigation and RF Toolkit

## v0.2.101 — Long-range field-network foundation + offline trip preflight

Under **Hardware → Field network · gateway foundation**, OpenRF now inventories Linux-visible regular Wi-Fi and recognized HaLow candidate interfaces separately, along with PHY-supported access-point/station mode hints where the optional Linux `iw` utility can report them. Explore five planned roles: **local phone/laptop hotspot, long-range HaLow access point, HaLow station, two-radio field gateway and Reticulum transport**. An explicit **Inspect Linux network capability** button collects only host interface and driver-mode hints; it never creates a hotspot, scans, connects, sends traffic, changes routes/firewalls or enables a Reticulum transport. A network interface reporting AP support is not proof of usable HaLow or simultaneous AP/station operation. Ordinary phones still need conventional Wi-Fi for their local connection.

Under **Map → Offline navigation readiness** (collapsed until opened), a new explicit **Check offline readiness** button reports three separate prerequisites: whether local Valhalla responds on loopback, whether bundled regional vector map/font data are usable, and how many user-installed raster map packages are available. **Visual map tiles do not contain a drivable road graph.** A running Valhalla service does not guarantee coverage for a chosen journey; only a real route calculation does. The preflight does not request, save, or guess GPS locations, start navigation, fetch internet data or imply live traffic. Existing navigation routes, map controls, messaging and manual HaLow settings remain unchanged.

Both additions are the next **software foundation**, not yet an active Wi-Fi hotspot, HaLow mesh, Ethernet bridge, shared mobile access point or tested hardware gateway. Actual activation needs compatible Pi OS drivers, adapter AP-mode testing, WPA security, DHCP/routing design, verified RF links, regional settings and a separately authenticated LAN management surface. OpenRF's unauthenticated local HTTP service remains loopback-bound. See [v0.2.101 test guide](docs/RELEASE_0.2.101_TESTS.md).

## v0.2.100 — Wi-Fi HaLow Linux connection diagnostics

The **Hardware → Wi-Fi HaLow** panel now includes an explicit **Inspect local link** control for Linux-visible interfaces with recognized HaLow driver hints. The one-shot diagnostic reads the interface's kernel operational/carrier state, IPv6 link-local prerequisite, local cumulative RX/TX bytes, packets, errors and drops, and, if installed, the read-only Linux `iw dev <interface> link` association report. Inspecting never scans, associates, sends test packets or changes the radio, IP routing or Reticulum. It never displays Wi-Fi network names, BSSIDs, MAC addresses or IP addresses. All network-interface counter values are transferred as exact decimal strings; the browser compares monotonic samples only for the same candidate/driver, with an explicit reset warning instead of negative deltas.

A driver hint or Linux association **does not prove HaLow RF peer reachability, an actual IP/multicast path, RNS AutoInterface transport or delivered LXMF messages**. `iw` may not support every HaLow vendor driver; unavailable/unsupported states remain clear. Without HaLow hardware this diagnostic correctly reports no candidate to inspect. The separate v0.2.99 Reticulum opt-in selector is unchanged and remains default-off. No background probe, new dependency, persistent scan log, location collection or database migration was added. See [v0.2.100 diagnostics and test guide](docs/RELEASE_0.2.100_TESTS.md).

## v0.2.99 — Optional HaLow-only Reticulum AutoInterface selection

The existing **Hardware → Wi-Fi HaLow** panel now also identifies whether a driver-associated Linux interface is **eligible for explicit Reticulum selection**: it must be OS `UP`, not report carrier explicitly absent, and have an IPv6 link-local address. These are **only local prerequisites**; neither device identification nor link-local IPv6 proves HaLow association, peer reachability, IPv6 multicast or actual Reticulum/LXMF delivery. No IP address, MAC, SSID or USB serial number is returned. Ordinary Wi-Fi interfaces do not qualify just because they are up.

In **Messages → Reticulum → Wi-Fi HaLow IP link**, first choose **Check HaLow interface (read-only)**. If the vendor-configured Linux device meets the prerequisites, you can check **Use one selected HaLow interface**, select it and then intentionally **Enable LAN messaging**. A separate confirmation warns that Reticulum may emit IPv6 multicast/UDP traffic on that interface; **Stop Reticulum** ends the worker. OpenRF validates the candidate again immediately before starting Reticulum. If the driver, UP state or IPv6 link-local prerequisites are missing, the server rejects the operation without creating a worker.

Selecting HaLow adds Reticulum's documented `devices = <interface>` restriction to a **temporary managed AutoInterface configuration**, preserving your original private RNS settings. With the option off, legacy LAN/TCP and one- or two-RNode behavior is unchanged. If the optional TCP listener is enabled separately, it still listens across adapters; Reticulum transport forwarding remains a different consent-gated RNode option. The HaLow selector does not connect or configure an AP/station, install drivers or firmware, adjust firewall/region/IP, scan RF, make a BATMAN-adv mesh or verify the link. To work in the field, first configure compatible 802.11ah hardware in Raspberry Pi OS with the correct vendor package and verify it independently. See [v0.2.99 test notes](docs/RELEASE_0.2.99_TESTS.md).

## v0.2.98 — Passive Wi-Fi HaLow (802.11ah) readiness

Open **Hardware → Wi-Fi HaLow · 802.11ah**. The new compact panel checks Linux-visible Morse Micro (`morse`) and Newracom (`nrc`) kernel-driver hints, matching USB vendor descriptions, network-interface names, the OS-reported carrier/operational state and available optional vendor commands. **Refresh HaLow readiness** repeats a read-only local check; no association, Wi-Fi scan, driver installation, firmware download, configuration, IP bridge, route, mesh relay or RF transmission is initiated. The local `GET /api/wifi-halow/status` endpoint reports candidates conservatively, never calling them operational.

USB descriptions and driver names are **only possible hardware indicators**; even an interface marked `UP` with carrier cannot establish HaLow association, IP traffic, Reticulum connectivity or radio range. A generic `wlan0`, an Ethernet connection and an arbitrary 900 MHz adapter are not considered HaLow evidence. The API does not expose SSIDs, MAC addresses, USB serial numbers, GPS coordinates, messages or contacts. WSL without passed-through hardware reports its limitation plainly. On-device Linux/Pi tests are still needed before any live functionality can be claimed.

The optional checklist points to official [Morse Micro Linux drivers](https://github.com/MorseMicro/morse_driver) and [Newracom NRC7394 host software](https://github.com/newracom/nrc7394_sw_pkg). The selected hardware, Raspberry Pi kernel, firmware and board calibration files must match; any HaLow station/AP or permitted-region configuration is a future user-controlled step outside OpenRF. Reticulum AutoInterface can only use HaLow once the OS independently has a working IP network. No mandatory dependencies, database changes, hosted service or new transmitting features. See [v0.2.98 test notes](docs/RELEASE_0.2.98_TESTS.md).

## v0.2.97 — Unified, read-only mesh connection manager

On **Hardware → Mesh radio connections**, view the actual local OpenRF USB-session and Reticulum worker states in one compact panel, along with Linux-visible USB serial endpoints, which service has requested a port, and RNS-reported interface counts. Each report is a one-shot, read-only status check: opening Hardware and choosing **Refresh connections** never probes a radio, starts a mesh service, connects to a device or transmits.

The panel keeps evidence distinct: **Meshtastic USB session open** means a compatible SDK connection was opened, not that another radio is in RF range. **Reticulum RNode requested** means the user started a worker with that USB interface, not that firmware, frequency compatibility, an active over-the-air link or message delivery has been verified. **Not claimed by OpenRF** does not guarantee a port is available to other processes. Linux permissions and missing-device states are called out explicitly; Wi-Fi HaLow remains unverified. Only local status is displayed—no contact names, LXMF addresses, message text, GPS positions or USB serial numbers.

Use **Open Mesh messaging** or **Open Reticulum** to make connections on their existing opt-in pages. The new **Disconnect Meshtastic** and **Stop Reticulum** buttons require an additional confirmation; they use the established local API stop operations and leave saved contacts and opt-in history intact. The two messaging pages refresh their status after a stop from Hardware. Nothing here changes Meshtastic firmware roles or automatically enables a Reticulum relay. There are no new required Python packages, database migrations or online services. See [v0.2.97 test notes](docs/RELEASE_0.2.97_TESTS.md).

## v0.2.96 — Two separate RNode radios and real interface-counter comparisons

The Reticulum hardware setup now allows **one or two separate USB RNode devices**. The second radio is optional and off by default. Each RNode has a different Linux USB serial port and its own operator-selected frequency, bandwidth, TX power, spreading factor and coding rate. The old single-radio setup and API remain compatible. Selecting both builds two independent `RNodeInterface` entries in OpenRF's isolated runtime configuration; it does **not** convert a single dual-transceiver board to `RNodeMultiInterface`. All radio access still requires explicit **Enable LAN messaging** and confirmation that the radios may transmit. The relay/transport option remains independently opt-in. Both ports must be distinct, and neither may be in active use by the Meshtastic bridge.

The Reticulum **Connection diagnostics** section now compares interface RX/TX byte counters across deliberate refreshes. For each reported interface, it displays exact increases since the previous check when RNS provides two valid, monotonic counter readings. If the Reticulum worker stops, a counter resets, or no reading exists, it reports that no comparison is available. **These byte changes are not RF signal strength, link quality, remote reception, measured data rate, route success, or LXMF delivery receipts.** Peer counts remain local Reticulum-reported entries and are not verified nearby-radio scans.

This is infrastructure groundwork for the portable Pi with modular LoRa. It does not require new packages or add automatic transmissions, uploads, new SQLite migrations, Wi-Fi HaLow drivers or BATMAN-adv setup. See [v0.2.96 tests and setup](docs/RELEASE_0.2.96_TESTS.md). Real RNode hardware and a two-device live relay still require validation.

## v0.2.95 — Optional RNode/LoRa and Reticulum relay groundwork

Open **Messages → Reticulum → RNode / LoRa hardware & relay setup**. Select **Check USB ports (read-only)** to see Linux-visible USB serial candidates and their process permissions. A visible port **does not** establish that an RNode, SX1262, antenna or working LoRa link is present. Under WSL, USB passthrough to Linux is generally necessary.

With a compatible RNode running actual RNode firmware, you can explicitly check **Add selected USB RNode when I enable Reticulum**, select a `/dev/ttyUSB*` or `/dev/ttyACM*` candidate, and configure a conservative, operator-reviewed 902–928 MHz profile: frequency, bandwidth, TX power, spreading factor and coding rate. The example values 915 MHz / 125 kHz / 7 dBm / SF8 / CR5 are **inputs, not a verified legal, supported, or interoperable operating profile**. Confirm your specific radio's supported frequency, antenna, regional transmit rules, channel agreements and duty-cycle limitations first. Press **Enable LAN messaging** and confirm the RF-start warning to start the separate Reticulum worker with this additional interface. Its startup may configure the radio and **transmit an LXMF announcement**. RNode is OFF by default. **Stop Reticulum** terminates the worker. The original AutoInterface and optional TCP listener remain available without RNode.

An independent, default-OFF **Enable Reticulum transport forwarding / relay** option is available only with the selected USB RNode. It requires a second explicit confirmation and tells Reticulum to forward eligible network traffic between interfaces. This is not a guaranteed repeater/link, and is best suited to a deliberate long-running stationary node; it can increase RF airtime and battery use. Its setting only applies to the temporary generated config, never rewriting the private operator-managed Reticulum config or saved identity. One serial radio cannot simultaneously be controlled by Meshtastic and RNode software; these remain **separate, non-bridged protocols**. The OpenRF API also rejects attempts to use the same selected USB port for both while one connection is active.

Wi-Fi HaLow (802.11ah) remains **not verified / future hardware work**: OpenRF does not install drivers, establish a HaLow network, configure BATMAN-adv or claim that a Linux Wi-Fi endpoint is HaLow-capable. Reticulum's existing AutoInterface can use an independently configured compatible network interface when it actually functions. This patch introduces no new required dependencies, SQLite migrations, background discovery, automatic radio connections or uploads. Live RNode/Sideband/mesh forwarding and Raspberry Pi hardware behavior remain to be tested. See [v0.2.95 test and setup guide](docs/RELEASE_0.2.95_TESTS.md).

## v0.2.94 — Dedicated Reticulum conversation threads

The Reticulum inbox now starts with a **conversation list**, including contacts and other LXMF peers with available messages. Select a person to open a separate, full-width thread with the newest messages at the top and one message composer beneath. The thread header shows the contact name and full 32-character address, with a single **Copy address** control and **Save contact** option when needed. The repeated Reply and Copy buttons have been removed from individual bubbles in this view.

Use **← Conversations** to return to the list, or **+ New message** to enter an address manually. Tapping **Message** on a saved contact opens their thread directly. Unsent drafts are kept separately for each conversation in the browser's current memory (not saved to disk); switching recipients does not mix them. Outgoing LXMF texts still say queued, not delivered. The working unread counters and **Mark all as read** action remain unchanged; merely viewing a thread does not clear them. This is an in-page conversation view, not a new browser URL. See `docs/RELEASE_0.2.94_TESTS.md`.

## v0.2.93 — Persistent unread indicators while reading

The Mesh and Reticulum inboxes now count new received messages **even when you are already on the corresponding messaging page**. Opening, refreshing, or remaining on an inbox never silently dismisses its unread badge. Each inbox has a compact **Mark all as read** button; only selecting it (or explicitly deleting all messages) clears that inbox's count. The header envelope remains the combined unread total, with independent counts in its Mesh and Reticulum choices and in the sidebar. On the map-first page, the compact envelope appears only while there are unread messages.

Both inboxes also use readable **text-message bubbles**: received texts on the left and outgoing/submitted texts on the right, with compact local timestamps and clear routing/delivery-status caveats. Mesh conversations now display **newest first** too, matching Reticulum. This remains an offline-first local messaging UI; there are no invented delivery/read receipts, network connections, or fake messages.

Unread counts are based on genuine inbound event sequences, not sent texts, history replay or delivery receipts. They persist through refresh of the same browser tab where session storage is available. A brand-new tab still establishes its own baseline; messages that arrived before it opened are not automatically identified as unread. No backend, network, or message-storage changes were needed. See `docs/RELEASE_0.2.93_TESTS.md`.

## v0.2.92 — Newest messages first

Reticulum inbox messages now display **newest first**, both in All messages and in a selected contact conversation. The ordering is based on the worker's or local history database's original event order, including when several messages share the same second. Automatic refreshes leave the user at the latest message when already at the top and preserve the viewing position when reading older messages.

Saving a contact with an LXMF address already on the contact list now produces a clear **already saved** warning, without overwriting its nickname. Choose **Edit → Update contact** to intentionally rename a saved address, or **Cancel edit** to return to adding. The local API also rejects duplicate creates, while SQLite's address-unique key prevents duplicate records. Reply, Copy address and optional private history are unchanged. See `docs/RELEASE_0.2.92_TESTS.md`.

## v0.2.91 — Private Reticulum contacts and optional conversation history

The Reticulum screen now supports saved contacts (verified-by-you nicknames for public 32-character LXMF addresses), per-peer conversation filtering, and opt-in local SQLite history. Saved history holds at most 1,000 messages, remains available after the Reticulum process stops, and lives exclusively under the private runtime data directory. History is off by default; enabling includes the current in-memory session and future messages, and turning it off removes saved texts while preserving your contacts. You can clear saved and current-session messages explicitly. **Message bodies are not encrypted at rest.**

Received messages retain the server-observed LXMF signature-validation status; outgoing messages are labeled *queued with LXMF, delivery not confirmed*. A path request is still explicitly **not sent**. Connection details display RNS-reported interface/peer/client counts without treating them as receipt verification. This release does not enable a Reticulum transport or TCP listener automatically. See `docs/RELEASE_0.2.91_TESTS.md`.

## v0.2.90 — Message picker, dependable unread alerts, and page navigation

The header envelope on non-map pages now opens an accessible **Mesh messages / Reticulum** chooser, with separate unread totals alongside each option. Unread counts remain per inbox and are retained during refresh in this tab (using session storage when available); newly received messages are counted from the backend's inbound event sequence, not outgoing sends or historical rows. A temporary Reticulum disconnect no longer silently clears an unread badge. The Meshtastic inbox also checks its read-only local history while disconnected, catching any final messages received just before the USB link dropped. These checks never reconnect, transmit, or announce automatically.

OpenRF now opens **Map** by default in a new tab at all screen sizes, puts Map above Overview in the sidebar, and restores the selected page when the same tab is refreshed. Page selection is tab-scoped, not a permanent preference. The header envelope stays hidden over the fullscreen map to keep the 5-inch layout uncluttered; Messages remains available from the sidebar. See `docs/RELEASE_0.2.90_TESTS.md`.

## v0.2.89 — Individual message alerts in the sidebar

The expandable Messages menu now shows small, correctly centered teal unread counters beside **Mesh messages** and **Reticulum** independently. The parent Messages row stays uncluttered; the header envelope continues showing the **combined unread total**. Opening one inbox only clears that inbox's count. When OpenRF's tab becomes active again, it immediately checks for new messages on already-enabled transports, reducing delays caused by browser background timer throttling without connecting or transmitting automatically. Counts are session-only, based on genuine inbound events—not guaranteed delivery/read receipts. See `docs/RELEASE_0.2.89_TESTS.md`.

## v0.2.88 — Dedicated messaging screens and fast LXMF replies

The sidebar **Messages** parent now expands to **Mesh messages** (Meshtastic USB) and **Reticulum** (LXMF LAN/TCP) subpages. Each system has its own inbox and message composer, reducing scrolling on a small screen. The combined teal envelope badge remains, but unread counts are cleared independently when you view the respective inbox; when only Reticulum has unread messages, the envelope opens Reticulum directly. In the Reticulum inbox, **Reply** pre-fills the genuine incoming sender's 32-digit LXMF address and focuses the message composer without sending; **Copy address** writes it to the clipboard or selects it in the recipient field when clipboard permission is unavailable. No automatic network connections, announcements or sends were added. See `docs/RELEASE_0.2.88_TESTS.md`.

## v0.2.87 — Borderless unread badge

The compact teal header-envelope unread counter is now **borderless**. Its small size, position, teal fill and numeral remain unchanged from v0.2.86, as do the combined Reticulum/Meshtastic unread logic and all transport settings. See `docs/RELEASE_0.2.87_TESTS.md`.

## v0.2.86 — Smaller, quieter unread indicator

The existing Messages envelope now has a **compact 13px teal unread counter** tucked over its upper-right edge. This retains the combined Meshtastic + Reticulum count from v0.2.85 without the larger amber circle sitting above the icon. The sidebar unread badge matches the teal palette; notification behavior, read state, LXMF transport, private data and the map's intentionally hidden Messages shortcut are unchanged. See `docs/RELEASE_0.2.86_TESTS.md`.

## v0.2.85 — Incoming-message envelope counter and compact Reticulum layout

The envelope icon and Messages sidebar now show the **combined unread count** for genuine incoming Meshtastic and LXMF/Reticulum messages. Reticulum's read-only inbox poll continues while its operator-enabled process is running even when you are on another page; it never starts a connection or announces/sends anything. Outgoing messages and inbox history present at first observation never increment unread. Opening Messages clears the session-only count; no OS notification, persistent delivery state or message read receipt is implied. The long Reticulum direct TCP option label, interface names and announce timestamps now wrap within narrow panels rather than bleeding off the right edge. See `docs/RELEASE_0.2.85_TESTS.md`.

## v0.2.84 — Direct Sideband TCP option and live connection diagnostics

**Messages → Reticulum** now has an optional **direct TCP listener on port 4242** (off by default). This can let Sideband on an Android phone connect to OpenRF over the same Wi-Fi when WSL's IPv6 multicast AutoInterface discovery does not cross the host network. Enable the checkbox *before* starting Reticulum; in Sideband choose **Connectivity → Connect via TCP** and enter the Windows PC's actual LAN IPv4 address and port **4242**. A narrowly scoped Windows/WSL inbound firewall exception may be needed; OpenRF never creates one for you. The **OpenRF HTTP API remains loopback-only**. Check the expandable **Connection diagnostics** for actual locally reported RNS interface counters, and remember that an outgoing announce or a connected TCP socket does not prove LXMF delivery. See `docs/RELEASE_0.2.84_TESTS.md` for setup and tests. Native Sideband/WSL interoperability remains to be verified on the user's devices.

## v0.2.83 — Opt-in Reticulum/LXMF messaging over Wi-Fi/LAN

Messages now contains a separate experimental Reticulum/LXMF workspace. Reticulum is completely off until the operator enables it, and runs in a separate stoppable Linux process. Local identities are stored privately outside Git; direct messages can be queued only when a destination route is known. Missing paths are requested explicitly and shown as **not sent**. Messages are not bridged to Meshtastic or shown as delivered without confirmation. The optional `rns` and `lxmf` Python packages are not required for any of OpenRF's other features. See `docs/RETICULUM_LAN_AND_REPOSITORIES.md` for installation, two-device testing, limitations and review of the three user-supplied project snapshots.

## v0.2.82 — Diagnostics and 5-inch Messages layout

The Meshtastic USB settings panel now provides read-only Linux SDK, serial-path access, and USB link diagnostics. It never probes for radio transmissions, claims a live mesh, or reads unknown firmware details. At approximately 800×480 landscape, the conversation and composer use a compact two-column layout, while narrower portrait screens keep the stacked view. All hardware findings still require checking on a real Raspberry Pi/LoRa node.

## v0.2.81 — Node directory and message status

The Messages workspace now lists locally observed correspondents and allows private nicknames; saved contacts are not a live radio scan. Direct Meshtastic messages can display routing ACK/error responses when the attached radio and Python SDK provide them. A routing acknowledgment does not prove a person read the text. All sending still requires your action.

## v0.2.80 — Easier conversations

Select a conversation and use **Reply to selected conversation** to prefill its direct node and channel (without sending). The composer now counts real UTF-8 bytes and blocks messages exceeding the Meshtastic bridge's 180-byte limit. Inbox polling preserves your reading position on older messages. The existing local privacy, radio connection and relay controls are unchanged. Real radio behavior has not been field-tested for this release.

## v0.2.79 — Smaller, centered header envelope

The header's Messages shortcut now uses a clean envelope instead of the chat bubble. Its artwork is smaller than the hamburger, and both controls share a 42-pixel invisible alignment box, centered vertically with only 2 pixels of inter-button gap on regular pages. Both remain borderless, keyboard accessible, and large enough to tap. Messages is still hidden from the Map header and accessible through the sidebar. No functionality or message data changed. See `docs/RELEASE_0.2.79_TESTS.md`.

## v0.2.78 — Header and sidebar icon polish

The header's **Messages** and hamburger buttons now have clean borderless styling on ordinary pages. On **Map**, the Messages shortcut is hidden to keep the navigation view uncluttered; the Messages sidebar entry and its unread badge remain available from the menu. The map hamburger remains readable without a border. The sidebar close X is now a centered vector icon with a borderless button, preserving its original tap target and keyboard accessibility. No route, radio or message-handling behavior has changed. See `docs/RELEASE_0.2.78_TESTS.md`.

## v0.2.77 — Dedicated messaging and separated radio tools

**Messages** is now its own sidebar page. The conversation list appears first, followed by message composition, with USB connection/relay settings and optional private message storage in expandable sections. The header has an always-available message icon; when a connected Meshtastic USB node delivers a new text while another page is open, a local unread count appears on the header and sidebar icon. Reading Messages clears it. Old SQLite history and operator-submitted texts are not counted as new; the app checks the existing loopback inbox in the background without connecting or transmitting automatically. No browser push or account is involved. The indicator is session-only and does not guarantee RF delivery.

The old large **Radio** workspace is now **Radio Receiver** for receive-only RTL-SDR listening, **Messages** for Meshtastic text, and **Ham Radio** for offline CHIRP/Baofeng channel profiles. Copying an imported CHIRP frequency takes you to the independent receive-only tuner. See `docs/RELEASE_0.2.77_TESTS.md`.

## v0.2.75 — Quiet map taps and USB mesh messaging foundation

An ordinary click/tap on empty map space now **does nothing** in both MapLibre vector and the raster fallback. The **+ Add observation** button is still the deliberate way to open the manual form. Choosing a destination/area on the map and clicking existing observation/camera markers continue to work.

Open **Radio → LoRa mesh messaging** for the first hardware-ready Meshtastic USB integration. The optional Python Meshtastic SDK is loaded only after pressing **Connect USB node** on an actual detected Linux port. With a compatible radio and configured channels, you can broadcast short text, send directly to a node ID, and see decoded incoming/outgoing message status. A **Relay-focused** mode disables OpenRF text sending while the radio's own CLIENT firmware continues normal automatic rebroadcasting; it does **not** configure an obsolete REPEATER role or assert coverage. Nothing transmits without pressing Send, message delivery is never assumed, and the last 100 text records are only in process memory (cleared on disconnect/restart). The UI gracefully reports missing hardware/SDK. See `docs/RELEASE_0.2.75_TESTS.md` and `docs/MESHTASTIC_SETUP.md`.

## v0.2.74 — Clickable map markers and GPS signal recovery

MapLibre camera-report and clickable saved-survey markers now show a **hand-pointer cursor** on hover; the ordinary map remains draggable, and choosing a destination or area still uses the selection crosshair. Raster camera buttons already have a pointer and retain it.

During explicitly started real GPS navigation, a compact **GPS: waiting / accurate / approximate / signal lost** label appears in the follow card. If the browser stops calling back or an optional GNSS receiver stops supplying genuinely new fixes, the app pauses live turn timing after 15 seconds from the **actual fix timestamp**, clears lane hints and camera approach warnings, stops pending voice instructions, and retains the entire planned route. A subsequent fresh fix resumes accuracy-limited guidance without persisting any GPS history. Demo playback is separately labeled and never counts as live GPS. Details and regression steps are in `docs/RELEASE_0.2.74_TESTS.md`.

## v0.2.73 — Offline mapped-camera approach alerts

During explicitly started **real GPS navigation**, OpenRF can show a compact warning when you approach a locally stored ALPR, speed-camera or red-light-camera *report* near your selected Valhalla road. Open **Navigation & route preferences → Camera approach alerts** to switch categories on/off, choose 0.25, 0.5 or 1-mile notice distance, and optionally enable spoken alerts (off by default). Choices persist on this browser. Visual alerts default on, but require a fresh, accurate, moving and route-aligned GPS fix; they remain off for DEMO playback and when location quality or direction is unreliable. Each site is announced at most once per navigation session, and speech is suppressed close to a turn. This works with the local, offline camera catalog and does not log GPS history, send positions to third parties, or claim to detect a live camera. Up to 256 mapped reports per route can be considered; missing/dated records and uncertain camera direction are explicitly acknowledged. See `docs/RELEASE_0.2.73_TESTS.md`.

## v0.2.72 — Keep the route until a replacement is selected

Opening **Where to?**, focusing its destination field, and typing a draft no longer erase a completed route. **Choose destination on map** hides the old route-choice buttons and arms the map while keeping the old route line visible; the old directions, alternatives, and trip-only exclusions are cleared only when a new map point is accepted. Escape cancels the pick and restores the previous route. Choosing an actual address suggestion or committing **Get directions** likewise replaces the route. A comparison with no valid alternative now automatically uses the main route without displaying a redundant **Choose a route** card. Previously selected latitude/longitude strings are handled locally instead of being sent to MapTiler autocomplete, avoiding the HTTP 400 error seen when reopening search. See `docs/RELEASE_0.2.72_TESTS.md`.

## v0.2.71 — Choose another map destination without closing route cards

Once a road route is displayed, open **Where to?** and choose **Choose destination on map** directly, even when the **Choose a route** card is still visible. Opening the search editor temporarily hides the prior route-review cards; selecting map-pick mode dismisses them and clears the old route, allowing repeated taps for new destinations without a separate X/close action. If you only open and close search without starting a new selection, the old route remains available. The route chooser also handles a single available route without trying to render a missing alternate. See `docs/RELEASE_0.2.71_TESTS.md`.

## v0.2.70 — Repeated destination selection after multiple routes

After **Get directions**, you can reopen **Where to? → Choose destination on map** repeatedly, including after a second or third calculated route. Re-pressing the pick action keeps the picking state enabled, rather than silently cancelling it. On supported pointer devices, the outer map surface consumes a deliberate pointer release before MapLibre/route overlays can intercept the later click. Mouse/touch drags do not place a destination. Escape or opening destination text search cancels an unfinished pick. Previous route state is still invalidated only when changing destinations, and all saved map and avoidance preferences are retained. See `docs/RELEASE_0.2.70_TESTS.md`.

## v0.2.69 — Reliable repeated destination selection

After planning one route, you can reopen **Where to? → Choose destination on map** and tap a different point. Map picking now takes precedence over any incomplete road-avoidance selection and can see taps over map overlays; the earlier route and turn list are still cleared when the new destination is chosen. Route preferences and all local RF records remain unchanged. See `docs/RELEASE_0.2.69_TESTS.md`.

## v0.2.68 — Stable destination-to-route navigation panels

A successful **Get directions** request now closes the expanded destination editor automatically, leaving the compact **Where to?** bar above the Directions summary and route-choice panel. Expanding the editor temporarily hides the route review sheets without deleting the current route. Closing the editor brings them back at measured positions, even after an asynchronous route comparison. Failed geocoding or routing leaves search open so the destination can be corrected. Existing map layout, Valhalla routing behavior, camera avoidance, saved map layers, and private data storage remain unchanged. See `docs/RELEASE_0.2.68_TESTS.md`.


## v0.2.66 — aligned navigation sheets and pinned export actions

The expanded destination search and Choose a Route popup now share the width and left edge of the Directions sheet. The compact collapsed search field remains unchanged. When Directions is expanded, its route summary and Print/Save HTML/Save JSON buttons remain visible while **only the turn-list body scrolls**. This is a frontend-only adjustment; routing, road exclusions, map layers and private data storage are unchanged. See `docs/RELEASE_0.2.66_TESTS.md`.

## v0.2.65 — persistent map layers and one-scroll directions

All six survey layers and three camera categories now retain their visibility choices in this browser's local storage. Layer choices are restored before the map and camera components load; camera imports never silently override a hidden layer. Storage disabled/private mode falls back to the current session. Directions now has one scrolling region instead of a scrollable turn list nested inside a second scroll area. The top Directions summary remains sticky, and the panel is kept clear of the right-side controls, even at narrow widths. Map-layer and workspace close glyphs are smaller, centered and borderless. All changes are UI-only; routing and radio capture are unchanged. See `docs/RELEASE_0.2.65_TESTS.md`.

## v0.2.64 — route choice spacing follows Directions height

The Choose a Route panel now measures the rendered Directions heading and stays below it with a visible gap, even when the heading wraps. It maintains the teal and dashed-amber route selection, existing avoidance preferences, and turn list without changes. See `docs/RELEASE_0.2.64_TESTS.md`.


## v0.2.64 — safer road-avoidance recalculation and simpler route menus

The five common route preferences (avoid highways, toll roads, ALPR/Flock, red-light cameras and speed cameras) now form one continuous list. The route-choice cards sit below the Directions heading and hide when you expand its turn list. `Leg 1` repetition has been removed. If a road exclusion produces a route with directions that fail to reach the end of its reported geometry, OpenRF keeps the existing complete route instead of replacing it with partial directions. This safeguard is not a substitute for verifying actual road access and signage. See `docs/RELEASE_0.2.64_TESTS.md`.

## v0.2.64 — direct route avoidance preferences and turn-by-turn road exclusions

Open **Map → Route preferences** (the map gear or **Where to? → Route preferences**). Avoid highways, toll roads, ALPR/Flock camera reports, red-light cameras and speed camera reports from one set of switches. Camera preferences are initially off and are saved locally in this browser; they ask Valhalla for a comparison, not a guaranteed camera-free route.

The advanced **Avoid a particular road or gate** editor is collapsed by default. It shows how many exclusions are active. To exclude a road already in your directions, expand **Directions**, choose **Avoid this road** beside a mapped turn, then select **This trip** or **Save for future trips**. Press **Recalculate directions** to request a new route. The saved list under the advanced editor lets you remove exclusions later. A turn exclusion selects an *on-route point after a junction*, not every segment with the same road name. These exclusions are best-effort and may not account for unmapped private gates, access restrictions, or incomplete camera reports; check real road signs and conditions. Changes never silently switch an active driving route.

Address search provider settings remain accessible under a collapsed **Address search and provider settings** section. No new external service, required account, or map download was added; v0.2.52 map controls and offline map bytes remain unchanged. Do not operate settings while driving.


## v0.2.61 — interactive route choices and avoidance preferences

Open Map → Where to? → Route preferences (or map gear) for camera categories, highways, toll roads and mapped road/gate-point exclusions. When Valhalla finds a camera-aware alternative, compare the selected teal route with the amber dashed alternative and choose using the map or route cards. A georeferenced point is required to exclude a particular road; a typed name alone is not sufficient. Avoidance settings are best-effort, not proof of open gates, closed roads or camera absence.

## v0.2.59 — spoken maneuver prompts and optional lane hints

- **Spoken directions (opt-in):** During a real, user-started GPS navigation session, press **Voice off** in the on-map guidance panel to turn speech on. A browser with Speech Synthesis support is required, and the operating system may need voice files; offline playback depends on which voice is installed. Directions use Valhalla's spoken text when present. OpenRF does not bundle or call a cloud text-to-speech API; some browser/OS speech implementations may still require an internet connection.
- **Conservative spoken alerts:** Speak only with a recent, accurate, moving GPS/GNSS fix. Warn once when about 400 m from the next turn and once within 90 m (if fixes arrive in those windows). Guidance stops speaking when the reported position is stale, inaccurate or off-route; it remains silent in the clearly labeled DEMO mode. A missing turn or voice engine never creates made-up audio.
- **Lane hints, when mapped:** If Valhalla supplies turn-lane data, the guidance panel shows arrows; highlighted lanes reflect mapped route-valid/active designations, not guaranteed lane geometry or current road construction. When lane information is absent, no lane hint is shown. Follow signs and road markings.
- **Remaining-time estimate:** Computes an approximate remaining duration from the original Valhalla route estimate and road progress, labeled **no live traffic**. Real-time congestion, incidents, speed limits, street closures and traffic-aware rerouting are **not implemented**; they would require verified, permissioned live data and internet access.
- Existing camera-aware route comparison, cautious off-route Valhalla recalculation, offline maps and v0.2.52 map controls remain. **Do not interact with the screen while driving.** This release has not been road-tested with a Raspberry Pi, receiver/GNSS or live speech hardware.

### Test steps

Start Valhalla and OpenRF, calculate a Northern California road route, press Start navigation, and tap Voice off to enable spoken turns. Test with accurate real GNSS when safely stationary as a passenger/tester or with controlled recorded positions in a development fixture. Check that absent mapped lanes show no lane chips, that road signs take priority, and that DEMO has no live speech.

The v0.2.58 and earlier sections below remain historical notes; current release status is above.



## v0.2.58 — Valhalla autostart, camera-aware route comparison, cautious GPS rerouting

- Starting OpenRF with `python3 -m openrf` tries to **restart the existing** `openrf-valhalla` Docker container when Docker is accessible. It never downloads road data, builds tiles, creates containers or starts Docker Desktop. Set `OPENRF_VALHALLA_AUTOSTART=0` to disable. `--doctor` remains available from `tools/setup-valhalla-wsl.sh`.
- A local Valhalla road plan includes a proximity report of existing **source-labeled, reported** ALPR, red-light and speed camera points within roughly 120 m of the route. This is not proof cameras are currently operational, facing the travel direction, or fully mapped.
- Open `Map > Get directions > Directions > Compare camera-aware route`. Select camera types; OpenRF compares a normal route with a **user-requested** Valhalla alternative that avoids up to eight nearby camera-mapped road locations. You must explicitly select an alternate route. An alternate route may be longer or unavailable; road restrictions and safe driving take precedence.
- Only during actively started navigation, three or more **fresh, precise, moving** off-route fixes over at least five seconds can trigger local route recalculation, with a 45-second retry cooldown. The in-memory session does not save a GPS trail. Approximate/stale/stationary positions never trigger a reroute; multi-stop trips require deliberate replanning rather than silently skipping stops.
- If you explicitly selected a camera-aware route, recalculation compares it again and reports when a camera-aware alternative is unavailable. It does not guarantee camera-free travel.
- This is **not** full voice navigation, lane guidance, traffic-informed routing, lane/speed-limit enforcement, or an independently verified field-GPS implementation. Do not interact with OpenRF while driving.

For Windows PowerShell after a restart: `wsl -d Ubuntu -- bash -lc "cd /mnt/c/projects/OpenRF && python3 -m openrf"`


OpenRF is a local-first, open-source RF and geographic investigation platform intended for **WSL development now and a self-contained Raspberry Pi field instrument later**. The previous Android v0.1.6 source has been preserved under `legacy/android-v0.1.6/` but is no longer the primary application.

**No external RF sensor is required to run the interface.** Scanner signal history shows only manually saved records and explicitly labeled synthetic demonstrations. On a supported native Linux host, a separately requested NetworkManager Wi-Fi access-point list can display real but potentially cached results temporarily; this functionality has not been tested with physical RF hardware. Hardware inventory is real and read-only; detecting a Linux network adapter is not proof that a scanner driver is ready. GPS coordinates belong to the observer/survey position, not an inferred transmitter position.

## Install/update via the existing Windows updater

1. Download `OpenRF-v0.2.75.zip` into Windows Downloads.
2. In PowerShell (from any folder), run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Update-OpenRF.ps1'
   ```

3. The local updater installs to `C:\projects\OpenRF`, creates a Git commit of managed paths, and pushes by default. Its output still says **"Android APK workflow"**, because that wording is hardcoded in the reserved updater. The actual trigger is `.github/workflows/openrf-linux.yml` instead. The old Android workflow is intentionally retired; **no Android APK is produced by this release**.
4. Run from the Ubuntu terminal:

   ```bash
   cd /mnt/c/projects/OpenRF
   python3 -m openrf
   ```

   Or run from Windows PowerShell:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\projects\OpenRF\Start-OpenRF.ps1'
   ```

5. In a **Windows browser**, open **http://localhost:8765**. Keep the Ubuntu/PowerShell terminal open while using OpenRF; press Ctrl+C to stop.

No Python packages or virtual environment are required. Python 3.11 or newer is recommended; the supplied WSL Python 3.14 works with this standard-library backend.

## v0.2.55 — traffic camera awareness and your Baofeng memories

**Camera layers:** Open **Map → bottom-right Layers**. Wi-Fi/BLE/RF/cellular/manual observations and ALPR/Flock/red-light/speed camera switches now share the same toggle grid. Camera management appears directly below the toggles (no second accordion), with spaced Reload and Import buttons. Camera switches start off; no locations or external queries are enabled automatically. Optional **Import OSM / DeFlock ALPRs in view** sends the map's *chosen bounding box* to the public OpenStreetMap Overpass API, fetching **only ALPR-tagged positions inside that area** rather than downloading an entire national FlockHopper snapshot. Reports remain `COMMUNITY_MAPPED` (not verified and not proof of operation), are cached to private SQLite for offline use, and do not upload RF scans or travel history. Zoom in for better results; external service availability and data completeness vary. Red-light and speed categories still accept manual sourced entries; alerts and avoidance routing remain future work. See [v0.2.55 tests](docs/RELEASE_0.2.55_TESTS.md).

**Baofeng channel lists:** On the **Radio** page, open **My Baofeng channel lists**. Connect your UV-5R or BF-F8HP using your existing two-pin USB programming cable with CHIRP on Windows. Use CHIRP to **Download from Radio** and **File → Export to CSV**; then select that CSV in OpenRF. It saves a local, read-only channel-list profile. Selecting **Copy to RTL-SDR tuner** only fills a separate receiver tuning form; it will never program or control either Baofeng. The USB programming cable does *not* carry received audio, and this release adds no radio transmission or CAT controls. No hardware is needed to test importing a CSV.

All imported camera and channel records stay in Ubuntu's existing private SQLite DB, not in ZIP/Git. Export/backup that database privately if important. The v0.2.52 map styling stays unchanged.

## v0.2.53 — Receive-only Radio workspace (short playback, not live)

- New **Radio** sidebar workspace provides a MHz frequency field, NFM / AM / mono WFM mode selection and illustrative preset buttons. **No receiver is started automatically**: press **Receive short sample** to request 5, 10 or 15 seconds of local RTL-SDR demodulated PCM audio; after completion the audio can be played from the browser's built-in player. **Stop** discards an incomplete sample. This is **not live streaming, a transmitted signal, a station identification or a verified audio reception**.
- The backend optionally invokes a separately installed Linux `rtl_fm` utility with strictly validated arguments and a bounded receive process, makes a mono WAV **in server memory only**, and serves just that sample via an unguessable local URL while the server is running. It is replaced by the next attempt, lost on restart and never automatically written to disk, attached to GPS, added to investigations or uploaded. The user can choose to save audio manually using browser controls outside OpenRF; local laws and privacy obligations still apply.
- Receiver availability is **not** established by the mere presence of `rtl_fm`. Real reception needs a compatible Linux-accessible RTL-SDR device, antenna and correctly chosen tuned frequency. USB passthrough is normally required in WSL. A valid audio file may contain silence or noise. No transmitter, PTT or radio CAT integration exists. Frequency input range is a conservative software guard, **not actual hardware coverage**.
- Radio and rtl_power spectrum sweeps cannot start at the same time from OpenRF. New API endpoints: `GET /api/radio/status`, `POST /api/radio/start`, `POST /api/radio/stop`, `GET /api/radio/audio/<sample-id>.wav`, all loopback-only. No database migration, automatic scans, cloud services or Python dependencies. The v0.2.52 map appearance and navigation controls are unchanged. See [v0.2.53 tests](docs/RELEASE_0.2.53_TESTS.md).

## v0.2.52 — Unified borderless map controls

- Collapsed **Where to?** search and floating hamburger are **40px high** and share a top edge. The hamburger is smaller, with a borderless dark-teal surface like the existing bottom-right +/layers controls. Expanded search behavior is unchanged.
- The four right-side map tools (below the recenter button) and the top-right **zoom, compass and center-on-my-location** MapLibre controls use the same dark, borderless surface and teal icon tint. The raster fallback buttons also match. All tool actions and keyboard focus states remain functional. Attribution and installed offline maps are unchanged.
- No navigation/routing, geocoding, RF scanning, GPS acquisition, API or database logic was changed. See [v0.2.52 tests](docs/RELEASE_0.2.52_TESTS.md). Physical Raspberry Pi and real map tiles were not tested.

## v0.2.51 — Map overlay tools and selected destination action

- The 800×480 map remains full-height. The old **Tools ↓** scroll shortcut has been replaced with **four floating left-side icons** for Trip planning, Map settings, GPS-linked survey points, and Offline maps. Each opens a scrollable panel over the map with the **existing live controls**; data and event handlers are not recreated or cloned. Layers/scan and manual observation buttons remain lower-right. Press ×, Escape, or the selected icon to close a panel. During active navigation the tool rail hides.
- **Choose destination on map** hides the expanded search to make room for the map. A successful tap displays a small **Destination selected** card with **Get directions**, **Change pin**, and (only after a confirmed local Valhalla road route) **Start navigation**. The same route handler and safeguards are reused. A failed route remains a direct-line *reference only* if locally available; the UI does not claim road directions without Valhalla.
- MapTiler HTTP errors distinguish invalid requests/queries (**400**), key authorization (**401/403**), rate/quota (**429**), and other upstream failures. These diagnostics do **not** independently verify your MapTiler account, key, or live network availability. Address text is external only when online lookup is enabled; key remains outside the ZIP.
- New isolated Chromium viewport tests at 800×480, 390×844 and 1450×900 check the tool rail, panel navigation, non-scrolling overlays, and selected-destination action. Physical Pi touch, real map tiles, GPS and external geocoding have not been verified. Details: [v0.2.51 tests](docs/RELEASE_0.2.51_TESTS.md).

## v0.2.50 — Map-first layout replaces Focus Map

- **Map is now full-height by default**, including the planned 800×480 landscape screen. The extra Focus Map / Exit focus toggle is removed. On compact screens, the hamburger floats at top-right over the map; desktop retains the persistent sidebar. Secondary map managers remain available below the map, rather than being hidden by a special mode.
- Destination search starts as one **Where to?** bar at top-left. Tap it to show the original address/saved-place lookup, map-pin selection and Get directions / Start navigation actions. Close search or press Escape to return to the unobstructed map without clearing your typed destination or route. This is just a view state—no scans or extra geolocation requests are made by opening/closing it.
- A small **Tools ↓** button at the bottom of the map scrolls to trip planning, offline maps, map settings and survey utilities beneath the full-height map. It is hidden during driving guidance to reduce distractions. Floating layers, manual observation controls, map attribution, zoom/location controls, and navigation HUD remain in place.
- No added dependencies, server API endpoints, database migrations, camera routing changes, automatic RF scans, or cloud uploads. Tested CSS/browser controls on 800×480, 390×844 and 1450×900; **live MapLibre tiles and Raspberry Pi touch hardware were not verified**. See [v0.2.50 tests](docs/RELEASE_0.2.50_TESTS.md).

## v0.2.49 — Five-inch landscape usability

- **Map → Hide / Find destination** collapses the large destination overlay to a one-tap button while preserving entered destination text and active route planning state; the map stays navigable. **Map → Focus map** reduces the header and temporarily hides lower-page panels without deleting or changing any data; exit to access map downloads and all other tools. Designed for **800×480** landscape as well as narrow mobile and desktop displays. No scan or location permission is started by either control. See [test guide](docs/RELEASE_0.2.49_TESTS.md).
- **Future ham-radio proposal**: [amateur radio roadmap](docs/AMATEUR_RADIO_ROADMAP.md) describes an optional receive-only RTL-SDR tuning/audio stage and possible read-only CAT integration with an owned ham transceiver. **As of v0.2.53, short receive-only RTL-SDR audio samples are implemented when hardware/tools are present; continuous listening, ham transceiver CAT and all transmission remain future work.** Do not confuse `rtl_power` spectrum capture with a ham transceiver.

## v0.2.48 — On-demand recorded frequency history across saved SDR sweeps

- **Spectrum → Review & compare frequency bins → Recorded frequency history** now shows an on-demand historical comparison for one **exact frequency-bin center** (up to 1 Hz precision) across as many as **16** most recent completed saved RTL-SDR recordings, optionally filtered by investigation. By default comparisons require identical requested start/stop/step settings; no interpolation is applied. Individual capture records are fetched only when the operator presses Analyze; no new scanning or external service is used.
- A compact historical capture-order chart and table show per-capture arithmetic mean reported dB, bin sample counts, host capture-start UTC, optional investigation association, and browser-reported observer fix *accuracy only*. Rows with no exact bin, unreadable data, or incompatible tuning (when checked) are excluded and counted, **not shown as zero**. The chart uses capture order, not uniform time intervals.
- **Export history CSV** is optional and **omits all observer latitude/longitude** (and never implies transmitter location). Values are not calibrated dBm; gain, receiver identity, antenna configuration and CSV frame timestamps remain unverified. This read-only feature requires preexisting completed recordings; DEMO and uncompleted captures are excluded. No database changes, receiver hardware access, background process or new dependency. See [test guide](docs/RELEASE_0.2.48_TESTS.md).

## v0.2.47 — Fresh browser observer location for short RTL-SDR captures (OFF by default)

- **Spectrum → RTL-SDR receiver capture** has an optional unchecked **Request a fresh browser location for this sweep** checkbox and an optional **Link to active investigation** selector. When enabled, pressing **Start short capture** first requests a one-time browser geolocation fix with age and reported accuracy; stale, denied and invalid fixes **cancel the capture** rather than silently dropping location. No background GPS watch, tracking or automatic scan is added. Linking a sweep to an investigation records the association in the private capture metadata (it is not a new observation row or part of existing SQLite-based session counts).
- Only **successfully completed** `rtl_power` sweeps with an explicitly attached location become **SDR survey sites**; failed/stopped captures and old unlocated captures never appear on the map. Location represents the operator's *browser location at sweep start*, not verified GPS antenna position or transmitter position. `rtl_power` dB remains uncalibrated and per-row CSV timestamps have unverified timezone.
- **Map → Recorded SDR survey sites** below the map offers an off-by-default layer of pink observer-position markers, optional investigation filter, and explicitly requested precise-coordinate GeoJSON export. The Spectrum panel also offers a site GeoJSON export. The map displays points only—no emitter heatmap, route history, location inference, or synthesized signal reading.
- Local API: `GET /api/sdr/survey/sites` and `GET /api/sdr/survey/sites.geojson` (optional `?session_id=<active-or-completed-id>` for past associated sweeps). No new runtime dependencies, database schema changes, required accounts, uploads or receiver drivers. Existing offline maps, Wi-Fi/BLE/serial discovery, navigation, captures, spectrum comparison and Android archival work are preserved. See [v0.2.47 test guide](docs/RELEASE_0.2.47_TESTS.md).
- **Limitations:** The WSL browser may report an approximate desktop position or no location; exact coordinates remain local until an intentional export, but exported GeoJSON can reveal survey sites. No physical receiver, Raspberry Pi touchscreen or live GNSS device was tested.

## v0.2.46 — Offline SDR frequency-bin analysis and exact-bin comparisons

- **Spectrum → Review & compare frequency bins** now shows the strongest non-adjacent frequency bins by mean reported dB in the selected display range, and the median reported level across distinct bins. The values are *arithmetic averages of reported dB* across the loaded CSV's historical frames (not calibrated power or transmitter detection). The current frame slider still shows individual frames; analysis spans all loaded frames.
- Expand **Compare with an earlier capture or CSV** to select a separately saved `rtl_power` capture or a locally chosen baseline CSV, then press **Compare loaded vs baseline**. Comparison uses matching frequency-bin centers to 1 Hz and refuses incompatible grids or insufficient overlap: no interpolation or fabricated values. It reports shared-bin counts, differences (current minus baseline), largest non-adjacent changes and a CSV export. Both inputs remain private; selected local files are parsed inside the browser and never uploaded.
- The comparison is read-only, explicitly cleared if the displayed file or frequency range changes, and clearly marked **SYNTHETIC DEMO** if artificial data is involved. Reported bin differences can reflect gain, antenna, receiver differences, clock, noise or environment; they do not establish transmitter identity, location, strength in dBm, or a signal's legal classification.
- No new receiver module, scanning automation, API endpoint, runtime dependency or database schema migration. Captures remain opt-in bounded `rtl_power` requests; Wi-Fi/BLE/USB, investigations, maps/navigation and archived Android sources are preserved. See [v0.2.46 test guide](docs/RELEASE_0.2.46_TESTS.md). Physical receiver, Pi, touch layout and GitHub CI remain unverified.

## v0.2.45 — Receiver-index-0 RTL-SDR short sweeps (NO AUTO SCAN)

- **Spectrum** now has an opt-in 5–30 second `rtl_power` capture control. It runs only after **Start short capture** is pressed; it never scans on startup or when Hardware inventory refreshes. **Stop capture** terminates the worker; partial or failed output is never presented as a successful measurement. A second capture is refused while one is running.
- Requires a Linux-visible compatible RTL-SDR receiver and `rtl_power` installed **in Ubuntu/Raspberry Pi OS**. The UI will disable Start if `rtl_power` is missing, but a visible executable alone does **not** establish hardware. The local software input guard is 24–1766 MHz, 25–500 kHz bin steps and at most 2048 nominal bins. These bounds are not guaranteed receiver coverage; receiver index 0 is assumed, not identified.
- Completed, validated `rtl_power` CSV recordings are stored under the private local data directory next to the active SQLite database (default `~/.local/share/openrf/sdr-captures/`). They remain outside the Git repository, source ZIP and observation database. Operators can review, download or delete captures. Limit: 50 capture metadata records (including failures) until old ones are deleted; each completed CSV is at most 2 MB.
- Captures become **RECORDED · NOT LIVE** after the bounded process finishes. No streaming waterfall, continuous monitoring or automatic RF interpretation. CSV row time zones remain unverified; power is uncalibrated `rtl_power` dB, not dBm. No receiver serial identity, source location, device type or direction is inferred.
- Legacy import of a selected local CSV and clearly labeled synthetic DEMO remain separate, browser-local features. No automatic upload, external service, database migration, mandatory new Python package, telemetry, SDR transmitter, or LAN access is introduced.
- The HTTP endpoints `/api/sdr/capture/start` (POST), `/api/sdr/capture/stop` (POST), `/api/sdr/capture`, `/api/sdr/captures`, `/api/sdr/captures/<id>.csv` and DELETE for a saved ID remain loopback-only; the backend validates settings, restricts file IDs and invokes a bounded subprocess without a shell.
- **To check optional tooling in Ubuntu:** `command -v rtl_power`. If not installed and you plan to connect a compatible receiver later, Ubuntu's `rtl-sdr` package typically supplies it (e.g. `sudo apt install rtl-sdr`). Under WSL the USB receiver must be explicitly passed through to Linux; native Windows detection is not sufficient. No real dongle was connected for this release.
- See [v0.2.45 tests and limitations](docs/RELEASE_0.2.45_TESTS.md).

## v0.2.44 — Unified read-only hardware management

- Open **Hardware** to see a newly integrated connection overview for Wi-Fi, Bluetooth LE, USB Serial v1, SDR, GNSS, Sub-GHz, cellular and radar/laser. Each status lists only the supporting inventory/prerequisites and an appropriate next step; USB probes can be stale, failed or disconnected.
- **Refresh inventory** updates the overview and previously available detailed hardware diagnostics. This action only reads local Linux inventory and prior user-initiated probe status. It does not initiate RF scans, radio transmissions, live SDR sampling, GPS logging or uploads.
- No verified live receiver is implied by interface discovery, USB descriptors, BlueZ/nmcli tooling or a prior USB handshake. **Spectrum** remains a browser-local historical `rtl_power` CSV viewer / synthetic DEMO, not a live RF capture application.
- See [release tests and limitations](docs/RELEASE_0.2.44_TESTS.md). No physical RF hardware or Raspberry Pi tests were performed when packaging this release.

## v0.2.43 — Field-survey planning and evidence dashboard (NO AUTO SCANS)

- Under **Sessions → Start field survey**, name a private investigation and choose a *planned* receiver: Linux Wi-Fi, Bluetooth LE, USB serial, offline SDR CSV, manual, or none. Record a site label, objective and notes. These values **do not prove any device is connected, transmitting or capturing**. Editing the plan cannot overwrite recorded hardware identity, signal quality, frequency or timestamps.
- An active survey panel shows only real database totals: saved observations, non-DEMO observer-coordinate records, SENSOR entries, one-shot scan snapshots and user-created waypoints. Older session records are migrated additively, with their receiver marked **Unassigned** rather than guessed. Starting a session does not start scanning, automatic GPS logging, background jobs or uploads.
- **Open receiver workspace** links to Analysis, Hardware, Spectrum or the map as appropriate. Wi-Fi, BLE and USB scans still require user action and each Save operation is explicit; saved records link to an active investigation as in previous versions. **Offline SDR CSV files remain local, read-only analysis and do not become observations.** A browser location is an observer position, never a transmitter estimate.
- Printable/JSON investigation reports now include the survey plan and clearly say it is a user statement, not verified hardware evidence. Notes can contain sensitive information; review before sharing. Stored raw records and private local configuration are outside Git and release ZIPs.
- Tests: 167 Python tests, 22 JS suites in the software environment, fresh ZIP extraction/regression, additive SQLite migration, HTTP endpoint validation and browser UI structure. Actual RF hardware, field GNSS, Firefox layout and GitHub CI are **not verified**. See [release test guide](docs/RELEASE_0.2.43_TESTS.md).

## v0.2.42 — Offline SDR spectrum/waterfall foundation (NO LIVE RF CAPTURE)

- **Spectrum** is a new navigation page containing a responsive frequency-spectrum plot and chronological waterfall. It reads only a user-selected local `rtl_power` CSV; the file stays **inside the browser**, and the backend does not accept uploads or save those bins to SQLite. A slider lets you inspect historical frames. From/To MHz fields change the display only, not receiver tuning.
- **Load synthetic DEMO** exercises the display with artificial spectrum peaks. DEMO is conspicuously labeled, never a measured live signal or investigation observation, and Clear removes it from memory.
- Reported `rtl_power` bins are labeled **dB, not calibrated dBm**; the CSV timestamp's time zone is **unverified**. Invalid, overlarge, and malformed rows are rejected; frequency ranges and collection characteristics are never inferred from an absent receiver.
- New read-only `GET /api/sdr/status` reports offline-file support, optional installed `rtl_power`/`rtl_test` tools and an explicit future receiver-driver contract. Hardware and sensor registry show tooling as **unverified**, not a connected SDR; no subprocess captures or RF transmissions occur.
- Preserves Wi-Fi/BLE one-shot scans, GNSS/Valhalla/DEMO navigation, offline maps, saved investigations and Android archive without any database migration or extra dependency. See [v0.2.42 tests](docs/RELEASE_0.2.42_TESTS.md). Testing was software-only; no RTL-SDR/HackRF, genuine CSV data or Pi hardware was available to verify measurements.

## v0.2.41 — Multi-location saved wireless survey

- Tap a saved Wi-Fi/BLE/RF/cellular observer marker, and select **Compare saved readings at multiple locations** under a compatible signal-history series. The Layers inspector shows a chronological graph and time-stamped sample list; the map highlights only the receiver's saved sample positions. It never estimates a transmitter location or draws a travel track.
- Compatibility is strict: identifier, source device, hardware identity, source type, frequency, and measurement type/unit must match. A measurement is not "live" just because it is mapped.
- Review the recorded accuracy for each sample and the count of consecutive sample pairs whose *reported* accuracy circles don't overlap. Those are not proof of direction or separation.
- An explicit **Export sample CSV** action prompts before including exact survey coordinates. Nothing uploads automatically. Local rasters and MapLibre vectors both display the saved sample highlights.
- To collect new multi-location evidence: deliberately run a real one-shot Wi-Fi or BLE scan on a supported Linux receiver, explicitly save with a recent browser observer fix, move to a new location and repeat. No continuous collection, fake readings, background GPS history, or new database migration.
- See [v0.2.41 tests](docs/RELEASE_0.2.41_TESTS.md); no physical Wi-Fi/BLE scanner, real receiver travel or Firefox field test verified here.

## v0.2.40 — Wireless map inspection, separate signal units and historical context

- **Map → Layers:** select **Marker colors**: category, recorded RSSI (dBm), or Wi-Fi signal **quality (%)**. Metric displays are independent; a missing or inapplicable measurement is gray, never guessed. Category colors remain available. DEMO records are excluded unless the operator explicitly enables them (orange, distinctly historical). These markers show only **saved observer coordinates**; they are NOT estimated RF transmitter locations, coverage or a heatmap.
- Optional **Saved records** filters: all dates, last 24 h, last 7 days, last 30 days. Invalid/future timestamps cannot appear as recent data. Filtered records are hidden **only from the map**, not deleted from SQLite or source investigations.
- **Inspect a saved mapped point** by tapping its vector/raster marker or from **Saved wireless readings on this map**. The panel displays its actual time, source, device, recorded metrics, optional reported location accuracy, and historical readings from the **same identifier, hardware, frequency, source and unit**. History and earlier/later medians are explicitly descriptive, not transmitter distance or direction.
- The existing map sheet now shows both **temporary Wi-Fi and BLE** one-shot results. Explicit Scan BLE once requires Linux BlueZ and a visible compatible controller. Results are NOT automatically mapped, geolocated or saved; existing server-issued BLE receipts still guard a user-selected Save.
- Pure `openrf/static/survey_map.js` provides read-only filters and graphics contracts, served only on the local loopback API. No new Python dependencies, external network requests, database migrations or tracking. Existing Valhalla, offline Dark/Light maps, printable directions, GNSS beta, BLE/Wi-Fi drivers and Android archive remain intact.
- See [v0.2.40 tests](docs/RELEASE_0.2.40_TESTS.md). Real Linux Wi-Fi/BLE hardware scans and actual Firefox/Raspberry Pi map interactions are **not verified** in the build environment.

## v0.2.39 — Read-only Linux Bluetooth LE discovery (user-started)

- **NEW in Analysis:** Press **Scan nearby LE devices once** to request a bounded 8-second `bluetoothctl --timeout 8 scan le` on a Linux-visible Bluetooth controller and responsive BlueZ daemon. OpenRF never pairs, connects, advertises, or runs scans in the background. WSL without USB controller passthrough displays **unavailable**, not a made-up empty scan.
- Shows BlueZ LE device-event names, Bluetooth addresses (which **may rotate/randomize**), and **RSSI dBm only when BlueZ supplies it**. The retrieval timestamp is not proof of exact advertisement time, and cached BlueZ properties are possible. No frequency, device position, stable person identity or distance is inferred.
- Results are ephemeral until explicitly selected. **Save** accepts only a short-lived server scan receipt and an address that BlueZ actually reported, then stores a SENSOR/BLE observation with source controller, reported RSSI if any and optional *observer* location at the time of scan. No automatic map pins, history, or observations. A saved observation is visible in Saved and appears on the map **only** with an explicitly attached observer coordinate.
- The Hardware sensor registry distinguishes **ready on demand** when a Linux controller/BlueZ is visible from **unavailable**, and continues to label actual scanning as user-triggered only. There is no claim that ordinary Windows Bluetooth is exposed through WSL or that scans were physically verified here.
- Retains Wi-Fi one-shot scans, custom MapLibre Dark/Light maps, Valhalla, offline directions, navigation DEMO, manual survey, reports, and Android archive. No required Python libraries, private data migrations or credentials.
- See [v0.2.39 test plan](docs/RELEASE_0.2.39_TESTS.md).

## v0.2.38 — Wireless discovery foundation and settings gear fix

- Map settings gear remains a small control at **bottom-right** next to Add and Layers even while open; close popup with a separate **X** or Escape. The bottom-left map attribution info remains unchanged.
- One-shot NetworkManager Wi-Fi scan displays the reported BSSID, frequency, band, channel, security, mode, advertised AP rate and signal **quality %**, with band and SSID/BSSID filters. It does not invent RF hardware, RSSI/dBm, accurate AP distance or transmitter locations. Requires a compatible Linux-visible Wi-Fi adapter and nmcli. Survey saving still requires the actual server scan receipt.
- Linux Bluetooth readiness checks hci controller visibility and BlueZ responsiveness. **No BLE device scan** or nearby-device tracking is implemented yet.
- Fix serial HTTP probe/snapshot lock ordering that can cause an intermittent CI failure. This is a code-level fix, not confirmation of a successful GitHub run.
- All existing custom Dark/Light maps, Valhalla routing, offline road/tile resources, navigation DEMO, observation records and Android archive remain in the source. No SQLite migration. See [v0.2.38 test plan](docs/RELEASE_0.2.38_TESTS.md).

## v0.2.37 — Real code: planned directions headline and opt-in DEMO route drive

- **Main turn banner**: even with coarse desktop location, OpenRF now displays the first planned Valhalla instruction as the headline, with the **Planned** label and the approximate-location warning underneath. Live timing is still withheld until suitable real moving GNSS is available; route plans and printable sheets work without GPS.
- **Test on your computer:** Get directions for a destination within the local Valhalla road graph, press Start navigation, expand **Test route (DEMO · no GPS)**, then Play DEMO. Pause/Resume/Stop and 1×/5×/20× playback let you watch a distinctly orange **DEMO** vehicle follow the actual calculated road line while the upcoming maneuver changes. The browser GPS dot is hidden only while DEMO is active. This is **not live navigation**.
- The DEMO movement speed is a fixed virtual 35 mph × the selected multiplier, regardless of real speed limits. Its map pitch, look-ahead position, and bearing are simulated from road geometry, not a measured vehicle heading. No demo points are saved or sent to server APIs. Playing DEMO stops browser GPS acquisition and local GNSS polling until navigation is deliberately restarted.
- Real browser GPS is still limited by its reported precision (~±100 m on the current WSL desktop). Automatic rerouting, real spoken turns, traffic and reliable in-vehicle maneuver timing are not implemented. **Do not use this release as live driving guidance.** See [v0.2.37 testing](docs/RELEASE_0.2.37_TESTS.md).
- No migration, hardware claim, new Python dependency or changes to the installed Northern California Valhalla data. The map, RF tools, reports, exports and archived Android source are preserved.

## v0.2.36 — Route-oriented follow view on desktop without false GPS heading

- **Fixes desktop follow-camera behavior:** Starting navigation immediately enters a tilted, route-perspective view at the real Valhalla road plan's start, clearly labelled as a *planned route perspective*, not the device's location. With a recent browser position near the route (even ±107 m), it shifts the camera to that **reported position** and orients the camera along the *planned road*, while explicitly saying that this does **not** establish actual vehicle heading or precise turn timing.
- With verified **accurate, moving** GPS with real heading, the camera uses measured heading instead, tilts/zooms and displays upcoming maneuver distance. An approximate fix always shows **planned (not current)** turns rather than live turn timing; no fake movement or GPS readings are produced.
- Manual dragging suspends automatic camera updates to avoid Rural Route-style snapback; tapping the map's crosshair resumes camera following. Stale fixes, far-away routes and missing GPS remain accurately labelled; nothing is saved or uploaded.
- In raster fallback mode the map can recenter but cannot rotate or pitch; MapLibre is required for the route-oriented camera. The user must have a real confirmed Valhalla ROAD_ROUTE before entering navigation. No voice guidance/automatic rerouting yet. Real Firefox and GNSS road tests are pending.
- No new Python dependencies, database migration, map tiles, credentials, or sensors. See [v0.2.36 testing](docs/RELEASE_0.2.36_TESTS.md).

## v0.2.35 — Planned turns, GPS follow and optional local gpsd bridge

- Start navigation shows the **next planned turn** even when the browser provides a coarse/stale position, clearly marked **planned (not current)**. The expandable numbered turn list is accessible within the driving view. Only fresh and sufficiently accurate positions advance live turn timing.
- Optional **local read-only gpsd** bridge for Linux/Raspberry Pi (`127.0.0.1:2947`, `?WATCH`/`?POLL`). It is queried only during explicitly started navigation, stops when the user stops or leaves the Map, does not persist location records, and reports device, UTC timestamp, fix age, horizontal accuracy estimate, course and speed if available. Missing/stale/unknown accuracy is not treated as a valid fix. The browser remains the fallback.
- With a real, accurate, **moving** position and heading, the map keeps the driver below center in a tilted heading-up view; approximate desktop browser positions still use a broad north-up view. GPS follow remains a **beta**, not verified vehicle navigation; no spoken turn alerts, automatic reroute or road-level guarantees.
- Existing Valhalla routing, printable route sheet, offline vector maps, RF investigations and saved observations remain intact; no new dependencies or database migration. See [v0.2.35 tests and optional gpsd setup](docs/RELEASE_0.2.35_TESTS.md).

## v0.2.34 — Map overlay, drivable directions, and opt-in GPS-follow beta

- The destination search form now **overlays the Survey Map** instead of pushing it downward. **Get directions** calculates a planned road route first. Only a confirmed local Valhalla **ROAD_ROUTE** enables **Start navigation**.
- **Start navigation** asks the browser for continuous high-accuracy positions *only after the user presses it*. It offers a follow-camera (zoom ~16.5, pitch 42°, device heading when movement is reported) and a prominent next planned Valhalla maneuver. The browser coordinates are held only in temporary process/browser memory; **no GPS trail is saved or uploaded**. Stop ends the browser geolocation watch; leaving the Map page also ends it. Poor or stale fixes pause maneuver guidance. This is **experimental GPS-follow assistance, not tested active turn-by-turn navigation**: no voice, lane guidance, reliable positioning, traffic, road-closure updates, or automatic rerouting. Do not adjust the screen while driving.
- A **small solid red destination pin** remains movable on the map. It can also be dragged after picking a complete street address or generating a road route. Moving it discards the old route; press **Get directions** again before following the new endpoint.
- When local Valhalla cannot calculate a route to a very distant location (e.g. Alabama from Northern California), OpenRF reports missing road routing coverage and **does not draw a misleading interstate direct line**. Valhalla's regional `.osm.pbf` road graph is entirely separate from the online/offline visual MBTiles. The existing `setup-valhalla-wsl.sh` installs **Northern California only**. Nationwide routing requires expanded, validated road data and appropriate Docker resources, **not just a change of basemap**.
- Runtime OpenRF Dark and Light styles add zoomed-out **country labels** from the online OpenMapTiles `place` source when provided. The approved JSON files remain unchanged; the offline Amador/Calaveras tile package does not cover the whole U.S. and cannot guarantee country labels at continental zoom.
- MapTiler/Photon/Census geocoding and opt-in privacy remain unchanged. **True live early address autocomplete** still needs a working configured provider and network; regional offline street-name hints do **not** verify house numbers.
- Maps, SQLite records, surveys, wireless discovery, GPS waypoint capture, investigations, reports, archived Android code, and local Valhalla installations are preserved. No SQLite schema migration or additional Python dependencies.
- See `docs/RELEASE_0.2.34_TESTS.md` for WSL testing, privacy and hardware limitations.

## v0.2.31 — Approved OpenRF Maps integration

- Integrated **OpenRF Maps v0.1.11** into the existing Linux application (no replacement or duplicate map UI). **OpenRF Dark is the default**, and **OpenRF Light** is available in Map settings; both original approved JSON files remain byte-for-byte intact, and their empty standalone preview overlays are removed only from a served copy.
- The main Python HTTP server now serves the **bundled Amador/Calaveras vector MBTiles** (5,703 map tiles), offline Noto Sans glyphs, and the local MapLibre runtime. No second preview server or new account is required. Bundled regional tiles occupy ~25 MiB uncompressed; only the local map itself is distributed, not the full Northern California Valhalla source or private data.
- Under **Map settings**, choose **Use offline regional vectors** to switch from OpenRF's online vector source to local tiles without resetting surveys, pins, routes or the browser location. Offline map data is available only in the declared region; **outside this area, local tiles are missing**. The older raster package/coordinate fallback remains intact and separate.
- One-tap **Choose destination on map** still restores ordinary map panning after placement. You can now **drag the teal destination pin** to adjust the destination before starting navigation; the address/coordinates update and any stale route preview is invalidated. Dragging never records a survey observation or background GPS track.
- Added opt-in-free, **offline regional OSM street-name completions** once a house number and at least two street-name letters are typed (for example, `25005 State`). They fill only a possible **road name**, not an address match; **the house number is NOT verified**. Complete address matching via Census (approximate, after online opt-in), configured MapTiler/local Photon typeahead, and local Valhalla road routing remain unchanged. No invented address coordinates or invented driving routes.
- Map credits remain accessible. Data: © OpenStreetMap contributors (ODbL), Geofabrik-derived regional source, OpenMapTiles-style output; MapLibre and glyph notices are recorded under `docs/OPENRF_MAP_STYLE_NOTICES.md`. Select a compatible open-source license before any public distribution.
- See `docs/RELEASE_0.2.31_TESTS.md` for WSL checks, test coverage, limits, and instructions for installing an updated regional vector archive in private local storage.

## v0.2.28 — U.S. destination matching and local Valhalla setup

- **Start navigation** now takes its own full-width row below the opt-in search checkbox.
- Photon and MapTiler address queries are limited to the United States. Photon street-address results include the house number, street, city and state where supplied. Choose a specific suggestion before routing; OpenRF does not silently accept a guessed first match.
- Added a read-only local Valhalla status check on Plan a trip and an optional guided WSL/Docker helper under `tools/setup-valhalla-wsl.sh`. Valhalla itself and Northern California road data are **not** bundled, and setup has **not** been run for you. See [Local Valhalla setup](docs/LOCAL_VALHALLA_WSL.md).
- Public Photon remains an opt-in, best-effort demonstration service, not guaranteed U.S. street-address coverage. No automatic lookups or tracking.
- Existing reports, maps, sensor and investigation data are preserved. No database migration is required.

## v0.2.26 — Address lookup and navigation entry cleanup

- The map starts in the **legible Liberty style** again; dark map remains optional under Map settings.
- The destination input uses the full available width. A single **Start navigation** button with a diagonal paper-plane icon replaces the old Route button. It currently initiates route **planning**; turn-by-turn guidance is not implemented.
- **Online address suggestions** are optional, off by default, and use public Photon only after the operator opts in. Typed addresses are sent to the address provider over HTTPS; the browser's coordinates are **not** sent to the geocoder. The public Photon demo is fair-use limited and might be unavailable. Self-hosted Photon or explicitly configured MapTiler remain supported.
- A one-shot browser location request supplies a fresh starting point when the previous fix is stale, with visible errors if permissions are denied.
- With Valhalla and a regional road graph running locally, OpenRF can draw the returned road geometry and show planned maneuvers. Without it, **only a labeled dashed straight-line reference** is drawn—not a drivable route.
- Future options such as avoid highways, known ALPR cameras, road incidents and police reports are **planned, not implemented**. See [v0.2.26 installation and tests](docs/RELEASE_0.2.26_TESTS.md).

## v0.2.25 — Valhalla road-route adapter and address suggestions

- Added a local Valhalla interface, advanced multi-stop planning, geocoding support when configured, and the experimental dark map style. These capabilities remain present; v0.2.26 restores the Liberty default and adds optional public address suggestions.
- Detailed setup instructions are retained at [v0.2.25 tests](docs/RELEASE_0.2.25_TESTS.md).

## v0.2.24 — Map-first navigation and Rural Route research

- **Map is the primary workspace:** compact destination entry appears directly above the map, with an optional expandable **Plan a trip** workspace beneath it. There is no separate primary Navigation page. Stored destinations or `latitude, longitude` may be entered in the quick bar, with suggestions from private saved locations.
- The starting point defaults to your latest browser-reported location (when available and no custom origin has been entered). The map never starts background GPS tracking or saves navigation fixes. A custom origin is available in the expanded planner. Denied, stale, or unsupported location fixes fail clearly rather than guessing.
- **No address geocoding or road routing yet:** arbitrary street addresses are *not* resolved; an explicit message explains the limitation. Previews are still labeled **direct line, not a drivable route**. Full multi-stop navigation, roads and directions depend on the later routing engine and road graph.
- **Recenter button:** compact location crosshair below the map’s zoom and compass controls. A recent browser fix recenters immediately; otherwise it requests a new permitted fix without background tracking or saving.
- **Clean map opening:** optional offline basemap and map-file controls now sit below the main map and GPS survey waypoints. The small Survey Map layout opens without those panels pushing the map down the screen. Map controls remain available under **Map settings** and Layers. Required map attribution remains accessible.
- **Observation form:** Use my location now sits after the accuracy field, keeping coordinate and accuracy controls together. Existing secure location provenance remains unchanged.
- **Routing architecture:** reviewed the prior Rural Route history (MapLibre, previous HERE/Google Directions and later TomTom integration). Plan a local Linux-native Valhalla adapter using OSM-derived regional road graphs, with origin/destination and maneuver data normalized through OpenRF's JSON API; no live routing engine was bundled or configured in v0.2.24. See [routing design notes](docs/ROUTING_ENGINE_DECISION.md) and [release checks](docs/RELEASE_0.2.24_TESTS.md).
- No schema migration, new Python dependencies, traffic API keys, third-party location requests, RF hardware data, or changes to the local sensor system.

## v0.2.23 — Navigation foundation and compact map UI

- **Navigation (new page):** manually enter a starting coordinate and a destination; request a fresh browser location only by clicking the button; or choose the destination by tapping the Survey Map. No automatic location tracking or GPS recording.
- **Local saved destinations:** up to 250 named coordinates retained in a new additive `navigation_destinations` SQLite table, independent from observations, waypoint tracks, signal evidence and investigation records. Save, reuse or remove them through the navigation interface.
- **Geographic preview:** a dashed straight-line overlay connects the selected positions; the app shows great-circle distance in miles/kilometers and initial bearing. **This is NOT road routing, driving distance, turn-by-turn directions, police identification, or camera-aware route planning.** Do not use the line for driving instructions. Real routing, voice guidance, source-verified ALPR alerts, and radar integration remain future milestones.
- **Map cleanup:** removed the redundant full-width **Add observation manually** button under Map. Retained the + map action and map-click observation placement, now with smaller 32px borderless stacked-layers and + controls. **Map copyright attribution remains accessible** through a more discreet credit disclosure (can't remove required credits).
- Moved **Use my location** to immediately beneath the longitude field in the observation form. Existing browser-provenance and accuracy logic are unchanged. No third-party routing service, paid account, or new Python dependency.
- New API: `GET/POST /api/navigation/destinations` and `DELETE /api/navigation/destinations/{id}`, loopback-only with existing origin protection; input ranges and fields are validated. See [v0.2.23 test guide](docs/RELEASE_0.2.23_TESTS.md).

## v0.2.22 — Observation location shortcut and reliable startup

- **Bug fix:** The initial browser refresh requested a hardware-readiness result but failed to assign the returned value. Fixed the client-side `Readiness is not defined` error; the banner no longer incorrectly identifies all refresh errors as a local-server disconnection. The Hardware readiness checklist remains read-only.
- **Use my location:** Open Map → + (or Saved → Add observation) and press **Use my location** beneath the latitude/longitude fields. The browser requests a fresh location only at that moment and fills the coordinates and reported accuracy. Nothing is saved until you press **Save locally**. When geolocation is denied or unavailable, use manual coordinates or tap a map point.
- Location data is labeled **BROWSER_REPORTED**, and optional fix age is recorded using existing storage columns. Desktop/VPN location may be inaccurate; a browser position is an **observer location**, not proof of a camera, transmitter or police vehicle location. Manually edited coordinates are not mislabeled as GPS. Stale fixes must be refreshed before saving.
- No new Python dependencies, background location tracking, RF capabilities or database migration. See [v0.2.22 test guide](docs/RELEASE_0.2.22_TESTS.md).

## v0.2.21 — Hardware readiness and map actions

- **Hardware → Readiness checklist** evaluates the actual Linux inventory and previously requested Wi-Fi/USB activity, without initiating a scan, serial read, or device probe. It differentiates visible/accessible USB ports, permission failures, missing wireless interfaces, recent protocol replies, stale replies, and disconnected devices. All detected capabilities are **unverified until explicitly tested**. BLE, SDR, external GNSS and police radar remain **not implemented**.
- **Refresh hardware** now refreshes diagnostics and the readiness checklist as well as the inventory. **Export readiness JSON** downloads only the conservative status/checklist and aggregate counts, excluding private serial IDs, Wi-Fi addresses, raw readings and GPS records. It is not proof that a receiver is working.
- The Survey Map's **Layers** control is smaller, uses a familiar stacked-layers SVG, and remains at lower right. The adjacent **+** control opens the existing manual observation form **without silently assigning GPS or map-center coordinates**. Tap the map at a specific location to prefill coordinates instead.
- Added spacing below **Add observation manually** to separate it from the optional GPS waypoint card on narrow screens. No changes to stored observations, waypoints, captures, maps or the offline SQLite schema. No hardware driver dependency added. See [v0.2.21 tests](docs/RELEASE_0.2.21_TESTS.md).

## v0.2.20 — Manual, session-linked browser GPS waypoints

Go to **Map → GPS-linked survey waypoints** and start an investigation on **Sessions** first. Select the investigation, optionally enter a waypoint note, and click **Save a fresh location waypoint**. The browser asks for current geolocation only upon each explicit click. No background tracking, path reconstruction or RF acquisition occurs. A successfully saved waypoint is linked to that investigation and retains browser accuracy, fix timestamp and age, plus the server's receipt time. No satellite fix or external GNSS hardware is claimed.

**Show saved waypoints on map** is OFF by default, and only affects the selected investigation. Point markers work with the online vector map or offline coordinate/raster fallback. Separate points do not imply a driven route or transmitter location. **Export session GeoJSON** confirms before downloading precise location records; consider privacy before sharing the downloaded file. You can delete a single waypoint with confirmation without deleting investigation observations or scan captures. Waypoint export requires local API access and does not upload anything to third parties.

The additive `survey_waypoints` SQLite table is initialized automatically without overwriting existing data. The previous investigation HTML/JSON report does not yet include waypoints. See [v0.2.20 test guide](docs/RELEASE_0.2.20_TESTS.md).

## v0.2.19 — Advanced historical signal analysis

- In **Analysis → Signal history**, choose a compatible saved measurement series by identifier, kind, measurement unit, evidence source, receiver label, reported hardware identity, and recorded frequency. Unlike the previous identifier-only chart, different devices, units or frequencies never share an axis or a line. Both the graph and comparison panel now use the same grouping rules.
- Inspect **all / last 24 hours / last 7 days / last 30 days** of *saved* readings, relative to the newest reading in that series. A time-scaled chart displays values plus a median guideline; a summary lists count/median/min/max and timestamp span. A collapsible recent-readings list shows time basis and investigation assignment.
- Charts render a maximum of ~202 sample points using a min/max sampling algorithm, preserving spikes and dips in the plotted sample. All matching rows are still included in descriptive statistics and export. No chart reveals distance or source location, and saved measurements are never live scans.
- **Export selected series CSV** downloads only selected saved readings, with reported unit, provenance and receiver/time identity. **Precise observer GPS fields are omitted by default**; use the opt-in checkbox if necessary. Synthetic DEMO data is excluded unless independently enabled in the history panel. No remote requests are made for analysis/export and no database changes are needed.
- Browser/history comparisons are still limited to the latest 10,000 observations loaded by the local API; some older measurements could therefore be absent from the view. Unverified hardware, cached Wi-Fi readings and old/estimated timestamps retain caution labels. See [v0.2.20 tests](docs/RELEASE_0.2.20_TESTS.md).

## v0.2.18 — Printable investigation reports

- On **Sessions → Investigation report**, choose a saved investigation (or use its **Report** button). Preview a self-contained, print-friendly HTML report in a new tab, use the browser Print menu to **Save as PDF**, or download standalone **HTML** and **JSON** copies. The report is generated on demand from local SQLite records rather than potentially truncated browser lists.
- Each report includes session start/end/status, historical observations with evidence provenance and notes, explicitly saved one-shot survey captures including zero-result scans, source/category counts, and median/range summaries of compatible signal readings. The summaries only group identical kind, evidence source, identifier, receiver label, hardware ID, MHz and measurement unit; dBm is not compared with NetworkManager quality %.
- **Privacy by default:** synthetic DEMO observations and precise survey latitude/longitude are excluded unless their respective checkboxes are enabled. Coordinates describe **observer** survey positions, never RF source positions. Notes and identifiers can still contain personal information and should be reviewed before sharing.
- Reports are explicitly **HISTORICAL / NOT LIVE**. Source device identity, measurement accuracy, timestamps, calibration and scan freshness may be unverified. Empty investigations produce truthful empty reports. Large reports are capped at 5,000 observation records, 1,000 captures, and 150 metric groups, with visible truncation notices and original matching record counts.
- New read-only endpoints: `/api/reports/sessions/<id>.html` and `/api/reports/sessions/<id>.json`. HTML is self-contained without external assets; no report records are saved back to SQLite. No new libraries, auto uploads, live hardware scan, routing, radar reception or database migration. See [v0.2.18 tests](docs/RELEASE_0.2.18_TESTS.md).

## v0.2.17 — Historical signal comparisons

- On **Analysis → Compare saved signal history**, inspect historical measurements grouped by category, identifier, metric/unit, source, receiver label, reported hardware ID and recorded frequency. This prevents accidental comparisons of RSSI dBm against NetworkManager quality %, or results from different receivers/observations with the same identifier.
- **Earlier half vs later half** compares time-ordered saved readings. **Two investigation sessions** instead compares two explicitly selected sessions when both contain comparable samples. The panel shows medians, ranges, sample counts, timestamp spans, median difference and limitations.
- **Export comparison CSV** downloads the original baseline and follow-up records with measurement units, device/source provenance, GPS observer coordinates (if present), session IDs and timestamp basis. It is generated locally and does not modify the database. Spreadsheet-style formula injection is escaped.
- DEMO data is excluded unless enabled via **Include SYNTHETIC DEMO / HISTORICAL readings**; manual readings retain their unverified status. The browser's saved-record endpoint is limited to the latest 10,000 observations, and incomplete or unmatched groups cannot produce a comparison.
- No new RF hardware capability, live RF classification, location estimate, network transfer, database migration, third-party dependency, routing or radar detection. See [v0.2.17 testing](docs/RELEASE_0.2.17_TESTS.md).

## v0.2.16 — Saved Observations Explorer

- On **Saved / Discoveries**, filter existing local observations by text, type, evidence source, investigation session, recorded age (past day/week/month), or presence of survey coordinates. Sort by observation timestamp in either direction; use **Clear filters** without reloading the app.
- **Investigations → Records** now opens Saved with a visible, editable investigation filter instead of a hidden session-only mode that required a browser refresh to clear.
- **Export shown CSV** downloads only matching saved observations using the browser; it includes original `source`, `source_device`, timestamps, measurement units, survey coordinates/accuracy, session/capture references and hardware provenance where available. It does not change the existing full-export endpoints or upload anything. Spreadsheet-style formula strings in user text are escaped.
- DEMO data remains opt-in; imported, manually entered and sensor-reported records are not reclassified as live. Time-window filters use the browser clock and `observed_at` timestamps, not device-sensor clock inference. Stored record lists are currently capped to the latest 10,000 rows by the existing backend, and the explorer reports this limit.
- No database migrations, new Python dependencies, collection in the background, or change to radar/navigation feature status. Existing map UX and optional offline files are preserved. See [v0.2.16 testing](docs/RELEASE_0.2.16_TESTS.md).

## v0.2.15 — Fuller U.S. overview and smooth GPS camera

- Opening the Survey Map still starts on a U.S. overview when there is no previously chosen map view. After browser location permission is accepted and a fix is obtained, MapLibre smoothly pans and zooms to the browser-reported position with a bounded flight instead of snapping instantly.
- A fix delivered *before* the online map style finishes loading is kept pending and animated after the style becomes ready. A manual map gesture made during the location request prevents an unsolicited automatic recenter; the My browser location button may always be used explicitly.
- The local coordinate-grid / offline raster fallback now also moves and zooms gradually, with interruption on drag/wheel/zoom buttons. Motion-reduction preferences avoid animation.
- Offline-area tools remain available but optional, labeled as offline tile management and collapsed by default. No change to map downloads, USB/ESP32 receivers, investigations or SQLite storage. See [v0.2.15 test guide](docs/RELEASE_0.2.15_TESTS.md).

## v0.2.12 — Licensed raster tile ZIP → offline MBTiles

- **Survey Map → Manage offline map areas**: export a saved area as a **provider-neutral XYZ tile plan JSON** with geographic bounds and per-zoom x/y ranges. This is an acquisition *plan*, not map data, a download, an API endpoint for a provider, or a coverage guarantee.
- **Import local tile ZIP to MBTiles**: choose a ZIP containing tiles in `z/x/y.png` / `.jpg` / `.webp` paths (optionally inside `tiles/` or one root folder). Select an existing saved area, enter a new map name, original provider/source name and required attribution, pick the archive's XYZ or TMS row numbering, and confirm actual offline/archive rights. OpenRF validates and clips the ZIP to your area, converts selected tiles to standard TMS MBTiles, and installs it into private local storage. It cannot fetch or generate source map tiles; **provider permission is required**. Never use bulk raster requests to public OpenStreetMap tile servers for this.
- **Safety:** no overwriting existing packages; no extraction to filesystem paths; rejects traversal, symlinks, malicious path layouts, corrupt images, duplicates and mixed image formats; bounded 512 MiB input/output and 10,000 selected tiles. Source ZIP stays on the user's computer and is not changed. No migration to user investigation SQLite, new dependency, automatic upload, live RF scan, or radar implementation.
- See [Tile ZIP workflow](docs/TILE_ZIP_IMPORT.md), [Offline Maps](docs/OFFLINE_MAPS.md) and [release tests](docs/RELEASE_0.2.12_TESTS.md).

## v0.2.11 — Geographic area planner and local MBTiles subset builder

- **Survey Map → Manage offline map areas → Plan a geographic area**: choose two opposite corners directly on the map (online vector or offline raster grid), capture the visible map extent, or enter west/south/east/north coordinates manually. Plan zooms 0–18 and save named areas locally outside Git, separate from observations. During two-corner selection, map clicks do not add observations. Saved plans can be viewed, exported as GeoJSON or deleted without removing maps or investigations.
- **Create local MBTiles subset**: select a previously installed and licensed *raster* MBTiles map and a saved area. With explicit confirmation that the source license permits derivatives, create a new package containing **only existing local tiles** intersecting that area/zoom range. Includes source attribution; no automatic download, no remote tile requests, no overwritten source, no promise of complete geographic coverage. Bound to 10,000 candidate tiles and 512 MiB tile payload per subset; existing 1 GiB browser import limit unchanged. A plan works even without source tiles, but a basemap requires a source package.
- See [Offline Maps](docs/OFFLINE_MAPS.md) for privacy, Web Mercator, license, zoom/extent limitations. All existing v0.2.10 features and Android archive are preserved. No SQLite investigation database changes, extra Python packages, new ESP32 driver, radar detection, or external RF scanning.

## v0.2.10 — Offline map area manager

- **Survey Map → Manage offline map areas** can now import raster MBTiles from the browser, inspect the declared map boundaries, zoom range, size and provider attribution, center on the selected region, and explicitly remove that local map package. Streams up to 1 GiB to a private staging file without loading the entire archive into RAM. Rejects unsupported/corrupted files and duplicate names; no existing local map or observation database is overwritten. See [Offline Maps](docs/OFFLINE_MAPS.md).
- **No automatic tile-area downloads:** Public OpenStreetMap tile servers remain off-limits for offline prefetching; only previously licensed local MBTiles packages may be imported. Vector basemap remains online. Offline grid and observation pins work without internet.
- Hardware and sensor inventory now explicitly list the radar receiver module as **NOT IMPLEMENTED**, rather than silently implying generic RF hardware can detect it. Added a [long-range receive-only police radar module roadmap](docs/RADAR_RECEIVER_ROADMAP.md) for future X/K/Ka and LIDAR detection. **No radar hardware, radar detection, range, or laser sensor is implemented in this release.**
- Preserved previous map behavior, SQLite data, USB diagnostics, one-shot Wi-Fi, investigations, archived Android project, and ESP32 firmware. No schema migration or required new Python packages.

## v0.2.9 — Local raster basemaps, offline grid and optional cached MapLibre

- **Raster fallback no longer calls OpenStreetMap's public tile servers**, which reject some restricted requests and prohibit offline-area prefetching. If no local basemap is selected, the existing draggable Web Mercator grid, geolocation dot and recorded survey pins remain interactive without a network.
- Copy a licensed prebuilt **raster MBTiles** file (PNG/JPEG/WebP) to `~/.local/share/openrf/maps/` on Linux/WSL. Select it in the Survey Map **Offline basemap** dropdown and use **Refresh maps**. Tiles are read read-only from this separate local folder, with no request to an external server. No map downloads or tile uploads are implemented. See [Offline Mapping](docs/OFFLINE_MAPS.md).
- Optional one-time `python3 tools/cache-maplibre.py` copies MapLibre v5.24.0 JavaScript and CSS from the pinned upstream release to `~/.local/share/openrf/assets/`. When not cached, the server redirects those resources to the existing CDN for online vector-map mode; the grid/MBTiles renderer works independently of MapLibre. **OpenFreeMap vector tiles remain online**, even if JS/CSS assets are cached.
- Local map packages remain outside Git and the release ZIP, and are never published by the updater. No existing observation database schema changes, recording logic changes, or hardware firmware changes.

## v0.2.8 — Experimental ESP32-S3 USB sensor firmware

Includes source-only Arduino-ESP32 3.x firmware under `firmware/esp32-s3-openrf-serial-v1/` for an ESP32-S3 device **you flash separately**. A manually requested OpenRF Serial v1 snapshot runs a passive 2.4 GHz Wi-Fi AP scan and returns up to 32 observed AP identifiers, frequency MHz, and ESP32-reported RSSI dBm. The firmware offers WIFI only; it does not claim BLE, 5/6 GHz, SDR or GPS. No board, compiler toolchain or USB port was available here; firmware flashing and live measurements are **not physically verified**. See its README for build/USB instructions and limits.

Hardware inventory now displays Linux serial port access/group hints and error messaging for firmware errors, disconnections and permission failures. Port presence or a successful handshake remains **unverified**, never proof of an authentic or calibrated sensor. No background scans or external uploads. The SQLite schema is unchanged.

## v0.2.7 — USB serial interface and sensor snapshots

A new **External USB sensor** section on Hardware allows explicit probing of an inventoried Linux `/dev/ttyUSB*` or `/dev/ttyACM*` endpoint. It will only communicate with firmware implementing `openrf.serial.v1` (see `docs/USB_SERIAL_PROTOCOL.md`). A successful probe verifies only protocol response, not hardware identity or RF correctness. **Capture one snapshot** asks a compatible module for one bounded set of measurements and saves it with unverified device provenance. Experimental ESP32-S3 firmware is included in v0.2.8, but is not flashed automatically or physically tested. Missing WSL USB passthrough is an expected unsupported state. No background scanning occurs.

Previous saved Wi-Fi snapshot features remain described below.

## v0.2.6 — Saved surveys, measurement quality and readiness

- **Save scan snapshot:** After requesting a real one-shot Linux Wi-Fi scan, choose **Save scan snapshot** on the Survey Map or Analysis screen. This saves the verified server-returned results **as one atomic capture**, including a zero-result retrieval. Individual AP saves from v0.2.5 still work. Scanning is never automatic or continuous.
- **Optional survey coordinates:** Check **Attach observer position from scan time** before saving. The browser must already have returned a location fix **within 60 seconds before scan request**. If none was recent, save without coordinates or use **My location** and initiate a new scan. A coordinate is *where the browser reported the receiver*, never the AP/transmitter location, and is not independently verified as GNSS.
- **Capture history:** Investigations now list saved Wi-Fi snapshots and show how many observations were attached to each session. Snapshots include source adapter, UTC retrieval time, freshness warnings, quality units, observer coordinate origin, optional fix age, and returned/saved counts. No-result scans are listed as events, never as detected signals.
- **Signal analysis:** The chart can show repeated measured NetworkManager signal-quality percentages separately from manually entered **RSSI dBm**. These quantities are never merged or interpreted as distance. Cached AP results may still occur. CSV/GeoJSON include capture IDs, percent quality, and location provenance.
- **Diagnostics:** Hardware now shows a read-only readiness/last-retrieval report. Visible interfaces are not evidence of an attached working SDR/BLE/GNSS sensor.
- **Database migration:** Automatic additive SQLite schema upgrade preserves prior observations and sessions. Back up the private database if it contains valuable records. The release was tested on SQLite fixtures but not yet on your WSL data.

On the WSL machine with only `eth0`, **Save scan snapshot remains disabled until a real Linux-visible Wi-Fi interface returns an actual scan**. There are no fabricated test readings; the optional existing DEMO set remains separately marked.

## v0.2.5 — Touchscreen map controls and sensor connections

- On browser windows ≤900 CSS pixels wide, OpenRF opens directly to Survey Map, with a top-right hamburger-triggered vertical drawer from the right (Overview, Map, Analysis, Saved, Sessions, Hardware). 5-inch Raspberry Pi Touch Display 2 portrait 720×1280 and landscape 1280×720 orientations were tested in an emulated browser; no physical touchscreen or Pi OS test has occurred. Desktop layout remains unchanged. All pages remain reachable; technical signal analysis still has its own page.
- Tap the **layers icon in the bottom-right corner** on Survey Map to open a touchscreen-friendly panel. Toggle Wi-Fi, BLE, RF, cellular, infrastructure, and manual **saved survey observations**, view how many geotagged points are displayed, or request the same optional native Linux Wi-Fi one-shot scan that remains on the Analysis page. Demo records remain hidden by default.
- Markers are color-coded by recorded category. **Every marker represents where an observation was recorded, not an estimated transmitter location.** Manually entered categories remain explicitly `MANUAL` provenance. The live one-shot NetworkManager AP list has **no device coordinates**, so it remains a temporary list by default. A specific result may now be saved explicitly using a server-issued scan receipt. The user may optionally attach the browser's observer coordinates (not the AP's location).
- Browser location behavior (permission once, accuracy notice, marker, street-level zoom), vector/raster map fallback, observations, investigations, exports, database, and existing Linux hardware detection are preserved. There is no continuous BLE/Wi-Fi/SDR scan or live RF heatmap in this update.
- To preview the 5-inch layout before purchasing hardware, narrow Firefox to ≤900 CSS pixels wide or use responsive design mode. Map controls are inside the map sheet at handheld sizes.

**v0.2.5 controls:** On compact displays, the menu now sits in the top-right and the map Layers & Scan button is icon-only in the bottom-right. Browser location is applied after the map style becomes ready, preventing the zoom being lost at startup. Attribution has been reduced to a small `ⓘ` disclosure on the map with the required data credits.

**Sensor receipts:** The Hardware screen now lists adapter driver states, and NetworkManager scan results have individual **Save** buttons. Each save references an actual recently returned scan and preserves `SENSOR` provenance and retrieval timestamp. A scan may include cached entries, Wi-Fi quality percentage is not RSSI in dBm, and the user's browser location is optional and is not the access point's location. See [docs/SENSOR_CONNECTIONS.md](docs/SENSOR_CONNECTIONS.md). BLE/SDR/GNSS capture remains future work.

No special map API key is needed for the existing OpenFreeMap styles. Do not paste private keys into project source or public GitHub commits.

Hardware planning: see **[docs/HARDWARE_SHOPPING_LIST.md](docs/HARDWARE_SHOPPING_LIST.md)** for a staged parts list, estimated costs, and what not to buy yet.

## Working features

- **Dashboard:** Real counts from locally stored records and explicit environment status. No invented scan results.
- **Map:** Automatically requests browser geolocation on first visit (requires explicit permission), adds separate location marker and accuracy-aware street-level zoom; never saves browser position. MapLibre 5 with OpenFreeMap street/dark vector maps when the resources load, or an independent built-in raster map if they do not. The fallback shows a fully offline coordinate grid and can render a separately supplied raster MBTiles package; it no longer requests OpenStreetMap raster tile servers. Map clicks create manual observations at the survey coordinate.
- **Discoveries:** Save/delete manually entered signal or infrastructure observations, with coordinates, source label, timestamps, optional RSSI/frequency/identifier, and provenance. Coordinates always refer to survey location.
- **Investigations:** User-started local sessions; manually entered observations and explicitly saved Wi-Fi snapshots can be linked to an active session. Start/stop/review history; a prior ACTIVE session is marked INTERRUPTED after a process restart. No background capture or travel tracking.
- **Native Linux Wi-Fi survey:** On-demand `nmcli` access-point list if a Linux Wi-Fi interface is visible. No background scans; NetworkManager may use active probe frames and may return cached entries. SSID/BSSID, channel, frequency, security, and signal **quality %** are shown temporarily. Results are not GPS positions or RSSI dBm. Individual access points or an entire short-lived verified scan may be explicitly saved, with a UTC retrieval timestamp, source, and freshness caveat. Only captured one-shot snapshots preserve the separate quality-percent measurement column and group ID. See `docs/NATIVE_WIFI_DRIVER.md`. WSL with no Linux radio returns a clear unavailable error.
- **Signal analysis:** Inspect saved BLE/Wi-Fi/RF/cellular-labeled observations and plot either RSSI dBm or NetworkManager quality-percent history by recorded identifier (never mix units). Manually entered RSSI values remain labeled `MANUAL`; they are not a true measurement from a connected device.
- **Hardware:** Read-only visibility of real Linux USB descriptors, USB serial ports, network and Bluetooth interfaces, plus unconnected/planned sensor integrations (SDR, BLE, Wi-Fi, GNSS, CC1101 and external cellular modem). No driver availability is falsely inferred from an interface name.
- **Exports:** Local CSV and GeoJSON with source and observer-location semantics, including capture grouping and Wi-Fi quality-percent metadata. CSV escapes spreadsheet-formula injection. Nothing is uploaded automatically.
- **Optional demo data:** A user-triggered synthetic sample set marked DEMO everywhere, hidden from map/discoveries by default; remove via Dashboard.

## Test the app before buying hardware

1. Visit Overview; confirm all counts initially zero on a fresh WSL install.
2. Visit Survey Map. Online OpenFreeMap vector tiles provide street detail; if unavailable, use the built-in grid or select an installed local raster MBTiles package. Click a point or use **Add observation manually**; save a labeled note. Confirm map marker and Discoveries list. On first opening Map, the browser asks for location permission (if not previously granted/denied); with a usable fix it centers automatically. If location is blocked, unavailable, or coarse on desktop/VPN, you can still pan or use “My browser location”.
3. Start an Investigation; create another observation and confirm it appears in the session's Records view. Stop the session. Refresh the page and verify persistence.
4. Download CSV and GeoJSON; verify the saved note and the explicit `coordinate_meaning` field. Check the private database exists under `~/.local/share/openrf/openrf.sqlite3` on Linux. It is **not** inside the Git repository.
5. Check Hardware for `WSL 2 / Linux` and explicit unavailable/not-connected states. Do not expect Linux WSL to capture built-in Wi-Fi or Bluetooth devices.
6. Optional: Load synthetic demo data and check Signal History graph. Confirm demo is labeled and hidden by default on the map. Clear the demo before field use.
7. Shut down Ctrl+C and rerun; verify saved records survive. Active sessions should be marked INTERRUPTED, not silently resumed.

## Testing and privacy limits

- Backend uses Python standard library + SQLite only. GitHub Actions tests Python 3.11 and 3.14 and checks JavaScript syntax. It does **not** build an APK.
- The server binds only to 127.0.0.1 and validates request Host/Origin. It is not an authenticated multi-user server or a safe public internet service. Do not expose its port to untrusted networks.
- OpenFreeMap street vector tiles require internet. The built-in coordinate grid and any operator-installed licensed raster MBTiles package work without internet or third-party JavaScript. MapLibre JS/CSS may be cached separately. OpenRF does not itself download map areas. Data storage and API do not need network access.
- Continuous/background Wi-Fi capture, raw frame monitoring, BLE, SDR, cellular modem integration, hardware GPS, RF heatmaps, advanced localization, road navigation, and a Raspberry Pi kiosk installer are future work; no unverified detection or hardware capability is claimed.
- Current sessions store manually entered observations, not automatically collected scan cycles. Data is not migrated from the Android Room database automatically; the prior Android app and its local phone database are left untouched.
- The old Android workflow is retired on deployment, but the old source is preserved. To continue Android development later, use that archived source, not the Linux application bundle.

## Local developer tests

```bash
cd /mnt/c/projects/OpenRF
python3 -m unittest discover -s tests -v
python3 -m compileall -q openrf
node tests/test_frontend.js
```

Detailed architecture: `docs/ARCHITECTURE.md`. License selection is pending; do not publish the repository as reusable open-source code until an actual license is selected and all dependency terms have been reviewed.

## v0.2.1 layout/map fixes retained

- The old map was using the wrong kind of MapLibre 6 script. This release references a compatible classic MapLibre 5 distribution.
- If browser extensions, VPN, or network policies block MapLibre, the raster fallback appears automatically; use **Offline / raster**/**Try online vector** to switch manually. Raster mode uses only a coordinate grid or locally installed MBTiles tiles; it never contacts OSM public raster tile servers.
- Opening Survey Map automatically requests browser location once; the button can retry manually. Neither stores GPS coordinates. WSL cannot supply actual GPS fixes without appropriate hardware.
- All page headers now top-align; the scanner's records panel has 20px separation from the two panels above it.
- Open **Hardware → Detected host devices** to inspect USB descriptors and Linux-visible interfaces. These read-only entries do not prove that a radio device is supported or operational. `Refresh inventory` doesn't run a wireless scan.
- Stop/restart the OpenRF Python server after installing new source; press `Ctrl+C` in Ubuntu and rerun `python3 -m openrf`. Refresh your Windows browser with `Ctrl+F5` to discard previous scripts.

## v0.2.5 validation walkthrough

1. Resize Firefox to ~720 px wide. OpenRF should open Map by default and show a hamburger in the top-left corner. Open it to see all six destinations in a vertical drawer; tap outside it or press Escape to dismiss. Confirm the page has no sideways scrolling. Map layers open from **Layers & Scan**. Desktop still opens Overview.
2. In the sheet, toggle Wi-Fi/BLE/etc. Existing geotagged saved observations should appear/disappear on both vector and raster maps without being deleted. Other records and DEMO controls remain separate.
3. Tap **Scan Linux Wi-Fi once** in the map panel. WSL with only `eth0` must report unavailable; this is not a Wi-Fi discovery failure and must never create map pins. On supported native Linux, NetworkManager results appear temporarily, not geolocated.
4. Use the sheet’s **My location** control. It should preserve the permission behavior that worked in v0.2.2; no coordinates are stored. Check switching map styles and vector/raster mode.
5. Test the Analysis, Saved, Sessions, Hardware and Overview pages. Ensure existing database records, exports and user-started investigations are still available.

## Historical v0.2.2 validation walkthrough

1. Survey Map should request browser geolocation once upon first opening. If allowed, it recenters (zoom 15 with a reasonably accurate fix). A blue location marker is **not** an observation or an RF transmitter. On Windows/VPN a browser fix might be approximate. No coordinates are saved or transmitted to the OpenRF backend by this step.
2. Toggle Raster fallback / Try vector map; center and zoom should persist. Both modes support the geolocation marker and manual observations.
3. Scanner → Scan Wi-Fi once: on your current WSL machine with only `eth0`, expect “No Linux Wi-Fi interface is visible”; do not expect fabricated nearby networks. If a native Linux Wi-Fi adapter + NetworkManager is available, it returns a temporary access-point list. This is a manually invoked scan, possibly active probing, not continuous capture.
4. Hardware → Confirm Wi-Fi readiness message matches the Linux interface inventory.
5. Check observations, investigations and exports from v0.2.1 survive; no database migration. Use `python3 -m unittest discover -s tests -v` and `node tests/test_frontend.js`.

The one-shot driver was tested with mocked NetworkManager responses, **not physical RF hardware**, and the site behavior was checked with a fixture browser location, **not an actual Windows location fix**.

## v0.2.28 — robust full-street address lookup

- Route submission of a complete U.S. street address (e.g. `100 Main St, Jackson, CA`) can use the U.S. Census Bureau one-line geocoder after **explicit online lookup opt-in**. It returns a street-range approximation, not a verified entrance. Confirm the pin on the map before relying on it.
- Live typing suggestions still use Photon/MapTiler; public Photon is a demonstration endpoint and may reject or time out. Census is **not** a live autocomplete service, and city-only searches need Photon, saved places or the map picker.
- Choose destination on map is now directly beside destination entry and works without internet address lookup.
- On submit, inspect and select the returned address; do not silently route to a fuzzy or interpolated result.
- Real road routes still depend on local Valhalla. If it is not reachable, lines are labeled direct references and **never** imply turn-by-turn navigation.


## v0.2.30 — configure reliable U.S. address autocomplete

Public Photon is a **demo service**, not a guaranteed address autocomplete backend. For more dependable U.S. suggestions, OpenRF now accepts an optional **MapTiler Geocoding API key** from its map UI:

1. Create or use a MapTiler account/API key at https://cloud.maptiler.com/ (plan usage and key restrictions apply). A map tile URL or unrelated OpenMap/OpenFreeMap key is **not** a MapTiler geocoding API key.
2. On the Survey Map, expand **Address search setup** and paste the key into **MapTiler API key**. Click **Save key locally**. Do not post or commit the key. It is stored at `~/.config/openrf/geocoding.json` in Ubuntu with owner-only file permissions; it is outside the source ZIP, updater-managed paths, and Git. You can remove it using the UI.
3. Check **Online U.S. address search**, then open the panel and click **Test suggestions**. This tests a fixed sample city name; it sends no GPS. If the test reports HTTP 403, check the key, its permitted geocoding service and key restrictions. If DNS/TLS/proxy errors appear, check Ubuntu connectivity.
4. Type part of a U.S. address and **select the intended suggestion**. Press **Start navigation**. Unresolved address text is never silently routed to the first fuzzy result. If local Valhalla is ready and has road coverage, the result follows actual roads. If Valhalla is unavailable, only an explicitly labeled straight line appears.

The online opt-in is **off on each fresh page load**, including when a private provider is configured. Local Photon remains supported if separately installed. Without a key, public Photon may be throttled or unavailable; complete U.S. street addresses can still use the opt-in Census lookup when its service responds. Neither option guarantees street-by-street autocomplete. No address-search request automatically includes browser GPS, and no navigation request stores travel history. No geocoding service is bundled or required for manual survey features.

Local Valhalla health (separate from address search): `bash tools/setup-valhalla-wsl.sh --status`. You can always choose the destination directly on the map to test routing without geocoding. This release does **not** implement continuous driving navigation, GPS-following or audible turn instructions.

The Map destination picker also uses **tap once to select** with a crosshair cursor and a temporary yellow destination marker; it is not a draggable GPS pin. Press Escape or choose the picker again to cancel. No observation is recorded.


## v0.2.56 — optional national ALPR download + larger offline road ROUTING regions

The existing **Map → Layers** overlay has an optional **Download / update nationwide ALPRs** button. After a successful explicit download, community-mapped camera points are indexed and cached in a local private SQLite snapshot; the browser requests only the currently visible area. A local GeoJSON(.gz) import fallback is also available. Manual camera records are preserved across national refresh failures. No positions are verified solely because they appear in an OSM/community feed. No live data feed was downloaded or verified in this release.

**Optional offline Valhalla road routing**, not additional visible map tiles, now supports four profiles: existing Northern California, all California, western US (including Nevada), and the whole United States. The expanded graph source files and output are separate from managed project code, stored under `~/.local/share/openrf/valhalla/`; downloads require explicit commands, adequate storage/RAM and a working Docker daemon. Full-US routing is **not** a lightweight bundle: the raw extract is roughly 11.4 GB and the processing/output needs considerably more space. The release ZIP includes none of it.

Read [Offline Valhalla routing region setup](docs/VALHALLA_ROUTING_REGIONS.md) and start with `bash tools/setup-valhalla-wsl.sh --plan --region west` from Ubuntu. To install California instead, run `bash tools/setup-valhalla-wsl.sh --install --region california`. This **does not** configure online geocoding, prebuilt map visuals or camera avoidance. The existing v0.2.52 right-side map layout, offline Amador/Calaveras basemap and radio tools are unchanged.
