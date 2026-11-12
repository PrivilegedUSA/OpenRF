'use strict';
// Pure, offline navigation mathematics and printable route-sheet formatting.
// No GPS acquisition, storage, network traffic, timers, or automatic rerouting.
(function (root) {
  const RAD=Math.PI/180;
  const METERS_PER_MILE=1609.344;
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function distance(a,b){
    const lat=(a[1]+b[1])/2*RAD, dx=(b[0]-a[0])*RAD*Math.cos(lat),dy=(b[1]-a[1])*RAD;
    return Math.hypot(dx,dy)*6371008.8;
  }
  function bearing(a,b){
    const lat1=a[1]*RAD,lat2=b[1]*RAD,dl=(b[0]-a[0])*RAD;
    const y=Math.sin(dl)*Math.cos(lat2);
    const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dl);
    return (Math.atan2(y,x)/RAD+360)%360;
  }
  function routeMetric(route){
    if (!route || route.type!=='ROAD_ROUTE' || route.is_driving_route!==true || !Array.isArray(route.coordinates) || route.coordinates.length<2)
      throw Error('A verified road route is required.');
    if(route.coordinates.length>100000)throw Error('Road route is too large.');
    const total=[0];
    for(let i=1;i<route.coordinates.length;i++){
      const a=route.coordinates[i-1],b=route.coordinates[i];
      if(!Array.isArray(a)||!Array.isArray(b)||![...a,...b].every(Number.isFinite))throw Error('Invalid route geometry.');
      total[i]=total[i-1]+distance(a,b);
    }
    return total;
  }
  function locate(route,lon,lat,prior=0){
    const cumulative=routeMetric(route), coords=route.coordinates;
    if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Invalid reported location.');
    const q=[lon,lat], factor=Math.cos(lat*RAD), scale=111195;
    const sq=(a,b)=>Math.hypot((a[0]-b[0])*factor,(a[1]-b[1]))*scale;
    // Segment projection is important when a route has long or sparsely sampled segments.
    // A coarse scan bounds work on a large multi-state route; refine nearby segments.
    const stride=Math.max(1,Math.ceil((coords.length-1)/3500));
    let best={offset_m:Infinity,along_m:0,index:0,fraction:0};
    function check(i){
      const a=coords[i],b=coords[i+1],dx=(b[0]-a[0])*factor,dy=b[1]-a[1];
      const u=(q[0]-a[0])*factor,v=q[1]-a[1];
      const t=clamp((dx*u+dy*v)/(dx*dx+dy*dy||1),0,1);
      const projected=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
      const offset=sq(q,projected);
      if(offset<best.offset_m){best={offset_m:offset,index:i,fraction:t,along_m:cumulative[i]+t*(cumulative[i+1]-cumulative[i])};}
    }
    for(let i=0;i<coords.length-1;i+=stride)check(i);
    const center=best.index;
    for(let i=Math.max(0,center-stride);i<Math.min(coords.length-1,center+stride+1);i++)check(i);
    // A small backward jitter cannot reverse completed steps.
    best.along_m=Math.max(0,best.along_m,Number.isFinite(prior)?prior-25:0);
    return {...best,total_m:cumulative.at(-1),cumulative};
  }
  // Visual camera orientation along the verified route, deliberately distinct
  // from GPS heading. Used when there is no reliable measured moving bearing.
  // The blue position marker always stays at the reported position; the bearing
  // here does not constitute vehicle heading or active maneuver guidance.
  function routeVisualHeading(route,lon,lat,prior=0){
    const point=locate(route,lon,lat,prior),coords=route.coordinates;
    const cumulative=point.cumulative;
    if(point.total_m<=0)return null;
    const forward=Math.min(point.total_m,point.along_m+75);
    const backward=Math.max(0,point.along_m-75);
    function at(m){
      if(m<=0)return coords[0];
      if(m>=point.total_m)return coords.at(-1);
      let j=Math.min(point.index,coords.length-2);
      // The nearest point can lie on a different segment after prior jitter;
      // seek the intended cumulative distance from either side.
      while(j>0 && cumulative[j]>m)j--;
      while(j<coords.length-2 && cumulative[j+1]<m)j++;
      const segment=cumulative[j+1]-cumulative[j];
      const t=segment>0?clamp((m-cumulative[j])/segment,0,1):0;
      return [coords[j][0]+(coords[j+1][0]-coords[j][0])*t,
        coords[j][1]+(coords[j+1][1]-coords[j][1])*t];
    }
    let start=at(point.along_m),end=at(forward);
    if(distance(start,end)<8){start=at(backward);end=at(point.along_m);}
    if(distance(start,end)<2)return null;
    return {heading:bearing(start,end),offset_m:point.offset_m,along_m:point.along_m};
  }
  function nextTurn(route,position){
    const {cumulative,along_m}=position;
    const maneuvers=(route.maneuvers||[]).filter(m=>Number.isInteger(m.shape_index)&&m.shape_index>=0&&m.shape_index<cumulative.length&&typeof m.instruction==='string');
    const next=maneuvers.find(m=>cumulative[m.shape_index]>=along_m+8);
    return next?{...next,distance_m:Math.max(0,cumulative[next.shape_index]-along_m)}:null;
  }
  function distanceText(m){
    if(!Number.isFinite(m)||m<0)return 'unknown distance';
    return m<305?`${Math.max(10,Math.round(m/3.048)*10)} ft`:`${(m/METERS_PER_MILE).toFixed(m<3218?1:0)} mi`;
  }
  function guidance(route,lon,lat,accuracy,progress=0){
    const match=locate(route,lon,lat,progress);
    const offroute=match.offset_m>Math.max(40,accuracy*2);
    const updated=Math.max(progress,match.along_m);
    const next=nextTurn(route,{...match,along_m:updated});
    return {...match,along_m:updated,offroute,next,remaining_m:Math.max(0,match.total_m-updated)};
  }
  function htmlEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function routeSteps(route){
    routeMetric(route);
    return (route.maneuvers||[]).filter(m=>typeof m.instruction==='string').slice(0,250).map((m,i)=>({number:i+1,
      instruction:String(m.instruction).slice(0,400),length_miles:Number.isFinite(m.length_miles)?Math.max(0,m.length_miles):0,leg:Number(m.leg)||1}));
  }
  function sheet(route,labels={}){
    const steps=routeSteps(route);
    const origin=htmlEscape(labels.origin||'Starting location');
    const destination=htmlEscape(labels.destination||'Destination');
    const miles=Number(route.distance_miles)||0;
    const minutes=Math.round((Number(route.duration_seconds)||0)/60);
    const rows=steps.map(s=>`<li><strong>${htmlEscape(s.instruction)}</strong><span>${s.length_miles.toFixed(2)} mi · Leg ${s.leg}</span></li>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenRF Directions</title><style>body{font:16px/1.5 system-ui,Arial,sans-serif;max-width:780px;margin:32px auto;padding:0 20px;color:#182129}h1{margin-bottom:4px}header{border-bottom:2px solid #35616b;margin-bottom:20px;padding-bottom:15px}ol{padding-left:28px}li{break-inside:avoid;margin:0 0 14px;padding-left:6px}li span{display:block;color:#555;font-size:13px}footer{border-top:1px solid #aaa;padding-top:12px;color:#666;font-size:12px}@media print{body{margin:0;max-width:none;padding:0}button{display:none}}</style></head><body><header><small>OPENRF · OFFLINE-CAPABLE ROUTE SHEET</small><h1>Driving directions</h1><p><b>From:</b> ${origin}<br><b>To:</b> ${destination}</p><p><b>Distance:</b> ${miles.toFixed(2)} mi · <b>Estimated time:</b> ${minutes} min (no live traffic)</p></header><main><h2>Planned turns (${steps.length})</h2><ol>${rows}</ol></main><footer>Calculated using local Valhalla / © OpenStreetMap contributors. Planning only. Review route restrictions, signage and conditions. Not live guidance. No GPS history is included.</footer></body></html>`;
  }
  root.OpenRFRouteGuidance=Object.freeze({distance,bearing,locate,routeVisualHeading,nextTurn,distanceText,guidance,routeSteps,sheet});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.OpenRFRouteGuidance;
})(typeof window!=='undefined'?window:globalThis);
