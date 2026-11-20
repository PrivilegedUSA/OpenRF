'use strict';
/* v0.2.151 — private offline map inventory; plans and real packs stay distinct.
   All network activity is local API reads except an explicitly confirmed DELETE. */
(() => {
  const $=id=>document.getElementById(id);
  if(!$('page-trips'))return;
  let inventory={maps:[],area_plans:[]};
  let busy=false,epoch=0;
  const list=$('trip-library-list'),areas=$('trip-library-areas');
  const status=$('trip-library-status');
  const filters={TRIP_CORRIDOR:'Trip corridor',REGION_DOWNLOAD:'Downloaded region',
    REGION_SUBSET:'Local region subset',IMPORTED:'Imported map'};
  const fmtBytes=value=>!Number.isFinite(value)?'Unknown':
    value<1048576?`${Math.max(0,value/1024).toFixed(1)} KiB`:`${(value/1048576).toFixed(1)} MiB`;
  function element(tag,value='',className=''){
    const result=document.createElement(tag);result.textContent=value;result.className=className;return result;
  }
  function action(label,fn,kind='outline'){
    const button=element('button',label,`btn ${kind}`);button.type='button';
    button.addEventListener('click',fn);return button;
  }
  function boundsText(bounds){
    return Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isFinite)?
      `Declared bounds · W ${bounds[0].toFixed(3)}°, S ${bounds[1].toFixed(3)}°, E ${bounds[2].toFixed(3)}°, N ${bounds[3].toFixed(3)}°`:
      'No declared geographic bounds. Coverage must be checked manually.';
  }
  async function apiLocal(url,method='GET'){
    const response=await fetch(url,{method,headers:method==='DELETE'?{'Accept':'application/json'}:{},cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||`Local request failed (HTTP ${response.status})`);
    return data;
  }
  function currentSelection(){return $('offline-map-select')?.value||'';}
  async function removePackage(map){
    if(busy)return;
    if(currentSelection()===map.id){status.textContent='This map is currently selected. Switch the Map offline basemap first, then return here.';return;}
    const typed=window.prompt(`Removing ${map.id}.mbtiles is permanent. Type its exact package ID to confirm. RF observations and investigations are not deleted.`, '');
    if(typed!==map.id){status.textContent='Removal cancelled. Exact filename confirmation was not provided.';return;}
    if(!window.confirm(`Permanently delete only ${map.id}.mbtiles (${fmtBytes(map.size_bytes)})? This cannot be undone.`))return;
    busy=true;status.textContent=`Removing ${map.id}.mbtiles…`;
    try{
      await apiLocal('/api/maps/'+encodeURIComponent(map.id),'DELETE');
      if(typeof refreshOfflineMaps==='function')await refreshOfflineMaps();
      await refresh();
      status.textContent=`Deleted ${map.id}.mbtiles. RF investigations, recorded paths and other map files were preserved.`;
    }catch(error){status.textContent=`Removal failed: ${error.message}`;}
    finally{busy=false;}
  }
  async function removePlan(plan){
    if(busy)return;
    const typed=window.prompt(`Delete saved region plan “${plan.name}”? Type its exact name to confirm. Installed maps are separate.`, '');
    if(typed!==plan.name){status.textContent='Plan removal cancelled.';return;}
    if(!window.confirm(`Delete plan “${plan.name}” only? Downloaded tiles and investigations will remain.`))return;
    busy=true;
    try{
      await apiLocal('/api/maps/areas/'+encodeURIComponent(plan.id),'DELETE');
      if(typeof refreshAreaPlans==='function')await refreshAreaPlans();
      await refresh();status.textContent=`Deleted plan “${plan.name}”; installed map packages were not touched.`;
    }catch(error){status.textContent=`Plan deletion failed: ${error.message}`;}
    finally{busy=false;}
  }
  async function useMap(map){
    try{
      if(typeof refreshOfflineMaps==='function')await refreshOfflineMaps();
      const select=$('offline-map-select');
      if(![...select.options].some(option=>option.value===map.id))throw Error('The package is no longer installed. Refresh the inventory.');
      select.value=map.id;select.dispatchEvent(new Event('change'));
      if(typeof showPage==='function')showPage('map',{autoLocate:false});
      if(map.bounds&&typeof zoomToOfflineArea==='function')
        setTimeout(()=>zoomToOfflineArea(map),140);
    }catch(error){status.textContent=`Could not activate local map: ${error.message}`;}
  }
  function viewPlan(plan){
    if(typeof showPage==='function')showPage('map',{autoLocate:false});
    const select=$('area-saved-select');
    if(select){select.value=plan.id;select.dispatchEvent(new Event('change'));}
    if(Array.isArray(plan.bounds)&&typeof focusAreaBounds==='function')
      setTimeout(()=>focusAreaBounds(plan.bounds),140);
  }
  function render(){
    const maps=inventory.maps||[],plans=inventory.area_plans||[];
    $('trip-library-count').textContent=String(maps.length);
    $('trip-library-bytes').textContent=fmtBytes(inventory.total_bytes);
    $('trip-library-area-count').textContent=String(plans.length);
    list.replaceChildren();areas.replaceChildren();
    const filtered=maps.filter(map=>$('trip-library-filter').value==='ALL'||
      $('trip-library-filter').value===map.package_kind);
    if(!filtered.length)list.append(element('p',maps.length?'No packages match this filter.':'No local raster packages installed. Prepare a map from Map → directions or offline map settings.','muted small'));
    for(const map of filtered){
      const card=element('article','','trip-library-card');card.setAttribute('role','listitem');
      const top=element('div','','trip-library-card-heading');
      top.append(element('strong',map.name||map.id),element('span',filters[map.package_kind]||'Local raster','pill'));
      const meta=element('p',`${map.id}.mbtiles · ${map.source_label||'Source unspecified'} · ${fmtBytes(map.size_bytes)} · z${map.minzoom}–${map.maxzoom}`,'trip-library-meta');
      const bounds=element('p',boundsText(map.bounds),'muted small');
      const note=element('p',map.declared_tile_count?`${map.declared_tile_count} tile(s) declared by package. Tile coverage is not independently verified.`:
        'Tile count unavailable. Package bounds and attribution are metadata, not a complete-coverage guarantee.','muted small');
      const credit=element('p',`Attribution: ${map.attribution||'Not supplied — verify source rights.'}`,'muted small');
      const buttons=element('div','','trip-library-card-actions');
      buttons.append(action('Use on map',()=>useMap(map),'primary'));
      const remove=action('Remove package',()=>removePackage(map),'danger-outline');
      if(currentSelection()===map.id){remove.disabled=true;remove.title='Switch to another offline basemap before removing this one.';}
      buttons.append(remove);card.append(top,meta,bounds,note,credit,buttons);list.append(card);
    }
    if(!plans.length)areas.append(element('p','No saved region plans. Create one under Map → Offline map files.','muted small'));
    for(const plan of plans){
      const card=element('article','','trip-library-card');card.setAttribute('role','listitem');
      const top=element('div','','trip-library-card-heading');top.append(element('strong',plan.name));
      const meta=element('p',`${boundsText(plan.bounds)} · zoom ${plan.minzoom}–${plan.maxzoom} · estimate ${plan.candidate_tiles} candidate tile slots. No tiles are stored in the plan.`,'muted small');
      const buttons=element('div','','trip-library-card-actions');
      buttons.append(action('View region on map',()=>viewPlan(plan)),action('Delete plan',()=>removePlan(plan),'danger-outline'));
      card.append(top,meta,buttons);areas.append(card);
    }
  }
  async function refresh(){
    const token=++epoch;status.textContent='Checking local map files and saved region plans…';
    try{
      const result=await apiLocal('/api/maps/catalog');
      if(token!==epoch)return;
      inventory=result;render();
      status.textContent=`Read-only local inventory · ${result.package_count} installed package(s). No GPS or online tiles requested.`;
    }catch(error){if(token===epoch)status.textContent=`Could not read local map inventory: ${error.message}`;}
  }
  $('trip-library-filter').addEventListener('change',render);
  $('trip-library-refresh').addEventListener('click',refresh);
  $('trip-library-readiness').addEventListener('click',()=>{if(typeof showPage==='function')showPage('settings');});
  document.addEventListener('openrf:trips-shown',refresh);
  window.OpenRFSavedTrips=Object.freeze({refresh,boundsText});
})();
