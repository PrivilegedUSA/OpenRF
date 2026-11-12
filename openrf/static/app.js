'use strict';

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = (val, suffix = '') => val === null || val === undefined || val === '' ? '—' : `${val}${suffix}`;
const stamp = (s) => s ? new Date(s).toLocaleString() : 'Not available';
const state = { observations: [], sessions: [], waypoints: [], waypointsTruncated: false, captures: [], diagnostics: null, readiness: null, hardware: null, map: null, mapReady: false, style: 'dark', mapVectorOffline:false, vectorStatus:null, navPinDragging:false, navPinJustDraggedAt:0, navFollowId:null, navFollowLast:0, navFollowProgress:0, rasterMap: null, mapAttempt: 0, showDemo: false, browserLocation: null, geoMarker: null, autoLocateAttempted: false, mapNavigationEpoch: 0, preferredView: null, wifiScan: null, sensors: [], serialTransport: null, pendingLocationView: null, offlineMaps: [], offlineMap: null, areaPlans: [], selectedArea: null, areaChoosing: false, areaFirstCorner: null, areaDraftBounds: null, navPicking:false, navPickedPoint:null, navPreview:null, navFitPending:false, navPickPanRestore:null, navDestinations:[], navOriginManual:false, navAddressResults:[], navSelectedAddress:null, navSearchToken:0, mapKinds: new Set(['WIFI','BLE','RF','CELLULAR','INFRASTRUCTURE','MANUAL']) };

async function api(url, method = 'GET', body = null) {
  const options = {method, headers: {}};
  if (url.startsWith('/api/navigation/geocode?') && url.includes('&online=1')) options.headers['X-OpenRF-Address-Consent']='yes';
  if (body !== null) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const res = await fetch(url, options);
  const json = await res.json();
  if (!res.ok) throw Error(json.error || `Request failed (${res.status})`);
  return json;
}

function flash(message, error = false) {
  const el = $('flash'); el.textContent = message; el.hidden = false; el.classList.toggle('error', error);
}
// The five-inch UI uses a real, accessible drawer, not a horizontally scrolling tab bar.
const compactNavigation = window.matchMedia('(max-width:900px), (max-width:1400px) and (max-height:850px) and (pointer:coarse)');
const menuButton = $('menu-toggle');
const menuBackdrop = $('menu-backdrop');
const mainSidebar = $('main-sidebar');
let navigationOpen = false;
function syncNavigation() {
  const compact = compactNavigation.matches;
  if (!compact) navigationOpen = false;
  document.body.classList.toggle('menu-open', compact && navigationOpen);
  menuBackdrop.hidden = !(compact && navigationOpen);
  menuButton.setAttribute('aria-expanded', String(compact && navigationOpen));
  menuButton.setAttribute('aria-label', navigationOpen ? 'Close navigation menu' : 'Open navigation menu');
  mainSidebar.inert = compact && !navigationOpen;
  document.querySelector('.main').inert = compact && navigationOpen;
}
function setNavigationOpen(open, restoreFocus = true) {
  const wasOpen = navigationOpen;
  navigationOpen = !!open && compactNavigation.matches;
  syncNavigation();
  if (navigationOpen) mainSidebar.querySelector('.nav-btn.active')?.focus();
  else if (wasOpen && restoreFocus) menuButton.focus();
}
menuButton.addEventListener('click', () => setNavigationOpen(!navigationOpen));
$('menu-close').addEventListener('click', () => setNavigationOpen(false));
menuBackdrop.addEventListener('click', () => setNavigationOpen(false));
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigationOpen) { event.preventDefault(); setNavigationOpen(false); }
});
if (compactNavigation.addEventListener) compactNavigation.addEventListener('change', syncNavigation);
else compactNavigation.addListener(syncNavigation);
syncNavigation();

function showPage(page, options = {}) {
  if(page!=='map' && state.navFollowId!==null) stopNavigationFollow();
  if (navigationOpen) {
    setNavigationOpen(false, false);
    $('page-title').setAttribute('tabindex', '-1');
    $('page-title').focus({preventScroll: true});
  }
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  const titles = {overview:'Field overview',map:'Survey map',scanner:'Signal analysis',discoveries:'Saved discoveries',sessions:'Investigations',hardware:'Hardware manager'};
  $('page-title').textContent = titles[page] || 'OpenRF'; $('page-crumb').textContent = page.toUpperCase();
  if (page === 'map') { startMap(); if (options.autoLocate !== false) locateMap(false); renderMapSurveyPanel(); setTimeout(() => { state.map?.resize(); state.rasterMap?.resize(); }, 80); }
  window.scrollTo(0, 0);
}

async function refresh() {
  const [records, sessions, stats, hardware, sensorData, captureData, diagnostics, readiness, waypointData] = await Promise.all([
    api('/api/observations'), api('/api/sessions'), api('/api/stats'), api('/api/hardware'), api('/api/sensors'),
    api('/api/captures'), api('/api/sensors/diagnostics'), api('/api/hardware/readiness'), api('/api/survey/waypoints')
  ]);
  state.observations = records.observations;
  state.sessions = sessions.sessions;
  state.waypoints = waypointData.waypoints || [];
  state.waypointsTruncated = Boolean(waypointData.truncated);
  state.hardware = hardware;
  state.sensors = sensorData.sensors || [];
  state.serialTransport = sensorData.serial_transport || null;
  state.captures = captureData.captures || [];
  state.diagnostics = diagnostics;
  state.readiness = readiness;
  $('metric-observations').textContent = stats.observations;
  $('metric-mapped').textContent = stats.mapped;
  $('metric-sessions').textContent = stats.sessions;
  $('metric-demo').textContent = stats.demo;
  $('runtime-pill').textContent = hardware.environment;
  $('scanner-connection-pill').textContent = hardware.wifi_one_shot?.possible ? 'ON-DEMAND WI-FI POSSIBLE' : 'NO LINUX WI-FI SCANNER';
  refreshDiscoverySessions(); renderDiscoveries(); renderSessions(); renderCaptures(); renderHardware(); renderSensorRegistry(); renderSerialPorts(); renderHardwareReadiness(); renderSignals(); updateMap(); renderMapSurveyPanel(); renderWaypoints();
}

// Browser geolocation is used only at the operator's request in the manual
// observation dialog. Coordinates are the observer's approximate position,
// never an automatically detected camera/transmitter position.
let observationLocationRequestId = 0;
let observationLocationFix = null;
function openObservation(lat = '', lon = '') {
  ++observationLocationRequestId; // invalidate callbacks from any previous dialog
  observationLocationFix = null;
  const form = $('observation-form');
  form.reset();
  form.elements.latitude.value = lat;
  form.elements.longitude.value = lon;
  form.elements.location_source.value = lat !== '' && lon !== '' ? 'MANUAL_ENTRY' : 'UNSPECIFIED';
  form.elements.fix_age_seconds.value = '';
  $('observation-use-location').disabled = false;
  $('observation-location-status').textContent = lat !== '' && lon !== ''
    ? 'Coordinates selected on map. Use my location will replace them with a fresh browser-reported observer position.'
    : 'No location selected. Use my location only when you are at the observation site, or enter coordinates manually.';
  $('observation-dialog').showModal();
}
function observationCoordinateEdited() {
  // A manual edit wins over a pending asynchronous geolocation callback.
  ++observationLocationRequestId;
  $('observation-use-location').disabled = false;
  const form = $('observation-form');
  if (form.elements.location_source.value === 'BROWSER_REPORTED') {
    form.elements.accuracy_m.value = ''; // old accuracy no longer applies to edited coordinates
    form.elements.fix_age_seconds.value = '';
    observationLocationFix = null;
  }
  form.elements.location_source.value = form.elements.latitude.value && form.elements.longitude.value
    ? 'MANUAL_ENTRY' : 'UNSPECIFIED';
  $('observation-location-status').textContent = 'Coordinates entered manually; browser accuracy and fix age are not attached.';
}
function useLocationForObservation() {
  const status = $('observation-location-status');
  const button = $('observation-use-location');
  if (!navigator.geolocation) {
    status.textContent = 'Browser location is unavailable. Enter coordinates or choose a map point.';
    return;
  }
  const requestId = ++observationLocationRequestId;
  button.disabled = true;
  status.textContent = 'Requesting a fresh browser location… Nothing is saved yet.';
  const finish = () => {
    if (requestId !== observationLocationRequestId || !$('observation-dialog').open) return false;
    button.disabled = false;
    return true;
  };
  navigator.geolocation.getCurrentPosition(pos => {
    if (!finish()) return;
    const {latitude, longitude, accuracy} = pos.coords || {};
    const ageSeconds = (Date.now() - pos.timestamp) / 1000;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
        !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1000000 ||
        !Number.isFinite(ageSeconds) || ageSeconds < -5 || ageSeconds > 60) {
      status.textContent = 'Browser location was invalid or stale. Retry or enter coordinates manually.';
      return;
    }
    const form = $('observation-form');
    form.elements.latitude.value = latitude.toFixed(7);
    form.elements.longitude.value = longitude.toFixed(7);
    form.elements.accuracy_m.value = accuracy.toFixed(1);
    form.elements.location_source.value = 'BROWSER_REPORTED';
    form.elements.fix_age_seconds.value = Math.max(0,ageSeconds).toFixed(1);
    observationLocationFix = {reportedAt: pos.timestamp};
    status.textContent = `Browser observer position filled (±${Math.round(accuracy)} m; fix age ${Math.round(Math.max(0,ageSeconds))} s). Check the coordinates before saving. Desktop/VPN location may be approximate.`;
  }, err => {
    if (!finish()) return;
    const reason = err.code === 1 ? 'permission denied' : err.code === 3 ? 'request timed out' : 'position unavailable';
    status.textContent = `Location ${reason}. Existing coordinates were not changed; retry or enter them manually.`;
  }, {enableHighAccuracy:true, maximumAge:0, timeout:15000});
}

// v0.2.16: browse only stored observations. Filters do not request hardware,
// infer transmitter positions, or mutate the SQLite investigation database.
function refreshDiscoverySessions() {
  const select = $('discovery-session');
  const chosen = select.value || 'ALL';
  select.replaceChildren();
  for (const [value, label] of [['ALL','All investigations'],['NONE','Not linked to a session']]) {
    const opt = document.createElement('option'); opt.value = value; opt.textContent = label; select.append(opt);
  }
  state.sessions.forEach(session => {
    const opt = document.createElement('option');
    opt.value = String(session.id); opt.textContent = `${session.name} (#${session.id})`;
    select.append(opt);
  });
  select.value = [...select.options].some(opt=>opt.value === chosen) ? chosen : 'ALL';
}
function filteredDiscoveries(now = Date.now()) {
  const keyword = $('discovery-search').value.trim().toLowerCase();
  const kind = $('discovery-kind').value;
  const source = $('discovery-source').value;
  const session = $('discovery-session').value;
  const age = $('discovery-age').value;
  const mapped = $('discovery-mapped').checked;
  const includeDemo = $('show-demo-list').checked;
  const cutoff = age === 'ALL' ? null : now - Number(age) * 86400000;
  const items = state.observations.filter(o =>
    (includeDemo || o.source !== 'DEMO') &&
    (kind === 'ALL' || kind === o.kind) &&
    (source === 'ALL' || source === o.source) &&
    (session === 'ALL' || (session === 'NONE' ? o.session_id == null : String(o.session_id) === session)) &&
    (!mapped || (o.latitude != null && o.longitude != null)) &&
    (cutoff === null || (Number.isFinite(Date.parse(o.observed_at)) && Date.parse(o.observed_at) >= cutoff && Date.parse(o.observed_at) <= now)) &&
    (!keyword || [o.label, o.identifier, o.notes, o.source_device].some(s => String(s || '').toLowerCase().includes(keyword)))
  );
  // Timestamp sorts are explicitly historical; stable ID resolves duplicate times.
  items.sort((a,b) => {
    const order = (Date.parse(a.observed_at) || 0) - (Date.parse(b.observed_at) || 0) || a.id - b.id;
    return $('discovery-sort').value === 'OLDEST' ? order : -order;
  });
  return items;
}
function csvCell(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = String(value ?? '');
  // Never let exported labels/notes from imports become spreadsheet formulas.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g,'""') + '"';
}
function discoveriesCsv(items) {
  const cols = ['id','observed_at','kind','source','label','identifier','notes','source_device','frequency_mhz','rssi_dbm','signal_quality_percent','latitude','longitude','accuracy_m','location_source','fix_age_seconds','session_id','survey_capture_id','timestamp_basis','device_reported_at_utc','hardware_id'];
  return '\uFEFF' + cols.join(',') + '\r\n' + items.map(item => cols.map(col=>csvCell(item[col])).join(',')).join('\r\n') + '\r\n';
}
function downloadShownDiscoveries() {
  const items = filteredDiscoveries();
  if (!items.length) return;
  const blob = new Blob([discoveriesCsv(items)], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'openrf-filtered-observations.csv';
  document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  flash(`Prepared local CSV for ${items.length} matching saved record(s). No upload performed.`);
}
function resetDiscoveryFilters() {
  $('discovery-search').value = '';
  $('discovery-kind').value = 'ALL';
  $('discovery-source').value = 'ALL';
  $('discovery-session').value = 'ALL';
  $('discovery-age').value = 'ALL';
  $('discovery-sort').value = 'NEWEST';
  $('discovery-mapped').checked = false;
  $('show-demo-list').checked = false;
  $('discovery-refine').open = false;
  renderDiscoveries();
}
function renderDiscoveries() {
  const items = filteredDiscoveries();
  $('discovery-results-count').textContent = `${items.length} of ${state.observations.length} saved observation(s) shown${state.observations.length >= 10000 ? ' (latest 10,000 records loaded)' : ''}`;
  $('discovery-export').disabled = !items.length;
  $('discoveries-list').innerHTML = items.length ? items.map(o => `
    <article class="item"><div><div class="item-top"><h4>${escapeHTML(o.label)}</h4>
    <span class="badge">${escapeHTML(o.kind)}</span><span class="badge ${o.source === 'DEMO'?'demo':'manual'}">${escapeHTML(o.source)}</span></div>
    <p>${escapeHTML(o.notes || (o.identifier ? `Identifier: ${o.identifier}` : 'No notes'))}</p>
    <div class="tiny">${escapeHTML(stamp(o.observed_at))} · ${o.latitude === null ? 'No survey coordinates' : `${Number(o.latitude).toFixed(5)}, ${Number(o.longitude).toFixed(5)} — observer position`} · ${escapeHTML(o.source_device)}</div>
    ${o.rssi_dbm !== null ? `<div class="tiny">RSSI ${escapeHTML(o.rssi_dbm)} dBm ${o.frequency_mhz !== null ? `· ${escapeHTML(o.frequency_mhz)} MHz` : ''}</div>` : ''}
    ${o.signal_quality_percent !== null && o.signal_quality_percent !== undefined ? `<div class="tiny">NetworkManager quality ${escapeHTML(o.signal_quality_percent)}% (not RSSI) · ${escapeHTML(o.location_source || 'UNSPECIFIED')} observer location ${o.fix_age_seconds !== null ? `· fix age ${escapeHTML(o.fix_age_seconds)} seconds` : ''}</div>` : ''}
    </div><div class="item-actions">${o.latitude !== null ? `<button class="btn mini outline" data-zoom="${o.id}">Map</button>` : ''}<button class="btn mini danger-outline" data-delete="${o.id}">Delete</button></div></article>`).join('') :
    '<div class="empty">No saved observations match these filters. DEMO data requires explicit opt-in. Clear filters to view all available non-demo records.</div>';
}

function updateSessionReportSelector() {
  const select = $('session-report-select');
  const previous = select.value;
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.textContent = 'Select an investigation';
  select.append(placeholder);
  for (const session of state.sessions) {
    const opt = document.createElement('option');
    opt.value = String(session.id);
    opt.textContent = `#${session.id} · ${session.name} (${session.status})`;
    select.append(opt);
  }
  if (state.sessions.some(s => String(s.id) === previous)) select.value = previous;
  else if (state.sessions.length === 1) select.value = String(state.sessions[0].id);
  const active = !!select.value;
  ['session-report-preview', 'session-report-html', 'session-report-json'].forEach(id => $(id).disabled = !active);
  $('session-report-status').textContent = active
    ? 'Ready for a historical report. DEMO and exact coordinates are opt-in. Review notes and identifiers before sharing.'
    : 'Choose an investigation. No files are generated automatically.';
}

function sessionReportUrl(kind, download = false) {
  const selected = $('session-report-select').value;
  if (!/^[0-9]+$/.test(selected) || !state.sessions.some(s => String(s.id) === selected)) {
    throw Error('Choose an investigation first.');
  }
  const query = new URLSearchParams({
    include_demo: $('session-report-demo').checked ? '1' : '0',
    include_coordinates: $('session-report-coordinates').checked ? '1' : '0',
    download: download ? '1' : '0'
  });
  return `/api/reports/sessions/${selected}.${kind}?${query.toString()}`;
}

function openSessionReport(kind, download = false) {
  const url = sessionReportUrl(kind, download);
  // A trusted local same-origin URL is built solely from an existing numeric
  // session ID, validated options and a fixed HTML/JSON format.
  if (download) {
    const link = document.createElement('a');
    link.href = url; link.download = `openrf-investigation-${$('session-report-select').value}.${kind}`;
    document.body.append(link); link.click(); link.remove();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  $('session-report-status').textContent = download
    ? 'Historical report download requested. File remains on this device unless you share it.'
    : 'Report opened in a new tab. Use Ctrl+P or your browser’s Print menu to print or Save as PDF.';
}

function renderSessions() {
  $('session-count').textContent = `${state.sessions.length} sessions`;
  $('session-list').innerHTML = state.sessions.length ? state.sessions.map(s => `
    <article class="item"><div><div class="item-top"><h4>${escapeHTML(s.name)}</h4><span class="badge ${s.status === 'ACTIVE' ? '' : 'manual'}">${escapeHTML(s.status)}</span></div>
    <p>${escapeHTML(s.observation_count)} saved observations · ${escapeHTML(s.capture_count || 0)} survey snapshots · Started ${escapeHTML(stamp(s.started_at))}</p>
    <div class="tiny">${s.ended_at ? `Ended ${escapeHTML(stamp(s.ended_at))}` : 'No finish timestamp recorded'} · Records stay local</div>
    </div><div class="item-actions"><button class="btn mini outline" data-session-filter="${s.id}">Records</button><button class="btn mini outline" data-session-report="${s.id}">Report</button>
    ${s.status === 'ACTIVE' ? `<button class="btn mini danger-outline" data-stop="${s.id}">Stop</button>` : ''}</div></article>`).join('') :
    '<div class="empty">No sessions started. You can record notes against a session, but no background collection occurs.</div>';
  updateSessionReportSelector();
}

function renderCaptures() {
  const dest = $('captures-list');
  $('capture-count').textContent = `${state.captures.length} captures`;
  dest.innerHTML = state.captures.length ? state.captures.slice(0, 50).map(c => `
    <div class="capture-entry"><div><strong>${escapeHTML(c.sensor_id === 'openrf-serial-v1' ? 'USB sensor snapshot' : 'Wi-Fi survey')} #${escapeHTML(c.id)} · ${escapeHTML(c.saved_count)} saved of ${escapeHTML(c.result_count)} returned</strong>
    <p>Retrieved ${escapeHTML(stamp(c.retrieved_at_utc))} · ${escapeHTML(c.interface)} · ${escapeHTML(c.freshness)} · ${escapeHTML(c.location_source === 'BROWSER_REPORTED' ? `browser survey fix ±${c.accuracy_m} m; reported age ${c.fix_age_seconds}s` : 'no survey location')} · ${c.session_id ? `session #${escapeHTML(c.session_id)}` : 'not linked to a session'}</p></div><span class="badge">SENSOR</span></div>`).join('') :
    '<div class="empty">No wireless survey snapshots saved. Start a supported Wi-Fi scan from Map or Analysis, then choose Save scan snapshot.</div>';
}

function renderSensorRegistry() {
  const dest = $('sensor-registry-list');
  const diag = state.diagnostics;
  if (diag) $('sensor-diagnostics').textContent = `Inventory ${stamp(diag.collected_at_utc)} · Wi-Fi ${diag.wifi.prerequisites.possible ? 'prerequisites visible; scan not guaranteed' : 'unavailable'} · Last retrieval: ${diag.wifi.last_retrieval.last_scan} · ${diag.receiver_status}`;
  dest.innerHTML = state.sensors.map(sensor => `<div class="sensor-row">
    <div><strong>${escapeHTML(sensor.label)}</strong><div class="tiny">${escapeHTML(sensor.description)} · ${escapeHTML(sensor.sensor_id)}</div></div>
    <span class="pill ${sensor.status === 'ready' ? 'green' : 'amber'}">${escapeHTML(sensor.status.replaceAll('_',' '))}</span>
  </div>`).join('') || '<div class="empty">No sensor adapters registered.</div>';
}

function renderSerialPorts() {
  const select = $('usb-sensor-port');
  const previouslySelected = select.value;
  const ports = state.serialTransport?.ports || state.hardware?.serial_ports || [];
  const diagnostics = state.hardware?.serial_port_diagnostics || [];
  select.replaceChildren();
  if (!ports.length) {
    const option = document.createElement('option'); option.value = ''; option.textContent = 'No Linux USB-serial ports visible'; select.append(option);
    $('usb-sensor-status').textContent = 'No ttyUSB/ttyACM device is visible to Linux. On WSL, a physical USB board usually needs passthrough. This does not indicate RF coverage or a working receiver.';
  } else {
    for (const port of ports) { const option = document.createElement('option'); option.value = port; const info = diagnostics.find(d=>d.port===port); option.textContent = `/dev/${port} — ${info?.access === 'permission_denied' ? 'permission denied' : 'protocol unverified'}`; select.append(option); }
    if (ports.includes(previouslySelected)) select.value = previouslySelected;
  }
  for (const id of ['usb-sensor-probe','usb-sensor-capture']) $(id).disabled = ports.length === 0;
}
function recentSerialSurveyLocation() {
  if (!$('usb-sensor-location').checked) return null;
  const loc = state.browserLocation;
  const seconds = loc ? (Date.now() - loc.capturedAt) / 1000 : Infinity;
  if (!loc || seconds < 0 || seconds > 60) throw Error('No recent browser fix. Open Map → My location, then capture within 60 seconds, or uncheck the location option.');
  return {latitude:loc.lat, longitude:loc.lon, accuracy_m:loc.accuracy, fix_age_seconds:Math.round(seconds*10)/10};
}
async function runSerialSensor(snapshot) {
  const button = $(snapshot ? 'usb-sensor-capture' : 'usb-sensor-probe');
  const port = $('usb-sensor-port').value;
  if (!port) return flash('No inventoried USB serial port is available.', true);
  const survey_location = snapshot ? recentSerialSurveyLocation() : null;
  if (snapshot && !confirm('Request and save ONE snapshot from the selected, device-reported OpenRF Serial v1 module? No location is attached unless selected. The sensor identity and readings are not independently verified.')) return;
  const active = state.sessions.find(s=>s.status === 'ACTIVE');
  const body = snapshot ? {port, survey_location, session_id: active?.id || null} : {port};
  const buttons = [$('usb-sensor-probe'), $('usb-sensor-capture')];
  buttons.forEach(b=>b.disabled=true);
  $('usb-sensor-status').textContent = snapshot ? 'Requesting a single sensor snapshot over USB…' : 'Probing selected Linux USB serial port…';
  try {
    const result = await api(snapshot ? '/api/sensors/serial/snapshot' : '/api/sensors/serial/probe', 'POST', body);
    if (snapshot) {
      const cap = result.capture; const data = result.snapshot;
      $('usb-sensor-status').textContent = `Saved snapshot #${cap.id}: ${cap.saved_count} device-reported records from ${data.hardware_id} at ${stamp(data.retrieved_at_utc)}. ${data.freshness}. Identity and calibration unverified. ${cap.location_source === 'BROWSER_REPORTED' ? 'Browser observer position attached.' : 'No GPS position attached.'}`;
      flash(`USB snapshot saved: ${cap.saved_count} unverified device-reported observation(s).`);
    } else {
      $('usb-sensor-status').textContent = `Protocol ${result.protocol}; device-reported ID ${result.hardware_id}; declared measurements: ${result.capabilities.join(', ') || 'none'}. ${result.warning}`;
      flash(`OpenRF serial protocol responded on /dev/${port}. This is not a measurement or hardware identity verification.`);
    }
    await refresh();
  } catch(error) { $('usb-sensor-status').textContent = `USB sensor unavailable: ${error.message}`; flash(error.message,true); }
  finally {
    buttons.forEach(b=>b.disabled=!($('usb-sensor-port').value));
    try {
      state.diagnostics = await api('/api/sensors/diagnostics');
      state.readiness = await api('/api/hardware/readiness');
      renderSensorRegistry(); renderHardwareReadiness();
    } catch (_) { /* Never mask the actual probe outcome if diagnostics fail. */ }
  }
}

function renderHardwareReadiness() {
  const report = state.readiness;
  const items = $('hardware-readiness-items');
  const updated = $('hardware-readiness-updated');
  const exportButton = $('hardware-readiness-export');
  if (!report || !Array.isArray(report.checklist)) {
    items.innerHTML = '<div class="empty">No read-only readiness report is available.</div>';
    updated.textContent = 'Readiness unavailable. Try Refresh inventory.';
    exportButton.disabled = true;
    return;
  }
  exportButton.disabled = false;
  updated.textContent = `Checked ${stamp(report.collected_at_utc)} · ${report.summary.usb_serial_ports_visible} Linux serial port(s) visible · No RF scan started.`;
  items.innerHTML = report.checklist.map(check => `
    <div class="readiness-item"><div class="readiness-heading"><strong>${escapeHTML(check.label)}</strong><span class="pill">${escapeHTML(check.status.replaceAll('_', ' '))}</span></div>
      <p>${escapeHTML(check.explanation)}</p><div class="tiny"><strong>Next:</strong> ${escapeHTML(check.next_step)}</div></div>`).join('');
}
function downloadHardwareReadiness() {
  if (!state.readiness) return flash('Refresh hardware readiness before exporting.', true);
  if (!confirm('Save a read-only hardware readiness report? It contains Linux environment and device counts, not private investigations, GPS, USB serial numbers, or RF samples.')) return;
  const content = JSON.stringify(state.readiness, null, 2);
  const url = URL.createObjectURL(new Blob([content], {type:'application/json;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url;
  a.download = 'openrf-hardware-readiness.json'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderHardware() {
  const hw = state.hardware; if (!hw) return;
  $('hardware-platform').textContent = hw.environment;
  $('hardware-cards').innerHTML = hw.capabilities.map(c => `
    <div class="hardware-card"><div class="panel-title"><h3>${escapeHTML(c.title)}</h3><span class="pill ${c.status === 'ready'?'green':'amber'}">${escapeHTML(c.status.replaceAll('_',' '))}</span></div>
    <p>${escapeHTML(c.description)}</p><small>Requires: ${escapeHTML(c.requires)}</small></div>`).join('');
  $('wifi-driver-status').textContent = hw.wifi_one_shot?.possible ?
    `Adapter ${hw.wifi_one_shot.interface} and nmcli found. A user-started survey is possible; actual operation unverified.` :
    `Not ready: ${hw.wifi_one_shot?.reason || 'No supported Linux interface'}. No WSL internal Wi-Fi passthrough.`;
  $('environment-info').textContent = [
    `Runtime: ${hw.environment}`, `Python: ${hw.python}`,
    `Inventory collected (UTC): ${hw.inventory_collected_utc || 'unknown'}`,
    `Network interfaces: ${hw.network_interfaces.join(', ') || 'none'}`,
    `Linux Wi-Fi interfaces: ${hw.network_details?.filter(n=>n.wireless).map(n=>n.name).join(', ') || 'none visible'}`,
    `Bluetooth controller interfaces: ${hw.bluetooth_adapters?.join(', ') || 'none visible'}`,
    `NetworkManager utility: ${hw.command_availability.nmcli ? 'present' : 'not found'}`,
    `BlueZ utility: ${hw.command_availability.bluetoothctl ? 'present' : 'not found'}`,
    `RF tools: ${['iw','rtl_test','hackrf_info','gpsd'].filter(x=>hw.command_availability[x]).join(', ') || 'none found'}`,
    `USB serial endpoints: ${(hw.serial_ports || []).join(', ') || 'none visible'}` ,
    `RF capture: INACTIVE — ${hw.scan_status}`
  ].join('\n');
  const inventory = $('device-inventory');
  const usb = hw.usb_devices || [];
  const ports = hw.serial_ports || [];
  const portDetails = hw.serial_port_diagnostics || [];
  const nets = hw.network_details || [];
  inventory.innerHTML = `
    <div class="device-group"><h4>USB descriptors (${usb.length})</h4>
      ${usb.length ? usb.map(d=>`<div class="device-line">${escapeHTML(d.product || 'Unnamed USB device')} <small>${escapeHTML(d.manufacturer || 'Unknown manufacturer')} · ${escapeHTML(d.vendor_id)}:${escapeHTML(d.product_id)} · Port ${escapeHTML(d.port)}</small></div>`).join('') : '<div class="device-empty">No USB device descriptors visible. WSL USB passthrough may not be configured.</div>'}
    </div>
    <div class="device-group"><h4>Network and serial interfaces</h4>
      ${nets.map(d=>`<div class="device-line">${escapeHTML(d.name)} <small>${d.wireless ? 'Linux wireless interface visible; scan unverified' : 'Not identified as Linux wireless'}</small></div>`).join('')}
      ${ports.map(d=>{ const info=portDetails.find(p=>p.port===d); return `<div class="device-line">/dev/${escapeHTML(d)}<small>${escapeHTML(info?.access || 'unverified')} · ${escapeHTML(info?.device_type || 'unknown')} · group ${escapeHTML(info?.group || 'unknown')}<br>${escapeHTML(info?.guidance || 'No sensor protocol verified')}</small></div>`; }).join('')}
      ${!(nets.length || ports.length) ? '<div class="device-empty">No relevant interfaces visible.</div>' : ''}
    </div>`;
}

function renderSignals() {
  const signals = state.observations.filter(o => ['WIFI','BLE','RF','CELLULAR'].includes(o.kind));
  const rows = signals.filter(o => o.source !== 'DEMO').slice(0, 100);
  $('scan-count').textContent = `${signals.filter(o=>o.source !== 'DEMO').length} saved · DEMO excluded`;
  renderWifiScan();
  $('signal-table').innerHTML = rows.length ? `<table class="data-table"><thead><tr><th>IDENTIFIER</th><th>KIND</th><th>RSSI</th><th>QUALITY</th><th>FREQUENCY</th><th>PROVENANCE</th><th>TIME</th></tr></thead><tbody>${rows.map(o=>`<tr><td data-label="Identifier">${escapeHTML(o.identifier || o.label)}</td><td data-label="Kind">${escapeHTML(o.kind)}</td><td data-label="RSSI">${format(o.rssi_dbm, ' dBm')}</td><td data-label="Quality">${format(o.signal_quality_percent, '%')}</td><td data-label="Frequency">${format(o.frequency_mhz, ' MHz')}</td><td data-label="Source">${escapeHTML(o.source)}</td><td data-label="Time">${escapeHTML(stamp(o.observed_at))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No saved RF measurements yet. One-shot Wi-Fi results above are temporary and not stored automatically.</div>';
  refreshHistorySeries();
  renderComparison();
}

// Map-first workflow: display stored observations only at actual survey coordinates.
// A one-shot NetworkManager result has no coordinates; keep its temporary list
// in the sheet, never plot it at a presumed transmitter position.
function mapVisibleObservations() {
  return state.observations.filter(o =>
    Number.isFinite(o.latitude) && Number.isFinite(o.longitude) &&
    state.mapKinds.has(o.kind) && (state.showDemo || o.source !== 'DEMO'));
}
function renderMapSurveyPanel() {
  const all = mapVisibleObservations();
  const wireless = all.filter(o => ['WIFI','BLE','RF','CELLULAR'].includes(o.kind));
  $('map-layer-count').textContent = String(all.length);
  $('map-layer-count').hidden = all.length === 0;
  $('map-survey-toggle').setAttribute('aria-label', `Layers and scan (${all.length} mapped points)`);
  $('map-survey-summary').textContent = `${all.length} mapped survey point(s) visible · ${wireless.length} wireless-category record(s). Positions are where readings/notes were entered, not transmitter locations.`;
  const output = $('map-wifi-readings');
  const scan = state.wifiScan;
  if (!scan) { output.innerHTML = ''; updateCaptureButtons(); return; }
  const entries = (scan.records || []).slice(0, 8);
  output.innerHTML = `<div class="map-live-heading"><strong>Last one-shot Wi-Fi scan</strong><span>${escapeHTML(stamp(scan.retrieved_at_utc))}</span></div>
    <p>${escapeHTML(scan.interface)} · ${escapeHTML(scan.freshness)} · ${scan.records?.length || 0} result(s) · <b>Not geolocated or mapped</b></p>
    ${entries.map(n=>`<div class="map-live-row"><div><strong>${escapeHTML(n.ssid || 'Hidden SSID')}</strong><span>${escapeHTML(format(n.frequency_mhz,' MHz'))} · Quality ${escapeHTML(format(n.signal_quality_percent,'%'))}</span></div><button type="button" class="btn mini outline" data-save-wifi="${escapeHTML(n.bssid)}" ${scan.scan_id ? '' : 'disabled'}>Save</button></div>`).join('')}
    ${scan.records?.length > entries.length ? `<p>Showing first ${entries.length} networks; see Detailed analysis for all.</p>` : ''}`;
}
function setMapSurveyOpen(open) {
  $('map-survey-panel').hidden = !open;
  $('map-survey-toggle').setAttribute('aria-expanded', String(open));
}
function renderWifiScan() {
  const out = $('live-wifi-results');
  if (!out) return;
  const scan = state.wifiScan;
  if (!scan) {
    out.innerHTML = '<div class="empty">No one-shot Wi-Fi survey has been requested. Results are shown only when a real Linux interface responds.</div>';
    return;
  }
  const entries = scan.records || [];
  out.innerHTML = `<p class="tiny">${escapeHTML(scan.interface)} · Retrieved ${escapeHTML(stamp(scan.retrieved_at_utc))} · ${entries.length} access point(s). ${escapeHTML(scan.freshness)}. Quality % is not RSSI in dBm. No GPS or transmitter coordinates.</p>` +
    (entries.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>SSID</th><th>BSSID</th><th>FREQ.</th><th>CHANNEL</th><th>QUALITY</th><th>SECURITY</th><th>SAVE</th></tr></thead><tbody>${entries.map(n=>`<tr><td data-label="SSID">${escapeHTML(n.ssid)}</td><td data-label="BSSID">${escapeHTML(n.bssid)}</td><td data-label="Frequency">${format(n.frequency_mhz,' MHz')}</td><td data-label="Channel">${format(n.channel)}</td><td data-label="Quality">${format(n.signal_quality_percent,'%')}</td><td data-label="Security">${escapeHTML(n.security)}</td><td data-label="Save"><button type="button" class="btn mini outline" data-save-wifi="${escapeHTML(n.bssid)}" ${scan.scan_id ? '' : 'disabled'}>Save</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">NetworkManager returned no access points. This does not prove the area has no wireless signals.</div>');
}

// Historical charts use exactly the same identity contract as the comparison
// engine; selecting an identifier never silently mixes devices, frequencies or %/dBm.
function historySelection() {
  const engine = window.OpenRFHistoryAnalysis;
  const series = engine?.makeSeries(state.observations, $('history-include-demo').checked)
    .find(item=>item.key === $('signal-select').value);
  return {engine, series, selection:series ? engine.history(series, $('history-window').value) : null};
}
function refreshHistorySeries() {
  const engine = window.OpenRFHistoryAnalysis, select = $('signal-select'), previous = select.value;
  if (!engine) { $('history-summary').textContent = 'Historical analysis module is unavailable.'; return; }
  const list = engine.makeSeries(state.observations, $('history-include-demo').checked);
  select.replaceChildren();
  const empty = document.createElement('option'); empty.value=''; empty.textContent='Select one historical measurement series'; select.append(empty);
  for (const series of list) {
    const option = document.createElement('option'); option.value=series.key;
    option.textContent=`${series.kind} · ${series.identifier} · ${series.metricName} (${series.unit}) · ${series.frequency_mhz ?? '?'} MHz · ${series.source} · ${series.source_device} (${series.rows.length})`;
    select.append(option);
  }
  select.value = list.some(series=>series.key===previous) ? previous : '';
  drawHistory();
}
function drawHistory() {
  const {engine,series,selection} = historySelection();
  const summary = $('history-summary'), chart = $('history-graph'), details = $('history-records');
  $('history-export').disabled = !selection?.rows.length;
  if (!engine || !series || !selection?.stats) {
    summary.textContent='Choose a compatible saved measurement series. DEMO records are excluded by default.';
    chart.innerHTML='<div class="empty">No saved readings selected. A scan does not appear here until you explicitly save its observations.</div>';
    details.replaceChildren();
    return;
  }
  const fmt = val=>Number(val).toFixed(1);
  const result = selection.stats;
  summary.innerHTML=`<div class="history-summary-grid"><div><small>Saved readings in window</small><strong>${result.count}</strong></div><div><small>Median ${escapeHTML(series.unit)}</small><strong>${fmt(result.median)}</strong></div><div><small>Lowest ${escapeHTML(series.unit)}</small><strong>${fmt(result.min)}</strong></div><div><small>Highest ${escapeHTML(series.unit)}</small><strong>${fmt(result.max)}</strong></div></div>
    <p class="small muted">${escapeHTML(series.kind)} · ${escapeHTML(series.identifier)} · ${escapeHTML(series.source)} · ${escapeHTML(series.source_device)}${series.hardware_id?` · Device ID ${escapeHTML(series.hardware_id)}`:''} · ${series.frequency_mhz ?? '?'} MHz · ${escapeHTML(series.metricName)}</p>
    <p class="small muted">${escapeHTML(stamp(result.first))} to ${escapeHTML(stamp(result.last))} · ${selection.skipped} older reading(s) outside window · ${selection.drawn} plotted of ${result.count} (all selected readings included in statistics and CSV)</p>
    <ul class="comparison-cautions">${selection.warnings.map(w=>`<li>${escapeHTML(w)}</li>`).join('')}</ul>`;
  const pts=selection.plot;
  const x0=40,x1=592,y0=14,y1=176;
  const low=result.min,high=result.max;
  const diff=high-low || 1;
  const a=pts[0]._time,b=pts[pts.length-1]._time;
  const coords=pts.map((row,index)=>({x:x0+(b===a?(pts.length===1?0.5:index/(pts.length-1)):(row._time-a)/(b-a))*(x1-x0),
    y:y1-((row._value-low)/diff)*(y1-y0)}));
  const path=coords.map((point,index)=>`${index===0?'M':'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const medianY=(y1-((result.median-low)/diff)*(y1-y0)).toFixed(2);
  const unit=escapeHTML(series.unit);
  chart.innerHTML=`<svg viewBox="0 0 620 216" role="img" aria-label="Historical ${escapeHTML(series.metricName)} timeline, ${result.count} saved readings in ${unit}, oldest to newest">
     <line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}" class="gridline"/><line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" class="gridline"/>
     <line x1="${x0}" x2="${x1}" y1="${medianY}" y2="${medianY}" stroke="#c09e5b" stroke-dasharray="5 5" stroke-width="1.2"/>
     <text x="1" y="${y0+4}">${fmt(high)}</text><text x="1" y="${y1+4}">${fmt(low)}</text>
     <path d="${path}" fill="none" stroke="#41d8bd" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
     ${coords.length===1?`<circle cx="${coords[0].x.toFixed(2)}" cy="${coords[0].y.toFixed(2)}" r="4" fill="#81f4dc"/>`:''}
     <text x="${x0}" y="204">Oldest saved</text><text x="${x1-88}" y="204">Newest saved</text></svg>
     <div class="history-chart-legend">Teal: recorded ${unit} · Dotted: median · Time-scaled; equal timestamps may overlap</div>`;
  const recent=selection.rows.slice(-12).reverse();
  details.innerHTML=`<details><summary>Show latest saved readings (${Math.min(selection.rows.length,12)} of ${selection.rows.length})</summary>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Saved time</th><th>Value</th><th>Session</th><th>Timestamp basis</th></tr></thead><tbody>${recent.map(row=>`<tr><td data-label="Saved time">${escapeHTML(stamp(row.observed_at))}</td><td data-label="Value">${fmt(row._value)} ${unit}</td><td data-label="Session">${escapeHTML(row.session_id ?? '—')}</td><td data-label="Time basis">${escapeHTML(row.timestamp_basis || 'Unspecified')}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function exportHistoryCsv() {
  const {engine,series,selection}=historySelection();
  const csv=engine?.historyCsv(series,selection,$('history-export-coordinates').checked);
  if (!csv) return;
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a'); link.href=url; link.download='openrf-signal-history.csv';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  flash(`Exported ${selection.rows.length} HISTORICAL readings. ${$('history-export-coordinates').checked?'Coordinates included by choice.':'Precise observer coordinates excluded.'} No upload performed.`);
}


// v0.2.17: comparisons operate on already-saved, historical observations only.
// Group by measurement units + recorded receiver/provenance rather than by name alone.
function renderComparison() {
  const engine = window.OpenRFHistoryAnalysis;
  const selector = $('compare-series');
  if (!engine) { $('comparison-result').textContent = 'Saved comparison engine unavailable. No analysis performed.'; return; }
  const seriesList = engine.makeSeries(state.observations, $('compare-include-demo').checked);
  const previous = selector.value;
  selector.replaceChildren();
  const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Choose a recorded signal'; selector.append(blank);
  for (const series of seriesList) {
    const option = document.createElement('option'); option.value = series.key;
    option.textContent = `${series.kind} · ${series.identifier} · ${series.metricName} (${series.unit}) · ${series.frequency_mhz ?? '?'} MHz · ${series.source} · ${series.source_device} (${series.rows.length})`;
    selector.append(option);
  }
  selector.value = seriesList.some(series=>series.key === previous) ? previous : '';
  for (const controlId of ['compare-before-session','compare-after-session']) {
    const control = $(controlId), prior = control.value;
    control.replaceChildren();
    const option = document.createElement('option'); option.value = ''; option.textContent = 'Choose an investigation'; control.append(option);
    for (const session of state.sessions) {
      const item = document.createElement('option'); item.value = String(session.id);
      item.textContent = `${session.name} (#${session.id})`;
      control.append(item);
    }
    control.value = state.sessions.some(session=>String(session.id) === prior) ? prior : '';
  }
  renderComparisonResult(seriesList);
}
function renderComparisonResult(seriesList = null) {
  const engine = window.OpenRFHistoryAnalysis;
  const mode = $('compare-mode').value;
  for (const field of document.querySelectorAll('.compare-session-field')) field.hidden = mode !== 'sessions';
  const series = (seriesList || engine?.makeSeries(state.observations, $('compare-include-demo').checked) || [])
    .find(item=>item.key === $('compare-series').value);
  const output = $('comparison-result'), exportButton = $('compare-export');
  if (!engine || !series) {
    exportButton.disabled = true;
    output.textContent = 'Choose a recorded measurement series. DEMO is excluded unless you explicitly enable it.';
    return;
  }
  const result = engine.compare(series, {mode, beforeSession:$('compare-before-session').value, afterSession:$('compare-after-session').value});
  exportButton.disabled = !!result.error;
  if (result.error) {
    output.textContent = result.error;
    return;
  }
  const n = value => Number(value).toFixed(1);
  const phaseLabel = mode === 'sessions' ? 'Baseline session' : 'Earlier saved readings';
  const followLabel = mode === 'sessions' ? 'Follow-up session' : 'Later saved readings';
  const group = (label, stats) => `<div class="comparison-metric"><div class="muted small">${label} · ${stats.count} saved</div><strong>${n(stats.median)} ${escapeHTML(series.unit)}</strong><div class="muted small">Range ${n(stats.min)} to ${n(stats.max)} · ${escapeHTML(stamp(stats.first))} → ${escapeHTML(stamp(stats.last))}</div></div>`;
  output.innerHTML = `<div class="comparison-metric-grid">${group(phaseLabel,result.baseline)}${group(followLabel,result.followup)}</div>
    <p class="comparison-delta"><strong>Median difference: ${result.delta >= 0 ? '+' : ''}${n(result.delta)} ${escapeHTML(series.unit)}</strong> · follow-up minus baseline (descriptive only)</p>
    <p class="small muted">${escapeHTML(series.kind)} · ${escapeHTML(series.identifier)} · ${escapeHTML(series.source)} · ${escapeHTML(series.source_device)}${series.hardware_id ? ` · Hardware ${escapeHTML(series.hardware_id)}` : ''} · ${series.frequency_mhz ?? '?'} MHz</p>
    <ul class="comparison-cautions">${result.warnings.map(warning=>`<li>${escapeHTML(warning)}</li>`).join('')}</ul>`;
}
function exportComparisonCsv() {
  const engine = window.OpenRFHistoryAnalysis;
  const series = engine.makeSeries(state.observations, $('compare-include-demo').checked)
    .find(item=>item.key === $('compare-series').value);
  const comparison = engine.compare(series, {mode:$('compare-mode').value,
    beforeSession:$('compare-before-session').value, afterSession:$('compare-after-session').value});
  if (comparison.error) return;
  const fields = ['phase','id','observed_at','kind','identifier','source','source_device','hardware_id','frequency_mhz','measurement_type','measurement_value','measurement_unit','latitude','longitude','accuracy_m','location_source','session_id','survey_capture_id','timestamp_basis','device_reported_at_utc'];
  const makeRow = (phase, obs) => {
    const record = {...obs, phase, measurement_type:series.metric, measurement_value:obs._value, measurement_unit:series.unit};
    return fields.map(field=>csvCell(record[field])).join(',');
  };
  const csv = '\uFEFF' + fields.join(',') + '\r\n' + [
    ...comparison.before.map(obs=>makeRow('BASELINE', obs)),
    ...comparison.after.map(obs=>makeRow('FOLLOWUP', obs))].join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = 'openrf-historical-comparison.csv';
  document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  flash('Exported historical comparison locally. No collection or upload performed.');
}

// MapLibre is preferred, but remote JavaScript or tiles can be blocked by VPNs,
// network rules, or browser extensions. This independent local raster/coordinate
// map needs no external JavaScript library and never requests OSM public tiles.
// A user-provided, licensed MBTiles raster basemap is optional.
function openrfMapStyleUrl() {
  return `/api/vector/styles/${state.style === 'light' ? 'light' : 'dark'}.json${state.mapVectorOffline ? '?offline=1' : ''}`;
}
async function refreshOpenRFVectorMapStatus() {
  try {
    state.vectorStatus=await api('/api/vector/status');
    const s=state.vectorStatus;
    $('map-vector-status').textContent=s.ready && s.fonts_ready ?
      `REGIONAL OFFLINE VECTOR READY · ${s.tile_count.toLocaleString()} local tiles · Amador / Calaveras · no tile network required. Coverage outside the region is blank.` :
      `Regional offline vector unavailable: ${s.error || 'Map or glyph resources missing'}. Online OpenRF styles remain selectable.`;
    if (!s.ready && state.mapVectorOffline) {
      state.mapVectorOffline=false;
      if(state.map) state.map.setStyle(openrfMapStyleUrl());
    }
  } catch(err) {$('map-vector-status').textContent=`Map assets status unavailable: ${err.message}`;}
  updateOpenRFVectorButtons();
}
function updateOpenRFVectorButtons(){
  $('map-vector-source').textContent=state.mapVectorOffline ? 'Use online vectors' : 'Use offline regional vectors';
  $('map-style').textContent=state.style==='dark' ? 'OpenRF Light' : 'OpenRF Dark';
}
function startMap() {
  if (state.map || state.rasterMap) return;
  if (!window.maplibregl) { const view = state.preferredView; state.preferredView = null; return startRasterMap('MapLibre is unavailable. Using the built-in raster/coordinate map.', view); }
  const attempt = ++state.mapAttempt;
  try {
    // Keep the overview visible while permission is requested; apply a later GPS fix via flyTo.
    const initial = state.preferredView || {center:[-98.5,39.8], zoom:2};
    state.preferredView = null;
    state.map = new maplibregl.Map({container:'map', style:openrfMapStyleUrl(), center:initial.center, zoom:initial.zoom, attributionControl:false, maplibreLogo:false});
    syncDestinationPickMode();
    state.map.addControl(new maplibregl.NavigationControl(), 'top-right');
    // Separate location control follows zoom/compass in the native MapLibre stack.
    state.map.addControl({
      onAdd() {
        const group = document.createElement('div');
        group.className = 'maplibregl-ctrl maplibregl-ctrl-group openrf-recenter-control';
        group.append(makeMapRecenterButton());
        this._element = group;
        return group;
      },
      onRemove() { this._element?.remove(); this._element = null; }
    }, 'top-right');
    state.map.on('style.load', () => { updateOfflineAttribution(); state.mapReady = true; $('map-error').hidden = true; installMarkerLayer(); updateMap(); updateBrowserLocationMarker(); applyPendingLocation(); renderAreaOverlay(); renderNavigationOverlay(); applyNavigationFit(); });
    state.map.on('movestart', event => { if (event.originalEvent) state.mapNavigationEpoch++; });
    state.map.on('move', () => {renderAreaOverlay(); renderNavigationOverlay();});
    state.map.on('click', (evt) => {
      if (consumeNavigationPick(evt.lngLat.lng, evt.lngLat.lat)) return;
      if (consumeAreaClick(evt.lngLat.lng, evt.lngLat.lat)) return;
      const clickableLayers = ['survey-points','survey-waypoints'].filter(id=>state.mapReady && state.map.getLayer(id));
      if (clickableLayers.length && state.map.queryRenderedFeatures(evt.point,{layers:clickableLayers}).length) return;
      if (state.browserLocation && Math.abs(evt.lngLat.lat-state.browserLocation.lat) < 0.0001 && Math.abs(evt.lngLat.lng-state.browserLocation.lon) < 0.0001) return;
      openObservation(evt.lngLat.lat.toFixed(6), evt.lngLat.lng.toFixed(6));
    });
    state.map.on('click', 'survey-points', (evt) => {
      if (state.navPicking || state.areaChoosing || !evt.features?.length) return;
      const p = evt.features[0].properties;
      new maplibregl.Popup().setLngLat(evt.lngLat).setHTML(`<strong>${escapeHTML(p.label)}</strong><br>${escapeHTML(p.kind)} · ${escapeHTML(p.source)}<br><small>Observation position only</small>`).addTo(state.map);
    });
    state.map.on('click', 'survey-waypoints', evt => {
      if (state.navPicking || !evt.features?.length) return;
      const w = evt.features[0].properties;
      new maplibregl.Popup().setLngLat(evt.lngLat).setHTML(`<strong>Survey waypoint #${escapeHTML(w.id)}</strong><br>Browser-reported observer position, not RF detection<br>${escapeHTML(w.note || '')}`).addTo(state.map);
    });
    state.map.on('error', evt => { if (evt.error && !state.mapReady) setTimeout(() => {
      if (attempt === state.mapAttempt && !state.mapReady && !state.rasterMap) switchToRasterMap('Vector style failed; showing raster map instead.');
    }, 500); });
    $('map-mode').textContent = 'Offline / raster';
    setTimeout(() => {
      if (attempt === state.mapAttempt && !state.mapReady && !state.rasterMap) switchToRasterMap('Vector map timed out; showing raster map instead.');
    }, 12000);
  } catch (error) {
    console.warn('MapLibre startup failed:', error);
    switchToRasterMap('Vector map startup failed; using built-in raster map.');
  }
}
function locationZoom(accuracyMeters) {
  if (!Number.isFinite(accuracyMeters)) return 12;
  return accuracyMeters <= 1000 ? 15 : accuracyMeters <= 5000 ? 13 : 11;
}
function updateBrowserLocationMarker() {
  if (!state.browserLocation) return;
  if (state.map && window.maplibregl?.Marker) {
    if (!state.geoMarker) {
      const marker = document.createElement('div'); marker.className = 'browser-location-marker';
      marker.setAttribute('role','img'); marker.setAttribute('aria-label','Browser-reported location (not a transmitter)');
      marker.title = 'Browser-reported device location; approximate, not a transmitter or saved survey point';
      state.geoMarker = new maplibregl.Marker({element:marker,anchor:'center'})
        .setLngLat([state.browserLocation.lon,state.browserLocation.lat]).addTo(state.map);
    } else state.geoMarker.setLngLat([state.browserLocation.lon,state.browserLocation.lat]);
  }
  state.rasterMap?.render();
}
function reduceMapMotion() {
  // Respect the operating system's reduced-motion accessibility preference.
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function applyPendingLocation() {
  const pending = state.pendingLocationView;
  if (!pending) return;
  // User gestures after a GPS request take precedence over automatic recentering.
  if (!pending.manual && pending.epoch !== state.mapNavigationEpoch) { state.pendingLocationView = null; return; }
  if (state.map && state.mapReady) {
    if (reduceMapMotion()) state.map.jumpTo({center:pending.center, zoom:pending.zoom});
    else state.map.flyTo({center:pending.center, zoom:pending.zoom,
      duration:2600, essential:false});
    state.pendingLocationView = null;
  } else if (state.rasterMap) {
    state.rasterMap.flyTo({center:pending.center, zoom:pending.zoom});
    state.pendingLocationView = null;
  }
  // When MapLibre has not finished loading, leave the pending fix untouched so
  // style.load can animate it from the overview rather than initializing there.
}

// The crosshair button is a manual convenience, not continuous GPS tracking.
// Reuse a recent browser fix immediately; otherwise ask for a new permissioned fix.
function recenterMapToBrowserLocation() {
  const loc = state.browserLocation;
  const age = loc ? Date.now() - loc.capturedAt : Infinity;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon) ||
      !Number.isFinite(age) || age < 0 || age > 60000) {
    locateMap(true);
    return;
  }
  state.mapNavigationEpoch++;
  state.pendingLocationView = {
    center:[loc.lon, loc.lat], zoom:locationZoom(loc.accuracy),
    epoch:state.mapNavigationEpoch, manual:true
  };
  applyPendingLocation();
  $('map-location-status').textContent = 'Recentered to recent browser-reported location; may be approximate. No location was saved.';
}
function makeMapRecenterButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'openrf-recenter-button';
  button.setAttribute('aria-label','Center map on my browser location');
  button.title = 'Center map on my location (request a fresh fix if needed)';
  // Crosshair location icon instead of another navigation-arrow icon.
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="2"/></svg>';
  button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    recenterMapToBrowserLocation();
  });
  return button;
}

function locateMap(manual = false) {
  if (!manual && state.autoLocateAttempted) return;
  state.autoLocateAttempted = true;
  const status = $('map-location-status');
  if (!navigator.geolocation) {
    status.textContent = 'Your browser does not offer geolocation. Use the map manually.';
    return;
  }
  const epoch = state.mapNavigationEpoch;
  status.textContent = 'Getting browser location (permission may be requested)…';
  navigator.geolocation.getCurrentPosition(pos => {
    const {latitude: lat, longitude: lon, accuracy} = pos.coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) {
      status.textContent = 'Browser returned invalid coordinates. Map remains available manually.'; return;
    }
    state.browserLocation = {lat, lon, accuracy, capturedAt: Date.now()};
    if (!state.navOriginManual) {
      $('nav-start-lat').value=lat.toFixed(7);
      $('nav-start-lon').value=lon.toFixed(7);
      $('nav-origin-status').textContent=`Starting position: browser-reported (±${Number.isFinite(accuracy) ? Math.round(accuracy) : 'unknown'} m). Approximate; adjust in Plan a trip if necessary.`;
    }
    updateBrowserLocationMarker();
    if (manual || epoch === state.mapNavigationEpoch) {
      state.pendingLocationView = {center:[lon,lat], zoom:locationZoom(accuracy), epoch, manual};
      applyPendingLocation();
    }
    const accuracyText = Number.isFinite(accuracy) ? `±${Math.round(accuracy)} m` : 'unknown accuracy';
    status.textContent = `Browser location: ${lat.toFixed(4)}, ${lon.toFixed(4)} (${accuracyText}). Not saved. Desktop/VPN locations can be approximate.`;
  }, err => {
    const detail = err.code === 1 ? 'permission denied' : err.code === 3 ? 'request timed out' : 'position unavailable';
    status.textContent = `Browser location ${detail}; the map remains usable. Try “My browser location” or enter survey coordinates manually.`;
  }, {timeout:15000, maximumAge:60000, enableHighAccuracy:false});
}
function visibleWaypoints() {
  if (!$('waypoint-show-map').checked) return [];
  const chosen = Number($('waypoint-session').value);
  return chosen ? state.waypoints.filter(p=>p.session_id === chosen) : [];
}
function renderWaypoints() {
  const selector = $('waypoint-session');
  const old = selector.value;
  const available = state.sessions;
  selector.innerHTML = `<option value="">Choose an investigation</option>` + available.map(session =>
    `<option value="${session.id}">${escapeHTML(session.name)} (#${session.id} · ${session.status})</option>`).join('');
  const active = available.find(s=>s.status === 'ACTIVE');
  const fallback = active || available[0];
  selector.value = available.some(s=>String(s.id)===old) ? old : String(fallback?.id || '');
  renderWaypointSelection();
}
function renderWaypointSelection() {
  const selected = Number($('waypoint-session').value);
  const matching = state.waypoints.filter(w=>w.session_id === selected);
  const session = state.sessions.find(s=>s.id===selected);
  $('waypoint-record').disabled = !session || session.status !== 'ACTIVE';
  $('waypoint-export').disabled = !session || matching.length === 0;
  const more = state.waypointsTruncated ? ' Some older waypoints are omitted from this view.' : '';
  $('waypoint-status').textContent = `${matching.length} saved, explicitly requested observer waypoint(s) for this investigation.${more} ${session?.status !== 'ACTIVE' ? 'Only an active investigation accepts new waypoints.' : 'Use Save to request one new browser position.'}`;
  $('waypoint-list').innerHTML = matching.length ? matching.slice(0,30).map(w=>`
    <div class="waypoint-row"><div><strong>${escapeHTML(w.note || 'Survey waypoint')} #${w.id}</strong>
    <p class="small muted">${escapeHTML(stamp(w.recorded_at_utc))} · Browser-reported ±${escapeHTML(Math.round(w.accuracy_m))} m · fix age ${escapeHTML(w.fix_age_seconds.toFixed(1))} s · observer only</p></div>
    <div class="button-line"><button type="button" class="btn mini outline" data-waypoint-view="${w.id}">View</button>
    <button type="button" class="btn mini danger-outline" data-waypoint-delete="${w.id}">Delete</button></div></div>`).join('') : '<div class="empty">No survey waypoints saved for this investigation. Nothing is tracked automatically.</div>';
  updateMap();
}
async function recordWaypoint() {
  const session = state.sessions.find(s=>String(s.id)===$('waypoint-session').value);
  if (!session || session.status !== 'ACTIVE') { $('waypoint-status').textContent='Start an active investigation first.';return; }
  if (!navigator.geolocation) { $('waypoint-status').textContent='Browser geolocation is unavailable.';return; }
  const button = $('waypoint-record');
  button.disabled = true;
  $('waypoint-status').textContent = 'Requesting a fresh browser location; nothing is saved until permission and validation succeed…';
  navigator.geolocation.getCurrentPosition(async pos=>{
    try {
      const age = (Date.now() - pos.timestamp) / 1000;
      if (!Number.isFinite(age) || age < 0 || age > 60) throw Error('Browser fix is stale; request a new location.');
      const {latitude, longitude, accuracy} = pos.coords;
      if (![latitude, longitude, accuracy].every(Number.isFinite)) throw Error('Browser did not report valid coordinates and accuracy.');
      const response = await api('/api/survey/waypoints','POST', {
        session_id:session.id, latitude, longitude, accuracy_m:accuracy,
        fix_age_seconds:age, fix_reported_at_utc:new Date(pos.timestamp).toISOString(),
        note:$('waypoint-note').value.trim()
      });
      $('waypoint-note').value='';
      await refresh();
      $('waypoint-status').textContent = `Waypoint #${response.waypoint.id} saved locally for investigation #${session.id}. Browser-reported, not verified GNSS or an RF detection.`;
    } catch(err) { $('waypoint-status').textContent = `Waypoint not saved: ${err.message}`; }
    finally { button.disabled = false; }
  }, err=>{
    $('waypoint-status').textContent = `Waypoint not saved: ${err.code===1?'location permission denied':err.code===3?'location timed out':'browser position unavailable'}.`;
    button.disabled=false;
  }, {enableHighAccuracy:true,maximumAge:0,timeout:15000});
}
function installMarkerLayer() {
  if (!state.map || state.map.getSource('survey-data')) return;
  state.map.addSource('survey-data', {type:'geojson',data:{type:'FeatureCollection',features:[]}});
  state.map.addLayer({id:'survey-points',type:'circle',source:'survey-data',paint:{
    'circle-color':['case',['==',['get','source'],'DEMO'],'#efa947',['match',['get','kind'],'WIFI','#53a9ff','BLE','#ae8cff','RF','#efaa53','CELLULAR','#f07b8d','INFRASTRUCTURE','#e9f0f1','#30dec0']],
    'circle-radius':8,'circle-stroke-color':'#09252c','circle-stroke-width':2,'circle-opacity':0.9
  }});
  state.map.addSource('survey-waypoint-data',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  state.map.addLayer({id:'survey-waypoints',type:'circle',source:'survey-waypoint-data',paint:{
    'circle-color':'#f6d37a','circle-radius':6,'circle-stroke-color':'#09252c',
    'circle-stroke-width':2,'circle-opacity':0.95
  }});
}
function updateMap() {
  if (state.rasterMap) return state.rasterMap.render();
  if (!state.mapReady || !state.map?.getSource('survey-data')) return;
  const observations = mapVisibleObservations();
  const features = observations.map(o => ({type:'Feature',geometry:{type:'Point',coordinates:[o.longitude,o.latitude]},properties:{id:o.id,label:o.label,kind:o.kind,source:o.source}}));
  state.map.getSource('survey-data').setData({type:'FeatureCollection',features});
  const wp = state.map.getSource('survey-waypoint-data');
  if (wp) wp.setData({type:'FeatureCollection',features:visibleWaypoints().map(w=>({
    type:'Feature',geometry:{type:'Point',coordinates:[w.longitude,w.latitude]},
    properties:{id:w.id,note:w.note,accuracy_m:w.accuracy_m,source:'BROWSER_REPORTED'}
  }))});
}
function switchToRasterMap(reason) {
  ++state.mapAttempt;
  // Preserve the current overview so a pending GPS fix animates in fallback too.
  const camera = state.map ? {center:[state.map.getCenter().lng,state.map.getCenter().lat], zoom:state.map.getZoom()} : state.preferredView;
  if (state.geoMarker) { try {state.geoMarker.remove();} catch(_) {} state.geoMarker = null; }
  if (state.map) { try { state.map.remove(); } catch(_) { /* partially initialized */ } }
  state.map = null;
  state.mapReady = false;
  startRasterMap(reason, camera);
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
function startRasterMap(reason, view = null) {
  if (state.rasterMap) return;
  $('map-error').hidden = true;
  const root = $('map');
  root.classList.add('raster-mode');
  root.classList.toggle('raster-dark', state.style === 'dark');
  const surface = document.createElement('div'); surface.className = 'raster-surface';
  const tiles = document.createElement('div'); tiles.className = 'raster-tiles';
  const pins = document.createElement('div'); pins.className = 'raster-pins';
  const notice = document.createElement('div'); notice.className = 'raster-notice';
  notice.textContent = `${reason} ${state.offlineMap ? `Local raster package: ${state.offlineMap.name}. Tiles outside its coverage remain blank.` : 'Coordinate grid only. Install a licensed MBTiles raster package for offline streets.'}`;
  const controls = document.createElement('div'); controls.className = 'raster-control';
  const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.title = 'Zoom in';
  const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.title = 'Zoom out';
  const recenter = makeMapRecenterButton();
  recenter.classList.add('raster-recenter');
  controls.append(plus, minus, recenter); surface.append(tiles, pins);
  root.replaceChildren(surface, notice, controls);
  let flightFrame = null;
  const raster = {center:view?.center || [-98.5,39.8], zoom:Math.max(2,Math.min(18,Math.round(view?.zoom || 2))), tileNodes:new Map(), failedTiles:new Set(),
    render() {
      notice.textContent = `${reason} ${state.offlineMap ? `Local raster package: ${state.offlineMap.name}. Tiles outside its coverage remain blank.` : 'Coordinate grid only. Install a licensed MBTiles raster package for offline streets.'}`;
      const width = root.clientWidth, height = root.clientHeight;
      if (!width || !height) return;
      const center = worldPixel(raster.center[0], raster.center[1], raster.zoom);
      const size = 256 * 2 ** raster.zoom;
      const left = center[0] - width/2, top = center[1] - height/2;
      const startX = Math.floor(left/256), endX = Math.floor((left + width)/256);
      const startY = Math.floor(top/256), endY = Math.floor((top + height)/256);
      // Read only local MBTiles over the loopback API. Overzoom scales the
      // nearest available package level; do not reach for a remote tile server.
      const pack = state.offlineMap;
      const tileZoom = pack ? Math.min(raster.zoom, pack.maxzoom) : -1;
      const canShowTiles = pack && tileZoom >= pack.minzoom && raster.zoom - tileZoom <= 4;
      const factor = canShowTiles ? 2 ** (raster.zoom - tileZoom) : 1;
      const tileSize = 256 * factor;
      const tileCount = canShowTiles ? 2 ** tileZoom : 0;
      const visible = new Set();
      if (canShowTiles) {
        const firstX = Math.floor(left / tileSize), lastX = Math.floor((left + width) / tileSize);
        const firstY = Math.floor(top / tileSize), lastY = Math.floor((top + height) / tileSize);
        for (let ty = Math.max(0,firstY); ty <= Math.min(tileCount-1,lastY); ty++) {
          for (let tx=firstX; tx<=lastX; tx++) {
            const wrapped = ((tx % tileCount) + tileCount) % tileCount;
            const key = `${pack.id}/${tileZoom}/${wrapped}/${ty}`;
            if (raster.failedTiles.has(key)) continue;
            visible.add(key);
            let image = raster.tileNodes.get(key);
            if (!image) {
              image = document.createElement('img');
              image.alt = ''; image.setAttribute('aria-hidden', 'true');
              image.loading = 'lazy';
              image.addEventListener('error', () => {
                raster.failedTiles.add(key); raster.tileNodes.delete(key); image.remove();
              });
              image.src = `/api/maps/${encodeURIComponent(pack.id)}/tiles/${tileZoom}/${wrapped}/${ty}.png`;
              raster.tileNodes.set(key, image); tiles.append(image);
            }
            image.style.width = `${tileSize}px`; image.style.height = `${tileSize}px`;
            image.style.left = `${tx * tileSize-left}px`; image.style.top = `${ty * tileSize-top}px`;
          }
        }
      }
      for (const [key,image] of raster.tileNodes) {
        if (!visible.has(key)) { image.remove(); raster.tileNodes.delete(key); }
      }
      const nextPins = document.createDocumentFragment();
      mapVisibleObservations().forEach(o=>{
        const position = worldPixel(o.longitude, o.latitude, raster.zoom);
        const dx = ((position[0] - center[0] + size * 1.5) % size) - size/2;
        const dy = position[1] - center[1];
        if (Math.abs(dx) > width/2 + 15 || Math.abs(dy) > height/2 + 15) return;
        const pin = document.createElement('button'); pin.type = 'button';
        pin.className = `raster-pin kind-${o.kind.toLowerCase()}${o.source === 'DEMO' ? ' demo' : ''}`;
        pin.style.left = `${width/2+dx}px`; pin.style.top = `${height/2+dy}px`;
        pin.title = `${o.label} (${o.kind}, ${o.source}) — observer position`;
        pin.addEventListener('click',e=>{e.stopPropagation(); flash(`${o.label} — ${o.kind} · ${o.source} · OBSERVATION LOCATION, not transmitter location.`);});
        nextPins.append(pin);
      });
      visibleWaypoints().forEach(w=>{
        const position = worldPixel(w.longitude,w.latitude,raster.zoom);
        const dx = ((position[0]-center[0]+size*1.5)%size)-size/2;
        const dy = position[1]-center[1];
        if (Math.abs(dx)>width/2+15 || Math.abs(dy)>height/2+15) return;
        const pin = document.createElement('div'); pin.className='raster-waypoint-pin';
        pin.style.left=`${width/2+dx}px`; pin.style.top=`${height/2+dy}px`;
        pin.title=`Browser-reported survey waypoint #${w.id}; observer position, not RF detection`;
        nextPins.append(pin);
      });
      if (state.browserLocation) {
        const p = worldPixel(state.browserLocation.lon,state.browserLocation.lat,raster.zoom);
        const dx = ((p[0]-center[0]+size*1.5)%size)-size/2;
        const dy = p[1]-center[1];
        if (Math.abs(dx)<=width/2+15 && Math.abs(dy)<=height/2+15) {
          const marker=document.createElement('div'); marker.className='browser-location-marker raster-location';
          marker.style.left=`${width/2+dx}px`; marker.style.top=`${height/2+dy}px`;
          marker.title='Browser-reported location (not a transmitter or survey observation)';
          nextPins.append(marker);
        }
      }
      pins.replaceChildren(nextPins);
      renderAreaOverlay();
      renderNavigationOverlay();
    },
    stop() {
      if (flightFrame !== null) cancelAnimationFrame(flightFrame);
      flightFrame = null;
    },
    flyTo({center, zoom}) {
      raster.stop();
      const endZoom = Number.isFinite(zoom) ? Math.max(2,Math.min(18,Math.round(zoom))) : raster.zoom;
      const start = [...raster.center], startZoom = raster.zoom;
      if (reduceMapMotion()) { raster.center = [...center]; raster.zoom = endZoom; raster.render(); return; }
      const startTime = performance.now(), duration = 2600;
      // Choose the shorter longitudinal path across the antimeridian. Fractional
      // raster zoom would produce invalid tile coordinates, so use integer steps.
      const deltaLon = ((center[0] - start[0] + 540) % 360) - 180;
      const tick = now => {
        if (state.rasterMap !== raster) { raster.stop(); return; }
        const t = Math.max(0, Math.min(1, (now - startTime) / duration));
        const ease = t * t * (3 - 2 * t);
        raster.center = [((start[0] + deltaLon * ease + 540) % 360) - 180,
          start[1] + (center[1] - start[1]) * ease];
        raster.zoom = Math.max(2,Math.min(18,Math.round(startZoom + (endZoom - startZoom) * ease)));
        raster.render();
        if (t < 1) flightFrame = requestAnimationFrame(tick);
        else { raster.center = [...center]; raster.zoom = endZoom; raster.render(); flightFrame = null; }
      };
      flightFrame = requestAnimationFrame(tick);
    },
    resize() { raster.render(); }
  };
  state.rasterMap = raster;
  syncDestinationPickMode();
  updateOfflineAttribution();
  applyPendingLocation();
  $('map-mode').textContent = 'Try online vector';
  plus.addEventListener('click',e=>{e.stopPropagation();raster.stop();state.mapNavigationEpoch++;raster.zoom=Math.min(18,raster.zoom+1);raster.render();});
  minus.addEventListener('click',e=>{e.stopPropagation();raster.stop();state.mapNavigationEpoch++;raster.zoom=Math.max(2,raster.zoom-1);raster.render();});
  if (!root.dataset.rasterBound) {
    root.dataset.rasterBound = 'true';
    let start = null;
    root.addEventListener('pointerdown',e=>{
      if (!state.rasterMap || state.navPicking || e.button !== 0 || e.target.closest('button, a')) return;
      state.rasterMap.stop();
      start = {x:e.clientX,y:e.clientY,center:[...state.rasterMap.center], moved:false};
      root.setPointerCapture(e.pointerId);
    });
    root.addEventListener('pointermove',e=>{
      if (!start || !state.rasterMap) return;
      const dx=e.clientX-start.x, dy=e.clientY-start.y;
      if (Math.abs(dx)+Math.abs(dy)>6) start.moved=true;
      if (start.moved) {
        state.mapNavigationEpoch++;
        const from=worldPixel(start.center[0],start.center[1],state.rasterMap.zoom);
        state.rasterMap.center=pixelWorld(from[0]-dx,from[1]-dy,state.rasterMap.zoom);
        state.rasterMap.render();
      }
    });
    root.addEventListener('pointerup',e=>{
      if (!start || !state.rasterMap) return;
      const previous=start; start=null;
      if (state.navPicking) return;
      if (previous.moved) return;
      const rect=root.getBoundingClientRect();
      const cp=worldPixel(state.rasterMap.center[0],state.rasterMap.center[1],state.rasterMap.zoom);
      const ll=pixelWorld(cp[0]+e.clientX-rect.left-rect.width/2, cp[1]+e.clientY-rect.top-rect.height/2,state.rasterMap.zoom);
      if (consumeNavigationPick(ll[0], ll[1])) return;
      if (consumeAreaClick(ll[0], ll[1])) return;
      openObservation(ll[1].toFixed(6), ll[0].toFixed(6));
    });
    root.addEventListener('pointercancel',()=>{start=null;});
    root.addEventListener('wheel',e=>{
      if (!state.rasterMap) return;
      e.preventDefault(); state.rasterMap.stop(); state.mapNavigationEpoch++; state.rasterMap.zoom=Math.max(2,Math.min(18,state.rasterMap.zoom+(e.deltaY<0?1:-1)));
      state.rasterMap.render();
    },{passive:false});
  }
  raster.render();
  applyNavigationFit();
}
function zoomToRecord(id) {
  const item = state.observations.find(o=>o.id===id); if (!item || item.latitude === null) return;
  showPage('map', {autoLocate:false}); setTimeout(()=> (state.map || state.rasterMap)?.flyTo({center:[item.longitude,item.latitude],zoom:15}),100);
}

async function runAction(fn, fallback='Could not complete operation') {
  try { await fn(); } catch(err) { flash(err.message || fallback, true); }
}

function updateOfflineAttribution() {
  const local = $('offline-map-attribution');
  const online = $('online-map-credits');
  const offlineActive = !!state.rasterMap || !!state.mapVectorOffline;
  const text = state.mapVectorOffline && !state.rasterMap ?
      'Regional OpenRF vector map: © OpenStreetMap contributors · Geofabrik · OpenMapTiles-style schema. Local Amador / Calaveras coverage only.' : state.offlineMap
    ? `Local package: ${state.offlineMap.name}. ${state.offlineMap.attribution || 'Attribution not specified in package; verify source license.'}`
    : 'Offline coordinate grid: no basemap data.';
  local.hidden = !offlineActive;
  local.textContent = text;
  online.hidden = offlineActive;
}
// Offline map files are operator-supplied and live outside the Git repository.
// Selecting one never causes internet downloads or saves a GPS position.
async function refreshOfflineMaps() {
  const response = await api('/api/maps');
  state.offlineMaps = response.maps || [];
  if (state.offlineMap) state.offlineMap = state.offlineMaps.find(m => m.id === state.offlineMap.id) || null;
  const select = $('offline-map-select');
  const currentId = state.offlineMap?.id || '';
  select.replaceChildren(new Option('Coordinate grid · no map package', ''));
  for (const pack of state.offlineMaps) {
    select.add(new Option(`${pack.name} (z${pack.minzoom}–${pack.maxzoom})`, pack.id));
  }
  select.value = currentId;
  updateOfflineAttribution();
  $('offline-map-status').textContent = state.offlineMap
    ? `LOCAL · ${state.offlineMap.name} · ${(state.offlineMap.size_bytes / 1048576).toFixed(1)} MB · no network required`
    : `${state.offlineMaps.length} local raster package(s). Grid and survey pins work offline; online streets need internet.`;
  renderOfflineAreaDetail();
  refreshAreaBuildSources();
  if (state.rasterMap) state.rasterMap.render();
}
$('offline-map-refresh').addEventListener('click', () => runAction(refreshOfflineMaps));
$('offline-map-select').addEventListener('change', event => {
  state.offlineMap = state.offlineMaps.find(m => m.id === event.target.value) || null;
  updateOfflineAttribution();
  $('offline-map-status').textContent = state.offlineMap
    ? `LOCAL · ${state.offlineMap.name} · Offline raster tiles; outside coverage shows coordinate grid.`
    : 'Local coordinate grid selected. No external raster tile requests.';
  renderOfflineAreaDetail();
  if (state.rasterMap) {
    for (const image of state.rasterMap.tileNodes.values()) image.remove();
    state.rasterMap.tileNodes.clear(); state.rasterMap.failedTiles.clear();
    const camera = {center:[...state.rasterMap.center], zoom:state.rasterMap.zoom};
    state.rasterMap.stop();
    state.rasterMap = null;
    $('map').replaceChildren();
    startRasterMap('Offline map selection changed.', camera);
  } else if (state.map) switchToRasterMap('Offline map selected.');
  else startRasterMap('Offline map selected.');
});



// v0.2.11: user-planned bounding boxes. These are geographic selection aids,
// never RF measurement positions, and no external tile API is contacted.
function draftNumbers() {
  const coords = ['west','south','east','north'].map(k => Number($(`area-plan-${k}`).value));
  if (coords.some((v,i) => !$(`area-plan-${['west','south','east','north'][i]}`).value.trim() || !Number.isFinite(v))) return null;
  const [w,s,e,n] = coords;
  if (!(w >= -180 && w < e && e <= 180 && s >= -85.05112878 && s < n && n <= 85.05112878)) return null;
  return coords;
}
function areaFormBounds(bounds) {
  state.areaDraftBounds = bounds;
  ['west','south','east','north'].forEach((key,i) => { $(`area-plan-${key}`).value = bounds[i].toFixed(6); });
  updateAreaEstimate();
  renderAreaOverlay();
}
function updateAreaEstimate() {
  const bounds = draftNumbers();
  state.areaDraftBounds = bounds;
  const lo = Number($('area-plan-minzoom').value), hi = Number($('area-plan-maxzoom').value);
  if (!bounds || !Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi > 18 || lo > hi) {
    $('area-plan-estimate').textContent = 'Enter valid non-dateline-crossing bounds and zooms (0–18, min ≤ max).';
    renderAreaOverlay(); return;
  }
  let count = 0;
  const [w,s,e,n] = bounds;
  const tileY=(lat,z)=> (1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*(2**z);
  for (let z=lo;z<=hi;z++) {
    const edge=2**z;
    const x0=Math.max(0,Math.min(edge-1,Math.floor((w+180)/360*edge)));
    const x1=Math.max(0,Math.min(edge-1,Math.ceil((e+180)/360*edge-1e-12)-1));
    const y0=Math.max(0,Math.min(edge-1,Math.floor(tileY(n,z))));
    const y1=Math.max(0,Math.min(edge-1,Math.ceil(tileY(s,z)-1e-12)-1));
    count+=(x1-x0+1)*(y1-y0+1);
    if(count>10000) break;
  }
  $('area-plan-estimate').textContent = count > 10000
    ? 'More than 10,000 tile slots. Narrow the bounds or decrease maximum zoom.'
    : `Up to ${count.toLocaleString()} candidate tiles at zoom ${lo}–${hi}. This is NOT a download or a size/coverage guarantee.`;
  renderAreaOverlay();
}
function areaModeStatus(message) {
  $('area-plan-selection-status').textContent = message;
  $('area-plan-cancel').disabled = !state.areaChoosing;
  $('map').classList.toggle('area-selecting', state.areaChoosing);
  renderAreaOverlay();
}
function cancelAreaChoosing() {
  state.areaChoosing = false;
  state.areaFirstCorner = null;
  areaModeStatus('Area selection stopped; coordinate fields remain editable.');
}
function consumeAreaClick(lon, lat) {
  if (!state.areaChoosing) return false;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return true;
  lon=((lon+180)%360+360)%360-180;
  lat=Math.min(85.05112878,Math.max(-85.05112878,lat));
  if (!state.areaFirstCorner) {
    state.areaFirstCorner=[lon,lat];
    areaModeStatus('First corner chosen. Click the opposite corner; pan and zoom if needed.');
    return true;
  }
  const first=state.areaFirstCorner;
  const w=Math.min(first[0],lon), e=Math.max(first[0],lon);
  const s=Math.min(first[1],lat), n=Math.max(first[1],lat);
  state.areaChoosing=false; state.areaFirstCorner=null;
  if (e-w <= 1e-8 || n-s <= 1e-8 || e-w>180) {
    areaModeStatus('Area is too narrow or crosses the dateline. Try a smaller rectangle.');
    return true;
  }
  areaFormBounds([w,s,e,n]);
  areaModeStatus('Two corners selected. Set your zoom range, enter a name, then save the plan.');
  $('map-area-manager').open=true;
  return true;
}
function areaViewportBounds() {
  if(state.map) {
    const b=state.map.getBounds();
    return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
  }
  if(state.rasterMap) {
    const root=$('map'), m=state.rasterMap, center=worldPixel(m.center[0],m.center[1],m.zoom);
    const west=pixelWorld(center[0]-root.clientWidth/2,center[1],m.zoom)[0];
    const east=pixelWorld(center[0]+root.clientWidth/2,center[1],m.zoom)[0];
    const north=pixelWorld(center[0],center[1]-root.clientHeight/2,m.zoom)[1];
    const south=pixelWorld(center[0],center[1]+root.clientHeight/2,m.zoom)[1];
    return [west,south,east,north];
  }
  return null;
}
function renderAreaOverlay() {
  const root=$('map');
  if (!root || (!state.map && !state.rasterMap)) return;
  let overlay=root.querySelector('.area-draw-overlay');
  if(!overlay) {
    overlay=document.createElement('div'); overlay.className='area-draw-overlay';
    overlay.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:2;overflow:hidden';
    root.append(overlay);
  }
  overlay.replaceChildren();
  function project(lon,lat) {
    if(state.map) return state.map.project([lon,lat]);
    const r=state.rasterMap, center=worldPixel(r.center[0],r.center[1],r.zoom);
    const point=worldPixel(lon,lat,r.zoom), size=256*2**r.zoom;
    const dx=((point[0]-center[0]+size*1.5)%size)-size/2;
    return {x:root.clientWidth/2+dx, y:root.clientHeight/2+point[1]-center[1]};
  }
  if (state.areaDraftBounds) {
    const [w,s,e,n]=state.areaDraftBounds;
    const a=project(w,n),b=project(e,s);
    if ([a.x,a.y,b.x,b.y].every(Number.isFinite)) {
      const rect=document.createElement('div');rect.className='area-preview-outline';
      rect.style.left=`${Math.min(a.x,b.x)}px`;rect.style.top=`${Math.min(a.y,b.y)}px`;
      rect.style.width=`${Math.abs(b.x-a.x)}px`;rect.style.height=`${Math.abs(b.y-a.y)}px`;
      overlay.append(rect);
    }
  }
  if (state.areaFirstCorner) {
    const pt=project(...state.areaFirstCorner), dot=document.createElement('div');
    dot.className='area-preview-corner';dot.style.left=`${pt.x}px`;dot.style.top=`${pt.y}px`;overlay.append(dot);
  }
  if (state.areaChoosing) {
    const note=document.createElement('div');note.className='area-map-instruction';
    note.textContent=state.areaFirstCorner?'AREA SELECTION · Choose opposite corner':'AREA SELECTION · Choose first corner';
    note.style.cssText='position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#07362ff2;color:#d5fff4;border:1px solid #54d1b7;border-radius:6px;padding:7px 10px;font-weight:700;font-size:12px;max-width:65%;text-align:center;';
    overlay.append(note);
  }
}
function focusAreaBounds(bounds) {
  const [w,s,e,n] = bounds;
  state.mapNavigationEpoch++;
  if(state.map && state.mapReady) state.map.fitBounds([[w,s],[e,n]],{padding:50,maxZoom:16,duration:450});
  else {
    if (!state.rasterMap) switchToRasterMap('Viewing saved local area plan.');
    const root=$('map'),width=Math.max(240,root.clientWidth),height=Math.max(200,root.clientHeight);
    let zoom=2;
    for(let z=2;z<=18;z++) {
      const nw=worldPixel(w,n,z),se=worldPixel(e,s,z);
      if(se[0]-nw[0]>width*.78 || se[1]-nw[1]>height*.78) break;
      zoom=z;
    }
    state.rasterMap?.flyTo({center:[(w+e)/2,(s+n)/2],zoom});
  }
}
function refreshAreaBuildSources() {
  const el=$('area-build-source');const current=el.value;
  el.replaceChildren(new Option('Choose an installed source map', ''));
  state.offlineMaps.forEach(m=>el.add(new Option(`${m.name} (${m.id})`,m.id)));
  el.value=state.offlineMaps.some(m=>m.id===current) ? current : '';
}
function renderSavedArea() {
  const p=state.selectedArea;
  $('area-saved-view').disabled=!p;
  $('area-saved-remove').disabled=!p;
  $('area-build').disabled=!p;
  $('area-zip-import').disabled=!p;
  const tilePlanLink=$('area-saved-tile-plan');
  const exportLink=$('area-saved-export');
  if(p) {
    tilePlanLink.href=`/api/maps/areas/${p.id}.plan.json`;
    tilePlanLink.setAttribute('aria-disabled','false');tilePlanLink.removeAttribute('tabindex');
    exportLink.href=`/api/maps/areas/${p.id}.geojson`;
    exportLink.setAttribute('aria-disabled','false');exportLink.removeAttribute('tabindex');
    $('area-saved-detail').textContent=`${p.name}: ${p.bounds.map(v=>v.toFixed(4)).join(', ')} · zoom ${p.minzoom}–${p.maxzoom} · up to ${p.candidate_tiles.toLocaleString()} tile slots (not guaranteed data).`;
  } else {
    tilePlanLink.removeAttribute('href');tilePlanLink.setAttribute('aria-disabled','true');tilePlanLink.tabIndex=-1;
    exportLink.removeAttribute('href');exportLink.setAttribute('aria-disabled','true');exportLink.tabIndex=-1;
    $('area-saved-detail').textContent='No saved plan selected; existing map packages are unaffected.';
  }
}
async function refreshAreaPlans(selectId=null) {
  const response=await api('/api/maps/areas');
  state.areaPlans=response.areas || [];
  const choose=selectId || state.selectedArea?.id || '';
  const el=$('area-saved-select');el.replaceChildren(new Option('Select a saved area', ''));
  state.areaPlans.forEach(a=>el.add(new Option(`${a.name} (z${a.minzoom}–${a.maxzoom})`,a.id)));
  state.selectedArea=state.areaPlans.find(a=>a.id===choose)||null;
  el.value=state.selectedArea?.id||'';
  renderSavedArea();
}
$('area-plan-choose').addEventListener('click',()=>{
  if (!state.map && !state.rasterMap) startMap();
  if (state.navPicking) {state.navPicking=false;syncDestinationPickMode();}
  state.areaChoosing=true;state.areaFirstCorner=null;
  areaModeStatus('Click two opposite corners on the map. Map clicks will NOT create observations until selection ends.');
  $('map').scrollIntoView({block:'center',behavior:'smooth'});
});
$('area-plan-cancel').addEventListener('click',cancelAreaChoosing);
$('area-plan-viewport').addEventListener('click',()=>{
  try {
    cancelAreaChoosing();
    const bounds=areaViewportBounds();
    if (!bounds || bounds.some(v=>!Number.isFinite(v))) throw Error('Map has not loaded yet.');
    const [w,s,e,n]=bounds;
    if (!(w>=-180 && w<e && e<=180 && s>=-85.05112878 && s<n && n<=85.05112878)) throw Error('Viewport crosses the dateline or map limits. Zoom in and try again.');
    areaFormBounds(bounds);areaModeStatus('Used visible map extent; choose zooms and a name to save.');
  } catch(err) {flash(err.message,true);}
});
for(const k of ['west','south','east','north','minzoom','maxzoom']) $('area-plan-'+k).addEventListener('input',updateAreaEstimate);
$('area-plan-save').addEventListener('click',()=>runAction(async()=>{
  const bounds=draftNumbers();if (!bounds) throw Error('Enter valid west/south/east/north bounds first.');
  const name=$('area-plan-name').value.trim();
  const minzoom=Number($('area-plan-minzoom').value),maxzoom=Number($('area-plan-maxzoom').value);
  const response=await api('/api/maps/areas','POST',{name,bounds,minzoom,maxzoom});
  await refreshAreaPlans(response.area.id);
  $('area-plan-selection-status').textContent=`Saved ${response.area.name} locally. No tiles downloaded.`;
  flash('Saved geographic map plan locally; no map download or RF observation was made.');
}));
$('area-saved-select').addEventListener('change',event=>{
  state.selectedArea=state.areaPlans.find(a=>a.id===event.target.value)||null;
  if(state.selectedArea) {
    const p=state.selectedArea;areaFormBounds(p.bounds);
    $('area-plan-minzoom').value=p.minzoom;$('area-plan-maxzoom').value=p.maxzoom;$('area-plan-name').value=p.name;
    updateAreaEstimate();
    $('area-build-name').value=p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||`region-${p.id}`;
    $('area-zip-map-id').value=($('area-build-name').value+'-tiles').slice(0,100);
  }
  renderSavedArea();
});
$('area-saved-view').addEventListener('click',()=>{
  if(state.selectedArea) {areaFormBounds(state.selectedArea.bounds);focusAreaBounds(state.selectedArea.bounds);}
});
$('area-saved-remove').addEventListener('click',()=>runAction(async()=>{
  const p=state.selectedArea;
  if(!p||!confirm(`Delete the saved area plan "${p.name}"? Installed maps and saved observations will not be deleted.`))return;
  await api(`/api/maps/areas/${p.id}`,'DELETE');
  state.selectedArea=null;await refreshAreaPlans();
  $('area-build-status').textContent='Saved area plan deleted. Map packages were not changed.';
}));
$('area-build').addEventListener('click',()=>runAction(async()=>{
  const plan=state.selectedArea,source=$('area-build-source').value,dest=$('area-build-name').value.trim();
  if(!plan) throw Error('Select a saved area.');
  if(!source) throw Error('Choose a locally installed raster source map.');
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(dest)||dest.endsWith('.')) throw Error('Use a safe new package filename without .mbtiles.');
  if(!$('area-license-confirm').checked) throw Error('You must confirm that the source license permits local derivatives.');
  if(!confirm(`Create ${dest}.mbtiles from local source ${source} for ${plan.name}? Only existing local tiles are copied. This will not contact a public map service.`))return;
  const button=$('area-build');button.disabled=true;
  $('area-build-status').textContent='Creating bounded local MBTiles subset; leave OpenRF open. No network downloads.';
  try {
    const result=await api(`/api/maps/areas/${plan.id}/build`,'POST',{
      source_map_id:source,output_map_id:dest,rights_confirmed:true
    });
    await refreshOfflineMaps();
    $('offline-map-select').value=result.map.id;
    $('offline-map-select').dispatchEvent(new Event('change'));
    $('area-build-status').textContent=`Created ${dest}.mbtiles locally: ${result.tiles_copied} existing tile(s), ${(result.map.size_bytes/1048576).toFixed(1)} MiB. Missing source tiles remain missing. Source and observations preserved.`;
    flash(`Offline subset ${dest}.mbtiles created with ${result.tiles_copied} local tiles.`);
  } catch(err) { $('area-build-status').textContent=`Local subset failed: ${err.message}. No source map modified.`;throw err; }
  finally{ button.disabled=!state.selectedArea; }
}));
// Licensed local ZIP → MBTiles conversion. Browser-selected file only, and the
// request goes to OpenRF on loopback. A plan JSON contains no tile source URL.
$('area-zip-import').addEventListener('click',()=>runAction(async()=>{
  const plan=state.selectedArea;
  const file=$('area-zip-file').files?.[0];
  const mapId=$('area-zip-map-id').value.trim();
  const source=$('area-zip-source').value.trim();
  const credit=$('area-zip-attribution').value.trim();
  const scheme=$('area-zip-scheme').value;
  if(!plan) throw Error('Select a saved map area first.');
  if(!file || !file.name.toLowerCase().endsWith('.zip')) throw Error('Select a raster tile ZIP from your computer.');
  if(file.size < 100 || file.size > 512*1024*1024) throw Error('ZIP must be between 100 bytes and 512 MiB.');
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(mapId)||mapId.endsWith('.')) throw Error('Choose a safe output name without .mbtiles.');
  if(!source || !credit) throw Error('Provide the original tile source and its required attribution.');
  if(!$('area-zip-rights').checked) throw Error('Confirm the provider explicitly allows offline map package creation.');
  if(!confirm(`Create ${mapId}.mbtiles locally from ${file.name} for area ${plan.name}? No tile servers will be contacted.`))return;
  const button=$('area-zip-import');button.disabled=true;
  $('area-zip-status').textContent='Reading the local ZIP, validating tiles and building a private raster MBTiles package. Keep this tab open.';
  try {
    const response=await fetch(`/api/maps/areas/${plan.id}/import-xyz`,{
      method:'POST',headers:{'Content-Type':'application/zip','X-OpenRF-Map-Id':mapId,
        'X-OpenRF-Source-Name':encodeURIComponent(source),
        'X-OpenRF-Attribution':encodeURIComponent(credit),
        'X-OpenRF-Tile-Scheme':scheme,'X-OpenRF-Rights-Confirmed':'true'},body:file
    });
    const data=await response.json();
    if(!response.ok) throw Error(data.error||`ZIP import failed (HTTP ${response.status})`);
    await refreshOfflineMaps();
    $('offline-map-select').value=data.map.id;
    $('offline-map-select').dispatchEvent(new Event('change'));
    $('area-zip-status').textContent=`Installed ${data.map.id}.mbtiles with ${data.tiles_imported.toLocaleString()} local tile(s). ${data.tiles_ignored.toLocaleString()} tiles outside the plan were skipped. Actual coverage may be incomplete. Source ZIP and observations preserved.`;
    flash(`Imported licensed raster ZIP to ${data.map.id}.mbtiles. Verify map attribution and actual coverage.`);
  } catch(error) {
    $('area-zip-status').textContent=`Import failed: ${error.message}. Original ZIP and saved observations remain untouched.`;
    throw error;
  } finally { button.disabled=!state.selectedArea; }
}));

window.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.areaChoosing)cancelAreaChoosing();});

function renderOfflineAreaDetail() {
  const pack = state.offlineMap;
  const detail = $('offline-map-detail');
  $('offline-map-zoom').disabled = !pack?.bounds;
  $('offline-map-remove').disabled = !pack;
  if (!pack) {
    detail.textContent = 'No area selected. Import a licensed raster MBTiles package, or choose a map from Offline basemap. Observations remain saved even when a basemap is removed.';
    return;
  }
  const bounds = pack.bounds;
  const coverage = bounds
    ? `Coverage: west ${bounds[0].toFixed(4)}°, south ${bounds[1].toFixed(4)}°, east ${bounds[2].toFixed(4)}°, north ${bounds[3].toFixed(4)}° (declared package bounds; actual tile coverage may vary).`
    : 'Coverage: not declared in this package. Area zoom is unavailable.';
  detail.textContent = `${pack.name} · ${pack.id}.mbtiles\n${coverage}\nZoom: ${pack.minzoom}–${pack.maxzoom}; image: ${pack.format.toUpperCase()}; size: ${(pack.size_bytes/1048576).toFixed(1)} MiB.\nAttribution: ${pack.attribution || 'Not supplied — check the map data license.'}`;
}

function zoomToOfflineArea(pack) {
  if (!pack?.bounds) return;
  const [west, south, east, north] = pack.bounds;
  const center = [(west+east)/2, (south+north)/2];
  const root = $('map');
  const width = Math.max(240, root.clientWidth || 400), height = Math.max(200, root.clientHeight || 300);
  let zoom = 2;
  for (let z = 2; z <= 18; z++) {
    const tl = worldPixel(west, north, z), br = worldPixel(east, south, z);
    if (br[0]-tl[0] > width*0.8 || br[1]-tl[1] > height*0.8) break;
    zoom = z;
  }
  zoom = Math.max(2, Math.min(18, Math.max(pack.minzoom, zoom)));
  state.mapNavigationEpoch++;
  if (!state.rasterMap) switchToRasterMap('Viewing selected local map coverage.');
  state.rasterMap?.flyTo({center, zoom});
  $('offline-map-operation').textContent = `Centered on ${pack.name}; bounds are declared by the package, not independently verified.`;
}

$('offline-map-zoom').addEventListener('click', () => zoomToOfflineArea(state.offlineMap));
$('offline-map-remove').addEventListener('click', () => runAction(async () => {
  const pack = state.offlineMap;
  if (!pack || !confirm(`Remove the local map file ${pack.id}.mbtiles? Survey observations and investigations will be preserved.`)) return;
  const button = $('offline-map-remove'); button.disabled = true;
  try {
    await api(`/api/maps/${encodeURIComponent(pack.id)}`, 'DELETE');
    state.offlineMap = null;
    await refreshOfflineMaps();
    if (state.rasterMap) {
      for (const image of state.rasterMap.tileNodes.values()) image.remove();
      state.rasterMap.tileNodes.clear(); state.rasterMap.failedTiles.clear();
      state.rasterMap.render();
    }
    $('offline-map-operation').textContent = 'Map file removed. Survey records and investigations were not modified.';
  } finally { renderOfflineAreaDetail(); }
}));

$('offline-map-import').addEventListener('click', () => runAction(async () => {
  const file = $('offline-map-file').files?.[0];
  if (!file) throw Error('Choose a local .mbtiles file first.');
  const match = /^([A-Za-z0-9][A-Za-z0-9_.-]{0,127})\.mbtiles$/i.exec(file.name);
  if (!match || match[1].endsWith('.')) throw Error('Rename the file with ASCII letters, digits, dashes, dots or underscores, ending in .mbtiles.');
  if (file.size < 100 || file.size > 1073741824) throw Error('File must be between 100 bytes and 1 GiB.');
  const button = $('offline-map-import'); button.disabled = true;
  $('offline-map-operation').textContent = `Importing ${file.name} (${(file.size/1048576).toFixed(1)} MiB). Keep this page open; no public tile service is contacted.`;
  try {
    const response = await fetch('/api/maps/import', {
      method: 'POST', headers: {'Content-Type':'application/octet-stream', 'X-OpenRF-Map-Id':match[1]}, body: file
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || `Import failed (${response.status})`);
    await refreshOfflineMaps();
    $('offline-map-select').value = result.map.id;
    $('offline-map-select').dispatchEvent(new Event('change'));
    $('offline-map-file').value = '';
    $('offline-map-operation').textContent = `Imported ${result.map.name} (${(result.map.size_bytes/1048576).toFixed(1)} MiB) into private local storage.`;
  } catch (err) {
    $('offline-map-operation').textContent = `Import failed: ${err.message}. The previous maps were preserved.`;
    throw err;
  } finally { button.disabled = false; }
}));

// Keep the top-right map tools below the overlaid search controls.
function updateNavOverlayLayout(){
  const el=document.querySelector('.map-destination-panel'), map=$('map');
  if(!el||!map)return;
  const bottom=el.offsetTop+el.offsetHeight+8;
  map.parentElement.style.setProperty('--openrf-nav-overlay-bottom',`${Math.round(bottom)}px`);
}
const mapNavPanel=document.querySelector('.map-destination-panel');
if(typeof ResizeObserver!=='undefined') new ResizeObserver(updateNavOverlayLayout).observe(mapNavPanel);
window.addEventListener('resize',updateNavOverlayLayout);
updateNavOverlayLayout();
// v0.2.23: saved destinations and a map preview. NO road routing / police alerts.
const navGeometry = window.OpenRFNavigation;
function navigationInputPoint(prefix) {
  if (!navGeometry) throw Error('Navigation geometry module unavailable. Refresh OpenRF.');
  return navGeometry.point($(`${prefix}-lat`).value, $(`${prefix}-lon`).value);
}
const navAddressCache=new Map();
function setNavigationStatus(message) { $('nav-status').textContent=message; }
function setMapDestinationStatus(message, kind = '') {
  const el=$('map-destination-status');
  el.hidden=false;el.textContent=message;
  updateNavOverlayLayout();
  el.classList.toggle('map-route-error',kind==='error');
  el.classList.toggle('map-route-success',kind==='success');
}
let addressProviderInfo = null;
async function refreshAddressProviderStatus() {
  const result=await api('/api/navigation/geocoding/status');
  addressProviderInfo=result;
  const label=result.local_photon ? 'Local Photon' :
    (result.maptiler_configured ? 'MapTiler configured' : 'Public Photon (best effort)');
  $('map-provider-summary').textContent=`· ${label}`;
  $('map-provider-status').textContent=result.local_photon ?
    'Local Photon is configured. Address queries stay on this device.' :
    result.maptiler_configured ?
      `MapTiler key stored in ${result.credential_source==='environment'?'the server environment':'private Ubuntu configuration'}. Enable online search above to send typed addresses. The key is never shown here.` :
      'No MapTiler key saved. Public Photon is available as a best-effort option, but may be unreachable or rate-limited. Save a MapTiler key for dedicated autocomplete.';
  return result;
}
refreshAddressProviderStatus().catch(err=>{$('map-provider-status').textContent=`Could not read provider settings: ${err.message}`;});
$('map-save-provider').addEventListener('click',async()=>{
  const key=$('map-maptiler-key').value.trim();
  if(!key){$('map-provider-status').textContent='Enter a MapTiler API key first (or choose Remove saved key).';return;}
  const button=$('map-save-provider');button.disabled=true;
  try{
    await api('/api/navigation/geocoding/config','POST',{maptiler_key:key});
    $('map-maptiler-key').value='';
    await refreshAddressProviderStatus();
    $('map-provider-status').textContent+=' Key saved locally. Check Online U.S. address search, then type your destination.';
    if($('map-online-address').checked) $('map-destination-query').dispatchEvent(new Event('input'));
  }catch(err){$('map-provider-status').textContent=`Could not save key: ${err.message}`;}
  finally{button.disabled=false;}
});
$('map-remove-provider').addEventListener('click',async()=>{
  const button=$('map-remove-provider');button.disabled=true;
  try{
    await api('/api/navigation/geocoding/config','POST',{maptiler_key:''});
    $('map-maptiler-key').value='';
    await refreshAddressProviderStatus();
    if(addressProviderInfo?.credential_source==='environment')
      $('map-provider-status').textContent='A MapTiler key is still set through OPENRF_MAPTILER_KEY in Ubuntu; remove that environment variable to disable it.';
  }catch(err){$('map-provider-status').textContent=err.message;}
  finally{button.disabled=false;}
});
$('map-test-provider').addEventListener('click',async()=>{
  if(!$('map-online-address').checked && !addressProviderInfo?.local_photon){
    $('map-provider-status').textContent='Enable Online U.S. address search above to test an external provider.';return;
  }
  const button=$('map-test-provider');button.disabled=true;
  $('map-provider-status').textContent='Testing a sample U.S. place name (not your current address or GPS)…';
  try{
    const results=await api(addressLookupUrl('Pioneer, California'));
    $('map-provider-status').textContent=results.results?.length ?
      `${results.provider} responded with ${results.results.length} U.S. suggestion(s). Try typing a destination.` :
      `${results.provider} responded, but found no U.S. suggestions for the test query.`;
  }catch(err){$('map-provider-status').textContent=`Search test failed: ${err.message}`;}
  finally{button.disabled=false;}
});
function addressLookupUrl(q, final = false, autocomplete = false) {
  // Public Photon is contacted only after an explicit unchecked-by-default opt-in.
  const online=$('map-online-address').checked ? '&online=1' : '';
  return `/api/navigation/geocode?q=${encodeURIComponent(q)}${online}${final ? '&mode=final' : (autocomplete ? '&mode=auto' : '')}`;
}
// Local saved places and typed coordinates are resolved without network access.
// Text address suggestions query only configured local Photon or an EXPLICIT opt-in
// MapTiler provider; never send browser location automatically to the geocoder.
function findLocalDestination(query, destinations) {
  const value=String(query||'').trim();
  if (!value) throw Error('Enter a saved destination name or latitude, longitude.');
  const pair=value.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
  if (pair) {
    const coords=navGeometry.point(pair[1],pair[2]);
    return {name:value,coordinates:coords};
  }
  const exact=destinations.find(d=>d.name.trim().toLowerCase()===value.toLowerCase());
  const matching=exact ? [exact] : destinations.filter(d=>d.name.trim().toLowerCase().startsWith(value.toLowerCase()));
  if (matching.length===1) {
    const d=matching[0];
    return {name:d.name,coordinates:navGeometry.point(d.latitude,d.longitude)};
  }
  if (matching.length>1) throw Error('Several saved destinations match. Select a full name from the suggestions.');
  throw Error('This is an address, not a saved place or coordinates. Configure address search or choose a map point.');
}
function locationForQuickPreview() {
  const pos=state.browserLocation;
  if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lon) &&
      Date.now()-pos.capturedAt<=60000 && Date.now()-pos.capturedAt>=-5000 &&
      Number.isFinite(pos.accuracy) && pos.accuracy>=0) return [pos.lon,pos.lat];
  throw Error('No recent browser position. Allow browser location on Map, or set a starting point under Plan a trip.');
}
async function resolveTypedPlace(query) {
  const value=String(query||'').trim();
  const chosen=state.navSelectedAddress;
  if (chosen && chosen.name===value) return chosen;
  if (navAddressCache.has(value)) return navAddressCache.get(value);
  try { return findLocalDestination(value,state.navDestinations); }
  catch (error) {
    if (!/This is an address/.test(error.message)) throw error;
    const reply=await api(addressLookupUrl(value, true));
    if (!reply.results?.length) throw Error('No U.S. address matches. Try house number, street, city and state; or choose a map point.');
    // Never use a guessed first result. Offer choices and require an explicit selection.
    if ($('map-destination-query').value.trim()===value) {
      state.navSearchCredit=reply.attribution||reply.provider||'';
      showMapAddressMatches((reply.results||[]).map(d=>({name:d.name,coordinates:[d.longitude,d.latitude],source:d.source,accuracy_note:d.accuracy_note}))); 
    } else {
      for (const input of document.querySelectorAll('#nav-start-query,#nav-dest-query,.nav-stop-query')) {
        if (input.value.trim()===value) input.dispatchEvent(new Event('input'));
      }
    }
    throw Error('Select the matching address from the suggestions, then press Start navigation again. Census address pins may be approximate.');
  }
}
function setNavigationRoutePreview(result) {
  stopNavigationFollow();
  $('map-begin-guidance').disabled=!(result?.type==='ROAD_ROUTE' && result.is_driving_route===true);
  state.navPreview=result;
  state.navFitPending=true;
  applyNavigationFit();
  setTimeout(applyNavigationFit,120);
  renderNavigationOverlay();
}
async function planRoadRoute(points) {
  setMapDestinationStatus('Getting directions from local Valhalla…');
  try {
    const data=await api('/api/navigation/route','POST',{
      locations:points.map(p=>({latitude:p[1],longitude:p[0]}))});
    const road=data.route;
    if (!road || road.type!=='ROAD_ROUTE' || road.is_driving_route!==true) throw Error('No verified road route returned.');
    setNavigationRoutePreview(road);
    const steps=(road.maneuvers||[]).slice(0,80);
    $('nav-directions').innerHTML=steps.length ? '<h4>Planned turns · no active guidance</h4><ol>'+
      steps.map(step=>`<li>${escapeHTML(step.instruction)}</li>`).join('')+'</ol>' : '';
    const minutes=Math.round(road.duration_seconds/60);
    return {road, text:`LOCAL ROAD DIRECTIONS · ${road.distance_miles} mi · approximately ${minutes} min (no live traffic). Start navigation for GPS follow-view beta; no spoken instructions or automatic rerouting.`};
  } catch (err) {
    const first=points[0], last=points[points.length-1];
    $('nav-directions').replaceChildren();
    const direct=navGeometry.preview(first,last);
    if(direct.distance_km>150){
      // A national road route cannot be inferred from the small installed
      // Northern California Valhalla graph. Show an error, never an interstate
      // line that a driver could mistake for a suggested route.
      stopNavigationFollow();
      state.navPreview=null;state.navFitPending=false;
      $('map-begin-guidance').disabled=true;
      renderNavigationOverlay();
      return {road:null,text:`No drivable road route for this destination: ${err.message} The installed local road graph may cover only Northern California. Add regional/nationwide Valhalla data before routing across the U.S.; no route was drawn.`};
    }
    // Short-distance geographic reference only, never driveable guidance.
    direct.coordinates=points;
    direct.stops=points.slice(1,-1);
    setNavigationRoutePreview(direct);
    return {road:null,text:`Road routing unavailable: ${err.message} Direct-line reference only — do not drive along this line.`};
  }
}
async function freshNavigationOrigin() {
  if (state.navOriginManual) return navigationInputPoint('nav-start');
  try { return locationForQuickPreview(); }
  catch (error) {
    if (!navigator.geolocation) throw error;
  }
  setMapDestinationStatus('Getting a fresh browser position for the starting point…');
  const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,
    {enableHighAccuracy:true,maximumAge:0,timeout:15000})).catch(err=>{
      throw Error(`Could not get starting location (${err.code===1?'permission denied':err.code===3?'timed out':'position unavailable'}). Check browser permissions or set an origin in Plan a trip.`);
    });
  const {latitude,longitude,accuracy}=position.coords||{};
  const age=(Date.now()-position.timestamp)/1000;
  if (!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||
      !Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(age)||age< -5||age>60) {
    throw Error('New browser position was invalid or stale. Choose a starting point in Plan a trip.');
  }
  state.browserLocation={lat:latitude,lon:longitude,accuracy,capturedAt:Date.now()};
  updateBrowserLocationMarker();
  return [longitude,latitude];
}
async function quickDestinationPreview(query) {
  const chosen=await resolveTypedPlace(query);
  const origin=await freshNavigationOrigin();
  $('nav-dest-name').value=chosen.name;
  $('nav-dest-query').value=chosen.name;
  $('nav-dest-lat').value=chosen.coordinates[1];
  $('nav-dest-lon').value=chosen.coordinates[0];
  const planned=await planRoadRoute([origin,chosen.coordinates]);
  state.navPickedPoint=chosen.coordinates.slice(); // Also draggable for resolved street addresses and completed road routes.
  renderNavigationOverlay();
  setMapDestinationStatus(`${chosen.name} · ${planned.text}`, planned.road ? 'success' : 'error');
  $('nav-preview-summary').textContent=planned.text;
  if(planned.road) setNavigationStatus(planned.text);
  return planned;
}
// Address autocomplete never uses the public Nominatim service.
// Clicking a result stores its exact coordinates; typing anything new invalidates it.
function hideMapAddressMatches() {
  const box=$('map-address-options');
  box.hidden=true;box.replaceChildren();
  $('map-destination-query').setAttribute('aria-expanded','false');
  $('map-destination-query').removeAttribute('aria-activedescendant');
}
function showMapAddressMatches(matches) {
  const box=$('map-address-options');
  box.replaceChildren();
  const seen=new Set();
  for(const match of matches) {
    if(box.querySelectorAll('.address-option').length>=8) break;
    if(!match || !match.name || (!match.streetCompletion && !Array.isArray(match.coordinates))) continue;
    const key=`${match.name.toLowerCase()}|${match.streetCompletion || match.coordinates.join(',')}`;
    if(seen.has(key)) continue;
    seen.add(key);
    const button=document.createElement('button');button.type='button';
    button.className='address-option';button.setAttribute('role','option');
    button.id=`map-address-option-${box.querySelectorAll('.address-option').length}`;
    button.setAttribute('aria-selected','false');
    button.textContent=match.name;
    button.addEventListener('click',()=>{
      // A suggestion represents a specific pinned location. Never silently
      // route to the first fuzzy candidate.
      state.navSearchToken++;
      if(navAddressTimer) clearTimeout(navAddressTimer);
      if (match.streetCompletion) {
        // A local street-name hint is NOT a geocoded street address. Only
        // populate the text, never bind a navigation coordinate to it.
        state.navSelectedAddress=null;
        $('map-destination-query').value=match.streetCompletion+', ';
        hideMapAddressMatches();
        $('map-destination-query').focus();
        setMapDestinationStatus('Regional street name completed from offline map data. The house number is NOT verified. Finish city and state, then select a real address match before routing.');
        return;
      }
      state.navSelectedAddress=match;
      navAddressCache.set(match.name,match);
      $('map-destination-query').value=match.name;
      hideMapAddressMatches();
      setMapDestinationStatus(match.source==='us-census-opt-in' ?
        'Approximate Census address-range location selected. Check the map pin and press Start navigation.' :
        'Destination selected. Press Start navigation to calculate a road route.');
    });
    box.append(button);
  }
  if(box.querySelector('.address-option') && state.navSearchCredit){
    const credit=document.createElement('div');
    credit.className='address-attribution';
    credit.textContent=`Search source: ${state.navSearchCredit}`;
    box.append(credit);
  }
  box.hidden=!box.querySelector('.address-option');
  $('map-destination-query').setAttribute('aria-expanded',String(!box.hidden));
}
function navigationSuggestionDelay(provider, query) {
  // Public Photon is best effort and rate-limited. Dedicated/local providers
  // can respond more quickly. Census only matches complete U.S. addresses.
  if(provider?.local_photon || provider?.maptiler_configured) return 450;
  return /^\d{1,8}[A-Za-z]?\s+[^,]+,\s*[^,]+,\s*[A-Za-z]{2}/.test(query) ? 850 : 1450;
}
function navigationLookupIsComplete(query) {
  // Do not trigger Census for a house number or partial city. This is only a
  // client-side hint; the backend validates again before contacting Census.
  const parts=query.split(',').map(x=>x.trim());
  return parts.length>=3 && /^\d{1,8}[A-Za-z]?\s+\S+/.test(parts[0]) &&
    parts[1].length>=2 && /^[A-Za-z]{2}(?:\s+\d{0,5})?$/.test(parts[2]);
}
let navAddressTimer=null;
$('map-destination-query').addEventListener('input',()=>{
  if(state.navPreview){
    stopNavigationFollow();state.navPreview=null;state.navFitPending=false;state.navPickedPoint=null;
    $('map-begin-guidance').disabled=true;renderNavigationOverlay();
  }
  if (state.navPickedPoint) {state.navPickedPoint=null;renderNavigationOverlay();}
  state.navSelectedAddress=null;
  state.navSearchCredit='';state.navStreetMatches=[];
  const q=$('map-destination-query').value.trim(), token=++state.navSearchToken;
  hideMapAddressMatches();
  if(navAddressTimer) clearTimeout(navAddressTimer);
  if(q.length<3) return;
  // Saved destinations are available immediately, even offline or when
  // an external geocoder is broken. Address lookup itself is debounced.
  const local=state.navDestinations.filter(d=>d.name.toLowerCase().includes(q.toLowerCase())).slice(0,5)
    .map(d=>({name:d.name,coordinates:[d.longitude,d.latitude]}));
  if(local.length) showMapAddressMatches(local);
  // Network-free street-name hints come from the actual bundled regional
  // OSM vector tiles. They help finish typing but NEVER provide an address
  // point or validate a house number.
  if (/^\d{3,8}[A-Za-z]?\s+[A-Za-z]{2,}/.test(q) && !q.includes(',')) {
    setTimeout(async()=>{
      try {
        const reply=await api(`/api/vector/streets?q=${encodeURIComponent(q)}`);
        if(token!==state.navSearchToken || $('map-destination-query').value.trim()!==q) return;
        const names=(reply.results||[]).map(r=>({name:r.label,streetCompletion:r.completion,source:'local-street-name-only'}));
        if(names.length){
          state.navStreetMatches=names;
          showMapAddressMatches([...local,...names]);
          setMapDestinationStatus('Local street-name suggestions available. House numbers are not verified; finish city/state to locate the actual address.');
        }
      } catch(e) { /* Optional local index must never block remote geocoding. */ }
    },240);
  }
  const consent=$('map-online-address').checked;
  const localPhoton=addressProviderInfo?.local_photon;
  if(!consent && !localPhoton) return;
  // Without a dedicated typeahead provider, don't hammer public Photon with
  // unfinished house-number strings. Census can match only after city/state.
  if(!localPhoton && !addressProviderInfo?.maptiler_configured && /^\d{1,8}[A-Za-z]?\s/.test(q) &&
     !navigationLookupIsComplete(q)) {
    if(!local.length && !state.navStreetMatches?.length) setMapDestinationStatus('Finish the street, city and state (for example: 25005 State Hwy 88, Pioneer, CA) for an automatic Census match. Earlier suggestions need MapTiler or local Photon.');
    return;
  }
  if(!local.length && navigationLookupIsComplete(q) && !addressProviderInfo?.maptiler_configured && !localPhoton) {
    setMapDestinationStatus('Checking the completed U.S. street address automatically (Census address-range lookup)…');
  }
  navAddressTimer=setTimeout(async()=>{
    try {
      // mode=auto permits an explicitly consented Census match for complete
      // addresses BEFORE Start navigation. It never submits partial text to Census.
      const reply=await api(addressLookupUrl(q,false,true));
      if(token!==state.navSearchToken || $('map-destination-query').value.trim()!==q) return;
      state.navSearchCredit=reply.attribution||reply.provider||'';
      const remote=(reply.results||[]).map(d=>({name:d.name,coordinates:[d.longitude,d.latitude],source:d.source,accuracy_note:d.accuracy_note}));
      showMapAddressMatches([...local,...(state.navStreetMatches||[]),...remote]);
      if(remote.length) {
        setMapDestinationStatus(`${remote.length} U.S. suggestion(s). Select the correct address, then Start navigation.`);
      } else if(!local.length && navigationLookupIsComplete(q)) {
        setMapDestinationStatus('No address match yet. Check house number, street, city and state, or choose a map point.');
      }
    } catch(error) {
      if(token!==state.navSearchToken || $('map-destination-query').value.trim()!==q) return;
      if(local.length) return;
      const completed=navigationLookupIsComplete(q);
      setMapDestinationStatus(completed ?
        `Automatic address lookup is unavailable: ${error.message} Try Start navigation for a final Census lookup, or choose a point on the map.` :
        `${error.message} For partial street-address suggestions, configure MapTiler or local Photon in Address search setup.`, 'error');
    }
  }, navigationSuggestionDelay(addressProviderInfo,q));
});
$('map-destination-query').addEventListener('keydown',event=>{
  const box=$('map-address-options');
  if(box.hidden) return;
  const buttons=[...box.querySelectorAll('.address-option')];
  if(!buttons.length) return;
  let index=buttons.findIndex(b=>b.getAttribute('aria-selected')==='true');
  if(event.key==='ArrowDown' || event.key==='ArrowUp') {
    event.preventDefault();
    index=event.key==='ArrowDown' ? (index+1)%buttons.length : (index<=0 ? buttons.length-1 : index-1);
    buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===index)));
    $('map-destination-query').setAttribute('aria-activedescendant',buttons[index].id);
    buttons[index].scrollIntoView?.({block:'nearest'});
  } else if(event.key==='Enter') {
    event.preventDefault();
    buttons[index>=0?index:0].click();
  } else if(event.key==='Escape') {
    event.preventDefault(); hideMapAddressMatches();
  }
});
$('map-destination-query').addEventListener('blur',()=>setTimeout(hideMapAddressMatches,175));
$('map-destination-query').addEventListener('focus',()=>{
  const q=$('map-destination-query').value.trim();
  if(q.length>=3 && !state.navSelectedAddress) $('map-destination-query').dispatchEvent(new Event('input'));
});
$('map-online-address').addEventListener('change',()=>{
  // Explicit user choice is scoped to this page only, never persisted across reloads.
  state.navSearchToken++;
  if(navAddressTimer) clearTimeout(navAddressTimer);
  hideMapAddressMatches();
  const enabled=$('map-online-address').checked;
  const named=addressProviderInfo?.maptiler_configured ? 'MapTiler' : 'the public Photon demo';
  setMapDestinationStatus(enabled ?
    `Online U.S. search enabled using ${named}. Address text leaves this device; GPS isn't sent. Select a suggestion before starting.` :
    'Online address lookup off. Saved places, coordinates, and choosing a map point still work.');
  if ($('map-destination-query').value.trim().length>=3) $('map-destination-query').dispatchEvent(new Event('input'));
});


// Reuse the same opt-in address provider for trip start, stops, and destination.
function wireTripAddressField(input) {
  const parent=input.parentElement;
  parent.classList.add('nav-address-host');
  const options=document.createElement('div');
  options.className='address-suggestions nav-trip-suggestions';
  options.hidden=true;options.setAttribute('role','listbox');
  parent.append(options);
  let timer=null, requestIndex=0;
  input.addEventListener('input',()=>{
    const text=input.value.trim(), id=++requestIndex;
    options.hidden=true; options.replaceChildren();
    if(timer) clearTimeout(timer);
    if(text.length<3) return;
    timer=setTimeout(async()=>{
      const local=state.navDestinations.filter(d=>d.name.toLowerCase().includes(text.toLowerCase())).slice(0,5)
        .map(d=>({name:d.name,coordinates:[d.longitude,d.latitude]}));
      let fromGeocoder=[];
      if($('map-online-address').checked || addressProviderInfo?.local_photon) {
        try {
          const response=await api(addressLookupUrl(text,false,true));
          fromGeocoder=(response.results||[]).map(d=>({name:d.name,coordinates:[d.longitude,d.latitude]}));
        } catch(error) {
          if(id===requestIndex && !local.length) setNavigationStatus(error.message);
        }
      }
      if(id!==requestIndex) return;
      for(const match of [...local,...fromGeocoder].slice(0,7)) {
        const btn=document.createElement('button');
        btn.type='button';btn.className='address-option';btn.setAttribute('role','option');
        btn.textContent=match.name;
        btn.addEventListener('click',()=>{
          input.value=match.name;
          navAddressCache.set(match.name,match);
          options.hidden=true;options.replaceChildren();
          if(input.id==='nav-start-query') state.navOriginManual=true;
        });
        options.append(btn);
      }
      options.hidden=!options.children.length;
    },navigationSuggestionDelay(addressProviderInfo,text));
  });
  input.addEventListener('blur',()=>setTimeout(()=>{options.hidden=true;},180));
}
for(const id of ['nav-start-query','nav-dest-query']) wireTripAddressField($(id));

// v0.2.30: explicit one-tap map destination selection. Normal map panning
// resumes after one accepted tap; MapLibre and raster fallback share the same
// screen-to-coordinate conversion, independent of the browser GPS marker.
function syncDestinationPickMode() {
  $('map').classList.toggle('destination-picking', state.navPicking);
  for (const id of ['nav-pick-map','map-pick-destination']) {
    $(id).setAttribute('aria-pressed', String(state.navPicking));
  }
  const map=state.map;
  if (state.navPicking && map?.dragPan && state.navPickPanRestore?.map !== map) {
    state.navPickPanRestore={map, pan:!!map.dragPan.isEnabled()};
    map.dragPan.disable();
  } else if (!state.navPicking && state.navPickPanRestore) {
    const restore=state.navPickPanRestore;
    state.navPickPanRestore=null;
    if (restore.map===map && restore.pan) map.dragPan.enable();
  }
}
function handleDestinationMapClick(event) {
  if (!state.navPicking || (event.button !== undefined && event.button !== 0)) return;
  // The controls, copyright disclosure and other map UI remain functional.
  if (event.target.closest?.('.map-destination-panel,.map-follow-hud,.maplibregl-ctrl,.raster-control,.map-credits,.map-error,.raster-notice')) return;
  const root=$('map'), rect=root.getBoundingClientRect();
  const x=event.clientX-rect.left, y=event.clientY-rect.top;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x<0 || y<0 || x>rect.width || y>rect.height) return;
  let lon, lat;
  if (state.map && state.mapReady) {
    const pos=state.map.unproject([x,y]);lon=pos.lng;lat=pos.lat;
  } else if (state.rasterMap) {
    const center=worldPixel(state.rasterMap.center[0],state.rasterMap.center[1],state.rasterMap.zoom);
    [lon,lat]=pixelWorld(center[0]+x-rect.width/2,center[1]+y-rect.height/2,state.rasterMap.zoom);
  } else return;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon)>180 || Math.abs(lat)>90) return;
  // Capture even taps on the blue GPS dot or survey pins: they must never
  // substitute the observer position or trigger a popup / observation here.
  event.preventDefault();event.stopImmediatePropagation();
  consumeNavigationPick(lon,lat);
}
$('map').addEventListener('click',handleDestinationMapClick,true);
window.addEventListener('keydown',event=>{
  if (event.key==='Escape' && state.navPicking) {
    event.preventDefault();state.navPicking=false;syncDestinationPickMode();
    renderNavigationOverlay();setMapDestinationStatus('Map destination selection cancelled.');
  }
});

function consumeNavigationPick(lon,lat) {
  if (!state.navPicking) return false;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon)>180 || Math.abs(lat)>90) return false;
  state.navPicking = false;
  state.navPickedPoint = [lon,lat];
  syncDestinationPickMode();
  $('nav-dest-lat').value = lat.toFixed(7);
  $('nav-dest-lon').value = lon.toFixed(7);
  $('map-destination-query').value = `${lat.toFixed(7)}, ${lon.toFixed(7)}`;
  $('nav-dest-query').value=$('map-destination-query').value;
  state.navSelectedAddress=null;
  setMapDestinationStatus('Destination placed. Drag the red pin to fine-tune, then choose Get directions.');
  setNavigationStatus('Map selection filled destination coordinates. Get directions requests local Valhalla road routing when available.');
  renderNavigationOverlay();
  return true;
}
// Tap once to drop a destination, then drag its pin to fine-tune without
// entering selection mode or disabling ordinary map panning. Drag changes a
// destination only: no observation, waypoint, or GPS trail is recorded.
function destinationWorldPoint(clientX,clientY) {
  const rect=$('map').getBoundingClientRect();
  const x=clientX-rect.left,y=clientY-rect.top;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x<0 || y<0 || x>rect.width || y>rect.height) return null;
  if (state.map && state.mapReady) {
    const lnglat=state.map.unproject([x,y]);return [lnglat.lng,lnglat.lat];
  }
  if (state.rasterMap) {
    const center=worldPixel(state.rasterMap.center[0],state.rasterMap.center[1],state.rasterMap.zoom);
    return pixelWorld(center[0]+x-rect.width/2,center[1]+y-rect.height/2,state.rasterMap.zoom);
  }
  return null;
}
function updateDraggedDestination(clientX,clientY){
  const point=destinationWorldPoint(clientX,clientY);
  if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0])>180 || Math.abs(point[1])>90) return false;
  stopNavigationFollow();
  state.navPickedPoint=point;
  state.navPreview=null;state.navFitPending=false;
  $('map-begin-guidance').disabled=true;
  state.navSelectedAddress=null;
  $('map-destination-query').value=`${point[1].toFixed(7)}, ${point[0].toFixed(7)}`;
  $('nav-dest-query').value=$('map-destination-query').value;
  $('nav-dest-lat').value=point[1].toFixed(7);
  $('nav-dest-lon').value=point[0].toFixed(7);
  hideMapAddressMatches();
  renderNavigationOverlay();
  return true;
}
const destinationDragOverlay=$('navigation-preview-overlay');
destinationDragOverlay.addEventListener('pointerdown',event=>{
  if (!state.navPickedPoint || !event.target.closest?.('.nav-draggable-pin')) return;
  if(event.pointerType==='mouse' && event.button!==0) return;
  event.preventDefault();event.stopPropagation();
  state.navPinDragging=true;
  destinationDragOverlay.setPointerCapture?.(event.pointerId);
});
destinationDragOverlay.addEventListener('pointermove',event=>{
  if (!state.navPinDragging) return;
  event.preventDefault();event.stopPropagation();
  updateDraggedDestination(event.clientX,event.clientY);
});
function finishDestinationDrag(event){
  if (!state.navPinDragging) return;
  event.preventDefault();event.stopPropagation();state.navPinDragging=false;
  state.navPinJustDraggedAt=Date.now();
  if(destinationDragOverlay.hasPointerCapture?.(event.pointerId)) destinationDragOverlay.releasePointerCapture(event.pointerId);
  setMapDestinationStatus('Destination pin adjusted. Press Get directions to recalculate the road route.');
}
destinationDragOverlay.addEventListener('pointerup',finishDestinationDrag);
destinationDragOverlay.addEventListener('pointercancel',finishDestinationDrag);
destinationDragOverlay.addEventListener('click',event=>{
  if(event.target.closest?.('.nav-draggable-pin')){event.stopPropagation();event.preventDefault();}
});
$('map').addEventListener('click',event=>{
  if(Date.now()-state.navPinJustDraggedAt<450){event.preventDefault();event.stopImmediatePropagation();}
},true);
// SVG is generated from calculated numbers only; no user text or HTML is inserted.
function destinationPinSVG(x,y){
  return `<g class="nav-draggable-pin" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" aria-label="Drag destination pin to adjust location">`+
    `<circle r="25" fill="#ef4444" opacity=".15"/>`+
    `<circle r="10" fill="#ee454b" stroke="#fff" stroke-width="3"/>`+
    `<circle r="28" fill="transparent" class="nav-drag-target"/>`+
    `</g>`;
}
function renderNavigationOverlay() {
  const overlay = $('navigation-preview-overlay');
  const label = $('navigation-preview-label');
  if (state.navPicking) {
    overlay.replaceChildren();
    label.textContent='TAP MAP TO CHOOSE DESTINATION'; label.hidden=false;
    return;
  }
  const preview = state.navPreview;
  const picked = state.navPickedPoint;
  if ((!preview && !picked) || (!state.mapReady && !state.rasterMap)) {
    overlay.replaceChildren(); label.hidden=true; return;
  }
  const map=$('map'), width=map.clientWidth, height=map.clientHeight;
  if (!width || !height) return;
  function project(coords) {
    if (state.map && state.mapReady) {
      const pt=state.map.project(coords);
      return [pt.x,pt.y];
    }
    if (state.rasterMap) {
      const center=worldPixel(state.rasterMap.center[0],state.rasterMap.center[1],state.rasterMap.zoom);
      const p=worldPixel(coords[0],coords[1],state.rasterMap.zoom);
      const size=256*(2**state.rasterMap.zoom);
      const dx=((p[0]-center[0]+size*1.5)%size)-size/2;
      return [width/2+dx, height/2+p[1]-center[1]];
    }
    return [NaN,NaN];
  }
  const points=preview ? (preview.type==='ROAD_ROUTE' && Array.isArray(preview.coordinates) ? preview.coordinates :
    (preview.coordinates || [preview.origin,...(preview.stops||[]),preview.destination])) : [picked];
  const projected=points.map(project);
  if(!projected.length || projected.some(pair=>pair.some(n=>!Number.isFinite(n)))) {overlay.replaceChildren();return;}
  overlay.setAttribute('viewBox',`0 0 ${width} ${height}`);
  if (!preview) {
    const [x,y]=projected[0];
    // SVG pin captures its own pointer events but the rest of the overlay
    // remains transparent to ordinary map pan/zoom gestures.
    overlay.innerHTML=destinationPinSVG(x,y);
    label.textContent='DESTINATION PLACED · DRAG PIN TO ADJUST';label.hidden=false;return;
  }
  const path=projected.map((xy,i)=>`${i?'L':'M'} ${xy[0].toFixed(2)} ${xy[1].toFixed(2)}`).join(' ');
  const last=projected[projected.length-1], first=projected[0];
  const road=preview.type==='ROAD_ROUTE' && preview.is_driving_route===true;
  overlay.innerHTML=`<path class="${road?'road-route':'direct-route'}" d="${path}" />`+
    `<circle cx="${first[0].toFixed(2)}" cy="${first[1].toFixed(2)}" r="6" fill="#44dec4"/>`+
    destinationPinSVG(last[0],last[1]);
  label.textContent=road?'VALHALLA ROAD DIRECTIONS · START GPS FOLLOW WHEN READY':'DIRECT LINE · NOT A ROAD ROUTE';
  label.hidden=false;
}
async function refreshNavigationDestinations() {
  const reply=await api('/api/navigation/destinations');
  state.navDestinations=reply.destinations||[];
  $('map-destination-suggestions').replaceChildren(...state.navDestinations.map(d=>{
    const option=document.createElement('option');option.value=d.name;return option;
  }));
  const dest=$('nav-destination-list');
  dest.innerHTML=state.navDestinations.length ? state.navDestinations.map(d=>
    `<div class="nav-destination-entry"><strong>${escapeHTML(d.name)}</strong>`+
    `<p>${Number(d.latitude).toFixed(5)}, ${Number(d.longitude).toFixed(5)} · LOCAL destination, not an observation</p>`+
    `<div class="nav-button-row"><button type="button" class="btn mini outline" data-nav-use="${d.id}">Use</button>`+
    `<button type="button" class="btn mini danger-outline" data-nav-delete="${d.id}">Remove</button></div></div>`
  ).join('') : '<div class="empty">No destinations saved. Enter a location to save it locally.</div>';
}
function applyNavigationFit() {
  if (!state.navFitPending || !state.navPreview) return;
  const result=state.navPreview;
  const pts=result.coordinates || [result.origin,...(result.stops||[]),result.destination];
  const selected=pts.length > 3 ? pts.filter((_,i)=>i%Math.max(1,Math.ceil(pts.length/150))===0).concat([pts[pts.length-1]]) : pts;
  if (state.map && state.mapReady) {
    state.navFitPending=false;
    const bounds=new maplibregl.LngLatBounds(selected[0],selected[0]);
    selected.forEach(p=>bounds.extend(p));
    state.map.fitBounds(bounds,{padding:{top:Math.min(230,$('map').clientHeight*.37),bottom:40,left:35,right:45},maxZoom:13,duration:950});
  } else if (state.rasterMap) {
    state.navFitPending=false;
    const xs=selected.map(p=>p[0]),ys=selected.map(p=>p[1]);
    const left=Math.min(...xs),right=Math.max(...xs), south=Math.min(...ys),north=Math.max(...ys);
    const extent=Math.max(right-left,north-south,0.01);
    const zoom=Math.max(2,Math.min(12,Math.floor(Math.log2(180/(extent*1.8)))));
    state.rasterMap.flyTo({center:[(left+right)/2,(north+south)/2],zoom});
  }
  renderNavigationOverlay();
}
async function resolveTripField(text, fallbackPrefix) {
  const value=String(text||'').trim();
  if(value) return (await resolveTypedPlace(value)).coordinates;
  return navigationInputPoint(fallbackPrefix);
}
async function previewNavigation() {
  const originText=$('nav-start-query').value.trim();
  const origin=originText ? (await resolveTripField(originText,'nav-start')) :
    (state.navOriginManual && $('nav-start-lat').value && $('nav-start-lon').value ? navigationInputPoint('nav-start') : locationForQuickPreview());
  const stops=[];
  for(const field of document.querySelectorAll('.nav-stop-query')) {
    if (!field.value.trim()) throw Error('Enter a place for every added stop, or remove the unused row.');
    stops.push((await resolveTypedPlace(field.value)).coordinates);
  }
  const destination=await resolveTripField($('nav-dest-query').value,'nav-dest');
  const planned=await planRoadRoute([origin,...stops,destination]);
  $('nav-preview-summary').textContent=planned.text;
  setNavigationStatus(planned.text);
  showPage('map',{autoLocate:false});
  setTimeout(applyNavigationFit,120);
}
$('nav-check-local-router').addEventListener('click',async ()=>{
  const out=$('nav-router-status');out.textContent='Checking local Valhalla…';
  try { const reply=await api('/api/navigation/routing/status');out.textContent=reply.detail; }
  catch(error){out.textContent=`Routing status unavailable: ${error.message}`;}
});
$('nav-preview-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try {await previewNavigation();} catch(err){setNavigationStatus(err.message);}
});
$('nav-add-stop').addEventListener('click',()=>{
  const parent=$('nav-stops');
  if(parent.children.length>=10){setNavigationStatus('Maximum of ten intermediate stops.');return;}
  const row=document.createElement('div');row.className='nav-stop-row';
  const input=document.createElement('input');input.className='field nav-stop-query';input.type='text';
  input.placeholder=`Stop ${parent.children.length+1} street address, place, or coordinates`;
  input.maxLength=140;input.setAttribute('aria-label',`Stop ${parent.children.length+1}`);
  const remove=document.createElement('button');remove.type='button';remove.className='btn outline mini';
  remove.textContent='Remove';remove.addEventListener('click',()=>row.remove());
  row.append(input,remove);parent.append(row);wireTripAddressField(input);input.focus();
});
$('nav-use-location').addEventListener('click',()=>{
  const button=$('nav-use-location'),status=$('nav-origin-status');
  if(!navigator.geolocation){status.textContent='Browser geolocation unavailable. Enter coordinates manually.';return;}
  button.disabled=true;status.textContent='Requesting a fresh position. Nothing is saved or tracked.';
  navigator.geolocation.getCurrentPosition(pos=>{
    button.disabled=false;
    const {latitude,longitude,accuracy}=pos.coords||{};
    const age=(Date.now()-pos.timestamp)/1000;
    if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||
       !Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(age)||age< -5||age>60){
       status.textContent='The location fix was invalid or stale. No coordinates changed.';return;
    }
    state.navOriginManual=false;
    $('nav-start-query').value='';
    state.browserLocation={lat:latitude,lon:longitude,accuracy,capturedAt:Date.now()};
    updateBrowserLocationMarker();
    $('nav-start-lat').value=latitude.toFixed(7);$('nav-start-lon').value=longitude.toFixed(7);
    status.textContent=`Browser-reported starting point (±${Math.round(accuracy)} m; ${Math.round(Math.max(0,age))} s old). Desktop/VPN location may be approximate.`;
  },err=>{
    button.disabled=false;
    status.textContent=`Position unavailable (${err.code===1?'permission denied':err.code===3?'timed out':'no fix'}). Enter coordinates manually.`;
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
});
function beginDestinationMapPick() {
  if (state.navPicking) {
    state.navPicking=false;syncDestinationPickMode();renderNavigationOverlay();
    setMapDestinationStatus('Map destination selection cancelled.');return;
  }
  if (state.areaChoosing) cancelAreaChoosing();
  stopNavigationFollow();
  $('map-begin-guidance').disabled=true;
  state.navPicking=true;state.navPickedPoint=null;state.navPreview=null;state.navFitPending=false;
  showPage('map',{autoLocate:false});
  syncDestinationPickMode();
  renderNavigationOverlay();
  setMapDestinationStatus('Tap the map once to place a red destination pin, then Get directions. Ordinary map panning returns afterward; no observation is saved.');
}
$('nav-pick-map').addEventListener('click',beginDestinationMapPick);
$('map-pick-destination').addEventListener('click',beginDestinationMapPick);
$('nav-clear-preview').addEventListener('click',()=>{
  stopNavigationFollow();
  $('map-begin-guidance').disabled=true;
  state.navPicking=false;state.navPickedPoint=null;state.navPreview=null;state.navFitPending=false;
  syncDestinationPickMode();
  $('nav-preview-summary').textContent='';
  $('nav-directions').replaceChildren();
  setNavigationStatus('Preview cleared; saved destinations are unchanged.');
  renderNavigationOverlay();
});
$('nav-save-destination').addEventListener('click',()=>runAction(async()=>{
  const coords=navigationInputPoint('nav-dest');
  const name=$('nav-dest-name').value.trim();
  if(!name) throw Error('Enter a destination name before saving.');
  await api('/api/navigation/destinations','POST',{name,latitude:coords[1],longitude:coords[0]});
  await refreshNavigationDestinations();
  setNavigationStatus('Destination saved locally. No route or GPS history recorded.');
}));
$('nav-destination-list').addEventListener('click',event=>{
  const use=event.target.closest('[data-nav-use]');
  const remove=event.target.closest('[data-nav-delete]');
  if(use){
    const d=state.navDestinations.find(x=>x.id===Number(use.dataset.navUse));
    if(d){state.navSelectedAddress=null;$('map-destination-query').value=d.name;$('nav-dest-name').value=d.name;$('nav-dest-lat').value=d.latitude;$('nav-dest-lon').value=d.longitude;$('nav-dest-query').value=d.name;
      setNavigationStatus('Saved destination loaded. Enter your starting position and preview it on the map.');}
  }
  if(remove && confirm('Delete this saved navigation destination from your private OpenRF database?'))runAction(async()=>{
    await api(`/api/navigation/destinations/${remove.dataset.navDelete}`,'DELETE');
    await refreshNavigationDestinations();setNavigationStatus('Saved destination removed.');
  });
});
// v0.2.32: opt-in GPS follow view. A route plan is mandatory; this does not
// provide active rerouting, spoken prompts, lane guidance, or a safety guarantee.
// Watch positions are held only in memory and never uploaded/saved by OpenRF.
function stopNavigationFollow(){
  if(state.navFollowId!==null && navigator.geolocation?.clearWatch)
    navigator.geolocation.clearWatch(state.navFollowId);
  state.navFollowId=null;
  $('map-follow-hud').hidden=true;
  if(state.map && state.mapReady) state.map.easeTo({pitch:0,bearing:0,duration:300});
}
function navigationNearestShape(coords,lon,lat){
  // At most ~2500 coarse samples, then refine locally; suitable for a low-power Pi.
  const stride=Math.max(1,Math.ceil(coords.length/2500));
  const factor=Math.cos(lat*Math.PI/180);
  const sq=(point)=>((point[0]-lon)*factor)**2+(point[1]-lat)**2;
  let best=0, distance=Infinity;
  for(let i=0;i<coords.length;i+=stride){const d=sq(coords[i]);if(d<distance){distance=d;best=i;}}
  for(let i=Math.max(0,best-stride);i<=Math.min(coords.length-1,best+stride);i++){
    const d=sq(coords[i]);if(d<distance){distance=d;best=i;}
  }
  return {index:best,offset_m:Math.sqrt(distance)*111195};
}
function followPosition(pos){
  if(state.navFollowId===null)return;
  const route=state.navPreview;
  if(route?.type!=='ROAD_ROUTE' || !route.is_driving_route){stopNavigationFollow();return;}
  const {latitude:lat,longitude:lon,accuracy,heading,speed}=pos.coords||{};
  const age=Date.now()-pos.timestamp;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||
    !Number.isFinite(accuracy)||accuracy<0||accuracy>100||!Number.isFinite(age)||age< -5000||age>15000){
    $('map-follow-instruction').textContent='GPS fix unavailable or too imprecise. No current turn guidance.';
    $('map-follow-quality').textContent='Waiting for an accurate, recent browser location fix. No data saved.';return;
  }
  state.browserLocation={lat,lon,accuracy,capturedAt:Date.now()};
  updateBrowserLocationMarker();
  const nearest=navigationNearestShape(route.coordinates,lon,lat);
  if(nearest.offset_m>Math.max(85,accuracy*2)){
    $('map-follow-instruction').textContent='Position off planned road or uncertain. Maneuver guidance paused.';
    $('map-follow-quality').textContent='No automatic rerouting. Stop safely and choose Get directions for a new plan.';
  }else{
    // Avoid jumping backwards from small GPS inaccuracies along curving roads.
    state.navFollowProgress=Math.max(state.navFollowProgress,nearest.index);
    const maneuvers=(route.maneuvers||[]).filter(m=>Number.isInteger(m.shape_index) && m.shape_index>=state.navFollowProgress+2);
    const next=maneuvers[0];
    $('map-follow-instruction').textContent=next?next.instruction:'Continue along the route toward your destination.';
    $('map-follow-quality').textContent=`Browser GPS ±${Math.round(accuracy)} m · Route-following beta · No automatic rerouting or voice. Never operate while driving.`;
  }
  // Camera is intentionally slightly *behind* the blue location dot, with a
  // heading-up view only when the device reports a valid moving heading.
  const bearing=(Number.isFinite(heading)&&heading>=0&&heading<360&&Number.isFinite(speed)&&speed>1.4)?heading:0;
  if(Date.now()-state.navFollowLast>700){
    state.navFollowLast=Date.now();
    if(state.map && state.mapReady){
      state.map.easeTo({center:[lon,lat],zoom:16.5,pitch:42,bearing,offset:[0,Math.min(85,$('map').clientHeight*.18)],duration:650});
    }else if(state.rasterMap){ state.rasterMap.stop();state.rasterMap.center=[lon,lat];state.rasterMap.zoom=16;state.rasterMap.render(); }
  }
}
$('map-begin-guidance').addEventListener('click',()=>{
  if(state.navPreview?.type!=='ROAD_ROUTE'||!state.navPreview.is_driving_route){
    setMapDestinationStatus('Get a confirmed Valhalla road route first; direct lines cannot start GPS follow.','error');return;
  }
  if(!navigator.geolocation?.watchPosition){
    setMapDestinationStatus('This browser cannot provide GPS follow positions. Route directions remain available.','error');return;
  }
  stopNavigationFollow();
  state.navFollowLast=0;state.navFollowProgress=0;
  $('map-follow-hud').hidden=false;
  $('map-follow-instruction').textContent='Requesting fresh GPS positions…';
  $('map-follow-quality').textContent='Location stays on this device. Accuracy must be ≤100 m; no automatic rerouting or spoken guidance.';
  // Some browsers may invoke a mocked callback synchronously; set a sentinel
  // before the actual watch ID is assigned.
  state.navFollowId=-1;
  try{ state.navFollowId=navigator.geolocation.watchPosition(followPosition,err=>{
    $('map-follow-instruction').textContent=`GPS follow unavailable (${err.code===1?'permission denied':err.code===3?'timed out':'position unavailable'}).`;
    $('map-follow-quality').textContent='Check permission and device GPS. No travel history was saved.';
  },{enableHighAccuracy:true,maximumAge:0,timeout:12000}); }
  catch(err){stopNavigationFollow();setMapDestinationStatus(`GPS follow could not start: ${err.message}`,'error');}
});
$('map-stop-guidance').addEventListener('click',()=>{stopNavigationFollow();setMapDestinationStatus('GPS follow stopped. Road plan remains available.');});
// When leaving the map, do not silently continue collecting browser positions.
$('map-destination-form').addEventListener('submit',async event=>{
  event.preventDefault();
  setMapDestinationStatus('Resolving destination…');
  const button=$('map-start-navigation');button.disabled=true;
  try {await quickDestinationPreview($('map-destination-query').value);} catch(err){setMapDestinationStatus(err.message,'error');}
  finally {button.disabled=false;}
});
for(const id of ['nav-start-lat','nav-start-lon']) {
  $(id).addEventListener('input',()=>{state.navOriginManual=true;
    $('nav-origin-status').textContent='Custom starting point selected. Use fresh browser location to reset it.';});
}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.jump)));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('map-add-observation').addEventListener('click',()=>openObservation());
$('waypoint-session').addEventListener('change', renderWaypointSelection);
$('waypoint-show-map').addEventListener('change', updateMap);
$('waypoint-record').addEventListener('click', recordWaypoint);
$('waypoint-export').addEventListener('click',()=>{
  const sessionId = Number($('waypoint-session').value);
  if (!sessionId || !confirm('Export precise browser-reported location coordinates for this investigation as GeoJSON? The download stays local but sharing the file could reveal survey locations.')) return;
  const link = document.createElement('a');
  link.href = `/api/survey/waypoints.geojson?session_id=${sessionId}`;
  link.download = `openrf-survey-waypoints-${sessionId}.geojson`;
  document.body.append(link); link.click(); link.remove();
});
$('waypoint-list').addEventListener('click',e=>{
  const view=e.target.closest('[data-waypoint-view]');
  const del=e.target.closest('[data-waypoint-delete]');
  if(view) {
    const w=state.waypoints.find(row=>row.id===Number(view.dataset.waypointView));
    if(w) (state.map || state.rasterMap)?.flyTo({center:[w.longitude,w.latitude],zoom:14});
  }
  if(del && confirm('Permanently delete this local survey waypoint?')) runAction(async()=>{
    await api(`/api/survey/waypoints/${Number(del.dataset.waypointDelete)}`,'DELETE');
    await refresh(); flash('Survey waypoint deleted. No observations or capture data were changed.');
  });
});
$('add-discovery').addEventListener('click',()=>openObservation());
$('new-session').addEventListener('click',()=>$('session-dialog').showModal());
$('show-demo-map').addEventListener('change',e => {state.showDemo = e.target.checked;$('show-demo-map-sheet').checked=e.target.checked;updateMap();renderMapSurveyPanel();});
$('map-style').addEventListener('click',()=>{
  state.style = state.style==='dark'?'light':'dark';
  if (state.map) {state.mapReady=false;state.map.setStyle(openrfMapStyleUrl());}
  if (state.rasterMap) {$('map').classList.toggle('raster-dark',state.style==='dark');}
  $('map-style').textContent=state.style==='dark'?'OpenRF Light':'OpenRF Dark';
});
$('map-vector-source').addEventListener('click',()=>{
  if (!state.mapVectorOffline && !(state.vectorStatus?.ready && state.vectorStatus?.fonts_ready)) {
    $('map-vector-status').textContent='Offline vector tiles are unavailable; verify local map installation first.';
    return;
  }
  state.mapVectorOffline=!state.mapVectorOffline;
  updateOpenRFVectorButtons();updateOfflineAttribution();
  if (state.map) {
    state.mapReady=false;
    state.map.setStyle(openrfMapStyleUrl());
  } else if (state.rasterMap) {
    state.preferredView={center:[...state.rasterMap.center],zoom:state.rasterMap.zoom};
    state.rasterMap.stop();state.rasterMap=null;
    $('map').replaceChildren();$('map').classList.remove('raster-mode','raster-dark');startMap();
  }
  $('map-vector-status').textContent=state.mapVectorOffline ?
    'Local regional vector source selected. Tile requests stay within OpenRF. Outside Amador/Calaveras, blank coverage is expected.' :
    'Online OpenRF vector source selected. Map tiles and font requests may use OpenFreeMap.';
});
refreshOpenRFVectorMapStatus().catch(()=>{});
$('map-geolocate').addEventListener('click',()=>locateMap(true));
$('map-geolocate-sheet').addEventListener('click',()=>locateMap(true));
$('map-style-sheet').addEventListener('click',()=>$('map-style').click());
$('map-mode-sheet').addEventListener('click',()=>$('map-mode').click());
$('show-demo-map-sheet').addEventListener('change',e=>{ $('show-demo-map').checked=e.target.checked;$('show-demo-map').dispatchEvent(new Event('change')); });
$('map-mode').addEventListener('click',()=>{
  if (!state.rasterMap) {switchToRasterMap('Offline raster/coordinate mode selected.');return;}
  state.preferredView={center:[...state.rasterMap.center],zoom:state.rasterMap.zoom};
  state.rasterMap.stop();
  state.rasterMap=null;
  $('map').replaceChildren(); $('map').classList.remove('raster-mode','raster-dark');
  startMap();
});
async function scanWifiOnce() {
  const buttons = [$('scan-wifi-once'), $('map-scan-wifi')];
  buttons.forEach(button => {button.disabled=true; button.dataset.oldText=button.textContent; button.textContent='Scanning…';});
  $('map-survey-status').textContent = 'Requesting Linux Wi-Fi scan…';
  // Capture the observer position at scan request time only; a later browser
  // location may be elsewhere and must not be attached retroactively.
  const atRequest = state.browserLocation;
  const ageAtRequest = atRequest ? (Date.now() - atRequest.capturedAt) / 1000 : Infinity;
  const atScanPosition = atRequest && ageAtRequest >= 0 && ageAtRequest <= 60 ?
    {latitude:atRequest.lat, longitude:atRequest.lon, accuracy_m:atRequest.accuracy,
     fix_age_seconds:Math.round(ageAtRequest * 10) / 10} : null;
  try {
    state.wifiScan = await api('/api/wifi/scan', 'POST', {});
    state.wifiScan.observerAtRequest = atScanPosition;
    renderWifiScan(); renderMapSurveyPanel(); updateCaptureButtons();
    $('map-survey-status').textContent = `${state.wifiScan.records.length} access point(s) returned. Results may be cached; no source coordinates, RSSI dBm, or automatic map pins.`;
    flash(`Received ${state.wifiScan.records.length} Linux Wi-Fi entries. Freshness unverified; nothing stored or mapped.`);
  } catch (error) {
    $('map-survey-status').textContent = `Scan unavailable: ${error.message}`;
    flash(error.message, true);
  } finally {
    buttons.forEach(button => {button.disabled=false; button.textContent=button.dataset.oldText;});
  }
}
async function saveWifiReading(bssid, button) {
  const scan = state.wifiScan;
  if (!scan?.scan_id || !scan.records?.some(n => n.bssid === bssid)) return flash('No verified local scan receipt to save.', true);
  let survey_location = null;
  const loc = state.browserLocation;
  if (loc && Date.now() - loc.capturedAt < 5 * 60 * 1000 && confirm('Attach your browser-reported survey location to this observation? It is NOT the access point location. Click Cancel to save without coordinates.')) {
    survey_location = {latitude:loc.lat, longitude:loc.lon, accuracy_m:loc.accuracy};
  }
  button.disabled = true;
  try {
    const active = state.sessions.find(x => x.status === 'ACTIVE');
    const saved = await api('/api/sensors/networkmanager-wifi/save', 'POST', {scan_id:scan.scan_id, bssid, survey_location, session_id:active?.id || null});
    flash(`Saved verified Linux Wi-Fi retrieval: ${saved.label} (signal quality is not RSSI).`);
    await refresh();
  } catch (error) { flash(error.message, true); }
  finally { button.disabled = false; }
}
for (const id of ['map-wifi-readings', 'live-wifi-results']) {
  $(id).addEventListener('click', e => {
    const button = e.target.closest('[data-save-wifi]');
    if (button) saveWifiReading(button.dataset.saveWifi, button);
  });
}


function updateCaptureButtons() {
  for (const id of ['map-save-scan', 'scanner-save-scan']) $(id).disabled = !state.wifiScan?.scan_id;
}
function surveyLocationForCapture(attach) {
  if (!attach) return null;
  const position = state.wifiScan?.observerAtRequest;
  if (!position) throw Error('No recent browser location existed when this scan was requested. Use My location and run a NEW Wi-Fi scan, or save without coordinates.');
  return position;
}
async function saveScanSnapshot() {
  const scan = state.wifiScan;
  if (!scan?.scan_id) return flash('Run a new Linux Wi-Fi scan before saving a snapshot.', true);
  const attach = $('map-capture-location').checked;
  return runAction(async () => {
    const survey_location = surveyLocationForCapture(attach);
    if (!confirm(`Save this real NetworkManager retrieval (${scan.records.length} returned access point(s))?${attach ? ' Browser-reported survey location will be attached, not an access-point location.' : ' No coordinates will be stored.'}`)) return;
    const active = state.sessions.find(x => x.status === 'ACTIVE');
    const data = await api('/api/sensors/networkmanager-wifi/save-scan', 'POST', {
      scan_id: scan.scan_id, session_id: active?.id || null, survey_location,
    });
    // A receipt can be captured only once. Leave the observed values visible but disable saves.
    scan.scan_id = null;
    renderWifiScan(); renderMapSurveyPanel(); updateCaptureButtons();
    flash(`Saved snapshot #${data.id}: ${data.saved_count} Wi-Fi result(s) · ${data.location_source === 'BROWSER_REPORTED' ? 'browser survey position' : 'no position'} · cached results possible.`);
    await refresh();
  });
}
for (const checkbox of ['map-capture-location', 'scanner-capture-location']) {
  $(checkbox).addEventListener('change', event => {
    $('map-capture-location').checked = event.target.checked;
    $('scanner-capture-location').checked = event.target.checked;
  });
}
$('map-save-scan').addEventListener('click', saveScanSnapshot);
$('scanner-save-scan').addEventListener('click', saveScanSnapshot);

$('scan-wifi-once').addEventListener('click', scanWifiOnce);
$('map-scan-wifi').addEventListener('click', scanWifiOnce);
$('map-survey-toggle').addEventListener('click', () => setMapSurveyOpen($('map-survey-panel').hidden));
$('map-survey-close').addEventListener('click', () => setMapSurveyOpen(false));
document.querySelectorAll('[data-map-kind]').forEach(input => input.addEventListener('change', () => {
  if (input.checked) state.mapKinds.add(input.dataset.mapKind);
  else state.mapKinds.delete(input.dataset.mapKind);
  updateMap(); renderMapSurveyPanel();
}));
$('usb-sensor-probe').addEventListener('click',()=>runAction(()=>runSerialSensor(false)));
$('usb-sensor-capture').addEventListener('click',()=>runAction(()=>runSerialSensor(true)));
$('hardware-readiness-export').addEventListener('click', downloadHardwareReadiness);
$('refresh-hardware').addEventListener('click',()=>runAction(async()=>{
  const [hardware, registry, diagnostics, readiness] = await Promise.all([
    api('/api/hardware'), api('/api/sensors'), api('/api/sensors/diagnostics'), api('/api/hardware/readiness')
  ]);
  state.hardware = hardware; state.sensors = registry.sensors;
  state.serialTransport = registry.serial_transport; state.diagnostics = diagnostics;
  state.readiness = readiness;
  renderHardware(); renderSensorRegistry(); renderSerialPorts(); renderHardwareReadiness();
  flash('Read-only Linux hardware inventory and diagnostics refreshed. No RF scan started.');
}));
$('discovery-search').addEventListener('input',renderDiscoveries);
for (const id of ['discovery-kind','discovery-source','discovery-session','discovery-age','discovery-sort','discovery-mapped','show-demo-list']) {
  $(id).addEventListener('change',renderDiscoveries);
}
$('discovery-reset').addEventListener('click',resetDiscoveryFilters);
$('discovery-export').addEventListener('click',downloadShownDiscoveries);
$('signal-select').addEventListener('change',drawHistory);
$('history-window').addEventListener('change',drawHistory);
$('history-include-demo').addEventListener('change',refreshHistorySeries);
$('history-export').addEventListener('click',exportHistoryCsv);
$('compare-series').addEventListener('change',()=>renderComparisonResult());
$('compare-mode').addEventListener('change',()=>renderComparisonResult());
$('compare-before-session').addEventListener('change',()=>renderComparisonResult());
$('compare-after-session').addEventListener('change',()=>renderComparisonResult());
$('compare-include-demo').addEventListener('change',renderComparison);
$('compare-export').addEventListener('click',exportComparisonCsv);
$('discoveries-list').addEventListener('click',e=>{
  const del=e.target.closest('[data-delete]'); const zoom=e.target.closest('[data-zoom]');
  if(zoom) zoomToRecord(Number(zoom.dataset.zoom));
  if(del && confirm('Permanently delete this local observation?')) runAction(async()=>{await api(`/api/observations/${del.dataset.delete}`,'DELETE');flash('Record deleted.');await refresh();});
});
$('session-report-select').addEventListener('change', updateSessionReportSelector);
$('session-report-preview').addEventListener('click', () => openSessionReport('html'));
$('session-report-html').addEventListener('click', () => openSessionReport('html', true));
$('session-report-json').addEventListener('click', () => openSessionReport('json', true));
$('session-list').addEventListener('click',e=>{
  const stop=e.target.closest('[data-stop]'); const view=e.target.closest('[data-session-filter]');
  const report=e.target.closest('[data-session-report]');
  if(report) { $('session-report-select').value = report.dataset.sessionReport; updateSessionReportSelector(); $('session-report-select').focus(); }
  if(stop) runAction(async()=>{await api(`/api/sessions/${stop.dataset.stop}/stop`,'POST',{});flash('Session stopped.');await refresh();});
  if(view) {const selected = String(view.dataset.sessionFilter);resetDiscoveryFilters();$('discovery-session').value=selected; $('discovery-refine').open=true;renderDiscoveries();showPage('discoveries');flash(`Showing saved observations from investigation #${selected}. Choose Clear filters to return to all records.`);}
});
$('observation-use-location').addEventListener('click', useLocationForObservation);
$('observation-dialog').addEventListener('close', () => {
  ++observationLocationRequestId;
  observationLocationFix = null;
  $('observation-use-location').disabled = false;
});
for (const name of ['latitude','longitude']) {
  $('observation-form').elements[name].addEventListener('input', observationCoordinateEdited);
}
$('observation-form').addEventListener('submit',e=>{
  e.preventDefault();runAction(async()=>{
    const values=Object.fromEntries(new FormData(e.target).entries());
    if (values.location_source === 'BROWSER_REPORTED') {
      const age = observationLocationFix ? (Date.now()-observationLocationFix.reportedAt)/1000 : Infinity;
      if (!Number.isFinite(age) || age < -5 || age > 60) {
        throw Error('Browser location is now over 60 seconds old. Press Use my location again before saving, or enter the coordinates manually.');
      }
      values.fix_age_seconds = Math.max(0,age).toFixed(1);
    }
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

// Handheld/touchscreen widths open directly to the primary map workspace.
// Desktop preserves the original overview landing page.
if (window.matchMedia('(max-width: 900px), (max-width: 1400px) and (max-height: 850px) and (pointer: coarse)').matches) showPage('map');
refresh().catch(e=>flash(`OpenRF data refresh failed: ${e.message}. The server may still be running.`,true));
refreshOfflineMaps().catch(e=>{ $('offline-map-status').textContent = `Unable to list local maps: ${e.message}`; });
refreshAreaPlans().catch(e=>{ $('area-saved-detail').textContent = `Saved area plans unavailable: ${e.message}`; });
refreshNavigationDestinations().catch(e=>{ $('nav-destination-list').textContent=`Local destinations unavailable: ${e.message}`; });
