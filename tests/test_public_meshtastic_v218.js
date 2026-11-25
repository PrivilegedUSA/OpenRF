'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 const els=new Map(),calls=[];let boot;const make=()=>({checked:false,hidden:true,disabled:false,style:{},dataset:{},events:{},children:[],textContent:'',setAttribute(){},removeAttribute(k){delete this[k]},addEventListener(k,f){this.events[k]=f},replaceChildren(...x){this.children=x},append(...x){this.children.push(...x)}});const el=id=>{if(!els.has(id))els.set(id,make());return els.get(id)};
 const mesh={state:'cached',cached_count:1,downloaded_at:1,nodes:[{name:'Core repeater',id:'a',role:'Repeater',lat:2,lon:2}]},tastic={state:'cached',cached_count:1,downloaded_at:1,nodes:[{name:'Tastic router',id:'b',role:'Repeater',lat:60,lon:60}]};
 let meshtastic=tastic;
 const context={document:{getElementById:el,createElement:make,addEventListener(k,f){boot=f}},window:{confirm:()=>true},setTimeout,clearTimeout,fetch:async(url,opts)=>{calls.push([url,opts?.method]);if(url.endsWith('/clear'))meshtastic={state:'empty',nodes:[],cached_count:0};return {ok:true,json:async()=>url.includes('meshtastic')?meshtastic:mesh}}};
 vm.runInNewContext(fs.readFileSync('openrf/static/public-mesh.js','utf8'),context);boot();await new Promise(r=>setImmediate(r));assert.equal(calls.filter(c=>c[1]==='POST').length,0);
 el('public-mesh-nodes').checked=true;el('public-meshtastic-repeaters').checked=true;const raster=()=>{let p=make();context.window.OpenRFPublicMesh.raster(p,{center:[50,50],zoom:2},100,100,(x,y)=>[x,y]);return p.children};let pins=raster();assert.equal(pins.length,2);assert.deepEqual(pins.map(p=>p.dataset.network).sort(),['MeshCore','Meshtastic']);assert.equal(pins.find(p=>p.dataset.network==='Meshtastic').textContent,'M');assert.equal(pins.find(p=>p.dataset.network==='MeshCore').textContent,'C');assert.equal(pins.find(p=>p.dataset.network==='MeshCore').dataset.kind,'repeater');assert.match(pins.find(p=>p.dataset.network==='MeshCore').title,/Repeater/);
 await el('public-meshtastic-clear').events.click(); // confirmation handler launches async request
 await new Promise(r=>setImmediate(r));assert.equal(raster().length,1);assert.equal(raster()[0].dataset.network,'MeshCore');assert(calls.some(c=>c[0]==='/api/mesh/public/meshtastic/clear'&&c[1]==='POST'));
 assert.match(fs.readFileSync('openrf/static/index.html','utf8'),/data-public-mesh-layer="meshtasticNodes"/);
 console.log('PASS independent public mesh toggles, mixed-network raster rendering, and Meshtastic-only cache clear');
})().catch(e=>{console.error(e);process.exitCode=1});
