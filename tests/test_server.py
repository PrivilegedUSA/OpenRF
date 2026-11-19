import json
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from http.client import HTTPConnection
from pathlib import Path

from openrf.server import create_server
from openrf.storage import Repository


class ApiTests(unittest.TestCase):
    def test_local_imported_trails_and_emergency_controls(self):
        status,html=self.call('GET','/')
        self.assertEqual(status,200)
        self.assertIn(b'id="offline-trail-library"',html)
        self.assertIn(b'id="offline-trail-import-form"',html)
        self.assertEqual(self.call('GET','/static/offline-trails.js')[0],200)
        self.assertEqual(self.call('GET','/api/navigation/trails',headers={'Host':'example.org'})[0],403)
        self.assertEqual(self.call('POST','/api/navigation/trails/import',{'name':'X'},
            headers={'Origin':'http://not-local.example'})[0],403)
        self.assertEqual(self.call('GET','/api/navigation/trails')[1]['trails'],[])
        from tests.test_offline_trails import GPX
        payload={'name':'Test path','attribution':'Self-created test fixture','gpx':GPX}
        self.assertEqual(self.call('POST','/api/navigation/trails/import',
            {**payload,'attribution':''})[0],400)
        code,created=self.call('POST','/api/navigation/trails/import',payload)
        self.assertEqual(code,201)
        ident=created['trail']['id']
        self.assertEqual(created['trail']['point_count'],4)
        self.assertEqual(self.call('GET','/api/navigation/trails')[1]['trails'][0]['id'],ident)
        code,record=self.call('GET',f'/api/navigation/trails/{ident}')
        self.assertEqual(code,200)
        self.assertEqual(len(record['segments']),2)
        self.assertIn('unverified',record['source'].lower())
        self.assertEqual(self.call('GET',f'/api/navigation/trails/{ident}/geojson')[1]
            ['features'][0]['geometry']['type'],'MultiLineString')
        self.assertTrue(self.call('DELETE',f'/api/navigation/trails/{ident}')[1]['deleted'])
        self.assertEqual(self.call('GET',f'/api/navigation/trails/{ident}')[0],404)
        # Check-in flow order and handoff controls; nothing auto-sends.
        html=html.decode('utf-8')
        first=html.index('id="emergency-checkin-note"')
        check=html.index('id="emergency-checkin-draft"')
        location=html.index('id="emergency-checkin-location"')
        button=html.index('id="emergency-checkin-locate"')
        self.assertTrue(first<check<location<button)
        self.assertIn('class="emergency-checkin-draft-choice"',html)
        self.assertIn('class="emergency-handoff-head emergency-outbox-heading"',html)
        self.assertNotIn('id="inbox-nav-item"',html)

    def test_private_breadcrumb_routes_and_emergency_header_shortcut(self):
        status,index=self.call('GET','/')
        self.assertEqual(status,200)
        self.assertIn(b'id="map-breadcrumbs-panel"',index)
        self.assertIn(b'id="header-emergency-shortcut"',index)
        self.assertLess(index.find(b'id="header-emergency-shortcut"'),index.find(b'id="header-messages-menu"'))
        self.assertEqual(self.call('GET','/static/field-breadcrumbs.js')[0],200)
        self.assertEqual(self.call('GET','/api/navigation/breadcrumbs',headers={'Host':'example.com'})[0],403)
        self.assertEqual(self.call('POST','/api/navigation/breadcrumbs',{'label':'Test'},
            headers={'Origin':'https://other.example'})[0],403)
        before=self.call('GET','/api/navigation/breadcrumbs')[1]['sessions']
        self.assertEqual(self.call('POST','/api/navigation/breadcrumbs',{'label':''})[0],400)
        self.assertEqual(self.call('GET','/api/navigation/breadcrumbs')[1]['sessions'],before)
        code,created=self.call('POST','/api/navigation/breadcrumbs',{'label':'API walk'})
        self.assertEqual(code,201)
        ident=created['session']['id']
        self.assertFalse(created['automatic_start'])
        self.assertEqual(self.call('DELETE',f'/api/navigation/breadcrumbs/{ident}')[1]['deleted'],False)
        test_fix={'latitude':38.1234,'longitude':-120.5678,'accuracy_m':9,
            'fix_age_seconds':1,'observed_utc':datetime.now(timezone.utc).isoformat(),
            'source_device':'BROWSER_GEOLOCATION'}
        self.assertEqual(self.call('POST',f'/api/navigation/breadcrumbs/{ident}/points',
            {**test_fix,'accuracy_m':1000})[0],400)
        self.assertEqual(self.call('POST',f'/api/navigation/breadcrumbs/{ident}/points',test_fix)[0],201)
        self.assertEqual(self.call('GET',f'/api/navigation/breadcrumbs/{ident}')[1]['point_count'],1)
        self.assertEqual(self.call('GET',f'/api/navigation/breadcrumbs/{ident}/geojson')[1]
            ['features'][0]['geometry']['coordinates'],[[-120.5678,38.1234]])
        code,gpx=self.call('GET',f'/api/navigation/breadcrumbs/{ident}/gpx')
        self.assertEqual(code,200)
        self.assertIn(b'Browser geolocation history',gpx)
        self.assertEqual(self.call('POST',f'/api/navigation/breadcrumbs/{ident}/stop',{})[1]['stopped'],True)
        self.assertEqual(self.call('POST',f'/api/navigation/breadcrumbs/{ident}/points',test_fix)[0],400)
        self.assertTrue(self.call('DELETE',f'/api/navigation/breadcrumbs/{ident}')[1]['deleted'])
        self.assertEqual(self.call('GET',f'/api/navigation/breadcrumbs/{ident}')[0],404)

    def test_walking_route_api_never_claims_driving_or_camera_comparison(self):
        sample={'type':'ROAD_ROUTE','is_driving_route':False,'travel_mode':'pedestrian',
                'coordinates':[[-120.7,38.4],[-120.699,38.401]],'maneuvers':[],
                'origin':[-120.7,38.4],'destination':[-120.699,38.401],
                'distance_miles':0.1,'duration_seconds':90}
        with patch('openrf.server.local_route',return_value=sample) as router, \
             patch('openrf.server.camera_routes.route_cameras',side_effect=AssertionError('camera comparison must not run')):
            status,result=self.call('POST','/api/navigation/route',{'locations':[
                {'latitude':38.4,'longitude':-120.7},{'latitude':38.401,'longitude':-120.699}],
                'options':{'travel_mode':'pedestrian'}})
        self.assertEqual(status,200)
        self.assertFalse(result['route']['is_driving_route'])
        self.assertIsNone(result['camera_report'])
        self.assertEqual(router.call_args.kwargs['options'],{'travel_mode':'pedestrian'})

    def test_clock_calendar_is_offline_and_recovery_is_cli_only(self):
        status,body=self.call('GET','/')
        self.assertEqual(status,200)
        self.assertIn(b'id="field-clock-button"',body)
        self.assertIn(b'id="field-calendar-grid"',body)
        self.assertEqual(self.call('GET','/static/field-calendar.js')[0],200)
        _,status_data=self.call('GET','/api/emergency/backup/status')
        self.assertTrue(status_data['offline_restore_cli_available'])
        self.assertFalse(status_data['restore_available'])
        self.assertEqual(self.call('POST','/api/emergency/backup/restore',{})[0],404)

    def test_encrypted_backup_api_and_restore_preview_only(self):
        from openrf.emergency_backup import available
        status,readiness=self.call('GET','/api/emergency/backup/status')
        self.assertEqual(status,200)
        self.assertFalse(readiness['restore_available'])
        self.assertEqual(self.call('GET','/static/emergency-backup.js')[0],200)
        if not available():return
        password='a private recovery password 2026'
        status,encrypted=self.call('POST','/api/emergency/backup/create',{'passphrase':password})
        self.assertEqual(status,200)
        self.assertIsInstance(encrypted,bytes)
        self.assertNotIn(password.encode(),encrypted)
        status,preview=self.call('POST','/api/emergency/backup/inspect',
            {'passphrase':password,'bundle':encrypted.decode('ascii')})
        self.assertEqual(status,200)
        self.assertTrue(preview['verified_integrity'])
        self.assertFalse(preview['live_database_modified'])
        self.assertEqual(self.call('POST','/api/emergency/backup/inspect',
            {'passphrase':'wrong-long-password','bundle':encrypted.decode('ascii')})[0],400)
        self.assertEqual(self.call('POST','/api/emergency/backup/create',{'passphrase':'too short'})[0],400)

    def test_survival_diagnostics_and_preflight_api(self):
        status,data=self.call('GET','/api/emergency/device-readiness')
        self.assertEqual(status,200)
        self.assertTrue(data['read_only'])
        self.assertIsNone(data['battery']['runtime_estimate_minutes'])
        self.assertFalse(data['safe_shutdown_control_available'])
        self.assertEqual(self.call('GET','/static/emergency-survival.js')[0],200)
        self.assertEqual(len(self.call('GET','/api/emergency/preflight')[1]['checks']),6)
        status,result=self.call('POST','/api/emergency/preflight',{'key':'maps','checked':True})
        self.assertEqual(status,200)
        self.assertTrue(result['human_attested'])
        self.assertFalse(result['hardware_verified'])
        self.assertTrue(any(x['key']=='maps' and x['confirmed'] for x in
            self.call('GET','/api/emergency/preflight')[1]['checks']))
        self.assertEqual(self.call('POST','/api/emergency/preflight',{'key':'maps','checked':'yes'})[0],400)
        self.assertEqual(self.call('POST','/api/emergency/preflight',{'key':'maps','checked':False})[0],200)
        self.assertEqual(self.call('GET','/api/emergency/device-readiness',headers={'Host':'example.com'})[0],403)

    def test_emergency_dashboard_is_read_only_and_stays_loopback(self):
        status,data=self.call('GET','/api/emergency/dashboard')
        self.assertEqual(status,200)
        self.assertTrue(data['snapshot_only'])
        self.assertIn('outbox_states',data)
        self.assertIn('pending_radio_review',data)
        self.assertIn('transports',data)
        self.assertIn('warning',data)
        self.assertEqual(self.call('GET','/static/emergency-dashboard.js')[0],200)
        self.assertEqual(self.call('GET','/api/emergency/dashboard',headers={'Host':'example.com'})[0],403)

    def test_structured_radio_checkin_prepare_queue_and_ack_are_unsent(self):
        status,response=self.call('POST','/api/emergency/protocol/prepare',
            {'person':'Test member','status':'SAFE','note':'At base'})
        self.assertEqual(status,201)
        self.assertFalse(response['sent'])
        frame=response['frame'];self.assertLessEqual(frame['bytes'],180)
        self.assertEqual(frame['message_id'],frame['text'].split('|')[2])
        ack_status,ack=self.call('POST','/api/emergency/protocol/ack',{'message_id':frame['message_id']})
        self.assertEqual(ack_status,200)
        self.assertEqual(ack['text'],f"ORF1|A|{frame['message_id']}")
        self.assertFalse(ack['sent'])
        self.assertEqual(self.call('POST','/api/emergency/protocol/ack',{'message_id':'bad'})[0],400)
        self.assertEqual(self.call('GET','/static/emergency-protocol.js')[0],200)
        self.assertTrue(any(row['id']==response['draft_id'] for row in
                            self.call('GET','/api/emergency/records')[1]['records']))
        status,member=self.call('POST','/api/emergency/teams',{'group_name':'ProtocolTestGroup',
            'alias':'Test receiver','transport':'meshtastic','destination':'!cafe1234','channel':0})
        self.assertEqual(status,201)
        status,queued=self.call('POST','/api/emergency/teams/queue',{'group_name':'ProtocolTestGroup',
            'draft_id':response['draft_id'],'text':frame['text']})
        self.assertEqual(status,201)
        self.assertEqual(queued['queued'],1)
        self.assertFalse(queued['sent'])
        self.assertTrue(any(row['outbound_text']==frame['text'] and row['state']=='READY_LOCAL_ONLY'
            for row in self.call('GET','/api/emergency/outbox')[1]['entries']))
        self.assertEqual(self.call('DELETE',f"/api/emergency/teams/{member['member']['id']}")[0],200)

    def test_structured_inbox_claim_never_auto_accepts_or_acks(self):
        from openrf.emergency_protocol import compose
        frame=compose({'person':'Not verified','status':'NEED_HELP','note':'Claim'},now=1795080000,
                      message_id='abcdef123456')
        with patch.object(self.server.mesh_manager,'messages',return_value={'messages':[
            {'direction':'IN','source':'MESHTASTIC_RADIO','node':'!deadbeef','channel':0,
             'received_at_utc':'2026-11-19T12:00:00Z','text':frame['text']}]}), \
             patch.object(self.server.reticulum_manager,'messages',return_value={'messages':[]}):
            status,response=self.call('POST','/api/emergency/inbox/scan',{})
        self.assertEqual(status,200)
        self.assertFalse(response['sent'])
        matching=[x for x in self.call('GET','/api/emergency/inbox')[1]['candidates']
                  if x['body']==frame['text']]
        self.assertEqual(len(matching),1)
        self.assertEqual(matching[0]['state'],'PENDING')
        self.assertEqual(matching[0]['protocol']['kind'],'CHECKIN_CLAIM')
        self.assertFalse(matching[0]['protocol']['person_authenticated'])
        self.assertEqual(self.call('POST',f"/api/emergency/inbox/{matching[0]['id']}/discard",{})[0],200)

    def test_emergency_review_inbox_api_is_manual_and_local(self):
        status,result=self.call('GET','/api/emergency/inbox')
        self.assertEqual(status,200)
        self.assertIsInstance(result['candidates'],list)
        with patch.object(self.server.mesh_manager,'messages',return_value={'messages':[
            {'direction':'IN','source':'MESHTASTIC_RADIO','node':'!abcdef01','channel':0,
             'received_at_utc':'2026-11-19T10:00:00Z','text':'At base'}]}), \
             patch.object(self.server.reticulum_manager,'messages',return_value={'messages':[]}):
            status,result=self.call('POST','/api/emergency/inbox/scan',{})
        self.assertEqual(status,200)
        self.assertEqual(result['new_candidates'],1)
        self.assertFalse(result['sent'])
        candidate=self.call('GET','/api/emergency/inbox')[1]['candidates'][0]
        status,result=self.call('POST',f"/api/emergency/inbox/{candidate['id']}/accept",
            {'person':'Test','status':'CHECK_IN','note':'Unverified'})
        self.assertEqual(status,200)
        self.assertFalse(result['authenticated_person'])
        saved=self.call('GET','/api/emergency/checkins')[1]['checkins'][0]
        self.assertEqual(saved['source'],'RADIO_MESSAGE_REVIEWED')
        self.assertIsNone(saved['latitude'])
        self.assertEqual(self.call('GET','/static/emergency-inbox.js')[0],200)

    def test_emergency_checkin_api_local_not_transmitted(self):
        payload={'person':'Test resident','status':'SAFE','note':'At home','source':'SELF_REPORTED',
                 'location':{'latitude':38.5,'longitude':-120.6,'accuracy_m':55,'age_seconds':4}}
        status, response=self.call('POST','/api/emergency/checkins',payload)
        self.assertEqual(status,201)
        self.assertFalse(response['shared'])
        ident=response['checkin']['id']
        status, response=self.call('GET','/api/emergency/checkins')
        self.assertEqual(status,200)
        self.assertTrue(any(row['id']==ident for row in response['checkins']))
        status, response=self.call('GET','/api/emergency/checkins.geojson')
        self.assertEqual(status,200)
        self.assertEqual(response['type'],'FeatureCollection')
        self.assertTrue(any(row['geometry']['coordinates']==[-120.6,38.5] for row in response['features']))
        self.assertEqual(self.call('GET','/static/emergency-checkins.js')[0],200)
        self.assertEqual(self.call('DELETE',f'/api/emergency/checkins/{ident}')[0],200)

    def test_team_directory_and_multi_recipient_queue_api(self):
        _, draft=self.call('POST','/api/emergency/sos/draft',
            {'template':'CHECK_IN','recipient':'Group','message':'Safe','location':None})
        draft_id=draft['record']['id']
        status,a=self.call('POST','/api/emergency/teams',
            {'group_name':'TestTeam','alias':'Meshtastic contact','transport':'meshtastic',
             'destination':'!1234abcd','channel':0})
        self.assertEqual(status,201)
        status,b=self.call('POST','/api/emergency/teams',
            {'group_name':'TestTeam','alias':'LXMF contact','transport':'reticulum',
             'destination':'a'*32,'channel':None})
        self.assertEqual(status,201)
        self.assertEqual(self.call('GET','/api/emergency/teams')[0],200)
        with patch.object(self.server.mesh_manager,'send') as mesh,patch.object(self.server.reticulum_manager,'send') as rns:
            status,result=self.call('POST','/api/emergency/teams/queue',
                {'group_name':'TestTeam','draft_id':draft_id,'text':'I am safe'})
            mesh.assert_not_called();rns.assert_not_called()
        self.assertEqual(status,201)
        self.assertEqual(result['queued'],2)
        self.assertFalse(result['sent'])
        for entry_id in result['outbox_ids']:
            self.assertEqual(self.call('DELETE',f'/api/emergency/outbox/{entry_id}')[0],200)
        self.assertEqual(self.call('DELETE',f'/api/emergency/teams/{a["member"]["id"]}')[0],200)
        self.assertEqual(self.call('DELETE',f'/api/emergency/teams/{b["member"]["id"]}')[0],200)
        self.assertEqual(self.call('DELETE',f'/api/emergency/records/{draft_id}')[0],200)
        self.assertEqual(self.call('GET','/static/emergency-teams.js')[0],200)

    def test_offline_queue_no_send_until_explicit_claim(self):
        _, draft=self.call('POST','/api/emergency/sos/draft',
            {'template':'SAFE','recipient':'Team','message':'Ready','location':None})
        draft_id=draft['record']['id']
        payload={'draft_id':draft_id,'transport':'meshtastic','destination':'!1234abcd',
                 'channel':0,'text':'Status OK'}
        with patch.object(self.server.mesh_manager,'send') as send:
            status,result=self.call('POST','/api/emergency/outbox',payload)
            self.assertEqual(status,201)
            self.assertFalse(result['sent'])
            send.assert_not_called()
        item_id=result['entry']['id']
        status,readiness=self.call('GET','/api/emergency/transport-readiness')
        self.assertEqual(status,200)
        self.assertFalse(readiness['automatic_retry'])
        with patch.object(self.server.mesh_manager,'send',return_value={'submitted_to_radio':True,'packet_id':345}):
            status,reply=self.call('POST',f'/api/emergency/outbox/{item_id}/send',{})
        self.assertEqual(status,202)
        self.assertEqual(reply['attempt']['status'],'SUBMITTED_TO_RADIO_NOT_DELIVERED')
        self.assertEqual(self.call('POST',f'/api/emergency/outbox/{item_id}/send',{})[0],409)
        status,result=self.call('GET','/api/emergency/outbox')
        self.assertEqual(status,200)
        self.assertEqual(result['entries'][0]['state'],'SUBMITTED_TO_RADIO_NOT_DELIVERED')
        self.assertEqual(self.call('DELETE',f'/api/emergency/outbox/{item_id}')[0],200)
        self.assertEqual(self.call('DELETE',f'/api/emergency/records/{draft_id}')[0],200)

    def test_emergency_handoff_manual_transport_and_status(self):
        status, response=self.call('POST','/api/emergency/sos/draft',
            {'template':'NEED_HELP','recipient':'Family','message':'Need help','location':None})
        self.assertEqual(status,201)
        draft_id=response['record']['id']
        packet={'draft_id':draft_id,'transport':'meshtastic','destination':'!1234abcd',
                'channel':0,'text':'SOS need help'}
        with patch.object(self.server.mesh_manager,'send',return_value={'submitted_to_radio':True,'delivered_to_destination':False}):
            status, result=self.call('POST','/api/emergency/sos/handoff',packet)
        self.assertEqual(status,202)
        self.assertFalse(result['delivered_to_person'])
        self.assertEqual(result['attempt']['status'],'SUBMITTED_TO_RADIO_NOT_DELIVERED')
        status, _=self.call('POST','/api/emergency/sos/handoff',{**packet,'destination':'^all'})
        self.assertEqual(status,400)
        status, _=self.call('POST','/api/emergency/sos/handoff',{**packet,'text':'x'*181})
        self.assertEqual(status,400)
        lxmf={**packet,'transport':'reticulum','destination':'a'*32,'channel':None}
        with patch.object(self.server.reticulum_manager,'send',return_value={'status':'PATH_REQUESTED_NOT_SENT'}):
            status, result=self.call('POST','/api/emergency/sos/handoff',lxmf)
        self.assertEqual(status,202)
        self.assertEqual(result['attempt']['status'],'PATH_REQUESTED_NOT_SENT')
        status, attempts=self.call('GET',f'/api/emergency/attempts/{draft_id}')
        self.assertEqual(status,200)
        self.assertEqual(len(attempts['attempts']),2)
        self.assertEqual(self.call('GET','/static/emergency-handoff.js')[0],200)
        self.assertEqual(self.call('DELETE',f'/api/emergency/records/{draft_id}')[0],200)

    def test_emergency_ack_reconciliation_is_not_read_receipt(self):
        _, response=self.call('POST','/api/emergency/sos/draft',
            {'template':'SAFE','recipient':'Team','message':'Ready','location':None})
        draft_id=response['record']['id']
        packet={'draft_id':draft_id,'transport':'meshtastic','destination':'!1234abcd',
                'channel':0,'text':'SAFE and ready'}
        with patch.object(self.server.mesh_manager,'send',return_value={'submitted_to_radio':True,'packet_id':9876}):
            self.assertEqual(self.call('POST','/api/emergency/sos/handoff',packet)[0],202)
        mock_history={'messages':[{'direction':'OUT','node':'!1234abcd','channel':0,
            'text':'SAFE and ready','packet_id':9876,'delivery':'ROUTING_ACK_REPORTED_NOT_READ'}]}
        with patch.object(self.server.mesh_manager,'messages',return_value=mock_history):
            status, response=self.call('GET',f'/api/emergency/attempts/{draft_id}')
        self.assertEqual(status,200)
        self.assertEqual(response['attempts'][0]['status'],'ROUTING_ACK_REPORTED_NOT_READ')
        self.assertEqual(self.call('DELETE',f'/api/emergency/records/{draft_id}')[0],200)

    def test_sos_draft_api_never_transmits(self):
        status, result=self.call('POST','/api/emergency/sos/draft',
            {'template':'SAFE','recipient':'Family','message':'At meeting point',
             'location':{'latitude':38.5,'longitude':-120.7,'accuracy_m':80,'age_seconds':2}})
        self.assertEqual(status,201)
        self.assertFalse(result['transmitted'])
        self.assertIn('Browser-reported location',result['record']['details'])
        record_id=result['record']['id']
        status, _=self.call('POST','/api/emergency/sos/draft',
            {'template':'SAFE','recipient':'Family','message':'At meeting point',
             'location':{'latitude':38.5,'longitude':-120.7,'accuracy_m':80,'age_seconds':999}})
        self.assertEqual(status,400)
        status, _=self.call('GET','/static/emergency-sos.js')
        self.assertEqual(status,200)
        self.assertEqual(self.call('DELETE',f'/api/emergency/records/{record_id}')[0],200)

    def test_emergency_records_api_stays_local(self):
        status, data = self.call('GET', '/api/emergency/records')
        self.assertEqual(status, 200)
        self.assertFalse(data['transmission_available'])
        status, data = self.call('POST', '/api/emergency/records',
                                 {'kind': 'sos_draft', 'title': 'Emergency', 'details': 'Help needed'})
        self.assertEqual(status, 201)
        record_id = data['record']['id']
        self.assertEqual(data['record']['kind'], 'sos_draft')
        status, data = self.call('GET', '/api/emergency/records')
        self.assertEqual(status, 200)
        self.assertTrue(any(item['id'] == record_id for item in data['records']))
        status, _ = self.call('POST', '/api/emergency/checklists/' + str(record_id), {'completed': True})
        self.assertEqual(status, 404)
        status, data = self.call('DELETE', '/api/emergency/records/' + str(record_id))
        self.assertEqual(status, 200)
        self.assertTrue(data['deleted'])

    def test_offline_reference_library_http(self):
        status, data = self.call('POST','/api/emergency/library',
            {'title':'Field manual','category':'Preparedness','source':'Operator, 2026','content':'Store drinking water'})
        self.assertEqual(status,201)
        record_id=data['reference']['id']
        status, data = self.call('GET','/api/emergency/library?q=drinking')
        self.assertEqual(status,200)
        self.assertEqual(data['references'][0]['id'],record_id)
        status, _=self.call('GET','/static/emergency-library.js')
        self.assertEqual(status,200)
        status, data=self.call('DELETE',f'/api/emergency/library/{record_id}')
        self.assertEqual(status,200)
        self.assertTrue(data['deleted'])

    def test_offline_reference_pack_http(self):
        status, pack=self.call('GET','/api/emergency/packs/starter')
        self.assertEqual(status,200)
        self.assertEqual(pack['format'],'openrf-emergency-pack-v1')
        status, data=self.call('POST','/api/emergency/packs/install',pack)
        self.assertEqual(status,200)
        self.assertEqual(data['imported'],3)
        status, data=self.call('POST','/api/emergency/packs/install',pack)
        self.assertEqual(status,200)
        self.assertEqual(data['already_present'],3)

    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.server=create_server(Repository(Path(cls.tmp.name)/'db.sqlite3'), port=0)
        cls.server_thread=threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.port=cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=3)
        cls.tmp.cleanup()

    def call(self, method, path, body=None, headers=None):
        conn=HTTPConnection('127.0.0.1',self.port,timeout=5)
        base={'Host':f'localhost:{self.port}'}
        if body is not None:
            base['Content-Type']='application/json'
            body=json.dumps(body)
        base.update(headers or {})
        conn.request(method,path,body=body,headers=base)
        response=conn.getresponse()
        raw=response.read()
        status=response.status
        conn.close()
        return status, json.loads(raw) if response.getheader('Content-Type','').startswith('application/json') else raw

    def test_health_static_hardware_and_exports(self):
        s,data=self.call('GET','/api/health')
        self.assertEqual(s,200)
        self.assertEqual(data['version'],'0.2.134')
        for path in ('/','/static/app.css','/static/app.js','/static/history-analysis.js','/static/route_guidance.js','/static/spectrum.js','/static/spectrum-analysis.js','/static/sdr-history.js','/api/export.csv','/api/export.geojson'):
            status,_=self.call('GET',path)
            self.assertEqual(status,200,path)
        status,index=self.call('GET','/')
        self.assertEqual(status,200)
        self.assertNotIn(b'id="field-map-toggle"',index)
        self.assertIn(b'id="map-search-toggle"',index)
        self.assertIn(b'aria-controls="map-destination-form"',index)
        s,data=self.call('GET','/api/hardware')
        self.assertEqual(s,200)
        self.assertEqual(len(data['capabilities']),8)
        self.assertTrue(any(c['key'] == 'police_radar' and c['status'] == 'not_implemented' for c in data['capabilities']))

    def test_unified_hardware_manager_endpoint_does_not_fake_rf_capture(self):
        status,report=self.call('GET','/api/hardware/manager')
        self.assertEqual(status,200)
        self.assertEqual(report['kind'],'READ_ONLY_HARDWARE_MANAGER')
        self.assertEqual(report['schema_version'],1)
        self.assertFalse(report['active_continuous_rf_capture'])
        self.assertEqual(report['verified_live_receivers'],0)
        self.assertEqual(len(report['entries']),8)
        self.assertTrue(any(e['key']=='sdr' and e['state']=='offline_analysis_only' for e in report['entries']))
        self.assertTrue(any(e['key']=='radar' and e['state']=='not_implemented' for e in report['entries']))
        self.assertNotIn('serial_number',str(report))

    def test_readiness_endpoint_is_read_only_and_private(self):
        from unittest.mock import patch
        with patch('openrf.server.status_report', return_value={
            'environment':'WSL 2 / Linux', 'serial_ports':['ttyACM0'],
            'serial_port_details':[{'port':'ttyACM0','access':'permission_ok_unverified',
                                    'device_type':'character_device'}],
            'wifi_one_shot':{'possible':False,'interface':None},
            'network_details':[], 'command_availability':{'nmcli':False}
        }):
            status,report=self.call('GET','/api/hardware/readiness')
        self.assertEqual(status,200)
        self.assertFalse(report['active_rf_capture'])
        self.assertEqual(report['schema_version'],1)
        self.assertEqual(report['summary']['usb_serial_ports_visible'],1)
        self.assertNotIn('ttyACM0',str(report))
        self.assertFalse(any(c['status']=='ready' for c in report['checklist']))

    def test_cannot_forge_sensor_source_via_manual_entry(self):
        s,data=self.call('POST','/api/observations', {'kind':'BLE','source':'SENSOR', 'source_device':'HackRF','label':'Unverified manual'})
        self.assertEqual(s,201)
        self.assertEqual(data['source'],'MANUAL')
        self.assertEqual(data['source_device'],'Manual browser entry')

    def test_manual_observation_with_browser_coordinates_retains_unverified_source(self):
        status, data = self.call('POST', '/api/observations', {
            'kind':'INFRASTRUCTURE','label':'Observed location via browser',
            'source':'SENSOR','source_device':'Fake receiver',
            'latitude':'38.486', 'longitude':'-120.623', 'accuracy_m':'105',
            'location_source':'BROWSER_REPORTED', 'fix_age_seconds':'2.1'
        })
        self.assertEqual(status, 201)
        self.assertEqual(data['source'], 'MANUAL')
        self.assertEqual(data['source_device'], 'Manual browser entry')
        self.assertEqual(data['location_source'], 'BROWSER_REPORTED')
        self.assertAlmostEqual(data['fix_age_seconds'],2.1)

    def test_invalid_origin_and_host_rejected(self):
        status,_=self.call('POST','/api/demo/load',{}, {'Origin':'https://attacker.example'})
        self.assertEqual(status,403)
        status,_=self.call('GET','/api/health',headers={'Host':'evil.example'})
        self.assertEqual(status,403)

    def test_session_and_manual_observation(self):
        s,session=self.call('POST','/api/sessions', {'name':'HTTP test session'})
        self.assertEqual(s,201)
        s,item=self.call('POST','/api/observations', {'label':'HTTP record','session_id':session['id']})
        self.assertEqual(s,201)
        s,response=self.call('POST',f"/api/sessions/{session['id']}/stop",{})
        self.assertTrue(response['stopped'])
        s,response=self.call('GET','/api/sessions')
        self.assertEqual(response['sessions'][0]['observation_count'],1)

    def test_wifi_scan_without_interface_does_not_fake_readings(self):
        from unittest.mock import patch
        from openrf.drivers.wifi_nmcli import WifiScanUnavailable
        self.server.wifi_scan_last = float('-inf')
        with patch('openrf.server.scan_once', side_effect=WifiScanUnavailable('No Linux Wi-Fi interface is visible.')):
            status, data = self.call('POST', '/api/wifi/scan', {})
            self.assertEqual(status, 409)
            self.assertIn('No Linux Wi-Fi', data['error'])

    def test_sensor_receipt_save_requires_server_side_real_scan(self):
        from unittest.mock import patch
        scan = {
            'source': 'NETWORKMANAGER_WIFI', 'interface': 'wlan-test',
            'retrieved_at_utc': '2026-11-10T19:01:00+00:00', 'freshness': 'UNVERIFIED',
            'records': [{'ssid':'Test-only network','bssid':'AA:BB:CC:11:22:33',
                         'channel': 6, 'frequency_mhz':2437,'signal_quality_percent':62,'security':'WPA2'}]
        }
        status, data = self.call('GET', '/api/sensors')
        self.assertEqual(status, 200)
        self.assertEqual(data['schema_version'], 2)
        self.assertEqual(data['sensors'][2]['status'], 'unavailable')
        status, _ = self.call('POST', '/api/sensors/networkmanager-wifi/save',
                              {'scan_id':'fake', 'bssid':'AA:BB:CC:11:22:33'})
        self.assertEqual(status, 400)
        self.server.wifi_scan_last = float('-inf')
        with patch('openrf.server.scan_once', return_value=scan):
            status, result = self.call('POST', '/api/wifi/scan', {})
        self.assertEqual(status, 200)
        self.assertIn('scan_id', result)
        self.assertEqual(result['records'][0]['signal_quality_percent'], 62)
        status, saved = self.call('POST', '/api/sensors/networkmanager-wifi/save',
                {'scan_id':result['scan_id'], 'bssid':'AA:BB:CC:11:22:33',
                 'survey_location': {'latitude':38.48, 'longitude':-120.63, 'accuracy_m':25}})
        self.assertEqual(status, 201)
        self.assertEqual(saved['source'], 'SENSOR')
        self.assertEqual(saved['observed_at'], scan['retrieved_at_utc'])
        self.assertIsNone(saved['rssi_dbm'])
        self.assertEqual(saved['longitude'], -120.63)
        status, _ = self.call('POST', '/api/sensors/networkmanager-wifi/save',
                             {'scan_id':result['scan_id'], 'bssid':'AA:BB:CC:11:22:33'})
        self.assertEqual(status, 400)

    def test_usb_api_refuses_browser_sensor_values_and_unlisted_port(self):
        from unittest.mock import patch
        with patch('openrf.server.enumerate_serial_ports', return_value=[]):
            status, data = self.call('POST', '/api/sensors/serial/probe', {'port':'ttyACM0'})
            self.assertEqual(status,409)
            self.assertIn('unavailable', data['error'])
        with patch('openrf.server.enumerate_serial_ports', return_value=['ttyACM0']):
            status, data = self.call('POST', '/api/sensors/serial/snapshot', {
                'port':'ttyACM0','records':[{'kind':'RF','rssi_dbm':-42}]})
            self.assertEqual(status,400)
            self.assertIn('browser', data['error'])

    def test_usb_api_one_shot_captures_only_backend_device_frames(self):
        from unittest.mock import patch
        from openrf.drivers.serial_openrf import parse_hello, parse_snapshot
        from datetime import datetime, timezone
        hello = {'type':'hello','protocol':'openrf.serial.v1','hardware_id':'TEST-SERVER-001',
                 'capabilities':['RF']}
        snapshot = {'type':'snapshot','protocol':'openrf.serial.v1','hardware_id':'TEST-SERVER-001',
                    'records':[{'kind':'RF','identifier':'TEST-ONLY-433', 'label':'Test radio power',
                                'frequency_mhz':433.92,'rssi_dbm':-71}]}
        utc = datetime.now(timezone.utc).isoformat(timespec='seconds')
        sensor_data = parse_snapshot(snapshot, parse_hello(hello), utc)
        sensor_data['interface'] = 'ttyUSB0'
        with patch('openrf.server.enumerate_serial_ports', return_value=['ttyUSB0']), \
                patch('openrf.server.query_port', side_effect=[dict(parse_hello(hello), port='ttyUSB0'),sensor_data]) as mock:
            status, probed = self.call('POST', '/api/sensors/serial/probe', {'port':'ttyUSB0'})
            self.assertEqual(status,200)
            self.assertFalse(probed['identity_verified'])
            status, saved = self.call('POST', '/api/sensors/serial/snapshot', {'port':'ttyUSB0'})
            self.assertEqual(status,201, f'Unexpected USB snapshot response: {saved}')
            self.assertEqual(saved['capture']['saved_count'],1)
            self.assertEqual(saved['snapshot']['records'][0]['rssi_dbm'],-71)
            self.assertEqual(mock.call_count,2)
            status, records = self.call('GET','/api/observations')
            self.assertEqual(status,200)
            self.assertTrue(any(x['source_device'].startswith('OpenRF Serial') for x in records['observations']))

    def test_invalid_observation_rejected(self):
        status,data=self.call('POST','/api/observations',{'label':'invalid GPS','latitude':35})
        self.assertEqual(status,400)
        self.assertIn('together',data['error'])


    def test_local_maps_http_tiles_and_missing_paths(self):
        from test_offline_maps import fixture, PNG
        maps_dir = self.server.map_directory
        maps_dir.mkdir(exist_ok=True)
        fixture(maps_dir,'testcase')
        try:
            status, data = self.call('GET','/api/maps')
            self.assertEqual(status,200)
            self.assertEqual(data['maps'][0]['id'],'testcase')
            self.assertFalse(data['downloads_enabled'])
            status, raw = self.call('GET','/api/maps/testcase/tiles/2/1/1.png')
            self.assertEqual(status,200)
            self.assertEqual(raw,PNG)
            status, _ = self.call('GET','/api/maps/testcase/tiles/2/1/9.png')
            self.assertEqual(status,404)
            status, _ = self.call('GET','/api/maps/../tiles/2/1/1.png')
            self.assertEqual(status,404)
        finally:
            (maps_dir/'testcase.mbtiles').unlink()
