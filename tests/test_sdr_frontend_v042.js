const assert = require('node:assert/strict');
const fs = require('node:fs');
const {parseRtlPowerCsv, makeDemo, visibleBins, bounds, MAX_BYTES} = require('../openrf/static/spectrum.js');
const html = fs.readFileSync(require('path').join(__dirname, '../openrf/static/index.html'), 'utf8');
const js = fs.readFileSync(require('path').join(__dirname, '../openrf/static/spectrum.js'), 'utf8');
const app = fs.readFileSync(require('path').join(__dirname, '../openrf/static/app.js'), 'utf8');

const real = parseRtlPowerCsv([
 '2026-11-12, 17:00:00, 88000000, 88400000, 100000, 1, -92.0, -73.5, -80, -99',
 '2026-11-12, 17:00:00, 88400000, 88800000, 100000, 1, -93, -89, -70, -84',
 '2026-11-12, 17:00:10, 88000000, 88400000, 100000, 1, -91, -72, -81, -98',
 'bad,row',
].join('\n'));
assert.equal(real.frames.length, 2);
assert.equal(real.frames[0].bins.length, 8);
assert.equal(real.frames[1].bins.length, 4);
assert.equal(real.acceptedRows, 3);
assert.equal(real.rejectedRows, 1);
assert.equal(real.kind, 'RTL_POWER_CSV_HISTORICAL');
assert.equal(real.calibrated, false);
assert.equal(real.timestampTimezoneVerified, false);
assert.equal(real.stored, false);
assert.equal(visibleBins(real.frames[0], 88, 88.4).length, 4);
assert(bounds(real).max > 88.7);

// A blank bin must not silently become 0 dB; calendar and FFT edges validated.
for (const entry of [
 '2026-11-12, 17:00:00, 88000000, 88200000, 100000, 1, -100, ',
 '2026-02-30, 17:00:00, 88000000, 88200000, 100000, 1, -100, -90',
 '2026-11-12, 28:00:00, 88000000, 88200000, 100000, 1, -100, -90',
 '2026-11-12, 17:00:00, 88000000, 88200000, 0, 1, -100, -90',
 '2026-11-12, 17:00:00, 88000000, 88200000, 100000, 1, NaN, -90',
 '2026-11-12, 17:00:00, 88000000, 88200000, 100000, 1, -100, Infinity',
]) assert.throws(() => parseRtlPowerCsv(entry), /No valid/);
assert.throws(() => parseRtlPowerCsv('A'.repeat(MAX_BYTES + 1)), /2 MB/);
assert.throws(() => parseRtlPowerCsv(''), /non-empty/);
assert.throws(() => parseRtlPowerCsv('2026-11-12, 17:00:00, 88000000, 88200000, 100000, 1, -100, -90\n'.repeat(3001)), /Too many/);

const demo = makeDemo();
assert.equal(demo.kind, 'SYNTHETIC_DEMO_NOT_LIVE');
assert.equal(demo.frames.length, 52);
assert.equal(demo.frames[0].bins.length, 192);
assert.equal(demo.stored, false);
assert(demo.frames[0].bins.some(b => b.db > -75));
assert(html.includes('data-page="spectrum"') && html.includes('id="sdr-local-file"') && html.includes('id="sdr-demo"'));
assert(html.includes('id="sdr-spectrum"') && html.includes('id="sdr-waterfall"') && html.includes('id="sdr-frame-slider"'));
assert(html.includes('id="sdr-clear"') && html.includes('/static/spectrum.js?v=0.2.58'));
assert(app.includes("document.dispatchEvent(new Event('openrf:spectrum-shown'))"));
assert(js.includes('await file.text()') && !js.includes("fetch('/api/sdr/upload") && !js.includes('localStorage'));
assert(js.includes('not calibrated dBm') || html.includes('not calibrated dBm'));
console.log('v0.2.42 browser-local SDR CSV, provenance, DEMO and spectrum UI tests passed');
