"""v0.2.29: private provider key setup, opt-in, and loopback API checks."""
import io
import json
import os
import stat
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

from openrf.geocoding import (GeocoderError, GeocoderUnavailable,
                             configuration_status, provider, save_maptiler_key, search)
from openrf.server import create_server
from openrf.storage import Repository


class Response(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *args): self.close()


class PrivateConfigTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{'OPENRF_CONFIG_HOME':self.tmp.name,
                                         'OPENRF_PHOTON_PORT':'', 'OPENRF_MAPTILER_KEY':''})
        self.env.start()
    def tearDown(self):
        self.env.stop();self.tmp.cleanup()

    def test_key_is_private_and_only_used_after_consent(self):
        key='sample-key_12345'
        status=save_maptiler_key(key)
        config=Path(self.tmp.name)/'geocoding.json'
        self.assertTrue(config.is_file())
        self.assertEqual(stat.S_IMODE(config.stat().st_mode),0o600)
        self.assertEqual(status['credential_source'],'private_file')
        self.assertEqual(status['provider_when_enabled'],'maptiler-opt-in')
        self.assertNotIn(key,str(status))
        self.assertNotIn(key,str(configuration_status()))
        self.assertIsNone(provider())
        called=[]
        def opener(req,timeout):
            called.append(req.full_url)
            self.assertIn('key=sample-key_12345',req.full_url)
            self.assertIn('country=us',req.full_url)
            self.assertNotIn('proximity',req.full_url)
            return Response(json.dumps({'features':[
                {'place_name':'123 Main Street, Jackson, California, United States',
                 'geometry':{'coordinates':[-120.775,38.348]},
                 'properties':{'country':'United States','housenumber':'123'}}]}).encode())
        with self.assertRaises(GeocoderUnavailable):
            search('123 Main St Jackson',open_connection=opener)
        self.assertEqual(called,[])
        result=search('123 Main St Jackson',open_connection=opener,online_allowed=True)
        self.assertEqual(len(called),1)
        self.assertEqual(result['results'][0]['name'],
                         '123 Main Street, Jackson, California, United States')
        self.assertEqual(result['provider'],'maptiler-opt-in')
        save_maptiler_key('')
        self.assertFalse(config.exists())
        self.assertEqual(provider(online_allowed=True),'photon-public-opt-in')

    def test_invalid_key_does_not_modify_valid_saved_credential(self):
        save_maptiler_key('valid-123456789')
        for key in ('short', 'bad&key', '../bad', 'line\nbreak', 12, 'a'*257):
            with self.subTest(key=key),self.assertRaises(GeocoderError):
                save_maptiler_key(key)
        self.assertEqual(json.loads((Path(self.tmp.name)/'geocoding.json').read_text())['maptiler_key'],'valid-123456789')

    def test_symlinked_credential_file_cannot_be_read_or_overwritten(self):
        external=Path(self.tmp.name)/'target.txt'
        external.write_text('do not modify')
        link=Path(self.tmp.name)/'geocoding.json'
        link.symlink_to(external)
        self.assertFalse(configuration_status()['maptiler_configured'])
        with self.assertRaises(GeocoderError): save_maptiler_key('valid-123456789')
        self.assertEqual(external.read_text(),'do not modify')

    def test_environment_override_is_never_exposed(self):
        with patch.dict(os.environ,{'OPENRF_MAPTILER_KEY':'env-sample-123'}):
            self.assertEqual(configuration_status()['credential_source'],'environment')
            self.assertNotIn('env-sample-123',str(configuration_status()))
            self.assertIsNone(provider())
            self.assertEqual(provider(True),'maptiler-opt-in')


class ConfigHTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{'OPENRF_CONFIG_HOME':self.tmp.name,
                                         'OPENRF_PHOTON_PORT':'','OPENRF_MAPTILER_KEY':''})
        self.env.start()
        self.server=create_server(Repository(Path(self.tmp.name)/'database.sqlite3'),port=0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=2)
        self.env.stop();self.tmp.cleanup()

    def call(self,method,path,body=None,headers=None):
        conn=HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        req={'Host':f'localhost:{self.server.server_port}'}
        if body is not None:
            req['Content-Type']='application/json';body=json.dumps(body)
        req.update(headers or {})
        conn.request(method,path,body=body,headers=req)
        result=conn.getresponse();payload=result.read();status=result.status;conn.close()
        return status,json.loads(payload)

    def test_configuration_requires_same_origin_and_never_echoes_key(self):
        key='test-private-12345678'
        s,b=self.call('POST','/api/navigation/geocoding/config',{'maptiler_key':key},
                      {'Origin':'https://attacker.invalid'})
        self.assertEqual(s,403)
        self.assertFalse((Path(self.tmp.name)/'geocoding.json').exists())
        s,b=self.call('POST','/api/navigation/geocoding/config',{'maptiler_key':key})
        self.assertEqual(s,200)
        self.assertNotIn(key,str(b))
        self.assertEqual(b['provider_when_enabled'],'maptiler-opt-in')
        s,b=self.call('GET','/api/navigation/geocoding/status')
        self.assertEqual(s,200)
        self.assertNotIn(key,str(b))
        self.assertEqual(s,200)
        # Stored credentials do not silently turn on public address requests.
        self.assertEqual(self.call('GET','/api/navigation/geocode?q=Jackson')[0],503)
        self.assertEqual(self.call('GET','/api/navigation/geocode?q=Jackson&online=1')[0],403)
        self.assertEqual(self.call('POST','/api/navigation/geocoding/config',{'url':'https://evil.invalid'})[0],400)
        self.assertEqual(self.call('POST','/api/navigation/geocoding/config',{'maptiler_key':''})[0],200)
        self.assertFalse((Path(self.tmp.name)/'geocoding.json').exists())


if __name__=='__main__':unittest.main()
