import json
from http.client import HTTPConnection
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.parse import urlencode
from openrf.server import create_server
from openrf.storage import Repository

class CoverageImportTests(unittest.TestCase):
    def test_local_upload_validation_and_atomic_replacement(self):
        with tempfile.TemporaryDirectory() as tmp:
            server=create_server(Repository(Path(tmp)/'main.sqlite'),port=0)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            def req(method,path,body=None,origin=None,content_type='application/octet-stream'):
                conn=HTTPConnection('127.0.0.1',server.server_address[1],timeout=10)
                h={'Content-Type':content_type}
                if origin:h['Origin']=origin
                try:
                    conn.request(method,path,body=body,headers=h);r=conn.getresponse();return r.status,json.loads(r.read())
                finally:conn.close()
            params={'carrier':'att','pack':'CA LTE','date':'2025-12-31','technology':'LTE 5/1','environment':'outdoor','confirm':'true'}
            base='/api/cellular/reference'; url=base+'/coverage/import?'+urlencode(params)
            poly=[[[-120,38],[-119,38],[-119,39],[-120,38]]]
            good=json.dumps({'type':'FeatureCollection','features':[{'type':'Feature','geometry':{'type':'Polygon','coordinates':poly},'properties':{}}]}).encode()
            try:
                self.assertEqual(req('POST',url,good,origin='https://example.invalid')[0],403)
                self.assertEqual(req('POST',url.replace('confirm=true','confirm=false'),good)[0],400)
                self.assertEqual(req('POST',url,good,content_type='application/json')[0],415)
                self.assertEqual(req('POST',url.replace('2025-12-31','bad'),good)[0],400)
                code,result=req('POST',url,good);self.assertEqual(code,201);self.assertEqual(result['count'],1)
                self.assertEqual(req('POST',url,b'{"type":"FeatureCollection","features":[]}')[0],400)
                self.assertEqual(req('POST',url,b'{"type":"FeatureCollection","features":[null]}')[0],400)
                view=base+'/view?'+urlencode({'bbox':'-121,37,-118,40','carrier':'att'})
                self.assertEqual(req('GET',view)[1]['coverage'][0]['polygon'],poly)
                self.assertEqual(req('GET',base+'/status')[1]['datasets']['coverage:att:CA LTE']['count'],1)
            finally:server.shutdown();server.server_close();thread.join(3)
