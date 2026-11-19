'use strict';
// Pure, offline navigation mathematics and printable route-sheet formatting.
// No GPS acquisition, storage, network traffic, or timers. Includes a pure
// conservative decision gate for caller-initiated local rerouting.
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
  function routeMetric(route,{allowWalkingPlan=false}={}){
    // Turn-by-turn *plans* may be pedestrian. Every caller that measures a
    // moving position, simulates a drive or starts follow-view must still
    // require a verified driving route (the default).
    const driving=route?.is_driving_route===true && route?.travel_mode!=='pedestrian';
    const walking=allowWalkingPlan && route?.is_driving_route===false && route?.travel_mode==='pedestrian';
    if (!route || route.type!=='ROAD_ROUTE' || (!driving && !walking) || !Array.isArray(route.coordinates) || route.coordinates.length<2)
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
  function locate(route,lon,lat,prior=0,{allowWalkingPlan=false}={}){
    const cumulative=routeMetric(route,{allowWalkingPlan}), coords=route.coordinates;
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
  // Deterministic DEMO route sampler. Uses only verified Valhalla road geometry,
  // never calls a geolocation API and never produces a real-world observation.
  function sampleRoute(route,meters){
    const cumulative=routeMetric(route),coords=route.coordinates,total=cumulative.at(-1);
    if(!Number.isFinite(meters))throw Error('Invalid simulation distance.');
    const along=clamp(meters,0,total);
    function sample(m){
      if(m<=0)return coords[0].slice();
      if(m>=total)return coords.at(-1).slice();
      let lo=0,hi=cumulative.length-1;
      while(lo+1<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<=m)lo=mid;else hi=mid;}
      const segment=cumulative[hi]-cumulative[lo];
      const t=segment>0?clamp((m-cumulative[lo])/segment,0,1):0;
      return [coords[lo][0]+(coords[hi][0]-coords[lo][0])*t,
        coords[lo][1]+(coords[hi][1]-coords[lo][1])*t];
    }
    const point=sample(along),ahead=sample(Math.min(total,along+45));
    const behind=sample(Math.max(0,along-45));
    const target=distance(point,ahead)>2?ahead:point;
    const origin=distance(point,ahead)>2?point:behind;
    // At departure show the first planned maneuver as the DEMO headline;
    // after moving ahead, continue showing upcoming turns normally.
    const first=(route.maneuvers||[])[0];
    const initial=(along<10 && first && first.shape_index===0 && typeof first.instruction==='string')
      ?{...first,distance_m:0}:null;
    const next=initial||nextTurn(route,{cumulative,along_m:along});
    return {lon:point[0],lat:point[1],heading:distance(origin,target)>2?bearing(origin,target):0,
      along_m:along,total_m:total,remaining_m:Math.max(0,total-along),next,arrived:along>=total-1};
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
  // Passive, user-started walking follow. No rerouting, spoken prompts or
  // movement inference. A route graph is not proof of legal or safe access.
  // Keep walking validation separate from the driving-only locate() default.
  function walkingGuidance(route,lon,lat,accuracy,prior=0){
    if(route?.type!=='ROAD_ROUTE'||route?.travel_mode!=='pedestrian'||route?.is_driving_route!==false)
      throw Error('A real local Valhalla walking route is required.');
    if(!Number.isFinite(accuracy)||accuracy<0||accuracy>1000)
      throw Error('A valid reported walking GPS accuracy is required.');
    const match=locate(route,lon,lat,prior,{allowWalkingPlan:true});
    const offroute=match.offset_m>Math.max(35,accuracy*2);
    const along=Math.max(0,match.along_m);
    const remaining=Math.max(0,match.total_m-along);
    const turns=(route.maneuvers||[]).filter(t=>typeof t.instruction==='string' &&
      Number.isInteger(t.shape_index)&&t.shape_index>=0&&t.shape_index<match.cumulative.length);
    let turnIndex=0;
    // Keep "arrive" dormant until near the actual end. The first instruction
    // describes the path you're currently on; don't immediately skip it just
    // because its shape_index is zero.
    for(let i=1;i<turns.length;i++){
      const distanceToTurn=match.cumulative[turns[i].shape_index]-along;
      const arrival=i===turns.length-1;
      if(distanceToTurn<=5 && (!arrival||remaining<=20))turnIndex=i;
    }
    const active=turns[turnIndex]||null,next=turns[turnIndex+1]||null;
    const nextDistance=next ? Math.max(0,match.cumulative[next.shape_index]-along):null;
    return {...match,offroute,along_m:along,remaining_m:remaining,
      instruction:active?.instruction||'Follow the planned walking route.',
      next_instruction:next?.instruction||null,next_distance_m:nextDistance};
  }
  function rerouteDecision(memory,fix){
    const count=Number(memory?.count)||0;
    const since=Number(memory?.since)||0;
    const lastAttempt=Number(memory?.lastAttempt)||0;
    const now=Number(fix?.timeMs);
    const reliable=Number.isFinite(now)&&now>0&&Number.isFinite(fix?.accuracy_m)&&
      fix.accuracy_m>=0&&fix.accuracy_m<=40&&fix.moving===true&&
      Number.isFinite(fix?.offset_m)&&fix.offset_m>Math.max(100,3*fix.accuracy_m);
    if(!reliable)return {count:0,since:0,trigger:false};
    const nextCount=count+1,first=since||now;
    const trigger=nextCount>=3 && now-first>=5000 && (!lastAttempt||now-lastAttempt>=45000);
    return {count:nextCount,since:first,trigger};
  }
  const LANE_DIRECTIONS=[[4,'↰'],[8,'←'],[16,'↖'],[2,'↑'],[32,'↗'],[64,'→'],[128,'↱'],[256,'↶'],[512,'↖'],[1024,'↗']];
  function laneGuidance(turn){
    if(!turn || !Array.isArray(turn.lanes) || turn.lanes.length<1 || turn.lanes.length>12)return [];
    const result=[];
    for(const lane of turn.lanes){
      if(!lane || !Number.isInteger(lane.directions) || lane.directions<0 || lane.directions>2047)return [];
      const arrows=LANE_DIRECTIONS.filter(([mask])=>(lane.directions&mask)!==0).map(([,symbol])=>symbol);
      if(!arrows.length)return [];
      const active=Number.isInteger(lane.active) && lane.active>0 && (lane.active&lane.directions)!==0;
      const valid=active || (Number.isInteger(lane.valid) && lane.valid>0 && (lane.valid&lane.directions)!==0);
      result.push({arrows:arrows.join(' '),active,valid});
    }
    return result;
  }
  function voiceCue(memory,turn){
    // The caller must gate on explicit opt-in, fresh accurate GPS and movement.
    const old=memory||{key:null,stage:0};
    if(!turn || !Number.isFinite(turn.distance_m) || turn.distance_m<0)return {memory:old,text:null};
    const key=`${turn.leg}:${turn.shape_index}:${turn.instruction}`;
    const stage=key===old.key ? (Number(old.stage)||0) : 0;
    // Two spoken checkpoints, once each per maneuver; never speak a DEMO position.
    const nextStage=turn.distance_m<=90?2:turn.distance_m<=400?1:0;
    if(nextStage<=stage)return {memory:{key,stage},text:null};
    const verbal=nextStage===2?turn.verbal_pre_transition_instruction:turn.verbal_transition_alert_instruction;
    const text=typeof verbal==='string' && verbal.trim() ? verbal.trim().slice(0,300) :
      (typeof turn.instruction==='string'?turn.instruction.slice(0,300):null);
    return {memory:{key,stage:nextStage},text};
  }
  function htmlEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function turnAvoidPoint(route,turn){
    if(!route || !Array.isArray(route.coordinates) || !turn || !Number.isInteger(turn.shape_index))return null;
    const coords=route.coordinates,start=turn.shape_index;
    if(start<0 || start>=coords.length-1)return null;
    const upcoming=(route.maneuvers||[]).map(m=>m.shape_index).filter(i=>Number.isInteger(i)&&i>start).sort((a,b)=>a-b);
    const limit=Math.min(coords.length-1,upcoming.length?upcoming[0]:coords.length-1);
    if(limit<=start)return null;
    let total=0;
    for(let i=start;i<limit;i++){
      const a=coords[i],b=coords[i+1];
      if(!Array.isArray(a)||!Array.isArray(b)||a.length<2||b.length<2 || ![...a,...b].every(Number.isFinite))return null;
      total+=distance(a,b);
    }
    if(total<12)return null;
    const target=Math.min(40,total/2);
    let traveled=0;
    for(let i=start;i<limit;i++){
      const a=coords[i],b=coords[i+1];const meters=distance(a,b);
      if(meters<=0)continue;
      if(traveled+meters>=target){
        const t=(target-traveled)/meters;
        return {longitude:a[0]+(b[0]-a[0])*t,latitude:a[1]+(b[1]-a[1])*t};
      }
      traveled+=meters;
    }
    return null;
  }
  function routeSteps(route){
    routeMetric(route,{allowWalkingPlan:true});
    return (route.maneuvers||[]).filter(m=>typeof m.instruction==='string').slice(0,250).map((m,i)=>({number:i+1,
      instruction:String(m.instruction).slice(0,400),shape_index:Number.isInteger(m.shape_index)?m.shape_index:null,length_miles:Number.isFinite(m.length_miles)?Math.max(0,m.length_miles):0,leg:Number(m.leg)||1}));
  }
  function hasCompleteDirections(route){
    if(!route || !Array.isArray(route.coordinates) || route.coordinates.length<2 || !Array.isArray(route.maneuvers) || !route.maneuvers.length)return false;
    const coords=route.coordinates;
    const last=route.maneuvers[route.maneuvers.length-1];
    if(!Number.isInteger(last.shape_index) || last.shape_index<0 || last.shape_index>=coords.length)return false;
    if(!Array.isArray(coords[coords.length-1]) || !Array.isArray(coords[last.shape_index]))return false;
    let remaining=0;
    for(let i=last.shape_index;i<coords.length-1;i++){
      const a=coords[i],b=coords[i+1];
      if(!Array.isArray(a)||!Array.isArray(b)||!a.every(Number.isFinite)||!b.every(Number.isFinite))return false;
      remaining+=distance(a,b);
    }
    // Valhalla should have a last maneuver close to the final destination.
    // A route with only the first few turns is not safe to present as complete.
    return remaining<=150;
  }
  function sheet(route,labels={}){
    const steps=routeSteps(route);
    const origin=htmlEscape(labels.origin||'Starting location');
    const destination=htmlEscape(labels.destination||'Destination');
    const miles=Number(route.distance_miles)||0;
    const minutes=Math.round((Number(route.duration_seconds)||0)/60);
    const rows=steps.map(s=>`<li><strong>${htmlEscape(s.instruction)}</strong><span>${s.length_miles.toFixed(2)} mi</span></li>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenRF Directions</title><style>body{font:16px/1.5 system-ui,Arial,sans-serif;max-width:780px;margin:32px auto;padding:0 20px;color:#182129}h1{margin-bottom:4px}header{border-bottom:2px solid #35616b;margin-bottom:20px;padding-bottom:15px}ol{padding-left:28px}li{break-inside:avoid;margin:0 0 14px;padding-left:6px}li span{display:block;color:#555;font-size:13px}footer{border-top:1px solid #aaa;padding-top:12px;color:#666;font-size:12px}@media print{body{margin:0;max-width:none;padding:0}button{display:none}}</style></head><body><header><small>OPENRF · OFFLINE-CAPABLE ROUTE SHEET</small><h1>Driving directions</h1><p><b>From:</b> ${origin}<br><b>To:</b> ${destination}</p><p><b>Distance:</b> ${miles.toFixed(2)} mi · <b>Estimated time:</b> ${minutes} min (no live traffic)</p></header><main><h2>Planned turns (${steps.length})</h2><ol>${rows}</ol></main><footer>Calculated using local Valhalla / © OpenStreetMap contributors. Planning only. Review route restrictions, signage and conditions. Not live guidance. No GPS history is included.</footer></body></html>`;
  }
  root.OpenRFRouteGuidance=Object.freeze({distance,bearing,locate,routeVisualHeading,sampleRoute,nextTurn,distanceText,guidance,walkingGuidance,rerouteDecision,routeSteps,turnAvoidPoint,hasCompleteDirections,sheet,laneGuidance,voiceCue});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.OpenRFRouteGuidance;
})(typeof window!=='undefined'?window:globalThis);
