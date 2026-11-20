/* OpenRF v0.2.144: numeric terrain profile, distinct from reported GPS altitude.
   Samples planned route geometry at equal distances; no network request here. */
(() => {
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const earth=6371000;
  function distance(a,b){
    const toR=Math.PI/180,dl=(b[1]-a[1])*toR,dn=(b[0]-a[0])*toR;
    const h=Math.sin(dl/2)**2+Math.cos(a[1]*toR)*Math.cos(b[1]*toR)*Math.sin(dn/2)**2;
    return 2*earth*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function sample(coordinates,n=13){
    if(!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>100000)return null;
    const points=coordinates.map(p=>Array.isArray(p)&&p.length>=2?[Number(p[0]),Number(p[1])]:null);
    if(points.some(p=>!p||!p.every(Number.isFinite)||p[0]<-180||p[0]>180||p[1]<-85||p[1]>85))return null;
    const lengths=[0];
    for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+distance(points[i-1],points[i]));
    const total=lengths.at(-1);
    if(!Number.isFinite(total)||total<1)return null;
    const result=[];let j=1;
    for(let k=0;k<n;k++){
      const at=total*k/(n-1);
      while(j<lengths.length-1 && lengths[j]<at)j++;
      const span=lengths[j]-lengths[j-1];
      const t=span>0?Math.max(0,Math.min(1,(at-lengths[j-1])/span)):0;
      result.push(points[j-1].map((v,axis)=>Number((v+(points[j][axis]-v)*t).toFixed(6))));
    }
    return result;
  }
  function draw(container,data,distanceMiles){
    container.replaceChildren();
    const elevations=data?.elevations_m;
    if(!Array.isArray(elevations)||elevations.length<2)return null;
    const valid=elevations.filter(v=>typeof v==='number'&&Number.isFinite(v));
    if(valid.length<2)return null;
    const min=Math.min(...valid),max=Math.max(...valid),span=Math.max(max-min,10);
    const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('viewBox','0 0 410 148');svg.setAttribute('role','img');
    svg.setAttribute('aria-label',`Terrain elevation along route, ${Math.round(min*3.28084)} to ${Math.round(max*3.28084)} feet`);
    const line=(tag,attrs,content)=>{
      const el=document.createElementNS(NS,tag);
      for(const [name,value] of Object.entries(attrs))el.setAttribute(name,String(value));
      if(content!==undefined)el.textContent=content;
      svg.append(el);return el;
    };
    const low=116,high=20,left=47,right=395;
    line('line',{x1:left,y1:low,x2:right,y2:low,stroke:'#52737a','stroke-width':1});
    line('line',{x1:left,y1:high,x2:left,y2:low,stroke:'#52737a','stroke-width':1});
    const segments=[];let segment=[];
    elevations.forEach((height,i)=>{
      if(typeof height!=='number'||!Number.isFinite(height)){
        if(segment.length>1)segments.push(segment);
        segment=[];return;
      }
      const x=left+(right-left)*i/(elevations.length-1);
      const y=low-((height-min)/span)*(low-high);
      segment.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    });
    if(segment.length>1)segments.push(segment);
    for(const points of segments)line('polyline',{points:points.join(' '),fill:'none',stroke:'#32d4bd','stroke-width':2.7,'stroke-linecap':'round','stroke-linejoin':'round'});
    line('text',{x:4,y:high+4,fill:'#d3eeed','font-size':10},`${Math.round(max*3.28084)} ft`);
    line('text',{x:4,y:low+2,fill:'#9ec0c3','font-size':10},`${Math.round(min*3.28084)} ft`);
    line('text',{x:left,y:139,fill:'#9ec0c3','font-size':10},'Start');
    line('text',{x:right,y:139,fill:'#9ec0c3','font-size':10,'text-anchor':'end'},`${Number(distanceMiles).toFixed(1)} mi`);
    container.append(svg);
    return {minFeet:Math.round(min*3.28084),maxFeet:Math.round(max*3.28084)};
  }
  window.OpenRFRouteElevation=Object.freeze({sample,draw});
})();
