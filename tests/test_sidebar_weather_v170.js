'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const nav=html.split('<nav class="nav">')[1]?.split('</nav>')[0];
assert(nav,'Main sidebar nav must be present');
const order=[
  'data-page="overview"','id="messages-nav-toggle"','data-page="map"',
  'data-page="emergency"','data-page="scanner"','data-page="spectrum"',
  'data-page="radio"','data-page="hamradio"','data-page="sessions"',
  'data-page="hardware"','data-page="browser"','data-page="weather"',
  'data-page="trips"','data-page="discoveries"',
];
const positions=order.map(needle=>nav.indexOf(needle));
assert(positions.every(position=>position>=0),'Every requested sidebar entry must exist');
assert(positions.every((position,i)=>i===0||position>positions[i-1]),'Sidebar order must match user selection');
assert.equal((nav.match(/id="messages-nav-toggle"/g)||[]).length,1);
for (const protocol of ['Meshtastic','Reticulum','MeshCore']){
  assert(nav.includes(`<span class="nav-label">${protocol}</span>`));
}
assert(nav.includes('data-page="map"')&&nav.includes('nav-btn active'),'Keep existing initial Map page active');
for (const size of [32,180,192,512]){
  const data=fs.readFileSync(`openrf/static/assets/openrf-icon-${size}.png`);
  assert.equal(data.subarray(1,4).toString(),'PNG','All icon variants must be PNG');
  assert.equal(data.readUInt32BE(16),size);
  assert.equal(data.readUInt32BE(20),size);
}
assert(html.includes('/static/assets/openrf-icon-32.png'));
console.log('PASS v0.2.170 sidebar order, Messages subnavigation, icon image sizes');
