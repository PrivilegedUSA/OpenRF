'use strict';
// Pure navigational geometry for a PREVIEW ONLY; there is no road routing,
// incident location, GPS tracking, police identification, or spoken guidance.
(function (root) {
  function point(latitude, longitude) {
    if (latitude === '' || longitude === '' || latitude === null || longitude === null ||
        latitude === undefined || longitude === undefined) throw Error('Enter both latitude and longitude.');
    const lat = Number(latitude), lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      throw Error('Enter valid coordinates: latitude -90 to 90 and longitude -180 to 180.');
    return [lon, lat];
  }
  const radians = v => v * Math.PI / 180;
  function preview(origin, destination) {
    const [lon1, lat1] = point(origin[1], origin[0]);
    const [lon2, lat2] = point(destination[1], destination[0]);
    const phi1 = radians(lat1), phi2 = radians(lat2), dphi = phi2-phi1;
    const dlambda = radians(((lon2-lon1+540)%360)-180);
    const a = Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlambda/2)**2;
    const km = 6371.0088 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0,1-a))));
    const y = Math.sin(dlambda)*Math.cos(phi2);
    const x = Math.cos(phi1)*Math.sin(phi2)-Math.sin(phi1)*Math.cos(phi2)*Math.cos(dlambda);
    const bearing = km < 1e-6 ? null : (Math.atan2(y,x)*180/Math.PI+360)%360;
    return {origin:[lon1,lat1], destination:[lon2,lat2], distance_km:km,
      bearing_degrees:bearing, type:'DIRECT_DISTANCE_ONLY', is_driving_route:false};
  }
  root.OpenRFNavigation = Object.freeze({point, preview});
})(window);
