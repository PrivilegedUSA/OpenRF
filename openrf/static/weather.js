/* OpenRF v0.2.170 — offline weather archive, explicit Ecowitt LAN reads only. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const groups = ['dashboard', 'sensors', 'history'];
  const state = {stations:[], selected:null, readings:[], historyEpoch:0, overviewEpoch:0,
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
  const fields = {
    temperature_c:{title:'Temperature',unit:'°F',convert:toF},
    wind_speed_mps:{title:'Wind speed',unit:'mph',convert:toMph},
    wind_gust_mps:{title:'Wind gust',unit:'mph',convert:toMph},
    humidity_pct:{title:'Humidity',unit:'%',convert:v=>v},
    rain_interval_mm:{title:'Rain per observation interval',unit:'in',convert:toInches},
    pressure_hpa:{title:'Pressure',unit:'hPa',convert:v=>v},
    uv_index:{title:'UV index',unit:'',convert:v=>v},
  };
  function setTab(name,focus=false) {
    if (!groups.includes(name)) return;
    state.active = name;
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
    const ids=['weather-dashboard-station','weather-manual-station','weather-import-station','weather-weewx-station','weather-history-station','weather-gateway-station'];
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
    syncSelectors(true);
    renderOverview().catch(error=>el('weather-dashboard-status').textContent=error.message);
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
  async function renderOverview() {
    const epoch=++state.overviewEpoch;
    if(!state.selected){
      state.latest=null;
      for(const id of ['temperature','wind','humidity','rain']){
        el(`weather-${id}`).textContent='—';el(`weather-${id}-meta`).textContent='No recorded value';
      }
      el('weather-last-update').textContent='—';
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
      return;
    }
    updateMetric('weather-temperature',reading.temperature_c,toF,'°F',reading);
    updateMetric('weather-wind',reading.wind_speed_mps,toMph,'mph',reading);
    updateMetric('weather-humidity',reading.humidity_pct,v=>v,'%',reading);
    updateMetric('weather-rain',reading.rain_interval_mm,toInches,'in',reading);
  }
  async function refresh() {
    const result=await request('/api/weather/status');
    state.stations=result.stations||[];
    if(!state.stations.some(s=>s.id===state.selected))state.selected=state.stations[0]?.id||null;
    el('weather-station-count').textContent=String(state.stations.length);
    el('weather-reading-count').textContent=String(result.reading_count||0);
    el('weather-hardware-badge').textContent='NO LIVE SENSOR';
    el('weather-dashboard-status').textContent='No physical weather receiver is configured. Values below are saved records, including optional user-requested gateway snapshots—not an automatic live scan.';
    syncSelectors();renderStationList();await renderOverview();
    if(state.active==='history')await loadHistory();
  }
  el('weather-refresh').addEventListener('click',()=>refresh().catch(error=>{el('weather-dashboard-status').textContent=error.message;}));
  el('weather-open-sensors').addEventListener('click',()=>setTab('sensors'));
  el('weather-dashboard-station').addEventListener('change',e=>setStation(e.target.value));
  el('weather-history-station').addEventListener('change',e=>setStation(e.target.value));

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
    const header='observed_at_utc,temperature_c,humidity_pct,pressure_hpa,wind_speed_mps,wind_gust_mps,wind_direction_deg,rain_interval_mm,uv_index,solar_wm2\r\n';
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
        ? `ECOWITT GATEWAY REPORTED · UNVERIFIED · ${row.source_device||'unknown gateway'}` : row.source_kind;
      const parts=[`${stamp(row.observed_at_utc)} UTC`,origin,
        format(metricValue(row,'temperature_c'),1,' °F'),format(metricValue(row,'wind_speed_mps'),1,' mph'),
        format(row.humidity_pct,1,' %'),format(metricValue(row,'rain_interval_mm'),2,' in')];
      for(const part of parts){const td=document.createElement('td');td.textContent=part;tr.append(td);}
      table.append(tr);
    }
  }
  async function loadHistory() {
    const epoch=++state.historyEpoch,station=state.selected,days=Number(el('weather-history-days').value);
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
  el('weather-history-metric').addEventListener('change',drawChart);
  el('weather-export').addEventListener('click',event=>{
    if(!state.selected){event.preventDefault();status('Create a station before exporting history.',true);}
  });
  window.addEventListener('resize',()=>{if(state.active==='history'&&state.visible)drawChart();});
  document.addEventListener('openrf:weather-shown',()=>{
    state.visible=true;refresh().catch(error=>{el('weather-dashboard-status').textContent=error.message;});
  });
  document.addEventListener('openrf:weather-hidden',()=>{state.visible=false;});
  window.OpenRFWeather=Object.freeze({openTab:setTab,refresh});
})();
