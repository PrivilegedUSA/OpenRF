'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const source=fs.readFileSync('openrf/static/route-elevation.js','utf8');

for(const id of ['area-topo-start','area-topo-cancel','area-topo-name','area-topo-confirm',
  'area-topo-status','map-route-elevation','map-elevation-cached','map-elevation-prepare',
  'map-route-elevation-chart','map-elevation-status']){
  assert(html.includes(`id="${id}"`),`Missing ${id}`);
}
assert(html.includes('/static/route-elevation.js?v=0.2.144'));
assert(app.includes("api('/api/maps/topographic/start','POST'"));
assert(app.includes('candidate_tiles>96'));
assert(app.includes("api('/api/maps/topographic/cancel','POST'"));
assert(app.includes("api('/api/navigation/elevation-profile','POST'"));
assert(app.includes('confirm(') && app.includes('USGS'), 'Elevation and tile requests need explicit consent');
assert(css.includes('body.map-workspace .topbar .menu-toggle{display:none!important}'));
assert(css.includes('(min-width:901px) and (pointer:fine)'),
  '1280x800 mouse layout has an open sidebar: map hamburger must be hidden');
assert(css.includes('min-height:44px;max-height:44px'), 'Altitude card should match 44px clock height');
assert(!html.includes('map-altimeter-detail'), 'No third line on altitude badge');

const win={};
vm.runInNewContext(source,{window:win});
const util=win.OpenRFRouteElevation;
assert(util?.sample && util?.draw);
assert.equal(util.sample([[0,0],[0,0]]),null);
assert.equal(util.sample([[181,0],[1,1]]),null);
const coordinates=[[-120,38],[-119.99,38],[-119.99,38.01]];
const sampled=util.sample(coordinates);
assert.equal(sampled.length,13);
assert.deepEqual(Array.from(sampled[0]),coordinates[0]);
assert.deepEqual(Array.from(sampled.at(-1)),coordinates.at(-1));
assert(sampled[6][0]>-120 && sampled[6][0]<=-119.99);
const repeat=util.sample(coordinates);
assert.deepEqual(JSON.stringify(sampled),JSON.stringify(repeat));
console.log('PASS v0.2.144 topo download controls, route sampling, compact altitude and open-sidebar hamburger');
