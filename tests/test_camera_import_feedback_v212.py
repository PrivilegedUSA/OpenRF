import unittest
import urllib.error
from unittest.mock import patch
from openrf import camera_catalog as cam

class ImportFeedbackTests(unittest.TestCase):
    def test_http_status_reported_without_request_details(self):
        with patch.object(cam.urllib.request,'urlopen',side_effect=urllib.error.HTTPError('https://example.invalid/private',504,'timeout',None,None)) as request:
            with self.assertRaisesRegex(ValueError,'HTTP 504') as failure:
                cam._read_osm_area([-122.6,37.6,-122.3,37.9])
        self.assertNotIn('example.invalid',str(failure.exception))
        self.assertEqual(request.call_count,len(cam.OVERPASS_ENDPOINTS))
        self.assertEqual(request.call_args.kwargs['timeout'],45)

    def test_device_node_reference_resolved_without_ordinary_signals(self):
        result=cam._parse_overpass({'elements':[
            {'type':'node','id':1,'lat':37.7,'lon':-122.4,'tags':{'highway':'traffic_signals'}},
            {'type':'node','id':2,'lat':37.8,'lon':-122.4,'tags':{'highway':'traffic_signals'}},
            {'type':'relation','id':3,'tags':{'type':'enforcement','enforcement':'traffic_signals'},'members':[
                {'type':'node','ref':1,'role':'device'},{'type':'node','ref':2,'role':'from'}]}]})
        self.assertEqual([(f['id'],f['properties']['camera_type']) for f in result['features']],[('node/1','RED_LIGHT')])
