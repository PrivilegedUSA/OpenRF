"""v0.2.30: typing may offer opted-in Census results before route submit."""
import io
import json
import os
import unittest
from unittest.mock import patch

from openrf.geocoding import _full_us_street_address, search, GeocoderUnavailable


class Response(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *args): self.close()


class LiveAddressTests(unittest.TestCase):
    def test_full_address_recognition_requires_city_and_state(self):
        for address in (
            '25005 State Hwy 88, Pioneer, CA',
            '25005 State Hwy 88, Pioneer, CA 95666',
            '1600 Pennsylvania Ave NW, Washington, DC',
        ):
            with self.subTest(address=address):
                self.assertTrue(_full_us_street_address(address))
        for address in ('25', '25005 State Hwy 88', '25005 State Hwy 88, Pioneer',
                        'Pioneer, CA', '1600 Pennsylvania Ave, Washington, D',
                        '1600 Pennsylvania Ave, Washington, 12'):
            with self.subTest(address=address):
                self.assertFalse(_full_us_street_address(address))

    def test_census_suggestion_can_appear_before_route_submission(self):
        calls=[]
        def opener(req, timeout):
            calls.append(req.full_url)
            self.assertIn('geocoding.geo.census.gov/geocoder/locations/', req.full_url)
            self.assertIn('25005', req.full_url)
            return Response(json.dumps({'result':{'addressMatches':[{
                'matchedAddress':'25005 STATE HWY 88, PIONEER, CA, 95666',
                'coordinates':{'x':-120.623,'y':38.489},
            }]}}).encode())
        with patch.dict(os.environ,{'OPENRF_PHOTON_PORT':'','OPENRF_MAPTILER_KEY':'',
                                     'OPENRF_CONFIG_HOME':'/nonexistent/openrf-tests'}):
            reply=search('25005 State Hwy 88, Pioneer, CA',
                         online_allowed=True,autocomplete=True,open_connection=opener)
        self.assertEqual(reply['provider'],'us-census-opt-in')
        self.assertEqual(len(calls),1)
        self.assertEqual(reply['results'][0]['longitude'],-120.623)
        self.assertIn('Approximate',reply['results'][0]['accuracy_note'])
        self.assertEqual(reply['results'][0]['source'],'us-census-opt-in')

    def test_no_census_for_incomplete_address_or_without_consent(self):
        requests=[]
        def opener(req,timeout):
            requests.append(req.full_url)
            return Response(json.dumps({'features':[]}).encode())
        with patch.dict(os.environ,{'OPENRF_PHOTON_PORT':'','OPENRF_MAPTILER_KEY':'',
                                     'OPENRF_CONFIG_HOME':'/nonexistent/openrf-tests'}):
            with self.assertRaises(GeocoderUnavailable):
                search('25005 State Hwy 88, Pioneer, CA',
                       online_allowed=False,autocomplete=True,open_connection=opener)
            self.assertEqual(requests,[])
            search('25005 State Hwy 88, Pioneer',
                   online_allowed=True,autocomplete=True,open_connection=opener)
        self.assertEqual(len(requests),1)
        self.assertIn('photon.komoot.io',requests[0])

    def test_maptiler_remains_prefix_provider_when_configured(self):
        calls=[]
        def opener(req,timeout):
            calls.append(req.full_url)
            return Response(json.dumps({'features':[{
                'geometry':{'coordinates':[-120.62,38.48]},
                'place_name':'25005 State Hwy 88, Pioneer, California, United States',
                'properties':{'country':'United States','housenumber':'25005'}
            }]}).encode())
        with patch.dict(os.environ,{'OPENRF_PHOTON_PORT':'','OPENRF_MAPTILER_KEY':'fake-test-key'}):
            result=search('25005 State Hwy 88, Pioneer, CA',
                          online_allowed=True,autocomplete=True,open_connection=opener)
        self.assertEqual(result['provider'],'maptiler-opt-in')
        self.assertIn('country=us',calls[0])
        self.assertNotIn('geocoding.geo.census.gov',calls[0])

if __name__=='__main__': unittest.main()
