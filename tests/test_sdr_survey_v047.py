"""v0.2.47: only opt-in, successfully completed real-tool-path sweeps have observer sites.

The rtl_power executable used below is a DETERMINISTIC TEST STUB, not a receiver.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection
from pathlib import Path
import json
import os
import sys
import tempfile
import threading
import time
import unittest

from openrf.sdr_survey import normalize_capture_fix, capture_sites_geojson
from openrf.sdr_capture import CaptureError, SdrCaptureManager
from openrf.server import create_server
from openrf.storage import Repository

SETTINGS={'start_mhz':88,'stop_mhz':108,'step_khz':100,'duration_seconds':5}
TEST_CSV = b'2026-11-13, 07:00:00, 88000000, 88400000, 100000, 1, -90, -87, -73, -89\n'


def fix(*, age=0, accuracy=17.4):
    return {'latitude':38.532, 'longitude':-120.728, 'accuracy_m':accuracy,
            'fix_age_seconds':age,
            'fix_reported_at_utc':(datetime.now(timezone.utc)-timedelta(seconds=age)).isoformat()}


def stub(path: Path, *, invalid=False, linger=0):
    p=path/'rtl_power_stub'
    sample=(b'no RF\n' if invalid else TEST_CSV).decode()
    p.write_text(f'''#!{sys.executable}
import sys,time
from pathlib import Path
Path(sys.argv[-1]).write_bytes({sample!r}.encode())
time.sleep({linger})
''')
    os.chmod(p,0o700)
    return str(p)


def finish(manager):
    for _ in range(250):
        if not manager.status()['running']:
            return manager.status()['current']
        time.sleep(.02)
    raise AssertionError('Stub capture did not complete')


class SurveyFixValidation(unittest.TestCase):
    def test_no_location_is_normal_and_fresh_fix_is_explicitly_unverified(self):
        self.assertIsNone(normalize_capture_fix(None))
        result=normalize_capture_fix(fix())
        self.assertEqual(result['location_source'], 'BROWSER_REPORTED')
        self.assertFalse(result['gnss_verified'])
        self.assertIn('not_transmitter',result['position_meaning'])
        self.assertIn('attached_at_utc',result)

    def test_rejects_stale_timestamp_inconsistent_age_bad_shape_and_fake_rf(self):
        cases=[{'latitude':38}, {**fix(), 'rssi_dbm':-72},
               {**fix(), 'latitude':True},{**fix(), 'accuracy_m':float('nan')},
               {**fix(), 'longitude':181},{**fix(), 'fix_age_seconds':61},
               {**fix(), 'fix_reported_at_utc':'2026-01-01T00:00:00Z'},
               {**fix(), 'fix_reported_at_utc':datetime.now(timezone.utc).replace(tzinfo=None).isoformat()},
               {**fix(age=32), 'fix_age_seconds':0},
               {**fix(), 'fix_reported_at_utc': 'not a date'},
               [1,2,3]]
        for data in cases:
            with self.subTest(data=data), self.assertRaises(ValueError):
                normalize_capture_fix(data)

    def test_completed_only_and_geojson_has_no_fake_heatmap(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            manager=SdrCaptureManager(root/'captures',lookup=lambda _:stub(root))
            first=manager.start(SETTINGS, survey_location=fix(),session_id=5)
            self.assertEqual(finish(manager)['state'],'COMPLETE')
            assert first['observer_fix']
            self.assertEqual(len(manager.list_sites()),1)
            self.assertEqual(len(manager.list_sites(5)),1)
            self.assertEqual(manager.list_sites(6),[])
            data=capture_sites_geojson(manager.list_sites(),5)
            self.assertEqual(data['features'][0]['geometry']['coordinates'],[-120.728,38.532])
            self.assertEqual(data['features'][0]['properties']['accuracy_m'],17.4)
            self.assertFalse(data['features'][0]['properties']['gnss_verified'])
            self.assertNotIn('rssi_dbm',data['features'][0]['properties'])
            self.assertEqual(data['properties']['session_id'],5)
            plain=manager.start(SETTINGS)
            self.assertEqual(finish(manager)['state'],'COMPLETE')
            self.assertIsNone(plain['observer_fix'])
            self.assertEqual(len(manager.list_sites()),1)
            manager.delete(first['id'])
            self.assertEqual(manager.list_sites(),[])
            manager.close()

    def test_failure_and_stopped_capture_never_appears_as_survey_site(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            manager=SdrCaptureManager(root/'invalid',lookup=lambda _:stub(root,invalid=True))
            first=manager.start(SETTINGS,survey_location=fix())
            self.assertEqual(finish(manager)['state'],'FAILED')
            self.assertEqual(manager.list_sites(),[])
            self.assertEqual(manager.list_saved()[0]['id'],first['id'])
            manager.close()
            manager=SdrCaptureManager(root/'stopped',lookup=lambda _:stub(root,linger=6))
            manager.start(SETTINGS,survey_location=fix())
            manager.stop()
            self.assertEqual(finish(manager)['state'],'STOPPED')
            self.assertEqual(manager.list_sites(),[])
            manager.close()

    def test_no_fake_location_can_be_assigned_as_manager_argument(self):
        with tempfile.TemporaryDirectory() as d:
            m=SdrCaptureManager(Path(d)/'recordings',lookup=lambda _:None)
            for value in ({**fix(),'source':'SENSOR'}, {'latitude':0},True):
                with self.assertRaises(CaptureError) as e:
                    m.start(SETTINGS,survey_location=value)
                self.assertEqual(e.exception.code,'invalid_survey_location')
            with self.assertRaises(CaptureError):m.start(SETTINGS,session_id=True)
            self.assertFalse((Path(d)/'recordings').exists())
            m.close()


class SurveyApi(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.repo=Repository(self.root/'db.sqlite3')
        self.server=create_server(self.repo,port=0)
        self.server.sdr_captures.lookup=lambda _:stub(self.root)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=3)
        self.tmp.cleanup()

    def ask(self,method,path,body=None):
        conn=HTTPConnection('127.0.0.1',self.server.server_port,timeout=6)
        headers={'Host':f'127.0.0.1:{self.server.server_port}'}
        if body is not None:
            headers['Content-Type']='application/json';body=json.dumps(body)
        conn.request(method,path,body,headers)
        res=conn.getresponse();raw=res.read();code=res.status;mime=res.getheader('Content-Type')
        conn.close()
        if mime.startswith('application/json') or mime.startswith('application/geo+json'):
            return code,json.loads(raw)
        return code,raw

    def test_new_endpoints_with_and_without_session_and_reject_non_capture_data(self):
        code,empty=self.ask('GET','/api/sdr/survey/sites')
        self.assertEqual(code,200);self.assertEqual(empty['count'],0)
        session=self.repo.begin_session('SDR survey',receiver_plan='RTL_POWER_FILE')
        for bad in ({**SETTINGS,'survey_location':{**fix(),'frequency_mhz':500}},
                    {**SETTINGS,'session_id':True},
                    {**SETTINGS,'session_id':session['id']+999},
                    {**SETTINGS,'source_device':'injected sensor'},
                    {**SETTINGS,'survey_location':{'latitude':38}},):
            code,err=self.ask('POST','/api/sdr/capture/start',bad)
            self.assertEqual(code,400,err)
        request={**SETTINGS,'survey_location':fix(),'session_id':session['id']}
        code,result=self.ask('POST','/api/sdr/capture/start',request)
        self.assertEqual(code,202,result)
        self.assertEqual(result['capture']['session_id'],session['id'])
        self.assertEqual(finish(self.server.sdr_captures)['state'],'COMPLETE')
        code,sites=self.ask('GET',f"/api/sdr/survey/sites?session_id={session['id']}")
        self.assertEqual(code,200);self.assertEqual(sites['count'],1)
        code,geo=self.ask('GET',f"/api/sdr/survey/sites.geojson?session_id={session['id']}")
        self.assertEqual(code,200)
        self.assertEqual(geo['features'][0]['properties']['capture_id'],result['capture']['id'])
        self.assertTrue(geo['properties']['not_live'])
        for q in ('?session_id=abc','?session_id=0','?session_id=1&session_id=2','?anything=yes'):
            self.assertEqual(self.ask('GET','/api/sdr/survey/sites'+q)[0],400)
        self.repo.stop_session(session['id'])
        self.assertEqual(self.ask('POST','/api/sdr/capture/start',request)[0],400)
        self.assertEqual(self.ask('DELETE',f"/api/sdr/captures/{result['capture']['id']}")[0],200)
        self.assertEqual(self.ask('GET','/api/sdr/survey/sites')[1]['count'],0)


if __name__ == '__main__':unittest.main()
