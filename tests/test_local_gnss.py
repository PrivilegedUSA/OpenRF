"""v0.2.35 read-only gpsd GNSS and location privacy contract."""
import json
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch
from openrf.gnss import parse_tpv, read_local_gpsd
from openrf.server import create_server
from openrf.storage import Repository

UTC = timezone.utc


def tpv(now=None, **changes):
    now = now or datetime.now(UTC)
    record = {'class':'TPV','mode':3,'lat':38.49,'lon':-120.63,
              'time':now.isoformat().replace('+00:00', 'Z'),
              'epx':5.0,'epy':12.0,'speed':7.1,'track':90.0,'device':'/dev/ttyACM0'}
    record.update(changes)
    return record


class FakeSocket:
    def __init__(self, data):
        self.data = [json.dumps(x).encode() + b'\r\n' for x in data]
        self.sent = []
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def settimeout(self, timeout): self.timeout = timeout
    def sendall(self, b): self.sent.append(b)
    def recv(self, size): return self.data.pop(0) if self.data else b''


class GnssParsing(unittest.TestCase):
    def test_valid_gnss_fix_preserves_source_utc_age_units_and_accuracy(self):
        now = datetime(2026,11,12,18,0,tzinfo=UTC)
        result = parse_tpv(tpv(now, time=(now-timedelta(seconds=2)).isoformat()),now=now)
        self.assertEqual(result['status'],'fix')
        self.assertEqual(result['source'],'gpsd')
        self.assertEqual(result['source_device'],'ttyACM0')
        self.assertEqual(result['accuracy_m'],13.0)
        self.assertEqual(result['fix_age_s'],2)
        self.assertEqual(result['speed_mps'],7.1)
        self.assertEqual(result['heading_degrees'],90)
        self.assertFalse(result['saved'])

    def test_rejects_stale_bad_time_bad_fix_and_missing_accuracy(self):
        now=datetime(2026,11,12,18,0,tzinfo=UTC)
        for reading in (tpv(now,mode=1),tpv(now,lat=float('nan')),
                        tpv(now,time=(now-timedelta(minutes=2)).isoformat()),
                        tpv(now,time='not utc')):
            with self.subTest(reading=reading):
                self.assertNotEqual(parse_tpv(reading,now=now)['status'],'fix')
        result=parse_tpv(tpv(now,epx=None,epy=None),now=now)
        self.assertEqual(result['status'],'no_accuracy')
        self.assertIsNone(result['accuracy_m'])

    def test_one_local_gpsd_request_no_device_enumeration_or_external_network(self):
        now=datetime.now(UTC)
        fake=FakeSocket([{'class':'VERSION','release':'3.25'},
                         {'class':'POLL','tpv':[tpv(now)],'active':1}])
        def factory(addr,timeout):
            self.assertEqual(addr,('127.0.0.1',2947));self.assertLessEqual(timeout,1.5)
            return fake
        result=read_local_gpsd(socket_factory=factory,now=now)
        self.assertEqual(result['status'],'fix')
        self.assertIn(b'?POLL;',b''.join(fake.sent))
        self.assertIn(b'"enable":false',b''.join(fake.sent))

    def test_unavailable_never_fabricates_position(self):
        result=read_local_gpsd(socket_factory=lambda *a,**k: (_ for _ in ()).throw(ConnectionRefusedError()))
        self.assertEqual(result['status'],'unavailable')
        self.assertNotIn('latitude',result)


class GnssHttp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.server=create_server(Repository(Path(cls.tmp.name)/'test.sqlite3'),port=0)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=3);cls.tmp.cleanup()
    def get(self,headers=None,path='/api/navigation/gnss'):
        conn=HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        conn.request('GET',path,headers={'Host':f'localhost:{self.server.server_port}',**(headers or {})})
        res=conn.getresponse();data=json.loads(res.read());status=res.status;conn.close()
        return status,data
    def test_gnss_consent_guard_no_implicit_position_collection(self):
        with patch('openrf.server.read_local_gpsd',return_value={'status':'fix','latitude':38.4,'longitude':-120.6}) as probe:
            self.assertEqual(self.get()[0],403)
            self.assertEqual(self.get({'X-OpenRF-GNSS-Consent':'navigation-follow','Origin':'https://evil.example'})[0],403)
            self.assertEqual(self.get({'X-OpenRF-GNSS-Consent':'navigation-follow'},'/api/navigation/gnss?foo=bar')[0],400)
            probe.assert_not_called()
            status,data=self.get({'X-OpenRF-GNSS-Consent':'navigation-follow'})
            self.assertEqual(status,200)
            self.assertEqual(data['status'],'fix')
            probe.assert_called_once()


if __name__=='__main__':unittest.main()
