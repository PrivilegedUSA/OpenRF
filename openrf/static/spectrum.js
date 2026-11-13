/* OpenRF v0.2.46 spectrum workspace. Explicit bounded server-local rtl_power captures;
 * historical local files and DEMO remain browser-local.
 * Pure parsing/model functions are exported for Node regression tests.
 */
(function (global) {
  'use strict';
  const MAX_BYTES = 2 * 1024 * 1024, MAX_LINES = 3000, MAX_BINS = 4096, MAX_FRAMES = 160;
  function isNumber(x) { return typeof x === 'number' && Number.isFinite(x); }
  function parseRtlPowerCsv(contents) {
    if (typeof contents !== 'string' || !contents.trim()) throw Error('Select a non-empty rtl_power CSV file.');
    if (contents.length > MAX_BYTES) throw Error('CSV exceeds the 2 MB local-file limit.');
    const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines.length > MAX_LINES) throw Error('Too many CSV rows (maximum 3000).');
    const frames = new Map();
    let accepted = 0, rejected = 0, binsRead = 0;
    for (const original of lines) {
      const line = original.trim();
      if (!line || line.startsWith('#')) continue;
      const fields = line.split(',').map(s => s.trim());
      if (fields.length < 7) { rejected++; continue; }
      const [date, time] = fields;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(time)) { rejected++; continue; }
      // Validate calendar values without applying the browser's timezone.
      const parts = date.split('-').map(Number), clock = time.split(':').map(Number);
      const calendar = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      if (calendar.getUTCFullYear() !== parts[0] || calendar.getUTCMonth() !== parts[1] - 1 || calendar.getUTCDate() !== parts[2] || clock[0] > 23 || clock[1] > 59 || clock[2] >= 60) { rejected++; continue; }
      const low = Number(fields[2]), high = Number(fields[3]), step = Number(fields[4]), count = Number(fields[5]);
      if (![low, high, step, count].every(isNumber) || low < 1000 || high > 30000000000 || high <= low || step <= 0 || count < 1 || !Number.isInteger(count) || fields.length > MAX_BINS + 6) { rejected++; continue; }
      const db = fields.slice(6).map(Number);
      // Do not coerce blanks to 0 dB: this would fabricate measurements.
      if (db.some((n, i) => !fields[i + 6] || !isNumber(n) || n < -300 || n > 150) || !db.length) { rejected++; continue; }
      // rtl_power's high frequency is commonly the upper edge; allow 1 bin tolerance.
      if (Math.abs((high - low) / step - db.length) > 2.25) { rejected++; continue; }
      const stamp = `${date} ${time}`; // local/unverified timezone, not UTC.
      let frame = frames.get(stamp);
      if (!frame) { frame = {stamp, bins: []}; frames.set(stamp, frame); }
      if (frame.bins.length + db.length > MAX_BINS) { rejected++; continue; }
      for (let i = 0; i < db.length; i++) {
        const hz = low + step * (i + 0.5);
        if (hz >= low && hz <= high + step) frame.bins.push({mhz: hz / 1e6, db: db[i]});
      }
      binsRead += db.length;
      accepted++;
      if (frames.size >= MAX_FRAMES) break;
    }
    const result = [...frames.values()].filter(f => f.bins.length).map(f => ({
      stamp: f.stamp, bins: f.bins.sort((a, b) => a.mhz - b.mhz),
    }));
    if (!result.length) throw Error('No valid rtl_power data rows found. Expected date,time,start Hz,stop Hz,step Hz,samples,dB bins.');
    return {
      kind: 'RTL_POWER_CSV_HISTORICAL', frames: result, acceptedRows: accepted, rejectedRows: rejected, binsRead,
      calibrated: false, timestampTimezoneVerified: false, stored: false,
    };
  }
  function makeDemo() {
    const frames = [];
    for (let t = 0; t < 52; t++) {
      const bins = [];
      for (let i = 0; i < 192; i++) {
        const mhz = 87 + i * (22 / 192), base = -111 + 2.2 * Math.sin(i * 1.73 + t * .48);
        const peak = (at, width, power) => power * Math.exp(-Math.pow((mhz - at) / width, 2));
        const db = base + peak(90.5, .35, 46) + peak(96.3 + .15 * Math.sin(t / 9), .5, 32) + peak(103.1, .7, 54);
        bins.push({mhz, db: Math.round(db * 10) / 10});
      }
      frames.push({stamp: `DEMO FRAME ${String(t + 1).padStart(2, '0')}`, bins});
    }
    return {kind: 'SYNTHETIC_DEMO_NOT_LIVE', frames, calibrated: false,
      timestampTimezoneVerified: false, stored: false, acceptedRows: 0, rejectedRows: 0};
  }
  function visibleBins(frame, min, max) {
    if (!frame || !Array.isArray(frame.bins)) return [];
    return frame.bins.filter(b => b.mhz >= min && b.mhz <= max);
  }
  function bounds(data) {
    if (!data || !data.frames || !data.frames.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (const f of data.frames) for (const b of f.bins) {
      if (b.mhz < lo) lo = b.mhz;
      if (b.mhz > hi) hi = b.mhz;
    }
    return Number.isFinite(lo) && hi > lo ? {min: lo, max: hi} : null;
  }
  const core = {parseRtlPowerCsv, makeDemo, visibleBins, bounds, MAX_BYTES};
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  global.OpenRFSpectrum = core;

  if (!global.document) return;
  const doc = global.document;
  function init() {
    const root = doc.getElementById('page-spectrum');
    if (!root) return;
    const $ = id => doc.getElementById(id);
    let dataset = null, sourceLabel = '', frameIndex = 0, statusLoaded = false;
    let capturePoll = null, captureRunning = false, pendingCaptureId = null, loadedCaptureId = null;
    let baselineFileData = null, comparison = null, baselineRevision = 0;
    function updateLabel(label, mode) {
      $('sdr-source-status').textContent = label;
      $('sdr-source-status').dataset.mode = mode;
      $('sdr-file-name').textContent = sourceLabel || 'No file or demo loaded';
    }
    async function requestJSON(url, options) {
      const res = await fetch(url, {cache: 'no-store', ...options});
      const data = await res.json();
      if (!res.ok) throw Error(data.error || `HTTP ${res.status}`);
      return data;
    }
    function captureMessage(text) { $('sdr-capture-status').textContent = text; }
    function setPolling(enabled) {
      if (enabled && !capturePoll) capturePoll = global.setInterval(() => {
        refreshCapture().catch(e => captureMessage(`Receiver status unavailable: ${e.message}`));
      }, 1500);
      if (!enabled && capturePoll) { global.clearInterval(capturePoll); capturePoll = null; }
    }
    async function refreshSaved() {
      const {captures} = await requestJSON('/api/sdr/captures');
      const select = $('sdr-saved-captures'), selected = select.value;
      select.replaceChildren();
      const placeholder = doc.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Select a saved capture';
      select.appendChild(placeholder);
      for (const item of captures) {
        const option = doc.createElement('option'); option.value = item.id;
        option.dataset.state = item.state;
        option.textContent = `${item.state} · ${item.started_at_utc} · ${item.settings.start_mhz}–${item.settings.stop_mhz} MHz`;
        select.appendChild(option);
      }
      select.value = selected && [...select.options].some(o => o.value === selected) ? selected : '';
      const baseline = $('sdr-baseline-saved'), oldBaseline = baseline.value;
      baseline.replaceChildren();
      const first = doc.createElement('option'); first.value = ''; first.textContent = 'Select saved capture';
      baseline.appendChild(first);
      for (const item of captures.filter(r => r.state === 'COMPLETE')) {
        const option = doc.createElement('option'); option.value = item.id;
        option.textContent = `${item.started_at_utc} · ${item.settings.start_mhz}–${item.settings.stop_mhz} MHz`;
        baseline.appendChild(option);
      }
      baseline.value = oldBaseline && [...baseline.options].some(o => o.value === oldBaseline) ? oldBaseline : '';
      if (oldBaseline && baseline.value !== oldBaseline) clearComparison('Baseline capture was removed; select another.');
      updateSavedButtons();
    }
    function updateSavedButtons() {
      const id = $('sdr-saved-captures').value;
      const valid = /^[0-9a-f]{16}$/.test(id);
      const completed = valid && $('sdr-saved-captures').selectedOptions?.[0]?.dataset.state === 'COMPLETE';
      $('sdr-saved-open').disabled = !completed;
      $('sdr-saved-delete').disabled = !valid || captureRunning;
      const link = $('sdr-saved-download'); link.hidden = !completed;
      if (completed) link.href = `/api/sdr/captures/${id}.csv`;
      else link.removeAttribute('href');
    }
    async function reviewCapture(id) {
      if (!/^[0-9a-f]{16}$/.test(id)) throw Error('Invalid capture identifier');
      const res = await fetch(`/api/sdr/captures/${id}.csv`, {cache: 'no-store'});
      if (!res.ok) throw Error(`Saved capture unavailable (HTTP ${res.status})`);
      const raw = await res.text();
      setData(parseRtlPowerCsv(raw), `Locally saved receiver sweep ${id}`, 'recorded');
      loadedCaptureId = id;
      $('sdr-saved-captures').value = id;
      updateSavedButtons();
    }
    async function refreshCapture() {
      const status = await requestJSON('/api/sdr/capture');
      const wasRunning = captureRunning;
      captureRunning = !!status.running;
      $('sdr-capture-start').disabled = captureRunning || !statusLoaded;
      $('sdr-capture-stop').disabled = !captureRunning;
      const current = status.current;
      if (captureRunning) {
        captureMessage('CAPTURING (user started) · waiting for rtl_power CSV; no live samples verified yet.');
      } else if (current?.state === 'COMPLETE') {
        const summary = current.summary || {};
        captureMessage(`RECORDED · NOT LIVE · ${summary.accepted_rows || 0} valid segments, ${summary.frames || 0} frames · device identity and calibration unverified`);
      } else if (current?.state === 'FAILED' || current?.state === 'STOPPED') {
        captureMessage(`${current.state} · ${current.error || 'No completed receiver measurements.'}`);
      } else captureMessage('Idle · no SDR capture requested. Receiver not verified.');
      setPolling(captureRunning);
      if (wasRunning && !captureRunning) await refreshSaved();
      if (!captureRunning && current?.state === 'COMPLETE' && pendingCaptureId === current.id && loadedCaptureId !== current.id) {
        pendingCaptureId = null;
        try { await reviewCapture(current.id); }
        catch (e) { captureMessage(`Recorded but cannot display CSV: ${e.message}`); }
      }
      updateSavedButtons();
    }
    async function checkStatus(force = false) {
      if (statusLoaded && !force) { await refreshCapture(); return; }
      try {
        const info = await requestJSON('/api/sdr/status');
        const available = !!info.tooling.rtl_power_installed;
        $('sdr-receiver-status').textContent = available ?
          'rtl_power installed · receiver unverified · explicit short capture is available' :
          'rtl_power not installed in Linux · capture disabled; saved CSV and DEMO still work';
        statusLoaded = available;
        await refreshCapture();
        $('sdr-capture-start').disabled = !available || captureRunning;
        await refreshSaved();
      } catch (e) {
        statusLoaded = false;
        $('sdr-capture-start').disabled = true;
        $('sdr-receiver-status').textContent = `Cannot check local SDR capabilities: ${e.message}`;
      }
    }
    function resizeCanvas(canvas) {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(270, Math.floor(rect.width || 640));
      const h = canvas.id === 'sdr-waterfall' ? 200 : 215;
      const ratio = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.floor(w * ratio); canvas.height = Math.floor(h * ratio);
      const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      return {ctx, w, h};
    }
    function powerColor(db) {
      // Relative values from selected file / DEMO; colors are NOT calibrated dBm.
      const t = Math.max(0, Math.min(1, (db + 120) / 100));
      return `hsl(${Math.round(225 - t * 202)}, ${Math.round(60 + 35 * t)}%, ${Math.round(13 + 45 * t)}%)`;
    }
    function selectedRange() {
      const available = bounds(dataset);
      if (!available) return null;
      const minEntered = $('sdr-min-mhz').value.trim(), maxEntered = $('sdr-max-mhz').value.trim();
      const min = minEntered === '' ? available.min : Number(minEntered);
      const max = maxEntered === '' ? available.max : Number(maxEntered);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 30000 || min >= max) return null;
      return {min, max};
    }
    function drawEmpty(canvas, message) {
      const {ctx, w, h} = resizeCanvas(canvas);
      ctx.fillStyle = '#091923'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#8aa6b5'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(message, w / 2, h / 2); ctx.textAlign = 'left';
    }
    function drawSpectrum(frame, range) {
      const {ctx, w, h} = resizeCanvas($('sdr-spectrum'));
      ctx.fillStyle = '#091923'; ctx.fillRect(0, 0, w, h);
      const left = 48, top = 15, right = 13, bottom = 27;
      const pw = w - left - right, ph = h - top - bottom;
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#99b9c4';
      for (let n = 0; n <= 4; n++) {
        const y = top + n * ph / 4, db = -20 - n * 30;
        ctx.strokeStyle = '#233b49'; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - right, y); ctx.stroke();
        ctx.fillText(String(db), 5, y + 3);
      }
      const bins = visibleBins(frame, range.min, range.max);
      if (bins.length) {
        ctx.beginPath(); ctx.lineWidth = 1.8; ctx.strokeStyle = '#37dfc3';
        bins.forEach((b, i) => {
          const x = left + (b.mhz - range.min) / (range.max - range.min) * pw;
          const y = top + Math.max(0, Math.min(1, (-20 - b.db) / 120)) * ph;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      ctx.fillStyle = '#9bb8c4';
      for (let n = 0; n <= 4; n++) {
        const val = range.min + n * (range.max - range.min) / 4;
        ctx.fillText(val.toFixed(range.max - range.min < 3 ? 2 : 1), left + n * pw / 4 - 12, h - 8);
      }
      ctx.fillText('dB*', 3, 11);
    }
    function drawWaterfall(range) {
      const {ctx, w, h} = resizeCanvas($('sdr-waterfall'));
      ctx.fillStyle = '#091923'; ctx.fillRect(0, 0, w, h);
      // Display a maximum 160 historical frames, newest at top; no hidden ongoing updates.
      const frames = dataset.frames, count = Math.min(frames.length, 160), first = frames.length - count;
      for (let r = 0; r < count; r++) {
        const f = frames[first + r], bins = visibleBins(f, range.min, range.max);
        const y = (count - r - 1) / count * h, rowH = Math.max(1, h / count + .4);
        for (const b of bins) {
          const x = (b.mhz - range.min) / (range.max - range.min) * w;
          const bw = Math.max(1, w / Math.max(1, bins.length) + .8);
          ctx.fillStyle = powerColor(b.db); ctx.fillRect(x, y, bw, rowH);
        }
      }
    }
    function draw() {
      if (!dataset) {
        drawEmpty($('sdr-spectrum'), 'No spectrum loaded · not a live receiver');
        drawEmpty($('sdr-waterfall'), 'Select a local CSV or load DEMO');
        $('sdr-frame-info').textContent = 'No measurements loaded'; return;
      }
      const range = selectedRange();
      if (!range) {
        updateLabel('Invalid display frequency range. Enter minimum below maximum (0–30000 MHz).', 'error'); return;
      }
      frameIndex = Math.max(0, Math.min(dataset.frames.length - 1, frameIndex));
      const frame = dataset.frames[frameIndex];
      drawSpectrum(frame, range); drawWaterfall(range);
      const bins = visibleBins(frame, range.min, range.max);
      $('sdr-frame-info').textContent = `Frame ${frameIndex + 1}/${dataset.frames.length} · ${frame.stamp} (timezone unverified) · ${bins.length} displayed bins · ${range.min.toFixed(3)}–${range.max.toFixed(3)} MHz`;
      $('sdr-frame-slider').max = Math.max(0, dataset.frames.length - 1);
      $('sdr-frame-slider').value = frameIndex;
      $('sdr-frame-slider').disabled = dataset.frames.length < 2;
    }
    function setData(data, label, provenance = 'historical') {
      loadedCaptureId = null;
      dataset = data; sourceLabel = label; frameIndex = data.frames.length - 1;
      clearComparison();
      const range = bounds(data);
      $('sdr-min-mhz').value = range ? range.min.toFixed(3) : '';
      $('sdr-max-mhz').value = range ? range.max.toFixed(3) : '';
      const demo = data.kind === 'SYNTHETIC_DEMO_NOT_LIVE';
      updateLabel(demo ? 'SYNTHETIC DEMO · NOT LIVE · NOT MEASURED' :
        provenance === 'recorded' ? `RECORDED RTL-SDR CSV · ${data.acceptedRows} segments · NOT LIVE · HARDWARE ID UNVERIFIED` :
        `HISTORICAL FILE · ${data.acceptedRows} segments loaded; ${data.rejectedRows} rejected · NOT LIVE`, demo ? 'demo' : provenance);
      draw();
      renderAnalysis();
    }
    $('sdr-demo').addEventListener('click', () => setData(makeDemo(), 'Built-in synthetic demonstration — no radio involved'));
    $('sdr-clear').addEventListener('click', () => {
      dataset = null; sourceLabel = ''; frameIndex = 0;
      $('sdr-local-file').value = ''; $('sdr-min-mhz').value = ''; $('sdr-max-mhz').value = '';
      updateLabel('NO SPECTRUM LOADED · NOT LIVE', 'inactive'); clearComparison(); renderAnalysis(); draw();
    });
    $('sdr-local-file').addEventListener('change', async event => {
      const file = event.target.files?.[0]; if (!file) return;
      if (file.size > MAX_BYTES) { updateLabel('File exceeds the 2 MB browser-local limit.', 'error'); return; }
      try { setData(parseRtlPowerCsv(await file.text()), file.name); }
      catch (e) { dataset = null; sourceLabel = ''; loadedCaptureId = null; clearComparison(); renderAnalysis(); draw(); updateLabel(`Unable to load CSV: ${e.message}`, 'error'); }
    });
    $('sdr-capture-start').addEventListener('click', async () => {
      const settings = {
        start_mhz: Number($('sdr-capture-low').value), stop_mhz: Number($('sdr-capture-high').value),
        step_khz: Number($('sdr-capture-step').value), duration_seconds: Number($('sdr-capture-duration').value),
      };
      $('sdr-capture-start').disabled = true;
      try {
        const result = await requestJSON('/api/sdr/capture/start', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(settings)});
        pendingCaptureId = result.capture.id;
        captureRunning = true;
        captureMessage('Requested RTL-SDR capture · awaiting real tool output. No sample verified yet.');
        await refreshCapture();
      } catch (e) { captureMessage(`Capture not started: ${e.message}`); await checkStatus(true); }
    });
    $('sdr-capture-stop').addEventListener('click', async () => {
      $('sdr-capture-stop').disabled = true;
      try {
        await requestJSON('/api/sdr/capture/stop', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
        captureMessage('Stop requested · partial capture will not be treated as complete.');
        pendingCaptureId = null;
        await refreshCapture();
      } catch (e) { captureMessage(`Stop unsuccessful: ${e.message}`); await refreshCapture(); }
    });
    $('sdr-capture-refresh').addEventListener('click', () => checkStatus(true));
    $('sdr-saved-captures').addEventListener('change', updateSavedButtons);
    $('sdr-saved-open').addEventListener('click', async () => {
      try { await reviewCapture($('sdr-saved-captures').value); }
      catch (e) { captureMessage(`Cannot review: ${e.message}`); }
    });
    $('sdr-saved-delete').addEventListener('click', async () => {
      const id = $('sdr-saved-captures').value;
      if (!/^[0-9a-f]{16}$/.test(id) || !global.confirm('Permanently delete this locally saved SDR capture?')) return;
      try {
        await requestJSON(`/api/sdr/captures/${id}`, {method:'DELETE'});
        if (loadedCaptureId === id) { loadedCaptureId = null; $('sdr-clear').click(); }
        if ($('sdr-baseline-saved').value === id) clearComparison('Baseline capture deleted; select a different one.');
        captureMessage('Saved capture deleted locally.');
        await refreshSaved();
      } catch (e) { captureMessage(`Cannot delete: ${e.message}`); }
    });
    for (const id of ['sdr-min-mhz', 'sdr-max-mhz']) $(id).addEventListener('change', () => {
      clearComparison('Frequency range changed; run comparison again.');
      renderAnalysis(); draw();
    });
    function clearComparison(message = 'No comparison calculated.') {
      comparison = null;
      $('sdr-compare-export').disabled = true;
      $('sdr-compare-status').textContent = message;
      $('sdr-compare-bins').replaceChildren();
    }
    function addCells(tbody, values) {
      const tr = doc.createElement('tr');
      for (const value of values) { const td = doc.createElement('td'); td.textContent = String(value); tr.appendChild(td); }
      tbody.appendChild(tr);
    }
    function renderAnalysis() {
      const tbody = $('sdr-analysis-bins'); tbody.replaceChildren();
      if (!dataset) { $('sdr-analysis-summary').textContent = 'No file or DEMO loaded for offline analysis.'; return; }
      try {
        const result = global.OpenRFSpectrumAnalysis.analyzeSpectrum(dataset, selectedRange());
        $('sdr-analysis-summary').textContent = `${result.demo ? 'SYNTHETIC DEMO · NOT MEASURED · ' : 'RECORDED / HISTORICAL · NOT LIVE · '}` +
          `${result.binCount} unique bins, ${result.sampleCount} bin readings across ${result.frames} frames · median reported ${result.medianDb.toFixed(1)} dB*`;
        for (const x of result.strongest) addCells(tbody, [x.mhz.toFixed(6) + ' MHz', x.db.toFixed(1),
          (x.relativeDb >= 0 ? '+' : '') + x.relativeDb.toFixed(1) + ' dB', x.samples]);
      } catch (e) { $('sdr-analysis-summary').textContent = `No comparable frequency bins: ${e.message}`; }
    }
    $('sdr-baseline-saved').addEventListener('change', () => {
      baselineRevision++;
      baselineFileData = null; $('sdr-baseline-file').value = '';
      const id = $('sdr-baseline-saved').value;
      $('sdr-baseline-label').textContent = id ? 'Saved capture baseline selected (NOT LIVE)' : 'No baseline selected.';
      clearComparison();
    });
    $('sdr-baseline-file').addEventListener('change', async e => {
      const thisRevision = ++baselineRevision;
      const file = e.target.files?.[0];
      $('sdr-baseline-saved').value = '';
      baselineFileData = null;
      clearComparison();
      if (!file) { $('sdr-baseline-label').textContent = 'No baseline selected.'; return; }
      try {
        if (file.size > MAX_BYTES) throw Error('Baseline CSV exceeds 2 MB limit.');
        const parsed = parseRtlPowerCsv(await file.text());
        if (thisRevision !== baselineRevision) return;
        baselineFileData = parsed;
        $('sdr-baseline-label').textContent = `HISTORICAL baseline · ${file.name} · ${parsed.frames.length} frames · browser-local only`;
      } catch (error) { if (thisRevision === baselineRevision) $('sdr-baseline-label').textContent = `Baseline invalid: ${error.message}`; }
    });
    $('sdr-compare-run').addEventListener('click', async () => {
      clearComparison('Calculating offline comparison…');
      if (!dataset) { clearComparison('Load a current capture or CSV first.'); return; }
      const chosenId = $('sdr-baseline-saved').value;
      const expectedData = dataset, expectedRange = selectedRange(), expectedBaselineRevision = baselineRevision;
      $('sdr-compare-run').disabled = true;
      try {
        let baseline = baselineFileData;
        if (chosenId) {
          if (!/^[0-9a-f]{16}$/.test(chosenId)) throw Error('Invalid saved baseline identifier.');
          if (loadedCaptureId && chosenId === loadedCaptureId) throw Error('Choose a different capture for the baseline.');
          const response = await fetch(`/api/sdr/captures/${chosenId}.csv`, {cache: 'no-store'});
          if (!response.ok) throw Error(`Saved baseline unavailable (HTTP ${response.status}).`);
          baseline = parseRtlPowerCsv(await response.text());
        }
        if (!baseline) throw Error('Choose a saved baseline capture or local CSV.');
        // A different source, baseline or display range may be selected while fetching CSV.
        const currentRange = selectedRange();
        if (expectedData !== dataset || !expectedRange || !currentRange ||
            expectedRange.min !== currentRange.min || expectedRange.max !== currentRange.max)
          throw Error('Current spectrum or display range changed. Run comparison again.');
        const result = global.OpenRFSpectrumAnalysis.compareSpectra(expectedData, baseline, expectedRange);
        if (expectedBaselineRevision !== baselineRevision || chosenId !== $('sdr-baseline-saved').value) throw Error('Baseline selection changed. Run again.');
        comparison = result;
        $('sdr-compare-export').disabled = false;
        $('sdr-compare-status').textContent = `${result.demo ? 'SYNTHETIC DEMO INVOLVED · NOT MEASURED · ' : 'OFFLINE HISTORICAL COMPARISON · NOT LIVE · '}` +
          `${result.matchedBins} exact aligned bins (${Math.round(result.overlapRatio * 100)}% of smaller frequency grid). ` +
          `Median current − baseline: ${result.medianDeltaDb.toFixed(1)} dB* · No power calibration or identity inference.`;
        const tbody = $('sdr-compare-bins');
        for (const x of result.notable) addCells(tbody, [x.mhz.toFixed(6) + ' MHz', x.currentDb.toFixed(1),
          x.baselineDb.toFixed(1), (x.deltaDb >= 0 ? '+' : '') + x.deltaDb.toFixed(1) + ' dB']);
      } catch (e) { clearComparison(`Cannot compare: ${e.message}`); }
      finally { $('sdr-compare-run').disabled = false; }
    });
    $('sdr-compare-clear').addEventListener('click', () => clearComparison());
    $('sdr-compare-export').addEventListener('click', () => {
      if (!comparison) return;
      const csv = global.OpenRFSpectrumAnalysis.comparisonCsv(comparison);
      const url = global.URL.createObjectURL(new global.Blob([csv], {type: 'text/csv;charset=utf-8'}));
      const a = doc.createElement('a'); a.href = url; a.download = 'openrf-offline-bin-comparison.csv';
      doc.body.appendChild(a); a.click(); a.remove();
      global.setTimeout(() => global.URL.revokeObjectURL(url), 1000);
    });
    $('sdr-frame-slider').addEventListener('input', e => { frameIndex = Number(e.target.value); draw(); });
    global.addEventListener('resize', () => { if (root.classList.contains('active')) draw(); });
    doc.addEventListener('openrf:spectrum-shown', () => { checkStatus(true); global.requestAnimationFrame(draw); });
    draw();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof window === 'undefined' ? globalThis : window);
