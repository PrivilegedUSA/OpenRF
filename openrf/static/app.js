'use strict';

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = (val, suffix = '') => val === null || val === undefined || val === '' ? '—' : `${val}${suffix}`;
const stamp = (s) => s ? new Date(s).toLocaleString() : 'Not available';
const state = { observations: [], sessions: [], captures: [], diagnostics: null, hardware: null, map: null, mapReady: false, style: 'liberty', rasterMap: null, mapAttempt: 0, showDemo: false, filterSession: null, browserLocation: null, geoMarker: null, autoLocateAttempted: false, mapNavigationEpoch: 0, preferredView: null, wifiScan: null, sensors: [], serialTransport: null, pendingLocationView: null, offlineMaps: [], offlineMap: null, areaPlans: [], selectedArea: null, areaChoosing: false, areaFirstCorner: null, areaDraftBounds: null, mapKinds: new Set(['WIFI','BLE','RF','CELLULAR','INFRASTRUCTURE','MANUAL']) };

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
  const [records, sessions, stats, hardware, sensorData, captureData, diagnostics] = await Promise.all([
    api('/api/observations'), api('/api/sessions'), api('/api/stats'), api('/api/hardware'), api('/api/sensors'),
    api('/api/captures'), api('/api/sensors/diagnostics')
  ]);
  state.observations = records.observations;
  state.sessions = sessions.sessions;
  state.hardware = hardware;
  state.sensors = sensorData.sensors || [];
  state.serialTransport = sensorData.serial_transport || null;
  state.captures = captureData.captures || [];
  state.diagnostics = diagnostics;
  $('metric-observations').textContent = stats.observations;
  $('metric-mapped').textContent = stats.mapped;
  $('metric-sessions').textContent = stats.sessions;
  $('metric-demo').textContent = stats.demo;
  $('runtime-pill').textContent = hardware.environment;
  $('scanner-connection-pill').textContent = hardware.wifi_one_shot?.possible ? 'ON-DEMAND WI-FI POSSIBLE' : 'NO LINUX WI-FI SCANNER';
  renderDiscoveries(); renderSessions(); renderCaptures(); renderHardware(); renderSensorRegistry(); renderSerialPorts(); renderSignals(); updateMap(); renderMapSurveyPanel();
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
    ${o.signal_quality_percent !== null && o.signal_quality_percent !== undefined ? `<div class="tiny">NetworkManager quality ${escapeHTML(o.signal_quality_percent)}% (not RSSI) · ${escapeHTML(o.location_source || 'UNSPECIFIED')} observer location ${o.fix_age_seconds !== null ? `· fix age ${escapeHTML(o.fix_age_seconds)} seconds` : ''}</div>` : ''}
    </div><div class="item-actions">${o.latitude !== null ? `<button class="btn mini outline" data-zoom="${o.id}">Map</button>` : ''}<button class="btn mini danger-outline" data-delete="${o.id}">Delete</button></div></article>`).join('') :
    '<div class="empty">No records match. Use “Add observation”, or enable the demo filter for the optional test fixtures.</div>';
}

function renderSessions() {
  $('session-count').textContent = `${state.sessions.length} sessions`;
  $('session-list').innerHTML = state.sessions.length ? state.sessions.map(s => `
    <article class="item"><div><div class="item-top"><h4>${escapeHTML(s.name)}</h4><span class="badge ${s.status === 'ACTIVE' ? '' : 'manual'}">${escapeHTML(s.status)}</span></div>
    <p>${escapeHTML(s.observation_count)} saved observations · ${escapeHTML(s.capture_count || 0)} survey snapshots · Started ${escapeHTML(stamp(s.started_at))}</p>
    <div class="tiny">${s.ended_at ? `Ended ${escapeHTML(stamp(s.ended_at))}` : 'No finish timestamp recorded'} · Records stay local</div>
    </div><div class="item-actions"><button class="btn mini outline" data-session-filter="${s.id}">Records</button>
    ${s.status === 'ACTIVE' ? `<button class="btn mini danger-outline" data-stop="${s.id}">Stop</button>` : ''}</div></article>`).join('') :
    '<div class="empty">No sessions started. You can record notes against a session, but no background collection occurs.</div>';
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
  finally { buttons.forEach(b=>b.disabled=!($('usb-sensor-port').value)); }
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
  const grouped = new Map();
  signals.forEach(o => { if (o.identifier && (o.rssi_dbm !== null || o.signal_quality_percent !== null && o.signal_quality_percent !== undefined)) {
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
  renderWifiScan();
  $('signal-table').innerHTML = rows.length ? `<table class="data-table"><thead><tr><th>IDENTIFIER</th><th>KIND</th><th>RSSI</th><th>QUALITY</th><th>FREQUENCY</th><th>PROVENANCE</th><th>TIME</th></tr></thead><tbody>${rows.map(o=>`<tr><td data-label="Identifier">${escapeHTML(o.identifier || o.label)}</td><td data-label="Kind">${escapeHTML(o.kind)}</td><td data-label="RSSI">${format(o.rssi_dbm, ' dBm')}</td><td data-label="Quality">${format(o.signal_quality_percent, '%')}</td><td data-label="Frequency">${format(o.frequency_mhz, ' MHz')}</td><td data-label="Source">${escapeHTML(o.source)}</td><td data-label="Time">${escapeHTML(stamp(o.observed_at))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No saved RF measurements yet. One-shot Wi-Fi results above are temporary and not stored automatically.</div>';
  drawHistory(grouped);
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

function drawHistory(grouped = null) {
  const id = $('signal-select').value;
  const all = grouped?.get(id) || state.observations.filter(o => o.identifier === id &&
    (o.rssi_dbm !== null || o.signal_quality_percent !== null && o.signal_quality_percent !== undefined));
  if (!id || !all.length) { $('history-graph').innerHTML = '<div class="empty">Choose an identifier with measured signal strength or quality.</div>'; return; }
  const rssi = all.filter(o => o.rssi_dbm !== null);
  const quality = all.filter(o => o.signal_quality_percent !== null && o.signal_quality_percent !== undefined);
  // Never mix dBm power measurements and NetworkManager signal-quality percentages.
  const metric = rssi.length ? 'rssi_dbm' : 'signal_quality_percent';
  const unit = rssi.length ? 'dBm' : '% NetworkManager quality';
  const sorted = (rssi.length ? rssi : quality).slice().reverse();
  const values = sorted.map(x => Number(x[metric]));
  const min = Math.min(...values) - 5, max = Math.max(...values) + 5;
  const coords = values.map((v, i) => [32 + (values.length === 1 ? 155 : i * 310 / (values.length - 1)), 125 - (v - min) / (max - min) * 105]);
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  $('history-graph').innerHTML = `<svg viewBox="0 0 380 155" role="img" aria-label="${escapeHTML(unit)} values from ${sorted.length} observations">
    <line x1="28" x2="352" y1="20" y2="20" class="gridline"/><line x1="28" x2="352" y1="125" y2="125" class="gridline"/>
    <text x="2" y="24">${max.toFixed(0)}</text><text x="2" y="129">${min.toFixed(0)}</text>
    <path d="${path}" fill="none" stroke="#41d8bd" stroke-width="3"/>
    ${coords.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#81f4dc"/>`).join('')}
    <text x="30" y="148">First record</text><text x="277" y="148">Last record</text></svg>
    <p class="small muted">${sorted.length} reading(s) in ${escapeHTML(unit)} · ${sorted.some(o => o.source === 'DEMO') ? 'SYNTHETIC DEMO included · ' : ''}${metric === 'signal_quality_percent' ? 'May include cached results; ' : ''}not a distance or transmitter location estimate.</p>`;
}

// MapLibre is preferred, but remote JavaScript or tiles can be blocked by VPNs,
// network rules, or browser extensions. This independent local raster/coordinate
// map needs no external JavaScript library and never requests OSM public tiles.
// A user-provided, licensed MBTiles raster basemap is optional.
function startMap() {
  if (state.map || state.rasterMap) return;
  if (!window.maplibregl) { const view = state.preferredView; state.preferredView = null; return startRasterMap('MapLibre is unavailable. Using the built-in raster/coordinate map.', view); }
  const attempt = ++state.mapAttempt;
  try {
    const initial = state.pendingLocationView || state.preferredView || {center:[-98.5,39.8], zoom:4};
    state.preferredView = null;
    state.map = new maplibregl.Map({container:'map', style:`https://tiles.openfreemap.org/styles/${state.style}`, center:initial.center, zoom:initial.zoom, attributionControl:false, maplibreLogo:false});
    state.map.addControl(new maplibregl.NavigationControl(), 'top-right');
    state.map.on('style.load', () => { updateOfflineAttribution(); state.mapReady = true; $('map-error').hidden = true; installMarkerLayer(); updateMap(); updateBrowserLocationMarker(); applyPendingLocation(); renderAreaOverlay(); });
    state.map.on('movestart', event => { if (event.originalEvent) state.mapNavigationEpoch++; });
    state.map.on('move', renderAreaOverlay);
    state.map.on('click', (evt) => {
      if (consumeAreaClick(evt.lngLat.lng, evt.lngLat.lat)) return;
      if (state.mapReady && state.map.getLayer('survey-points') && state.map.queryRenderedFeatures(evt.point,{layers:['survey-points']}).length) return;
      if (state.browserLocation && Math.abs(evt.lngLat.lat-state.browserLocation.lat) < 0.0001 && Math.abs(evt.lngLat.lng-state.browserLocation.lon) < 0.0001) return;
      openObservation(evt.lngLat.lat.toFixed(6), evt.lngLat.lng.toFixed(6));
    });
    state.map.on('click', 'survey-points', (evt) => {
      if (state.areaChoosing || !evt.features?.length) return;
      const p = evt.features[0].properties;
      new maplibregl.Popup().setLngLat(evt.lngLat).setHTML(`<strong>${escapeHTML(p.label)}</strong><br>${escapeHTML(p.kind)} · ${escapeHTML(p.source)}<br><small>Observation position only</small>`).addTo(state.map);
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
function applyPendingLocation() {
  const pending = state.pendingLocationView;
  if (!pending) return;
  // User gestures after a GPS request take precedence over automatic recentering.
  if (!pending.manual && pending.epoch !== state.mapNavigationEpoch) { state.pendingLocationView = null; return; }
  if (state.map && state.mapReady) {
    state.map.jumpTo({center:pending.center, zoom:pending.zoom});
    state.pendingLocationView = null;
  } else if (state.rasterMap) {
    state.rasterMap.flyTo({center:pending.center, zoom:pending.zoom});
    state.pendingLocationView = null;
  } else {
    state.preferredView = {center:pending.center, zoom:pending.zoom};
  }
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
function installMarkerLayer() {
  if (!state.map || state.map.getSource('survey-data')) return;
  state.map.addSource('survey-data', {type:'geojson',data:{type:'FeatureCollection',features:[]}});
  state.map.addLayer({id:'survey-points',type:'circle',source:'survey-data',paint:{
    'circle-color':['case',['==',['get','source'],'DEMO'],'#efa947',['match',['get','kind'],'WIFI','#53a9ff','BLE','#ae8cff','RF','#efaa53','CELLULAR','#f07b8d','INFRASTRUCTURE','#e9f0f1','#30dec0']],
    'circle-radius':8,'circle-stroke-color':'#09252c','circle-stroke-width':2,'circle-opacity':0.9
  }});
}
function updateMap() {
  if (state.rasterMap) return state.rasterMap.render();
  if (!state.mapReady || !state.map?.getSource('survey-data')) return;
  const observations = mapVisibleObservations();
  const features = observations.map(o => ({type:'Feature',geometry:{type:'Point',coordinates:[o.longitude,o.latitude]},properties:{id:o.id,label:o.label,kind:o.kind,source:o.source}}));
  state.map.getSource('survey-data').setData({type:'FeatureCollection',features});
}
function switchToRasterMap(reason) {
  ++state.mapAttempt;
  const camera = state.pendingLocationView || (state.map ? {center:[state.map.getCenter().lng,state.map.getCenter().lat], zoom:state.map.getZoom()} : state.preferredView);
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
  controls.append(plus, minus); surface.append(tiles, pins);
  root.replaceChildren(surface, notice, controls);
  const raster = {center:view?.center || [-98.5,39.8], zoom:Math.max(2,Math.min(18,Math.round(view?.zoom || 4))), tileNodes:new Map(), failedTiles:new Set(),
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
    },
    flyTo({center, zoom}) { raster.center = [...center]; if (Number.isFinite(zoom)) raster.zoom = Math.max(2,Math.min(18,Math.round(zoom))); raster.render(); },
    resize() { raster.render(); }
  };
  state.rasterMap = raster;
  updateOfflineAttribution();
  applyPendingLocation();
  $('map-mode').textContent = 'Try online vector';
  plus.addEventListener('click',e=>{e.stopPropagation();state.mapNavigationEpoch++;raster.zoom=Math.min(18,raster.zoom+1);raster.render();});
  minus.addEventListener('click',e=>{e.stopPropagation();state.mapNavigationEpoch++;raster.zoom=Math.max(2,raster.zoom-1);raster.render();});
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
        state.mapNavigationEpoch++;
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
      if (consumeAreaClick(ll[0], ll[1])) return;
      openObservation(ll[1].toFixed(6), ll[0].toFixed(6));
    });
    root.addEventListener('pointercancel',()=>{start=null;});
    root.addEventListener('wheel',e=>{
      if (!state.rasterMap) return;
      e.preventDefault(); state.mapNavigationEpoch++; state.rasterMap.zoom=Math.max(2,Math.min(18,state.rasterMap.zoom+(e.deltaY<0?1:-1)));
      state.rasterMap.render();
    },{passive:false});
  }
  raster.render();
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
  const offlineActive = !!state.rasterMap;
  const text = state.offlineMap
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

document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.jump)));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('manual-entry').addEventListener('click',()=>openObservation());
$('add-discovery').addEventListener('click',()=>openObservation());
$('new-session').addEventListener('click',()=>$('session-dialog').showModal());
$('show-demo-map').addEventListener('change',e => {state.showDemo = e.target.checked;$('show-demo-map-sheet').checked=e.target.checked;updateMap();renderMapSurveyPanel();});
$('map-style').addEventListener('click',()=>{
  state.style = state.style==='liberty'?'dark':'liberty';
  if (state.map) {state.mapReady=false;state.map.setStyle(`https://tiles.openfreemap.org/styles/${state.style}`);}
  if (state.rasterMap) {$('map').classList.toggle('raster-dark',state.style==='dark');}
  $('map-style').textContent=state.style==='dark'?'Street map':'Dark map';
});
$('map-geolocate').addEventListener('click',()=>locateMap(true));
$('map-geolocate-sheet').addEventListener('click',()=>locateMap(true));
$('map-style-sheet').addEventListener('click',()=>$('map-style').click());
$('map-mode-sheet').addEventListener('click',()=>$('map-mode').click());
$('show-demo-map-sheet').addEventListener('change',e=>{ $('show-demo-map').checked=e.target.checked;$('show-demo-map').dispatchEvent(new Event('change')); });
$('map-mode').addEventListener('click',()=>{
  if (!state.rasterMap) {switchToRasterMap('Offline raster/coordinate mode selected.');return;}
  state.preferredView={center:[...state.rasterMap.center],zoom:state.rasterMap.zoom};
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
$('refresh-hardware').addEventListener('click',()=>runAction(async()=>{
  state.hardware = await api('/api/hardware'); const registry = await api('/api/sensors'); state.sensors = registry.sensors; state.serialTransport = registry.serial_transport; renderHardware(); renderSensorRegistry(); renderSerialPorts();
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

// Handheld/touchscreen widths open directly to the primary map workspace.
// Desktop preserves the original overview landing page.
if (window.matchMedia('(max-width: 900px), (max-width: 1400px) and (max-height: 850px) and (pointer: coarse)').matches) showPage('map');
refresh().catch(e=>flash(`Unable to reach local OpenRF server: ${e.message}`,true));
refreshOfflineMaps().catch(e=>{ $('offline-map-status').textContent = `Unable to list local maps: ${e.message}`; });
refreshAreaPlans().catch(e=>{ $('area-saved-detail').textContent = `Saved area plans unavailable: ${e.message}`; });
