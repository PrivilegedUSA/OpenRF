/* OpenRF v0.2.48: on-demand, browser-local history of exact frequency bins from
 * COMPLETED saved rtl_power sweeps only. No scan, emitter inference or geolocation.
 */
(function (global) {
  'use strict';
  const MAX_HISTORY = 16;
  const ID = /^[0-9a-f]{16}$/;
  const validNumber = x => typeof x === 'number' && Number.isFinite(x);
  function targetHz(mhz) {
    if (typeof mhz === 'boolean' || mhz === '' || mhz === null || mhz === undefined) throw Error('Enter a frequency in MHz.');
    const num = Number(mhz);
    if (!Number.isFinite(num) || num < 0.001 || num > 30000) throw Error('Frequency must be between 0.001 and 30000 MHz.');
    const hz = num * 1e6;
    if (!Number.isSafeInteger(Math.round(hz)) || Math.abs(hz - Math.round(hz)) > 0.001)
      throw Error('Choose a frequency to 1 Hz precision (six MHz decimals).');
    return Math.round(hz);
  }
  function exactBinMean(data, hz) {
    if (!data || data.kind !== 'RTL_POWER_CSV_HISTORICAL' || !Array.isArray(data.frames)) return null;
    let sum = 0, samples = 0, min = Infinity, max = -Infinity;
    for (const frame of data.frames.slice(0, 160)) {
      if (!frame || !Array.isArray(frame.bins)) continue;
      for (const bin of frame.bins.slice(0, 4096)) {
        if (!bin || !validNumber(bin.mhz) || !validNumber(bin.db) || bin.db < -300 || bin.db > 150) continue;
        if (Math.round(bin.mhz * 1e6) !== hz) continue;
        sum += bin.db; samples++; min = Math.min(min, bin.db); max = Math.max(max, bin.db);
      }
    }
    return samples ? {meanDb: sum / samples, samples, minDb:min, maxDb:max} : null;
  }
  function configKey(capture) {
    const s = capture.settings || {};
    if (![s.start_mhz, s.stop_mhz, s.step_khz].every(Number.isInteger)) return null;
    return `${s.start_mhz}:${s.stop_mhz}:${s.step_khz}`;
  }
  function validCapture(capture) {
    return capture && capture.state === 'COMPLETE' && ID.test(capture.id) &&
      typeof capture.started_at_utc === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(capture.started_at_utc) &&
      Number.isFinite(Date.parse(capture.started_at_utc)) && configKey(capture);
  }
  function analyzeHistory(records, mhz, sameTuning = true) {
    const hz = targetHz(mhz);
    if (!Array.isArray(records) || records.length > MAX_HISTORY) throw Error(`Analyze at most ${MAX_HISTORY} saved captures at once.`);
    const rows = [], skipped = {invalid:0, unmatched:0, differentTuning:0};
    let tuning = null;
    for (const pair of records) {
      const capture = pair && pair.capture;
      if (!validCapture(capture)) { skipped.invalid++; continue; }
      const stat = exactBinMean(pair.data, hz);
      if (!stat) { skipped.unmatched++; continue; }
      const key = configKey(capture);
      if (sameTuning && tuning !== null && key !== tuning) { skipped.differentTuning++; continue; }
      if (tuning === null) tuning = key;
      const fix = capture.observer_fix;
      // Only accuracy is reported; never copy browser lat/lon or raw observer_fix to results.
      const accuracy = fix && validNumber(fix.accuracy_m) && fix.accuracy_m >= 0 && fix.accuracy_m <= 1e6
        && fix.location_source === 'BROWSER_REPORTED' ? fix.accuracy_m : null;
      rows.push({id:capture.id, startedAtUtc:capture.started_at_utc,
        sessionId:Number.isInteger(capture.session_id) && capture.session_id > 0 ? capture.session_id : null,
        meanDb:stat.meanDb, minDb:stat.minDb, maxDb:stat.maxDb, samples:stat.samples,
        tuning:key, browserAccuracyM:accuracy});
    }
    rows.sort((a,b) => Date.parse(a.startedAtUtc)-Date.parse(b.startedAtUtc) || a.id.localeCompare(b.id));
    return {hz, mhz:hz/1e6, rows, skipped, sameTuning:!!sameTuning,
      note:'RECORDED ONLY. rtl_power reported dB, not calibrated dBm. Gain, receiver identity and antenna setup are unverified.'};
  }
  function csvField(value) {
    const text = value == null ? '' : String(value);
    // Protect spreadsheet programs from formula injection, even if a local sidecar was tampered with.
    const safe = /^[=+@\-\t\r]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text) ? "'" + text : text;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  }
  function historyCsv(result) {
    if (!result || !Array.isArray(result.rows) || !result.rows.length) throw Error('Run history analysis before exporting.');
    const header = [
      '# OpenRF RECORDED rtl_power exact-bin history - NOT LIVE; no simulated samples',
      '# Means of uncalibrated reported dB, NOT dBm. Receiver, gain, antenna and conditions unverified.',
      '# Host capture-start UTC only. rtl_power CSV frame timestamp timezone is UNVERIFIED.',
      '# Browser observer coordinates are intentionally omitted; no transmitter direction/location is inferred.',
      'capture_id,capture_started_utc,frequency_mhz,mean_reported_db,min_reported_db,max_reported_db,bin_samples,investigation_id,reported_browser_accuracy_m,tuning_mhz_mhz_khz'
    ];
    for (const row of result.rows) header.push([row.id, row.startedAtUtc, result.mhz.toFixed(6), row.meanDb.toFixed(3),
      row.minDb.toFixed(3), row.maxDb.toFixed(3), row.samples, row.sessionId,
      row.browserAccuracyM, row.tuning].map(csvField).join(','));
    return header.join('\r\n')+'\r\n';
  }
  const core = {MAX_HISTORY, targetHz, exactBinMean, analyzeHistory, historyCsv};
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  global.OpenRFSDRHistory = core;
  if (!global.document) return;
  const doc = global.document;
  const $ = id => doc.getElementById(id);
  function start() {
    if (!$('sdr-history-run') || !global.OpenRFSpectrum) return;
    let last = null, revision = 0, busy = false;
    function status(message) { $('sdr-history-status').textContent = message; }
    function clear(message='Choose a frequency and press Analyze saved sweeps.') {
      revision++; last = null;
      $('sdr-history-export').disabled = true;
      $('sdr-history-rows').replaceChildren();
      const canvas = $('sdr-history-chart');
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
      status(message);
    }
    function cells(row, items) {
      const tr = doc.createElement('tr');
      for (const item of items) { const td=doc.createElement('td'); td.textContent=String(item); tr.appendChild(td); }
      row.appendChild(tr);
    }
    function draw(result) {
      const canvas=$('sdr-history-chart');
      const width=Math.max(270,Math.round(canvas.getBoundingClientRect().width||500)), height=190;
      const dpr=Math.min(global.devicePixelRatio||1,2);
      canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
      const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.fillStyle='#091923';ctx.fillRect(0,0,width,height);
      const rows=result.rows;
      if (!rows.length) return;
      const left=52,right=15,top=19,bottom=40,pw=width-left-right,ph=height-top-bottom;
      let lo=Math.min(...rows.map(r=>r.meanDb)), hi=Math.max(...rows.map(r=>r.meanDb));
      const pad=Math.max(3,(hi-lo)*0.18);lo-=pad;hi+=pad;
      ctx.font='11px sans-serif';ctx.fillStyle='#a0bcc8';ctx.strokeStyle='#254151';ctx.lineWidth=1;
      for(let i=0;i<=3;i++){
        const y=top+ph*i/3;
        ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();
        ctx.fillText((hi-(hi-lo)*i/3).toFixed(1),4,y+3);
      }
      const x=i=>left+(rows.length===1?pw/2:i*pw/(rows.length-1));
      const y=v=>top+(hi-v)/(hi-lo)*ph;
      ctx.strokeStyle='#40d8c0';ctx.lineWidth=2;ctx.beginPath();
      rows.forEach((r,i)=>{if(i)ctx.lineTo(x(i),y(r.meanDb));else ctx.moveTo(x(i),y(r.meanDb));});ctx.stroke();
      ctx.fillStyle='#40d8c0';rows.forEach((r,i)=>{ctx.beginPath();ctx.arc(x(i),y(r.meanDb),3.5,0,Math.PI*2);ctx.fill();});
      ctx.fillStyle='#a0bcc8';ctx.fillText('Reported dB*',4,11);
      ctx.fillText('Oldest',left,height-12);ctx.fillText('Newest',Math.max(left,width-right-49),height-12);
    }
    async function api(url) {
      const res=await global.fetch(url,{cache:'no-store'});
      if(!res.ok)throw Error(`Local saved-capture API returned HTTP ${res.status}.`);
      return res.json();
    }
    async function refreshSessions() {
      const sessions=await api('/api/sessions');
      const selector=$('sdr-history-session'), previous=selector.value;
      selector.replaceChildren();
      for(const [value,label] of [['','All investigations'],['unlinked','No investigation']]){
        const opt=doc.createElement('option');opt.value=value;opt.textContent=label;selector.appendChild(opt);
      }
      for (const s of sessions.sessions||[]) {
        if(!Number.isInteger(s.id) || s.id<1) continue;
        const opt=doc.createElement('option');opt.value=String(s.id);opt.textContent=s.name||`Investigation ${s.id}`;
        selector.appendChild(opt);
      }
      selector.value=[...selector.options].some(o=>o.value===previous)?previous:'';
    }
    $('sdr-history-details').addEventListener('toggle',()=>{
      if($('sdr-history-details').open) refreshSessions().catch(e=>status(`Could not load investigations: ${e.message}`));
    });
    async function run() {
      if(busy)return;
      busy=true;const epoch=++revision;$('sdr-history-run').disabled=true;
      last=null;$('sdr-history-export').disabled=true;$('sdr-history-rows').replaceChildren();
      try {
        const frequency=$('sdr-history-frequency').value;
        core.targetHz(frequency);
        status('Loading completed saved recordings locally; no receiver scan is running…');
        const listing=await api('/api/sdr/captures');
        await refreshSessions();
        if(epoch!==revision)return;
        const selector=$('sdr-history-session');
        const filter=selector.value;
        const all=(listing.captures||[]).filter(c=>validCapture(c) &&
          (filter==='' || (filter==='unlinked' ? c.session_id == null : c.session_id===Number(filter))));
        const chosen=all.slice(0,MAX_HISTORY); // newest according to the manager's sorted API
        const samples=[];let unreadable=0;
        for(const capture of chosen){
          if(epoch!==revision)return;
          try {
            const response=await global.fetch(`/api/sdr/captures/${capture.id}.csv`,{cache:'no-store'});
            if(!response.ok) throw Error('Capture is no longer readable.');
            const data=global.OpenRFSpectrum.parseRtlPowerCsv(await response.text());
            samples.push({capture,data});
          } catch(_) {unreadable++; }
        }
        if(epoch!==revision)return;
        last=core.analyzeHistory(samples,frequency,$('sdr-history-same-tuning').checked);
        const r=last;
        status(`RECORDED · NOT LIVE · ${r.rows.length} of ${chosen.length} examined sweeps have a matching ${r.mhz.toFixed(6)} MHz bin. `+
          `${all.length>MAX_HISTORY?`Most recent ${MAX_HISTORY} considered (of ${all.length}). `:''}`+
          `${r.skipped.unmatched} with no exact bin; ${r.skipped.differentTuning} excluded by tuning; ${unreadable} unavailable. `+
          `Each point is a mean of reported uncalibrated dB; gain/receiver setup unknown. No transmitter identity or location inferred.`);
        for (const row of r.rows) cells($('sdr-history-rows'), [row.startedAtUtc,
          `${row.meanDb.toFixed(1)} dB*`, row.samples, row.sessionId??'—',
          row.browserAccuracyM==null?'Unlocated':`Browser ±${row.browserAccuracyM.toFixed(0)} m`, row.tuning]);
        draw(r);$('sdr-history-export').disabled=!r.rows.length;
        if(!r.rows.length)last=null;
      }catch(err){if(epoch===revision)clear(`Could not analyze saved sweeps: ${err.message}`);}
      finally{busy=false;$('sdr-history-run').disabled=false;}
    }
    $('sdr-history-run').addEventListener('click',run);
    $('sdr-history-export').addEventListener('click',()=>{
      if(!last)return;
      const data=core.historyCsv(last), url=global.URL.createObjectURL(new global.Blob([data],{type:'text/csv;charset=utf-8'}));
      const a=doc.createElement('a');a.href=url;a.download='openrf-recorded-frequency-history.csv';
      doc.body.appendChild(a);a.click();a.remove();global.setTimeout(()=>global.URL.revokeObjectURL(url),1000);
    });
    $('sdr-history-frequency').addEventListener('input',()=>clear('History frequency changed. Analyze again.'));
    for(const id of ['sdr-history-session','sdr-history-same-tuning']) $(id).addEventListener('change',()=>clear('History settings changed. Analyze again.'));
    doc.addEventListener('openrf:sdr-sites-changed',()=>clear('Saved recordings may have changed. Analyze again to refresh history.'));
    global.addEventListener('resize',()=>{if(last)draw(last);});
  }
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start);else start();
})(typeof window==='undefined'?globalThis:window);
