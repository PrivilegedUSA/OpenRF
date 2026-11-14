'use strict';
// OpenRF v0.2.53: explicit short RTL-SDR receive clips. No transmit, browser
// microphone, recurring scans, auto-play, external audio services or GPS.
(() => {
  const el = id => document.getElementById(id);
  const state = el('radio-state');
  if (!state) return;
  const start = el('radio-start'), stop = el('radio-stop'), refresh = el('radio-refresh');
  const playback = el('radio-playback'), player = el('radio-player');
  let pollTimer = null, currentAudio = null, busy = false, fetchSerial = 0;

  async function request(url, method = 'GET', body = undefined) {
    const options = {method, headers: {}};
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  function clearAudio() {
    player.pause(); player.removeAttribute('src'); player.load();
    playback.hidden = true; currentAudio = null;
  }
  function setText(message, error = false) {
    state.textContent = message; state.classList.toggle('error', error);
  }
  function schedulePoll() {
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => { pollTimer = null; checkStatus(); }, 700);
  }
  async function checkStatus() {
    const serial = ++fetchSerial;
    try {
      const report = await request('/api/radio/status');
      if (serial !== fetchSerial) return;
      const record = report.current;
      start.disabled = !!report.running || busy;
      stop.disabled = !report.running || busy;
      if (!record) {
        setText(report.rtl_fm_available
          ? 'rtl_fm is installed. Receiver connection and reception are not verified. No sample started.'
          : 'rtl_fm is not installed in this Linux environment. Install rtl-sdr and connect a supported receiver.');
        return;
      }
      const config = record.settings || {};
      const label = `${config.frequency_mhz ?? '?'} MHz · ${(config.mode || '?').toUpperCase()}`;
      if (report.running) {
        setText(`RECEIVING · ${label}. This bounded sample will be available after capture completes; not a live stream.`);
        schedulePoll();
      } else if (record.state === 'READY') {
        setText(`RECEIVED AUDIO · ${label}. Short recorded PCM sample, receiver identity and signal source unverified.`);
        if (currentAudio !== record.id) {
          player.src = `/api/radio/audio/${encodeURIComponent(record.id)}.wav`;
          playback.hidden = false; currentAudio = record.id;
        }
      } else {
        clearAudio();
        setText(`${record.state || 'UNAVAILABLE'} · ${record.error || 'No playable sample.'}`, record.state === 'FAILED');
      }
    } catch (error) {
      setText(`Radio status unavailable: ${error.message}`, true);
      start.disabled = false; stop.disabled = true;
    }
  }
  start.addEventListener('click', async () => {
    if (busy) return;
    const frequency_mhz = Number(el('radio-frequency').value);
    const mode = el('radio-mode').value;
    const duration_seconds = Number(el('radio-duration').value);
    if (!el('radio-frequency').value.trim() || !Number.isFinite(frequency_mhz) || frequency_mhz < 24 || frequency_mhz > 1766) {
      setText('Choose a frequency from 24–1766 MHz. Actual hardware coverage is unverified.', true); return;
    }
    busy = true; start.disabled = true; stop.disabled = true;
    clearAudio();
    try {
      const result = await request('/api/radio/start', 'POST', {frequency_mhz, mode, duration_seconds});
      setText(`RECEIVING · ${result.radio.settings.frequency_mhz} MHz. The receiver operation is bounded to ${duration_seconds} seconds.`);
      schedulePoll();
    } catch (error) {
      setText(`Could not start: ${error.message}`, true);
      start.disabled = false;
    } finally { busy = false; }
  });
  stop.addEventListener('click', async () => {
    if (busy) return;
    busy = true; stop.disabled = true;
    try {
      await request('/api/radio/stop', 'POST', {});
      setText('Stopping reception and discarding incomplete audio…');
      schedulePoll();
    } catch (error) { setText(`Stop failed: ${error.message}`, true); }
    finally { busy = false; }
  });
  refresh.addEventListener('click', checkStatus);
  document.querySelectorAll('[data-radio-preset]').forEach(button => button.addEventListener('click', () => {
    el('radio-frequency').value = button.dataset.radioPreset;
    el('radio-mode').value = button.dataset.radioMode;
    setText(`Tuned form to ${button.dataset.radioPreset} MHz. No reception started. This is an example, not a verified local channel.`);
  }));
  document.addEventListener('openrf:radio-shown', checkStatus);
})();
