'use strict';
/* v0.2.57: optional source-labeled infrastructure positions, never RF detections.
   Public ALPR sync occurs only after explicit user action. */
(() => {
  const get=id=>document.getElementById(id);
  const controls=[...document.querySelectorAll('[data-camera-type]')];
  if (!get('camera-map-manager') || !controls.length) return;
  const colors={ALPR:'#8bd9ef',RED_LIGHT:'#ff7974',SPEED:'#f8cc7c'};
  let entries=[],lastKey='',fetchTimer=null,fetchEpoch=0,active=false;
  const enabled=()=>new Set(controls.filter(c=>c.checked).map(c=>c.dataset.cameraType));
  const setStatus=(message,error=false)=>{const el=get('camera-map-status');el.textContent=message;el.classList.toggle('error',error);};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let snapshotPoll=null,snapshotWasRunning=false;
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
      if(button)button.disabled=!!result.running;
      if(result.running){
        const label=result.phase==='downloading'?'Downloading':result.phase==='validating'?'Importing and validating':'Updating';
        setSnapshotStatus(`${label} national ALPR snapshot… ${Number(result.downloaded_bytes||0).toLocaleString()} bytes received; ${Number(result.processed||0).toLocaleString()} features processed. Keep OpenRF running.`);
        if(snapshotPoll===null)snapshotPoll=setTimeout(()=>{snapshotPoll=null;snapshotStatus();},1200);
      }else{
        if(snapshotPoll!==null){clearTimeout(snapshotPoll);snapshotPoll=null;}
        const baseline=count?`${count.toLocaleString()} community-mapped ALPR points saved offline (updated ${info.updated_utc||'unknown'}).`:'No nationwide ALPR snapshot downloaded yet.';
        setSnapshotStatus(result.phase==='failed'?`${baseline} Last update failed: ${result.error||'Unknown download problem'}. Saved cameras remain available.`:baseline,result.phase==='failed');
        if(wasRunning && result.phase==='ready'){
          const checkbox=document.querySelector('[data-camera-type="ALPR"]');
          if(checkbox)checkbox.checked=true;
          lastKey='';refresh(true);
        }
      }
    }catch(error){if(button)button.disabled=false;setSnapshotStatus(`Local national snapshot status unavailable: ${error.message}`,true);}
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
  const usable=b=>b&&b.length===4&&b.every(Number.isFinite)&&b[0]<b[2]&&b[1]<b[3];
  const filtered=()=>entries.filter(c=>enabled().has(c.type));
  function installVector(map){
    if(!map || map.getSource('camera-catalog-data'))return;
    map.addSource('camera-catalog-data',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'camera-catalog-points',type:'circle',source:'camera-catalog-data',paint:{
      'circle-color':['get','camera_color'],'circle-radius':7,'circle-stroke-color':'#06232b',
      'circle-stroke-width':2,'circle-opacity':0.95
    }});
    if(!map.__openrfCameraClickHandler){
      map.__openrfCameraClickHandler=true;
      map.on('click','camera-catalog-points',event=>{
        if(state.navPicking||state.areaChoosing||!event.features?.length)return;
        const c=event.features[0].properties;
        const div=document.createElement('div');div.className='camera-popup';
        const title=document.createElement('strong');title.textContent=`${c.type} · ${c.state}`;div.append(title);
        for(const line of [c.label,c.source,`Updated: ${c.updated_utc}`,`Reported infrastructure position only — accuracy and operational status unverified`]){
          const p=document.createElement('p');p.textContent=line;div.append(p);
        }
        if(c.source_url){const a=document.createElement('a');a.href=c.source_url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open recorded source';div.append(a);}
        new maplibregl.Popup({className:'openrf-camera-map-popup',maxWidth:'290px'}).setLngLat(event.lngLat).setDOMContent(div).addTo(map);
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
      pin.title=`${c.type} · ${c.state} · ${c.label} · ${c.source}`;
      pin.setAttribute('aria-label',pin.title);pin.addEventListener('click',e=>{
        e.stopPropagation();const box=get('camera-selected');box.hidden=false;
        box.textContent=`${c.type} · ${c.state}: ${c.label}. Source: ${c.source}. This is a reported camera location, not proof of operation.`;
      });fragment.append(pin);
    }
    onViewportChanged();
  }
  async function refresh(force=false){
    if(!enabled().size){entries=[];lastKey='';updateVector(state.map);state.rasterMap?.render();return;}
    const b=bounds();if(!usable(b)){
      setStatus('Map bounds unavailable or cross the date line; zoom to a local area.',true);return;
    }
    const rounded=b.map(n=>Number(n.toFixed(4)));
    const key=JSON.stringify(rounded);
    if(!force&&lastKey===key)return;
    const requestId=++fetchEpoch;
    try{
      const response=await fetch(`/api/cameras?bounds=${encodeURIComponent(JSON.stringify(b))}`);
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
    lastKey='';if(enabled().size)refresh(true);else{entries=[];updateVector(state.map);state.rasterMap?.render();setStatus('All camera layers disabled. No camera network activity.');}
  }));
  get('camera-refresh').addEventListener('click',()=>refresh(true));
  get('camera-download-national')?.addEventListener('click',async()=>{
    const button=get('camera-download-national');button.disabled=true;
    setSnapshotStatus('Starting optional nationwide ALPR download. The map location and GPS history will not be sent.');
    try{
      const result=await api('/api/cameras/snapshot/update','POST',{});
      snapshotWasRunning=!!result.running;
      await snapshotStatus();
    }catch(error){button.disabled=false;setSnapshotStatus(`National ALPR download could not start: ${error.message}`,true);}
  });
  snapshotStatus();
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
  get('camera-import-osm').addEventListener('click',async()=>{
    const button=get('camera-import-osm'),b=bounds();
    if(!usable(b)){setStatus('Zoom into a local area first (not across the date line).',true);return;}
    if(b[2]-b[0]>8||b[3]-b[1]>8){setStatus('Zoom closer: import is limited to a visible area no bigger than 8° × 8°.',true);return;}
    button.disabled=true;setStatus('Querying OSM/Overpass for ALPR reports within the visible map bounds. No GPS track is sent…');
    try{
      const result=await api('/api/cameras/import-osm','POST',{bounds:b});
      const checkbox=document.querySelector('[data-camera-type="ALPR"]');checkbox.checked=true;
      lastKey='';await refresh(true);
      setStatus(`Found ${result.import.matched} OSM community-mapped ALPR location(s) in this area. Local offline copy saved. If zero, the map has no tagged entries in this area—not proof that no cameras exist.`);
    }catch(e){setStatus(`Could not import ALPRs: ${e.message}`,true);}
    finally{button.disabled=false;}
  });
  get('camera-manual-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;
    const data={type:get('camera-kind').value,state:get('camera-verification').value,
      label:get('camera-label').value,latitude:Number(get('camera-latitude').value),
      longitude:Number(get('camera-longitude').value),source:get('camera-source').value,
      source_url:get('camera-source-url').value,notes:get('camera-notes').value};
    try{await api('/api/cameras','POST',data);
      const choice=document.querySelector(`[data-camera-type="${data.type}"]`);choice.checked=true;
      lastKey='';await refresh(true);setStatus(`${data.type} location saved locally as ${data.state}. Not automatically verified.`);
    }catch(e){setStatus(`Camera not saved: ${e.message}`,true);}
    finally{button.disabled=false;}
  });
  window.OpenRFCameras={installVector,updateVector,renderRaster,onViewportChanged,refresh};
  if(state.mapReady)installVector(state.map);
  if(state.rasterMap)onViewportChanged();
})();
