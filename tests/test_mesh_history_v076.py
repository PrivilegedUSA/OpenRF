"""v0.2.76: explicitly enabled private local history and API validation."""
from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from openrf.mesh import MeshError, MeshManager


class FakeBridge:
    def __init__(self, port, on_text):
        self.on_text = on_text
        self.sent = []

    def send(self, text, destination, channel):
        self.sent.append((text, destination, channel))
        return 123

    def close(self):
        pass


class MeshHistoryTests(unittest.TestCase):
    def manager(self, path):
        return MeshManager(bridge_factory=FakeBridge,
                           port_provider=lambda: ['ttyUSB0'], sdk_available=lambda: True,
                           history_path=path)

    def test_history_off_by_default_opt_in_and_survives_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'private' / 'mesh-history.sqlite3'
            manager = self.manager(path)
            self.assertFalse(manager.status()['history_enabled'])
            self.assertEqual(manager.messages()['storage'], 'MEMORY_ONLY')
            manager.connect({'port': '/dev/ttyUSB0'})
            manager._bridge.on_text({'fromId': '!aabbccdd', 'channel': 2,
                                     'decoded': {'text': 'Before opt-in'}})
            self.assertEqual(len(manager.messages()['messages']), 1)
            manager.disconnect()
            manager.close()
            reloaded = self.manager(path)
            self.assertEqual(reloaded.messages()['messages'], [])
            reloaded.set_history({'enabled': True})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            reloaded.connect({'port': '/dev/ttyUSB0'})
            reloaded._bridge.on_text({'fromId': '!aabbccdd', 'channel': 1,
                                       'decoded': {'text': 'Saved inbound'}})
            reloaded.send({'text': 'Saved outbound', 'destination': '!aabbccdd', 'channel': 1})
            reloaded.disconnect()
            self.assertEqual(len(reloaded.messages()['messages']), 2)
            reloaded.close()
            third = self.manager(path)
            self.assertTrue(third.status()['history_enabled'])
            rows = third.messages()['messages']
            self.assertEqual([r['text'] for r in rows], ['Saved inbound', 'Saved outbound'])
            self.assertEqual(rows[-1]['delivery'], 'SUBMITTED_TO_RADIO_NOT_DELIVERED')
            third.clear_history()
            self.assertEqual(third.messages()['messages'], [])
            third.close()
            fourth = self.manager(path)
            fourth.connect({'port': '/dev/ttyUSB0'})
            fourth._bridge.on_text({'decoded': {'text': 'Delete on opt out'}})
            fourth.set_history({'enabled': False})
            fourth.disconnect()
            fourth.close()
            self.assertFalse(self.manager(path).status()['history_enabled'])
            self.assertEqual(self.manager(path).messages()['messages'], [])

    def test_history_validation_and_no_fake_messages(self):
        with tempfile.TemporaryDirectory() as tmp:
            manager = self.manager(Path(tmp) / 'mesh-history.sqlite3')
            for payload in ({}, {'enabled': 1}, {'enabled': 'true'}, {'enabled': True, 'secret': 'x'}):
                with self.subTest(payload=payload), self.assertRaises(MeshError):
                    manager.set_history(payload)
            manager.set_history({'enabled': True})
            self.assertEqual(manager.messages()['messages'], [])
            manager.close()


if __name__ == '__main__':
    unittest.main()
