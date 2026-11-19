/* OpenRF v0.2.132 — explicitly imported, local-only GPX trail references. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('offline-trail-library')) return;
  const endpoint='/api/navigation/trails';
  const empty={type:'FeatureCollection',features:[]};
  let trails=[],selected=null,selectedData=null,attachedMap=null,busy=false;
  const status = message => { $('offline-trail-status').textContent=message; };
  const safe = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const distance = m => m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(2)} km`;
  const formatDate = utc => {const date=new Date(utc);return Number.isFinite(date.getTime())?date.toLocaleString():'Time unavailable';};

  async function api(url,method='GET',payload) {
    const response=await fetch(url,{method,cache:'no-store',...(payload===undefined?{}:{
      headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})});
    const result=await response.json().catch(()=>({}));
    if (!response.ok) throw Error(result.error||`HTTP ${response.status}`);
    return result;
  }

  function render() {
    $('offline-trail-clear-map').disabled=selected===null;
    $('offline-trail-import').disabled=busy;
    if (!trails.length) {
      $('offline-trail-list').innerHTML='<p class="small muted">No offline trails saved. Nothing is downloaded automatically.</p>';
      return;
    }
    $('offline-trail-list').innerHTML=trails.map(trail=>`<article class="offline-trail-entry">
      <div class="offline-trail-entry-title"><div><strong>${safe(trail.name)}</strong>
      <small>${trail.point_count} imported positions · ${distance(trail.distance_m)} · ${safe(formatDate(trail.added_utc))}</small>
      <small>Source: ${safe(trail.attribution)} · UNVERIFIED GPX</small></div>
      ${selected===trail.id?'<span class="pill">MAP PREVIEW</span>':''}</div>
      <div class="offline-trail-entry-actions" data-offline-trail="${trail.id}">
      <button type="button" class="btn outline" data-offline-action="view">${selected===trail.id?'Show again':'Show on map'}</button>
      <button type="button" class="btn ghost" data-offline-action="export">Export GeoJSON</button>
      <button type="button" class="btn danger-outline" data-offline-action="delete">Delete</button></div></article>`).join('');
  }

  async function refresh(){
    const result=await api(endpoint);
    trails=result.trails||[];render();
  }

  function mapData() {
    if (!selectedData?.segments?.length) return empty;
    const segments=selectedData.segments;
    return {type:'FeatureCollection',features:[
      {type:'Feature',properties:{role:'route'},geometry:segments.length===1?
        {type:'LineString',coordinates:segments[0]}:{type:'MultiLineString',coordinates:segments}},
      {type:'Feature',properties:{role:'start'},geometry:{type:'Point',coordinates:segments[0][0]}}
    ]};
  }

  function draw() {
    const map=window.OpenRFMapReadOnly?.();
    if (!map || !selectedData || !map.isStyleLoaded?.()) return;
    try {
      let source=map.getSource('openrf-imported-trail-data');
      if (!source) {
        map.addSource('openrf-imported-trail-data',{type:'geojson',data:empty});
        map.addLayer({id:'openrf-imported-trail-line',type:'line',source:'openrf-imported-trail-data',
          filter:['==',['get','role'],'route'],paint:{'line-color':'#c6a5ff','line-width':4,
          'line-dasharray':[3,1.2],'line-opacity':0.95}});
        map.addLayer({id:'openrf-imported-trail-start',type:'circle',source:'openrf-imported-trail-data',
          filter:['==',['get','role'],'start'],paint:{'circle-radius':7,'circle-color':'#c6a5ff',
          'circle-stroke-width':2,'circle-stroke-color':'#10222b'}});
        source=map.getSource('openrf-imported-trail-data');
      }
      source.setData(mapData());
    } catch(error) { status(`Imported trail saved, but map preview failed: ${error.message}`); }
  }

  function attachMap() {
    const map=window.OpenRFMapReadOnly?.();
    if (!map || attachedMap===map) return;
    attachedMap=map;
    map.on('style.load',draw);
    draw();
  }

  async function showTrail(id) {
    const data=await api(`${endpoint}/${id}`);
    selected=id;selectedData=data;
    render();attachMap();draw();
    const map=window.OpenRFMapReadOnly?.();
    const bounds=data.bounds;
    if (map?.fitBounds) map.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]],
      {padding:65,maxZoom:15,duration:350});
    status(`Previewing imported ${data.name} · ${distance(data.distance_m)}. This path is unverified; no live location or guidance was started.`);
  }

  function clearPreview() {
    selected=null;selectedData=null;
    const source=window.OpenRFMapReadOnly?.()?.getSource?.('openrf-imported-trail-data');
    if (source) source.setData(empty);
    render();status('Removed imported trail preview from the map. The local file reference was not deleted.');
  }

  async function importTrail(event) {
    event.preventDefault();
    if (busy) return;
    const file=$('offline-trail-file').files?.[0];
    const name=$('offline-trail-name').value.trim();
    const attribution=$('offline-trail-credit').value.trim();
    if (!file || !name || !attribution) {status('Choose a GPX file and enter its name and source.');return;}
    if (file.size>500000) {status('Import canceled: GPX must be 500 kB or smaller.');return;}
    busy=true;render();status('Reading the selected local GPX file. No internet download or location request…');
    try {
      const gpx=await file.text();
      const result=await api(`${endpoint}/import`,'POST',{name,attribution,gpx});
      $('offline-trail-file').value='';
      await refresh();
      status(`Imported ${result.trail.point_count} GPX points for “${result.trail.name}” into private local storage. This does not verify trail access or conditions.`);
      await showTrail(result.trail.id);
    } catch(error) {status(`Trail import failed: ${error.message}`);}
    finally {busy=false;render();}
  }

  async function onListClick(event) {
    const button=event.target.closest('button[data-offline-action]');
    if (!button) return;
    const id=Number(button.closest('[data-offline-trail]')?.dataset.offlineTrail);
    if (!Number.isSafeInteger(id)||id<1) return;
    button.disabled=true;
    try {
      if (button.dataset.offlineAction==='view') await showTrail(id);
      if (button.dataset.offlineAction==='delete' && confirm('Permanently remove this imported trail reference and its stored coordinates? Recorded walking breadcrumbs are NOT affected.')) {
        const result=await api(`${endpoint}/${id}`,'DELETE');
        if (!result.deleted) throw Error('Trail not found');
        if (id===selected) clearPreview();
        await refresh();status(`Deleted imported trail #${id}. Your recorded breadcrumbs were not changed.`);
      }
      if (button.dataset.offlineAction==='export' && confirm('Download the trail as GeoJSON? A location file may expose sensitive paths if shared.')) {
        const data=await api(`${endpoint}/${id}/geojson`);
        const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/geo+json'}));
        const link=document.createElement('a');link.href=url;link.download=`openrf-imported-trail-${id}.geojson`;
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
      }
    } catch(error) {status(`Trail action failed: ${error.message}`);}
    finally {button.disabled=false;}
  }

  $('offline-trail-import-form').addEventListener('submit',importTrail);
  $('offline-trail-file').addEventListener('change',()=>{
    const file=$('offline-trail-file').files?.[0];
    if (file && !$('offline-trail-name').value.trim()) $('offline-trail-name').value=file.name.replace(/\.gpx$/i,'').slice(0,100);
  });
  $('offline-trail-refresh').addEventListener('click',()=>refresh().catch(err=>status(`Could not load offline trails: ${err.message}`)));
  $('offline-trail-clear-map').addEventListener('click',clearPreview);
  $('offline-trail-list').addEventListener('click',onListClick);
  setInterval(attachMap,2600);
  refresh().catch(error=>status(`Could not load private trail library: ${error.message}`));
})();
