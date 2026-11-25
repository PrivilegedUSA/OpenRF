'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const els=new Map(),calls=[],timers=[];
 const el=id=>{if(!els.has(id))els.set(id,{textContent:'',disabled:false,dataset:{},classList:{toggle(){}},events:{},removeAttribute(k){delete this[k]},addEventListener(k,f){this.events[k]=f}});return els.get(id)};
 let traffic={phase:'idle',snapshot:{}},alpr={phase:'idle',snapshot:{count:150000}};
 const controls=['ALPR','RED_LIGHT','SPEED'].map(cameraType=>({dataset:{cameraType},checked:false,addEventListener(){}}));
 const boot=()=>vm.runInNewContext(fs.readFileSync('openrf/static/camera-layers.js','utf8'),{window:{},state:{mapReady:false},document:{getElementById:el,querySelectorAll:()=>controls},setTimeout:f=>{timers.push(f);return timers.length},clearTimeout(){},fetch:async url=>({ok:true,json:async()=>url.includes('traffic-snapshot')?traffic:url.includes('/snapshot')?alpr:{phase:'idle'}}),api:async(url,method,body)=>{calls.push([url,method,body]);alpr={phase:'failed',error:'HTTP 502',snapshot:{count:150000}};traffic={phase:'downloading',running:true,total_bytes:100,downloaded_bytes:45,snapshot:{}};return {alpr,traffic}}});
 const tick=()=>new Promise(r=>setImmediate(r));
 boot();await tick();assert.equal(calls.length,0);await el('camera-download-national').events.click();assert.equal(calls[0][0],'/api/cameras/nationwide/update');assert.equal(JSON.stringify(calls[0][2]),'{}');assert.match(el('camera-snapshot-status').textContent,/150,000.*HTTP 502/);assert.match(el('camera-traffic-status').textContent,/45%/);assert.equal(el('camera-traffic-progress').value,45);assert.equal(el('camera-download-national').disabled,true);
 boot();await tick();assert.equal(el('camera-download-national').disabled,true);assert.match(el('camera-traffic-status').textContent,/45%/);
 traffic={phase:'ready',snapshot:{speed_count:120,red_light_count:50,updated_utc:'test'}};boot();await tick();assert.equal(el('camera-download-national').disabled,false);assert.match(el('camera-traffic-status').textContent,/120 speed · 50 red-light/);assert.equal(el('camera-traffic-progress').value,100);assert.equal(controls.some(c=>c.checked),false);
 const html=fs.readFileSync('openrf/static/index.html','utf8');assert.match(html,/<details id="camera-area-import"/);assert.match(html,/Update US cameras/);assert.match(html,/SpeedCams.world/);console.log('PASS nationwide camera jobs, independent progress, saved counts, reload and collapsed regional importer');
})().catch(e=>{console.error(e);process.exitCode=1});
