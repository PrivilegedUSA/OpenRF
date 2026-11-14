/* OpenRF v0.2.52 offline bin aggregation, exact-match diff and provenance. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {averagedBins, analyzeSpectrum, compareSpectra, comparisonCsv} = require('../openrf/static/spectrum-analysis.js');
const {parseRtlPowerCsv, makeDemo} = require('../openrf/static/spectrum.js');
const root = path.resolve(__dirname, '../openrf/static');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'spectrum.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'spectrum-analysis.js'), 'utf8');
const curr = {
  kind: 'RTL_POWER_CSV_HISTORICAL', frames: [
    {stamp:'2026-11-11 11:00:00',bins:[{mhz:101.01,db:-88},{mhz:101.11,db:-70},{mhz:101.21,db:-90},{mhz:101.31,db:-89},{mhz:101.41,db:-89}]},
    {stamp:'2026-11-11 11:00:01',bins:[{mhz:101.01,db:-86},{mhz:101.11,db:-72},{mhz:101.21,db:-92},{mhz:101.31,db:-88},{mhz:101.41,db:-90}]},
  ]
};
const baseline = {kind:'RTL_POWER_CSV_HISTORICAL', frames: [
  {stamp:'2026-11-10 11:00:00',bins:[{mhz:101.01,db:-89},{mhz:101.11,db:-85},{mhz:101.21,db:-91},{mhz:101.31,db:-85},{mhz:101.41,db:-86}]},
]};
const range = {min:101,max:102};
const a = averagedBins(curr,range);
assert.equal(a.bins.length, 5);
assert.equal(a.sampleCount, 10);
assert.equal(a.frames, 2);
assert.equal(a.bins[1].hz, 101110000);
assert.equal(a.bins[1].db, -71);
const summary = analyzeSpectrum(curr,range);
assert.equal(summary.binCount,5);
assert.equal(summary.medianDb,-88.5);
assert.equal(summary.strongest[0].mhz,101.11,'strongest means highest (least negative), not largest absolute negative');
assert.equal(summary.strongest[0].samples,2);
const diff = compareSpectra(curr,baseline,range);
assert.equal(diff.matchedBins,5);
assert.equal(diff.overlapRatio,1);
assert.equal(diff.notable[0].mhz,101.11);
assert.equal(diff.notable[0].deltaDb,14);
assert.equal(diff.medianDeltaDb,0);
const csv = comparisonCsv(diff);
assert(csv.includes('NOT LIVE') && csv.includes('current_minus_baseline_db') && csv.includes('101.110000,-71.000,-85.000,14.000,2,1'));
assert(!csv.includes('2026-11-11') && !csv.includes('transmitter identified'));

// Never silently interpolate grids that are offset by a half-bin.
const shifted = {kind:'RTL_POWER_CSV_HISTORICAL',frames: [{stamp:'x',bins:baseline.frames[0].bins.map(b => ({mhz:b.mhz+0.05,db:b.db}))}]};
assert.throws(() => compareSpectra(curr,shifted,range),/do not align sufficiently/);
assert.throws(() => compareSpectra(curr,baseline,{min:400,max:500}),/no valid measured bins/);
assert.throws(() => compareSpectra(curr,baseline,{min:102,max:100}),/valid display/);
assert.throws(() => comparisonCsv(null),/Run a comparison/);
assert.throws(() => averagedBins(null,range),/Load a recorded/);
assert.throws(() => averagedBins(curr,{min:NaN,max:120}),/valid display/);
const partial = {kind:'RTL_POWER_CSV_HISTORICAL',frames:[{stamp:'x',bins:[{mhz:101.01,db:-89},{mhz:101.11,db:-85},{mhz:101.21,db:-91},{mhz:101.98,db:-90}]}]};
const partialDiff=compareSpectra(curr,partial,range);
assert.equal(partialDiff.matchedBins,3);
assert.equal(partialDiff.overlapRatio,0.75);
const invalid = {kind:'RTL_POWER_CSV_HISTORICAL',frames:[{stamp:'x',bins:[{mhz:101.01,db:NaN},{mhz:101.11,db:undefined},{mhz:101.21,db:-Infinity},{mhz:101.31,db:-90}]}]};
assert.equal(averagedBins(invalid,range).sampleCount,1);
const demo = makeDemo();
const fake = compareSpectra(demo,demo,{min:87,max:109});
assert.equal(fake.demo,true);
assert(comparisonCsv(fake).includes('SYNTHETIC DEMO INVOLVED'));
const realCsv = parseRtlPowerCsv('2026-11-10, 12:30:00, 101000000, 101500000, 100000, 1, -99, -78, -90, -95, -91');
assert.equal(analyzeSpectrum(realCsv,{min:100,max:102}).binCount,5);

for(const id of ['sdr-analysis-summary','sdr-analysis-bins','sdr-compare-details','sdr-baseline-saved','sdr-baseline-file','sdr-baseline-label','sdr-compare-run','sdr-compare-export','sdr-compare-clear','sdr-compare-status','sdr-compare-bins']) {
  assert(html.includes(`id="${id}"`),`missing ${id}`);
}
assert(html.includes('/static/spectrum-analysis.js?v=0.2.63'));
assert(html.indexOf('/static/spectrum-analysis.js')<html.indexOf('/static/spectrum.js'));
assert(ui.includes("global.OpenRFSpectrumAnalysis.compareSpectra"));
assert(ui.includes("global.OpenRFSpectrumAnalysis.comparisonCsv"));
assert(ui.includes("clearComparison('Frequency range changed"));
assert(ui.includes('clearComparison();') && ui.includes('renderAnalysis();'));
assert(ui.includes("const response = await fetch(`/api/sdr/captures/${chosenId}.csv`"));
assert(ui.includes("if (!/^[0-9a-f]{16}$/.test(chosenId))"));
assert(!ui.includes('innerHTML') && !core.includes('innerHTML'));
console.log('v0.2.52 spectrum aggregation, exact-bin comparison, CSV export and UI contracts passed');
