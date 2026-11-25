# Public cellular reference layers (v0.2.228)

OpenRF separates publicly listed tower/license locations, estimated logical cells, modeled coverage, and local RF observations. None proves a tower is active or that a handset will receive service. No position or scan data is sent to a provider. No account is needed for the tower layer; external dataset access may have its own terms.

## Public towers — automatic nationwide snapshot

In Map → Layers → Cellular infrastructure & coverage, choose **Download / update US towers**. This uses the FCC Universal Licensing System-derived HIFLD cellular tower feature service (`https://services.arcgis.com/0ZRg6WRC7mxSLyKX/ArcGIS/rest/services/Cellular_Towers/FeatureServer/0`). This is a public replicated dataset, not a complete list of all operational mobile network sites. Metadata lists a last edit in August 2025; current licensing status is not guaranteed. The publisher warns of coordinate/licensing errors. Licensee is not necessarily the consumer carrier. Requests use form POST to avoid URL length limits, with short GET compatibility fallback and smaller 50-ID batches if a gateway rejects a large request. Source record count progress is measured from the returned ID list (not bytes), and the previous complete snapshot is retained if any page fails. No silent partial refresh. The local database remains outside Git and source bundles. No live connectivity validation in development.

## Estimated sites — OpenCellID country downloads (manual import)

1. Visit https://opencellid.org/downloads and obtain an API token from that provider. Download a US MCC CSV/CSV.GZ export. The token is not entered into OpenRF. See https://docs.opencellid.org/docs/downloads/overview and https://docs.opencellid.org/docs/downloads/database-format.
2. In Ubuntu WSL, navigate to `/mnt/c/projects/OpenRF` and run (adjust file name to match your download):

```bash
python3 -m openrf.cellular_catalog estimates /mnt/c/Users/YOUR_WINDOWS_USER/Downloads/310.csv.gz
```

This replaces the estimated-cell snapshot with valid US MCC 310–316 records from that file, not the public tower snapshot. To combine multiple country exports, concatenate their **decompressed** CSV data into a single file with one header before importing (or use a single combined US export). CSV and gzip CSV are supported. The identifier is a logical radio cell, not a physical tower; multiple cells can belong to one site. `range` is a provider estimate, not a measured coverage polygon or position accuracy. No range circles are drawn. OpenCellID data is CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); attribution: Cell data from OpenCellID (https://opencellid.org); filtered to US records and normalized by OpenRF. No data is redistributed in the source bundle.

## Carrier coverage — FCC Broadband Data Collection (manual regional pack import)

The FCC publishes provider-submitted, modeled mobile broadband coverage as shapefile or GeoPackage: https://help.bdc.fcc.gov/hc/en-us/articles/43909220634651-How-to-Download-Mobile-Broadband-Coverage-Data-from-the-FCC-s-National-Broadband-Map-Step-by-Step-Instructions . Select the state, provider, filing date, technology/speed tier and modeled environment. Prefer raw coverage polygons, not hex cells, for geographic fidelity. Obtain the chosen file from https://broadbandmap.fcc.gov/data-download .

Extract the ZIP to a local folder; do not upload to a web conversion service. If you have GDAL (`sudo apt install gdal-bin` in Ubuntu), inspect the layer names and fields with `ogrinfo -al -so INPUT.gpkg`. Export the chosen single profile/layer in EPSG:4326 GeoJSON (select/filter to the actual carrier, speed and environment before export; consult FCC metadata for actual field names):

```bash
ogr2ogr -f GeoJSON -t_srs EPSG:4326 -lco RFC7946=YES coverage.geojson INPUT.gpkg LAYER_NAME
```

Then import locally (example metadata only, change to the actual source file's values):

```bash
python3 -m openrf.cellular_catalog coverage coverage.geojson --carrier verizon --pack california --date 2025-12-31 --technology '4G LTE 5/1 Mbps' --environment 'outdoor stationary'
```

Carriers: `att`, `tmobile`, `verizon`, `other`. Use separate pack names for different regions and profiles. Importing the same carrier/pack replaces that pack atomically; use a different name for different regions. Select the desired saved coverage profile in the map layers panel. The labels are supplied by the operator; OpenRF cannot verify the source file's declared provenance. Do not combine different speed tiers/environments/dates in one pack. For large datasets split into regional files; per-file limits are 128 MiB, 100,000 features and 2 million vertices. Geometry must be WGS84 polygons/multipolygons, closed rings, split at antimeridian. Holes are preserved. Coverage rendering intentionally hides an oversized layer and prompts to zoom rather than silently sampling polygons. A missing overlay is **not** a no-service claim. Coverage has no automatic online download in this version; the FCC portal is the supported acquisition path. You can view imported coverage with no network connection, subject to installed basemap availability.

After importing either dataset, choose **Reload saved cellular data** in OpenRF, then enable the desired layer(s). If OpenRF was started with a custom `--db`, supply the identical `--db` option BEFORE `estimates` or `coverage` in the import command. The cache lives beside that main database in `cellular-reference.sqlite3`. To remove all cellular reference data, stop OpenRF and back up/remove that file and its SQLite WAL/SHM sidecars only (never the main database). Do not do this while a download/import is running. Other datasets are unaffected.

## Limits

No automatic carrier attribution for physical towers, no signal-strength heatmaps, no inferred reception, no estimated-tower triangulation, no automatic FCC coverage download. A 2,500-point viewport limit per point category and 150,000-vertex limit per coverage carrier bound rendering cost. At large scales zoom in to inspect the complete layer. All local file imports and tower downloads are explicit. A tower download job survives browser reload but not backend restart; SQLite rollback protects previous snapshots. See actual provider terms and dataset metadata.

## In-app import (v0.2.228)
Download a regional raw mobile coverage file from the FCC portal (By Provider). Convert only the selected single profile to RFC 7946 GeoJSON using the steps above. In Map layers → Cellular infrastructure & coverage → Import carrier coverage for offline use, enter carrier, pack name, as-of date, technology/speed and environment, select the file, and confirm. The local HTTP transfer never sends data to a third-party service. Existing packs remain on failed validation. No FCC API credentials are collected, and automatic coverage downloads are not implemented. Coverage switches indicate missing packs; a blank area is not a no-service finding. The former general Cellular toggle now lives here as Cellular observations and retains its previous setting.

## FCC H3 compiler (v0.2.228)

For original state H3 shapefile ZIPs use the direct local compiler described in [FCC_COVERAGE_COMPILER.md](FCC_COVERAGE_COMPILER.md). No manual GeoJSON conversion is required for those files.
