"""Ensure exclusion-reroutes do not accept the displayed geometry with truncated turn directions."""
import io
import json
import unittest
from openrf.routing import RouteError, local_route


def encode(points):
    prev_lat=prev_lon=0
    output=''
    for lon,lat in points:
        lati,loni=round(lat*1000000),round(lon*1000000)
        for delta in (lati-prev_lat,loni-prev_lon):
            n=delta<<1 if delta>=0 else ~(delta<<1)
            while n>=32:
                output+=chr((32|(n&31))+63); n >>= 5
            output+=chr(n+63)
        prev_lat,prev_lon=lati,loni
    return output


class Reply(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self,*_): self.close()


class RouteCompletionTests(unittest.TestCase):
    def _request(self, last_index):
        points=[[-120.7,38.4],[-120.699,38.4],[-120.69,38.4],[-120.68,38.4],[-120.67,38.4]]
        payload={'trip':{'summary':{'length':2.1,'time':360},'legs':[{'shape':encode(points),
          'maneuvers':[{'instruction':'Start','begin_shape_index':0},
            {'instruction':'Turn right onto Cedar Creek','begin_shape_index':1},
            {'instruction':'Arrive at destination','begin_shape_index':last_index}]}]}}
        def opener(req,timeout):
            self.assertEqual(json.loads(req.data)['exclude_locations'],[{'lat':38.401,'lon':-120.6901}])
            return Reply(json.dumps(payload).encode())
        return local_route([{'latitude':38.4,'longitude':-120.7},{'latitude':38.4,'longitude':-120.67}],
                           port=8002,open_connection=opener,
                           options={'exclude_locations':[{'latitude':38.401,'longitude':-120.6901}]})

    def test_reject_maneuver_list_ending_before_destination(self):
        with self.assertRaisesRegex(RouteError,'incomplete turn list'):
            self._request(2)

    def test_complete_end_maneuver_accepted(self):
        route=self._request(4)
        self.assertEqual(route['maneuvers'][-1]['instruction'],'Arrive at destination')
        self.assertEqual(len(route['coordinates']),5)

if __name__ == '__main__':unittest.main()
