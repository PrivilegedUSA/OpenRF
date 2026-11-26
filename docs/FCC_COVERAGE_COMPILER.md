# FCC H3 offline coverage compiler — v0.2.232

Local-only first implementation. Download **By Provider** state ZIPs for 4G LTE, 5G NR 7/1, 5G NR 35/3 and Mobile Voice, H3 shapefile, matching filing and release. California Verizon filenames begin `bdc_06_131425_`. AT&T 130077, T-Mobile 130403 and Verizon 131425 follow the FCC provider/holding-company ID table. Unknown IDs are shown as Other carriers, never guessed. Statewide archives without provider fields are supported as a separate Any provider (aggregate) layer; they cannot identify individual carriers. Keep original ZIP files in Downloads. Fixed broadband and summary ZIPs are ignored. No FCC account, network or upload is used by the compiler itself.

In Ubuntu WSL, install the optional compiler dependencies (PyShp MIT and pyproj MIT; PROJ MIT). They are not needed by the map runtime. Use Ubuntu's Python for the installed packages:

```bash
sudo apt update && sudo apt install -y python3-pyshp python3-pyproj
cd /mnt/c/projects/OpenRF
/usr/bin/python3 -m openrf.fcc_coverage scan --state 06 --provider 131425
/usr/bin/python3 -m openrf.fcc_coverage build --state 06 --provider 131425
```

If multiple Windows Downloads directories contain matching files, specify `--input-dir '/mnt/c/Users/YOUR_USER/Downloads'`. `scan` checks filenames, archive directory, DBF field names, source row counts and required component sizes, not every byte. `build` streams extraction of the relevant components with CRC checking, inspects CRS, fields and records, and shows measured row counts/percentages. A single technology is sufficient; each state/provider pack uses one release/filing. The latest release per state/provider is selected (choose `--release YYYY-MM-DD` to override). Omit `--provider` to select all discovered providers; statewide archives are selected only for states without provider archives, or explicitly using `--aggregate`. Omit `--state` to process all matching states. A rebuild of an existing pack refuses to remove previously installed source types. Invalid archives in the selected group stop its build. Use an explicit `--db PATH` for a custom OpenRF main database. Do not run concurrent compiler processes on the same pack. Stop OpenRF while compiling if convenient; it only reads published packs.

The output is `~/.local/share/openrf/fcc-coverage/fcc-06-131425.sqlite3` (or the equivalent directory beside your custom main DB). No source, observation, tower, camera or mesh data are removed. The compiler writes a temporary state pack and atomically replaces the previous pack only after all selected sources finish and SQLite validation passes. Each geometry is canonicalized at seven decimal degrees and stored once per H3 ID and geometry, with compressed polygon rings, spatial R-tree, and separate carrier/provider/technology/environment membership. Source filenames, filing/release, row counts, original provider IDs and names are retained. Unknown carrier names are grouped as Other carriers for rendering; no guessing. 5G 7/1 and 35/3 are distinct, as are FCC environments 0 (outdoor stationary only) and 1 (both outdoor stationary and in-vehicle). Voice is separate. Outdoor stationary (all) is the union of codes 0 and 1, not an additional source claim; the UI defaults to the LTE union when available. Exact source geometries, not artificial tower circles; no inferred indoor coverage. State-level coverage may take substantial disk space and time, and the output size is not yet benchmarked on full California files. Keep several GB free (more may be required); compiler reports insufficient extraction space and stops on storage errors. Unsplit dateline polygons are rejected rather than drawn across the world; Alaska compatibility needs verification. Wide viewports show the derived coverage overview described below; zoom in to neighborhood level to inspect original polygons. A blank map is not a no-service claim.

After building, start OpenRF and select Map → Layers → Cellular infrastructure & coverage → Reload saved cellular data. Enable a carrier and select its coverage profile. Existing manually imported coverage packs remain independent. Data stays offline and outside source control. The CLI prints the state pack size and SHA-256. Full nationwide redistribution/hosting and one-click download are not implemented; verify redistribution permissions and benchmark real packs before publishing. No FCC dataset is shipped in source.

Official references: https://help.bdc.fcc.gov/hc/en-us/articles/43909220634651-How-to-Download-Mobile-Broadband-Coverage-Data-from-the-FCC-s-National-Broadband-Map-Step-by-Step-Instructions ; https://help.bdc.fcc.gov/hc/en-us/articles/6047425308187-Formatting-Mobile-Broadband-Availability-Coverage-Maps ; https://help.bdc.fcc.gov/hc/en-us/articles/6047464151195-Formatting-Mobile-Voice-Availability-Coverage-Maps . The supplied statewide upload was truncated; the actual provider archives have not been inspected and their production schemas must be verified locally. Unexpected fields, profile codes or geometry fail clearly rather than labeling data incorrectly.

## Wide-area display (v0.2.232)

Existing compiled packs remain compatible. The first wide view creates a disposable `.overview-v1` cache inside the local `fcc-coverage` directory, keyed to each source pack and coverage profile. Grid cells aggregate reported H3 polygon bounding-box centers, with three report-density shading levels; a colored square does not assert service across its whole area. The grid adapts to the viewport and feature budget. Local views use original polygons when within budget. No extra data download or compiler rebuild is required; first wide-view preparation may take longer. Blank areas are not proof of absent service. Replacing a source pack invalidates its derived cache.

## External storage (WSL)

Stop OpenRF and all compiler jobs before moving data. An NTFS external drive can hold the FCC source ZIPs and compiled coverage packs. Confirm it is mounted (`mountpoint /mnt/e` for E:) and has enough actual free space (`df -h /mnt/e`). Copy the published `fcc-*.sqlite3` files to a new external directory, compare each with `cmp`, then rename the original `fcc-coverage` directory to a backup and create a symbolic link in its place pointing to the external directory. Keep the backup until OpenRF has loaded the external packs successfully. The disposable overview cache can be regenerated. The compiler writes temporary build files beside the packs, so they also use the external disk. Pass `--input-dir /mnt/e/OpenRF-data/fcc-source` if original ZIPs have been relocated there. Always check the drive is mounted before launching or compiling; never disconnect it while the app or compiler is using it. External NTFS performance and SQLite behavior on the user's WSL installation need local verification. Do not run concurrent writers. Other OpenRF data stays in its existing location.

## Compact shared state coverage and GeoPackage input (v0.2.232)

Stop OpenRF and other compiler jobs first. Verify E: is mounted and contains the existing `fcc-06-*.sqlite3` originals. Run in the project directory:

```bash
mountpoint -q /mnt/e && SQLITE_TMPDIR=/mnt/e/OpenRF-data/fcc-coverage /usr/bin/python3 -m openrf.coverage_compact build --state 06 --folder /mnt/e/OpenRF-data/fcc-coverage
```

The optimizer streams each original pack, encodes H3 keys as integers, and encodes coordinates with signed delta varints at the existing seven-decimal precision. Every polygon is decoded and compared during conversion. Identical H3/geometry pairs are shared across carriers; different geometries for the same H3 ID remain distinct, including holes or clipped boundaries. Profile memberships are checked against the original counts. All sources must have matching state, filing and vintage. The original v1 packs are opened read-only. The shared SQLite pack is written atomically in `compact-v2/`; it reports original and new byte totals, percent reduction, elapsed time and SHA-256. Temporary files and VACUUM can require multiple additional GB of free space. Never remove original packs: this experimental format requires them for rollback and freshness checks.

After successful conversion, optionally activate it:

```bash
/usr/bin/python3 -m openrf.coverage_compact activate --state 06
```

Restart OpenRF, compare local and statewide views of all carriers. To return to originals, stop OpenRF and run `python3 -m openrf.coverage_compact deactivate --state 06`. Changes to the original pack set, original file stamps or compact pack stamp automatically disable the compact pack. Statewide overview caches are recreated on first use. The optimized pack is not a standalone distributable yet; no source deletion is supported. This does not reconstruct ideal H3 hexagons or change existing coordinates.

For the renamed FCC GeoPackage files, optional compiler dependencies: `sudo apt install python3-shapely python3-pyproj`. Scan first:

```bash
/usr/bin/python3 -m openrf.fcc_coverage scan --state 06 --provider 130077 --format geopackage --input-dir /mnt/e/OpenRF-data/fcc-source
```

The scanner extracts the GeoPackage to a temporary directory beside the archive to verify the schema and row count. Only one polygon feature table, standard GeoPackage geometry and supported CRS/fields are accepted. Both archive and member names are recorded during builds; the archive date remains the existing profile vintage, and differing internal dates are retained as source provenance, not silently reconciled. Use `--format shapefile` for ESRI input; default `auto` prefers a shapefile if both formats are present. Ambiguous duplicates are rejected. For an isolated GeoPackage build, add `--db /mnt/e/OpenRF-data/geopackage-test/catalog.sqlite3` to the `build` command, which stores the output in that directory's `fcc-coverage/` rather than overwriting working packs. No raw coverage input. Real FCC files and Pi hardware remain untested.
