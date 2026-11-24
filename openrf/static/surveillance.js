/* OpenRF Surveillance: user-started, maximum two real RTSP previews, never automatic. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const MAX_LIVE = 2;
  let cameras = [];
  let editing = null;
  const live = new Map();
  const checks = new Map();
  const recording = new Set();
  let motionBusy = false;
  const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function request(url, options) {
    const response = await fetch(url, {cache: 'no-store', ...options});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  }
  const status = text => { $('surveillance-status').textContent = text; };
  function updateLiveHeader() {
    $('surveillance-viewer').hidden = live.size === 0;
    $('surveillance-live-title').textContent = `Live monitoring · ${live.size} of ${MAX_LIVE} slots`;
    $('surveillance-live-status').textContent = live.size ?
      'Only feeds you explicitly opened are requested. No recording is active.' :
      'Stopped. No camera is being requested.';
  }
  function stopView(id) {
    const ids = id === undefined ? Array.from(live.keys()) : [id];
    for (const cameraId of ids) {
      const pane = live.get(cameraId);
      if (!pane) continue;
      // Remove the stream before removing the DOM node to cancel its HTTP request.
      pane.querySelector('img').removeAttribute('src');
      pane.remove();
      live.delete(cameraId);
    }
    updateLiveHeader();
    showInventory();
  }
  function showInventory() {
    const grid = $('surveillance-grid');
    grid.replaceChildren();
    if (!cameras.length) {
      grid.innerHTML = '<p class="small muted">No cameras saved. Add a private-network RTSP camera below; no discovery or connection happens automatically.</p>';
      return;
    }
    cameras.forEach(camera => {
      const viewing = live.has(camera.id);
      const tile = document.createElement('article');
      tile.className = 'panel surveillance-tile';
      const check = checks.get(camera.id);
      tile.innerHTML = `<div class="panel-title"><h3>${escapeHtml(camera.name)}</h3><span class="pill">${viewing ? 'REQUESTED' : 'NOT CHECKED'}</span></div>
        <p class="small muted">${escapeHtml(camera.type)} · ${escapeHtml(camera.host)} · ${viewing ? 'Preview requested; see feed status below' : 'No current connection or battery status verified'}</p>
        <p class="small muted" role="status" data-check-status>${check ? escapeHtml(check) : 'Diagnostics not run. Check is manual.'}</p>
        <div class="button-line"><button class="btn outline" type="button" data-action="probe">Test connection</button><button class="btn primary" type="button" data-action="view">${viewing ? 'Stop live' : 'View live'}</button>
        <button class="btn outline" type="button" data-action="record">${recording.has(camera.id) ? 'Stop recording' : 'Start recording'}</button>
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
      tile.querySelector('[data-action=view]').addEventListener('click', () => viewing ? stopView(camera.id) : view(camera));
      tile.querySelector('[data-action=record]').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const stopping = recording.has(camera.id);
          const result = await request(`/api/surveillance/cameras/${camera.id}/${stopping ? 'stop' : 'record'}`, {method: 'POST'});
          if (stopping) recording.delete(camera.id); else recording.add(camera.id);
          status(stopping ? `Recording stop requested for ${camera.name}.` : `Recording started for ${camera.name}; frames are not verified until captured.`);
          await refresh();
        } catch (error) { status(`Recording action failed: ${error.message}`); }
        button.disabled = false;
      });
      tile.querySelector('[data-action=snapshot]').addEventListener('click', async event => {
        event.currentTarget.disabled = true;
        try {
          await request(`/api/surveillance/cameras/${camera.id}/snapshot`, {method:'POST'});
          status(`Screenshot saved for ${camera.name}.`);
          await refresh();
        } catch (error) { status(`Screenshot failed: ${error.message}`); }
        event.currentTarget.disabled = false;
      });
      tile.querySelector('[data-action=edit]').addEventListener('click', () => {
        $('surveillance-source').value = camera.type;
        updateSource();
        $('surveillance-usb').value = camera.type === 'USB' ? camera.host : '';
        editing = camera.id;
        $('surveillance-name').value = camera.name;
        $('surveillance-url').value = '';
        $('surveillance-url').required = false;
        $('surveillance-url').placeholder = 'Leave empty to keep existing private RTSP URL';
        $('surveillance-save').textContent = 'Save camera changes';
        $('surveillance-cancel').hidden = false;
        $('surveillance-name').focus();
      });
      tile.querySelector('[data-action=delete]').addEventListener('click', async () => {
        if (recording.has(camera.id)) { status('Stop recording before deleting this camera.'); return; }
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
    if (live.size >= MAX_LIVE) {
      status(`Only ${MAX_LIVE} concurrent previews are supported. Stop a feed before opening another.`);
      return;
    }
    const pane = document.createElement('article');
    pane.className = 'surveillance-feed';
    pane.setAttribute('aria-label', `Live preview for ${camera.name}`);
    const header = document.createElement('div');
    header.className = 'surveillance-feed-heading';
    const name = document.createElement('strong');
    name.textContent = camera.name;
    const actions = document.createElement('div');
    actions.className = 'button-line';
    const fullscreen = document.createElement('button');
    fullscreen.className = 'btn outline';
    fullscreen.type = 'button';
    fullscreen.textContent = 'Full screen';
    fullscreen.addEventListener('click', () => { if (pane.requestFullscreen) pane.requestFullscreen(); });
    const stop = document.createElement('button');
    stop.className = 'btn outline';
    stop.type = 'button';
    stop.textContent = 'Stop';
    stop.addEventListener('click', () => stopView(camera.id));
    actions.append(fullscreen, stop);
    header.append(name, actions);
    const image = document.createElement('img');
    image.alt = `Live frames from ${camera.name} (preview; recording is independently controlled)`;
    const note = document.createElement('p');
    note.className = 'small muted';
    note.setAttribute('role', 'status');
    note.textContent = 'Opening RTSP preview. Waiting for real camera frames…';
    pane.append(header, image, note);
    live.set(camera.id, pane);
    $('surveillance-live-grid').append(pane);
    updateLiveHeader();
    showInventory();
    image.onload = () => {
      if (live.get(camera.id) === pane) note.textContent = 'Video frames received (up to 2 fps). Recording is controlled separately.';
    };
    image.onerror = () => {
      if (live.get(camera.id) === pane) note.textContent = 'Preview failed or unavailable. Check camera, RTSP path, LAN and FFmpeg. Not recording.';
    };
    image.src = `/api/surveillance/cameras/${camera.id}/live`;
  }
  async function refresh() {
    try {
      const data = await request('/api/surveillance');
      cameras = data.cameras || [];
      for (const id of checks.keys()) if (!cameras.some(camera => camera.id === id)) checks.delete(id);
      // An inventory refresh itself never starts an RTSP request.
      for (const id of Array.from(live.keys())) if (!cameras.some(camera => camera.id === id)) stopView(id);
      showInventory();
      showMotionHistory(data.motion || {scans: [], events: []});
      $('surveillance-capabilities').textContent = `FFmpeg: ${data.capabilities.ffmpeg}. On-demand preview: ${data.capabilities.rtsp_mjpeg_preview ? 'available (2 feeds)' : 'unavailable'}. RTSP diagnostics: ${data.capabilities.rtsp_diagnostics ? 'available' : 'ffprobe missing'}. USB devices found: ${data.capabilities.usb_devices.length}. ONVIF, Bluetooth pairing, live motion alarms, and battery telemetry unsupported. Saved-video motion review is manual.`;
      $('surveillance-usb-devices').replaceChildren();
      for (const path of data.capabilities.usb_devices) {
        const item = document.createElement('option'); item.value = path;
        $('surveillance-usb-devices').append(item);
      }
      recording.clear();
      for (const item of data.recordings || []) if (item.state === 'RECORDING') recording.add(item.camera_id);
      showInventory();
      showRecordings(data.recordings || [], data.storage || {});
      status(`${cameras.length} saved camera(s). Inventory refresh did not contact cameras.`);
    } catch (error) { status(`Cannot read local camera inventory: ${error.message}`); }
  }
  function resetForm() {
    editing = null;
    $('surveillance-form').reset();
    $('surveillance-source').value = 'RTSP';
    updateSource();
    $('surveillance-url').placeholder = 'rtsp://192.168.1.50:554/stream1';
    $('surveillance-save').textContent = 'Add camera';
    $('surveillance-cancel').hidden = true;
  }
  $('surveillance-form').addEventListener('submit', async event => {
    event.preventDefault();
    const id = editing;
    const payload = {name: $('surveillance-name').value};
    payload.source_type = $('surveillance-source').value;
    if (payload.source_type === 'USB') payload.usb_device = $('surveillance-usb').value.trim();
    else if (!id || $('surveillance-url').value.trim()) payload.rtsp_url = $('surveillance-url').value.trim();
    try {
      // A changed RTSP URL must not leave a previous stream running.
      if (id) { stopView(id); checks.delete(id); }
      await request(id ? `/api/surveillance/cameras/${id}` : '/api/surveillance/cameras',
        {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      resetForm(); await refresh();
    } catch (error) { status(`Camera not saved: ${error.message}`); }
  });
  function updateSource() {
    const rtsp = $('surveillance-source').value === 'RTSP';
    $('surveillance-rtsp-field').hidden = !rtsp;
    $('surveillance-usb-field').hidden = rtsp;
    $('surveillance-url').required = rtsp && !editing;
    $('surveillance-usb').required = !rtsp;
  }
  function showRecordings(items, storage) {
    const grid = $('surveillance-recordings');
    grid.replaceChildren();
    const fmt = size => Number.isFinite(size) ? `${(size / 1048576).toFixed(1)} MiB` : 'unknown';
    $('surveillance-storage').textContent = `Local media: ${fmt(storage.recording_bytes)} · Disk free: ${fmt(storage.free_bytes)} · Maximum recording: ${storage.max_recording_seconds || '?'} seconds · up to ${storage.max_recordings || '?'} saved items.`;
    if (!items.length) { const p = document.createElement('p'); p.className='small muted'; p.textContent='No recordings or snapshots saved.'; grid.append(p); return; }
    for (const entry of items) {
      const pane = document.createElement('article'); pane.className='surveillance-recording';
      const line = document.createElement('p');
      line.textContent = `${entry.kind === 'image' ? 'Snapshot' : 'Video'} · ${entry.camera_name} · ${entry.started_utc} · ${entry.state} · ${fmt(entry.bytes)}`;
      pane.append(line);
      if (entry.state !== 'RECORDING' && entry.state !== 'CAPTURING' && entry.bytes) {
        const link = document.createElement('a'); link.className='btn outline'; link.textContent='Open / download';
        link.href=`/api/surveillance/recordings/${entry.id}/file?download`; link.rel='noopener'; link.target='_blank'; pane.append(link);
        if (entry.kind === 'video') {
          const video = document.createElement('video'); video.controls=true; video.preload='none';
          video.src=`/api/surveillance/recordings/${entry.id}/file`; video.className='surveillance-playback'; pane.append(video);
        }
      }
      if (entry.kind === 'video' && (entry.state === 'STOPPED' || entry.state === 'FINISHED') && entry.bytes) {
        const scan = document.createElement('button'); scan.type='button'; scan.className='btn outline';
        scan.textContent='Scan for motion'; scan.disabled=motionBusy;
        scan.addEventListener('click', async () => {
          if (motionBusy) return;
          motionBusy=true; scan.disabled=true;
          const setting=$('surveillance-motion-sensitivity').value;
          $('surveillance-motion-status').textContent=`Reviewing the first five minutes of ${entry.camera_name} using ${setting} sensitivity… No camera will be contacted.`;
          try {
            const result=await request(`/api/surveillance/recordings/${entry.id}/motion-scan`, {
              method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({sensitivity:setting})});
            $('surveillance-motion-status').textContent=`Scan complete: ${result.event_count} motion candidate(s) in ${result.sampled_seconds.toFixed(1)} sampled seconds from ${entry.camera_name}.`;
          } catch (error) { $('surveillance-motion-status').textContent=`Saved-video motion scan failed: ${error.message}`; }
          finally { motionBusy=false; await refresh(); }
        }); pane.append(scan);
      }
      if (entry.state !== 'RECORDING' && entry.state !== 'CAPTURING') {
        const remove = document.createElement('button'); remove.type='button'; remove.className='btn outline'; remove.textContent='Delete file';
        remove.addEventListener('click', async () => {
          if (!confirm('Permanently delete this local recording or snapshot?')) return;
          try { await request(`/api/surveillance/recordings/${entry.id}`, {method:'DELETE'}); await refresh(); }
          catch (error) { status(error.message); }
        }); pane.append(remove);
      }
      grid.append(pane);
    }
  }
  function showMotionHistory(data) {
    const grid=$('surveillance-motion-history'); grid.replaceChildren();
    const scans=data.scans || [], events=data.events || [];
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
  $('surveillance-close-live').addEventListener('click', () => stopView());
  $('surveillance-refresh').addEventListener('click', refresh);
  $('surveillance-fullscreen').addEventListener('click', () => {
    const box = $('surveillance-viewer');
    if (box.requestFullscreen) box.requestFullscreen();
  });
  document.addEventListener('openrf:surveillance-shown', refresh);
  document.addEventListener('openrf:surveillance-hidden', () => stopView());
  window.addEventListener('pagehide', () => stopView());
  if ($('page-surveillance').classList.contains('active')) refresh();
})();
