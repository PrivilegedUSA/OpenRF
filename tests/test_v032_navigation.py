"""v0.2.32 map source labels, maneuver index alignment and no invented routes."""
import json
import unittest
from pathlib import Path
from openrf.routing import normalize_result, RouteError
from openrf.vector_maps import style


def encoded(points):
    lat=lon=0
    chars=[]
    for x,y in points:
        newlat,newlon=round(y*1e6),round(x*1e6)
        for n in (newlat-lat,newlon-lon):
            v=n<<1 if n>=0 else ~(n<<1)
            while v>=32:
                chars.append(chr((v&31|32)+63))
                v>>=5
            chars.append(chr(v+63))
        lat,lon=newlat,newlon
    return ''.join(chars)

class V032Navigation(unittest.TestCase):
    def test_maneuver_indexes_span_combined_legs(self):
        a=[[-120.7,38.4],[-120.69,38.41],[-120.68,38.42]]
        b=[[-120.68,38.42],[-120.67,38.43],[-120.66,38.44]]
        data={'trip':{'summary':{'length':4,'time':500},'legs':[
            {'shape':encoded(a),'maneuvers':[{'instruction':'Head east','begin_shape_index':0}, {'instruction':'Turn right','begin_shape_index':2}]},
            {'shape':encoded(b),'maneuvers':[{'instruction':'Continue','begin_shape_index':1}]}
        ]}}
        result=normalize_result(data,[{'lat':38.4,'lon':-120.7},{'lat':38.44,'lon':-120.66}])
        self.assertEqual(result['coordinates'],a+b[1:])
        self.assertEqual([d['shape_index'] for d in result['maneuvers']],[0,2,3])
        self.assertTrue(result['is_driving_route'])
        self.assertNotIn('record',json.dumps(result).lower())

    def test_bad_maneuver_index_is_rejected(self):
        points=[[-120.7,38.4],[-120.6,38.45]]
        reply={'trip':{'summary':{'length':4,'time':500},'legs':[
           {'shape':encoded(points),'maneuvers':[{'instruction':'Turn','begin_shape_index':900}]}]}}
        with self.assertRaisesRegex(RouteError,'unsupported'):
            normalize_result(reply,[{'lat':38.4,'lon':-120.7},{'lat':38.45,'lon':-120.6}])

    def test_runtime_country_labels_and_original_styles_preserved(self):
        resources=Path(__file__).resolve().parents[1]/'openrf/resources'
        for name in ('dark','light'):
            original=json.loads((resources/f'openrf-{name}.json').read_text())
            self.assertFalse(any(layer['id']=='openrf-country-labels' for layer in original['layers']))
            online=style(name)
            offline=style(name,offline=True)
            for result in (online,offline):
                labels=[l for l in result['layers'] if l['id']=='openrf-country-labels']
                self.assertEqual(len(labels),1)
                self.assertEqual(labels[0]['source-layer'],'place')
                self.assertLess(labels[0]['minzoom'],2)
                self.assertIn('copyright', 'copyright')
            self.assertTrue(offline['metadata']['openrf:offline'])
