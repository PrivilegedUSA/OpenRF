'use strict';
// Offline, evidence-limited camera *map report* approach alerts. This module
// reads no location hardware, persists no GPS points and never transmits.
// Only the active GPS-follow caller can evaluate it with fresh real fixes.
(function(root){
  const TYPES=['ALPR','RED_LIGHT','SPEED'];
  const DISTANCES=[0.25,0.5,1];
  const MILE_M=1609.344;
  function preferences(stored){
    const value=stored && typeof stored==='object' && !Array.isArray(stored)?stored:{};
    const kinds=value.types && typeof value.types==='object'?value.types:{};
    return {
      enabled:typeof value.enabled==='boolean'?value.enabled:true,
      voice:value.voice===true,
      miles:DISTANCES.includes(value.miles)?value.miles:0.5,
      types:Object.fromEntries(TYPES.map(k=>[k,typeof kinds[k]==='boolean'?kinds[k]:true]))
    };
  }
  function candidates(route,report,guide){
    if(route?.type!=='ROAD_ROUTE'||route?.is_driving_route!==true||
       !Array.isArray(route.coordinates)||route.coordinates.length<2 ||
       !Array.isArray(report?.sites)||typeof guide?.locate!=='function')
      return {sites:[],count:0,incomplete:false,ready:false};
    const seen=new Set(),sites=[];
    const radius=Math.min(150,Math.max(30,Number(report.radius_m)||120));
    for(const site of report.sites.slice(0,256)){
      if(!site || !TYPES.includes(site.type) || site.state==='REMOVED' ||
         !Number.isFinite(site.latitude) || !Number.isFinite(site.longitude) ||
         Math.abs(site.latitude)>90 || Math.abs(site.longitude)>180)continue;
      const key=`${site.type}:${String(site.id??'')}@${site.latitude.toFixed(6)},${site.longitude.toFixed(6)}`;
      if(seen.has(key))continue;
      try{
        const p=guide.locate(route,site.longitude,site.latitude,0);
        if(!Number.isFinite(p.along_m)||!Number.isFinite(p.offset_m)||p.offset_m>radius)continue;
        seen.add(key);
        sites.push({key,type:site.type,state:String(site.state||'REPORTED'),
          label:String(site.label||''),source:String(site.source||''),along_m:p.along_m,offset_m:p.offset_m});
      }catch(_error){ /* bad route/camera geometry never produces a warning */ }
    }
    sites.sort((a,b)=>a.along_m-b.along_m);
    return {sites,count:Number.isFinite(report.count)?report.count:sites.length,
      incomplete:report.incomplete===true||report.sites.length>256,ready:true};
  }
  function approach(catalog,prefs,fix,alreadyAlerted){
    const settings=preferences(prefs);
    // A route-aligned map camera or approximate desktop fix is not evidence
    // of actual movement toward a camera. Never alert in those conditions.
    if(!settings.enabled || !catalog?.ready || !Array.isArray(catalog.sites) || !fix ||
       !Number.isFinite(fix.along_m)||!Number.isFinite(fix.accuracy_m)||fix.accuracy_m<0||fix.accuracy_m>40||
       !Number.isFinite(fix.age_ms)||fix.age_ms<0||fix.age_ms>5000||
       fix.offroute===true||fix.moving!==true||fix.headingAligned!==true)
      return null;
    const limit=settings.miles*MILE_M;
    let nearest=null,meters=Infinity;
    for(const site of catalog.sites){
      if(!settings.types[site.type])continue;
      const distance=site.along_m-fix.along_m;
      if(distance < -20 || distance>limit)continue;
      if(distance < meters){meters=Math.max(0,distance);nearest=site;}
    }
    if(!nearest)return null;
    return {site:nearest,distance_m:meters,newAlert:!alreadyAlerted?.has(nearest.key)};
  }
  function distanceLabel(meters){
    if(!Number.isFinite(meters)||meters<0)return 'nearby';
    if(meters<160)return `${Math.max(100,Math.round(meters/30.48)*100)} ft`;
    return `${(meters/MILE_M).toFixed(1)} mi`;
  }
  function typeLabel(kind){return ({ALPR:'ALPR camera',SPEED:'speed camera',RED_LIGHT:'red-light camera'})[kind]||'camera';}
  const api={preferences,candidates,approach,distanceLabel,typeLabel};
  root.OpenRFCameraAlerts=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
