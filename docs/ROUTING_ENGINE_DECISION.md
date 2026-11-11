# OpenRF routing-engine decision notes — v0.2.24

## Rural Route comparison

Earlier Rural Route work used MapLibre for map display and a Laravel/PHP backend. Routing prototypes/integrations included HERE leg estimates, Google Directions for printable ordered-stop maneuvers and later TomTom routing/traffic/incident API plans. Saved route shapes and maneuver lists were intended to support offline driver guidance. These were different stages, not proof of a single implemented fully offline engine.

The Python/WSL/Raspberry Pi backend can consume the same general route output over HTTP/JSON; Laravel-specific code cannot be copied directly into a Python service. Never import old private keys or proprietary routing data from that project.

## Recommended offline-first integration (NOT implemented)

Use a modular adapter to a **locally hosted Valhalla service**, not a global public/demo instance. Valhalla is an MIT-licensed routing engine for OSM-derived road data, supports Linux, auto routing and narrated maneuvers, and uses preprocessed regional road tiles. Plan to keep the routing backend on loopback, validate all coordinates, and require explicit user-started route calculations. Road data requires appropriate attribution, licensing and offline data preparation; Raspberry Pi performance/memory and actual turn quality need physical validation. Keep a separate geocoder interface for offline address-to-coordinate lookup. Don't claim arbitrary addresses work until that component is implemented.

Suggested interface to support later:

- Origin and ordered destinations (latitude/longitude + accuracy/provenance metadata)
- Provider name, map data timestamp and offline graph availability
- Route geometry in GeoJSON, per-leg maneuvers with distance/time units, alternative route status
- Route validity/error states including graph absent, no road connection, unsupported vehicle profile, old GPS, or unknown destination
- Optional explicitly configured surveillance overlays, verified-vs-reported camera metadata, timestamps and uncertainty; never label unverified camera coverage complete

TomTom remains an optional future online provider only with independent explicit user consent and terms review. Do not automatically send personal location/route requests to TomTom, Google or public routing demo services.

## v0.2.24 limits

Only coordinates and private saved destinations are available in the simple map search, with geographic direct-line preview. This is **not** road navigation, traffic, turn-by-turn, incident avoidance or radar/cop identification. Multi-stop UI and voice prompts remain future scope.

Sources: https://github.com/valhalla/valhalla ; https://valhalla.github.io/valhalla/api/route/api-reference/ ; https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route
