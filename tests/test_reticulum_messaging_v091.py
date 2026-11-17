"""Private Reticulum contacts, opt-in history, and loopback API regressions."""
import json
from http.client import HTTPConnection
from pathlib import Path
import tempfile
import threading
import unittest

from openrf.reticulum_history import ReticulumLocalStore, ContactExistsError, ContactMissingError
from openrf.reticulum_lan import ReticulumManager, ReticulumError
from openrf.server import create_server
from openrf.storage import Repository


ADDRESS = 'a' * 32
OTHER = 'b' * 32
RUN = 'f' * 32


def sample(ident, direction='IN', address=ADDRESS, text='Hello'):
    return {'event_id':ident,'direction':direction,'destination':address,
            'text':text,'utc':'2026-11-17T12:00:00+00:00',
            'status':'RECEIVED_VALID_SIGNATURE' if direction == 'IN' else 'QUEUED_WITH_LXMF_NOT_DELIVERED'}


class ReticulumLocalStoreTests(unittest.TestCase):
    def test_idle_reads_are_private_and_create_no_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'reticulum'
            store=ReticulumLocalStore(root)
            self.assertEqual(store.contacts(),[])
            self.assertFalse(store.history_enabled())
            self.assertEqual(store.messages(),[])
            self.assertEqual(store.history_status()['saved_count'],0)
            self.assertEqual(store.save_events(RUN,[sample(1)]),0)
            self.assertFalse(root.exists())

    def test_contact_validation_and_persistence_independent_of_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'reticulum'
            store=ReticulumLocalStore(root)
            item=store.save_contact(ADDRESS.upper(),'  Sideband Phone  ')
            self.assertEqual(item['address'],ADDRESS)
            self.assertEqual(item['alias'],'Sideband Phone')
            self.assertEqual(store.contacts()[0]['alias'],'Sideband Phone')
            self.assertEqual(ReticulumLocalStore(root).contacts()[0]['alias'],'Sideband Phone')
            self.assertEqual(root.stat().st_mode & 0o777,0o700)
            self.assertEqual(store.path.stat().st_mode & 0o777,0o600)
            for address,alias in (("short","Phone"),(ADDRESS,""),(ADDRESS,"x"*41),(ADDRESS,"a\nname")):
                with self.assertRaises(ValueError):store.save_contact(address,alias)
            self.assertTrue(store.delete_contact(ADDRESS.upper()))
            self.assertFalse(store.delete_contact(ADDRESS))
            self.assertEqual(store.contacts(),[])

    def test_opt_in_history_is_deduplicated_bounded_and_reversible(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=ReticulumLocalStore(Path(tmp)/'reticulum')
            store.save_contact(ADDRESS,'Phone')
            store.set_history(True)
            self.assertTrue(store.history_enabled())
            self.assertEqual(store.save_events(RUN,[sample(1),sample(2,'OUT',OTHER)]),2)
            self.assertEqual(store.save_events(RUN,[sample(1),sample(2,'OUT',OTHER)]),0)
            self.assertEqual([x['direction'] for x in store.messages()],['IN','OUT'])
            self.assertEqual(store.save_events(RUN,[{'event_id':3,'direction':'OUT',
                'destination':OTHER,'text':'not sent','utc':'now','status':'PATH_REQUESTED_NOT_SENT'}]),0)
            self.assertEqual(store.save_events('e'*32,[sample(1)]),1,'Different worker is a distinct event')
            self.assertEqual(store.history_status()['saved_count'],3)
            self.assertEqual(store.clear_messages(),3)
            self.assertEqual(store.messages(),[])
            store.save_events(RUN,[sample(4)])
            self.assertEqual(store.set_history(False)['saved_count'],0)
            self.assertFalse(store.history_enabled())
            self.assertEqual(store.contacts()[0]['alias'],'Phone')
            self.assertEqual(ReticulumLocalStore(store.root).messages(),[])

    def test_same_address_requires_explicit_edit_not_second_save(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=ReticulumLocalStore(Path(tmp)/'reticulum')
            store.save_contact(ADDRESS.upper(),'Phone')
            with self.assertRaises(ContactExistsError):
                store.save_contact(ADDRESS,'Accidental overwrite')
            self.assertEqual(store.contacts()[0]['alias'],'Phone')
            updated=store.save_contact(ADDRESS,'Renamed phone',update=True)
            self.assertEqual(updated['alias'],'Renamed phone')
            self.assertEqual(len(store.contacts()),1)
            with self.assertRaises(ContactMissingError):
                store.save_contact(OTHER,'Unknown contact',update=True)
            with self.assertRaises(ValueError):
                store.save_contact(OTHER,'Unknown contact',update=1)
            self.assertEqual(len(store.contacts()),1)

    def test_manager_keeps_saved_rows_after_stop_without_starting_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            manager=ReticulumManager(Path(tmp)/'reticulum',dependencies_available=lambda:False)
            self.assertEqual(manager.contacts()['contacts'],[])
            self.assertFalse(manager.data_root.exists())
            manager.save_contact({'destination':ADDRESS,'alias':'Local peer'})
            with self.assertRaises(ReticulumError) as existing:
                manager.save_contact({'destination':ADDRESS.upper(),'alias':'Second contact'})
            self.assertEqual(existing.exception.status,409)
            with self.assertRaises(ReticulumError):manager.save_contact({'destination':ADDRESS,'alias':''})
            manager.save_contact({'destination':ADDRESS,'alias':'Edited peer','update':True})
            self.assertEqual(manager.contacts()['contacts'][0]['alias'],'Edited peer')
            with self.assertRaises(ReticulumError) as missing:
                manager.save_contact({'destination':OTHER,'alias':'Missing peer','update':True})
            self.assertEqual(missing.exception.status,404)
            with self.assertRaises(ReticulumError):
                manager.save_contact({'destination':ADDRESS,'alias':'Peer','update':False})
            self.assertTrue(manager.set_history({'enabled':True})['enabled'])
            manager._store.save_events(RUN,[sample(1)])
            self.assertEqual(manager.messages()['messages'][0]['text'],'Hello')
            self.assertEqual(manager.messages()['storage'],'PRIVATE_LOCAL_SQLITE_OPT_IN')
            self.assertEqual(manager.clear_history({})['removed'],1)
            self.assertEqual(manager.messages()['messages'],[])
            self.assertTrue(manager.delete_contact({'destination':ADDRESS})['deleted'])
            for payload in ({'enabled':'true'},{'enabled':True,'extra':1},{},[]):
                with self.subTest(payload=payload),self.assertRaises(ReticulumError):manager.set_history(payload)
            manager.close()

    def test_parent_sync_is_idempotent_and_stop_can_drain_buffer(self):
        with tempfile.TemporaryDirectory() as tmp:
            manager=ReticulumManager(Path(tmp)/'reticulum',dependencies_available=lambda:False)
            manager._worker_id=RUN
            manager.set_history({'enabled':True})
            result={'messages':[sample(1),sample(2,'OUT',OTHER)], 'receive_sequence':1}
            manager._sync_messages(result)
            manager._sync_messages(result)
            self.assertEqual(manager._store.history_status()['saved_count'],2)
            self.assertEqual(manager._store.messages()[1]['status'],'QUEUED_WITH_LXMF_NOT_DELIVERED')

    def test_stop_closes_transport_even_when_last_history_sync_fails(self):
        class FakeProcess:
            def __init__(self):self.alive=True
            def is_alive(self):return self.alive
            def terminate(self):self.alive=False
            def join(self,timeout=None):pass
        class FakePipe:
            def __init__(self):self.actions=[];self.closed=False
            def send(self,command):self.actions.append(command['action'])
            def poll(self,timeout):return False
            def close(self):self.closed=True
        with tempfile.TemporaryDirectory() as tmp:
            manager=ReticulumManager(Path(tmp)/'reticulum',dependencies_available=lambda:False)
            manager._store.set_history(True)
            fake_process, fake_pipe=FakeProcess(),FakePipe()
            manager._process,manager._pipe=fake_process,fake_pipe
            manager._worker_id=RUN
            def broken_command(action,message=None):
                raise ReticulumError('Sync timed out.','reticulum_response_timeout',503)
            manager._command=broken_command
            self.assertTrue(manager.stop({})['worker_stopped'])
            self.assertFalse(fake_process.is_alive())
            self.assertTrue(fake_pipe.closed)
            self.assertIn('stop',fake_pipe.actions)

    def test_http_contacts_history_and_same_origin_protections(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Repository(Path(tmp)/'openrf.sqlite3')
            server=create_server(repo,port=0)
            server.reticulum_manager=ReticulumManager(Path(tmp)/'reticulum',dependencies_available=lambda:False)
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                def request(method,path,payload=None,origin=None):
                    connection=HTTPConnection('127.0.0.1',server.server_address[1],timeout=4)
                    headers={'Host':f'localhost:{server.server_address[1]}'}
                    if payload is not None:headers['Content-Type']='application/json'
                    if origin:headers['Origin']=origin
                    connection.request(method,path,json.dumps(payload) if payload is not None else None,headers)
                    response=connection.getresponse()
                    raw=response.read();status=response.status;connection.close()
                    return status,json.loads(raw) if raw else None
                self.assertEqual(request('GET','/api/reticulum/contacts')[1]['contacts'],[])
                self.assertFalse((Path(tmp)/'reticulum').exists())
                self.assertEqual(request('POST','/api/reticulum/contacts',{'destination':ADDRESS,'alias':'Phone'},
                    origin='https://hostile.example')[0],403)
                self.assertEqual(request('POST','/api/reticulum/contacts',{'destination':ADDRESS,'alias':'Phone'})[0],200)
                self.assertEqual(request('POST','/api/reticulum/contacts',{'destination':ADDRESS.upper(),'alias':'Again'})[0],409)
                self.assertEqual(request('GET','/api/reticulum/contacts')[1]['contacts'][0]['alias'],'Phone')
                self.assertEqual(request('POST','/api/reticulum/contacts',
                    {'destination':ADDRESS,'alias':'Edited phone','update':True})[0],200)
                self.assertEqual(request('GET','/api/reticulum/contacts')[1]['contacts'][0]['alias'],'Edited phone')
                self.assertEqual(request('POST','/api/reticulum/history',{'enabled':True})[1]['enabled'],True)
                self.assertEqual(request('POST','/api/reticulum/contacts/delete',{'destination':ADDRESS})[1]['deleted'],True)
                self.assertEqual(request('POST','/api/reticulum/history/clear',{})[1]['removed'],0)
                self.assertEqual(request('POST','/api/reticulum/history',{'enabled':2})[0],400)
                self.assertEqual(request('GET','/api/reticulum/status')[1]['enabled'],False)
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)


if __name__=='__main__': unittest.main()
