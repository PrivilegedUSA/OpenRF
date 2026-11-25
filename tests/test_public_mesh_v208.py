"""Provider-shaped synthetic regression records; no upstream requests or real nodes."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from openrf.public_mesh import PublicMeshDirectory, DirectoryError, normalize
from test_public_mesh_v207 import Response


def advert(key='a', **overrides):
    row = dict(public_key=key*64, adv_name='TEST synthetic', type=2,
               adv_lat=38.125, adv_lon=-120.25, updated_date='2026-01-01T00:00:00Z')
    row.update(overrides)
    return row


class ProviderSchemaTests(unittest.TestCase):
    def test_advertised_decimal_degrees_and_roles(self):
        result = normalize([advert(), advert('b', type=1), advert('c', type=3)])
        self.assertEqual(result['received'], 3)
        self.assertEqual(result['rejected'], 0)
        self.assertEqual([n['role'] for n in result['nodes']], ['Repeater','Client','Room Server'])
        self.assertEqual((result['nodes'][0]['lat'], result['nodes'][0]['lon']), (38.125,-120.25))
        self.assertEqual(result['nodes'][0]['updated'], '2026-01-01T00:00:00Z')

    def test_no_inference_or_fallback_from_missing_advertised_position(self):
        invalid = [advert('b', adv_lat=None, lat=38, lon=-120),
                   advert('c', adv_lon=None), advert('d', adv_lat=38000000),
                   advert('e', adv_lat=True), advert('f', adv_lat=0, adv_lon=0),
                   advert('1', adv_lat=10**500), advert('2', adv_lon=float('nan'))]
        result = normalize([advert(), *invalid])
        self.assertEqual(result['rejected'], len(invalid))
        self.assertEqual(len(result['nodes']), 1)

    def test_download_normalize_cache_reload_and_failed_refresh(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'directory.json'
            store = PublicMeshDirectory(path)
            raw = json.dumps([advert(), advert('b', type=1)]).encode()
            with patch('openrf.public_mesh.build_opener') as opener:
                opener.return_value.open.return_value = Response(raw, len(raw))
                result = store.refresh()
            self.assertEqual(result['cached_count'], 2)
            self.assertEqual(store.download_status()['phase'], 'complete')
            self.assertEqual(PublicMeshDirectory(path).snapshot()['nodes'], result['nodes'])
            original = path.read_bytes()
            store.last_attempt = float('-inf')
            store.fetcher = lambda: [advert(adv_lat=None)]
            with self.assertRaisesRegex(DirectoryError, '1 of 1 rejected'):
                store.refresh()
            self.assertEqual(store.download_status()['phase'], 'failed')
            self.assertEqual(path.read_bytes(), original)
