'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {runtimeMetrics}=require('../tools/openrf-electron/runtime-metrics');
const source=fs.readFileSync('tools/openrf-electron/main.js','utf8');
const preload=fs.readFileSync('tools/openrf-electron/preload.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const settings=fs.readFileSync('openrf/static/app-settings.js','utf8');
const build=JSON.parse(fs.readFileSync('tools/openrf-electron/package.json','utf8'));
assert(build.build.files.includes('runtime-metrics.js'),'Debian shell must bundle the resource sampler');

assert(source.includes('view.setVisible(visible)'),'Inactive native tabs need actual view visibility changes');
assert(source.includes('view.setVisible(false)'),'New remote browser tabs must begin hidden');
assert(source.includes('backgroundThrottling:true'),'Native views must retain Chromium background throttling');
assert(source.includes('requestSingleInstanceLock()'),'Second shell should focus the existing OpenRF window');
assert(source.includes("kind==='runtime'"));
assert(preload.includes("runtime:()=>action('runtime')"));
assert(html.includes('id="app-native-runtime" hidden'));
for(const id of ['app-native-working','app-native-available','app-native-processes',
  'app-native-tabs','app-native-refresh','app-native-detail'])assert(html.includes(`id="${id}"`));

const reading=runtimeMetrics({
  app:{getAppMetrics:()=>[
    {memory:{workingSetSize:4096},cpu:{percentCPUUsage:1.2}},
    {memory:{workingSetSize:1024},cpu:{percentCPUUsage:3.3}}]},
  electronProcess:{getSystemMemoryInfo:()=>({total:8*1024*1024,available:2*1024*1024})},
  openTabs:2,backendOwned:true});
assert.equal(reading.kind,'OPENRF_NATIVE_RUNTIME');
assert.equal(reading.read_only,true);
assert.equal(reading.process_count,2);
assert.equal(reading.process_working_sets_kib,5120);
assert.equal(reading.cpu_sample_percent,4.5);
assert.equal(reading.system_available_kib,2097152);
assert.equal(reading.open_browser_tabs,2);
assert.equal(reading.backend_owned,true);
assert(!Object.keys(reading).some(key=>/pid|url|path/i.test(key)),'No sensitive process details leak into the frontend');
assert.equal(runtimeMetrics({app:{getAppMetrics:()=>[{memory:{}}]},
  electronProcess:{getSystemMemoryInfo:()=>({})}}).process_working_sets_kib,null,
  'Unavailable memory must stay unavailable');

function element(){return {hidden:true,disabled:false,textContent:'',listeners:{},
  classList:{contains:()=>false},addEventListener(k,fn){this.listeners[k]=fn;}};}
const nodes=Object.fromEntries([
  'page-settings','app-storage-refresh','app-field-check','app-native-runtime',
  'app-native-refresh','app-native-working','app-native-available',
  'app-native-processes','app-native-tabs','app-native-detail',
].map(key=>[key,element()]));
const listeners={};let snapshots=0;
const context={
  document:{getElementById:id=>nodes[id],addEventListener:(name,fn)=>{listeners[name]=fn;}},
  window:{openrfNativeBrowser:{available:true,runtime:async()=>{snapshots++;return reading;}}},
};
vm.runInNewContext(settings,context);
(async()=>{
  assert.equal(snapshots,0,'Shell metrics must never poll at map startup');
  assert.equal(nodes['app-native-runtime'].hidden,false,'Visible only in native shell');
  await nodes['app-native-refresh'].listeners.click();
  assert.equal(snapshots,1);
  assert.equal(nodes['app-native-working'].textContent,'5.0 MiB');
  assert.equal(nodes['app-native-available'].textContent,'2.0 GiB');
  assert.equal(nodes['app-native-processes'].textContent,'2');
  assert.equal(nodes['app-native-tabs'].textContent,'2');
  assert.match(nodes['app-native-detail'].textContent,/CPU sample: 4.5%/);
  assert(!nodes['app-native-refresh'].disabled);
  console.log('PASS v0.2.156 on-demand local Electron metrics and kept-alive hidden native browser tabs');
})().catch(error=>{console.error(error);process.exitCode=1;});
