"""OpenRF v0.2.44 field-plan migration, evidence provenance, local API and reporting."""
from __future__ import annotations
import json
import sqlite3
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from openrf.storage import Repository, normalize_session_plan
from openrf.reports import investigation_report, report_html
from openrf.server import create_server


class FieldPlanRepositoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / 'data.sqlite3'
        self.repo = Repository(self.db)

    def tearDown(self):
        self.tmp.cleanup()

    def test_plan_validation_rejects_fake_receiver_and_unbounded_or_wrong_types(self):
        for payload in ({'receiver_plan':'CONNECTED_RTL_SDR'}, {'receiver_plan':True},
                        {'objective':'a'*501}, {'site_label':'b'*121},
                        {'field_notes':'c'*1001}, {'source_device':'faked hardware'},
                        {'latitude':38.1}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                normalize_session_plan(payload)
        self.assertEqual(normalize_session_plan({})['receiver_plan'],'UNASSIGNED')
        with self.assertRaises(ValueError):
            normalize_session_plan({},partial=True)

    def test_plan_and_counts_evidence_without_scanning_or_automatic_position(self):
        record=self.repo.begin_session('Field test', receiver_plan='BLE_BLUEZ',
            site_label='Survey area north',objective='Compare existing saved readings', field_notes='Cold / windy')
        self.assertEqual(record['receiver_plan'],'BLE_BLUEZ')
        self.assertEqual(record['sensor_observations'],0)
        self.assertEqual(record['positioned_observations'],0)
        self.assertEqual(record['capture_count'],0)
        # A manual mark is not a sensor measurement. Its coordinate is observer location.
        manual=self.repo.add_observation({'kind':'MANUAL','source':'MANUAL','label':'Observer note',
            'latitude':38.5,'longitude':-120.5,'accuracy_m':105,
            'session_id':record['id'],'location_source':'MANUAL_ENTRY'})
        # Trusted-repository test fixture only, NOT created by a browser sensor API.
        observed=self.repo.add_observation({'kind':'BLE','source':'SENSOR','label':'Saved BLE reading',
            'identifier':'aa:bb:cc:dd:ee:ff','source_device':'BlueZ hci0',
            'rssi_dbm':-71,'session_id':record['id']})
        self.assertIsNone(observed['latitude'])
        self.repo.add_observation({'kind':'RF','source':'DEMO','label':'DEMO fixture only',
            'latitude':38.49,'longitude':-120.50,'session_id':record['id']})
        self.assertEqual(manual['source'],'MANUAL')
        result=next(x for x in self.repo.sessions() if x['id']==record['id'])
        self.assertEqual((result['observation_count'],result['manual_observations'],result['sensor_observations'],
                          result['positioned_observations'],result['demo_observations'],result['waypoint_count']), (3,1,1,1,1,0))
        self.assertEqual(result['site_label'],'Survey area north')
        self.assertIsNotNone(result['last_observed_at'])
        changed=self.repo.update_session_plan(record['id'],{'receiver_plan':'USB_SERIAL','field_notes':'Changed planned source'})
        self.assertEqual(changed['receiver_plan'],'USB_SERIAL')
        self.assertEqual(changed['observation_count'],3)
        self.assertEqual(self.repo.get_observation(observed['id'])['source_device'],'BlueZ hci0')
        self.assertEqual(self.repo.get_observation(observed['id'])['rssi_dbm'],-71)
        self.assertTrue(self.repo.stop_session(record['id']))
        with self.assertRaisesRegex(ValueError,'active'):
            self.repo.update_session_plan(record['id'],{'receiver_plan':'MANUAL'})

    def test_reports_preserve_plan_text_escaped_and_privacy_default(self):
        x=self.repo.begin_session('Coast <br>',receiver_plan='WIFI_NM',
                                  site_label='<img src=x onerror=alert(1)>',objective='Survey <entry>')
        snapshot=self.repo.session_report_snapshot(x['id'])
        self.assertEqual(snapshot['session']['receiver_plan'],'WIFI_NM')
        self.assertFalse(snapshot['include_coordinates'])
        report=investigation_report(snapshot)
        self.assertIn('plan, not validated', ' '.join(report['limitations']))
        html=report_html(report).decode()
        self.assertIn('Coast &lt;br&gt;',html)
        self.assertIn('Site label: &lt;img src=x',html)
        self.assertNotIn('<img src=x onerror',html)
        self.assertIn('Planned receiver: WIFI_NM',html)
        self.assertEqual(report['investigation']['objective'],'Survey <entry>')

    def test_additive_migration_does_not_replace_old_session_rows(self):
        self.repo.begin_session('New-only session')
        # Create old-version schema as found in a v0.2.42 installation.
        legacy=Path(self.tmp.name)/'legacy.sqlite3'
        conn=sqlite3.connect(legacy)
        conn.execute('CREATE TABLE sessions(id INTEGER PRIMARY KEY,name TEXT NOT NULL,started_at TEXT NOT NULL,ended_at TEXT,status TEXT NOT NULL)')
        conn.execute("INSERT INTO sessions VALUES(19,'Old case','2026-11-01T00:00:00Z',NULL,'COMPLETED')")
        conn.commit();conn.close()
        migrated=Repository(legacy)
        old=next(s for s in migrated.sessions() if s['id']==19)
        self.assertEqual(old['receiver_plan'],'UNASSIGNED')
        self.assertEqual(old['name'],'Old case')
        self.assertEqual(old['status'],'COMPLETED')
        self.assertEqual(old['observation_count'],0)
        self.assertEqual(old['site_label'],'')
        # Restart migration again; no duplicate columns or data loss.
        self.assertEqual(Repository(legacy).sessions()[0]['id'],19)


class FieldPlanApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.repo=Repository(Path(self.tmp.name)/'openrf.sqlite3')
        self.server=create_server(self.repo,port=0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.port=self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=3)
        self.tmp.cleanup()

    def request(self,method,path,body=None):
        conn=HTTPConnection('127.0.0.1',self.port,timeout=5)
        headers={'Host':f'127.0.0.1:{self.port}'}
        if body is not None:
            headers['Content-Type']='application/json'
            body=json.dumps(body)
        conn.request(method,path,body=body,headers=headers)
        response=conn.getresponse()
        raw=response.read();status=response.status
        conn.close()
        return status,json.loads(raw) if response.getheader('Content-Type','').startswith('application/json') else raw

    def test_session_create_list_update_and_stop(self):
        status,session=self.request('POST','/api/sessions',{'name':'Survey 1','receiver_plan':'WIFI_NM',
            'objective':'Survey real readings','site_label':'Station A','field_notes':'Plan only'})
        self.assertEqual(status,201)
        self.assertEqual(session['receiver_plan'],'WIFI_NM')
        s,records=self.request('GET','/api/sessions')
        self.assertEqual(s,200)
        self.assertEqual(records['sessions'][0]['id'],session['id'])
        self.assertEqual(records['sessions'][0]['observation_count'],0)
        s,res=self.request('POST',f"/api/sessions/{session['id']}/plan",{'receiver_plan':'BLE_BLUEZ'})
        self.assertEqual(s,200)
        self.assertEqual(res['session']['receiver_plan'],'BLE_BLUEZ')
        self.assertEqual(res['session']['objective'],'Survey real readings')
        s,res=self.request('POST',f"/api/sessions/{session['id']}/stop",{})
        self.assertEqual(s,200)
        self.assertTrue(res['stopped'])
        s,res=self.request('POST',f"/api/sessions/{session['id']}/plan",{'site_label':'Alter closed'})
        self.assertEqual(s,400)
        self.assertIn('active',res['error'])

    def test_invalid_mutation_is_rejected_without_creating_hardware_evidence(self):
        for payload in ({'name':'X','receiver_plan':'CONNECTED'},
                        {'name':'X','source':'SENSOR'}, {'name':'X','objective':'z'*501}):
            status,res=self.request('POST','/api/sessions',payload)
            self.assertEqual(status,400,(payload,res))
        self.assertEqual(self.repo.stats()['observations'],0)
        self.assertEqual(self.repo.stats()['captures'],0)
        self.assertEqual(self.repo.stats()['sessions'],0)
