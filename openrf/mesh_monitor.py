"""Passive local collector and evidence-limited topology."""
import threading
import time
import re


def topology(nodes):
    names = {n['id']: n['name'] for n in nodes if n['protocol']=='Reticulum'}
    edges = []
    for n in nodes:
        if n['protocol'] != 'Reticulum': continue
        r = n.get('route') or {}
        via = r.get('via')
        if not isinstance(via,str) or not re.fullmatch(r'[0-9a-f]{32}',via) or via == n['id']: continue
        edges.append(dict(via=via, via_name=names.get(via,via), destination=n['id'], destination_name=n['name'], hops=r.get('hops'), interface=r.get('interface'), updated=r.get('updated'), expired=r.get('expired')))
    return edges


class SnapshotBusy(RuntimeError):
    pass


class SnapshotCoordinator:
    def __init__(self, read):
        self.read = read
        self.lock = threading.Lock()

    def __call__(self):
        if not self.lock.acquire(blocking=False):
            raise SnapshotBusy('A mesh inventory read is already in progress')
        try:
            result = self.read()
            result['snapshot_at'] = time.time()
            return result
        finally:
            self.lock.release()


class MeshMonitor:
    def __init__(self, history, snapshot):
        self.history, self.snapshot = history, snapshot
        self.stop = threading.Event()
        self.lock = threading.Lock()
        self.report = dict(last_attempt=None,last_success=None,error=None,failed_protocols=[],outcome='idle',last_partial=None)
        self.thread = threading.Thread(target=self.run, name='mesh-history', daemon=True)
        self.thread.start()

    def status(self):
        with self.lock: return dict(self.report)

    def collect(self):
        settings = self.history.settings()
        if not settings['enabled'] or not settings['background_enabled']:
            self.history.prune()
            return
        with self.lock: self.report['last_attempt']=time.time()
        result = self.snapshot()
        if self.stop.is_set(): return
        self.history.record(result['nodes'], background=True)
        failed = [n['protocol'] for n in result['networks'] if 'failed' in n['state'].lower() or 'busy' in n['state'].lower() or (n['protocol']=='Reticulum' and n['state']=='Connected' and not n.get('path_available'))]
        with self.lock:
            all_failed = bool(result['networks']) and len(failed) == len(result['networks'])
            self.report.update(error='All inventory reads failed' if all_failed else None,failed_protocols=failed, outcome='failed' if all_failed else 'partial' if failed else 'success')
            if not failed: self.report['last_success']=time.time()
            elif not all_failed: self.report['last_partial']=time.time()

    def run(self):
        next_due = 0
        previous = None
        while not self.stop.is_set():
            try:
                settings = self.history.settings()
                interval = settings['interval_seconds']
                if settings != previous:
                    next_due = 0
                    previous = settings
                if time.monotonic() >= next_due:
                    next_due = time.monotonic()+interval
                    self.collect()
            except SnapshotBusy:
                with self.lock: self.report.update(outcome='deferred', error=None, failed_protocols=[])
                next_due=time.monotonic()+5
            except Exception as exc:
                with self.lock: self.report.update(error=type(exc).__name__,outcome='failed')
                next_due=time.monotonic()+15
            self.stop.wait(2)

    def close(self):
        self.stop.set()
        self.thread.join()
