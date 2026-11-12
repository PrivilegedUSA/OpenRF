"""v0.2.25: offline-only routing and opt-in geocoding contract tests."""
import io
import json
import os
import threading
import tempfile
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

from openrf.routing import (RouteError, RouteUnavailable, coordinates,
                            decode_polyline6, local_route, local_status, normalize_result)
from openrf.geocoding import (GeocoderUnavailable, GeocoderError,
                              provider, search)
from openrf.server import create_server
from openrf.storage import Repository


class Response(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *args): self.close()


def encoded(points):
    """Encode test vertices using Valhalla's six-decimal convention."""
    old_lat = old_lon = 0
    result = ''
    for lon, lat in points:
        x, y = round(lat*1e6), round(lon*1e6)
        for n in (x-old_lat, y-old_lon):
            v = n << 1 if n >= 0 else ~(n << 1)
            while v >= 32:
                result += chr((32 | (v & 31)) + 63)
                v >>= 5
            result += chr(v+63)
        old_lat, old_lon = x, y
    return result


class RoutingTests(unittest.TestCase):
    def test_coordinate_validation(self):
        for points in ([], [{}], [{'latitude':0,'longitude':0}]*13,
                       [{'latitude':True,'longitude':1}]*2,
                       [{'latitude':91,'longitude':0}]*2,
                       [{'latitude':0,'longitude':float('nan')}]*2,
                       [{'latitude':0,'longitude':0,'url':'http://example.com'}]*2):
            with self.subTest(points=points), self.assertRaises(RouteError):
                coordinates(points)

    def test_polyline6_round_trip_and_rejects_malformed(self):
        points=[[-120.62,38.48],[-120.619,38.481],[-120.6,38.49]]
        self.assertEqual(decode_polyline6(encoded(points)), points)
        for bad in ('_', '\u0000', '~', 'a'*1000001):
            with self.subTest(bad=bad[:30]), self.assertRaises(RouteError):
                decode_polyline6(bad)

    def test_local_route_normalizes_geometry_and_maneuvers(self):
        points=[[-120.62,38.48],[-120.61,38.481],[-120.6,38.49]]
        reply={'trip':{'summary':{'length':4.7,'time':420},'legs':[
            {'shape':encoded(points),'maneuvers':[{'instruction':'Head north.', 'length':0.4}]}
        ]}}
        urls=[]
        def opener(req, timeout):
            urls.append(req.full_url)
            self.assertEqual(timeout, 7)
            data=json.loads(req.data)
            self.assertEqual(data['costing'],'auto')
            self.assertEqual(len(data['locations']),2)
            return Response(json.dumps(reply).encode())
        result=local_route([{'latitude':38.48,'longitude':-120.62},
                            {'latitude':38.49,'longitude':-120.6}],open_connection=opener,port=8002)
        self.assertEqual(urls,['http://127.0.0.1:8002/route'])
        self.assertTrue(result['is_driving_route'])
        self.assertEqual(result['distance_miles'],4.7)
        self.assertEqual(result['coordinates'],points)
        self.assertEqual(result['maneuvers'][0]['instruction'],'Head north.')
        self.assertNotIn('police',json.dumps(result).lower())

    def test_status_probe_never_routes_or_reaches_public_network(self):
        urls=[]
        class StatusResponse(Response):
            status=200
        def status_reply(req, timeout):
            urls.append(req.full_url)
            self.assertEqual(timeout,2)
            return StatusResponse(b'{"version":"3.7"}')
        online=local_status(open_connection=status_reply,port=8002)
        self.assertTrue(online['reachable'])
        self.assertIn('coverage',online['detail'])
        self.assertEqual(urls,['http://127.0.0.1:8002/status'])
        self.assertFalse(local_status(open_connection=status_reply,port='bad')['reachable'])
        self.assertEqual(len(urls),1)

    def test_unavailable_never_fakes_road(self):
        def unavailable(req, timeout):
            raise OSError('connection refused')
        with self.assertRaisesRegex(RouteUnavailable,'unavailable'):
            local_route([{'latitude':38,'longitude':-120}, {'latitude':39,'longitude':-120}],
                        open_connection=unavailable,port=8002)
        with self.assertRaises(RouteError):
            normalize_result({'trip':{'summary':{'length':1,'time':2},'legs':[{'shape':'broken'}]}},
                [{'lat':38,'lon':-120},{'lat':39,'lon':-120}])


class GeocodingTests(unittest.TestCase):
    def test_no_external_requests_by_default(self):
        with patch.dict(os.environ, {'OPENRF_MAPTILER_KEY':'','OPENRF_PHOTON_PORT':''}):
            self.assertIsNone(provider())
            with self.assertRaises(GeocoderUnavailable):
                search('Jackson California',open_connection=lambda *a,**k:self.fail('should not send requests'))

    def test_local_photon_sanitizes_results(self):
        def opener(req, timeout):
            self.assertIn('127.0.0.1:2322/api?',req.full_url)
            self.assertIn('Jackson',req.full_url)
            return Response(json.dumps({'features':[
                {'geometry':{'coordinates':[-120.77,38.35]},'properties':{'name':'Main Street','city':'Jackson','state':'California'}},
                {'geometry':{'coordinates':[999,999]},'properties':{'name':'Bogus'}}
            ]}).encode())
        with patch.dict(os.environ, {'OPENRF_PHOTON_PORT':'2322','OPENRF_MAPTILER_KEY':''}):
            data=search('Main Street Jackson',open_connection=opener)
        self.assertEqual(data['provider'],'local-photon')
        self.assertFalse(data['external_query'])
        self.assertEqual(len(data['results']),1)
        self.assertEqual(data['results'][0]['longitude'],-120.77)

    def test_maptiler_is_explicit_opt_in(self):
        urls=[]
        def opener(req, timeout):
            urls.append(req.full_url)
            return Response(json.dumps({'features':[
                {'geometry':{'coordinates':[-120.1,38.1]},'properties':{'place_name':'Example Road, California'}}
            ]}).encode())
        with patch.dict(os.environ, {'OPENRF_PHOTON_PORT':'','OPENRF_MAPTILER_KEY':'test-secret'}):
            data=search('Example Road',open_connection=opener)
        self.assertTrue(data['external_query'])
        self.assertIn('api.maptiler.com/geocoding/',urls[0])
        self.assertEqual(data['results'][0]['name'],'Example Road, California')

    def test_us_only_photon_filters_and_formats_house_numbers(self):
        urls=[]
        def opener(req, timeout):
            urls.append(req.full_url)
            return Response(json.dumps({'features':[
              {'geometry':{'coordinates':[-120.75,38.35]},'properties':{
                'street':'Broadway','housenumber':'123','name':'Broadway',
                'city':'Jackson','state':'California','postcode':'95642',
                'country':'United States','countrycode':'US'}},
              {'geometry':{'coordinates':[2.3522,48.8566]},'properties':{
                'name':'Broadway','city':'Paris','countrycode':'FR','country':'France'}},
              {'geometry':{'coordinates':[-120.7,38.3]},'properties':{
                'name':'Jackson','countrycode':'US','country':'United States'}}
            ]}).encode())
        with patch.dict(os.environ, {'OPENRF_PHOTON_PORT':'2322','OPENRF_MAPTILER_KEY':''}):
            data=search('123 Broadway Jackson',open_connection=opener)
        self.assertEqual(data['country_filter'],'US')
        self.assertEqual(len(data['results']),2)
        self.assertEqual(data['results'][0]['name'], '123 Broadway, Jackson, California, 95642, United States')
        self.assertEqual(data['results'][0]['category'], 'street_address')
        self.assertIn('countrycode=US',urls[0])
        self.assertNotIn('lat=',urls[0])
        self.assertNotIn('lon=',urls[0])

    def test_maptiler_queries_only_us_without_browser_location(self):
        urls=[]
        def opener(req, timeout):
            urls.append(req.full_url)
            return Response(json.dumps({'features':[
                {'geometry':{'coordinates':[-120.1,38.1]},'properties':{
                 'place_name':'Example Street, California, United States','country':'United States'}}
            ]}).encode())
        with patch.dict(os.environ, {'OPENRF_PHOTON_PORT':'','OPENRF_MAPTILER_KEY':'dummy'}):
            data=search('Example Street',open_connection=opener)
        self.assertIn('country=us',urls[0])
        self.assertEqual(len(data['results']),1)
        self.assertNotIn('latitude=',urls[0])

    def test_explicit_public_photon_permission_and_url(self):
        requests=[]
        def opener(req, timeout):
            requests.append(req.full_url)
            return Response(json.dumps({'features':[
                {'geometry':{'coordinates':[-120.77,38.35]},'properties':
                 {'name':'Main Street','city':'Jackson','state':'California','country':'United States'}}
            ]}).encode())
        with patch.dict(os.environ, {'OPENRF_PHOTON_PORT':'','OPENRF_MAPTILER_KEY':''}):
            self.assertEqual(provider(online_allowed=True),'photon-public-opt-in')
            with self.assertRaises(GeocoderUnavailable):
                search('123 Main Street Jackson',open_connection=opener)
            self.assertEqual(requests,[])
            result=search('123 Main Street Jackson',open_connection=opener,online_allowed=True)
        self.assertEqual(result['provider'],'photon-public-opt-in')
        self.assertTrue(result['external_query'])
        self.assertEqual(result['results'][0]['latitude'],38.35)
        self.assertTrue(requests[0].startswith('https://photon.komoot.io/api/?'))
        self.assertNotIn('latitude=',requests[0])
        self.assertNotIn('longitude=',requests[0])
        self.assertIn('countrycode=US',requests[0])


    def test_opt_in_census_complete_street_address_has_explicit_final_mode(self):
        calls=[]
        def opener(req, timeout):
            calls.append((req.full_url,timeout))
            self.assertIn('geocoding.geo.census.gov/geocoder/locations/onelineaddress?',req.full_url)
            self.assertIn('benchmark=Public_AR_Current',req.full_url)
            self.assertIn('address=1600',req.full_url)
            return Response(json.dumps({'result':{'addressMatches':[{
                'matchedAddress':'1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500',
                'coordinates':{'x':-77.0365,'y':38.8977}
            }]}}).encode())
        with patch.dict(os.environ, {'OPENRF_PHOTON_PORT':'','OPENRF_MAPTILER_KEY':''}):
            data=search('1600 Pennsylvania Ave NW, Washington, DC',
                        open_connection=opener, online_allowed=True,final=True)
        self.assertEqual(len(calls),1)
        self.assertEqual(data['provider'],'us-census-opt-in')
        self.assertTrue(data['external_query'])
        self.assertEqual(data['results'][0]['category'],'street_address')
        self.assertIn('approximate',data['accuracy_note'].lower() if 'approximate' in data['accuracy_note'].lower() else data['results'][0]['accuracy_note'].lower())
        self.assertEqual(data['results'][0]['coordinates'] if 'coordinates' in data['results'][0] else data['results'][0]['longitude'],-77.0365)

    def test_city_only_search_does_not_query_census(self):
        requests=[]
        def opener(req, timeout):
            requests.append(req.full_url)
            self.assertIn('photon.komoot.io/api/?',req.full_url)
            return Response(json.dumps({'features':[]}).encode())
        with patch.dict(os.environ, {'OPENRF_PHOTON_PORT':'','OPENRF_MAPTILER_KEY':''}):
            self.assertEqual(search('Pioneer, CA',online_allowed=True,final=True,
                                    open_connection=opener)['results'],[])
            with self.assertRaises(GeocoderUnavailable):
                search('1600 Pennsylvania Ave NW, Washington, DC',online_allowed=False,
                       final=True,open_connection=opener)
        self.assertEqual(len(requests),1)

    def test_census_no_match_never_makes_up_destination(self):
        urls=[]
        def opener(req, timeout):
            urls.append(req.full_url)
            if 'geocoding.geo.census.gov' in req.full_url:
                return Response(b'{"result":{"addressMatches":[]}}')
            return Response(b'{"features":[]}')
        with patch.dict(os.environ, {'OPENRF_PHOTON_PORT':'','OPENRF_MAPTILER_KEY':''}):
            data=search('99999 Imaginary Rd, Jackson, CA',online_allowed=True,
                        final=True,open_connection=opener)
        self.assertEqual(len(urls),2)
        self.assertEqual(data['results'],[])

    def test_census_ignores_invalid_and_nonfinite_positions(self):
        def opener(req, timeout):
            return Response(json.dumps({'result':{'addressMatches':[{
                'matchedAddress':'123 MAIN ST, EXAMPLE, CA', 'coordinates':{'x':float('nan'),'y':38.1}},
                {'matchedAddress':'456 MAIN ST, EXAMPLE, CA', 'coordinates':{'x':-120.5,'y':38.1}}
            ]}}).encode())
        with patch.dict(os.environ, {'OPENRF_PHOTON_PORT':'','OPENRF_MAPTILER_KEY':''}):
            data=search('456 Main St, Example, CA',online_allowed=True,final=True,open_connection=opener)
        self.assertEqual(len(data['results']),1)
        self.assertEqual(data['results'][0]['longitude'],-120.5)


class RouteHTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.repo=Repository(Path(self.tmp.name)/'test.db')
        self.server=create_server(self.repo,port=0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=3);self.tmp.cleanup()

    def request(self, method, url, body=None, headers=None):
        c=HTTPConnection('127.0.0.1',self.server.server_port,timeout=2)
        actual={'Host':f'localhost:{self.server.server_port}'}
        if body is not None:
            actual['Content-Type']='application/json'
            body=json.dumps(body)
        actual.update(headers or {})
        c.request(method,url,body=body,headers=actual)
        r=c.getresponse();data=r.read();status=r.status;ct=r.getheader('Content-Type');c.close()
        return status,json.loads(data) if 'json' in ct else data

    def test_navigation_static_asset_and_offline_status(self):
        status,body=self.request('GET','/static/navigation.js')
        self.assertEqual(status,200)
        self.assertIn(b'OpenRFNavigation',body)
        with patch.dict(os.environ,{'OPENRF_MAPTILER_KEY':'','OPENRF_PHOTON_PORT':''}):
            status,data=self.request('GET','/api/navigation/geocoding/status')
            self.assertEqual(status,200);self.assertFalse(data['enabled'])
            self.assertEqual(self.request('GET','/api/navigation/geocode?q=Jackson')[0],503)

    def test_router_status_loopback_only_and_not_a_route_guarantee(self):
        with patch('openrf.server.local_status',return_value={
            'reachable':False,'detail':'Local Valhalla is not running'}) as mock:
            status, data=self.request('GET','/api/navigation/routing/status')
        self.assertEqual(status,200)
        self.assertFalse(data['reachable'])
        mock.assert_called_once_with()

    def test_public_online_lookup_must_be_individually_authorized(self):
        with patch.dict(os.environ, {'OPENRF_MAPTILER_KEY':'','OPENRF_PHOTON_PORT':''}):
            self.assertEqual(self.request('GET','/api/navigation/geocode?q=123%20Main%20St')[0],503)
            self.assertEqual(self.request('GET','/api/navigation/geocode?q=123%20Main%20St&online=1')[0],403)
            with patch('openrf.server.address_search',return_value={'results':[], 'provider':'photon-public-opt-in'}) as stub:
                status,data=self.request('GET','/api/navigation/geocode?q=123%20Main%20St&online=1',
                    headers={'X-OpenRF-Address-Consent':'yes'})
                self.assertEqual(status,200)
                stub.assert_called_once_with('123 Main St',online_allowed=True,final=False)
            self.assertEqual(self.request('GET','/api/navigation/geocode?q=123%20Main%20St&online=0')[0],400)
            self.assertEqual(self.request('GET','/api/navigation/geocode?q=123%20Main%20St&url=https://evil.example')[0],400)
            self.assertEqual(self.request('GET','/api/navigation/geocode?q=123%20Main%20St&mode=final')[0],503)
            self.assertEqual(self.request('GET','/api/navigation/geocode?q=123%20Main%20St&mode=final&online=1')[0],403)
            with patch('openrf.server.address_search',return_value={'results':[], 'provider':'us-census-opt-in'}) as stub:
                status,data=self.request('GET','/api/navigation/geocode?q=123%20Main%20St&online=1&mode=final',
                    headers={'X-OpenRF-Address-Consent':'yes'})
                self.assertEqual(status,200)
                stub.assert_called_once_with('123 Main St',online_allowed=True,final=True)
            self.assertEqual(self.request('GET','/api/navigation/geocode?q=x&mode=other&online=1',
                headers={'X-OpenRF-Address-Consent':'yes'})[0],400)

    def test_route_validation_no_implicit_network(self):
        self.assertEqual(self.request('POST','/api/navigation/route',{'locations':[]})[0],422)
        self.assertEqual(self.request('POST','/api/navigation/route',{'locations':[], 'url':'http://example.com'})[0],400)
        with patch('openrf.server.local_route',side_effect=RouteUnavailable('No local routing available')):
            status,data=self.request('POST','/api/navigation/route',{
                'locations':[{'latitude':38,'longitude':-120},{'latitude':38.1,'longitude':-120.1}]})
        self.assertEqual(status,503)
        self.assertEqual(data['error_code'],'routing_unavailable')
        self.assertEqual(self.repo.list_observations(),[])
        self.assertEqual(self.repo.list_waypoints()['total'],0)


if __name__=='__main__':
    unittest.main()
