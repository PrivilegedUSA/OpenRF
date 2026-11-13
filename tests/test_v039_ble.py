"""v0.2.39 BLE-only BlueZ discovery, provenance, privacy, and HTTP tests."""
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from openrf.drivers.ble_bluez import scan_once, parse_le_scan, BleScanUnavailable
from openrf.sensor_connections import BleScanReceiptStore, verified_ble_observation
from openrf.storage import Repository

SAMPLE = '''Discovery started
[NEW] Device AA:BB:CC:12:34:56 Hello <LE>
[CHG] Device AA:BB:CC:12:34:56 RSSI: -71
[NEW] Device DD:EE:FF:33:44:55
[CHG] Device DD:EE:FF:33:44:55 Name: Example Sensor
[CHG] Device AA:BB:CC:12:34:56 ManufacturerData Key: 0x004c
[DEL] Device AA:BB:CC:12:34:56
'''
SCAN = {'source':'BLUEZ_BLE','controller':'hci0','retrieved_at_utc':'2026-11-12T22:40:00+00:00',
        'freshness':'UNVERIFIED PER-DEVICE','records':parse_le_scan(SAMPLE)}

class BleDriverTests(unittest.TestCase):
    def test_only_events_are_parsed_not_del_and_no_guess_frequency(self):
        records = parse_le_scan(SAMPLE)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]['name'], 'Hello <LE>')
        self.assertEqual(records[0]['rssi_dbm'], -71)
        self.assertIsNone(records[1]['rssi_dbm'])
        self.assertEqual(records[1]['name'], 'Example Sensor')
        self.assertNotIn('frequency_mhz', records[0])
        self.assertIn('randomized', records[0]['address_type'])
        self.assertEqual(parse_le_scan('Device AA:BB:CC:12:34:56 stored from yesterday'), [])

    def test_no_controller_never_uses_scan_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            calls = []
            def fake_run(*args,**kw): calls.append(args);raise AssertionError('Should not call bluetoothctl')
            with self.assertRaisesRegex(BleScanUnavailable, 'No Linux Bluetooth controller'):
                scan_once(root=Path(tmp),run=fake_run,which=lambda _: '/usr/bin/bluetoothctl')
            self.assertFalse(calls)

    def test_bounded_explicit_le_only_command_and_timestamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'hci0').mkdir()
            commands = []
            def fake_run(args,**kwargs):
                commands.append((args,kwargs))
                if args[-1]=='list': return subprocess.CompletedProcess(args,0,'Controller AA:BB:CC:DD:EE:FF','')
                return subprocess.CompletedProcess(args,0,SAMPLE,'')
            result = scan_once(root=root, run=fake_run, which=lambda x:'/usr/bin/bluetoothctl')
            self.assertEqual(result['source'],'BLUEZ_BLE')
            self.assertEqual(len(result['records']),2)
            self.assertEqual(commands[-1][0], ['/usr/bin/bluetoothctl','--timeout','8','scan','le'])
            self.assertLessEqual(commands[-1][1]['timeout'],14)
            self.assertFalse(commands[-1][1]['check'])
            self.assertNotIn('AA:BB:CC:DD:EE:FF',str(result)) # Controller MAC is never exposed
            self.assertNotIn('latitude',result)

    def test_failure_never_returns_cached_devices_as_current(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'hci0').mkdir()
            def run(args, **kwargs):
                return subprocess.CompletedProcess(args,0,'Controller AA:BB:CC:DD:EE:FF' if args[-1]=='list' else '[NEW] Device AA:BB:CC:12:34:56 old cached', '')
            with self.assertRaisesRegex(BleScanUnavailable, 'did not confirm'):
                scan_once(root=root,run=run,which=lambda _: '/usr/bin/bluetoothctl')
            def failed(args, **kwargs):
                return subprocess.CompletedProcess(args,0,'Controller list' if args[-1]=='list' else 'Failed to start discovery: org.bluez.Error.Failed', '')
            with self.assertRaises(BleScanUnavailable):
                scan_once(root=root,run=failed,which=lambda _: '/usr/bin/bluetoothctl')

    def test_save_receipt_requires_real_selection_and_keeps_source_and_quality(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Repository(Path(tmp)/'private.sqlite3')
            receipts=BleScanReceiptStore()
            receipt=receipts.remember(SCAN)
            self.assertEqual(len(repo.list_observations()),0)
            with self.assertRaisesRegex(ValueError,'not observed'):
                receipts.take(receipt['scan_id'],'00:00:00:00:00:00',lambda *_:None)
            with self.assertRaisesRegex(ValueError,'not recognized'):
                receipts.take('forged','AA:BB:CC:12:34:56',lambda *_:None)
            def save(scan, record):
                entry, time=verified_ble_observation(scan,record,None,None)
                return repo.add_observation(entry,observed_at_utc=time)
            item=receipts.take(receipt['scan_id'],'AA:BB:CC:12:34:56',save)
            self.assertEqual(item['kind'],'BLE')
            self.assertEqual(item['source'],'SENSOR')
            self.assertEqual(item['rssi_dbm'],-71)
            self.assertIsNone(item['frequency_mhz'])
            self.assertIsNone(item['latitude'])
            self.assertEqual(item['source_device'],'Linux BlueZ / hci0')
            self.assertIn('randomized',item['notes'])
            with self.assertRaisesRegex(ValueError,'already saved'):
                receipts.take(receipt['scan_id'],'AA:BB:CC:12:34:56',save)

    def test_expired_receipt_rejected_and_location_is_observer_only(self):
        store=BleScanReceiptStore(10)
        receipt=store.remember(SCAN)
        with patch('openrf.sensor_connections.time.monotonic',return_value=store._current[1]+11):
            with self.assertRaisesRegex(ValueError,'expired'):
                store.take(receipt['scan_id'],'AA:BB:CC:12:34:56',lambda *_:None)
        item,_=verified_ble_observation(SCAN,SCAN['records'][0],{'latitude':38.4,'longitude':-120.6,'accuracy_m':85,'fix_age_seconds':5},None)
        self.assertEqual(item['latitude'],38.4)
        self.assertIn('OBSERVER position',item['notes'])

class BleHTTPTests(unittest.TestCase):
    def setUp(self):
        from openrf.server import create_server
        import threading
        self.tmp=tempfile.TemporaryDirectory()
        self.repo=Repository(Path(self.tmp.name)/'rf.sqlite3')
        self.server=create_server(self.repo,0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join(3);self.tmp.cleanup()

    def call(self,path,body):
        import urllib.request, urllib.error, json
        url=f'http://127.0.0.1:{self.server.server_port}{path}'
        req=urllib.request.Request(url,method='POST',headers={'Content-Type':'application/json'},data=json.dumps(body).encode())
        try: obj=urllib.request.urlopen(req,timeout=5)
        except urllib.error.HTTPError as exc: obj=exc
        with obj:
            return obj.status,json.loads(obj.read())

    def test_no_scan_on_save_and_no_unverified_browser_data(self):
        status,res=self.call('/api/sensors/linux-ble/save',{'scan_id':'fake','address':'AA:BB:CC:12:34:56'})
        self.assertEqual(status,400)
        self.assertEqual(len(self.repo.list_observations()),0)
        self.server.ble_scan_last=float('-inf')
        with patch('openrf.server.ble_scan_once',return_value=SCAN):
            status,res=self.call('/api/ble/scan',{})
        self.assertEqual(status,200)
        self.assertEqual(len(self.repo.list_observations()),0)
        self.assertIn('scan_id',res)
        status,bad=self.call('/api/sensors/linux-ble/save',{
            'scan_id':res['scan_id'],'address':'AA:BB:CC:12:34:56','rssi_dbm':200})
        self.assertEqual(status,400)
        status,good=self.call('/api/sensors/linux-ble/save',{'scan_id':res['scan_id'],'address':'AA:BB:CC:12:34:56'})
        self.assertEqual(status,201)
        self.assertEqual(good['rssi_dbm'],-71)
        self.assertEqual(good['source'],'SENSOR')
        status,bad=self.call('/api/sensors/linux-ble/save',{'scan_id':res['scan_id'],'address':'AA:BB:CC:12:34:56'})
        self.assertEqual(status,400)

    def test_unavailable_and_scan_rate_limit_and_no_auto_save(self):
        self.server.ble_scan_last=float('-inf')
        with patch('openrf.server.ble_scan_once',side_effect=BleScanUnavailable('No Linux controller','no_controller')):
            status,res=self.call('/api/ble/scan',{})
        self.assertEqual(status,409)
        self.assertEqual(res['error_code'],'no_controller')
        status,res=self.call('/api/ble/scan',{})
        self.assertEqual(status,429)
        self.assertEqual(self.repo.list_observations(),[])

if __name__=='__main__': unittest.main()
