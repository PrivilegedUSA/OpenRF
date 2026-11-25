/* OpenRF v0.2.223 weather hub — opt-in local recording and source-tagged history. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const groups = ['dashboard', 'sensors', 'history'];
  const state = {stations:[], selected:null, readings:[], historyEpoch:0, comparisonEpoch:0, overviewEpoch:0,
    alertEpoch:0, alertsStation:null, alerts:null, recording:null, serverClock:null, receivedAt:null,
    active:'dashboard', latest:null, visible:false};
  const chart = el('weather-chart');

  async function request(path, body) {
    const options = body === undefined ? {cache:'no-store'} :
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'};
    const response = await fetch(path,options);
    const content = await response.json();
    if (!response.ok) throw Error(content.error || `Weather operation failed (${response.status}).`);
    return content;
  }
  const status = (message, error=false) => {
    const label = el('weather-sensors-status');
    label.textContent = message;
    label.classList.toggle('error', error);
  };
  const stamp = value => value ? value.replace('T',' ').replace(/\.\d+Z$/, 'Z') : 'Not recorded';
  function format(value, digits=1, suffix='') {
    return value===null || value===undefined || !Number.isFinite(Number(value))
      ? '—' : `${Number(value).toFixed(digits)}${suffix}`;
  }
  const toF = n => n*9/5+32;
  const toMph = n => n*2.2369362921;
  const toInches = n => n/25.4;
  const toC = n => (n-32)*5/9;
  const toMps = n => n/2.2369362921;
  const toMm = n => n*25.4;
  const fields = {
    temperature_c:{title:'Temperature',unit:'°F',convert:toF},
    wind_speed_mps:{title:'Wind speed',unit:'mph',convert:toMph},
    wind_gust_mps:{title:'Wind gust',unit:'mph',convert:toMph},
    humidity_pct:{title:'Humidity',unit:'%',convert:v=>v},
    rain_interval_mm:{title:'Rain per observation interval',unit:'in',convert:toInches},
    rain_rate_mm_h:{title:'Rain rate',unit:'in/hr',convert:toInches},
    pressure_hpa:{title:'Pressure',unit:'hPa',convert:v=>v},
    uv_index:{title:'UV index',unit:'',convert:v=>v},
  };
  function setTab(name,focus=false) {
    if (!groups.includes(name)) return;
    state.active = name;
    window.OpenRFWorkspaceTabs?.remember('weather',name);
    for (const group of groups) {
      const button = el(`weather-tab-${group}`), panel = el(`weather-panel-${group}`);
      button.setAttribute('aria-selected',String(group===name));
      button.tabIndex = group===name ? 0 : -1;
      panel.hidden = group!==name;
    }
    if (focus) el(`weather-tab-${name}`).focus({preventScroll:true});
    if (name==='history') loadHistory();
  }
  groups.forEach((name,index)=>{
    const button=el(`weather-tab-${name}`);
    button.addEventListener('click',()=>setTab(name));
    button.addEventListener('keydown',event=>{
      let destination;
      if(event.key==='ArrowRight')destination=groups[(index+1)%groups.length];
      else if(event.key==='ArrowLeft')destination=groups[(index+groups.length-1)%groups.length];
      else if(event.key==='Home')destination=groups[0];
      else if(event.key==='End')destination=groups[groups.length-1];
      else return;
      event.preventDefault();setTab(destination,true);
    });
  });

  function option(id,name) {
    const option=document.createElement('option');option.value=String(id);option.textContent=name;
    return option;
  }
  function syncSelectors(force=false) {
    const ids=['weather-dashboard-station','weather-manual-station','weather-import-station','weather-weewx-station','weather-history-station','weather-gateway-station','weather-rtl433-station','weather-serial-station','weather-recording-station'];
    for (const id of ids) {
      const select=el(id), prior=select.value;
      select.replaceChildren(option('','Select a station'));
      for (const item of state.stations) select.append(option(item.id,item.name));
      const choice=!force && state.stations.some(s=>String(s.id)===prior) ? prior : String(state.selected||'');
      select.value=choice;
      if (id==='weather-history-station'||id==='weather-dashboard-station')select.disabled=!state.stations.length;
    }
  }
  function setStation(id) {
    const station=state.stations.find(s=>String(s.id)===String(id));
    state.selected=station?.id||null;
    state.alerts=null;state.alertsStation=null;++state.alertEpoch;
    syncSelectors(true);
    renderOverview().catch(error=>el('weather-dashboard-status').textContent=error.message);
    loadAlertSettings().catch(error=>el('weather-alerts-status').textContent=error.message);
    if(state.active==='history')loadHistory();
  }
  function renderStationList() {
    const box=el('weather-station-list');box.replaceChildren();
    if(!state.stations.length){
      const p=document.createElement('p');p.className='small muted';p.textContent='No stations recorded. Create a station below; hardware will not connect automatically.';box.append(p);return;
    }
    for (const station of state.stations) {
      const row=document.createElement('div');row.className='weather-station-row';
      const info=document.createElement('div');
      const title=document.createElement('strong');title.textContent=station.name;
      const detail=document.createElement('small');
      detail.textContent=`${station.reading_count} recorded · ${station.last_observed_at_utc?stamp(station.last_observed_at_utc):'No readings'} · No live receiver`;
      info.append(title,detail);
      if(station.notes){const notes=document.createElement('small');notes.textContent=station.notes;info.append(notes);}
      const button=document.createElement('button');button.type='button';button.className='btn outline';button.textContent='View history';
      button.addEventListener('click',()=>{setStation(station.id);setTab('history');});
      row.append(info,button);box.append(row);
    }
  }
  function updateMetric(id,raw,convert,unit,reading) {
    const available=raw!==null && raw!==undefined;
    el(id).textContent=available?format(convert(raw),1,` ${unit}`):'—';
    el(`${id}-meta`).textContent=available?`${reading.source_kind} · ${stamp(reading.observed_at_utc)} UTC`:'No recorded value';
  }
  // "Freshness" here is the age of a saved entry, never proof that a sensor
  // is connected. Thresholds are opt-in display warnings from the active
  // session only; imported/manual/one-shot and old USB samples cannot alarm.
  const ageSeconds = value => {
    const time=Date.parse(value||'');
    const now=state.serverClock!==null?state.serverClock+(Date.now()-state.receivedAt):Date.now();
    return Number.isFinite(time) ? (now-time)/1000 : null;
  };
  const ageLabel = age => age===null?'unknown age':age<60?'less than 1 minute':age<3600?`${Math.floor(age/60)} min`:`${(age/3600).toFixed(1)} hr`;
  function renderAlerts() {
    const current=state.latest,recording=state.recording||{},rules=state.alerts;
    const badge=el('weather-freshness-badge'),label=el('weather-freshness-status'),notice=el('weather-alerts-status');
    const oldClass='weather-alert-stale';
    badge.classList.toggle(oldClass,false);
    notice.classList.toggle('weather-alert-warning',false);
    notice.classList.toggle('weather-alert-normal',false);
    if(!state.selected){
      badge.textContent='NO STATION';label.textContent='Create or select a station to inspect saved readings.';
    }else if(!current){
      badge.textContent='NO SAVED RECORD';label.textContent='No measurements have been saved for this station. Device health is unknown.';
    }else{
      const age=ageSeconds(current.observed_at_utc),stale=age===null||age< -60||age>60*(rules?.stale_minutes||30);
      badge.textContent=stale?'OLD / UNKNOWN ARCHIVE':'RECENT SAVED RECORD';
      badge.classList.toggle(oldClass,stale);
      label.textContent=`Last saved ${current.source_kind} entry: ${age===null?'unknown recorded time':ageLabel(Math.max(0,age))} old · ${stamp(current.observed_at_utc)} UTC. ${stale?'Archived data may be out of date.':'Recent archive entry only; sensor freshness is not independently verified.'}`;
    }
    if(!rules || state.alertsStation!==state.selected){
      notice.textContent=state.selected?'Loading local alert settings…':'Alerts require a saved station.';return;
    }
    if(!rules.enabled){notice.textContent='Threshold warnings are OFF. Saving the settings does not start a receiver.';return;}
    if(!recording.running || recording.stopping){notice.textContent='Warnings armed, but no active weather recording for this station. Saved history does not trigger alarms.';return;}
    if(recording.station_id!==state.selected){notice.textContent='Warnings armed. The active recorder belongs to a different station.';return;}
    const cutoff=rules.stale_minutes*60;
    const validSession=current?.recording_session_id===recording.session_id;
    const age=validSession?ageSeconds(current.observed_at_utc):ageSeconds(recording.started_at_utc);
    if(age===null||age< -60||age>cutoff){
      notice.textContent=`Recording freshness warning: ${age===null?'sample timing unavailable':`no eligible saved session sample in ${ageLabel(Math.max(0,age))}`}. No weather threshold alarm is inferred.`;
      notice.classList.toggle('weather-alert-warning',true);return;
    }
    if(!validSession){notice.textContent='Recording started; waiting for its first eligible saved sample. Older history cannot trigger alerts.';return;}
    if(!['ECOWITT_GATEWAY_REPORTED','OPENRF_SERIAL_WEATHER_REPORTED'].includes(current.source_kind)){
      notice.textContent='This sample is not from an eligible recording source. No threshold alarm.';return;
    }
    if(current.source_kind==='OPENRF_SERIAL_WEATHER_REPORTED' &&
       (current.freshness!=='FRESHNESS_DEVICE_REPORTED_UNVERIFIED' || current.measurement_age_seconds===null ||
        current.measurement_age_seconds===undefined || current.measurement_age_seconds>120)){
      notice.textContent='USB sensor age is stale or unknown. Threshold warnings are withheld.';return;
    }
    if(['low_temperature_c','high_temperature_c','high_wind_gust_mps','high_rain_rate_mm_h'].every(key=>rules[key]===null)){
      notice.textContent='Warnings enabled, but no measurement limits configured. Recording freshness is still displayed.';return;
    }
    const warning=[];
    if(rules.low_temperature_c!==null&&current.temperature_c!==null&&current.temperature_c!==undefined&&current.temperature_c<=rules.low_temperature_c)
      warning.push(`Temperature ${format(toF(current.temperature_c),1,' °F')} at/below low limit`);
    if(rules.high_temperature_c!==null&&current.temperature_c!==null&&current.temperature_c!==undefined&&current.temperature_c>=rules.high_temperature_c)
      warning.push(`Temperature ${format(toF(current.temperature_c),1,' °F')} at/above high limit`);
    if(rules.high_wind_gust_mps!==null&&current.wind_gust_mps!==null&&current.wind_gust_mps!==undefined&&current.wind_gust_mps>=rules.high_wind_gust_mps)
      warning.push(`Wind gust ${format(toMph(current.wind_gust_mps),1,' mph')} at/above limit`);
    if(rules.high_rain_rate_mm_h!==null&&current.rain_rate_mm_h!==null&&current.rain_rate_mm_h!==undefined&&current.rain_rate_mm_h>=rules.high_rain_rate_mm_h)
      warning.push(`Rain rate ${format(toInches(current.rain_rate_mm_h),2,' in/hr')} at/above limit`);
    notice.textContent=warning.length?`SOURCE-REPORTED LOCAL WARNING: ${warning.join('; ')}. Not independently verified.`:
      'No configured thresholds crossed in the latest eligible saved session sample. Missing measurements are not assumed normal.';
    notice.classList.toggle(warning.length?'weather-alert-warning':'weather-alert-normal',true);
  }
  async function loadAlertSettings(force=false){
    const station=state.selected;
    if(!station){state.alerts=null;state.alertsStation=null;el('weather-alerts-save').disabled=true;renderAlerts();return;}
    if(!force && state.alertsStation===station){renderAlerts();return;}
    const epoch=++state.alertEpoch;
    const result=await request(`/api/weather/alerts?station_id=${station}`);
    if(epoch!==state.alertEpoch||station!==state.selected)return;
    state.alerts=result.settings;state.alertsStation=station;
    const rules=state.alerts;
    el('weather-alerts-save').disabled=false;
    el('weather-alerts-enabled').checked=rules.enabled;
    el('weather-alerts-stale').value=String(rules.stale_minutes);
    for(const [id,value,convert] of [
      ['weather-alerts-temp-low',rules.low_temperature_c,toF],
      ['weather-alerts-temp-high',rules.high_temperature_c,toF],
      ['weather-alerts-wind',rules.high_wind_gust_mps,toMph],
      ['weather-alerts-rain',rules.high_rain_rate_mm_h,toInches]]){
      el(id).value=value===null?'':String(Number(convert(value).toFixed(2)));
    }
    renderAlerts();
  }
  el('weather-alerts-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!state.selected)return;
    const optional=(id,convert)=>{
      const raw=String(el(id).value).trim();
      if(!raw)return null;
      const number=Number(raw);
      if(!Number.isFinite(number))throw Error('Enter a finite number for each filled alert threshold.');
      return convert(number);
    };
    const button=el('weather-alerts-save'),station=state.selected;
    button.disabled=true;
    try{
      const body={station_id:station,enabled:!!el('weather-alerts-enabled').checked,
        stale_minutes:Number(el('weather-alerts-stale').value),
        low_temperature_c:optional('weather-alerts-temp-low',toC),
        high_temperature_c:optional('weather-alerts-temp-high',toC),
        high_wind_gust_mps:optional('weather-alerts-wind',toMps),
        high_rain_rate_mm_h:optional('weather-alerts-rain',toMm)};
      const result=await request('/api/weather/alerts',body);
      if(station!==state.selected)return;
      state.alerts=result.settings;state.alertsStation=station;renderAlerts();
    }catch(error){el('weather-alerts-status').textContent=error.message;}
    finally{button.disabled=!state.selected;}
  });
  async function renderOverview() {
    const epoch=++state.overviewEpoch;
    if(!state.selected){
      state.latest=null;
      for(const id of ['temperature','wind','humidity','rain']){
        el(`weather-${id}`).textContent='—';el(`weather-${id}-meta`).textContent='No recorded value';
      }
      el('weather-last-update').textContent='—';
      renderAlerts();
      return;
    }
    const result=await request(`/api/weather/readings?station_id=${state.selected}&days=0&limit=1`);
    if(epoch!==state.overviewEpoch)return;
    const reading=result.readings.at(-1);state.latest=reading||null;
    el('weather-last-update').textContent=reading?`${stamp(reading.observed_at_utc)} UTC`:'—';
    if(!reading){
      for(const id of ['temperature','wind','humidity','rain']){
        el(`weather-${id}`).textContent='—';el(`weather-${id}-meta`).textContent='No recorded value';
      }
      renderAlerts();
      return;
    }
    updateMetric('weather-temperature',reading.temperature_c,toF,'°F',reading);
    updateMetric('weather-wind',reading.wind_speed_mps,toMph,'mph',reading);
    updateMetric('weather-humidity',reading.humidity_pct,v=>v,'%',reading);
    updateMetric('weather-rain',reading.rain_interval_mm,toInches,'in',reading);
    renderAlerts();
  }
  async function refresh() {
    const result=await request('/api/weather/status');
    const serverClock=Date.parse(result.server_time_utc||'');
    state.serverClock=Number.isFinite(serverClock)?serverClock:null;
    state.receivedAt=Date.now();
    state.stations=result.stations||[];
    if(!state.stations.some(s=>s.id===state.selected)){
      state.selected=state.stations[0]?.id||null;
      state.alerts=null;state.alertsStation=null;++state.alertEpoch;
    }
    state.recording=result.recording||{running:false};
    el('weather-station-count').textContent=String(state.stations.length);
    el('weather-reading-count').textContent=String(result.reading_count||0);
    el('weather-hardware-badge').textContent=result.recording?.running?'RECORDING · SOURCE REPORTED':'NO LIVE SENSOR';
    el('weather-dashboard-status').textContent=result.recording?.running
      ? 'Explicit recording is running. Source-reported readings are not independent sensor verification; see recording status below.'
      : 'No physical weather receiver is configured. Values below are saved records, including optional user-requested gateway snapshots—not an automatic live scan.';
    syncSelectors();renderStationList();await renderOverview();await loadAlertSettings();
    renderRecordingStatus(result.recording||{running:false});
    await loadRecordingSessions();
    if(state.active==='history')await loadHistory();
  }
  el('weather-refresh').addEventListener('click',()=>refresh().catch(error=>{el('weather-dashboard-status').textContent=error.message;}));
  el('weather-open-sensors').addEventListener('click',()=>setTab('sensors'));
  el('weather-dashboard-station').addEventListener('change',e=>setStation(e.target.value));
  el('weather-history-station').addEventListener('change',e=>setStation(e.target.value));

  // GET status/history calls never touch sensors. Only Start authorizes periodic reads.
  let recordingTimer=null;
  function renderRecordingStatus(report){
    const running=!!report.running,stopping=!!report.stopping;
    el('weather-recording-badge').textContent=running?(stopping?'STOPPING…':'RECORDING · USER STARTED'):'STOPPED · OPT-IN';
    el('weather-recording-start').disabled=running;
    el('weather-recording-stop').disabled=!running||stopping;
    el('weather-recording-status').textContent=running
      ? `${stopping?'Stopping':'Recording'} session #${report.session_id}. Maximum 72 hours / 5,000 saved samples. Source-reported, not sensor-verified.`
      : 'Stopped. No scheduled weather reads are running. History remains saved locally.';
    if(recordingTimer!==null){clearTimeout(recordingTimer);recordingTimer=null;}
    if(running && state.visible){
      recordingTimer=setTimeout(()=>{recordingTimer=null;if(state.visible)refresh().catch(error=>{
        el('weather-recording-status').textContent=error.message;});},10000);
    }
  }
  async function loadRecordingSessions(){
    const result=await request('/api/weather/recording/sessions'),container=el('weather-recording-sessions');
    container.replaceChildren();
    if(!result.sessions?.length){
      const p=document.createElement('p');p.className='small muted';p.textContent='No recording sessions yet.';
      container.append(p);return;
    }
    for(const session of result.sessions){
      const line=document.createElement('div');line.className='weather-station-row';
      const main=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');
      title.textContent=`#${session.id} · ${session.station_name} · ${session.state}`;
      meta.textContent=`${session.source_kind} (${session.source_label}) · ${session.interval_seconds}s interval · ${stamp(session.started_at_utc)} to ${stamp(session.ended_at_utc)} UTC · ${session.samples_saved} saved · ${session.skipped_count} skipped · ${session.failure_count} errors${session.last_error?' · '+session.last_error:''}`;
      const download=document.createElement('a');
      download.className='btn outline';download.textContent='Export session CSV';
      download.href=`/api/weather/recording/export.csv?session_id=${encodeURIComponent(session.id)}`;
      download.download=`openrf-weather-session-${session.id}.csv`;
      download.setAttribute('aria-label',`Export saved weather readings for session ${session.id} as CSV`);
      download.title=session.samples_saved?'Download only this recording session’s saved readings.':'No readings saved. CSV contains column headings only.';
      main.append(title,meta);line.append(main,download);container.append(line);
    }
  }
  el('weather-recording-source').addEventListener('change',()=>{
    const serial=el('weather-recording-source').value==='SERIAL';
    el('weather-recording-id-label').hidden=!serial;
    el('weather-recording-channel-label').hidden=!serial;
    el('weather-recording-address').placeholder=serial?'ttyACM0':'192.168.1.40';
  });
  el('weather-recording-start').addEventListener('click',async()=>{
    const button=el('weather-recording-start'),source=el('weather-recording-source').value;
    const body={station_id:Number(el('weather-recording-station').value),source_kind:source,
      source_address:el('weather-recording-address').value.trim(),
      interval_seconds:Number(el('weather-recording-interval').value)};
    if(!body.station_id||!body.source_address){el('weather-recording-status').textContent='Choose a station and exact gateway IP or USB port.';return;}
    if(source==='SERIAL'){
      body.sensor_id=el('weather-recording-sensor-id').value.trim();
      body.channel=el('weather-recording-channel').value.trim();
    }
    button.disabled=true;
    try{
      const result=await request('/api/weather/recording/start',body);
      el('weather-recording-status').textContent=`Started session #${result.session_id}. First read pending.`;
      await refresh();
    }catch(error){el('weather-recording-status').textContent=error.message;button.disabled=false;}
  });
  el('weather-recording-stop').addEventListener('click',async()=>{
    el('weather-recording-stop').disabled=true;
    try{await request('/api/weather/recording/stop',{});await refresh();}
    catch(error){el('weather-recording-status').textContent=error.message;}
  });
  el('weather-recording-refresh').addEventListener('click',()=>refresh().catch(error=>{
    el('weather-recording-status').textContent=error.message;}));

  let readingGateway=false;
  async function readGateway(save) {
    if(readingGateway)return;
    const ip=el('weather-gateway-ip').value.trim(),stationId=Number(el('weather-gateway-station').value);
    const message=el('weather-gateway-status'),preview=el('weather-gateway-preview');
    if(!stationId||!ip){message.textContent='Select a saved station and enter its gateway IPv4 address first.';return;}
    readingGateway=true;
    el('weather-gateway-test').disabled=true;el('weather-gateway-save').disabled=true;
    preview.hidden=true;preview.textContent='';message.textContent=`Requesting one local Ecowitt read from ${ip}…`;
    try{
      const result=await request('/api/weather/ecowitt/read',{station_id:stationId,gateway_ip:ip,save});
      const reading=result.reading;
      const summary=[
        ['Temperature',reading.temperature_c,toF,'°F'],
        ['Humidity',reading.humidity_pct,v=>v,'%'],
        ['Wind',reading.wind_speed_mps,toMph,'mph'],
        ['Gust',reading.wind_gust_mps,toMph,'mph'],
        ['Pressure',reading.pressure_hpa,v=>v,'hPa'],
        ['UV index',reading.uv_index,v=>v,''],
      ].filter(([,value])=>value!==null&&value!==undefined)
        .map(([label,value,convert,unit])=>`${label}: ${format(convert(value),1,unit?' '+unit:'')}`);
      preview.textContent=`GATEWAY REPORTED · NOT HARDWARE VERIFIED · ${ip}\nOpenRF received at ${stamp(reading.observed_at_utc)} UTC\n${summary.join(' · ')}\n${save?'Saved to local history.':'Preview only — not saved.'}`;
      preview.hidden=false;
      message.textContent=save?'Saved one Ecowitt gateway-reported reading to local history. No ongoing connection or polling.':'Read one gateway response for preview. Nothing was saved or scheduled.';
      if(save){await refresh();setStation(stationId);}
    }catch(error){message.textContent=error.message;}
    finally{readingGateway=false;el('weather-gateway-test').disabled=false;el('weather-gateway-save').disabled=false;}
  }
  el('weather-gateway-test').addEventListener('click',()=>readGateway(false));
  el('weather-gateway-save').addEventListener('click',()=>readGateway(true));

  // No rtl_433 request or status poll runs until one of these buttons is used.
  let receiverEpoch=0, receiverRun=null;
  const receiverText=message=>{el('weather-rtl433-status').textContent=message;};
  function renderReceiver(result) {
    const running=!!result.running,run=result.run,container=el('weather-rtl433-results');
    receiverRun=run;
    el('weather-rtl433-start').disabled=running;
    el('weather-rtl433-stop').disabled=!running;
    container.replaceChildren();
    if(!result.available){receiverText('rtl_433 is not installed in the Linux environment. Install it before using an RTL-SDR weather receiver. No hardware was opened.');return;}
    if(!run){receiverText('rtl_433 is installed, but no receiver or weather measurement has been verified. Press Listen to request a bounded receive-only sample.');return;}
    if(running){receiverText(`Receiving at ${run.frequency_mhz} MHz · up to ${run.duration_seconds} seconds · no automatic save. Stop is available.`);return;}
    if(run.state==='FAILED'||run.state==='STOPPED'){receiverText(`${run.state}: ${run.error||'No completed capture.'} No sensor readings were saved.`);return;}
    if(run.state==='EXPIRED'){receiverText('The last weather receiver result has expired. Listen again to save a fresh receipt.');return;}
    if(run.state!=='COMPLETE'){receiverText(`Weather receiver: ${run.state}.`);return;}
    const candidates=run.candidates||[];
    receiverText(candidates.length
      ? `${candidates.length} decoder-reported weather sensor(s) · listen ended ${stamp(run.finished_at_utc)} UTC · source identity and packet timestamps unverified.`
      : 'Listen completed with no compatible weather sensor messages. This does not prove that no sensors are nearby.');
    for(const candidate of candidates){
      const line=document.createElement('div');line.className='weather-station-row';
      const info=document.createElement('div'),title=document.createElement('strong'),summary=document.createElement('small');
      title.textContent=`${candidate.model} · ID ${candidate.device_id}${candidate.channel?' · channel '+candidate.channel:''}`;
      const measurements=candidate.measurements||{};
      const displayed=[['Temp',measurements.temperature_c,toF,'°F'],
        ['Humidity',measurements.humidity_pct,v=>v,'%'],['Wind',measurements.wind_speed_mps,toMph,'mph'],
        ['Gust',measurements.wind_gust_mps,toMph,'mph'],['Wind dir',measurements.wind_direction_deg,v=>v,'°'],
        ['Rain rate',measurements.rain_rate_mm_h,toInches,'in/hr'],['Pressure',measurements.pressure_hpa,v=>v,'hPa']]
        .filter(([,value])=>value!==null&&value!==undefined)
        .map(([label,value,convert,unit])=>`${label}: ${format(convert(value),1,unit?' '+unit:'')}`);
      summary.textContent=`${displayed.join(' · ')} · device-reported battery ${candidate.battery_reported_ok===null?'unknown':candidate.battery_reported_ok?'OK':'low'} · UNVERIFIED`;
      info.append(title,summary);
      const button=document.createElement('button');button.type='button';button.className='btn outline';
      button.textContent=candidate.saved?'Saved':'Save this sensor';button.disabled=!!candidate.saved;
      button.addEventListener('click',async()=>{
        const stationId=Number(el('weather-rtl433-station').value);
        if(!stationId){receiverText('Choose a local station before saving a decoded sensor.');return;}
        button.disabled=true;
        try{
          await request('/api/weather/rtl433/save',{run_id:run.run_id,candidate_id:candidate.candidate_id,station_id:stationId});
          await refresh();setStation(stationId);await loadReceiverStatus();
          receiverText(`Saved one rtl_433 decoder-reported observation to station ${stationId}. Actual sensor identity/time unverified; no continuous listening.`);
        }catch(error){receiverText(error.message);button.disabled=false;}
      });
      line.append(info,button);container.append(line);
    }
  }
  async function loadReceiverStatus(){renderReceiver(await request('/api/weather/rtl433/status'));}
  el('weather-rtl433-refresh').addEventListener('click',()=>loadReceiverStatus().catch(error=>receiverText(error.message)));
  el('weather-rtl433-start').addEventListener('click',async()=>{
    const button=el('weather-rtl433-start');button.disabled=true;receiverText('Requesting a bounded local weather receiver session…');
    try{
      const duration=Number(el('weather-rtl433-duration').value);
      await request('/api/weather/rtl433/start',{
        frequency_mhz:Number(el('weather-rtl433-frequency').value),duration_seconds:duration});
      await loadReceiverStatus();
      const epoch=++receiverEpoch;
      // One status refresh after the requested listening window, not an automatic scan.
      setTimeout(()=>{if(epoch===receiverEpoch && state.visible)loadReceiverStatus().catch(error=>receiverText(error.message));},(duration+2)*1000);
    }catch(error){receiverText(error.message);button.disabled=false;}
  });
  el('weather-rtl433-stop').addEventListener('click',async()=>{
    ++receiverEpoch;
    try{await request('/api/weather/rtl433/stop',{});await loadReceiverStatus();}
    catch(error){receiverText(error.message);}
  });

  // USB weather bridge: inventory, probe, snapshot and selected save are four
  // separate *operator actions*. Showing Weather Station performs none of them.
  const serialText=message=>{el('weather-serial-status').textContent=message;};
  let serialBusy=false, serialReceipt=null;
  const serialActions=['weather-serial-refresh','weather-serial-probe','weather-serial-read'];
  async function serialAction(action){
    if(serialBusy)return;
    serialBusy=true;serialActions.forEach(id=>{el(id).disabled=true;});
    try{await action();}catch(error){serialText(error.message);}
    finally{serialBusy=false;serialActions.forEach(id=>{el(id).disabled=false;});}
  }
  el('weather-serial-refresh').addEventListener('click',()=>serialAction(async()=>{
    const result=await request('/api/weather/serial/ports');
    const selector=el('weather-serial-port'),previous=selector.value;
    selector.replaceChildren(option('','Choose a Linux USB port'));
    for(const port of result.ports||[])selector.append(option(port,port));
    selector.value=(result.ports||[]).includes(previous)?previous:'';
    serialText((result.ports||[]).length
      ? `${result.ports.length} Linux USB serial candidate(s) detected. No port opened or identified. Select a port, then Probe.`
      : 'No Linux USB serial ports detected. WSL may require USB passthrough; no device was opened.');
  }));
  el('weather-serial-probe').addEventListener('click',()=>serialAction(async()=>{
    const port=el('weather-serial-port').value;
    if(!port){serialText('Refresh the USB port list and choose a candidate first.');return;}
    serialText(`Checking OpenRF Weather Serial v1 compatibility on ${port}…`);
    const reply=await request('/api/weather/serial/probe',{port});
    serialText(`${port} replied with ${reply.probe.protocol} · ${reply.probe.label} · hardware ID ${reply.probe.hardware_id} (UNVERIFIED). No measurements were read or saved.`);
  }));
  function renderSerialCapture(capture){
    serialReceipt=capture;
    const list=el('weather-serial-results');list.replaceChildren();
    const candidates=capture.candidates||[];
    serialText(`${candidates.length} weather sensor reading(s) from ${capture.port}, retrieved ${stamp(capture.received_at_utc)} UTC. Identity and measurement age are device-reported, not verified. Nothing has been saved.`);
    if(!candidates.length)return;
    for(const candidate of candidates){
      const line=document.createElement('div');line.className='weather-station-row';
      const info=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small');
      title.textContent=`${candidate.model} · ${candidate.sensor_id}${candidate.channel?' · channel '+candidate.channel:''}`;
      const measurements=candidate.measurements||{};
      const values=Object.entries(fields).filter(([key])=>measurements[key]!==null&&measurements[key]!==undefined)
        .map(([key,field])=>`${field.title}: ${format(field.convert(measurements[key]),1,field.unit?' '+field.unit:'')}`);
      detail.textContent=`${values.join(' · ')} · ${candidate.freshness} · ${candidate.measurement_age_seconds===null?'age unknown':candidate.measurement_age_seconds+' s device-reported age'} · UNVERIFIED`;
      info.append(title,detail);
      const button=document.createElement('button');button.type='button';button.className='btn outline';
      button.textContent=candidate.saved?'Saved':'Save this reading';button.disabled=!!candidate.saved;
      button.addEventListener('click',async()=>{
        if(serialBusy)return;
        const stationId=Number(el('weather-serial-station').value);
        if(!stationId){serialText('Choose a local weather station before saving a reading.');return;}
        button.disabled=true;
        try{
          await request('/api/weather/serial/save',{
            run_id:capture.run_id,candidate_id:candidate.candidate_id,station_id:stationId});
          candidate.saved=true;button.textContent='Saved';
          await refresh();setStation(stationId);
          serialText(`Saved ${candidate.model} to station ${stationId}. ${candidate.freshness} · source identity, device timing and accuracy unverified. No ongoing connection.`);
        }catch(error){serialText(error.message);button.disabled=false;}
      });
      line.append(info,button);list.append(line);
    }
  }
  el('weather-serial-read').addEventListener('click',()=>serialAction(async()=>{
    const port=el('weather-serial-port').value;
    if(!port){serialText('Refresh and select a Linux USB port before reading.');return;}
    serialText(`Requesting one bounded, user-initiated USB weather snapshot from ${port}…`);
    const reply=await request('/api/weather/serial/read',{port});
    renderSerialCapture(reply.capture);
  }));

  el('weather-add-station').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget, button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const result=await request('/api/weather/stations',{
        name:el('weather-new-name').value,notes:el('weather-new-notes').value});
      form.reset();await refresh();setStation(result.station.id);
      status(`Created local station “${result.station.name}”. No receiver was connected.`);
    }catch(error){status(error.message,true);}finally{button.disabled=false;}
  });
  function optionalValue(id,conversion) {
    const raw=el(id).value.trim();
    if(!raw)return null;
    const number=Number(raw);
    if(!Number.isFinite(number))throw Error('Every entered weather value must be a finite number.');
    return conversion(number);
  }
  el('weather-manual-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const stationId=Number(el('weather-manual-station').value),form=event.currentTarget;
    if(!stationId){status('Choose a station first.',true);return;}
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const measurements={
        temperature_c:optionalValue('weather-manual-temp',f=>(f-32)*5/9),
        humidity_pct:optionalValue('weather-manual-humidity',v=>v),
        wind_speed_mps:optionalValue('weather-manual-wind',v=>v/2.2369362921),
        wind_gust_mps:optionalValue('weather-manual-gust',v=>v/2.2369362921),
        wind_direction_deg:optionalValue('weather-manual-direction',v=>v),
        rain_interval_mm:optionalValue('weather-manual-rain',v=>v*25.4),
        rain_rate_mm_h:optionalValue('weather-manual-rainrate',v=>v*25.4),
      };
      const result=await request('/api/weather/readings/manual',{station_id:stationId,measurements});
      form.reset();await refresh();setStation(stationId);
      status(`Saved MANUAL weather reading at ${stamp(result.reading.observed_at_utc)} UTC.`);
    }catch(error){status(error.message,true);}finally{button.disabled=false;}
  });
  el('weather-import-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const stationId=Number(el('weather-import-station').value),file=el('weather-csv-file').files?.[0];
    if(!stationId||!file){status('Select a station and a local CSV file.',true);return;}
    if(file.size>160000){status('CSV must be at most 160 kB.',true);return;}
    const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const text=await file.text();
      const outcome=await request('/api/weather/import/csv',{station_id:stationId,csv_text:text});
      form.reset();await refresh();setStation(stationId);
      status(`Imported ${outcome.imported} HISTORICAL rows (${outcome.duplicates} duplicate rows skipped). No live sensor connection was made.`);
    }catch(error){status(error.message,true);}finally{button.disabled=false;}
  });
  el('weather-weewx-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const stationId=Number(el('weather-weewx-station').value),file=el('weather-weewx-file').files?.[0];
    if(!stationId||!file){status('Select a local station and a WeeWX archive CSV file.',true);return;}
    if(file.size>160000){status('WeeWX CSV must be at most 160 kB.',true);return;}
    const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const result=await request('/api/weather/import/weewx',{station_id:stationId,csv_text:await file.text()});
      form.reset();await refresh();setStation(stationId);
      status(`Imported ${result.imported} WeeWX HISTORICAL rows (${result.duplicates} duplicate rows skipped). All units normalized to SI. No device connected.`);
    }catch(error){status(error.message,true);}finally{button.disabled=false;}
  });
  el('weather-csv-example').addEventListener('click',()=>{
    const header='observed_at_utc,temperature_c,humidity_pct,pressure_hpa,wind_speed_mps,wind_gust_mps,wind_direction_deg,rain_interval_mm,rain_rate_mm_h,uv_index,solar_wm2\r\n';
    const blob=new Blob([header],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url;link.download='openrf-weather-template.csv';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('Downloaded an empty CSV template. Add only actual measured readings with UTC timestamps.');
  });

  function metricValue(row, key) {
    return row[key]===null || row[key]===undefined ? null : fields[key].convert(Number(row[key]));
  }
  function drawChart() {
    const area=el('weather-chart-empty');
    const metric=el('weather-history-metric').value;
    const points=state.readings.map(row=>({at:Date.parse(row.observed_at_utc),v:metricValue(row,metric)}))
      .filter(p=>Number.isFinite(p.at)&&Number.isFinite(p.v));
    area.hidden=points.length>0;
    const context=chart.getContext?.('2d');if(!context)return;
    const width=Math.max(320,Math.floor(chart.parentElement.clientWidth||880)-14),height=240;
    const scale=Math.min(window.devicePixelRatio||1,2);
    chart.width=Math.round(width*scale);chart.height=Math.round(height*scale);
    chart.style.width=`${width}px`;chart.style.height=`${height}px`;
    context.setTransform(scale,0,0,scale,0,0);context.clearRect(0,0,width,height);
    if(!points.length)return;
    const left=55,top=24,right=width-16,bottom=height-37;
    let low=Math.min(...points.map(p=>p.v)),high=Math.max(...points.map(p=>p.v));
    if(low===high){low-=1;high+=1;}
    const minAt=points[0].at,maxAt=points.at(-1).at;
    const x=p=>minAt===maxAt?(left+right)/2:left+(p.at-minAt)/(maxAt-minAt)*(right-left);
    const y=p=>bottom-(p.v-low)/(high-low)*(bottom-top);
    context.font='11px system-ui,sans-serif';context.textBaseline='middle';
    for(let i=0;i<=4;i++){
      const yy=bottom-(bottom-top)*i/4;
      context.strokeStyle='#34545f';context.lineWidth=1;context.beginPath();context.moveTo(left,yy);context.lineTo(right,yy);context.stroke();
      context.fillStyle='#a9c9cc';context.textAlign='right';context.fillText((low+(high-low)*i/4).toFixed(1),left-7,yy);
    }
    context.fillStyle='#a9c9cc';context.textAlign='left';
    context.fillText(new Date(minAt).toLocaleDateString(),left,bottom+20);
    context.textAlign='right';context.fillText(new Date(maxAt).toLocaleDateString(),right,bottom+20);
    context.strokeStyle='#35cbb7';context.lineWidth=2.5;context.lineJoin='round';
    context.beginPath();points.forEach((p,i)=>i?context.lineTo(x(p),y(p)):context.moveTo(x(p),y(p)));context.stroke();
    for(const point of points){context.beginPath();context.arc(x(point),y(point),2.5,0,2*Math.PI);context.fillStyle='#83eddb';context.fill();}
  }
  function renderTable() {
    const table=el('weather-history-rows');table.replaceChildren();
    if(!state.readings.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='No saved readings for the selected time period.';tr.append(td);table.append(tr);return;}
    for(const row of state.readings.slice(-60).reverse()){
      const tr=document.createElement('tr');
      const origin=row.source_kind==='ECOWITT_GATEWAY_REPORTED'
        ? `ECOWITT GATEWAY REPORTED · UNVERIFIED · ${row.source_device||'unknown gateway'}`
        : row.source_kind==='RTL433_RECEIVER_REPORTED'
        ? `RTL_433 DECODED · UNVERIFIED · ${row.source_device||'unknown receiver'}`
        : row.source_kind==='OPENRF_SERIAL_WEATHER_REPORTED'
        ? `USB WEATHER REPORTED · ${row.freshness||'UNKNOWN_AGE'} · UNVERIFIED · ${row.source_device||'unknown bridge'}` : row.source_kind;
      const parts=[`${stamp(row.observed_at_utc)} UTC`,origin,
        format(metricValue(row,'temperature_c'),1,' °F'),format(metricValue(row,'wind_speed_mps'),1,' mph'),
        format(row.humidity_pct,1,' %'),format(metricValue(row,'rain_interval_mm'),2,' in')];
      for(const part of parts){const td=document.createElement('td');td.textContent=part;tr.append(td);}
      table.append(tr);
    }
  }
  async function loadComparison(){
    const panel=el('weather-compare-panel'),enabled=!!el('weather-compare-enabled').checked;
    const epoch=++state.comparisonEpoch;
    panel.hidden=!enabled;
    if(!enabled)return;
    const station=state.selected,days=Number(el('weather-history-days').value);
    const metricName=el('weather-history-metric').value,metric=fields[metricName];
    for(const id of ['current','previous','difference'])el(`weather-compare-${id}`).textContent='—';
    for(const id of ['current','previous','difference'])el(`weather-compare-${id}-detail`).textContent='No comparison yet';
    if(!station){el('weather-compare-status').textContent='Create or select a station first.';return;}
    if(![1,7,30,365].includes(days)){
      el('weather-compare-status').textContent='Choose a fixed period (24 hours, 7 days, 30 days or 1 year). All saved cannot be compared to an equal window.';
      return;
    }
    el('weather-compare-status').textContent='Comparing two equal periods of local archived readings…';
    try{
      const result=await request(`/api/weather/compare?station_id=${station}&days=${days}&metric=${encodeURIComponent(metricName)}`);
      if(epoch!==state.comparisonEpoch)return;
      const current=result.current,previous=result.previous;
      const unit=metric.unit?` ${metric.unit}`:'';
      const display=sample=>sample.count?format(metric.convert(sample.mean),1,unit):'—';
      el('weather-compare-current').textContent=display(current);
      el('weather-compare-previous').textContent=display(previous);
      el('weather-compare-current-detail').textContent=`${current.count} samples · ${current.count?'low '+format(metric.convert(current.minimum),1)+', high '+format(metric.convert(current.maximum),1):'no measurements'}`;
      el('weather-compare-previous-detail').textContent=`${previous.count} samples · ${previous.count?'low '+format(metric.convert(previous.minimum),1)+', high '+format(metric.convert(previous.maximum),1):'no measurements'}`;
      if(current.count&&previous.count){
        const delta=metric.convert(current.mean)-metric.convert(previous.mean);
        el('weather-compare-difference').textContent=`${delta>0?'+':''}${format(delta,1,unit)}`;
        el('weather-compare-difference-detail').textContent='Selected period minus previous period · sample averages';
      }else el('weather-compare-difference-detail').textContent='Requires recorded measurements in both periods';
      el('weather-compare-status').textContent=`${metric.title}: ${days} day${days===1?'':'s'} versus preceding ${days} day${days===1?'':'s'} · saved sample statistics only · mixed sources may be unverified`;
    }catch(error){if(epoch===state.comparisonEpoch)el('weather-compare-status').textContent=error.message;}
  }
  async function loadHistory() {
    const epoch=++state.historyEpoch,station=state.selected,days=Number(el('weather-history-days').value);
    loadComparison();
    el('weather-export').setAttribute('aria-disabled',station?'false':'true');
    el('weather-export').href=station?`/api/weather/export.csv?station_id=${station}`:'#';
    if(!station){state.readings=[];drawChart();renderTable();el('weather-history-status').textContent='Create a station to view history.';return;}
    try{
      const data=await request(`/api/weather/readings?station_id=${station}&days=${days}&limit=1000`);
      if(epoch!==state.historyEpoch)return;
      state.readings=data.readings||[];
      el('weather-history-status').textContent=`${state.readings.length} saved readings in this view · origin-tagged, gateway records not hardware-verified · maximum latest 1,000 rows`;
      drawChart();renderTable();
    }catch(error){if(epoch===state.historyEpoch)el('weather-history-status').textContent=error.message;}
  }
  el('weather-history-days').addEventListener('change',loadHistory);
  el('weather-history-metric').addEventListener('change',()=>{drawChart();loadComparison();});
  el('weather-compare-enabled').addEventListener('change',loadComparison);
  el('weather-export').addEventListener('click',event=>{
    if(!state.selected){event.preventDefault();status('Create a station before exporting history.',true);}
  });
  window.addEventListener('resize',()=>{if(state.active==='history'&&state.visible)drawChart();});
  document.addEventListener('openrf:weather-shown',()=>{
    state.visible=true;refresh().catch(error=>{el('weather-dashboard-status').textContent=error.message;});
  });
  document.addEventListener('openrf:weather-hidden',()=>{
    state.visible=false;
    if(recordingTimer!==null){clearTimeout(recordingTimer);recordingTimer=null;}
  });
  setTab(window.OpenRFWorkspaceTabs?.restore('weather', groups, 'dashboard') || 'dashboard');
  window.OpenRFWeather=Object.freeze({openTab:setTab,refresh});
})();
