'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const script=fs.readFileSync('openrf/static/battery-status.js','utf8');

assert(html.includes('/static/battery-status.js?v=0.2.151'));
assert(html.includes('id="device-battery"'));
assert(css.includes('.device-battery[data-battery="critical"]'));
for(const id of ['area-hgt-file','area-hgt-source','area-hgt-import','area-hgt-installed','area-hgt-remove'])
  assert(html.includes(`id="${id}"`),`Missing local DEM import control ${id}`);
assert(app.includes("fetch('/api/terrain/import'"));
assert(app.includes("api('/api/terrain/tiles')"));
assert(app.includes('Imported offline HGT profile'));
assert(app.includes('state.mapRasterTileSeen===true'));
assert(app.includes('state.mapRasterTileFailed && !state.mapRasterTileSeen'),
  'A pending raster tile is not a map-not-visible failure');

const nodes=new Map(['device-battery','device-battery-value','device-battery-fill']
  .map(id=>[id,{id,dataset:{},textContent:'',title:'',attributes:{},setAttribute(k,v){this.attributes[k]=v;}}]));
let periodic;
const window={};
vm.runInNewContext(script,{window,document:{getElementById:id=>nodes.get(id)},
  setInterval(fn,delay){assert.equal(delay,30000);periodic=fn;},
  fetch:async()=>({ok:true,json:async()=>({battery:{batteries:[]}})})});
const value=nodes.get('device-battery-value');
const root=nodes.get('device-battery');
assert.equal(value.textContent,'—','Unknown power must never display 0%');
assert.equal(window.OpenRFDeviceBattery.apply({battery:{batteries:[]}}),false);
assert.equal(value.textContent,'—');
assert.equal(window.OpenRFDeviceBattery.apply({battery:{batteries:[{name:'BAT0',capacity_percent:67,status:'Charging'}]}}),true);
assert.equal(value.textContent,'67%');
assert.equal(root.dataset.battery,'charging');
assert.equal(window.OpenRFDeviceBattery.apply({battery:{batteries:[{name:'BAT0',capacity_percent:0,status:'Discharging'}]}}),true);
assert.equal(value.textContent,'0%','A true kernel 0% is different from missing data');
assert.equal(root.dataset.battery,'critical');
assert.equal(window.OpenRFDeviceBattery.apply({battery:{batteries:[{name:'BAT0',capacity_percent:null}]}}),false);
assert.equal(value.textContent,'—');
assert.equal(window.OpenRFDeviceBattery.apply({battery:{batteries:[{},{}]}}),false);
assert.equal(value.textContent,'—','Do not merge unrelated battery capacities');
assert.equal(typeof periodic,'function');
console.log('PASS v0.2.149 battery unknown/real states, offline terrain UI and raster-warning gating');
