'use strict';
/* v0.2.149 — explicitly approved, bounded map imagery along a planned route. */
(() => {
  const $=id=>document.getElementById(id);
  function init({getRoute,sample,api,refreshMaps}){
    const source=$('map-trip-source'),corridor=$('map-trip-corridor'),detail=$('map-trip-detail');
    const filename=$('map-trip-name'),estimateButton=$('map-trip-estimate');
    const estimateStatus=$('map-trip-estimate-status'),downloadStatus=$('map-trip-download-status');
    const start=$('map-trip-start'),cancel=$('map-trip-cancel'),approval=$('map-trip-confirm');
    let reviewed=null,pollTimer=null,busy=false,finishedId=null;
    const sizes={compact:[9,11],standard:[9,12],detailed:[9,13]};
    const sizeLabel=n=>`${(n/(1024*1024)).toFixed(1)} MiB`;
    function parameters(){
      const route=getRoute();
      if(route?.type!=='ROAD_ROUTE')throw Error('Plan local walking or driving directions first.');
      const points=sample(route.coordinates,257);
      if(!points)throw Error('The route geometry is unavailable. Calculate directions again.');
      const zoom=sizes[detail.value];
      if(!zoom)throw Error('Invalid detail selection.');
      return {route,body:{points,source:source.value,corridor_miles:Number(corridor.value),
        minzoom:zoom[0],maxzoom:zoom[1]}};
    }
    function invalidate(){
      reviewed=null;approval.checked=false;start.disabled=true;
      estimateStatus.textContent='Settings changed. Estimate this trip before downloading.';
    }
    for(const input of [source,corridor,detail,filename])input.addEventListener('change',invalidate);
    async function estimate(){
      if(busy)return;
      invalidate();busy=true;estimateButton.disabled=true;
      estimateStatus.textContent='Calculating tile slots along the route locally. No online map requests…';
      try{
        const {route,body}=parameters();
        const response=await api('/api/maps/trips/estimate','POST',body);
        if(getRoute()!==route)return;
        const info=response.estimate;
        if(info?.kind!=='OPENRF_TRIP_MAP_ESTIMATE'||info.read_only!==true||
           info.external_requests!==false||info.gps_fix_checked!==false)
          throw Error('Unexpected offline trip map estimate');
        reviewed={route,body,preview_id:info.preview_id,tiles:info.tile_count};
        estimateStatus.textContent=`${info.tile_count} tile slots · estimated ${sizeLabel(info.estimated_bytes_low)}–${sizeLabel(info.estimated_bytes_high)} (approximate). Hard cap 128 MiB. Full map tiles may extend beyond your selected corridor; no routing graph is included.`;
        start.disabled=false;
      }catch(error){estimateStatus.textContent=`Unable to estimate this trip: ${error.message}. No tiles downloaded.`;}
      finally{busy=false;estimateButton.disabled=false;}
    }
    async function poll(){
      try{
        const response=await api('/api/maps/trips/status');
        const job=response.download||{state:'idle'};
        const running=job.state==='running';
        cancel.disabled=!running;
        start.disabled=running||!reviewed;
        if(running){
          downloadStatus.textContent=`Downloading ${job.map_id}: ${job.downloaded}/${job.candidate_tiles} tiles from USGS. Don't close OpenRF until complete.`;
          if(!pollTimer)pollTimer=setInterval(()=>poll().catch(()=>{}),1500);
          return;
        }
        if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
        if(job.state==='complete'){
          const pack=job.result?.map;
          const forThisPreview=reviewed?.preview_id===job.preview_id;
          downloadStatus.textContent=pack?
            `${forThisPreview?'Offline trip map ready':'Previously downloaded trip map'}: ${job.result.tiles_downloaded} tiles in ${pack.id}.mbtiles. Open Layers → Offline maps to select it. Check coverage for any new route separately; Valhalla graphs were not downloaded.`:
            'Download finished; refresh your local map list.';
          if(pack && pack.id!==finishedId){finishedId=pack.id;await refreshMaps();}
        }else if(['failed','cancelled'].includes(job.state)){
          downloadStatus.textContent=`Trip map ${job.state}: ${job.error||'No package was installed'}. Existing offline maps remain unchanged.`;
        }
      }catch(error){
        downloadStatus.textContent=`Could not check trip download status: ${error.message}`;
      }
    }
    estimateButton.addEventListener('click',estimate);
    start.addEventListener('click',async()=>{
      if(!reviewed||busy)return;
      if(getRoute()!==reviewed.route){invalidate();return;}
      if(!approval.checked){downloadStatus.textContent='Check the approval box before requesting tiles from USGS.';return;}
      const name=filename.value.trim();
      if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)||name.endsWith('.')){
        downloadStatus.textContent='Enter a new filename using letters, numbers, dots, dashes or underscores.';return;
      }
      if(!confirm(`Download ${reviewed.tiles} ${source.value} map tiles for ${name}? USGS will receive the requested tile areas, not your recorded RF data. This will NOT download routing graphs.`))return;
      busy=true;start.disabled=true;
      downloadStatus.textContent='Starting approved offline trip download…';
      try{
        await api('/api/maps/trips/start','POST',{...reviewed.body,preview_id:reviewed.preview_id,
          map_id:name,confirm_network:true});
        await poll();
      }catch(error){downloadStatus.textContent=`Download could not start: ${error.message}. No package changed.`;}
      finally{busy=false;}
    });
    cancel.addEventListener('click',async()=>{
      try{await api('/api/maps/trips/cancel','POST',{});
        downloadStatus.textContent='Cancelling after the current tile. No partial package will be published.';
      }catch(error){downloadStatus.textContent=`Unable to cancel: ${error.message}`;}
    });
    function routeChanged(){
      invalidate();
      estimateStatus.textContent='No estimate yet for this planned route. Choose options and estimate first.';
    }
    return Object.freeze({routeChanged,poll});
  }
  window.OpenRFTripMaps=Object.freeze({init});
})();
