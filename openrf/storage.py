"""Local SQLite storage; coordinates are observer/survey positions, never inferred transmitters."""
from __future__ import annotations

import csv
import io
import json
import math
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

KINDS = {"MANUAL", "WIFI", "BLE", "RF", "CELLULAR", "INFRASTRUCTURE"}
SOURCES = {"MANUAL", "DEMO", "IMPORTED", "SENSOR"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _optional_float(value, label: str, minimum: float, maximum: float):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError(f"{label} must be numeric")
    try:
        number = float(value)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"{label} must be numeric") from exc
    if not math.isfinite(number) or not minimum <= number <= maximum:
        raise ValueError(f"{label} outside allowed range")
    return number


def _string(value, label: str, maximum: int, required=False):
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValueError(f"{label} must be text")
    value = value.strip()
    if len(value) > maximum or (required and not value):
        raise ValueError(f"{label} must be 1–{maximum} characters" if required else f"{label} too long")
    return value


def normalize_observation(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Observation must be an object")
    kind = _string(data.get("kind", "MANUAL"), "kind", 24, True).upper()
    if kind not in KINDS:
        raise ValueError("Unsupported observation category")
    source = _string(data.get("source", "MANUAL"), "source", 24, True).upper()
    if source not in SOURCES:
        raise ValueError("Unsupported observation source")
    lat = _optional_float(data.get("latitude"), "latitude", -90, 90)
    lon = _optional_float(data.get("longitude"), "longitude", -180, 180)
    if (lat is None) != (lon is None):
        raise ValueError("Latitude and longitude must be provided together")
    acc = _optional_float(data.get("accuracy_m"), "accuracy_m", 0, 1_000_000)
    if acc is not None and lat is None:
        raise ValueError("Coordinate accuracy requires coordinates")
    session_id = data.get("session_id")
    if session_id is not None:
        if isinstance(session_id, bool) or not isinstance(session_id, int) or session_id < 1:
            raise ValueError("Invalid session ID")
    return {
        "kind": kind,
        "source": source,
        "label": _string(data.get("label"), "label", 120, True),
        "identifier": _string(data.get("identifier"), "identifier", 200),
        "notes": _string(data.get("notes"), "notes", 3000),
        "frequency_mhz": _optional_float(data.get("frequency_mhz"), "frequency_mhz", 0, 100_000),
        "rssi_dbm": _optional_float(data.get("rssi_dbm"), "rssi_dbm", -200, 50),
        "latitude": lat,
        "longitude": lon,
        "accuracy_m": acc,
        "session_id": session_id,
        "source_device": _string(data.get("source_device", "Manual entry"), "source_device", 120),
    }


class Repository:
    def __init__(self, path: str | Path):
        self.path = Path(path).expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._initialize()

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(str(self.path), timeout=10)
        try:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA busy_timeout=10000")
            with conn:
                yield conn
        finally:
            conn.close()

    def _initialize(self):
        with self._connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    ended_at TEXT,
                    status TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE','COMPLETED','INTERRUPTED'))
                );
                CREATE TABLE IF NOT EXISTS observations (
                    id INTEGER PRIMARY KEY,
                    kind TEXT NOT NULL,
                    source TEXT NOT NULL,
                    label TEXT NOT NULL,
                    identifier TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    source_device TEXT NOT NULL DEFAULT '',
                    frequency_mhz REAL,
                    rssi_dbm REAL,
                    latitude REAL,
                    longitude REAL,
                    accuracy_m REAL,
                    observed_at TEXT NOT NULL,
                    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL
                );
                CREATE TABLE IF NOT EXISTS survey_captures (
                    id INTEGER PRIMARY KEY,
                    sensor_id TEXT NOT NULL,
                    interface TEXT NOT NULL,
                    retrieved_at_utc TEXT NOT NULL,
                    saved_at_utc TEXT NOT NULL,
                    freshness TEXT NOT NULL,
                    result_count INTEGER NOT NULL,
                    saved_count INTEGER NOT NULL,
                    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
                    location_source TEXT NOT NULL DEFAULT 'NONE',
                    latitude REAL, longitude REAL, accuracy_m REAL,
                    fix_age_seconds REAL
                );
                CREATE INDEX IF NOT EXISTS idx_captures_time ON survey_captures(id DESC);
                CREATE INDEX IF NOT EXISTS idx_observations_time ON observations(observed_at);
                CREATE INDEX IF NOT EXISTS idx_observations_identifier ON observations(identifier);
            """)
            # Additive migration from v0.2.5; never drop or rebuild saved observations.
            columns = {row['name'] for row in db.execute('PRAGMA table_info(observations)')}
            for name, ddl in (
                ('signal_quality_percent', 'REAL'),
                ('survey_capture_id', 'INTEGER REFERENCES survey_captures(id) ON DELETE SET NULL'),
                ('location_source', "TEXT NOT NULL DEFAULT 'UNSPECIFIED'"),
                ('fix_age_seconds', 'REAL'),
            ):
                if name not in columns:
                    db.execute(f'ALTER TABLE observations ADD COLUMN {name} {ddl}')
            db.execute('CREATE INDEX IF NOT EXISTS idx_observations_capture ON observations(survey_capture_id)')
            # v0.2.7: retain device clock/protocol provenance without altering older rows.
            for table, additions in (
                ('observations', [('timestamp_basis', 'TEXT'), ('device_reported_at_utc', 'TEXT'), ('hardware_id', 'TEXT')]),
                ('survey_captures', [('timestamp_basis', 'TEXT'), ('device_reported_at_utc', 'TEXT'), ('hardware_id', 'TEXT')]),
            ):
                found = {row['name'] for row in db.execute(f'PRAGMA table_info({table})')}
                for name, ddl in additions:
                    if name not in found:
                        db.execute(f'ALTER TABLE {table} ADD COLUMN {name} {ddl}')
            # A crashed server does not silently continue a previously active survey.
            db.execute("UPDATE sessions SET status='INTERRUPTED' WHERE status='ACTIVE'")

    def list_observations(self) -> list[dict]:
        with self._lock, self._connect() as db:
            return [dict(r) for r in db.execute("SELECT * FROM observations ORDER BY id DESC LIMIT 10000")]

    def get_observation(self, record_id: int):
        with self._lock, self._connect() as db:
            row = db.execute("SELECT * FROM observations WHERE id=?", (record_id,)).fetchone()
            return dict(row) if row else None

    def add_observation(self, data: dict, *, observed_at_utc: str | None = None) -> dict:
        item = normalize_observation(data)
        # Only trusted adapter code passes observed_at_utc; the public manual
        # observations route never accepts a user-supplied timestamp.
        if observed_at_utc is not None:
            parsed = datetime.fromisoformat(observed_at_utc.replace('Z', '+00:00'))
            if parsed.tzinfo is None:
                raise ValueError('Sensor retrieval timestamp needs UTC timezone')
        with self._lock, self._connect() as db:
            if item["session_id"] is not None:
                row = db.execute("SELECT status FROM sessions WHERE id=?", (item["session_id"],)).fetchone()
                if not row or row["status"] != "ACTIVE":
                    raise ValueError("Session is missing or no longer active")
            columns = list(item) + ["observed_at"]
            values = [*item.values(), observed_at_utc if observed_at_utc is not None else now_iso()]
            cols = ", ".join(columns)
            placeholders = ", ".join("?" for _ in columns)
            record_id = db.execute(
                f"INSERT INTO observations ({cols}) VALUES ({placeholders})", values
            ).lastrowid
        return self.get_observation(record_id)

    def delete_observation(self, record_id: int) -> bool:
        with self._lock, self._connect() as db:
            return db.execute("DELETE FROM observations WHERE id=?", (record_id,)).rowcount > 0

    def captures(self) -> list[dict]:
        """Real, explicitly saved survey snapshots (including zero-result scans)."""
        with self._lock, self._connect() as db:
            return [dict(row) for row in db.execute(
                'SELECT * FROM survey_captures ORDER BY id DESC LIMIT 500')]

    def store_wifi_capture(self, scan: dict, validated_records: list[tuple[dict, str]],
                           session_id: int | None, survey_details: dict) -> dict:
        """Atomically record a server-verified scan retrieval. No ambient/auto capture.

        Caller owns a short-lived, server-issued receipt. A zero-result capture is
        still a real retrieval event, not a fabricated signal observation.
        """
        if scan.get('source') != 'NETWORKMANAGER_WIFI' or not isinstance(scan.get('records'), list):
            raise ValueError('Expected a verified NetworkManager Wi-Fi scan')
        if len(scan['records']) > 256 or len(validated_records) > 256:
            raise ValueError('Too many Wi-Fi records in capture')
        timestamp = scan.get('retrieved_at_utc')
        try:
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            if dt.tzinfo is None:
                raise ValueError()
            timestamp = dt.astimezone(timezone.utc).isoformat(timespec='seconds')
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValueError('Capture needs a UTC scan retrieval time') from exc
        if session_id is not None and (type(session_id) is not int or session_id < 1):
            raise ValueError('Invalid session ID')
        if not isinstance(survey_details, dict):
            raise ValueError('Survey details missing')
        normalized = []
        for record, read_time in validated_records:
            entry = normalize_observation(record)
            if entry['kind'] != 'WIFI' or entry['source'] != 'SENSOR' or entry['rssi_dbm'] is not None:
                raise ValueError('Unexpected sensor measurements in Wi-Fi snapshot')
            if read_time != timestamp:
                raise ValueError('Inconsistent scan timestamp')
            quality = record.get('signal_quality_percent')
            if type(quality) is not int or not 0 <= quality <= 100:
                raise ValueError('NetworkManager quality must be a percentage')
            normalized.append((entry, quality))
        lat, lon, accuracy = (survey_details.get('latitude'), survey_details.get('longitude'), survey_details.get('accuracy_m'))
        origin = survey_details.get('location_source', 'NONE')
        age = survey_details.get('fix_age_seconds')
        if origin not in {'NONE', 'BROWSER_REPORTED'} or (origin == 'NONE') != (lat is None):
            raise ValueError('Invalid survey coordinate provenance')
        if origin == 'BROWSER_REPORTED':
            _optional_float(lat, 'latitude', -90, 90)
            _optional_float(lon, 'longitude', -180, 180)
            _optional_float(accuracy, 'accuracy_m', 0, 1000000)
            if type(age) not in (int, float) or not math.isfinite(age) or not 0 <= age <= 60:
                raise ValueError('Browser location is too old for a survey')
        with self._lock, self._connect() as db:
            if session_id is not None:
                session = db.execute('SELECT status FROM sessions WHERE id=?', (session_id,)).fetchone()
                if not session or session['status'] != 'ACTIVE':
                    raise ValueError('Session is missing or no longer active')
            capture_id = db.execute("""
                INSERT INTO survey_captures(sensor_id,interface,retrieved_at_utc,saved_at_utc,freshness,
                result_count,saved_count,session_id,location_source,latitude,longitude,accuracy_m,fix_age_seconds)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                ('networkmanager-wifi', str(scan.get('interface') or 'unknown')[:32], timestamp,
                 now_iso(), str(scan.get('freshness') or 'UNVERIFIED')[:160],
                 len(scan['records']), len(normalized), session_id, origin, lat, lon, accuracy, age)
            ).lastrowid
            for item, quality in normalized:
                item['session_id'] = session_id
                item['survey_capture_id'] = capture_id
                item['signal_quality_percent'] = quality
                item['location_source'] = origin
                item['fix_age_seconds'] = age
                cols = list(item) + ['observed_at']
                db.execute(f"INSERT INTO observations ({', '.join(cols)}) VALUES ({', '.join(['?']*len(cols))})",
                           [*item.values(), timestamp])
        return next(c for c in self.captures() if c['id'] == capture_id)

    def store_serial_capture(self, capture: dict, session_id: int | None, survey_details: dict) -> dict:
        """Atomically persist one explicitly requested compatible serial module snapshot.

        The caller must obtain capture from the USB serial transport. This method
        validates ALL readings before writing, including the empty-scan case.
        Device-reported identity/timestamps are unverified and labeled as such.
        """
        if capture.get('source') != 'OPENRF_SERIAL_V1' or not isinstance(capture.get('records'), list):
            raise ValueError('Expected a retrieved OpenRF Serial v1 snapshot')
        if len(capture['records']) > 128:
            raise ValueError('Too many sensor readings')
        if session_id is not None and (type(session_id) is not int or session_id < 1):
            raise ValueError('Invalid investigation ID')
        if not isinstance(survey_details, dict):
            raise ValueError('Survey location details missing')
        origin = survey_details.get('location_source')
        lat = survey_details.get('latitude')
        lon = survey_details.get('longitude')
        accuracy = survey_details.get('accuracy_m')
        age = survey_details.get('fix_age_seconds')
        if origin == 'NONE':
            if any(x is not None for x in (lat, lon, accuracy, age)):
                raise ValueError('Unexpected coordinates for no survey location')
        elif origin == 'BROWSER_REPORTED':
            if any(_optional_float(v, n, lo, hi) is None for v, n, lo, hi in
                   ((lat,'latitude',-90,90),(lon,'longitude',-180,180),(accuracy,'accuracy_m',0,1_000_000),
                    (age,'fix_age_seconds',0,60))):
                raise ValueError('Incomplete browser survey location')
        else:
            raise ValueError('Unsupported survey coordinate source')
        retrieved = capture.get('retrieved_at_utc')
        observed = capture.get('observed_at_utc')
        for value in (retrieved, observed):
            if not isinstance(value, str):
                raise ValueError('Snapshot missing UTC timestamp')
            try:
                dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            except ValueError as exc:
                raise ValueError('Invalid snapshot UTC timestamp') from exc
            if dt.tzinfo is None:
                raise ValueError('Snapshot time has no UTC offset')
        basis = capture.get('timestamp_basis')
        if basis not in ('HOST_RETRIEVAL_ONLY', 'DEVICE_REPORTED_UNVERIFIED'):
            raise ValueError('Unknown snapshot timestamp basis')
        device_time = capture.get('captured_at_utc')
        if device_time is not None and not isinstance(device_time, str):
            raise ValueError('Invalid device timestamp')
        hardware_id = _string(capture.get('hardware_id'), 'hardware_id', 64, required=True)
        interface = _string(capture.get('interface'), 'USB interface', 64, required=True)
        freshness = _string(capture.get('freshness'), 'freshness', 160, required=True)
        normalized = []
        for row in capture['records']:
            if not isinstance(row, dict):
                raise ValueError('Sensor measurement must be an object')
            signal = normalize_observation({
                'kind': row.get('kind'), 'source': 'SENSOR', 'label': row.get('label'),
                'identifier': row.get('identifier'), 'frequency_mhz': row.get('frequency_mhz'),
                'rssi_dbm': row.get('rssi_dbm'), 'latitude': lat, 'longitude': lon,
                'accuracy_m': accuracy, 'session_id': session_id,
                'source_device': f'OpenRF Serial / {hardware_id} ({interface})'[:120],
                'notes': (f'USB-serial module-reported radio observation; {freshness}. '
                          f'Time: {basis}; device identity and calibration NOT independently verified. '
                          + ('Location is a browser-reported survey position, never the transmitter position.'
                             if origin == 'BROWSER_REPORTED' else 'No GPS/survey coordinates recorded.')),
            })
            if signal['kind'] not in {'BLE', 'WIFI', 'RF'} or (signal['frequency_mhz'] is None and signal['rssi_dbm'] is None):
                raise ValueError('Unsupported or empty RF measurement')
            signal.update({'survey_capture_id': None, 'location_source': origin,
                           'fix_age_seconds': age, 'timestamp_basis': basis,
                           'device_reported_at_utc': device_time, 'hardware_id': hardware_id})
            normalized.append(signal)
        with self._lock, self._connect() as db:
            if session_id is not None:
                session = db.execute('SELECT status FROM sessions WHERE id=?', (session_id,)).fetchone()
                if not session or session['status'] != 'ACTIVE':
                    raise ValueError('Session is missing or no longer active')
            capture_id = db.execute("""
                INSERT INTO survey_captures(sensor_id, interface, retrieved_at_utc, saved_at_utc,
                  freshness, result_count, saved_count, session_id, location_source, latitude,
                  longitude, accuracy_m, fix_age_seconds, timestamp_basis, device_reported_at_utc, hardware_id)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                ('openrf-serial-v1', interface, retrieved, now_iso(), freshness,
                 len(capture['records']), len(normalized), session_id, origin, lat, lon,
                 accuracy, age, basis, device_time, hardware_id)).lastrowid
            for signal in normalized:
                signal['survey_capture_id'] = capture_id
                cols = [*signal, 'observed_at']
                db.execute(f"INSERT INTO observations ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
                           [*signal.values(), observed])
        return next(c for c in self.captures() if c['id'] == capture_id)

    def sessions(self) -> list[dict]:
        with self._lock, self._connect() as db:
            return [dict(r) for r in db.execute("""
                SELECT sessions.*, COUNT(observations.id) AS observation_count,
                (SELECT COUNT(*) FROM survey_captures c WHERE c.session_id=sessions.id) AS capture_count
                FROM sessions LEFT JOIN observations ON observations.session_id=sessions.id
                GROUP BY sessions.id ORDER BY sessions.id DESC
            """)]

    def begin_session(self, name: str) -> dict:
        name = _string(name, "name", 120, required=True)
        with self._lock, self._connect() as db:
            running = db.execute("SELECT id FROM sessions WHERE status='ACTIVE'").fetchone()
            if running:
                raise ValueError("Stop the active session before starting another")
            session_id = db.execute("INSERT INTO sessions(name, started_at) VALUES(?,?)", (name, now_iso())).lastrowid
        return next(s for s in self.sessions() if s["id"] == session_id)

    def stop_session(self, session_id: int) -> bool:
        with self._lock, self._connect() as db:
            return db.execute("UPDATE sessions SET ended_at=?, status='COMPLETED' WHERE id=? AND status='ACTIVE'", (now_iso(), session_id)).rowcount > 0

    def stats(self) -> dict:
        with self._lock, self._connect() as db:
            total = db.execute("SELECT COUNT(*) FROM observations").fetchone()[0]
            demo = db.execute("SELECT COUNT(*) FROM observations WHERE source='DEMO'").fetchone()[0]
            position_count = db.execute("SELECT COUNT(*) FROM observations WHERE latitude IS NOT NULL").fetchone()[0]
            sessions = db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
            captures = db.execute('SELECT COUNT(*) FROM survey_captures').fetchone()[0]
            return {"observations": total, "demo": demo, "mapped": position_count, "sessions": sessions,
                    "captures": captures}

    def load_demo(self) -> int:
        # Clearly synthetic, for UI testing only; intentionally not claimed as radio measurements.
        entries = [
            ("WIFI", "DEMO Wi-Fi beacon", "DEMO-AP-01", -81, 2412, 38.5801, -121.5008),
            ("WIFI", "DEMO Wi-Fi beacon", "DEMO-AP-01", -69, 2412, 38.5818, -121.4975),
            ("WIFI", "DEMO Wi-Fi beacon", "DEMO-AP-01", -56, 2412, 38.5829, -121.4938),
            ("BLE", "DEMO BLE advertiser", "DEMO-BLE-02", -73, 2440, 38.5799, -121.4930),
            ("RF", "DEMO RF observation", "DEMO-RF-03", -64, 433.92, 38.5843, -121.4891),
        ]
        with self._lock, self._connect() as db:
            if db.execute("SELECT EXISTS(SELECT 1 FROM observations WHERE source='DEMO')").fetchone()[0]:
                return 0
            for kind, label, ident, rssi, freq, lat, lon in entries:
                db.execute("""
                    INSERT INTO observations(kind,source,label,identifier,notes,source_device,
                    frequency_mhz,rssi_dbm,latitude,longitude,accuracy_m,observed_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                """, (kind,"DEMO",label,ident,"SYNTHETIC EXAMPLE — NOT OBSERVED", "Fixture (not hardware)",
                       freq,rssi,lat,lon,None,now_iso()))
        return len(entries)

    def clear_demo(self) -> int:
        with self._lock, self._connect() as db:
            return db.execute("DELETE FROM observations WHERE source='DEMO'").rowcount


def to_geojson(items: list[dict]) -> dict:
    features = []
    for item in items:
        if item["latitude"] is None or item["longitude"] is None:
            continue
        props = {k: v for k, v in item.items() if k not in ("latitude", "longitude")}
        props["coordinate_meaning"] = "observer_position_not_transmitter_position"
        features.append({"type":"Feature", "geometry":{"type":"Point", "coordinates":[item["longitude"], item["latitude"]]}, "properties":props})
    return {"type":"FeatureCollection", "features": features}


def to_csv(items: list[dict]) -> str:
    out = io.StringIO(newline="")
    cols = ["id", "kind", "source", "label", "identifier", "notes", "source_device", "frequency_mhz", "rssi_dbm", "latitude", "longitude", "accuracy_m", "observed_at", "session_id", "signal_quality_percent", "survey_capture_id", "location_source",
            "fix_age_seconds", "timestamp_basis", "device_reported_at_utc", "hardware_id", "coordinate_meaning"]
    writer = csv.DictWriter(out, fieldnames=cols, extrasaction="ignore")
    writer.writeheader()
    for item in items:
        record = dict(item)
        # Protect spreadsheet apps against formula injection from untrusted observation text.
        for key, val in record.items():
            if isinstance(val, str) and val.lstrip().startswith(("=", "+", "-", "@")):
                record[key] = "'" + val
        record["coordinate_meaning"] = "observer_position_not_transmitter_position"
        writer.writerow(record)
    return out.getvalue()
