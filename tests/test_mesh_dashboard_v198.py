import unittest
from openrf.mesh_dashboard import meshcore_rows, reticulum_rows

class ConversationProvenance(unittest.TestCase):
    def test_roles(self):
        rows=meshcore_rows([{'public_key': 'a'*64, 'type': 1}, {'public_key': 'b'*64, 'type': 2}, {'public_key': 'c'*64, 'type': 3}])
        self.assertEqual([r['role'] for r in rows], ['Client', 'Repeater', 'Room server'])
    def test_cached_path_is_not_saved_contact(self):
        paths=[dict(address='a'*32, expired=False, hops=2), dict(address='b'*32, expired=False, hops=1)]
        rows=reticulum_rows([dict(address='a'*32, alias='Saved')], paths)
        self.assertEqual([r['saved_contact'] for r in rows], [True, False])
        self.assertTrue(all(r['position'] is None for r in rows))
