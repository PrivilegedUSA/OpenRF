"""Reproduce audit defects with private synthetic data, no radio hardware."""
import json
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from openrf.mesh_history import MeshHistory
from openrf.mesh_monitor import MeshMonitor
from openrf.mesh_dashboard import meshtastic_rows
from openrf.emergency_backup import _snapshot, MAX_DB_BYTES
from openrf.reticulum_lan import ReticulumManager, ReticulumError

class StabilizationTests(unittest.TestCase):
    def test_migrate_large_legacy_database_and_reopen(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'db.sqlite3'; old=MeshHistory(p)
            old.configure({'enabled':True,'days':30,'background_enabled':True})
            now=time.time()
            payload=json.dumps({'source':'RADIO_NODE_DATABASE','role':'x'*400})
            with sqlite3.connect(p) as db:
                db.execute('CREATE TABLE unrelated (v TEXT)'); db.execute("INSERT INTO unrelated VALUES ('preserved')")
                db.executemany('INSERT INTO mesh_history_samples VALUES (?,?,?,?)',(('Meshtastic',f'!{i:08x}',now,payload) for i in range(100000)))
            self.assertGreater(p.stat().st_size,MAX_DB_BYTES)
            with self.assertRaises(ValueError): _snapshot(p)
            h=MeshHistory.separate(p)
            self.assertLess(p.stat().st_size,MAX_DB_BYTES)
            self.assertTrue(_snapshot(p).startswith(b'SQLite format 3'))
            self.assertTrue(h.settings()['enabled']); self.assertFalse(h.settings()['background_enabled'])
            with sqlite3.connect(h.path) as db: self.assertEqual(db.execute('SELECT count(*) FROM mesh_history_samples').fetchone()[0],100000)
            with sqlite3.connect(p) as db: self.assertEqual(db.execute('SELECT v FROM unrelated').fetchone()[0],'preserved')
            self.assertEqual(MeshHistory.separate(p).history('Meshtastic','!00000000')['count'],1)
            h.clear(); self.assertLess(Path(h.path).stat().st_size,MAX_DB_BYTES)
            self.assertEqual(MeshHistory.separate(p).history('Meshtastic','!00000000')['count'],0)

    def test_telemetry_and_changed_next_hop(self):
        row=meshtastic_rows({}, {'!abcdef12':{'deviceMetrics':{'batteryLevel':-1,'voltage':-2},'hopsAway':-1,'snr':-5}})[0]
        self.assertEqual(row['telemetry'],{'SNR (dB)':-5})
        with tempfile.TemporaryDirectory() as d:
            h=MeshHistory(Path(d)/'h'); h.configure({'enabled':True,'days':30}); t=time.time()
            n=dict(protocol='Reticulum',id='a'*32,source='RNS_PATH_CACHE',route=dict(via='b'*32,hops=2,updated=t,interface='one'))
            h.record([n],t,background=True); self.assertEqual(h.history(n['protocol'],n['id'])['count'],0)
            h.record([n],t); h.record([dict(n,route=dict(n['route'],via='c'*32,interface='two'))],t+1)
            result=h.history(n['protocol'],n['id']); self.assertEqual(result['count'],2); self.assertEqual(result['samples'][0]['route']['interface'],'two')

    def test_collector_failure_not_success(self):
        with tempfile.TemporaryDirectory() as d:
            h=MeshHistory(Path(d)/'h'); m=MeshMonitor(h,lambda:dict(nodes=[],networks=[dict(protocol='Meshtastic',state='Unavailable · inventory read failed')]))
            try:
                h.configure({'enabled':True,'days':30,'background_enabled':True}); m.collect()
                self.assertIsNone(m.status()['last_success']); self.assertEqual(m.status()['outcome'],'failed')
            finally: m.close()
            self.assertFalse(m.thread.is_alive())

    def test_late_response_cannot_become_next_message_response(self):
        class Pipe:
            def __init__(self): self.sent=[]; self.ready=[]
            def send(self,msg):
                self.sent.append(msg)
                if msg['action']=='messages': self.ready.append(dict(ok=True,request_id=msg['request_id'],messages=[]))
            def poll(self,timeout): return bool(self.ready)
            def recv(self): return self.ready.pop(0)
        with tempfile.TemporaryDirectory() as d:
            m=ReticulumManager(d); m._running=lambda:True; m._pipe=Pipe()
            with self.assertRaises(ReticulumError): m._command('mesh_inventory')
            with self.assertRaises(ReticulumError): m._command('messages')
            self.assertEqual(len(m._pipe.sent),1)
            m._pipe.ready.append(dict(ok=True,request_id=m._pipe.sent[0]['request_id'],path_cache={}))
            result=m._command('messages'); self.assertIn('messages',result); self.assertNotIn('path_cache',result)
            self.assertNotEqual(m._pipe.sent[0]['request_id'],m._pipe.sent[1]['request_id'])

if __name__=='__main__': unittest.main()
