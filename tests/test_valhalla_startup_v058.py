"""Offline-only container reuse: does not create or download any routing data."""
import subprocess
import unittest
from types import SimpleNamespace
from openrf.valhalla_startup import ensure_existing_valhalla
from openrf.routing import local_route

class FakeResponse:
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self,*args):return b'{}'

class Startup(unittest.TestCase):
    def test_disabled_never_calls_docker(self):
        self.assertIn('disabled',ensure_existing_valhalla(environ={'OPENRF_VALHALLA_AUTOSTART':'0'},which=lambda _:self.fail('called')))
    def test_running_no_start(self):
        calls=[]
        def run(args,**kwargs):calls.append(args);return SimpleNamespace(returncode=0,stdout='true\n')
        self.assertIn('is running',ensure_existing_valhalla(which=lambda _:'/usr/bin/docker',runner=run,environ={}))
        self.assertEqual(len(calls),1)
        self.assertEqual(calls[0][1],'inspect')
    def test_existing_stopped_is_reused(self):
        calls=[]
        def run(args,**kwargs):
            calls.append(args)
            return SimpleNamespace(returncode=0,stdout='false\n' if args[1]=='inspect' else 'openrf-valhalla\n')
        self.assertIn('restarted',ensure_existing_valhalla(which=lambda _:'/usr/bin/docker',runner=run,environ={}))
        self.assertEqual([c[1] for c in calls],['inspect','start'])
        self.assertTrue(all('install' not in c and 'pull' not in c for c in calls))
    def test_unavailable_daemon_is_nonfatal(self):
        def run(args,**kwargs):raise subprocess.TimeoutExpired(args,2)
        self.assertIn('timed out',ensure_existing_valhalla(which=lambda _:'/usr/bin/docker',runner=run,environ={}))
        self.assertIn('unavailable',ensure_existing_valhalla(which=lambda _:None,environ={}))

if __name__=='__main__':unittest.main()
