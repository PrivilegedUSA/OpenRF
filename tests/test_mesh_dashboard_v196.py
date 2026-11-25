import unittest
from openrf.meshcore_radio import _contact_rows
from openrf.mesh_dashboard import meshcore_rows

class MeshCoreInventoryTests(unittest.TestCase):
    def test_reported_position(self):
        key = 'a'*64
        raw = _contact_rows({key: {'adv_name':'Repeater','type':2,'adv_lat':38.5,'adv_lon':-120.5,'last_advert':1700000000}})
        row = meshcore_rows(raw.values())[0]
        self.assertEqual(row['position']['longitude'],-120.5)
        self.assertTrue(row['infrastructure'])
        self.assertEqual(row['role'],'Repeater')
        self.assertEqual(row['advert_timestamp'],1700000000)
        self.assertIsNone(row['last_heard'])
        self.assertIsNone(row['position']['timestamp'])
    def test_invalid_positions(self):
        for lat,lon in [(0,0),(91,12),(float('nan'),12),(True,12),(None,12)]:
            raw=_contact_rows({'b'*64:{'adv_lat':lat,'adv_lon':lon,'last_advert':-1}})
            row=meshcore_rows(raw.values())[0]
            self.assertIsNone(row['position'])
            self.assertIsNone(row['advert_timestamp'])
