'use strict';
// v187: compact previews, record emphasis, per-camera history, digital crop and bounded device PTZ.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('openrf/static/surveillance.js','utf8');
const css=fs.readFileSync('openrf/static/surveillance.css','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
for(const selector of ['surveillance-recordings-camera','surveillance-events-camera']) {
  assert(html.includes(`id="${selector}"`));
  assert(ui.includes(`'${selector}'`));
}
for(const control of ['data-feed-record','data-feed-rec-badge','data-feed-fullscreen','data-feed-history',
                      'data-feed-zoom-in','data-feed-zoom-out','data-feed-zoom-reset','data-feed-device-ptz','data-feed-ptz-axis']){
  assert(ui.includes(control),`Missing ${control}`);
}
assert.match(css,/surveillance-live-grid\.has-multiple\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css,/\.surveillance-rec-button\{background:#a92233/);
assert.match(ui,/function applyCrop\(/);
assert.match(ui,/function zoomCrop\(/);
assert.match(ui,/pointermove/);
assert.match(ui,/function readDevicePTZ\(/);
assert.match(ui,/function updateCameraFilters\(/);
assert.match(ui,/selectTab\('recordings'\)/);
assert.match(ui,/if \(!overviewVisible\(\) \|\| autoPreviewInitialized\) return;/);
assert.match(ui,/if \(live.size >= MAX_LIVE\)/);
assert.match(ui,/const MAX_LIVE = 2/);
console.log('Surveillance v187 compact grid, record, per-camera history, local digital zoom, optional V4L2 controls passed');
