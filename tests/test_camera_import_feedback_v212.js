'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const els=new Map();let requests=0,area=[-122.6,37.6,-122.3,37.9],job={phase:'idle'},timers=[];
 function el(id){if(!els.has(id))els.set(id,{textContent:'',disabled:false,dataset:{},classList:{toggle(){}},events:{},removeAttribute(k){delete this[k]},addEventListener(k,f){this.events[k]=f}});return els.get(id)}
 const controls=['ALPR','RED_LIGHT','SPEED'].map(cameraType=>({dataset:{cameraType},checked:cameraType!=='SPEED',addEventListener(){}}));
 const map={getBounds:()=>({getWest:()=>area[0],getSouth:()=>area[1],getEast:()=>area[2],getNorth:()=>area[3]}),getSource:()=>null,addSource(){},addLayer(){},on(){}};
 const state={map,mapReady:false};
 function boot(){const window={};vm.runInNewContext(fs.readFileSync('openrf/static/camera-layers.js','utf8'),{window,state,document:{getElementById:el,querySelectorAll:()=>controls},setTimeout:f=>{timers.push(f);return timers.length},clearTimeout(){},fetch:async url=>({ok:true,json:async()=>url.includes('import-status')?job:{sites:[]}}),api:async()=>{requests++;return job={phase:'downloading',running:true,received_bytes:25,total_bytes:100,provider:'OSM'}}});return window;}
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 const window=boot();await tick();
 const button=el('camera-import-osm'),status=el('camera-import-status');
 await button.events.click();assert.match(status.textContent,/Zoom/);assert.equal(requests,0);
 state.mapReady=true;await button.events.click();assert.equal(button.disabled,true);assert.equal(status.dataset.phase,'downloading');assert.match(status.textContent,/25%/);assert.equal(el('camera-import-progress').value,25);
 await button.events.click();assert.equal(requests,1);
 await window.OpenRFCameras.refresh(true);assert.equal(status.dataset.phase,'downloading');
 boot();await tick();assert.equal(button.disabled,true);assert.match(status.textContent,/25%/);
 job={phase:'complete',running:false,result:{matched:2,counts:{RED_LIGHT:1,SPEED:1,ALPR:0}},errors:['first provider: HTTP 504']};boot();await tick();assert.equal(button.disabled,false);assert.equal(status.dataset.phase,'complete');assert.match(status.textContent,/1 red-light, 1 speed/);assert.match(status.textContent,/Enable Speed cameras/);assert.match(status.textContent,/HTTP 504/);assert.equal(controls[2].checked,false);
 job={phase:'failed',running:false,error:'HTTP 504'};boot();await tick();assert.equal(status.dataset.phase,'failed');assert.match(status.textContent,/HTTP 504/);assert.equal(button.disabled,false);
 job={phase:'complete',running:false,result:{matched:0,counts:{}}};boot();await tick();assert.match(status.textContent,/No tagged cameras returned/);
 const html=fs.readFileSync('openrf/static/index.html','utf8');assert(html.indexOf('id="camera-import-osm"')>html.indexOf('data-camera-type="SPEED"'));assert(html.indexOf('id="camera-import-osm"')<html.indexOf('id="public-mesh-manager"'));assert(html.includes('> Cellular</label>'));
 console.log('PASS regional server job, reload recovery, measurable progress, outcomes and hidden layers');
})().catch(e=>{console.error(e);process.exitCode=1});
