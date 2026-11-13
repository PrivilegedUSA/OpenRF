/* v0.2.47 source-contract checks: opt-in capture, provenance and safe rendering. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'../openrf/static');
const html = fs.readFileSync(path.join(root, 'index.html'),'utf8');
const js = fs.readFileSync(path.join(root,'spectrum.js'),'utf8');
for (const name of ['sdr-capture-low','sdr-capture-high','sdr-capture-step','sdr-capture-duration',
  'sdr-capture-start','sdr-capture-stop','sdr-capture-refresh','sdr-capture-status',
  'sdr-saved-captures','sdr-saved-open','sdr-saved-download','sdr-saved-delete']) {
  assert(html.includes(`id="${name}"`), `missing UI element ${name}`);
}
assert(html.includes('id="sdr-capture-start" type="button" class="btn primary" disabled'));
assert(js.includes("requestJSON('/api/sdr/capture/start'"));
assert(js.includes("requestJSON('/api/sdr/capture/stop'"));
assert(js.includes("requestJSON('/api/sdr/captures'"));
assert(js.includes('RECORDED RTL-SDR CSV') && js.includes('SYNTHETIC DEMO · NOT LIVE'));
assert(js.includes("link.hidden = !completed"));
assert(js.includes("item.state") && js.includes('Capture stopped by user') === false);
assert(!js.includes('innerHTML'), 'no server string insertion via innerHTML');
assert(js.includes("const valid = /^[0-9a-f]{16}$/.test(id)"));
assert(html.includes('0.2.47'));
console.log('v0.2.47 capture control, saved CSV and DEMO provenance source tests passed');
