'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const els=new Map();let complete, pending=0,area=[-122.6,37.6,-122.3,37.9];
 function el(id){if(!els.has(id))els.set(id,{textContent:'',disabled:false,dataset:{},classList:{toggle(){}},events:{},addEventListener(k,f){this.events[k]=f}});return els.get(id)}
 const controls=['ALPR','RED_LIGHT','SPEED'].map(cameraType=>({dataset:{cameraType},checked:cameraType!=='SPEED',addEventListener(){}}));
 const map={getBounds:()=>({getWest:()=>area[0],getSouth:()=>area[1],getEast:()=>area[2],getNorth:()=>area[3]}),getSource:()=>null,addSource(){},addLayer(){},on(){}};
 const window={};const state={map,mapReady:false};
 vm.runInNewContext(fs.readFileSync('openrf/static/camera-layers.js','utf8'),{window,state,document:{getElementById:el,querySelectorAll:()=>controls},setTimeout:()=>1,clearTimeout(){},fetch:async()=>({ok:true,json:async()=>({sites:[]})}),api:()=>{pending++;return new Promise((resolve,reject)=>{complete={resolve,reject}})}});
 const button=el('camera-import-osm'),status=el('camera-import-status');
 await button.events.click();assert.match(status.textContent,/Zoom/);assert.equal(pending,0);
 state.mapReady=true;
 const importing=button.events.click();assert.equal(button.disabled,true);assert.equal(status.dataset.phase,'loading');assert.match(button.textContent,/Importing/);
 await button.events.click();assert.equal(pending,1);
 await window.OpenRFCameras.refresh(true);assert.equal(status.dataset.phase,'loading');
 complete.resolve({import:{matched:2,counts:{RED_LIGHT:1,SPEED:1,ALPR:0}}});await importing;
 assert.equal(button.disabled,false);assert.equal(status.dataset.phase,'complete');assert.match(status.textContent,/1 red-light, 1 speed/);assert.match(status.textContent,/Enable Speed cameras/);assert.equal(controls[2].checked,false);
 await window.OpenRFCameras.refresh(true);assert.equal(status.dataset.phase,'complete');
 const failure=button.events.click();complete.reject(Error('HTTP 504'));await failure;assert.equal(status.dataset.phase,'failed');assert.match(status.textContent,/HTTP 504/);assert.equal(button.disabled,false);await window.OpenRFCameras.refresh(true);assert.equal(status.dataset.phase,'failed');
 const empty=button.events.click();complete.resolve({import:{matched:0,counts:{}}});await empty;assert.match(status.textContent,/No tagged cameras returned/);assert.equal(status.dataset.phase,'complete');
 const html=fs.readFileSync('openrf/static/index.html','utf8');assert(html.indexOf('id="camera-import-osm"')>html.indexOf('data-camera-type="SPEED"'));assert(html.indexOf('id="camera-import-osm"')<html.indexOf('id="public-mesh-manager"'));assert(html.includes('> Cellular</label>'));
 console.log('PASS regional import busy state, persistent success/error/empty results, hidden layers and control placement');
})().catch(e=>{console.error(e);process.exitCode=1});
