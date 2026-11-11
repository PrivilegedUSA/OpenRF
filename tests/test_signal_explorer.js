'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const history = require('../openrf/static/history-analysis.js');
const sample = (id, value, observedAt, extra={})=>({
  id,kind:'WIFI',identifier:'aa:bb:cc',source:'SENSOR',source_device:'RF board',hardware_id:'board-55',
  frequency_mhz:2412,observed_at:observedAt,rssi_dbm:value,signal_quality_percent:null,
  latitude:38.48,longitude:-120.51,accuracy_m:8,notes:'private note',...extra
});
const base='2026-07-01T01:00:00Z';
const rows=[sample(1,-81,'2026-06-20T00:00:00Z'),sample(2,-55,'2026-06-30T12:00:00Z'),sample(3,-60,base),
  sample(4,-20,base,{frequency_mhz:2437}),sample(5,77,base,{rssi_dbm:null,signal_quality_percent:77}),
  sample(6,-12,base,{source:'DEMO'}),sample(7,-30,base,{hardware_id:'another'}),sample(8,-33,base,{source_device:'Other receiver'})];
const grouped=history.makeSeries(rows);
const series=grouped.find(s=>s.metric==='rssi_dbm' && s.hardware_id==='board-55' && s.source_device==='RF board' && s.frequency_mhz===2412);
assert.deepEqual(series.rows.map(r=>r.id),[1,2,3]);
assert(!grouped.some(s=>s.source==='DEMO'));
const all=history.history(series,'all');
assert.equal(all.stats.count,3);
assert.equal(all.stats.median,-60);
assert.equal(all.stats.min,-81);
assert.equal(all.stats.max,-55);
assert.equal(all.skipped,0);
assert.equal(all.drawn,3);
const day=history.history(series,'day');
assert.deepEqual(day.rows.map(r=>r.id),[2,3], 'window anchored to latest saved sample, not now');
assert.equal(day.skipped,1);
const week=history.history(series,'week');
assert.deepEqual(week.rows.map(r=>r.id),[2,3]);
const month=history.history(series,'month');
assert.equal(month.rows.length,3);
assert.equal(history.history(series,'nonsense').period,'all');
assert(all.warnings.some(w=>w.includes('cannot reliably determine transmitter')));
const synthetic=history.makeSeries(rows,true).find(s=>s.source==='DEMO');
assert(history.history(synthetic).warnings.some(w=>w.includes('SYNTHETIC DEMO')));
const qual=grouped.find(s=>s.metric==='signal_quality_percent');
assert.equal(qual.unit,'%');
assert(history.history(qual).warnings.some(w=>w.includes('not RSSI dBm')));
const repeated=history.makeSeries([sample(20,-40,base),sample(21,-60,base)])[0];
assert.equal(history.history(repeated).stats.median,-50, 'duplicate timestamps handled');
assert.equal(history.history(null).rows.length,0);
assert.equal(history.historyCsv(null,all),null);
// Hundreds of samples should not force hundreds of SVG points while excluding outliers.
const many=Array.from({length:1000},(_,i)=>sample(i+100,i===589?12:(i===292?-123:-70+(i%10)),
  new Date(Date.UTC(2026,6,1)+i*60000).toISOString()));
const highDensity=history.history(history.makeSeries(many)[0], 'all', 90);
assert(highDensity.plot.length<=90,'plot point cap');
assert(highDensity.plot.some(r=>r._value===12),'peak retained');
assert(highDensity.plot.some(r=>r._value===-123),'dip retained');
assert.equal(highDensity.rows.length,1000,'no records dropped from calculations or export');
assert.equal(highDensity.plot[0].id,100);
assert.equal(highDensity.plot.at(-1).id,1099);
const csv=history.historyCsv(series,day);
assert(csv.startsWith('\uFEFF'));
assert(!csv.split('\r\n')[0].includes('latitude'), 'precise coordinates opt-out');
assert(!csv.includes('38.48') && !csv.includes('-120.51'), 'no GPS leak without opt-in');
assert(!csv.includes('private note'), 'unrelated private notes excluded');
assert(csv.includes('rssi_dbm') && csv.includes('dBm') && csv.includes('board-55'));
assert.equal(csv.trim().split('\r\n').length,3, 'only selected window exported');
const withLocation=history.historyCsv(series,day,true);
assert(withLocation.includes('latitude,longitude,accuracy_m'));
assert(withLocation.includes('38.48') && withLocation.includes('-120.51'));
const attack=history.makeSeries([sample(55,-60,base,{source_device:'=HYPERLINK("evil")'})])[0];
const safe=history.historyCsv(attack,history.history(attack));
assert(safe.includes("'=HYPERLINK"),'CSV formulas neutralized');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for (const id of ['history-window','history-include-demo','history-summary','history-records','history-export-coordinates','history-export']) {
  assert(html.includes(`id="${id}"`),`history control ${id}`);
}
assert(html.includes('id="history-export-coordinates" type="checkbox"'), 'private GPS export opt-in, off by default');
assert(!html.includes('id="history-export-coordinates" type="checkbox" checked'), 'GPS opt-in must not be pre-checked');
assert(app.includes("$('history-export').addEventListener('click',exportHistoryCsv)"), 'export event wired');
assert(app.includes("$('history-window').addEventListener('change',drawHistory)"), 'window event wired');
assert(app.includes('engine.makeSeries(state.observations'), 'history uses compatible series grouping');
assert(!app.includes("const unit = rssi.length ? 'dBm'"), 'old mixed-identifier graph removed');
assert(css.includes('.history-summary-grid') && css.includes('@media(max-width:620px)'), 'touch layout');
console.log('v0.2.19 history exploration, dense-data peak preservation, time windows, DEMO/privacy and CSV safety passed.');
