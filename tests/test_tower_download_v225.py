import io
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit
from openrf.cellular_catalog import arcgis, tower_records, TOWER_URL


def fail(code):
    return HTTPError(TOWER_URL,code,'fixture',{},io.BytesIO())

class TowerDownloadTests(unittest.TestCase):
    def test_long_ids_use_post_body_not_url(self):
        ids=','.join(str(100000+i) for i in range(250))
        with patch('openrf.cellular_catalog.urlopen',return_value=io.BytesIO(b'{"features":[]}')) as url:
            self.assertEqual(arcgis({'objectIds':ids}),{'features':[]})
            req=url.call_args.args[0]
            self.assertEqual(req.get_method(),'POST')
            self.assertEqual(req.full_url,TOWER_URL)
            self.assertEqual(parse_qs(req.data.decode())['objectIds'],[ids])
    def test_short_get_compatibility(self):
        with patch('openrf.cellular_catalog.urlopen',side_effect=[fail(405),io.BytesIO(b'{"objectIds":[1]}')]) as url:
            self.assertEqual(arcgis({'returnIdsOnly':'true'}),{'objectIds':[1]})
            req=url.call_args.args[0]
            self.assertEqual(req.get_method(),'GET')
            self.assertEqual(parse_qs(urlsplit(req.full_url).query)['returnIdsOnly'],['true'])
    def test_mid_download_404_switches_to_smaller_batches(self):
        ids=list(range(100000,100650)); calls=[]; progress=[]
        def query(params):
            if params.get('returnIdsOnly'):return {'objectIds':ids}
            batch=list(map(int,params['objectIds'].split(',')));calls.append(len(batch))
            if len(calls)==2:raise fail(404)
            return {'features':[{'attributes':{'FID':i},'geometry':{'x':-120,'y':38}} for i in batch]}
        rows=list(tower_records(lambda **d:progress.append(d),query))
        self.assertEqual([int(r[0]) for r in rows],ids)
        self.assertEqual(calls[:2],[250,250]);self.assertTrue(all(n<=50 for n in calls[2:]))
        self.assertEqual(progress[-1]['completed'],650)
        self.assertEqual(progress[-1]['total'],650)
    def test_genuine_404_does_not_loop(self):
        calls=[]
        def query(params):
            if params.get('returnIdsOnly'):return {'objectIds':list(range(250))}
            calls.append(params);raise fail(404)
        with self.assertRaises(HTTPError):list(tower_records(lambda **_:None,query))
        self.assertEqual(len(calls),2)

if __name__=='__main__':unittest.main()
