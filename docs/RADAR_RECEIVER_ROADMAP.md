# Long-range police radar and laser detection — required OpenRF roadmap

**Status: DESIGN ONLY as of v0.2.12. No X/K/Ka or LIDAR sensor, live detector, warning range, or detection accuracy is implemented or tested.** This is a required future feature for OpenRF, not a feature in the current release.

## Goal

A receive-only, practical, long-range alerting subsystem for traffic radar with **X (~10.525 GHz), K (~24.150 GHz), and Ka (~33.4–36 GHz)** receive coverage, plus separately supported optical **LIDAR (~905 nm)** detection. In a car, hardware sensitivity, antenna geometry, RF filtering, interference rejection, mount position, and weather/terrain are critical. Do not claim a fixed detection distance or reliable warning against instant-on radar or targeted laser.

## Hardware approach

1. Prefer evaluating a **proven commercial long-range radar receiver** with a documented, lawful, non-invasive data-output interface, if available. Such interfaces are not presumed to exist or be openly documented. If no suitable interface exists, review dedicated receive-only microwave front ends with band-specific filtering, LNA, mixer/downconverter, reference clock and antenna as a later experimental research track. Do not imply that the current ESP32-S3 Wi-Fi scanner, RTL-SDR, HackRF, Raspberry Pi radios or standard GNSS module can directly receive those microwave bands.
2. Treat laser detection as a distinct optical hardware module, not an X/K/Ka receiver function. Optical pickup generally gives limited advance warning, especially when directly targeted.
3. Keep the RF receive path separate from map, storage, alerts and USB transport, with driver capability negotiation. The sensor must report actual supported bands and hardware identity, not a generic RF label.
4. RF-only identification **does not prove law enforcement, exact location, vehicle speed, or direction**. Some industrial devices and vehicle systems use overlapping bands. Strength is not calibrated distance.

## Data and quality contract

Future events should include source device and driver version, UTC observation timestamp, time/fix-age and accuracy when GPS is attached, explicit received band, *measured* frequency (if supported), calibrated and documented signal strength units (if provided), error and stale statuses, false-positive/filtering flags, and **receiver location** semantics. Devices must expose live measurement vs historical replay vs test fixture. Alert priority and sound must use opt-in, field-readable, low-distraction controls. GPS-based false-alert suppression requires safeguards so an active radar source is not silently suppressed by an old lockout.

## Verification gates before marking feature supported

- Inspect the device's real specifications and lawful data access; confirm supported frequency bands, power and USB interface.
- Bench test a lawful receive-only setup on known authorized sources or validated recordings. Test sensitivity, specificity and false alerts independently; no claimed detection distances without an appropriate reproducible field protocol.
- Evaluate stopped/hotplugged sensor states, timestamp drift, unavailable GNSS, wet/obstructed/urban conditions and safe alert presentation. Never label a DEMO/HISTORICAL example as live.
- Check applicable transport/vehicle/device laws before installation or use. **No jamming, spoofing, interference, target tracking or access bypass.**

## Background references

- FCC public notice, radar detector receivers: https://docs.fcc.gov/public/attachments/DA-96-2040A1.pdf
- Escort radar/laser band guide: https://support.escortradar.com/support/solutions/articles/47001288070-radar-laser-enforcement
- Cobra radar bands and known unrelated emitters: https://support.cobra.com/support/solutions/articles/47001193942-what-are-radar-bands-

This is an architecture plan, **not an assertion that any hardware has been purchased or tested**.
