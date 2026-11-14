"""v0.2.59 read-only Valhalla doctor, with stubs, never real Docker/network."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'tools/setup-valhalla-wsl.sh'


class ValhallaDoctorTests(unittest.TestCase):
    def invoke(self,tmp,body='',ready=False):
        root=Path(tmp); fake=root/'bin';fake.mkdir(exist_ok=True)
        docker=fake/'docker';docker.write_text('#!/bin/sh\ncase "$1" in info) exit 1;; esac\nexit 1\n');docker.chmod(0o755)
        curl=fake/'curl';curl.write_text('#!/bin/sh\ncase " $* " in *"/status"*) '+('exit 0' if ready else 'exit 22')+';; esac\nprintf %s "$FAKE_ROUTE_BODY"\n');curl.chmod(0o755)
        env=os.environ.copy();env.update(HOME=str(root),OPENRF_VALHALLA_DATA_DIR=str(root/'valhalla'),PATH=str(fake)+os.pathsep+env['PATH'],FAKE_ROUTE_BODY=body)
        return subprocess.run(['bash',str(SCRIPT),'--doctor'],capture_output=True,text=True,timeout=15,env=env)

    def test_no_network_or_download_when_service_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=self.invoke(tmp)
            self.assertEqual(p.returncode,0,p.stderr)
            self.assertIn('Docker daemon: unavailable',p.stdout)
            self.assertIn('NOT READY',p.stdout)
            self.assertFalse((Path(tmp)/'valhalla').exists())
            self.assertNotIn('Downloading',p.stdout)

    def test_http_ready_with_valid_reference_route(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=self.invoke(tmp,'{"trip":{"legs":[{}],"summary":{"length":20}}}',True)
            self.assertEqual(p.returncode,0,p.stderr)
            self.assertIn('Sacramento-to-Auburn',p.stdout)
            self.assertIn('Test route: OK',p.stdout)

    def test_http_ready_without_route_graph(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=self.invoke(tmp,'{"error":"route locations outside graph"}',True)
            self.assertEqual(p.returncode,0,p.stderr)
            self.assertIn('Test route: unavailable',p.stdout)

if __name__=='__main__':unittest.main()
