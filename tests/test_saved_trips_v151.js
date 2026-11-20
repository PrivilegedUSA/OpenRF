'use strict';
/* v0.2.151: inventory is local/read-only until separately confirmed deletion. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const script=fs.readFileSync('openrf/static/saved-trips.js','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const ids=['page-trips','trip-library-count','trip-library-bytes','trip-library-area-count',
  'trip-library-filter','trip-library-refresh','trip-library-status','trip-library-list',
  'trip-library-areas','trip-library-readiness','offline-map-select'];
for(const id of ids)assert(html.includes(`id="${id}"`),id);
assert(html.includes('/static/saved-trips.js?v=0.2.151'));
assert(html.includes('data-page="trips"'));
assert(app.includes("'trips'"));
assert(!/https?:\/\//.test(script),'Map inventory must never contact online providers');

class E{
  constructor(){this.children=[];this.handlers={};this.textContent='';this.value='';this.disabled=false;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(k,v){this[k]=v;}
  addEventListener(k,fn){this.handlers[k]=fn;}
  fire(k){return this.handlers[k]?.({preventDefault(){}});}
}
const nodes=Object.fromEntries(ids.map(id=>[id,new E()]));
nodes['trip-library-filter'].value='ALL';
let mapList=[{id:'local-walk',name:'Offline trip · topographic',package_kind:'TRIP_CORRIDOR',
  source_label:'USGS Topographic',size_bytes:1200000,minzoom:9,maxzoom:12,
  bounds:[-121,38,-120,39],declared_tile_count:15,attribution:'USGS'},
  {id:'local-import',name:'Imported map',package_kind:'IMPORTED',source_label:'Imported raster package',
  size_bytes:350000,minzoom:5,maxzoom:11,bounds:null,declared_tile_count:null}];
const plan={id:'aaaaaaaaaaaaaaaa',name:'Weekend',bounds:[-121,38,-120,39],minzoom:9,maxzoom:11,candidate_tiles:60};
const calls=[];let promptText='',confirmed=false;
const document={getElementById:id=>nodes[id],createElement:()=>new E(),handlers:{},
  addEventListener(k,fn){this.handlers[k]=fn;}};
const window={prompt:()=>promptText,confirm:()=>confirmed};
const fetch=async(url,options={})=>{
  calls.push({url,method:options.method||'GET'});
  if(url==='/api/maps/catalog')return {ok:true,json:async()=>({maps:mapList,area_plans:[plan],
    package_count:mapList.length,total_bytes:mapList.reduce((sum,map)=>sum+map.size_bytes,0)})};
  if(url==='/api/maps/local-walk'&&options.method==='DELETE'){
    mapList=mapList.filter(map=>map.id!=='local-walk');return {ok:true,json:async()=>({removed:true})};}
  throw Error('Unexpected request '+url);
};
vm.runInNewContext(script,{window,document,fetch,Number,Event:class {constructor(name){this.type=name;}},
  setTimeout:()=>{},refreshOfflineMaps:async()=>{},showPage:()=>{},URL});
(async()=>{
  await window.OpenRFSavedTrips.refresh();
  assert.equal(nodes['trip-library-count'].textContent,'2');
  assert.equal(nodes['trip-library-area-count'].textContent,'1');
  assert.equal(nodes['trip-library-list'].children.length,2);
  assert.equal(nodes['trip-library-areas'].children.length,1);
  assert(calls.every(c=>c.method==='GET'&&c.url==='/api/maps/catalog'));
  nodes['trip-library-filter'].value='TRIP_CORRIDOR';nodes['trip-library-filter'].fire('change');
  assert.equal(nodes['trip-library-list'].children.length,1);
  const card=nodes['trip-library-list'].children[0];
  const remove=card.children.at(-1).children.at(-1);
  await remove.fire('click');
  assert.equal(mapList.length,2,'Cancel on wrong typed name');
  promptText='local-walk';
  await remove.fire('click');
  assert.equal(mapList.length,2,'Second explicit confirmation required');
  confirmed=true;
  await remove.fire('click');
  assert.equal(mapList.length,1);
  assert(calls.some(c=>c.method==='DELETE'&&c.url==='/api/maps/local-walk'));
  assert.equal(nodes['trip-library-count'].textContent,'1');
  assert(!calls.some(c=>!c.url.startsWith('/api/maps/')));
  console.log('PASS v0.2.151 offline map catalog, category filters, local requests and double-confirmed pruning');
})().catch(error=>{console.error(error);process.exitCode=1;});
