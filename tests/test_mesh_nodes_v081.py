"""Node directory and truthful routing receipts without physical RF hardware."""
import tempfile
from pathlib import Path
import unittest
from openrf.mesh import MeshManager, MeshError


class FakeReceiptBridge:
    def __init__(self, port, on_text):
        self.on_text=on_text
    def send_with_receipt(self,text,destination,channel,callback):
        callback(3344,'NONE')  # Race: SDK callback before send returns
        return 3344
    def close(self):pass


class MeshNodeTests(unittest.TestCase):
    def test_local_alias_and_ack_not_read(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'mesh.sqlite3'
            manager=MeshManager(bridge_factory=FakeReceiptBridge,
                port_provider=lambda:['ttyUSB0'],sdk_available=lambda:True,history_path=path)
            self.assertEqual(manager.nodes()['nodes'],[])
            manager.set_alias({'node':'!AABBCCDD','alias':'Hilltop'})
            self.assertEqual(manager.nodes()['nodes'][0]['alias'],'Hilltop')
            self.assertFalse(manager.nodes()['nodes'][0]['online_verified'])
            manager.connect({'port':'/dev/ttyUSB0'})
            manager.send({'text':'hello','destination':'!aabbccdd','channel':0})
            self.assertEqual(manager.messages()['messages'][-1]['delivery'],'ROUTING_ACK_REPORTED_NOT_READ')
            manager.disconnect()
            second=MeshManager(history_path=path)
            self.assertEqual(second.nodes()['nodes'][0]['alias'],'Hilltop')
            second.set_alias({'node':'!aabbccdd','alias':''})
            self.assertEqual(second.nodes()['nodes'],[])
            for payload in ({'node':'!invalid','alias':'A'}, {'node':'!aabbccdd','alias':'A\nB'},
                            {'node':'!aabbccdd','alias':'a'*41}):
                with self.assertRaises(MeshError):second.set_alias(payload)


if __name__=='__main__':unittest.main()
