'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {layout,groups}=require('../openrf/static/public-mesh.js');
const networks=['MeshCore','Meshtastic','Reticulum'];
const data=networks.flatMap(network=>[{network,x:60,y:60,lat:1,lon:2,id:'same',role:'Client'},{network,x:61,y:60,lat:1,lon:2,id:'two',role:'Repeater'}]);
function separate(pins){for(let i=0;i<pins.length;i++)for(let j=0;j<i;j++){const a=pins[i],b=pins[j];assert(Math.abs(a.x-b.x)>=46 || Math.abs(a.y-b.y)>=24,'badge anchors must not overlap');}}
const pins=layout(data,n=>n,320,200);assert.equal(pins.length,1);assert.equal(pins[0].parts.length,3);assert.equal(pins[0].nodes.length,6);
for(const g of pins[0].parts){assert.equal(g.nodes.length,2);assert.equal(new Set(g.nodes.map(n=>n.network)).size,1);assert.equal(g.x,60.5);assert.equal(g.y,60);assert(g.nodes.every(n=>n.lat===1&&n.lon===2));}
assert.equal(layout(data.filter(n=>n.network==='MeshCore'),n=>n,320,200)[0].x,60.5);
const edge=networks.flatMap(network=>[47,49,95,97].map(x=>({network,x,y:2})));separate(layout(edge,n=>n,320,200));
const dense=networks.flatMap(network=>Array.from({length:1000},(_,i)=>({network,x:(i*43)%800,y:(i*71)%480})));const densePins=layout(dense,n=>n,800,480);separate(densePins);assert.equal(densePins.reduce((n,g)=>n+g.nodes.length,0),3000);
const far=layout([{network:'MeshCore',x:10,y:10},{network:'Reticulum',x:100,y:10}],n=>n,320,200);assert.equal(far.length,2);assert.equal(far[0].x,10);assert.equal(far[1].x,100);
(async()=>{
 const els=new Map(),vec=[];let boot;
 const make=()=>({checked:false,hidden:true,disabled:false,style:{setProperty(k,v){this[k]=v}},dataset:{},events:{},children:[],textContent:'',setAttribute(){},removeAttribute(k){delete this[k]},addEventListener(k,f){this.events[k]=f},replaceChildren(...x){this.children=x},insertBefore(x,b){this.children.splice(this.children.indexOf(b),0,x)},append(...x){this.children.push(...x)}});const el=id=>{if(!els.has(id))els.set(id,make());return els.get(id)};
 class Marker{constructor(opts){this.opts=opts}setLngLat(coords){this.coords=coords;return this}addTo(){vec.push(this);return this}remove(){}}
 const context={document:{getElementById:el,createElement:make,addEventListener(k,f){boot=f}},window:{maplibregl:{Marker},OpenRFMapFeatureInfo:{close(){},snapButton(lon,lat){return {snap:[lon,lat]}}}},setTimeout,clearTimeout,fetch:async(url)=>({ok:true,json:async()=>({state:'cached',cached_count:1,downloaded_at:1,nodes:[{name:url,id:'same',lat:50,lon:50,role:'Client'}]})})};
 vm.runInNewContext(fs.readFileSync('openrf/static/public-mesh.js','utf8'),context);boot();await new Promise(r=>setImmediate(r));
 for(const prefix of ['public-mesh','public-meshtastic','public-reticulum'])el(prefix+'-nodes').checked=true;
 const parent=make();context.window.OpenRFPublicMesh.raster(parent,{center:[50,50],zoom:2},100,100,(x,y)=>[x,y]);assert.equal(parent.children.length,1);assert.equal(parent.children[0].dataset.kind,'overlap');assert.deepEqual(parent.children[0].children.map(p=>p.dataset.network),networks);assert.equal(parent.children[0].style.left,'50px');assert.equal(parent.children[0].style.top,'50px');
 const map={getCanvas:()=>({clientWidth:100,clientHeight:100}),getCenter:()=>({lng:50}),project:()=>({x:50,y:50}),unproject:xy=>xy,on(){},off(){}};
 context.window.OpenRFPublicMesh.vector(map);assert.equal(vec.length,1);assert.equal(vec[0].opts.element.dataset.kind,'overlap');assert.equal(vec[0].opts.offset.join(','),'0,0');assert(vec[0].coords[0]===50&&vec[0].coords[1]===50);
 const p=parent.children[0];p.events.click({stopPropagation(){}});const body=el('public-mesh-detail').children[1];assert.deepEqual(body.children.filter(c=>c.className==='public-mesh-detail-network').map(c=>c.dataset.network),networks);assert.equal(body.children.filter(c=>c.className==='public-mesh-node-detail').length,3);for(const row of body.children.filter(c=>c.className==='public-mesh-node-detail'))assert.equal(row.children.at(-1).snap.join(','),'50,50');
 el('public-meshtastic-nodes').checked=false;el('public-reticulum-nodes').checked=false;const single=make();context.window.OpenRFPublicMesh.raster(single,{center:[50,50],zoom:2},100,100,(x,y)=>[x,y]);single.children[0].events.click({stopPropagation(){}});assert.equal(el('public-mesh-detail').children[0].children[1].snap.join(','),'50,50');
 const css=fs.readFileSync('openrf/static/app.css','utf8');assert(!css.includes('mesh-leader-length'));for(const color of ['#22d3ee','#a3e635','#ff70d9'])assert(css.includes(color));
 console.log('PASS public mesh network-specific clustering and anchored overlap badges on both renderers');
})().catch(e=>{console.error(e);process.exitCode=1});
