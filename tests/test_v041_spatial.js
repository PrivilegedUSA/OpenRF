'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const survey=require('../openrf/static/survey_map.js');
const history=require('../openrf/static/history-analysis.js');
const base={kind:'WIFI',source:'SENSOR',identifier:'00:11:22:33:44:55',source_device:'NetworkManager wlan2',hardware_id:'usb-adapter-a',frequency_mhz:2437,
  rssi_dbm:null,signal_quality_percent:57,latitude:38.43,longitude:-120.65,accuracy_m:9,
  observed_at:'2026-11-13T13:00:00Z',location_source:'BROWSER_REPORTED',session_id:4};
const record=(id,overrides={})=>({...base,id,...overrides});
const rows=[
  record(1),
  record(2,{latitude:38.435,longitude:-120.655,accuracy_m:12,signal_quality_percent:64,observed_at:'2026-11-13T13:15:00Z'}),
  record(3,{latitude:38.442,longitude:-120.66,accuracy_m:13,signal_quality_percent:44,observed_at:'2026-11-13T13:30:00Z',session_id:5}),
  record(4,{source_device:'Other receiver',signal_quality_percent:92}),
  record(5,{frequency_mhz:5180,signal_quality_percent:92}),
  record(6,{kind:'BLE',rssi_dbm:-55,signal_quality_percent:null}),
  record(7,{source:'DEMO',signal_quality_percent:90}),
  record(8,{latitude:null,longitude:null,signal_quality_percent:20}),
  record(9,{signal_quality_percent:null}),
  record(10,{source:'MANUAL',signal_quality_percent:90}),
];
const compatible=history.makeSeries(survey.visible(rows,{kinds:['WIFI']})).filter(group=>group.identifier===base.identifier && group.metric==='signal_quality_percent' && group.source_device===base.source_device && group.source==='SENSOR' && group.frequency_mhz===2437);
assert.equal(compatible.length,1);
const spatial=survey.spatialSeries(compatible[0]);
assert.equal(spatial.total,3);
assert.equal(spatial.reportedSites,3);
assert.deepEqual(spatial.samples.map(r=>r.id),[1,2,3]);
assert.equal(spatial.comparablePairs,2);
assert.equal(spatial.definiteSeparation,2);
assert.equal(spatial.metric,'signal_quality_percent');
assert.equal(spatial.samples[0].accuracy_m,9);
assert.equal(spatial.samples[1].session_id,4);
const plotted=survey.timeline(spatial.samples);
assert.equal(plotted.points.length,3);
assert(plotted.points[0].x<plotted.points[1].x);
assert(plotted.points[1].x<plotted.points[2].x);
assert.equal(plotted.high,64);
assert.equal(plotted.low,44);
assert.match(plotted.polyline,/^\d+\.\d+,\d+\.\d+/);
assert.equal(survey.spatialSeries(null).total,0);
assert.equal(survey.timeline([]),null);
assert.equal(survey.spatialSeries({rows:[record(1,{_value:60,_time:Date.parse(base.observed_at)})]}).reportedSites,1);
const many=Array.from({length:250},(_,id)=>({...record(id+100,{observed_at:new Date(Date.parse(base.observed_at)+id*1000).toISOString(),latitude:38.43+id/10000}),_value:40+id%20,_time:Date.parse(base.observed_at)+id*1000}));
const limited=survey.spatialSeries({rows:many},80);
assert.equal(limited.total,250);assert.equal(limited.samples.length,80);assert.equal(limited.truncated,true);
assert.equal(limited.samples[0].id,270);
const missing=survey.spatialSeries({rows:[record(1,{_value:50,accuracy_m:null}),record(2,{_value:60,longitude:-120.66,accuracy_m:80,observed_at:'2026-11-13T13:01:00Z'})]});
assert.equal(missing.comparablePairs,0);
// The app has no continuous GPS tracking or sensor reads from the map layer.
const moduleSrc=fs.readFileSync('openrf/static/survey_map.js','utf8');
const src=fs.readFileSync('openrf/static/app.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
assert(!moduleSrc.includes('getCurrentPosition(') && !moduleSrc.includes('fetch('));
for(const name of ['map-series-detail','map-survey-howto'])assert(html.includes(`id="${name}"`));
assert(html.includes('/static/survey_map.js?v=0.2.68'));
for(const marker of ['survey-series-data','survey-series-points','data-map-series','data-map-series-export','data-map-series-clear','data-map-series-fit','activeMapSpatialSurvey()'])assert(src.includes(marker),marker);
assert(src.includes('mapVisibleObservations()') && src.includes('makeSeries(mapVisibleObservations(),state.showDemo)'));
assert(!src.includes("id:'survey-series-line'"));
assert(css.includes('.raster-pin.survey-sample-highlight') && css.includes('.map-survey-plot'));
console.log('v0.2.42 multi-location saved signal observations, provenance, no fake tracks, chart, privacy and UI passed');
