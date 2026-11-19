'use strict';
/* v0.2.101: operator-triggered trip readiness check, no location or routing. */
(()=>{
  const el=id=>document.getElementById(id);
  if(!el('map-offline-readiness'))return;
  let busy=false;
  const create=(tag,css,text)=>{const node=document.createElement(tag);node.className=css;node.textContent=text;return node;};
  async function inspect(){
    if(busy)return;busy=true;el('map-offline-check').disabled=true;
    el('map-offline-status').textContent='Checking localhost road router and offline map packages; no GPS or online request…';
    try{
      const response=await fetch('/api/navigation/offline-readiness',{cache:'no-store'});
      if(!response.ok)throw Error(`Local readiness request failed (${response.status})`);
      const data=await response.json();
      if(data.kind!=='OFFLINE_NAVIGATION_PREFLIGHT'||data.read_only!==true||
          data.gps_fix_checked!==false||data.external_requests!==false)
        throw Error('Unexpected offline readiness result');
      const box=el('map-offline-results');box.replaceChildren();
      const row=(heading,description)=>{
        const node=create('div','map-offline-row','');
        node.append(create('strong','',heading),create('span','',description));box.append(node);
      };
      row('Road router',data.routing_service_reachable?
        'Local Valhalla responds. Your intended route is not yet verified.':
        'Local Valhalla is unavailable. Turn-by-turn road routing is not ready.');
      row('Offline vector map',data.local_vector_basemap_ready?
        'Regional visual map and fonts are present (coverage is limited).':
        'Complete regional vector package/fonts not found.');
      row('Offline raster maps',`${Number.isSafeInteger(data.local_raster_package_count)&&data.local_raster_package_count>=0?data.local_raster_package_count:'Unknown'} local package(s). Visual tiles are separate from the road graph.`);
      row('GPS / route coverage','No GPS fix or chosen road route tested. Start navigation separately with location consent and a real Valhalla route.');
      el('map-offline-status').textContent=`Checked at ${data.observed_at_utc}. Internet was not contacted. ${data.routing_service_detail||''}`;
    }catch(error){
      el('map-offline-results').replaceChildren();
      el('map-offline-status').textContent=`Offline navigation preflight unavailable: ${error.message}. No navigation started.`;
    }finally{el('map-offline-check').disabled=false;busy=false;}
  }
  el('map-offline-check').addEventListener('click',inspect);
})();
