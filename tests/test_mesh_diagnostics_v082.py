"""Read-only USB diagnostic labels must not imply RF testing or port opening."""
import unittest
from unittest.mock import patch
from openrf.mesh import MeshManager


class MeshDiagnosticsTests(unittest.TestCase):
    def test_missing_sdk_and_devices_are_honest(self):
        manager=MeshManager(port_provider=lambda:[],sdk_available=lambda:False)
        with patch('openrf.mesh.os.stat',side_effect=AssertionError('Unexpected device probe')):
            result=manager.status()['diagnostics']
        self.assertEqual(result['sdk'],'MISSING')
        self.assertEqual(result['usb_ports'],[])
        self.assertEqual(result['rf_reachability'],'NOT_TESTED')
        self.assertIsNone(result['firmware_version'])
        self.assertEqual(result['link'],'CLOSED')

    def test_fake_inventory_does_not_claim_access(self):
        manager=MeshManager(port_provider=lambda:['ttyUSB123'],sdk_available=lambda:True)
        result=manager.status()['diagnostics']
        self.assertEqual(result['usb_ports'],[{'port':'/dev/ttyUSB123','access':'NOT_ACCESSIBLE_IN_LINUX'}])
        self.assertEqual(result['sdk'],'AVAILABLE')


if __name__=='__main__':unittest.main()
