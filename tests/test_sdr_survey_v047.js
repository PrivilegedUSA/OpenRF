/* v0.2.52 source contracts: location is opt-in before sweep; no fake sensor coordinates. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const folder = path.resolve(__dirname, '../openrf/static');
const html = fs.readFileSync(path.join(folder,'index.html'),'utf8');
const spectrum = fs.readFileSync(path.join(folder,'spectrum.js'),'utf8');
const app = fs.readFileSync(path.join(folder,'app.js'),'utf8');
for (const id of ['sdr-attach-location','sdr-session','sdr-site-status','sdr-site-export',
                  'sdr-sites-show-map','sdr-sites-session-filter','sdr-sites-map-status','sdr-sites-map-export'])
  assert(html.includes(`id="${id}"`),`missing ${id}`);
assert(html.includes('id="sdr-attach-location"') && !html.includes('id="sdr-attach-location" checked'));
assert(!html.includes('id="sdr-sites-show-map" checked'));
assert(spectrum.includes('freshBrowserFix()'));
assert(spectrum.includes('maximumAge:0'));
assert(spectrum.indexOf('settings.survey_location = await freshBrowserFix();') < spectrum.indexOf("requestJSON('/api/sdr/capture/start'"));
assert(spectrum.includes('settings.session_id = Number(sessionId)'));
assert(spectrum.includes('Location permission denied.') && spectrum.includes('Browser location is stale or invalid'));
assert(spectrum.includes("doc.dispatchEvent(new Event('openrf:sdr-sites-changed'))"));
assert(app.includes("api('/api/sdr/survey/sites')"));
assert(app.includes('visibleSdrSites()') && app.includes('survey-sdr-sites'));
assert(app.includes('raster-sdr-site-pin') && app.includes('not verified receiver/antenna or transmitter'));
assert(app.includes('confirm(\'Export precise browser operator coordinates'));
assert(spectrum.includes('Sharing the GeoJSON can reveal your survey sites'));
assert(!spectrum.includes('innerHTML'), 'untrusted metadata must not be injected as HTML');
assert(html.includes('FIELD CONSOLE · 0.2.61'));
console.log('v0.2.52 SDR survey site opt-in, provenance, map and export frontend contracts passed');
