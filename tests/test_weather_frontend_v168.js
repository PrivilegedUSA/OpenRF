'use strict';
/* Node DOM stub: synthetic readings are test fixtures, never live sensor output. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const code=fs.readFileSync('openrf/static/weather.js','utf8');
assert(html.includes('data-page="weather"'));
assert(html.includes('id="page-weather"'));
assert(html.includes('/static/weather.js?v='));
assert(app.includes("'weather','messages'"));
assert(app.includes("'openrf:weather-shown'"));
assert(css.includes('.weather-tab-panel[hidden]'));
assert(!/setInterval\(|WebSocket\(|getUserMedia\(|geolocation/.test(code),'Weather archive must not start sensor monitoring');

class Node {
  constructor(id='') {
    this.id=id;this.value='';this.textContent='';this.hidden=false;this.disabled=false;
    this.children=[];this.events={};this.attributes={};this.classList={toggle(){}};
    this.style={};this.parentElement={clientWidth:850};this.tabIndex=0;
  }
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,fn){this.events[name]=fn;}
  querySelector(){return new Node('button');}
  focus(options){this.focusOptions=options;}
  reset(){/* HTML form inputs are independent references in this test double. */}
  getContext(){return null;}
}
const ids=[...html.matchAll(/id="(weather-[^"]+)"/g)].map(match=>match[1]);
const elements=new Map(ids.map(id=>[id,new Node(id)]));
const get=id=>{assert(elements.has(id),`missing actual HTML id ${id}`);return elements.get(id);};
get('weather-history-days').value='7';
get('weather-history-metric').value='temperature_c';
get('weather-hardware-badge');
const docEvents={};const windowEvents={};const calls=[];
const sensorFixture={id:1,name:'TEST FIXTURE',notes:'',reading_count:0,last_observed_at_utc:null};
let stations=[],rows=[],id=0;
let receiverRun=null,receiverRunning=false,receiverSaved=false;
let recordingRunning=false,recordingSessions=[];
const receiverFixture={candidate_id:'fixture-candidate',model:'FIXTURE WEATHER SENSOR',device_id:'fixture-42',
  channel:'A',battery_reported_ok:null,saved:false,measurements:{temperature_c:22,rain_rate_mm_h:5.08}};
const response=body=>({ok:true,json:async()=>body});
async function fetchMock(path,options={}){
  calls.push({path,options});
  if(path==='/api/weather/status')return response({stations,reading_count:rows.length,automatic_collection:recordingRunning,connected_devices:0,
    recording:{running:recordingRunning,session_id:recordingRunning?1:null,stopping:false}});
  if(path==='/api/weather/recording/sessions')return response({sessions:recordingSessions});
  if(path==='/api/weather/rtl433/status')return response({available:true,running:receiverRunning,
    run:receiverRun&&{...receiverRun,candidates:receiverRunning?[]:[{...receiverFixture,saved:receiverSaved}]}});
  if(path==='/api/weather/serial/ports')return response({ports:['ttyACM0'],diagnostics:[],automatic_connection:false});
  if(path.startsWith('/api/weather/readings?'))return response({readings:rows,source_kind:'MANUAL'});
  const body=JSON.parse(options.body||'{}');
  if(path==='/api/weather/recording/start'){
    recordingRunning=true;recordingSessions=[{id:1,station_name:'TEST FIXTURE',state:'RUNNING',
      source_kind:body.source_kind,source_label:body.source_address,interval_seconds:body.interval_seconds,
      started_at_utc:'2026-11-21T12:05:00Z',ended_at_utc:null,samples_saved:0,skipped_count:0,failure_count:0}];
    return response({session_id:1,state:'RUNNING'});
  }
  if(path==='/api/weather/recording/stop'){
    recordingRunning=false;recordingSessions[0].state='STOPPED';return response({state:'STOPPING'});
  }
  if(path==='/api/weather/rtl433/start'){
    receiverRunning=true;receiverRun={run_id:'fixture-run',state:'RUNNING',frequency_mhz:body.frequency_mhz,
      duration_seconds:body.duration_seconds,finished_at_utc:null};
    return response({run:receiverRun});
  }
  if(path==='/api/weather/rtl433/save'){
    assert.deepEqual(Object.keys(body).sort(),['candidate_id','run_id','station_id']);
    assert.equal(body.run_id,'fixture-run');assert.equal(body.candidate_id,'fixture-candidate');
    receiverSaved=true;
    const reading={observed_at_utc:'2026-11-21T12:01:00Z',source_kind:'RTL433_RECEIVER_REPORTED',
      temperature_c:22,rain_rate_mm_h:5.08};
    rows.push(reading);stations[0].reading_count=rows.length;
    return response({reading});
  }
  if(path==='/api/weather/serial/probe'){
    assert.equal(body.port,'ttyACM0');
    return response({probe:{protocol:'openrf.weather.serial.v1',label:'FIXTURE BRIDGE',
      hardware_id:'fixture-hw',identity_verified:false}});
  }
  if(path==='/api/weather/serial/read'){
    assert.equal(body.port,'ttyACM0');
    return response({capture:{port:'ttyACM0',run_id:'fixture-serial-run',
      received_at_utc:'2026-11-21T12:04:00Z',candidates:[{
        candidate_id:'fixture-sensor',sensor_id:'anemometer',model:'FIXTURE WIND',channel:'A',
        freshness:'STALE_DEVICE_REPORTED',measurement_age_seconds:180,saved:false,
        measurements:{wind_speed_mps:12,wind_gust_mps:14}}]}});
  }
  if(path==='/api/weather/serial/save'){
    assert.deepEqual(Object.keys(body).sort(),['candidate_id','run_id','station_id']);
    assert.equal(body.run_id,'fixture-serial-run');assert.equal(body.candidate_id,'fixture-sensor');
    const reading={observed_at_utc:'2026-11-21T12:04:00Z',source_kind:'OPENRF_SERIAL_WEATHER_REPORTED',
      freshness:'STALE_DEVICE_REPORTED',wind_speed_mps:12};
    rows.push(reading);stations[0].reading_count=rows.length;
    return response({reading});
  }
  if(path==='/api/weather/stations'){
    const station={...sensorFixture,id:++id,name:body.name};stations.push(station);
    return response({station});
  }
  if(path==='/api/weather/readings/manual'){
    const reading={id:1,observed_at_utc:'2026-11-21T12:00:00Z',source_kind:'MANUAL',...body.measurements};
    rows=[reading];stations[0].reading_count=1;stations[0].last_observed_at_utc=reading.observed_at_utc;
    return response({reading});
  }
  if(path==='/api/weather/import/csv')return response({imported:1,duplicates:0,total_rows:1});
  if(path==='/api/weather/import/weewx')return response({imported:1,duplicates:0,total_rows:1});
  if(path==='/api/weather/ecowitt/read'){
    const reading={observed_at_utc:'2026-11-21T12:00:30Z',source_kind:'ECOWITT_GATEWAY_REPORTED',
      source_device:body.gateway_ip,temperature_c:20,wind_speed_mps:4,humidity_pct:45,saved:body.save};
    if(body.save){rows=[reading];stations[0].reading_count=1;}
    return response({reading});
  }
  throw Error('Unexpected mock endpoint '+path);
}
const context={
  document:{getElementById:get,createElement:()=>new Node(),addEventListener:(name,fn)=>docEvents[name]=fn},
  window:{devicePixelRatio:1,addEventListener:(name,fn)=>windowEvents[name]=fn},
  fetch:fetchMock,console,Number,Date,Math,Promise,Blob,URL,setTimeout:(fn,delay)=>{pendingTimers.push({fn,delay});return pendingTimers.length;},
  clearTimeout:()=>{},
};
const pendingTimers=[];
vm.runInNewContext(code,context);
assert.equal(calls.length,0,'No hardware scan, file import, or read request on script load');
assert.equal(typeof context.window.OpenRFWeather.openTab,'function');
const next=()=>new Promise(resolve=>setTimeout(resolve,0));
async function test(){
  docEvents['openrf:weather-shown']();
  await next();await next();
  assert.equal(calls[0].path,'/api/weather/status');
  assert.equal(get('weather-hardware-badge').textContent,'NO LIVE SENSOR');
  assert.equal(get('weather-station-count').textContent,'0');
  assert.equal(calls.filter(call=>call.options.method==='POST').length,0);
  assert(!calls.some(call=>call.path.startsWith('/api/weather/rtl433/')),
    'Showing weather must not probe or open an SDR');
  assert(!calls.some(call=>call.path.startsWith('/api/weather/serial/')),
    'Showing weather must not inventory or open USB weather hardware');

  context.window.OpenRFWeather.openTab('sensors');
  get('weather-new-name').value='TEST FIXTURE';
  get('weather-new-notes').value='No device';
  await get('weather-add-station').events.submit({preventDefault(){},currentTarget:get('weather-add-station')});
  assert(calls.some(call=>call.path==='/api/weather/stations'));
  assert.equal(get('weather-dashboard-station').value,'1');
  assert.equal(get('weather-station-count').textContent,'1');

  get('weather-manual-station').value='1';
  get('weather-manual-temp').value='68';
  get('weather-manual-wind').value='10';
  get('weather-manual-humidity').value='0';
  get('weather-manual-rain').value='0.2';
  await get('weather-manual-form').events.submit({preventDefault(){},currentTarget:get('weather-manual-form')});
  const manual=calls.find(call=>call.path==='/api/weather/readings/manual');
  assert(manual,'Manual reading must use explicit POST');
  const measurements=JSON.parse(manual.options.body).measurements;
  assert(Math.abs(measurements.temperature_c-20)<0.00001);
  assert(Math.abs(measurements.wind_speed_mps-4.4704)<0.01);
  assert.equal(measurements.humidity_pct,0);
  assert(Math.abs(measurements.rain_interval_mm-5.08)<0.00001);
  assert.equal(get('weather-reading-count').textContent,'1');
  assert(get('weather-dashboard-status').textContent.includes('No physical weather receiver'));

  context.window.OpenRFWeather.openTab('history');
  await next();await next();
  assert(calls.some(call=>call.path.includes('/api/weather/readings?station_id=1')));
  assert.equal(get('weather-export').href,'/api/weather/export.csv?station_id=1');
  assert.equal(get('weather-history-rows').children.length,1);
  assert.equal(get('weather-history-rows').children[0].children[1].textContent,'MANUAL');
  let prevented=false;
  get('weather-tab-history').events.keydown({key:'Home',preventDefault(){prevented=true;}});
  assert(prevented);
  assert.equal(get('weather-tab-dashboard').attributes['aria-selected'],'true');
  assert.equal(get('weather-tab-dashboard').focusOptions.preventScroll,true);
  assert.equal(calls.filter(call=>call.options.method==='POST').length,2,'Only deliberate user submits write data');
  context.window.OpenRFWeather.openTab('sensors');
  get('weather-gateway-station').value='1';
  get('weather-gateway-ip').value='192.168.1.40';
  await get('weather-gateway-test').events.click();
  const preview=calls.find(call=>call.path==='/api/weather/ecowitt/read');
  assert(preview,'Gateway read occurs only after button click');
  assert.equal(JSON.parse(preview.options.body).save,false);
  assert(get('weather-gateway-preview').textContent.includes('NOT HARDWARE VERIFIED'));
  assert(get('weather-gateway-status').textContent.includes('Nothing was saved'));
  await get('weather-gateway-save').events.click();
  assert.equal(JSON.parse(calls.filter(call=>call.path==='/api/weather/ecowitt/read').at(-1).options.body).save,true);
  assert(get('weather-gateway-preview').textContent.includes('Saved to local history'));

  get('weather-weewx-station').value='1';
  get('weather-weewx-file').files=[{size:80,text:async()=>
    'dateTime,usUnits,outTemp\n1795219200,17,20\n'}];
  await get('weather-weewx-form').events.submit({preventDefault(){},currentTarget:get('weather-weewx-form')});
  assert(calls.some(call=>call.path==='/api/weather/import/weewx'));
  assert(get('weather-sensors-status').textContent.includes('WeeWX HISTORICAL'));
  get('weather-rtl433-frequency').value='433.92';
  get('weather-rtl433-duration').value='10';
  get('weather-rtl433-station').value='1';
  await get('weather-rtl433-refresh').events.click();
  await next();
  assert.equal(calls.filter(call=>call.path==='/api/weather/rtl433/start').length,0,
    'Checking receiver status is not permission to open the device');
  await get('weather-rtl433-start').events.click();
  const start=calls.find(call=>call.path==='/api/weather/rtl433/start');
  assert.deepEqual(JSON.parse(start.options.body),{frequency_mhz:433.92,duration_seconds:10});
  assert.equal(pendingTimers.length,1,'Only a one-shot completion refresh may be scheduled');
  assert.equal(pendingTimers[0].delay,12000);
  receiverRunning=false;receiverRun.state='COMPLETE';receiverRun.finished_at_utc='2026-11-21T12:01:00Z';
  pendingTimers.shift().fn();await next();await next();
  const result=get('weather-rtl433-results').children[0];
  assert(result.children[0].children[0].textContent.includes('FIXTURE WEATHER SENSOR'));
  assert(result.children[0].children[1].textContent.includes('Rain rate'));
  assert(!result.children[0].children[1].textContent.includes('Rain per observation interval'));
  await result.children[1].events.click();
  assert.equal(calls.filter(call=>call.path==='/api/weather/rtl433/save').length,1);
  assert(get('weather-rtl433-status').textContent.includes('Actual sensor identity/time unverified'));
  assert(!calls.some(call=>call.path==='/api/weather/rtl433/stop'),
    'No implicit Stop or device manipulation');
  await get('weather-serial-refresh').events.click();
  assert.equal(get('weather-serial-port').children.length,2);
  assert.equal(calls.filter(call=>call.path==='/api/weather/serial/probe').length,0);
  assert.equal(calls.filter(call=>call.path==='/api/weather/serial/read').length,0);
  get('weather-serial-port').value='ttyACM0';get('weather-serial-station').value='1';
  await get('weather-serial-probe').events.click();
  assert(get('weather-serial-status').textContent.includes('UNVERIFIED'));
  await get('weather-serial-read').events.click();
  const serial=get('weather-serial-results').children[0];
  assert(serial.children[0].children[0].textContent.includes('FIXTURE WIND'));
  assert(serial.children[0].children[1].textContent.includes('STALE_DEVICE_REPORTED'));
  await serial.children[1].events.click();
  assert.equal(calls.filter(call=>call.path==='/api/weather/serial/save').length,1);
  assert(get('weather-serial-status').textContent.includes('No ongoing connection'));
  assert.equal(serial.children[1].textContent,'Saved');
  assert.equal(calls.filter(call=>call.path==='/api/weather/recording/start').length,0,
    'Nothing should schedule recording without an explicit operator click');
  get('weather-recording-station').value='1';get('weather-recording-source').value='ECOWITT';
  get('weather-recording-address').value='192.168.1.40';get('weather-recording-interval').value='300';
  await get('weather-recording-start').events.click();
  const record=JSON.parse(calls.find(call=>call.path==='/api/weather/recording/start').options.body);
  assert.equal(record.source_kind,'ECOWITT');assert.equal(record.interval_seconds,300);
  assert.equal(get('weather-recording-badge').textContent,'RECORDING · USER STARTED');
  context.window.OpenRFWeather.openTab('history');
  assert.equal(get('weather-recording-sessions').children.length,1);
  await get('weather-recording-stop').events.click();
  assert.equal(get('weather-recording-badge').textContent,'STOPPED · OPT-IN');
  console.log('PASS weather: on-demand sources, explicit scheduled recording, history and stop');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
