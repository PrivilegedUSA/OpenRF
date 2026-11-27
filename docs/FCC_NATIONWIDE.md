# Nationwide FCC H3 compiler (v0.2.238)

This developer-side CLI prepares standalone compact state databases. It does not change the renderer or download anything on application startup. All 50 states and Washington, DC are selectable; territories, aggregate statewide coverage, raw propagation polygons and 3G are not included in this first batch workflow. The default carrier IDs are AT&T 130077, T-Mobile 130403 and Verizon 131425. `--all-providers` selects every recognized provider-specific H3 entry from the supplied catalog; existing UI grouping of other providers is unchanged. The FCC catalog is the source of available files, not evidence that every provider or technology has coverage in every state.

## FCC API prerequisites

- Create or sign in to a free FCC user account: https://broadbandmap.fcc.gov/login
- Generate an API token in the account/profile area and review the terms. See https://help.bdc.fcc.gov/hc/en-us/articles/20044640394395-How-to-Create-an-FCC-User-Account and the public data API specifications/Swagger linked from https://help.bdc.fcc.gov/hc/en-us/articles/6789299021723-Key-Reference-Documents.
- Credentials are accepted only via environment variables. Do not paste them into a chat, command-line argument, repository, plan, manifest or log. In Bash use `read -r -p 'FCC username: ' FCC_USERNAME; read -r -s -p 'FCC API token: ' FCC_HASH_VALUE; echo; export FCC_USERNAME FCC_HASH_VALUE`. When finished, `unset FCC_USERNAME FCC_HASH_VALUE`.
- The adapter uses `https://broadbandmap.fcc.gov/api/public/map/downloads/listAvailabilityData/{as_of_date}` and `/downloads/downloadFile/availability/{file_id}/1`, with `username` and `hash_value` headers. It accepts explicitly H3 provider filenames matching the compiler's known naming convention, requests shapefile and checks the ZIP member identity, CRC and schema. It refuses redirects rather than forwarding credentials. The official reference links are available, but the full Swagger and authenticated service could not be exercised during release testing. A live one-state catalog/download pilot is essential. If the API lists raw/non-H3 names or uses a different response schema, stop and inspect the catalog before expanding; do not guess a format selector.
- Existing compiler dependencies for shapefile: `sudo apt install -y python3-pyshp python3-pyproj`. For local GeoPackage inputs also install `python3-shapely`.

## Nevada pilot (WSL with E: mounted)

Run the plan first; it only lists metadata and saves a local plan. The June 30, 2026 filing matches the previous California project; it is not the November archive revision date.

```bash
cd /mnt/c/projects/OpenRF && mountpoint -q /mnt/e && /usr/bin/python3 -m openrf.coverage_nationwide plan --workspace /mnt/e/OpenRF-data/fcc-nationwide-pilot --as-of 2026-06-30 --state 32
```

Review the number of files and provider IDs. If the catalog has no entries or a provider is absent, this is not proof of absent service. If satisfied, stop OpenRF before building and run:

```bash
cd /mnt/c/projects/OpenRF && mountpoint -q /mnt/e && SQLITE_TMPDIR=/mnt/e/OpenRF-data /usr/bin/python3 -m openrf.coverage_nationwide run --workspace /mnt/e/OpenRF-data/fcc-nationwide-pilot --folder /mnt/e/OpenRF-data/fcc-coverage --activate
```

The output folder is the external coverage directory previously linked to OpenRF's default path. If using another computer, explicitly choose its own configured coverage folder. `--activate` is optional; omitting it builds packs without enabling the map. Never disconnect the drive while compiling. Existing packs (including California) are not overwritten or silently adopted into the distribution draft. If you need to update a state, use a separate output folder and validate before replacing; the replacement workflow is not implemented.

## Local mode and nationwide run

`plan --input-dir /mnt/e/OpenRF-data/fcc-source` uses local provider-specific ZIPs in that directory (not recursive), and does not contact the FCC. `plan --catalog PATH` uses a saved API response instead of a live catalog; the actual download still requires credentials. Duplicate ambiguous source archives are rejected. Per-state archives must have a consistent filing and revision. Both local GIS formats are supported through the direct compiler. Missing files not listed in a local plan cannot be detected as missing from the authoritative catalog; local mode is not a national completeness guarantee.

Use another workspace, omit `--state` to plan all 51 jurisdictions, and use `--limit-states 1` on `run` if you want to start only one new state per invocation. A separate workspace is required for a different plan; don't edit the plan while a job is running. `--provider 130077` may be repeated to select only certain providers, or use `--all-providers` for the broader catalog. By default only the three major networks are included. A state with no matching sources is reported separately. A state with a pre-existing pack is preserved even if it is from another filing, not labeled as a new build. Different state revisions can appear as different profile vintages in the existing map UI.

The same `run` command can be rerun after an interruption. Completed downloads are checksum-verified and reused; interrupted downloads resume only if a strong ETag and valid HTTP range response are available, otherwise they restart that file. HTTP 429 and temporary 5xx errors have bounded retries. Failed source validation stops the batch. The same state may need to restart its direct compilation from the beginning, because SQLite build checkpoints are not yet durable within a state. `status --workspace PATH` reads the local journal. Avoid launching simultaneous jobs against the same workspace or output directory. Large state builds require temporary space and can take hours; actual timings and total nationwide size are still unknown. The old database optimizer is not required for newly built states.

## Draft distribution manifests

Each workspace contains `plan.json`, `progress.json`, `archives/`, and `distribution-manifest.json`. The manifest lists successfully built state packs, installed byte sizes, SHA-256, filing/vintage, profiles and source archive metadata, and separates skipped/missing/failed/pending states. It is an internal draft, not a downloadable catalog. It does not contain credentials. The user must verify redistribution permissions/terms, then prepare compressed transport objects and a hosted manifest before public distribution. No R2 upload, public one-click downloader or nationwide data is bundled with this release.

The data represents provider-modeled FCC coverage, not guaranteed reception. All original data, cameras, mesh and coverage map styling remain unchanged. Regression tests exercise synthetic FCC inputs, mocked HTTP/Range responses, and state-boundary resume; no live FCC token or nationwide test was available.
