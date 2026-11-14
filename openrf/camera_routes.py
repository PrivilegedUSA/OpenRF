"""Evidence-limited, offline camera proximity reports for verified Valhalla roads.

A reported camera point is not a confirmed enforcement direction, operational
status, or road encounter. No browser/GNSS positions are persisted here.
"""
from __future__ import annotations

import math
from . import camera_catalog
from .routing import local_route, RouteError, RouteUnavailable

RADIUS_M = 120
MAX_DISPLAY = 24
MAX_EXCLUSIONS = 8


def camera_types(values):
    if not isinstance(values, list) or not values or len(values) > 3 or any(type(x) is not str for x in values):
        raise ValueError('Choose one or more camera categories.')
    chosen = set(values)
    if not chosen <= camera_catalog.TYPES:
        raise ValueError('Unknown camera category.')
    return chosen


def _meters_to_segment(lat, lon, first, second):
    """Local projection over one short Valhalla edge; result in meters."""
    # Local-scale cosine correction is adequate for identifying *nearby* pins.
    lat_scale = 111195.0
    lon_scale = lat_scale * math.cos(math.radians(lat))
    x0, y0 = (first[0] - lon)*lon_scale, (first[1]-lat)*lat_scale
    x1, y1 = (second[0] - lon)*lon_scale, (second[1]-lat)*lat_scale
    dx, dy = x1-x0, y1-y0
    frac = min(1.0, max(0.0, -(x0*dx+y0*dy)/(dx*dx+dy*dy))) if dx*dx+dy*dy else 0.0
    return math.hypot(x0+frac*dx, y0+frac*dy)


def route_cameras(repo, route, types=None, *, radius_m=RADIUS_M):
    if route.get('type') != 'ROAD_ROUTE' or route.get('is_driving_route') is not True:
        raise ValueError('Only actual Valhalla road routes can be compared.')
    coords = route.get('coordinates')
    if not isinstance(coords, list) or not 2 <= len(coords) <= 100000:
        raise ValueError('A drivable route geometry is required.')
    chosen = set(camera_catalog.TYPES) if types is None else camera_types(types)
    if not 30 <= radius_m <= 300:
        raise ValueError('Unsupported proximity radius.')
    pad = 0.01
    bbox = (max(-180,min(p[0] for p in coords)-pad), max(-90,min(p[1] for p in coords)-pad),
            min(180,max(p[0] for p in coords)+pad), min(90,max(p[1] for p in coords)+pad))
    # The area bounding box may include sites not actually near the road.
    # The browser receives only the nearest matches and bounded totals.
    result = camera_catalog.list_sites(repo,bbox,limit=1200)
    nearby = []
    for entry in result['sites']:
        if entry['type'] not in chosen: continue
        lat,lon = entry['latitude'],entry['longitude']
        if not (math.isfinite(lat) and math.isfinite(lon)): continue
        best = float('inf')
        for a,b in zip(coords,coords[1:]):
            if lat < min(a[1],b[1])-.003 or lat > max(a[1],b[1])+.003 or lon < min(a[0],b[0])-.004 or lon > max(a[0],b[0])+.004:
                continue
            best = min(best,_meters_to_segment(lat,lon,a,b))
            if best < 4: break
        if best <= radius_m:
            nearby.append({'id':str(entry['id']), 'type':entry['type'],'state':entry['state'],
                           'label':entry['label'],'latitude':lat,'longitude':lon,
                           'source':entry['source'],'distance_m':round(best)})
    nearby.sort(key=lambda x: (x['distance_m'],x['type'],x['id']))
    return {'count':len(nearby), 'sites':nearby[:MAX_DISPLAY],
            'incomplete':bool(result['truncated'] or len(nearby)>MAX_DISPLAY),
            'radius_m':radius_m,'types':sorted(chosen),
            'notice':'Reported camera positions within approximately 120 m of the drawn road. Not proof of operation, driving direction, or complete coverage.'}


def compare(repo, locations, types, *, router=local_route):
    """Evaluate normal route and opt-in camera-exclusion alternative.

    The latter is never automatically activated. Excluding roads may fail or
    lead to a longer route; failures preserve the original route.
    """
    chosen = camera_types(types)
    standard = router(locations)
    original = route_cameras(repo,standard,sorted(chosen))
    response = {'standard': standard, 'standard_cameras': original,
                'alternative':None,'alternative_cameras':None,
                'exclusions_used':0,'detail':''}
    if len(locations)!=2:
        response['detail']='Camera-aware alternatives currently support a single destination without intermediate stops.'
        return response
    if original['incomplete']:
        response['detail']='Camera catalog was truncated; a reliable comparison is not available. Zoom or choose a shorter route.'
        return response
    if not original['count']:
        response['detail']='No selected camera reports were close to the calculated route. That does not mean the route is camera-free.'
        return response
    start=(float(locations[0]['latitude']),float(locations[0]['longitude']))
    finish=(float(locations[-1]['latitude']),float(locations[-1]['longitude']))
    def approx_m(a,b):
        lat=(a[0]+b[0])/2
        return math.hypot((a[0]-b[0])*111195,(a[1]-b[1])*111195*math.cos(math.radians(lat)))
    exclusions=[]
    for site in original['sites']:
        here=(site['latitude'],site['longitude'])
        if approx_m(here,start)<250 or approx_m(here,finish)<250: continue
        if any(approx_m(here,(q['latitude'],q['longitude'])) < 160 for q in exclusions): continue
        exclusions.append({'latitude':here[0],'longitude':here[1]})
        if len(exclusions)==MAX_EXCLUSIONS:break
    if not exclusions:
        response['detail']='All mapped nearby camera locations are near the origin or destination; no safe exclusion points were selected.'
        return response
    try:
        alternate=router(locations,exclude_locations=exclusions)
        report=route_cameras(repo,alternate,sorted(chosen))
    except (RouteError, RouteUnavailable, ValueError) as exc:
        response['detail']=f'Valhalla could not calculate a camera-aware alternative. Your original route is unchanged. {exc}'
        return response
    response.update(alternative=alternate,alternative_cameras=report,exclusions_used=len(exclusions),
        detail='Compare before selecting. Road exclusions are approximate; missing or outdated camera reports may remain.')
    return response
