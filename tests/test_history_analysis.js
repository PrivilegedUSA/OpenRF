'use strict';
const assert = require('node:assert/strict');
const analysis = require('../openrf/static/history-analysis.js');
const sample = (id, value, at, extra={}) => ({
  id, kind:'WIFI', identifier:'00:11:22:33:44:55', source:'SENSOR',
  source_device:'OpenRF USB',hardware_id:'board-1',frequency_mhz:2412,
  rssi_dbm:value,signal_quality_percent:null,observed_at:at,...extra
});
const rows = [
  sample(4,-50,'2026-11-08T12:00:00Z',{session_id:2,latitude:38.5,longitude:-120.5}),
  sample(1,-80,'2026-11-01T12:00:00Z',{session_id:1,latitude:38.4,longitude:-120.4}),
  sample(3,-60,'2026-11-07T12:00:00Z',{session_id:2,latitude:38.5,longitude:-120.5}),
  sample(2,-70,'2026-11-02T12:00:00Z',{session_id:1,latitude:38.4,longitude:-120.4}),
  sample(5,-20,'2026-11-08T12:00:00Z',{source:'DEMO'}),
  sample(6,-25,'2026-11-08T12:00:00Z',{source_device:'Another receiver'}),
  sample(7,-30,'2026-11-08T12:00:00Z',{hardware_id:'board-2'}),
  sample(8,-33,'2026-11-08T12:00:00Z',{frequency_mhz:2437}),
  sample(9,null,'2026-11-08T12:00:00Z',{signal_quality_percent:35}),
  sample(10,-70,'not a time'),
  sample(11,-66,'2026-11-08T12:00:00Z',{identifier:''}),
  sample(12,0,'2026-11-08T12:00:00Z',{kind:'MANUAL'}),
];
const live = analysis.makeSeries(rows);
assert.equal(live.length,5,'same identifier but different sensor, MHz or units must be separate');
const sensor = live.find(s=>s.source_device==='OpenRF USB' && s.hardware_id==='board-1' && s.frequency_mhz===2412 && s.metric==='rssi_dbm');
assert(sensor);
assert.deepEqual(sensor.rows.map(r=>r.id),[1,2,3,4]);
assert.equal(live.filter(s=>s.source==='DEMO').length,0,'demo is excluded by default');
assert.equal(analysis.makeSeries(rows,true).length,6,'demo must require explicit opt-in');
const q = live.find(s=>s.metric==='signal_quality_percent');
assert.equal(q.unit,'%');
assert.equal(q.rows.length,1);
assert.equal(analysis.compare(q,{mode:'time'}).error.includes('At least two'),true);
assert.equal(analysis.median([4,2,1,3]),2.5);
assert.equal(analysis.median([]),null);
const c = analysis.compare(sensor,{mode:'time'});
assert.equal(c.baseline.count,2);
assert.equal(c.followup.count,2);
assert.equal(c.baseline.median,-75);
assert.equal(c.followup.median,-55);
assert.equal(c.delta,20);
assert(c.warnings.some(w=>w.includes('different observer locations')),'location differences must be disclosed');
assert(c.warnings.some(w=>w.includes('Descriptive comparison')),'comparison is not an RF position estimate');
const bySessions = analysis.compare(sensor,{mode:'sessions',beforeSession:'1',afterSession:'2'});
assert.equal(bySessions.delta,20);
assert.deepEqual(bySessions.before.map(r=>r.id),[1,2]);
assert.deepEqual(bySessions.after.map(r=>r.id),[3,4]);
assert(analysis.compare(sensor,{mode:'sessions',beforeSession:'1',afterSession:'1'}).error);
assert(analysis.compare(sensor,{mode:'sessions',beforeSession:'10',afterSession:'2'}).error);
const zero = analysis.makeSeries([sample(50,0,'2026-11-08T12:00:00Z')])[0];
assert.equal(zero.rows[0]._value,0,'zero is valid, not missing');
const corrupted = analysis.makeSeries([{...sample(1,Number.NaN,'2026-11-08T12:00:00Z'),rssi_dbm:NaN}]);
assert.equal(corrupted.length,0,'nonfinite values excluded');
const demo = analysis.makeSeries([sample(44,-77,'2026-11-01T12:00:00Z',{source:'DEMO'}), sample(45,-77,'2026-11-02T12:00:00Z',{source:'DEMO'})],true)[0];
assert(analysis.compare(demo).warnings.some(w=>w.includes('SYNTHETIC DEMO')));
console.log('v0.2.17 historical comparison grouping, source/unit/device/frequency separation, demo opt-in and statistics passed.');
