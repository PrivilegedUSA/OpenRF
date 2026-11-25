'use strict';
/* v0.2.57: optional source-labeled infrastructure positions, never RF detections.
   Public ALPR sync occurs only after explicit user action. */
(() => {
  const get=id=>document.getElementById(id);
  const controls=[...document.querySelectorAll('[data-camera-type]')];
  if (!get('camera-map-manager') || !controls.length) return;
  const colors={ALPR:'#ee7828',RED_LIGHT:'#d82f49',SPEED:'#e4bf28'};
  let entries=[],lastKey='',fetchTimer=null,fetchEpoch=0,active=false;
  const enabled=()=>new Set(controls.filter(c=>c.checked).map(c=>c.dataset.cameraType));
  const setStatus=(message,error=false)=>{const el=get('camera-map-status');el.textContent=message;el.classList.toggle('error',error);};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let snapshotPoll=null,snapshotWasRunning=false,trafficWasRunning=false,trafficPoll=null,startingNational=false;
  function nationalButtons(){
    const both=get('camera-download-national'),alpr=get('camera-alpr-only'),traffic=get('camera-traffic-only');
    if(both)both.disabled=startingNational||snapshotWasRunning||trafficWasRunning;
    if(alpr)alpr.disabled=startingNational||snapshotWasRunning;
    if(traffic)traffic.disabled=startingNational||trafficWasRunning;
  }
  function setTrafficStatus(message,error=false){const el=get('camera-traffic-status');if(el){el.textContent=message;el.classList.toggle('error',error);}}
  function trafficWarning(message=''){const el=get('camera-traffic-warning');if(el){el.textContent=message;el.hidden=!message;}}
  async function trafficStatus(){
    try{
      const response=await fetch('/api/cameras/traffic-snapshot',{cache:'no-store'});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Local status unavailable');
      const info=result.snapshot||{},wasRunning=trafficWasRunning;trafficWasRunning=!!result.running;nationalButtons();
      const bar=get('camera-traffic-progress');
      if(bar){bar.hidden=!result.running;bar.removeAttribute('value');if(result.phase==='ready')bar.value=100;else if(result.phase==='downloading'&&result.total_bytes>0)bar.value=Math.min(100,100*result.downloaded_bytes/result.total_bytes);}
      const baseline=info.updated_utc?`${Number(info.speed_count||0).toLocaleString()} speed · ${Number(info.red_light_count||0).toLocaleString()} red-light saved offline (updated ${info.updated_utc}).`:'No nationwide speed / red-light snapshot downloaded yet.';
      const supplemental=(info.supplements||[]).reduce((sum,r)=>sum+Number(r.count||0),0);
      const saved=baseline+(supplemental?` Includes ${supplemental.toLocaleString()} Chicago agency reports; overlapping reports may exist.`:'');
      if(result.running){
        trafficWarning('');
        const labels={retrying:`Retrying in ${result.retry_seconds||0}s (attempt ${result.attempt||2})`,connecting:'Connecting',downloading:'Downloading speed / red-light',validating:'Processing traffic camera reports',saving:'Saving traffic cameras'};
        const bytes=result.phase==='downloading'?` · ${Number(result.downloaded_bytes||0).toLocaleString()} bytes${result.total_bytes>0?` (${Math.floor(100*result.downloaded_bytes/result.total_bytes)}%)`:' (total unknown)'}`:'';
        setTrafficStatus(`${result.provider_name||'SpeedCams.world'}: ${labels[result.phase]||'Updating traffic cameras'}${bytes}. ${saved}`);
        if(trafficPoll===null)trafficPoll=setTimeout(()=>{trafficPoll=null;trafficStatus();},1000);
      }else{
        if(trafficPoll!==null){clearTimeout(trafficPoll);trafficPoll=null;}
        setTrafficStatus(saved);
        trafficWarning(result.phase==='failed'?`Traffic update failed: ${result.error||'Unknown error'}. Saved cameras remain available.`:result.partial?`Some sources failed: ${result.error}. Previous reports retained.`:'');
        if(wasRunning&&result.phase==='ready'){lastKey='';refresh(true);}
      }
    }catch(error){trafficWarning(`Traffic snapshot status unavailable: ${error.message}; retrying.`);if(trafficPoll===null)trafficPoll=setTimeout(()=>{trafficPoll=null;trafficStatus();},2000);}
  }
  function setSnapshotStatus(message,error=false){
    const target=get('camera-snapshot-status');
    if(!target)return;
    target.textContent=message;target.classList.toggle('error',error);
  }
  async function snapshotStatus(){
    const button=get('camera-download-national');
    try{
      const response=await fetch('/api/cameras/snapshot',{cache:'no-store'});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Local status unavailable');
      const info=result.snapshot||{},count=Number(info.count||0),wasRunning=snapshotWasRunning;
      snapshotWasRunning=!!result.running;
      nationalButtons();
      const bar=get('camera-snapshot-progress');
      if(bar){bar.hidden=!result.running;bar.removeAttribute('value');if(result.phase==='ready')bar.value=100;else if(result.phase==='downloading'&&result.total_bytes>0)bar.value=Math.min(100,100*result.downloaded_bytes/result.total_bytes);}
      if(result.running){
        const label=result.phase==='downloading'?'Downloading':result.phase==='validating'?'Importing and validating':result.phase==='saving'?'Saving':'Updating';
        setSnapshotStatus(`${label} national ALPR snapshot… ${Number(result.downloaded_bytes||0).toLocaleString()} bytes received${result.phase==='downloading'&&result.total_bytes>0?` (${Math.floor(100*result.downloaded_bytes/result.total_bytes)}%)`:result.phase==='downloading'?' (total unknown)':''}; ${Number(result.processed||0).toLocaleString()} features processed. Keep OpenRF running.`);
        if(snapshotPoll===null)snapshotPoll=setTimeout(()=>{snapshotPoll=null;snapshotStatus();},1200);
      }else{
        if(snapshotPoll!==null){clearTimeout(snapshotPoll);snapshotPoll=null;}
        const baseline=count?`${count.toLocaleString()} community-mapped ALPR points saved offline (updated ${info.updated_utc||'unknown'}).`:'No nationwide ALPR snapshot downloaded yet.';
        setSnapshotStatus(result.phase==='failed'?`${baseline} Last update failed: ${result.error||'Unknown download problem'}. Saved cameras remain available.`:baseline,result.phase==='failed');
        if(wasRunning && result.phase==='ready'){
          // A completed download must not re-enable a layer the user switched off.
          lastKey='';refresh(true);
        }
      }
    }catch(error){setSnapshotStatus(`Local national snapshot status unavailable: ${error.message}; retrying.`,true);if(snapshotPoll===null)snapshotPoll=setTimeout(()=>{snapshotPoll=null;snapshotStatus();},2000);}
  }

  const bounds=()=>{
    if(state.map && state.mapReady){
      const b=state.map.getBounds();return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
    }
    if(state.rasterMap){
      const r=state.rasterMap,root=get('map'),scale=256*Math.pow(2,r.zoom);
      const center=worldPixel(r.center[0],r.center[1],r.zoom);
      const a=pixelWorld(center[0]-root.clientWidth/2,center[1]+root.clientHeight/2,r.zoom);
      const b=pixelWorld(center[0]+root.clientWidth/2,center[1]-root.clientHeight/2,r.zoom);
      return [a[0],a[1],b[0],b[1]];
    }
    return null;
  };
  // MapLibre can report world-wrapped longitudes (e.g. west=-245) at the
  // nationwide overview. The catalog API correctly rejects such coordinates;
  // wait for a local viewport instead of sending an invalid 400 request.
  const usable=b=>b&&b.length===4&&b.every(Number.isFinite)&&
    -180<=b[0]&&b[0]<b[2]&&b[2]<=180&&-90<=b[1]&&b[1]<b[3]&&b[3]<=90;
  const filtered=()=>entries.filter(c=>enabled().has(c.type));
  function installVector(map){
    if(!map || map.getSource('camera-catalog-data'))return;
    map.addSource('camera-catalog-data',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'camera-catalog-points',type:'circle',source:'camera-catalog-data',paint:{
      'circle-color':['get','camera_color'],'circle-radius':6,'circle-stroke-width':0,'circle-opacity':1
    }});
    if(!map.__openrfCameraClickHandler){
      map.__openrfCameraClickHandler=true;
      map.on('click','camera-catalog-points',event=>{
        if(state.navPicking||state.areaChoosing||!event.features?.length)return;
        const c=event.features[0].properties;
        const div=document.createElement('div');div.className='camera-popup';
        const title=document.createElement('strong');title.textContent=`${c.type} · ${c.state}`;div.append(title);
        for(const line of [c.label,c.source,
          c.direction?`Mapped lens heading: ${c.direction} (not field-verified)`:'Lens heading: not mapped (treated as potentially relevant in route comparisons)',
          `Updated: ${c.updated_utc}`,`Reported infrastructure position only — accuracy and operational status unverified`]){
          const p=document.createElement('p');p.textContent=line;div.append(p);
        }
        if(c.source_url){const a=document.createElement('a');a.href=c.source_url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open recorded source';div.append(a);}
        window.OpenRFMapFeatureInfo.show(new maplibregl.Popup({className:'openrf-camera-map-popup',maxWidth:'290px'}).setLngLat(event.lngLat).setDOMContent(div),map);
      });
    }
    updateVector(map);onViewportChanged();
  }
  function updateVector(map){
    const source=map?.getSource?.('camera-catalog-data');if(!source)return;
    source.setData({type:'FeatureCollection',features:filtered().map(c=>({
      type:'Feature',geometry:{type:'Point',coordinates:[c.longitude,c.latitude]},
      properties:{...c,camera_color:colors[c.type]}
    }))});
  }
  function renderRaster(fragment,raster,width,height){
    const size=256*Math.pow(2,raster.zoom),center=worldPixel(raster.center[0],raster.center[1],raster.zoom);
    for(const c of filtered()){
      const p=worldPixel(c.longitude,c.latitude,raster.zoom);
      const dx=((p[0]-center[0]+size*1.5)%size)-size/2,dy=p[1]-center[1];
      if(Math.abs(dx)>width/2+15||Math.abs(dy)>height/2+15)continue;
      const pin=document.createElement('button');pin.type='button';pin.className='raster-camera-pin';
      pin.style.backgroundColor=colors[c.type];pin.style.left=`${width/2+dx}px`;pin.style.top=`${height/2+dy}px`;
      pin.title=`${c.type} · ${c.state} · ${c.label} · ${c.source} · lens heading: ${c.direction||'unknown'}`;
      pin.setAttribute('aria-label',pin.title);pin.addEventListener('click',e=>{
        e.stopPropagation();window.OpenRFMapFeatureInfo.close();const box=get('camera-selected');box.hidden=false;
        box.textContent=`${c.type} · ${c.state}: ${c.label}. Source: ${c.source}. Mapped lens heading: ${c.direction||'unknown'}. This is a reported camera location, not proof of operation or actual viewing coverage.`;
      });fragment.append(pin);
    }
    onViewportChanged();
  }
  async function refresh(force=false){
    if(!enabled().size){entries=[];lastKey='';updateVector(state.map);state.rasterMap?.render();return;}
    const b=bounds();if(!usable(b)){
      setStatus('Camera locations become available after zooming into a valid map area.',false);return;
    }
    const rounded=b.map(n=>Number(n.toFixed(4)));
    const types=[...enabled()].sort().join(',');
    const key=JSON.stringify([rounded,types]);
    if(!force&&lastKey===key)return;
    const requestId=++fetchEpoch;
    try{
      const response=await fetch(`/api/cameras?bounds=${encodeURIComponent(JSON.stringify(b))}&types=${encodeURIComponent(types)}`);
      const data=await response.json();if(!response.ok)throw Error(data.error||'Could not list cameras');
      if(requestId!==fetchEpoch)return;
      entries=data.sites||[];lastKey=key;updateVector(state.map);
      // Avoid render loops: once the key is known, raster refresh has no new fetch.
      state.rasterMap?.render();
      setStatus(`${filtered().length} selected camera location(s) in view${data.truncated?' (limit reached; zoom in)':''}. Community and manual reports are not independently verified.`);
    }catch(e){if(requestId===fetchEpoch)setStatus(`Camera data unavailable: ${e.message}`,true);}
  }
  function onViewportChanged(){
    if(!enabled().size)return;
    if(fetchTimer!==null)clearTimeout(fetchTimer);
    fetchTimer=setTimeout(()=>{fetchTimer=null;refresh();},450);
  }
  controls.forEach(el=>el.addEventListener('change',()=>{
    window.OpenRFMapFeatureInfo.close();
    window.OpenRFMapLayerPreferences?.save?.();
    ++fetchEpoch;lastKey='';updateVector(state.map);state.rasterMap?.render();
    if(enabled().size)refresh(true);else{entries=[];setStatus('All camera layers disabled. No camera network activity.');}
  }));
  get('camera-refresh').addEventListener('click',()=>refresh(true));
  async function startNational(scope){
    if(startingNational)return;startingNational=true;nationalButtons();
    const endpoint=scope==='alpr'?'/api/cameras/snapshot/update':scope==='traffic'?'/api/cameras/traffic-snapshot/update':'/api/cameras/nationwide/update';
    try{
      const result=await api(endpoint,'POST',{});
      if(scope==='both'){snapshotWasRunning=!!result.alpr?.running;trafficWasRunning=!!result.traffic?.running;}
      else if(scope==='alpr')snapshotWasRunning=!!result.running;else trafficWasRunning=!!result.running;
      await Promise.all([snapshotStatus(),trafficStatus()]);
      lastKey='';refresh(true);
    }catch(error){if(scope!=='traffic')setSnapshotStatus(`National update could not start: ${error.message}`,true);if(scope!=='alpr')trafficWarning(`National update could not start: ${error.message}`);}
    finally{startingNational=false;nationalButtons();}
  }
  get('camera-download-national')?.addEventListener('click',()=>startNational('both'));
  get('camera-alpr-only')?.addEventListener('click',()=>startNational('alpr'));
  get('camera-traffic-only')?.addEventListener('click',()=>startNational('traffic'));
  snapshotStatus();trafficStatus();
  get('camera-import-upload')?.addEventListener('click',async()=>{
    const file=get('camera-import-file')?.files?.[0];
    if(!file){setSnapshotStatus('Select a local .geojson, .json or .gz file first.',true);return;}
    if(file.size<100||file.size>128*1024*1024){setSnapshotStatus('Selected file is outside the 100-byte to 128-MiB limit.',true);return;}
    const button=get('camera-import-upload');button.disabled=true;
    setSnapshotStatus('Uploading selected snapshot into private OpenRF storage for offline validation…');
    try{
      const response=await fetch('/api/cameras/snapshot/upload',{method:'POST',
        headers:{'Content-Type':'application/octet-stream'},body:file});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Snapshot upload failed');
      snapshotWasRunning=!!result.running;
      await snapshotStatus();
    }catch(error){setSnapshotStatus(`Snapshot file import unavailable: ${error.message}`,true);}
    finally{button.disabled=false;}
  });
  // Import messages must not share the viewport status: a pan, zoom or
  // delayed saved-area request can otherwise erase the outcome of an import.
  const setImportStatus=(message,phase='idle')=>{
    const el=get('camera-import-status');if(!el)return;
    el.textContent=message;el.dataset.phase=phase;el.classList.toggle('error',phase==='failed');
  };
  let importPoll=null, importRequest=false, lastImportResult=null;
  const importButton=get('camera-import-osm');
  async function showImportJob(result){
    const bar=get('camera-import-progress');
    const phase=result.phase;
    if(!phase||phase==='idle')return;
    if(importRequest&&phase==='idle')return;
    importButton.disabled=!!result.running;
    importButton.textContent=result.running?'Importing speed / red-light…':'Import speed / red-light in view';
    if(bar){bar.hidden=!result.running&&phase!=='complete';bar.removeAttribute('value');
      if(phase==='complete')bar.value=100;
      if(phase==='downloading'&&result.total_bytes>0)bar.value=Math.min(100,100*result.received_bytes/result.total_bytes);}
    const provider=result.provider?` Provider: ${result.provider}.`:'';
    const fallback=result.errors?.length?` Previous provider errors: ${result.errors.join('; ')}.`:'';
    const part=result.parts?` · Smaller-area retry: section ${result.part} of ${result.parts} (${result.completed_parts||0} complete)` : '';
    if(result.running){
      const labels={connecting:'Querying OSM/Overpass',downloading:'Downloading OSM data',processing:'Processing camera reports',saving:'Saving camera reports locally'};
      const bytes=phase==='downloading'?` · ${Number(result.received_bytes||0).toLocaleString()} bytes${result.total_bytes>0?` / ${Number(result.total_bytes).toLocaleString()} (${Math.floor(100*result.received_bytes/result.total_bytes)}%)`:' (total unknown)'}`:'';
      setImportStatus((labels[phase]||'Working')+part+bytes+provider+fallback,phase);
    }else if(phase==='failed')setImportStatus(`Could not import cameras: ${result.error||'Unknown error'}`,'failed');
    else if(phase==='complete'&&result.result){
      const key=JSON.stringify(result);
      if(key===lastImportResult)return;lastImportResult=key;
      const counts=result.result.counts||{},total=result.result.matched;
      const requested=result.result.types||result.types||['ALPR','RED_LIGHT','SPEED'];
      const breakdown=[... (requested.includes('ALPR')?[`${counts.ALPR??0} ALPR`]:[]), `${counts.RED_LIGHT??0} red-light`, `${counts.SPEED??0} speed`].join(', ');
      // Import never changes saved layer visibility; user chooses what the map shows.
      lastKey='';
      const hidden=['ALPR','RED_LIGHT','SPEED'].filter(kind=>counts[kind]>0&&!enabled().has(kind));
      const names={ALPR:'ALPR / Flock',RED_LIGHT:'Red-light cameras',SPEED:'Speed cameras'};
      setImportStatus(`Import complete: ${total} OSM camera report(s) — ${breakdown}. ${total?'Saved locally for offline use.':'No tagged cameras returned in this area; this is not proof that none exist.'}${hidden.length?' Enable '+hidden.map(kind=>names[kind]).join(', ')+' to display the imported reports.':''}`,'complete');
      get('camera-import-status').textContent+=provider+fallback;
      await refresh(true);
    }
    if(result.running&&importPoll===null)importPoll=setTimeout(()=>{importPoll=null;pollImport();},700);
  }
  async function pollImport(){
    try{const response=await fetch('/api/cameras/import-status',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();if(!importRequest)await showImportJob(data);}
    catch(e){setImportStatus(`Import status temporarily unavailable: ${e.message}; retrying.`,'failed');if(importPoll===null)importPoll=setTimeout(()=>{importPoll=null;pollImport();},2000);}
  }
  importButton.addEventListener('click',async()=>{
    const b=bounds();
    if(importButton.disabled||importRequest)return;
    if(!usable(b)){setImportStatus('Zoom into a local area first (not across the date line).','failed');return;}
    if(b[2]-b[0]>8||b[3]-b[1]>8){setImportStatus('Zoom closer: import is limited to a visible area no bigger than 8° × 8°.','failed');return;}
    importRequest=true;importButton.disabled=true;lastImportResult=null;
    importButton.textContent='Importing speed / red-light…';
    setImportStatus('Querying OSM/Overpass for speed and red-light cameras…','connecting');
    try{await showImportJob(await api('/api/cameras/import-osm','POST',{bounds:b,types:['SPEED','RED_LIGHT']}));}
    catch(e){setImportStatus(`Could not start import: ${e.message}`,'failed');importButton.disabled=false;await pollImport();}
    finally{importRequest=false;if(importPoll===null)importPoll=setTimeout(()=>{importPoll=null;pollImport();},700);}
  });
  pollImport();
  get('camera-manual-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;
    const data={type:get('camera-kind').value,state:get('camera-verification').value,
      label:get('camera-label').value,latitude:Number(get('camera-latitude').value),
      longitude:Number(get('camera-longitude').value),source:get('camera-source').value,
      source_url:get('camera-source-url').value,notes:get('camera-notes').value};
    try{await api('/api/cameras','POST',data);
      // Adding a report does not silently change visibility preferences.
      lastKey='';await refresh(true);setStatus(`${data.type} location saved locally as ${data.state}. Not automatically verified.`);
    }catch(e){setStatus(`Camera not saved: ${e.message}`,true);}
    finally{button.disabled=false;}
  });
  window.OpenRFCameras={installVector,updateVector,renderRaster,onViewportChanged,refresh};
  if(state.mapReady)installVector(state.map);
  if(state.rasterMap)onViewportChanged();
})();
