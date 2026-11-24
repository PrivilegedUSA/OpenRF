/* v189: responsive overlays, camera history actions, offline vectors and safe USB handoff. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('openrf/static/surveillance.js','utf8');
const css=fs.readFileSync('openrf/static/surveillance.css','utf8');
const markers=['surveillance-overlay-bottom','surveillance-overlay-zoom','data-feed-motion',
 'data-feed-record','data-feed-view','data-feed-snapshot','data-feed-history','data-feed-ptz-toggle'];
for (const marker of markers) assert(js.includes(marker),`missing ${marker}`);
assert.match(js,/const ICON_PATHS =/);
assert.match(js,/const cameraIcon = name =>/);
assert.match(js,/usbPreviewResume\.add\(camera\.id\)/);
assert.match(js,/stopView\(camera\.id\); \/\/ One V4L2 reader at a time/);
assert.match(js,/const actions = document\.createElement\('div'\); actions\.className='surveillance-recording-actions'/);
assert.match(js,/actionsLeft\.append\(scan\)/);
assert.match(js,/actionsRight\.append\(link\)/);
assert.match(js,/actionsRight\.append\(remove\)/);
assert.match(css,/surveillance-overlay-bottom\{inset:auto auto 10px 50%/);
assert.match(css,/surveillance-overlay-zoom\{position:absolute/);
assert.match(css,/\.surveillance-feed-media\{container-type:inline-size\}/);
assert.match(css,/surveillance-recording-actions-right\{margin-left:auto\}/);
assert.match(js,/if \(!confirm\('Permanently delete this local recording or snapshot\?'\)\) return;/);
console.log('PASS v189 Surveillance overlays and saved media action placement');
