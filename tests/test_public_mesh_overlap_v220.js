'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {layout,groups}=require('../openrf/static/public-mesh.js');
const networks=['MeshCore','Meshtastic','Reticulum'];
const data=networks.flatMap(network=>[{network,x:60,y:60,lat:1,lon:2,id:'same',role:'Client'},{network,x:61,y:60,lat:1,lon:2,id:'two',role:'Repeater'}]);
function separate(pins){for(let i=0;i<pins.length;i++)for(let j=0;j<i;j++){const a=pins[i],b=pins[j];assert(Math.abs(a.displayX-b.displayX)>=(a.width+b.width)/2+4 || Math.abs(a.displayY-b.displayY)>=(a.height+b.height)/2+4,'markers must not overlap');}}
const pins=layout(data,n=>n,320,200);assert.equal(pins.length,3);separate(pins);
for(const g of pins){assert.equal(g.nodes.length,2);assert.equal(new Set(g.nodes.map(n=>n.network)).size,1);assert.equal(g.x,60.5);assert.equal(g.y,60);assert(g.nodes.every(n=>n.lat===1&&n.lon===2));}
assert.equal(layout(data.filter(n=>n.network==='MeshCore'),n=>n,320,200)[0].displayX,60.5);
// Cross-bin neighbors, exact co-location, edge positioning and dense maps.
const edge=networks.flatMap(network=>[63,65,127,129].map(x=>({network,x,y:2})));separate(layout(edge,n=>n,320,200));
const dense=networks.flatMap(network=>Array.from({length:1000},(_,i)=>({network,x:(i*43)%800,y:(i*71)%480})));const densePins=layout(dense,n=>n,800,480);separate(densePins);assert.equal(densePins.reduce((n,g)=>n+g.nodes.length,0),3000);
(async()=>{
 const els=new Map(),vec=[];let boot;
 const make=()=>({checked:false,hidden:true,disabled:false,style:{setProperty(k,v){this[k]=v}},dataset:{},events:{},children:[],textContent:'',setAttribute(){},removeAttribute(k){delete this[k]},addEventListener(k,f){this.events[k]=f},replaceChildren(...x){this.children=x},append(...x){this.children.push(...x)}});const el=id=>{if(!els.has(id))els.set(id,make());return els.get(id)};
 class Marker{constructor(opts){this.opts=opts}setLngLat(coords){this.coords=coords;return this}addTo(){vec.push(this);return this}remove(){}}
 const context={document:{getElementById:el,createElement:make,addEventListener(k,f){boot=f}},window:{maplibregl:{Marker}},setTimeout,clearTimeout,fetch:async(url)=>({ok:true,json:async()=>({state:'cached',cached_count:1,downloaded_at:1,nodes:[{name:url,id:'same',lat:50,lon:50,role:'Client'}]})})};
 vm.runInNewContext(fs.readFileSync('openrf/static/public-mesh.js','utf8'),context);boot();await new Promise(r=>setImmediate(r));
 for(const prefix of ['public-mesh','public-meshtastic','public-reticulum'])el(prefix+'-nodes').checked=true;
 const parent=make();context.window.OpenRFPublicMesh.raster(parent,{center:[50,50],zoom:2},100,100,(x,y)=>[x,y]);assert.equal(parent.children.length,3);assert.equal(new Set(parent.children.map(p=>p.dataset.network)).size,3);assert.equal(new Set(parent.children.map(p=>p.style.left+','+p.style.top)).size,3);
 const map={getCanvas:()=>({clientWidth:100,clientHeight:100}),getCenter:()=>({lng:50}),project:()=>({x:50,y:50}),unproject:xy=>xy,on(){},off(){}};
 context.window.OpenRFPublicMesh.vector(map);assert.equal(vec.length,3);assert.equal(new Set(vec.map(m=>m.opts.element.dataset.network)).size,3);assert.equal(new Set(vec.map(m=>m.opts.offset.join(','))).size,3);assert(vec.every(m=>m.coords[0]===50&&m.coords[1]===50));
 const p=parent.children.find(p=>p.dataset.network==='Reticulum');p.events.click({stopPropagation(){}});assert.match(el('public-mesh-detail').children[0].children[0].textContent,/Reticulum/);
 console.log('PASS public mesh network-specific clustering and collision offsets on both renderers');
})().catch(e=>{console.error(e);process.exitCode=1});
