import tempfile, unittest, threading, io, csv
from pathlib import Path
from unittest.mock import patch
from openrf import national_traffic as t, camera_catalog as c, national_alpr as a
from openrf.storage import Repository


def fixture(n=120):
    out=io.StringIO(); w=csv.writer(out);w.writerow(['id','latitude','longitude','name','type','maxspeed','unit','country_code','source'])
    for i in range(n):w.writerow([i+1,38.5,-121.4,'camera','red_light' if i%3==0 else 'fixed','','mph','US','OSM'])
    return out.getvalue().encode()

class TrafficTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.repo=Repository(Path(self.tmp.name)/'db.sqlite3')
    def tearDown(self):self.tmp.cleanup()
    def test_offline_and_atomic(self):
        c.add_manual(self.repo,dict(type='ALPR',label='Local',latitude=38.5,longitude=-121.4,source='local'))
        self.assertEqual(t.ingest(self.repo,fixture()),{'SPEED':80,'RED_LIGHT':40})
        self.assertEqual(len(c.list_sites(self.repo,[-122,38,-121,39],types=['SPEED'])['sites']),80)
        self.assertEqual(len(c.list_sites(self.repo,[-122,38,-121,39])['sites']),121)
        self.assertEqual(t.status(Repository(self.repo.path))['red_light_count'],40)
        for raw in (b'<html>error</html>',fixture(5),fixture().replace(b',US,',b',CA,'),fixture().replace(b',fixed,',b',unknown,'),fixture()[:-9]):
            with self.assertRaises((ValueError,csv.Error)):t.ingest(self.repo,raw)
            self.assertEqual(t.status(self.repo)['speed_count'],80)
        self.assertEqual(len(c.list_sites(self.repo,[-122,38,-121,39],types=['ALPR'])['sites']),1)
    def test_dedup_and_removed(self):
        t.ingest(self.repo,fixture())
        with self.repo._lock,self.repo._connect() as db:
            row=db.execute('SELECT * FROM national_traffic_sites WHERE source_id=?',('osm-enforcement:RED_LIGHT:flockhopper-osm:node/1',)).fetchone()
            db.execute('INSERT INTO camera_sites(type,state,label,latitude,longitude,direction,notes,source,source_url,source_id,updated_utc) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(row['type'],'REMOVED',row['label'],row['latitude'],row['longitude'],'','','local','',row['source_id'],row['updated_utc']))
        self.assertEqual(len(c.list_sites(self.repo,[-122,38,-121,39],types=['RED_LIGHT'])['sites']),39)
    def test_job_and_truncated_response(self):
        raw=fixture();manager=t.UpdateManager(self.repo)
        class Reply(io.BytesIO):
            def geturl(self):return t.URL
        def run(data,declared):
            reply=Reply(data);reply.headers={'Content-Length':str(declared)}
            with patch.object(t.urllib.request,'urlopen',return_value=reply) as request:
                manager.start();manager.thread.join(3)
                self.assertEqual(request.call_args.args[0].full_url,t.URL)
            return manager.status()
        result=run(raw,len(raw));self.assertEqual(result['phase'],'ready');self.assertEqual(result['downloaded_bytes'],len(raw))
        self.assertEqual(run(raw[:-1],len(raw))['phase'],'failed');self.assertEqual(t.status(self.repo)['speed_count'],80)

    def test_combined_http_starts_both_even_if_alpr_fails(self):
        from http.client import HTTPConnection
        from openrf.server import create_server
        import json
        server=create_server(self.repo,port=0)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        def request(method,path,body=None):
            conn=HTTPConnection('127.0.0.1',server.server_port,timeout=10)
            try:
                conn.request(method,path,json.dumps(body) if body is not None else None,headers={'Host':f'localhost:{server.server_port}','Content-Type':'application/json'})
                response=conn.getresponse();return response.status,json.loads(response.read())
            finally:conn.close()
        try:
            raw=fixture()
            class Reply(io.BytesIO):
                def geturl(self):return t.URL
            reply=Reply(raw);reply.headers={'Content-Length':str(len(raw))}
            with patch.object(server.national_alpr_manager,'start',side_effect=OSError('simulated ALPR error')),patch.object(t.urllib.request,'urlopen',return_value=reply):
                code,result=request('POST','/api/cameras/nationwide/update',{})
                self.assertEqual(code,202);self.assertEqual(result['alpr']['phase'],'failed')
                server.national_traffic_manager.thread.join(3)
            code,result=request('GET','/api/cameras/traffic-snapshot');self.assertEqual(code,200);self.assertEqual(result['snapshot']['speed_count'],80)
            self.assertEqual(request('POST','/api/cameras/nationwide/update',{'bounds':[]})[0],400)
        finally:
            server.shutdown();server.server_close();worker.join(5)
