'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const survey=require('../openrf/static/survey_map.js');
const history=require('../openrf/static/history-analysis.js');
const sample=(id,overrides={})=>({id,kind:'WIFI',source:'SENSOR',identifier:'aa:bb:cc',label:'Lab network',
  observed_at:'2026-11-12T17:00:00Z',latitude:38.4,longitude:-120.6,source_device:'Linux NetworkManager / wlan1',
  hardware_id:null,frequency_mhz:2437,rssi_dbm:null,signal_quality_percent:null,...overrides});
const now=Date.parse('2026-11-12T18:00:00Z');
// Filter by REAL saved observer coordinates and user-selected kinds. No automatic scans.
assert.deepEqual(survey.visible([sample(1),sample(2,{latitude:null}),sample(3,{latitude:'NaN'}),sample(4,{longitude:181})],{kinds:['WIFI']},now).map(x=>x.id),[1]);
assert.equal(survey.visible([sample(1,{source:'DEMO'})],{kinds:['WIFI']},now).length,0);
assert.equal(survey.visible([sample(1,{source:'DEMO'})],{kinds:['WIFI'],includeDemo:true},now).length,1);
assert.equal(survey.visible([sample(1,{kind:'BLE'})],{kinds:['WIFI']},now).length,0);
assert.equal(survey.visible([sample(1,{observed_at:'2026-11-12T19:00:00Z'})],{window:'day'},now).length,0);
assert.equal(survey.visible([sample(1,{observed_at:'2026-11-10T00:00:00Z'})],{window:'day'},now).length,0);
assert.equal(survey.visible([sample(1,{observed_at:'2026-11-10T00:00:00Z'})],{window:'week'},now).length,1);
assert.equal(survey.visible([sample(1,{observed_at:'invalid'})],{window:'week'},now).length,0);
assert.equal(survey.visible([sample(1,{observed_at:'invalid'})],{window:'all'},now).length,1);
// RSSI and quality are NEVER mixed or converted. Missing values are muted.
assert.equal(survey.display(sample(1,{rssi_dbm:-48}),'rssi').category,'high');
assert.equal(survey.display(sample(1,{rssi_dbm:-77}),'rssi').category,'medium');
assert.equal(survey.display(sample(1,{rssi_dbm:-95}),'rssi').category,'low');
assert.equal(survey.display(sample(1,{signal_quality_percent:95}),'rssi').category,'unavailable');
assert.equal(survey.display(sample(1,{signal_quality_percent:85}),'quality').category,'high');
assert.equal(survey.display(sample(1,{signal_quality_percent:52}),'quality').category,'medium');
assert.equal(survey.display(sample(1,{signal_quality_percent:20}),'quality').category,'low');
assert.equal(survey.display(sample(1,{signal_quality_percent:20,kind:'BLE'}),'quality').category,'unavailable');
assert.equal(survey.display(sample(1,{source:'DEMO',rssi_dbm:-23}),'rssi').category,'demo');
// Strict identity from the pre-existing historic comparison engine is retained.
const set=[sample(1,{rssi_dbm:-80}),sample(2,{rssi_dbm:-60,observed_at:'2026-11-12T17:10:00Z'}),
  sample(3,{rssi_dbm:-20,source_device:'Other receiver'}),sample(4,{rssi_dbm:-30,frequency_mhz:5180}),
  sample(5,{signal_quality_percent:90})];
const groups=survey.seriesForRecord(set,set[0],history);
assert.equal(groups.length,1);
assert.equal(groups[0].rows.length,2);
assert.equal(groups[0].metric,'rssi_dbm');
const result=survey.historySummary(groups[0],history);
assert.equal(result.history.stats.count,2);
assert.equal(result.history.stats.median,-70);
assert.equal(result.comparison.delta,20);
assert.equal(survey.seriesForRecord(set,set[4],history)[0].metric,'signal_quality_percent');
assert.equal(survey.seriesForRecord(set,set[0],history,false).some(s=>s.rows.some(r=>r.source==='DEMO')),false);
assert.equal(survey.recent([sample(1),sample(2,{observed_at:'2026-11-12T18:00:00Z'}),sample(3,{kind:'MANUAL'})])[0].id,2);
const html=fs.readFileSync('openrf/static/index.html','utf8');
const src=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['map-metric-mode','map-survey-age','map-wireless-recent','map-observation-detail','map-scan-ble','map-ble-readings']) assert(html.includes(`id="${id}"`),id);
assert(html.includes('/static/survey_map.js?v=0.2.40'));
assert(src.includes('renderMapObservationDetail()')&&src.includes('state.map.getSource(\'survey-data\').setData'));
assert(src.includes('marker_color:markerAppearance(o).color')&&src.includes('selectMapObservation(o.id)'));
assert(src.includes("$('map-scan-ble').addEventListener('click', scanBleOnce)"));
assert(src.includes('NOT MAPPED')&&src.includes('No temporary Bluetooth LE retrieval')); 
assert(css.includes('.map-observation-detail')&&css.includes('.map-metric-controls'));
console.log('v0.2.40 observer map, segregated RSSI/quality, DEMO exclusion, strict history, BLE UI regression passed');
