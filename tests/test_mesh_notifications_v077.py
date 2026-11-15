"""Unread counts derive only from real inbound callbacks (synthetic bridge test)."""
import unittest

from openrf.mesh import MeshManager


class FakeBridge:
    def __init__(self, port, on_text):
        self.on_text = on_text

    def send(self, *_args, **_kwargs):
        return 123

    def close(self):
        pass


class MeshSequenceTests(unittest.TestCase):
    def test_real_receive_sequence_not_increased_by_send_or_history_clear(self):
        mgr = MeshManager(bridge_factory=FakeBridge, port_provider=lambda: ['ttyUSB0'],
                          sdk_available=lambda: True)
        self.assertEqual(mgr.messages()['receive_sequence'], 0)
        mgr.connect({'port': '/dev/ttyUSB0'})
        mgr.send({'text': 'outbound', 'destination': '^all', 'channel': 0})
        self.assertEqual(mgr.messages()['receive_sequence'], 0)
        mgr._bridge.on_text({'decoded': {'text': 'first'}, 'fromId': '!deadbeef'})
        self.assertEqual(mgr.messages()['receive_sequence'], 1)
        mgr._bridge.on_text({'decoded': {'text': ''}, 'fromId': '!deadbeef'})
        self.assertEqual(mgr.messages()['receive_sequence'], 1)
        for index in range(120):
            mgr._bridge.on_text({'decoded': {'text': f'incoming {index}'}, 'fromId': '!deadbeef'})
        self.assertEqual(mgr.messages()['receive_sequence'], 121)
        self.assertEqual(len(mgr.messages()['messages']), 100)
        mgr.clear_history()
        self.assertEqual(mgr.messages()['receive_sequence'], 121)
        mgr.disconnect()
        self.assertEqual(mgr.messages()['receive_sequence'], 121)
        mgr.close()


if __name__ == '__main__':
    unittest.main()
