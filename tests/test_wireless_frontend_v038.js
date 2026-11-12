'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root=path.join(__dirname,'../openrf/static');
const js=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'app.css'),'utf8');
assert(html.includes('id="wifi-results-band"') && html.includes('id="wifi-results-search"'));
assert(html.includes('id="map-navigation-options"') && html.includes('id="map-settings-close"'));
assert(html.includes('class="map-settings-popup"') && html.includes('aria-label="Close address search settings"'));
assert.match(css, /#page-map \.map-navigation-settings\[open\][\s\S]*?right:90px;left:auto;bottom:9px/);
assert(css.includes('right:-82px;bottom:43px'), 'popup above fixed gear');
assert(js.includes("$('map-settings-close').addEventListener('click'"));
assert(js.includes("$('map-navigation-options').open=false;"));
const begin=js.indexOf('function wifiBandLabel(');
const end=js.indexOf('function renderWifiScan()',begin);
assert(begin>0 && end>begin);
const {wifiBandLabel,filteredWifiRecords}=Function(js.slice(begin,end)+';return {wifiBandLabel,filteredWifiRecords};')();
const scan={records:[
  {ssid:'Cafe',bssid:'AA:BB:CC:DD:EE:00',signal_quality_percent:67,frequency_mhz:2437},
  {ssid:'Campus',bssid:'AA:BB:CC:DD:EE:01',signal_quality_percent:83,frequency_mhz:5180},
  {ssid:'6E Network',bssid:'AA:BB:CC:DD:EE:02',signal_quality_percent:45,frequency_mhz:5975}
]};
assert.equal(wifiBandLabel(scan.records[0]), '2.4 GHz');
assert.deepEqual(filteredWifiRecords(scan,'5 GHz','').map(x=>x.ssid),['Campus']);
assert.deepEqual(filteredWifiRecords(scan,'all','ca').map(x=>x.ssid),['Campus','Cafe']);
assert.equal(filteredWifiRecords(scan,'other','').length,0);
assert.deepEqual(filteredWifiRecords(scan,'all','').map(x=>x.ssid),['Campus','Cafe','6E Network']);
assert(js.includes('Quality % is NOT RSSI/dBm') && js.includes('AP RATE is advertised'));
console.log('v0.2.38 Wi-Fi band/search, provenance and persistent settings gear/X contracts passed');
