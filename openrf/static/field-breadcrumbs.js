/* OpenRF 0.2.139 — opt-in browser walking/driving tracks; never automatic GPS collection. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const endpoint = '/api/navigation/breadcrumbs';
  const el = $('map-breadcrumbs-panel');
  if (!el) return;
  let sessions = [], recordingId = null, watchId = null, busy = false;
  let recordingMode = null;
  let uploadBusy = false, selectedId = null, selectedGeometry = null, reversing = false;
  let currentMap = null;
  const empty = {type:'FeatureCollection',features:[]};
  let latestStatus='No position watch running.';
  const status = message => {latestStatus=message;$('breadcrumb-status').textContent = message;};
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const meters = value => value < 1000 ? `${Math.round(value)} m` : `${(value/1000).toFixed(2)} km`;
  const dateString = value => { try { return new Date(value).toLocaleString(); } catch { return value; } };
  const modeName = mode => mode === 'auto' ? 'Driving' : 'Walking';
  const snapshot = () => ({recording:recordingId !== null,busy,mode:recordingMode,message:latestStatus});
  function publishState() {
    if(typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function')
      window.dispatchEvent(new CustomEvent('openrf:breadcrumbs-state',{detail:snapshot()}));
  }

  async function api(url, method = 'GET', body) {
    const response = await fetch(url, {method, cache:'no-store',
      ...(body === undefined ? {} : {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  function validPosition(position) {
    if (!position || !position.coords) throw Error('No browser location fix');
    const {latitude,longitude,accuracy} = position.coords;
    const age = Math.max(0,(Date.now()-position.timestamp)/1000);
    if (![latitude,longitude,accuracy,age].every(Number.isFinite) ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw Error('Invalid browser location values');
    }
    if (age > 30) throw Error(`Stale location (${Math.round(age)} seconds old); skipped`);
    if (accuracy > 100 || accuracy < 0) throw Error(`Location accuracy ±${Math.round(accuracy)} m exceeds 100 m; skipped`);
    return {latitude,longitude,accuracy_m:accuracy,fix_age_seconds:age,
      observed_utc:new Date(position.timestamp).toISOString(),source_device:'BROWSER_GEOLOCATION'};
  }

  function errorMessage(error) {
    if (error && error.code === 1) return 'Browser location permission denied or revoked';
    if (error && error.code === 2) return 'Browser location unavailable; check the GPS/position source';
    if (error && error.code === 3) return 'Fresh location request timed out';
    return error?.message || 'Unknown error';
  }

  function updateButtons() {
    const active = sessions.find(s => s.state === 'RECORDING');
    $('breadcrumb-start').disabled = busy || Boolean(active) || recordingId !== null;
    $('breadcrumb-stop').disabled = busy || (!active && recordingId === null);
    $('breadcrumb-label').disabled = busy || recordingId !== null;
    if($('breadcrumb-mode'))$('breadcrumb-mode').disabled = busy || recordingId !== null;
    $('breadcrumb-clear-map').disabled = selectedId === null;
    publishState();
  }

  function renderList() {
    const list = $('breadcrumb-list');
    if (!sessions.length) {
      list.innerHTML = '<p class="small muted">No saved breadcrumb tracks. Nothing has been recorded.</p>';
      updateButtons(); return;
    }
    list.innerHTML = sessions.map(track => {
      const isRecording = track.state === 'RECORDING';
      const selected = selectedId === track.id;
      return `<article class="breadcrumb-track"><div class="breadcrumb-track-head">
          <div class="breadcrumb-track-title"><strong>${escapeHTML(track.label)}</strong>
          <small>${modeName(track.travel_mode)} · ${escapeHTML(dateString(track.started_utc))} · ${track.point_count} recorded point${track.point_count===1?'':'s'} · BROWSER LOCATION</small></div>
          <span class="breadcrumb-track-state">${escapeHTML(track.state)}</span></div>
          <div class="breadcrumb-track-actions" data-breadcrumb-id="${track.id}">
          <button type="button" class="btn outline" data-track="view" ${track.point_count ? '' : 'disabled'}>${selected&&!reversing?'Showing':'View trail'}</button>
          <button type="button" class="btn outline" data-track="backtrack" ${track.point_count>1?'':'disabled'}>${selected&&reversing?'Reverse preview shown':'Reverse track preview'}</button>
          <button type="button" class="btn outline" data-track="return" ${track.point_count && !isRecording?'':'disabled'}>Route to recorded start</button>
          <button type="button" class="btn ghost" data-track="geojson" ${track.point_count?'':'disabled'}>GeoJSON</button>
          <button type="button" class="btn ghost" data-track="gpx" ${track.point_count?'':'disabled'}>GPX</button>
          ${isRecording ? '<button type="button" class="btn danger-outline" data-track="stop">Stop</button>':
            '<button type="button" class="btn danger-outline" data-track="delete">Delete</button>'}</div></article>`;
    }).join('');
    updateButtons();
  }

  async function refreshTracks() {
    const result = await api(endpoint);
    sessions = result.sessions || [];
    renderList();
    const stale = sessions.find(s => s.state === 'RECORDING' && s.id !== recordingId);
    if (stale && recordingId === null) {
      status(`Track #${stale.id} is marked RECORDING, but this page did not start its watch. It may be interrupted or open in another tab. Stop the track before starting a new one if you own it.`);
    }
  }

  function stopBrowserWatch() {
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  async function stopRecording(id = recordingId) {
    if (!id) id = sessions.find(s => s.state === 'RECORDING')?.id;
    if (!id) return;
    stopBrowserWatch();
    busy = true; updateButtons();
    try {
      await api(`${endpoint}/${id}/stop`, 'POST', {});
      recordingId = null;
      recordingMode = null;
      $('breadcrumb-current').hidden = true;
      status(`Stopped track #${id}. Location watch is off. Trail saved locally.`);
      await refreshTracks();
    } catch(error) {
      status(`Browser location watch stopped. Could not finalize track #${id}: ${errorMessage(error)}. Retry Stop.`);
    } finally { busy = false; updateButtons(); }
  }

  async function receivePosition(position) {
    if (recordingId === null || uploadBusy) return;
    let payload;
    try { payload = validPosition(position); }
    catch(error) { status(`Position skipped: ${errorMessage(error)}. Track remains on.`); return; }
    const id = recordingId;
    uploadBusy = true;
    try {
      const result = await api(`${endpoint}/${id}/points`, 'POST', payload);
      if (id !== recordingId) return;
      if (result.saved) {
        $('breadcrumb-current').hidden = false;
        $('breadcrumb-current').textContent = `Recording track #${id} · ${result.point_count} stored fix(es) · browser accuracy ±${Math.round(payload.accuracy_m)} m · last fix ${Math.round(payload.fix_age_seconds)}s old`;
        status('Recording browser location locally. Keep this tab visible; Stop when finished.');
        await refreshTracks();
        if (selectedId === id) await showTrack(id,reversing,false);
      }
    } catch(error) { status(`Location not saved: ${errorMessage(error)}. Recording remains on.`); }
    finally { uploadBusy = false; }
  }

  async function startRecording(modeArg,guard=()=>true) {
    if (busy || recordingId !== null) return;
    if (!navigator.geolocation) { status('Browser geolocation is unavailable. No track created.'); return; }
    const mode = typeof modeArg === 'string' ? modeArg : ($('breadcrumb-mode')?.value || 'pedestrian');
    if(!['pedestrian','auto'].includes(mode)){status('Choose Walking or Driving before recording.');return;}
    if($('breadcrumb-mode'))$('breadcrumb-mode').value=mode;
    const label = $('breadcrumb-label').value.trim();
    if (!label || label.length > 80) { status('Enter a track name (1–80 characters).'); return; }
    busy = true; updateButtons();
    status('Requesting a fresh location and permission. No track created yet…');
    try {
      const firstFix = await new Promise((resolve,reject) => navigator.geolocation.getCurrentPosition(resolve,reject,
        {enableHighAccuracy:true,maximumAge:0,timeout:16000}));
      const first = validPosition(firstFix);
      if (document.hidden || !guard()) throw Error('Recording canceled; navigation stopped or tab hidden');
      const started = await api(endpoint,'POST',{label,travel_mode:mode});
      const id = started.session.id;
      try {
        if (!guard() || document.hidden) throw Error('Recording canceled while opening track');
        await api(`${endpoint}/${id}/points`,'POST',first);
        if (!guard() || document.hidden) throw Error('Recording canceled before position watch');
      }
      catch(error) {
        await api(`${endpoint}/${id}/stop`,'POST',{}).catch(() => {});
        throw error;
      }
      recordingId = id;
      recordingMode = mode;
      selectedId = id; reversing = false;
      $('breadcrumb-current').hidden = false;
      $('breadcrumb-current').textContent = `Recording track #${id} · 1 stored fix · browser accuracy ±${Math.round(first.accuracy_m)} m`;
      if (document.hidden) {
        await stopRecording(id);
        status('Tab became hidden; newly created track was stopped after its first fix.');
        return;
      }
      status(`${modeName(mode)} recording started with a fresh browser location. Keep this tab visible. Stop recording to finish.`);
      try {
        watchId = navigator.geolocation.watchPosition(receivePosition, error => {
          status(`Location watch: ${errorMessage(error)}. No inaccurate point saved.`);
          if (error.code === 1) void stopRecording();
        },{enableHighAccuracy:true,maximumAge:0,timeout:20000});
      } catch(error) {
        await stopRecording(id);
        throw Error(`Location watch could not start; track stopped. ${errorMessage(error)}`);
      }
      await refreshTracks();
      await showTrack(id,false,false);
    } catch(error) {
      status(`Recording not started: ${errorMessage(error)}.`);
      await refreshTracks().catch(() => {});
    } finally { busy = false; updateButtons(); }
  }

  function featureData() {
    const points = selectedGeometry?.points || [];
    if (!points.length) return empty;
    const line = points.map(p => [p.longitude,p.latitude]);
    if (reversing) line.reverse();
    return {type:'FeatureCollection',features:[
      {type:'Feature',properties:{role:'route'},geometry:{type:'LineString',coordinates:line}},
      {type:'Feature',properties:{role:'start'},geometry:{type:'Point',coordinates:line[0]}},
      {type:'Feature',properties:{role:'finish'},geometry:{type:'Point',coordinates:line[line.length-1]}}
    ]};
  }

  function syncMap() {
    const map = window.OpenRFMapReadOnly?.();
    if (!map || !map.getSource || !selectedGeometry || !map.isStyleLoaded?.()) return;
    try {
      let source = map.getSource('openrf-breadcrumb-data');
      if (!source) {
        map.addSource('openrf-breadcrumb-data',{type:'geojson',data:empty});
        map.addLayer({id:'openrf-breadcrumb-line',type:'line',source:'openrf-breadcrumb-data',
          filter:['==',['get','role'],'route'],paint:{'line-color':reversing?'#ffbf72':'#b4f77a',
          'line-width':5,'line-opacity':0.93,'line-dasharray':reversing?[2,1.4]:[1,.01]}});
        map.addLayer({id:'openrf-breadcrumb-markers',type:'circle',source:'openrf-breadcrumb-data',
          filter:['!=',['get','role'],'route'],paint:{'circle-radius':8,'circle-stroke-width':2,
          'circle-stroke-color':'#092530','circle-color':['match',['get','role'],'start','#ffbe6d','finish','#70e5bf','#fff']}});
        source=map.getSource('openrf-breadcrumb-data');
      }
      source.setData(featureData());
      map.setPaintProperty('openrf-breadcrumb-line','line-color',reversing?'#ffbf72':'#b4f77a');
      map.setPaintProperty('openrf-breadcrumb-line','line-dasharray',reversing?[2,1.4]:[1,.01]);
    } catch(error) { status(`Track is saved, but map overlay is unavailable: ${errorMessage(error)}`); }
  }

  function attachMap() {
    const map = window.OpenRFMapReadOnly?.();
    if (!map || currentMap === map) return;
    currentMap = map;
    map.on('style.load',syncMap);
    syncMap();
  }

  async function showTrack(id,reverse,fit = true) {
    const data = await api(`${endpoint}/${id}`);
    if (!data.points.length) throw Error('Track has no recorded location points');
    selectedId = id; selectedGeometry = data; reversing = reverse;
    renderList();attachMap();syncMap();
    const map = window.OpenRFMapReadOnly?.();
    if (fit && map && map.fitBounds && data.points.length > 1) {
      const longs=data.points.map(p=>p.longitude),lats=data.points.map(p=>p.latitude);
      map.fitBounds([[Math.min(...longs),Math.min(...lats)],[Math.max(...longs),Math.max(...lats)]],
        {padding:65,maxZoom:15,duration:450});
    } else if (fit && map?.flyTo) {
      map.flyTo({center:[data.points[0].longitude,data.points[0].latitude],zoom:14});
    }
    if (fit) status(reverse ?
      `Reverse track preview: orange = last recorded point, green = original start. ${meters(data.distance_m)} recorded. Historical points only—not safe guidance.` :
      `Showing ${modeName(data.session.travel_mode).toLowerCase()} track #${id} · ${meters(data.distance_m)}; orange = start, green = last fix. Not a verified route.`);
  }

  function clearMap() {
    selectedGeometry=null;selectedId=null;reversing=false;
    const map=window.OpenRFMapReadOnly?.();
    if (map?.getSource?.('openrf-breadcrumb-data')) map.getSource('openrf-breadcrumb-data').setData(empty);
    renderList();
    status('Saved track remains private. Removed its preview from the map; no GPS watch changed.');
  }

  async function geojsonDownload(id) {
    if (!confirm('Download a GeoJSON file containing precise location history? Anyone with the file may see where you traveled.')) return;
    const data=await api(`${endpoint}/${id}/geojson`);
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/geo+json'}));
    const link=document.createElement('a');link.href=url;link.download=`openrf-breadcrumb-${id}.geojson`;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }

  async function onListClick(event) {
    const button=event.target.closest('button[data-track]');
    if (!button) return;
    const id=Number(button.closest('[data-breadcrumb-id]')?.dataset.breadcrumbId);
    if (!Number.isSafeInteger(id) || id < 1) return;
    const action=button.dataset.track;
    button.disabled=true;
    try {
      if (action==='view'||action==='backtrack') await showTrack(id,action==='backtrack');
      if (action==='return') {
        const data=await api(`${endpoint}/${id}`);
        if (data.session?.state==='RECORDING' || !data.points?.length) throw Error('Stop recording and save at least one point before routing homeward');
        if(typeof window.OpenRFPlanReturnToStart!=='function') throw Error('Map router not ready');
        const start=data.points[0];
        status('Requesting a NEW local route from a fresh current location to the recorded start. This might not retrace your exact historical path…');
        const result=await window.OpenRFPlanReturnToStart([start.longitude,start.latitude],data.session.travel_mode||'pedestrian');
        status(result);
      }
      if (action==='stop') await stopRecording(id);
      if (action==='delete' && confirm('Permanently delete this private track and all its precise location points?')) {
        const deleted=await api(`${endpoint}/${id}`,'DELETE');
        if (!deleted.deleted) throw Error('Track cannot be deleted while still recording');
        if (selectedId===id) clearMap();
        await refreshTracks();status(`Deleted track #${id} and all its saved positions.`);
      }
      if (action==='geojson') await geojsonDownload(id);
      if (action==='gpx' && confirm('Download a GPX file containing precise location history? Protect it like a private location log.')) {
        const link=document.createElement('a');link.href=`${endpoint}/${id}/gpx`;
        link.download=`openrf-breadcrumb-${id}.gpx`;document.body.append(link);link.click();link.remove();
      }
    } catch(error) { status(`Track action failed: ${errorMessage(error)}`); }
    finally { button.disabled=false; }
  }

  window.OpenRFBreadcrumbs = Object.freeze({start:(mode,guard)=>startRecording(mode,guard||(()=>true)),stop:()=>stopRecording(),snapshot});
  $('breadcrumb-start').addEventListener('click',()=>startRecording());
  $('breadcrumb-stop').addEventListener('click',()=>void stopRecording());
  $('breadcrumb-refresh').addEventListener('click',()=>refreshTracks().catch(error=>status(`Could not load tracks: ${errorMessage(error)}`)));
  $('breadcrumb-clear-map').addEventListener('click',clearMap);
  $('breadcrumb-list').addEventListener('click',onListClick);
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden && recordingId!==null) void stopRecording();
  });
  window.addEventListener('pagehide',()=>{
    if (recordingId!==null) {
      stopBrowserWatch();
      fetch(`${endpoint}/${recordingId}/stop`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:'{}',keepalive:true}).catch(()=>{});
      recordingId=null;
    }
  });
  setInterval(attachMap,2500);
  refreshTracks().catch(error=>status(`Could not load private tracks: ${errorMessage(error)}`));
})();
