"""Local-first weather archive and explicitly requested receiver observations.

No weather device is probed on startup and no background collection occurs.
Ecowitt LAN values are gateway-*reported*, not hardware-verified.
"""
from __future__ import annotations

import csv
import io
import math
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .weather_ecowitt import EcowittError, fetch_livedata, private_gateway_ip


FIELDS = {
    'temperature_c': (-100, 75),
    'humidity_pct': (0, 100),
    'pressure_hpa': (300, 1150),
    'wind_speed_mps': (0, 120),
    'wind_gust_mps': (0, 160),
    'wind_direction_deg': (0, 360),
    'rain_interval_mm': (0, 2000),
    'rain_rate_mm_h': (0, 2000),
    'uv_index': (0, 25),
    'solar_wm2': (0, 1800),
}
CSV_FIELDS = ('observed_at_utc', *FIELDS)
MAX_IMPORT_BYTES = 160_000
MAX_IMPORT_ROWS = 500
MAX_EXPORT_ROWS = 50_000


class WeatherError(ValueError):
    """An invalid or unsupported local weather operation."""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def normalize_time(value: object) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 40:
        raise WeatherError('Observation time must be an ISO-8601 date/time with a UTC offset.')
    try:
        date = datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
    except ValueError as exc:
        raise WeatherError('Observation time must be valid ISO-8601.') from exc
    if date.tzinfo is None or date.utcoffset() is None:
        raise WeatherError('Observation time requires a UTC offset; a local clock time is ambiguous.')
    utc = date.astimezone(timezone.utc)
    if utc.year < 1970 or utc > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise WeatherError('Observation time must be from 1970 through five minutes into the future.')
    return utc.replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def normalize_measurements(data: dict) -> dict:
    if not isinstance(data, dict):
        raise WeatherError('Weather measurements must be an object.')
    unexpected = set(data) - set(FIELDS)
    if unexpected:
        raise WeatherError('Unsupported measurement field: ' + sorted(unexpected)[0])
    values = {}
    for field, (low, high) in FIELDS.items():
        raw = data.get(field)
        if raw is None or raw == '':
            values[field] = None
            continue
        if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
            raise WeatherError(f'{field} must be a measured number.')
        try:
            number = float(raw)
        except (ValueError, OverflowError) as exc:
            raise WeatherError(f'{field} must be a measured number.') from exc
        if not math.isfinite(number) or not low <= number <= high:
            raise WeatherError(f'{field} must be within {low}–{high}.')
        values[field] = round(number, 5)
    if all(value is None for value in values.values()):
        raise WeatherError('Enter at least one measured value; blank records are not stored.')
    return values


class WeatherStore:
    """Station records and tagged observations in OpenRF's existing local SQLite."""

    def __init__(self, database: str | Path):
        self.path = Path(database)
        self._lock = threading.RLock()
        self._initialize()

    @contextmanager
    def _connect(self):
        with self._lock:
            db = sqlite3.connect(str(self.path), timeout=10)
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA foreign_keys=ON')
            try:
                with db:
                    yield db
            finally:
                db.close()

    def _initialize(self):
        with self._connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS weather_stations (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at_utc TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS weather_readings (
                    id INTEGER PRIMARY KEY,
                    station_id INTEGER NOT NULL REFERENCES weather_stations(id),
                    observed_at_utc TEXT NOT NULL,
                    recorded_at_utc TEXT NOT NULL,
                    source_kind TEXT NOT NULL CHECK(source_kind IN ('MANUAL', 'IMPORTED_HISTORICAL', 'ECOWITT_GATEWAY_REPORTED', 'RTL433_RECEIVER_REPORTED', 'OPENRF_SERIAL_WEATHER_REPORTED')),
                    source_device TEXT NOT NULL DEFAULT '',
                    timestamp_basis TEXT, sensor_reported_at_utc TEXT,
                    measurement_age_seconds REAL, freshness TEXT,
                    temperature_c REAL,
                    humidity_pct REAL,
                    pressure_hpa REAL,
                    wind_speed_mps REAL,
                    wind_gust_mps REAL,
                    wind_direction_deg REAL,
                    rain_interval_mm REAL,
                    rain_rate_mm_h REAL,
                    uv_index REAL,
                    solar_wm2 REAL,
                    UNIQUE(station_id, observed_at_utc, source_kind, source_device)
                );
                CREATE INDEX IF NOT EXISTS idx_weather_station_time
                    ON weather_readings(station_id, observed_at_utc DESC, id DESC);
            ''')
            old_sql = db.execute("SELECT sql FROM sqlite_master WHERE name='weather_readings' AND type='table'").fetchone()[0]
            if 'ECOWITT_GATEWAY_REPORTED' not in old_sql:
                # Preserve every existing record when broadening the CHECK constraint.
                # This upgrade is transactional and does not touch other OpenRF tables.
                db.execute('''CREATE TABLE weather_readings_v170 (
                    id INTEGER PRIMARY KEY,
                    station_id INTEGER NOT NULL REFERENCES weather_stations(id),
                    observed_at_utc TEXT NOT NULL, recorded_at_utc TEXT NOT NULL,
                    source_kind TEXT NOT NULL CHECK(source_kind IN
                        ('MANUAL', 'IMPORTED_HISTORICAL', 'ECOWITT_GATEWAY_REPORTED')),
                    source_device TEXT NOT NULL DEFAULT '',
                    temperature_c REAL, humidity_pct REAL, pressure_hpa REAL,
                    wind_speed_mps REAL, wind_gust_mps REAL, wind_direction_deg REAL,
                    rain_interval_mm REAL, uv_index REAL, solar_wm2 REAL,
                    UNIQUE(station_id, observed_at_utc, source_kind)
                )''')
                db.execute('''INSERT INTO weather_readings_v170
                    (id,station_id,observed_at_utc,recorded_at_utc,source_kind,
                     temperature_c,humidity_pct,pressure_hpa,wind_speed_mps,
                     wind_gust_mps,wind_direction_deg,rain_interval_mm,uv_index,solar_wm2)
                    SELECT id,station_id,observed_at_utc,recorded_at_utc,source_kind,
                     temperature_c,humidity_pct,pressure_hpa,wind_speed_mps,
                     wind_gust_mps,wind_direction_deg,rain_interval_mm,uv_index,solar_wm2
                    FROM weather_readings''')
                db.execute('DROP TABLE weather_readings')
                db.execute('ALTER TABLE weather_readings_v170 RENAME TO weather_readings')
                db.execute('''CREATE INDEX idx_weather_station_time
                    ON weather_readings(station_id, observed_at_utc DESC, id DESC)''')
            current_sql = db.execute("SELECT sql FROM sqlite_master WHERE name='weather_readings' AND type='table'").fetchone()[0]
            if 'RTL433_RECEIVER_REPORTED' not in current_sql:
                # v0.2.170 -> v0.2.174, retaining every historic reading and
                # allowing distinct physical sensor sources in one UTC second.
                db.execute('''CREATE TABLE weather_readings_v171 (
                    id INTEGER PRIMARY KEY,
                    station_id INTEGER NOT NULL REFERENCES weather_stations(id),
                    observed_at_utc TEXT NOT NULL, recorded_at_utc TEXT NOT NULL,
                    source_kind TEXT NOT NULL CHECK(source_kind IN
                        ('MANUAL','IMPORTED_HISTORICAL','ECOWITT_GATEWAY_REPORTED','RTL433_RECEIVER_REPORTED')),
                    source_device TEXT NOT NULL DEFAULT '',
                    temperature_c REAL, humidity_pct REAL, pressure_hpa REAL,
                    wind_speed_mps REAL, wind_gust_mps REAL, wind_direction_deg REAL,
                    rain_interval_mm REAL, rain_rate_mm_h REAL, uv_index REAL, solar_wm2 REAL,
                    UNIQUE(station_id,observed_at_utc,source_kind,source_device)
                )''')
                db.execute('''INSERT INTO weather_readings_v171
                    (id,station_id,observed_at_utc,recorded_at_utc,source_kind,source_device,
                     temperature_c,humidity_pct,pressure_hpa,wind_speed_mps,
                     wind_gust_mps,wind_direction_deg,rain_interval_mm,uv_index,solar_wm2)
                    SELECT id,station_id,observed_at_utc,recorded_at_utc,source_kind,source_device,
                     temperature_c,humidity_pct,pressure_hpa,wind_speed_mps,
                     wind_gust_mps,wind_direction_deg,rain_interval_mm,uv_index,solar_wm2
                    FROM weather_readings''')
                db.execute('DROP TABLE weather_readings')
                db.execute('ALTER TABLE weather_readings_v171 RENAME TO weather_readings')
                db.execute('''CREATE INDEX idx_weather_station_time
                    ON weather_readings(station_id, observed_at_utc DESC, id DESC)''')
            current_sql = db.execute("SELECT sql FROM sqlite_master WHERE name='weather_readings' AND type='table'").fetchone()[0]
            if 'OPENRF_SERIAL_WEATHER_REPORTED' not in current_sql:
                # v0.2.171 -> v0.2.172: retain every existing record, source,
                # station ID and timestamp; append explicit sensor time quality.
                db.execute('''CREATE TABLE weather_readings_v172 (
                    id INTEGER PRIMARY KEY,
                    station_id INTEGER NOT NULL REFERENCES weather_stations(id),
                    observed_at_utc TEXT NOT NULL, recorded_at_utc TEXT NOT NULL,
                    source_kind TEXT NOT NULL CHECK(source_kind IN
                        ('MANUAL','IMPORTED_HISTORICAL','ECOWITT_GATEWAY_REPORTED',
                         'RTL433_RECEIVER_REPORTED','OPENRF_SERIAL_WEATHER_REPORTED')),
                    source_device TEXT NOT NULL DEFAULT '',
                    timestamp_basis TEXT, sensor_reported_at_utc TEXT,
                    measurement_age_seconds REAL, freshness TEXT,
                    temperature_c REAL, humidity_pct REAL, pressure_hpa REAL,
                    wind_speed_mps REAL, wind_gust_mps REAL, wind_direction_deg REAL,
                    rain_interval_mm REAL, rain_rate_mm_h REAL, uv_index REAL, solar_wm2 REAL,
                    UNIQUE(station_id,observed_at_utc,source_kind,source_device)
                )''')
                db.execute('''INSERT INTO weather_readings_v172
                    (id,station_id,observed_at_utc,recorded_at_utc,source_kind,source_device,
                     temperature_c,humidity_pct,pressure_hpa,wind_speed_mps,
                     wind_gust_mps,wind_direction_deg,rain_interval_mm,rain_rate_mm_h,uv_index,solar_wm2)
                    SELECT id,station_id,observed_at_utc,recorded_at_utc,source_kind,source_device,
                     temperature_c,humidity_pct,pressure_hpa,wind_speed_mps,
                     wind_gust_mps,wind_direction_deg,rain_interval_mm,rain_rate_mm_h,uv_index,solar_wm2
                    FROM weather_readings''')
                db.execute('DROP TABLE weather_readings')
                db.execute('ALTER TABLE weather_readings_v172 RENAME TO weather_readings')
                db.execute('''CREATE INDEX idx_weather_station_time
                    ON weather_readings(station_id, observed_at_utc DESC, id DESC)''')
            # v0.2.174: session records are local, survive restarts, and cannot
            # silently resume an old weather-device connection.
            db.execute('''CREATE TABLE IF NOT EXISTS weather_recording_sessions (
                id INTEGER PRIMARY KEY,
                station_id INTEGER NOT NULL REFERENCES weather_stations(id),
                source_kind TEXT NOT NULL CHECK(source_kind IN ('ECOWITT','SERIAL')),
                source_label TEXT NOT NULL,
                interval_seconds INTEGER NOT NULL,
                started_at_utc TEXT NOT NULL,
                ended_at_utc TEXT,
                state TEXT NOT NULL CHECK(state IN ('RUNNING','STOPPING','STOPPED','FAILED','INTERRUPTED','LIMIT_REACHED')),
                samples_saved INTEGER NOT NULL DEFAULT 0,
                skipped_count INTEGER NOT NULL DEFAULT 0,
                failure_count INTEGER NOT NULL DEFAULT 0,
                last_saved_at_utc TEXT,
                last_error TEXT NOT NULL DEFAULT ''
            )''')
            if 'recording_session_id' not in {row['name'] for row in db.execute('PRAGMA table_info(weather_readings)')}:
                db.execute('ALTER TABLE weather_readings ADD COLUMN recording_session_id INTEGER')
            db.execute('''CREATE INDEX IF NOT EXISTS idx_weather_recording_readings
                          ON weather_readings(recording_session_id)''')
            db.execute('''UPDATE weather_recording_sessions
                          SET state='INTERRUPTED',ended_at_utc=?,last_error='App stopped; recording requires a new explicit Start.'
                          WHERE state IN ('RUNNING','STOPPING')''', (utc_now(),))

    @staticmethod
    def _station_id(value):
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise WeatherError('Select a valid weather station.')
        return value

    def _exists(self, db, station_id):
        if not db.execute('SELECT 1 FROM weather_stations WHERE id=?', (station_id,)).fetchone():
            raise WeatherError('Weather station not found.')

    def create_station(self, body):
        if not isinstance(body, dict) or set(body) - {'name', 'notes'}:
            raise WeatherError('Provide only a station name and optional notes.')
        name, notes = body.get('name'), body.get('notes', '')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 64:
            raise WeatherError('Station name must be 1–64 characters.')
        if not isinstance(notes, str) or len(notes) > 250:
            raise WeatherError('Station notes must be at most 250 characters.')
        if any(ord(ch) < 32 for ch in name + notes):
            raise WeatherError('Station text cannot contain control characters.')
        with self._connect() as db:
            if db.execute('SELECT COUNT(*) FROM weather_stations').fetchone()[0] >= 100:
                raise WeatherError('Maximum of 100 local stations reached.')
            ident = db.execute('INSERT INTO weather_stations(name,notes,created_at_utc) VALUES(?,?,?)',
                               (name.strip(), notes.strip(), utc_now())).lastrowid
        return {'id': ident, 'name': name.strip(), 'notes': notes.strip(),
                'connected': False, 'collection_state': 'NOT_CONFIGURED'}

    def stations(self):
        with self._connect() as db:
            rows = db.execute('''SELECT s.id,s.name,s.notes,s.created_at_utc,
                    COUNT(r.id) AS reading_count,MAX(r.observed_at_utc) AS last_observed_at_utc
                    FROM weather_stations s LEFT JOIN weather_readings r ON r.station_id=s.id
                    GROUP BY s.id ORDER BY s.id''').fetchall()
        return [dict(row) | {'connected': False, 'collection_state': 'NOT_CONFIGURED'} for row in rows]

    def status(self):
        with self._connect() as db:
            total = db.execute('SELECT COUNT(*) FROM weather_readings').fetchone()[0]
        return {'stations': self.stations(), 'reading_count': total,
                'automatic_collection': False, 'connected_devices': 0,
                'implemented_inputs': ['MANUAL', 'IMPORTED_HISTORICAL', 'ECOWITT_ON_DEMAND_LAN', 'RTL433_ON_DEMAND_SDR', 'OPENRF_WEATHER_SERIAL_V1_ON_DEMAND'],
                'on_demand_adapters': ['Ecowitt local HTTP', 'rtl_433 optional RTL-SDR', 'OpenRF Weather Serial v1 (user-probed USB bridge)'],
                'future_adapters': ['Weather alert thresholds and comparison dashboard'],
                'hardware_status': 'NOT_CONFIGURED',
                'message': 'All source polling requires a user-started recording or an explicit one-shot read.'}

    def _insert(self, db, station_id, at, source, values, recorded_at, source_device='', recording_session_id=None):
        keys = ('station_id', 'observed_at_utc', 'recorded_at_utc', 'source_kind', 'source_device', 'recording_session_id', *FIELDS)
        payload = (station_id, at, recorded_at, source, source_device, recording_session_id, *(values[key] for key in FIELDS))
        cursor = db.execute('INSERT OR IGNORE INTO weather_readings (' + ','.join(keys) +
                            ') VALUES (' + ','.join('?' for _ in keys) + ')', payload)
        return cursor.rowcount == 1

    def add_manual(self, body):
        if not isinstance(body, dict) or set(body) - {'station_id', 'observed_at_utc', 'measurements'}:
            raise WeatherError('Use station_id, optional observed_at_utc, and measurements only.')
        station_id = self._station_id(body.get('station_id'))
        at = normalize_time(body.get('observed_at_utc', utc_now()))
        values = normalize_measurements(body.get('measurements'))
        now = utc_now()
        with self._connect() as db:
            self._exists(db, station_id)
            inserted = self._insert(db, station_id, at, 'MANUAL', values, now)
        if not inserted:
            raise WeatherError('This station already has a manual record at that UTC second.')
        return {'station_id': station_id, 'observed_at_utc': at, 'recorded_at_utc': now,
                'source_kind': 'MANUAL', **values}

    def read_ecowitt(self, body, recording_session_id=None):
        """Only an explicit operator request can fetch, and optionally save, a reading."""
        if not isinstance(body, dict) or set(body) != {'station_id', 'gateway_ip', 'save'}:
            raise WeatherError('Choose station_id, private-LAN gateway_ip and save (true/false).')
        station_id = self._station_id(body['station_id'])
        if not isinstance(body['save'], bool):
            raise WeatherError('Save choice must be true or false.')
        try:
            ip = private_gateway_ip(body['gateway_ip'])
        except EcowittError as exc:
            raise WeatherError(str(exc)) from exc
        with self._connect() as db:
            self._exists(db, station_id)
        try:
            values = normalize_measurements(fetch_livedata(ip))
        except EcowittError as exc:
            raise WeatherError(str(exc)) from exc
        at = utc_now()  # Receipt timestamp, NOT an inferred device observation timestamp.
        result = {'station_id': station_id, 'observed_at_utc': at, 'recorded_at_utc': at,
                  'timestamp_basis': 'OPENRF_RECEIVED_AT_UTC',
                  'source_kind': 'ECOWITT_GATEWAY_REPORTED', 'source_device': ip,
                  'hardware_verified': False, 'saved': False, **values}
        if body['save']:
            with self._connect() as db:
                self._exists(db, station_id)
                if not self._insert(db, station_id, at, result['source_kind'], values, at, ip, recording_session_id):
                    raise WeatherError('A gateway reading was already saved at this UTC second. Try again shortly.')
            result['saved'] = True
        return result

    def save_rtl433_sample(self, station_id, candidate, listen_finished_utc, frequency_mhz):
        """Only the server-held rtl_433 capture receipt may invoke this method."""
        station_id = self._station_id(station_id)
        if not isinstance(candidate, dict) or not isinstance(candidate.get('model'), str):
            raise WeatherError('Invalid decoded weather sensor receipt.')
        at = normalize_time(listen_finished_utc)
        values = normalize_measurements(candidate.get('measurements'))
        source_device = (f"rtl_433 SDR index 0 / {frequency_mhz} MHz / "
                         f"{candidate['model']} / id={candidate.get('device_id', '')} / "
                         f"channel={candidate.get('channel', '')}")[:240]
        now = utc_now()
        with self._connect() as db:
            self._exists(db, station_id)
            if not self._insert(db, station_id, at, 'RTL433_RECEIVER_REPORTED',
                                values, now, source_device):
                raise WeatherError('This decoded sensor already has a saved record for this listen window.')
        return {'station_id': station_id, 'observed_at_utc': at, 'recorded_at_utc': now,
                'source_kind': 'RTL433_RECEIVER_REPORTED', 'source_device': source_device,
                'timestamp_basis': 'HOST_LISTEN_WINDOW_NOT_PACKET_TIMESTAMP',
                'hardware_verified': False, **values}

    def save_serial_sample(self, station_id, capture, candidate, recording_session_id=None):
        """Persist only an authenticated-by-process receipt, not browser metrics.

        Device identity and timing are still *unverified*: USB protocol response
        is not a cryptographic signature, calibration or genuine sensor proof.
        """
        station_id = self._station_id(station_id)
        at = normalize_time(capture['received_at_utc'])
        values = normalize_measurements(candidate['measurements'])
        source_device = (f"OpenRF weather USB / {capture['port']} / "
                         f"hw={capture['hardware_id']} / {candidate['model']} / "
                         f"sensor={candidate['sensor_id']} / channel={candidate['channel']}")[:240]
        reported = candidate['sensor_reported_at_utc']
        freshness = candidate['freshness']
        age = candidate['measurement_age_seconds']
        now = utc_now()
        with self._connect() as db:
            self._exists(db, station_id)
            keys = ('station_id','observed_at_utc','recorded_at_utc','source_kind','source_device',
                    'timestamp_basis','sensor_reported_at_utc','measurement_age_seconds','freshness','recording_session_id',*FIELDS)
            payload = (station_id,at,now,'OPENRF_SERIAL_WEATHER_REPORTED',source_device,
                       'HOST_RECEIVED_AT_UTC',reported,age,freshness,recording_session_id,*(values[field] for field in FIELDS))
            cursor = db.execute('INSERT OR IGNORE INTO weather_readings (' + ','.join(keys) +
                                ') VALUES (' + ','.join('?' for _ in keys) + ')', payload)
            if cursor.rowcount != 1:
                raise WeatherError('This sensor already has a weather reading at the same UTC second.')
        return {'station_id': station_id, 'observed_at_utc': at, 'recorded_at_utc': now,
                'source_kind': 'OPENRF_SERIAL_WEATHER_REPORTED', 'source_device': source_device,
                'timestamp_basis':'HOST_RECEIVED_AT_UTC', 'sensor_reported_at_utc':reported,
                'measurement_age_seconds':age, 'freshness':freshness,
                'hardware_verified':False, **values}

    def import_csv(self, body):
        if not isinstance(body, dict) or set(body) != {'station_id', 'csv_text'}:
            raise WeatherError('CSV import requires station_id and csv_text only.')
        station_id = self._station_id(body['station_id'])
        raw = body['csv_text']
        if not isinstance(raw, str) or len(raw.encode('utf-8')) > MAX_IMPORT_BYTES:
            raise WeatherError('Weather CSV must be UTF-8 text at most 160 kB.')
        try:
            rows = csv.DictReader(io.StringIO(raw.lstrip('\ufeff'), newline=''), strict=True)
            headers = rows.fieldnames
            if not headers or len(headers) != len(set(headers)) or 'observed_at_utc' not in headers or set(headers) - (set(CSV_FIELDS) | {'station_id', 'source_kind', 'source_device', 'timestamp_basis', 'sensor_reported_at_utc', 'measurement_age_seconds', 'freshness', 'recording_session_id'}):
                raise WeatherError('CSV needs observed_at_utc and only the supported measurement headers.')
            if not set(headers).intersection(FIELDS):
                raise WeatherError('CSV must include at least one measurement column.')
            prepared = []
            for row in rows:
                if len(prepared) >= MAX_IMPORT_ROWS:
                    raise WeatherError('Import at most 500 rows per file.')
                if None in row:
                    raise WeatherError('CSV has unexpected extra columns.')
                at = normalize_time(row['observed_at_utc'])
                values = normalize_measurements({key: value for key, value in row.items() if key in FIELDS})
                prepared.append((at, values))
        except (csv.Error, UnicodeError) as exc:
            raise WeatherError('Invalid weather CSV format.') from exc
        if not prepared:
            raise WeatherError('CSV contains no readings.')
        now, imported = utc_now(), 0
        with self._connect() as db:
            self._exists(db, station_id)
            for at, values in prepared:
                imported += self._insert(db, station_id, at, 'IMPORTED_HISTORICAL', values, now)
        return {'station_id': station_id, 'imported': imported,
                'duplicates': len(prepared) - imported, 'total_rows': len(prepared),
                'source_kind': 'IMPORTED_HISTORICAL'}

    def import_weewx_csv(self, body):
        """Import user-selected WeeWX archive CSV, converting each row's usUnits.

        WeeWX systems: US=1, METRIC=16, METRICWX=17. `rain` is the
        archive *interval* amount; `rainRate` is a rate, not an interval
        amount. Unrelated cumulative rain counters are ignored.
        No WeeWX service or device is contacted by this import.
        """
        if not isinstance(body, dict) or set(body) != {'station_id', 'csv_text'}:
            raise WeatherError('WeeWX import requires station_id and csv_text only.')
        station_id = self._station_id(body['station_id'])
        raw = body['csv_text']
        if not isinstance(raw, str) or len(raw.encode('utf-8')) > MAX_IMPORT_BYTES:
            raise WeatherError('WeeWX CSV must be UTF-8 text at most 160 kB.')
        mapping = {'outTemp': 'temperature_c', 'outHumidity': 'humidity_pct',
                   'barometer': 'pressure_hpa', 'windSpeed': 'wind_speed_mps',
                   'windGust': 'wind_gust_mps', 'windDir': 'wind_direction_deg',
                   'rain': 'rain_interval_mm', 'rainRate': 'rain_rate_mm_h',
                   'UV': 'uv_index', 'radiation': 'solar_wm2'}
        try:
            reader = csv.DictReader(io.StringIO(raw.lstrip('\ufeff'), newline=''), strict=True)
            headers = reader.fieldnames
            if (not headers or len(headers) != len(set(headers)) or len(headers) > 80
                    or any(not key or len(key) > 64 for key in headers)
                    or not {'dateTime', 'usUnits'} <= set(headers)
                    or not set(mapping).intersection(headers)):
                raise WeatherError('WeeWX CSV needs dateTime, usUnits and an archive measurement column.')
            prepared = []
            for row in reader:
                if len(prepared) >= MAX_IMPORT_ROWS:
                    raise WeatherError('Import at most 500 WeeWX rows per file.')
                if None in row or any(value is None for value in row.values()):
                    raise WeatherError('WeeWX CSV has missing or extra columns.')
                try:
                    unit_code = int(row['usUnits'])
                    if unit_code not in (1, 16, 17) or str(unit_code) != row['usUnits']:
                        raise ValueError('unit')
                    epoch = int(row['dateTime'])
                    if str(epoch) != row['dateTime']:
                        raise ValueError('epoch')
                    observed = datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()
                except (ValueError, OverflowError, OSError) as exc:
                    raise WeatherError('WeeWX dateTime must be Unix seconds and usUnits 1, 16 or 17.') from exc
                at = normalize_time(observed)
                converted = {}
                for column, field in mapping.items():
                    value = row.get(column, '').strip()
                    if not value:
                        continue
                    if value.lower() in ('none', 'null', 'nan'):
                        continue  # WeeWX missing sensor value, never a measured zero.
                    try:
                        number = float(value)
                    except ValueError as exc:
                        raise WeatherError('Invalid WeeWX numeric value in ' + column) from exc
                    if unit_code == 1:
                        if column == 'outTemp':
                            number = (number - 32) * 5 / 9
                        elif column in ('windSpeed', 'windGust'):
                            number /= 2.2369362921
                        elif column == 'barometer':
                            number *= 33.8638866667
                        elif column in ('rain', 'rainRate'):
                            number *= 25.4
                    elif unit_code == 16:
                        if column in ('windSpeed', 'windGust'):
                            number /= 3.6
                        elif column in ('rain', 'rainRate'):
                            number *= 10  # METRIC rain is in cm, not mm.
                    converted[field] = number
                prepared.append((at, normalize_measurements(converted)))
        except (csv.Error, UnicodeError) as exc:
            raise WeatherError('Invalid WeeWX CSV format.') from exc
        if not prepared:
            raise WeatherError('WeeWX CSV contains no usable observations.')
        now, imported = utc_now(), 0
        with self._connect() as db:
            self._exists(db, station_id)
            for at, values in prepared:
                imported += self._insert(db, station_id, at, 'IMPORTED_HISTORICAL', values,
                                         now, 'WeeWX archive CSV')
        return {'station_id': station_id, 'imported': imported,
                'duplicates': len(prepared) - imported, 'total_rows': len(prepared),
                'source_kind': 'IMPORTED_HISTORICAL', 'source_device': 'WeeWX archive CSV'}

    def readings(self, station_id, days=7, limit=500):
        station_id = self._station_id(station_id)
        if isinstance(days, bool) or not isinstance(days, int) or days not in (0, 1, 7, 30, 365):
            raise WeatherError('History window must be 0, 1, 7, 30 or 365 days.')
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 1000:
            raise WeatherError('History limit must be 1–1000.')
        since = (datetime.now(timezone.utc) - timedelta(days=days)).replace(microsecond=0).isoformat().replace('+00:00', 'Z') if days else None
        with self._connect() as db:
            self._exists(db, station_id)
            query = 'SELECT * FROM weather_readings WHERE station_id=?'
            args = [station_id]
            if since:
                query += ' AND observed_at_utc>=?'
                args.append(since)
            data = db.execute(query + ' ORDER BY observed_at_utc DESC,id DESC LIMIT ?',
                              (*args, limit)).fetchall()
        return list(reversed([dict(row) for row in data]))

    def create_recording(self, station_id, source_kind, label, interval_seconds):
        with self._connect() as db:
            self._exists(db, station_id)
            if db.execute('SELECT COUNT(*) FROM weather_recording_sessions').fetchone()[0] >= 250:
                raise WeatherError('250 saved recording sessions reached; no history was deleted.')
            if db.execute('SELECT COUNT(*) FROM weather_readings WHERE station_id=?', (station_id,)).fetchone()[0] >= 50000:
                raise WeatherError('Station has 50,000 readings; export and manage data before recording more.')
            ident = db.execute('''INSERT INTO weather_recording_sessions
                (station_id,source_kind,source_label,interval_seconds,started_at_utc,state)
                VALUES(?,?,?,?,?,'RUNNING')''', (station_id,source_kind,label,interval_seconds,utc_now())).lastrowid
        return ident

    def update_recording(self, ident, *, state=None, saved=0, skipped=0, failure=0, error=''):
        with self._connect() as db:
            db.execute('''UPDATE weather_recording_sessions SET
                state=COALESCE(?,state),
                ended_at_utc=CASE WHEN ? IN ('STOPPED','FAILED','INTERRUPTED','LIMIT_REACHED') THEN ? ELSE ended_at_utc END,
                samples_saved=samples_saved+?,skipped_count=skipped_count+?,failure_count=failure_count+?,
                last_saved_at_utc=CASE WHEN ? > 0 THEN ? ELSE last_saved_at_utc END,
                last_error=? WHERE id=?''',
                (state,state,utc_now(),saved,skipped,failure,saved,utc_now(),str(error)[:240],ident))

    def recordings(self, limit=20):
        if type(limit) is not int or not 1 <= limit <= 50:
            raise WeatherError('Recording history limit must be 1–50.')
        with self._connect() as db:
            rows = db.execute('''SELECT s.*,w.name AS station_name
                FROM weather_recording_sessions s JOIN weather_stations w ON w.id=s.station_id
                ORDER BY s.id DESC LIMIT ?''',(limit,)).fetchall()
        return [dict(row) for row in rows]

    def compare_periods(self, station_id, days=7, metric='temperature_c', *, now=None):
        """Compare *saved record samples* in two adjacent equal UTC windows.

        An average of source-reported samples is not a calibrated climate
        statistic; sparse/mixed sensor histories are not silently filled in.
        """
        station_id = self._station_id(station_id)
        if type(days) is not int or days not in (1, 7, 30, 365):
            raise WeatherError('Comparison period must be 1, 7, 30 or 365 days.')
        if not isinstance(metric, str) or metric not in FIELDS:
            raise WeatherError('Select a supported weather measurement to compare.')
        end = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).replace(microsecond=0)
        begin = end - timedelta(days=days)
        before = begin - timedelta(days=days)
        def iso(value):
            return value.isoformat().replace('+00:00', 'Z')
        with self._connect() as db:
            self._exists(db, station_id)
            result = []
            for lower, upper in ((begin, end), (before, begin)):
                # Metric is selected from FIELDS, not interpolated user SQL.
                row = db.execute(f'''SELECT COUNT(*) AS count, AVG({metric}) AS mean,
                    MIN({metric}) AS minimum, MAX({metric}) AS maximum,
                    MAX(observed_at_utc) AS latest_observed_at_utc
                    FROM weather_readings WHERE station_id=?
                    AND observed_at_utc>=? AND observed_at_utc<?
                    AND {metric} IS NOT NULL''', (station_id, iso(lower), iso(upper))).fetchone()
                result.append({'from_utc': iso(lower), 'to_utc': iso(upper), **dict(row)})
        return {'station_id': station_id, 'days': days, 'metric': metric,
                'units': 'SI', 'provenance': 'SAVED_SOURCE_TAGGED_SAMPLES_UNVERIFIED',
                'current': result[0], 'previous': result[1],
                'note': 'Record-level statistics; missing values ignored. Mixed sensor sources, sparse sampling and reports not independently verified.'}

    def export_csv(self, station_id):
        station_id = self._station_id(station_id)
        with self._connect() as db:
            self._exists(db, station_id)
            rows = db.execute('''SELECT * FROM weather_readings WHERE station_id=?
                                 ORDER BY observed_at_utc DESC,id DESC LIMIT ?''',
                              (station_id, MAX_EXPORT_ROWS)).fetchall()
        buffer = io.StringIO(newline='')
        writer = csv.writer(buffer, lineterminator='\r\n')
        writer.writerow(('station_id', 'source_kind', 'source_device', *CSV_FIELDS,
                         'timestamp_basis','sensor_reported_at_utc','measurement_age_seconds','freshness','recording_session_id'))
        for row in reversed(rows):
            writer.writerow((station_id, row['source_kind'], row['source_device'], row['observed_at_utc'],
                             *(row[key] if row[key] is not None else '' for key in FIELDS),
                             *(row[key] if row[key] is not None else '' for key in
                               ('timestamp_basis','sensor_reported_at_utc','measurement_age_seconds','freshness','recording_session_id'))))
        return buffer.getvalue().encode('utf-8')
