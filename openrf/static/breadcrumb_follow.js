/* OpenRF v0.2.140 — pure local geometric reference for live backtrack preview.
   This is NOT a routing engine and never verifies a trail or road. */
((root,factory)=>{
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  if(root)root.OpenRFBreadcrumbFollow=api;
})(typeof window!=='undefined'?window:null,()=>{
  'use strict';
  const radius=6371000,rad=Math.PI/180;
  const deltaLon=(a,b)=>((b-a+540)%360)-180;
  const usable=p=>p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    Math.abs(p.latitude)<=90 && Math.abs(p.longitude)<=180;
  function metersBetween(a,b){
    const lat1=a.latitude*rad,lat2=b.latitude*rad,dy=lat2-lat1,dx=deltaLon(a.longitude,b.longitude)*rad;
    const h=Math.sin(dy/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dx/2)**2;
    return 2*radius*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function closest(points,position){
    if(!Array.isArray(points)||points.length<2||points.length>5000||!points.every(usable)||!usable(position))
      throw Error('Saved track must contain at least two valid position fixes');
    let total=0,best=null;
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1];
      // Local East/North projection at the segment's latitude is accurate for
      // short GPS segments, without claiming survey precision.
      const cosine=Math.max(.00001,Math.cos((a.latitude+b.latitude)/2*rad));
      const bx=deltaLon(a.longitude,b.longitude)*rad*radius*cosine;
      const by=(b.latitude-a.latitude)*rad*radius;
      const px=deltaLon(a.longitude,position.longitude)*rad*radius*cosine;
      const py=(position.latitude-a.latitude)*rad*radius;
      const sq=bx*bx+by*by,t=sq>0?Math.max(0,Math.min(1,(px*bx+py*by)/sq)):0;
      const distance=Math.hypot(px-t*bx,py-t*by);
      const length=metersBetween(a,b);
      if(!best || distance<best.offtrack_m)
        best={offtrack_m:distance,remaining_to_start_m:total+length*t,segment:i};
      total+=length;
    }
    return {...best,total_m:total,straight_to_start_m:metersBetween(position,points[0])};
  }
  function assessFix(position,mode,now=Date.now()){
    const p=position?.coords;
    if(!p)return {ok:false,reason:'No browser position received'};
    const fix={latitude:p.latitude,longitude:p.longitude};
    const accuracy=p.accuracy,age=(now-position.timestamp)/1000;
    if(!usable(fix)||!Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(age)||age< -5)
      return {ok:false,reason:'Invalid browser location report'};
    if(age>12)return {ok:false,reason:`Position is stale (${Math.round(age)}s old)`};
    const limit=mode==='auto'?60:35;
    if(accuracy>limit)return {ok:false,reason:`Location approximate (±${Math.round(accuracy)}m; need ±${limit}m or better)`};
    return {ok:true,...fix,accuracy_m:accuracy,age_s:Math.max(0,age)};
  }
  function threshold(mode,accuracy){return Math.max(mode==='auto'?85:55,2*accuracy);}
  return Object.freeze({closest,assessFix,threshold,metersBetween});
});
