"""The pseudo USB device used in these tests is TEST ONLY, never live RF."""
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import pty
import tempfile
import threading
import unittest
from unittest.mock import patch

from openrf.drivers.serial_openrf import (
    SerialSensorError, eligible_port, parse_hello, parse_snapshot, query_port,
)
from openrf.sensor_connections import browser_location_details
from openrf.storage import Repository


def hello():
    return {'type':'hello', 'protocol':'openrf.serial.v1', 'hardware_id':'TEST-ONLY-001',
            'label':'Synthetic test firmware', 'capabilities':['BLE','RF']}


def snapshot(timestamp=None):
    return {'type':'snapshot', 'protocol':'openrf.serial.v1', 'hardware_id':'TEST-ONLY-001',
            'captured_at_utc':timestamp,
            'records':[{'kind':'BLE','identifier':'TEST-BLE-001','label':'TEST synthetic advertisement',
                        'frequency_mhz':None,'rssi_dbm':-63},
                       {'kind':'RF','identifier':'TEST-RF-002','label':'TEST synthetic frequency observation',
                        'frequency_mhz':433.92,'rssi_dbm':-74}]}


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class SerialSensorTests(unittest.TestCase):
    def test_safe_port_selection(self):
        self.assertEqual(eligible_port('ttyACM2', ['ttyACM2']), Path('/dev/ttyACM2'))
        for path in ['/dev/ttyUSB0', '../../etc/passwd', 'ttyS0', 'ttyUSB2000', 'ttyACM1/other']:
            with self.assertRaises(SerialSensorError):
                eligible_port(path, ['ttyACM2', path])

    def test_strict_handshake_and_negotiated_categories(self):
        negotiated = parse_hello(hello())
        self.assertFalse(negotiated['identity_verified'])
        self.assertEqual(negotiated['capabilities'], ['BLE','RF'])
        with self.assertRaises(SerialSensorError):
            parse_hello(dict(hello(), protocol='other'))
        altered = snapshot()
        altered['records'][0]['kind'] = 'WIFI'
        with self.assertRaisesRegex(SerialSensorError, 'negotiated'):
            parse_snapshot(altered, negotiated, now())

    def test_units_timestamps_and_no_fabricated_observation(self):
        negotiated = parse_hello(hello())
        parsed = parse_snapshot(snapshot(), negotiated, now())
        self.assertEqual(parsed['timestamp_basis'], 'HOST_RETRIEVAL_ONLY')
        self.assertIn('UNKNOWN', parsed['freshness'])
        self.assertIsNone(parsed['records'][0]['frequency_mhz'])
        self.assertEqual(parsed['records'][0]['rssi_dbm'], -63)
        self.assertNotIn('latitude', parsed['records'][0])
        reported = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat(timespec='seconds')
        stale = parse_snapshot(snapshot(reported), negotiated, now())
        self.assertIn('STALE', stale['freshness'])
        self.assertEqual(stale['observed_at_utc'], reported)
        invalid = snapshot()
        invalid['records'][0]['rssi_dbm'] = 'strong'
        with self.assertRaisesRegex(SerialSensorError, 'numeric'):
            parse_snapshot(invalid, negotiated, now())
        invalid = snapshot()
        invalid['records'][0]['rssi_dbm'] = None
        with self.assertRaisesRegex(SerialSensorError, 'neither'):
            parse_snapshot(invalid, negotiated, now())

    def test_real_posix_serial_transport_with_test_only_pty(self):
        master, slave = pty.openpty()
        slave_path = Path(os.ttyname(slave))
        commands = []
        def device():
            buffer = b''
            while len(commands) < 2:
                buffer += os.read(master, 1024)
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    commands.append(line)
                    frame = hello() if len(commands) == 1 else snapshot()
                    os.write(master, json.dumps(frame).encode() + b'\n')
        worker = threading.Thread(target=device, daemon=True)
        worker.start()
        try:
            with patch('openrf.drivers.serial_openrf.eligible_port', return_value=slave_path):
                result = query_port('ttyACM999', ['ttyACM999'], snapshot=True, timeout_s=3)
            worker.join(timeout=2)
            self.assertEqual(commands, [b'OPENRF HELLO 1', b'OPENRF SNAPSHOT 1'])
            self.assertEqual(len(result['records']), 2)
            self.assertEqual(result['source'], 'OPENRF_SERIAL_V1')
            self.assertFalse(result['identity_verified'])
        finally:
            os.close(master)
            os.close(slave)

    def test_atomic_capture_preserves_location_and_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Repository(Path(tmp) / 'openrf.sqlite3')
            earlier = repo.add_observation({'label':'Existing manual observation'})
            session = repo.begin_session('USB serial test survey')
            capture = parse_snapshot(snapshot(), parse_hello(hello()), now())
            capture['interface'] = 'ttyACM2'
            location = browser_location_details({'latitude':38.5,'longitude':-120.5,
                       'accuracy_m':22, 'fix_age_seconds':4})
            saved = repo.store_serial_capture(capture, session['id'], location)
            self.assertEqual(saved['saved_count'], 2)
            self.assertEqual(saved['hardware_id'], 'TEST-ONLY-001')
            self.assertEqual(saved['timestamp_basis'], 'HOST_RETRIEVAL_ONLY')
            rows = [r for r in repo.list_observations() if r['source']=='SENSOR']
            self.assertEqual(len(rows), 2)
            self.assertEqual({r['hardware_id'] for r in rows}, {'TEST-ONLY-001'})
            self.assertEqual({r['location_source'] for r in rows}, {'BROWSER_REPORTED'})
            self.assertEqual(rows[0]['accuracy_m'], 22)
            self.assertIsNotNone(repo.get_observation(earlier['id']))
            corrupted = dict(capture, records=[*capture['records'], {'kind':'WIFI', 'label':'unsupported'}])
            with self.assertRaisesRegex(ValueError, 'Unsupported'):
                repo.store_serial_capture(corrupted, None, browser_location_details(None))
            self.assertEqual(len(repo.captures()), 1)
            # Existing records remain intact across a second repository initialization.
            reopened = Repository(repo.path)
            self.assertEqual(len(reopened.list_observations()), 3)

    def test_zero_result_snapshot_records_capture_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Repository(Path(tmp) / 'zero.sqlite3')
            capture = parse_snapshot(dict(snapshot(), records=[]), parse_hello(hello()), now())
            capture['interface'] = 'ttyUSB0'
            saved = repo.store_serial_capture(capture, None, browser_location_details(None))
            self.assertEqual(saved['saved_count'], 0)
            self.assertEqual(repo.list_observations(), [])

if __name__ == '__main__':
    unittest.main()
