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
assert(html.includes('/static/weather.js?v=0.2.170'));
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
const response=body=>({ok:true,json:async()=>body});
async function fetchMock(path,options={}){
  calls.push({path,options});
  if(path==='/api/weather/status')return response({stations,reading_count:rows.length,automatic_collection:false,connected_devices:0});
  if(path.startsWith('/api/weather/readings?'))return response({readings:rows,source_kind:'MANUAL'});
  const body=JSON.parse(options.body||'{}');
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
  fetch:fetchMock,console,Number,Date,Math,Promise,Blob,URL,
};
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
  console.log('PASS v0.2.170 weather: manual, Ecowitt preview/save, WeeWX import, no auto-collection');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
