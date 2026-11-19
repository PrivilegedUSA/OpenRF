"""Emergency records remain local and do not imply communications delivery."""
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path

from openrf.emergency import EmergencyStore, validate_record
from openrf.emergency_packs import STARTER_PACK, validate_pack
from openrf.emergency_sos import compose_draft
from openrf.emergency_protocol import compose as compose_frame, compose_ack, parse as parse_frame
from openrf.emergency_dashboard import build_dashboard
from openrf.device_survival import report as survival_report
from openrf.emergency_backup import available as backup_available, create as create_backup, inspect as inspect_backup
from openrf.restore import restore as restore_database, exclusive_lock


class EmergencyStoreTests(unittest.TestCase):
    def test_offline_restore_safety_copy_and_live_lock(self):
        if not backup_available():self.skipTest('optional cryptography not installed')
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'private.sqlite3'
            store=EmergencyStore(path)
            store.add_checkin({'person':'Old backup','status':'SAFE','note':'','source':'SELF_REPORTED','location':None})
            encrypted=create_backup(path,'private recovery passphrase')
            store.add_checkin({'person':'Newer live record','status':'NEED_HELP','note':'','source':'SELF_REPORTED','location':None})
            with self.assertRaises(ValueError):
                restore_database(path,encrypted,'private recovery passphrase','wrong confirmation')
            with exclusive_lock(path):
                with self.assertRaisesRegex(ValueError,'running'):
                    restore_database(path,encrypted,'private recovery passphrase','RESTORE OPENRF')
            result=restore_database(path,encrypted,'private recovery passphrase','RESTORE OPENRF')
            self.assertTrue(result['restored'])
            self.assertEqual([x['person'] for x in EmergencyStore(path).checkins()],['Old backup'])
            self.assertEqual([x['person'] for x in EmergencyStore(result['safety_copy']).checkins()],
                             ['Newer live record','Old backup'])

    def test_encrypted_backup_round_trip_tamper_and_non_destructive_preview(self):
        if not backup_available():self.skipTest('optional cryptography not installed')
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'private.sqlite3'
            store=EmergencyStore(path)
            saved=store.add_checkin({'person':'Secret Name','status':'SAFE','note':'Private detail',
                'source':'SELF_REPORTED','location':None})
            original=path.read_bytes()
            encrypted=create_backup(path,'a long unique secret passphrase')
            self.assertNotIn(b'Secret Name',encrypted)
            self.assertIn(b'OpenRF-encrypted-sqlite-v1',encrypted)
            preview=inspect_backup(encrypted,'a long unique secret passphrase')
            self.assertTrue(preview['verified_integrity'])
            self.assertFalse(preview['restored'])
            self.assertEqual(preview['counts']['emergency_checkins'],1)
            self.assertEqual(path.read_bytes(),original)
            with self.assertRaises(ValueError):inspect_backup(encrypted,'wrong password definitely')
            modified=bytearray(encrypted);modified[-9]=ord('A') if modified[-9]!=ord('A') else ord('B')
            with self.assertRaises(ValueError):inspect_backup(bytes(modified),'a long unique secret passphrase')
            with self.assertRaises(ValueError):create_backup(path,'short')
            self.assertEqual(store.checkins()[0]['id'],saved['id'])

    def test_device_survival_diagnostics_and_manual_preflight(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            battery=root/'power'/'BAT0';battery.mkdir(parents=True)
            (battery/'type').write_text('Battery')
            (battery/'capacity').write_text('74')
            (battery/'status').write_text('Discharging')
            power=root/'power'/'AC';power.mkdir()
            (power/'type').write_text('Mains')
            (power/'online').write_text('0')
            store=EmergencyStore(root/'state.sqlite3')
            data=survival_report(store.path,power_root=root/'power')
            self.assertEqual(data['battery']['batteries'][0]['capacity_percent'],74)
            self.assertIsNone(data['battery']['runtime_estimate_minutes'])
            self.assertEqual(data['battery']['external_power'][0]['online'],False)
            self.assertEqual(data['database']['quick_check'],'OK')
            self.assertEqual(data['storage']['state'],'OS_REPORTED')
            from collections import namedtuple
            Disk=namedtuple('Disk','total used free')
            low=survival_report(store.path,power_root=root/'power',
                disk_usage=lambda _:Disk(10*1024**3,10*1024**3-500*1024**2,500*1024**2))
            self.assertEqual(low['storage']['warning_level'],'LOW_SPACE')
            self.assertFalse(data['safe_shutdown_control_available'])
            self.assertEqual(len(store.preflight()),6)
            self.assertTrue(store.set_preflight('radios',True)['confirmed'])
            self.assertTrue(EmergencyStore(root/'state.sqlite3').preflight()[2]['confirmed'])
            self.assertFalse(store.set_preflight('radios',False)['confirmed'])
            with self.assertRaises(ValueError):store.set_preflight('radios','true')
            with self.assertRaises(ValueError):store.set_preflight('shutdown',True)

    def test_dashboard_deduplicates_people_and_marks_stale_reports(self):
        now=datetime(2026,11,19,12,tzinfo=timezone.utc)
        row=lambda person,status,hours,source='MANUAL_SECONDHAND':{
            'person':person,'status':status,'source':source,
            'recorded_utc':(now-timedelta(hours=hours)).isoformat(),
            'latitude':None,'origin_sender':None,'origin_transport':None}
        latest=[row('Alice','SAFE',0),row('alice','NEED_HELP',8),row('Bob','NEED_HELP',25),row('Cara','EVACUATING',7)]
        inbox=[{'state':'PENDING'},{'state':'ACCEPTED'},{'state':'DISCARDED'}]
        outbox=[{'id':1,'transport':'meshtastic','state':'READY_LOCAL_ONLY','group_name':None,'created_utc':now.isoformat()},
                {'id':2,'transport':'reticulum','state':'UNCERTAIN_AFTER_RESTART','group_name':'Family','created_utc':now.isoformat()}]
        dashboard=build_dashboard(latest,inbox,outbox,[{'group_name':'Family'}],
            {'connected':True,'mode':'normal'},{'enabled':False},now=now)
        self.assertEqual(dashboard['people_total'],3)
        self.assertEqual(dashboard['needs_help_reported'],1)
        self.assertEqual(dashboard['stale_or_unknown'],2)
        self.assertEqual(dashboard['people'][0]['person'],'Bob')
        self.assertEqual(dashboard['people'][0]['freshness'],'OLDER_THAN_24H')
        self.assertEqual(dashboard['pending_radio_review'],1)
        self.assertEqual(dashboard['inbox_reviewed'],2)
        self.assertTrue(dashboard['transports']['meshtastic']['local_ready'])
        self.assertFalse(dashboard['transports']['reticulum']['local_ready'])
        self.assertEqual(dashboard['outbox_states']['UNCERTAIN_AFTER_RESTART'],1)
        self.assertNotIn('delivered',dashboard)

    def test_compact_radio_protocol_frame_roundtrip_ack_and_limits(self):
        payload={'person':'Brandon','status':'NEED_HELP','note':'At camp'}
        frame=compose_frame(payload,now=1795080000,message_id='abcdef123456')
        self.assertLessEqual(frame['bytes'],180)
        parsed=parse_frame(frame['text'])
        self.assertEqual(parsed['person_claim'],'Brandon')
        self.assertEqual(parsed['status_claim'],'NEED_HELP')
        self.assertEqual(parsed['message_id'],'abcdef123456')
        self.assertFalse(parsed['person_authenticated'])
        ack=compose_ack(parsed['message_id'])
        self.assertEqual(parse_frame(ack)['kind'],'ACK_CLAIM')
        self.assertFalse(parse_frame(ack)['delivery_verified'])
        self.assertIsNone(parse_frame(frame['text']+'|extra'))
        self.assertIsNone(parse_frame('ORF1|C|bad|0|S|QQ|'))
        with self.assertRaises(ValueError):
            compose_frame({**payload,'note':'x'*160},now=1795080000)
        with self.assertRaises(ValueError):
            compose_ack('wrong')
        with self.assertRaises(ValueError):
            compose_frame({**payload,'person':'A\nB'},now=1795080000)

    def test_radio_inbox_explicit_import_review_and_duplicate_suppression(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'records.sqlite3'
            store=EmergencyStore(path)
            messages=[{'direction':'OUT','node':'!1234abcd','text':'Ignore','received_at_utc':'2026-11-19T10:00:00Z','source':'MESHTASTIC_RADIO'},
                {'direction':'IN','node':'!1234abcd','text':'SAFE at camp GPS 38,-120','received_at_utc':'2026-11-19T10:01:00Z','source':'MESHTASTIC_RADIO'},
                {'direction':'IN','node':'!1234abcd','text':'Spoof','received_at_utc':'2026-11-19T10:02:00Z','source':'DEMO'}]
            self.assertEqual(store.import_radio_candidates('meshtastic',messages),1)
            self.assertEqual(store.import_radio_candidates('meshtastic',messages),0)
            candidate=store.inbox_candidates()[0]
            self.assertEqual(candidate['state'],'PENDING')
            with self.assertRaises(ValueError):
                store.review_radio_candidate(candidate['id'],'accept',{'person':'A','status':'SAFE','note':'ok','location':{}})
            self.assertEqual(store.checkins(),[])
            accepted=store.review_radio_candidate(candidate['id'],'accept',{'person':'A','status':'SAFE','note':'Called to confirm'})
            self.assertFalse(accepted['authenticated_person'])
            saved=store.checkins()[0]
            self.assertEqual(saved['source'],'RADIO_MESSAGE_REVIEWED')
            self.assertIsNone(saved['latitude'])
            self.assertEqual(saved['origin_sender'],'!1234abcd')
            with self.assertRaises(ValueError):
                store.review_radio_candidate(candidate['id'],'accept',{'person':'B','status':'SAFE','note':''})
            self.assertEqual(EmergencyStore(path).inbox_candidates()[0]['state'],'ACCEPTED')
            lxmf={'direction':'IN','destination':'a'*32,'text':'Need help','utc':'2026-11-19T11:00:00Z','status':'RECEIVED_VALID_SIGNATURE'}
            self.assertEqual(store.import_radio_candidates('reticulum',[lxmf]),1)
            self.assertEqual(store.review_radio_candidate(store.inbox_candidates()[0]['id'],'discard',{})['state'],'DISCARDED')
            self.assertEqual(len(store.checkins()),1)

    def test_checkins_distinguish_self_fix_and_secondhand_report(self):
        with tempfile.TemporaryDirectory() as directory:
            store=EmergencyStore(Path(directory)/'records.sqlite3')
            own={'person':'B','status':'SAFE','note':'At camp','source':'SELF_REPORTED',
                 'location':{'latitude':38.5,'longitude':-120.5,'accuracy_m':40,'age_seconds':3}}
            result=store.add_checkin(own)
            self.assertEqual(result['latitude'],38.5)
            self.assertEqual(store.checkins()[0]['source'],'SELF_REPORTED')
            with self.assertRaises(ValueError):
                store.add_checkin({**own,'source':'MANUAL_SECONDHAND'})
            with self.assertRaises(ValueError):
                store.add_checkin({**own,'location':{**own['location'],'age_seconds':100}})
            second=store.add_checkin({'person':'C','status':'NEED_HELP','note':'Reported by neighbor',
                                      'source':'MANUAL_SECONDHAND','location':None})
            self.assertIsNone(second['latitude'])
            self.assertTrue(store.delete_checkin(result['id']))

    def test_team_queue_is_atomic_and_never_sends(self):
        with tempfile.TemporaryDirectory() as directory:
            store=EmergencyStore(Path(directory)/'records.sqlite3')
            draft=store.add({'kind':'sos_draft','title':'Check in','details':'All well'})
            a=store.add_team_member('Family','Handheld A','meshtastic','!1234abcd',0)
            b=store.add_team_member('Family','Handheld B','reticulum','a'*32,None)
            with self.assertRaises(ValueError):
                store.add_team_member('Family','Duplicate','reticulum','a'*32,None)
            with self.assertRaises(ValueError):
                store.queue_team(draft['id'],'Family',[{'member_id':a['id'],'text':'x'*181},
                    {'member_id':b['id'],'text':'Okay'}])
            self.assertEqual(store.outbox(),[])
            result=store.queue_team(draft['id'],'Family',[{'member_id':a['id'],'text':'Okay'},
                {'member_id':b['id'],'text':'Okay'}])
            self.assertEqual(result['queued'],2)
            self.assertFalse(result['sent'])
            self.assertEqual({row['group_name'] for row in store.outbox()},{'Family'})
            self.assertTrue(store.delete_team_member(a['id']))
            self.assertEqual(len(store.outbox()),2)

    def test_outbox_survives_reopen_and_never_auto_retries(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'records.sqlite3'
            store=EmergencyStore(path)
            draft=store.add({'kind':'sos_draft','title':'Test','details':'Need help'})
            entry=store.queue_message(draft['id'],'meshtastic','!1234abcd',0,'Need help')
            self.assertEqual(store.outbox()[0]['state'],'READY_LOCAL_ONLY')
            claimed=store.claim_queued(entry['id'])
            self.assertEqual(claimed['state'],'SENDING')
            self.assertIsNone(store.claim_queued(entry['id']))
            reopened=EmergencyStore(path)
            self.assertEqual(reopened.outbox()[0]['state'],'UNCERTAIN_AFTER_RESTART')
            self.assertIsNone(reopened.claim_queued(entry['id']))
            self.assertTrue(reopened.prepare_queued_retry(entry['id']))
            self.assertEqual(reopened.claim_queued(entry['id'])['state'],'SENDING')
            reopened.finish_queued(entry['id'],'SEND_FAILED_NOT_DELIVERED')
            self.assertTrue(reopened.prepare_queued_retry(entry['id']))
            self.assertTrue(reopened.delete_queued(entry['id']))
            self.assertEqual(reopened.outbox(),[])

    def test_emergency_send_attempts_not_delivery_receipts(self):
        with tempfile.TemporaryDirectory() as directory:
            store=EmergencyStore(Path(directory)/'records.sqlite3')
            draft=store.add({'kind':'sos_draft','title':'Test','details':'Need help'})
            self.assertIsNotNone(store.get_sos_draft(draft['id']))
            result=store.record_send_attempt(draft['id'],'reticulum','a'*32,'PATH_REQUESTED_NOT_SENT')
            self.assertFalse(result['delivered_to_person'])
            self.assertEqual(store.send_attempts(draft['id'])[0]['status'],'PATH_REQUESTED_NOT_SENT')
            with self.assertRaises(ValueError):
                store.record_send_attempt(draft['id'],'reticulum','a'*32,'DELIVERED')
            self.assertTrue(store.delete(draft['id']))
            self.assertEqual(store.send_attempts(draft['id']),[])

    def test_meshtastic_receipt_requires_exact_packet_match(self):
        with tempfile.TemporaryDirectory() as directory:
            store=EmergencyStore(Path(directory)/'records.sqlite3')
            draft=store.add({'kind':'sos_draft','title':'Test','details':'Help'})
            store.record_send_attempt(draft['id'],'meshtastic','!1234abcd',
                'SUBMITTED_TO_RADIO_NOT_DELIVERED',text='Need help',channel=0,packet_id=123)
            receipt={'direction':'OUT','node':'!1234abcd','channel':0,'text':'Different text',
                     'packet_id':123,'delivery':'ROUTING_ACK_REPORTED_NOT_READ'}
            self.assertEqual(store.refresh_mesh_receipts([receipt]),0)
            receipt['text']='Need help'
            self.assertEqual(store.refresh_mesh_receipts([receipt]),1)
            self.assertEqual(store.send_attempts(draft['id'])[0]['status'],'ROUTING_ACK_REPORTED_NOT_READ')
            self.assertEqual(store.refresh_mesh_receipts([receipt]),0)

    def test_sos_location_is_unverified_local_draft(self):
        payload = {'template':'NEED_HELP','recipient':'Family','message':'Near trailhead',
                   'location':{'latitude':38.5,'longitude':-120.6,'accuracy_m':36.2,'age_seconds':4.3}}
        result = compose_draft(payload)
        self.assertEqual(result['kind'],'sos_draft')
        self.assertIn('38.500000, -120.600000',result['details'])
        self.assertIn('NOT independently verified',result['details'])
        self.assertIn('NOT TRANSMITTED',result['details'])
        payload['location']['age_seconds'] = 120
        with self.assertRaises(ValueError):
            compose_draft(payload)
        payload['location'] = None
        self.assertIn('No location attached',compose_draft(payload)['details'])

    def test_local_record_lifecycle(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'records.sqlite3'
            store = EmergencyStore(path)
            record = store.add({'kind': 'checklist', 'title': 'Water', 'details': 'Fill bottles'})
            self.assertEqual(store.list()[0]['completed'], 0)
            self.assertTrue(store.complete(record['id'], True))
            self.assertEqual(EmergencyStore(path).list()[0]['completed'], 1)
            self.assertTrue(store.delete(record['id']))
            self.assertEqual(EmergencyStore(path).list(), [])

    def test_unsent_draft_and_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            store = EmergencyStore(Path(directory) / 'records.sqlite3')
            record = store.add({'kind': 'sos_draft', 'title': 'Family', 'details': 'Need help'})
            self.assertEqual(record['kind'], 'sos_draft')
            self.assertFalse(store.complete(record['id'], True))
            self.assertNotIn('sent', record)
        for invalid in ({'kind': 'other', 'title': 'Oops', 'details': ''},
                        {'kind': 'contact', 'title': '', 'details': ''},
                        {'kind': 'contact', 'title': 'A', 'details': '', 'extra': 1}):
            with self.assertRaises(ValueError):
                validate_record(invalid)

    def test_offline_reference_search_persists_and_escapes_wildcards(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'records.sqlite3'
            store = EmergencyStore(path)
            result = store.add_reference({'title':'Emergency radio % plan','category':'Communications',
                                          'source':'Personal notes, 2026','content':'Check batteries before use'})
            self.assertEqual(len(EmergencyStore(path).search_references('batteries')),1)
            self.assertEqual(len(store.search_references('%')),1)
            self.assertEqual(len(store.search_references('_')),0)
            self.assertEqual(len(store.search_references('RADIO')),1)
            self.assertTrue(store.delete_reference(result['id']))
            self.assertEqual(store.search_references(''),[])
            with self.assertRaises(ValueError):
                store.add_reference({'title':'','category':'X','source':'X','content':'X'})

    def test_starter_pack_atomic_validation_and_no_duplicate_reimport(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'records.sqlite3'
            store = EmergencyStore(path)
            first = store.install_pack(STARTER_PACK)
            self.assertEqual(first['imported'],3)
            self.assertEqual(EmergencyStore(path).install_pack(STARTER_PACK)['already_present'],3)
            self.assertEqual(len(store.search_references('')),3)
            corrupt = {**STARTER_PACK,'entries':[*STARTER_PACK['entries'],{'title':'','category':'x','content':'y'}]}
            with self.assertRaises(ValueError):
                store.install_pack(corrupt)
            self.assertEqual(len(store.search_references('')),3)
        self.assertEqual(validate_pack(STARTER_PACK)['format'],'openrf-emergency-pack-v1')


if __name__ == '__main__':
    unittest.main()
