/* OpenRF Surveillance: on-entry preview wall; camera capture/recording remains user-controlled. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const MAX_LIVE = 2;
  // Small inline vector icons: consistent on Raspberry Pi even without internet fonts.
  const ICON_PATHS = {
    expand:'<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/>',
    shrink:'<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3m8 0v-3a2 2 0 0 1 2-2h3"/>',
    pause:'<rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/>',
    play:'<path d="m8 5 12 7-12 7V5Z"/>',
    camera:'<path d="M14 5h-4l-2 3H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-4l-2-3Z"/><circle cx="12" cy="14" r="3"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/>',
    activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    minus:'<path d="M5 12h14"/>',
    plus:'<path d="M5 12h14M12 5v14"/>',
    reset:'<path d="M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7"/>',
    move:'<path d="m12 2-3 3h6l-3-3Zm0 20-3-3h6l-3 3ZM2 12l3-3v6l-3-3Zm20 0-3-3v6l3-3Z"/><path d="M12 5v14M5 12h14"/>',
    record:'<circle cx="12" cy="12" r="8" fill="currentColor" stroke="none"/>',
    stop:'<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>'
  };
  const cameraIcon = name => `<svg class="surveillance-ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
  const setCameraIcon = (button, name) => { button.innerHTML = cameraIcon(name); };
  let cameras = [];
  let editing = null;
  const live = new Map();
  const wallTiles = new Map();
  const viewport = new Map(); // Per-camera digital crop. This does not move the camera.
  let latestMedia = [];
  let latestStorage = {};
  let latestMotion = {scans: [], events: []};
  let latestLiveMotionEvents = [];

  const paused = new Set(); // Manual pause only lasts for the current Surveillance visit.
  const usbPreviewResume = new Set(); // Preview was open before USB recording; restore it after stop.
  let autoPreviewInitialized = false;
  const checks = new Map();
  const recording = new Set();
  const recordingInfo = new Map(); // Read-only on-disk progress from backend, not proof of playable MP4.
  const previewState = new Map(); // Requested, first decoded frame, or failed; never infer video success from an HTTP request.
  let motionBusy = false;
  let liveMotion = {state: 'OFF'};
  let activeTab = window.OpenRFWorkspaceTabs?.restore('surveillance', ['overview','cameras','recordings','events','schedules'], 'overview') || 'overview';
  let usbCandidates = [];
  let usbManual = false;
  let alertEnabled = false;
  let lastEventId = null;
  const TAB_NAMES = ['overview', 'cameras', 'recordings', 'events', 'schedules'];
  function selectTab(tab, focus = false) {
    if (!TAB_NAMES.includes(tab)) return;
    const enteringOverview = activeTab !== 'overview' && tab === 'overview';
    if (activeTab === 'overview' && tab !== 'overview') stopView(); // Hidden previews may not keep capturing.
    activeTab = tab;
    window.OpenRFWorkspaceTabs?.remember('surveillance', tab);
    for (const name of TAB_NAMES) {
      const chosen = name === tab;
      const button = $(`surveillance-tab-${name}`);
      button.setAttribute('aria-selected', String(chosen));
      button.tabIndex = chosen ? 0 : -1;
      $(`surveillance-panel-${name}`).hidden = !chosen;
    }
    if (tab === 'cameras') refreshUsb(); // Enumeration only; never opens video devices.
    if (enteringOverview) { paused.clear(); autoPreviewInitialized = false; refresh(); } // User opened the Surveillance preview wall.
    if (focus) $(`surveillance-tab-${tab}`).focus({preventScroll:true});
  }
  for (const name of TAB_NAMES) {
    const button = $(`surveillance-tab-${name}`);
    button.addEventListener('click', () => selectTab(name));
    button.addEventListener('keydown', event => {
      if (!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const i = TAB_NAMES.indexOf(name);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? TAB_NAMES.length-1 :
        (i + (event.key === 'ArrowRight' ? 1 : -1) + TAB_NAMES.length) % TAB_NAMES.length;
      selectTab(TAB_NAMES[next], true);
    });
  }
  function isMonitoring(cameraId) {
    return ['STARTING','MONITORING','STOPPING'].includes(liveMotion.state) && liveMotion.camera_id === cameraId;
  }
  async function stopMonitor(cameraId) {
    if (!cameraId) return;
    try {
      await request(`/api/surveillance/cameras/${cameraId}/motion/stop`, {method:'POST'});
      await refresh();
    } catch(error) { status(`Could not stop motion monitor: ${error.message}`); }
  }
  function showLiveMotion(data) {
    const events = data.events || [];
    latestLiveMotionEvents = events;
    const latest = events.reduce((maximum, item) => Math.max(maximum, Number(item.id) || 0), 0);
    if (lastEventId !== null && alertEnabled) {
      const newest = events.filter(item => Number(item.id) > lastEventId).sort((a,b) => a.id-b.id);
      if (newest.length) {
        const item = newest[newest.length - 1];
        $('surveillance-alert-status').textContent = `New local motion candidate: ${item.camera_name} at ${item.detected_utc}. ${newest.length} new event(s). Motion is not a verified person detection.`;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try { new Notification('OpenRF · Motion candidate', {body:`${item.camera_name} · frame change detected`, tag:'openrf-motion'}); }
          catch (_) { /* Browser/platform may block desktop notifications. In-app status still works. */ }
        }
      }
    }
    lastEventId = Math.max(lastEventId || 0, latest);
    liveMotion = data.status || {state:'OFF'};
    const active = ['STARTING','MONITORING','STOPPING'].includes(liveMotion.state);
    const statusText = `${liveMotion.state}: ${liveMotion.camera_name || 'No selected camera'}. ${liveMotion.detail || ''}` +
      (liveMotion.last_frame_utc ? ` · Last decoded frame ${liveMotion.last_frame_utc}` : '') +
      (active ? ` · Candidates: ${liveMotion.candidates || 0}` : '');
    $('surveillance-live-motion-status').textContent = statusText;
    $('surveillance-live-motion-stop').hidden = !active;
    const list = $('surveillance-live-motion-events'); list.replaceChildren();
    const selected = $('surveillance-events-camera').value;
    const visibleEvents = selected ? events.filter(item=>String(item.camera_id)===selected) : events;
    if (!visibleEvents.length) { const p=document.createElement('p');p.className='small muted';
      p.textContent='No live motion candidates recorded. Monitoring begins only when you explicitly start it.';list.append(p);return; }
    for (const item of visibleEvents) {
      const card=document.createElement('article');card.className='surveillance-motion-scan';
      const text=document.createElement('p');
      text.textContent=`${item.camera_name} · ${item.detected_utc} · ${(item.changed_fraction*100).toFixed(1)}% sampled pixels changed · ${item.action.replaceAll('_',' ').toLowerCase()} (not person detection)`;
      card.append(text);
      if (item.recording_id && item.action === 'MEDIA_SAVED' && item.source_available) {
        const link=document.createElement('a');link.className='btn outline';link.textContent='Open saved clip';
        link.href=`/api/surveillance/recordings/${item.recording_id}/file`;
        link.rel='noopener';link.target='_blank';card.append(link);
      }
      if (item.action === 'MEDIA_SAVED' && !item.source_available) {
        const missing=document.createElement('p');missing.className='small muted';missing.textContent='Source clip is no longer available in local storage.';card.append(missing);
      }
      list.append(card);
    }
  }
  $('surveillance-add-camera').addEventListener('click',()=> {selectTab('cameras');$('surveillance-name').focus();});
  $('surveillance-live-motion-stop').addEventListener('click',()=>stopMonitor(liveMotion.camera_id));
  $('surveillance-live-motion-refresh').addEventListener('click',refresh);
  const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function request(url, options) {
    const response = await fetch(url, {cache: 'no-store', ...options});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  }
  const status = text => { $('surveillance-status').textContent = text; };
  function overviewVisible() {
    return activeTab === 'overview' && $('page-surveillance').classList.contains('active');
  }
  function updateFullscreenLabels() {
    const full = document.fullscreenElement;
    const wall = $('surveillance-viewer');
    $('surveillance-fullscreen').textContent = full === wall ? 'Exit grid' : 'Expand grid';
    $('surveillance-fullscreen').setAttribute('aria-label', full === wall ? 'Exit fullscreen camera grid' : 'Expand the active camera grid');
    for (const tile of wallTiles.values()) {
      const button = tile.querySelector('[data-feed-fullscreen]');
      setCameraIcon(button, full === tile ? 'shrink' : 'expand');
      button.title = full === tile ? 'Exit full screen' : 'Expand camera';
      button.setAttribute('aria-label', `${full === tile ? 'Exit full screen for' : 'Full screen for'} ${tile.dataset.cameraName}`);
    }
  }
  async function toggleFullscreen(target) {
    try {
      if (document.fullscreenElement === target) {
        if (document.exitFullscreen) await document.exitFullscreen();
      } else if (target.requestFullscreen) await target.requestFullscreen();
      updateFullscreenLabels();
    } catch (_) { status('Full screen is unavailable in this window.'); }
  }
  function updateLiveHeader() {
    $('surveillance-viewer').hidden = false; // Add camera remains reachable for an empty library.
    $('surveillance-live-title').textContent = `Cameras · ${live.size} preview${live.size === 1 ? '' : 's'} requested`;
    $('surveillance-fullscreen').hidden = live.size < 2; // Grid fullscreen only makes sense with multiple active previews.
    $('surveillance-live-grid').classList.toggle('has-multiple', live.size > 1);
    $('surveillance-live-status').textContent = live.size ?
      `${live.size} preview(s) requested. Previewing is separate from recording; ${recording.size} active recording(s) currently reported.` :
      'All previews paused. No camera feed is being requested by this wall.';
    updateFullscreenLabels();
  }
  function updateWallTile(camera) {
    const pane = wallTiles.get(camera.id);
    if (!pane) return;
    pane.dataset.cameraName = camera.name;
    pane.querySelector('[data-feed-name]').textContent = camera.name;
    pane.querySelector('[data-feed-type]').textContent = `${camera.type} · ${camera.host}`;
    if (camera.type !== 'USB') pane.querySelector('[data-feed-device-ptz]').hidden = true;
    pane.querySelector('[data-feed-ptz-toggle]').hidden = camera.type !== 'USB';
    const viewing = live.has(camera.id);
    const monitor = isMonitoring(camera.id);
    const blocked = ['STARTING','MONITORING','STOPPING'].includes(liveMotion.state) && !monitor;
    setCameraIcon(pane.querySelector('[data-feed-view]'), viewing ? 'pause' : 'play');
    pane.querySelector('[data-feed-view]').title = viewing ? 'Pause camera preview' : 'Resume camera preview';
    pane.querySelector('[data-feed-view]').setAttribute('aria-label', `${viewing ? 'Pause preview for' : 'View live from'} ${camera.name}`);
    setCameraIcon(pane.querySelector('[data-feed-record]'), recording.has(camera.id) ? 'stop' : 'record');
    pane.querySelector('[data-feed-record]').title = recording.has(camera.id) ? 'Stop and save recording' : 'Start local recording';
    pane.querySelector('[data-feed-record]').setAttribute('aria-pressed', String(recording.has(camera.id)));
    pane.querySelector('[data-feed-view]').disabled = false; // USB recording shares its capture reader with preview.
    pane.querySelector('[data-feed-snapshot]').disabled = recording.has(camera.id) && camera.type === 'USB';
    pane.querySelector('[data-feed-record]').setAttribute('aria-label', `${recording.has(camera.id) ? 'Stop and save recording for' : 'Start recording from'} ${camera.name}`);
    setCameraIcon(pane.querySelector('[data-feed-motion]'), monitor ? 'stop' : 'activity');
    pane.querySelector('[data-feed-motion]').title = monitor ? 'Stop motion-triggered clips' : 'Start motion-triggered clips (opt-in)';
    pane.querySelector('[data-feed-motion]').setAttribute('aria-label', `${monitor ? 'Stop' : 'Start'} motion clips for ${camera.name}`);
    pane.querySelector('[data-feed-motion]').setAttribute('aria-pressed', String(monitor));
    pane.querySelector('[data-feed-motion]').disabled = blocked;
    const media = recordingInfo.get(camera.id);
    const capture = recording.has(camera.id);
    pane.querySelector('[data-feed-view]').title = viewing ? 'Pause preview' : 'Resume preview';
    pane.querySelector('[data-feed-record-status]').textContent = capture ? (media && media.bytes > 0 ? 'REC · WRITING FILE' : 'REC · STARTING') : viewing ? ({READY:'LIVE FRAMES',FAILED:'PREVIEW FAILED'}[previewState.get(camera.id)] || 'PREVIEW REQUESTED') : 'PREVIEW PAUSED';
    pane.querySelector('[data-feed-rec-badge]').textContent = capture ? (media && media.bytes > 0 ? '● REC · UNFINALIZED' : '● REC · STARTING') : '';
    pane.querySelector('[data-feed-rec-badge]').hidden = !capture;
    pane.querySelector('[data-feed-zoom-label]').textContent = `${Number(cropState(camera.id).zoom.toFixed(2))}×`;
    pane.querySelector('[data-feed-zoom-label]').hidden = cropState(camera.id).zoom <= 1;
    pane.classList.toggle('is-live', viewing);
    pane.classList.toggle('is-recording', recording.has(camera.id));
    if (!viewing) {
      pane.querySelector('[data-feed-placeholder]').hidden = false;
      pane.querySelector('[data-feed-placeholder]').textContent = recording.has(camera.id) && camera.type === 'USB' ?
        'Preview paused. Recording can continue without live viewing.' : paused.has(camera.id) ?
        'Preview paused. Select View live to resume.' :
        'Preview inactive. Up to two cameras can show live frames at once.';
      pane.querySelector('[data-feed-note]').textContent = 'Not connected or tested by this preview.';
    } else {
      pane.querySelector('[data-feed-placeholder]').hidden = true;
    }
    updateFullscreenLabels();
  }
  async function toggleRecording(camera, button) {
    button.disabled = true;
    const stopping = recording.has(camera.id);
    const needsPreviewPause = !stopping && camera.type === 'USB' && live.has(camera.id);
    if (needsPreviewPause) {
      usbPreviewResume.add(camera.id);
      stopView(camera.id); // Release old USB reader; recorder will provide its OWN preview from one capture.
    }
    try {
      const result = await request(`/api/surveillance/cameras/${camera.id}/${stopping ? 'stop' : 'record'}`, {method:'POST'});
      if (stopping) {
        recording.delete(camera.id);
        status(result.state === 'STOPPED' ? `Recording saved for ${camera.name} (${result.bytes} bytes). Open History to play or download.` :
          `Recording ended with ${result.state || 'unknown'} status. See History for details; no playable video is assumed.`);
      } else {
        recording.add(camera.id);
        status(`Capture requested for ${camera.name}. Stop & save finalizes the MP4. USB preview now uses the recording's shared capture.`);
      }
      await refresh();
      if (!stopping && needsPreviewPause && usbPreviewResume.has(camera.id) && overviewVisible()) view(camera);
      if (stopping && camera.type === 'USB') {
        usbPreviewResume.delete(camera.id);
        if (overviewVisible() && live.has(camera.id)) { stopView(camera.id); view(camera); }
      }
    } catch(error) {
      status(`Recording action failed: ${error.message}`);
      if (needsPreviewPause && usbPreviewResume.delete(camera.id) && overviewVisible()) view(camera);
    } finally { button.disabled = false; }
  }
  async function toggleMotion(camera, button, showEvents=false) {
    const stopping = isMonitoring(camera.id);
    if (!stopping && !confirm(`Enable motion-triggered recording for ${camera.name}? OpenRF will analyze frame changes and may save local 20-second clips, for up to 20 minutes. Changes do not prove a person was detected. Stop whenever you choose.`)) return;
    button.disabled = true;
    try {
      if (stopping) await request(`/api/surveillance/cameras/${camera.id}/motion/stop`, {method:'POST'});
      else await request(`/api/surveillance/cameras/${camera.id}/motion/start`, {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({sensitivity:$('surveillance-live-motion-sensitivity').value})});
      if (showEvents) selectTab('events');
      await refresh();
    } catch(error) { status(`Motion monitor action failed: ${error.message}`); }
    finally { button.disabled=false; }
  }
  async function captureSnapshot(camera, button) {
    button.disabled = true;
    const resume = camera.type === 'USB' && live.has(camera.id);
    if (resume) stopView(camera.id);
    try {
      await request(`/api/surveillance/cameras/${camera.id}/snapshot`,{method:'POST'});
      status(`Screenshot saved for ${camera.name}. See Recordings to download it.`);
      await refresh();
    } catch(error) { status(`Screenshot failed: ${error.message}`); }
    finally {
      button.disabled = false;
      if (resume && overviewVisible() && !recording.has(camera.id)) view(camera);
    }
  }
  function cropState(id) {
    if (!viewport.has(id)) viewport.set(id, {zoom:1, x:0, y:0});
    return viewport.get(id);
  }
  function applyCrop(cameraId) {
    const pane = wallTiles.get(cameraId);
    if (!pane) return;
    const state = cropState(cameraId);
    // With the image filling its viewport (object-fit: cover), translations beyond
    // half the extra scaled size reveal empty background. Clamp both axes.
    const limit = 50 * (state.zoom - 1);
    state.x = Math.max(-limit, Math.min(limit, state.x));
    state.y = Math.max(-limit, Math.min(limit, state.y));
    pane.querySelector('img').style.transform = `translate(${state.x}%, ${state.y}%) scale(${state.zoom})`;
    pane.querySelector('[data-feed-zoom-label]').textContent = `${Number(state.zoom.toFixed(2))}×`;
    pane.querySelector('[data-feed-zoom-label]').hidden = state.zoom <= 1;
    pane.querySelector('[data-feed-zoom-reset]').disabled = state.zoom === 1 && !state.x && !state.y;
    pane.querySelector('[data-feed-media]').classList.toggle('is-zoomed', state.zoom > 1);
  }
  function zoomCrop(cameraId, direction) {
    const state = cropState(cameraId);
    state.zoom = Math.max(1, Math.min(3, Math.round((state.zoom + direction * 0.25)*100)/100));
    if (state.zoom === 1) { state.x=0; state.y=0; }
    applyCrop(cameraId);
  }
  function resetCrop(cameraId) {
    viewport.set(cameraId,{zoom:1,x:0,y:0}); applyCrop(cameraId);
  }
  async function readDevicePTZ(camera, pane) {
    const line = pane.querySelector('[data-feed-device-status]');
    line.textContent = 'Checking USB camera controls on request…';
    try {
      const result = await request(`/api/surveillance/cameras/${camera.id}/ptz`);
      pane._devicePTZ = result;
      const controls = result.controls || {};
      for (const button of pane.querySelectorAll('[data-feed-ptz-axis]')) {
        button.disabled = !controls[button.dataset.feedPtzAxis];
      }
      const available = Object.keys(controls).join(', ');
      line.textContent = available ? `Device-reported: ${available}. Movement may be electronic, not motorized.` : (result.detail || 'Camera PTZ is not supported.');
    } catch (error) { line.textContent = `Cannot inspect device controls: ${error.message}`; }
  }
  async function moveDevicePTZ(camera, pane, button) {
    const line = pane.querySelector('[data-feed-device-status]');
    button.disabled = true;
    try {
      const result = await request(`/api/surveillance/cameras/${camera.id}/ptz`, {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({axis:button.dataset.feedPtzAxis, step:Number(button.dataset.feedPtzStep)})});
      line.textContent = `${button.dataset.feedPtzAxis}: ${result.value} (device control applied; physical movement not verified)`;
    } catch(error) { line.textContent = `Device control failed: ${error.message}`; }
    finally { button.disabled = false; }
  }
  function ensureWallTile(camera) {
    if (wallTiles.has(camera.id)) return wallTiles.get(camera.id);
    const pane = document.createElement('article');
    pane.className = 'surveillance-feed';
    pane.dataset.cameraName = camera.name;
    pane.setAttribute('aria-label', `Camera preview and recording controls for ${camera.name}`);
    pane.innerHTML = `<div class="surveillance-feed-heading"><div class="surveillance-feed-ident"><strong data-feed-name></strong><span class="small muted" data-feed-type></span></div>
      <span class="surveillance-recording-indicator" data-feed-record-status>PREVIEW PAUSED</span></div>
      <div class="surveillance-feed-media" data-feed-media><img alt="Camera frames (video may be unavailable)" draggable="false" />
      <div class="surveillance-feed-placeholder" data-feed-placeholder>Preview inactive</div>
      <div class="surveillance-overlay-top"><span class="surveillance-video-rec" data-feed-rec-badge hidden></span>
        <button class="surveillance-overlay-button surveillance-expand" type="button" data-feed-fullscreen aria-label="Expand camera" title="Expand camera">${cameraIcon('expand')}</button></div>
      <div class="surveillance-overlay-bottom" role="group" aria-label="Camera live controls">
        <button class="surveillance-overlay-button surveillance-motion-button" type="button" data-feed-motion title="Start motion clips" aria-label="Start motion-triggered clips">${cameraIcon('activity')}</button>
        <button class="surveillance-overlay-button" type="button" data-feed-snapshot title="Save snapshot" aria-label="Save snapshot">${cameraIcon('camera')}</button>
        <button class="surveillance-overlay-button surveillance-record-circle" type="button" data-feed-record aria-label="Start recording" title="Start recording">${cameraIcon('record')}</button>
        <button class="surveillance-overlay-button" type="button" data-feed-view title="Pause preview" aria-label="Pause preview">${cameraIcon('pause')}</button>
        <button class="surveillance-overlay-button" type="button" data-feed-history title="Camera history" aria-label="Camera history">${cameraIcon('history')}</button>
      </div>
      <div class="surveillance-overlay-zoom" role="group" aria-label="Digital zoom and camera movement">
        <button class="surveillance-overlay-button" type="button" data-feed-zoom-out title="Digital zoom out" aria-label="Digital zoom out">${cameraIcon('minus')}</button>
        <span class="surveillance-zoom-display" data-feed-zoom-label hidden>1×</span>
        <button class="surveillance-overlay-button" type="button" data-feed-zoom-in title="Digital zoom in" aria-label="Digital zoom in">${cameraIcon('plus')}</button>
        <button class="surveillance-overlay-button" type="button" data-feed-zoom-reset title="Reset digital zoom" aria-label="Reset digital zoom">${cameraIcon('reset')}</button>
        <button class="surveillance-overlay-button" type="button" data-feed-ptz-toggle title="Device pan, tilt and zoom" aria-label="Show device pan tilt zoom controls">${cameraIcon('move')}</button>
      </div>
      <details class="surveillance-device-ptz surveillance-ptz-overlay" data-feed-device-ptz hidden><summary>Device pan / tilt / zoom</summary>
        <p class="small muted" data-feed-device-status>Expand to inspect supported USB controls; movement is not guaranteed.</p>
        <div class="surveillance-camera-tools-row" role="group" aria-label="Device controls">
          <button class="btn outline" type="button" data-feed-ptz-axis="pan" data-feed-ptz-step="-1" aria-label="Device pan left" disabled>◀</button>
          <button class="btn outline" type="button" data-feed-ptz-axis="pan" data-feed-ptz-step="1" aria-label="Device pan right" disabled>▶</button>
          <button class="btn outline" type="button" data-feed-ptz-axis="tilt" data-feed-ptz-step="1" aria-label="Device tilt up" disabled>▲</button>
          <button class="btn outline" type="button" data-feed-ptz-axis="tilt" data-feed-ptz-step="-1" aria-label="Device tilt down" disabled>▼</button>
          <button class="btn outline" type="button" data-feed-ptz-axis="zoom" data-feed-ptz-step="1" disabled>Zoom +</button>
          <button class="btn outline" type="button" data-feed-ptz-axis="zoom" data-feed-ptz-step="-1" disabled>Zoom −</button></div></details></div>
      <details class="surveillance-camera-tools"><summary>Recording and motion notes</summary>
        <div class="surveillance-camera-tools-inner"><p class="small muted">Motion clips require explicit opt-in and use frame changes, not person detection. Stop & save finalizes MP4. For manual USB recordings, OpenRF switches to a shared capture that can supply live preview and MP4 simultaneously. Some USB camera drivers may still fail; check actual frames and saved video. Digital zoom only changes the display.</p></div></details>
      <p class="small muted surveillance-feed-note" role="status" data-feed-note>Not connected.</p>`;
    pane.querySelector('[data-feed-fullscreen]').addEventListener('click', () => toggleFullscreen(pane));
    pane.querySelector('[data-feed-view]').addEventListener('click', () => live.has(camera.id) ? stopView(camera.id, true) : view(camera));
    pane.querySelector('[data-feed-record]').addEventListener('click', event => toggleRecording(camera, event.currentTarget));
    pane.querySelector('[data-feed-history]').addEventListener('click', () => {
      $('surveillance-recordings-camera').value = String(camera.id);
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{});
      selectTab('recordings'); showRecordings(latestMedia, latestStorage);
    });
    pane.querySelector('[data-feed-snapshot]').addEventListener('click', event => captureSnapshot(camera, event.currentTarget));
    pane.querySelector('[data-feed-motion]').addEventListener('click', event => toggleMotion(camera, event.currentTarget));
    pane.querySelector('[data-feed-zoom-in]').addEventListener('click', () => zoomCrop(camera.id,1));
    pane.querySelector('[data-feed-zoom-out]').addEventListener('click', () => zoomCrop(camera.id,-1));
    pane.querySelector('[data-feed-zoom-reset]').addEventListener('click', () => resetCrop(camera.id));
    pane.querySelector('[data-feed-ptz-toggle]').addEventListener('click', () => {
      const ptz = pane.querySelector('[data-feed-device-ptz]');
      if (ptz.open) ptz.open = false;
      else {ptz.hidden = false; ptz.open = true;}
    });
    let drag = null;
    const media = pane.querySelector('[data-feed-media]');
    media.addEventListener('pointerdown', event => {
      if (cropState(camera.id).zoom <= 1 || event.target !== pane.querySelector('img')) return;
      drag = {id:event.pointerId,x:event.clientX,y:event.clientY};
      if (media.setPointerCapture) media.setPointerCapture(event.pointerId);
    });
    media.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const state = cropState(camera.id);
      const width = media.clientWidth || 1, height = media.clientHeight || 1;
      state.x += 100 * (event.clientX - drag.x) / width;
      state.y += 100 * (event.clientY - drag.y) / height;
      drag.x = event.clientX; drag.y = event.clientY; applyCrop(camera.id);
    });
    media.addEventListener('pointerup',()=>{drag=null;});
    media.addEventListener('pointercancel',()=>{drag=null;});
    pane.querySelector('[data-feed-device-ptz]').hidden = true;
    pane.querySelector('[data-feed-ptz-toggle]').hidden = camera.type !== 'USB';
    pane.querySelector('[data-feed-device-ptz]').addEventListener('toggle', event => {
      if (event.currentTarget.open) readDevicePTZ(camera,pane);
      else event.currentTarget.hidden = true;
    });
    for (const button of pane.querySelectorAll('[data-feed-ptz-axis]')) {
      button.addEventListener('click',()=>moveDevicePTZ(camera,pane,button));
    }
    wallTiles.set(camera.id, pane);
    $('surveillance-live-grid').append(pane);
    applyCrop(camera.id);
    updateWallTile(camera);
    return pane;
  }
  function reconcileWall() {
    const placeholder = $('surveillance-live-grid').querySelector('[data-wall-empty]');
    if (placeholder) placeholder.remove();
    if (!cameras.length) {
      const empty = document.createElement('p'); empty.className='small muted';
      empty.setAttribute('data-wall-empty','');
      empty.textContent='No cameras saved. Choose Add camera to select a Linux USB webcam or configure an RTSP camera.';
      $('surveillance-live-grid').append(empty);
    }
    for (const [id, tile] of wallTiles) {
      if (!cameras.some(camera => camera.id === id)) {
        stopView(id);
        tile.remove(); wallTiles.delete(id); paused.delete(id); viewport.delete(id);
      }
    }
    for (const camera of cameras) {
      // Keep active img elements mounted across inventory refresh: moving/rebuilding them cancels MJPEG.
      ensureWallTile(camera);
      updateWallTile(camera);
    }
    updateLiveHeader();
  }
  function stopView(id, manual = false) {
    const ids = id === undefined ? Array.from(live.keys()) : [id];
    if (manual && id === undefined) for (const camera of cameras) paused.add(camera.id);
    for (const cameraId of ids) {
      if (manual) paused.add(cameraId);
      const pane = live.get(cameraId);
      if (!pane) continue;
      // Cancel the MJPEG HTTP request, but retain the tile and its controls.
      pane.querySelector('img').removeAttribute('src');
      live.delete(cameraId);
      const camera = cameras.find(item => item.id === cameraId);
      previewState.delete(cameraId);
      if (camera) updateWallTile(camera);
    }
    updateLiveHeader();
    showInventory();
  }
  function autoStartPreviews() {
    // Opening Surveillance Overview is the user's viewing action. Never start on the general app Overview.
    if (!overviewVisible() || autoPreviewInitialized) return;
    autoPreviewInitialized = true;
    for (const camera of cameras) {
      if (live.size >= MAX_LIVE) break;
      if (!paused.has(camera.id) && !live.has(camera.id)) view(camera);
    }
  }
  function showInventory() {
    const grid = $('surveillance-grid');
    grid.replaceChildren();
    if (!cameras.length) {
      grid.innerHTML = '<p class="small muted">No saved cameras. Open Cameras to choose a detected Linux USB webcam or enter a private RTSP stream; no camera will connect automatically.</p>';
      return;
    }
    cameras.forEach(camera => {
      const viewing = live.has(camera.id);
      const monitoring = isMonitoring(camera.id);
      const otherMonitor = ['STARTING','MONITORING','STOPPING'].includes(liveMotion.state) && !monitoring;
      const tile = document.createElement('article');
      tile.className = 'surveillance-tile';
      const check = checks.get(camera.id);
      tile.innerHTML = `<div class="panel-title"><h3>${escapeHtml(camera.name)}</h3><span class="pill">${viewing ? 'REQUESTED' : 'NOT CHECKED'}</span></div>
        <p class="small muted">${escapeHtml(camera.type)} · ${escapeHtml(camera.host)} · ${viewing ? 'Preview requested; see feed status below' : 'No current connection or battery status verified'}</p>
        <p class="small muted" role="status" data-check-status>${check ? escapeHtml(check) : 'Diagnostics not run. Check is manual.'}</p>
        <div class="button-line"><button class="btn outline" type="button" data-action="probe">Test connection</button><button class="btn primary" type="button" data-action="view">${viewing ? 'Stop live' : 'View live'}</button>
        <button class="btn outline" type="button" data-action="record">${recording.has(camera.id) ? 'Stop recording' : 'Start recording'}</button>
        <button class="btn outline" type="button" data-action="motion" ${otherMonitor ? 'disabled' : ''}>${monitoring ? 'Stop motion monitor' : 'Start motion + clips'}</button>
        <button class="btn outline" type="button" data-action="snapshot">Screenshot</button>
        <button class="btn outline" type="button" data-action="edit">Edit</button>
        <button class="btn outline" type="button" data-action="delete">Remove</button></div>`;
      tile.querySelector('[data-action=probe]').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        checks.set(camera.id, 'Checking on request…');
        tile.querySelector('[data-check-status]').textContent = checks.get(camera.id);
        try {
          const info = await request(`/api/surveillance/cameras/${camera.id}/probe`, {method: 'POST'});
          const dimensions = info.width && info.height ? ` · ${info.width}×${info.height}` : '';
          checks.set(camera.id, `${info.state}: ${info.detail}${info.codec ? ' · ' + info.codec : ''}${dimensions}`);
        } catch (error) {
          checks.set(camera.id, `CHECK FAILED: ${error.message}`);
        }
        tile.querySelector('[data-check-status]').textContent = checks.get(camera.id);
        button.disabled = false;
      });
      tile.querySelector('[data-action=view]').addEventListener('click', () => {if(viewing) stopView(camera.id,true); else {selectTab('overview');view(camera);}});
      tile.querySelector('[data-action=record]').addEventListener('click', event => toggleRecording(camera,event.currentTarget));
      tile.querySelector('[data-action=motion]').addEventListener('click', event => toggleMotion(camera,event.currentTarget,true));
      tile.querySelector('[data-action=snapshot]').addEventListener('click', event => captureSnapshot(camera,event.currentTarget));
      tile.querySelector('[data-action=edit]').addEventListener('click', () => {
        $('surveillance-source').value = camera.type;
        updateSource();
        $('surveillance-usb').value = camera.type === 'USB' ? camera.host : '';
        if (camera.type === 'USB') {
          if (!usbCandidates.some(device => device.path === camera.host)) {usbManual=true;showUsbManual();}
          else {$('surveillance-usb-choice').value = camera.host;}
        }
        editing = camera.id;
        $('surveillance-name').value = camera.name;
        $('surveillance-url').value = '';
        $('surveillance-url').required = false;
        $('surveillance-url').placeholder = 'Leave empty to keep existing private RTSP URL';
        $('surveillance-save').textContent = 'Save camera changes';
        $('surveillance-cancel').hidden = false;
        selectTab('cameras');
        $('surveillance-name').focus();
      });
      tile.querySelector('[data-action=delete]').addEventListener('click', async () => {
        if (recording.has(camera.id) || isMonitoring(camera.id)) { status('Stop recording and live motion monitoring before removing this camera.'); return; }
        if (!confirm(`Remove ${camera.name} from OpenRF?`)) return;
        stopView(camera.id);
        checks.delete(camera.id);
        try { await request(`/api/surveillance/cameras/${camera.id}`, {method: 'DELETE'}); await refresh(); }
        catch (error) { status(error.message); }
      });
      grid.append(tile);
    });
  }
  function view(camera) {
    if (live.has(camera.id)) return;
    if (!overviewVisible()) return;
    // USB recordings can now provide their own preview stream without a second V4L2 reader.
    if (live.size >= MAX_LIVE) {
      status(`Only ${MAX_LIVE} concurrent previews are supported. Pause a feed before opening another.`);
      return;
    }
    const pane = ensureWallTile(camera);
    const image = pane.querySelector('img');
    const note = pane.querySelector('[data-feed-note]');
    paused.delete(camera.id);
    live.set(camera.id, pane);
    previewState.set(camera.id,'REQUESTED');
    note.textContent = `Opening ${camera.type === 'USB' ? 'USB (V4L2)' : 'RTSP'} preview. Waiting for real camera frames…`;
    image.alt = `Live frames from ${camera.name} (preview; recording is independently controlled)`;
    image.onload = () => {
      if (live.get(camera.id) === pane) { previewState.set(camera.id,'READY'); note.textContent = 'Video frames received (up to 2 fps). Recording is controlled separately.';updateWallTile(camera);}
    };
    image.onerror = () => {
      if (live.get(camera.id) === pane) {previewState.set(camera.id,'FAILED');note.textContent =
        `Preview failed or unavailable. Check ${camera.type === 'USB' ? 'Linux webcam access and video format' : 'camera network, RTSP URL'}, and FFmpeg. This does not tell you whether a separately requested recording succeeded.`;updateWallTile(camera);}
    };
    updateWallTile(camera);
    updateLiveHeader();
    image.src = `/api/surveillance/cameras/${camera.id}/live`;
  }
  function updateCameraFilters() {
    for (const id of ['surveillance-recordings-camera','surveillance-events-camera']) {
      const select = $(id), previous = select.value;
      select.replaceChildren();
      const any = document.createElement('option'); any.value = ''; any.textContent = 'All cameras'; select.append(any);
      for (const camera of cameras) {
        const option = document.createElement('option'); option.value = String(camera.id); option.textContent = camera.name; select.append(option);
      }
      if (previous && cameras.some(camera => String(camera.id) === previous)) select.value = previous;
    }
  }
  $('surveillance-recordings-camera').addEventListener('change',()=>showRecordings(latestMedia, latestStorage));
  $('surveillance-events-camera').addEventListener('change',()=>{
    showMotionHistory(latestMotion); showLiveMotion({status:liveMotion,events:latestLiveMotionEvents});
  });
  async function refresh() {
    try {
      const data = await request('/api/surveillance');
      cameras = data.cameras || [];
      updateCameraFilters();
      for (const id of checks.keys()) if (!cameras.some(camera => camera.id === id)) checks.delete(id);
      // Inventory requests are local. The selected Surveillance Overview may open previews after it renders.
      for (const id of Array.from(live.keys())) if (!cameras.some(camera => camera.id === id)) stopView(id);
      showLiveMotion(data.live_motion || {status:{state:'OFF'},events:[]});
      showInventory();
      reconcileWall();
      showMotionHistory(data.motion || {scans: [], events: []});
      $('surveillance-capabilities').textContent = `FFmpeg: ${data.capabilities.ffmpeg}. On-demand preview: ${data.capabilities.rtsp_mjpeg_preview ? 'available (2 feeds)' : 'unavailable'}. RTSP diagnostics: ${data.capabilities.rtsp_diagnostics ? 'available' : 'ffprobe missing'}. USB devices found: ${data.capabilities.usb_devices.length}. Live motion monitoring is opt-in, one camera and a maximum 20-minute session. ONVIF, Bluetooth pairing and battery telemetry remain unsupported. Saved-video motion review is manual.`;
      renderUsb(data.capabilities.usb_candidates || []);
      recording.clear(); recordingInfo.clear();
      for (const item of data.recordings || []) if (item.state === 'RECORDING') { recording.add(item.camera_id); recordingInfo.set(item.camera_id,item); }
      // v0.2.191: The recorder now supplies preview frames from its OWN USB reader.
      // Do NOT stop that MJPEG request here: doing so on every status poll was
      // the reason the camera stayed "Preview paused" throughout recording.
      // If an unrelated device loses access, the real stream error is displayed.
      for (const cameraId of [...usbPreviewResume]) if (!recording.has(cameraId)) {
        usbPreviewResume.delete(cameraId);
        const camera = cameras.find(item => item.id === cameraId);
        if (camera && overviewVisible() && !paused.has(cameraId)) view(camera);
      }
      showInventory();
      reconcileWall();
      autoStartPreviews();
      showRecordings(data.recordings || [], data.storage || {});
      showSchedules(data.schedules || {armed:false,schedules:[]});
      status(`${cameras.length} saved camera(s). ${overviewVisible() ? 'Surveillance Overview requests up to two live previews.' : 'No camera previews requested by this tab.'}`);
    } catch (error) { status(`Cannot read local camera inventory: ${error.message}`); }
  }
  function resetForm() {
    editing = null;
    $('surveillance-form').reset();
    $('surveillance-source').value = 'RTSP';
    updateSource();
    $('surveillance-url').placeholder = 'rtsp://192.168.1.50:554/stream1';
    $('surveillance-usb-choice').value=''; $('surveillance-usb').value='';
    usbManual = false; showUsbManual();
    $('surveillance-save').textContent = 'Add camera';
    $('surveillance-cancel').hidden = true;
  }
  $('surveillance-form').addEventListener('submit', async event => {
    event.preventDefault();
    const id = editing;
    const payload = {name: $('surveillance-name').value};
    payload.source_type = $('surveillance-source').value;
    if (payload.source_type === 'USB') payload.usb_device = (usbManual ? $('surveillance-usb').value : $('surveillance-usb-choice').value).trim();
    else if (!id || $('surveillance-url').value.trim()) payload.rtsp_url = $('surveillance-url').value.trim();
    try {
      // A changed RTSP URL must not leave a previous stream running.
      if (id) { stopView(id); checks.delete(id); }
      await request(id ? `/api/surveillance/cameras/${id}` : '/api/surveillance/cameras',
        {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      resetForm(); selectTab('overview'); await refresh();
    } catch (error) { status(`Camera not saved: ${error.message}`); }
  });
  function updateSource() {
    const rtsp = $('surveillance-source').value === 'RTSP';
    $('surveillance-rtsp-field').hidden = !rtsp;
    $('surveillance-usb-field').hidden = rtsp;
    $('surveillance-url').required = rtsp && !editing;
    $('surveillance-usb').required = !rtsp && usbManual;
    $('surveillance-usb-choice').required = !rtsp && !usbManual;
  }
  let selectedRecordingId = null;
  let renderedRecordingKey = ''; // Keep video DOM alive when a status poll refreshes the table.
  const mediaSize = size => Number.isFinite(size) ? (size > 0 && size < 104858 ? `${(size/1024).toFixed(1)} KiB` : `${(size / 1048576).toFixed(1)} MiB`) : 'unknown';
  function showRecordingDetail(entry) {
    const detail = $('surveillance-recording-detail');
    const key = entry ? `${entry.id}:${entry.state}:${entry.bytes}:${entry.kind}` : '';
    if (renderedRecordingKey === key && detail.childElementCount) return;
    renderedRecordingKey = key;
    detail.replaceChildren();
    if (!entry) { detail.hidden = true; return; }
    detail.hidden = false;
    const head = document.createElement('div'); head.className = 'surveillance-detail-heading';
    const title = document.createElement('h4'); title.textContent = `${entry.kind === 'image' ? 'Snapshot' : 'Recording'} · ${entry.camera_name}`;
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn outline'; close.textContent = 'Close preview';
    close.addEventListener('click', () => { selectedRecordingId = null; renderedRecordingKey = ''; showRecordings(latestMedia, latestStorage); });
    head.append(title, close); detail.append(head);
    const description = document.createElement('p'); description.className = 'small muted';
    description.textContent = `${entry.started_utc} · ${entry.state} · ${mediaSize(entry.bytes)}`; detail.append(description);
    const finished = ['STOPPED','FINISHED'].includes(entry.state) && entry.bytes > 0;
    if (finished) {
      if (entry.kind === 'video') {
        const player = document.createElement('video'); player.className = 'surveillance-selected-player';
        player.controls = true; player.preload = 'metadata'; player.playsInline = true;
        player.src = `/api/surveillance/recordings/${entry.id}/file`;
        detail.append(player);
      } else {
        const image = document.createElement('img'); image.className = 'surveillance-selected-image';
        image.alt = `Saved snapshot from ${entry.camera_name}`;
        image.src = `/api/surveillance/recordings/${entry.id}/file`; detail.append(image);
      }
    } else {
      const note = document.createElement('p'); note.className = 'small muted';
      note.textContent = entry.state === 'RECORDING' ? 'Recording is still being written. Stop & save before playback or download.' :
        'No playable finalized media is available for this entry; it may have failed or been interrupted.';
      detail.append(note);
    }
    const actions = document.createElement('div'); actions.className = 'surveillance-detail-actions';
    const left = document.createElement('div'); left.className = 'surveillance-recording-actions-left';
    const right = document.createElement('div'); right.className = 'surveillance-recording-actions-right';
    if (entry.state === 'RECORDING') {
      const stop = document.createElement('button'); stop.type='button'; stop.className='btn surveillance-stop-save'; stop.textContent='Stop & save';
      stop.addEventListener('click', async () => {
        stop.disabled = true; try { await request(`/api/surveillance/cameras/${entry.camera_id}/stop`,{method:'POST'}); await refresh(); }
        catch (error) { status(`Could not stop recording: ${error.message}`); stop.disabled=false; }
      }); right.append(stop);
    }
    if (finished) {
      if (entry.kind === 'video') {
        const scan = document.createElement('button'); scan.type='button'; scan.className='btn outline'; scan.textContent='Scan for motion'; scan.disabled=motionBusy;
        scan.addEventListener('click', async () => {
          if(motionBusy) return; motionBusy=true; scan.disabled=true;
          const setting=$('surveillance-motion-sensitivity').value;
          $('surveillance-motion-status').textContent=`Reviewing the first five minutes of ${entry.camera_name} using ${setting} sensitivity… No camera will be contacted.`;
          try {
            const result=await request(`/api/surveillance/recordings/${entry.id}/motion-scan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sensitivity:setting})});
            $('surveillance-motion-status').textContent=`Scan complete: ${result.event_count} motion candidate(s) in ${result.sampled_seconds.toFixed(1)} sampled seconds from ${entry.camera_name}.`;
          } catch(error) { $('surveillance-motion-status').textContent=`Saved-video motion scan failed: ${error.message}`; }
          finally { motionBusy=false; selectTab('events'); await refresh(); }
        }); left.append(scan);
      }
      const download=document.createElement('a'); download.className='btn outline'; download.textContent='Download file';
      download.href=`/api/surveillance/recordings/${entry.id}/file?download`; download.rel='noopener'; download.target='_blank'; right.append(download);
    }
    if (entry.state !== 'RECORDING' && entry.state !== 'CAPTURING') {
      const remove=document.createElement('button'); remove.type='button'; remove.className='btn outline'; remove.textContent='Delete file';
      remove.addEventListener('click', async () => {
        if (!confirm('Permanently delete this local recording or snapshot?')) return;
        try { await request(`/api/surveillance/recordings/${entry.id}`,{method:'DELETE'}); selectedRecordingId=null; renderedRecordingKey=''; await refresh(); }
        catch(error) {status(error.message);} 
      }); right.append(remove);
    }
    actions.append(left,right); detail.append(actions);
  }
  function showRecordings(items, storage) {
    latestMedia = items; latestStorage = storage;
    const list=$('surveillance-recordings'); list.replaceChildren();
    const selected=$('surveillance-recordings-camera').value;
    const filtered=selected ? items.filter(entry=>String(entry.camera_id)===selected) : items;
    $('surveillance-storage').textContent = `Local media: ${mediaSize(storage.recording_bytes)} · Disk free: ${mediaSize(storage.free_bytes)} · Maximum recording: ${storage.max_recording_seconds || '?'} seconds · up to ${storage.max_recordings || '?'} saved items.`;
    if (!filtered.length) {
      const p=document.createElement('p');p.className='small muted'; p.textContent='No recordings or snapshots for this camera selection.'; list.append(p);
      selectedRecordingId=null; showRecordingDetail(null); return;
    }
    // A real compact row list: playing one recording opens a single, separate detail viewer.
    const wrapper=document.createElement('div'); wrapper.className='surveillance-recording-list-scroll';
    const table=document.createElement('table'); table.className='surveillance-recording-table';
    const thead=document.createElement('thead'); const header=document.createElement('tr');
    for (const label of ['Preview','Date / time','Camera','Type','Status','Size']) {
      const th=document.createElement('th'); th.scope='col'; th.textContent=label; header.append(th);
    }
    thead.append(header); table.append(thead); const body=document.createElement('tbody');
    for (const entry of filtered) {
      const row=document.createElement('tr');
      if (selectedRecordingId===entry.id) row.classList.add('is-selected');
      const preview=document.createElement('td');
      const open=document.createElement('button'); open.type='button'; open.className='surveillance-media-thumb';
      open.textContent=entry.kind==='image' ? 'View' : '▶'; open.setAttribute('aria-label', `Open ${entry.kind === 'image' ? 'snapshot' : 'recording'} from ${entry.camera_name}`);
      if (entry.kind==='image' && ['STOPPED','FINISHED'].includes(entry.state) && entry.bytes>0) {
        const image=document.createElement('img');image.loading='lazy'; image.alt='Saved snapshot preview';
        image.src=`/api/surveillance/recordings/${entry.id}/file`;open.replaceChildren(image);
      }
      preview.append(open); row.append(preview);
      const dateCell=document.createElement('td'); const dateButton=document.createElement('button');
      dateButton.type='button'; dateButton.className='surveillance-recording-open';
      const parsedDate = new Date(entry.started_utc);
      dateButton.textContent = Number.isNaN(parsedDate.getTime()) ? entry.started_utc : parsedDate.toLocaleString();
      dateButton.title = entry.started_utc;
      dateCell.append(dateButton);row.append(dateCell);
      for (const value of [entry.camera_name,entry.kind==='image'?'Snapshot':'Video',entry.state,mediaSize(entry.bytes)]) {
        const cell=document.createElement('td');cell.textContent=value;row.append(cell);
      }
      const choose=()=>{ selectedRecordingId=entry.id; renderedRecordingKey=''; showRecordings(latestMedia,latestStorage); };
      open.addEventListener('click',choose); dateButton.addEventListener('click',choose);
      body.append(row);
    }
    table.append(body);wrapper.append(table);list.append(wrapper);
    let chosen=filtered.find(item=>item.id===selectedRecordingId);
    if (!chosen) {selectedRecordingId=null; chosen=null;}
    showRecordingDetail(chosen);
  }
  function showMotionHistory(data) {
    latestMotion = data;
    const grid=$('surveillance-motion-history'); grid.replaceChildren();
    const selected = $('surveillance-events-camera').value;
    const scans=(data.scans || []).filter(item=>!selected || String(item.camera_id)===selected);
    const events=(data.events || []).filter(item=>!selected || String(item.camera_id)===selected);
    if (!scans.length) {
      const p=document.createElement('p'); p.className='small muted';
      p.textContent='No saved-video motion scans yet. Finish a manual recording, then choose Scan for motion.';
      grid.append(p); return;
    }
    for (const scan of scans) {
      const pane=document.createElement('article'); pane.className='surveillance-motion-scan';
      const summary=document.createElement('p');
      summary.textContent=`${scan.camera_name} · Recording #${scan.recording_id} · ${scan.event_count} candidate(s) · ${scan.sensitivity} sensitivity · ${scan.sampled_seconds.toFixed(1)} s reviewed · scanned ${scan.scanned_utc}${scan.source_available ? '' : ' · SOURCE VIDEO UNAVAILABLE'}`;
      pane.append(summary);
      const matching=events.filter(item=>item.recording_id===scan.recording_id);
      if (matching.length) {
        const ul=document.createElement('ul'); ul.className='surveillance-motion-events';
        for (const event of matching) {
          const item=document.createElement('li');
          item.textContent=`Approx. +${event.offset_seconds.toFixed(1)} s into recording · ${(event.changed_fraction*100).toFixed(1)}% sampled pixels changed (not a confidence score)`;
          ul.append(item);
        }
        pane.append(ul);
      } else {
        const p=document.createElement('p'); p.className='small muted';
        p.textContent=scan.event_count ? 'Older events omitted from the most recent 200 entries.' : 'No motion candidates exceeded this threshold.';
        pane.append(p);
      }
      if (scan.source_available) {
        const play=document.createElement('a'); play.className='btn outline';
        play.textContent='Open source recording'; play.href=`/api/surveillance/recordings/${scan.recording_id}/file`;
        play.rel='noopener'; play.target='_blank'; pane.append(play);
      }
      const discard=document.createElement('button'); discard.type='button'; discard.className='btn outline';
      discard.textContent='Remove analysis history';
      discard.addEventListener('click', async () => {
        if (!confirm(`Remove saved motion analysis and events for recording #${scan.recording_id}? This will not delete the video.`)) return;
        try { await request(`/api/surveillance/motion-scans/${scan.recording_id}`,{method:'DELETE'}); await refresh(); }
        catch(error) { $('surveillance-motion-status').textContent=`Could not remove analysis: ${error.message}`; }
      });
      pane.append(discard); grid.append(pane);
    }
  }
  function showUsbManual() {
    $('surveillance-usb-manual-field').hidden = !usbManual;
    $('surveillance-usb-choice').required = !usbManual && $('surveillance-source').value === 'USB';
    $('surveillance-usb').required = usbManual && $('surveillance-source').value === 'USB';
    $('surveillance-usb-manual-toggle').textContent = usbManual ? 'Use detected camera list' : 'Advanced: enter device path';
  }
  function renderUsb(devices) {
    usbCandidates = devices;
    const select = $('surveillance-usb-choice'), old = select.value;
    select.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';
    placeholder.textContent = devices.length ? 'Choose a detected Linux camera…' : 'No Linux video devices found';
    select.append(placeholder);
    for (const device of devices) {
      const option=document.createElement('option');option.value=device.path;
      option.textContent=`${device.name} · ${device.path}${device.index > 0 ? ' (secondary interface)' : ''}`;
      select.append(option);
    }
    if (old && devices.some(device=>device.path===old)) select.value=old;
    $('surveillance-usb-status').textContent=devices.length ?
      `${devices.length} Linux video interface(s) detected. Select the main capture interface; additional entries may be microphone/metadata. Detection is not proof that video can be recorded.` :
      'No Linux video device is available. On WSL, a webcam connected to Windows is not necessarily passed through to Linux. You can refresh after connecting it.';
  }
  async function refreshUsb() {
    try {const result=await request('/api/surveillance/usb-devices');renderUsb(result.devices || []);}
    catch(error){$('surveillance-usb-status').textContent=`Could not enumerate Linux devices: ${error.message}`;}
  }
  $('surveillance-usb-refresh').addEventListener('click', refreshUsb);
  $('surveillance-usb-manual-toggle').addEventListener('click',()=>{usbManual=!usbManual;showUsbManual();});
  $('surveillance-usb-choice').addEventListener('change',()=>{
    const selected=usbCandidates.find(item=>item.path===$('surveillance-usb-choice').value);
    if (selected && !editing && !$('surveillance-name').value.trim()) $('surveillance-name').value=selected.name.slice(0,64);
  });
  $('surveillance-alert-toggle').addEventListener('change',event=>{
    alertEnabled=!!event.target.checked;
    $('surveillance-alert-status').textContent=alertEnabled ?
      'Local motion alerts enabled for this open app session. Desktop notifications also need browser permission; no external service.' :
      'Local motion alerts off. Existing event history is retained.';
  });
  $('surveillance-alert-permission').addEventListener('click', async()=>{
    if (typeof Notification === 'undefined') {
      $('surveillance-alert-status').textContent='Desktop notifications are not supported in this browser. In-app alerts remain available.'; return;
    }
    try {
      const permission=await Notification.requestPermission();
      $('surveillance-alert-status').textContent=`Browser notification permission: ${permission}. Also enable local alerts above to receive new motion candidates.`;
    } catch (_) { $('surveillance-alert-status').textContent='Browser notification permission was unavailable. In-app alerts can still work.'; }
  });
  const scheduleStatus=text=>{$('surveillance-schedule-status').textContent=text;};
  function showSchedules(data) {
    const selected=$('surveillance-schedule-camera').value;
    const cameraChoice=$('surveillance-schedule-camera');cameraChoice.replaceChildren();
    const first=document.createElement('option');first.value='';first.textContent='Select saved camera…';cameraChoice.append(first);
    for (const camera of cameras) {
      const option=document.createElement('option');option.value=String(camera.id);option.textContent=camera.name;
      cameraChoice.append(option);
    }
    if (cameras.some(camera=>String(camera.id)===selected)) cameraChoice.value=selected;
    $('surveillance-schedules-arm').disabled=!!data.armed || !(data.schedules || []).length;
    $('surveillance-schedules-disarm').disabled=!data.armed;
    scheduleStatus(data.armed ? 'ARMED this session. Saved time windows may start/stop local recording while OpenRF runs. Disarm before leaving.' :
      'DISARMED. Saved schedules do not connect to cameras. You must explicitly arm each app session.');
    const list=$('surveillance-schedule-list');list.replaceChildren();
    if (!(data.schedules || []).length) {const p=document.createElement('p');p.className='small muted';p.textContent='No recording schedules configured.';list.append(p);return;}
    const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    for (const schedule of data.schedules) {
      const pane=document.createElement('article');pane.className='surveillance-motion-scan';
      const camera=cameras.find(camera=>camera.id===schedule.camera_id);
      const description=document.createElement('p');
      description.textContent=`${camera ? camera.name : 'Removed camera'} · ${schedule.weekdays.map(day=>days[day]).join(', ')} · ${schedule.start_time}–${schedule.end_time} (${schedule.time_zone}) · ${schedule.state}${schedule.detail ? ' · '+schedule.detail : ''}`;
      const remove=document.createElement('button');remove.type='button';remove.className='btn outline';remove.textContent='Delete schedule';
      remove.addEventListener('click',async()=>{
        if (!confirm('Delete this recurring recording schedule? Any recording it started will stop.')) return;
        try {await request(`/api/surveillance/schedules/${schedule.id}`,{method:'DELETE'});await refresh();}
        catch(error){scheduleStatus(`Delete failed: ${error.message}`);}
      });
      pane.append(description,remove);list.append(pane);
    }
  }
  const browserTimeZone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  $('surveillance-schedule-timezone').textContent=`Recording times use your browser time zone: ${browserTimeZone}. Same-day windows only (end after start).`;
  $('surveillance-schedule-form').addEventListener('submit',async(event)=>{
    event.preventDefault();
    const body={camera_id:Number($('surveillance-schedule-camera').value),
      weekdays:Array.from(document.querySelectorAll('[data-surveillance-day]:checked'),el=>Number(el.dataset.surveillanceDay)),
      start_time:$('surveillance-schedule-start').value,end_time:$('surveillance-schedule-end').value,time_zone:browserTimeZone};
    try {await request('/api/surveillance/schedules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      await refresh();scheduleStatus('Schedule saved. Explicitly arm it for this session to permit automatic recording.');}
    catch(error){scheduleStatus(`Schedule not saved: ${error.message}`);}
  });
  $('surveillance-schedules-arm').addEventListener('click',async()=>{
    if (!confirm('Arm recording schedules for this OpenRF session? Cameras may connect and record automatically within saved time windows. This never persists across app restart.')) return;
    try {await request('/api/surveillance/schedules/arm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({armed:true})});await refresh();}
    catch(error){scheduleStatus(`Could not arm schedules: ${error.message}`);}
  });
  $('surveillance-schedules-disarm').addEventListener('click',async()=>{
    try {await request('/api/surveillance/schedules/arm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({armed:false})});await refresh();}
    catch(error){scheduleStatus(`Could not disarm schedules: ${error.message}`);}
  });
  $('surveillance-schedules-refresh').addEventListener('click',refresh);
  $('surveillance-motion-refresh').addEventListener('click', refresh);
  let cleanupReview = null;
  const cleanupStatus = text => { $('surveillance-cleanup-status').textContent = text; };
  const invalidateReview = () => { cleanupReview = null; $('surveillance-cleanup-apply').hidden = true; };
  $('surveillance-cleanup-days').addEventListener('input', invalidateReview);
  $('surveillance-cleanup-review').addEventListener('click', async () => {
    invalidateReview();
    const days = Number($('surveillance-cleanup-days').value);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      cleanupStatus('Enter a whole-number age between 1 and 3650 days.'); return;
    }
    try {
      const result = await request('/api/surveillance/cleanup/preview', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({days})});
      cleanupReview = result;
      cleanupStatus(`${result.count} old item(s), ${(result.bytes / 1048576).toFixed(1)} MiB eligible for deletion. Nothing deleted.`);
      $('surveillance-cleanup-apply').hidden = !result.count;
    } catch (error) { cleanupStatus(`Cleanup review failed: ${error.message}`); }
  });
  $('surveillance-cleanup-apply').addEventListener('click', async () => {
    const plan = cleanupReview;
    if (!plan || !plan.count) return;
    if (!confirm(`Permanently delete ${plan.count} reviewed recording(s) and snapshot(s) older than ${plan.days} days? This cannot be undone.`)) return;
    invalidateReview();
    try {
      const result = await request('/api/surveillance/cleanup/apply', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({days:plan.days, ids:plan.ids})});
      cleanupStatus(`Deleted ${result.deleted} reviewed item(s).`);
      await refresh();
    } catch (error) { cleanupStatus(`Cleanup failed: ${error.message}. Review again before retrying.`); }
  });
  $('surveillance-source').addEventListener('change', updateSource);
  $('surveillance-refresh-media').addEventListener('click', refresh);
  updateSource();
  $('surveillance-cancel').addEventListener('click', resetForm);
  $('surveillance-close-live').addEventListener('click', () => stopView(undefined, true));
  $('surveillance-refresh').addEventListener('click', refresh);
  $('surveillance-fullscreen').addEventListener('click', () => toggleFullscreen($('surveillance-viewer')));
  document.addEventListener('fullscreenchange', updateFullscreenLabels);
  document.addEventListener('openrf:surveillance-shown', () => {paused.clear();autoPreviewInitialized=false;refresh();});
  function stopMonitorOnLeave() {
    if (['STARTING','MONITORING','STOPPING'].includes(liveMotion.state) && liveMotion.camera_id) {
      // Browser navigation may cancel an ordinary request; keepalive is best effort.
      fetch(`/api/surveillance/cameras/${liveMotion.camera_id}/motion/stop`, {method:'POST',keepalive:true}).catch(()=>{});
    }
  }
  document.addEventListener('openrf:surveillance-hidden', () => {stopView();paused.clear();autoPreviewInitialized=false;stopMonitorOnLeave();});
  window.addEventListener('pagehide', () => {stopView(); stopMonitorOnLeave();});
  setInterval(() => {
    if (!$('page-surveillance').classList.contains('active')) return;
    if (activeTab === 'cameras') refreshUsb();
    if (['STARTING','MONITORING','STOPPING'].includes(liveMotion.state) || alertEnabled || activeTab === 'schedules' || recording.size > 0) refresh();
  }, 5000);
  selectTab(activeTab); // Restore the selected panel after constructing all listeners.
  if ($('page-surveillance').classList.contains('active')) refresh();
})();
