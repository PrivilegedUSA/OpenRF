'use strict';

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = (val, suffix = '') => val === null || val === undefined || val === '' ? '—' : `${val}${suffix}`;
const stamp = (s) => s ? new Date(s).toLocaleString() : 'Not available';
const state = { observations: [], sessions: [], hardware: null, map: null, mapReady: false, style: 'liberty', showDemo: false, filterSession: null };

async function api(url, method = 'GET', body = null) {
  const options = {method, headers: {}};
  if (body !== null) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const res = await fetch(url, options);
  const json = await res.json();
  if (!res.ok) throw Error(json.error || `Request failed (${res.status})`);
  return json;
}

function flash(message, error = false) {
  const el = $('flash'); el.textContent = message; el.hidden = false; el.classList.toggle('error', error);
}
function showPage(page) {
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  const titles = {overview:'Field overview',map:'Survey map',scanner:'Signal analysis',discoveries:'Saved discoveries',sessions:'Investigations',hardware:'Hardware manager'};
  $('page-title').textContent = titles[page] || 'OpenRF'; $('page-crumb').textContent = page.toUpperCase();
  if (page === 'map') { startMap(); if (state.map) setTimeout(() => state.map.resize(), 80); }
}

async function refresh() {
  const [records, sessions, stats, hardware] = await Promise.all([
    api('/api/observations'), api('/api/sessions'), api('/api/stats'), api('/api/hardware')
  ]);
  state.observations = records.observations;
  state.sessions = sessions.sessions;
  state.hardware = hardware;
  $('metric-observations').textContent = stats.observations;
  $('metric-mapped').textContent = stats.mapped;
  $('metric-sessions').textContent = stats.sessions;
  $('metric-demo').textContent = stats.demo;
  $('runtime-pill').textContent = hardware.environment;
  renderDiscoveries(); renderSessions(); renderHardware(); renderSignals(); updateMap();
}

function openObservation(lat = '', lon = '') {
  $('observation-form').reset();
  $('observation-form').elements.latitude.value = lat;
  $('observation-form').elements.longitude.value = lon;
  $('observation-dialog').showModal();
}

function renderDiscoveries() {
  const keyword = $('discovery-search').value.trim().toLowerCase();
  const kind = $('discovery-kind').value;
  const includeDemo = $('show-demo-list').checked;
  const items = state.observations.filter(o =>
    (includeDemo || o.source !== 'DEMO') && (kind === 'ALL' || kind === o.kind) &&
    (!state.filterSession || o.session_id === state.filterSession) &&
    [o.label, o.identifier, o.notes].some(s => String(s || '').toLowerCase().includes(keyword))
  );
  $('discoveries-list').innerHTML = items.length ? items.map(o => `
    <article class="item"><div><div class="item-top"><h4>${escapeHTML(o.label)}</h4>
    <span class="badge">${escapeHTML(o.kind)}</span><span class="badge ${o.source === 'DEMO'?'demo':'manual'}">${escapeHTML(o.source)}</span></div>
    <p>${escapeHTML(o.notes || (o.identifier ? `Identifier: ${o.identifier}` : 'No notes'))}</p>
    <div class="tiny">${escapeHTML(stamp(o.observed_at))} · ${o.latitude === null ? 'No survey coordinates' : `${Number(o.latitude).toFixed(5)}, ${Number(o.longitude).toFixed(5)} — observer position`} · ${escapeHTML(o.source_device)}</div>
    ${o.rssi_dbm !== null ? `<div class="tiny">RSSI ${escapeHTML(o.rssi_dbm)} dBm ${o.frequency_mhz !== null ? `· ${escapeHTML(o.frequency_mhz)} MHz` : ''}</div>` : ''}
    </div><div class="item-actions">${o.latitude !== null ? `<button class="btn mini outline" data-zoom="${o.id}">Map</button>` : ''}<button class="btn mini danger-outline" data-delete="${o.id}">Delete</button></div></article>`).join('') :
    '<div class="empty">No records match. Use “Add observation”, or enable the demo filter for the optional test fixtures.</div>';
}

function renderSessions() {
  $('session-count').textContent = `${state.sessions.length} sessions`;
  $('session-list').innerHTML = state.sessions.length ? state.sessions.map(s => `
    <article class="item"><div><div class="item-top"><h4>${escapeHTML(s.name)}</h4><span class="badge ${s.status === 'ACTIVE' ? '' : 'manual'}">${escapeHTML(s.status)}</span></div>
    <p>${escapeHTML(s.observation_count)} saved observations · Started ${escapeHTML(stamp(s.started_at))}</p>
    <div class="tiny">${s.ended_at ? `Ended ${escapeHTML(stamp(s.ended_at))}` : 'No finish timestamp recorded'} · Records stay local</div>
    </div><div class="item-actions"><button class="btn mini outline" data-session-filter="${s.id}">Records</button>
    ${s.status === 'ACTIVE' ? `<button class="btn mini danger-outline" data-stop="${s.id}">Stop</button>` : ''}</div></article>`).join('') :
    '<div class="empty">No sessions started. You can record notes against a session, but no background collection occurs.</div>';
}

function renderHardware() {
  const hw = state.hardware; if (!hw) return;
  $('hardware-platform').textContent = hw.environment;
  $('hardware-cards').innerHTML = hw.capabilities.map(c => `
    <div class="hardware-card"><div class="panel-title"><h3>${escapeHTML(c.title)}</h3><span class="pill ${c.status === 'ready'?'green':'amber'}">${escapeHTML(c.status.replaceAll('_',' '))}</span></div>
    <p>${escapeHTML(c.description)}</p><small>Requires: ${escapeHTML(c.requires)}</small></div>`).join('');
  $('environment-info').textContent = [
    `Runtime: ${hw.environment}`, `Python: ${hw.python}`,
    `Network interfaces: ${hw.network_interfaces.join(', ') || 'none'}`,
    `NetworkManager utility: ${hw.command_availability.nmcli ? 'present' : 'not found'}`,
    `BlueZ utility: ${hw.command_availability.bluetoothctl ? 'present' : 'not found'}`,
    `RF capture: INACTIVE — ${hw.scan_status}`
  ].join('\n');
}

function renderSignals() {
  const signals = state.observations.filter(o => ['WIFI','BLE','RF','CELLULAR'].includes(o.kind));
  const grouped = new Map();
  signals.forEach(o => { if (o.identifier && o.rssi_dbm !== null) {
    if (!grouped.has(o.identifier)) grouped.set(o.identifier, []);
    grouped.get(o.identifier).push(o);
  }});
  const current = $('signal-select').value;
  $('signal-select').replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a recorded identifier'; $('signal-select').append(placeholder);
  [...grouped.keys()].sort().forEach(id => {const opt = document.createElement('option'); opt.value = id; opt.textContent = `${id} (${grouped.get(id).length} recorded)`; $('signal-select').append(opt);});
  $('signal-select').value = grouped.has(current) ? current : '';
  const rows = signals.filter(o => o.source !== 'DEMO').slice(0, 100);
  $('scan-count').textContent = `${signals.length} recorded`;
  $('signal-table').innerHTML = rows.length ? `<table class="data-table"><thead><tr><th>IDENTIFIER</th><th>KIND</th><th>RSSI</th><th>FREQUENCY</th><th>PROVENANCE</th><th>TIME</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${escapeHTML(o.identifier || o.label)}</td><td>${escapeHTML(o.kind)}</td><td>${format(o.rssi_dbm, ' dBm')}</td><td>${format(o.frequency_mhz, ' MHz')}</td><td>${escapeHTML(o.source)}</td><td>${escapeHTML(stamp(o.observed_at))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No non-demo RF readings stored. No live RF scanning available in this release.</div>';
  drawHistory(grouped);
}

function drawHistory(grouped = null) {
  const id = $('signal-select').value;
  const values = grouped?.get(id) || state.observations.filter(o => o.identifier === id && o.rssi_dbm !== null);
  if (!id || !values.length) { $('history-graph').innerHTML = '<div class="empty">Choose an identifier with recorded RSSI measurements.</div>'; return; }
  const sorted = values.slice().reverse();
  const min = Math.min(...sorted.map(x => x.rssi_dbm)) - 5;
  const max = Math.max(...sorted.map(x => x.rssi_dbm)) + 5;
  const coords = sorted.map((p,i) => [32 + (sorted.length===1 ? 155 : i*310/(sorted.length-1)), 125 - (p.rssi_dbm-min)/(max-min)*105]);
  const path = coords.map(([x,y],i)=>`${i===0?'M':'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  $('history-graph').innerHTML = `<svg viewBox="0 0 380 155" role="img" aria-label="RSSI values from ${sorted.length} recorded observations">
    <line x1="28" x2="352" y1="20" y2="20" class="gridline"/><line x1="28" x2="352" y1="125" y2="125" class="gridline"/>
    <text x="2" y="24">${max.toFixed(0)}</text><text x="2" y="129">${min.toFixed(0)}</text>
    <path d="${path}" fill="none" stroke="#41d8bd" stroke-width="3"/>
    ${coords.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4" fill="#81f4dc"/>`).join('')}
    <text x="30" y="148">First record</text><text x="277" y="148">Last record</text></svg>
    <p class="small muted">${sorted.length} stored measurement(s) · ${sorted.some(o=>o.source==='DEMO')?'Includes SYNTHETIC demo data · ':''}Not a distance estimate</p>`;
}

function startMap() {
  if (state.map) return;
  if (!window.maplibregl) {
    $('map-error').hidden = false; return;
  }
  try {
    state.map = new maplibregl.Map({container:'map', style:'https://tiles.openfreemap.org/styles/liberty', center:[-98.5,39.8], zoom:3.5, attributionControl:true});
    state.map.addControl(new maplibregl.NavigationControl(), 'top-right');
    state.map.on('style.load', () => { state.mapReady = true; installMarkerLayer(); updateMap(); });
    state.map.on('click', (evt) => {
      if (state.mapReady && state.map.getLayer('survey-points') && state.map.queryRenderedFeatures(evt.point,{layers:['survey-points']}).length) return;
      openObservation(evt.lngLat.lat.toFixed(6), evt.lngLat.lng.toFixed(6));
    });
    state.map.on('click', 'survey-points', (evt) => {
      if (!evt.features?.length) return;
      const p = evt.features[0].properties;
      new maplibregl.Popup().setLngLat(evt.lngLat).setHTML(`<strong>${escapeHTML(p.label)}</strong><br>${escapeHTML(p.kind)} · ${escapeHTML(p.source)}<br><small>Observation position only</small>`).addTo(state.map);
    });
    state.map.on('error', evt => { if (evt.error && !state.mapReady) $('map-error').hidden = false; });
  } catch (error) { console.warn('Map error',error); $('map-error').hidden = false; }
}
function installMarkerLayer() {
  if (!state.map) return;
  state.map.addSource('survey-data', {type:'geojson',data:{type:'FeatureCollection',features:[]}});
  state.map.addLayer({id:'survey-points',type:'circle',source:'survey-data',paint:{
    'circle-color':['case',['==',['get','source'],'DEMO'],'#efa947','#30dec0'],
    'circle-radius':8,'circle-stroke-color':'#09252c','circle-stroke-width':2,'circle-opacity':0.9
  }});
}
function updateMap() {
  if (!state.mapReady || !state.map?.getSource('survey-data')) return;
  const observations = state.observations.filter(o => o.latitude !== null && (state.showDemo || o.source !== 'DEMO'));
  const features = observations.map(o => ({type:'Feature',geometry:{type:'Point',coordinates:[o.longitude,o.latitude]},properties:{id:o.id,label:o.label,kind:o.kind,source:o.source}}));
  state.map.getSource('survey-data').setData({type:'FeatureCollection',features});
}
function zoomToRecord(id) {
  const item = state.observations.find(o=>o.id===id); if (!item || item.latitude === null) return;
  showPage('map'); setTimeout(()=>state.map?.flyTo({center:[item.longitude,item.latitude],zoom:15}),100);
}

async function runAction(fn, fallback='Could not complete operation') {
  try { await fn(); } catch(err) { flash(err.message || fallback, true); }
}

document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.jump)));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('manual-entry').addEventListener('click',()=>openObservation());
$('add-discovery').addEventListener('click',()=>openObservation());
$('new-session').addEventListener('click',()=>$('session-dialog').showModal());
$('show-demo-map').addEventListener('change',e => {state.showDemo = e.target.checked;updateMap();});
$('map-style').addEventListener('click',()=>{if(!state.map)return;state.style = state.style==='liberty'?'dark':'liberty';state.mapReady=false;state.map.setStyle(`https://tiles.openfreemap.org/styles/${state.style}`);$('map-style').textContent=state.style==='dark'?'Street map':'Dark map';});
$('map-geolocate').addEventListener('click',()=>{
  if (!navigator.geolocation) return flash('Your browser does not provide geolocation.',true);
  navigator.geolocation.getCurrentPosition(pos=>{
    state.map?.flyTo({center:[pos.coords.longitude,pos.coords.latitude],zoom:13});
    flash(`Browser-reported location shown (±${Math.round(pos.coords.accuracy)} m). Not stored.`);
  },()=>flash('Location unavailable or permission denied. You can pan the map manually.',true),{timeout:15000,enableHighAccuracy:false});
});
$('discovery-search').addEventListener('input',renderDiscoveries);
$('discovery-kind').addEventListener('change',renderDiscoveries);
$('show-demo-list').addEventListener('change',renderDiscoveries);
$('signal-select').addEventListener('change',()=>drawHistory());
$('discoveries-list').addEventListener('click',e=>{
  const del=e.target.closest('[data-delete]'); const zoom=e.target.closest('[data-zoom]');
  if(zoom) zoomToRecord(Number(zoom.dataset.zoom));
  if(del && confirm('Permanently delete this local observation?')) runAction(async()=>{await api(`/api/observations/${del.dataset.delete}`,'DELETE');flash('Record deleted.');await refresh();});
});
$('session-list').addEventListener('click',e=>{
  const stop=e.target.closest('[data-stop]'); const view=e.target.closest('[data-session-filter]');
  if(stop) runAction(async()=>{await api(`/api/sessions/${stop.dataset.stop}/stop`,'POST',{});flash('Session stopped.');await refresh();});
  if(view) {state.filterSession = Number(view.dataset.sessionFilter);$('show-demo-list').checked=true;renderDiscoveries();showPage('discoveries');flash(`Showing records associated with session #${state.filterSession}. Return to “All records” by refreshing the page.`);}
});
$('observation-form').addEventListener('submit',e=>{
  e.preventDefault();runAction(async()=>{
    const values=Object.fromEntries(new FormData(e.target).entries());
    const active=state.sessions.find(s=>s.status==='ACTIVE');
    if(active) values.session_id=active.id;
    await api('/api/observations','POST',values);
    $('observation-dialog').close();flash('Manual observation stored locally. Coordinates, if provided, are survey positions.');await refresh();
  });
});
$('session-form').addEventListener('submit',e=>{
  e.preventDefault();runAction(async()=>{const name = new FormData(e.target).get('name');await api('/api/sessions','POST',{name});$('session-dialog').close();e.target.reset();flash('Investigation started; no automatic RF scanning occurs.');await refresh();});
});
$('load-demo').addEventListener('click',()=>runAction(async()=>{
  const answer=await api('/api/demo/load','POST',{});
  flash(answer.created?`Created ${answer.created} clearly labeled synthetic test records.`:'Demo records were already loaded.');await refresh();
}));
$('clear-demo').addEventListener('click',()=>runAction(async()=>{const out=await api('/api/demo/clear','POST',{});flash(`Removed ${out.removed} synthetic record(s).`);await refresh();}));

refresh().catch(e=>flash(`Unable to reach local OpenRF server: ${e.message}`,true));
