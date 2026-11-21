"""v0.2.149: honest, read-only storage for the filesystem holding OpenRF data."""
import json
import tempfile
import threading
import unittest
from collections import namedtuple
from http.client import HTTPConnection
from pathlib import Path

from openrf.device_survival import storage_status, report
from openrf.server import create_server
from openrf.storage import Repository

Disk=namedtuple('Disk','total used free')


class AppStorageTests(unittest.TestCase):
    def test_storage_reports_real_filesystem_space_with_injected_linux_stats(self):
        gb=1024**3
        with tempfile.TemporaryDirectory() as temp:
            db=Path(temp)/'openrf.sqlite3'
            observed=[]
            result=storage_status(db,disk_usage=lambda path:(observed.append(path) or Disk(10*gb,8*gb,2*gb)))
            self.assertEqual(observed,[db.parent])
            self.assertEqual(result['scope'],'filesystem-containing-openrf-data')
            self.assertTrue(result['read_only'])
            self.assertEqual(result['storage']['free_bytes'],2*gb)
            self.assertEqual(result['storage']['used_bytes'],8*gb)
            self.assertEqual(result['storage']['total_bytes'],10*gb)
            self.assertEqual(result['storage']['percent_free'],20)
            self.assertEqual(result['storage']['warning_level'],'OK')
            self.assertNotIn(str(db.parent),json.dumps(result),'Do not expose full private filesystem paths')
            emergency=report(db,disk_usage=lambda _:Disk(10*gb,8*gb,2*gb))
            self.assertEqual(emergency['storage']['free_bytes'],result['storage']['free_bytes'])

    def test_low_space_and_unavailable_are_not_guessed(self):
        with tempfile.TemporaryDirectory() as temp:
            db=Path(temp)/'db.sqlite3'
            low=storage_status(db,disk_usage=lambda _:Disk(10**10,10**10-100_000_000,100_000_000))
            self.assertEqual(low['storage']['warning_level'],'LOW_SPACE')
            invalid=storage_status(db,disk_usage=lambda _:Disk(0,0,0))
            self.assertEqual(invalid['storage']['state'],'UNAVAILABLE')
            self.assertIsNone(invalid['storage']['free_bytes'])
            missing=storage_status(db,disk_usage=lambda _:(_ for _ in ()).throw(OSError('Unavailable')))
            self.assertEqual(missing['storage']['state'],'UNAVAILABLE')

    def test_storage_endpoint_is_local_and_new_settings_script_is_served(self):
        with tempfile.TemporaryDirectory() as temp:
            server=create_server(Repository(Path(temp)/'db.sqlite3'),port=0)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                port=server.server_address[1]
                def get(path,host=None):
                    conn=HTTPConnection('127.0.0.1',port,timeout=4)
                    conn.request('GET',path,headers={'Host':host or f'localhost:{port}'})
                    response=conn.getresponse();code=response.status;body=response.read();conn.close()
                    return code,body
                code,body=get('/api/device/storage')
                self.assertEqual(code,200)
                data=json.loads(body)
                self.assertTrue(data['read_only'])
                self.assertEqual(data['scope'],'filesystem-containing-openrf-data')
                self.assertEqual(data['storage']['state'],'OS_REPORTED')
                self.assertEqual(get('/api/device/storage?scope=all')[0],400)
                self.assertEqual(get('/api/device/storage',host='untrusted.example')[0],403)
                self.assertEqual(get('/static/app-settings.js')[0],200)
                self.assertIn(b'/static/app-settings.js?v=0.2.165',get('/')[1])
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)


if __name__=='__main__':unittest.main()
