"""Regression for RNS stamped path requests requiring nested subprocesses.

No RNS package, LAN listener, LXMF peer or RF hardware is used here.
"""
import multiprocessing
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from openrf.reticulum_lan import ReticulumManager


def _stamp_helper(pipe):
    pipe.send('stamp-worker-started')
    pipe.close()


def _nested_worker(pipe):
    """Probe the Python restriction that broke RNS.Stamps under v0.2.165."""
    ctx = multiprocessing.get_context('spawn')
    parent, child = ctx.Pipe(duplex=False)
    try:
        worker = ctx.Process(target=_stamp_helper, args=(child,))
        worker.start()
        child.close()
        if not parent.poll(8):
            raise RuntimeError('Nested stamp worker did not respond')
        reply = parent.recv()
        worker.join(timeout=8)
        pipe.send(reply == 'stamp-worker-started' and worker.exitcode == 0)
    except Exception as exc:
        pipe.send(type(exc).__name__ + ': ' + str(exc))
    finally:
        child.close()
        parent.close()
        pipe.close()


class _FakeManagedProcess:
    instances = []

    def __init__(self, *, target, args, daemon):
        self.daemon = daemon
        self.pipe = args[0]
        self.running = False
        self.terminated = False
        self.joined = False
        self.instances.append(self)

    def start(self):
        self.running = True
        self.pipe.send({'ok': True, 'address': '0123456789abcdef' * 2})

    def is_alive(self):
        return self.running

    def terminate(self):
        self.running = False
        self.terminated = True

    def join(self, timeout=None):
        self.joined = True

    def kill(self):
        self.running = False


class StampWorkerTests(unittest.TestCase):
    def test_manager_launches_a_non_daemonic_owned_worker(self):
        _FakeManagedProcess.instances.clear()
        with TemporaryDirectory() as temp:
            manager = ReticulumManager(Path(temp) / 'reticulum',
                                       dependencies_available=lambda: True,
                                       process_factory=_FakeManagedProcess)
            try:
                result = manager.start({})
                self.assertTrue(result['enabled'])
                process = _FakeManagedProcess.instances[-1]
                self.assertIs(process.daemon, False,
                              'RNS.Stamps must be allowed to spawn subprocesses')
            finally:
                manager._terminate()
            self.assertTrue(process.terminated)
            self.assertTrue(process.joined)
            self.assertFalse(manager.status()['enabled'])

    def test_python_spawn_worker_may_launch_stamp_helper(self):
        ctx = multiprocessing.get_context('spawn')
        parent, child = ctx.Pipe(duplex=False)
        worker = ctx.Process(target=_nested_worker, args=(child,), daemon=False)
        try:
            worker.start()
            child.close()
            self.assertTrue(parent.poll(15), 'Worker did not answer')
            self.assertIs(parent.recv(), True)
            worker.join(timeout=10)
            self.assertEqual(worker.exitcode, 0)
        finally:
            if worker.is_alive():
                worker.terminate()
                worker.join(timeout=3)
            parent.close()
            child.close()


if __name__ == '__main__':
    unittest.main()
