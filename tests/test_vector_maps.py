"""Integrated OpenRF Maps v0.1.11 offline resources + safe HTTP endpoints."""
import gzip
import hashlib
import json
import sqlite3
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from openrf import vector_maps
from openrf.server import create_server
from openrf.storage import Repository


class VectorMapResources(unittest.TestCase):
    def test_usgs_online_basemaps_are_explicit_raster_styles(self):
        services={'satellite':'USGSImageryOnly','topographic':'USGSTopo'}
        for choice,service in services.items():
            with self.subTest(choice=choice):
                definition=vector_maps.style(choice)
                self.assertEqual(definition['version'],8)
                self.assertEqual(definition['metadata']['openrf:basemap'],choice)
                self.assertFalse(definition['metadata']['openrf:offline'])
                source=definition['sources']['openrf-usgs-basemap']
                self.assertEqual(source['type'],'raster')
                self.assertEqual(source['tileSize'],256)
                self.assertEqual(source['tiles'],[
                    f'https://basemap.nationalmap.gov/arcgis/rest/services/{service}/MapServer/tile/{{z}}/{{y}}/{{x}}'])
                self.assertIn('USGS',source['attribution'])
                self.assertEqual(definition['layers'][0]['type'],'raster')
                with self.assertRaises(ValueError):vector_maps.style(choice,offline=True)

    def test_approved_styles_exist_and_are_not_rewritten(self):
        for name in ('dark','light'):
            original=json.loads((vector_maps.ROOT/f'openrf-{name}.json').read_text())
            rendered=vector_maps.style(name)
            self.assertEqual(original['metadata']['openrf:palette']['accent'],'#34c9b1')
            self.assertEqual(original['glyphs'], 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf')
            self.assertNotIn('openrf-route', rendered['sources'])
            self.assertNotIn('openrf-observations', [l['id'] for l in rendered['layers']])
            self.assertEqual(rendered['sources']['openmaptiles']['url'],original['sources']['openmaptiles']['url'])
            self.assertEqual(rendered['layers'][0]['id'],'openrf-background')
            offline=vector_maps.style(name,offline=True)
            self.assertEqual(offline['sources']['openmaptiles']['tiles'],['/api/vector/tiles/{z}/{x}/{y}.pbf'])
            self.assertEqual(offline['glyphs'],'/api/vector/fonts/{fontstack}/{range}.pbf')
            self.assertNotIn('https:',json.dumps(offline['sources']))
            self.assertEqual(json.loads((vector_maps.ROOT/f'openrf-{name}.json').read_text()),original)

    def test_real_regional_tiles_and_font_resources(self):
        info=vector_maps.status()
        self.assertTrue(info['ready'])
        self.assertTrue(info['fonts_ready'])
        self.assertGreater(info['tile_count'],1000)
        self.assertEqual(info['bounds'],[-121.25,37.95,-119.7,38.95])
        with vector_maps._read_only(vector_maps._archive()) as con:
            z,x,tmsy=con.execute('SELECT zoom_level,tile_column,tile_row FROM tiles WHERE zoom_level=13 LIMIT 1').fetchone()
        raw, compressed=vector_maps.tile(z,x,(1<<z)-1-tmsy)
        if compressed: self.assertGreater(len(gzip.decompress(raw)),0)
        self.assertGreater(len(vector_maps.font('Noto Sans Regular',0,255)),100)
        for v in ((31,0,0),(2,-1,0),(8,999999,1)):
            with self.assertRaises(ValueError):vector_maps.tile(*v)
        with self.assertRaises(ValueError):vector_maps.font('../private',0,255)
        with self.assertRaises(ValueError):vector_maps.style('foreign',offline=True)

    def test_local_partial_street_completion_never_claims_geocoding(self):
        matches=vector_maps.street_name_suggestions('25005 State')
        self.assertTrue(matches)
        self.assertTrue(all(x['completion'].startswith('25005 ') for x in matches))
        self.assertTrue(all('coordinates' not in x and 'number not verified' in x['label'] for x in matches))
        for invalid in ('','25005','25005 a','; SELECT','25005 X, Pioneer, CA','25005 '+('A'*180)):
            self.assertEqual(vector_maps.street_name_suggestions(invalid),[])


class VectorHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.server=create_server(Repository(Path(cls.temp.name)/'db.sqlite3'),port=0)
        cls.t=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.t.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.t.join(3);cls.temp.cleanup()

    def get(self,path,host=None):
        conn=HTTPConnection('127.0.0.1',self.server.server_port,timeout=10)
        conn.request('GET',path,headers={'Host':host or f'localhost:{self.server.server_port}'})
        response=conn.getresponse();body=response.read()
        result=(response.status,body,dict(response.getheaders()))
        conn.close();return result

    def test_optional_usgs_styles_and_browser_permissions(self):
        for name in ('satellite','topographic'):
            code,body,headers=self.get(f'/api/vector/styles/{name}.json')
            self.assertEqual(code,200)
            self.assertEqual(json.loads(body)['metadata']['openrf:basemap'],name)
            self.assertIn('https://basemap.nationalmap.gov',headers['Content-Security-Policy'])
            self.assertEqual(self.get(f'/api/vector/styles/{name}.json?offline=1')[0],503)
        self.assertEqual(self.get('/api/vector/styles/other.json')[0],404)
        code,script,_=self.get('/static/map-elevation.js?v=0.2.148')
        self.assertEqual(code,200)
        self.assertIn(b'OpenRFMapElevation',script)

    def test_offline_status_styles_glyphs_tiles_and_security(self):
        status,raw,_=self.get('/api/vector/status')
        self.assertEqual(status,200)
        self.assertTrue(json.loads(raw)['ready'])
        for name in ('dark','light'):
            st,raw,_=self.get(f'/api/vector/styles/{name}.json?offline=1')
            self.assertEqual(st,200)
            parsed=json.loads(raw)
            self.assertEqual(parsed['metadata']['openrf:offline'],True)
            self.assertEqual(parsed['sources']['openmaptiles']['minzoom'],0)
        code,glyph,headers=self.get('/api/vector/fonts/Noto%20Sans%20Regular/0-255.pbf')
        self.assertEqual(code,200);self.assertGreater(len(glyph),1000)
        self.assertEqual(headers['Content-Type'],'application/x-protobuf')
        with vector_maps._read_only(vector_maps._archive()) as con:
            z,x,tmsy=con.execute('SELECT zoom_level,tile_column,tile_row FROM tiles WHERE zoom_level=14 LIMIT 1').fetchone()
        code,tile,headers=self.get(f'/api/vector/tiles/{z}/{x}/{(1<<z)-1-tmsy}.pbf')
        self.assertEqual(code,200);self.assertTrue(tile)
        self.assertEqual(headers['Content-Type'],'application/vnd.mapbox-vector-tile')
        if tile[:2]==b'\x1f\x8b':self.assertEqual(headers['Content-Encoding'],'gzip')
        self.assertEqual(self.get('/api/vector/tiles/24/1/1.pbf')[0],404)
        self.assertEqual(self.get('/api/vector/fonts/..%2F..%2Fpasswd/0-255.pbf')[0],404)
        self.assertEqual(self.get('/api/vector/styles/dark.json?offline=foo')[0],400)
        self.assertEqual(self.get('/api/vector/status',host='evil.example')[0],403)
        # This must not have created any RF observations.
        self.assertEqual(json.loads(self.get('/api/observations')[1])['observations'],[])

    def test_street_names_are_an_explicit_non_geocoding_resource(self):
        code,raw,_=self.get('/api/vector/streets?q=25005%20State')
        self.assertEqual(code,200);data=json.loads(raw)
        self.assertFalse(data['geocoded']);self.assertFalse(data['house_numbers_verified'])
        self.assertTrue(data['results'])
        self.assertEqual(self.get('/api/vector/streets?q=25005%20A')[0],200)
        self.assertEqual(self.get('/api/vector/streets?q=foo&bad=bar')[0],400)

if __name__=='__main__':unittest.main()
