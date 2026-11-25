"""One bounded regional camera job per server; independent of HTTP clients."""
import threading
from . import camera_catalog

class ImportManager:
    def __init__(self, repo):
        self.repo = repo
        self.lock = threading.Lock()
        self.state = dict(phase='idle', running=False)
        self.thread = None

    def status(self):
        with self.lock:
            return dict(self.state)

    def update(self, **values):
        with self.lock:
            self.state.update(values)

    def start(self, bounds, types=None):
        camera_catalog.bbox_value(bounds, narrow=True)
        types = camera_catalog.import_types(types)
        with self.lock:
            if self.state['running']:
                raise RuntimeError('Camera area import is already running.')
            self.state = dict(phase='connecting', running=True, bounds=list(bounds), types=types, errors=[], received_bytes=0, total_bytes=None)
            self.thread = threading.Thread(target=self.run, args=(list(bounds), types), daemon=True, name='OpenRF-regional-cameras')
            self.thread.start()
        return self.status()

    def run(self, bounds, types):
        try:
            result = camera_catalog.import_feed(self.repo, bounds,
                fetch=lambda: camera_catalog._read_osm_area(bounds, self.update, types), progress=self.update, types=types)
            result['source'] = self.status().get('provider') or result['source']
            self.update(phase='complete', running=False, result=result)
        except Exception as exc:
            self.update(phase='failed', running=False, error=f'{type(exc).__name__}: {exc}')
