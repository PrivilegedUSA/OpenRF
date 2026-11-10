'use strict';

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = (val, suffix = '') => val === null || val === undefined || val === '' ? '—' : `${val}${suffix}`;
const stamp = (s) => s ? new Date(s).toLocaleString() : 'Not available';
const state = { observations: [], sessions: [], hardware: null, map: null, mapReady: false, style: 'liberty', rasterMap: null, mapAttempt: 0, showDemo: false, filterSession: null };

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
  if (page === 'map') { startMap(); setTimeout(() => { state.map?.resize(); state.rasterMap?.resize(); }, 80); }
  window.scrollTo(0, 0);
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
    `Inventory collected (UTC): ${hw.inventory_collected_utc || 'unknown'}`,
    `Network interfaces: ${hw.network_interfaces.join(', ') || 'none'}`,
    `Linux Wi-Fi interfaces: ${hw.network_details?.filter(n=>n.wireless).map(n=>n.name).join(', ') || 'none visible'}`,
    `Bluetooth controller interfaces: ${hw.bluetooth_adapters?.join(', ') || 'none visible'}`,
    `NetworkManager utility: ${hw.command_availability.nmcli ? 'present' : 'not found'}`,
    `BlueZ utility: ${hw.command_availability.bluetoothctl ? 'present' : 'not found'}`,
    `RF tools: ${['iw','rtl_test','hackrf_info','gpsd'].filter(x=>hw.command_availability[x]).join(', ') || 'none found'}`,
    `RF capture: INACTIVE — ${hw.scan_status}`
  ].join('\n');
  const inventory = $('device-inventory');
  const usb = hw.usb_devices || [];
  const ports = hw.serial_ports || [];
  const nets = hw.network_details || [];
  inventory.innerHTML = `
    <div class="device-group"><h4>USB descriptors (${usb.length})</h4>
      ${usb.length ? usb.map(d=>`<div class="device-line">${escapeHTML(d.product || 'Unnamed USB device')} <small>${escapeHTML(d.manufacturer || 'Unknown manufacturer')} · ${escapeHTML(d.vendor_id)}:${escapeHTML(d.product_id)} · Port ${escapeHTML(d.port)}</small></div>`).join('') : '<div class="device-empty">No USB device descriptors visible. WSL USB passthrough may not be configured.</div>'}
    </div>
    <div class="device-group"><h4>Network and serial interfaces</h4>
      ${nets.map(d=>`<div class="device-line">${escapeHTML(d.name)} <small>${d.wireless ? 'Linux wireless interface visible; scan unverified' : 'Not identified as Linux wireless'}</small></div>`).join('')}
      ${ports.map(d=>`<div class="device-line">/dev/${escapeHTML(d)}<small>Unclassified serial endpoint; no driver attached by OpenRF</small></div>`).join('')}
      ${!(nets.length || ports.length) ? '<div class="device-empty">No relevant interfaces visible.</div>' : ''}
    </div>`;
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

// MapLibre is preferred, but remote JavaScript or tiles can be blocked by VPNs,
// network rules, or browser extensions. The independent raster map below never
// needs an external JavaScript library. It uses online OSM tiles if available,
// while retaining an offline coordinate grid and fully interactive survey pins.
function startMap() {
  if (state.map || state.rasterMap) return;
  if (!window.maplibregl) return startRasterMap('MapLibre is unavailable. Using the built-in raster/coordinate map.');
  const attempt = ++state.mapAttempt;
  try {
    state.map = new maplibregl.Map({container:'map', style:`https://tiles.openfreemap.org/styles/${state.style}`, center:[-98.5,39.8], zoom:3.5, attributionControl:true});
    state.map.addControl(new maplibregl.NavigationControl(), 'top-right');
    state.map.on('style.load', () => { state.mapReady = true; $('map-error').hidden = true; installMarkerLayer(); updateMap(); });
    state.map.on('click', (evt) => {
      if (state.mapReady && state.map.getLayer('survey-points') && state.map.queryRenderedFeatures(evt.point,{layers:['survey-points']}).length) return;
      openObservation(evt.lngLat.lat.toFixed(6), evt.lngLat.lng.toFixed(6));
    });
    state.map.on('click', 'survey-points', (evt) => {
      if (!evt.features?.length) return;
      const p = evt.features[0].properties;
      new maplibregl.Popup().setLngLat(evt.lngLat).setHTML(`<strong>${escapeHTML(p.label)}</strong><br>${escapeHTML(p.kind)} · ${escapeHTML(p.source)}<br><small>Observation position only</small>`).addTo(state.map);
    });
    state.map.on('error', evt => { if (evt.error && !state.mapReady) setTimeout(() => {
      if (attempt === state.mapAttempt && !state.mapReady && !state.rasterMap) switchToRasterMap('Vector style failed; showing raster map instead.');
    }, 500); });
    $('map-mode').textContent = 'Raster fallback';
    setTimeout(() => {
      if (attempt === state.mapAttempt && !state.mapReady && !state.rasterMap) switchToRasterMap('Vector map timed out; showing raster map instead.');
    }, 12000);
  } catch (error) {
    console.warn('MapLibre startup failed:', error);
    switchToRasterMap('Vector map startup failed; using built-in raster map.');
  }
}
function installMarkerLayer() {
  if (!state.map || state.map.getSource('survey-data')) return;
  state.map.addSource('survey-data', {type:'geojson',data:{type:'FeatureCollection',features:[]}});
  state.map.addLayer({id:'survey-points',type:'circle',source:'survey-data',paint:{
    'circle-color':['case',['==',['get','source'],'DEMO'],'#efa947','#30dec0'],
    'circle-radius':8,'circle-stroke-color':'#09252c','circle-stroke-width':2,'circle-opacity':0.9
  }});
}
function updateMap() {
  if (state.rasterMap) return state.rasterMap.render();
  if (!state.mapReady || !state.map?.getSource('survey-data')) return;
  const observations = state.observations.filter(o => o.latitude !== null && (state.showDemo || o.source !== 'DEMO'));
  const features = observations.map(o => ({type:'Feature',geometry:{type:'Point',coordinates:[o.longitude,o.latitude]},properties:{id:o.id,label:o.label,kind:o.kind,source:o.source}}));
  state.map.getSource('survey-data').setData({type:'FeatureCollection',features});
}
function switchToRasterMap(reason) {
  ++state.mapAttempt;
  if (state.map) { try { state.map.remove(); } catch(_) { /* partially initialized */ } }
  state.map = null;
  state.mapReady = false;
  startRasterMap(reason);
}
function worldPixel(lon, lat, zoom) {
  const size = 256 * (2 ** zoom);
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin(safeLat * Math.PI / 180);
  return [(lon + 180) / 360 * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size];
}
function pixelWorld(x, y, zoom) {
  const size = 256 * (2 ** zoom);
  const lon = ((((x / size) * 360) % 360) + 360) % 360 - 180;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size)));
  return [lon, lat];
}
function startRasterMap(reason) {
  if (state.rasterMap) return;
  $('map-error').hidden = true;
  const root = $('map');
  root.classList.add('raster-mode');
  root.classList.toggle('raster-dark', state.style === 'dark');
  const surface = document.createElement('div'); surface.className = 'raster-surface';
  const tiles = document.createElement('div'); tiles.className = 'raster-tiles';
  const pins = document.createElement('div'); pins.className = 'raster-pins';
  const notice = document.createElement('div'); notice.className = 'raster-notice';
  notice.textContent = `${reason} Street tiles require internet; the coordinate grid and saved observations remain usable offline.`;
  const attribution = document.createElement('div'); attribution.className = 'raster-attribution';
  const attributionLink = document.createElement('a'); attributionLink.href = 'https://www.openstreetmap.org/copyright';
  attributionLink.textContent = '© OpenStreetMap contributors'; attributionLink.target = '_blank'; attributionLink.rel = 'noopener noreferrer';
  attribution.append(attributionLink);
  const controls = document.createElement('div'); controls.className = 'raster-control';
  const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.title = 'Zoom in';
  const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.title = 'Zoom out';
  controls.append(plus, minus); surface.append(tiles, pins);
  root.replaceChildren(surface, notice, controls, attribution);
  const raster = {center:[-98.5,39.8], zoom:4, tileNodes:new Map(), failedTiles:new Set(),
    render() {
      const width = root.clientWidth, height = root.clientHeight;
      if (!width || !height) return;
      const center = worldPixel(raster.center[0], raster.center[1], raster.zoom);
      const size = 256 * 2 ** raster.zoom;
      const left = center[0] - width/2, top = center[1] - height/2;
      const startX = Math.floor(left/256), endX = Math.floor((left + width)/256);
      const startY = Math.floor(top/256), endY = Math.floor((top + height)/256);
      const visible = new Set(); const n = 2 ** raster.zoom;
      for (let ty=Math.max(0,startY); ty<=Math.min(n-1,endY); ty++) {
        for (let tx=startX; tx<=endX; tx++) {
          const wrapped = ((tx % n) + n) % n;
          const key = `${raster.zoom}/${wrapped}/${ty}`;
          if (raster.failedTiles.has(key)) continue;
          visible.add(key);
          let image = raster.tileNodes.get(key);
          if (!image) {
            image = document.createElement('img');
            image.alt = ''; image.setAttribute('aria-hidden','true');
            image.referrerPolicy = 'no-referrer'; image.loading = 'lazy';
            image.addEventListener('error',()=>{
              raster.failedTiles.add(key); raster.tileNodes.delete(key); image.remove();
            });
            image.src = `https://tile.openstreetmap.org/${key}.png`;
            raster.tileNodes.set(key,image); tiles.append(image);
          }
          image.style.left = `${tx*256-left}px`; image.style.top = `${ty*256-top}px`;
        }
      }
      for (const [key,image] of raster.tileNodes) {
        if (!visible.has(key)) { image.remove(); raster.tileNodes.delete(key); }
      }
      const nextPins = document.createDocumentFragment();
      state.observations.filter(o => o.latitude !== null && (state.showDemo || o.source !== 'DEMO')).forEach(o=>{
        const position = worldPixel(o.longitude, o.latitude, raster.zoom);
        const dx = ((position[0] - center[0] + size * 1.5) % size) - size/2;
        const dy = position[1] - center[1];
        if (Math.abs(dx) > width/2 + 15 || Math.abs(dy) > height/2 + 15) return;
        const pin = document.createElement('button'); pin.type = 'button';
        pin.className = `raster-pin${o.source === 'DEMO' ? ' demo' : ''}`;
        pin.style.left = `${width/2+dx}px`; pin.style.top = `${height/2+dy}px`;
        pin.title = `${o.label} (${o.kind}, ${o.source}) — observer position`;
        pin.addEventListener('click',e=>{e.stopPropagation(); flash(`${o.label} — ${o.kind} · ${o.source} · OBSERVATION LOCATION, not transmitter location.`);});
        nextPins.append(pin);
      });
      pins.replaceChildren(nextPins);
    },
    flyTo({center, zoom}) { raster.center = [...center]; if (Number.isFinite(zoom)) raster.zoom = Math.max(2,Math.min(18,Math.round(zoom))); raster.render(); },
    resize() { raster.render(); }
  };
  state.rasterMap = raster;
  $('map-mode').textContent = 'Try vector map';
  plus.addEventListener('click',e=>{e.stopPropagation();raster.zoom=Math.min(18,raster.zoom+1);raster.render();});
  minus.addEventListener('click',e=>{e.stopPropagation();raster.zoom=Math.max(2,raster.zoom-1);raster.render();});
  if (!root.dataset.rasterBound) {
    root.dataset.rasterBound = 'true';
    let start = null;
    root.addEventListener('pointerdown',e=>{
      if (!state.rasterMap || e.button !== 0 || e.target.closest('button, a')) return;
      start = {x:e.clientX,y:e.clientY,center:[...state.rasterMap.center], moved:false};
      root.setPointerCapture(e.pointerId);
    });
    root.addEventListener('pointermove',e=>{
      if (!start || !state.rasterMap) return;
      const dx=e.clientX-start.x, dy=e.clientY-start.y;
      if (Math.abs(dx)+Math.abs(dy)>6) start.moved=true;
      if (start.moved) {
        const from=worldPixel(start.center[0],start.center[1],state.rasterMap.zoom);
        state.rasterMap.center=pixelWorld(from[0]-dx,from[1]-dy,state.rasterMap.zoom);
        state.rasterMap.render();
      }
    });
    root.addEventListener('pointerup',e=>{
      if (!start || !state.rasterMap) return;
      const previous=start; start=null;
      if (previous.moved) return;
      const rect=root.getBoundingClientRect();
      const cp=worldPixel(state.rasterMap.center[0],state.rasterMap.center[1],state.rasterMap.zoom);
      const ll=pixelWorld(cp[0]+e.clientX-rect.left-rect.width/2, cp[1]+e.clientY-rect.top-rect.height/2,state.rasterMap.zoom);
      openObservation(ll[1].toFixed(6), ll[0].toFixed(6));
    });
    root.addEventListener('pointercancel',()=>{start=null;});
    root.addEventListener('wheel',e=>{
      if (!state.rasterMap) return;
      e.preventDefault(); state.rasterMap.zoom=Math.max(2,Math.min(18,state.rasterMap.zoom+(e.deltaY<0?1:-1)));
      state.rasterMap.render();
    },{passive:false});
  }
  raster.render();
}
function zoomToRecord(id) {
  const item = state.observations.find(o=>o.id===id); if (!item || item.latitude === null) return;
  showPage('map'); setTimeout(()=> (state.map || state.rasterMap)?.flyTo({center:[item.longitude,item.latitude],zoom:15}),100);
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
    (state.map || state.rasterMap)?.flyTo({center:[pos.coords.longitude,pos.coords.latitude],zoom:13});
    flash(`Browser-reported location shown (±${Math.round(pos.coords.accuracy)} m). Not stored.`);
  },()=>flash('Location unavailable or permission denied. You can pan the map manually.',true),{timeout:15000,enableHighAccuracy:false});
});
$('refresh-hardware').addEventListener('click',()=>runAction(async()=>{
  state.hardware = await api('/api/hardware'); renderHardware();
  flash('Read-only Linux hardware inventory refreshed. This did not start an RF scan.');
}));
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
