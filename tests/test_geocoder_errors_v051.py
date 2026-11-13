"""MapTiler HTTP failures distinguish bad request from credentials and quotas."""
import os
import tempfile
import unittest
from urllib.error import HTTPError
from unittest.mock import patch
from openrf.geocoding import GeocoderUnavailable, search, save_maptiler_key

class MapTilerFailureTests(unittest.TestCase):
    def test_failure_category_does_not_expose_secret_key_or_request_url(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {
            'OPENRF_CONFIG_HOME':tmp,'OPENRF_MAPTILER_KEY':'', 'OPENRF_PHOTON_PORT':''}):
            save_maptiler_key('sample-secret-key-abcdef')
            for status,expected in [(400,'invalid/overlong'),(403,'API-key restrictions'),
                                     (429,'rate limit'),(503,'HTTP 503')]:
                with self.subTest(status=status):
                    def fake(request,timeout):
                        raise HTTPError(request.full_url,status,'upstream message',{},None)
                    with self.assertRaises(GeocoderUnavailable) as ctx:
                        search('123 Main St Jackson CA', online_allowed=True, open_connection=fake)
                    message = str(ctx.exception)
                    self.assertIn(expected,message)
                    self.assertNotIn('sample-secret-key-abcdef',message)
                    self.assertNotIn('api.maptiler.com',message)
                    if status==400:
                        self.assertNotIn('Check service availability, API-key restrictions or quota',message)

if __name__ == '__main__':unittest.main()
