"""Local-first weather archive. No hardware is probed and no readings are inferred.

v0.2.169 supports operator-entered records and explicitly selected historical
CSV imports. Future hardware adapters can supply independently verified samples
through a separate trusted ingestion path, not by spoofing the browser API.
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


FIELDS = {
    'temperature_c': (-100, 75),
    'humidity_pct': (0, 100),
    'pressure_hpa': (300, 1150),
    'wind_speed_mps': (0, 120),
    'wind_gust_mps': (0, 160),
    'wind_direction_deg': (0, 360),
    'rain_interval_mm': (0, 2000),
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
                    source_kind TEXT NOT NULL CHECK(source_kind IN ('MANUAL', 'IMPORTED_HISTORICAL')),
                    temperature_c REAL,
                    humidity_pct REAL,
                    pressure_hpa REAL,
                    wind_speed_mps REAL,
                    wind_gust_mps REAL,
                    wind_direction_deg REAL,
                    rain_interval_mm REAL,
                    uv_index REAL,
                    solar_wm2 REAL,
                    UNIQUE(station_id, observed_at_utc, source_kind)
                );
                CREATE INDEX IF NOT EXISTS idx_weather_station_time
                    ON weather_readings(station_id, observed_at_utc DESC, id DESC);
            ''')

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
                'implemented_inputs': ['MANUAL', 'IMPORTED_HISTORICAL'],
                'future_adapters': ['Ecowitt local gateway', 'WeeWX local archive',
                                    'rtl_433 receiver', 'USB serial sensor'],
                'hardware_status': 'NOT_CONFIGURED',
                'message': 'No weather receivers are started or probed by OpenRF.'}

    def _insert(self, db, station_id, at, source, values, recorded_at):
        keys = ('station_id', 'observed_at_utc', 'recorded_at_utc', 'source_kind', *FIELDS)
        payload = (station_id, at, recorded_at, source, *(values[key] for key in FIELDS))
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
            if not headers or len(headers) != len(set(headers)) or 'observed_at_utc' not in headers or set(headers) - (set(CSV_FIELDS) | {'station_id', 'source_kind'}):
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

    def export_csv(self, station_id):
        station_id = self._station_id(station_id)
        with self._connect() as db:
            self._exists(db, station_id)
            rows = db.execute('''SELECT * FROM weather_readings WHERE station_id=?
                                 ORDER BY observed_at_utc DESC,id DESC LIMIT ?''',
                              (station_id, MAX_EXPORT_ROWS)).fetchall()
        buffer = io.StringIO(newline='')
        writer = csv.writer(buffer, lineterminator='\r\n')
        writer.writerow(('station_id', 'source_kind', *CSV_FIELDS))
        for row in reversed(rows):
            writer.writerow((station_id, row['source_kind'], row['observed_at_utc'],
                             *(row[key] if row[key] is not None else '' for key in FIELDS)))
        return buffer.getvalue().encode('utf-8')
