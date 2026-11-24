/* OpenRF surveillance: local, on-demand RTSP previews only. No auto connections. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let cameras = [];
  let selected = null;
  let editing = null;
  const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  async function request(url, options) {
    const response = await fetch(url, {cache: 'no-store', ...options});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  }
  const status = text => { $('surveillance-status').textContent = text; };
  function stopView() {
    $('surveillance-live').removeAttribute('src');
    $('surveillance-viewer').hidden = true;
    selected = null;
    $('surveillance-live-status').textContent = 'Stopped. The camera is not being requested.';
  }
  function showInventory() {
    const grid = $('surveillance-grid');
    grid.replaceChildren();
    if (!cameras.length) {
      grid.innerHTML = '<p class="small muted">No cameras saved. Add a private-network RTSP camera below; no discovery or connection happens automatically.</p>';
      return;
    }
    cameras.forEach(camera => {
      const tile = document.createElement('article');
      tile.className = 'panel surveillance-tile';
      tile.innerHTML = `<div class="panel-title"><h3>${escapeHtml(camera.name)}</h3><span class="pill">NOT CHECKED</span></div>
        <p class="small muted">RTSP · ${escapeHtml(camera.host)} · No connection or battery telemetry verified</p>
        <div class="button-line"><button class="btn primary" type="button" data-action="view">View live</button>
        <button class="btn outline" type="button" data-action="edit">Edit</button>
        <button class="btn outline" type="button" data-action="delete">Remove</button></div>`;
      tile.querySelector('[data-action=view]').addEventListener('click', () => view(camera));
      tile.querySelector('[data-action=edit]').addEventListener('click', () => {
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
        if (!confirm(`Remove ${camera.name} from OpenRF?`)) return;
        if (selected === camera.id) stopView();
        try { await request(`/api/surveillance/cameras/${camera.id}`, {method: 'DELETE'}); await refresh(); }
        catch (error) { status(error.message); }
      });
      grid.append(tile);
    });
  }
  function view(camera) {
    stopView();
    selected = camera.id;
    $('surveillance-viewer').hidden = false;
    $('surveillance-live-title').textContent = camera.name;
    $('surveillance-live-status').textContent = 'Opening on-demand RTSP preview. Waiting for real camera frames…';
    const image = $('surveillance-live');
    image.onload = () => { if (selected === camera.id) $('surveillance-live-status').textContent = 'RTSP frames received (up to 2 fps). Not recording.'; };
    image.onerror = () => { if (selected === camera.id) $('surveillance-live-status').textContent = 'Preview unavailable. Confirm camera, stream path, network and FFmpeg. No video recorded.'; };
    image.src = `/api/surveillance/cameras/${camera.id}/live`;
  }
  async function refresh() {
    try {
      const data = await request('/api/surveillance');
      cameras = data.cameras || [];
      showInventory();
      $('surveillance-capabilities').textContent = `FFmpeg: ${data.capabilities.ffmpeg}. RTSP MJPEG preview: ${data.capabilities.rtsp_mjpeg_preview ? 'available on demand' : 'unavailable'}. USB, ONVIF, recording and battery reporting are not implemented yet.`;
      status(`${cameras.length} saved camera(s). No camera has been contacted by inventory refresh.`);
    } catch (error) { status(`Cannot read local camera inventory: ${error.message}`); }
  }
  function resetForm() {
    editing = null;
    $('surveillance-form').reset();
    $('surveillance-url').required = true;
    $('surveillance-url').placeholder = 'rtsp://192.168.1.50:554/stream1';
    $('surveillance-save').textContent = 'Add camera';
    $('surveillance-cancel').hidden = true;
  }
  $('surveillance-form').addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {name: $('surveillance-name').value};
    if (!editing || $('surveillance-url').value.trim()) payload.rtsp_url = $('surveillance-url').value.trim();
    try {
      await request(editing ? `/api/surveillance/cameras/${editing}` : '/api/surveillance/cameras',
        {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      resetForm(); await refresh();
    } catch (error) { status(`Camera not saved: ${error.message}`); }
  });
  $('surveillance-cancel').addEventListener('click', resetForm);
  $('surveillance-close-live').addEventListener('click', stopView);
  $('surveillance-refresh').addEventListener('click', refresh);
  $('surveillance-fullscreen').addEventListener('click', () => { const box=$('surveillance-viewer'); if (box.requestFullscreen) box.requestFullscreen(); });
  document.addEventListener('openrf:surveillance-shown', refresh);
  document.addEventListener('openrf:surveillance-hidden', stopView);
  if (document.getElementById('page-surveillance').classList.contains('active')) refresh();
})();
