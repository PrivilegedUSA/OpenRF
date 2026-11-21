'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const source=fs.readFileSync('openrf/static/app-settings.js','utf8');
assert(html.includes('data-page="settings"'));
assert(html.indexOf('data-page="settings"')>html.indexOf('class="sidebar-bottom"'));
assert(html.includes('id="page-settings"'));
assert(html.includes('/static/app-settings.js?v=0.2.161'));
for(const id of ['app-device-storage','app-storage-free','app-storage-used','app-storage-total',
  'app-storage-track','app-storage-refresh','app-field-check','app-field-results','app-field-status'])
  assert(html.includes(`id="${id}"`),`Missing settings UI ${id}`);
assert(app.includes("'settings'"));
assert(app.includes("new Event('openrf:settings-shown')"));
assert(css.includes('.sidebar .sidebar-bottom .sidebar-settings-btn'));
assert(css.includes('.app-storage-track'));
assert(!source.includes('geolocation')&&!source.includes('getCurrentPosition(')&&!source.includes('innerHTML'));

function node(id){return {id,children:[],textContent:'',style:{},dataset:{},disabled:false,attrs:{},listeners:{},
  classList:{contains:()=>false},replaceChildren(...items){this.children=items;},
  append(...items){this.children.push(...items);},setAttribute(k,v){this.attrs[k]=v;},
  removeAttribute(k){delete this.attrs[k];},addEventListener(k,fn){this.listeners[k]=fn;}};}
const names=['page-settings','app-storage-free','app-storage-used','app-storage-total','app-storage-track',
  'app-storage-fill','app-storage-status-pill','app-storage-detail','app-storage-refresh',
  'app-field-check','app-field-status','app-field-results'];
const nodes=Object.fromEntries(names.map(id=>[id,node(id)]));
const listeners={};const calls=[];
const gb=1024**3;
const storage={read_only:true,scope:'filesystem-containing-openrf-data',
  storage:{state:'OS_REPORTED',free_bytes:2*gb,total_bytes:10*gb,used_bytes:8*gb,warning_level:'OK'}};
const route={kind:'OFFLINE_NAVIGATION_PREFLIGHT',read_only:true,external_requests:false,
  routing_service_reachable:false,local_vector_basemap_ready:false,local_raster_package_count:0};
const resultByPath={'/api/device/storage':storage,'/api/device/power':{battery:{batteries:[]}},
  '/api/navigation/offline-readiness':route,'/api/terrain/tiles':{tiles:[]}};
const context={window:{},document:{getElementById:id=>nodes[id],createElement:node,
  addEventListener:(kind,fn)=>{listeners[kind]=fn;}},
  fetch:async(path,options)=>{calls.push([path,options]);return {ok:true,json:async()=>resultByPath[path]};}};
vm.runInNewContext(source,context);
(async()=>{
  assert.equal(calls.length,0,'Settings must not request data on the Map startup');
  await context.window.OpenRFAppSettings.refreshStorage();
  assert.equal(nodes['app-storage-free'].textContent,'2.0 GiB');
  assert.equal(nodes['app-storage-used'].textContent,'8.0 GiB');
  assert.equal(nodes['app-storage-total'].textContent,'10.0 GiB');
  assert.equal(nodes['app-storage-fill'].style.width,'80.0%');
  assert.equal(nodes['app-storage-track'].attrs['aria-valuenow'],'80.0');
  assert.equal(calls.length,1);
  await nodes['app-field-check'].listeners.click();
  assert.equal(calls.length,5,'Preflight must only access four local read-only resources');
  assert.deepEqual(calls.map(([path])=>path),['/api/device/storage',
    '/api/navigation/offline-readiness','/api/device/power','/api/device/storage','/api/terrain/tiles']);
  const rows=nodes['app-field-results'].children;
  assert.equal(rows.length,6);
  const flatten=rows.map(row=>row.children.map(child=>child.textContent).join(' ')).join('\n');
  assert.match(flatten,/Local Valhalla is unavailable/);
  assert.match(flatten,/No complete local vector map or raster package/);
  assert.match(flatten,/No single Linux battery capacity reported/);
  assert.match(flatten,/Not checked\. Real GPS requires explicit navigation/);
  assert(!calls.some(([path])=>path.includes('gnss')||path.includes('geocode')));
  assert(calls.every(([,options])=>options.cache==='no-store'&&!options.method));
  context.window.OpenRFAppSettings.renderStorage({read_only:true,scope:'filesystem-containing-openrf-data',
    storage:{state:'UNAVAILABLE',free_bytes:null,total_bytes:null}});
  assert.equal(nodes['app-storage-free'].textContent,'—','Unknown filesystem size must not become 0');
  assert.equal(nodes['app-storage-track'].attrs['aria-valuenow'],undefined);
  await listeners['openrf:settings-shown']();
  assert.equal(calls.length,6);
  console.log('PASS v0.2.149 standalone App Settings storage and consent-safe field preflight');
})().catch(err=>{console.error(err);process.exitCode=1;});
