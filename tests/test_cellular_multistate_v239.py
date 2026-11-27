import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from openrf.cellular_catalog import Catalog
from openrf import coverage_compact as compact
import test_coverage_overview_v229 as overview_tests


class MultiStateCoverage(unittest.TestCase):
    def test_compact_states_different_revisions(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.folder=Path(tmp)/'fcc-coverage'; self.folder.mkdir()
            self.layer={'carrier':'att','technology':'4G LTE 5/1 Mbps','environment':'Outdoor stationary (all)','count':1}
            for state,lon,date in [('06',-120,'2026-11-10'),('32',-115,'2026-11-24')]:
                path=overview_tests.CoverageOverview.fixture(self,'130077','att',[(lon,38)],state=state)
                with sqlite3.connect(path) as db:
                    meta=json.loads(db.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()[0]); meta['vintage']=date
                    db.execute("UPDATE metadata SET value=? WHERE key='manifest'",(json.dumps(meta),))
                compact.optimize(self.folder,state,lambda _:None)
                compact.set_active(self.folder,state,True,standalone=True)
                path.unlink()
            cat=Catalog(Path(tmp)/'catalog.sqlite3')
            profile=lambda date: [json.dumps(['att',date,self.layer['technology'],self.layer['environment']])]
            view=lambda box,p=():cat.view(box,[],['att'],p)
            combined=profile('fcc:all')
            self.assertEqual({p['vintage'] for p in cat.metadata().values()},{'2026-11-10','2026-11-24'})
            for box in [(-120.1,37.9,-119.9,38.1),(-115.1,37.9,-114.9,38.1)]:
                self.assertEqual(len(view(box,combined)['coverage']),1)
                self.assertEqual(len(view(box)['coverage']),1)
                for date in ('2026-11-10','2026-11-24'):
                    self.assertEqual(len(view(box,profile(date))['coverage']),1)
                    self.assertEqual({r['pack'] for r in view(box,profile(date))['coverage_sources']['att']},{'FCC state 06','FCC state 32'})
            box=(-125,32,-110,43)
            self.assertEqual(sum(p['reports'] for p in view(box,combined)['coverage']),2)
            self.assertEqual(sum(p['reports'] for p in view(box)['coverage']),2)
            self.assertEqual(sum(p['reports'] for p in view(box,profile('2026-11-10'))['coverage']),2)
            self.assertEqual(sum(p['reports'] for p in view(box,profile('2026-11-24'))['coverage']),2)
            self.assertEqual(cat.view(box,[],['att'],[json.dumps(['att','fcc:all','Mobile voice',self.layer['environment']])])['coverage'],[])
            geo=Path(tmp)/'manual.geojson'; geo.write_text(json.dumps({'type':'FeatureCollection','features':[{'type':'Feature','geometry':{'type':'Polygon','coordinates':[[[-119,38],[-118,38],[-118,39],[-119,38]]]}}]}))
            cat.replace_coverage('att','manual',geo,'2025-01-01',self.layer['technology'],self.layer['environment'])
            self.assertEqual(sum(p['reports'] for p in view(box,combined)['coverage']),2)
            self.assertEqual(view(box,profile('2025-01-01'))['coverage'][0]['pack'],'coverage:att:manual')
            cat.replace_coverage('att','manualsame',geo,'2026-11-10',self.layer['technology'],self.layer['environment'])
            self.assertEqual([p['pack'] for p in view(box,profile('manual:2026-11-10'))['coverage']],['coverage:att:manualsame'])
            self.assertEqual(sum(p['reports'] for p in view(box,combined)['coverage']),2)

if __name__=='__main__': unittest.main()
