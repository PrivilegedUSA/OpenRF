"""Simulated LXMF callback and persistent receipt handling; no radio required."""
from collections import deque
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
import unittest

from openrf.reticulum_history import ReticulumLocalStore
from openrf.reticulum_lan import _update_outbound_status


class ReticulumDeliveryTests(unittest.TestCase):
    worker = 'a' * 32
    peer = 'b' * 32

    def event(self, event_id=1, status='QUEUED_WITH_LXMF_NOT_DELIVERED', direction='OUT'):
        return dict(event_id=event_id, direction=direction, destination=self.peer,
                    text='Hello', utc='2026-11-21T10:30:00+00:00', status=status)

    def test_callback_updates_only_the_exact_pending_outbound(self):
        inbox = deque([self.event(), self.event(2), self.event(3,
                       status='RECEIVED_VALID_SIGNATURE', direction='IN')], maxlen=100)
        lock = Lock()
        self.assertTrue(_update_outbound_status(inbox, lock, 2, 'DELIVERED_LXMF'))
        self.assertEqual(inbox[0]['status'], 'QUEUED_WITH_LXMF_NOT_DELIVERED')
        self.assertEqual(inbox[1]['status'], 'DELIVERED_LXMF')
        self.assertFalse(_update_outbound_status(inbox, lock, 2, 'FAILED_LXMF'),
                         'A stale failure must not replace a confirmed receipt')
        self.assertFalse(_update_outbound_status(inbox, lock, 3, 'DELIVERED_LXMF'),
                         'Incoming reports are never rewritten as delivery receipts')
        self.assertFalse(_update_outbound_status(inbox, lock, 1, 'SENT'),
                         'An unsupported status cannot be mistaken for delivery')
        self.assertTrue(_update_outbound_status(inbox, lock, 1, 'FAILED_LXMF'))

    def test_history_preserves_receipts_and_rejects_stale_queue(self):
        with TemporaryDirectory() as temp:
            store = ReticulumLocalStore(Path(temp) / 'reticulum')
            store.set_history(True)
            self.assertEqual(store.save_events(self.worker, [self.event(1), self.event(2)]), 2)
            self.assertEqual(store.save_events(self.worker, [self.event(1, 'DELIVERED_LXMF'),
                                                             self.event(2, 'FAILED_LXMF')]), 0)
            messages = store.messages()
            self.assertEqual([row['event_id'] for row in messages], [1, 2])
            self.assertEqual([row['status'] for row in messages],
                             ['DELIVERED_LXMF', 'FAILED_LXMF'])
            self.assertEqual(store.save_events(self.worker, [self.event(1), self.event(2)]), 0)
            self.assertEqual([row['status'] for row in store.messages()],
                             ['DELIVERED_LXMF', 'FAILED_LXMF'])

    def test_history_refuses_incoming_fake_delivery_receipt(self):
        with TemporaryDirectory() as temp:
            store = ReticulumLocalStore(Path(temp) / 'reticulum')
            store.set_history(True)
            self.assertEqual(store.save_events(self.worker,
                             [self.event(3, 'DELIVERED_LXMF', direction='IN')]), 0)
            self.assertEqual(store.messages(), [])


if __name__ == '__main__':
    unittest.main()
